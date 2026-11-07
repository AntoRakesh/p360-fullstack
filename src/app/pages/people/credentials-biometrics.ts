import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { PEOPLE, SITES } from './people.data';

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* ======================= Digital Identity & Credentials ======================= */
interface Cred {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  type: string;
  format: string;
  issued: string;
  expiry: string;
  status: string;
  lastUsed: string;
}
const FORMATS: Record<string, string[]> = {
  'Access Card': ['HID iCLASS SE', 'MIFARE DESFire EV3', 'HID Prox'],
  'Mobile Credential': ['Apple Wallet', 'Google Wallet', 'People360 App'],
  'QR Code': ['Dynamic QR', 'Static QR'],
  PIN: ['6-digit PIN'],
};
const CRED_TYPES = Object.keys(FORMATS);
const CREDS: Cred[] = (() => {
  const r = rng(404);
  return PEOPLE.slice(0, 2400).flatMap((p, i) => {
    const out: Cred[] = [];
    const add = (type: string) => {
      const f = FORMATS[type];
      const st = r();
      const exp = Math.round(-30 + r() * 900);
      out.push({
        id: `CRD-${String(10000 + i * 3 + out.length)}`,
        name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id,
        type, format: f[Math.floor(r() * f.length)],
        issued: iso(-Math.floor(r() * 700)), expiry: iso(exp),
        status: exp < 0 ? 'Expired' : st < 0.93 ? 'Active' : st < 0.97 ? 'Suspended' : 'Lost',
        lastUsed: `${Math.floor(r() * 59) + 1} min ago`,
      });
    };
    add(p.type === 'Visitor' ? 'QR Code' : 'Access Card');
    if (p.mobileCred && p.type !== 'Visitor') add('Mobile Credential');
    if (r() < 0.08) add('PIN');
    return out;
  });
})();

