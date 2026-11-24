# study11 · DB 확장과 마이그레이션

## ① 목표

같은 v1 API가 PostgreSQL과 MariaDB에서 동작하게 하고 MongoDB 문서 모델을 실습한다.

## ② 📖 이론

저장소 API는 일정하고 연결 드라이버와 데이터 이전 절차가 달라진다. Knex는 SQL 쿼리 빌더이고 MongoDB 예제는 공식 드라이버를 사용한다. ORM을 붙일 때도 SQL dialect와 스키마 migration은 함께 지정하고 MongoDB에서는 document schema와 인덱스를 별도로 관리한다. 같은 도서 검색 카드를 쓰되 도서 보관 서가의 주소 체계를 바꾸는 것과 같다.

| 저장소 | 설정 | ID·스키마 |
| --- | --- | --- |
| SQLite | `better-sqlite3`, `SQLITE_PATH` | 파일, `increments`, FK pragma |
| PostgreSQL | `pg`, `postgresql://…` | `RETURNING id`, 시퀀스, 확장 가능 인덱스 |
| MariaDB | `mysql2`, `mysql://…` | `AUTO_INCREMENT`, 문자열 collation과 heap 확인 |
| MongoDB | `MONGODB_URL`, `MongoClient` | `ObjectId`, 컬렉션 인덱스, 관계와 v1 숫자 ID는 명시적으로 매핑 |

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

1. PostgreSQL에서 빈 `board` DB를 준비하고 `DB_CLIENT=pg`, `DATABASE_URL=postgresql://board:<password>@localhost:5432/board`로 준다. `/api/ready`를 호출해 스키마를 적용한다.
2. 기존 SQLite 글과 사용자를 이전하려면 쓰기를 멈추고 원본을 백업한다. 같은 버전으로 대상 스키마를 생성한 뒤 `SQLITE_PATH`와 `TARGET_DATABASE_URL`을 제공하여 아래 스크립트를 실행한다. 대상에 행이 있으면 중단한다. 세션은 이관하지 않아 사용자가 다시 로그인한다.
3. MariaDB도 빈 `board` DB와 UTF-8 문자셋을 준비하고 `DB_CLIENT=mysql2`, `DATABASE_URL=mysql://board:<password>@localhost:3306/board`로 실행한다. 재시작 후 `/api/ready` → 가입·글·댓글을 확인한다. 비밀번호의 URL 예약 문자는 인코딩한다.
4. MongoDB는 `MONGODB_URL`을 준비하고 아래 모델을 별도로 실행한다. v1 게시판 전체를 MongoDB로 바꾸려면 글뿐 아니라 사용자·세션·댓글 저장소와 숫자 ID 매핑을 설계한다.

```powershell
node --env-file-if-exists=.env examples/copy-sqlite-board-to-postgres.mjs
node --env-file-if-exists=.env examples/mongo-post-model.ts
```

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

- 1–5행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 6–7행 환경에서 DB 클라이언트를 선택한다.
- 8–16행 SQLite 파일을 설정한다.
- 17–24행 파일 DB의 무결성 검사를 활성화한다.
- 25–27행 원격 접속 설정을 검증한다.
- 28–43행 원격 연결 수를 제한한다.

### `lesson/examples/copy-sqlite-board-to-postgres.mjs` 전체 코드

```javascript
import knex from 'knex';

const { SQLITE_PATH, TARGET_DATABASE_URL } = process.env;
if (!SQLITE_PATH || !TARGET_DATABASE_URL) throw new Error('Set SQLITE_PATH and TARGET_DATABASE_URL');
const source = knex({
  client: 'better-sqlite3', connection: { filename: SQLITE_PATH, readonly: true, fileMustExist: true },
  useNullAsDefault: true, pool: { min: 1, max: 1 },
});
const target = knex({ client: 'pg', connection: TARGET_DATABASE_URL });
const tables = ['users', 'posts', 'comments', 'oauthAccounts', 'payments', 'aiQuestions', 'aiDailyUsage'];
const serialTables = new Set(['users', 'posts', 'comments', 'aiQuestions']);

try {
  const counts = await target.transaction(async (trx) => {
    await trx.raw('lock table users, posts, comments, sessions, "oauthAccounts", payments, "aiQuestions", "aiDailyUsage" in exclusive mode');
    const result = {};
    for (const table of tables) {
      const [{ count }] = await trx(table).count('* as count');
      if (Number(count)) throw new Error('Target table is not empty: ' + table);
      let offset = 0;
      const key = serialTables.has(table) || ['payments'].includes(table) ? ['id'] :
        (table === 'oauthAccounts' ? ['subject'] : ['userId', 'day']);
      while (true) {
        const rows = await source(table).select('*').orderBy(key).limit(100).offset(offset);
        if (!rows.length) break;
        await trx(table).insert(rows);
        offset += rows.length;
      }
      if (serialTables.has(table)) {
        await trx.raw("select setval(pg_get_serial_sequence(?, 'id'), coalesce(max(id), 1), count(*) > 0) from ??",
          [trx.ref(table).toQuery(), table]);
      }
      result[table] = offset;
    }
    return result;
  });
  console.log(counts);
} finally {
  await Promise.all([source.destroy(), target.destroy()]);
}
```

