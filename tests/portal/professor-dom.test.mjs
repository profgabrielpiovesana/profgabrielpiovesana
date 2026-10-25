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
  $('#teacher-material-form').fields = ['title','description','file','date','type'].map(key => $(`#teacher-material-${key}`));
  let students = [{ user_id: 'a', nome: 'Ana', email: 'a@b.c', ativo: true, invitationStatus: 'pending' }], failure = false, finish;
  const material = { id: 'm', title: 'Saved', type: 'aula', date: '2026-10-24', description: '', published: true, studentIds: ['a'] };
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
  $('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked = true;
  await $(action === 'save' ? '#teacher-material-form' : '#cancel-material-edit').fire(action === 'save' ? 'submit' : 'click'); await settle();
  assert.equal($('#teacher-material-title').value, '');
  assert.equal($('#teacher-recipient-list').querySelectorAll('input[name="recipient"]')[0].checked, false);
});
