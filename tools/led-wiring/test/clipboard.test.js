import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { buildClipboardText } from '../src/clipboard.js';
import { scaffoldTitle, scaffoldViewData, scaffoldViewUrl } from '../src/scaffold-view-data.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));
function context(overrides = {}, layout = {}) {
  const input = { widthMm: 11500, heightMm: 2500, cabW: 500, cabH: 500, pitch: '2.6-in', ...overrides };
  const res = calc(input, pixel);
  return { input, res, lay: buildLayout(res, layout) };
}

test('클립보드에는 제품·크기·실제 캐비닛·해상도·박스 출고수량을 복사한다', () => {
  const ctx = context();
  const text = buildClipboardText(ctx);
  assert.ok(text.startsWith('P2.6 indoor UNILUMIN\n11500*2500mm\n박스 500*500 필요수량115ea < 출고수량120ea (10box)\n해상도 4416*960px\n'));
  assert.ok(!text.includes('박스 P2.6'));
  assert.ok(text.includes('아시바 6칸 × 1단 × 1폭 (11,040 × 1,700 × 900 mm)'));
});

test('클립보드 포트 수는 직접 그린 실제 LAN·POWER 구성에서 가져온다', () => {
  const ctx = context({}, { manual: [], powerManual: [{ r0: 0, r1: 1, c0: 0, c1: 2, n: 1, p: 'hz-tl' }] });
  assert.ok(buildClipboardText(ctx).includes('랜포트 0개\n파워포트 1개'));
});

test('TXT 아시바 아래에 발판과 선택한 규격별 베이스 수량을 간결하게 복사한다', () => {
  const text = buildClipboardText(context({ baseEnabled:true, topPlank:true }));
  assert.ok(text.endsWith('아시바 6칸 × 1단 × 1폭 (11,040 × 1,700 × 900 mm)\n아시바 기둥7ea / x바12ea / 발판6ea\n베이스 2.5*3ea / 2.0*2ea'));
  assert.ok(!buildClipboardText(context()).includes('\n베이스 '));
});

test('혼합 규격·미정 박스·여분 박스를 잘못 합치거나 임의 수량으로 표시하지 않는다', () => {
  const mixed = buildClipboardText(context({ widthMm: 7000, heightMm: 3500, cabH: 1000, pitch: '3.9-in' }));
  assert.ok(mixed.includes('박스 500*1000 필요수량42ea < 출고수량49ea (7box)\n박스 500*500 필요수량14ea < 출고수량28ea (2box)'));
  const unknown = buildClipboardText(context({ pitch: '3.9-out' }));
  assert.ok(unknown.includes('출고수량- (-box)'));
  assert.doesNotMatch(unknown, /null|undefined|NaN/);
});

test('짧은기둥 포함 시 복사·3D 제목 모두 실제 1.5단과 폭을 사용한다', () => {
  const ctx = context({ stageEnabled: true, stageHeightMm: 600 });
  const url = scaffoldViewUrl(ctx.input, ctx.res.scaffold);
  const data = scaffoldViewData(new URL(url, 'http://localhost/').searchParams, pixel);
  assert.equal(scaffoldTitle(data.off), '아시바 6칸 × 1.5단 × 1폭');
  const text = buildClipboardText(ctx);
  assert.ok(text.includes('아시바 6칸 × 1.5단 × 1폭 (11,040 × 2,625 × 900 mm)'));
  assert.ok(text.includes('아시바 기둥7ea / 짧은기둥7ea / 핀14ea / x바12ea / 발판6ea'));
});

test('TXT는 짧은기둥 뒤에 표와 같은 핀 수량을 포함한다', () => {
  const ctx = context({ widthMm: 7000, heightMm: 3000, baseEnabled: true });
  const text = buildClipboardText(ctx);
  assert.equal(ctx.res.scaffold.pins, 8);
  assert.ok(text.includes('아시바 기둥4ea / 짧은기둥4ea / 핀8ea / x바6ea / 발판3ea'));
  assert.ok(text.endsWith('베이스 2.5*2ea / 2.0*1ea'));
});

test('TXT는 0개 아시바 부재와 베이스를 생략하되 발판0ea는 유지한다', () => {
  const text = buildClipboardText(context({ baseEnabled: true, baseCounts: '0,0,0,0' }));
  assert.ok(text.includes('아시바 기둥7ea / x바12ea / 발판0ea'));
  assert.doesNotMatch(text, /짧은기둥0ea|핀0ea|^베이스 .*ea$/m);
  const empty = context();
  Object.assign(empty.res.scaffold, { posts: 0, shortPosts: 0, pins: 0, xBars: 0, planks: 0 });
  assert.ok(buildClipboardText(empty).endsWith('\n아시바 발판0ea'));
});
