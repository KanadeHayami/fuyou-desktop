import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import data from '../../data/fuyou.json';
import { defaults, filterItems, qualityName, type Item } from './model';
import { emptySimulation, restoreSimulation, simulationSnapshot, type Simulation } from '../shared/simulator';
import { rollRanges } from '../shared/rolls';
import { blessingStats } from '../shared/stats';
import { StatsView } from './SessionStats';
import { InlineRoll } from './InlineRoll';
import './simulator.css';
import type { MechanismTopic } from '../shared/reference';
const items = data.items as Item[];
const storageKey = 'fuyou.simulator.v1';
function MovementInput({ value, save }: { value?: number; save: (value?: number) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [invalid, setInvalid] = useState(false);
  return <div><label class="game-field">假设当前移速<input aria-label="模拟移动速度" type="number" min="0" step="any" placeholder="填写后自动计算" value={draft} aria-invalid={invalid} onInput={e => {
    const input = e.currentTarget;
    setDraft(input.value);
    const invalid = !input.validity.valid || (input.value !== '' && !Number.isFinite(input.valueAsNumber));
    setInvalid(invalid);
    save(invalid || input.value === '' ? undefined : input.valueAsNumber);
  }}/></label><p class={invalid ? 'warn' : ''}>{invalid ? '请输入不小于 0 的有效移速，当前未计入攻速鞋加成。' : '输入后自动更新合计；留空时不估算攻速鞋加成。'}</p></div>;
}
const ResultCard = memo(function ResultCard({ item, selected, toggle }: { item: Item; selected: boolean; toggle: (id: string) => void }) {
  return <button data-id={item.id} aria-pressed={selected} title={`${item.name} · ${selected ? '再次点击移除' : '点击添加'}`} onClick={() => toggle(item.id)}><span class={`item-icon q${item.quality}`}><img src={`${import.meta.env.BASE_URL}icons/${item.id}.png`} alt="" loading="lazy" decoding="async"/></span><span><strong>{item.name}</strong><small>{qualityName(item.quality)} · {item.scope === 'common' ? '通用' : '专属'} · {item.id}</small></span><span class="sim-choice">{selected ? '✓ 已添加' : '＋'}</span></button>;
});
export function Simulator({ openMechanism }: { openMechanism?: (topic: MechanismTopic) => void }) {
  const [plan, setPlan] = useState<Simulation>(() => { try { return restoreSimulation(JSON.parse(localStorage.getItem(storageKey) || 'null'), items); } catch { return emptySimulation(); } });
  const [filters, setFilters] = useState({ ...defaults });
  const [storageError, setStorageError] = useState(false);
  const resultList = useRef<HTMLDivElement>(null);
  const [undo, setUndo] = useState<Simulation>();
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(plan)); setStorageError(false); } catch { setStorageError(true); } }, [plan]);
  useEffect(() => { if (resultList.current) resultList.current.scrollTop = 0; }, [filters]);
  const results = useMemo(() => filterItems(items, filters, []), [filters]);
  const selected = useMemo(() => new Set(plan.ids), [plan.ids]);
  const toggle = useCallback((id: string) => setPlan(p => {
    if (!p.ids.includes(id)) return { ...p, ids: [...p.ids, id] };
    const values = { ...p.values }; delete values[id];
    return { ...p, ids: p.ids.filter(value => value !== id), values };
  }), []);
  const resultCards = useMemo(() => results.map(item => <ResultCard key={item.id} item={item} selected={selected.has(item.id)} toggle={toggle}/>), [results, selected, toggle]);
  const snapshot = useMemo(() => simulationSnapshot(plan), [plan]);
  const calculated = useMemo(() => blessingStats(snapshot, items), [snapshot]);
  const remove = (id: string) => setPlan(p => { const values = { ...p.values }; delete values[id]; return { ...p, ids: p.ids.filter(v => v !== id), values }; });
  return <main class="game-panel simulator">
    <div class="game-heading"><div><h1>福佑模拟器</h1><p>自由搭配 · 自定义数值 · 自动保存方案</p></div></div>
    <p class="sim-intro">选择福佑搭配方案，黄色数字可直接修改，默认使用区间中点。</p>
    {openMechanism && <button class="sim-mechanism-link" onClick={() => openMechanism('quality')}>查看抽取与重铸规则</button>}
    {storageError && <p role="alert">本地保存不可用，关闭页面后方案可能丢失。</p>}
    <div class="sim-layout"><div>
      <section class="game-box" aria-label="选择福佑"><h2>添加福佑 <small>点击添加，再次点击移除</small></h2>
        <input class="game-search" aria-label="搜索模拟福佑" placeholder="搜索名称、效果、英雄或拼音" value={filters.query} onInput={e => setFilters(f => ({ ...f, query: e.currentTarget.value }))}/>
        <div class="sim-filters"><label>品质<select aria-label="模拟品质" value={filters.quality} onChange={e => setFilters(f => ({ ...f, quality: Number(e.currentTarget.value) as typeof f.quality }))}><option value="0">全部品质</option><option value="3">橙色</option><option value="2">紫色</option><option value="1">蓝色</option></select></label><label>范围<select aria-label="模拟范围" value={filters.scope} onChange={e => setFilters(f => ({ ...f, scope: e.currentTarget.value as typeof f.scope }))}><option value="">全部</option><option value="common">通用</option><option value="exclusive">专属</option></select></label><span>{results.length} 条结果</span></div>
        <div class="sim-results" ref={resultList}>{resultCards}</div>
        {!results.length && <p>没有匹配的福佑，请更换关键词或筛选条件。</p>}
      </section>
      <section class="game-box sim-selection" aria-label="已选方案"><div class="game-heading"><h2>已选福佑 · {plan.ids.length}</h2><button disabled={!plan.ids.length && plan.movement === undefined} onClick={() => { setUndo(plan); setPlan(emptySimulation()); }}>清空方案</button></div>
        {undo && <button onClick={() => { setPlan(undo); setUndo(undefined); }}>撤销清空</button>}
        {!plan.ids.length && <p>从上方添加福佑，支持多项搭配，同一条目只添加一次。</p>}
        {plan.ids.map(id => { const item = items.find(i => i.id === id)!; const ranges = rollRanges(item.plain); return <article class="sim-card" key={id} data-id={id}><div class="game-heading"><span class={`item-icon q${item.quality}`}><img src={`${import.meta.env.BASE_URL}icons/${id}.png`} alt="" loading="lazy" decoding="async"/></span><h3>{item.name}</h3><button aria-label={`移除${item.name}`} onClick={() => remove(id)}>移除</button></div><p class="sim-effect">{ranges.map((range, index) => <span key={range.index}>{item.plain.slice(index ? ranges[index - 1].index + ranges[index - 1].raw.length : 0, range.index)}<InlineRoll range={range} name={item.name} saved={plan.values[id]?.[String(range.index)]} save={value => setPlan(p => ({ ...p, values: { ...p.values, [id]: { ...p.values[id], [range.index]: Math.max(range.min, Math.min(range.max, value)) } } }))}/></span>)}{item.plain.slice(ranges.length ? ranges[ranges.length - 1].index + ranges[ranges.length - 1].raw.length : 0)}</p><small>{calculated.uncovered.includes(id) ? '未计入合计' : '已计入支持的无条件效果'}{ranges.length ? ' · 黄色数字可直接修改' : ''}</small>
          {id === '10006' && <MovementInput value={plan.movement} save={movement => setPlan(p => ({ ...p, movement }))}/>}
          </article>; })}
      </section>
    </div><section class="game-box sim-summary" id="simulation-summary" aria-label="模拟合计"><h2>方案合计</h2><StatsView capture={snapshot} game={{ status: 'waiting', message: '' }} simulation/></section></div>
  </main>;
}
