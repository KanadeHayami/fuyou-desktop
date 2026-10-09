import { useEffect, useRef, useState } from 'preact/hooks';
import { initialLive, liveFields, liveSummary, LIVE_STALE_MS, type LiveMode, type LiveState } from '../shared/live';
import { OverlayControl } from './SessionStats';
import './live.css';

const age = (time: number, now: number) => { const seconds = Math.max(0, Math.floor((now - time) / 1000)); return seconds < 1 ? '刚刚' : seconds < 60 ? `${seconds} 秒前` : `${Math.floor(seconds / 60)} 分钟前`; };
const number = (value: number) => `${value}%`;
function useLive() {
  const [state, setState] = useState<LiveState>(initialLive);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const api = window.api;
    let alive = true, revision = 0;
    const off = api?.onLive?.(value => { revision++; if (alive) setState(value); });
    void api?.liveState?.().then(value => { if (alive && revision === 0) setState(value); }).catch(() => { if (alive) setState(s => ({ ...s, status: 'error', message: '无法读取采集状态，请重启助手。' })); });
    return () => { alive = false; off?.(); clearInterval(timer); };
  }, []);
  return { state, now };
}
export function LiveSummary({ state, now, compact = false }: { state: LiveState; now: number; compact?: boolean }) {
  return <section class="live-summary" aria-label="本局读数">
    {!compact && <h2>本局读数</h2>}
    <div class="live-totals">{liveSummary(state, now).map(stat => <article class={`live-total ${stat.stale ? 'is-stale' : ''}`} key={stat.key} data-field={stat.key}>
      <span>{stat.label}</span><strong class="num">{stat.value === undefined ? '—' : number(stat.value)}</strong>
      <small>{stat.kind === 'conflict' ? '总值冲突，请核对记录' : stat.kind === 'total' ? `${stat.stale ? '上次' : '已读'}总值` : stat.kind === 'partial' ? `${stat.count} 项加成合计 · 非完整总值` : stat.pending ? `${stat.pending} 项用途待核对` : '等待悬停识别'}</small>
      {stat.seenAt !== undefined && <small>{age(stat.seenAt, now)}{stat.stale ? ' · 需重新悬停' : ''}</small>}
    </article>)}</div>
    {!compact && <p>总值直接显示；加成项仅作部分相加。百分比保留游戏原值，请按说明核对含义。</p>}
  </section>;
}

export function LivePanel() {
  const { state, now } = useLive();
  const [intervalMs, setInterval] = useState(1000), [hudOnly, setHudOnly] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const available = !!window.api?.startLive;
  useEffect(() => { setInterval(state.intervalMs); setHudOnly(state.hudOnly); }, [state.intervalMs, state.hudOnly]);
  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试。'); } finally { setBusy(false); }
  };
  return <main class="live-panel">
    <header class="live-heading"><div><h1>局内属性</h1><p>悬停 buff，更新同一条记录。</p></div><span class={`live-status ${state.status}`} role="status">{{ paused: '未采集', starting: '准备中', watching: '等待／识别中', background: '等待游戏前台', error: '采集异常' }[state.status]}</span></header>
    <div class="live-controls">
      <button class="live-start" disabled={!available || busy} onClick={() => void act(() => state.active ? window.api!.stopLive() : window.api!.startLive({ intervalMs, hudOnly }))}>{state.active ? '暂停采集' : '开始采集'}</button>
      <label>检查间隔<select aria-label="检查间隔" disabled={state.active || busy} value={intervalMs} onChange={e => setInterval(Number(e.currentTarget.value))}><option value={1000}>1 秒</option><option value={2000}>2 秒</option></select></label>
      <label class="live-checkbox"><input type="checkbox" checked={hudOnly} disabled={state.active || busy} onChange={e => setHudOnly(e.currentTarget.checked)}/>仅下半屏悬停</label>
      <button disabled={!available || busy || !state.records.length} onClick={() => void act(() => window.api!.clearLive())}>新局清空</button>
    </div>
    <p class="live-message" role="status">{available ? state.message : '请在桌面版开启采集；浏览器只预览界面。'}</p>
    {error && <p role="alert" class="warn">{error}</p>}
    <OverlayControl/>
    <div class="live-layout">
      <LiveSummary state={state} now={now}/>
      <section class="live-ledger" aria-label="已读 buff 记录">
        <div class="live-heading"><h2>已读 buff <small>{state.records.length}</small></h2></div>
        {!state.records.length && <div class="live-empty"><strong>从一个 buff 开始</strong><p>选中自己的英雄，把鼠标停在技能栏上方的 buff 图标约 2–3 秒，等待完整说明出现。</p><p>同名记录覆盖更新，图标移动不会多算。新对局请先清空。</p></div>}
        {state.records.map(record => {
          const stale = !state.active || state.status !== 'watching' || now - record.lastSeen > LIVE_STALE_MS;
          const actionable = record.values.some(v => v.role !== 'info');
          return <article class={`live-record ${record.mode === 'ignore' ? 'is-ignored' : ''}`} key={record.key}>
            <header><h3>{record.title}</h3><span>{age(record.lastSeen, now)}{stale ? ' · 上次读数' : ''}</span><button disabled={busy} aria-label={`移除${record.title}记录`} onClick={() => void act(() => window.api!.editLive({ session: state.session, key: record.key, remove: true }))}>移除</button></header>
            <dl>{record.values.map(value => <div key={value.key}><dt>{liveFields[value.key].label}</dt><dd class="num">{liveFields[value.key].unit === '%' ? number(value.value) : value.value}<small>{value.role === 'info' ? value.key === 'nextAttack' ? '触发门槛' : '独立读数' : record.mode === 'ignore' ? '不计入' : record.mode === 'total' || record.mode === 'auto' && value.role === 'total' ? '总值' : record.mode === 'component' ? '加成项' : '用途待核对'}</small></dd></div>)}</dl>
            {actionable && <label class="live-mode">这些数值是<select aria-label={`${record.title}数值用途`} disabled={busy} value={record.mode} onChange={e => { const mode = e.currentTarget.value as LiveMode; void act(() => window.api!.editLive({ session: state.session, key: record.key, mode })); }}><option value="auto">按说明判断</option><option value="total">角色总值 · 直接显示</option><option value="component">单项加成 · 部分合计</option><option value="ignore">不计入</option></select></label>}
            <details><summary>核对识别文字</summary><p>{record.raw.join('\n')}</p></details>
          </article>;
        })}
      </section>
    </div>
    <details class="live-help"><summary>如何更新与核对</summary><p>每个数值连续两次识别一致后更新。带“当前／总”的明确属性行按总值读取；其他数值需在记录内确认用途。总值与加成项不重复相加，溢出攻速和触发门槛单独记录。</p><p>同名 buff 合并为一条记录；若游戏有多个不同来源的同名 buff，请人工核对。鼠标移开后保留读数，超过 15 秒标为上次读数。buff 是否消失、英雄是否仍为自己无法仅凭说明框确认；失效项请设为“不计入”，换局清空。</p><p>只识别游戏前台、鼠标停稳后的附近区域。默认鼠标需在下半屏；若 buff 位于上半屏，可暂停后取消限制。截图在本机处理，不保存或上传。悬浮圆钮适合无边框窗口模式。</p></details>
  </main>;
}

