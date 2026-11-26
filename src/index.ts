import type { Env } from './types.ts';
import { handleApi } from './api.ts';
import { handleMcp } from './mcp.ts';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    const mcp = url.pathname.match(/^\/mcp\/([^/]+)\/?$/);
    if (mcp) return handleMcp(req, env, decodeURIComponent(mcp[1]));
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
