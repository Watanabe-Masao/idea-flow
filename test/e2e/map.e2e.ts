// 画面のテスト：地図の3つの見方を、スマホの幅と PC の幅で開き、ページのエラーが出ないことと、主な流れを確かめる（#47）。
// WebKit は iPhone の Safari・Chrome と同じ中身。E2E_BROWSERS で選ぶ（既定 chromium,webkit）。入っていないものは飛ばす
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { start } from './server.ts';

const PORT = 8790, URL0 = `http://localhost:${PORT}/`, REPO = 'Watanabe-Masao/idea-flow';
const kinds = (process.env.E2E_BROWSERS || 'chromium,webkit').split(',');
let srv: Awaited<ReturnType<typeof start>>;
before(async () => { srv = await start(PORT); });
after(() => srv.close());

async function open(b: Browser, width: number, tab: 'today' | 'map' | 'docs' = 'map') {
  const pg = await b.newPage({ viewport: { width, height: 844 } }), errs: string[] = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(URL0); await pg.evaluate(() => localStorage.setItem('idea-flow-token', 'adm')); await pg.reload();
  await pg.selectOption('#rrepo', REPO);
  if (tab !== 'today') await pg.click(`[data-rsub="${tab}"]`);
  if (tab === 'map') await pg.waitForSelector('[data-view="cluster"]');
  if (tab === 'map') await pg.waitForFunction(() => /確かめました|読めませんでした|途中だった/.test(document.body.innerText), null, { timeout: 30000 }); // 開いたときの読み直しが終わるまで
  else await pg.waitForTimeout(800);
  return { pg, errs };
}
const text = (pg: Page, sel: string) => pg.locator(sel).first().innerText();

