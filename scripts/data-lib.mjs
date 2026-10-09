const colors = { '#83d18a': 'num', '#8e8e8e': 'note', '#ffea47': 'key', '#ff6b6b': 'warn', '#ff910a': 'key' };
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10));
});
export function parseDescription(html) {
  const result = [], stack = ['text'];
  for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
    if (/^<br\s*\/?\s*>$/i.test(token)) result.push({ t: '\n', k: 'br' });
    else if (/^<font\b/i.test(token)) stack.push(colors[token.match(/color\s*=\s*['"]?([^\s'">]+)/i)?.[1].toLowerCase()] || stack.at(-1));
    else if (/^<\/font/i.test(token)) { if (stack.length > 1) stack.pop(); }
    else if (!token.startsWith('<')) {
      const t = decode(token).replace(/\s+/g, ' '), k = stack.at(-1);
      if (result.at(-1)?.k === k) result.at(-1).t += t;
      else result.push({ t, k });
    }
  }
  while (result.length && !result[0].t.trim()) result.shift();
  while (result.length && !result.at(-1).t.trim()) result.pop();
  if (result.length) { result[0].t = result[0].t.trimStart(); result.at(-1).t = result.at(-1).t.trimEnd(); }
  return result;
}
export const displayRange = (s) => s.replace(/\[([^\[\]~]+)~([^\[\]]+)\]/g, '$1–$2');
export function extractKey(desc) {
  let index = desc.findIndex(s => s.k === 'num' && /\[[^\]]+~[^\]]+\]/.test(s.t));
  if (index < 0) index = desc.findIndex(s => s.k === 'num');
  if (index < 0) return null;
  const before = desc.slice(0, index).map(s => s.t).join('');
  const label = before.split(/[，。；、：（\n]/).at(-1).replace(/[+\-\s]+$/g, '').replace(/\s/g, '');
  const suffix = desc[index + 1]?.k === 'text' ? desc[index + 1].t.match(/^\s*(%|秒|码|次|层|×\s*等级)/)?.[1] || '' : '';
  return { label, value: displayRange(desc[index].t.trim() + suffix) };
}
