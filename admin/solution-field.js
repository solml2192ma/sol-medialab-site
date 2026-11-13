// Sveltia renders the selected label in its dropdown trigger.
const updateCustomSolution = () => {
  document.querySelectorAll('section[data-key-path="installation_solution_custom"]').forEach((field) => {
    const solution = field.previousElementSibling;
    if (solution?.dataset.keyPath !== 'installation_solution') return;
    const trigger = solution.querySelector('[aria-haspopup="listbox"], [role="combobox"]');
    const isCustom = trigger?.textContent.trim() === '직접 입력';
    field.toggleAttribute('data-custom-solution-active', isCustom);
  });
};

new MutationObserver(updateCustomSolution).observe(document.body, {
  childList: true,
  characterData: true,
  subtree: true,
});
updateCustomSolution();
