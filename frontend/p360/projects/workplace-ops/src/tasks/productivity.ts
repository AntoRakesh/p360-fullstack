// Productivity & Performance — per-employee / team productivity, utilisation, completion vs planned, leaderboard, trends.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { downloadCsv, rng } from '@p360/shared/data/demo-data';
import { TASKS_UI } from './tasks-ui';
import { CAT_NAMES, catMeta, catOf, isOpen, TaskStore, Worker, WORKERS } from './tasks.data';

type Period = 'today' | 'week' | 'month';
type SortKey = 'score' | 'completed' | 'rate' | 'onTime' | 'util' | 'quality' | 'name';
interface Row {
  w: Worker;
  planned: number;
  completed: number;
  rate: number;
  onTime: number;
  util: number;
  quality: number;
  avgDur: number;
  stdDur: number;
  score: number;
  trend: number[];
}
const PERIOD_MULT: Record<Period, number> = { today: 1, week: 5.6, month: 23.4 };
const TREND_LABELS = ['02 Oct', '03 Oct', '04 Oct', '05 Oct', '06 Oct', '07 Oct', '08 Oct', '09 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct'];
const HM_HOURS = ['06', '08', '10', '12', '14', '16', '18', '20'];
const TEAM_COLORS = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-06b6d4)', 'var(--ka-ec4899)', 'var(--ka-64748b)', 'var(--ka-0d9488)', 'var(--ka-a855f7)'];

