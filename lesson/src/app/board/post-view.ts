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
