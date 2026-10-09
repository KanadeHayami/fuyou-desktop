import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { benefit, freshGame, parseGame, STALE_MS } from '../src/shared/game';
import { CONFIG_NAME, GameConnection, configText, installConfig } from '../src/main/game';

// Synthetic protocol fixtures: never loaded by the application as live state.
const packet = { provider: { name: 'Dota 2', appid: 570 }, player: { steamid: '76561198000000000', activity: 'playing' }, hero: { name: 'npc_dota_hero_axe', level: 7, health: 500, max_health: 1000 }, map: { name: 'test-map' } };
const dirs: string[] = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'fuyou-test-')); dirs.push(path); return path; };
afterEach(() => { for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('game snapshots', () => {
  it('accepts own hero, preserves unknown hero keys, and clears missing fields', () => {
    expect(parseGame(packet, 100)?.hero?.level).toBe(7);
    expect(parseGame({ ...packet, hero: { name: 'npc_dota_hero_unknown' } })?.hero?.name).toBe('npc_dota_hero_unknown');
    expect(parseGame({ ...packet, hero: {} })?.hero).toBeUndefined();
    expect(parseGame({ ...packet, player: { steamid: 'other' } })?.hero).toBeUndefined();
    expect(parseGame({ ...packet, hero: { ...packet.hero, level: '7', health: -1 } })?.hero).toMatchObject({ level: undefined, health: undefined });
  });
  it('rejects non-game and replayed timestamps, clears stale data for calculations', () => {
    for (const invalid of [null, [], {}, { provider: { name: 'other' } }]) expect(parseGame(invalid)).toBeNull();
    expect(parseGame({ ...packet, provider: { ...packet.provider, timestamp: 1 } }, 100000)).toBeNull();
    const state = parseGame(packet, 100)!;
    expect(freshGame(state, 100 + STALE_MS).status).toBe('connected');
    const stale = freshGame(state, 101 + STALE_MS);
    expect(stale.status).toBe('stale'); expect(stale.hero).toBeUndefined();
  });
  it('accepts the observed Dota provider shape without requiring provider.steamid', () => {
    expect(parseGame(packet)?.hero?.name).toBe('npc_dota_hero_axe');
    expect(parseGame({ ...packet, provider: { ...packet.provider, steamid: packet.player.steamid } })?.hero?.level).toBe(7);
    expect(parseGame({ ...packet, provider: { ...packet.provider, steamid: '76561198000000001' } })?.hero).toBeUndefined();
    expect(parseGame({ ...packet, provider: { ...packet.provider, steamid: null } })?.hero).toBeUndefined();
  });
  it('does not present menus, missing identity, or spectator trees as the local hero', () => {
    for (const activity of [undefined, 'menu', 'spectating', '']) {
      expect(parseGame({ ...packet, player: { ...packet.player, activity } })?.hero).toBeUndefined();
    }
    for (const steamid of [undefined, '', '0', 76561198000000000]) {
      expect(parseGame({ ...packet, player: { ...packet.player, steamid } })?.hero).toBeUndefined();
    }
    expect(parseGame({ ...packet, player: { team2: { player0: packet.player } }, hero: { team2: { player0: packet.hero } } })?.hero).toBeUndefined();
    expect(parseGame({ ...packet, hero: { team2: { player0: packet.hero } } })?.hero).toBeUndefined();
    expect(parseGame({ ...packet, player: {} })?.hero).toBeUndefined();
  });
  it('uses only verified formulas and never picks a roll on behalf of the user', () => {
    expect(benefit('10006', undefined, 290)).toContain('+26.1');
    expect(benefit('10006')).toContain('填写');
    expect(benefit('10116', 7)).toContain('105–210');
    expect(benefit('10116', 7, undefined, 15.48)).toContain('108.36');
    expect(benefit('10116', 7, undefined, 31)).toContain('超出');
    expect(benefit('10116')).toContain('等待');
    expect(benefit('10101', 7)).toContain('暂未验证');
  });
});

it('installs only its own configuration and refuses to overwrite differing content', () => {
  const directory = temp(), token = 'a'.repeat(64);
  expect(() => installConfig(directory, token)).toThrow('请选择');
  writeFileSync(join(directory, 'pak01_dir.vpk'), 'test'); mkdirSync(join(directory, 'cfg'));
  expect(installConfig(directory, token).configured).toBe(true);
  const file = join(directory, 'cfg/gamestate_integration', CONFIG_NAME);
  expect(readFileSync(file, 'utf8')).toBe(configText(token));
  expect(installConfig(directory, token).configured).toBe(true);
  writeFileSync(file, 'existing user config');
  expect(() => installConfig(directory, token)).toThrow('未覆盖');
  expect(readFileSync(file, 'utf8')).toBe('existing user config');
});

it('handles real HTTP authentication, invalid requests, port conflicts and retry', async () => {
  const blocker = createServer();
  await new Promise<void>(done => blocker.listen(0, '127.0.0.1', done));
  const address = blocker.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port, directory = temp();
  const connection = new GameConnection(() => {}, directory);
  try {
    await connection.start(port);
    expect(connection.state().status).toBe('error');
    await new Promise<void>(done => blocker.close(() => done()));
    await Promise.all([connection.start(port), connection.start(port)]);
    expect(connection.state().status).toBe('waiting');
    const url = `http://127.0.0.1:${port}/gsi`;
    const send = (body: unknown, headers = {}) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    expect((await fetch(url)).status).toBe(404);
    expect((await send(packet)).status).toBe(401);
    const authenticated = { ...packet, auth: { token: connection.token } };
    expect((await send(authenticated, { Origin: 'https://example.com' })).status).toBe(403);
    expect((await send({ auth: authenticated.auth })).status).toBe(422);
    expect((await fetch(url, { method: 'POST', body: '{' })).status).toBe(400);
    expect((await send({ padding: 'x'.repeat(300000) })).status).toBe(413);
    expect(connection.state().status).toBe('waiting');
    expect((await send(authenticated)).status).toBe(200);
    expect(connection.state().hero?.level).toBe(7);
    expect((await send({ ...authenticated, hero: {} })).status).toBe(200);
    expect(connection.state().hero).toBeUndefined();
    expect(new GameConnection(() => {}, directory).token).toBe(connection.token);
  } finally { await connection.stop(); if (blocker.listening) await new Promise<void>(done => blocker.close(() => done())); }
});
