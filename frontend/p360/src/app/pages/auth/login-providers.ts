// themify: off — provider brand colors are fixed; everything else uses theme tokens.
import { ChangeDetectionStrategy, Component, OnDestroy, computed, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/icon';

export type ProviderKind = 'sso' | 'microsoft' | 'google' | 'passkey' | 'ad' | 'ldap';
export interface SignedIn {
  name: string;
  email: string;
  method: string;
}

interface Account {
  name: string;
  email: string;
  color: string;
}

const ACCOUNTS: Account[] = [
  { name: 'Arjun Mehta', email: 'arjun.mehta@company.com', color: '#7c3aed' },
  { name: 'Priya Sharma', email: 'priya.sharma@company.com', color: '#0891b2' },
  { name: 'Ahmed Hassan', email: 'ahmed.hassan@company.com', color: '#ea580c' },
];

const TITLES: Record<ProviderKind, string> = {
  sso: 'Enterprise SSO',
  microsoft: 'Microsoft',
  google: 'Google',
  passkey: 'Passkey',
  ad: 'Active Directory',
  ldap: 'LDAP',
};

interface Task {
  label: string;
  detail: string;
  state: 'wait' | 'run' | 'ok' | 'fail';
}

const nameFromEmail = (e: string) =>
  e
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'User';

const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** Simulated, front-end-only sign-in flows for each external provider. */
@Component({
  selector: 'app-login-provider',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="back" (click)="stepBack()"><app-icon name="lg-arrow-left" [size]="17" />{{ canStepBack() ? 'Back' : 'Back to sign in' }}</button>

    <div class="badge-row">
      <span class="pbadge" [class]="'pbadge ' + kind()">
        @switch (kind()) {
          @case ('microsoft') {
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect width="10" height="10" fill="#f25022" /><rect x="12" width="10" height="10" fill="#7fba00" /><rect y="12" width="10" height="10" fill="#00a4ef" /><rect x="12" y="12" width="10" height="10" fill="#ffb900" /></svg>
          }
          @case ('google') {
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#ffc107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" /><path fill="#ff3d00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4caf50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976d2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" /></svg>
          }
          @case ('sso') {<app-icon name="building" [size]="22" />}
          @case ('passkey') {<app-icon name="lg-key" [size]="22" />}
          @case ('ad') {
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 4.5 10 3.4v7.9H2zM11 3.3 22 2v9.3H11zM2 12.4h8v7.9l-8-1.1zM11 12.4h11V22l-11-1.5z" /></svg>
          }
          @case ('ldap') {<app-icon name="lg-server" [size]="22" />}
        }
      </span>
      <span class="ptitle">{{ title() }}</span>
      @if (stepCount() > 1) {
        <span class="dots" [attr.aria-label]="'Step ' + (stepIndex() + 1) + ' of ' + stepCount()">
          @for (d of dots(); track $index) {
            <i [class.on]="$index <= stepIndex()"></i>
          }
        </span>
      }
    </div>

    <div class="stage" [attr.data-step]="step()">
      @switch (step()) {
        @case ('pick') {
          <h2>{{ kind() === 'google' ? 'Choose an account' : 'Pick an account' }}</h2>
          <p class="sub">to continue to <b>People360</b></p>
          <ul class="accts">
            @for (a of accounts; track a.email) {
              <li>
                <button (click)="chooseAccount(a)">
                  <span class="av" [style.background]="a.color">{{ ini(a.name) }}</span>
                  <span class="who"><b>{{ a.name }}</b><small>{{ a.email }}</small></span>
                  @if ($first) {<span class="tag">Signed in</span>}
                  <app-icon name="lg-arrow-right" [size]="16" />
                </button>
              </li>
            }
            <li>
              <button (click)="go('email')">
                <span class="av ghost"><app-icon name="user-plus" [size]="18" /></span>
                <span class="who"><b>Use another account</b></span>
              </button>
            </li>
          </ul>
        }
        @case ('email') {
          <h2>{{ kind() === 'sso' ? 'Sign in with SSO' : 'Sign in' }}</h2>
          <p class="sub">{{ kind() === 'sso' ? 'Enter your work email and we will find your organization.' : 'Enter the email for your ' + title() + ' account.' }}</p>
          <form (submit)="$event.preventDefault(); submitEmail()" novalidate>
            <label class="fl">Work email</label>
            <div class="inp" [class.err]="err()">
              <app-icon name="lg-mail" [size]="19" />
              <input #em type="email" placeholder="name@company.com" [value]="email()" (input)="email.set($any($event.target).value); err.set('')" autofocus />
            </div>
            @if (err()) {<small class="em">{{ err() }}</small>}
            <button class="primary" type="submit">Continue <app-icon name="lg-arrow-right" [size]="19" /></button>
          </form>
          @if (kind() === 'sso') {
            <p class="hint"><app-icon name="shield-check" [size]="15" />Your organization controls this sign-in. People360 never sees your SSO password.</p>
          }
        }
        @case ('wait') {
          <div class="center">
            <i class="spin big"></i>
            <h3>{{ waitText() }}</h3>
            <p class="sub">{{ waitSub() }}</p>
          </div>
        }
        @case ('org') {
          <h2>Organization found</h2>
          <p class="sub">We matched <b>{{ domain() }}</b> to your company's identity provider.</p>
          <div class="org">
            <span class="ologo">{{ orgName()[0] }}</span>
            <div><b>{{ orgName() }}</b><small>{{ domain() }} · 2,846 users</small></div>
            <span class="okchip"><app-icon name="lg-check" [size]="13" [stroke]="3" />Verified</span>
          </div>
          <div class="kv">
            <span>Identity provider</span><b><i class="okta"></i>Okta Workforce Identity</b>
            <span>Protocol</span><b>SAML 2.0</b>
            <span>Policy</span><b>MFA required</b>
          </div>
          <button class="primary" (click)="go('idp')">Continue to Okta <app-icon name="lg-arrow-right" [size]="19" /></button>
          <p class="foot"><button class="link" (click)="go('email')">Not your organization?</button></p>
        }
        @case ('idp') {
          <div class="who-row">
            <span class="av sm" [style.background]="account().color">{{ ini(account().name) }}</span>
            <span><b>{{ account().email }}</b><small>{{ kind() === 'sso' ? orgName() + ' · Okta' : 'Microsoft account' }}</small></span>
          </div>
          <h2>Enter password</h2>
          <form (submit)="$event.preventDefault(); submitPassword()" novalidate>
            <div class="inp" [class.err]="err()">
              <app-icon name="lg-lock" [size]="19" />
              <input type="password" placeholder="Password" [value]="pw()" (input)="pw.set($any($event.target).value); err.set('')" autofocus />
            </div>
            @if (err()) {<small class="em">{{ err() }}</small>}
            <div class="row"><button type="button" class="link" (click)="toast('A reset link was sent to ' + account().email)">Forgot password?</button></div>
            <button class="primary" type="submit">Sign in <app-icon name="lg-arrow-right" [size]="19" /></button>
          </form>
        }
        @case ('mfa') {
          <div class="center">
            <div class="phone">
              <span class="notch"></span>
              <small>{{ kind() === 'sso' ? 'Okta Verify' : 'Authenticator' }}</small>
              <b>Approve sign-in?</b>
              <span class="nums">
                @for (n of mfaChoices(); track n) {
                  <i [class.on]="mfaApproved() && n === mfaNumber()">{{ n }}</i>
                }
              </span>
            </div>
            <h3>Approve sign-in request</h3>
            <p class="sub">Open {{ kind() === 'sso' ? 'Okta Verify' : 'Microsoft Authenticator' }} on your phone and tap the number</p>
            <div class="bignum">{{ mfaNumber() }}</div>
            @if (!mfaApproved()) {
              <p class="sub small">Waiting for approval… <b>{{ mfaLeft() }}s</b></p>
              <button class="primary ghost" (click)="approveMfa()">I've approved it on my phone</button>
              <p class="foot"><button class="link" (click)="denyMfa()">I can't use my app right now</button></p>
            } @else {
              <p class="okline"><app-icon name="lg-check-circle" [size]="18" />Request approved</p>
            }
          </div>
        }
        @case ('stay') {
          <div class="who-row">
            <span class="av sm" [style.background]="account().color">{{ ini(account().name) }}</span>
            <span><b>{{ account().email }}</b><small>Microsoft account</small></span>
          </div>
          <h2>Stay signed in?</h2>
          <p class="sub">Do this to reduce the number of times you are asked to sign in.</p>
          <label class="cb"><input type="checkbox" [checked]="dontAsk()" (change)="dontAsk.set($any($event.target).checked)" /><span><app-icon name="lg-check" [size]="13" [stroke]="3" /></span>Don't show this again</label>
          <div class="btns">
            <button class="secondary" (click)="complete()">No</button>
            <button class="primary" (click)="complete()">Yes</button>
          </div>
        }
        @case ('consent') {
          <div class="consent-head">
            <span class="applogo">P<b>360</b></span>
            <span class="link-line"></span>
            <span class="av" [style.background]="account().color">{{ ini(account().name) }}</span>
          </div>
          <h2>People360 wants to access your Google Account</h2>
          <p class="sub acct">{{ account().email }}</p>
          <p class="lead">This will allow People360 to:</p>
          <ul class="perms">
            <li><app-icon name="user" [size]="18" /><span><b>See your personal info</b><small>Name and profile picture</small></span></li>
            <li><app-icon name="lg-mail" [size]="18" /><span><b>See your primary email address</b><small>{{ account().email }}</small></span></li>
            <li><app-icon name="building" [size]="18" /><span><b>Associate you with your organization</b><small>Google Workspace domain {{ account().email.split('@')[1] }}</small></span></li>
          </ul>
          <p class="fine">Make sure you trust People360. You can review or remove access at any time in your Google Account settings.</p>
          <div class="btns">
            <button class="secondary" (click)="back.emit()">Cancel</button>
            <button class="primary" (click)="waitThen('Signing you in…', 'Verifying Google token', 1100, () => complete())">Continue</button>
          </div>
        }
        @case ('passkey') {
          <div class="center">
            <div class="fp" [class.scan]="pkState() === 'scan'" [class.ok]="pkState() === 'ok'" [class.fail]="pkState() === 'fail'">
              @if (pkState() === 'ok') {
                <app-icon name="lg-check" [size]="54" [stroke]="2.6" />
              } @else {
                <app-icon name="fingerprint" [size]="58" [stroke]="1.5" />
              }
              <i class="ring"></i>
            </div>
            @switch (pkState()) {
              @case ('idle') {
                <h3>Use your passkey</h3>
                <p class="sub">Sign in to <b>people360</b> with the passkey saved on this device. Touch the sensor or use face recognition when prompted.</p>
                <button class="primary" (click)="scanPasskey()"><app-icon name="fingerprint" [size]="19" />Continue with passkey</button>
                <button class="secondary wide" (click)="go('pkphone')"><app-icon name="th-monitor" [size]="18" />Use a phone or tablet</button>
              }
              @case ('scan') {
                <h3>Verifying…</h3>
                <p class="sub">Keep your finger on the sensor</p>
              }
              @case ('ok') {
                <h3>Identity verified</h3>
                <p class="sub">Passkey for <b>{{ account().email }}</b></p>
              }
              @case ('fail') {
                <h3>Not recognized</h3>
                <p class="sub">That didn't work. Try again or use another sign-in method.</p>
                <button class="primary" (click)="scanPasskey()">Try again</button>
              }
            }
          </div>
        }

        @case ('pkphone') {
          <h2>Use a phone or tablet</h2>
          <p class="sub">Scan this QR code with the device that has your passkey. Bluetooth must be on.</p>
          <div class="qr">
            <svg viewBox="0 0 25 25" shape-rendering="crispEdges" aria-label="Passkey QR code">
              @for (c of qr; track $index) {
                <rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" />
              }
            </svg>
            <i class="scan"></i>
          </div>
          <p class="sub small center-t"><i class="pulse"></i>Waiting for your device…</p>
          <button class="primary ghost" (click)="waitThen('Connecting to your phone…', 'Verifying passkey over Bluetooth', 1500, () => complete())">Simulate scan from phone</button>
        }
        @case ('dir') {
          <h2>{{ kind() === 'ad' ? 'Sign in with Active Directory' : 'Sign in with LDAP' }}</h2>
          <p class="sub">{{ kind() === 'ad' ? 'Use your Windows domain account.' : 'Authenticate against your directory server.' }}</p>
          <form (submit)="$event.preventDefault(); submitDirectory()" novalidate>
            <label class="fl">{{ kind() === 'ad' ? 'Domain' : 'Directory server' }}</label>
            <div class="inp">
              <app-icon [name]="kind() === 'ad' ? 'building' : 'lg-server'" [size]="19" />
              <select [value]="server()" (change)="server.set($any($event.target).value)">
                @for (s of servers(); track s) {<option [value]="s">{{ s }}</option>}
              </select>
            </div>
            <label class="fl">Username</label>
            <div class="inp" [class.err]="err() && !user().trim()">
              <app-icon name="user" [size]="19" />
              <input placeholder="{{ kind() === 'ad' ? 'e.g. arjun.mehta' : 'e.g. amehta' }}" [value]="user()" (input)="user.set($any($event.target).value); err.set('')" autocomplete="username" />
            </div>
            <label class="fl">Password</label>
            <div class="inp" [class.err]="err() && user().trim()">
              <app-icon name="lg-lock" [size]="19" />
              <input type="password" placeholder="Password" [value]="pw()" (input)="pw.set($any($event.target).value); err.set('')" autocomplete="current-password" />
            </div>
            @if (err()) {<small class="em">{{ err() }}</small>}
            <p class="preview">Signing in as <code>{{ principal() }}</code></p>
            <button class="primary" type="submit">Sign in <app-icon name="lg-arrow-right" [size]="19" /></button>
          </form>
        }

        @case ('tasks') {
          <h2>{{ failed() ? 'Sign-in failed' : 'Authenticating…' }}</h2>
          <p class="sub"><code>{{ principal() }}</code> · {{ server() }}</p>
          <ol class="tasks">
            @for (t of tasks(); track t.label) {
              <li [class]="t.state">
                <span class="ti">
                  @if (t.state === 'ok') {<app-icon name="lg-check" [size]="14" [stroke]="3" />} @else if (t.state === 'fail') {<b class="x">✕</b>} @else if (t.state === 'run') {<i class="spin sm"></i>}
                </span>
                <span><b>{{ t.label }}</b><small>{{ t.detail }}</small></span>
              </li>
            }
          </ol>
          @if (failed()) {
            <div class="alert"><app-icon name="lg-lock" [size]="17" /><span><b>Invalid credentials</b><small>{{ kind() === 'ad' ? 'The user name or password is incorrect (0x52e).' : 'LDAP bind failed: invalid credentials (49).' }}</small></span></div>
            <button class="primary" (click)="go('dir')">Try again</button>
          }
        }
      }
    </div>

    @if (toastMsg()) {
      <div class="toast"><app-icon name="lg-check-circle" [size]="16" />{{ toastMsg() }}</div>
    }
    <p class="demo">Simulated {{ title() }} sign-in for demo purposes.</p>
  `,
  styleUrls: ['./login.scss', './login-providers.scss'],
})
export class LoginProvider implements OnDestroy {
  readonly kind = input.required<ProviderKind>();
  readonly back = output<void>();
  readonly done = output<SignedIn>();

  protected readonly accounts = ACCOUNTS;
  protected readonly ini = initials;
  protected readonly qr = buildQr(25);

  protected readonly step = signal<string>('');
  protected readonly history = signal<string[]>([]);
  protected readonly email = signal('');
  protected readonly pw = signal('');
  protected readonly err = signal('');
  protected readonly account = signal<Account>(ACCOUNTS[0]);
  protected readonly waitText = signal('');
  protected readonly waitSub = signal('');
  protected readonly toastMsg = signal('');
  protected readonly dontAsk = signal(false);
  // MFA
  protected readonly mfaNumber = signal(0);
  protected readonly mfaChoices = signal<number[]>([]);
  protected readonly mfaApproved = signal(false);
  protected readonly mfaLeft = signal(60);
  // passkey
  protected readonly pkState = signal<'idle' | 'scan' | 'ok' | 'fail'>('idle');
  // directory
  protected readonly server = signal('');
  protected readonly user = signal('');
  protected readonly tasks = signal<Task[]>([]);
  protected readonly failed = signal(false);

  private timers: ReturnType<typeof setTimeout>[] = [];

  protected readonly title = computed(() => TITLES[this.kind()]);
  protected readonly domain = computed(() => this.email().split('@')[1] ?? '');
  protected readonly orgName = computed(() => {
    const d = this.domain().split('.')[0] ?? '';
    return d ? d[0].toUpperCase() + d.slice(1) + ' Group' : 'Your organization';
  });
  protected readonly servers = computed(() =>
    this.kind() === 'ad' ? ['CORP (corp.company.local)', 'HQ (hq.company.local)', 'DXB (dubai.company.local)'] : ['ldaps://ldap.company.com:636', 'ldaps://ldap-dr.company.com:636', 'ldap://10.20.0.15:389'],
  );
  protected readonly principal = computed(() => {
    const u = this.user().trim() || 'username';
    if (this.kind() === 'ad') return this.server().split(' ')[0] + '\\' + u;
    return 'uid=' + u + ',ou=people,dc=company,dc=com';
  });

  private readonly FLOW: Record<ProviderKind, string[]> = {
    sso: ['email', 'org', 'idp', 'mfa'],
    microsoft: ['pick', 'idp', 'mfa', 'stay'],
    google: ['pick', 'consent'],
    passkey: ['passkey'],
    ad: ['dir', 'tasks'],
    ldap: ['dir', 'tasks'],
  };
  protected readonly stepCount = computed(() => this.FLOW[this.kind()].length);
  protected readonly dots = computed(() => Array(this.stepCount()).fill(0));
  protected readonly stepIndex = computed(() => {
    const f = this.FLOW[this.kind()];
    const s = this.step() === 'email' && this.kind() !== 'sso' ? 'pick' : this.step() === 'pkphone' ? 'passkey' : this.step();
    const i = f.indexOf(s);
    return i < 0 ? Math.max(0, f.indexOf(this.history().at(-1) ?? '')) : i;
  });
  protected readonly canStepBack = computed(() => this.history().length > 0 && this.step() !== 'wait');

  ngOnInit() {
    const k = this.kind();
    this.server.set(this.servers()[0]);
    this.step.set(this.FLOW[k][0]);
  }

  ngOnDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  protected go(s: string) {
    this.err.set('');
    const cur = this.step();
    if (cur && cur !== 'wait' && cur !== s) this.history.update((h) => [...h, cur]);
    this.step.set(s);
    if (s === 'mfa') this.startMfa();
    if (s === 'passkey') this.pkState.set('idle');
  }

  protected stepBack() {
    const h = this.history();
    if (!h.length || this.step() === 'wait') return this.back.emit();
    this.err.set('');
    this.step.set(h[h.length - 1]);
    this.history.set(h.slice(0, -1));
    if (this.step() === 'passkey') this.pkState.set('idle');
  }

  /** Show a spinner step, then run `next`. */
  protected waitThen(text: string, sub: string, ms: number, next: () => void) {
    const cur = this.step();
    if (cur !== 'wait') this.history.update((h) => [...h, cur]);
    this.waitText.set(text);
    this.waitSub.set(sub);
    this.step.set('wait');
    this.later(ms, () => {
      this.history.update((h) => h.slice(0, -1));
      this.step.set(cur);
      next();
    });
  }

  protected toast(msg: string) {
    this.toastMsg.set(msg);
    this.later(2600, () => this.toastMsg.set(''));
  }

  protected chooseAccount(a: Account) {
    this.account.set(a);
    this.email.set(a.email);
    if (this.kind() === 'google') this.waitThen('One moment…', 'Connecting to Google', 700, () => this.go('consent'));
    else this.go('idp');
  }

  protected submitEmail() {
    const e = this.email().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return this.err.set('Enter a valid email address.');
    const known = ACCOUNTS.find((a) => a.email === e);
    this.account.set(known ?? { name: nameFromEmail(e), email: e, color: '#4f46e5' });
    if (this.kind() === 'sso') this.waitThen('Finding your organization…', 'Looking up ' + e.split('@')[1], 1100, () => this.go('org'));
    else if (this.kind() === 'google') this.waitThen('One moment…', 'Connecting to Google', 700, () => this.go('consent'));
    else this.go('idp');
  }

  protected submitPassword() {
    if (!this.pw()) return this.err.set('Please enter your password.');
    if (this.pw().length < 4) return this.err.set('Your account or password is incorrect.');
    const via = this.kind() === 'sso' ? 'Okta' : 'Microsoft';
    this.waitThen('Verifying…', 'Checking your credentials with ' + via, 900, () => this.go('mfa'));
  }

  private startMfa() {
    const n = 10 + Math.floor(Math.random() * 89);
    const others = [10 + ((n + 23) % 89), 10 + ((n + 51) % 89)];
    const choices = [n, ...others].sort(() => Math.random() - 0.5);
    this.mfaNumber.set(n);
    this.mfaChoices.set(choices);
    this.mfaApproved.set(false);
    this.mfaLeft.set(60);
    const tick = () => {
      if (this.step() !== 'mfa' || this.mfaApproved()) return;
      this.mfaLeft.update((s) => s - 1);
      if (this.mfaLeft() <= 0) return this.denyMfa();
      this.later(1000, tick);
    };
    this.later(1000, tick);
    // auto-approve after a few seconds so the demo flows on its own
    this.later(6000, () => this.step() === 'mfa' && !this.mfaApproved() && this.approveMfa());
  }

  protected approveMfa() {
    this.mfaApproved.set(true);
    this.later(1100, () => {
      if (this.kind() === 'microsoft') this.go('stay');
      else this.waitThen('Signing you in…', 'Receiving SAML assertion from Okta', 1000, () => this.complete());
    });
  }

  protected denyMfa() {
    this.toast('Request expired. We sent a new one.');
    this.startMfa();
  }

  protected scanPasskey() {
    this.pkState.set('scan');
    this.later(1700, () => {
      this.pkState.set('ok');
      this.later(1000, () => this.complete());
    });
  }

  protected submitDirectory() {
    if (!this.user().trim()) return this.err.set('Enter your username.');
    if (!this.pw()) return this.err.set('Enter your password.');
    const bad = this.pw().length < 4;
    const ad = this.kind() === 'ad';
    const host = this.server().split(' ')[0];
    const list: Task[] = ad
      ? [
          { label: 'Locating domain controller', detail: 'dc01.' + (this.server().match(/\((.*)\)/)?.[1] ?? 'corp.local'), state: 'wait' },
          { label: 'Verifying credentials', detail: 'Kerberos pre-authentication', state: 'wait' },
          { label: 'Loading group memberships', detail: 'Domain Users, HR-Admins, People360-Users', state: 'wait' },
          { label: 'Mapping People360 role', detail: 'Administrator', state: 'wait' },
        ]
      : [
          { label: 'Connecting to server', detail: host + (host.startsWith('ldaps') ? ' · TLS 1.3' : ' · StartTLS'), state: 'wait' },
          { label: 'Binding as user', detail: this.principal(), state: 'wait' },
          { label: 'Searching group memberships', detail: '(member=' + this.principal() + ')', state: 'wait' },
          { label: 'Mapping People360 role', detail: 'cn=p360-admins → Administrator', state: 'wait' },
        ];
    this.tasks.set(list);
    this.failed.set(false);
    this.go('tasks');
    const run = (i: number) => {
      if (i >= list.length) return this.later(500, () => this.complete());
      this.tasks.update((t) => t.map((x, j) => (j === i ? { ...x, state: 'run' } : x)));
      this.later(750, () => {
        if (bad && i === 1) {
          this.tasks.update((t) => t.map((x, j) => (j === i ? { ...x, state: 'fail' } : x)));
          this.failed.set(true);
          this.pw.set('');
          return;
        }
        this.tasks.update((t) => t.map((x, j) => (j === i ? { ...x, state: 'ok' } : x)));
        run(i + 1);
      });
    };
    this.later(300, () => run(0));
  }

  protected complete() {
    const a = this.account();
    if (this.kind() === 'ad' || this.kind() === 'ldap') {
      const u = this.user().trim().split(/[\\@]/).pop() ?? 'user';
      const n = nameFromEmail(u);
      return this.done.emit({ name: n, email: u.toLowerCase() + '@company.com', method: this.title() });
    }
    this.done.emit({ name: a.name, email: a.email, method: this.title() });
  }
}

function buildQr(n: number): [number, number][] {
  const cells: [number, number][] = [];
  const finder = (x: number, y: number) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) cells.push([x + i, y + j]);
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  let s = 11;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) {
      const f = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!f && rnd() > 0.5) cells.push([x, y]);
    }
  return cells;
}
