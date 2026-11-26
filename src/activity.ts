// 作業の記録：Claude がしたことを見せる。マージした PR ごとに、
// ①頼んだこと（題）②変えたファイル ③その範囲で関係する決まり ④Claude が PR に書いた申告 を突き合わせる。
// 判断はしない。ずれ（範囲外の決まりを使った・範囲の決まりを1つも確かめていない）だけを目立たせる。
import type { Env } from './types.ts';
import { gh } from './gh.ts';
import { pathsIn } from './audit.ts';
import { chain, effective, ITEM_SEP, scopeTree, type Tree } from './scopes.ts';
import { nowIso } from './util.ts';

/** PR の説明から申告を読む（CLAUDE.md の道案内で書き方を決めている見出し） */
export function parseReport(body: string) {
  const sec = { read: [] as string[], own: [] as string[], lack: [] as string[] };
  const KEYS: [keyof typeof sec, RegExp][] = [['read', /確かめた決まり/], ['own', /自分で判断/], ['lack', /足りなかった決まり/]];
  let cur: keyof typeof sec | null = null, found = false;
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^(#{1,6}\s+|\*\*)(.+?)(\*\*)?[:：]?$/);
    if (head) { const k = KEYS.find(([, re]) => re.test(head[2])); cur = k ? k[0] : null; if (k) found = true; continue; }
    if (!cur) continue;
    const it = line.match(/^[-*・]\s*(.+)$/);
    if (it && !/^(なし|特になし|無し)[。．]?$/.test(it[1].trim())) sec[cur].push(it[1].trim());
  }
  return found ? sec : null;
}

type Doc = { path: string; title: string | null; applies: string };

/**
 * 範囲ごとの「受け持つ場所」：範囲に置いた文書そのものと、その文書が書いているパス。
 * - 全体（根）は当てない（いつも効くので、当てても意味がない）
 * - 広すぎるフォルダ（src/・src/ui/ のような2段まで）は使わない。ファイルか、3段以上のフォルダだけ
 * - 同じパスを複数の範囲の文書が書いているときは、その範囲たちの共通の親に付ける（styles.css など）
 */
export function scopeAreas(tree: Tree, sections: { path: string; md: string }[]) {
  const root = tree.find(s => !s.parent_id);
  const by = new Map<string, Set<string>>();
  const add = (p: string, id: string) => (by.get(p) ?? by.set(p, new Set()).get(p)!).add(id);
  for (const s of tree) {
    if (s === root) continue;
    for (const d of s.docs) add(d, s.id);
    for (const sc of sections) if (s.docs.includes(sc.path)) for (const p of pathsIn(sc.md)) {
      if (/\.md$/i.test(p)) continue;
      const file = /\.\w+$/.test(p), depth = p.replace(/\/$/, '').split('/').length;
      if (file || depth >= 3) add(p.replace(/\/$/, ''), s.id);
    }
  }
  const lca = (ids: string[]) => { const cs = ids.map(id => chain(tree, id).map(x => x.id)); let i = 0; while (cs.every(c => c[i] && c[i] === cs[0][i])) i++; return i ? cs[0][i - 1] : null; };
  const out: { path: string; id: string }[] = [];
  for (const [p, ids] of by) { const id = ids.size === 1 ? [...ids][0] : lca([...ids]); if (id && id !== root?.id) out.push({ path: p, id }); }
  return out;
}
const hits = (file: string, p: string) => file === p || file.startsWith(p + '/') || (!/\.\w+$/.test(p) && file.startsWith(p));

