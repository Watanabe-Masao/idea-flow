import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { saveSource, syncRules } from '../src/rules.ts';
import { handleMcp } from '../src/mcp.ts';
import { termsOf } from '../src/rules-parse.ts';

const rpc = async (env: never, body: unknown, token = 'tok') => {
  const r = await handleMcp(new Request('https://x/mcp/' + token, { method: 'POST', body: JSON.stringify(body) }), env, token);
  return { status: r.status, json: r.status === 200 ? await r.json() as any : null };
};
const call = async (env: never, name: string, args: Record<string, unknown> = {}) =>
  (await rpc(env, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).json.result;

test('言葉の取り出し：識別子とかぎかっこ', () => {
  const t = termsOf('慣れ-D は「手前の平均」で、L1・L2 と history.long.mean を使う');
  assert.ok(t.has('手前の平均') && t.has('L1') && t.has('history.long.mean'));
  assert.ok(!t.has('D'));
});

test('MCP：合言葉・初期化・道具・読むだけの道具で見える化の結果を読める', async () => {
  const files: Record<string, string> = {
    'docs/design.md': '# デザイン\n## 文字\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n- 今回は表の列を増やさない\n',
    'docs/story.md': '# 絵本\n## 文字\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n',
  };
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const url = new URL(String(u));
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    const m = url.pathname.match(/\/contents\/(.+)$/);
    return m ? new Response(files[decodeURIComponent(m[1])]) : new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const env = fakeEnv();
    assert.equal((await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, 'bad')).status, 404);
    const init = await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    assert.equal(init.json.result.protocolVersion, '2025-06-18');
    assert.match(init.json.result.instructions, /決めるのは人/);
    assert.equal((await rpc(env, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const tools = (await rpc(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json.result.tools;
    assert.deepEqual(tools.map((t: any) => t.name), ['rules_overview', 'list_rule_findings', 'read_rule_doc', 'search_rules']);
    assert.ok(tools.every((t: any) => t.annotations.readOnlyHint));
    assert.match((await call(env, 'rules_overview')).content[0].text, /まだ何も取り込まれていません/);
    await saveSource(env, 'o/r', Object.keys(files));
    await syncRules(env, 'o/r');
    const ov = (await call(env, 'rules_overview')).content[0].text;
    assert.match(ov, /自動で読まれる文書（CLAUDE.md・AGENTS.md）が無い/);
    assert.match(ov, /docs\/design.md［参照されたときだけ］決まり 2/);
    const fl = (await call(env, 'list_rule_findings', { kind: 'duplicate' })).content[0].text;
    assert.match(fl, /\[重複\] key=duplicate\|/);
    assert.match(fl, /docs\/story.md:3/);
    const rd = (await call(env, 'read_rule_doc', { repo: 'o/r', path: 'docs/design.md' })).content[0].text;
    assert.match(rd, /## 文字\n3: 文字は Noto Sans JP/);
    assert.equal((await call(env, 'read_rule_doc', { repo: 'o/r', path: 'x.md' })).isError, true);
    assert.match((await call(env, 'search_rules', { query: '文字は Noto Sans JP' })).content[0].text, /近さ/);
  } finally { globalThis.fetch = real; }
});
