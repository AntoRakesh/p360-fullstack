import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Series, UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { A_CSS, AFilters } from './a-filters';
import { AMember, AnalyticsStore, AZone, fmtMin, fmtN, HOURS, HOURS_FULL, MEMBERS, PEAK_TODAY, TREND_DAYS, ZoneType } from './analytics.data';
import { FfBars, FfLine, MallMap, Track, zoneBlobs } from './analytics-ui';
import { ZoneDrawer } from './zone-drawer';

const BASE = '/customer-visitor-analytics/';
const center = (z: { x: number; y: number; w: number; h: number }): [number, number] => [Math.round(z.x + z.w / 2), Math.round(z.y + z.h / 2)];
function toaster() {
  const toast = signal<string | null>(null);
  return { toast, show: (m: string) => { toast.set(m); setTimeout(() => toast.set(null), 2600); } };
}

/* =========================================================
   Dwell Time & Movement
   ========================================================= */
const PATHS = [
  { id: 'P1', route: ['Z1', 'Z3', 'Z2'], share: 24, avg: 96, color: 'var(--ka-7c3aed)' },
  { id: 'P2', route: ['Z4', 'Z1', 'Z7'], share: 17, avg: 152, color: 'var(--ka-3b82f6)' },
  { id: 'P3', route: ['Z1', 'Z2', 'Z8'], share: 13, avg: 88, color: 'var(--ka-f97316)' },
  { id: 'P4', route: ['Z1', 'Z6', 'Z3', 'Z5'], share: 11, avg: 74, color: 'var(--ka-ec4899)' },
  { id: 'P5', route: ['Z4', 'Z2', 'Z5'], share: 9, avg: 61, color: 'var(--ka-22c55e)' },
  { id: 'P6', route: ['Z1', 'Z3', 'Z1'], share: 8, avg: 34, color: 'var(--ka-eab308)' },
];
const VTYPES = ['All Visitors', 'Customers', 'Staff', 'Visitors'] as const;
const VT_MUL: Record<string, number> = { 'All Visitors': 1, Customers: 1.12, Staff: 2.9, Visitors: 0.82 };

