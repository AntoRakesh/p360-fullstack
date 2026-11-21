import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { avatarColor, dayLabels, DEPARTMENTS, downloadCsv, fmt, initials, NAMES, rng, series } from '@p360/shared/data/demo-data';

const DEPT_HEAD = [2840, 2210, 1120, 640, 310, 720, 1460, 540];

@Component({
  selector: 'app-attendance-dashboard',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Attendance Dashboard">
      <select class="select" [value]="days()" (change)="days.set(+$any($event.target).value)">
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
        <option value="60">Last 60 days</option>
      </select>
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Present" [value]="k().present" icon="user-check" color="var(--ka-22c55e)" change="1.4%" />
      <app-kpi label="Absent" [value]="k().absent" icon="calendar-x" color="var(--ka-ef4444)" change="6%" [up]="false" />
      <app-kpi label="Late Arrivals" [value]="k().late" icon="clock" color="var(--ka-f97316)" change="9%" [up]="false" />
      <app-kpi label="On Leave" [value]="k().leave" icon="calendar-days" color="var(--ka-3b82f6)" change="2%" />
      <app-kpi label="Attendance Rate" value="96.8%" icon="activity" color="var(--ka-8b5cf6)" change="1.2%" />
      <app-kpi label="Missing Punches" [value]="k().missing" icon="fingerprint" color="var(--ka-a855f7)" change="11%" [up]="false" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head">
          <h3>Attendance Rate Trend</h3>
          <span class="muted">target 95%</span>
        </div>
        <app-line-chart [labels]="trend().labels" [series]="trend().series" [min]="85" [max]="100" suffix="%" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Today's Status</h3></div>
        <app-donut [segments]="status()" center="Scheduled" />
      </div>

      <div class="card span-7">
        <div class="card-head">
          <h3>Department Attendance</h3>
          <div class="tabs">
            @for (m of metrics; track m) {
              <button [class.on]="metric() === m" (click)="metric.set(m)">{{ m }}</button>
            }
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Department</th><th class="num">Headcount</th><th class="num">Present</th><th class="num">Absent</th><th class="num">Late</th><th>Rate</th></tr>
            </thead>
            <tbody>
              @for (d of depts(); track d.name) {
                <tr class="clickable" [class.selected]="dept() === d.name" (click)="dept.set(dept() === d.name ? null : d.name)">
                  <td>{{ d.name }}</td>
                  <td class="num">{{ d.head }}</td>
                  <td class="num">{{ d.present }}</td>
                  <td class="num">{{ d.absent }}</td>
                  <td class="num">{{ d.late }}</td>
                  <td>
                    <span class="mini-progress"><i [style.width.%]="d.rate" [style.background]="d.rate < 95 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)'"></i></span>
                    <span [class.warn-t]="d.rate < 95">{{ d.rate }}%</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card span-5">
        <div class="card-head">
          <h3>Late Arrivals Today <span class="card-sub">{{ dept() ?? 'All departments' }}</span></h3>
          @if (dept()) {
            <button class="link" (click)="dept.set(null)">Clear filter</button>
          }
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Employee</th><th>Shift</th><th>In</th><th class="num">Late by</th></tr></thead>
            <tbody>
              @for (l of late(); track l.name) {
                <tr>
                  <td><span class="avatar-sm" [style.background]="color(l.name)">{{ ini(l.name) }}</span>{{ l.name }}</td>
                  <td>{{ l.shift }}</td>
                  <td>{{ l.in }}</td>
                  <td class="num"><span class="tag" [class.red]="l.mins > 30" [class.amber]="l.mins <= 30">{{ l.mins }} min</span></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty-note">No late arrivals</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card span-12">
        <div class="card-head"><h3>Shift-wise Attendance <span class="card-sub">scheduled vs present</span></h3></div>
        <app-column-chart [labels]="shifts" [series]="shiftSeries()" [height]="200" />
      </div>
    </section>
  `,
})
export class AttendanceDashboard {
  private readonly state = inject(AppState);
  protected readonly ini = initials;
  protected readonly color = avatarColor;
  protected readonly days = signal(30);
  protected readonly metrics = ['Today', 'This Week', 'This Month'];
  protected readonly metric = signal('Today');
  protected readonly dept = signal<string | null>(null);
  protected readonly shifts = ['Morning', 'General', 'Afternoon', 'Evening', 'Night', 'Weekend'];

  protected readonly k = computed(() => ({
    present: fmt(this.state.scale(9842) + this.state.wobble('p', 12)),
    absent: fmt(this.state.scale(312)),
    late: fmt(this.state.scale(186) + Math.max(0, this.state.wobble('l', 3))),
    leave: fmt(this.state.scale(421)),
    missing: fmt(this.state.scale(47)),
  }));
  protected readonly trend = computed(() => {
    const n = this.days();
    return {
      labels: dayLabels(n, this.state.date()),
      series: [
        { name: 'Attendance %', color: 'var(--ka-7c3aed)', values: series(n, 96.4, 2.2, n * 7).map((v) => Math.min(99.5, v)), area: true },
        { name: 'Target', color: 'var(--ka-22c55e)', values: Array(n).fill(95), dashed: true },
      ],
    };
  });
  protected readonly status = computed(() => [
    { label: 'Present', value: this.state.scale(9842), color: 'var(--ka-22c55e)' },
    { label: 'Late', value: this.state.scale(186), color: 'var(--ka-f97316)' },
    { label: 'On Leave', value: this.state.scale(421), color: 'var(--ka-3b82f6)' },
    { label: 'Absent', value: this.state.scale(312), color: 'var(--ka-ef4444)' },
  ]);
  protected readonly depts = computed(() => {
    const mult = { Today: 1, 'This Week': 5, 'This Month': 21 }[this.metric()] ?? 1;
    const r = rng(this.metric().length * 17);
    return DEPARTMENTS.map((name, i) => {
      const head = this.state.scale(DEPT_HEAD[i]);
      const rate = Math.round((93 + r() * 6) * 10) / 10;
      const present = Math.round(head * (rate / 100));
      return {
        name,
        head: fmt(head),
        present: fmt(present * mult),
        absent: fmt((head - present) * mult),
        late: fmt(Math.round(head * 0.018 * mult)),
        rate,
      };
    });
  });
  protected readonly late = computed(() => {
    const r = rng(9);
    const shifts = ['Morning 06:00', 'General 09:00', 'General 09:00', 'Afternoon 14:00'];
    return NAMES.slice(0, 18)
      .map((name, i) => {
        const shift = shifts[i % shifts.length];
        const mins = 6 + Math.floor(r() * 50);
        const [h] = shift.split(' ')[1].split(':').map(Number);
        return { name, dept: DEPARTMENTS[i % DEPARTMENTS.length], shift: shift.split(' ')[0], in: `${String(h + Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, mins };
      })
      .filter((l) => !this.dept() || l.dept === this.dept())
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 7);
  });
  protected readonly shiftSeries = computed(() => {
    const sched = [2600, 4200, 1800, 1300, 900, 520].map((v) => this.state.scale(v));
    return [
      { name: 'Scheduled', color: 'var(--ka-c4b5fd)', values: sched },
      { name: 'Present', color: 'var(--ka-7c3aed)', values: sched.map((v, i) => Math.round(v * [0.97, 0.965, 0.95, 0.94, 0.92, 0.9][i])) },
    ];
  });

  protected exportCsv() {
    downloadCsv('attendance-by-department.csv', [
      ['Department', 'Headcount', 'Present', 'Absent', 'Late', 'Rate %'],
      ...this.depts().map((d) => [d.name, d.head, d.present, d.absent, d.late, d.rate]),
    ]);
  }
}
