import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { buildReport } from '../src/report.js';
import { makeXlsx } from '../src/xlsx.js';
import { renderSvg, renderCombined, detailFor } from '../src/render.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));

test('내보내기 자재표는 베이스·단 높이와 바닥부터 LED 시작·상단 높이를 함께 보존한다', () => {
  const input={widthMm:7000,heightMm:3000,cabW:500,cabH:500,pitch:'4.8-out',baseEnabled:true,stageEnabled:true,stageHeightMm:600};
  const res=calc(input,pixel);
  const report=buildReport(res,buildLayout(res,{}),input);
  const values=Object.fromEntries(report.inputs);
  assert.equal(values['베이스 높이'],'40 mm');
  assert.equal(values['LED 단 높이'],'600 mm');
  assert.equal(values['바닥부터 LED 시작 높이'],'640 mm');
  assert.equal(values['바닥부터 LED 상단 높이'],'3,640 mm');
  assert.equal(report.sections.find(s=>s.title==='아시바').rows[0][1],'5,520 × 3,425 × 900 mm');
});

test('자재표 데이터: 8000×4000 / 2.6', () => {
  const input = { widthMm: 8000, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 };
  const res = calc(input, pixel);
  const rep = buildReport(res, buildLayout(res, { pattern: 'hz-tl' }), input);
  const box = rep.sections.find((s) => s.title === '박스');
  assert.deepEqual(box.rows[0], ['500×500', 128, '<', 132, '=', 12, '×', 11]);
  const summary = rep.sections[0].rows;
  assert.ok(summary.some((row) => row[0] === 'LAN포트 수'));
  assert.ok(summary.some((row) => row[0] === 'POWER 포트 수'));
  assert.doesNotMatch(JSON.stringify(rep), /UTP|SMPS|MCU|파워/);
});

test('세부내역 첫 행에 선택 제품과 가로·세로·두께를 표시하고 미정 두께는 대시로 표시한다', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(pixel.pitches).map(([id, info]) => [id, info.thicknessMm])), {
    '1.5-in': 88, '2.6-in': 83, '2.6-flex-in': 73, '3.9-in': 88, '3.9-out': 85, '4.8-out': 74,
  });
  for (const pitch of Object.keys(pixel.pitches)) {
    const input = { widthMm: 2000, heightMm: 1000, cabW: 500, cabH: 500, pitch };
    const res = calc(input, pixel);
    const row = buildReport(res, buildLayout(res, {}), input).sections[0].rows[0];
    assert.deepEqual(row, [pixel.pitches[pitch].label, `2,000 × 1,000 × ${pixel.pitches[pitch].thicknessMm ?? '-'}`, `mm (가로 × 세로 × 두께)${pitch === '2.6-flex-in' ? '\n(잠금장치 포함 두께 약90mm)' : ''}`]);
    const supplied = { ...res, pitchInfo: { ...res.pitchInfo, thicknessMm: 88 } };
    assert.equal(buildReport(supplied, buildLayout(supplied, {}), input).sections[0].rows[0][1], '2,000 × 1,000 × 88');
  }
});

test('아시바 크기는 가로·높이·깊이를 mm로 함께 표시한다', () => {
  const input = { widthMm: 6000, heightMm: 3500, cabW: 500, cabH: 500, pitch: '3.9-in' };
  const res = calc(input, pixel);
  const section = buildReport(res, buildLayout(res, {}), input).sections.find((s) => s.title === '아시바');
  assert.deepEqual(section.rows[0], ['크기', '5,520 × 3,425 × 900 mm', '3칸 × 2단 × 1폭']);
  assert.deepEqual(section.rows.find((row) => row[0] === '핀'), ['핀', 8, '핀높이 25mm']);
  assert.deepEqual(section.rows.find((row) => row[0] === '아시바(기둥)'), ['아시바(기둥)', 8, '높이 1700mm']);
  assert.ok(!section.rows.some((row) => row[0] === '깊이'));
  const shortInput = { ...input, heightMm: 3000 };
  const shortRes = calc(shortInput, pixel);
  const shortSection = buildReport(shortRes, buildLayout(shortRes, {}), shortInput).sections.find((s) => s.title === '아시바');
  assert.deepEqual(shortSection.rows[0], ['크기', '5,520 × 2,625 × 900 mm', '3칸 × 1.5단 × 1폭']);
  assert.deepEqual(shortSection.rows.find((row) => row[0] === '아시바(짧은기둥)'), ['아시바(짧은기둥)', 4, '높이 900mm']);
  assert.doesNotMatch(JSON.stringify(shortSection), /짧은아시바|\d(?:\.\d+)?m(?!m)/);
});

