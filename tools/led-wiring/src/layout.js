// 격자 배치 + LAN 줄 나누기 + POWER 체인 계산 (순수 함수, DOM 없음)
import { config as defaultConfig } from './config.js';

// 배선 패턴: 시작 모서리(top/left) × 진행 축(h=가로, v=세로) × 지그재그 (8종)
const P = (id, axis, snake, top, left, label) => ({ id, axis, snake, top, left, label });
export const PATTERNS = [
  P('hz-tl', 'h', true, true, true, '가로 지그재그 · 좌상단 시작'),
  P('vz-tl', 'v', true, true, true, '세로 지그재그 · 좌상단 시작'),
  P('hz-tr', 'h', true, true, false, '가로 지그재그 · 우상단 시작'),
  P('vz-tr', 'v', true, true, false, '세로 지그재그 · 우상단 시작'),
  P('hz-bl', 'h', true, false, true, '가로 지그재그 · 좌하단 시작'),
  P('vz-bl', 'v', true, false, true, '세로 지그재그 · 좌하단 시작'),
  P('hz-br', 'h', true, false, false, '가로 지그재그 · 우하단 시작'),
  P('vz-br', 'v', true, false, false, '세로 지그재그 · 우하단 시작'),
];
export const DEFAULT_PATTERN = 'hz-tl';
const LEGACY = { 'h-zigzag': 'hz-tl', 'v-zigzag': 'vz-tl', 'h-oneway': 'hz-tl' }; // 구버전 방향 이름
export const patternOf = (id) => PATTERNS.find((x) => x.id === (LEGACY[id] ?? id)) ?? PATTERNS[0];

/** 사각형 영역 rect({r0,r1,c0,c1}, 끝은 미포함)을 패턴 순서로 훑은 [행, 열] 목록 */
export function orderRect(rect, pattern) {
  const rs = range(rect.r0, rect.r1);
  const cs = range(rect.c0, rect.c1);
  if (!pattern.top) rs.reverse();
  if (!pattern.left) cs.reverse();
  const out = [];
  if (pattern.axis === 'h') {
    rs.forEach((r, i) => (pattern.snake && i % 2 ? [...cs].reverse() : cs).forEach((c) => out.push([r, c])));
  } else {
    cs.forEach((c, i) => (pattern.snake && i % 2 ? [...rs].reverse() : rs).forEach((r) => out.push([r, c])));
  }
  return out;
}

/**
 * LAN n번이 포트 한도를 넘으면 오류 창에 쓸 {title, detail}, 아니면 null.
 * 직접 그릴 때 이 결과가 null이 아니면 그 구간은 도면에 반영하지 않는다.
 */
export function limitError(lay, n) {
  const l = lay.lanLines.find((x) => x.id === n);
  if (!l || !l.over) return null;
  return {
    title: `LAN ${n}: 한 포트 한도를 넘습니다.`,
    detail: '영역을 줄이거나 다른 LAN 번호로 나누어 그려 주세요.',
  };
}

