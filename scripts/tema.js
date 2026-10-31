(() => {
  const key = 'site-tema';
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* preference is optional */ }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('#theme-toggle');
    const syncEmbed = () => {
      const embed = document.querySelector('.testimonial-to-embed');
      if (!embed || typeof embed.getAttribute !== 'function') return;
      const isDark = document.documentElement.dataset.theme === 'dark';
      const url = embed.getAttribute(isDark ? 'data-url-dark' : 'data-url-light');
      if (!url) return;
      embed.setAttribute('data-url', url);
      const iframe = typeof embed.querySelector === 'function' ? embed.querySelector('iframe') : null;
      if (iframe && iframe.src !== url) iframe.src = url;
    };
    const update = () => {
      if (button) button.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
      syncEmbed();
    };
    update();
    if (!button) return;
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(key, next); } catch { /* keep this page usable */ }
      update();
    });
  });
})();
