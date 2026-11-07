import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapMarker, MapPath, MapZone } from '../rtls/floor-plan';
import { IsoHeat, IsoView } from './iso-view';
import { FloorHeat } from './twin-widgets';
import { FLOORS, floorById, fmtN, HOURLY, JOHN_PATH, M_PER_UNIT, TReport, TScenario, TwinStore, TYPE_COLOR, ZONE_COLOR, ZONE_GROUP } from './twin.data';

const FLOOR_OPTS = FLOORS.filter((f) => f.id !== 'R');
const toast = (sig: ReturnType<typeof signal<string | null>>, m: string) => {
  sig.set(m);
  setTimeout(() => sig.set(null), 2400);
};

/* =====================================================================
   Heatmaps & Analytics
   ===================================================================== */
const HEAT_METRICS = ['People Density', 'Dwell Time', 'Asset Density', 'Temperature'] as const;
@Component({
  selector: 'app-twin-heatmaps-analytics',
  imports: [...UI, IsoView, FloorHeat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Heatmaps & Analytics" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Where people, assets and heat concentrate across floors and through the day.">
      <select class="select" [value]="metric()" (change)="metric.set($any($event.target).value)">@for (m of metrics; track m) {<option>{{ m }}</option>}</select>
      <select class="select" [value]="floor()" (change)="floor.set($any($event.target).value)">@for (f of floors; track f.id) {<option [value]="f.id">{{ f.name }}</option>}</select>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Peak Occupancy" [value]="peak() + ' ppl'" icon="users" color="#7c3aed" sub="at 11:00 AM" />
      <app-kpi label="Avg Dwell Time" value="47 min" icon="activity" color="#2563eb" change="6%" sub="vs. last week" />
      <app-kpi label="Hottest Zone" [value]="hottest().name" icon="map-floor" color="#ef4444" [sub]="hottest().pct + '% of capacity'" subColor="#dc2626" />
      <app-kpi label="Cold Zones (<30%)" [value]="cold()" icon="twin-snow" color="#0ea5e9" sub="consolidation candidates" />
    </section>
    <section class="hm">
      <div class="card">
        <div class="card-head">
          <h3>{{ metric() }} · {{ floorName() }} <span class="card-sub">{{ hourLabel() }}</span></h3>
          <div class="seg"><button [class.on]="view() === '2d'" (click)="view.set('2d')">2D</button><button [class.on]="view() === '3d'" (click)="view.set('3d')">3D</button></div>
        </div>
        @if (view() === '2d') {<app-floor-heat [zones]="zones()" [points]="points()" [height]="420" />}
        @else {<app-iso-view [zones]="zones()" [floor]="floor()" [heat]="isoHeat()" [shirts]="[]" aspect="1000 / 520" />}
        <div class="time">
          <button class="btn-ghost" (click)="togglePlay()"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="15" />{{ playing() ? 'Pause' : 'Play day' }}</button>
          <input type="range" min="6" max="20" [value]="hour()" (input)="hour.set(+$any($event.target).value)" />
          <b>{{ hourLabel() }}</b>
        </div>
      </div>
      <aside class="card">
        <h3>Top Zones by Utilization</h3>
        <app-bar-list [rows]="topZones()" />
        <h3 class="mt">Insights</h3>
        <ul class="ins">
          <li><app-icon name="lightbulb" [size]="15" />{{ hottest().name }} exceeds 85% between 12:00–13:30. Consider staggered lunch.</li>
          <li><app-icon name="lightbulb" [size]="15" />{{ cold() }} zones stay under 30% all day – candidates for hot-desking.</li>
          <li><app-icon name="lightbulb" [size]="15" />Meeting rooms peak at 10:00 and 15:00; 18% of bookings are no-shows.</li>
        </ul>
      </aside>
    </section>
    <section class="two">
      <div class="card"><h3>Zone × Hour Occupancy (%)</h3><app-heatmap [rows]="hmRows()" [cols]="hmCols" [data]="hmData()" /></div>
      <div class="card"><h3>Occupancy through the Day</h3><app-line-chart [labels]="dayLabels" [series]="daySeries()" [height]="240" /></div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .hm { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .two { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; } .two h3, aside h3 { margin-bottom: 10px; } .mt { margin-top: 16px; }
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; } .seg button { border: 0; background: #fff; padding: 6px 14px; cursor: pointer; } .seg button.on { background: var(--primary); color: #fff; }
    .time { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .time input { flex: 1; accent-color: var(--primary); }
    .ins { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .ins li { display: flex; gap: 8px; font-size: 12.5px; background: #faf8ff; padding: 8px; border-radius: 8px; } .ins app-icon { color: #f59e0b; flex-shrink: 0; }
    @media (max-width: 1200px) { .hm, .two { grid-template-columns: 1fr; } }
  `,
})
export class HeatmapsAnalytics {
  private readonly store = inject(TwinStore);
  protected readonly metrics = HEAT_METRICS;
  protected readonly floors = FLOOR_OPTS;
  protected readonly metric = signal<string>('People Density');
  protected readonly floor = signal(this.store.floor() === 'R' ? '4' : this.store.floor());
  protected readonly view = signal<'2d' | '3d'>('2d');
  protected readonly hour = signal(11);
  protected readonly playing = signal(false);
  protected readonly msg = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | undefined;
  protected readonly hmCols = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  protected readonly dayLabels = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  protected readonly floorName = computed(() => floorById(this.floor()).name);
  protected readonly hourLabel = computed(() => `${this.hour() % 12 || 12}:00 ${this.hour() < 12 ? 'AM' : 'PM'}`);
  private readonly factor = computed(() => HOURLY[this.hour()] / 95);
  protected readonly points = computed(() => {
    const f = this.floor();
    const k = this.factor();
    const m = this.metric();
    if (m === 'Temperature') return this.store.sensors().filter((s) => s.floor === f).map((s) => ({ x: s.x, y: s.y, v: s.metric === 'Temperature' ? (this.store.sensorValue(s) - 18) / 10 : 0.2 }));
    if (m === 'Asset Density') return this.store.assets().filter((a) => a.floor === f).map((a) => ({ x: a.x, y: a.y, v: 0.2 }));
    const ppl = this.store.people().filter((p) => p.floor === f);
    return ppl.slice(0, Math.max(3, Math.round(ppl.length * k))).map((p) => ({ x: p.x, y: p.y, v: m === 'Dwell Time' ? (p.mobile ? 0.1 : 0.5) : 0.3 }));
  });
  protected readonly isoHeat = computed<IsoHeat[]>(() =>
    this.zones().filter((z) => z.capacity).map((z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2, r: Math.min(z.w, z.h) * 0.55, v: Math.min(1, (z.occupancy / z.capacity) * this.factor()) })),
  );
  private readonly util = computed(() => this.zones().filter((z) => z.capacity).map((z) => ({ name: z.name, pct: Math.round((z.occupancy / z.capacity) * 100 * Math.min(1.15, this.factor() + 0.1)), z })));
  protected readonly topZones = computed(() => [...this.util()].sort((a, b) => b.pct - a.pct).slice(0, 7).map((u) => ({ label: u.name, value: Math.min(u.pct, 100), display: `${u.pct}%`, color: u.pct > 85 ? '#ef4444' : u.pct > 60 ? '#f59e0b' : '#22c55e' })));
  protected readonly hottest = computed(() => [...this.util()].sort((a, b) => b.pct - a.pct)[0] ?? { name: '—', pct: 0 });
  protected readonly cold = computed(() => this.store.zones().filter((z) => z.capacity && z.occupancy / z.capacity < 0.3).length || 4);
  protected readonly peak = computed(() => this.store.people().filter((p) => p.floor === this.floor()).length);
  protected readonly hmRows = computed(() => this.util().map((u) => u.name.replace('Workstations', 'WS')).slice(0, 9));
  protected readonly hmData = computed(() => this.util().slice(0, 9).map((u, i) => this.hmCols.map((h) => Math.min(100, Math.round((u.pct * HOURLY[+h]) / 92 + ((i * 7 + +h) % 9) - 4)))));
  protected readonly daySeries = computed(() => [
    { name: this.floorName(), color: '#7c3aed', values: this.dayLabels.map((h) => Math.round((this.peak() * HOURLY[+h]) / 95)), area: true },
    { name: 'Last week avg', color: '#94a3b8', values: this.dayLabels.map((h) => Math.round((this.peak() * HOURLY[+h] * 0.92) / 95)), dashed: true },
  ]);
  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }
  protected togglePlay() {
    if (this.playing()) {
      clearInterval(this.timer);
      return this.playing.set(false);
    }
    this.playing.set(true);
    if (this.hour() >= 20) this.hour.set(6);
    this.timer = setInterval(() => {
      if (this.hour() >= 20) {
        clearInterval(this.timer);
        this.playing.set(false);
      } else this.hour.update((h) => h + 1);
    }, 700);
  }
  protected exportCsv() {
    downloadCsv(`heatmap-${this.floor()}.csv`, [['Zone', ...this.hmCols], ...this.hmRows().map((r, i) => [r, ...this.hmData()[i]])]);
  }
}

/* =====================================================================
   Path & Movement Analysis
   ===================================================================== */
interface Subject { id: string; name: string; kind: string; color: string; path: [number, number][]; stops: { zone: string; in: string; out: string; dwell: number }[] }
const SUBJECTS: Subject[] = [
  { id: 'P-1001', name: 'John Mathew (Employee)', kind: 'employee', color: TYPE_COLOR.employee, path: JOHN_PATH, stops: [
    { zone: 'Reception', in: '08:58', out: '09:04', dwell: 6 }, { zone: 'Lift Core', in: '09:05', out: '09:07', dwell: 2 }, { zone: 'Collaboration Area', in: '09:08', out: '09:40', dwell: 32 }, { zone: 'Open Workstations North', in: '09:42', out: 'now', dwell: 40 }] },
  { id: 'V-102', name: 'Visitor - V102', kind: 'visitor', color: TYPE_COLOR.visitor, path: [[176, 470], [240, 400], [300, 330], [280, 240], [236, 196]], stops: [
    { zone: 'Reception', in: '09:50', out: '10:05', dwell: 15 }, { zone: 'Lift Core', in: '10:06', out: '10:08', dwell: 2 }, { zone: 'Meeting Rooms', in: '10:18', out: 'now', dwell: 14 }] },
  { id: 'Forklift-01', name: 'Forklift-01 (Asset)', kind: 'asset', color: '#7c3aed', path: [[690, 520], [700, 450], [800, 430], [930, 450], [930, 510], [805, 470]], stops: [
    { zone: 'Storage – Bay A', in: '09:30', out: '09:52', dwell: 22 }, { zone: 'Storage – Bay C', in: '09:55', out: '10:12', dwell: 17 }, { zone: 'Storage', in: '10:15', out: 'now', dwell: 9 }] },
  { id: 'C-2201', name: 'Ravi Kumar (Contractor)', kind: 'contractor', color: TYPE_COLOR.contractor, path: [[176, 470], [300, 395], [372, 398], [700, 300], [790, 300], [700, 300], [372, 398]], stops: [
    { zone: 'Reception', in: '10:02', out: '10:06', dwell: 4 }, { zone: 'Server Room', in: '10:14', out: '10:31', dwell: 17 }, { zone: 'Workstations South', in: '10:33', out: 'now', dwell: 6 }] },
];
@Component({
  selector: 'app-twin-path-movement-analysis',
  imports: [...UI, FloorPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Path & Movement Analysis" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Replay how people and assets move through the building, where they stop and which routes are most used.">
      <select class="select" [value]="subjId()" (change)="pick($any($event.target).value)">@for (s of subjects; track s.id) {<option [value]="s.id">{{ s.name }}</option>}</select>
      <button class="btn-ghost" [class.on]="flows()" (click)="flows.set(!flows())"><app-icon name="twin-route" [size]="16" />{{ flows() ? 'Hide' : 'Show' }} common routes</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Distance Covered" [value]="dist() + ' m'" icon="twin-route" color="#7c3aed" />
      <app-kpi label="Stops" [value]="subj().stops.length" icon="map-pin" color="#2563eb" />
      <app-kpi label="Avg Dwell" [value]="avgDwell() + ' min'" icon="clock" color="#16a34a" />
      <app-kpi label="Zone Transitions Today" value="3,482" icon="activity" color="#f59e0b" change="9%" sub="vs. last week" />
    </section>
    <section class="pm">
      <div class="card">
        <div class="card-head"><h3>Floor 4 · {{ subj().name }}</h3><span class="card-sub">Replay {{ Math.round(progress() * 100) }}%</span></div>
        <app-floor-plan [zones]="mapZones()" [paths]="paths()" [markers]="markers()" [height]="430" [seed]="4" />
        <div class="time">
          <button class="btn-primary" (click)="toggle()"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="15" />{{ playing() ? 'Pause' : 'Replay' }}</button>
          <input type="range" min="0" max="100" [value]="progress() * 100" (input)="progress.set(+$any($event.target).value / 100)" />
          <select class="select" [value]="speed()" (change)="speed.set(+$any($event.target).value)"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </div>
      </div>
      <aside class="card">
        <h3>Stops &amp; Dwell</h3>
        <table class="table"><thead><tr><th>Zone</th><th>In</th><th>Out</th><th class="num">Dwell</th></tr></thead>
          <tbody>@for (s of subj().stops; track $index) {<tr [class.cur]="$index === curStop()"><td>{{ s.zone }}</td><td>{{ s.in }}</td><td>{{ s.out }}</td><td class="num">{{ s.dwell }}m</td></tr>}</tbody></table>
        <h3 class="mt">Top Zone-to-Zone Flows</h3>
        <app-bar-list [rows]="flowRows" [max]="900" />
      </aside>
    </section>
  `,
  styles: `
    .pm { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; align-items: start; } aside h3 { margin-bottom: 8px; } .mt { margin-top: 16px; }
    .time { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .time input { flex: 1; accent-color: var(--primary); }
    tr.cur td { background: #f1ecff; font-weight: 600; } .btn-ghost.on { color: var(--primary); border-color: var(--primary); }
    @media (max-width: 1200px) { .pm { grid-template-columns: 1fr; } }
  `,
})
export class PathMovementAnalysis {
  private readonly store = inject(TwinStore);
  protected readonly Math = Math;
  protected readonly subjects = SUBJECTS;
  protected readonly subjId = signal('P-1001');
  protected readonly progress = signal(1);
  protected readonly playing = signal(false);
  protected readonly speed = signal(1);
  protected readonly flows = signal(false);
  private timer: ReturnType<typeof setInterval> | undefined;
  protected readonly subj = computed(() => SUBJECTS.find((s) => s.id === this.subjId())!);
  protected readonly flowRows = [
    { label: 'Reception → Lift Core', value: 842, display: '842' }, { label: 'Lift Core → Workstations N', value: 611, display: '611' },
    { label: 'Workstations → Cafeteria', value: 538, display: '538' }, { label: 'Workstations → Meeting Rooms', value: 402, display: '402' },
    { label: 'Collaboration → Cafeteria', value: 236, display: '236' },
  ];
  protected readonly mapZones = computed<MapZone[]>(() => this.store.floorZones('4').map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: ZONE_COLOR[ZONE_GROUP[z.type]], fill: 0.1 })));
  private readonly segLens = computed(() => {
    const p = this.subj().path;
    return p.slice(1).map((q, i) => Math.hypot(q[0] - p[i][0], q[1] - p[i][1]));
  });
  protected readonly dist = computed(() => Math.round(this.segLens().reduce((a, b) => a + b, 0) * M_PER_UNIT * 3.2));
  protected readonly avgDwell = computed(() => Math.round(this.subj().stops.reduce((a, s) => a + s.dwell, 0) / this.subj().stops.length));
  private readonly at = computed<[number, number]>(() => {
    const p = this.subj().path;
    const L = this.segLens();
    let d = L.reduce((a, b) => a + b, 0) * this.progress();
    for (let i = 0; i < L.length; i++) {
      if (d <= L[i]) {
        const t = L[i] ? d / L[i] : 0;
        return [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t];
      }
      d -= L[i];
    }
    return p[p.length - 1];
  });
  protected readonly curStop = computed(() => Math.min(this.subj().stops.length - 1, Math.floor(this.progress() * this.subj().stops.length)));
  protected readonly paths = computed<MapPath[]>(() => {
    const s = this.subj();
    const L = this.segLens();
    let d = L.reduce((a, b) => a + b, 0) * this.progress();
    const done: [number, number][] = [s.path[0]];
    for (let i = 0; i < L.length && d > 0; i++) {
      if (d >= L[i]) done.push(s.path[i + 1]);
      else done.push(this.at());
      d -= L[i];
    }
    const out: MapPath[] = [{ points: s.path, color: '#cbd5e1', dashed: true, width: 3 }, { points: done, color: s.color, arrow: true, width: 4 }];
    if (this.flows()) out.unshift({ points: [[176, 470], [300, 395], [480, 215]], color: '#f59e0b', width: 14 }, { points: [[480, 215], [700, 120]], color: '#f59e0b', width: 10 }, { points: [[480, 215], [175, 130]], color: '#f59e0b', width: 7 });
    return out;
  });
  protected readonly markers = computed<MapMarker[]>(() => {
    const s = this.subj();
    const [x, y] = this.at();
    return [...s.path.filter((_, i) => i > 0 && i < s.path.length - 1).map((p, i) => ({ id: 'n' + i, x: p[0], y: p[1], color: '#94a3b8', kind: 'dot' as const, size: 5 })), { id: s.id, x, y, color: s.color, kind: 'icon' as const, icon: s.kind === 'asset' ? 'twin-forklift' : 'user', pulse: this.playing(), title: s.name }];
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }
  protected pick(id: string) {
    this.subjId.set(id);
    this.progress.set(0);
    this.toggle(true);
  }
  protected toggle(force = false) {
    clearInterval(this.timer);
    if (this.playing() && !force) return this.playing.set(false);
    if (this.progress() >= 1) this.progress.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      const n = Math.min(1, this.progress() + 0.01 * this.speed());
      this.progress.set(n);
      if (n >= 1) {
        clearInterval(this.timer);
        this.playing.set(false);
      }
    }, 60);
  }
  protected exportCsv() {
    downloadCsv(`path-${this.subjId()}.csv`, [['Zone', 'In', 'Out', 'Dwell (min)'], ...this.subj().stops.map((s) => [s.zone, s.in, s.out, s.dwell])]);
  }
}

/* =====================================================================
   Scenario Simulation (what-if)
   ===================================================================== */
interface Inputs { occupancy: number; blockedExits: number; hvacSetpoint: number; outsideTemp: number; shift: string; townHall: boolean }
function simulate(i: Inputs) {
  const evacMin = +(3.4 + i.occupancy * 0.04 + i.blockedExits * 1.6 + (i.townHall ? 0.9 : 0) + (i.shift === 'Compressed (4-day)' ? 0.4 : 0)).toFixed(1);
  const energyKwh = Math.round(4820 * (1 + (23 - i.hvacSetpoint) * 0.07) * (0.72 + (0.28 * i.occupancy) / 68) * (1 + (i.outsideTemp - 38) * 0.015) * (i.shift === 'Staggered' ? 1.06 : 1));
  const comfort = Math.max(0, Math.min(100, Math.round(100 - Math.abs(i.hvacSetpoint - 22.5) * 6 - Math.max(0, i.occupancy - 80) * 0.5 - Math.max(0, i.outsideTemp - 42) * 0.8)));
  const congestion = Math.round(i.occupancy / 25 + i.blockedExits * 2 + (i.townHall ? 2 : 0));
  return { evacMin, energyKwh, comfort, congestion, people: Math.round((428 * i.occupancy) / 68) };
}
const BASE: Inputs = { occupancy: 68, blockedExits: 0, hvacSetpoint: 23, outsideTemp: 38, shift: 'Standard', townHall: false };
@Component({
  selector: 'app-twin-scenario-simulation',
  imports: [...UI, IsoView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Scenario Simulation" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Run what-if scenarios on the digital twin: occupancy, evacuation and HVAC – before changing the real building.">
      <button class="btn-ghost" (click)="reset()"><app-icon name="refresh" [size]="16" />Reset to baseline</button>
      <button class="btn-primary" (click)="run()" [disabled]="running()"><app-icon name="play" [size]="16" />{{ running() ? 'Simulating… ' + runPct() + '%' : 'Run Simulation' }}</button>
    </app-page-head>
    <section class="ss">
      <aside class="card ctl">
        <h3>Scenario Inputs</h3>
        <label>Building occupancy <b>{{ inp().occupancy }}% · {{ fmt(sim().people) }} people</b><input type="range" min="10" max="120" [value]="inp().occupancy" (input)="set('occupancy', +$any($event.target).value)" /></label>
        <label>Blocked exits / stairs <b>{{ inp().blockedExits }}</b><input type="range" min="0" max="3" [value]="inp().blockedExits" (input)="set('blockedExits', +$any($event.target).value)" /></label>
        <label>HVAC setpoint <b>{{ inp().hvacSetpoint }}°C</b><input type="range" min="19" max="27" step="0.5" [value]="inp().hvacSetpoint" (input)="set('hvacSetpoint', +$any($event.target).value)" /></label>
        <label>Outside temperature <b>{{ inp().outsideTemp }}°C</b><input type="range" min="20" max="48" [value]="inp().outsideTemp" (input)="set('outsideTemp', +$any($event.target).value)" /></label>
        <label>Shift pattern<select class="select" [value]="inp().shift" (change)="set('shift', $any($event.target).value)"><option>Standard</option><option>Staggered</option><option>Compressed (4-day)</option></select></label>
        <label class="chk"><input type="checkbox" [checked]="inp().townHall" (change)="set('townHall', $any($event.target).checked)" />Town hall event on Floor 1</label>
        <div class="save"><input class="input" placeholder="Scenario name" [value]="name()" (input)="name.set($any($event.target).value)" /><button class="btn-ghost" (click)="save()"><app-icon name="twin-save" [size]="15" />Save</button></div>
      </aside>
      <div class="res">
        <div class="tiles">
          @for (t of tiles(); track t.label) {
            <div class="card tile" [class.stale]="stale()"><small>{{ t.label }}</small><b [style.color]="t.bad ? '#dc2626' : null">{{ t.value }}</b><em [class]="t.delta.startsWith('+') === t.upBad && t.delta !== '±0' ? 'bad-t' : 'good-t'">{{ t.delta }} vs baseline</em></div>
          }
        </div>
        <div class="card">
          <div class="card-head"><h3>Congestion & Evacuation Routes · Floor 4</h3><span class="card-sub">{{ stale() ? 'inputs changed – run simulation to refresh' : 'simulated' }}</span></div>
          <app-iso-view [zones]="zones()" floor="4" [heat]="heat()" [paths]="routes()" [glows]="blockedGlows()" [shirts]="[]" aspect="1000 / 480" />
        </div>
        <div class="two">
          <div class="card"><h3>Evacuation Curve (people remaining)</h3><app-line-chart [labels]="evacLabels" [series]="evacSeries()" [height]="200" /></div>
          <div class="card"><h3>HVAC Energy by Hour (kWh)</h3><app-column-chart [labels]="hrs" [series]="energySeries()" [height]="200" /></div>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Saved Scenarios</h3></div>
      <table class="table"><thead><tr><th>Scenario</th><th class="num">Occupancy</th><th class="num">Blocked exits</th><th class="num">Setpoint</th><th class="num">Evac (min)</th><th class="num">Energy (kWh)</th><th class="num">Comfort</th><th>Created</th><th></th></tr></thead>
        <tbody>@for (s of store.scenarios(); track s.id) {
          <tr><td><b>{{ s.name }}</b></td><td class="num">{{ s.occupancy }}%</td><td class="num">{{ s.blockedExits }}</td><td class="num">{{ s.hvacSetpoint }}°C</td><td class="num" [class.bad]="s.evacMin > 8">{{ s.evacMin }}</td><td class="num">{{ fmt(s.energyKwh) }}</td><td class="num">{{ s.comfort }}</td><td>{{ s.created }} · {{ s.by }}</td>
            <td class="acts"><button class="link" (click)="load(s)">Load</button><button class="link danger" (click)="remove(s)">Delete</button></td></tr>
        }</tbody></table>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .ss { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .ctl { display: flex; flex-direction: column; gap: 14px; } .ctl label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #4b4f6b; } .ctl label b { color: var(--text); float: right; } .ctl input[type=range] { accent-color: var(--primary); }
    .chk { flex-direction: row !important; align-items: center; } .save { display: flex; gap: 6px; } .save .input { flex: 1; min-width: 0; }
    .res { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .tile { display: flex; flex-direction: column; gap: 4px; transition: opacity .2s; } .tile.stale { opacity: .55; } .tile small { color: #3b3f5c; } .tile b { font-size: 24px; } .tile em { font-style: normal; font-size: 12px; font-weight: 600; }
    .good-t { color: #16a34a; } .bad-t { color: #dc2626; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .two h3 { margin-bottom: 8px; }
    .acts { display: flex; gap: 10px; } .danger { color: var(--red); } td.bad { color: #dc2626; font-weight: 600; }
    @media (max-width: 1200px) { .ss, .two { grid-template-columns: 1fr; } .tiles { grid-template-columns: 1fr 1fr; } }
  `,
})
export class ScenarioSimulation {
  protected readonly store = inject(TwinStore);
  protected readonly fmt = fmtN;
  protected readonly inp = signal<Inputs>({ ...BASE });
  protected readonly applied = signal<Inputs>({ ...BASE });
  protected readonly running = signal(false);
  protected readonly runPct = signal(0);
  protected readonly name = signal('');
  protected readonly msg = signal<string | null>(null);
  protected readonly evacLabels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  protected readonly hrs = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  protected readonly zones = computed(() => this.store.floorZones('4'));
  protected readonly stale = computed(() => JSON.stringify(this.inp()) !== JSON.stringify(this.applied()));
  protected readonly sim = computed(() => simulate(this.applied()));
  private readonly base = simulate(BASE);
  protected readonly tiles = computed(() => {
    const s = this.sim();
    const b = this.base;
    const d = (v: number, w: number, u = '') => (v === w ? '±0' : `${v > w ? '+' : '−'}${Math.abs(+(v - w).toFixed(1))}${u}`);
    return [
      { label: 'Evacuation Time', value: `${s.evacMin} min`, delta: d(s.evacMin, b.evacMin, ' min'), upBad: true, bad: s.evacMin > 8 },
      { label: 'HVAC Energy / day', value: `${fmtN(s.energyKwh)} kWh`, delta: d(s.energyKwh, b.energyKwh), upBad: true, bad: false },
      { label: 'Comfort Index', value: `${s.comfort}/100`, delta: d(s.comfort, b.comfort), upBad: false, bad: s.comfort < 70 },
      { label: 'Congestion Hotspots', value: `${s.congestion}`, delta: d(s.congestion, b.congestion), upBad: true, bad: s.congestion > 5 },
    ];
  });
  protected readonly heat = computed<IsoHeat[]>(() => {
    const a = this.applied();
    const k = a.occupancy / 100;
    const hs: IsoHeat[] = [{ x: 300, y: 380, r: 90, v: Math.min(1, k * 0.9 + a.blockedExits * 0.15) }, { x: 805, y: 115, r: 110, v: Math.min(1, k) }, { x: 480, y: 115, r: 100, v: k * 0.8 }, { x: 175, y: 470, r: 90, v: Math.min(1, k * 0.6 + a.blockedExits * 0.2) }];
    return hs;
  });
  protected readonly routes = computed(() => {
    const b = this.applied().blockedExits;
    const r = [{ points: [[480, 115], [480, 230], [300, 395], [60, 520]] as [number, number][], color: '#16a34a', dots: true }, { points: [[805, 115], [700, 210], [700, 400], [960, 530]] as [number, number][], color: '#16a34a', dots: true }];
    if (b >= 1) r[1].color = '#ef4444';
    if (b >= 2) r[0].color = '#ef4444';
    return r;
  });
  protected readonly blockedGlows = computed(() => [[960, 530], [60, 520], [960, 30]].slice(0, this.applied().blockedExits).map(([x, y]) => ({ x, y, r: 60, color: '#ef4444' })));
  protected readonly evacSeries = computed(() => {
    const curve = (m: number, n: number) => this.evacLabels.map((t) => Math.max(0, Math.round(n * (1 - Math.min(1, (+t / m) ** 1.3)))));
    return [{ name: 'Scenario', color: '#ef4444', values: curve(this.sim().evacMin, this.sim().people), area: true }, { name: 'Baseline', color: '#94a3b8', values: curve(this.base.evacMin, this.base.people), dashed: true }];
  });
  protected readonly energySeries = computed(() => {
    const prof = [0.5, 0.8, 1, 1.05, 1.1, 1.15, 1.2, 1.2, 1.1, 1, 0.8, 0.5];
    const tot = prof.reduce((a, b) => a + b, 0);
    return [{ name: 'Baseline', color: '#c4b5fd', values: prof.map((p) => Math.round((this.base.energyKwh * p) / tot)) }, { name: 'Scenario', color: '#7c3aed', values: prof.map((p) => Math.round((this.sim().energyKwh * p) / tot)) }];
  });
  protected set<K extends keyof Inputs>(k: K, v: Inputs[K]) {
    this.inp.update((i) => ({ ...i, [k]: v }));
  }
  protected run() {
    this.running.set(true);
    this.runPct.set(0);
    const t = setInterval(() => {
      this.runPct.update((p) => p + 20);
      if (this.runPct() >= 100) {
        clearInterval(t);
        this.applied.set({ ...this.inp() });
        this.running.set(false);
        toast(this.msg, `Simulation complete · ${fmtN(this.sim().people)} agents, evacuation ${this.sim().evacMin} min`);
      }
    }, 250);
  }
  protected reset() {
    this.inp.set({ ...BASE });
    this.applied.set({ ...BASE });
  }
  protected save() {
    if (this.stale()) return toast(this.msg, 'Run the simulation before saving');
    const s = this.sim();
    const a = this.applied();
    const sc: TScenario = { id: `SC-${Date.now()}`, name: this.name().trim() || `Scenario ${this.store.scenarios().length + 1}`, occupancy: a.occupancy, blockedExits: a.blockedExits, hvacSetpoint: a.hvacSetpoint, outsideTemp: a.outsideTemp, shift: a.shift, evacMin: s.evacMin, energyKwh: s.energyKwh, comfort: s.comfort, congestion: s.congestion, created: '06 Nov 2026', by: 'Rex Kumar' };
    this.store.scenarios.update((l) => [sc, ...l]);
    this.store.log({ icon: 'twin-sparkles', color: '#7c3aed', who: sc.name, what: 'Scenario saved' });
    this.name.set('');
    toast(this.msg, `${sc.name} saved · available in Reports & Insights`);
  }
  protected load(s: TScenario) {
    const i: Inputs = { occupancy: s.occupancy, blockedExits: s.blockedExits, hvacSetpoint: s.hvacSetpoint, outsideTemp: s.outsideTemp, shift: s.shift, townHall: s.name.includes('Town Hall') };
    this.inp.set(i);
    this.applied.set({ ...i });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected remove(s: TScenario) {
    this.store.scenarios.update((l) => l.filter((x) => x.id !== s.id));
  }
}

/* =====================================================================
   Reports & Insights
   ===================================================================== */
interface Insight { id: number; title: string; text: string; impact: string; icon: string; color: string; link: string }
const INSIGHTS: Insight[] = [
  { id: 1, title: 'Executive Suite under-utilized', text: 'Floor 5 Executive Suite averaged 31% utilization over 6 weeks. Consolidating into Floor 4 frees 420 m².', impact: 'AED 186K / yr', icon: 'map-floor', color: '#7c3aed', link: 'space-zone-management' },
  { id: 2, title: 'Server Room cooling risk', text: 'Server Room (F4) temperature trend +1.2°C / 10 min; CRAC-2 compressor fault likely. Pre-emptive service recommended.', impact: 'High risk', icon: 'twin-thermo', color: '#ef4444', link: 'sensor-iot-visualization' },
  { id: 3, title: 'Meeting room no-shows', text: '18% of meeting room bookings on Floor 4 are no-shows. Auto-release after 10 min would recover ~46 hours/week.', impact: '46 h / week', icon: 'calendar-days', color: '#2563eb', link: 'heatmaps-analytics' },
  { id: 4, title: 'Cafeteria peak congestion', text: 'Cafeteria reaches 118% at 12:30. Staggered lunch (12:00/12:45) simulated to cut peak by 27%.', impact: '−27% peak', icon: 'users', color: '#f59e0b', link: 'scenario-simulation' },
  { id: 5, title: 'HVAC setpoint optimization', text: 'Raising setpoint 23→24°C on low-occupancy floors (G, 5) saves 7% energy with comfort ≥ 84.', impact: '−7% kWh', icon: 'twin-zap', color: '#16a34a', link: 'scenario-simulation' },
];
@Component({
  selector: 'app-twin-reports-insights',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Insights" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Space, occupancy, asset and environmental reports from the digital twin with AI-generated recommendations.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />New Report</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Reports this Month" [value]="18 + extra()" icon="file-chart" color="#7c3aed" change="12%" sub="vs. last month" />
      <app-kpi label="Scheduled Reports" [value]="scheduled()" icon="calendar-days" color="#2563eb" />
      <app-kpi label="Open Insights" [value]="insights().length" icon="lightbulb" color="#f59e0b" />
      <app-kpi label="Savings Identified" value="AED 412K" icon="trending-up" color="#16a34a" sub="annualized" />
      <app-kpi label="Saved Scenarios" [value]="store.scenarios().length" icon="twin-sparkles" color="#db2777" sub="from Scenario Simulation" />
    </section>
    <section class="ri">
      <div class="card">
        <div class="card-head"><h3>AI Insights &amp; Recommendations</h3><span class="card-sub">updated 10:20 AM</span></div>
        <ul class="ins">
          @for (i of insights(); track i.id) {
            <li><span class="ic" [style.background]="i.color"><app-icon [name]="i.icon" [size]="18" /></span>
              <div><b>{{ i.title }}</b><p>{{ i.text }}</p>
                <div class="ia"><span class="tag">{{ i.impact }}</span><button class="link" (click)="go(i.link)">Investigate</button><button class="link" (click)="task(i)">Create task</button><button class="link muted" (click)="dismiss(i)">Dismiss</button></div></div></li>
          } @empty {<li class="muted">All insights handled.</li>}
        </ul>
      </div>
      <div class="charts">
        <div class="card"><h3>Utilization Trend by Floor (12 weeks)</h3><app-line-chart [labels]="weeks" [series]="trend" [height]="210" suffix="%" /></div>
        <div class="card"><h3>Occupancy vs Energy (last 7 days)</h3><app-column-chart [labels]="days" [series]="energy" [height]="200" /></div>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Report Library</h3>
        <div class="cats">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div></div>
      <table class="table"><thead><tr><th>Report</th><th>Category</th><th>Schedule</th><th>Format</th><th>Last run</th><th>Owner</th><th>Status</th><th></th></tr></thead>
        <tbody>@for (r of list(); track r.id) {
          <tr><td><b>{{ r.name }}</b></td><td>{{ r.category }}</td><td>{{ r.schedule }}</td><td>{{ r.format }}</td><td>{{ r.last }}</td><td>{{ r.owner }}</td>
            <td><span [class]="r.status === 'Ready' ? 'tag green' : r.status === 'Generating' ? 'tag amber' : 'tag blue'">{{ r.status }}</span></td>
            <td class="acts"><button class="link" (click)="runR(r)" [disabled]="r.status === 'Generating'">Run now</button><button class="link" (click)="download(r)">Download</button></td></tr>
        }</tbody></table>
    </section>
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>New Report</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report name *<input class="input" required [value]="f.name" (input)="f.name = $any($event.target).value" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="f.category = $any($event.target).value">@for (c of cats.slice(1); track c) {<option>{{ c }}</option>}</select></label>
          <label>Format<select class="select" [value]="f.format" (change)="f.format = $any($event.target).value"><option>PDF</option><option>Excel</option><option>CSV</option></select></label>
          <label class="full">Schedule<select class="select" [value]="f.schedule" (change)="f.schedule = $any($event.target).value"><option>On demand</option><option>Daily · 18:00</option><option>Weekly · Mon 08:00</option><option>Monthly · 1st</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Create</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .ri { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .charts { display: flex; flex-direction: column; gap: 12px; } .charts h3 { margin-bottom: 8px; }
    .ins { list-style: none; margin: 0; padding: 0; } .ins li { display: grid; grid-template-columns: 38px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f1f6; }
    .ic { width: 38px; height: 38px; border-radius: 10px; color: #fff; display: grid; place-items: center; } .ins p { margin: 3px 0 6px; font-size: 12.5px; color: #4b4f6b; } .ia { display: flex; gap: 12px; align-items: center; }
    .cats { display: flex; gap: 4px; flex-wrap: wrap; } .cats button { border: 1px solid var(--border); background: #fff; border-radius: 14px; padding: 4px 10px; font-size: 12px; cursor: pointer; } .cats button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .acts { display: flex; gap: 10px; }
    @media (max-width: 1200px) { .ri { grid-template-columns: 1fr; } }
  `,
})
export class TwinReportsInsights {
  protected readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  protected readonly cats = ['All', 'Space', 'Occupancy', 'Assets', 'Sensors', 'Movement', 'Energy'];
  protected readonly cat = signal('All');
  protected readonly insights = signal(INSIGHTS);
  protected readonly extra = signal(0);
  protected readonly form = signal<{ name: string; category: string; format: string; schedule: string } | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly list = computed(() => this.store.reports().filter((r) => this.cat() === 'All' || r.category === this.cat()));
  protected readonly scheduled = computed(() => this.store.reports().filter((r) => r.schedule !== 'On demand').length);
  protected readonly weeks = Array.from({ length: 12 }, (_, i) => `W${i + 31}`);
  protected readonly trend = [
    { name: 'Floor 4', color: '#7c3aed', values: [58, 60, 61, 63, 62, 64, 66, 65, 67, 66, 68, 68] },
    { name: 'Floor 2', color: '#2563eb', values: [65, 66, 68, 67, 69, 70, 69, 71, 72, 70, 71, 71] },
    { name: 'Floor 5', color: '#f59e0b', values: [41, 40, 38, 37, 39, 36, 35, 34, 33, 32, 31, 31] },
  ];
  protected readonly days = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
  protected readonly energy = [
    { name: 'Avg occupancy (people)', color: '#c4b5fd', values: [402, 371, 64, 41, 418, 428, 415] },
    { name: 'HVAC energy (MWh ×100)', color: '#16a34a', values: [482, 470, 260, 240, 489, 496, 486], line: true },
  ];
  protected go(slug: string) {
    this.router.navigateByUrl(`/digital-twin/${slug}`);
  }
  protected task(i: Insight) {
    this.store.log({ icon: 'lightbulb', color: i.color, who: 'Task created', what: i.title });
    this.insights.update((l) => l.filter((x) => x.id !== i.id));
    toast(this.msg, `Task created for Facilities: ${i.title}`);
  }
  protected dismiss(i: Insight) {
    this.insights.update((l) => l.filter((x) => x.id !== i.id));
  }
  protected openForm() {
    this.form.set({ name: '', category: 'Space', format: 'PDF', schedule: 'On demand' });
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim()) return;
    const r: TReport = { id: `R-${Date.now()}`, name: f.name, category: f.category, schedule: f.schedule, format: f.format, last: '—', owner: 'Rex Kumar', status: f.schedule === 'On demand' ? 'Ready' : 'Scheduled' };
    this.store.reports.update((l) => [r, ...l]);
    this.form.set(null);
    toast(this.msg, `${r.name} created`);
  }
  protected runR(r: TReport) {
    const patch = (ch: Partial<TReport>) => this.store.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, ...ch } : x)));
    patch({ status: 'Generating' });
    setTimeout(() => {
      patch({ status: 'Ready', last: '06 Nov 2026' });
      this.extra.update((n) => n + 1);
      toast(this.msg, `${r.name} is ready`);
    }, 1800);
  }
  protected download(r: TReport) {
    const z = this.store.zones();
    downloadCsv(`${r.name.toLowerCase().replace(/\W+/g, '-')}.csv`, [['Floor', 'Zone', 'Capacity', 'Occupied', 'Utilization %'], ...z.filter((x) => x.capacity).map((x) => [floorById(x.floor).name, x.name, x.capacity, x.occupancy, Math.round((x.occupancy / x.capacity) * 100)])]);
  }
}
