import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIssue, checkPr } from '../src/selfcheck.ts';
import { CATALOGS } from '../src/catalogs.ts';

const cat = CATALOGS['Watanabe-Masao/idea-flow'];
const issues = new Map([[3, { open: true, title: '地図の画面：残り' }], [4, { open: false, title: '閉じたもの' }]]);
const REPORT = '\n## 確かめた決まり\n- なし\n## 決まりになく、自分で判断した所\n- なし\n## 足りなかった決まり\n- なし';
const marks = (xs: { ok: boolean | null; what: string }[]) => xs.map(x => (x.ok === true ? '✓' : x.ok === false ? '✗' : '・') + x.what.split('（')[0]);

test('PR の自己チェック：守れているもの', () => {
  const r = checkPr(cat, { title: '地図の画面：クラスター', body: '関連 #3' + REPORT, files: ['public/map.js'] }, issues);
  assert.deepEqual(r.map(x => x.ok), [true, true, true, true, true]);
});

test('PR の自己チェック：題・Issue・申告が無い／題とファイルの機能がずれる／閉じた Issue を Closes', () => {
  const a = checkPr(cat, { title: '直した', body: '', files: ['README.md'] }, issues);
  assert.deepEqual(marks(a), ['✗題の頭が機能名', '✓変えたファイルが一覧の機能に当たる', '✗関係する Issue を書いている', '✗申告の3つの見出し']);
  assert.match(a[0].fix!, /使える機能名：地図の画面/);
  const b = checkPr(cat, { title: 'コネクタ：check', body: 'Closes #4\n関連 #99' + REPORT, files: ['public/map.js'] }, issues);
  assert.deepEqual(marks(b), ['✓題の頭が機能名', '✓変えたファイルが一覧の機能に当たる', '✗題の機能と、変えたファイルの機能が合う', '✓関係する Issue を書いている', '・#99 は Issue として見つからない', '✗Closes #4 は、もう閉じている Issue', '✓申告の3つの見出し']);
  const c = checkPr(cat, { title: '地図の画面：x', body: '関連：なし' + REPORT, files: [] }, issues);
  assert.deepEqual(c.map(x => x.ok), [true, null, true, true]);
});

test('Issue の自己チェック：題・「機能：」・「閉じる条件：」・同じ機能の開いた Issue', () => {
  const ok = checkIssue(cat, { title: '地図の画面：線を太く', body: '機能：地図の画面\n閉じる条件：スマホで線が見える' }, [{ number: 3, title: '地図の画面：残り', features: ['map-ui'] }]);
  assert.deepEqual(marks(ok), ['✓題の頭が機能名', '✓本文に「機能：」', '✓本文に「閉じる条件：」', '・同じ機能の開いた Issue がある：#3 地図の画面：残り。やり残しなら、新しく立てずにそちらに足す']);
  const ng = checkIssue(cat, { title: 'あとでやる', body: '機能：なにか\nメモ' }, []);
  assert.deepEqual(ng.map(x => x.ok), [false, false, false]);
});

test('タグ：@ は付けても付けなくてもよい・機能と話題に分ける・Issue は機能が増える（複数の入り口）', async () => {
  const { tagsOf, splitTags, linkIssue } = await import('../src/workmap.ts');
  const wn = CATALOGS['Watanabe-Masao/weather-note-cf'];
  assert.deepEqual(tagsOf('説明\nタグ：@ウルフムーン、絵本 #空のイベント\n'), ['ウルフムーン', '絵本', '空のイベント']);
  assert.deepEqual(splitTags(wn, ['ウルフムーン', '絵本', '空のイベント']), { features: ['story', 'event'], topics: ['ウルフムーン'] });
  const l = linkIssue(wn, { number: 1, title: '満月の物語：残り', body: '機能：満月の物語\nタグ：空のイベント、ウルフムーン' });
  assert.deepEqual([l.features, l.how], [['story', 'event'], '本文の「機能：」＋タグ']);
});

test('タグの自己チェック：3つまで・新しい話題は似たものを知らせる', () => {
  const four = checkIssue(cat, { title: '地図の画面：x', body: '機能：地図の画面\n閉じる条件：スマホで見える\nタグ：a、b、c、d' }, []);
  assert.equal(four.find(x => x.what.startsWith('タグ'))!.ok, false);
  const nw = checkPr(cat, { title: '地図の画面：x', body: '関連：なし\nタグ：クラスター図' + REPORT, files: [] }, issues, new Set(['クラスター']));
  assert.match(nw.find(x => x.what.includes('新しい話題'))!.what, /「クラスター図」は新しい話題。既にある「クラスター」のことなら/);
  const old = checkPr(cat, { title: '地図の画面：x', body: '関連：なし\nタグ：クラスター' + REPORT, files: [] }, issues, new Set(['クラスター']));
  assert.equal(old.some(x => x.what.includes('新しい話題')), false);
});

test('申告は3つの見出しがそろって合格（1つだけなら、無い見出しを出す）', () => {
  const r = checkPr(cat, { title: '地図の画面：x', body: '関連：なし\n## 確かめた決まり\n- なし', files: [] }, issues);
  const x = r.find(i => i.what.startsWith('申告'))!;
  assert.deepEqual([x.ok, x.what], [false, '申告の3つの見出し（無い：決まりになく、自分で判断した所・足りなかった決まり）']);
});

test('作品ごとの話題は機能名に吸い込まれない（レビューの指摘：タグ：コールドムーン、ビーバームーン、絵本）', async () => {
  const { splitTags, topicsOf } = await import('../src/workmap.ts');
  const wn = CATALOGS['Watanabe-Masao/weather-note-cf'];
  assert.deepEqual(splitTags(wn, ['コールドムーン', 'ビーバームーン', '絵本']), { features: ['story'], topics: ['コールドムーン', 'ビーバームーン'] });
  // タグが無くても、題に作品名があれば話題に入る（#411）
  assert.deepEqual(topicsOf(wn, '満月の物語とイベントの見出し：コールドムーンの絵本と残り', ''), ['コールドムーン']);
});

test('申告の見出しは、コードブロックの中の見本では合格にしない・題の頭はいちばん長く合う機能名で', () => {
  const body = '関連：なし\n書き方の見本：\n```\n## 確かめた決まり\n- a\n## 決まりになく、自分で判断した所\n- b\n## 足りなかった決まり\n- c\n```';
  assert.equal(checkPr(cat, { title: '地図の画面：x', body, files: [] }, issues).find(x => x.what.startsWith('申告'))!.ok, false);
  const r = checkPr(cat, { title: '地図の計算：同期', body: '関連：なし' + REPORT, files: ['src/workmap.ts'] }, issues);
  assert.match(r[0].what, /（地図の計算と取り込み）/);
  assert.equal(r[2].ok, true); // 題の機能とファイルの機能が合う
});
