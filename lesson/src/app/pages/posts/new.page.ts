import { Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PostEditor } from '../../board/post-editor';
import { Session } from '../../core/session';
import { explain } from '../../core/api';
import type { Post } from '../../../shared/contract';

@Component({
  imports: [PostEditor, RouterLink],
  template: `
    <h1>글 작성</h1>
    @if (session.user()) {
      <section class="panel"><board-post-editor (saved)="open($event)" /></section>
    } @else if (problem()) {
      <p role="alert">{{ problem() }}</p>
    } @else if (ready()) {
      <p>글을 작성하려면 <a routerLink="/account">로그인</a>하세요.</p>
    } @else { <p>로그인 상태 확인 중…</p> }
  `,
})
export default class NewPostPage {
  private readonly router = inject(Router);
  readonly session = inject(Session);
  readonly problem = signal('');
  readonly ready = signal(false);
  constructor() {
    afterNextRender(() => void this.session.refresh()
      .catch((error) => this.problem.set(explain(error))).finally(() => this.ready.set(true)));
  }
  open(post: Post) { void this.router.navigate(['/posts', post.id]); }
}
