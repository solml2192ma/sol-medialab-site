// 브라우저 내보내기: PNG / 엑셀 / 인쇄(PDF)
import { renderCombined, detailFor } from './render.js?png-brand=1';
import { makeXlsx } from './xlsx.js';
import { buildReport } from './report.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function fileBase(ctx) {
  const { input } = ctx;
  return `LED배선도_${input.widthMm}x${input.heightMm}_${ctx.res.pitchInfo.id}`;
}

// 위: LAN 도면 / 아래: POWER 도면
export async function exportPng(ctx) {
  const logo = document.querySelector('.company-logo');
  if (!logo) throw new Error('회사 로고를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  await logo.decode();
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = logo.naturalWidth;
  logoCanvas.height = logo.naturalHeight;
  logoCanvas.getContext('2d').drawImage(logo, 0, 0);
  const logoDataUrl = logoCanvas.toDataURL('image/png');
  // 칸이 충분히 크면(가로 3200px 기준) 칸 안에 LAN 번호·순서·해상도도 함께 적는다
  const svg = renderCombined(ctx.lay, { title: ctx.title, detail: detailFor(ctx.lay, 3200), logoDataUrl });
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const ratio = Number(vb[2]) / Number(vb[1]);
  const width = 3200; // 인쇄해도 선명한 크기
  const height = Math.round(width * ratio);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('SVG 이미지를 만들지 못했습니다.')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, width, height);
  g.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('이미지가 너무 커서 만들지 못했습니다.');
  download(blob, `${fileBase(ctx)}.png`);
}

export function exportXlsx(ctx) {
  const { inputs, sections } = buildReport(ctx.res, ctx.lay, ctx.input, ctx.dir);
  const rows = [[{ v: 'LED 배선도면 자재표', bold: true }], ...inputs.map(([k, v]) => [{ v: k, bold: true }, v]), []];
  for (const s of sections) {
    rows.push([{ v: s.title, bold: true }]);
    rows.push(s.header.map((h) => ({ v: h, fill: true })));
    rows.push(...s.rows.map((row) => row.map((v, i) => {
      const bold = s.title === '박스'
        ? typeof v === 'number' && ['출고수량', '출고박스'].includes(s.header[i])
        : typeof v === 'number' || (i === 1 && s.header[i] === '수량');
      return bold ? { v, bold: true } : v;
    })));
    rows.push([]);
  }
  const bytes = makeXlsx(rows, { sheetName: '자재표', widths: [24, 18, 22, 14, 14] });
  download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(ctx)}.xlsx`);
}

// 도면+자재표를 인쇄 레이아웃으로 보여 주고 브라우저 인쇄 창을 연다 (PDF로 저장 가능, 폰/태블릿 포함)
export function printPdf() {
  window.print();
}
