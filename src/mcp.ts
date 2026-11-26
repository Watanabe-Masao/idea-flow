// Claude のコネクタ（MCP、Streamable HTTP）。会話の Claude が、決まりの見える化の結果を読んで人と相談するための入口。
// いまは読むだけ（GitHub にもアプリのデータにも書き込まない）。合言葉は URL の /mcp/<MCP_TOKEN>。
import type { Env } from './types.ts';
import { rulesView } from './rules.ts';
import { LIST, PLAIN_APPLIES } from './diagnosis.ts';
import { embedMany, loadVectors } from './embed.ts';
import { dot } from './vec.ts';
import { safeEqual } from './util.ts';
import { mapAction } from './mcpmap.ts';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `（道具は idea_flow ひとつを使う。action="help" でできることを確かめる。ほかの道具は古い会話のために残しているもの）
idea-flow は開発の地図です。機能ごとの作業（マージした PR）・Issue の経過とつながり・決まりの文書を、GitHub から読んで見せます。読むだけで、リポジトリにもアプリのデータにも書き込みません。決めるのは人です。
- 作業を始める前に読む：action="map"（全体）→ 作業する機能の action="feature" → 関係する Issue の action="issue"（つながりと根拠）。どの機能・どの Issue の作業かを決めてから進める。分からなければ、作業の前に人に聞く。
- つながりの種類：これで閉じた／番号で参照（PR の題・説明か Issue の本文に「#番号」）／引き継ぎ元・引き継ぎ先（「#299 P2」「#142 の続き」）／推測（候補）。推測は同じ機能のファイルを変えた PR を並べただけで、確定ではない。確定のように話さない。
- 状態：直近7日に作業なし＝止まっている、直近4日に3件以上＝作っている、それ以外＝落ち着いた。「古くなっている候補」は、つながる機能がすべて止まっていて7日以上動いていない開いた Issue。閉じるかを決めるのは人。
- 人に伝えるときは、まず結論から、ふだんの言葉で。件数や一覧は聞かれたら出す。
- 決まりの文書：action="overview"（診断書と文書の一覧）・findings・read_doc・search。届き方：自動で届く（CLAUDE.md・AGENTS.md）／役割として届く（ROLE.md）／場面に合えば届く（スキル）／渡さないと届かない（それ以外）。
- 問題の種類（findings の kind）：no_entry 入口が無い / unreferenced 入口からたどれない / duplicate 同じことが2か所 / definition 同じ言葉を2か所で説明 / conflict 食い違いかもしれない / temporary 終わったかもしれない / skill_overlap 似た場面で呼ばれるスキル / dead_ref もう無いファイルを指している / skill_unused 使っていない技術向けのスキル / orphan どこからも案内されていない文書。消す・直すを決めるのは人。`;

const KIND_JA: Record<string, string> = { no_entry: '入口が無い', unreferenced: '入口からたどれない', duplicate: '同じことが2か所', definition: '同じ言葉を2か所で説明', conflict: '食い違いかもしれない', temporary: '終わったかもしれない', skill_overlap: '似た場面で呼ばれるスキル', dead_ref: 'もう無いファイルを指している', skill_unused: '使っていない技術向けのスキル', orphan: 'どこからも案内されていない' };
const APPLIES_JA = PLAIN_APPLIES;

