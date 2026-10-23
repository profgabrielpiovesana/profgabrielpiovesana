import { getClient } from './client.mjs';
import { createAuthController, callbackEvidence } from './auth.mjs';

const status = document.querySelector('#account-status');
const form = document.querySelector('#password-form');
const tell = text => { status.textContent = text; status.focus(); };
const incoming = new URL(location.href);
const hash = new URLSearchParams(incoming.hash.slice(1));
const evidence = callbackEvidence(incoming.href);
const kind = hash.get('type');
let handled = false;

if (!evidence) {
  history.replaceState(null, '', location.pathname);
  tell('Este link está incompleto ou expirou. Peça outro convite ou um link de recuperação.');
} else {
  try {
    const client = await getClient();
    const auth = createAuthController({ client });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (handled || !['PASSWORD_RECOVERY', 'SIGNED_IN'].includes(event)) return;
      handled = true;
      history.replaceState(null, '', location.pathname);
      // Auth callbacks must finish before getUser; otherwise Supabase can deadlock.
      setTimeout(async () => {
        const allowed = await auth.authorizePasswordChange({ evidence, kind, event, session });
        if (!allowed) { tell('Não foi possível validar este link. Peça um novo link.'); return; }
        form.hidden = false;
        tell(kind === 'invite' ? 'Convite confirmado. Defina sua senha.' : 'Link confirmado. Defina sua nova senha.');
        document.querySelector('#new-password').focus();
      }, 0);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const password = document.querySelector('#new-password').value;
      const confirmation = document.querySelector('#confirm-password').value;
      if (password !== confirmation) { tell('As senhas não coincidem.'); return; }
      const button = form.querySelector('button'); button.disabled = true;
      const result = await auth.setPassword(password);
      if (result.status === 'updated') {
        form.hidden = true;
        subscription.unsubscribe();
        location.replace(new URL('entrar.html?senha=atualizada', location.href).href);
      } else { tell('Não foi possível salvar a senha. Peça um novo link ou tente novamente.'); button.disabled = false; }
    });
    setTimeout(() => {
      if (!handled) { history.replaceState(null, '', location.pathname); tell('Este link expirou ou não pôde ser validado. Peça outro link.'); }
    }, 12_000);
  } catch {
    history.replaceState(null, '', location.pathname);
    tell('A área do aluno ainda não foi configurada.');
  }
}
