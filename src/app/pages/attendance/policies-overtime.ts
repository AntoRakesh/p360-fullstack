import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { DEPTS } from '../people/people.data';
import { hhmm, RECORDS, toMinutes } from './attendance.data';

/* ======================= Attendance Policies ======================= */
interface Policy {
  id: number;
  name: string;
  appliesTo: string;
  people: number;
  shiftStart: string;
  shiftEnd: string;
  grace: number;
  halfDayAfter: number;
  minFullDay: number;
  otAfter: number;
  otRate: number;
  maxOtWeek: number;
  breakMin: number;
  weekend: string[];
  methods: string[];
  geofence: boolean;
  autoCheckout: string;
  rounding: number;
  updated: string;
}
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const POLICIES: Policy[] = [
  { id: 1, name: 'General Office', appliesTo: 'Head Office, Regional Office, Tech Center', people: 5210, shiftStart: '09:00', shiftEnd: '18:00', grace: 10, halfDayAfter: 120, minFullDay: 8, otAfter: 9, otRate: 1.25, maxOtWeek: 12, breakMin: 60, weekend: ['Sat', 'Sun'], methods: ['Face', 'Card', 'Mobile'], geofence: true, autoCheckout: '23:59', rounding: 5, updated: '12 Oct 2026' },
  { id: 2, name: 'Shift Workers', appliesTo: 'Manufacturing, Warehouse', people: 2980, shiftStart: '07:00', shiftEnd: '16:00', grace: 5, halfDayAfter: 90, minFullDay: 8, otAfter: 8, otRate: 1.5, maxOtWeek: 16, breakMin: 45, weekend: ['Fri'], methods: ['Face', 'Fingerprint', 'Card'], geofence: false, autoCheckout: '17:30', rounding: 15, updated: '02 Sep 2026' },
  { id: 3, name: 'Field & Sales Staff', appliesTo: 'Sales, Support (field)', people: 480, shiftStart: '08:30', shiftEnd: '17:30', grace: 15, halfDayAfter: 180, minFullDay: 7.5, otAfter: 9, otRate: 1.25, maxOtWeek: 8, breakMin: 60, weekend: ['Sat', 'Sun'], methods: ['Mobile'], geofence: true, autoCheckout: '22:00', rounding: 5, updated: '18 Aug 2026' },
  { id: 4, name: 'Part-time', appliesTo: 'Part Time employees', people: 250, shiftStart: '10:00', shiftEnd: '14:00', grace: 10, halfDayAfter: 60, minFullDay: 4, otAfter: 5, otRate: 1, maxOtWeek: 4, breakMin: 15, weekend: ['Sat', 'Sun'], methods: ['Face', 'Card', 'Mobile'], geofence: false, autoCheckout: '20:00', rounding: 5, updated: '30 Jun 2026' },
  { id: 5, name: 'Contractors', appliesTo: 'All contractor workers', people: 1326, shiftStart: '07:30', shiftEnd: '17:00', grace: 0, halfDayAfter: 60, minFullDay: 8, otAfter: 9, otRate: 1, maxOtWeek: 10, breakMin: 45, weekend: ['Fri'], methods: ['Face', 'Card'], geofence: false, autoCheckout: '19:00', rounding: 15, updated: '05 Oct 2026' },
];

