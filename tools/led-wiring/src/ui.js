import { config } from './config.js';
import { calc, findPitch } from './calc.js';
import { buildLayout, PATTERNS, patternOf, orderRect, encodeManual, decodeManual, nextFreeNumber, limitError } from './layout.js';
import { renderSvg, renderCombined, detailFor, LAN_COLORS } from './render.js';
import { buildReport } from './report.js';
import { encodeRows, decodeRows, sameRows, movePlan, splitRow, mergeRows, canMerge } from './rowplan.js';
import { exportPng, exportXlsx, printPdf } from './export.js';

const $ = (s) => document.querySelector(s);
const form = $('#form');
const DEFAULTS = {
  w: '8000', h: '4000', cab: '500x500', cw: '500', ch: '500', boxQty: '', pitch: '2.6-in',
  pat: config.defaultDirection, mode: 'auto', ml: '', maxPerLine: '', perSmps: String(config.power.cabinetsPerSmps),
  bays: '', tiers: '', topPlank: '1', tab: 'lan', cur: '1', rows: '',
};
const STORE = 'led-wiring:v1';
let pixelData;
let zoom = 1;
let last = null; // 마지막 계산 결과 (내보내기에서 사용)
let detailOn = false; // 칸 안 상세 정보 표시 여부 (확대 정도에 따라 자동)
const displayWidth = () => Math.max(280, $('#canvas').clientWidth - 2) * zoom;

const num = (v) => (v === '' || v == null ? null : Number(v));
const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));

function readState() {
  const s = { ...DEFAULTS };
  const fd = new FormData(form);
  for (const k of Object.keys(DEFAULTS)) if (fd.has(k)) s[k] = fd.get(k);
  s.topPlank = form.topPlank.checked ? '1' : '0';
  return s;
}

function writeState(s) {
  for (const [k, v] of Object.entries(s)) {
    const el = form.elements[k];
    if (el && el.type !== 'checkbox') el.value = v;
  }
  form.topPlank.checked = s.topPlank !== '0';
}

function loadState() {
  const s = { ...DEFAULTS };
  try { Object.assign(s, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch { /* 저장소 사용 불가 */ }
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) s[k] = q.get(k);
  if (q.has('dir') && !q.has('pat')) s.pat = q.get('dir'); // 구버전 URL
  s.pat = patternOf(s.pat).id;
  return s;
}

function saveState(s) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v !== '' && v !== DEFAULTS[k]) q.set(k, v);
  const qs = q.toString();
  try { history.replaceState(null, '', qs ? `?${qs}` : location.pathname); } catch { /* iframe 등 */ }
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* 저장소 사용 불가 */ }
}

function toInput(s) {
  const custom = s.cab === 'custom';
  const [cw, ch] = custom ? [num(s.cw), num(s.ch)] : s.cab.split('x').map(Number);
  return {
    widthMm: num(s.w), heightMm: num(s.h), cabW: cw, cabH: ch, pitch: s.pitch,
    boxQty: custom ? num(s.boxQty) : null,
    bays: num(s.bays), tiers: num(s.tiers), topPlank: s.topPlank !== '0',
    rowPlan: decodeRows(s.rows),
  };
}

function toConfig(s) {
  return {
    ...config,
    lan: { ...config.lan, maxCabinetsPerLine: num(s.maxPerLine) ?? config.lan.maxCabinetsPerLine },
    power: { ...config.power, cabinetsPerSmps: Math.max(1, num(s.perSmps) ?? config.power.cabinetsPerSmps) },
  };
}

function update() {
  try {
    render();
  } catch (e) {
    console.error(e);
    last = null;
    $('#msgs').innerHTML = `<p class="err">계산 중 오류가 발생했습니다: ${esc(e.message)} — 입력값을 확인하거나 '초기화'를 눌러 주세요.</p>`;
  }
}

