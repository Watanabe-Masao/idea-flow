// 系譜（#70）：親子と引き継ぎでつながる Issue を1つの系譜にし、参照（関連）と推測は入れない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const W: any = {}; (globalThis as any).window = W;
new Function('window', readFileSync(new URL('../public/lineage.js', import.meta.url), 'utf8'))(W);
const L = (type: string, n: number, kind: string, ev = '') => ({ type, n, kind, evidence: [ev], title: `t${n}`, url: '#', day: '2026-11-20' });
const iss = (number: number, created: string, open: boolean, links: any[]) => ({ number, title: `i${number}`, open, created, closed: open ? null : created, cond: '', url: '#', features: ['f'], links });
const d = { owns: [], lacks: [], issues: [
  iss(1, '2026-11-01', false, [L('issue', 2, 'to', '#1 の続き')]),
  iss(2, '2026-11-05', false, [L('issue', 1, 'from', 'Issue #2 の本文：#1 の続き'), L('issue', 3, 'child'), L('issue', 4, 'to')]),
  iss(3, '2026-11-06', false, [L('issue', 2, 'parent')]),
  iss(4, '2026-11-10', true, [L('issue', 2, 'from', 'Issue #4 の本文：#2 の残り'), L('issue', 9, 'ref', '関連 #9'), L('pr', 40, 'candidate')]),
  iss(9, '2026-11-11', true, [L('issue', 4, 'ref')]),
] };

test('系譜：親子と引き継ぎでたどり、参照は入れない。背骨は親の無いもの（古い順）、子は枝', () => {
  const b = W.Lineage.build(d, 4);
  assert.deepEqual(b.iss.map((i: any) => i.number), [1, 2, 3, 4]);
  assert.deepEqual(b.spine.map((i: any) => i.number), [1, 2, 4]);
  assert.deepEqual(b.kids(b.by.get(2)).map((i: any) => i.number), [3]);
  const h = W.Lineage.render(d, 4, {});
  assert.match(h, /#1 から始まり、2回引き継いで4件。開いているのは #4/);
  assert.match(h, /Issue #4 の本文：#2 の残り/);         // 引き継ぎの根拠を線に出す
  assert.match(h, /推測の PR 1件（畳んでいる）/);
  assert.equal(W.Lineage.build(d, 99), null);
});
