import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { DEPTS, SITES } from '../people/people.data';
import { APPLICATIONS, Balance, BALANCES, LEAVE_TYPES, LeaveApp, typeByCode, workingDays } from './leave.data';

const short = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

/* ======================= Leave Balances ======================= */
interface Ledger {
  date: string;
  type: string;
  change: number;
  note: string;
}

@Component({
  selector: 'app-leave-balances',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Balances" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Entitlement, used and remaining days per employee, with manual adjustments.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="yearEnd()"><app-icon name="refresh" [size]="16" />Run year-end carry forward</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Avg. Annual Leave Left" [value]="avgLeft() + ' days'" icon="tree" color="var(--ka-16a34a)" />
      <app-kpi label="Unused > 20 days" [value]="high()" icon="triangle-alert" color="var(--ka-f59e0b)" sub="burnout risk / liability" />
      <app-kpi label="Negative Balances" [value]="negative()" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="Carry-forward Expiring" [value]="expiring()" icon="clock" color="var(--ka-8b5cf6)" sub="on 31 Mar" />
      <app-kpi label="Leave Liability" [value]="'AED ' + liability()" icon="trending-up" color="var(--ka-3b82f6)" sub="unused AL × daily rate" />
    </section>
    <section class="lb" [class.with-detail]="!!sel()">
      <div class="card">
        <div class="card-head"><h3>Remaining Annual Leave Distribution</h3></div>
        <app-column-chart [labels]="bucketLabels" [series]="buckets()" [height]="170" [legend]="false" />
        <app-data-table [rows]="rows()" [columns]="cols" noun="employees" [searchKeys]="['name', 'id']" searchPlaceholder="Search employee..." [filters]="filters"
          [actions]="actions" [activeId]="selId()" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" />
      </div>
      @if (sel(); as b) {
        <aside class="card detail">
          <div class="card-head"><div class="who"><span class="dt-av" [style.background]="b.avatar">{{ b.initials }}</span><div><b>{{ b.name }}</b><small>{{ b.id }} · {{ b.dept }}</small></div></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          @for (x of cards(b); track x.code) {
            <div class="bal">
              <span class="ic" [style.background]="'color-mix(in srgb, ' + x.color + ' 12%, transparent)'" [style.color]="x.color"><app-icon [name]="x.icon" [size]="16" /></span>
              <div><b>{{ x.name }}</b><small>{{ x.used }} used of {{ x.total }}</small></div>
              <span class="left" [class.neg]="x.left < 0">{{ x.left }}</span>
              <div class="track"><i [style.width.%]="min(100, (x.used / x.total) * 100)" [style.background]="x.color"></i></div>
            </div>
          }
          <button class="btn-ghost" (click)="adjust.set(b)">Adjust balance</button>
          <h4>Ledger</h4>
          <ol class="ledger">
            @for (l of ledger(b); track $index) {
              <li><span [class]="l.change >= 0 ? 'good' : 'bad'">{{ l.change >= 0 ? '+' : '' }}{{ l.change }}</span><div><b>{{ l.type }} · {{ l.note }}</b><small>{{ l.date }}</small></div></li>
            }
          </ol>
        </aside>
      }
    </section>
    @if (adjust(); as b) {
      <div class="g-overlay" (click)="adjust.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doAdjust(b, t.value, +d.value, why.value)">
        <div class="modal-head"><h3>Adjust balance · {{ b.name }}</h3><button type="button" class="close-btn" (click)="adjust.set(null)">×</button></div>
        <div class="form-grid">
          <label>Leave type<select #t class="select"><option value="AL">Annual Leave</option><option value="SL">Sick Leave</option><option value="CL">Casual Leave</option></select></label>
          <label>Days (+ add / − deduct)<input #d class="input" type="number" step="0.5" value="1" required /></label>
          <label class="full">Reason<input #why class="input" required placeholder="e.g. Compensatory off for weekend work" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="adjust.set(null)">Cancel</button><button class="btn-primary" type="submit">Apply</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .lb { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .lb.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .who { display: flex; gap: 10px; align-items: center; } .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .bal { display: grid; grid-template-columns: 32px 1fr auto; gap: 4px 10px; align-items: center; padding: 8px; border: 1px solid var(--border); border-radius: 8px; }
    .bal .ic { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; grid-row: span 2; }
    .bal div:nth-child(2) { display: flex; flex-direction: column; font-size: 12.5px; } .bal small { color: var(--muted); }
    .left { font-size: 20px; font-weight: 700; color: var(--primary); } .left.neg { color: var(--red); }
    .track { grid-column: 2 / -1; height: 6px; border-radius: 3px; background: var(--kb-eef0f6); overflow: hidden; } .track i { display: block; height: 100%; }
    h4 { margin: 6px 0 0; font-size: 13px; }
    .ledger { list-style: none; margin: 0; padding: 0; font-size: 12px; } .ledger li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .ledger span { font-weight: 700; } .ledger div { display: flex; flex-direction: column; } .ledger small { color: var(--muted); }
    @media (max-width: 1100px) { .lb.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class LeaveBalances {
  private readonly state = inject(AppState);
  protected readonly min = Math.min;
  protected readonly bucketLabels = ['< 0', '0–5', '5–10', '10–15', '15–20', '20–30', '30+'];
  protected readonly list = signal<Balance[]>(BALANCES);
  protected readonly selId = signal<string | null>('EMP-00123');
  protected readonly adjust = signal<Balance | null>(null);
  protected readonly extraLedger = signal<Record<string, Ledger[]>>({});
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'al', label: 'AL Entitled', kind: 'num' },
    { key: 'alUsed', label: 'AL Used', kind: 'num' },
    { key: 'alLeft', label: 'AL Left', kind: 'num' },
    { key: 'carry', label: 'Carried In', kind: 'num' },
    { key: 'slLeft', label: 'SL Left', kind: 'num' },
    { key: 'clLeft', label: 'CL Left', kind: 'num' },
  ];
  protected readonly filters = [{ key: 'dept', label: 'Department', options: DEPTS }, { key: 'site', label: 'Site', options: SITES }];
  protected readonly actions: RowAction[] = [{ id: 'view', label: 'View ledger', icon: 'file-text' }, { id: 'adjust', label: 'Adjust balance', icon: 'sliders' }];
  protected readonly rows = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((b) => b.site === s.name);
  });
  protected readonly sel = computed(() => this.list().find((b) => b.id === this.selId()) ?? null);
  protected readonly avgLeft = computed(() => (this.rows().reduce((a, b) => a + b.alLeft, 0) / (this.rows().length || 1)).toFixed(1));
  protected readonly high = computed(() => this.rows().filter((b) => b.alLeft > 20).length.toLocaleString());
  protected readonly negative = computed(() => String(this.rows().filter((b) => b.alLeft < 0).length));
  protected readonly expiring = computed(() => this.rows().filter((b) => b.carry > 0 && b.alUsed < b.carry).length.toLocaleString());
  protected readonly liability = computed(() => `${((this.rows().reduce((a, b) => a + Math.max(0, b.alLeft), 0) * 420) / 1e6).toFixed(1)}M`);
  protected readonly buckets = computed(() => {
    const edges = [-Infinity, 0, 5, 10, 15, 20, 30, Infinity];
    return [{ name: 'Employees', color: 'var(--ka-16a34a)', values: edges.slice(0, -1).map((lo, i) => this.rows().filter((b) => b.alLeft >= lo && b.alLeft < edges[i + 1]).length) }];
  });

  protected cards(b: Balance) {
    return [
      { ...typeByCode('AL'), total: b.al, used: b.alUsed, left: b.alLeft },
      { ...typeByCode('SL'), total: b.sl, used: b.slUsed, left: b.slLeft },
      { ...typeByCode('CL'), total: b.cl, used: b.clUsed, left: b.clLeft },
    ];
  }
  protected ledger(b: Balance): Ledger[] {
    return [
      ...(this.extraLedger()[b.id] ?? []),
      { date: '01 Jan 2026', type: 'AL', change: 30, note: 'Annual entitlement' },
      { date: '01 Jan 2026', type: 'AL', change: b.carry, note: 'Carried forward from 2025' },
      { date: '01 Jan 2026', type: 'SL', change: 14, note: 'Annual entitlement' },
      { date: 'Year to date', type: 'AL', change: -b.alUsed, note: 'Approved leave taken' },
    ];
  }
  protected act(a: string, b: Balance) {
    if (a === 'adjust') this.adjust.set(b);
    else this.selId.set(b.id);
  }
  protected doAdjust(b: Balance, type: string, days: number, note: string) {
    const k = type === 'AL' ? 'alLeft' : type === 'SL' ? 'slLeft' : 'clLeft';
    const tot = type === 'AL' ? 'al' : type === 'SL' ? 'sl' : 'cl';
    this.list.update((l) => l.map((x) => (x.id === b.id ? { ...x, [k]: x[k] + days, [tot]: x[tot] + days } : x)));
    this.extraLedger.update((m) => ({ ...m, [b.id]: [{ date: 'Just now', type, change: days, note: `Manual: ${note}` }, ...(m[b.id] ?? [])] }));
    this.adjust.set(null);
    this.selId.set(b.id);
    this.notify(`${type} balance for ${b.name} ${days >= 0 ? '+' : ''}${days} days`);
  }
  protected yearEnd() {
    let n = 0;
    this.list.update((l) =>
      l.map((b) => {
        const carry = Math.min(15, Math.max(0, b.alLeft));
        n++;
        return { ...b, carry, al: 30 + carry, alUsed: 0, alLeft: 30 + carry, slUsed: 0, slLeft: 14, clUsed: 0, clLeft: 10 };
      }),
    );
    this.notify(`Year-end processed for ${n.toLocaleString()} employees (max 15 days carried)`);
  }
  protected exportCsv() {
    downloadCsv('leave-balances.csv', [['ID', 'Name', 'Department', 'AL entitled', 'AL used', 'AL left', 'Carry', 'SL left', 'CL left'], ...this.rows().map((b) => [b.id, b.name, b.dept, b.al, b.alUsed, b.alLeft, b.carry, b.slLeft, b.clLeft])]);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* ======================= Leave Applications ======================= */
@Component({
  selector: 'app-leave-applications',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Applications" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Apply, review and approve leave with live balance and team-overlap checks.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Apply Leave</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Pending" [value]="count('Pending')" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Approved (60 days)" [value]="count('Approved')" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="Rejected" [value]="count('Rejected')" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="On Leave Today" [value]="onLeaveToday()" icon="calendar-x" color="var(--ka-8b5cf6)" />
      <app-kpi label="Avg. Approval Time" value="9.4 h" icon="activity" color="var(--ka-3b82f6)" />
    </section>
    <section class="la" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" noun="applications" [selectable]="true" [searchKeys]="['name', 'empId', 'id', 'reason']" searchPlaceholder="Search employee, ID, reason..."
          [filters]="filters" [actions]="actions" [bulkActions]="bulk" [activeId]="selId()" (rowClick)="selId.set($event.id)" (action)="decide([$event.row.id], $event.action)" (bulk)="decide($event.ids, $event.action)" />
      </div>
      @if (sel(); as a) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ a.id }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="who"><span class="dt-av" [style.background]="a.avatar">{{ a.initials }}</span><div><b>{{ a.name }}</b><small>{{ a.empId }} · {{ a.dept }}</small></div></div>
          <div class="lt" [style.background]="'color-mix(in srgb, ' + tcolor(a.type) + ' 8%, transparent)'" [style.border-color]="tcolor(a.type)">
            <b [style.color]="tcolor(a.type)">{{ tname(a.type) }}</b>
            <span>{{ short(a.from) }} → {{ short(a.to) }} · <b>{{ a.days }} working day(s)</b></span>
            <small>“{{ a.reason }}” · applied {{ short(a.applied) }}</small>
          </div>
          <dl class="kv">
            <dt>Balance before</dt><dd>{{ balanceOf(a) }} days</dd>
            <dt>Balance after</dt><dd [class.bad]="balanceOf(a) - a.days < 0">{{ balanceOf(a) - a.days }} days</dd>
            <dt>Status</dt><dd><span [class]="tag(a.status)">{{ a.status }}</span></dd>
            <dt>Approver</dt><dd>{{ a.approver }}</dd>
          </dl>
          <h4>Team members off at the same time</h4>
          <ul class="overlap">
            @for (o of overlap(a); track o.id) {<li><span class="dot-sm" [style.background]="tcolor(o.type)"></span>{{ o.name }} · {{ o.type }} · {{ short(o.from) }}–{{ short(o.to) }}</li>} @empty {<li class="muted">No overlap in {{ a.dept }}</li>}
          </ul>
          @if (a.status === 'Pending') {
            <div class="toolbar"><button class="btn-primary" (click)="decide([a.id], 'Approved')">Approve</button><button class="btn-ghost danger" (click)="decide([a.id], 'Rejected')">Reject</button></div>
          } @else if (a.status === 'Approved' && a.from > today) {
            <button class="btn-ghost" (click)="decide([a.id], 'Cancelled')">Cancel leave</button>
          }
        </aside>
      }
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); apply()">
        <div class="modal-head"><h3>Apply Leave</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee<input class="input" list="la-emps" required [value]="fEmp()" (change)="fEmp.set($any($event.target).value)" placeholder="Type name or ID" /><datalist id="la-emps">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist></label>
          <label>Leave type<select class="select" [value]="fType()" (change)="fType.set($any($event.target).value)">@for (t of leaveTypes; track t.code) {<option [value]="t.code">{{ t.name }}</option>}</select></label>
          <label>Reason<input class="input" required [value]="fReason()" (input)="fReason.set($any($event.target).value)" /></label>
          <label>From<input class="input" type="date" required [value]="fFrom()" (change)="fFrom.set($any($event.target).value)" /></label>
          <label>To<input class="input" type="date" required [value]="fTo()" (change)="fTo.set($any($event.target).value)" /></label>
        </div>
        <div class="calc">
          <span>Working days: <b>{{ fDays() }}</b> (weekends &amp; holidays excluded)</span>
          @if (fBal() !== null) {<span>Balance: <b>{{ fBal() }}</b> → <b [class.bad]="fBal()! - fDays() < 0">{{ fBal()! - fDays() }}</b></span>}
        </div>
        @if (fErr()) {<p class="bad">{{ fErr() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Submit</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .la { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .la.with-detail { grid-template-columns: minmax(0, 1fr) 360px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .who { display: flex; gap: 10px; align-items: center; } .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .lt { display: flex; flex-direction: column; gap: 3px; padding: 10px; border: 1px solid; border-radius: 8px; font-size: 12.5px; } .lt small { color: var(--kf-4b4f6b); }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 7px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 4px 0 0; font-size: 13px; } .overlap { list-style: none; margin: 0; padding: 0; font-size: 12px; } .overlap li { padding: 4px 0; }
    .calc { display: flex; justify-content: space-between; margin-top: 12px; padding: 10px; border-radius: 8px; background: var(--kb-f5f3ff); font-size: 12.5px; }
    .danger { color: var(--red); }
    @media (max-width: 1100px) { .la.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class LeaveApplications {
  protected readonly leaveTypes = LEAVE_TYPES.filter((t) => t.status === 'Active');
  protected readonly pick = BALANCES.slice(0, 300);
  protected readonly short = short;
  protected readonly today = iso(0);
  protected readonly list = signal<LeaveApp[]>(APPLICATIONS);
  protected readonly selId = signal<string | null>(APPLICATIONS[0].id);
  protected readonly form = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'type', label: 'Type', kind: 'tag', tag: () => 'tag' },
    { key: 'from', label: 'From', fmt: short },
    { key: 'to', label: 'To', fmt: short },
    { key: 'days', label: 'Days', kind: 'num' },
    { key: 'reason', label: 'Reason' },
    { key: 'applied', label: 'Applied', fmt: short },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
    { key: 'type', label: 'Type', options: LEAVE_TYPES.map((t) => t.code) },
    { key: 'dept', label: 'Department', options: DEPTS },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
    { id: 'Cancelled', label: 'Cancel', icon: 'calendar-x', when: (r) => r.status === 'Approved' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Approved', label: 'Approve' }, { id: 'Rejected', label: 'Reject', danger: true }];
  protected readonly sel = computed(() => this.list().find((a) => a.id === this.selId()) ?? null);
  protected readonly onLeaveToday = computed(() => String(420 + this.list().filter((a) => a.status === 'Approved' && a.from <= this.today && a.to >= this.today).length));

  // form state
  protected readonly fEmp = signal('');
  protected readonly fType = signal('AL');
  protected readonly fFrom = signal(iso(7));
  protected readonly fTo = signal(iso(9));
  protected readonly fReason = signal('');
  protected readonly fErr = signal('');
  protected readonly fDays = computed(() => workingDays(this.fFrom(), this.fTo()));
  protected readonly fBal = computed(() => {
    const b = BALANCES.find((x) => x.id === this.fEmp().split(' · ')[0]);
    if (!b) return null;
    return this.fType() === 'AL' ? b.alLeft : this.fType() === 'SL' ? b.slLeft : this.fType() === 'CL' ? b.clLeft : typeByCode(this.fType()).days;
  });

  protected count(s: string) {
    return this.list().filter((a) => a.status === s).length;
  }
  protected tag(s: string) {
    return s === 'Approved' ? 'tag green' : s === 'Pending' ? 'tag amber' : s === 'Rejected' ? 'tag red' : 'tag grey';
  }
  protected tcolor(c: string) {
    return typeByCode(c)?.color ?? 'var(--ka-7c3aed)';
  }
  protected tname(c: string) {
    return typeByCode(c)?.name ?? c;
  }
  protected balanceOf(a: LeaveApp) {
    const b = BALANCES.find((x) => x.id === a.empId);
    if (!b) return typeByCode(a.type).days;
    return a.type === 'AL' ? b.alLeft : a.type === 'SL' ? b.slLeft : a.type === 'CL' ? b.clLeft : typeByCode(a.type).days;
  }
  protected overlap(a: LeaveApp) {
    return this.list().filter((o) => o.id !== a.id && o.dept === a.dept && o.status !== 'Rejected' && o.status !== 'Cancelled' && o.from <= a.to && o.to >= a.from).slice(0, 5);
  }
  protected decide(ids: string[], action: string) {
    const status = action as LeaveApp['status'];
    const set = new Set(ids);
    this.list.update((l) => l.map((a) => (set.has(a.id) ? { ...a, status, approver: status === 'Cancelled' ? a.approver : 'Demo login' } : a)));
    this.notify(`${ids.length} application(s) ${status.toLowerCase()}`);
  }
  protected openForm() {
    this.fErr.set('');
    this.fReason.set('');
    this.form.set(true);
  }
  protected apply() {
    const b = BALANCES.find((x) => x.id === this.fEmp().split(' · ')[0]);
    if (!b) return this.fErr.set('Pick an employee from the list.');
    if (!this.fDays()) return this.fErr.set('Selected dates contain no working days.');
    const bal = this.fBal() ?? 0;
    if (this.fType() !== 'UL' && bal - this.fDays() < -5) return this.fErr.set(`Insufficient balance (${bal} days left, max −5 allowed).`);
    const id = `LV-${30000 + this.list().length}`;
    this.list.update((l) => [{ id, empId: b.id, name: b.name, initials: b.initials, avatar: b.avatar, dept: b.dept, type: this.fType(), from: this.fFrom(), to: this.fTo(), days: this.fDays(), reason: this.fReason(), applied: this.today, status: 'Pending', approver: 'Line Manager', step: 1 }, ...l]);
    this.selId.set(id);
    this.form.set(false);
    this.notify(`${id} submitted to ${b.name}'s manager`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Approval Workflows ======================= */
interface WfStep {
  role: string;
  sla: number;
  escalate: string;
}
interface Workflow {
  id: number;
  name: string;
  condition: string;
  types: string[];
  minDays: number;
  steps: WfStep[];
  autoApprove: number;
  active: boolean;
  used: number;
}
const ROLES = ['Line Manager', 'Department Head', 'HR Business Partner', 'HR Director', 'Finance Controller', 'Site Manager', 'CEO'];

@Component({
  selector: 'app-approval-workflows',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Approval Workflows" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Who approves which leave, in what order, with SLAs and escalation.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />New Workflow</button>
    </app-page-head>
    <section class="wf">
      <aside class="card wl">
        @for (w of list(); track w.id) {
          <button class="wi" [class.on]="selId() === w.id" (click)="selId.set(w.id)">
            <div><b>{{ w.name }}</b><small>{{ w.condition }}</small></div>
            <span [class]="w.active ? 'tag green' : 'tag grey'">{{ w.active ? 'Active' : 'Off' }}</span>
            <small class="meta">{{ w.steps.length }} step(s) · used {{ w.used }} times this month</small>
          </button>
        }
      </aside>
      @if (sel(); as w) {
        <div class="card">
          <div class="card-head">
            <input class="input title" [value]="w.name" (change)="patch({ name: $any($event.target).value })" />
            <label class="sw"><input type="checkbox" [checked]="w.active" (change)="patch({ active: !w.active })" /> Active</label>
          </div>
          <div class="form-grid">
            <label>Applies when leave is at least (days)<input class="input" type="number" min="0" [value]="w.minDays" (change)="patch({ minDays: +$any($event.target).value })" /></label>
            <label>Auto-approve if ≤ (days, 0 = never)<input class="input" type="number" min="0" [value]="w.autoApprove" (change)="patch({ autoApprove: +$any($event.target).value })" /></label>
          </div>
          <p class="lbl">Leave types</p>
          <div class="chips">@for (t of types; track t.code) {<button class="chip-btn" [class.on]="w.types.includes(t.code)" (click)="toggleType(t.code)">{{ t.code }}</button>}</div>
          <p class="lbl">Approval chain</p>
          <div class="chain">
            <div class="node start">Employee</div>
            @for (s of w.steps; track $index; let i = $index) {
              <span class="arr">→</span>
              <div class="node">
                <select class="select" [value]="s.role" (change)="setStep(i, { role: $any($event.target).value })">@for (r of roles; track r) {<option>{{ r }}</option>}</select>
                <label>SLA <input class="input n" type="number" [value]="s.sla" (change)="setStep(i, { sla: +$any($event.target).value })" /> h</label>
                <label>Escalate to <select class="select" [value]="s.escalate" (change)="setStep(i, { escalate: $any($event.target).value })">@for (r of roles; track r) {<option>{{ r }}</option>}</select></label>
                <button class="link danger" (click)="removeStep(i)" [disabled]="w.steps.length === 1">Remove</button>
              </div>
            }
            <span class="arr">→</span>
            <button class="node add" (click)="addStep()">+ Add step</button>
            <span class="arr">→</span>
            <div class="node end">Approved</div>
          </div>

          <div class="sim">
            <h4>Test this workflow</h4>
            <div class="toolbar">
              <select class="select" [value]="simType()" (change)="simType.set($any($event.target).value)">@for (t of types; track t.code) {<option [value]="t.code">{{ t.name }}</option>}</select>
              <label>Days <input class="input n" type="number" min="0.5" step="0.5" [value]="simDays()" (input)="simDays.set(+$any($event.target).value)" /></label>
            </div>
            <p class="route">{{ route() }}</p>
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    .wf { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; align-items: start; }
    .wl { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
    .wi { display: grid; grid-template-columns: 1fr auto; gap: 4px; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .wi div { display: flex; flex-direction: column; } .wi small { color: var(--muted); } .wi .meta { grid-column: 1 / -1; }
    .wi:hover { background: var(--kb-faf8ff); } .wi.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    .title { font-size: 16px; font-weight: 600; flex: 1; } .sw { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .lbl { font-size: 12px; color: var(--kf-4b4f6b); margin: 14px 0 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--kb-ffffff); font-size: 12px; cursor: pointer; } .chip-btn.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .chain { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .node { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); font-size: 12px; min-width: 170px; }
    .node label { display: flex; align-items: center; gap: 4px; } .node .select { padding: 5px 24px 5px 8px; font-size: 12px; }
    .node.start, .node.end { min-width: auto; background: var(--kb-f5f3ff); color: var(--primary); font-weight: 600; } .node.end { background: var(--kb-dcfce7); color: var(--kf-15803d); }
    .node.add { min-width: auto; border-style: dashed; color: var(--primary); cursor: pointer; }
    .arr { color: var(--primary); font-size: 18px; }
    .n { width: 60px; padding: 4px 6px; } .danger { color: var(--red); }
    .sim { margin-top: 18px; padding: 12px; border-radius: 10px; background: var(--kb-fafafe); border: 1px solid var(--border); } .sim h4 { margin: 0 0 8px; font-size: 13px; }
    .sim label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; } .route { margin: 10px 0 0; font-size: 13px; font-weight: 600; color: var(--primary); }
    @media (max-width: 1000px) { .wf { grid-template-columns: 1fr; } }
  `,
})
export class ApprovalWorkflows {
  protected readonly roles = ROLES;
  protected readonly types = LEAVE_TYPES;
  protected readonly list = signal<Workflow[]>([
    { id: 1, name: 'Standard leave', condition: 'AL / CL / SL up to 5 days', types: ['AL', 'CL', 'SL'], minDays: 0, steps: [{ role: 'Line Manager', sla: 24, escalate: 'Department Head' }], autoApprove: 1, active: true, used: 642 },
    { id: 2, name: 'Long leave', condition: 'Annual leave over 5 days', types: ['AL'], minDays: 6, steps: [{ role: 'Line Manager', sla: 24, escalate: 'Department Head' }, { role: 'Department Head', sla: 48, escalate: 'HR Director' }], autoApprove: 0, active: true, used: 118 },
    { id: 3, name: 'Statutory leave', condition: 'Maternity, paternity, Hajj', types: ['ML', 'PL', 'HJ'], minDays: 0, steps: [{ role: 'Line Manager', sla: 24, escalate: 'HR Business Partner' }, { role: 'HR Business Partner', sla: 48, escalate: 'HR Director' }], autoApprove: 0, active: true, used: 37 },
    { id: 4, name: 'Unpaid leave', condition: 'Any unpaid leave', types: ['UL'], minDays: 0, steps: [{ role: 'Line Manager', sla: 24, escalate: 'Department Head' }, { role: 'HR Business Partner', sla: 48, escalate: 'HR Director' }, { role: 'Finance Controller', sla: 48, escalate: 'CEO' }], autoApprove: 0, active: true, used: 9 },
    { id: 5, name: 'Compassionate & bereavement', condition: 'Instant approval, HR notified', types: ['CP', 'BR'], minDays: 0, steps: [{ role: 'HR Business Partner', sla: 4, escalate: 'HR Director' }], autoApprove: 5, active: true, used: 21 },
  ]);
  protected readonly selId = signal(2);
  protected readonly simType = signal('AL');
  protected readonly simDays = signal(8);
  protected readonly sel = computed(() => this.list().find((w) => w.id === this.selId()) ?? null);
  /** Picks the most specific active workflow for the simulated request. */
  protected readonly route = computed(() => {
    const matches = this.list().filter((w) => w.active && w.types.includes(this.simType()) && this.simDays() >= w.minDays).sort((a, b) => b.minDays - a.minDays);
    const w = matches[0];
    if (!w) return 'No workflow matches — request goes to HR Business Partner by default.';
    if (w.autoApprove && this.simDays() <= w.autoApprove) return `“${w.name}” → auto-approved instantly`;
    return `“${w.name}” → ${w.steps.map((s) => `${s.role} (${s.sla} h)`).join(' → ')} → Approved`;
  });

  protected patch(c: Partial<Workflow>) {
    const id = this.selId();
    this.list.update((l) => l.map((w) => (w.id === id ? { ...w, ...c } : w)));
  }
  protected toggleType(code: string) {
    const t = this.sel()!.types;
    this.patch({ types: t.includes(code) ? t.filter((x) => x !== code) : [...t, code] });
  }
  protected setStep(i: number, c: Partial<WfStep>) {
    this.patch({ steps: this.sel()!.steps.map((s, j) => (j === i ? { ...s, ...c } : s)) });
  }
  protected addStep() {
    this.patch({ steps: [...this.sel()!.steps, { role: 'HR Business Partner', sla: 48, escalate: 'HR Director' }] });
  }
  protected removeStep(i: number) {
    this.patch({ steps: this.sel()!.steps.filter((_, j) => j !== i) });
  }
  protected add() {
    const id = Math.max(...this.list().map((w) => w.id)) + 1;
    this.list.update((l) => [...l, { id, name: 'New workflow', condition: 'Custom', types: ['AL'], minDays: 0, steps: [{ role: 'Line Manager', sla: 24, escalate: 'Department Head' }], autoApprove: 0, active: false, used: 0 }]);
    this.selId.set(id);
  }
}
