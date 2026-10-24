import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createAuthController, callbackEvidence } from '../../scripts/portal/auth.mjs';

const source = (await readFile(new URL('../../scripts/portal/account.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');

for (const [code, message] of [
  ['same_password', /diferente da (senha )?atual/i],
  ['weak_password', /senha mais forte/i],
  ['unknown_code', /Não foi possível salvar/],
]) {
  test(`password form explains ${code} safely and allows retry in the same session`, async () => {
    const status = { textContent: '', focus() {} };
    const button = { disabled: false };
    const password = { value: 'test-only-password', focus() {} };
    const confirmation = { value: password.value };
    let submit, authEvent, authorize, redirect, unsubscribed = false;
    let reject = true;
    const form = { hidden: true, querySelector: () => button, addEventListener: (_, callback) => { submit = callback; } };
    const client = { auth: {
      onAuthStateChange: callback => { authEvent = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      getUser: async () => ({ data: { user: { id: 'u' } }, error: null }),
      updateUser: async () => ({ error: reject ? { code, message: 'private server detail' } : null }),
      signOut: async () => ({ error: null }),
    } };
    await runInNewContext(`(async () => { ${source}\n })()`, {
      document: { querySelector: selector => ({ '#account-status': status, '#password-form': form, '#new-password': password, '#confirm-password': confirmation })[selector] },
      location: { href: 'https://example.com/conta.html#type=recovery&access_token=test-only-token&refresh_token=test-only-refresh', pathname: '/conta.html', replace: url => { redirect = url; } },
      history: { replaceState() {} }, URL, URLSearchParams,
      getClient: async () => client, createAuthController, callbackEvidence,
      setTimeout: (callback, delay) => { if (delay === 0) authorize = callback; },
    });
    authEvent('PASSWORD_RECOVERY', { user: { id: 'u' } });
    await authorize();
    await submit({ preventDefault() {} });
    assert.match(status.textContent, message);
    assert.doesNotMatch(status.textContent, /private server detail/);
    if (code !== 'unknown_code') assert.doesNotMatch(status.textContent, /novo link/);
    assert.equal(form.hidden, false);
    assert.equal(button.disabled, false);
    assert.equal(unsubscribed, false);
    reject = false;
    await submit({ preventDefault() {} });
    assert.equal(form.hidden, true);
    assert.equal(unsubscribed, true);
    assert.equal(redirect, 'https://example.com/entrar.html?senha=atualizada');
  });
}
