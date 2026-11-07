import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Series, UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import {
  ABSENTEEISM, AiStore, Anomaly, ANOMALY_POOL, ATTENDANCE, ATTENDANCE_RATE, CAPACITY, CONTRACTOR_TREND, DAYS, DEMAND, DEPTS, EMPLOYEES, Employee,
  FORECAST_WEEKS, fmtN, HEADCOUNT_TREND, MODELS, MONTHS, OT_HEAT, OVERTIME_TREND, pct, shortDay, TOTAL_EMPLOYEES, TOTAL_OVERTIME, WEEKS,
} from './ai.data';

/** Queue a question for the copilot page and open it. */
function askCopilot(store: AiStore, router: Router, q: string) {
  store.pending.set(q);
  router.navigateByUrl('/ai-people-intelligence/people360-ai-copilot');
}
const flashFn = (sig: ReturnType<typeof signal<string | null>>) => (m: string) => {
  sig.set(m);
  setTimeout(() => sig.set(null), 2400);
};

/* =====================================================================================
 * Workforce Insights
 * ===================================================================================== */
const PERIOD_F: Record<string, number> = { 'This Week': 1, 'This Month': 4.3, 'This Quarter': 13 };
const METRICS = ['Headcount', 'Attendance %', 'Overtime', 'Absenteeism'] as const;
const FEED = [
  { icon: 'ai-chart-up', color: '#ef4444', title: 'Overtime is accelerating', text: 'Operations overtime is 31% above baseline; 42 people exceeded 12 h this week.', conf: 94, q: 'Which department has the highest overtime?' },
  { icon: 'ai-clock-alert', color: '#f59e0b', title: 'Sales attendance slipping', text: 'Sales attendance fell to 81.6% (company 86.7%). Late arrivals doubled this month.', conf: 89, q: 'Show late arrivals in Sales' },
  { icon: 'heart', color: '#db2777', title: '23 employees at flight risk', text: 'Risk concentrated in Operations (8) and Logistics (4); overtime is the top driver.', conf: 82, q: 'Who is at risk of leaving?' },
  { icon: 'users', color: '#3b82f6', title: 'Contractor growth +12%', text: 'Contractors rose to 349 for the Q4 peak — mostly Warehouse logistics crews.', conf: 97, q: 'How many contractors this month?' },
  { icon: 'id-card', color: '#8b5cf6', title: '8 certifications expiring', text: '3 of them gate Warehouse site access. Renew within 2 weeks to avoid gaps.', conf: 99, q: 'List employees with expiring certifications' },
];

