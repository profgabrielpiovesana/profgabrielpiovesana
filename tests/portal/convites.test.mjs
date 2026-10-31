import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../supabase/functions/gerenciar-alunos/handler.mjs';

const origin = 'https://gabrielpiovesana.github.io';
const oldId = '11111111-1111-4111-8111-111111111111';
function fixture({ professor = true, user = { id: 'prof', user_metadata: { role: 'professor' } }, students = [], users = [], failDb = false, failInvite = false } = {}) {
  const calls = [];
  let dbFails = failDb;
  const auth = {
    async getUser(token) { calls.push('getUser'); return token === 'valid' ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid' } }; },
    async findUserByEmail(email) { calls.push('findUserByEmail'); return users.find(u => u.email === email) ?? null; },
    async getUserById(id) { calls.push('getUserById'); return users.find(u => u.id === id) ?? null; },
    async setUserName(id, nome) { calls.push('setUserName'); const target = users.find(u => u.id === id); if (target) target.user_metadata = { ...target.user_metadata, nome }; },
    async inviteUserByEmail(email) { calls.push('invite'); if (!users.some(u => u.email === email)) users.push({ id: 'new-id', email }); return failInvite ? { data: null, error: { message: 'provider failed' } } : { data: { user: { id: users.find(u => u.email === email)?.id ?? 'new-id', email } }, error: null }; },
  };
  const db = {
    async isProfessor(id, token) { calls.push('isProfessor'); assert.equal(token, 'valid'); return professor && id === 'prof'; },
    async listStudents() { calls.push('listStudents'); return students; },
    async findStudentByEmail(email) { calls.push('findStudentByEmail'); return students.find(s => s.email === email) ?? null; },
    async findStudentById(id) { calls.push('findStudentById'); return students.find(s => s.user_id === id) ?? null; },
    async insertStudent(row) { calls.push('insertStudent'); if (dbFails) throw Error('DB failed'); students.push({ ...row, ativo: true }); return students.at(-1); },
    async setActive(id, active) { calls.push('setActive'); const s = students.find(s => s.user_id === id); if (!s) return null; s.ativo = active; return s; },
  };
  const handler = createHandler({ auth, db, allowedOrigins: [origin] });
  const request = (action, body = {}, headers = {}) => handler(new Request('https://example.supabase.co/functions/v1/gerenciar-alunos', {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action, ...body }),
  }));
  return { calls, students, request, setDbFailure(value) { dbFails = value; } };
}

test('rejects wrong origin, no session and metadata-only professor before admin calls', async () => {
  const f = fixture({ professor: false });
  assert.equal((await f.request('listar-alunos', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.request('listar-alunos', {}, { Authorization: '' })).status, 401);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.request('listar-alunos')).status, 403);
  assert.deepEqual(f.calls, ['getUser', 'isProfessor']);
});

test('invites a new student and lists minimal account data', async () => {
  const f = fixture();
  const r = await f.request('convidar', { nome: 'Ana', email: 'ANA@EXAMPLE.COM', redirectTo: 'https://evil.example' });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { aluno: { user_id: 'new-id', nome: 'Ana', email: 'ana@example.com', ativo: true } });
  assert.deepEqual((await (await f.request('listar-alunos')).json()).alunos, [{ user_id: 'new-id', nome: 'Ana', email: 'ana@example.com', ativo: true, invitationStatus: 'pending' }]);
});

test('duplicate enrollment, confirmed account and inactive enrollment never get an implicit invite or activation', async () => {
  const students = [{ user_id: oldId, nome: 'Ana', email: 'ana@example.com', ativo: false }];
  const f = fixture({ students, users: [{ id: oldId, email: 'ana@example.com', email_confirmed_at: null }] });
  assert.equal((await f.request('convidar', { nome: 'Ana', email: 'ana@example.com' })).status, 409);
  assert.equal((await f.request('reenviar-convite', { user_id: oldId })).status, 200);
  assert.equal(students[0].ativo, false);
  assert.equal(f.calls.filter(c => c === 'invite').length, 1);
  const confirmed = fixture({ users: [{ id: 'existing', email: 'used@example.com', email_confirmed_at: '2026-01-01' }] });
  const r = await confirmed.request('convidar', { nome: 'Used', email: 'used@example.com' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'conta_confirmada');
  assert.ok(!confirmed.calls.includes('invite'));
});

test('reinvite confirmed student requires recovery; activation is explicit', async () => {
  const students = [{ user_id: oldId, nome: 'Ana', email: 'ana@example.com', ativo: false }];
  const f = fixture({ students, users: [{ id: oldId, email: 'ana@example.com', email_confirmed_at: '2026-01-01' }] });
  assert.equal((await f.request('reenviar-convite', { user_id: oldId })).status, 409);
  assert.ok(!f.calls.includes('invite'));
  assert.equal((await f.request('definir-ativo', { user_id: oldId, ativo: true })).status, 200);
  assert.equal(students[0].ativo, true);
});

test('provider or enrollment failure is explicit and never deletes an Auth user', async () => {
  const p = fixture({ failInvite: true });
  assert.equal((await p.request('convidar', { nome: 'Ana', email: 'ana@example.com' })).status, 502);
  assert.ok(!p.calls.includes('insertStudent'));
  const d = fixture({ failDb: true });
  const r = await d.request('convidar', { nome: 'Ana', email: 'ana@example.com' });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'matricula_pendente');
  assert.ok(!d.calls.includes('deleteUser'));
});

