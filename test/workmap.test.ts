import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { featuresOfFiles, linkIssue, mapView, syncMap, type Catalog } from '../src/workmap.ts';
import { CATALOGS } from '../src/catalogs.ts';

const CAT: Catalog = {
  features: [
    { id: 'story', group: 'ロゴ', name: '満月の物語（絵本）', desc: '絵本', files: ['MoonStory'], data: ['calc'], aliases: ['満月の物語'] },
    { id: 'air', group: '1日', name: '空気の質', desc: '空気', files: ['Air'], data: ['sAir'], aliases: ['空気'] },
    { id: 'feel', group: '肌感', name: '肌感の帯の地図', desc: '肌感', files: ['FeelSheet'], data: ['calc'], aliases: ['肌感'] },
  ],
  nodes: { calc: { col: 0, name: '計算', note: '取らない' }, sAir: { col: 1, name: '空気', note: '画面で使う' }, sWarn: { col: 1, name: '警報', note: '画面なし' } },
  issues: { '7': { features: [], nodes: ['sWarn'] } },
  words: [['β|モデル', ['feel']]],
};

test('ファイルから機能、Issue から機能（本文の「機能：」→ 人の結び付け → 題の頭 → 題の言葉）', () => {
  assert.deepEqual(featuresOfFiles(CAT, ['src/ui/MoonStory.tsx', 'src/styles.css']), ['story']);
  assert.deepEqual(featuresOfFiles(CAT, ['README.md']), []);
  assert.deepEqual(linkIssue(CAT, { number: 1, title: 'なにか', body: '説明\n機能：空気の質、肌感\n閉じる条件：…' }).features, ['air', 'feel']);
  assert.deepEqual(linkIssue(CAT, { number: 7, title: 'データの土台', body: '' }), { features: [], nodes: ['sWarn'], how: '人が結び付けた' });
  assert.deepEqual(linkIssue(CAT, { number: 2, title: '満月の物語：残り', body: '' }).features, ['story']);
  assert.equal(linkIssue(CAT, { number: 3, title: 'βモデル 段階4', body: '' }).how, '題の言葉');
  assert.deepEqual(linkIssue(CAT, { number: 4, title: 'CI の安定', body: '' }).features, []);
});

test('weather-note-cf のカタログは、正規表現が正しく、データとのつながりが一覧にある', () => {
  const c = CATALOGS['Watanabe-Masao/weather-note-cf'];
  assert.equal(c.features.length, 27);
  // 見た目・文書・テストは、ほかに当たらないときだけ
  assert.deepEqual(featuresOfFiles(c, ['src/ui/MoonStory.tsx', 'src/styles.css', 'e2e/e2e.py']), ['story']);
  assert.deepEqual(featuresOfFiles(c, ['src/styles.css', 'e2e/e2e.py']), ['look', 'ci']);
  assert.deepEqual(featuresOfFiles(c, ['worker/src/index.ts', 'test/x.test.ts']), ['store']);
  for (const f of c.features) { for (const rx of f.files) new RegExp(rx); for (const k of f.data) assert.ok(c.nodes[k], `${f.id} の ${k}`); }
  assert.deepEqual(featuresOfFiles(c, ['src/ui/MoonStory.tsx']), ['story']);
});

