import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, rng } from '../dashboards/demo-data';
import { DEPTS, SITES } from '../people/people.data';
import { ampm, AttRecord, hhmm, METHODS, RECORDS, toMinutes } from './attendance.data';

/* ======================= Attendance Transactions ======================= */
type Dir = 'IN' | 'OUT' | 'BREAK OUT' | 'BREAK IN';
interface Txn {
  id: string;
  time: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  site: string;
  dir: Dir;
  method: string;
  device: string;
  location: string;
  verify: string;
}
const DEVICES = ['FR-HO-01', 'FR-HO-02', 'CR-MF-03', 'FR-WH-01', 'MOB-APP', 'FP-RO-01', 'FR-TC-01'];
const TXNS: Txn[] = (() => {
  const r = rng(999);
  const out: Txn[] = [];
  let n = 0;
  const push = (rec: AttRecord, min: number, dir: Dir, verify = 'Verified') =>
    out.push({
      id: `TXN-${String(500000 + n++)}`, time: hhmm(min) + ':' + String(Math.floor(r() * 60)).padStart(2, '0'),
      name: rec.name, initials: rec.initials, avatar: rec.avatar, empId: rec.id, dept: rec.dept, site: rec.site, dir,
      method: rec.method, device: rec.method === 'Mobile' ? 'MOB-APP' : DEVICES[Math.floor(r() * DEVICES.length)], location: rec.location, verify,
    });
  for (const rec of RECORDS) {
    if (!rec.checkIn) {
      if (rec.status === 'Absent' && r() < 0.05) push(rec, 520 + Math.floor(r() * 60), 'IN', 'Rejected');
      continue;
    }
    const inM = toMinutes(rec.checkIn);
    push(rec, inM, 'IN', r() < 0.012 ? 'Manual' : 'Verified');
    if (r() < 0.3) {
      const b = inM + 150 + Math.floor(r() * 90);
      push(rec, b, 'BREAK OUT');
      push(rec, b + 15 + Math.floor(r() * 40), 'BREAK IN');
    }
    if (rec.checkOut) push(rec, toMinutes(rec.checkOut) + 1440, 'OUT');
  }
  return out.sort((a, b) => (a.time < b.time ? 1 : -1));
})();

