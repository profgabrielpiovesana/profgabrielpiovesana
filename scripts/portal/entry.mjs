import { getClient } from './client.mjs';
import { createPortalApi } from './api.mjs';
import { createAuthController } from './auth.mjs';
import { createAlunoController } from './aluno.mjs';

const $ = selector => document.querySelector(selector);
const loginView = $('#login-view');
const studentView = $('#student-view');
const teacherView = $('#teacher-view');
const status = $('#portal-status');
const show = view => {
  loginView.hidden = view !== 'login';
  studentView.hidden = view !== 'student';
  teacherView.hidden = view !== 'teacher';
};
const message = text => { status.textContent = text; if (text) status.focus(); };

try {
  const client = await getClient();
  const api = createPortalApi(client);
  const auth = createAuthController({ client, getAccess: () => api.getAccess(),
    callbackUrl: new URL('conta.html', location.href).href });
  const library = createAlunoController({ api });
  let busy = false;
  const render = () => {
    const list = $('#material-list');
    list.replaceChildren();
    const filtered = library.filter($('#material-search').value, $('#material-type').value);
    $('#material-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'material' : 'materiais'}`;
    $('#material-empty').hidden = library.items.length > 0;
    $('#filter-empty').hidden = library.items.length === 0 || filtered.length > 0;
    for (const item of filtered) {
      const li = document.createElement('li'); li.className = 'portal-item';
      const type = document.createElement('p'); type.textContent = item.type === 'lista' ? 'Lista' : 'Material de aula';
      const title = document.createElement('h3'); title.textContent = item.title;
      const date = document.createElement('p'); date.textContent = item.date || '';
      const description = document.createElement('p'); description.textContent = item.description || '';
      const actions = document.createElement('div'); actions.className = 'actions';
      for (const [label, mode] of [['Abrir PDF', 'open'], ['Baixar PDF', 'download']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', async () => {
          if (busy) return;
          busy = true; button.disabled = true; message('Preparando o PDF...');
          const result = await library.download(item.id, mode);
          if (result.status === 'cancelled') { button.disabled = false; busy = false; return; }
          if (result.status === 'inativo' || result.status === 'sem-acesso') {
            show('login'); render(); message('Seu acesso à biblioteca não está ativo. Fale com o professor.');
          } else if (result.status === 'popup-blocked') message('O navegador bloqueou a nova aba. Permita pop-ups e tente novamente.');
          else if (result.status !== 'ok') message('Não foi possível obter este PDF. Tente novamente.');
          else message('PDF preparado.');
          button.disabled = false; busy = false;
        });
        actions.append(button);
      }
      li.append(type, title, date, description, actions); list.append(li);
    }
  };
  const showAccess = async access => {
    library.clear();
    if (access.status === 'professor') { show('teacher'); message(''); return; }
    if (access.status !== 'aluno') {
      show('login');
      message(access.status === 'inativo' ? 'Seu acesso está desativado. Fale com o professor.' :
        access.status === 'sem-acesso' ? 'Esta conta não tem matrícula ativa. Fale com o professor.' :
        access.status === 'expired' ? 'Sua sessão terminou. Entre novamente.' : 'Não foi possível consultar o acesso. Tente novamente.');
      return;
    }
    const result = await library.refresh();
    if (result.status === 'cancelled') return;
    if (result.status !== 'aluno') return showAccess(result);
    $('#student-name').textContent = access.name || '';
    show('student'); render(); message('');
  };
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; const button = $('#login-form button'); button.disabled = true; message('Verificando acesso...');
    const result = await auth.login($('#email').value.trim(), $('#password').value);
    $('#password').value = '';
    if (result.status === 'invalid') message('E-mail ou senha inválidos.');
    else await showAccess(result);
    button.disabled = false; busy = false;
  });
  $('#recover-toggle').addEventListener('click', () => {
    $('#recover-form').hidden = !$('#recover-form').hidden;
    if (!$('#recover-form').hidden) $('#recover-email').focus();
  });
  $('#recover-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; const button = $('#recover-form button'); button.disabled = true;
    const result = await auth.recover($('#recover-email').value.trim());
    message(result.status === 'sent' ? 'Se esta conta existir, enviaremos um link de recuperação.' : 'Não foi possível enviar o link agora. Tente novamente.');
    button.disabled = false; busy = false;
  });
  for (const button of document.querySelectorAll('[data-logout]')) button.addEventListener('click', async () => {
    library.clear(); await auth.logout(); show('login'); render(); message('Você saiu da conta.');
  });
  $('#material-search').addEventListener('input', render);
  $('#material-type').addEventListener('change', render);
  show('login');
  if (new URL(location.href).searchParams.get('senha') === 'atualizada') {
    history.replaceState(null, '', location.pathname);
    message('Senha salva. Entre com seu e-mail e a nova senha.');
  }
} catch {
  show('login'); message('A área do aluno ainda não foi configurada. Volte mais tarde.');
  $('#login-form button').disabled = true;
  $('#recover-toggle').disabled = true;
}
