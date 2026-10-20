import { config } from './config.js';

/** LED 뒷면 구획: 계산된 행 배치(위→아래)를 실제 mm 좌표로 옮긴다. */
export function scaffoldPanel(result, input, cfg = config) {
  const { horizontal, vertical } = cfg.scaffold.ledPanelAlignment;
  const offsetX = horizontal === 'center' ? (result.scaffold.widthM * 1000 - input.widthMm) / 2 : 0;
  const offsetY = vertical === 'bottom' ? result.scaffold.ledBottomMm : result.scaffold.heightM * 1000 - input.heightMm;
  let rowTop = input.heightMm + offsetY;
  const cabinets = [];
  for (const rowHeight of result.rowPlan) {
    rowTop -= rowHeight;
    for (let col = 0; col < result.grid.cols; col++) {
      cabinets.push({ x: offsetX + col * input.cabW, y: rowTop, w: input.cabW, h: rowHeight });
    }
  }
  const installationBoxes = [];
  const addBox = (kind, y, h) => {
    if (h > 0) installationBoxes.push({ kind, x: offsetX, y, w: input.widthMm, h, depthMm: result.pitchInfo.thicknessMm ?? 0 });
  };
  addBox('stage', 0, result.scaffold.stageHeightMm);
  addBox('base', result.scaffold.stageHeightMm, result.scaffold.baseHeightMm);
  return {
    widthMm: input.widthMm, heightMm: input.heightMm,
    thicknessMm: result.pitchInfo.thicknessMm,
    offsetX, offsetY, cabinets, installationBoxes,
  };
}
