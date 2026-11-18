// Training › Reports & Analytics — hours, spend, completion & compliance trends, skill gaps, report catalog with CSV export & scheduling.
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Series, UI } from '../../shared/ui';
import { TrnPage } from './training-ui';
import {
  certStatus, COMPLETION_TREND, COMPLIANCE_TREND, CT, daysUntil, DEPT_COUNT, DEPTS, downloadCsv, HOURS_BY_MONTH, iso, MATRIX_SEED, MONTHS_12, REQS, SchedReport, TOTAL_EMPLOYEES,
} from './training.data';

type Range = 'Last 12 months' | 'Last 6 months' | 'Last 3 months';
const RANGE_N: Record<Range, number> = { 'Last 12 months': 12, 'Last 6 months': 6, 'Last 3 months': 3 };
const MODE_SPLIT = [
  { name: 'Classroom', color: 'var(--ka-7c3aed)', share: [0.44, 0.43, 0.41, 0.42, 0.4, 0.41, 0.39, 0.38, 0.4, 0.41, 0.39, 0.38] },
  { name: 'E-learning', color: 'var(--ka-3b82f6)', share: [0.26, 0.27, 0.28, 0.27, 0.29, 0.29, 0.31, 0.32, 0.3, 0.3, 0.31, 0.33] },
  { name: 'Blended', color: 'var(--ka-f59e0b)', share: [0.18, 0.18, 0.19, 0.19, 0.18, 0.18, 0.18, 0.18, 0.18, 0.17, 0.18, 0.17] },
  { name: 'On-the-job', color: 'var(--ka-22c55e)', share: [0.12, 0.12, 0.12, 0.12, 0.13, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12] },
];
/** Training intensity per department relative to head-count share. */
const DEPT_INTENSITY: Record<string, number> = { Operations: 1.05, Maintenance: 1.35, Security: 1.1, Logistics: 1.0, Facilities: 0.8, HSE: 1.6, Production: 0.95, Administration: 0.45 };
const COST_PER_HOUR = 21.5;
const SPEND_CAT = [
  { label: 'Safety', share: 0.46, color: 'var(--ka-ef4444)' },
  { label: 'Technical', share: 0.31, color: 'var(--ka-7c3aed)' },
  { label: 'Soft Skills', share: 0.15, color: 'var(--ka-3b82f6)' },
  { label: 'Compliance', share: 0.08, color: 'var(--ka-0d9488)' },
];
const QUARTER_BUDGET = [148000, 156000, 152000, 164000];

interface ReportDef {
  id: string;
  name: string;
  cat: 'Training' | 'Compliance' | 'Skills' | 'Finance';
  icon: string;
  color: string;
  desc: string;
  last: string;
}
const REPORTS: ReportDef[] = [
  { id: 'hours', name: 'Training Hours Summary', cat: 'Training', icon: 'clock', color: 'var(--ka-7c3aed)', desc: 'Monthly learning hours by delivery mode and department.', last: iso(-1) },
  { id: 'spend', name: 'Training Spend by Category', cat: 'Finance', icon: 'chart-line', color: 'var(--ka-0d9488)', desc: 'Actual spend vs budget by month, category and cost centre.', last: iso(-6) },
  { id: 'completion', name: 'Course Completion Report', cat: 'Training', icon: 'training-check', color: 'var(--ka-22c55e)', desc: 'All enrolments with status, progress, due date and score.', last: iso(0) },
  { id: 'compliance', name: 'Mandatory Compliance Report', cat: 'Compliance', icon: 'shield-check', color: 'var(--ka-16a34a)', desc: 'Compliance % and open gaps for every regulatory requirement.', last: iso(-3) },
  { id: 'gaps', name: 'Non-Compliance Detail', cat: 'Compliance', icon: 'triangle-alert', color: 'var(--ka-ef4444)', desc: 'Employee-level list of open gaps with reason and age.', last: iso(-3) },
  { id: 'expiry', name: 'Certification Expiry (90 days)', cat: 'Compliance', icon: 'id-card', color: 'var(--ka-f59e0b)', desc: 'Certificates and licences expiring in the next 90 days.', last: iso(-1) },
  { id: 'gap', name: 'Skill Gap Analysis', cat: 'Skills', icon: 'training-target', color: 'var(--ka-db2777)', desc: 'Employees below required proficiency per skill with linked course.', last: iso(-14) },
  { id: 'matrix', name: 'Competency Matrix Export', cat: 'Skills', icon: 'training-matrix', color: 'var(--ka-4f46e5)', desc: 'Full skills matrix with levels for every tracked employee.', last: iso(-8) },
  { id: 'assess', name: 'Assessment Results', cat: 'Skills', icon: 'training-quiz', color: 'var(--ka-2563eb)', desc: 'Quiz attempts, scores and pass / fail outcomes.', last: iso(-2) },
  { id: 'paths', name: 'Learning Path Progress', cat: 'Training', icon: 'workflow', color: 'var(--ka-ca8a04)', desc: 'Learner progress through each structured learning path.', last: iso(-10) },
  { id: 'trainer', name: 'Trainer & Session Utilisation', cat: 'Training', icon: 'users', color: 'var(--ka-475569)', desc: 'Upcoming sessions, seats booked and fill rate per trainer.', last: iso(-5) },
  { id: 'record', name: 'Individual Training Record', cat: 'Training', icon: 'file-text', color: 'var(--ka-6d28d9)', desc: 'Complete history of courses, certificates and skills for one employee.', last: iso(-4) },
];

