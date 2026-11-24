# study2 · 핵심 구조와 컴포넌트

## ① 목표

게시판 페이지, 목록 카드, 글 본문 컴포넌트의 책임과 데이터 흐름을 구분한다.

## ② 📖 이론

페이지는 URL에 연결되는 컨테이너다. Standalone 컴포넌트는 자기 템플릿에 필요한 의존성을 `imports`에 명시한다. `input.required<T>()`는 부모가 넘기는 필수 값이고 `output<T>()`는 자식이 부모에게 알리는 이벤트다. 카드에 내용을 인쇄해 주고, 카드를 선택했을 때 접수 번호를 돌려받는 흐름과 같다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

목록 템플릿의 `<board-post-card [post]="post" (selected)="open($event)" />`를 찾아 본다. 부모가 DTO를 전달하고 카드는 숫자 ID를 emit한다. `open`이 `Router.navigate`를 실행하며 URL이 `/posts/{id}`로 바뀐다. `board-post-view`는 상세 화면이 넘긴 단건 모델로 본문만 렌더링한다.

### `lesson/src/app/board/post-card.ts` 전체 코드

```typescript
import { Component, input, output } from '@angular/core';
import type { PostSummary } from '../../shared/contract';

@Component({
  selector: 'board-post-card',
  template: `
    <article class="post-row">
      <div>
        <button class="title-link" type="button" (click)="selected.emit(post().id)">{{ post().title }}</button>
        <p class="muted">{{ post().author.nickname }} · {{ post().createdAt.slice(0, 10) }}</p>
      </div>
      <span class="muted">댓글 {{ post().commentCount }}</span>
    </article>
  `,
})
export class PostCard {
  readonly post = input.required<PostSummary>();
  readonly selected = output<number>();
}
```

- 1행 입력과 출력에 필요한 API를 가져온다.
- 2–4행 화면 목록용 PostSummary 계약을 읽는다.
- 5–6행 부모가 사용할 태그 이름을 정한다.
- 7–8행 글 한 건을 카드로 표시한다.
- 9–16행 클릭된 글의 ID만 이벤트 데이터로 전달한다.
- 17행 필수 입력을 선언한다.
- 18–19행 부모가 수신하는 숫자 이벤트를 선언한다.

### `lesson/src/app/board/post-view.ts` 전체 코드

```typescript
import { Component, input } from '@angular/core';
import type { Post } from '../../shared/contract';

@Component({
  selector: 'board-post-view',
  template: `
    <h1>{{ post().title }}</h1>
    <p class="muted">{{ post().author.nickname }} · {{ post().createdAt.slice(0, 10) }}</p>
    <p class="prose">{{ post().body }}</p>
    @for (tag of post().tags; track $index) { <span class="tag">#{{ tag }}</span> }
  `,
})
export class BoardPostView {
  readonly post = input.required<Post>();
}
```

- 1–4행 상세 DTO와 컴포넌트 API를 사용한다.
- 5–6행 상세 뷰 템플릿에서 사용할 태그를 정한다.
- 7–9행 제목, 작성자와 본문을 텍스트로 바인딩한다.
- 10–13행 태그 배열을 반복 출력한다.
- 14–15행 상세 응답 타입을 필수 입력으로 선언한다.

## ④ 🔗 연동 포인트

카드의 입력 타입은 공통 API v1 `data` 안의 목록 항목과 일치한다. 선택 이벤트는 API 상세 요청에 필요한 라우트 ID가 된다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `board-post-card is not a known element` | 부모의 `imports`에 PostCard가 없음 | 부모 메타데이터에 PostCard를 추가한다. |
| 필수 입력 오류 | 부모가 `[post]`를 넘기지 않음 | `@for` 내부의 현재 항목을 `[post]`에 연결한다. |

## ⑥ 직접 해보기

1. 카드에 표시되는 날짜 형식을 바꾼다.
2. 카드에서 고른 ID와 상세 페이지 주소가 일치하는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 페이지·카드·본문 책임 설명
- [ ] 입력과 출력이 부모 템플릿에 연결됨
- [ ] 카드 클릭으로 상세 이동 확인

## ⑧ 다음 단계

[study3](study3.md)에서 컴포넌트가 관리하는 브라우저 상태를 저장한다.

[참고 문서](https://angular.dev/guide/components/inputs)
