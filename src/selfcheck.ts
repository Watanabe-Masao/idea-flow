// 自己チェック：どの AI がこのコネクタで作業しても、出す前（下書き）と出したあと（番号）に、
// 書き方の決まりを守れているかを自分で確かめられるようにする。判断はせず、✓／✗ と直し方だけを返す。
import type { Env } from './types.ts';
import { gh } from './gh.ts';
import { catalogOf, featuresOfFiles, linkIssue, parseReport, refLines, type Catalog } from './workmap.ts';

/** 書き方の決まり（CLAUDE.md・docs/operation.md と同じ中身。CLAUDE.md を読まない AI にも渡すため） */
export const WRITING_RULES = `書き方の決まり（地図を働かせるため）
1. 作業の前に：map → feature → issue を読み、どの機能・どの Issue の作業かを決める。決められなければ人に聞く。
2. PR の題：「機能名：何をしたか」。機能名は下の一覧の名前か別名。
3. PR の説明：関係する Issue を「Closes #n」（この PR で閉じる）か「関連 #n」で書く。無ければ「関連：なし」。
4. PR の説明の最後に、申告の3つの見出しをこの名前のまま：「## 確かめた決まり」「## 決まりになく、自分で判断した所」「## 足りなかった決まり」（無いときは「- なし」）。
5. Issue の題：「機能名：何をするか」。本文の最初に「機能：〇〇」「閉じる条件：〇〇」を1行ずつ。
6. やり残しは新しい Issue にせず、その機能の「残り」の Issue に足す。分けるときは「#n の続き」。
7. 新しい機能を作ったら、idea-flow の src/catalogs.ts に足す（同じ PR でよい）。
8. 出す前に check（下書き）、出したあとに check（番号）で自己チェックし、✗ を直す。
9. その日の最初の作業の前に review（毎日の見直し）を読み、自分の書き方の足りないものは直す。人に決めてもらうものは案を添えて伝える。
10. マージのあと、本番に出たかを確かめる。決めるのは人。人の OK なしに閉じたり消したりしない。`;

type Item = { ok: boolean | null; what: string; fix?: string };
const show = (xs: Item[]) => xs.map(x => `${x.ok === true ? '✓' : x.ok === false ? '✗' : '・'} ${x.what}${x.ok === false && x.fix ? `\n    直し方：${x.fix}` : ''}`).join('\n');

function featureOfTitle(cat: Catalog, title: string) {
  const head = title.split(/[：:]/)[0].trim();
  if (head === title.trim()) return { head: null, f: null };
  const f = cat.features.find(x => x.name === head || x.name.replace(/（.*）/, '') === head || x.aliases.includes(head) || x.aliases.some(a => a && head.startsWith(a)));
  return { head, f: f ?? null };
}
const names = (cat: Catalog) => cat.features.map(f => `${f.name.replace(/（.*）/, '')}${f.aliases.length ? `（別名：${f.aliases.slice(0, 3).join('・')}）` : ''}`).join('、');

/** PR の下書き（または出した PR）を確かめる */
export function checkPr(cat: Catalog, pr: { title: string; body: string; files: string[] }, issues: Map<number, { open: boolean; title: string }>) {
  const out: Item[] = [];
  const { head, f } = featureOfTitle(cat, pr.title);
  out.push({ ok: !!f, what: `題の頭が機能名${f ? `（${f.name}）` : head ? `（「${head}」は一覧に無い）` : '（「機能名：」が無い）'}`, fix: `題を「機能名：何をしたか」に。使える機能名：${names(cat)}` });
  if (pr.files.length) {
    const fs = featuresOfFiles(cat, pr.files);
    const nm = fs.map(id => cat.features.find(x => x.id === id)!.name).join('、');
    out.push({ ok: fs.length > 0, what: `変えたファイルが一覧の機能に当たる${fs.length ? `（${nm}）` : ''}`, fix: `当たらないファイル（${pr.files.slice(0, 4).join('、')}）の機能を src/catalogs.ts に足すか、人に聞く` });
    if (f && fs.length) out.push({ ok: fs.includes(f.id) || !!f.fallback, what: `題の機能と、変えたファイルの機能が合う`, fix: `題の機能（${f.name}）と、ファイルの機能（${nm}）がずれている。題を直すか、作業を分ける` });
  } else out.push({ ok: null, what: '変えたファイル：渡されていないので確かめない（files を渡すと確かめる）' });
  const refs = refLines(`${pr.title}\n${pr.body}`).map(r => r.n);
  const none = /関連\s*[:：]\s*なし/.test(pr.body);
  const known = refs.filter(n => issues.has(n));
  out.push({ ok: known.length > 0 || none, what: `関係する Issue を書いている${known.length ? `（${known.map(n => '#' + n).join(' ')}）` : none ? '（関連：なし）' : ''}`, fix: '説明に「Closes #n」か「関連 #n」。無ければ「関連：なし」' });
  for (const n of refs.filter(n => !issues.has(n))) out.push({ ok: null, what: `#${n} は Issue として見つからない（PR の番号か、まだ読み込んでいない）` });
  for (const m of pr.body.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
    const i = issues.get(Number(m[1]));
    if (i && !i.open) out.push({ ok: false, what: `Closes #${m[1]} は、もう閉じている Issue`, fix: '「関連 #n」にするか、正しい番号に' });
  }
  const rep = parseReport(pr.body);
  out.push({ ok: !!rep, what: '申告の3つの見出し（確かめた決まり／決まりになく、自分で判断した所／足りなかった決まり）', fix: '説明の最後に「## 確かめた決まり」「## 決まりになく、自分で判断した所」「## 足りなかった決まり」。無いときは「- なし」' });
  return out;
}

