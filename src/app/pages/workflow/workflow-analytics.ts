// Workflow Analytics: volume, cycle time, bottleneck steps, SLA compliance and approver performance.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { avatarColor, downloadCsv, initials } from '../dashboards/demo-data';
import { toast } from './workflow-pages-a';
import { WfInstanceDrawer } from './workflow-shared';
import { currentStep, demoNow, Instance, instStatus, isOverdue, ME, WorkflowStore } from './workflow.data';

const H = 3600_000;
const D = 24 * H;
const RANGES = [{ id: '7d', label: 'Last 7 days', days: 7 }, { id: '14d', label: 'Last 14 days', days: 14 }, { id: '30d', label: 'Last 30 days', days: 30 }, { id: 'all', label: 'All time', days: 60 }] as const;
const fmtH = (h: number) => (h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);
/** Stable 0..1 jitter so durations vary realistically per approver / step. */
const jit = (s: string) => ([...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7) % 100) / 100;
const isDecision = (t: string) => /completed|approved|Rejected/.test(t) && !t.startsWith('Submitted');
const STEP_WEIGHT = (s: string) => (/HR|Finance|Audit|L&D|Zone Owner|Close-out/.test(s) ? 1.9 : /Manager|Supervisor|Security/.test(s) ? 1.25 : /Approval|Review|Acceptance/.test(s) ? 1.1 : 0.35);
type ApprSort = 'decided' | 'avg' | 'pending' | 'sla' | 'rate';

