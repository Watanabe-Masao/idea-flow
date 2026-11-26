// Claude のコネクタ（MCP、Streamable HTTP）。会話の Claude が、決まりの見える化の結果を読んで人と相談するための入口。
// いまは読むだけ（GitHub にもアプリのデータにも書き込まない）。合言葉は URL の /mcp/<MCP_TOKEN>。
import type { Env } from './types.ts';
import { rulesView, xray } from './rules.ts';
import { LIST, PLAIN_APPLIES } from './diagnosis.ts';
import { addComment, contractText, propose, requests as changeRequests, scopeTree, type Op } from './scopes.ts';
import { embedMany, loadVectors } from './embed.ts';
import { consultFor } from './consult.ts';
import { exportPreview, projectInstruction } from './export.ts';
import { activityView } from './activity.ts';
import { dot } from './vec.ts';
import { safeEqual } from './util.ts';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `（道具は idea_flow ひとつを使う。action="help" でできることを確かめる。ほかの道具は古い会話のために残しているもの）
idea-flow は、リポジトリの CLAUDE.md・ROLE.md・SKILL.md・決まりの文書を「決まりの単位（条項）」に分け、どこに効いているか、どんな問題があるかを見える化する道具です。
- これは人と Claude が相談するための道具です。決めるのは人です。見つかった問題は、事実（どの文書の何行目か、どう読まれるか）と、あなたの見立て（なぜ問題か、直し方の案、直したときの副作用）を分けて伝えてください。
- あなたが変えられるのは「提案」だけです（propose_scope_change で変更リクエストを出す）。反映するかは人がアプリで承認して決めます。リポジトリの中身は変えられません。直し方の案は、人が確かめられるように具体的に書いてください。
- 範囲の木：決まりの文書を範囲（例：画面、満月の物語）に付けると、その範囲と下の範囲に効きます。横の範囲には効きません。例外で、ある文書のある見出しの決まりを、その範囲（と下）だけ外せます。
- 人に伝えるときは、まず結論（rules_overview の診断書）から、ふだんの言葉で。件数や一覧は聞かれたら出す。道具の内側の言葉（finding の種類名など）は使わない。
- 届き方の意味：自動で届く（CLAUDE.md・AGENTS.md）／役割として届く（ROLE.md）／場面に合えば届く（スキル。説明文で呼ばれる）／渡さないと届かない（それ以外の文書）。
- 外から入れた決まり（ライセンスつきのスキルなど、書き換えないもの）は診断から外してある。
- 寿命（短期／長期）はまだ人が決めていないので、すべて「未分類」です。勝手に決めず、分類の案として出してください。
- 問題の種類（list_rule_findings の kind）：no_entry 入口が無い / unreferenced 入口からたどれない / duplicate 同じことが2か所 / definition 同じ言葉を2か所で説明 / conflict 食い違いかもしれない / temporary 終わったかもしれない / skill_overlap 似た場面で呼ばれるスキル / dead_ref もう無いファイルを指している / skill_unused 使っていない技術向けのスキル / orphan どこからも案内されていない文書。
- 人はアプリで、決まりにピン（見直してほしい）を付けたり、書き換えたりして、変更リクエストとして出します。action="consult" で承認待ちを見て、id を渡すと相談の中身（原文・書き換えたあと・効いている範囲・意味の近い決まり）が出ます。読んだら、影響と副作用を action="comment" で返事してください。あなたからの書き換えの提案は propose の ops に {op:"edit", path, heading, item?, before, after} で出せます（反映は人の承認）。
- dead_ref・skill_unused・orphan は「機能していない・意味がなさそう」の候補です。消す・直すを決めるのは人です。消したコミットや中身を確かめてから、残す理由がないかも一緒に考えてください。`;

const KIND_JA: Record<string, string> = { no_entry: '入口が無い', unreferenced: '入口からたどれない', duplicate: '同じことが2か所', definition: '同じ言葉を2か所で説明', conflict: '食い違いかもしれない', temporary: '終わったかもしれない', skill_overlap: '似た場面で呼ばれるスキル', dead_ref: 'もう無いファイルを指している', skill_unused: '使っていない技術向けのスキル', orphan: 'どこからも案内されていない' };
const APPLIES_JA = PLAIN_APPLIES;

