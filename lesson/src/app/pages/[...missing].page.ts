import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `<h1>페이지를 찾을 수 없습니다</h1><a routerLink="/">홈으로 돌아가기</a>`,
})
export default class MissingPage {}