/** 줄 목록에서 아직 안 쓰인 가장 작은 LAN 번호 */
export function nextFreeNumber(lines) {
  const used = new Set(lines.map((l) => l.n));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/**
 * 직접 배선 줄 목록 <-> 문자열 (URL/저장용).
 * 줄: {r0,c0,r1,c1,p,n} (끝 미포함, n = 사용자가 정하는 LAN 포트 번호. 한 번 정해지면 다른 줄을 지워도 바뀌지 않는다)
 */
export const encodeManual = (lines) => lines.map((l) => `${l.r0}.${l.c0}.${l.r1}.${l.c1}.${l.p}.${l.n ?? ''}`).join('~');
export function decodeManual(s) {
  if (!s) return [];
  const lines = s.split('~').flatMap((tok) => {
    const [r0, c0, r1, c1, p, n] = tok.split('.');
    const v = [r0, c0, r1, c1].map(Number);
    if (!v.every(Number.isInteger) || !PATTERNS.some((x) => x.id === p)) return [];
    const num = Number(n);
    return [{ r0: v[0], c0: v[1], r1: v[2], c1: v[3], p, n: n && Number.isInteger(num) && num >= 1 ? num : undefined }];
  });
  // 번호가 없는 옛 데이터는 비어 있는 번호를 순서대로 배정
  for (const l of lines) if (l.n === undefined) l.n = nextFreeNumber(lines);
  return lines;
}

/**
 * @param {object} res calc() 결과 (errors 없는 것)
 * @param {{pattern?: string, direction?: string, manual?: Array|null, powerPattern?: string, powerManual?: Array|null, powerOnly?: boolean}} opt
 *   manual/powerManual이 배열이면 해당 배선의 직접 모드, null/undefined면 자동 배선.
 *   powerOnly는 동일한 격자·패턴·구간 소유권 계산을 재사용하는 내부 경로다.
 */
export function buildLayout(res, opt, cfg = defaultConfig) {
  const { grid, pixel } = res;
  const pattern = patternOf(opt.pattern ?? opt.direction ?? cfg.defaultDirection);

  // 행 정의: 계산된 사용자/기본 행 배치 순서를 그대로 따른다.
  const rowDefs = grid.rowPlan.map((r) => ({ h: r.h, px: r.kind === 'main' ? pixel.mainCab : pixel.fillerCab }));
  const cabW = grid.mainCab.w;
  const cols = grid.cols;
  const cells = [];
  const at = []; // at[r][c]
  let y = 0;
  rowDefs.forEach((rd, r) => {
    at[r] = [];
    for (let c = 0; c < cols; c++) {
      const cell = {
        id: r * cols + c + 1,
        row: r,
        col: c,
        x: c * cabW,
        y,
        w: cabW,
        h: rd.h,
        pixels: rd.px.w * rd.px.h,
        pw: rd.px.w,
        ph: rd.px.h,
      };
      cells.push(cell);
      at[r][c] = cell;
    }
    y += rd.h;
  });
  const totalW = cols * cabW;
  const totalH = y;
  const rows = rowDefs.length;

  // --- LAN: 사각형(ㅁ) 덩어리로만 나눈다 ---
  // 1포트 한도는 배선 모양과 무관하게 사각형으로 환산해 계산하므로, 줄 하나는 항상 직사각형 영역이다.
  const limit = cfg.lan.maxPixelsPerPortByPitch?.[res.pitchInfo.pitch] ?? cfg.lan.maxPixelsPerPort;
  const maxCabs = cfg.lan.maxCabinetsPerLine ?? Infinity;
  // POWER 내부 경로는 픽셀 대신 500×500 환산 장수를 사용한다.
  const rowPx = rowDefs.map((rd) => opt.powerOnly
    ? (cabW / cfg.baseCabinetMm) * (rd.h / cfg.baseCabinetMm)
    : rd.px.w * rd.px.h);
  const warnings = [];
  // parts: 한 LAN를 이루는 구간들(직접 그릴 때 같은 번호로 여러 번 드래그하면 구간이 이어진다)
  const mk = (id, cellsIn, rect, pat, src = null, parts = null) => {
    // 같은 LAN의 모든 구간을 감싸는 사각형으로 환산한다.
    // 빈 칸이나 다른 LAN 소유 칸이 끼어 있어도 사각형 안의 해상도는 모두 포함한다.
    const bounds = cellsIn.reduce((b, c) => ({
      r0: Math.min(b.r0, c.row), r1: Math.max(b.r1, c.row + 1),
      c0: Math.min(b.c0, c.col), c1: Math.max(b.c1, c.col + 1),
    }), { r0: rows, r1: 0, c0: cols, c1: 0 });
    const width = bounds.c1 - bounds.c0;
    const pixels = width * rowPx.slice(bounds.r0, bounds.r1).reduce((s, px) => s + px, 0);
    const areaCabs = width * (bounds.r1 - bounds.r0);
    return { id, cells: cellsIn, parts: parts ?? [cellsIn], pixels, rect, pattern: pat.id, src, over: pixels > limit || areaCabs > maxCabs };
  };
  let lanLines;
  let uncovered = [];
  const alive = []; // 직접 배선에서 보이는 칸이 하나라도 남은 입력 항목의 인덱스
  if (Array.isArray(opt.manual)) {
    // 직접 배선: 나중에 그린 줄이 겹치는 캐비닛을 가져간다. 범위 밖 줄은 무시.
    const owner = new Map();
    const valid = opt.manual.map((l, src) => ({ ...l, src })).filter((l) => l.r0 >= 0 && l.c0 >= 0 && l.r1 <= rows && l.c1 <= cols && l.r1 > l.r0 && l.c1 > l.c0);
    valid.forEach((l, i) => orderRect(l, patternOf(l.p)).forEach(([r, c]) => owner.set(at[r][c].id, i)));
    // 같은 번호(n)의 항목들은 한 LAN의 구간들: 그린 순서대로 이어 붙인다
    const groups = new Map();
    valid.forEach((l, i) => {
      const n = l.n ?? l.src + 1;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push({ l, i });
    });
    lanLines = [];
    for (const [n, segs] of groups) {
      const parts = segs.map(({ l, i }) => orderRect(l, patternOf(l.p)).map(([r, c]) => at[r][c]).filter((c) => owner.get(c.id) === i));
      const keep = segs.filter((_, k) => parts[k].length);
      if (!keep.length) continue;
      alive.push(...keep.map(({ l }) => l.src));
      const first = keep[0].l;
      const nonEmpty = parts.filter((p) => p.length);
      lanLines.push(mk(n, nonEmpty.flat(), { r0: first.r0, r1: first.r1, c0: first.c0, c1: first.c1 }, patternOf(first.p), first.src, nonEmpty));
    }
    lanLines.sort((p, q) => p.id - q.id); // 번호순으로 표시 (번호는 재배정하지 않는다)
    uncovered = cells.filter((c) => !owner.has(c.id)).map((c) => c.id);
    if (uncovered.length) warnings.push(`배선이 연결되지 않은 캐비닛이 ${uncovered.length}장 있습니다.`);
  } else {
    // LAN는 선택 방향으로 한도까지 진행하고, POWER는 기존 균등 분할을 유지한다.
    const rects = opt.powerOnly || cfg.lan.autoDirectionPriority
      ? partitionByDirection(rowPx, cols, limit, maxCabs, pattern, !!opt.powerOnly)
      : partitionLan(rowPx, cols, limit, maxCabs, pattern);
    lanLines = rects.map((rc, i) => mk(i + 1, orderRect(rc, pattern).map(([r, c]) => at[r][c]), rc, pattern));
  }
  for (const l of lanLines) {
    if (l.over) warnings.push(`LAN ${l.id}: 한 포트 한도를 넘습니다.`);
  }

  if (opt.powerOnly) return { lanLines, uncovered, alive };
  // POWER는 픽셀과 무관하다. 자동은 500×500 환산 20장 이하, 직접 그리기는 제한 없음.
  const powerPattern = patternOf(opt.powerPattern ?? cfg.defaultDirection).id;
  const powerManual = Array.isArray(opt.powerManual);
  const power = buildLayout(res, { pattern: powerPattern, manual: opt.powerManual, powerOnly: true }, {
    ...cfg,
    lan: { maxPixelsPerPort: powerManual ? Infinity : cfg.power.autoMaxCabinetsPerPort, maxPixelsPerPortByPitch: {}, maxCabinetsPerLine: Infinity },
  });
  const powerChains = power.lanLines.map((line) => ({ ...line, over: false }));
  const powerLoadWarnings = powerManual ? powerChains.flatMap((line) => {
    const load = line.cells.reduce((sum, cell) => sum + cell.w * cell.h / cfg.baseCabinetMm ** 2, 0);
    return load > cfg.power.autoMaxCabinetsPerPort
      ? [`POWER ${line.id}: 500×500 기준 ${cfg.power.autoMaxCabinetsPerPort}장분을 넘었습니다. 배선은 유지됩니다.`]
      : [];
  }) : [];
  if (power.uncovered.length) warnings.push(`POWER 배선이 연결되지 않은 캐비닛이 ${power.uncovered.length}장 있습니다.`);
  return { pattern: pattern.id, manual: Array.isArray(opt.manual), cells, rows, cols, totalW, totalH, lanLines, powerChains, uncovered, alive, limit, maxCabs, warnings, powerPattern, powerManual, powerLoadWarnings, powerUncovered: power.uncovered, powerAlive: power.alive };
}

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i); // [a, b)

