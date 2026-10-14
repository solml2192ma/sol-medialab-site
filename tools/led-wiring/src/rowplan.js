// 세로 행 배치 편집 (순수 함수). plan = 위→아래 각 행의 높이(mm) 배열. 예: [500, 1000, 1000, 500, 500]
// 캐비닛 높이 cabH가 base(500)의 배수일 때(예: 500×1000) cabH 한 줄 = base 줄 k개로 나누거나 합칠 수 있다.

export const encodeRows = (plan) => plan.join('-');

export function decodeRows(s) {
  if (!s) return null;
  const a = String(s).split('-').map(Number);
  return a.length && a.every((n) => Number.isFinite(n) && n > 0) ? a : null;
}

export const sameRows = (a, b) => a.length === b.length && a.every((h, i) => h === b[i]);

/** 행 i를 d(-1 위 / +1 아래)만큼 이동 */
export function movePlan(plan, i, d) {
  const j = i + d;
  if (i < 0 || i >= plan.length || j < 0 || j >= plan.length) return plan;
  const next = [...plan];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const parts = (cabH, base) => (cabH > base && cabH % base === 0 ? cabH / base : 0);

/** cabH 한 줄을 base 줄 k개로 나눈다 (예: 1000 → 500, 500) */
export function splitRow(plan, i, cabH, base) {
  const k = parts(cabH, base);
  if (!k || plan[i] !== cabH) return plan;
  return [...plan.slice(0, i), ...Array(k).fill(base), ...plan.slice(i + 1)];
}

/** i번째부터 연속한 base 줄 k개를 cabH 한 줄로 합친다. 불가능하면 그대로 */
export function canMerge(plan, i, cabH, base) {
  const k = parts(cabH, base);
  return !!k && i + k <= plan.length && plan.slice(i, i + k).every((h) => h === base);
}
export function mergeRows(plan, i, cabH, base) {
  if (!canMerge(plan, i, cabH, base)) return plan;
  return [...plan.slice(0, i), cabH, ...plan.slice(i + parts(cabH, base))];
}
