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
