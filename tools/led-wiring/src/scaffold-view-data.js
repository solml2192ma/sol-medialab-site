import { calc } from './calc.js';
import { encodeRows, decodeRows } from './rowplan.js';
import { scaffoldPanel } from './scaffold-panel.js';
import { config } from './config.js';

export function scaffoldViewUrl(input, scaffold) {
  const params = new URLSearchParams({
    w: input.widthMm, h: input.heightMm, cw: input.cabW, ch: input.cabH,
    pitch: input.pitch, bays: scaffold.bays, tiers: scaffold.tiers,
    topPlank: scaffold.topPlank ? '1' : '0',
    baseEnabled: scaffold.baseEnabled ? '1' : '0',
    stageEnabled: scaffold.stageEnabled ? '1' : '0',
  });
  if (input.stageHeightMm != null) params.set('stageHeight', input.stageHeightMm);
  if (input.rowPlan?.length) params.set('rows', encodeRows(input.rowPlan));
  return `scaffold.html?${params}`;
}

export function scaffoldViewData(params, pixelData) {
  const values = Object.fromEntries(['w', 'h', 'cw', 'ch', 'bays', 'tiers'].map(key => [key, Number(params.get(key))]));
  if (Object.values(values).some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('배선도면의 3D도면 자세히보기 버튼에서 열어 주세요.');
  }
  const input = {
    widthMm: values.w, heightMm: values.h, cabW: values.cw, cabH: values.ch,
    bays: values.bays, tiers: values.tiers, pitch: params.get('pitch'), rowPlan: decodeRows(params.get('rows')),
    baseEnabled: params.get('baseEnabled') === '1', stageEnabled: params.get('stageEnabled') === '1',
    stageHeightMm: params.has('stageHeight') && params.get('stageHeight') !== '' ? Number(params.get('stageHeight')) : null,
  };
  const off = calc({ ...input, topPlank: false }, pixelData);
  const on = calc({ ...input, topPlank: true }, pixelData);
  if (!off.scaffold || off.errors.some(message => message.includes('아시바'))) {
    throw new Error('아시바 크기 설정을 확인한 뒤 다시 열어 주세요.');
  }
  const showPanel = params.has('showPanel') ? params.get('showPanel') !== '0' : config.scaffold.showLedPanelDefault;
  return { off: off.scaffold, on: on.scaffold, input, pitch: off.pitchInfo, panel: scaffoldPanel(off, input), topPlank: params.get('topPlank') === '1', showPanel };
}
