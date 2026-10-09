export type GameSnapshot = {
  status: 'waiting' | 'connected' | 'stale' | 'error';
  message: string;
  receivedAt?: number;
  hero?: { name: string; level?: number; health?: number; maxHealth?: number };
  map?: string;
  phase?: string;
  matchId?: string;
  gameTime?: number;
};
export type GameSetup = { directory: string; configured: boolean; message: string };
export const GSI_PORT = 37163;
export const STALE_MS = 15000;

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const label = (value: unknown) => typeof value === 'string' && value.length <= 200 ? value : undefined;

// Each GSI request is a full snapshot; never carry a previous hero into a new map.
export function parseGame(payload: unknown, now = Date.now()): GameSnapshot | null {
  const p = record(payload), provider = record(p.provider), hero = record(p.hero), player = record(p.player), map = record(p.map);
  if (provider.name !== 'Dota 2') return null;
  if (typeof provider.timestamp === 'number' && Math.abs(now / 1000 - provider.timestamp) > 30) return null;
  // Dota's provider contains app metadata, not a Steam ID. Active local play
  // exposes a flat player/hero pair; spectator team trees must not be flattened.
  const localPlayer = typeof player.steamid === 'string' && /^[1-9]\d{16}$/.test(player.steamid) && player.activity === 'playing';
  const identityConsistent = provider.steamid === undefined || provider.steamid === player.steamid;
  const ownHero = localPlayer && identityConsistent && typeof hero.name === 'string' && /^npc_dota_hero_[a-z0-9_]+$/.test(hero.name);
  return {
    status: 'connected', receivedAt: now,
    message: ownHero ? '已收到游戏上报' : '已连接，等待本机玩家英雄数据（菜单或观战不作本人状态）',
    hero: ownHero ? { name: hero.name as string, level: finite(hero.level), health: finite(hero.health), maxHealth: finite(hero.max_health) } : undefined,
    map: label(map.name), phase: label(map.game_state), matchId: label(map.matchid), gameTime: typeof map.game_time === 'number' && Number.isFinite(map.game_time) ? map.game_time : undefined
  };
}

export function freshGame(snapshot: GameSnapshot, now = Date.now()): GameSnapshot {
  if (snapshot.receivedAt !== undefined && now - snapshot.receivedAt > STALE_MS && snapshot.status !== 'error') {
    return { status: 'stale', message: '超过 15 秒未收到更新，已停止使用上次英雄数据', receivedAt: snapshot.receivedAt };
  }
  return snapshot;
}

// Explicit formulas from the real catalog only; no generic inference from prose.
export function benefit(id: string, level?: number, movement?: number, roll?: number): string {
  const format = (n: number) => Number(n.toFixed(2)).toString();
  if (id === '10006') return movement !== undefined && movement >= 0 && Number.isFinite(movement)
    ? `基础攻击速度加成 +${format(movement * 0.09)}（手填移速 × 9%）`
    : '填写当前移动速度后，可计算 9% × 移速的攻击速度加成';
  if (id === '10116') {
    if (level === undefined || !Number.isFinite(level) || level <= 0) return '等待游戏上报当前等级后，可计算基础箭矢伤害';
    if (roll !== undefined && (roll < 15 || roll > 30 || !Number.isFinite(roll))) return '输入值超出图鉴 15–30 范围，暂不计算，请核对本局数值';
    return roll === undefined ? `基础魔法伤害范围 ${format(15 * level)}–${format(30 * level)}（图鉴范围 × ${level} 级）`
      : `基础魔法伤害 ${format(roll * level)}（手填系数 × ${level} 级）`;
  }
  return '暂未验证收益公式，以下仅展示图鉴原文';
}