- 1–4행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 5–9행 원본 파일을 읽기 전용으로 연결한다.
- 10–13행 참조 관계 순서로 옮길 테이블을 정한다.
- 14행 대상 전체를 하나의 트랜잭션으로 갱신한다.
- 15–22행 다른 쓰기와 동시에 실행되지 않도록 잠근다.
- 23–29행 백 단위로 원본 행을 읽어 넣는다.
- 30–37행 명시적으로 복사한 ID 뒤로 시퀀스를 맞춘다.
- 38–40행 성공과 실패 모두 DB 풀을 닫는다.

### `lesson/examples/mongo-post-model.ts` 전체 코드

```typescript
import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient(process.env['MONGODB_URL'] || 'mongodb://127.0.0.1:27017');
const posts = client.db('analog_study').collection<{ title: string; createdAt: Date; tags: string[] }>('posts');

try {
  await client.connect();
  await posts.createIndex({ createdAt: -1, _id: -1 });
  const { insertedId } = await posts.insertOne({ title: 'MongoDB 실습', createdAt: new Date(), tags: ['study11'] });
  await posts.updateOne({ _id: new ObjectId(insertedId) }, { $set: { title: '수정한 실습 글' } });
  console.log(await posts.findOne({ _id: insertedId }));
  await posts.deleteOne({ _id: insertedId });
} finally {
  await client.close();
}
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3행 환경 URI로 드라이버를 구성한다.
- 4–7행 게시물의 타입과 컬렉션을 정한다.
- 8행 최신 목록용 인덱스를 만든다.
- 9행 ObjectId를 생성한다.
- 10행 문서의 필요한 속성만 바꾼다.
- 11행 그 ID로 수정 결과를 읽는다.
- 12–15행 실습용 문서를 정리한다.

## ④ 🔗 연동 포인트

PostgreSQL을 final Compose에 연결한다. API DTO는 그대로 유지하고 DB마다 정렬·FK·충돌 처리 테스트를 반복한다. DB용 호스트 시크릿과 운영 볼륨을 CI/CD에서 주입한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `ECONNREFUSED` | 컨테이너 내부에서 `localhost`를 DB로 사용 | Compose 앱은 `db:5432`를 사용한다. |
| ID 중복/시퀀스 오류 | 기존 번호를 삽입 후 시퀀스 미갱신 | 이전 스크립트 후 INSERT로 다음 ID를 확인한다. |
| Mongo ObjectId를 v1 숫자 ID로 반환 | HTTP 계약 타입이 저장 타입으로 바뀜 | 별도 증가 ID 또는 계약 버전을 설계한다. |

## ⑥ 직접 해보기

1. PostgreSQL과 MariaDB에서 `/api/posts?sort=-commentCount`를 각각 호출한다.
2. 복사한 PostgreSQL에 새 글을 생성해 기존 ID보다 큰지 확인한다.
3. Mongo 스크립트의 조회 결과에서 `_id`와 `createdAt` 타입을 확인한다.

## ⑦ ☐ 체크리스트

- [ ] PostgreSQL·MariaDB 연결과 schema 적용
- [ ] SQLite 백업과 PostgreSQL 행·시퀀스 확인
- [ ] MongoDB 문서 CRUD와 타입 차이 확인

## ⑧ 다음 단계

[study12](study12.md)에서 DB와 분리된 화면에 UI와 폼 라이브러리를 붙인다.

[참고 문서](https://knexjs.org/guide/)
