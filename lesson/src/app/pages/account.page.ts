import { Component, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { call, explain } from '../core/api';
import { Session } from '../core/session';

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <h1>계정</h1>
    <section class="panel stack">
      @if (session.user(); as user) {
        <h2>{{ user.nickname }}</h2>
        <p>{{ user.email }}</p>
        <a routerLink="/posts">게시판으로</a>
        <button type="button" [disabled]="busy()" (click)="perform(logout)">로그아웃</button>
      } @else {
        <h2>{{ signup() ? '회원가입' : '로그인' }}</h2>
        <form class="stack" (ngSubmit)="perform(submit)">
          @if (signup()) {
            <label>닉네임 <input [(ngModel)]="nickname" name="nickname" maxlength="40" required></label>
          }
          <label>이메일 <input [(ngModel)]="email" type="email" name="email" autocomplete="email" required></label>
          <label>비밀번호 <input [(ngModel)]="password" type="password" name="password"
            [attr.autocomplete]="signup() ? 'new-password' : 'current-password'" required></label>
          <button [disabled]="busy()">{{ signup() ? '가입하기' : '로그인' }}</button>
        </form>
        <button type="button" (click)="signup.set(!signup())">{{ signup() ? '로그인 화면으로' : '회원가입 화면으로' }}</button>
        <a href="/api/auth/google/start">Google로 로그인</a>
      }
      @if (notice()) { <p role="status">{{ notice() }}</p> }
      @if (problem()) { <p class="error" role="alert">{{ problem() }}</p> }
    </section>
  `,
})
export default class AccountPage {
  readonly session = inject(Session);
  readonly signup = signal(false);
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly problem = signal('');
  email = '';
  password = '';
  nickname = '';

  constructor() {
    afterNextRender(() => void this.session.refresh().catch((error) => this.problem.set(explain(error))));
  }

  readonly logout = () => this.session.signOut();
  readonly submit = async () => {
    if (this.signup()) {
      await call('/api/auth/signup', {
        method: 'POST', body: JSON.stringify({ email: this.email, password: this.password, nickname: this.nickname }),
      });
      this.signup.set(false);
      this.notice.set('회원가입이 완료되었습니다. 로그인하세요.');
    } else {
      await this.session.signIn(this.email, this.password);
    }
    this.password = '';
  };

  async perform(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set('');
    this.problem.set('');
    try { await action(); }
    catch (error) { this.problem.set(explain(error)); }
    finally { this.busy.set(false); }
  }
}
