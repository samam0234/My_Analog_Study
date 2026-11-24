# study6 · DB·API 연동

## ① 목표

SQLite에 명세 v1의 글·댓글 CRUD를 저장하고 목록과 단건 응답을 재현한다.

## ② 📖 이론

DB 연결은 서버에서만 보유하며, migration은 테이블 변경 순서를 관리한다. FK는 행 사이에 붙는 주소표이고, 트랜잭션은 관련 변경을 함께 성공하거나 되돌린다. SQL 쿼리 빌더 Knex에 입력은 바인딩하고 출력은 공유 DTO로 직렬화한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

1. `.env`에 `DB_CLIENT=better-sqlite3`, `SQLITE_PATH=./data/board.sqlite`를 지정한다.
2. `/api/ready`를 호출해 스키마를 준비한다. `users`, `sessions`, `posts`, `comments`가 생성된다.
3. `/account`에서 가입하고 로그인한 뒤 `/posts/new`에서 작성한다. `Location`이 반환한 상세 주소로 이동한다.
4. 상세에서 본문을 PATCH하고 댓글을 등록·삭제한다. 마지막으로 글을 삭제하고 GET이 404인지 확인한다.

| 요청 | 성공 | 데이터 |
| --- | --- | --- |
| `GET /api/posts` | 200 | `data[]`와 `meta` 검색·페이지 정보 |
| `GET /api/posts/{id}` | 200 | `data` 상세 |
| `POST /api/posts` | 201 | `data`와 `Location` |
| `PATCH /api/posts/{id}` | 200 | 변경된 단건 |
| `DELETE /api/posts/{id}` | 204 | 빈 본문 |
| `GET/POST /api/posts/{id}/comments` | 200/201 | 댓글 목록/단건 |
| `DELETE /api/comments/{id}` | 204 | 빈 본문 |

### `lesson/src/server/lib/db.ts` 전체 코드

```typescript
import knex, { type Knex } from 'knex';
import { databaseConfig } from './config';

const timestamp = (table: Knex.CreateTableBuilder, name: string) => table.string(name, 24).notNullable();
const userRef = (table: Knex.CreateTableBuilder, name: string) =>
  table.integer(name).unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');

export const migrations: Record<string, Knex.Migration> = {
  '001_board': {
    async up(db) {
      await db.schema.createTable('users', (table) => {
        table.increments('id');
        table.string('email', 254).notNullable().unique();
        table.string('nickname', 40).notNullable();
        table.string('passwordHash', 200).nullable();
      });
      await db.schema.createTable('sessions', (table) => {
        table.string('id', 64).primary();
        userRef(table, 'userId');
        timestamp(table, 'expiresAt');
        table.index('expiresAt');
      });
      await db.schema.createTable('posts', (table) => {
        table.increments('id');
        table.string('title', 200).notNullable();
        table.text('body').notNullable();
        table.text('tags').notNullable();
        userRef(table, 'authorId');
        timestamp(table, 'createdAt');
        timestamp(table, 'updatedAt');
        table.index(['createdAt', 'id']);
      });
      await db.schema.createTable('comments', (table) => {
        table.increments('id');
        table.integer('postId').unsigned().notNullable().references('id').inTable('posts').onDelete('CASCADE');
        userRef(table, 'authorId');
        table.text('body').notNullable();
        timestamp(table, 'createdAt');
        table.index(['postId', 'id']);
      });
    },
    async down(db) {
      for (const name of ['comments', 'posts', 'sessions', 'users']) await db.schema.dropTable(name);
    },
  },
  '002_extensions': {
    async up(db) {
      await db.schema.createTable('oauthAccounts', (table) => {
        table.string('subject', 255).primary();
        userRef(table, 'userId');
      });
      await db.schema.createTable('payments', (table) => {
        table.string('id', 255).primary();
        userRef(table, 'userId');
        timestamp(table, 'createdAt');
      });
      await db.schema.createTable('aiQuestions', (table) => {
        table.increments('id');
        userRef(table, 'userId');
        table.text('question').notNullable();
        table.text('answer').nullable();
        table.integer('inputTokens').nullable();
        table.integer('outputTokens').nullable();
        timestamp(table, 'createdAt');
        table.index(['userId', 'createdAt']);
      });
      await db.schema.createTable('aiDailyUsage', (table) => {
        userRef(table, 'userId');
        table.string('day', 10).notNullable();
        table.integer('requests').notNullable().defaultTo(0);
        table.primary(['userId', 'day']);
      });
    },
    async down(db) {
      for (const name of ['aiDailyUsage', 'aiQuestions', 'payments', 'oauthAccounts']) await db.schema.dropTable(name);
    },
  },
};

export function migrate(db: Knex) {
  return db.migrate.latest({
    migrationSource: {
      getMigrations: async () => Object.keys(migrations).sort(),
      getMigrationName: (name) => String(name),
      getMigration: async (name) => migrations[String(name)],
    },
  });
}

let connection: Knex | undefined;
let ready: Promise<unknown> | undefined;

export async function database(): Promise<Knex> {
  connection ??= knex(databaseConfig());
  ready ??= migrate(connection).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  await ready;
  return connection;
}

export async function insertId(db: Knex, table: string, values: object): Promise<number> {
  if (db.client.config.client === 'pg') {
    const [row] = await db(table).insert(values).returning<{ id: number }[]>('id');
    return row.id;
  }
  const [id] = await db(table).insert(values);
  return Number(id);
}
```

