import { useState, useEffect } from 'preact/hooks';
import { validPlayerId, type RosterEntry, type RosterScan } from '../shared/roster';
import './roster.css';
const blank = { id: '', name: '', note: '', kind: 'red' as 'red' | 'black', attachScreenshot: false };
export function Roster() {
  const [rows, setRows] = useState<RosterEntry[]>([]), [scan, setScan] = useState<RosterScan>();
  const [draft, setDraft] = useState({ ...blank }), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(''), [matchedIds, setMatchedIds] = useState<string[]>([]);
  useEffect(() => { if (window.api?.rosterList) void window.api.rosterList().then(setRows).catch(e => setError(String(e.message))); }, []);
  const hits = rows.filter(r => matchedIds.includes(r.id));
  const choose = (id: string, name: string) => {
    const old = rows.find(r => r.id === id);
    setDraft({ id, name: old?.name || name, kind: old?.kind || 'red', note: old?.note || '', attachScreenshot: true });
  };
  const importImage = async () => {
    if (!window.api?.rosterImport || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.api.rosterImport();
      if (result) { setScan(result); setMatchedIds(rows.filter(r => result.candidates.some(c => c.id === r.id)).map(r => r.id)); if (result.candidates.length === 1) choose(result.candidates[0].id, result.candidates[0].name); else setDraft({ ...blank, attachScreenshot: true }); }
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!window.api || busy) return;
    setBusy(true); setError('');
    try { setRows(await window.api.rosterSave(draft)); setNotice('记录已保存'); setDraft({ ...blank }); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.api || busy) return;
    setBusy(true);
    try { setRows(await window.api.rosterRemove(id)); setDeleting(''); if (draft.id === id) setDraft({ ...blank }); setNotice('记录已删除'); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
    finally { setBusy(false); }
  };
  return <main class="game-panel roster"><div><h1>队友红黑榜</h1><p>红榜记下值得再组队的人，黑榜记录需要留意的人。仅保存在本机，不公开上传。</p></div>
    <section class="game-box"><div class="game-heading"><h2>导入截图</h2><button disabled={!window.api?.rosterImport || busy} onClick={() => void importImage()}>{busy ? '处理中…' : '导入玩家／匹配截图'}</button></div><p>每次导入时按号码比对，不后台采集。建议导入清晰的玩家卡片；完整名单截图可能需要逐人裁剪。OCR 可能误读，请与原图核对。</p>{!window.api?.rosterList && <p>截图识别和记录管理请使用桌面版。</p>}{error && <p role="alert" class="warn">{error}</p>}{notice && <p role="status">{notice}</p>}
      <details class="roster-guide" open={!scan}><summary>截图标准模板</summary><div class="roster-guide-body"><figure class="roster-template"><span class="roster-template-caption">单人卡片 · 裁剪范围</span><div class="roster-template-card"><div class="roster-template-avatar">头像</div><strong>完整玩家昵称</strong><span class="roster-template-id">完整玩家号码</span><small>状态区域可保留</small></div><figcaption>结构示意，非真实玩家</figcaption></figure><div class="roster-guide-copy"><h3>照着示例范围截图</h3><ol><li>截取一张完整玩家卡片，保留头像、昵称和号码。</li><li>号码独占一行，完整清晰；不要遮挡、涂改或裁掉数字。</li><li>直接保存原始截图，避免压缩、模糊和聊天窗口遮挡。</li></ol><p>支持 PNG、JPG、JPEG、BMP，文件小于 15 MB。多人名单识别不全时，逐人裁剪导入；导入后请核对识别结果。</p></div></div></details>
      {scan && <div class="roster-scan"><img src={scan.image} alt="本次导入截图，供核对头像昵称和号码"/><div>{scan.warning && <p class="warn">{scan.warning}</p>}<div class="roster-reminder" role="status"><strong>{hits.length ? `提醒：截图中有 ${hits.length} 位已标记玩家` : '未匹配到已有号码（不代表截图中一定没有已标记玩家）'}</strong>{hits.map(r => <p key={r.id}><b><span class={`roster-badge roster-${r.kind}`}>{r.kind === 'red' ? '红榜' : '黑榜'}</span> · {r.name}</b> · {r.id}<br/>{r.note || '暂无备注'}</p>)}</div><div class="game-buttons">{scan.candidates.map(c => <button key={c.id} onClick={() => choose(c.id, c.name)}>{c.name || '待核对昵称'} · {c.id}</button>)}</div><details><summary>识别原文</summary><p class="roster-raw">{scan.text || '未识别到文字'}</p></details></div></div>}
    </section>
    <section class="game-box"><h2>{rows.some(r => r.id === draft.id) ? '编辑已有记录' : '核对并记录'}</h2><p>使用截图中的号码作为唯一标识，昵称可修改。这里不把九位账号号码转换成 SteamID64，也不按重名提醒。</p><div class="roster-fields"><label class="game-field">玩家号码<input aria-label="玩家号码" inputMode="numeric" maxLength={17} value={draft.id} onInput={e => setDraft({ ...draft, id: e.currentTarget.value.trim() })}/></label><label class="game-field">昵称<input aria-label="队友昵称" maxLength={100} value={draft.name} onInput={e => setDraft({ ...draft, name: e.currentTarget.value })}/></label></div><div class="game-buttons" role="group" aria-label="红黑榜标记"><button class="roster-red" aria-pressed={draft.kind === 'red'} onClick={() => setDraft({ ...draft, kind: 'red' })}>红榜</button><button class="roster-black" aria-pressed={draft.kind === 'black'} onClick={() => setDraft({ ...draft, kind: 'black' })}>黑榜</button></div><label class="game-field">备注<textarea aria-label="队友备注" maxLength={1000} rows={3} value={draft.note} onInput={e => setDraft({ ...draft, note: e.currentTarget.value })}/></label><div class="game-buttons"><button disabled={!window.api?.rosterSave || busy || !validPlayerId(draft.id) || !draft.name.trim()} onClick={() => void save()}>核对无误，保存记录</button><button onClick={() => setDraft({ ...blank })}>清空输入</button></div></section>
    <section class="game-box"><h2>我的记录 · {rows.length}</h2><input class="game-search" aria-label="搜索队友记录" placeholder="搜索昵称、号码或备注" value={query} onInput={e => setQuery(e.currentTarget.value)}/>{!rows.length && <p>暂无记录，导入截图或手动填写后保存。</p>}<div class="roster-records">{rows.filter(r => `${r.name} ${r.id} ${r.note}`.toLowerCase().includes(query.toLowerCase())).map(r => <article key={r.id}><div class="roster-record-main"><div class="roster-identity">{r.image && <img class="roster-thumb" src={r.image} alt={`${r.name}的记录截图`} loading="lazy"/>}<div><h2>{r.name} <span class={`roster-badge roster-${r.kind}`}>{r.kind === 'red' ? '红榜' : '黑榜'}</span></h2><p>{r.id}</p></div></div><div class="roster-note-block"><span class="roster-note-label">备注</span><p class={`roster-note${r.note ? '' : ' is-empty'}`}>{r.note || '暂无备注'}</p></div></div><div class="game-buttons"><button disabled={busy} onClick={() => { setDraft({ id: r.id, name: r.name, kind: r.kind, note: r.note, attachScreenshot: false }); setNotice('已载入编辑区'); }}>编辑</button>{deleting === r.id ? <><button disabled={busy} onClick={() => void remove(r.id)}>确认删除</button><button onClick={() => setDeleting('')}>取消</button></> : <button onClick={() => setDeleting(r.id)}>删除</button>}</div></article>)}</div></section>
  </main>;
}
