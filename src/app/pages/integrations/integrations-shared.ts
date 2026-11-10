// Shared bits for the Integrations module: vendor tile, connect wizard, small helpers.
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../../shared/icon';
import { Integ, IntegrationStore, SITE_NAMES } from './integrations.data';

/** Generic vendor tile: coloured square with initials (no real brand logos). */
@Component({
  selector: 'app-int-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="lg" [style.width.px]="size()" [style.height.px]="size()" [style.background]="it().color" [style.font-size.px]="fs()">{{ it().ini }}</span>`,
  styles: `
    :host { display: inline-flex; flex-shrink: 0; }
    .lg { display: grid; place-items: center; border-radius: 9px; color: var(--kf-ffffff); font-weight: 800; letter-spacing: -0.3px; font-family: 'Inter', sans-serif; box-shadow: inset 0 -3px 0 rgba(0,0,0,.12); }
  `,
})
export class IntLogo {
  readonly it = input.required<Integ>();
  readonly size = input(40);
  protected readonly fs = computed(() => {
    const n = this.it().ini.length;
    return Math.round(this.size() * (n >= 3 ? 0.32 : n === 2 ? 0.4 : 0.55));
  });
}

export function useToast() {
  const toast = signal<string | null>(null);
  let t: ReturnType<typeof setTimeout> | undefined;
  return {
    toast,
    show(m: string) {
      toast.set(m);
      clearTimeout(t);
      t = setTimeout(() => toast.set(null), 2600);
    },
  };
}

const STEPS = ['Authenticate', 'Configure', 'Data & Mapping', 'Test & Activate'];

