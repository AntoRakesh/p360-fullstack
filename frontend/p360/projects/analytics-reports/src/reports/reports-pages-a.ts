import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { ScheduleModal } from './reports-modals';
import { CATEGORIES, Dash, DEFAULT_PARAMS, fmtDate, fmtNum, ME, PreviewParams, previewFor, Report, ReportsStore, Schedule, SITES, TODAY, Widget, WIDGET_LIBRARY } from './reports.data';
import { ReportPreview, RptColumns } from './reports-ui';

export { CustomReportBuilder } from './report-builder';

const toast = () => {
  const t = signal<string | null>(null);
  let h: ReturnType<typeof setTimeout>;
  return Object.assign(t, {
    show(m: string) {
      t.set(m);
      clearTimeout(h);
      h = setTimeout(() => t.set(null), 2600);
    },
  });
};

/* ======================= Standard Reports ======================= */
@Component({
  selector: 'app-reports-standard-reports',
  imports: [...UI, ReportPreview, ScheduleModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Standard Reports" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Pre-built, validated reports for every People360 module — run instantly with your parameters.">
      <button class="btn-ghost" (click)="go('report-library')"><app-icon name="list-checks" [size]="15" />Report Library</button>
      <button class="btn-primary" (click)="exportList()"><app-icon name="download" [size]="15" />Export List</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Standard Reports" [value]="std().length" icon="file-text" color="var(--ka-2563eb)" sub="validated by People360" />
      <app-kpi label="Modules Covered" [value]="modulesCovered()" icon="layers" color="var(--ka-16a34a)" sub="of 25 modules" />
      <app-kpi label="Standard Runs (This Month)" [value]="fmt(stdRuns())" icon="play" color="var(--ka-f59e0b)" change="16%" sub="vs. last month" />
      <app-kpi label="Most Run Report" [value]="topRun().runs" icon="trending-up" color="var(--ka-7c3aed)" [sub]="topRun().name" />
      <app-kpi label="Avg. Generation Time" value="2.4s" icon="clock" color="var(--ka-ef4444)" change="0.6s" [up]="false" sub="faster than last month" />
    </section>

    <section class="sr">
      <aside class="card cats">
        <h4>Categories</h4>
        <button [class.on]="!cat()" (click)="cat.set('')"><span>All categories</span><b>{{ std().length }}</b></button>
        @for (c of catCounts(); track c.name) {
          <button [class.on]="cat() === c.name" (click)="cat.set(c.name)"><span class="cd" [style.background]="c.color"></span><span>{{ c.name }}</span><b>{{ c.count }}</b></button>
        }
      </aside>
      <div>
        <div class="bar">
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search standard reports..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <select class="select" [value]="sort()" (change)="sort.set($any($event.target).value)"><option value="runs">Most run</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select>
          <label class="fo"><input type="checkbox" [checked]="favOnly()" (change)="favOnly.set(!favOnly())" />Favorites only</label>
          <span class="muted">{{ list().length }} reports</span>
        </div>
        <div class="grid">
          @for (r of list(); track r.id) {
            <article class="card rc">
              <div class="rh"><span class="ri" [style.background]="r.color"><app-icon [name]="r.icon" [size]="18" /></span>
                <div><b>{{ r.name }}</b><small>{{ r.module }}</small></div>
                <button class="star" [class.on]="r.favorite" (click)="store.toggleFavorite(r.id)" aria-label="Favorite"><app-icon [name]="r.favorite ? 'reports-star-fill' : 'star'" [size]="16" /></button></div>
              <p>{{ r.description }}</p>
              <div class="meta"><span><app-icon name="play" [size]="12" />{{ r.runs }} runs</span><span><app-icon name="calendar-days" [size]="12" />{{ fd(r.updated) }}</span>@if (scheduled().has(r.id)) {<span class="tag green">Scheduled</span>}</div>
              <div class="acts">
                <button class="btn-primary btn-sm" (click)="open(r)"><app-icon name="play" [size]="13" />Run</button>
                <button class="btn-ghost sm" (click)="schedFor.set(r)"><app-icon name="calendar-days" [size]="13" />Schedule</button>
                <button class="btn-ghost sm" (click)="inLibrary(r)">Details</button>
              </div>
            </article>
          } @empty {<p class="muted">No standard reports match.</p>}
        </div>
      </div>
    </section>

    @if (runFor(); as r) {
      <div class="g-overlay" (click)="runFor.set(null)"></div>
      <div class="g-modal wide run">
        <div class="modal-head"><div class="mh"><span class="ri" [style.background]="r.color"><app-icon [name]="r.icon" [size]="18" /></span><div><h3>{{ r.name }}</h3><small class="muted">{{ r.module }} · {{ r.category }}</small></div></div><button class="close-btn" (click)="runFor.set(null)">×</button></div>
        <div class="prm">
          <label>Site<select class="select" [value]="params().site" (change)="setP('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Date Range<select class="select" [value]="params().range" (change)="setP('range', $any($event.target).value)"><option>Last 7 Days</option><option>Last 30 Days</option><option>Last 90 Days</option></select></label>
          <label>Department<select class="select" [value]="params().department" (change)="setP('department', $any($event.target).value)"><option>All Departments</option>@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select></label>
          <label class="cb"><input type="checkbox" [checked]="params().compare" (change)="setP('compare', !params().compare)" />Compare previous period</label>
          <button class="btn-primary" (click)="run(r)" [disabled]="busy()">{{ busy() ? 'Running…' : 'Run' }}</button>
          <button class="btn-ghost" (click)="exportRun(r)" [disabled]="!ran()"><app-icon name="download" [size]="14" />CSV</button>
        </div>
        @if (ran()) {
          <nav class="ptabs">@for (t of preview().tabs; track t; let i = $index) {<button [class.on]="ptab() === i" (click)="ptab.set(i)">{{ t }}</button>}</nav>
          <rpt-preview [preview]="preview()" [tab]="ptab()" [compact]="true" [range]="params().range" (rangeChanged)="setP('range', $event)" />
        } @else {
          <div class="ready">@if (busy()) {<span class="spinner"></span>Generating…} @else {Set parameters and click <b>Run</b> to generate this report.}</div>
        }
      </div>
    }
    @if (schedFor(); as r) {<rpt-schedule-modal [report]="r" (closed)="schedFor.set(null); $event && toast.show($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sr { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 14px; align-items: start; }
    .cats { display: flex; flex-direction: column; gap: 2px; padding: 12px; position: sticky; top: 76px; } .cats h4 { margin: 0 0 8px; font-size: 13px; }
    .cats button { display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 8px 10px; border-radius: 7px; cursor: pointer; font-size: 12.5px; text-align: left; color: var(--kf-3b3f5c); }
    .cats button span:not(.cd) { flex: 1; } .cats button b { font-size: 11.5px; color: var(--muted); font-weight: 500; } .cats button.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .cd { width: 8px; height: 8px; border-radius: 50%; }
    .bar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; } .bar .search-box { flex: 1; max-width: 360px; } .fo { display: flex; gap: 6px; align-items: center; font-size: 12.5px; } .muted { color: var(--muted); font-size: 12.5px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
    .rc { display: flex; flex-direction: column; gap: 8px; padding: 14px; } .rc:hover { border-color: var(--kl-c4b5fd); }
    .rh { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .rh div { display: flex; flex-direction: column; min-width: 0; } .rh b { font-size: 13.5px; } .rh small { color: var(--muted); font-size: 11.5px; }
    .ri { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .star { border: 0; background: none; cursor: pointer; color: var(--kf-9ca3af); } .star.on { color: var(--kf-f59e0b); }
    .rc p { margin: 0; font-size: 12px; color: var(--kf-4b4f6b); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 35px; }
    .meta { display: flex; gap: 12px; align-items: center; font-size: 11.5px; color: var(--muted); } .meta span { display: inline-flex; gap: 4px; align-items: center; }
    .acts { display: flex; gap: 6px; margin-top: 2px; }
    .run.g-modal { width: min(1100px, calc(100vw - 32px)); }
    .mh { display: flex; gap: 10px; align-items: center; } .mh h3 { margin: 0; }
    .prm { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding: 10px; background: var(--kb-fafafe); border-radius: 10px; margin-bottom: 12px; }
    .prm label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--kf-4b4f6b); } .prm label.cb { flex-direction: row; align-items: center; gap: 6px; padding-bottom: 8px; }
    .ptabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; } .ptabs button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 5px; padding: 5px 12px; font-size: 11.5px; cursor: pointer; }
    .ptabs button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .ready { display: flex; gap: 10px; align-items: center; justify-content: center; min-height: 240px; color: var(--kf-4b4f6b); font-size: 13px; }
    .spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--kl-ddd6fe); border-top-color: var(--primary); animation: sp 0.8s linear infinite; } @keyframes sp { to { transform: rotate(360deg); } }
  `,
})
export class StandardReports {
  protected readonly store = inject(ReportsStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtNum;
  protected readonly fd = fmtDate;
  protected readonly sites = ['All Sites', ...SITES];
  protected readonly depts = ['Engineering', 'Operations', 'Finance', 'HR', 'Sales', 'IT', 'Facilities', 'Security'];
  protected readonly toast = toast();
  protected readonly cat = signal('');
  protected readonly q = signal('');
  protected readonly sort = signal<'runs' | 'updated' | 'name'>('runs');
  protected readonly favOnly = signal(false);
  protected readonly runFor = signal<Report | null>(null);
  protected readonly schedFor = signal<Report | null>(null);
  protected readonly params = signal<PreviewParams>({ ...DEFAULT_PARAMS });
  protected readonly ran = signal(false);
  protected readonly busy = signal(false);
  protected readonly ptab = signal(0);

  protected readonly std = computed(() => this.store.reports().filter((r) => r.type === 'Standard'));
  protected readonly modulesCovered = computed(() => new Set(this.std().map((r) => r.module)).size);
  protected readonly stdRuns = computed(() => this.std().reduce((a, r) => a + r.runs, 0));
  protected readonly topRun = computed(() => [...this.std()].sort((a, b) => b.runs - a.runs)[0]);
  protected readonly scheduled = computed(() => new Set(this.store.schedules().filter((s) => s.active).map((s) => s.reportId)));
  protected readonly catCounts = computed(() =>
    CATEGORIES.map((name) => {
      const l = this.std().filter((r) => r.category === name);
      return { name, count: l.length, color: l[0]?.color ?? 'var(--ka-9ca3af)' };
    }).filter((c) => c.count),
  );
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    const s = this.sort();
    return this.std()
      .filter((r) => (!this.cat() || r.category === this.cat()) && (!q || `${r.name} ${r.module} ${r.description}`.toLowerCase().includes(q)) && (!this.favOnly() || r.favorite))
      .sort((a, b) => (s === 'runs' ? b.runs - a.runs : s === 'updated' ? b.updated.localeCompare(a.updated) : a.name.localeCompare(b.name)));
  });
  protected readonly preview = computed(() => previewFor(this.runFor() ?? this.std()[0], this.params()));

  @HostListener('document:keydown.escape') esc() {
    this.runFor.set(null);
  }
  protected go(s: string) {
    this.router.navigateByUrl(`/reports-analytics/${s}`);
  }
  protected inLibrary(r: Report) {
    this.store.focusId.set(r.id);
    this.go('report-library');
  }
  protected open(r: Report) {
    this.runFor.set(r);
    this.ran.set(false);
    this.ptab.set(0);
    this.params.set({ ...DEFAULT_PARAMS });
    this.run(r);
  }
  protected setP<K extends keyof PreviewParams>(k: K, v: PreviewParams[K]) {
    this.params.update((p) => ({ ...p, [k]: v }));
  }
  protected run(r: Report) {
    this.busy.set(true);
    this.ran.set(false);
    setTimeout(() => {
      this.store.run(r, `Generated with Site=${this.params().site}, Range=${this.params().range}`);
      this.busy.set(false);
      this.ran.set(true);
    }, 700);
  }
  protected exportRun(r: Report) {
    const p = this.preview();
    downloadCsv(`${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, [['Date', ...p.trend.series.map((s) => s.name)], ...p.trend.labels.map((l, i) => [l, ...p.trend.series.map((s) => s.values[i])]), [], [p.breakdown.title, '%'], ...p.breakdown.rows.map((x) => [x.label, x.pct])]);
    this.store.addExport(r.name, 'CSV', p.trend.labels.length + p.breakdown.rows.length);
    this.toast.show(`${r.name} exported`);
  }
  protected exportList() {
    downloadCsv('standard-reports.csv', [['ID', 'Name', 'Module', 'Category', 'Runs', 'Updated'], ...this.list().map((r) => [r.id, r.name, r.module, r.category, r.runs, r.updated])]);
    this.toast.show(`${this.list().length} standard reports exported`);
  }
}

