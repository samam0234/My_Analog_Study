import { defineConfig } from '@playwright/test';

const serverPort = Number(process.env['TEST_PORT'] || 4173);
const url = 'http://127.0.0.1:' + serverPort;
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: url, browserName: 'chromium' },
  webServer: process.env['TEST_SERVER_URL'] ? undefined : {
    command: 'node dist/analog/server/index.mjs',
    url: url + '/api/ready',
    env: {
      PORT: String(serverPort),
      HOST: '127.0.0.1',
      APP_ORIGIN: url,
      CORS_ORIGIN: url,
      COOKIE_SECURE: 'false',
      APP_SECRET: 'local-test-only-secret-please-do-not-use-in-production',
      DB_CLIENT: 'better-sqlite3',
      SQLITE_PATH: ':memory:',
      UPLOAD_DIR: './data/test-uploads',
      AI_PROVIDER: 'demo',
    },
    timeout: 60_000,
  },
});
