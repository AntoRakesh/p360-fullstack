import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Series, UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { A_DATES, A_RANGES, AnalyticsStore, fmtDay, fmtMin, fmtN, HOURS, HOURS_FULL, PEAK_LAST, PEAK_TODAY, TREND_DAYS, TREND_IN, TREND_OUT, VISITOR_TYPES } from './analytics.data';
import { FfBars, FfLine, MallCam, MallMap, zoneBlobs } from './analytics-ui';
import { ZoneDrawer } from './zone-drawer';

const BASE = '/customer-visitor-analytics/';
const ZONE_MUL: Record<string, number> = { Today: 1, 'This Week': 6.3, 'This Month': 26.8 };
const TYPE_MUL: Record<string, number> = { Today: 1, 'This Week': 6.1, 'This Month': 25.9 };
const HEAT_MODES = ['Now', '1 Hour Ago', 'Peak (3 PM)', 'Today Avg'];

@Component({
  selector: 'app-footfall-people-counting',
  imports: [...UI, RouterLink, FfLine, FfBars, MallCam, MallMap, ZoneDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fh">
      <nav class="crumbs top"><a routerLink="/customer-visitor-analytics/footfall-people-counting">Customer &amp; Visitor Analytics</a><app-icon name="chevron-right" [size]="14" /><span>Footfall &amp; People Counting</span></nav>
      <div class="fh-row"><h1>Footfall &amp; People Counting</h1>
      <div class="head-btns">
      <label class="hsel"><select [value]="s.site().name" (change)="setSite($any($event.target).value)">@for (x of s.sites; track x.name) {<option [value]="x.name">{{ x.name }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
      <label class="hsel"><app-icon name="calendar-days" [size]="16" /><select [value]="s.date()" (change)="s.date.set($any($event.target).value)">@for (d of dates; track d) {<option [value]="d">{{ day(d) }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
      <label class="hsel"><select [value]="s.range()" (change)="s.range.set($any($event.target).value)">@for (r of ranges; track r) {<option [value]="r">{{ r }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
      <button class="btn-primary exp" (click)="exportReport()"><app-icon name="a-upload" [size]="16" />Export Report</button>
      <div class="menu-wrap">
        <button class="btn-ghost kebab" (click)="more.set(!more())" aria-label="More"><app-icon name="more" [size]="18" /></button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="refresh()"><app-icon name="refresh" [size]="15" />Refresh data</button>
            <button class="dd-item" (click)="go('reports-insights')"><app-icon name="file-chart" [size]="15" />Schedule this report</button>
            <button class="dd-item" (click)="go('zone-area-analytics')"><app-icon name="map-floor" [size]="15" />Configure zones</button>
            <button class="dd-item" (click)="go('device-management')"><app-icon name="cpu" [size]="15" />Counting devices</button>
            <button class="dd-item" (click)="more.set(false); print()"><app-icon name="file-text" [size]="15" />Print</button>
          </div>
        }
      </div>
      </div></div>
      <p class="sub">Real-time and historical people counting, footfall trends and occupancy insights across all locations.</p>
    </div>

    <section class="kpis">
      <div class="card kp"><span class="ic" style="background:var(--kb-7c3aed)"><app-icon name="users" [size]="28" /></span>
        <div><small>Total Footfall</small><b>{{ n(s.total()) }}</b><p><span class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />12%</span>vs. last week</p></div></div>
      <div class="card kp"><span class="ic" style="background:var(--kb-22c55e)"><app-icon name="a-log-in" [size]="28" /></span>
        <div><small>Entries</small><b>{{ n(s.entries()) }}</b><p><span class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />10%</span>vs. last week</p></div></div>
      <div class="card kp"><span class="ic" style="background:var(--kb-ef4444)"><app-icon name="a-log-out" [size]="28" /></span>
        <div><small>Exits</small><b>{{ n(s.exits()) }}</b><p><span class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />9%</span>vs. last week</p></div></div>
      <div class="card kp" (click)="go('zone-area-analytics')" title="Open Zone & Area Analytics"><span class="ic" style="background:var(--kb-2563eb)"><app-icon name="a-occupancy" [size]="28" /></span>
        <div class="occ"><small>Current Occupancy</small><b>{{ n(s.occupancy()) }}</b><div class="bar"><i [style.width.%]="s.occPct()" [class.hot]="s.occPct() > 85"></i></div><p class="r">{{ s.occPct() }}% of capacity</p></div></div>
      <div class="card kp" (click)="go('dwell-time-movement')" title="Open Dwell Time & Movement"><span class="ic" style="background:var(--kb-f59e0b)"><app-icon name="clock" [size]="28" /></span>
        <div><small>Avg. Dwell Time</small><b>{{ mins(s.avgDwell()) }}</b><p><span class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />18%</span>vs. last week</p></div></div>
    </section>

    <section class="row r2">
      <div class="card">
        <div class="ch"><h3>Footfall Trend</h3>
          <div class="ch-r">
            <button class="lg" [class.off]="hideIn()" (click)="hideIn.set(!hideIn())"><i style="background:var(--kb-7c3aed)"></i>Entries</button>
            <button class="lg" [class.off]="hideOut()" (click)="hideOut.set(!hideOut())"><i style="background:var(--kb-3b82f6)"></i>Exits</button>
            <label class="hsel sm"><select [value]="gran()" (change)="gran.set($any($event.target).value)"><option>Hourly</option><option>Daily</option><option>Weekly</option></select><app-icon name="chevron-down" [size]="14" /></label>
          </div>
        </div>
        <app-ff-line [labels]="trend().labels" [tipLabels]="trend().tips" [series]="trendSeries()" [height]="212" yLabel="People" [max]="trend().max" [pin]="trend().pin" [every]="trend().every" />
      </div>
      <div class="card cam-card">
        <div class="ch"><h3>Live People Count</h3>
          <label class="hsel sm"><select [value]="camId()" (change)="camId.set($any($event.target).value)">@for (c of cams(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.zone }}</option>}</select><app-icon name="chevron-down" [size]="14" /></label>
        </div>
        <div class="cam" (click)="camFull.set(true)">
          <app-mall-cam [tick]="s.tick()" [boxes]="boxes()" [zone]="zoneOn()" [offline]="camOffline()" [seed]="camSeed()" [count]="36" />
          <div class="occ-ov"><app-icon name="users" [size]="26" /><div><b>{{ camOcc() }}</b><span>Current Occupancy</span></div></div>
          <span class="live"><i></i>{{ s.isLive() ? 'Live' : 'Playback' }}</span>
        </div>
        <div class="cam-legend">
          <span><i class="sq" style="background:var(--kb-22c55e)"></i>Entry <b>+{{ s.perMin().in }}/min</b></span>
          <span><i class="sq" style="background:var(--kb-3b82f6)"></i>Exit <b>+{{ s.perMin().out }}/min</b></span>
          <button class="lg" [class.off]="!zoneOn()" (click)="zoneOn.set(!zoneOn())"><i class="sq" style="background:var(--kb-ddd6fe)"></i>Counting Zone</button>
          <button class="lg" [class.off]="!boxes()" (click)="boxes.set(!boxes())"><i class="sq" style="background:var(--kb-bae6fd)"></i>Person</button>
          <button class="fs" title="Full screen" (click)="camFull.set(true)"><app-icon name="maximize" [size]="16" /></button>
        </div>
      </div>
    </section>

    <section class="row r3">
      <div class="card">
        <div class="ch"><h3>Footfall by Zone</h3>
          <div class="ch-r">
            <span class="lg static"><i style="background:var(--kb-7c3aed)"></i>Entries</span><span class="lg static"><i style="background:var(--kb-3b82f6)"></i>Exits</span>
            <label class="hsel sm"><select [value]="zonePeriod()" (change)="zonePeriod.set($any($event.target).value)"><option>Today</option><option>This Week</option><option>This Month</option></select><app-icon name="chevron-down" [size]="14" /></label>
          </div>
        </div>
        <app-ff-bars [labels]="zoneBars().labels" [series]="zoneBars().series" [height]="168" yLabel="People" (pick)="openZone(zoneBars().ids[$event])" />
      </div>
      <div class="card">
        <div class="ch"><h3>Heatmap - People Density</h3>
          <label class="hsel sm"><select [value]="heatMode()" (change)="heatMode.set($any($event.target).value)">@for (m of heatModes; track m) {<option>{{ m }}</option>}</select><app-icon name="chevron-down" [size]="14" /></label>
        </div>
        <div class="heat">
          <app-mall-map class="hm" [zones]="mapZones()" [blobs]="blobs()" [labelIds]="['Z1', 'Z2', 'Z3', 'Z6']" pinId="Z1" [labelSize]="25" (zoneClick)="openZone($event)" />
          <div class="scale"><span>High</span><i></i><span>Low</span>
            <button class="fs" title="Full screen" (click)="heatFull.set(true)"><app-icon name="maximize" [size]="16" /></button></div>
        </div>
      </div>
    </section>

    <section class="row r4">
      <div class="card">
        <div class="ch"><h3>Top Locations by Footfall</h3><button class="link" (click)="go('zone-area-analytics')">View All</button></div>
        <table class="table tl">
          <thead><tr><th>#</th><th>Location / Zone</th><th class="num">Entries</th><th class="num">Exits</th><th class="num">Total Footfall</th><th class="num">Avg. Dwell Time</th><th class="c">Trend</th></tr></thead>
          <tbody>
            @for (z of top(); track z.id; let i = $index) {
              <tr class="clickable" (click)="openZone(z.id)"><td>{{ i + 1 }}</td><td>{{ z.name }}</td><td class="num">{{ n(z.entries) }}</td><td class="num">{{ n(z.exits) }}</td><td class="num"><b>{{ n(z.entries + z.exits) }}</b></td><td class="num">{{ dwell(z.dwell) }}</td><td class="sp"><app-sparkline [values]="z.trend" color="var(--ka-22c55e)" /></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="ch"><h3>Visitor Type</h3>
          <label class="hsel sm"><select [value]="typePeriod()" (change)="typePeriod.set($any($event.target).value)"><option>Today</option><option>This Week</option><option>This Month</option></select><app-icon name="chevron-down" [size]="14" /></label></div>
        <div class="vt">
          <app-donut [segments]="types()" [legend]="false" [size]="148" center="Total Footfall" [value]="n(typeTotal())" />
          <ul>
            @for (t of types(); track t.label) {<li (click)="go(t.label === 'Customers' ? 'demographics-ai' : 'repeat-vs-new-visitors')"><i [style.background]="t.color"></i>{{ t.label }}<b>{{ pct(t.value) }}%</b></li>}
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="ch"><h3>Peak Hours</h3>
          <div class="ch-r">
            <button class="lg" [class.off]="hideToday()" (click)="hideToday.set(!hideToday())"><i style="background:var(--kb-7c3aed)"></i>Today</button>
            <button class="lg" [class.off]="hideLast()" (click)="hideLast.set(!hideLast())"><i style="background:var(--kb-3b82f6)"></i>Last Week</button>
          </div>
        </div>
        <div class="ph"><span class="unit">People</span>
          <app-ff-line [labels]="hours" [tipLabels]="hoursFull" [series]="peakSeries()" [height]="150" [max]="2000" [pin]="9" [every]="3" />
        </div>
      </div>
    </section>

    @if (zoneId(); as id) {<app-zone-drawer [zoneId]="id" (closed)="zoneId.set(null)" />}

    @if (camFull()) {
      <div class="g-overlay" (click)="camFull.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>{{ camId() }} · {{ camZone() }} <span class="tag green">{{ camOffline() ? 'Offline' : 'Live' }}</span></h3><button class="close-btn" (click)="camFull.set(false)">×</button></div>
        <div class="cam big"><app-mall-cam [tick]="s.tick()" [boxes]="boxes()" [offline]="camOffline()" [seed]="camSeed()" [count]="44" />
          <div class="occ-ov"><app-icon name="users" [size]="26" /><div><b>{{ camOcc() }}</b><span>Current Occupancy</span></div></div><span class="live"><i></i>Live</span></div>
        <div class="cam-tools">
          @for (c of cams(); track c.id) {<button class="btn-ghost sm" [class.on]="c.id === camId()" (click)="camId.set(c.id)">{{ c.id }}</button>}
          <span class="sp1"></span>
          <button class="btn-ghost sm" (click)="boxes.set(!boxes())">{{ boxes() ? 'Hide' : 'Show' }} detections</button>
          <button class="btn-ghost sm" (click)="toastMsg('Snapshot saved to evidence library · ' + camId())">Snapshot</button>
          <button class="btn-primary" (click)="camFull.set(false); go('device-management')">Manage device</button>
        </div>
      </div>
    }
    @if (heatFull()) {
      <div class="g-overlay" (click)="heatFull.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>People Density · {{ heatMode() }}</h3><button class="close-btn" (click)="heatFull.set(false)">×</button></div>
        <app-mall-map class="hm-big" [zones]="mapZones()" [blobs]="blobs()" [showZones]="true" pinId="Z1" (zoneClick)="heatFull.set(false); openZone($event)" />
        <div class="cam-tools">
          @for (m of heatModes; track m) {<button class="btn-ghost sm" [class.on]="m === heatMode()" (click)="heatMode.set(m)">{{ m }}</button>}
          <span class="sp1"></span>
          <button class="btn-primary" (click)="heatFull.set(false); go('heatmaps-trajectories')">Open Heatmaps & Trajectories</button>
        </div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .fh { margin-bottom: 16px; } .fh-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .fh h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -.4px; } .fh .sub { margin: 2px 0 0; font-size: 15px; color: var(--kf-3b3f5c); }
    .hsel { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); color: var(--kf-3b3f5c); cursor: pointer; }
    .hsel select { appearance: none; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--text); padding-right: 22px; cursor: pointer; outline: 0; min-width: 0; }
    .hsel > app-icon:last-child { position: absolute; right: 10px; pointer-events: none; }
    .hsel.sm { height: 32px; } .hsel.sm select { font-size: 12px; padding-right: 26px; }
    .exp { height: 38px; padding: 0 18px; } .kebab { height: 38px; width: 38px; justify-content: center; padding: 0; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .kp { display: flex; gap: 18px; align-items: center; padding: 16px 18px; cursor: default; }
    .kp:nth-child(n + 4) { cursor: pointer; }
    .kp .ic { width: 56px; height: 56px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .kp > div { min-width: 0; flex: 1; } .kp small { display: block; font-size: 12.5px; color: var(--kf-3b3f5c); }
    .kp b { display: block; font-size: 25px; font-weight: 700; margin: 4px 0 6px; font-variant-numeric: tabular-nums; letter-spacing: -.3px; }
    .kp p { margin: 0; font-size: 12.5px; color: var(--kf-4b4f6b); display: flex; align-items: center; gap: 14px; white-space: nowrap; }
    .kp .up { display: inline-flex; align-items: center; gap: 3px; color: var(--kf-16a34a); font-weight: 700; font-size: 13.5px; }
    .occ b { margin-bottom: 4px; } .bar { height: 6px; border-radius: 3px; background: var(--kb-e5e7eb); overflow: hidden; } .bar i { display: block; height: 100%; background: var(--kb-2563eb); border-radius: 3px; transition: width .5s; } .bar i.hot { background: var(--red); }
    .kp p.r { justify-content: flex-end; font-size: 11px; margin-top: 6px; }
    .row { display: grid; gap: 12px; margin-bottom: 12px; } .r2, .r3 { grid-template-columns: minmax(0, 1fr) minmax(0, .93fr); } .r4 { grid-template-columns: minmax(0, 1.32fr) minmax(0, .88fr) minmax(0, .98fr); }
    .ch { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; min-height: 32px; }
    .ch h3 { font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; } .ch-r { display: flex; align-items: center; gap: 16px; }
    .lg { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; font: inherit; font-size: 12px; color: var(--kf-3b3f5c); cursor: pointer; padding: 0; white-space: nowrap; }
    .lg.static { cursor: default; } .lg i { width: 10px; height: 10px; border-radius: 50%; } .lg.off { opacity: .35; text-decoration: line-through; }
    .cam-card { display: flex; flex-direction: column; }
    .cam { position: relative; height: 196px; border-radius: 6px; overflow: hidden; cursor: zoom-in; background: var(--kb-111111); }
    .cam app-mall-cam { position: absolute; inset: 0; }
    .cam.big { height: 460px; cursor: default; }
    .occ-ov { position: absolute; left: 6px; top: 6px; display: flex; align-items: center; gap: 12px; padding: 10px 16px 10px 12px; background: rgba(23, 37, 84, .86); color: var(--kf-ffffff); border-radius: 3px; }
    .occ-ov b { display: block; font-size: 17px; line-height: 1.1; } .occ-ov span { font-size: 11.5px; }
    .live { position: absolute; right: 8px; top: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 3px; background: rgba(17, 24, 39, .82); color: var(--kf-ffffff); font-size: 12.5px; }
    .live i { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-22c55e); animation: g-blink 1.6s infinite; }
    .cam-legend { display: flex; align-items: center; gap: 30px; margin-top: 12px; font-size: 12px; color: var(--kf-3b3f5c); }
    .cam-legend span { display: inline-flex; align-items: center; gap: 7px; } .cam-legend b { font-weight: 500; }
    .sq { width: 13px; height: 13px; border-radius: 2px; display: inline-block; }
    .fs { margin-left: auto; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); color: var(--kf-3b3f5c); cursor: pointer; }
    .heat { display: grid; grid-template-columns: minmax(0, 1fr) 56px; gap: 8px; }
    .hm { height: 168px; } .hm-big { height: 420px; }
    .scale { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--kf-3b3f5c); padding-top: 10px; }
    .scale i { width: 6px; height: 88px; border-radius: 3px; background: linear-gradient(var(--kb-ef4444), var(--kb-f97316), var(--kb-facc15), var(--kb-22c55e), var(--kb-22d3ee), var(--kb-3b82f6), var(--kb-4f46e5)); }
    .scale .fs { margin: 10px 0 0; }
    .tl th { background: none; font-size: 11px; font-weight: 500; padding: 7px 8px; } .tl td { padding: 6px 8px; font-size: 11.5px; border-bottom: 0; }
    .tl th.c { text-align: center; } .tl .sp { width: 80px; } .tl .sp app-sparkline { display: block; width: 72px; } :host ::ng-deep .tl .spark { height: 16px; } .tl .num b { font-weight: 500; }
    .vt { display: flex; align-items: center; gap: 24px; padding: 6px 4px 0; }
    .vt ul { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 12px; }
    .vt li { display: grid; grid-template-columns: 12px 1fr auto; gap: 10px; align-items: center; font-size: 12px; cursor: pointer; } .vt li:hover { color: var(--primary); }
    .vt li i { width: 11px; height: 11px; border-radius: 50%; } .vt li b { font-weight: 600; }
    :host ::ng-deep .vt .donut-mid b { font-size: 19px; } :host ::ng-deep .vt .donut-mid span { font-size: 11px; color: var(--kf-3b3f5c); }
    .ph { position: relative; } .unit { position: absolute; left: 14px; top: -6px; font-size: 11px; color: var(--kf-6b7090); }
    .ph app-ff-line { padding-top: 10px; }
    .cam-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; } .cam-tools .on { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); } .sp1 { flex: 1; }
    @media (max-width: 1350px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .r4 { grid-template-columns: 1fr 1fr; } .r4 > :first-child { grid-column: 1 / -1; } }
    @media (max-width: 1100px) { .r2, .r3 { grid-template-columns: 1fr; } }
  `,
})
export class Footfall {
  protected readonly s = inject(AnalyticsStore);
  private readonly router = inject(Router);
  protected readonly dates = A_DATES;
  protected readonly ranges = A_RANGES;
  protected readonly hours = HOURS;
  protected readonly hoursFull = HOURS_FULL;
  protected readonly heatModes = HEAT_MODES;
  protected readonly n = fmtN;
  protected readonly mins = fmtMin;
  protected readonly day = fmtDay;
  protected readonly more = signal(false);
  protected readonly gran = signal<'Hourly' | 'Daily' | 'Weekly'>('Daily');
  protected readonly hideIn = signal(false);
  protected readonly hideOut = signal(false);
  protected readonly hideToday = signal(false);
  protected readonly hideLast = signal(false);
  protected readonly zonePeriod = signal('Today');
  protected readonly typePeriod = signal('Today');
  protected readonly heatMode = signal('Now');
  protected readonly boxes = signal(true);
  protected readonly zoneOn = signal(true);
  protected readonly camFull = signal(false);
  protected readonly heatFull = signal(false);
  protected readonly camId = signal('CAM-01');
  protected readonly zoneId = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected dwell(m: number) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`.replace(/^0h (\d+)m$/, '0h $1m');
  }

  protected readonly trend = computed(() => {
    const f = this.s.f();
    const g = this.gran();
    if (g === 'Hourly') {
      return { labels: HOURS, tips: HOURS_FULL.map((h) => `${this.day(this.s.date())} · ${h}`), inV: PEAK_TODAY.map((v) => Math.round(v * 0.53 * f)), outV: PEAK_TODAY.map((v, i) => Math.round(v * (0.38 + i * 0.012) * f)), max: undefined, pin: 9, every: 3 };
    }
    if (g === 'Weekly') {
      const w = [0.82, 0.88, 0.85, 0.93, 0.9, 0.97, 1.04, 1];
      return { labels: ['W35', 'W36', 'W37', 'W38', 'W39', 'W40', 'W41', 'W42'], tips: ['Week 35', 'Week 36', 'Week 37', 'Week 38', 'Week 39', 'Week 40', 'Week 41', 'Week 42 (current)'], inV: w.map((x) => Math.round(6420 * x * f)), outV: w.map((x) => Math.round(6062 * x * 0.99 * f)), max: undefined, pin: 6, every: 1 };
    }
    return { labels: TREND_DAYS, tips: TREND_DAYS.map((d) => `${d} 2026`), inV: TREND_IN.map((v) => Math.round(v * f)), outV: TREND_OUT.map((v) => Math.round(v * f)), max: f > 1.05 ? undefined : 2000, pin: 4, every: 1 };
  });
  protected readonly trendSeries = computed<Series[]>(() => {
    const t = this.trend();
    const out: Series[] = [];
    if (!this.hideIn()) out.push({ name: 'Entries', color: 'var(--ka-7c3aed)', values: t.inV, area: true });
    if (!this.hideOut()) out.push({ name: 'Exits', color: 'var(--ka-3b82f6)', values: t.outV, area: true });
    return out;
  });
  protected readonly peakSeries = computed<Series[]>(() => {
    const f = this.s.f();
    const out: Series[] = [];
    if (!this.hideToday()) out.push({ name: 'Today', color: 'var(--ka-7c3aed)', values: PEAK_TODAY.map((v) => Math.round(v * f)), area: true });
    if (!this.hideLast()) out.push({ name: 'Last Week', color: 'var(--ka-3b82f6)', values: PEAK_LAST.map((v) => Math.round(v * f)) });
    return out;
  });

  protected readonly zoneBars = computed(() => {
    const m = ZONE_MUL[this.zonePeriod()];
    const z = this.s.zonesNow().slice(0, 6);
    return {
      ids: z.map((x) => x.id),
      labels: z.map((x) => x.name),
      series: [
        { name: 'Entries', color: 'var(--ka-7c3aed)', values: z.map((x) => Math.round(x.entries * m)) },
        { name: 'Exits', color: 'var(--ka-3b82f6)', values: z.map((x) => Math.round(x.exits * m)) },
      ] as Series[],
    };
  });
  protected readonly top = computed(() => [...this.s.zonesNow()].sort((a, b) => b.entries + b.exits - (a.entries + a.exits)).slice(0, 5));

  protected readonly mapZones = computed(() => this.s.zonesNow().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: z.color, pct: z.pct })));
  protected readonly blobs = computed(() => {
    const mode = this.heatMode();
    const mul = mode === 'Now' ? 1 : mode === '1 Hour Ago' ? 0.8 : mode === 'Peak (3 PM)' ? 1.15 : 0.7;
    const shift = HEAT_MODES.indexOf(mode) + (mode === 'Now' && this.s.isLive() ? this.s.tick() % 2 : 0);
    return zoneBlobs(this.s.zonesNow().map((z) => ({ ...z, pct: z.pct * mul })), shift);
  });

  protected readonly typeTotal = computed(() => Math.round(this.s.total() * TYPE_MUL[this.typePeriod()]));
  protected readonly types = computed(() => VISITOR_TYPES.map((t) => ({ ...t, value: Math.round((t.value / 12482) * this.typeTotal()) })));
  protected pct(v: number) {
    return Math.round((v / Math.max(1, this.typeTotal())) * 100);
  }

  protected readonly cams = computed(() => this.s.devices().filter((d) => d.type === 'AI Camera'));
  protected readonly camDev = computed(() => this.cams().find((c) => c.id === this.camId()) ?? this.cams()[0]);
  protected readonly camZone = computed(() => this.camDev()?.zone ?? '');
  protected readonly camOffline = computed(() => this.camDev()?.status === 'Offline' || this.camDev()?.status === 'Disabled');
  protected readonly camSeed = computed(() => 3 + this.cams().indexOf(this.camDev()!));
  /** The atrium camera shows the whole-mall occupancy; other cameras their zone. */
  protected readonly camOcc = computed(() => (this.camId() === 'CAM-01' ? this.n(this.s.occupancy()) : this.n(this.s.zonesNow().find((z) => z.camera === this.camId())?.occ ?? 0)));

  protected setSite(name: string) {
    this.s.site.set(this.s.sites.find((x) => x.name === name)!);
  }
  protected openZone(id: string) {
    this.zoneId.set(id);
  }
  protected go(p: string) {
    this.more.set(false);
    this.router.navigateByUrl(BASE + p);
  }
  protected refresh() {
    this.more.set(false);
    this.toastMsg(`Data refreshed · ${this.s.devCounts().online} of ${this.s.devCounts().total} counting devices reporting`);
  }
  protected print() {
    window.print();
  }
  protected exportReport() {
    const s = this.s;
    const rows: (string | number)[][] = [
      ['Footfall & People Counting Report'],
      ['Site', s.site().name], ['Date', this.day(s.date())], ['Range', s.range()], [],
      ['Metric', 'Value'], ['Total Footfall', s.total()], ['Entries', s.entries()], ['Exits', s.exits()], ['Current Occupancy', s.occupancy()], ['Capacity %', s.occPct()], ['Avg Dwell', fmtMin(s.avgDwell())], [],
      ['Zone', 'Entries', 'Exits', 'Total', 'Occupancy', 'Capacity', 'Avg Dwell (min)'],
      ...s.zonesNow().map((z) => [z.name, z.entries, z.exits, z.entries + z.exits, z.occ, z.cap, z.dwell]),
    ];
    downloadCsv(`footfall-report-${s.date()}.csv`, rows);
    s.logRun('Footfall & People Counting', 'CSV');
    this.toastMsg('Report exported · added to Reports & Insights history');
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
}