/* ======================= Scheduled Reports ======================= */
interface SchedRow extends Schedule {
  name: string;
  icon: string;
  color: string;
  when: string;
  nextLabel: string;
  recip: string;
  state: string;
}
@Component({
  selector: 'app-reports-scheduled-reports',
  imports: [...UI, DataTable, ScheduleModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Scheduled Reports" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Automated report deliveries by email, with run history and failure handling.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
      <button class="btn-primary" (click)="creating.set(true)"><app-icon name="plus" [size]="16" />New Schedule</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Scheduled Reports" [value]="store.schedules().length" icon="calendar-days" color="var(--ka-7c3aed)" sub="across all modules" />
      <app-kpi label="Active Schedules" [value]="active()" icon="play" color="var(--ka-16a34a)" [sub]="paused() + ' paused'" />
      <app-kpi label="Due Today" [value]="dueToday()" icon="clock" color="var(--ka-f59e0b)" sub="active schedules running today" />
      <app-kpi label="Deliveries (This Month)" [value]="fmt(1184 + delivered())" icon="reports-mail" color="var(--ka-2563eb)" change="9%" sub="vs. last month" />
      <app-kpi label="Failed Deliveries" [value]="failed()" icon="triangle-alert" color="var(--ka-ef4444)" sub="needs attention" [subColor]="failed() ? 'var(--ka-dc2626)' : undefined" />
    </section>

    <section class="sc">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="schedules" [searchKeys]="['name', 'recip', 'owner']" searchPlaceholder="Search report, recipient, owner..." [activeId]="selId()"
          (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <aside class="side">
        @if (sel(); as s) {
          <div class="card det">
            <div class="dh"><span class="ri" [style.background]="s.color"><app-icon [name]="s.icon" [size]="18" /></span><div><b>{{ s.name }}</b><small>{{ s.id }} · owner {{ s.owner }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <div class="sw"><span [class]="s.active ? 'tag green' : 'tag grey'">{{ s.active ? 'Active' : 'Paused' }}</span>
              <button class="tog" [class.on]="s.active" (click)="toggle(s)" [attr.aria-label]="s.active ? 'Pause' : 'Resume'"><i></i></button></div>
            <div class="form-grid">
              <label>Frequency<select class="select" [value]="s.frequency" (change)="patch(s, { frequency: $any($event.target).value })"><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option></select></label>
              <label>Time<input class="input" type="time" [value]="s.time" (change)="patch(s, { time: $any($event.target).value })" /></label>
              <label>Format<select class="select" [value]="s.format" (change)="patch(s, { format: $any($event.target).value })"><option>PDF</option><option>Excel</option><option>CSV</option></select></label>
              <label>Next run<input class="input" [value]="s.nextLabel" readonly /></label>
              <label class="full">Recipients<input class="input" [value]="s.recipients.join(', ')" (change)="patch(s, { recipients: splitR($any($event.target).value) })" /></label>
            </div>
            <div class="ba"><button class="btn-primary btn-sm" (click)="runNow(s)"><app-icon name="play" [size]="13" />Run now</button><button class="btn-ghost sm" (click)="act('library', s)">Open report</button><button class="btn-ghost sm danger" (click)="act('delete', s)">Delete</button></div>
            <h4>Delivery History</h4>
            <ul class="hist">@for (h of history(s); track $index) {<li><span [class]="h.ok ? 'dot g' : 'dot r'"></span><div><b>{{ h.at }}</b><small>{{ h.note }}</small></div><span [class]="h.ok ? 'tag green' : 'tag red'">{{ h.ok ? 'Delivered' : 'Failed' }}</span></li>}</ul>
          </div>
        } @else {
          <div class="card">
            <h4>Upcoming 7 Days</h4>
            <div class="days">
              @for (d of upcoming(); track d.date) {
                <div class="day"><div class="dl"><b>{{ d.dow }}</b><small>{{ d.label }}</small></div>
                  <div class="items">@for (s of d.items; track s.id) {<button class="it" (click)="selId.set(s.id)" [style.border-left-color]="s.color"><span>{{ s.time }}</span>{{ s.name }}</button>} @empty {<span class="muted">No deliveries</span>}</div></div>
              }
            </div>
          </div>
        }
      </aside>
    </section>
    @if (creating()) {<rpt-schedule-modal (closed)="creating.set(false); $event && toast.show($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sc { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 12px; align-items: start; }
    .side { position: sticky; top: 76px; } h4 { margin: 0 0 10px; font-size: 13px; }
    .days { display: flex; flex-direction: column; gap: 8px; max-height: 640px; overflow: auto; }
    .day { display: grid; grid-template-columns: 52px 1fr; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--kl-f0f1f6); }
    .dl { display: flex; flex-direction: column; font-size: 12px; } .dl small { color: var(--muted); }
    .items { display: flex; flex-direction: column; gap: 4px; } .it { display: flex; gap: 8px; text-align: left; border: 1px solid var(--border); border-left: 3px solid; border-radius: 6px; background: var(--kb-ffffff); padding: 5px 8px; font-size: 11.5px; cursor: pointer; }
    .it span { color: var(--muted); font-variant-numeric: tabular-nums; } .it:hover { background: var(--kb-faf8ff); } .muted { color: var(--muted); font-size: 11.5px; }
    .det { display: flex; flex-direction: column; gap: 12px; } .dh { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .dh div { display: flex; flex-direction: column; } .dh small { color: var(--muted); font-size: 11.5px; }
    .ri { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .sw { display: flex; justify-content: space-between; align-items: center; }
    .tog { width: 38px; height: 21px; border-radius: 11px; border: 0; background: var(--kb-d1d5db); position: relative; cursor: pointer; } .tog i { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: var(--kb-ffffff); transition: 0.2s; }
    .tog.on { background: var(--primary); } .tog.on i { left: 19px; }
    .ba { display: flex; gap: 6px; } .danger { color: var(--red); }
    .hist { list-style: none; margin: 0; padding: 0; } .hist li { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .hist div { display: flex; flex-direction: column; } .hist small { color: var(--muted); } .dot { width: 8px; height: 8px; border-radius: 50%; } .dot.g { background: var(--kb-22c55e); } .dot.r { background: var(--kb-ef4444); }
    @media (max-width: 1300px) { .sc { grid-template-columns: 1fr; } .side { position: static; } }
  `,
})
export class ScheduledReports {
  protected readonly store = inject(ReportsStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtNum;
  protected readonly toast = toast();
  protected readonly selId = signal<string | null>(null);
  protected readonly creating = signal(false);
  private readonly runs = signal<Record<string, { at: string; ok: boolean; note: string }[]>>({});
  protected readonly delivered = computed(() => Object.values(this.runs()).reduce((a, l) => a + l.length, 0));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Report', kind: 'icon', sub: 'id' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'when', label: 'Schedule' },
    { key: 'nextLabel', label: 'Next Run' },
    { key: 'format', label: 'Format', kind: 'tag', tag: (r) => (r.format === 'PDF' ? 'tag red' : r.format === 'Excel' ? 'tag green' : 'tag blue') },
    { key: 'recip', label: 'Recipients' },
    { key: 'lastStatus', label: 'Last Delivery', kind: 'status' },
    { key: 'state', label: 'State', kind: 'tag', tag: (r) => (r.active ? 'tag green' : 'tag grey') },
  ];
  protected readonly filters = [
    { key: 'frequency', label: 'Frequency', options: ['Daily', 'Weekly', 'Monthly', 'Quarterly'] },
    { key: 'format', label: 'Format', options: ['PDF', 'Excel', 'CSV'] },
    { key: 'state', label: 'State', options: ['Active', 'Paused'] },
    { key: 'lastStatus', label: 'Last Delivery', options: ['Delivered', 'Failed', 'Pending'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'run', label: 'Run now', icon: 'play' },
    { id: 'pause', label: 'Pause', icon: 'pause', when: (r) => r.active },
    { id: 'resume', label: 'Resume', icon: 'play', when: (r) => !r.active },
    { id: 'retry', label: 'Retry failed delivery', icon: 'refresh', when: (r) => r.lastStatus === 'Failed' },
    { id: 'library', label: 'Open report', icon: 'file-text' },
    { id: 'delete', label: 'Delete', icon: 'reports-trash', danger: true },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'pause', label: 'Pause' }, { id: 'resume', label: 'Resume' }, { id: 'delete', label: 'Delete', danger: true }];

  protected readonly rows = computed<SchedRow[]>(() => {
    const m = this.store.byId();
    return this.store.schedules().map((s) => {
      const r = m.get(s.reportId);
      return { ...s, name: r?.name ?? s.reportId, icon: r?.icon ?? 'file-text', color: r?.color ?? 'var(--ka-7c3aed)', when: `${s.day} · ${s.time}`, nextLabel: this.nextLabel(s), recip: `${s.recipients[0]}${s.recipients.length > 1 ? ' +' + (s.recipients.length - 1) : ''}`, state: s.active ? 'Active' : 'Paused' };
    });
  });
  protected readonly sel = computed(() => this.rows().find((r) => r.id === this.selId()) ?? null);
  protected readonly active = computed(() => this.store.schedules().filter((s) => s.active).length);
  protected readonly paused = computed(() => this.store.schedules().length - this.active());
  protected readonly dueToday = computed(() => this.store.schedules().filter((s) => s.active && s.next.startsWith(TODAY)).length);
  protected readonly failed = computed(() => this.store.schedules().filter((s) => s.lastStatus === 'Failed').length);
  protected readonly upcoming = computed(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 9, 14 + i));
      const iso = d.toISOString().slice(0, 10);
      const dow = d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const items = this.rows()
        .filter((s) => s.active && (s.next.startsWith(iso) || s.frequency === 'Daily' || (s.frequency === 'Weekly' && s.day === dow)))
        .sort((a, b) => a.time.localeCompare(b.time));
      out.push({ date: iso, dow: i === 0 ? 'Today' : dow, label: fmtDate(iso).slice(0, 6), items });
    }
    return out;
  });

  private nextLabel(s: Schedule) {
    if (!s.active) return '—';
    const d = s.next.slice(0, 10);
    return `${d === TODAY ? 'Today' : fmtDate(d).slice(0, 6)}, ${s.next.slice(11, 16)}`;
  }
  protected splitR(v: string) {
    return v.split(',').map((x) => x.trim()).filter(Boolean);
  }
  protected patch(s: Schedule, ch: Partial<Schedule>) {
    this.store.patchSchedule(s.id, ch);
    this.toast.show('Schedule updated');
  }
  protected toggle(s: Schedule) {
    this.store.patchSchedule(s.id, { active: !s.active });
    this.store.log('Schedule', this.store.byId().get(s.reportId)?.name ?? s.id, s.active ? 'Schedule paused' : 'Schedule resumed');
    this.toast.show(s.active ? 'Schedule paused' : 'Schedule resumed');
  }
  protected history(s: Schedule) {
    const extra = this.runs()[s.id] ?? [];
    const base = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 13 - i * (s.frequency === 'Daily' ? 1 : s.frequency === 'Weekly' ? 7 : 30)));
      const ok = !(s.lastStatus === 'Failed' && i === 0);
      return { at: `${fmtDate(d.toISOString().slice(0, 10))}, ${s.time}`, ok, note: ok ? `${s.format} sent to ${s.recipients.length} recipient(s)` : 'SMTP timeout · mail server unreachable' };
    });
    return [...extra, ...base];
  }
  protected runNow(s: Schedule) {
    const r = this.store.byId().get(s.reportId);
    if (r) this.store.run(r, `Manual run of schedule ${s.id}`);
    this.store.patchSchedule(s.id, { lastStatus: 'Delivered' });
    const t = new Date();
    this.runs.update((m) => ({ ...m, [s.id]: [{ at: `Today, ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, ok: true, note: `Manual run · ${s.format} sent to ${s.recipients.length} recipient(s)` }, ...(m[s.id] ?? [])] }));
    this.toast.show(`${r?.name} delivered to ${s.recipients.join(', ')}`);
  }
  protected act(a: string, s: Schedule) {
    if (a === 'run' || a === 'retry') return this.runNow(s);
    if (a === 'pause' || a === 'resume') return this.toggle(s);
    if (a === 'library') {
      this.store.focusId.set(s.reportId);
      return this.router.navigateByUrl('/reports-analytics/report-library');
    }
    if (a === 'delete') {
      this.store.schedules.update((l) => l.filter((x) => x.id !== s.id));
      this.store.log('Delete', this.store.byId().get(s.reportId)?.name ?? s.id, `Schedule ${s.id} deleted`);
      if (this.selId() === s.id) this.selId.set(null);
      this.toast.show('Schedule deleted');
    }
    return;
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'delete') this.store.schedules.update((l) => l.filter((x) => !ids.includes(x.id)));
    else this.store.schedules.update((l) => l.map((x) => (ids.includes(x.id) ? { ...x, active: a === 'resume' } : x)));
    this.toast.show(`${ids.length} schedules ${a === 'delete' ? 'deleted' : a === 'pause' ? 'paused' : 'resumed'}`);
  }
  protected exportCsv() {
    downloadCsv('scheduled-reports.csv', [['ID', 'Report', 'Frequency', 'Day', 'Time', 'Format', 'Recipients', 'Next Run', 'Last Delivery', 'State', 'Owner'], ...this.rows().map((r) => [r.id, r.name, r.frequency, r.day, r.time, r.format, r.recipients.join('; '), r.next, r.lastStatus, r.state, r.owner])]);
  }
}

