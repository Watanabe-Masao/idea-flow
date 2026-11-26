import type { Env, IssueRow } from './types.ts';
import { assignments, computeSuggestions, evaluate, loadSettings } from './suggest.ts';
import { syncLinear, attachCommit } from './linear.ts';
import { syncGithub } from './github.ts';
import { refreshEmbeddings, embedMany, MODEL } from './embed.ts';
import { errorJson, json, jstDay, newId, nowIso, safeEqual } from './util.ts';

const isAdmin = (req: Request, env: Env) => {
  const h = req.headers.get('authorization') ?? '';
  return !!env.ADMIN_TOKEN && h.startsWith('Bearer ') && safeEqual(h.slice(7), env.ADMIN_TOKEN);
};

/** 取り込み → 埋め込み → 提案、の一連の流れ（cron と手動の両方から呼ぶ） */
export async function pipeline(env: Env) {
  const linear = await syncLinear(env);
  const github = await syncGithub(env);
  const embeddings = await refreshEmbeddings(env);
  const suggestions = await computeSuggestions(env);
  return { at: nowIso(), linear, github, embeddings, suggestions };
}

async function mapData(env: Env) {
  const { map, issues, commits } = await assignments(env);
  const themes = (await env.DB.prepare('SELECT key, name FROM themes ORDER BY key').all<{ key: string; name: string }>()).results;
  const relations = (await env.DB.prepare('SELECT a, b, type FROM relations').all<{ a: string; b: string; type: string }>()).results;
  const premises = (await env.DB.prepare("SELECT subject, target, score, status FROM suggestions WHERE kind='theme_premise' AND status <> 'rejected'").all()).results;
  return {
    generatedAt: nowIso(),
    themes,
    issues: issues.map((i: IssueRow) => ({ id: i.id, t: i.title, s: i.state, st: i.state_type, c: i.theme_key, p: i.parent_id, l: JSON.parse(i.labels), u: i.url })),
    relations,
    premises,
    commits: commits.map(c => {
      const a = map.get(c.sha)!;
      return { sha: c.sha.slice(0, 7), d: jstDay(c.committed_at), m: c.message.replace(/\s*\(#\d+\)\s*$/, ''), pr: c.pr_number, u: c.url, i: a.issue, c: a.theme, h: a.how, sc: a.score, sg: a.suggestion ?? null };
    }),
  };
}

async function pending(env: Env) {
  const rows = (await env.DB.prepare(
    `SELECT s.id, s.kind, s.subject, s.target, s.score, s.detail, s.created_at, c.message, c.committed_at, c.url
       FROM suggestions s LEFT JOIN commits c ON c.sha = s.subject
      WHERE s.status = 'pending' ORDER BY s.kind, s.score DESC LIMIT 300`,
  ).all()).results;
  return rows.map(r => ({ ...r, detail: JSON.parse(String(r.detail ?? '{}')) }));
}

async function decide(env: Env, body: { id?: string; decision?: string; target?: string }) {
  if (!body.id || !['accept', 'reject'].includes(body.decision ?? '')) return errorJson('id と decision（accept / reject）が必要です');
  const s = await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(body.id).first<{ id: string; kind: string; subject: string; target: string | null; status: string }>();
  if (!s) return errorJson('提案が見つかりません', 404);
  const target = body.target ?? s.target;
  const status = body.decision === 'accept' ? 'accepted' : 'rejected';
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE suggestions SET status = ?, target = ?, decided_at = ? WHERE id = ?').bind(status, target, now, s.id),
    env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('ev'), now, body.decision!, s.subject, JSON.stringify({ kind: s.kind, target }), 'human', null),
  ]);
  let wroteBack = false;
  if (status === 'accepted' && s.kind === 'commit_issue' && env.WRITE_BACK === 'true' && target) {
    const issue = await env.DB.prepare('SELECT uuid FROM issues WHERE id = ?').bind(target).first<{ uuid: string }>();
    const commit = await env.DB.prepare('SELECT url, message FROM commits WHERE sha = ?').bind(s.subject).first<{ url: string; message: string }>();
    if (issue && commit) { await attachCommit(env, issue.uuid, commit.url, commit.message); wroteBack = true; }
  }
  return json({ ok: true, status, wroteBack });
}

async function assign(env: Env, body: { sha?: string; issue?: string | null; theme?: string | null }) {
  if (!body.sha) return errorJson('sha が必要です');
  const c = await env.DB.prepare('SELECT sha FROM commits WHERE sha LIKE ?').bind(body.sha + '%').first<{ sha: string }>();
  if (!c) return errorJson('コミットが見つかりません', 404);
  await env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('ev'), nowIso(), 'assign', c.sha, JSON.stringify({ issue: body.issue ?? null, theme: body.theme ?? null }), 'human', null).run();
  return json({ ok: true });
}

async function saveSettings(env: Env, body: Record<string, unknown>) {
  const allowed = ['issue_auto', 'issue_ask', 'theme_auto', 'theme_ask', 'cluster_link', 'cluster_min', 'premise_min'];
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.includes(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    stmts.push(env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(String(v), k));
    stmts.push(env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('ev'), now, 'threshold', k, String(v), 'human', null));
  }
  if (!stmts.length) return errorJson('変えられる設定がありません');
  await env.DB.batch(stmts);
  return json({ ok: true, settings: await loadSettings(env) });
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  // Linear の課題名など公開したくない内容を返すので、読み取りも含めてすべて合言葉が必要
  if (!isAdmin(req, env)) return errorJson('合言葉が必要です', 401);
  try {
    if (req.method === 'GET' && p === '/api/map') return json(await mapData(env));
    if (req.method === 'GET' && p === '/api/pending') return json(await pending(env));
    if (req.method === 'GET' && p === '/api/settings') return json(await loadSettings(env));
    if (req.method === 'GET' && p === '/api/events') {
      return json((await env.DB.prepare('SELECT * FROM events ORDER BY at DESC LIMIT 100').all()).results);
    }
    if (req.method === 'GET' && p === '/api/eval') return json(await evaluate(env));
    if (req.method === 'GET' && p === '/api/selftest') {
      const v = await embedMany(env, ['満月の物語：ページ送り', '予報の履歴の取り込み']);
      return json({ model: MODEL, dims: v[0].length, similarity: v[0].reduce((s, x, i) => s + x * v[1][i], 0) });
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      if (p === '/api/sync') return json(await pipeline(env));
      if (p === '/api/suggest') return json(await computeSuggestions(env));
      if (p === '/api/decide') return decide(env, body as never);
      if (p === '/api/assign') return assign(env, body as never);
      if (p === '/api/settings') return saveSettings(env, body);
    }
    return errorJson('見つかりません', 404);
  } catch (e) {
    console.error(e);
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
}
