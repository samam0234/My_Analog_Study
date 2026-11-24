# study15 · 성능·캐시·비동기 작업

## ① 목표

목록 캐시와 메일 작업 큐를 연결하고 같은 조건의 응답 시간을 비교한다.

## ② 📖 이론

TTL 캐시는 최근 결과를 짧게 재사용한다. 무효화는 쓰기 이후 오래된 값을 폐기한다. 작업 큐는 메일처럼 기다릴 필요가 없는 일을 접수 번호와 함께 맡기는 역할을 한다. Promise는 요청을 비동기로 기다릴 수 있게 하고 지속형 작업 큐는 재시도와 실행 결과를 분리한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

1. 글 20개 이상을 준비하고 같은 쿼리로 `/api/posts`와 `/api/v2/posts`를 반복 호출한다.
2. Network의 `Server-Timing`과 아래 `time_total`을 기록한다. v2의 첫 호출, 5초 이내 재요청, 글 수정 직후 요청을 따로 비교한다.
3. Redis를 켜고 `/lab`에서 환영 메일을 누른다. HTTP 202가 발송보다 먼저 반환되고 Mailpit에서 발송 결과 확인이 가능하다.
4. 부하 테스트는 운영 트래픽과 분리된 로컬에서 수행한다. 같은 표본과 동시성으로 p50·p95, 오류율, DB 응답 시간을 기록한다.

```powershell
1..10 | ForEach-Object { curl.exe -s -o NUL -w '%{time_total}\n' 'http://localhost:5173/api/v2/posts?limit=10' }
```

### `lesson/src/server/lib/notifications.ts` 전체 코드

```typescript
import type { PostSummary, PageMeta } from '../../shared/contract';
type List = { data: PostSummary[]; meta: PageMeta };
const cache = new Map<string, { value: List; until: number }>();
const listeners = new Set<(id: number) => void>();
let generation = 0;

export async function cachedList(key: string, load: () => Promise<List>): Promise<List> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const version = generation;
  const value = await load();
  if (version === generation) {
    if (cache.size >= 100) cache.clear();
    cache.set(key, { value, until: Date.now() + 5_000 });
  }
  return value;
}

export function invalidateList() {
  generation++;
  cache.clear();
}

export function subscribePosts(listener: (id: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishPost(id: number) {
  for (const listener of listeners) listener(id);
}
```

- 1–2행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 3–4행 쿼리 키와 만료 시간으로 공개 목록 캐시를 유지한다.
- 5행 쓰기 중에 시작한 이전 조회가 캐시를 덮어쓰지 않게 한다.
- 7–12행 캐시 적중과 누락을 분리한다.
- 13–17행 학습용 메모리 캐시의 크기를 제한한다.
- 19–22행 게시물·댓글 변경 뒤 원본과 동기화한다.
- 24–31행 실시간 구독을 등록하고 해제 함수를 돌려준다.

### `lesson/src/server/routes/api/v2/posts.get.ts` 전체 코드

```typescript
import { getQuery, setHeader } from 'h3';
import { api, validate } from '../../../lib/http';
import { database } from '../../../lib/db';
import { listPosts } from '../../../lib/posts';
import { listSchema } from '../../../lib/schemas';
import { cachedList } from '../../../lib/notifications';
export default api(async (event) => {
  const query = validate(listSchema, getQuery(event));
  const started = performance.now();
  const result = await cachedList(JSON.stringify(query), async () => listPosts(await database(), query));
  setHeader(event, 'server-timing', 'posts;dur=' + (performance.now() - started).toFixed(2));
  return { ...result, version: 2 };
});
```

- 1–5행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 6–7행 메모리 캐시가 없으면 DB를 조회한다.
- 8행 검증 결과를 캐시 키로 사용할 수 있게 정규화한다.
- 9–10행 핸들러 처리 시간을 측정한다.
- 11–13행 브라우저가 읽을 시간을 헤더에 붙인다.

### `lesson/src/server/plugins/mail-worker.ts` 전체 코드

```typescript
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
```

- 1–2행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 4행 Nitro worker 생명주기를 등록한다.
- 5–8행 운영에 주입된 Redis와 SMTP 설정을 읽는다.
- 9행 메일을 HTTP 응답과 분리해 처리한다.
- 10–11행 실패 종류와 작업 ID만 로그에 기록한다.
- 12–13행 종료 전에 worker를 닫는다.

## ④ 🔗 연동 포인트

캐시와 WebSocket 이벤트는 현재 서버 인스턴스 범위다. 인스턴스를 늘릴 때 Redis 캐시·pub/sub와 통합한다. 큐 실패를 운영 로그와 연결하고 반복 메일의 업무상 중복 여부는 별도 키로 추적한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 수정 직후 목록이 이전 값 | 쓰기 경로에서 캐시 무효화 누락 | 글과 댓글을 갱신하는 API의 invalidate 호출을 확인한다. |
| 메일이 retry를 반복 | SMTP 접근 또는 인증 실패 | 오류 로그, 큐 상태와 SMTP 연결을 점검한다. |
| 첫 요청만 느림 | 초기 DB 연결과 모듈 로딩 포함 | 콜드 스타트와 후속 요청을 별도 측정한다. |

## ⑥ 직접 해보기

1. 5초 전후의 `Server-Timing`을 비교한다.
2. 글을 수정한 직후 v2를 조회해 캐시가 무효화되는지 확인한다.
3. Mailpit을 잠시 종료한 뒤 재시도 로그를 보고 다시 실행한다.

## ⑦ ☐ 체크리스트

- [ ] TTL·쓰기 무효화와 처리 시간 측정
- [ ] 큐 202·백그라운드 작업·재시도 확인
- [ ] 다중 인스턴스에서 공유해야 하는 상태 파악

## ⑧ 다음 단계

[study16](study16.md)에서 프로덕션 이미지, 자동 배포, 로그와 백업을 연결한다.

[참고 문서](https://docs.bullmq.io/guide/retrying-failing-jobs)
