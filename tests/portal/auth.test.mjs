import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController, callbackEvidence } from '../../scripts/portal/auth.mjs';

function fixture() {
  let updated = 0, signedOut = 0;
  const client = { auth: {
    signInWithPassword: async () => ({ error: { message: 'bad' } }),
    resetPasswordForEmail: async () => ({ error: null }),
    getUser: async () => ({ data: { user: { id: 'u' } }, error: null }),
    updateUser: async () => { updated++; return { error: null }; },
    signOut: async () => { signedOut++; return { error: null }; },
  } };
  return { client, counts: () => ({ updated, signedOut }) };
}

test('invalid login is generic and cannot grant access', async () => {
  const { client } = fixture();
  const auth = createAuthController({ client, getAccess: async () => { throw Error('must not run'); } });
  assert.equal((await auth.login('x@y.z', 'wrong')).status, 'invalid');
});

test('login consults server and distinguishes no enrollment and inactive account', async () => {
  const { client } = fixture();
  client.auth.signInWithPassword = async () => ({ error: null });
  let state = 'sem-acesso';
  const auth = createAuthController({ client, getAccess: async () => ({ status: state }) });
  assert.equal((await auth.login('x@y.z', 'password')).status, 'sem-acesso');
  state = 'inativo';
  assert.equal((await auth.login('x@y.z', 'password')).status, 'inativo');
});

test('expired session is rejected on refresh', async () => {
  const { client } = fixture();
  client.auth.getUser = async () => ({ data: { user: null }, error: Error('expired') });
  const auth = createAuthController({ client, getAccess: async () => ({ status: 'aluno' }) });
  assert.equal((await auth.refresh()).status, 'expired');
});

test('recovery request uses fixed callback path; logout clears state', async () => {
  const { client, counts } = fixture();
  let redirectTo;
  client.auth.resetPasswordForEmail = async (_email, options) => { redirectTo = options.redirectTo; return { error: null }; };
  const auth = createAuthController({ client, getAccess: async () => ({ status: 'aluno' }), callbackUrl: 'https://example.com/sub/conta.html' });
  assert.equal((await auth.recover('x@y.z')).status, 'sent');
  assert.equal(redirectTo, 'https://example.com/sub/conta.html');
  await auth.logout();
  assert.equal(counts().signedOut, 1);
});

test('fabricated type query and ordinary session cannot authorize password change', async () => {
  const { client, counts } = fixture();
  const auth = createAuthController({ client, getAccess: async () => ({ status: 'aluno' }) });
  assert.equal(callbackEvidence('https://example.com/conta.html?type=recovery'), false);
  assert.equal(await auth.authorizePasswordChange({ evidence: false, event: 'PASSWORD_RECOVERY', session: { user: { id: 'u' } } }), false);
  assert.equal(await auth.authorizePasswordChange({ evidence: true, event: 'SIGNED_IN', session: { user: { id: 'u' } }, kind: 'recovery' }), false);
  assert.equal((await auth.setPassword('new-password')).status, 'unauthorized');
  assert.equal(counts().updated, 0);
});

test('verified fresh recovery event permits password update then signs out', async () => {
  const { client, counts } = fixture();
  const auth = createAuthController({ client, getAccess: async () => ({ status: 'aluno' }) });
  assert.equal(await auth.authorizePasswordChange({ evidence: true, event: 'PASSWORD_RECOVERY', session: { user: { id: 'u' } }, kind: 'recovery' }), true);
  assert.equal((await auth.setPassword('new-password')).status, 'updated');
  assert.deepEqual(counts(), { updated: 1, signedOut: 1 });
});
