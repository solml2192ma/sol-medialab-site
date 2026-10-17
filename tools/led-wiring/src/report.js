// 자재 수량표 데이터 (화면 표 / 엑셀 / 인쇄가 같은 데이터를 쓴다)
import { patternOf } from './layout.js';

const mm = (n) => Number(n).toLocaleString('ko-KR');

/** @returns {{inputs: Array<[string, string|number]>, sections: Array<{title: string, header: string[], rows: Array<Array<string|number|null>>}>}} */
export function buildReport(res, lay, input) {
  const g = res.grid;
  const sc = res.scaffold;
  const cabinetTypes = [
    { count: res.counts.main, rows: g.mainRows, cabinet: g.mainCab, pixels: res.pixel.mainCab },
    { count: res.counts.filler, rows: g.fillerRows, cabinet: g.fillerCab, pixels: res.pixel.fillerCab },
  ].filter((entry) => entry.count > 0)
    .sort((a, b) => a.cabinet.h - b.cabinet.h);
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
    ['파워 배선', `${lay.powerManual ? '직접 배선' : '자동 배선'} / ${patternOf(lay.powerPattern).label}`],
  ];
  const sections = [
    {
      title: '배선도면 세부내역',
      header: ['구분', '수량', '비고'],
      rows: [
        ['캐비닛 수량', res.counts.total, cabinetCounts],
        ['해상도', `${mm(res.pixel.resolution.w)} × ${mm(res.pixel.resolution.h)}`, cabinetResolutions],
        ['LAN포트수', lay.lanLines.length, ''],
        ['파워포트수', lay.powerChains.length, ''],
      ],
    },
    {
      title: '박스',
      header: ['캐비닛', '필요수량', '', '출고수량', '', '1박스수량', '', '출고박스'],
      rows: res.boxes.filter((b) => b.need > 0)
        .sort((a, b) => Number(a.cabinet.split('x')[1]) - Number(b.cabinet.split('x')[1]))
        .map((b) => [b.cabinet.replace('x', '×'), b.need, b.packQty == null ? '' : b.need < b.packQty ? '<' : '=', b.packQty, b.packQty == null ? '' : '=', b.perBox, b.packQty == null ? '' : '×', b.boxes]),
    },
    {
      title: '아시바',
      header: ['구분', '수량', '비고'],
      rows: [
        ['크기', `${sc.widthM} × ${sc.heightM} m`, `${sc.bays}칸 × ${sc.tiers}단${sc.shortPosts ? ' + 짧은아시바' : ''}`],
        ['아시바(기둥)', sc.posts, ''],
        ['짧은아시바', sc.shortPosts, sc.shortPosts ? `높이 ${sc.shortPostHeightM}m` : ''],
        ['핀', sc.pins, ''],
        ['x바', sc.xBars, ''],
        ['발판', sc.planks, sc.topPlank ? '윗단 포함' : '윗단 제외'],
      ],
    },
    {
      title: 'LAN 줄별 구성',
      tab: 'lan',
      header: ['줄', '캐비닛 수', '시작 → 끝 번호', '픽셀 합계'],
      rows: lay.lanLines.map((l) => [`LAN ${l.id}`, l.cells.length, `${l.cells[0].id} → ${l.cells[l.cells.length - 1].id}`, Math.round(l.pixels)]),
    },
    {
      title: '파워 포트별 구성',
      tab: 'pw',
      header: ['포트', '캐비닛 수', '시작 → 끝 번호'],
      rows: lay.powerChains.map((c) => [`파워 ${c.id}`, c.cells.length, `${c.cells[0].id} → ${c.cells[c.cells.length - 1].id}`]),
    },
  ];
  return { inputs, sections };
}
