import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortalApi } from '../../scripts/portal/api.mjs';
import { createProfessorController } from '../../scripts/portal/professor.mjs';

const pdf = () => Object.assign(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { name: 'a.pdf' });
const metadata = { title: 'Aula', type: 'aula', date: '2026-10-24', description: '', studentIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] };
function fixture({ role = 'professor', uploadError = null, rpcError = null, removeError = null, committed = false } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }), getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    from(table) { return {
      select(fields) { calls.push(['select', table, fields]); return this; }, update(value) { calls.push(['update', table, value]); return this; }, eq(column, value) { calls.push(['eq', column, value]); return this; },
      async maybeSingle() { const last = [...calls].reverse().find(c => c[0] === 'eq'); return { data: table === 'professores' && role === 'professor' ? { user_id: 'teacher' } : table === 'materiais_privados' && last?.[1] === 'id' ? { id: 'material-id', titulo: 'Aula', tipo: 'aula', descricao: '', data_referencia: '2026-10-24', publicado: true, acessos_materiais: metadata.studentIds.map(aluno_id => ({ aluno_id })) } : table === 'materiais_privados' && committed ? { id: 'committed' } : null, error: null }; },
      async then(resolve) { return resolve({ data: table === 'materiais_privados' ? [] : [], error: null }); },
    }; },
    functions: { async invoke(name, options) { calls.push(['invoke', name, options.body]); return { data: { alunos: [], aluno: { user_id: 'id' } }, error: null }; } },
    storage: { from(bucket) { assert.equal(bucket, 'materiais-alunos'); return {
      async upload(path, file, opts) { calls.push(['upload', path, file, opts]); return { error: uploadError }; },
      async remove(paths) { calls.push(['remove', paths]); return { error: removeError }; },
    }; } },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: 'material-id', error: rpcError }; },
  };
  return { api: createPortalApi(client), calls };
}

test('one validated PDF upload serves multiple recipients through one transaction', async () => {
  const { api, calls } = fixture();
  assert.equal(await api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), 'material-id');
  assert.equal(calls.filter(c => c[0] === 'upload').length, 1);
  assert.match(calls.find(c => c[0] === 'upload')[1], /^[0-9a-f-]{36}\.pdf$/);
  const rpc = calls.find(c => c[0] === 'rpc');
  assert.equal(rpc[1], 'save_material');
  assert.deepEqual(rpc[2].p_student_ids, metadata.studentIds);
  assert.equal(rpc[2].p_metadata.titulo, 'Aula');
});

test('invalid file and recipient data fail before upload', async () => {
  const { api, calls } = fixture();
  await assert.rejects(api.publishMaterial({ metadata, file: new Blob(['bad'], { type: 'application/pdf' }), studentIds: metadata.studentIds }));
  await assert.rejects(api.publishMaterial({ metadata: { ...metadata, studentIds: [] }, file: pdf(), studentIds: [] }));
  assert.equal(calls.some(c => c[0] === 'upload'), false);
});

test('student role cannot administer or upload', async () => {
  const { api, calls } = fixture({ role: 'aluno' });
  await assert.rejects(api.listStudents(), /Acesso/);
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), /Acesso/);
  assert.equal(calls.some(c => ['upload', 'invoke'].includes(c[0])), false);
});

test('server action mapping includes enrollment recovery', async () => {
  const { api, calls } = fixture();
  await api.inviteStudent({ name: 'Ana', email: 'a@example.com' });
  await api.resendInvite('id');
  await api.completeEnrollment({ name: 'Ana', email: 'a@example.com' });
  await api.setStudentActive('id', false);
  assert.deepEqual(calls.filter(c => c[0] === 'invoke').map(c => c[2].action), ['convidar', 'reenviar-convite', 'completar-matricula', 'definir-ativo']);
});

test('editing and publication toggle do not upload again', async () => {
  const { api, calls } = fixture();
  await api.updateMaterial('material-id', { metadata, studentIds: metadata.studentIds });
  await api.setMaterialPublished('material-id', false);
  await api.setMaterialPublished('material-id', true);
  assert.equal(calls.some(c => c[0] === 'upload'), false);
});

test('upload and RPC errors show no success; cleanup only own uncommitted object', async () => {
  for (const options of [{ uploadError: new Error('upload') }, { rpcError: new Error('rpc') }, { rpcError: new Error('rpc'), removeError: new Error('cleanup') }]) {
    const { api, calls } = fixture(options);
    await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }));
    assert.equal(calls.filter(c => c[0] === 'remove').length, 1);
    assert.equal(calls.find(c => c[0] === 'remove')[1][0], calls.find(c => c[0] === 'upload')[1]);
  }
  const { api, calls } = fixture({ rpcError: new Error('unknown'), committed: true });
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }));
  assert.equal(calls.some(c => c[0] === 'remove'), false);
});

test('controller clears busy state and discards old results after logout', async () => {
  let finish;
  const ctl = createProfessorController({ listStudents: () => new Promise(resolve => { finish = resolve; }), listTeacherMaterials: async () => [] });
  const pending = ctl.refresh();
  assert.equal(ctl.busy, true);
  ctl.clear(); finish([]);
  assert.equal((await pending).status, 'cancelled');
  assert.equal(ctl.busy, false);
});