test('박스 표는 1000 규격을 먼저 표시하고 출고수량 계산식을 보여 준다', () => {
  const input = { widthMm: 2500, heightMm: 2500, cabW: 500, cabH: 1000, pitch: '3.9-in' };
  const res = calc(input, pixel);
  const box = buildReport(res, buildLayout(res, {}), input).sections.find((s) => s.title === '박스');
  assert.deepEqual(box.rows, [
    ['500×1000', 10, '<', 14, '=', 7, '×', 2],
    ['500×500', 5, '<', 14, '=', 14, '×', 1],
  ]);
  const exactInput = { ...input, widthMm: 3500, heightMm: 2000 };
  const exact = calc(exactInput, pixel);
  const exactBox = buildReport(exact, buildLayout(exact, {}), exactInput).sections.find((s) => s.title === '박스');
  assert.deepEqual(exactBox.rows[0], ['500×1000', 14, '<', 21, '=', 7, '×', 3]);
});

test('해상도 비고는 실제 사용하는 캐비닛 규격별 픽셀을 표시한다', () => {
  for (const [cabH, heightMm, rowPlan, expected] of [
    [500, 3500, undefined, '128×128px (캐비닛 500×500mm)'],
    [1000, 4000, undefined, '128×256px (캐비닛 500×1000mm)'],
    [1000, 3500, undefined, '128×256px (캐비닛 500×1000mm)\n128×128px (캐비닛 500×500mm)'],
    [1000, 2000, [500, 500, 500, 500], '128×128px (캐비닛 500×500mm)'],
  ]) {
    const input = { widthMm: 6000, heightMm, cabW: 500, cabH, rowPlan, pitch: '3.9-in' };
    const res = calc(input, pixel);
    const rep = buildReport(res, buildLayout(res, {}), input);
    assert.equal(rep.sections[0].rows.find((row) => row[0] === '해상도')[2], expected);
  }
});

test('캐비닛 수 비고는 실제 규격별 가로·세로·장수를 표시한다', () => {
  for (const [cabH, heightMm, rowPlan, total, expected] of [
    [1000, 2000, undefined, 10, '가로5 × 세로2 = 10 (캐비닛 500×1000mm)'],
    [500, 2000, undefined, 20, '가로5 × 세로4 = 20 (캐비닛 500×500mm)'],
    [1000, 2500, undefined, 15, '가로5 × 세로2 = 10 (캐비닛 500×1000mm)\n가로5 × 세로1 = 5 (캐비닛 500×500mm)'],
    [1000, 2000, [500, 500, 500, 500], 20, '가로5 × 세로4 = 20 (캐비닛 500×500mm)'],
  ]) {
    const input = { widthMm: 2500, heightMm, cabW: 500, cabH, rowPlan, pitch: '3.9-in' };
    const res = calc(input, pixel);
    const rep = buildReport(res, buildLayout(res, {}), input);
    assert.deepEqual(rep.sections[0].rows.find((row) => row[0] === '캐비닛 수'), ['캐비닛 수', total, expected]);
  }
});

test('xlsx 파일이 zip 구조이고 외부 도구(openpyxl)로 읽힌다', (t) => {
  const bytes = makeXlsx(
    [[{ v: '구분', fill: true }, { v: '수량', bold: true }], ['캐비닛', 128], ['한글 & <특수>', null]],
    { sheetName: '자재표', widths: [20, 10] },
  );
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
  const file = join(dir, 't.xlsx');
  writeFileSync(file, bytes);
  const code = 'import sys,openpyxl;ws=openpyxl.load_workbook(sys.argv[1]).active;print(ws.title);print(ws["A2"].value,ws["B2"].value,ws["A3"].value)';
  let out;
  try {
    out = execFileSync('python', ['-I', '-X', 'utf8', '-c', code, file], { encoding: 'utf8' });
  } catch (e) {
    t.skip('python/openpyxl 없음: ' + e.message.split('\n')[0]);
    return;
  }
  assert.deepEqual(out.trim().split(/\s*[\r\n]+\s*/), ['자재표', '캐비닛 128 한글 & <특수>']);
});

const sample = () => {
  const input = { widthMm: 8000, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 };
  const res = calc(input, pixel);
  return { input, res, lay: buildLayout(res, { pattern: 'hz-tl' }) };
};

test('내보내기 도면: 위 LAN / 아래 POWER를 세로로 쌓는다', () => {
  const { lay } = sample();
  const onlyLan = renderSvg(lay, { showLan: true, showPower: false });
  const onlyPw = renderSvg(lay, { showLan: false, showPower: true });
  assert.ok(onlyLan.includes('LAN 1:') && !onlyLan.includes('분전반'));
  assert.ok(onlyPw.includes('POWER 1:') && !onlyPw.includes('분전반') && !onlyPw.includes('LAN 1:'));
  const both = renderCombined(lay, { title: '테스트' });
  const vb = (s) => s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const [, hLan] = vb(onlyLan);
  const [, hPw] = vb(onlyPw);
  const [, hAll] = vb(both);
  assert.ok(Math.abs(hAll - (hLan + hPw)) < 0.05);
  assert.ok(both.indexOf('LAN 배선') < both.indexOf('POWER 배선')); // LAN가 위
  assert.equal((both.match(/<svg /g) || []).length, 3); // 바깥 1 + 안쪽 2
  assert.ok(!/<svg [^>]*width=/.test(renderCombined(lay, { sized: false }).split('>')[0]));
});

