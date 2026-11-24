import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `
    <section class="hero">
      <h1>Analog 게시판</h1>
      <p>글을 기록하고, 댓글로 이야기하고, 문장 속에서 답을 찾아보세요.</p>
      <a class="button" routerLink="/posts">게시판 열기</a>
      <a class="plain-link" routerLink="/blog/welcome">블로그 읽기</a>
    </section>
  `,
})
export default class HomePage {}
