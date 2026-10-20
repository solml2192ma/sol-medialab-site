import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calc } from '../src/calc.js';
import { scaffoldViewUrl, scaffoldViewData } from '../src/scaffold-view-data.js';
const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));

test('3D 도면 링크는 표의 칸·단·상단 발판 선택을 전달한다', () => {
  const input = {widthMm:7000,heightMm:5000,cabW:500,cabH:500,pitch:'4.8-out',topPlank:true};
  const result = calc(input,pixel);
  const url = new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/tools/led-wiring/');
  assert.equal(url.pathname,'/tools/led-wiring/scaffold.html');
  const model = scaffoldViewData(url.searchParams,pixel);
  assert.equal(model.topPlank,true);
  assert.deepEqual(model.on,result.scaffold);
  assert.deepEqual([model.off.planks,model.on.planks],[6,9]);
});

test('3D 도면은 사용자가 지정한 칸·단과 상단 제외 상태를 유지한다', () => {
  const input={widthMm:8000,heightMm:5000,cabW:500,cabH:1000,pitch:'3.9-in',bays:2,tiers:1,topPlank:false};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  const model=scaffoldViewData(url.searchParams,pixel);
  assert.equal(model.topPlank,false);
  assert.deepEqual(model.off,result.scaffold);
});

test('입력이 없거나 잘못된 3D 도면 주소는 안내 오류로 처리한다', () => {
  for(const query of ['', 'w=NaN&h=5000', 'w=-7000&h=5000']) {
    assert.throws(()=>scaffoldViewData(new URLSearchParams(query),pixel),/버튼에서 열어/);
  }
});

test('LED 패널은 실제 전체 크기·두께를 사용하고 아시바 중앙과 바닥에 맞춘다', () => {
  const input={widthMm:7000,heightMm:5000,cabW:500,cabH:500,pitch:'4.8-out'};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  const {panel}=scaffoldViewData(url.searchParams,pixel);
  assert.deepEqual([panel.widthMm,panel.heightMm,panel.thicknessMm],[7000,5000,74]);
  assert.deepEqual([panel.offsetX,panel.offsetY],[-740,0]);
  assert.equal(panel.cabinets.length,140);
  assert.equal(Math.min(...panel.cabinets.map(c=>c.x)),-740);
  assert.equal(Math.max(...panel.cabinets.map(c=>c.x+c.w)),6260);
  assert.equal(Math.min(...panel.cabinets.map(c=>c.y)),0);
  assert.equal(Math.max(...panel.cabinets.map(c=>c.y+c.h)),5000);
  assert.equal(panel.cabinets.reduce((sum,c)=>sum+c.w*c.h,0),7000*5000);
});

test('3D LED 패널은 사용자 지정 500/1000 혼합 행의 위아래 순서를 유지한다', () => {
  const input={widthMm:7000,heightMm:3500,cabW:500,cabH:1000,pitch:'3.9-in',rowPlan:[1000,500,1000,1000]};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  const model=scaffoldViewData(url.searchParams,pixel);
  assert.deepEqual(model.input.rowPlan,input.rowPlan);
  const rowStarts=model.panel.cabinets.filter(c=>c.x===model.panel.offsetX);
  assert.deepEqual(rowStarts.map(c=>[c.y,c.h]),[[2500,1000],[2000,500],[1000,1000],[0,1000]]);
  assert.equal(model.panel.cabinets.length,56);
  assert.equal(model.panel.thicknessMm,88);
});

test('미확정 LED 두께는 임의 치수를 만들지 않는다', () => {
  const input={widthMm:7000,heightMm:3000,cabW:500,cabH:500,pitch:'2.6-flex-in'};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  assert.equal(scaffoldViewData(url.searchParams,pixel).panel.thicknessMm,null);
});

test('LED 패널 표시는 기본 켜짐이며 숨김 선택을 주소로 복원해도 아시바 수량은 유지한다', () => {
  const input={widthMm:7000,heightMm:5000,cabW:500,cabH:500,pitch:'4.8-out',topPlank:true};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  const shown=scaffoldViewData(url.searchParams,pixel);
  assert.equal(shown.showPanel,true);
  url.searchParams.set('showPanel','0');
  const hidden=scaffoldViewData(url.searchParams,pixel);
  assert.equal(hidden.showPanel,false);
  assert.deepEqual(hidden.on,shown.on);
  assert.deepEqual(hidden.off,shown.off);
  assert.equal(hidden.topPlank,true);
});

test('베이스·단 높이를 3D 주소로 전달하면 LED만 640mm 올리고 아시바는 바닥 기준으로 계산한다', () => {
  const input={widthMm:7000,heightMm:3000,cabW:500,cabH:500,pitch:'4.8-out',baseEnabled:true,stageEnabled:true,stageHeightMm:600};
  const result=calc(input,pixel);
  const url=new URL(scaffoldViewUrl(input,result.scaffold),'https://example.com/');
  const data=scaffoldViewData(url.searchParams,pixel);
  assert.deepEqual(data.off,result.scaffold);
  assert.equal(data.off.heightM,3.425);
  assert.equal(data.panel.offsetY,640);
  assert.equal(Math.min(...data.panel.cabinets.map(c=>c.y)),640);
  assert.equal(Math.max(...data.panel.cabinets.map(c=>c.y+c.h)),3640);
  assert.equal(data.panel.cabinets.length,84);
  assert.deepEqual(data.panel.installationBoxes,[
    {kind:'stage',x:-740,y:0,w:7000,h:600,depthMm:74},
    {kind:'base',x:-740,y:600,w:7000,h:40,depthMm:74},
  ]);
  assert.equal(data.panel.installationBoxes.at(-1).y+data.panel.installationBoxes.at(-1).h,data.panel.offsetY);
});

test('사용하지 않는 LED 단·베이스는 3D 박스에서 제외한다', () => {
  const input={widthMm:7000,heightMm:3000,cabW:500,cabH:500,pitch:'4.8-out',stageHeightMm:600};
  for(const [baseEnabled,stageEnabled,kinds] of [[false,false,[]],[true,false,['base']],[false,true,['stage']]]) {
    const selected={...input,baseEnabled,stageEnabled};
    const result=calc(selected,pixel);
    const url=new URL(scaffoldViewUrl(selected,result.scaffold),'https://example.com/');
    const model=scaffoldViewData(url.searchParams,pixel);
    assert.deepEqual(model.panel.installationBoxes.map(box=>box.kind),kinds);
    if(baseEnabled) assert.equal(model.panel.installationBoxes[0].y,0);
  }
});
