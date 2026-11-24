# study12 · 프런트·UI 연동

## ① 목표

Analog의 게시글 편집기에 Angular Material, Signals 상태, Signal Forms를 연결한다.

## ② 📖 이론

Material은 입력과 버튼의 스타일·레이블을 제공하고 Signal Forms는 필드와 검증 상태를 관리한다. Signal 상태 서비스는 페이지 사이에서 로그인 정보를 전달한다. 도구 상자의 손잡이와 내부 기계가 분리된 것처럼, 화면 부품과 저장 조건을 각각 조합할 수 있다.

## ③ 🛠️ 실기

실습 명령과 `src/` 경로는 `lesson/`을 기준으로 합니다. 아래 전체 코드의 파일명은 저장소 루트 기준입니다.

`package-lock.json`과 `src/styles.css`의 Material 테마 import를 확인한다. `/posts/new`에서 제목·본문·태그를 입력하고 저장한다. 상세에서 작성자 메뉴로 내용을 수정해 폼의 초기 값이 기존 데이터와 같은지 확인한다. 키보드 탭, 레이블, 오류 안내와 중복 제출 방지까지 확인한다.

### `lesson/src/app/board/post-editor.ts` 전체 코드

```typescript
import { Component, computed, input, output, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
import { ApiFailure, call, explain } from '../core/api';
import type { Post } from '../../shared/contract';

@Component({
  selector: 'board-post-editor',
  imports: [FormField, MatFormField, MatLabel, MatInput, MatButton],
  template: `
    <form class="stack" (submit)="save($event)">
      <mat-form-field appearance="outline">
        <mat-label>제목</mat-label>
        <input matInput [formField]="fields.title" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>본문</mat-label>
        <textarea matInput [formField]="fields.body" rows="6"></textarea>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>태그 (쉼표로 구분)</mat-label>
        <input matInput [formField]="fields.tags" />
      </mat-form-field>
      @if (validation()) { <p class="error" role="alert">{{ validation() }}</p> }
      @if (message()) { <p class="error" role="alert">{{ message() }}</p> }
      <button mat-flat-button type="submit" [disabled]="pending()">{{ pending() ? '저장 중…' : '저장' }}</button>
    </form>
  `,
})
export class PostEditor {
  readonly post = input<Post>();
  readonly saved = output<Post>();
  readonly pending = signal(false);
  readonly message = signal('');
  readonly model = signal({ title: '', body: '', tags: '' });
  readonly fields = form(this.model, (path) => {
    required(path.title, { message: '제목을 입력하세요.' });
    maxLength(path.title, 200, { message: '제목은 200자 이하입니다.' });
    required(path.body, { message: '본문을 입력하세요.' });
    maxLength(path.body, 10_000, { message: '본문은 10,000자 이하입니다.' });
  });
  readonly validation = computed(() => [this.fields.title(), this.fields.body()]
    .filter((field) => field.touched()).flatMap((field) => field.errors().map((item) => item.message)).join(' '));

  ngOnInit() {
    const post = this.post();
    if (post) this.model.set({ title: post.title, body: post.body, tags: post.tags.join(', ') });
  }

  async save(event: Event) {
    event.preventDefault();
    if (this.pending()) return;
    if (this.fields().invalid()) {
      this.fields.title().markAsTouched();
      this.fields.body().markAsTouched();
      return;
    }
    this.pending.set(true);
    this.message.set('');
    const { title, body, tags } = this.model();
    const id = this.post()?.id;
    try {
      const { data } = await call<{ data: Post }>(id ? '/api/posts/' + id : '/api/posts', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, body, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }),
      });
      this.saved.emit(data);
    } catch (error) {
      const fields = error instanceof ApiFailure ? error.problem?.fields : undefined;
      this.message.set(fields ? Object.values(fields).flat().join(' ') : explain(error));
    } finally {
      this.pending.set(false);
    }
  }
}
```

- 1행 이 파일이 사용하는 타입과 모듈을 가져온다.
- 2행 Signal Forms 바인딩과 검증 API를 불러온다.
- 3–10행 UI 라이브러리가 제공하는 폼·버튼 구성요소를 가져온다.
- 11–15행 이 템플릿에만 필요한 모듈을 등록한다.
- 16–25행 DOM 입력을 Signal 폼 필드에 연결한다.
- 26–36행 검증 실패를 접근 가능한 텍스트로 보낸다.
- 37행 편집 중인 입력 상태를 보유한다.
- 38–43행 필수 입력과 최대 길이를 선언한다.
- 44–45행 사용자가 건드린 필드의 오류 문구만 조합한다.
- 47–50행 수정 모드에 저장된 제목·본문·태그를 넣는다.
- 52–64행 중복·유효성 검사를 통과하면 POST 또는 PATCH를 선택한다.
- 65–68행 공통 HTTP 클라이언트로 입력을 보낸다.
- 69–72행 저장된 DTO를 부모에게 돌려준다.
- 73–77행 요청 상태를 초기화한다.

## ④ 🔗 연동 포인트

가입·로그인 상태는 `Session.user()`로 공유한다. 서버 폼 규칙과 v1 shape는 그대로 사용하고 다음 외부 서비스 버튼에도 `busy` 상태와 오류 표시를 적용한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `mat-form-field must contain a MatFormFieldControl` | 입력에 `matInput`이 빠짐 | `MatInput`을 imports에 넣고 요소에 `matInput`을 선언한다. |
| 테마 색상이 없음 | Material 프리빌트 CSS를 읽지 않음 | `src/styles.css`의 import와 Network를 확인한다. |
| 본문이 공백일 때 400 | 서버의 trim 검증 통과 실패 | 오류를 표시하고 실제 텍스트를 입력한다. |

## ⑥ 직접 해보기

1. 키보드로 폼 필드를 이동하고 저장 버튼에 도달한다.
2. 이미 작성한 글을 열어 수정하고 원래 태그가 표시되는지 확인한다.
3. 필수 필드를 비우고 오류 메시지와 Network를 확인한다.

## ⑦ ☐ 체크리스트

- [ ] Material 테마·입력·버튼 연결
- [ ] Signals 상태·Signal Forms 필드 검증 확인
- [ ] 저장 결과와 서버 필드 오류 표시

## ⑧ 다음 단계

[study13](study13.md)에서 같은 로그인·오류 흐름을 외부 서비스로 확장한다.

[참고 문서](https://angular.dev/guide/forms/signals/overview)
