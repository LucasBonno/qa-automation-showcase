import { h } from '../ui.js';

export const notFoundView = () =>
  h('section', {}, h('h1', {}, 'Página não encontrada'), h('p', { 'data-testid': 'not-found' }, 'O endereço acessado não existe.'), h('a', { href: '#/quotes' }, 'Voltar para as cotações'));

export const forbiddenView = () =>
  h('section', {}, h('h1', {}, 'Acesso negado'), h('p', { 'data-testid': 'forbidden' }, 'Seu perfil não tem permissão para acessar esta página.'), h('a', { href: '#/quotes' }, 'Voltar para as cotações'));

export const quoteNotFoundView = () =>
  h('section', {}, h('h1', {}, 'Cotação não encontrada'), h('p', { 'data-testid': 'not-found' }, 'Esta cotação não existe ou foi excluída.'), h('a', { href: '#/quotes' }, 'Voltar para as cotações'));
