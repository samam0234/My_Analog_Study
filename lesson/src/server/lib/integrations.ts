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
