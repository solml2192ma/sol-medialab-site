import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedLanNumber, reorderLan } from '../src/manual-order.js';

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
