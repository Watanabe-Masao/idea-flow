import type { Env } from './types.ts';
import { bulkInsert, nowIso, prNumberOf, refsOf } from './util.ts';

type GhCommit = {
  sha: string; html_url: string; parents: { sha: string }[];
  commit: { message: string; committer: { date: string } | null; author: { date: string } | null };
};

/**
 * GitHub のコミットを差分で取り込む。初回は全部（最大 pages×100 件）、
 * 2回目からは前回取り込んだ最新の時刻以降だけ。
 */
export async function syncGithub(env: Env, pages = 30): Promise<{ commits: number }> {
  const cursorRow = await env.DB.prepare("SELECT value FROM settings WHERE key='sync_cursor_github'").first<{ value: string }>();
  const since = cursorRow?.value || '';
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'idea-flow',
    'x-github-api-version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const now = nowIso();
  let count = 0, newest = since;
  for (let page = 1; page <= pages; page++) {
    const url = new URL(`https://api.github.com/repos/${env.GITHUB_REPO}/commits`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    if (since) url.searchParams.set('since', since);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub: ${res.status} ${await res.text()}`);
    const list = await res.json() as GhCommit[];
    if (!list.length) break;
    const rows = list.map(c => {
      const [first, ...rest] = c.commit.message.split('\n');
      const at = c.commit.committer?.date ?? c.commit.author?.date ?? now;
      if (at > newest) newest = at;
      return [c.sha, at, first, rest.join('\n').trim(), prNumberOf(first), JSON.stringify(refsOf(c.commit.message, env.LINEAR_TEAM_KEY)),
        c.parents.length > 1 ? 1 : 0, c.html_url, now];
    });
    const stmts = bulkInsert(env.DB, 'INSERT INTO commits (sha, committed_at, message, body, pr_number, refs, is_merge, url, synced_at) VALUES', 9, rows,
      'ON CONFLICT(sha) DO UPDATE SET message=excluded.message, body=excluded.body, pr_number=excluded.pr_number, refs=excluded.refs, synced_at=excluded.synced_at');
    await env.DB.batch(stmts);
    count += list.length;
    if (list.length < 100) break;
  }
  if (newest && newest !== since) {
    await env.DB.prepare("UPDATE settings SET value=? WHERE key='sync_cursor_github'").bind(newest).run();
  }
  return { commits: count };
}