@Component({
  selector: 'app-tasks-productivity-performance',
  imports: [...UI, ...TASKS_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Productivity &amp; Performance" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Completion vs. plan, utilisation, on-time delivery and quality — per employee and per team.">
      <div class="tabs per">
        <button [class.on]="period() === 'today'" (click)="period.set('today')">Today</button>
        <button [class.on]="period() === 'week'" (click)="period.set('week')">This Week</button>
        <button [class.on]="period() === 'month'" (click)="period.set('month')">This Month</button>
      </div>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export Scorecards</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Completion vs Planned" [value]="tot().rate + '%'" icon="tasks-target" color="var(--ka-7c3aed)" [pct]="tot().completed + ' / ' + tot().planned" pctColor="var(--ka-7c3aed)" sub="tasks" />
      <app-tkpi label="Avg Utilisation" [value]="tot().util + '%'" icon="tasks-gauge" color="var(--ka-2563eb)" change="3.2%" sub="vs. last period" />
      <app-tkpi label="On-time Delivery" [value]="tot().onTime + '%'" icon="clock" color="var(--ka-22c55e)" change="1.1%" sub="within SLA" />
      <app-tkpi label="Quality Score" [value]="tot().quality + '%'" icon="tasks-award" color="var(--ka-f59e0b)" [sub]="'avg rating ' + avgRating() + '★'" />
      <app-tkpi label="Tasks per Worker" [value]="tot().perWorker" icon="users" color="var(--ka-06b6d4)" [sub]="rows().length + ' active workers'" />
    </section>

    <section class="grid">
      <div class="card">
        <div class="card-head">
          <h3>Employee Scorecards <span class="card-sub">{{ periodLabel() }}</span></h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search employee..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="team()" (change)="team.set($any($event.target).value)"><option value="All">All Teams</option>@for (t of teams; track t) {<option [value]="t">{{ t }}</option>}</select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th class="s" (click)="sortBy('name')">Employee{{ arrow('name') }}</th>
              <th class="s" (click)="sortBy('rate')">Completion{{ arrow('rate') }}</th>
              <th class="s num" (click)="sortBy('onTime')">On-time{{ arrow('onTime') }}</th>
              <th class="s" (click)="sortBy('util')">Utilisation{{ arrow('util') }}</th>
              <th class="num">Avg / Std time</th>
              <th class="s num" (click)="sortBy('quality')">Quality{{ arrow('quality') }}</th>
              <th>7-day trend</th>
              <th class="s num" (click)="sortBy('score')">Score{{ arrow('score') }}</th>
            </tr></thead>
            <tbody>
              @for (r of pageRows(); track r.w.id) {
                <tr class="clickable" [class.sel]="selId() === r.w.id" (click)="selId.set(selId() === r.w.id ? null : r.w.id)">
                  <td><span class="avatar-sm" [style.background]="r.w.color">{{ r.w.initials }}</span><span class="nm"><b>{{ r.w.name }}</b><small>{{ r.w.team }}</small></span></td>
                  <td class="nw"><span class="mini-progress"><i [style.width.%]="r.rate" [style.background]="col(r.rate)"></i></span>{{ r.rate }}% <small class="muted">({{ r.completed }}/{{ r.planned }})</small></td>
                  <td class="num">{{ r.onTime }}%</td>
                  <td class="nw"><span class="mini-progress"><i [style.width.%]="r.util" [style.background]="r.util > 95 ? 'var(--ka-ef4444)' : 'var(--ka-3b82f6)'"></i></span>{{ r.util }}%</td>
                  <td class="num" [style.color]="r.avgDur > r.stdDur * 1.15 ? 'var(--ka-b91c1c)' : ''">{{ r.avgDur }} / {{ r.stdDur }}m</td>
                  <td class="num">{{ r.quality }}%</td>
                  <td class="sp"><app-sparkline [values]="r.trend" [color]="r.trend[6] >= r.trend[0] ? 'var(--ka-16a34a)' : 'var(--ka-ef4444)'" /></td>
                  <td class="num"><span class="score" [style.background]="'color-mix(in srgb, ' + col(r.score) + ' 12%, transparent)'" [style.color]="col(r.score)">{{ r.score }}</span></td>
                </tr>
              } @empty {<tr><td colspan="8" class="muted center">No employees match</td></tr>}
            </tbody>
          </table>
        </div>
        <div class="pager"><span>{{ filtered().length }} employees</span>
          <span><button class="btn-ghost sm" [disabled]="pg() === 0" (click)="pg.set(pg() - 1)">Prev</button> {{ pg() + 1 }} / {{ pages() }} <button class="btn-ghost sm" [disabled]="pg() >= pages() - 1" (click)="pg.set(pg() + 1)">Next</button></span>
        </div>
      </div>

      <div class="side">
        @if (sel(); as r) {
          <div class="card det">
            <div class="card-head"><h3>{{ r.w.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <div class="hero">
              <app-ring [value]="r.score" [size]="74" [color]="col(r.score)" />
              <div><small>{{ r.w.role }} · {{ r.w.team }}</small><small>{{ r.w.site }} · {{ r.w.shift }}</small><span class="rank">Rank #{{ rankOf(r.w.id) }} of {{ rows().length }}</span></div>
            </div>
            <div class="mets">
              <span>Completion<b>{{ r.rate }}%</b></span><span>On-time<b>{{ r.onTime }}%</b></span><span>Utilisation<b>{{ r.util }}%</b></span><span>Quality<b>{{ r.quality }}%</b></span>
            </div>
            <h4>Last 7 days</h4>
            <app-column-chart [labels]="week" [series]="weekSeries(r)" [height]="150" />
            <h4>Task mix</h4>
            <app-bar-list [rows]="mixOf(r.w)" [max]="mixMax(r.w)" />
            @if (notes()[r.w.id]?.length) {
              <h4>Coaching notes</h4>
              <ul class="notes">@for (n of notes()[r.w.id]; track $index) {<li>{{ n }}</li>}</ul>
            }
            <div class="row">
              <button class="btn-primary sm" (click)="kudos(r.w)"><app-icon name="tasks-award" [size]="14" />Recognise</button>
              <button class="btn-ghost sm" (click)="noteFor.set(r.w.id); noteText.set('')"><app-icon name="message" [size]="14" />Coaching note</button>
              <button class="btn-ghost sm" (click)="exportOne(r)"><app-icon name="download" [size]="14" />Scorecard</button>
            </div>
          </div>
        } @else {
          <div class="card lb">
            <div class="card-head"><h3>Leaderboard</h3><span class="card-sub">{{ periodLabel() }}</span></div>
            <ol>
              @for (r of top(); track r.w.id; let i = $index) {
                <li (click)="selId.set(r.w.id)">
                  <span class="medal" [class]="'medal m' + i">{{ i + 1 }}</span>
                  <span class="avatar-sm" [style.background]="r.w.color">{{ r.w.initials }}</span>
                  <span class="nm"><b>{{ r.w.name }}</b><small>{{ r.completed }} tasks · {{ r.onTime }}% on-time</small></span>
                  <b class="pts">{{ r.score }}</b>
                </li>
              }
            </ol>
          </div>
          <div class="card att">
            <div class="card-head"><h3>Needs Attention</h3></div>
            <ul>
              @for (r of bottom(); track r.w.id) {
                <li (click)="selId.set(r.w.id)">
                  <span class="avatar-sm" [style.background]="r.w.color">{{ r.w.initials }}</span>
                  <span class="nm"><b>{{ r.w.name }}</b><small>{{ reasonOf(r) }}</small></span>
                  <b class="pts" [style.color]="col(r.score)">{{ r.score }}</b>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </section>

    <section class="grid3">
      <div class="card">
        <div class="card-head"><h3>Team Completion vs Planned</h3><span class="card-sub">{{ periodLabel() }}</span></div>
        <app-column-chart [labels]="teamStats().labels" [series]="teamStats().series" [height]="240" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Utilisation Heatmap <span class="card-sub">team × 2-hour slot, today incl. planned</span></h3></div>
        <app-heatmap [rows]="hmRows" [cols]="hmCols" [data]="heat()" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Completion Trend <span class="card-sub">last 13 days</span></h3></div>
        <app-line-chart [labels]="trendLabels" [series]="trend()" [height]="240" [min]="60" [max]="100" suffix="%" />
      </div>
    </section>

    @if (noteFor(); as id) {
      <div class="g-overlay" (click)="noteFor.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveNote(id)">
        <div class="modal-head"><h3>Coaching note · {{ nameOf(id) }}</h3><button type="button" class="close-btn" (click)="noteFor.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Focus area<select class="select" [value]="noteArea()" (change)="noteArea.set($any($event.target).value)">@for (a of areas; track a) {<option [value]="a">{{ a }}</option>}</select></label>
          <label class="full">Note<input class="input" [value]="noteText()" (input)="noteText.set($any($event.target).value)" placeholder="e.g. Review checklist photo standards together" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="noteFor.set(null)">Cancel</button><button class="btn-primary">Save &amp; notify</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .per { margin-right: 4px; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
    th.s { cursor: pointer; user-select: none; white-space: nowrap; } th.s:hover { color: var(--primary); }
    td .nm, .nm { display: inline-flex; flex-direction: column; vertical-align: middle; min-width: 0; } .nm b { font-size: 12.5px; white-space: nowrap; } .nm small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sp { width: 76px; } .sp app-sparkline { display: block; width: 68px; } .nw { white-space: nowrap; } .nw .mini-progress { width: 48px; } .nw small { font-size: 11px; }
    .score { display: inline-block; min-width: 38px; text-align: center; padding: 3px 8px; border-radius: 8px; font-weight: 700; font-size: 12.5px; }
    tr.sel td { background: var(--kb-faf8ff); }
    .center { text-align: center; padding: 20px !important; }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12.5px; color: var(--kf-4b4f6b); } .pager button { margin: 0 4px; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .hero { display: flex; gap: 14px; align-items: center; } .hero div { display: flex; flex-direction: column; gap: 3px; } .hero small { color: var(--muted); font-size: 12px; }
    .rank { font-size: 12px; font-weight: 600; color: var(--primary); }
    .mets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 0; } .mets span { display: flex; flex-direction: column; font-size: 10.5px; color: var(--muted); background: var(--kb-fafafe); border: 1px solid var(--border); border-radius: 8px; padding: 6px; } .mets b { font-size: 14px; color: var(--text); }
    h4 { margin: 14px 0 8px; font-size: 13px; }
    .notes { margin: 0; padding-left: 18px; font-size: 12px; color: var(--kf-3b3f5c); } .notes li { margin-bottom: 4px; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; } .btn-primary.sm { padding: 6px 10px; font-size: 12px; }
    .lb ol, .att ul { list-style: none; margin: 0; padding: 0; }
    .lb li, .att li { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f1f2f7); cursor: pointer; } .att li { grid-template-columns: auto 1fr auto; }
    .lb .avatar-sm, .att .avatar-sm { margin: 0; }
    .medal { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; background: var(--kb-eef0f5); color: var(--kf-4b4f6b); }
    .medal.m0 { background: linear-gradient(135deg, var(--kb-fbbf24), var(--kb-f59e0b)); color: var(--kf-ffffff); } .medal.m1 { background: linear-gradient(135deg, var(--kb-cbd5e1), var(--kb-94a3b8)); color: var(--kf-ffffff); } .medal.m2 { background: linear-gradient(135deg, var(--kb-f0b27a), var(--kb-c2410c)); color: var(--kf-ffffff); }
    .pts { font-size: 15px; color: var(--primary); }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid, .grid3 { grid-template-columns: 1fr; } }
  `,
})
export class ProductivityPerformance {
  protected readonly store = inject(TaskStore);
  protected readonly teams = [...new Set(WORKERS.map((w) => w.team))].sort();
  protected readonly week = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
  protected readonly trendLabels = TREND_LABELS;
  protected readonly hmRows = this.teams.map((t) => t.replace('Housekeeping Team', 'HK Team').replace(' Technicians', ' Tech').replace('IT Field Support', 'IT Field'));
  protected readonly hmCols = HM_HOURS.map((h) => h + ':00');
  protected readonly areas = ['Checklist quality', 'Timeliness', 'Photo evidence', 'Safety compliance', 'Customer courtesy'];

  protected readonly period = signal<Period>('today');
  protected readonly q = signal('');
  protected readonly team = signal('All');
  protected readonly sortKey = signal<SortKey>('score');
  protected readonly sortAsc = signal(false);
  protected readonly pg = signal(0);
  protected readonly selId = signal<string | null>(null);
  protected readonly noteFor = signal<string | null>(null);
  protected readonly noteText = signal('');
  protected readonly noteArea = signal('Checklist quality');
  protected readonly notes = signal<Record<string, string[]>>({ 'EMP-2129': ['Timeliness: aim to start rounds within 5 min of schedule'] });
  protected readonly toast = signal<string | null>(null);

  protected readonly periodLabel = computed(() => (this.period() === 'today' ? 'Today' : this.period() === 'week' ? 'Week 42' : 'October 2026'));
  private readonly tplDur = computed(() => new Map(this.store.templates().map((t) => [t.id, t.duration])));

  /** Today's figures come from the live task store; week/month add a seeded history. */
  protected readonly rows = computed<Row[]>(() => {
    const p = this.period();
    const now = this.store.now();
    const elapsed = Math.max(60, Math.min(480, now - 360));
    return WORKERS.filter((w) => w.status !== 'Off Duty' || p !== 'today').map((w, i) => {
      const r = rng(97 + i * 13);
      const mine = this.store.tasks().filter((t) => t.assignee === w.id);
      const due = mine.filter((t) => t.start <= now);
      const done = mine.filter((t) => !isOpen(t));
      const onTime = done.filter((t) => (t.completedAt ?? 0) <= t.due).length;
      const rej = done.filter((t) => t.status === 'Rejected').length;
      const busy = mine.reduce((a, t) => a + (t.completedAt != null ? t.completedAt - (t.startedAt ?? t.start) : t.status === 'In Progress' ? now - (t.startedAt ?? now) : 0), 0);
      const std = done.length ? Math.round(done.reduce((a, t) => a + (this.tplDur().get(t.templateId) ?? 20), 0) / done.length) : 20;
      const avg = done.length ? Math.round(done.reduce((a, t) => a + Math.max(1, (t.completedAt ?? 0) - (t.startedAt ?? t.start)), 0) / done.length) : std;
      const m = PERIOD_MULT[p];
      const hist = p === 'today' ? 0 : 1;
      const planned = Math.max(1, Math.round(Math.max(due.length, 1) * (1 - hist) + hist * (Math.max(mine.length, 4) * m * (0.9 + r() * 0.2))));
      const completed = Math.min(planned, Math.round(hist ? planned * (0.78 + r() * 0.2) : done.length));
      const rate = Math.round((completed / planned) * 100);
      const ot = hist ? Math.round(82 + r() * 17) : done.length ? Math.round((onTime / done.length) * 100) : 100;
      const util = Math.min(100, hist ? Math.round(64 + r() * 30) : Math.round(52 + (busy / elapsed) * 100 * 0.6 + r() * 10));
      const quality = Math.max(55, Math.min(100, w.quality - rej * 6 + (hist ? Math.round(r() * 4 - 2) : 0)));
      const score = Math.round(rate * 0.35 + ot * 0.25 + quality * 0.25 + Math.min(util, 95) * 0.15);
      const base = score - 6 + Math.round(r() * 6);
      const trend = Array.from({ length: 7 }, (_, k) => (k === 6 ? score : base + Math.round(r() * 10 - 4)));
      return { w, planned, completed, rate, onTime: ot, util, quality, avgDur: avg, stdDur: std, score, trend };
    });
  });
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    const k = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    return this.rows()
      .filter((r) => (this.team() === 'All' || r.w.team === this.team()) && (!q || r.w.name.toLowerCase().includes(q)))
      .sort((a, b) => (k === 'name' ? a.w.name.localeCompare(b.w.name) * dir : ((a[k] as number) - (b[k] as number)) * dir));
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 10)));
  protected readonly pageRows = computed(() => {
    const p = Math.min(this.pg(), this.pages() - 1);
    return this.filtered().slice(p * 10, p * 10 + 10);
  });
  protected readonly ranked = computed(() => [...this.rows()].sort((a, b) => b.score - a.score));
  protected readonly top = computed(() => this.ranked().slice(0, 5));
  protected readonly bottom = computed(() => this.ranked().slice(-3).reverse());
  protected readonly sel = computed(() => this.rows().find((r) => r.w.id === this.selId()) ?? null);
  protected readonly tot = computed(() => {
    const r = this.rows();
    const planned = r.reduce((a, x) => a + x.planned, 0);
    const completed = r.reduce((a, x) => a + x.completed, 0);
    const avg = (f: (x: Row) => number) => Math.round(r.reduce((a, x) => a + f(x), 0) / Math.max(r.length, 1));
    return { planned, completed, rate: Math.round((completed / Math.max(planned, 1)) * 100), util: avg((x) => x.util), onTime: avg((x) => x.onTime), quality: avg((x) => x.quality), perWorker: (completed / Math.max(r.length, 1)).toFixed(1) };
  });
  protected readonly avgRating = computed(() => {
    const l = this.store.tasks().filter((t) => t.rating);
    return (l.reduce((a, t) => a + t.rating!, 0) / Math.max(l.length, 1)).toFixed(1);
  });
  protected readonly teamStats = computed(() => {
    const ts = this.teams.map((team) => {
      const l = this.rows().filter((r) => r.w.team === team);
      return { team, planned: l.reduce((a, r) => a + r.planned, 0), done: l.reduce((a, r) => a + r.completed, 0) };
    });
    return {
      labels: ts.map((t) => t.team.replace('Housekeeping Team', 'HK').replace(' Technicians', '').replace('IT Field Support', 'IT').replace('Facility Services', 'Facility').replace(' Team', '').replace(' Crew', '').replace(' Control', '')),
      series: [
        { name: 'Planned', color: 'var(--ka-c4b5fd)', values: ts.map((t) => t.planned) },
        { name: 'Completed', color: 'var(--ka-7c3aed)', values: ts.map((t) => t.done) },
      ],
    };
  });
  protected readonly heat = computed(() => {
    return this.teams.map((team, ti) => {
      const ids = new Set(WORKERS.filter((w) => w.team === team).map((w) => w.id));
      const r = rng(311 + ti);
      return HM_HOURS.map((h) => {
        const from = +h * 60;
        const n = this.store.tasks().filter((t) => t.assignee && ids.has(t.assignee) && t.start >= from && t.start < from + 120).length;
        return Math.min(100, Math.round(38 + n * 9 + r() * 14));
      });
    });
  });
  protected readonly trend = computed(() => {
    const r = rng(42);
    const c = TREND_LABELS.map(() => Math.round(82 + r() * 13));
    const o = TREND_LABELS.map((_, i) => (i === TREND_LABELS.length - 1 ? this.tot().onTime : Math.round(84 + r() * 12)));
    return [
      { name: 'Completion %', color: 'var(--ka-7c3aed)', values: c, area: true },
      { name: 'On-time %', color: 'var(--ka-22c55e)', values: o },
      { name: 'Target', color: 'var(--ka-f59e0b)', values: TREND_LABELS.map(() => 90), dashed: true },
    ];
  });

  protected col(v: number) {
    return v >= 85 ? 'var(--ka-16a34a)' : v >= 70 ? 'var(--ka-d97706)' : 'var(--ka-dc2626)';
  }
  protected arrow(k: SortKey) {
    return this.sortKey() === k ? (this.sortAsc() ? ' ▲' : ' ▼') : '';
  }
  protected sortBy(k: SortKey) {
    if (this.sortKey() === k) this.sortAsc.set(!this.sortAsc());
    else {
      this.sortKey.set(k);
      this.sortAsc.set(k === 'name');
    }
    this.pg.set(0);
  }
  protected rankOf(id: string) {
    return this.ranked().findIndex((r) => r.w.id === id) + 1;
  }
  protected nameOf(id: string) {
    return WORKERS.find((w) => w.id === id)?.name ?? id;
  }
  protected reasonOf(r: Row) {
    if (r.rate < 70) return `Completion ${r.rate}% of plan`;
    if (r.onTime < 80) return `On-time only ${r.onTime}%`;
    if (r.quality < 85) return `Quality ${r.quality}% – rework`;
    if (r.avgDur > r.stdDur * 1.15) return `Avg ${r.avgDur}m vs std ${r.stdDur}m`;
    return `Utilisation ${r.util}%`;
  }
  protected weekSeries(r: Row) {
    const g = rng(+r.w.id.slice(4));
    const m = PERIOD_MULT[this.period()];
    const plan = this.week.map((d, i) => (i === 6 ? Math.max(1, Math.round(r.planned / m)) : d === 'Sat' || d === 'Sun' ? Math.round(2 + g() * 3) : Math.round(5 + g() * 4)));
    const done = plan.map((p, i) => (i === 6 ? Math.min(p, Math.round(r.completed / m)) : Math.round(p * (0.75 + g() * 0.25))));
    return [
      { name: 'Planned', color: 'var(--ka-c4b5fd)', values: plan },
      { name: 'Completed', color: 'var(--ka-7c3aed)', values: done },
    ];
  }
  protected mixOf(w: Worker) {
    const m = new Map<string, number>();
    for (const t of this.store.tasks()) if (t.assignee === w.id) m.set(catOf(t.category), (m.get(catOf(t.category)) ?? 0) + 1);
    const rows = CAT_NAMES.filter((c) => m.has(c)).map((c) => ({ label: c, value: m.get(c)!, display: String(m.get(c)), color: catMeta(c).bar }));
    return rows.length ? rows.sort((a, b) => b.value - a.value) : [{ label: 'No tasks today', value: 0, display: '0' }];
  }
  protected mixMax(w: Worker) {
    return Math.max(...this.mixOf(w).map((r) => r.value), 1);
  }
  protected kudos(w: Worker) {
    this.store.log(`Recognition sent to ${w.name} for outstanding task performance`, 'Rex Kumar', 'tasks-award', 'var(--ka-f59e0b)');
    this.say(`🏆 Kudos sent to ${w.name} · visible on their mobile app`);
  }
  protected saveNote(id: string) {
    const text = `${this.noteArea()}: ${this.noteText().trim() || 'Discuss in next 1:1'}`;
    this.notes.update((n) => ({ ...n, [id]: [text, ...(n[id] ?? [])] }));
    this.noteFor.set(null);
    this.say(`Coaching note saved for ${this.nameOf(id)}`);
  }
  private csvRows(l: Row[]) {
    return [
      ['Employee ID', 'Name', 'Team', 'Role', 'Planned', 'Completed', 'Completion %', 'On-time %', 'Utilisation %', 'Avg Time (min)', 'Std Time (min)', 'Quality %', 'Score'],
      ...l.map((r) => [r.w.id, r.w.name, r.w.team, r.w.role, r.planned, r.completed, r.rate, r.onTime, r.util, r.avgDur, r.stdDur, r.quality, r.score]),
    ];
  }
  protected exportCsv() {
    downloadCsv(`productivity-${this.period()}.csv`, this.csvRows(this.filtered()));
    this.say(`${this.filtered().length} scorecards exported`);
  }
  protected exportOne(r: Row) {
    downloadCsv(`scorecard-${r.w.id}.csv`, this.csvRows([r]));
    this.say(`Scorecard for ${r.w.name} downloaded`);
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
