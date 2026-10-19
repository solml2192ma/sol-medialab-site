// 엑셀 '라인.xlsx' / '역삼멀티캠퍼스 라인.xlsx'의 캐시된 값과 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { config } from '../src/config.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));
const run = (i) => calc({ cabW: 500, cabH: 500, ...i }, pixel);

test('엑셀 500시트: 8000×4000 / 500×500 / 2.6', () => {
  const r = run({ widthMm: 8000, heightMm: 4000, pitch: 2.6, bays: 3, tiers: 2 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.grid.cols, 16); // C13
  assert.equal(r.grid.mainRows, 8); // D13
  assert.equal(r.counts.total, 128); // E13
  assert.equal(r.pixel.mainCab.w, 192); // C14
  assert.equal(r.pixel.resolution.w, 3072); // C15
  assert.equal(r.pixel.resolution.h, 1536); // D15
  assert.ok(Math.abs(r.lan.capacityCabs - 17.63237847222222) < 1e-9); // C16
  assert.equal(r.lan.maxCabinetsPerLine, 17);
  const b = r.boxes[0];
  assert.deepEqual([b.need, b.perBox, b.boxes, b.packQty], [128, 12, 11, 132]); // Z,AA,AC,AD
  const s = r.scaffold;
  assert.equal(s.widthM, 5.4); // M11
  assert.equal(s.heightM, 3.4); // M12
  assert.equal(s.posts, 8); // M13
  assert.equal(s.shortPosts, 0); // 엑셀 R13=4지만 3.4m+0.9m가 LED 4m를 넘어 끼우지 않음
  assert.equal(s.pins, 8); // M14
  assert.equal(s.xBars, 12); // M15
});

test('아시바 발판: 사용자 규칙(칸×단). 엑셀 M16(칸×(단-1))과 의도적으로 다름', () => {
  const one = run({ widthMm: 1800, heightMm: 1700, pitch: 2.6, bays: 1, tiers: 1 });
  assert.deepEqual(
    [one.scaffold.posts, one.scaffold.xBars, one.scaffold.planks, one.scaffold.widthM, one.scaffold.heightM],
    [2, 2, 1, 1.8, 1.7],
  );
  const wide = run({ widthMm: 3600, heightMm: 1700, pitch: 2.6, bays: 2, tiers: 1 }); // 기둥3 x바4 발판2, 3.6×1.7
  assert.deepEqual([wide.scaffold.posts, wide.scaffold.xBars, wide.scaffold.planks, wide.scaffold.widthM], [3, 4, 2, 3.6]);
  const tall = run({ widthMm: 1800, heightMm: 3400, pitch: 2.6, bays: 1, tiers: 2 }); // 기둥4 핀4 발판2 x바4
  assert.deepEqual([one.errors, wide.errors, tall.errors], [[], [], []]);
  assert.deepEqual([tall.scaffold.posts, tall.scaffold.pins, tall.scaffold.planks, tall.scaffold.xBars], [4, 4, 2, 4]);
});

test('아시바 자동 산출: LED보다 절대 커지지 않고, 남는 높이는 짧은아시바로 채움', () => {
  // LED 높이 3000: 1단 1700, 2단 3400은 초과 → 1단 + 짧은아시바 = 2600
  const r = run({ widthMm: 8000, heightMm: 3000, pitch: 2.6 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.scaffold.bays, 4); // 7.2m ≤ 8m
  assert.equal(r.scaffold.widthM, 7.2);
  assert.equal(r.scaffold.tiers, 1);
  assert.equal(r.scaffold.heightM, 2.6);
  assert.equal(r.scaffold.shortPosts, 5); // 기둥 5개 위에 1개씩
  // 3400이면 2단이 딱 맞고 짧은아시바 불필요
  const r2 = run({ widthMm: 8000, heightMm: 3400, pitch: 2.6 });
  assert.deepEqual([r2.scaffold.tiers, r2.scaffold.shortPosts, r2.scaffold.heightM], [2, 0, 3.4]);
});

test('아시바 윗단 발판은 선택사항', () => {
  const on = run({ widthMm: 5400, heightMm: 3400, pitch: 2.6, bays: 3, tiers: 2, topPlank: true });
  const off = run({ widthMm: 5400, heightMm: 3400, pitch: 2.6, bays: 3, tiers: 2, topPlank: false });
  assert.deepEqual([on.scaffold.planks, off.scaffold.planks], [6, 3]); // 엑셀 M16 = 3
});

test('직접 지정한 아시바가 LED보다 크면 오류', () => {
  const r = run({ widthMm: 5000, heightMm: 3000, pitch: 2.6, bays: 3, tiers: 2 });
  assert.equal(r.errors.length, 2); // 5.4m > 5m, 3.4m > 3m
});

test('엑셀 1000시트: 10000×3500 / 500×1000 / 3.9 (1000+500 혼합)', () => {
  const r = run({ widthMm: 10000, heightMm: 3500, cabH: 1000, pitch: '3.9-in' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.grid.cols, 20);
  assert.equal(r.grid.mainRows, 3);
  assert.equal(r.grid.fillerRows, 1);
  assert.deepEqual([r.pixel.mainCab.w, r.pixel.mainCab.h], [128, 256]); // C10, D10
  assert.equal(r.pixel.resolution.w, 2560); // C11
  assert.equal(r.pixel.resolution.h, 896); // D11
  assert.ok(Math.abs(r.lan.capacityCabs - 656000 / (128 * 256)) < 1e-9); // C12
  const [main, filler] = r.boxes;
  assert.deepEqual([main.need, main.perBox, main.boxes, main.packQty], [60, 7, 9, 63]);
  assert.deepEqual([filler.need, filler.perBox, filler.boxes, filler.packQty], [20, 14, 2, 28]);
  assert.equal(r.lan.ports, 4); // 엑셀 롱랜선 = 4
  assert.equal(r.power.ports, 7); // 500×500 환산 140장분 / 20
});

test('역삼멀티캠퍼스: 7000×5000 / 500×1000 / 3.9', () => {
  const r = run({ widthMm: 7000, heightMm: 5000, cabH: 1000, pitch: '3.9-in' });
  assert.equal(r.counts.total, 70);
  assert.equal(r.boxes.length, 1); // 500 보충 줄 없음
  assert.deepEqual([r.boxes[0].boxes, r.boxes[0].packQty], [10, 70]);
  assert.ok(Math.abs(r.lan.capacityCabs - 656000 / (128 * 256)) < 1e-9);
  assert.equal(r.lan.ports, 4); // 엑셀 롱랜선 = 4
  assert.equal(r.power.ports, 7); // 500×1000 70장 = 140장분 / 20
});

test('8000×4000 / 500×500 : 피치별 해상도·1port·박스', () => {
  // [피치, 캐비닛 픽셀, 1port, 박스, 포장수량]  (128장 ÷ 1박스수량, 올림)
  const cases = [
    [1.5, 320, 650000 / (320 * 320), 10, 140],
    [2.6, 192, 650000 / (192 * 192), 11, 132],
    [3.9, 128, 656000 / (128 * 128), 10, 140], // 3.9피치만 65.6만,
    [4.8, 104, 650000 / (104 * 104), 10, 140], // 아웃도어 14장/박스
  ];
  for (const [pitch, px, port, boxes, pack] of cases) {
    const r = run({ widthMm: 8000, heightMm: 4000, pitch });
    assert.equal(r.pixel.mainCab.w, px, `pitch ${pitch}`);
    assert.equal(r.pixel.resolution.w, 16 * px);
    assert.ok(Math.abs(r.lan.capacityCabs - port) < 1e-9);
    assert.deepEqual([r.boxes[0].boxes, r.boxes[0].packQty], [boxes, pack], `pitch ${pitch}`);
    assert.equal(r.errors.length, boxes == null ? 1 : 0);
  }
});

test('사용자가 확정한 피치·캐비닛별 1박스 수량으로 출고수량을 계산한다', () => {
  for (const [pitch, cabH, expected] of [
    ['1.5-in', 500, 14], ['2.6-in', 500, 12], ['2.6-flex-in', 500, 14],
    ['3.9-in', 500, 14], ['3.9-in', 1000, 7], ['3.9-out', 1000, 12], ['4.8-out', 500, 14],
  ]) {
    const r = run({ widthMm: 2500, heightMm: 2000, cabH, pitch });
    const box = r.boxes.find((b) => b.cabinet === `500x${cabH}`);
    assert.equal(box.perBox, expected, pitch);
    assert.equal(box.boxes, Math.ceil(box.need / expected), pitch);
    assert.equal(box.packQty, box.boxes * expected, pitch);
  }
});

test('1000 규격 박스가 없는 피치는 오류', () => {
  const r = run({ widthMm: 8000, heightMm: 4000, cabH: 1000, pitch: 2.6 });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /1박스 수량/);
});

test('직접 입력 캐비닛은 박스 수량을 입력받아 사용', () => {
  const r = calc({ widthMm: 4800, heightMm: 3375, cabW: 600, cabH: 337.5, pitch: 2.6, boxQty: 8 }, pixel);
  assert.deepEqual(r.errors, []);
  assert.equal(r.counts.total, 80);
  assert.equal(r.boxes[0].boxes, 10);
});

test('나누어떨어지지 않으면 경고, 설정으로 줄당 최대 캐비닛 수 강제', () => {
  const r = calc(
    { widthMm: 8100, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 },
    pixel,
    { ...config, lan: { maxPixelsPerPort: 650000, maxCabinetsPerLine: 10 } },
  );
  assert.equal(r.warnings.length, 1);
  assert.equal(r.lan.maxCabinetsPerLine, 10);
});

test('3.9 인도어/아웃도어는 해상도·포트한도는 같고, 아웃도어 박스 수량은 미정(오류 안내)', () => {
  const inn = run({ widthMm: 8000, heightMm: 4000, pitch: '3.9-in' });
  const out = run({ widthMm: 8000, heightMm: 4000, pitch: '3.9-out' });
  assert.equal(out.pitchInfo.label, 'P3.9 outdoor ABSEN');
  assert.equal(out.pixel.resolution.w, inn.pixel.resolution.w);
  assert.ok(Math.abs(out.lan.capacityCabs - 656000 / (128 * 128)) < 1e-9); // 3.9는 인/아웃 모두 65.6만
  assert.equal(inn.errors.length, 0);
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /P3\.9 outdoor ABSEN/);
  assert.equal(out.boxes[0].boxes, null);
});

test('p2.6 flexible WISDOM: 기존 p2.6 바로 아래, 500 규격 14장/박스, 기존 p2.6 선택 유지', () => {
  const ids = Object.keys(pixel.pitches);
  assert.equal(ids[ids.indexOf('2.6-in') + 1], '2.6-flex-in');
  const input = { widthMm: 8000, heightMm: 4000 };
  const flexible = run({ ...input, pitch: '2.6-flex-in' });
  const original = run({ ...input, pitch: 2.6 });
  assert.deepEqual(flexible.errors, []);
  assert.equal(flexible.pitchInfo.label, 'P2.6 indoor flexible WISDOM');
  assert.deepEqual(flexible.pixel, original.pixel);
  assert.deepEqual(flexible.lan, original.lan);
  assert.deepEqual([flexible.boxes[0].need, flexible.boxes[0].perBox, flexible.boxes[0].boxes, flexible.boxes[0].packQty], [128, 14, 10, 140]);
  assert.equal(original.pitchInfo.id, '2.6-in');
  assert.equal(original.boxes[0].perBox, 12);
  const tall = run({ ...input, cabH: 1000, pitch: '2.6-flex-in' });
  assert.equal(tall.boxes[0].perBox, null);
  assert.match(tall.errors[0], /1박스 수량/);
});

test('피치를 숫자로 주면(구버전 URL) 해당 피치의 첫 항목(인도어)으로 처리', () => {
  assert.equal(run({ widthMm: 8000, heightMm: 4000, pitch: 3.9 }).pitchInfo.id, '3.9-in');
  assert.equal(run({ widthMm: 8000, heightMm: 4000, pitch: '2.6' }).pitchInfo.id, '2.6-in');
});

test('LED가 캐비닛보다 작거나 너무 크면 예외 없이 오류 메시지', () => {
  const tiny = run({ widthMm: 100, heightMm: 100, pitch: '2.6-in' });
  assert.equal(tiny.errors.length, 1);
  assert.match(tiny.errors[0], /작습니다/);
  assert.equal(tiny.grid, undefined);
  const noRow = run({ widthMm: 8000, heightMm: 300, pitch: '2.6-in' });
  assert.match(noRow.errors[0], /작습니다/);
  const huge = run({ widthMm: 5000000, heightMm: 4000, pitch: '2.6-in' });
  assert.match(huge.errors[0], /너무 많습니다/);
  // 높이가 500 미만이어도 500 보충 줄이 생기는 1000 캐비닛은 정상
  const filler = run({ widthMm: 1000, heightMm: 500, cabH: 1000, pitch: '3.9-in' });
  assert.equal(filler.counts.total, 2);
  assert.ok(!filler.errors.some((e) => e.includes('작습니다')));
});
