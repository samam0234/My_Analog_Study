# study4 · 라우팅과 요청 처리

## ① 목표

정적·동적·콘텐츠 라우트를 정의하고 게시물 목록을 서버에서 로드한다.

## ② 📖 이론

`index.page.ts`는 디렉터리의 대표 URL, `[id].page.ts`는 한 경로 조각을 받는 동적 페이지, `[...missing].page.ts`는 남은 경로를 받는 페이지다. `.server.ts`의 `load`가 SSR과 화면 전환 중 서버에서 목록을 준비하고 `injectLoad`가 로드 결과를 읽는다. 프런트 경로는 안내 데스크, `/api`는 자료를 보내는 창구에 비유할 수 있다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`/posts?q=Analog&page=1&limit=10`을 연 뒤 Network 응답의 HTML에 목록이 있는지 확인한다. 카드 버튼은 `/posts/{id}`로, `ActivatedRoute`의 `paramMap`은 `GET /api/posts/{id}`로 연결된다. `/blog/welcome`은 저장소의 Markdown route이며 `/없는주소`는 화면 오류 페이지다. API는 `/api/posts/99999`에 JSON 404, `/api/posts/문자`에 JSON 400을 응답한다.

### `lesson/src/app/pages/posts/index.server.ts` 전체 코드

```typescript
import type { PageServerLoad } from '@analogjs/router';
import type { PageMeta, PostSummary } from '../../../shared/contract';

export async function load({ event, fetch }: PageServerLoad) {
  const incoming = new URL(event.path, 'http://localhost');
  const query = new URLSearchParams();
  for (const key of ['q', 'page', 'limit', 'sort']) {
    const value = incoming.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  try {
    const result = await fetch<{ data: PostSummary[]; meta: PageMeta }>('/api/posts?' + query.toString());
    return { result };
  } catch {
    return { issue: '목록을 불러오지 못했습니다. 검색 조건을 확인하고 다시 시도하세요.' };
  }
}
```

- 1–4행 Analog의 서버 로드 요청 타입을 지정한다.
- 5–6행 요청의 경로와 쿼리를 파싱한다.
- 7–11행 목록 API에 정의된 쿼리만 전달한다.
- 12–13행 Nitro 내부 호출로 게시물 목록을 얻는다.
- 14–17행 사용자에게 목록 실패를 텍스트로 표시한다.

### `lesson/src/app/pages/posts/index.page.ts` 전체 코드

```typescript
import { Component, afterNextRender, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { injectLoad } from '@analogjs/router';
import { PostCard } from '../../board/post-card';
import { Session } from '../../core/session';
import type { load } from './index.server';

@Component({
  imports: [PostCard, RouterLink],
  template: `
    <div class="page-heading">
      <h1>게시판</h1>
      @if (session.user()) { <a class="button" routerLink="/posts/new">글 작성</a> }
      @else { <a class="plain-link" routerLink="/account">로그인하여 글 작성</a> }
    </div>
    <form class="toolbar" action="/posts" method="get">
      <label>검색 <input name="q" [value]="loaded().result?.meta?.q ?? ''" placeholder="제목 또는 본문" maxlength="200"></label>
      <label>정렬 <select name="sort"><option value="-createdAt">최신순</option><option value="createdAt">오래된 순</option><option value="-commentCount">댓글 순</option></select></label>
      <button type="submit">검색</button>
    </form>
    @if (loaded().result; as result) {
      <p class="muted">글 {{ result.meta.total }}개</p>
      <div class="panel">
        @for (post of result.data; track post.id) {
          <board-post-card [post]="post" (selected)="open($event)" />
        } @empty { <p>표시할 글이 없습니다.</p> }
      </div>
      <nav class="pagination" aria-label="페이지">
        @if (result.meta.page > 1) {
          <a [href]="pageLink(result.meta.page - 1)">이전</a>
        }
        <span>{{ result.meta.page }} / {{ result.meta.totalPages || 1 }}</span>
        @if (result.meta.page < result.meta.totalPages) {
          <a [href]="pageLink(result.meta.page + 1)">다음</a>
        }
      </nav>
    } @else { <p role="alert">{{ loaded().issue }}</p> }
  `,
})
export default class PostsPage {
  private readonly router = inject(Router);
  readonly session = inject(Session);
  readonly loaded = toSignal(injectLoad<typeof load>(), { requireSync: true });

  constructor() {
    afterNextRender(() => { void this.session.refresh().catch(() => undefined); });
  }

  open(id: number) { void this.router.navigate(['/posts', id]); }

  pageLink(page: number) {
    const query = this.router.parseUrl(this.router.url).queryParams;
    return '/posts?' + new URLSearchParams({ ...query, page: String(page) });
  }
}
```

