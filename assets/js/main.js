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
    // PROJECTS dropdown far enough right to clip its last column.
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

// PROJECTS board: paginate the project grid (9 per page) and support
// search by title/category/location. Search results stay paginated
// too (same page size, same control) instead of dumping every match
// on screen at once.
const PORTFOLIO_PAGE_SIZE = 9;

document.querySelectorAll('[data-portfolio-grid]').forEach((grid) => {
  const section = grid.closest('section');
  const input = section.querySelector('.portfolio-search-input');
  const emptyMsg = grid.querySelector('.portfolio-search-empty');
  const pagination = section.querySelector('[data-portfolio-pagination]');
  const cards = Array.from(grid.querySelectorAll('.portfolio-card'));
  let matchedCards = cards;
  let totalPages = Math.ceil(cards.length / PORTFOLIO_PAGE_SIZE);
  let currentPage = 1;

  // Builds an abbreviated page list like [1, '...', 5, 6, 7, '...', 100]
  // so wide boards don't render a button for every single page.
  const getPageList = (current, total) => {
    const delta = 1;
    const pages = [];
    for (let i = 1; i <= total; i += 1) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        pages.push(i);
      }
    }
    const withDots = [];
    let last;
    pages.forEach((p) => {
      if (last !== undefined && p - last > 1) withDots.push('...');
      withDots.push(p);
      last = p;
    });
    return withDots;
  };

  const renderPagination = () => {
    if (!pagination) return;
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      pagination.hidden = true;
      return;
    }
    pagination.hidden = false;
    pagination.innerHTML = '';
    getPageList(currentPage, totalPages).forEach((p) => {
      if (p === '...') {
        const span = document.createElement('span');
        span.className = 'portfolio-page-ellipsis';
        span.textContent = '...';
        pagination.appendChild(span);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'portfolio-page-btn' + (p === currentPage ? ' is-active' : '');
      btn.textContent = String(p);
      btn.setAttribute('aria-current', p === currentPage ? 'page' : 'false');
      btn.addEventListener('click', () => showPage(p));
      pagination.appendChild(btn);
    });
  };

  const showPage = (page) => {
    currentPage = page;
    cards.forEach((card) => { card.style.display = 'none'; });
    matchedCards.forEach((card, i) => {
      const inPage = i >= (page - 1) * PORTFOLIO_PAGE_SIZE && i < page * PORTFOLIO_PAGE_SIZE;
      card.style.display = inPage ? '' : 'none';
    });
    renderPagination();
  };

  if (cards.length) showPage(1);

  if (input) {
    const runSearch = () => {
      const query = input.value.trim().toLowerCase();
      const searching = query.length > 0;
      matchedCards = searching
        ? cards.filter((card) => card.textContent.toLowerCase().includes(query))
        : cards;
      totalPages = Math.ceil(matchedCards.length / PORTFOLIO_PAGE_SIZE);
      if (emptyMsg) emptyMsg.hidden = matchedCards.length !== 0 || cards.length === 0;
      showPage(1);
    };
    input.addEventListener('input', runSearch);

    // Arriving from a PROJECTS board's "전체 게시물에서 검색" box, e.g.
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
// Each group only shows its first few matches by default, with a
// "더보기" button to reveal the rest, so a category with many cases
// doesn't dump them all on screen at once.
const PORTFOLIO_GROUP_COLLAPSED_SIZE = 3;
const portfolioSearchAllInput = document.getElementById('portfolioSearchAll');
const portfolioGroupsRoot = document.querySelector('[data-portfolio-groups-root]');
if (portfolioSearchAllInput && portfolioGroupsRoot) {
  const groups = Array.from(portfolioGroupsRoot.querySelectorAll('[data-group]')).map((group) => ({
    el: group,
    cards: Array.from(group.querySelectorAll('.portfolio-card')),
    countEl: group.querySelector('[data-group-count]'),
    moreBtn: group.querySelector('[data-group-more]'),
    expanded: false,
  }));
  const groupsEmptyMsg = portfolioGroupsRoot.querySelector('[data-groups-empty]');

  const renderGroup = (group, matches) => {
    group.cards.forEach((card) => { card.style.display = 'none'; });
    const visible = group.expanded ? matches : matches.slice(0, PORTFOLIO_GROUP_COLLAPSED_SIZE);
    visible.forEach((card) => { card.style.display = ''; });
    group.el.hidden = matches.length === 0;
    if (group.countEl) group.countEl.textContent = `(${matches.length})`;
    if (group.moreBtn) {
      const hidden = matches.length <= PORTFOLIO_GROUP_COLLAPSED_SIZE;
      group.moreBtn.hidden = hidden;
      if (!hidden) {
        group.moreBtn.textContent = group.expanded
          ? '접기'
          : `더보기 (${matches.length - PORTFOLIO_GROUP_COLLAPSED_SIZE})`;
      }
    }
    return matches.length > 0;
  };

  const groupMatches = (group, query) => group.cards.filter(
    (card) => !query || card.textContent.toLowerCase().includes(query),
  );

  const runGroupedSearch = () => {
    const query = portfolioSearchAllInput.value.trim().toLowerCase();
    let anyGroupVisible = false;
    groups.forEach((group) => {
      group.expanded = false;
      if (renderGroup(group, groupMatches(group, query))) anyGroupVisible = true;
    });
    if (groupsEmptyMsg) groupsEmptyMsg.hidden = anyGroupVisible || groups.length === 0;
  };

  groups.forEach((group) => {
    if (!group.moreBtn) return;
    group.moreBtn.addEventListener('click', () => {
      group.expanded = !group.expanded;
      const query = portfolioSearchAllInput.value.trim().toLowerCase();
      renderGroup(group, groupMatches(group, query));
    });
  });

  portfolioSearchAllInput.addEventListener('input', runGroupedSearch);

  const presetGroupQuery = new URLSearchParams(window.location.search).get('q');
  if (presetGroupQuery) portfolioSearchAllInput.value = presetGroupQuery;
  runGroupedSearch();
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
