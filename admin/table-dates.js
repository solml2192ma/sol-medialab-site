// Format only the displayed text. Sveltia still sorts by the original fields.
(() => {
  const selector = '.table-view .grid-cell:is([data-key="last_human_edit"], [data-key="post_date"]) .label';
  const formatDates = () => {
    document.querySelectorAll(selector).forEach((label) => {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const match = node.data.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
        if (match) node.data = `${match[1]} ${match[2]}`;
      }
    });
  };

  const observer = new MutationObserver(formatDates);
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  formatDates();
})();
