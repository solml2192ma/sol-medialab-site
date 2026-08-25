// Header background on scroll
const header = document.getElementById('siteHeader');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
window.addEventListener('scroll', onScroll);
onScroll();

// Keep the mega-dropdown aligned to the actual header height
const setHeaderHeightVar = () => {
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
};
window.addEventListener('resize', setHeaderHeightVar);
setHeaderHeightVar();

// Simple dropdowns (ABOUT/SERVICES/CONTACT) sit inside a full-width,
// page-centered white panel, but the actual link group should line up
// under whichever trigger opened it. Nudge just the link group over via
// a CSS custom property, leaving the panel's own position untouched.
document.querySelectorAll('.main-nav > ul > li.has-dropdown').forEach((li) => {
  const inner = li.querySelector(':scope > .dropdown .dropdown-inner');
  if (!inner) return;
  const alignDropdown = () => {
    const liRect = li.getBoundingClientRect();
    const triggerCenter = liRect.left + liRect.width / 2;
    const viewportCenter = window.innerWidth / 2;
    const desiredShift = triggerCenter - viewportCenter;

    // Clamp so the (possibly wide) link group never pushes past the
    // viewport edges — narrower "windowed" browsers were shifting the
    // OVERVIEW dropdown far enough right to clip its last column.
    const safePadding = 24;
    const halfInner = inner.getBoundingClientRect().width / 2;
    const minShift = safePadding - (viewportCenter - halfInner);
    const maxShift = (window.innerWidth - safePadding) - (viewportCenter + halfInner);
    const shift = Math.min(maxShift, Math.max(minShift, desiredShift));

    li.style.setProperty('--dropdown-x', `${shift}px`);
  };
  li.addEventListener('mouseenter', alignDropdown);
  li.addEventListener('focusin', alignDropdown);
});

// OVERVIEW board search: filter the project grid by title/category/location
document.querySelectorAll('.portfolio-search-input').forEach((input) => {
  const grid = input.closest('section').querySelector('[data-portfolio-grid]');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.portfolio-card'));
  const emptyMsg = grid.querySelector('.portfolio-search-empty');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    cards.forEach((card) => {
      const match = !query || card.textContent.toLowerCase().includes(query);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount += 1;
    });
    if (emptyMsg) emptyMsg.hidden = visibleCount !== 0 || cards.length === 0;
  });
});

// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.querySelector('.main-nav');
menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

// Solution tabs
const tabs = document.querySelectorAll('[data-tab-trigger]');
const panels = document.querySelectorAll('[data-tab-panel]');

const activateTabByIndex = (index) => {
  tabs.forEach((t) => {
    const active = t.getAttribute('data-tab-index') === index;
    t.setAttribute('data-state', active ? 'active' : 'inactive');
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.toggleAttribute('hidden', panel.getAttribute('data-tab-index') !== index);
  });
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    activateTabByIndex(tab.getAttribute('data-tab-index'));
  });
});

// Floating menu: collapses into a single black FAB on mobile
const floatingMenu = document.querySelector('.floating-menu');
const floatingToggle = document.getElementById('floatingToggle');
if (floatingMenu && floatingToggle) {
  floatingToggle.addEventListener('click', () => {
    const isOpen = floatingMenu.classList.toggle('is-open');
    floatingToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// Deep-link a specific tab via URL hash, e.g. solution.html#showcase-outdoor
if (tabs.length) {
  const anchor = window.location.hash.replace('#', '');
  if (anchor) {
    const matchedTab = Array.from(tabs).find((t) => t.getAttribute('data-tab-anchor') === anchor);
    if (matchedTab) {
      activateTabByIndex(matchedTab.getAttribute('data-tab-index'));
      window.requestAnimationFrame(() => {
        matchedTab.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
    }
  }
}
