// Path & Movement Analysis — trajectories, zone-to-zone flows (sankey), dwell, congestion points and path replay.
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { IsoGlow, IsoMarker, IsoPath, IsoView } from './iso-view';
import { along, buildJourneys, center, FLOOR_TABS, Journey, route } from './twin-analytics';
import { heatColor } from './twin-widgets';
import { floorById, fmtN, JOHN_PATH, TwinStore, TYPE_COLOR } from './twin.data';

type Mode = 'Flows' | 'Trajectories' | 'Replay';
type Kind = 'employee' | 'visitor' | 'contractor';
interface Flow {
  key: string;
  from: string;
  to: string;
  n: number;
}
interface Hot {
  id: string;
  name: string;
  zone: string;
  x: number;
  y: number;
  arrivals: number;
  density: number;
  wait: number;
  peak: string;
}
const WINDOWS: Record<string, [number, number]> = { 'All day': [0, 1440], 'Morning 07–11': [420, 660], 'Midday 11–14': [660, 840], 'Afternoon 14–19': [840, 1140] };
const KIND_LABEL: Record<Kind, string> = { employee: 'Employees', visitor: 'Visitors', contractor: 'Contractors' };
const SANKEY_COLORS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0891b2)', 'var(--ka-16a34a)', 'var(--ka-f59e0b)', 'var(--ka-db2777)'];
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

