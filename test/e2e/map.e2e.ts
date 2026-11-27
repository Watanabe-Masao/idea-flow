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

async function open(b: Browser, width: number) {
  const pg = await b.newPage({ viewport: { width, height: 844 } }), errs: string[] = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(URL0); await pg.evaluate(() => localStorage.setItem('idea-flow-token', 'adm')); await pg.reload();
  await pg.selectOption('#rrepo', REPO);
  await pg.waitForSelector('[data-view="cluster"]');
  await pg.waitForFunction(() => /確かめました|読めませんでした|途中だった/.test(document.body.innerText), null, { timeout: 30000 }); // 開いたときの読み直しが終わるまで
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
