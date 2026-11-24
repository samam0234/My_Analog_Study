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
