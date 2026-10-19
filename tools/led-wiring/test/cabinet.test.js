import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cabinetOptions, normalizeCabinetState } from '../src/cabinet.js';

const pixel = JSON.parse(readFileSync(new URL('../data/pixel.json', import.meta.url)));

test('빈 픽셀피치와 캐비닛 선택은 초기화 후에도 자동으로 채워지지 않는다', () => {
  const state = { pitch: '', cab: '', w: '', h: '', rows: '' };
  assert.deepEqual(cabinetOptions('', pixel), []);
  assert.deepEqual(normalizeCabinetState(state, pixel), state);
  for (const pitch of Object.keys(pixel.pitches)) {
    const partial = { ...state, pitch };
    assert.deepEqual(normalizeCabinetState(partial, pixel), partial);
  }
});

test('픽셀피치 미선택 상태에서 남은 캐비닛 규격은 빈 선택으로 전환한다', () => {
  const state = { pitch: '', cab: '500x1000', rows: '500-1000' };
  assert.deepEqual(normalizeCabinetState(state, pixel), { ...state, cab: '', rows: '' });
});

test('p1.5, p2.6 두 제조사, p4.8은 500×500만 선택 가능', () => {
  for (const pitch of ['1.5-in', '2.6-in', '2.6-flex-in', '4.8-out', 1.5, 2.6, 4.8]) {
    assert.deepEqual(cabinetOptions(pitch, pixel).map((option) => option.value), ['500x500']);
  }
});

test('제한된 피치로 변경하거나 저장 상태를 복원하면 다른 규격과 행 배치를 보정한다', () => {
  for (const pitch of ['1.5-in', '2.6-in', '2.6-flex-in', '4.8-out']) {
    for (const cab of ['500x1000', 'custom', 'broken']) {
      const state = { pitch, cab, rows: '500-1000-1000', w: '6000', h: '2500', pat: 'hz-tr' };
      assert.deepEqual(normalizeCabinetState(state, pixel), { ...state, cab: '500x500', rows: '' });
      assert.equal(state.cab, cab);
    }
  }
});

test('p3.9 인도어/아웃도어는 표준 두 규격과 사용자 행 배치를 유지한다', () => {
  for (const pitch of ['3.9-in', '3.9-out']) {
    assert.deepEqual(cabinetOptions(pitch, pixel).map((option) => option.value), ['500x1000', '500x500']);
    for (const cab of ['500x500', '500x1000']) {
      const state = { pitch, cab, rows: '500-1000-1000' };
      assert.deepEqual(normalizeCabinetState(state, pixel), state);
    }
  }
});

test('모든 피치에서 직접 입력을 제거하고 기존 custom 저장값은 500×500으로 전환한다', () => {
  for (const pitch of Object.keys(pixel.pitches)) {
    assert.ok(cabinetOptions(pitch, pixel).every((option) => option.value !== 'custom'));
    const state = { pitch, cab: 'custom', cw: '600', ch: '337.5', rows: '1000-500' };
    assert.deepEqual(normalizeCabinetState(state, pixel), { ...state, cab: '500x500', rows: '' });
  }
});