const TOOLS = [
  {
    name: 'rules_overview',
    description: '取り込んだリポジトリごとの診断書（結論・なぜ困るか・次の一手）を返す。最初に使う。docs=true で文書の一覧（届き方・決まりの数）も付ける。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/name（省略するとすべて）' }, docs: { type: 'boolean', description: '文書の一覧も付ける' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_rule_findings',
    description: '見つかった問題の一覧。人が「問題ではない」にしたものは含まない。各問題に key（識別子）、関係する決まりの本文、文書と行が付く。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: Object.keys(KIND_JA), description: '問題の種類で絞る' },
        repo: { type: 'string' }, limit: { type: 'number', description: '初期値 15、最大 50' }, offset: { type: 'number' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'read_rule_doc',
    description: '1つの文書の決まりを、見出しごとに行番号つきで読む。長い文書は heading で見出しを絞るか、offset で続きを読む。',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, heading: { type: 'string', description: '見出しの一部（含むものだけ）' }, offset: { type: 'number' }, limit: { type: 'number', description: '初期値 80、最大 200' } }, required: ['repo', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_rules',
    description: '意味の近い決まりを探す。「この話題の決まりはどこに散らばっているか」「この変更で影響しそうな決まりはどれか」を調べるときに使う。',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, repo: { type: 'string' }, limit: { type: 'number', description: '初期値 10、最大 30' } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

/**
 * ひとつの入口。会話は始めた時点の道具の一覧を使い続けるので、機能を足しても一覧が変わらないように、
 * 「何をするか（action）」と「中身（args）」を渡す形にする。新しい機能は action を足すだけ。
 */
const ACTIONS: Record<string, { tool: string; summary: string }> = {
  help: { tool: '', summary: 'できること（action）の一覧と、それぞれの args' },
  map: { tool: 'map', summary: '地図の全体：機能ごとの状態・開いている Issue・古くなっている候補・どの機能にも当たらない作業。作業の前に最初に読む。args: repo?, span?（日数）, refresh?' },
  feature: { tool: 'map', summary: '機能の中身：使うデータ・最近の作業（申告つき）・開いている Issue。args: id か name, repo?' },
  issue: { tool: 'map', summary: 'Issue の周辺：つながる PR・Issue と、その種類と根拠（どこに書いてあったか）。args: n, repo?' },
  issues: { tool: 'map', summary: 'Issue の一覧。args: state?（open／closed／stale／all）, repo?' },
  review: { tool: 'map', summary: '週1回の見直しの材料：古くなっている候補・当たらない作業・書き方の守り具合・足りなかった決まり・止まっている機能・画面のないデータ（決めるのは人）。args: repo?' },
  sync: { tool: 'map', summary: 'GitHub から PR と Issue を読み直す（ふだんは30分ごとに自動）。args: repo?' },
  overview: { tool: 'rules_overview', summary: '診断書（結論・なぜ困るか・次の一手）。args: repo?, docs?' },
  findings: { tool: 'list_rule_findings', summary: '問題の一覧。args: repo?, kind?, limit?, offset?' },
  read_doc: { tool: 'read_rule_doc', summary: '文書を見出しごとに行番号つきで。args: repo, path, heading?, offset?, limit?' },
  search: { tool: 'search_rules', summary: '意味の近い決まりを探す。args: query, repo?, limit?' },
};
const ENTRY = {
  name: 'idea_flow',
  description: 'idea-flow のひとつの入口。action と args を渡す。作業の前に action="map"（地図の全体）→ feature（機能）→ issue（Issue の周辺と根拠）を読む。決まりの文書は overview・findings・read_doc・search。action="help" でできることを確かめる。',
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', description: 'help / map / feature / issue / issues / review / sync / overview / findings / read_doc / search（ほかにも増える。help で確かめる）' }, args: { type: 'object', description: 'action ごとの中身（help で確かめる）' } },
    required: ['action'], additionalProperties: false,
  },
};

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const err = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
const num = (v: unknown, d: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d));

type View = Awaited<ReturnType<typeof rulesView>>;
type ItemRow = { id: string; doc: string; n: number; heading: string; text: string; line: number; kind: string };

function where(v: View, it: ItemRow) {
  const d = v.docs.find(x => x.id === it.doc)!;
  return `${d.repo} ${d.path}:${it.line}${it.heading ? `（${it.heading}）` : ''}［${APPLIES_JA[d.applies]}］`;
}

async function callTool(env: Env, name: string, a: Record<string, unknown>) {
  const v = await rulesView(env);
  const items = v.items as unknown as ItemRow[];
  const repoOk = (r: string) => !a.repo || r === a.repo;
  switch (name) {
    case 'rules_overview': {
      const repos = Object.keys(v.diagnosis).filter(repoOk);
      if (!v.docs.some(d => repoOk(d.repo))) return text('まだ何も取り込まれていません。アプリの「決まり」タブで取り込んでもらってください。');
      const out: string[] = [];
      for (const r of repos) {
        const s = v.sources.find(x => x.repo === r), ds = v.docs.filter(d => d.repo === r), dg = v.diagnosis[r];
        if (!ds.length) continue;
        out.push(`■ ${r} の診断（取り込み ${s?.synced_at ? s.synced_at.slice(0, 16).replace('T', ' ') + ' UTC' : 'まだ'}・文書 ${ds.length}・決まり ${items.filter(i => ds.some(d => d.id === i.doc)).length}）`);
        if (!dg.conclusions.length) out.push('  問題は見つかっていません。');
        dg.conclusions.forEach((c, k) => out.push(`  ${k + 1}. ${c.title}`, `     なぜ困るか：${c.why}`, `     次の一手：${c.next}`, ...(c.list ?? []).slice(0, 5).map(l => `     ・${l}`), `     （詳しくは list_rule_findings kind=${c.kind}）`));
        if (dg.external.length) out.push(`  外から入れた決まり（書き換えないもの。診断から外している）：${dg.external.length}件（${dg.external.slice(0, 3).join('、')}${dg.external.length > 3 ? ' ほか' : ''}）`);
        if (a.docs) for (const d of ds) out.push(`  - ${d.path}［${APPLIES_JA[d.applies]}${d.external ? '・外から入れたもの' : ''}］決まり ${items.filter(i => i.doc === d.id).length}`);
      }
      if (v.dismissed) out.push(`（人が「問題ではない」にしたもの ${v.dismissed}件は数えていません）`);
      return text(out.join('\n'));
    }
    case 'list_rule_findings': {
      const docRepo = (id: string) => v.docs.find(d => d.id === id)?.repo ?? v.docs.find(d => d.id === items.find(i => i.id === id)?.doc)?.repo ?? (id.endsWith('|') ? id.slice(0, -1) : undefined);
      const fl = v.findings.filter(f => (!a.kind || f.kind === a.kind) && (!a.repo || docRepo(f.a) === a.repo || (f.b && docRepo(f.b) === a.repo)));
      const off = num(a.offset, 0, 100000), lim = num(a.limit, 15, 50) || 15;
      const page = fl.slice(off, off + lim);
      const lines = [`${fl.length}件中 ${off + 1}〜${off + page.length}件目${a.kind ? `（${KIND_JA[String(a.kind)]}）` : ''}`];
      for (const f of page) {
        lines.push('', `[${KIND_JA[f.kind]}] key=${f.key}${f.score != null ? `・近さ ${(+f.score).toFixed(2)}` : ''}`);
        if (f.kind === 'no_entry') {
          lines.push(`  渡さないと届かない文書 ${f.detail.docs.length}件（決まり ${f.detail.items}件）：${f.detail.docs.join('、')}`);
          for (const c of f.detail.candidates ?? []) lines.push(`  入口の候補：${c.path} → 参照をたどって ${c.reaches.join('、')} に届く`);
          lines.push('  ※候補は参照されている数（まとめ役かどうか）と届く数で選んだもの。入口の決まりは全体に効くので、全体に効いてよい中身かは人が確かめる');
        } else if (f.kind === 'unreferenced') {
          const d = v.docs.find(x => x.id === f.a)!;
          lines.push(`  ${d.repo} ${d.path}（決まり ${items.filter(i => i.doc === d.id).length}）${f.detail.from?.length ? `・参照しているのは ${f.detail.from.join('、')}（どれも入口から届かない）` : '・どこからも参照されていない'}`);
        } else if (f.kind in LIST) {
          for (const l of LIST[f.kind](f)) lines.push(`  ${l}`);
          if (f.kind === 'dead_ref') for (const r of f.detail.refs) lines.push(`    ${r.line}: ${r.text}`);
        } else if (f.kind === 'skill_overlap') {
          for (const id of [f.a, f.b]) { const d = v.docs.find(x => x.id === id); if (d) lines.push(`  ${d.path}：${d.description ?? ''}`); }
        } else {
          for (const id of [f.a, f.b]) { const it = items.find(i => i.id === id); if (it) lines.push(`  ${where(v, it)}`, `    ${it.text}`); }
          if (f.kind === 'temporary') lines.push(`  当たった言葉：「${f.detail.word}」`);
          if (f.kind === 'definition') lines.push(`  同じ言葉：${(f.detail.terms ?? []).join('、')}`);
        }
      }
      if (off + page.length < fl.length) lines.push('', `続きは offset=${off + page.length}`);
      return text(lines.join('\n'));
    }
    case 'read_rule_doc': {
      const d = v.docs.find(x => x.repo === a.repo && x.path === a.path);
      if (!d) return text(`${a.repo} ${a.path} は取り込まれていません。rules_overview で文書の一覧を確かめてください。`, true);
      const all = items.filter(i => i.doc === d.id && (!a.heading || i.heading.includes(String(a.heading))));
      const off = num(a.offset, 0, 100000), lim = num(a.limit, 80, 200) || 80;
      const page = all.slice(off, off + lim);
      const lines = [`${d.repo} ${d.path}「${d.title ?? ''}」［${APPLIES_JA[d.applies]}・効く場所 ${d.scope || 'リポジトリ全体'}］ 決まり ${all.length}件中 ${off + 1}〜${off + page.length}`];
      if (d.description) lines.push(`説明文：${d.description}`);
      let h = '';
      for (const it of page) { if (it.heading !== h) { h = it.heading; lines.push('', `## ${h || '（見出しなし）'}`); } lines.push(`${it.line}: ${it.text}`); }
      if (off + page.length < all.length) lines.push('', `続きは offset=${off + page.length}`);
      return text(lines.join('\n'));
    }
    case 'search_rules': {
      const q = String(a.query ?? '').trim().slice(0, 300);
      if (!q) return text('query が空です', true);
      const [qv] = await embedMany(env, [q]);
      const vecs = await loadVectors(env, 'rule');
      const lim = num(a.limit, 10, 30) || 10;
      const hits = items.filter(i => vecs.has(i.id) && repoOk(v.docs.find(d => d.id === i.doc)?.repo ?? ''))
        .map(i => ({ i, s: dot(qv, vecs.get(i.id)!) })).sort((x, y) => y.s - x.s).slice(0, lim);
      return text(hits.length ? hits.map(({ i, s }) => `近さ ${s.toFixed(2)}  ${where(v, i)}\n  ${i.text}`).join('\n') : '見つかりませんでした。');
    }
    default:
      throw new Error(`知らない道具です：${name}`);
  }
}

async function callEntry(env: Env, action: string, args: Record<string, unknown>) {
  if (action === 'help' || !ACTIONS[action]) {
    const head = action === 'help' ? '' : `「${action}」という action はありません。\n\n`;
    return text(head + 'idea_flow の action（args は JSON のオブジェクトで渡す）\n' + Object.entries(ACTIONS).filter(([k]) => k !== 'help').map(([k, v]) => `- ${k}：${v.summary}`).join('\n'), action !== 'help');
  }
  if (ACTIONS[action].tool === 'map') return text(await mapAction(env, action, args));
  return callTool(env, ACTIONS[action].tool, args);
}

async function handle(env: Env, m: Rpc) {
  const id = m.id;
  switch (m.method) {
    case 'initialize': {
      const want = String(m.params?.protocolVersion ?? '');
      return ok(id, { protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'idea-flow', version: '0.4.0' }, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: [ENTRY, ...TOOLS] });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      if (name !== ENTRY.name && !TOOLS.some(t => t.name === name)) return err(id, -32602, `知らない道具です：${name}`);
      try {
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        if (name === ENTRY.name) return ok(id, await callEntry(env, String(args.action ?? 'help'), (args.args ?? {}) as Record<string, unknown>));
        return ok(id, await callTool(env, name, args));
      }
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
    if (!m || typeof m.method !== 'string') { out.push(err((m as Rpc | undefined)?.id ?? null, -32600, '不正なリクエストです')); continue; }
    if (m.id === undefined || m.id === null) continue; // 通知には返事をしない
    out.push(await handle(env, m));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(msg) ? out : out[0]);
}
