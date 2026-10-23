import { filterMaterials } from './rules.mjs';

export function createAlunoController({ api, openWindow = () => window.open('', '_blank'),
  createObjectURL = blob => URL.createObjectURL(blob), revokeObjectURL = url => URL.revokeObjectURL(url),
  schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let items = [];
  const urls = new Set();
  const release = url => { if (urls.delete(url)) revokeObjectURL(url); };
  const clear = () => { items = []; for (const url of [...urls]) release(url); };
  return {
    get items() { return items; },
    clear,
    filter(query = '', type = '') { return filterMaterials(items, { query, type }); },
    async refresh() {
      clear();
      let access;
      try { access = await api.getAccess(); }
      catch { return { status: 'error', items }; }
      if (access.status !== 'aluno') return { status: access.status, items };
      try { items = await api.listMaterials(); return { status: 'aluno', items }; }
      catch { clear(); return { status: 'error', items }; }
    },
    async download(id, mode = 'open') {
      // Opening synchronously from the click keeps PDF preview available on mobile browsers.
      const popup = mode === 'open' ? openWindow() : null;
      const fail = status => { popup?.close?.(); return { status }; };
      if (!items.some(item => item.id === id)) return fail('unavailable');
      try {
        const access = await api.getAccess();
        if (access.status !== 'aluno') { clear(); return fail(access.status); }
        const blob = await api.downloadMaterial(id);
        const url = createObjectURL(blob);
        urls.add(url);
        if (mode === 'open') {
          if (popup && !popup.closed) popup.location.replace(url);
          else { release(url); return { status: 'popup-blocked' }; }
          schedule(() => release(url), 60_000);
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'material.pdf';
          link.click();
          schedule(() => release(url), 60_000);
        }
        return { status: 'ok' };
      } catch { return fail('error'); }
    },
  };
}
