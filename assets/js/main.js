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

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const index = tab.getAttribute('data-tab-index');

    tabs.forEach((t) => {
      const active = t === tab;
      t.setAttribute('data-state', active ? 'active' : 'inactive');
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      panel.toggleAttribute('hidden', panel.getAttribute('data-tab-index') !== index);
    });
  });
});