@Component({
  selector: 'app-twin-path-movement-analysis',
  imports: [...UI, IsoView, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Path & Movement Analysis" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Understand how people and assets move through the building: flows between zones, dwell, congestion and individual path replay.">
      <select class="select" [value]="win()" (change)="win.set($any($event.target).value)">@for (w of windows; track w) {<option [value]="w">{{ w }}</option>}</select>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Journeys Tracked" [value]="fmt(allCount())" icon="twin-route" color="var(--ka-7c3aed)" change="9%" sub="vs. last Thursday" />
      <app-kpi label="Avg Path Length" [value]="avgLen() + ' m'" icon="activity" color="var(--ka-2563eb)" [sub]="floorName() + ' · ' + win()" />
      <app-kpi label="Avg Travel Time" [value]="avgDur() + ' min'" icon="clock" color="var(--ka-0891b2)" sub="door-to-desk incl. stops" />
      <app-kpi label="Avg Dwell per Stop" [value]="avgDwell() + ' min'" icon="map-pin" color="var(--ka-16a34a)" sub="excl. final destination" />
      <app-kpi label="Congestion Points" [value]="activeHot()" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="hots().length + ' monitored on ' + floorName()" subColor="var(--ka-dc2626)" />
    </section>

    <section class="pm">
      <div class="card">
        <div class="card-head">
          <div class="ftabs">@for (f of floorTabs; track f.id) {<button [class.on]="floor() === f.id" (click)="setFloor(f.id)">{{ f.name }}</button>}</div>
          <div class="tabs">@for (m of modes; track m) {<button [class.on]="mode() === m" (click)="setMode(m)">{{ m }}</button>}</div>
          <div class="kinds">@for (k of kindList; track k) {<button [class.on]="kinds().has(k)" [style.--c]="kc[k]" (click)="toggleKind(k)"><i></i>{{ kl[k] }}</button>}</div>
        </div>
        <app-iso-view [zones]="zones()" [floor]="floor()" [paths]="paths()" [markers]="markers()" [glows]="glows()" [shirts]="mode() === 'Replay' ? ['var(--ka-cbd5e1)'] : []" [selectedZone]="selZone()" aspect="1000 / 520" (markerClick)="markerPick($event)" (zoneClick)="zonePick($event)" />
        <div class="legend-row">
          @switch (mode()) {
            @case ('Flows') {<span><i class="ln" style="background: linear-gradient(90deg, var(--kb-3b82f6), var(--kb-22c55e), var(--kb-f59e0b), var(--kb-ef4444))"></i>Flow volume (low → high)</span><span><i class="dot red"></i>Congestion point</span><span class="muted">{{ selFlow() ? 'Showing ' + selFlow()!.from + ' → ' + selFlow()!.to : 'Top ' + mapFlows().length + ' flows · click a flow or sankey link to isolate it' }}</span>}
            @case ('Trajectories') {@for (k of kindList; track k) {<span><i class="ln" [style.background]="kc[k]"></i>{{ kl[k] }}</span>}<span class="muted">{{ shownTraj().length }} of {{ filtered().length }} journeys drawn</span>}
            @case ('Replay') {<span><i class="ln" [style.background]="kc[$any(cur()?.kind) ?? 'employee']"></i>{{ cur()?.who }}</span><span><i class="dot" style="background:var(--kb-ffffff);border:2px solid var(--kl-7c3aed)"></i>Stop</span><span class="muted">{{ cur()?.id }} · {{ cur()?.distance }} m</span>}
          }
        </div>
      </div>

      <aside class="card side">
        @if (mode() === 'Replay' && cur(); as j) {
          <div class="who"><span class="av" [style.background]="kc[$any(j.kind)]">{{ initials(j.who) }}</span><div><h3>{{ j.who }}</h3><small class="muted">{{ j.whoId }} · {{ j.kind }} · {{ j.id }}</small></div></div>
          <select class="select" [value]="j.id" (change)="pickJourney($any($event.target).value)">@for (o of replayList(); track o.id) {<option [value]="o.id">{{ o.at }} · {{ o.who }} ({{ o.stops }} stops)</option>}</select>
          <div class="rp">
            <button class="pl" (click)="togglePlay()"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="18" /></button>
            <div class="rp-m"><input type="range" min="0" max="1000" [value]="prog() * 1000" (input)="seek(+$any($event.target).value / 1000)" /><div class="rp-t"><span>{{ clock(0) }}</span><b>{{ clock(prog()) }}</b><span>{{ clock(1) }}</span></div></div>
          </div>
          <div class="tabs sp">@for (s of speeds; track s) {<button [class.on]="speed() === s" (click)="speed.set(s)">{{ s }}×</button>}</div>
          <ol class="stops">
            @for (s of j.stops; track $index; let i = $index) {
              <li [class.on]="i === stopIdx()" [class.done]="i < stopIdx()" (click)="seek(i / (j.stops.length - 1 || 1))"><i></i><div><b>{{ s.zone }}</b><small>{{ s.at }} · dwell {{ s.dwell }} min</small></div></li>
            }
          </ol>
          <dl class="facts"><dt>Distance</dt><dd>{{ j.distance }} m</dd><dt>Duration</dt><dd>{{ j.duration }} min</dd><dt>Avg speed</dt><dd>1.2 m/s</dd></dl>
          <div class="acts">
            <button class="btn-primary" (click)="locate(j)"><app-icon name="locate" [size]="14" />Locate live</button>
            <button class="btn-ghost" (click)="exportOne(j)"><app-icon name="download" [size]="14" />Path CSV</button>
          </div>
        } @else {
          <div class="sh"><h3>Top Flows</h3><small class="muted">{{ floorName() }} · {{ win() }}</small></div>
          <ul class="flows">
            @for (f of flows().slice(0, 9); track f.key) {
              <li [class.on]="selFlowKey() === f.key" (click)="pickFlow(f.key)">
                <div><b>{{ f.from }}</b><app-icon name="chevron-right" [size]="12" /><b>{{ f.to }}</b></div>
                <span>{{ f.n }}</span><i class="bar"><i [style.width.%]="(f.n / maxFlow()) * 100" [style.background]="heatColor(f.n / maxFlow())"></i></i>
              </li>
            } @empty {<li class="muted">No movement for this filter</li>}
          </ul>
          @if (selFlow(); as f) {
            <div class="fsel">
              <b>{{ f.n }} journeys</b> from {{ f.from }} to {{ f.to }} · avg {{ flowAvg().len }} m in {{ flowAvg().dur }} min
              <div class="acts"><button class="btn-ghost sm" (click)="replayFlow()"><app-icon name="play" [size]="13" />Replay one</button><button class="btn-ghost sm" (click)="selFlowKey.set(null)">Clear</button></div>
            </div>
          }
          <h4>Journeys by type</h4>
          <app-donut [segments]="kindSegs()" center="Journeys" [size]="120" />
        }
      </aside>
    </section>

    <section class="row2">
      <div class="card">
        <div class="card-head"><h3>Zone-to-Zone Flow <span class="card-sub">top origins → destinations · {{ sankey().total }} transitions</span></h3></div>
        <svg class="sankey" viewBox="0 0 640 270">
          @for (l of sankey().links; track l.key) {
            <path [attr.d]="l.d" [attr.fill]="l.color" [attr.opacity]="selFlowKey() ? (selFlowKey() === l.key ? 0.75 : 0.1) : 0.32" (click)="pickFlow(l.key)"><title>{{ l.from }} → {{ l.to }}: {{ l.n }}</title></path>
          }
          @for (n of sankey().left; track n.name) {<rect x="150" [attr.y]="n.y" width="10" [attr.height]="n.h" [attr.fill]="n.color" rx="2" /><text x="142" [attr.y]="n.y + n.h / 2 + 4" text-anchor="end">{{ n.name }} · {{ n.n }}</text>}
          @for (n of sankey().right; track n.name) {<rect x="430" [attr.y]="n.y" width="10" [attr.height]="n.h" fill="var(--ka-94a3b8)" rx="2" /><text x="448" [attr.y]="n.y + n.h / 2 + 4">{{ n.name }} · {{ n.n }}</text>}
        </svg>
      </div>
      <div class="card">
        <div class="card-head"><h3>Congestion Points <span class="card-sub">{{ floorName() }}</span></h3></div>
        <table class="table ct">
          <thead><tr><th>Location</th><th>Peak</th><th class="num">Density</th><th class="num">Wait</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (h of hots(); track h.id) {
              <tr [class.sel]="selHot() === h.id" (click)="selHot.set(h.id)">
                <td><b>{{ h.name }}</b><small class="muted">{{ h.arrivals }} arrivals</small></td>
                <td>{{ h.peak }}</td>
                <td class="num" [style.color]="h.density >= 3 ? 'var(--ka-dc2626)' : null">{{ h.density }} p/m²</td>
                <td class="num">{{ h.wait }} s</td>
                <td><span [class]="statusCls(h.id)">{{ status(h.id) }}</span></td>
                <td class="ra">
                  @if (status(h.id) === 'Congested' || status(h.id) === 'Watch') {<button class="btn-ghost sm" (click)="$event.stopPropagation(); dispatch(h)">Dispatch</button>}
                  @else if (status(h.id) === 'Steward on site') {<button class="btn-ghost sm" (click)="$event.stopPropagation(); resolve(h)">Resolve</button>}
                  @else {<button class="btn-ghost sm" (click)="$event.stopPropagation(); alert(h)">Alert</button>}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="row2 b">
      <div class="card">
        <div class="card-head"><h3>Movement by Hour <span class="card-sub">journeys started</span></h3></div>
        <app-column-chart [labels]="hourLabels" [series]="hourSeries()" [stacked]="true" [height]="200" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Dwell Distribution <span class="card-sub">per stop</span></h3></div>
        <app-column-chart [labels]="dwellBuckets" [series]="[{ name: 'Stops', color: 'var(--ka-7c3aed)', values: dwellDist() }]" [height]="200" [legend]="false" />
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Journeys <span class="card-sub">{{ fmt(filtered().length) }} on {{ floorName() }}</span></h3></div>
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['who', 'id', 'from', 'to']" searchPlaceholder="Search person, journey, zone…" noun="journeys" [activeId]="mode() === 'Replay' ? curId() : null"
        (rowClick)="replay($event.id)" (action)="act($event.action, $event.row)" />
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .pm { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftabs button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .kinds { display: flex; gap: 4px; } .kinds button { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 16px; padding: 5px 10px; font-size: 12px; cursor: pointer; color: var(--kf-94a3b8); }
    .kinds button i { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-cbd5e1); } .kinds button.on { color: var(--text); border-color: var(--c); } .kinds button.on i { background: var(--c); }
    .legend-row { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; font-size: 12px; margin-top: 10px; color: var(--kf-3b3f5c); } .legend-row span { display: inline-flex; gap: 6px; align-items: center; }
    .ln { width: 26px; height: 4px; border-radius: 2px; display: inline-block; } .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; } .dot.red { background: var(--kb-ef4444); box-shadow: 0 0 0 3px var(--kb-fecaca); }
    .side { display: flex; flex-direction: column; gap: 10px; } .sh { display: flex; justify-content: space-between; align-items: baseline; }
    .who { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; } .av { width: 44px; height: 44px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-weight: 600; }
    .rp { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; } .pl { width: 44px; height: 44px; border-radius: 50%; border: none; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; cursor: pointer; }
    .rp input { width: 100%; accent-color: var(--kf-7c3aed); margin: 0; } .rp-t { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); } .rp-t b { color: var(--text); font-size: 13px; }
    .sp { align-self: flex-start; }
    .stops { list-style: none; margin: 0; padding: 0; } .stops li { display: grid; grid-template-columns: 14px 1fr; gap: 10px; padding: 6px 0; cursor: pointer; position: relative; font-size: 12.5px; }
    .stops li i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--kl-c4b5fd); background: var(--kb-ffffff); margin-top: 3px; z-index: 1; } .stops li:not(:last-child)::after { content: ''; position: absolute; left: 6px; top: 20px; bottom: -6px; width: 2px; background: var(--kb-e9e5f8); }
    .stops li.done i { background: var(--kb-c4b5fd); } .stops li.on i { background: var(--kb-7c3aed); border-color: var(--kl-7c3aed); box-shadow: 0 0 0 4px var(--kb-ede9fe); } .stops li.on b { color: var(--primary); } .stops b { font-weight: 500; display: block; } .stops small { color: var(--muted); }
    .facts { display: grid; grid-template-columns: 90px 1fr; gap: 6px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .flows { list-style: none; margin: 0; padding: 0; } .flows li { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 7px 6px; border-radius: 8px; cursor: pointer; font-size: 12px; } .flows li:hover, .flows li.on { background: var(--kb-f5f3ff); }
    .flows li div { display: flex; align-items: center; gap: 4px; min-width: 0; } .flows li div b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .flows li > span { font-weight: 600; }
    .flows .bar { grid-column: 1 / -1; } .bar { display: block; height: 6px; border-radius: 6px; background: var(--kb-e8eaf2); overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 6px; }
    .side h4 { margin: 4px 0 0; font-size: 13px; } .fsel { background: var(--kb-f5f3ff); border-radius: 8px; padding: 10px; font-size: 12.5px; display: flex; flex-direction: column; gap: 8px; }
    .row2 { display: grid; grid-template-columns: 1.15fr 1fr; gap: 12px; margin-bottom: 12px; } .row2.b { grid-template-columns: 1fr 1fr; }
    .sankey { width: 100%; height: auto; display: block; } .sankey text { font-size: 11px; fill: var(--ka-3b3f5c); } .sankey path { cursor: pointer; transition: opacity 0.15s; }
    .ct td small { display: block; font-size: 11px; } .ct tr { cursor: pointer; } .ct tr.sel td { background: var(--kb-f5f3ff); } .ra { text-align: right; } .num { text-align: right; }
    @media (max-width: 1280px) { .pm, .row2, .row2.b { grid-template-columns: 1fr; } }
  `,
})
export class PathMovementAnalysis {
  private readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly heatColor = heatColor;
  protected readonly floorTabs = FLOOR_TABS;
  protected readonly windows = Object.keys(WINDOWS);
  protected readonly modes: Mode[] = ['Flows', 'Trajectories', 'Replay'];
  protected readonly kindList: Kind[] = ['employee', 'visitor', 'contractor'];
  protected readonly kc = TYPE_COLOR as Record<string, string>;
  protected readonly kl = KIND_LABEL;
  protected readonly speeds = [1, 2, 4];
  protected readonly hourLabels = Array.from({ length: 13 }, (_, i) => `${i + 7}`);
  protected readonly dwellBuckets = ['<5 min', '5–15', '15–30', '30–60', '60–120', '>120'];

  protected readonly floor = signal(['R', 'G'].includes(this.store.floor()) ? '4' : this.store.floor());
  protected readonly mode = signal<Mode>('Flows');
  protected readonly win = signal('All day');
  protected readonly kinds = signal(new Set<Kind>(['employee', 'visitor', 'contractor']));
  protected readonly selFlowKey = signal<string | null>(null);
  protected readonly selZone = signal<string | null>(null);
  protected readonly selHot = signal<string | null>(null);
  protected readonly hotStatus = signal<Record<string, string>>({});
  protected readonly curId = signal<string | null>(null);
  protected readonly prog = signal(0);
  protected readonly playing = signal(false);
  protected readonly speed = signal(1);
  protected readonly toast = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pause());
  }

  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  protected readonly floorName = computed(() => floorById(this.floor()).name);
  private readonly cache = new Map<string, Journey[]>();
  private journeysFor(f: string) {
    if (!this.cache.has(f)) this.cache.set(f, buildJourneys(f, this.store.zones(), this.store.people(), JOHN_PATH));
    return this.cache.get(f)!;
  }
  protected readonly journeys = computed(() => this.journeysFor(this.floor()));
  protected readonly allCount = computed(() => FLOOR_TABS.reduce((a, f) => a + this.journeysFor(f.id).length, 0));
  protected readonly filtered = computed(() => {
    const [a, b] = WINDOWS[this.win()];
    const k = this.kinds();
    return this.journeys().filter((j) => j.start >= a && j.start < b && k.has(j.kind as Kind));
  });
  protected readonly avgLen = computed(() => Math.round(this.filtered().reduce((a, j) => a + j.distance, 0) / (this.filtered().length || 1)));
  protected readonly avgDur = computed(() => (this.filtered().reduce((a, j) => a + j.duration, 0) / (this.filtered().length || 1)).toFixed(1));
  protected readonly avgDwell = computed(() => {
    const s = this.filtered().flatMap((j) => j.stops.slice(0, -1));
    return (s.reduce((a, x) => a + x.dwell, 0) / (s.length || 1)).toFixed(1);
  });

  /* ---------- flows ---------- */
  protected readonly flows = computed<Flow[]>(() => {
    const m = new Map<string, Flow>();
    for (const j of this.filtered())
      for (let i = 1; i < j.stops.length; i++) {
        const key = `${j.stops[i - 1].zone}→${j.stops[i].zone}`;
        const f = m.get(key) ?? { key, from: j.stops[i - 1].zone, to: j.stops[i].zone, n: 0 };
        f.n++;
        m.set(key, f);
      }
    return [...m.values()].sort((a, b) => b.n - a.n);
  });
  protected readonly maxFlow = computed(() => this.flows()[0]?.n ?? 1);
  protected readonly selFlow = computed(() => this.flows().find((f) => f.key === this.selFlowKey()) ?? null);
  protected readonly mapFlows = computed(() => (this.selFlow() ? [this.selFlow()!] : this.flows().slice(0, 10)));
  private readonly flowJourneys = computed(() => {
    const f = this.selFlow();
    if (!f) return [];
    return this.filtered().filter((j) => j.stops.some((s, i) => i > 0 && j.stops[i - 1].zone === f.from && s.zone === f.to));
  });
  protected readonly flowAvg = computed(() => {
    const js = this.flowJourneys();
    return { len: Math.round(js.reduce((a, j) => a + j.distance, 0) / (js.length || 1)), dur: (js.reduce((a, j) => a + j.duration, 0) / (js.length || 1)).toFixed(1) };
  });
  private zc(name: string): [number, number] | null {
    const z = this.zones().find((x) => x.name === name);
    return z ? center(z) : null;
  }

  /* ---------- congestion ---------- */
  protected readonly hots = computed<Hot[]>(() => {
    const arr = new Map<string, number>();
    for (const j of this.journeys()) for (const s of j.stops.slice(1)) arr.set(s.zone, (arr.get(s.zone) ?? 0) + 1);
    return [...arr.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([zone, n], i) => {
        const z = this.zones().find((x) => x.name === zone)!;
        // entrance = zone edge facing the building centre
        const [cx, cy] = center(z);
        const x = Math.abs(cx - 500) > Math.abs(cy - 280) * 1.8 ? (cx < 500 ? z.x + z.w - 8 : z.x + 8) : cx;
        const y = x === cx ? (cy < 280 ? z.y + z.h - 8 : z.y + 8) : cy;
        const density = +(0.6 + (n / (this.journeys().length || 1)) * 9 - i * 0.08).toFixed(1);
        return { id: `${this.floor()}-${z.id}`, name: `${zone} entrance`, zone, x, y, arrivals: n, density, wait: Math.round(density * 22), peak: z.type === 'cafeteria' ? '12:30' : z.type === 'reception' || z.type === 'lobby' ? '08:45' : z.type === 'meeting' ? '14:00' : '09:15' };
      });
  });
  protected status(id: string) {
    const h = this.hots().find((x) => x.id === id);
    return this.hotStatus()[id] ?? (h && h.density >= 3 ? 'Congested' : h && h.density >= 2.4 ? 'Watch' : 'Normal');
  }
  protected statusCls(id: string) {
    const s = this.status(id);
    return s === 'Congested' ? 'tag red' : s === 'Steward on site' || s === 'Watch' ? 'tag amber' : 'tag green';
  }
  protected readonly activeHot = computed(() => this.hots().filter((h) => this.status(h.id) === 'Congested' || this.status(h.id) === 'Watch').length);

  /* ---------- replay ---------- */
  protected readonly replayList = computed(() => {
    const list = this.filtered().slice(0, 60);
    const j = this.cur();
    const out = j && !list.includes(j) ? [j, ...list] : list;
    return out.map((x) => ({ id: x.id, who: x.who, at: hhmm(x.start), stops: x.stops.length }));
  });
  protected readonly cur = computed(() => this.journeys().find((j) => j.id === this.curId()) ?? this.journeys().find((j) => j.id === 'J-41001') ?? this.filtered()[0] ?? null);
  protected readonly stopIdx = computed(() => {
    const j = this.cur();
    return j ? Math.min(j.stops.length - 1, Math.floor(this.prog() * (j.stops.length - 1) + 0.02)) : 0;
  });
  protected clock(p: number) {
    const j = this.cur();
    return j ? hhmm(j.start + p * j.duration) : '';
  }

  /* ---------- map layers ---------- */
  protected readonly shownTraj = computed(() => (this.selFlow() ? this.flowJourneys() : this.filtered()).slice(0, 36));
  protected readonly paths = computed<IsoPath[]>(() => {
    const m = this.mode();
    if (m === 'Replay') {
      const j = this.cur();
      if (!j) return [];
      const done: [number, number][] = [];
      const p = this.prog();
      const n = 40;
      for (let i = 0; i <= n * p; i++) done.push(along(j.points, i / n));
      done.push(along(j.points, p));
      return [{ points: j.points, color: 'var(--ka-c4b5fd)', dashed: true }, ...(done.length > 1 ? [{ points: done, color: TYPE_COLOR[j.kind], dots: false }] : [])];
    }
    if (m === 'Trajectories') return this.shownTraj().map((j) => ({ points: j.points, color: TYPE_COLOR[j.kind], dashed: j.kind !== 'employee' }));
    const max = this.maxFlow();
    return this.mapFlows()
      .map((f) => {
        const a = this.zc(f.from);
        const b = this.zc(f.to);
        return a && b ? ({ points: route(a, b), color: heatColor(f.n / max), dots: !!this.selFlow() } as IsoPath) : null;
      })
      .filter((x): x is IsoPath => !!x)
      .reverse();
  });
  protected readonly markers = computed<IsoMarker[]>(() => {
    const m = this.mode();
    if (m === 'Replay') {
      const j = this.cur();
      if (!j) return [];
      const [x, y] = along(j.points, this.prog());
      const stopsAt = j.stops.map((s, i) => {
        const [sx, sy] = along(j.points, i / (j.stops.length - 1 || 1));
        return { id: `stop-${i}`, x: sx, y: sy, color: i <= this.stopIdx() ? 'var(--ka-7c3aed)' : 'var(--ka-94a3b8)', icon: 'map-pin', kind: 'chip', title: `${s.zone} · ${s.at}` } as IsoMarker;
      });
      return [...stopsAt, { id: 'who', x, y, color: TYPE_COLOR[j.kind], icon: j.kind === 'contractor' ? 'hard-hat' : 'user', kind: 'pin', title: j.who }];
    }
    if (m === 'Flows') return this.hots().map((h) => ({ id: h.id, x: h.x, y: h.y, color: this.status(h.id) === 'Congested' ? 'var(--ka-ef4444)' : this.status(h.id) === 'Normal' || this.status(h.id) === 'Resolved' ? 'var(--ka-16a34a)' : 'var(--ka-f59e0b)', icon: 'users', kind: 'value', label: `${h.density} p/m²`, title: h.name }));
    return [];
  });
  protected readonly glows = computed<IsoGlow[]>(() => (this.mode() === 'Flows' ? this.hots().filter((h) => this.status(h.id) === 'Congested').map((h) => ({ x: h.x, y: h.y, r: 46, color: 'var(--ka-ef4444)' })) : []));

  /* ---------- sankey ---------- */
  protected readonly sankey = computed(() => {
    const fl = this.flows();
    const tot = (key: 'from' | 'to') => {
      const m = new Map<string, number>();
      for (const f of fl) m.set(f[key], (m.get(f[key]) ?? 0) + f.n);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
    };
    const L = tot('from');
    const R = tot('to');
    const links = fl.filter((f) => L.includes(f.from) && R.includes(f.to));
    const total = links.reduce((a, l) => a + l.n, 0) || 1;
    const H = 250;
    const gap = 8;
    const k = (H - gap * 5) / total;
    const mk = (names: string[], key: 'from' | 'to') => {
      let y = 10;
      return names.map((name, i) => {
        const n = links.filter((l) => l[key] === name).reduce((a, l) => a + l.n, 0);
        const node = { name, n, y, h: Math.max(2, n * k), color: SANKEY_COLORS[i % SANKEY_COLORS.length], off: 0 };
        y += node.h + gap;
        return node;
      });
    };
    const left = mk(L, 'from');
    const right = mk(R, 'to');
    const out = links
      .sort((a, b) => L.indexOf(a.from) - L.indexOf(b.from) || R.indexOf(a.to) - R.indexOf(b.to))
      .map((l) => {
        const s = left.find((n) => n.name === l.from)!;
        const t = right.find((n) => n.name === l.to)!;
        const h = l.n * k;
        const y0 = s.y + s.off;
        const y1 = t.y + t.off;
        s.off += h;
        t.off += h;
        const x0 = 160;
        const x1 = 430;
        const xm = 295;
        return { key: l.key, from: l.from, to: l.to, n: l.n, color: s.color, d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h}Z` };
      });
    return { left, right, links: out, total };
  });

  protected readonly kindSegs = computed(() => this.kindList.map((k) => ({ label: KIND_LABEL[k], color: TYPE_COLOR[k], value: this.filtered().filter((j) => j.kind === k).length })).filter((x) => x.value));
  /* ---------- charts + table ---------- */
  protected readonly hourSeries = computed(() =>
    this.kindList.filter((k) => this.kinds().has(k)).map((k) => ({ name: KIND_LABEL[k], color: TYPE_COLOR[k], values: this.hourLabels.map((h) => this.filtered().filter((j) => j.kind === k && Math.floor(j.start / 60) === +h).length) })),
  );
  protected readonly dwellDist = computed(() => {
    const b = [0, 0, 0, 0, 0, 0];
    for (const j of this.filtered())
      for (const s of j.stops) {
        const d = s.dwell;
        b[d < 5 ? 0 : d < 15 ? 1 : d < 30 ? 2 : d < 60 ? 3 : d < 120 ? 4 : 5]++;
      }
    return b;
  });
  protected readonly rows = computed(() =>
    this.filtered().map((j) => ({ ...j, avatar: TYPE_COLOR[j.kind], initials: this.initials(j.who), kindL: j.kind.charAt(0).toUpperCase() + j.kind.slice(1), from: j.stops[0].zone, to: j.stops[j.stops.length - 1].zone, nStops: j.stops.length, startL: hhmm(j.start), distL: `${j.distance} m`, durL: `${j.duration} min` })),
  );
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Journey' },
    { key: 'who', label: 'Person', kind: 'person', sub: 'whoId' },
    { key: 'kindL', label: 'Type', kind: 'tag', tag: (r) => (r.kind === 'visitor' ? 'tag amber' : r.kind === 'contractor' ? 'tag green' : 'tag blue') },
    { key: 'startL', label: 'Start' },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'nStops', label: 'Stops', kind: 'num' },
    { key: 'distance', label: 'Distance (m)', kind: 'num' },
    { key: 'duration', label: 'Duration (min)', kind: 'num' },
  ];
  protected readonly filters = [{ key: 'kindL', label: 'Type', options: ['Employee', 'Visitor', 'Contractor'] }];
  protected readonly actions: RowAction[] = [
    { id: 'replay', label: 'Replay path', icon: 'play' },
    { id: 'locate', label: 'Locate live', icon: 'locate' },
    { id: 'csv', label: 'Export path', icon: 'download' },
  ];

  /* ---------- actions ---------- */
  protected initials(n: string) {
    return n.startsWith('Visitor') ? 'V' : n.split(' ').map((s) => s[0]).slice(0, 2).join('');
  }
  protected setFloor(f: string) {
    this.floor.set(f);
    this.selFlowKey.set(null);
    this.selZone.set(null);
    this.curId.set(null);
    this.seek(0);
  }
  protected setMode(m: Mode) {
    this.mode.set(m);
    if (m !== 'Replay') this.pause();
    else if (this.prog() === 0) this.togglePlay();
  }
  protected toggleKind(k: Kind) {
    this.kinds.update((s) => {
      const n = new Set(s);
      if (n.has(k) && n.size > 1) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  protected pickFlow(key: string) {
    this.selFlowKey.set(this.selFlowKey() === key ? null : key);
    if (this.mode() === 'Replay') this.mode.set('Flows');
  }
  protected zonePick(id: string) {
    const z = this.zones().find((x) => x.id === id);
    if (!z) return;
    this.selZone.set(this.selZone() === id ? null : id);
    const out = this.flows().filter((f) => f.from === z.name).reduce((a, f) => a + f.n, 0);
    const inn = this.flows().filter((f) => f.to === z.name).reduce((a, f) => a + f.n, 0);
    this.toast$(`${z.name}: ${inn} arrivals · ${out} departures (${this.win()})`);
  }
  protected markerPick(id: string) {
    const h = this.hots().find((x) => x.id === id);
    if (h) {
      this.selHot.set(id);
      this.toast$(`${h.name}: ${h.density} p/m² · avg wait ${h.wait} s · ${this.status(id)}`);
    }
  }
  protected replay(id: string) {
    this.curId.set(id);
    this.mode.set('Replay');
    this.seek(0);
    this.togglePlay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected replayFlow() {
    const j = this.flowJourneys()[0];
    if (j) this.replay(j.id);
  }
  protected pickJourney(id: string) {
    this.curId.set(id);
    this.seek(0);
  }
  protected seek(p: number) {
    this.prog.set(Math.max(0, Math.min(1, p)));
  }
  protected togglePlay() {
    if (this.playing()) return this.pause();
    if (this.prog() >= 1) this.prog.set(0);
    this.playing.set(true);
    const step = () => {
      const j = this.cur();
      const inc = j ? (0.6 / Math.max(20, j.distance)) * this.speed() * 4 : 0.02;
      const p = Math.min(1, this.prog() + inc);
      this.prog.set(p);
      if (p >= 1) {
        this.pause();
        if (j) this.toast$(`${j.who} arrived at ${j.stops[j.stops.length - 1].zone} · ${j.distance} m in ${j.duration} min`);
        return;
      }
      this.timer = setTimeout(step, 60);
    };
    this.timer = setTimeout(step, 60);
  }
  private pause() {
    this.playing.set(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  protected dispatch(h: Hot) {
    this.hotStatus.update((s) => ({ ...s, [h.id]: 'Steward on site' }));
    this.store.log({ icon: 'users', color: 'var(--ka-f59e0b)', who: h.name, what: `Floor steward dispatched · ${h.density} p/m²`, floor: this.floor() });
    this.toast$(`Steward dispatched to ${h.name}`);
  }
  protected resolve(h: Hot) {
    this.hotStatus.update((s) => ({ ...s, [h.id]: 'Resolved' }));
    this.store.log({ icon: 'shield-check', color: 'var(--ka-16a34a)', who: h.name, what: 'Congestion cleared', floor: this.floor() });
    this.toast$(`${h.name} marked resolved`);
  }
  protected alert(h: Hot) {
    this.store.raiseAlert({ title: 'Congestion Risk', detail: `${h.density} p/m² · wait ${h.wait} s`, zone: h.zone, floor: this.floor(), x: h.x, y: h.y, severity: 'Medium', icon: 'users' });
    this.hotStatus.update((s) => ({ ...s, [h.id]: 'Congested' }));
    this.toast$(`Alert raised for ${h.name}`);
  }
  protected locate(j: Journey) {
    this.store.focusId.set(j.whoId);
    this.store.floor.set(j.floor);
    this.router.navigateByUrl('/digital-twin/people-asset-location');
  }
  protected act(a: string, r: Journey) {
    if (a === 'replay') return this.replay(r.id);
    if (a === 'locate') return this.locate(r);
    this.exportOne(r);
  }
  protected exportOne(j: Journey) {
    downloadCsv(`${j.id}-path.csv`, [['Journey', 'Person', 'Stop', 'Zone', 'Arrived', 'Dwell (min)'], ...j.stops.map((s, i) => [j.id, j.who, i + 1, s.zone, s.at, s.dwell])]);
    this.toast$(`Exported ${j.id} (${j.stops.length} stops)`);
  }
  protected exportCsv() {
    downloadCsv(`journeys-${this.floor()}.csv`, [['Journey', 'Person', 'ID', 'Type', 'Start', 'From', 'To', 'Stops', 'Distance (m)', 'Duration (min)'], ...this.rows().map((r) => [r.id, r.who, r.whoId, r.kindL, r.startL, r.from, r.to, r.nStops, r.distance, r.duration])]);
    this.toast$(`Exported ${this.rows().length} journeys`);
  }
  protected toast$(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
