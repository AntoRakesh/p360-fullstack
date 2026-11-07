// Local building blocks for Reports & Analytics: % column chart, floor heat map and the report preview.
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { BREAK_COLORS, fmtNum, Preview, rnd } from './reports.data';

/* ---------- Grouped % column chart (0–100% axis, labels every 3rd group) ---------- */
@Component({
  selector: 'rpt-columns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + height()" preserveAspectRatio="none" class="svg" [style.height.px]="height()">
        @for (t of ticks; track t) {
          <line [attr.x1]="38" [attr.x2]="W - 4" [attr.y1]="y(t)" [attr.y2]="y(t)" class="grid" />
        }
        @for (g of groups(); track $index; let gi = $index) {
          <rect [attr.x]="g.x0" y="6" [attr.width]="band()" [attr.height]="b() - 6" [attr.fill]="hover() === gi ? '#f3efff' : 'transparent'" (mouseenter)="hover.set(gi)" />
          @for (bar of g.bars; track $index) {
            <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" [attr.fill]="bar.color" rx="1" pointer-events="none" />
          }
        }
        @for (l of lines(); track l.name) {
          <path [attr.d]="l.d" fill="none" [attr.stroke]="l.color" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
        }
      </svg>
      <div class="ylab">@for (t of ticks; track t) {<span [style.top.px]="y(t) - 7">{{ t }}%</span>}</div>
      <div class="xlab">@for (g of groups(); track $index; let gi = $index) {@if (gi % every() === (every() === 3 ? 2 : 0)) {<span [style.left.%]="(g.cx / W) * 100">{{ labels()[gi] }}</span>}}</div>
      @if (hover() !== null) {
        <div class="tip" [style.left.%]="(groups()[hover()!].cx / W) * 100">
          <b>{{ labels()[hover()!] }}</b>
          @for (s of series(); track s.name) {<span><i [style.background]="s.color"></i>{{ s.name }}: {{ s.values[hover()!] }}%</span>}
        </div>
      }
    </div>
    @if (legend()) {
      <div class="legend">@for (s of series(); track s.name) {<span><i [style.background]="s.color" [class.dash]="s.dashed"></i>{{ s.name }}</span>}</div>
    }
  `,
  styles: `
    :host { display: block; }
    .wrap { position: relative; padding-left: 0; }
    .svg { width: 100%; display: block; } .grid { stroke: #eceef5; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .ylab span { position: absolute; left: 0; width: 32px; text-align: right; font-size: 10.5px; color: #4b4f6b; }
    .xlab { position: relative; height: 16px; } .xlab span { position: absolute; transform: translateX(-50%); font-size: 10.5px; color: #4b4f6b; white-space: nowrap; top: 2px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; font-size: 11px; color: #3b3f5c; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; } .legend i { width: 11px; height: 11px; border-radius: 50%; } .legend i.dash { border-radius: 2px; height: 3px; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); background: #1e1b3a; color: #fff; border-radius: 7px; padding: 6px 9px; font-size: 11px; pointer-events: none; display: flex; flex-direction: column; gap: 2px; white-space: nowrap; z-index: 3; }
    .tip i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
  `,
})
export class RptColumns {
  readonly labels = input.required<string[]>();
  readonly series = input.required<{ name: string; color: string; values: number[]; dashed?: boolean }[]>();
  readonly height = input(110);
  readonly legend = input(true);
  protected readonly W = 300;
  protected readonly ticks = [0, 25, 50, 75, 100];
  protected readonly hover = signal<number | null>(null);
  protected readonly b = computed(() => this.height() - 4);
  protected y(v: number) {
    return this.b() - (v / 100) * (this.b() - 8);
  }
  protected readonly band = computed(() => (this.W - 44) / this.labels().length);
  protected readonly every = computed(() => (this.labels().length > 10 ? 3 : 1));
  protected readonly groups = computed(() => {
    const bars = this.series().filter((s) => !s.dashed);
    return this.labels().map((_, i) => {
      const x0 = 42 + i * this.band();
      const inner = this.band() * 0.78;
      const w = inner / bars.length;
      return {
        x0,
        cx: x0 + this.band() / 2,
        bars: bars.map((s, si) => ({ x: x0 + (this.band() - inner) / 2 + si * w, w: w * 0.86, y: this.y(s.values[i]), h: this.b() - this.y(s.values[i]), color: s.color })),
      };
    });
  });
  protected readonly lines = computed(() =>
    this.series()
      .filter((s) => s.dashed)
      .map((s) => ({ name: s.name, color: s.color, d: s.values.map((v, i) => `${i ? 'L' : 'M'}${this.groups()[i].cx.toFixed(1)},${this.y(v).toFixed(1)}`).join(' ') })),
  );
}

/* ---------- Floor plan with heat blobs ---------- */
const EXACT_BLOBS: [number, number, number, number][] = [
  [43, 48, 26, 1], [100, 115, 26, 1], [215, 100, 24, 1], [145, 45, 22, 0.7], [205, 30, 20, 0.65], [65, 85, 20, 0.45], [155, 85, 22, 0.5], [25, 112, 18, 0.4], [175, 122, 18, 0.45], [120, 30, 16, 0.35],
];
@Component({
  selector: 'rpt-floor-heat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fh">
      <svg viewBox="0 0 250 145" class="plan" [style.height.px]="height()">
        <defs>
          <radialGradient id="rh-hot"><stop offset="0" stop-color="#ef1d2e" /><stop offset="0.3" stop-color="#ff5a1f" /><stop offset="0.5" stop-color="#ffd21f" /><stop offset="0.7" stop-color="#4ade80" /><stop offset="0.88" stop-color="#38bdf8" stop-opacity="0.6" /><stop offset="1" stop-color="#3b82f6" stop-opacity="0" /></radialGradient>
          <radialGradient id="rh-warm"><stop offset="0" stop-color="#ffd21f" /><stop offset="0.35" stop-color="#a3e635" /><stop offset="0.65" stop-color="#4ade80" /><stop offset="0.85" stop-color="#38bdf8" stop-opacity="0.55" /><stop offset="1" stop-color="#3b82f6" stop-opacity="0" /></radialGradient>
          <radialGradient id="rh-cool"><stop offset="0" stop-color="#4ade80" /><stop offset="0.5" stop-color="#22d3ee" stop-opacity="0.8" /><stop offset="1" stop-color="#3b82f6" stop-opacity="0" /></radialGradient>
          <filter id="rh-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" /></filter>
          <pattern id="rh-stairs" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0H4" stroke="#6b7280" stroke-width="0.6" /></pattern>
        </defs>
        <rect x="4" y="4" width="242" height="137" fill="#dbeafe" />
        <rect x="4" y="4" width="242" height="137" fill="#93c5fd" opacity="0.45" />
        <g filter="url(#rh-blur)">
        @for (b of blobs(); track $index) {
          <circle [attr.cx]="b.x" [attr.cy]="b.y" [attr.r]="b.r * 1.45" [attr.fill]="b.v > 0.85 ? 'url(#rh-hot)' : b.v > 0.55 ? 'url(#rh-warm)' : 'url(#rh-cool)'" class="blob" (mouseenter)="hover.set($index)" (mouseleave)="hover.set(null)" />
        }
        </g>
        <g class="walls">
          <rect x="4" y="4" width="242" height="137" />
          <path d="M4 40H70M70 4V40M110 4V40M110 40H160M160 4V40M200 4V40M200 40H246M4 75H36M36 75V141M4 108H36M70 141V100M70 100H130M130 100V141M185 141V110M185 110H246M215 40V75M215 75H246" />
        </g>
        <g class="desks">
          @for (d of desks; track $index) {<rect [attr.x]="d[0]" [attr.y]="d[1]" width="7" height="4" rx="0.6" />}
        </g>
        <rect x="218" y="45" width="24" height="27" fill="url(#rh-stairs)" stroke="#6b7280" stroke-width="0.6" />
        <circle cx="96" cy="70" r="6" fill="none" stroke="#6b7280" stroke-width="0.6" /><circle cx="176" cy="70" r="6" fill="none" stroke="#6b7280" stroke-width="0.6" />
      </svg>
      @if (legend()) {
        <div class="lg"><span>High</span><i></i><span>Low</span></div>
      }
      @if (hover() !== null) {<div class="tip">Zone {{ hover()! + 1 }} · {{ pct(blobs()[hover()!].v) }}% occupied</div>}
    </div>
  `,
  styles: `
    :host { display: block; }
    .fh { display: grid; grid-template-columns: 1fr auto; gap: 10px; position: relative; align-items: stretch; }
    .plan { width: 100%; display: block; } .blob { mix-blend-mode: multiply; opacity: 0.92; cursor: pointer; }
    .walls { fill: none; stroke: #4b5563; stroke-width: 1.4; } .desks rect { fill: none; stroke: #4b5563; stroke-width: 0.4; opacity: 0.7; }
    .lg { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: #3b3f5c; }
    .lg i { flex: 1; width: 7px; border-radius: 4px; background: linear-gradient(#ef1d2e, #ffd21f, #4ade80, #22d3ee, #3b82f6); }
    .tip { position: absolute; left: 8px; top: 8px; background: #1e1b3a; color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 6px; }
  `,
})
export class FloorHeat {
  readonly seed = input(0);
  readonly height = input(150);
  readonly legend = input(true);
  protected readonly hover = signal<number | null>(null);
  protected readonly desks: [number, number][] = (() => {
    const out: [number, number][] = [];
    for (const [x0, y0] of [[44, 52], [44, 64], [120, 52], [120, 64], [150, 52], [150, 64], [44, 84], [140, 84], [160, 120], [90, 112], [90, 124], [205, 85], [225, 92]])
      for (let i = 0; i < 3; i++) out.push([x0 + i * 8, y0]);
    return out;
  })();
  protected readonly blobs = computed(() => {
    const s = this.seed();
    if (!s) return EXACT_BLOBS.map(([x, y, r, v]) => ({ x, y, r, v }));
    const R = rnd(s);
    return EXACT_BLOBS.map(([x, y, r]) => ({ x: Math.max(15, Math.min(235, x + (R() - 0.5) * 40)), y: Math.max(15, Math.min(130, y + (R() - 0.5) * 30)), r, v: R() }));
  });
  protected pct(v: number) {
    return Math.round(30 + v * 68);
  }
}

/* ---------- Report preview (tabs + panels), used by the library and the standard reports run view ---------- */
@Component({
  selector: 'rpt-preview',
  imports: [...UI, RptColumns, FloorHeat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = preview();
    @switch (tab()) {
      @case (0) {
        <div class="sum" [class.compact]="compact()">
          <section class="pn">
            <h4>{{ p.donut.title }}</h4>
            <div class="dn">
              <div class="ring">
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#10b981" stroke-width="15" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#6d28d9" stroke-width="15" [attr.stroke-dasharray]="(p.donut.pct / 100) * 314.16 + ' 314.16'" transform="rotate(-90 60 60)" /></svg>
                <div class="mid"><b>{{ p.donut.pct }}%</b><span>{{ p.donut.centre }}</span></div>
              </div>
              <ul class="dl">
                <li><i style="background:#6d28d9"></i>{{ p.donut.a }}<b>{{ p.donut.pct }}%</b></li>
                <li><i style="background:#10b981"></i>{{ p.donut.b }}<b>{{ 100 - p.donut.pct }}%</b></li>
              </ul>
            </div>
            <div class="tot">
              <div><small>{{ p.donut.totalLabel }}</small><b>{{ fmt(p.donut.total) }}</b></div>
              <div><small>{{ p.donut.a }}</small><b><i style="background:#16a34a"></i>{{ fmt(a()) }}</b></div>
              <div><small>{{ p.donut.b }}</small><b><i style="background:#16a34a"></i>{{ fmt(p.donut.total - a()) }}</b></div>
            </div>
          </section>
          <section class="pn">
            <div class="ph"><h4>{{ p.trend.title }}</h4>
              <select class="mini-sel" [value]="range()" (change)="rangeChanged.emit($any($event.target).value)">@for (r of ranges; track r) {<option [value]="r" [selected]="r === range()">{{ r }}</option>}</select>
            </div>
            <rpt-columns [labels]="p.trend.labels" [series]="p.trend.series" [height]="104" />
          </section>
          <section class="pn">
            <h4>{{ p.breakdown.title }}</h4>
            <ul class="br">
              @for (r of p.breakdown.rows; track r.label) {<li><span>{{ r.label }}</span><div><i [style.width.%]="r.pct" [style.background]="r.color"></i></div><b>{{ r.pct }}%</b></li>}
            </ul>
          </section>
          <section class="pn">
            <h4>{{ p.heat.title }}</h4>
            <rpt-floor-heat [seed]="p.heat.seed" [height]="148" />
          </section>
        </div>
      }
      @case (1) {
        <div class="two">
          <section class="pn"><h4>{{ p.trend.title }} <small class="muted">· {{ range() }}</small></h4><rpt-columns [labels]="p.trend.labels" [series]="p.trend.series" [height]="250" /></section>
          <section class="pn"><h4>Period Statistics</h4>
            <table class="table"><thead><tr><th>Series</th><th class="num">Avg</th><th class="num">Peak</th><th class="num">Low</th></tr></thead>
              <tbody>@for (s of p.trend.series; track s.name) {<tr><td><i class="sw" [style.background]="s.color"></i>{{ s.name }}</td><td class="num">{{ avg(s.values) }}%</td><td class="num">{{ max(s.values) }}%</td><td class="num">{{ min(s.values) }}%</td></tr>}</tbody></table>
            <p class="note">Peak day: <b>{{ p.trend.labels[peakIdx()] }}</b> · weekday averages are {{ wkGap() }} pts higher than weekends.</p>
          </section>
        </div>
      }
      @case (2) {
        <div class="two">
          <section class="pn"><h4>{{ p.breakdown.title }}</h4>
            <ul class="br big">@for (r of p.breakdown.rows; track r.label) {<li><span>{{ r.label }}</span><div><i [style.width.%]="r.pct" [style.background]="r.color"></i></div><b>{{ r.pct }}%</b></li>}</ul>
          </section>
          <section class="pn"><h4>Share of Total</h4><app-donut [segments]="segs()" center="Avg" [value]="avg(rowPcts()) + '%'" [size]="150" /></section>
        </div>
      }
      @case (3) {
        <section class="pn"><h4>{{ p.tabs[3] }}</h4><app-column-chart [labels]="floorLabels()" [series]="floorSeries()" [height]="240" suffix="%" [legend]="false" /></section>
      }
      @case (4) {
        <div class="two">
          <section class="pn"><h4>{{ p.tabs[4] }}</h4><app-bar-list [rows]="deptRows()" /></section>
          <section class="pn"><h4>Department Ranking</h4>
            <table class="table"><thead><tr><th>#</th><th>Department</th><th class="num">Rate</th><th>Status</th></tr></thead>
              <tbody>@for (d of deptSorted(); track d.label; let i = $index) {<tr><td>{{ i + 1 }}</td><td>{{ d.label }}</td><td class="num">{{ d.pct }}%</td><td><span [class]="d.pct >= 75 ? 'tag green' : d.pct >= 55 ? 'tag amber' : 'tag red'">{{ d.pct >= 75 ? 'High' : d.pct >= 55 ? 'Moderate' : 'Low' }}</span></td></tr>}</tbody></table>
          </section>
        </div>
      }
      @case (5) {
        <div class="two hm">
          <section class="pn"><h4>{{ p.heat.title }}</h4><rpt-floor-heat [seed]="p.heat.seed" [height]="320" /></section>
          <section class="pn"><h4>Top Hotspots</h4>
            <ul class="hs">@for (h of hotspots(); track h.name) {<li><span class="dot" [style.background]="h.color"></span><div><b>{{ h.name }}</b><small>{{ h.type }}</small></div><b>{{ h.pct }}%</b></li>}</ul>
          </section>
        </div>
      }
    }
  `,
  styles: `
    :host { display: block; }
    h4 { margin: 0 0 10px; font-size: 13px; font-weight: 700; } .muted { color: var(--muted); font-weight: 400; }
    .sum { display: grid; grid-template-columns: 0.98fr 1.1fr 1fr 1.18fr; gap: 10px; }
    .sum.compact { grid-template-columns: 1fr 1fr; }
    .pn { border: 1px solid var(--border); border-radius: 10px; padding: 10px 10px 8px; min-width: 0; }
    .ph { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; } .ph h4 { margin-top: 2px; }
    .mini-sel { font: inherit; font-size: 11px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 6px; background: #fff; margin-top: -2px; }
    .dn { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; }
    .ring { position: relative; width: 120px; height: 120px; } .ring svg { width: 120px; height: 120px; }
    .mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; } .mid b { font-size: 20px; } .mid span { font-size: 10.5px; color: #3b3f5c; }
    .dl { list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; }
    .dl li { display: grid; grid-template-columns: 10px 1fr auto; gap: 7px; align-items: center; } .dl i { width: 9px; height: 9px; border-radius: 50%; } .dl b { font-weight: 600; }
    .tot { display: flex; justify-content: space-between; margin-top: 4px; } .tot div { display: flex; flex-direction: column; font-size: 11px; } .tot div:nth-child(2) { text-align: center; } .tot small { color: #4b4f6b; }
    .tot b { font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; } .tot i { width: 9px; height: 9px; border-radius: 50%; }
    .br { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
    .br li { display: grid; grid-template-columns: 96px 1fr 34px; gap: 8px; align-items: center; font-size: 11px; color: #3b3f5c; } .br span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .br div { height: 12px; background: #eef0f6; border-radius: 2px; overflow: hidden; } .br i { display: block; height: 100%; } .br b { font-weight: 500; text-align: right; }
    .br.big { gap: 16px; } .br.big li { grid-template-columns: 150px 1fr 44px; font-size: 12.5px; } .br.big div { height: 16px; }
    .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; } .two.hm { grid-template-columns: 1.6fr 1fr; }
    .sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; } .note { font-size: 12px; color: #4b4f6b; }
    .hs { list-style: none; margin: 0; padding: 0; } .hs li { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
    .hs div { display: flex; flex-direction: column; } .hs small { color: var(--muted); } .dot { width: 11px; height: 11px; border-radius: 50%; }
    @media (max-width: 1350px) { .sum { grid-template-columns: 1fr 1fr; } .two, .two.hm { grid-template-columns: 1fr; } }
  `,
})
export class ReportPreview {
  readonly preview = input.required<Preview>();
  readonly tab = input(0);
  readonly compact = input(false);
  readonly range = input('Last 30 Days');
  readonly rangeChanged = output<string>();
  protected readonly ranges = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days'];
  protected readonly fmt = fmtNum;
  protected readonly a = computed(() => Math.ceil((this.preview().donut.total * this.preview().donut.pct) / 100));
  protected avg(v: number[]) {
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  }
  protected max(v: number[]) {
    return Math.max(...v);
  }
  protected min(v: number[]) {
    return Math.min(...v);
  }
  protected readonly peakIdx = computed(() => {
    const v = this.preview().trend.series[0].values;
    return v.indexOf(Math.max(...v));
  });
  protected readonly wkGap = computed(() => 6 + (this.preview().donut.pct % 9));
  protected readonly rowPcts = computed(() => this.preview().breakdown.rows.map((r) => r.pct));
  protected readonly segs = computed(() => this.preview().breakdown.rows.map((r) => ({ label: r.label, value: r.pct, color: r.color })));
  protected readonly floorLabels = computed(() => this.preview().floors.map((f) => f.label));
  protected readonly floorSeries = computed(() => [{ name: 'Utilization', color: '#7c3aed', values: this.preview().floors.map((f) => f.pct) }]);
  protected readonly deptRows = computed(() => this.preview().departments.map((d, i) => ({ label: d.label, value: d.pct, display: d.pct + '%', color: BREAK_COLORS[i % 6] })));
  protected readonly deptSorted = computed(() => [...this.preview().departments].sort((a, b) => b.pct - a.pct));
  protected readonly hotspots = computed(() => {
    const names = ['Open Desk Zone A', 'Meeting Room Cluster', 'Collaboration Hub', 'Focus Pods', 'Cafeteria', 'Reception Lounge', 'Project Room 5.12'];
    const R = rnd(this.preview().heat.seed || 11);
    return names
      .map((name, i) => ({ name, type: ['Open Desks', 'Meeting Rooms', 'Collaboration', 'Focus Rooms', 'Cafeteria', 'Common', 'Meeting Rooms'][i], pct: Math.round(45 + R() * 54) }))
      .sort((a, b) => b.pct - a.pct)
      .map((h) => ({ ...h, color: h.pct > 85 ? '#ef1d2e' : h.pct > 70 ? '#f59e0b' : h.pct > 55 ? '#22c55e' : '#3b82f6' }));
  });
}
