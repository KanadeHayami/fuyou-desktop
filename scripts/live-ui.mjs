import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const log = [];
try {
  for (const [width, height] of [[1280, 800], [840, 800], [400, 820], [360, 480]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      let listener, overlayListener, overlay = { visible: false, expanded: false };
      const overlayState = () => ({ ...overlay, layout: { bounds: { x: 0, y: 0, width: Math.min(268, innerWidth), height: Math.min(532, innerHeight) }, orb: { x: 0, y: 0 }, menu: overlay.expanded ? { x: 0, y: 72, width: Math.min(268, innerWidth), height: Math.min(460, innerHeight - 72) } : undefined, direction: 'down' } });
      let state = { session: 0, active: false, intervalMs: 1000, hudOnly: true, status: 'paused', message: '离线测试样本 · 非实时游戏数据', records: [], checks: 0, recognitions: 0 };
      const publish = () => { listener?.(structuredClone(state)); return structuredClone(state); };
      window.feedLive = patch => { state = { ...state, ...patch }; return publish(); };
      window.api = {
        state: async () => ({ pinned: false, maximized: false }), onState: () => () => {}, action: () => {},
        liveState: async () => structuredClone(state), onLive: fn => { listener = fn; return () => { listener = undefined; }; },
        startLive: async options => { state = { ...state, ...options, active: true, status: 'watching' }; void window.api.showOverlay(); return publish(); },
        stopLive: async () => { state.active = false; state.status = 'paused'; return publish(); },
        clearLive: async () => { state.records = []; state.session++; return publish(); },
        editLive: async input => { state.records = input.remove ? state.records.filter(r => r.key !== input.key) : state.records.map(r => r.key === input.key ? { ...r, mode: input.mode } : r); return publish(); },
        overlayState: async () => overlayState(), onOverlay: fn => { overlayListener = fn; return () => { overlayListener = undefined; }; },
        showOverlay: async () => { overlay.visible = true; overlayListener?.(overlayState()); return overlayState(); },
        hideOverlay: async () => { overlay = { visible: false, expanded: false }; overlayListener?.(overlayState()); return overlayState(); },
        toggleOverlay: () => { overlay.expanded = !overlay.expanded; overlayListener?.(overlayState()); }, moveOverlay: () => {}
      };
    });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: '局内', exact: true }).click();
    await page.getByRole('heading', { name: '局内属性', exact: true }).waitFor();
    assert.equal(await page.locator('.live-record').count(), 0);
    assert.equal(await page.locator('.live-total').count(), 3);
    assert.equal(await page.locator('.titlebar').evaluate(e => e.scrollWidth > e.clientWidth), false);
    await page.getByRole('button', { name: '开始采集', exact: true }).click();
    await page.getByRole('button', { name: '暂停采集', exact: true }).waitFor();
    assert.equal(await page.getByLabel('检查间隔').isDisabled(), true);
    await page.evaluate(() => window.feedLive({ records: [
      { key: '离线总值', title: '离线总值', mode: 'auto', values: [{ key: 'damage', value: 40, role: 'total' }, { key: 'taken', value: -20, role: 'total' }, { key: 'spell', value: 0, role: 'total' }], raw: ['离线合成样本，仅用于界面验收'], firstSeen: Date.now(), lastSeen: Date.now(), updates: 1 },
      { key: '离线加成', title: '离线加成', mode: 'auto', values: [{ key: 'damage', value: 10, role: 'unknown' }], raw: ['离线合成样本'], firstSeen: Date.now(), lastSeen: Date.now(), updates: 1 },
      { key: '替身攻击', title: '替身攻击', mode: 'auto', values: [{ key: 'overflow', value: 1284, role: 'info' }, { key: 'nextAttack', value: 1800, role: 'info' }], raw: ['用户截图的离线读数，非实时'], firstSeen: Date.now(), lastSeen: Date.now(), updates: 1 }
    ] }));
    await page.waitForFunction(() => document.querySelector('[data-field="damage"] strong')?.textContent === '40%');
    assert.equal(await page.locator('[data-field="taken"] strong').textContent(), '-20%');
    assert.equal(await page.locator('[data-field="spell"] strong').textContent(), '0%');
    await page.getByLabel('离线加成数值用途').selectOption('component');
    assert.equal(await page.locator('[data-field="damage"] strong').textContent(), '40%');
    await page.getByLabel('离线总值数值用途').selectOption('ignore');
    await page.waitForFunction(() => document.querySelector('[data-field="damage"] strong')?.textContent === '10%');
    assert((await page.locator('[data-field="damage"]').textContent()).includes('非完整总值'));
    await page.getByRole('button', { name: '图鉴', exact: true }).click();
    await page.getByRole('button', { name: '局内', exact: true }).click();
    await page.locator('.live-record').first().waitFor();
    assert.equal(await page.locator('.live-record').count(), 3);
    await page.getByLabel('离线总值数值用途').selectOption('auto');
    await page.getByRole('button', { name: '暂停采集', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-field="damage"]')?.textContent.includes('上次总值'));
    assert.equal(await page.getByLabel('检查间隔').isDisabled(), false);
    await page.getByRole('button', { name: '关闭悬浮图标', exact: true }).waitFor();
    assert.equal(await page.locator('.live-panel').evaluate(e => e.scrollWidth > e.clientWidth), false);
    await page.locator('.live-panel').evaluate(e => { e.scrollTop = 0; });
    await page.screenshot({ path: `docs/screenshots/live-${width}x${height}.png` });
    await page.getByRole('button', { name: '新局清空', exact: true }).click();
    assert.equal(await page.locator('.live-record').count(), 0);
    await page.goto('http://127.0.0.1:5173/?overlay=1');
    await page.setViewportSize({ width: 268, height: Math.min(height, 532) });
    const orbBefore = await page.locator('.live-orb').boundingBox();
    await page.getByRole('button', { name: '展开本局属性面板' }).click();
    await page.locator('.live-overlay').waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgba(0, 0, 0, 0)', 'Empty space around the circle must stay transparent');
    assert.deepEqual(await page.locator('.live-orb').boundingBox(), orbBefore, 'Opening the menu must retain the circle');
    await page.evaluate(() => window.feedLive({ active: true, status: 'watching', records: [
      { key: '离线总值', title: '离线总值', mode: 'auto', values: [{ key: 'damage', value: 40, role: 'total' }, { key: 'taken', value: -20, role: 'total' }, { key: 'spell', value: 0, role: 'total' }], raw: ['离线合成样本，仅用于界面验收'], firstSeen: Date.now(), lastSeen: Date.now(), updates: 1 }
    ] }));
    await page.waitForFunction(() => document.querySelector('[data-field="damage"] strong')?.textContent === '40%');
    const rows = await page.locator('.live-total').evaluateAll(elements => elements.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom }; }));
    assert(rows.every((row, i) => i === 0 || row.x === rows[0].x && row.y >= rows[i - 1].bottom), 'All primary stats must form one vertical column');
    assert.equal(await page.locator('[data-field="taken"] strong').textContent(), '-20%');
    assert.equal(await page.locator('[data-field="spell"] strong').textContent(), '0%');
    assert.equal(await page.locator('.overlay-content').evaluate(e => e.scrollWidth > e.clientWidth), false);
    await page.screenshot({ path: `docs/screenshots/live-overlay-${width}.png`, omitBackground: true });
    await page.getByRole('button', { name: '收起本局属性面板', exact: true }).click();
    await page.getByRole('button', { name: '展开本局属性面板' }).waitFor();
    assert.equal(await page.locator('.live-overlay').count(), 0);
    assert.deepEqual(await page.locator('.live-orb').boundingBox(), orbBefore);
    // A drag is not a click, even when the pointer is released on the circle.
    await page.mouse.move(32, 32); await page.mouse.down(); await page.mouse.move(44, 40); await page.mouse.up();
    assert.equal(await page.locator('.live-orb').getAttribute('aria-expanded'), 'false');
    await page.getByRole('button', { name: '展开本局属性面板' }).click();
    await page.getByRole('button', { name: '收起面板' }).click();
    await page.getByRole('button', { name: '展开本局属性面板' }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    log.push(`PASS ${width}x${height}: navigation, start/pause, record review, zero/negative/threshold values, total/component separation, stale labels, page-switch persistence, clear, persistent circle, vertical menu, live updates, click/drag distinction; no overflow/page errors. Isolated offline fixtures only.`);
  }
  const plain = await browser.newPage();
  await plain.goto('http://127.0.0.1:5173');
  await plain.getByRole('button', { name: '局内', exact: true }).click();
  assert.equal(await plain.getByRole('button', { name: '开始采集', exact: true }).isDisabled(), true);
  assert.equal(await plain.getByRole('button', { name: '显示悬浮图标', exact: true }).isDisabled(), true);
  await plain.close();
  log.push('PASS ordinary browser preview: no desktop API, no records, capture and overlay disabled.');
} finally { await browser.close(); }
console.log(log.join('\n'));
await writeFile('docs/screenshots/live-ui.txt', log.join('\n') + '\n');
