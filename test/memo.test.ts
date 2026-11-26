import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { saveMemo, upsertProject, projectFlow, memoMap, assignMemo, approveAiMemos, computeMemoSuggestions } from '../src/memo.ts';
import { handleMcp } from '../src/mcp.ts';

const rpc = async (env: never, body: unknown, token = 'tok') => {
  const r = await handleMcp(new Request('https://x/mcp/' + token, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), env, token);
  return { status: r.status, json: r.status === 200 ? await r.json() as any : null };
};

test('メモ：企画を作り、人のメモは手本、AIの指定は未承認、指定なしには候補が付く', async () => {
  const env = fakeEnv();
  const p1 = await upsertProject(env, { name: 'コールドムーン', note: '冬の満月の絵本。夜の森と月の光' }, 'human');
  const p2 = await upsertProject(env, { name: '天気アプリの予報', note: '予報の履歴と当たり方' }, 'human');
  assert.equal(p1.key, 'P01'); assert.equal(p2.key, 'P02');
  await saveMemo(env, { body: '表紙：冬の満月と夜の森を大きく描く', kind: '決定', project: 'P01' }, 'human');
  const ai = await saveMemo(env, { body: '8P：満月の光が森に差す場面', kind: '案', project: 'コールドムーン' }, 'ai');
  assert.equal(ai.place.how, 'ai'); assert.equal(ai.place.project, 'P01');
  const loose = await saveMemo(env, { body: '冬の満月の絵本の夜の森と月の光をもっと強く', kind: '案' }, 'ai');
  assert.equal(loose.memo.heading, null);
  // しきい値の初期値は「自動なし」なので、候補は確認待ちになる
  assert.equal(loose.place.how, 'pending'); assert.equal(loose.place.project, 'P01');
  const heading = await saveMemo(env, { body: '予報の履歴：天気アプリの予報の履歴を残す', kind: '決定' }, 'ai');
  assert.equal(heading.memo.heading, '予報の履歴');
  assert.equal(heading.place.project, 'P02');
  // AI は既存の企画を書き換えられず、作ると「候補」になる
  await assert.rejects(upsertProject(env, { key: 'P01', name: 'x' }, 'ai'));
  const c = await upsertProject(env, { name: '春の絵本', note: '桜' }, 'ai');
  assert.equal(c.status, '候補');
  // まとめて承認 → 手本になる
  assert.equal(await approveAiMemos(env, 'P01'), 1);
  const map = await memoMap(env);
  assert.equal(map.memos.find(m => m.id === ai.memo.id)!.h, 'accepted');
  // 人が「どこにも入れない」にしたら、候補は二度と付かない
  await assignMemo(env, loose.memo.id, null);
  await computeMemoSuggestions(env);
  assert.equal((await memoMap(env)).memos.find(m => m.id === loose.memo.id)!.h, 'none');
  const f = await projectFlow(env, 'コールドムーン');
  assert.equal(f.memos.length, 2);
  assert.equal(f.project.state, '動いている');
});

test('MCP：合言葉・初期化・道具の一覧・保存と読み込み', async () => {
  const env = fakeEnv();
  assert.equal((await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, 'bad')).status, 404);
  const init = await rpc(env, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.equal((await rpc(env, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const tools = await rpc(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(tools.json.result.tools.map((t: any) => t.name), ['list_projects', 'read_project', 'search_memos', 'save_memo', 'create_project']);
  const mk = await rpc(env, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_project', arguments: { name: 'ビーバームーン', note: '11月の満月の絵本' } } });
  assert.match(mk.json.result.content[0].text, /P01 ビーバームーン/);
  const sv = await rpc(env, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'save_memo', arguments: { body: '構成：ビーバーが川に巣を作る話', kind: '決定', project: 'P01' } } });
  assert.match(sv.json.result.content[0].text, /保存しました/);
  const rd = await rpc(env, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'read_project', arguments: { project: 'ビーバームーン' } } });
  assert.match(rd.json.result.content[0].text, /構成：ビーバーが川に巣を作る話/);
  const bad = await rpc(env, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'save_memo', arguments: { body: '' , kind: '案'} } });
  assert.equal(bad.json.result.isError, true);
  const sr = await rpc(env, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_memos', arguments: { query: 'ビーバーの巣' } } });
  assert.match(sr.json.result.content[0].text, /ビーバー/);
});
