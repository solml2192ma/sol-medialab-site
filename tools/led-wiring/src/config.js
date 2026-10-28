// 규칙/기본값은 이 파일 한 곳에서만 바꾼다.
export const config = {
  pngBrand: {
    companyKo: '주식회사 솔미디어랩', companyEn: 'SOL MEDIA LAB Inc.',
    headerHeightRatio: 0.065, widthRatio: 0.33, logoWidthRatio: 0.085, logoHeightRatio: 0.04,
  },
  packing: { extraBoxesWhenExact: 1 }, // 필요수량이 박스에 딱 맞으면 여분 1박스 출고
  // LAN: 1포트 처리 픽셀 수. 줄당 최대 캐비닛 수는 이 값과 캐비닛 해상도로 계산한다.
  // (배선 모양과 무관하게 ㅁ 모양으로 환산해서 계산)
  lan: {
    sequentialManualNumbers: true, // 새 LAN 번호는 빈 번호 순서대로, 재정렬은 목록 손잡이로
    autoDirectionPriority: true, // 자동 배선은 포트 수보다 선택 방향으로 길게 진행하는 것을 우선
    maxPixelsPerPort: 650000, // 절대 한도
    maxPixelsPerPortByPitch: { 3.9: 656000 }, // 피치별 예외
    maxCabinetsPerLine: null, // 숫자를 넣으면 계산값 대신 이 값으로 강제 (예: 10)
  },
  // POWER: 픽셀과 무관하게 500×500을 1장분, 500×1000을 2장분으로 계산한다.
  power: {
    sequentialManualNumbers: true, // 새 POWER 번호와 목록 순서 변경은 LAN과 같은 방식
    autoMaxCabinetsPerPort: 20, // 자동 배선: 500×500 환산 20장분. 직접 배선은 제한 없음.
  },
  // 아시바(비계) 규격
  scaffold: {
    bayWidthM: 1.84, // 가로: 1,840 + (칸 수 - 1) × 1,840mm
    depthM: 0.9, // 깊이 900mm
    tierHeightM: 1.7, // 줄 1단 세로
    shortPostHeightM: 0.9,
    pinExposedM: 0.025, // 위아래 기둥 연결부마다 높이에 더하는 노출 길이
    shortPostDisplayTiers: 0.5, // 짧은기둥 사용 시 비고에 반 단으로 표기
    depthBays: 1, // 깊이 방향 폭 수
    topPlankDefault: false, // 발판은 기본적으로 상단 제외
    shortPostPlankLevels: 1, // 짧은기둥 상단에도 발판 한 층을 선택할 수 있음
    ledPanelAlignment: { horizontal: 'center', vertical: 'bottom' }, // 3D 도면의 LED 설치 위치
    showLedPanelDefault: true, // 3D 도면은 LED 패널을 붙인 상태로 시작
    viewAngles: { yaw: 28, pitch: 18 },
    previewAngles: { yaw: 30, pitch: 20 }, // 미리보기 기본 시점(도)
    baseHeightMm: 40,
    baseEnabledDefault: false,
    stageEnabledDefault: false,
  },
  limits: { maxCabinets: 4000 }, // 입력 실수 방지 (이보다 많으면 계산하지 않음)
  defaultDirection: 'hz-tl', // layout.js PATTERNS의 id (예: hz-tl 가로 지그재그 좌상단 시작)
  baseCabinetMm: 500, // pixel 표의 해상도 기준 캐비닛 크기
  rowPlan: { fillerPosition: 'top' }, // 남는 높이의 500 줄은 기본 배치에서 맨 위에 둔다.
  cabinetOptions: [
    { value: '500x1000', label: '500 × 1000' },
    { value: '500x500', label: '500 × 500' },
  ],
  fallbackCabinet: '500x500', // 구버전 custom/잘못된 저장값 보정은 표시 순서와 별개다.
  emptyInputs: {
    w: '', h: '', pitch: '', cab: '', cw: '', ch: '', boxQty: '',
    maxPerLine: '', bays: '', tiers: '', cur: '', stageHeight: '',
  }, // 초기화 및 저장값 없는 첫 화면은 입력을 비운다.
};
