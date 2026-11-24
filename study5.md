# study5 · 폼·입력·검증

## ① 목표

브라우저 입력과 서버 검증을 연결하고 200·400·422를 구분해 표시한다.

## ② 📖 이론

브라우저 폼 검사는 즉각적인 피드백이고 서버 스키마는 저장 직전의 규칙이다. 두 출입구에 체크가 있는 접수 창구처럼 화면과 API 양쪽을 확인한다. `pending` 플래그와 버튼 비활성화는 같은 화면의 연속 클릭을 막는다. 네트워크 재시도로 중복을 막아야 하는 별도 기능에서는 요청에 멱등 키와 DB 고유 제약을 설계한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`/practice`에서 제목과 본문을 채우면 200, 제목을 공백으로 보내면 422다. DevTools Network에서 요청을 복사해 본문을 깨진 JSON `{`로 바꾸면 400이다. CLI에서는 아래처럼 Origin을 포함한다. 게시판 작성의 v1 검증 실패는 Notion 명세대로 400이며 실습용 `/api/practice/validate`의 422와 분리된다.

```powershell
curl.exe -i -X POST http://localhost:5173/api/practice/validate -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' --data-binary '{'
```

### `lesson/src/server/routes/api/practice/validate.post.ts` 전체 코드

```typescript
import { api, json } from '../../../lib/http';
import { postSchema } from '../../../lib/schemas';
export default api(async (event) => ({ data: await json(event, postSchema, 422) }));
```

- 1행 공통 래퍼와 JSON 검증을 가져온다.
- 2행 게시물 입력 규칙을 재사용한다.
- 3행 정상 200 또는 스키마 오류 422로 응답한다.

### `lesson/src/server/lib/schemas.ts` 전체 코드

```typescript
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('이메일 형식을 확인하세요.').max(254);
const password = z.string().min(10, '비밀번호는 10자 이상이어야 합니다.').max(128);
export const signupSchema = z.object({ email, password, nickname: z.string().trim().min(1).max(40) });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
const postFields = {
  title: z.string().trim().min(1, '제목을 입력하세요.').max(200),
  body: z.string().trim().min(1, '본문을 입력하세요.').max(10_000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
};
export const postSchema = z.object(postFields).strict();
export const patchSchema = z.object({ ...postFields, tags: postFields.tags.removeDefault() })
  .partial().strict().refine((value) => Object.keys(value).length > 0, '수정할 필드를 보내세요.');
export const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const positive = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
export const listSchema = z.object({
  page: positive.optional().transform((value) => value ?? 1),
  limit: positive.optional().transform((value) => Math.min(value ?? 10, 50)),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['createdAt', '-createdAt', '-commentCount']).default('-createdAt'),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), '페이지 범위를 줄이세요.');
export type ListQuery = z.output<typeof listSchema>;
export type PostInput = z.output<typeof postSchema>;
export type PostPatch = z.output<typeof patchSchema>;
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3–6행 이메일과 비밀번호 제약을 선언한다.
- 7–11행 제목과 본문을 trim하고 길이를 확인한다.
- 12행 예상하지 않은 필드를 거부한다.
- 13–15행 선택 필드 변경을 허용하고 빈 패치를 거부한다.
- 16행 페이지 번호에 양의 정수 규칙을 적용한다.
- 17–25행 목록 기본값과 정렬 범위를 지정한다.

### `lesson/src/app/core/api.ts` 전체 코드

```typescript
import type { ApiError } from '../../shared/contract';

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly problem?: ApiError) {
    super(problem?.message || '요청에 실패했습니다 (' + status + ').');
  }
}

export async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (typeof options.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const result = await response.json().catch(() => undefined) as { error?: ApiError } | undefined;
    throw new ApiFailure(response.status, result?.error);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const explain = (error: unknown) => error instanceof Error ? error.message : '요청을 완료할 수 없습니다.';
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3–9행 HTTP 상태와 오류 객체를 담는 오류 타입을 만든다.
- 10–13행 요청 헤더를 복사한 뒤 필요한 Content-Type을 붙인다.
- 14행 동일 출처에 있는 인증 쿠키로 요청한다.
- 15–18행 실패 본문을 구조화된 오류로 바꾼다.
- 19–22행 빈 응답은 JSON 파싱을 건너뛴다.

## ④ 🔗 연동 포인트

서버에서 만든 `error.fields`는 `ApiFailure`에 들어가 실습 화면과 실제 편집기에 표시된다. 다음 단계에서는 검증된 데이터를 DB로 넘긴다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 400 `BAD_REQUEST` | 본문이 깨진 JSON이거나 Content-Type이 틀림 | Network Payload를 확인하고 직렬화한 JSON을 보낸다. |
| 422 `VALIDATION_ERROR` | 필수 필드가 비었거나 길이 규칙 위반 | 응답의 `fields`를 읽고 해당 입력을 수정한다. |
| 요청이 두 번 발생 | 두 이벤트가 같은 submit을 호출하거나 재시도가 켜짐 | submit 진입 가드와 서버의 멱등 정책을 점검한다. |

## ⑥ 직접 해보기

1. Network에서 200·400·422 응답을 기록한다.
2. 제목을 201자로 채우고 필드 오류를 확인한다.
3. 검증 버튼을 빠르게 두 번 눌러 중복 요청이 막히는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 브라우저 입력이 JSON 요청으로 전달
- [ ] 200·400·422 동작 확인
- [ ] 오류와 pending 상태가 화면에 표시

## ⑧ 다음 단계

[study6](study6.md)에서 같은 검증 결과를 영속 저장한다.

[참고 문서](https://analogjs.org/docs/features/api/overview)
