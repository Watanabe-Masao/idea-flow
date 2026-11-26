import type { CommitRow, Env, IssueRow, Settings, SuggestionKind } from './types.ts';
import { loadVectors } from './embed.ts';
import { centroid, decideVote, dot, headingOf, knnVote, medoid, sweep, threshClusters, topK, type Example, type Vec } from './vec.ts';
import { bulkInsert, nowIso, sha256 } from './util.ts';

export async function loadSettings(env: Env): Promise<Settings> {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const m = Object.fromEntries(rows.results.map(r => [r.key, r.value]));
  const n = (k: string, d: number) => (m[k] !== undefined && m[k] !== '' ? Number(m[k]) : d);
  return {
    issue_auto: n('issue_auto', 0.75), issue_ask: n('issue_ask', 0.5),
    theme_auto: n('theme_auto', 0.8), theme_ask: n('theme_ask', 0.55),
    cluster_link: n('cluster_link', 0.7), cluster_min: n('cluster_min', 3),
    premise_min: n('premise_min', 0.7),
    min_sim: n('min_sim', 0.5),
  };
}

const CLOSED_FOR_MATCH = new Set(['duplicate']);
/** 課題の多数決で、1つの課題から数える手本の上限（手本の多い課題に票が偏らないように） */
const ISSUE_PER_LABEL = 2;
/** 自動にしてよい当たりの下限と、そのとき必要な件数。届かなければ自動はなし（確認待ちだけ） */
const AUTO_PRECISION = 0.95, AUTO_MIN_COVERED = 5;
/** 自動なし を表すしきい値（票の割合は 1 を超えない） */
export const AUTO_OFF = 1.01;

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

/**
 * 手本づくり：答えが分かっているもの（番号で確定・手で振り分け・承認済みのコミット、課題そのもの）。
 * 課題を当てる手本と、テーマを当てる手本を別々に持つ。
 */
