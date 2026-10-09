import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const reference = JSON.parse(await readFile('data/reference.json', 'utf8'));
const mage = reference.runes.find(rune => rune.id === 'rune_wizard_pro');
const longName = reference.runes.find(rune => rune.id === 'rune_furion_full');
const engineering = /rune_|_per_|\b(?:pct|smI|csshI|SetSummonAmp|Transmitter|Ignore|FrameTime|KV)\b|实现要点/;
const format = value => value === null ? '—' : Number(value.toFixed(4)).toString();
const log = [];
await mkdir('.impeccable/review', { recursive: true });
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
try {
  for (const [width, height] of [[1280, 800], [840, 800], [400, 820], [360, 480]]) {
    const context = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('group', { name: '图鉴分类' }).getByRole('button', { name: '符文', exact: true }).click();
    const workspace = page.locator('.reference-container:visible .reference-workspace');
    const views = workspace.getByRole('group', { name: '符文资料视图' });
    const detail = workspace.locator('.reference-detail-content');
    const check = async () => {
      assert(!engineering.test(await workspace.textContent()), 'Internal rune names and implementation terms are absent');
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body,.primary-nav,.reference-toolbar,.reference-list,.reference-detail,.reference-table')]
        .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1).map(element => element.className));
      assert.deepEqual(overflow, []);
    };
    const capture = async surface => {
      await check();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `.impeccable/review/localized-${surface}-${width}x${height}.png`, animations: 'disabled', fullPage: true });
    };
    const select = async (rune, query = rune.name) => {
      await workspace.getByRole('searchbox', { name: '搜索符文' }).fill(query);
      await workspace.locator(`[data-reference-id="${rune.id}"] .reference-row`).click();
      assert.equal(await detail.locator('h2').textContent(), rune.name);
      const parameters = rune.parameters.filter(parameter => parameter.explained);
      const rows = detail.locator('.parameter-table tbody tr');
      assert.equal(await rows.count(), parameters.length);
      for (let index = 0; index < parameters.length; index++) {
        assert.equal(await rows.nth(index).locator('th').textContent(), parameters[index].label);
        assert.equal(await rows.nth(index).locator('td').textContent(), format(parameters[index].value) + parameters[index].unit);
      }
      await check();
    };
    const copy = async (name, root = detail) => {
      await root.getByRole('button', { name: '复制资料', exact: true }).click();
      await root.getByRole('button', { name: '已复制', exact: true }).waitFor();
      const text = await page.evaluate(() => navigator.clipboard.readText());
      assert(text.startsWith(name));
      assert(!engineering.test(text), 'Copied rune and pool data use player-facing language');
      assert(!/查看来源|解释参考|配置日期|\b20\d{2}-\d{2}-\d{2}\b/.test(text));
      return text;
    };
    assert.equal(await workspace.locator('.reference-row').count(), 36);
    assert.deepEqual(await workspace.locator('.reference-row strong').allTextContents(), reference.runes.map(rune => rune.name));
    await capture('list');
    if (width === 1280) {
      for (const rune of reference.runes) { await select(rune); await copy(rune.name); }
    }
    for (const query of [mage.name, mage.py, mage.pyInitials.toUpperCase(), mage.id.toUpperCase()]) await select(mage, query);
    await select(mage);
    const mageCopy = await copy(mage.name);
    assert(mageCopy.includes('冷却时间减少：8%') && mageCopy.includes('生命值调整：-8%'));
    await capture('mage');
    await detail.getByRole('button', { name: '查看包含它的候选池', exact: true }).click();
    assert.equal(await workspace.locator('.reference-row').count(), reference.pools.filter(pool => pool.entries.some(entry => entry.rune === mage.id)).length);
    for (const query of [mage.name, mage.pyInitials, mage.id]) {
      await workspace.getByRole('searchbox', { name: '搜索候选池' }).fill(query);
      const expectedPools = reference.pools.filter(pool => pool.entries.some(entry => entry.rune === mage.id));
      const foundIds = await workspace.locator('.reference-entry').evaluateAll(entries => entries.map(entry => entry.dataset.referenceId));
      assert(expectedPools.every(pool => foundIds.includes(pool.id)), 'All matching rune pools remain findable; initials can also match hero names');
      if (query !== mage.pyInitials) assert.equal(foundIds.length, expectedPools.length);
    }
    await views.getByRole('button', { name: '符文 36', exact: true }).click();
    await select(longName);
    await copy(longName.name);
    await capture('long-name');
    await views.getByRole('button', { name: '候选池 69', exact: true }).click();
    await workspace.getByRole('searchbox', { name: '搜索候选池' }).fill('候选池 01');
    await workspace.locator('.reference-row').click();
    assert.deepEqual(await detail.locator('.pool-table th button').allTextContents(), ['神射手', '射手', '游侠']);
    const poolCopy = await copy('候选池 01');
    assert(poolCopy.includes('神射手：10') && poolCopy.includes('射手：110'));
    await capture('pool');
    await detail.getByRole('button', { name: '神射手', exact: true }).click();
    assert.equal(await detail.locator('h2').textContent(), '神射手');
    await check();
    assert.deepEqual(errors, []);
    log.push(`PASS ${width}x${height}: 36 Chinese rune titles; Chinese, pinyin, initials and legacy identifier lookup; contextual parameter labels and signed values; localized pool names, copy and links; long names fit; no technical prose, dates, overflow or page errors.${width === 1280 ? ' All 36 rune details and copied texts checked.' : ''}`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(log.join('\n'));
await writeFile('docs/screenshots/rune-localization.txt', log.join('\n') + '\n');
