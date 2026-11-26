import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { saveSource, syncRules } from '../src/rules.ts';
import { decide, propose } from '../src/scopes.ts';
import { activityView, parseReport, refreshActivity } from '../src/activity.ts';

test('PR の説明から申告を読む（見出しの名前で。なしは空）', () => {
  const r = parseReport('変えたこと\n\n## 確かめた決まり\n- `docs/moon.md`「動き」\n- `docs/design.md`「2.1 文字」\n## 決まりになく、自分で判断した所\n- 折る位置を空白にした\n## 足りなかった決まり\n- なし\n');
  assert.deepEqual(r, { read: ['`docs/moon.md`「動き」', '`docs/design.md`「2.1 文字」'], own: ['折る位置を空白にした'], lack: [] });
  assert.equal(parseReport('ふつうの説明だけ'), null);
  assert.deepEqual(parseReport('**確かめた決まり**\n- docs/a.md\n')!.read, ['docs/a.md']);
});

const FILES: Record<string, string> = {
  'docs/thread.md': '# 分担\n- 作業はメインで。\n',
  'docs/design.md': '# デザイン\n値は `src/design/tokens.ts`。部品は `src/ui/kit.tsx`。\n## 2. 色\n- トークンで指定する。\n',
  'docs/moon.md': '# 満月の物語\n画面は `src/ui/MoonStory.tsx`、絵は `src/design/story/`。\n- 紺と金を使う。\n',
  'docs/data.md': '# データの地図\n- 取り込みは `worker/src/index.ts`。\n',
};
const PRS = [
  { number: 3, title: '満月の物語：折り返し', html_url: 'https://github.com/o/r/pull/3', merged_at: '2026-11-26T08:00:00Z', body: '## 確かめた決まり\n- `docs/moon.md`「動き」\n- `docs/design.md`「2. 色」\n## 決まりになく、自分で判断した所\n- なし\n## 足りなかった決まり\n- 横書きの折り返し\n' },
  { number: 2, title: '監視の脚本', html_url: 'https://github.com/o/r/pull/2', merged_at: '2026-11-26T07:00:00Z', body: '## 確かめた決まり\n- `docs/moon.md`「動き」\n## 足りなかった決まり\n- なし\n' },
  { number: 1, title: 'ボタンの色', html_url: 'https://github.com/o/r/pull/1', merged_at: '2026-11-26T06:00:00Z', body: '説明だけ' },
  { number: 9, title: '閉じただけ', html_url: 'x', merged_at: null, body: '' },
];
const PR_FILES: Record<number, string[]> = { 3: ['src/ui/MoonStory.tsx', 'src/styles.css'], 2: ['worker/src/index.ts'], 1: ['src/ui/kit.tsx'] };

test('PR を取り込み、範囲・関係する決まり・申告を突き合わせる（範囲外・1つも確かめていない）', async () => {
  const env = fakeEnv() as any;
  const real = globalThis.fetch; let fileCalls = 0;
  globalThis.fetch = (async (u: string | URL) => {
    const url = new URL(String(u));
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(FILES).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    const c = url.pathname.match(/\/contents\/(.+)$/); if (c) return new Response(FILES[decodeURIComponent(c[1])]);
    if (url.pathname.endsWith('/commits')) return Response.json([]);
    const f = url.pathname.match(/\/pulls\/(\d+)\/files$/); if (f) { fileCalls++; return Response.json(PR_FILES[+f[1]].map(filename => ({ filename }))); }
    if (url.pathname.endsWith('/pulls')) return Response.json(PRS);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    await saveSource(env, 'o/r', Object.keys(FILES));
    await syncRules(env, 'o/r');
    const t = await propose(env, 'o/r', 'human', '木', '', [
      { op: 'attach', scope: 'root', path: 'docs/thread.md' },
      { op: 'add_scope', key: 'screen', name: '画面' }, { op: 'attach', scope: 'screen', path: 'docs/design.md' },
      { op: 'add_scope', key: 'moon', name: '満月の物語', parent: 'screen' }, { op: 'attach', scope: 'moon', path: 'docs/moon.md' },
      { op: 'add_exception', scope: 'moon', path: 'docs/design.md', heading: '2. 色' },
      { op: 'add_scope', key: 'data', name: 'データ' }, { op: 'attach', scope: 'data', path: 'docs/data.md' },
    ]);
    await decide(env, t.id, 'accept', null);
    let r = await refreshActivity(env, 'o/r', 2);
    assert.deepEqual(r, { added: 2, remaining: 1 });
    r = await refreshActivity(env, 'o/r', 2);
    assert.deepEqual(r, { added: 1, remaining: 0 });
    assert.equal(fileCalls, 3, '変えたファイルは1回だけ読む');
    const v = await activityView(env, 'o/r');
    assert.deepEqual(v.counts, { total: 3, reported: 2, warn: 2 });
    const [p3, p2, p1] = v.items;
    assert.deepEqual(p3.scopes, ['画面 › 満月の物語'], 'MoonStory は満月の物語（画面より細かい）');
    assert.equal(p3.state, 'warn');
    assert.match(p3.outside[0], /docs\/design\.md`「2\. 色」（「満月の物語」では使わないと決めた部分）/);
    assert.deepEqual(p3.report!.lack, ['横書きの折り返し']);
    assert.ok(p3.expected.find(e => e.path === 'docs/moon.md')!.confirmed);
    assert.deepEqual(p2.scopes, ['データ']);
    assert.equal(p2.none, true, 'データの範囲の決まりを1つも確かめていない');
    assert.match(p2.outside[0], /この作業の範囲では読まない文書/);
    assert.equal(p1.state, 'none');
    assert.deepEqual(p1.scopes, ['画面']);
  } finally { globalThis.fetch = real; }
});
