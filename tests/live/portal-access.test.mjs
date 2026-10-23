import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const required = ['PORTAL_LIVE_OPT_IN', 'PORTAL_LIVE_TEST_PROJECT', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) assert.ok(process.env[name], `Missing ${name}; real tests require an isolated test project`);
assert.equal(process.env.PORTAL_LIVE_OPT_IN, 'YES_ISOLATED_TEST_PROJECT');
assert.equal(process.env.PORTAL_LIVE_TEST_PROJECT, 'true');
const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const projectRef = process.env.PORTAL_LIVE_TEST_PROJECT_REF;
assert.ok(projectRef, 'Missing PORTAL_LIVE_TEST_PROJECT_REF');
assert.equal(new URL(base).hostname, `${projectRef}.supabase.co`, 'Test project ref does not match URL');
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = randomUUID();
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const path = `${randomUUID()}.pdf`;
const users = [];
let materialId;

async function request(route, key, token, method = 'GET', body, contentType = 'application/json') {
  const headers = { apikey: key, Authorization: `Bearer ${token ?? key}` };
  if (body !== undefined) headers['Content-Type'] = contentType;
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes, json: () => JSON.parse(bytes.toString()) };
}
async function admin(route, method = 'GET', body) { return request(route, service, service, method, body); }
async function createUser(tag) {
  const email = `${tag}-${run}@portal.test.invalid`;
  const password = `${randomUUID()}Aa9!`;
  const response = await admin('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  assert.ok([200, 201].includes(response.status), `create synthetic ${tag}: ${response.status}`);
  const id = response.json().id;
  users.push(id);
  const login = await request('/auth/v1/token?grant_type=password', anon, null, 'POST', { email, password });
  assert.equal(login.status, 200, `login synthetic ${tag}: ${login.status}`);
  return { id, token: login.json().access_token };
}
async function table(name, token, query = '') {
  const result = await request(`/rest/v1/${name}?select=*${query}`, anon, token);
  if (token) assert.equal(result.status, 200, `read ${name}: ${result.status}`);
  return result;
}
async function download(token) { return request(`/storage/v1/object/authenticated/materiais-alunos/${path}`, anon, token); }
function denied(response, label) { assert.ok([401, 403, 404].includes(response.status), `${label}: expected auth denial, got HTTP ${response.status}`); }

// This test mutates only synthetic fixtures in an explicitly marked disposable project.
test('real RLS and Storage revocation using the same JWT', async () => {
  try {
    const professor = await createUser('prof');
    const a = await createUser('a');
    const b = await createUser('b');
    const outsider = await createUser('outsider');
    assert.equal((await admin('/rest/v1/professores', 'POST', [{ user_id: professor.id }])).status, 201);
    for (const [student, name] of [[a, 'A'], [b, 'B']]) {
      assert.equal((await admin('/rest/v1/alunos', 'POST', [{ user_id: student.id, nome: name, email: `${name}-${run}@portal.test.invalid` }])).status, 201);
    }
    const upload = await request(`/storage/v1/object/materiais-alunos/${path}`, anon, professor.token, 'POST', pdf, 'application/pdf');
    assert.ok([200, 201].includes(upload.status), `teacher upload: ${upload.status}`);
    assert.deepEqual((await download(professor.token)).bytes, pdf, 'teacher downloads uploaded PDF');
    denied(await download(a.token), 'unlinked upload');
    const saved = await request('/rest/v1/rpc/save_material', anon, professor.token, 'POST', {
      p_id: null, p_metadata: { titulo: 'Synthetic PDF', tipo: 'aula', data_referencia: '2026-10-23', object_path: path, nome_original: 'test.pdf', publicado: true }, p_student_ids: [a.id],
    });
    assert.equal(saved.status, 200, `save material: ${saved.status}`);
    materialId = saved.json();
    assert.equal((await table('materiais_privados', a.token)).json().length, 1);
    const known = await download(a.token);
    assert.equal(known.status, 200);
    assert.deepEqual(known.bytes, pdf);
    assert.equal((await table('materiais_privados', b.token)).json().length, 0);
    assert.equal((await table('materiais_privados', outsider.token)).json().length, 0);
    denied(await download(outsider.token), 'authenticated outsider download');
    denied(await request('/rest/v1/professores', anon, a.token, 'POST', { user_id: a.id }), 'student promotion');
    denied(await request(`/storage/v1/object/materiais-alunos/${randomUUID()}.pdf`, anon, a.token, 'POST', pdf, 'application/pdf'), 'student upload');
    denied(await download(b.token), 'B download');
    denied(await download(null), 'visitor download');
    denied(await table('materiais_privados', null), 'visitor metadata');

    assert.equal((await admin(`/rest/v1/alunos?user_id=eq.${a.id}`, 'PATCH', { ativo: false })).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'inactive same-session download');
    assert.equal((await admin(`/rest/v1/alunos?user_id=eq.${a.id}`, 'PATCH', { ativo: true })).status, 204);
    assert.equal((await download(a.token)).status, 200);

    assert.equal((await admin(`/rest/v1/acessos_materiais?material_id=eq.${materialId}&aluno_id=eq.${a.id}`, 'DELETE')).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'unassigned download');
    assert.equal((await admin('/rest/v1/acessos_materiais', 'POST', [{ material_id: materialId, aluno_id: a.id }])).status, 201);
    assert.equal((await download(a.token)).status, 200);

    assert.equal((await admin(`/rest/v1/materiais_privados?id=eq.${materialId}`, 'PATCH', { publicado: false })).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'unpublished download');
  } finally {
    const cleanupErrors = [];
    async function cleanup(label, work) {
      try {
        const result = await work();
        if (![200, 204, 404].includes(result.status)) cleanupErrors.push(`${label}: HTTP ${result.status}`);
      } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
    }
    if (materialId) await cleanup('assignments', () => admin(`/rest/v1/acessos_materiais?material_id=eq.${materialId}`, 'DELETE'));
    if (materialId) await cleanup('material', () => admin(`/rest/v1/materiais_privados?id=eq.${materialId}`, 'DELETE'));
    await cleanup('PDF', () => admin(`/storage/v1/object/materiais-alunos/${path}`, 'DELETE'));
    for (const id of users) {
      await cleanup('student', () => admin(`/rest/v1/alunos?user_id=eq.${id}`, 'DELETE'));
      await cleanup('professor', () => admin(`/rest/v1/professores?user_id=eq.${id}`, 'DELETE'));
      await cleanup('auth user', () => admin(`/auth/v1/admin/users/${id}`, 'DELETE'));
    }
    assert.deepEqual(cleanupErrors, [], 'Synthetic fixture cleanup failed');
  }
});
