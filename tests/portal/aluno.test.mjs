import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlunoController } from '../../scripts/portal/aluno.mjs';

test('empty library and search/filter use shared rule', async () => {
  const app = createAlunoController({ api: { getAccess: async () => ({ status: 'aluno' }), listMaterials: async () => [] } });
  assert.deepEqual((await app.refresh()).items, []);
  assert.deepEqual(app.filter('anything', 'aula'), []);
});

test('revoked student clears stale library and skips download', async () => {
  let active = true, downloaded = 0;
  const api = { getAccess: async () => ({ status: active ? 'aluno' : 'inativo' }),
    listMaterials: async () => [{ id: 'm', title: 'One', type: 'aula', date: '2026-10-23', createdAt: '' }],
    downloadMaterial: async () => { downloaded++; return new Blob(['pdf']); } };
  const app = createAlunoController({ api, openWindow: () => ({ close() {} }) });
  await app.refresh();
  active = false;
  assert.equal((await app.download('m')).status, 'inativo');
  assert.equal(downloaded, 0);
  assert.deepEqual(app.items, []);
});

test('download errors close preopened popup and revoke temporary Blob URL', async () => {
  let closed = 0, revoked = 0;
  const app = createAlunoController({ api: { getAccess: async () => ({ status: 'aluno' }),
    listMaterials: async () => [{ id: 'm', title: 'T', type: 'aula', date: '2026-10-23', createdAt: '' }],
    downloadMaterial: async () => { throw Error('private'); } },
    openWindow: () => ({ close: () => closed++ }),
    createObjectURL: () => 'blob:x', revokeObjectURL: () => revoked++ });
  await app.refresh();
  assert.equal((await app.download('m', 'open')).status, 'error');
  assert.equal(closed, 1);
  assert.equal(revoked, 0);
});

test('filter handles titles as data, not markup', async () => {
  const app = createAlunoController({ api: { getAccess: async () => ({ status: 'aluno' }), listMaterials: async () => [{ id: 'm', title: '<img src=x>', type: 'lista', date: '2026-10-23', createdAt: '' }] } });
  await app.refresh();
  assert.equal(app.filter('img', 'lista')[0].title, '<img src=x>');
});

test('PDF preview reserves popup before the first await and revokes Blob URL on clear', async () => {
  let ready, created = 0, revoked = 0;
  const popup = { location: { replace(url) { assert.equal(url, 'blob:test'); } }, close() {} };
  const app = createAlunoController({
    api: { getAccess: async () => ({ status: 'aluno' }),
      listMaterials: async () => [{ id: 'm', title: 'T', type: 'aula', date: '2026-10-23', createdAt: '' }],
      downloadMaterial: () => new Promise(resolve => { ready = resolve; }) },
    openWindow: () => { assert.equal(ready, undefined); return popup; },
    createObjectURL: () => { created++; return 'blob:test'; },
    revokeObjectURL: () => { revoked++; },
    schedule() {},
  });
  await app.refresh();
  const pending = app.download('m');
  await new Promise(resolve => setImmediate(resolve));
  ready(new Blob(['%PDF-']));
  assert.equal((await pending).status, 'ok');
  assert.equal(created, 1);
  app.clear();
  assert.equal(revoked, 1);
});
