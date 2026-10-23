import { createClient } from './vendor/supabase.mjs';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.mjs';

let client;
export function getClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('A área do aluno ainda não foi configurada.');
  }
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, detectSessionInUrl: true, flowType: 'implicit', autoRefreshToken: true },
  });
  return client;
}
