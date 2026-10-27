// 엑셀 '라인.xlsx' / '역삼멀티캠퍼스 라인.xlsx'의 캐시된 값과 대조한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { config } from '../src/config.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));
const run = (i) => calc({ cabW: 500, cabH: 500, ...i }, pixel);

test('박스에 딱 맞는 필요수량은 여분 1박스를 출고하고 남는 박스에는 추가하지 않는다', () => {
  for (const pitch of ['1.5-in', '2.6-flex-in', '3.9-in', '4.8-out']) {
    const b = run({ widthMm: 7000, heightMm: 3000, pitch }).boxes[0];
    assert.deepEqual([b.need, b.perBox, b.boxes, b.packQty], [84, 14, 7, 98]);
  }
  const uni = run({ widthMm: 7000, heightMm: 3000, pitch: '2.6-in' }).boxes[0];
  assert.deepEqual([uni.need, uni.boxes, uni.packQty], [84, 8, 96]);
  const partial = run({ widthMm: 6500, heightMm: 3000, pitch: '4.8-out' }).boxes[0];
  assert.deepEqual([partial.need, partial.boxes, partial.packQty], [78, 6, 84]);
  const single = run({ widthMm: 3500, heightMm: 1000, pitch: '4.8-out' }).boxes[0];
  assert.deepEqual([single.need, single.boxes, single.packQty], [14, 2, 28]);
});

test('LED 단 600mm와 베이스 40mm는 LED 시작 640mm부터 상단까지 아시바 높이에 포함한다', () => {
  const input={widthMm:7000,heightMm:3000,pitch:'4.8-out'};
  const floor=run(input);
  const raised=run({...input,baseEnabled:true,stageEnabled:true,stageHeightMm:600});
  assert.deepEqual(raised.errors,[]);
  assert.deepEqual([raised.scaffold.baseHeightMm,raised.scaffold.stageHeightMm,raised.scaffold.ledBottomMm,raised.scaffold.ledTopMm],[40,600,640,3640]);
  assert.deepEqual([floor.scaffold.heightM,raised.scaffold.heightM,raised.scaffold.tiers],[2.625,3.425,2]);
  for(const key of ['grid','counts','pixel','lan','power','boxes']) assert.deepEqual(raised[key],floor[key]);
});

test('베이스와 LED 단은 각각 선택하고 해제한 단 높이는 계산에서 제외한다', () => {
  const input={widthMm:7000,heightMm:3000,pitch:'4.8-out',stageHeightMm:600};
  for(const [baseEnabled,stageEnabled,bottom] of [[false,false,0],[true,false,40],[false,true,600],[true,true,640]]) {
    const r=run({...input,baseEnabled,stageEnabled});
    assert.equal(r.scaffold.ledBottomMm,bottom);
    assert.equal(r.scaffold.ledTopMm,3000+bottom);
    assert.ok(r.scaffold.heightM*1000<=r.scaffold.ledTopMm);
  }
});

test('올린 LED도 연결핀 포함 높이를 넘지 않으며 수동 단 수의 초과를 판정한다', () => {
  const input={widthMm:7000,heightMm:4500,pitch:'4.8-out',baseEnabled:true,stageEnabled:true};
  const below=run({...input,stageHeightMm:600}); // LED 상단 5140, 일반 3단은 5150
  const exact=run({...input,stageHeightMm:610});
  assert.deepEqual([below.scaffold.heightM,exact.scaffold.heightM],[4.35,5.15]);
  const forced=run({...input,stageHeightMm:600,tiers:3});
  assert.ok(forced.errors.some(e=>e.includes('아시바 높이')&&e.includes('5140')));
});

test('LED 단 높이는 사용 시 필수이며 음수나 잘못된 값은 오류로 처리한다', () => {
  for(const stageHeightMm of [undefined,null,-1,NaN,Infinity]) {
    const r=run({widthMm:7000,heightMm:3000,pitch:'4.8-out',stageEnabled:true,stageHeightMm});
    assert.ok(r.errors.some(e=>e.includes('LED 단 높이')));
  }
  const r=run({widthMm:7000,heightMm:3000,pitch:'4.8-out',stageEnabled:true,stageHeightMm:0});
  assert.deepEqual(r.errors,[]);
});

