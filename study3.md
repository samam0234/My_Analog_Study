# study3 · 데이터와 상태

## ① 목표

Signal 값과 계산된 상태를 바인딩하고 상태를 브라우저에 저장한다.

## ② 📖 이론

`signal`이 쓰기 가능한 원본이고 `computed`는 원본에서 계산한 값이다. `effect`는 저장소처럼 화면 외부의 시스템과 상태를 동기화한다. 장부의 합계를 자동 계산하고 종료 전에 책갈피를 놓는 과정과 비슷하다. 서버 렌더링에는 브라우저 API가 없으므로 저장소 읽기는 `afterNextRender` 뒤에 실행한다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`/practice`의 카운트 버튼을 누른 뒤 새로고침한다. 개발자도구 Application → Local Storage에서 `analog-count`를 확인한다. `[(ngModel)]`은 입력과 필드를 양방향으로 동기화한다.

### `lesson/src/app/pages/practice.page.ts` 전체 코드

```typescript
import { Component, afterNextRender, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiFailure, call, explain } from '../core/api';

@Component({
  imports: [FormsModule],
  template: `
    <h1>{{ greeting() }}</h1>
    <section class="panel stack">
      <h2>브라우저 상태</h2>
      <p>카운트 {{ count() }} · 두 배 {{ doubled() }}</p>
      <button type="button" [disabled]="!browserReady()" (click)="count.update(increment)">1 추가</button>
    </section>
    <section class="panel stack">
      <h2>검증 응답</h2>
      <form class="stack" (ngSubmit)="submit()">
        <label>제목 <input name="title" [(ngModel)]="title"></label>
        <label>본문 <textarea name="body" [(ngModel)]="body"></textarea></label>
        <button [disabled]="pending()">{{ pending() ? '전송 중…' : '검증' }}</button>
      </form>
      <p role="status">{{ result() }}</p>
    </section>
  `,
})
export default class PracticePage {
  readonly count = signal(0);
  readonly doubled = computed(() => this.count() * 2);
  readonly greeting = signal('Hello, Analog!');
  readonly browserReady = signal(false);
  readonly pending = signal(false);
  readonly result = signal('');
  readonly increment = (value: number) => value + 1;
  title = '';
  body = '';

  constructor() {
    afterNextRender(() => {
      try {
        const value = Number(localStorage.getItem('analog-count'));
        this.count.set(Number.isSafeInteger(value) && value >= 0 ? value : 0);
      } catch { /* Browser storage can be unavailable. */ } finally {
        this.browserReady.set(true);
      }
    });
    effect(() => {
      if (this.browserReady()) {
        const count = this.count();
        try { localStorage.setItem('analog-count', String(count)); }
        catch { /* Browser may disallow storage. In-memory state still works. */ }
      }
    });
  }

  async submit() {
    if (this.pending()) return;
    this.pending.set(true);
    try {
      await call('/api/practice/validate', { method: 'POST', body: JSON.stringify({ title: this.title, body: this.body }) });
      this.result.set('200 · 검증을 통과했습니다.');
    } catch (error) {
      const status = error instanceof ApiFailure ? error.status + ' · ' : '';
      const fields = error instanceof ApiFailure ? error.problem?.fields : undefined;
      this.result.set(status + (fields ? Object.values(fields).flat().join(' ') : explain(error)));
    } finally {
      this.pending.set(false);
    }
  }
}
```

- 1–5행 브라우저에서 저장값을 읽는다.
- 6–7행 입력 바인딩을 위해 FormsModule을 등록한다.
- 8–11행 보간으로 greeting의 값을 읽는다.
- 12–16행 클릭 시 카운터를 증가시킨다.
- 17–25행 폼 값과 클래스 필드를 연결한다.
- 26–39행 기본 상태와 계산식을 선언한다.
- 40–44행 깨진 저장값은 0으로 보정한다.
- 45–52행 브라우저 준비가 끝난 후 변경값을 저장한다.
- 54–68행 폼 입력을 검증 API에 보내고 상태를 표시한다.

## ④ 🔗 연동 포인트

`localStorage`는 이 브라우저의 숫자 실습에 사용한다. 선택한 검색은 URL 쿼리에 남기고, 여러 사용자에게 공유할 게시물은 study6에서 DB에 저장한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `localStorage is not defined` | SSR 중 브라우저 API 실행 | 읽기를 `afterNextRender()`로 이동한다. |
| 새로고침 뒤 초기값 | 저장소가 차단되었거나 출처가 달라짐 | 같은 주소를 사용해 Application 탭의 값을 확인한다. |

## ⑥ 직접 해보기

1. 카운트를 3까지 올린 뒤 새로고침해 `3 · 두 배 6`을 확인한다.
2. DevTools에서 저장값을 `-3`으로 바꿔 0으로 복구되는지 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Signal·computed·effect 역할 설명
- [ ] 템플릿과 입력 바인딩 확인
- [ ] SSR에서 브라우저 저장소 접근을 분리

## ⑧ 다음 단계

[study4](study4.md)에서 상태 중 공유할 값은 URL에, 게시물 데이터는 서버 로드에 연결한다.

[참고 문서](https://angular.dev/guide/signals)
