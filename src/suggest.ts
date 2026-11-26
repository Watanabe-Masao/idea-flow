import type { CommitRow, Env, IssueRow, Settings, SuggestionKind } from './types.ts';
import { loadVectors } from './embed.ts';
import { centroid, decide, dot, medoid, sweep, threshClusters, topK, type Vec } from './vec.ts';
import { bulkInsert, nowIso, sha256 } from './util.ts';

export async function loadSettings(env: Env): Promise<Settings> {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const m = Object.fromEntries(rows.results.map(r => [r.key, r.value]));
  const n = (k: string, d: number) => (m[k] !== undefined && m[k] !== '' ? Number(m[k]) : d);
  return {
    issue_auto: n('issue_auto', 0.8), issue_ask: n('issue_ask', 0.66),
    theme_auto: n('theme_auto', 0.72), theme_ask: n('theme_ask', 0.6),
    cluster_link: n('cluster_link', 0.7), cluster_min: n('cluster_min', 3),
    premise_min: n('premise_min', 0.7),
  };
}

const CLOSED_FOR_MATCH = new Set(['duplicate']);

/** コミットに書かれた番号から、課題を確定で引く（'#369' → 題名が '#369 …' の課題、'WAT-9' → その課題） */
export function numberLinks(commits: CommitRow[], issues: IssueRow[]): Map<string, string> {
  const byGh = new Map<number, string>();
  const ids = new Set(issues.map(i => i.id));
  for (const i of issues) if (i.gh_number != null && i.state_type !== 'duplicate') byGh.set(i.gh_number, i.id);
  const out = new Map<string, string>();
  for (const c of commits) {
    const refs = JSON.parse(c.refs) as string[];
    for (const r of refs) {
      const id = r.startsWith('#') ? byGh.get(Number(r.slice(1))) : ids.has(r) ? r : undefined;
      if (id) { out.set(c.sha, id); break; }
    }
  }
  return out;
}

type Manual = Map<string, { issue?: string | null; theme?: string | null }>;

async function manualAssignments(env: Env): Promise<Manual> {
  const rows = await env.DB.prepare("SELECT subject, value FROM events WHERE kind = 'assign' ORDER BY at").all<{ subject: string; value: string }>();
  const m: Manual = new Map();
  for (const r of rows.results) m.set(r.subject, JSON.parse(r.value));
  return m;
}

export type Assignment = { issue: string | null; theme: string | null; how: 'manual' | 'number' | 'accepted' | 'auto' | 'pending' | 'none'; score: number | null; suggestion?: string };

/** 各コミットがどこに属するかを、事実と判断の記録から計算する（保存はしない） */
export async function assignments(env: Env): Promise<{ map: Map<string, Assignment>; issues: IssueRow[]; commits: CommitRow[] }> {
  const issues = (await env.DB.prepare('SELECT * FROM issues').all<IssueRow>()).results;
  const commits = (await env.DB.prepare('SELECT * FROM commits WHERE is_merge = 0 ORDER BY committed_at').all<CommitRow>()).results;
  const themeOf = new Map(issues.map(i => [i.id, i.theme_key]));
  const nums = numberLinks(commits, issues);
  const manual = await manualAssignments(env);
  const sugg = (await env.DB.prepare("SELECT id, kind, subject, target, score, status FROM suggestions WHERE kind IN ('commit_issue','commit_theme') AND status <> 'rejected'")
    .all<{ id: string; kind: SuggestionKind; subject: string; target: string; score: number; status: string }>()).results;
  const bySubject = new Map<string, typeof sugg[number]>();
  for (const s of sugg) {
    const prev = bySubject.get(s.subject);
    if (!prev || (prev.kind === 'commit_theme' && s.kind === 'commit_issue')) bySubject.set(s.subject, s);
  }
  const map = new Map<string, Assignment>();
  for (const c of commits) {
    const man = manual.get(c.sha);
    if (man) {
      const issue = man.issue ?? null;
      map.set(c.sha, { issue, theme: issue ? themeOf.get(issue) ?? null : man.theme ?? null, how: 'manual', score: null });
      continue;
    }
    const n = nums.get(c.sha);
    if (n) { map.set(c.sha, { issue: n, theme: themeOf.get(n) ?? null, how: 'number', score: null }); continue; }
    const s = bySubject.get(c.sha);
    if (s) {
      const how = s.status === 'accepted' ? 'accepted' : s.status === 'auto' ? 'auto' : 'pending';
      if (s.kind === 'commit_issue') map.set(c.sha, { issue: s.target, theme: themeOf.get(s.target) ?? null, how, score: s.score, suggestion: s.id });
      else map.set(c.sha, { issue: null, theme: s.target, how, score: s.score, suggestion: s.id });
      continue;
    }
    map.set(c.sha, { issue: null, theme: null, how: 'none', score: null });
  }
  return { map, issues, commits };
}

