# study7 · 인증과 보안 기초

## ① 목표

회원가입부터 로그아웃까지 세션을 확인하고 작성자만 글을 변경하도록 한다.

## ② 📖 이론

인증은 사용자가 누구인지 확인하고 인가는 특정 글을 바꿀 권한이 있는지 검사한다. 비밀번호는 무작위 salt와 scrypt로 해시하며, JWT는 서명·발급자·대상·만료를 검증하고 DB 세션이 살아 있는지 확인한다. 출입증을 발급하고 입구에서 유효성, 자료실에서 소유권을 따지는 흐름이다. `HttpOnly`는 자바스크립트의 쿠키 읽기를 제한하고 `SameSite`와 Origin 검사는 쿠키로 보낸 상태 변경의 CSRF를 줄인다. 텍스트 보간은 게시물의 HTML을 그대로 실행하지 않도록 한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`/account`에서 가입 후 로그인한다. 브라우저는 `analog_session`을 쿠키에 받고 `Session.refresh()`의 `/api/auth/me`로 사용자 정보를 갱신한다. JSON 클라이언트는 응답의 `data.accessToken`을 메모리에 두고 Bearer로 보낼 수 있다. 로그아웃은 서버 세션을 삭제하고 쿠키를 만료한다.

| 상황 | 상태 |
| --- | --- |
| 토큰 없음·만료·폐기 | 401 `UNAUTHORIZED` |
| 잘못된 자격 증명 | 401 `INVALID_CREDENTIALS` |
| 다른 사용자의 글 수정 | 403 `FORBIDDEN` |
| 동일 이메일 가입 | 409 `EMAIL_TAKEN` |

운영 `.env`의 `APP_ORIGIN`과 `CORS_ORIGIN`은 HTTPS 출처로 지정한다. CORS는 브라우저에서 응답 사용 가능 출처를 제한한다. 서버는 요청마다 JWT와 작성자 조건을 검증하며 쿠키 기반 상태 변경에 동일 출처 Origin을 요구한다.

### `lesson/src/server/lib/auth.ts` 전체 코드

```typescript
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
```

- 1–8행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 10–17행 비동기 scrypt와 세션 설정을 구성한다.
- 19–23행 salt와 도출 키를 분리해 저장한다.
- 25–35행 상수 시간 비교와 가짜 해시로 실패 처리를 통일한다.
- 37–47행 해시가 포함된 사용자 행을 저장하되 응답에는 공개 필드만 담는다.
- 49–53행 운영에서 Secure 속성이 기본이다.
- 55–66행 한 시간 JWT를 발급하고 해시한 세션 식별자를 저장한다.
- 68–74행 가입한 사용자의 비밀번호를 검증한다.
- 76–93행 서명, 만료, 세션 행을 검증해 사용자 DTO를 만든다.
- 95–99행 서버 세션과 브라우저 쿠키를 제거한다.

### `lesson/src/app/core/session.ts` 전체 코드

```typescript
import { Injectable, signal } from '@angular/core';
import type { User } from '../../shared/contract';
import { ApiFailure, call } from './api';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly current = signal<User | null>(null);
  readonly user = this.current.asReadonly();

  async refresh() {
    try {
      const { data } = await call<{ data: User }>('/api/auth/me');
      this.current.set(data);
    } catch (error) {
      if (!(error instanceof ApiFailure) || error.status !== 401) throw error;
      this.current.set(null);
    }
  }

  async signIn(email: string, password: string) {
    const { data } = await call<{ data: { user: User } }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    this.current.set(data.user);
  }

  async signOut() {
    await call('/api/auth/logout', { method: 'POST' });
    this.current.set(null);
  }
}
```

- 1–3행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 5–6행 화면 간 재사용 가능한 상태 서비스를 제공한다.
- 7–8행 쓰기 가능한 상태를 서비스 내부에 둔다.
- 10–18행 세션 만료 401이면 사용자 상태를 초기화한다.
- 20–25행 로그인 API의 사용자 정보로 상태를 갱신한다.
- 27–31행 서버 폐기 후 브라우저 상태를 비운다.

## ④ 🔗 연동 포인트

보호된 요청은 `requireUser`를 통과한 뒤 저장소의 작성자 검사를 거친다. 같은 인증으로 study13 업로드·결제와 study18 AI 요청을 보호한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 쿠키가 저장되지 않음 | 로컬 HTTP에 Secure 쿠키를 설정 | 로컬에서 `COOKIE_SECURE=false`를 쓰고 운영에서는 true를 유지한다. |
| 상태 변경 403 | Origin이 `APP_ORIGIN`과 다르거나 작성자가 아님 | 응답 오류 문구와 Request Headers를 확인한다. |
| 허용되지 않은 CORS preflight | 브라우저 Origin이 허용 설정과 다름 | 허용 출처를 프로토콜·호스트·포트까지 일치시킨다. |

## ⑥ 직접 해보기

1. 두 계정으로 같은 글에 접근하고 작성자와 비작성자의 PATCH 상태를 비교한다.
2. 로그아웃 후 기존 Bearer로 `/api/auth/me`를 호출한다.
3. 본문에 `<b>태그</b>`를 입력해 텍스트로 표시되는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 비밀번호 해시·토큰 만료 및 폐기 확인
- [ ] HttpOnly·SameSite·Secure 속성 확인
- [ ] 비작성자 403 및 Origin 검사 확인

## ⑧ 다음 단계

[study8](study8.md)에서 인증과 게시판에서 공통으로 쓰는 경계를 정리한다.

[참고 문서](https://app.notion.com/p/3d6d7dec5e2e8113acbec80b1382c48d)
