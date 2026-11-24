import { setResponseStatus } from 'h3';
import { requireUser } from '../../../lib/auth';
import { api, fail } from '../../../lib/http';
import { enqueueMail } from '../../../lib/mail';

const last = new Map<number, number>();
export default api(async (event) => {
  const { id, email, nickname } = await requireUser(event);
  const now = Date.now();
  for (const [key, until] of last) if (until <= now) last.delete(key);
  if (last.has(id)) return fail(429, 'RATE_LIMITED', '1분 후 다시 요청하세요.');
  if (!process.env['SMTP_URL'] || !process.env['MAIL_FROM'] || !process.env['REDIS_URL']) {
    return fail(503, 'NOT_CONFIGURED', '메일과 작업 큐 설정이 필요합니다.');
  }
  last.set(id, now + 60_000);
  try {
    await enqueueMail({ email, nickname });
  } catch {
    last.delete(id);
    return fail(503, 'QUEUE_UNAVAILABLE', '작업 큐를 사용할 수 없습니다.');
  }
  setResponseStatus(event, 202);
  return { data: { queued: true } };
});
