import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import reference from '../../data/reference.json';
import { matchesReference, runeJudgement, type RuneRecord, type RunePool, type EventRecord, type HeroRecord, type ReferenceKind, type MechanismTopic } from '../shared/reference';
import { readStored, saveStored } from './model';
import { formatValue, NumericText, ParameterTable } from './ReferenceParts';
import { ReferenceArtwork } from './ReferenceArtwork';
import './reference.css';

type Mode = 'records' | 'pools' | 'heroes';
type Entry = RuneRecord | RunePool | EventRecord | HeroRecord;
type Request = { nonce: number; mode: 'records' | 'pools'; id?: string };
const runes = reference.runes as RuneRecord[], pools = reference.pools as RunePool[], events = reference.events as EventRecord[], heroes = reference.heroes as HeroRecord[];
const heroById = new Map(heroes.map(hero => [hero.id, hero]));
const runeById = new Map(runes.map(rune => [rune.id, rune]));
const runeName = (id: string) => runeById.get(id)?.name || id;
const isPool = (record: Entry): record is RunePool => 'entries' in record;
const isRune = (record: Entry): record is RuneRecord => 'pro' in record;
const isHero = (record: Entry): record is HeroRecord => 'runePool' in record;
const heroPoolLabel = (hero: HeroRecord) => hero.poolId ? pools.find(pool => pool.id === hero.poolId)!.name : hero.runePool === '' ? '未配置符文池' : '—';
const poolHeroes = (pool: RunePool) => pool.heroIds.map(id => heroById.get(id)!).filter(Boolean);
const displayParameters = (record: RuneRecord | EventRecord) => isRune(record) ? record.parameters.filter(parameter => parameter.explained) : record.parameters;
const hasArtwork = (record: Entry) => isRune(record) || isHero(record);
const artwork = (record: Entry, detail = false) => isRune(record) || isHero(record) ? <ReferenceArtwork family={isHero(record) ? 'hero' : 'rune'} id={record.id} detail={detail}/> : null;

function restore(kind: ReferenceKind) {
  const value = readStored<unknown>(`fuyou.reference.${kind}`, {});
  const state = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const string = (key: string, fallback = '') => typeof state[key] === 'string' ? state[key] as string : fallback;
  return { recordQuery: string('recordQuery'), poolQuery: string('poolQuery'), heroQuery: string('heroQuery'),
    mode: kind === 'runes' && (state.mode === 'pools' || state.mode === 'heroes') ? state.mode as Mode : 'records' as Mode,
    selected: string('selected'), poolSelected: string('poolSelected'), heroSelected: string('heroSelected'),
    filter: string('filter', 'all'), heroFilter: string('heroFilter', 'all'), poolRune: string('poolRune') };
}

