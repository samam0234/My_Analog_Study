# study14 · REST API 설계와 OpenAPI

## ① 목표

v1 명세를 Swagger UI로 탐색하고 페이징·오류·v2 변경 경계를 설계한다.

## ② 📖 이론

리소스 이름은 복수 명사와 소문자를 사용하고 동작은 HTTP 메서드가 알려 준다. API 명세는 요청을 넣으면 어떤 결과가 나올지 알려주는 메뉴판이다. 응답 모양이 달라지는 변경은 새 경로에서 제공하고, v1 `/api/posts`는 기존 응답 모양을 지킨다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`/api-docs`에서 Swagger UI를 열고 `/api/openapi.json`의 `openapi: 3.1.0`을 확인한다. `/api/posts`는 명세 v1 경로를 유지하고 `/api/v2/posts`만 `version: 2`와 요청 타이밍 헤더를 제공한다. `page`는 1부터 시작하고 `limit`의 기본값은 10이며 50으로 상한을 둔다. `q`는 제목·본문 부분 일치, `sort`는 `createdAt`, `-createdAt`, `-commentCount` 중 하나다.

```powershell
curl.exe -i 'http://localhost:5173/api/posts?page=2&limit=1&sort=createdAt'
curl.exe -i -H 'X-Request-Id: study14-missing' 'http://localhost:5173/api/posts/99999'
```

### `lesson/src/server/lib/openapi.ts` 전체 코드

