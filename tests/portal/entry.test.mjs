import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { Element } from './dom-fixture.mjs';
import { createAuthController } from '../../scripts/portal/auth.mjs';
const source = (await readFile(new URL('../../scripts/portal/entry.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
for (const throws of [false, true]) test(`logout UI clears sensitive data, handles failure and permits retry (${throws})`, async () => {
  const nodes = new Map(); const get = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const logout = get('#logout-retry'); logout.hidden = true; let failure = true, cleared = 0;
  await runInNewContext(`(async () => { ${source} })()`, {
    document: { querySelector: get, querySelectorAll: () => [logout] }, location: { href: 'https://example.com/entrar.html' }, URL,
    getClient: async () => ({ auth: { signOut: async () => { if (failure && throws) throw Error('private detail'); return { error: failure ? Error('private detail') : null }; } } }),
    createPortalApi: () => ({}), createAuthController,
    createAlunoController: () => ({ clear() { cleared++; }, filter: () => [], items: [] }),
    mountProfessorPanel: () => ({ clear() { cleared++; } }),
  });
  await logout.fire('click');
  assert.equal(cleared, 2);
  assert.match(get('#portal-status').textContent, /Não foi possível sair/);
  assert.doesNotMatch(get('#portal-status').textContent, /private detail|Você saiu/);
  assert.equal(get('#logout-retry').hidden, false);
  failure = false; await logout.fire('click');
  assert.equal(get('#portal-status').textContent, 'Você saiu da conta.');
  assert.equal(logout.hidden, true);
});

async function concurrentFixture({ role = 'professor' } = {}) {
  const { documentFixture } = await import('./dom-fixture.mjs');
  const nodes = new Map(); const get = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const logout = get('#logout-retry'); let finishLogout, finishDownload, logoutCalls = 0, loginCalls = 0, opened = 0, cleared = 0;
  let generation = 0;
  const library = {
    items: [{ id: 'm', title: 'Private PDF' }],
    clear() { generation++; cleared++; this.items = []; },
    async refresh() { this.items = [{ id: 'm', title: 'Private PDF' }]; return { status: 'aluno' }; },
    filter() { return this.items; },
    download() { const turn = generation; return new Promise(resolve => { finishDownload = () => resolve({ status: turn === generation ? 'ok' : 'cancelled' }); }); },
  };
  await runInNewContext(`(async () => { ${source} })()`, {
    document: { ...documentFixture, querySelector: get, querySelectorAll: () => [logout] }, location: { href: 'https://example.com/entrar.html' }, URL,
    getClient: async () => ({}), createPortalApi: () => ({}),
    createAuthController: () => ({
      login: async () => { loginCalls++; return { status: role }; },
      logout: () => { logoutCalls++; return new Promise(resolve => { finishLogout = status => resolve({ status }); }); },
    }),
    createAlunoController: () => library,
    mountProfessorPanel: () => ({ clear() { cleared++; }, async open() { opened++; } }),
  });
  return { get, logout, counts: () => ({ logoutCalls, loginCalls, opened, cleared }), finishLogout: status => finishLogout(status), finishDownload: () => finishDownload() };
}
for (const status of ['signed-out', 'error']) test(`pending logout blocks login and concurrent logout, releases after ${status}`, async () => {
  const f = await concurrentFixture();
  const pending = f.logout.fire('click');
  assert.equal(f.counts().cleared, 2);
  await f.get('#login-form').fire('submit');
  const concurrent = f.logout.fire('click');
  assert.equal(f.counts().loginCalls, 0);
  assert.equal(f.counts().logoutCalls, 1);
  f.finishLogout(status); await pending; await concurrent;
  assert.equal(f.get('#teacher-view').hidden, true);
  assert.equal(f.get('#login-form button').disabled, false);
  await f.get('#login-form').fire('submit');
  assert.equal(f.counts().loginCalls, 1);
  assert.equal(f.counts().opened, 1);
  const retry = f.logout.fire('click');
  assert.equal(f.counts().logoutCalls, 2);
  f.finishLogout('signed-out'); await retry;
});
test('logout clears and cancels a pending download even while library is busy', async () => {
  const f = await concurrentFixture({ role: 'aluno' });
  await f.get('#login-form').fire('submit');
  await f.get('#subject-matematica').fire('click');
  await f.get('#category-lista').fire('click');
  const downloadButton = f.get('#material-list').children[0].children[4].children[0];
  const download = downloadButton.fire('click');
  const pendingLogout = f.logout.fire('click');
  assert.equal(f.counts().logoutCalls, 1);
  assert.equal(f.get('#student-view').hidden, true);
  assert.equal(f.get('#material-list').children.length, 0);
  f.finishDownload(); await download;
  await f.get('#login-form').fire('submit');
  assert.equal(f.counts().loginCalls, 1);
  f.finishLogout('signed-out'); await pendingLogout;
  assert.equal(f.get('#portal-status').textContent, 'Você saiu da conta.');
  assert.equal(f.get('#student-view').hidden, true);
});


async function navigationFixture(items) {
  const { documentFixture } = await import('./dom-fixture.mjs');
  const { createAlunoController } = await import('../../scripts/portal/aluno.mjs');
  const nodes = new Map();
  const get = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const logout = get('#logout-retry');
  const api = { getAccess: async () => ({ status: 'aluno' }), listMaterials: async () => items };
  await runInNewContext(`(async () => { ${source} })()`, {
    document: { ...documentFixture, querySelector: get, querySelectorAll: () => [logout] },
    location: { href: 'https://example.com/entrar.html' }, URL,
    getClient: async () => ({}), createPortalApi: () => api,
    createAuthController: () => ({ login: async () => ({ status: 'aluno', name: 'Ana <teste>' }), logout: async () => ({ status: 'signed-out' }) }),
    createAlunoController, mountProfessorPanel: () => ({ clear() {} }),
  });
  await get('#login-form').fire('submit');
  return { get, logout };
}
const navigationItems = [
  { id: 'm', subject: 'matematica', type: 'lista', title: 'Revisão', date: '2026-10-26', createdAt: '2026-10-26' },
  { id: 'f', subject: 'fisica', type: 'aula', title: 'Revisão', date: '2026-10-26', createdAt: '2026-10-26' },
  { id: 'old', subject: null, type: 'lista', title: 'Antigo', date: '2026-10-25', createdAt: '2026-10-25' },
];
test('aluno navega disciplina → categoria → arquivos e limpa filtros ao voltar', async () => {
  const { get, logout } = await navigationFixture(navigationItems);
  assert.equal(get('#subject-choices').hidden, false);
  assert.equal(get('#category-choices').hidden, true);
  assert.equal(get('#library-files').hidden, true);
  assert.equal(get('#student-name').textContent, 'Ana <teste>');
  assert.equal(get('#student-title').focused, true);
  await get('#subject-matematica').fire('click');
  assert.equal(get('#category-choices').hidden, false);
  await get('#category-lista').fire('click');
  assert.equal(get('#library-files').hidden, false);
  assert.equal(get('#material-list').children.length, 1);
  get('#material-search').value = 'ausente'; await get('#material-search').fire('input');
  assert.equal(get('#filter-empty').hidden, false);
  await get('#back-categories').fire('click');
  assert.equal(get('#material-search').value, '');
  assert.equal(get('#category-choices').hidden, false);
  await get('#back-subjects').fire('click');
  await get('#subject-fisica').fire('click');
  await get('#category-lista').fire('click');
  assert.equal(get('#material-list').children.length, 0);
  assert.equal(get('#material-empty').hidden, false);
  await get('#back-categories').fire('click');
  await get('#category-aula').fire('click');
  assert.equal(get('#material-list').children.length, 1);
  await logout.fire('click');
  assert.equal(get('#student-name').textContent, '');
  assert.equal(get('#material-list').children.length, 0);
  await get('#login-form').fire('submit');
  assert.equal(get('#subject-choices').hidden, false);
  assert.equal(get('#library-files').hidden, true);
});
test('arquivos legados continuam acessíveis e disciplinas vazias não somem', async () => {
  const { get } = await navigationFixture(navigationItems);
  assert.equal(get('#subject-outros').hidden, false);
  await get('#subject-outros').fire('click'); await get('#category-lista').fire('click');
  assert.equal(get('#material-list').children[0].children[1].textContent, 'Antigo');
  const empty = await navigationFixture([]);
  assert.equal(empty.get('#subject-outros').hidden, true);
  await empty.get('#subject-fisica').fire('click'); await empty.get('#category-aula').fire('click');
  assert.equal(empty.get('#material-empty').hidden, false);
  assert.equal(empty.get('#filter-empty').hidden, true);
});
