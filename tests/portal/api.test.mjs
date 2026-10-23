import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getClient } from '../../scripts/portal/client.mjs';
import { createPortalApi } from '../../scripts/portal/api.mjs';

test('missing public configuration fails usefully', () => {
  assert.throws(() => getClient(), /ainda não foi configurada/);
});

test('access is read from server enrollment, not user metadata', async () => {
  let active = false;
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'u', user_metadata: { professor: true } } }, error: null }) },
    from(table) { return { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === 'alunos' ? { nome: 'A', ativo: active } : null, error: null }; } }; } };
  const api = createPortalApi(client);
  assert.equal((await api.getAccess()).status, 'inativo');
  active = true;
  assert.equal((await api.getAccess()).status, 'aluno');
});
