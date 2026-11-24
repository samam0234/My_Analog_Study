import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BoardPostView } from '../../board/post-view';
import { PostEditor } from '../../board/post-editor';
import { call, explain } from '../../core/api';
import { Session } from '../../core/session';
import type { Comment, PageMeta, Post } from '../../../shared/contract';

@Component({
  imports: [FormsModule, RouterLink, BoardPostView, PostEditor],
  template: `
    <a routerLink="/posts">← 게시판</a>
    @if (problem()) { <p role="alert" class="error">{{ problem() }}</p> }
    @if (post(); as item) {
      <section class="panel post-detail">
        @if (editing()) { <board-post-editor [post]="item" (saved)="updated($event)" /> }
        @else { <board-post-view [post]="item" /> }
        @if (session.user()?.id === item.author.id) {
          <div class="toolbar">
            <button type="button" (click)="editing.set(!editing())">{{ editing() ? '편집 취소' : '수정' }}</button>
            <button type="button" [disabled]="pending()" (click)="remove()">삭제</button>
          </div>
        }
      </section>
      <section class="panel stack">
        <h2>댓글</h2>
        @for (comment of comments(); track comment.id) {
          <article class="post-row">
            <div><strong>{{ comment.author.nickname }}</strong><p>{{ comment.body }}</p></div>
            @if (session.user()?.id === comment.author.id) {
              <button type="button" [disabled]="pending()" (click)="removeComment(comment.id)">댓글 삭제</button>
            }
          </article>
        } @empty { <p class="muted">첫 댓글을 남겨보세요.</p> }
        <nav class="pagination" aria-label="댓글 페이지">
          @if (commentPage() > 1) { <button type="button" (click)="changeCommentPage(-1)">이전 댓글</button> }
          @if (commentPage() < commentPages()) { <button type="button" (click)="changeCommentPage(1)">다음 댓글</button> }
        </nav>
        @if (session.user()) {
          <form class="stack" (ngSubmit)="addComment()">
            <label>댓글 <textarea [(ngModel)]="draft" name="comment" maxlength="1000" required></textarea></label>
            <button [disabled]="pending() || !draft.trim()">댓글 작성</button>
          </form>
        }
      </section>
    } @else if (!problem()) { <p>글을 불러오는 중…</p> }
  `,
})
export default class PostPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(Session);
  readonly post = signal<Post | null>(null);
  readonly comments = signal<Comment[]>([]);
  readonly commentPage = signal(1);
  readonly commentPages = signal(0);
  readonly editing = signal(false);
  readonly pending = signal(false);
  readonly problem = signal('');
  draft = '';

  constructor() {
    afterNextRender(() => void this.read().catch((error) => this.problem.set(explain(error))));
  }

  private get url() { return '/api/posts/' + encodeURIComponent(this.route.snapshot.paramMap.get('id') || ''); }

  private async read() {
    const [{ data }] = await Promise.all([call<{ data: Post }>(this.url), this.session.refresh()]);
    this.post.set(data);
    await this.readComments();
  }

  private async readComments(page = this.commentPage()): Promise<void> {
    const { data, meta } = await call<{ data: Comment[]; meta: PageMeta }>(this.url + '/comments?page=' + page);
    if (!data.length && page > 1) return this.readComments(1);
    this.comments.set(data);
    this.commentPage.set(page);
    this.commentPages.set(meta.totalPages);
  }

  updated(post: Post) { this.post.set(post); this.editing.set(false); }

  async changeCommentPage(offset: number) {
    await this.run(async () => this.readComments(this.commentPage() + offset));
  }

  async remove() {
    if (!confirm('이 글을 삭제할까요?')) return;
    await this.run(async () => {
      await call(this.url, { method: 'DELETE' });
      await this.router.navigate(['/posts']);
    });
  }

  async addComment() {
    await this.run(async () => {
      await call(this.url + '/comments', { method: 'POST', body: JSON.stringify({ body: this.draft }) });
      this.draft = '';
      const page = Math.floor((this.post()?.commentCount ?? 0) / 10) + 1;
      await this.readComments(page);
      this.post.set((await call<{ data: Post }>(this.url)).data);
    });
  }

  async removeComment(id: number) {
    await this.run(async () => {
      await call('/api/comments/' + id, { method: 'DELETE' });
      await this.read();
    });
  }

  private async run(action: () => Promise<void>) {
    if (this.pending()) return;
    this.pending.set(true);
    this.problem.set('');
    try { await action(); }
    catch (error) { this.problem.set(explain(error)); }
    finally { this.pending.set(false); }
  }
}