// 人が決めていない提案は毎回消して作り直す。決めたもの（accepted / rejected）は UNIQUE(kind, subject) で守られ、上書きされない
const INSERT_HEAD = 'INSERT OR IGNORE INTO suggestions (id, kind, subject, target, score, detail, status, created_at) VALUES';

/** 提案を計算し直す。人が決めた（accepted / rejected）ものには触れない */
export async function computeSuggestions(env: Env) {
  const st = await loadSettings(env);
  const { issues, commits } = await assignments(env);
  const issueVecs = await loadVectors(env, 'issue');
  const commitVecs = await loadVectors(env, 'commit');
  const nums = numberLinks(commits, issues);
  const manual = await manualAssignments(env);
  const decided = new Set((await env.DB.prepare("SELECT kind || '|' || subject AS k FROM suggestions WHERE status IN ('accepted','rejected')").all<{ k: string }>()).results.map(r => r.k));
  const themeOf = new Map(issues.map(i => [i.id, i.theme_key]));
  const now = nowIso();

  // 課題の候補（重複にした課題は除く）
  const matchIssues = new Map<string, Vec>();
  for (const i of issues) if (!CLOSED_FOR_MATCH.has(i.state_type) && issueVecs.has(i.id)) matchIssues.set(i.id, issueVecs.get(i.id)!);

  // テーマの重心：テーマの課題＋番号で確定したコミット＋承認済みのコミット
  const accepted = (await env.DB.prepare("SELECT kind, subject, target FROM suggestions WHERE status='accepted' AND kind IN ('commit_issue','commit_theme')").all<{ kind: string; subject: string; target: string }>()).results;
  const members = new Map<string, Vec[]>();
  const push = (t: string | null | undefined, v: Vec | undefined) => { if (t && v) (members.get(t) ?? members.set(t, []).get(t)!).push(v); };
  for (const i of issues) push(i.theme_key, issueVecs.get(i.id));
  for (const [sha, id] of nums) push(themeOf.get(id), commitVecs.get(sha));
  for (const a of accepted) push(a.kind === 'commit_issue' ? themeOf.get(a.target) : a.target, commitVecs.get(a.subject));
  const themeVecs = new Map<string, Vec>();
  for (const [t, vs] of members) { const c = centroid(vs); if (c) themeVecs.set(t, c); }

  const rows: unknown[][] = [];
  const unassigned: string[] = [];
  let nIssue = 0, nTheme = 0;
  for (const c of commits) {
    const v = commitVecs.get(c.sha);
    if (!v || nums.has(c.sha) || manual.has(c.sha)) continue;
    if (decided.has(`commit_issue|${c.sha}`) || decided.has(`commit_theme|${c.sha}`)) continue;
    const ti = topK(v, matchIssues, 3);
    const di = decide(ti, st.issue_auto, st.issue_ask);
    if (di.level !== 'none') {
      nIssue++;
      rows.push([`s_ci_${c.sha.slice(0, 12)}`, 'commit_issue', c.sha, di.target, di.score, JSON.stringify({ top: ti }), di.level, now]);
      continue;
    }
    const tt = topK(v, themeVecs, 3);
    const dt = decide(tt, st.theme_auto, st.theme_ask);
    if (dt.level !== 'none') {
      nTheme++;
      rows.push([`s_ct_${c.sha.slice(0, 12)}`, 'commit_theme', c.sha, dt.target, dt.score, JSON.stringify({ top: tt, issueTop: ti }), dt.level, now]);
    } else unassigned.push(c.sha);
  }

  // どこにも近くない作業の塊 → 新しいテーマの候補（毎回作り直す。人が決めたものは残す）
  const uVecs = unassigned.map(s => commitVecs.get(s)!);
  const msg = new Map(commits.map(c => [c.sha, c.message]));
  const groups = threshClusters(unassigned, uVecs, st.cluster_link, st.cluster_min);
  for (const g of groups) {
    const vs = g.map(s => commitVecs.get(s)!);
    const rep = g[medoid(vs)];
    const cen = centroid(vs)!;
    const near = topK(cen, themeVecs, 1)[0];
    const key = (await sha256([...g].sort().join(','))).slice(0, 12);
    if (decided.has(`new_cluster|cl_${key}`)) continue;
    rows.push([`s_cl_${key}`, 'new_cluster', `cl_${key}`, null, g.length,
      JSON.stringify({ members: g, label: msg.get(rep), nearestTheme: near ?? null }), 'pending', now]);
  }

  // テーマの前提の候補：意味が近く、かつ先に生まれたテーマ
  const firstSeen = new Map<string, string>();
  const seen = (t: string | null | undefined, at: string) => { if (t && (!firstSeen.has(t) || at < firstSeen.get(t)!)) firstSeen.set(t, at); };
  for (const [sha, id] of nums) seen(themeOf.get(id), commits.find(c => c.sha === sha)!.committed_at);
  for (const i of issues) seen(i.theme_key, i.created_at);
  let nPremise = 0;
  for (const [b, vb] of themeVecs) {
    if (decided.has(`theme_premise|${b}`)) continue;
    let best: { a: string; s: number } | null = null;
    for (const [a, va] of themeVecs) {
      if (a === b || !(firstSeen.get(a)! < firstSeen.get(b)!)) continue;
      const s = dot(va, vb);
      if (s >= st.premise_min && (!best || s > best.s)) best = { a, s };
    }
    if (best) { nPremise++; rows.push([`s_tp_${b}`, 'theme_premise', b, best.a, best.s, '{}', 'pending', now]); }
  }

  // 消す → 入れる を1回のバッチで（途中で失敗したら全部取り消される）
  await env.DB.batch([
    env.DB.prepare("DELETE FROM suggestions WHERE status IN ('auto','pending')"),
    ...bulkInsert(env.DB, INSERT_HEAD, 8, rows),
  ]);
  return { commitIssue: nIssue, commitTheme: nTheme, newClusters: groups.length, themePremise: nPremise, unassigned: unassigned.length };
}

