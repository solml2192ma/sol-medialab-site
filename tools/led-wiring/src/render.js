// 레이아웃 → SVG 문자열. (PNG/PDF 내보내기에서도 같은 문자열을 사용)
export const LAN_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5',
  '#c2185b', '#7a8b00', '#795548', '#00796b', '#5c6bc0', '#ef6c00',
];
const SMPS_FILL = '#212121';
const MARGIN_L = 8; // 기준 길이 단위(u) 배수
const MARGIN_R = 10;
const DETAIL_MIN_PX = 95; // 칸 한 장이 화면에서 이만큼(px) 커지면 칸 안에 상세 정보를 표시

/** 도면을 displayWidth(px) 너비로 보여줄 때 칸 안 상세 정보를 표시할지 */
export function detailFor(lay, displayWidth) {
  const u = Math.max(lay.totalW, lay.totalH) / 220;
  const vbW = u * (MARGIN_L + MARGIN_R) + lay.totalW;
  const cellPx = (displayWidth * (lay.totalW / lay.cols)) / vbW;
  return cellPx >= DETAIL_MIN_PX;
}

/**
 * @param {object} lay buildLayout() 결과
 * @param {{showLan?: boolean, showPower?: boolean, title?: string, detail?: boolean}} opt
 *   detail=true 이면 칸 안에 UTP 번호·연결 순서·해상도(파워는 포트·그룹)를 적는다
 */