type Known = Map<string, { issue: string | null; theme: string | null }>;
function buildExamples(issues: IssueRow[], commits: CommitRow[], issueVecs: Map<string, Vec>, commitVecs: Map<string, Vec>, known: Known) {
  const themeOf = new Map(issues.map(i => [i.id, i.theme_key]));
  const usable = new Set(issues.filter(i => !CLOSED_FOR_MATCH.has(i.state_type)).map(i => i.id));
  const issueEx: Example[] = [], themeEx: Example[] = [];
  for (const i of issues) {
    const v = issueVecs.get(i.id);
    if (!v) continue;
    const h = headingOf(i.title.replace(/^#\d+\s*/, ''));
    if (usable.has(i.id)) issueEx.push({ vec: v, label: i.id, heading: h, key: i.id });
    if (i.theme_key) themeEx.push({ vec: v, label: i.theme_key, heading: h, key: i.id });
  }
  for (const c of commits) {
    const k = known.get(c.sha), v = commitVecs.get(c.sha);
    if (!k || !v) continue;
    const h = headingOf(c.message);
    if (k.issue && usable.has(k.issue)) issueEx.push({ vec: v, label: k.issue, heading: h, key: c.sha, group: c.pr_number != null ? String(c.pr_number) : null });
    const t = k.theme ?? (k.issue ? themeOf.get(k.issue) ?? null : null);
    if (t) themeEx.push({ vec: v, label: t, heading: h, key: c.sha, group: c.pr_number != null ? String(c.pr_number) : null });
  }
  return { issueEx, themeEx };
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

  // 答えが分かっているコミット：番号 → 手で振り分け → 承認済み
  const accepted = (await env.DB.prepare("SELECT kind, subject, target FROM suggestions WHERE status='accepted' AND kind IN ('commit_issue','commit_theme')").all<{ kind: string; subject: string; target: string }>()).results;
  const known: Known = new Map();
  for (const a of accepted) known.set(a.subject, a.kind === 'commit_issue' ? { issue: a.target, theme: null } : { issue: null, theme: a.target });
  for (const [sha, m] of manual) known.set(sha, { issue: m.issue ?? null, theme: m.theme ?? null });
  for (const [sha, id] of nums) known.set(sha, { issue: id, theme: null });
  const { issueEx, themeEx } = buildExamples(issues, commits, issueVecs, commitVecs, known);

  // テーマの重心（新しい塊・前提の判定に使う）：課題＋答えが分かっているコミット
  const members = new Map<string, Vec[]>();
  for (const e of themeEx) (members.get(e.label) ?? members.set(e.label, []).get(e.label)!).push(e.vec);
  const themeVecs = new Map<string, Vec>();
  for (const [t, vs] of members) { const c = centroid(vs); if (c) themeVecs.set(t, c); }

  const rows: unknown[][] = [];
  const unassigned: string[] = [];
  let nIssue = 0, nTheme = 0;
  for (const c of commits) {
    const v = commitVecs.get(c.sha);
    if (!v || known.has(c.sha)) continue;
    if (decided.has(`commit_issue|${c.sha}`) || decided.has(`commit_theme|${c.sha}`)) continue;
    const h = headingOf(c.message);
    const ti = knnVote(v, h, issueEx, { perLabel: ISSUE_PER_LABEL });
    const di = decideVote(ti, st.issue_auto, st.issue_ask, st.min_sim);
    if (di.level !== 'none') {
      nIssue++;
      rows.push([`s_ci_${c.sha.slice(0, 12)}`, 'commit_issue', c.sha, di.target, di.score, JSON.stringify({ top: ti.slice(0, 3), heading: h }), di.level, now]);
      continue;
    }
    const tt = knnVote(v, h, themeEx);
    const dt = decideVote(tt, st.theme_auto, st.theme_ask, st.min_sim);
    if (dt.level !== 'none') {
      nTheme++;
      rows.push([`s_ct_${c.sha.slice(0, 12)}`, 'commit_theme', c.sha, dt.target, dt.score, JSON.stringify({ top: tt.slice(0, 3), issueTop: ti.slice(0, 3), heading: h }), dt.level, now]);
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
 * 答え合わせ：番号で確定しているコミットを正解として、手本との多数決で当てられるかを測る。
 * 1件ずつ「自分」と「同じPRのコミット」を手本から抜いて当てる（答えが漏れないように）。
 * 参考として、前の方式（課題の文との近さだけ）の正解率も出す。
 */
export async function evaluate(env: Env) {
  const st = await loadSettings(env);
  const issues = (await env.DB.prepare('SELECT * FROM issues').all<IssueRow>()).results;
  const commits = (await env.DB.prepare('SELECT * FROM commits WHERE is_merge = 0').all<CommitRow>()).results;
  const rels = (await env.DB.prepare('SELECT a, b FROM relations').all<{ a: string; b: string }>()).results;
  const issueVecs = await loadVectors(env, 'issue');
  const commitVecs = await loadVectors(env, 'commit');
  const nums = numberLinks(commits, issues);
  const themeOf = new Map(issues.map(i => [i.id, i.theme_key]));
  const parentOf = new Map(issues.map(i => [i.id, i.parent_id]));
  const byId = new Map(commits.map(c => [c.sha, c]));

  // 「ほぼ正解」：親子・兄弟・関係が登録されている課題
  const linked = new Set<string>();
  for (const r of rels) { linked.add(`${r.a}|${r.b}`); linked.add(`${r.b}|${r.a}`); }
  const near = (a: string, b: string) => a === b || parentOf.get(a) === b || parentOf.get(b) === a
    || (!!parentOf.get(a) && parentOf.get(a) === parentOf.get(b)) || linked.has(`${a}|${b}`);

  const known: Known = new Map([...nums].map(([sha, id]) => [sha, { issue: id, theme: null }]));
  const { issueEx, themeEx } = buildExamples(issues, commits, issueVecs, commitVecs, known);
  const matchIssues = new Map([...issueVecs].filter(([id]) => issues.find(i => i.id === id && !CLOSED_FOR_MATCH.has(i.state_type))));

  type Pair = { score: number; correct: boolean; near: boolean };
  const issuePairs: Pair[] = [], themePairs: Pair[] = [];
  let oldIssueOk = 0, oldN = 0;
  const misses: { message: string; truth: string; guess: string; score: number; near: boolean }[] = [];
  for (const [sha, truth] of nums) {
    const v = commitVecs.get(sha), c = byId.get(sha);
    if (!v || !c) continue;
    const grp = c.pr_number != null ? String(c.pr_number) : null;
    const skip = (e: Example) => e.key === sha || (grp != null && e.group === grp);
    const h = headingOf(c.message);
    const ti = knnVote(v, h, issueEx, { skip, perLabel: ISSUE_PER_LABEL })[0];
    if (ti) {
      const ok = ti.id === truth, nr = near(ti.id, truth);
      issuePairs.push({ score: ti.sim < st.min_sim ? 0 : ti.score, correct: ok, near: nr });
      if (!ok && misses.length < 15) misses.push({ message: c.message, truth, guess: ti.id, score: Math.round(ti.score * 100) / 100, near: nr });
    }
    const truthTheme = themeOf.get(truth);
    const tt = knnVote(v, h, themeEx, { skip })[0];
    if (tt && truthTheme) themePairs.push({ score: tt.sim < st.min_sim ? 0 : tt.score, correct: tt.id === truthTheme, near: tt.id === truthTheme });
    const old = topK(v, matchIssues, 1)[0];
    if (old) { oldN++; if (old.id === truth) oldIssueOk++; }
  }
  const acc = (p: Pair[], f: (x: Pair) => boolean) => (p.length ? p.filter(f).length / p.length : 0);
  const sw = (p: Pair[]) => sweep(p, 0.3, 1.0, 0.05).map(r => {
    const kept = p.filter(x => x.score >= r.threshold);
    return { ...r, nearPrecision: kept.length ? kept.filter(x => x.near).length / kept.length : 0 };
  });
  const pick = (rows: ReturnType<typeof sw>, minPrecision: number, minCovered: number) => rows.find(r => r.precision >= minPrecision && r.covered >= minCovered)?.threshold ?? null;
  // 自動：当たりが95%以上になる最小のしきい値（件数が少なすぎるものは採らない）
  const pickAuto = (rows: ReturnType<typeof sw>) => pick(rows, AUTO_PRECISION, AUTO_MIN_COVERED);
  const issueSweep = sw(issuePairs), themeSweep = sw(themePairs);
  return {
    groundTruth: issuePairs.length,
    method: '手本のコミットとの多数決（見出しが同じなら加点、課題は1つにつき近い2件まで）',
    autoOff: AUTO_OFF,
    oldIssueTop1: oldN ? oldIssueOk / oldN : 0,
    issue: { top1Accuracy: acc(issuePairs, x => x.correct), nearAccuracy: acc(issuePairs, x => x.near), sweep: issueSweep, suggestedAuto: pickAuto(issueSweep), suggestedAsk: pick(issueSweep, 0.6, 3) },
    theme: { top1Accuracy: acc(themePairs, x => x.correct), nearAccuracy: acc(themePairs, x => x.near), sweep: themeSweep, suggestedAuto: pickAuto(themeSweep), suggestedAsk: pick(themeSweep, 0.6, 3) },
    misses,
    note: '1件ずつ、自分と同じPRのコミットを手本から外して当てています。正解が少ないので、しきい値は目安です。',
  };
}
