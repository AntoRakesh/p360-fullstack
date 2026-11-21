// themify: off — fixed brand/illustration colors; theme-aware parts use var(--primary)/--card/--text.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BrandLogo } from '@p360/shared/brand-logo';
import { Icon } from '@p360/shared/icon';
import { ThemeService } from '@p360/shared/theme';
import { LoginProvider, ProviderKind, SignedIn } from './login-providers';

type View = 'signin' | 'forgot' | 'sent' | 'otp' | 'qr' | 'provider' | 'success';

const REMEMBER = 'p360.remember';
export const AUTH_KEY = 'p360.auth';

/** The only account accepted by the email + password form (demo). */
const DEMO_USER = { email: 'demologin@gmail.com', password: '12345', name: 'Demo Login' };

const RAW_TILES = [
  { cls: 't1', icon: 'shield-check', label: 'Smart Access', chip: 'Access granted', tone: 'ok' },
  { cls: 't2', icon: 'clock', label: 'Live Attendance', chip: '7,842 present', tone: 'ok' },
  { cls: 't3', icon: 'map-pin', label: 'Real-time Location', chip: '386 on site', tone: 'info' },
  { cls: 't4', icon: 'siren', label: 'Emergency Mustering', chip: 'Muster A 318/320', tone: 'warn' },
  { cls: 't5', icon: 'user-plus', label: 'Visitor Management', chip: 'Visitor checked in', tone: 'info' },
];
const rad = (d: number) => (d * Math.PI) / 180;
/** point on the collage disc (percent), angle in degrees (0 = right, 90 = top), k = fraction of radius */
const pt = (deg: number, k: number): [number, number] => [50 + 50 * k * Math.cos(rad(deg)), 50 - 50 * k * Math.sin(rad(deg))];
/** five wedges fanning over the visible (left) half of the disc */
const TILES = RAW_TILES.map((t, i) => {
  const a0 = 90 + 36 * i, a1 = a0 + 36, m = a0 + 18;
  const poly = [[50, 50], pt(a0, 3), pt(m, 3), pt(a1, 3)].map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ');
  const ch = pt(m, 0.6);
  ch[0] = Math.min(ch[0], 37); // keep chip inside the visible (left) half
  return { ...t, clip: `polygon(${poly})`, wm: pt(m, 0.8), ch, cr: pt(m - 9, 0.86) };
});

