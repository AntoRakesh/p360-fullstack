// Reusable dashboard building blocks: KPI card, page header and SVG charts.
import { DatePipe, DecimalPipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppState } from './app-state';
import { Icon } from './icon';
import { SelectValue } from './select-value';
// Re-exported so pages that use the UI array can import these through @p360/shared/ui (Angular compiler needs it).
export { Icon } from './icon';
export { SelectValue } from './select-value';

export interface Series {
  name: string;
  color: string;
  values: number[];
  area?: boolean;
  dashed?: boolean;
  /** Column chart only: draw this series as a line over the bars. */
  line?: boolean;
}
export interface Segment {
  label: string;
  value: number;
  color: string;
}
export interface BarRow {
  label: string;
  value: number;
  max?: number;
  display?: string;
  color?: string;
}

/** Rounds up to a "nice" axis maximum. */
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
/** Tracks the host element width so charts draw at real pixel size (text never scales). */
function hostWidth() {
  const w = signal(600);
  const el = inject(ElementRef<HTMLElement>);
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    const ro = new ResizeObserver(([e]) => w.set(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el.nativeElement);
    destroy.onDestroy(() => ro.disconnect());
  });
  return w;
}

const short = (v: number) =>
  Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}K` : Number.isInteger(v) ? String(v) : v.toFixed(1);

/* ---------------- Page header ---------------- */
@Component({
  selector: 'app-page-head',
  imports: [Icon, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head" [class.crumbs-top]="subtitle()">
      <div>
        @if (subtitle()) {
          <nav class="crumbs top">
            <a [routerLink]="parentLink()">{{ parent() }}</a>
            <app-icon name="chevron-right" [size]="14" />
            <span>{{ crumb() ?? title() }}</span>
          </nav>
        }
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}
            @if (state.site().factor !== 1) {
              <em class="chip">{{ state.site().name }}</em>
            }
          </p>
        } @else {
        <nav class="crumbs">
          <a [routerLink]="parentLink()">{{ parent() }}</a>
          <app-icon name="chevron-right" [size]="14" />
          <span>{{ title() }}</span>
          @if (state.site().factor !== 1) {
            <em class="chip">{{ state.site().name }}</em>
          }
          @if (!state.isToday()) {
            <em class="chip grey">History · {{ state.date() | date: 'd MMM y' }}</em>
          } @else if (state.live()) {
            <em class="chip live"><i></i>Live</em>
          }
        </nav>
        }
      </div>
      <div class="head-btns"><ng-content /></div>
    </div>
  `,
})
export class PageHead {
  protected readonly state = inject(AppState);
  readonly title = input.required<string>();
  readonly parent = input('Command Center & Dashboards');
  readonly parentLink = input('/command-center');
  /** When set, breadcrumb moves above the title and this line shows under it. */
  readonly subtitle = input<string>();
  readonly crumb = input<string>();
}

/* ---------------- KPI card ---------------- */
@Component({
  selector: 'app-kpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card kpi-card' },
  template: `
    <span class="kpi-icon" [style.background]="color()"><app-icon [name]="icon()" [size]="22" /></span>
    <div class="kpi-body">
      <div class="kpi-label" [title]="label()">{{ label() }}</div>
      <div class="kpi-value">{{ value() }}@if (extra()) {<small class="kpi-extra" [style.color]="color()">{{ extra() }}</small>}</div>
      @if (change()) {
        <div class="kpi-change">
          <span [class.good]="good()" [class.bad]="!good()">
            <app-icon [name]="up() ? 'arrow-up' : 'arrow-down'" [size]="12" [stroke]="2.6" />{{ change() }}
          </span>
          {{ sub() || 'vs. yesterday' }}
        </div>
      } @else if (sub()) {
        <div class="kpi-change" [style.color]="subColor()" [style.font-weight]="subColor() ? 600 : null">{{ sub() }}</div>
      }
    </div>
  `,
})
export class Kpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('users');
  readonly color = input('var(--ka-8b5cf6)');
  readonly change = input<string>();
  readonly up = input(true);
  readonly good = input(true);
  /** Caption under the value; with a change it defaults to "vs. yesterday". */
  readonly sub = input('');
  /** Small coloured figure next to the value (e.g. a percentage). */
  readonly extra = input<string>();
  /** Colour for the sub line (when no change is shown). */
  readonly subColor = input<string>();
}

