import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { saveSource, syncRules } from '../src/rules.ts';
import { sectionsOf } from '../src/rules-parse.ts';
import { summarizeStep, summariesOf, leadOf } from '../src/summary.ts';
import { excluded, itemException, propose, decide } from '../src/scopes.ts';

export const FILES: Record<string, string> = {
  'CLAUDE.md': '# 全体\n- 決まりは docs/design.md を読む\n',
  'docs/design.md': '# デザイン\n前置きの文。\n\n## 2. 色\n- **対象日と比較日は色で分けない**：線の種類で分ける。\n- **3色は互いの性格を取り入れる**：文字は温かい白。\n\n## 2.1 文字の大きさ\n- 段は決めたものだけ使う。\n',
  'docs/story.md': '# 絵本\n## 色\n- 紺と金を使う。\n',
};
export function mockGithub(files = FILES) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const url = new URL(String(u));
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    const m = url.pathname.match(/\/contents\/(.+)$/);
    if (m) return new Response(files[decodeURIComponent(m[1])]);
    if (url.pathname.endsWith('/commits')) return Response.json([]);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

test('見出しごとの原文（決まりの単位と同じ見出しの書き方）', () => {
  const s = sectionsOf(FILES['docs/design.md']);
  assert.deepEqual(s.map(x => [x.heading, x.line]), [['', 1], ['2. 色', 4], ['2.1 文字の大きさ', 8]]);
  // 本文の行は「見出しの行 + 1」から数える（決まりの行番号から、元の書き方を切り出せる）
  assert.equal(s[1].md.split('\n')[5 - 4 - 1], '- **対象日と比較日は色で分けない**：線の種類で分ける。');
  assert.equal(s[0].md.split('\n')[2 - 1 - 1], '前置きの文。');
});

test('決まり1つだけの例外（見出しの例外は今までどおり）', () => {
  const ex = [{ path: 'd.md', heading: itemException('2. 色', '3色は互いの性格を取り入れる：文字は温かい白。') }];
  assert.ok(excluded(ex, 'd.md', '2. 色', '3色は互いの性格を取り入れる：文字は温かい白。'));
  assert.ok(!excluded(ex, 'd.md', '2. 色', '対象日と比較日は色で分けない：線の種類で分ける。'));
  assert.ok(!excluded(ex, 'd.md', '2.1 文字の大きさ', '3色は互いの性格を取り入れる'));
  assert.ok(excluded([{ path: 'd.md', heading: '2. 色' }], 'd.md', '2. 色', 'なんでも'));
});

test('取り込み → 要約を少しずつ作る（見出し → 文書 → 範囲）。中身が同じなら作り直さない', async () => {
  const env = fakeEnv();
  const undo = mockGithub();
  try {
    await saveSource(env, 'o/r', Object.keys(FILES));
    await syncRules(env, 'o/r');
    const p = await propose(env, 'o/r', 'human', '木', '', [{ op: 'add_scope', key: 'screen', name: '画面' }, { op: 'attach', scope: 'screen', path: 'docs/design.md' }]);
    await decide(env, p.id, 'accept', null);
    let r = await summarizeStep(env, 'o/r', 1);
    assert.equal(r.calls, 1);
    assert.ok(r.remaining > 0);
    for (let k = 0; k < 10 && r.remaining; k++) r = await summarizeStep(env, 'o/r', 4);
    assert.equal(r.remaining, 0);
    const s = await summariesOf(env, ['head|o/r|docs/design.md|2. 色', 'doc|o/r|docs/design.md', 'scope|o/r|screen']);
    assert.equal(s['head|o/r|docs/design.md|2. 色'].text, '要約:2. 色');
    assert.equal(s['head|o/r|docs/design.md|2. 色'].by, 'ai');
    assert.match(s['doc|o/r|docs/design.md'].text, /^要約:/);
    assert.match(s['scope|o/r|screen'].text, /^要約:画面/);
    const again = await summarizeStep(env, 'o/r', 4);
    assert.equal(again.calls, 0, '変わっていなければ AI を呼ばない');
  } finally { undo(); }
});

test('先頭の文で代用する要約', () => {
  assert.equal(leadOf('**対象日と比較日は色で分けない**：線で分ける'), '対象日と比較日は色で分けない');
  assert.equal(leadOf('段は決めたものだけ使う。間は作らない'), '段は決めたものだけ使う');
});

test('ピンと書き換えを変更リクエストに → 相談のプロンプト（効いている範囲・使わない範囲）→ Claude が返事 → 承認しても木は変わらない', async () => {
  const env = fakeEnv();
  const undo = mockGithub();
  try {
    await saveSource(env, 'o/r', Object.keys(FILES));
    await syncRules(env, 'o/r');
    const t = await propose(env, 'o/r', 'human', '木', '', [
      { op: 'add_scope', key: 'screen', name: '画面' }, { op: 'attach', scope: 'screen', path: 'docs/design.md' },
      { op: 'add_scope', key: 'moon', name: '満月の物語', parent: 'screen' },
      { op: 'add_exception', scope: 'moon', path: 'docs/design.md', heading: itemException('2. 色', '3色は互いの性格を取り入れる：文字は温かい白。') },
    ]);
    await decide(env, t.id, 'accept', null);
    const ops = [
      { op: 'pin' as const, path: 'docs/design.md', heading: '2. 色', item: '3色は互いの性格を取り入れる：文字は温かい白。', note: '文字の色を仕様にまとめたい' },
      { op: 'edit' as const, path: 'docs/design.md', heading: '2.1 文字の大きさ', before: '- 段は決めたものだけ使う。', after: '- 段は決めたものだけ使う。間の大きさは作らない。' },
    ];
    const { consultPrompt, consultFor } = await import('../src/consult.ts');
    const txt = await consultPrompt(env, 'o/r', ops);
    assert.match(txt, /### 見直しのピン：デザイン「2\. 色：3色は互いの性格/);
    assert.match(txt, /人のメモ：文字の色を仕様にまとめたい/);
    assert.match(txt, /この決まりが効いている範囲：\n- 全体 › 画面|この決まりが効いている範囲：\n- r（全体） › 画面/);
    assert.match(txt, /この決まりを使わない設定の範囲：\n- .*満月の物語（「満月の物語」で使わない設定）/);
    assert.match(txt, /書き換えたあと：\n```\n- 段は決めたものだけ使う。間の大きさは作らない。/);
    assert.match(txt, /## 答え方/);
    const p = await propose(env, 'o/r', 'human', '見直し', '', ops);
    const { addComment, requests } = await import('../src/scopes.ts');
    await addComment(env, p.id, 'ai', '事実：…／見立て：…');
    const byId = await consultFor(env, p.id);
    assert.match(byId, /これまでのやり取り\n- Claude：事実/);
    assert.match(byId, new RegExp(`action="comment"（args: id="${p.id}"`));
    const { scopeTree } = await import('../src/scopes.ts');
    const before = JSON.stringify(await scopeTree(env, 'o/r'));
    await decide(env, p.id, 'accept', null);
    const rs = await requests(env, 'o/r') as unknown as { id: string; status: string; comments: unknown[] }[];
    assert.equal(rs.find(r => r.id === p.id)!.status, 'accepted');
    assert.equal(rs.find(r => r.id === p.id)!.comments.length, 1);
    assert.equal(JSON.stringify(await scopeTree(env, 'o/r')), before, '範囲の木は変わらない');
  } finally { undo(); }
});
