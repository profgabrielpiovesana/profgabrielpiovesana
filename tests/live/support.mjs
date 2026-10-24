// Keep the failed acceptance assertion visible even if fixture cleanup also fails.
export async function withFixtureCleanup(work, cleanup) {
  let failed = false;
  let original;
  let result;
  try { result = await work(); } catch (error) { failed = true; original = error; }
  try { await cleanup(); } catch (cleanupError) {
    if (failed) throw new AggregateError([original, cleanupError], 'Acceptance failed and fixture cleanup failed', { cause: original });
    throw cleanupError;
  }
  if (failed) throw original;
  return result;
}

// Storage wraps a missing-object DELETE as HTTP 400 in the deployed API.
// Do not treat other 400 responses (including authorization failures) as absence.
export function isMissingStorageObject(response) {
  if (response.status !== 400) return false;
  try {
    const body = response.json();
    return body.statusCode === '404' && body.error === 'not_found' &&
      body.message === 'Object not found' && body.code === 'NoSuchKey';
  } catch { return false; }
}
