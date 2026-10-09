import { useEffect, useState } from 'preact/hooks';
import data from '../../data/fuyou.json';
import { DEFAULT_REGION, initialCapture, type CaptureState, type Region } from '../shared/capture';
import { rollRanges, estimatedDescription, type RollRange } from '../shared/rolls';

export function RollInput({ range, saved, save }: { range: RollRange; saved?: number; save: (value: number | null) => Promise<void> }) {
  const [draft, setDraft] = useState(saved === undefined ? '' : String(saved));
  const [pending, setPending] = useState(false);
  useEffect(() => setDraft(saved === undefined ? '' : String(saved)), [saved]);
  const valid = draft.trim() === '' || Number.isFinite(Number(draft));
  const apply = async (value: number | null) => { setPending(true); try { await save(value); } finally { setPending(false); } };
  return <div class="roll-input">
    <label>{range.context}<input aria-label={`本局数值 ${range.index}`} type="text" inputMode="decimal" value={draft} placeholder={`默认 ${range.midpoint}`} onInput={e => setDraft(e.currentTarget.value)}/></label>
    <div class="game-buttons"><button disabled={pending || !valid} onClick={() => void apply(draft.trim() === '' ? null : Number(draft))}>保存数值</button><button disabled={pending || saved === undefined} onClick={() => { setDraft(''); void apply(null); }}>恢复中位数</button></div>
    <p>{saved === undefined ? `中位数估算：${range.midpoint}` : `玩家输入：${saved}`} · 图鉴范围 {range.min}–{range.max}{saved !== undefined && (saved < range.min || saved > range.max) ? ' · 超出收录范围，请核对（保留输入）' : ''}</p>
    {!valid && <p class="warn">请输入有效数字；留空恢复中位数。</p>}
  </div>;
}