/* ---------------- Line / area chart ---------------- */
@Component({
  selector: 'app-line-chart',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (legend()) {
      <div class="chart-legend">
        @for (s of series(); track s.name) {
          <span><i [style.background]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
    <div class="chart-wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + height()" class="chart">
        <defs>
          @for (s of series(); track s.name; let i = $index) {
            <linearGradient [attr.id]="uid + i" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.3" />
              <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0.02" />
            </linearGradient>
          }
        </defs>
        @for (tk of g().ticks; track $index) {
          <line [attr.x1]="L" [attr.x2]="W() - R" [attr.y1]="tk.y" [attr.y2]="tk.y" class="grid" />
          <text [attr.x]="L - 8" [attr.y]="tk.y + 4" text-anchor="end" class="axis">{{ tk.label }}</text>
        }
        @for (lb of g().labels; track $index) {
          @if (lb.show) {
            <text [attr.x]="lb.x" [attr.y]="height() - 8" text-anchor="middle" class="axis">{{ lb.text }}</text>
          }
        }
        @for (s of g().lines; track s.name; let i = $index) {
          @if (s.area) {
            <path [attr.d]="s.area" [attr.fill]="'url(#' + uid + i + ')'" />
          }
          <path [attr.d]="s.d" fill="none" [attr.stroke]="s.color" stroke-width="2.4" [attr.stroke-dasharray]="s.dashed ? '6 5' : null" />
          @if (g().dots) {
            @for (p of s.pts; track $index) {
              @if (p.ok) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="hover() === $index ? 5.5 : 3.8" fill="var(--ka-ffffff)" [attr.stroke]="s.color" stroke-width="2.2" />
              }
            }
          } @else if (hover() !== null && s.pts[hover()!].ok) {
            <circle [attr.cx]="s.pts[hover()!].x" [attr.cy]="s.pts[hover()!].y" r="5" fill="var(--ka-ffffff)" [attr.stroke]="s.color" stroke-width="2.2" />
          }
        }
        @if (hover() !== null) {
          <line class="cursor" [attr.x1]="g().xs[hover()!]" [attr.x2]="g().xs[hover()!]" [attr.y1]="T" [attr.y2]="g().b" />
        }
        @for (x of g().xs; track $index) {
          <rect class="hit" [attr.x]="x - g().step / 2" [attr.y]="T" [attr.width]="g().step" [attr.height]="g().b - T" (mouseenter)="hover.set($index)" />
        }
      </svg>
      @if (hover() !== null) {
        <div class="chart-tip" [style.left.px]="g().xs[hover()!]">
          <b>{{ labels()[hover()!] }}</b>
          @for (s of series(); track s.name) {
            @if (!isNaN(s.values[hover()!])) {
              <span><i [style.background]="s.color"></i>{{ s.name }}: {{ s.values[hover()!] | number: '1.0-1' }}{{ suffix() }}</span>
            }
          }
        </div>
      }
    </div>
  `,
})
export class LineChart {
  protected readonly isNaN = Number.isNaN;
  private static n = 0;
  protected readonly uid = `lc${LineChart.n++}-`;
  readonly labels = input.required<string[]>();
  readonly series = input.required<Series[]>();
  readonly height = input(220);
  readonly min = input(0);
  readonly max = input<number>();
  readonly suffix = input('');
  readonly legend = input(true);
  protected readonly hover = signal<number | null>(null);
  protected readonly W = hostWidth();
  protected readonly L = 44;
  protected readonly R = 14;
  protected readonly T = 12;
  protected readonly g = computed(() => {
    const H = this.height();
    const b = H - 30;
    const all = this.series().flatMap((s) => s.values).filter((v) => !Number.isNaN(v));
    const min = this.min();
    const max = this.max() ?? min + niceMax((Math.max(...all, min + 1) - min) * 1.08);
    const n = this.labels().length;
    const step = (this.W() - this.L - this.R) / Math.max(n - 1, 1);
    const xs = this.labels().map((_, i) => this.L + i * step);
    const y = (v: number) => b - ((Math.max(v, min) - min) / (max - min)) * (b - this.T);
    const every = Math.ceil(n / Math.max(3, Math.floor(this.W() / 70)));
    const lines = this.series().map((s) => {
      // NaN values create gaps (e.g. actual vs forecast lines).
      const pts = s.values.map((v, i) => ({ x: xs[i], y: Number.isNaN(v) ? 0 : y(v), ok: !Number.isNaN(v) }));
      const d = pts
        .map((p, i) => (p.ok ? `${i && pts[i - 1].ok ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}` : ''))
        .join(' ');
      const valid = pts.filter((p) => p.ok);
      const area = s.area && valid.length ? `${d} L${valid[valid.length - 1].x},${b} L${valid[0].x},${b} Z` : null;
      return { ...s, pts, d, area };
    });
    return {
      b,
      xs,
      step,
      lines,
      dots: n <= 16,
      labels: this.labels().map((text, i) => ({ text, x: xs[i], show: i % every === 0 || i === n - 1 })),
      ticks: [0, 1, 2, 3, 4].map((k) => {
        const v = min + ((max - min) / 4) * k;
        return { y: y(v), label: short(v) + (this.suffix() === '%' ? '%' : '') };
      }),
    };
  });
}

/* ---------------- Column chart (grouped or stacked) ---------------- */
@Component({
  selector: 'app-column-chart',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (legend()) {
      <div class="chart-legend">
        @for (s of series(); track s.name) {
          <span><i [style.background]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
    <div class="chart-wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + height()" class="chart">
        @for (tk of g().ticks; track $index) {
          <line x1="44" [attr.x2]="W() - 14" [attr.y1]="tk.y" [attr.y2]="tk.y" class="grid" />
          <text x="36" [attr.y]="tk.y + 4" text-anchor="end" class="axis">{{ tk.label }}</text>
        }
        @for (grp of g().groups; track $index; let gi = $index) {
          <rect class="hit band" [class.on]="hover() === gi" [attr.x]="grp.x0" y="8" [attr.width]="g().band" [attr.height]="g().b - 8" (mouseenter)="hover.set(gi)" />
          @for (bar of grp.bars; track $index) {
            <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" [attr.fill]="bar.color" rx="2" class="col" />
          }
          @if (grp.show) {
            <text [attr.x]="grp.cx" [attr.y]="height() - 8" text-anchor="middle" class="axis">{{ labels()[gi] }}</text>
          }
        }
        @for (ln of g().lines; track ln.name) {
          <path [attr.d]="ln.d" fill="none" [attr.stroke]="ln.color" stroke-width="2.2" />
          @for (p of ln.pts; track $index) {<circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="3.5" fill="var(--ka-ffffff)" [attr.stroke]="ln.color" stroke-width="2" />}
        }
      </svg>
      @if (hover() !== null) {
        <div class="chart-tip" [style.left.px]="g().groups[hover()!].cx">
          <b>{{ labels()[hover()!] }}</b>
          @for (s of series(); track s.name) {
            <span><i [style.background]="s.color"></i>{{ s.name }}: {{ s.values[hover()!] | number: '1.0-1' }}{{ suffix() }}</span>
          }
        </div>
      }
    </div>
  `,
})
export class ColumnChart {
  readonly labels = input.required<string[]>();
  readonly series = input.required<Series[]>();
  readonly stacked = input(false);
  readonly height = input(220);
  readonly suffix = input('');
  readonly legend = input(true);
  protected readonly hover = signal<number | null>(null);
  protected readonly W = hostWidth();
  protected readonly g = computed(() => {
    const H = this.height();
    const b = H - 30;
    const all = this.series();
    const s = all.filter((x) => !x.line);
    const lineSeries = all.filter((x) => x.line);
    const n = this.labels().length;
    const totals = this.labels().map((_, i) => Math.max(this.stacked() ? s.reduce((a, x) => a + x.values[i], 0) : Math.max(0, ...s.map((x) => x.values[i])), ...lineSeries.map((x) => x.values[i])));
    const max = niceMax(Math.max(...totals, 1) * 1.05);
    const band = (this.W() - 58) / n;
    const y = (v: number) => b - (v / max) * (b - 12);
    const every = Math.ceil(n / Math.max(3, Math.floor(this.W() / 52)));
    const groups = this.labels().map((_, i) => {
      const x0 = 44 + i * band;
      const inner = band * 0.62;
      let acc = 0;
      const bars = s.map((ser, si) => {
        const v = ser.values[i];
        if (this.stacked()) {
          const bar = { x: x0 + (band - inner) / 2, w: inner, y: y(acc + v), h: y(acc) - y(acc + v), color: ser.color };
          acc += v;
          return bar;
        }
        const w = inner / s.length;
        return { x: x0 + (band - inner) / 2 + si * w, w: w - 1, y: y(v), h: b - y(v), color: ser.color };
      });
      return { x0, cx: x0 + band / 2, bars, show: i % every === 0 };
    });
    const lines = lineSeries.map((ln) => {
      const pts = ln.values.map((v, i) => [groups[i].cx, y(v)] as [number, number]);
      return { name: ln.name, color: ln.color, pts, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') };
    });
    return {
      b,
      band,
      groups,
      lines,
      ticks: [0, 1, 2, 3, 4].map((k) => ({ y: y((max / 4) * k), label: short((max / 4) * k) })),
    };
  });
}

/* ---------------- Donut ---------------- */
@Component({
  selector: 'app-donut',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="donut-box">
      <div class="donut-svg" [style.width.px]="size()">
        <svg viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="60" fill="none" stroke="var(--kl-f1f2f7)" stroke-width="24" />
          @for (s of g().segs; track s.label) {
            <circle
              cx="80" cy="80" r="60" fill="none"
              [attr.stroke]="s.color"
              [attr.stroke-width]="hover() === s.label ? 30 : 24"
              [attr.stroke-dasharray]="s.dash"
              [attr.stroke-dashoffset]="s.offset"
              [attr.opacity]="hover() && hover() !== s.label ? 0.35 : 1"
              transform="rotate(-90 80 80)"
              (mouseenter)="hover.set(s.label)"
              (mouseleave)="hover.set(null)"
            />
          }
        </svg>
        <div class="donut-mid">
          <b>{{ g().hovered ? (g().hovered!.value | number) : (value() ?? (g().total | number)) }}</b>
          <span>{{ g().hovered?.label ?? center() }}</span>
        </div>
      </div>
      @if (legend()) {
        <ul class="donut-legend">
          @for (s of g().segs; track s.label) {
            <li [class.dim]="hover() && hover() !== s.label" (mouseenter)="hover.set(s.label)" (mouseleave)="hover.set(null)">
              <i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ s.value | number }}</b><em>{{ s.pct }}%</em>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class Donut {
  readonly segments = input.required<Segment[]>();
  readonly center = input('Total');
  /** Optional text for the centre instead of the summed total (e.g. "92%"). */
  readonly value = input<string>();
  readonly size = input(150);
  readonly legend = input(true);
  protected readonly hover = signal<string | null>(null);
  protected readonly g = computed(() => {
    const C = 2 * Math.PI * 60;
    const total = this.segments().reduce((a, s) => a + s.value, 0) || 1;
    let off = 0;
    const segs = this.segments().map((s) => {
      const len = (s.value / total) * C;
      const out = { ...s, pct: Math.round((s.value / total) * 100), dash: `${Math.max(len - 1.5, 0)} ${C}`, offset: -off };
      off += len;
      return out;
    });
    return { total, segs, hovered: segs.find((s) => s.label === this.hover()) };
  });
}

/* ---------------- Horizontal bar list ---------------- */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="bar-list">
      @for (r of rows(); track r.label; let i = $index) {
        <li [title]="r.label + ': ' + (r.display ?? r.value)">
          <span class="bl-label">{{ r.label }}</span>
          <div class="bl-track"><i [style.width.%]="(r.value / (r.max ?? max())) * 100" [style.background]="r.color ?? (i % 2 ? 'var(--ka-3b82f6)' : 'var(--ka-8b5cf6)')"></i></div>
          <b>{{ r.display ?? r.value }}</b>
        </li>
      }
    </ul>
  `,
})
export class BarList {
  readonly rows = input.required<BarRow[]>();
  readonly max = input(100);
}

/* ---------------- Heatmap ---------------- */
@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="heatmap" [style.grid-template-columns]="'70px repeat(' + cols().length + ', 1fr)'">
      <span></span>
      @for (c of cols(); track c) {
        <span class="hm-col">{{ c }}</span>
      }
      @for (r of rows(); track r; let ri = $index) {
        <span class="hm-row">{{ r }}</span>
        @for (c of cols(); track c; let ci = $index) {
          <span class="hm-cell" [class.light]="data()[ri][ci] < 40" [style.background]="color(data()[ri][ci])" [title]="r + ' · ' + c + ': ' + data()[ri][ci] + suffix()">
            {{ data()[ri][ci] }}
          </span>
        }
      }
    </div>
  `,
})
export class Heatmap {
  readonly rows = input.required<string[]>();
  readonly cols = input.required<string[]>();
  readonly data = input.required<number[][]>();
  readonly suffix = input('%');
  protected color(v: number) {
    const a = Math.min(Math.max(v / 100, 0.06), 1);
    return `rgba(124, 58, 237, ${a.toFixed(2)})`;
  }
}

/* ---------------- Sparkline ---------------- */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="spark"><path [attr.d]="d()" fill="none" [attr.stroke]="color()" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>`,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly color = input('var(--ka-7c3aed)');
  protected readonly d = computed(() => {
    const v = this.values();
    const min = Math.min(...v);
    const max = Math.max(...v);
    return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 100).toFixed(1)},${(27 - ((x - min) / (max - min || 1)) * 24).toFixed(1)}`).join(' ');
  });
}

/* ---------------- Progress ring ---------------- */
@Component({
  selector: 'app-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--kl-eef0f6)" stroke-width="5" />
      <circle cx="22" cy="22" r="18" fill="none" [attr.stroke]="color()" stroke-width="5" stroke-linecap="round"
        [attr.stroke-dasharray]="(value() / 100) * 113.1 + ' 113.1'" transform="rotate(-90 22 22)" class="ring-arc" />
      <text x="22" y="26" text-anchor="middle" class="ring-text">{{ value() }}%</text>
    </svg>
  `,
})
export class Ring {
  readonly value = input.required<number>();
  readonly color = input('var(--ka-7c3aed)');
  readonly size = input(56);
}

export const UI = [PageHead, Kpi, LineChart, ColumnChart, Donut, BarList, Heatmap, Sparkline, Ring, Icon, SelectValue] as const;