test('professor explicitly completes a confirmed account after invite succeeds but enrollment fails', async () => {
  const users = [];
  const f = fixture({ users, failDb: true });
  assert.equal((await f.request('convidar', { nome: 'Ana', email: 'ana@example.com' })).status, 502);
  Object.assign(users.find(u => u.id === 'new-id'), { email_confirmed_at: '2026-10-23' });
  f.setDbFailure(false);
  assert.equal((await f.request('convidar', { nome: 'Ana', email: 'ana@example.com' })).status, 409);
  const r = await f.request('completar-matricula', { nome: 'Ana', email: 'ANA@EXAMPLE.COM' });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { aluno: { user_id: 'new-id', nome: 'Ana', email: 'ana@example.com', ativo: true } });
  assert.equal(f.calls.filter(call => call === 'invite').length, 1, 'recovery must not send another email');
  assert.equal((await f.request('completar-matricula', { nome: 'Ana', email: 'ana@example.com' })).status, 409);
});

test('completion cannot overwrite an inactive enrollment or run for non-professor', async () => {
  const users = [{ id: oldId, email: 'ana@example.com', email_confirmed_at: '2026-10-23' }];
  const students = [{ user_id: oldId, nome: 'Ana', email: 'ana@example.com', ativo: false }];
  const f = fixture({ users, students });
  assert.equal((await f.request('completar-matricula', { nome: 'Outra', email: 'ana@example.com' })).status, 409);
  assert.deepEqual(students, [{ user_id: oldId, nome: 'Ana', email: 'ana@example.com', ativo: false }]);
  assert.ok(!f.calls.includes('insertStudent'));
  const outsider = fixture({ professor: false, users });
  assert.equal((await outsider.request('completar-matricula', { nome: 'Ana', email: 'ana@example.com' })).status, 403);
  assert.deepEqual(outsider.calls, ['getUser', 'isProfessor']);
  const pending = fixture({ users: [{ id: oldId, email: 'ana@example.com', email_confirmed_at: null }] });
  assert.equal((await pending.request('completar-matricula', { nome: 'Ana', email: 'ana@example.com' })).status, 409);
  assert.ok(!pending.calls.includes('insertStudent'));
  const missing = fixture();
  assert.equal((await missing.request('completar-matricula', { nome: 'Ana', email: 'ana@example.com' })).status, 404);
});

test('listing derives only invitationStatus from Auth without changing inactive enrollment', async () => {
  const rows = [
    { user_id: oldId, nome: 'Pending', email: 'pending@example.com', ativo: false },
    { user_id: '22222222-2222-4222-8222-222222222222', nome: 'Confirmed', email: 'confirmed@example.com', ativo: true },
  ];
  const f = fixture({ students: rows, users: rows.map((s, i) => ({ id: s.user_id, email: s.email, email_confirmed_at: i ? '2026-10-24' : null, token: 'never-return' })) });
  const response = await f.request('listar-alunos');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).alunos, rows.map((row, i) => ({ ...row, invitationStatus: i ? 'confirmed' : 'pending' })));
  assert.equal(rows[0].ativo, false);
  assert.ok(!f.calls.includes('invite'));
});