function render() {
  const s = readState();
  form.querySelector('.custom').hidden = s.cab !== 'custom';
  saveState(s);
  const input = toInput(s);
  // 비워둔 값은 calc가 자동 산출하도록 undefined로 넘긴다
  for (const k of ['bays', 'tiers']) if (input[k] == null) delete input[k];
  const cfg = toConfig(s);
  const res = calc(input, pixelData, cfg);

  const msgs = [...res.errors.map((m) => `<p class="err">${m}</p>`), ...res.warnings.map((m) => `<p class="warn">${m}</p>`)];
  if (res.rowPlanIgnored) { form.rows.value = ''; saveState({ ...s, rows: '' }); } // 크기가 바뀌어 맞지 않는 행 배치는 기본으로 되돌림
  renderRowPlan(res, input);
  const blocked = !res.grid || res.errors.some((e) => !e.includes('1박스 수량') && !e.includes('아시바'));
  syncWiringUi(s);
  if (blocked) { $('#msgs').innerHTML = msgs.join(''); $('#canvas').innerHTML = ''; $('#printCanvas').innerHTML = ''; $('#tables').innerHTML = ''; $('#lineList').innerHTML = ''; last = null; return; }

  const manual = s.mode === 'manual' ? decodeManual(s.ml) : null;
  const lay = buildLayout(res, { pattern: s.pat, manual }, cfg);
  msgs.push(...lay.warnings.map((m) => `<p class="warn">${esc(m)}</p>`));
  $('#msgs').innerHTML = msgs.join('');
  const title = `LED ${fmt(input.widthMm)}×${fmt(input.heightMm)}mm · ${res.pitchInfo.label} · ${input.cabW}×${input.cabH}`;
  last = { s, input, res, lay, cfg, title };
  detailOn = detailFor(lay, displayWidth());
  const svg = renderSvg(lay, { showLan: s.tab !== 'pw', showPower: s.tab === 'pw', title, detail: detailOn });
  $('#canvas').innerHTML = svg;
  $('#printCanvas').innerHTML = renderCombined(lay, { title, sized: false }); // 인쇄(PDF)용: UTP 위, 파워 아래
  applyZoom();
  bindDraw($('#canvas svg'), lay, s);
  renderLineList(lay, s);
  const rep = buildReport(res, lay, input);
  $('#tables').innerHTML = tables(rep);
  $('#printHead').innerHTML = `<h1>LED 설치 배선도 · SOL MEDIA LAB</h1><p>${rep.inputs.map(([k, v]) => `${k}: ${esc(v)}`).join(' / ')}</p>`;
}

