import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { dayLabels, downloadCsv, rng, series } from '../dashboards/demo-data';
import { DEPTS, SITES } from '../people/people.data';
import { aggregate, ampm, RECORDS } from './attendance.data';

const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* ======================= Attendance Regularization ======================= */
interface Req {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  date: string;
  type: string;
  original: string;
  requested: string;
  reason: string;
  submitted: string;
  status: string;
  comment: string;
}
const TYPES = ['Missed punch', 'Wrong punch', 'On duty (client site)', 'Work from home', 'Forgot card', 'Device offline'];
const REQS: Req[] = (() => {
  const r = rng(44);
  const reasons: Record<string, string> = {
    'Missed punch': 'Reader did not respond at exit, left at 18:10',
    'Wrong punch': 'Punched OUT instead of IN at lobby turnstile',
    'On duty (client site)': 'Full day at Globex HQ for workshop',
    'Work from home': 'Approved by manager on Teams, internet outage at site',
    'Forgot card': 'Signed in at security desk, card left at home',
    'Device offline': 'Gate 2 face reader was offline 08:00–09:30',
  };
  return RECORDS.slice(40, 95).map((x, i) => {
    const type = TYPES[Math.floor(r() * TYPES.length)];
    return {
      id: `REG-${4400 + i}`, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept, date: daysAgo(1 + Math.floor(r() * 9)), type,
      original: type === 'Missed punch' ? 'IN 08:52 · OUT —' : type === 'Wrong punch' ? 'OUT 08:57 · OUT 18:04' : type === 'Forgot card' || type === 'Device offline' ? 'No punches' : 'Absent',
      requested: type === 'Missed punch' ? 'IN 08:52 · OUT 18:10' : type === 'Wrong punch' ? 'IN 08:57 · OUT 18:04' : type === 'Work from home' ? 'WFH full day' : 'IN 09:00 · OUT 18:00',
      reason: reasons[type], submitted: `${1 + Math.floor(r() * 30)}h ago`, status: i < 24 ? 'Pending' : r() < 0.8 ? 'Approved' : 'Rejected', comment: '',
    };
  });
})();

