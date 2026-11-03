import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { buildClipboardText } from '../src/clipboard.js';
import { renderCombined } from '../src/render.js';
import { outputWarnings, printWarnings } from '../src/output-warnings.js';
import { buildXlsxRows, buildXlsxBytes } from '../src/export.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));

test('미연결 LAN·POWER 안내가 화면·TXT·PNG에 같은 문구로 전달된다', () => {
  const input = { widthMm:3000, heightMm:2000, cabW:500, cabH:500, pitch:'2.6-in' };
  const res = calc(input,pixel);
  const lay = buildLayout(res,{manual:[{r0:0,r1:1,c0:0,c1:6,n:1,p:'hz-tl'}],powerManual:[]});
  const alerts = outputWarnings(res,lay);
  assert.deepEqual(alerts, ['LAN 배선이 연결되지 않은 캐비닛이 18장 있습니다.', 'POWER 배선이 연결되지 않은 캐비닛이 24장 있습니다.']);
  const txt = buildClipboardText({input,res,lay});
  assert.ok(txt.startsWith('주의\n'+alerts.join('\n')+'\n\n'));
  const svg = renderCombined(lay,{alerts});
  assert.ok(svg.includes('data-output-warnings="true"'));
  for(const message of alerts) assert.ok(svg.includes(message));
  const height = s => Number(s.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1]);
  assert.ok(height(svg)>height(renderCombined(lay)));
  assert.ok(svg.includes('fill="#fff0f0" stroke="#b91c1c"'));
});

test('빨간 오류는 포함하고 주황색 안내·POWER 장수 주의는 포함하지 않는다', () => {
  assert.deepEqual(outputWarnings({errors:['오류'],warnings:['입력 안내']},{warnings:['LAN 오류','오류'],powerLoadWarnings:['POWER 주의']}),['오류','LAN 오류']);
  const input = { widthMm:3000,heightMm:2000,cabW:500,cabH:500,pitch:'2.6-in' };
  const res=calc(input,pixel),lay=buildLayout(res,{});
  assert.deepEqual(outputWarnings(res,lay),[]);
  assert.ok(!buildClipboardText({input,res,lay}).startsWith('주의'));
  assert.ok(!renderCombined(lay,{alerts:[]}).includes('data-output-warnings'));
});

test('긴 오류 문구는 PNG에서 줄을 나누고 SVG 특수문자를 이스케이프한다', () => {
  const res=calc({widthMm:3000,heightMm:2000,cabW:500,cabH:500,pitch:'2.6-in'},pixel);
  const svg=renderCombined(buildLayout(res,{}),{alerts:['<주의> & '+ '긴 문구'.repeat(50)]});
  assert.ok(svg.includes('&lt;주의> &amp;'));
  assert.ok(!svg.includes('<주의>'));
});

test('베이스 길이가 부족하거나 초과하면 빨간 안내를 PNG·TXT에 포함하고 일치·미사용이면 해제한다', () => {
  const input={widthMm:11500,heightMm:2500,cabW:500,cabH:500,pitch:'2.6-in',baseEnabled:true};
  for (const [baseCounts, length] of [['1,2,0,3','9,500'],['4,1,0,0','12,000']]) {
    const actual={...input,baseCounts},res=calc(actual,pixel),lay=buildLayout(res,{});
    const messages=outputWarnings(res,lay,actual);
    assert.deepEqual(messages,[`베이스 길이 ${length}mm와 LED 길이 11,500mm가 다릅니다. 베이스 수량을 확인해 주세요.`]);
    assert.ok(buildClipboardText({input:actual,res,lay}).includes(messages[0]));
    assert.ok(renderCombined(lay,{alerts:messages}).includes(messages[0]));
  }
  for(const actual of [input,{...input,baseEnabled:false,baseCounts:'1,2,0,3'}]) {
    const res=calc(actual,pixel),lay=buildLayout(res,{});
    assert.deepEqual(outputWarnings(res,lay,actual),[]);
  }
});

test('EXCEL·PDF에도 미연결과 베이스 길이 주의가 같은 문구로 포함된다', () => {
  const input={widthMm:11500,heightMm:2500,cabW:500,cabH:500,pitch:'2.6-in',baseEnabled:true,baseCounts:'1,0,0,0'};
  const res=calc(input,pixel),lay=buildLayout(res,{manual:[],powerManual:[]}),ctx={input,res,lay};
  const messages=outputWarnings(res,lay,input);
  const rows=buildXlsxRows(ctx);
  assert.equal(rows[1][0].v,'주의');
  assert.deepEqual(rows.filter(row=>row[0]?.warning).slice(1).map(row=>row[0].v),messages);
  const html=printWarnings(res,lay,input);
  assert.ok(html.startsWith('<div class="print-warning">'));
  for(const message of messages) assert.ok(html.includes(message));
  const cleanLay=buildLayout(res,{}),cleanRes=calc({...input,baseCounts:''},pixel);
  assert.equal(printWarnings(cleanRes,cleanLay,input),'');
  assert.ok(!buildXlsxRows({input,res:cleanRes,lay:cleanLay}).some(row=>row[0]?.warning));
});

test('실제 XLSX의 주의 셀은 붉은 글자·배경·줄바꿈과 병합 영역으로 읽힌다', t => {
  const input={widthMm:11500,heightMm:2500,cabW:500,cabH:500,pitch:'2.6-in',baseEnabled:true,baseCounts:'1,0,0,0'};
  const res=calc(input,pixel),lay=buildLayout(res,{});
  const file=join(mkdtempSync(join(tmpdir(),'led-warning-')),'warnings.xlsx');
  writeFileSync(file,buildXlsxBytes({input,res,lay}));
  const code='import openpyxl,sys,json;w=openpyxl.load_workbook(sys.argv[1]).active;c=w["A3"];print(json.dumps([c.value,c.font.color.rgb,c.fill.fgColor.rgb,c.alignment.wrap_text,str(w.merged_cells)],ensure_ascii=False))';
  let result;
  try { result=JSON.parse(execFileSync('python',['-I','-X','utf8','-c',code,file],{encoding:'utf8'})); }
  catch(e){ if(e.code==='ENOENT'||String(e.stderr).includes('No module named')){t.skip('python/openpyxl 없음');return;} throw e; }
  assert.equal(result[0],outputWarnings(res,lay,input)[0]);
  assert.deepEqual(result.slice(1,4),['FFB91C1C','FFFFF0F0',true]);
  assert.ok(result[4].includes('A3:H3'));
});