// ---------- LAN 배선 UI (패턴 아이콘 / 직접 그리기) ----------
function patternIcon(p) {
  const N = 3, S = 14, pad = 3;
  const seq = orderRect({ r0: 0, r1: N, c0: 0, c1: N }, p).map(([r, c]) => [pad + c * S + S / 2, pad + r * S + S / 2]);
  let g = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g += `<rect x="${pad + c * S + 1}" y="${pad + r * S + 1}" width="${S - 2}" height="${S - 2}" rx="2" fill="#eceff1" stroke="#90a4ae"/>`;
  for (let i = 1; i < seq.length; i++) {
    const adj = Math.abs(seq[i][0] - seq[i - 1][0]) + Math.abs(seq[i][1] - seq[i - 1][1]) === S;
    g += `<line x1="${seq[i - 1][0]}" y1="${seq[i - 1][1]}" x2="${seq[i][0]}" y2="${seq[i][1]}" stroke="${adj ? '#1d4ed8' : '#9fb3e8'}" stroke-width="2.2" ${adj ? '' : 'stroke-dasharray="2 2"'} stroke-linecap="round"/>`;
  }
  const [sx, sy] = seq[0];
  const [ex, ey] = seq[seq.length - 1];
  g += `<circle cx="${sx}" cy="${sy}" r="3.6" fill="#d50000"/><rect x="${ex - 3}" y="${ey - 3}" width="6" height="6" fill="#1d4ed8"/>`;
  const size = N * S + pad * 2;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${g}</svg>`;
}

function buildPatternButtons() {
  $('#patterns').innerHTML = PATTERNS.map((p) => `<button type="button" data-id="${p.id}" title="${p.label}" aria-label="${p.label}" aria-pressed="false">${patternIcon(p)}</button>`).join('');
  $('#patterns').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    form.pat.value = b.dataset.id;
    update();
  });
}

function syncWiringUi(s) {
  const manual = s.mode === 'manual';
  $('#manualTools').hidden = !manual;
  document.body.dataset.tab = s.tab === 'pw' ? 'pw' : 'lan';
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === document.body.dataset.tab));
  const pat = patternOf(s.pat);
  for (const b of $('#patterns').children) b.setAttribute('aria-pressed', String(b.dataset.id === pat.id));
  $('#patLabel').textContent = `${manual ? '그릴 때 쓸 패턴' : '자동 배선 패턴'}: ${pat.label} (● 시작 / ■ 끝)`;
}

function renderLineList(lay, s) {
  const ul = $('#lineList');
  $('#lineNotice').hidden = true;
  if (s.mode !== 'manual') { ul.innerHTML = ''; return; }
  ul.innerHTML = lay.lanLines
    .map((l) => `<li data-n="${l.id}" class="${l.over ? 'over' : ''}${l.id === Number(s.cur) ? ' cur' : ''}"><span class="sw" style="background:${LAN_COLORS[(l.id - 1) % LAN_COLORS.length]}"></span><label class="num">UTP <input type="number" min="1" step="1" inputmode="numeric" value="${l.id}" data-n="${l.id}" aria-label="UTP 포트 번호"></label><span class="t">${l.cells.length}장${l.parts.length > 1 ? ` · ${l.parts.length}구간` : ''} · ${esc(patternOf(l.pattern).label)}${l.over ? ' · 한도 초과' : ''}${l.id === Number(s.cur) ? ' · 그리는 중' : ''}</span><button type="button" data-n="${l.id}" aria-label="UTP ${l.id} 삭제">✕</button></li>`)
    .join('');
}

// 나중에 그린 줄에 완전히 덮여 보이지 않게 된 줄은 목록에서 정리 (번호가 숨은 채 남지 않도록)
function pruneHidden(lines) {
  if (!last) return lines;
  const lay = buildLayout(last.res, { pattern: last.s.pat, manual: lines }, last.cfg);
  const alive = new Set(lay.alive);
  return lines.filter((_, i) => alive.has(i));
}

function showError(title, body) {
  const d = $('#errDialog');
  $('#errTitle').textContent = title;
  $('#errBody').textContent = body;
  if (d.showModal) d.showModal();
  else alert(`${title}\n${body}`);
}

// ---------- 행 배치 편집 (1000 캐비닛 등) ----------
function renderRowPlan(res, input) {
  const box = $('#rowPlanBox');
  const base = config.baseCabinetMm;
  const show = !!res.grid && input.cabH > base && input.cabH % base === 0;
  box.hidden = !show;
  if (!show) { $('#rowPlanList').innerHTML = ''; return; }
  const plan = res.rowPlan;
  const k = input.cabH / base;
  $('#rowPlanList').innerHTML = plan
    .map((h, i) => {
      const main = h === input.cabH;
      const act = main
        ? `<button type="button" data-act="split" data-i="${i}" title="${input.cabH}을 ${base} ${k}줄로 나누기">${base} ${k}줄로</button>`
        : `<button type="button" data-act="merge" data-i="${i}" ${canMerge(plan, i, input.cabH, base) ? '' : 'disabled'} title="아래 ${k - 1}줄과 합쳐 ${input.cabH} 한 줄로">합치기</button>`;
      return `<li><span class="rp"><span class="bar" style="height:${Math.max(8, h / 40)}px"></span>${i + 1}줄 · ${input.cabW}×${h}</span><button type="button" data-act="up" data-i="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-act="down" data-i="${i}" aria-label="아래로" ${i === plan.length - 1 ? 'disabled' : ''}>▼</button>${act}</li>`;
    })
    .join('');
}

// 행 배치를 바꾸면 격자가 달라지므로 직접 그린 UTP 줄은 지운다 (확인 후)
function applyRowPlan(next) {
  if (!last) return;
  const def = last.res.rowPlanDefault;
  if (form.ml.value && !confirm('행 배치를 바꾸면 직접 그린 UTP 줄이 모두 지워집니다. 계속할까요?')) return;
  form.rows.value = sameRows(next, def) ? '' : encodeRows(next);
  if (form.ml.value) { form.ml.value = ''; form.cur.value = '1'; }
  update();
}

function setManual(lines) {
  form.ml.value = encodeManual(lines);
  update();
}

