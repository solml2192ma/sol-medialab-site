import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedLanNumber, reorderLan, compactManualNumbers } from '../src/manual-order.js';
import { calc } from '../src/calc.js';
import { buildLayout } from '../src/layout.js';
import { readFileSync } from 'node:fs';

test('LAN 신규 번호 건너뛰기 차단, 기존 번호와 삭제 후 빈 번호 허용', () => {
  const lines = [1, 2, 3, 4, 5].map(n => ({ n }));
  assert.equal(allowedLanNumber(lines, 8), 6);
  assert.equal(allowedLanNumber(lines, 3), 3);
  assert.equal(allowedLanNumber(lines, 6), 6);
  assert.equal(allowedLanNumber(lines.filter(l => l.n !== 3), 8), 3);
  assert.equal(allowedLanNumber([], ''), 1);
});

test('LAN 이동 시 모든 구간을 함께 재번호하며 겹침 순서와 패턴 보존', () => {
  const lines = [{ n: 1, p: 'hz-tr' }, { n: 2, p: 'vz-tl' }, { n: 1, p: 'hz-bl' }, { n: 3, p: 'hz-tl' }];
  const moved = reorderLan(lines, 3, 1);
  assert.deepEqual(moved.lines.map(l => l.n), [2, 3, 2, 1]);
  assert.deepEqual(moved.lines.map(l => l.p), lines.map(l => l.p));
  assert.deepEqual(lines.map(l => l.n), [1, 2, 1, 3]);
  assert.deepEqual(reorderLan(moved.lines, 1, 3).lines, lines);
});

test('POWER 2·3·5는 1·2·3으로 정리하고 다음 포트는 4만 허용한다', () => {
  const lines=[{n:2,p:'hz-tr'},{n:3,p:'vz-tl'},{n:5,p:'hz-tl'},{n:3,p:'hz-bl'}];
  const result=compactManualNumbers(lines,5);
  assert.deepEqual(result.lines.map(line=>line.n),[1,2,3,2]);
  assert.equal(result.cur,3);
  assert.equal(compactManualNumbers(lines,8).cur,4);
  assert.equal(compactManualNumbers([1,2,3,4,5].map(n=>({n})),9).cur,6);
  assert.deepEqual(compactManualNumbers([],9),{lines:[],cur:1});
  assert.deepEqual(result.lines.map(line=>line.p),lines.map(line=>line.p));
});

test('완전히 덮인 POWER를 제외하고 번호만 압축해도 실제 연결 캐비닛과 순서는 유지된다', () => {
  const pixel=JSON.parse(readFileSync(new URL('../data/pixel.json',import.meta.url)));
  const res=calc({widthMm:3000,heightMm:2000,cabW:500,cabH:500,pitch:'2.6-in'},pixel);
  const lines=[{r0:0,r1:1,c0:0,c1:6,n:1,p:'hz-tl'},{r0:0,r1:2,c0:0,c1:6,n:2,p:'hz-tr'},{r0:2,r1:3,c0:0,c1:6,n:3,p:'hz-tl'},{r0:3,r1:4,c0:0,c1:6,n:5,p:'hz-tr'}];
  const old=buildLayout(res,{powerManual:lines});
  const alive=new Set(old.powerAlive);
  const compact=compactManualNumbers(lines.filter((_,i)=>alive.has(i)),8);
  const updated=buildLayout(res,{powerManual:compact.lines});
  assert.deepEqual(updated.powerChains.map(line=>line.id),[1,2,3]);
  assert.equal(compact.cur,4);
  assert.deepEqual(updated.powerChains.map(line=>line.cells.map(cell=>cell.id)),old.powerChains.map(line=>line.cells.map(cell=>cell.id)));
});
