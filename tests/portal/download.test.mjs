import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../supabase/functions/baixar-material/handler.mjs';
import { createPortalApi } from '../../scripts/portal/api.mjs';
import { createClient } from '../../scripts/portal/vendor/supabase.mjs';
const origin = 'https://gabrielpiovesana.github.io';
const id = '11111111-1111-4111-8111-111111111111';
const bytes = new Uint8Array([37,80,68,70,45,0,255,128]);
function fixture({ authorized = true, validUser = true, fail = '' } = {}) {
  const calls = [];
  const handler = createHandler({ allowedOrigins: [origin],
    auth: { async getUser(token) { calls.push(['auth', token]); if (fail === 'auth') throw Error('private-token'); return { data: { user: validUser ? { id: 'a' } : null }, error: null }; } },
    db: { async getMaterial(materialId, token) { calls.push(['material', materialId, token]); if (fail === 'db') throw Error('private-path'); return authorized ? { object_path: 'server-only.pdf' } : null; } },
    storage: { async download(path) { calls.push(['storage', path]); if (fail === 'storage') throw Error('private-key'); return new Blob([bytes]); } },
  });
  const request = ({ method = 'POST', body = { id }, headers = {}, raw } = {}) => handler(new Request('https://example.supabase.co/functions/v1/baixar-material', {
    method, headers: { Origin: origin, Authorization: 'Bearer valid', 'Content-Type': 'application/json', ...headers },
    ...(['GET','HEAD','OPTIONS'].includes(method) ? {} : { body: raw ?? JSON.stringify(body) }),
  }));
  return { handler, request, calls };
}
function noStore(response) {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.equal(response.headers.get('Vary'), 'Origin, Authorization');
  assert.equal(response.headers.get('Location'), null);
}
test('authorized request returns exact binary bytes with no-store and no server identity', async () => {
  const f = fixture(); const r = await f.request({ headers: { Range: 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() } });
  assert.equal(r.status, 200); noStore(r);
  assert.equal(r.headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
  assert.deepEqual(f.calls, [['auth','valid'],['material',id,'valid'],['storage','server-only.pdf']]);
});
for (const [options, status] of [
  [{ headers: { Origin: 'https://evil.example' } },403],
  [{ headers: { Authorization: '' } },401], [{ headers: { Authorization: 'Bearer x y' } },401],
  [{ method: 'GET' },405], [{ method: 'HEAD' },405],
  [{ body: { id: 'bad' } },400], [{ body: { id, object_path: 'chosen.pdf' } },400],
  [{ body: { id, bucket: 'chosen' } },400], [{ body: [] },400], [{ body: null },400], [{ raw: '{' },400],
]) test(`invalid download request is denied before storage: ${JSON.stringify(options)}`, async () => {
  const f = fixture(); const r = await f.request(options); assert.equal(r.status,status); noStore(r);
  assert.ok(!f.calls.some(call => call[0] === 'storage'));
  if (options.headers?.Origin) assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
});
for (const options of [{ authorized: false }, { validUser: false }, { fail: 'auth' }, { fail: 'db' }, { fail: 'storage' }]) test(`failed authorization/service is generic and no-store: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); const r = await f.request(); assert.ok([401,403,502].includes(r.status)); noStore(r);
  assert.doesNotMatch(await r.text(), /private-|server-only|token|path|key/);
  if (!options.fail || options.fail !== 'storage') assert.ok(!f.calls.some(call => call[0] === 'storage'));
});
test('restricted preflight allows SDK headers and carries no-store', async () => {
  const r = await fixture().request({ method: 'OPTIONS' }); assert.equal(r.status,204); noStore(r);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin);
  for (const name of ['authorization','apikey','content-type','x-client-info']) assert.ok(r.headers.get('Access-Control-Allow-Headers').includes(name));
});
test('real bundled invoke returns binary Blob, API retypes it as PDF and uses only material ID', async () => {
  const f = fixture(); let sent;
  const client = createClient('https://example.supabase.co', 'test-only-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      sent = { url, body: JSON.parse(options.body) };
      return f.request({ body: sent.body });
    } },
  });
  const raw = await client.functions.invoke('baixar-material', { body: { id } });
  assert.ok(raw.data instanceof Blob); assert.equal(raw.data.type, 'application/octet-stream');
  const api = createPortalApi(client); api.getAccess = async () => ({ status: 'aluno' });
  client.from = () => { throw Error('Client must not query object paths'); };
  client.storage.from = () => { throw Error('Client must not download Storage'); };
  const pdf = await api.downloadMaterial(id);
  assert.ok(pdf instanceof Blob); assert.equal(pdf.type, 'application/pdf');
  assert.deepEqual(new Uint8Array(await pdf.arrayBuffer()), bytes);
  assert.equal(sent.url, 'https://example.supabase.co/functions/v1/baixar-material');
  assert.deepEqual(sent.body, { id });
});
test('API rejects failed invocation and nonbinary data safely', async () => {
  for (const result of [{ data: null, error: Error('private detail') }, { data: '%PDF-as-text', error: null }]) {
    const api = createPortalApi({ functions: { invoke: async () => result } }); api.getAccess = async () => ({ status: 'aluno' });
    await assert.rejects(api.downloadMaterial(id), error => /Material indisponível/.test(error.message) && !/private detail/.test(error.message));
  }
});

test('adapter uses JWT-scoped RLS lookup and only server path for administrative Storage', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const source = (await readFile(new URL('../../supabase/functions/baixar-material/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const calls = []; let handler;
  await runInNewContext(source, {
    URL, createHandler,
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'server-test', PORTAL_ALLOWED_ORIGIN: origin })[name] }, serve: fn => { handler = fn; } },
    createClient(url, key, options) {
      assert.equal(url, 'https://example.supabase.co');
      assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false); assert.equal(options.auth.detectSessionInUrl, false);
      if (key === 'server-test') return { storage: { from(bucket) { assert.equal(bucket,'materiais-alunos'); return { async download(...args) { calls.push(['download', ...args]); return { data: new Blob([bytes]), error: null }; } }; } } };
      return { auth: { getUser: async token => { assert.equal(token,'valid'); return { data: { user: { id: 'a' } }, error: null }; } },
        from(table) { assert.equal(table,'materiais_privados'); assert.equal(options.global.headers.Authorization, 'Bearer valid'); return {
          select(fields) { assert.equal(fields,'object_path'); return this; }, eq(field,value) { assert.equal(field,'id'); assert.equal(value,id); return this; },
          async maybeSingle() { calls.push(['lookup']); return { data: { object_path: 'rls-only.pdf' }, error: null }; },
        }; },
      };
    },
  });
  const response = await handler(new Request('https://example.supabase.co/functions/v1/baixar-material?path=evil', {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid', apikey: 'attacker-value', Range: 'bytes=0-1', 'If-None-Match': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  }));
  assert.equal(response.status,200);
  assert.deepEqual(calls, [['lookup'],['download','rls-only.pdf']]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
test('same endpoint/body/JWT reauthorizes on every request before reading bytes', async () => {
  let readable = true, downloaded = 0;
  const handler = createHandler({ allowedOrigins: [origin], auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) },
    db: { getMaterial: async () => readable ? { object_path: 'stored.pdf' } : null },
    storage: { download: async () => { downloaded++; return new Blob([bytes]); } },
  });
  const request = () => handler(new Request('https://example.supabase.co/functions/v1/baixar-material', { method: 'POST', headers: { Authorization: 'Bearer same-token', Origin: origin }, body: JSON.stringify({ id }) }));
  assert.equal((await request()).status,200); readable = false;
  const revoked = await request(); assert.equal(revoked.status,403); noStore(revoked); assert.equal(downloaded,1);
});
