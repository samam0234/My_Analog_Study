import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Post } from '../../shared/contract';
import { ApiFailure, call, explain } from '../core/api';

@Component({
  selector: 'board-post-editor',
  imports: [FormsModule],
  template: `
    <form class="stack" (ngSubmit)="save()">
      <label>제목 <input name="title" [(ngModel)]="title" required maxlength="200"></label>
      <label>본문 <textarea name="body" [(ngModel)]="body" required maxlength="10000"></textarea></label>
      <label>태그 (쉼표 구분) <input name="tags" [(ngModel)]="tags"></label>
      @if (message()) { <p class="error" role="alert">{{ message() }}</p> }
      <button type="submit" [disabled]="pending()">{{ pending() ? '저장 중…' : '저장' }}</button>
    </form>
  `,
})
export class PostEditor {
  readonly post = input<Post>();
  readonly saved = output<Post>();
  readonly pending = signal(false);
  readonly message = signal('');
  title = '';
  body = '';
  tags = '';

  ngOnInit() {
    const post = this.post();
    if (!post) return;
    this.title = post.title;
    this.body = post.body;
    this.tags = post.tags.join(', ');
  }

  async save() {
    if (this.pending()) return;
    this.message.set('');
    if (!this.title.trim() || !this.body.trim()) {
      this.message.set('제목과 본문을 입력하세요.');
      return;
    }
    this.pending.set(true);
    const id = this.post()?.id;
    try {
      const { data } = await call<{ data: Post }>(id ? '/api/posts/' + id : '/api/posts', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: this.title, body: this.body,
          tags: this.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
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
