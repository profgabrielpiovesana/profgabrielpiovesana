import { getClient } from './client.mjs';

function unwrap(result) {
  if (result.error) throw new Error('Não foi possível consultar o serviço.');
  return result.data;
}

export function createPortalApi(client = getClient()) {
  return {
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
      const row = unwrap(await client.from('acessos_materiais')
        .select('material:materiais_privados(object_path)')
        .eq('material_id', id).maybeSingle());
      if (!row?.material?.object_path) throw new Error('Material indisponível.');
      const blob = unwrap(await client.storage.from('materiais-alunos')
        .download(row.material.object_path, {}, { cache: 'no-store' }));
      if (!(blob instanceof Blob)) throw new Error('Material indisponível.');
      return blob;
    },
  };
}

export const getAccess = () => createPortalApi().getAccess();
export const listMaterials = () => createPortalApi().listMaterials();
export const downloadMaterial = id => createPortalApi().downloadMaterial(id);
