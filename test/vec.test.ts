import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centroid, decide, decideVote, dot, headingOf, knnVote, fromBlob, medoid, normalize, sweep, threshClusters, toBlob, topK } from '../src/vec.ts';
import { embedText, ghNumberOfTitle, prNumberOf, refsOf } from '../src/util.ts';
import { parseThemeLabel } from '../src/linear.ts';

const v = (...xs: number[]) => normalize(xs);

test('正規化したベクトルの内積はコサイン類似度', () => {
  assert.ok(Math.abs(dot(v(1, 0), v(1, 0)) - 1) < 1e-6);
  assert.ok(Math.abs(dot(v(1, 0), v(0, 1))) < 1e-6);
});

test('重心は正規化される', () => {
  const c = centroid([v(1, 0), v(0, 1)])!;
  assert.ok(Math.abs(dot(c, c) - 1) < 1e-6);
  assert.equal(centroid([]), null);
});

test('BLOB との往復で値が変わらない（D1 が配列で返す場合も）', () => {
  const a = v(0.3, 0.4, 0.5);
  const b = toBlob(a);
  assert.deepEqual([...fromBlob(b)], [...a]);
  assert.deepEqual([...fromBlob([...new Uint8Array(b)])], [...a]);
});

test('上位の候補と、しきい値による判定', () => {
  const items = new Map([['A', v(1, 0)], ['B', v(0.7, 0.7)], ['C', v(0, 1)]]);
  const top = topK(v(1, 0.1), items, 2);
  assert.deepEqual(top.map(t => t.id), ['A', 'B']);
  assert.equal(decide(top, 0.9, 0.6).level, 'auto');
  assert.equal(decide([{ id: 'A', score: 0.7 }], 0.9, 0.6).level, 'pending');
  assert.equal(decide([{ id: 'A', score: 0.5 }], 0.9, 0.6).level, 'none');
  assert.equal(decide([], 0.9, 0.6).target, null);
});

test('近いものどうしが塊になり、小さい塊は捨てる', () => {
  const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'z'];
  const vecs = [v(1, 0, 0), v(0.95, 0.05, 0), v(0.9, 0.1, 0), v(0, 1, 0), v(0, 0.95, 0.05), v(0, 0, 1)];
  const g = threshClusters(ids, vecs, 0.9, 2);
  assert.deepEqual(g.map(x => x.sort()), [['a1', 'a2', 'a3'], ['b1', 'b2']]);
  assert.equal(threshClusters(ids, vecs, 0.9, 3).length, 1);
});

test('代表は真ん中のもの', () => {
  assert.equal(medoid([v(1, 0), v(0.9, 0.1), v(0.8, 0.2)]), 1);
});

test('答え合わせの表：しきい値を上げると精度が上がり、カバーが下がる', () => {
  const rows = sweep([{ score: 0.9, correct: true }, { score: 0.8, correct: true }, { score: 0.6, correct: false }], 0.5, 0.9, 0.2);
  assert.deepEqual(rows.map(r => r.covered), [3, 2, 1]);
  assert.ok(rows[0].precision < rows[1].precision);
});

test('コミットから PR 番号と参照を取り出す', () => {
  assert.equal(prNumberOf('予報の移り変わり：印を付ける (#518)'), 518);
  assert.equal(prNumberOf('Merge pull request #283 from Watanabe-Masao/research/x'), 283);
  assert.equal(prNumberOf('ふつうのコミット'), null);
  assert.deepEqual(refsOf('#250 の続き。WAT-9 と関係。http://x/#12 は無視', 'WAT').sort(), ['#250', 'WAT-9']);
});

test('課題の題名とテーマのラベル', () => {
  assert.equal(ghNumberOfTitle('#369 太陽と月'), 369);
  assert.equal(ghNumberOfTitle('太陽と月（#369）'), null);
  assert.deepEqual(parseThemeLabel('C11 満月の物語'), { key: 'C11', name: '満月の物語' });
  assert.equal(parseThemeLabel('判断待ち'), null);
});

test('埋め込み用の文から番号と URL を落とす', () => {
  assert.equal(embedText('満月の物語：自動で読む (#520)', 'https://example.com/x 本文'), '満月の物語：自動で読む 本文');
});

test('見出しは先頭の「…：」から取る', () => {
  assert.equal(headingOf('予報の履歴：保存した電文を読む (#250)'), '予報の履歴');
  assert.equal(headingOf('core: 日照 0 の時間'), 'core');
  assert.equal(headingOf('見出しのない普通の文'), null);
  assert.equal(headingOf('見出しにしては長すぎる文がここまで続いてから出てくる：コロン'), null);
});

test('多数決：近い手本の多いラベルが勝ち、見出しが同じなら加点される', () => {
  const ex = [
    { vec: v(1, 0.1), label: 'A', heading: 'x', key: '1' },
    { vec: v(1, 0.2), label: 'A', heading: 'x', key: '2' },
    { vec: v(1, 0.15), label: 'B', heading: 'y', key: '3' },
    { vec: v(0, 1), label: 'C', heading: null, key: '4' },
  ];
  const r = knnVote(v(1, 0.15), 'x', ex, { k: 3 });
  assert.equal(r[0].id, 'A');
  assert.ok(r[0].score > 0.7 && r[0].score <= 1);
  const s = r.reduce((a, b) => a + b.score, 0);
  assert.ok(Math.abs(s - 1) < 1e-6);
  // 見出しが y なら B の票が増える
  const r2 = knnVote(v(1, 0.15), 'y', ex, { k: 3 });
  assert.ok(r2.find(x => x.id === 'B')!.score > r.find(x => x.id === 'B')!.score);
  // 自分を抜く
  const r3 = knnVote(v(1, 0.15), null, ex, { k: 1, skip: e => e.key === '3' });
  assert.notEqual(r3[0].id, 'B');
});

test('票の割合としきい値、手本との近さの下限で決める', () => {
  assert.equal(decideVote([{ id: 'A', score: 0.9, sim: 0.8 }], 0.75, 0.5, 0.5).level, 'auto');
  assert.equal(decideVote([{ id: 'A', score: 0.6, sim: 0.8 }], 0.75, 0.5, 0.5).level, 'pending');
  assert.equal(decideVote([{ id: 'A', score: 0.4, sim: 0.8 }], 0.75, 0.5, 0.5).level, 'none');
  assert.equal(decideVote([{ id: 'A', score: 1, sim: 0.3 }], 0.75, 0.5, 0.5).level, 'none');
  assert.equal(decideVote([], 0.75, 0.5, 0.5).level, 'none');
});
