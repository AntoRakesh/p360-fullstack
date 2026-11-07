import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { DEPARTMENTS, downloadCsv, fmt, NAMES, rng, series } from './demo-data';

interface Team {
  team: string;
  lead: string;
  dept: string;
  members: number;
  util: number;
  tasks: number;
  ontime: number;
  overtime: number;
}

const TEAMS: Team[] = (() => {
  const r = rng(303);
  const names = ['Alpha', 'Bravo', 'Falcon', 'Orion', 'Nova', 'Atlas', 'Vega', 'Titan', 'Phoenix', 'Zenith', 'Comet', 'Polaris'];
  return names.map((n, i) => ({
    team: `Team ${n}`,
    lead: NAMES[(i * 5) % NAMES.length],
    dept: DEPARTMENTS[i % DEPARTMENTS.length],
    members: 8 + Math.floor(r() * 30),
    util: Math.round(68 + r() * 28),
    tasks: Math.round(120 + r() * 520),
    ontime: Math.round((86 + r() * 13) * 10) / 10,
    overtime: Math.round(20 + r() * 160),
  }));
})();

@Component({
  selector: 'app-workforce-productivity',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workforce Productivity">
      <div class="tabs">
        @for (p of periods; track p) {
          <button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>
        }
      </div>
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Workforce Utilization" [value]="k().util + '%'" icon="activity" color="#8b5cf6" change="2.1%" />
      <app-kpi label="Tasks Completed" [value]="k().tasks" icon="list-checks" color="#22c55e" change="9%" />
      <app-kpi label="On-time Completion" value="93.4%" icon="clock" color="#3b82f6" change="0.8%" />
      <app-kpi label="Overtime Hours" [value]="k().ot" icon="coffee" color="#f97316" change="5%" [up]="true" [good]="false" />
      <app-kpi label="Avg. Task Time" value="38 min" icon="trending-up" color="#06b6d4" change="4%" [up]="false" />
      <app-kpi label="Idle Time" value="6.1%" icon="calendar-x" color="#ef4444" change="0.6%" [up]="false" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Productivity Trend</h3></div>
        <app-line-chart [labels]="trend().labels" [series]="trend().series" [min]="60" [max]="100" suffix="%" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Utilization by Department</h3></div>
        <app-bar-list [rows]="deptUtil()" />
      </div>

      <div class="card span-8">
        <div class="card-head">
          <h3>Team Leaderboard</h3>
          <select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)">
            <option value="All">All departments</option>
            @for (d of depts; track d) {
              <option [value]="d">{{ d }}</option>
            }
          </select>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th class="sortable" (click)="sortBy('team')">Team {{ arrow('team') }}</th>
                <th>Lead</th>
                <th class="sortable num" (click)="sortBy('members')">Members {{ arrow('members') }}</th>
                <th class="sortable" (click)="sortBy('util')">Utilization {{ arrow('util') }}</th>
                <th class="sortable num" (click)="sortBy('tasks')">Tasks {{ arrow('tasks') }}</th>
                <th class="sortable num" (click)="sortBy('ontime')">On-time {{ arrow('ontime') }}</th>
                <th class="sortable num" (click)="sortBy('overtime')">Overtime h {{ arrow('overtime') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (t of teams(); track t.team; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td><b>{{ t.team }}</b><div class="muted">{{ t.dept }}</div></td>
                  <td>{{ t.lead }}</td>
                  <td class="num">{{ t.members }}</td>
                  <td><span class="mini-progress"><i [style.width.%]="t.util" [style.background]="t.util < 75 ? '#f59e0b' : '#7c3aed'"></i></span>{{ t.util }}%</td>
                  <td class="num">{{ t.tasks }}</td>
                  <td class="num">{{ t.ontime }}%</td>
                  <td class="num" [class.warn-t]="t.overtime > 140">{{ t.overtime }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Task Status</h3></div>
        <app-donut [segments]="taskStatus()" center="Tasks" />
      </div>

      <div class="card span-12">
        <div class="card-head"><h3>Overtime by Department <span class="card-sub">hours</span></h3></div>
        <app-column-chart [labels]="depts" [series]="overtime()" [height]="210" />
      </div>
    </section>
  `,
})
export class WorkforceProductivity {
  private readonly state = inject(AppState);
  protected readonly periods = ['Week', 'Month', 'Quarter'];
  protected readonly period = signal('Month');
  protected readonly depts = DEPARTMENTS;
  protected readonly dept = signal('All');
  protected readonly sort = signal<{ key: keyof Team; dir: 1 | -1 }>({ key: 'util', dir: -1 });
  private readonly mult = computed(() => ({ Week: 0.25, Month: 1, Quarter: 3 })[this.period()] ?? 1);

  protected readonly k = computed(() => ({
    util: 82 + (this.period() === 'Week' ? 1 : this.period() === 'Quarter' ? -1 : 0),
    tasks: fmt(this.state.scale(4812) * this.mult()),
    ot: fmt(this.state.scale(1264) * this.mult()),
  }));
  protected readonly trend = computed(() => {
    const n = { Week: 7, Month: 12, Quarter: 13 }[this.period()] ?? 12;
    const unit = this.period() === 'Week' ? 'Day' : 'Wk';
    return {
      labels: Array.from({ length: n }, (_, i) => `${unit} ${i + 1}`),
      series: [
        { name: 'Utilization', color: '#7c3aed', values: series(n, 81, 5, n * 3), area: true },
        { name: 'On-time %', color: '#22c55e', values: series(n, 93, 3, n * 5) },
      ],
    };
  });
  protected readonly deptUtil = computed(() =>
    DEPARTMENTS.map((label, i) => {
      const v = [86, 84, 77, 72, 69, 88, 91, 80][i];
      return { label, value: v, display: `${v}%`, color: v < 75 ? '#f59e0b' : '#8b5cf6' };
    }),
  );
  protected readonly teams = computed(() => {
    const { key, dir } = this.sort();
    return TEAMS.filter((t) => this.dept() === 'All' || t.dept === this.dept())
      .map((t) => ({ ...t, tasks: Math.round(t.tasks * this.mult()), overtime: Math.round(t.overtime * this.mult()) }))
      .sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
  });
  protected readonly taskStatus = computed(() => [
    { label: 'Completed', value: this.state.scale(4812), color: '#22c55e' },
    { label: 'In progress', value: this.state.scale(1240), color: '#3b82f6' },
    { label: 'Overdue', value: this.state.scale(214), color: '#ef4444' },
    { label: 'Not started', value: this.state.scale(690), color: '#c4c9d6' },
  ]);
  protected readonly overtime = computed(() => [
    { name: 'Overtime hours', color: '#f97316', values: [412, 268, 96, 54, 22, 133, 221, 58].map((v) => Math.round(this.state.scale(v) * this.mult())) },
  ]);

  protected sortBy(key: keyof Team) {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  }
  protected arrow(key: keyof Team) {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }
  protected exportCsv() {
    downloadCsv('team-productivity.csv', [
      ['Team', 'Department', 'Lead', 'Members', 'Utilization %', 'Tasks', 'On-time %', 'Overtime h'],
      ...this.teams().map((t) => [t.team, t.dept, t.lead, t.members, t.util, t.tasks, t.ontime, t.overtime]),
    ]);
  }
}