const names = new Map(data.items.map(i => [i.id, i]));
export function CapturePanel() {
  const [state, setState] = useState<CaptureState>(initialCapture);
  const [intervalMs, setIntervalMs] = useState(5000);
  const [region, setRegion] = useState<Region>({ ...DEFAULT_REGION });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!window.api) return;
    let mounted = true;
    const off = window.api.onCapture(s => { if (mounted) setState(s); });
    void window.api.captureState().then(s => { if (mounted) { setState(s); setRegion(s.region); setIntervalMs(s.intervalMs); } }).catch(() => { if (mounted) setError('无法读取采集状态，请重启助手'); });
    return () => { mounted = false; off(); };
  }, []);
  const action = async (run: () => Promise<CaptureState>) => {
    setBusy(true); setError('');
    try { setState(await run()); } catch { setError('操作失败，请检查采集范围或重启助手后重试'); } finally { setBusy(false); }
  };
  return <section class="game-box capture-panel" aria-label="已选福佑采集">
    <div class="game-heading"><h2>已选福佑采集</h2><span class="game-status">{state.active ? '采集中' : '已暂停'}</span></div>
    <p>打开游戏右侧“福佑碎片背包”，保持游戏在前台。仅识别可见名称；效果数值暂不采集。</p>
    <p>未填写的区间取两端平均值作为“中位数估算”，不代表本局实测值。展开“本局数值”可修改，保存后持续采集不会覆盖；换局清空会重置。</p>
    <div class="game-buttons"><button disabled={!window.api || busy} onClick={() => void action(() => state.active ? window.api!.stopCapture() : window.api!.startCapture({ intervalMs, region }))}>{state.active ? '暂停采集' : '开始采集'}</button><button disabled={!window.api || busy} onClick={() => void action(() => window.api!.clearCapture())}>新局清空</button>
      <label>采集间隔 <select aria-label="采集间隔" disabled={state.active} value={intervalMs} onChange={e => setIntervalMs(Number(e.currentTarget.value))}><option value={2000}>2 秒</option><option value={5000}>5 秒（省资源）</option></select></label>
    </div>
    <p role="status">{window.api ? state.message : '浏览器预览不采集屏幕，请使用桌面版'}</p>
    {error && <p class="warn" role="alert">{error}</p>}
    {state.observedAt && <p>最近看到背包：{new Date(state.observedAt).toLocaleTimeString('zh-CN')} · {state.status === 'running' ? '当前可见清单' : '上次记录，非实时值'}</p>}
    {state.rows.length > 0 ? <div class="captured-rows">{state.rows.map((row, index) => {
      const item = row.id ? names.get(row.id) : undefined;
      return <article key={`${row.raw}-${index}`} class="captured-row">
        {item && <span class={`item-icon q${item.quality}`}><img src={`${import.meta.env.BASE_URL}icons/${item.id}.png`} alt="" loading="lazy" decoding="async"/></span>}
        <div><strong>{item?.name || row.raw.replace(/\s+/g, '')}</strong><p>{item ? row.confirmed ? '你已确认名称' : '文字识别匹配' : '名称不完整或未匹配，请核对游戏画面'}</p>
          {item && <details class="rolls"><summary>本局数值 · {Object.keys(state.values[item.id] || {}).length ? '含玩家输入' : rollRanges(item.plain).length ? '中位数估算' : '无明确区间'}</summary>
            <p>{estimatedDescription(item.plain, state.values[item.id])}</p>
            <p>以上为图鉴效果代入参数，非最终实战收益；固定数字沿用图鉴，不代表实时测量。</p>
            {rollRanges(item.plain).map(range => <RollInput key={`${state.session}-${item.id}-${range.index}`} range={range} saved={state.values[item.id]?.[String(range.index)]} save={value => action(() => window.api!.setCaptureValue(state.session, item.id, range.index, value))}/>)}
            {!rollRanges(item.plain).length && <p>没有明确随机区间，无法生成中位数；当前仅展示图鉴原文。</p>}
          </details>}
          {!item && row.candidates.length > 0 && <div class="capture-candidates">{row.candidates.map(id => <button disabled={busy} onClick={() => void action(() => window.api!.confirmCapture(index, id))}>{names.get(id)?.name || id}</button>)}</div>}
          <details><summary>识别原文</summary><p>{row.raw}</p></details>
        </div>
      </article>;
    })}</div> : <p>尚无识别记录。请展开背包后开始采集。</p>}
    <details class="capture-settings"><summary>采集范围与开销</summary>
      <p>使用无边框窗口模式；助手或其他窗口不要遮住背包。默认只截取游戏窗口右侧区域，截图不落盘、不上传。画面不变则跳过识别，识别较慢时延后下一轮。</p>
      <div class="capture-region">{([['x', '左侧位置'], ['y', '顶部位置'], ['width', '宽度'], ['height', '高度']] as [keyof Region, string][]).map(([key, text]) => <label>{text} %<input aria-label={`采集${text}`} disabled={state.active} type="number" min="0" max="100" step="1" value={Math.round(region[key] * 100)} onInput={e => setRegion(r => ({ ...r, [key]: Number(e.currentTarget.value) / 100 }))}/></label>)}</div>
      <button disabled={state.active} onClick={() => setRegion({ ...DEFAULT_REGION })}>恢复默认范围</button>
      {state.metrics && <p>最近一次：截图与对比 {state.metrics.captureMs} ms · 识别 {state.metrics.ocrMs} ms · 合计 {state.metrics.totalMs} ms<br/>识别进程内存 {state.metrics.memoryMB} MB · 本次 CPU 时间 {state.metrics.cpuMs} ms<br/>区域 {state.metrics.width} × {state.metrics.height}；不含助手其他进程开销。</p>}
      <p>已检查 {state.checks} 次 · 已识别 {state.recognitions} 次 · 画面未变跳过 {state.unchanged} 次。暂停会释放识别进程。</p>
      <p>游戏状态能确认换局时自动清空；GSI 未连接或无法判断换局时，请手动点“新局清空”。清单仅反映可见部分，不推断隐藏项。</p>
    </details>
  </section>;
}
