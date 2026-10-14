// 규칙/기본값은 이 파일 한 곳에서만 바꾼다.
export const config = {
  // LAN: 1포트 처리 픽셀 수. 줄당 최대 캐비닛 수는 이 값과 캐비닛 해상도로 계산한다.
  // (배선 모양과 무관하게 ㅁ 모양으로 환산해서 계산)
  lan: {
    maxPixelsPerPort: 650000, // 절대 한도
    maxPixelsPerPortByPitch: { 3.9: 656000 }, // 피치별 예외
    maxCabinetsPerLine: null, // 숫자를 넣으면 계산값 대신 이 값으로 강제 (예: 10)
  },
  // 파워: 롱파워 포트수 = (높이/500) × ceil(가로 500단위 수 / maxWidthUnitsPerPort)
  // 500캐비닛 20장 / 1000캐비닛 10장(가로 10m)이 권장 최대. 더 길게 해도 되는 값이라 경고 없이 계산에만 사용.
  power: {
    maxWidthUnitsPerPort: 20,
    cabinetsPerSmps: 4, // 2차 파워 그룹 크기 (도면용)
  },
  // 아시바(비계) 규격
  scaffold: {
    bayWidthM: 1.8, // 칸 1개 가로
    tierHeightM: 1.7, // 줄 1단 세로
    shortPostHeightM: 0.9,
  },
  limits: { maxCabinets: 4000 }, // 입력 실수 방지 (이보다 많으면 계산하지 않음)
  defaultDirection: 'hz-tl', // layout.js PATTERNS의 id (예: hz-tl 가로 지그재그 좌상단 시작)
  baseCabinetMm: 500, // pixel 표의 해상도 기준 캐비닛 크기
};
