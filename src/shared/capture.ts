export type Region = { x: number; y: number; width: number; height: number };
export const DEFAULT_REGION: Region = { x: .85, y: .12, width: .15, height: .76 };
export type OcrLine = { text: string; x: number; y: number };
export type CapturedRow = { raw: string; id?: string; candidates: string[]; confirmed?: boolean };
export type CaptureMetrics = { captureMs: number; ocrMs: number; totalMs: number; cpuMs: number; memoryMB: number; width: number; height: number };
export type CaptureState = {
  movement?: number;
  session: number; values: Record<string, Record<string, number>>;
  active: boolean; intervalMs: number; region: Region;
  status: 'paused' | 'starting' | 'running' | 'background' | 'hidden' | 'error'; message: string;
  rows: CapturedRow[]; observedAt?: number; recognizedAt?: number; metrics?: CaptureMetrics;
  checks: number; recognitions: number; unchanged: number;
};
export const initialCapture = (): CaptureState => ({ session: 0, values: {}, active: false, intervalMs: 5000, region: { ...DEFAULT_REGION }, status: 'paused', message: '自动采集未开启', rows: [], checks: 0, recognitions: 0, unchanged: 0 });
export function validateCaptureOptions(value: unknown): { intervalMs: number; region: Region } {
  const input = value as { intervalMs?: number; region?: Region } | null;
  const r = input?.region;
  if (![2000, 5000].includes(input?.intervalMs || 0) || !r || ![r.x, r.y, r.width, r.height].every(v => typeof v === 'number' && Number.isFinite(v)) || r.x < 0 || r.y < 0 || r.width < .05 || r.height < .05 || r.x + r.width > 1.00001 || r.y + r.height > 1.00001) throw new Error('采集范围应在游戏窗口内，间隔请选择 2 秒或 5 秒');
  return { intervalMs: input!.intervalMs!, region: { x: r.x, y: r.y, width: r.width, height: r.height } };
}
export const normalizeOcr = (text: string) => text.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
export function recognizeBackpack(lines: OcrLine[], catalog: { id: string; name: string }[]): { visible: boolean; rows: CapturedRow[] } {
  const title = lines.find(l => normalizeOcr(l.text) === '福佑碎片背包');
  if (!title) return { visible: false, rows: [] };
  const footer = lines.find(l => l.y > title.y && /所有玩家|每5级|每次重铸/.test(normalizeOcr(l.text)));
  const entries = catalog.map(i => ({ ...i, key: normalizeOcr(i.name) }));
  const rows: CapturedRow[] = [];
  for (const line of lines) {
    if (line.y <= title.y || line.y >= (footer?.y ?? 1) || line.x > .8) continue;
    const key = normalizeOcr(line.text);
    if (key === '重铸' || (key.match(/\p{Script=Han}/gu)?.length ?? 0) < 2) continue;
    const exact = entries.filter(i => i.key === key);
    if (exact.length === 1) { rows.push({ raw: line.text, id: exact[0].id, candidates: [exact[0].id] }); continue; }
    // A cropped/truncated name only suggests candidates. Never choose an ID from a prefix.
    const candidates = exact.length ? exact : entries.filter(i => {
      const max = Math.min(i.key.length, key.length);
      for (let n = max; n >= 4; n--) if (key.includes(i.key.slice(0, n))) return true;
      return false;
    });
    rows.push({ raw: line.text, candidates: candidates.map(i => i.id).slice(0, 8) });
  }
  return { visible: true, rows: rows.slice(0, 24) };
}
