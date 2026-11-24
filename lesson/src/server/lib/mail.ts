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