const TOOLS = [
  {
    name: 'rules_overview',
    description: '取り込んだリポジトリごとの診断書（結論・なぜ困るか・次の一手）を返す。最初に使う。docs=true で文書の一覧（届き方・決まりの数）も付ける。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name（省略するとすべて）' }, docs: { type: 'boolean', description: '文書の一覧も付ける' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_rule_findings',
    description: '見つかった問題の一覧。人が「問題ではない」にしたものは含まない。各問題に key（識別子）、関係する決まりの本文、文書と行が付く。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: Object.keys(KIND_JA), description: '問題の種類で絞る' },
        repo: { type: 'string' }, limit: { type: 'number', description: '初期値 15、最大 50' }, offset: { type: 'number' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_rule_doc',
    description: '1つの文書の決まりを、見出しごとに行番号つきで読む。長い文書は heading で見出しを絞るか、offset で続きを読む。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, heading: { type: 'string', description: '見出しの一部（含むものだけ）' }, offset: { type: 'number' }, limit: { type: 'number', description: '初期値 80、最大 200' } }, required: ['repo', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'xray_scene',
    description: '場面のレントゲン。ある場面（例「予報ビューに比較表を足す」「絵本の8Pの下絵」）で、Claude に何が届くかを層ごとに返す：自動で届く／参照で届く／場面で呼ばれそうなスキル／場面に関係するのに届かない決まり。作業を始める前や、決まりの範囲を相談するときに使う。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, scene: { type: 'string', description: 'これからする作業や話題を一文で' }, scope: { type: 'string', description: '範囲の key（指定すると、その範囲の決まりも届くものとして数える）' } }, required: ['repo', 'scene'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_scopes',
    description: '範囲の木（範囲ごとに付けた文書と例外）と、出ている変更リクエスト（承認待ち・決まったもの）を読む。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_scope_contract',
    description: 'その範囲で Claude に渡す内容（守る文書・使わない部分・範囲外）を読む。その範囲の作業を始める前に使う。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, scope: { type: 'string', description: '範囲の key（read_scopes で見られる）' } }, required: ['repo', 'scope'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'propose_scope_change',
    description: '範囲の木の変更リクエストを出す（反映はしない。人がアプリで承認したら反映）。ops の例：{"op":"add_scope","key":"screen","name":"画面","parent":"root"}／{"op":"attach","scope":"screen","path":"docs/design-system.md"}／{"op":"add_exception","scope":"moon","path":"docs/design-system.md","heading":"2. 色","why":"絵本は独自の色"}。ほかに rename_scope・move_scope・remove_scope・detach・remove_exception。全体の範囲の key は root。',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' }, title: { type: 'string', description: '何を変えるかを一言で' }, reason: { type: 'string', description: 'なぜ変えるか・人と相談した内容・副作用の見立て' },
        ops: { type: 'array', items: { type: 'object' }, description: '変更の中身（1〜60件）' },
      },
      required: ['repo', 'title', 'reason', 'ops'], additionalProperties: false,
    },
  },
  {
    name: 'search_rules',
    description: '意味の近い決まりを探す。「この話題の決まりはどこに散らばっているか」「この変更で影響しそうな決まりはどれか」を調べるときに使う。',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, repo: { type: 'string' }, limit: { type: 'number', description: '初期値 10、最大 30' } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

/**
 * ひとつの入口。会話は始めた時点の道具の一覧を使い続けるので、機能を足しても一覧が変わらないように、
 * 「何をするか（action）」と「中身（args）」を渡す形にする。新しい機能は action を足すだけ。
 */
const ACTIONS: Record<string, { tool: string; summary: string }> = {
  help: { tool: '', summary: 'できること（action）の一覧と、それぞれの args' },
  overview: { tool: 'rules_overview', summary: '診断書（結論・なぜ困るか・次の一手）。args: repo?, docs?' },
  findings: { tool: 'list_rule_findings', summary: '問題の一覧。args: repo?, kind?, limit?, offset?' },
  read_doc: { tool: 'read_rule_doc', summary: '文書を見出しごとに行番号つきで。args: repo, path, heading?, offset?, limit?' },
  xray: { tool: 'xray_scene', summary: '場面のレントゲン。args: repo, scene, scope?' },
  scopes: { tool: 'read_scopes', summary: '範囲の木と変更リクエスト。args: repo' },
  contract: { tool: 'read_scope_contract', summary: 'その範囲で Claude に渡す内容。args: repo, scope' },
  propose: { tool: 'propose_scope_change', summary: '範囲の木の変更リクエストを出す（反映は人の承認）。args: repo, title, reason, ops' },
  search: { tool: 'search_rules', summary: '意味の近い決まりを探す。args: query, repo?, limit?' },
  consult: { tool: 'consult', summary: '人のピン・書き換え・範囲の変更の相談。args: repo?（承認待ちの一覧）／id（その変更リクエストの相談の中身。原文・書き換えたあと・効いている範囲・意味の近い決まり）' },
  activity: { tool: 'activity', summary: '作業の記録：マージした PR ごとに、変えたファイル・範囲・関係する決まり・Claude の申告（確かめた決まり／自分で判断した所／足りなかった決まり）と、気になる所。args: repo, limit?' },
  export: { tool: 'export_preview', summary: 'CLAUDE.md に書き出す道案内（範囲の木から）と、承認した書き換えが当てはまるか。読むだけ（PR は人がアプリで出す）。args: repo' },
  project: { tool: 'project_instruction', summary: 'claude.ai のプロジェクトに貼る指示文（その範囲の契約をコネクタで読ませる）。args: repo, scope' },
  comment: { tool: 'comment', summary: '変更リクエストに返事を書く（影響と副作用の見立て）。args: id, text' },
};
const ENTRY = {
  name: 'idea_flow',
  description: 'idea-flow のひとつの入口。action と args を渡す。まず action="help" で、いまできること（機能が増えても、この道具のまま使える）を確かめる。主な action：activity（作業の記録：Claude がしたこと）・overview（診断書）・export（CLAUDE.md に書き出す道案内）・consult（人のピンや書き換えの相談）・comment（相談への返事）・xray（場面のレントゲン）・scopes（範囲の木）・contract（範囲の契約）・propose（変更リクエストを出す。反映は人の承認）・findings・read_doc・search。',
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', description: 'help / activity / overview / export / project / consult / comment / findings / read_doc / xray / scopes / contract / propose / search（ほかにも増える。help で確かめる）' }, args: { type: 'object', description: 'action ごとの中身（help で確かめる）' } },
    required: ['action'], additionalProperties: false,
  },
};

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const err = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
const num = (v: unknown, d: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d));

