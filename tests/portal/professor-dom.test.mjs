import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountProfessorPanel } from '../../scripts/portal/professor.mjs';
import { Element, documentFixture } from './dom-fixture.mjs';
globalThis.document = documentFixture;
function fixture() {
  const nodes = new Map(); const $ = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const root = new Element(); root.querySelector = $;
  root.querySelectorAll = selector => selector.includes('recipient') ? $('#teacher-recipient-list').querySelectorAll(selector) : [];
  const submit = new Element(); submit.type = 'submit'; $('#teacher-material-form').append(submit);
  $('#teacher-material-form').fields = ['title','description','file','date','type','subject'].map(key => $(`#teacher-material-${key}`));
  let students = [{ user_id: 'a', nome: 'Ana', email: 'a@b.c', ativo: true, invitationStatus: 'pending' }], failure = false, finish;
  const material = { id: 'm', title: 'Saved', subject: 'fisica', type: 'aula', date: '2026-10-24', description: '', published: true, studentIds: ['a'] };
  const api = { listStudents: async () => { if (failure) throw Error('refresh failed'); return students; }, listTeacherMaterials: async () => [material],
    inviteStudent: async () => {}, completeEnrollment: async () => {}, resendInvite: async () => {}, setMaterialPublished: async () => {},
    setStudentActive: async () => { students = students.map(s => ({ ...s, ativo: false })); }, publishMaterial: async () => {}, updateMaterial: async () => {} };
  const messages = [];
  const panel = mountProfessorPanel({ root, api, message: text => messages.push(text) });
  return { $, panel, api, messages, failRefresh: () => { failure = true; }, defer: () => { api.resendInvite = () => new Promise(resolve => { finish = resolve; }); return () => finish(); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
for (const action of ['invite', 'complete', 'resend', 'publication']) test(`${action} preserves unsaved material and file and selected recipients`, async () => {
  const { $, panel } = fixture(); await panel.open();
  $('#teacher-material-title').value = 'Draft'; const file = { name: 'draft.pdf' }; $('#teacher-material-file').files = [file];
  $('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked = true;
  if (action === 'invite') await $('#student-form').fire('submit');
  if (action === 'complete') await $('[data-student-action="complete"]').fire('click');
  if (action === 'resend') await $('#teacher-students').children[0].children[3].fire('click');
  if (action === 'publication') await $('#teacher-materials').children[0].children[3].fire('click');
  await settle(); assert.equal($('#teacher-material-title').value, 'Draft');
  assert.equal($('#teacher-material-file').files[0], file);
  assert.equal($('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked, true);
});
test('deactivation preserves editing draft, removes inactive selection and announces reconciliation', async () => {
  const { $, panel, messages } = fixture(); await panel.open();
  await $('#teacher-materials').children[0].children[2].fire('click'); $('#teacher-material-title').value = 'Edited draft';
  await $('#teacher-students').children[0].children[2].fire('click'); await settle();
  assert.equal($('#editing-material-id').value, 'm'); assert.equal($('#teacher-material-title').value, 'Edited draft');
  assert.equal($('#teacher-material-file').disabled, true);
  assert.equal($('#teacher-recipient-list').children.length, 0);
  assert.match(messages.at(-1), /destinatário.*desativado/i);
});
test('refresh error preserves draft and late independent action cannot restore cleared panel', async () => {
  const f = fixture(); await f.panel.open(); f.$('#teacher-material-title').value = 'Draft';
  f.failRefresh(); await f.$('#teacher-students').children[0].children[3].fire('click'); await settle();
  assert.equal(f.$('#teacher-material-title').value, 'Draft');
  const finish = f.defer(); const pending = f.$('#teacher-students').children[0].children[3].fire('click');
  f.panel.clear(); finish(); await pending; await settle();
  assert.equal(f.$('#teacher-material-title').value, ''); assert.equal(f.$('#teacher-students').children.length, 0);
});

test('independent action preserves edited recipient choices instead of restoring saved recipients', async () => {
  const { $, panel } = fixture(); await panel.open();
  await $('#teacher-materials').children[0].children[2].fire('click');
  $('#teacher-material-title').value = 'Draft edit';
  $('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked = false;
  await $('#teacher-students').children[0].children[3].fire('click'); await settle();
  assert.equal($('#editing-material-id').value, 'm');
  assert.equal($('#teacher-material-title').value, 'Draft edit');
  assert.equal($('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked, false);
});
for (const action of ['save', 'cancel']) test(`${action} resets material form and recipients explicitly`, async () => {
  const { $, panel } = fixture(); await panel.open();
  $('#teacher-material-title').value = 'Draft';
  $('#teacher-material-file').files = [pdf('draft.pdf')];
  await $('#teacher-material-file').fire('change');
  $('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked = true;
  await $(action === 'save' ? '#teacher-material-form' : '#cancel-material-edit').fire(action === 'save' ? 'submit' : 'click'); await settle();
  assert.equal($('#teacher-material-title').value, '');
  assert.equal($('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked, false);
});


test('edição carrega e envia disciplina escolhida pelo professor', async () => {
  const { $, panel, api } = fixture();
  let saved;
  api.updateMaterial = async (_id, payload) => { saved = payload; };
  await panel.open();
  await $('#teacher-materials').children[0].children[2].fire('click');
  assert.equal($('#teacher-material-subject').value, 'fisica');
  $('#teacher-material-subject').value = 'matematica';
  await $('#teacher-material-form').fire('submit'); await settle();
  assert.equal(saved.metadata.subject, 'matematica');
});

const pdf = name => Object.assign(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { name });
test('remove somente o PDF escolhido e publica os restantes preservando campos', async () => {
  const { $, panel, api } = fixture(); await panel.open();
  const sent = []; api.publishMaterial = async payload => sent.push(payload);
  $('#teacher-material-title').value = 'Rascunho'; $('#teacher-material-subject').value = 'fisica';
  $('#teacher-recipient-list').children[0].children[0].checked = true;
  const a = pdf('a.pdf'), b = pdf('b.pdf');
  $('#teacher-material-file').files = [a,b]; await $('#teacher-material-file').fire('change');
  assert.equal($('#teacher-selected-files').children.length, 2);
  await $('#teacher-selected-files').children[0].children[1].fire('click');
  assert.equal($('#teacher-selected-files').children.length, 1);
  assert.equal($('#teacher-material-title').value, 'Rascunho');
  await $('#teacher-material-form').fire('submit'); await settle();
  assert.deepEqual(sent.map(p => p.file), [b]); assert.deepEqual(sent[0].studentIds, ['a']);
});

test('cancelar exclusão preserva aluno; confirmar chama exclusão completa', async () => {
  const { $, panel, api } = fixture(); await panel.open(); const deleted = [];
  api.deleteStudent = async id => deleted.push(id);
  globalThis.confirm = () => false;
  const button = $('#teacher-students').children[0].children.find(n => n.textContent === 'Excluir aluno');
  assert.ok(button); await button.fire('click'); await settle(); assert.deepEqual(deleted, []);
  globalThis.confirm = () => true;
  await button.fire('click'); await settle(); assert.deepEqual(deleted, ['a']);
});

test('falha no segundo PDF remove só o primeiro já publicado e preserva restante', async () => {
  const { $, panel, api, messages } = fixture(); await panel.open();
  const sent = []; api.publishMaterial = async ({file}) => { sent.push(file.name); if (file.name === 'b.pdf') throw Error('Falhou'); };
  $('#teacher-material-title').value = 'Lote';
  $('#teacher-material-file').files = [pdf('a.pdf'),pdf('b.pdf'),pdf('c.pdf')]; await $('#teacher-material-file').fire('change');
  await $('#teacher-material-form').fire('submit'); await settle();
  assert.deepEqual(sent, ['a.pdf','b.pdf']);
  assert.equal($('#teacher-selected-files').children.length, 2);
  assert.equal($('#teacher-material-title').value, 'Lote'); assert.match(messages.at(-1), /1.*publicado.*Falhou/);
});


test('seleção adicional preserva anteriores e remover o último torna PDF obrigatório', async () => {
  const { $, panel } = fixture(); await panel.open();
  const a = pdf('a.pdf'), b = pdf('b.pdf');
  $('#teacher-material-file').files = [a]; await $('#teacher-material-file').fire('change');
  $('#teacher-material-file').files = [a,b]; await $('#teacher-material-file').fire('change');
  assert.equal($('#teacher-selected-files').children.length, 2);
  await $('#teacher-selected-files').children[1].children[1].fire('click');
  assert.equal($('#teacher-material-file').required, false);
  await $('#teacher-selected-files').children[0].children[1].fire('click');
  assert.equal($('#teacher-material-file').required, true);
  assert.equal($('#teacher-selected-files').children.length, 0);
});

test('PDF inválido impede todo lote e preserva seleção para correção', async () => {
  const { $, panel, api, messages } = fixture(); await panel.open(); let sent = 0;
  api.publishMaterial = async () => sent++;
  $('#teacher-material-file').files = [pdf('a.pdf'), Object.assign(new Blob(['invalid'], {type:'application/pdf'}), {name:'bad.pdf'})];
  await $('#teacher-material-file').fire('change'); await $('#teacher-material-form').fire('submit'); await settle();
  assert.equal(sent, 0); assert.equal($('#teacher-selected-files').children.length, 2);
  assert.match(messages.at(-1), /bad.pdf/);
});

test('logout durante envio impede próximos PDFs e limpa seleção', async () => {
  const { $, panel, api } = fixture(); await panel.open(); let finish; const sent = [];
  api.publishMaterial = ({file}) => { sent.push(file.name); return new Promise(resolve => {finish = resolve;}); };
  $('#teacher-material-file').files = [pdf('a.pdf'), pdf('b.pdf')]; await $('#teacher-material-file').fire('change');
  await $('#teacher-material-form').fire('submit'); await settle();
  assert.equal($('#teacher-material-file').disabled, true);
  panel.clear(); finish(); await settle();
  assert.deepEqual(sent, ['a.pdf']); assert.equal($('#teacher-selected-files').children.length, 0);
});

test('exclusão com falha mantém aluno e rascunho', async () => {
  const { $, panel, api, messages } = fixture(); await panel.open(); globalThis.confirm = () => true;
  api.deleteStudent = async () => {throw Error('Não foi possível excluir');};
  $('#teacher-material-title').value = 'Rascunho';
  await $('#teacher-students').children[0].children.find(n => n.textContent === 'Excluir aluno').fire('click'); await settle();
  assert.equal($('#teacher-students').children.length, 1); assert.equal($('#teacher-material-title').value, 'Rascunho');
  assert.match(messages.at(-1), /Não foi possível excluir/);
});

test('logout durante validação do PDF impede início do upload', async () => {
  const { $, panel, api } = fixture(); await panel.open(); let finish; let sent = 0;
  const file = pdf('a.pdf'); file.slice = () => ({arrayBuffer: () => new Promise(resolve => {finish = resolve;})});
  api.publishMaterial = async () => {sent++;};
  $('#teacher-material-file').files = [file]; await $('#teacher-material-file').fire('change');
  await $('#teacher-material-form').fire('submit');
  panel.clear(); finish(new TextEncoder().encode('%PDF-').buffer); await settle();
  assert.equal(sent, 0);
});
