import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, deadRefs, depsOf, dirsOf, unusedTech } from '../src/audit.ts';
import { fakeEnv } from './fakeenv.ts';
import { saveSource, syncRules, rulesView } from '../src/rules.ts';

const ALL = ['README.md', 'package.json', 'src/ui/Moon.tsx', 'shared/sky.ts', 'docs/design.md', 'docs/old-notes.md',
  'research/x/README.md', 'research/x/run.py', 'research/y/a-results.md', '.claude/skills/fw/SKILL.md', '.claude/skills/react/SKILL.md', '.github/ISSUE_TEMPLATE/bug.md'];

test('もう無いファイルを指している所を見つける（消したと書いてある行・作られる物・拡張子なしは除く）', () => {
  const all = new Set(ALL), dirs = dirsOf(ALL);
  const t = '# A\n## 7.4 似た日\n- 探す（`shared/similar.ts`）。\n- 空は shared/sky.ts\n- 画面は src/ui/Moon\n- 出力は research/types/out と node_modules/.bin/x\n- ワークフロー（.github/workflows/old.yml）は済んだので消した。\n';
  const r = deadRefs(t, all, dirs);
  assert.deepEqual(r.map(x => [x.ref, x.line, x.heading]), [['shared/similar.ts', 3, '7.4 似た日']]);
});

test('使っていない技術向けのスキル（別のスキルへ回す言い方は数えない）', () => {
  const deps = depsOf('{"dependencies":{"react":"19","gsap":"3"}}')!;
  assert.deepEqual(unusedTech('GSAP for Vue, Nuxt, Svelte, and other non-React frameworks. For React use gsap-react.', deps), ['Vue', 'Nuxt', 'Svelte']);
  assert.equal(unusedTech('Use when animating in React with useGSAP.', deps), null);
  assert.equal(unusedTech('Core GSAP tweens and easing.', deps), null);
  assert.equal(depsOf('not json'), null);
});

test('どこからも案内されていない文書（入口・フォルダの説明・ひな形・範囲に置いた文書は除く）', () => {
  const texts = new Map(Object.entries({
    'README.md': '# app\n詳しくは docs/design.md と research/x/ を見る\n',
    'docs/design.md': '# d\n', 'docs/old-notes.md': '# old\n', 'research/x/README.md': '# x\n', 'research/y/a-results.md': '# 結果\n| a | b |\n',
    '.claude/skills/fw/SKILL.md': '---\nname: fw\n---\n', '.claude/skills/react/SKILL.md': '---\nname: r\n---\n', '.github/ISSUE_TEMPLATE/bug.md': '# bug\n',
  }));
  const hits = audit({ all: ALL, texts, deps: new Set(['react']), placed: new Set(['docs/old-notes.md']), descriptions: new Map([['.claude/skills/fw/SKILL.md', 'For Vue and Svelte']]) });
  assert.deepEqual(hits.filter(h => h.kind === 'orphan').map(h => [h.path, h.detail.record]), [['research/y/a-results.md', true]]);
  assert.deepEqual(hits.filter(h => h.kind === 'skill_unused').map(h => h.path), ['.claude/skills/fw/SKILL.md']);
});

test('取り込みで、全部の .md を GraphQL でまとめて読み、候補を診断書に出す（消したコミットつき）', async () => {
  const files: Record<string, string> = {
    'CLAUDE.md': '# 全体\n- 決まりは docs/design.md を読む\n',
    'docs/design.md': '# デザイン\n## 色\n- 色は src/theme.ts で決める\n',
    'README.md': '# app\n## 似た日\n似た日は shared/similar.ts で探す\n',
    'research/a-results.md': '# 結果\n- 0.12\n',
    '.claude/skills/fw/SKILL.md': '---\nname: fw\ndescription: GSAP for Vue and Svelte. For React use gsap-react.\n---\n# fw\n- onMounted で作る\n',
    'package.json': '{"dependencies":{"react":"19"}}',
    'src/theme.ts': 'export {}',
  };
  const env = fakeEnv() as { GITHUB_TOKEN?: string };
  env.GITHUB_TOKEN = 't';
  let graphql = 0, contents = 0;
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL, init?: RequestInit) => {
    const url = new URL(String(u));
    if (url.pathname === '/graphql') {
      graphql++;
      const q = JSON.parse(String(init!.body)).query as string;
      const repo: Record<string, unknown> = {};
      for (const m of q.matchAll(/(f\d+):object\(expression:("(?:[^"\\]|\\.)*")\)/g)) { const p = JSON.parse(m[2]).split(':').slice(1).join(':'); repo[m[1]] = p in files ? { text: files[p] } : null; }
      return Response.json({ data: { repository: repo } });
    }
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    if (url.pathname.endsWith('/commits')) return Response.json(url.searchParams.get('path') === 'shared/similar.ts' ? [{ sha: 'a3929fe0000', commit: { message: '似た日から選ぶを「条件から選ぶ」に置き換える\n\n本文', committer: { date: '2026-11-19T10:00:00Z' } } }] : []);
    if (url.pathname.includes('/contents/')) { contents++; return new Response('nf', { status: 404 }); }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    await saveSource(env as never, 'o/r', ['CLAUDE.md', 'docs/design.md', '.claude/skills/fw/SKILL.md']);
    const r = await syncRules(env as never, 'o/r');
    assert.equal(r.readAll, true);
    assert.equal(graphql, 1);
    assert.equal(contents, 0, '1つずつは読まない');
    const v = await rulesView(env as never);
    const kinds = v.diagnosis['o/r'].conclusions.map(c => c.kind);
    for (const k of ['dead_ref', 'skill_unused', 'orphan']) assert.ok(kinds.includes(k), k);
    const dead = v.diagnosis['o/r'].conclusions.find(c => c.kind === 'dead_ref')!;
    assert.match(dead.list![0], /README\.md 3行目「似た日」 → shared\/similar\.ts（2026-11-19 a3929fe「似た日から選ぶを「条件から選ぶ」に置き換える」で消えた）/);
    assert.match(v.diagnosis['o/r'].conclusions.find(c => c.kind === 'orphan')!.list![0], /research\/a-results\.md（記録・結果の文書）/);
  } finally { globalThis.fetch = real; }
});
