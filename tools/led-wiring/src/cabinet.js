// 피치별 캐비닛 선택과 저장 상태 보정. 규칙은 config / pixel.json에서 가져온다.
import { config } from './config.js';
import { findPitch } from './calc.js';

export function cabinetOptions(pitch, pixelData, cfg = config) {
  const info = findPitch(pixelData, pitch);
  if (!info) return [];
  const allowed = info.allowedCabinets;
  return cfg.cabinetOptions.filter((option) => !allowed || allowed.includes(option.value));
}

export function normalizeCabinetState(state, pixelData, cfg = config) {
  if (state.cab === '') return { ...state }; // 미선택 상태는 자동으로 채우지 않는다.
  const options = cabinetOptions(state.pitch, pixelData, cfg);
  if (options.some((option) => option.value === state.cab)) return { ...state };
  return { ...state, cab: options[0]?.value ?? '', rows: '' };
}
