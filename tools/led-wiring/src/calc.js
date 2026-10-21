// 순수 계산 모듈 (DOM 의존 없음). 엑셀 '500' / '1000' 시트 로직을 옮긴 것.
import { config as defaultConfig } from './config.js';

const key = (w, h) => `${w}x${h}`;

/** 피치 id("3.9-out") 또는 숫자(2.6)로 pixel.json 항목을 찾는다. 숫자만 주면 그 피치의 첫 항목. */
export function findPitch(pixelData, id) {
  const entries = Object.entries(pixelData.pitches).map(([k, v]) => ({ id: k, ...v }));
  return entries.find((e) => e.id === String(id)) ?? entries.find((e) => e.pitch === Number(id));
}

/**
 * @param {object} input
 * @param {number} input.widthMm 전체 가로
 * @param {number} input.heightMm 전체 세로
 * @param {number} input.cabW 캐비닛 가로(mm)
 * @param {number} input.cabH 캐비닛 세로(mm)
 * @param {number|string} input.pitch 픽셀피치
 * @param {number} [input.bays] 아시바 칸 수 (기본: 가로/설정된 칸 너비 내림)
 * @param {number} [input.tiers] 아시바 줄(단) 수 (기본: 세로/1.7m 올림)
 * @param {number[]|null} [input.rowPlan] 행 배치(위→아래 각 행 높이 mm). 없거나 크기가 안 맞으면 기본 배치
 * @param {number|null} [input.boxQty] 표에 없는 캐비닛 규격의 1박스 수량(직접 입력)
 * @param {object} pixelData data/pixel.json 내용
 * @param {object} [cfg]
 */