function bindDraw(svg, lay, s) {
  const canvas = $('#canvas');
  const manual = s.mode === 'manual' && s.tab !== 'pw'; // 직접 그리기는 UTP 탭에서만
  const pan = $('#panMode').checked;
  canvas.classList.toggle('draw', manual);
  canvas.classList.toggle('pan', manual && pan);
  if (!manual || !svg || pan) return;
  const NS = 'http://www.w3.org/2000/svg';
  const ox = Number(svg.dataset.ox);
  const oy = Number(svg.dataset.oy);
  const ov = document.createElementNS(NS, 'rect');
  const u = lay.totalW / 220;
  ov.setAttribute('fill', 'rgba(29,78,216,.18)');
  ov.setAttribute('stroke', '#1d4ed8');
  ov.setAttribute('stroke-width', String(Math.max(u * 0.8, 2)));
  ov.setAttribute('visibility', 'hidden');
  ov.setAttribute('pointer-events', 'none');
  svg.appendChild(ov);

  const cellAt = (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.min(Math.max(p.x - ox, 0), lay.totalW - 1);
    const y = Math.min(Math.max(p.y - oy, 0), lay.totalH - 1);
    return lay.cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  };
  const box = (a, b) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x + a.w, b.x + b.w), y1: Math.max(a.y + a.h, b.y + b.h) });
  let start = null;
  const show = (a, b) => {
    const r = box(a, b);
    ov.setAttribute('x', ox + r.x0);
    ov.setAttribute('y', oy + r.y0);
    ov.setAttribute('width', r.x1 - r.x0);
    ov.setAttribute('height', r.y1 - r.y0);
    ov.setAttribute('visibility', 'visible');
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    start = cellAt(e);
    if (!start) return;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    show(start, start);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!start) return;
    const cur = cellAt(e);
    if (cur) show(start, cur);
  });
  svg.addEventListener('pointerup', (e) => {
    if (!start) return;
    const end = cellAt(e) ?? start;
    const a = start;
    start = null;
    const lines = decodeManual(s.ml);
    const cur = Number(s.cur);
    const n = Number.isInteger(cur) && cur >= 1 ? cur : nextFreeNumber(lines);
    // 번호는 사용자가 바꾸기 전까지 그대로: 같은 번호로 그리면 그 UTP의 다음 구간이 된다
    const next = [...lines, { r0: Math.min(a.row, end.row), r1: Math.max(a.row, end.row) + 1, c0: Math.min(a.col, end.col), c1: Math.max(a.col, end.col) + 1, p: s.pat, n }];
    // 이 구간 때문에 UTP가 포트 한도를 넘으면 도면에 반영하지 않고 오류 창을 띄운다
    const err = last && limitError(buildLayout(last.res, { pattern: s.pat, manual: next }, last.cfg), n);
    if (err) {
      ov.setAttribute('visibility', 'hidden');
      showError(err.title, err.detail);
      return;
    }
    setManual(pruneHidden(next));
  });
  svg.addEventListener('pointercancel', () => { start = null; ov.setAttribute('visibility', 'hidden'); });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function tables(rep) {
  return rep.sections
    .map((sec) => {
      const numCol = (i) => sec.rows.some((r) => typeof r[i] === 'number');
      const head = sec.header.map((h, i) => `<th${numCol(i) ? ' class="n"' : ''}>${h}</th>`).join('');
      const body = sec.rows
        .map((r) => `<tr>${r.map((v, i) => `<td${typeof v === 'number' ? ' class="n"' : ''}>${v == null ? '-' : esc(typeof v === 'number' ? fmt(v) : v)}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="sec"${sec.tab ? ` data-tab="${sec.tab}"` : ''}><h2>${sec.title}</h2><div class="tw"><table><tr>${head}</tr>${body}</table></div></div>`;
    })
    .join('');
}

function applyZoom() {
  const svg = $('#canvas svg');
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const w = displayWidth();
  svg.setAttribute('width', w);
  svg.setAttribute('height', (w * vb.height) / vb.width);
  // 확대/축소로 칸이 충분히 커지거나 작아지면 칸 안 상세 정보를 켜고 끈다
  if (last && detailFor(last.lay, w) !== detailOn) update();
}

function init() {
  const pitchSel = form.pitch;
  pitchSel.innerHTML = Object.entries(pixelData.pitches).map(([id, p]) => `<option value="${id}">${p.label}</option>`).join('');
  buildPatternButtons();
  const st = loadState();
  st.pitch = findPitch(pixelData, st.pitch)?.id ?? DEFAULTS.pitch; // 구버전 값(2.6 등)도 허용
  writeState(st);
  // UTP 번호 입력칸은 타이핑 중에 다시 그리면 포커스를 잃으므로 폼 공통 갱신에서 제외 (아래 change 핸들러가 처리)
  const inList = (e) => e.target.closest?.('#lineList');
  form.addEventListener('input', (e) => { if (!inList(e)) update(); });
  form.addEventListener('change', (e) => { if (!inList(e)) update(); });
  $('#rowPlanList').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || !last) return;
    const i = Number(b.dataset.i);
    const plan = last.res.rowPlan;
    const { cabH } = last.input;
    const base = config.baseCabinetMm;
    const ops = { up: () => movePlan(plan, i, -1), down: () => movePlan(plan, i, 1), split: () => splitRow(plan, i, cabH, base), merge: () => mergeRows(plan, i, cabH, base) };
    const next = ops[b.dataset.act]?.();
    if (next && !sameRows(next, plan)) applyRowPlan(next);
  });
  $('#rowReset').addEventListener('click', () => { if (last && form.rows.value) applyRowPlan(last.res.rowPlanDefault); });
  $('#mUndo').addEventListener('click', () => setManual(decodeManual(form.ml.value).slice(0, -1)));
  $('#mClear').addEventListener('click', () => { form.cur.value = '1'; setManual([]); });
  $('#mNew').addEventListener('click', () => { form.cur.value = String(nextFreeNumber(decodeManual(form.ml.value))); update(); });
  // 자동 → 직접 그리기로 처음 넘어올 때(그린 줄이 없을 때) 자동 배선 결과를 출발점으로 채워 준다
  for (const r of form.querySelectorAll('input[name=mode]')) {
    r.addEventListener('change', () => {
      if (r.value !== 'manual' || !r.checked || form.ml.value || !last) return;
      const pat = form.pat.value;
      const a = buildLayout(last.res, { pattern: pat }, last.cfg);
      const filled = a.lanLines.map((l, i) => ({ r0: l.rect.r0, c0: l.rect.c0, r1: l.rect.r1, c1: l.rect.c1, p: pat, n: i + 1 }));
      form.ml.value = encodeManual(filled);
      form.cur.value = String(nextFreeNumber(filled)); // 채워진 줄에 덧붙지 않고 새 UTP에서 시작
    });
  }
  $('#lineList').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-n]');
    if (!inp) return;
    const old = Number(inp.dataset.n);
    const n = Number(inp.value);
    const lines = decodeManual(form.ml.value);
    const notice = (msg) => { inp.value = String(old); $('#lineNotice').textContent = msg; $('#lineNotice').hidden = false; };
    if (!Number.isInteger(n) || n < 1) return notice('UTP 번호는 1 이상의 정수여야 합니다.');
    if (n !== old && lines.some((l) => l.n === n)) return notice(`UTP ${n}번은 이미 다른 줄이 사용 중입니다. 다른 번호를 입력해 주세요.`);
    for (const l of lines) if (l.n === old) l.n = n; // 이 UTP의 모든 구간 번호만 바꾼다 (다른 줄은 그대로)
    if (Number(form.cur.value) === old) form.cur.value = String(n); // 그리는 중이던 UTP면 번호를 따라간다
    setManual(lines);
  });
  $('#lineList').addEventListener('click', (e) => {
    const del = e.target.closest('button[data-n]');
    if (del) {
      const n = Number(del.dataset.n);
      setManual(decodeManual(form.ml.value).filter((l) => l.n !== n)); // 그 UTP의 모든 구간 삭제 (다른 번호는 그대로)
      return;
    }
    if (e.target.closest('input')) return;
    const li = e.target.closest('li[data-n]');
    if (li) { form.cur.value = li.dataset.n; update(); } // 목록에서 골라 그 UTP를 이어서 그린다
  });
  $('#panMode').addEventListener('change', update);
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => { form.tab.value = b.dataset.tab; update(); });
  $('#reset').addEventListener('click', () => { writeState(DEFAULTS); update(); });
  $('#zoomIn').addEventListener('click', () => { zoom = Math.min(8, zoom * 1.25); applyZoom(); });
  $('#zoomOut').addEventListener('click', () => { zoom = Math.max(0.5, zoom / 1.25); applyZoom(); });
  $('#zoomFit').addEventListener('click', () => { zoom = 1; applyZoom(); });
  window.addEventListener('resize', applyZoom);
  const guard = (fn) => async () => {
    if (!last) return alert('먼저 오류 없이 도면을 만들어 주세요.');
    try { await fn(); } catch (e) { alert(e.message); }
  };
  $('#expPng').addEventListener('click', guard(() => exportPng(last)));
  $('#expXlsx').addEventListener('click', guard(() => exportXlsx(last)));
  $('#expPdf').addEventListener('click', guard(() => printPdf()));
  update();
}

fetch(new URL('../data/pixel.json', import.meta.url))
  .then((r) => r.json())
  .catch(() => {
    $('#msgs').innerHTML = '<p class="err">data/pixel.json을 불러오지 못했습니다. 파일로 직접 열지 말고 start.bat 또는 웹서버(http)로 열어 주세요.</p>';
    return null;
  })
  .then((d) => {
    if (!d) return;
    pixelData = d;
    init();
  });

export const getLast = () => last; // 내보내기 모듈용
