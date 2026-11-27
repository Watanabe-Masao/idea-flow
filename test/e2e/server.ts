// 画面のテスト用のサーバー：API は本物（src/api.ts）、D1 と AI は test/fakeenv.ts、GitHub は test/e2e/fixture.json の写しで答える。
// 写しの日付は「今」に合わせてずらす（いつ走らせても、直近の作業として見える）
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { fakeEnv } from '../fakeenv.ts';
import { handleApi } from '../../src/api.ts';

type Fx = { repo: string; base: string; prs: { number: number; title: string; mergedAt: string; body: string; files: string[] }[]; issues: { number: number; state: string; title: string; body: string; createdAt: string; updatedAt: string; closedAt: string | null }[] };
const FX: Fx = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
const shift = Date.now() - Date.parse(FX.base) - 3600e3; // いちばん新しいものが1時間前になるように
const at = (s: string | null) => s && new Date(Date.parse(s) + shift).toISOString();

export async function start(port = 8788): Promise<Server> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, o?: RequestInit) => {
    const url = new URL(String(u));
    if (url.host !== 'api.github.com') return real(u, o);
    const q = url.pathname === '/graphql' ? JSON.parse(String(o!.body)) : null;
    if (q && q.query.includes('issues(')) {
      const nodes = FX.issues.map(i => ({ ...i, createdAt: at(i.createdAt), updatedAt: at(i.updatedAt), closedAt: at(i.closedAt), parent: null }));
      return Response.json({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } });
    }
    if (q && q.query.includes('pullRequests')) {
      const v = q.variables, all = FX.prs.map(p => ({ number: p.number, title: p.title, url: `https://github.com/${FX.repo}/pull/${p.number}`, mergedAt: at(p.mergedAt), updatedAt: at(p.mergedAt), body: p.body, files: { nodes: p.files.map(path => ({ path })) }, closingIssuesReferences: { nodes: [] } }));
      const list = v.dir === 'DESC' ? [...all].reverse() : all, s = v.after ? Number(v.after) : 0;
      return Response.json({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: s + v.first < list.length, endCursor: String(s + v.first) }, nodes: list.slice(s, s + v.first) } } } });
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  const env = fakeEnv() as any; env.GITHUB_TOKEN = 'x';
  const pub = new URL('../../public/', import.meta.url);
  const srv = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    if (req.url!.startsWith('/api/')) {
      const r = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers as HeadersInit, body: ['GET', 'HEAD'].includes(req.method!) ? undefined : Buffer.concat(chunks) });
      const out = await handleApi(r, env);
      res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(Buffer.from(await out.arrayBuffer())); return;
    }
    const js = req.url!.match(/^\/(\w+\.js)/);
    if (js) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(new URL(js[1], pub))); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(new URL('index.html', pub)));
  });
  await new Promise<void>(r => srv.listen(port, r));
  return srv;
}
