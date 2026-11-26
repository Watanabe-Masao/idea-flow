import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { saveSource, syncRules } from '../src/rules.ts';
import { decide, itemException, propose } from '../src/scopes.ts';
import { END, START, exportPr, exportPreview, mergeGuide, projectInstruction } from '../src/export.ts';

const FILES: Record<string, string> = {
  'docs/thread.md': '# 分担\n- 作業はメインで。\n',
  'docs/design.md': '# デザイン\n## 2. 色\n- 色はトークンで指定する。\n- 生の色を書かない。\n## 2.1 文字\n- 段は決めたものだけ。\n',
  'docs/moon.md': '# 絵本\n- 紺と金を使う。\n',
  '.claude/skills/gsap-core/SKILL.md': '---\nname: gsap-core\ndescription: GSAP の基本\n---\n# GSAP\n- tween\n',
};

function mock(extra: Record<string, string | null> = {}) {
  const repoFiles: Record<string, string | null> = { ...FILES, ...extra };
  const writes: { method: string; path: string; body: any }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL, init?: RequestInit) => {
    const url = new URL(String(u)), m = init?.method ?? 'GET';
    if (url.pathname === '/graphql') return new Response('nf', { status: 404 }); // まとめ読みは使わず、1つずつ読む
    if (m !== 'GET') { writes.push({ method: m, path: url.pathname, body: JSON.parse(String(init!.body)) }); return Response.json(url.pathname.endsWith('/pulls') ? { html_url: 'https://github.com/o/r/pull/9', number: 9 } : {}); }
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(repoFiles).filter(p => repoFiles[p] != null).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    if (url.pathname.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'base0' } });
    const c = url.pathname.match(/\/contents\/(.+)$/);
    if (c) { const p = decodeURIComponent(c[1]), t = repoFiles[p]; if (t == null) return new Response('nf', { status: 404 }); return (init?.headers as Record<string, string>)?.accept?.includes('raw') ? new Response(t) : Response.json({ sha: 'sha-' + p }); }
    if (url.pathname.endsWith('/commits')) return Response.json([]);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  return { writes, undo: () => { globalThis.fetch = real; } };
}

async function setup(env: any) {
  await saveSource(env, 'o/r', Object.keys(FILES));
  await syncRules(env, 'o/r');
  const t = await propose(env, 'o/r', 'human', '木', '', [
    { op: 'attach', scope: 'root', path: 'docs/thread.md' },
    { op: 'add_scope', key: 'screen', name: '画面', note: '画面・見た目・操作に触るとき' }, { op: 'attach', scope: 'screen', path: 'docs/design.md' },
    { op: 'add_scope', key: 'moon', name: '満月の物語', parent: 'screen' }, { op: 'attach', scope: 'moon', path: 'docs/moon.md' }, { op: 'attach', scope: 'moon', path: '.claude/skills/gsap-core/SKILL.md' },
    { op: 'add_exception', scope: 'moon', path: 'docs/design.md', heading: '2. 色' },
    { op: 'add_exception', scope: 'moon', path: 'docs/design.md', heading: itemException('2.1 文字', '段は決めたものだけ。') },
  ]);
  await decide(env, t.id, 'accept', null);
}