/** 선택 방향의 띠를 먼저 만들고, 분할이 필요하면 부하를 균등하게 나눈다. */
function partitionByDirection(rowPx, cols, limit, maxCabs, pattern, balance = true) {
  const split = balance ? balancedParts : maximalParts;
  const rowOrder = range(0, rowPx.length);
  const colOrder = range(0, cols);
  if (!pattern.top) rowOrder.reverse();
  if (!pattern.left) colOrder.reverse();
  const rect = (rs, cs) => ({ r0: Math.min(...rs), r1: Math.max(...rs) + 1, c0: Math.min(...cs), c1: Math.max(...cs) + 1 });
  const out = [];
  if (pattern.axis === 'h') {
    for (let i = 0; i < rowOrder.length;) {
      const parts = split(colOrder.map(() => rowPx[rowOrder[i]]), limit, maxCabs);
      const maxWidth = Math.max(...parts.map((part) => part.length));
      let end = i + 1;
      let sum = rowPx[rowOrder[i]];
      while (end < rowOrder.length && maxWidth * (sum + rowPx[rowOrder[end]]) <= limit && maxWidth * (end - i + 1) <= maxCabs) {
        sum += rowPx[rowOrder[end++]];
      }
      for (const part of parts) out.push(rect(rowOrder.slice(i, end), part.map((index) => colOrder[index])));
      i = end;
    }
  } else {
    const parts = split(rowOrder.map((r) => rowPx[r]), limit, maxCabs);
    const largestLoad = Math.max(...parts.map((part) => part.reduce((sum, index) => sum + rowPx[rowOrder[index]], 0)));
    const largestCount = Math.max(...parts.map((part) => part.length));
    const width = Math.max(1, Math.min(cols, Math.floor(limit / largestLoad), Math.floor(maxCabs / largestCount)));
    // 여러 열을 묶을 때도 마지막 띠만 짧아지지 않도록 균등 분할한다.
    const widths = balancedLengths(cols, Math.ceil(cols / width));
    let start = 0;
    for (const count of widths) {
      for (const part of parts) out.push(rect(part.map((index) => rowOrder[index]), colOrder.slice(start, start + count)));
      start += count;
    }
  }
  return out;
}

