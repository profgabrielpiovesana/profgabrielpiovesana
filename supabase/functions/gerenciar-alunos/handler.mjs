const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});
const publicStudent = ({ user_id, nome, email, ativo }) => ({ user_id, nome, email, ativo });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const emailAddress = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

export function createHandler({ auth, db, allowedOrigins }) {
  const allowed = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('Origin');
    if (origin && !allowed.has(origin)) return json(403, { error: 'origem_negada' });
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' },
    });
    if (request.method !== 'POST') return json(405, { error: 'metodo_invalido' }, cors);
    const bearer = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '');
    if (!bearer) return json(401, { error: 'sessao_necessaria' }, cors);
    try {
      const { data, error } = await auth.getUser(bearer[1]);
      if (error || !data?.user?.id) return json(401, { error: 'sessao_invalida' }, cors);
      if (!await db.isProfessor(data.user.id, bearer[1])) return json(403, { error: 'acesso_negado' }, cors);
      let input;
      try { input = await request.json(); } catch { return json(400, { error: 'json_invalido' }, cors); }
      if (!input || typeof input !== 'object') return json(400, { error: 'entrada_invalida' }, cors);
      const action = input.action;
      if (action === 'listar-alunos') {
        const alunos = [];
        for (const student of await db.listStudents()) {
          const user = await auth.getUserById(student.user_id);
          if (!user) {
            return json(502, { error: 'conta_inconsistente' }, cors);
          }
          alunos.push({ ...publicStudent(student), invitationStatus: user.email_confirmed_at || user.confirmed_at ? 'confirmed' : 'pending' });
        }
        return json(200, { alunos }, cors);
      }
      if (action === 'convidar') {
        const nome = typeof input.nome === 'string' ? input.nome.trim() : '';
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!nome || nome.length > 160 || !emailAddress(email)) return json(400, { error: 'entrada_invalida' }, cors);
        if (await db.findStudentByEmail(email)) return json(409, { error: 'aluno_existente' }, cors);
        const existing = await auth.findUserByEmail(email);
        if (existing?.email_confirmed_at || existing?.confirmed_at) return json(409, { error: 'conta_confirmada' }, cors);
        const invited = await auth.inviteUserByEmail(email);
        if (invited.error || !invited.data?.user?.id) return json(502, { error: 'convite_nao_enviado' }, cors);
        try {
          const aluno = await db.insertStudent({ user_id: invited.data.user.id, nome, email });
          return json(201, { aluno: publicStudent(aluno) }, cors);
        } catch {
          return json(502, { error: 'matricula_pendente', message: 'Convite enviado, mas matrícula não salva. O acesso permanece bloqueado; complete a matrícula depois que a conta for confirmada.' }, cors);
        }
      }
      if (action === 'completar-matricula') {
        const nome = typeof input.nome === 'string' ? input.nome.trim() : '';
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!nome || nome.length > 160 || !emailAddress(email)) return json(400, { error: 'entrada_invalida' }, cors);
        if (await db.findStudentByEmail(email)) return json(409, { error: 'aluno_existente' }, cors);
        const user = await auth.findUserByEmail(email);
        if (!user) return json(404, { error: 'conta_nao_encontrada' }, cors);
        if (!user.email_confirmed_at && !user.confirmed_at) return json(409, { error: 'conta_nao_confirmada' }, cors);
        if (await db.findStudentById(user.id)) return json(409, { error: 'aluno_existente' }, cors);
        try {
          const aluno = await db.insertStudent({ user_id: user.id, nome, email });
          return json(201, { aluno: publicStudent(aluno) }, cors);
        } catch {
          return json(502, { error: 'matricula_nao_salva' }, cors);
        }
      }
      if (action === 'reenviar-convite') {
        if (!uuid(input.user_id)) return json(400, { error: 'entrada_invalida' }, cors);
        const aluno = await db.findStudentById(input.user_id);
        if (!aluno) return json(404, { error: 'aluno_nao_encontrado' }, cors);
        const user = await auth.getUserById(aluno.user_id);
        if (!user || user.email?.toLowerCase() !== aluno.email.toLowerCase()) return json(409, { error: 'conta_inconsistente' }, cors);
        if (user.email_confirmed_at || user.confirmed_at) return json(409, { error: 'conta_confirmada', message: 'Use a recuperação de senha.' }, cors);
        const invited = await auth.inviteUserByEmail(aluno.email);
        if (invited.error || invited.data?.user?.id !== aluno.user_id) return json(502, { error: 'convite_nao_enviado' }, cors);
        return json(200, { aluno: publicStudent(aluno) }, cors);
      }
      if (action === 'excluir-aluno') {
        if (!uuid(input.user_id)) return json(400, { error: 'entrada_invalida' }, cors);
        if (input.user_id === data.user.id || await db.isProfessor(input.user_id, bearer[1])) {
          return json(409, { error: 'conta_protegida', message: 'Contas de professor não podem ser excluídas pelo painel de alunos.' }, cors);
        }
        const aluno = await db.findStudentById(input.user_id);
        if (!aluno) return json(404, { error: 'aluno_nao_encontrado' }, cors);
        // Auth deletion cascades to enrollment and assignments, never to the PDFs.
        await auth.deleteUser(aluno.user_id);
        return json(200, { deleted: true }, cors);
      }
      if (action === 'definir-ativo') {
        if (!uuid(input.user_id) || typeof input.ativo !== 'boolean') return json(400, { error: 'entrada_invalida' }, cors);
        const aluno = await db.setActive(input.user_id, input.ativo);
        return aluno ? json(200, { aluno: publicStudent(aluno) }, cors) : json(404, { error: 'aluno_nao_encontrado' }, cors);
      }
      return json(400, { error: 'acao_invalida' }, cors);
    } catch {
      return json(502, { error: 'servico_indisponivel' }, cors);
    }
  };
}