type View = Awaited<ReturnType<typeof rulesView>>;
type ItemRow = { id: string; doc: string; n: number; heading: string; text: string; line: number; kind: string };

function where(v: View, it: ItemRow) {
  const d = v.docs.find(x => x.id === it.doc)!;
  return `${d.repo} ${d.path}:${it.line}${it.heading ? `（${it.heading}）` : ''}［${APPLIES_JA[d.applies]}］`;
}

async function callTool(env: Env, name: string, a: Record<string, unknown>) {
  const v = await rulesView(env);
  const items = v.items as unknown as ItemRow[];
  const repoOk = (r: string) => !a.repo || r === a.repo;
  switch (name) {
    case 'rules_overview': {
      const repos = Object.keys(v.diagnosis).filter(repoOk);
      if (!v.docs.some(d => repoOk(d.repo))) return text('まだ何も取り込まれていません。アプリの「決まり」タブで取り込んでもらってください。');
      const out: string[] = [];
      for (const r of repos) {
        const s = v.sources.find(x => x.repo === r), ds = v.docs.filter(d => d.repo === r), dg = v.diagnosis[r];
        if (!ds.length) continue;
        out.push(`■ ${r} の診断（取り込み ${s?.synced_at ? s.synced_at.slice(0, 16).replace('T', ' ') + ' UTC' : 'まだ'}・文書 ${ds.length}・決まり ${items.filter(i => ds.some(d => d.id === i.doc)).length}）`);
        if (!dg.conclusions.length) out.push('  問題は見つかっていません。');
        dg.conclusions.forEach((c, k) => out.push(`  ${k + 1}. ${c.title}`, `     なぜ困るか：${c.why}`, `     次の一手：${c.next}`, ...(c.list ?? []).slice(0, 5).map(l => `     ・${l}`), `     （詳しくは list_rule_findings kind=${c.kind}）`));
        if (dg.external.length) out.push(`  外から入れた決まり（書き換えないもの。診断から外している）：${dg.external.length}件（${dg.external.slice(0, 3).join('、')}${dg.external.length > 3 ? ' ほか' : ''}）`);
        if (a.docs) for (const d of ds) out.push(`  - ${d.path}［${APPLIES_JA[d.applies]}${d.external ? '・外から入れたもの' : ''}］決まり ${items.filter(i => i.doc === d.id).length}`);
      }
      if (v.dismissed) out.push(`（人が「問題ではない」にしたもの ${v.dismissed}件は数えていません）`);
      return text(out.join('\n'));
    }
    case 'list_rule_findings': {
      const docRepo = (id: string) => v.docs.find(d => d.id === id)?.repo ?? v.docs.find(d => d.id === items.find(i => i.id === id)?.doc)?.repo ?? (id.endsWith('|') ? id.slice(0, -1) : undefined);
      const fl = v.findings.filter(f => (!a.kind || f.kind === a.kind) && (!a.repo || docRepo(f.a) === a.repo || (f.b && docRepo(f.b) === a.repo)));
      const off = num(a.offset, 0, 100000), lim = num(a.limit, 15, 50) || 15;
      const page = fl.slice(off, off + lim);
      const lines = [`${fl.length}件中 ${off + 1}〜${off + page.length}件目${a.kind ? `（${KIND_JA[String(a.kind)]}）` : ''}`];
      for (const f of page) {
        lines.push('', `[${KIND_JA[f.kind]}] key=${f.key}${f.score != null ? `・近さ ${(+f.score).toFixed(2)}` : ''}`);
        if (f.kind === 'no_entry') {
          lines.push(`  渡さないと届かない文書 ${f.detail.docs.length}件（決まり ${f.detail.items}件）：${f.detail.docs.join('、')}`);
          for (const c of f.detail.candidates ?? []) lines.push(`  入口の候補：${c.path} → 参照をたどって ${c.reaches.join('、')} に届く`);
          lines.push('  ※候補は参照されている数（まとめ役かどうか）と届く数で選んだもの。入口の決まりは全体に効くので、全体に効いてよい中身かは人が確かめる');
        } else if (f.kind === 'unreferenced') {
          const d = v.docs.find(x => x.id === f.a)!;
          lines.push(`  ${d.repo} ${d.path}（決まり ${items.filter(i => i.doc === d.id).length}）${f.detail.from?.length ? `・参照しているのは ${f.detail.from.join('、')}（どれも入口から届かない）` : '・どこからも参照されていない'}`);
        } else if (f.kind in LIST) {
          for (const l of LIST[f.kind](f)) lines.push(`  ${l}`);
          if (f.kind === 'dead_ref') for (const r of f.detail.refs) lines.push(`    ${r.line}: ${r.text}`);
        } else if (f.kind === 'skill_overlap') {
          for (const id of [f.a, f.b]) { const d = v.docs.find(x => x.id === id); if (d) lines.push(`  ${d.path}：${d.description ?? ''}`); }
        } else {
          for (const id of [f.a, f.b]) { const it = items.find(i => i.id === id); if (it) lines.push(`  ${where(v, it)}`, `    ${it.text}`); }
          if (f.kind === 'temporary') lines.push(`  当たった言葉：「${f.detail.word}」`);
          if (f.kind === 'definition') lines.push(`  同じ言葉：${(f.detail.terms ?? []).join('、')}`);
        }
      }
      if (off + page.length < fl.length) lines.push('', `続きは offset=${off + page.length}`);
      return text(lines.join('\n'));
    }
    case 'read_rule_doc': {
      const d = v.docs.find(x => x.repo === a.repo && x.path === a.path);
      if (!d) return text(`${a.repo} ${a.path} は取り込まれていません。rules_overview で文書の一覧を確かめてください。`, true);
      const all = items.filter(i => i.doc === d.id && (!a.heading || i.heading.includes(String(a.heading))));
      const off = num(a.offset, 0, 100000), lim = num(a.limit, 80, 200) || 80;
      const page = all.slice(off, off + lim);
      const lines = [`${d.repo} ${d.path}「${d.title ?? ''}」［${APPLIES_JA[d.applies]}・範囲 ${d.scope || 'リポジトリ全体'}］ 決まり ${all.length}件中 ${off + 1}〜${off + page.length}`];
      if (d.description) lines.push(`説明文：${d.description}`);
      let h = '';
      for (const it of page) { if (it.heading !== h) { h = it.heading; lines.push('', `## ${h || '（見出しなし）'}`); } lines.push(`${it.line}: ${it.text}`); }
      if (off + page.length < all.length) lines.push('', `続きは offset=${off + page.length}`);
      return text(lines.join('\n'));
    }
    case 'xray_scene': {
      const x = await xray(env, String(a.repo ?? ''), String(a.scene ?? ''), String(a.scope ?? ''));
      const L = [`場面「${x.scene}」で ${x.repo} から Claude に届くもの`, '',
        ...(x.scope ? [`■ 範囲「${x.scope.chain.join(' › ')}」で届く：${x.scope.docs.map(d => `${d.path}（${d.items}・${d.from}から）`).join('、') || 'なし'}${x.scope.excludedItems ? `／例外で外した決まり ${x.scope.excludedItems}件` : ''}`] : []),
        `■ 自動で届く：${x.auto.length ? x.auto.map(d => `${d.path}（${d.items}）`).join('、') : 'なし（入口が無い）'}`,
        `■ 参照で届く：${x.byRef.length ? x.byRef.map(d => `${d.path}（${d.items}）`).join('、') : 'なし'}`,
        '■ 場面で呼ばれそうなスキル（説明文との近さ）：',
        ...(x.skills.length ? x.skills.map(s => `  ${s.likely ? '◎' : '・'} ${s.title ?? s.path} ${s.score}${s.external ? '（外から入れたもの）' : ''}`) : ['  なし']),
        '■ この場面に関係するのに届かない決まり（会話で渡さないと守られない）：',
        ...(x.missing.length ? x.missing.flatMap(m => [`  ${m.path}（近さ ${m.best}）`, ...m.rules.map(r => `    ${r.line}: ${r.text}`)]) : ['  なし']),
        '■ メモリ：まだ管理していない（メモリの使い分けは今後追加）'];
      return text(L.join('\n'));
    }
    case 'read_scopes': {
      const repo = String(a.repo ?? '');
      const t = await scopeTree(env, repo);
      const L: string[] = [];
      if (!t.length) L.push('範囲の木はまだありません（最初の変更リクエストを承認すると、全体の範囲 root ができます）。');
      const walk = (pid: string | null, depth: number) => { for (const s of t.filter(x => x.parent_id === pid)) {
        L.push(`${'  '.repeat(depth)}- ${s.name}（key=${s.key}）${s.docs.length ? '：' + s.docs.join('、') : ''}`);
        for (const e of s.exceptions) L.push(`${'  '.repeat(depth)}    例外：${e.path} の「${e.heading}」${e.why ? '（' + e.why + '）' : ''}`);
        walk(s.id, depth + 1);
      } };
      walk(null, 0);
      const rs = await changeRequests(env, repo);
      if (rs.length) { L.push('', '■ 変更リクエスト'); for (const r of rs.slice(0, 10) as unknown as { id: string; title: string; status: string; by: string }[]) L.push(`- [${r.status === 'pending' ? '承認待ち' : r.status === 'accepted' ? '承認済み' : '見送り'}] ${r.title}（${r.by === 'ai' ? 'Claude' : '人'}・id=${r.id}）`); }
      return text(L.join('\n'));
    }
    case 'read_scope_contract': {
      const repo = String(a.repo ?? ''), t = await scopeTree(env, repo), s = t.find(x => x.key === a.scope);
      if (!s) return text(`範囲 ${a.scope} がありません。read_scopes で確かめてください。`, true);
      return text(contractText(repo, t, s.id));
    }
    case 'propose_scope_change': {
      const r = await propose(env, String(a.repo ?? ''), 'ai', String(a.title ?? ''), String(a.reason ?? ''), a.ops as Op[]);
      const pv = r.preview as { name: string; chain: string[]; isNew: boolean; starts: string[]; stops: string[]; newExceptions: string[]; droppedExceptions: string[] }[];
      const L = [`変更リクエストを出しました（id=${r.id}）。反映するかは、人がアプリの「決まり」タブで決めます。`, '', '■ 承認したら変わること'];
      for (const p of pv) L.push(`- ${p.chain.join(' › ')}${p.isNew ? '（新しい範囲）' : ''}${p.starts.length ? `／効き始める：${p.starts.join('、')}` : ''}${p.stops.length ? `／効かなくなる：${p.stops.join('、')}` : ''}${p.newExceptions.length ? `／例外が増える：${p.newExceptions.join('、')}` : ''}${p.droppedExceptions.length ? `／例外がなくなる：${p.droppedExceptions.join('、')}` : ''}`);
      return text(L.join('\n'));
    }
    case 'consult': {
      if (a.id) return text(await consultFor(env, String(a.id)));
      const repos = a.repo ? [String(a.repo)] : [...new Set(v.sources.map(x => x.repo))];
      const L: string[] = [];
      for (const r of repos) {
        const rs = ((await changeRequests(env, r)) as unknown as { id: string; title: string; status: string; by: string; ops: Op[]; comments: { by: string }[] }[]).filter(x => x.status === 'pending');
        if (!rs.length) continue;
        L.push(`■ ${r}`);
        for (const x of rs) L.push(`- id=${x.id}「${x.title}」（${x.by === 'ai' ? 'Claude' : '人'}・ピン ${x.ops.filter(o => o.op === 'pin').length}・書き換え ${x.ops.filter(o => o.op === 'edit').length}・範囲 ${x.ops.filter(o => o.op !== 'pin' && o.op !== 'edit').length}${x.comments.some(c => c.by === 'ai') ? '・返事済み' : ''}）`);
      }
      return text(L.length ? L.join('\n') + '\n\nid を渡すと、その相談の中身を出します（action="consult", args: {id}）。' : '承認待ちの相談はありません。');
    }
    case 'activity': {
      const x = await activityView(env, String(a.repo ?? ''), num(a.limit, 15, 40) || 15);
      const L = [`${x.repo} の作業の記録（新しい順）：${x.counts.total}件・申告あり ${x.counts.reported}・気になる所 ${x.counts.warn}${x.hasTree ? '' : '（範囲の木がまだ無いので、範囲は出ません）'}`];
      for (const i of x.items) {
        L.push('', `#${i.number} ${i.title}（${i.merged_at.slice(0, 10)}）［${i.state === 'ok' ? '決まりを確かめた' : i.state === 'warn' ? '気になる所あり' : '申告なし'}］`, `  範囲：${i.scopes.join('、') || 'わからない'}／変えたファイル：${i.files.slice(0, 6).join('、')}${i.files.length > 6 ? ' ほか' : ''}`);
        L.push(`  関係する決まり：${i.expected.map(e => `${e.path}${e.confirmed ? '✓' : ''}`).join('、') || 'なし'}`);
        if (i.report) { if (i.report.own.length) L.push(`  自分で判断：${i.report.own.join('／')}`); if (i.report.lack.length) L.push(`  足りなかった決まり：${i.report.lack.join('／')}`); }
        for (const o of i.outside) L.push(`  ⚠ ${o}`);
        if (i.none) L.push('  ⚠ この範囲の決まりを1つも確かめていない');
      }
      return text(L.join('\n'));
    }
    case 'export_preview': {
      const pv = await exportPreview(env, String(a.repo ?? ''));
      const L = [`${pv.repo}（${pv.branch}）に書き出す内容${pv.canWrite ? '' : '（書き込み用の鍵がまだ無いので、PR は出せません）'}`, ...pv.notes];
      for (const f of pv.files) L.push('', `■ ${f.path}${f.before == null ? '（新しいファイル）' : ''}`, f.path === 'CLAUDE.md' ? f.after.slice(f.after.indexOf('<!-- idea-flow:start -->')) : '（承認した書き換えを当てたもの）');
      if (pv.edits.length) L.push('', '■ 承認した書き換え', ...pv.edits.map(e => `- ${e.path}「${e.heading}」：${e.ok ? '当てはまる' : '当てはまらない（' + e.reason + '）'}`));
      if (!pv.files.length) L.push('書き出すものはありません。');
      return text(L.join('\n'));
    }
    case 'project_instruction': return text(await projectInstruction(env, String(a.repo ?? ''), String(a.scope ?? '')));
    case 'comment': {
      const r = await addComment(env, String(a.id ?? ''), 'ai', String(a.text ?? ''));
      return text(`返事を書きました（${r.id}）。人がアプリで読んで、承認するか決めます。`);
    }
    case 'search_rules': {
      const q = String(a.query ?? '').trim().slice(0, 300);
      if (!q) return text('query が空です', true);
      const [qv] = await embedMany(env, [q]);
      const vecs = await loadVectors(env, 'rule');
      const lim = num(a.limit, 10, 30) || 10;
      const hits = items.filter(i => vecs.has(i.id) && repoOk(v.docs.find(d => d.id === i.doc)?.repo ?? ''))
        .map(i => ({ i, s: dot(qv, vecs.get(i.id)!) })).sort((x, y) => y.s - x.s).slice(0, lim);
      return text(hits.length ? hits.map(({ i, s }) => `近さ ${s.toFixed(2)}  ${where(v, i)}\n  ${i.text}`).join('\n') : '見つかりませんでした。');
    }
    default:
      throw new Error(`知らない道具です：${name}`);
  }
}

