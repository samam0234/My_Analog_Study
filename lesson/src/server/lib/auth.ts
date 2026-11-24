import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { deleteCookie, getCookie, getHeader, setCookie, setHeader, type H3Event } from 'h3';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '../../shared/contract';
import { sessionSecret } from './config';
import { database, insertId } from './db';
import { fail } from './http';

const derive = promisify(scrypt);
const cookie = 'analog_session';
const hour = 3600;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

interface UserRow extends User { passwordHash: string | null }

export const userDto = ({ id, email, nickname }: User): User => ({ id, email, nickname });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return salt + ':' + key.toString('hex');
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [salt, encoded] = (stored || '00000000000000000000000000000000:' + '00'.repeat(64)).split(':');
  const actual = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected) && stored !== null;
}

export function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    ['23505', 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY', 'ER_DUP_ENTRY'].includes(String(error.code));
}

export async function createUser(input: Omit<User, 'id'> & { password: string }): Promise<User> {
  const { email, nickname, password } = input;
  const db = await database();
  const passwordHash = await hashPassword(password);
  try {
    return { id: await insertId(db, 'users', { email, nickname, passwordHash }), email, nickname };
  } catch (error) {
    if (isUnique(error)) return fail(409, 'EMAIL_TAKEN', '이미 사용 중인 이메일입니다.');
    throw error;
  }
}

function secureCookie() {
  return process.env['COOKIE_SECURE'] !== 'false' && process.env['NODE_ENV'] === 'production';
}

export const cookieOptions = () => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: secureCookie() });

export async function startSession(event: H3Event, user: User) {
  const jti = randomBytes(32).toString('hex');
  const accessToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' })
    .setIssuer('analog-board').setAudience('analog-board').setJti(jti).setSubject(String(user.id))
    .setIssuedAt().setExpirationTime('1h').sign(sessionSecret());
  await (await database())('sessions').insert({
    id: digest(jti), userId: user.id, expiresAt: new Date(Date.now() + hour * 1000).toISOString(),
  });
  setCookie(event, cookie, accessToken, { ...cookieOptions(), maxAge: hour });
  setHeader(event, 'cache-control', 'no-store');
  return { user: userDto(user), accessToken };
}

export async function login(event: H3Event, email: string, password: string) {
  const row: UserRow | undefined = await (await database())('users').where({ email }).first();
  if (!(await verifyPassword(password, row?.passwordHash ?? null)) || !row) {
    return fail(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인하세요.');
  }
  return startSession(event, row);
}

export async function requireUser(event: H3Event): Promise<User> {
  const authorization = getHeader(event, 'authorization');
  const token = authorization ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : getCookie(event, cookie);
  if (!token) return fail(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  const secret = sessionSecret();
  const verified = await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: 'analog-board', audience: 'analog-board' })
    .catch(() => null);
  const { jti, sub } = verified?.payload ?? {};
  if (!jti || !sub) return fail(401, 'UNAUTHORIZED', '세션이 만료되었거나 유효하지 않습니다.');
  const sessionId = digest(jti);
  const row: User | undefined = await (await database())('sessions as s').join('users as u', 'u.id', 's.userId')
    .where('s.id', sessionId).where('s.userId', Number(sub)).where('s.expiresAt', '>', new Date().toISOString())
    .first('u.id', 'u.email', 'u.nickname');
  if (!row) return fail(401, 'UNAUTHORIZED', '세션이 만료되었거나 유효하지 않습니다.');
  event.context['sessionId'] = sessionId;
  setHeader(event, 'cache-control', 'no-store');
  return row;
}

export async function logout(event: H3Event) {
  await requireUser(event);
  await (await database())('sessions').where({ id: event.context['sessionId'] }).delete();
  deleteCookie(event, cookie, cookieOptions());
}
