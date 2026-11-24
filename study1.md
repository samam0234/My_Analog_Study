# study1 · Hello World와 기본 문법

## ① 목표

파일 라우트에서 첫 페이지를 띄우고 Hello API의 JSON을 읽는다.

## ② 📖 이론

템플릿은 컴포넌트 데이터를 HTML로 표현한다. `{{ name }}`은 텍스트 보간, `[disabled]`는 DOM 속성, `(click)`은 브라우저 이벤트 바인딩이다. Signal은 값과 그 값이 필요한 화면을 연결하는 스위치로 생각하면 된다. `@if`는 조건부 렌더링, `@for`는 컬렉션 순회에 쓴다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`npm run start` 후 `/`, `/practice`, `/api/v1/hello`를 각각 연다. `src/app/pages/index.page.ts`의 `<h1>` 문구를 저장하면 브라우저에서 바뀐 화면을 볼 수 있다. 개발자도구 Elements에서 `<h1>`, Network에서 `hello`의 Response와 Status를 확인한다. `/practice`의 `{{ greeting() }}`와 `(click)`을 같이 읽는다.

### `lesson/src/app/pages/index.page.ts` 전체 코드

```typescript
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `
    <section class="hero">
      <h1>Analog 게시판</h1>
      <p>글을 기록하고, 댓글로 이야기하고, 문장 속에서 답을 찾아보세요.</p>
      <a class="button" routerLink="/posts">게시판 열기</a>
      <a class="plain-link" routerLink="/blog/welcome">블로그 읽기</a>
    </section>
  `,
})
export default class HomePage {}
```

- 1행 컴포넌트 데코레이터를 불러온다.
- 2행 페이지 링크 디렉티브를 불러온다.
- 4행 해당 페이지의 메타데이터를 정의한다.
- 5–6행 템플릿에서 RouterLink를 사용할 수 있게 한다.
- 7–14행 홈 화면의 제목과 이동 경로를 구성한다.
- 15행 Analog가 파일 경로에서 컴포넌트를 로드한다.

### `lesson/src/server/routes/api/v1/hello.ts` 전체 코드

```typescript
import { api } from '../../../lib/http';
export default api(() => ({ data: { message: 'Hello, Analog!' } }));
```

- 1행 공통 요청 ID와 오류 래퍼를 가져온다.
- 2행 JSON으로 반환할 값을 handler에 전달한다.

## ④ 🔗 연동 포인트

Vite가 화면 편집을 감지하고 Nitro의 API 응답은 Network 탭에서 독립적으로 검사할 수 있다. study2에서 페이지의 코드 일부를 독립 컴포넌트로 뺀다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Cannot match any routes` | 페이지 파일 이름에 `.page.ts`가 빠짐 | 파일명과 실제 URL을 확인한다. |
| 버튼을 눌러도 문구가 그대로 | 이벤트에 함수가 연결되지 않음 | `(click)`의 메서드가 클래스에 있고 호출되는지 확인한다. |

## ⑥ 직접 해보기

1. 홈 제목을 바꾸고 HMR 또는 자동 새로고침 시 Network 이벤트를 확인한다.
2. Hello API의 문구를 바꿔 Elements의 HTML과 Network의 JSON을 각각 확인한다.

## ⑦ ☐ 체크리스트

- [ ] 홈·실습 페이지와 Hello JSON 확인
- [ ] 보간·속성·이벤트 바인딩 차이 설명
- [ ] Elements와 Network에서 변경 확인

## ⑧ 다음 단계

[study2](study2.md)에서 화면 조각 사이의 데이터 이동을 구현한다.

[참고 문서](https://analogjs.org/docs/features/routing/overview)
