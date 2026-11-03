import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basePlan, decodeBaseCounts } from '../src/base-plan.js';
import { config } from '../src/config.js';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { buildReport } from '../src/report.js';
import { buildClipboardText } from '../src/clipboard.js';
import { scaffoldViewData, scaffoldViewUrl } from '../src/scaffold-view-data.js';
const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));

test('베이스는 총 길이와 최소 개수를 유지하며 짧은 규격을 최소화한다', () => {
  assert.deepEqual(basePlan(11500, true).items.map(i => i.count), [3, 2, 0, 0]);
  assert.deepEqual(basePlan(6000, true).items.map(i => i.count), [0, 3, 0, 0]);
  assert.deepEqual(basePlan(7000, true).items.map(i => i.count), [2, 1, 0, 0]);
  assert.deepEqual(basePlan(3000, true).items.map(i => i.count), [0, 0, 2, 0]);
  for (let width = 1000; width <= 30000; width += 500) {
    const plan = basePlan(width, true);
    assert.equal(plan.totalWidthMm, width);
    assert.equal(plan.totalCount, Math.ceil(width / 2500));
  }
  assert.equal(basePlan(500, true).totalWidthMm, 1000); // 최소 규격보다 짧으면 최소 길이로 덮는다.
});

test('베이스 수동 수량·0개·미사용·손상 저장값을 처리한다', () => {
  const manual = decodeBaseCounts('1,2,0,3');
  assert.deepEqual(manual, [1, 2, 0, 3]);
  assert.equal(basePlan(11500, true, manual).totalWidthMm, 9500);
  assert.equal(basePlan(11500, true, [0,0,0,0]).totalWidthMm, 0);
  assert.equal(basePlan(11500, false, manual).totalCount, 0);
  for (const value of ['', '1,2', '-1,0,0,0', '1.5,0,0,0', 'NaN,0,0,0', '1,,0,0', '9007199254740991,0,0,0']) {
    assert.equal(decodeBaseCounts(value), null);
  }
  const custom = { ...config, scaffold: { ...config.scaffold, baseLengthsMm: [3000, 1000] } };
  assert.deepEqual(basePlan(7000, true, null, custom).items.map(i => i.count), [2,1]);
});

test('수동 베이스 수량은 표·클립보드·3D 링크 복원에도 같고 다른 배선 계산을 바꾸지 않는다', () => {
  const input = { widthMm:11500, heightMm:3000, cabW:500, cabH:500, pitch:'2.6-in', baseEnabled:true, baseCounts:'1,2,0,3' };
  const res = calc(input, pixel), lay = buildLayout(res, {});
  const auto = calc({ ...input, baseCounts:'' }, pixel);
  assert.deepEqual(res.counts, auto.counts);
  assert.deepEqual(res.pixel, auto.pixel);
  const row = buildReport(res, lay, input).sections.find(s => s.title === '아시바').rows.find(r => r[0] === '베이스');
  assert.equal(row[1], '2.5m 1\n2.0m 2\n1.5m 0\n1.0m 3');
  assert.equal(row[2], '높이 40mm\n베이스 길이 9,500mm\nLED 길이 11,500mm');
  const autoRow = buildReport(auto, lay, input).sections.find(s => s.title === '아시바').rows.find(r => r[0] === '베이스');
  assert.equal(autoRow[2], '높이 40mm\n베이스 길이 11,500mm\nLED 길이 11,500mm');
  assert.ok(buildClipboardText({input,res,lay}).includes('베이스 2.5*1ea / 2.0*2ea / 1.0*3ea'));
  const data = scaffoldViewData(new URL(scaffoldViewUrl(input,res.scaffold),'http://localhost/').searchParams,pixel);
  assert.deepEqual(data.off.basePlan, res.scaffold.basePlan);
});