const balancedLengths = (n, k) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));

/** 선택 방향으로 한도 안에서 최대한 길게 진행하는 연속 구간. */
function maximalParts(weights, limit, maxCount) {
  const parts = [];
  let part = [], sum = 0;
  for (let i = 0; i < weights.length; i++) {
    if (part.length && (sum + weights[i] > limit || part.length >= maxCount)) {
      parts.push(part); part = []; sum = 0;
    }
    part.push(i); sum += weights[i];
  }
  if (part.length) parts.push(part);
  return parts;
}

/** 연속한 칸을 필요한 최소 구간 수로 나누고, 최대 부하를 최소화한다. */
function balancedParts(weights, limit, maxCount) {
  const groupsFor = (capacity) => {
    const groups = [];
    let group = [], sum = 0;
    for (let i = 0; i < weights.length; i++) {
      if (group.length && (sum + weights[i] > capacity || group.length >= maxCount)) {
        groups.push(group); group = []; sum = 0;
      }
      group.push(i); sum += weights[i];
    }
    if (group.length) groups.push(group);
    return groups;
  };
  const count = groupsFor(limit).length;
  if (weights.every((weight) => weight === weights[0])) {
    let offset = 0;
    return balancedLengths(weights.length, count).map((length) => {
      const indices = range(offset, offset + length); offset += length; return indices;
    });
  }
  let lo = Math.max(...weights), hi = weights.reduce((sum, weight) => sum + weight, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (groupsFor(mid).length <= count) hi = mid;
    else lo = mid + 1;
  }
  return groupsFor(lo);
}

