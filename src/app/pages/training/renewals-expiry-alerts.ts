// Training › Renewals & Expiry Alerts — 30/60/90-day expiry runway, reminders, renewal scheduling and alert rules.
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Series, UI } from '../../shared/ui';
import { TrnPage } from './training-ui';
import { AlertRule, Cert, CERT_TYPES, CT, daysUntil, DEPTS, downloadCsv, iso, SITES } from './training.data';

type Win = 'Expired' | '0–30 days' | '31–60 days' | '61–90 days' | 'All upcoming';
const WINS: Win[] = ['Expired', '0–30 days', '31–60 days', '61–90 days', 'All upcoming'];
const inWin = (d: number, w: Win) =>
  w === 'Expired' ? d < 0 : w === '0–30 days' ? d >= 0 && d <= 30 : w === '31–60 days' ? d > 30 && d <= 60 : w === '61–90 days' ? d > 60 && d <= 90 : d >= 0 && d <= 90;
const CHANNELS = ['Email', 'SMS', 'In-app', 'Teams'];
const RECIPIENTS = ['Employee', 'Line Manager', 'HSE', 'Security Manager', 'Training Admin'];

@Component({
  selector: 'app-training-renewals-expiry-alerts',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Renewals & Expiry Alerts" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Track expiring certificates and licences, send reminders and schedule renewals before they lapse.">
      <button class="btn-primary" (click)="remindWindow()"><app-icon name="training-send" [size]="16" />Remind {{ win() === 'All upcoming' ? 'All' : win() }} ({{ unreminded() }})</button>
      <button class="btn-ghost" (click)="runRules()"><app-icon name="bell-ring" [size]="16" />Run Alert Scan</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="wins">
      @for (w of winCards(); track w.win) {
        <button class="card wc" [class.on]="win() === w.win" [style.--c]="w.color" (click)="win.set(w.win)">
          <span class="wi"><app-icon [name]="w.icon" [size]="20" /></span>
          <div><small>{{ w.label }}</small><b>{{ fmt(w.n) }}</b><em>{{ w.sub }}</em></div>
          <span class="wp"><i [style.width.%]="w.sched"></i></span>
          <span class="ws">{{ w.sched }}% renewal scheduled</span>
        </button>
      }
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Expiry Runway · next 13 weeks</h3>
          <div class="lg">@for (s of runway(); track s.name) {<span><i [style.background]="s.color"></i>{{ s.name }}</span>}</div>
        </div>
        <div class="rw">
          <div class="bands"><span style="flex:30" class="b1">0–30 days</span><span style="flex:30" class="b2">31–60 days</span><span style="flex:31" class="b3">61–90 days</span></div>
          <app-column-chart [labels]="weekLabels" [series]="runway()" [stacked]="true" [height]="210" [legend]="false" />
        </div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Expired · Action Required</h3><span class="tag red">{{ expiredTotal() }}</span></div>
        <ul class="ex">
          @for (g of expiredByType(); track g.type.id) {
            <li>
              <div><b>{{ g.type.name }}</b><small>{{ g.n }} expired · oldest {{ g.oldest }} days ago{{ g.type.licence ? ' · licence' : '' }}</small></div>
              <button class="btn-ghost sm" (click)="openSchedule(g.certs)">Book all</button>
            </li>
          } @empty {<li class="muted">No expired certificates 🎉</li>}
        </ul>
      </div>
    </section>

    <section class="lay">
      <div class="card">
        <div class="card-head">
          <h3>{{ win() === 'Expired' ? 'Expired Certificates' : 'Expiring · ' + win() }} <span class="card-sub">{{ fmt(rows().length) }} certificates</span></h3>
          <div class="tabs">@for (w of wins; track w) {<button [class.on]="win() === w" (click)="win.set(w)">{{ w }}</button>}</div>
        </div>
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['name', 'empId', 'cert', 'number']"
          searchPlaceholder="Search employee, certificate or number..." noun="certificates" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" (rowClick)="act('schedule', $event)" />
      </div>
      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Alert Rules</h3><button class="btn-ghost sm" (click)="openRule()"><app-icon name="plus" [size]="14" />Rule</button></div>
          <ul class="rules">
            @for (r of store.rules(); track r.id) {
              <li [class.off]="!r.enabled">
                <div class="rh">
                  <span class="rd" [style.background]="r.days === 0 ? '#ef4444' : r.days <= 14 ? '#f97316' : r.days <= 30 ? '#f59e0b' : '#3b82f6'">{{ r.days === 0 ? 'EXP' : r.days + 'd' }}</span>
                  <div><b>{{ r.name }}</b><small>{{ scopeName(r.scope) }} · {{ r.channels.join(', ') }} → {{ r.recipients.join(', ') }}</small></div>
                  <label class="sw"><input type="checkbox" [checked]="r.enabled" (change)="toggleRule(r)" /><i></i></label>
                </div>
                <div class="rf">
                  <small>{{ r.autoEnroll ? 'Auto-enrols in refresher · ' : '' }}{{ fmt(r.fired) }} sent{{ r.lastRun ? ' · last run ' + r.lastRun.slice(5) : '' }}</small>
                  <span><button class="link" (click)="openRule(r)">Edit</button><button class="link" [disabled]="!r.enabled" (click)="runRules(r)">Run now</button></span>
                </div>
              </li>
            }
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Alert Activity</h3><span class="muted">{{ store.alertLog().length }} events</span></div>
          <ul class="feed">
            @for (e of store.alertLog().slice(0, 7); track $index) {
              <li><span class="fi" [class]="'fi ' + e.kind"><app-icon [name]="kindIcon[e.kind]" [size]="13" /></span><div><span>{{ e.text }}</span><small>{{ e.at }}</small></div></li>
            }
          </ul>
        </div>
      </div>
    </section>

    @if (sch(); as s) {
      <div class="g-overlay" (click)="sch.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doSchedule()">
        <div class="modal-head"><h3>Schedule Renewal</h3><button type="button" class="close-btn" (click)="sch.set(null)">×</button></div>
        @if (s.certs.length === 1) {
          @let c = s.certs[0];
          @let p = person(c.empId);
          <div class="sc1">
            <span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span>
            <div><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.role }} · {{ p.dept }}</small></div>
            <div class="r"><b>{{ ct(c.typeId).name }}</b><small [class.red]="days(c.expiry) < 0">{{ days(c.expiry) < 0 ? 'Expired ' + -days(c.expiry) + ' days ago' : 'Expires ' + fd(c.expiry) + ' · ' + days(c.expiry) + ' days' }}</small></div>
          </div>
        } @else {
          <p class="muted">{{ s.certs.length }} certificates across {{ courseGroups().length }} refresher course(s).</p>
        }
        @for (g of courseGroups(); track g.courseId) {
          @let co = course(g.courseId);
          <div class="cg">
            <div class="cgh"><b>{{ co?.title }}</b><span class="tag">{{ co?.mode }} · {{ co?.hours }}h</span><span class="muted">{{ g.certs.length }} employee(s)</span></div>
            @if (sessionsFor(g.courseId).length) {
              <div class="ss">
                @for (x of sessionsFor(g.courseId); track x.id) {
                  <label [class.on]="s.pick[g.courseId] === x.id" [class.full]="x.booked >= x.seats">
                    <input type="radio" [name]="'s-' + g.courseId" [checked]="s.pick[g.courseId] === x.id" [disabled]="x.booked + g.certs.length > x.seats" (change)="setPick(g.courseId, x.id)" />
                    <span><b>{{ fd(x.date) }}</b> · {{ x.time }}</span><small>{{ x.location }} · {{ x.trainer }}</small><em>{{ x.seats - x.booked }} seats left</em>
                  </label>
                }
              </div>
            } @else {
              <label class="dl">E-learning · complete by<input class="input" type="date" [value]="s.pick[g.courseId] || defaultDue(g.certs)" (change)="setPick(g.courseId, $any($event.target).value)" /></label>
            }
          </div>
        }
        <label class="ck"><input type="checkbox" [checked]="s.notify" (change)="sch.set({ ...s, notify: !s.notify })" />Send calendar invite & notify line manager</label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sch.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule {{ s.certs.length }} renewal(s)</button></div>
      </form>
    }

    @if (rf(); as f) {
      <div class="g-overlay" (click)="rf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveRule()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit' : 'New' }} Alert Rule</h3><button type="button" class="close-btn" (click)="rf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Rule name *<input class="input" [value]="f.name" (input)="rf.set({ ...f, name: $any($event.target).value })" placeholder="e.g. 21-day licence reminder" /></label>
          <label>Applies to<select class="select" [value]="f.scope" (change)="rf.set({ ...f, scope: $any($event.target).value })"><option value="All">All certificates</option>@for (t of types; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Trigger<select class="select" [value]="'' + f.days" (change)="rf.set({ ...f, days: +$any($event.target).value })">@for (d of triggers; track d) {<option [value]="'' + d">{{ d === 0 ? 'On expiry' : d + ' days before expiry' }}</option>}</select></label>
          <label class="full">Channels<span class="cks">@for (c of channels; track c) {<label><input type="checkbox" [checked]="f.channels.includes(c)" (change)="rf.set({ ...f, channels: tog(f.channels, c) })" />{{ c }}</label>}</span></label>
          <label class="full">Recipients<span class="cks">@for (c of recipients; track c) {<label><input type="checkbox" [checked]="f.recipients.includes(c)" (change)="rf.set({ ...f, recipients: tog(f.recipients, c) })" />{{ c }}</label>}</span></label>
          <label class="full"><span class="ck"><input type="checkbox" [checked]="f.autoEnroll" (change)="rf.set({ ...f, autoEnroll: !f.autoEnroll })" />Automatically enrol the employee in the refresher course</span></label>
        </div>
        <p class="muted">Matches {{ ruleMatches(f).length }} certificate(s) right now.</p>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions">
          @if (f.id) {<button type="button" class="btn-ghost danger" (click)="deleteRule(f.id)">Delete</button>}
          <button type="button" class="btn-ghost" (click)="rf.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Rule</button>
        </div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .wins { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .wc { text-align: left; border: 1px solid transparent; cursor: pointer; display: grid; grid-template-columns: 42px 1fr; gap: 4px 12px; align-items: center; font: inherit; color: inherit; }
    .wc.on { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 15%, transparent); }
    .wi { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, #fff); color: var(--c); grid-row: span 1; }
    .wc > div { display: flex; flex-direction: column; } .wc small { color: var(--muted); font-size: 12px; } .wc b { font-size: 24px; line-height: 1.2; } .wc em { font-style: normal; font-size: 11px; color: var(--c); }
    .wp { grid-column: 1 / -1; height: 5px; background: #eef0f6; border-radius: 4px; overflow: hidden; margin-top: 6px; } .wp i { display: block; height: 100%; background: var(--c); }
    .ws { grid-column: 1 / -1; font-size: 10.5px; color: var(--muted); }
    .lg { display: flex; gap: 12px; font-size: 11.5px; color: #4b4f6b; } .lg span { display: inline-flex; align-items: center; gap: 5px; } .lg i { width: 10px; height: 10px; border-radius: 3px; }
    .rw { position: relative; }
    .bands { display: flex; gap: 2px; margin: 0 0 6px 40px; font-size: 10.5px; font-weight: 600; text-align: center; }
    .bands span { padding: 3px 0; border-radius: 4px; } .b1 { background: #fee2e2; color: #b91c1c; } .b2 { background: #fef3c7; color: #b45309; } .b3 { background: #dbeafe; color: #1d4ed8; }
    .ex { list-style: none; margin: 0; padding: 0; max-height: 262px; overflow: auto; }
    .ex li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; } .ex li > div { flex: 1; display: flex; flex-direction: column; min-width: 0; } .ex small { color: var(--muted); font-size: 11px; }
    .lay { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 12px; align-items: start; } .side { display: flex; flex-direction: column; gap: 12px; }
    .rules, .feed { list-style: none; margin: 0; padding: 0; }
    .rules li { padding: 9px 0; border-bottom: 1px solid #f0f1f6; } .rules li.off { opacity: .55; }
    .rh { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; } .rh > div { display: flex; flex-direction: column; min-width: 0; } .rh b { font-size: 12.5px; } .rh small { color: var(--muted); font-size: 10.5px; }
    .rd { height: 26px; border-radius: 6px; color: #fff; font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
    .rf { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 0 48px; gap: 8px; } .rf small { color: var(--muted); font-size: 10.5px; } .rf span { display: flex; gap: 10px; white-space: nowrap; }
    .link:disabled { opacity: .4; cursor: default; }
    .sw { position: relative; width: 34px; height: 19px; cursor: pointer; } .sw input { display: none; } .sw i { position: absolute; inset: 0; border-radius: 12px; background: #d6d8e3; transition: .2s; }
    .sw i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; transition: .2s; } .sw input:checked + i { background: var(--primary); } .sw input:checked + i::after { left: 17px; }
    .feed li { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; } .feed li > div { display: flex; flex-direction: column; } .feed small { color: var(--muted); font-size: 10.5px; }
    .fi { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; } .fi.reminder { background: #dbeafe; color: #1d4ed8; } .fi.rule { background: #ede9fe; color: #6d28d9; } .fi.renewal { background: #dcfce7; color: #15803d; } .fi.schedule { background: #fef3c7; color: #b45309; }
    .sc1 { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; background: #f7f7fb; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12.5px; }
    .sc1 > div { display: flex; flex-direction: column; } .sc1 small { color: var(--muted); font-size: 11px; } .sc1 .r { text-align: right; } .red { color: #dc2626 !important; }
    .cg { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    .cgh { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; } .cgh .muted { margin-left: auto; font-size: 11.5px; }
    .ss { display: grid; gap: 6px; } .ss label { display: grid; grid-template-columns: 18px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; cursor: pointer; font-size: 12px; }
    .ss label input { grid-row: span 2; align-self: center; } .ss label small { grid-column: 2; color: var(--muted); font-size: 11px; } .ss label em { grid-row: 1 / 3; grid-column: 3; align-self: center; font-style: normal; font-size: 11px; color: #15803d; }
    .ss label.on { border-color: var(--primary); background: #faf7ff; } .ss label.full { opacity: .5; } .ss label.full em { color: #b91c1c; }
    .dl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; max-width: 220px; }
    .ck { display: flex; align-items: center; gap: 6px; font-size: 12.5px; margin-top: 4px; }
    .cks { display: flex; gap: 14px; flex-wrap: wrap; } .cks label { flex-direction: row !important; display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
    .danger { color: var(--red) !important; margin-right: auto; }
    @media (max-width: 1250px) { .lay { grid-template-columns: 1fr; } .wins { grid-template-columns: repeat(2, 1fr); } }
  `,
})
export class RenewalsExpiryAlerts extends TrnPage {
  protected readonly wins = WINS;
  protected readonly types = CERT_TYPES;
  protected readonly channels = CHANNELS;
  protected readonly recipients = RECIPIENTS;
  protected readonly triggers = [120, 90, 60, 45, 30, 21, 14, 7, 0];
  protected readonly kindIcon: Record<string, string> = { reminder: 'training-send', rule: 'bell-ring', renewal: 'training-repeat', schedule: 'calendar-days' };
  protected readonly win = signal<Win>('0–30 days');
  protected readonly err = signal('');
  protected ct(id: string) {
    return CT.get(id)!;
  }
  protected scopeName(s: string) {
    return s === 'All' ? 'All certificates' : CT.get(s)?.name ?? s;
  }
  protected tog(l: string[], v: string) {
    return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  }

  private readonly live = computed(() => this.store.certs().filter((c) => !c.revoked));
  /** cert id → open renewal enrolment */
  private readonly scheduled = computed(() => {
    const open = new Map<string, string>();
    for (const e of this.store.enrollments()) if (e.status !== 'Completed') open.set(`${e.empId}|${e.courseId}`, e.due);
    const m = new Map<string, string>();
    for (const c of this.live()) {
      const d = open.get(`${c.empId}|${this.ct(c.typeId).courseId}`);
      if (d) m.set(c.id, d);
    }
    return m;
  });
  protected readonly winCards = computed(() => {
    const defs: [Win, string, string, string, string][] = [
      ['Expired', 'Expired', '#ef4444', 'triangle-alert', 'not authorised to work'],
      ['0–30 days', 'Expiring in 30 days', '#f97316', 'clock', 'reminders + auto-enrol'],
      ['31–60 days', 'Expiring in 31–60 days', '#f59e0b', 'calendar-days', 'manager heads-up'],
      ['61–90 days', 'Expiring in 61–90 days', '#3b82f6', 'bell', 'early notice'],
    ];
    return defs.map(([win, label, color, icon, sub]) => {
      const l = this.live().filter((c) => inWin(daysUntil(c.expiry), win));
      const s = l.filter((c) => this.scheduled().has(c.id)).length;
      return { win, label, color, icon, sub, n: l.length, sched: l.length ? Math.round((s / l.length) * 100) : 0 };
    });
  });
  protected readonly weekLabels = Array.from({ length: 13 }, (_, i) => (i === 0 ? 'This wk' : `W+${i}`));
  protected readonly runway = computed<Series[]>(() => {
    const lic = Array(13).fill(0), crt = Array(13).fill(0), done = Array(13).fill(0);
    for (const c of this.live()) {
      const d = daysUntil(c.expiry);
      if (d < 0 || d > 90) continue;
      const w = Math.min(12, Math.floor(d / 7));
      if (this.scheduled().has(c.id)) done[w]++;
      else if (this.ct(c.typeId).licence) lic[w]++;
      else crt[w]++;
    }
    return [
      { name: 'Certificates', color: '#8b5cf6', values: crt },
      { name: 'Licences', color: '#f97316', values: lic },
      { name: 'Renewal scheduled', color: '#22c55e', values: done },
    ];
  });
  protected readonly expiredByType = computed(() => {
    const m = new Map<string, Cert[]>();
    for (const c of this.live()) if (daysUntil(c.expiry) < 0) m.set(c.typeId, [...(m.get(c.typeId) ?? []), c]);
    return [...m.entries()].map(([id, certs]) => ({ type: this.ct(id), certs, n: certs.length, oldest: Math.max(...certs.map((c) => -daysUntil(c.expiry))) })).sort((a, b) => b.n - a.n);
  });
  protected readonly expiredTotal = computed(() => this.expiredByType().reduce((a, g) => a + g.n, 0));

  /* ---------- table ---------- */
  protected readonly rows = computed(() => {
    const w = this.win();
    const sch = this.scheduled();
    return this.live()
      .map((c) => ({ c, d: daysUntil(c.expiry) }))
      .filter((x) => inWin(x.d, w))
      .map(({ c, d }) => {
        const p = this.person(c.empId);
        const t = this.ct(c.typeId);
        const due = sch.get(c.id);
        return {
          ...c, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, site: p.site, cert: t.name, issuer: t.issuer, left: d, kind: t.licence ? 'Licence' : 'Certificate',
          renewal: due ? `Scheduled · ${this.fd(due)}` : c.snoozed ? 'Snoozed' : 'Not scheduled',
          remind: c.reminded ?? 0, status: d < 0 ? 'Expired' : d <= 30 ? 'Expiring' : 'Valid',
        };
      })
      .sort((a, b) => a.left - b.left);
  });
  protected readonly unreminded = computed(() => this.rows().filter((r) => !r.remind && !r.snoozed).length);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'cert', label: 'Certificate / Licence', sub: 'number' },
    { key: 'expiry', label: 'Expiry', fmt: (v) => this.fd(v).slice(0, 6) + ' ' + v.slice(2, 4) },
    { key: 'left', label: 'Days Left', kind: 'num', fmt: (v) => (v < 0 ? `${-v} overdue` : `${v}`) },
    { key: 'remind', label: 'Reminders', kind: 'num' },
    { key: 'renewal', label: 'Renewal', kind: 'tag', tag: (r) => (r.renewal.startsWith('Scheduled') ? 'tag green' : r.renewal === 'Snoozed' ? 'tag grey' : 'tag amber') },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'cert', label: 'Certificate', options: CERT_TYPES.map((t) => t.name) },
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'kind', label: 'Type', options: ['Certificate', 'Licence'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'remind', label: 'Send reminder', icon: 'training-send' },
    { id: 'schedule', label: 'Schedule renewal', icon: 'calendar-days', when: (r) => !r.renewal.startsWith('Scheduled') },
    { id: 'renew', label: 'Record renewal', icon: 'training-repeat' },
    { id: 'snooze', label: 'Snooze 7 days', icon: 'training-snooze', when: (r) => !r.snoozed && r.left >= 0 },
    { id: 'register', label: 'Open in register', icon: 'id-card' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'remind', label: 'Send reminders' }, { id: 'schedule', label: 'Schedule renewals' }, { id: 'export', label: 'Export' }];
  private certsByIds(ids: string[]) {
    const s = new Set(ids);
    return this.store.certs().filter((c) => s.has(c.id));
  }
  protected act(a: string, r: Cert) {
    const c = this.store.certs().find((x) => x.id === r.id)!;
    const p = this.person(c.empId);
    const t = this.ct(c.typeId);
    if (a === 'schedule') return this.openSchedule([c]);
    if (a === 'register') return this.go('certifications-licenses');
    if (a === 'renew') {
      this.store.renew(c.id);
      this.store.addAlert(`${t.name} renewed for ${p.name}`, 'renewal');
      return this.msg(`${t.name} renewed for ${p.name} · valid ${t.months} months`);
    }
    if (a === 'snooze') {
      this.store.patchCert(c.id, { snoozed: true });
      return this.msg(`Alerts for ${p.name}'s ${t.name} snoozed for 7 days`);
    }
    this.remind([c]);
  }
  protected bulkAct(a: string, ids: string[]) {
    const certs = this.certsByIds(ids);
    if (a === 'remind') return this.remind(certs);
    if (a === 'schedule') return this.openSchedule(certs);
    this.csv('renewals-selected.csv', this.rows().filter((r) => ids.includes(r.id)));
  }
  private remind(certs: Cert[]) {
    if (!certs.length) return this.msg('Nothing to remind');
    this.store.remind(certs.map((c) => c.id));
    const one = certs.length === 1 ? `${this.person(certs[0].empId).name} · ${this.ct(certs[0].typeId).name} (${daysUntil(certs[0].expiry)} days)` : `${certs.length} certificate holders`;
    this.store.addAlert(`Reminder sent to ${one}`, 'reminder');
    certs.filter((c) => this.store.empById().has(c.empId)).forEach((c) => this.store.addLog(`Renewal reminder sent · ${this.ct(c.typeId).name}`, c.empId));
    this.msg(`Reminder sent to ${one}`);
  }
  protected remindWindow() {
    const ids = new Set(this.rows().filter((r) => !r.remind && !r.snoozed).map((r) => r.id));
    this.remind(this.store.certs().filter((c) => ids.has(c.id)));
  }

  /* ---------- schedule renewal ---------- */
  protected readonly sch = signal<{ certs: Cert[]; pick: Record<string, string>; notify: boolean } | null>(null);
  protected sessionsFor(courseId: string) {
    return this.store.sessions().filter((s) => s.courseId === courseId && s.date >= iso(0));
  }
  protected defaultDue(certs: Cert[]) {
    const min = certs.map((c) => c.expiry).sort()[0];
    return min && min > iso(7) ? min : iso(14);
  }
  protected readonly courseGroups = computed(() => {
    const s = this.sch();
    if (!s) return [];
    const m = new Map<string, Cert[]>();
    s.certs.forEach((c) => {
      const id = this.ct(c.typeId).courseId;
      m.set(id, [...(m.get(id) ?? []), c]);
    });
    return [...m.entries()].map(([courseId, certs]) => ({ courseId, certs }));
  });
  protected openSchedule(certs: Cert[]) {
    const todo = certs.filter((c) => !this.scheduled().has(c.id));
    if (!todo.length) return this.msg('Renewal already scheduled for the selection');
    const pick: Record<string, string> = {};
    const groups = new Map<string, number>();
    todo.forEach((c) => groups.set(this.ct(c.typeId).courseId, (groups.get(this.ct(c.typeId).courseId) ?? 0) + 1));
    groups.forEach((n, cid) => {
      const s = this.sessionsFor(cid).find((x) => x.booked + n <= x.seats);
      if (s) pick[cid] = s.id;
    });
    this.sch.set({ certs: todo, pick, notify: true });
  }
  protected setPick(courseId: string, v: string) {
    const s = this.sch()!;
    this.sch.set({ ...s, pick: { ...s.pick, [courseId]: v } });
  }
  protected doSchedule() {
    const s = this.sch()!;
    let n = 0;
    for (const g of this.courseGroups()) {
      const pick = s.pick[g.courseId];
      const ses = this.store.sessions().find((x) => x.id === pick);
      const due = ses ? ses.date : pick || this.defaultDue(g.certs);
      const added = this.store.enroll(g.certs.map((c) => c.empId), g.courseId, due, 'Auto (Renewal)');
      if (ses) this.store.sessions.update((l) => l.map((x) => (x.id === ses.id ? { ...x, booked: Math.min(x.seats, x.booked + added) } : x)));
      n += added;
    }
    const first = s.certs[0];
    this.store.addAlert(s.certs.length === 1 ? `Renewal scheduled · ${this.ct(first.typeId).name} for ${this.person(first.empId).name}` : `${n} renewals scheduled across ${this.courseGroups().length} course(s)`, 'schedule');
    this.sch.set(null);
    this.msg(n ? `${n} renewal(s) scheduled${s.notify ? ' · invites sent' : ''}` : 'Employees were already enrolled in the refresher');
  }

  /* ---------- alert rules ---------- */
  protected readonly rf = signal<AlertRule | null>(null);
  protected openRule(r?: AlertRule) {
    this.err.set('');
    this.rf.set(r ? { ...r, channels: [...r.channels], recipients: [...r.recipients] } : { id: '', name: '', scope: 'All', days: 30, channels: ['Email'], recipients: ['Employee'], enabled: true, autoEnroll: false, fired: 0 });
  }
  protected ruleMatches(r: AlertRule) {
    return this.live().filter((c) => (r.scope === 'All' || c.typeId === r.scope) && !c.snoozed && (r.days === 0 ? daysUntil(c.expiry) < 0 : daysUntil(c.expiry) >= 0 && daysUntil(c.expiry) <= r.days));
  }
  protected saveRule() {
    const f = this.rf()!;
    if (!f.name.trim()) return this.err.set('Give the rule a name.');
    if (!f.channels.length || !f.recipients.length) return this.err.set('Choose at least one channel and one recipient.');
    if (f.id) this.store.rules.update((l) => l.map((x) => (x.id === f.id ? f : x)));
    else this.store.rules.update((l) => [...l, { ...f, id: `AR-${l.length + 1 + Date.now() % 1000}` }].sort((a, b) => b.days - a.days));
    this.rf.set(null);
    this.msg(`Rule “${f.name}” saved · matches ${this.ruleMatches(f).length} certificates`);
  }
  protected deleteRule(id: string) {
    this.store.rules.update((l) => l.filter((x) => x.id !== id));
    this.rf.set(null);
    this.msg('Rule deleted');
  }
  protected toggleRule(r: AlertRule) {
    this.store.rules.update((l) => l.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    this.msg(`${r.name} ${r.enabled ? 'paused' : 'enabled'}`);
  }
  protected runRules(only?: AlertRule) {
    const rules = only ? [only] : this.store.rules().filter((r) => r.enabled);
    const stamp = `${iso(0)} ${new Date().toTimeString().slice(0, 5)}`;
    let sent = 0, enrolled = 0;
    const touched = new Set<string>();
    for (const r of rules) {
      const m = this.ruleMatches(r).filter((c) => !c.reminded);
      m.forEach((c) => touched.add(c.id));
      const k = m.length * r.recipients.length * r.channels.length;
      sent += k;
      if (r.autoEnroll) for (const c of m) enrolled += this.store.enroll([c.empId], this.ct(c.typeId).courseId, c.expiry < iso(7) ? iso(14) : c.expiry, 'Auto (Renewal)');
      this.store.rules.update((l) => l.map((x) => (x.id === r.id ? { ...x, fired: x.fired + k, lastRun: stamp } : x)));
    }
    this.store.remind([...touched]);
    this.store.addAlert(`${only ? only.name : 'Manual expiry scan'}: ${rules.length} rule(s) fired · ${sent} notifications sent${enrolled ? ` · ${enrolled} auto-enrolled` : ''}`, 'rule');
    this.msg(`${rules.length} rule(s) run · ${touched.size} certificates matched · ${sent} notifications${enrolled ? ` · ${enrolled} auto-enrolled` : ''}`);
  }

  /* ---------- export ---------- */
  private csv(name: string, rows: ReturnType<RenewalsExpiryAlerts['rows']>) {
    downloadCsv(name, [['Certificate ID', 'Employee ID', 'Employee', 'Department', 'Site', 'Certificate', 'Type', 'Number', 'Expiry', 'Days Left', 'Reminders', 'Renewal', 'Status'], ...rows.map((r) => [r.id, r.empId, r.name, r.dept, r.site, r.cert, r.kind, r.number, r.expiry, r.left, r.remind, r.renewal, r.status])]);
  }
  protected exportCsv() {
    this.csv(`renewals-${this.win().replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, this.rows());
    this.msg(`Exported ${this.rows().length} certificates`);
  }
}
