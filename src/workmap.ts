// 地図：機能の一覧（カタログ）と、マージした PR（変えたファイル）・Issue から、
// 機能ごとの稼働・状態・使うデータ・関係する Issue を自動で作る。読むだけで、リポジトリには書かない。
import type { Env } from './types.ts';
import { gh, ghHeaders, REPO_RE } from './gh.ts';
import { jstDay, nowIso } from './util.ts';
import { CATALOGS } from './catalogs.ts';

/** fallback：見た目・文書・テストのように、ほかの機能の作業にもついてくるもの。ほかに当たらないときだけ数える */
export interface Feature { id: string; group: string; name: string; desc: string; files: string[]; data: string[]; aliases: string[]; fallback?: boolean }
export interface Catalog {
  features: Feature[];
  nodes: Record<string, { col: number; name: string; note: string }>;
  /** 本文に「機能：」が無い Issue を人が結び付けたもの */
  issues: Record<string, { features: string[]; nodes: string[] }>;
  /** 題の言葉からの割り振り（[正規表現, 機能の id]） */
  words: [string, string[]][];
  /** 機能の中の話題（作品ごとなど）。タグか、題に words のどれかがあれば、その話題に入る */
  topics?: { name: string; feature: string; words: string[] }[];
}
export const catalogOf = (repo: string): Catalog | null => CATALOGS[repo] ?? null;

type Pr = { number: number; title: string; url: string; merged_at: string; files: string[]; body: string; closes: number[] };
type Issue = { number: number; open: number; title: string; body: string; created: string; updated: string; closed: string | null; refs: string; parent?: number | null };

/** 変えたファイルから機能を決める（その機能の files のどれかに当たれば、その機能の作業） */
export function featuresOfFiles(cat: Catalog, files: string[]) {
  const hit = (f: Feature) => f.files.some(rx => { const re = new RegExp(rx); return files.some(p => re.test(p)); });
  const main = cat.features.filter(f => !f.fallback && hit(f));
  return (main.length ? main : cat.features.filter(f => f.fallback && hit(f))).map(f => f.id);
}

/**
 * Issue を機能とデータに結び付ける。強い順に：
 * 本文の「機能：」の行 → 人が結び付けたもの → 題の頭（「満月の物語：…」）→ 題の言葉
 */