test('CORS preflight permits the actual bundled SDK functions.invoke headers', async () => {
  const { createClient } = await import('../../scripts/portal/vendor/supabase.mjs');
  let sent;
  const client = createClient('https://example.supabase.co', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => { sent = new Headers(options.headers); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await client.functions.invoke('gerenciar-alunos', { body: { action: 'listar-alunos' } });
  assert.ok(sent.has('x-client-info'));
  const handler = createHandler({ auth: {}, db: {}, allowedOrigins: [origin] });
  const preflight = await handler(new Request('https://example.supabase.co/functions/v1/gerenciar-alunos', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': [...sent.keys()].join(', ') },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const allowed = preflight.headers.get('Access-Control-Allow-Headers').split(/,\s*/);
  for (const header of sent.keys()) assert.ok(allowed.includes(header), `Missing CORS header: ${header}`);
});

test('listing uses immutable user id when Auth email changes and preserves enrollment', async () => {
  const student = { user_id: oldId, nome: 'Ana', email: 'old@example.com', ativo: false };
  const f = fixture({ students: [student], users: [{ id: oldId, email: 'new@example.com', email_confirmed_at: '2026-10-24' }] });
  const response = await f.request('listar-alunos');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).alunos, [{ ...student, invitationStatus: 'confirmed' }]);
  assert.equal(student.email, 'old@example.com');
  assert.equal(student.ativo, false);
  assert.equal((await f.request('reenviar-convite', { user_id: oldId })).status, 409);
  assert.ok(!f.calls.includes('invite'));
});

test('exclusão completa exige professor e matrícula e protege contas de professores', async () => {
  const make = ({ teacher = true, targetTeacher = false, exists = true, failure = false } = {}) => {
    const deleted = [];
    const handler = createHandler({ allowedOrigins: [origin],
      auth: { getUser: async () => ({ data: { user: { id: 'prof' } } }), deleteUser: async id => { if (failure) throw Error('delete failed'); deleted.push(id); } },
      db: { isProfessor: async id => id === 'prof' ? teacher : targetTeacher, findStudentById: async id => exists ? { user_id: id } : null } });
    return { deleted, send: id => handler(new Request('https://example.test', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid' }, body: JSON.stringify({ action: 'excluir-aluno', user_id: id }) })) };
  };
  const ok = make(); assert.equal((await ok.send(oldId)).status, 200); assert.deepEqual(ok.deleted, [oldId]);
  for (const [opts, status] of [[{ teacher: false },403],[{ targetTeacher: true },409],[{ exists: false },404],[{ failure: true },502]]) {
    const f = make(opts); assert.equal((await f.send(oldId)).status, status); assert.deepEqual(f.deleted, []);
  }
  const invalid = make(); assert.equal((await invalid.send('bad')).status, 400); assert.deepEqual(invalid.deleted, []);
});

test('exclusão bloqueia a própria conta mesmo se também tiver matrícula', async () => {
  let checks = 0, deletions = 0;
  const handler = createHandler({allowedOrigins:[origin],
    auth:{getUser:async()=>({data:{user:{id:oldId}}}),deleteUser:async()=>{deletions++;}},
    db:{isProfessor:async()=>++checks===1,findStudentById:async()=>({user_id:oldId})}});
  const result = await handler(new Request('https://example.test', {method:'POST',headers:{Origin:origin,Authorization:'Bearer valid'},body:JSON.stringify({action:'excluir-aluno',user_id:oldId})}));
  assert.equal(result.status,409); assert.equal(deletions,0); assert.equal(checks,1);
});

test('convite e reenvio recebem o nome validado da matrícula para personalizar o email', async () => {
  const sent = [];
  let saved;
  const handler = createHandler({allowedOrigins:[origin],
    auth:{getUser:async()=>({data:{user:{id:'prof'}}}),findUserByEmail:async()=>null,
      getUserById:async()=>({id:oldId,email:'ana@example.com'}),
      inviteUserByEmail:async(email,nome)=>{sent.push({email,nome});return {data:{user:{id:oldId}}};}},
    db:{isProfessor:async()=>true,findStudentByEmail:async()=>null,
      insertStudent:async row=>{saved={...row,ativo:true};return saved;},findStudentById:async()=>saved}});
  const send=(action,fields)=>handler(new Request('https://example.test',{method:'POST',headers:{Origin:origin,Authorization:'Bearer valid'},body:JSON.stringify({action,...fields})}));
  assert.equal((await send('convidar',{nome:'  Ana Silva  ',email:'ANA@example.com'})).status,201);
  assert.deepEqual(sent[0],{email:'ana@example.com',nome:'Ana Silva'});
  assert.equal((await send('reenviar-convite',{user_id:oldId,nome:'Nome adulterado'})).status,200);
  assert.deepEqual(sent[1],{email:'ana@example.com',nome:'Ana Silva'});
});

for (const failure of [false,true]) test(`completar matrícula sincroniza nome antes de salvar; falha de metadado=${failure}`, async()=>{
  const events=[];
  const handler=createHandler({allowedOrigins:[origin],
    auth:{getUser:async()=>({data:{user:{id:'prof'}}}),findUserByEmail:async()=>({id:oldId,email_confirmed_at:'2026-10-30'}),
      setUserName:async(id,nome)=>{events.push(['nome',id,nome]);if(failure)throw Error('metadata unavailable');}},
    db:{isProfessor:async()=>true,findStudentByEmail:async()=>null,findStudentById:async()=>null,
      insertStudent:async row=>{events.push(['matricula']);return {...row,ativo:true};}}});
  const result=await handler(new Request('https://example.test',{method:'POST',headers:{Origin:origin,Authorization:'Bearer valid'},body:JSON.stringify({action:'completar-matricula',nome:'Ana Silva',email:'ana@example.com'})}));
  assert.equal(result.status,failure?502:201);
  assert.deepEqual(events,failure?[['nome',oldId,'Ana Silva']]:[['nome',oldId,'Ana Silva'],['matricula']]);
});
