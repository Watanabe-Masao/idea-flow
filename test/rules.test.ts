import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, defaultPick, parseRules, TEMP_WORDS } from '../src/rules-parse.ts';
import { fakeEnv } from './fakeenv.ts';
import { listFiles, saveSource, syncRules, rulesView, dismiss } from '../src/rules.ts';

const DOC = `# 画面の決まり

## 1. 文字
- 文字は Noto Sans JP を使う。
- 11px より小さい文字は出さない。
  単位も例外にしない。
- 今回は表の列を増やさない。

| 段 | 大きさ |
|---|---|
| xs | 11px |

\`\`\`ts
// コードの中は決まりにしない
\`\`\`

参照：docs/other.md
`;

test('文書を決まりの単位に分ける（箇条書き・続きの行・表・コードは飛ばす・参照）', () => {
  const p = parseRules(DOC, 'doc');
  assert.equal(p.title, '画面の決まり');
  assert.deepEqual(p.items.map(i => i.kind), ['item', 'item', 'item', 'row', 'para']);
  assert.match(p.items[1].text, /単位も例外にしない/);
  assert.equal(p.items[0].heading, '1. 文字');
  assert.equal(p.items[3].text, '段：xs / 大きさ：11px');
  assert.ok(!p.items.some(i => /コードの中/.test(i.text)));
  assert.deepEqual(p.refs, ['docs/other.md']);
  assert.ok(TEMP_WORDS.test(p.items[2].text));
});

test('スキルは説明文を「読み込まれ方」として取り出す', () => {
  const p = parseRules('---\nname: gsap-core\ndescription: Use when animating with GSAP.\n---\n# GSAP\n- tweens を使う\n', 'skill');
  assert.equal(p.items[0].kind, 'desc');
  assert.equal(p.title, 'gsap-core');
  assert.deepEqual(classify('.claude/skills/x/SKILL.md'), { kind: 'skill', applies: 'skill', scope: '.claude/skills/x' });
  assert.deepEqual(classify('app/CLAUDE.md'), { kind: 'claude', applies: 'always', scope: 'app' });
  assert.ok(defaultPick('docs/a.md') && !defaultPick('research/a.md') && defaultPick('src/CLAUDE.md'));
});

test('取り込み → 問題（重複・一時的・どこからも読まれない）→ 問題ではないにする', async () => {
  const files: Record<string, string> = {
    'CLAUDE.md': '# 全体\n- 決まりは docs/design.md を読む\n',
    'docs/design.md': '# デザイン\n## 文字\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n- 今回は表の列を増やさない\n',
    'docs/story.md': '# 絵本\n## 文字\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n',
    'research/x.md': '# 研究\n- メモ\n',
  };
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const url = new URL(String(u));
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    const m = url.pathname.match(/\/contents\/(.+)$/);
    if (m) return new Response(files[decodeURIComponent(m[1])]);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const env = fakeEnv();
    const lf = await listFiles(env, 'o/r');
    assert.deepEqual(lf.files.filter(f => f.picked).map(f => f.path), ['CLAUDE.md', 'docs/design.md', 'docs/story.md']);
    await saveSource(env, 'o/r', ['CLAUDE.md', 'docs/design.md', 'docs/story.md']);
    const r = await syncRules(env, 'o/r');
    assert.equal(r.docs, 3);
    const v = await rulesView(env);
    const kinds = v.findings.map(f => f.kind);
    assert.ok(kinds.includes('duplicate'), '別の文書の同じ決まりは重複');
    assert.ok(kinds.includes('temporary'));
    const un = v.findings.filter(f => f.kind === 'unreferenced').map(f => f.a);
    assert.deepEqual(un, ['o/r|docs/story.md'], 'CLAUDE.md からたどれない文書だけ');
    const t = v.findings.find(f => f.kind === 'temporary')!;
    await dismiss(env, t.key, '気象の言葉');
    await syncRules(env, 'o/r');
    assert.ok(!(await rulesView(env)).findings.some(f => f.key === t.key), '問題ではないにしたものは、取り込み直しても出ない');
  } finally { globalThis.fetch = real; }
});

