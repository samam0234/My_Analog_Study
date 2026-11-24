# study8 · 구조화와 재사용

## ① 목표

공통 타입, 요청 헬퍼, 설정을 분리해 화면과 서버 양쪽의 책임을 구체화한다.

## ② 📖 이론

`routes`는 HTTP를 말하고 `lib`는 저장·검증·인증을 수행한다. `shared`는 응답의 형태만 공유한다. 공통 헬퍼는 여러 위치에서 쓰는 공구함이다. 각 사용처가 같은 오류 형식과 설정을 받아 코드 중복과 환경별 편차를 줄인다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`src/server/routes/api/posts/[id]/index.patch.ts`에서 인증 → 파라미터와 JSON 검증 → 저장소 → 캐시 무효화 → 응답 순서를 읽는다. 테스트에서는 DB 설정을 함수 인자로 바꿀 수 있다. 로컬은 `.env`, 운영은 Docker Compose 또는 호스트의 환경 설정을 사용하고 운영의 DB 접속 키는 `VITE_`로 시작하는 값에 넣지 않는다.

### `lesson/src/server/lib/config.ts` 전체 코드

```typescript
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Knex } from 'knex';

export function databaseConfig(env = process.env): Knex.Config {
  const client = env['DB_CLIENT'] || 'better-sqlite3';
  if (client === 'better-sqlite3') {
    const filename = env['SQLITE_PATH'] || './data/board.sqlite';
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    return {
      client,
      connection: { filename },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        afterCreate(connection: { pragma: (sql: string) => void }, done: (error: Error | null, connection?: unknown) => void) {
          connection.pragma('foreign_keys = ON');
          connection.pragma('busy_timeout = 5000');
          done(null, connection);
        },
      },
    };
  }
  if (!['pg', 'mysql2'].includes(client) || !env['DATABASE_URL']) {
    throw new Error('Set DB_CLIENT and DATABASE_URL together');
  }
  return { client, connection: env['DATABASE_URL'], pool: { min: 0, max: 5 } };
}

export function appOrigin(): string {
  const configured = process.env['APP_ORIGIN'];
  if (!configured && process.env['NODE_ENV'] === 'production') {
    throw new Error('APP_ORIGIN is required in production');
  }
  return new URL(configured || 'http://localhost:5173').origin;
}

export function sessionSecret(): Uint8Array {
  const secret = process.env['APP_SECRET'];
  if (!secret || secret.length < 32) throw new Error('APP_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(secret);
}
```

- 1–3행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 5–6행 환경 설정을 Knex 연결 형태로 변환한다.
- 7–16행 파일 기반 DB의 경로와 연결 수를 제한한다.
- 17–24행 SQLite FK 검사와 사용 중 대기 시간을 설정한다.
- 25–29행 지원 엔진과 DB URL을 검사한다.
- 31–37행 운영 Origin 누락을 오류로 처리한다.
- 39–43행 서명 키를 바이트로 변환한다.

### `lesson/src/shared/contract.ts` 전체 코드

```typescript
export interface Author {
  id: number;
  nickname: string;
}

export interface User extends Author {
  email: string;
}

export interface PostSummary {
  id: number;
  title: string;
  author: Author;
  commentCount: number;
  createdAt: string;
}

export interface Post extends PostSummary {
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface Comment {
  id: number;
  body: string;
  author: Author;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  q?: string;
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  requestId: string;
}
```

- 1–4행 작성자 공개 필드를 정의한다.
- 6–8행 공개 글 작성자 타입에 내 계정 정보를 더한다.
- 10–16행 목록용 축약 DTO를 정의한다.
- 18–22행 상세에만 본문·태그·수정 시각을 담는다.
- 24–29행 공개 댓글 응답을 선언한다.
- 31–37행 목록의 메타 기본 필드를 정의한다.
- 39–44행 서버와 브라우저가 같은 오류 키를 사용한다.

### `lesson/src/server/routes/api/posts/[id]/index.patch.ts` 전체 코드

```typescript
import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/auth';
import { database } from '../../../../lib/db';
import { api, json, resourceId } from '../../../../lib/http';
import { editPost } from '../../../../lib/posts';
import { patchSchema } from '../../../../lib/schemas';
import { invalidateList } from '../../../../lib/notifications';
export default api(async (event) => {
  const { id } = await requireUser(event);
  const data = await editPost(await database(), resourceId(getRouterParam(event, 'id')), id, await json(event, patchSchema));
  invalidateList();
  return { data };
});
```

- 1–7행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 8행 공통 래퍼로 요청을 처리한다.
- 9행 변경 주체를 확인한다.
- 10행 ID와 요청 내용을 검증해 저장소 함수에 넘긴다.
- 11–13행 성공 후 캐시 세대를 갱신한다.

## ④ 🔗 연동 포인트

설정 주입은 study9 테스트 DB를 분리하고 study11에서 DB 드라이버를 바꿀 수 있게 한다. DTO는 OpenAPI와 화면 요청의 검증 기준이다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| SSR에 서버 모듈이 포함됨 | 화면이 서버 라이브러리를 런타임 import | `src/shared`의 타입만 가져오고 `import type`을 쓴다. |
| 로컬에서만 로그인 성공 | 운영 Origin 또는 비밀 키를 누락 | 프로세스 환경을 확인하고 `/api/ready`와 인증을 검증한다. |

## ⑥ 직접 해보기

1. POST·PATCH에서 공통 래퍼를 사용하는 줄을 각각 찾는다.
2. 테스트에서 `databaseConfig({ SQLITE_PATH: ':memory:' })`를 호출해 로컬 데이터를 분리한다.

## ⑦ ☐ 체크리스트

- [ ] 설정·DTO·저장·전송 코드의 책임 설명
- [ ] 운영과 개발의 시크릿 분리
- [ ] 기존 페이지와 API가 같은 계약 유지

## ⑧ 다음 단계

[study9](study9.md)에서 분리한 책임 단위마다 실패 사례를 검사한다.

[참고 문서](https://analogjs.org/docs/features/data-fetching/overview)
