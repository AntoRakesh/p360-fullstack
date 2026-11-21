import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { AdminStore, fmtStamp } from './admin.data';
import { ADMIN_CSS, AdminSwitch, AdminToast } from './admin-ui';

const SECTIONS = [
  { id: 'general', label: 'General', icon: 'settings', desc: 'Formats, calendar, units' },
  { id: 'security', label: 'Security & Sign-in', icon: 'shield-check', desc: 'Passwords, MFA, sessions' },
  { id: 'notify', label: 'Notifications & Email', icon: 'bell', desc: 'SMTP, SMS, push, digests' },
  { id: 'backup', label: 'Backup & Recovery', icon: 'admin-database', desc: 'Schedule, region, restore' },
  { id: 'maint', label: 'Maintenance', icon: 'admin-server', desc: 'Windows, maintenance mode' },
  { id: 'api', label: 'API & Integrations', icon: 'plug', desc: 'Rate limits, webhooks, keys' },
  { id: 'adv', label: 'Advanced', icon: 'sliders', desc: 'Logging, AI, beta features' },
] as const;
type Sec = (typeof SECTIONS)[number]['id'];

@Component({
  selector: 'app-admin-system-settings',
  imports: [...UI, AdminSwitch, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="System Settings" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Platform-wide configuration for formats, security, notifications, backups and integrations.">
      <button class="btn-ghost" [disabled]="!dirty()" (click)="discard()">Discard</button>
      <button class="btn-primary" [disabled]="!dirty()" (click)="save()"><app-icon name="admin-save" [size]="16" />Save Changes</button>
    </app-page-head>
    @if (sys().maintenance) {<p class="note warn"><app-icon name="triangle-alert" [size]="16" />Maintenance mode is ON — only administrators can sign in.</p>}

    <section class="split left">
      <div class="card"><ul class="side">
        @for (s of sections; track s.id) {<li><button [class.on]="sec() === s.id" (click)="sec.set(s.id)"><app-icon [name]="s.icon" [size]="17" /><span class="grow">{{ s.label }}<small>{{ s.desc }}</small></span></button></li>}
      </ul></div>

      <div class="card">
        @let y = sys(); @let x = sec_();
        @switch (sec()) {
          @case ('general') {
            <h3 class="ct">General</h3>
            <div class="fgrid">
              <label class="field">Date format<select class="select" [value]="y.dateFormat" (change)="s('dateFormat', v($event))"><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
              <label class="field">Time format<select class="select" [value]="y.timeFormat" (change)="s('timeFormat', v($event))"><option>12-hour</option><option>24-hour</option></select></label>
              <label class="field">First day of week<select class="select" [value]="y.weekStart" (change)="s('weekStart', v($event))"><option>Sunday</option><option>Monday</option><option>Saturday</option></select></label>
              <label class="field">Weekend<select class="select" [value]="y.weekend" (change)="s('weekend', v($event))"><option>Sat-Sun</option><option>Fri-Sat</option><option>Fri only</option></select></label>
              <label class="field">Units<select class="select" [value]="y.units" (change)="s('units', v($event))"><option>Metric</option><option>Imperial</option></select></label>
              <label class="field">Tenant time zone<input class="input" [value]="store.org().timeZone" disabled /></label>
            </div>
            <p class="note"><app-icon name="clock" [size]="15" />Preview: {{ preview() }}</p>
          }
          @case ('security') {
            <h3 class="ct">Security &amp; Sign-in</h3>
            <div class="fgrid">
              <label class="field">MFA policy<select class="select" [value]="x.mfa" (change)="z('mfa', v($event))"><option>Off</option><option>Required for admins</option><option>Required for all users</option></select></label>
              <label class="field">Identity provider<select class="select" [value]="x.idp" (change)="z('idp', v($event))"><option>Azure AD (SAML 2.0)</option><option>Okta (OIDC)</option><option>Google Workspace (OIDC)</option><option>Local accounts only</option></select></label>
              <label class="field">Minimum password length<input class="input" type="number" min="8" max="64" [value]="x.minLength" (input)="z('minLength', +v($event))" /></label>
              <label class="field">Password expiry (days)<input class="input" type="number" min="0" [value]="x.expiryDays" (input)="z('expiryDays', +v($event))" /></label>
              <label class="field">Lockout after failed attempts<input class="input" type="number" min="3" [value]="x.lockout" (input)="z('lockout', +v($event))" /></label>
              <label class="field">Session idle timeout (min)<input class="input" type="number" min="5" [value]="x.sessionMins" (input)="z('sessionMins', +v($event))" /></label>
              <label class="field full">IP allow-list (CIDR, comma separated)<input class="input" [value]="x.ipAllowlist" (input)="z('ipAllowlist', v($event))" /></label>
            </div>
            <ul class="pol">
              <li><div><b>Password complexity</b><small>Upper, lower, number and symbol</small></div><app-admin-switch [on]="x.complexity" (toggled)="z('complexity', $event)" /></li>
              <li><div><b>Enforce SSO</b><small>Local passwords only for break-glass admins</small></div><app-admin-switch [on]="x.ssoEnforced" (toggled)="z('ssoEnforced', $event)" /></li>
              <li><div><b>Enforce IP allow-list</b><small>Block sign-ins from other networks</small></div><app-admin-switch [on]="x.ipEnforced" (toggled)="z('ipEnforced', $event)" /></li>
            </ul>
            <p class="note" [class.ok]="strength() >= 80" [class.warn]="strength() < 80">Policy strength: <b>{{ strength() }}/100</b></p>
          }
          @case ('notify') {
            <h3 class="ct">Notifications &amp; Email</h3>
            <div class="fgrid">
              <label class="field">SMTP host<input class="input" [value]="y.smtpHost" (input)="s('smtpHost', v($event))" /></label>
              <label class="field">Port<input class="input" type="number" [value]="y.smtpPort" (input)="s('smtpPort', +v($event))" /></label>
              <label class="field">From address<input class="input" [value]="y.smtpFrom" (input)="s('smtpFrom', v($event))" /></label>
              <label class="field">SMS provider<select class="select" [value]="y.smsProvider" (change)="s('smsProvider', v($event))"><option>Twilio</option><option>Etisalat SMS</option><option>du Bulk SMS</option><option>None</option></select></label>
              <label class="field">Admin digest<select class="select" [value]="y.emailDigest" (change)="s('emailDigest', v($event))"><option>Daily 08:00</option><option>Weekly Sunday</option><option>Off</option></select></label>
            </div>
            <ul class="pol">
              <li><div><b>Use TLS</b><small>STARTTLS on port {{ y.smtpPort }}</small></div><app-admin-switch [on]="y.smtpTls" (toggled)="s('smtpTls', $event)" /></li>
              <li><div><b>Mobile push notifications</b><small>People360 app (iOS / Android)</small></div><app-admin-switch [on]="y.pushEnabled" (toggled)="s('pushEnabled', $event)" /></li>
            </ul>
            <button class="btn-outline" (click)="testMail()" [disabled]="testing()">{{ testing() ? 'Sending…' : 'Send test email' }}</button>
          }
          @case ('backup') {
            <h3 class="ct">Backup &amp; Recovery</h3>
            <div class="grid3"><div class="stat"><b>{{ ago() }}</b><small>Last backup</small></div><div class="stat"><b>{{ y.backupRetention }} days</b><small>Retention</small></div><div class="stat"><b>{{ y.backupRegion }}</b><small>Region</small></div></div>
            <div class="fgrid">
              <label class="field">Frequency<select class="select" [value]="y.backupFreq" (change)="s('backupFreq', v($event))"><option>Every hour</option><option>Every 6 hours</option><option>Daily 02:00</option></select></label>
              <label class="field">Retention (days)<input class="input" type="number" [value]="y.backupRetention" (input)="s('backupRetention', +v($event))" /></label>
            </div>
            @if (progress() !== null) {<div class="prog"><small>Backing up… {{ progress() }}%</small><div class="bar"><i [style.width.%]="progress()"></i></div></div>}
            <div class="toolbar acts"><button class="btn-primary" [disabled]="progress() !== null" (click)="runBackup()"><app-icon name="admin-database" [size]="15" />Run backup now</button><button class="btn-ghost" (click)="store.toast('Restore point list opened — 140 snapshots available')">Restore…</button></div>
            <h4>Recent snapshots</h4>
            <ul class="mini">@for (b of snaps(); track b) {<li><app-icon name="admin-database" [size]="15" /><div><b>{{ b }}</b><small>Full · 18.4 GB · verified</small></div><span class="tag green">OK</span></li>}</ul>
          }
          @case ('maint') {
            <h3 class="ct">Maintenance</h3>
            <ul class="pol"><li><div><b>Maintenance mode</b><small>Show a banner and block non-admin sign-ins</small></div><app-admin-switch [on]="y.maintenance" (toggled)="s('maintenance', $event)" /></li></ul>
            <div class="fgrid"><label class="field">Preferred maintenance window<select class="select" [value]="y.maintenanceWindow" (change)="s('maintenanceWindow', v($event))"><option>Sun 01:00 – 03:00 GST</option><option>Sat 23:00 – 01:00 GST</option><option>Fri 02:00 – 04:00 GST</option></select></label></div>
            <h4>Upcoming</h4>
            <ul class="mini"><li><app-icon name="calendar-days" [size]="15" /><div><b>Platform release 26.11</b><small>Sun 15 Nov 2026 · {{ y.maintenanceWindow }} · ~20 min downtime</small></div><button class="link" (click)="store.toast('Release notes: RTLS heat-maps, Arabic kiosk, faster reports')">Notes</button></li></ul>
          }
          @case ('api') {
            <h3 class="ct">API &amp; Integrations</h3>
            <div class="fgrid">
              <label class="field">API rate limit (requests / min)<input class="input" type="number" [value]="y.apiRate" (input)="s('apiRate', +v($event))" /></label>
              <label class="field">Webhook retries<input class="input" type="number" min="0" max="10" [value]="y.webhookRetries" (input)="s('webhookRetries', +v($event))" /></label>
            </div>
            <h4>API keys ({{ keys().length }})</h4>
            <ul class="mini">@for (k of keys(); track k.id) {<li><app-icon name="key-round" [size]="15" /><div><b>{{ k.name }}</b><small>{{ k.id }}•••• · last used {{ k.used }}</small></div><button class="link danger" (click)="revoke(k.id, k.name)">Revoke</button></li>}</ul>
            <button class="btn-outline acts" (click)="newKey()"><app-icon name="plus" [size]="14" />Generate key</button>
          }
          @case ('adv') {
            <h3 class="ct">Advanced</h3>
            <div class="fgrid"><label class="field">Log level<select class="select" [value]="y.logLevel" (change)="s('logLevel', v($event))"><option>Error</option><option>Warning</option><option>Info</option><option>Debug</option></select></label></div>
            <ul class="pol">
              <li><div><b>AI features</b><small>Insights, anomaly detection and recommendations</small></div><app-admin-switch [on]="y.aiFeatures" (toggled)="s('aiFeatures', $event)" /></li>
              <li><div><b>Early-access (beta) features</b><small>Preview upcoming functionality</small></div><app-admin-switch [on]="y.betaFeatures" (toggled)="s('betaFeatures', $event)" /></li>
            </ul>
            <button class="btn-ghost danger" (click)="store.toast('Cache cleared on 18 sites · 412 edge devices will resync')">Clear platform cache</button>
          }
        }
      </div>
    </section>
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `.fgrid { margin-bottom: 12px; } .acts { margin-top: 12px; } .prog { margin: 10px 0; display: grid; gap: 5px; } .side app-icon { color: var(--primary); }`],
})
export class SystemSettings implements OnDestroy {
  protected readonly store = inject(AdminStore);
  protected readonly sections = SECTIONS;
  protected readonly sec = signal<Sec>('general');
  protected readonly sys = signal({ ...this.store.system() });
  protected readonly sec_ = signal({ ...this.store.security() });
  protected readonly testing = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly keys = signal([
    { id: 'pk_live_7f3a', name: 'SAP SuccessFactors sync', used: 'today 09:02' }, { id: 'pk_live_2c91', name: 'Power BI connector', used: 'today 06:00' },
    { id: 'pk_live_9e0d', name: 'Genetec Security Center', used: '2 min ago' }, { id: 'pk_live_44b2', name: 'Canteen POS', used: 'yesterday' },
    { id: 'pk_live_a1c7', name: 'Mobile app backend', used: '1 min ago' }, { id: 'pk_test_0f12', name: 'Sandbox (test)', used: '12 Oct 2026' },
  ]);
  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly dirty = computed(() => JSON.stringify(this.sys()) !== JSON.stringify(this.store.system()) || JSON.stringify(this.sec_()) !== JSON.stringify(this.store.security()));
  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected s(k: string, val: unknown) {
    this.sys.update((x) => ({ ...x, [k]: val }));
  }
  protected z(k: string, val: unknown) {
    this.sec_.update((x) => ({ ...x, [k]: val }));
  }
  protected readonly preview = computed(() => {
    const d = new Date();
    const f = this.sys().dateFormat;
    const p = (n: number) => String(n).padStart(2, '0');
    const M = d.toLocaleString('en', { month: 'short' });
    const date = f === 'DD MMM YYYY' ? `${p(d.getDate())} ${M} ${d.getFullYear()}` : f === 'DD/MM/YYYY' ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` : f === 'MM/DD/YYYY' ? `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}` : d.toISOString().slice(0, 10);
    const time = this.sys().timeFormat === '24-hour' ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${p(d.getHours() % 12 || 12)}:${p(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
    return `${date}, ${time} · week starts ${this.sys().weekStart} · weekend ${this.sys().weekend}`;
  });
  protected readonly strength = computed(() => {
    const x = this.sec_();
    return Math.min(100, (x.mfa === 'Required for all users' ? 30 : x.mfa === 'Off' ? 0 : 18) + Math.min(20, (x.minLength - 6) * 3) + (x.complexity ? 15 : 0) + (x.lockout <= 5 ? 10 : 4) + (x.sessionMins <= 30 ? 10 : 4) + (x.ssoEnforced ? 10 : 0) + (x.ipEnforced ? 5 : 0));
  });
  protected readonly ago = computed(() => {
    const h = (Date.now() - this.sys().lastBackup) / 3600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : `${h.toFixed(1)} h ago`;
  });
  protected readonly snaps = computed(() => [0, 6, 12, 18].map((h) => fmtStamp(this.sys().lastBackup - h * 3600_000)));
  protected discard() {
    this.sys.set({ ...this.store.system() });
    this.sec_.set({ ...this.store.security() });
  }
  protected save() {
    if (this.sec_().minLength < 8) return this.store.toast('Minimum password length must be at least 8');
    const changed = Object.keys(this.sys()).filter((k) => (this.sys() as Record<string, unknown>)[k] !== (this.store.system() as Record<string, unknown>)[k]);
    const sChanged = Object.keys(this.sec_()).filter((k) => (this.sec_() as Record<string, unknown>)[k] !== (this.store.security() as Record<string, unknown>)[k]);
    this.store.system.set({ ...this.sys() });
    this.store.security.set({ ...this.sec_() });
    if (changed.length) this.store.log('Updated', 'System Setting', changed.join(', '), `${changed.length} system settings changed`, 'System');
    if (sChanged.length) this.store.log('Updated', 'Password Policy', sChanged.join(', '), `${sChanged.length} security settings changed`, 'Security', 'Warning');
    this.store.toast(`Settings saved (${changed.length + sChanged.length} changes)`);
  }
  protected testMail() {
    this.testing.set(true);
    setTimeout(() => {
      this.testing.set(false);
      this.store.toast(`Test email delivered via ${this.sys().smtpHost}:${this.sys().smtpPort} in 412 ms`);
    }, 1200);
  }
  protected runBackup() {
    this.progress.set(0);
    this.timer = setInterval(() => {
      const p = (this.progress() ?? 0) + 10;
      if (p >= 100) {
        clearInterval(this.timer);
        this.progress.set(null);
        const now = Date.now();
        this.sys.update((x) => ({ ...x, lastBackup: now }));
        this.store.system.update((x) => ({ ...x, lastBackup: now }));
        this.store.log('Completed', 'System Setting', 'Manual backup', 'Full backup 18.4 GB to UAE North', 'System');
        this.store.toast('Backup completed · 18.4 GB');
      } else this.progress.set(p);
    }, 300);
  }
  protected revoke(id: string, name: string) {
    if (!confirm(`Revoke API key "${name}"? Integrations using it will stop.`)) return;
    this.keys.update((l) => l.filter((k) => k.id !== id));
    this.store.log('Deleted', 'API Key', name, 'API key revoked', 'Security', 'Critical');
    this.store.toast(`${name} key revoked`);
  }
  protected newKey() {
    const id = 'pk_live_' + Math.random().toString(16).slice(2, 6);
    this.keys.update((l) => [{ id, name: 'New integration key', used: 'never' }, ...l]);
    this.store.log('Created', 'API Key', 'New integration key', `Key ${id}•••• generated`, 'Security', 'Warning');
    this.store.toast(`Key ${id}•••• generated — copy it now`);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
}
