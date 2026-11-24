import { navigate } from '../nav.js';
import { api, session } from '../session.js';
import { h } from '../ui.js';

const DEMO_ACCOUNTS = [
  ['admin', 'Admin@123', 'Administrador'],
  ['vendedor', 'Vend@123', 'Vendedor'],
  ['aprovador', 'Aprov@123', 'Aprovador'],
  ['consulta', 'Cons@123', 'Consulta (somente leitura)'],
];

export async function loginView() {
  const username = h('input', { id: 'username', name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none' });
  const password = h('input', { id: 'password', name: 'password', type: 'password', autocomplete: 'current-password' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', disabled: true }, 'Entrar');
  const error = h('p', { class: 'error', role: 'alert', 'data-testid': 'login-error', hidden: true });

  const expired = sessionStorage.getItem('ql_notice') === 'expired';
  sessionStorage.removeItem('ql_notice');

  const sync = () => {
    submit.disabled = username.value.trim() === '' || password.value === '';
  };
  username.addEventListener('input', sync);
  password.addEventListener('input', sync);

  const form = h(
    'form',
    {
      'data-testid': 'login-form',
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        submit.disabled = true;
        error.hidden = true;
        try {
          const { token, user } = await api('/api/auth/login', { method: 'POST', body: { username: username.value.trim(), password: password.value } });
          session.set(token, user);
          const next = sessionStorage.getItem('ql_next');
          sessionStorage.removeItem('ql_next');
          const target = next && next.startsWith('#/') && !next.startsWith('#/login') ? next.slice(1) : '/quotes';
          const [path, qs] = target.split('?');
          navigate(path, Object.fromEntries(new URLSearchParams(qs ?? '')));
        } catch (e) {
          error.textContent = e.status === 401 ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar. Tente novamente.';
          error.hidden = false;
          sync();
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'username' }, 'Usuário'), username),
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Senha'), password),
    error,
    submit,
  );

  return h(
    'main',
    { class: 'login' },
    h(
      'div',
      { class: 'card' },
      h('h1', {}, 'QuoteLab'),
      h('p', { class: 'muted' }, 'Simulador de cotações de locação e venda de equipamentos.'),
      expired && h('p', { class: 'notice', role: 'status', 'data-testid': 'login-notice' }, 'Sessão expirada. Faça login novamente.'),
      form,
      h(
        'details',
        { class: 'demo', 'data-testid': 'demo-accounts', open: true },
        h('summary', {}, 'Contas de demonstração (dados fictícios)'),
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Usuário'), h('th', {}, 'Senha'), h('th', {}, 'Perfil'))),
          h('tbody', {}, DEMO_ACCOUNTS.map(([u, p, r]) => h('tr', {}, h('td', {}, u), h('td', {}, p), h('td', {}, r)))),
        ),
      ),
    ),
  );
}
