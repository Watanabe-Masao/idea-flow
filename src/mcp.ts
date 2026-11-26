// Claude のコネクタ（MCP、Streamable HTTP）。会話の中からメモを保存し、企画の流れを読む。
// JSON-RPC を自前で処理する（SDK に頼らない最小構成）。合言葉は URL の /mcp/<MCP_TOKEN>。
import type { Env } from './types.ts';
import { projectFlow, projectSummaries, saveMemo, searchMemos, upsertProject, MEMO_KINDS } from './memo.ts';
import { safeEqual } from './util.ts';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `idea-flow は、渡辺さんのアイデアや会話のメモを企画ごとにまとめ、時間の流れで見るための道具です。
- 企画の話を続けるときは、先に read_project でこれまでの流れ（決定・保留・疑問）を読んでください。
- 会話の中で「決まったこと」「新しい案」「保留にしたこと」「残った疑問」が出たら、save_memo で1件1点ずつ短く保存してください。雑談や途中の考えは保存しません。
- 本文は「見出し：内容」の形にすると、あとで振り分けやすくなります。
- 個人的なこと（健康・お金・家族など）や、合言葉・鍵などの秘密は保存しないでください。
- AI が付けた企画や作った企画は「提案」の扱いで、決めるのは渡辺さんです。保存したら、何をどの企画に保存したかを一言伝えてください。`;

const TOOLS = [
  {
    name: 'list_projects',
    description: '企画の一覧。状態（動いている・止まっている・候補・完了など）、メモの件数、最後に動いた日を返す。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_project',
    description: '1つの企画の流れを読む。前提の企画・枝分かれした企画、最近のメモ（決定・案・保留・疑問）、残っている保留と疑問を返す。会話で企画の話を続ける前に使う。',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: '企画のキー（P01 など）または名前' }, limit: { type: 'number', description: '読むメモの件数（初期値 30）' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_memos',
    description: '意味の近いメモを探す。どの企画の話か分からないとき、前に似た案が出ていないか確かめるときに使う。',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_memo',
    description: '会話で出た「決まったこと・新しい案・保留・疑問」を1点ずつ保存する。企画が分かれば project に入れる（提案として扱われる）。分からなければ空にすれば、意味の近さで候補が付く。',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: '「見出し：内容」の形で、1点だけ、短く（〜200字目安）' },
        kind: { type: 'string', enum: [...MEMO_KINDS], description: '決定 / 案 / 保留 / 疑問 / メモ' },
        project: { type: 'string', description: '企画のキーまたは名前（分かるときだけ）' },
        ref: { type: 'string', description: '会話の URL など（あれば）' },
      },
      required: ['body', 'kind'], additionalProperties: false,
    },
  },
  {
    name: 'create_project',
    description: '新しい企画を「候補」として作る。既存の企画に当てはまらない話がまとまってきたときだけ使う。認めるかどうかは渡辺さんが決める。',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, note: { type: 'string', description: 'どんな企画か（1〜3文）' }, parent: { type: 'string', description: '前提になっている企画（あれば）' } }, required: ['name', 'note'], additionalProperties: false },
  },
];

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const err = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

