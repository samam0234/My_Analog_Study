# study13 · 외부 서비스 연동

## ① 목표

데모 결제, 메일, 파일 업로드, Google 소셜 로그인을 Analog 서버에서 연결한다.

## ② 📖 이론

외부 서비스의 비밀 키는 서버가 사용하고 브라우저는 결과만 받는다. 결제 확인은 돌아온 URL 대신 서명 검증된 webhook이 맡는다. OAuth는 임시 티켓을 서비스 세션으로 교환하는 절차다. PKCE는 코드와 시작 브라우저를 묶고 `state` 및 `nonce`는 응답의 맥락을 검증한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

| 기능 | 실습 설정 및 실행 |
| --- | --- |
| Stripe | 테스트 모드에서 가격 생성 후 `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` 입력. `stripe listen --forward-to localhost:5173/api/integrations/stripe-webhook`의 webhook secret을 사용하고 `/lab`에서 결제 테스트를 실행한다. |
| 메일 | Redis와 SMTP를 구동한다. Compose의 `mail-test` 프로필에서는 `SMTP_URL=smtp://mailpit:1025` 및 `MAIL_FROM=board@example.test`로 설정하고 로컬 8025에서 결과를 본다. |
| 파일 | `/lab`에서 32 KiB 이하 UTF-8 `.txt`를 선택하고 업로드 후 로그인 사용자로 내려받는다. |
| Google | Google OAuth 웹 클라이언트에 `APP_ORIGIN + /api/auth/google/callback`을 등록하고 서버에 ID와 Secret을 지정한다. `/account`의 Google 로그인을 클릭한다. |

외부 키가 비어 있으면 해당 API의 503으로 설정 상태를 확인할 수 있다. 결제 webhook은 동일 Checkout ID를 중복 저장하지 않는다.

### `lesson/src/server/lib/integrations.ts` 전체 코드

```typescript
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getHeader, readRawBody, setHeader, type H3Event } from 'h3';
import Stripe from 'stripe';
import { appOrigin } from './config';
import { database } from './db';
import { fail, missing } from './http';
import type { User } from '../../shared/contract';

export function setting(name: string) {
  const value = process.env[name];
  if (!value) return fail(503, 'NOT_CONFIGURED', '이 기능은 서버 설정이 필요합니다.');
  return value;
}

export async function checkout(user: User) {
  const stripe = new Stripe(setting('STRIPE_SECRET_KEY'));
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: setting('STRIPE_PRICE_ID'), quantity: 1 }],
    client_reference_id: String(user.id),
    success_url: appOrigin() + '/lab?checkout=success',
    cancel_url: appOrigin() + '/lab?checkout=cancel',
    customer_email: user.email,
  });
  return { url: session.url };
}

export async function acceptStripeWebhook(event: H3Event) {
  const stripe = new Stripe(setting('STRIPE_SECRET_KEY'));
  const secret = setting('STRIPE_WEBHOOK_SECRET');
  const raw = await readRawBody(event, false);
  const signature = getHeader(event, 'stripe-signature');
  if (!raw || !signature) return fail(400, 'BAD_REQUEST', '결제 알림 서명을 확인할 수 없습니다.');
  const notification = await stripe.webhooks.constructEventAsync(raw, signature, secret).catch(() => null);
  if (!notification) return fail(400, 'BAD_REQUEST', '결제 알림 서명이 잘못되었습니다.');
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(notification.type)) {
    const session = notification.data.object as Stripe.Checkout.Session;
    const userId = Number(session.client_reference_id);
    if (session.payment_status === 'paid' && Number.isSafeInteger(userId) && userId > 0) {
      await (await database())('payments')
        .insert({ id: session.id, userId, createdAt: new Date().toISOString() })
        .onConflict('id').ignore();
    }
  }
  return { received: true };
}

const maxUpload = 32 * 1024;
const uploadRoot = () => process.env['UPLOAD_DIR'] || './data/uploads';

export async function uploadText(event: H3Event, userId: number) {
  if (getHeader(event, 'content-type')?.split(';')[0] !== 'text/plain') {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'UTF-8 텍스트 파일을 선택하세요.');
  }
  const bytes = await readRawBody(event, false);
  if (!bytes?.byteLength) return fail(400, 'BAD_REQUEST', '빈 파일입니다.');
  if (bytes.byteLength > maxUpload) return fail(413, 'PAYLOAD_TOO_LARGE', '파일은 32 KiB 이하여야 합니다.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail(422, 'VALIDATION_ERROR', 'UTF-8로 저장한 파일을 선택하세요.'); }
  if (!text.trim() || text.includes('\0')) return fail(422, 'VALIDATION_ERROR', '텍스트가 필요합니다.');
  const id = randomUUID();
  const directory = join(uploadRoot(), String(userId));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, id + '.txt'), text, { mode: 0o600, flag: 'wx' });
  return { id, bytes: bytes.byteLength };
}

export async function downloadText(event: H3Event, userId: number, id: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) return missing();
  const body = await readFile(join(uploadRoot(), String(userId), id + '.txt'), 'utf8')
    .catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? missing() : Promise.reject(error));
  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'content-disposition', 'attachment; filename="board-note.txt"');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="board-note.txt"', 'cache-control': 'no-store' } });
}
```

