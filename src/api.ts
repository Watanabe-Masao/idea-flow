import type { Env } from './types.ts';
import { embedMany, MODEL } from './embed.ts';
import { errorJson, json, jstDay, newId, nowIso, safeEqual } from './util.ts';
import { analyze, dismiss, listFiles, rulesView, saveSource, setExternal, syncRules } from './rules.ts';
import { mapView, syncMap } from './workmap.ts';

const isAdmin = (req: Request, env: Env) => {
  const h = req.headers.get('authorization') ?? '';
  return !!env.ADMIN_TOKEN && h.startsWith('Bearer ') && safeEqual(h.slice(7), env.ADMIN_TOKEN);
};

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  // 決まりの中身など公開したくない内容を返すので、読み取りも含めてすべて合言葉が必要
  if (!isAdmin(req, env)) return errorJson('合言葉が必要です', 401);
  try {
    if (req.method === 'GET' && p === '/api/events') {
      return json((await env.DB.prepare('SELECT * FROM events ORDER BY at DESC LIMIT 100').all()).results);
    }
    if (req.method === 'GET' && p === '/api/rules') return json(await rulesView(env));
    if (req.method === 'GET' && p === '/api/rules/doc') {
      const r = url.searchParams.get('repo') ?? '', path = url.searchParams.get('path') ?? '';
      const doc = await env.DB.prepare('SELECT id, repo, path, kind, applies, title, description, external FROM rule_docs WHERE repo = ? AND path = ?').bind(r, path).first<{ id: string }>();
      if (!doc) return errorJson('その文書は取り込まれていません', 404);
      const items = (await env.DB.prepare('SELECT id, n, heading, text, line, kind FROM rule_items WHERE doc = ? ORDER BY n').bind(doc.id).all<{ heading: string }>()).results;
      const sections = (await env.DB.prepare('SELECT heading, line, md FROM rule_sections WHERE doc = ? ORDER BY line').bind(doc.id).all()).results;
      return json({ doc, items, sections });
    }
    if (req.method === 'GET' && p === '/api/map') { const t0 = Date.now(); const v = await mapView(env, url.searchParams.get('repo') ?? '', Math.min(60, Math.max(7, Number(url.searchParams.get('span')) || 21))); return json({ ...v, took: Date.now() - t0 }); } // took：計測（#44）
    if (req.method === 'GET' && p === '/api/rules/files') return json(await listFiles(env, url.searchParams.get('repo') ?? ''));
    if (req.method === 'GET' && p === '/api/selftest') {
      const v = await embedMany(env, ['満月の物語：ページ送り', '予報の履歴の取り込み']);
      return json({ model: MODEL, dims: v[0].length, similarity: v[0].reduce((s, x, i) => s + x * v[1][i], 0) });
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      if (p === '/api/rules/source') return json(await saveSource(env, String(body.repo ?? ''), Array.isArray(body.files) ? body.files as string[] : []));
      if (p === '/api/rules/sync') return json(await syncRules(env, String(body.repo ?? '')));
      if (p === '/api/rules/analyze') return json(await analyze(env));
      if (p === '/api/map/sync') return json(await syncMap(env, String(body.repo ?? ''), { mode: body.mode === 'backfill' ? 'backfill' : 'update', pages: Math.min(6, Math.max(1, Number(body.pages) || 4)) }));
      if (p === '/api/rules/external') return json(await setExternal(env, String(body.repo ?? ''), String(body.path ?? ''), !!body.external));
      if (p === '/api/rules/dismiss') return json(await dismiss(env, String(body.key ?? ''), body.why ? String(body.why).slice(0, 200) : null));
    }
    return errorJson('見つかりません', 404);
  } catch (e) {
    console.error(e);
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
}
