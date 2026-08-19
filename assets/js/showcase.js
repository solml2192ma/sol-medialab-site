const showcaseTabs = document.querySelectorAll('[data-showcase-tab]');
const showcasePanels = document.querySelectorAll('[data-showcase-panel]');

const activateShowcase = (index) => {
  showcaseTabs.forEach((t) => {
    const active = t.getAttribute('data-index') === index;
    t.setAttribute('data-state', active ? 'active' : 'inactive');
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  showcasePanels.forEach((p) => {
    p.setAttribute('data-state', p.getAttribute('data-index') === index ? 'active' : 'inactive');
  });
};

showcaseTabs.forEach((tab) => {
  tab.addEventListener('click', () => activateShowcase(tab.getAttribute('data-index')));
});

// Deep-link via URL hash, e.g. solution.html#showcase-outdoor
if (showcaseTabs.length) {
  const anchor = window.location.hash.replace('#showcase-', '');
  if (anchor) {
    const matchedTab = Array.from(showcaseTabs).find((t) => t.getAttribute('data-key') === anchor);
    if (matchedTab) {
      activateShowcase(matchedTab.getAttribute('data-index'));
    }
  }
}
