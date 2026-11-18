import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectValue } from '../../shared/select-value';
import { Series, UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import {
  ABSENTEEISM, AiStore, ASSET_UTIL, ATTENDANCE_RATE, CONTRACTOR_TREND, DEPTS, EMPLOYEES, EXPIRING, fmtN, HEADCOUNT_TREND, LOCATIONS, MONTHS,
  OVERTIME_TREND, pct, Rec, RStatus, SavedReport, TOTAL_EMPLOYEES, WEEKS,
} from './ai.data';

/* =====================================================================================
 * Natural Language Reports — a tiny rule-based "query planner" over the module dataset
 * ===================================================================================== */
type ChartType = 'Bar' | 'Line' | 'Donut' | 'Table';
interface Report {
  title: string;
  query: string;
  summary: string[];
  kpis: { label: string; value: string; color: string }[];
  labels: string[];
  series: Series[];
  cols: string[];
  rows: (string | number)[][];
  chart: ChartType;
  source: string;
  generated: string;
}
const PALETTE = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-0891b2)', 'var(--ka-db2777)', 'var(--ka-64748b)', 'var(--ka-9333ea)', 'var(--ka-16a34a)'];
const EXAMPLES = [
  'Overtime hours by department this month',
  'Attendance rate by department this week',
  'Late arrivals in Sales by employee',
  'Headcount trend by month',
  'Absenteeism trend by week',
  'People by location right now',
  'Asset utilization by site',
  'Attrition risk by department',
  'Certifications expiring in the next 30 days',
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildReport(raw: string): Report {
  const q = raw.toLowerCase();
  const f = /month/.test(q) ? 4.3 : /quarter/.test(q) ? 13 : 1;
  const periodTxt = /month/.test(q) ? 'this month' : /quarter/.test(q) ? 'this quarter' : /today/.test(q) ? 'today' : 'this week';
  const dept = DEPTS.find((d) => q.includes(d.name.toLowerCase()));
  const dim = /employee|person|people in|who/.test(q) ? 'employee' : /trend|month|week|over time/.test(q) && !/this (month|week)/.test(q.replace(/trend by (month|week)/, '')) ? 'time' : /site|location/.test(q) ? 'location' : 'dept';
  const base = { query: raw, generated: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) };
  const emps = EMPLOYEES.filter((e) => !dept || e.dept === dept.name);
  const mk = (title: string, metric: string, labels: string[], values: number[], unit: string, color: string, chart: ChartType, summary: string[], source: string, extraCols?: { cols: string[]; rows: (string | number)[][] }): Report => {
    const total = values.reduce((a, v) => a + v, 0);
    const maxI = values.indexOf(Math.max(...values));
    const minI = values.indexOf(Math.min(...values));
    const avg = total / (values.length || 1);
    return {
      ...base,
      title,
      summary,
      chart,
      source,
      labels,
      series: [{ name: metric, color, values, area: chart === 'Line' }],
      kpis: [
        { label: unit === '%' ? 'Average' : 'Total', value: unit === '%' ? avg.toFixed(1) + '%' : fmtN(total) + (unit ? ' ' + unit : ''), color: 'var(--ka-7c3aed)' },
        { label: 'Highest', value: `${labels[maxI]} · ${fmtN(values[maxI])}${unit === '%' ? '%' : ''}`, color: 'var(--ka-ef4444)' },
        { label: 'Lowest', value: `${labels[minI]} · ${fmtN(values[minI])}${unit === '%' ? '%' : ''}`, color: 'var(--ka-22c55e)' },
        { label: 'Data points', value: String(values.length), color: 'var(--ka-3b82f6)' },
      ],
      cols: extraCols?.cols ?? [dim === 'time' ? 'Period' : dim === 'employee' ? 'Employee' : dim === 'location' ? 'Location' : 'Department', metric],
      rows: extraCols?.rows ?? labels.map((l, i) => [l, values[i]]),
    };
  };

  if (/certif|licen|expir/.test(q))
    return mk('Certifications Expiring (30 days)', 'Days left', EXPIRING.map((e) => e.name), EXPIRING.map((e) => e.cert!.days), 'days', 'var(--ka-8b5cf6)', 'Bar',
      [`${EXPIRING.length} employees hold certifications expiring within 30 days.`, `${EXPIRING.filter((e) => e.cert!.days <= 7).length} expire within a week — Ahmed Hassan (First Aid) is first.`, 'Safety-critical: First Aid, Fire Safety, Work at Height and Forklift.'],
      'Training, Skills & Compliance', { cols: ['Employee', 'Department', 'Certification', 'Days left'], rows: EXPIRING.map((e) => [e.name, e.dept, e.cert!.name, e.cert!.days]) });
  if (/overtime/.test(q)) {
    if (dim === 'time') return mk('Overtime Trend by Week', 'Overtime (h)', WEEKS, OVERTIME_TREND, 'h', 'var(--ka-f97316)', 'Line', ['Overtime has grown 30% over 12 weeks.', 'The last 3 weeks show acceleration driven by Operations night shifts.', 'Forecast for next week: ~5,300 h.'], 'Time & Attendance · overtime ledger');
    if (dim === 'employee') {
      const l = [...emps].sort((a, b) => b.overtime - a.overtime).slice(0, 10);
      return mk(`Overtime by Employee${dept ? ' · ' + dept.name : ''}`, 'Overtime (h)', l.map((e) => e.name), l.map((e) => Math.round(e.overtime * f)), 'h', 'var(--ka-f97316)', 'Bar', [`Top ${l.length} employees by overtime ${periodTxt}.`, `${l.filter((e) => e.overtime > 12).length} exceed the 12 h weekly guideline.`], 'Time & Attendance', { cols: ['Employee', 'Department', 'Role', 'Overtime (h)'], rows: l.map((e) => [e.name, e.dept, e.role, Math.round(e.overtime * f)]) });
    }
    return mk(`Overtime Hours by Department · ${cap(periodTxt)}`, 'Overtime (h)', DEPTS.map((d) => d.name), DEPTS.map((d) => Math.round(d.overtime * f)), 'h', 'var(--ka-f97316)', 'Bar', ['Operations accounts for 42% of all overtime hours.', 'Operations overtime is 31% above its 8-week baseline.', 'HR and Finance are well within limits.'], 'Time & Attendance · overtime ledger');
  }
  if (/late/.test(q)) {
    if (dim === 'employee' || dept) {
      const l = [...emps].sort((a, b) => b.late - a.late).slice(0, 10);
      return mk(`Late Arrivals by Employee${dept ? ' · ' + dept.name : ''}`, 'Late arrivals', l.map((e) => e.name), l.map((e) => e.late), '', 'var(--ka-f59e0b)', 'Bar', [`${dept ? dept.name : 'Company'} late arrivals ${periodTxt}: ${dept ? dept.late : 76} today.`, `${l.filter((e) => e.late >= 5).length} employees were late 5+ times this month.`, 'Mondays account for 31% of late minutes.'], 'Time & Attendance', { cols: ['Employee', 'Department', 'Site', 'Late (month)'], rows: l.map((e) => [e.name, e.dept, e.site, e.late]) });
    }
    return mk('Late Arrivals by Department', 'Late', DEPTS.map((d) => d.name), DEPTS.map((d) => d.late), '', 'var(--ka-f59e0b)', 'Bar', ['76 late arrivals today (6.1% of employees).', 'Operations (28) and Logistics (18) lead; Sales has the highest rate (7.9%).'], 'Time & Attendance');
  }
  if (/absent|absentee/.test(q)) {
    if (dim === 'time') return mk('Absenteeism Trend by Week', 'Absenteeism %', WEEKS, ABSENTEEISM, '%', 'var(--ka-ef4444)', 'Line', ['Absenteeism reached 4.8%, a 12-week high.', 'Three consecutive weeks of increase.'], 'Time & Attendance · Leave & Absence');
    return mk('Absences by Department', 'Absent', DEPTS.map((d) => d.name), DEPTS.map((d) => d.absent), '', 'var(--ka-ef4444)', 'Bar', ['60 employees absent today (4.8%).', 'Operations has the most absences; HR has the highest rate.'], 'Time & Attendance');
  }
  if (/contractor/.test(q)) return mk('Contractor Headcount by Month', 'Contractors', MONTHS, CONTRACTOR_TREND, '', 'var(--ka-ef4444)', 'Line', ['Contractors increased 12% this month to 349.', 'Growth driven by Warehouse logistics crews for Q4.'], 'Contractor & Vendor Workforce');
  if (/headcount|employees by|staff/.test(q)) {
    if (dim === 'time') return mk('Headcount Trend by Month', 'Employees', MONTHS, HEADCOUNT_TREND, '', 'var(--ka-7c3aed)', 'Line', ['Headcount grew 6.1% in 12 months to 1,248.', 'Net +72 employees; hiring concentrated in Operations and Logistics.'], 'People & Identity');
    if (dim === 'location') return mk('Headcount by Location', 'People', LOCATIONS.map((l) => l.name), LOCATIONS.map((l) => l.count), '', 'var(--ka-3b82f6)', 'Bar', ['Head Office hosts 34% of people.', '20% work remotely.'], 'Real-Time Location');
    return mk('Headcount by Department', 'Employees', DEPTS.map((d) => d.name), DEPTS.map((d) => d.headcount), '', 'var(--ka-7c3aed)', 'Donut', [`${fmtN(TOTAL_EMPLOYEES)} employees across ${DEPTS.length} departments.`, 'Operations is the largest department (31%).'], 'People & Identity');
  }
  if (/location|site|where|right now|on.?site/.test(q) && !/asset|utili/.test(q)) return mk('People by Location · Right Now', 'People', LOCATIONS.map((l) => l.name), LOCATIONS.map((l) => l.count), '', 'var(--ka-3b82f6)', 'Bar', ['1,242 people are checked in right now.', 'Head Office 428 · Warehouse 312 · Remote 248.'], 'Real-Time Location (RTLS)');
  if (/asset|utili|equipment/.test(q)) return mk('Asset Utilization by Site', 'Utilization %', ASSET_UTIL.map((a) => a.site), ASSET_UTIL.map((a) => a.util), '%', 'var(--ka-7c3aed)', 'Bar', ['Warehouse runs hottest at 84%.', 'Site B (58%) has spare capacity — 420 assets.'], 'Device & Edge Management', { cols: ['Site', 'Assets', 'Utilization %'], rows: ASSET_UTIL.map((a) => [a.site, a.assets, a.util]) });
  if (/attrition|risk|turnover/.test(q)) return mk('High Attrition Risk by Department', 'High-risk employees', DEPTS.map((d) => d.name), DEPTS.map((d) => d.highRisk), '', 'var(--ka-db2777)', 'Bar', ['23 employees above 60% attrition risk.', 'Operations (8) and Logistics (4) concentrate 52% of the risk.'], 'Predictive Analytics · model AR-3.2');
  if (/engage/.test(q)) return mk('Engagement Score by Department', 'Engagement', DEPTS.map((d) => d.name), DEPTS.map((d) => d.engagement), '', 'var(--ka-3b82f6)', 'Bar', ['Company engagement averages 76/100.', 'Sales (68) and Operations (71) are below target.'], 'Pulse surveys');
  if (/attendance|present/.test(q)) {
    if (dim === 'time') return mk('Attendance Rate Trend by Week', 'Attendance %', WEEKS, ATTENDANCE_RATE, '%', 'var(--ka-22c55e)', 'Line', ['Attendance declined 4 weeks in a row to 86.7%.', 'Sales and HR drive most of the decline.'], 'Time & Attendance');
    return mk(`Attendance Rate by Department · ${cap(periodTxt)}`, 'Attendance %', DEPTS.map((d) => d.name), DEPTS.map((d) => pct(d.present, d.headcount)), '%', 'var(--ka-22c55e)', 'Bar', ['Company attendance is 86.7% (1,082 of 1,248 on time).', 'IT leads with 93.9%; HR is lowest at 76.2% due to planned leave.'], 'Time & Attendance');
  }
  return mk('Workforce Overview by Department', 'Employees', DEPTS.map((d) => d.name), DEPTS.map((d) => d.headcount), '', 'var(--ka-7c3aed)', 'Bar', [`I wasn't sure which metric you meant in "${raw}", so here is a headcount overview.`, 'Try: overtime, attendance, late arrivals, absenteeism, headcount, certifications, assets or attrition risk.'], 'People & Identity');
}

