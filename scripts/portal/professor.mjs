export function createProfessorController(api) {
  let generation = 0;
  const state = { students: [], materials: [], busy: false };
  return {
    get students() { return state.students; },
    get materials() { return state.materials; },
    get busy() { return state.busy; },
    clear() { generation++; state.students = []; state.materials = []; state.busy = false; },
    async refresh() {
      const turn = ++generation;
      state.busy = true;
      try {
        const [students, materials] = await Promise.all([api.listStudents(), api.listTeacherMaterials()]);
        if (turn !== generation) return { status: 'cancelled' };
        state.students = students; state.materials = materials;
        return { status: 'ok' };
      } catch (error) {
        if (turn !== generation) return { status: 'cancelled' };
        return { status: 'error', error };
      } finally { if (turn === generation) state.busy = false; }
    },
  };
}

export function mountProfessorPanel({ root, api, message }) {
  const $ = selector => root.querySelector(selector);
  const controller = createProfessorController(api);
  const studentForm = $('#student-form');
  const materialForm = $('#teacher-material-form');
  let generation = 0;
  let busy = false;
  const announce = text => message(text);
  const clearEdit = () => {
    materialForm.reset();
    $('#editing-material-id').value = '';
    $('#teacher-material-file').required = true;
    $('#teacher-material-file').disabled = false;
    $('#cancel-material-edit').hidden = true;
    for (const box of root.querySelectorAll('input[name="recipient"]')) box.checked = false;
    materialForm.querySelector('[type="submit"]').textContent = 'Publicar material';
  };
  const render = () => {
    const selected = new Set([...root.querySelectorAll('input[name="recipient"]:checked')].map(box => box.value));
    const removed = [...selected].some(id => !controller.students.some(student => student.user_id === id && student.ativo));
    const studentList = $('#teacher-students'); studentList.replaceChildren();
    $('#teacher-students-empty').hidden = controller.students.length > 0;
    for (const student of controller.students) {
      const li = document.createElement('li'); li.className = 'portal-item';
      const name = document.createElement('strong'); name.textContent = student.nome;
      const details = document.createElement('p'); details.textContent = `${student.email} · ${student.ativo ? 'Ativo' : 'Inativo'} · ${student.invitationStatus === 'pending' ? 'Convite pendente' : 'Conta confirmada'}`;
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = student.ativo ? 'Desativar' : 'Reativar';
      toggle.addEventListener('click', () => run(async () => { await api.setStudentActive(student.user_id, !student.ativo); return `Aluno ${student.ativo ? 'desativado' : 'reativado'}.`; }));
      const resend = document.createElement('button'); resend.type = 'button'; resend.textContent = 'Reenviar convite';
      resend.addEventListener('click', () => run(async () => { await api.resendInvite(student.user_id); return 'Convite reenviado.'; }));
      li.append(name, details, toggle);
      if (student.invitationStatus === 'pending') li.append(resend);
      studentList.append(li);
    }
    const recipients = $('#teacher-recipient-list'); recipients.replaceChildren();
    for (const student of controller.students.filter(item => item.ativo)) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'recipient'; checkbox.value = student.user_id;
      checkbox.checked = selected.has(student.user_id);
      label.append(checkbox, document.createTextNode(`${student.nome} (${student.email})`)); recipients.append(label);
    }
    const materials = $('#teacher-materials'); materials.replaceChildren();
    $('#teacher-materials-empty').hidden = controller.materials.length > 0;
    for (const material of controller.materials) {
      const li = document.createElement('li'); li.className = 'portal-item';
      const title = document.createElement('strong'); title.textContent = material.title;
      const info = document.createElement('p'); info.textContent = `${material.type === 'lista' ? 'Lista' : 'Material de aula'} · ${material.date} · ${material.published ? 'Publicado' : 'Retirado'} · ${material.studentIds.length} destinatário(s)`;
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar';
      edit.addEventListener('click', () => {
        if (material.studentIds.some(id => !controller.students.some(student => student.user_id === id && student.ativo))) {
          announce('Reative todos os destinatários atuais antes de editar este material.');
          return;
        }
        $('#editing-material-id').value = material.id;
        $('#teacher-material-title').value = material.title;
        $('#teacher-material-type').value = material.type;
        $('#teacher-material-date').value = material.date;
        $('#teacher-material-description').value = material.description;
        $('#teacher-material-file').required = false;
        $('#teacher-material-file').disabled = true;
        $('#cancel-material-edit').hidden = false;
        materialForm.querySelector('[type="submit"]').textContent = 'Salvar alterações';
        for (const box of recipients.querySelectorAll('input[name="recipient"]')) box.checked = material.studentIds.includes(box.value);
        $('#teacher-material-title').focus();
      });
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = material.published ? 'Retirar publicação' : 'Republicar';
      toggle.addEventListener('click', () => run(async () => { await api.setMaterialPublished(material.id, !material.published); return material.published ? 'Material retirado.' : 'Material republicado.'; }));
      li.append(title, info, edit, toggle); materials.append(li);
    }
    return removed;
  };
  const run = async (action, resetMaterial = false) => {
    if (busy) return;
    busy = true; const turn = generation;
    root.setAttribute('aria-busy', 'true');
    for (const button of root.querySelectorAll('button:not([data-logout])')) button.disabled = true;
    announce('Salvando...');
    try {
      const success = await action();
      if (turn !== generation) return;
      const refreshed = await controller.refresh();
      if (turn !== generation) return;
      if (refreshed.status !== 'ok') throw refreshed.error;
      if (resetMaterial) clearEdit();
      const removed = render();
      announce(removed ? `${success} Um destinatário desativado foi removido da seleção.` : success);
    } catch (error) { if (turn === generation) announce(error?.message || 'Não foi possível concluir. Tente novamente.'); }
    finally {
      if (turn === generation) {
        busy = false; root.removeAttribute('aria-busy');
        for (const button of root.querySelectorAll('button:not([data-logout])')) button.disabled = false;
      }
    }
  };
  studentForm.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => { await api.inviteStudent({ name: $('#teacher-student-name').value, email: $('#teacher-student-email').value }); studentForm.reset(); return 'Convite enviado e matrícula salva.'; });
  });
  $('[data-student-action="complete"]').addEventListener('click', () => run(async () => {
    await api.completeEnrollment({ name: $('#teacher-student-name').value, email: $('#teacher-student-email').value }); studentForm.reset(); return 'Matrícula completada.';
  }));
  materialForm.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      const metadata = { title: $('#teacher-material-title').value, type: $('#teacher-material-type').value,
        date: $('#teacher-material-date').value, description: $('#teacher-material-description').value };
      const studentIds = [...root.querySelectorAll('input[name="recipient"]:checked')].map(input => input.value);
      const id = $('#editing-material-id').value;
      if (id) { await api.updateMaterial(id, { metadata, studentIds }); return 'Alterações salvas.'; }
      await api.publishMaterial({ metadata, studentIds, file: $('#teacher-material-file').files[0] });
      return 'Material publicado.';
    }, true);
  });
  $('#cancel-material-edit').addEventListener('click', () => { clearEdit(); render(); });
  return {
    async open() {
      const turn = ++generation;
      announce('Carregando painel...');
      const result = await controller.refresh();
      if (turn !== generation) return;
      if (result.status === 'ok') { render(); announce(''); }
      else announce(result.error?.message || 'Não foi possível carregar o painel.');
    },
    clear() { generation++; controller.clear(); busy = false; root.removeAttribute('aria-busy'); for (const button of root.querySelectorAll('button:not([data-logout])')) button.disabled = false; clearEdit(); $('#teacher-students').replaceChildren(); $('#teacher-materials').replaceChildren(); $('#teacher-recipient-list').replaceChildren(); },
  };
}
