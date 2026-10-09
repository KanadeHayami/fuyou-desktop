import { useEffect, useState } from 'preact/hooks';
import data from '../../data/fuyou.json';
import heroNames from '../../data/heroes.json';
import { benefit, freshGame, type GameSnapshot, type GameSetup } from '../shared/game';
import { defaults, filterItems, qualityName, type Item } from './model';
import { displayRange } from '../../scripts/data-lib.mjs';
import { CapturePanel } from './CapturePanel';
import { SessionStats, OverlayControl } from './SessionStats';

const items = data.items as Item[];
function numeric(text: string) { return text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= 0 ? Number(text) : undefined; }
export function GamePanel() {
  const [state, setState] = useState<GameSnapshot>({ status: 'waiting', message: window.api ? '正在检查接入状态' : '浏览器预览不连接游戏，请在桌面版中安装接入配置' });
  const [setup, setSetup] = useState<GameSetup>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const [movement, setMovement] = useState(''), [roll, setRoll] = useState('');
  const current = freshGame(state);
  const hero = current.status === 'connected' ? current.hero : undefined;
  const heroKey = hero?.name.replace('npc_dota_hero_', '');
  const heroName = heroKey ? (heroNames as Record<string, string>)[heroKey] || hero?.name : '尚未获得本人英雄';
  const results = query.trim() ? filterItems(items, { ...defaults, query }, []).slice(0, 12) : [];
  useEffect(() => {
    const api = window.api;
    if (!api) return;
    let active = true;
    const off = api.onGame(s => { if (active) setState(s); });
    void Promise.all([api.gameState(), api.gameSetup()]).then(([s, settings]) => { if (active) { setState(s); setSetup(settings); } }).catch(() => { if (active) setError('无法读取接入状态，请重启助手'); });
    return () => { active = false; off(); };
  }, []);
  // Manual choices and roll values belong to one hero/session, not the next match.
  useEffect(() => { setChoices([]); setMovement(''); setRoll(''); }, [hero?.name, current.map, current.matchId, current.phase, current.status]);
  const install = async (choose = false) => {
    if (!window.api) return;
    setBusy(true); setError('');
    try { setSetup(await window.api.installGame(choose)); } catch { setError('安装配置失败，请检查游戏目录权限'); } finally { setBusy(false); }
  };
  return <main class="game-panel">
    <div class="game-heading"><div><h1>游戏内提示</h1><p>游戏状态接入 · 三选一手动对照</p></div><span class={`game-status ${current.status}`} role="status">{{ waiting: '等待游戏', connected: '收到上报', stale: '连接已过期', error: '接入异常' }[current.status]}</span></div>
    <OverlayControl/>
    <section class="game-box" aria-label="游戏连接">
      <h2>{heroName}{hero?.level !== undefined && <small> · <b class="num">{hero.level}</b> 级</small>}</h2>
      <p>{current.message}</p>
      {hero && <p>数据来源：游戏上报{hero.health !== undefined && hero.maxHealth !== undefined && <> · 生命 <span class="num">{hero.health} / {hero.maxHealth}</span></>}</p>}
      {current.map && <p>地图：{current.map}</p>}
      {current.receivedAt && <p>最近接收：{new Date(current.receivedAt).toLocaleTimeString('zh-CN')}</p>}
      <div class="game-buttons"><button disabled={!window.api} onClick={() => window.api?.action('companion')}>游戏旁置顶窄窗</button>{current.status === 'error' && <button onClick={() => void window.api?.retryGame().catch(() => setError('重试失败，请重启助手'))}>重试连接</button>}</div>
      <details open={!setup?.configured}><summary>接入设置{setup?.configured ? ' · 已安装配置' : ''}</summary>
        <p>{setup?.directory ? `检测到游戏目录：${setup.directory}` : '可自动查找 Steam 游戏库，也可手动选择 game/dota 文件夹。'}</p>
        <div class="game-buttons"><button disabled={!window.api || busy} onClick={() => void install()}>{busy ? '处理中…' : setup?.configured ? '检查接入配置' : '安装接入配置'}</button><button disabled={!window.api || busy} onClick={() => void install(true)}>选择游戏目录</button></div>
        {setup && <p role="status">{setup.message}</p>}
        <ol><li>安装接入配置。</li><li>在 Steam → Dota 2 → 属性 → 启动选项中追加 <code>-gamestateintegration</code>，保留原有选项。</li><li>重启 Dota 2 并进入对局，保持助手开启。</li></ol>
        <p>只在本机接收游戏状态。恢复时删除 game/dota/cfg/gamestate_integration/gamestate_integration_fuyou_desktop.cfg 即可。</p>
      </details>
      {error && <p class="warn" role="alert">{error}</p>}
    </section>
    <CapturePanel/>
    <SessionStats/>
    <section class="game-box" aria-label="三选一对照">
      <div class="game-heading"><h2>三选一对照 <small>手动选择 · {choices.length}/3</small></h2><button onClick={() => { setChoices([]); setMovement(''); setRoll(''); }}>新一轮</button></div>
      <p>尚未自动识别卡片或本局抽取值。请按游戏中显示的三张卡片搜索添加；这里只作对照，不替你选牌。</p>
      <input class="game-search" aria-label="搜索待对照福佑" placeholder="搜索名称或拼音，添加最多三张" value={query} onInput={e => setQuery(e.currentTarget.value)}/>
      {query.trim() && <div class="game-results">{results.map(item => <button key={item.id} disabled={choices.length >= 3 || choices.includes(item.id)} onClick={() => { setChoices(c => [...c, item.id]); setQuery(''); }}><span>{item.name}</span><small>{qualityName(item.quality)} · {item.id}</small></button>)}{!results.length && <p>没有匹配的福佑</p>}</div>}
      {!choices.length && <p class="game-empty">等待添加卡片。每轮开始请点“新一轮”。</p>}
      <div class="game-cards">{choices.map(id => {
        const item = items.find(i => i.id === id)!;
        return <article class="game-card" key={id}>
          <div class="game-heading"><span class={`item-icon q${item.quality}`}><img src={`${import.meta.env.BASE_URL}icons/${id}.png`} alt="" loading="lazy" decoding="async"/></span><h2>{item.name}<small>{qualityName(item.quality)} · 手动选择</small></h2><button aria-label={`移除${item.name}`} onClick={() => { setChoices(c => c.filter(v => v !== id)); if (id === '10006') setMovement(''); if (id === '10116') setRoll(''); }}>移除</button></div>
          {id === '10006' && <label class="game-field">当前移动速度（手填）<input type="number" min="0" step="any" aria-label="当前移动速度" value={movement} onInput={e => setMovement(e.currentTarget.value)}/></label>}
          {id === '10116' && <label class="game-field">本局伤害系数（手填，可留空）<input type="number" min="15" max="30" step="any" aria-label="本局伤害系数" value={roll} onInput={e => setRoll(e.currentTarget.value)}/></label>}
          <p class="benefit">{benefit(id, hero?.level, numeric(movement), roll.trim() ? Number(roll) : undefined)}</p>
          {['10006', '10116'].includes(id) && <p>基础估算，非最终实战收益。{id === '10116' ? '未计入飞行距离、技能增强和目标魔抗。' : '按手填移速计算；移速改变后需重新填写。'}</p>}
          <p class="description">{item.desc.map((s, index) => s.k === 'br' ? <br key={index}/> : <span class={s.k} key={index}>{displayRange(s.t)}</span>)}</p>
          <p>图鉴基准 {data.meta.baseline}；区间不是本局抽取值。</p>
        </article>;
      })}</div>
    </section>
  </main>;
}