@Component({
  selector: 'app-ai-natural-language-reports',
  imports: [...UI, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Natural Language Reports" parent="AI &amp; People Intelligence" parentLink="/ai-people-intelligence" subtitle="Type a question in plain English — Copilot builds the report with charts and tables you can save, schedule and export.">
      <button class="btn-ghost" (click)="clear()"><app-icon name="plus" [size]="16" />New Report</button>
      <button class="btn-primary" (click)="openCopilot()"><app-icon name="sparkles" [size]="16" />Open Copilot</button>
    </app-page-head>

    <section class="nl">
      <div class="main">
        <div class="card ask">
          <div class="ask-row">
            <app-icon name="sparkles" [size]="20" class="spk" />
            <input [value]="q()" (input)="q.set($any($event.target).value)" (keydown.enter)="generate()" placeholder="e.g. Overtime hours by department this month" />
            <button class="btn-primary" [disabled]="busy()" (click)="generate()">{{ busy() ? 'Generating…' : 'Generate Report' }}</button>
          </div>
          <div class="ex"><span class="muted">Try:</span>@for (e of examples; track e) {<button (click)="q.set(e); generate()">{{ e }}</button>}</div>
        </div>

        @if (busy()) {
          <div class="card steps">
            @for (s of stepNames; track s; let i = $index) {
              <div class="step" [class.done]="step() > i" [class.on]="step() === i"><span>@if (step() > i) {<app-icon name="ai-check" [size]="13" [stroke]="3" />} @else {<i>{{ i + 1 }}</i>}</span>{{ s }}</div>
            }
            <div class="bar"><i [style.width.%]="(step() / stepNames.length) * 100"></i></div>
          </div>
        } @else if (report(); as r) {
          <div class="card rep">
            <div class="rep-h">
              <div><h2>{{ r.title }}</h2><span class="muted">"{{ r.query }}" · generated {{ r.generated }} · source: {{ r.source }}</span></div>
              <div class="rep-btns">
                <button class="btn-ghost" (click)="save()" [disabled]="savedNow()"><app-icon name="ai-save" [size]="15" />{{ savedNow() ? 'Saved' : 'Save' }}</button>
                <button class="btn-ghost" (click)="openSchedule()"><app-icon name="calendar-days" [size]="15" />Schedule</button>
                <button class="btn-ghost" (click)="exportCsv(r)"><app-icon name="download" [size]="15" />Export CSV</button>
                <button class="btn-ghost" (click)="print()" title="Print / PDF"><app-icon name="file-text" [size]="15" />PDF</button>
              </div>
            </div>
            <div class="ai-box"><app-icon name="sparkles" [size]="15" /><ul>@for (s of r.summary; track s) {<li>{{ s }}</li>}</ul></div>
            <div class="rk">@for (k of r.kpis; track k.label) {<div><small>{{ k.label }}</small><b [style.color]="k.color">{{ k.value }}</b></div>}</div>
            <div class="viz-h">
              <h3>Visualization</h3>
              <div class="seg">@for (c of chartTypes; track c) {<button [class.on]="chart() === c" (click)="chart.set(c)">{{ c }}</button>}</div>
            </div>
            @switch (chart()) {
              @case ('Bar') {<app-column-chart [labels]="r.labels" [series]="r.series" [height]="280" [legend]="false" />}
              @case ('Line') {<app-line-chart [labels]="r.labels" [series]="r.series" [height]="280" [legend]="false" />}
              @case ('Donut') {<div class="dn"><app-donut [segments]="segs(r)" [center]="r.series[0].name" [size]="190" /></div>}
              @case ('Table') {<p class="muted">Table view selected — see data below.</p>}
            }
            <h3 class="dt-h">Data</h3>
            <div class="table-wrap">
              <table class="table">
                <thead><tr>@for (c of r.cols; track c) {<th>{{ c }}</th>}</tr></thead>
                <tbody>@for (row of r.rows; track $index) {<tr>@for (c of row; track $index) {<td [class.num]="isNum(c)">{{ isNum(c) ? fmtCell(c) : c }}</td>}</tr>}</tbody>
              </table>
            </div>
            <div class="refine"><span class="muted">Refine:</span>@for (x of refinements(); track x) {<button (click)="refine(x)">{{ x }}</button>}</div>
          </div>
        } @else {
          <div class="card empty"><app-icon name="file-chart" [size]="40" /><b>Ask a question to generate a report</b><p class="muted">Reports use live People360 data: attendance, overtime, headcount, certifications, assets, risk and more.</p></div>
        }
      </div>

      <aside class="side">
        <div class="card">
          <div class="card-head"><h3>Saved Reports</h3><span class="tag">{{ store.reports().length }}</span></div>
          <ul class="saved">
            @for (s of store.reports(); track s.id) {
              <li [class.on]="report()?.query === s.query">
                <button class="s-main" (click)="load(s)"><b>{{ s.title }}</b><small>{{ s.created }}@if (s.schedule) { · <span class="sch"><app-icon name="calendar-days" [size]="11" />{{ s.schedule }}</span>}</small></button>
                <button class="x" title="Delete" (click)="remove(s)"><app-icon name="ai-trash" [size]="14" /></button>
              </li>
            } @empty {<li class="muted">No saved reports.</li>}
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Recent Questions</h3></div>
          <ul class="recent">
            @for (r of recent(); track r) {<li><button (click)="q.set(r); generate()"><app-icon name="ai-history" [size]="13" />{{ r }}</button></li>}
          </ul>
        </div>
      </aside>
    </section>

    @if (sched()) {
      <div class="g-overlay" (click)="sched.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule report</h3><button type="button" class="close-btn" (click)="sched.set(false)">×</button></div>
        <div class="form-grid">
          <label>Frequency<select class="select" [value]="sf().freq" (change)="setSf('freq', $any($event.target).value)">@for (o of freqs; track o) {<option [value]="o">{{ o }}</option>}</select></label>
          <label>Time<input class="input" type="time" [value]="sf().time" (change)="setSf('time', $any($event.target).value)" /></label>
          <label class="full">Recipients<input class="input" [value]="sf().to" (input)="setSf('to', $any($event.target).value)" /></label>
          <label>Format<select class="select" [value]="sf().format" (change)="setSf('format', $any($event.target).value)"><option>PDF</option><option>CSV</option><option>Excel</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sched.set(false)">Cancel</button><button class="btn-primary" type="submit">Save schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .nl { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
    .main { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 76px; }
    .ask { background: linear-gradient(115deg, var(--kb-f1ecff), var(--kb-faf8ff) 60%, var(--kb-efe8ff)); border-color: var(--kl-e4dcfb); }
    .ask-row { display: flex; gap: 10px; align-items: center; background: var(--kb-ffffff); border: 1px solid var(--kl-e4def6); border-radius: 10px; padding: 6px 6px 6px 14px; }
    .ask-row input { flex: 1; border: 0; outline: 0; font: inherit; font-size: 14px; padding: 8px 0; min-width: 0; } .spk { color: var(--primary); }
    .ex { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; font-size: 12px; }
    .ex button, .refine button { border: 1px solid var(--kl-ddd6fe); background: var(--kb-ffffff); color: var(--kf-6d28d9); border-radius: 14px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; }
    .ex button:hover, .refine button:hover { background: var(--kb-f5f3ff); }
    .steps { display: flex; flex-direction: column; gap: 10px; }
    .step { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--kf-8a8fa8); } .step span { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border); display: grid; place-items: center; font-size: 11px; }
    .step.on { color: var(--text); font-weight: 600; } .step.on span { border-color: var(--primary); color: var(--primary); animation: pulse 1s infinite; }
    .step.done { color: var(--kf-15803d); } .step.done span { background: var(--kb-22c55e); border-color: var(--kl-22c55e); color: var(--kf-ffffff); }
    @keyframes pulse { 50% { opacity: 0.4; } }
    .bar { height: 5px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .bar i { display: block; height: 100%; background: var(--primary); transition: width 0.4s; }
    .rep { display: flex; flex-direction: column; gap: 12px; }
    .rep-h { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .rep-h h2 { margin: 0 0 2px; font-size: 20px; } .rep-h .muted { font-size: 12px; }
    .rep-btns { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }
    .ai-box { display: flex; gap: 10px; padding: 10px 12px; background: var(--kb-f7f4ff); border-radius: 10px; color: var(--primary); } .ai-box ul { margin: 0; padding-left: 16px; font-size: 12.5px; color: var(--kf-3d3570); line-height: 1.6; }
    .rk { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; } .rk div { border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; min-width: 0; }
    .rk small { font-size: 11px; color: var(--muted); } .rk b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .viz-h { display: flex; justify-content: space-between; align-items: center; } .viz-h h3, .dt-h { margin: 0; font-size: 14px; }
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: var(--kb-ffffff); padding: 6px 12px; font-size: 12px; cursor: pointer; } .seg button + button { border-left: 1px solid var(--border); } .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
    .dn { display: flex; justify-content: center; padding: 8px 0; }
    .refine { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 60px 20px; color: var(--primary); text-align: center; } .empty b { color: var(--text); }
    .saved, .recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .saved li { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; } .saved li.on { border-color: var(--primary); background: var(--kb-faf8ff); }
    .s-main { flex: 1; border: 0; background: none; text-align: left; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .s-main b { font-size: 12.5px; } .s-main small { font-size: 11px; color: var(--muted); } .sch { color: var(--primary); display: inline-flex; gap: 3px; align-items: center; }
    .x { border: 0; background: none; color: var(--kf-8a8fa8); cursor: pointer; padding: 6px 8px; } .x:hover { color: var(--red); }
    .recent button { border: 0; background: none; cursor: pointer; display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--kf-3d4060); padding: 4px 0; text-align: left; } .recent button:hover { color: var(--primary); }
    @media (max-width: 1200px) { .nl { grid-template-columns: 1fr; } .side { position: static; } }
  `,
})
export class NaturalLanguageReports {
  protected readonly store = inject(AiStore);
  private readonly router = inject(Router);
  protected readonly examples = EXAMPLES;
  protected readonly chartTypes: ChartType[] = ['Bar', 'Line', 'Donut', 'Table'];
  protected readonly stepNames = ['Understanding your question', 'Querying People360 data', 'Building charts & summary'];
  protected readonly freqs = ['Daily', 'Every Monday', 'Every Friday', 'Monthly (1st)'];
  protected readonly q = signal('');
  protected readonly busy = signal(false);
  protected readonly step = signal(0);
  protected readonly report = signal<Report | null>(null);
  protected readonly chart = signal<ChartType>('Bar');
  protected readonly savedNow = signal(false);
  protected readonly sched = signal(false);
  protected readonly sf = signal({ freq: 'Every Monday', time: '08:00', to: 'rex.kumar@purpleiq.com; hr-leads@purpleiq.com', format: 'PDF' });
  protected readonly recent = signal<string[]>(['Overtime hours by department this month', 'Attendance rate by department this week', 'Late arrivals in Sales by employee']);
  protected readonly toast = signal<string | null>(null);
  protected readonly refinements = computed(() => {
    const r = this.report();
    if (!r) return [];
    const base = r.query.replace(/\s+by\s+\w+.*$/i, '');
    return [`${base} by department`, `${base} by employee`, `${base} trend by week`, `${base} by location`].filter((x) => x.toLowerCase() !== r.query.toLowerCase());
  });

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap.get('q');
    if (q) {
      this.q.set(q);
      this.generate();
    } else this.show(this.store.reports()[0].query, false);
  }
  private show(query: string, saved: boolean) {
    const r = buildReport(query);
    this.report.set(r);
    this.chart.set(r.chart);
    this.savedNow.set(saved || this.store.reports().some((s) => s.query === query));
  }
  protected generate() {
    const query = this.q().trim();
    if (!query || this.busy()) return;
    this.busy.set(true);
    this.step.set(0);
    const t = setInterval(() => {
      this.step.update((s) => s + 1);
      if (this.step() >= this.stepNames.length) {
        clearInterval(t);
        this.busy.set(false);
        this.show(query, false);
        this.recent.update((l) => [query, ...l.filter((x) => x !== query)].slice(0, 6));
      }
    }, 520);
  }
  protected refine(x: string) {
    this.q.set(x);
    this.generate();
  }
  protected load(s: SavedReport) {
    this.q.set(s.query);
    this.show(s.query, true);
  }
  protected clear() {
    this.q.set('');
    this.report.set(null);
  }
  protected save() {
    const r = this.report()!;
    if (this.store.reports().some((s) => s.query === r.query)) return this.savedNow.set(true);
    this.store.reports.update((l) => [{ id: this.store.id(), title: r.title, query: r.query, created: r.generated.split(',')[0] }, ...l]);
    this.savedNow.set(true);
    this.flash('Report saved');
  }
  protected remove(s: SavedReport) {
    this.store.reports.update((l) => l.filter((x) => x.id !== s.id));
    if (this.report()?.query === s.query) this.savedNow.set(false);
  }
  protected openSchedule() {
    this.sched.set(true);
  }
  protected setSf(k: 'freq' | 'time' | 'to' | 'format', v: string) {
    this.sf.update((f) => ({ ...f, [k]: v }));
  }
  protected saveSchedule() {
    this.save();
    const r = this.report()!;
    const f = this.sf();
    this.store.reports.update((l) => l.map((s) => (s.query === r.query ? { ...s, schedule: `${f.freq} ${f.time}` } : s)));
    this.sched.set(false);
    this.flash(`Scheduled ${f.freq.toLowerCase()} at ${f.time} · ${f.format} to ${f.to.split(';').length} recipient(s)`);
  }
  protected segs(r: Report) {
    return r.labels.map((l, i) => ({ label: l, value: r.series[0].values[i], color: PALETTE[i % PALETTE.length] }));
  }
  protected isNum(c: string | number) {
    return typeof c === 'number';
  }
  protected fmtCell(c: string | number) {
    return Number.isInteger(c) ? fmtN(+c) : (+c).toFixed(1);
  }
  protected exportCsv(r: Report) {
    downloadCsv(r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv', [r.cols, ...r.rows]);
  }
  protected print() {
    window.print();
  }
  protected openCopilot() {
    if (this.q().trim()) this.store.pending.set(this.q().trim());
    this.router.navigateByUrl('/ai-people-intelligence/people360-ai-copilot');
  }
  private flash(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* =====================================================================================
 * Recommendation Engine
 * ===================================================================================== */
const RCATS = ['All', 'Safety', 'Compliance', 'Workspace', 'Attendance', 'Scheduling', 'Wellbeing', 'Cost'] as const;
const RSTATUS = ['Open', 'In Progress', 'Done', 'Snoozed', 'Dismissed', 'All'] as const;
const REASONS = ['Not relevant for my sites', 'Already handled', 'Data looks wrong', 'Too costly right now', 'Other'];

@Component({
  selector: 'app-ai-recommendation-engine',
  imports: [...UI, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Recommendation Engine" parent="AI &amp; People Intelligence" parentLink="/ai-people-intelligence" subtitle="Prioritised, explainable actions generated from attendance, safety, space, scheduling and compliance signals.">
      <select class="select" [value]="sort()" (change)="sort.set($any($event.target).value)"><option value="impact">Sort: Impact</option><option value="confidence">Sort: Confidence</option><option value="savings">Sort: Savings</option></select>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="refresh()" [disabled]="refreshing()"><app-icon name="refresh" [size]="16" />{{ refreshing() ? 'Analysing…' : 'Refresh Recommendations' }}</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Open Recommendations" [value]="n('Open')" icon="lightbulb" color="var(--ka-8b5cf6)" [sub]="highOpen() + ' high impact'" />
      <app-kpi label="In Progress" [value]="n('In Progress')" icon="activity" color="var(--ka-f97316)" sub="being actioned" />
      <app-kpi label="Completed (30 days)" [value]="n('Done') + 14" icon="shield-check" color="var(--ka-22c55e)" change="22%" sub="vs. previous 30 days" />
      <app-kpi label="Est. Monthly Savings (open)" [value]="'AED ' + fmt(savings())" icon="ai-chart-up" color="var(--ka-3b82f6)" sub="if all open items are accepted" />
      <app-kpi label="Acceptance Rate" [value]="acceptRate() + '%'" icon="ai-thumb-up" color="var(--ka-0891b2)" [sub]="'avg confidence ' + avgConf() + '%'" />
    </section>

    <section class="re">
      <div class="card list">
        <div class="tabs-r">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
        <div class="sts">@for (s of statuses; track s) {<button [class.on]="status() === s" (click)="status.set(s)">{{ s }}<em>{{ s === 'All' ? store.recs().length : n(s) }}</em></button>}</div>
        <ul>
          @for (r of list(); track r.id) {
            <li [class.on]="sel()?.id === r.id" (click)="selId.set(r.id)">
              <span class="r-ic" [style.background]="r.color"><app-icon [name]="r.icon" [size]="16" /></span>
              <div class="r-m">
                <b>{{ r.title }}</b>
                <div class="r-meta"><span class="tag grey">{{ r.category }}</span><span [class]="'tag ' + impTag(r.impact)">{{ r.impact }} impact</span><span class="muted">{{ r.confidence }}% confidence</span>@if (r.savings) {<span class="muted">· AED {{ fmt(r.savings) }}/mo</span>}</div>
              </div>
              @if (r.status === 'Open') {
                <button class="btn-primary sm" (click)="$event.stopPropagation(); accept(r)">{{ r.action }}</button>
              } @else {<span [class]="'tag ' + stTag(r.status)">{{ r.status }}</span>}
            </li>
          } @empty {<li class="muted empty">Nothing here — you're all caught up.</li>}
        </ul>
      </div>

      @if (sel(); as r) {
        <div class="card det">
          <div class="d-h">
            <span class="d-ic" [style.background]="r.color"><app-icon [name]="r.icon" [size]="22" /></span>
            <div><h2>{{ r.title }}</h2><span class="muted">{{ r.id }} · {{ r.category }} · affects {{ r.affected }} {{ r.affected === 1 ? 'item' : 'people / items' }}</span></div>
            <span [class]="'tag ' + stTag(r.status)">{{ r.status }}</span>
          </div>
          <div class="d-k">
            <div><app-ring [value]="r.confidence" [color]="r.color" [size]="60" /><small>Confidence</small></div>
            <div><b [class]="impTag(r.impact) + '-t'">{{ r.impact }}</b><small>Impact</small></div>
            <div><b>AED {{ fmt(r.savings) }}</b><small>Est. savings / month</small></div>
            <div><b>{{ r.affected }}</b><small>Affected</small></div>
          </div>
          <div class="ai-box"><app-icon name="sparkles" [size]="15" /><div><b>Why this recommendation</b><p>{{ r.why }}</p></div></div>
          <h4>Action plan @if (r.status === 'In Progress') {<span class="muted">· tick steps as you complete them</span>}</h4>
          <ul class="steps">
            @for (s of r.steps; track s; let i = $index) {
              <li><label><input type="checkbox" [checked]="isChecked(r.id, i)" [disabled]="r.status !== 'In Progress'" (change)="toggleStep(r, i)" /><span [class.done]="isChecked(r.id, i)">{{ s }}</span></label></li>
            }
          </ul>
          <h4>Affected</h4>
          <div class="ppl">@for (p of r.people.slice(0, 12); track p) {<span class="chip-s">{{ p }}</span>}@if (r.people.length > 12) {<span class="muted">+{{ r.people.length - 12 }} more</span>}</div>
          <div class="acts">
            @if (r.status === 'Open' || r.status === 'Snoozed') {<button class="btn-primary" (click)="accept(r)"><app-icon name="ai-check" [size]="15" />{{ r.action }}</button>}
            @if (r.status === 'In Progress') {<button class="btn-primary" (click)="complete(r)"><app-icon name="ai-check" [size]="15" />Mark as done</button>}
            @if (r.link) {<button class="btn-ghost" (click)="go(r.link)">Open related module →</button>}
            <button class="btn-ghost" (click)="askCopilot(r)"><app-icon name="sparkles" [size]="15" />Ask Copilot</button>
            @if (r.status === 'Open') {<button class="btn-ghost" (click)="snooze(r)">Snooze 7 days</button><button class="btn-ghost danger" (click)="dismissing.set(r.id)">Dismiss</button>}
            @if (r.status === 'Dismissed' || r.status === 'Done') {<button class="btn-ghost" (click)="reopen(r)"><app-icon name="refresh" [size]="15" />Reopen</button>}
          </div>
        </div>
      }
    </section>

    @if (dismissing(); as id) {
      <div class="g-overlay" (click)="dismissing.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); dismiss(id)">
        <div class="modal-head"><h3>Dismiss recommendation</h3><button type="button" class="close-btn" (click)="dismissing.set(null)">×</button></div>
        <p class="muted">Your feedback trains the engine to make better suggestions.</p>
        <div class="form-grid"><label class="full">Reason<select class="select" [value]="reason()" (change)="reason.set($any($event.target).value)">@for (r of reasons; track r) {<option [value]="r">{{ r }}</option>}</select></label></div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="dismissing.set(null)">Cancel</button><button class="btn-primary" type="submit">Dismiss</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .re { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    .tabs-r { display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin-bottom: 10px; overflow-x: auto; }
    .tabs-r button { border: 0; background: none; padding: 8px 0; font-size: 12.5px; color: var(--kf-4b4f6b); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; } .tabs-r button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .sts { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .sts button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 14px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; display: inline-flex; gap: 5px; } .sts button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .sts em { font-style: normal; opacity: 0.75; font-size: 10.5px; }
    .list ul { list-style: none; margin: 0; padding: 0; }
    .list li { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: center; padding: 11px 8px; border-bottom: 1px solid var(--kl-f3f2f8); border-radius: 8px; cursor: pointer; }
    .list li:hover { background: var(--kb-faf8ff); } .list li.on { background: var(--kb-f3eeff); } .list li.empty { display: block; cursor: default; }
    .r-ic { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .r-m { min-width: 0; display: flex; flex-direction: column; gap: 4px; } .r-m b { font-size: 13px; } .r-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 11.5px; }
    .btn-primary.sm { padding: 6px 12px; font-size: 12px; white-space: nowrap; }
    .det { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 76px; }
    .d-h { display: grid; grid-template-columns: 46px 1fr auto; gap: 12px; align-items: center; } .d-h h2 { margin: 0; font-size: 18px; } .d-h div { display: flex; flex-direction: column; }
    .d-ic { width: 46px; height: 46px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .d-k { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .d-k div { border: 1px solid var(--border); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
    .d-k b { font-size: 17px; } .d-k small { font-size: 11px; color: var(--muted); }
    .red-t { color: var(--kf-dc2626); } .amber-t { color: var(--kf-b45309); } .grey-t { color: var(--kf-4b5563); }
    .ai-box { display: flex; gap: 10px; padding: 10px 12px; background: var(--kb-f7f4ff); border-radius: 10px; color: var(--primary); } .ai-box b { font-size: 12.5px; color: var(--text); } .ai-box p { margin: 2px 0 0; font-size: 12.5px; color: var(--kf-3d3570); line-height: 1.45; }
    h4 { margin: 0; font-size: 13px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; } .steps label { display: flex; gap: 8px; align-items: center; font-size: 12.5px; cursor: pointer; } .steps input { accent-color: var(--primary); }
    .steps .done { text-decoration: line-through; color: var(--muted); }
    .ppl { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 12px; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; } .danger { color: var(--red); }
    @media (max-width: 1200px) { .re { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class RecommendationEngine {
  protected readonly store = inject(AiStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly cats = RCATS;
  protected readonly statuses = RSTATUS;
  protected readonly reasons = REASONS;
  protected readonly cat = signal<(typeof RCATS)[number]>('All');
  protected readonly status = signal<(typeof RSTATUS)[number]>('Open');
  protected readonly sort = signal<'impact' | 'confidence' | 'savings'>('impact');
  protected readonly selId = signal<string | null>(null);
  protected readonly dismissing = signal<string | null>(null);
  protected readonly reason = signal(REASONS[0]);
  protected readonly refreshing = signal(false);
  protected readonly checked = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);

  protected readonly list = computed(() => {
    const rank = { High: 3, Medium: 2, Low: 1 };
    const s = this.sort();
    return this.store
      .recs()
      .filter((r) => (this.cat() === 'All' || r.category === this.cat()) && (this.status() === 'All' || r.status === this.status()))
      .sort((a, b) => (s === 'impact' ? rank[b.impact] - rank[a.impact] || b.confidence - a.confidence : s === 'confidence' ? b.confidence - a.confidence : b.savings - a.savings));
  });
  protected readonly sel = computed(() => this.store.recs().find((r) => r.id === this.selId()) ?? this.list()[0] ?? null);
  protected readonly highOpen = computed(() => this.store.recs().filter((r) => r.status === 'Open' && r.impact === 'High').length);
  protected readonly savings = computed(() => this.store.recs().filter((r) => r.status === 'Open').reduce((a, r) => a + r.savings, 0));
  protected readonly acceptRate = computed(() => {
    const l = this.store.recs();
    const acted = l.filter((r) => r.status === 'In Progress' || r.status === 'Done').length + 14;
    return Math.round((acted / (acted + l.filter((r) => r.status === 'Dismissed').length + 3)) * 100);
  });
  protected readonly avgConf = computed(() => Math.round(this.store.recs().reduce((a, r) => a + r.confidence, 0) / this.store.recs().length));

  constructor() {
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
    if (id) {
      this.selId.set(id);
      this.status.set('All');
    }
  }
  protected n(s: string) {
    return this.store.recs().filter((r) => r.status === s).length;
  }
  protected impTag(i: string) {
    return i === 'High' ? 'red' : i === 'Medium' ? 'amber' : 'grey';
  }
  protected stTag(s: RStatus) {
    return s === 'Done' ? 'green' : s === 'In Progress' ? 'blue' : s === 'Dismissed' ? 'grey' : s === 'Snoozed' ? 'amber' : '';
  }
  protected isChecked(id: string, i: number) {
    return this.checked().has(id + i);
  }
  protected toggleStep(r: Rec, i: number) {
    this.checked.update((s) => {
      const n = new Set(s);
      n.has(r.id + i) ? n.delete(r.id + i) : n.add(r.id + i);
      return n;
    });
    if (r.steps.every((_, k) => this.isChecked(r.id, k))) this.complete(r);
  }
  protected accept(r: Rec) {
    this.selId.set(r.id);
    this.store.patchRec(r.id, { status: 'In Progress' });
    this.store.addTask(r.title);
    if (r.id === 'RC-02') this.store.remind(EXPIRING.map((e) => e.name));
    this.flash(`"${r.action}" started · task created and owners notified`);
  }
  protected complete(r: Rec) {
    this.store.patchRec(r.id, { status: 'Done' });
    this.checked.update((s) => new Set([...s, ...r.steps.map((_, i) => r.id + i)]));
    this.flash(`${r.title} — completed`);
  }
  protected snooze(r: Rec) {
    this.store.patchRec(r.id, { status: 'Snoozed' });
    this.flash('Snoozed for 7 days');
  }
  protected dismiss(id: string) {
    this.store.patchRec(id, { status: 'Dismissed' });
    this.dismissing.set(null);
    this.flash(`Dismissed · reason "${this.reason()}" recorded`);
  }
  protected reopen(r: Rec) {
    this.store.patchRec(r.id, { status: 'Open' });
    this.checked.update((s) => new Set([...s].filter((k) => !k.startsWith(r.id))));
  }
  protected refresh() {
    this.refreshing.set(true);
    setTimeout(() => {
      this.refreshing.set(false);
      const snoozed = this.store.recs().filter((r) => r.status === 'Snoozed');
      snoozed.forEach((r) => this.store.patchRec(r.id, { status: 'Open' }));
      this.flash(snoozed.length ? `${snoozed.length} snoozed recommendation(s) re-evaluated and reopened` : 'Recommendations are up to date · confidence scores refreshed');
    }, 1500);
  }
  protected go(url: string) {
    this.router.navigateByUrl(url);
  }
  protected askCopilot(r: Rec) {
    const q = r.category === 'Safety' || r.category === 'Compliance' ? 'List employees with expiring certifications' : r.category === 'Workspace' ? 'Find available meeting rooms' : r.category === 'Scheduling' ? 'Which department has the highest overtime?' : r.category === 'Wellbeing' ? 'Who is at risk of leaving?' : 'Show late arrivals in Sales';
    this.store.pending.set(q);
    this.router.navigateByUrl('/ai-people-intelligence/people360-ai-copilot');
  }
  protected exportCsv() {
    downloadCsv('recommendations.csv', [['ID', 'Title', 'Category', 'Impact', 'Confidence %', 'Savings AED/mo', 'Affected', 'Status'], ...this.list().map((r) => [r.id, r.title, r.category, r.impact, r.confidence, r.savings, r.affected, r.status])]);
  }
  private flash(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