/** Issue の下書き（または立てた Issue）を確かめる */
export function checkIssue(cat: Catalog, is: { number?: number; title: string; body: string }, open: { number: number; title: string; features: string[] }[]) {
  const out: Item[] = [];
  const { head, f } = featureOfTitle(cat, is.title);
  out.push({ ok: !!f, what: `題の頭が機能名${f ? `（${f.name}）` : head ? `（「${head}」は一覧に無い）` : ''}`, fix: `題を「機能名：何をするか」に。使える機能名：${names(cat)}` });
  const fl = is.body.match(/^\s*(?:[-*]\s*)?\**機能\**\s*[:：]\s*(.*)$/m);
  const fv = fl?.[1].trim() ?? '';
  const fOk = !!fv && cat.features.some(x => fv.split(/[、,，\/・\s]+/).some(w => w === x.name || w === x.name.replace(/（.*）/, '') || x.aliases.includes(w) || w === x.id));
  out.push({ ok: fOk, what: `本文に「機能：」${fv ? `（${fv}）` : ''}`, fix: fl ? `「機能：」の中身が一覧の名前と合わない。使える機能名：${names(cat)}` : '本文の最初に「機能：〇〇」' });
  const cl = is.body.match(/閉じる条件\s*[:：]\s*(.*)$/m);
  out.push({ ok: !!cl && cl[1].trim().length >= 4, what: `本文に「閉じる条件：」${cl?.[1].trim() ? `（${cl[1].trim().slice(0, 40)}）` : ''}`, fix: '「閉じる条件：〇〇」を1行で（これができたら閉じる、と分かる文に）' });
  if (f) {
    const same = open.filter(o => o.number !== is.number && o.features.includes(f.id));
    if (same.length) out.push({ ok: null, what: `同じ機能の開いた Issue がある：${same.slice(0, 4).map(o => `#${o.number} ${o.title}`).join('／')}。やり残しなら、新しく立てずにそちらに足す（決まり6）` });
  }
  return out;
}

/** コネクタの check：pr か issue の番号（出したあと）、または title・body・files（出す前の下書き） */
export async function selfCheck(env: Env, repo: string, a: Record<string, unknown>) {
  const cat = catalogOf(repo);
  if (!cat) throw new Error(`${repo} には機能の一覧（カタログ）がありません`);
  const rows = (await env.DB.prepare('SELECT number, open, title, body FROM map_issues WHERE repo = ?').bind(repo).all<{ number: number; open: number; title: string; body: string }>()).results;
  const issues = new Map(rows.map(r => [r.number, { open: !!r.open, title: r.title }]));
  const kind = a.pr != null ? 'pr' : a.issue != null ? 'issue' : String(a.kind ?? (a.files ? 'pr' : ''));
  let head = '', items: Item[];
  if (kind === 'pr') {
    let pr = { title: String(a.title ?? ''), body: String(a.body ?? ''), files: Array.isArray(a.files) ? (a.files as unknown[]).map(String) : [] };
    if (a.pr != null) {
      const n = Number(String(a.pr).replace('#', ''));
      const p = await gh<{ title: string; body: string | null; state: string; merged_at: string | null }>(env, `/repos/${repo}/pulls/${n}`);
      const fs = await gh<{ filename: string }[]>(env, `/repos/${repo}/pulls/${n}/files?per_page=100`);
      pr = { title: p.title, body: p.body ?? '', files: fs.map(x => x.filename) };
      head = `PR #${n}「${p.title}」（${p.merged_at ? 'マージ済み' : p.state === 'open' ? '開いている' : '閉じた'}）`;
    } else head = `PR の下書き「${pr.title}」`;
    items = checkPr(cat, pr, issues);
  } else if (kind === 'issue') {
    let is: { number?: number; title: string; body: string } = { title: String(a.title ?? ''), body: String(a.body ?? '') };
    if (a.issue != null) {
      const n = Number(String(a.issue).replace('#', ''));
      const i = await gh<{ number: number; title: string; body: string | null; state: string }>(env, `/repos/${repo}/issues/${n}`);
      is = { number: n, title: i.title, body: i.body ?? '' };
      head = `Issue #${n}「${i.title}」（${i.state === 'open' ? '開いている' : '閉じた'}）`;
    } else head = `Issue の下書き「${is.title}」`;
    const open = rows.filter(r => r.open).map(r => ({ number: r.number, title: r.title, features: linkIssue(cat, r).features }));
    items = checkIssue(cat, is, open);
  } else throw new Error('pr か issue の番号、または kind（pr／issue）と title・body（・files）を渡してください');
  const bad = items.filter(x => x.ok === false).length;
  return `■ 自己チェック：${head}\n${show(items)}\n\n${bad ? `✗ が ${bad} 件。直してから出してください（出したあとなら、題・説明を編集してください）。` : 'すべて守れています。'}`;
}
