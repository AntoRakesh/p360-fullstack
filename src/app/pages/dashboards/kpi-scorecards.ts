import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv, MONTHS, series } from './demo-data';

type Rag = 'On Track' | 'At Risk' | 'Off Track';
interface Scorecard {
  group: string;
  name: string;
  unit: string;
  target: number;
  actual: number;
  /** true when lower values are better (e.g. incidents). */
  lowerBetter?: boolean;
  owner: string;
  trend: number[];
}

const BASE: Omit<Scorecard, 'trend'>[] = [
  { group: 'People', name: 'Attendance Rate', unit: '%', target: 95, actual: 96.8, owner: 'HR' },
  { group: 'People', name: 'Unplanned Absence', unit: '%', target: 2.5, actual: 2.9, lowerBetter: true, owner: 'HR' },
  { group: 'People', name: 'Employee Turnover (annual)', unit: '%', target: 12, actual: 10.4, lowerBetter: true, owner: 'HR' },
  { group: 'Security', name: 'Access Denial Rate', unit: '%', target: 2.5, actual: 1.96, lowerBetter: true, owner: 'Security' },
  { group: 'Security', name: 'Alarm Response Time', unit: 'min', target: 5, actual: 6.4, lowerBetter: true, owner: 'Security' },
  { group: 'Security', name: 'Device Uptime', unit: '%', target: 99.5, actual: 99.3, owner: 'IT' },
  { group: 'Operations', name: 'Workforce Utilization', unit: '%', target: 80, actual: 82, owner: 'Operations' },
  { group: 'Operations', name: 'Task On-time Completion', unit: '%', target: 92, actual: 93.4, owner: 'Operations' },
  { group: 'Operations', name: 'Overtime Cost vs Budget', unit: '%', target: 100, actual: 112, lowerBetter: true, owner: 'Finance' },
  { group: 'Compliance', name: 'Training Compliance', unit: '%', target: 95, actual: 91.2, owner: 'L&D' },
  { group: 'Compliance', name: 'Valid Contractor Permits', unit: '%', target: 100, actual: 98.6, owner: 'Procurement' },
  { group: 'Compliance', name: 'Evacuation Drill Accountability', unit: '%', target: 98, actual: 98.9, owner: 'HSE' },
];

