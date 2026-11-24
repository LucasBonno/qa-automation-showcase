import { navigate } from './nav.js';
import { canWrite, resetCatalogCache, session } from './session.js';
import { h } from './ui.js';
import { detailView } from './views/detail.js';
import { formView } from './views/form.js';
import { listView } from './views/list.js';
import { loginView } from './views/login.js';
import { forbiddenView, notFoundView } from './views/misc.js';
import { reportsView } from './views/reports.js';

const ROLE_LABEL = { admin: 'Administrador', seller: 'Vendedor', approver: 'Aprovador', viewer: 'Consulta' };

const routes = [
  { re: /^\/login$/, view: loginView, title: 'Entrar', public: true },
  { re: /^\/quotes$/, view: listView, title: 'Cotações', nav: '/quotes' },
  { re: /^\/quotes\/new$/, view: formView, title: 'Nova cotação', nav: '/quotes/new', write: true },
  { re: /^\/quotes\/(\d+)\/edit$/, view: formView, title: 'Editar cotação', nav: '/quotes', write: true },
  { re: /^\/quotes\/(\d+)$/, view: detailView, title: 'Cotação', nav: '/quotes' },
  { re: /^\/reports$/, view: reportsView, title: 'Relatórios', nav: '/reports' },
];

const root = document.getElementById('app');
let renderSeq = 0;

function shell(content, user, activeNav) {
  const link = (href, label) => h('a', { href: `#${href}`, 'aria-current': href === activeNav ? 'page' : false }, label);
  return h(
    'div',
    { class: 'shell' },
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'brand', href: '#/quotes' }, 'QuoteLab'),
      h('nav', { 'aria-label': 'Principal' }, link('/quotes', 'Cotações'), canWrite(user) && link('/quotes/new', 'Nova cotação'), link('/reports', 'Relatórios')),
      h(
        'div',
        { class: 'user' },
        h('span', { 'data-testid': 'user-name' }, user.name),
        h('span', { class: 'role', 'data-testid': 'user-role' }, ROLE_LABEL[user.role] ?? user.role),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => {
              session.clear();
              resetCatalogCache();
              sessionStorage.removeItem('ql_next');
              navigate('/login');
            },
          },
          'Sair',
        ),
      ),
    ),
    h('main', { id: 'content' }, content),
  );
}

function show(el, title, routeKey) {
  document.title = `${title} · QuoteLab`;
  root.replaceChildren(el);
  // Lets automated tests tell a fresh render from the previous screen (same document, only the hash changes).
  root.dataset.route = routeKey;
  root.dataset.state = 'ready';
}

async function render() {
  const seq = ++renderSeq;
  root.dataset.state = 'loading';
  const [rawPath, qs = ''] = (location.hash.slice(1) || '/quotes').split('?');
  const path = rawPath || '/quotes';
  const query = new URLSearchParams(qs);
  const routeKey = `#${path}${qs ? `?${qs}` : ''}`;
  const hit = routes.map((route) => ({ route, match: route.re.exec(path) })).find((x) => x.match);

  // route guard
  if (!session.token) {
    if (!hit?.route.public) {
      sessionStorage.setItem('ql_next', location.hash || '#/quotes');
      navigate('/login');
      return;
    }
  } else if (path === '/login') {
    navigate('/quotes');
    return;
  }

  if (hit?.route.public) {
    const el = await hit.route.view({ query });
    if (seq === renderSeq) show(el, hit.route.title, routeKey);
    return;
  }

  const user = session.user;
  if (!hit) return show(shell(notFoundView(), user, null), 'Página não encontrada', routeKey);
  if (hit.route.write && !canWrite(user)) return show(shell(forbiddenView(), user, null), 'Acesso negado', routeKey);

  try {
    const content = await hit.route.view({ params: hit.match.slice(1), query, user });
    if (seq === renderSeq) show(shell(content, user, hit.route.nav), hit.route.title, routeKey);
  } catch (e) {
    if (e.status === 401 || seq !== renderSeq) return;
    show(shell(h('div', { class: 'error', role: 'alert', 'data-testid': 'view-error' }, 'Não foi possível carregar esta página.'), user, hit.route.nav), 'Erro', routeKey);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('ql:rerender', render);
window.addEventListener('ql:expired', () => {
  resetCatalogCache();
  navigate('/login');
});
// Logging out (or in) in another tab: follow the shared session.
window.addEventListener('storage', (event) => {
  if (event.key === 'ql_token') {
    resetCatalogCache();
    render();
  }
});

render();
