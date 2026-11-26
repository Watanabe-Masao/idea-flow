// GitHub とのやり取り（読むだけ）。読む用の鍵（GITHUB_TOKEN）で届かなければ、もう1つの鍵（GITHUB_WRITE_TOKEN）で読み直す。
import type { Env } from './types.ts';

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function ghHeaders(token: string | undefined, raw = false): Record<string, string> {
  const h: Record<string, string> = { accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'user-agent': 'idea-flow', 'x-github-api-version': '2022-11-28' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** 読む。読む用の鍵で届かない（401・403・404）ときは、書き込み用の鍵で読み直す */
export async function gh<T>(env: Env, path: string, raw = false): Promise<T> {
  let res = await fetch('https://api.github.com' + path, { headers: ghHeaders(env.GITHUB_TOKEN, raw) });
  if ([401, 403, 404].includes(res.status) && env.GITHUB_WRITE_TOKEN && env.GITHUB_WRITE_TOKEN !== env.GITHUB_TOKEN)
    res = await fetch('https://api.github.com' + path, { headers: ghHeaders(env.GITHUB_WRITE_TOKEN, raw) });
  if (!res.ok) throw new Error(`GitHub: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (raw ? await res.text() : await res.json()) as T;
}

/**
 * たくさんのファイルを少ない回数で読む。GitHub の GraphQL なら1回で約40ファイル読める
 * （Workers は1回の処理で外へ出せる数に限りがあるので、1ファイル1回の読み方を避ける）。
 * 鍵が無いときや失敗したときは null（呼ぶ側が1つずつ読む）。
 */
export async function readMany(env: Env, repo: string, branch: string, paths: string[]): Promise<Map<string, string> | null> {
  if (!paths.length) return null;
  for (const token of [env.GITHUB_TOKEN, env.GITHUB_WRITE_TOKEN].filter((t, i, a) => t && a.indexOf(t) === i) as string[]) {
    const r = await readManyWith(token, repo, branch, paths);
    if (r) return r;
  }
  return null;
}
async function readManyWith(token: string, repo: string, branch: string, paths: string[]) {
  const [owner, name] = repo.split('/');
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 40) {
    const part = paths.slice(i, i + 40);
    const q = `query($o:String!,$n:String!){repository(owner:$o,name:$n){${part.map((p, k) => `f${k}:object(expression:${JSON.stringify(`${branch}:${p}`)}){...on Blob{text}}`).join(' ')}}}`;
    const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...ghHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { o: owner, n: name } }) });
    if (!res.ok) return null;
    const j = await res.json() as { data?: { repository?: Record<string, { text: string | null } | null> } };
    const r = j.data?.repository;
    if (!r) return null;
    part.forEach((p, k) => { const t = r[`f${k}`]?.text; if (typeof t === 'string') out.set(p, t); });
  }
  return out;
}
