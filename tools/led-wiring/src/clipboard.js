import { buildReport } from './report.js?base=1';
import { scaffoldTitle } from './scaffold-view-data.js?base=1';
import { outputWarnings } from './output-warnings.js?outputs=1';

/** 화면·엑셀과 같은 계산 결과로 메신저에 붙여 넣을 텍스트를 만든다. */
export function buildClipboardText({ res, lay, input }) {
  const report = buildReport(res, lay, input);
  const boxes = report.sections.find(s => s.title === '박스').rows;
  const cabinet = row => row[0].replaceAll('×', '*');
  const sc = res.scaffold;
  const size = report.sections.find(s => s.title === '아시바').rows[0][1];
  const parts = [`아시바 기둥${sc.posts}ea`];
  const warnings = outputWarnings(res, lay, input);
  if (sc.shortPosts > 0) parts.push(`짧은기둥${sc.shortPosts}ea`);
  parts.push(`x바${sc.xBars}ea`, `발판${sc.planks}ea`);
  return [
    ...(warnings.length ? ['주의', ...warnings, ''] : []),
    res.pitchInfo.label,
    `${input.widthMm}*${input.heightMm}mm`,
    ...boxes.map(row => `박스 ${cabinet(row)} 필요수량${row[1]}ea ${row[2] || ''} 출고수량${row[3] == null ? '-' : `${row[3]}ea`} (${row[7] ?? '-'}box)`),
    `해상도 ${res.pixel.resolution.w}*${res.pixel.resolution.h}px`,
    `랜포트 ${lay.lanLines.length}개`,
    `파워포트 ${lay.powerChains.length}개`,
    '', `${scaffoldTitle(sc)} (${size})`, parts.join(' / '),
    ...(sc.baseEnabled ? [`베이스 ${sc.basePlan.items.filter(item => item.count > 0).map(item => `${(item.lengthMm / 1000).toFixed(1)}*${item.count}ea`).join(' / ') || '0ea'}`] : []),
  ].join('\n');
}

export async function copyClipboardText(ctx) {
  const text = buildClipboardText(ctx);
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* 구형·권한 제한 브라우저는 선택 복사로 재시도 */ }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;left:-9999px;top:0';
  field.setAttribute('readonly', '');
  document.body.appendChild(field);
  const previous = document.activeElement;
  try {
    field.select();
    if (!document.execCommand('copy')) throw new Error('클립보드에 복사하지 못했습니다. 다시 시도해 주세요.');
  } finally { field.remove(); previous?.focus(); }
}
