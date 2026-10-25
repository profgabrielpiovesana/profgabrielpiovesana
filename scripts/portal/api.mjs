import { getClient } from './client.mjs';
import { validateStudent, validateMaterial, validatePdf } from './rules.mjs';

function unwrap(result) {
  if (result.error) throw new Error('Não foi possível consultar o serviço.');
  return result.data;
}

const teacherOnly = async api => {
  if ((await api.getAccess()).status !== 'professor') throw new Error('Acesso indisponível.');
};
const materialMetadata = (data, extra = {}) => ({
  titulo: data.title, tipo: data.type, descricao: data.description,
  data_referencia: data.date, ...extra,
});
const mappedMaterial = row => ({
  id: row.id, title: row.titulo, type: row.tipo, description: row.descricao,
  date: row.data_referencia, published: row.publicado, objectPath: row.object_path,
  originalName: row.nome_original,
  studentIds: (row.acessos_materiais || []).map(a => a.aluno_id),
});

export function createPortalApi(client) {
  if (!client) throw new Error('Cliente de autenticação ausente.');
  return {
    async admin(action, fields = {}) {
      await teacherOnly(this);
      const { data, error } = await client.functions.invoke('gerenciar-alunos', { body: { action, ...fields } });
      if (error) {
        let detail = error.message || 'Serviço indisponível.';
        try { const body = await error.context?.json(); detail = body?.message || body?.error || detail; } catch { /* response may not contain JSON */ }
        throw new Error(detail);
      }
      return data;
    },
    async listStudents() { return (await this.admin('listar-alunos')).alunos; },
    async inviteStudent(input) {
      const checked = validateStudent(input);
      if (!checked.ok) throw new Error(Object.values(checked.errors).join(' '));
      return (await this.admin('convidar', { nome: checked.data.name, email: checked.data.email })).aluno;
    },
    async completeEnrollment(input) {
      const checked = validateStudent(input);
      if (!checked.ok) throw new Error(Object.values(checked.errors).join(' '));
      return (await this.admin('completar-matricula', { nome: checked.data.name, email: checked.data.email })).aluno;
    },
    async resendInvite(id) { return (await this.admin('reenviar-convite', { user_id: id })).aluno; },
    async setStudentActive(id, active) { return (await this.admin('definir-ativo', { user_id: id, ativo: active })).aluno; },
    async listTeacherMaterials() {
      await teacherOnly(this);
      const rows = unwrap(await client.from('materiais_privados')
        .select('id,titulo,tipo,descricao,data_referencia,publicado,object_path,nome_original,acessos_materiais(aluno_id)'));
      return rows.map(mappedMaterial).sort((a, b) => b.date.localeCompare(a.date));
    },
    async getTeacherMaterial(id) {
      await teacherOnly(this);
      const row = unwrap(await client.from('materiais_privados')
        .select('id,titulo,tipo,descricao,data_referencia,publicado,object_path,nome_original,acessos_materiais(aluno_id)')
        .eq('id', id).maybeSingle());
      if (!row) throw new Error('Material indisponível.');
      return mappedMaterial(row);
    },
    async publishMaterial({ metadata, file, studentIds }) {
      await teacherOnly(this);
      const checked = validateMaterial({ ...metadata, studentIds });
      if (!checked.ok) throw new Error(Object.values(checked.errors).join(' '));
      const validFile = await validatePdf(file);
      if (!validFile.ok) throw new Error(Object.values(validFile.errors).join(' '));
      const path = `${crypto.randomUUID()}.pdf`;
      const bucket = client.storage.from('materiais-alunos');
      let rpcOutcome = 'not-started';
      try {
        const upload = await bucket.upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (upload.error) throw upload.error;
        rpcOutcome = 'unknown';
        const { data, error } = await client.rpc('save_material', {
          p_id: null,
          p_metadata: materialMetadata(checked.data, { object_path: path, nome_original: file.name, publicado: true }),
          p_student_ids: checked.data.studentIds,
        });
        if (error) {
          // A SQLSTATE from the database confirms the transaction was rejected.
          if (typeof error.code === 'string' && /^(22|23|42|P0)[0-9A-Z]{3}$/.test(error.code)) rpcOutcome = 'sql-rejected';
          throw error;
        }
        return data;
      } catch (cause) {
        const safeToRemove = rpcOutcome !== 'unknown';
        let readback = 'indisponível';
        if (!safeToRemove) {
          // Readback is diagnostic only: an empty snapshot cannot rule out a later commit.
          try {
            const row = unwrap(await client.from('materiais_privados').select('id').eq('object_path', path).maybeSingle());
            readback = row ? 'registro localizado' : 'registro ainda não localizado';
          } catch { /* preserve object on unknown outcome */ }
        }
        if (safeToRemove) {
          try {
            const { error } = await bucket.remove([path]);
            if (error) throw error;
          } catch (cleanupError) { throw new Error(`Falha ao salvar o material: ${cause.message}. A limpeza do arquivo também falhou: ${cleanupError.message}`, { cause }); }
        }
        throw new Error(`Falha ao salvar o material: ${cause.message}${safeToRemove ? '' : `. O estado do arquivo requer conferência pelo professor (${readback})`}`, { cause });
      }
    },
    async updateMaterial(id, { metadata, studentIds }) {
      const current = await this.getTeacherMaterial(id);
      const students = await this.listStudents();
      if (current.studentIds.some(studentId => !students.some(student => student.user_id === studentId && student.ativo))) {
        throw new Error('Reative todos os destinatários atuais antes de editar este material.');
      }
      const checked = validateMaterial({ ...metadata, studentIds });
      if (!checked.ok) throw new Error(Object.values(checked.errors).join(' '));
      const { data, error } = await client.rpc('save_material', {
        p_id: id, p_metadata: materialMetadata(checked.data),
        p_student_ids: checked.data.studentIds,
      });
      if (error) throw new Error('Não foi possível salvar as alterações.', { cause: error });
      return data;
    },
    async setMaterialPublished(id, published) {
      if (typeof published !== 'boolean') throw new Error('Estado inválido.');
      await teacherOnly(this);
      const row = unwrap(await client.from('materiais_privados')
        .update({ publicado: published }).eq('id', id).select('id').maybeSingle());
      if (!row) throw new Error('Material indisponível.');
      return row.id;
    },
    async getAccess() {
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) return { status: 'sem-acesso' };
      const professor = unwrap(await client.from('professores').select('user_id').eq('user_id', data.user.id).maybeSingle());
      if (professor) return { status: 'professor' };
      const aluno = unwrap(await client.from('alunos').select('nome,ativo').eq('user_id', data.user.id).maybeSingle());
      if (!aluno) return { status: 'sem-acesso' };
      return { status: aluno.ativo ? 'aluno' : 'inativo', name: aluno.nome };
    },
    async listMaterials() {
      const access = await this.getAccess();
      if (access.status !== 'aluno') throw new Error('Acesso indisponível.');
      const rows = unwrap(await client.from('acessos_materiais')
        .select('material:materiais_privados(id,titulo,tipo,descricao,data_referencia,created_at)'));
      return rows.filter(row => row.material).map(({ material: m }) => ({
        id: m.id, title: m.titulo, type: m.tipo, description: m.descricao,
        date: m.data_referencia, createdAt: m.created_at,
      })).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    },
    async downloadMaterial(id) {
      const access = await this.getAccess();
      if (access.status !== 'aluno') throw new Error('Acesso indisponível.');
      const { data, error } = await client.functions.invoke('baixar-material', { body: { id } });
      if (error || !(data instanceof Blob)) throw new Error('Material indisponível.');
      return new Blob([data], { type: 'application/pdf' });
    },
  };
}

export const getAccess = async () => createPortalApi(await getClient()).getAccess();
export const listMaterials = async () => createPortalApi(await getClient()).listMaterials();
export const downloadMaterial = async id => createPortalApi(await getClient()).downloadMaterial(id);
