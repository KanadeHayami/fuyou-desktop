import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import data from '../../data/fuyou.json';
import heroNames from '../../data/heroes.json';
import { copyText, defaults, filterItems, qualityName, readStored, saveStored, scopeName, tags, type Filters, type Item } from './model';
import { displayRange } from '../../scripts/data-lib.mjs';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import './style.css';
import { Simulator } from './Simulator';
import { Roster } from './Roster';
import { LivePanel, LiveOverlay } from './LivePanel';
import { Mechanics } from './Mechanics';
import { ReferenceCatalog } from './ReferenceCatalog';
import { BlessInformation } from './ReferenceParts';
import type { MechanismTopic, ReferenceKind } from '../shared/reference';
import './reference.css';


const items = data.items as Item[];
function Glyph({ name }: { name: string }) {
  const paths: Record<string, string> = { search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm4-1 4 4', pin: 'm9.5 1.75 4.75 4.75-2.75 1.25-2.75 2.75-.5 2.75-5.5-5.5 2.75-.5 2.75-2.75ZM5.25 10.75l-3.5 3.5', star: 'm8 1.75 1.9 3.85 4.25.62-3.07 3 .72 4.23L8 11.45l-3.8 2 .72-4.23-3.07-3 4.25-.62Z', copy: 'M5 5h9v9H5ZM11 5V2H2v9h3', down: 'm4 6 4 4 4-4', close: 'm3 3 10 10M13 3 3 13', minimize: 'M3 8h10', maximize: 'M3 3h10v10H3Z', restore: 'M5 5h8v8H5ZM3 10V3h7' };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d={paths[name] || paths.down}/></svg>;
}
function Icon({ item, large = false }: { item: Item; large?: boolean }) { return <span class={`item-icon q${item.quality} ${large ? 'large' : ''}`}><img src={`${import.meta.env.BASE_URL}icons/${item.id}.png`} alt="" loading="lazy" decoding="async"/></span>; }
function Badges({ item }: { item: Item }) { return <div class="badges"><span class={`quality q${item.quality}`}>◆ {qualityName(item.quality)}</span><span>{scopeName(item.scope)}</span>{item.heroes.map(h => <span key={h.key}>{h.name}</span>)}{item.tags.map(t => <span key={t}>{tags[t] || t}</span>)}</div>; }
function Description({ item }: { item: Item }) { return <p class="description">{item.desc.map((s, i) => s.k === 'br' ? <br key={i}/> : <span key={i} class={s.k}>{displayRange(s.t)}</span>)}</p>; }

function App() {
  const [filters, setFilters] = useState<Filters>(() => ({ ...defaults, ...readStored<Partial<Filters>>('fuyou.filters', {}) }));
  const [favorites, setFavorites] = useState<string[]>(() => { const v = readStored<unknown>('fuyou.favorites', []); return Array.isArray(v) ? v.filter(i => typeof i === 'string') : []; });
  const [selected, setSelected] = useState('10001'), [expanded, setExpanded] = useState('');
  const [tab, setTab] = useState('catalog'), [menu, setMenu] = useState(''), [heroQuery, setHeroQuery] = useState('');
  const [simulatorVisited, setSimulatorVisited] = useState(false);
  const [catalogKind, setCatalogKind] = useState<'bless' | ReferenceKind>('bless');
  const [topic, setTopic] = useState<MechanismTopic>('quality');
  const [origin, setOrigin] = useState<{ tab: string; kind: 'bless' | ReferenceKind } | null>(null);
  const [referenceRequest, setReferenceRequest] = useState<{ kind: ReferenceKind; mode: 'records' | 'pools'; nonce: number }>();
  const openMechanism = (next: MechanismTopic) => { setOrigin({ tab, kind: catalogKind }); setTopic(next); setTab('mechanics'); setMenu(''); };
  const openCatalog = (kind: ReferenceKind, pools = false) => { setCatalogKind(kind); setTab('catalog'); setOrigin(null); setReferenceRequest(request => ({ kind, mode: pools ? 'pools' : 'records', nonce: (request?.nonce || 0) + 1 })); };
  const [copied, setCopied] = useState(''), [copyError, setCopyError] = useState(false);
  const [windowState, setWindowState] = useState<WindowState>({ pinned: false, maximized: false });
  const [narrow, setNarrow] = useState(innerWidth < 700);
  const search = useRef<HTMLInputElement>(null), copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const results = useMemo(() => filterItems(items, filters, favorites), [filters, favorites]);
  const current = results.find(i => i.id === selected) || results[0];
  const change = (patch: Partial<Filters>) => setFilters(f => ({ ...f, ...patch }));
  const reset = () => { setFilters({ ...defaults }); setMenu(''); };
  const favorite = (id: string) => setFavorites(f => f.includes(id) ? f.filter(v => v !== id) : [...f, id]);
  const copy = async (item: Item) => {
    try { if (window.api) await window.api.copy(copyText(item)); else await navigator.clipboard.writeText(copyText(item)); setCopyError(false); setCopied(item.id); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(''), 1600); }
    catch { setCopyError(true); }
  };
  useEffect(() => { saveStored('fuyou.filters', filters); }, [filters]);
  useEffect(() => { saveStored('fuyou.favorites', favorites); }, [favorites]);
  useEffect(() => {
    const resize = () => setNarrow(innerWidth < 700); addEventListener('resize', resize);
    void window.api?.state().then(setWindowState); const off = window.api?.onState(setWindowState);
    return () => { removeEventListener('resize', resize); off?.(); clearTimeout(copyTimer.current); };
  }, []);
  useEffect(() => { if (current && current.id !== selected) setSelected(current.id); if (!results.some(i => i.id === expanded)) setExpanded(''); }, [results]);
  const reveal = (id: string) => requestAnimationFrame(() => document.getElementById(`item-${id}`)?.scrollIntoView({ block: 'nearest' }));
  useEffect(() => { if (expanded) reveal(expanded); }, [expanded]);
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      const input = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (!input && e.key === 'Process' && tab === 'catalog' && catalogKind === 'bless') { search.current?.focus(); return; }
      if (e.isComposing) return;
      if (e.ctrlKey && ['k', 'f'].includes(e.key.toLowerCase())) { e.preventDefault(); setTab('catalog'); setCatalogKind('bless'); requestAnimationFrame(() => { search.current?.focus(); search.current?.select(); }); return; }
      if (tab !== 'catalog' || catalogKind !== 'bless') return;
      if (e.key === 'Escape') { e.preventDefault(); setMenu(''); if (filters.query) change({ query: '' }); else reset(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'c' && !input && current) { e.preventDefault(); void copy(current); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (!input || e.target === search.current) && results.length) {
        e.preventDefault(); const index = results.findIndex(i => i.id === current?.id); const next = results[Math.max(0, Math.min(results.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]; setSelected(next.id); reveal(next.id);
        if (!input) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#item-${next.id} .item-row`)?.focus({ preventScroll: true }));
        return;
      }
      if (e.key === 'Enter' && narrow && current && (!input || e.target === search.current) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setExpanded(v => v === current.id ? '' : current.id); return; }
      if (!input && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) { e.preventDefault(); search.current?.focus(); change({ query: filters.query + e.key }); }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [filters, results, current, narrow, tab, catalogKind]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.dropdown')) setMenu(''); };
    document.addEventListener('click', close); return () => document.removeEventListener('click', close);
  }, []);
  const actions = (item: Item) => <div class="actions"><button onClick={() => void copy(item)} aria-label="复制效果文本"><Glyph name="copy"/>{copied === item.id ? '已复制' : '复制'}</button><button onClick={() => favorite(item.id)} aria-label={favorites.includes(item.id) ? '取消收藏' : '收藏'} aria-pressed={favorites.includes(item.id)}><Glyph name="star"/>{favorites.includes(item.id) ? '已收藏' : '收藏'}</button></div>;
  // Keep global search relevance ahead of quality grouping when a query is active.
  const groups = filters.sort === 'quality' && !filters.query.trim() ? [3, 2, 1].map(q => ({ q, list: results.filter(i => i.quality === q) })) : [{ q: 0, list: results }];
  return <>
    <header class="titlebar" onDblClick={e => { if (!(e.target as HTMLElement).closest('button')) window.api?.action('maximize'); }}>
      <div class="brand"><svg width="18" height="18" viewBox="0 0 18 18" aria-label="福佑小助手" role="img"><path d="M9 1.5 16.5 9 9 16.5 1.5 9Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 5.75 12.25 9 9 12.25 5.75 9Z" class="logo-center"/></svg><span>福佑小助手</span></div>
      <nav class="primary-nav" aria-label="主导航"><button class={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>图鉴</button><button class={tab === 'planned' ? 'active' : ''} onClick={() => { setSimulatorVisited(true); setTab('planned'); }}>模拟器</button><button class={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>局内</button><button class={tab === 'mechanics' ? 'active' : ''} onClick={() => { setTab('mechanics'); setOrigin(null); }}>机制</button><button class={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>队友</button></nav>
      <div class="drag-space"/><button class="layout-toggle" disabled={!window.api} aria-label={windowState.layout === 'portrait' ? '切换横版' : '切换竖版'} title={window.api ? '切换横版 / 竖版窗口' : '请在桌面版切换窗口方向'} onClick={() => window.api?.action('layout')}>{windowState.layout === 'portrait' ? '横版' : '竖版'}</button><button class="pin" aria-label="窗口置顶" aria-pressed={windowState.pinned} onClick={() => window.api?.action('pin')}><Glyph name="pin"/><span>置顶</span></button>
      <button class="caption" aria-label="最小化" onClick={() => window.api?.action('minimize')}><Glyph name="minimize"/></button><button class="caption" aria-label={windowState.maximized ? '还原' : '最大化'} onClick={() => window.api?.action('maximize')}><Glyph name={windowState.maximized ? 'restore' : 'maximize'}/></button><button class="caption close" aria-label="关闭" onClick={() => window.api?.action('close')}><Glyph name="close"/></button>
    </header>
    {tab === 'live' && <LivePanel/>}{tab === 'team' && <Roster/>}<div class="reference-container" hidden={tab !== 'planned'}>{simulatorVisited && <Simulator openMechanism={openMechanism}/>}</div>
    <div class="reference-container" hidden={tab !== 'mechanics'}><Mechanics topic={topic} choose={setTopic} openCatalog={openCatalog} back={origin ? { label: origin.tab === 'planned' ? '返回模拟器' : origin.kind === 'bless' ? '返回福佑' : origin.kind === 'runes' ? '返回符文' : '返回事件', action: () => { setTab(origin.tab); setCatalogKind(origin.kind); setOrigin(null); } } : undefined}/></div>
    <div class="catalog-types" role="group" aria-label="图鉴分类" hidden={tab !== 'catalog'}>{[['bless', '福佑'], ['runes', '符文'], ['events', '随机事件']].map(([kind, label]) => <button key={kind} aria-pressed={catalogKind === kind} onClick={() => { setCatalogKind(kind as 'bless' | ReferenceKind); setMenu(''); }}>{label}</button>)}<span>离线资料</span></div>
    <div class="reference-container" hidden={tab !== 'catalog' || catalogKind !== 'runes'}><ReferenceCatalog kind="runes" narrow={narrow} openMechanism={openMechanism} request={referenceRequest?.kind === 'runes' ? referenceRequest : undefined}/></div>
    <div class="reference-container" hidden={tab !== 'catalog' || catalogKind !== 'events'}><ReferenceCatalog kind="events" narrow={narrow} openMechanism={openMechanism} request={referenceRequest?.kind === 'events' ? referenceRequest : undefined}/></div>
    <main class="workspace" hidden={tab !== 'catalog' || catalogKind !== 'bless'}>
      <div class="toolbar">
        <div class="primary-tools"><label class="search"><Glyph name="search"/><input ref={search} type="search" aria-label="搜索福佑" placeholder="搜索名称、效果或拼音首字母" value={filters.query} onInput={e => change({ query: e.currentTarget.value })}/><kbd>Ctrl K</kbd></label>
          <div class="segments" role="group" aria-label="品质">{[0, 3, 2, 1].map(q => <button aria-label={q ? qualityName(q) : '全部品质'} aria-pressed={filters.quality === q} onClick={() => change({ quality: q })}>{q > 0 && <i class={`diamond q${q}`}/>}<span>{q ? narrow ? qualityName(q)[0] : qualityName(q) : '全部'}</span></button>)}</div>
          <div class="segments" role="group" aria-label="范围">{['', 'common', 'exclusive'].map(s => <button aria-pressed={filters.scope === s} onClick={() => change({ scope: s, hero: '' })}>{s ? scopeName(s) : '全部'}</button>)}</div>
        </div>
        <div class="secondary-tools"><div class="result-info"><span><b>{results.length}</b> 条结果</span></div>
          <div class="filter-tools">{!narrow && ['range', 'melee', 'uni_team'].map(t => <button class="chip" aria-pressed={filters.tag === t} onClick={() => change({ tag: filters.tag === t ? '' : t })}>{tags[t]}</button>)}
            <div class="dropdown"><button class="chip" aria-expanded={menu === 'tags'} aria-pressed={!!filters.tag && (narrow || !['range', 'melee', 'uni_team'].includes(filters.tag))} onClick={() => setMenu(menu === 'tags' ? '' : 'tags')}>{narrow ? filters.tag ? tags[filters.tag] || filters.tag : '标签' : '更多'}<Glyph name="down"/></button>{menu === 'tags' && <div class="popup tag-menu">{Object.entries(tags).filter(([t]) => narrow || !['range', 'melee', 'uni_team'].includes(t)).map(([t, label]) => <button aria-pressed={filters.tag === t} onClick={() => { change({ tag: filters.tag === t ? '' : t }); setMenu(''); }}>{label}</button>)}</div>}</div>
            <button class="chip" aria-pressed={filters.favorites} onClick={() => change({ favorites: !filters.favorites })}>☆ 收藏</button>
            {filters.scope === 'exclusive' && <div class="dropdown hero-picker"><button class="chip" aria-expanded={menu === 'heroes'} onClick={() => { setMenu(menu === 'heroes' ? '' : 'heroes'); setHeroQuery(''); }}>{filters.hero ? (heroNames as Record<string, string>)[filters.hero] : '全部英雄'}<Glyph name="down"/></button>{menu === 'heroes' && <div class="popup hero-menu"><input autoFocus aria-label="搜索英雄" placeholder="搜索英雄" value={heroQuery} onInput={e => setHeroQuery(e.currentTarget.value)}/><div><button onClick={() => { change({ hero: '' }); setMenu(''); }}>全部英雄</button>{Object.entries(heroNames).filter(([k, v]) => (v + k).toLowerCase().includes(heroQuery.toLowerCase())).sort((a, b) => a[1].localeCompare(b[1], 'zh-CN')).map(([key, name]) => <button aria-pressed={filters.hero === key} onClick={() => { change({ hero: key }); setMenu(''); }}>{name}</button>)}</div></div>}</div>}
          </div>
          <div class="dropdown sort"><button aria-expanded={menu === 'sort'} onClick={() => setMenu(menu === 'sort' ? '' : 'sort')}>{filters.sort === 'quality' ? narrow ? '按品质' : '按品质分组' : '按名称'}<Glyph name="down"/></button>{menu === 'sort' && <div class="popup">{[['quality', '按品质分组'], ['name', '按名称']].map(([sort, name]) => <button onClick={() => { change({ sort }); setMenu(''); }}>{name}</button>)}</div>}</div>
        </div>
      </div>
      <div class="catalog" aria-label="福佑列表">{groups.map(g => g.list.length > 0 && <section key={g.q}><div class={`group-heading q${g.q}`}>{g.q ? <><i class="diamond"/>{qualityName(g.q)}</> : '搜索结果'}<span>{g.list.length}</span><hr/></div><div class="item-grid">{g.list.map(item => <article id={`item-${item.id}`} key={item.id} class={`item ${current?.id === item.id ? 'selected' : ''}`}>
        <button class="item-row" aria-pressed={current?.id === item.id} aria-expanded={narrow ? expanded === item.id : undefined} onClick={() => { setSelected(item.id); if (narrow) setExpanded(expanded === item.id ? '' : item.id); }}><Icon item={item}/><span class="item-text"><span class="item-name"><strong>{item.name}</strong>{item.scope === 'exclusive' && <small>专属</small>}</span><span class="key-stat"><span title={item.key?.label}>{item.key?.label || item.plain.slice(0, 20)}</span>{item.key && <b class="num">{item.key.value}</b>}{item.desc.filter(s => s.k === 'num').length > 1 && <small>+{item.desc.filter(s => s.k === 'num').length - 1}</small>}</span></span>{narrow && <span class={expanded === item.id ? 'chevron open' : 'chevron'}><Glyph name="down"/></span>}</button>
        {narrow && expanded === item.id && <div class="expanded"><Description item={item}/><Badges item={item}/>{actions(item)}<BlessInformation id={item.id} openMechanism={openMechanism}/></div>}
      </article>)}</div></section>)}{!results.length && <div class="empty"><h3>没有匹配的福佑</h3><p>换个关键词，或清除当前筛选</p><button class="chip" onClick={reset}>清除筛选</button></div>}</div>
      {!narrow && <aside aria-label="福佑详情">{current ? <><div class="detail-bar"><span>详情</span>{actions(current)}</div><div class="detail-content"><div class="detail-hero"><Icon item={current} large/><div><h2>{current.name}</h2><Badges item={current}/></div></div><section><h3>效果</h3><Description item={current}/></section><BlessInformation id={current.id} openMechanism={openMechanism}/></div><footer><span><kbd>↑ ↓</kbd> 切换</span><span><kbd>Ctrl C</kbd> 复制效果</span><span><kbd>Esc</kbd> 清空筛选</span></footer></> : <div class="empty">选择福佑查看效果</div>}</aside>}
    </main>{copyError && <div class="toast" role="status"><span>复制失败，请重试</span><button aria-label="关闭提示" onClick={() => setCopyError(false)}><Glyph name="close"/></button></div>}
  </>;
}
render(new URLSearchParams(location.search).get('overlay') === '1' ? <LiveOverlay/> : <App/>, document.getElementById('app')!);
