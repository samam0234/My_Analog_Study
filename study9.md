# study9 · 테스트와 디버깅

## ① 목표

단위·DB·요청·브라우저 검사를 실행하고 요청 ID로 오류를 추적한다.

## ② 📖 이론

검사 범위가 넓을수록 실제 흐름을 재현하지만 원인을 좁히는 데 시간이 든다. 기기의 부품도 따로 확인하고 전원을 연결해 전체 동작도 확인하는 것과 같다. Vitest의 in-memory DB와 `vi.fn`을 사용해 호출 여부를 세고 Playwright로 실제 Nitro HTTP와 화면을 실행한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright `request`가 실제 서버에 HTTP를 보낸다. 브라우저에서 실패하면 `npx playwright show-report`에 앞서 `npm run test:e2e -- --reporter=html`로 리포트를 만든다. `--debug`로 단계별 실행하고 DevTools의 Console, Network, Sources를 본다. VS Code의 JavaScript Debug Terminal에서 `npm run start`를 실행하면 서버 TS를 브레이크포인트로 확인할 수 있다. HTTP 실패의 `X-Request-Id`를 복사해 서버 로그의 같은 `requestId`를 찾는다.

### `lesson/tests/domain.spec.ts` 전체 코드

```typescript
import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/lib/auth';
import { databaseConfig } from '../src/server/lib/config';
import { insertId, migrate } from '../src/server/lib/db';
import { selectExcerpts } from '../src/server/lib/documents';
import { cachedList, invalidateList } from '../src/server/lib/notifications';
import { addComment, addPost, editPost, listPosts, removeItem } from '../src/server/lib/posts';
import { listSchema, patchSchema, postSchema } from '../src/server/lib/schemas';

describe('Analog board domain', () => {
  let db: Knex;
  let author: number;

  beforeEach(async () => {
    db = knex(databaseConfig({ SQLITE_PATH: ':memory:' }));
    await migrate(db);
    author = await insertId(db, 'users', { email: 'author@example.com', nickname: '작성자' });
  });

  afterEach(async () => {
    vi.useRealTimers();
    invalidateList();
    await db.destroy();
  });

  it('enforces fields and preserves omitted PATCH tags', async () => {
    expect(() => postSchema.parse({ title: ' ', body: 'ok' })).toThrow();
    const row = await addPost(db, author, { title: 'Analog with 100%', body: 'body', tags: ['study'] });
    const updated = await editPost(db, row.id, author, patchSchema.parse({ title: 'Analog with 50%' }));
    expect(updated).toMatchObject({ tags: ['study'], title: 'Analog with 50%' });
    expect((await listPosts(db, listSchema.parse({ q: '%', limit: '99' }))).meta).toMatchObject({ total: 1, limit: 50 });
    expect((await listPosts(db, listSchema.parse({ q: '_' }))).meta.total).toBe(0);
  });

  it('counts comments, checks ownership, and cascades deletion', async () => {
    const post = await addPost(db, author, { title: '제목', body: '본문', tags: [] });
    await addComment(db, post.id, author, '댓글');
    expect((await listPosts(db, listSchema.parse({ sort: '-commentCount' }))).data[0].commentCount).toBe(1);
    await expect(removeItem(db, 'posts', post.id, author + 1)).rejects.toMatchObject({ status: 403 });
    await removeItem(db, 'posts', post.id, author);
    expect(await db('comments').count('* as total').first()).toEqual({ total: 0 });
  });

  it('salts identical passwords and finds only relevant excerpts', async () => {
    const hash = await hashPassword('a test password');
    expect(hash).not.toBe(await hashPassword('a test password'));
    expect(await verifyPassword('a test password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(selectExcerpts('Analog 서버를 학습합니다.', 'Analog 서버?')).toHaveLength(1);
    expect(selectExcerpts('Analog 서버를 학습합니다.', '배송')).toEqual([]);
  });

  it('uses a fake repository to test cache expiry and invalidation', async () => {
    vi.useFakeTimers();
    const result = { data: [], meta: { page: 1, limit: 10, totalPages: 0, total: 0 } };
    const fetchPosts = vi.fn(async () => result);
    await cachedList('page1', fetchPosts);
    await cachedList('page1', fetchPosts);
    expect(fetchPosts).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    await cachedList('page1', fetchPosts);
    invalidateList();
    await cachedList('page1', fetchPosts);
    expect(fetchPosts).toHaveBeenCalledTimes(3);
  });
});
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 2–25행 같은 기초 DB 상태에서 각각의 동작을 확인한다. 매 테스트에 휘발성 SQLite와 seed 사용자를 준비한다. 캐시와 DB를 닫고 실시간 타이머를 복원한다.
- 27–34행 부분 수정 후 태그와 검색 escaping을 검사한다.
- 36–43행 권한과 연쇄 삭제를 검사한다.
- 45–52행 해시 salt와 발췌 조건을 검사한다.
- 54–67행 가짜 조회 함수와 테스트 타이머로 캐시를 검증한다.

### `lesson/playwright.config.ts` 전체 코드

```typescript
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
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3–7행 독립 테스트 포트를 정한다.
- 8–10행 빌드 서버를 실제로 띄우고 준비 상태를 기다린다.
- 11–25행 운영과 분리된 테스트 쿠키·DB·AI 설정을 주입한다.

## ④ 🔗 연동 포인트

CI가 동일한 typecheck·Vitest·Playwright 흐름을 실행한다. 외부 호출은 AI demo 모드나 의존성을 주입한 fake 함수로 대체한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 1. `EBADENGINE` | Node 버전 부족 | 지원 버전으로 바꾸고 `npm ci`를 실행한다. |
| 2. `EADDRINUSE` | 포트 중복 | `TEST_PORT`를 바꾸거나 점유 프로세스를 종료한다. |
| 3. 404 | 페이지 URL과 API URL 혼동 | Network의 경로와 파일명을 비교한다. |
| 4. 400 | 스키마 오류 또는 JSON 문법 오류 | 응답의 `code`와 `fields`를 확인한다. |
| 5. 401 | 세션 없음·만료 | 다시 로그인하고 쿠키와 만료 시각을 본다. |
| 6. 403 | Origin 또는 작성자 검사 실패 | Origin·`author.id`·현재 사용자 ID를 확인한다. |
| 7. `NODE_MODULE_VERSION` | 다른 Node에서 네이티브 SQLite 설치 | 사용할 Node로 다시 `npm ci`를 실행한다. |
| 8. `localStorage is not defined` | SSR에서 브라우저 API를 사용 | `afterNextRender`로 이동한다. |
| 9. Chromium 실행 실패 | 테스트 브라우저 미설치 | `npx playwright install chromium`을 실행한다. |
| 10. 간헐적 캐시 테스트 실패 | 실제 타이머나 캐시가 테스트 간 공유됨 | 가짜 시계와 `afterEach` 정리를 사용한다. |

## ⑥ 직접 해보기

1. Zod 제약을 잠시 바꿔 Vitest 실패를 본 뒤 되돌린다.
2. `npm run test:e2e -- --grep 'API v1'`로 요청 테스트만 확인한다.
3. 실패 응답의 request ID를 서버 로그에서 검색한다.

## ⑦ ☐ 체크리스트

- [ ] Vitest·Playwright 모두 실행
- [ ] fake 로더와 테스트 DB 격리
- [ ] 자주 나는 10개 오류를 상태 코드와 로그로 분류

## ⑧ 다음 단계

[study10](study10.md)에서 테스트한 서버의 실제 빌드 산출물을 실행한다.

[참고 문서](https://playwright.dev/docs/api-testing)