@Component({
  selector: 'app-login',
  imports: [Icon, BrandLogo, LoginProvider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <section class="hero" aria-hidden="false">
        <svg class="sky" viewBox="0 0 900 420" preserveAspectRatio="xMinYMax slice" aria-hidden="true">
          <defs>
            <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--primary)" stop-opacity=".05" />
              <stop offset=".55" stop-color="var(--primary)" stop-opacity=".22" />
              <stop offset="1" stop-color="var(--primary)" stop-opacity=".05" />
            </linearGradient>
            <linearGradient id="lg-sky2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#38bdf8" stop-opacity=".08" />
              <stop offset="1" stop-color="var(--primary)" stop-opacity=".16" />
            </linearGradient>
            <radialGradient id="lg-sun" cx=".5" cy=".5" r=".5">
              <stop offset="0" stop-color="#fff7ed" stop-opacity=".95" />
              <stop offset="1" stop-color="#fff7ed" stop-opacity="0" />
            </radialGradient>
          </defs>
          <circle cx="250" cy="170" r="150" fill="url(#lg-sun)" class="sun" />
          @for (b of far; track $index) {
            <rect [attr.x]="b[0]" [attr.y]="420 - b[1]" [attr.width]="b[2]" [attr.height]="b[1]" fill="url(#lg-sky2)" />
          }
          @for (b of near; track $index) {
            <rect [attr.x]="b[0]" [attr.y]="420 - b[1]" [attr.width]="b[2]" [attr.height]="b[1]" rx="1.5" fill="url(#lg-sky)" />
            @if (b[1] > 150) {
              <rect [attr.x]="b[0] + b[2] / 2 - 1" [attr.y]="420 - b[1] - 26" width="2" height="26" fill="var(--primary)" opacity=".25" />
            }
          }
          <path d="M0 395 Q 260 360 520 392 T 900 380 V420 H0Z" fill="var(--primary)" opacity=".10" />
          <path class="road" d="M-20 410 C 220 380 430 330 900 350" fill="none" stroke="#ffffff" stroke-width="2" opacity=".55" />
          <path class="road r2" d="M-20 418 C 240 392 470 350 900 368" fill="none" stroke="#c4b5fd" stroke-width="2" opacity=".55" />
        </svg>

        <div class="intro">
          <app-brand-logo [height]="86" />
          <h1>Complete People Management<br />for a <span>Smarter Workplace</span></h1>
          <p class="tags">Identify <i></i> Track <i></i> Protect <i></i> Empower</p>
        </div>

        <div class="collage" aria-hidden="true">
          @for (t of tiles; track t.cls) {
            <div [class]="'tile ' + t.cls" [style.clip-path]="t.clip">
              <span class="wm" [style.left.%]="t.wm[0]" [style.top.%]="t.wm[1]"><app-icon [name]="t.icon" [size]="132" [stroke]="1.1" /></span>
              <div class="crowd" [style.left.%]="t.cr[0]" [style.top.%]="t.cr[1]">
                @for (p of [0, 1, 2]; track p) {
                  <span></span>
                }
              </div>
              <div [class]="'chip ' + t.tone" [style.left.%]="t.ch[0]" [style.top.%]="t.ch[1]">
                <span class="ci"><app-icon [name]="t.icon" [size]="15" [stroke]="2.2" /></span>
                <span><b>{{ t.chip }}</b><small>{{ t.label }}</small></span>
              </div>
            </div>
          }
          <svg class="seams" viewBox="0 0 100 100" aria-hidden="true">
            @for (a of seams; track a) {
              <line x1="50" y1="50" [attr.x2]="50 + 52 * cos(a)" [attr.y2]="50 - 52 * sin(a)" />
            }
          </svg>
        </div>

        <ul class="features">
          @for (f of features; track f.label) {
            <li>
              <span class="fi" [style.background]="f.bg"><app-icon [name]="f.icon" [size]="34" [stroke]="1.8" /></span>
              <b>{{ f.label }}</b>
            </li>
          }
        </ul>
      </section>

      <section class="panel">
        <div class="card">
          @switch (view()) {
            @case ('signin') {
              <header>
                <h2>Welcome to People<span>360</span></h2>
                <p>Sign in to your account</p>
              </header>
              <form (submit)="$event.preventDefault(); signIn()" novalidate>
                <label class="fl">Email / Username</label>
                <div class="inp" [class.err]="errors().email">
                  <app-icon name="user" [size]="19" />
                  <input type="text" autocomplete="username" placeholder="Enter your email or username" [value]="email()" (input)="email.set($any($event.target).value); clear('email'); authError.set('')" />
                </div>
                @if (errors().email) {
                  <small class="em">{{ errors().email }}</small>
                }

                <label class="fl">Password</label>
                <div class="inp" [class.err]="errors().password">
                  <app-icon name="lg-lock" [size]="19" />
                  <input [type]="showPw() ? 'text' : 'password'" autocomplete="current-password" placeholder="Enter your password" [value]="password()" (input)="password.set($any($event.target).value); clear('password'); authError.set('')" />
                  <button type="button" class="eye" (click)="showPw.set(!showPw())" [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'">
                    <app-icon [name]="showPw() ? 'lg-eye-off' : 'eye'" [size]="19" />
                  </button>
                </div>
                @if (errors().password) {
                  <small class="em">{{ errors().password }}</small>
                }

                <div class="row">
                  <label class="cb"><input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)" /><span><app-icon name="lg-check" [size]="13" [stroke]="3" /></span>Remember me</label>
                  <button type="button" class="link" (click)="go('forgot')">Forgot Password?</button>
                </div>

                @if (authError()) {
                  <div class="auth-err" role="alert"><app-icon name="lg-lock" [size]="16" />{{ authError() }}</div>
                }
                <button class="primary" type="submit" [disabled]="busy()">
                  @if (busy() === 'password') {
                    <i class="spin"></i>Signing in…
                  } @else {
                    Sign In <app-icon name="lg-arrow-right" [size]="19" />
                  }
                </button>
              </form>

              <div class="or"><span>Or continue with</span></div>

              <button class="opt wide" (click)="provider('sso')" [disabled]="busy()">
                <span class="oi"><app-icon name="building" [size]="28" [stroke]="1.7" /></span>
                <span class="ot"><b>Enterprise SSO</b><small>Sign in with your organization account</small></span>
                @if (busy() === 'sso') {<i class="spin dark"></i>} @else {<app-icon name="lg-arrow-right" [size]="17" />}
              </button>
              <div class="two">
                <button class="opt" (click)="provider('microsoft')" [disabled]="busy()">
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect width="10" height="10" fill="#f25022" /><rect x="12" width="10" height="10" fill="#7fba00" /><rect y="12" width="10" height="10" fill="#00a4ef" /><rect x="12" y="12" width="10" height="10" fill="#ffb900" /></svg>
                  <b><span class="long">Continue with </span>Microsoft</b>
                  @if (busy() === 'microsoft') {<i class="spin dark"></i>} @else {<app-icon name="lg-arrow-right" [size]="15" />}
                </button>
                <button class="opt" (click)="provider('google')" [disabled]="busy()">
                  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#ffc107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" /><path fill="#ff3d00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4caf50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976d2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" /></svg>
                  <b><span class="long">Continue with </span>Google</b>
                  @if (busy() === 'google') {<i class="spin dark"></i>} @else {<app-icon name="lg-arrow-right" [size]="15" />}
                </button>
              </div>
              <button class="opt wide" (click)="provider('passkey')" [disabled]="busy()">
                <span class="oi"><app-icon name="lg-key" [size]="28" [stroke]="1.7" /></span>
                <span class="ot"><b>Sign in with Passkey</b><small>Use your device's biometric or security key</small></span>
                @if (busy() === 'passkey') {<i class="spin dark"></i>} @else {<app-icon name="lg-arrow-right" [size]="17" />}
              </button>

              <button class="more" (click)="moreOpen.set(!moreOpen())" [attr.aria-expanded]="moreOpen()">
                Other login options <app-icon [name]="moreOpen() ? 'lg-chevron-up' : 'chevron-down'" [size]="16" />
              </button>
              @if (moreOpen()) {
                <div class="four">
                  <button class="sq" (click)="provider('ad')" [disabled]="busy()">
                    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--primary)" d="M2 4.5 10 3.4v7.9H2zM11 3.3 22 2v9.3H11zM2 12.4h8v7.9l-8-1.1zM11 12.4h11V22l-11-1.5z" /></svg>
                    <span>Active Directory</span>
                  </button>
                  <button class="sq" (click)="provider('ldap')" [disabled]="busy()"><app-icon name="lg-server" [size]="24" /><span>LDAP</span></button>
                  <button class="sq" (click)="go('otp')"><app-icon name="lg-mail" [size]="24" /><span>Email OTP</span></button>
                  <button class="sq" (click)="go('qr')"><app-icon name="lg-qr" [size]="24" /><span>QR Code</span></button>
                </div>
              }

              <p class="foot">New to People360? Contact your administrator for access.</p>
            }

            @case ('forgot') {
              <button class="back" (click)="go('signin')"><app-icon name="lg-arrow-left" [size]="17" />Back to sign in</button>
              <header>
                <span class="hi"><app-icon name="lg-lock" [size]="26" /></span>
                <h2>Forgot your password?</h2>
                <p>Enter your work email and we'll send you a secure reset link.</p>
              </header>
              <form (submit)="$event.preventDefault(); sendReset()" novalidate>
                <label class="fl">Work email</label>
                <div class="inp" [class.err]="errors().email">
                  <app-icon name="lg-mail" [size]="19" />
                  <input type="email" placeholder="name@company.com" [value]="email()" (input)="email.set($any($event.target).value); clear('email')" />
                </div>
                @if (errors().email) {
                  <small class="em">{{ errors().email }}</small>
                }
                <button class="primary" type="submit" [disabled]="busy()">
                  @if (busy()) {<i class="spin"></i>Sending…} @else {Send reset link <app-icon name="lg-arrow-right" [size]="19" />}
                </button>
              </form>
            }

            @case ('sent') {
              <header class="done">
                <span class="hi ok"><app-icon name="lg-check-circle" [size]="30" /></span>
                <h2>Check your inbox</h2>
                <p>We sent a password reset link to <b>{{ email() }}</b>. The link expires in 30 minutes.</p>
              </header>
              <button class="primary" (click)="go('signin')">Back to sign in</button>
              <p class="foot">Didn't get it? <button class="link" (click)="go('forgot')">Try again</button></p>
            }

            @case ('otp') {
              <button class="back" (click)="go('signin')"><app-icon name="lg-arrow-left" [size]="17" />Back to sign in</button>
              <header>
                <span class="hi"><app-icon name="lg-mail" [size]="26" /></span>
                <h2>Sign in with Email OTP</h2>
                @if (!otpSent()) {
                  <p>We'll email you a 6-digit one-time code.</p>
                } @else {
                  <p>Enter the code sent to <b>{{ email() }}</b></p>
                }
              </header>
              @if (!otpSent()) {
                <form (submit)="$event.preventDefault(); sendOtp()" novalidate>
                  <label class="fl">Work email</label>
                  <div class="inp" [class.err]="errors().email">
                    <app-icon name="lg-mail" [size]="19" />
                    <input type="email" placeholder="name@company.com" [value]="email()" (input)="email.set($any($event.target).value); clear('email')" />
                  </div>
                  @if (errors().email) {
                    <small class="em">{{ errors().email }}</small>
                  }
                  <button class="primary" type="submit" [disabled]="busy()">
                    @if (busy()) {<i class="spin"></i>Sending…} @else {Send code <app-icon name="lg-arrow-right" [size]="19" />}
                  </button>
                </form>
              } @else {
                <div class="otp" (paste)="pasteOtp($event)">
                  @for (d of otp(); track $index; let i = $index) {
                    <input inputmode="numeric" maxlength="1" [id]="'otp' + i" [value]="d" (input)="setOtp(i, $any($event.target).value)" (keydown.backspace)="backOtp(i, $event)" [class.err]="errors().otp" />
                  }
                </div>
                @if (errors().otp) {
                  <small class="em center">{{ errors().otp }}</small>
                }
                <button class="primary" (click)="verifyOtp()" [disabled]="busy()">
                  @if (busy()) {<i class="spin"></i>Verifying…} @else {Verify &amp; sign in <app-icon name="lg-arrow-right" [size]="19" />}
                </button>
                <p class="foot">Didn't receive it? <button class="link" (click)="resendOtp()">{{ resendIn() ? 'Resend in ' + resendIn() + 's' : 'Resend code' }}</button></p>
              }
            }

            @case ('qr') {
              <button class="back" (click)="go('signin')"><app-icon name="lg-arrow-left" [size]="17" />Back to sign in</button>
              <header>
                <h2>Scan to sign in</h2>
                <p>Open the People360 mobile app and scan this code.</p>
              </header>
              <div class="qr">
                <svg viewBox="0 0 29 29" shape-rendering="crispEdges" aria-label="Sign-in QR code">
                  @for (c of qrCells; track $index) {
                    <rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" />
                  }
                </svg>
                <span class="qrlogo"><img src="purpleiq-mark.png" alt="" /></span>
                <i class="scan"></i>
              </div>
              <p class="qrhint"><app-icon name="lg-scan-face" [size]="17" />Code refreshes in <b>{{ qrIn() }}s</b></p>
              <button class="primary ghost" (click)="provider('qr')" [disabled]="busy()">
                @if (busy()) {<i class="spin dark"></i>Waiting for approval…} @else {Simulate scan from phone}
              </button>
            }

            @case ('provider') {
              <app-login-provider [kind]="prov()" (back)="go('signin')" (done)="success($event)" />
            }

            @case ('success') {
              <div class="success">
                <div class="sav">
                  <span>{{ initials(signed().name) }}</span>
                  <i><app-icon name="lg-check" [size]="15" [stroke]="3.2" /></i>
                </div>
                <h2>Welcome back, {{ signed().name.split(' ')[0] }}!</h2>
                <p>{{ signed().email }}</p>
                <span class="via"><app-icon name="shield-check" [size]="15" />Signed in with {{ signed().method }}</span>
                <div class="bar"><i></i></div>
                <small>Loading your workspace…</small>
              </div>
            }
          }
        </div>
      </section>

      <footer>
        <nav><a href="#" (click)="$event.preventDefault()">Privacy Policy</a><i></i><a href="#" (click)="$event.preventDefault()">Terms of Service</a><i></i><a href="#" (click)="$event.preventDefault()">Support</a></nav>
        <button class="mode" (click)="theme.toggleDark()" [attr.aria-label]="theme.dark() ? 'Light mode' : 'Dark mode'"><app-icon [name]="theme.dark() ? 'th-sun' : 'th-moon'" [size]="16" /></button>
        <span>© 2026 Purple IQ. All rights reserved.</span>
      </footer>
    </div>
  `,
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly tiles = TILES;
  protected readonly seams = [90, 126, 162, 198, 234, 270];
  protected readonly cos = (d: number) => Math.cos(rad(d));
  protected readonly sin = (d: number) => Math.sin(rad(d));
  protected readonly features = [
    { icon: 'users', label: 'People Visibility', bg: 'linear-gradient(140deg, #a855f7, #6d28d9)' },
    { icon: 'clock', label: 'Attendance & Shifts', bg: 'linear-gradient(140deg, #38bdf8, #0e7490)' },
    { icon: 'shield-check', label: 'Access & Safety', bg: 'linear-gradient(140deg, #818cf8, #3730a3)' },
    { icon: 'file-chart', label: 'Workforce Insights', bg: 'linear-gradient(140deg, #34d399, #0f766e)' },
  ];
  /** skyline [x, height, width] */
  protected readonly far = [[20, 150, 40], [70, 210, 34], [150, 180, 46], [330, 230, 38], [420, 170, 52], [520, 250, 36], [600, 190, 44], [700, 220, 40], [790, 160, 50]];
  protected readonly near = [[0, 120, 46], [52, 190, 30], [88, 260, 36], [130, 160, 42], [178, 300, 28], [212, 220, 40], [262, 140, 34], [300, 330, 30], [336, 250, 44], [386, 190, 32], [424, 280, 38], [468, 150, 46], [520, 210, 30], [556, 120, 52]];
  protected readonly qrCells = buildQr();

  protected readonly view = signal<View>('signin');
  protected readonly email = signal(readRemembered());
  protected readonly password = signal('');
  protected readonly remember = signal(!!readRemembered());
  protected readonly showPw = signal(false);
  protected readonly moreOpen = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly errors = signal<{ email?: string; password?: string; otp?: string }>({});
  protected readonly otpSent = signal(false);
  protected readonly otp = signal(['', '', '', '', '', '']);
  protected readonly resendIn = signal(0);
  protected readonly qrIn = signal(60);

  private timers: ReturnType<typeof setInterval>[] = [];

  constructor() {
    this.timers.push(setInterval(() => {
      this.resendIn.update((s) => Math.max(0, s - 1));
      this.qrIn.update((s) => (s <= 1 ? 60 : s - 1));
    }, 1000));
  }

  ngOnDestroy() {
    this.timers.forEach(clearInterval);
  }

  protected go(v: View) {
    this.errors.set({});
    this.busy.set(null);
    if (v === 'otp') this.otpSent.set(false);
    this.view.set(v);
  }

  protected clear(k: 'email' | 'password' | 'otp') {
    if (this.errors()[k]) this.errors.update((e) => ({ ...e, [k]: undefined }));
  }

  protected signIn() {
    const e: { email?: string; password?: string } = {};
    if (!this.email().trim()) e.email = 'Please enter your email or username.';
    if (!this.password()) e.password = 'Please enter your password.';
    this.errors.set(e);
    this.authError.set('');
    if (e.email || e.password) return;
    const ok = this.email().trim().toLowerCase() === DEMO_USER.email && this.password() === DEMO_USER.password;
    this.busy.set('password');
    setTimeout(() => {
      if (!ok) {
        this.busy.set(null);
        this.password.set('');
        this.authError.set('Invalid email or password. Please try again.');
        return;
      }
      try {
        if (this.remember()) localStorage.setItem(REMEMBER, this.email().trim());
        else localStorage.removeItem(REMEMBER);
      } catch {}
      this.busy.set(null);
      this.success({ name: DEMO_USER.name, email: DEMO_USER.email, method: 'email & password' });
    }, 800);
  }

  protected readonly authError = signal('');

  protected readonly prov = signal<ProviderKind>('sso');
  protected readonly signed = signal<SignedIn>({ name: '', email: '', method: '' });
  protected readonly initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  protected provider(p: string) {
    if (p === 'qr') return this.finish('qr', 1800, 'QR code (mobile app)');
    this.prov.set(p as ProviderKind);
    this.go('provider');
  }

  protected success(s: SignedIn) {
    this.signed.set(s);
    this.view.set('success');
    try {
      sessionStorage.setItem(AUTH_KEY, '1');
    } catch {}
    setTimeout(() => this.router.navigateByUrl('/command-center/enterprise-overview-dashboard'), 1900);
  }

  protected sendReset() {
    if (!validEmail(this.email())) return this.errors.set({ email: 'Enter a valid work email address.' });
    this.busy.set('reset');
    setTimeout(() => { this.busy.set(null); this.view.set('sent'); }, 900);
  }

  protected sendOtp() {
    if (!validEmail(this.email())) return this.errors.set({ email: 'Enter a valid work email address.' });
    this.busy.set('otp');
    setTimeout(() => {
      this.busy.set(null);
      this.otpSent.set(true);
      this.otp.set(['', '', '', '', '', '']);
      this.resendIn.set(30);
      setTimeout(() => document.getElementById('otp0')?.focus());
    }, 800);
  }

  protected resendOtp() {
    if (this.resendIn()) return;
    this.resendIn.set(30);
    this.otp.set(['', '', '', '', '', '']);
  }

  protected setOtp(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    this.otp.update((o) => o.map((x, j) => (j === i ? d : x)));
    this.clear('otp');
    if (d && i < 5) document.getElementById('otp' + (i + 1))?.focus();
  }

  protected backOtp(i: number, ev: Event) {
    if (!this.otp()[i] && i > 0) {
      ev.preventDefault();
      this.otp.update((o) => o.map((x, j) => (j === i - 1 ? '' : x)));
      document.getElementById('otp' + (i - 1))?.focus();
    }
  }

  protected pasteOtp(ev: ClipboardEvent) {
    const digits = (ev.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    ev.preventDefault();
    this.otp.set([...digits.padEnd(6, ' ')].map((c) => c.trim()));
    document.getElementById('otp' + Math.min(5, digits.length))?.focus();
  }

  protected verifyOtp() {
    if (this.otp().join('').length < 6) return this.errors.set({ otp: 'Enter all 6 digits of the code.' });
    this.finish('otp', 900, 'Email OTP');
  }

  private finish(kind: string, ms: number, method: string) {
    this.busy.set(kind);
    const email = this.email().trim() || 'arjun.mehta@company.com';
    const local = email.split('@')[0].split('\\').pop() ?? 'user';
    const name = local.split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'User';
    setTimeout(() => {
      this.busy.set(null);
      this.success({ name: kind === 'qr' ? 'Arjun Mehta' : name, email: kind === 'qr' ? 'arjun.mehta@company.com' : email.includes('@') ? email : email + '@company.com', method });
    }, ms);
  }
}

function validEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER) ?? '';
  } catch {
    return '';
  }
}

/** Decorative QR-style matrix (finder patterns + seeded noise). */
function buildQr(): [number, number][] {
  const n = 29;
  const cells: [number, number][] = [];
  const finder = (x: number, y: number) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (edge || core) cells.push([x + i, y + j]);
      }
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  const inLogo = (x: number, y: number) => x >= 11 && x <= 17 && y >= 11 && y <= 17;
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) if (!inFinder(x, y) && !inLogo(x, y) && rnd() > 0.52) cells.push([x, y]);
  return cells;
}
