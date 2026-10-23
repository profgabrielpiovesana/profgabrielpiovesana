import { filterMaterials } from './rules.mjs';

export function createAlunoController({ api, openWindow = () => window.open('', '_blank'),
  createObjectURL = blob => URL.createObjectURL(blob), revokeObjectURL = url => URL.revokeObjectURL(url),
  createDownloadLink = url => { const link = document.createElement('a'); link.href = url; link.download = 'material.pdf'; return link; },
  schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
  let items = [];
  let generation = 0;
  const urls = new Set();
  const pendingPopups = new Set();
  const release = url => { if (urls.delete(url)) revokeObjectURL(url); };
  const closePopup = popup => {
    if (popup && pendingPopups.delete(popup)) popup.close?.();
  };
  const clear = () => {
    generation++;
    items = [];
    for (const popup of [...pendingPopups]) closePopup(popup);
    for (const url of [...urls]) release(url);
  };
  return {
    get items() { return items; },
    clear,
    filter(query = '', type = '') { return filterMaterials(items, { query, type }); },
    async refresh() {
      clear();
      const current = generation;
      let access;
      try { access = await api.getAccess(); }
      catch { return { status: current === generation ? 'error' : 'cancelled', items }; }
      if (current !== generation) return { status: 'cancelled', items };
      if (access.status !== 'aluno') return { status: access.status, items };
      try {
        const loaded = await api.listMaterials();
        if (current !== generation) return { status: 'cancelled', items };
        items = loaded;
        return { status: 'aluno', items };
      } catch {
        if (current !== generation) return { status: 'cancelled', items };
        clear(); return { status: 'error', items };
      }
    },
    async download(id, mode = 'open') {
      // Opening synchronously from the click keeps PDF preview available on mobile browsers.
      let popup;
      try { popup = mode === 'open' ? openWindow() : null; }
      catch { return { status: 'popup-blocked' }; }
      if (popup) pendingPopups.add(popup);
      const current = generation;
      let url;
      const fail = status => { closePopup(popup); return { status }; };
      if (!items.some(item => item.id === id)) return fail('unavailable');
      try {
        const access = await api.getAccess();
        if (current !== generation) return fail('cancelled');
        if (access.status !== 'aluno') { clear(); return fail(access.status); }
        const blob = await api.downloadMaterial(id);
        if (current !== generation) return fail('cancelled');
        url = createObjectURL(blob);
        urls.add(url);
        if (mode === 'open') {
          if (popup && !popup.closed) popup.location.replace(url);
          else { release(url); return { status: 'popup-blocked' }; }
          pendingPopups.delete(popup);
          schedule(() => release(url), 60_000);
        } else {
          const link = createDownloadLink(url);
          link.click();
          schedule(() => release(url), 60_000);
        }
        return { status: 'ok' };
      } catch {
        if (url) release(url);
        return fail(current === generation ? 'error' : 'cancelled');
      }
    },
  };
}
