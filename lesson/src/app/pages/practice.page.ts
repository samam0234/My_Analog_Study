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
