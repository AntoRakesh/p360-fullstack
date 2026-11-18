import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AdminUser, LoginResponse, MfaResponse } from './models';

const KEY = 'lm.session';

interface Session {
  token: string;
  expiresAt: string;
  user: AdminUser;
}

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function save(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: session lives in memory only */
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(load());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);

  isLoggedIn(): boolean {
    const s = this.session();
    return !!s && new Date(s.expiresAt).getTime() > Date.now();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { username, password });
  }

  verifyMfa(mfaToken: string, code: string): Observable<MfaResponse> {
    return this.http.post<MfaResponse>('/api/auth/mfa', { mfaToken, code }).pipe(
      tap((r) => {
        const s = { token: r.accessToken, expiresAt: r.expiresAt, user: r.user };
        this.session.set(s);
        save(s);
      }),
    );
  }

  logout(redirect = true): void {
    this.session.set(null);
    save(null);
    if (redirect) this.router.navigate(['/login']);
  }
}
