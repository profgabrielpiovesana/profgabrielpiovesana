import { createClient } from './vendor/supabase.mjs';

const configUrl = new URL('../../dados/portal-config.json', import.meta.url);

export async function loadPortalConfig(fetchFn = fetch) {
  try {
    const response = await fetchFn(configUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('missing');
    return await response.json();
  } catch { throw new Error('A área do aluno ainda não foi configurada.'); }
}

export function createClientGetter({ loadConfig = loadPortalConfig, createClientFn = createClient } = {}) {
  let client;
  let pending;
  return async () => {
    if (client) return client;
    if (!pending) pending = (async () => {
      const config = await loadConfig();
      if (typeof config?.supabaseUrl !== 'string' || !config.supabaseUrl ||
          typeof config?.supabasePublishableKey !== 'string' || !config.supabasePublishableKey) {
        throw new Error('A área do aluno ainda não foi configurada.');
      }
      client = createClientFn(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, detectSessionInUrl: true, flowType: 'implicit', autoRefreshToken: true },
      });
      return client;
    })().catch(error => { pending = undefined; throw error; });
    return pending;
  };
}

export const getClient = createClientGetter();
