import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fakeenv.ts';
import { featuresOfFiles, linkIssue, mapView, parseReport, syncMap, type Catalog } from '../src/workmap.ts';
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
      const q = JSON.parse(String(init!.body)), v = q.variables;
      if (q.query.includes('issues(')) return Response.json({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
        { number: 7, state: 'OPEN', title: 'データの土台', body: '', createdAt: '2026-11-21T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z', closedAt: null, parent: null },
        { number: 8, state: 'OPEN', title: 'βモデル 段階4', body: '', createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z', closedAt: null, parent: null },
        { number: 9, state: 'CLOSED', title: '満月の物語：はじめ', body: '', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z', closedAt: '2026-11-21T00:00:00Z', parent: { number: 7 } },
      ] } } } });
      const start = v.after ? Number(v.after) : 0, part = v.dir === 'DESC' ? ALL.slice(-2).map(p => ({ ...p, updatedAt: '2026-11-01T00:00:00Z' })) : ALL.slice(start, start + 4);
      return Response.json({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: v.dir === 'ASC' && start + 4 < ALL.length, endCursor: String(start + 4) }, nodes: part } } } });
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const a = await syncMap(env, 'o/r', { mode: 'backfill', pages: 1 });
    assert.deepEqual([a.backfilled, a.backfillDone], [4, false]);
    const b = await syncMap(env, 'o/r', { mode: 'backfill', pages: 4 });
    assert.equal(b.backfillDone, true);
    const u = await syncMap(env, 'o/r', { mode: 'update' });
    assert.deepEqual([u.updated, u.issues, u.caughtUp], [2, 3, true]);
    assert.equal(gql, 4); // さかのぼり1・さかのぼり1（残り2件）・最近の更新1・Issue 1
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
  // 書き方：作り物の PR は題に機能名も番号も申告も無い。Issue は本文が空（期間に立てた3件）
  assert.deepEqual({ ...v.writing, misses: v.writing.misses.length }, { prs: 5, prTitle: 0, prLinked: 0, prReport: 0, issues: 3, issueFeature: 0, issueClose: 0, misses: 8 });
  assert.deepEqual(v.counts, { prs: 5, building: 1, settled: 1, stopped: 1, openIssues: 2, stale: 1, unused: 1 });
  const { mapAction } = await import('../src/mcpmap.ts');
  const real2 = globalThis.fetch; globalThis.fetch = (async () => { throw new Error('読み直さないはず'); }) as typeof fetch;
  try {
    assert.match(await mapAction(env, 'map', { repo: 'o/r' }), /満月の物語（絵本）（id=story）：/);
    assert.match(await mapAction(env, 'issue', { repo: 'o/r', n: '#7' }), /つながり（1）\n- \[親子（子）\] Issue #9[\s\S]*根拠：GitHub の親子：#9 がサブ Issue/);
    assert.match(await mapAction(env, 'feature', { repo: 'o/r', id: 'feel' }), /#8 βモデル 段階4.*［古くなっている候補］/);
    await assert.rejects(mapAction(env, 'issue', { repo: 'o/r', n: 99 }), /#99 は取り込まれていません/);
    assert.match(await mapAction(env, 'map', { repo: 'o/r' }), /毎日の見直し：今日はまだ（前回 なし）/);
    const rv = await mapAction(env, 'review', { repo: 'o/r' });
    assert.match(rv, /前回：まだ一度もない/);
    assert.match(rv, /1\. 自分で直すもの：書き方の足りないもの（前回から 8件）/);
    assert.match(rv, /a\. どの機能にも当たらない作業 1件[\s\S]*README\.md（#6）/);
    assert.match(rv, /古くなっている候補の Issue 1件：#8/);
    assert.match(rv, /貯めているのに画面で使っていないデータ 1：警報/);
    assert.match(await mapAction(env, 'map', { repo: 'o/r' }), /毎日の見直し：今日は済み/);
    const again = await mapAction(env, 'review', { repo: 'o/r', peek: true });
    assert.match(again, /前回：\d+\/\d+/); // 2回目は前回の日付から（同じ日のものは、もう一度出る）
  } finally { globalThis.fetch = real2; }
  delete CATALOGS['o/r'];
});

test('Issue のつながり：閉じた・明示（PR と Issue の本文）・引き継ぎ・推測（同じ機能で、番号の無いもの）', async () => {
  const { issueLinks, refLines } = await import('../src/workmap.ts');
  const p = (number: number, day: string, title: string, body: string, files: string[], features: string[], closes: number[] = []) => ({ number, title, url: 'u' + number, merged_at: day + 'T03:00:00Z', files, body, closes, features });
  const I = (number: number, open: boolean, title: string, body: string, features: string[]) => ({ number, open, title, created: '2026-11-18T00:00:00Z', closed: open ? null : '2026-11-20T00:00:00Z', features, refs: refLines(body) });
  const m = issueLinks('o/r', [
    I(11, true, 'コールドムーンの絵本', '作業：PR-1 文章（#17）', ['story']),
    I(12, false, '欠けの対策', '', ['store']),
    I(13, false, 'データの整合性：週1回の監査（#12 P2）', '関連：#11', ['store']),
  ], [
    p(17, '2026-11-19', '文章とデータ', '', ['src/ui/MoonStory.tsx'], ['story']),
    p(20, '2026-11-19', 'はじめ', 'Closes #12', ['worker/a.ts'], ['store'], [12]),
    p(30, '2026-11-21', '満月の物語：止める', 'コールドムーンの見本で見つけた', ['src/ui/MoonStory.tsx'], ['story']),
    p(31, '2026-11-22', '満月の物語：別件', '関連 #13', ['src/ui/MoonStory.tsx'], ['story']),
    p(40, '2026-11-10', '満月の物語：前', '', ['src/ui/MoonStory.tsx'], ['story']),
  ]);
  const k = (n: number) => m.get(n)!.map(l => `${l.kind}:${l.type}${l.n}`);
  assert.deepEqual(k(11), ['ref:issue13', 'ref:pr17', 'candidate:pr30']);   // #31 はほかの Issue を指すので候補にしない・#40 は開く前
  assert.deepEqual(k(12), ['to:issue13', 'closes:pr20']);
  assert.deepEqual(k(13), ['from:issue12', 'ref:issue11', 'ref:pr31']);
  assert.match(m.get(11)![1].evidence[0], /Issue #11 の本文：作業：PR-1 文章（#17）/);
  assert.match(m.get(11)!.at(-1)!.evidence[0], /同じ機能のファイルを変えた（src\/ui\/MoonStory.tsx）/);
});
test('PR の説明から申告を読む（見出しの名前で。なしは空）', () => {
  const r = parseReport('変えたこと\n\n## 確かめた決まり\n- `docs/moon.md`「動き」\n- `docs/design.md`「2.1 文字」\n## 決まりになく、自分で判断した所\n- 折る位置を空白にした\n## 足りなかった決まり\n- なし\n');
  assert.deepEqual(r, { read: ['`docs/moon.md`「動き」', '`docs/design.md`「2.1 文字」'], own: ['折る位置を空白にした'], lack: [], found: ['read', 'own', 'lack'], complete: true });
  assert.equal(parseReport('ふつうの説明だけ'), null);
  const one = parseReport('**確かめた決まり**\n- docs/a.md\n')!;
  assert.deepEqual([one.read, one.complete], [['docs/a.md'], false]); // 見出し1つだけでは、守れたと数えない
});

test('書き方の守り具合：題の頭・Issue の番号・申告、Issue の「機能：」「閉じる条件：」', async () => {
  const { writingCheck, issueLinks, refLines } = await import('../src/workmap.ts');
  const prs = [
    { number: 5, title: '満月の物語：止める', url: 'u5', merged_at: '2026-11-20T00:00:00Z', files: [], closes: [], body: '関連 #3\n## 確かめた決まり\n- なし\n## 決まりになく、自分で判断した所\n- なし\n## 足りなかった決まり\n- なし' },
    { number: 6, title: '直した', url: 'u6', merged_at: '2026-11-20T00:00:00Z', files: [], closes: [], body: '' },
  ];
  const issues = [{ number: 3, title: '満月の物語：残り', body: '機能：満月の物語\n閉じる条件：12月の満月が出る', open: true, created: '2026-11-19T00:00:00Z', closed: null, features: ['story'], refs: [] as { n: number; line: string }[] },
    { number: 4, title: 'あれ', body: 'メモ', open: true, created: '2026-11-19T00:00:00Z', closed: null, features: [], refs: [] }];
  const links = issueLinks('o/r', issues.map(i => ({ ...i, refs: refLines(i.body) })), prs.map(p => ({ ...p, features: [] })));
  const w = writingCheck(CAT, prs, issues, links);
  assert.deepEqual([w.prs, w.prTitle, w.prLinked, w.prReport, w.issues, w.issueFeature, w.issueClose], [2, 1, 1, 1, 2, 1, 1]);
  assert.deepEqual(w.misses.map(m => [m.n, m.miss.length]), [[6, 3], [4, 2]]);
});

test('申告は区切り線（---）で終わる・「関連：なし」は守れていると数える', async () => {
  const { parseReport, writingCheck } = await import('../src/workmap.ts');
  assert.deepEqual(parseReport('## 足りなかった決まり\n- なし\n\n---\n\n🤖 Generated')!.lack, []);
  const w = writingCheck(CAT, [{ number: 1, title: '満月の物語：x', url: 'u', merged_at: '2026-11-20T00:00:00Z', files: [], closes: [], body: '関連：なし' }], [], new Map());
  assert.equal(w.prLinked, 1);
});

test('同期：重なったら後の方は何もしない／ロックが切れたあとの古い処理は書けない／最近の更新は前回の境界に届くまで続きから', async () => {
  const env = fakeEnv() as any; env.GITHUB_TOKEN = 't';
  CATALOGS['o/r'] = CAT;
  const N = 201, base = Date.parse('2026-11-27T00:00:00Z');
  // 新しく動いた順の PR（201件。どれも前回の境界より新しい）。1ページ50件
  const pr = (k: number, title = `作業${k}`) => ({ number: k, title, url: 'u' + k, mergedAt: '2026-11-20T00:00:00Z', updatedAt: new Date(base - k * 1000).toISOString(), body: '', files: { nodes: [] } });
  let title = '新しい題', pause: (() => void) | null = null, hold = false;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const q = JSON.parse(String(init!.body)), v = q.variables;
    if (q.query.includes('issues(')) return Response.json({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
    const start = v.after ? Number(v.after) : 0;
    const nodes = Array.from({ length: Math.min(50, N - start) }, (_, i) => pr(start + i + 1, title)); // 答えの中身は、問い合わせた時点の題
    if (hold) await new Promise<void>(r => { pause = r; });
    return Response.json({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: start + 50 < N, endCursor: String(start + 50) }, nodes } } } });
  }) as typeof fetch;
  try {
    // 前回の境界：いちばん古い（201番目）より前
    await env.DB.prepare("INSERT INTO map_sync (repo, pr_done, prs_at) VALUES ('o/r', 1, '2026-11-26T00:00:00Z')").run();
    const a = await syncMap(env, 'o/r', { mode: 'update' });
    assert.deepEqual([a.updated, a.caughtUp], [200, false]);          // 4ページで止まる。境界にはまだ届かない
    let row = await env.DB.prepare("SELECT prs_at, upd_cursor FROM map_sync WHERE repo = 'o/r'").first();
    assert.deepEqual([row.prs_at, row.upd_cursor], ['2026-11-26T00:00:00Z', '200']); // 最終成功時刻は進めない
    const b = await syncMap(env, 'o/r', { mode: 'update' });
    assert.deepEqual([b.updated, b.caughtUp], [1, true]);             // 残りの1件を続きから拾う
    row = await env.DB.prepare("SELECT prs_at, upd_cursor FROM map_sync WHERE repo = 'o/r'").first();
    assert.equal(row.upd_cursor, null);
    // 重なり：1つ目を GitHub の答えの途中で止め、その間に2つ目
    title = '古い題'; hold = true;
    const first = syncMap(env, 'o/r', { mode: 'update' });
    await new Promise(r => setTimeout(r, 5));
    hold = false;
    const second = await syncMap(env, 'o/r', { mode: 'update' });
    assert.equal(second.busy, true);
    // 1つ目のロックを期限切れにし、別の処理（新しい題）が先に書き終える
    await env.DB.prepare("UPDATE map_sync SET sync_until = '2000-01-01T00:00:00Z' WHERE repo = 'o/r'").run();
    title = '新しい題';
    const third = await syncMap(env, 'o/r', { mode: 'update' });
    assert.equal(third.busy, false);
    (pause as unknown as () => void)();                                // 遅れていた1つ目が、あとから書こうとする
    await first;
    const t1 = await env.DB.prepare("SELECT title FROM pr_activity WHERE repo = 'o/r' AND number = 1").first();
    assert.equal(t1.title, '新しい題');                                 // 古い題に巻き戻らない
  } finally { globalThis.fetch = real; delete CATALOGS['o/r']; }
});

test('推測の根拠には、その Issue の機能に当たったファイルだけを出す', async () => {
  const { issueLinks } = await import('../src/workmap.ts');
  CATALOGS['o/x'] = { features: [
    { id: 'story', group: 'g', name: '物語', desc: '', files: ['^src/ui/Moon'], data: [], aliases: [] },
    { id: 'ci', group: 'g', name: 'CI', desc: '', files: ['^\\.github/'], data: [], aliases: [] },
  ], nodes: [], issues: {}, words: {} } as any;
  try {
    const m = issueLinks('o/x', [{ number: 1, open: true, title: 't', created: '2026-11-18T00:00:00Z', closed: null, features: ['story'], refs: [] }],
      [{ number: 9, title: 'p', url: 'u', merged_at: '2026-11-20T00:00:00Z', body: '', closes: [], files: ['.github/a.yml', '.github/b.yml', 'src/ui/Moon.tsx'], features: ['story', 'ci'] } as any]);
    const ev = m.get(1)![0].evidence[0];
    assert.match(ev, /src\/ui\/Moon\.tsx/);
    assert.doesNotMatch(ev, /\.github/);
  } finally { delete CATALOGS['o/x']; }
});