/** LAN: 가로·세로 분할 중 포트 수가 적은 쪽, 같으면 선택 방향을 따른다. */
function partitionLan(rowPx, cols, limit, maxCabs, pattern) {
  const byRows = partitionByRowBands(rowPx, cols, limit, maxCabs);
  const byCols = partitionByColBands(rowPx, cols, limit, maxCabs);
  const preferV = pattern.axis === 'v';
  const rects = byRows.length === byCols.length
    ? (preferV ? byCols : byRows)
    : (byRows.length < byCols.length ? byRows : byCols);
  const rowOrder = (p, q) => pattern.top ? p.r0 - q.r0 : q.r1 - p.r1;
  const colOrder = (p, q) => pattern.left ? p.c0 - q.c0 : q.c1 - p.c1;
  rects.sort(preferV ? (p, q) => colOrder(p, q) || rowOrder(p, q) : (p, q) => rowOrder(p, q) || colOrder(p, q));
  return rects;
}
/** 행 [r0,r1) 묶음에서 한 줄에 물릴 수 있는 최대 열 수 */
function maxColsFor(rowPx, r0, r1, limit, maxCabs) {
  let px = 0;
  for (let r = r0; r < r1; r++) px += rowPx[r];
  const maxCols = Math.min(Math.floor(limit / px), Math.floor(maxCabs / (r1 - r0)));
  // 여러 행을 묶어 1열도 한도 안에 넣을 수 없으면 불가능한 후보다.
  // 캐비닛 1장 자체가 한도를 넘는 경우만 1칸으로 남겨 기존 경고를 표시한다.
  return Math.max(r1 - r0 === 1 ? 1 : 0, maxCols);
}

/** 전체 폭을 비슷한 폭의 k개 영역으로 나눈다. */
function balanced(n, k) {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

/** 가로 띠별 분할 개수가 최소가 되도록 연속 행 묶음을 선택한다. */
function partitionByRowBands(rowPx, cols, limit, maxCabs) {
  const R = rowPx.length;
  const cost = Array(R + 1).fill(null);
  const from = Array(R + 1).fill(0);
  cost[0] = { n: 0, sq: 0 };
  for (let i = 1; i <= R; i++) {
    for (let j = 0; j < i; j++) {
      const maxCols = maxColsFor(rowPx, j, i, limit, maxCabs);
      if (maxCols === 0) continue;
      const k = Math.ceil(cols / maxCols);
      const candidate = { n: cost[j].n + k, sq: cost[j].sq + k * (i - j) ** 2 };
      if (!cost[i] || candidate.n < cost[i].n || (candidate.n === cost[i].n && candidate.sq < cost[i].sq)) {
        cost[i] = candidate;
        from[i] = j;
      }
    }
  }
  const rects = [];
  for (let i = R; i > 0; i = from[i]) {
    const j = from[i];
    const k = Math.ceil(cols / maxColsFor(rowPx, j, i, limit, maxCabs));
    let c = 0;
    for (const w of balanced(cols, k)) {
      rects.push({ r0: j, r1: i, c0: c, c1: c + w });
      c += w;
    }
  }
  return rects;
}

/** 세로 띠의 폭을 탐색하고 각 띠를 한도까지 채워 가장 적은 줄 수를 선택한다. */
function partitionByColBands(rowPx, cols, limit, maxCabs) {
  const R = rowPx.length;
  const maxRowPx = Math.max(...rowPx);
  let best = null;
  for (let bands = 1; bands <= cols; bands++) {
    const widths = balanced(cols, bands);
    if (widths[0] > 1 && (widths[0] * maxRowPx > limit || widths[0] > maxCabs)) continue;
    const rects = [];
    let c = 0;
    for (const w of widths) {
      let r = 0;
      while (r < R) {
        let r1 = r + 1;
        let px = rowPx[r] * w;
        while (r1 < R && px + rowPx[r1] * w <= limit && w * (r1 + 1 - r) <= maxCabs) {
          px += rowPx[r1] * w;
          r1++;
        }
        rects.push({ r0: r, r1, c0: c, c1: c + w });
        r = r1;
      }
      c += w;
    }
    if (!best || rects.length <= best.length) best = rects;
  }
  return best;
}
