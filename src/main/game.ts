import { createServer, type Server } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GSI_PORT, freshGame, parseGame, type GameSnapshot, type GameSetup } from '../shared/game';

export const CONFIG_NAME = 'gamestate_integration_fuyou_desktop.cfg';
export function configText(token: string, port = GSI_PORT) {
  return `"Fuyou Desktop"\n{\n  "uri" "http://127.0.0.1:${port}/gsi"\n  "timeout" "5.0"\n  "buffer" "0.1"\n  "throttle" "0.5"\n  "heartbeat" "5.0"\n  "auth" { "token" "${token}" }\n  "data" { "provider" "1" "map" "1" "player" "1" "hero" "1" }\n}\n`;
}

export function findDota(): string {
  const roots = new Set([join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Steam')]);
  for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    roots.add(`${drive}:/SteamLibrary`);
    roots.add(`${drive}:/Steam`);
  }
  for (const root of [...roots]) {
    try {
      const libraries = readFileSync(join(root, 'steamapps/libraryfolders.vdf'), 'utf8');
      for (const match of libraries.matchAll(/"path"\s+"([^"]+)"/g)) roots.add(match[1].replace(/\\\\/g, '\\'));
    } catch { /* An absent Steam library is normal. */ }
  }
  for (const root of roots) {
    const path = join(root, 'steamapps/common/dota 2 beta/game/dota');
    if (existsSync(join(path, 'pak01_dir.vpk'))) return path;
  }
  return '';
}

export function installConfig(directory: string, token: string): GameSetup {
  const path = resolve(directory);
  if (!existsSync(join(path, 'pak01_dir.vpk')) || !existsSync(join(path, 'cfg'))) throw new Error('请选择包含 pak01_dir.vpk 和 cfg 的 game/dota 文件夹');
  const folder = join(path, 'cfg/gamestate_integration');
  const target = join(folder, CONFIG_NAME), text = configText(token);
  if (existsSync(target)) {
    if (readFileSync(target, 'utf8') !== text) throw new Error('发现已有的同名接入配置，未覆盖。请先备份并移走该文件，再重试。');
  } else {
    mkdirSync(folder, { recursive: true });
    writeFileSync(target, text, { flag: 'wx' });
  }
  return { directory: path, configured: true, message: '配置已安装。在 Steam 的 Dota 2 启动选项添加 -gamestateintegration，重启游戏并进入对局。' };
}

export class GameConnection {
  private server?: Server;
  private starting?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private snapshot: GameSnapshot = { status: 'waiting', message: '等待 Dota 2 上报，请先安装接入配置' };
  readonly token: string;
  constructor(private publish: (state: GameSnapshot) => void, userData: string) {
    const file = join(userData, 'game-token.txt');
    if (existsSync(file)) {
      this.token = readFileSync(file, 'utf8').trim();
      if (!/^[a-f0-9]{64}$/.test(this.token)) throw new Error('接入凭据文件损坏，请备份并移走 game-token.txt 后重启');
    } else {
      this.token = randomBytes(32).toString('hex');
      mkdirSync(userData, { recursive: true });
      writeFileSync(file, this.token, { flag: 'wx' });
    }
  }
  state() { return freshGame(this.snapshot); }
  async start(port = GSI_PORT): Promise<void> {
    if (this.starting) return this.starting;
    if (this.server?.listening) return;
    this.starting = this.listen(port);
    try { await this.starting; } finally { this.starting = undefined; }
  }
  private async listen(port: number) {
    const server = createServer((req, res) => {
      const end = (code: number) => { res.writeHead(code, { 'Connection': 'close' }).end(); };
      if (req.method !== 'POST' || req.url !== '/gsi') { end(404); req.resume(); return; }
      // A game client has no browser Origin. Do not accept cross-site requests.
      if (req.headers.origin) { end(403); req.resume(); return; }
      let bytes = 0, rejected = false;
      const chunks: Buffer[] = [];
      req.on('error', () => {});
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 256 * 1024) { if (!rejected) end(413); rejected = true; return; }
        if (!rejected) chunks.push(chunk);
      });
      req.on('end', () => {
        if (rejected) return;
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const token = body?.auth?.token;
          if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(this.token) || !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))) { end(401); return; }
          const state = parseGame(body);
          if (!state) { end(422); return; }
          this.snapshot = state; this.publish(this.state()); end(200);
        } catch { end(400); }
      });
    });
    server.requestTimeout = 5000; server.headersTimeout = 5000;
    server.setTimeout(5000, socket => socket.destroy());
    this.server = server;
    await new Promise<void>(done => {
      server.on('error', () => {
        this.snapshot = { status: 'error', message: `无法监听本机端口 ${port}，请关闭其他助手实例或占用该端口的程序后重试` };
        this.publish(this.state()); done();
      });
      server.listen(port, '127.0.0.1', () => {
        this.snapshot = { status: 'waiting', message: '接收服务已就绪，等待 Dota 2 上报' };
        this.publish(this.state());
        clearInterval(this.timer);
        this.timer = setInterval(() => this.publish(this.state()), 1000);
        this.timer.unref(); done();
      });
    });
  }
  async stop() {
    clearInterval(this.timer);
    if (this.server?.listening) {
      const server = this.server;
      await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
    }
    this.server = undefined;
  }
}