for (const k of kinds) {
  const launcher = k === 'webkit' ? webkit : chromium;
  let b: Browser | null = null;
  try { b = await launcher.launch(); } catch { test(`${k}：ブラウザが入っていないので飛ばす`, { skip: true }, () => {}); continue; }
  after(() => b!.close());

  test(`${k}・スマホ：機能 → 関連する作業（入り口を探す → Issue を開く → 経過 → 戻る）→ Issue の経過`, async () => {
    const { pg, errs } = await open(b!, 390);
    assert.equal(await pg.locator('[data-span]').count(), 2, '機能の見方では期間ボタンが出る');
    assert.equal((await pg.locator('[data-view="cluster"]').innerText()).trim(), '関連する作業');
    await pg.click('[data-view="cluster"]');
    assert.equal(await pg.locator('[data-span]').count(), 0, '関連する作業では期間ボタンを出さない');
    await pg.click('[data-pick="1"]');
    await pg.fill('#wmq', '53'); await pg.press('#wmq', 'Enter');
    await pg.click('[data-jump]');
    assert.match(await text(pg, '.wm-lh'), /つながり \d+件/);
    await pg.click('[data-totl="53"]');
    assert.match(await text(pg, '.wm-pick'), /#53/);
    assert.equal(await pg.locator('[data-ifilt]').count(), 0, '1つの Issue を中心にしている間は絞り込みを出さない');
    await pg.click('[data-back]');
    assert.equal(await pg.locator('[data-view="cluster"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await pg.locator('[data-cn="i53"]').count(), 1);
    await pg.click('[data-view="issue"]');
    assert.match(await pg.content(), /出している範囲/);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・スマホ：文書の画面の「気になる所」から、Issue の下書きを開ける（#9）`, async () => {
    const { pg, errs } = await open(b!, 390, 'docs');
    await pg.getByText('詳しく見る').first().click();
    const href = await pg.locator('a:has-text("Issue の下書きを開く")').first().getAttribute('href');
    const u = new URL(href!);
    assert.equal(u.pathname, `/${REPO}/issues/new`);
    assert.match(u.searchParams.get('title')!, /^決まりと文書：/);
    assert.match(u.searchParams.get('body')!, /^機能：決まりと文書\n閉じる条件：/);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・スマホ：開くと「今日」が最初に出て、片づけたものは消え、開き直しても戻らない（#69）`, async () => {
    const { pg, errs } = await open(b!, 390, 'today');
    assert.equal(await pg.locator('[data-rsub="today"]').getAttribute('aria-selected'), 'true');
    await pg.waitForSelector('.td-it');
    const n0 = await pg.locator('.td-it').count();
    assert.ok(n0 > 0, '判断の受信箱などが出る');
    assert.match(await pg.innerText('#rtoday'), new RegExp(`今日決めること ${n0}件`));
    const first = await pg.locator('.td-it .td-t').first().innerText();
    await pg.locator('.td-it').first().locator('button[data-mark]').first().click();
    await pg.waitForFunction(n => document.querySelectorAll('.td-it').length === n, n0 - 1);
    await pg.waitForTimeout(300);
    await pg.reload(); await pg.selectOption('#rrepo', REPO); await pg.waitForSelector('.td-it');
    assert.equal(await pg.locator('.td-it').count(), n0 - 1, '片づけた印が残る');
    assert.ok(!(await pg.locator('.td-it .td-t').allInnerTexts()).includes(first) || n0 > 1);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・今日：読み込み中にリポジトリを切り替えても、前のリポジトリのカードを出さず、判断は表示中のリポジトリに残す`, async () => {
    const { pg, errs } = await open(b!, 390, 'today');
    await pg.waitForSelector('.td-it');
    // 別のリポジトリ（o/other）の答えは遅れて届く。同じ番号の Issue を持たせる
    await pg.route('**/api/today?repo=o%2Fother', async r => { await new Promise(z => setTimeout(z, 1200)); await r.fulfill({ json: { repo: 'o/other', catalog: true, since: '2026-11-20', changes: [], decided: 0,
      items: [{ key: 'close:53:x', kind: 'close', title: '#53 よそのリポジトリの Issue', sub: '', url: 'https://github.com/o/other/issues/53' }] } }); });
    const marks: string[] = [];
    pg.on('request', q => { if (q.url().endsWith('/api/today/mark')) marks.push(q.postData() || ''); });
    await pg.evaluate(() => { const el = document.querySelector('#rtoday')!; (window as any).Today.render(el, 'o/other'); (window as any).Today.render(el, 'Watanabe-Masao/idea-flow'); });
    await pg.waitForTimeout(1600); // 遅れた o/other の答えが届いたあと
    assert.doesNotMatch(await pg.innerText('#rtoday'), /よそのリポジトリ/);
    await pg.locator('.td-it button[data-mark]').first().click();
    await pg.waitForTimeout(200);
    assert.equal(marks.length, 1);
    assert.equal(JSON.parse(marks[0]).repo, REPO);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・今日：閉じてよさそうな Issue は、GitHub で開くだけでは消えない`, async () => {
    const { pg, errs } = await open(b!, 390, 'today');
    await pg.waitForSelector('.td-it');
    const n0 = await pg.locator('.td-it').count();
    const ghLink = pg.locator('.td-it a:has-text("GitHub で開く")').first();
    assert.equal(await ghLink.getAttribute('data-mark'), null);
    await pg.evaluate(() => { document.querySelectorAll('.td-it a[target=_blank]').forEach(a => a.removeAttribute('target')); document.querySelectorAll('.td-it a').forEach(a => a.addEventListener('click', e => e.preventDefault())); });
    await ghLink.click();
    assert.equal(await pg.locator('.td-it').count(), n0);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・リポジトリの選択欄に、地図のあるプロジェクトが「名前 ＋ 名前」で出る（決まりの文書を取り込んでいなくても）`, async () => {
    const { pg, errs } = await open(b!, 390, 'today');
    const opts = await pg.locator('#rrepo option').evaluateAll(os => os.map(o => [(o as HTMLOptionElement).value, o.textContent]));
    assert.ok(opts.some(([v, l]) => v === 'Watanabe-Masao/stats2-course' && l === 'stats2-course ＋ knowledge-net'), JSON.stringify(opts));
    assert.ok(!opts.some(([v]) => v === 'Watanabe-Masao/knowledge-net'), 'プロジェクトの中のリポジトリは、代表の1つにまとめる');
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・系譜（#70）：Issue から系譜を開き、住所で開き直しても同じ所に着き、戻れる`, async () => {
    const { pg, errs } = await open(b!, 390);
    await pg.click('[data-view="cluster"]');
    await pg.click('[data-pick="1"]'); await pg.fill('#wmq', '53'); await pg.press('#wmq', 'Enter'); await pg.click('[data-jump]');
    await pg.click('[data-lin="53"]');
    await pg.waitForSelector('.ln-node.here');
    assert.match(await pg.innerText('.wm'), /引き継ぎの系譜/);
    assert.match(await pg.locator('.ln-node.here .ln-t').innerText(), /^#53 /);
    assert.match(pg.url(), /#repo=Watanabe-Masao%2Fidea-flow&lineage=53$/);
    // 住所で開き直す
    // WebKit では、開き直し（reload）のあとに画面が出ないことがまれにある（統計検定アプリの CI でも同じ揺れ）。開き直しを1回だけやり直す
    await pg.reload({ waitUntil: 'load' });
    if (!(await pg.locator('.ln-node.here').first().waitFor({ timeout: 15000 }).then(() => true, () => false))) { console.log(`E2E_RETRY ${k} 系譜の開き直し`); await pg.reload({ waitUntil: 'load' }); await pg.waitForSelector('.ln-node.here', { timeout: 30000 }); }
    assert.match(await pg.locator('.ln-node.here .ln-t').innerText(), /^#53 /);
    // 戻る（開き直したあとは戻り先が無いので、見方のタブで）
    await pg.click('[data-view="cluster"]');
    assert.doesNotMatch(pg.url(), /lineage=/);
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・機能のページ（#70）：機能の一覧から開き、系譜へ進んで、機能のページに戻れる`, async () => {
    const { pg, errs } = await open(b!, 390);
    await pg.locator('.wm-row .wm-nm').first().click();
    await pg.locator('[data-fpage]').first().click();
    await pg.waitForSelector('.fp-strip');
    assert.match(await pg.innerText('.wm'), /この機能を通る系譜/);
    assert.match(pg.url(), /&feature=/);
    const ln = pg.locator('.fp-ln [data-lin]').first();
    if (await ln.count()) {
      await ln.click(); await pg.waitForSelector('.ln-node.here');
      await pg.click('[data-lnback]'); await pg.waitForSelector('.fp-strip');
      assert.match(pg.url(), /&feature=/);
    }
    assert.deepEqual(errs, []);
    await pg.close();
  });

  test(`${k}・PC：3つの見方を開いてもエラーが出ない`, async () => {
    const { pg, errs } = await open(b!, 1100);
    await pg.click('[data-view="cluster"]');
    assert.ok(await pg.locator('.wm-chip').count() > 0, 'PC では入り口を札で並べる');
    await pg.locator('.wm-chip').first().click();
    await pg.click('[data-view="issue"]');
    await pg.click('[data-ifilt="closed"]');
    await pg.click('[data-view="feat"]');
    assert.deepEqual(errs, []);
    await pg.close();
  });
}
