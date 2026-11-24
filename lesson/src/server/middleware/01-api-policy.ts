import { getHeader, getRequestURL, setHeader, setResponseStatus } from 'h3';
import { appOrigin } from '../lib/config';
import { api, fail } from '../lib/http';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const bodyMax = 64 * 1024;

export default api((event) => {
  const path = getRequestURL(event).pathname;
  if (!path.startsWith('/api/')) return;
  const origin = getHeader(event, 'origin');
  const allowed = process.env['CORS_ORIGIN'];
  setHeader(event, 'vary', 'Origin');
  setHeader(event, 'x-content-type-options', 'nosniff');

  if (origin && origin === allowed) {
    setHeader(event, 'access-control-allow-origin', origin);
    setHeader(event, 'access-control-allow-credentials', 'true');
    setHeader(event, 'access-control-expose-headers', 'X-Request-Id, Location');
  }

  if (event.method === 'OPTIONS') {
    if (!origin || origin !== allowed) return fail(403, 'FORBIDDEN', '허용되지 않은 출처입니다.');
    setHeader(event, 'access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    setHeader(event, 'access-control-allow-headers', 'Authorization, Content-Type, X-Request-Id');
    setResponseStatus(event, 204);
    return new Response(null, { status: 204 });
  }

  if (safeMethods.has(event.method)) return;
  if (Number(getHeader(event, 'content-length')) > bodyMax) {
    return fail(413, 'PAYLOAD_TOO_LARGE', '요청 크기 제한을 초과했습니다.');
  }
  const bearer = /^Bearer \S+$/i.test(getHeader(event, 'authorization') || '');
  const signedWebhook = path === '/api/integrations/stripe-webhook';
  if (!signedWebhook && (origin ? origin !== appOrigin() && !(bearer && origin === allowed) : !bearer)) {
    return fail(403, 'FORBIDDEN', '요청 출처를 확인할 수 없습니다.');
  }
  return undefined;
});
