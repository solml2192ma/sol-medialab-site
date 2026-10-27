import { config } from './config.js';
import { calc, findPitch } from './calc.js';
import { cabinetOptions, normalizeCabinetState } from './cabinet.js';
import { buildLayout, PATTERNS, patternOf, orderRect, encodeManual, decodeManual, nextFreeNumber, limitError } from './layout.js';
import { renderSvg, detailFor, LAN_COLORS } from './render.js';
import { buildReport } from './report.js';
import { encodeRows, decodeRows, sameRows, movePlan, splitRow, mergeRows, canMerge } from './rowplan.js';
import { exportPng, exportXlsx, printPdf } from './export.js';
import { scaffoldViewUrl } from './scaffold-view-data.js';
import { allowedLanNumber, reorderLan } from './manual-order.js';

const $ = (s) => document.querySelector(s);
const form = $('#form');
window.addEventListener('beforeprint', () => {
  const preview = $('.scaffold-preview');
  const scene = preview?.querySelector('iframe')?.contentDocument?.querySelector('.scaffold-scene');
  const printModel = preview?.querySelector('.scaffold-print-model');
  if (printModel) printModel.innerHTML = scene?.outerHTML ?? '';
});
const DEFAULTS = {
  ...config.emptyInputs,
  pat: config.defaultDirection, mode: 'auto', ml: '',
  powerPat: config.defaultDirection, powerMode: 'auto', powerMl: '', powerCur: '',
  topPlank: config.scaffold.topPlankDefault ? '1' : '0', tab: 'lan', rows: '',
  baseEnabled: config.scaffold.baseEnabledDefault ? '1' : '0',
  stageEnabled: config.scaffold.stageEnabledDefault ? '1' : '0',
};
const STORE = 'led-wiring:v1';
let pixelData;
let zoom = 1;
let last = null; // 마지막 계산 결과 (내보내기에서 사용)
let detailOn = false; // 칸 안 상세 정보 표시 여부 (확대 정도에 따라 자동)
const displayWidth = () => Math.max(280, $('#canvas').clientWidth - 2) * zoom;

const num = (v) => (v === '' || v == null ? null : Number(v));
const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
const wiringKeys = [['pat', 'powerPat'], ['mode', 'powerMode'], ['ml', 'powerMl'], ['cur', 'powerCur']];
// 화면의 공통 컨트롤과 저장되는 LAN/POWER 상태를 변환한다. 같은 변환을 두 번 하면 원래 상태다.
function swapWiring(s) {
  const out = { ...s };
  if (s.tab === 'pw') for (const [lan, power] of wiringKeys) [out[lan], out[power]] = [out[power], out[lan]];
  return out;
}
const activeWiring = (s) => swapWiring(s);
const sequentialNumbers = (tab) => (tab === 'pw' ? config.power : config.lan).sequentialManualNumbers;
const layoutOptions = (s) => ({
  pattern: s.pat, manual: s.mode === 'manual' ? decodeManual(s.ml) : null,
  powerPattern: s.powerPat, powerManual: s.powerMode === 'manual' ? decodeManual(s.powerMl) : null,
});

function readState() {
  const s = { ...DEFAULTS };
  const fd = new FormData(form);
  for (const k of Object.keys(DEFAULTS)) if (fd.has(k)) s[k] = fd.get(k);
  s.topPlank = form.topPlank.checked ? '1' : '0';
  s.baseEnabled = form.baseEnabled.checked ? '1' : '0';
  s.stageEnabled = form.stageEnabled.checked ? '1' : '0';
  const state = swapWiring(s);
  if (config.lan.sequentialManualNumbers && state.mode === 'manual') {
    state.cur = String(allowedLanNumber(decodeManual(state.ml), state.cur));
    if (s.tab !== 'pw') form.cur.value = state.cur;
  }
  if (config.power.sequentialManualNumbers && state.powerMode === 'manual') {
    state.powerCur = String(allowedLanNumber(decodeManual(state.powerMl), state.powerCur));
    if (s.tab === 'pw') form.cur.value = state.powerCur;
  }
  return state;
}

function writeState(s) {
  s = normalizeCabinetState(s, pixelData);
  syncCabinetOptions(s);
  s = swapWiring(s);
  for (const [k, v] of Object.entries(s)) {
    const el = form.elements[k];
    if (el && el.type !== 'checkbox') el.value = v;
  }
  form.topPlank.checked = s.topPlank !== '0';
  form.baseEnabled.checked = s.baseEnabled === '1';
  form.stageEnabled.checked = s.stageEnabled === '1';
}