@Component({
  selector: 'app-dwell-time-movement',
  imports: [...UI, AFilters, FfLine, FfBars, MallMap, ZoneDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Dwell Time & Movement" [parent]="parent" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="How long visitors stay, where they go next and which journeys drive the longest visits.">
      <app-a-filters />
      <button class="btn-primary hb" (click)="exportCsv()"><app-icon name="a-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Avg. Dwell Time" [value]="m(avg())" icon="clock" color="var(--ka-f59e0b)" change="18%" sub="vs. last week" />
      <app-kpi label="Median Dwell Time" [value]="m(avg() * 0.69)" icon="a-timer" color="var(--ka-7c3aed)" change="7%" sub="vs. last week" />
      <app-kpi label="Long Stays (> 2h)" [value]="n(1126 * s.fr())" icon="users" color="var(--ka-3b82f6)" change="11%" sub="vs. last week" />
      <app-kpi label="Quick Visits (< 5 min)" value="9.8%" icon="a-log-out" color="var(--ka-ef4444)" change="1.4%" [up]="false" sub="vs. last week" />
      <app-kpi label="Avg. Zones per Visit" value="3.4" icon="map-floor" color="var(--ka-22c55e)" change="0.3" sub="vs. last week" />
    </section>

    <div class="note"><app-icon name="lightbulb" [size]="16" /><span>Visitors who pass through <b>Food Court</b> stay <b>38 min longer</b> on average. Path <b>Main Entrance → Retail Zone → Food Court</b> is the most common journey ({{ paths[0].share }}%).</span><span class="sp"></span>
      <div class="seg">@for (v of vtypes; track v) {<button [class.on]="vt() === v" (click)="vt.set(v)">{{ v }}</button>}</div></div>

    <section class="row c2 eq">
      <div class="card">
        <div class="ch"><h3>Dwell Time Distribution</h3><span class="muted">{{ vt() }} · share of visits</span></div>
        <div class="chart-legend"><span><i style="background:var(--kb-7c3aed)"></i>This week</span><span><i style="background:var(--kb-c4b5fd)"></i>Last week</span></div>
        <app-ff-bars [labels]="buckets" [series]="dist()" [height]="236" [max]="24" [values]="false" yLabel="% of visits" />
      </div>
      <div class="card">
        <div class="ch"><h3>Avg. Dwell by Zone</h3><span class="muted">click a zone for details</span></div>
        <ul class="list dz">
          @for (z of byZone(); track z.id) {
            <li class="click" (click)="zoneId.set(z.id)"><span class="sw" [style.background]="z.color"></span><span>{{ z.name }}</span>
              <div class="bar"><i [style.width.%]="(z.dw / maxDw()) * 100" [style.background]="z.color"></i></div><b>{{ m(z.dw) }}</b></li>
          }
        </ul>
      </div>
    </section>

    <section class="row c32 eq">
      <div class="card">
        <div class="ch"><h3>Movement Paths</h3>
          <div class="ch-r"><button class="link" (click)="selPath.set(null)">Show all</button><button class="link" (click)="go('heatmaps-trajectories')">Open trajectories</button></div></div>
        <app-mall-map class="map" [zones]="mapZones()" [tracks]="tracks()" [selTrack]="selPath()" [showHeat]="false" [showZones]="true" [labelSize]="19" (zoneClick)="zoneId.set($event)" />
      </div>
      <div class="card">
        <div class="ch"><h3>Top Journeys</h3><span class="muted">{{ n(s.total() / 2) }} visits analysed</span></div>
        <ul class="list pl">
          @for (p of paths; track p.id) {
            <li class="click" [class.on]="selPath() === p.id" (click)="selPath.set(selPath() === p.id ? null : p.id)">
              <span class="sw" [style.background]="p.color"></span>
              <div class="col"><b>{{ routeName(p.route) }}</b><small>avg. {{ m(p.avg * VT_MUL[vt()]) }} · {{ n((s.total() / 2) * p.share / 100) }} visits</small></div>
              <b>{{ p.share }}%</b>
            </li>
          }
        </ul>
      </div>
    </section>

    <section class="row c2 eq">
      <div class="card">
        <div class="ch"><h3>Zone Transitions</h3><span class="muted">% of visitors moving from row → column</span></div>
        <app-heatmap [rows]="tNames" [cols]="tNames" [data]="matrix" suffix="%" />
      </div>
      <div class="card">
        <div class="ch"><h3>Avg. Dwell by Hour of Arrival</h3></div>
        <app-ff-line [labels]="hours" [tipLabels]="hoursFull" [series]="byHour()" [height]="250" [every]="3" yLabel="Minutes" />
      </div>
    </section>
    @if (zoneId(); as id) {<app-zone-drawer [zoneId]="id" (closed)="zoneId.set(null)" />}
  `,
  styles: [A_CSS, `
    .dz li { grid-template-columns: 10px 120px 1fr 64px; } .dz b { text-align: right; }
    .pl li { grid-template-columns: 10px 1fr auto; } .map { height: 262px; }
  `],
})
export class DwellTime {
  protected readonly s = inject(AnalyticsStore);
  private readonly router = inject(Router);
  protected readonly parent = 'Customer & Visitor Analytics';
  protected readonly n = fmtN;
  protected readonly m = fmtMin;
  protected readonly VT_MUL = VT_MUL;
  protected readonly vtypes = VTYPES;
  protected readonly hours = HOURS;
  protected readonly hoursFull = HOURS_FULL;
  protected readonly paths = PATHS;
  protected readonly vt = signal<string>('All Visitors');
  protected readonly selPath = signal<string | null>(null);
  protected readonly zoneId = signal<string | null>(null);
  protected readonly buckets = ['< 5m', '5–15m', '15–30m', '30–60m', '1–2h', '2–3h', '> 3h'];
  protected readonly avg = computed(() => this.s.avgDwell() * VT_MUL[this.vt()]);
  protected readonly dist = computed<Series[]>(() => {
    const k = VT_MUL[this.vt()];
    const base = [9.8, 12.4, 16.2, 21.5, 22.1, 11.6, 6.4];
    const shifted = base.map((v, i) => +(v * (i < 3 ? 1 / k : k)).toFixed(1));
    const t = shifted.reduce((a, b) => a + b, 0);
    return [
      { name: 'This week', color: 'var(--ka-7c3aed)', values: shifted.map((v) => +((v / t) * 100).toFixed(1)) },
      { name: 'Last week', color: 'var(--ka-c4b5fd)', values: [11.6, 13.8, 17.1, 21.0, 20.2, 10.4, 5.9] },
    ];
  });
  protected readonly byZone = computed(() => [...this.s.zonesNow()].map((z) => ({ ...z, dw: z.dwell * VT_MUL[this.vt()] })).sort((a, b) => b.dw - a.dw));
  protected readonly maxDw = computed(() => Math.max(...this.byZone().map((z) => z.dw)));
  protected readonly mapZones = computed(() => this.s.zonesNow().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: 'var(--ka-94a3b8)', pct: z.pct })));
  protected readonly tracks = computed<Track[]>(() => {
    const zs = this.s.zones();
    return PATHS.map((p, k) => {
      const off = (k - 2.5) * 7;
      const pts: [number, number][] = [];
      p.route.forEach((id, i) => {
        const c = center(zs.find((z) => z.id === id)!);
        const x = c[0] + off;
        if (i) pts.push([x, 184 + off * 0.6]);
        pts.push([x, c[1] + off * 0.5]);
        if (i < p.route.length - 1) pts.push([x, 184 + off * 0.6]);
      });
      return { id: p.id, color: p.color, points: pts };
    });
  });
  protected readonly tNames = this.s.zones().slice(0, 7).map((z) => z.name.replace('Parking ', 'Park. '));
  protected readonly matrix = [
    [0, 38, 31, 2, 9, 12, 8], [18, 0, 22, 4, 21, 6, 29], [21, 34, 0, 3, 14, 11, 17], [52, 21, 8, 0, 2, 4, 13],
    [6, 3, 2, 0, 0, 1, 1], [24, 26, 28, 3, 9, 0, 10], [12, 42, 9, 2, 26, 5, 0],
  ];
  protected readonly byHour = computed<Series[]>(() => {
    const k = VT_MUL[this.vt()];
    const base = [62, 70, 76, 82, 88, 96, 104, 98, 92, 90, 94, 102, 110, 96, 78, 54];
    return [
      { name: 'Avg. dwell (min)', color: 'var(--ka-f59e0b)', values: base.map((v) => Math.round(v * k)), area: true },
      { name: 'Last week', color: 'var(--ka-94a3b8)', values: base.map((v, i) => Math.round(v * k * (0.86 + (i % 3) * 0.03))) },
    ];
  });
  protected routeName(r: string[]) {
    return r.map((id) => this.s.zones().find((z) => z.id === id)?.name).join(' → ');
  }
  protected go(p: string) {
    this.router.navigateByUrl(BASE + p);
  }
  protected exportCsv() {
    downloadCsv('dwell-time-by-zone.csv', [['Zone', 'Avg dwell (min)', 'Entries', 'Exits'], ...this.byZone().map((z) => [z.name, Math.round(z.dw), z.entries, z.exits]), [], ['Journey', 'Share %', 'Avg duration (min)'], ...PATHS.map((p) => [this.routeName(p.route), p.share, p.avg])]);
    this.s.logRun('Dwell Time & Movement', 'CSV');
  }
}

/* =========================================================
   Zone & Area Analytics
   ========================================================= */
const ZTYPES: ZoneType[] = ['Entrance', 'Retail', 'Dining', 'Parking', 'Leisure', 'Event'];
const ZCOLORS = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-f97316)', 'var(--ka-22c55e)', 'var(--ka-ec4899)', 'var(--ka-14b8a6)', 'var(--ka-eab308)', 'var(--ka-ef4444)'];
interface ZForm { name: string; type: ZoneType; floor: string; capacity: number; threshold: number; }

@Component({
  selector: 'app-zone-area-analytics',
  imports: [...UI, AFilters, DataTable, MallMap, ZoneDrawer, FfBars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Zone & Area Analytics" [parent]="parent" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="Live occupancy, capacity utilisation and performance for every zone and area.">
      <app-a-filters />
      <button class="btn-primary hb" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Zone</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="a-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Monitored Zones" [value]="s.zones().length" icon="map-floor" color="var(--ka-7c3aed)" sub="across 4 floors" />
      <app-kpi label="Current Occupancy" [value]="n(s.occupancy())" icon="a-occupancy" color="var(--ka-2563eb)" [sub]="s.occPct() + '% of ' + n(s.capacity()) + ' capacity'" />
      <app-kpi label="Busiest Zone" [value]="busiest().name" icon="flame" color="var(--ka-f97316)" [sub]="busiest().pct + '% of capacity'" subColor="var(--ka-ea580c)" />
      <app-kpi label="Over Threshold" [value]="over()" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="over() ? 'action needed' : 'all zones normal'" [subColor]="over() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Avg. Conversion" [value]="avgConv() + '%'" icon="a-target" color="var(--ka-22c55e)" change="2.1%" sub="vs. last week" />
    </section>

    <section class="row c32 eq">
      <div class="card">
        <div class="ch"><h3>Live Zone Map</h3>
          <div class="seg"><button [class.on]="layer() === 'occ'" (click)="layer.set('occ')">Occupancy</button><button [class.on]="layer() === 'heat'" (click)="layer.set('heat')">Heat</button></div></div>
        <app-mall-map class="map" [zones]="mapZones()" [blobs]="layer() === 'heat' ? blobs() : []" [showHeat]="layer() === 'heat'" [showZones]="layer() === 'occ'" [selected]="selId()" [labelSize]="20" (zoneClick)="selId.set($event)" />
        <div class="legend"><span><i style="background:var(--kb-22c55e)"></i>Normal</span><span><i style="background:var(--kb-f59e0b)"></i>Busy</span><span><i style="background:var(--kb-ef4444)"></i>Over threshold</span><span class="muted">Click a zone to inspect</span></div>
      </div>
      <div class="card">
        <div class="ch"><h3>Capacity Utilisation</h3><span class="muted">live · updates every few seconds</span></div>
        <ul class="list zl">
          @for (z of s.zonesNow(); track z.id) {
            <li class="click" [class.on]="selId() === z.id" (click)="selId.set(z.id)">
              <span class="sw" [style.background]="z.color"></span>
              <div class="col"><b>{{ z.name }}</b><small>{{ z.occ }} / {{ z.cap }} people · {{ z.floor }}</small></div>
              <div class="bar"><i [style.width.%]="z.pct" [style.background]="statusColor(z.status)"></i></div>
              <b [style.color]="statusColor(z.status)">{{ z.pct }}%</b>
            </li>
          }
        </ul>
      </div>
    </section>

    @if (sel(); as z) {
      <section class="card sel">
        <div class="ch"><h3><span class="sw" [style.background]="z.color"></span> {{ z.name }} <span [class]="tagCls(z.status)">{{ z.status }}</span></h3>
          <div class="ch-r"><button class="btn-ghost" (click)="drawerId.set(z.id)">Details & settings</button><button class="close-btn" (click)="selId.set(null)">×</button></div></div>
        <div class="facts">
          <div><small>Entries</small><b>{{ n(z.entries) }}</b></div><div><small>Exits</small><b>{{ n(z.exits) }}</b></div><div><small>Occupancy</small><b>{{ z.occ }}/{{ z.cap }}</b></div>
          <div><small>Avg. dwell</small><b>{{ m(z.dwell) }}</b></div><div><small>Conversion</small><b>{{ z.conv ? z.conv + '%' : 'n/a' }}</b></div><div><small>Threshold</small><b>{{ z.threshold }}%</b></div><div><small>Camera</small><b>{{ z.camera }}</b></div>
        </div>
      </section>
    }

    <section class="row zc eq">
      <div class="card">
        <div class="ch"><h3>Entries vs Exits by Zone</h3></div>
        <app-ff-bars [labels]="shortNames()" [series]="ioSeries()" [height]="260" [values]="false" (pick)="selId.set(s.zones()[$event].id)" />
      </div>
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'type', 'floor']" searchPlaceholder="Search zones..." noun="zones" [activeId]="selId()" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" />
      </div>
    </section>

    @if (drawerId(); as id) {<app-zone-drawer [zoneId]="id" (closed)="drawerId.set(null)" />}
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Add Zone</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Zone name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Type<select class="select" [value]="f.type" (change)="setF('type', $any($event.target).value)">@for (t of ztypes; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Floor<select class="select" [value]="f.floor" (change)="setF('floor', $any($event.target).value)"><option>Basement</option><option>Ground</option><option>Level 1</option><option>Level 2</option></select></label>
          <label>Capacity *<input class="input" type="number" min="1" [value]="f.capacity" (input)="setF('capacity', +$any($event.target).value)" /></label>
          <label>Alert threshold %<input class="input" type="number" min="10" max="100" [value]="f.threshold" (input)="setF('threshold', +$any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Create zone</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .zc { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); } .map { height: 252px; } .legend { display: flex; gap: 16px; font-size: 12px; margin-top: 8px; align-items: center; } .legend span { display: inline-flex; align-items: center; gap: 6px; } .legend i { width: 10px; height: 10px; border-radius: 3px; }
    .zl li { grid-template-columns: 10px minmax(0, 1fr) 90px 40px; padding: 7px 4px; } .zl b:last-child { text-align: right; }
    .sel { margin-bottom: 12px; } .sel h3 { display: flex; align-items: center; gap: 8px; }
    .facts { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; } .facts div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; } .facts small { color: var(--muted); font-size: 11px; } .facts b { display: block; font-size: 16px; }
  `],
})
export class ZoneAnalytics {
  protected readonly s = inject(AnalyticsStore);
  protected readonly parent = 'Customer & Visitor Analytics';
  protected readonly n = fmtN;
  protected readonly m = fmtMin;
  protected readonly ztypes = ZTYPES;
  protected readonly t = toaster();
  protected readonly layer = signal<'occ' | 'heat'>('occ');
  protected readonly selId = signal<string | null>(null);
  protected readonly drawerId = signal<string | null>(null);
  protected readonly busiest = computed(() => this.s.zonesNow().reduce((a, b) => (b.pct > a.pct ? b : a)));
  protected readonly over = computed(() => this.s.zonesNow().filter((z) => z.status === 'Over Threshold').length);
  protected readonly avgConv = computed(() => { const c = this.s.zones().filter((z) => z.conv); return (c.reduce((a, z) => a + z.conv, 0) / c.length).toFixed(1); });
  protected readonly sel = computed(() => this.s.zonesNow().find((z) => z.id === this.selId()) ?? null);
  protected readonly mapZones = computed(() => this.s.zonesNow().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: this.statusColor(z.status), pct: z.pct })));
  protected readonly blobs = computed(() => zoneBlobs(this.s.zonesNow(), this.s.tick() % 2));
  protected readonly shortNames = computed(() => this.s.zones().map((z) => ({ 'Main Entrance': 'Entrance', 'Food Court': 'Food Ct', 'Retail Zone': 'Retail', 'Parking Entry': 'Pk In', 'Parking Exit': 'Pk Out', 'Event Area': 'Event', 'Kids Zone': 'Kids' } as Record<string, string>)[z.name] ?? z.name.slice(0, 8)));
  protected readonly ioSeries = computed<Series[]>(() => [
    { name: 'Entries', color: 'var(--ka-7c3aed)', values: this.s.zonesNow().map((z) => z.entries) },
    { name: 'Exits', color: 'var(--ka-3b82f6)', values: this.s.zonesNow().map((z) => z.exits) },
  ]);
  protected readonly rows = computed(() => this.s.zonesNow().map((z) => ({ ...z, occText: `${z.occ} / ${z.cap}`, dwellText: fmtMin(z.dwell) })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Zone', sub: 'floor' },
    { key: 'type', label: 'Type' },
    { key: 'occText', label: 'Occupancy' },
    { key: 'pct', label: 'Utilisation', kind: 'progress' },
    { key: 'dwellText', label: 'Avg Dwell' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => this.tagCls(r.status) },
  ];
  protected readonly filters = [
    { key: 'type', label: 'Type', options: ZTYPES },
    { key: 'status', label: 'Status', options: ['Normal', 'Busy', 'Over Threshold'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'Details & settings', icon: 'sliders' },
    { id: 'map', label: 'Show on map', icon: 'map-pin' },
    { id: 'cam', label: 'Open camera devices', icon: 'a-camera' },
    { id: 'delete', label: 'Remove zone', icon: 'a-trash', danger: true },
  ];
  private readonly router = inject(Router);
  protected statusColor(s: string) {
    return s === 'Normal' ? 'var(--ka-22c55e)' : s === 'Busy' ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)';
  }
  protected tagCls(s: string) {
    return s === 'Normal' ? 'tag green' : s === 'Busy' ? 'tag amber' : 'tag red';
  }
  protected act(a: string, z: AZone) {
    if (a === 'view') return this.drawerId.set(z.id);
    if (a === 'map') return this.selId.set(z.id);
    if (a === 'cam') return this.router.navigateByUrl(BASE + 'device-management');
    this.s.zones.update((l) => l.filter((x) => x.id !== z.id));
    this.t.show(`${z.name} removed from monitoring`);
  }
  protected readonly form = signal<ZForm | null>(null);
  protected readonly err = signal('');
  protected openForm() {
    this.err.set('');
    this.form.set({ name: '', type: 'Retail', floor: 'Ground', capacity: 60, threshold: 85 });
  }
  protected setF<K extends keyof ZForm>(k: K, v: ZForm[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim() || f.capacity < 1) return this.err.set('Name and a positive capacity are required.');
    const n = this.s.zones().length;
    const z: AZone = { id: `Z${Date.now()}`, name: f.name.trim(), type: f.type, floor: f.floor, capacity: f.capacity, threshold: f.threshold, entries: 0, exits: 0, occ: 0, dwell: 0, conv: 0,
      color: ZCOLORS[n % ZCOLORS.length], x: 260 + (n % 4) * 120, y: 176, w: 100, h: 16, trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], camera: 'Unassigned' };
    this.s.zones.update((l) => [...l, z]);
    this.form.set(null);
    this.t.show(`${z.name} created · assign a counting device in Device Management`);
  }
  protected exportCsv() {
    downloadCsv('zones.csv', [['Zone', 'Type', 'Floor', 'Occupancy', 'Capacity', 'Utilisation %', 'Entries', 'Exits', 'Avg dwell (min)', 'Conversion %', 'Status'], ...this.s.zonesNow().map((z) => [z.name, z.type, z.floor, z.occ, z.cap, z.pct, z.entries, z.exits, z.dwell, z.conv, z.status])]);
    this.s.logRun('Zone & Area Analytics', 'CSV');
  }
}

