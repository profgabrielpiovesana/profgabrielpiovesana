import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../supabase/functions/gerenciar-alunos/handler.mjs';

const origin = 'https://gabrielpiovesana.github.io';
const oldId = '11111111-1111-4111-8111-111111111111';
function fixture({ professor = true, user = { id: 'prof', user_metadata: { role: 'professor' } }, students = [], users = [], failDb = false, failInvite = false } = {}) {
  const calls = [];
  const auth = {
    async getUser(token) { calls.push('getUser'); return token === 'valid' ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid' } }; },
    async findUserByEmail(email) { calls.push('findUserByEmail'); return users.find(u => u.email === email) ?? null; },
    async getUserById(id) { calls.push('getUserById'); return users.find(u => u.id === id) ?? null; },
    async inviteUserByEmail(email) { calls.push('invite'); return failInvite ? { data: null, error: { message: 'provider failed' } } : { data: { user: { id: users.find(u => u.email === email)?.id ?? 'new-id', email } }, error: null }; },
  };
  const db = {
    async isProfessor(id, token) { calls.push('isProfessor'); assert.equal(token, 'valid'); return professor && id === 'prof'; },
    async listStudents() { calls.push('listStudents'); return students; },
    async findStudentByEmail(email) { calls.push('findStudentByEmail'); return students.find(s => s.email === email) ?? null; },
    async findStudentById(id) { calls.push('findStudentById'); return students.find(s => s.user_id === id) ?? null; },
    async insertStudent(row) { calls.push('insertStudent'); if (failDb) throw Error('DB failed'); students.push({ ...row, ativo: true }); return students.at(-1); },
    async setActive(id, active) { calls.push('setActive'); const s = students.find(s => s.user_id === id); if (!s) return null; s.ativo = active; return s; },
  };
  const handler = createHandler({ auth, db, allowedOrigins: [origin] });
  const request = (action, body = {}, headers = {}) => handler(new Request('https://example.supabase.co/functions/v1/gerenciar-alunos', {
    method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action, ...body }),
  }));
  return { calls, students, request };
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
  assert.deepEqual((await (await f.request('listar-alunos')).json()).alunos, [{ user_id: 'new-id', nome: 'Ana', email: 'ana@example.com', ativo: true }]);
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