@Component({
  selector: 'app-att-policies',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Attendance Policies" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Rules for grace time, late marks, half days, overtime, breaks and allowed punch methods.">
      <button class="btn-primary" (click)="addPolicy()"><app-icon name="plus" [size]="16" />New Policy</button>
    </app-page-head>
    <section class="pol-layout">
      <aside class="card pol-list">
        @for (p of policies(); track p.id) {
          <button class="pol" [class.on]="selId() === p.id" (click)="selId.set(p.id)">
            <b>{{ p.name }}</b><small>{{ p.appliesTo }}</small>
            <span class="muted">{{ p.people.toLocaleString() }} people · {{ p.shiftStart }}–{{ p.shiftEnd }}</span>
          </button>
        }
      </aside>

      @if (sel(); as p) {
        <div class="card pol-form">
          <div class="card-head">
            <h3>{{ p.name }}</h3>
            <span class="muted">Last updated {{ p.updated }}</span>
          </div>
          <h4>General</h4>
          <div class="form-grid three">
            <label>Policy name<input class="input" [value]="p.name" (change)="set('name', $any($event.target).value)" /></label>
            <label class="span2">Applies to<input class="input" [value]="p.appliesTo" (change)="set('appliesTo', $any($event.target).value)" /></label>
            <label>Shift start<input class="input" type="time" [value]="p.shiftStart" (change)="set('shiftStart', $any($event.target).value)" /></label>
            <label>Shift end<input class="input" type="time" [value]="p.shiftEnd" (change)="set('shiftEnd', $any($event.target).value)" /></label>
            <label>Auto check-out at<input class="input" type="time" [value]="p.autoCheckout" (change)="set('autoCheckout', $any($event.target).value)" /></label>
          </div>
          <h4>Late, half day &amp; full day</h4>
          <div class="form-grid three">
            <label>Grace period (min)<input class="input" type="number" min="0" [value]="p.grace" (change)="set('grace', +$any($event.target).value)" /></label>
            <label>Half day if late by (min)<input class="input" type="number" min="0" [value]="p.halfDayAfter" (change)="set('halfDayAfter', +$any($event.target).value)" /></label>
            <label>Min. hours for full day<input class="input" type="number" step="0.5" [value]="p.minFullDay" (change)="set('minFullDay', +$any($event.target).value)" /></label>
            <label>Punch rounding (min)
              <select class="select" [value]="p.rounding" (change)="set('rounding', +$any($event.target).value)"><option [value]="0">None</option><option [value]="5">5</option><option [value]="10">10</option><option [value]="15">15</option></select>
            </label>
            <label>Paid break (min)<input class="input" type="number" [value]="p.breakMin" (change)="set('breakMin', +$any($event.target).value)" /></label>
          </div>
          <h4>Overtime</h4>
          <div class="form-grid three">
            <label>OT starts after (h)<input class="input" type="number" step="0.5" [value]="p.otAfter" (change)="set('otAfter', +$any($event.target).value)" /></label>
            <label>OT rate (×)<input class="input" type="number" step="0.25" [value]="p.otRate" (change)="set('otRate', +$any($event.target).value)" /></label>
            <label>Max OT per week (h)<input class="input" type="number" [value]="p.maxOtWeek" (change)="set('maxOtWeek', +$any($event.target).value)" /></label>
          </div>
          <h4>Weekly off &amp; capture</h4>
          <div class="chips">
            @for (d of week; track d) {<button class="chip-btn" [class.on]="p.weekend.includes(d)" (click)="toggle('weekend', d)">{{ d }}</button>}
          </div>
          <div class="chips">
            @for (m of methods; track m) {<button class="chip-btn" [class.on]="p.methods.includes(m)" (click)="toggle('methods', m)">{{ m }}</button>}
            <label class="geo"><input type="checkbox" [checked]="p.geofence" (change)="set('geofence', !p.geofence)" /> Require geofence for mobile punches</label>
          </div>
          <div class="form-actions">
            <button class="btn-ghost" (click)="reset()">Discard changes</button>
            <button class="btn-primary" (click)="save()">Save policy</button>
          </div>
        </div>

        <div class="card sim">
          <div class="card-head"><h3>Policy Simulator</h3></div>
          <p class="muted">Try a check-in and check-out to see how this policy classifies the day.</p>
          <div class="form-grid">
            <label>Check-in<input class="input" type="time" [value]="simIn()" (input)="simIn.set($any($event.target).value)" /></label>
            <label>Check-out<input class="input" type="time" [value]="simOut()" (input)="simOut.set($any($event.target).value)" /></label>
          </div>
          @let r = result();
          <div class="verdict" [style.background]="'color-mix(in srgb, ' + r.color + ' 9%, transparent)'" [style.border-color]="r.color">
            <b [style.color]="r.color">{{ r.status }}</b>
            <span>{{ r.note }}</span>
          </div>
          <dl class="kv">
            <dt>Rounded in / out</dt><dd>{{ r.inR }} / {{ r.outR }}</dd>
            <dt>Late by</dt><dd>{{ r.late }} min</dd>
            <dt>Worked (after break)</dt><dd>{{ r.worked }} h</dd>
            <dt>Overtime</dt><dd>{{ r.ot }} h × {{ p.otRate }} = {{ r.otPaid }} h paid</dd>
          </dl>
        </div>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .pol-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
    .pol-list { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
    .pol { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .pol small { color: var(--kf-4b4f6b); } .pol:hover { background: var(--kb-faf8ff); } .pol.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    h4 { margin: 16px 0 8px; font-size: 13px; color: var(--kf-4b4f6b); }
    .three { grid-template-columns: repeat(3, minmax(0, 1fr)); } .span2 { grid-column: span 2; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
    .chip-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--kb-ffffff); font-size: 12px; cursor: pointer; }
    .chip-btn.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .geo { display: flex; align-items: center; gap: 6px; font-size: 12.5px; margin-left: 8px; }
    .verdict { display: flex; flex-direction: column; gap: 3px; padding: 12px; border: 1px solid; border-radius: 10px; margin: 14px 0; font-size: 12.5px; }
    .verdict b { font-size: 18px; }
    .kv { display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; font-weight: 600; }
    @media (max-width: 1300px) { .pol-layout { grid-template-columns: 220px 1fr; } .sim { grid-column: 1 / -1; } }
    @media (max-width: 800px) { .pol-layout { grid-template-columns: 1fr; } .three { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
  `,
})
export class AttendancePolicies {
  protected readonly week = WEEK;
  protected readonly methods = ['Face', 'Card', 'Fingerprint', 'Mobile'];
  private saved = POLICIES;
  protected readonly policies = signal<Policy[]>(POLICIES);
  protected readonly selId = signal(1);
  protected readonly simIn = signal('09:14');
  protected readonly simOut = signal('19:05');
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.policies().find((p) => p.id === this.selId()) ?? null);

  /** Applies the selected policy rules to the simulator times. */
  protected readonly result = computed(() => {
    const p = this.sel()!;
    const round = (m: number) => (p.rounding ? Math.round(m / p.rounding) * p.rounding : m);
    const inM = round(toMinutes(this.simIn() || '00:00'));
    let outM = round(toMinutes(this.simOut() || this.simIn() || '00:00'));
    if (outM < inM) outM += 1440;
    const start = toMinutes(p.shiftStart);
    const late = Math.max(0, inM - start);
    const worked = Math.max(0, Math.round(((outM - inM - p.breakMin) / 60) * 10) / 10);
    const ot = Math.min(p.maxOtWeek, Math.max(0, Math.round((worked - p.otAfter + p.breakMin / 60) * 10) / 10));
    let status = 'Present';
    let color = 'var(--ka-16a34a)';
    let note = 'On time and full day.';
    if (late > p.halfDayAfter || worked < p.minFullDay / 2) [status, color, note] = ['Half Day', 'var(--ka-7c3aed)', `Late by more than ${p.halfDayAfter} min or under half the required hours.`];
    else if (late > p.grace) [status, color, note] = ['Late', 'var(--ka-d97706)', `Arrived ${late} min after shift start (grace ${p.grace} min).`];
    else if (worked < p.minFullDay) [status, color, note] = ['Short Hours', 'var(--ka-dc2626)', `Worked ${worked} h, policy needs ${p.minFullDay} h.`];
    if (ot > 0 && status === 'Present') note = `Full day with ${ot} h overtime.`;
    return { status, color, note, late, worked, ot, otPaid: Math.round(ot * p.otRate * 100) / 100, inR: hhmm(inM), outR: hhmm(outM % 1440) };
  });

  protected set<K extends keyof Policy>(k: K, v: Policy[K]) {
    const id = this.selId();
    this.policies.update((l) => l.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
  }
  protected toggle(k: 'weekend' | 'methods', v: string) {
    const cur = this.sel()![k];
    this.set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  }
  protected save() {
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    this.set('updated', today);
    this.saved = this.policies();
    this.notify(`Policy “${this.sel()!.name}” saved`);
  }
  protected reset() {
    this.policies.set(this.saved);
  }
  protected addPolicy() {
    const id = Math.max(...this.policies().map((p) => p.id)) + 1;
    this.policies.update((l) => [...l, { ...POLICIES[0], id, name: 'New Policy', appliesTo: 'Not assigned', people: 0, updated: '—' }]);
    this.selId.set(id);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Break & Overtime Management ======================= */
interface OtReq {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  date: string;
  hours: number;
  reason: string;
  cost: number;
  status: string;
}
const REASONS = ['Month-end closing', 'Production backlog', 'System migration', 'Customer escalation', 'Inventory count', 'Shift cover'];
const OT: OtReq[] = (() => {
  const r = rng(321);
  return RECORDS.filter((x) => x.status === 'Present').slice(0, 140).map((x, i) => {
    const hours = Math.round((1 + r() * 4) * 2) / 2;
    return {
      id: `OT-${8800 + i}`, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept,
      date: new Date(Date.now() - Math.floor(r() * 10) * 86400000).toISOString().slice(0, 10),
      hours, reason: REASONS[Math.floor(r() * REASONS.length)], cost: Math.round(hours * (45 + r() * 60) * 1.25),
      status: i < 46 ? 'Pending' : r() < 0.88 ? 'Approved' : 'Rejected',
    };
  });
})();

@Component({
  selector: 'app-break-overtime',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Break &amp; Overtime Management" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Live break monitoring, overtime requests, approvals and cost." />
    <section class="kpi-row">
      <app-kpi label="On Break Now" [value]="breaks().length" icon="coffee" color="var(--ka-8b5cf6)" sub="across sites" />
      <app-kpi label="Break Overruns" [value]="overruns()" icon="triangle-alert" color="var(--ka-ef4444)" sub="over 60 min" />
      <app-kpi label="OT Hours (week)" [value]="otHours()" icon="clock" color="var(--ka-f97316)" change="5%" [good]="false" />
      <app-kpi label="OT Cost (week)" [value]="'AED ' + otCost()" icon="trending-up" color="var(--ka-3b82f6)" />
      <app-kpi label="Pending OT Approvals" [value]="count('Pending')" icon="file-check" color="var(--ka-f59e0b)" />
    </section>
    <section class="dash">
      <div class="card span-5">
        <div class="card-head"><h3>On Break Now</h3><span class="muted">updates live</span></div>
        <ul class="breaks">
          @for (b of breaks(); track b.id) {
            <li [class.over]="b.mins > 60">
              <span class="dt-av" [style.background]="b.avatar">{{ b.initials }}</span>
              <div><b>{{ b.name }}</b><small>{{ b.dept }} · since {{ b.since }}</small></div>
              <span class="mins">{{ b.mins }} min</span>
              @if (b.mins > 60) {<button class="btn-ghost sm" (click)="nudge(b.name)">Notify</button>}
            </li>
          }
        </ul>
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Overtime by Department <span class="card-sub">hours, this week</span></h3></div>
        <app-column-chart [labels]="deptLabels" [series]="otByDept()" [height]="230" [legend]="false" />
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Overtime Requests</h3></div>
        <app-data-table [rows]="list()" [columns]="cols" noun="requests" [searchKeys]="['name', 'empId', 'reason']" searchPlaceholder="Search employee or reason..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="decide([$event.row.id], $event.action)" (bulk)="decide($event.ids, $event.action)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .breaks { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; }
    .breaks li { display: grid; grid-template-columns: 32px 1fr auto auto; gap: 10px; align-items: center; padding: 7px 4px; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .breaks li div { display: flex; flex-direction: column; } .breaks small { color: var(--muted); }
    .mins { font-weight: 600; font-variant-numeric: tabular-nums; } .over { background: var(--kb-fff5f5); } .over .mins { color: var(--red); }
  `,
})
export class BreakOvertime {
  private readonly state = inject(AppState);
  protected readonly deptLabels = DEPTS.filter((d) => d !== '—').map((d) => d.split(' ')[0]);
  protected readonly list = signal<OtReq[]>(OT);
  protected readonly toast = signal<string | null>(null);
  private readonly breakStart = RECORDS.filter((x) => x.status === 'Present').slice(300, 314).map((x, i) => ({ ...x, start: Date.now() - (8 + i * 6) * 60000 }));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'dept', label: 'Department' },
    { key: 'date', label: 'Date', fmt: (v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
    { key: 'hours', label: 'Hours', kind: 'num' },
    { key: 'reason', label: 'Reason' },
    { key: 'cost', label: 'Cost (AED)', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] }, { key: 'dept', label: 'Department', options: DEPTS }];
  protected readonly actions: RowAction[] = [
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.status !== 'Approved' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status !== 'Rejected' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Approved', label: 'Approve' }, { id: 'Rejected', label: 'Reject', danger: true }];

  protected readonly breaks = computed(() => {
    this.state.tick();
    return this.breakStart
      .map((b) => ({ ...b, mins: Math.floor((Date.now() - b.start) / 60000), since: new Date(b.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }))
      .sort((a, b) => b.mins - a.mins);
  });
  protected readonly overruns = computed(() => this.breaks().filter((b) => b.mins > 60).length);
  protected readonly otHours = computed(() => this.list().filter((o) => o.status !== 'Rejected').reduce((a, o) => a + o.hours, 0).toLocaleString());
  protected readonly otCost = computed(() => `${(this.list().filter((o) => o.status === 'Approved').reduce((a, o) => a + o.cost, 0) / 1000).toFixed(1)}K`);
  protected readonly otByDept = computed(() => [
    { name: 'OT hours', color: 'var(--ka-f97316)', values: DEPTS.filter((d) => d !== '—').map((d) => this.list().filter((o) => o.dept === d && o.status !== 'Rejected').reduce((a, o) => a + o.hours, 0)) },
  ]);

  protected count(s: string) {
    return String(this.list().filter((o) => o.status === s).length);
  }
  protected decide(ids: string[], status: string) {
    const set = new Set(ids);
    this.list.update((l) => l.map((o) => (set.has(o.id) ? { ...o, status } : o)));
    this.notify(`${ids.length} request(s) ${status.toLowerCase()}`);
  }
  protected nudge(name: string) {
    this.notify(`Reminder sent to ${name}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