```typescript
import { z } from 'zod';
import { commentSchema, loginSchema, patchSchema, postSchema, signupSchema } from './schemas';

const string = { type: 'string' };
const integer = { type: 'integer' };
const nullable = { type: ['string', 'null'] };
const utc = { type: 'string', format: 'date-time' };
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const array = (items: unknown) => ({ type: 'array', items });
const content = (schema: unknown) => ({ 'application/json': { schema } });
const signup = z.toJSONSchema(signupSchema, { io: 'input' });
const login = z.toJSONSchema(loginSchema, { io: 'input' });
const post = z.toJSONSchema(postSchema, { io: 'input' });
const patch = z.toJSONSchema(patchSchema, { io: 'input' });
const comment = z.toJSONSchema(commentSchema, { io: 'input' });
const commonRequestId = { 'X-Request-Id': { schema: string } };
const id = { name: 'id', in: 'path', required: true, schema: { ...integer, minimum: 1 } };
const pagination = [
  { name: 'page', in: 'query', schema: { ...integer, default: 1, minimum: 1 } },
  { name: 'limit', in: 'query', description: '50을 초과하면 50을 적용합니다.', schema: { ...integer, default: 10, minimum: 1 } },
];
const postQuery = [
  ...pagination,
  { name: 'q', in: 'query', schema: { ...string, maxLength: 200 } },
  { name: 'sort', in: 'query', schema: { ...string, enum: ['createdAt', '-createdAt', '-commentCount'], default: '-createdAt' } },
];
const data = (schema: unknown) => object({ data: schema });
const listing = (name: string) => object({ data: array(ref(name)), meta: ref('PageMeta') });

function operation(summary: string, status: number, options: {
  secured?: boolean; body?: object; result?: unknown; parameters?: object[]; location?: boolean;
} = {}) {
  const headers = options.location ? { ...commonRequestId, Location: { schema: string } } : commonRequestId;
  return {
    summary,
    ...(options.secured ? { security: [{ bearerAuth: [] }, { cookieAuth: [] }] } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: { required: true, content: content(options.body) } } : {}),
    responses: {
      [status]: { description: '성공', headers, ...(options.result ? { content: content(options.result) } : {}) },
      default: { description: '공통 오류', headers: commonRequestId, content: content(ref('Error')) },
    },
  };
}

export const openapi = {
  openapi: '3.1.0',
  info: { title: 'Analog Board API', version: '1.0.0' },
  paths: {
    '/health': { get: operation('프로세스 상태', 200, { result: object({ status: string }) }) },
    '/api/auth/signup': { post: operation('회원가입', 201, { body: signup, result: data(ref('User')) }) },
    '/api/auth/login': { post: operation('로그인', 200, { body: login, result: data(object({ user: ref('User'), accessToken: string })) }) },
    '/api/auth/logout': { post: operation('로그아웃', 204, { secured: true }) },
    '/api/auth/me': { get: operation('내 계정', 200, { secured: true, result: data(ref('User')) }) },
    '/api/posts': {
      get: operation('게시물 목록', 200, { parameters: postQuery, result: listing('PostSummary') }),
      post: operation('게시물 작성', 201, { secured: true, body: post, result: data(ref('Post')), location: true }),
    },
    '/api/posts/{id}': {
      get: operation('게시물 상세', 200, { parameters: [id], result: data(ref('Post')) }),
      patch: operation('게시물 부분 수정', 200, { parameters: [id], secured: true, body: patch, result: data(ref('Post')) }),
      delete: operation('게시물 삭제', 204, { parameters: [id], secured: true }),
    },
    '/api/posts/{id}/comments': {
      get: operation('댓글 목록', 200, { parameters: [id, ...pagination], result: listing('Comment') }),
      post: operation('댓글 작성', 201, { parameters: [id], secured: true, body: comment, result: data(ref('Comment')) }),
    },
    '/api/comments/{id}': { delete: operation('댓글 삭제', 204, { secured: true, parameters: [id] }) },
    '/api/v2/posts': { get: operation('게시물 목록 v2', 200, {
      parameters: postQuery, result: object({ data: array(ref('PostSummary')), meta: ref('PageMeta'), version: { const: 2 } }),
    }) },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'analog_session' },
    },
    schemas: {
      Author: object({ id: integer, nickname: string }),
      User: { allOf: [ref('Author'), object({ email: { ...string, format: 'email' } })] },
      PostSummary: object({ id: integer, title: string, author: ref('Author'), commentCount: integer, createdAt: utc }),
      Post: { allOf: [ref('PostSummary'), object({ body: string, tags: array(string), updatedAt: utc })] },
      Comment: object({ id: integer, body: string, author: ref('Author'), createdAt: utc }),
      PageMeta: object({ page: integer, limit: integer, total: integer, totalPages: integer, q: string }, ['page', 'limit', 'total', 'totalPages']),
      Error: object({ error: object({ code: string, message: string, requestId: string,
        fields: { type: 'object', additionalProperties: array(string) },
      }, ['code', 'message', 'requestId']) }),
      QuestionHistory: object({ id: integer, question: string, answer: nullable, createdAt: utc }),
    },
  },
};
```

- 1–7행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 8–11행 스키마 참조를 안정된 이름으로 만든다.
- 12–18행 Zod의 입력 스키마를 OpenAPI JSON Schema로 변환한다.
- 19–22행 공통 페이지 쿼리를 선언한다.
- 23–29행 글 검색과 정렬 파라미터를 추가한다.
- 31–45행 상태, 헤더, 인증, 요청·응답 스키마를 구성한다.
- 47–74행 버전 정보와 v1, v2 API 경로를 선언한다.
- 75–84행 Bearer와 동출처 쿠키를 문서화한다.
- 85행 목록 meta와 선택적인 검색어 구조를 정의한다.
- 86–92행 공통 오류 envelope를 문서화한다.

### `lesson/src/server/lib/http.ts` 전체 코드