/* =========================================================
   Demographics (AI)
   ========================================================= */
const AGES = ['< 18', '18–24', '25–34', '35–44', '45–54', '55+'];
const AGE_F = [7.2, 9.6, 17.8, 10.4, 4.6, 2.4];
const AGE_M = [6.8, 8.9, 16.1, 9.7, 4.3, 2.2];
const GROUPS = [{ label: 'Solo', value: 38 }, { label: 'Couples', value: 27 }, { label: 'Families', value: 24 }, { label: 'Groups (3+)', value: 11 }];

@Component({
  selector: 'app-demographics-ai',
  imports: [...UI, AFilters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Demographics (AI)" [parent]="parent" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="Anonymous, edge-processed age, gender and group estimates — no faces or identities are stored.">
      <app-a-filters />
      <label class="hsel"><select [value]="zone()" (change)="zone.set($any($event.target).value)"><option value="All">All Zones</option>@for (z of s.zones(); track z.id) {<option [value]="z.name">{{ z.name }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
      <button class="btn-ghost hb" (click)="privacyOpen.set(true)"><app-icon name="shield-check" [size]="16" />Privacy settings</button>
    </app-page-head>

    <div class="note"><app-icon name="shield-check" [size]="16" /><span>Privacy mode <b>{{ blur() ? 'ON' : 'OFF' }}</b> · faces blurred at the edge, only aggregated attributes leave the camera · retention {{ retention() }} days · GDPR / PDPL compliant.</span><span class="sp"></span><button class="toggle" [class.on]="blur()" (click)="toggleBlur()"></button></div>

    <section class="kpi-row">
      <app-kpi label="Profiles Analysed" [value]="n(profiles())" icon="a-scan" color="var(--ka-7c3aed)" change="14%" sub="vs. last week" />
      <app-kpi label="Female" [value]="female() + '%'" icon="user" color="var(--ka-ec4899)" sub="of analysed visitors" />
      <app-kpi label="Male" [value]="(100 - female()) + '%'" icon="user" color="var(--ka-3b82f6)" sub="of analysed visitors" />
      <app-kpi label="Avg. Estimated Age" [value]="avgAge()" icon="calendar-days" color="var(--ka-f59e0b)" change="0.6 yrs" [up]="false" sub="vs. last week" />
      <app-kpi label="Dominant Group" value="25–34" icon="users" color="var(--ka-22c55e)" sub="33.9% of visitors" />
    </section>

    <section class="row c3 eq">
      <div class="card"><div class="ch"><h3>Gender Split</h3><span class="muted">{{ zone() === 'All' ? 'All zones' : zone() }}</span></div>
        <app-donut [segments]="gender()" center="Profiles" [size]="150" /></div>
      <div class="card"><div class="ch"><h3>Age Groups</h3></div>
        <app-column-chart [labels]="ages" [series]="ageSeries()" [stacked]="true" [height]="210" suffix="%" /></div>
      <div class="card"><div class="ch"><h3>Visit Group Type</h3></div>
        <app-bar-list [rows]="groupRows()" [max]="40" />
        <p class="muted gp">Families stay <b>1h 52m</b> on average — 34% longer than solo visitors.</p></div>
    </section>

    <section class="row c21 eq">
      <div class="card"><div class="ch"><h3>Age Group by Hour</h3><span class="muted">% of visitors present</span></div>
        <app-heatmap [rows]="ages" [cols]="hm.cols" [data]="hm.data" /></div>
      <div class="card"><div class="ch"><h3>Live Detections</h3><span class="chip live"><i></i>Live</span></div>
        <ul class="list feed">
          @for (d of feed(); track d.id) {
            <li><span class="ic" [style.background]="d.g === 'F' ? 'var(--ka-fce7f3)' : 'var(--ka-dbeafe)'" [style.color]="d.g === 'F' ? 'var(--ka-db2777)' : 'var(--ka-2563eb)'"><app-icon name="user" [size]="16" /></span>
              <div class="col"><b>{{ d.g === 'F' ? 'Female' : 'Male' }} · {{ d.age }}</b><small>{{ d.zone }} · {{ d.group }} · #{{ d.id }}</small></div>
              <span class="muted">{{ d.conf }}%</span></li>
          }
        </ul></div>
    </section>

    <section class="card">
      <div class="ch"><h3>Demographics by Zone</h3><button class="link" (click)="exportCsv()">Export CSV</button></div>
      <table class="table">
        <thead><tr><th>Zone</th><th class="num">Profiles</th><th class="num">Female</th><th class="num">Male</th><th>Dominant age</th><th class="num">Families</th><th>Gender mix</th></tr></thead>
        <tbody>
          @for (r of byZone(); track r.name) {
            <tr class="clickable" [class.selected]="zone() === r.name" (click)="zone.set(zone() === r.name ? 'All' : r.name)"><td>{{ r.name }}</td><td class="num">{{ n(r.profiles) }}</td><td class="num">{{ r.f }}%</td><td class="num">{{ 100 - r.f }}%</td><td>{{ r.age }}</td><td class="num">{{ r.fam }}%</td>
              <td><div class="mix"><i [style.width.%]="r.f" style="background:var(--kb-ec4899)"></i><i [style.width.%]="100 - r.f" style="background:var(--kb-3b82f6)"></i></div></td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (privacyOpen()) {
      <div class="g-overlay" (click)="privacyOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Privacy & AI Settings</h3><button class="close-btn" (click)="privacyOpen.set(false)">×</button></div>
        <ul class="list pv">
          <li><div class="col"><b>Blur faces at the edge</b><small>Raw frames never leave the camera</small></div><button class="toggle" [class.on]="blur()" (click)="blur.set(!blur())"></button></li>
          <li><div class="col"><b>Estimate age & gender</b><small>Aggregated only, no identity</small></div><button class="toggle" [class.on]="attrs()" (click)="attrs.set(!attrs())"></button></li>
          <li><div class="col"><b>Exclude staff from analytics</b><small>Uses badge / uniform detection</small></div><button class="toggle" [class.on]="exclStaff()" (click)="exclStaff.set(!exclStaff())"></button></li>
          <li><div class="col"><b>Data retention</b><small>Aggregated statistics</small></div><select class="select" [value]="retention()" (change)="retention.set(+$any($event.target).value)"><option [value]="30">30 days</option><option [value]="90">90 days</option><option [value]="365">365 days</option></select></li>
        </ul>
        <div class="form-actions"><button class="btn-primary" (click)="privacyOpen.set(false); t.show('Privacy settings saved and pushed to 8 AI cameras')">Save</button></div>
      </div>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .gp { margin: 12px 0 0; } .feed li { grid-template-columns: 34px 1fr auto; padding: 7px 4px; } .feed { max-height: 252px; overflow: auto; }
    .mix { display: flex; width: 140px; height: 7px; border-radius: 4px; overflow: hidden; } .mix i { display: block; height: 100%; }
    .pv li { grid-template-columns: 1fr auto; }
  `],
})
export class Demographics {
  protected readonly s = inject(AnalyticsStore);
  protected readonly parent = 'Customer & Visitor Analytics';
  protected readonly n = fmtN;
  protected readonly ages = AGES;
  protected readonly t = toaster();
  protected readonly zone = signal('All');
  protected readonly blur = signal(true);
  protected readonly attrs = signal(true);
  protected readonly exclStaff = signal(true);
  protected readonly retention = signal(90);
  protected readonly privacyOpen = signal(false);
  private readonly zf = computed(() => {
    const z = this.s.zones().find((x) => x.name === this.zone());
    return z ? { share: (z.entries + z.exits) / 12482, bias: (z.id.charCodeAt(1) % 7) - 3 } : { share: 1, bias: 0 };
  });
  protected readonly profiles = computed(() => Math.round(9842 * this.s.fr() * this.zf().share));
  protected readonly female = computed(() => 52 + this.zf().bias);
  protected readonly avgAge = computed(() => (31.4 + this.zf().bias * 0.8).toFixed(1));
  protected readonly gender = computed(() => [
    { label: 'Female', value: Math.round((this.profiles() * this.female()) / 100), color: 'var(--ka-ec4899)' },
    { label: 'Male', value: Math.round((this.profiles() * (100 - this.female())) / 100), color: 'var(--ka-3b82f6)' },
  ]);
  protected readonly ageSeries = computed<Series[]>(() => {
    const b = this.zf().bias;
    return [
      { name: 'Female', color: 'var(--ka-ec4899)', values: AGE_F.map((v, i) => +(v * (1 + (i === 2 ? b * 0.04 : -b * 0.01))).toFixed(1)) },
      { name: 'Male', color: 'var(--ka-3b82f6)', values: AGE_M.map((v, i) => +(v * (1 + (i === 3 ? b * 0.03 : 0))).toFixed(1)) },
    ];
  });
  protected readonly groupRows = computed(() => GROUPS.map((g, i) => ({ label: g.label, value: g.value + (i === 2 ? this.zf().bias : 0), display: `${g.value + (i === 2 ? this.zf().bias : 0)}%`, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)'][i] })));
  protected readonly hm = {
    cols: ['8a', '10a', '12p', '2p', '4p', '6p', '8p'],
    data: [[8, 12, 22, 31, 38, 26, 12], [14, 18, 36, 44, 52, 61, 48], [22, 41, 68, 72, 64, 70, 58], [18, 34, 52, 48, 42, 46, 30], [12, 26, 30, 26, 22, 18, 10], [9, 22, 18, 14, 12, 8, 4]],
  };
  protected readonly byZone = computed(() => this.s.zonesNow().map((z, i) => ({ name: z.name, profiles: Math.round((z.entries + z.exits) * 0.79), f: 52 + ((z.id.charCodeAt(1) % 7) - 3), age: AGES[[2, 2, 2, 3, 3, 1, 1, 0][i % 8]], fam: [18, 31, 22, 26, 24, 34, 28, 61][i % 8] })));
  protected readonly feed = computed(() => {
    const t = this.s.tick();
    const zones = this.s.zones();
    return Array.from({ length: 8 }, (_, k) => {
      const i = t + 8 - k;
      return { id: ((i * 7919) % 99991).toString(16).toUpperCase().padStart(5, '0'), g: i % 3 === 0 ? 'M' : (i * 7) % 5 > 1 ? 'F' : 'M', age: AGES[(i * 3) % 6], zone: zones[(i * 5) % zones.length].name, group: GROUPS[i % 4].label, conf: 88 + ((i * 13) % 11) };
    });
  });
  protected toggleBlur() {
    this.blur.set(!this.blur());
    this.t.show(this.blur() ? 'Privacy mode enabled on all AI cameras' : 'Privacy mode disabled — audit log entry created');
  }
  protected exportCsv() {
    downloadCsv('demographics-by-zone.csv', [['Zone', 'Profiles', 'Female %', 'Male %', 'Dominant age', 'Families %'], ...this.byZone().map((r) => [r.name, r.profiles, r.f, 100 - r.f, r.age, r.fam])]);
    this.s.logRun('Demographics by Zone', 'CSV');
  }
}

/* =========================================================
   Repeat vs New Visitors
   ========================================================= */
const NEW_D = [362, 548, 571, 552, 1012, 760, 541];
const REP_D = [256, 392, 401, 397, 761, 551, 381];

@Component({
  selector: 'app-repeat-vs-new-visitors',
  imports: [...UI, AFilters, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Repeat vs New Visitors" [parent]="parent" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="Visitor loyalty, frequency and retention from Wi-Fi, loyalty app and anonymous re-identification.">
      <app-a-filters />
      <button class="btn-primary hb" (click)="openCampaign([])"><app-icon name="megaphone" [size]="16" />Create Campaign</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="New Visitors" [value]="n(newV())" icon="user-plus" color="var(--ka-7c3aed)" change="6%" sub="vs. last week" />
      <app-kpi label="Repeat Visitors" [value]="n(repV())" icon="a-repeat" color="var(--ka-3b82f6)" [extra]="repPct() + '%'" change="9%" sub="vs. last week" />
      <app-kpi label="Avg. Visit Frequency" value="3.2 / mo" icon="calendar-days" color="var(--ka-22c55e)" change="0.4" sub="vs. last month" />
      <app-kpi label="Loyalty Members Seen" [value]="n(2860 * s.fr())" icon="star" color="var(--ka-f59e0b)" change="12%" sub="vs. last week" />
      <app-kpi label="At-Risk Members" [value]="atRisk()" icon="a-trending-down" color="var(--ka-ef4444)" sub="no visit in 30+ days" subColor="var(--ka-dc2626)" />
    </section>

    <section class="row c3 eq">
      <div class="card"><div class="ch"><h3>New vs Repeat</h3><span class="muted">daily</span></div>
        <app-column-chart [labels]="days" [series]="daily()" [stacked]="true" [height]="220" /></div>
      <div class="card"><div class="ch"><h3>Visit Frequency</h3><span class="muted">visits in last 30 days</span></div>
        <app-bar-list [rows]="freq()" [max]="45" /></div>
      <div class="card"><div class="ch"><h3>Return Rate Cohorts</h3><span class="muted">% returning by week</span></div>
        <app-heatmap [rows]="cohorts.rows" [cols]="cohorts.cols" [data]="cohorts.data" /></div>
    </section>

    <section class="card">
      <app-data-table [rows]="members()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['name', 'id', 'fav']" searchPlaceholder="Search loyalty members..." noun="members"
        [activeId]="selId()" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="openCampaign($event.ids)">
        <div class="seg">@for (sg of segs; track sg) {<button [class.on]="seg() === sg" (click)="seg.set(sg)">{{ sg }}</button>}</div>
      </app-data-table>
    </section>

    @if (sel(); as m) {
      <div class="g-overlay" (click)="selId.set(null)"></div>
      <aside class="g-drawer">
        <div class="dh"><span class="av" [style.background]="m.color">{{ m.initials }}</span><div class="col"><h3>{{ m.name }}</h3><small class="muted">{{ m.id }} · {{ m.segment }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
        <div class="km"><div><small>Visits (90d)</small><b>{{ m.visits }}</b></div><div><small>Avg. dwell</small><b>{{ mm(m.avgDwell) }}</b></div><div><small>Est. spend</small><b>AED {{ n(m.spend) }}</b></div><div><small>Favourite</small><b>{{ m.fav }}</b></div></div>
        <h4>Visit history</h4>
        <ul class="list">
          @for (v of history(m); track $index) {<li class="vh"><app-icon name="map-pin" [size]="15" /><div class="col"><b>{{ v.date }}</b><small>{{ v.path }}</small></div><span class="muted">{{ v.dur }}</span></li>}
        </ul>
        <div class="form-actions"><button class="btn-ghost" (click)="t.show('Offer pushed to ' + m.name + ' via loyalty app')">Send offer</button><button class="btn-primary" (click)="openCampaign([m.id])">Add to campaign</button></div>
      </aside>
    }
    @if (camp(); as c) {
      <div class="g-overlay" (click)="camp.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveCampaign()">
        <div class="modal-head"><h3>Create Campaign</h3><button type="button" class="close-btn" (click)="camp.set(null)">×</button></div>
        <p class="muted">Audience: <b>{{ c.ids.length ? c.ids.length + ' selected members' : seg() === 'All' ? 'All members' : seg() + ' segment (' + members().length + ')' }}</b></p>
        <div class="form-grid">
          <label class="full">Campaign name *<input class="input" required [value]="c.name" (input)="camp.set({ ...c, name: $any($event.target).value })" /></label>
          <label>Target zone<select class="select" [value]="c.zone" (change)="camp.set({ ...c, zone: $any($event.target).value })">@for (z of s.zones(); track z.id) {<option [value]="z.name">{{ z.name }}</option>}</select></label>
          <label>Channel<select class="select" [value]="c.channel" (change)="camp.set({ ...c, channel: $any($event.target).value })"><option>Loyalty App</option><option>SMS</option><option>Email</option><option>Digital Signage</option><option>Wi-Fi Portal</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="camp.set(null)">Cancel</button><button class="btn-primary" type="submit">Launch</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .dh { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; margin-bottom: 14px; }
    .av { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); font-weight: 700; }
    .km { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; } .km div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; } .km small { color: var(--muted); font-size: 11px; } .km b { display: block; font-size: 15px; }
    .vh { grid-template-columns: 18px 1fr auto; } .vh app-icon { color: var(--primary); }
  `],
})
export class RepeatVisitors {
  protected readonly s = inject(AnalyticsStore);
  private readonly router = inject(Router);
  protected readonly parent = 'Customer & Visitor Analytics';
  protected readonly n = fmtN;
  protected readonly mm = fmtMin;
  protected readonly days = TREND_DAYS;
  protected readonly t = toaster();
  protected readonly segs = ['All', 'VIP', 'Loyal', 'Regular', 'At Risk', 'New'];
  protected readonly seg = signal('All');
  protected readonly selId = signal<string | null>(null);
  protected readonly newV = computed(() => Math.round(this.s.total() * 0.58));
  protected readonly repV = computed(() => this.s.total() - this.newV());
  protected readonly repPct = computed(() => Math.round((this.repV() / Math.max(1, this.s.total())) * 100));
  protected readonly atRisk = computed(() => fmtN(318 * this.s.site().factor));
  protected readonly daily = computed<Series[]>(() => [
    { name: 'New', color: 'var(--ka-7c3aed)', values: NEW_D.map((v) => Math.round(v * this.s.f())) },
    { name: 'Repeat', color: 'var(--ka-3b82f6)', values: REP_D.map((v) => Math.round(v * this.s.f())) },
  ]);
  protected readonly freq = computed(() => [
    { label: '1 visit', value: 41, display: '41%', color: 'var(--ka-c4b5fd)' },
    { label: '2–3 visits', value: 29, display: '29%', color: 'var(--ka-a78bfa)' },
    { label: '4–6 visits', value: 17, display: '17%', color: 'var(--ka-8b5cf6)' },
    { label: '7–10 visits', value: 9, display: '9%', color: 'var(--ka-7c3aed)' },
    { label: '10+ visits', value: 4, display: '4%', color: 'var(--ka-5b21b6)' },
  ]);
  protected readonly cohorts = {
    rows: ['W37', 'W38', 'W39', 'W40', 'W41'],
    cols: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'],
    data: [[48, 36, 29, 24], [51, 38, 31, 26], [46, 35, 28, 0], [53, 40, 0, 0], [55, 0, 0, 0]],
  };
  protected readonly members = computed(() => {
    const sg = this.seg();
    return MEMBERS.filter((m) => sg === 'All' || m.segment === sg).map((m) => ({ ...m, avatar: m.color, dwellText: fmtMin(m.avgDwell), spendText: `AED ${fmtN(m.spend)}` }));
  });
  protected readonly sel = computed(() => MEMBERS.find((m) => m.id === this.selId()) ?? null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Member', kind: 'person', sub: 'id' },
    { key: 'segment', label: 'Segment', kind: 'tag', tag: (r) => (r.segment === 'VIP' ? 'tag' : r.segment === 'Loyal' ? 'tag green' : r.segment === 'At Risk' ? 'tag red' : r.segment === 'New' ? 'tag blue' : 'tag grey') },
    { key: 'visits', label: 'Visits (90d)', kind: 'num' },
    { key: 'lastVisit', label: 'Last Visit' },
    { key: 'dwellText', label: 'Avg Dwell' },
    { key: 'fav', label: 'Favourite Zone' },
    { key: 'spendText', label: 'Est. Spend' },
  ];
  protected readonly filters = [{ key: 'fav', label: 'Favourite', options: ['Food Court', 'Retail Zone', 'Cinema', 'Kids Zone', 'Event Area'] }];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View visit history', icon: 'history' },
    { id: 'offer', label: 'Send offer', icon: 'a-mail' },
    { id: 'campaign', label: 'Add to campaign', icon: 'megaphone' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'campaign', label: 'Create campaign for selected' }];
  protected act(a: string, m: AMember) {
    if (a === 'view') return this.selId.set(m.id);
    if (a === 'offer') return this.t.show(`Offer pushed to ${m.name} via loyalty app`);
    this.openCampaign([m.id]);
  }
  protected history(m: AMember) {
    const zones = this.s.zones();
    return Array.from({ length: Math.min(6, m.visits) }, (_, i) => ({
      date: `${String(14 - i * 3 - (m.visits % 2)).padStart(2, '0')} Oct 2026`.replace(/^-?\d+ Oct/, (x) => (+x.split(' ')[0] < 1 ? `${30 + +x.split(' ')[0]} Sep` : x)),
      path: [zones[(i + 0) % 3], zones[(i * 3 + 1) % zones.length], zones[(i * 5 + 2) % zones.length]].map((z) => z.name).join(' → '),
      dur: fmtMin(m.avgDwell + ((i * 17) % 40) - 20),
    }));
  }
  protected readonly camp = signal<{ ids: string[]; name: string; zone: string; channel: string } | null>(null);
  protected openCampaign(ids: string[]) {
    this.selId.set(null);
    this.camp.set({ ids, name: this.seg() === 'At Risk' ? 'We Miss You — Win-back' : 'Loyalty Boost', zone: 'Retail Zone', channel: 'Loyalty App' });
  }
  protected saveCampaign() {
    const c = this.camp()!;
    if (!c.name.trim()) return;
    const reach = c.ids.length || this.members().length * 60;
    this.s.campaigns.update((l) => [{ id: `C${Date.now()}`, name: c.name, zone: c.zone, channel: c.channel, start: '2026-10-14', end: '2026-11-14', reach, engaged: 0, converted: 0, status: 'Active' }, ...l]);
    this.camp.set(null);
    this.t.show(`Campaign "${c.name}" launched · tracking in Conversion & Engagement`);
    setTimeout(() => this.router.navigateByUrl(BASE + 'conversion-engagement'), 1200);
  }
}

/* =========================================================
   Heatmaps & Trajectories
   ========================================================= */
const TRAJ = [
  { id: 'T1', name: 'Entrance → Retail → Food Court', count: 2984, color: 'var(--ka-7c3aed)', pts: [[120, 290], [140, 186], [180, 110], [330, 182], [700, 184], [800, 110]] },
  { id: 'T2', name: 'Parking → Cinema', count: 2116, color: 'var(--ka-3b82f6)', pts: [[856, 300], [840, 186], [600, 184], [520, 110]] },
  { id: 'T3', name: 'Entrance → Event Area', count: 1424, color: 'var(--ka-ec4899)', pts: [[90, 300], [200, 186], [480, 186], [520, 250]] },
  { id: 'T4', name: 'Food Court → Kids Zone', count: 1198, color: 'var(--ka-f97316)', pts: [[880, 110], [860, 184], [740, 186], [740, 260]] },
  { id: 'T5', name: 'Retail loop', count: 986, color: 'var(--ka-eab308)', pts: [[90, 60], [270, 60], [270, 140], [90, 140], [90, 70]] },
  { id: 'T6', name: 'Event Area → Parking Exit', count: 744, color: 'var(--ka-22c55e)', pts: [[600, 260], [620, 188], [920, 186], [934, 290]] },
] as { id: string; name: string; count: number; color: string; pts: [number, number][] }[];
const LAYERS = ['Combined', 'Heat', 'Trajectories', 'Zones'] as const;
type Layer = (typeof LAYERS)[number];
const HOUR_MUL = [0.15, 0.22, 0.3, 0.38, 0.48, 0.6, 0.72, 0.82, 0.92, 1.12, 1.04, 0.94, 0.86, 0.72, 0.6, 0.48];

@Component({
  selector: 'app-heatmaps-trajectories',
  imports: [...UI, AFilters, MallMap, FfLine, ZoneDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Heatmaps & Trajectories" [parent]="parent" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="People density over time and the most common movement paths through the venue.">
      <app-a-filters [range]="false" />
      <button class="btn-primary hb" (click)="exportCsv()"><app-icon name="a-upload" [size]="16" />Export Snapshot</button>
    </app-page-head>

    <section class="row c32b">
      <div class="card">
        <div class="ch">
          <div class="seg">@for (l of layers; track l) {<button [class.on]="layer() === l" (click)="layer.set(l)">{{ l }}</button>}</div>
          <div class="ch-r">
            <button class="btn-ghost sm" (click)="zoom.set(Math.min(2.5, zoom() * 1.25))" title="Zoom in"><app-icon name="plus" [size]="14" /></button>
            <button class="btn-ghost sm" (click)="zoom.set(Math.max(1, zoom() / 1.25))" title="Zoom out"><app-icon name="minus" [size]="14" /></button>
            <button class="btn-ghost sm" (click)="zoom.set(1)">Reset</button>
          </div>
        </div>
        <app-mall-map class="map" [zones]="mapZones()" [blobs]="blobs()" [showHeat]="layer() !== 'Trajectories'" [showZones]="layer() === 'Zones'" [tracks]="layer() === 'Heat' || layer() === 'Zones' ? [] : tracks()" [selTrack]="selTrack()" [selected]="selZone()" [zoom]="zoom()" (zoneClick)="selZone.set($event)" />
        <div class="timeline">
          <button class="play" (click)="togglePlay()" [title]="playing() ? 'Pause' : 'Play day'"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="16" /></button>
          <input type="range" min="0" [max]="hours.length - 1" [value]="hour()" (input)="hour.set(+$any($event.target).value)" />
          <b>{{ hoursFull[hour()] }}</b>
          <span class="scale"><span>Low</span><i></i><span>High</span></span>
        </div>
      </div>
      <div class="side">
        <div class="card">
          <div class="ch"><h3>Hotspots · {{ hours[hour()] }}</h3></div>
          <ul class="list hs">
            @for (z of hot(); track z.id; let i = $index) {
              <li class="click" [class.on]="selZone() === z.id" (click)="selZone.set(z.id)"><span class="rk">{{ i + 1 }}</span><div class="col"><b>{{ z.name }}</b><small>{{ z.people }} people</small></div><b [style.color]="z.d > 85 ? 'var(--ka-dc2626)' : z.d > 65 ? 'var(--ka-ea580c)' : 'var(--ka-16a34a)'">{{ z.d }}%</b></li>
            }
          </ul>
        </div>
        <div class="card">
          <div class="ch"><h3>Top Trajectories</h3>@if (selTrack()) {<button class="link" (click)="selTrack.set(null)">Clear</button>}</div>
          <ul class="list tj">
            @for (t of traj; track t.id) {
              <li class="click" [class.on]="selTrack() === t.id" (click)="pickTrack(t.id)"><span class="sw" [style.background]="t.color"></span><span>{{ t.name }}</span><b>{{ n(t.count * s.f()) }}</b></li>
            }
          </ul>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="ch"><h3>Density through the day · {{ selName() }}</h3>@if (selZone()) {<div class="ch-r"><button class="link" (click)="drawer.set(selZone())">Zone details</button><button class="link" (click)="selZone.set(null)">All zones</button></div>}</div>
      <app-ff-line [labels]="hours" [tipLabels]="hoursFull" [series]="densSeries()" [height]="200" [every]="1" [pin]="hour()" yLabel="Density %" (pick)="hour.set($event)" />
    </section>
    @if (drawer(); as id) {<app-zone-drawer [zoneId]="id" (closed)="drawer.set(null)" />}
  `,
  styles: [A_CSS, `
    .c32b { grid-template-columns: minmax(0, 2.3fr) minmax(280px, 1fr); }
    .map { height: 330px; border-radius: 8px; overflow: hidden; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .timeline { display: flex; align-items: center; gap: 12px; margin-top: 12px; } .timeline input { flex: 1; accent-color: var(--primary); } .timeline b { width: 74px; font-size: 13px; }
    .play { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; cursor: pointer; }
    .scale { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); } .scale i { width: 90px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--kb-4f46e5), var(--kb-3b82f6), var(--kb-22d3ee), var(--kb-22c55e), var(--kb-facc15), var(--kb-f97316), var(--kb-ef4444)); }
    .hs li { grid-template-columns: 22px 1fr auto; padding: 7px 4px; } .rk { width: 22px; height: 22px; border-radius: 6px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
    .tj li { grid-template-columns: 10px 1fr auto; padding: 7px 4px; }
    @media (max-width: 1200px) { .c32b { grid-template-columns: 1fr; } }
  `],
})
export class AnalyticsHeatmaps {
  protected readonly s = inject(AnalyticsStore);
  protected readonly parent = 'Customer & Visitor Analytics';
  protected readonly Math = Math;
  protected readonly n = fmtN;
  protected readonly hours = HOURS;
  protected readonly hoursFull = HOURS_FULL;
  protected readonly traj = TRAJ;
  protected readonly layers = LAYERS;
  protected readonly layer = signal<Layer>('Combined');
  protected readonly hour = signal(9);
  protected readonly zoom = signal(1);
  protected readonly playing = signal(false);
  protected readonly selZone = signal<string | null>(null);
  protected readonly selTrack = signal<string | null>(null);
  protected readonly drawer = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor() {
    effect((onCleanup) => onCleanup(() => this.timer && clearInterval(this.timer)));
  }
  private readonly dens = computed(() => {
    const k = HOUR_MUL[this.hour()];
    return this.s.zonesNow().map((z, i) => ({ ...z, d: Math.min(99, Math.round(z.pct * k * (1 + ((i + this.hour()) % 3) * 0.05))), people: Math.round(z.occ * k) }));
  });
  protected readonly mapZones = computed(() => this.dens().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: z.color, pct: z.d })));
  protected readonly blobs = computed(() => zoneBlobs(this.dens().map((z) => ({ ...z, pct: z.d })), this.hour()));
  protected readonly hot = computed(() => [...this.dens()].sort((a, b) => b.d - a.d).slice(0, 6));
  protected readonly tracks = computed<Track[]>(() => TRAJ.map((t) => ({ id: t.id, color: t.color, points: t.pts })));
  protected readonly selName = computed(() => this.s.zones().find((z) => z.id === this.selZone())?.name ?? 'All zones');
  protected readonly densSeries = computed<Series[]>(() => {
    const z = this.s.zonesNow().find((x) => x.id === this.selZone());
    const base = z ? z.pct : this.s.occPct();
    return [
      { name: 'Today', color: 'var(--ka-7c3aed)', values: HOUR_MUL.map((k) => Math.min(99, Math.round(base * k))), area: true },
      { name: 'Last week', color: 'var(--ka-3b82f6)', values: HOUR_MUL.map((k, i) => Math.min(99, Math.round(base * k * (0.84 + (i % 4) * 0.02)))) },
    ];
  });
  protected pickTrack(id: string) {
    this.selTrack.set(this.selTrack() === id ? null : id);
    if (this.layer() === 'Heat' || this.layer() === 'Zones') this.layer.set('Combined');
  }
  protected togglePlay() {
    if (this.playing()) {
      this.playing.set(false);
      if (this.timer) clearInterval(this.timer);
      return;
    }
    this.playing.set(true);
    if (this.hour() >= HOURS.length - 1) this.hour.set(0);
    this.timer = setInterval(() => {
      if (this.hour() >= HOURS.length - 1) { this.playing.set(false); if (this.timer) clearInterval(this.timer); return; }
      this.hour.update((h) => h + 1);
    }, 700);
  }
  protected exportCsv() {
    downloadCsv(`density-${this.s.date()}-${HOURS[this.hour()].replace(' ', '')}.csv`, [['Zone', 'Density %', 'People'], ...this.dens().map((z) => [z.name, z.d, z.people]), [], ['Trajectory', 'Visitors'], ...TRAJ.map((t) => [t.name, Math.round(t.count * this.s.f())])]);
    this.s.logRun('Heatmap Snapshot', 'CSV');
  }
}