export function renderSvg(lay, opt = {}) {
  const { showLan = true, showPower = true, title = '', detail = false } = opt;
  const W = lay.totalW;
  const H = lay.totalH;
  const u = Math.max(W, H) / 220; // 기준 길이 단위 (선 굵기/글자 크기)
  const marginL = u * MARGIN_L;
  const marginT = u * 14; // 치수선
  const marginR = u * MARGIN_R;
  const legendRows = (showLan ? Math.ceil(lay.lanLines.length / 4) : 0) + (showPower ? Math.ceil(lay.powerChains.length / 4) : 0) + 2;
  const legendH = u * (5 + legendRows * 5);
  const marginB = legendH + u * 4;
  const vbW = marginL + W + marginR;
  const vbH = marginT + H + marginB;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" data-ox="${f(marginL)}" data-oy="${f(marginT)}" viewBox="0 0 ${f(vbW)} ${f(vbH)}" width="${f(vbW)}" height="${f(vbH)}" font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif">`,
  );
  out.push(`<rect width="${f(vbW)}" height="${f(vbH)}" fill="#fff"/>`);
  if (title) out.push(text(marginL, u * 4, title, u * 3.4, '#111', 'start', 'bold'));
  out.push(`<g transform="translate(${f(marginL)} ${f(marginT)})">`);

  // 치수선
  out.push(`<line x1="0" y1="${f(-u * 3)}" x2="${f(W)}" y2="${f(-u * 3)}" stroke="#555" stroke-width="${f(u * 0.3)}"/>`);
  out.push(text(W / 2, -u * 4.2, `${W.toLocaleString()} mm`, u * 3, '#333', 'middle'));
  out.push(`<line x1="${f(W + u * 3)}" y1="0" x2="${f(W + u * 3)}" y2="${f(H)}" stroke="#555" stroke-width="${f(u * 0.3)}"/>`);
  out.push(
    `<text transform="translate(${f(W + u * 6)} ${f(H / 2)}) rotate(90)" font-size="${f(u * 3)}" text-anchor="middle" fill="#333">${H.toLocaleString()} mm</text>`,
  );

  // 캐비닛
  const uncovered = new Set(showLan ? lay.uncovered ?? [] : []);
  for (const c of lay.cells) {
    const fill = uncovered.has(c.id) ? '#ffe0e0' : c.h === 500 && lay.cells.some((x) => x.h !== 500) ? '#e3f2fd' : '#f4f6f8';
    out.push(`<rect x="${f(c.x)}" y="${f(c.y)}" width="${f(c.w)}" height="${f(c.h)}" fill="${fill}" stroke="#78909c" stroke-width="${f(u * 0.25)}"/>`);
    const fs = Math.min(c.w, c.h) * 0.2;
    out.push(text(c.x + c.w * 0.06, c.y + fs * 1.05, String(c.id), fs, '#37474f', 'start'));
  }

  // 파워: UTP처럼 포트(체인)마다 색이 다른 선, 시작 번호 원, 끝 네모, 영역 점선 테두리
  if (showPower) {
    lay.powerChains.forEach((ch) => {
      const color = LAN_COLORS[(ch.id - 1) % LAN_COLORS.length];
      const first = ch.cells[0];
      const last = ch.cells[ch.cells.length - 1];
      const x0 = first.x;
      const x1 = last.x + last.w;
      out.push(`<rect x="${f(x0 + u * 0.4)}" y="${f(ch.y - ch.h / 2 + u * 0.4)}" width="${f(x1 - x0 - u * 0.8)}" height="${f(ch.h - u * 0.8)}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="${f(u * 0.45)}" stroke-dasharray="${f(u * 2)} ${f(u * 1.2)}"/>`);
      const ly = detail ? ch.y - ch.h * 0.25 : ch.y; // 상세 표시 때는 선을 위로 올림
      const pts = ch.cells.map((c) => `${f(c.x + c.w * 0.5)},${f(ly)}`);
      out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${f(u * 0.9)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>`);
      // SMPS 그룹: 둘째 그룹부터 시작 위치에 점, 모든 그룹에 '포트-그룹' 라벨
      ch.smps.forEach((g, gi) => {
        const c0 = g[0];
        if (gi > 0) out.push(`<circle cx="${f(c0.x + c0.w * 0.5)}" cy="${f(ly)}" r="${f(u * 1)}" fill="${SMPS_FILL}"/>`);
        if (!detail) out.push(text(c0.x + c0.w * 0.5 + u * 1.4, ch.y + u * 3.4, `${ch.id}-${gi + 1}`, u * 2.1, SMPS_FILL, 'start')); // 상세 표시 때는 칸 안 '그룹' 줄이 대신함
      });
      out.push(`<circle cx="${f(first.x + first.w * 0.5)}" cy="${f(ly)}" r="${f(u * 1.7)}" fill="${color}"/>`);
      out.push(text(first.x + first.w * 0.5, ly + u * 0.8, String(ch.id), u * 2.3, '#fff', 'middle', 'bold'));
      out.push(`<rect x="${f(last.x + last.w * 0.5 - u * 0.9)}" y="${f(ly - u * 0.9)}" width="${f(u * 1.8)}" height="${f(u * 1.8)}" fill="${color}"/>`);
    });
  }

  // LAN (UTP): 구간(part)마다 선과 영역 테두리, 구간 사이는 점선으로 연결
  if (showLan) {
    const at = (c) => [c.x + c.w * 0.5, c.y + c.h * (detail ? 0.25 : 0.4)]; // 상세 표시 때는 선을 위로 올려 아래 글자 자리 확보
    lay.lanLines.forEach((line) => {
      const color = LAN_COLORS[(line.id - 1) % LAN_COLORS.length];
      const c2 = line.over ? '#d50000' : color;
      line.parts.forEach((part, pi) => {
        const rc = bboxOf(part);
        if (part.length === (rc.r1 - rc.r0 + 1) * (rc.c1 - rc.c0 + 1) || line.over) {
          out.push(`<rect x="${f(rc.x0 + u * 0.4)}" y="${f(rc.y0 + u * 0.4)}" width="${f(rc.x1 - rc.x0 - u * 0.8)}" height="${f(rc.y1 - rc.y0 - u * 0.8)}" fill="${c2}" fill-opacity="0.07" stroke="${c2}" stroke-width="${f(u * (line.over ? 0.8 : 0.45))}" stroke-dasharray="${f(u * 2)} ${f(u * 1.2)}"/>`);
          if (line.over && pi === 0) out.push(text(rc.x0 + u * 1.5, rc.y1 - u * 1.5, '포트 한도 초과', u * 2.4, '#d50000', 'start', 'bold'));
        }
      });
      line.parts.forEach((part, pi) => {
        const pts = part.map((c) => at(c).map(f).join(','));
        out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${f(u * 0.9)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>`);
        if (pi > 0) {
          const [x1, y1] = at(line.parts[pi - 1][line.parts[pi - 1].length - 1]);
          const [x2, y2] = at(part[0]);
          out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${f(u * 0.8)}" stroke-dasharray="${f(u * 1.6)} ${f(u * 1.2)}" stroke-linecap="round" opacity="0.9"/>`);
        }
      });
      const a = line.cells[0];
      const z = line.cells[line.cells.length - 1];
      const [ax, ay] = at(a);
      const [zx, zy] = at(z);
      out.push(`<circle cx="${f(ax)}" cy="${f(ay)}" r="${f(u * 1.7)}" fill="${color}"/>`);
      out.push(text(ax, ay + u * 0.8, String(line.id), u * 2.3, '#fff', 'middle', 'bold'));
      out.push(`<rect x="${f(zx - u * 0.9)}" y="${f(zy - u * 0.9)}" width="${f(u * 1.8)}" height="${f(u * 1.8)}" fill="${color}"/>`);
    });
  }
  // 칸 안 상세 정보 (확대했을 때): 선 위에 흰 테두리 글자로 적어 읽기 쉽게 한다
  if (detail) {
    const lan = new Map();
    for (const l of lay.lanLines) l.cells.forEach((c, i) => lan.set(c.id, { id: l.id, order: i + 1 }));
    const pw = new Map();
    for (const ch of lay.powerChains) {
      ch.smps.forEach((g, gi) => g.forEach((c) => {
        const e = pw.get(c.id) ?? { ids: [], groups: [] };
        e.ids.push(ch.id);
        e.groups.push(`${ch.id}-${gi + 1}`);
        pw.set(c.id, e);
      }));
    }
    for (const c of lay.cells) {
      const rows = [];
      if (showLan && lan.has(c.id)) rows.push(`UTP ${lan.get(c.id).id}`, `${lan.get(c.id).order}번째`);
      if (showPower && pw.has(c.id)) rows.push(`파워 ${pw.get(c.id).ids.join('·')}`, `그룹 ${pw.get(c.id).groups.join('·')}`);
      rows.push(`가로${fmtPx(c.pw)}px`, `세로${fmtPx(c.ph)}px`);
      const fs = Math.min(c.w * 0.165, c.h * 0.165, (c.h * 0.72) / (rows.length * 1.1));
      rows.forEach((s, i) => {
        const y = c.y + c.h - fs * 0.45 - (rows.length - 1 - i) * fs * 1.1; // 아래 테두리와 간격
        out.push(`<text x="${f(c.x + c.w * 0.06)}" y="${f(y)}" font-size="${f(fs)}" fill="#263238" stroke="#fff" stroke-width="${f(fs * 0.22)}" paint-order="stroke" stroke-linejoin="round">${esc(s)}</text>`);
      });
    }
  }
  out.push('</g>');

  // 범례
  const ly = marginT + H + u * 7;
  let row = 0;
  out.push(text(marginL, ly, `LED ${lay.cols}×${lay.rows}열·행${showLan ? ` / UTP ${lay.lanLines.length}줄` : ''}${showPower ? ` / 롱파워 ${lay.powerChains.length}포트` : ''}`, u * 2.8, '#222', 'start', 'bold'));
  if (showLan) {
    lay.lanLines.forEach((line, i) => {
      const col = i % 4;
      const r = Math.floor(i / 4);
      const x = marginL + col * (vbW - marginL - marginR) / 4;
      const y = ly + u * 5 * (r + 1);
      out.push(`<rect x="${f(x)}" y="${f(y - u * 2)}" width="${f(u * 3.5)}" height="${f(u * 1.2)}" fill="${LAN_COLORS[(line.id - 1) % LAN_COLORS.length]}"/>`);
      out.push(text(x + u * 4.5, y - u * 0.3, `UTP ${line.id}: ${line.cells.length}장 (${line.cells[0].id}→${line.cells[line.cells.length - 1].id})`, u * 2.2, '#222', 'start'));
      row = r + 1;
    });
  }
  if (showPower) {
    const base = row;
    lay.powerChains.forEach((ch, i) => {
      const col = i % 4;
      const r = Math.floor(i / 4);
      const x = marginL + col * (vbW - marginL - marginR) / 4;
      const y = ly + u * 5 * (base + r + 1);
      out.push(`<rect x="${f(x)}" y="${f(y - u * 2)}" width="${f(u * 3.5)}" height="${f(u * 1.2)}" fill="${LAN_COLORS[(ch.id - 1) % LAN_COLORS.length]}"/>`);
      out.push(text(x + u * 4.5, y - u * 0.3, `파워 ${ch.id}: ${ch.cells.length}장 (${ch.cells[0].id}→${ch.cells[ch.cells.length - 1].id})`, u * 2.2, '#222', 'start'));
      row = base + r + 1;
    });
    const y = ly + u * 5 * (row + 1);
    out.push(`<circle cx="${f(marginL + u * 1)}" cy="${f(y - u)}" r="${f(u * 1)}" fill="${SMPS_FILL}"/>`);
    out.push(text(marginL + u * 3, y, `SMPS 그룹 시작 (라벨 = 포트-그룹 번호, 그룹당 ${lay.powerChains[0]?.smps[0]?.length ?? 0}장)`, u * 2.2, '#222', 'start'));
  }
  out.push('</svg>');
  return out.join('');
}