@Component({
  selector: 'app-workflow-workflow-analytics',
  imports: [...UI, WfInstanceDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workflow Analytics" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="How fast requests move, where they get stuck, and who keeps them waiting.">
      <select class="select" [value]="range()" (change)="range.set($any($event.target).value)">@for (r of ranges; track r.id) {<option [value]="r.id">{{ r.label }}</option>}</select>
      <select class="select" [value]="wf()" (change)="wf.set($any($event.target).value)"><option value="All">All workflows</option>@for (w of wfNames(); track w) {<option [value]="w">{{ w }}</option>}</select>
      <div class="menu-wrap">
        <button class="btn-primary" (click)="expOpen.set(!expOpen())"><app-icon name="download" [size]="16" />Export CSV</button>
        @if (expOpen()) {
          <div class="dropdown right">
            <button class="dd-item" (click)="exportWf()">Workflow performance</button>
            <button class="dd-item" (click)="exportAppr()">Approver performance</button>
            <button class="dd-item" (click)="exportSteps()">Bottleneck steps</button>
            <button class="dd-item" (click)="exportInst()">Raw instances ({{ inRange().length }})</button>
          </div>
        }
      </div>
    </app-page-head>

    @if (wf() !== 'All') {
      <div class="fchip">Filtered to <b>{{ wf() }}</b><button (click)="wf.set('All')">× Clear</button></div>
    }

    <section class="kpi-row">
      <app-kpi label="Instances Started" [value]="inRange().length" icon="workflow-play" color="var(--ka-7c3aed)" change="8%" [sub]="rangeLabel()" />
      <app-kpi label="Completed" [value]="closed().length" icon="workflow-check" color="var(--ka-22c55e)" [sub]="running().length + ' still running'" />
      <app-kpi label="Approval Rate" [value]="approvalRate() + '%'" icon="shield-check" color="var(--ka-3b82f6)" [sub]="rejected() + ' rejected'" />
      <app-kpi label="Avg. Cycle Time" [value]="fmtH(avgCycle())" icon="workflow-timer" color="var(--ka-0d9488)" change="11%" [up]="false" sub="vs. prev. period" />
      <app-kpi label="SLA Compliance" [value]="sla() + '%'" icon="clock" color="var(--ka-f59e0b)" [sub]="overdue() + ' running past SLA'" [subColor]="overdue() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Auto Decisions" [value]="autoN().toLocaleString()" icon="workflow-bolt" color="var(--ka-ec4899)" change="12%" sub="by rules" />
    </section>

    <section class="g2">
      <div class="card">
        <div class="card-head"><h3>Instance Volume</h3><span class="muted sm">{{ vol().bucket }}</span></div>
        <app-line-chart [labels]="vol().labels" [series]="vol().series" [height]="230" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Outcome Mix</h3></div>
        <app-donut [segments]="mix()" center="Instances" [size]="150" />
        <div class="mini">
          <div><b>{{ fmtH(medianCycle()) }}</b><small>median cycle</small></div>
          <div><b>{{ fmtH(p90Cycle()) }}</b><small>90th percentile</small></div>
        </div>
      </div>
    </section>

    <section class="g3">
      <div class="card">
        <div class="card-head"><h3>Cycle Time vs. SLA by Workflow</h3><span class="muted sm">hours</span></div>
        <app-column-chart [labels]="cyc().labels" [series]="cyc().series" [height]="240" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Bottleneck Steps</h3><span class="muted sm">avg. wait · click to see who's waiting</span></div>
        <ul class="bn">
          @for (s of steps().slice(0, 8); track s.step) {
            <li (click)="stepSel.set(s.step)" [class.on]="stepSel() === s.step">
              <span class="lb">{{ s.step }}</span>
              <div class="tr"><i [style.width.%]="(s.avg / stepMax()) * 100" [class.hot]="s.avg > 20" [class.warm]="s.avg > 10 && s.avg <= 20"></i></div>
              <b>{{ fmtH(s.avg) }}</b>
              <span class="wn" [class.z]="!s.waiting">{{ s.waiting }} waiting</span>
            </li>
          }
        </ul>
        @if (topShare(); as top) {<p class="insight"><app-icon name="lightbulb" [size]="14" /><span><b>{{ top.step }}</b> accounts for {{ top.share }}% of total waiting time. Consider an auto-approval rule or a delegate for absences.</span></p>}
      </div>
    </section>

    <section class="g2b">
      <div class="card">
        <div class="card-head"><h3>SLA Compliance by Week</h3><span class="muted sm">% closed within SLA</span></div>
        <app-heatmap [rows]="heat().rows" [cols]="heat().cols" [data]="heat().data" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Approver Performance</h3><span class="muted sm">{{ approvers().length }} approvers</span></div>
        <div class="table-wrap">
          <table class="table at">
            <thead><tr>
              <th>Approver</th>
              <th class="num sortable" (click)="sortBy('decided')">Decisions{{ arrow('decided') }}</th>
              <th class="num sortable" (click)="sortBy('rate')">Approve %{{ arrow('rate') }}</th>
              <th class="num sortable" (click)="sortBy('avg')">Avg. response{{ arrow('avg') }}</th>
              <th class="num sortable" (click)="sortBy('sla')">On time{{ arrow('sla') }}</th>
              <th class="num sortable" (click)="sortBy('pending')">Pending{{ arrow('pending') }}</th>
              <th></th>
            </tr></thead>
            <tbody>
              @for (a of approvers(); track a.name) {
                <tr>
                  <td><div class="pp"><span class="dt-av" [style.background]="a.color">{{ a.ini }}</span><div><b>{{ a.name }}</b>@if (a.name === me) {<small>you</small>}</div></div></td>
                  <td class="num">{{ a.decided }}</td>
                  <td class="num">{{ a.rate }}%</td>
                  <td class="num"><span [class]="a.avg > 12 ? 'tag red' : a.avg > 6 ? 'tag amber' : 'tag green'">{{ fmtH(a.avg) }}</span></td>
                  <td class="num"><div class="mb"><i [style.width.%]="a.sla" [style.background]="a.sla >= 90 ? 'var(--ka-22c55e)' : a.sla >= 75 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'"></i></div>{{ a.sla }}%</td>
                  <td class="num">{{ a.pending }}@if (a.overdue) { <span class="od">{{ a.overdue }} late</span>}</td>
                  <td>@if (a.pending && a.name !== me) {<button class="btn-ghost sm" [disabled]="nudged().has(a.name)" (click)="nudge(a.name)">{{ nudged().has(a.name) ? 'Nudged' : 'Nudge' }}</button>}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div class="card">
      <div class="card-head"><h3>Workflow Performance</h3><span class="muted sm">click a row to focus the dashboard</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Workflow</th><th class="num">Started</th><th class="num">Running</th><th class="num">Approved</th><th class="num">Rejected</th><th class="num">Avg. cycle</th><th class="num">SLA target</th><th class="num">SLA met</th><th>Trend (6 wk)</th></tr></thead>
          <tbody>
            @for (w of perf(); track w.name) {
              <tr class="clickable" [class.selected]="wf() === w.name" (click)="wf.set(wf() === w.name ? 'All' : w.name)">
                <td><div class="pp"><span class="wi" [style.background]="'color-mix(in srgb, ' + w.color + ' 10%, transparent)'" [style.color]="w.color"><app-icon [name]="w.icon" [size]="14" /></span><b>{{ w.name }}</b></div></td>
                <td class="num">{{ w.started }}</td><td class="num">{{ w.running }}</td><td class="num">{{ w.approved }}</td><td class="num">{{ w.rejected }}</td>
                <td class="num" [class.bad]="w.avg > w.slaH">{{ w.avg ? fmtH(w.avg) : '—' }}</td><td class="num">{{ w.slaH }} h</td>
                <td class="num"><span [class]="w.sla >= 90 ? 'tag green' : w.sla >= 75 ? 'tag amber' : 'tag red'">{{ w.sla }}%</span></td>
                <td class="sp"><app-sparkline [values]="w.trend" [color]="w.color" /></td>
              </tr>
            } @empty {<tr><td colspan="9" class="muted">No instances in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    @if (stepSel(); as s) {
      <div class="g-overlay" (click)="stepSel.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div><h3>Waiting at “{{ s }}”</h3><small class="muted">{{ waitingAt().length }} running instances · avg. wait {{ fmtH(stepAvg()) }}</small></div><button class="close-btn" (click)="stepSel.set(null)">×</button></div>
        @if (waitingAt().length) {
          <div class="acts"><button class="btn-primary" (click)="remindAll()"><app-icon name="bell" [size]="15" />Remind all approvers</button><button class="btn-ghost" (click)="escalateLate()"><app-icon name="arrow-up" [size]="15" />Escalate overdue ({{ lateAt() }})</button></div>
        }
        <ul class="wl">
          @for (i of waitingAt(); track i.id) {
            <li (click)="drawer.set(i.id)">
              <span class="dt-av" [style.background]="i.avatar">{{ i.initials }}</span>
              <div><b>{{ i.requester }} · {{ i.id }}</b><small>{{ i.workflow }} · with {{ i.assignee }}</small></div>
              <span [class]="isOver(i) ? 'tag red' : 'tag blue'">{{ waitH(i) }}</span>
            </li>
          } @empty {<li class="muted">Nothing is waiting at this step right now — the average comes from completed instances.</li>}
        </ul>
      </aside>
    }
    <app-wf-instance-drawer [instId]="drawer()" (closed)="drawer.set(null)" (done)="msg($event)" />
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    :host ::ng-deep app-page-head .select { min-width: 150px; }
    .dropdown.right { right: 0; left: auto; min-width: 210px; }
    .fchip { display: inline-flex; gap: 8px; align-items: center; font-size: 12.5px; padding: 6px 10px; border-radius: 8px; background: var(--kb-f3efff); color: var(--kf-4c1d95); margin-bottom: 12px; }
    .fchip button { border: 0; background: none; cursor: pointer; color: var(--primary); font-weight: 600; }
    .sm { font-size: 12px; }
    .g2 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 12px; margin-bottom: 12px; }
    .g3 { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; margin-bottom: 12px; }
    .g2b { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .mini div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; } .mini b { font-size: 16px; } .mini small { font-size: 11px; color: var(--muted); }
    .bn { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .bn li { display: grid; grid-template-columns: 150px 1fr 56px 74px; gap: 10px; align-items: center; font-size: 12.5px; padding: 5px 6px; border-radius: 7px; cursor: pointer; }
    .bn li:hover, .bn li.on { background: var(--kb-f5f3ff); }
    .lb { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tr { height: 9px; border-radius: 6px; background: var(--kb-eef0f5); overflow: hidden; } .tr i { display: block; height: 100%; border-radius: 6px; background: var(--kb-8b5cf6); } .tr i.warm { background: var(--kb-f59e0b); } .tr i.hot { background: var(--kb-ef4444); }
    .bn b { text-align: right; } .wn { font-size: 11px; color: var(--kf-b45309); text-align: right; } .wn.z { color: var(--muted); }
    .insight { display: flex; gap: 8px; align-items: flex-start; margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--kb-fffbeb); color: var(--kf-92400e); font-size: 12px; }
    .pp { display: flex; align-items: center; gap: 8px; } .pp small { display: block; font-size: 10.5px; color: var(--muted); }
    .wi { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; }
    .at th, .at td { padding: 7px 7px; }
    .mb { display: inline-block; width: 46px; height: 6px; border-radius: 4px; background: var(--kb-eef0f5); overflow: hidden; margin-right: 6px; vertical-align: middle; } .mb i { display: block; height: 100%; }
    .od { font-size: 10.5px; color: var(--kf-dc2626); margin-left: 4px; }
    .bad { color: var(--kf-dc2626); font-weight: 600; }
    .sp { width: 120px; } .sp app-sparkline { display: block; width: 110px; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .wl { list-style: none; margin: 0; padding: 0; }
    .wl li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 8px 6px; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; font-size: 12.5px; border-radius: 6px; }
    .wl li:hover { background: var(--kb-faf8ff); } .wl small { display: block; color: var(--muted); font-size: 11px; }
    @media (max-width: 1250px) { .g2, .g3, .g2b { grid-template-columns: 1fr; } }
  `,
})
export class WorkflowAnalytics {
  protected readonly store = inject(WorkflowStore);
  protected readonly ranges = RANGES;
  protected readonly fmtH = fmtH;
  protected readonly me = ME;
  protected readonly isOver = isOverdue;
  protected readonly range = signal<string>('30d');
  protected readonly wf = signal('All');
  protected readonly expOpen = signal(false);
  protected readonly stepSel = signal<string | null>(null);
  protected readonly drawer = signal<string | null>(null);
  protected readonly sort = signal<{ k: ApprSort; dir: 1 | -1 }>({ k: 'decided', dir: -1 });
  protected readonly nudged = signal(new Set<string>());
  protected readonly toastS = signal<string | null>(null);

  private readonly days = computed(() => RANGES.find((r) => r.id === this.range())!.days);
  protected readonly rangeLabel = computed(() => RANGES.find((r) => r.id === this.range())!.label.toLowerCase());
  protected readonly wfNames = computed(() => [...new Set(this.store.instances().map((i) => i.workflow))].sort());
  protected readonly inRange = computed(() => {
    const since = demoNow() - this.days() * D;
    const w = this.wf();
    return this.store.instances().filter((i) => i.startedAt >= since && (w === 'All' || i.workflow === w) && !i.test);
  });
  protected readonly closed = computed(() => this.inRange().filter((i) => i.status !== 'In Progress'));
  protected readonly running = computed(() => this.inRange().filter((i) => i.status === 'In Progress'));
  protected readonly rejected = computed(() => this.inRange().filter((i) => i.status === 'Rejected').length);
  protected readonly approvalRate = computed(() => {
    const a = this.inRange().filter((i) => i.status === 'Approved').length;
    return Math.round((a / Math.max(1, a + this.rejected())) * 100);
  });
  private readonly cycles = computed(() => this.inRange().filter((i) => i.status === 'Approved' && i.endedAt).map((i) => (i.endedAt! - i.startedAt) / H).sort((a, b) => a - b));
  protected readonly avgCycle = computed(() => { const c = this.cycles(); return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0; });
  protected readonly medianCycle = computed(() => this.cycles()[Math.floor(this.cycles().length / 2)] ?? 0);
  protected readonly p90Cycle = computed(() => this.cycles()[Math.floor(this.cycles().length * 0.9)] ?? 0);
  protected readonly sla = computed(() => {
    const c = this.closed().filter((i) => i.endedAt);
    return c.length ? Math.round((c.filter((i) => i.endedAt! <= i.dueAt).length / c.length) * 1000) / 10 : 100;
  });
  protected readonly overdue = computed(() => this.running().filter(isOverdue).length);
  protected readonly autoN = computed(() => {
    const since = demoNow() - this.days() * D;
    const live = this.store.ruleExecs().filter((e) => !e.test && e.result === 'Success');
    // Seeded executions only cover ~3 days; scale lifetime runs to the period for a realistic total.
    const life = this.store.rules().reduce((a, r) => a + r.runs, 0);
    return Math.round((life * Math.min(this.days(), 60)) / 60) + live.filter((e) => e.at >= since && e.at > demoNow() - H).length;
  });

  protected readonly vol = computed(() => {
    const days = this.days();
    const step = days <= 14 ? 1 : days <= 30 ? 3 : 6;
    const n = Math.ceil(days / step);
    const now = demoNow();
    const started = Array(n).fill(0);
    const done = Array(n).fill(0);
    const rej = Array(n).fill(0);
    const idx = (t: number) => n - 1 - Math.floor((now - t) / (step * D));
    this.inRange().forEach((i) => {
      const k = idx(i.startedAt);
      if (k >= 0 && k < n) started[k]++;
      if (i.endedAt) {
        const e = idx(i.endedAt);
        if (e >= 0 && e < n) (i.status === 'Rejected' ? rej : done)[e]++;
      }
    });
    const labels = Array.from({ length: n }, (_, k) => new Date(now - (n - 1 - k) * step * D).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    return {
      bucket: step === 1 ? 'per day' : `per ${step} days`, labels,
      series: [{ name: 'Started', color: 'var(--ka-7c3aed)', values: started, area: true }, { name: 'Approved', color: 'var(--ka-22c55e)', values: done }, { name: 'Rejected', color: 'var(--ka-ef4444)', values: rej, dashed: true }],
    };
  });
  protected readonly mix = computed(() => {
    const l = this.inRange();
    const c = (s: string) => l.filter((i) => instStatus(i) === s).length;
    return [
      { label: 'Approved', value: c('Approved'), color: 'var(--ka-22c55e)' },
      { label: 'In progress', value: c('In Progress'), color: 'var(--ka-3b82f6)' },
      { label: 'Overdue', value: c('Overdue'), color: 'var(--ka-f97316)' },
      { label: 'Rejected', value: c('Rejected'), color: 'var(--ka-ef4444)' },
      { label: 'Cancelled', value: c('Cancelled'), color: 'var(--ka-a3a7c2)' },
    ];
  });
  protected readonly perf = computed(() => {
    const now = demoNow();
    const m = new Map<string, Instance[]>();
    this.inRange().forEach((i) => m.set(i.workflow, [...(m.get(i.workflow) ?? []), i]));
    const all = this.store.instances();
    return [...m.entries()]
      .map(([name, l]) => {
        const w = this.store.workflows().find((x) => x.id === l[0].wfId)!;
        const ap = l.filter((i) => i.status === 'Approved' && i.endedAt);
        const cl = l.filter((i) => i.endedAt);
        const mine = all.filter((i) => i.workflow === name);
        const trend = [5, 4, 3, 2, 1, 0].map((k) => mine.filter((i) => i.startedAt <= now - k * 7 * D && i.startedAt > now - (k + 1) * 7 * D).length);
        return {
          name, color: w.color, icon: w.icon, slaH: w.slaHours, started: l.length, running: l.filter((i) => i.status === 'In Progress').length, approved: ap.length, rejected: l.filter((i) => i.status === 'Rejected').length,
          avg: ap.length ? ap.reduce((a, i) => a + (i.endedAt! - i.startedAt), 0) / ap.length / H : 0,
          sla: cl.length ? Math.round((cl.filter((i) => i.endedAt! <= i.dueAt).length / cl.length) * 100) : 100, trend,
        };
      })
      .sort((a, b) => b.started - a.started);
  });
  protected readonly cyc = computed(() => {
    const p = this.perf().filter((w) => w.avg).slice(0, 8);
    return {
      labels: p.map((w) => w.name.split(' ')[0]),
      series: [{ name: 'Avg. cycle (h)', color: 'var(--ka-7c3aed)', values: p.map((w) => Math.round(w.avg * 10) / 10) }, { name: 'SLA target (h)', color: 'var(--ka-f59e0b)', values: p.map((w) => w.slaH), line: true }],
    };
  });
  /** Average wait per step: completed hand-offs from the activity logs + live waits of running instances. */
  protected readonly steps = computed(() => {
    const now = demoNow();
    const m = new Map<string, { sum: number; n: number; waiting: number }>();
    const add = (step: string, h: number, waiting = 0) => {
      const e = m.get(step) ?? { sum: 0, n: 0, waiting: 0 };
      e.sum += h;
      e.n++;
      e.waiting += waiting;
      m.set(step, e);
    };
    this.inRange().forEach((i) => {
      for (let k = 1; k < i.log.length; k++) {
        const t = i.log[k].text;
        const step = i.steps.find((s) => t.startsWith(s));
        if (step && isDecision(t)) add(step, ((i.log[k].at - i.log[k - 1].at) / H) * STEP_WEIGHT(step) * (0.6 + jit(step + i.id) * 0.8));
      }
      if (i.status === 'In Progress') add(currentStep(i), (now - i.log[i.log.length - 1].at) / H, 1);
    });
    const rows = [...m.entries()].filter(([s]) => !/^(Start|End|Completed)$/.test(s)).map(([step, e]) => ({ step, avg: e.sum / e.n, waiting: e.waiting, total: e.sum }));
    const tot = rows.reduce((a, r) => a + r.total, 0) || 1;
    return rows.map((r) => ({ ...r, share: Math.round((r.total / tot) * 100) })).sort((a, b) => b.avg - a.avg);
  });
  protected readonly topShare = computed(() => [...this.steps()].sort((a, b) => b.share - a.share)[0] ?? null);
  protected readonly stepMax = computed(() => Math.max(1, ...this.steps().slice(0, 8).map((s) => s.avg)));
  protected readonly heat = computed(() => {
    const now = demoNow();
    const top = this.perf().slice(0, 7);
    const weekNo = (t: number) => { const d = new Date(t); const j = new Date(d.getFullYear(), 0, 1); return Math.ceil(((t - j.getTime()) / D + j.getDay() + 1) / 7); };
    const cols = [5, 4, 3, 2, 1, 0].map((k) => `W${weekNo(now - k * 7 * D)}`);
    const all = this.store.instances().filter((i) => i.endedAt);
    const data = top.map((w) =>
      [5, 4, 3, 2, 1, 0].map((k) => {
        const l = all.filter((i) => i.workflow === w.name && i.endedAt! <= now - k * 7 * D && i.endedAt! > now - (k + 1) * 7 * D);
        return l.length ? Math.round((l.filter((i) => i.endedAt! <= i.dueAt).length / l.length) * 100) : Math.round(88 + jit(w.name + k) * 12);
      }),
    );
    return { rows: top.map((w) => w.name.split(' ')[0].slice(0, 10)), cols, data };
  });
  protected readonly approvers = computed(() => {
    const m = new Map<string, { decided: number; ok: number; resp: number; onTime: number; pending: number; overdue: number }>();
    const get = (n: string) => m.get(n) ?? (m.set(n, { decided: 0, ok: 0, resp: 0, onTime: 0, pending: 0, overdue: 0 }), m.get(n)!);
    this.inRange().forEach((i) => {
      for (let k = 1; k < i.log.length; k++) {
        const l = i.log[k];
        if (!isDecision(l.text) || l.by === 'System' || l.by === 'Requester' || l.by === i.requester || l.by === 'Test Runner') continue;
        const e = get(l.by);
        const h = ((l.at - i.log[k - 1].at) / H) * (0.45 + jit(l.by) * 1.3) * (0.7 + jit(i.id) * 0.6);
        e.decided++;
        e.ok += l.text.startsWith('Rejected') ? 0 : 1;
        e.resp += h;
        e.onTime += h <= 8 + jit(l.by + 'x') * 6 ? 1 : 0;
      }
      if (i.status === 'In Progress' && !['System', 'Requester', '-'].includes(i.assignee)) {
        const e = get(i.assignee);
        e.pending++;
        if (isOverdue(i)) e.overdue++;
      }
    });
    const rows = [...m.entries()].map(([name, e]) => ({
      name, ini: initials(name), color: avatarColor(name), decided: e.decided, pending: e.pending, overdue: e.overdue,
      rate: e.decided ? Math.round((e.ok / e.decided) * 100) : 0, avg: e.decided ? e.resp / e.decided : 0, sla: e.decided ? Math.round((e.onTime / e.decided) * 100) : 100,
    }));
    const { k, dir } = this.sort();
    return rows.sort((a, b) => (a[k] - b[k]) * dir).slice(0, 10);
  });
  protected sortBy(k: ApprSort) {
    this.sort.update((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }));
  }
  protected arrow(k: ApprSort) {
    return this.sort().k === k ? (this.sort().dir === 1 ? ' ▲' : ' ▼') : '';
  }

  // ---- bottleneck drawer ----
  protected readonly waitingAt = computed(() => {
    const s = this.stepSel();
    return this.store.instances().filter((i) => i.status === 'In Progress' && currentStep(i) === s && (this.wf() === 'All' || i.workflow === this.wf())).sort((a, b) => a.dueAt - b.dueAt);
  });
  protected readonly lateAt = computed(() => this.waitingAt().filter(isOverdue).length);
  protected readonly stepAvg = computed(() => this.steps().find((x) => x.step === this.stepSel())?.avg ?? 0);
  protected waitH(i: Instance) {
    const h = Math.round((demoNow() - i.log[i.log.length - 1].at) / H);
    return isOverdue(i) ? `${h} h · overdue` : `${h} h waiting`;
  }
  protected remindAll() {
    const l = this.waitingAt();
    l.forEach((i) => this.store.patchInst(i.id, { log: [...i.log, { at: demoNow(), text: `Reminder sent to ${i.assignee}`, by: ME }] }));
    const who = new Set(l.map((i) => i.assignee));
    this.store.pushActivity(`Reminders sent for ${l.length} requests at ${this.stepSel()}`, 'var(--ka-f59e0b)');
    this.msg(`Reminders sent to ${who.size} approver${who.size === 1 ? '' : 's'} (${l.length} requests)`);
  }
  protected escalateLate() {
    const l = this.waitingAt().filter(isOverdue);
    l.forEach((i) => this.store.decide(i.id, 'escalate'));
    this.msg(l.length ? `${l.length} overdue requests escalated to Department Head` : 'Nothing overdue at this step');
  }
  protected nudge(name: string) {
    const l = this.store.instances().filter((i) => i.status === 'In Progress' && i.assignee === name);
    l.forEach((i) => this.store.patchInst(i.id, { log: [...i.log, { at: demoNow(), text: `Reminder sent to ${name}`, by: ME }] }));
    this.nudged.update((s) => new Set(s).add(name));
    this.store.pushActivity(`${name} nudged about ${l.length} pending approvals`, 'var(--ka-f59e0b)');
    this.msg(`${name} reminded about ${l.length} pending approval${l.length === 1 ? '' : 's'}`);
  }

  // ---- export ----
  private tag() {
    return `${this.range()}${this.wf() === 'All' ? '' : '-' + this.wf().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }
  protected exportWf() {
    this.expOpen.set(false);
    downloadCsv(`workflow-performance-${this.tag()}.csv`, [['Workflow', 'Started', 'Running', 'Approved', 'Rejected', 'Avg cycle (h)', 'SLA target (h)', 'SLA met %'], ...this.perf().map((w) => [w.name, w.started, w.running, w.approved, w.rejected, w.avg.toFixed(1), w.slaH, w.sla])]);
    this.msg('Exported workflow performance');
  }
  protected exportAppr() {
    this.expOpen.set(false);
    downloadCsv(`approver-performance-${this.tag()}.csv`, [['Approver', 'Decisions', 'Approve %', 'Avg response (h)', 'On time %', 'Pending', 'Overdue'], ...this.approvers().map((a) => [a.name, a.decided, a.rate, a.avg.toFixed(1), a.sla, a.pending, a.overdue])]);
    this.msg('Exported approver performance');
  }
  protected exportSteps() {
    this.expOpen.set(false);
    downloadCsv(`bottleneck-steps-${this.tag()}.csv`, [['Step', 'Avg wait (h)', 'Waiting now', 'Share of wait %'], ...this.steps().map((s) => [s.step, s.avg.toFixed(1), s.waiting, s.share])]);
    this.msg('Exported bottleneck steps');
  }
  protected exportInst() {
    this.expOpen.set(false);
    downloadCsv(`workflow-instances-${this.tag()}.csv`, [['ID', 'Workflow', 'Requester', 'Department', 'Status', 'Current step', 'Started', 'Ended', 'Cycle (h)', 'Within SLA'], ...this.inRange().map((i) => [i.id, i.workflow, i.requester, i.dept, instStatus(i), currentStep(i), new Date(i.startedAt).toISOString(), i.endedAt ? new Date(i.endedAt).toISOString() : '', i.endedAt ? ((i.endedAt - i.startedAt) / H).toFixed(1) : '', i.endedAt ? (i.endedAt <= i.dueAt ? 'Yes' : 'No') : ''])]);
    this.msg(`Exported ${this.inRange().length} instances`);
  }
  protected msg(m: string) {
    toast(this.toastS, m);
  }
}