@Component({
  selector: 'app-regularization',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Attendance Regularization" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Requests to correct missed or wrong punches, on-duty and work-from-home days.">
      <button class="btn-primary" (click)="form.set(true)"><app-icon name="plus" [size]="16" />New Request</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Pending" [value]="count('Pending')" icon="clock" color="#f59e0b" sub="awaiting manager" />
      <app-kpi label="Approved (30 days)" [value]="count('Approved')" icon="shield-check" color="#22c55e" />
      <app-kpi label="Rejected (30 days)" [value]="count('Rejected')" icon="ban" color="#ef4444" />
      <app-kpi label="Avg. Approval Time" value="5.2 h" icon="activity" color="#3b82f6" />
      <app-kpi label="Top Reason" value="Missed punch" icon="fingerprint" color="#8b5cf6" sub="38% of requests" />
    </section>
    <section class="reg" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" noun="requests" [searchKeys]="['name', 'empId', 'id', 'reason']" searchPlaceholder="Search employee, request ID..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [activeId]="selId()"
          (rowClick)="selId.set($event.id)" (action)="decide([$event.row.id], $event.action)" (bulk)="decide($event.ids, $event.action)" />
      </div>
      @if (sel(); as q) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ q.id }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="who"><span class="dt-av" [style.background]="q.avatar">{{ q.initials }}</span><div><b>{{ q.name }}</b><small>{{ q.empId }} · {{ q.dept }}</small></div></div>
          <dl class="kv">
            <dt>Date</dt><dd>{{ q.date }}</dd>
            <dt>Type</dt><dd>{{ q.type }}</dd>
            <dt>Recorded</dt><dd class="orig">{{ q.original }}</dd>
            <dt>Requested</dt><dd class="req">{{ q.requested }}</dd>
            <dt>Reason</dt><dd>{{ q.reason }}</dd>
            <dt>Status</dt><dd><span [class]="tag(q.status)">{{ q.status }}</span></dd>
            @if (q.comment) {<dt>Comment</dt><dd>{{ q.comment }}</dd>}
          </dl>
          @if (q.status === 'Pending') {
            <textarea #c class="input" rows="2" placeholder="Comment (optional)"></textarea>
            <div class="toolbar">
              <button class="btn-primary" (click)="decide([q.id], 'Approved', c.value)">Approve</button>
              <button class="btn-ghost danger" (click)="decide([q.id], 'Rejected', c.value)">Reject</button>
            </div>
          }
        </aside>
      }
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create(p.value, d.value, t.value, i.value, o.value, why.value)">
        <div class="modal-head"><h3>New Regularization Request</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee<input #p class="input" list="reg-emps" required placeholder="Type name or ID" /><datalist id="reg-emps">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist></label>
          <label>Date<input #d class="input" type="date" [value]="yesterday" required /></label>
          <label>Type<select #t class="select">@for (x of types; track x) {<option>{{ x }}</option>}</select></label>
          <label>Correct check-in<input #i class="input" type="time" value="09:00" /></label>
          <label>Correct check-out<input #o class="input" type="time" value="18:00" /></label>
          <label class="full">Reason<input #why class="input" required /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Submit</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .reg { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
    .reg.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .who { display: flex; gap: 10px; align-items: center; } .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .kv { display: grid; grid-template-columns: 90px 1fr; gap: 8px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    .orig { color: #b91c1c; text-decoration: line-through; } .req { color: #15803d; font-weight: 600; }
    .danger { color: var(--red); }
    @media (max-width: 1100px) { .reg.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class Regularization {
  protected readonly types = TYPES;
  protected readonly pick = RECORDS.slice(0, 300);
  protected readonly yesterday = daysAgo(1);
  protected readonly list = signal<Req[]>(REQS);
  protected readonly selId = signal<string | null>(REQS[0].id);
  protected readonly form = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.list().find((x) => x.id === this.selId()) ?? null);
  protected readonly tag = (s: string) => (s === 'Approved' ? 'tag green' : s === 'Rejected' ? 'tag red' : 'tag amber');
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'date', label: 'Date', fmt: shortDate },
    { key: 'type', label: 'Type' },
    { key: 'requested', label: 'Requested' },
    { key: 'submitted', label: 'Submitted', sortable: false },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] }, { key: 'type', label: 'Type', options: TYPES }];
  protected readonly actions: RowAction[] = [
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Approved', label: 'Approve' }, { id: 'Rejected', label: 'Reject', danger: true }];

  protected count(s: string) {
    return String(this.list().filter((x) => x.status === s).length);
  }
  protected decide(ids: string[], status: string, comment = '') {
    const set = new Set(ids);
    this.list.update((l) => l.map((x) => (set.has(x.id) && x.status === 'Pending' ? { ...x, status, comment } : x)));
    this.notify(`${ids.length} request(s) ${status.toLowerCase()} · timesheets updated`);
  }
  protected create(person: string, date: string, type: string, i: string, o: string, reason: string) {
    const x = RECORDS.find((r) => r.id === person.split(' · ')[0]);
    if (!x) return this.notify('Pick an employee from the list');
    const id = `REG-${5000 + this.list().length}`;
    this.list.update((l) => [{ id, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept, date, type, original: 'As recorded', requested: `IN ${i} · OUT ${o}`, reason, submitted: 'just now', status: 'Pending', comment: '' }, ...l]);
    this.selId.set(id);
    this.form.set(false);
    this.notify(`${id} submitted to ${x.name}'s manager`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Absence & Exception Management ======================= */
interface Exc {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  dept: string;
  site: string;
  type: string;
  detail: string;
  date: string;
  state: string;
}
const EXC_TYPES = ['Absent without leave', 'Late arrival', 'Missing check-out', 'Early leave', 'Short hours', 'Excessive breaks'];
const EXCS: Exc[] = (() => {
  const r = rng(717);
  const out: Exc[] = [];
  const add = (x: (typeof RECORDS)[number], type: string, detail: string, date: string) =>
    out.push({ id: `EXC-${9000 + out.length}`, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, dept: x.dept, site: x.site, type, detail, date, state: 'Open' });
  for (const x of RECORDS) {
    if (x.status === 'Absent') add(x, 'Absent without leave', `No punch, no approved leave · shift ${x.shiftStart}`, daysAgo(0));
    else if (x.status === 'Late' && x.lateBy > 30) add(x, 'Late arrival', `Arrived ${ampm(x.checkIn)}, ${x.lateBy} min late`, daysAgo(0));
    else if (x.status === 'Present') {
      const v = r();
      if (v < 0.012) add(x, 'Missing check-out', 'Checked in 08:51, no check-out', daysAgo(1));
      else if (v < 0.02) add(x, 'Early leave', `Left at 16:${10 + Math.floor(r() * 40)} (shift ends 18:00)`, daysAgo(1));
      else if (v < 0.026) add(x, 'Short hours', `Worked ${6 + Math.floor(r() * 15) / 10} h of 8 h`, daysAgo(1));
      else if (v < 0.03) add(x, 'Excessive breaks', `Breaks totalled ${80 + Math.floor(r() * 60)} min`, daysAgo(1));
    }
  }
  return out;
})();
const LEAVE_TYPES = ['Sick Leave', 'Annual Leave', 'Emergency Leave', 'Unpaid Leave'];

@Component({
  selector: 'app-absence-exceptions',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Absence &amp; Exception Management" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Unplanned absences and attendance exceptions that need follow-up." />
    <section class="exc-types">
      @for (t of types; track t) {
        <button class="card et" [class.on]="type() === t" (click)="type.set(type() === t ? null : t)">
          <span>{{ t }}</span><b>{{ openCount(t) }}</b><small>open</small>
        </button>
      }
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Absenteeism Rate <span class="card-sub">last 30 days</span></h3></div>
        <app-line-chart [labels]="labels" [series]="rate" [height]="200" [min]="0" [max]="8" suffix="%" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Bradford Factor · Top 6</h3><span class="muted">S² × D, last 52 weeks</span></div>
        <table class="table">
          <thead><tr><th>Employee</th><th class="num">Spells</th><th class="num">Days</th><th class="num">Score</th></tr></thead>
          <tbody>
            @for (b of bradford; track b.name) {
              <tr><td>{{ b.name }}</td><td class="num">{{ b.s }}</td><td class="num">{{ b.d }}</td><td class="num"><span class="tag" [class.red]="b.score >= 250" [class.amber]="b.score < 250">{{ b.score }}</span></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card span-12">
        <app-data-table [rows]="rows()" [columns]="cols" noun="exceptions" [searchKeys]="['name', 'empId', 'detail']" searchPlaceholder="Search employee..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, [$event.row])" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
    </section>
    @if (leaveFor(); as list) {
      <div class="g-overlay" (click)="leaveFor.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Convert to leave · {{ list.length === 1 ? list[0].name : list.length + ' people' }}</h3><button class="close-btn" (click)="leaveFor.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Leave type<select #lt class="select">@for (l of leaveTypes; track l) {<option>{{ l }}</option>}</select></label>
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="leaveFor.set(null)">Cancel</button><button class="btn-primary" (click)="convert(list, lt.value)">Convert</button></div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .exc-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .et { display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; font-family: inherit; border-left: 4px solid #f59e0b; }
    .et.on { box-shadow: 0 0 0 2px var(--primary-soft); border-color: var(--primary); }
    .et span { font-size: 12px; color: #4b4f6b; } .et b { font-size: 24px; } .et small { color: var(--muted); font-size: 11px; }
  `,
})
export class AbsenceExceptions {
  private readonly state = inject(AppState);
  protected readonly types = EXC_TYPES;
  protected readonly leaveTypes = LEAVE_TYPES;
  protected readonly labels = dayLabels(30, new Date());
  protected readonly rate = [{ name: 'Absenteeism %', color: '#ef4444', values: series(30, 3.6, 1.1, 21), area: true }, { name: 'Target', color: '#22c55e', values: Array(30).fill(3), dashed: true }];
  protected readonly bradford = [
    { name: 'Tom Baker', s: 6, d: 9 }, { name: 'Lucas Silva', s: 5, d: 11 }, { name: 'Zara Khan', s: 5, d: 7 }, { name: 'Omar Iyer', s: 4, d: 12 }, { name: 'Mina Joseph', s: 4, d: 8 }, { name: 'Karan Gupta', s: 3, d: 14 },
  ].map((b) => ({ ...b, score: b.s * b.s * b.d }));
  protected readonly list = signal<Exc[]>(EXCS);
  protected readonly type = signal<string | null>(null);
  protected readonly leaveFor = signal<Exc[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'type', label: 'Exception', kind: 'tag', tag: (r) => (r.type === 'Absent without leave' ? 'tag red' : 'tag amber') },
    { key: 'detail', label: 'Detail' },
    { key: 'dept', label: 'Department' },
    { key: 'date', label: 'Date', fmt: shortDate },
    { key: 'state', label: 'State', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'state', label: 'State', options: ['Open', 'Excused', 'Converted', 'Escalated', 'Notified'] }, { key: 'dept', label: 'Department', options: DEPTS }, { key: 'site', label: 'Site', options: SITES }];
  protected readonly actions: RowAction[] = [
    { id: 'notify', label: 'Notify employee & manager', icon: 'bell' },
    { id: 'excuse', label: 'Mark excused', icon: 'shield-check' },
    { id: 'leave', label: 'Convert to leave', icon: 'calendar-x', when: (r) => r.type === 'Absent without leave' },
    { id: 'escalate', label: 'Escalate to HR', icon: 'triangle-alert', danger: true },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'notify', label: 'Notify' }, { id: 'excuse', label: 'Excuse' }, { id: 'leave', label: 'Convert to leave' }];
  protected readonly rows = computed(() => {
    const s = this.state.site();
    return this.list().filter((x) => (!this.type() || x.type === this.type()) && (s.factor === 1 || x.site === s.name));
  });

  protected openCount(t: string) {
    return this.list().filter((x) => x.type === t && x.state === 'Open').length;
  }
  protected act(a: string, rows: Exc[]) {
    if (a === 'leave') return this.leaveFor.set(rows.filter((r) => r.type === 'Absent without leave'));
    const state = { notify: 'Notified', excuse: 'Excused', escalate: 'Escalated' }[a] ?? 'Open';
    const set = new Set(rows.map((r) => r.id));
    this.list.update((l) => l.map((x) => (set.has(x.id) ? { ...x, state } : x)));
    this.notify(`${rows.length} exception(s) → ${state}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    this.act(a, this.list().filter((x) => ids.includes(x.id)));
  }
  protected convert(rows: Exc[], leave: string) {
    const set = new Set(rows.map((r) => r.id));
    this.list.update((l) => l.map((x) => (set.has(x.id) ? { ...x, state: 'Converted', detail: `${leave} applied` } : x)));
    this.leaveFor.set(null);
    this.notify(`${rows.length} absence(s) converted to ${leave}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Attendance Reports & Analytics ======================= */
interface ReportDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}
interface Schedule {
  report: string;
  freq: string;
  time: string;
  to: string;
  format: string;
  active: boolean;
}
const REPORTS: ReportDef[] = [
  { id: 'summary', name: 'Daily Attendance Summary', desc: 'Present, late, absent and leave by department', icon: 'list-checks' },
  { id: 'late', name: 'Late Arrivals Report', desc: 'Everyone who arrived after grace time', icon: 'clock' },
  { id: 'absent', name: 'Absenteeism Report', desc: 'Unplanned absences and leave by person', icon: 'calendar-x' },
  { id: 'site', name: 'Site Attendance Report', desc: 'Attendance rate for each site', icon: 'building' },
  { id: 'muster', name: 'Muster Roll', desc: 'Statutory daily register of all employees', icon: 'file-text' },
  { id: 'method', name: 'Punch Method Report', desc: 'Face, card, fingerprint and mobile usage', icon: 'fingerprint' },
];

@Component({
  selector: 'app-att-reports',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Attendance Reports &amp; Analytics" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Run, export and schedule attendance reports, and analyze punctuality trends." />
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Punctuality Trend <span class="card-sub">12 weeks</span></h3></div>
        <app-line-chart [labels]="weeks" [series]="punctuality" [height]="210" [min]="80" [max]="100" suffix="%" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Attendance by Weekday</h3><span class="muted">% present</span></div>
        <app-heatmap [rows]="hmRows" [cols]="hmCols" [data]="heat" />
      </div>
    </section>

    <h3 class="sec">Report Library</h3>
    <section class="lib">
      @for (r of reports; track r.id) {
        <div class="card rep" [class.on]="active()?.id === r.id">
          <span class="rep-ic"><app-icon [name]="r.icon" [size]="20" /></span>
          <div><b>{{ r.name }}</b><small>{{ r.desc }}</small></div>
          <div class="toolbar">
            <button class="btn-primary btn-sm" (click)="active.set(r)">Run</button>
            <button class="btn-ghost sm" (click)="schedFor.set(r)">Schedule</button>
          </div>
        </div>
      }
    </section>

    @if (active(); as r) {
      <section class="card preview">
        <div class="card-head">
          <h3>{{ r.name }} <span class="card-sub">{{ rows().length.toLocaleString() }} rows · {{ state.site().name }}</span></h3>
          <div class="toolbar">
            <label class="rng">From<input class="input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
            <label class="rng">To<input class="input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
            <button class="btn-outline" (click)="exportCsv(r)"><app-icon name="download" [size]="15" />Export CSV</button>
            <button class="close-btn" (click)="active.set(null)">×</button>
          </div>
        </div>
        <app-data-table [rows]="rows()" [columns]="cols()" [noun]="'rows'" [pageSize]="10" [searchKeys]="['name', 'id', 'dept']" searchPlaceholder="Search..." [idKey]="r.id === 'summary' || r.id === 'site' || r.id === 'method' ? 'name' : 'id'" />
      </section>
    }

    <section class="card">
      <div class="card-head"><h3>Scheduled Reports</h3></div>
      <table class="table">
        <thead><tr><th>Report</th><th>Frequency</th><th>Time</th><th>Recipients</th><th>Format</th><th>Active</th><th></th></tr></thead>
        <tbody>
          @for (s of schedules(); track $index; let i = $index) {
            <tr>
              <td><b>{{ s.report }}</b></td><td>{{ s.freq }}</td><td>{{ s.time }}</td><td>{{ s.to }}</td><td>{{ s.format }}</td>
              <td><label class="sw"><input type="checkbox" [checked]="s.active" (change)="toggleSched(i)" /><span class="switch"></span></label></td>
              <td><button class="link danger" (click)="removeSched(i)">Remove</button></td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty-note">No scheduled reports</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (schedFor(); as r) {
      <div class="g-overlay" (click)="schedFor.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); addSched(r, f.value, t.value, to.value, fm.value)">
        <div class="modal-head"><h3>Schedule · {{ r.name }}</h3><button type="button" class="close-btn" (click)="schedFor.set(null)">×</button></div>
        <div class="form-grid">
          <label>Frequency<select #f class="select"><option>Daily</option><option>Weekly (Mon)</option><option>Monthly (1st)</option></select></label>
          <label>Time<input #t class="input" type="time" value="08:00" /></label>
          <label class="full">Recipients<input #to class="input" value="hr-ops@company.com" required /></label>
          <label>Format<select #fm class="select"><option>CSV</option><option>Excel</option><option>PDF</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="schedFor.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sec { margin: 4px 0 10px; }
    .lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .rep { display: grid; grid-template-columns: 40px 1fr; gap: 6px 12px; align-items: center; }
    .rep.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .rep div:nth-child(2) { display: flex; flex-direction: column; font-size: 13px; } .rep small { color: var(--muted); font-size: 11.5px; }
    .rep .toolbar { grid-column: 2; }
    .rep-ic { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); }
    .preview { margin-bottom: 12px; }
    .rng { display: flex; align-items: center; gap: 5px; font-size: 12px; } .rng .input { padding: 5px 8px; }
    .sw input { display: none; } .sw { cursor: pointer; }
    .switch { position: relative; display: inline-block; width: 34px; height: 20px; border-radius: 10px; background: #d4d7e2; }
    .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .sw input:checked + .switch { background: var(--primary); } .sw input:checked + .switch::after { transform: translateX(14px); }
    .danger { color: var(--red); }
  `,
})
export class AttendanceReports {
  protected readonly state = inject(AppState);
  protected readonly reports = REPORTS;
  protected readonly weeks = Array.from({ length: 12 }, (_, i) => `W${i + 34}`);
  protected readonly punctuality = [
    { name: 'On-time %', color: '#7c3aed', values: series(12, 94, 2.5, 8), area: true },
    { name: 'Attendance %', color: '#22c55e', values: series(12, 96.5, 1.2, 9) },
  ];
  protected readonly hmRows = DEPTS.filter((d) => d !== '—').slice(0, 7);
  protected readonly hmCols = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  protected readonly heat = this.hmRows.map((_, i) => series(5, 93, 4, i * 3 + 2).map((v, j) => Math.min(99, Math.round(v - (j === 0 || j === 4 ? 2 : 0)))));
  protected readonly active = signal<ReportDef | null>(REPORTS[0]);
  protected readonly schedFor = signal<ReportDef | null>(null);
  protected readonly from = signal(daysAgo(0));
  protected readonly to = signal(daysAgo(0));
  protected readonly toast = signal<string | null>(null);
  protected readonly schedules = signal<Schedule[]>([
    { report: 'Daily Attendance Summary', freq: 'Daily', time: '09:30', to: 'leadership@company.com', format: 'PDF', active: true },
    { report: 'Late Arrivals Report', freq: 'Daily', time: '10:00', to: 'line-managers@company.com', format: 'Excel', active: true },
    { report: 'Muster Roll', freq: 'Monthly (1st)', time: '07:00', to: 'payroll@company.com', format: 'CSV', active: false },
  ]);

  private readonly scoped = computed(() => {
    const s = this.state.site();
    return RECORDS.filter((x) => s.factor === 1 || x.site === s.name);
  });
  /** Rows of the report that is open, generated from today's attendance data. */
  protected readonly rows = computed<any[]>(() => {
    const id = this.active()?.id;
    const d = this.scoped();
    if (id === 'summary') return aggregate(d, 'dept');
    if (id === 'site') return aggregate(d, 'site');
    if (id === 'late') return d.filter((x) => x.status === 'Late').sort((a, b) => b.lateBy - a.lateBy);
    if (id === 'absent') return d.filter((x) => x.status === 'Absent' || x.status === 'On Leave');
    if (id === 'method') {
      const m = new Map<string, number>();
      d.filter((x) => x.checkIn).forEach((x) => m.set(x.method, (m.get(x.method) ?? 0) + 1));
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      return [...m.entries()].map(([name, n]) => ({ name, n, pct: Math.round((n / total) * 1000) / 10 }));
    }
    return d;
  });
  protected readonly cols = computed<Col[]>(() => {
    const id = this.active()?.id;
    if (id === 'summary' || id === 'site')
      return [
        { key: 'name', label: id === 'site' ? 'Site' : 'Department' },
        { key: 'total', label: 'Headcount', kind: 'num' },
        { key: 'present', label: 'Present', kind: 'num' },
        { key: 'late', label: 'Late', kind: 'num' },
        { key: 'absent', label: 'Absent / Leave', kind: 'num' },
        { key: 'pct', label: '% Present', kind: 'progress' },
      ];
    if (id === 'method') return [{ key: 'name', label: 'Method' }, { key: 'n', label: 'Punches', kind: 'num' }, { key: 'pct', label: 'Share %', kind: 'progress' }];
    return [
      { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
      { key: 'dept', label: 'Department' },
      { key: 'site', label: 'Site' },
      { key: 'shift', label: 'Shift' },
      { key: 'checkIn', label: 'Check-in', fmt: (v) => ampm(v) },
      ...(id === 'late' ? [{ key: 'lateBy', label: 'Late (min)', kind: 'num' as const }] : []),
      { key: 'status', label: 'Status', kind: 'status' },
    ];
  });

  protected exportCsv(r: ReportDef) {
    const cols = this.cols();
    downloadCsv(`${r.id}-${this.from()}.csv`, [cols.map((c) => c.label), ...this.rows().map((row) => cols.map((c) => String(row[c.key] ?? '')))]);
    this.notify(`${r.name} exported`);
  }
  protected addSched(r: ReportDef, freq: string, time: string, to: string, format: string) {
    this.schedules.update((l) => [...l, { report: r.name, freq, time, to, format, active: true }]);
    this.schedFor.set(null);
    this.notify(`${r.name} scheduled ${freq.toLowerCase()} at ${time}`);
  }
  protected toggleSched(i: number) {
    this.schedules.update((l) => l.map((s, j) => (j === i ? { ...s, active: !s.active } : s)));
  }
  protected removeSched(i: number) {
    this.schedules.update((l) => l.filter((_, j) => j !== i));
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
