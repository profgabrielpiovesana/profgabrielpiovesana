import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withFixtureCleanup, isMissingStorageObject, isDeniedResponse } from './support.mjs';

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
const scratchPath = `${randomUUID()}.pdf`;
const rejectedPath = `${randomUUID()}.pdf`;
const users = [];
let materialId;
let scratchMaterialId;

async function request(route, key, token, method = 'GET', body, contentType = 'application/json', extraHeaders = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token ?? key}`, ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = contentType;
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes, json: () => JSON.parse(bytes.toString()) };
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
// Keep origin checks for direct Storage; the new POST always reuses URL/body/JWT.
async function storageDownload(token) { return request(`/storage/v1/object/authenticated/materiais-alunos/${path}?cb=${randomUUID()}`, anon, token); }
const stableDownloadRoute = '/functions/v1/baixar-material';
async function download(token, headers = {}) {
  const response = await request(stableDownloadRoute, anon, token, 'POST', { id: materialId }, 'application/json', headers);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  for (const name of ['origin','authorization']) assert.ok(response.headers.get('Vary')?.toLowerCase().split(/,\s*/).includes(name));
  return response;
}
async function stableDownload(token) { return download(token); }
async function directStorageDenied(token, label) {
  for (const route of ['object', 'object/authenticated']) {
    const url = `/storage/v1/${route}/materiais-alunos/${path}`;
    denied(await request(url, anon, token), `${label}: ${route} stable direct GET`);
    denied(await request(`${url}?cb=${randomUUID()}`, anon, token), `${label}: ${route} origin direct GET`);
  }
}
function denied(response, label) { assert.ok(isDeniedResponse(response), `${label}: expected auth denial, got HTTP ${response.status}`); }
function deniedOrNoop(response, label) { assert.ok([200, 204, 401, 403, 404].includes(response.status), `${label}: unexpected HTTP ${response.status}`); }

// This test mutates only synthetic fixtures in an explicitly marked disposable project.
test('real RLS and Storage revocation using the same JWT', async () => withFixtureCleanup(async () => {
    const professor = await createUser('prof');
    const a = await createUser('a');
    const b = await createUser('b');
    const outsider = await createUser('outsider');
    assert.equal((await admin('/rest/v1/professores', 'POST', [{ user_id: professor.id }])).status, 201);
    const professorFunction = await request('/functions/v1/gerenciar-alunos', anon, professor.token, 'POST', { action: 'listar-alunos' });
    assert.equal(professorFunction.status, 200, `professor Edge Function: ${professorFunction.status}`);
    assert.deepEqual(professorFunction.json().alunos, []);
    const studentFunction = await request('/functions/v1/gerenciar-alunos', anon, a.token, 'POST', { action: 'listar-alunos' });
    assert.equal(studentFunction.status, 403, `student Edge Function: ${studentFunction.status}`);
    const identity = await request('/auth/v1/user', anon, outsider.token);
    assert.equal(identity.status, 200, 'unenrolled user has a valid Auth identity');
    assert.equal(identity.json().id, outsider.id);
    for (const [student, name] of [[a, 'A'], [b, 'B']]) {
      assert.equal((await admin('/rest/v1/alunos', 'POST', [{ user_id: student.id, nome: name, email: `${name}-${run}@portal.test.invalid` }])).status, 201);
    }
    assert.deepEqual((await table('alunos', b.token)).json().map(row => row.user_id), [b.id], 'B reads own enrollment');
    assert.deepEqual((await table('alunos', outsider.token)).json(), [], 'unenrolled Auth user sees no enrollment');

    // Direct CRUD uses the professor JWT, not the service key used to seed Auth.
    assert.equal((await request('/rest/v1/alunos', anon, professor.token, 'POST',
      { user_id: outsider.id, nome: 'Temporary', email: `temporary-${run}@portal.test.invalid` })).status, 201);
    assert.equal((await table('alunos', professor.token, `&user_id=eq.${outsider.id}`)).json().length, 1);
    assert.equal((await request(`/rest/v1/alunos?user_id=eq.${outsider.id}`, anon, professor.token, 'PATCH', { nome: 'Edited' })).status, 204);
    assert.equal((await table('alunos', professor.token, `&user_id=eq.${outsider.id}`)).json()[0].nome, 'Edited');
    assert.equal((await request('/rest/v1/materiais_privados', anon, professor.token, 'POST', {
      titulo: 'Temporary PDF', tipo: 'lista', disciplina: 'matematica', data_referencia: '2026-10-23', object_path: scratchPath, nome_original: 'temp.pdf', publicado: false,
    })).status, 201);
    const scratch = (await table('materiais_privados', professor.token, `&object_path=eq.${scratchPath}`)).json();
    assert.equal(scratch.length, 1, 'professor directly creates material');
    scratchMaterialId = scratch[0].id;
    assert.equal((await request(`/rest/v1/materiais_privados?id=eq.${scratchMaterialId}`, anon, professor.token, 'PATCH', { descricao: 'Edited' })).status, 204);
    assert.equal((await table('materiais_privados', professor.token, `&id=eq.${scratchMaterialId}`)).json()[0].descricao, 'Edited');
    assert.equal((await request('/rest/v1/acessos_materiais', anon, professor.token, 'POST', { material_id: scratchMaterialId, aluno_id: b.id })).status, 201);
    assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${scratchMaterialId}`)).json().length, 1);
    assert.equal((await request(`/rest/v1/acessos_materiais?material_id=eq.${scratchMaterialId}&aluno_id=eq.${b.id}`, anon, professor.token, 'PATCH', { aluno_id: outsider.id })).status, 204);
    assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${scratchMaterialId}`)).json()[0].aluno_id, outsider.id);
    assert.equal((await request(`/rest/v1/acessos_materiais?material_id=eq.${scratchMaterialId}`, anon, professor.token, 'DELETE')).status, 204);
    assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${scratchMaterialId}`)).json().length, 0);
    assert.equal((await request(`/rest/v1/alunos?user_id=eq.${outsider.id}`, anon, professor.token, 'DELETE')).status, 204);
    assert.equal((await table('alunos', professor.token, `&user_id=eq.${outsider.id}`)).json().length, 0);

    // Every negative INSERT uses valid FKs and unique paths, so constraints cannot fake an RLS denial.
    denied(await request('/rest/v1/alunos', anon, a.token, 'POST', {
      user_id: outsider.id, nome: 'Intruder', email: `intruder-${run}@portal.test.invalid`,
    }), 'student inserts enrollment');
    denied(await request('/rest/v1/alunos', anon, null, 'POST', {
      user_id: outsider.id, nome: 'Visitor', email: `visitor-${run}@portal.test.invalid`,
    }), 'visitor inserts enrollment');
    denied(await request('/rest/v1/materiais_privados', anon, a.token, 'POST', {
      titulo: 'Intruder', tipo: 'aula', disciplina: 'fisica', data_referencia: '2026-10-23', object_path: rejectedPath, nome_original: 'x.pdf',
    }), 'student inserts material');
    denied(await request('/rest/v1/materiais_privados', anon, null, 'POST', {
      titulo: 'Visitor', tipo: 'aula', disciplina: 'fisica', data_referencia: '2026-10-23', object_path: rejectedPath, nome_original: 'x.pdf',
    }), 'visitor inserts material');
    denied(await request('/rest/v1/acessos_materiais', anon, a.token, 'POST', { material_id: scratchMaterialId, aluno_id: b.id }), 'student inserts assignment');
    denied(await request('/rest/v1/acessos_materiais', anon, null, 'POST', { material_id: scratchMaterialId, aluno_id: b.id }), 'visitor inserts assignment');
    assert.equal((await table('alunos', professor.token, `&user_id=eq.${outsider.id}`)).json().length, 0);
    assert.equal((await table('materiais_privados', professor.token, `&object_path=eq.${rejectedPath}`)).json().length, 0);
    assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${scratchMaterialId}`)).json().length, 0);
    assert.equal((await request(`/rest/v1/materiais_privados?id=eq.${scratchMaterialId}`, anon, professor.token, 'DELETE')).status, 204);
    assert.equal((await table('materiais_privados', professor.token, `&id=eq.${scratchMaterialId}`)).json().length, 0);
    scratchMaterialId = undefined;

    const upload = await request(`/storage/v1/object/materiais-alunos/${path}`, anon, professor.token, 'POST', pdf, 'application/pdf');
    assert.ok([200, 201].includes(upload.status), `teacher upload: ${upload.status}`);
    assert.deepEqual((await storageDownload(professor.token)).bytes, pdf, 'teacher downloads uploaded PDF');
    denied(await storageDownload(a.token), 'unlinked upload');
    const saved = await request('/rest/v1/rpc/save_material', anon, professor.token, 'POST', {
      p_id: null, p_metadata: { titulo: 'Synthetic PDF', tipo: 'aula', disciplina: 'fisica', data_referencia: '2026-10-23', object_path: path, nome_original: 'test.pdf', publicado: true }, p_student_ids: [a.id],
    });
    assert.equal(saved.status, 200, `save material: ${saved.status}`);
    materialId = saved.json();
    assert.equal((await table('materiais_privados', a.token)).json().length, 1);
    // RLS may answer UPDATE/DELETE with 204 and zero rows; read back as professor to prove no mutation.
    for (const token of [a.token, null]) {
      const label = token ? 'student' : 'visitor';
      deniedOrNoop(await request(`/rest/v1/alunos?user_id=eq.${a.id}`, anon, token, 'PATCH', { ativo: false }), `${label} updates enrollment`);
      deniedOrNoop(await request(`/rest/v1/materiais_privados?id=eq.${materialId}`, anon, token, 'PATCH', { publicado: false }), `${label} updates material`);
      deniedOrNoop(await request(`/rest/v1/acessos_materiais?material_id=eq.${materialId}&aluno_id=eq.${a.id}`, anon, token, 'PATCH', { aluno_id: b.id }), `${label} updates assignment`);
      assert.equal((await table('alunos', professor.token, `&user_id=eq.${a.id}`)).json()[0].ativo, true);
      assert.equal((await table('materiais_privados', professor.token, `&id=eq.${materialId}`)).json()[0].publicado, true);
      assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${materialId}`)).json()[0].aluno_id, a.id);
      deniedOrNoop(await request(`/rest/v1/acessos_materiais?material_id=eq.${materialId}&aluno_id=eq.${a.id}`, anon, token, 'DELETE'), `${label} deletes assignment`);
      deniedOrNoop(await request(`/rest/v1/materiais_privados?id=eq.${materialId}`, anon, token, 'DELETE'), `${label} deletes material`);
      deniedOrNoop(await request(`/rest/v1/alunos?user_id=eq.${a.id}`, anon, token, 'DELETE'), `${label} deletes enrollment`);
      assert.equal((await table('alunos', professor.token, `&user_id=eq.${a.id}`)).json().length, 1);
      assert.equal((await table('materiais_privados', professor.token, `&id=eq.${materialId}`)).json().length, 1);
      assert.equal((await table('acessos_materiais', professor.token, `&material_id=eq.${materialId}`)).json().length, 1);
    }
    await directStorageDenied(a.token, 'active assigned student');
    const listed = await request('/storage/v1/object/list/materiais-alunos', anon, a.token, 'POST', { prefix: '', limit: 100 });
    if (listed.status === 200) assert.deepEqual(listed.json(), [], 'student cannot list objects');
    else denied(listed, 'student listing');
    const known = await download(a.token);
    assert.equal(known.status, 200);
    assert.deepEqual(known.bytes, pdf);
    assert.equal(known.headers.get('Content-Type'), 'application/octet-stream');
    for (const method of ['GET','HEAD']) {
      assert.equal((await request(stableDownloadRoute, anon, a.token, method)).status, 405);
    }
    for (const headers of [{ Range: 'bytes=0-1' }, { 'If-None-Match': '*' }, { 'If-Modified-Since': new Date().toUTCString() }]) {
      const response = await download(a.token, headers);
      assert.equal(response.status, 200); assert.deepEqual(response.bytes, pdf);
    }
    denied(await request(`/storage/v1/object/sign/materiais-alunos/${path}`, anon, a.token, 'POST', { expiresIn: 60 }), 'assigned active student single signing');
    const batch = await request('/storage/v1/object/sign/materiais-alunos', anon, a.token, 'POST', { paths: [path], expiresIn: 60 });
    // Batch signing can return HTTP 200 with a per-object denial.
    if (batch.status === 200) {
      const results = batch.json();
      assert.equal(results.length, 1);
      assert.ok(results[0].error, 'batch signing must return an object error');
      assert.ok(!results[0].signedURL && !results[0].signedUrl, 'batch signing must not issue a URL');
    } else denied(batch, 'assigned active student batch signing');
    assert.equal((await download(a.token)).status, 200, 'signing denial retains authorized endpoint download');
    assert.equal((await table('materiais_privados', b.token)).json().length, 0);
    assert.equal((await table('materiais_privados', outsider.token)).json().length, 0);
    denied(await download(outsider.token), 'authenticated outsider download');
    denied(await request('/rest/v1/professores', anon, a.token, 'POST', { user_id: a.id }), 'student promotion');
    denied(await request(`/storage/v1/object/materiais-alunos/${randomUUID()}.pdf`, anon, a.token, 'POST', pdf, 'application/pdf'), 'student upload');
    denied(await download(b.token), 'B download');
    denied(await download(null), 'visitor download');
    denied(await table('materiais_privados', null), 'visitor metadata');

    const warmdeactivation = await stableDownload(a.token);
    assert.equal(warmdeactivation.status, 200, 'deactivation: stable URL accessible before revocation');
    assert.deepEqual(warmdeactivation.bytes, pdf);
    assert.equal((await admin(`/rest/v1/alunos?user_id=eq.${a.id}`, 'PATCH', { ativo: false })).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'inactive same-session download');
    denied(await stableDownload(a.token), 'deactivation: same warmed URL and same JWT');
    denied(await download(a.token, { Range: 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() }), 'deactivation: conditional/range cannot bypass revocation');
    await directStorageDenied(a.token, 'deactivation');
    assert.equal((await admin(`/rest/v1/alunos?user_id=eq.${a.id}`, 'PATCH', { ativo: true })).status, 204);
    assert.equal((await download(a.token)).status, 200);

    const warmunassignment = await stableDownload(a.token);
    assert.equal(warmunassignment.status, 200, 'unassignment: stable URL accessible before revocation');
    assert.deepEqual(warmunassignment.bytes, pdf);
    assert.equal((await admin(`/rest/v1/acessos_materiais?material_id=eq.${materialId}&aluno_id=eq.${a.id}`, 'DELETE')).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'unassigned download');
    denied(await stableDownload(a.token), 'unassignment: same warmed URL and same JWT');
    denied(await download(a.token, { Range: 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() }), 'unassignment: conditional/range cannot bypass revocation');
    await directStorageDenied(a.token, 'unassignment');
    assert.equal((await admin('/rest/v1/acessos_materiais', 'POST', [{ material_id: materialId, aluno_id: a.id }])).status, 201);
    assert.equal((await download(a.token)).status, 200);

    const warmunpublication = await stableDownload(a.token);
    assert.equal(warmunpublication.status, 200, 'unpublication: stable URL accessible before revocation');
    assert.deepEqual(warmunpublication.bytes, pdf);
    assert.equal((await admin(`/rest/v1/materiais_privados?id=eq.${materialId}`, 'PATCH', { publicado: false })).status, 204);
    assert.equal((await table('materiais_privados', a.token)).json().length, 0);
    denied(await download(a.token), 'unpublished download');
    denied(await stableDownload(a.token), 'unpublication: same warmed URL and same JWT');
    denied(await download(a.token, { Range: 'bytes=0-1', 'If-None-Match': '*', 'If-Modified-Since': new Date().toUTCString() }), 'unpublication: conditional/range cannot bypass revocation');
    await directStorageDenied(a.token, 'unpublication');
  }, async () => {
    const cleanupErrors = [];
    async function cleanup(label, work, allowMissingObject = false) {
      try {
        const result = await work();
        if (![200, 204, 404].includes(result.status) && !(allowMissingObject && isMissingStorageObject(result))) cleanupErrors.push(`${label}: HTTP ${result.status}`);
      } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
    }
    if (scratchMaterialId) await cleanup('scratch assignments', () => admin(`/rest/v1/acessos_materiais?material_id=eq.${scratchMaterialId}`, 'DELETE'));
    await cleanup('scratch material', () => admin(`/rest/v1/materiais_privados?object_path=eq.${scratchPath}`, 'DELETE'));
    if (materialId) await cleanup('assignments', () => admin(`/rest/v1/acessos_materiais?material_id=eq.${materialId}`, 'DELETE'));
    await cleanup('material', () => admin(`/rest/v1/materiais_privados?object_path=eq.${path}`, 'DELETE'));
    await cleanup('PDF', () => admin(`/storage/v1/object/materiais-alunos/${path}`, 'DELETE'), true);
    for (const id of users) {
      await cleanup('student', () => admin(`/rest/v1/alunos?user_id=eq.${id}`, 'DELETE'));
      await cleanup('professor', () => admin(`/rest/v1/professores?user_id=eq.${id}`, 'DELETE'));
      await cleanup('auth user', () => admin(`/auth/v1/admin/users/${id}`, 'DELETE'));
    }
    // Read back only the identifiers created by this run; a successful DELETE can affect zero rows.
    async function expectEmpty(label, route) {
      try {
        const result = await admin(route);
        if (result.status !== 200 || result.json().length !== 0) cleanupErrors.push(`${label}: cleanup readback failed (HTTP ${result.status})`);
      } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
    }
    for (const id of users) {
      await expectEmpty('student', `/rest/v1/alunos?select=user_id&user_id=eq.${id}`);
      await expectEmpty('professor', `/rest/v1/professores?select=user_id&user_id=eq.${id}`);
      try {
        const result = await admin(`/auth/v1/admin/users/${id}`);
        if (result.status !== 404) cleanupErrors.push(`auth user: cleanup readback HTTP ${result.status}`);
      } catch (error) { cleanupErrors.push(`auth user: ${error.message}`); }
    }
    for (const objectPath of [scratchPath, path, rejectedPath]) {
      await expectEmpty('material', `/rest/v1/materiais_privados?select=id&object_path=eq.${objectPath}`);
      try {
        const result = await admin('/storage/v1/object/list/materiais-alunos', 'POST', { prefix: '', search: objectPath, limit: 100 });
        if (result.status !== 200 || result.json().some(item => item.name === objectPath)) {
          cleanupErrors.push(`PDF ${objectPath}: cleanup readback failed (HTTP ${result.status})`);
        }
      } catch (error) { cleanupErrors.push(`PDF ${objectPath}: ${error.message}`); }
    }
    for (const id of [materialId, scratchMaterialId].filter(Boolean)) {
      await expectEmpty('assignment', `/rest/v1/acessos_materiais?select=material_id&material_id=eq.${id}`);
    }
    assert.deepEqual(cleanupErrors, [], 'Synthetic fixture cleanup failed');
  }));