test('베이스 높이는 config의 값을 사용한다', () => {
  const cfg={...config,scaffold:{...config.scaffold,baseHeightMm:50}};
  const r=calc({widthMm:7000,heightMm:3000,cabW:500,cabH:500,pitch:'4.8-out',baseEnabled:true},pixel,cfg);
  assert.equal(r.scaffold.ledBottomMm,50);
});

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
  assert.equal(s.widthM, 5.52); // 사용자가 정정한 가로 1.84m/칸
  assert.equal(s.heightM, 3.425); // 1700×2 + 연결핀 25mm
  assert.equal(s.posts, 8); // M13
  assert.equal(s.shortPosts, 0); // 엑셀 R13=4지만 3.4m+0.9m가 LED 4m를 넘어 끼우지 않음
  assert.equal(s.pins, 8); // M14
  assert.equal(s.xBars, 12); // M15
});

test('아시바 발판은 기본 윗단 제외로 계산한다', () => {
  const one = run({ widthMm: 2000, heightMm: 1700, pitch: 2.6, bays: 1, tiers: 1 });
  assert.deepEqual(
    [one.scaffold.posts, one.scaffold.xBars, one.scaffold.planks, one.scaffold.widthM, one.scaffold.heightM],
    [2, 2, 0, 1.84, 1.7],
  );
  const wide = run({ widthMm: 4000, heightMm: 1700, pitch: 2.6, bays: 2, tiers: 1 }); // 기둥3 x바4 발판2
  assert.deepEqual([wide.scaffold.posts, wide.scaffold.xBars, wide.scaffold.planks, wide.scaffold.widthM], [3, 4, 0, 3.68]);
  const tall = run({ widthMm: 2000, heightMm: 3500, pitch: 2.6, bays: 1, tiers: 2 }); // 기둥4 핀4 발판2 x바4
  assert.deepEqual([one.errors, wide.errors, tall.errors], [[], [], []]);
  assert.deepEqual([tall.scaffold.posts, tall.scaffold.pins, tall.scaffold.planks, tall.scaffold.xBars], [4, 4, 1, 4]);
});