@Component({
  selector: 'app-training-reports-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Analytics" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Training hours, spend, completion and compliance trends, skill gaps and exportable reports.">
      <select class="select" [value]="range()" (change)="range.set($any($event.target).value)">@for (r of ranges; track r) {<option>{{ r }}</option>}</select>
      <select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)"><option>All Departments</option>@for (d of depts; track d) {<option>{{ d }}</option>}</select>
      <button class="btn-primary" (click)="exportDashboard()"><app-icon name="download" [size]="16" />Export CSV</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Training Hours" [value]="fmt(k().hours)" icon="clock" color="var(--ka-7c3aed)" [change]="k().hoursChg + '%'" [up]="k().hoursChg >= 0" sub="vs. prior period" />
      <app-kpi label="Training Spend" [value]="'$' + fmt(k().spend)" icon="chart-line" color="var(--ka-0d9488)" [sub]="k().budgetPct + '% of budget · $' + k().cph + '/hour'" [subColor]="k().budgetPct > 100 ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Completion Rate" [value]="k().completion + '%'" icon="training-check" color="var(--ka-22c55e)" [change]="k().compChg + ' pts'" sub="vs. start of period" />
      <app-kpi label="Hours / Employee" [value]="k().perEmp" icon="users" color="var(--ka-3b82f6)" [sub]="fmt(k().heads) + ' employees in scope'" />
      <app-kpi label="Compliance" [value]="store.compliancePct() + '%'" icon="shield-check" color="var(--ka-f59e0b)" sub="live · target 95%" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Training Hours by Delivery Mode</h3><span class="muted">{{ dept() }} · {{ range() }}</span></div>
        <app-column-chart [labels]="labels()" [series]="hoursSeries()" [stacked]="true" [height]="240" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Spend by Category</h3><span class="muted">{{ '$' + fmt(k().spend) }}</span></div>
        <app-donut [segments]="spendCat()" center="Spend" [value]="'$' + short(k().spend)" [size]="150" />
      </div>
    </section>

    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Completion & Compliance</h3><span class="muted">%</span></div>
        <app-line-chart [labels]="labels()" [series]="trendSeries()" [height]="220" [min]="70" [max]="100" suffix="%" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Top Skill Gaps</h3><button class="link" (click)="go('skills-competency-matrix')">Matrix</button></div>
        <app-bar-list [rows]="gapRows()" [max]="gapRows()[0]?.value || 1" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Hours by Department</h3><span class="muted">click to filter</span></div>
        <ul class="hd">
          @for (d of deptHours(); track d.dept) {
            <li [class.on]="dept() === d.dept" (click)="dept.set(dept() === d.dept ? 'All Departments' : d.dept)">
              <span>{{ d.dept }}</span><span class="hb"><i [style.width.%]="(d.hours / deptMax()) * 100"></i></span><b>{{ fmt(d.hours) }}</b><small>{{ d.per }} h/emp</small>
            </li>
          }
        </ul>
      </div>
    </section>

    <section class="dash">
      <div class="card span-5">
        <div class="card-head"><h3>Budget vs Actual</h3><span class="muted">by quarter · USD</span></div>
        <app-column-chart [labels]="quarters" [series]="budgetSeries()" [height]="220" />
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Top Courses</h3><span class="muted">by enrolments</span></div>
        <table class="table tc">
          <thead><tr><th>Course</th><th>Category</th><th class="num">Enrolled</th><th class="num">Completed</th><th class="num">Avg score</th><th class="num">Spend</th></tr></thead>
          <tbody>
            @for (c of topCourses(); track c.id) {
              <tr><td><span class="cd" [style.background]="c.color"></span>{{ c.title }}</td><td><span class="tag grey">{{ c.category }}</span></td><td class="num">{{ c.n }}</td>
                <td class="num">{{ c.done }} <small>({{ c.rate }}%)</small></td><td class="num">{{ c.avg ? c.avg + '%' : '—' }}</td><td class="num">{{ '$' + fmt(c.spend) }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="rep">
      <div class="card">
        <div class="card-head">
          <h3>Report Catalog <span class="card-sub">{{ shown().length }} reports</span></h3>
          <div class="rbar">
            <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search reports..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <div class="tabs">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
          </div>
        </div>
        <div class="rg">
          @for (r of shown(); track r.id) {
            <article class="rc">
              <div class="rh">
                <span class="ri" [style.background]="'color-mix(in srgb, ' + r.color + ' 11%, transparent)'" [style.color]="r.color"><app-icon [name]="r.icon" [size]="18" /></span>
                <div><b>{{ r.name }}</b><small>{{ r.cat }} · last run {{ fd(lastRun()[r.id] ?? r.last) }}@if (isScheduled(r.id)) { · <em class="sch">scheduled</em>}</small></div>
                <button class="star" [class.on]="favs().includes(r.id)" (click)="toggleFav(r.id)" [title]="favs().includes(r.id) ? 'Unpin' : 'Pin'">★</button>
              </div>
              <p>{{ r.desc }}</p>
              <div class="ra">
                <button class="btn-ghost sm" (click)="preview(r)"><app-icon name="eye" [size]="14" />Preview</button>
                <button class="btn-ghost sm" (click)="openSchedule(r)"><app-icon name="calendar-days" [size]="14" />Schedule</button>
                <button class="btn-primary btn-sm" (click)="download(r)"><app-icon name="download" [size]="14" />CSV</button>
              </div>
            </article>
          } @empty {<p class="muted">No reports match.</p>}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Scheduled Reports</h3><span class="muted">{{ activeSched() }} active</span></div>
        <ul class="sl">
          @for (s of store.scheduled(); track s.id) {
            <li [class.off]="!s.active">
              <div><b>{{ rep(s.reportId).name }}</b><small>{{ s.frequency }} · {{ s.format }} · {{ s.recipients }}</small><small>{{ s.active ? 'Next run ' + fd(s.next) : 'Paused' }}</small></div>
              <div class="sa">
                <button class="link" (click)="runNow(s)">Run</button>
                <button class="link" (click)="toggleSched(s)">{{ s.active ? 'Pause' : 'Resume' }}</button>
                <button class="link danger" (click)="removeSched(s)">Remove</button>
              </div>
            </li>
          } @empty {<li class="muted">No scheduled reports.</li>}
        </ul>
      </div>
    </section>

    @if (pv(); as r) {
      @let data = build(r.id);
      <div class="g-overlay" (click)="pv.set(null)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><div><h3>{{ r.name }}</h3><small class="muted">{{ fmt(data.length - 1) }} rows · generated {{ fd(today) }} · {{ dept() }}</small></div><button class="close-btn" (click)="pv.set(null)">×</button></div>
        @if (r.id === 'record') {
          <label class="emp">Employee<select class="select" [value]="recEmp()" (change)="recEmp.set($any($event.target).value)">@for (e of matrixEmps; track e.id) {<option [value]="e.id">{{ e.name }} · {{ e.id }}</option>}</select></label>
        }
        <div class="pvw">
          <table class="table">
            <thead><tr>@for (h of data[0]; track $index) {<th>{{ h }}</th>}</tr></thead>
            <tbody>@for (row of data.slice(1, 16); track $index) {<tr>@for (c of row; track $index) {<td>{{ c }}</td>}</tr>}</tbody>
          </table>
        </div>
        @if (data.length > 16) {<p class="muted">Showing 15 of {{ fmt(data.length - 1) }} rows — download for the full report.</p>}
        <div class="form-actions"><button class="btn-ghost" (click)="openSchedule(r)">Schedule</button><button class="btn-primary" (click)="download(r)"><app-icon name="download" [size]="15" />Download CSV</button></div>
      </div>
    }

    @if (sf(); as f) {
      <div class="g-overlay" (click)="sf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule · {{ rep(f.reportId).name }}</h3><button type="button" class="close-btn" (click)="sf.set(null)">×</button></div>
        <div class="form-grid">
          <label>Frequency<select class="select" [value]="f.frequency" (change)="sf.set({ ...f, frequency: $any($event.target).value })">@for (x of freqs; track x) {<option>{{ x }}</option>}</select></label>
          <label>Format<select class="select" [value]="f.format" (change)="sf.set({ ...f, format: $any($event.target).value })"><option>CSV</option><option>Excel</option><option>PDF</option></select></label>
          <label class="full">Recipients *<input class="input" [value]="f.recipients" (input)="sf.set({ ...f, recipients: $any($event.target).value })" placeholder="name@company.com, team@company.com" /></label>
          <label>First run<input class="input" type="date" [value]="f.next" (change)="sf.set({ ...f, next: $any($event.target).value })" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sf.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host ::ng-deep app-page-head .select { min-width: 150px; }
    .hd { list-style: none; margin: 0; padding: 0; }
    .hd li { display: grid; grid-template-columns: 100px 1fr 54px 64px; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .hd li:hover, .hd li.on { background: var(--primary-soft); } .hd b { text-align: right; } .hd small { color: var(--muted); font-size: 10.5px; text-align: right; }
    .hb { height: 7px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .hb i { display: block; height: 100%; background: linear-gradient(90deg, var(--kb-8b5cf6), var(--kb-6d28d9)); }
    .tc { font-size: 12.5px; border-collapse: collapse; } .tc th { text-align: left; font-weight: 500; color: var(--muted); font-size: 11.5px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .tc td { padding: 7px 8px; border-bottom: 1px solid var(--kl-f0f1f6); } .tc .num { text-align: right; } .tc small { color: var(--muted); }
    .cd { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
    .rep { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .rbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .rg { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .rc { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: box-shadow .15s; } .rc:hover { box-shadow: 0 4px 14px rgba(40, 30, 90, .08); }
    .rh { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .rh > div { display: flex; flex-direction: column; min-width: 0; } .rh b { font-size: 13px; } .rh small { color: var(--muted); font-size: 11px; }
    .ri { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; }
    .star { border: 0; background: none; font-size: 17px; color: var(--kf-d8dbe6); cursor: pointer; } .star.on { color: var(--kf-f59e0b); }
    .rc p { margin: 0; font-size: 12px; color: var(--kf-4b4f6b); flex: 1; }
    .ra { display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: wrap; } .sch { font-style: normal; color: var(--kf-2563eb); font-weight: 600; } .rh b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ra button { display: inline-flex; align-items: center; gap: 4px; }
    .sl { list-style: none; margin: 0; padding: 0; } .sl li { display: flex; justify-content: space-between; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .sl li.off { opacity: .55; } .sl li > div:first-child { display: flex; flex-direction: column; min-width: 0; } .sl small { color: var(--muted); font-size: 11px; }
    .sa { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; } .danger { color: var(--red) !important; }
    .pvw { overflow: auto; max-height: 52vh; border: 1px solid var(--border); border-radius: 8px; }
    .pvw table { border-collapse: collapse; font-size: 12px; } .pvw th { position: sticky; top: 0; background: var(--kb-f7f7fb); text-align: left; padding: 7px 9px; font-weight: 600; white-space: nowrap; }
    .pvw td { padding: 6px 9px; border-top: 1px solid var(--kl-f0f1f6); white-space: nowrap; }
    .emp { display: flex; flex-direction: column; gap: 4px; font-size: 12px; max-width: 320px; margin-bottom: 10px; }
    @media (max-width: 1250px) { .rep { grid-template-columns: 1fr; } }
  `,
})
export class TrnReportsAnalytics extends TrnPage {
  protected readonly ranges: Range[] = ['Last 12 months', 'Last 6 months', 'Last 3 months'];
  protected readonly depts = DEPTS;
  protected readonly quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  protected readonly cats = ['All', 'Training', 'Compliance', 'Skills', 'Finance', 'Pinned'];
  protected readonly freqs = ['Daily', 'Weekly (Mon)', 'Fortnightly', 'Monthly (1st)', 'Quarterly'];
  protected readonly matrixEmps = MATRIX_SEED;
  protected readonly today = iso(0);
  protected readonly range = signal<Range>('Last 12 months');
  protected readonly dept = signal('All Departments');
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly favs = signal<string[]>(['compliance', 'expiry']);
  protected readonly lastRun = signal<Record<string, string>>({});
  protected readonly recEmp = signal('EMP-001');
  protected readonly err = signal('');
  protected short(v: number) {
    return v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'K';
  }

  /* ---------- scope ---------- */
  private readonly n = computed(() => RANGE_N[this.range()]);
  protected readonly labels = computed(() => MONTHS_12.slice(12 - this.n()));
  private readonly deptShare = (d: string) => (DEPT_COUNT[d] * DEPT_INTENSITY[d]) / DEPTS.reduce((a, x) => a + DEPT_COUNT[x] * DEPT_INTENSITY[x], 0);
  private readonly factor = computed(() => (this.dept() === 'All Departments' ? 1 : this.deptShare(this.dept())));
  private readonly hours = computed(() => HOURS_BY_MONTH.map((h) => Math.round(h * this.factor())));
  private readonly heads = computed(() => (this.dept() === 'All Departments' ? TOTAL_EMPLOYEES : DEPT_COUNT[this.dept()]));

  protected readonly k = computed(() => {
    const n = this.n();
    const h = this.hours();
    const cur = h.slice(12 - n).reduce((a, x) => a + x, 0);
    const prevSlice = n === 12 ? h.map((x) => x * 0.9) : h.slice(12 - 2 * n, 12 - n);
    const prev = prevSlice.reduce((a, x) => a + x, 0);
    const spend = Math.round(cur * COST_PER_HOUR);
    const budget = (QUARTER_BUDGET.reduce((a, x) => a + x, 0) * n) / 12 * this.factor();
    const comp = COMPLETION_TREND.slice(12 - n);
    return {
      hours: cur, hoursChg: Math.round(((cur - prev) / (prev || 1)) * 100), spend, budgetPct: Math.round((spend / budget) * 100),
      completion: comp[comp.length - 1], compChg: comp[comp.length - 1] - comp[0], heads: this.heads(),
      perEmp: (cur / this.heads()).toFixed(1), cph: COST_PER_HOUR.toFixed(2),
    };
  });
  protected readonly hoursSeries = computed<Series[]>(() => {
    const n = this.n();
    return MODE_SPLIT.map((m) => ({ name: m.name, color: m.color, values: this.hours().slice(12 - n).map((h, i) => Math.round(h * m.share[12 - n + i])) }));
  });
  protected readonly spendCat = computed(() => SPEND_CAT.map((c) => ({ label: c.label, value: Math.round(this.k().spend * c.share), color: c.color })));
  protected readonly trendSeries = computed<Series[]>(() => {
    const n = this.n();
    return [
      { name: 'Completion', color: 'var(--ka-22c55e)', area: true, values: COMPLETION_TREND.slice(12 - n) },
      { name: 'Compliance', color: 'var(--ka-7c3aed)', values: [...COMPLIANCE_TREND.slice(0, 11), this.store.compliancePct()].slice(12 - n) },
      { name: 'Target', color: 'var(--ka-94a3b8)', dashed: true, values: Array(n).fill(95) },
    ];
  });
  protected readonly gapRows = computed(() =>
    this.store.gaps().filter((g) => g.gaps > 0).slice(0, 8).map((g) => ({ label: g.name, value: Math.round(g.gaps * (this.dept() === 'All Departments' ? 1 : Math.max(0.15, this.factor() * 2.2))), color: g.color })),
  );
  protected readonly deptHours = computed(() => {
    const tot = HOURS_BY_MONTH.slice(12 - this.n()).reduce((a, x) => a + x, 0);
    return DEPTS.map((d) => {
      const hours = Math.round(tot * this.deptShare(d));
      return { dept: d, hours, per: (hours / DEPT_COUNT[d]).toFixed(1) };
    }).sort((a, b) => b.hours - a.hours);
  });
  protected readonly deptMax = computed(() => Math.max(...this.deptHours().map((d) => d.hours)));
  protected readonly budgetSeries = computed<Series[]>(() => {
    const h = HOURS_BY_MONTH;
    const f = this.factor();
    const actual = [0, 1, 2, 3].map((q) => Math.round(h.slice(q * 3, q * 3 + 3).reduce((a, x) => a + x, 0) * COST_PER_HOUR * f));
    return [{ name: 'Budget', color: 'var(--ka-c4b5fd)', values: QUARTER_BUDGET.map((b) => Math.round(b * f)) }, { name: 'Actual', color: 'var(--ka-7c3aed)', values: actual }];
  });
  protected readonly topCourses = computed(() => {
    const d = this.dept();
    const m = new Map<string, { n: number; done: number; sc: number[] }>();
    for (const e of this.store.enrollments()) {
      if (d !== 'All Departments' && this.person(e.empId).dept !== d) continue;
      const g = m.get(e.courseId) ?? { n: 0, done: 0, sc: [] };
      g.n++;
      if (e.status === 'Completed') {
        g.done++;
        if (e.score) g.sc.push(e.score);
      }
      m.set(e.courseId, g);
    }
    return [...m.entries()]
      .map(([id, g]) => {
        const c = this.course(id)!;
        return { id, title: c.title, category: c.category, color: c.color, n: g.n, done: g.done, rate: Math.round((g.done / g.n) * 100), avg: g.sc.length ? Math.round(g.sc.reduce((a, x) => a + x, 0) / g.sc.length) : 0, spend: g.n * c.cost };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 7);
  });

  /* ---------- report catalog ---------- */
  protected rep(id: string) {
    return REPORTS.find((r) => r.id === id) ?? REPORTS[0];
  }
  protected readonly shown = computed(() => {
    const q = this.q().toLowerCase().trim();
    const c = this.cat();
    return REPORTS.filter((r) => (c === 'All' || (c === 'Pinned' ? this.favs().includes(r.id) : r.cat === c)) && (!q || `${r.name} ${r.desc}`.toLowerCase().includes(q))).sort(
      (a, b) => +this.favs().includes(b.id) - +this.favs().includes(a.id),
    );
  });
  protected toggleFav(id: string) {
    this.favs.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }
  protected isScheduled(id: string) {
    return this.store.scheduled().some((s) => s.reportId === id && s.active);
  }
  protected readonly activeSched = computed(() => this.store.scheduled().filter((s) => s.active).length);
  private inDept(empId: string) {
    return this.dept() === 'All Departments' || this.person(empId).dept === this.dept();
  }
  /** Builds a report as CSV-ready rows (header first) from the live store. */
  protected build(id: string): (string | number)[][] {
    const s = this.store;
    const n = this.n();
    switch (id) {
      case 'hours':
        return [['Month', ...MODE_SPLIT.map((m) => m.name), 'Total'], ...this.labels().map((m, i) => [m, ...this.hoursSeries().map((x) => x.values[i]), this.hours()[12 - n + i]])];
      case 'spend':
        return [['Month', ...SPEND_CAT.map((c) => c.label), 'Total (USD)'], ...this.labels().map((m, i) => {
          const t = Math.round(this.hours()[12 - n + i] * COST_PER_HOUR);
          return [m, ...SPEND_CAT.map((c) => Math.round(t * c.share)), t];
        })];
      case 'completion':
        return [['Enrolment', 'Employee ID', 'Employee', 'Department', 'Course', 'Status', 'Progress %', 'Due', 'Score', 'Source'],
          ...s.enrollments().filter((e) => this.inDept(e.empId)).map((e) => [e.id, e.empId, this.person(e.empId).name, this.person(e.empId).dept, this.course(e.courseId)?.title ?? e.courseId, e.status, e.progress, e.due, e.score ?? '', e.source])];
      case 'compliance': {
        const nc = s.ncRows();
        return [['Requirement', 'Regulation', 'Applies To', 'Frequency', 'Owner', 'Required', 'Open Gaps', 'Compliance %'],
          ...REQS.map((r) => {
            const g = nc.filter((x) => x.reqId === r.id).length;
            return [r.name, r.regulation, r.appliesTo, r.frequency, r.owner, r.required, g, Math.round((1 - g / r.required) * 1000) / 10];
          })];
      }
      case 'gaps':
        return [['Employee ID', 'Employee', 'Department', 'Requirement', 'Gap', 'Since', 'Days Open'],
          ...s.ncRows().filter((x) => this.inDept(x.empId)).map((x) => [x.empId, this.person(x.empId).name, this.person(x.empId).dept, s.reqById.get(x.reqId)!.name, x.reason, x.since, -daysUntil(x.since)])];
      case 'expiry':
        return [['Certificate ID', 'Employee ID', 'Employee', 'Department', 'Certificate', 'Number', 'Expiry', 'Days Left', 'Status'],
          ...s.certs().filter((c) => !c.revoked && daysUntil(c.expiry) <= 90 && this.inDept(c.empId)).sort((a, b) => a.expiry.localeCompare(b.expiry))
            .map((c) => [c.id, c.empId, this.person(c.empId).name, this.person(c.empId).dept, CT.get(c.typeId)!.name, c.number, c.expiry, daysUntil(c.expiry), certStatus(c)])];
      case 'gap':
        return [['Skill', 'Category', 'Required Level', 'Employees Below', 'Linked Course'], ...s.gaps().map((g) => [g.name, g.category, g.required, g.gaps, this.course(g.courseId)?.title ?? ''])];
      case 'matrix': {
        const sk = s.skills();
        return [['Employee ID', 'Employee', 'Role', 'Department', ...sk.map((x) => x.name)], ...s.emps().filter((e) => this.inDept(e.id)).map((e) => [e.id, e.name, e.role, e.dept, ...sk.map((x) => e.levels[x.id] ?? 'N/A')])];
      }
      case 'assess':
        return [['Attempt', 'Employee ID', 'Employee', 'Assessment', 'Score', 'Result', 'Date', 'Minutes'],
          ...s.attempts().filter((a) => this.inDept(a.empId)).map((a) => [a.id, a.empId, this.person(a.empId).name, s.quizzes().find((q) => q.id === a.quizId)?.title ?? a.quizId, a.score, a.passed ? 'Passed' : 'Failed', a.at, a.mins])];
      case 'paths':
        return [['Path', 'Employee ID', 'Employee', 'Steps Done', 'Total Steps', 'Progress %', 'Started'],
          ...s.paths().flatMap((p) => p.learners.filter((l) => this.inDept(l.empId)).map((l) => [p.name, l.empId, this.person(l.empId).name, l.done, p.steps.length, Math.round((l.done / p.steps.length) * 100), l.started]))];
      case 'trainer':
        return [['Session', 'Date', 'Time', 'Course', 'Trainer', 'Location', 'Seats', 'Booked', 'Fill %'],
          ...s.sessions().map((x) => [x.id, x.date, x.time, this.course(x.courseId)?.title ?? x.courseId, x.trainer, x.location, x.seats, x.booked, Math.round((x.booked / x.seats) * 100)])];
      default: {
        const e = this.recEmp();
        const emp = s.empById().get(e);
        return [['Type', 'Item', 'Status / Level', 'Date', 'Detail'],
          ...s.enrollOf(e).map((x) => ['Course', this.course(x.courseId)?.title ?? x.courseId, x.status, x.due, x.score ? `Score ${x.score}%` : `${x.progress}%`]),
          ...s.certsOf(e).map((c) => ['Certificate', CT.get(c.typeId)!.name, certStatus(c), c.expiry, c.number]),
          ...(emp ? s.skills().filter((k) => emp.levels[k.id] !== null && emp.levels[k.id] !== undefined).map((k) => ['Skill', k.name, `Level ${emp.levels[k.id]}`, '', k.category]) : [])];
      }
    }
  }
  protected readonly pv = signal<ReportDef | null>(null);
  protected preview(r: ReportDef) {
    this.pv.set(r);
  }
  protected download(r: ReportDef) {
    const rows = this.build(r.id);
    const suffix = r.id === 'record' ? '-' + this.recEmp() : this.dept() !== 'All Departments' ? '-' + this.dept().toLowerCase() : '';
    downloadCsv(`${r.id}-report${suffix}-${iso(0)}.csv`, rows);
    this.lastRun.update((m) => ({ ...m, [r.id]: iso(0) }));
    this.msg(`${r.name} downloaded · ${rows.length - 1} rows`);
  }

  /* ---------- scheduling ---------- */
  protected readonly sf = signal<SchedReport | null>(null);
  protected openSchedule(r: ReportDef) {
    this.err.set('');
    this.pv.set(null);
    this.sf.set({ id: '', reportId: r.id, frequency: 'Weekly (Mon)', recipients: 'training-team@people360.com', format: 'CSV', next: iso(1), active: true });
  }
  protected saveSchedule() {
    const f = this.sf()!;
    const bad = f.recipients.split(',').map((x) => x.trim()).filter((x) => x && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!f.recipients.trim() || bad.length) return this.err.set(bad.length ? `Invalid e-mail: ${bad[0]}` : 'Add at least one recipient.');
    this.store.scheduled.update((l) => [{ ...f, id: `SR-${l.length + 1}-${Date.now() % 1000}` }, ...l]);
    this.sf.set(null);
    this.msg(`${this.rep(f.reportId).name} scheduled · ${f.frequency} to ${f.recipients}`);
  }
  protected toggleSched(s: SchedReport) {
    this.store.scheduled.update((l) => l.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    this.msg(`${this.rep(s.reportId).name} ${s.active ? 'paused' : 'resumed'}`);
  }
  protected removeSched(s: SchedReport) {
    this.store.scheduled.update((l) => l.filter((x) => x.id !== s.id));
    this.msg('Schedule removed');
  }
  protected runNow(s: SchedReport) {
    const rows = this.build(s.reportId);
    this.lastRun.update((m) => ({ ...m, [s.reportId]: iso(0) }));
    this.msg(`${this.rep(s.reportId).name} (${rows.length - 1} rows, ${s.format}) sent to ${s.recipients}`);
  }

  /* ---------- dashboard export ---------- */
  protected exportDashboard() {
    const k = this.k();
    const rows: (string | number)[][] = [
      ['Section', 'Metric', 'Value'],
      ['Scope', 'Range', this.range()], ['Scope', 'Department', this.dept()],
      ['KPI', 'Training hours', k.hours], ['KPI', 'Training spend (USD)', k.spend], ['KPI', 'Budget used %', k.budgetPct], ['KPI', 'Completion rate %', k.completion],
      ['KPI', 'Hours per employee', k.perEmp], ['KPI', 'Mandatory compliance %', this.store.compliancePct()],
      ...this.labels().map((m, i) => ['Hours by month', m, this.hours()[12 - this.n() + i]]),
      ...this.spendCat().map((c) => ['Spend by category', c.label, c.value]),
      ...this.deptHours().map((d) => ['Hours by department', d.dept, d.hours]),
      ...this.gapRows().map((g) => ['Skill gaps', g.label, g.value]),
      ...this.topCourses().map((c) => ['Top courses', c.title, c.n]),
    ];
    downloadCsv(`training-analytics-${iso(0)}.csv`, rows);
    this.msg('Dashboard exported to CSV');
  }
}
