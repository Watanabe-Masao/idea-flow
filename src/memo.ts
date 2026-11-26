// アイデアや会話のメモを、企画ごとにまとめる。
// 原則：AI が書いたメモや AI が指定した企画は「提案」。人が書いた・承認したものだけを手本にする。
import type { Env } from './types.ts';
import { loadSettings, AUTO_OFF } from './suggest.ts';
import { loadVectors, memoText, projectText, upsertEmbeddings, embedMany } from './embed.ts';
import { decideVote, dot, headingOf, knnVote, threshClusters, medoid, type Example, type Vote } from './vec.ts';
import { bulkInsert, newId, nowIso, sha256 } from './util.ts';

export const MEMO_KINDS = ['決定', '案', '保留', '疑問', 'メモ'] as const;
export const PROJECT_STATUSES = ['候補', '進行中', '判断待ち', '保留', '完了', '中止'] as const;
const CLOSED = new Set(['完了', '中止']);

export type MemoRow = { id: string; at: string; source: string; kind: string; heading: string | null; body: string; project: string | null; ref: string | null };
export type ProjectRow = { key: string; name: string; note: string; parent: string | null; status: string; created_at: string; created_by: string };
export type MemoHow = 'human' | 'accepted' | 'ai' | 'auto' | 'pending' | 'none';
export type MemoPlace = { project: string | null; how: MemoHow; score: number | null; suggestion?: string };

const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function listProjectsRaw(env: Env) {
  return (await env.DB.prepare('SELECT * FROM projects ORDER BY key').all<ProjectRow>()).results;
}
async function listMemosRaw(env: Env) {
  return (await env.DB.prepare('SELECT id, at, source, kind, heading, body, project, ref FROM memos WHERE deleted_at IS NULL ORDER BY at').all<MemoRow>()).results;
}

/** 各メモがどの企画に入るかを、書き手の指定と判断の記録から計算する（保存はしない） */
export async function memoPlaces(env: Env, memos?: MemoRow[]) {
  memos ??= await listMemosRaw(env);
  const keys = new Set((await env.DB.prepare('SELECT key FROM projects').all<{ key: string }>()).results.map(r => r.key));
  const sugg = (await env.DB.prepare("SELECT id, subject, target, score, status FROM suggestions WHERE kind = 'memo_project'")
    .all<{ id: string; subject: string; target: string | null; score: number; status: string }>()).results;
  const bySubject = new Map(sugg.map(s => [s.subject, s]));
  const out = new Map<string, MemoPlace>();
  for (const m of memos) {
    const s = bySubject.get(m.id);
    const given = m.project && keys.has(m.project) ? m.project : null;
    if (s?.status === 'accepted') out.set(m.id, { project: s.target, how: 'accepted', score: null, suggestion: s.id });
    else if (given && m.source === 'human') out.set(m.id, { project: given, how: 'human', score: null });
    else if (s?.status === 'rejected' && given && s.target === given) out.set(m.id, { project: null, how: 'none', score: null });
    else if (given) out.set(m.id, { project: given, how: 'ai', score: null });
    else if (s && (s.status === 'auto' || s.status === 'pending')) out.set(m.id, { project: s.target, how: s.status as MemoHow, score: s.score, suggestion: s.id });
    else out.set(m.id, { project: null, how: 'none', score: null });
  }
  return { memos, places: out };
}

/** 手本：人が書いた・承認したメモと、企画そのもの（名前＋説明） */
async function examples(env: Env, memos: MemoRow[], places: Map<string, MemoPlace>, projects: ProjectRow[]) {
  const mv = await loadVectors(env, 'memo'), pv = await loadVectors(env, 'project');
  const ex: Example[] = [];
  for (const p of projects) { const v = pv.get(p.key); if (v && p.status !== '中止') ex.push({ vec: v, label: p.key, heading: null, key: 'p:' + p.key }); }
  for (const m of memos) {
    const pl = places.get(m.id), v = mv.get(m.id);
    if (v && pl?.project && (pl.how === 'human' || pl.how === 'accepted')) ex.push({ vec: v, label: pl.project, heading: m.heading?.toLowerCase() ?? headingOf(m.body), key: m.id });
  }
  return { ex, mv };
}

