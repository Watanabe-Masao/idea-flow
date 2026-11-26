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
