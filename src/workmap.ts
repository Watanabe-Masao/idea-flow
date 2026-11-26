// 地図：機能の一覧（カタログ）と、マージした PR（変えたファイル）・Issue から、
// 機能ごとの稼働・状態・使うデータ・関係する Issue を自動で作る。読むだけで、リポジトリには書かない。
import type { Env } from './types.ts';
import { gh, ghHeaders, REPO_RE } from './gh.ts';
import { jstDay, nowIso } from './util.ts';
import { CATALOGS } from './catalogs.ts';

export interface Feature { id: string; group: string; name: string; desc: string; files: string[]; data: string[]; aliases: string[] }
export interface Catalog {
  features: Feature[];
  nodes: Record<string, { col: number; name: string; note: string }>;
  /** 本文に「機能：」が無い Issue を人が結び付けたもの */
  issues: Record<string, { features: string[]; nodes: string[] }>;
  /** 題の言葉からの割り振り（[正規表現, 機能の id]） */
  words: [string, string[]][];
}
export const catalogOf = (repo: string): Catalog | null => CATALOGS[repo] ?? null;

type Pr = { number: number; title: string; url: string; merged_at: string; files: string[] };
type Issue = { number: number; open: number; title: string; body: string; created: string; updated: string; closed: string | null };

/** 変えたファイルから機能を決める（その機能の files のどれかに当たれば、その機能の作業） */
export function featuresOfFiles(cat: Catalog, files: string[]) {
  return cat.features.filter(f => f.files.some(rx => { const re = new RegExp(rx); return files.some(p => re.test(p)); })).map(f => f.id);
}

/**
 * Issue を機能とデータに結び付ける。強い順に：
 * 本文の「機能：」の行 → 人が結び付けたもの → 題の頭（「満月の物語：…」）→ 題の言葉
 */
export function linkIssue(cat: Catalog, i: { number: number; title: string; body: string }): { features: string[]; nodes: string[]; how: string } {
  const byName = (w: string) => cat.features.find(f => f.id === w || f.name === w || f.aliases.includes(w))?.id;
  const line = i.body.match(/^\s*(?:[-*]\s*)?\**機能\**\s*[:：]\s*(.+)$/m);
  if (line) {
    const ids = line[1].split(/[、,，\/・\s]+/).map(w => byName(w.trim())).filter((x): x is string => !!x);
    if (ids.length) return { features: [...new Set(ids)], nodes: [], how: '本文の「機能：」' };
  }
  const set = cat.issues[String(i.number)];
  if (set) return { ...set, how: '人が結び付けた' };
  const head = i.title.split(/[：:]/)[0].trim();
  if (head !== i.title) {
    const id = byName(head) ?? cat.features.find(f => f.aliases.some(a => head.startsWith(a)))?.id;
    if (id) return { features: [id], nodes: [], how: '題の頭' };
  }
  const ids: string[] = [];
  for (const [rx, fs] of cat.words) if (new RegExp(rx).test(i.title)) for (const f of fs) if (!ids.includes(f)) ids.push(f);
  return { features: ids, nodes: [], how: ids.length ? '題の言葉' : '' };
}

async function graphql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<T> {
  let last = 'GitHub を読む鍵（GITHUB_TOKEN）がありません';
  for (const token of [env.GITHUB_TOKEN, env.GITHUB_WRITE_TOKEN].filter((t, k, a) => t && a.indexOf(t) === k) as string[]) {
    const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...ghHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const j = await res.json().catch(() => ({})) as { data?: T; errors?: { message: string }[] };
    if (res.ok && j.data && !j.errors) return j.data;
    last = j.errors?.[0]?.message ?? String(res.status);
  }
  throw new Error('GitHub（GraphQL）: ' + last);
}

const PR_Q = `query($o:String!,$n:String!,$after:String,$dir:OrderDirection!,$field:IssueOrderField!){repository(owner:$o,name:$n){pullRequests(states:MERGED,first:50,after:$after,orderBy:{field:$field,direction:$dir}){pageInfo{hasNextPage endCursor} nodes{number title url mergedAt body files(first:100){nodes{path}}}}}}`;
type PrPage = { repository: { pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { number: number; title: string; url: string; mergedAt: string; body: string; files: { nodes: { path: string }[] } | null }[] } } };

/**
 * 取り込み。PR は古い順に50件ずつさかのぼり（続きの位置を覚える）、毎回いちばん新しく動いた50件も読む。
 * Issue は毎回すべて読み直す（閉じた・書き直したを拾うため）。1回の呼び出しで PR は pages ページまで。
 */
