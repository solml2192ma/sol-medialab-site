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

test('자재표 데이터: 8000×4000 / 2.6', () => {
  const input = { widthMm: 8000, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 };
  const res = calc(input, pixel);
  const rep = buildReport(res, buildLayout(res, { pattern: 'hz-tl' }), input);
  const box = rep.sections.find((s) => s.title === '박스');
  assert.deepEqual(box.rows[0], ['500×500', 128, 12, 11, 132]);
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

test('내보내기 도면: 위 UTP / 아래 파워를 세로로 쌓는다', () => {
  const { lay } = sample();
  const onlyLan = renderSvg(lay, { showLan: true, showPower: false });
  const onlyPw = renderSvg(lay, { showLan: false, showPower: true });
  assert.ok(onlyLan.includes('UTP 1:') && !onlyLan.includes('분전반'));
  assert.ok(onlyPw.includes('파워 1:') && !onlyPw.includes('분전반') && !onlyPw.includes('UTP 1:'));
  const both = renderCombined(lay, { title: '테스트' });
  const vb = (s) => s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const [, hLan] = vb(onlyLan);
  const [, hPw] = vb(onlyPw);
  const [, hAll] = vb(both);
  assert.ok(Math.abs(hAll - (hLan + hPw)) < 0.05);
  assert.ok(both.indexOf('UTP(LAN) 배선') < both.indexOf('파워 배선')); // UTP가 위
  assert.equal((both.match(/<svg /g) || []).length, 3); // 바깥 1 + 안쪽 2
  assert.ok(!/<svg [^>]*width=/.test(renderCombined(lay, { sized: false }).split('>')[0]));
});

test('엑셀 자재표: UTP 줄별 구성 아래에 파워 포트별 구성', () => {
  const { res, lay, input } = sample();
  const titles = buildReport(res, lay, input).sections.map((s) => s.title);
  assert.ok(titles.indexOf('UTP(LAN) 줄별 구성') < titles.indexOf('파워(롱파워) 포트별 구성'));
  const pw = buildReport(res, lay, input).sections.find((s) => s.title.startsWith('파워'));
  assert.equal(pw.rows.length, lay.powerChains.length);
  assert.deepEqual(pw.rows[0], ['파워 1', 16, '1 → 16', 4]);
});

test('칸 안 상세 정보: 확대했을 때만(detail) 항목을 줄 나눠 적는다', () => {
  const { lay } = sample();
  const off = renderSvg(lay, { showLan: true, showPower: false, detail: false });
  const on = renderSvg(lay, { showLan: true, showPower: false, detail: true });
  assert.ok(!off.includes('번째') && !off.includes('가로192px'));
  // 한 줄에 하나씩: UTP 번호 / 순서 / 가로 / 세로
  for (const s of ['>UTP 1<', '>1번째<', '>16번째<', '>가로192px<', '>세로192px<']) assert.ok(on.includes(s), s);
  const pw = renderSvg(lay, { showLan: false, showPower: true, detail: true });
  for (const s of ['>파워 1<', '>그룹 1-1<', '>그룹 1-4<', '>가로192px<']) assert.ok(pw.includes(s), s);
  assert.ok(!pw.includes('>UTP 1<'));
});

test('상세 정보 자동 표시 기준: 칸 1장이 화면에서 95px 이상일 때', () => {
  const { lay } = sample(); // 16열
  assert.equal(detailFor(lay, 800), false); // 칸 ≈ 46px
  assert.equal(detailFor(lay, 1900), true); // 칸 ≈ 110px
  // 같은 폭이라도 열이 많으면 칸이 작아 꺼진다
  const wide = calc({ widthMm: 20000, heightMm: 4000, cabW: 500, cabH: 500, pitch: 2.6 }, pixel);
  assert.equal(detailFor(buildLayout(wide, { pattern: 'hz-tl' }), 1900), false);
});

test('UTP/파워/내보내기 도면: 상단 열 번호와 좌측 행 번호, 아래쪽 가로 치수선', () => {
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
