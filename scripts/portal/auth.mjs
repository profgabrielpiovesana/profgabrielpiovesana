/** The URL must carry an Auth-issued token pair, not merely a type parameter. */
export function callbackEvidence(url) {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.slice(1));
  return Boolean(hash.get('access_token') && hash.get('refresh_token') &&
    ['invite', 'recovery'].includes(hash.get('type')));
}

export function createAuthController({ client, getAccess, callbackUrl } = {}) {
  let passwordAuthorized = false;
  return {
    async login(email, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) return { status: 'invalid' };
        return this.refresh();
      } catch { return { status: 'error' }; }
    },
    async refresh() {
      try {
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user) return { status: 'expired' };
        return await getAccess();
      } catch { return { status: 'error' }; }
    },
    async recover(email) {
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl });
        return { status: error ? 'error' : 'sent' };
      } catch { return { status: 'error' }; }
    },
    async authorizePasswordChange({ evidence, event, session, kind }) {
      passwordAuthorized = false;
      if (!evidence || !session?.user?.id) return false;
      if (kind === 'recovery' && event !== 'PASSWORD_RECOVERY') return false;
      if (kind === 'invite' && event !== 'SIGNED_IN') return false;
      try {
        const { data, error } = await client.auth.getUser();
        passwordAuthorized = !error && data?.user?.id === session.user.id;
      } catch { passwordAuthorized = false; }
      return passwordAuthorized;
    },
    async setPassword(password) {
      if (!passwordAuthorized) return { status: 'unauthorized' };
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) return { status: 'error' };
      } catch { return { status: 'error' }; }
      passwordAuthorized = false;
      try { await client.auth.signOut(); } catch { /* the password update already succeeded */ }
      return { status: 'updated' };
    },
    async logout() {
      passwordAuthorized = false;
      try { await client.auth.signOut(); return { status: 'signed-out' }; }
      catch { return { status: 'error' }; }
    },
  };
}
