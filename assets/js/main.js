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

// OVERVIEW board: paginate the project grid (6 per page) and support
// search by title/category/location. While searching, pagination is
// suspended and every match is shown at once; clearing the search
// returns to page 1 of the full, paginated list.
const PORTFOLIO_PAGE_SIZE = 6;

document.querySelectorAll('[data-portfolio-grid]').forEach((grid) => {
  const section = grid.closest('section');
  const input = section.querySelector('.portfolio-search-input');
  const emptyMsg = grid.querySelector('.portfolio-search-empty');
  const pagination = section.querySelector('[data-portfolio-pagination]');
  const cards = Array.from(grid.querySelectorAll('.portfolio-card'));
  const totalPages = Math.ceil(cards.length / PORTFOLIO_PAGE_SIZE);
  let currentPage = 1;
  let searching = false;

  const renderPagination = () => {
    if (!pagination) return;
    if (searching || totalPages <= 1) {
      pagination.innerHTML = '';
      pagination.hidden = true;
      return;
    }
    pagination.hidden = false;
    pagination.innerHTML = '';
    for (let p = 1; p <= totalPages; p += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'portfolio-page-btn' + (p === currentPage ? ' is-active' : '');
      btn.textContent = String(p);
      btn.setAttribute('aria-current', p === currentPage ? 'page' : 'false');
      btn.addEventListener('click', () => showPage(p));
      pagination.appendChild(btn);
    }
  };

  const showPage = (page) => {
    currentPage = page;
    cards.forEach((card, i) => {
      const inPage = i >= (page - 1) * PORTFOLIO_PAGE_SIZE && i < page * PORTFOLIO_PAGE_SIZE;
      card.style.display = inPage ? '' : 'none';
    });
    renderPagination();
  };

  if (cards.length) showPage(1);

  if (input) {
    const runSearch = () => {
      const query = input.value.trim().toLowerCase();
      searching = query.length > 0;
      let visibleCount = 0;
      cards.forEach((card) => {
        const match = !searching || card.textContent.toLowerCase().includes(query);
        card.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
      });
      if (emptyMsg) emptyMsg.hidden = visibleCount !== 0 || cards.length === 0;
      if (searching) {
        renderPagination();
      } else {
        showPage(1);
      }
    };
    input.addEventListener('input', runSearch);

    // Arriving from an OVERVIEW board's "전체 게시물에서 검색" box, e.g.
    // portfolio.html?q=..., pre-fills and runs this page's own search.
    const presetQuery = new URLSearchParams(window.location.search).get('q');
    if (presetQuery) {
      input.value = presetQuery;
      runSearch();
    }
  }
});

// PORTFOLIO all-search page: results are pre-grouped by category (one
// [data-group] per category, each with its own [data-group-grid]).
// Typing filters cards within every group and hides any group left
// with zero matches, so only categories that actually match show up.
const portfolioSearchAllInput = document.getElementById('portfolioSearchAll');
const portfolioGroupsRoot = document.querySelector('[data-portfolio-groups-root]');
if (portfolioSearchAllInput && portfolioGroupsRoot) {
  const groups = Array.from(portfolioGroupsRoot.querySelectorAll('[data-group]')).map((group) => ({
    el: group,
    cards: Array.from(group.querySelectorAll('.portfolio-card')),
    countEl: group.querySelector('[data-group-count]'),
  }));
  const groupsEmptyMsg = portfolioGroupsRoot.querySelector('[data-groups-empty]');

  const runGroupedSearch = () => {
    const query = portfolioSearchAllInput.value.trim().toLowerCase();
    let anyGroupVisible = false;
    groups.forEach(({ el, cards, countEl }) => {
      let visibleInGroup = 0;
      cards.forEach((card) => {
        const match = !query || card.textContent.toLowerCase().includes(query);
        card.style.display = match ? '' : 'none';
        if (match) visibleInGroup += 1;
      });
      el.hidden = visibleInGroup === 0;
      if (visibleInGroup > 0) anyGroupVisible = true;
      if (countEl) countEl.textContent = `(${visibleInGroup})`;
    });
    if (groupsEmptyMsg) groupsEmptyMsg.hidden = anyGroupVisible || groups.length === 0;
  };

  portfolioSearchAllInput.addEventListener('input', runGroupedSearch);

  const presetGroupQuery = new URLSearchParams(window.location.search).get('q');
  if (presetGroupQuery) {
    portfolioSearchAllInput.value = presetGroupQuery;
    runGroupedSearch();
  }
}

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

// Turn a bare YouTube link pasted into a CMS post body into an embedded player
const postBody = document.querySelector('.portfolio-detail-body');
if (postBody) {
  const YT_URL_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

  const embedYouTube = (videoId, el) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-embed';
    wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    el.replaceWith(wrapper);
  };

  postBody.querySelectorAll('a').forEach((a) => {
    const match = a.getAttribute('href').match(YT_URL_RE);
    if (!match) return;
    const container = a.parentElement.childNodes.length === 1 ? a.parentElement : a;
    embedYouTube(match[1], container);
  });
}
