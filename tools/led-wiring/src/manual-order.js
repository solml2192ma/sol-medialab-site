import { nextFreeNumber } from './layout.js';

export function allowedLanNumber(lines, value) {
  const n = Number(value);
  return lines.some(l => l.n === n) || n === nextFreeNumber(lines) ? n : nextFreeNumber(lines);
}

// 구간의 그린 순서는 유지해야 겹친 캐비닛의 소유권도 유지된다.
export function reorderLan(lines, from, to) {
  const ids = [...new Set(lines.map(l => l.n))].sort((a, b) => a - b);
  const a = ids.indexOf(from), b = ids.indexOf(to);
  if (a < 0 || b < 0 || a === b) return { lines, numbers: new Map(ids.map(n => [n, n])) };
  ids.splice(b, 0, ids.splice(a, 1)[0]);
  const numbers = new Map(ids.map((n, i) => [n, i + 1]));
  return { lines: lines.map(l => ({ ...l, n: numbers.get(l.n) })), numbers };
}