function syncCabinetOptions(s) {
  const options = cabinetOptions(s.pitch, pixelData);
  const values = ['', ...options.map((option) => option.value)].join('|');
  if (Array.from(form.cab.options, (option) => option.value).join('|') !== values) {
    form.cab.innerHTML = '<option value="">선택해 주세요</option>' + options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
  }
  form.cab.value = s.cab;
  form.rows.value = s.rows;
}

function loadState() {
  const s = { ...DEFAULTS };
  const q = new URLSearchParams(location.search);
  if (q.get('empty') !== '1') {
    try { Object.assign(s, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch { /* 저장소 사용 불가 */ }
  }
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) s[k] = q.get(k);
  if (q.has('dir') && !q.has('pat')) s.pat = q.get('dir'); // 구버전 URL
  s.pat = patternOf(s.pat).id;
  return s;
}

function saveState(s) {
  const q = new URLSearchParams();
  if (Object.keys(config.emptyInputs).every((key) => s[key] === '')) q.set('empty', '1');
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
    baseEnabled: s.baseEnabled === '1', stageEnabled: s.stageEnabled === '1', stageHeightMm: num(s.stageHeight),
  };
}

function toConfig(s) {
  return {
    ...config,
    lan: { ...config.lan, maxCabinetsPerLine: num(s.maxPerLine) ?? config.lan.maxCabinetsPerLine },
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
  const s = normalizeCabinetState(readState(), pixelData);
  syncCabinetOptions(s);
  form.querySelector('.custom').hidden = s.cab !== 'custom';
  saveState(s);
  syncWiringUi(s);
  let invalidSize = false;
  const sizeErrors = [];
  for (const [key, label] of [['w', '가로'], ['h', '세로']]) {
    const field = form.elements[key];
    const value = num(s[key]);
    const invalid = field.validity.badInput || (s[key] !== '' && (!Number.isFinite(value) || value < config.baseCabinetMm || value % config.baseCabinetMm !== 0));
    invalidSize ||= invalid;
    const showError = invalid && document.activeElement !== field;
    const message = `${label} 크기는 ${config.baseCabinetMm}mm 단위로 다시 입력해 주세요.`;
    field.setAttribute('aria-invalid', String(showError));
    const error = $(`#${key}Error`);
    error.hidden = !showError;
    error.textContent = showError ? message : '';
    if (showError) sizeErrors.push(message);
  }
  if (invalidSize || ['w', 'h', 'pitch', 'cab'].some((key) => s[key] === '')) {
    last = null;
    for (const id of ['msgs', 'canvas', 'printCanvas', 'printHead', 'tables', 'lineList', 'rowPlanList']) $(`#${id}`).innerHTML = '';
    $('#rowPlanBox').hidden = true;
    $('#canvas').classList.remove('draw', 'pan');
    $('#lineNotice').hidden = true;
    for (const button of document.querySelectorAll('.exports button')) button.disabled = true;
    $('#msgs').innerHTML = sizeErrors.map((message) => `<p class="err">${esc(message)}</p>`).join('');
    return;
  }
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

  const lay = buildLayout(res, layoutOptions(s), cfg);
  msgs.push(...lay.warnings.map((m) => `<p class="warn">${esc(m)}</p>`));
  if (s.tab === 'pw') msgs.push(...lay.powerLoadWarnings.map((m) => `<p class="warn" role="status">${esc(m)}</p>`));
  $('#msgs').innerHTML = msgs.join('');
  const title = `LED ${fmt(input.widthMm)}×${fmt(input.heightMm)}mm · ${res.pitchInfo.label} · ${input.cabW}×${input.cabH}`;
  last = { s, input, res, lay, cfg, title };
  for (const button of document.querySelectorAll('.exports button')) button.disabled = false;
  detailOn = detailFor(lay, displayWidth());
  const svg = renderSvg(lay, { showLan: s.tab !== 'pw', showPower: s.tab === 'pw', title, detail: detailOn });
  $('#canvas').innerHTML = svg;
  applyZoom();
  bindDraw($('#canvas svg'), lay, activeWiring(s));
  renderLineList(lay, activeWiring(s));
  const rep = buildReport(res, lay, input);
  $('#tables').innerHTML = tables(rep, res.scaffold, input);
  $('#printHead').innerHTML = `<div class="print-brand"><h1>LED 배선도면</h1>${document.querySelector('.company-brand').outerHTML}</div><p>${rep.inputs.map(([k, v]) => `${k}: ${esc(v)}`).join(' / ')}</p>`;
  $('#printCanvas').innerHTML = ['LAN', 'POWER'].map(kind => `<article class="print-drawing">${$('#printHead').innerHTML}<h2>${kind} 배선도</h2>${renderSvg(lay, { title, showLan: kind === 'LAN', showPower: kind === 'POWER', sized: false })}</article>`).join('');
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
  s = activeWiring(s);
  const manual = s.mode === 'manual';
  const power = s.tab === 'pw';
  $('#wiringTitle').textContent = power ? 'POWER 배선' : 'LAN 배선';
  $('#currentPortLabel').textContent = power ? 'POWER 포트 번호' : 'LAN 번호';
  $('#mNew').textContent = power ? '새 POWER 포트' : '새 LAN';
  $('#powerHint').hidden = !power;
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
  const label = s.tab === 'pw' ? 'POWER' : 'LAN';
  const ordered = sequentialNumbers(s.tab);
  ul.innerHTML = (s.tab === 'pw' ? lay.powerChains : lay.lanLines)
    .map((l) => `<li data-n="${l.id}" class="${l.over ? 'over' : ''}${l.id === Number(s.cur) ? ' cur' : ''}"><span class="sw" style="background:${LAN_COLORS[(l.id - 1) % LAN_COLORS.length]}"></span><label class="num">${label} <input type="number" min="1" step="1" inputmode="numeric" value="${l.id}" data-n="${l.id}" aria-label="${label} 포트 번호" ${ordered ? 'readonly' : ''}></label>${ordered ? `<button type="button" class="reorder" aria-label="${label} ${l.id} 순서 이동" title="끌어서 순서 변경 (방향키로도 이동)"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4h12M3 9h12M3 14h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>` : ''}<span class="t">${l.cells.length}장</span><button type="button" data-n="${l.id}" aria-label="${label} ${l.id} 삭제">✕</button></li>`)
    .join('');
}

// 나중에 그린 줄에 완전히 덮여 보이지 않게 된 줄은 목록에서 정리 (번호가 숨은 채 남지 않도록)
function pruneHidden(lines) {
  if (!last) return lines;
  const s = readState();
  const power = s.tab === 'pw';
  const lay = buildLayout(last.res, { ...layoutOptions(s), [power ? 'powerManual' : 'manual']: lines }, last.cfg);
  const alive = new Set(power ? lay.powerAlive : lay.alive);
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

// 행 배치를 바꾸면 격자가 달라지므로 직접 그린 LAN 줄은 지운다 (확인 후)
function applyRowPlan(next) {
  if (!last) return;
  const def = last.res.rowPlanDefault;
  if ((form.ml.value || form.powerMl.value) && !confirm('행 배치를 바꾸면 직접 그린 LAN·POWER 배선이 모두 지워집니다. 계속할까요?')) return;
  form.rows.value = sameRows(next, def) ? '' : encodeRows(next);
  if (form.ml.value) { form.ml.value = ''; form.cur.value = '1'; }
  form.powerMl.value = ''; form.powerCur.value = '1';
  update();
}

function setManual(lines) {
  form.ml.value = encodeManual(lines);
  update();
}

function bindDraw(svg, lay, s) {
  const canvas = $('#canvas');
  const manual = s.mode === 'manual';
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
    // 번호는 사용자가 바꾸기 전까지 그대로: 같은 번호로 그리면 그 LAN의 다음 구간이 된다
    const next = [...lines, { r0: Math.min(a.row, end.row), r1: Math.max(a.row, end.row) + 1, c0: Math.min(a.col, end.col), c1: Math.max(a.col, end.col) + 1, p: s.pat, n }];
    // 이 구간 때문에 LAN가 포트 한도를 넘으면 도면에 반영하지 않고 오류 창을 띄운다
    const err = s.tab !== 'pw' && last && limitError(buildLayout(last.res, { ...layoutOptions(last.s), manual: next }, last.cfg), n);
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
function cabinetNote(value, label) {
  const quantity = label === '캐비닛 수';
  const pattern = quantity
    ? /^가로(\d+) × 세로(\d+) = (\d+) (\(캐비닛 .+\))$/
    : /^([\d.]+)×([\d.]+)px (\(캐비닛 .+\))$/;
  const lines = String(value).split('\n').map((line) => line.match(pattern));
  if (!lines.every(Boolean)) return esc(value);
  const content = lines.map((m) => quantity
    ? `<span>가로</span><span class="note-number">${esc(m[1])}</span><span>×</span><span>세로</span><span class="note-number">${esc(m[2])}</span><span>=</span><strong class="note-number">${esc(m[3])}</strong><span class="note-cabinet">${esc(m[4])}</span>`
    : `<span class="note-number">${esc(m[1])}</span><span>×</span><span class="note-number">${esc(m[2])}&nbsp;px</span><span class="note-cabinet">${esc(m[3])}</span>`).join('');
  return `<span class="cabinet-note ${quantity ? 'quantity-note' : 'resolution-note'}">${content}</span>`;
}
function scaffoldNote(value) {
  const match = String(value).match(/^(높이|핀높이) (.+)$/);
  return match
    ? `<span class="scaffold-note"><span class="scaffold-note-label">${[...match[1]].map((char) => `<span>${esc(char)}</span>`).join('')}</span><span>${esc(match[2])}</span></span>`
    : esc(value);
}
function tables(rep, scaffold, input) {
  return rep.sections
    .map((sec) => {
      const numCol = (i) => sec.rows.some((r) => typeof r[i] === 'number');
      const head = sec.header.map((h, i) => {
        const label = sec.title === '박스'
          ? esc(h).replace(/^(필요|출고|1박스)(수량|박스)$/, '<span class="box-heading-part">$1</span><wbr><span class="box-heading-part">$2</span>') : esc(h);
        return `<th${numCol(i) ? ' class="n"' : ''}>${label}</th>`;
      }).join('');
      const body = sec.rows
        .map((r) => `<tr>${r.map((v, i) => {
          const result = sec.title === '박스'
            ? typeof v === 'number' && ['출고수량', '출고박스'].includes(sec.header[i])
            : typeof v === 'number' || (i === 1 && sec.header[i] === '수량');
          const plankOption = sec.title === '아시바' && r[0] === '발판' && i === 2;
          const content = plankOption
            ? `<label class="chk plank-option"><input type="checkbox" id="topPlankToggle"${scaffold.topPlank ? ' checked' : ''}> 상단발판포함</label>`
            : v == null ? '-' : sec.title === '박스' && i === 0 ? esc(v).replace('×', '×<wbr>')
            : sec.title === '아시바' && i === 2 ? scaffoldNote(v)
            : i === 2 && ['캐비닛 수', '해상도'].includes(r[0]) ? cabinetNote(v, r[0]) : esc(typeof v === 'number' ? fmt(v) : v);
          const numeric = typeof v === 'number' || (i === 1 && sec.header[i] === '수량');
          const boxUnit = sec.title === '박스' && sec.header[i] === '출고박스' && v != null ? ' <span class="box-unit">box</span>' : '';
          const scaffoldCount = sec.title === '아시바' && i === 1 && typeof v === 'number';
          return `<td${numeric ? ` class="n${scaffoldCount ? ' scaffold-count' : ''}"` : ''}>${result && v != null ? `<strong>${content}</strong>` : content}${boxUnit}</td>`;
        }).join('')}</tr>`)
        .join('');
      const columns = `<colgroup>${sec.header.map(() => '<col>').join('')}</colgroup>`;
      const pitchLabel = sec.title === '박스' ? rep.inputs.find(([label]) => label === '픽셀피치')?.[1] : null;
      const ledSize = sec.title === '아시바' ? rep.sections.find((section) => section.title === '배선도면 세부내역')?.rows[0]?.[1] : null;
      const sectionClass = sec.title === '박스' ? ' box-section'
        : sec.header[1] === '수량' ? ` quantity-section${sec.title === '배선도면 세부내역' ? ' summary-section' : ''}`
        : ` wiring-section${sec.header.length === 4 ? ' four-columns' : ''}`;
      const heading = `${esc(sec.title)}${pitchLabel ? ` <span class="box-pitch">${esc(pitchLabel)}</span>` : ''}${ledSize ? ` <span class="box-pitch">LED ${esc(ledSize)} mm</span>` : ''}`;
      const installationInvalid = input.stageEnabled && (input.stageHeightMm == null || !Number.isFinite(input.stageHeightMm) || input.stageHeightMm < 0);
      const installationControls = sec.title === '아시바' ? `<div class="scaffold-installation">
        <label class="chk"><input type="checkbox" id="baseToggle"${scaffold.baseEnabled ? ' checked' : ''}> 베이스 높이(${fmt(config.scaffold.baseHeightMm)}mm)</label>
        <div class="stage-height-group"><label class="chk"><input type="checkbox" id="stageToggle"${scaffold.stageEnabled ? ' checked' : ''}> LED단 높이(mm)</label>
        <input type="number" id="stageHeightInput" aria-label="LED단 높이(mm)" min="0" step="1" inputmode="numeric" value="${input.stageHeightMm ?? ''}"${scaffold.stageEnabled ? '' : ' disabled'} aria-invalid="${installationInvalid}"></div>
        <p class="installation-height">${installationInvalid ? 'LED 단 높이를 입력해 주세요.' : `LED 설치 시작 높이 ${fmt(scaffold.ledBottomMm)}mm · 바닥부터 LED 상단 ${fmt(scaffold.ledTopMm)}mm`}</p>
      </div>` : '';
      const scaffoldLink = sec.title === '아시바' && scaffold.bays > 0 && scaffold.tiers > 0 && !installationInvalid
        ? `<a class="scaffold-view-link" href="${scaffoldViewUrl(input, scaffold)}" target="led-scaffold-view">3D도면 자세히보기</a>` : '';
      const sectionHeading = sec.title === '아시바'
        ? `<div class="scaffold-section-heading"><h2>${heading}</h2></div>`
        : `<h2>${heading}</h2>`;
      const preview = sec.title === '아시바' && scaffoldLink
        ? `<div class="sec scaffold-preview"><div class="scaffold-preview-heading"><h2>아시바 3D 미리보기</h2>${scaffoldLink}</div><iframe title="아시바 3D 미리보기" src="${scaffoldViewUrl(input, scaffold)}&preview=1"></iframe><div class="scaffold-print-model print-only"></div><p>드래그해서 회전할 수 있습니다.</p></div>` : '';
      return `<div class="sec${sectionClass}"${sec.tab ? ` data-tab="${sec.tab}"` : ''}>${sectionHeading}${installationControls}<div class="tw"><table>${columns}<tr>${head}</tr>${body}</table></div></div>${preview}`;
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
  pitchSel.innerHTML = '<option value="">선택해 주세요</option>' + Object.entries(pixelData.pitches).map(([id, p]) => `<option value="${id}">${p.label}</option>`).join('');
  buildPatternButtons();
  const st = loadState();
  st.pitch = findPitch(pixelData, st.pitch)?.id ?? DEFAULTS.pitch; // 구버전 값(2.6 등)도 허용
  writeState(st);
  // LAN 번호 입력칸은 타이핑 중에 다시 그리면 포커스를 잃으므로 폼 공통 갱신에서 제외 (아래 change 핸들러가 처리)
  const inList = (e) => e.target.closest?.('#lineList');
  form.addEventListener('input', (e) => { if (!inList(e)) update(); });
  form.addEventListener('change', (e) => { if (!inList(e)) update(); });
  form.addEventListener('focusout', (e) => { if (['w', 'h'].includes(e.target.name)) update(); });
  $('#tables').addEventListener('input', (e) => {
    if (e.target.id !== 'stageHeightInput') return;
    form.elements.namedItem('stageHeight').value = e.target.value;
    saveState(readState());
  });
  $('#tables').addEventListener('focusout', (e) => {
    if (e.target.id === 'stageHeightInput') update();
  });
  $('#tables').addEventListener('change', (e) => {
    const checkboxFields = { topPlankToggle: 'topPlank', baseToggle: 'baseEnabled', stageToggle: 'stageEnabled' };
    if (checkboxFields[e.target.id]) form.elements[checkboxFields[e.target.id]].checked = e.target.checked;
    else if (e.target.id === 'stageHeightInput') form.elements.namedItem('stageHeight').value = e.target.value;
    else return;
    update();
  });
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
  // 라디오 input이 폼 공통 갱신보다 먼저 실행되므로 현재 보이는 자동 도면을 그대로 복사한다.
  // change에서 처리하면 앞선 input 갱신으로 이전 직접 배선이 먼저 복원될 수 있다.
  for (const r of form.querySelectorAll('input[name=mode]')) {
    r.addEventListener('input', () => {
      if (r.value !== 'manual' || !r.checked || !last || activeWiring(last.s).mode !== 'auto') return;
      const power = form.tab.value === 'pw';
      const filled = (power ? last.lay.powerChains : last.lay.lanLines).map(l => ({ ...l.rect, p: l.pattern, n: l.id }));
      form.ml.value = encodeManual(filled);
      form.cur.value = String(nextFreeNumber(filled)); // 채워진 줄에 덧붙지 않고 새 LAN에서 시작
    });
  }
  $('#lineList').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-n]');
    if (!inp) return;
    if (sequentialNumbers(form.tab.value)) { update(); return; }
    const old = Number(inp.dataset.n);
    const n = Number(inp.value);
    const lines = decodeManual(form.ml.value);
    const notice = (msg) => { inp.value = String(old); $('#lineNotice').textContent = msg; $('#lineNotice').hidden = false; };
    const label = form.tab.value === 'pw' ? 'POWER' : 'LAN';
    if (!Number.isInteger(n) || n < 1) return notice(`${label} 번호는 1 이상의 정수여야 합니다.`);
    if (n !== old && lines.some((l) => l.n === n)) return notice(`${label} ${n}번은 이미 다른 줄이 사용 중입니다. 다른 번호를 입력해 주세요.`);
    for (const l of lines) if (l.n === old) l.n = n; // 이 LAN의 모든 구간 번호만 바꾼다 (다른 줄은 그대로)
    if (Number(form.cur.value) === old) form.cur.value = String(n); // 그리는 중이던 LAN면 번호를 따라간다
    setManual(lines);
  });
  $('#lineList').addEventListener('click', (e) => {
    if (e.target.closest('.reorder')) return;
    const del = e.target.closest('button[data-n]');
    if (del) {
      const n = Number(del.dataset.n);
      setManual(decodeManual(form.ml.value).filter((l) => l.n !== n)); // 그 LAN의 모든 구간 삭제 (다른 번호는 그대로)
      return;
    }
    if (e.target.closest('input')) return;
    const li = e.target.closest('li[data-n]');
    if (li) { form.cur.value = li.dataset.n; update(); } // 목록에서 골라 그 LAN를 이어서 그린다
  });
  const moveLan = (from, to) => {
    if (!sequentialNumbers(form.tab.value) || from === to) return;
    const result = reorderLan(decodeManual(form.ml.value), from, to);
    form.cur.value = String(result.numbers.get(Number(form.cur.value)) ?? nextFreeNumber(result.lines));
    setManual(result.lines);
  };
  let lineDrag = null;
  $('#lineList').addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.reorder');
    if (!handle || e.button > 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const li = handle.closest('li');
    lineDrag = { from: Number(li.dataset.n), to: Number(li.dataset.n) };
    li.classList.add('dragging');
  });
  $('#lineList').addEventListener('pointermove', (e) => {
    if (!lineDrag) return;
    const li = document.elementFromPoint(e.clientX, e.clientY)?.closest('#lineList li');
    if (!li) return;
    lineDrag.to = Number(li.dataset.n);
    for (const row of $('#lineList').children) row.classList.toggle('drop-target', row === li);
  });
  const finishLineDrag = (cancel) => {
    if (!lineDrag) return;
    const { from, to } = lineDrag;
    lineDrag = null;
    for (const row of $('#lineList').children) row.classList.remove('dragging', 'drop-target');
    if (!cancel) moveLan(from, to);
  };
  $('#lineList').addEventListener('pointerup', () => finishLineDrag(false));
  $('#lineList').addEventListener('pointercancel', () => finishLineDrag(true));
  $('#lineList').addEventListener('keydown', (e) => {
    const handle = e.target.closest('.reorder');
    if (!handle || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const li = handle.closest('li');
    const target = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
    if (!target) return;
    const from = Number(li.dataset.n), to = Number(target.dataset.n);
    moveLan(from, to);
    $(`#lineList li[data-n="${to}"] .reorder`)?.focus();
  });
  $('#panMode').addEventListener('change', update);
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => {
    const s = readState();
    s.tab = b.dataset.tab;
    writeState(s);
    update();
  });
  $('#reset').addEventListener('click', () => {
    zoom = 1;
    $('#panMode').checked = false;
    writeState(DEFAULTS);
    update();
  });
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