/** 本文の「タグ：コールドムーン、絵本」を読む（@ や # は付けても付けなくてもよい） */
export function tagsOf(body: string): string[] {
  const m = body.match(/^\s*(?:[-*]\s*)?\**タグ\**\s*[:：]\s*(.+)$/m);
  if (!m) return [];
  return [...new Set(m[1].split(/[、,，\s]+/).map(w => w.replace(/^[@＠#＃]/, '').trim()).filter(w => w && !/^\d+$/.test(w)))];
}
/**
 * タグを機能と話題に分ける。
 * - カタログの話題（topics）の名前なら、その話題（＋その話題の機能）。例：コールドムーン → 話題「コールドムーン」＋満月の物語
 * - 機能の名前・別名・id なら、その機能
 * - それ以外は、自由な話題
 * 別名（題の頭の照合に使う）と、話題（入り口）は別に持つので、作品ごとのタグが機能名に吸い込まれない
 */
export function splitTags(cat: Catalog, tags: string[]) {
  const fid = (w: string) => cat.features.find(f => f.id === w || f.name === w || f.name.replace(/（.*）/, '') === w || f.aliases.includes(w))?.id;
  const features: string[] = [], topics: string[] = [];
  const addF = (id: string) => { if (!features.includes(id)) features.push(id); };
  for (const t of tags) {
    const tp = cat.topics?.find(x => x.name === t || x.words.includes(t));
    if (tp) { if (!topics.includes(tp.name)) topics.push(tp.name); addF(tp.feature); continue; }
    const id = fid(t); if (id) addF(id); else if (!topics.includes(t)) topics.push(t);
  }
  return { features, topics };
}
/** 題（とタグ）から入る話題：タグの話題＋カタログの話題の言葉が題にあるもの */
export function topicsOf(cat: Catalog, title: string, body: string) {
  const out = splitTags(cat, tagsOf(body)).topics;
  for (const tp of cat.topics ?? []) if (!out.includes(tp.name) && tp.words.some(w => title.includes(w))) out.push(tp.name);
  return out;
}

export function linkIssue(cat: Catalog, i: { number: number; title: string; body: string }): { features: string[]; nodes: string[]; how: string } {
  // タグの機能は、ほかの決め方に足す（複数の入り口）
  const base = linkIssueBase(cat, i), extra = splitTags(cat, tagsOf(i.body)).features.filter(id => !base.features.includes(id));
  return extra.length ? { ...base, features: [...base.features, ...extra], how: base.how ? `${base.how}＋タグ` : '本文の「タグ：」' } : base;
}
function linkIssueBase(cat: Catalog, i: { number: number; title: string; body: string }): { features: string[]; nodes: string[]; how: string } {
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

/** 計測（#44）：GitHub へ問い合わせた回数。同じ isolate で同時に走った分が混ざることがある（目安） */
let gqlCalls = 0;
async function graphql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<T> {
  gqlCalls++;
  let last = 'GitHub を読む鍵（GITHUB_TOKEN）がありません';
  for (const token of [env.GITHUB_TOKEN, env.GITHUB_WRITE_TOKEN].filter((t, k, a) => t && a.indexOf(t) === k) as string[]) {
    const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...ghHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const j = await res.json().catch(() => ({})) as { data?: T; errors?: { message: string }[] };
    if (res.ok && j.data && !j.errors) return j.data;
    last = j.errors?.[0]?.message ?? String(res.status);
  }
  throw new Error('GitHub（GraphQL）: ' + last);
}

const PR_Q = `query($o:String!,$n:String!,$after:String,$dir:OrderDirection!,$field:IssueOrderField!,$first:Int!){repository(owner:$o,name:$n){pullRequests(states:MERGED,first:$first,after:$after,orderBy:{field:$field,direction:$dir}){pageInfo{hasNextPage endCursor} nodes{number title url mergedAt updatedAt body files(first:100){nodes{path}} closingIssuesReferences(first:10){nodes{number}}}}}}`;
type PrPage = { repository: { pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { number: number; title: string; url: string; mergedAt: string; updatedAt?: string; body: string; files: { nodes: { path: string }[] } | null; closingIssuesReferences?: { nodes: { number: number }[] } | null }[] } } };

type SyncRow = { pr_cursor: string | null; pr_done: number; prs_at: string | null; issues_at: string | null; issues_more?: number; issues_full_at?: string | null; sync_id: string | null; sync_until: string | null; upd_cursor: string | null; upd_boundary: string | null; upd_started: string | null };

/**
 * 取り込み。2つを分けて行う（画面もコネクタも同じ関数を呼ぶ）。
 * - backfill（さかのぼり）：PR を古い順に50件ずつ、pages ページ。続きの位置（pr_cursor）を覚える。Issue は読まない
 * - update（新しく動いたもの）：PR を新しく動いた順に、前回の最終成功時刻（境界）より前のものに届くまで（1回4ページ）。
 *   届かなかったら続きの位置と境界を保ち、次の update で続きから読む。届いた時点で最終成功時刻を進める。Issue も読み直す
 * 重なったら：D1 のロック（sync_id、2分で期限切れ）を取れなかった方は何もしない（busy）。
 * 書き込みはすべて「ロックがまだ自分のものなら」の条件つきなので、期限切れのあとで遅れて書こうとした古い処理は何も書けない
 */
export async function syncMap(env: Env, repo: string, opt: { mode?: 'update' | 'backfill'; pages?: number } | number = {}) {
  if (!REPO_RE.test(repo)) throw new Error('リポジトリの名前が正しくありません');
  const o2 = typeof opt === 'number' ? { mode: 'backfill' as const, pages: opt } : opt;
  const mode = o2.mode ?? 'update', pages = o2.pages ?? 4, t0 = Date.now(), c0 = gqlCalls;
  const [o, n] = repo.split('/');
  const now = nowIso(), id = crypto.randomUUID(), until = new Date(Date.now() + 120_000).toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO map_sync (repo, pr_done) VALUES (?, 0)').bind(repo).run();
  await env.DB.prepare('UPDATE map_sync SET sync_id = ?, sync_until = ? WHERE repo = ? AND (sync_id IS NULL OR sync_until < ?)').bind(id, until, repo, now).run();
  const st = await env.DB.prepare('SELECT * FROM map_sync WHERE repo = ?').bind(repo).first<SyncRow>();
  if (st?.sync_id !== id) return { mode, busy: true, backfilled: 0, updated: 0, issues: 0, backfillDone: !!st?.pr_done, caughtUp: false, issuesMore: false, issuesFull: false, calls: 0, ms: Date.now() - t0 };
  const mine = 'EXISTS (SELECT 1 FROM map_sync WHERE repo = ? AND sync_id = ?)';
  const save = (nodes: PrPage['repository']['pullRequests']['nodes']) => nodes.map(p => env.DB.prepare(
    `INSERT INTO pr_activity (repo, number, title, url, merged_at, body, files, fetched_at, closes, digest) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${mine}
     ON CONFLICT(repo, number) DO UPDATE SET title = excluded.title, body = excluded.body, files = excluded.files, fetched_at = excluded.fetched_at, closes = excluded.closes, digest = excluded.digest`)
    .bind(repo, p.number, p.title, p.url, p.mergedAt, p.body ?? '', JSON.stringify((p.files?.nodes ?? []).map(f => f.path)), now, JSON.stringify((p.closingIssuesReferences?.nodes ?? []).map(x => x.number)), prDigest(p.body ?? ''), repo, id));
  const stmts: D1PreparedStatement[] = [];
  const res = { mode, busy: false, backfilled: 0, updated: 0, issues: 0, backfillDone: !!st.pr_done, caughtUp: false, issuesMore: false, issuesFull: false, calls: 0, ms: 0 };
  try {
    if (mode === 'backfill') {
      let cursor = st.pr_cursor, done = !!st.pr_done;
      for (let k = 0; k < pages && !done; k++) {
        const pr = (await graphql<PrPage>(env, PR_Q, { o, n, after: cursor, dir: 'ASC', field: 'CREATED_AT', first: 50 })).repository.pullRequests;
        stmts.push(...save(pr.nodes)); res.backfilled += pr.nodes.length;
        if (pr.pageInfo.endCursor) cursor = pr.pageInfo.endCursor;
        if (!pr.pageInfo.hasNextPage) done = true;
      }
      res.backfillDone = done;
      stmts.push(env.DB.prepare(`UPDATE map_sync SET pr_cursor = ?, pr_done = ? WHERE repo = ? AND sync_id = ?`).bind(cursor, done ? 1 : 0, repo, id));
    } else {
      const boundary = st.upd_boundary ?? st.prs_at, started = st.upd_started ?? now;
      let after = st.upd_cursor, caught = false;
      for (let k = 0; k < 4; k++) {
        // 続きからでなければ、1ページ目は10件だけ（ふだんは動いた PR が少なく、これで境界に届く。#44：更新0件でも50件読んでいたのが重さの大半）
        const first = k === 0 && !after && boundary ? 10 : 50;
        const rp = (await graphql<PrPage>(env, PR_Q, { o, n, after, dir: 'DESC', field: 'UPDATED_AT', first })).repository.pullRequests;
        // 数えるのは前回の境界より新しく動いたものだけ（ページの残りは、もう持っている分）
        stmts.push(...save(rp.nodes)); res.updated += rp.nodes.filter(p => !boundary || (p.updatedAt ?? '') >= boundary).length;
        if (!boundary || rp.nodes.some(p => (p.updatedAt ?? '') < boundary) || !rp.pageInfo.hasNextPage) { caught = true; break; }
        after = rp.pageInfo.endCursor;
      }
      res.caughtUp = caught;
      stmts.push(caught
        ? env.DB.prepare('UPDATE map_sync SET prs_at = ?, upd_cursor = NULL, upd_boundary = NULL, upd_started = NULL WHERE repo = ? AND sync_id = ?').bind(started, repo, id)
        : env.DB.prepare('UPDATE map_sync SET upd_cursor = ?, upd_boundary = ?, upd_started = ? WHERE repo = ? AND sync_id = ?').bind(after, boundary, started, repo, id));
      // Issue だけを（PR を混ぜずに）100件ずつ、10ページまで。GitHub の親子（サブ Issue）の親も読む
      // ふだんは前回の読み始めより後に動いた Issue だけ（#44：更新0件でも全部読み直すのが重さの大半だった）。
      // 前回が途中（1000件で止めた）か、全部読み直してから1日たったら、全部（消えた・移った Issue に気づくため）
      const full = !st.issues_at || !!st.issues_more || !st.issues_full_at || Date.parse(now) - Date.parse(st.issues_full_at) > 864e5;
      const since = full ? null : new Date(Date.parse(st.issues_at!) - 5 * 60e3).toISOString(); // 時計のずれに5分の余裕
      const issues = await readIssues(env, o, n, since);
      for (const i of issues.list)
        stmts.push(env.DB.prepare(`INSERT OR REPLACE INTO map_issues (repo, number, open, title, body, created, updated, closed, refs, parent) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${mine}`)
          .bind(repo, i.number, i.state === 'OPEN' ? 1 : 0, i.title, (i.body ?? '').slice(0, 4000), i.createdAt, i.updatedAt, i.closedAt, JSON.stringify(refLines(i.body ?? '')), i.parent?.number ?? null, repo, id));
      stmts.push(full
        ? env.DB.prepare('UPDATE map_sync SET issues_at = ?, issues_more = ?, issues_full_at = ? WHERE repo = ? AND sync_id = ?').bind(now, issues.more ? 1 : 0, now, repo, id)
        : env.DB.prepare('UPDATE map_sync SET issues_at = ?, issues_more = ? WHERE repo = ? AND sync_id = ?').bind(now, issues.more ? 1 : 0, repo, id));
      res.issues = issues.list.length; res.issuesMore = issues.more; res.issuesFull = full;
    }
    // 書き込みは1回の batch に（途中で失敗したら全部取り消し）。最後にロックを外す
    stmts.push(env.DB.prepare('UPDATE map_sync SET sync_id = NULL, sync_until = NULL WHERE repo = ? AND sync_id = ?').bind(repo, id));
    // D1 の batch は大きすぎると断られるので100件ずつ。どの文もロックの条件つきなので、分けても古い処理は書けない
    for (let k = 0; k < stmts.length; k += 100) await env.DB.batch(stmts.slice(k, k + 100));
  } catch (e) {
    await env.DB.prepare('UPDATE map_sync SET sync_id = NULL, sync_until = NULL WHERE repo = ? AND sync_id = ?').bind(repo, id).run();
    throw e;
  }
  res.calls = gqlCalls - c0; res.ms = Date.now() - t0; // 計測（#44）。Workers の時計は外とのやり取りで進むので、待ち時間の目安
  return res;
}

type IssueNode = { number: number; state: string; title: string; body: string | null; createdAt: string; updatedAt: string; closedAt: string | null; parent?: { number: number } | null };
const ISSUE_Q = (withParent: boolean) => `query($o:String!,$n:String!,$after:String,$since:DateTime){repository(owner:$o,name:$n){issues(first:100,after:$after,orderBy:{field:CREATED_AT,direction:ASC},filterBy:{since:$since}){pageInfo{hasNextPage endCursor} nodes{number state title body createdAt updatedAt closedAt${withParent ? ' parent{number}' : ''}}}}}`;
/** Issue を読む（since があれば、その後に動いたものだけ。10ページ＝1000件まで。続きがあれば more）。親子の項目が使えない GitHub なら、親なしで読み直す */
async function readIssues(env: Env, o: string, n: string, since: string | null = null) {
  for (const withParent of [true, false]) {
    try {
      const list: IssueNode[] = []; let after: string | null = null, more = false;
      for (let k = 0; k < 10; k++) {
        type Pg = { repository: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: IssueNode[] } } };
        const d: Pg = await graphql<Pg>(env, ISSUE_Q(withParent), { o, n, after, since });
        list.push(...d.repository.issues.nodes);
        more = d.repository.issues.pageInfo.hasNextPage; after = d.repository.issues.pageInfo.endCursor;
        if (!more) break;
      }
      return { list, more };
    } catch (e) { if (!withParent) throw e; }
  }
  return { list: [], more: false };
}

const REF_RE = /(?<![\w/&])#(\d+)\b/g;
/** 文の中の「#番号」と、それが書かれた行（根拠として見せる。長い行は前後を切る） */
export function refLines(text: string): { n: number; line: string }[] {
  const out: { n: number; line: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    for (const m of raw.matchAll(REF_RE)) {
      const n = Number(m[1]); if (out.some(x => x.n === n)) continue;
      const at = m.index ?? 0, line = raw.trim();
      out.push({ n, line: line.length <= 90 ? line : (at > 40 ? '…' : '') + raw.slice(Math.max(0, at - 40), at + 50).trim() + '…' });
    }
  }
  return out;
}
/** 引き継ぎ（親子）の言い方：「#299 P2」「#142 の続き」「#86 の残り」「#189 から」 */
const HANDOFF = (n: number) => new RegExp(`#${n}\\s*(の)?\\s*(P\\d|続き|残り|引き継|から分け|の一部)`);

export type Link = { kind: 'closes' | 'ref' | 'parent' | 'child' | 'from' | 'to' | 'candidate'; type: 'pr' | 'issue'; n: number; title: string; day: string; url: string; open?: boolean; evidence: string[] };

/**
 * Issue のつながり（根拠つき）。
 * - closes：その PR で閉じた（GitHub の closingIssuesReferences）
 * - ref：PR の題・説明か、Issue の本文に「#番号」がある（明示）
 * - parent／child：GitHub の親子（サブ Issue）。いちばん確か
 * - from／to（引き継ぎ元・先）：題か本文に「#299 P2」「#142 の続き」のような引き継ぎの言い方がある（本文からの推定）
 * - candidate（推測）：開いている Issue と同じ機能のファイルを、その Issue が開いていた間に変えた PR。
 *   ほかの Issue を番号で指している PR・「関連：なし」と書いた PR・見た目・文書・テストだけの PR は出さない。
 *   Issue を立てた時刻より後にマージしたもの（日付ではなく時刻で比べる）。新しいもの5件まで
 */
export function issueLinks(repo: string, issues: { number: number; open: boolean; title: string; created: string; closed: string | null; features: string[]; refs: { n: number; line: string }[]; parent?: number | null }[],
  prs: (Pr & { features: string[] })[]) {
  const iss = new Map(issues.map(i => [i.number, i])), pr = new Map(prs.map(p => [p.number, p]));
  const out = new Map<number, Link[]>(issues.map(i => [i.number, []]));
  const add = (to: number, l: Link) => { const L = out.get(to)!; const same = L.find(x => x.type === l.type && x.n === l.n && (x.kind === l.kind || (x.kind === 'closes' && l.kind === 'ref')));
    if (same) { for (const e of l.evidence) if (!same.evidence.includes(e)) same.evidence.push(e); } else L.push(l); };
  const prLink = (p: Pr, kind: Link['kind'], ev: string): Link => ({ kind, type: 'pr', n: p.number, title: p.title, day: jstDay(p.merged_at), url: p.url, evidence: [ev] });
  const isLink = (i: { number: number; title: string; created: string; closed: string | null; open: boolean }, kind: Link['kind'], ev: string): Link =>
    ({ kind, type: 'issue', n: i.number, title: i.title, day: jstDay(i.created), url: `https://github.com/${repo}/issues/${i.number}`, open: i.open, evidence: [ev] });
  const explicit = new Set<number>(); // どこかの Issue を番号で指している PR
  for (const p of prs) {
    for (const n of p.closes) if (iss.has(n)) { add(n, prLink(p, 'closes', `PR #${p.number} がこの Issue を閉じた`)); explicit.add(p.number); }
    for (const { n, line } of [...refLines(p.title).map(x => ({ ...x, line: `題：${x.line}` })), ...refLines(p.body).map(x => ({ ...x, line: `説明：${x.line}` }))]) {
      if (!iss.has(n) || n === p.number) continue;
      add(n, prLink(p, 'ref', `PR #${p.number} の${line}`)); explicit.add(p.number);
    }
  }
  for (const i of issues) {
    const pa = i.parent != null ? iss.get(i.parent) : undefined;
    if (pa) { add(i.number, isLink(pa, 'parent', `GitHub の親子：#${pa.number} のサブ Issue`)); add(pa.number, isLink(i, 'child', `GitHub の親子：#${i.number} がサブ Issue`)); }
  }
  for (const i of issues) {
    const titleRefs = refLines(i.title).map(x => ({ ...x, line: `題：${x.line}` })), bodyRefs = i.refs.map(x => ({ ...x, line: `本文：${x.line}` }));
    for (const { n, line } of [...titleRefs, ...bodyRefs]) {
      if (n === i.number) continue;
      const p = pr.get(n);
      if (p) { add(i.number, prLink(p, 'ref', `Issue #${i.number} の${line}`)); explicit.add(p.number); continue; }
      const j = iss.get(n); if (!j) continue;
      const handoff = HANDOFF(n).test(line);
      // GitHub の親子があるなら、本文の言い方は根拠として足すだけ（種類は親子のまま）
      const official = out.get(i.number)!.some(l => l.type === 'issue' && l.n === n && (l.kind === 'parent' || l.kind === 'child'));
      if (official) { const L1 = out.get(i.number)!.find(l => l.type === 'issue' && l.n === n)!, L2 = out.get(n)!.find(l => l.type === 'issue' && l.n === i.number)!; for (const L of [L1, L2]) if (L) L.evidence.push(`Issue #${i.number} の${line}`); continue; }
      add(i.number, isLink(j, handoff ? 'from' : 'ref', `Issue #${i.number} の${line}`));
      add(n, isLink(i, handoff ? 'to' : 'ref', `Issue #${i.number} の${line}`));
    }
  }
  for (const i of issues) {
    if (!i.open || !i.features.length) continue;
    const linked = new Set(out.get(i.number)!.filter(l => l.type === 'pr').map(l => l.n));
    const cands = prs.filter(p => !linked.has(p.number) && !explicit.has(p.number) && !/関連\s*[:：]\s*なし/.test(p.body) && p.merged_at >= i.created && p.features.some(f => i.features.includes(f)))
      .sort((a, b) => b.merged_at.localeCompare(a.merged_at)).slice(0, 5);
    for (const p of cands) {
      // 根拠には、この Issue の機能に当たったファイルだけを出す（PR のほかのファイルは関係ない）
      const cat = catalogOf(repo), hitF = cat ? p.files.filter(f => featuresOfFiles(cat, [f]).some(id => i.features.includes(id))) : p.files, show = hitF.length ? hitF : p.files;
      add(i.number, prLink(p, 'candidate', `この Issue と同じ機能のファイルを変えた（${show.slice(0, 3).join('、')}${show.length > 3 ? ` ほか${show.length - 3}件` : ''}）。番号でのつながりは無い`));
    }
  }
  for (const L of out.values()) { const O = ['parent', 'child', 'from', 'to', 'closes', 'ref', 'candidate']; L.sort((a, b) => O.indexOf(a.kind) - O.indexOf(b.kind) || a.day.localeCompare(b.day)); }
  return out;
}

/** PR の説明から申告を読む（CLAUDE.md で書き方を決めている3つの見出し。無ければ null） */
export function parseReport(body: string) {
  const sec = { read: [] as string[], own: [] as string[], lack: [] as string[] };
  const KEYS: [keyof typeof sec, RegExp][] = [['read', /確かめた決まり/], ['own', /自分で判断/], ['lack', /足りなかった決まり/]];
  let cur: keyof typeof sec | null = null;
  const found = new Set<keyof typeof sec>();
  let fence = false;
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    // コードブロック（``` や ~~~ で囲んだ所）の中は読まない。書き方の見本を貼っただけで合格にしない
    if (/^(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const head = line.match(/^(#{1,6}\s+|\*\*)(.+?)(\*\*)?[:：]?$/);
    if (head) { const k = KEYS.find(([, re]) => re.test(head[2])); cur = k ? k[0] : null; if (k) found.add(k[0]); continue; }
    if (!cur) continue;
    if (/^([-*_])\1{2,}$/.test(line)) { cur = null; continue; } // 区切り線（---）で見出しの中身は終わり
    const it = line.match(/^[-*・]\s*(.+)$/);
    if (it && !/^(なし|特になし|無し)[。．]?$/.test(it[1].trim())) sec[cur].push(it[1].trim());
  }
  return found.size ? { ...sec, found: [...found], complete: found.size === 3 } : null;
}
/**
 * PR の説明から、地図が使う行だけを残す（#44：地図のたびに全 PR の説明の全文を読むのが重さの大半だった）。
 * 残すもの：番号（#n）の行・タグ・「関連：」・「機能：」・見出し・区切り線・コードブロックの囲み・申告の見出しの下の箇条書き。
 * 地図が説明から読むもの（つながる番号・引き継ぎ・タグ・「関連：なし」・申告）は、全文から読んだときと同じになる（テストで確かめる）
 */
export function prDigest(body: string): string {
  const out: string[] = [];
  let fence = false, inReport = false;
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { fence = !fence; out.push(raw); continue; }
    const keep = REF_RE.test(raw) || /タグ|関連|機能\**\s*[:：]/.test(raw); REF_RE.lastIndex = 0;
    if (fence) { if (keep) out.push(raw); continue; }
    const head = /^(#{1,6}\s+|\*\*)(.+?)(\*\*)?[:：]?$/.test(line);
    if (head) { inReport = /確かめた決まり|自分で判断|足りなかった決まり/.test(line); out.push(raw); continue; }
    if (/^([-*_])\1{2,}$/.test(line)) { inReport = false; out.push(raw); continue; }
    if (keep || (inReport && /^[-*・]\s*/.test(line))) out.push(raw);
  }
  return out.join('\n');
}
/** 申告の3つの見出しがすべてあるか（自己チェック・地図の守り具合・毎日の見直しで同じ判定を使う） */
export const reportComplete = (body: string) => !!parseReport(body)?.complete;

/**
 * 書き方の守り具合（その期間にマージした PR と、立てた Issue）。CLAUDE.md の「書き方」の決まりに合わせる。
 * - PR：題の頭が機能の名前か別名（「満月の物語：…」）／Issue を番号で書いている（閉じた・参照）／申告の3つの見出し
 * - Issue：本文に「機能：」の行／「閉じる条件：」の行
 */
export function writingCheck(cat: Catalog, prs: Pr[], issues: { number: number; title: string; body: string; created?: string }[], links: Map<number, Link[]>) {
  const names = new Set(cat.features.flatMap(f => [f.name, f.name.replace(/（.*）/, ''), ...f.aliases]));
  const titled = (t: string) => { const h = t.split(/[：:]/)[0].trim(); return h !== t.trim() && (names.has(h) || [...names].some(n => n && h.startsWith(n))); };
  const linkedPrs = new Set([...links.values()].flatMap(L => L.filter(l => l.type === 'pr' && l.kind !== 'candidate').map(l => l.n)));
  const noneSaid = (b: string) => /関連\s*[:：]\s*なし/.test(b); // 「関連：なし」と書いたものは守れている（書き忘れと分ける）
  const P = prs.map(p => ({ n: p.number, t: p.title, url: p.url, day: jstDay(p.merged_at), miss: [!titled(p.title) && '題の頭に機能名', !linkedPrs.has(p.number) && !noneSaid(p.body) && '関係する Issue の番号', !reportComplete(p.body) && '申告の3つの見出し'].filter(Boolean) as string[] }));
  const I = issues.map(i => ({ n: i.number, t: i.title, day: i.created ? jstDay(i.created) : '', miss: [!/^\s*(?:[-*]\s*)?\**機能\**\s*[:：]/m.test(i.body) && '本文の「機能：」', !/閉じる条件\s*[:：]/.test(i.body) && '本文の「閉じる条件：」'].filter(Boolean) as string[] }));
  const cnt = (xs: { miss: string[] }[], m: string) => xs.filter(x => !x.miss.includes(m)).length;
  return {
    prs: P.length, prTitle: cnt(P, '題の頭に機能名'), prLinked: cnt(P, '関係する Issue の番号'), prReport: cnt(P, '申告の3つの見出し'),
    issues: I.length, issueFeature: cnt(I, '本文の「機能：」'), issueClose: cnt(I, '本文の「閉じる条件：」'),
    misses: [...P.filter(x => x.miss.length).map(x => ({ type: 'pr' as const, ...x })), ...I.filter(x => x.miss.length).map(x => ({ type: 'issue' as const, url: '', ...x }))].slice(0, 30),
  };
}

const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/**
 * 地図の中身。span 日分（今日まで、日本時間）の稼働と、状態：
 * 直近4日に3件以上マージ（0）、直近7日にマージあり（1）、直近7日マージなし（2）
 */
export async function mapView(env: Env, repo: string, span = 21, today = jstDay(nowIso())) {
  const cat = catalogOf(repo);
  const sync = await env.DB.prepare('SELECT pr_done, issues_at, prs_at, reviewed_at, issues_more FROM map_sync WHERE repo = ?').bind(repo).first<{ pr_done: number; issues_at: string | null; prs_at: string | null; reviewed_at: string | null; issues_more: number }>();
  if (!cat) return { repo, catalog: false as const, sync };
  const days = Array.from({ length: span }, (_, k) => addDays(today, k - span + 1));
  // 説明は全文ではなく、要る行だけ（digest）を読む。digest の無い古い行だけ全文を読み、作って書き戻す（1回だけ）
  const raw = (await env.DB.prepare('SELECT number, title, url, merged_at, files, closes, digest, CASE WHEN digest IS NULL THEN body END AS body FROM pr_activity WHERE repo = ? ORDER BY merged_at DESC').bind(repo).all<Record<string, unknown>>()).results;
  const fill = raw.filter(r => r.digest == null).map(r => ({ n: Number(r.number), d: prDigest(String(r.body ?? '')) }));
  for (let k = 0; k < fill.length; k += 50) await env.DB.batch(fill.slice(k, k + 50).map(x => env.DB.prepare('UPDATE pr_activity SET digest = ? WHERE repo = ? AND number = ? AND digest IS NULL').bind(x.d, repo, x.n)));
  const dOf = new Map(fill.map(x => [x.n, x.d]));
  const prs: Pr[] = raw.map(r => ({ number: r.number, title: r.title, url: r.url, merged_at: r.merged_at, files: JSON.parse(String(r.files)), closes: JSON.parse(String(r.closes ?? '[]')), body: String(r.digest ?? dOf.get(Number(r.number)) ?? '') }) as Pr);
  const of = new Map(prs.map(p => { const byFile = featuresOfFiles(cat, p.files), byTag = splitTags(cat, tagsOf(p.body)).features; return [p.number, [...new Set([...byFile.filter(id => !(byTag.length && cat.features.find(f => f.id === id)?.fallback)), ...byTag])]]; }));
  const prTopics = new Map(prs.map(p => [p.number, topicsOf(cat, p.title, p.body)]));
  const idx = new Map(days.map((d, k) => [d, k]));
  const features = cat.features.map(f => {
    const mine = prs.filter(p => of.get(p.number)!.includes(f.id));
    const byDay: { n: number; t: string }[][] = days.map(() => []);
    for (const p of mine) { const k = idx.get(jstDay(p.merged_at)); if (k !== undefined) byDay[k].push({ n: p.number, t: p.title }); }
    const cnt = byDay.map(b => b.length), sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
    const since7 = sum(cnt.slice(-7)), last4 = sum(cnt.slice(-4));
    return { id: f.id, group: f.group, name: f.name, desc: f.desc, data: f.data, days: cnt, byDay, total: mine.length, span: sum(cnt),
      last: mine[0] ? jstDay(mine[0].merged_at) : null, recent: mine.slice(0, 4).map(p => ({ n: p.number, t: p.title, day: jstDay(p.merged_at), url: p.url, report: parseReport(p.body) })),
      state: since7 === 0 ? 2 : last4 >= 3 ? 0 : 1 };
  });
  const stOf = new Map(features.map(f => [f.id, f.state]));
  const old = addDays(today, -7);
  const rows = (await env.DB.prepare('SELECT * FROM map_issues WHERE repo = ? ORDER BY open DESC, updated DESC').bind(repo).all<Issue>()).results;
  const linked = rows.map(i => ({ i, l: linkIssue(cat, i) }));
  const links = issueLinks(repo, linked.map(({ i, l }) => ({ number: i.number, open: !!i.open, title: i.title, created: i.created, closed: i.closed, features: l.features.filter(id => !cat.features.find(f => f.id === id)?.fallback), refs: JSON.parse(i.refs || '[]'), parent: i.parent ?? null })),
    prs.map(p => ({ ...p, features: of.get(p.number)!.filter(id => !cat.features.find(f => f.id === id)?.fallback) })));
  const issues = linked.map(({ i, l }) => {
    const fs = l.features.filter(id => stOf.has(id));
    const stale = !!i.open && fs.length > 0 && fs.every(id => stOf.get(id) === 2) && jstDay(i.updated) < old;
    return { number: i.number, open: !!i.open, title: i.title, created: jstDay(i.created), updated: jstDay(i.updated), closed: i.closed ? jstDay(i.closed) : null, features: fs, nodes: l.nodes, how: l.how, stale, links: links.get(i.number) ?? [], topics: topicsOf(cat, i.title, i.body) };
  });
  const inSpan = prs.filter(p => idx.has(jstDay(p.merged_at)));
  const writing = writingCheck(cat, inSpan, rows.filter(i => idx.has(jstDay(i.created))), links);
  const unmatched = inSpan.filter(p => !of.get(p.number)!.length).map(p => ({ n: p.number, t: p.title, day: jstDay(p.merged_at), url: p.url, files: p.files.slice(0, 8) }));
  // 申告の「足りなかった決まり」（週の見直しで、決まりに足すか・一回限りかを分ける材料）
  const lacks = inSpan.flatMap(p => (parseReport(p.body)?.lack ?? []).map(t => ({ n: p.number, day: jstDay(p.merged_at), t })));
  // 話題（機能ではないタグ）：Issue と PR を束ねる、軽い入り口。最初に出た日が新しいものは、見直しで扱う
  const tp = new Map<string, { name: string; feature: string | null; issues: number[]; prs: { n: number; t: string; day: string; url: string }[]; first: string; last: string }>();
  const touch = (t: string, day: string) => { const x = tp.get(t) ?? { name: t, feature: cat.topics?.find(y => y.name === t)?.feature ?? null, issues: [], prs: [], first: day, last: day }; if (day < x.first) x.first = day; if (day > x.last) x.last = day; tp.set(t, x); return x; };
  for (const i of issues) for (const t of i.topics) touch(t, i.created).issues.push(i.number);
  for (const p of prs) for (const t of prTopics.get(p.number) ?? []) touch(t, jstDay(p.merged_at)).prs.push({ n: p.number, t: p.title, day: jstDay(p.merged_at), url: p.url });
  const topics = [...tp.values()].sort((a, b) => b.last.localeCompare(a.last));
  const prTopicList = Object.fromEntries([...prTopics].filter(([, t]) => t.length));
  return { repo, catalog: true as const, topics, prTopics: prTopicList, sync, today, days, features, nodes: cat.nodes, issues, unmatched, lacks, writing,
    counts: { prs: inSpan.length, building: features.filter(f => f.state === 0).length, settled: features.filter(f => f.state === 1).length, stopped: features.filter(f => f.state === 2).length,
      openIssues: issues.filter(i => i.open).length, stale: issues.filter(i => i.stale).length, unused: Object.values(cat.nodes).filter(nd => nd.note === '画面なし').length } };
}
