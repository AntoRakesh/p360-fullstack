import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, rng, series } from '../dashboards/demo-data';
import { DEPTS } from '../people/people.data';
import { RECORDS } from '../attendance/attendance.data';
import { APPLICATIONS, BALANCES, LEAVE_TYPES, typeByCode } from './leave.data';

const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const short = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ======================= Unplanned Absence Tracking ======================= */
interface Unplanned {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  site: string;
  reason: string;
  notified: string;
  spells: number;
  days: number;
  bradford: number;
  status: string;
}
const REASONS = ['Not yet reported', 'Sick call-in', 'Family emergency', 'Transport issue', 'No show'];
const UNPLANNED: Unplanned[] = (() => {
  const r = rng(1313);
  return RECORDS.filter((x) => x.status === 'Absent').map((x, i) => {
    const spells = 1 + Math.floor(r() * r() * 7);
    const days = spells + Math.floor(r() * 8);
    const reason = REASONS[Math.floor(r() * REASONS.length)];
    return {
      id: `UA-${8800 + i}`, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept, site: x.site, reason,
      notified: reason === 'Not yet reported' || reason === 'No show' ? 'No' : `${7 + Math.floor(r() * 3)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
      spells, days, bradford: spells * spells * days, status: 'Open',
    };
  });
})();

@Component({
  selector: 'app-unplanned-absence',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Unplanned Absence Tracking" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Today’s unplanned absences, reasons, patterns and Bradford scores." />
    <section class="kpi-row">
      <app-kpi label="Unplanned Today" [value]="rows().length" icon="calendar-x" color="var(--ka-ef4444)" sub="no approved leave" />
      <app-kpi label="Not Reported" [value]="notReported()" icon="bell" color="var(--ka-f97316)" sub="need follow-up" />
      <app-kpi label="Absence Rate" value="3.7%" icon="activity" color="var(--ka-8b5cf6)" change="0.3%" [up]="false" />
      <app-kpi label="Bradford ≥ 250" [value]="highRisk()" icon="triangle-alert" color="var(--ka-dc2626)" sub="review triggered" />
      <app-kpi label="Monday / Friday Share" value="46%" icon="calendar-days" color="var(--ka-3b82f6)" sub="of unplanned days" />
    </section>
    <section class="dash">
      <div class="card span-6">
        <div class="card-head"><h3>Unplanned Absence by Weekday</h3><span class="muted">last 12 weeks</span></div>
        <app-column-chart [labels]="['Mon', 'Tue', 'Wed', 'Thu', 'Fri']" [series]="weekday" [height]="200" [legend]="false" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>By Department (today)</h3></div>
        <app-bar-list [rows]="byDept()" [max]="byDept()[0]?.value || 1" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="rows()" [columns]="cols" noun="absences" [selectable]="true" [searchKeys]="['name', 'empId']" searchPlaceholder="Search employee..."
          [filters]="filters" [actions]="actions" [bulkActions]="bulk" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
      </div>
    </section>
    @if (reasonFor(); as ids) {
      <div class="g-overlay" (click)="reasonFor.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Record reason ({{ ids.length }})</h3><button class="close-btn" (click)="reasonFor.set(null)">×</button></div>
        <div class="form-grid"><label class="full">Reason<select #rs class="select">@for (r of reasons.slice(1); track r) {<option>{{ r }}</option>}</select></label></div>
        <div class="form-actions"><button class="btn-ghost" (click)="reasonFor.set(null)">Cancel</button><button class="btn-primary" (click)="setReason(ids, rs.value)">Save</button></div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class UnplannedAbsence {
  private readonly state = inject(AppState);
  protected readonly reasons = REASONS;
  protected readonly weekday = [{ name: 'Days', color: 'var(--ka-ef4444)', values: [412, 248, 231, 262, 389] }];
  protected readonly list = signal<Unplanned[]>(UNPLANNED);
  protected readonly reasonFor = signal<string[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'dept', label: 'Department' },
    { key: 'reason', label: 'Reason', kind: 'tag', tag: (r) => (r.reason === 'No show' || r.reason === 'Not yet reported' ? 'tag red' : 'tag amber') },
    { key: 'notified', label: 'Called in at' },
    { key: 'spells', label: 'Spells (12 m)', kind: 'num' },
    { key: 'days', label: 'Days (12 m)', kind: 'num' },
    { key: 'bradford', label: 'Bradford', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'reason', label: 'Reason', options: REASONS }, { key: 'dept', label: 'Department', options: DEPTS }, { key: 'status', label: 'Status', options: ['Open', 'Converted', 'Excused', 'Warning issued'] }];
  protected readonly actions: RowAction[] = [
    { id: 'reason', label: 'Record reason', icon: 'message' },
    { id: 'sick', label: 'Convert to sick leave', icon: 'shield-plus', when: (r) => r.status === 'Open' },
    { id: 'excuse', label: 'Mark excused', icon: 'shield-check', when: (r) => r.status === 'Open' },
    { id: 'warn', label: 'Issue absence warning', icon: 'triangle-alert', danger: true, when: (r) => r.bradford >= 250 },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'reason', label: 'Record reason' }, { id: 'sick', label: 'Convert to sick leave' }];
  protected readonly rows = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((u) => u.site === s.name);
  });
  protected readonly notReported = computed(() => this.rows().filter((u) => u.notified === 'No').length);
  protected readonly highRisk = computed(() => this.rows().filter((u) => u.bradford >= 250).length);
  protected readonly byDept = computed(() => {
    const m = new Map<string, number>();
    this.rows().forEach((u) => m.set(u.dept, (m.get(u.dept) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, display: String(value), color: 'var(--ka-ef4444)' }));
  });

  protected act(a: string, ids: string[]) {
    if (a === 'reason') return this.reasonFor.set(ids);
    const status = { sick: 'Converted', excuse: 'Excused', warn: 'Warning issued' }[a]!;
    const set = new Set(ids);
    this.list.update((l) => l.map((u) => (set.has(u.id) ? { ...u, status, reason: a === 'sick' ? 'Sick call-in' : u.reason } : u)));
    this.notify(`${ids.length} absence(s) → ${status}`);
  }
  protected setReason(ids: string[], reason: string) {
    const set = new Set(ids);
    this.list.update((l) => l.map((u) => (set.has(u.id) ? { ...u, reason, notified: u.notified === 'No' ? 'Late' : u.notified } : u)));
    this.reasonFor.set(null);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Return-to-Work Tracking ======================= */
const RTW_TASKS = ['Fit-to-work certificate received', 'Return-to-work interview held', 'Workplace adjustments agreed', 'Access & credentials re-activated', 'Manager sign-off'];
interface Rtw {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  reason: string;
  awayDays: number;
  expected: string;
  plan: string;
  done: boolean[];
  status: string;
}
const RTWS: Rtw[] = (() => {
  const r = rng(919);
  const reasons = ['Sick Leave (long-term)', 'Maternity Leave', 'Surgery recovery', 'Work injury', 'Unpaid Leave', 'Sick Leave'];
  return RECORDS.filter((x) => x.status === 'On Leave').slice(0, 26).map((x, i) => {
    const reason = reasons[i % reasons.length];
    const exp = Math.floor(r() * 24) - 6;
    const done = RTW_TASKS.map((_, k) => (exp < 0 ? k < 3 + (i % 3) : r() < 0.25));
    return {
      id: `RTW-${300 + i}`, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept, reason,
      awayDays: reason.startsWith('Maternity') ? 90 : 5 + Math.floor(r() * 40), expected: iso(exp),
      plan: reason.includes('Surgery') || reason.includes('injury') ? 'Phased: 50% → 75% → 100% over 3 weeks' : reason.startsWith('Maternity') ? 'Flexible hours for 4 weeks' : 'Full return',
      done, status: done.every(Boolean) ? 'Completed' : exp < 0 ? 'Overdue' : exp <= 3 ? 'Due' : 'Scheduled',
    };
  });
})();

@Component({
  selector: 'app-return-to-work',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Return-to-Work Tracking" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Safe, documented returns after sickness, injury, maternity and long leave." />
    <section class="kpi-row">
      <app-kpi label="Returning in 7 days" [value]="cnt('Due') + cnt('Scheduled')" icon="calendar-days" color="var(--ka-8b5cf6)" />
      <app-kpi label="Overdue Steps" [value]="cnt('Overdue')" icon="triangle-alert" color="var(--ka-ef4444)" sub="back but checklist open" />
      <app-kpi label="Phased Returns" [value]="phased()" icon="trending-up" color="var(--ka-3b82f6)" />
      <app-kpi label="Completed (30 days)" [value]="cnt('Completed') + 14" icon="shield-check" color="var(--ka-22c55e)" />
    </section>
    <section class="rtw" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" noun="cases" [searchKeys]="['name', 'empId', 'reason']" [filters]="filters" [activeId]="selId()" (rowClick)="selId.set($event.id)" />
      </div>
      @if (sel(); as c) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ c.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <p class="muted">{{ c.reason }} · {{ c.awayDays }} days away · return {{ short(c.expected) }}</p>
          <span [class]="tag(c.status)">{{ c.status }}</span>
          <label class="plan">Return plan<input class="input" [value]="c.plan" (change)="patch(c.id, { plan: $any($event.target).value })" /></label>
          <div class="prog"><i [style.width.%]="pct(c)"></i></div>
          <ul class="tasks">
            @for (t of tasks; track t; let i = $index) {
              <li [class.done]="c.done[i]"><label><input type="checkbox" [checked]="c.done[i]" (change)="toggle(c, i)" />{{ t }}</label></li>
            }
          </ul>
          @if (pct(c) === 100 && c.status !== 'Completed') {
            <button class="btn-primary" (click)="complete(c)">Close case</button>
          }
        </aside>
      }
    </section>
  `,
  styles: `
    .rtw { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .rtw.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; } .detail p { margin: 0; } .detail > .tag { align-self: flex-start; }
    .plan { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); }
    .prog { height: 8px; border-radius: 4px; background: var(--kb-eef0f6); overflow: hidden; } .prog i { display: block; height: 100%; background: var(--primary); transition: width .3s; }
    .tasks { list-style: none; margin: 0; padding: 0; font-size: 13px; } .tasks li { padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .tasks label { display: flex; gap: 8px; align-items: center; cursor: pointer; } .tasks li.done { color: var(--muted); text-decoration: line-through; } .tasks input { accent-color: var(--primary); }
    @media (max-width: 1100px) { .rtw.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class ReturnToWork {
  protected readonly tasks = RTW_TASKS;
  protected readonly short = short;
  protected readonly list = signal<Rtw[]>(RTWS);
  protected readonly selId = signal<string | null>(RTWS.find((r) => r.status === 'Overdue')?.id ?? RTWS[0].id);
  protected readonly sel = computed(() => this.list().find((r) => r.id === this.selId()) ?? null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'reason', label: 'Absence' },
    { key: 'awayDays', label: 'Days away', kind: 'num' },
    { key: 'expected', label: 'Return date', fmt: short },
    { key: 'plan', label: 'Plan' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Scheduled', 'Due', 'Overdue', 'Completed'] }];
  protected readonly phased = computed(() => this.list().filter((r) => r.plan.startsWith('Phased')).length);

  protected cnt(s: string) {
    return this.list().filter((r) => r.status === s).length;
  }
  protected tag(s: string) {
    return s === 'Completed' ? 'tag green' : s === 'Overdue' ? 'tag red' : s === 'Due' ? 'tag amber' : 'tag blue';
  }
  protected pct(c: Rtw) {
    return Math.round((c.done.filter(Boolean).length / c.done.length) * 100);
  }
  protected patch(id: string, c: Partial<Rtw>) {
    this.list.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r)));
  }
  protected toggle(c: Rtw, i: number) {
    this.patch(c.id, { done: c.done.map((d, j) => (j === i ? !d : d)) });
  }
  protected complete(c: Rtw) {
    this.patch(c.id, { status: 'Completed' });
  }
}

/* ======================= Leave Reports & Analytics ======================= */
const REPORTS = [
  { id: 'taken', name: 'Leave Taken by Type', desc: 'Days taken per leave type and department' },
  { id: 'balance', name: 'Leave Balance Statement', desc: 'Entitled, used and remaining per employee' },
  { id: 'liability', name: 'Leave Liability', desc: 'Value of unused annual leave by department' },
  { id: 'pending', name: 'Pending Approvals', desc: 'Applications waiting with approvers' },
];

@Component({
  selector: 'app-leave-reports',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Reports &amp; Analytics" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Trends, utilization and liability across leave types and departments." />
    <section class="kpi-row">
      <app-kpi label="Leave Days Taken (YTD)" value="68,412" icon="calendar-x" color="var(--ka-8b5cf6)" change="4%" />
      <app-kpi label="Avg. Utilization" value="62.4%" icon="activity" color="var(--ka-22c55e)" change="5%" [up]="false" sub="vs. last year" />
      <app-kpi label="Absence Rate" value="3.7%" icon="trending-up" color="var(--ka-ef4444)" change="0.3%" [up]="false" />
      <app-kpi label="Leave Liability" value="AED 61.2M" icon="briefcase" color="var(--ka-3b82f6)" sub="unused annual leave" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Leave Days Taken by Month</h3></div>
        <app-column-chart [labels]="months" [series]="byMonth" [stacked]="true" [height]="230" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Mix by Type (YTD)</h3></div>
        <app-donut [segments]="mix" center="Days" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Annual Leave Utilization by Department</h3></div>
        <app-bar-list [rows]="utilByDept" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Absence Rate Trend</h3></div>
        <app-line-chart [labels]="weeks" [series]="absence" [height]="200" [min]="0" [max]="8" suffix="%" />
      </div>
    </section>
    <h3 class="sec">Reports</h3>
    <section class="lib">
      @for (r of reports; track r.id) {
        <div class="card rep" [class.on]="active() === r.id">
          <div><b>{{ r.name }}</b><small>{{ r.desc }}</small></div>
          <div class="toolbar"><button class="btn-primary btn-sm" (click)="active.set(r.id)">Run</button><button class="btn-ghost sm" (click)="exportReport(r.id)">Export CSV</button></div>
        </div>
      }
    </section>
    @if (active()) {
      <div class="card">
        <div class="card-head"><h3>{{ activeName() }}</h3><button class="close-btn" (click)="active.set(null)">×</button></div>
        <app-data-table [rows]="rows()" [columns]="cols()" [idKey]="active() === 'balance' ? 'id' : active() === 'pending' ? 'id' : 'name'" noun="rows" [searchKeys]="['name']" />
      </div>
    }
  `,
  styles: `
    .sec { margin: 4px 0 10px; }
    .lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .rep { display: flex; flex-direction: column; gap: 10px; } .rep div:first-child { display: flex; flex-direction: column; font-size: 13px; } .rep small { color: var(--muted); }
    .rep.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
  `,
})
export class LeaveReports {
  protected readonly reports = REPORTS;
  protected readonly months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  protected readonly weeks = Array.from({ length: 12 }, (_, i) => `W${34 + i}`);
  protected readonly absence = [{ name: 'Absence %', color: 'var(--ka-ef4444)', values: series(12, 3.7, 0.8, 5), area: true }];
  protected readonly byMonth = ['AL', 'SL', 'CL'].map((c, i) => ({ name: typeByCode(c).name, color: typeByCode(c).color, values: series(12, [4200, 1100, 650][i], [1500, 400, 200][i], i * 3 + 1).map((v, m) => Math.round(c === 'AL' && (m === 1 || m === 7 || m === 8) ? v * 1.6 : v)) }));
  protected readonly mix = LEAVE_TYPES.filter((t) => t.days).slice(0, 7).map((t) => ({ label: t.name, value: Math.round(t.utilization * (t.days || 5) * 30), color: t.color }));
  protected readonly utilByDept = DEPTS.filter((d) => d !== '—').map((d, i) => {
    const v = [58, 61, 66, 52, 70, 64, 49, 63, 57, 68, 55][i];
    return { label: d, value: v, display: `${v}%`, color: v < 55 ? 'var(--ka-f59e0b)' : 'var(--ka-16a34a)' };
  });
  protected readonly active = signal<string | null>('taken');
  protected readonly activeName = computed(() => REPORTS.find((r) => r.id === this.active())?.name ?? '');
  protected readonly rows = computed<any[]>(() => {
    switch (this.active()) {
      case 'taken':
        return DEPTS.filter((d) => d !== '—').map((d) => {
          const apps = APPLICATIONS.filter((a) => a.dept === d && a.status === 'Approved');
          const row: Record<string, unknown> = { name: d };
          ['AL', 'SL', 'CL'].forEach((c) => (row[c] = apps.filter((a) => a.type === c).reduce((s, a) => s + a.days, 0) * 40));
          row['total'] = (row['AL'] as number) + (row['SL'] as number) + (row['CL'] as number);
          return row;
        });
      case 'balance':
        return BALANCES;
      case 'liability':
        return DEPTS.filter((d) => d !== '—').map((d) => {
          const b = BALANCES.filter((x) => x.dept === d);
          const days = b.reduce((s, x) => s + Math.max(0, x.alLeft), 0);
          return { name: d, people: b.length, days: Math.round(days), value: Math.round(days * 420) };
        });
      default:
        return APPLICATIONS.filter((a) => a.status === 'Pending');
    }
  });
  protected readonly cols = computed<Col[]>(() => {
    switch (this.active()) {
      case 'taken':
        return [{ key: 'name', label: 'Department' }, { key: 'AL', label: 'Annual (days)', kind: 'num' }, { key: 'SL', label: 'Sick (days)', kind: 'num' }, { key: 'CL', label: 'Casual (days)', kind: 'num' }, { key: 'total', label: 'Total', kind: 'num' }];
      case 'balance':
        return [{ key: 'name', label: 'Employee', kind: 'person', sub: 'id' }, { key: 'dept', label: 'Department' }, { key: 'al', label: 'AL entitled', kind: 'num' }, { key: 'alUsed', label: 'AL used', kind: 'num' }, { key: 'alLeft', label: 'AL left', kind: 'num' }, { key: 'slLeft', label: 'SL left', kind: 'num' }];
      case 'liability':
        return [{ key: 'name', label: 'Department' }, { key: 'people', label: 'Employees', kind: 'num' }, { key: 'days', label: 'Unused AL days', kind: 'num' }, { key: 'value', label: 'Liability (AED)', kind: 'num' }];
      default:
        return [{ key: 'name', label: 'Employee', kind: 'person', sub: 'empId' }, { key: 'type', label: 'Type' }, { key: 'from', label: 'From', fmt: short }, { key: 'days', label: 'Days', kind: 'num' }, { key: 'approver', label: 'Waiting on' }];
    }
  });
  protected exportReport(id: string) {
    this.active.set(id);
    const cols = this.cols();
    downloadCsv(`leave-${id}.csv`, [cols.map((c) => c.label), ...this.rows().map((r) => cols.map((c) => String(r[c.key] ?? '')))]);
  }
}