const f = (n) => Math.round(n * 100) / 100;
const fmtPx = (n) => (Number.isInteger(n) ? String(n) : String(f(n)));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function text(x, y, s, size, fill, anchor = 'start', weight = 'normal') {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
}

/**
 * 내보내기용: 위에 UTP(LAN) 도면, 아래에 파워 도면을 세로로 쌓은 SVG.
 * sized=false 이면 width/height 없이 viewBox만 둔다 (인쇄 화면에서 CSS로 크기를 맞출 때).
 */
export function renderCombined(lay, opt = {}) {
  const { title = '', sized = true, detail = false } = opt;
  const a = renderSvg(lay, { showLan: true, showPower: false, detail, title: `${title}${title ? ' — ' : ''}UTP(LAN) 배선` });
  const b = renderSvg(lay, { showLan: false, showPower: true, detail, title: `${title}${title ? ' — ' : ''}파워 배선` });
  const dim = (s) => {
    const m = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    return [Number(m[1]), Number(m[2])];
  };
  const [aw, ah] = dim(a);
  const [bw, bh] = dim(b);
  const W = Math.max(aw, bw);
  const H = ah + bh;
  const place = (s, y) => s.replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg x="0" y="${f(y)}" xmlns="http://www.w3.org/2000/svg"`);
  const size = sized ? ` width="${f(W)}" height="${f(H)}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}"${size} font-family="Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif">` +
    `<rect width="${f(W)}" height="${f(H)}" fill="#fff"/>${place(a, 0)}${place(b, ah)}` +
    `<line x1="0" y1="${f(ah)}" x2="${f(W)}" y2="${f(ah)}" stroke="#b0bec5" stroke-width="${f(W / 600)}" stroke-dasharray="${f(W / 120)} ${f(W / 200)}"/></svg>`
  );
}

function bboxOf(cs) {
  return cs.reduce(
    (m, c) => ({ x0: Math.min(m.x0, c.x), y0: Math.min(m.y0, c.y), x1: Math.max(m.x1, c.x + c.w), y1: Math.max(m.y1, c.y + c.h), r0: Math.min(m.r0, c.row), r1: Math.max(m.r1, c.row), c0: Math.min(m.c0, c.col), c1: Math.max(m.c1, c.col) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, r0: Infinity, r1: -Infinity, c0: Infinity, c1: -Infinity },
  );
}