async function callEntry(env: Env, action: string, args: Record<string, unknown>) {
  if (action === 'help' || !ACTIONS[action]) {
    const head = action === 'help' ? '' : `「${action}」という action はありません。\n\n`;
    return text(head + 'idea_flow の action（args は JSON のオブジェクトで渡す）\n' + Object.entries(ACTIONS).filter(([k]) => k !== 'help').map(([k, v]) => `- ${k}：${v.summary}`).join('\n')
      + '\n\npropose の ops の例：{"op":"add_scope","key":"screen","name":"画面","parent":"root"}／{"op":"attach","scope":"screen","path":"docs/design-system.md"}／{"op":"add_exception","scope":"moon","path":"docs/design-system.md","heading":"2. 色","why":"…"}（ほかに rename_scope・move_scope・remove_scope・detach・remove_exception）', action !== 'help');
  }
  return callTool(env, ACTIONS[action].tool, args);
}

async function handle(env: Env, m: Rpc) {
  const id = m.id;
  switch (m.method) {
    case 'initialize': {
      const want = String(m.params?.protocolVersion ?? '');
      return ok(id, { protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'idea-flow', version: '0.3.0' }, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: [ENTRY, ...TOOLS] });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      if (name !== ENTRY.name && !TOOLS.some(t => t.name === name)) return err(id, -32602, `知らない道具です：${name}`);
      try {
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        if (name === ENTRY.name) return ok(id, await callEntry(env, String(args.action ?? 'help'), (args.args ?? {}) as Record<string, unknown>));
        return ok(id, await callTool(env, name, args));
      }
      catch (e) { return ok(id, text(e instanceof Error ? e.message : String(e), true)); }
    }
    case 'resources/list': return ok(id, { resources: [] });
    case 'prompts/list': return ok(id, { prompts: [] });
    default: return err(id, -32601, `対応していない method です：${m.method}`);
  }
}

export async function handleMcp(req: Request, env: Env, token: string): Promise<Response> {
  if (!env.MCP_TOKEN || !safeEqual(token, env.MCP_TOKEN)) return new Response('Not found', { status: 404 });
  if (req.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  let msg: Rpc | Rpc[];
  try { msg = await req.json(); } catch { return Response.json(err(null, -32700, 'JSON として読めません'), { status: 400 }); }
  const list = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of list) {
    if (!m || typeof m.method !== 'string') { out.push(err((m as Rpc | undefined)?.id ?? null, -32600, '不正なリクエストです')); continue; }
    if (m.id === undefined || m.id === null) continue; // 通知には返事をしない
    out.push(await handle(env, m));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(msg) ? out : out[0]);
}