export function calc(input, pixelData, cfg = defaultConfig) {
  const warnings = [];
  const errors = [];
  const { widthMm, heightMm, cabW, cabH } = input;
  const base = cfg.baseCabinetMm;
  const pt = findPitch(pixelData, input.pitch);

  if (!pt) errors.push(`픽셀피치 ${input.pitch}의 정보가 없습니다.`);
  if (![widthMm, heightMm, cabW, cabH].every((v) => Number.isFinite(v) && v > 0)) {
    errors.push('가로·세로·캐비닛 크기는 0보다 큰 숫자여야 합니다.');
  }
  if (errors.length) return { errors, warnings };

  // --- 캐비닛 격자 ---
  const cols = Math.floor(widthMm / cabW);
  if (widthMm % cabW !== 0) warnings.push(`가로 ${widthMm}mm가 캐비닛 가로 ${cabW}mm로 나누어떨어지지 않아 ${cols}장으로 계산했습니다.`);

  // 메인 캐비닛이 500보다 높으면(예: 1000) 남는 높이는 가로 동일 × 세로 500 캐비닛으로 채운다.
  let mainRows = Math.floor(heightMm / cabH);
  const remainderMm = heightMm - mainRows * cabH;
  let fillerRows = 0;
  if (remainderMm > 0) {
    if (cabH > base) {
      fillerRows = Math.ceil(remainderMm / base);
      if (remainderMm % base !== 0) warnings.push(`세로 남는 ${remainderMm}mm가 ${base}mm 단위가 아니어서 ${fillerRows}줄로 올림했습니다.`);
    } else {
      warnings.push(`세로 ${heightMm}mm가 캐비닛 세로 ${cabH}mm로 나누어떨어지지 않아 ${mainRows}줄로 계산했습니다.`);
    }
  }
  if (cols < 1 || mainRows + fillerRows < 1) {
    errors.push(`LED 크기(${widthMm}×${heightMm}mm)가 캐비닛 1장(${cabW}×${cabH}mm)보다 작습니다.`);
    return { errors, warnings: [] };
  }
  // 행 배치: 남는 높이의 기본 위치는 config에서 정한다.
  // 사용자가 줄 순서를 바꾸거나 1000 한 줄을 500 두 줄로 나눌 수 있다 (전체 높이는 같아야 함).
  const mainPlan = Array(mainRows).fill(cabH);
  const fillerPlan = Array(fillerRows).fill(base);
  const defaultPlan = cfg.rowPlan.fillerPosition === 'top'
    ? [...fillerPlan, ...mainPlan]
    : [...mainPlan, ...fillerPlan];
  let plan = defaultPlan;
  let rowPlanIgnored = false;
  if (Array.isArray(input.rowPlan) && input.rowPlan.length) {
    const sum = (a) => a.reduce((s, h) => s + h, 0);
    const ok = cabH > base && input.rowPlan.every((h) => h === cabH || h === base) && sum(input.rowPlan) === sum(defaultPlan);
    if (ok) plan = input.rowPlan;
    else {
      rowPlanIgnored = true;
      warnings.push('저장된 행 배치가 현재 크기와 맞지 않아 기본 배치로 계산했습니다.');
    }
  }
  mainRows = plan.filter((h) => h === cabH).length;
  fillerRows = cabH > base ? plan.filter((h) => h === base).length : 0;
  const maxCabinets = cfg.limits?.maxCabinets ?? 4000;
  if (cols * (mainRows + fillerRows) > maxCabinets) {
    errors.push(`캐비닛이 ${(cols * (mainRows + fillerRows)).toLocaleString('ko-KR')}장으로 너무 많습니다. (최대 ${maxCabinets.toLocaleString('ko-KR')}장) 크기를 확인해 주세요.`);
    return { errors, warnings };
  }
  const fillerCab = { w: cabW, h: base };

  // --- 해상도 / LAN ---
  const pxOf = (w, h) => ({ w: (pt.pixels500 * w) / base, h: (pt.pixels500 * h) / base });
  const mainPx = pxOf(cabW, cabH);
  const fillerPx = pxOf(fillerCab.w, fillerCab.h);
  const resolution = {
    w: cols * mainPx.w,
    h: mainRows * mainPx.h + fillerRows * fillerPx.h,
  };
  const portLimit = cfg.lan.maxPixelsPerPortByPitch?.[pt.pitch] ?? cfg.lan.maxPixelsPerPort;
  const lanCapacityCabs = portLimit / (mainPx.w * mainPx.h); // 엑셀 '1port'
  const maxCabinetsPerLine = cfg.lan.maxCabinetsPerLine ?? Math.max(1, Math.floor(lanCapacityCabs));
  const pixelsTotal = cols * mainRows * mainPx.w * mainPx.h + cols * fillerRows * fillerPx.w * fillerPx.h;
  const lanPorts = Math.ceil(pixelsTotal / portLimit);

  // --- 박스 ---
  const boxFor = (w, h, count) => {
    if (count === 0) return { cabinet: key(w, h), need: 0, perBox: null, boxes: 0, packQty: 0 };
    let perBox = pt.boxQty[key(w, h)];
    if (perBox === undefined && input.boxQty && w === cabW && h === cabH) perBox = input.boxQty;
    if (perBox == null) {
      errors.push(`피치 ${pt.label} / ${w}×${h} 캐비닛의 1박스 수량 정보가 없습니다.`);
      return { cabinet: key(w, h), need: count, perBox: null, boxes: null, packQty: null };
    }
    const boxes = Math.ceil(count / perBox);
    return { cabinet: key(w, h), need: count, perBox, boxes, packQty: boxes * perBox };
  };
  const mainCount = cols * mainRows;
  const fillerCount = cols * fillerRows;
  const boxes = [boxFor(cabW, cabH, mainCount)];
  if (fillerRows > 0) boxes.push(boxFor(fillerCab.w, fillerCab.h, fillerCount));

  // --- POWER 포트 (롱POWER) ---
  // 장수 기준 최소 예상값. 실제 자재표는 배선 도면의 포트 수를 사용한다.
  const powerUnits = (mainCount * cabW * cabH + fillerCount * fillerCab.w * fillerCab.h) / (base * base);
  const powerPorts = Math.ceil(powerUnits / cfg.power.autoMaxCabinetsPerPort);

  // --- 아시바 ---
  // 아시바는 바닥에서 LED 상단 높이까지 들어가는 최대치로 산출한다.
  // 일반/짧은 기둥을 위에 연결할 때마다 핀 노출 길이를 높이에 더한다.
  const { bayWidthM, tierHeightM, shortPostHeightM, pinExposedM } = cfg.scaffold;
  const wM = widthMm / 1000;
  const baseEnabled = input.baseEnabled ?? cfg.scaffold.baseEnabledDefault;
  const stageEnabled = input.stageEnabled ?? cfg.scaffold.stageEnabledDefault;
  const stageHeightValid = Number.isFinite(input.stageHeightMm) && input.stageHeightMm >= 0;
  if (stageEnabled && !stageHeightValid) errors.push('아시바 계산: LED 단 높이를 0 이상의 숫자로 입력해 주세요.');
  const baseHeightMm = baseEnabled ? cfg.scaffold.baseHeightMm : 0;
  const stageHeightMm = stageEnabled && stageHeightValid ? input.stageHeightMm : 0;
  const ledBottomMm = baseHeightMm + stageHeightMm;
  const ledTopMm = heightMm + ledBottomMm;
  const hM = ledTopMm / 1000;
  const eps = 1e-9;
  const bays = input.bays ?? Math.floor(wM / bayWidthM + eps);
  const tiers = input.tiers ?? Math.floor((hM + pinExposedM) / (tierHeightM + pinExposedM) + eps);
  const normalHeight = tiers * tierHeightM + Math.max(0, tiers - 1) * pinExposedM;
  const useShort = input.shortPost ?? (tiers >= 1 && normalHeight + shortPostHeightM + pinExposedM <= hM + eps);
  const topPlank = input.topPlank ?? cfg.scaffold.topPlankDefault;
  const scaffoldW = bays * bayWidthM;
  const connections = Math.max(0, tiers - 1 + (useShort ? 1 : 0));
  const scaffoldH = tiers * tierHeightM + (useShort ? shortPostHeightM : 0) + connections * pinExposedM;
  if (bays < 1) errors.push(`LED 가로 ${widthMm}mm가 아시바 1칸(${bayWidthM * 1000}mm)보다 짧아 아시바를 세울 수 없습니다.`);
  if (tiers < 1) errors.push(`LED 상단 높이 ${ledTopMm}mm가 아시바 1단(${tierHeightM * 1000}mm)보다 낮아 아시바를 세울 수 없습니다.`);
  if (scaffoldW > wM + eps) errors.push(`아시바 가로 ${round(scaffoldW * 1000)}mm가 LED 가로 ${widthMm}mm보다 깁니다.`);
  if (scaffoldH > hM + eps) errors.push(`아시바 높이 ${round(scaffoldH * 1000)}mm가 LED 상단 높이 ${ledTopMm}mm보다 높습니다.`);
  const columns = bays + 1;
  const scaffold = {
    bays,
    tiers,
    displayTiers: tiers + (useShort ? cfg.scaffold.shortPostDisplayTiers : 0),
    depthBays: cfg.scaffold.depthBays,
    topPlank,
    baseEnabled, stageEnabled, baseHeightMm, stageHeightMm, ledBottomMm, ledTopMm,
    widthM: round(scaffoldW),
    heightM: round(scaffoldH),
    depthM: cfg.scaffold.depthM,
    posts: columns * tiers, // 아시바(기둥)
    shortPosts: useShort ? columns : 0, // 짧은아시바(0.9m)
    shortPostHeightM,
    tierHeightM,
    pinExposedM,
    pins: columns * 2 * connections, // 핀: 기둥 1개당 2개, 윗단(짧은아시바 포함) 연결용
    xBars: bays * 2 * tiers, // x바: 칸·단마다 2개
    planks: bays * (tiers + (useShort ? cfg.scaffold.shortPostPlankLevels : 0) - (topPlank ? 0 : 1)), // 최상단만 선택, 그 아래는 기본 포함
  };

  return {
    errors,
    warnings,
    grid: { cols, mainRows, fillerRows, mainCab: { w: cabW, h: cabH }, fillerCab, rowPlan: plan.map((h) => ({ h, kind: h === cabH ? 'main' : 'filler' })) },
    rowPlan: plan,
    rowPlanDefault: defaultPlan,
    rowPlanIgnored,
    counts: { main: mainCount, filler: fillerCount, total: mainCount + fillerCount },
    pixel: { mainCab: mainPx, fillerCab: fillerPx, resolution, total: pixelsTotal },
    lan: { capacityCabs: lanCapacityCabs, maxCabinetsPerLine, ports: lanPorts },
    power: { ports: powerPorts },
    boxes,
    pitchInfo: { id: pt.id, pitch: pt.pitch, env: pt.env, label: pt.label, thicknessMm: pt.thicknessMm ?? null, thicknessNote: pt.thicknessNote },
    scaffold,
  };
}

const round = (n) => Math.round(n * 1000) / 1000;