test('아시바 자동 산출: LED보다 절대 커지지 않고, 남는 높이는 짧은아시바로 채움', () => {
  // LED 높이 3000: 일반 2단 3425는 초과 → 일반 1단 + 짧은기둥 + 핀 = 2625
  const r = run({ widthMm: 8000, heightMm: 3000, pitch: 2.6 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.scaffold.bays, 4); // 7.36m ≤ 8m
  assert.equal(r.scaffold.widthM, 7.36);
  assert.equal(r.scaffold.tiers, 1);
  assert.equal(r.scaffold.heightM, 2.625);
  assert.equal(r.scaffold.shortPosts, 5); // 기둥 5개 위에 1개씩
  // 3400에는 핀 포함 2단(3425)이 안 들어가므로 1단+짧은기둥을 사용한다.
  const r2 = run({ widthMm: 8000, heightMm: 3400, pitch: 2.6 });
  assert.deepEqual([r2.scaffold.tiers, r2.scaffold.shortPosts, r2.scaffold.heightM], [1, 5, 2.625]);
});

test('아시바 높이는 일반·짧은 기둥의 각 연결부 핀을 포함해 LED 안에서 자동 선택한다', () => {
  for (const [heightMm, tiers, short, actualMm] of [
    [1700, 1, false, 1700], [2600, 1, false, 1700], [2624, 1, false, 1700],
    [2625, 1, true, 2625], [3424, 1, true, 2625], [3425, 2, false, 3425],
    [4349, 2, false, 3425], [4350, 2, true, 4350], [5149, 2, true, 4350],
    [5150, 3, false, 5150], [6075, 3, true, 6075],
  ]) {
    const r = run({ widthMm: 6000, heightMm, pitch: '3.9-in' });
    assert.deepEqual([r.scaffold.tiers, r.scaffold.shortPosts > 0, Math.round(r.scaffold.heightM * 1000)], [tiers, short, actualMm], String(heightMm));
    assert.ok(r.scaffold.heightM * 1000 <= heightMm);
    assert.equal(r.scaffold.pins, 8 * (tiers - 1 + Number(short)));
  }
});

test('수동 지정한 일반·짧은기둥도 핀 포함 높이로 초과를 판정하고 설정된 핀 길이를 사용한다', () => {
  for (const input of [{ heightMm: 3400, tiers: 2 }, { heightMm: 2600, tiers: 1, shortPost: true }]) {
    const r = run({ widthMm: 6000, pitch: '3.9-in', ...input });
    assert.ok(r.errors.some((message) => message.includes('아시바 높이')));
  }
  const cfg = { ...config, scaffold: { ...config.scaffold, pinExposedM: 0.03 } };
  const r = calc({ widthMm: 6000, heightMm: 5000, cabW: 500, cabH: 500, pitch: '3.9-in', tiers: 2, shortPost: true }, pixel, cfg);
  assert.equal(r.scaffold.heightM, 4.36); // 1700×2 + 900 + 30×2
  assert.equal(r.scaffold.pinExposedM, 0.03);
});

test('아시바 가로는 1840mm씩 계산하고 LED 경계 안에서 내림하며 깊이는 900mm다', () => {
  for (const [widthMm, bays, widthM] of [[1840, 1, 1.84], [3680, 2, 3.68], [5520, 3, 5.52], [5519, 2, 3.68]]) {
    const r = run({ widthMm, heightMm: 3500, pitch: '3.9-in' });
    assert.deepEqual([r.scaffold.bays, r.scaffold.widthM, r.scaffold.depthM], [bays, widthM, 0.9]);
    assert.ok(r.scaffold.widthM * 1000 <= widthMm);
  }
  const tooWide = run({ widthMm: 5519, heightMm: 3500, pitch: '3.9-in', bays: 3 });
  assert.ok(tooWide.errors.some((message) => message.includes('아시바 가로')));
});

test('짧은기둥이 있으면 일반기둥 상단은 기본 포함하고 짧은기둥 상단만 선택한다', () => {
  for (const [heightMm, tiers, basePlanks, allPlanks] of [[3000, 1, 3, 6], [5000, 2, 6, 9]]) {
    const input = { widthMm: 7000, heightMm, pitch: '4.8-out' };
    const base = run(input);
    const on = run({ ...input, topPlank: true });
    const off = run({ ...input, topPlank: false });
    assert.deepEqual([base.errors, on.errors, off.errors], [[], [], []]);
    assert.equal(base.scaffold.tiers, tiers);
    assert.equal(base.scaffold.shortPosts, 4);
    assert.deepEqual([base.scaffold.planks, on.scaffold.planks, off.scaffold.planks], [basePlanks, allPlanks, basePlanks]);
    assert.equal(on.scaffold.posts, base.scaffold.posts);
    assert.equal(on.scaffold.pins, base.scaffold.pins);
    assert.equal(on.scaffold.xBars, base.scaffold.xBars);
  }
});

test('아시바 윗단 발판은 선택사항', () => {
  const on = run({ widthMm: 6000, heightMm: 3500, pitch: 2.6, bays: 3, tiers: 2, topPlank: true });
  const off = run({ widthMm: 6000, heightMm: 3500, pitch: 2.6, bays: 3, tiers: 2, topPlank: false });
  assert.deepEqual([on.errors, off.errors], [[], []]);
  assert.deepEqual([on.scaffold.planks, off.scaffold.planks], [6, 3]); // 엑셀 M16 = 3
});

test('7360×3425×900 아시바는 발판 기본 4개이며 윗단 포함 시 8개다', () => {
  const input = { widthMm: 8000, heightMm: 3500, pitch: '3.9-in' };
  const base = run(input);
  const on = run({ ...input, topPlank: true });
  const off = run({ ...input, topPlank: false });
  assert.deepEqual([base.scaffold.widthM, base.scaffold.heightM, base.scaffold.depthM], [7.36, 3.425, 0.9]);
  assert.deepEqual([base.scaffold.planks, on.scaffold.planks, off.scaffold.planks], [4, 8, 4]);
  assert.deepEqual([base.scaffold.topPlank, on.scaffold.topPlank, off.scaffold.topPlank], [false, true, false]);
  assert.equal(on.scaffold.posts, base.scaffold.posts);
  assert.equal(on.scaffold.pins, base.scaffold.pins);
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
  assert.deepEqual([r.boxes[0].boxes, r.boxes[0].packQty], [11, 77]); // 딱 맞는 10박스에 여분 1박스
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
  assert.equal(r.boxes[0].boxes, 11);
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
