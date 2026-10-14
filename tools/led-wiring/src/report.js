// 자재 수량표 데이터 (화면 표 / 엑셀 / 인쇄가 같은 데이터를 쓴다)
import { patternOf } from './layout.js';

const mm = (n) => Number(n).toLocaleString('ko-KR');

/** @returns {{inputs: Array<[string, string|number]>, sections: Array<{title: string, header: string[], rows: Array<Array<string|number|null>>}>}} */
export function buildReport(res, lay, input) {
  const g = res.grid;
  const sc = res.scaffold;
  const inputs = [
    ['전체 사이즈', `${mm(input.widthMm)} × ${mm(input.heightMm)} mm`],
    ['캐비닛', `${input.cabW} × ${input.cabH} mm`],
    ['픽셀피치', res.pitchInfo.label],
    ['LAN 배선', `${lay.manual ? '직접 배선' : '자동 배선'} / ${patternOf(lay.pattern).label}`],
  ];
  const maxLine = lay.lanLines.length ? Math.max(...lay.lanLines.map((l) => l.cells.length)) : 0;
  const sections = [
    {
      title: '자재 수량표',
      header: ['구분', '수량', '비고'],
      rows: [
        ['캐비닛 수량', res.counts.total, `가로 ${g.cols} × 세로 ${g.mainRows}${g.fillerRows ? ` + 500규격 ${g.fillerRows}줄` : ''}`],
        ['해상도', `${mm(res.pixel.resolution.w)} × ${mm(res.pixel.resolution.h)}`, `캐비닛 1장 ${res.pixel.mainCab.w}×${res.pixel.mainCab.h}px`],
        ['MCU', res.mcu, ''],
        ['롱랜선 (LAN 포트수)', lay.lanLines.length, `1포트 최대 ${Math.round(res.lan.capacityCabs * 100) / 100}장 → 줄당 최대 ${maxLine}장`],
        ['롱파워 (파워 포트수)', lay.powerChains.length, `SMPS 그룹 ${lay.powerChains.reduce((a, c) => a + c.smps.length, 0)}개`],
      ],
    },
    {
      title: '박스',
      header: ['캐비닛', '필요수량', '1박스 수량', '포장박스', '포장수량'],
      rows: res.boxes.map((b) => [b.cabinet.replace('x', '×'), b.need, b.perBox, b.boxes, b.packQty]),
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
      title: 'UTP(LAN) 줄별 구성',
      tab: 'lan',
      header: ['줄', '캐비닛 수', '시작 → 끝 번호', '픽셀 합계'],
      rows: lay.lanLines.map((l) => [`UTP ${l.id}`, l.cells.length, `${l.cells[0].id} → ${l.cells[l.cells.length - 1].id}`, Math.round(l.pixels)]),
    },
    {
      title: '파워(롱파워) 포트별 구성',
      tab: 'pw',
      header: ['포트', '캐비닛 수', '시작 → 끝 번호', 'SMPS 그룹'],
      rows: lay.powerChains.map((c) => [`파워 ${c.id}`, c.cells.length, `${c.cells[0].id} → ${c.cells[c.cells.length - 1].id}`, c.smps.length]),
    },
  ];
  return { inputs, sections };
}
