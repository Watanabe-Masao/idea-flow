import type { Env } from './types.ts';
import { handleApi, pipeline } from './api.ts';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pipeline(env).then(r => console.log('pipeline', JSON.stringify(r))).catch(e => console.error('pipeline failed', e)));
  },
} satisfies ExportedHandler<Env>;
