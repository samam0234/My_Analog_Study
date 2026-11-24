import { defineNitroPlugin } from 'nitropack/runtime';
import { mailWorker } from '../lib/mail';

export default defineNitroPlugin((nitro) => {
  const redis = process.env['REDIS_URL'];
  const smtp = process.env['SMTP_URL'];
  const from = process.env['MAIL_FROM'];
  if (!redis || !smtp || !from) return;
  const worker = mailWorker(redis, smtp, from);
  worker.on('failed', (job) => console.error(JSON.stringify({ level: 'error', event: 'mail_failed', jobId: job?.id })));
  worker.on('error', () => console.error(JSON.stringify({ level: 'error', event: 'mail_worker_error' })));
  nitro.hooks.hook('close', () => worker.close());
});
