import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { series } from '../dashboards/demo-data';
import { RosterGrid } from './roster-grid';
import { codeHours, OFF, restViolation, rosterFor, RosterRow, SHIFTS, TEAMS, weekDays, weekStart } from './shifts.data';

/* ======================= AI-Assisted Optimization ======================= */
const STEPS = ['Loading demand forecast', 'Reading availability & preferences', 'Checking skills and rest rules', 'Searching 1.2M roster combinations', 'Scoring best candidates'];

@Component({
  selector: 'app-ai-optimization',
  imports: [...UI, RosterGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="AI-Assisted Optimization" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Let the optimizer propose a roster that balances cost, coverage, fairness and preferences." />
    <section class="opt">
      <div class="card setup">
        <h3>Setup</h3>
        <label>Team<select class="select" [value]="teamId()" (change)="teamId.set($any($event.target).value); result.set(null)">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
        <h4>Objectives (weight)</h4>
        @for (o of objectives; track o.key) {
          <label class="slider">{{ o.label }} <b>{{ weights()[o.key] }}</b>
            <input type="range" min="0" max="10" [value]="weights()[o.key]" (input)="setW(o.key, +$any($event.target).value)" />
          </label>
        }
        <h4>Hard constraints</h4>
        @for (c of constraints; track c) {
          <label class="chk"><input type="checkbox" [checked]="on().has(c)" (change)="toggle(c)" />{{ c }}</label>
        }
        <button class="btn-primary run" (click)="run()" [disabled]="running()"><app-icon name="sparkles" [size]="16" />{{ running() ? 'Optimizing…' : 'Run optimization' }}</button>
      </div>

      <div class="out">
        @if (running()) {
          <div class="card progress">
            <div class="bar"><i [style.width.%]="(step() / steps.length) * 100"></i></div>
            <ol>@for (s of steps; track s; let i = $index) {<li [class.done]="i < step()" [class.cur]="i === step()">{{ i < step() ? '✓' : i === step() ? '…' : '○' }} {{ s }}</li>}</ol>
          </div>
        } @else if (result(); as r) {
          <section class="compare">
            @for (m of r.metrics; track m.label) {
              <div class="card cm">
                <span>{{ m.label }}</span>
                <div><s>{{ m.before }}</s> → <b [class.good]="m.better">{{ m.after }}</b></div>
                <small [class.good]="m.better">{{ m.delta }}</small>
              </div>
            }
          </section>
          <div class="card">
            <div class="card-head">
              <h3>Proposed roster · next week <span class="card-sub">{{ r.changed.size }} shifts changed (dashed)</span></h3>
              <div class="toolbar">
                <button class="btn-ghost" (click)="result.set(null)">Discard</button>
                <button class="btn-primary" (click)="applyIt()" [disabled]="applied()">{{ applied() ? 'Applied to draft' : 'Apply to roster' }}</button>
              </div>
            </div>
            <app-roster-grid [rows]="r.rows" [days]="days()" [required]="team().required" [changed]="r.changed" />
          </div>
        } @else {
          <div class="card idle">
            <app-icon name="sparkles" [size]="36" />
            <h3>Ready to optimize {{ team().name }}</h3>
            <p class="muted">Adjust the weights on the left and press <b>Run optimization</b>. You’ll see the proposed roster and how it compares with the current draft before anything changes.</p>
          </div>
        }
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .opt { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }
    .setup { display: flex; flex-direction: column; gap: 10px; } .setup label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
    .setup h4 { margin: 8px 0 0; font-size: 13px; } .slider input { accent-color: var(--primary); } .chk { flex-direction: row !important; align-items: center; gap: 8px !important; }
    .run { justify-content: center; margin-top: 8px; }
    .progress .bar { height: 10px; border-radius: 5px; background: #eef0f6; overflow: hidden; margin-bottom: 14px; } .progress .bar i { display: block; height: 100%; background: var(--primary); transition: width .4s; }
    .progress ol { list-style: none; padding: 0; margin: 0; font-size: 13px; } .progress li { padding: 5px 0; color: var(--muted); } .progress .done { color: #16a34a; } .progress .cur { color: var(--primary); font-weight: 600; }
    .compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .cm { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .cm div { font-size: 18px; } .cm s { color: var(--muted); font-size: 14px; } .cm small { color: var(--muted); }
    .idle { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 50px 30px; color: var(--primary); } .idle h3 { color: var(--text); }
    @media (max-width: 1000px) { .opt { grid-template-columns: 1fr; } }
  `,
})
export class AiOptimization {
  private readonly state = inject(AppState);
  private readonly destroy = inject(DestroyRef);
  protected readonly teams = TEAMS;
  protected readonly steps = STEPS;
  protected readonly objectives = [
    { key: 'cost', label: 'Minimize labour cost' },
    { key: 'coverage', label: 'Meet coverage' },
    { key: 'fair', label: 'Fair distribution' },
    { key: 'pref', label: 'Respect preferences' },
  ];
  protected readonly constraints = ['11 h rest between shifts', 'Max 48 h per week', 'Max 6 consecutive days', 'Required skills on every shift', 'Approved leave is fixed'];
  protected readonly teamId = signal(TEAMS[0].id);
  protected readonly weights = signal<Record<string, number>>({ cost: 6, coverage: 9, fair: 5, pref: 4 });
  protected readonly on = signal<Set<string>>(new Set(this.constraints));
  protected readonly running = signal(false);
  protected readonly step = signal(0);
  protected readonly applied = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly result = signal<{ rows: RosterRow[]; changed: Set<string>; metrics: { label: string; before: string; after: string; delta: string; better: boolean }[] } | null>(null);
  protected readonly team = computed(() => TEAMS.find((t) => t.id === this.teamId())!);
  protected readonly days = computed(() => weekDays(weekStart(this.state.date(), 1)));

  protected setW(k: string, v: number) {
    this.weights.update((w) => ({ ...w, [k]: v }));
  }
  protected toggle(c: string) {
    this.on.update((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }
  protected run() {
    this.running.set(true);
    this.applied.set(false);
    this.step.set(0);
    const id = setInterval(() => {
      this.step.update((s) => s + 1);
      if (this.step() >= STEPS.length) {
        clearInterval(id);
        this.result.set(this.optimize());
        this.running.set(false);
      }
    }, 600);
    this.destroy.onDestroy(() => clearInterval(id));
  }
  /** Greedy demo optimizer: fill coverage gaps from people with fewest hours, remove rest-rule breaks. */
  private optimize() {
    const t = this.team();
    const before = rosterFor(t, 1);
    const rows = before.map((r) => ({ ...r, days: [...r.days] }));
    const changed = new Set<string>();
    const hours = (r: RosterRow) => r.days.reduce((a, c) => a + codeHours(c), 0);
    // 1. remove rest-rule breaks when rest is a hard constraint
    if (this.on().has('11 h rest between shifts'))
      rows.forEach((r) => r.days.forEach((c, d) => {
        if (d > 0 && restViolation(r.days[d - 1], c)) {
          r.days[d] = OFF;
          changed.add(`${r.id}|${d}`);
        }
      }));
    // 2. fill gaps, favouring least-loaded people (fairness weight) and staying under 48 h
    const w = this.weights();
    for (const [code, need] of Object.entries(t.required))
      for (let d = 0; d < 7; d++) {
        let have = rows.filter((r) => r.days[d] === code).length;
        const target = need + (w['coverage'] >= 8 && w['cost'] < 5 ? 1 : 0);
        const pool = [...rows].sort((a, b) => (w['fair'] >= 5 ? hours(a) - hours(b) : 0));
        for (const r of pool) {
          if (have >= target) break;
          if (r.days[d] !== OFF) continue;
          if (this.on().has('Max 48 h per week') && hours(r) + codeHours(code) > 48) continue;
          if (this.on().has('Max 6 consecutive days') && r.days.filter((c, i) => i !== d && c !== OFF).length >= 6) continue;
          if (this.on().has('11 h rest between shifts') && ((d > 0 && restViolation(r.days[d - 1], code)) || (d < 6 && restViolation(code, r.days[d + 1])))) continue;
          r.days[d] = code;
          changed.add(`${r.id}|${d}`);
          have++;
        }
      }
    const gaps = (rs: RosterRow[]) => Object.entries(t.required).reduce((a, [c, n]) => a + [0, 1, 2, 3, 4, 5, 6].reduce((b, d) => b + Math.max(0, n - rs.filter((r) => r.days[d] === c).length), 0), 0);
    const breaks = (rs: RosterRow[]) => rs.reduce((a, r) => a + r.days.filter((c, d) => d > 0 && restViolation(r.days[d - 1], c)).length, 0);
    const spread = (rs: RosterRow[]) => Math.max(...rs.map(hours)) - Math.min(...rs.map(hours));
    const total = (rs: RosterRow[]) => rs.reduce((a, r) => a + hours(r), 0);
    // Overtime = hours above the contracted 48 h week.
    const ot = (rs: RosterRow[]) => rs.reduce((a, r) => a + Math.max(0, hours(r) - 48), 0);
    const covPct = (rs: RosterRow[]) => {
      const need = Object.values(t.required).reduce((a, n) => a + n * 7, 0);
      return Math.round(((need - gaps(rs)) / need) * 1000) / 10;
    };
    const m = (label: string, b: number, a: number, unit: string, lowerBetter: boolean) => ({
      label, before: `${b}${unit}`, after: `${a}${unit}`, better: lowerBetter ? a < b : a > b,
      delta: a === b ? 'no change' : `${a > b ? '+' : ''}${Math.round((a - b) * 10) / 10}${unit}`,
    });
    return {
      rows,
      changed,
      metrics: [
        m('Coverage', covPct(before), covPct(rows), '%', false),
        m('Rest-rule breaks', breaks(before), breaks(rows), '', true),
        m('Hours spread', spread(before), spread(rows), ' h', true),
        m('Overtime hours', ot(before), ot(rows), ' h', true),
        m('Scheduled hours', total(before), total(rows), ' h', false),
      ],
    };
  }
  protected applyIt() {
    this.applied.set(true);
    this.toast.set('Optimized roster saved as draft — review it in Roster Planning');
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* ======================= Roster Analytics ======================= */
@Component({
  selector: 'app-roster-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Roster Analytics" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="How well schedules are planned and followed.">
      <div class="tabs">@for (p of periods; track p) {<button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>}</div>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Schedule Adherence" value="94.6%" icon="shield-check" color="#22c55e" change="1.1%" />
      <app-kpi label="Coverage Achieved" value="98.5%" icon="activity" color="#8b5cf6" change="0.4%" />
      <app-kpi label="Overtime Share" value="6.8%" icon="clock" color="#f97316" change="0.9%" [good]="false" />
      <app-kpi label="Last-minute Changes" value="142" icon="refresh" color="#ef4444" change="12%" [up]="false" sub="< 48 h notice" />
      <app-kpi label="Roster Publish Lead" value="9.2 days" icon="calendar-days" color="#3b82f6" sub="avg. before start" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Scheduled vs Actual Hours</h3></div>
        <app-line-chart [labels]="labels()" [series]="hours()" [height]="220" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Shift Mix</h3></div>
        <app-donut [segments]="mix" center="Shifts" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Adherence by Team</h3></div>
        <app-bar-list [rows]="adherence" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Schedule Changes by Reason</h3></div>
        <app-column-chart [labels]="reasons" [series]="changes()" [height]="210" [legend]="false" />
      </div>
    </section>
  `,
})
export class RosterAnalytics {
  protected readonly periods = ['4 Weeks', '12 Weeks', '6 Months'];
  protected readonly period = signal('12 Weeks');
  private readonly n = computed(() => ({ '4 Weeks': 4, '12 Weeks': 12, '6 Months': 26 })[this.period()] ?? 12);
  protected readonly labels = computed(() => Array.from({ length: this.n() }, (_, i) => `W${45 - this.n() + i + 1}`));
  protected readonly hours = computed(() => {
    const s = series(this.n(), 71000, 2500, this.n());
    return [
      { name: 'Scheduled', color: '#c4b5fd', values: s, area: true },
      { name: 'Actual', color: '#7c3aed', values: s.map((v, i) => Math.round(v * (0.93 + ((i * 7) % 5) / 100))) },
    ];
  });
  protected readonly mix = (() => {
    const groups: Record<string, number> = {};
    SHIFTS.filter((s) => s.assigned).forEach((s) => (groups[s.type] = (groups[s.type] ?? 0) + s.assigned));
    const colors = ['#7c3aed', '#0284c7', '#dc2626', '#2563eb', '#4338ca', '#65a30d'];
    return Object.entries(groups).map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
  })();
  protected readonly adherence = TEAMS.map((t, i) => {
    const v = [96.2, 93.8, 97.9, 91.4, 92.6, 98.8][i];
    return { label: t.name, value: v, display: `${v}%`, color: v < 93 ? '#f59e0b' : '#22c55e' };
  });
  protected readonly reasons = ['Sickness', 'Swap', 'Demand spike', 'No-show', 'Training', 'Other'];
  protected readonly changes = computed(() => [{ name: 'Changes', color: '#8b5cf6', values: [48, 37, 22, 15, 11, 9].map((v) => Math.round((v * this.n()) / 4)) }]);
}
