import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { encodeRows, decodeRows, sameRows, movePlan, splitRow, mergeRows, canMerge } from '../src/rowplan.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));
const run = (rowPlan) => calc({ cabW: 500, cabH: 1000, widthMm: 8000, heightMm: 3500, pitch: '3.9-in', rowPlan }, pixel);

test('행 배치 편집 함수: 이동/나누기/합치기/문자열', () => {
  const plan = [1000, 1000, 1000, 500];
  assert.deepEqual(movePlan(plan, 3, -1), [1000, 1000, 500, 1000]);
  assert.deepEqual(movePlan(plan, 0, -1), plan); // 범위 밖
  assert.deepEqual(splitRow(plan, 1, 1000, 500), [1000, 500, 500, 1000, 500]);
  assert.deepEqual(splitRow(plan, 3, 1000, 500), plan); // 500 줄은 나눌 수 없음
  assert.equal(canMerge([1000, 500, 500], 1, 1000, 500), true);
  assert.equal(canMerge([1000, 500, 1000], 1, 1000, 500), false);
  assert.deepEqual(mergeRows([500, 500, 1000], 0, 1000, 500), [1000, 1000]);
  assert.deepEqual(mergeRows([500, 1000, 500], 0, 1000, 500), [500, 1000, 500]);
  assert.equal(encodeRows([500, 1000, 500]), '500-1000-500');
  assert.deepEqual(decodeRows('500-1000-500'), [500, 1000, 500]);
  assert.equal(decodeRows('500-x'), null);
  assert.equal(decodeRows(''), null);
  assert.ok(sameRows([1, 2], [1, 2]) && !sameRows([1, 2], [2, 1]));
});

test('기본 배치: 위 500 한 줄 + 1000 세 줄 (8000×3500)', () => {
  const r = run(null);
  assert.deepEqual(r.rowPlan, [500, 1000, 1000, 1000]);
  assert.deepEqual(r.rowPlanDefault, [500, 1000, 1000, 1000]);
  assert.deepEqual([r.grid.mainRows, r.grid.fillerRows], [3, 1]);
  assert.equal(r.counts.total, 16 * 4);
});

test('사용자 배치를 기본 배치로 되돌리면 500 줄이 맨 위에 오고 도면 위치도 일치한다', () => {
  const custom = run([1000, 500, 1000, 500, 500]);
  const reset = run(custom.rowPlanDefault);
  assert.deepEqual(reset.rowPlan, [500, 1000, 1000, 1000]);
  const lay = buildLayout(reset, { pattern: 'hz-tl' });
  assert.deepEqual([0, 1, 2, 3].map((i) => [lay.cells[i * 16].y, lay.cells[i * 16].h]),
    [[0, 500], [500, 1000], [1500, 1000], [2500, 1000]]);
  assert.equal(reset.counts.total, 64);
  assert.equal(reset.pixel.resolution.h, 896);
});

test('남는 높이가 없으면 기본 배치는 1000 줄만 사용한다', () => {
  const r = calc({ cabW: 500, cabH: 1000, widthMm: 8000, heightMm: 3000, pitch: '3.9-in' }, pixel);
  assert.deepEqual(r.rowPlanDefault, [1000, 1000, 1000]);
  assert.equal(r.grid.fillerRows, 0);
});

test('사용자 배치: 위 500 한 줄, 가운데 1000 두 줄, 아래 500 두 줄', () => {
  const plan = [500, 1000, 1000, 500, 500];
  const r = run(plan);
  assert.deepEqual(r.errors.filter((e) => !e.includes('아시바')), []);
  assert.equal(r.rowPlanIgnored, false);
  assert.deepEqual([r.grid.mainRows, r.grid.fillerRows], [2, 3]);
  assert.deepEqual([r.counts.main, r.counts.filler, r.counts.total], [32, 48, 80]);
  // 박스: 1000 규격 7장/박스 → 32장 5박스, 500 규격 14장/박스 → 48장 4박스
  assert.deepEqual(r.boxes.map((b) => [b.cabinet, b.need, b.boxes]), [['500x1000', 32, 5], ['500x500', 48, 4]]);
  // 해상도 높이는 배치와 무관하게 같다 (2×256 + 3×128 = 896)
  assert.equal(r.pixel.resolution.h, 896);
  // 격자: 행 높이/위치가 배치 순서대로
  const lay = buildLayout(r, { pattern: 'hz-tl' });
  assert.equal(lay.rows, 5);
  assert.equal(lay.totalH, 3500);
  const rowsY = [0, 1, 2, 3, 4].map((i) => [lay.cells[i * 16].y, lay.cells[i * 16].h]);
  assert.deepEqual(rowsY, [[0, 500], [500, 1000], [1500, 1000], [2500, 500], [3000, 500]]);
  // 모든 캐비닛이 UTP에 한 번씩 들어가고 줄은 직사각형
  const ids = lay.lanLines.flatMap((l) => l.cells.map((c) => c.id));
  assert.equal(new Set(ids).size, 80);
  assert.equal(ids.length, 80);
});

test('크기가 안 맞는 저장된 배치는 무시하고 기본 배치로 계산 + 알림', () => {
  const bad = run([1000, 1000, 500]); // 합 2500 ≠ 3500
  assert.equal(bad.rowPlanIgnored, true);
  assert.deepEqual(bad.rowPlan, [500, 1000, 1000, 1000]);
  assert.ok(bad.warnings.some((w) => w.includes('행 배치')));
  const odd = run([2000, 1500]); // 허용되지 않는 높이
  assert.equal(odd.rowPlanIgnored, true);
  // 500×500 캐비닛에서는 배치 편집 대상이 아님
  const r500 = calc({ cabW: 500, cabH: 500, widthMm: 8000, heightMm: 4000, pitch: '2.6-in', rowPlan: [500, 500] }, pixel);
  assert.equal(r500.rowPlanIgnored, true);
  assert.equal(r500.counts.total, 128);
});
