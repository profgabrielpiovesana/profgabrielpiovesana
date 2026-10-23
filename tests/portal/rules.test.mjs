import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PDF_BYTES,
  validateStudent,
  validateMaterial,
  validatePdf,
  filterMaterials,
} from '../../scripts/portal/rules.mjs';

const validMaterial = {
  title: 'Aula de óptica', type: 'aula', date: '2026-10-23',
  description: '  Introdução  ', studentIds: ['aluno-1', 'aluno-2'],
};

function pdf(size, { name = 'aula.pdf', type = 'application/pdf', header = '%PDF-' } = {}) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(header).subarray(0, Math.min(size, 5)));
  return Object.assign(new Blob([bytes], { type }), { name });
}

test('normaliza nome e e-mail do aluno', () => {
  assert.deepEqual(validateStudent({ name: '  Ana  Maria  ', email: '  ANA@EXEMPLO.COM  ' }), {
    ok: true, data: { name: 'Ana Maria', email: 'ana@exemplo.com' },
  });
});

test('identifica e-mail inválido e nome vazio por campo', () => {
  const result = validateStudent({ name: '   ', email: 'ana@@exemplo.com' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
});

test('normaliza material e seus destinatários', () => {
  assert.deepEqual(validateMaterial({ ...validMaterial, title: '  Lista  1  ', studentIds: [' aluno-1 ', 'aluno-2'] }), {
    ok: true,
    data: { ...validMaterial, title: 'Lista 1', description: 'Introdução', studentIds: ['aluno-1', 'aluno-2'] },
  });
});

test('rejeita título vazio, tipo desconhecido e data impossível', () => {
  const result = validateMaterial({ ...validMaterial, title: ' ', type: 'vídeo', date: '2026-02-30' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.title);
  assert.ok(result.errors.type);
  assert.ok(result.errors.date);
});

test('rejeita destinatário vazio, repetido e lista vazia', () => {
  for (const studentIds of [['aluno-1', ' '], ['aluno-1', ' aluno-1 '], []]) {
    const result = validateMaterial({ ...validMaterial, studentIds });
    assert.equal(result.ok, false);
    assert.ok(result.errors.studentIds);
  }
});

test('aceita PDF exatamente no limite e sem derivar caminho de armazenamento', async () => {
  assert.equal(MAX_PDF_BYTES, 20_000_000);
  const file = pdf(MAX_PDF_BYTES, { name: '../nome original.pdf' });
  const result = await validatePdf(file);
  assert.deepEqual(result, { ok: true, data: { file } });
  assert.equal('objectPath' in result.data, false);
});

test('rejeita PDF um byte acima do limite', async () => {
  const result = await validatePdf(pdf(MAX_PDF_BYTES + 1));
  assert.equal(result.ok, false);
  assert.ok(result.errors.file);
});

test('rejeita arquivo vazio, extensão falsa, MIME incompatível e assinatura falsa', async () => {
  const files = [
    pdf(0),
    pdf(5, { name: 'aula.pdf.exe' }),
    pdf(5, { type: 'text/plain' }),
    pdf(5, { header: 'HELLO' }),
  ];
  for (const file of files) {
    const result = await validatePdf(file);
    assert.equal(result.ok, false);
    assert.ok(result.errors.file);
  }
});

test('busca sem acentos e ordena por data e criação decrescentes', () => {
  const items = [
    { id: 'old', title: 'Revisão', type: 'aula', date: '2026-10-21', createdAt: '2026-10-21T12:00:00Z' },
    { id: 'newer', title: 'Óptica', type: 'aula', date: '2026-10-23', createdAt: '2026-10-23T15:00:00Z' },
    { id: 'new', title: 'Optica', type: 'lista', date: '2026-10-23', createdAt: '2026-10-23T12:00:00Z' },
  ];
  assert.deepEqual(filterMaterials(items, { query: 'optica' }).map(item => item.id), ['newer', 'new']);
  assert.deepEqual(filterMaterials(items, { query: 'optica', type: 'lista' }).map(item => item.id), ['new']);
  assert.deepEqual(filterMaterials(items, {}).map(item => item.id), ['newer', 'new', 'old']);
  assert.deepEqual(items.map(item => item.id), ['old', 'newer', 'new']);
});