import { resolveRef, externalByLicense } from '../src/rules-parse.ts';
import { diagnose } from '../src/diagnosis.ts';

test('参照のパスを直す（同じフォルダ・上のフォルダ・リポジトリの根から）', () => {
  const known = new Set(['docs/thread-rules.md', 'README.md', 'docs/a.md']);
  assert.equal(resolveRef('docs/data-map.md', 'thread-rules.md', known), 'docs/thread-rules.md');
  assert.equal(resolveRef('docs/data-map.md', '../README.md', known), 'README.md');
  assert.equal(resolveRef('docs/x.md', 'docs/a.md', known), 'docs/a.md');
  assert.equal(resolveRef('docs/x.md', 'nothing.md', known), null);
});

test('ライセンスのあるフォルダの下のフォルダは、外から入れたもの', () => {
  const all = ['.claude/skills/GSAP-SKILLS-LICENSE', '.claude/skills/README.md', '.claude/skills/gsap-core/SKILL.md', 'docs/a.md'];
  assert.equal(externalByLicense(all, '.claude/skills/gsap-core/SKILL.md'), true);
  assert.equal(externalByLicense(all, '.claude/skills/README.md'), false, 'そのフォルダ直下の README は自分たちの決まり');
  assert.equal(externalByLicense(all, 'docs/a.md'), false);
});

test('入口が無いときは「入口が無い」1件にまとめ、入口の候補を出す。外から入れたものは診断しない', async () => {
  const files: Record<string, string> = {
    'docs/rules.md': '# 運用\n- デザインは docs/design.md を読む\n',
    'docs/design.md': '# デザイン\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n',
    'vendor/LICENSE': 'MIT',
    'vendor/x/SKILL.md': '---\nname: x\ndescription: use x\n---\n# X\n- 文字は Noto Sans JP を使う。小さい文字は出さない\n',
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
    await saveSource(env, 'o/r', ['docs/rules.md', 'docs/design.md', 'vendor/x/SKILL.md']);
    await syncRules(env, 'o/r');
    const v = await rulesView(env);
    assert.ok(v.docs.find(d => d.path === 'vendor/x/SKILL.md')!.external);
    assert.ok(!v.findings.some(f => f.kind === 'duplicate'), '外から入れたものとの重複は出さない');
    assert.ok(!v.findings.some(f => f.kind === 'unreferenced'), '入口が無いときは文書ごとに並べない');
    const ne = v.findings.find(f => f.kind === 'no_entry')!;
    assert.equal(ne.detail.candidates[0].path, 'docs/rules.md');
    const dg = diagnose('o/r', v.findings, v.docs, v.items as never);
    assert.equal(dg.conclusions[0].kind, 'no_entry');
    assert.match(dg.conclusions[0].next, /docs\/rules.md（そこから 1件に届く）/);
    assert.deepEqual(dg.external, ['vendor/x/SKILL.md']);
  } finally { globalThis.fetch = real; }
});


test('とても近くても片方だけが否定なら、重複ではなく食い違いの候補（#46）', async () => {
  const files: Record<string, string> = {
    'CLAUDE.md': '# 全体\n- 決まりは docs/a.md と docs/b.md を読む\n',
    'docs/a.md': '# 表\n- 表の列は画面の幅に合わせて六つまでにし、横に送る作りを使う\n',
    'docs/b.md': '# 表\n- 表の列は画面の幅に合わせて六つまでにし、横に送る作りを使わない\n',
  };
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL) => {
    const url = new URL(String(u));
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map(p => ({ path: p, type: 'blob', sha: 'x' })) });
    const m = url.pathname.match(/\/contents\/(.+)$/);
    if (m) return new Response(files[decodeURIComponent(m[1])]);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const env = fakeEnv();
    await saveSource(env, 'o/r', Object.keys(files));
    await syncRules(env, 'o/r');
    const pair = (await rulesView(env)).findings.filter(x => x.b).map(x => x.kind); // 2つの決まりの組の問題
    assert.deepEqual(pair, ['conflict']);
  } finally { globalThis.fetch = real; }
});
