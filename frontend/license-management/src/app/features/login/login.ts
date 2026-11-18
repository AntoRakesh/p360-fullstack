import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toDataURL } from 'qrcode';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/format';
import { LoginResponse } from '../../core/models';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Bound from ?returnUrl= via withComponentInputBinding. */
  readonly returnUrl = input<string>();

  protected readonly step = signal<'password' | 'mfa'>('password');
  protected readonly challenge = signal<LoginResponse | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly creds = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  protected readonly mfa = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected submitPassword(): void {
    if (this.creds.invalid) return this.creds.markAllAsTouched();
    const { username, password } = this.creds.getRawValue();
    this.run(this.auth.login(username, password), async (r) => {
      this.challenge.set(r);
      this.qr.set(r.enrollRequired && r.otpauthUri ? await toDataURL(r.otpauthUri, { margin: 1, width: 200 }) : null);
      this.step.set('mfa');
    });
  }

  protected submitCode(): void {
    const c = this.challenge();
    if (!c || this.mfa.invalid) return this.mfa.markAllAsTouched();
    this.run(this.auth.verifyMfa(c.mfaToken, this.mfa.getRawValue().code), () => {
      const target = this.returnUrl();
      this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('/login') ? target : '/dashboard');
    });
  }

  protected back(): void {
    this.step.set('password');
    this.challenge.set(null);
    this.qr.set(null);
    this.mfa.reset();
    this.error.set(null);
  }

  private run<T>(obs: import('rxjs').Observable<T>, ok: (v: T) => void | Promise<void>): void {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: async (v) => {
        await ok(v);
        this.busy.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
