import { createClient } from 'npm:@supabase/supabase-js@2.79.0';
import { createHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL');
const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origin = Deno.env.get('PORTAL_ALLOWED_ORIGIN');
const redirectTo = Deno.env.get('PORTAL_AUTH_REDIRECT_URL');
if (!url || !publicKey || !secretKey || !origin || !redirectTo) throw Error('Missing portal server configuration');
const site = new URL(origin);
const callback = new URL(redirectTo);
if (site.protocol !== 'https:' || site.pathname !== '/' || callback.origin !== site.origin ||
    !callback.pathname.startsWith('/profgabrielpiovesana/')) throw Error('Invalid portal origin or callback');

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const publicClient = createClient(url, publicKey, options);
const admin = createClient(url, secretKey, options);
const value = async promise => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};
const selectStudent = 'user_id,nome,email,ativo';
const auth = {
  getUser: token => publicClient.auth.getUser(token),
  async findUserByEmail(email) {
    // Auth Admin has no email lookup; pagination is required beyond the first page.
    for (let page = 1;; page++) {
      const data = await value(admin.auth.admin.listUsers({ page, perPage: 1000 }));
      const found = data.users.find(user => user.email?.toLowerCase() === email);
      if (found) return found;
      if (data.users.length < 1000) return null;
    }
  },
  async getUserById(id) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error?.status === 404) return null;
    if (error) throw error;
    return data.user;
  },
  inviteUserByEmail: email => admin.auth.admin.inviteUserByEmail(email, { redirectTo }),
};
const db = {
  async isProfessor(id, token) {
    const client = createClient(url, publicKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const rows = await value(client.from('professores').select('user_id').eq('user_id', id).limit(1));
    return rows.length === 1;
  },
  listStudents: () => value(admin.from('alunos').select(selectStudent).order('nome')),
  async findStudentByEmail(email) { return await value(admin.from('alunos').select(selectStudent).eq('email', email).maybeSingle()); },
  async findStudentById(id) { return await value(admin.from('alunos').select(selectStudent).eq('user_id', id).maybeSingle()); },
  insertStudent: row => value(admin.from('alunos').insert(row).select(selectStudent).single()),
  async setActive(id, ativo) { return await value(admin.from('alunos').update({ ativo }).eq('user_id', id).select(selectStudent).maybeSingle()); },
};

Deno.serve(createHandler({ auth, db, allowedOrigins: [origin] }));
