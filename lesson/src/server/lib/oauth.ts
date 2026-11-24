import * as oidc from 'openid-client';
import { deleteCookie, getCookie, setCookie, sendRedirect, type H3Event } from 'h3';
import { cookieOptions, isUnique, startSession } from './auth';
import { appOrigin } from './config';
import { database, insertId } from './db';
import { fail } from './http';
import { setting } from './integrations';
import type { User } from '../../shared/contract';

const issuer = new URL('https://accounts.google.com');
const redirectUri = () => appOrigin() + '/api/auth/google/callback';
const cookie = 'analog_oidc';

async function config() {
  return oidc.discovery(issuer, setting('GOOGLE_CLIENT_ID'), setting('GOOGLE_CLIENT_SECRET'));
}

export async function startGoogle(event: H3Event) {
  const configuration = await config();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  setCookie(event, cookie, JSON.stringify({ verifier, state, nonce }), { ...cookieOptions(), maxAge: 300 });
  return sendRedirect(event, url.href);
}

export async function finishGoogle(event: H3Event) {
  const pending = getCookie(event, cookie);
  deleteCookie(event, cookie, cookieOptions());
  if (!pending) return fail(400, 'BAD_REQUEST', '로그인 요청이 만료되었습니다.');
  const configuration = await config();
  const { verifier, state, nonce } = JSON.parse(pending) as { verifier: string; state: string; nonce: string };
  const callback = new URL(redirectUri());
  callback.search = new URL(event.path, appOrigin()).search;
  const tokens = await oidc.authorizationCodeGrant(configuration, callback, {
    pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce,
  }).catch(() => null);
  const claims = tokens?.claims();
  if (!claims || typeof claims['email'] !== 'string' || claims['email_verified'] !== true || claims.sub.length > 255) {
    return fail(401, 'INVALID_CREDENTIALS', 'Google 계정을 확인할 수 없습니다.');
  }
  const email = claims['email'].toLowerCase();
  const nickname = String(claims['name'] ?? 'Google 사용자').slice(0, 40);
  const db = await database();
  let user: User;
  try {
    user = await db.transaction(async (trx) => {
      const existing: User | undefined = await trx('oauthAccounts as a').join('users as u', 'a.userId', 'u.id')
        .where('a.subject', claims.sub).first('u.id', 'u.email', 'u.nickname');
      if (existing) return existing;
      const id = await insertId(trx, 'users', { email, nickname, passwordHash: null });
      await trx('oauthAccounts').insert({ subject: claims.sub, userId: id });
      return { id, email, nickname };
    });
  } catch (error) {
    if (isUnique(error)) return fail(409, 'EMAIL_TAKEN', '이 이메일로 만든 기존 계정이 있습니다. 기존 방식으로 로그인하세요.');
    throw error;
  }
  await startSession(event, user);
  return sendRedirect(event, '/account');
}
