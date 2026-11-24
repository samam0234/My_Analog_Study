import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { call, explain } from '../core/api';
import { Session } from '../core/session';
import { streamAnswer } from '../core/chat';

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <h1>확장 기능 실습</h1>
    <section class="panel stack">
      <h2>실시간 게시판 알림</h2>
      <button type="button" [disabled]="listening()" (click)="listen()">알림 연결</button>
      <p role="status">{{ live() }}</p>
    </section>
    @if (session.user()) {
      <section class="panel stack">
        <h2>문서에 질문하기</h2>
        <form class="stack" (ngSubmit)="ask()">
          <label>문서 <textarea rows="6" name="document" [(ngModel)]="document" maxlength="12000" required></textarea></label>
          <label>질문 <input name="question" [(ngModel)]="question" maxlength="500" required></label>
          <div class="toolbar">
            <button [disabled]="busy()">질문 보내기</button>
            @if (busy()) { <button type="button" (click)="cancel()">중지</button> }
          </div>
        </form>
        @if (answer()) { <p class="stream-output">{{ answer() }}</p> }
        @for (source of sources(); track source.number) {
          <details><summary>발췌 {{ source.number }}</summary><p>{{ source.text }}</p></details>
        }
        <button type="button" (click)="loadHistory()">최근 질문 불러오기</button>
        @for (entry of history(); track entry.id) {
          <details><summary>{{ entry.question }}</summary><p>{{ entry.answer || '응답 미완료' }}</p></details>
        }
      </section>
      <section class="panel stack">
        <h2>외부 서비스</h2>
        <label>UTF-8 텍스트 파일 <input type="file" accept=".txt,text/plain" (change)="selectFile($event)"></label>
        <button type="button" [disabled]="!selected || externalBusy()" (click)="run(upload)">텍스트 업로드</button>
        @if (uploadId()) { <a [href]="'/api/uploads/' + uploadId()">내 파일 내려받기</a> }
        <div class="toolbar">
          <button type="button" [disabled]="externalBusy()" (click)="run(checkout)">결제 화면 열기</button>
          <button type="button" [disabled]="externalBusy()" (click)="run(email)">내게 환영 메일 보내기</button>
        </div>
        <p role="status">{{ notice() }}</p>
      </section>
    } @else { <p>문서 질문과 외부 서비스는 <a routerLink="/account">로그인</a> 후 이용할 수 있습니다.</p> }
    @if (problem()) { <p role="alert" class="error">{{ problem() }}</p> }
  `,
})
export default class LabPage {
  readonly session = inject(Session);
  readonly listening = signal(false);
  readonly live = signal('연결 대기 중');
  readonly busy = signal(false);
  readonly externalBusy = signal(false);
  readonly answer = signal('');
  readonly notice = signal('');
  readonly problem = signal('');
  readonly uploadId = signal('');
  readonly sources = signal<Array<{ number: number; text: string }>>([]);
  readonly history = signal<Array<{ id: number; question: string; answer?: string }>>([]);
  document = '';
  question = '';
  selected: File | undefined;
  private socket?: WebSocket;
  private controller?: AbortController;

  constructor() {
    afterNextRender(() => void this.session.refresh().catch((error) => this.problem.set(explain(error))));
    inject(DestroyRef).onDestroy(() => { this.socket?.close(); this.cancel(); });
  }

  listen() {
    if (this.listening()) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.socket = new WebSocket(protocol + '//' + location.host + '/api/notifications');
    this.listening.set(true);
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      this.live.set(event.type === 'connected' ? '연결되었습니다.' : '새 글이 등록되었습니다 · #' + event.id);
    };
    socket.onerror = () => this.live.set('알림에 연결할 수 없습니다.');
    socket.onclose = () => { this.listening.set(false); this.live.set('연결이 종료되었습니다.'); };
  }

  async ask() {
    if (this.busy()) return;
    this.busy.set(true);
    this.problem.set('');
    this.answer.set('');
    this.sources.set([]);
    const controller = this.controller = new AbortController();
    try {
      await streamAnswer({ document: this.document, question: this.question }, (frame) => {
        if (frame.text) this.answer.update((previous) => previous + frame.text);
        if (frame.sources) this.sources.set(frame.sources);
      }, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) this.problem.set(explain(error));
    } finally {
      this.busy.set(false);
    }
  }

  cancel() { this.controller?.abort(); }

  loadHistory() {
    return this.run(async () => {
      const { data } = await call<{ data: Array<{ id: number; question: string; answer?: string }> }>('/api/ai/history');
      this.history.set(data);
    });
  }

  selectFile(event: Event) { this.selected = (event.target as HTMLInputElement).files?.[0]; }

  readonly upload = async () => {
    if (!this.selected) return;
    const { data } = await call<{ data: { id: string } }>('/api/uploads', {
      method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: this.selected,
    });
    this.uploadId.set(data.id);
    this.notice.set('파일을 저장했습니다.');
  };

  readonly checkout = async () => {
    const { data } = await call<{ data: { url: string | null } }>('/api/integrations/checkout', { method: 'POST' });
    if (data.url) location.assign(data.url);
  };

  readonly email = async () => {
    await call('/api/integrations/welcome-email', { method: 'POST' });
    this.notice.set('메일을 발송 대기열에 추가했습니다.');
  };

  async run(task: () => Promise<void>) {
    if (this.externalBusy()) return;
    this.externalBusy.set(true);
    this.problem.set('');
    this.notice.set('');
    try { await task(); }
    catch (error) { this.problem.set(explain(error)); }
    finally { this.externalBusy.set(false); }
  }
}
