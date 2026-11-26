import type { Env } from './types.ts';
import { embedMany, MODEL } from './embed.ts';
import { errorJson, json, jstDay, newId, nowIso, safeEqual } from './util.ts';
import { analyze, dismiss, listFiles, rulesView, saveSource, setExternal, syncRules, xray } from './rules.ts';
import { summarizeStep, summariesOf } from './summary.ts';
import { consultFor, consultPrompt } from './consult.ts';
import { exportPr, exportPreview, projectInstruction } from './export.ts';
import { addComment, contractText, decide as decideChange, draftTree, preview as previewChange, propose, requests as changeRequests, scopeTree, suggestTree } from './scopes.ts';

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
    if (req.method === 'GET' && p === '/api/rules/xray') return json(await xray(env, url.searchParams.get('repo') ?? '', url.searchParams.get('scene') ?? '', url.searchParams.get('scope') ?? ''));
    if (req.method === 'GET' && p === '/api/scopes') {
      const r = url.searchParams.get('repo') ?? '';
      const tree = await scopeTree(env, r);
      const docIds = (await env.DB.prepare('SELECT id FROM rule_docs WHERE repo = ?').bind(r).all<{ id: string }>()).results.map(d => `doc|${d.id}`);
      return json({ tree, requests: await changeRequests(env, r), summaries: await summariesOf(env, [...docIds, ...tree.map(t => `scope|${t.id}`)]) });
    }
    if (req.method === 'GET' && p === '/api/rules/doc') {
      const r = url.searchParams.get('repo') ?? '', path = url.searchParams.get('path') ?? '';
      const doc = await env.DB.prepare('SELECT id, repo, path, kind, applies, title, description, external FROM rule_docs WHERE repo = ? AND path = ?').bind(r, path).first<{ id: string }>();
      if (!doc) return errorJson('その文書は取り込まれていません', 404);
      const items = (await env.DB.prepare('SELECT id, n, heading, text, line, kind FROM rule_items WHERE doc = ? ORDER BY n').bind(doc.id).all<{ heading: string }>()).results;
      const sections = (await env.DB.prepare('SELECT heading, line, md FROM rule_sections WHERE doc = ? ORDER BY line').bind(doc.id).all()).results;
      const heads = [...new Set(items.map(i => i.heading))];
      return json({ doc, items, sections, summaries: await summariesOf(env, [`doc|${doc.id}`, ...heads.map(h => `head|${doc.id}|${h}`)]) });
    }
    if (req.method === 'GET' && p === '/api/scopes/contract') { const r = url.searchParams.get('repo') ?? '', t = await scopeTree(env, r), sc = t.find(x => x.key === url.searchParams.get('scope')); if (!sc) return errorJson('範囲が見つかりません', 404); return json({ text: contractText(r, t, sc.id) }); }
    if (req.method === 'GET' && p === '/api/export/preview') return json(await exportPreview(env, url.searchParams.get('repo') ?? ''));
    if (req.method === 'GET' && p === '/api/export/project') return json({ text: await projectInstruction(env, url.searchParams.get('repo') ?? '', url.searchParams.get('scope') ?? '') });
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
      if (p === '/api/export/pr') return json(await exportPr(env, String(body.repo ?? '')));
      if (p === '/api/requests/prompt') return json({ text: body.id ? await consultFor(env, String(body.id)) : await consultPrompt(env, String(body.repo ?? ''), (Array.isArray(body.ops) ? body.ops : []) as never, { title: body.title ? String(body.title) : undefined }) });
      if (p === '/api/requests/comment') return json(await addComment(env, String(body.id ?? ''), 'human', String(body.text ?? '')));
      if (p === '/api/rules/summarize') return json(await summarizeStep(env, String(body.repo ?? ''), Math.min(8, Math.max(1, Number(body.budget) || 4))));
      if (p === '/api/scopes/propose') return json(await propose(env, String(body.repo ?? ''), 'human', String(body.title ?? ''), String(body.reason ?? ''), body.ops as never));
      if (p === '/api/scopes/preview') { const r = String(body.repo ?? ''), ops = (Array.isArray(body.ops) ? body.ops : []) as never; return json({ tree: await draftTree(env, r, ops), preview: (ops as unknown[]).length ? await previewChange(env, r, ops) : [] }); }
      if (p === '/api/scopes/suggest') return json(await suggestTree(env, String(body.repo ?? '')));
      if (p === '/api/scopes/decide') return json(await decideChange(env, String(body.id ?? ''), body.decision === 'accept' ? 'accept' : 'reject', body.note ? String(body.note).slice(0, 500) : null));
      if (p === '/api/rules/external') return json(await setExternal(env, String(body.repo ?? ''), String(body.path ?? ''), !!body.external));
      if (p === '/api/rules/dismiss') return json(await dismiss(env, String(body.key ?? ''), body.why ? String(body.why).slice(0, 200) : null));
    }
    return errorJson('見つかりません', 404);
  } catch (e) {
    console.error(e);
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
}