/** Four-step install / connect wizard; on finish the connection is added to the shared store. */
@Component({
  selector: 'app-connect-wizard',
  imports: [Icon, IntLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    <div class="g-modal wide wiz" role="dialog">
      <div class="modal-head">
        <div class="wh"><app-int-logo [it]="it()" [size]="40" /><div><h3>Connect {{ it().name }}</h3><small>{{ it().vendor }} · {{ it().sub }} · {{ it().version }}</small></div></div>
        <button type="button" class="close-btn" (click)="closed.emit()">×</button>
      </div>
      <ol class="steps">
        @for (s of steps; track s; let i = $index) {
          <li [class.on]="step() === i" [class.done]="step() > i"><span>{{ step() > i ? '✓' : i + 1 }}</span>{{ s }}</li>
        }
      </ol>

      @switch (step()) {
        @case (0) {
          <div class="form-grid">
            <label>Environment<select class="select" [value]="env()" (change)="env.set($any($event.target).value)"><option>Production</option><option>Sandbox</option></select></label>
            <label>Authentication method<select class="select" [value]="auth()" (change)="auth.set($any($event.target).value)">@for (a of authOpts(); track a) {<option>{{ a }}</option>}</select></label>
            <label class="full">Base URL / tenant *<input class="input" [value]="url()" (input)="url.set($any($event.target).value)" placeholder="https://tenant.example.com/api" /></label>
            @if (auth() === 'API Key') {
              <label class="full">API key *<input class="input" type="password" [value]="secret()" (input)="secret.set($any($event.target).value)" /></label>
            } @else {
              <label>Client ID *<input class="input" [value]="client()" (input)="client.set($any($event.target).value)" /></label>
              <label>Client secret *<input class="input" type="password" [value]="secret()" (input)="secret.set($any($event.target).value)" /></label>
            }
          </div>
          <p class="hint"><app-icon name="shield-check" [size]="14" />Credentials are encrypted and stored in the People360 vault. Supported: {{ it().methods }}.</p>
        }
        @case (1) {
          <div class="cfg">
            <div>
              <h4>Sites in scope</h4>
              <div class="checks">
                @for (s of siteNames; track s) {
                  <label><input type="checkbox" [checked]="sites().includes(s)" (change)="toggle(sites, s)" />{{ s }}</label>
                }
              </div>
            </div>
            <div>
              <h4>Sync mode</h4>
              <div class="seg">
                <button type="button" [class.on]="mode() === 'Real-time'" (click)="mode.set('Real-time')">Real-time</button>
                <button type="button" [class.on]="mode() === 'Scheduled'" (click)="mode.set('Scheduled')">Scheduled</button>
              </div>
              @if (mode() === 'Scheduled') {
                <label class="lbl">Frequency<select class="select" [value]="freq()" (change)="freq.set($any($event.target).value)"><option>Every 15 min</option><option>Hourly</option><option>Every 6 hours</option><option>Daily 02:00</option></select></label>
              }
              <label class="lbl">Direction<select class="select" [value]="dir()" (change)="dir.set($any($event.target).value)"><option>Bi-directional</option><option>Inbound to People360</option><option>Outbound from People360</option></select></label>
            </div>
          </div>
        }
        @case (2) {
          <h4>Data objects</h4>
          <div class="checks row">
            @for (o of it().objects; track o) {
              <label><input type="checkbox" [checked]="objs().includes(o)" (change)="toggle(objs, o)" />{{ o }}</label>
            }
          </div>
          <h4>Default field mapping <span class="muted">(editable later in Data Mapping &amp; Transformation)</span></h4>
          <table class="table">
            <thead><tr><th>{{ it().name }} field</th><th></th><th>People360 field</th><th>Transform</th></tr></thead>
            <tbody>
              @for (m of mapPreview; track m[0]) {<tr><td><code>{{ m[0] }}</code></td><td>→</td><td><code>{{ m[1] }}</code></td><td><span class="tag grey">{{ m[2] }}</span></td></tr>}
            </tbody>
          </table>
        }
        @case (3) {
          <ul class="tests">
            @for (t of tests; track t; let i = $index) {
              <li [class.ok]="testAt() > i" [class.run]="testAt() === i && testing()">
                <span class="ti">{{ testAt() > i ? '✓' : testAt() === i && testing() ? '' : '•' }}</span>{{ t }}
                @if (testAt() > i) {<small>{{ 80 + i * 47 }} ms</small>}
              </li>
            }
          </ul>
          @if (testAt() >= tests.length) {
            <div class="ok-box"><app-icon name="integrations-check" [size]="18" />All checks passed. {{ it().name }} is ready to activate for {{ sites().length }} site(s), {{ mode().toLowerCase() }} sync.</div>
          }
        }
      }
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions">
        @if (step() > 0) {<button type="button" class="btn-ghost" (click)="step.set(step() - 1)">Back</button>}
        <button type="button" class="btn-ghost" (click)="closed.emit()">Cancel</button>
        @if (step() < 3) {
          <button type="button" class="btn-primary" (click)="next()">Continue</button>
        } @else if (testAt() < tests.length) {
          <button type="button" class="btn-primary" [disabled]="testing()" (click)="runTests()">{{ testing() ? 'Testing…' : 'Test connection' }}</button>
        } @else {
          <button type="button" class="btn-primary" (click)="activate()"><app-icon name="plug" [size]="15" />Activate integration</button>
        }
      </div>
    </div>
  `,
  styles: `
    .wiz { width: min(760px, calc(100vw - 32px)); }
    .wh { display: flex; gap: 12px; align-items: center; } .wh h3 { margin: 0; } .wh small { color: var(--muted); }
    .steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 18px; counter-reset: s; }
    .steps li { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); padding: 8px 10px; border-radius: 8px; background: var(--kb-f6f6fb); }
    .steps li span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-e4e6ef); font-size: 11px; font-weight: 700; color: var(--kf-4b4f6b); }
    .steps li.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; } .steps li.on span { background: var(--primary); color: var(--kf-ffffff); }
    .steps li.done span { background: var(--kb-22c55e); color: var(--kf-ffffff); }
    .hint { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); margin: 12px 0 0; }
    h4 { margin: 0 0 8px; font-size: 13px; } h4 .muted { font-weight: 400; font-size: 11.5px; }
    .cfg { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .checks { display: flex; flex-direction: column; gap: 7px; font-size: 13px; margin-bottom: 14px; } .checks.row { flex-direction: row; flex-wrap: wrap; gap: 8px 16px; }
    .checks label { display: flex; gap: 7px; align-items: center; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 12px; }
    .seg button { border: 0; background: var(--kb-ffffff); padding: 7px 14px; font-size: 12.5px; cursor: pointer; } .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
    .lbl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); margin-bottom: 10px; }
    code { font-size: 12px; background: var(--kb-f3f3f8); padding: 1px 5px; border-radius: 4px; }
    .tests { list-style: none; padding: 0; margin: 0 0 12px; } .tests li { display: flex; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; color: var(--muted); }
    .tests li small { margin-left: auto; color: var(--muted); } .tests li.ok { color: var(--text); } .tests li.ok .ti { background: var(--kb-22c55e); color: var(--kf-ffffff); }
    .ti { width: 20px; height: 20px; border-radius: 50%; background: var(--kb-eef0f5); display: grid; place-items: center; font-size: 11px; }
    .tests li.run .ti { border: 2px solid var(--primary); border-top-color: transparent; animation: spin .8s linear infinite; background: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ok-box { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-size: 13px; }
    .bad { margin: 10px 0 0; font-size: 12.5px; }
  `,
})
export class ConnectWizard {
  private readonly store = inject(IntegrationStore);
  private readonly router = inject(Router);
  readonly it = input.required<Integ>();
  readonly closed = output<void>();
  readonly done = output<string>();
  protected readonly steps = STEPS;
  protected readonly siteNames = SITE_NAMES;
  protected readonly step = signal(0);
  protected readonly env = signal<'Production' | 'Sandbox'>('Production');
  protected readonly auth = signal('');
  protected readonly url = signal('');
  protected readonly client = signal('people360-connector');
  protected readonly secret = signal('demo-secret-7f3a91');
  protected readonly sites = signal<string[]>([...SITE_NAMES]);
  protected readonly mode = signal<'Real-time' | 'Scheduled'>('Real-time');
  protected readonly freq = signal('Hourly');
  protected readonly dir = signal('Bi-directional');
  protected readonly objs = signal<string[]>([]);
  protected readonly err = signal('');
  protected readonly testing = signal(false);
  protected readonly testAt = signal(0);
  protected readonly tests = ['Resolve endpoint & TLS handshake', 'Authenticate with provided credentials', 'Read schema & permissions', 'Fetch sample records (5)', 'Write test record to sandbox queue'];
  protected readonly mapPreview = [
    ['employee_id', 'employeeNumber', 'None'], ['first_name', 'firstName', 'Title Case'], ['last_name', 'lastName', 'Title Case'],
    ['email_address', 'email', 'Lowercase'], ['org_unit', 'department', 'Lookup: Department'], ['location', 'site', 'Lookup: Site'],
  ];
  protected readonly authOpts = computed(() => {
    const a = this.it().auth.split(' / ').map((x) => x.trim());
    return a.includes('API Key') ? a : [...a, 'API Key'];
  });

  ngOnInit() {
    const it = this.it();
    this.auth.set(this.authOpts()[0]);
    this.url.set(`https://${it.id}.tenant.example.com/api`);
    this.objs.set(it.objects.slice(0, 3));
    this.mode.set(it.sync.startsWith('Scheduled') ? 'Scheduled' : 'Real-time');
  }
  protected toggle(s: typeof this.sites, v: string) {
    s.update((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));
  }
  protected next() {
    this.err.set('');
    if (this.step() === 0 && (!this.url().trim() || !this.secret().trim())) return this.err.set('Enter the base URL and a secret / API key to continue (any value works in this demo).');
    if (this.step() === 1 && !this.sites().length) return this.err.set('Select at least one site.');
    if (this.step() === 2 && !this.objs().length) return this.err.set('Select at least one data object.');
    this.step.update((s) => s + 1);
  }
  protected runTests() {
    this.testing.set(true);
    this.testAt.set(0);
    const tickStep = () => {
      this.testAt.update((v) => v + 1);
      if (this.testAt() < this.tests.length) setTimeout(tickStep, 380);
      else this.testing.set(false);
    };
    setTimeout(tickStep, 380);
  }
  protected activate() {
    const c = this.store.connect(this.it().id, { sites: this.sites(), mode: this.mode(), freq: this.mode() === 'Scheduled' ? this.freq() : 'Event driven', env: this.env(), auth: this.auth() });
    this.done.emit(c.id);
  }
  goConnected() {
    this.router.navigateByUrl('/integrations-api-hub/connected-systems');
  }
}

/** Badge used on integration cards. */
@Component({
  selector: 'app-int-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (kind() === 'Popular') {<span class="b pop">★ Popular</span>} @else {<span class="b cert"><i></i>Certified</span>}`,
  styles: `
    .b { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 4px; font-size: 10.5px; font-weight: 500; white-space: nowrap; }
    .cert { background: var(--kb-e8f8ee); color: var(--kf-15803d); } .cert i { width: 8px; height: 8px; border-radius: 50%; background: var(--kb-22c55e); }
    .pop { background: var(--kb-f1ebff); color: var(--kf-6d28d9); }
  `,
})
export class IntBadge {
  readonly kind = input.required<'Certified' | 'Popular'>();
}
