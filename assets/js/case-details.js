const caseBody = document.querySelector('.portfolio-detail-body');
const firstParagraph = caseBody?.querySelector(':scope > p');

if (firstParagraph) {
  const remainingNodes = [];
  for (let node = firstParagraph.nextSibling; node; node = node.nextSibling) {
    remainingNodes.push(node);
  }

  if (remainingNodes.some((node) => node.nodeType === Node.ELEMENT_NODE || node.textContent.trim())) {
    const details = document.createElement('details');
    details.className = 'case-body-details';

    const summary = document.createElement('summary');
    summary.textContent = '▾ 펼치기';
    const content = document.createElement('div');
    content.className = 'case-body-details-content';
    content.append(...remainingNodes);
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'case-body-collapse';
    collapse.textContent = '▴ 접기';
    collapse.addEventListener('click', () => {
      details.open = false;
      summary.focus();
    });
    content.append(collapse);
    details.append(summary, content);
    details.addEventListener('toggle', () => {
      if (details.open) content.focus();
    });
    content.tabIndex = -1;
    caseBody.append(details);
  }
}
