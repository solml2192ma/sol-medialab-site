import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { config } from '../src/config.js';
import { buildLayout } from '../src/layout.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));
const make = (i, direction, cfg = config) => {
  const input = { cabW: 500, cabH: 500, ...i };
  const res = calc(input, pixel, cfg);
  return { res, lay: buildLayout(res, { direction }, cfg) };
};

// 줄 하나가 빈틈없는 직사각형(ㅁ)인지: 셀들의 bounding box 면적 == 셀 수
function isRectangle(line) {
  const rs = line.cells.map((c) => c.row);
  const cs = line.cells.map((c) => c.col);
  const h = Math.max(...rs) - Math.min(...rs) + 1;
  const w = Math.max(...cs) - Math.min(...cs) + 1;
  return h * w === line.cells.length && new Set(line.cells.map((c) => c.id)).size === line.cells.length;
}

test('모든 LAN 줄은 직사각형(ㅁ)이고, 모든 캐비닛이 정확히 한 번씩 들어가며, 포트 한도를 넘지 않는다', () => {
  const cases = [
    { widthMm: 8000, heightMm: 4000, pitch: '2.6-in', n: 128 },
    { widthMm: 10000, heightMm: 3500, cabH: 1000, pitch: '3.9-in', n: 80 },
    { widthMm: 7000, heightMm: 5000, cabH: 1000, pitch: '3.9-in', n: 70 },
    { widthMm: 8100, heightMm: 3000, pitch: '1.5-in', n: 16 * 6 },
  ];
  for (const { n, ...c } of cases) {
    for (const dir of ['h-zigzag', 'v-zigzag', 'hz-br']) {
      const { res, lay } = make(c, dir);
      const ids = lay.lanLines.flatMap((l) => l.cells.map((x) => x.id)).sort((a, b) => a - b);
      assert.equal(ids.length, res.counts.total, `${JSON.stringify(c)} ${dir}`);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(lay.lanLines.every(isRectangle), `ㅁ 모양 아님: ${JSON.stringify(c)} ${dir}`);
      const limit = config.lan.maxPixelsPerPortByPitch[res.pitchInfo.pitch] ?? config.lan.maxPixelsPerPort;
      assert.ok(lay.lanLines.every((l) => l.pixels <= limit), `포트 한도 초과: ${JSON.stringify(c)} ${dir}`);
    }
  }
});