/* ======================= Dashboards ======================= */
@Component({
  selector: 'app-reports-dashboards',
  imports: [...UI, RptColumns],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Dashboards" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Personal and shared analytics dashboards built from report widgets — live, editable and shareable.">
      <button class="btn-ghost" (click)="exportDash()"><app-icon name="download" [size]="15" />Export</button>
      <button class="btn-primary" (click)="newName.set('')"><app-icon name="plus" [size]="16" />New Dashboard</button>
    </app-page-head>

    <section class="dl">
      @for (d of store.dashboards(); track d.id) {
        <button class="card dc" [class.on]="d.id === selId()" (click)="selId.set(d.id); editing.set(false)">
          <div class="thumb">@for (w of d.widgets.slice(0, 6); track w.id) {<i [style.grid-column]="'span ' + w.span" [style.background]="d.color + (w.kind === 'kpi' ? '22' : '44')"></i>}</div>
          <b>{{ d.name }}@if (d.isDefault) {<app-icon name="reports-star-fill" [size]="12" class="def" />}</b>
          <small>{{ d.owner }} · {{ d.widgets.length }} widgets · {{ fmt(d.views) }} views</small>
          <span [class]="d.shared ? 'tag blue' : 'tag grey'">{{ d.shared ? 'Shared' : 'Private' }}</span>
        </button>
      }
    </section>

    @if (sel(); as d) {
      <section class="card dh">
        <div><h2>{{ d.name }}</h2><small class="muted">Owner {{ d.owner }} · updated {{ fd(d.updated) }} · @if (state.live()) {<span class="lv"><i></i>Live</span>} </small></div>
        <div class="toolbar">
          @if (editing()) {
            <button class="btn-ghost" (click)="adding.set(true)"><app-icon name="plus" [size]="15" />Add Widget</button>
            <button class="btn-primary" (click)="editing.set(false); toast.show('Layout saved')">Done</button>
          } @else {
            <button class="btn-ghost" (click)="editing.set(true)"><app-icon name="reports-edit" [size]="15" />Edit Layout</button>
            <button class="btn-ghost" (click)="setDefault(d)" [disabled]="d.isDefault"><app-icon name="star" [size]="15" />{{ d.isDefault ? 'Default' : 'Set as Default' }}</button>
            <button class="btn-ghost" (click)="toggleShare(d)"><app-icon name="reports-share" [size]="15" />{{ d.shared ? 'Make Private' : 'Share' }}</button>
            <button class="btn-ghost" (click)="duplicate(d)"><app-icon name="reports-copy" [size]="15" />Duplicate</button>
            @if (d.owner === me) {<button class="btn-ghost danger" (click)="remove(d)"><app-icon name="reports-trash" [size]="15" /></button>}
          }
        </div>
      </section>

      <section class="wg" [class.edit]="editing()">
        @for (w of d.widgets; track w.id; let i = $index) {
          <div class="card w" [style.grid-column]="'span ' + w.span">
            <div class="wh"><h4>{{ w.title }}</h4>
              @if (editing()) {
                <div class="wt">
                  <button (click)="move(d, i, -1)" [disabled]="i === 0" aria-label="Move left">‹</button><button (click)="move(d, i, 1)" [disabled]="i === d.widgets.length - 1" aria-label="Move right">›</button>
                  <button (click)="resize(d, i)" title="Resize">{{ w.span }}/12</button><button class="rm" (click)="removeW(d, i)" aria-label="Remove">×</button>
                </div>
              } @else {<small class="muted">{{ w.source }}</small>}
            </div>
            @let p = data(w);
            @switch (w.kind) {
              @case ('kpi') {
                <div class="kv"><b>{{ kpiValue(w) }}</b><span [class]="kpiUp(w) ? 'good' : 'bad'">{{ kpiUp(w) ? '▲' : '▼' }} {{ 2 + (w.title.length % 7) }}%</span></div>
                <app-sparkline [values]="p.trend.series[0].values.slice(-10)" [color]="d.color" />
              }
              @case ('line') {<app-line-chart [labels]="p.trend.labels" [series]="lineSeries(p)" [height]="200" suffix="%" />}
              @case ('column') {<rpt-columns [labels]="p.trend.labels" [series]="p.trend.series" [height]="170" />}
              @case ('donut') {<app-donut [segments]="donut(p)" center="Total" [size]="130" />}
              @case ('bars') {<app-bar-list [rows]="bars(p)" />}
              @case ('heat') {<app-heatmap [rows]="heatRows" [cols]="heatCols" [data]="heat()" />}
            }
          </div>
        } @empty {
          <div class="card empty">This dashboard has no widgets yet. <button class="link" (click)="editing.set(true); adding.set(true)">Add a widget</button></div>
        }
      </section>
    }

    @if (adding()) {
      <div class="g-overlay" (click)="adding.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Widget Library</h3><button class="close-btn" (click)="adding.set(false)">×</button></div>
        <div class="lib">@for (w of library; track w.title + w.kind) {<button (click)="addW(w)"><app-icon [name]="kindIcon(w.kind)" [size]="18" /><b>{{ w.title }}</b><small>{{ w.kind }} · {{ w.source }}</small></button>}</div>
      </div>
    }
    @if (newName() !== null) {
      <div class="g-overlay" (click)="newName.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>New Dashboard</h3><button type="button" class="close-btn" (click)="newName.set(null)">×</button></div>
        <div class="form-grid"><label class="full">Name *<input class="input" [value]="newName()" (input)="newName.set($any($event.target).value)" placeholder="e.g. Site Operations Weekly" /></label>
          <label class="full">Start from<select class="select" [value]="tpl()" (change)="tpl.set($any($event.target).value)"><option value="blank">Blank</option><option value="kpi">KPI starter (4 KPIs + trend)</option>@for (d of store.dashboards(); track d.id) {<option [value]="d.id">Copy of {{ d.name }}</option>}</select></label></div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newName.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!newName()?.trim()">Create</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .dc { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left; cursor: pointer; padding: 10px; font: inherit; color: inherit; }
    .dc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .dc b { font-size: 13px; display: flex; align-items: center; gap: 5px; } .dc small { color: var(--muted); font-size: 11px; }
    .def { color: var(--kf-f59e0b); }
    .thumb { width: 100%; height: 54px; display: grid; grid-template-columns: repeat(12, 1fr); grid-auto-rows: 1fr; gap: 3px; margin-bottom: 4px; } .thumb i { border-radius: 3px; }
    .dh { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } .dh h2 { margin: 0; font-size: 18px; } .muted { color: var(--muted); font-size: 12px; }
    .lv { display: inline-flex; gap: 5px; align-items: center; color: var(--kf-16a34a); } .lv i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-16a34a); }
    .danger { color: var(--red); }
    .wg { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; } .wg.edit .w { outline: 2px dashed var(--kl-c4b5fd); outline-offset: -2px; }
    .w { min-height: 120px; } .wh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px; } .wh h4 { margin: 0; font-size: 13px; }
    .wt { display: flex; gap: 3px; } .wt button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 5px; font-size: 11px; padding: 2px 7px; cursor: pointer; } .wt .rm { color: var(--red); }
    .kv { display: flex; align-items: baseline; gap: 10px; } .kv b { font-size: 26px; } .kv span { font-size: 12px; font-weight: 600; }
    .empty { grid-column: span 12; text-align: center; color: var(--muted); padding: 40px; }
    .lib { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .lib button { display: grid; grid-template-columns: 22px 1fr; gap: 2px 8px; text-align: left; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; padding: 10px; cursor: pointer; color: var(--primary); }
    .lib button:hover { background: var(--kb-faf8ff); border-color: var(--kl-c4b5fd); } .lib b { color: var(--text); font-size: 12.5px; } .lib small { grid-column: 2; color: var(--muted); font-size: 11px; text-transform: capitalize; }
    @media (max-width: 1250px) { .w { grid-column: span 6 !important; } }
  `,
})
export class RptDashboards {
  protected readonly store = inject(ReportsStore);
  protected readonly state = inject(AppState);
  protected readonly fmt = fmtNum;
  protected readonly fd = fmtDate;
  protected readonly me = ME;
  protected readonly toast = toast();
  protected readonly library = WIDGET_LIBRARY;
  protected readonly selId = signal('D1');
  protected readonly editing = signal(false);
  protected readonly adding = signal(false);
  protected readonly newName = signal<string | null>(null);
  protected readonly tpl = signal('kpi');
  protected readonly heatRows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly heatCols = ['06', '08', '10', '12', '14', '16', '18', '20'];
  protected readonly sel = computed(() => this.store.dashboards().find((d) => d.id === this.selId()) ?? null);
  protected readonly heat = computed(() => {
    const t = this.state.tick();
    return this.heatRows.map((_, r) => this.heatCols.map((_, c) => Math.max(4, Math.min(99, Math.round((r < 5 ? 55 : 15) + Math.sin(c / 1.3) * 35 + ((r * 7 + c * 3 + (c === 3 ? t % 3 : 0)) % 11))))));
  });
  private readonly cache = new Map<string, ReturnType<typeof previewFor>>();

  protected data(w: Widget) {
    if (!this.cache.has(w.source)) {
      const r = this.store.reports().find((x) => x.category === w.source) ?? this.store.reports()[0];
      this.cache.set(w.source, previewFor(r, DEFAULT_PARAMS));
    }
    return this.cache.get(w.source)!;
  }
  protected kpiValue(w: Widget) {
    const p = this.data(w);
    const live = this.state.wobble(w.id, 2);
    if (/Rate|Utilization|Compliance/.test(w.title)) return `${p.donut.pct + (live > 0 ? 1 : 0)}%`;
    const inv = /Open|Denials/.test(w.title);
    return fmtNum(Math.round((p.donut.total * (inv ? 100 - p.donut.pct : p.donut.pct)) / 100) + live);
  }
  protected kpiUp(w: Widget) {
    return !/Open|Denials/.test(w.title);
  }
  protected lineSeries(p: ReturnType<typeof previewFor>) {
    return p.trend.series.slice(0, 2).map((s, i) => ({ ...s, area: i === 0 }));
  }
  protected donut(p: ReturnType<typeof previewFor>) {
    return p.breakdown.rows.map((r) => ({ label: r.label, value: r.pct, color: r.color }));
  }
  protected bars(p: ReturnType<typeof previewFor>) {
    return p.breakdown.rows.map((r) => ({ label: r.label, value: r.pct, display: r.pct + '%', color: r.color }));
  }
  protected kindIcon(k: string) {
    return { kpi: 'activity', line: 'reports-line', column: 'reports-bar', donut: 'reports-pie', bars: 'sliders', heat: 'grid' }[k] ?? 'box';
  }
  private patch(id: string, ch: Partial<Dash>) {
    this.store.dashboards.update((l) => l.map((d) => (d.id === id ? { ...d, ...ch, updated: TODAY } : d)));
  }
  protected move(d: Dash, i: number, dir: number) {
    const w = [...d.widgets];
    [w[i], w[i + dir]] = [w[i + dir], w[i]];
    this.patch(d.id, { widgets: w });
  }
  protected resize(d: Dash, i: number) {
    const spans = [3, 4, 6, 8, 12];
    const w = d.widgets.map((x, j) => (j === i ? { ...x, span: spans[(spans.indexOf(x.span) + 1) % spans.length] } : x));
    this.patch(d.id, { widgets: w });
  }
  protected removeW(d: Dash, i: number) {
    this.patch(d.id, { widgets: d.widgets.filter((_, j) => j !== i) });
  }
  protected addW(w: Omit<Widget, 'id'>) {
    const d = this.sel()!;
    this.patch(d.id, { widgets: [...d.widgets, { ...w, id: `w${Date.now()}` }] });
    this.adding.set(false);
    this.toast.show(`${w.title} added`);
  }
  protected setDefault(d: Dash) {
    this.store.dashboards.update((l) => l.map((x) => ({ ...x, isDefault: x.id === d.id })));
    this.toast.show(`${d.name} is now your default dashboard`);
  }
  protected toggleShare(d: Dash) {
    this.patch(d.id, { shared: !d.shared });
    this.store.log('Share', `${d.name} (dashboard)`, d.shared ? 'Made private' : 'Shared with all report viewers');
    this.toast.show(d.shared ? 'Dashboard is now private' : 'Dashboard shared with all report viewers');
  }
  protected duplicate(d: Dash) {
    const c: Dash = { ...d, id: `D${Date.now()}`, name: `${d.name} (Copy)`, owner: ME, shared: false, isDefault: false, views: 0, updated: TODAY, widgets: d.widgets.map((w, i) => ({ ...w, id: `${w.id}-c${i}` })) };
    this.store.dashboards.update((l) => [...l, c]);
    this.selId.set(c.id);
    this.toast.show('Dashboard duplicated');
  }
  protected remove(d: Dash) {
    this.store.dashboards.update((l) => l.filter((x) => x.id !== d.id));
    this.selId.set('D1');
    this.toast.show(`${d.name} deleted`);
  }
  protected create() {
    const name = this.newName()?.trim();
    if (!name) return;
    const src = this.store.dashboards().find((d) => d.id === this.tpl());
    const widgets = src ? src.widgets.map((w, i) => ({ ...w, id: `n${i}${Date.now()}` })) : this.tpl() === 'kpi' ? [0, 1, 2, 3, 6].map((i, k) => ({ ...WIDGET_LIBRARY[i], id: `n${k}${Date.now()}` })) : [];
    const d: Dash = { id: `D${Date.now()}`, name, owner: ME, shared: false, isDefault: false, updated: TODAY, views: 0, color: 'var(--ka-7c3aed)', widgets };
    this.store.dashboards.update((l) => [...l, d]);
    this.store.log('Create', `${name} (dashboard)`, `Dashboard created with ${widgets.length} widgets`);
    this.selId.set(d.id);
    this.newName.set(null);
    this.editing.set(!widgets.length);
    this.toast.show(`${name} created`);
  }
  protected exportDash() {
    const d = this.sel();
    if (!d) return;
    downloadCsv(`${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, [['Widget', 'Type', 'Source', 'Value / Series'], ...d.widgets.map((w) => [w.title, w.kind, w.source, w.kind === 'kpi' ? this.kpiValue(w) : this.data(w).trend.series[0].values.join(' ')])]);
    this.store.addExport(`${d.name} (dashboard)`, 'CSV', d.widgets.length);
    this.toast.show('Dashboard data exported');
  }
}
