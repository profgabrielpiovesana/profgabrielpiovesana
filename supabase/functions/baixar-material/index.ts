import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { createHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL');
const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origin = Deno.env.get('PORTAL_ALLOWED_ORIGIN');
if (!url || !publicKey || !secretKey || !origin) throw Error('Missing portal server configuration');
const site = new URL(origin);
if (site.protocol !== 'https:' || site.origin !== origin) throw Error('Invalid portal origin');

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const publicClient = createClient(url, publicKey, options);
const admin = createClient(url, secretKey, options);
const value = async promise => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};
Deno.serve(createHandler({
  allowedOrigins: [origin],
  auth: { getUser: token => publicClient.auth.getUser(token) },
  db: {
    async getMaterial(id, token) {
      const client = createClient(url, publicKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
      return value(client.from('materiais_privados').select('object_path').eq('id', id).maybeSingle());
    },
  },
  // Only a path read through RLS reaches Storage; no request headers/options are forwarded.
  storage: { download: path => value(admin.storage.from('materiais-alunos').download(path)) },
}));
