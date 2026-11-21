// Heatmaps & Analytics — occupancy / dwell / temperature / CO₂ heat layers with time playback and hotspot ranking.
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { IsoGlow, IsoHeat, IsoMarker, IsoView } from './iso-view';
import { center, DAY_FACTOR, DAYS, FLOOR_TABS, fmtMetric, HEAT_METRICS, heatZones, HeatMetric, HOURS, METRIC_RANGE, METRIC_THRESHOLD, METRIC_UNIT, metricK, PERIOD_FACTOR, zoneMetric, zoneUtil } from './twin-analytics';
import { FloorHeat, heatColor } from './twin-widgets';
import { floorById, rng, TwinStore, TZone } from './twin.data';

const PLAY_FROM = 6;
const PLAY_TO = 22;

@Component({
  selector: 'app-twin-heatmaps-analytics',
  imports: [...UI, IsoView, FloorHeat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Heatmaps & Analytics" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Play back occupancy, dwell time and environmental heat layers across every floor and find the hotspots.">
      <div class="tabs">@for (p of periods; track p) {<button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>}</div>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Peak Occupancy" [value]="peak().value + '%'" icon="users" color="var(--ka-7c3aed)" [sub]="'at ' + hours[peak().hour] + ' · ' + floorName()" />
      <app-kpi label="Avg Dwell Time" [value]="avgDwell() + ' min'" icon="clock" color="var(--ka-2563eb)" change="6%" sub="vs. last week" />
      <app-kpi label="Hotspots" [value]="hot().length" icon="flame" color="var(--ka-ef4444)" [sub]="'above ' + threshold() + unit() + ' at ' + hours[hour()]" subColor="var(--ka-dc2626)" />
      <app-kpi label="Under-used Zones" [value]="under()" icon="trending-up" color="var(--ka-f59e0b)" sub="below 30% utilization" />
      <app-kpi label="Avg Temperature" [value]="avgTemp() + '°C'" icon="twin-thermo" color="var(--ka-0ea5e9)" sub="comfort band 21–25°C" />
    </section>

    <section class="hm">
      <div class="card">
        <div class="card-head">
          <div class="ftabs">@for (f of floorTabs; track f.id) {<button [class.on]="floor() === f.id" (click)="setFloor(f.id)">{{ f.name }}</button>}</div>
          <div class="tabs">@for (m of metrics; track m) {<button [class.on]="metric() === m" (click)="setMetric(m)">{{ m }}</button>}</div>
          <div class="tabs">
            <button [class.on]="mode() === '3d'" (click)="mode.set('3d')">3D</button><button [class.on]="mode() === '2d'" (click)="mode.set('2d')">2D</button>
          </div>
        </div>
        <div class="stage">
          @if (mode() === '3d') {
            <app-iso-view [zones]="zones()" [floor]="floor()" [heat]="heat()" [markers]="markers()" [glows]="glows()" [selectedZone]="selId()" [shirts]="[]" [zoneLabels]="false" aspect="1000 / 520" (markerClick)="selId.set($event)" (zoneClick)="selId.set($event)" />
          } @else {
            <app-floor-heat [zones]="zones()" [points]="points()" [height]="440" [legend]="false" (pick)="toast$('Switch to 3D to pick zones')" />
          }
          <div class="scale"><b>{{ metric() }}</b><span>{{ range()[1] }}{{ unit() }}</span><i></i><span>{{ range()[0] }}{{ unit() }}</span></div>
        </div>

        <div class="player">
          <button class="pl" (click)="toggle()" [title]="playing() ? 'Pause' : 'Play'"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="18" /></button>
          <div class="tl">
            <svg viewBox="0 0 480 46" preserveAspectRatio="none" (click)="scrub($event)">
              <path [attr.d]="curve().area" fill="var(--ka-ede9fe)" />
              <path [attr.d]="curve().line" fill="none" stroke="var(--kl-7c3aed)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
              <line [attr.x1]="hour() * 20 + 10" [attr.x2]="hour() * 20 + 10" y1="0" y2="46" stroke="var(--kl-ef4444)" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
            <input type="range" min="0" max="23" [value]="hour()" (input)="hour.set(+$any($event.target).value)" />
            <div class="ticks">@for (h of tickHours; track h) {<span>{{ hours[h] }}</span>}</div>
          </div>
          <div class="now"><b>{{ hours[hour()] }}</b><small>{{ period() }} · {{ floorTotal() }} people</small></div>
          <div class="tabs sp">@for (s of speeds; track s) {<button [class.on]="speed() === s" (click)="speed.set(s)">{{ s }}×</button>}</div>
        </div>
      </div>

      <aside class="card side">
        @if (sel(); as z) {
          <div class="zh"><span class="sw" [style.background]="heatColor(selK())"></span><div><h3>{{ z.name }}</h3><small class="muted">{{ floorName() }} · {{ z.capacity }} seats</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="big"><b [style.color]="heatColor(selK())">{{ fmt(selVal()) }}</b><span>{{ metric() }} at {{ hours[hour()] }}</span></div>
          <dl class="facts">
            <dt>Daily peak</dt><dd>{{ fmt(selPeak().v) }} at {{ hours[selPeak().h] }}</dd>
            <dt>Occupancy</dt><dd>{{ util(z) }}% ({{ heads(z) }} / {{ z.capacity }})</dd>
            <dt>Threshold</dt><dd>{{ threshold() }}{{ unit() }} <span [class]="selVal() >= threshold() ? 'tag red' : 'tag green'">{{ selVal() >= threshold() ? 'Hotspot' : 'Normal' }}</span></dd>
          </dl>
          <h4>{{ metric() }} – 24 hours</h4>
          <app-line-chart [labels]="hours" [series]="[{ name: z.name, color: 'var(--ka-7c3aed)', values: selDay(), area: true }, { name: 'Threshold', color: 'var(--ka-ef4444)', values: thrLine(), dashed: true }]" [height]="150" [legend]="false" [suffix]="unit()" />
          <div class="acts">
            <button class="btn-primary" (click)="raise(z)"><app-icon name="bell-ring" [size]="14" />Raise alert</button>
            <button class="btn-ghost" (click)="openSpace(z)"><app-icon name="map-floor" [size]="14" />Zone</button>
            <button class="btn-ghost" (click)="open3d(z)"><app-icon name="twin-cube" [size]="14" />3D</button>
          </div>
        } @else {
          <div class="sh"><h3>Hotspot Ranking</h3><small class="muted">{{ metric() }} · {{ hours[hour()] }}</small></div>
          <ol class="rank">
            @for (r of ranking(); track r.z.id; let i = $index) {
              <li (click)="selId.set(r.z.id)" [class.hot]="r.v >= threshold()">
                <span class="n">{{ i + 1 }}</span>
                <div><b>{{ r.z.name }}</b><i class="bar"><i [style.width.%]="r.k * 100" [style.background]="heatColor(r.k)"></i></i></div>
                <span class="v">{{ fmt(r.v) }}<small [class.up]="r.d > 0" [class.dn]="r.d < 0">{{ r.d > 0 ? '▲' : r.d < 0 ? '▼' : '–' }} {{ abs(r.d) }}</small></span>
              </li>
            }
          </ol>
          <div class="thr">
            <label>Hotspot threshold <b>{{ threshold() }}{{ unit() }}</b></label>
            <input type="range" [min]="range()[0]" [max]="range()[1]" [step]="metric() === 'Temperature' ? 0.5 : 1" [value]="threshold()" (input)="setThr(+$any($event.target).value)" />
            <small class="muted">Zones above the threshold pulse red on the map.</small>
          </div>
        }
      </aside>
    </section>

    <section class="row3">
      <div class="card">
        <div class="card-head"><h3>Weekly Occupancy Pattern <span class="card-sub">{{ floorName() }} · % of capacity</span></h3></div>
        <app-heatmap [rows]="days" [cols]="weekCols" [data]="week()" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Floor Comparison <span class="card-sub">occupancy at {{ hours[hour()] }}</span></h3></div>
        <app-column-chart [labels]="floorLabels" [series]="floorSeries()" [height]="220" suffix="%" />
      </div>
      <div class="card">
        <div class="card-head"><h3>By Zone Type <span class="card-sub">avg {{ metric().toLowerCase() }}</span></h3></div>
        <app-bar-list [rows]="typeRows()" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .hm { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftabs button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .stage { position: relative; } .stage app-floor-heat { display: block; }
    .scale { position: absolute; left: 12px; bottom: 12px; background: color-mix(in srgb, var(--card) 94%, transparent); border-radius: 8px; padding: 8px 10px; display: grid; grid-template-columns: 8px auto; grid-template-rows: auto auto 70px auto; column-gap: 8px; row-gap: 3px; font-size: 11px; color: var(--kf-3b3f5c); box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .scale b { grid-column: 1 / -1; font-size: 11.5px; } .scale i { grid-column: 1; grid-row: 2 / 5; border-radius: 4px; background: linear-gradient(var(--kb-ef4444), var(--kb-f59e0b), var(--kb-facc15), var(--kb-22c55e), var(--kb-06b6d4), var(--kb-3b82f6)); }
    .scale span { grid-column: 2; } .scale span:nth-of-type(2) { grid-row: 4; }
    .player { display: grid; grid-template-columns: 44px minmax(0, 1fr) 120px auto; gap: 14px; align-items: center; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-fafaff); }
    .pl { width: 44px; height: 44px; border-radius: 50%; border: none; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; cursor: pointer; }
    .tl { position: relative; } .tl svg { width: 100%; height: 46px; display: block; cursor: pointer; } .tl input { width: 100%; margin: 2px 0 0; accent-color: var(--kf-7c3aed); }
    .ticks { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); }
    .now { display: flex; flex-direction: column; } .now b { font-size: 22px; } .now small { color: var(--muted); font-size: 11px; }
    .side { display: flex; flex-direction: column; gap: 10px; } .sh { display: flex; justify-content: space-between; align-items: baseline; }
    .rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .rank li { display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: center; padding: 7px 6px; border-radius: 8px; cursor: pointer; font-size: 12.5px; } .rank li:hover { background: var(--kb-f5f3ff); }
    .rank li.hot { background: var(--kb-fef2f2); } .rank .n { width: 22px; height: 22px; border-radius: 50%; background: var(--kb-eef0f6); display: grid; place-items: center; font-size: 11px; font-weight: 600; } .rank li.hot .n { background: var(--kb-ef4444); color: var(--kf-ffffff); }
    .rank b { font-weight: 500; display: block; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
    .rank .v { text-align: right; font-weight: 600; display: flex; flex-direction: column; } .rank .v small { font-size: 10.5px; font-weight: 500; color: var(--muted); } .rank .v small.up { color: var(--kf-dc2626); } .rank .v small.dn { color: var(--kf-16a34a); }
    .bar { display: block; height: 6px; border-radius: 6px; background: var(--kb-e8eaf2); overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 6px; }
    .thr { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border); padding-top: 10px; font-size: 12.5px; } .thr label { display: flex; justify-content: space-between; } .thr input { accent-color: var(--kf-ef4444); }
    .zh { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; } .zh .sw { width: 14px; height: 40px; border-radius: 4px; } .zh h3 { font-size: 16px; }
    .big { display: flex; align-items: baseline; gap: 10px; } .big b { font-size: 30px; } .big span { color: var(--muted); font-size: 12px; }
    .facts { display: grid; grid-template-columns: 90px 1fr; gap: 7px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; display: flex; gap: 6px; align-items: center; }
    h4 { margin: 4px 0 0; font-size: 13px; } .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .row3 { display: grid; grid-template-columns: 1.25fr 1fr 0.9fr; gap: 12px; }
    @media (max-width: 1280px) { .hm, .row3 { grid-template-columns: 1fr; } .player { grid-template-columns: 44px 1fr; } }
  `,
})
export class HeatmapsAnalytics {
  private readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  protected readonly heatColor = heatColor;
  protected readonly abs = Math.abs;
  protected readonly floorTabs = FLOOR_TABS;
  protected readonly metrics = HEAT_METRICS;
  protected readonly hours = HOURS;
  protected readonly days = DAYS;
  protected readonly periods = Object.keys(PERIOD_FACTOR);
  protected readonly speeds = [1, 2, 4];
  protected readonly tickHours = [0, 4, 8, 12, 16, 20, 23];
  protected readonly weekCols = Array.from({ length: 14 }, (_, i) => `${i + 7}`);
  protected readonly floorLabels = FLOOR_TABS.map((f) => f.name.replace('Floor ', 'F'));

  protected readonly floor = signal(this.store.floor() === 'R' ? '4' : this.store.floor());
  protected readonly metric = signal<HeatMetric>('Occupancy');
  protected readonly mode = signal<'3d' | '2d'>('3d');
  protected readonly period = signal('Today');
  protected readonly hour = signal(10);
  protected readonly playing = signal(false);
  protected readonly speed = signal(1);
  protected readonly selId = signal<string | null>(null);
  protected readonly thr = signal<Record<HeatMetric, number>>({ ...METRIC_THRESHOLD });
  protected readonly toast = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  protected readonly hz = computed(() => heatZones(this.zones()));
  private readonly pf = computed(() => PERIOD_FACTOR[this.period()]);
  protected readonly threshold = computed(() => this.thr()[this.metric()]);
  protected readonly unit = computed(() => METRIC_UNIT[this.metric()]);
  protected readonly range = computed(() => METRIC_RANGE[this.metric()]);
  protected readonly floorName = computed(() => floorById(this.floor()).name);

  protected readonly vals = computed(() => {
    const m = this.metric();
    const h = this.hour();
    return this.hz().map((z) => {
      const v = zoneMetric(z, m, h, this.pf());
      return { z, v, k: metricK(m, v), d: +(v - zoneMetric(z, m, (h + 23) % 24, this.pf())).toFixed(1) };
    });
  });
  protected readonly ranking = computed(() => [...this.vals()].sort((a, b) => b.v - a.v).slice(0, 9));
  protected readonly hot = computed(() => this.vals().filter((r) => r.v >= this.threshold()));
  protected readonly heat = computed<IsoHeat[]>(() =>
    this.vals()
      .filter((r) => r.k > 0.1)
      .flatMap((r) => {
        const { z } = r;
        const rad = 26 + r.k * Math.min(z.w, z.h) * 0.42;
        const pts: [number, number][] = z.w > 240 ? [[z.x + z.w / 3, z.y + z.h / 2], [z.x + (2 * z.w) / 3, z.y + z.h / 2]] : [center(z)];
        return pts.map(([x, y]) => ({ x, y, r: rad, v: r.k * 0.65 }));
      }),
  );
  protected readonly markers = computed<IsoMarker[]>(() => this.vals().map((r) => ({ id: r.z.id, x: center(r.z)[0], y: center(r.z)[1], color: heatColor(r.k), icon: 'flame', kind: 'value', label: this.fmt(r.v), title: `${r.z.name} · ${this.fmt(r.v)}` })));
  protected readonly glows = computed<IsoGlow[]>(() => this.hot().map((r) => ({ x: center(r.z)[0], y: center(r.z)[1], r: Math.min(r.z.w, r.z.h) * 0.42, color: 'var(--ka-ef4444)' })));
  protected readonly points = computed(() => {
    const out: { x: number; y: number; v: number }[] = [];
    for (const r of this.vals()) {
      const rnd = rng(r.z.id.charCodeAt(1) * 31 + r.z.x);
      const n = Math.max(1, Math.round(r.k * 14));
      for (let i = 0; i < n; i++) out.push({ x: r.z.x + 12 + rnd() * (r.z.w - 24), y: r.z.y + 12 + rnd() * (r.z.h - 24), v: r.k });
    }
    return out;
  });

  /** Floor head-count curve for the timeline. */
  private readonly dayHeads = computed(() => HOURS.map((_, h) => this.hz().reduce((a, z) => a + zoneUtil(z, h, this.pf()) * z.capacity, 0)));
  protected readonly floorTotal = computed(() => Math.round(this.dayHeads()[this.hour()]));
  protected readonly curve = computed(() => {
    const v = this.dayHeads();
    const max = Math.max(...v, 1);
    const pts = v.map((x, i) => `${i * 20 + 10},${(44 - (x / max) * 40).toFixed(1)}`);
    return { line: 'M' + pts.join(' L'), area: `M10,46 L${pts.join(' L')} L470,46Z` };
  });
  protected readonly peak = computed(() => {
    let best = { hour: 0, value: 0 };
    const cap = this.hz().reduce((a, z) => a + z.capacity, 0) || 1;
    this.dayHeads().forEach((heads, h) => {
      const avg = Math.round((heads / cap) * 100);
      if (avg > best.value) best = { hour: h, value: avg };
    });
    return best;
  });
  protected readonly avgDwell = computed(() => {
    const zs = this.hz();
    return Math.round(zs.reduce((a, z) => a + zoneMetric(z, 'Dwell Time', this.hour(), this.pf()), 0) / (zs.length || 1));
  });
  protected readonly under = computed(() => this.hz().filter((z) => zoneUtil(z, this.hour(), this.pf()) < 0.3).length);
  protected readonly avgTemp = computed(() => {
    const zs = this.hz();
    return (zs.reduce((a, z) => a + zoneMetric(z, 'Temperature', this.hour(), this.pf()), 0) / (zs.length || 1)).toFixed(1);
  });

  protected readonly week = computed(() => {
    const zs = this.hz();
    const cap = zs.reduce((a, z) => a + z.capacity, 0) || 1;
    return DAYS.map((_, d) => this.weekCols.map((c) => Math.min(100, Math.round((zs.reduce((a, z) => a + zoneUtil(z, +c, DAY_FACTOR[d] * this.pf()) * z.capacity, 0) / cap) * 100))));
  });
  protected readonly floorSeries = computed(() => {
    const h = this.hour();
    const val = (f: string, k: number) => {
      const zs = heatZones(this.store.floorZones(f));
      const cap = zs.reduce((a, z) => a + z.capacity, 0) || 1;
      return Math.round((zs.reduce((a, z) => a + Math.min(1, zoneUtil(z, h, k)) * z.capacity, 0) / cap) * 100);
    };
    return [
      { name: this.period(), color: 'var(--ka-7c3aed)', values: FLOOR_TABS.map((f) => val(f.id, this.pf())) },
      { name: '30-day avg', color: 'var(--ka-c4b5fd)', values: FLOOR_TABS.map((f) => val(f.id, 0.79)) },
    ];
  });
  protected readonly typeRows = computed(() => {
    const groups = new Map<string, number[]>();
    for (const r of this.vals()) {
      const k = r.z.type.charAt(0).toUpperCase() + r.z.type.slice(1);
      groups.set(k, [...(groups.get(k) ?? []), r.v]);
    }
    const m = this.metric();
    return [...groups.entries()]
      .map(([label, v]) => {
        const avg = +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(m === 'Temperature' ? 1 : 0);
        return { label, value: Math.round(metricK(m, avg) * 100), display: this.fmt(avg), color: heatColor(metricK(m, avg)) };
      })
      .sort((a, b) => b.value - a.value);
  });

  protected readonly sel = computed(() => this.hz().find((z) => z.id === this.selId()) ?? null);
  protected readonly selVal = computed(() => (this.sel() ? zoneMetric(this.sel()!, this.metric(), this.hour(), this.pf()) : 0));
  protected readonly selK = computed(() => metricK(this.metric(), this.selVal()));
  protected readonly selDay = computed(() => (this.sel() ? HOURS.map((_, h) => zoneMetric(this.sel()!, this.metric(), h, this.pf())) : []));
  protected readonly selPeak = computed(() => {
    const d = this.selDay();
    const v = Math.max(...d);
    return { v, h: d.indexOf(v) };
  });
  protected readonly thrLine = computed(() => HOURS.map(() => this.threshold()));

  protected fmt(v: number) {
    return fmtMetric(this.metric(), v);
  }
  protected util(z: TZone) {
    return Math.round(zoneUtil(z, this.hour(), this.pf()) * 100);
  }
  protected heads(z: TZone) {
    return Math.round(zoneUtil(z, this.hour(), this.pf()) * z.capacity);
  }
  protected setFloor(f: string) {
    this.floor.set(f);
    this.selId.set(null);
  }
  protected setMetric(m: HeatMetric) {
    this.metric.set(m);
  }
  protected setThr(v: number) {
    this.thr.update((t) => ({ ...t, [this.metric()]: v }));
  }
  protected toggle() {
    if (this.playing()) return this.stop();
    this.playing.set(true);
    if (this.hour() >= PLAY_TO) this.hour.set(PLAY_FROM);
    const step = () => {
      const h = this.hour() + 1;
      if (h > PLAY_TO) {
        this.stop();
        this.toast$(`Playback finished · peak ${this.peak().value}% at ${HOURS[this.peak().hour]}`);
        return;
      }
      this.hour.set(h);
      this.timer = setTimeout(step, 900 / this.speed()) as unknown as ReturnType<typeof setInterval>;
    };
    this.timer = setTimeout(step, 900 / this.speed()) as unknown as ReturnType<typeof setInterval>;
  }
  private stop() {
    this.playing.set(false);
    if (this.timer) clearTimeout(this.timer as unknown as number);
    this.timer = null;
  }
  protected scrub(e: MouseEvent) {
    const el = e.currentTarget as SVGElement;
    const r = el.getBoundingClientRect();
    this.hour.set(Math.max(0, Math.min(23, Math.round(((e.clientX - r.left) / r.width) * 24 - 0.5))));
  }
  protected raise(z: TZone) {
    const m = this.metric();
    this.store.raiseAlert({ title: m === 'Occupancy' ? 'Over Capacity' : m === 'Temperature' ? 'High Temperature' : m === 'CO₂' ? 'High CO₂' : 'Long Dwell Time', detail: `${this.fmt(this.selVal())} (threshold ${this.threshold()}${this.unit()})`, zone: z.name, floor: z.floor, x: center(z)[0], y: center(z)[1], severity: this.selVal() >= this.threshold() ? 'High' : 'Medium', icon: m === 'Temperature' ? 'twin-thermo' : m === 'Occupancy' ? 'users' : 'triangle-alert' });
    this.toast$(`Alert raised for ${z.name} · visible on the 3D viewer`);
  }
  protected openSpace(z: TZone) {
    this.store.floor.set(z.floor);
    this.router.navigateByUrl('/digital-twin/space-zone-management');
  }
  protected open3d(z: TZone) {
    this.store.floor.set(z.floor);
    this.router.navigateByUrl('/digital-twin/2d-3d-facility-viewer');
  }
  protected exportCsv() {
    const m = this.metric();
    downloadCsv(`heatmap-${floorById(this.floor()).short.replace(/\s/g, '-')}-${m.replace(/\W/g, '')}.csv`, [['Zone', 'Floor', ...HOURS], ...this.hz().map((z) => [z.name, floorById(z.floor).name, ...HOURS.map((_, h) => zoneMetric(z, m, h, this.pf()))])]);
    this.toast$(`Exported ${this.hz().length} zones × 24 h (${m})`);
  }
  protected toast$(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
