/** Demo accounts of the sandbox app (public on purpose, see the README). */
export type RoleKey = 'admin' | 'seller' | 'approver' | 'viewer';

export interface Account {
  username: string;
  password: string;
  name: string;
  roleLabel: string;
}

export const ACCOUNTS: Record<RoleKey, Account> = {
  admin: { username: 'admin', password: 'Admin@123', name: 'Ana Admin', roleLabel: 'Administrador' },
  seller: { username: 'vendedor', password: 'Vend@123', name: 'Vitor Vendedor', roleLabel: 'Vendedor' },
  approver: { username: 'aprovador', password: 'Aprov@123', name: 'Paula Aprovadora', roleLabel: 'Aprovador' },
  viewer: { username: 'consulta', password: 'Cons@123', name: 'Caio Consulta', roleLabel: 'Consulta' },
};