- 1–2행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 4–6행 UTC ISO 문자열을 같은 형식으로 저장한다.
- 8–41행 테이블과 참조 관계를 정해진 순서로 만든다.
- 42–45행 역순으로 의존 테이블을 내린다.
- 46–78행 운영 확장용 테이블을 별도 migration에서 설정한다.
- 80–91행 이름 순으로 미적용 migration을 실행한다.
- 93–101행 DB 풀과 초기화 Promise를 공유한다.
- 103–110행 PostgreSQL returning과 SQLite·MariaDB 결과를 숫자 ID로 맞춘다.

### `lesson/src/server/lib/posts.ts` 전체 코드

```typescript
import type { Knex } from 'knex';
import type { Comment, PageMeta, Post, PostSummary } from '../../shared/contract';
import { insertId } from './db';
import { fail, missing } from './http';
import type { ListQuery, PostInput, PostPatch } from './schemas';

const timestamp = () => new Date().toISOString();

interface PostRow extends Omit<Post, 'author' | 'tags'> {
  authorId: number;
  nickname: string;
  tags: string;
}

function summaries(db: Knex) {
  return db('posts as p').join('users as u', 'u.id', 'p.authorId')
    .select('p.*', 'u.nickname')
    .select(db('comments as c').count('*').whereRaw('?? = ??', ['c.postId', 'p.id']).as('commentCount'));
}

function summary(row: PostRow): PostSummary {
  return {
    id: row.id, title: row.title, author: { id: row.authorId, nickname: row.nickname },
    commentCount: Number(row.commentCount), createdAt: row.createdAt,
  };
}

export async function listPosts(db: Knex, query: ListQuery): Promise<{ data: PostSummary[]; meta: PageMeta }> {
  const { q, page, limit, sort } = query;
  const list = summaries(db);
  const count = db('posts as p').count({ total: '*' });
  if (q) {
    const pattern = '%' + q.toLowerCase().replace(/[!%_]/g, '!$&') + '%';
    for (const builder of [list, count]) {
      builder.whereRaw("LOWER(??) LIKE ? ESCAPE '!' OR LOWER(??) LIKE ? ESCAPE '!'", ['p.title', pattern, 'p.body', pattern]);
    }
  }
  if (sort === '-commentCount') list.orderBy('commentCount', 'desc');
  list.orderBy('p.createdAt', sort === 'createdAt' ? 'asc' : 'desc')
    .orderBy('p.id', sort === 'createdAt' ? 'asc' : 'desc');
  const [rows, [record]] = await Promise.all([list.limit(limit).offset((page - 1) * limit), count]);
  const total = Number(record.total);
  return { data: rows.map(summary), meta: { page, limit, total, totalPages: Math.ceil(total / limit), q } };
}

export async function getPost(db: Knex, id: number): Promise<Post> {
  const row: PostRow | undefined = await summaries(db).where('p.id', id).first();
  if (!row) return missing();
  return { ...summary(row), body: row.body, tags: JSON.parse(row.tags), updatedAt: row.updatedAt };
}

export async function addPost(db: Knex, authorId: number, input: PostInput): Promise<Post> {
  const now = timestamp();
  const id = await insertId(db, 'posts', { ...input, tags: JSON.stringify(input.tags), authorId, createdAt: now, updatedAt: now });
  return getPost(db, id);
}

async function ensureOwner(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  const item = await db(table).where({ id }).first('authorId');
  if (!item) return missing();
  if (item.authorId !== userId) fail(403, 'FORBIDDEN', '작성자만 변경할 수 있습니다.');
}

export async function editPost(db: Knex, id: number, userId: number, patch: PostPatch) {
  return db.transaction(async (trx) => {
    await ensureOwner(trx, 'posts', id, userId);
    const { tags, ...fields } = patch;
    const changed = await trx('posts').where({ id, authorId: userId })
      .update({ ...fields, ...(tags ? { tags: JSON.stringify(tags) } : {}), updatedAt: timestamp() });
    if (!changed) return missing();
    return getPost(trx, id);
  });
}

export async function removeItem(db: Knex, table: 'posts' | 'comments', id: number, userId: number) {
  await ensureOwner(db, table, id, userId);
  if (!(await db(table).where({ id, authorId: userId }).delete())) missing();
}

interface CommentRow {
  id: number;
  body: string;
  authorId: number;
  nickname: string;
  createdAt: string;
}

function commentDto(row: CommentRow): Comment {
  return { id: row.id, body: row.body, author: { id: row.authorId, nickname: row.nickname }, createdAt: row.createdAt };
}

export async function listComments(db: Knex, postId: number, query: ListQuery) {
  await getPost(db, postId);
  const { page, limit } = query;
  const [rows, [record]] = await Promise.all([
    db('comments as c').join('users as u', 'u.id', 'c.authorId').where('c.postId', postId)
      .select('c.*', 'u.nickname').orderBy('c.id').limit(limit).offset((page - 1) * limit),
    db('comments').where({ postId }).count({ total: '*' }),
  ]);
  const total = Number(record.total);
  return { data: rows.map(commentDto), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function addComment(db: Knex, postId: number, authorId: number, body: string): Promise<Comment> {
  return db.transaction(async (trx) => {
    await getPost(trx, postId);
    const createdAt = timestamp();
    const id = await insertId(trx, 'comments', { postId, authorId, body, createdAt });
    const { nickname } = await trx('users').where({ id: authorId }).first('nickname');
    return commentDto({ id, body, authorId, nickname, createdAt });
  });
}
```