@Component({
  selector: 'app-ai-workforce-insights',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workforce Insights" parent="AI &amp; People Intelligence" parentLink="/ai-people-intelligence" subtitle="AI-generated insights on headcount, attendance, overtime, engagement and risk across every department.">
      <select class="select" [value]="period()" (change)="period.set($any($event.target).value)">@for (p of periods; track p) {<option [value]="p">{{ p }}</option>}</select>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="ask('Summarise workforce insights for ' + period().toLowerCase())"><app-icon name="sparkles" [size]="16" />Ask Copilot</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Headcount" [value]="fmt(total)" icon="users" color="#8b5cf6" change="6.1%" sub="vs. last year" />
      <app-kpi label="Attendance Rate" [value]="attRate + '%'" icon="clock" color="#22c55e" change="0.6 pt" [up]="false" [good]="false" sub="vs. last week" />
      <app-kpi label="Overtime Hours" [value]="fmt(ot() )" icon="ai-chart-up" color="#f97316" change="8%" [good]="false" [sub]="'vs. previous ' + unit()" />
      <app-kpi label="Engagement Score" value="76/100" icon="heart" color="#3b82f6" change="2 pts" sub="vs. last pulse" />
      <app-kpi label="High Attrition Risk" value="23" icon="triangle-alert" color="#ef4444" sub="employees above 60% risk" subColor="#dc2626" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Workforce Trend <span class="card-sub">{{ metric() === 'Headcount' ? 'last 12 months' : 'last 12 weeks' }}</span></h3>
          <div class="seg">@for (m of metrics; track m) {<button [class.on]="metric() === m" (click)="metric.set(m)">{{ m }}</button>}</div>
        </div>
        <app-line-chart [labels]="trend().labels" [series]="trend().series" [height]="320" [suffix]="trend().suffix" />
        <p class="ai-note"><app-icon name="sparkles" [size]="14" />{{ trend().note }}</p>
      </div>
      <div class="card span-4 feed">
        <div class="card-head"><h3>AI Insight Feed</h3><span class="chip live"><i></i>Live</span></div>
        <ul>
          @for (f of feed; track f.title) {
            <li>
              <span class="f-ic" [style.background]="f.color + '1a'" [style.color]="f.color"><app-icon [name]="f.icon" [size]="16" /></span>
              <div><b>{{ f.title }}</b><p>{{ f.text }}</p>
                <div class="f-foot"><span class="muted">{{ f.conf }}% confidence</span><button class="link" (click)="ask(f.q)">Ask Copilot →</button></div></div>
            </li>
          }
        </ul>
      </div>
    </section>

    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Attendance by Department <span class="card-sub">this week, people</span></h3></div>
        <app-column-chart [labels]="deptNames" [series]="attSeries" [stacked]="true" [height]="260" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Overtime Intensity <span class="card-sub">% of capacity, by day</span></h3></div>
        <app-heatmap [rows]="deptNames" [cols]="days" [data]="heat" />
      </div>
    </section>

    <section class="explorer" [class.with-detail]="!!sel()">
      <div class="card">
        <div class="card-head"><h3>Department Explorer</h3><span class="muted">Click a department for AI drill-down · click headers to sort</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              @for (c of cols; track c.key) {<th [class.num]="c.key !== 'name'" (click)="sortBy(c.key)" class="sortable">{{ c.label }}@if (sort().key === c.key) {<span>{{ sort().dir > 0 ? ' ▲' : ' ▼' }}</span>}</th>}
            </tr></thead>
            <tbody>
              @for (d of rows(); track d.name) {
                <tr [class.on]="selName() === d.name" (click)="selName.set(selName() === d.name ? null : d.name)">
                  <td><b>{{ d.name }}</b></td><td class="num">{{ d.headcount }}</td>
                  <td class="num"><span [class]="d.att < 85 ? 'tag red' : d.att < 88 ? 'tag amber' : 'tag green'">{{ d.att }}%</span></td>
                  <td class="num">{{ d.late }}</td><td class="num">{{ fmt(d.ot) }} h</td><td class="num">{{ d.otPer }} h</td>
                  <td class="num">{{ d.engagement }}</td><td class="num"><span [class]="d.highRisk >= 4 ? 'tag red' : d.highRisk >= 2 ? 'tag amber' : 'tag grey'">{{ d.highRisk }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      @if (sel(); as d) {
        <aside class="card det">
          <div class="d-h"><div><h3>{{ d.name }}</h3><span class="muted">{{ d.headcount }} employees · {{ d.present }} present this week</span></div><button class="close-btn" (click)="selName.set(null)">×</button></div>
          <div class="d-k">
            <div><app-ring [value]="d.att" [color]="d.att < 85 ? '#ef4444' : '#22c55e'" [size]="66" /><small>Attendance</small></div>
            <div><app-ring [value]="d.engagement" color="#3b82f6" [size]="66" /><small>Engagement</small></div>
            <div><b>{{ d.otPer }} h</b><small>Overtime / person</small></div>
            <div><b>{{ d.highRisk }}</b><small>High-risk people</small></div>
          </div>
          <div class="ai-box"><app-icon name="sparkles" [size]="15" /><p>{{ insight(d) }}</p></div>
          <h4>Employees to watch</h4>
          <ul class="watch">
            @for (e of watch(d.name); track e.id) {
              <li><span class="dt-av" [style.background]="e.avatar">{{ e.initials }}</span><div><b>{{ e.name }}</b><small>{{ e.role }} · {{ e.site }}</small></div><span class="muted">{{ e.overtime }} h OT</span><span [class]="e.risk >= 60 ? 'tag red' : 'tag amber'">{{ e.risk }}% risk</span></li>
            } @empty {<li class="muted">No employees flagged.</li>}
          </ul>
          <div class="d-btns">
            <button class="btn-primary" (click)="ask('Show late arrivals in ' + d.name)"><app-icon name="sparkles" [size]="15" />Ask Copilot about {{ d.name }}</button>
            <button class="btn-ghost" (click)="go('/ai-people-intelligence/natural-language-reports?q=' + enc('overtime hours by employee in ' + d.name))">Generate report</button>
          </div>
        </aside>
      }
    </section>
  `,
  styles: `
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: #fff; padding: 6px 12px; font-size: 12px; cursor: pointer; } .seg button + button { border-left: 1px solid var(--border); } .seg button.on { background: var(--primary); color: #fff; }
    .ai-note { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0 0; padding: 9px 12px; background: #f7f4ff; border-radius: 8px; font-size: 12.5px; color: #3d3570; } .ai-note app-icon { color: var(--primary); flex: none; margin-top: 1px; }
    .feed ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .feed li { display: grid; grid-template-columns: 32px 1fr; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid #f1f0f8; } .feed li:last-child { border: 0; padding: 0; }
    .f-ic { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; }
    .feed b { font-size: 13px; } .feed p { margin: 2px 0 4px; font-size: 12px; color: #4b4f6b; line-height: 1.4; }
    .f-foot { display: flex; justify-content: space-between; font-size: 11.5px; }
    .explorer { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .explorer.with-detail { grid-template-columns: minmax(0, 1.4fr) minmax(380px, 1fr); }
    .sortable { cursor: pointer; user-select: none; } tbody tr { cursor: pointer; } tbody tr:hover { background: #faf8ff; } tbody tr.on { background: #f3eeff; }
    .det { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 76px; }
    .d-h { display: flex; justify-content: space-between; } .d-h h3 { margin: 0; font-size: 18px; }
    .d-k { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .d-k div { border: 1px solid var(--border); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
    .d-k b { font-size: 20px; } .d-k small { font-size: 11px; color: var(--muted); }
    .ai-box { display: flex; gap: 8px; padding: 10px 12px; background: #f7f4ff; border-radius: 10px; color: var(--primary); } .ai-box p { margin: 0; font-size: 12.5px; color: #3d3570; line-height: 1.45; }
    h4 { margin: 0; font-size: 13px; }
    .watch { list-style: none; margin: 0; padding: 0; } .watch li { display: grid; grid-template-columns: 32px 1fr auto auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid #f1f0f8; font-size: 12.5px; }
    .watch div { display: flex; flex-direction: column; } .watch small { color: var(--muted); font-size: 11px; }
    .d-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 1250px) { .explorer.with-detail { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class WorkforceInsights {
  private readonly store = inject(AiStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly enc = encodeURIComponent;
  protected readonly periods = Object.keys(PERIOD_F);
  protected readonly metrics = METRICS;
  protected readonly feed = FEED;
  protected readonly total = TOTAL_EMPLOYEES;
  protected readonly attRate = pct(ATTENDANCE.present, TOTAL_EMPLOYEES);
  protected readonly days = DAYS;
  protected readonly heat = OT_HEAT;
  protected readonly deptNames = DEPTS.map((d) => d.name);
  protected readonly attSeries: Series[] = [
    { name: 'Present', color: '#22c55e', values: DEPTS.map((d) => d.present) },
    { name: 'Late', color: '#f59e0b', values: DEPTS.map((d) => d.late) },
    { name: 'Absent', color: '#ef4444', values: DEPTS.map((d) => d.absent) },
    { name: 'On Leave', color: '#64748b', values: DEPTS.map((d) => d.leave) },
  ];
  protected readonly period = signal('This Week');
  protected readonly metric = signal<(typeof METRICS)[number]>('Headcount');
  protected readonly selName = signal<string | null>('Operations');
  protected readonly sort = signal<{ key: string; dir: number }>({ key: 'headcount', dir: -1 });
  protected readonly unit = computed(() => this.period().replace('This ', '').toLowerCase());
  protected readonly ot = computed(() => Math.round(TOTAL_OVERTIME * PERIOD_F[this.period()]));
  protected readonly cols = [
    { key: 'name', label: 'Department' }, { key: 'headcount', label: 'Headcount' }, { key: 'att', label: 'Attendance' }, { key: 'late', label: 'Late' },
    { key: 'ot', label: 'Overtime' }, { key: 'otPer', label: 'OT / person' }, { key: 'engagement', label: 'Engagement' }, { key: 'highRisk', label: 'High risk' },
  ];
  protected readonly rows = computed(() => {
    const f = PERIOD_F[this.period()];
    const { key, dir } = this.sort();
    return DEPTS.map((d) => ({ ...d, att: pct(d.present, d.headcount), ot: Math.round(d.overtime * f), otPer: +((d.overtime * f) / d.headcount).toFixed(1) }))
      .sort((a, b) => ((a as any)[key] > (b as any)[key] ? 1 : -1) * dir);
  });
  protected readonly sel = computed(() => this.rows().find((r) => r.name === this.selName()) ?? null);
  protected readonly trend = computed(() => {
    switch (this.metric()) {
      case 'Headcount':
        return { labels: MONTHS, suffix: '', note: 'Headcount grew 6.1% in 12 months while contractors grew 30%; contractor share is now 21.9% of the workforce.', series: [{ name: 'Employees', color: '#7c3aed', values: HEADCOUNT_TREND, area: true }, { name: 'Contractors', color: '#ef4444', values: CONTRACTOR_TREND }] as Series[] };
      case 'Attendance %':
        return { labels: WEEKS, suffix: '%', note: 'Attendance has declined for 4 consecutive weeks (89.4% → 86.7%). Sales and HR drive 61% of the drop.', series: [{ name: 'Attendance %', color: '#22c55e', values: ATTENDANCE_RATE, area: true }] as Series[] };
      case 'Overtime':
        return { labels: WEEKS, suffix: '', note: 'Overtime is up 30% since W31 and the model forecasts 5,300 h next week unless a 4th night crew is added.', series: [{ name: 'Overtime (h)', color: '#f97316', values: OVERTIME_TREND, area: true }] as Series[] };
      default:
        return { labels: WEEKS, suffix: '%', note: 'Absenteeism reached 4.8%, the highest in 12 weeks. Unplanned Monday/Friday absences grew 22%.', series: [{ name: 'Absenteeism %', color: '#ef4444', values: ABSENTEEISM, area: true }] as Series[] };
    }
  });

  protected sortBy(key: string) {
    this.sort.update((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
  }
  protected watch(dept: string) {
    return EMPLOYEES.filter((e) => e.dept === dept).sort((a, b) => b.risk - a.risk).slice(0, 4);
  }
  protected insight(d: { name: string; att: number; otPer: number; engagement: number; highRisk: number }) {
    const parts = [`${d.name} attendance is ${d.att}% (${d.att < 86.7 ? 'below' : 'above'} the 86.7% company average).`];
    if (d.otPer > 4) parts.push(`Overtime of ${d.otPer} h per person is high; consider adding shift capacity.`);
    if (d.engagement < 75) parts.push(`Engagement (${d.engagement}) is under target — pulse comments mention workload and scheduling.`);
    if (d.highRisk >= 2) parts.push(`${d.highRisk} employees are at high attrition risk.`);
    return parts.join(' ');
  }
  protected ask(q: string) {
    askCopilot(this.store, this.router, q);
  }
  protected go(url: string) {
    this.router.navigateByUrl(url);
  }
  protected exportCsv() {
    downloadCsv('workforce-insights.csv', [['Department', 'Headcount', 'Attendance %', 'Late', `Overtime (${this.period()})`, 'Engagement', 'High risk'], ...this.rows().map((d) => [d.name, d.headcount, d.att, d.late, d.ot, d.engagement, d.highRisk])]);
  }
}

/* =====================================================================================
 * Predictive Analytics
 * ===================================================================================== */
const ACTUAL14 = [88.1, 88.6, 87.2, 86.9, 85.8, 89.0, 88.4, 87.6, 87.1, 86.2, 85.9, 88.7, 87.8, 86.7];
const FC14 = [87.9, 88.3, 87.4, 86.8, 85.6, 88.6, 88.2, 87.9, 87.5, 86.4, 85.2, 88.1, 88.4, 88.2];

@Component({
  selector: 'app-ai-predictive-analytics',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Predictive Analytics" parent="AI &amp; People Intelligence" parentLink="/ai-people-intelligence" subtitle="Forecast attendance, staffing demand and attrition risk — and test what-if scenarios before you act.">
      <button class="btn-ghost" (click)="exportRisk()"><app-icon name="download" [size]="16" />Export Risk List</button>
      <button class="btn-primary" (click)="retrainAll()" [disabled]="training().size > 0"><app-icon name="refresh" [size]="16" />Retrain Models</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Forecast Attendance (next wk)" value="88.2%" icon="clock" color="#22c55e" change="1.5 pt" sub="vs. this week" />
      <app-kpi label="Predicted Absences (next wk)" value="412" icon="calendar-x" color="#f97316" change="6%" [good]="false" sub="vs. this week" />
      <app-kpi label="High Attrition Risk" [value]="highRisk()" icon="heart" color="#ef4444" [sub]="planned() + ' with retention plan'" subColor="#16a34a" />
      <app-kpi label="Peak Staffing Gap" [value]="peakGap() + ' FTE'" icon="users" color="#8b5cf6" [sub]="'in ' + peakWeek()" [subColor]="peakGapNum() < 0 ? '#dc2626' : '#16a34a'" />
      <app-kpi label="Avg Model Accuracy" [value]="avgAcc() + '%'" icon="ai-brain" color="#3b82f6" sub="4 production models" />
    </section>

    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Attendance Forecast <span class="card-sub">actual vs. predicted, % present</span></h3>
          <div class="seg">@for (h of horizons; track h) {<button [class.on]="horizon() === h" (click)="horizon.set(h)">{{ h }} days</button>}</div>
        </div>
        <app-line-chart [labels]="fc().labels" [series]="fc().series" [height]="330" [min]="80" [max]="95" suffix="%" />
        <p class="ai-note"><app-icon name="sparkles" [size]="14" />Dips are predicted on {{ fc().dips }} (public-holiday bridge days and the Q4 inventory count). Confidence band ±1.6 pt.</p>
      </div>
      <div class="card span-5 sc">
        <div class="card-head"><h3>What-if Scenario</h3><button class="link" (click)="resetScenario()">Reset</button></div>
        <label>Additional hires <b>+{{ hires() }}</b><input type="range" min="0" max="80" step="2" [value]="hires()" (input)="hires.set(+$any($event.target).value)" /></label>
        <label>Overtime cap per person <b>{{ otCap() }} h / week</b><input type="range" min="0" max="16" [value]="otCap()" (input)="otCap.set(+$any($event.target).value)" /></label>
        <label>Contractors for peak <b>+{{ contractors() }}</b><input type="range" min="0" max="60" step="5" [value]="contractors()" (input)="contractors.set(+$any($event.target).value)" /></label>
        <div class="sc-out">
          <div><b [class.bad]="peakGapNum() < 0" [class.good]="peakGapNum() >= 0">{{ peakGap() }}</b><small>Peak gap (FTE)</small></div>
          <div><b>{{ coverage() }}%</b><small>Avg demand coverage</small></div>
          <div><b>AED {{ fmt(cost()) }}</b><small>Monthly cost</small></div>
        </div>
        <app-column-chart [labels]="weeks" [series]="demandSeries()" [height]="170" />
      </div>
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Attrition Risk <span class="card-sub">employees with risk ≥ 45%, model AR-3.2</span></h3></div>
        <app-data-table [rows]="riskRows()" [columns]="riskCols" [filters]="riskFilters" [actions]="riskActions" [searchKeys]="['name', 'dept', 'drivers']" searchPlaceholder="Search employee, department, driver..." noun="employees" [pageSize]="8" (action)="riskAct($event.action, $event.row)" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Models</h3></div>
        <ul class="models">
          @for (m of models(); track m.id) {
            <li>
              <div class="m-top"><span class="m-ic"><app-icon name="ai-brain" [size]="16" /></span><div><b>{{ m.name }}</b><small>{{ m.algo }}</small></div><span [class]="m.status === 'Healthy' ? 'tag green' : 'tag amber'">{{ m.status }}</span></div>
              @if (training().has(m.id)) {
                <div class="prog"><i [style.width.%]="progress()[m.id] ?? 0"></i></div><small class="muted">Retraining… {{ progress()[m.id] ?? 0 }}%</small>
              } @else {
                <div class="m-bot"><span>Accuracy <b>{{ m.accuracy }}%</b></span><span class="muted">trained {{ m.trained }}</span><button class="link" (click)="retrain(m.id)">Retrain</button></div>
              }
            </li>
          }
        </ul>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: #fff; padding: 6px 12px; font-size: 12px; cursor: pointer; } .seg button + button { border-left: 1px solid var(--border); } .seg button.on { background: var(--primary); color: #fff; }
    .ai-note { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0 0; padding: 9px 12px; background: #f7f4ff; border-radius: 8px; font-size: 12.5px; color: #3d3570; } .ai-note app-icon { color: var(--primary); flex: none; margin-top: 1px; }
    .sc label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #4b4f6b; margin-bottom: 10px; } .sc label b { color: var(--text); margin-left: 6px; }
    .sc label { position: relative; } .sc input[type='range'] { accent-color: var(--primary); width: 100%; }
    .sc-out { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 4px 0 8px; }
    .sc-out div { border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; } .sc-out b { font-size: 17px; } .sc-out small { font-size: 11px; color: var(--muted); }
    .models { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .models li { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
    .m-top { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; } .m-top div { display: flex; flex-direction: column; } .m-top b { font-size: 13px; } .m-top small { font-size: 11px; color: var(--muted); }
    .m-ic { width: 32px; height: 32px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; }
    .m-bot { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
    .prog { height: 6px; background: #eef0f6; border-radius: 4px; overflow: hidden; } .prog i { display: block; height: 100%; background: var(--primary); transition: width 0.3s; }
  `,
})
export class PredictiveAnalytics {
  private readonly store = inject(AiStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly weeks = FORECAST_WEEKS;
  protected readonly horizons = [7, 14] as const;
  protected readonly horizon = signal<7 | 14>(14);
  protected readonly hires = signal(0);
  protected readonly otCap = signal(12);
  protected readonly contractors = signal(0);
  protected readonly toast = signal<string | null>(null);
  private readonly flash = flashFn(this.toast);
  protected readonly models = signal(MODELS.map((m) => ({ ...m })));
  protected readonly training = signal<Set<string>>(new Set());
  protected readonly progress = signal<Record<string, number>>({});
  protected readonly plans = signal<Record<string, string>>({ [EMPLOYEES[9].id]: 'Plan active' });

  protected readonly fc = computed(() => {
    const h = this.horizon();
    const past = ACTUAL14.slice(-h);
    const fut = FC14.slice(0, h);
    const labels = [...past.map((_, i) => shortDay(i - h + 1)), ...fut.map((_, i) => shortDay(i + 1))];
    const nan = (n: number) => Array(n).fill(NaN);
    const dips = fut.map((v, i) => ({ v, d: shortDay(i + 1) })).sort((a, b) => a.v - b.v).slice(0, 2).map((x) => x.d).join(' and ');
    return {
      labels,
      dips,
      series: [
        { name: 'Actual', color: '#7c3aed', values: [...past, ...nan(h)], area: true },
        { name: 'Forecast', color: '#22c55e', values: [...nan(h - 1), past[h - 1], ...fut], dashed: true },
        { name: 'Upper band', color: '#c4b5fd', values: [...nan(h), ...fut.map((v) => +(v + 1.6).toFixed(1))], dashed: true },
        { name: 'Lower band', color: '#c4b5fd', values: [...nan(h), ...fut.map((v) => +(v - 1.6).toFixed(1))], dashed: true },
      ] as Series[],
    };
  });
  protected readonly capacity = computed(() => CAPACITY + this.hires() + this.contractors() + Math.round((this.otCap() - 8) * 3.1));
  protected readonly gaps = computed(() => DEMAND.map((d) => this.capacity() - d));
  protected readonly peakGapNum = computed(() => Math.min(...this.gaps()));
  protected readonly peakGap = computed(() => (this.peakGapNum() > 0 ? '+' : '') + this.peakGapNum());
  protected readonly peakWeek = computed(() => FORECAST_WEEKS[this.gaps().indexOf(this.peakGapNum())]);
  protected readonly coverage = computed(() => +((DEMAND.reduce((a, d) => a + Math.min(1, this.capacity() / d), 0) / DEMAND.length) * 100).toFixed(1));
  protected readonly cost = computed(() => this.hires() * 9800 + this.contractors() * 7200 + this.otCap() * 1082 * 0.12 * 4.3 * 42);
  protected readonly demandSeries = computed<Series[]>(() => [
    { name: 'Demand (FTE)', color: '#c4b5fd', values: DEMAND },
    { name: 'Capacity', color: '#ef4444', values: DEMAND.map(() => this.capacity()), line: true },
  ]);
  protected readonly avgAcc = computed(() => +(this.models().reduce((a, m) => a + m.accuracy, 0) / this.models().length).toFixed(1));

  protected readonly riskRows = computed(() =>
    EMPLOYEES.filter((e) => e.risk >= 45)
      .sort((a, b) => b.risk - a.risk)
      .map((e) => ({ ...e, sub: `${e.role} · ${e.site}`, level: e.risk >= 75 ? 'Critical' : e.risk >= 60 ? 'High' : 'Medium', plan: this.plans()[e.id] ?? 'None' })),
  );
  protected readonly highRisk = signal(23);
  protected readonly planned = computed(() => Object.keys(this.plans()).length);
  protected readonly riskCols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'sub' },
    { key: 'dept', label: 'Department' },
    { key: 'risk', label: 'Risk', kind: 'progress' },
    { key: 'level', label: 'Level', kind: 'tag', tag: (r) => (r.level === 'Critical' ? 'tag red' : r.level === 'High' ? 'tag amber' : 'tag grey') },
    { key: 'drivers', label: 'Top drivers' },
    { key: 'overtime', label: 'OT (h/wk)', kind: 'num' },
    { key: 'plan', label: 'Retention plan', kind: 'tag', tag: (r) => (r.plan === 'None' ? 'tag grey' : 'tag green') },
  ];
  protected readonly riskFilters = [
    { key: 'dept', label: 'Department', options: DEPTS.map((d) => d.name) },
    { key: 'level', label: 'Level', options: ['Critical', 'High', 'Medium'] },
  ];
  protected readonly riskActions: RowAction[] = [
    { id: 'oneone', label: 'Schedule 1:1 with manager', icon: 'calendar-days' },
    { id: 'plan', label: 'Create retention plan', icon: 'heart' },
    { id: 'ask', label: 'Ask Copilot about this person', icon: 'sparkles' },
  ];

  protected riskAct(a: string, e: Employee) {
    if (a === 'ask') return askCopilot(this.store, this.router, `Find ${e.name}`);
    this.plans.update((p) => ({ ...p, [e.id]: a === 'oneone' ? '1:1 scheduled' : 'Plan active' }));
    this.store.addTask(a === 'oneone' ? `Retention 1:1 with ${e.name}` : `Retention plan for ${e.name}`);
    this.flash(a === 'oneone' ? `1:1 scheduled with ${e.name}'s manager for next Tuesday` : `Retention plan created for ${e.name} · added to Recommendations`);
  }
  protected resetScenario() {
    this.hires.set(0);
    this.otCap.set(12);
    this.contractors.set(0);
  }
  protected retrain(id: string) {
    if (this.training().has(id)) return;
    this.training.update((s) => new Set([...s, id]));
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(100, p + 9 + Math.round(Math.random() * 8));
      this.progress.update((x) => ({ ...x, [id]: p }));
      if (p >= 100) {
        clearInterval(t);
        this.training.update((s) => new Set([...s].filter((x) => x !== id)));
        this.models.update((l) => l.map((m) => (m.id === id ? { ...m, trained: 'just now', status: 'Healthy', accuracy: +(m.accuracy + 0.4 + Math.random() * 0.8).toFixed(1) } : m)));
        this.flash(`${this.models().find((m) => m.id === id)!.name} retrained · accuracy improved`);
      }
    }, 280);
  }
  protected retrainAll() {
    this.models().forEach((m) => this.retrain(m.id));
  }
  protected exportRisk() {
    downloadCsv('attrition-risk.csv', [['ID', 'Employee', 'Department', 'Site', 'Risk %', 'Drivers', 'Overtime h/wk', 'Plan'], ...this.riskRows().map((e) => [e.id, e.name, e.dept, e.site, e.risk, e.drivers, e.overtime, e.plan])]);
  }
}

/* =====================================================================================
 * Anomaly Detection
 * ===================================================================================== */
const CATS = ['All', 'Attendance', 'Access', 'Overtime', 'Safety', 'Space', 'Canteen', 'Device'] as const;
const STATUSES = ['Open', 'Acknowledged', 'Resolved', 'False Positive', 'All'] as const;

@Component({
  selector: 'app-ai-anomaly-detection',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Anomaly Detection" parent="AI &amp; People Intelligence" parentLink="/ai-people-intelligence" subtitle="Unsupervised models watch attendance, access, overtime, safety and space signals 24/7 and flag what is unusual.">
      <label class="sens">Sensitivity
        <select class="select" [value]="sens()" (change)="sens.set($any($event.target).value)"><option>Low</option><option>Medium</option><option>High</option></select>
      </label>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="scan()" [disabled]="scanning()"><app-icon name="ai-brain" [size]="16" />{{ scanning() ? 'Scanning…' : 'Run Scan Now' }}</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Open Anomalies" [value]="count('Open')" icon="activity" color="#8b5cf6" [sub]="'of ' + store.anomalies().length + ' detected (7 days)'" />
      <app-kpi label="High Severity" [value]="highOpen()" icon="triangle-alert" color="#ef4444" sub="need attention" subColor="#dc2626" />
      <app-kpi label="Acknowledged" [value]="count('Acknowledged')" icon="eye" color="#f97316" sub="under investigation" />
      <app-kpi label="Resolved" [value]="count('Resolved')" icon="shield-check" color="#22c55e" sub="avg 3.4 h to resolve" />
      <app-kpi label="False-Positive Rate" [value]="fpRate() + '%'" icon="sliders" color="#3b82f6" [sub]="'sensitivity: ' + sens()" />
    </section>

    <section class="an">
      <div class="card list">
        <div class="filters">
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search anomalies..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <div class="cats">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
          <div class="sts">@for (s of statuses; track s) {<button [class.on]="status() === s" (click)="status.set(s)">{{ s }}<em>{{ s === 'All' ? store.anomalies().length : count(s) }}</em></button>}</div>
        </div>
        <ul>
          @for (a of list(); track a.id) {
            <li [class.on]="selId() === a.id" (click)="selId.set(a.id)">
              <i class="dot" [style.background]="sevColor(a.severity)"></i>
              <div class="li-m"><b>{{ a.title }}@if (a.isNew) {<span class="new">NEW</span>}</b><small>{{ a.category }} · {{ a.site }} · {{ a.ago }}</small></div>
              <span [class]="'tag ' + sevTag(a.severity)">{{ a.severity }}</span>
            </li>
          } @empty {<li class="muted empty">No anomalies match the filters.</li>}
        </ul>
      </div>

      @if (sel(); as a) {
        <div class="card det">
          <div class="d-h">
            <span class="d-ic" [style.background]="sevColor(a.severity) + '1f'" [style.color]="sevColor(a.severity)"><app-icon name="activity" [size]="22" /></span>
            <div><h2>{{ a.title }}</h2><span class="muted">{{ a.id }} · {{ a.category }} · {{ a.scope }} · {{ a.site }}</span></div>
            <span [class]="'tag ' + statusTag(a.status)">{{ a.status }}</span>
          </div>
          <div class="d-stats">
            <div><small>Severity</small><b [style.color]="sevColor(a.severity)">{{ a.severity }}</b></div>
            <div><small>Anomaly score</small><b>{{ a.score }}/100</b></div>
            <div><small>Deviation</small><b [class.bad]="a.deviation > 0">{{ a.deviation > 0 ? '+' : '' }}{{ a.deviation }}%</b></div>
            <div><small>Detected</small><b>{{ a.ago }}</b></div>
          </div>
          <div class="chart-card">
            <div class="card-head"><h3>Observed vs. expected <span class="card-sub">{{ a.unit }}</span></h3></div>
            <app-line-chart [labels]="a.labels" [series]="series(a)" [height]="220" />
          </div>
          <div class="ai-box"><app-icon name="sparkles" [size]="15" /><div><b>AI explanation</b><p>{{ a.desc }}</p></div></div>
          <div class="acts">
            @if (a.status === 'Open') {<button class="btn-primary" (click)="setStatus(a, 'Acknowledged')"><app-icon name="eye" [size]="15" />Acknowledge</button>}
            @if (a.status !== 'Resolved') {<button class="btn-ghost" (click)="setStatus(a, 'Resolved')"><app-icon name="ai-check" [size]="15" />Resolve</button>}
            @if (a.status === 'Open' || a.status === 'Acknowledged') {<button class="btn-ghost" (click)="setStatus(a, 'False Positive')">Mark false positive</button>}
            @if (a.status === 'Resolved' || a.status === 'False Positive') {<button class="btn-ghost" (click)="setStatus(a, 'Open')"><app-icon name="refresh" [size]="15" />Reopen</button>}
            <button class="btn-ghost" (click)="incident(a)"><app-icon name="siren" [size]="15" />Create incident</button>
            <button class="btn-ghost" (click)="ask(a)"><app-icon name="sparkles" [size]="15" />Ask Copilot</button>
          </div>
          <h4>Timeline</h4>
          <ul class="tl">
            <li><i></i><b>Detected</b> by {{ a.category }} model · score {{ a.score }} · {{ a.ago }}</li>
            <li><i></i><b>Notified</b> {{ a.site }} duty manager via app &amp; email</li>
            @for (n of notes()[a.id] ?? []; track $index) {<li><i class="p"></i>{{ n }}</li>}
          </ul>
        </div>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sens { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #4b4f6b; }
    .an { display: grid; grid-template-columns: minmax(340px, 0.9fr) minmax(0, 1.4fr); gap: 12px; align-items: start; }
    .list { padding: 12px; } .filters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .cats, .sts { display: flex; flex-wrap: wrap; gap: 5px; }
    .cats button, .sts button { border: 1px solid var(--border); background: #fff; border-radius: 14px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; display: inline-flex; gap: 5px; align-items: center; }
    .cats button.on, .sts button.on { background: var(--primary); border-color: var(--primary); color: #fff; }
    .sts em { font-style: normal; font-size: 10.5px; opacity: 0.75; }
    .list ul { list-style: none; margin: 0; padding: 0; max-height: 640px; overflow: auto; }
    .list li { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: center; padding: 10px 8px; border-radius: 8px; cursor: pointer; border-bottom: 1px solid #f3f2f8; }
    .list li:hover { background: #faf8ff; } .list li.on { background: #f3eeff; } .list li.empty { display: block; cursor: default; }
    .dot { width: 9px; height: 9px; border-radius: 50%; } .li-m { display: flex; flex-direction: column; min-width: 0; } .li-m b { font-size: 12.5px; } .li-m small { font-size: 11px; color: var(--muted); }
    .new { margin-left: 6px; background: #ef4444; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 4px; vertical-align: 2px; }
    .det { display: flex; flex-direction: column; gap: 12px; }
    .d-h { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; } .d-h h2 { margin: 0; font-size: 18px; } .d-h div { display: flex; flex-direction: column; }
    .d-ic { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; }
    .d-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .d-stats div { border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; } .d-stats small { color: var(--muted); font-size: 11px; } .d-stats b { font-size: 17px; }
    .chart-card { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; } .chart-card .card-head { margin-bottom: 4px; } .chart-card h3 { font-size: 13.5px; margin: 0; }
    .ai-box { display: flex; gap: 10px; padding: 10px 12px; background: #f7f4ff; border-radius: 10px; color: var(--primary); } .ai-box b { font-size: 12.5px; color: var(--text); } .ai-box p { margin: 2px 0 0; font-size: 12.5px; color: #3d3570; line-height: 1.45; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; } h4 { margin: 0; font-size: 13px; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 4px; font-size: 12.5px; display: flex; flex-direction: column; gap: 8px; }
    .tl li { display: flex; gap: 8px; align-items: baseline; } .tl i { width: 8px; height: 8px; border-radius: 50%; background: #c4b5fd; flex: none; } .tl i.p { background: var(--primary); }
    @media (max-width: 1150px) { .an { grid-template-columns: 1fr; } }
  `,
})
export class AnomalyDetection {
  protected readonly store = inject(AiStore);
  private readonly router = inject(Router);
  private readonly state = inject(AppState);
  protected readonly cats = CATS;
  protected readonly statuses = STATUSES;
  protected readonly q = signal('');
  protected readonly cat = signal<(typeof CATS)[number]>('All');
  protected readonly status = signal<(typeof STATUSES)[number]>('Open');
  protected readonly sens = signal('Medium');
  protected readonly selId = signal<string | null>(null);
  protected readonly scanning = signal(false);
  protected readonly notes = signal<Record<string, string[]>>({});
  protected readonly toast = signal<string | null>(null);
  private readonly flash = flashFn(this.toast);
  private poolIdx = 0;
  private lastTick = 0;

  protected readonly list = computed(() => {
    const min = this.sens() === 'Low' ? 60 : this.sens() === 'Medium' ? 35 : 0;
    const q = this.q().toLowerCase();
    return this.store
      .anomalies()
      .filter((a) => a.score >= min && (this.cat() === 'All' || a.category === this.cat()) && (this.status() === 'All' || a.status === this.status()) && (!q || (a.title + a.site + a.scope).toLowerCase().includes(q)))
      .sort((a, b) => a.minutes - b.minutes);
  });
  protected readonly sel = computed(() => this.store.anomalies().find((a) => a.id === this.selId()) ?? this.list()[0] ?? null);
  protected readonly highOpen = computed(() => this.store.anomalies().filter((a) => a.severity === 'High' && a.status === 'Open').length);
  protected readonly fpRate = computed(() => (this.sens() === 'High' ? 14.2 : this.sens() === 'Medium' ? 8.6 : 4.1));

  constructor() {
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
    if (id) {
      this.selId.set(id);
      this.status.set('All');
    }
    // A new anomaly "arrives" every ~40 s while live.
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 16 !== 0 || t === this.lastTick) return;
      this.lastTick = t;
      untracked(() => this.inject1());
    });
  }
  private inject1() {
    if (this.poolIdx >= ANOMALY_POOL.length) return;
    const p = ANOMALY_POOL[this.poolIdx++];
    const a: Anomaly = { ...p, id: `AN-${320 + this.poolIdx}`, ago: 'just now', minutes: 0, status: 'Open', isNew: true };
    this.store.anomalies.update((l) => [a, ...l.map((x) => ({ ...x, minutes: x.minutes + 1 }))]);
    this.flash(`New anomaly detected: ${a.title}`);
  }
  protected count(s: string) {
    return this.store.anomalies().filter((a) => a.status === s).length;
  }
  protected sevColor(s: string) {
    return s === 'High' ? '#ef4444' : s === 'Medium' ? '#f59e0b' : s === 'Info' ? '#3b82f6' : '#22c55e';
  }
  protected sevTag(s: string) {
    return s === 'High' ? 'red' : s === 'Medium' ? 'amber' : s === 'Info' ? 'blue' : 'green';
  }
  protected statusTag(s: string) {
    return s === 'Open' ? 'red' : s === 'Acknowledged' ? 'amber' : s === 'Resolved' ? 'green' : 'grey';
  }
  protected series(a: Anomaly): Series[] {
    return [
      { name: 'Observed', color: this.sevColor(a.severity), values: a.observed, area: true },
      { name: 'Expected', color: '#94a3b8', values: a.baseline, dashed: true },
    ];
  }
  private note(a: Anomaly, n: string) {
    const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.notes.update((x) => ({ ...x, [a.id]: [...(x[a.id] ?? []), `${n} by Rex Kumar · ${t}`] }));
  }
  protected setStatus(a: Anomaly, s: Anomaly['status']) {
    this.store.patchAnomaly(a.id, { status: s, isNew: false });
    this.selId.set(a.id);
    this.note(a, s === 'Open' ? 'Reopened' : s);
    this.flash(`${a.id} marked ${s.toLowerCase()}`);
  }
  protected incident(a: Anomaly) {
    this.note(a, `Incident INC-${4100 + a.score} created`);
    this.store.addTask(`Investigate incident for ${a.title}`);
    this.flash(`Incident INC-${4100 + a.score} created and assigned to ${a.site} security`);
  }
  protected ask(a: Anomaly) {
    askCopilot(this.store, this.router, a.category === 'Overtime' ? 'Which department has the highest overtime?' : a.category === 'Safety' ? 'Generate a safety incident report' : a.category === 'Attendance' ? 'Show absenteeism trend' : 'Any anomalies today?');
  }
  protected scan() {
    this.scanning.set(true);
    setTimeout(() => {
      this.scanning.set(false);
      if (this.poolIdx < ANOMALY_POOL.length) this.inject1();
      else this.flash('Scan complete · no new anomalies in the last 15 minutes');
    }, 1800);
  }
  protected exportCsv() {
    downloadCsv('anomalies.csv', [['ID', 'Title', 'Category', 'Severity', 'Site', 'Scope', 'Deviation %', 'Score', 'Status', 'Detected'], ...this.list().map((a) => [a.id, a.title, a.category, a.severity, a.site, a.scope, a.deviation, a.score, a.status, a.ago])]);
  }
}
