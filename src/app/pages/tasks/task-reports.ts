// Tasks Reports & Analytics — report catalog, filtered preview charts, CSV export, generated history, scheduled reports.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BarRow, Segment, Series, UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { TASKS_UI } from './tasks-ui';
import { CAT_NAMES, catOf, hhmm, isOpen, ReportSchedule, SUPERVISORS, TASK_ZONES, TaskItem, TaskStore, USAGE_CREATED, USAGE_DONE, USAGE_LABELS, workerById, WORKERS } from './tasks.data';

type Kind = 'line' | 'column' | 'bars' | 'donut';
interface Def {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  group: 'Operations' | 'SLA' | 'Workforce' | 'Compliance';
}
interface Preview {
  kind: Kind;
  labels?: string[];
  series?: Series[];
  bars?: BarRow[];
  segs?: Segment[];
  stats: [string, string][];
  head: string[];
  rows: (string | number)[][];
}
const DEFS: Def[] = [
  { id: 'completion', name: 'Daily Task Completion Summary', desc: 'Created vs completed tasks with completion rate by category.', icon: 'tasks-check-circle', color: 'var(--ka-22c55e)', group: 'Operations' },
  { id: 'sla', name: 'SLA Breach Report', desc: 'On-time vs late closures and every open breach with owner.', icon: 'tasks-timer', color: 'var(--ka-ef4444)', group: 'SLA' },
  { id: 'escalation', name: 'Overdue & Escalation Report', desc: 'Overdue tasks, escalation level and escalation contact.', icon: 'tasks-escalate', color: 'var(--ka-f97316)', group: 'SLA' },
  { id: 'checkpoint', name: 'Checkpoint Scan Compliance', desc: 'Scans vs expected per checkpoint, technology and zone.', icon: 'tasks-qr', color: 'var(--ka-0ea5e9)', group: 'Compliance' },
  { id: 'verification', name: 'Verification & Quality Report', desc: 'Approval outcomes, ratings and reviews per supervisor.', icon: 'file-check', color: 'var(--ka-7c3aed)', group: 'Compliance' },
  { id: 'productivity', name: 'Worker Productivity Scorecard', desc: 'Tasks completed, on-time rate and quality per worker.', icon: 'tasks-award', color: 'var(--ka-f59e0b)', group: 'Workforce' },
  { id: 'team', name: 'Team Workload Distribution', desc: 'Open, in-progress and completed workload by team.', icon: 'users', color: 'var(--ka-2563eb)', group: 'Workforce' },
  { id: 'template', name: 'Template Usage Report', desc: 'Most used task templates in the last 30 days.', icon: 'tasks-clipboard', color: 'var(--ka-64748b)', group: 'Operations' },
];
const RANGES = ['Today', 'Last 7 days', 'Last 30 days', 'This month'];
const GROUPS = ['All', 'Operations', 'SLA', 'Workforce', 'Compliance'];

