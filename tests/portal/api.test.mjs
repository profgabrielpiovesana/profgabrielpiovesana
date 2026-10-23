import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClientGetter, loadPortalConfig } from '../../scripts/portal/client.mjs';
import { createPortalApi } from '../../scripts/portal/api.mjs';

test('JSON loader reads fixed public config path and missing config fails usefully', async () => {
  let path;
  const empty = await loadPortalConfig(async url => { path = url.href; return { ok: true, json: async () => ({ supabaseUrl: '', supabasePublishableKey: '' }) }; });
  assert.match(path, /\/dados\/portal-config\.json$/);
  const getClient = createClientGetter({ loadConfig: async () => empty, createClientFn: () => { throw Error('must not create'); } });
  await assert.rejects(getClient(), /ainda não foi configurada/);
});

test('client uses memory-only auth options and shares one instance', async () => {
  let options, calls = 0;
  const getClient = createClientGetter({ loadConfig: async () => ({ supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public' }),
    createClientFn: (_url, _key, value) => { calls++; options = value; return { auth: {} }; } });
  const first = await getClient();
  assert.equal(await getClient(), first);
  assert.equal(calls, 1);
  assert.equal(options.auth.persistSession, false);
  assert.equal(options.auth.flowType, 'implicit');
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
