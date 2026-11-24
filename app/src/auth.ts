import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role, SessionUser } from './types.js';

/**
 * Demo accounts. They are published in the README on purpose: this is a sandbox app with fictional data.
 */
interface Account {
  username: string;
  password: string;
  name: string;
  role: Role;
}

export const ACCOUNTS: readonly Account[] = [
  { username: 'admin', password: 'Admin@123', name: 'Ana Admin', role: 'admin' },
  { username: 'vendedor', password: 'Vend@123', name: 'Vitor Vendedor', role: 'seller' },
  { username: 'aprovador', password: 'Aprov@123', name: 'Paula Aprovadora', role: 'approver' },
  { username: 'consulta', password: 'Cons@123', name: 'Caio Consulta', role: 'viewer' },
];

// No secret is stored in the code: unless QL_TOKEN_SECRET is set, a random one is generated at start-up.
// (Tokens therefore stop working when the server restarts, which is fine for a sandbox.)
const SECRET = process.env.QL_TOKEN_SECRET ?? randomBytes(32).toString('hex');
export const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

const b64 = (s: string): string => Buffer.from(s).toString('base64url');
const sign = (payload: string): string => createHmac('sha256', SECRET).update(payload).digest('base64url');

export function checkCredentials(username: unknown, password: unknown): SessionUser | null {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const account = ACCOUNTS.find((a) => a.username === username);
  if (!account) return null;
  const given = Buffer.from(password);
  const expected = Buffer.from(account.password);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { username: account.username, name: account.name, role: account.role };
}

export function signToken(user: SessionUser, ttlSeconds: number): string {
  const payload = b64(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): SessionUser | null {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser & { exp: number };
    if (typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { username: data.username, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  user: SessionUser;
}

export const userOf = (req: Request): SessionUser => (req as unknown as AuthedRequest).user;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada.' });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

export const canWrite = (role: Role): boolean => role === 'admin' || role === 'seller';
export const canDecide = (role: Role): boolean => role === 'admin' || role === 'approver';
