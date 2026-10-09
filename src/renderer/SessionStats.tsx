import { useEffect, useRef, useState } from 'preact/hooks';
import data from '../../data/fuyou.json';
import { initialCapture, type CaptureState } from '../shared/capture';
import { freshGame, type GameSnapshot } from '../shared/game';
import { blessingStats } from '../shared/stats';
import './session-stats.css';

function useSession() {
  const [capture, setCapture] = useState<CaptureState>(initialCapture);
  const [game, setGame] = useState<GameSnapshot>({ status: 'waiting', message: '等待游戏数据' });
  useEffect(() => {
    const api = window.api; if (!api) return;
    let alive = true;
    const offCapture = api.onCapture(s => { if (alive) setCapture(s); });
    const offGame = api.onGame(s => { if (alive) setGame(s); });
    void api.captureState().then(s => { if (alive) setCapture(s); }).catch(() => {});
    void api.gameState().then(s => { if (alive) setGame(s); }).catch(() => {});
    return () => { alive = false; offCapture(); offGame(); };
  }, []);
  return { capture, game: freshGame(game) };
}
const format = (value: number) => `${value > 0 ? '+' : ''}${value}`;
export function StatsView({ capture, game, simulation = false }: { capture: CaptureState; game: GameSnapshot; simulation?: boolean }) {
  const result = blessingStats(capture, data.items);
  const order = ['damage', 'taken', 'spell'];
  const stats = [...result.stats].sort((a, b) => (order.includes(a.key) ? order.indexOf(a.key) : 9) - (order.includes(b.key) ? order.indexOf(b.key) : 9));
  return <div class="session-stats">
    {capture.rows.some(row => !row.id) && <p class="warn">另有 {capture.rows.filter(row => !row.id).length} 项名称未确认，未计入。</p>}
    {game.hero?.health !== undefined && <p>当前生命（游戏上报）：<b class="num">{game.hero.health} / {game.hero.maxHealth ?? '未知'}</b></p>}
    <div class="stats-grid">{stats.map(stat => <div class="stat-tile" key={stat.key}><span>{stat.label}</span><strong class="num">{stat.key === 'range' && result.fixedRange ? '存在覆盖' : stat.value === undefined ? '—' : `${format(stat.value)}${stat.unit}`}</strong><small>{stat.contributions.length ? `${stat.contributions.length} 项加成` : '没有可计算项'}</small></div>)}</div>
    <p>合计按已支持的无条件效果相加。承伤负数表示降低、正数表示增加；百分比攻速与攻速点数分开计算。</p>
    {result.needsMovement && <p class="warn">{simulation ? '攻速鞋未计入：请在已选攻速鞋卡片内填写假设移速。' : '攻速鞋未计入：请在助手填写当前移动速度。'}</p>}
    {result.fixedRange && <p>铁剑在必得：固定攻击距离。</p>}
    <section>
      {stats.filter(s => s.contributions.length).map(s => <p key={s.key}>{s.label}：{s.contributions.map(c => `${c.name} ${format(Number(c.value.toFixed(2)))}${s.unit}`).join('；')}</p>)}
      {!!result.uncovered.length && <p>未计入：{result.uncovered.map(id => data.items.find(i => i.id === id)?.name || id).join('、')}</p>}
    </section>
  </div>;
}
export function OverlayControl() {
  const [overlay, setOverlay] = useState<OverlayState>({ visible: false, expanded: false });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const api = window.api; if (!api?.overlayState) return; const off = api.onOverlay(setOverlay); void api.overlayState().then(setOverlay).catch(() => setError('无法读取悬浮图标状态')); return off; }, []);
  const toggle = async () => {
    if (!window.api || busy) return;
    setBusy(true); setError('');
    try { setOverlay(await (overlay.visible ? window.api.hideOverlay() : window.api.showOverlay())); }
    catch { setError('悬浮图标启动失败，请重试'); } finally { setBusy(false); }
  };
  return <section class="game-box overlay-entry" aria-label="悬浮图标入口"><div class="game-heading"><h2>游戏悬浮圆钮</h2><button disabled={!window.api || busy} onClick={() => void toggle()}>{overlay.visible ? '关闭悬浮图标' : '显示悬浮图标'}</button></div><p>开始采集后自动显示圆钮，点击展开竖向读数菜单。拖动可调整位置，下次开启沿用；开启后可最小化助手主窗口。</p>{error && <p role="alert">{error}</p>}</section>;
}
export function SessionStats() {
  const { capture, game } = useSession();
  const [movement, setMovement] = useState(''), [error, setError] = useState('');
  useEffect(() => { setMovement(capture.movement === undefined ? '' : String(capture.movement)); }, [capture.session, capture.movement]);
  return <section class="game-box" aria-label="本局属性面板"><div class="game-heading"><h2>本局福佑加成</h2></div>
    <p>页面顶部可开启悬浮圆钮。使用无边框窗口游戏；不保证独占全屏下可见。数值修正在采集条目中完成。</p>
    <label class="game-field">当前移速（供攻速鞋估算）<input type="number" min="0" step="any" value={movement} onInput={e => setMovement(e.currentTarget.value)}/></label>
    <button disabled={!window.api || (movement.trim() !== '' && (!Number.isFinite(Number(movement)) || Number(movement) < 0))} onClick={() => void window.api!.setMovement(capture.session, movement.trim() ? Number(movement) : null).catch(() => setError('移速保存失败，请重试'))}>保存移速</button>
    {error && <p role="alert">{error}</p>}<StatsView capture={capture} game={game}/>
  </section>;
}
export function OverlayApp() {
  const { capture, game } = useSession();
  const [expanded, setExpanded] = useState(false);
  const drag = useRef({ x: 0, y: 0, moved: false, down: false });
  useEffect(() => {
    document.body.classList.add('overlay-body');
    const api = window.api; if (!api?.overlayState) return;
    const off = api.onOverlay(s => setExpanded(s.expanded)); void api.overlayState().then(s => setExpanded(s.expanded)); return off;
  }, []);
  const grip = {
    onPointerDown: (e: PointerEvent) => { if (e.button !== 0) return; drag.current = { x: e.screenX, y: e.screenY, moved: false, down: true }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: PointerEvent) => { const d = drag.current; if (!d.down) return; const dx = e.screenX - d.x, dy = e.screenY - d.y; if (Math.abs(dx) + Math.abs(dy) < 4 && !d.moved) return; d.moved = true; d.x = e.screenX; d.y = e.screenY; window.api?.moveOverlay(dx, dy); },
    onPointerUp: () => { drag.current.down = false; },
    onPointerCancel: () => { drag.current.down = false; drag.current.moved = true; }
  };
  if (!expanded) return <button class="overlay-orb" aria-label="展开本局属性面板" {...grip} onClick={() => { if (!drag.current.moved) window.api?.toggleOverlay(); }}>福</button>;
  return <div class="overlay-panel"><header><span {...grip} class="overlay-grip">本局福佑加成 · 拖动</span><button aria-label="收起面板" onClick={() => window.api?.toggleOverlay()}>收起</button><button aria-label="关闭悬浮图标" onClick={() => void window.api?.hideOverlay()}>×</button></header><div class="overlay-content"><StatsView capture={capture} game={game}/></div></div>;
}
