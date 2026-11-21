import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '../icon';

/** Illustrated floor-plan map (SVG, viewBox 1000 × 560) used by RTLS and Emergency pages. */
export interface MapZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  kind?: 'safe' | 'restricted' | 'hazard' | 'transit' | 'open';
  /** Fill strength 0–1 (default 0.16). */
  fill?: number;
  dashed?: boolean;
}
export interface MapMarker {
  id: string;
  x: number;
  y: number;
  color: string;
  kind?: 'avatar' | 'dot' | 'icon' | 'pill';
  label?: string;
  icon?: string;
  alert?: boolean;
  pulse?: boolean;
  size?: number;
  title?: string;
}
export interface MapPath {
  points: [number, number][];
  color: string;
  dashed?: boolean;
  arrow?: boolean;
  width?: number;
}
export interface MapCallout {
  x: number;
  y: number;
  title: string;
  lines: string[];
  initials?: string;
  icon?: string;
  color?: string;
}

const W = 1000;
const H = 560;

@Component({
  selector: 'app-floor-plan',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fp" [style.height.px]="height()" [class.grab]="dragging()" [class.draw]="drawMode()">
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="xMidYMid meet" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointerleave)="dragging.set(false)" (wheel)="wheel($event)">
        <defs>
          <pattern id="fp-tiles" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--kl-e9ebf2)" stroke-width="0.6" /></pattern>
          <marker id="fp-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker>
        </defs>
        <g [attr.transform]="transform()">
          @if (outdoor()) {
            <rect x="-400" y="-300" width="1800" height="1160" fill="var(--ka-eef3ea)" />
            <path [attr.d]="'M' + (b().x + b().w + 40) + ' -300V860'" stroke="var(--kl-d9dde6)" stroke-width="26" fill="none" />
            @for (t of trees; track $index) {<circle [attr.cx]="t[0]" [attr.cy]="t[1]" [attr.r]="t[2]" fill="var(--ka-9bc79a)" opacity="0.75" /><circle [attr.cx]="t[0] - 2" [attr.cy]="t[1] - 2" [attr.r]="t[2] * 0.5" fill="var(--ka-b7dab4)" />}
          }
          <rect [attr.x]="b().x" [attr.y]="b().y" [attr.width]="b().w" [attr.height]="b().h" fill="var(--ka-fbfbfd)" />
          <rect [attr.x]="b().x" [attr.y]="b().y" [attr.width]="b().w" [attr.height]="b().h" fill="url(#fp-tiles)" stroke="var(--kl-3f4457)" stroke-width="5" />
          <!-- furniture -->
          @for (d of desks(); track $index) {<rect [attr.x]="d[0]" [attr.y]="d[1]" [attr.width]="d[2]" [attr.height]="d[3]" rx="1.5" fill="var(--ka-e3e6ee)" stroke="var(--kl-c9cdd8)" stroke-width="0.7" />}
          @for (p of plants(); track $index) {<circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="6" fill="var(--ka-86c387)" stroke="var(--kl-5fa862)" stroke-width="1" />}
          @if (heat(); as hm) {
            @for (row of hm; track ri; let ri = $index) {
              @for (v of row; track ci; let ci = $index) {
                @if (v > 0.04) {<rect [attr.x]="b().x + (ci * b().w) / row.length" [attr.y]="b().y + (ri * b().h) / hm.length" [attr.width]="b().w / row.length + 0.5" [attr.height]="b().h / hm.length + 0.5" [attr.fill]="heatColor(v)" [attr.opacity]="0.25 + v * 0.5" />}
              }
            }
          }
          @if (showZones()) {
            @for (z of zones(); track z.id) {
              <g class="zone" [class.sel]="z.id === selectedZone()" (click)="zoneClick.emit(z.id)">
                <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" [attr.fill]="z.color" [attr.fill-opacity]="z.fill ?? 0.16" [attr.stroke]="z.color" [attr.stroke-width]="z.id === selectedZone() ? 4 : 2.4" [attr.stroke-dasharray]="z.dashed ? '8 5' : null" rx="2" />
                @if (showLabels()) {
                  <rect [attr.x]="z.x + z.w / 2 - lw(z.name) / 2" [attr.y]="z.y + z.h - 30" [attr.width]="lw(z.name)" height="20" rx="4" fill="var(--ka-ffffff)" fill-opacity="0.92" />
                  <text [attr.x]="z.x + z.w / 2" [attr.y]="z.y + z.h - 16" text-anchor="middle" class="zl">{{ z.name }}</text>
                }
              </g>
            }
          } @else {
            @for (z of zones(); track z.id) {<rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" fill="none" stroke="var(--kl-7d8396)" stroke-width="2" />}
          }
          @for (p of paths(); track $index) {
            <polyline [attr.points]="pts(p.points)" fill="none" [attr.stroke]="p.color" [attr.stroke-width]="p.width ?? 3" [attr.stroke-dasharray]="p.dashed ? '9 7' : null" stroke-linecap="round" stroke-linejoin="round" [attr.marker-end]="p.arrow ? 'url(#fp-arrow)' : null" />
          }
          @if (draft(); as d) {<rect [attr.x]="d.x" [attr.y]="d.y" [attr.width]="d.w" [attr.height]="d.h" fill="var(--ka-7c3aed)" fill-opacity="0.12" stroke="var(--kl-7c3aed)" stroke-width="2" stroke-dasharray="6 4" />}
          @for (m of markers(); track m.id) {
            @let s = (m.size ?? (m.kind === 'dot' ? 5 : 17));
            <g class="mk" [attr.transform]="'translate(' + m.x + ',' + m.y + ')'" (click)="$event.stopPropagation(); markerClick.emit(m.id)">
              @if (m.title) {<title>{{ m.title }}</title>}
              @switch (m.kind ?? 'avatar') {
                @case ('dot') {<circle [attr.r]="s" [attr.fill]="m.color" fill-opacity="0.75" stroke="var(--kl-ffffff)" stroke-width="1.2" />}
                @case ('icon') {
                  @if (m.pulse) {<circle [attr.r]="s + 6" [attr.fill]="m.color" opacity="0.25" class="pulse" />}
                  <rect [attr.x]="-s" [attr.y]="-s" [attr.width]="s * 2" [attr.height]="s * 2" [attr.rx]="m.label ? s : 5" [attr.fill]="m.color" stroke="var(--kl-ffffff)" stroke-width="2" />
                  <foreignObject [attr.x]="-s" [attr.y]="-s" [attr.width]="s * 2" [attr.height]="s * 2"><div class="fo-ic"><app-icon [name]="m.icon ?? 'map-pin'" [size]="s * 1.15" /></div></foreignObject>
                }
                @case ('pill') {
                  <rect [attr.x]="-lw(m.label ?? '') / 2 - 4" y="-12" [attr.width]="lw(m.label ?? '') + 8" height="24" rx="5" [attr.fill]="m.color" />
                  <text y="5" text-anchor="middle" class="pl">{{ m.label }}</text>
                }
                @default {
                  @if (m.pulse || m.id === selectedId()) {<circle [attr.r]="s + 7" [attr.fill]="m.color" opacity="0.22" class="pulse" />}
                  <path [attr.d]="'M0 ' + (s + 9) + 'L-6 ' + (s - 1) + 'H6Z'" [attr.fill]="m.color" />
                  <circle [attr.r]="s" fill="var(--ka-ffffff)" [attr.stroke]="m.color" [attr.stroke-width]="m.id === selectedId() ? 4.5 : 3.2" />
                  <circle [attr.r]="s - 4" [attr.fill]="m.color" fill-opacity="0.14" />
                  <text y="4.5" text-anchor="middle" class="ini" [attr.fill]="m.color">{{ m.label }}</text>
                  @if (m.alert) {<g [attr.transform]="'translate(' + (s * 0.85) + ',' + -(s * 0.85) + ')'"><circle r="8.5" fill="var(--ka-ef4444)" stroke="var(--kl-ffffff)" stroke-width="2" /><text y="4" text-anchor="middle" class="ex">!</text></g>}
                }
              }
            </g>
          }
          @if (callout(); as c) {
            <g [attr.transform]="'translate(' + cx(c.x) + ',' + cy(c.y) + ')'">
              <foreignObject x="0" y="0" width="190" height="86">
                <div class="co">
                  @if (c.icon) {<span class="co-ic" [style.background]="c.color ?? 'var(--ka-ef4444)'"><app-icon [name]="c.icon" [size]="18" /></span>}
                  @else if (c.initials) {<span class="co-av" [style.border-color]="c.color ?? 'var(--ka-7c3aed)'" [style.color]="c.color ?? 'var(--ka-7c3aed)'">{{ c.initials }}</span>}
                  <div><b>{{ c.title }}</b>@for (l of c.lines; track $index) {<small>{{ l }}</small>}</div>
                </div>
              </foreignObject>
            </g>
          }
        </g>
      </svg>
      @if (tools()) {
        <div class="tools">
          <button title="Zoom in" (click)="zoomBy(1.25)"><app-icon name="plus" [size]="18" /></button>
          <button title="Zoom out" (click)="zoomBy(0.8)"><app-icon name="minus" [size]="18" /></button>
          <button title="Reset view" (click)="reset()"><app-icon name="map-pin" [size]="17" /></button>
          <button title="Toggle zones" [class.on]="showZones()" (click)="showZones.set(!showZones())"><app-icon name="map-floor" [size]="17" /></button>
          <button title="Full screen" (click)="full($event)"><app-icon name="maximize" [size]="17" /></button>
        </div>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host { display: block; }
    .fp { position: relative; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--kb-f4f5f9); touch-action: none; }
    .fp:fullscreen { border-radius: 0; height: 100vh !important; }
    .fp.grab { cursor: grabbing; } .fp.draw { cursor: crosshair; }
    svg { width: 100%; height: 100%; display: block; user-select: none; }
    .zone { cursor: pointer; } .zone:hover rect:first-child { fill-opacity: 0.28; }
    .zl { font: 600 12.5px Inter, sans-serif; fill: var(--ka-1f2233); pointer-events: none; }
    .pl { font: 700 13px Inter, sans-serif; fill: var(--ka-ffffff); }
    .mk { cursor: pointer; transition: transform 2.4s linear; } .ini { font: 700 11px Inter, sans-serif; } .ex { font: 800 11px Inter, sans-serif; fill: var(--ka-ffffff); }
    .pulse { animation: pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes pulse { 0% { transform: scale(0.6); opacity: 0.5; } 100% { transform: scale(1.5); opacity: 0; } }
    .fo-ic { width: 100%; height: 100%; display: grid; place-items: center; color: var(--kf-ffffff); }
    .co { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: var(--kb-ffffff); border-radius: 10px; box-shadow: 0 6px 18px rgba(20, 20, 50, 0.18); font: 12px Inter, sans-serif; margin: 2px; }
    .co div { display: flex; flex-direction: column; } .co b { font-size: 12.5px; } .co small { color: var(--kf-555a70); font-size: 11px; }
    .co-ic { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); flex: none; }
    .co-av { width: 34px; height: 34px; border-radius: 50%; border: 2.5px solid; display: grid; place-items: center; font-weight: 700; flex: none; }
    .tools { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 8px; }
    .tools button { width: 38px; height: 38px; border-radius: 9px; border: 1px solid var(--border); background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; color: var(--kf-333333); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06); }
    .tools button.on { color: var(--primary); } .tools button:hover { background: var(--kb-faf8ff); }
  `,
})
export class FloorPlan {
  readonly zones = input<MapZone[]>([]);
  readonly markers = input<MapMarker[]>([]);
  readonly paths = input<MapPath[]>([]);
  readonly heat = input<number[][] | null>(null);
  readonly callout = input<MapCallout | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly selectedZone = input<string | null>(null);
  readonly building = input({ x: 20, y: 20, w: 960, h: 520 });
  readonly outdoor = input(false);
  readonly showLabels = input(true);
  readonly tools = input(true);
  readonly height = input(420);
  readonly drawMode = input(false);
  readonly seed = input(1);

  readonly markerClick = output<string>();
  readonly zoneClick = output<string>();
  /** Emitted in draw mode with the rectangle the user dragged. */
  readonly drawn = output<{ x: number; y: number; w: number; h: number }>();

  readonly showZones = signal(true);
  protected readonly w = W;
  protected readonly h = H;
  protected readonly zoom = signal(1);
  protected readonly center = signal<[number, number]>([W / 2, H / 2]);
  protected readonly dragging = signal(false);
  protected readonly draft = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private start: { cx: number; cy: number; p: [number, number]; vx: number; vy: number } | null = null;

  protected readonly b = this.building;
  protected readonly transform = computed(() => {
    const [x, y] = this.center();
    return `translate(${W / 2} ${H / 2}) scale(${this.zoom()}) translate(${-x} ${-y})`;
  });
  protected readonly trees = [
    [-60, 60, 18], [-40, 260, 22], [-70, 480, 16], [1060, 40, 20], [1080, 200, 16], [1050, 520, 24], [870, 600, 18], [300, 610, 20], [600, 620, 16], [130, -40, 18], [700, -50, 20],
  ];
  /** Desk rows inside each open/office zone and the gaps between zones. */
  protected readonly desks = computed(() => {
    const out: number[][] = [];
    for (const z of this.zones()) {
      if (z.kind === 'transit' || z.w < 90 || z.h < 80) continue;
      const cols = Math.floor((z.w - 30) / 46);
      const rows = Math.floor((z.h - 50) / 34);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([z.x + 18 + c * 46, z.y + 14 + r * 34, 30, 14]);
    }
    return out;
  });
  protected readonly plants = computed(() => this.zones().filter((_, i) => i % 2 === 0).map((z) => [z.x + 10, z.y + 10]));

  protected lw(s: string) {
    return s.length * 7.2 + 16;
  }
  protected pts(p: [number, number][]) {
    return p.map((x) => x.join(',')).join(' ');
  }
  protected cx(x: number) {
    return x > 760 ? x - 210 : x + 22;
  }
  protected cy(y: number) {
    return Math.min(Math.max(y - 70, 0), 470);
  }
  protected heatColor(v: number) {
    return v > 0.75 ? 'var(--ka-ef4444)' : v > 0.5 ? 'var(--ka-f97316)' : v > 0.3 ? 'var(--ka-facc15)' : 'var(--ka-22c55e)';
  }

  zoomBy(f: number) {
    this.zoom.update((z) => Math.min(4, Math.max(0.6, z * f)));
  }
  reset() {
    this.zoom.set(1);
    this.center.set([W / 2, H / 2]);
  }
  /** Center and zoom on a point (used by "Locate on Map"). */
  focus(x: number, y: number, z = 2) {
    this.center.set([x, y]);
    this.zoom.set(z);
  }
  protected full(e: Event) {
    const el = (e.currentTarget as HTMLElement).closest('.fp') as HTMLElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }
  private toMap(e: PointerEvent): [number, number] {
    const svg = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const k = Math.max(W / svg.width, H / svg.height);
    const ox = (svg.width * k - W) / 2;
    const oy = (svg.height * k - H) / 2;
    const vx = (e.clientX - svg.left) * k - ox;
    const vy = (e.clientY - svg.top) * k - oy;
    const [cx, cy] = this.center();
    return [(vx - W / 2) / this.zoom() + cx, (vy - H / 2) / this.zoom() + cy];
  }
  protected down(e: PointerEvent) {
    if ((e.target as Element).closest('.mk')) return;
    const p = this.toMap(e);
    this.start = { cx: e.clientX, cy: e.clientY, p, vx: this.center()[0], vy: this.center()[1] };
    if (this.drawMode()) this.draft.set({ x: p[0], y: p[1], w: 0, h: 0 });
  }
  protected move(e: PointerEvent) {
    if (!this.start || !e.buttons) return;
    if (this.drawMode()) {
      const p = this.toMap(e);
      const s = this.start.p;
      this.draft.set({ x: Math.min(s[0], p[0]), y: Math.min(s[1], p[1]), w: Math.abs(p[0] - s[0]), h: Math.abs(p[1] - s[1]) });
      return;
    }
    const dx = e.clientX - this.start.cx;
    const dy = e.clientY - this.start.cy;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    this.dragging.set(true);
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const k = Math.max(W / rect.width, H / rect.height) / this.zoom();
    this.center.set([this.start.vx - dx * k, this.start.vy - dy * k]);
  }
  protected up(_e: PointerEvent) {
    const d = this.draft();
    if (this.drawMode() && d && d.w > 20 && d.h > 20) this.drawn.emit({ x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h) });
    this.draft.set(null);
    this.start = null;
    this.dragging.set(false);
  }
  protected wheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
  }
}
