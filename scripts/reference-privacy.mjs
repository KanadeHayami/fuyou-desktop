import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const forbidden = /(?:[a-z]:[\\/]|(?:reports|tmp)[\\/]|原始资料索引|查看来源|解密|对象解析)/i;
const removedCopy = /(?:抽选资料|原始配置字段|原始英雄符文池|原始符文池|查看原始权重|原始消耗配置|原符文池快照|英雄表补充池|资料日期|配置日期|数据基准|解释参考|解释依据|历史版本|待核实|不一定|不代表|不等于|尚未|这里不估算|09-12|\b20\d{2}-\d{2}-\d{2}\b)/;
const reference = JSON.parse(await readFile('data/reference.json', 'utf8'));
assert(!('sources' in reference.meta), 'Private source indexes must not be distributed');
assert(!forbidden.test(JSON.stringify(reference)), 'Reference data contains private engineering details');
async function inspectBundle(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspectBundle(path);
    else if (/\.(?:js|json|html|css|map|ps1)$/.test(entry.name)) {
      assert(!forbidden.test(await readFile(path, 'utf8')), `Private details found in build output: ${entry.name}`);
    }
  }
}
await inspectBundle('out');
const log = ['PASS distributed data and build output: no private project directories, input file names or source indexes.'];
await mkdir('.impeccable/review', { recursive: true });
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
try {
  for (const [width, height] of [[1280, 800], [840, 800], [400, 820], [360, 480]]) {
    const context = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const nav = page.getByRole('navigation', { name: '主导航' });
    const category = page.getByRole('group', { name: '图鉴分类' });
    const workspace = () => page.locator('.reference-container:visible .reference-workspace');
    const inspectSurface = async (surface, root, copyButton) => {
      assert.equal(await page.locator('.reference-source,.bless-information details,.reference-detail-content details,.mechanics-content details,.session-stats details').count(), 0, `${surface}: all source controls and bodies are removed, including alternate labels`);
      assert.equal(await page.locator('.reference-date,.reference-footer,.baseline,.range-note').count(), 0, `${surface}: date and disclaimer elements are removed`);
      assert(!forbidden.test(await page.locator('body').textContent()), `${surface}: no private details in the DOM, including collapsed content`);
      assert(!removedCopy.test(await page.locator('body').textContent()), `${surface}: no dates, version references or uncertainty copy in the full DOM`);
      if (copyButton) {
        await copyButton.click();
        await root.getByText('已复制', { exact: true }).waitFor();
        assert(!forbidden.test(await page.evaluate(() => navigator.clipboard.readText())), `${surface}: no private details in copied data`);
        assert(!removedCopy.test(await page.evaluate(() => navigator.clipboard.readText())), `${surface}: no dates or uncertainty copy in copied data`);
      }
      const overflowing = await root.evaluate(element => [element, ...element.querySelectorAll('table,section')]
        .filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1).map(node => node.tagName));
      assert.deepEqual(overflowing, [], `${surface}: details fit the viewport`);
      if (surface === 'mechanics') await root.evaluate(element => { element.scrollTop = 0; });
      else if (width < 700) await root.scrollIntoViewIfNeeded();
      else if (surface !== 'bless') await root.locator('.reference-detail').evaluate(element => { element.scrollTop = 0; });
      await page.evaluate(() => document.fonts.ready);
      if (process.env.TEST_SCREENSHOTS !== '0') await page.screenshot({ path: `.impeccable/review/privacy-${surface}-${width}x${height}.png`, animations: 'disabled', fullPage: true });
    };
    await page.goto('http://127.0.0.1:5173');
    await nav.getByRole('button', { name: '模拟器', exact: true }).click();
    await nav.getByRole('button', { name: '图鉴', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索福佑', exact: true }).fill('gsx');
    await page.locator('.item-row').click();
    const bless = width < 700 ? page.locator('.item.selected .expanded') : page.getByRole('complementary', { name: '福佑详情' });
    await inspectSurface('bless', bless, bless.getByRole('button', { name: '复制效果文本' }));
    await category.getByRole('button', { name: '符文', exact: true }).click();
    await workspace().getByRole('searchbox', { name: '搜索符文' }).fill('rune_wizard_pro');
    await workspace().locator('.reference-row').click();
    await inspectSurface('runes', workspace(), workspace().getByRole('button', { name: '复制资料', exact: true }));
    const views = workspace().getByRole('group', { name: '符文资料视图' });
    await views.getByRole('button', { name: '候选池 69', exact: true }).click();
    await workspace().getByRole('searchbox', { name: '搜索候选池' }).fill('候选池 01');
    await workspace().locator('.reference-row').click();
    await inspectSurface('pools', workspace(), workspace().getByRole('button', { name: '复制资料', exact: true }));
    await views.getByRole('button', { name: '英雄对照 125', exact: true }).click();
    await workspace().getByRole('searchbox', { name: '搜索英雄对照' }).fill('abaddon');
    await workspace().locator('.reference-row').click();
    await inspectSurface('heroes', workspace(), workspace().getByRole('button', { name: '复制资料', exact: true }));
    await category.getByRole('button', { name: '随机事件', exact: true }).click();
    await workspace().getByRole('searchbox', { name: '搜索事件' }).fill('1001');
    await workspace().locator('.reference-row').click();
    await inspectSurface('events', workspace(), workspace().getByRole('button', { name: '复制资料', exact: true }));
    await nav.getByRole('button', { name: '机制', exact: true }).click();
    for (const id of ['costs', 'runes', 'events', 'basic', 'quality']) {
      if (width < 700) await page.getByRole('combobox', { name: '选择机制主题' }).selectOption(id);
      else {
        const titles = { quality: '福佑抽取', costs: '重随与重铸', runes: '符文选择', events: '随机事件', basic: '基础玩法' };
        await page.getByRole('group', { name: '机制主题' }).getByRole('button', { name: titles[id], exact: true }).click();
      }
      assert.equal(await page.locator('.mechanics-content details,.reference-source').count(), 0, `${id}: no source disclosure bodies`);
      assert(!removedCopy.test(await page.locator('body').textContent()), `${id}: no dates or uncertainty copy`);
    }
    await inspectSurface('mechanics', page.locator('.mechanics-content'));
    assert.deepEqual(errors, []);
    log.push(`PASS ${width}x${height}: all source controls and bodies removed from six reference surfaces and five mechanic topics; dates, version references and uncertainty copy absent from full DOM and clipboard; game values and rules remain; no detail overflow or page errors.`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(log.join('\n'));
await writeFile('docs/screenshots/reference-privacy.txt', log.join('\n') + '\n');
