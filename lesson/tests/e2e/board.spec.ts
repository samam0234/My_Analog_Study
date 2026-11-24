import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const password = 'TestPassword#24';
const id = () => randomUUID().slice(0, 8);
const origin = () => 'http://127.0.0.1:' + (process.env['TEST_PORT'] || '4173');

test('API v1 paths, validation, authorization and request IDs', async ({ request }) => {
  const email = id() + '@example.com';
  const headers = { Origin: origin(), 'X-Request-Id': 'study9-contract' };
  expect(await (await request.get('/health')).json()).toEqual({ status: 'ok' });
  expect((await request.post('/api/auth/signup', { headers, data: { email, password, nickname: '테스터' } })).status()).toBe(201);
  expect((await request.post('/api/auth/signup', { headers, data: { email, password, nickname: '테스터' } })).status()).toBe(409);
  const login = await request.post('/api/auth/login', { headers, data: { email, password } });
  expect(login.status()).toBe(200);
  expect(login.headers()['set-cookie']).toContain('HttpOnly');
  const { data: { accessToken } } = await login.json();
  const bearer = { Authorization: 'Bearer ' + accessToken };
  expect((await request.get('/api/auth/me', { headers: bearer })).status()).toBe(200);
  expect((await request.post('/api/posts', { headers: { Origin: 'https://invalid.example' }, data: { title: 'test' } })).status()).toBe(403);

  const invalid = await request.post('/api/posts', { headers, data: { title: ' ', body: '본문' } });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR', requestId: 'study9-contract', fields: { title: expect.any(Array) } } });
  const preview = await request.post('/api/practice/validate', { headers, data: {} });
  expect(preview.status()).toBe(422);
  const badJson = await request.post('/api/posts', { headers: { ...headers, 'content-type': 'application/json' }, data: Buffer.from('{') });
  expect(badJson.status()).toBe(400);
  expect(await badJson.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });

  const title = 'API 계약 ' + id();
  const create = await request.post('/api/posts', { headers, data: { title, body: '본문', tags: ['study'] } });
  expect(create.status()).toBe(201);
  const location = create.headers()['location'];
  const detail = await request.get(location);
  expect(await detail.json()).toMatchObject({ data: { title, tags: ['study'] } });
  const update = await request.patch(location, { headers, data: { body: '새 본문' } });
  expect(await update.json()).toMatchObject({ data: { body: '새 본문', tags: ['study'] } });
  const list = await request.get('/api/posts', { params: { q: title, limit: 100, sort: '-commentCount' } });
  expect(await list.json()).toMatchObject({ data: [{ title }], meta: { limit: 50, total: 1, totalPages: 1, page: 1, q: title } });

  const comment = await request.post(location + '/comments', { headers, data: { body: '댓글' } });
  expect(comment.status()).toBe(201);
  const { data: { id: commentId } } = await comment.json();
  expect((await request.delete('/api/comments/' + commentId, { headers })).status()).toBe(204);
  const deletion = await request.delete(location, { headers });
  expect(deletion.status()).toBe(204);
  expect(await deletion.text()).toBe('');
  expect((await request.get(location)).status()).toBe(404);
  const missing = await request.get('/api/nonexistent');
  expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  expect((await request.post('/api/auth/logout', { headers })).status()).toBe(204);
  expect((await request.get('/api/auth/me', { headers: bearer })).status()).toBe(401);
});

test('SSR, SSG, account, Material form, notifications and DocuForge mini lab', async ({ page, request }) => {
  const email = id() + '@example.com';
  const title = 'Analog 새 글 ' + id();
  expect(await (await request.get('/blog/welcome')).text()).toContain('Markdown에서 생성됩니다');
  await page.goto('/account');
  await page.getByRole('button', { name: '회원가입 화면으로' }).click();
  await page.getByLabel('닉네임').fill('브라우저');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료되었습니다.');
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '브라우저' })).toBeVisible();
  const lab = await page.context().newPage();
  await lab.goto('/lab');
  await lab.getByRole('button', { name: '알림 연결' }).click();
  await expect(lab.getByText('연결되었습니다.', { exact: true })).toBeVisible();

  await page.goto('/posts/new');
  await page.getByLabel('제목').fill(title);
  await page.getByLabel('본문').fill('Analog의 서버 load 실습입니다.');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(lab.getByText(/새 글이 등록되었습니다/)).toBeVisible();
  expect(await (await request.get('/posts', { params: { q: title } })).text()).toContain(title);
  await page.getByLabel('댓글', { exact: true }).fill('연동 확인');
  await page.getByRole('button', { name: '댓글 작성' }).click();
  await expect(page.getByText('연동 확인', { exact: true })).toBeVisible();

  await lab.getByLabel('문서', { exact: true }).fill('Analog 게시판은 파일 라우팅을 사용합니다.');
  await lab.getByLabel('질문', { exact: true }).fill('Analog 게시판?');
  await lab.getByRole('button', { name: '질문 보내기' }).click();
  await expect(lab.getByText(/발췌 1\)/)).toBeVisible();
  await lab.getByRole('button', { name: '최근 질문 불러오기' }).click();
  await expect(lab.locator('summary').getByText('Analog 게시판?')).toBeVisible();
  await page.goto('/practice');
  await page.getByRole('button', { name: '1 추가' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('analog-count'))).toBe('1');
  await page.reload();
  await expect(page.getByText('카운트 1 · 두 배 2')).toBeVisible();
});

test('OpenAPI, authenticated file download and MCP search', async ({ request }) => {
  const email = id() + '@example.com';
  const headers = { Origin: origin() };
  await request.post('/api/auth/signup', { headers, data: { email, password, nickname: 'MCP' } });
  const login = await request.post('/api/auth/login', { headers, data: { email, password } });
  const { data: { accessToken } } = await login.json();
  expect(await (await request.get('/api/openapi.json')).json()).toMatchObject({ openapi: '3.1.0' });
  expect((await request.get('/swagger/swagger-ui-bundle.js')).ok()).toBe(true);
  const upload = await request.post('/api/uploads', {
    headers: { ...headers, 'content-type': 'text/plain' }, data: 'Analog upload',
  });
  expect(upload.status()).toBe(201);
  const { data: file } = await upload.json();
  expect(await (await request.get('/api/uploads/' + file.id)).text()).toBe('Analog upload');

  const response = await request.post('/api/mcp', {
    headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_posts', arguments: { q: 'Analog' } } },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ result: { content: [{ type: 'text', text: expect.any(String) }] } });
});
