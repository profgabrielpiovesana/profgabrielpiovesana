(() => {
  const key = 'site-tema';
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* preference is optional */ }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('#theme-toggle');
    if (!button) return;
    const update = () => button.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
    update();
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(key, next); } catch { /* keep this page usable */ }
      update();
    });
  });
})();
