import { useState } from 'preact/hooks';
import { type RollRange } from '../shared/rolls';

export function InlineRoll({ range, saved, name, save }: { range: RollRange; saved?: number; name: string; save: (value: number) => void }) {
  const current = saved ?? range.midpoint;
  const [draft, setDraft] = useState(String(current));
  const [invalid, setInvalid] = useState(false);
  const commit = (input: HTMLInputElement) => {
    const value = input.valueAsNumber;
    const next = Number.isFinite(value) ? Math.max(range.min, Math.min(range.max, value)) : current;
    save(next); setDraft(String(next)); setInvalid(false);
  };
  return <span class="inline-roll"><input type="number" aria-label={`${name}数值${range.index}`} aria-invalid={invalid} min={range.min} max={range.max} step="any" title={`范围 ${range.min}–${range.max}，默认 ${range.midpoint}`} value={draft} style={{ width: `calc(${Math.max(3, draft.length, String(range.min).length, String(range.max).length)}ch + 24px)` }} onInput={e => {
    const input = e.currentTarget, value = input.valueAsNumber;
    setDraft(input.value);
    const valid = input.validity.valid && Number.isFinite(value);
    setInvalid(!valid);
    if (valid) save(value);
  }} onBlur={e => commit(e.currentTarget)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>{invalid && <span class="inline-limit" role="status">限 {range.min}–{range.max}</span>}</span>;
}