/** 企画の指定がないメモに、企画の候補を出し直す（人が決めたものには触れない）。あわせて新しい企画の塊も探す */
export async function computeMemoSuggestions(env: Env) {
  const st = await loadSettings(env);
  const projects = await listProjectsRaw(env);
  const { memos, places } = await memoPlaces(env);
  const { ex, mv } = await examples(env, memos, places, projects);
  const decided = new Set((await env.DB.prepare("SELECT subject FROM suggestions WHERE kind = 'memo_project' AND status IN ('accepted','rejected')").all<{ subject: string }>()).results.map(r => r.subject));
  const now = nowIso();
  const rows: unknown[][] = [];
  const loose: string[] = [];
  let n = 0;
  for (const m of memos) {
    if (decided.has(m.id) || m.project) continue;
    const v = mv.get(m.id);
    if (!v) continue;
    const top = knnVote(v, m.heading?.toLowerCase() ?? headingOf(m.body), ex, { perLabel: 2 });
    const d = decideVote(top, st.memo_auto, st.memo_ask, st.min_sim);
    if (d.level === 'none') { loose.push(m.id); continue; }
    n++;
    rows.push([`s_mp_${m.id}`, 'memo_project', m.id, d.target, d.score, JSON.stringify({ top: top.slice(0, 3) }), d.level, now]);
  }
  // どの企画にも入らないメモどうしの塊 → 新しい企画の候補
  const lv = loose.map(id => mv.get(id)!);
  const groups = threshClusters(loose, lv, st.cluster_link, Math.max(2, Math.min(st.cluster_min, 3)));
  const byId = new Map(memos.map(m => [m.id, m]));
  for (const g of groups) {
    const key = (await sha256([...g].sort().join(','))).slice(0, 12);
    if (decided.has(`mc_${key}`)) continue;
    const rep = byId.get(g[medoid(g.map(id => mv.get(id)!))])!;
    rows.push([`s_mc_${key}`, 'memo_cluster', `mc_${key}`, null, g.length, JSON.stringify({ members: g, label: rep.heading ? `${rep.heading}：${rep.body}` : rep.body }), 'pending', now]);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM suggestions WHERE kind IN ('memo_project','memo_cluster') AND status IN ('auto','pending')"),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO suggestions (id, kind, subject, target, score, detail, status, created_at) VALUES', 8, rows),
  ]);
  return { memoProject: n, memoClusters: groups.length };
}