@Component({
  selector: 'app-kpi-scorecards',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Executive KPI Scorecards">
      <div class="tabs">
        @for (p of periods; track p) {
          <button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>
        }
      </div>
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-ghost" (click)="print()"><app-icon name="file-text" [size]="16" />Print</button>
    </app-page-head>

    <section class="summary">
      @for (r of rags; track r) {
        <button class="card rag" [class.on]="rag() === r" [style.border-top-color]="ragColor[r]" (click)="rag.set(rag() === r ? null : r)">
          <span>{{ r }}</span>
          <b [style.color]="ragColor[r]">{{ ragCount(r) }}</b>
          <small>of {{ cards().length }} KPIs</small>
        </button>
      }
      <div class="card rag overall">
        <span>Overall score</span>
        <b>{{ overall() }}</b>
        <small>weighted achievement</small>
      </div>
    </section>

    @for (g of groups(); track g.name) {
      <h3 class="group-title">{{ g.name }}</h3>
      <section class="score-grid">
        @for (c of g.items; track c.name) {
          <div class="card score" [style.border-left-color]="ragColor[c.rag]">
            <div class="score-top">
              <span>{{ c.name }}</span>
              <span class="tag" [style.background]="ragColor[c.rag] + '1f'" [style.color]="ragColor[c.rag]">{{ c.rag }}</span>
            </div>
            <div class="score-mid">
              <b>{{ c.actual }}{{ c.unit === '%' ? '%' : ' ' + c.unit }}</b>
              <span class="muted">target {{ c.lowerBetter ? '≤' : '≥' }} {{ c.target }}{{ c.unit === '%' ? '%' : ' ' + c.unit }}</span>
            </div>
            <div class="ach"><i [style.width.%]="min(c.ach, 100)" [style.background]="ragColor[c.rag]"></i></div>
            <app-sparkline [values]="c.trend" [color]="ragColor[c.rag]" />
            <div class="score-foot"><span>{{ c.ach }}% of target</span><span>Owner: {{ c.owner }}</span></div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .rag { display: flex; flex-direction: column; gap: 2px; border-top: 4px solid; text-align: left; cursor: pointer; font-family: inherit; }
    .rag.on { box-shadow: 0 0 0 2px var(--primary-soft); border-color: var(--primary); }
    .rag span { font-size: 12.5px; color: #4b4f6b; } .rag b { font-size: 28px; } .rag small { font-size: 11.5px; color: var(--muted); }
    .overall { border-top-color: var(--primary); cursor: default; } .overall b { color: var(--primary); }
    .group-title { margin: 6px 0 10px; font-size: 15px; color: #4b4f6b; }
    .score-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .score { display: flex; flex-direction: column; gap: 8px; border-left: 4px solid; }
    .score-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; }
    .score-mid { display: flex; align-items: baseline; gap: 10px; } .score-mid b { font-size: 24px; }
    .ach { height: 6px; border-radius: 3px; background: #eef0f6; overflow: hidden; }
    .ach i { display: block; height: 100%; transition: width 0.4s; }
    .score-foot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); }
  `,
})
export class KpiScorecards {
  private readonly state = inject(AppState);
  protected readonly periods = ['Month', 'Quarter', 'Year'];
  protected readonly period = signal('Month');
  protected readonly rags: Rag[] = ['On Track', 'At Risk', 'Off Track'];
  protected readonly ragColor: Record<Rag, string> = { 'On Track': '#16a34a', 'At Risk': '#d97706', 'Off Track': '#dc2626' };
  protected readonly rag = signal<Rag | null>(null);
  protected readonly min = Math.min;

  protected readonly cards = computed(() => {
    const p = this.period();
    const shift = p === 'Quarter' ? -0.4 : p === 'Year' ? -0.9 : 0;
    const siteAdj = this.state.site().factor === 1 ? 0 : (this.state.site().name.length % 5) * 0.2 - 0.4;
    return BASE.map((b, i) => {
      const actual = Math.round((b.actual + (b.lowerBetter ? -shift : shift) * (b.unit === '%' ? 1 : 0.3) + siteAdj) * 10) / 10;
      const ach = Math.round((b.lowerBetter ? b.target / actual : actual / b.target) * 1000) / 10;
      const rag: Rag = ach >= 100 ? 'On Track' : ach >= 92 ? 'At Risk' : 'Off Track';
      return { ...b, actual, ach, rag, trend: series(p === 'Year' ? 12 : 6, b.actual, b.actual * 0.04, i * 9 + p.length) };
    });
  });
  protected readonly groups = computed(() => {
    const items = this.cards().filter((c) => !this.rag() || c.rag === this.rag());
    return ['People', 'Security', 'Operations', 'Compliance']
      .map((name) => ({ name, items: items.filter((c) => c.group === name) }))
      .filter((g) => g.items.length);
  });
  protected readonly overall = computed(() => {
    const c = this.cards();
    return `${(c.reduce((a, x) => a + Math.min(x.ach, 110), 0) / c.length).toFixed(1)}%`;
  });

  protected ragCount(r: Rag) {
    return this.cards().filter((c) => c.rag === r).length;
  }
  protected exportCsv() {
    downloadCsv(`kpi-scorecards-${this.period().toLowerCase()}.csv`, [
      ['Group', 'KPI', 'Actual', 'Target', 'Unit', 'Achievement %', 'Status', 'Owner'],
      ...this.cards().map((c) => [c.group, c.name, c.actual, c.target, c.unit, c.ach, c.rag, c.owner]),
    ]);
  }
  protected print() {
    window.print();
  }
  protected readonly months = MONTHS;
}