export function ReferenceCatalog({ kind, narrow, openMechanism, request }: { kind: ReferenceKind; narrow: boolean; openMechanism: (topic: MechanismTopic) => void; request?: Request }) {
  const [state, setState] = useState(() => restore(kind));
  const [expanded, setExpanded] = useState(''), [rerolls, setRerolls] = useState(0), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const list = useRef<HTMLDivElement>(null), positions = useRef<Record<Mode, number>>({ records: 0, pools: 0, heroes: 0 });
  const pendingJump = useRef('');
  const query = state.mode === 'pools' ? state.poolQuery : state.mode === 'heroes' ? state.heroQuery : state.recordQuery;
  const filter = state.mode === 'heroes' ? state.heroFilter : state.filter;
  const change = (patch: Partial<typeof state>) => setState(value => ({ ...value, ...patch }));
  const setQuery = (value: string) => {
    setExpanded('');
    change(state.mode === 'pools' ? { poolQuery: value, poolRune: '' } : state.mode === 'heroes' ? { heroQuery: value } : { recordQuery: value });
  };
  const switchMode = (mode: Mode) => {
    if (list.current) positions.current[state.mode] = list.current.scrollTop;
    change({ mode }); setExpanded('');
  };
  const chooseHero = (id: string) => { pendingJump.current = id; switchMode('heroes'); change({ heroSelected: id, heroQuery: '', heroFilter: 'all' }); setExpanded(id); };
  const choosePool = (id: string) => { pendingJump.current = id; switchMode('pools'); change({ poolSelected: id, poolQuery: '', poolRune: '' }); setExpanded(id); };
  const chooseRune = (id: string) => { pendingJump.current = id; switchMode('records'); change({ selected: id, recordQuery: '', filter: 'all' }); setExpanded(id); };
  const containing = (rune: RuneRecord) => { switchMode('pools'); change({ poolQuery: rune.name, poolRune: rune.id }); };
  useEffect(() => { saveStored(`fuyou.reference.${kind}`, state); }, [state, kind]);
  useLayoutEffect(() => {
    if (!request) return;
    pendingJump.current = request.id || '';
    setState(value => ({ ...value, mode: kind === 'runes' ? request.mode : 'records',
      ...(request.mode === 'pools' ? { poolQuery: '', poolRune: '', poolSelected: request.id || value.poolSelected } : { recordQuery: '', filter: 'all', selected: request.id || value.selected }) }));
    setExpanded(request.id || '');
  }, [request?.nonce]);
  const results = useMemo<Entry[]>(() => {
    if (kind === 'runes' && state.mode === 'pools') return pools.filter(pool =>
      (!state.poolRune || pool.entries.some(entry => entry.rune === state.poolRune)) &&
      matchesReference({ ...pool, description: `${pool.raw} ${pool.entries.map(entry => { const rune = runeById.get(entry.rune); return rune ? `${rune.name} ${rune.py} ${rune.pyInitials}` : entry.rune; }).join(' ')} ${poolHeroes(pool).map(hero => `${hero.name} ${hero.id} ${hero.py} ${hero.pyInitials}`).join(' ')}` }, query));
    if (kind === 'runes' && state.mode === 'heroes') return heroes.filter(hero =>
      matchesReference({ ...hero, description: `${hero.key} ${hero.tags || ''} ${hero.attrs || ''} ${hero.py} ${hero.pyInitials}` }, query) &&
      (filter === 'all' || !['configured', 'unconfigured'].includes(filter) || (filter === 'configured' ? !!hero.poolId : hero.runePool === '')));
    if (kind === 'runes') return runes.filter(rune => matchesReference(rune, query) &&
      (filter === 'all' || !['normal', 'pro'].includes(filter) || (filter === 'pro' ? rune.pro : !rune.pro)));
    return events.filter(event => matchesReference(event, query) &&
      (filter === 'all' || !['positive', 'zero', 'missing'].includes(filter) || (filter === 'missing' ? event.weight === null : filter === 'zero' ? event.weight === 0 : event.weight !== null && event.weight > 0)));
  }, [kind, state.mode, state.poolRune, filter, query]);
  const selectedId = state.mode === 'pools' ? state.poolSelected : state.mode === 'heroes' ? state.heroSelected : state.selected;
  const current = results.find(entry => entry.id === selectedId) || results[0];
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = positions.current[state.mode]; }, [state.mode]);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query, filter]);
  useLayoutEffect(() => {
    if (!pendingJump.current || !list.current) return;
    const entry = [...list.current.children].find(element => (element as HTMLElement).dataset.referenceId === pendingJump.current) as HTMLElement | undefined;
    if (!entry) return;
    entry.scrollIntoView({ block: 'start' });
    entry.querySelector<HTMLButtonElement>('.reference-row')?.focus({ preventScroll: true });
    pendingJump.current = '';
  }, [state.mode, current?.id, expanded]);
  useEffect(() => { setCopied(false); setCopyError(false); }, [current?.id]);
  const copy = async (record: Entry) => {
    try {
      const text = isPool(record) ? `${record.name}\n对应英雄：${poolHeroes(record).map(hero => hero.name).join('、') || '—'}\n${record.entries.map(entry => `${runeName(entry.rune)}：${formatValue(entry.chance)}`).join('\n')}` :
        isHero(record) ? `${record.name} (${record.key})\n符文池：${heroPoolLabel(record)}\n英雄权重：${formatValue(record.weight)}\n标签：${record.tags || '—'}\n属性：${record.attrs?.split('#').map(entry => entry.replace('|', '：')).join('、') || '—'}\n本命福佑：${record.innateBless || '—'}` :
          `${record.name}${record.description ? `\n${record.description}` : ''}\n${displayParameters(record).map(parameter => `${parameter.label}：${formatValue(parameter.value)}${parameter.unit}`).join('\n')}`.trim();
      if (window.api) await window.api.copy(text); else await navigator.clipboard.writeText(text);
      setCopied(true); setCopyError(false);
    } catch { setCopyError(true); }
  };
  const detail = (record: Entry) => <div class="reference-detail-content">
    <div class={`reference-entry-heading${hasArtwork(record) ? ' has-artwork' : ''}`}>{artwork(record, true)}<h2>{record.name}</h2><button onClick={() => void copy(record)}>{copied ? '已复制' : '复制资料'}</button></div>
    {copyError && <p role="alert">复制失败，请重试。</p>}
    {isHero(record) ? <>
      <p class="reference-muted reference-path">{record.key}</p>
      <div class="reference-entry-meta"><span>{heroPoolLabel(record)}</span></div>
      <section><h3>对应符文池</h3>{record.poolId ? <button class="reference-inline-link" onClick={() => choosePool(record.poolId!)}>查看{heroPoolLabel(record)}</button> : <p class="reference-muted">{heroPoolLabel(record)}</p>}</section>
      <section><h3>英雄配置</h3><table class="reference-table hero-config-table"><tbody>
        <tr><th scope="row">英雄权重<small>weight</small></th><td class="num">{formatValue(record.weight)}</td></tr>
        <tr><th scope="row">标签<small>custom_tags</small></th><td class="reference-path">{record.tags || '—'}</td></tr>
        <tr><th scope="row">本命福佑<small>innate_bless</small></th><td class="reference-path">{record.innateBless || '—'}</td></tr>
      </tbody></table></section>
      <section><h3>属性调整</h3>{record.attrs ? <table class="reference-table hero-attrs-table"><thead><tr><th>参数</th><th>数值</th></tr></thead><tbody>{record.attrs.split('#').map((entry, index) => {
        const [key, value] = entry.split('|');
        return <tr key={index}><th scope="row">{key}</th><td class="num">{value ?? '—'}</td></tr>;
      })}</tbody></table> : <p class="reference-muted">—</p>}</section>
    </> : isPool(record) ? <>
      <div class="reference-entry-meta"><span>{record.entries.length} 条符文</span><span>{record.heroIds.length} 位英雄</span></div>
      <section class="pool-hero-section"><h3>对应英雄</h3><div class="reference-links">{poolHeroes(record).map(hero => <button key={hero.id} onClick={() => chooseHero(hero.id)}>{hero.name}</button>)}</div>{!record.heroIds.length && <p class="reference-muted">—</p>}</section>
      <label class="reroll-control">重随次数 <output class="num">{rerolls}</output><input type="range" aria-label="候选池重随次数" min="0" max={reference.mechanics.runeMaxTimes} value={rerolls} onInput={event => setRerolls(Number(event.currentTarget.value))}/></label>
      <table class="reference-table pool-table"><thead><tr><th>符文</th><th>机会值</th><th>进池判定值</th></tr></thead><tbody>{record.entries.map(entry => <tr key={entry.rune}><th scope="row">{runeById.has(entry.rune) ? <button onClick={() => chooseRune(entry.rune)}>{runeName(entry.rune)}</button> : entry.rune}</th><td class="num">{formatValue(entry.chance)}</td><td class="num">{formatValue(runeJudgement(entry.chance, rerolls, reference.mechanics.runeIncrease, reference.mechanics.runeMaxTimes))}</td></tr>)}</tbody></table>
      <div class="reference-links"><button onClick={() => openMechanism('runes')}>查看符文选择机制</button></div>
    </> : <>
      <div class="reference-entry-meta">{isRune(record) ? <span>{record.pro ? '进阶符文' : '普通／英雄符文'}</span> : <span>权重 <b class="num">{formatValue(record.weight)}</b></span>}</div>
      {record.description && <section><h3>效果</h3><NumericText text={record.description}/></section>}
      <section><h3>数值参数</h3><ParameterTable parameters={displayParameters(record)} showKeys={!isRune(record)}/></section>
      {isRune(record) && <div class="reference-links"><button onClick={() => containing(record)}>查看包含它的候选池</button></div>}
      <div class="reference-links"><button onClick={() => openMechanism(isRune(record) ? 'runes' : 'events')}>{isRune(record) ? '查看符文选择机制' : '查看事件发生规则'}</button></div>
    </>}
  </div>;
  const filters = state.mode === 'heroes' ? [['all', '全部'], ['configured', '有符文池'], ['unconfigured', '未配置符文池']] :
    kind === 'runes' ? [['all', '全部'], ['normal', '普通／英雄'], ['pro', '进阶']] : [['all', '全部'], ['positive', '权重大于 0'], ['zero', '权重为 0'], ['missing', '无权重']];
  const searchName = state.mode === 'pools' ? '搜索候选池' : state.mode === 'heroes' ? '搜索英雄对照' : kind === 'runes' ? '搜索符文' : '搜索事件';
  const subtitle = (record: Entry) => isHero(record) ? `${record.id} · ${heroPoolLabel(record)}` : isPool(record) ? poolHeroes(record).map(hero => hero.name).join('、') || '—' : isRune(record) ? record.description.split('\n')[0] || '—' : `权重 ${formatValue(record.weight)}`;
  return <main class="reference-workspace">
    <div class="reference-toolbar">
      {kind === 'runes' && <div class="reference-switch" role="group" aria-label="符文资料视图">
        <button aria-pressed={state.mode === 'records'} onClick={() => switchMode('records')}>符文 <b class="num">{runes.length}</b></button>
        <button aria-pressed={state.mode === 'pools'} onClick={() => switchMode('pools')}>候选池 <b class="num">{pools.length}</b></button>
        <button aria-pressed={state.mode === 'heroes'} onClick={() => switchMode('heroes')}>英雄对照 <b class="num">{heroes.length}</b></button>
      </div>}
      <label class="reference-search"><input type="search" aria-label={searchName} placeholder={state.mode === 'pools' ? '搜索英雄名、符文名或拼音' : state.mode === 'heroes' ? '搜索英雄名、拼音、英文标识或标签' : kind === 'runes' ? '搜索名称、效果或拼音' : '搜索游戏标识、效果或数值'} value={query} onInput={event => setQuery(event.currentTarget.value)}/></label>
      {state.mode !== 'pools' && <div class="reference-filters" role="group" aria-label={state.mode === 'heroes' ? '英雄符文池状态' : kind === 'runes' ? '符文类型' : '事件权重'}>{filters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setExpanded(''); change(state.mode === 'heroes' ? { heroFilter: value } : { filter: value }); }}>{label}</button>)}</div>}
      <div class="reference-result-info"><span><b class="num">{results.length}</b> 条结果</span></div>
    </div>
    <div class="reference-list" ref={list} aria-label={state.mode === 'heroes' ? '英雄对照列表' : kind === 'runes' ? state.mode === 'pools' ? '候选池列表' : '符文列表' : '事件列表'}>
      {results.map(record => <article key={record.id} data-reference-id={record.id} class={`reference-entry ${current?.id === record.id ? 'selected' : ''}`}>
        <button class={`reference-row${hasArtwork(record) ? ' has-artwork' : ''}`} aria-pressed={current?.id === record.id} aria-expanded={narrow ? expanded === record.id : undefined} onClick={() => {
          change(state.mode === 'pools' ? { poolSelected: record.id } : state.mode === 'heroes' ? { heroSelected: record.id } : { selected: record.id });
          if (narrow) setExpanded(expanded === record.id ? '' : record.id);
        }}>{artwork(record)}<strong>{record.name}</strong><span class="reference-row-summary" title={subtitle(record)}>{subtitle(record)}</span></button>
        {narrow && expanded === record.id && detail(record)}
      </article>)}
      {!results.length && <div class="empty"><h3>没有匹配的资料</h3><p>换个关键词，或清除筛选。</p><button class="chip" onClick={() => { setQuery(''); change(state.mode === 'heroes' ? { heroFilter: 'all' } : { filter: 'all' }); }}>清除资料筛选</button></div>}
    </div>
    {!narrow && <section class="reference-detail" aria-label="资料详情">{current ? detail(current) : <p class="empty">选择一条资料查看详情。</p>}</section>}
  </main>;
}