- 1–9행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 11–15행 필수 운영 설정이 없으면 API 오류를 낸다.
- 17–28행 서버에서 가격과 세션을 만든다.
- 30–40행 원본 바이트와 키로 서명을 검증한다.
- 41–43행 결제 완료 상태와 사용자 참조를 확인한다.
- 44–51행 재전송된 webhook의 중복 저장을 막는다.
- 53–63행 형식과 바이트 한도, UTF-8을 검사한다.
- 64–69행 경로에 원본 파일명이 관여하지 않게 한다.
- 71–78행 세션 사용자 폴더에서만 요청 파일을 읽는다.

### `lesson/src/server/lib/oauth.ts` 전체 코드

```typescript
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
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 2–12행 짧은 수명의 HttpOnly 쿠키에 임시 값을 보관한다.
- 14–19행 공급자 메타데이터와 서버 키를 가져온다.
- 20–42행 세션별 PKCE·state·nonce를 만든다.
- 43–45행 콜백의 code와 시작 때의 값을 검증한다.
- 46–54행 검증된 이메일과 subject를 읽는다.
- 55–63행 공급자 subject로 사용자를 찾거나 새 계정을 만든다.
- 64–66행 이메일 충돌 때 기존 계정을 자동 연결하지 않는다.
- 67–69행 서비스 고유 세션을 발급하고 계정으로 이동한다.

### `lesson/src/server/lib/mail.ts` 전체 코드

```typescript
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createTransport } from 'nodemailer';

export interface MailJob {
  email: string;
  nickname: string;
}

let queue: Queue<MailJob> | undefined;

export async function enqueueMail(job: MailJob) {
  const url = process.env['REDIS_URL'];
  if (!url) return false;
  queue ??= new Queue<MailJob>('board-mail', { connection: new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) });
  await queue.add('welcome', job, {
    attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100,
  });
  return true;
}

export function mailWorker(redis: string, smtp: string, from: string) {
  const transport = createTransport(smtp);
  return new Worker<MailJob>('board-mail', async ({ data }) => {
    await transport.sendMail({ from, to: data.email, subject: 'Analog 게시판에 오신 것을 환영합니다', text: data.nickname + '님, 반갑습니다.' });
  }, { connection: new IORedis(redis, { maxRetriesPerRequest: null }), concurrency: 2 });
}
```

- 1–3행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 5–10행 작업 데이터의 필드를 제한한다.
- 12–16행 Redis 큐에 메일 작업을 넣는다.
- 17–20행 일시 실패가 생기면 지수 백오프로 재시도한다.
- 22–27행 SMTP 발송을 별도 큐 작업으로 처리한다.

## ④ 🔗 연동 포인트

로그인 JWT를 업로드·결제·메일에 재사용한다. 파일 경로는 볼륨에 연결하고 느린 메일 발송 작업은 다음 성능 단계의 큐 모니터링으로 이어진다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Stripe 400 서명 실패 | JSON을 먼저 파싱해 원본을 잃거나 secret 불일치 | raw body와 현재 endpoint secret을 확인한다. |
| Google `redirect_uri_mismatch` | 호스트 또는 callback 경로 불일치 | 등록한 URI와 `APP_ORIGIN`을 맞춘다. |
| 메일이 대기만 함 | Redis worker 또는 SMTP 미실행 | Compose 로그와 Mailpit 메일함을 확인한다. |
| 파일 413/415 | 크기 또는 Content-Type 위반 | 32 KiB 이하 UTF-8 텍스트를 사용한다. |

## ⑥ 직접 해보기

1. 같은 계정으로 환영 메일을 두 번 요청해 제한 반응을 확인한다.
2. 테스트 결제 webhook 재전송 후 결제 DB 행 수를 확인한다.
3. 첫 계정으로 업로드하고 두 번째 계정에서는 같은 ID의 다운로드가 404인지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Stripe 테스트 결제와 webhook 중복 확인
- [ ] Redis·SMTP 환영 메일 수신 확인
- [ ] 파일 크기·다운로드 권한 확인
- [ ] Google state·PKCE·nonce 흐름 확인

## ⑧ 다음 단계

[study14](study14.md)에서 API 목록을 문서화하고 계약 변경을 버전으로 구분한다.

[참고 문서](https://docs.stripe.com/checkout/fulfillment)