/**
 * 答え合わせ：番号で確定しているコミットを正解として、
 * bge-m3 の近さだけで同じ課題・テーマを当てられるかを測る。
 * テーマの重心はコミットを混ぜず課題だけで作る（答えが漏れないように）。
 */
export async function evaluate(env: Env) {
  const issues = (await env.DB.prepare('SELECT * FROM issues').all<IssueRow>()).results;
  const commits = (await env.DB.prepare('SELECT * FROM commits WHERE is_merge = 0').all<CommitRow>()).results;
  const issueVecs = await loadVectors(env, 'issue');
  const commitVecs = await loadVectors(env, 'commit');
  const nums = numberLinks(commits, issues);
  const themeOf = new Map(issues.map(i => [i.id, i.theme_key]));
  const matchIssues = new Map([...issueVecs].filter(([id]) => issues.find(i => i.id === id && !CLOSED_FOR_MATCH.has(i.state_type))));
  const byTheme = new Map<string, Vec[]>();
  for (const i of issues) if (i.theme_key && issueVecs.has(i.id)) (byTheme.get(i.theme_key) ?? byTheme.set(i.theme_key, []).get(i.theme_key)!).push(issueVecs.get(i.id)!);
  const themeVecs = new Map([...byTheme].map(([t, vs]) => [t, centroid(vs)!]));
  const issuePairs: { score: number; correct: boolean }[] = [], themePairs: { score: number; correct: boolean }[] = [];
  const misses: { message: string; truth: string; guess: string; score: number }[] = [];
  for (const [sha, truth] of nums) {
    const v = commitVecs.get(sha);
    if (!v) continue;
    // 番号そのものが手がかりにならないよう、埋め込みの文からは番号を落としてある（embedText）
    const ti = topK(v, matchIssues, 1)[0];
    if (ti) {
      issuePairs.push({ score: ti.score, correct: ti.id === truth });
      if (ti.id !== truth && misses.length < 15) misses.push({ message: commits.find(c => c.sha === sha)!.message, truth, guess: ti.id, score: Math.round(ti.score * 1000) / 1000 });
    }
    const tt = topK(v, themeVecs, 1)[0];
    const truthTheme = themeOf.get(truth);
    if (tt && truthTheme) themePairs.push({ score: tt.score, correct: tt.id === truthTheme });
  }
  const acc = (p: { correct: boolean }[]) => (p.length ? p.filter(x => x.correct).length / p.length : 0);
  const pick = (rows: ReturnType<typeof sweep>, minPrecision: number) => rows.find(r => r.precision >= minPrecision && r.covered >= 3)?.threshold ?? null;
  const issueSweep = sweep(issuePairs), themeSweep = sweep(themePairs);
  return {
    groundTruth: issuePairs.length,
    issue: { top1Accuracy: acc(issuePairs), sweep: issueSweep, suggestedAuto: pick(issueSweep, 0.9), suggestedAsk: pick(issueSweep, 0.6) },
    theme: { top1Accuracy: acc(themePairs), sweep: themeSweep, suggestedAuto: pick(themeSweep, 0.9), suggestedAsk: pick(themeSweep, 0.6) },
    misses,
    note: '正解が少ない（数十件）ので、しきい値は目安です。決めた値は /api/settings で保存します。',
  };
}