export function LiveOverlay() {
  const { state, now } = useLive();
  const [overlay, setOverlay] = useState<OverlayState>({ visible: false, expanded: false }), [error, setError] = useState('');
  const drag = useRef({ x: 0, y: 0, down: false, moved: false });
  useEffect(() => {
    document.documentElement.classList.add('overlay-root');
    document.body.classList.add('overlay-body');
    let alive = true, changed = false;
    const off = window.api?.onOverlay?.(s => { changed = true; if (alive) setOverlay(s); });
    void window.api?.overlayState?.().then(s => { if (alive && !changed) setOverlay(s); }).catch(() => { if (alive) setError('无法读取悬浮状态'); });
    return () => { alive = false; off?.(); document.documentElement.classList.remove('overlay-root'); document.body.classList.remove('overlay-body'); };
  }, []);
  const grip = {
    onPointerDown: (e: PointerEvent) => { if (e.button !== 0) return; drag.current = { x: e.screenX, y: e.screenY, down: true, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: PointerEvent) => { const d = drag.current; if (!d.down) return; const dx = e.screenX - d.x, dy = e.screenY - d.y; if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return; d.moved = true; d.x = e.screenX; d.y = e.screenY; window.api?.moveOverlay(dx, dy); },
    onPointerUp: () => { drag.current.down = false; },
    onPointerCancel: () => { drag.current.down = false; drag.current.moved = true; }
  };
  const { expanded, layout } = overlay;
  const orb = layout?.orb ?? { x: 0, y: 0 }, menu = layout?.menu;
  return <div class="live-overlay-shell">
    <button class={`overlay-orb live-orb ${state.status}`} style={{ left: orb.x, top: orb.y }} aria-label={expanded ? '收起本局属性面板' : '展开本局属性面板'} aria-expanded={expanded} aria-controls="live-overlay-menu" title={error || '点击查看读数 · 拖动调整位置'} {...grip} onClick={() => { if (!drag.current.moved) window.api?.toggleOverlay(); }}><span>福</span><i aria-hidden="true"/></button>
    {expanded && menu && <section id="live-overlay-menu" class="overlay-panel live-overlay" aria-label="局内属性菜单" style={{ left: menu.x, top: menu.y, width: menu.width, height: menu.height }}>
      <header><h2>本局属性</h2><button aria-label="收起面板" onClick={() => window.api?.toggleOverlay()}>收起</button><button aria-label="关闭悬浮图标" title="关闭悬浮图标" onClick={() => void window.api?.hideOverlay().catch(() => setError('关闭失败，请重试'))}>×</button></header>
      <div class="overlay-content"><div class={`live-menu-status ${state.status}`} role="status"><i aria-hidden="true"/>{{ paused: '已暂停 · 上次读数', starting: '正在准备识别', watching: '悬停 buff 更新读数', background: '等待游戏前台', error: '采集异常' }[state.status]}</div><LiveSummary state={state} now={now} compact/>
        {state.records.filter(r => r.mode !== 'ignore').flatMap(r => r.values.filter(v => v.role === 'info').map(v => <p class="live-extra" key={`${r.key}:${v.key}`}><span>{liveFields[v.key].label}</span><b class="num">{v.value}</b><small>{r.title} · {age(r.lastSeen, now)} · {v.key === 'nextAttack' ? '触发门槛' : '上次读数'}</small></p>))}
        <p class="live-message">{error || state.message}</p>
      </div>
    </section>}
  </div>;
}
