import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortalApi } from '../../scripts/portal/api.mjs';
import { createProfessorController } from '../../scripts/portal/professor.mjs';

const pdf = () => Object.assign(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { name: 'a.pdf' });
const metadata = { title: 'Aula', type: 'aula', date: '2026-10-24', description: '', studentIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] };
function fixture({ role = 'professor', uploadError = null, rpcError = null, removeError = null, committed = false, readbackError = null, inactiveRecipient = false, delayedCommit = false } = {}) {
  const calls = [];
  let secondRecipientActive = !inactiveRecipient;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }), getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    from(table) { return {
      select(fields) { calls.push(['select', table, fields]); return this; }, update(value) { calls.push(['update', table, value]); return this; }, eq(column, value) { calls.push(['eq', column, value]); return this; },
      async maybeSingle() { const last = [...calls].reverse().find(c => c[0] === 'eq'); if (table === 'materiais_privados' && last?.[1] === 'object_path' && readbackError) return {data:null,error:readbackError}; return { data: table === 'professores' && role === 'professor' ? { user_id: 'teacher' } : table === 'materiais_privados' && last?.[1] === 'id' ? { id: 'material-id', titulo: 'Aula', tipo: 'aula', descricao: '', data_referencia: '2026-10-24', publicado: true, acessos_materiais: metadata.studentIds.map(aluno_id => ({ aluno_id })) } : table === 'materiais_privados' && committed ? { id: 'committed' } : null, error: null }; },
      async then(resolve) { return resolve({ data: table === 'materiais_privados' ? [] : [], error: null }); },
    }; },
    functions: { async invoke(name, options) { calls.push(['invoke', name, options.body]); if (options.body.action === 'definir-ativo' && options.body.user_id === metadata.studentIds[1]) secondRecipientActive = options.body.ativo; return { data: { alunos: metadata.studentIds.map((user_id, i) => ({ user_id, ativo: i === 0 || secondRecipientActive })), aluno: { user_id: 'id' } }, error: null }; } },
    storage: { from(bucket) { assert.equal(bucket, 'materiais-alunos'); return {
      async upload(path, file, opts) { calls.push(['upload', path, file, opts]); return { error: uploadError }; },
      async remove(paths) { calls.push(['remove', paths]); return { error: removeError }; },
    }; } },
    async rpc(name, args) { calls.push(['rpc', name, args]); if (delayedCommit) { queueMicrotask(() => { calls.push(['late-commit', args.p_metadata.object_path]); }); throw new Error('transport timeout'); } return { data: 'material-id', error: rpcError }; },
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

test('known SQL rejection cleans only its own upload and keeps cleanup cause', async () => {
  const sqlError = Object.assign(new Error('invalid recipients'), { code: 'P0001' });
  const { api, calls } = fixture({ rpcError: sqlError, removeError: new Error('remove denied') });
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), error => {
    assert.match(error.message, /invalid recipients/);
    assert.match(error.message, /remove denied/);
    return true;
  });
  assert.deepEqual(calls.find(c => c[0] === 'remove')[1], [calls.find(c => c[0] === 'upload')[1]]);
});

test('transport error preserves PDF even if immediate readback sees no row before delayed commit', async () => {
  const { api, calls } = fixture({ delayedCommit: true });
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), /transport timeout.*conferência/);
  assert.equal(calls.some(c => c[0] === 'remove'), false);
  assert.equal(calls.some(c => c[0] === 'late-commit'), true);
  assert.equal(calls.some(c => c[0] === 'eq' && c[1] === 'object_path'), true);
});

test('readback error after unknown RPC result preserves object', async () => {
  const { api, calls } = fixture({ rpcError: new Error('transport'), readbackError: new Error('read failed') });
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), /conferência/);
  assert.equal(calls.some(c => c[0] === 'remove'), false);
});

test('upload failure can clean own path, and failed cleanup reports both errors', async () => {
  const { api, calls } = fixture({ uploadError: new Error('upload rejected'), removeError: new Error('cleanup rejected') });
  await assert.rejects(api.publishMaterial({ metadata, file: pdf(), studentIds: metadata.studentIds }), /upload rejected.*cleanup rejected/);
  assert.deepEqual(calls.find(c => c[0] === 'remove')[1], [calls.find(c => c[0] === 'upload')[1]]);
});

test('inactive recipient blocks editing without losing assignment; publication still toggles', async () => {
  const { api, calls } = fixture();
  await api.setStudentActive(metadata.studentIds[1], false);
  await assert.rejects(api.updateMaterial('material-id', { metadata, studentIds: [metadata.studentIds[0]] }), /Reative/);
  assert.equal(calls.some(c => c[0] === 'rpc'), false);
  await api.setMaterialPublished('material-id', false);
  await api.setMaterialPublished('material-id', true);
  assert.equal(calls.filter(c => c[0] === 'update').length, 2);
  await api.setStudentActive(metadata.studentIds[1], true);
  await api.updateMaterial('material-id', { metadata, studentIds: metadata.studentIds });
  assert.deepEqual(calls.find(c => c[0] === 'rpc')[2].p_student_ids, metadata.studentIds);
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

test('controller failure leaves no success state and releases busy flag', async () => {
  const ctl = createProfessorController({ listStudents: async () => { throw new Error('failed'); }, listTeacherMaterials: async () => [] });
  const result = await ctl.refresh();
  assert.equal(result.status, 'error');
  assert.equal(ctl.busy, false);
  assert.deepEqual(ctl.students, []);
});