test('範囲の木から CLAUDE.md の道案内を作る（読む・スキル・使わない・上も守る）', async () => {
  const env = fakeEnv() as any; const m = mock();
  try {
    await setup(env);
    const pv = await exportPreview(env, 'o/r');
    const f = pv.files.find(x => x.path === 'CLAUDE.md')!;
    assert.equal(f.before, null);
    assert.match(f.after, /^# このリポジトリで Claude が守ること/);
    assert.match(f.after, /### すべての作業\n- 読む：`docs\/thread\.md`（分担）/);
    assert.match(f.after, /### 画面\nどんなとき：画面・見た目・操作に触るとき\n- 読む：`docs\/design\.md`（デザイン）/);
    assert.match(f.after, /#### 画面 › 満月の物語\n- 読む：`docs\/moon\.md`（絵本）\n- スキル（場面に合えば読み込まれる）：gsap-core\n- 使わない：`docs\/design\.md` の「2\. 色」\n- 使わない：`docs\/design\.md` の「2\.1 文字」の決まり「段は決めたものだけ。…」\n- 上の範囲の決まりも守る/);
    assert.equal(pv.canWrite, false);
    await assert.rejects(exportPr(env, 'o/r'), /GITHUB_WRITE_TOKEN/);
  } finally { m.undo(); }
});

test('いまの CLAUDE.md は、印の間だけ差し替える（印が無ければ末尾に足す）', () => {
  const g = `${START}\n新しい\n${END}`;
  assert.equal(mergeGuide(`# 手書き\n前\n${START}\n古い\n${END}\n後\n`, g), `# 手書き\n前\n${g}\n後\n`);
  assert.equal(mergeGuide('# 手書き\n本文\n\n', g), `# 手書き\n本文\n\n${g}\n`);
});

test('PR を出す：ブランチ → CLAUDE.md と承認した書き換え → PR。書き換えは出したものとして印を付ける', async () => {
  const env = fakeEnv() as any; env.GITHUB_WRITE_TOKEN = 'w';
  const m = mock({ 'CLAUDE.md': `# 手書きの決まり\n- テストを通す\n` });
  try {
    await setup(env);
    const ed = await propose(env, 'o/r', 'human', '書き換え', '', [{ op: 'edit', path: 'docs/design.md', heading: '2. 色', before: '- 生の色を書かない。', after: '- 生の色（#fff など）を書かない。' }]);
    await decide(env, ed.id, 'accept', null);
    const bad = await propose(env, 'o/r', 'human', '古い書き換え', '', [{ op: 'edit', path: 'docs/design.md', heading: '2. 色', before: '- もう無い文。', after: 'x' }]);
    await decide(env, bad.id, 'accept', null);
    const r = await exportPr(env, 'o/r');
    assert.equal(r.url, 'https://github.com/o/r/pull/9');
    assert.deepEqual(r.files.sort(), ['CLAUDE.md', 'docs/design.md']);
    assert.equal(r.skipped.length, 1);
    const [ref, ...rest] = m.writes;
    assert.equal(ref.path, '/repos/o/r/git/refs'); assert.equal(ref.body.sha, 'base0'); assert.match(ref.body.ref, /^refs\/heads\/idea-flow\/export-/);
    const put = rest.find(w => w.path.endsWith('/contents/CLAUDE.md'))!;
    const body = Buffer.from(put.body.content, 'base64').toString('utf8');
    assert.match(body, /^# 手書きの決まり\n- テストを通す\n\n<!-- idea-flow:start -->/);
    assert.equal(put.body.sha, 'sha-CLAUDE.md');
    const des = rest.find(w => w.path.endsWith('/contents/docs/design.md'))!;
    assert.match(Buffer.from(des.body.content, 'base64').toString('utf8'), /生の色（#fff など）を書かない/);
    const pr = rest.find(w => w.path.endsWith('/pulls'))!;
    assert.match(pr.body.body, /当てはまらなかった書き換え/);
    // 出した書き換えは、次の書き出しに入らない（当てはまらなかったものは残る）
    const after = await exportPreview(env, 'o/r');
    assert.deepEqual(after.edits.map(e => e.request), [bad.id]);
  } finally { m.undo(); }
});

test('claude.ai のプロジェクト用の指示文（コネクタで契約を読ませる）', async () => {
  const env = fakeEnv() as any; const m = mock();
  try {
    await setup(env);
    const t = await projectInstruction(env, 'o/r', 'moon');
    assert.match(t, /範囲「r（全体） › 画面 › 満月の物語」/);
    assert.match(t, /action="contract"（args: repo="o\/r", scope="moon"）/);
    assert.match(t, /メモリにある関係のない話/);
  } finally { m.undo(); }
});
