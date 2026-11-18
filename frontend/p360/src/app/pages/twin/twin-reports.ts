// Reports & Insights — space utilisation reports, AI insight cards, report library with generate / schedule / CSV export.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { DAY_FACTOR, DAYS, FLOOR_TABS, heatZones, HOURS, zoneUtil } from './twin-analytics';
import { floorById, fmtN, TReport, TwinStore, TZone, ZONE_COLOR, ZONE_GROUP } from './twin.data';

type GroupBy = 'Floor' | 'Zone Type' | 'Zone';
interface URow {
  id: string;
  name: string;
  sub: string;
  capacity: number;
  area: number;
  avg: number;
  peak: number;
  peakAt: string;
  heads: number;
  color: string;
}
interface Insight {
  id: string;
  icon: string;
  color: string;
  impact: 'High' | 'Medium' | 'Opportunity';
  title: string;
  metric: string;
  text: string;
  action: string;
  link?: string;
}
const PERIODS: Record<string, { f: number; label: string; weeks: number }> = { 'This Week': { f: 1, label: '03–09 Nov 2026', weeks: 1 }, 'This Month': { f: 0.97, label: 'Nov 2026', weeks: 4 }, 'This Quarter': { f: 0.94, label: 'Q4 2026', weeks: 13 } };
const CATEGORIES = ['Space', 'Occupancy', 'Assets', 'Sensors', 'Movement', 'Energy'];
const SCHEDULES = ['On demand', 'Daily · 18:00', 'Weekly · Mon 08:00', 'Weekly · Fri 17:00', 'Monthly · 1st', 'Monthly · 5th'];
const FORMATS = ['PDF', 'Excel', 'CSV'];
const AED_PER_M2 = 1450;
const WORK_HOURS = Array.from({ length: 11 }, (_, i) => i + 8);
const areaOf = (z: TZone) => Math.round(z.w * z.h * 0.0064);
const tl = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