@Component({
  selector: 'app-att-transactions',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Attendance Transactions" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Every punch captured today from face readers, cards, fingerprints and the mobile app.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="manual.set(true)"><app-icon name="plus" [size]="16" />Add Manual Punch</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Punches Today" [value]="list().length.toLocaleString()" icon="fingerprint" color="#8b5cf6" change="3%" />
      <app-kpi label="Face Recognition" [value]="share('Face')" icon="user-check" color="#22c55e" sub="of punches" />
      <app-kpi label="Manual Entries" [value]="verifyCount('Manual')" icon="sliders" color="#f59e0b" sub="need approval" />
      <app-kpi label="Rejected" [value]="verifyCount('Rejected')" icon="ban" color="#ef4444" sub="no match / invalid" />
      <app-kpi label="Devices Online" value="46 / 47" icon="cpu" color="#3b82f6" sub="1 reader offline" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Punches by Hour</h3></div>
        <app-column-chart [labels]="hours" [series]="byHour()" [stacked]="true" [height]="210" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Capture Method</h3></div>
        <app-donut [segments]="byMethod()" center="Punches" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="transactions" [pageSize]="15" [searchKeys]="['name', 'empId', 'id', 'device']" searchPlaceholder="Search name, employee ID, transaction, device..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
      </div>
    </section>

    @if (manual()) {
      <div class="g-overlay" (click)="manual.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); addManual(p.value, t.value, d.value, why.value)">
        <div class="modal-head"><h3>Add Manual Punch</h3><button type="button" class="close-btn" (click)="manual.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee
            <input #p class="input" list="txn-emps" placeholder="Type name or ID" required />
            <datalist id="txn-emps">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist>
          </label>
          <label>Time<input #t class="input" type="time" [value]="nowTime" required /></label>
          <label>Direction<select #d class="select"><option>IN</option><option>OUT</option><option>BREAK OUT</option><option>BREAK IN</option></select></label>
          <label class="full">Reason<input #why class="input" placeholder="e.g. Forgot access card" required /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="manual.set(false)">Cancel</button><button class="btn-primary" type="submit">Add punch</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class AttendanceTransactions {
  private readonly state = inject(AppState);
  protected readonly hours = ['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  protected readonly pick = RECORDS.slice(0, 300);
  protected readonly nowTime = hhmm(new Date().getHours() * 60 + new Date().getMinutes());
  protected readonly all = signal<Txn[]>(TXNS);
  protected readonly manual = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'dir', label: 'Direction', kind: 'tag', tag: (r) => (r.dir === 'IN' ? 'tag green' : r.dir === 'OUT' ? 'tag blue' : 'tag grey') },
    { key: 'method', label: 'Method' },
    { key: 'device', label: 'Device' },
    { key: 'location', label: 'Location' },
    { key: 'id', label: 'Transaction' },
    { key: 'verify', label: 'Verification', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'dir', label: 'Direction', options: ['IN', 'OUT', 'BREAK OUT', 'BREAK IN'] },
    { key: 'method', label: 'Method', options: METHODS },
    { key: 'verify', label: 'Verification', options: ['Verified', 'Manual', 'Rejected', 'Approved'] },
    { key: 'site', label: 'Site', options: SITES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'approve', label: 'Approve manual entry', icon: 'shield-check', when: (r) => r.verify === 'Manual' },
    { id: 'reject', label: 'Mark invalid', icon: 'ban', danger: true, when: (r) => r.verify !== 'Rejected' },
    { id: 'photo', label: 'View capture photo', icon: 'user', when: (r) => r.method === 'Face' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Mark invalid', danger: true }];

  constructor() {
    // Live: a new punch arrives every tick.
    effect(() => {
      const t = this.state.tick();
      if (!t) return;
      const rec = RECORDS[(t * 97) % RECORDS.length];
      const d = new Date();
      this.all.update((l) => [
        { id: `TXN-${600000 + t}`, time: d.toTimeString().slice(0, 8), name: rec.name, initials: rec.initials, avatar: rec.avatar, empId: rec.id, dept: rec.dept, site: rec.site, dir: t % 3 ? 'BREAK IN' : 'BREAK OUT', method: rec.method, device: DEVICES[t % DEVICES.length], location: rec.location === '—' ? `Main Entrance - ${rec.site}` : rec.location, verify: 'Verified' },
        ...l,
      ]);
    });
  }

  protected readonly list = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.all() : this.all().filter((t) => t.site === s.name);
  });
  protected readonly byHour = computed(() => {
    const count = (dirs: Dir[]) => this.hours.map((h) => this.list().filter((t) => t.time.startsWith(h) && dirs.includes(t.dir)).length);
    return [
      { name: 'IN', color: '#7c3aed', values: count(['IN']) },
      { name: 'Breaks', color: '#c4b5fd', values: count(['BREAK OUT', 'BREAK IN']) },
      { name: 'OUT', color: '#38bdf8', values: count(['OUT']) },
    ];
  });
  protected readonly byMethod = computed(() => METHODS.map((m, i) => ({ label: m, value: this.list().filter((t) => t.method === m).length, color: ['#22c55e', '#7c3aed', '#3b82f6', '#f59e0b'][i] })));

  protected share(m: string) {
    return `${Math.round((this.list().filter((t) => t.method === m).length / (this.list().length || 1)) * 100)}%`;
  }
  protected verifyCount(v: string) {
    return String(this.list().filter((t) => t.verify === v).length);
  }
  protected act(a: string, ids: string[]) {
    if (a === 'photo') return this.notify('Capture photo opened (face match 97.4%)');
    const set = new Set(ids);
    this.all.update((l) => l.map((t) => (set.has(t.id) ? { ...t, verify: a === 'approve' ? 'Approved' : 'Rejected' } : t)));
    this.notify(`${ids.length} transaction(s) ${a === 'approve' ? 'approved' : 'marked invalid'}`);
  }
  protected addManual(person: string, time: string, dir: string, reason: string) {
    const rec = RECORDS.find((r) => r.id === person.split(' · ')[0]);
    if (!rec) return this.notify('Pick an employee from the list');
    this.all.update((l) => [
      { id: `TXN-${700000 + l.length}`, time: `${time}:00`, name: rec.name, initials: rec.initials, avatar: rec.avatar, empId: rec.id, dept: rec.dept, site: rec.site, dir: dir as Dir, method: 'Manual', device: 'Admin portal', location: reason, verify: 'Manual' },
      ...l,
    ]);
    this.manual.set(false);
    this.notify(`Manual ${dir} added for ${rec.name} (pending approval)`);
  }
  protected exportCsv() {
    downloadCsv('attendance-transactions.csv', [['Transaction', 'Time', 'Employee ID', 'Name', 'Direction', 'Method', 'Device', 'Location', 'Verification'], ...this.list().map((t) => [t.id, t.time, t.empId, t.name, t.dir, t.method, t.device, t.location, t.verify])]);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Daily / Monthly Timesheets ======================= */
interface DayRow extends AttRecord {
  out: string;
  workedH: number;
  breakM: number;
  ot: number;
  approval: string;
}
type Code = 'P' | 'L' | 'A' | 'LV' | 'WFH' | 'WO' | 'H' | '';
const CODE_COLOR: Record<string, string> = { P: '#dcfce7', L: '#ffedd5', A: '#fee2e2', LV: '#ede9fe', WFH: '#dbeafe', WO: '#f3f4f6', H: '#fef9c3' };
const CODE_TEXT: Record<string, string> = { P: '#15803d', L: '#c2410c', A: '#b91c1c', LV: '#6d28d9', WFH: '#1d4ed8', WO: '#9ca3af', H: '#a16207' };

@Component({
  selector: 'app-timesheets',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Daily / Monthly Timesheets" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Worked hours, breaks and overtime per employee, with approval.">
      <div class="tabs">
        <button [class.on]="mode() === 'daily'" (click)="mode.set('daily')">Daily</button>
        <button [class.on]="mode() === 'monthly'" (click)="mode.set('monthly')">Monthly</button>
      </div>
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    @if (mode() === 'daily') {
      <section class="kpi-row">
        <app-kpi label="Timesheets" [value]="rows().length.toLocaleString()" icon="calendar-days" color="#8b5cf6" sub="for the selected day" />
        <app-kpi label="Total Hours" [value]="totalHours()" icon="clock" color="#22c55e" />
        <app-kpi label="Overtime Hours" [value]="otHours()" icon="trending-up" color="#f97316" />
        <app-kpi label="Pending Approval" [value]="approvalCount('Submitted')" icon="file-check" color="#f59e0b" />
        <app-kpi label="Approved" [value]="approvalCount('Approved')" icon="shield-check" color="#3b82f6" />
      </section>
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="dailyCols" noun="timesheets" [pageSize]="15" [searchKeys]="['name', 'id', 'dept']" searchPlaceholder="Search employee..."
          [filters]="dailyFilters" [actions]="dailyActions" [selectable]="true" [bulkActions]="dailyBulk" (action)="approve([$event.row.id], $event.action)" (bulk)="approve($event.ids, $event.action)" />
      </div>
    } @else {
      <section class="card">
        <div class="card-head">
          <h3>Monthly Timesheet · {{ monthLabel() }}</h3>
          <div class="toolbar">
            <button class="btn-ghost sm" (click)="month.set(month() - 1)">‹ Prev</button>
            <button class="btn-ghost sm" (click)="month.set(month() + 1)" [disabled]="month() >= 0">Next ›</button>
            <select class="select" [value]="mDept()" (change)="mDept.set($any($event.target).value); mPage.set(0)">
              @for (d of depts; track d) {<option [value]="d">{{ d }}</option>}
            </select>
          </div>
        </div>
        <div class="legend">
          @for (c of codes; track c[0]) {<span><b [style.background]="codeBg[c[0]]" [style.color]="codeFg[c[0]]">{{ c[0] }}</b>{{ c[1] }}</span>}
        </div>
        <div class="grid-wrap">
          <table class="msheet">
            <thead>
              <tr>
                <th class="who">Employee</th>
                @for (d of days(); track d.n) {<th [class.we]="d.we">{{ d.n }}<small>{{ d.dow }}</small></th>}
                <th>P</th><th>A</th><th>LV</th><th>Hrs</th>
              </tr>
            </thead>
            <tbody>
              @for (e of matrix(); track e.id) {
                <tr>
                  <td class="who"><span class="dt-av" [style.background]="e.avatar">{{ e.initials }}</span><div><b>{{ e.name }}</b><small>{{ e.id }}</small></div></td>
                  @for (c of e.codes; track $index) {
                    <td><span class="code" [style.background]="codeBg[c]" [style.color]="codeFg[c]" [title]="e.name + ' · day ' + ($index + 1)">{{ c }}</span></td>
                  }
                  <td class="tot">{{ e.p }}</td><td class="tot bad">{{ e.a }}</td><td class="tot">{{ e.lv }}</td><td class="tot">{{ e.hrs }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>Showing {{ mPage() * 12 + 1 }}–{{ min((mPage() + 1) * 12, deptEmps().length) }} of {{ deptEmps().length }} employees</span>
          <div class="toolbar">
            <button class="btn-ghost sm" [disabled]="mPage() === 0" (click)="mPage.set(mPage() - 1)">Previous</button>
            <button class="btn-ghost sm" [disabled]="(mPage() + 1) * 12 >= deptEmps().length" (click)="mPage.set(mPage() + 1)">Next</button>
          </div>
        </div>
      </section>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; margin-bottom: 10px; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .legend b { display: inline-grid; place-items: center; min-width: 26px; height: 20px; border-radius: 4px; font-size: 10.5px; }
    .grid-wrap { overflow: auto; }
    .msheet { border-collapse: collapse; font-size: 11px; }
    .msheet th { position: sticky; top: 0; background: #fafafe; padding: 4px 2px; font-weight: 600; color: #4b4f6b; min-width: 28px; }
    .msheet th small { display: block; font-weight: 400; color: var(--muted); font-size: 9.5px; }
    .msheet th.we { color: #b91c1c; }
    .msheet td { padding: 2px; border-bottom: 1px solid #f0f1f6; text-align: center; }
    .msheet .who { position: sticky; left: 0; background: #fff; text-align: left; min-width: 190px; display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 0; z-index: 1; }
    .msheet .who div { display: flex; flex-direction: column; } .msheet .who small { color: var(--muted); }
    .code { display: inline-grid; place-items: center; width: 26px; height: 22px; border-radius: 4px; font-weight: 600; font-size: 10px; }
    .tot { font-weight: 600; padding: 0 8px !important; }
  `,
})
export class Timesheets {
  private readonly state = inject(AppState);
  protected readonly depts = DEPTS.filter((d) => d !== '—');
  protected readonly min = Math.min;
  protected readonly codeBg = CODE_COLOR;
  protected readonly codeFg = CODE_TEXT;
  protected readonly codes: [Code, string][] = [['P', 'Present'], ['L', 'Late'], ['A', 'Absent'], ['LV', 'Leave'], ['WFH', 'Work from home'], ['WO', 'Weekly off'], ['H', 'Holiday']];
  protected readonly mode = signal<'daily' | 'monthly'>('daily');
  protected readonly approvals = signal<Record<string, string>>({});
  protected readonly toast = signal<string | null>(null);

  // ---------- Daily ----------
  protected readonly rows = computed<DayRow[]>(() => {
    const s = this.state.site();
    const today = this.state.isToday();
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const ap = this.approvals();
    const r = rng(this.state.date().getDate() * 7);
    return RECORDS.filter((x) => s.factor === 1 || x.site === s.name).map((x) => {
      const inM = x.checkIn ? toMinutes(x.checkIn) : 0;
      const outM = !inM ? 0 : today ? Math.max(inM, Math.min(nowM, inM + 540)) : inM + 510 + Math.floor(r() * 120);
      const breakM = inM ? 45 : 0;
      const workedH = inM ? Math.max(0, Math.round(((outM - inM - breakM) / 60) * 10) / 10) : 0;
      const ot = Math.max(0, Math.round((workedH - 8) * 10) / 10);
      return { ...x, out: inM && (!today || outM - inM >= 540) ? hhmm(outM) : '', workedH, breakM, ot, approval: ap[x.id] ?? (today ? 'Draft' : r() < 0.7 ? 'Approved' : 'Submitted') };
    });
  });
  protected readonly dailyCols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'shift', label: 'Shift' },
    { key: 'checkIn', label: 'In', fmt: (v) => ampm(v) },
    { key: 'out', label: 'Out', fmt: (v) => (v ? ampm(v) : 'In progress') },
    { key: 'breakM', label: 'Break', fmt: (v) => (v ? `${v}m` : '—') },
    { key: 'workedH', label: 'Worked (h)', kind: 'num' },
    { key: 'ot', label: 'OT (h)', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'approval', label: 'Approval', kind: 'status' },
  ];
  protected readonly dailyFilters = [
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'status', label: 'Status', options: ['Present', 'Late', 'WFH', 'On Leave', 'Absent'] },
    { key: 'approval', label: 'Approval', options: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
  ];
  protected readonly dailyActions: RowAction[] = [
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.approval !== 'Approved' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.approval !== 'Rejected' },
    { id: 'Submitted', label: 'Submit for approval', icon: 'file-check', when: (r) => r.approval === 'Draft' },
  ];
  protected readonly dailyBulk: RowAction[] = [{ id: 'Approved', label: 'Approve' }, { id: 'Submitted', label: 'Submit' }, { id: 'Rejected', label: 'Reject', danger: true }];
  protected readonly totalHours = computed(() => Math.round(this.rows().reduce((a, x) => a + x.workedH, 0)).toLocaleString());
  protected readonly otHours = computed(() => Math.round(this.rows().reduce((a, x) => a + x.ot, 0)).toLocaleString());

  protected approvalCount(s: string) {
    return this.rows().filter((x) => x.approval === s).length.toLocaleString();
  }
  protected approve(ids: string[], status: string) {
    this.approvals.update((a) => ({ ...a, ...Object.fromEntries(ids.map((id) => [id, status])) }));
    this.toast.set(`${ids.length} timesheet(s) ${status.toLowerCase()}`);
    setTimeout(() => this.toast.set(null), 2000);
  }

  // ---------- Monthly ----------
  protected readonly month = signal(0);
  protected readonly mDept = signal('IT');
  protected readonly mPage = signal(0);
  private readonly monthDate = computed(() => {
    const d = new Date(this.state.date());
    d.setDate(1);
    d.setMonth(d.getMonth() + this.month());
    return d;
  });
  protected readonly monthLabel = computed(() => this.monthDate().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  protected readonly days = computed(() => {
    const d = this.monthDate();
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const day = new Date(d.getFullYear(), d.getMonth(), i + 1);
      return { n: i + 1, dow: day.toLocaleDateString('en-GB', { weekday: 'narrow' }), we: day.getDay() === 0 || day.getDay() === 6 };
    });
  });
  protected readonly deptEmps = computed(() => RECORDS.filter((x) => x.dept === this.mDept()));
  protected readonly matrix = computed(() => {
    const days = this.days();
    const today = this.state.date();
    const md = this.monthDate();
    return this.deptEmps()
      .slice(this.mPage() * 12, (this.mPage() + 1) * 12)
      .map((e, ei) => {
        const r = rng(ei * 31 + md.getMonth() * 7 + e.id.charCodeAt(6));
        const codes: Code[] = days.map((d) => {
          const date = new Date(md.getFullYear(), md.getMonth(), d.n);
          if (date > today) return '';
          if (d.we) return 'WO';
          if (md.getMonth() === 11 && d.n === 2) return 'H';
          const x = r();
          return x < 0.86 ? 'P' : x < 0.91 ? 'L' : x < 0.94 ? 'WFH' : x < 0.97 ? 'LV' : 'A';
        });
        const p = codes.filter((c) => c === 'P' || c === 'L' || c === 'WFH').length;
        return { ...e, codes, p, a: codes.filter((c) => c === 'A').length, lv: codes.filter((c) => c === 'LV').length, hrs: Math.round(p * 8.4) };
      });
  });

  protected exportCsv() {
    if (this.mode() === 'daily')
      downloadCsv('timesheets-daily.csv', [['ID', 'Name', 'Department', 'Shift', 'In', 'Out', 'Break (m)', 'Worked (h)', 'OT (h)', 'Status', 'Approval'], ...this.rows().map((x) => [x.id, x.name, x.dept, x.shift, x.checkIn, x.out, x.breakM, x.workedH, x.ot, x.status, x.approval])]);
    else downloadCsv(`timesheet-${this.mDept()}-${this.monthLabel()}.csv`, [['ID', 'Name', ...this.days().map((d) => String(d.n)), 'P', 'A', 'LV', 'Hours'], ...this.matrix().map((e) => [e.id, e.name, ...e.codes, e.p, e.a, e.lv, e.hrs])]);
  }
}
