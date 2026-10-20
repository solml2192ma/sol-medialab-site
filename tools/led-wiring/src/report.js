// 자재 수량표 데이터 (화면 표 / 엑셀 / 인쇄가 같은 데이터를 쓴다)
import { patternOf } from './layout.js';
import { config } from './config.js';

const mm = (n) => Number(n).toLocaleString('ko-KR');
const cabinetOrder = (size) => {
  const index = config.cabinetOptions.findIndex((option) => option.value === size);
  return index < 0 ? config.cabinetOptions.length : index;
};

/** @returns {{inputs: Array<[string, string|number]>, sections: Array<{title: string, header: string[], rows: Array<Array<string|number|null>>}>}} */
export function buildReport(res, lay, input) {
  const g = res.grid;
  const sc = res.scaffold;
  const cabinetTypes = [
    { count: res.counts.main, rows: g.mainRows, cabinet: g.mainCab, pixels: res.pixel.mainCab },
    { count: res.counts.filler, rows: g.fillerRows, cabinet: g.fillerCab, pixels: res.pixel.fillerCab },
  ].filter((entry) => entry.count > 0)
    .sort((a, b) => cabinetOrder(`${a.cabinet.w}x${a.cabinet.h}`) - cabinetOrder(`${b.cabinet.w}x${b.cabinet.h}`));
  const cabinetCounts = cabinetTypes
    .map(({ count, rows, cabinet }) => `가로${g.cols} × 세로${rows} = ${count} (캐비닛 ${cabinet.w}×${cabinet.h}mm)`)
    .join('\n');
  const cabinetResolutions = cabinetTypes
    .map(({ cabinet, pixels }) => `${pixels.w}×${pixels.h}px (캐비닛 ${cabinet.w}×${cabinet.h}mm)`)
    .join('\n');
  const inputs = [
    ['전체 사이즈', `${mm(input.widthMm)} × ${mm(input.heightMm)} mm`],
    ['캐비닛', `${input.cabW} × ${input.cabH} mm`],
    ['픽셀피치', res.pitchInfo.label],
    ['LAN 배선', `${lay.manual ? '직접 배선' : '자동 배선'} / ${patternOf(lay.pattern).label}`],
    ['POWER 배선', `${lay.powerManual ? '직접 배선' : '자동 배선'} / ${patternOf(lay.powerPattern).label}`],
  ];
  if (sc.baseEnabled || sc.stageEnabled) inputs.push(
    ['베이스 높이', `${mm(sc.baseHeightMm)} mm`],
    ['LED 단 높이', `${mm(sc.stageHeightMm)} mm`],
    ['바닥부터 LED 시작 높이', `${mm(sc.ledBottomMm)} mm`],
    ['바닥부터 LED 상단 높이', `${mm(sc.ledTopMm)} mm`],
  );
  const sections = [
    {
      title: '배선도면 세부내역',
      header: ['구분', '수량', '비고'],
      rows: [
        [res.pitchInfo.label, `${mm(input.widthMm)} × ${mm(input.heightMm)} × ${res.pitchInfo.thicknessMm ?? '-'}`, 'mm (가로 × 세로 × 두께)'],
        ['캐비닛 수', res.counts.total, cabinetCounts],
        ['해상도', `${mm(res.pixel.resolution.w)} × ${mm(res.pixel.resolution.h)}`, cabinetResolutions],
        ['LAN포트 수', lay.lanLines.length, ''],
        ['POWER 포트 수', lay.powerChains.length, ''],
      ],
    },
    {
      title: '박스',
      header: ['캐비닛', '필요수량', '<', '출고수량', '=', '1박스수량', '×', '출고박스'],
      rows: res.boxes.filter((b) => b.need > 0)
        .sort((a, b) => cabinetOrder(a.cabinet) - cabinetOrder(b.cabinet))
        .map((b) => [b.cabinet.replace('x', '×'), b.need, b.packQty == null ? '' : b.need < b.packQty ? '<' : '=', b.packQty, b.packQty == null ? '' : '=', b.perBox, b.packQty == null ? '' : '×', b.boxes]),
    },
    {
      title: '아시바',
      header: ['구분', '수량', '비고'],
      rows: [
        ['크기', `${mm(sc.widthM * 1000)} × ${mm(sc.heightM * 1000)} × ${mm(sc.depthM * 1000)} mm`, `${sc.bays}칸 × ${sc.displayTiers}단 × ${sc.depthBays}폭`],
        ['아시바(기둥)', sc.posts, `높이 ${sc.tierHeightM * 1000}mm`],
        ['아시바(짧은기둥)', sc.shortPosts, `높이 ${mm(sc.shortPostHeightM * 1000)}mm`],
        ['핀', sc.pins, `핀높이 ${mm(sc.pinExposedM * 1000)}mm`],
        ['x바', sc.xBars, ''],
        ['발판', sc.planks, sc.topPlank ? '상단 포함' : '상단 제외'],
      ],
    },
    {
      title: 'LAN포트 구성',
      tab: 'lan',
      header: ['줄', '캐비닛 수', '시작 → 끝 번호', '픽셀 합계'],
      rows: lay.lanLines.map((l) => [`LAN ${l.id}`, l.cells.length, `${l.cells[0].id} → ${l.cells[l.cells.length - 1].id}`, Math.round(l.pixels)]),
    },
    {
      title: 'POWER포트 구성',
      tab: 'pw',
      header: ['포트', '캐비닛 수', '시작 → 끝 번호'],
      rows: lay.powerChains.map((c) => [`POWER ${c.id}`, c.cells.length, `${c.cells[0].id} → ${c.cells[c.cells.length - 1].id}`]),
    },
  ];
  return { inputs, sections };
}