async function callTool(env: Env, name: string, a: Record<string, unknown>) {
  switch (name) {
    case 'list_projects': {
      const ps = await projectSummaries(env);
      if (!ps.length) return text('企画はまだありません。create_project で候補を作るか、渡辺さんに画面で作ってもらってください。');
      return text(ps.map(p => `${p.key} ${p.name}［${p.status}・${p.state}］メモ${p.memos}件・決定${p.decided}・保留/疑問${p.open}・最後 ${p.lastAt ? p.lastAt.slice(0, 10) : 'なし'}（${p.quietDays}日前）${p.parent ? '・前提 ' + p.parent : ''}`).join('\n'));
    }
    case 'read_project': {
      const f = await projectFlow(env, String(a.project ?? ''), Math.min(100, Number(a.limit) || 30));
      const p = f.project;
      const lines = [
        `${p.key} ${p.name}［${p.status}・${p.state}］`,
        p.note ? `説明：${p.note}` : '',
        f.parent ? `前提：${f.parent.key} ${f.parent.name}［${f.parent.status}］` : '',
        f.children.length ? `枝分かれ：${f.children.map(c => `${c.key} ${c.name}［${c.status}］`).join('、')}` : '',
        '', '■ 最近のメモ（古い順）',
        ...f.memos.map(m => `${m.day} [${m.kind}]${m.how === 'ai' ? '(AI・未承認)' : ''} ${m.heading ? m.heading + '：' : ''}${m.body}`),
        '', '■ 残っている保留・疑問',
        ...(f.openItems.length ? f.openItems.map(m => `${m.day} [${m.kind}] ${m.heading ? m.heading + '：' : ''}${m.body}`) : ['なし']),
      ];
      return text(lines.filter((l, i) => l !== '' || i > 3).join('\n'));
    }
    case 'search_memos': {
      const r = await searchMemos(env, String(a.query ?? ''), Number(a.limit) || 8);
      return text(r.length ? r.map(m => `${m.day} [${m.kind}] ${m.projectName ? `（${m.project} ${m.projectName}）` : '（企画なし）'} ${m.heading ? m.heading + '：' : ''}${m.body}  近さ${m.score}`).join('\n') : '見つかりませんでした。');
    }
    case 'save_memo': {
      const r = await saveMemo(env, a, 'ai');
      const where = r.place.project ? `${r.place.project} ${r.projectName ?? ''}（${r.place.how === 'ai' ? 'AI指定・未承認' : r.place.how === 'pending' ? '候補・確認待ち' : r.place.how === 'auto' ? '自動' : r.place.how}）` : '企画なし（あとで振り分け）';
      return text(`保存しました：[${r.memo.kind}] ${r.memo.heading ? r.memo.heading + '：' : ''}${r.memo.body}\n企画：${where}${r.unknownProject ? `\n※「${r.unknownProject}」という企画はありません。list_projects で確かめてください。` : ''}`);
    }
    case 'create_project': {
      const p = await upsertProject(env, { name: a.name, note: a.note, parent: a.parent }, 'ai');
      return text(`企画の候補を作りました：${p.key} ${p.name}（状態：候補）。渡辺さんが画面で「進行中」にすると正式な企画になります。`);
    }
    default:
      throw new Error(`知らない道具です：${name}`);
  }
}

async function handle(env: Env, m: Rpc) {
  const id = m.id;
  switch (m.method) {
    case 'initialize': {
      const want = String(m.params?.protocolVersion ?? '');
      return ok(id, {
        protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'idea-flow', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      if (!TOOLS.some(t => t.name === name)) return err(id, -32602, `知らない道具です：${name}`);
      try { return ok(id, await callTool(env, name, (m.params?.arguments ?? {}) as Record<string, unknown>)); }
      catch (e) { return ok(id, text(e instanceof Error ? e.message : String(e), true)); }
    }
    case 'resources/list': return ok(id, { resources: [] });
    case 'prompts/list': return ok(id, { prompts: [] });
    default: return err(id, -32601, `対応していない method です：${m.method}`);
  }
}

export async function handleMcp(req: Request, env: Env, token: string): Promise<Response> {
  if (!env.MCP_TOKEN || !safeEqual(token, env.MCP_TOKEN)) return new Response('Not found', { status: 404 });
  if (req.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  let msg: Rpc | Rpc[];
  try { msg = await req.json(); } catch { return Response.json(err(null, -32700, 'JSON として読めません'), { status: 400 }); }
  const list = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of list) {
    if (!m || typeof m.method !== 'string') { out.push(err(m?.id ?? null, -32600, '不正なリクエストです')); continue; }
    if (m.id === undefined || m.id === null) continue; // 通知には返事をしない
    out.push(await handle(env, m));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(msg) ? out : out[0]);
}


