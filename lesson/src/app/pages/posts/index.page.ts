import { Component, afterNextRender, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { injectLoad } from '@analogjs/router';
import { PostCard } from '../../board/post-card';
import { Session } from '../../core/session';
import type { load } from './index.server';

@Component({
  imports: [PostCard, RouterLink],
  template: `
    <div class="page-heading">
      <h1>게시판</h1>
      @if (session.user()) { <a class="button" routerLink="/posts/new">글 작성</a> }
      @else { <a class="plain-link" routerLink="/account">로그인하여 글 작성</a> }
    </div>
    <form class="toolbar" action="/posts" method="get">
      <label>검색 <input name="q" [value]="loaded().result?.meta?.q ?? ''" placeholder="제목 또는 본문" maxlength="200"></label>
      <label>정렬 <select name="sort"><option value="-createdAt">최신순</option><option value="createdAt">오래된 순</option><option value="-commentCount">댓글 순</option></select></label>
      <button type="submit">검색</button>
    </form>
    @if (loaded().result; as result) {
      <p class="muted">글 {{ result.meta.total }}개</p>
      <div class="panel">
        @for (post of result.data; track post.id) {
          <board-post-card [post]="post" (selected)="open($event)" />
        } @empty { <p>표시할 글이 없습니다.</p> }
      </div>
      <nav class="pagination" aria-label="페이지">
        @if (result.meta.page > 1) {
          <a [href]="pageLink(result.meta.page - 1)">이전</a>
        }
        <span>{{ result.meta.page }} / {{ result.meta.totalPages || 1 }}</span>
        @if (result.meta.page < result.meta.totalPages) {
          <a [href]="pageLink(result.meta.page + 1)">다음</a>
        }
      </nav>
    } @else { <p role="alert">{{ loaded().issue }}</p> }
  `,
})
export default class PostsPage {
  private readonly router = inject(Router);
  readonly session = inject(Session);
  readonly loaded = toSignal(injectLoad<typeof load>(), { requireSync: true });

  constructor() {
    afterNextRender(() => { void this.session.refresh().catch(() => undefined); });
  }

  open(id: number) { void this.router.navigate(['/posts', id]); }

  pageLink(page: number) {
    const query = this.router.parseUrl(this.router.url).queryParams;
    return '/posts?' + new URLSearchParams({ ...query, page: String(page) });
  }
}