export async function syncMap(env: Env, repo: string, pages = 4) {
  if (!REPO_RE.test(repo)) throw new Error('リポジトリの名前が正しくありません');
  const [o, n] = repo.split('/');
  const st = await env.DB.prepare('SELECT * FROM map_sync WHERE repo = ?').bind(repo).first<{ pr_cursor: string | null; pr_done: number }>();
  let cursor = st?.pr_cursor ?? null, done = !!st?.pr_done, got = 0;
  const now = nowIso();
  const save = (nodes: PrPage['repository']['pullRequests']['nodes']) => nodes.map(p => env.DB.prepare(
    `INSERT INTO pr_activity (repo, number, title, url, merged_at, body, files, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(repo, number) DO UPDATE SET title = excluded.title, body = excluded.body, files = excluded.files, fetched_at = excluded.fetched_at`)
    .bind(repo, p.number, p.title, p.url, p.mergedAt, p.body ?? '', JSON.stringify((p.files?.nodes ?? []).map(f => f.path)), now));
  const stmts: D1PreparedStatement[] = [];
  for (let k = 0; k < pages && !done; k++) {
    const d = await graphql<PrPage>(env, PR_Q, { o, n, after: cursor, dir: 'ASC', field: 'CREATED_AT' });
    const pr = d.repository.pullRequests;
    stmts.push(...save(pr.nodes)); got += pr.nodes.length;
    if (pr.pageInfo.endCursor) cursor = pr.pageInfo.endCursor;
    if (!pr.pageInfo.hasNextPage) done = true;
  }
  const recent = await graphql<PrPage>(env, PR_Q, { o, n, after: null, dir: 'DESC', field: 'UPDATED_AT' });
  stmts.push(...save(recent.repository.pullRequests.nodes));
  // Issue（PR を除く）。100件ずつ、5ページまで
  const issues: { number: number; state: string; title: string; body: string | null; created_at: string; updated_at: string; closed_at: string | null; pull_request?: unknown }[] = [];
  for (let page = 1; page <= 5; page++) {
    const part = await gh<typeof issues>(env, `/repos/${repo}/issues?state=all&per_page=100&page=${page}`);
    issues.push(...part);
    if (part.length < 100) break;
  }
  for (const i of issues.filter(x => !x.pull_request))
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO map_issues (repo, number, open, title, body, created, updated, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(repo, i.number, i.state === 'open' ? 1 : 0, i.title, (i.body ?? '').slice(0, 4000), i.created_at, i.updated_at, i.closed_at));
  stmts.push(env.DB.prepare('INSERT INTO map_sync (repo, pr_cursor, pr_done, issues_at, prs_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(repo) DO UPDATE SET pr_cursor = excluded.pr_cursor, pr_done = excluded.pr_done, issues_at = excluded.issues_at, prs_at = excluded.prs_at')
    .bind(repo, cursor, done ? 1 : 0, now, now));
  for (let k = 0; k < stmts.length; k += 50) await env.DB.batch(stmts.slice(k, k + 50));
  return { prs: got, backfillDone: done, issues: issues.filter(x => !x.pull_request).length };
}

const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/**
 * 地図の中身。span 日分（今日まで、日本時間）の稼働と、状態：
 * 直近7日に作業なし＝止まっている（2）、直近4日に3件以上＝作っている（0）、それ以外＝落ち着いた（1）
 */
export async function mapView(env: Env, repo: string, span = 21, today = jstDay(nowIso())) {
  const cat = catalogOf(repo);
  const sync = await env.DB.prepare('SELECT pr_done, issues_at, prs_at FROM map_sync WHERE repo = ?').bind(repo).first<{ pr_done: number; issues_at: string | null; prs_at: string | null }>();
  if (!cat) return { repo, catalog: false, sync };
  const days = Array.from({ length: span }, (_, k) => addDays(today, k - span + 1));
  const prs: Pr[] = (await env.DB.prepare('SELECT number, title, url, merged_at, files FROM pr_activity WHERE repo = ? ORDER BY merged_at DESC').bind(repo).all<Pr & { files: string }>()).results
    .map(r => ({ ...r, files: JSON.parse(r.files as unknown as string) as string[] }));
  const of = new Map(prs.map(p => [p.number, featuresOfFiles(cat, p.files)]));
  const idx = new Map(days.map((d, k) => [d, k]));
  const features = cat.features.map(f => {
    const mine = prs.filter(p => of.get(p.number)!.includes(f.id));
    const byDay: { n: number; t: string }[][] = days.map(() => []);
    for (const p of mine) { const k = idx.get(jstDay(p.merged_at)); if (k !== undefined) byDay[k].push({ n: p.number, t: p.title }); }
    const cnt = byDay.map(b => b.length), sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    const since7 = sum(cnt.slice(-7)), last4 = sum(cnt.slice(-4));
    return { id: f.id, group: f.group, name: f.name, desc: f.desc, data: f.data, days: cnt, byDay, total: mine.length, span: sum(cnt),
      last: mine[0] ? jstDay(mine[0].merged_at) : null, recent: mine.slice(0, 4).map(p => ({ n: p.number, t: p.title, day: jstDay(p.merged_at), url: p.url })),
      state: since7 === 0 ? 2 : last4 >= 3 ? 0 : 1 };
  });
  const stOf = new Map(features.map(f => [f.id, f.state]));
  const old = addDays(today, -7);
  const issues = (await env.DB.prepare('SELECT * FROM map_issues WHERE repo = ? ORDER BY open DESC, updated DESC').bind(repo).all<Issue>()).results.map(i => {
    const l = linkIssue(cat, i);
    const fs = l.features.filter(id => stOf.has(id));
    const stale = !!i.open && fs.length > 0 && fs.every(id => stOf.get(id) === 2) && jstDay(i.updated) < old;
    return { number: i.number, open: !!i.open, title: i.title, updated: jstDay(i.updated), closed: i.closed ? jstDay(i.closed) : null, features: fs, nodes: l.nodes, how: l.how, stale };
  });
  const inSpan = prs.filter(p => idx.has(jstDay(p.merged_at)));
  const unmatched = inSpan.filter(p => !of.get(p.number)!.length).map(p => ({ n: p.number, t: p.title, day: jstDay(p.merged_at), url: p.url }));
  return { repo, catalog: true, sync, today, days, features, nodes: cat.nodes, issues, unmatched,
    counts: { prs: inSpan.length, building: features.filter(f => f.state === 0).length, settled: features.filter(f => f.state === 1).length, stopped: features.filter(f => f.state === 2).length,
      openIssues: issues.filter(i => i.open).length, stale: issues.filter(i => i.stale).length, unused: Object.values(cat.nodes).filter(nd => nd.note === '画面なし').length } };
}