/** 変えたファイルから範囲を決める。ファイルごとにいちばん細かく当たるパスの範囲。親と子の両方なら子 */
export function scopesOfFiles(tree: Tree, areas: { path: string; id: string }[], files: string[]) {
  const ids = new Set<string>();
  for (const f of files) {
    const m = areas.filter(a => hits(f, a.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (m) ids.add(m.id);
  }
  return [...ids].filter(id => ![...ids].some(o => o !== id && chain(tree, o).some(c => c.id === id)));
}

export function analyzeWork(tree: Tree, docs: Doc[], areas: { path: string; id: string }[], pr: { files: string[]; body: string }) {
  const scopeIds = scopesOfFiles(tree, areas, pr.files);
  const root = tree.find(s => !s.parent_id);
  const effs = scopeIds.map(id => effective(tree, id));
  const expected = new Map<string, string>(); // path → どの範囲から
  for (const e of effs) for (const d of e.docs) if (!expected.has(d.path)) expected.set(d.path, d.from);
  if (!scopeIds.length && root) for (const p of root.docs) expected.set(p, root.name);
  const exceptions = effs.flatMap(e => e.exceptions);
  const report = parseReport(pr.body);
  const docOf = (line: string) => docs.filter(d => line.includes(d.path) || (d.title && d.title.length >= 4 && line.includes(d.title))).map(d => d.path);
  const confirmed = new Set(report ? report.read.flatMap(docOf) : []);
  const isSkill = (p: string) => docs.find(d => d.path === p)?.applies === 'skill';
  const scoped = [...expected.keys()].filter(p => !isSkill(p) && !(root && root.docs.includes(p)));
  const outside: string[] = [];
  if (report) for (const line of report.read) {
    for (const p of docOf(line)) {
      const placedElsewhere = tree.some(s => s.docs.includes(p));
      if (!expected.has(p) && placedElsewhere && scopeIds.length) outside.push(`${line}（この作業の範囲では読まない文書）`);
      const ex = exceptions.find(e => e.path === p && (e.heading === '*' || line.includes(e.heading.split(ITEM_SEP)[0])));
      if (ex) outside.push(`${line}（「${ex.from}」では使わないと決めた部分）`);
    }
  }
  const none = !!report && scoped.length > 0 && !scoped.some(p => confirmed.has(p));
  return {
    scopes: scopeIds.map(id => { const c = chain(tree, id); return (c.length > 1 ? c.slice(1) : c).map(s => s.name).join(' › '); }),
    expected: [...expected].map(([path, from]) => ({ path, from, title: docs.find(d => d.path === path)?.title ?? null, skill: isSkill(path), confirmed: confirmed.has(path) })),
    exceptions: exceptions.map(e => ({ path: e.path, heading: e.heading, from: e.from })),
    report, outside, none,
    state: !report ? 'none' : outside.length || none ? 'warn' : 'ok',
  };
}

/** マージした PR を少しずつ取り込む（新しいものの変えたファイルは1件1回なので、1回の呼び出しで budget 件まで） */
export async function refreshActivity(env: Env, repo: string, budget = 10) {
  const prs = await gh<{ number: number; title: string; html_url: string; merged_at: string | null; body: string | null }[]>(env, `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=40`);
  const merged = prs.filter(p => p.merged_at);
  const have = new Map((await env.DB.prepare('SELECT number, body FROM pr_activity WHERE repo = ?').bind(repo).all<{ number: number; body: string }>()).results.map(r => [r.number, r.body]));
  const now = nowIso();
  let added = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const p of merged) {
    if (have.has(p.number)) {
      if ((have.get(p.number) ?? '') !== (p.body ?? '')) stmts.push(env.DB.prepare('UPDATE pr_activity SET body = ?, title = ?, fetched_at = ? WHERE repo = ? AND number = ?').bind(p.body ?? '', p.title, now, repo, p.number));
      continue;
    }
    if (added >= budget) continue;
    const files = await gh<{ filename: string }[]>(env, `/repos/${repo}/pulls/${p.number}/files?per_page=100`);
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO pr_activity (repo, number, title, url, merged_at, body, files, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(repo, p.number, p.title, p.html_url, p.merged_at, p.body ?? '', JSON.stringify(files.map(f => f.filename)), now));
    added++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { added, remaining: merged.filter(p => !have.has(p.number)).length - added };
}

/** 画面とコネクタ用：作業の記録（新しい順） */
export async function activityView(env: Env, repo: string, limit = 40) {
  const rows = (await env.DB.prepare('SELECT * FROM pr_activity WHERE repo = ? ORDER BY merged_at DESC LIMIT ?').bind(repo, limit).all<{ number: number; title: string; url: string; merged_at: string; body: string; files: string }>()).results;
  const tree = await scopeTree(env, repo);
  const docs = (await env.DB.prepare('SELECT path, title, applies FROM rule_docs WHERE repo = ?').bind(repo).all<Doc>()).results;
  // 見出しにもパスが書かれている（「3. 数値・単位・日付（`src/design/format.ts`）」など）ので、見出しと本文をつなげて見る
  const sections = (await env.DB.prepare("SELECT d.path, s.heading || char(10) || s.md AS md FROM rule_sections s JOIN rule_docs d ON d.id = s.doc WHERE d.repo = ?").bind(repo).all<{ path: string; md: string }>()).results;
  const areas = scopeAreas(tree, sections);
  const items = rows.map(r => ({ number: r.number, title: r.title, url: r.url, merged_at: r.merged_at, files: JSON.parse(r.files) as string[], ...analyzeWork(tree, docs, areas, { files: JSON.parse(r.files), body: r.body }) }));
  return { repo, hasTree: tree.length > 0, items, counts: { total: items.length, reported: items.filter(i => i.report).length, warn: items.filter(i => i.state === 'warn').length } };
}