test('엑셀 자재표: LAN포트 구성 아래에 POWER포트 구성', () => {
  const { res, lay, input } = sample();
  const titles = buildReport(res, lay, input).sections.map((s) => s.title);
  assert.ok(titles.indexOf('LAN포트 구성') < titles.indexOf('POWER포트 구성'));
  const pw = buildReport(res, lay, input).sections.find((s) => s.title.startsWith('POWER'));
  assert.equal(pw.rows.length, lay.powerChains.length);
  assert.deepEqual(pw.rows[0], ['POWER 1', 16, '1 → 16']);
});

test('칸 안 상세 정보: 확대했을 때만(detail) 항목을 줄 나눠 적는다', () => {
  const { lay } = sample();
  const off = renderSvg(lay, { showLan: true, showPower: false, detail: false });
  const on = renderSvg(lay, { showLan: true, showPower: false, detail: true });
  assert.ok(!off.includes('번째') && !off.includes('가로192px'));
  // 한 줄에 하나씩: LAN 번호 / 순서. 가로·세로 픽셀은 표시하지 않는다.
  for (const s of ['>LAN 1<', '>1번째<', '>16번째<']) assert.ok(on.includes(s), s);
  assert.doesNotMatch(on, /(?:가로|세로)[\d.,]+px|px</);
  const pw = renderSvg(lay, { showLan: false, showPower: true, detail: true });
  for (const s of ['>POWER 1<', '>1번째<', '>16번째<']) assert.ok(pw.includes(s), s);
  assert.ok(!pw.includes('px<'));
  assert.ok(!pw.includes('그룹'));
  assert.ok(!pw.includes('SMPS'));
  assert.ok(!pw.includes('>LAN 1<'));
});

test('상세 정보 자동 표시 기준: 칸 1장이 화면에서 95px 이상일 때', () => {
  const { lay } = sample(); // 16열
  assert.equal(detailFor(lay, 800), false); // 칸 ≈ 46px
  assert.equal(detailFor(lay, 1900), true); // 칸 ≈ 110px
  // 같은 폭이라도 열이 많으면 칸이 작아 꺼진다
  const wide = calc({ widthMm: 20000, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 }, pixel);
  assert.equal(detailFor(buildLayout(wide, { pattern: 'hz-tl' }), 1900), false);
});

test('LAN/POWER/내보내기 도면: 상단 열 번호와 좌측 행 번호, 아래쪽 가로 치수선', () => {
  const { lay } = sample();
  for (const opt of [{ showLan: true, showPower: false }, { showLan: false, showPower: true }]) {
    const svg = renderSvg(lay, opt);
    const axis = (name) => svg.match(new RegExp(`<g data-axis="${name}"[^>]*>(.*?)</g>`))[1];
    const texts = (s) => [...s.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>(.*?)<\/text>/g)];
    const columns = texts(axis('columns'));
    const rows = texts(axis('rows'));
    for (const name of ['columns', 'rows']) {
      const group = axis(name);
      const circles = [...group.matchAll(/<circle[^>]*fill="#000"/g)];
      assert.equal(circles.length, name === 'columns' ? lay.cols : lay.rows);
      assert.ok(texts(group).every((m) => m[0].includes('fill="#fff"')));
    }
    assert.deepEqual(columns.map((m) => m[3]), Array.from({ length: lay.cols }, (_, i) => String(i + 1)));
    assert.deepEqual(rows.map((m) => m[3]), Array.from({ length: lay.rows }, (_, i) => String(i + 1)));
    assert.ok(columns.every((m) => Number(m[2]) < 0));
    assert.ok(rows.every((m) => Number(m[1]) < 0));
    const dimension = svg.match(/<g data-dimension="width">(.*?)<\/g>/)[1];
    assert.ok(Number(dimension.match(/y1="([\d.]+)"/)[1]) > lay.totalH);
    assert.ok(Number(texts(dimension)[0][2]) > lay.totalH);
  }
  const combined = renderCombined(lay);
  assert.equal((combined.match(/data-axis="columns"/g) || []).length, 2);
  assert.equal((combined.match(/data-axis="rows"/g) || []).length, 2);
});

test('500/1000 혼합 행의 번호는 각 행의 실제 높이 중앙에 배치한다', () => {
  const res = calc({ widthMm: 6000, heightMm: 3500, cabW: 500, cabH: 1000, pitch: '3.9-in', rowPlan: [500, 1000, 1000, 1000] }, pixel);
  const lay = buildLayout(res, { pattern: 'hz-tl' });
  const svg = renderSvg(lay);
  const rowLabels = svg.match(/<g data-axis="rows"[^>]*>(.*?)<\/g>/)[1];
  const ys = [...rowLabels.matchAll(/<text[^>]* y="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 4);
  assert.equal(ys[1] - ys[0], 750);
  assert.equal(ys[2] - ys[1], 1000);
});
