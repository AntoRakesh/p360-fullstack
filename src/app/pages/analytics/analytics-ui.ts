// Local chart / scene components for the Customer & Visitor Analytics module.
import { DecimalPipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, output, signal } from '@angular/core';
import { niceMax, Series } from '../../shared/ui';

function hostWidth(min = 240) {
  const w = signal(600);
  const el = inject(ElementRef<HTMLElement>);
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    const ro = new ResizeObserver(([e]) => w.set(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(el.nativeElement);
    destroy.onDestroy(() => ro.disconnect());
  });
  return w;
}
const fmtTick = (v: number) => v.toLocaleString('en-US');

/* ---------- Line chart with white tooltip card (Footfall Trend, Peak Hours) ---------- */
@Component({
  selector: 'app-ff-line',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + height()" class="chart">
        <defs>
          @for (s of series(); track s.name; let i = $index) {
            <linearGradient [attr.id]="uid + i" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" [attr.stop-color]="s.color" [attr.stop-opacity]="i === 0 ? 0.32 : 0.14" />
              <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0.02" />
            </linearGradient>
          }
        </defs>
        @if (yLabel()) {<text class="axis ylab" [attr.transform]="'translate(11 ' + (T + (g().b - T) / 2) + ') rotate(-90)'" text-anchor="middle">{{ yLabel() }}</text>}
        @for (tk of g().ticks; track $index) {
          <line [attr.x1]="L" [attr.x2]="W() - R" [attr.y1]="tk.y" [attr.y2]="tk.y" class="grid" />
          <text [attr.x]="L - 10" [attr.y]="tk.y + 4" text-anchor="end" class="axis">{{ tk.label }}</text>
        }
        @for (lb of g().labels; track $index) {
          @if (lb.show) {<text [attr.x]="lb.x" [attr.y]="height() - 6" text-anchor="middle" class="axis">{{ lb.text }}</text>}
        }
        @for (s of g().lines; track s.name; let i = $index) {
          @if (s.area) {<path [attr.d]="s.area" [attr.fill]="'url(#' + uid + i + ')'" />}
        }
        @if (active() !== null) {<line class="cursor" [attr.x1]="g().xs[active()!]" [attr.x2]="g().xs[active()!]" [attr.y1]="T" [attr.y2]="g().b" />}
        @for (s of g().lines; track s.name) {
          <path [attr.d]="s.d" fill="none" [attr.stroke]="s.color" stroke-width="2" [attr.stroke-dasharray]="s.dashed ? '6 5' : null" />
          @for (p of s.pts; track $index) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="active() === $index ? 5 : 3.6" [attr.fill]="s.color" stroke="#fff" [attr.stroke-width]="active() === $index ? 2 : 1" />
          }
        }
        @for (x of g().xs; track $index) {
          <rect class="hit" [attr.x]="x - g().step / 2" [attr.y]="T" [attr.width]="g().step" [attr.height]="g().b - T" (mouseenter)="hover.set($index)" (click)="pick.emit($index)" />
        }
      </svg>
      @if (active() !== null) {
        @let i = active()!;
        <div class="tip" [style.left.px]="tipX()" [style.top.px]="tipY()">
          <b>{{ (tipLabels() ?? labels())[i] }}</b>
          @for (s of series(); track s.name) {
            <span><i [style.background]="s.color"></i>{{ s.name }}<em>{{ s.values[i] | number: '1.0-0' }}</em></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .wrap { position: relative; }
    .ylab { font-size: 11px; }
    .tip { position: absolute; transform: translate(10px, 0); min-width: 128px; background: #fff; border: 1px solid #ecebf5; border-radius: 8px; box-shadow: 0 8px 24px rgba(30, 20, 80, .14); padding: 9px 11px; font-size: 11px; display: flex; flex-direction: column; gap: 6px; pointer-events: none; z-index: 3; }
    .tip b { font-weight: 500; color: #3b3f5c; margin-bottom: 1px; }
    .tip span { display: flex; align-items: center; gap: 7px; color: #3b3f5c; }
    .tip i { width: 8px; height: 8px; border-radius: 50%; }
    .tip em { margin-left: auto; padding-left: 16px; font-style: normal; font-weight: 700; color: var(--text); }
  `,
})
export class FfLine {
  private static n = 0;
  protected readonly uid = `ffl${FfLine.n++}-`;
  readonly labels = input.required<string[]>();
  readonly tipLabels = input<string[]>();
  readonly series = input.required<Series[]>();
  readonly height = input(220);
  readonly max = input<number>();
  readonly yLabel = input('');
  /** Index whose tooltip shows when not hovering (null = none). */
  readonly pin = input<number | null>(null);
  /** Show every n-th x label. */
  readonly every = input(1);
  readonly pick = output<number>();
  protected readonly hover = signal<number | null>(null);
  protected readonly active = computed(() => this.hover() ?? this.pin());
  protected readonly W = hostWidth();
  protected get L() { return this.yLabel() ? 58 : 44; }
  protected readonly R = 12;
  protected readonly T = 10;
  protected readonly g = computed(() => {
    const H = this.height();
    const b = H - 28;
    const all = this.series().flatMap((s) => s.values);
    const max = this.max() ?? niceMax(Math.max(...all, 1) * 1.08);
    const n = this.labels().length;
    const L = this.L;
    const pad = this.every() > 1 ? 10 : 18;
    const step = (this.W() - L - this.R - pad * 2) / Math.max(n - 1, 1);
    const xs = this.labels().map((_, i) => L + pad + i * step);
    const y = (v: number) => b - (Math.max(v, 0) / max) * (b - this.T);
    const lines = this.series().map((s) => {
      const pts = s.values.map((v, i) => ({ x: xs[i], y: y(v) }));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const area = s.area ? `${d} L${pts[pts.length - 1].x},${b} L${pts[0].x},${b} Z` : null;
      return { ...s, pts, d, area };
    });
    return {
      b, xs, step, lines, y,
      labels: this.labels().map((text, i) => ({ text, x: xs[i], show: i % this.every() === 0 })),
      ticks: [0, 1, 2, 3, 4].map((k) => ({ y: y((max / 4) * k), label: fmtTick((max / 4) * k) })),
    };
  });
  protected tipX() {
    const i = this.active()!;
    const x = this.g().xs[i];
    return x + 150 > this.W() ? x - 160 : x;
  }
  protected tipY() {
    const i = this.active()!;
    const top = Math.min(...this.g().lines.map((l) => l.pts[i].y));
    return Math.max(0, top - 30);
  }
}

/* ---------- Grouped bars with value labels (Footfall by Zone) ---------- */
@Component({
  selector: 'app-ff-bars',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + height()" class="chart">
        @if (yLabel()) {<text class="axis" [attr.transform]="'translate(11 ' + (12 + (g().b - 12) / 2) + ') rotate(-90)'" text-anchor="middle">{{ yLabel() }}</text>}
        @for (tk of g().ticks; track $index) {
          <line [attr.x1]="L" [attr.x2]="W() - 8" [attr.y1]="tk.y" [attr.y2]="tk.y" class="grid" />
          <text [attr.x]="L - 10" [attr.y]="tk.y + 4" text-anchor="end" class="axis">{{ tk.label }}</text>
        }
        @for (grp of g().groups; track $index; let gi = $index) {
          <rect class="band" [class.on]="hover() === gi || selected() === gi" [attr.x]="grp.x0" y="4" [attr.width]="g().band" [attr.height]="g().b - 4" (mouseenter)="hover.set(gi)" (click)="pick.emit(gi)" />
          @for (bar of grp.bars; track $index) {
            <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" [attr.fill]="bar.color" rx="1.5" class="col" />
            @if (values()) {<text [attr.x]="bar.x + bar.w / 2" [attr.y]="bar.y - 6" text-anchor="middle" class="val">{{ bar.v | number: '1.0-0' }}</text>}
          }
          <text [attr.x]="grp.cx" [attr.y]="height() - 6" text-anchor="middle" class="axis">{{ labels()[gi] }}</text>
        }
      </svg>
      @if (hover() !== null) {
        @let i = hover()!;
        <div class="tip" [style.left.px]="g().groups[i].cx" >
          <b>{{ labels()[i] }}</b>
          @for (s of series(); track s.name) {<span><i [style.background]="s.color"></i>{{ s.name }}<em>{{ s.values[i] | number: '1.0-0' }}</em></span>}
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; } .wrap { position: relative; }
    .band { fill: transparent; cursor: pointer; } .band.on { fill: rgba(124, 58, 237, .06); }
    .col { pointer-events: none; transition: y .4s ease, height .4s ease; }
    .val { font-size: 10.5px; fill: #12142b; font-weight: 500; pointer-events: none; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); background: #fff; border: 1px solid #ecebf5; border-radius: 8px; box-shadow: 0 8px 24px rgba(30, 20, 80, .14); padding: 8px 10px; font-size: 11px; display: flex; flex-direction: column; gap: 5px; pointer-events: none; z-index: 3; min-width: 120px; }
    .tip span { display: flex; gap: 7px; align-items: center; } .tip i { width: 8px; height: 8px; border-radius: 50%; } .tip em { margin-left: auto; font-style: normal; font-weight: 700; padding-left: 12px; }
  `,
})
export class FfBars {
  readonly labels = input.required<string[]>();
  readonly series = input.required<Series[]>();
  readonly height = input(200);
  readonly yLabel = input('');
  readonly values = input(true);
  readonly max = input<number>();
  readonly selected = input<number | null>(null);
  readonly pick = output<number>();
  protected readonly hover = signal<number | null>(null);
  protected readonly W = hostWidth();
  protected get L() { return this.yLabel() ? 58 : 44; }
  protected readonly g = computed(() => {
    const H = this.height();
    const b = H - 26;
    const s = this.series();
    const n = this.labels().length;
    const max = this.max() ?? niceMax(Math.max(...s.flatMap((x) => x.values), 1) * 1.04);
    const L = this.L;
    const band = (this.W() - L - 8) / n;
    const y = (v: number) => b - (v / max) * (b - 12);
    const groups = this.labels().map((_, i) => {
      const x0 = L + i * band;
      const inner = Math.min(band * 0.64, 72);
      const w = inner / s.length;
      return { x0, cx: x0 + band / 2, bars: s.map((ser, si) => ({ v: ser.values[i], x: x0 + (band - inner) / 2 + si * w, w: w - 2, y: y(ser.values[i]), h: b - y(ser.values[i]), color: ser.color })) };
    });
    return { b, band, groups, ticks: [0, 1, 2, 3, 4].map((k) => ({ y: y((max / 4) * k), label: fmtTick((max / 4) * k) })) };
  });
}

/* ---------- Illustrated mall CCTV scene with AI detection boxes ---------- */
interface Walker { x: number; y: number; s: number; c: string; box: string; dx: number; }
const SHIRTS = ['#1f2937', '#7f1d1d', '#1e3a8a', '#065f46', '#f8fafc', '#78350f', '#4c1d95', '#be185d', '#0f766e', '#334155'];
const BOXES = ['#22c55e', '#22c55e', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#22c55e', '#3b82f6'];
@Component({
  selector: 'app-mall-cam',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="mc-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9b3a8" /><stop offset="1" stop-color="#ddd7cc" /></linearGradient>
        <linearGradient id="mc-ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e4da" /><stop offset="1" stop-color="#c9c1b2" /></linearGradient>
        <linearGradient id="mc-shop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fef3c7" /><stop offset="1" stop-color="#d6b98a" /></linearGradient>
      </defs>
      <rect width="600" height="200" fill="url(#mc-ceil)" />
      <!-- floor -->
      <path d="M0 200 L0 70 L600 70 L600 200 Z" fill="url(#mc-floor)" />
      <g stroke="#a8a091" stroke-width=".8" opacity=".55">
        @for (x of floorLines; track $index) {<path [attr.d]="'M300 40 L' + x + ' 200'" />}
        @for (y of [86, 104, 128, 160]; track y) {<path [attr.d]="'M0 ' + y + 'H600'" />}
      </g>
      <!-- left storefronts -->
      <g>
        <path d="M0 0 L150 0 L150 90 L0 120 Z" fill="#3b2f2a" />
        @for (s of leftShops; track $index) {
          <path [attr.d]="s.d" fill="url(#mc-shop)" stroke="#2a211d" stroke-width="2" />
          <path [attr.d]="s.sign" [attr.fill]="s.c" />
        }
        @for (m of mannequins; track $index) {<rect [attr.x]="m[0]" [attr.y]="m[1]" width="3" height="12" rx="1.5" [attr.fill]="m[2]" />}
      </g>
      <!-- right storefronts + escalators -->
      <path d="M470 0 L600 0 L600 120 L470 86 Z" fill="#4b5563" />
      <g stroke="#9ca3af" stroke-width="5" fill="none"><path d="M480 18 L600 130" /><path d="M500 10 L600 98" /></g>
      <g stroke="#1f2937" stroke-width="2.2" fill="none"><path d="M474 12 L600 140" /><path d="M492 6 L600 104" /><path d="M512 2 L600 80" /></g>
      <g fill="#e5e7eb" opacity=".8">@for (k of [0, 1, 2, 3, 4, 5, 6]; track k) {<rect [attr.x]="486 + k * 16" [attr.y]="20 + k * 15" width="10" height="3" />}</g>
      <!-- back wall + skylight -->
      <rect x="150" y="10" width="320" height="62" fill="#d8d2c6" />
      @for (k of [0, 1, 2, 3, 4, 5, 6, 7]; track k) {<rect [attr.x]="160 + k * 39" y="16" width="30" height="40" fill="#f5f1e8" stroke="#bcb3a3" />}
      <rect x="150" y="0" width="320" height="10" fill="#efeae0" />
      <!-- counting zone band -->
      @if (zone()) {<path d="M40 150 L560 150 L590 172 L10 172 Z" fill="#a78bfa" fill-opacity=".18" stroke="#a78bfa" stroke-width="1.4" stroke-dasharray="6 4" />}
      <!-- people -->
      @for (p of people(); track $index) {
        <g [attr.transform]="'translate(' + p.x + ' ' + p.y + ')'">
          <ellipse cx="0" [attr.cy]="p.s * 4.4" [attr.rx]="p.s * 1.4" [attr.ry]="p.s * .4" fill="#000" opacity=".15" />
          <rect [attr.x]="-p.s * 0.55" [attr.y]="p.s * 2.4" [attr.width]="p.s * 0.5" [attr.height]="p.s * 2" fill="#1f2937" />
          <rect [attr.x]="p.s * 0.05" [attr.y]="p.s * 2.4" [attr.width]="p.s * 0.5" [attr.height]="p.s * 2" fill="#111827" />
          <rect [attr.x]="-p.s * 0.75" [attr.y]="p.s * 0.75" [attr.width]="p.s * 1.5" [attr.height]="p.s * 1.9" [attr.rx]="p.s * 0.4" [attr.fill]="p.c" />
          <circle cx="0" cy="0" [attr.r]="p.s * 0.55" fill="#c58c62" />
          <path [attr.d]="'M' + -p.s * .55 + ' ' + -p.s * .1 + 'a' + p.s * .55 + ' ' + p.s * .55 + ' 0 0 1 ' + p.s * 1.1 + ' 0'" fill="#2b1d16" />
          @if (boxes()) {<rect [attr.x]="-p.s * 1.15" [attr.y]="-p.s * 0.9" [attr.width]="p.s * 2.3" [attr.height]="p.s * 5.5" fill="none" [attr.stroke]="p.box" stroke-width="1.4" />}
        </g>
      }
      @if (offline()) {
        <rect width="600" height="200" fill="#0f172a" opacity=".82" />
        <text x="300" y="104" text-anchor="middle" fill="#fff" font-size="16" font-weight="600">Camera offline · reconnecting…</text>
      }
    </svg>
  `,
  styles: `:host { display: block; position: relative; overflow: hidden; } svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }`,
})
export class MallCam {
  readonly tick = input(0);
  readonly count = input(34);
  readonly boxes = input(true);
  readonly zone = input(true);
  readonly offline = input(false);
  readonly seed = input(3);
  protected readonly floorLines = [-600, -300, -100, 60, 200, 300, 400, 540, 700, 900, 1200];
  protected readonly leftShops = [
    { d: 'M4 30 L60 22 L60 108 L4 118 Z', sign: 'M4 30 L60 22 L60 30 L4 38 Z', c: '#111827' },
    { d: 'M68 20 L140 10 L140 92 L68 106 Z', sign: 'M68 20 L140 10 L140 18 L68 28 Z', c: '#7f1d1d' },
  ];
  protected readonly mannequins = [[14, 80, '#e11d48'], [26, 78, '#f8fafc'], [40, 76, '#1d4ed8'], [80, 70, '#facc15'], [96, 68, '#f8fafc'], [112, 66, '#16a34a'], [126, 64, '#111827']] as [number, number, string][];
  private readonly base = computed<Walker[]>(() => {
    let s = this.seed() * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: this.count() }, (_, i) => {
      const y = 70 + r() * 112;
      const depth = (y - 60) / 140;
      const spread = 140 + depth * 420;
      return { x: 300 + (r() - 0.5) * spread * 1.1, y, s: 3.4 + depth * 8.5, c: SHIRTS[i % SHIRTS.length], box: BOXES[(i * 3) % BOXES.length], dx: (r() - 0.5) * 2.4 };
    }).sort((a, b) => a.y - b.y);
  });
  protected readonly people = computed(() => {
    const t = this.tick();
    return this.base().map((p) => ({ ...p, x: p.x + p.dx * (t % 12) * p.s * 0.35, y: p.y + ((t + p.x) % 3) * 0.3 }));
  });
}

/* ---------- Mall floor plan with heat blobs, zones and trajectories ---------- */
export interface MapZone { id: string; name: string; x: number; y: number; w: number; h: number; color: string; pct?: number; }
export interface Blob { x: number; y: number; r: number; v: number; }
export interface MapMarker { id: string; x: number; y: number; color: string; label?: string; title?: string; }
export interface Track { points: [number, number][]; color: string; id?: string; }
@Component({
  selector: 'app-mall-map',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="vb()" preserveAspectRatio="xMidYMid meet" (mouseleave)="hoverZone.set(null)">
      <defs>
        <radialGradient [attr.id]="uid + 'hot'"><stop offset="0" stop-color="#ff0000" /><stop offset=".2" stop-color="#ff1a1a" /><stop offset=".36" stop-color="#ff7a00" /><stop offset=".5" stop-color="#ffe600" /><stop offset=".66" stop-color="#2ee05a" stop-opacity=".85" /><stop offset=".85" stop-color="#1e9bff" stop-opacity=".5" /><stop offset="1" stop-color="#1e6bff" stop-opacity="0" /></radialGradient>
        <radialGradient [attr.id]="uid + 'warm'"><stop offset="0" stop-color="#ffd400" /><stop offset=".4" stop-color="#46e05a" stop-opacity=".9" /><stop offset=".75" stop-color="#1e9bff" stop-opacity=".5" /><stop offset="1" stop-color="#1e6bff" stop-opacity="0" /></radialGradient>
        <radialGradient [attr.id]="uid + 'cool'"><stop offset="0" stop-color="#22d3ee" stop-opacity=".9" /><stop offset=".6" stop-color="#3b82f6" stop-opacity=".45" /><stop offset="1" stop-color="#3b82f6" stop-opacity="0" /></radialGradient>
        <filter [attr.id]="uid + 'blur'" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
        <marker [attr.id]="uid + 'arr'" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker>
        <clipPath [attr.id]="uid + 'clip'"><rect x="12" y="10" width="976" height="310" /></clipPath>
        <pattern [attr.id]="uid + 'tile'" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#dfe2e8" stroke-width=".6" /></pattern>
      </defs>
      <rect x="0" y="0" width="1000" height="330" fill="#eef0f4" />
      <rect x="10" y="8" width="980" height="314" [attr.fill]="'url(#' + uid + 'tile)'" stroke="#5b6170" stroke-width="4" />
      <!-- concourse -->
      <rect x="14" y="176" width="972" height="16" fill="#f7f8fa" />
      <!-- rooms -->
      @for (z of zones(); track z.id) {
        <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" fill="#f8f9fb" fill-opacity=".55" stroke="#7b8190" stroke-width="2" />
      }
      <g stroke="#a3a9b6" stroke-width="1.2" fill="none">
        @for (l of details(); track $index) {<path [attr.d]="l" />}
      </g>
      <g fill="#c3c8d2">@for (c of columns; track $index) {<rect [attr.x]="c[0] - 4" [attr.y]="c[1] - 4" width="8" height="8" />}</g>
      @if (showHeat()) {
        <g [attr.clip-path]="'url(#' + uid + 'clip)'"><g [attr.filter]="'url(#' + uid + 'blur)'" [attr.opacity]="heatOpacity()" style="mix-blend-mode: multiply">
          @for (b of base; track $index) {<circle [attr.cx]="b[0]" [attr.cy]="b[1]" r="74" [attr.fill]="'url(#' + uid + 'cool)'" opacity=".55" />}
          @for (b of blobs(); track $index) {
            <circle [attr.cx]="b.x" [attr.cy]="b.y" [attr.r]="b.r" [attr.fill]="'url(#' + uid + (b.v > 0.55 ? 'hot' : b.v > 0.32 ? 'warm' : 'cool') + ')'" />
          }
        </g></g>
      }
      @if (showZones()) {
        @for (z of zones(); track z.id) {
          <rect [attr.x]="z.x + 2" [attr.y]="z.y + 2" [attr.width]="z.w - 4" [attr.height]="z.h - 4" [attr.fill]="z.color" fill-opacity=".12" [attr.stroke]="z.color" [attr.stroke-width]="selected() === z.id ? 4 : 2" stroke-dasharray="7 4" />
        }
      }
      @for (t of tracks(); track $index) {
        <polyline [attr.points]="pts(t.points)" fill="none" [attr.stroke]="t.color" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" [attr.marker-end]="'url(#' + uid + 'arr)'" [attr.opacity]="selTrack() && selTrack() !== t.id ? 0.18 : 0.9" />
        <circle [attr.cx]="t.points[0][0]" [attr.cy]="t.points[0][1]" r="5" [attr.fill]="t.color" stroke="#fff" stroke-width="2" />
      }
      <!-- zone hit areas -->
      @for (z of zones(); track z.id) {
        <rect class="hit" [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" (mouseenter)="hoverZone.set(z)" (click)="zoneClick.emit(z.id)" />
      }
      @for (m of markers(); track m.id) {
        <g class="mk" [attr.transform]="'translate(' + m.x + ' ' + m.y + ')'" (click)="markerClick.emit(m.id)">
          <title>{{ m.title ?? m.id }}</title>
          @if (m.id === selected()) {<circle r="17" [attr.fill]="m.color" opacity=".25" />}
          <circle r="10" [attr.fill]="m.color" stroke="#fff" stroke-width="2.5" />
          @if (m.label) {<text y="24" text-anchor="middle" class="ml">{{ m.label }}</text>}
        </g>
      }
      @if (labels()) {
        @for (z of labelled(); track z.id) {
          <g class="lbl" [attr.transform]="'translate(' + z.lx + ' ' + z.ly + ')'" (click)="zoneClick.emit(z.id)">
            @let k = labelSize() / 15;
            @if (z.pin) {<circle [attr.cx]="-16 * k" cy="0" [attr.r]="11 * k" fill="#7c3aed" stroke="#fff" stroke-width="2" /><circle [attr.cx]="-16 * k" [attr.cy]="-1.5 * k" [attr.r]="3.4 * k" fill="#fff" />}
            <rect x="0" [attr.y]="-13 * k" [attr.width]="(z.name.length * 8.4 + 18) * k" [attr.height]="26 * k" [attr.rx]="5 * k" fill="#fff" [attr.stroke]="selected() === z.id ? '#7c3aed' : '#e5e7eb'" />
            <text [attr.x]="9 * k" [attr.y]="5 * k" class="lt" [style.font-size.px]="labelSize()">{{ z.name }}</text>
          </g>
        }
      }
    </svg>
    @if (hoverZone(); as z) {
      <div class="tip" [style.left.%]="((z.x + z.w / 2 - vbx()) / vbw()) * 100" [style.top.%]="((z.y - vby()) / vbh()) * 100">
        <b>{{ z.name }}</b>@if (z.pct !== undefined) {<span>Density {{ z.pct }}% of capacity</span>}
      </div>
    }
  `,
  styles: `
    :host { display: block; position: relative; } svg { width: 100%; height: 100%; display: block; }
    .hit { fill: transparent; cursor: pointer; } .lbl, .mk { cursor: pointer; } .ml { font-size: 10px; font-weight: 600; fill: #12142b; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
    .lt { font-size: 15px; font-weight: 600; fill: #12142b; }
    .tip { position: absolute; transform: translate(-50%, -100%); background: #1e1b3a; color: #fff; padding: 6px 9px; border-radius: 7px; font-size: 11px; pointer-events: none; display: flex; flex-direction: column; white-space: nowrap; z-index: 3; }
  `,
})
export class MallMap {
  private static n = 0;
  protected readonly uid = `mm${MallMap.n++}-`;
  readonly zones = input.required<MapZone[]>();
  readonly blobs = input<Blob[]>([]);
  readonly tracks = input<Track[]>([]);
  readonly markers = input<MapMarker[]>([]);
  readonly markerClick = output<string>();
  readonly selTrack = input<string | null>(null);
  readonly showHeat = input(true);
  readonly showZones = input(false);
  readonly labels = input(true);
  /** Zone ids that get a label pill; empty = all. */
  readonly labelIds = input<string[]>([]);
  readonly pinId = input<string | null>(null);
  readonly selected = input<string | null>(null);
  readonly heatOpacity = input(0.9);
  readonly labelSize = input(15);
  readonly zoom = input(1);
  readonly zoneClick = output<string>();
  protected readonly hoverZone = signal<MapZone | null>(null);
  protected readonly vbw = computed(() => 1000 / this.zoom());
  protected readonly vbh = computed(() => 330 / this.zoom());
  protected readonly vbx = computed(() => (1000 - this.vbw()) / 2);
  protected readonly vby = computed(() => (330 - this.vbh()) / 2);
  protected readonly vb = computed(() => `${this.vbx()} ${this.vby()} ${this.vbw()} ${this.vbh()}`);
  protected readonly base = Array.from({ length: 13 * 5 }, (_, i) => [30 + (i % 13) * 78, 30 + Math.floor(i / 13) * 68]);
  protected readonly columns = [[260, 184], [390, 184], [520, 184], [690, 184], [810, 184], [340, 96], [685, 96]];
  protected readonly details = computed(() => {
    const out: string[] = [];
    for (const z of this.zones()) {
      // shelving / seating rows inside each room
      const rows = Math.floor(z.h / 34);
      for (let r = 1; r < rows; r++) out.push(`M${z.x + 14} ${z.y + r * 34}h${Math.max(10, z.w * 0.32)}M${z.x + z.w * 0.56} ${z.y + r * 34}h${Math.max(10, z.w * 0.3)}`);
      out.push(`M${z.x + z.w / 2 - 14} ${z.y + z.h}h28`);
    }
    return out;
  });
  protected readonly labelled = computed(() => {
    const ids = this.labelIds();
    return this.zones()
      .filter((z) => !ids.length || ids.includes(z.id))
      .map((z) => {
        const pin = z.id === this.pinId();
        const k = this.labelSize() / 15;
        let name = z.name;
        if ((name.length * 8.4 + 18) * k > z.w) name = name.replace('Parking ', 'P. ').replace('Main ', '');
        const w = (name.length * 8.4 + 18) * k;
        const top = z.y < 150;
        return { ...z, name, pin, lx: Math.max(pin ? 30 * k : 14, Math.min(z.x + z.w / 2 - w / 2 + (pin ? 14 * k : 0), 985 - w)), ly: top ? z.y + 18 * k : z.y + z.h - 16 * k };
      });
  });
  protected pts(p: [number, number][]) {
    return p.map((x) => x.join(',')).join(' ');
  }
}

/** Heat blobs derived from zone densities (deterministic spread inside each zone). */
export function zoneBlobs(zones: { x: number; y: number; w: number; h: number; pct: number }[], shift = 0): Blob[] {
  const out: Blob[] = [];
  zones.forEach((z, zi) => {
    const v = Math.min(1, z.pct / 100);
    const n = Math.max(2, Math.round((z.w * z.h) / 7000));
    for (let k = 0; k < n; k++) {
      const fx = ((zi * 37 + k * 53 + shift * 7) % 100) / 100;
      const fy = ((zi * 61 + k * 29 + shift * 3) % 100) / 100;
      const local = v * (0.55 + (((zi + k * 3 + shift) % 5) / 5) * 0.6);
      out.push({ x: z.x + 20 + fx * (z.w - 40), y: z.y + 18 + fy * (z.h - 36), r: 34 + local * 52, v: Math.min(1, local * 1.08) });
    }
  });
  return out;
}
