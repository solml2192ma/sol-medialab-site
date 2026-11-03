import { config } from './config.js?base=1';

export function decodeBaseCounts(value, cfg = config) {
  if (typeof value !== 'string' || !value) return null;
  const parts = value.split(',');
  const counts = parts.map(Number);
  return parts.length === cfg.scaffold.baseLengthsMm.length && parts.every(p => /^\d+$/.test(p))
    && counts.every(n => Number.isSafeInteger(n) && n >= 0)
    && Number.isSafeInteger(counts.reduce((s, n, i) => s + n * cfg.scaffold.baseLengthsMm[i], 0)) ? counts : null;
}

/** 정확한 길이·최소 개수를 유지하고, 동률이면 짧은 규격 사용을 줄인다. */
export function basePlan(widthMm, enabled, manualCounts = null, cfg = config) {
  const lengths = cfg.scaffold.baseLengthsMm;
  const fewerShort = cfg.scaffold.basePreferFewerShortPieces;
  const priority = lengths.map((_, i) => i).sort((a, b) => fewerShort ? lengths[a] - lengths[b] : lengths[b] - lengths[a]);
  let counts = lengths.map(() => 0);
  if (enabled && manualCounts) counts = [...manualCounts];
  else if (enabled && Number.isFinite(widthMm) && widthMm > 0) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const unit = lengths.reduce(gcd);
    const sizes = lengths.map(n => n / unit);
    const target = Math.ceil(widthMm / unit), max = target + Math.max(...sizes);
    const best = Array(max + 1).fill(null);
    best[0] = { count: 0, counts };
    for (let t = 1; t <= max; t++) {
      for (let i = 0; i < sizes.length; i++) {
        const prev = best[t - sizes[i]];
        if (!prev) continue;
        const next = [...prev.counts]; next[i]++;
        const different = best[t] ? priority.find(j => next[j] !== best[t].counts[j]) : undefined;
        const betterTie = different !== undefined && (fewerShort ? next[different] < best[t].counts[different] : next[different] > best[t].counts[different]);
        if (!best[t] || prev.count + 1 < best[t].count ||
          (prev.count + 1 === best[t].count && betterTie)) {
          best[t] = { count: prev.count + 1, counts: next };
        }
      }
    }
    counts = best.slice(target).find(Boolean)?.counts ?? counts;
  }
  return {
    items: lengths.map((lengthMm, i) => ({ lengthMm, count: counts[i] })),
    totalCount: counts.reduce((a, b) => a + b, 0),
    totalWidthMm: counts.reduce((sum, n, i) => sum + n * lengths[i], 0),
    manual: enabled && manualCounts !== null,
  };
}
