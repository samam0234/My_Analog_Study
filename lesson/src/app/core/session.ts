import { Injectable, signal } from '@angular/core';
import type { User } from '../../shared/contract';
import { ApiFailure, call } from './api';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly current = signal<User | null>(null);
  readonly user = this.current.asReadonly();

  async refresh() {
    try {
      const { data } = await call<{ data: User }>('/api/auth/me');
      this.current.set(data);
    } catch (error) {
      if (!(error instanceof ApiFailure) || error.status !== 401) throw error;
      this.current.set(null);
    }
  }

  async signIn(email: string, password: string) {
    const { data } = await call<{ data: { user: User } }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    this.current.set(data.user);
  }

  async signOut() {
    await call('/api/auth/logout', { method: 'POST' });
    this.current.set(null);
  }
}