/** メモを保存する。保存したらすぐ埋め込みを作り、企画の候補を返す */
export async function saveMemo(env: Env, input: { body?: unknown; heading?: unknown; kind?: unknown; project?: unknown; ref?: unknown }, source: 'ai' | 'human') {
  const body = clean(input.body, 2000);
  if (!body) throw new Error('メモの本文が空です');
  let heading = clean(input.heading, 40) || null;
  let text = body;
  if (!heading) { const h = body.match(/^\s*([^：:\n]{1,20})[：:]\s*(.+)$/s); if (h) { heading = h[1].trim(); text = h[2].trim(); } }
  const kind = (MEMO_KINDS as readonly string[]).includes(String(input.kind)) ? String(input.kind) : 'メモ';
  const projects = await listProjectsRaw(env);
  const pq = clean(input.project, 60);
  const proj = pq ? projects.find(p => p.key === pq || p.name === pq) ?? null : null;
  const m: MemoRow = { id: newId('m'), at: nowIso(), source, kind, heading, body: text, project: proj?.key ?? null, ref: clean(input.ref, 300) || null };
  await env.DB.prepare('INSERT INTO memos (id, at, source, kind, heading, body, project, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(m.id, m.at, m.source, m.kind, m.heading, m.body, m.project, m.ref).run();
  await upsertEmbeddings(env, [{ kind: 'memo', ref: m.id, text: memoText(m) }]);
  await computeMemoSuggestions(env);
  const { places } = await memoPlaces(env);
  const pl = places.get(m.id)!;
  return { memo: m, place: pl, projectName: pl.project ? projects.find(p => p.key === pl.project)?.name ?? null : null, unknownProject: pq && !proj ? pq : null };
}

/** 企画を作る・直す。AI が作るときは「候補」にする */
export async function upsertProject(env: Env, input: { key?: unknown; name?: unknown; note?: unknown; parent?: unknown; status?: unknown }, by: 'ai' | 'human') {
  const projects = await listProjectsRaw(env);
  const key = clean(input.key, 10);
  const cur = key ? projects.find(p => p.key === key) : undefined;
  if (key && !cur) throw new Error(`企画 ${key} が見つかりません`);
  if (cur && by === 'ai') throw new Error('AI からは既存の企画を書き換えられません');
  const name = clean(input.name, 60) || cur?.name;
  if (!name) throw new Error('企画の名前が必要です');
  const note = input.note !== undefined ? clean(input.note, 600) : cur?.note ?? '';
  const pp = clean(input.parent, 60);
  const parent = input.parent === undefined ? cur?.parent ?? null : pp ? projects.find(p => p.key === pp || p.name === pp)?.key ?? null : null;
  let status = by === 'ai' ? '候補' : (PROJECT_STATUSES as readonly string[]).includes(String(input.status)) ? String(input.status) : cur?.status ?? '進行中';
  if (cur) {
    await env.DB.prepare('UPDATE projects SET name = ?, note = ?, parent = ?, status = ? WHERE key = ?').bind(name, note, parent, status, cur.key).run();
    if (status !== cur.status) await event(env, 'project_status', cur.key, status);
  } else {
    if (projects.some(p => p.name === name)) throw new Error(`「${name}」という企画はもうあります`);
    const max = projects.reduce((a, p) => Math.max(a, Number(p.key.slice(1)) || 0), 0);
    const k = 'P' + String(max + 1).padStart(2, '0');
    await env.DB.prepare('INSERT INTO projects (key, name, note, parent, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(k, name, note, parent, status, nowIso(), by).run();
    await event(env, 'project_create', k, JSON.stringify({ name, by }));
    input.key = k;
  }
  const k = String(input.key || cur!.key);
  await upsertEmbeddings(env, [{ kind: 'project', ref: k, text: projectText({ name, note }) }]);
  await computeMemoSuggestions(env);
  return (await listProjectsRaw(env)).find(p => p.key === k)!;
}

async function event(env: Env, kind: string, subject: string, value: string) {
  await env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(newId('ev'), nowIso(), kind, subject, value, 'human', null).run();
}

/** 人がメモの企画を決める（承認として記録し、手本になる）。project=null なら「どこにも入れない」 */
export async function assignMemo(env: Env, memoId: string, project: string | null) {
  if (!(await env.DB.prepare('SELECT id FROM memos WHERE id = ?').bind(memoId).first())) throw new Error('メモが見つかりません');
  if (project && !(await env.DB.prepare('SELECT key FROM projects WHERE key = ?').bind(project).first())) throw new Error(`企画 ${project} が見つかりません`);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO suggestions (id, kind, subject, target, score, detail, status, created_at, decided_at) VALUES (?, 'memo_project', ?, ?, 1, '{}', ?, ?, ?)
      ON CONFLICT(kind, subject) DO UPDATE SET target = excluded.target, status = excluded.status, decided_at = excluded.decided_at`)
      .bind(`s_mp_${memoId}`, memoId, project, project ? 'accepted' : 'rejected', now, now),
    env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(newId('ev'), now, 'memo_assign', memoId, project, 'human', null),
  ]);
}

/** AI が企画を指定したメモを、企画ごとにまとめて承認する */
export async function approveAiMemos(env: Env, project: string) {
  const { memos, places } = await memoPlaces(env);
  const ids = memos.filter(m => { const p = places.get(m.id)!; return p.how === 'ai' && p.project === project; }).map(m => m.id);
  for (const id of ids) await assignMemo(env, id, project);
  return ids.length;
}

const day = (iso: string) => new Date(Date.parse(iso) + 9 * 36e5).toISOString().slice(0, 10);
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : null);

/** 企画の一覧（状態・件数・最後に動いた日・止まっている日数） */
export async function projectSummaries(env: Env) {
  const projects = await listProjectsRaw(env);
  const { memos, places } = await memoPlaces(env);
  return projects.map(p => {
    const ms = memos.filter(m => places.get(m.id)!.project === p.key);
    const last = ms.length ? ms[ms.length - 1].at : null;
    const decided = ms.filter(m => m.kind === '決定').length, open = ms.filter(m => m.kind === '保留' || m.kind === '疑問').length;
    const quiet = daysSince(last ?? p.created_at)!;
    const state = CLOSED.has(p.status) ? p.status : p.status === '候補' ? '候補' : quiet >= 14 ? '止まっている' : quiet <= 3 ? '動いている' : 'ゆっくり';
    return { ...p, memos: ms.length, decided, open, lastAt: last, quietDays: quiet, state, children: projects.filter(c => c.parent === p.key).map(c => c.key) };
  });
}

/** 1つの企画の流れ（AI が会話の前に読む用） */
export async function projectFlow(env: Env, key: string, limit = 30) {
  const all = await projectSummaries(env);
  const p = all.find(x => x.key === key || x.name === key);
  if (!p) throw new Error(`企画「${key}」が見つかりません`);
  const { memos, places } = await memoPlaces(env);
  const ms = memos.filter(m => places.get(m.id)!.project === p.key);
  return {
    project: p,
    parent: p.parent ? all.find(x => x.key === p.parent) ?? null : null,
    children: all.filter(x => x.parent === p.key),
    memos: ms.slice(-limit).map(m => ({ ...m, day: day(m.at), how: places.get(m.id)!.how })),
    openItems: ms.filter(m => m.kind === '保留' || m.kind === '疑問').slice(-10).map(m => ({ id: m.id, day: day(m.at), kind: m.kind, heading: m.heading, body: m.body })),
  };
}

/** 意味の近いメモを探す */
export async function searchMemos(env: Env, query: string, limit = 8) {
  const q = clean(query, 300);
  if (!q) return [];
  const [v] = await embedMany(env, [q]);
  const mv = await loadVectors(env, 'memo');
  const { memos, places } = await memoPlaces(env);
  const projects = new Map((await listProjectsRaw(env)).map(p => [p.key, p.name]));
  return memos.map(m => ({ m, s: mv.has(m.id) ? dot(v, mv.get(m.id)!) : -1 }))
    .sort((a, b) => b.s - a.s).slice(0, Math.min(20, Math.max(1, limit)))
    .map(({ m, s }) => { const pl = places.get(m.id)!; return { id: m.id, day: day(m.at), kind: m.kind, heading: m.heading, body: m.body, project: pl.project, projectName: pl.project ? projects.get(pl.project) ?? null : null, score: Math.round(s * 100) / 100 }; });
}

/** 画面用：企画とメモをまとめて */
export async function memoMap(env: Env) {
  const projects = await projectSummaries(env);
  const { memos, places } = await memoPlaces(env);
  return {
    projects,
    memos: memos.map(m => { const pl = places.get(m.id)!; return { id: m.id, d: day(m.at), at: m.at, src: m.source, k: m.kind, hd: m.heading, b: m.body, p: pl.project, h: pl.how, sc: pl.score, sg: pl.suggestion ?? null, ref: m.ref }; }),
    autoOff: AUTO_OFF,
  };
}

export type { Vote };