@Component({
  selector: 'app-tasks-reports-analytics',
  imports: [...UI, ...TASKS_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports &amp; Analytics" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Ready-made task reports with live previews, filters, CSV export and scheduled delivery.">
      <button class="btn-primary" (click)="openSchedule()"><app-icon name="calendar-days" [size]="16" />Schedule Report</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export CSV</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Report Templates" [value]="defs.length" icon="file-chart" color="var(--ka-7c3aed)" [sub]="favs().size + ' favourites'" />
      <app-tkpi label="Generated This Month" [value]="38 + store.reports().length" icon="file-text" color="var(--ka-2563eb)" change="14%" sub="vs. last month" />
      <app-tkpi label="Scheduled Reports" [value]="activeSchedules()" icon="calendar-days" color="var(--ka-22c55e)" [sub]="'of ' + store.schedules().length + ' schedules active'" />
      <app-tkpi label="Tasks in Scope" [value]="scoped().length" icon="tasks-clipboard" color="var(--ka-f59e0b)" [sub]="site() + ' · ' + (cat() === 'All' ? 'all categories' : cat())" />
      <app-tkpi label="Data Freshness" value="Live" icon="refresh" color="var(--ka-06b6d4)" [sub]="'updated ' + hhmm(store.now())" />
    </section>

    <section class="grid">
      <div class="card cat">
        <div class="card-head"><h3>Report Catalog</h3></div>
        <div class="tabs grp">@for (g of groups; track g) {<button [class.on]="group() === g" (click)="group.set(g)">{{ g }}</button>}</div>
        <ul>
          @for (d of catalog(); track d.id) {
            <li [class.on]="cur().id === d.id" (click)="repId.set(d.id)">
              <span class="ri" [style.background]="d.color"><app-icon [name]="d.icon" [size]="16" /></span>
              <div><b>{{ d.name }}</b><small>{{ d.desc }}</small></div>
              <button class="star" [class.on]="favs().has(d.id)" (click)="$event.stopPropagation(); fav(d.id)" [attr.aria-label]="'Favourite ' + d.name">★</button>
            </li>
          }
        </ul>
      </div>

      <div class="card pv">
        <div class="card-head">
          <h3><span class="ri sm" [style.background]="cur().color"><app-icon [name]="cur().icon" [size]="14" /></span>{{ cur().name }}</h3>
          <div class="toolbar">
            <button class="btn-primary sm" (click)="run()"><app-icon name="play" [size]="14" />Run Report</button>
            <button class="btn-ghost sm" (click)="exportCsv()"><app-icon name="download" [size]="14" />CSV</button>
            <button class="btn-ghost sm" (click)="openSchedule(cur().name)"><app-icon name="calendar-days" [size]="14" />Schedule</button>
          </div>
        </div>
        <div class="filters">
          <label>Date range<select class="select" [value]="range()" (change)="range.set($any($event.target).value)">@for (r of ranges; track r) {<option [value]="r">{{ r }}</option>}</select></label>
          <label>Site<select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="All Sites">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Category<select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option value="All">All Categories</option>@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Format<select class="select" [value]="fmt()" (change)="fmt.set($any($event.target).value)"><option>PDF</option><option>XLSX</option><option>CSV</option></select></label>
        </div>
        @let p = preview();
        <div class="stats">@for (s of p.stats; track s[0]) {<span>{{ s[0] }}<b>{{ s[1] }}</b></span>}</div>
        <div class="chart">
          @switch (p.kind) {
            @case ('line') {<app-line-chart [labels]="p.labels!" [series]="p.series!" [height]="230" />}
            @case ('column') {<app-column-chart [labels]="p.labels!" [series]="p.series!" [height]="230" />}
            @case ('bars') {<app-bar-list [rows]="p.bars!" [max]="barMax()" />}
            @case ('donut') {<app-donut [segments]="p.segs!" [size]="170" center="Tasks" />}
          }
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>@for (h of p.head; track $index) {<th>{{ h }}</th>}</tr></thead>
            <tbody>
              @for (r of p.rows.slice(0, rowLimit()); track $index) {<tr>@for (c of r; track $index) {<td>{{ c }}</td>}</tr>}
              @empty {<tr><td [attr.colspan]="p.head.length" class="muted center">No data for the selected filters</td></tr>}
            </tbody>
          </table>
        </div>
        @if (p.rows.length > rowLimit()) {<p class="more"><button class="link" (click)="rowLimit.set(rowLimit() + 10)">Show more ({{ p.rows.length - rowLimit() }} remaining)</button> · full data in the CSV export</p>}
      </div>
    </section>

    <section class="grid2">
      <div class="card">
        <div class="card-head"><h3>Generated Reports</h3><span class="card-sub">{{ store.reports().length }} files</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Report</th><th>Range</th><th>Format</th><th>Generated</th><th class="num">Size</th><th></th></tr></thead>
            <tbody>
              @for (r of store.reports(); track r.id) {
                <tr>
                  <td><b>{{ r.name }}</b><br /><small class="muted">{{ r.id }}</small></td><td>{{ r.range }}</td><td><span class="fmt" [class]="'fmt ' + r.format.toLowerCase()">{{ r.format }}</span></td>
                  <td>{{ r.at }}<br /><small class="muted">{{ r.by }}</small></td><td class="num">{{ r.size }}</td>
                  <td class="acts"><button class="btn-ghost sm" (click)="download(r.name)"><app-icon name="download" [size]="13" /></button><button class="btn-ghost sm" (click)="removeReport(r.id)" title="Delete"><app-icon name="tasks-trash" [size]="13" /></button></td>
                </tr>
              } @empty {<tr><td colspan="6" class="muted center">No generated reports</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Scheduled Delivery</h3><button class="link" (click)="openSchedule()">+ New schedule</button></div>
        <ul class="sch">
          @for (s of store.schedules(); track s.id) {
            <li [class.off]="!s.active">
              <app-tswitch [on]="s.active" (onChange)="toggleSchedule(s, $event)" />
              <div><b>{{ s.report }}</b><small>{{ s.frequency }} at {{ s.time }} · {{ s.format }} · {{ s.recipients }}</small><small>Next: {{ s.active ? s.next : 'paused' }}</small></div>
              <span class="sa"><button class="btn-ghost sm" (click)="runSchedule(s)">Run now</button><button class="close-btn" (click)="removeSchedule(s.id)" aria-label="Delete schedule">×</button></span>
            </li>
          } @empty {<li class="muted">No schedules yet</li>}
        </ul>
      </div>
    </section>

    @if (schedOpen()) {
      <div class="g-overlay" (click)="schedOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule Report</h3><button type="button" class="close-btn" (click)="schedOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Report<select class="select" [value]="sReport()" (change)="sReport.set($any($event.target).value)">@for (d of defs; track d.id) {<option [value]="d.name">{{ d.name }}</option>}</select></label>
          <label>Frequency<select class="select" [value]="sFreq()" (change)="sFreq.set($any($event.target).value)"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>
          <label>Delivery time<input class="input" type="time" [value]="sTime()" (change)="sTime.set($any($event.target).value)" /></label>
          <label>Format<select class="select" [value]="sFmt()" (change)="sFmt.set($any($event.target).value)"><option>PDF</option><option>XLSX</option><option>CSV</option></select></label>
          <label>Filters<input class="input" [value]="site() + ' · ' + (cat() === 'All' ? 'All categories' : cat())" disabled /></label>
          <label class="full">Recipients *<input class="input" [value]="sTo()" (input)="sTo.set($any($event.target).value)" placeholder="name@company.com, team@company.com" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="schedOpen.set(false)">Cancel</button><button class="btn-primary" [disabled]="!sTo().includes('@')">Save Schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .grid2 { display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 12px; align-items: start; }
    .grp { margin-bottom: 10px; display: flex; } .grp button { flex: 1; padding: 5px 4px; }
    .cat ul { list-style: none; margin: 0; padding: 0; }
    .cat li { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 10px 8px; border-radius: 8px; cursor: pointer; border-bottom: 1px solid var(--kl-f1f2f7); }
    .cat li:hover { background: var(--kb-fafafe); } .cat li.on { background: var(--kb-f5f3ff); box-shadow: inset 3px 0 0 var(--primary); }
    .cat li div { display: flex; flex-direction: column; min-width: 0; } .cat b { font-size: 12.5px; } .cat small { font-size: 11px; color: var(--muted); }
    .ri { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--kf-ffffff); } .ri.sm { width: 26px; height: 26px; border-radius: 7px; display: inline-grid; vertical-align: middle; margin-right: 8px; }
    .star { border: 0; background: none; font-size: 17px; color: var(--kf-d5d8e4); cursor: pointer; } .star.on { color: var(--kf-f59e0b); }
    .pv h3 { display: flex; align-items: center; }
    .btn-primary.sm { padding: 6px 10px; font-size: 12px; }
    .filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; } .filters label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--kf-4b4f6b); }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .stats span { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: var(--muted); padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-fafafe); } .stats b { font-size: 18px; color: var(--text); }
    .chart { margin-bottom: 12px; min-height: 120px; }
    .center { text-align: center; padding: 20px !important; }
    .more { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
    .fmt { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 5px; background: var(--kb-eef0f5); } .fmt.pdf { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .fmt.xlsx { background: var(--kb-dcfce7); color: var(--kf-15803d); } .fmt.csv { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); }
    td.acts { white-space: nowrap; text-align: right; } td.acts button + button { margin-left: 4px; }
    .sch { list-style: none; margin: 0; padding: 0; } .sch li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f1f2f7); }
    .sch li.off { opacity: 0.6; } .sch div { display: flex; flex-direction: column; min-width: 0; } .sch b { font-size: 12.5px; } .sch small { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sa { display: flex; align-items: center; gap: 4px; }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid, .grid2 { grid-template-columns: 1fr; } }
  `,
})
export class TasksReportsAnalytics {
  protected readonly store = inject(TaskStore);
  protected readonly hhmm = hhmm;
  protected readonly defs = DEFS;
  protected readonly groups = GROUPS;
  protected readonly ranges = RANGES;
  protected readonly cats = CAT_NAMES;
  protected readonly sites = ['Head Office', 'Manufacturing', 'Warehouse'];

  protected readonly group = signal('All');
  protected readonly repId = signal('completion');
  protected readonly range = signal('Last 30 days');
  protected readonly site = signal('All Sites');
  protected readonly cat = signal('All');
  protected readonly fmt = signal('PDF');
  protected readonly rowLimit = signal(10);
  protected readonly favs = signal<Set<string>>(new Set(['completion', 'sla']));
  protected readonly toast = signal<string | null>(null);
  protected readonly schedOpen = signal(false);
  protected readonly sReport = signal(DEFS[0].name);
  protected readonly sFreq = signal<'Daily' | 'Weekly' | 'Monthly'>('Weekly');
  protected readonly sTime = signal('07:00');
  protected readonly sFmt = signal('PDF');
  protected readonly sTo = signal('ops-managers@people360.demo');

  protected readonly catalog = computed(() => {
    const l = DEFS.filter((d) => this.group() === 'All' || d.group === this.group());
    return [...l].sort((a, b) => Number(this.favs().has(b.id)) - Number(this.favs().has(a.id)));
  });
  protected readonly cur = computed(() => DEFS.find((d) => d.id === this.repId())!);
  protected readonly activeSchedules = computed(() => this.store.schedules().filter((s) => s.active).length);
  protected readonly scoped = computed(() => this.store.tasks().filter((t) => (this.site() === 'All Sites' || t.site === this.site()) && (this.cat() === 'All' || catOf(t.category) === this.cat())));
  /** Multiplier from today's live sample to the selected range. */
  private readonly mult = computed(() => ({ Today: 1, 'Last 7 days': 6.4, 'Last 30 days': 26.8, 'This month': 13.2 })[this.range()] ?? 1);
  protected readonly barMax = computed(() => Math.max(100, ...(this.preview().bars ?? []).map((b) => b.max ?? b.value)));

  protected readonly preview = computed<Preview>(() => {
    const l = this.scoped();
    const now = this.store.now();
    const k = this.mult();
    const done = l.filter((t) => !isOpen(t));
    const late = done.filter((t) => (t.completedAt ?? 0) > t.due);
    const breached = l.filter((t) => isOpen(t) && t.due < now);
    const pct = (a: number, b: number) => Math.round((a / Math.max(b, 1)) * 100) + '%';
    const sc = (n: number) => Math.round(n * k).toLocaleString('en-US');
    switch (this.repId()) {
      case 'sla':
        return {
          kind: 'donut',
          segs: [
            { label: 'On time', value: Math.round((done.length - late.length) * k), color: 'var(--ka-22c55e)' },
            { label: 'Closed late', value: Math.round(late.length * k), color: 'var(--ka-f59e0b)' },
            { label: 'Open breach', value: breached.length, color: 'var(--ka-ef4444)' },
          ],
          stats: [['SLA compliance', pct(done.length - late.length, done.length + breached.length)], ['Closed late', sc(late.length)], ['Open breaches', String(breached.length)], ['Escalated', String(l.filter((t) => t.escalation).length)]],
          head: ['Task ID', 'Task', 'Category', 'Assignee', 'Due', 'Late by (min)', 'Escalation'],
          rows: [...breached.map((t) => [t.id, t.title, t.category, this.wn(t), hhmm(t.due), now - t.due, t.escalation ? 'L' + t.escalation : '—']), ...late.map((t) => [t.id, t.title, t.category, this.wn(t), hhmm(t.due), (t.completedAt ?? 0) - t.due, 'Closed late'])],
        };
      case 'escalation': {
        const esc = l.filter((t) => isOpen(t) && (t.escalation || t.due < now)).sort((a, b) => b.escalation - a.escalation || a.due - b.due);
        return {
          kind: 'column',
          labels: CAT_NAMES,
          series: [
            { name: 'Overdue', color: 'var(--ka-f59e0b)', values: CAT_NAMES.map((c) => esc.filter((t) => catOf(t.category) === c && !t.escalation).length) },
            { name: 'Escalated', color: 'var(--ka-ef4444)', values: CAT_NAMES.map((c) => esc.filter((t) => catOf(t.category) === c && t.escalation).length) },
          ],
          stats: [['Overdue open', String(esc.length)], ['Escalated L1', String(esc.filter((t) => t.escalation === 1).length)], ['Escalated L2', String(esc.filter((t) => t.escalation === 2).length)], ['Avg overdue', Math.round(esc.reduce((a, t) => a + Math.max(0, now - t.due), 0) / Math.max(esc.length, 1)) + ' min']],
          head: ['Task ID', 'Task', 'Site', 'Assignee', 'Due', 'Overdue (min)', 'Level'],
          rows: esc.map((t) => [t.id, t.title, t.site, this.wn(t), hhmm(t.due), Math.max(0, now - t.due), t.escalation ? 'L' + t.escalation : 'L0']),
        };
      }
      case 'checkpoint': {
        const cps = this.store.checkpoints().filter((c) => c.active);
        return {
          kind: 'bars',
          bars: cps.map((c) => ({ label: c.name, value: Math.min(100, Math.round((c.scans / c.expected) * 100)), display: `${c.scans}/${c.expected}`, color: c.scans >= c.expected * 0.6 ? 'var(--ka-22c55e)' : c.scans ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)' })).sort((a, b) => a.value - b.value).slice(0, 10),
          stats: [['Checkpoints', String(cps.length)], ['Scans', sc(cps.reduce((a, c) => a + c.scans, 0))], ['Expected', sc(cps.reduce((a, c) => a + c.expected, 0))], ['Never scanned', String(cps.filter((c) => !c.scans).length)]],
          head: ['Checkpoint', 'Zone', 'Technology', 'Scans', 'Expected', 'Compliance', 'Last scan', 'Last by'],
          rows: cps.map((c) => [c.name, TASK_ZONES.find((z) => z.id === c.zone)?.name ?? c.zone, c.tech, c.scans, c.expected, pct(c.scans, c.expected), c.lastScan >= 0 ? hhmm(c.lastScan) : '—', c.lastBy || '—']),
        };
      }
      case 'verification': {
        const v = l.filter((t) => t.status === 'Verified');
        const r = l.filter((t) => t.status === 'Rejected');
        const a = l.filter((t) => t.status === 'Completed');
        const sups = [...SUPERVISORS, 'Auto-approval'];
        return {
          kind: 'donut',
          segs: [
            { label: 'Verified', value: v.length, color: 'var(--ka-22c55e)' },
            { label: 'Rejected', value: r.length, color: 'var(--ka-ef4444)' },
            { label: 'Awaiting', value: a.length, color: 'var(--ka-c4b5fd)' },
          ],
          stats: [['Verified', sc(v.length)], ['Rejected', sc(r.length)], ['First-pass rate', pct(v.length, v.length + r.length)], ['Avg rating', (v.reduce((s, t) => s + (t.rating ?? 0), 0) / Math.max(v.length, 1)).toFixed(1) + '★']],
          head: ['Supervisor', 'Verified', 'Rejected', 'Approval rate', 'Avg rating'],
          rows: sups.map((s) => {
            const sv = v.filter((t) => t.verifiedBy === s);
            const sr = r.filter((t) => t.verifiedBy === s);
            return [s, sv.length, sr.length, pct(sv.length, sv.length + sr.length), sv.length ? (sv.reduce((x, t) => x + (t.rating ?? 0), 0) / sv.length).toFixed(1) : '—'];
          }),
        };
      }
      case 'productivity': {
        const per = WORKERS.map((w) => {
          const m = l.filter((t) => t.assignee === w.id);
          const d = m.filter((t) => !isOpen(t));
          const ot = d.filter((t) => (t.completedAt ?? 0) <= t.due).length;
          return { w, total: m.length, done: d.length, ot };
        }).filter((x) => x.total).sort((a, b) => b.done - a.done);
        return {
          kind: 'column',
          labels: per.slice(0, 10).map((x) => x.w.name.split(' ')[0]),
          series: [
            { name: 'Assigned', color: 'var(--ka-c4b5fd)', values: per.slice(0, 10).map((x) => Math.round(x.total * k)) },
            { name: 'Completed', color: 'var(--ka-7c3aed)', values: per.slice(0, 10).map((x) => Math.round(x.done * k)) },
          ],
          stats: [['Workers', String(per.length)], ['Tasks completed', sc(done.length)], ['Avg per worker', (done.length / Math.max(per.length, 1)).toFixed(1)], ['On-time', pct(done.length - late.length, done.length)]],
          head: ['Employee', 'Team', 'Assigned', 'Completed', 'Completion', 'On-time', 'Quality'],
          rows: per.map((x) => [x.w.name, x.w.team, Math.round(x.total * k), Math.round(x.done * k), pct(x.done, x.total), pct(x.ot, x.done), x.w.quality + '%']),
        };
      }
      case 'team': {
        const teams = [...new Set(WORKERS.map((w) => w.team))];
        const of = (team: string) => l.filter((t) => t.assignee && workerById(t.assignee)?.team === team);
        return {
          kind: 'column',
          labels: teams.map((t) => t.replace('Housekeeping Team', 'HK').replace(' Technicians', '').replace('IT Field Support', 'IT').replace(' Team', '').replace(' Crew', '')),
          series: [
            { name: 'Pending', color: 'var(--ka-a78bfa)', values: teams.map((t) => of(t).filter((x) => x.status === 'Pending').length) },
            { name: 'In progress', color: 'var(--ka-3b82f6)', values: teams.map((t) => of(t).filter((x) => x.status === 'In Progress').length) },
            { name: 'Completed', color: 'var(--ka-22c55e)', values: teams.map((t) => of(t).filter((x) => !isOpen(x)).length) },
          ],
          stats: [['Teams', String(teams.length)], ['Open tasks', String(l.filter(isOpen).length)], ['Unassigned', String(l.filter((t) => !t.assignee).length)], ['Workers', String(WORKERS.length)]],
          head: ['Team', 'Members', 'Pending', 'In progress', 'Completed', 'Open per member'],
          rows: teams.map((t) => {
            const m = WORKERS.filter((w) => w.team === t).length;
            const x = of(t);
            const open = x.filter(isOpen).length;
            return [t, m, x.filter((y) => y.status === 'Pending').length, x.filter((y) => y.status === 'In Progress').length, x.filter((y) => !isOpen(y)).length, (open / m).toFixed(1)];
          }),
        };
      }
      case 'template': {
        const tp = this.store.published().filter((t) => this.cat() === 'All' || catOf(t.category) === this.cat()).sort((a, b) => b.usage30 - a.usage30);
        return {
          kind: 'bars',
          bars: tp.slice(0, 10).map((t, i) => ({ label: t.name, value: t.usage30, display: String(t.usage30), color: i < 3 ? 'var(--ka-7c3aed)' : 'var(--ka-a78bfa)' })),
          stats: [['Published', String(tp.length)], ['Active', String(tp.filter((t) => t.status === 'Active').length)], ['Uses (30 d)', tp.reduce((a, t) => a + t.usage30, 0).toLocaleString('en-US')], ['Unused', String(tp.filter((t) => !t.usage30).length)]],
          head: ['Template', 'Category', 'Frequency', 'Duration', 'Uses (30 d)', 'Status'],
          rows: tp.map((t) => [t.name, t.category, t.frequency, t.duration + ' min', t.usage30, t.status]),
        };
      }
      default: {
        const created = this.range() === 'Today' ? null : USAGE_CREATED;
        const labels = created ? USAGE_LABELS : ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
        const f = this.site() === 'All Sites' && this.cat() === 'All' ? 1 : l.length / Math.max(this.store.tasks().length, 1);
        const cv = created ? USAGE_CREATED.map((v) => Math.round(v * f)) : labels.map((_, i) => l.filter((t) => t.start >= 360 + i * 120 && t.start < 480 + i * 120).length);
        const dv = created ? USAGE_DONE.map((v) => Math.round(v * f)) : labels.map((_, i) => l.filter((t) => t.completedAt != null && t.completedAt >= 360 + i * 120 && t.completedAt < 480 + i * 120).length);
        return {
          kind: 'line',
          labels,
          series: [
            { name: 'Created', color: 'var(--ka-7c3aed)', values: cv, area: true },
            { name: 'Completed', color: 'var(--ka-22c55e)', values: dv },
          ],
          stats: [['Created', sc(l.length)], ['Completed', sc(done.length)], ['Completion rate', pct(done.length, l.length)], ['Open now', String(l.filter(isOpen).length)]],
          head: ['Category', 'Created', 'Completed', 'Open', 'Completion', 'On-time'],
          rows: CAT_NAMES.map((c) => {
            const x = l.filter((t) => catOf(t.category) === c);
            const d = x.filter((t) => !isOpen(t));
            return [c, Math.round(x.length * k), Math.round(d.length * k), x.filter(isOpen).length, pct(d.length, x.length), pct(d.filter((t) => (t.completedAt ?? 0) <= t.due).length, d.length)];
          }).filter((r) => +r[1] > 0),
        };
      }
    }
  });

  private wn(t: TaskItem) {
    return workerById(t.assignee)?.name ?? 'Unassigned';
  }
  protected fav(id: string) {
    this.favs.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }
  private stamp() {
    return `14 Oct 2026, ${hhmm(this.store.now())}`;
  }
  protected run() {
    const p = this.preview();
    const id = `R-${312 + this.store.reports().length}`;
    const size = Math.max(24, p.rows.length * (this.fmt() === 'PDF' ? 9 : 3));
    this.store.reports.update((l) => [{ id, name: this.cur().name, format: this.fmt(), range: this.range() + (this.site() !== 'All Sites' ? ' · ' + this.site() : ''), by: 'Rex Kumar', at: this.stamp(), size: size > 1000 ? (size / 1000).toFixed(1) + ' MB' : size + ' KB' }, ...l]);
    this.say(`${this.cur().name} generated (${this.fmt()}) · ${p.rows.length} rows`);
  }
  protected exportCsv() {
    const p = this.preview();
    downloadCsv(`${this.cur().id}-report.csv`, [p.head, ...p.rows]);
    this.say(`${this.cur().name} exported to CSV`);
  }
  protected download(name: string) {
    const d = DEFS.find((x) => x.name === name);
    if (d) {
      const prev = this.repId();
      this.repId.set(d.id);
      const p = this.preview();
      downloadCsv(`${d.id}-report.csv`, [p.head, ...p.rows]);
      this.repId.set(prev);
    }
    this.say(`${name} downloaded`);
  }
  protected removeReport(id: string) {
    this.store.reports.update((l) => l.filter((r) => r.id !== id));
    this.say('Report file deleted');
  }
  protected openSchedule(name?: string) {
    this.sReport.set(name ?? this.cur().name);
    this.schedOpen.set(true);
  }
  protected saveSchedule() {
    const f = this.sFreq();
    const next = f === 'Daily' ? `15 Oct 2026, ${this.sTime()}` : f === 'Weekly' ? `Mon 19 Oct, ${this.sTime()}` : `01 Nov 2026, ${this.sTime()}`;
    const s: ReportSchedule = { id: `SCH-${String(this.store.schedules().length + 1).padStart(2, '0')}`, report: this.sReport(), frequency: f, time: this.sTime(), format: this.sFmt(), recipients: this.sTo(), next, active: true };
    this.store.schedules.update((l) => [s, ...l]);
    this.schedOpen.set(false);
    this.say(`${s.report} scheduled ${f.toLowerCase()} at ${s.time}`);
  }
  protected toggleSchedule(s: ReportSchedule, on: boolean) {
    this.store.schedules.update((l) => l.map((x) => (x.id === s.id ? { ...x, active: on } : x)));
    this.say(`${s.report} schedule ${on ? 'resumed' : 'paused'}`);
  }
  protected runSchedule(s: ReportSchedule) {
    this.store.reports.update((l) => [{ id: `R-${312 + l.length}`, name: s.report, format: s.format, range: s.frequency === 'Daily' ? '14 Oct 2026' : s.frequency === 'Weekly' ? 'Week 42' : 'Oct 2026', by: 'Scheduler', at: this.stamp(), size: '214 KB' }, ...l]);
    this.say(`${s.report} sent to ${s.recipients}`);
  }
  protected removeSchedule(id: string) {
    this.store.schedules.update((l) => l.filter((s) => s.id !== id));
    this.say('Schedule deleted');
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