@Component({
  selector: 'app-credentials',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Digital Identity &amp; Credentials" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Cards, mobile wallets, QR codes and PINs issued to people.">
      <button class="btn-primary" (click)="issueOpen.set(true)"><app-icon name="plus" [size]="16" />Issue Credential</button>
    </app-page-head>
    <section class="kpi-row">
      @for (t of types; track t) {
        <app-kpi [label]="t + 's'" [value]="byType(t)" [icon]="icons[t]" [color]="colors[t]" sub="issued" />
      }
      <app-kpi label="Suspended / Lost" [value]="flagged()" icon="ban" color="#ef4444" sub="need action" />
    </section>
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Credential Mix</h3></div>
        <app-donut [segments]="mix()" center="Credentials" [size]="130" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Status</h3></div>
        <app-bar-list [rows]="statusRows()" [max]="list().length" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Expiring by Month</h3></div>
        <app-column-chart [labels]="['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']" [series]="expiring()" [height]="190" [legend]="false" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="credentials" [searchKeys]="['name', 'id', 'personId', 'format']" searchPlaceholder="Search person, credential ID, format..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
      </div>
    </section>

    @if (issueOpen()) {
      <div class="g-overlay" (click)="issueOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); issue(p.value, t.value, f.value, e.value)">
        <div class="modal-head"><h3>Issue Credential</h3><button type="button" class="close-btn" (click)="issueOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Person
            <input #p class="input" list="ppl" placeholder="Type a name or ID" required />
            <datalist id="ppl">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist>
          </label>
          <label>Credential type
            <select #t class="select" (change)="ctype.set($any($event.target).value)">@for (x of types; track x) {<option>{{ x }}</option>}</select>
          </label>
          <label>Format
            <select #f class="select">@for (x of formats[ctype()]; track x) {<option>{{ x }}</option>}</select>
          </label>
          <label class="full">Valid until<input #e class="input" type="date" [value]="nextYear" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="issueOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Issue</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class Credentials {
  protected readonly types = CRED_TYPES;
  protected readonly formats = FORMATS;
  protected readonly icons: Record<string, string> = { 'Access Card': 'id-card', 'Mobile Credential': 'square-user', 'QR Code': 'grid', PIN: 'key-round' };
  protected readonly colors: Record<string, string> = { 'Access Card': '#8b5cf6', 'Mobile Credential': '#3b82f6', 'QR Code': '#22c1a0', PIN: '#f59e0b' };
  protected readonly list = signal<Cred[]>(CREDS);
  protected readonly issueOpen = signal(false);
  protected readonly ctype = signal('Access Card');
  protected readonly toast = signal<string | null>(null);
  protected readonly nextYear = iso(365);
  protected readonly pick = PEOPLE.slice(0, 300);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'id', label: 'Credential ID' },
    { key: 'type', label: 'Type' },
    { key: 'format', label: 'Format' },
    { key: 'issued', label: 'Issued', fmt: shortDate },
    { key: 'expiry', label: 'Expiry', fmt: shortDate },
    { key: 'lastUsed', label: 'Last used', sortable: false },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'type', label: 'Type', options: CRED_TYPES },
    { key: 'status', label: 'Status', options: ['Active', 'Suspended', 'Lost', 'Expired', 'Revoked'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'suspend', label: 'Suspend', icon: 'ban', when: (r) => r.status === 'Active' },
    { id: 'reactivate', label: 'Reactivate', icon: 'shield-check', when: (r) => r.status === 'Suspended' },
    { id: 'renew', label: 'Renew 1 year', icon: 'refresh', when: (r) => r.status === 'Expired' || r.status === 'Active' },
    { id: 'lost', label: 'Report lost', icon: 'triangle-alert', when: (r) => r.status === 'Active' },
    { id: 'revoke', label: 'Revoke', icon: 'ban', danger: true, when: (r) => r.status !== 'Revoked' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'suspend', label: 'Suspend' }, { id: 'renew', label: 'Renew' }, { id: 'revoke', label: 'Revoke', danger: true }];
  protected readonly mix = computed(() => CRED_TYPES.map((t) => ({ label: t, value: +this.byType(t).replace(/,/g, ''), color: this.colors[t] })));
  protected readonly statusRows = computed(() =>
    ['Active', 'Suspended', 'Lost', 'Expired', 'Revoked'].map((s, i) => {
      const v = this.list().filter((c) => c.status === s).length;
      return { label: s, value: v, display: v.toLocaleString(), color: ['#22c55e', '#f59e0b', '#ef4444', '#9ca3af', '#64748b'][i] };
    }),
  );
  protected readonly expiring = computed(() => [{ name: 'Expiring', color: '#f59e0b', values: [0, 1, 2, 3, 4, 5].map((m) => this.list().filter((c) => c.expiry >= iso(m * 30) && c.expiry < iso((m + 1) * 30)).length) }]);
  protected readonly flagged = computed(() => String(this.list().filter((c) => c.status === 'Suspended' || c.status === 'Lost').length));

  protected byType(t: string) {
    return this.list().filter((c) => c.type === t).length.toLocaleString();
  }
  protected act(a: string, ids: string[]) {
    const set = new Set(ids);
    const status = { suspend: 'Suspended', reactivate: 'Active', lost: 'Lost', revoke: 'Revoked', renew: 'Active' }[a] ?? 'Active';
    this.list.update((l) => l.map((c) => (set.has(c.id) ? { ...c, status, ...(a === 'renew' ? { expiry: iso(365) } : {}) } : c)));
    this.notify(`${ids.length} credential(s) → ${status}${a === 'lost' ? ' · replacement card queued' : ''}`);
  }
  protected issue(person: string, type: string, format: string, expiry: string) {
    const id = person.split(' · ')[0];
    const p = PEOPLE.find((x) => x.id === id) ?? PEOPLE.find((x) => x.name.toLowerCase() === person.toLowerCase());
    if (!p) return this.notify('Pick a person from the list');
    const c: Cred = { id: `CRD-${90000 + this.list().length}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type, format, issued: iso(0), expiry, status: 'Active', lastUsed: 'Never' };
    this.list.update((l) => [c, ...l]);
    this.issueOpen.set(false);
    this.notify(`${type} ${c.id} issued to ${p.name}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Biometric Enrollment ======================= */
interface Bio {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  site: string;
  type: string;
  face: string;
  finger: string;
  quality: number;
  enrolledOn: string;
  device: string;
}
const DEVICES = ['Kiosk HO-1', 'Kiosk HO-2', 'Reader MF-3', 'Mobile Enrol', 'Kiosk WH-1'];
const BIOS: Bio[] = (() => {
  const r = rng(808);
  return PEOPLE.filter((p) => p.type !== 'Visitor').slice(0, 3000).map((p) => ({
    id: p.id, name: p.name, initials: p.initials, avatar: p.avatar, site: p.site, type: p.type,
    face: p.face ? 'Enrolled' : 'Pending',
    finger: p.finger ? 'Enrolled' : 'Pending',
    quality: p.face ? Math.round(62 + r() * 37) : 0,
    enrolledOn: p.face ? iso(-Math.floor(r() * 500)) : '',
    device: DEVICES[Math.floor(r() * DEVICES.length)],
  }));
})();
const STEPS = ['Position face in frame', 'Liveness check', 'Capturing fingerprint (2 fingers)', 'Generating templates', 'Done'];

@Component({
  selector: 'app-biometrics',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Biometric Enrollment" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Face and fingerprint enrollment status, template quality and pending captures." />
    <section class="kpi-row">
      <app-kpi label="Face Enrolled" [value]="pct('face') + '%'" icon="user-check" color="#8b5cf6" change="3%" sub="vs. last month" />
      <app-kpi label="Fingerprint Enrolled" [value]="pct('finger') + '%'" icon="fingerprint" color="#3b82f6" change="2%" sub="vs. last month" />
      <app-kpi label="Pending Enrollment" [value]="pending()" icon="clock" color="#f59e0b" sub="face or finger" />
      <app-kpi label="Avg. Face Quality" [value]="avgQ() + '/100'" icon="activity" color="#22c55e" />
      <app-kpi label="Low Quality (< 70)" [value]="lowQ()" icon="triangle-alert" color="#ef4444" sub="re-enroll suggested" />
    </section>
    <section class="dash">
      <div class="card span-6">
        <div class="card-head"><h3>Face Enrollment by Site</h3></div>
        <app-bar-list [rows]="bySite()" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Face Template Quality</h3></div>
        <app-column-chart [labels]="['60-69', '70-79', '80-89', '90-100']" [series]="qualitySeries()" [height]="200" [legend]="false" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="people" [searchKeys]="['name', 'id']" searchPlaceholder="Search name or ID..."
          [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
    </section>

    @if (enrolling(); as b) {
      <div class="g-overlay"></div>
      <div class="g-modal enroll">
        <div class="modal-head"><h3>Enrolling {{ b.name }}</h3>@if (step() >= 4) {<button class="close-btn" (click)="enrolling.set(null)">×</button>}</div>
        <div class="cam" [class.done]="step() >= 4">
          <svg viewBox="0 0 120 120" width="140"><ellipse cx="60" cy="56" rx="30" ry="38" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 5" /><circle cx="49" cy="50" r="3" fill="currentColor" /><circle cx="71" cy="50" r="3" fill="currentColor" /><path d="M50 72 q10 8 20 0" fill="none" stroke="currentColor" stroke-width="3" /></svg>
          @if (step() < 4) {<div class="scan"></div>}
        </div>
        <ol class="steps">
          @for (s of steps; track s; let i = $index) {
            <li [class.done]="i < step()" [class.cur]="i === step()">{{ i < step() ? '✓' : i === step() ? '…' : '○' }} {{ s }}</li>
          }
        </ol>
        @if (step() >= 4) {<p class="good">Templates saved · quality {{ newQ }}/100</p>}
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .enroll { width: min(440px, calc(100vw - 32px)); text-align: center; }
    .cam { position: relative; margin: 6px auto 14px; width: 180px; height: 180px; border-radius: 16px; background: #1e1b3a; color: #a78bfa; display: grid; place-items: center; overflow: hidden; }
    .cam.done { color: #4ade80; }
    .scan { position: absolute; left: 0; right: 0; height: 3px; background: #a78bfa; box-shadow: 0 0 12px #a78bfa; animation: scan 1.4s linear infinite; }
    @keyframes scan { from { top: 0; } to { top: 100%; } }
    .steps { list-style: none; padding: 0; margin: 0; text-align: left; font-size: 13px; }
    .steps li { padding: 5px 0; color: var(--muted); } .steps .done { color: #16a34a; } .steps .cur { color: var(--primary); font-weight: 600; }
  `,
})
export class Biometrics {
  private readonly destroy = inject(DestroyRef);
  protected readonly steps = STEPS;
  protected readonly list = signal<Bio[]>(BIOS);
  protected readonly enrolling = signal<Bio | null>(null);
  protected readonly step = signal(0);
  protected readonly toast = signal<string | null>(null);
  protected newQ = 0;
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'id' },
    { key: 'type', label: 'Type' },
    { key: 'site', label: 'Site' },
    { key: 'face', label: 'Face', kind: 'status' },
    { key: 'finger', label: 'Fingerprint', kind: 'status' },
    { key: 'quality', label: 'Face Quality', kind: 'progress' },
    { key: 'enrolledOn', label: 'Enrolled On', fmt: (v) => (v ? shortDate(v) : '—') },
    { key: 'device', label: 'Device' },
  ];
  protected readonly filters = [
    { key: 'face', label: 'Face', options: ['Enrolled', 'Pending'] },
    { key: 'finger', label: 'Fingerprint', options: ['Enrolled', 'Pending'] },
    { key: 'site', label: 'Site', options: SITES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'enroll', label: 'Enroll now', icon: 'user-check', when: (r) => r.face === 'Pending' || r.finger === 'Pending' },
    { id: 'enroll', label: 'Re-enroll', icon: 'refresh', when: (r) => r.face === 'Enrolled' && r.finger === 'Enrolled' },
    { id: 'delete', label: 'Delete templates', icon: 'ban', danger: true, when: (r) => r.face === 'Enrolled' },
  ];
  protected readonly pending = computed(() => this.list().filter((b) => b.face === 'Pending' || b.finger === 'Pending').length.toLocaleString());
  protected readonly avgQ = computed(() => {
    const e = this.list().filter((b) => b.quality);
    return Math.round(e.reduce((a, b) => a + b.quality, 0) / e.length);
  });
  protected readonly lowQ = computed(() => String(this.list().filter((b) => b.quality && b.quality < 70).length));
  protected readonly bySite = computed(() =>
    SITES.map((s) => {
      const at = this.list().filter((b) => b.site === s);
      const v = at.length ? Math.round((at.filter((b) => b.face === 'Enrolled').length / at.length) * 100) : 0;
      return { label: s, value: v, display: `${v}%`, color: v < 85 ? '#f59e0b' : '#8b5cf6' };
    }),
  );
  protected readonly qualitySeries = computed(() => [
    { name: 'People', color: '#8b5cf6', values: [60, 70, 80, 90].map((lo) => this.list().filter((b) => b.quality >= lo && b.quality < lo + 10 + (lo === 90 ? 1 : 0)).length) },
  ]);

  protected pct(k: 'face' | 'finger') {
    return Math.round((this.list().filter((b) => b[k] === 'Enrolled').length / this.list().length) * 100);
  }
  protected act(a: string, b: Bio) {
    if (a === 'delete') {
      this.patch(b.id, { face: 'Pending', finger: 'Pending', quality: 0, enrolledOn: '' });
      this.toast.set(`Templates deleted for ${b.name}`);
      setTimeout(() => this.toast.set(null), 2000);
      return;
    }
    this.enrolling.set(b);
    this.step.set(0);
    this.newQ = 84 + Math.floor(Math.random() * 15);
    const id = setInterval(() => {
      this.step.update((s) => s + 1);
      if (this.step() >= 4) {
        clearInterval(id);
        this.patch(b.id, { face: 'Enrolled', finger: 'Enrolled', quality: this.newQ, enrolledOn: iso(0), device: 'Kiosk HO-1' });
      }
    }, 900);
    this.destroy.onDestroy(() => clearInterval(id));
  }
  private patch(id: string, c: Partial<Bio>) {
    this.list.update((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }
}
