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
