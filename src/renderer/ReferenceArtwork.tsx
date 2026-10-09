import { useEffect, useState } from 'preact/hooks';

export function ReferenceArtwork({ family, id, detail = false }: { family: 'rune' | 'hero'; id: string; detail?: boolean }) {
  const source = family === 'rune' ? `./runes/${encodeURIComponent(id)}.png` : `./heroes/${detail ? 'portraits' : 'icons'}/${encodeURIComponent(id)}.png`;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [source]);
  return <span class={`reference-artwork reference-artwork-${family}${detail ? ' reference-artwork-detail' : ''}`} aria-hidden="true">
    {failed ? <svg class="reference-artwork-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/><circle cx="16" cy="8" r="1.5"/></svg> :
      <img src={source} alt="" loading={detail ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)}/>}
  </span>;
}