@Component({
  selector: 'app-twin-reports-insights',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Insights" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Space utilisation reports and data-driven insights from the digital twin — schedule, generate and export.">
      <div class="tabs">@for (p of periods; track p) {<button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>}</div>
      <button class="btn-ghost" (click)="exportUtil()"><app-icon name="download" [size]="16" />Export CSV</button>
      <button class="btn-primary" (click)="newReport()"><app-icon name="plus" [size]="16" />New Report</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Avg Utilization" [value]="avgUtil() + '%'" icon="map-floor" color="var(--ka-7c3aed)" change="3%" sub="vs. previous period" />
      <app-kpi label="Peak Occupancy" [value]="peak().v + '%'" icon="users" color="var(--ka-2563eb)" [sub]="peak().at" />
      <app-kpi label="Under-used Space" [value]="fmt(underArea()) + ' m²'" icon="trending-up" color="var(--ka-f59e0b)" [sub]="underCount() + ' zones below 40%'" />
      <app-kpi label="Savings Potential" [value]="'AED ' + savings()" icon="twin-zap" color="var(--ka-16a34a)" sub="per year · consolidation" subColor="var(--ka-15803d)" />
      <app-kpi label="Scheduled Reports" [value]="store.reports().length" icon="file-chart" color="var(--ka-0ea5e9)" [sub]="ready() + ' ready · ' + generating() + ' generating'" />
    </section>

    <section class="card ins-wrap">
      <div class="card-head">
        <h3><app-icon name="twin-sparkles" [size]="17" /> Insights <span class="card-sub">{{ insights().length }} active · {{ periodLabel() }}</span></h3>
        @if (dismissed().size) {<button class="btn-ghost sm" (click)="dismissed.set(new_())">Restore {{ dismissed().size }} dismissed</button>}
      </div>
      <div class="ins">
        @for (i of insights(); track i.id) {
          <article class="in" [style.--c]="i.color">
            <header><span class="ic"><app-icon [name]="i.icon" [size]="18" /></span><span [class]="'tag ' + (i.impact === 'High' ? 'red' : i.impact === 'Medium' ? 'amber' : 'green')">{{ i.impact }}</span></header>
            <b class="m">{{ i.metric }}</b>
            <h4>{{ i.title }}</h4>
            <p>{{ i.text }}</p>
            <footer><button class="btn-ghost sm" (click)="doInsight(i)">{{ i.action }}</button><button class="lnk" (click)="dismiss(i.id)">Dismiss</button></footer>
          </article>
        } @empty {<p class="muted">All insights handled. 🎉</p>}
      </div>
    </section>

    <section class="row2">
      <div class="card">
        <div class="card-head">
          <h3>Space Utilization Report <span class="card-sub">{{ periodLabel() }} · 08:00–18:00</span></h3>
          <div class="tabs">@for (g of groups; track g) {<button [class.on]="groupBy() === g" (click)="groupBy.set(g)">{{ g }}</button>}</div>
        </div>
        <app-column-chart [labels]="chartRows().map(lab)" [series]="[{ name: 'Average', color: 'var(--ka-7c3aed)', values: avgVals() }, { name: 'Peak', color: 'var(--ka-c4b5fd)', values: peakVals() }]" [height]="220" suffix="%" />
        <div class="tw">
          <table class="table ut">
            <thead><tr>
              <th>{{ groupBy() }}</th><th class="num">Capacity</th><th class="num">Avg people</th>
              <th class="srt" (click)="flip()">Avg util. {{ desc() ? '▼' : '▲' }}</th><th class="num">Peak</th><th>Peak at</th><th>Status</th>
            </tr></thead>
            <tbody>
              @for (r of tableRows(); track r.id) {
                <tr>
                  <td><span class="sw" [style.background]="r.color"></span><b>{{ r.name }}</b><small class="muted">{{ r.sub }}</small></td>
                  <td class="num">{{ fmt(r.capacity) }}</td><td class="num">{{ fmt(r.heads) }}</td>
                  <td><div class="pb"><i class="bar"><i [style.width.%]="r.avg" [style.background]="r.avg < 40 ? 'var(--ka-f59e0b)' : r.avg > 85 ? 'var(--ka-ef4444)' : 'var(--ka-7c3aed)'"></i></i><span>{{ r.avg }}%</span></div></td>
                  <td class="num">{{ r.peak }}%</td><td>{{ r.peakAt }}</td>
                  <td><span [class]="r.avg < 40 ? 'tag amber' : r.peak > 100 ? 'tag red' : 'tag green'">{{ r.avg < 40 ? 'Under-used' : r.peak > 100 ? 'Over capacity' : 'Healthy' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (groupBy() === 'Zone' && allRows().length > 12) {<button class="btn-ghost sm more" (click)="showAll.set(!showAll())">{{ showAll() ? 'Show top 12' : 'Show all ' + allRows().length + ' zones' }}</button>}
      </div>
      <div class="col">
        <div class="card">
          <div class="card-head"><h3>Utilization Trend <span class="card-sub">last 12 weeks</span></h3></div>
          <app-line-chart [labels]="weeks" [series]="trend()" [height]="190" suffix="%" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Floor × Weekday <span class="card-sub">avg utilization %</span></h3></div>
          <app-heatmap [rows]="floorNames" [cols]="days" [data]="floorDay()" />
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Report Library <span class="card-sub">click a report to preview</span></h3></div>
      <app-data-table [rows]="reportRows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'owner', 'category']" searchPlaceholder="Search reports…" noun="reports" [activeId]="preview()?.id ?? null" (rowClick)="preview.set($event)" (action)="act($event.action, $event.row)" />
    </section>

    @if (preview(); as r) {
      <div class="g-overlay" (click)="preview.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div><h3>{{ r.name }}</h3><small class="muted">{{ r.category }} · {{ r.format }} · {{ r.schedule }}</small></div><button class="close-btn" (click)="preview.set(null)">×</button></div>
        <div class="pv">
          <div class="pv-k"><span>Avg utilization</span><b>{{ avgUtil() }}%</b></div>
          <div class="pv-k"><span>Peak</span><b>{{ peak().v }}%</b></div>
          <div class="pv-k"><span>Under-used</span><b>{{ fmt(underArea()) }} m²</b></div>
        </div>
        <h4>Utilization by floor</h4>
        <app-bar-list [rows]="floorBars()" />
        <h4>Top insights included</h4>
        <ul class="pv-l">@for (i of insights().slice(0, 4); track i.id) {<li><app-icon [name]="i.icon" [size]="14" />{{ i.title }}</li>}</ul>
        <dl class="facts"><dt>Owner</dt><dd>{{ r.owner }}</dd><dt>Last run</dt><dd>{{ r.last }}</dd><dt>Status</dt><dd><span [class]="r.status === 'Ready' ? 'tag green' : r.status === 'Generating' ? 'tag amber' : 'tag blue'">{{ r.status }}</span></dd><dt>Recipients</dt><dd>{{ recipients(r) }}</dd></dl>
        <div class="acts">
          <button class="btn-primary" [disabled]="r.status === 'Generating'" (click)="download(r)"><app-icon name="download" [size]="14" />Download</button>
          <button class="btn-ghost" [disabled]="r.status === 'Generating'" (click)="generate(r)"><app-icon name="refresh" [size]="14" />Generate now</button>
          <button class="btn-ghost" (click)="email(r)"><app-icon name="twin-mail" [size]="14" />Email</button>
          <button class="btn-ghost" (click)="edit(r)"><app-icon name="twin-pencil" [size]="14" />Edit</button>
        </div>
      </aside>
    }

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveForm()">
        <div class="modal-head"><h3>{{ isNew() ? 'New Report' : 'Edit ' + f.name }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="setF('category', $any($event.target).value)">@for (c of categories; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Format<select class="select" [value]="f.format" (change)="setF('format', $any($event.target).value)">@for (c of formats; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Schedule<select class="select" [value]="f.schedule" (change)="setF('schedule', $any($event.target).value)">@for (c of schedules; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Owner<input class="input" [value]="f.owner" (input)="setF('owner', $any($event.target).value)" /></label>
          <label class="full">Recipients<input class="input" [value]="rcpt()" (input)="rcpt.set($any($event.target).value)" placeholder="email1@company.com, email2@company.com" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ isNew() ? 'Create & generate' : 'Save' }}</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .ins-wrap { margin-bottom: 12px; } .ins-wrap h3 { display: flex; align-items: center; gap: 6px; }
    .ins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .in { border: 1px solid var(--border); border-top: 3px solid var(--c); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; background: var(--kb-ffffff); }
    .in header { display: flex; justify-content: space-between; align-items: center; } .in .ic { width: 32px; height: 32px; border-radius: 8px; background: var(--c); color: var(--kf-ffffff); display: grid; place-items: center; }
    .in .m { font-size: 22px; color: var(--c); } .in h4 { margin: 0; font-size: 13.5px; } .in p { margin: 0; font-size: 12px; color: var(--kf-4b4f6b); line-height: 1.45; flex: 1; }
    .in footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; } .lnk { border: none; background: none; color: var(--muted); font-size: 12px; cursor: pointer; }
    .row2 { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; } .col { display: flex; flex-direction: column; gap: 12px; }
    .tw { max-height: 420px; overflow: auto; margin-top: 10px; } .ut td small { display: block; font-size: 11px; margin-left: 16px; } .ut td b { font-weight: 500; }
    .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; } .srt { cursor: pointer; user-select: none; } .num { text-align: right; }
    .ut { font-size: 12.5px; } .ut th, .ut td { padding-left: 8px; padding-right: 8px; } .pb { display: grid; grid-template-columns: 60px auto; gap: 8px; align-items: center; } .bar { display: block; height: 7px; border-radius: 6px; background: var(--kb-e8eaf2); overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 6px; }
    .more { margin-top: 8px; }
    .pv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0 14px; } .pv-k { background: var(--kb-f5f3ff); border-radius: 8px; padding: 10px; } .pv-k span { font-size: 11.5px; color: var(--muted); display: block; } .pv-k b { font-size: 20px; }
    .g-drawer h4 { margin: 14px 0 8px; font-size: 13px; } .pv-l { list-style: none; margin: 0; padding: 0; } .pv-l li { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid var(--kl-f2f3f7); }
    .facts { display: grid; grid-template-columns: 90px 1fr; gap: 7px; margin: 14px 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    @media (max-width: 1280px) { .row2 { grid-template-columns: 1fr; } .ins { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class TwinReportsInsights {
  protected readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly periods = Object.keys(PERIODS);
  protected readonly groups: GroupBy[] = ['Floor', 'Zone Type', 'Zone'];
  protected readonly categories = CATEGORIES;
  protected readonly schedules = SCHEDULES;
  protected readonly formats = FORMATS;
  protected readonly days = DAYS;
  protected readonly floorNames = FLOOR_TABS.map((f) => f.name);
  protected readonly weeks = Array.from({ length: 12 }, (_, i) => `W${34 + i}`);
  protected readonly new_ = () => new Set<string>();

  protected readonly period = signal('This Week');
  protected readonly groupBy = signal<GroupBy>('Floor');
  protected readonly desc = signal(true);
  protected readonly showAll = signal(false);
  protected readonly dismissed = signal(new Set<string>());
  protected readonly preview = signal<TReport | null>(null);
  protected readonly form = signal<TReport | null>(null);
  protected readonly isNew = signal(false);
  protected readonly rcpt = signal('');
  private readonly rcptMap = signal<Record<string, string>>({ 'R-01': 'workplace@purpleiq.ae, facilities@purpleiq.ae', 'R-04': 'ehs@purpleiq.ae' });
  protected readonly toast = signal<string | null>(null);

  private readonly pf = computed(() => PERIODS[this.period()].f);
  protected readonly periodLabel = computed(() => PERIODS[this.period()].label);
  private readonly hz = computed(() => heatZones(this.store.zones()).filter((z) => z.status !== 'Closed'));

  /* ---------- aggregation ---------- */
  private agg(zs: TZone[], id: string, name: string, sub: string, color: string): URow {
    const cap = zs.reduce((a, z) => a + z.capacity, 0) || 1;
    const heads = (h: number) => zs.reduce((a, z) => a + zoneUtil(z, h, this.pf()) * z.capacity, 0);
    const byH = WORK_HOURS.map(heads);
    const avgH = byH.reduce((a, b) => a + b, 0) / byH.length;
    const pk = Math.max(...byH);
    return { id, name, sub, capacity: cap, area: zs.reduce((a, z) => a + areaOf(z), 0), heads: Math.round(avgH), avg: Math.round((avgH / cap) * 100), peak: Math.round((pk / cap) * 100), peakAt: HOURS[WORK_HOURS[byH.indexOf(pk)]], color };
  }
  protected readonly allRows = computed<URow[]>(() => {
    const zs = this.hz();
    const g = this.groupBy();
    if (g === 'Floor') return FLOOR_TABS.map((f) => this.agg(zs.filter((z) => z.floor === f.id), f.id, floorById(f.id).name, `${zs.filter((z) => z.floor === f.id).length} zones`, 'var(--ka-7c3aed)'));
    if (g === 'Zone Type') {
      const types = [...new Set(zs.map((z) => z.type))];
      return types.map((t) => {
        const list = zs.filter((z) => z.type === t);
        return this.agg(list, t, tl(t), `${list.length} zones · ${ZONE_GROUP[t]}`, ZONE_COLOR[ZONE_GROUP[t]]);
      });
    }
    return zs.map((z) => this.agg([z], z.id, z.name, `${floorById(z.floor).name} · ${tl(z.type)}`, ZONE_COLOR[ZONE_GROUP[z.type]]));
  });
  private readonly sorted = computed(() => [...this.allRows()].sort((a, b) => (this.desc() ? b.avg - a.avg : a.avg - b.avg)));
  protected readonly tableRows = computed(() => (this.groupBy() === 'Zone' && !this.showAll() ? this.sorted().slice(0, 12) : this.sorted()));
  protected readonly chartRows = computed(() => (this.groupBy() === 'Zone' ? this.sorted().slice(0, 10) : this.allRows()));
  protected readonly avgVals = computed(() => this.chartRows().map((r) => r.avg));
  protected readonly peakVals = computed(() => this.chartRows().map((r) => r.peak));
  protected lab = (r: URow) => (this.groupBy() === 'Floor' ? r.name.replace('Floor ', 'F').replace('Ground Floor', 'G') : r.name.length > 9 ? r.name.slice(0, 8) + '…' : r.name);

  private readonly building = computed(() => this.agg(this.hz(), 'all', 'Building', '', 'var(--ka-7c3aed)'));
  protected readonly avgUtil = computed(() => this.building().avg);
  protected readonly peak = computed(() => {
    let best = { v: 0, at: '' };
    const cap = this.building().capacity;
    DAYS.slice(0, 5).forEach((d, di) =>
      WORK_HOURS.forEach((h) => {
        const v = Math.round((this.hz().reduce((a, z) => a + zoneUtil(z, h, this.pf() * DAY_FACTOR[di]) * z.capacity, 0) / cap) * 100);
        if (v > best.v) best = { v, at: `${d} ${HOURS[h]} · building-wide` };
      }),
    );
    return best;
  });
  private readonly underZones = computed(() => this.hz().filter((z) => z.capacity >= 4 && this.agg([z], z.id, '', '', '').avg < 40));
  protected readonly underCount = computed(() => this.underZones().length);
  protected readonly underArea = computed(() => this.underZones().reduce((a, z) => a + areaOf(z), 0));
  protected readonly savings = computed(() => {
    const v = this.underArea() * AED_PER_M2 * 0.45;
    return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}K`;
  });
  protected readonly ready = computed(() => this.store.reports().filter((r) => r.status === 'Ready').length);
  protected readonly generating = computed(() => this.store.reports().filter((r) => r.status === 'Generating').length);

  protected readonly trend = computed(() => {
    const u = this.avgUtil();
    const pk = this.peak().v;
    return [
      { name: 'Avg utilization', color: 'var(--ka-7c3aed)', values: this.weeks.map((_, i) => Math.round(u - 7 + i * 0.6 + Math.sin(i * 1.7) * 2.4)), area: true },
      { name: 'Peak', color: 'var(--ka-f59e0b)', values: this.weeks.map((_, i) => Math.round(pk - 9 + i * 0.7 + Math.cos(i * 1.3) * 3)) },
      { name: 'Target', color: 'var(--ka-16a34a)', values: this.weeks.map(() => 75), dashed: true },
    ];
  });
  protected readonly floorDay = computed(() =>
    FLOOR_TABS.map((f) => {
      const zs = this.hz().filter((z) => z.floor === f.id);
      const cap = zs.reduce((a, z) => a + z.capacity, 0) || 1;
      return DAYS.map((_, d) => Math.round((WORK_HOURS.reduce((a, h) => a + zs.reduce((b, z) => b + zoneUtil(z, h, this.pf() * DAY_FACTOR[d]) * z.capacity, 0), 0) / WORK_HOURS.length / cap) * 100));
    }),
  );
  protected readonly floorBars = computed(() => FLOOR_TABS.map((f) => this.agg(this.hz().filter((z) => z.floor === f.id), f.id, '', '', '')).map((r, i) => ({ label: FLOOR_TABS[i].name, value: r.avg, display: `${r.avg}%`, color: r.avg < 40 ? 'var(--ka-f59e0b)' : 'var(--ka-7c3aed)' })));

  /* ---------- insights ---------- */
  protected readonly insights = computed<Insight[]>(() => {
    const floors = FLOOR_TABS.map((f) => this.agg(this.hz().filter((z) => z.floor === f.id), f.id, floorById(f.id).name, '', ''));
    const low = [...floors].sort((a, b) => a.avg - b.avg)[0];
    const caf = this.hz().filter((z) => z.type === 'cafeteria').map((z) => ({ z, v: Math.round(zoneUtil(z, 12, this.pf()) * 100) })).sort((a, b) => b.v - a.v)[0];
    const alarms = this.store.sensors().filter((s) => s.status === 'Alarm');
    const offline = this.store.sensors().filter((s) => s.status === 'Offline').length;
    const lowBat = this.store.assets().filter((a) => a.battery !== undefined && a.battery < 25).length;
    const meet = this.hz().filter((z) => z.type === 'meeting');
    const meetAvg = Math.round(meet.reduce((a, z) => a + this.agg([z], '', '', '', '').avg, 0) / (meet.length || 1));
    const open = this.store.activeAlerts().length;
    const lowArea = this.hz().filter((z) => z.floor === low.id).reduce((a, z) => a + areaOf(z), 0);
    const list: Insight[] = [
      { id: 'consolidate', icon: 'twin-building', color: 'var(--ka-f59e0b)', impact: 'Opportunity', title: `Consolidate ${low.name}`, metric: `${low.avg}% avg`, text: `${low.name} averages ${low.avg}% (peak ${low.peak}%). Moving its ${low.heads} daily occupants to other floors frees ${fmtN(lowArea)} m² — about AED ${((lowArea * AED_PER_M2 * 0.4) / 1e6).toFixed(1)}M a year.`, action: 'Simulate', link: '/digital-twin/scenario-simulation' },
      { id: 'lunch', icon: 'users', color: 'var(--ka-ef4444)', impact: 'High', title: `${caf?.z.name ?? 'Cafeteria'} over capacity at lunch`, metric: `${caf?.v ?? 0}% at 12:00`, text: `${floorById(caf?.z.floor ?? '4').name} cafeteria exceeds capacity between 12:00–13:30. Staggering lunch by department in 30-min waves keeps it under 85%.`, action: 'View heatmap', link: '/digital-twin/heatmaps-analytics' },
      { id: 'meeting', icon: 'twin-door', color: 'var(--ka-2563eb)', impact: 'Medium', title: 'Meeting rooms: 31% ghost bookings', metric: `${meetAvg}% used`, text: 'Nearly a third of booked meeting slots have no one present after 10 minutes. Enable auto-release with occupancy sensors.', action: 'Create task' },
      { id: 'temp', icon: 'twin-thermo', color: 'var(--ka-ef4444)', impact: 'High', title: `${alarms.length} sensor${alarms.length === 1 ? '' : 's'} in alarm`, metric: alarms[0] ? `${alarms[0].value}${alarms[0].unit}` : '0', text: `${alarms.map((a) => `${a.name} (${a.zone})`).join(', ') || 'No sensors'} above threshold; ${offline} sensors offline. Server room cooling should be inspected.`, action: 'Open sensors', link: '/digital-twin/sensor-iot-visualization' },
      { id: 'battery', icon: 'battery', color: 'var(--ka-7c3aed)', impact: 'Medium', title: 'Asset tags need charging', metric: `${lowBat} tags`, text: `${lowBat} tracked assets report battery below 25%. Location accuracy drops when tags go silent.`, action: 'View assets', link: '/digital-twin/asset-visualization' },
      { id: 'alerts', icon: 'shield', color: 'var(--ka-0891b2)', impact: open > 3 ? 'High' : 'Medium', title: 'Open spatial alerts', metric: `${open} open`, text: `${open} alerts across the building are not acknowledged yet, ${this.store.newAlerts()} new in the last hour.`, action: 'Open viewer', link: '/digital-twin/2d-3d-facility-viewer' },
    ];
    return list.filter((i) => !this.dismissed().has(i.id));
  });

  /* ---------- report library ---------- */
  protected readonly reportRows = computed(() => this.store.reports().map((r) => ({ ...r })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Report' },
    { key: 'category', label: 'Category', kind: 'tag', tag: () => 'tag blue' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'format', label: 'Format' },
    { key: 'last', label: 'Last generated' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Ready' ? 'tag green' : r.status === 'Generating' ? 'tag amber' : 'tag blue') },
  ];
  protected readonly filters = [
    { key: 'category', label: 'Category', options: CATEGORIES },
    { key: 'status', label: 'Status', options: ['Ready', 'Generating', 'Scheduled'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'download', label: 'Download', icon: 'download', when: (r) => r.status !== 'Generating' },
    { id: 'generate', label: 'Generate now', icon: 'refresh', when: (r) => r.status !== 'Generating' },
    { id: 'email', label: 'Email', icon: 'twin-mail' },
    { id: 'edit', label: 'Edit', icon: 'twin-pencil' },
    { id: 'delete', label: 'Delete', icon: 'twin-trash', danger: true },
  ];

  protected flip() {
    this.desc.set(!this.desc());
  }
  protected dismiss(id: string) {
    this.dismissed.update((s) => new Set(s).add(id));
  }
  protected doInsight(i: Insight) {
    if (i.link) return this.router.navigateByUrl(i.link);
    this.store.log({ icon: 'twin-wrench', color: 'var(--ka-f59e0b)', who: 'Insight action', what: i.title });
    this.dismiss(i.id);
    this.toast$(`Task created: ${i.title}`);
    return undefined;
  }
  protected recipients(r: TReport) {
    return this.rcptMap()[r.id] ?? `${r.owner.toLowerCase().replace(/\s+/g, '.')}@purpleiq.ae`;
  }
  private patch(id: string, ch: Partial<TReport>) {
    this.store.reports.update((l) => l.map((r) => (r.id === id ? { ...r, ...ch } : r)));
    const p = this.preview();
    if (p?.id === id) this.preview.set({ ...p, ...ch });
  }
  protected generate(r: TReport) {
    this.patch(r.id, { status: 'Generating' });
    this.toast$(`Generating ${r.name}…`);
    setTimeout(() => {
      this.patch(r.id, { status: 'Ready', last: today() });
      this.store.log({ icon: 'file-chart', color: 'var(--ka-0ea5e9)', who: r.name, what: `Report generated (${r.format})` });
      this.toast$(`${r.name} is ready`);
    }, 2200);
  }
  protected download(r: TReport) {
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const g = this.groupBy();
    const rows = r.category === 'Assets'
      ? [['Asset', 'Type', 'Floor', 'Zone', 'Status', 'Battery'], ...this.store.assets().map((a) => [a.name, a.type, floorById(a.floor).name, a.zone, a.status, a.battery ?? ''])]
      : r.category === 'Sensors'
        ? [['Sensor', 'Metric', 'Floor', 'Zone', 'Value', 'Unit', 'Status'], ...this.store.sensors().map((s) => [s.name, s.metric, floorById(s.floor).name, s.zone, s.value, s.unit, s.status])]
        : [[g, 'Capacity', 'Area m²', 'Avg people', 'Avg util %', 'Peak %', 'Peak at'], ...this.sorted().map((x) => [x.name, x.capacity, x.area, x.heads, x.avg, x.peak, x.peakAt])];
    downloadCsv(`${slug}.csv`, rows);
    this.toast$(`Downloaded ${r.name} (${rows.length - 1} rows)`);
  }
  protected email(r: TReport) {
    this.toast$(`${r.name} emailed to ${this.recipients(r)}`);
    this.store.log({ icon: 'twin-mail', color: 'var(--ka-2563eb)', who: r.name, what: 'Report emailed' });
  }
  protected newReport() {
    this.isNew.set(true);
    this.rcpt.set('');
    this.form.set({ id: `R-${String(this.store.reports().length + 1).padStart(2, '0')}${Date.now() % 100}`, name: '', category: 'Space', schedule: 'Weekly · Mon 08:00', format: 'PDF', last: '—', owner: 'Rex Kumar', status: 'Scheduled' });
  }
  protected edit(r: TReport) {
    this.isNew.set(false);
    this.rcpt.set(this.recipients(r));
    this.preview.set(null);
    this.form.set({ ...r });
  }
  protected setF<K extends keyof TReport>(k: K, v: TReport[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected saveForm() {
    const f = this.form()!;
    if (!f.name.trim()) return;
    if (this.rcpt().trim()) this.rcptMap.update((m) => ({ ...m, [f.id]: this.rcpt().trim() }));
    if (this.isNew()) {
      this.store.reports.update((l) => [f, ...l]);
      this.form.set(null);
      this.generate(f);
    } else {
      this.store.reports.update((l) => l.map((r) => (r.id === f.id ? f : r)));
      this.form.set(null);
      this.toast$(`${f.name} saved`);
    }
  }
  protected act(a: string, r: TReport) {
    if (a === 'download') return this.download(r);
    if (a === 'generate') return this.generate(r);
    if (a === 'email') return this.email(r);
    if (a === 'edit') return this.edit(r);
    this.store.reports.update((l) => l.filter((x) => x.id !== r.id));
    this.toast$(`Deleted ${r.name}`);
  }
  protected exportUtil() {
    downloadCsv(`space-utilization-${this.groupBy().toLowerCase().replace(' ', '-')}.csv`, [[this.groupBy(), 'Detail', 'Capacity', 'Area m²', 'Avg people', 'Avg util %', 'Peak %', 'Peak at'], ...this.sorted().map((x) => [x.name, x.sub, x.capacity, x.area, x.heads, x.avg, x.peak, x.peakAt])]);
    this.toast$(`Exported ${this.sorted().length} rows (${this.periodLabel()})`);
  }
  protected toast$(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
}