test('PR と Issue を取り込み、稼働・状態・古くなっている候補・どれにも当たらない作業を出す', async () => {
  const env = fakeEnv() as any; env.GITHUB_TOKEN = 't';
  CATALOGS['o/r'] = CAT;
  const pr = (number: number, mergedAt: string, files: string[]) => ({ number, title: `作業${number}`, url: `https://github.com/o/r/pull/${number}`, mergedAt, body: '', files: { nodes: files.map(path => ({ path })) } });
  const ALL = [
    pr(1, '2026-11-05T03:00:00Z', ['src/ui/FeelSheet.tsx']),
    pr(2, '2026-11-24T03:00:00Z', ['src/ui/MoonStory.tsx']), pr(3, '2026-11-25T03:00:00Z', ['src/ui/MoonStory.tsx']), pr(4, '2026-11-26T15:30:00Z', ['src/ui/MoonStory.tsx']),
    pr(5, '2026-11-22T03:00:00Z', ['src/ui/AirCard.tsx']), pr(6, '2026-11-26T03:00:00Z', ['README.md']),
  ];
  let gql = 0;
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL, init?: RequestInit) => {
    const url = new URL(String(u));
    if (url.pathname === '/graphql') {
      gql++;
      const v = JSON.parse(String(init!.body)).variables;
      const start = v.after ? Number(v.after) : 0, part = v.dir === 'DESC' ? ALL.slice(-2) : ALL.slice(start, start + 4);
      return Response.json({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: v.dir === 'ASC' && start + 4 < ALL.length, endCursor: String(start + 4) }, nodes: part } } } });
    }
    if (url.pathname.endsWith('/issues')) return Response.json([
      { number: 7, state: 'open', title: 'データの土台', body: '', created_at: '2026-11-21T00:00:00Z', updated_at: '2026-11-21T00:00:00Z', closed_at: null },
      { number: 8, state: 'open', title: 'βモデル 段階4', body: '', created_at: '2026-11-11T00:00:00Z', updated_at: '2026-11-15T00:00:00Z', closed_at: null },
      { number: 9, state: 'closed', title: '満月の物語：はじめ', body: '', created_at: '2026-11-20T00:00:00Z', updated_at: '2026-11-21T00:00:00Z', closed_at: '2026-11-21T00:00:00Z' },
      { number: 10, state: 'open', title: 'PR', pull_request: {}, body: '', created_at: '', updated_at: '', closed_at: null },
    ]);
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const a = await syncMap(env, 'o/r', 1);
    assert.deepEqual(a, { prs: 4, backfillDone: false, issues: 3 });
    const b = await syncMap(env, 'o/r', 4);
    assert.equal(b.backfillDone, true);
    assert.equal(gql, 4); // 1回目：さかのぼり1＋新しい1、2回目：さかのぼり1（残り2件）＋新しい1
  } finally { globalThis.fetch = real; }

  const v = await mapView(env, 'o/r', 21, '2026-11-27') as any;
  assert.equal(v.days.at(-1), '2026-11-27');
  const f = (id: string) => v.features.find((x: any) => x.id === id);
  // #4 は UTC の 11/26 15:30 ＝ 日本時間の 11/27
  assert.deepEqual(f('story').days.slice(-4), [1, 1, 0, 1]);
  assert.equal(f('story').state, 0);            // 直近4日に3件
  assert.equal(f('air').state, 1);              // 直近7日に1件（11/22）
  assert.equal(f('feel').state, 2);             // 11/5 だけ
  assert.equal(f('feel').span, 0);
  assert.equal(f('story').byDay.at(-1)[0].n, 4);
  const i = (n: number) => v.issues.find((x: any) => x.number === n);
  assert.equal(v.issues.length, 3);
  assert.equal(i(8).stale, true);               // 肌感（止まっている）だけにつながり、7日以上動いていない
  assert.equal(i(7).stale, false);              // 機能につながらない（画面のないデータ）
  assert.deepEqual(i(7).nodes, ['sWarn']);
  assert.equal(i(9).open, false);
  assert.deepEqual(v.unmatched.map((p: any) => p.n), [6]);
  assert.deepEqual(v.counts, { prs: 5, building: 1, settled: 1, stopped: 1, openIssues: 2, stale: 1, unused: 1 });
  delete CATALOGS['o/r'];
});

test('Issue とマージのつながり：閉じると書いたもの・題と説明の「#数字」（Issue の番号だけ、古い順）', async () => {
  const { prsByIssue } = await import('../src/workmap.ts');
  const p = (number: number, day: string, title: string, body: string, closes: number[] = []) => ({ number, title, url: 'u' + number, merged_at: day + 'T03:00:00Z', files: [], body, closes });
  const m = prsByIssue([
    p(30, '2026-11-20', '満月の物語：残り（#11 の続き）', '関連：#12、PR #29'),
    p(20, '2026-11-18', 'はじめ', 'Closes #11', [11]),
    p(31, '2026-11-21', 'ほか', 'see https://x/#11 と &#11;'),
  ], new Set([11, 12]));
  assert.deepEqual(m.get(11)!.map(x => [x.n, x.closes]), [[20, true], [30, false]]);
  assert.deepEqual(m.get(12)!.map(x => x.n), [30]);
  assert.equal(m.has(29), false);
});