- 1–13행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 15–19행 게시물·작성자 JOIN과 댓글 수 쿼리를 만든다.
- 21–26행 목록 출력 필드를 제한한다.
- 28–32행 검색 범위와 페이지를 정하고 총 건수를 조회한다.
- 33–37행 검색어의 와일드카드를 리터럴로 처리한다.
- 38–44행 허용된 정렬과 숫자 ID를 사용해 결과 순서를 안정화한다.
- 46–50행 단건을 찾아 본문·태그를 반환한다.
- 52–56행 작성자와 시각을 넣어 글을 저장한다.
- 58–62행 작성자와 리소스 존재 여부를 확인한다.
- 64–73행 트랜잭션에서 지정한 필드만 바꾼다.
- 75–90행 소유자 조건을 삭제 쿼리에도 건다.
- 92–102행 댓글 목록과 전체 건수를 조회한다.
- 104–112행 부모 글을 확인한 뒤 댓글을 저장한다.

### `lesson/src/server/routes/api/posts/index.post.ts` 전체 코드

```typescript
import { setHeader, setResponseStatus } from 'h3';
import { requireUser } from '../../../lib/auth';
import { database } from '../../../lib/db';
import { api, json } from '../../../lib/http';
import { addPost } from '../../../lib/posts';
import { postSchema } from '../../../lib/schemas';
import { invalidateList, publishPost } from '../../../lib/notifications';
export default api(async (event) => {
  const user = await requireUser(event);
  const data = await addPost(await database(), user.id, await json(event, postSchema));
  invalidateList();
  publishPost(data.id);
  setHeader(event, 'location', '/api/posts/' + data.id);
  setResponseStatus(event, 201);
  return { data };
});
```

- 1–6행 인증·DB·스키마·응답 헬퍼를 조합한다. 새 URL을 Location에 넣는다. 생성 성공 상태를 201로 설정한다.
- 7–8행 변경된 목록의 캐시를 비운다. 실시간 구독자에게 새 글 ID를 전달한다.
- 9행 로그인 사용자를 가져온다.
- 10–16행 유효한 글을 작성자 ID와 함께 저장한다.

## ④ 🔗 연동 포인트

서버 로드와 브라우저가 같은 `/api/posts` 스펙을 쓴다. 환경 변수와 저장소 계층을 분리해 study11에서 PostgreSQL로 전환한다. 오류 모양과 `X-Request-Id`는 study14에서 인터페이스 문서와 대조한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `SQLITE_CANTOPEN` | 경로가 읽기 전용 또는 잘못됨 | `SQLITE_PATH`와 볼륨 쓰기 권한을 확인한다. |
| 204 본문 파싱 오류 | 삭제 성공에도 JSON 파싱을 시도 | 204에서는 빈 응답으로 종료한다. |
| 외래 키 오류 | 부모 글 또는 작성자가 지워짐 | 먼저 대상 리소스와 인증 상태를 다시 불러온다. |

## ⑥ 직접 해보기

1. 글에 태그를 넣고 제목만 PATCH해 태그가 유지되는지 확인한다.
2. 3개의 글을 쓰고 `?q=...&page=1&limit=2&sort=-commentCount`를 확인한다.
3. 글과 댓글을 삭제한 뒤 다시 조회해 404를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] `src/server/routes/api` 아래 API 라우트 (Nitro, h3)
- [ ] API 라우트 응답을 `data`와 `meta` 형태로
- [ ] 오류 응답 `error.code/message/fields`
- [ ] v1 글·댓글 CRUD와 Location·204 확인
- [ ] 연결 정보의 환경변수 분리 확인

## ⑧ 다음 단계

[study7](study7.md)에서 요청자와 수정 권한을 검증한다.

[참고 문서](https://app.notion.com/p/3d6d7dec5e2e8139adbfd36dd506c65e)