```typescript
import { randomUUID } from 'node:crypto';
import {
  defineEventHandler, getHeader, readRawBody, setHeader, setResponseStatus, type H3Event,
} from 'h3';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}

export function requestId(event: H3Event): string {
  const supplied = getHeader(event, 'x-request-id');
  return event.context['requestId'] ??= (
    supplied && /^[A-Za-z0-9_.:-]{1,128}$/.test(supplied) ? supplied : randomUUID()
  );
}

export function api<T>(handler: (event: H3Event) => T | Promise<T>) {
  return defineEventHandler(async (event) => {
    const id = requestId(event);
    setHeader(event, 'x-request-id', id);
    try {
      const response = await handler(event);
      if (response !== undefined && !(response instanceof Response) && !event.node.res.headersSent) {
        setHeader(event, 'content-type', 'application/json; charset=utf-8');
      }
      return response;
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({ level: 'error', requestId: id, errorType: error instanceof Error ? error.name : 'unknown' }));
      }
      const issue = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL', '서버 오류가 발생했습니다.');
      setHeader(event, 'content-type', 'application/json; charset=utf-8');
      setResponseStatus(event, issue.status);
      return { error: { code: issue.code, message: issue.message, fields: issue.fields, requestId: id } };
    }
  });
}

export function validate<T>(schema: ZodType<T>, payload: unknown, status = 400): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (fields[issue.path.join('.') || '_form'] ??= []).push(issue.message);
  }
  throw new HttpError(status, 'VALIDATION_ERROR', '입력값을 확인하세요.', fields);
}

export async function json<T>(event: H3Event, schema: ZodType<T>, status = 400): Promise<T> {
  if (getHeader(event, 'content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fail(400, 'BAD_REQUEST', 'Content-Type은 application/json이어야 합니다.');
  }
  const raw = await readRawBody(event, false);
  if (raw && raw.byteLength > 64 * 1024) return fail(413, 'PAYLOAD_TOO_LARGE', '요청 크기 제한을 초과했습니다.');
  let payload: unknown;
  try {
    payload = JSON.parse(raw?.toString('utf8') ?? '');
  } catch {
    return fail(400, 'BAD_REQUEST', 'JSON 본문을 확인하세요.');
  }
  return validate(schema, payload, status);
}

export function resourceId(raw: unknown): number {
  const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'BAD_REQUEST', '양의 정수 ID가 필요합니다.');
  return id;
}

export const missing = () => fail(404, 'NOT_FOUND', '요청한 항목을 찾을 수 없습니다.');
```

- 1–5행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 7–20행 내부 오류와 전달 가능한 HTTP 오류를 구분한다.
- 22–27행 헤더의 ID를 검증하거나 새 ID를 만든다.
- 29–49행 정상 본문과 오류 본문을 공통 형식으로 보낸다.
- 51–59행 스키마 오류를 필드별 배열로 변환한다.
- 61–74행 엄격한 JSON 파싱으로 문법 오류를 분리한다.
- 76–82행 숫자 파라미터를 검증한다.

## ④ 🔗 연동 포인트

OpenAPI 문서와 Playwright 실제 응답을 대조한다. v2의 캐시 기준과 `Server-Timing`은 study15 학습 경로에 사용한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| Swagger UI 빈 화면 | 로컬 Swagger 자산 준비 누락 | `npm run start` 또는 `npm run build`로 자산 동기화 스크립트를 실행한다. |
| 페이지가 반복됨 | 정렬 동점에서 순서가 달라짐 | 생성 시각 정렬과 ID 보조 정렬을 확인한다. |
| 오류의 requestId와 헤더가 다름 | 중간 계층에서 ID를 재생성 | `requestId(event)`를 재사용한다. |

## ⑥ 직접 해보기

1. Swagger에서 목록과 상세를 실행하고 두 응답의 `data` 모양을 비교한다.
2. 요청 ID를 붙여 404를 호출해 헤더와 오류 본문이 같은지 확인한다.
3. `/api/v2/posts` 응답을 열고 문서에 적힌 차이를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] API 라우트 응답을 `data`와 `meta` 형태로
- [ ] 오류 응답 `error.code/message/fields`
- [ ] `/api-docs` OpenAPI와 실제 HTTP 대조
- [ ] v1 계약과 v2 경로 분리

## ⑧ 다음 단계

[study15](study15.md)에서 캐시와 작업 큐로 응답 속도를 개선한다.

[참고 문서](https://spec.openapis.org/oas/v3.1.0.html)
