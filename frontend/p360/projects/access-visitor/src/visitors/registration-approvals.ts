import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { rng } from '@p360/shared/data/demo-data';
import { PEOPLE } from '@p360/shared/data/people.data';
import { VisitorStore } from './visitor-store';
import { COMPANIES, fmtTime, HOSTS, PURPOSES, Visit } from './visitors.data';

const dayLabel = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/* ======================= Pre-Registration ======================= */
interface Invite {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  company: string;
  email: string;
  host: string;
  purpose: string;
  when: number;
  group: string;
  invite: 'Sent' | 'Opened' | 'Form completed' | 'Cancelled';
  recurring: string;
}

@Component({
  selector: 'app-pre-registration',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Pre-Registration" parent="Visitor Management" parentLink="/visitor-management" subtitle="Invite visitors in advance — they complete details online and get a QR pass by email.">
      <button class="btn-primary" (click)="open.set(true)"><app-icon name="plus" [size]="16" />New Invitation</button>
    </app-page-head>
    <section class="days">
      @for (d of days(); track d.label) {
        <button class="card day" [class.on]="day() === d.key" (click)="day.set(day() === d.key ? null : d.key)">
          <span>{{ d.label }}</span><b>{{ d.n }}</b><small>visitors</small>
        </button>
      }
    </section>
    <section class="kpi-row">
      <app-kpi label="Upcoming Invitations" [value]="list().length" icon="calendar-days" color="var(--ka-8b5cf6)" sub="next 7 days" />
      <app-kpi label="Form Completed" [value]="pct('Form completed') + '%'" icon="file-check" color="var(--ka-22c55e)" />
      <app-kpi label="Invite Not Opened" [value]="cnt('Sent')" icon="message" color="var(--ka-f59e0b)" sub="send a reminder" />
      <app-kpi label="Group Visits" [value]="groups()" icon="users" color="var(--ka-3b82f6)" />
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" noun="invitations" [selectable]="true" [searchKeys]="['name', 'company', 'host', 'group']" searchPlaceholder="Search visitor, company, host, group..."
        [filters]="filters" [actions]="actions" [bulkActions]="bulk" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
    </div>
    @if (open()) {
      <div class="g-overlay" (click)="open.set(false)"></div>
      <form class="g-modal wide" (submit)="$event.preventDefault(); create(co.value, ho.value, pu.value, dt.value, tm.value, rec.value, names.value)">
        <div class="modal-head"><h3>New Invitation</h3><button type="button" class="close-btn" (click)="open.set(false)">×</button></div>
        <div class="form-grid">
          <label>Company<input #co class="input" list="pr-co" required /><datalist id="pr-co">@for (c of companies; track c) {<option [value]="c"></option>}</datalist></label>
          <label>Host<input #ho class="input" list="pr-h" required /><datalist id="pr-h">@for (h of hosts; track h) {<option [value]="h"></option>}</datalist></label>
          <label>Purpose<select #pu class="select">@for (p of purposes; track p) {<option>{{ p }}</option>}</select></label>
          <label>Repeat<select #rec class="select"><option>One-time</option><option>Daily (this week)</option><option>Weekly (4 weeks)</option></select></label>
          <label>Date<input #dt class="input" type="date" [value]="tomorrow" required /></label>
          <label>Time<input #tm class="input" type="time" value="10:00" required /></label>
          <label class="full">Visitors (one per line: name, email)
            <textarea #names class="input" rows="4" required placeholder="Jane Doe, jane@acme.com&#10;John Roe, john@acme.com"></textarea>
          </label>
        </div>
        <p class="muted">Each visitor receives an email with a pre-check-in form and QR pass. The host is notified when they arrive.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="open.set(false)">Cancel</button><button class="btn-primary" type="submit">Send invitations</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 12px; }
    .day { display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; font-family: inherit; padding: 10px; }
    .day span { font-size: 12px; color: var(--kf-4b4f6b); } .day b { font-size: 22px; } .day small { color: var(--muted); font-size: 11px; }
    .day.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    @media (max-width: 800px) { .days { grid-template-columns: repeat(4, 1fr); } }
  `,
})
export class PreRegistration {
  protected readonly companies = COMPANIES;
  protected readonly hosts = HOSTS;
  protected readonly purposes = PURPOSES;
  protected readonly tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  protected readonly open = signal(false);
  protected readonly day = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly list = signal<Invite[]>(
    (() => {
      const r = rng(616);
      return PEOPLE.slice(4300, 4370).map((p, i) => {
        const d = 1 + Math.floor(r() * 6);
        const when = new Date().setHours(9 + Math.floor(r() * 8), r() < 0.5 ? 0 : 30, 0, 0) + d * 86400000;
        const x = r();
        return {
          id: `INV-${7700 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, company: COMPANIES[i % COMPANIES.length], email: p.email.replace(/@.*/, '@guest.com'),
          host: HOSTS[i % HOSTS.length], purpose: PURPOSES[Math.floor(r() * 4)], when, group: i % 9 === 0 ? `${COMPANIES[i % COMPANIES.length]} delegation` : '',
          invite: (x < 0.45 ? 'Form completed' : x < 0.75 ? 'Opened' : 'Sent') as Invite['invite'], recurring: i % 11 === 0 ? 'Weekly' : 'One-time',
        };
      });
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Visitor', kind: 'person', sub: 'email' },
    { key: 'company', label: 'Company' },
    { key: 'when', label: 'Date & time', fmt: (v) => `${dayLabel(v)} · ${fmtTime(v)}` },
    { key: 'host', label: 'Host' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'group', label: 'Group', fmt: (v) => v || '—' },
    { key: 'recurring', label: 'Repeat' },
    { key: 'invite', label: 'Invitation', kind: 'tag', tag: (r) => (r.invite === 'Form completed' ? 'tag green' : r.invite === 'Opened' ? 'tag blue' : r.invite === 'Cancelled' ? 'tag grey' : 'tag amber') },
  ];
  protected readonly filters = [{ key: 'invite', label: 'Invitation', options: ['Sent', 'Opened', 'Form completed', 'Cancelled'] }, { key: 'host', label: 'Host', options: HOSTS }];
  protected readonly actions: RowAction[] = [
    { id: 'resend', label: 'Resend invitation', icon: 'message', when: (r) => r.invite !== 'Form completed' && r.invite !== 'Cancelled' },
    { id: 'cancel', label: 'Cancel visit', icon: 'ban', danger: true, when: (r) => r.invite !== 'Cancelled' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'resend', label: 'Resend' }, { id: 'cancel', label: 'Cancel', danger: true }];
  protected readonly days = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() + (i + 1) * 86400000);
      const key = d.toDateString();
      return { key, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), n: this.list().filter((x) => new Date(x.when).toDateString() === key && x.invite !== 'Cancelled').length };
    }),
  );
  protected readonly rows = computed(() => (this.day() ? this.list().filter((x) => new Date(x.when).toDateString() === this.day()) : this.list()));
  protected readonly groups = computed(() => new Set(this.list().filter((x) => x.group).map((x) => x.group)).size);

  protected cnt(s: string) {
    return this.list().filter((x) => x.invite === s).length;
  }
  protected pct(s: string) {
    return Math.round((this.cnt(s) / this.list().length) * 100);
  }
  protected act(a: string, ids: string[]) {
    const set = new Set(ids);
    if (a === 'cancel') this.list.update((l) => l.map((x) => (set.has(x.id) ? { ...x, invite: 'Cancelled' } : x)));
    this.notify(a === 'cancel' ? `${ids.length} visit(s) cancelled · visitors notified` : `${ids.length} invitation(s) re-sent`);
  }
  protected create(company: string, host: string, purpose: string, date: string, time: string, rec: string, names: string) {
    const lines = names.split('\n').map((l) => l.trim()).filter(Boolean);
    const when = new Date(`${date}T${time}`).getTime();
    const group = lines.length > 1 ? `${company} group` : '';
    const added: Invite[] = lines.map((l, i) => {
      const [name, email] = l.split(',').map((x) => x.trim());
      return { id: `INV-${9000 + this.list().length + i}`, name, initials: name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(), avatar: 'var(--ka-7c3aed)', company, email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@guest.com`, host, purpose, when, group, invite: 'Sent', recurring: rec.split(' ')[0] };
    });
    this.list.update((l) => [...added, ...l]);
    this.open.set(false);
    this.notify(`${added.length} invitation(s) sent · ${host} notified`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Walk-in Registration ======================= */
const STEPS = ['Visitor details', 'ID scan', 'Photo', 'Agreements', 'Badge'];
interface WalkForm {
  name: string;
  company: string;
  phone: string;
  purpose: string;
  host: string;
  idType: string;
  idNo: string;
  photo: boolean;
  nda: boolean;
  safety: boolean;
}

@Component({
  selector: 'app-walk-in',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Walk-in Registration" parent="Visitor Management" parentLink="/visitor-management" subtitle="Front-desk / kiosk flow for visitors without an invitation." />
    <section class="wi">
      <div class="card kiosk">
        <ol class="steps">
          @for (s of steps; track s; let i = $index) {<li [class.on]="step() === i" [class.done]="step() > i"><span>{{ step() > i ? '✓' : i + 1 }}</span>{{ s }}</li>}
        </ol>
        @switch (step()) {
          @case (0) {
            <div class="form-grid">
              <label>Full name *<input class="input" [value]="f().name" (input)="set('name', $any($event.target).value)" /></label>
              <label>Company *<input class="input" list="wi-co" [value]="f().company" (input)="set('company', $any($event.target).value)" /><datalist id="wi-co">@for (c of companies; track c) {<option [value]="c"></option>}</datalist></label>
              <label>Mobile<input class="input" [value]="f().phone" (input)="set('phone', $any($event.target).value)" /></label>
              <label>Purpose<select class="select" [value]="f().purpose" (change)="set('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option>{{ p }}</option>}</select></label>
              <label class="full">Visiting (host) *<input class="input" list="wi-h" [value]="f().host" (input)="set('host', $any($event.target).value)" /><datalist id="wi-h">@for (h of hosts; track h) {<option [value]="h"></option>}</datalist></label>
            </div>
            @if (hit(); as w) {<p class="hit">⚠ Watchlist match: <b>{{ w.name }}</b> ({{ w.type }}) — {{ w.reason }}. Security has been alerted.</p>}
            @if (err()) {<p class="bad">{{ err() }}</p>}
          }
          @case (1) {
            <div class="scan" [class.busy]="busy()">
              <app-icon name="id-card" [size]="46" />
              <p>{{ busy() ? 'Reading document…' : f().idNo ? 'Document read successfully' : 'Place Emirates ID or passport on the scanner' }}</p>
              @if (f().idNo) {<dl class="kv"><dt>Document</dt><dd>{{ f().idType }}</dd><dt>Number</dt><dd>{{ f().idNo }}</dd><dt>Name on ID</dt><dd>{{ f().name }}</dd><dt>Expiry</dt><dd>12 Mar 2029</dd></dl>}
              <button class="btn-primary" (click)="scan()" [disabled]="busy()">{{ f().idNo ? 'Scan again' : 'Scan ID' }}</button>
            </div>
          }
          @case (2) {
            <div class="cam" [class.flash]="flash()">
              <svg viewBox="0 0 120 120" width="160"><ellipse cx="60" cy="56" rx="30" ry="38" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 5" />@if (f().photo) {<circle cx="60" cy="52" r="22" fill="currentColor" opacity=".5" />}</svg>
              <p>{{ f().photo ? 'Photo captured · face quality 94/100' : 'Look at the camera' }}</p>
              <button class="btn-primary" (click)="capture()">{{ f().photo ? 'Retake' : 'Capture photo' }}</button>
            </div>
          }
          @case (3) {
            <div class="agree">
              <div class="doc"><b>Non-Disclosure Agreement</b><p>I agree not to disclose any confidential information I may see or hear during my visit to Purple IQ premises…</p></div>
              <label><input type="checkbox" [checked]="f().nda" (change)="set('nda', !f().nda)" /> I accept the NDA</label>
              <div class="doc"><b>Safety briefing</b><p>In an emergency follow the green exit signs to Muster Point MP-1 (North Car Park). Do not enter yellow-marked production areas without an escort.</p></div>
              <label><input type="checkbox" [checked]="f().safety" (change)="set('safety', !f().safety)" /> I have read the safety briefing</label>
            </div>
          }
          @case (4) {
            <div class="done">
              <div class="badge">
                <div class="b-top"><b>Purple IQ</b><span>VISITOR</span></div>
                <span class="b-photo">{{ initials() }}</span>
                <b class="b-name">{{ f().name }}</b><span>{{ f().company }}</span>
                <small>Host: {{ f().host }}</small><small>Valid today until 18:00</small>
                <div class="b-bar"></div>
              </div>
              <p class="good">Checked in · {{ f().host }} has been notified</p>
              <button class="btn-primary" (click)="reset()">Register next visitor</button>
            </div>
          }
        }
        @if (step() < 4) {
          <div class="form-actions">
            <button class="btn-ghost" (click)="step.set(step() - 1)" [disabled]="step() === 0">Back</button>
            <button class="btn-primary" (click)="next()" [disabled]="!canNext()">{{ step() === 3 ? 'Check in & print badge' : 'Next' }}</button>
          </div>
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>Today's Walk-ins</h3><span class="muted">{{ walkins().length }}</span></div>
        <ul class="wl">
          @for (v of walkins(); track v.id) {<li><span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span><div><b>{{ v.name }}</b><small>{{ v.company }} · {{ v.host }}</small></div><span>{{ fmt(v.checkIn) }}</span></li>}
        </ul>
      </div>
    </section>
  `,
  styles: `
    .wi { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 12px; align-items: start; }
    .kiosk { min-height: 520px; display: flex; flex-direction: column; }
    .steps { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 18px; flex-wrap: wrap; }
    .steps li { flex: 1; min-width: 110px; display: flex; align-items: center; gap: 6px; padding-bottom: 8px; border-bottom: 3px solid var(--kl-eef0f6); font-size: 12.5px; color: var(--muted); }
    .steps span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-eef0f6); font-size: 11px; font-weight: 600; }
    .steps .on { color: var(--primary); border-color: var(--primary); font-weight: 600; } .steps .on span { background: var(--primary); color: var(--kf-ffffff); }
    .steps .done { color: var(--kf-16a34a); border-color: var(--kl-22c55e); } .steps .done span { background: var(--kb-22c55e); color: var(--kf-ffffff); }
    .scan, .cam, .done { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; color: var(--primary); }
    .scan p, .cam p { color: var(--text); margin: 0; } .scan.busy app-icon { animation: blink .5s infinite; } @keyframes blink { 50% { opacity: .3; } }
    .cam { background: var(--kb-1e1b3a); border-radius: 12px; color: var(--kf-a78bfa); padding: 20px; } .cam p { color: var(--kf-ffffff); } .cam.flash { animation: fl .3s; } @keyframes fl { from { background: var(--kb-ffffff); } }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px; font-size: 13px; text-align: left; } .kv dt { color: var(--muted); } .kv dd { margin: 0; color: var(--text); }
    .agree { display: flex; flex-direction: column; gap: 10px; flex: 1; } .agree label { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .doc { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-fafafe); font-size: 12.5px; } .doc p { margin: 6px 0 0; color: var(--kf-4b4f6b); }
    .hit { padding: 10px; border-radius: 8px; background: var(--kb-fef2f2); color: var(--kf-991b1b); font-size: 13px; }
    .badge { width: 210px; padding: 14px; border-radius: 14px; background: linear-gradient(160deg, var(--kb-1e3a8a), var(--kb-3b82f6)); color: var(--kf-ffffff); display: flex; flex-direction: column; align-items: center; gap: 3px; box-shadow: 0 10px 30px rgba(30,58,138,.35); }
    .b-top { width: 100%; display: flex; justify-content: space-between; font-size: 11px; } .b-top span { padding: 1px 8px; border-radius: 10px; background: rgba(255,255,255,.2); }
    .b-photo { width: 70px; height: 70px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-60a5fa); font-size: 24px; font-weight: 700; border: 3px solid var(--kl-ffffff); margin: 8px 0; }
    .b-name { font-size: 16px; } .badge small { font-size: 10.5px; opacity: .85; }
    .b-bar { width: 80%; height: 24px; margin-top: 6px; background: repeating-linear-gradient(90deg, var(--kb-ffffff) 0 2px, transparent 2px 4px, var(--kb-ffffff) 4px 5px, transparent 5px 8px); }
    .wl { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow: auto; }
    .wl li { display: grid; grid-template-columns: 32px 1fr auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .wl div { display: flex; flex-direction: column; } .wl small { color: var(--muted); } .wl > li > span:last-child { font-size: 11.5px; color: var(--kf-4b4f6b); }
    @media (max-width: 1000px) { .wi { grid-template-columns: 1fr; } }
  `,
})
export class WalkIn {
  private readonly store = inject(VisitorStore);
  private readonly destroy = inject(DestroyRef);
  protected readonly steps = STEPS;
  protected readonly companies = COMPANIES;
  protected readonly hosts = HOSTS;
  protected readonly purposes = PURPOSES;
  protected readonly fmt = fmtTime;
  private readonly blank: WalkForm = { name: '', company: '', phone: '', purpose: 'Business Meeting', host: '', idType: '', idNo: '', photo: false, nda: false, safety: false };
  protected readonly f = signal({ ...this.blank });
  protected readonly step = signal(0);
  protected readonly busy = signal(false);
  protected readonly flash = signal(false);
  protected readonly err = signal('');
  protected readonly hit = computed(() => this.store.screen(this.f().name));
  protected readonly initials = computed(() => this.f().name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase());
  protected readonly walkins = computed(() => this.store.visits().filter((v) => v.method === 'Walk-in' && v.checkIn).sort((a, b) => (b.checkIn ?? 0) - (a.checkIn ?? 0)));
  protected readonly canNext = computed(() => {
    const f = this.f();
    return [!!(f.name && f.company && f.host), !!f.idNo, f.photo, f.nda && f.safety][this.step()] ?? true;
  });

  protected set<K extends keyof WalkForm>(k: K, v: WalkForm[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
  }
  protected scan() {
    this.busy.set(true);
    const t = setTimeout(() => {
      this.busy.set(false);
      this.set('idType', 'Emirates ID');
      this.set('idNo', `784-19${80 + Math.floor(Math.random() * 20)}-${Math.floor(1e6 + Math.random() * 8e6)}-${Math.floor(Math.random() * 9)}`);
    }, 1400);
    this.destroy.onDestroy(() => clearTimeout(t));
  }
  protected capture() {
    this.flash.set(true);
    this.set('photo', true);
    setTimeout(() => this.flash.set(false), 300);
  }
  protected next() {
    if (this.step() === 0 && this.hit()?.type === 'Blacklist') return this.err.set('This person is blacklisted — registration blocked. Contact security.');
    this.err.set('');
    if (this.step() === 3) {
      const f = this.f();
      this.store.add({ name: f.name, company: f.company, phone: f.phone, purpose: f.purpose, host: f.host, method: 'Walk-in' }, 'Checked In');
    }
    this.step.update((s) => s + 1);
  }
  protected reset() {
    this.f.set({ ...this.blank });
    this.step.set(0);
  }
}

/* ======================= Visitor Approvals ======================= */
@Component({
  selector: 'app-visitor-approvals',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Approvals" parent="Visitor Management" parentLink="/visitor-management" subtitle="Host and security approvals with automatic risk checks." />
    <section class="kpi-row">
      <app-kpi label="Awaiting Approval" [value]="pending().length" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Approved Today" [value]="approved()" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="Rejected Today" [value]="rejected()" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="Avg. Approval Time" value="7 min" icon="activity" color="var(--ka-3b82f6)" />
    </section>
    <section class="ap" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="pending()" [columns]="cols" noun="requests" [selectable]="true" [actions]="actions" [bulkActions]="bulk" [activeId]="selId()"
          (rowClick)="selId.set($event.id)" (action)="decide([$event.row.id], $event.action)" (bulk)="decide($event.ids, $event.action)" />
      </div>
      @if (sel(); as v) {
        <aside class="card detail">
          <div class="card-head"><div class="who"><span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span><div><b>{{ v.name }}</b><small>{{ v.company }}</small></div></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <dl class="kv"><dt>Purpose</dt><dd>{{ v.purpose }}</dd><dt>Host</dt><dd>{{ v.host }} ({{ v.hostDept }})</dd><dt>Area</dt><dd>{{ v.location }}</dd><dt>Expected</dt><dd>{{ fmt(v.expected) }}</dd><dt>Approver</dt><dd>{{ approverOf(v) }}</dd></dl>
          <h4>Risk checks</h4>
          <ul class="checks">@for (c of checks(v); track c.label) {<li [class.warn]="!c.ok">{{ c.ok ? '✓' : '!' }} {{ c.label }}</li>}</ul>
          <textarea #note class="input" rows="2" placeholder="Note (optional)"></textarea>
          <div class="toolbar"><button class="btn-primary" (click)="decide([v.id], 'approve')">Approve</button><button class="btn-ghost danger" (click)="decide([v.id], 'reject')">Reject</button></div>
        </aside>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .ap { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .ap.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .who { display: flex; gap: 10px; align-items: center; } .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .kv { display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 4px 0 0; font-size: 13px; } .checks { list-style: none; margin: 0; padding: 0; font-size: 12.5px; } .checks li { padding: 4px 0; color: var(--kf-15803d); } .checks li.warn { color: var(--kf-b45309); }
    .danger { color: var(--red); }
    @media (max-width: 1100px) { .ap.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class VisitorApprovals {
  private readonly store = inject(VisitorStore);
  protected readonly fmt = fmtTime;
  protected readonly toast = signal<string | null>(null);
  private readonly decided = signal({ approved: 23, rejected: 2 });
  protected readonly pending = computed(() => this.store.visits().filter((v) => v.status === 'Pending Approval'));
  protected readonly selId = signal<string | null>(null);
  protected readonly sel = computed(() => this.pending().find((v) => v.id === this.selId()) ?? this.pending()[0] ?? null);
  protected readonly approved = computed(() => this.decided().approved);
  protected readonly rejected = computed(() => this.decided().rejected);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Visitor', kind: 'person', sub: 'company' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'host', label: 'Host' },
    { key: 'location', label: 'Area' },
    { key: 'expected', label: 'Expected', fmt: (v) => fmtTime(v) },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly actions: RowAction[] = [{ id: 'approve', label: 'Approve', icon: 'shield-check' }, { id: 'reject', label: 'Reject', icon: 'ban', danger: true }];
  protected readonly bulk: RowAction[] = [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject', danger: true }];

  protected approverOf(v: Visit) {
    return v.escort || v.location.includes('Plant') || v.location.includes('Warehouse') ? 'Host + Security' : 'Host';
  }
  protected checks(v: Visit) {
    const n = +v.id.slice(4);
    return [
      { label: 'Not on watchlist / blacklist', ok: !this.store.screen(v.name) },
      { label: 'ID document provided', ok: n % 4 !== 0 },
      { label: 'NDA signed in advance', ok: v.nda },
      { label: 'Host available today', ok: n % 5 !== 0 },
      { label: v.escort ? 'Escort required for this area' : 'No escort needed', ok: !v.escort },
    ];
  }
  protected decide(ids: string[], a: string) {
    ids.forEach((id) => (a === 'approve' ? this.store.approve(id) : this.store.reject(id)));
    this.decided.update((d) => (a === 'approve' ? { ...d, approved: d.approved + ids.length } : { ...d, rejected: d.rejected + ids.length }));
    this.selId.set(null);
    this.toast.set(`${ids.length} visitor(s) ${a === 'approve' ? 'approved · QR pass sent' : 'rejected · host informed'}`);
    setTimeout(() => this.toast.set(null), 2200);
  }
}
