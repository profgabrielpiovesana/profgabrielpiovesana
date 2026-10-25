export const MAX_PDF_BYTES = 20_000_000;

const normalizeText = value => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
const success = data => ({ ok: true, data });
const failure = errors => ({ ok: false, errors });

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/** Return {ok:true,data} or {ok:false,errors:{field:message}}. */
export function validateStudent({ name, email } = {}) {
  const data = {
    name: normalizeText(name),
    email: normalizeText(email).toLowerCase(),
  };
  const errors = {};
  if (!data.name || data.name.length > 160) errors.name = 'Informe o nome do aluno.';
  if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(data.email)) errors.email = 'Informe um e-mail válido.';
  return Object.keys(errors).length ? failure(errors) : success(data);
}

export function validateMaterial({ title, type, date, description, studentIds } = {}) {
  const data = {
    title: normalizeText(title),
    type: normalizeText(type),
    date: normalizeText(date),
    description: normalizeText(description),
    studentIds: Array.isArray(studentIds) ? studentIds.map(normalizeText) : [],
  };
  const errors = {};
  if (!data.title) errors.title = 'Informe o título.';
  if (!['aula', 'lista'].includes(data.type)) errors.type = 'Escolha aula ou lista.';
  if (!validDate(data.date)) errors.date = 'Informe uma data válida no formato AAAA-MM-DD.';
  if (!Array.isArray(studentIds) || !data.studentIds.length ||
      data.studentIds.some(id => !id) || new Set(data.studentIds).size !== data.studentIds.length) {
    errors.studentIds = 'Escolha destinatários válidos, sem repetições.';
  }
  return Object.keys(errors).length ? failure(errors) : success(data);
}

export async function validatePdf(file) {
  const errors = {};
  if (!(file instanceof Blob) || !file.size || file.size > MAX_PDF_BYTES ||
      typeof file.name !== 'string' || !/\.pdf$/iu.test(file.name) ||
      file.type.toLowerCase() !== 'application/pdf') {
    errors.file = 'Selecione um PDF válido de até 20 MB.';
  } else {
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (header !== '%PDF-') errors.file = 'O arquivo não contém um PDF válido.';
  }
  return Object.keys(errors).length ? failure(errors) : success({ file });
}

const searchText = value => normalizeText(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function filterMaterials(items, { query = '', type = '' } = {}) {
  const search = searchText(query);
  return items
    .filter(item => (!type || item.type === type) &&
      (!search || searchText(`${item.title ?? ''} ${item.description ?? ''}`).includes(search)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