- 1–3행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 4–16행 서버 로드 API를 연결한다.
- 17–24행 검색과 정렬을 GET 쿼리로 보낸다.
- 25–29행 목록 DTO를 카드로 출력한다.
- 30–43행 페이지 번호와 링크 표시 조건을 비교한다.
- 44–48행 서버에서 먼저 준비한 값을 Signal로 읽는다.
- 50행 카드 이벤트를 상세 라우트에 연결한다.
- 52–56행 현재 쿼리를 유지하며 페이지 번호를 갱신한다.

### `lesson/src/app/pages/[...missing].page.ts` 전체 코드

```typescript
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `<h1>페이지를 찾을 수 없습니다</h1><a routerLink="/">홈으로 돌아가기</a>`,
})
export default class MissingPage {}
```

- 1–5행 화면과 홈 링크 의존성을 선언한다.
- 6–7행 없는 웹 경로의 안내와 재진입 링크를 보여 준다.
- 8행 catch-all 페이지의 진입점을 제공한다.

### `lesson/src/app/pages/blog/welcome.md` 전체 코드

```markdown
---
title: Analog 게시판에 오신 것을 환영합니다
---

# Analog 게시판에 오신 것을 환영합니다

이 글은 저장소의 Markdown에서 생성됩니다. 게시판의 글과 댓글은 데이터베이스에 저장되고, 이 안내 글은 빌드 시에 HTML로 만들어집니다.

[게시판으로 이동](/posts)
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 2–3행 front matter에서 제목을 정의한다.
- 5–7행 본문을 Markdown으로 작성한다.
- 9행 콘텐츠 화면에서 동적 화면으로 이동한다.

## ④ 🔗 연동 포인트

공용 목록 조회는 서버 `load`와 API의 기준을 한 곳에 둔다. 상세·작성·댓글은 `/api/posts`를 사용한다. 블로그는 study10에서 빌드 시 HTML로 생성한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 카드는 보이는데 상세 400 | URL에 숫자가 아닌 ID를 전달 | 부모 라우터가 `post.id` 숫자를 전달하는지 확인한다. |
| `/api` 요청에 HTML | 클라이언트에서 `/posts`와 `/api/posts`를 혼동 | Network의 Request URL과 `Content-Type`을 확인한다. |
| 빈 SSR 목록 | API 오류 또는 DB 미준비 | `/api/ready`와 `/api/posts`를 직접 열고 서버 로그를 점검한다. |

## ⑥ 직접 해보기

1. 검색을 실행한 뒤 페이지 링크에 `q`와 `sort`가 남는지 확인한다.
2. 블로그 Markdown에 링크를 추가하고 `/blog/welcome`을 새로고침한다.
3. 없는 화면 주소와 없는 API 주소의 응답 타입을 관찰한다.

## ⑦ ☐ 체크리스트

- [ ] `src/app/pages` 파일 기반 라우팅 (목록, 상세 동적 라우트)
- [ ] `.server.ts` 서버 load 함수로 게시판 목록 불러오기
- [ ] 마크다운 콘텐츠 라우트로 블로그 한 장
- [ ] 검색·페이지 이동·404 응답 확인

## ⑧ 다음 단계

[study5](study5.md)에서 폼이 라우트를 통해 서버 검증을 요청한다.

[참고 문서](https://analogjs.org/docs/features/data-fetching/server-side-data-fetching)
