import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFixtureCleanup, isMissingStorageObject } from '../live/support.mjs';

test('fixture cleanup preserves the original failure when cleanup also fails', async () => {
  const original = new Error('permission denied table professores');
  const cleanup = new Error('cleanup failed');
  await assert.rejects(withFixtureCleanup(async () => { throw original; }, async () => { throw cleanup; }), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [original, cleanup]);
    assert.equal(error.cause, original);
    return true;
  });
});

test('fixture cleanup runs after success and reports its own failure', async () => {
  const cleanup = new Error('cleanup failed');
  await assert.rejects(withFixtureCleanup(async () => {}, async () => { throw cleanup; }), error => error === cleanup);
});

test('fixture cleanup keeps original failure unchanged when cleanup succeeds', async () => {
  const original = new Error('test failed');
  let cleaned = false;
  await assert.rejects(withFixtureCleanup(async () => { throw original; }, async () => { cleaned = true; }), error => error === original);
  assert.equal(cleaned, true);
});

test('Storage cleanup recognizes only the observed wrapped NoSuchKey absence', () => {
  const absent = { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' };
  const response = (body, status = 400) => ({ status, json: () => body });
  assert.equal(isMissingStorageObject(response(absent)), true);
  for (const body of [{}, { ...absent, code: 'AccessDenied' }, { ...absent, statusCode: '400' }, { ...absent, error: 'unauthorized' }]) {
    assert.equal(isMissingStorageObject(response(body)), false);
  }
  assert.equal(isMissingStorageObject(response(absent, 403)), false);
  assert.equal(isMissingStorageObject({ status: 400, json: () => { throw Error('invalid JSON'); } }), false);
});
