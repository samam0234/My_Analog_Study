import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="shell site-header">
      <a class="brand" routerLink="/">Analog<span> Board</span></a>
      <nav aria-label="주 메뉴">
        <a routerLink="/posts" routerLinkActive="active">게시판</a>
        <a routerLink="/blog/welcome" routerLinkActive="active">블로그</a>
        <a routerLink="/practice" routerLinkActive="active">실습</a>
        <a routerLink="/lab" routerLinkActive="active">확장 기능</a>
        <a routerLink="/account" routerLinkActive="active">계정</a>
      </nav>
    </header>
    <main class="shell"><router-outlet /></main>
  `,
})
export class App {}