test('LAN 줄 수는 포트 용량 하한과 같거나 약간 많다 (8000×4000 2.6 → 8줄)', () => {
  const { res, lay } = make({ widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, 'h-zigzag');
  assert.equal(res.lan.ports, 8);
  assert.equal(lay.lanLines.length, 8);
});

test('6000×5500 p1.5: 모든 자동 패턴에서 한도 안의 사각형으로 끊고 전체 캐비닛을 연결한다', () => {
  for (const pattern of PATTERNS) {
    const { res, lay } = make({ widthMm: 6000, heightMm: 5500, pitch: '1.5-in' }, pattern.id);
    assert.deepEqual(lay.warnings, [], pattern.id);
    assert.equal(lay.lanLines.length, 22, pattern.id);
    assert.ok(lay.lanLines.every((line) => !line.over && line.pixels <= lay.limit && isRectangle(line)), pattern.id);
    const assigned = lay.lanLines.flatMap((line) => line.cells.map((cell) => cell.id)).sort((a, b) => a - b);
    assert.deepEqual(assigned, lay.cells.map((cell) => cell.id), pattern.id);
    assert.equal(assigned.length, res.counts.total);
  }
});

test('긴 세로 영역과 장수 제한도 자동 배선에서 한도를 넘는 행 묶음으로 취급하지 않는다', () => {
  const cases = [
    { input: { widthMm: 500, heightMm: 5500, pitch: '1.5-in' }, cfg: config },
    { input: { widthMm: 6000, heightMm: 5500, pitch: '2.6-in' }, cfg: { ...config, lan: { ...config.lan, maxCabinetsPerLine: 3 } } },
    { input: { widthMm: 6000, heightMm: 3500, cabH: 1000, rowPlan: [500, 1000, 1000, 1000], pitch: '3.9-in' }, cfg: { ...config, lan: { ...config.lan, maxCabinetsPerLine: 2 } } },
  ];
  for (const { input, cfg } of cases) {
    for (const pattern of PATTERNS) {
      const { lay } = make(input, pattern.id, cfg);
      assert.deepEqual(lay.warnings, []);
      assert.ok(lay.lanLines.every((line) => !line.over && isRectangle(line)));
      const assigned = lay.lanLines.flatMap((line) => line.cells.map((cell) => cell.id)).sort((a, b) => a - b);
      assert.deepEqual(assigned, lay.cells.map((cell) => cell.id));
    }
  }
});

test('6000×5500 p1.5는 세로 패턴이어도 포트 수를 먼저 줄이고 내부 경로는 패턴을 따른다', () => {
  for (const pattern of PATTERNS.filter((p) => p.axis === 'v')) {
    const { lay } = make({ widthMm: 6000, heightMm: 5500, pitch: '1.5-in' }, pattern.id);
    assert.deepEqual(lay.warnings, [], pattern.id);
    assert.ok(lay.lanLines.every((line) => isRectangle(line) && !line.over));
    for (const line of lay.lanLines) {
      const expected = orderRect(line.rect, pattern).map(([r, c]) => r * lay.cols + c + 1);
      assert.deepEqual(line.cells.map((cell) => cell.id), expected, pattern.id);
    }
  }
});

test('LAN 6000×3500 p2.6 두 제조사: 모든 방향에서 최소 6포트를 우선한다', () => {
  for (const pitch of ['2.6-in', '2.6-flex-in']) {
    for (const pattern of PATTERNS) {
      const { lay } = make({ widthMm: 6000, heightMm: 3500, pitch }, pattern.id);
      assert.deepEqual(lay.warnings, []);
      assert.equal(lay.lanLines.length, 6, pattern.id);
      for (const line of lay.lanLines) {
        assert.ok(isRectangle(line) && !line.over);
        const expected = orderRect(line.rect, pattern).map(([r, c]) => r * lay.cols + c + 1);
        assert.deepEqual(line.cells.map((cell) => cell.id), expected);
      }
      const first = lay.lanLines[0].cells[0];
      assert.equal(first.row, pattern.top ? 0 : lay.rows - 1, pattern.id);
      assert.equal(first.col, pattern.left ? 0 : lay.cols - 1, pattern.id);
      const assigned = lay.lanLines.flatMap((line) => line.cells.map((cell) => cell.id)).sort((a, b) => a - b);
      assert.deepEqual(assigned, lay.cells.map((cell) => cell.id));
    }
  }
});

test('줄당 최대 캐비닛 수를 강제해도 줄은 직사각형', () => {
  const cfg = { ...config, lan: { ...config.lan, maxCabinetsPerLine: 10 } };
  for (const dir of ['h-zigzag', 'v-zigzag']) {
    const { lay } = make({ widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, dir, cfg);
    assert.ok(lay.lanLines.every((l) => l.cells.length <= 10 && isRectangle(l)));
  }
});

test('가로 지그재그: 사각형 안에서 1행 좌→우, 2행 우→좌', () => {
  const { lay } = make({ widthMm: 2000, heightMm: 1000, pitch: '2.6-in' }, 'h-zigzag');
  assert.equal(lay.lanLines.length, 1);
  assert.deepEqual(lay.lanLines[0].cells.map((c) => c.id), [1, 2, 3, 4, 8, 7, 6, 5]);
});

test('세로 지그재그: 사각형 안에서 1열 위→아래, 2열 아래→위', () => {
  const { lay } = make({ widthMm: 1000, heightMm: 1500, pitch: '2.6-in' }, 'v-zigzag');
  assert.deepEqual(lay.lanLines[0].cells.map((c) => c.id), [1, 3, 5, 6, 4, 2]);
});

test('세로 지그재그에서는 세로로 긴 사각형을 우선한다 (한도 때문에 나눠야 할 때)', () => {
  // 1.5피치: 캐비닛 320×320 → 1줄 6장. 3열 × 8행: 세로 띠(3열×2행)면 4줄, 가로 띠도 4줄 → 같으면 방향 우선
  const v = make({ widthMm: 1500, heightMm: 4000, pitch: '1.5-in' }, 'v-zigzag').lay;
  const h = make({ widthMm: 1500, heightMm: 4000, pitch: '1.5-in' }, 'h-zigzag').lay;
  assert.equal(v.lanLines.length, h.lanLines.length);
  assert.ok(v.lanLines[0].rect.c0 === 0 && h.lanLines[0].rect.r0 === 0);
});

test('1000 샘플: POWER는 500×1000을 2장분으로 환산해 20장분 이내로 나눈다', () => {
  const a = make({ widthMm: 10000, heightMm: 3500, cabH: 1000, pitch: '3.9-in' }, 'h-zigzag');
  assert.equal(a.lay.lanLines.length, 4);
  assert.equal(a.lay.powerChains.length, 7);
  assert.equal(a.lay.powerChains.length, a.res.power.ports);
  const b = make({ widthMm: 7000, heightMm: 5000, cabH: 1000, pitch: '3.9-in' }, 'h-zigzag');
  assert.equal(b.res.lan.ports, 4); // 용량만으로 계산한 하한
  assert.equal(b.lay.lanLines.length, 4); // LAN는 포트 수 최소화 우선.
  assert.ok(b.lay.powerChains.length >= b.res.power.ports);
  assert.ok(b.lay.powerChains.every((ch) => ch.cells.length <= 10));
});

test('가로 전체가 한도를 넘으면 선택한 시작점에서 한도 안의 사각형으로 분할한다', () => {
  for (const pattern of PATTERNS.filter((p) => p.axis === 'h')) {
    const { res, lay } = make({ widthMm: 12000, heightMm: 1000, pitch: '2.6-in' }, pattern.id);
    assert.deepEqual(lay.warnings, []);
    const first = lay.lanLines[0];
    assert.ok(first.cells.length <= res.lan.maxCabinetsPerLine);
    assert.equal(first.cells[0].col, pattern.left ? 0 : lay.cols - 1);
    assert.equal(first.cells[0].row, pattern.top ? 0 : lay.rows - 1);
    assert.ok(lay.lanLines.every((line) => !line.over && isRectangle(line)));
  }
});

test('POWER 16장은 한 포트로 연결한다', () => {
  const { lay } = make({ widthMm: 8000, heightMm: 500, pitch: '2.6-in' }, 'h-zigzag');
  assert.equal(lay.powerChains.length, 1);
  assert.equal(lay.powerChains[0].cells.length, 16);
});

// ---------- 배선 패턴 / 직접 배선 ----------
test('POWER는 방향을 우선하고 가로 24열은 12열씩 균등 배분한다', () => {
  const { res } = make({ widthMm: 12000, heightMm: 1500, pitch: '2.6-in' }, 'hz-tl');
  for (const p of PATTERNS) {
    const lay = buildLayout(res, { pattern: p.id, powerPattern: p.id });
    for (const lines of [lay.powerChains]) {
      const first = lines[0];
      assert.ok(isRectangle(first));
      assert.equal(first.rect.c1 - first.rect.c0, p.axis === 'h' ? 12 : 6, p.id);
      assert.equal(first.rect.r1 - first.rect.r0, p.axis === 'h' ? 1 : 3, p.id);
      assert.equal(first.cells[0].row, p.top ? 0 : lay.rows - 1);
      assert.equal(first.cells[0].col, p.left ? 0 : lay.cols - 1);
    }
  }
});

test('같은 화면에서 LAN는 최소 포트 수, POWER는 방향 우선으로 독립 적용한다', () => {
  const { res } = make({ widthMm: 6000, heightMm: 3500, pitch: '2.6-in' }, 'hz-tl');
  const horizontal = buildLayout(res, { pattern: 'hz-tl', powerPattern: 'hz-tl' });
  const verticalPower = buildLayout(res, { pattern: 'hz-tl', powerPattern: 'vz-tl' });
  const verticalLan = buildLayout(res, { pattern: 'vz-tl', powerPattern: 'hz-tl' });
  assert.equal(horizontal.lanLines.length, 6);
  assert.equal(verticalLan.lanLines.length, 6);
  assert.equal(horizontal.powerChains.length, 7);
  assert.equal(verticalPower.powerChains.length, 6);
  assert.deepEqual(horizontal.lanLines, verticalPower.lanLines);
  assert.deepEqual(horizontal.powerChains, verticalLan.powerChains);
});

test('POWER 세로 패턴은 세로 30장을 15장씩 균등 분할한다', () => {
  const { res } = make({ widthMm: 1500, heightMm: 15000, pitch: '3.9-in' }, 'hz-tl');
  for (const p of PATTERNS.filter((p) => p.axis === 'v')) {
    const lay = buildLayout(res, { powerPattern: p.id });
    assert.equal(lay.powerChains[0].cells.length, 15);
    assert.equal(lay.powerChains[0].rect.r1 - lay.powerChains[0].rect.r0, 15);
    assert.equal(lay.powerChains[0].rect.c1 - lay.powerChains[0].rect.c0, 1);
  }
});

test('POWER 자동: 모든 패턴과 혼합 규격에서 포트당 환산 20장분 이하로 전체를 한 번씩 연결한다', () => {
  for (const cabH of [500, 1000]) {
    const { res } = make({ widthMm: 12000, heightMm: 3500, cabH, pitch: '3.9-in' }, 'hz-tl');
    for (const p of PATTERNS) {
      const lay = buildLayout(res, { pattern: 'hz-tl', powerPattern: p.id });
      assert.ok(lay.powerChains.every((ch) => ch.cells.reduce((sum, c) => sum + c.w * c.h / (500 * 500), 0) <= 20));
      const ids = lay.powerChains.flatMap((ch) => ch.cells.map((c) => c.id)).sort((a, b) => a - b);
      assert.deepEqual(ids, lay.cells.map((c) => c.id));
      for (const ch of lay.powerChains) {
        assert.deepEqual(ch.cells.map((c) => c.id), orderRect(ch.rect, p).map(([r, c]) => r * lay.cols + c + 1));
      }
    }
  }
});

test('500×1000 11장은 자동에서 분할하고 직접 배선에서는 한 포트에 허용한다', () => {
  const { res } = make({ widthMm: 5500, heightMm: 1000, cabH: 1000, pitch: '3.9-in' }, 'hz-tl');
  const auto = buildLayout(res, {});
  assert.equal(auto.powerChains.length, 2);
  assert.ok(auto.powerChains.every((ch) => ch.cells.length <= 10));
  const manual = buildLayout(res, { powerManual: [{ r0: 0, r1: 1, c0: 0, c1: 11, p: 'hz-tl', n: 1 }] });
  assert.equal(manual.powerChains.length, 1);
  assert.equal(manual.powerChains[0].cells.length, 11);
  assert.equal(manual.powerChains[0].over, false);
});

test('POWER 직접: 20장분 초과 경고는 배선을 유지하며 경계값·피치·설정 기준을 따른다', () => {
  for (const pitch of ['1.5-in', '3.9-in']) {
    const { res } = make({ widthMm: 10500, heightMm: 500, pitch }, 'hz-tl');
    const segment = { r0: 0, r1: 1, c0: 0, c1: 20, p: 'hz-tl', n: 4 };
    assert.deepEqual(buildLayout(res, { powerManual: [segment] }).powerLoadWarnings, []);
    const lay = buildLayout(res, { powerManual: [{ ...segment, c1: 21 }] });
    assert.deepEqual(lay.powerLoadWarnings, ['POWER 4: 500×500 기준 20장분을 넘었습니다. 배선은 유지됩니다.']);
    assert.equal(lay.powerChains[0].cells.length, 21);
    assert.equal(lay.powerChains[0].over, false);
    assert.deepEqual(buildLayout(res, {}).powerLoadWarnings, []);
    assert.deepEqual(buildLayout(res, { powerManual: [] }).powerLoadWarnings, []);
    const cfg = { ...config, power: { ...config.power, autoMaxCabinetsPerPort: 21 } };
    assert.deepEqual(buildLayout(res, { powerManual: [{ ...segment, c1: 21 }] }, cfg).powerLoadWarnings, []);
  }
});

test('POWER 경고는 혼합 규격·동일 포트의 구간을 합산하고 덮어쓴 칸과 빈 칸은 제외한다', () => {
  const { res } = make({ widthMm: 5500, heightMm: 1500, cabH: 1000, pitch: '3.9-in' }, 'hz-tl');
  const top = { r0: 0, r1: 1, c0: 0, c1: 1, p: 'hz-tl', n: 7 };
  const bottom = { r0: 1, r1: 2, c0: 0, c1: 10, p: 'hz-tl', n: 7 };
  assert.equal(buildLayout(res, { powerManual: [top, bottom] }).powerLoadWarnings.length, 1); // 1 + 10×2
  const overwritten = buildLayout(res, { powerManual: [top, bottom, { ...top, n: 8 }] });
  assert.deepEqual(overwritten.powerLoadWarnings, []); // POWER 7=20, POWER 8=1
  const sparse = buildLayout(res, { powerManual: [top, { ...bottom, c0: 10, c1: 11 }] });
  assert.deepEqual(sparse.powerLoadWarnings, []); // 사각형 면적 대신 실제 연결한 3장분
  const fullBottom = { ...bottom, c1: 11 };
  assert.equal(buildLayout(res, { powerManual: [fullBottom] }).powerLoadWarnings.length, 1); // 1000 규격 11장=22장분
});

test('POWER 직접: 20장과 LAN 픽셀 한도를 넘어도 허용하고 LAN 배선은 유지한다', () => {
  const { res } = make({ widthMm: 6000, heightMm: 4000, pitch: '1.5-in' }, 'hz-tl');
  const auto = buildLayout(res, { pattern: 'hz-tl' });
  const segment = { r0: 0, r1: 4, c0: 0, c1: 12, p: 'vz-br', n: 7 };
  const lay = buildLayout(res, { pattern: 'hz-tl', powerPattern: 'vz-br', powerManual: [segment] });
  assert.deepEqual(lay.lanLines, auto.lanLines);
  assert.equal(lay.powerChains.length, 1);
  assert.equal(lay.powerChains[0].cells.length, 48);
  assert.equal(lay.powerChains[0].id, 7);
  assert.equal(lay.powerChains[0].over, false);
  assert.equal(lay.powerUncovered.length, 48);
  assert.deepEqual(lay.powerAlive, [0]);
  assert.equal(limitError(buildLayout(res, { manual: [segment] }), 7)?.title, 'LAN 7: 한 포트 한도를 넘습니다.');
});

test('POWER 직접: 같은 번호 이어그리기·겹침·빈 상태는 LAN와 독립적으로 유지한다', () => {
  const { res } = make({ widthMm: 6000, heightMm: 4000, pitch: '3.9-in' }, 'hz-tl');
  const one = { r0: 0, r1: 2, c0: 0, c1: 4, p: 'hz-tl', n: 5 };
  const two = { ...one, r0: 2, r1: 4 };
  const lay = buildLayout(res, { manual: [], powerManual: [one, two] });
  assert.equal(lay.lanLines.length, 0);
  assert.equal(lay.powerChains[0].parts.length, 2);
  assert.equal(lay.powerChains[0].cells.length, 16);
  const overwritten = buildLayout(res, { powerManual: [one, { ...one, n: 9 }] });
  assert.deepEqual(overwritten.powerAlive, [1]);
  assert.equal(overwritten.powerChains[0].id, 9);
  assert.equal(buildLayout(res, { powerManual: [] }).powerChains.length, 0);
});

import { PATTERNS, orderRect, patternOf, encodeManual, decodeManual, nextFreeNumber, limitError } from '../src/layout.js';

const R = { r0: 0, r1: 2, c0: 0, c1: 3 }; // 2행 × 3열
const ids = (pat) => orderRect(R, patternOf(pat)).map(([r, c]) => r * 3 + c + 1);

test('패턴 8종의 이동 순서 (2행×3열, 번호는 행 우선 1~6)', () => {
  assert.deepEqual(ids('hz-tl'), [1, 2, 3, 6, 5, 4]);
  assert.deepEqual(ids('hz-tr'), [3, 2, 1, 4, 5, 6]);
  assert.deepEqual(ids('hz-bl'), [4, 5, 6, 3, 2, 1]);
  assert.deepEqual(ids('hz-br'), [6, 5, 4, 1, 2, 3]);
  assert.deepEqual(ids('vz-tl'), [1, 4, 5, 2, 3, 6]);
  assert.deepEqual(ids('vz-tr'), [3, 6, 5, 2, 1, 4]);
  assert.deepEqual(ids('vz-bl'), [4, 1, 2, 5, 6, 3]);
  assert.deepEqual(ids('vz-br'), [6, 3, 2, 5, 4, 1]);
  assert.equal(PATTERNS.length, 8);
});

test('모든 패턴: 영역 안의 모든 칸을 정확히 한 번씩, 이웃 칸으로만 이동', () => {
  for (const p of PATTERNS) {
    const seq = orderRect({ r0: 1, r1: 4, c0: 2, c1: 6 }, p);
    assert.equal(new Set(seq.map(([r, c]) => `${r},${c}`)).size, 12, p.id);
    for (let i = 1; i < seq.length; i++) {
      const d = Math.abs(seq[i][0] - seq[i - 1][0]) + Math.abs(seq[i][1] - seq[i - 1][1]);
      assert.equal(d, 1, `${p.id} step ${i}`);
    }
  }
});

test('자동 배선도 선택한 패턴(시작 모서리)을 따른다', () => {
  const { lay } = make({ widthMm: 1500, heightMm: 1000, pitch: '2.6-in' }, 'hz-br');
  assert.deepEqual(lay.lanLines[0].cells.map((c) => c.id), [6, 5, 4, 1, 2, 3]);
});

const input28 = { widthMm: 2000, heightMm: 1000, pitch: '2.6-in' }; // 4열 × 2행 = 8장
test('직접 배선: 드래그한 사각형이 줄이 되고, 나중에 그린 줄이 겹친 칸을 가져간다', () => {
  const res = calc({ cabW: 500, cabH: 500, ...input28 }, pixel);
  const lay = buildLayout(res, { manual: [{ r0: 0, r1: 2, c0: 0, c1: 2, p: 'vz-tl' }, { r0: 0, r1: 2, c0: 1, c1: 4, p: 'hz-tl' }] });
  assert.equal(lay.manual, true);
  assert.deepEqual(lay.lanLines[0].cells.map((c) => c.id), [1, 5]); // 2,6번은 2번 줄이 가져감
  assert.deepEqual(lay.lanLines[1].cells.map((c) => c.id), [2, 3, 4, 8, 7, 6]);
  assert.deepEqual(lay.uncovered, []);
});

test('직접 배선: 연결 안 된 캐비닛과 포트 한도 초과를 경고', () => {
  const res = calc({ cabW: 500, cabH: 500, widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, pixel);
  const lay = buildLayout(res, { manual: [{ r0: 0, r1: 2, c0: 0, c1: 16, p: 'hz-tl' }] }); // 32장 > 17장 한도
  assert.equal(lay.lanLines[0].over, true);
  assert.equal(lay.uncovered.length, 128 - 32);
  assert.ok(lay.warnings.some((w) => w.includes('한도')));
  assert.ok(lay.warnings.some((w) => w.includes('96장')));
});

test('직접 배선: 범위를 벗어난 줄은 무시, 빈 목록이면 전부 미연결', () => {
  const res = calc({ cabW: 500, cabH: 500, ...input28 }, pixel);
  assert.equal(buildLayout(res, { manual: [{ r0: 0, r1: 9, c0: 0, c1: 2, p: 'hz-tl' }] }).lanLines.length, 0);
  assert.equal(buildLayout(res, { manual: [] }).uncovered.length, 8);
});

test('직접 배선 줄 문자열 인코딩 왕복', () => {
  const lines = [{ r0: 0, c0: 1, r1: 3, c1: 5, p: 'vz-br', n: 3 }, { r0: 2, c0: 0, r1: 4, c1: 2, p: 'hz-bl', n: 1 }];
  assert.deepEqual(decodeManual(encodeManual(lines)), lines);
  assert.deepEqual(decodeManual('1.2.x.4.hz-tl~bad~0.0.1.1.nope'), []);
  assert.deepEqual(decodeManual(''), []);
});

test('삭제된 한 방향 패턴 이름은 알 수 없는 패턴으로 무시된다', () => {
  assert.deepEqual(decodeManual('0.0.2.2.h1-tl~0.0.2.2.v1-tl'), []);
  assert.equal(patternOf('h1-tl').id, 'hz-tl'); // 저장된 값은 기본 패턴으로 대체
});

// ---------- LAN 포트 번호 ----------
const grid44 = () => calc({ cabW: 500, cabH: 500, widthMm: 2000, heightMm: 2000, pitch: '2.6-in' }, pixel);
const L = (r0, c0, r1, c1, n) => ({ r0, c0, r1, c1, p: 'hz-tl', n });

test('LAN 번호는 줄에 고정: 가운데 줄을 지워도 나머지 번호가 바뀌지 않는다', () => {
  const lines = [L(0, 0, 1, 4, 1), L(1, 0, 2, 4, 2), L(2, 0, 3, 4, 3), L(3, 0, 4, 4, 4)];
  const before = buildLayout(grid44(), { manual: lines }).lanLines.map((l) => l.id);
  assert.deepEqual(before, [1, 2, 3, 4]);
  const after = buildLayout(grid44(), { manual: lines.filter((l) => l.n !== 2) }).lanLines.map((l) => l.id);
  assert.deepEqual(after, [1, 3, 4]); // 3번이 2번으로 당겨지지 않음
  // 지운 뒤 새로 그리면 비어 있는 가장 작은 번호
  assert.equal(nextFreeNumber(lines.filter((l) => l.n !== 2)), 2);
  assert.equal(nextFreeNumber([]), 1);
});

test('LAN 번호를 직접 바꾸면 그 줄만 바뀌고 번호순으로 표시된다', () => {
  const lines = [L(0, 0, 1, 4, 1), L(1, 0, 2, 4, 2), L(2, 0, 3, 4, 3)];
  lines[0].n = 7;
  const lay = buildLayout(grid44(), { manual: lines });
  assert.deepEqual(lay.lanLines.map((l) => l.id), [2, 3, 7]);
  assert.equal(lay.lanLines[2].cells[0].id, 1); // 7번 = 맨 윗줄 (1~4번 캐비닛)
});

test('같은 번호의 항목은 한 LAN의 구간들: 그린 순서대로 이어진다', () => {
  // 8000x4000(16열x8행) 예시: 1열을 아래→위로(113→1), 이어서 2열을 아래→위로(114→2). 둘 다 LAN 1
  const res = calc({ cabW: 500, cabH: 500, widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, pixel);
  const seg = (c0) => ({ r0: 0, r1: 8, c0, c1: c0 + 1, p: 'vz-bl', n: 1 });
  const lay = buildLayout(res, { manual: [seg(0), seg(1)] });
  assert.equal(lay.lanLines.length, 1);
  const line = lay.lanLines[0];
  assert.equal(line.id, 1);
  assert.equal(line.parts.length, 2);
  assert.deepEqual(line.cells.map((c) => c.id).slice(0, 9), [113, 97, 81, 65, 49, 33, 17, 1, 114]);
  assert.equal(line.cells.length, 16);
  assert.deepEqual(lay.alive, [0, 1]);
  // 다른 번호로 그리면 별도 LAN
  const two = buildLayout(res, { manual: [seg(0), { ...seg(1), n: 2 }] });
  assert.deepEqual(two.lanLines.map((l) => l.id), [1, 2]);
});

test('나중 구간이 앞 구간을 완전히 덮으면 그 구간은 alive에서 빠진다', () => {
  const res = calc({ cabW: 500, cabH: 500, widthMm: 2000, heightMm: 1000, pitch: '2.6-in' }, pixel);
  const lay = buildLayout(res, { manual: [L(0, 0, 1, 2, 1), L(0, 0, 2, 4, 2)] });
  assert.deepEqual(lay.alive, [1]);
  assert.deepEqual(lay.lanLines.map((l) => l.id), [2]);
});

test('번호 없는 옛 저장 데이터는 비어 있는 번호를 순서대로 배정', () => {
  const lines = decodeManual('0.0.1.4.hz-tl~1.0.2.4.hz-tl.1~2.0.3.4.hz-tl');
  assert.deepEqual(lines.map((l) => l.n), [2, 1, 3]);
});

test('같은 개수라면 패턴 방향에 맞는 모양: 가로 패턴은 가로로 긴 사각형, 세로 패턴은 세로로 긴 사각형', () => {
  const dims = (lay) => lay.lanLines.map((l) => [l.rect.r1 - l.rect.r0, l.rect.c1 - l.rect.c0]);
  const h = make({ widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, 'hz-tl').lay;
  assert.equal(h.lanLines.length, 8);
  assert.ok(dims(h).every(([hh, ww]) => hh === 1 && ww === 16));
  const v = make({ widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, 'vz-tl').lay;
  assert.equal(v.lanLines.length, 8);
  assert.ok(dims(v).every(([hh, ww]) => hh === 8 && ww === 2));
});

test('같은 번호가 여러 항목에 있어도 정리하지 않고 그대로 읽는다 (구간)', () => {
  const lines = decodeManual('0.0.1.4.hz-tl.2~1.0.2.4.hz-tl.2~2.0.3.4.hz-tl.3');
  assert.deepEqual(lines.map((l) => l.n), [2, 2, 3]);
});

test('포트 한도 초과 판정: 한도 안이면 null, 넘으면 LAN 번호가 들어간 오류 메시지', () => {
  const res = calc({ cabW: 500, cabH: 500, widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, pixel); // 줄당 17장
  const ok = buildLayout(res, { manual: [{ r0: 0, r1: 1, c0: 0, c1: 16, p: 'hz-tl', n: 1 }] }); // 16장
  assert.equal(limitError(ok, 1), null);
  assert.equal(limitError(ok, 9), null); // 없는 번호
  const bad = buildLayout(res, { manual: [{ r0: 0, r1: 2, c0: 0, c1: 16, p: 'hz-tl', n: 3 }] }); // 32장
  const err = limitError(bad, 3);
  assert.equal(err.title, 'LAN 3: 한 포트 한도를 넘습니다.');
  assert.equal(err.detail, '영역을 줄이거나 다른 LAN 번호로 나누어 그려 주세요.');
  for (const bad of ['픽셀', '650', '장 /', '최대']) assert.ok(!(err.title + err.detail).includes(bad), `오류 문구에 '${bad}'를 노출하지 않는다`);
  assert.ok(bad.warnings.some((w) => w === 'LAN 3: 한 포트 한도를 넘습니다.'));
});

test('같은 LAN에 구간을 이어 그려 한도를 넘는 순간 판정된다', () => {
  const res = calc({ cabW: 500, cabH: 500, widthMm: 8000, heightMm: 4000, pitch: '2.6-in' }, pixel);
  const seg = (r) => ({ r0: r, r1: r + 1, c0: 0, c1: 10, p: 'hz-tl', n: 1 }); // 10장씩
  assert.equal(limitError(buildLayout(res, { manual: [seg(0)] }), 1), null);
  assert.ok(limitError(buildLayout(res, { manual: [seg(0), seg(1)] }), 1)); // 20장 > 17장
});

test('7000×3500 p3.9: LAN 2의 36번 확장은 사각형 환산으로 허용, 37번 확장은 차단한다', () => {
  const res = calc({ cabW: 500, cabH: 1000, widthMm: 7000, heightMm: 3500, pitch: '3.9-in' }, pixel);
  const initial = [
    { r0: 0, r1: 3, c0: 7, c1: 14, p: 'hz-tr', n: 1 },
    { r0: 0, r1: 3, c0: 0, c1: 7, p: 'hz-tr', n: 2 },
    { r0: 3, r1: 4, c0: 0, c1: 14, p: 'hz-tr', n: 3 },
  ];
  const with36 = [...initial, { r0: 2, r1: 3, c0: 7, c1: 8, p: 'hz-tr', n: 2 }];
  const ok = buildLayout(res, { manual: with36 });
  assert.equal(ok.lanLines.find((l) => l.id === 2).pixels, 1024 * 640);
  assert.equal(limitError(ok, 2), null);
  const with37 = [...with36, { r0: 2, r1: 3, c0: 8, c1: 9, p: 'hz-tr', n: 2 }];
  const bad = buildLayout(res, { manual: with37 });
  const line = bad.lanLines.find((l) => l.id === 2);
  assert.equal(line.cells.reduce((total, cell) => total + cell.pixels, 0), 638976); // 실제 연결 칸만 더하면 한도 안
  assert.equal(line.pixels, 1152 * 640); // 가로 4500 × 세로 2500 전체 사각형
  assert.equal(limitError(bad, 2).title, 'LAN 2: 한 포트 한도를 넘습니다.');
  assert.deepEqual(bad.lanLines.map((l) => l.id), [1, 2, 3]);
});

test('떨어진 구간 사이의 빈 칸도 사각형 환산 한도와 강제 장수 제한에 포함한다', () => {
  const res = grid44();
  const lines = [L(0, 0, 1, 1, 7), L(3, 3, 4, 4, 7)];
  const cfg = { ...config, lan: { ...config.lan, maxCabinetsPerLine: 10 } };
  const lay = buildLayout(res, { manual: lines }, cfg);
  const line = lay.lanLines[0];
  assert.equal(line.cells.length, 2);
  assert.equal(line.pixels, res.pixel.mainCab.w * res.pixel.mainCab.h * 16);
  assert.ok(limitError(lay, 7));
});
