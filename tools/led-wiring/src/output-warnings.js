// 화면에서 빨간 박스로 표시되는 안내를 PNG·TXT에도 같은 문구로 전달한다.
export function outputWarnings(res, lay, input) {
  return [...new Set([...(res.errors ?? []), ...(lay.warnings ?? []), ...baseLengthWarnings(res, input)])];
}

export function baseLengthWarnings(res, input) {
  const sc = res.scaffold;
  if (!sc?.baseEnabled || !sc.basePlan) return [];
  const ledWidthMm = input?.widthMm ?? res.grid.cols * res.grid.mainCab.w;
  if (sc.basePlan.totalWidthMm === ledWidthMm) return [];
  const fmt = n => n.toLocaleString('ko-KR');
  return [`베이스 길이 ${fmt(sc.basePlan.totalWidthMm)}mm와 LED 길이 ${fmt(ledWidthMm)}mm가 다릅니다. 베이스 수량을 확인해 주세요.`];
}

export function printWarnings(res, lay, input) {
  const messages = outputWarnings(res, lay, input);
  const escape = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return messages.length ? `<div class="print-warning"><strong>주의</strong>${messages.map(message => `<p>${escape(message)}</p>`).join('')}</div>` : '';
}
