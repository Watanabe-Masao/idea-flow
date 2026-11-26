// Claude のコネクタ（MCP、Streamable HTTP）。会話の Claude が、決まりの見える化の結果を読んで人と相談するための入口。
// いまは読むだけ（GitHub にもアプリのデータにも書き込まない）。合言葉は URL の /mcp/<MCP_TOKEN>。
import type { Env } from './types.ts';
import { rulesView } from './rules.ts';
import { PLAIN_APPLIES } from './diagnosis.ts';
import { embedMany, loadVectors } from './embed.ts';
import { dot } from './vec.ts';
import { safeEqual } from './util.ts';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `idea-flow は、リポジトリの CLAUDE.md・ROLE.md・SKILL.md・決まりの文書を「決まりの単位（条項）」に分け、どこに効いているか、どんな問題があるかを見える化する道具です。
- これは人と Claude が相談するための道具です。決めるのは人です。見つかった問題は、事実（どの文書の何行目か、どう読まれるか）と、あなたの見立て（なぜ問題か、直し方の案、直したときの副作用）を分けて伝えてください。
- いまの道具は読むだけです。リポジトリやアプリの中身を変えることはできません。直し方の案は、人が確かめられるように具体的に（どの文書のどの行を、どう変えるか）書いてください。
- 人に伝えるときは、まず結論（rules_overview の診断書）から、ふだんの言葉で。件数や一覧は聞かれたら出す。道具の内側の言葉（finding の種類名など）は使わない。
- 届き方の意味：自動で届く（CLAUDE.md・AGENTS.md）／役割として届く（ROLE.md）／場面に合えば届く（スキル。説明文で呼ばれる）／渡さないと届かない（それ以外の文書）。
- 外から入れた決まり（ライセンスつきのスキルなど、書き換えないもの）は診断から外してある。
- 寿命（短期／長期）はまだ人が決めていないので、すべて「未分類」です。勝手に決めず、分類の案として出してください。
- 問題の種類（list_rule_findings の kind）：no_entry 入口が無い / unreferenced 入口からたどれない / duplicate 同じことが2か所 / definition 同じ言葉を2か所で説明 / conflict 食い違いかもしれない / temporary 終わったかもしれない / skill_overlap 似た場面で呼ばれるスキル。`;

const KIND_JA: Record<string, string> = { no_entry: '入口が無い', unreferenced: '入口からたどれない', duplicate: '同じことが2か所', definition: '同じ言葉を2か所で説明', conflict: '食い違いかもしれない', temporary: '終わったかもしれない', skill_overlap: '似た場面で呼ばれるスキル' };
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
        dg.conclusions.forEach((c, k) => out.push(`  ${k + 1}. ${c.title}`, `     なぜ困るか：${c.why}`, `     次の一手：${c.next}`, `     （詳しくは list_rule_findings kind=${c.kind}）`));
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
      const lines = [`${d.repo} ${d.path}「${d.title ?? ''}」［${APPLIES_JA[d.applies]}・範囲 ${d.scope || 'リポジトリ全体'}］ 決まり ${all.length}件中 ${off + 1}〜${off + page.length}`];
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

async function handle(env: Env, m: Rpc) {
  const id = m.id;
  switch (m.method) {
    case 'initialize': {
      const want = String(m.params?.protocolVersion ?? '');
      return ok(id, { protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'idea-flow', version: '0.2.0' }, instructions: INSTRUCTIONS });
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
    if (!m || typeof m.method !== 'string') { out.push(err((m as Rpc | undefined)?.id ?? null, -32600, '不正なリクエストです')); continue; }
    if (m.id === undefined || m.id === null) continue; // 通知には返事をしない
    out.push(await handle(env, m));
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(msg) ? out : out[0]);
}
