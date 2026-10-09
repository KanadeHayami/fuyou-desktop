import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const reference = JSON.parse(await readFile('data/reference.json', 'utf8'));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
const log = [];
await mkdir('.impeccable/review', { recursive: true });
await mkdir('docs/screenshots', { recursive: true });
try {
  for (const [width, height] of [[1280, 800], [840, 800], [400, 820], [360, 480]]) {
    const context = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.route('**/*', route => {
      // A machine-level web antivirus injects this script into localhost pages.
      // Suppress only its known injected origin in this isolated test context.
      if (new URL(route.request().url()).hostname === 'gc.kis.v2.scr.kaspersky-labs.com') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5173') return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('group', { name: '图鉴分类' }).getByRole('button', { name: '符文', exact: true }).click();
    const workspace = page.locator('.reference-container:visible .reference-workspace');
    const detail = workspace.locator('.reference-detail-content');
    const views = workspace.getByRole('group', { name: '符文资料视图' });
    const check = async () => {
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body,.reference-toolbar,.reference-list,.reference-detail,.reference-entry-heading,.reference-row,.reference-table')]
        .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1).map(element => element.className));
      assert.deepEqual(overflow, []);
      assert.deepEqual(external, [], 'All artwork and runtime assets are served locally');
    };
    const loaded = async (image, suffix) => {
      await image.waitFor();
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(image => image.decode());
      assert(await image.evaluate(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
      assert((await image.getAttribute('src')).endsWith(suffix));
      assert.equal(await image.getAttribute('alt'), '');
    };
    const select = async (record, family) => {
      const search = workspace.getByRole('searchbox', { name: family === 'rune' ? '搜索符文' : '搜索英雄对照' });
      await search.fill(record.name);
      const row = workspace.locator(`[data-reference-id="${record.id}"] .reference-row`);
      await row.click();
      await loaded(row.locator('img'), `/${record.id}.png`);
      await loaded(detail.locator('.reference-artwork img'), `/${record.id}.png`);
      assert.equal(await detail.locator('h2').textContent(), record.name);
      assert.equal(await row.locator('img').getAttribute('loading'), 'lazy');
      assert.equal(await detail.locator('img').getAttribute('loading'), 'eager');
      if (family === 'hero') assert((await detail.locator('img').getAttribute('src')).includes('/portraits/'));
      await check();
    };
    const capture = async name => {
      await check();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll('.reference-container img')].every(image => {
        const bounds = image.getBoundingClientRect();
        return bounds.bottom <= 0 || bounds.top >= innerHeight || !image.getClientRects().length || image.complete && image.naturalWidth > 0;
      }));
      await page.mouse.move(width - 2, height - 2);
      await page.screenshot({ path: `.impeccable/review/icons-${name}-${width}x${height}.png`, animations: 'disabled', fullPage: true });
    };
    await workspace.locator('.reference-row .reference-artwork img').first().evaluate(image => image.decode());
    assert.equal(await workspace.locator('.reference-row img').count(), 36);
    await capture('rune-list');
    if (width === 1280) for (const rune of reference.runes) await select(rune, 'rune');
    const removed = reference.runes.find(rune => rune.id === 'rune_snapfire');
    await select(removed, 'rune');
    await detail.getByRole('button', { name: '复制资料', exact: true }).click();
    assert((await page.evaluate(() => navigator.clipboard.readText())).startsWith('侧翼霰弹枪（已移除）'));
    if (width < 700) await capture('removed-rune');
    const longName = reference.runes.find(rune => rune.id === 'rune_furion_full');
    await select(longName, 'rune');
    if (width === 840 || width === 360) await capture('long-rune');
    await views.getByRole('button', { name: '英雄对照 125', exact: true }).click();
    assert.equal(await workspace.locator('.reference-row img').count(), 125);
    if (width === 1280) for (const hero of reference.heroes) await select(hero, 'hero');
    await select(reference.heroes.find(hero => hero.id === 'abaddon'), 'hero');
    await workspace.getByRole('searchbox', { name: '搜索英雄对照' }).fill('');
    const row = workspace.locator('[data-reference-id="abaddon"] .reference-row');
    if (width < 700) await row.click();
    await loaded(detail.locator('img'), '/abaddon.png');
    await row.scrollIntoViewIfNeeded();
    await capture('hero-list');
    await detail.getByRole('button', { name: '复制资料', exact: true }).click();
    const copy = await page.evaluate(() => navigator.clipboard.readText());
    assert(copy.startsWith('亚巴顿') && !/查看来源|解释参考|配置日期|\.png|\b20\d{2}-\d{2}-\d{2}\b/.test(copy));
    const hero = reference.heroes.find(hero => hero.id === 'abaddon');
    const pool = reference.pools.find(pool => pool.id === hero.poolId);
    await detail.getByRole('button', { name: `查看${pool.name}`, exact: true }).click();
    await detail.locator('.pool-hero-section').getByRole('button', { name: hero.name, exact: true }).click();
    await loaded(detail.locator('img'), '/abaddon.png');
    assert.equal(await detail.locator('h2').textContent(), hero.name);
    await check();
    assert.deepEqual(errors, []);
    log.push(`PASS ${width}x${height}: 36 rune icons, 125 hero icons and portraits; local image loading; lazy rows and immediate detail; removed and long rune titles; unchanged copy and hero/pool links; no overflow, external requests or page errors.${width === 1280 ? ' Every rune and hero image decoded in list and detail.' : ''}`);
    await context.close();
  }
} finally { await browser.close(); }
await writeFile('docs/screenshots/reference-icons.txt', log.join('\n') + '\n');
console.log(log.join('\n'));
