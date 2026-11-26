import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { contractText, decide, effective, excluded, propose, requests, scopeTree, type Op } from '../src/scopes.ts';
import { saveSource, syncRules, xray } from '../src/rules.ts';

const OPS: Op[] = [
  { op: 'attach', scope: 'root', path: 'docs/thread-rules.md' },
  { op: 'add_scope', key: 'screen', name: '画面' },
  { op: 'attach', scope: 'screen', path: 'docs/design-system.md' },
  { op: 'add_scope', key: 'moon', name: '満月の物語', parent: 'screen' },
  { op: 'attach', scope: 'moon', path: 'docs/moon-story.md' },
  { op: 'add_exception', scope: 'moon', path: 'docs/design-system.md', heading: '2. 色', why: '絵本は独自の色' },
  { op: 'add_scope', key: 'calc', name: '計算' },
  { op: 'attach', scope: 'calc', path: 'docs/engineering.md' },
];

test('範囲の木：提案 → 影響の一覧 → 承認で反映。引き継ぎと例外', async () => {
  const env = fakeEnv();
  const r = await propose(env, 'o/r', 'ai', '最初の木', '相談した内容', OPS);
  const moon = (r.preview as any[]).find(p => p.scope === 'moon');
  assert.deepEqual(moon.chain, ['r（全体）', '画面', '満月の物語']);
  assert.deepEqual(moon.starts.sort(), ['docs/design-system.md', 'docs/moon-story.md', 'docs/thread-rules.md']);
  assert.deepEqual(moon.newExceptions, ['docs/design-system.md#2. 色']);
  assert.equal((await scopeTree(env, 'o/r')).length, 0, '承認前は何も変わらない');
  await decide(env, r.id, 'accept', null);
  const t = await scopeTree(env, 'o/r');
  assert.equal(t.length, 4);
  const em = effective(t, 'o/r|moon');
  assert.deepEqual(em.docs.map(d => d.path), ['docs/thread-rules.md', 'docs/design-system.md', 'docs/moon-story.md']);
  const ec = effective(t, 'o/r|calc');
  assert.ok(!ec.docs.some(d => d.path === 'docs/design-system.md'), '横の範囲には効かない');
  assert.ok(excluded(em.exceptions, 'docs/design-system.md', '2. 色 › 2.0b テーマ'));
  assert.ok(!excluded(em.exceptions, 'docs/design-system.md', '2.1 文字の大きさ'));
  const c = contractText('o/r', t, 'o/r|moon');
  assert.match(c, /範囲：r（全体） › 画面 › 満月の物語/);
  assert.match(c, /使わない部分（例外）\n・docs\/design-system.md の「2. 色」：絵本は独自の色/);
  assert.match(c, /計算 の決まりは持ち込まない/);
  await assert.rejects(decide(env, r.id, 'accept', null), /もう決まっています/);
  await assert.rejects(propose(env, 'o/r', 'ai', 'x', '', [{ op: 'remove_scope', key: 'screen' }]).then(async x => decide(env, x.id, 'accept', null)), /下に範囲があるので消せません/);
  await assert.rejects(propose(env, 'o/r', 'ai', 'x', '', [{ op: 'add_scope', key: 'Bad Key', name: 'x' } as Op]), /key/);
  const rs = await requests(env, 'o/r');
  assert.equal(rs.find(x => x.id === r.id)!.status, 'accepted');
});

test('レントゲンに範囲を渡すと、範囲の文書は届き、例外の部分は外れる', async () => {
  const files: Record<string, string> = {
    'docs/thread-rules.md': '# 運用\n- 秘密の鍵は書かない\n',
    'docs/design-system.md': '# デザイン\n## 2. 色\n- 色は墨と灰青の2つだけを使う\n## 2.1 文字の大きさ\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n',
    'docs/moon-story.md': '# 絵本\n- 文字は明朝の縦書き\n',
    'docs/engineering.md': '# 計算\n- 式とパラメータを分ける\n',
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
    await saveSource(env, 'o/r', Object.keys(files));
    await syncRules(env, 'o/r');
    const r = await propose(env, 'o/r', 'human', '木', '', OPS);
    await decide(env, r.id, 'accept', null);
    const x = await xray(env, 'o/r', '色は墨と灰青の2つだけを使う', 'moon');
    assert.deepEqual(x.scope!.chain, ['r（全体）', '画面', '満月の物語']);
    assert.equal(x.scope!.excludedItems, 1, '「2. 色」の決まりは例外で外れる');
    assert.ok(!x.missing.some(m => m.path === 'docs/design-system.md'), '範囲で届く文書は「届かない」に出ない');
    const y = await xray(env, 'o/r', '式とパラメータを分ける', 'screen');
    assert.equal(y.missing[0]?.path, 'docs/engineering.md', '計算の決まりは画面の範囲には届かない');
  } finally { globalThis.fetch = real; }
});

import { suggestTree, draftTree } from '../src/scopes.ts';
test('木の案：まとめ役は全体に、参照のつながりで範囲、スキルは名前が出てくる範囲へ。下書きの木', async () => {
  const files: Record<string, string> = {
    'docs/hub.md': '# 運用\n- 画面は docs/screen.md、計算は docs/calc.md\n',
    'docs/screen.md': '# 画面の決まり\n- 動きは gsap で付ける\n- 手引きは docs/hub.md\n',
    'docs/calc.md': '# 計算の決まり\n- 地図は docs/calc-map.md\n- 運用は docs/hub.md\n' + Array.from({ length: 12 }, (_, i) => `- 決まり${i}の内容をここに書く\n`).join(''),
    'docs/calc-map.md': '# 計算の地図\n- 依存の向き\n',
    '.claude/skills/LICENSE': 'MIT',
    '.claude/skills/README.md': '# GSAP の決まり\n- 版を固定\n',
    '.claude/skills/gsap-core/SKILL.md': '---\nname: gsap-core\ndescription: GSAP\n---\n# x\n- y\n',
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
    await saveSource(env, 'o/r', Object.keys(files).filter(p => p.endsWith('.md')));
    await syncRules(env, 'o/r');
    const { ops, hub } = await suggestTree(env, 'o/r');
    assert.equal(hub, 'docs/hub.md');
    const t = await draftTree(env, 'o/r', ops);
    const calc = t.find(s => s.docs.includes('docs/calc.md'))!;
    assert.deepEqual(calc.docs.sort(), ['docs/calc-map.md', 'docs/calc.md']);
    assert.equal(calc.name, '計算の決まり');
    const screen = t.find(s => s.docs.includes('docs/screen.md'))!;
    assert.ok(screen.docs.includes('.claude/skills/gsap-core/SKILL.md') && screen.docs.includes('.claude/skills/README.md'), 'スキルは名前が出てくる範囲へ');
    assert.ok(!calc.docs.some(p => p.includes('gsap')));
    assert.equal((await scopeTree(env, 'o/r')).length, 0, '下書きは保存しない');
  } finally { globalThis.fetch = real; }
});
