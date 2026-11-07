// Illustrated architectural floor plan for the Safety Command Center (SVG 640 × 380, zoom / pan).
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/icon';

export interface SMarker {
  id: string;
  x: number;
  y: number;
  kind: 'person' | 'incident' | 'hazard' | 'exit' | 'assembly' | 'fire';
  icon?: string;
  title?: string;
  color?: string;
  sel?: boolean;
}
export interface SCallout {
  x: number;
  y: number;
  title: string;
  lines: string[];
  people: string;
  icon: string;
  /** Show the card to the left of the anchor point. */
  flip?: boolean;
}
export const MAP_W = 640;
export const MAP_H = 380;

/** Where each named location sits on the plan. */
export const LOC_XY: Record<string, [number, number]> = {
  'Production Area': [176, 212], 'Maintenance Room': [596, 150], Warehouse: [372, 150], 'Construction Area': [300, 285], 'Office Area': [70, 300],
  'Loading Dock': [598, 300], 'Server Room': [505, 165], 'Main Entrance': [345, 345], 'Chemical Store': [470, 300], Canteen: [520, 50], Parking: [610, 360], Workshop: [60, 120],
};
/** Evacuation routes from the production area to the east and south exits. */
export const ROUTES: [number, number][][] = [
  [[188, 196], [240, 158], [300, 128], [378, 116], [404, 140], [414, 200], [418, 245], [508, 245]],
  [[418, 245], [412, 290], [404, 318]],
];

type R = [number, number, number, number];
@Component({
  selector: 'app-safety-map',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vp" [class.grab]="drag()" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="drag.set(false); start = null" (pointerleave)="drag.set(false); start = null" (wheel)="wheel($event)">
      <div class="layer" [style.transform]="'translate(' + pan()[0] + 'px,' + pan()[1] + 'px) scale(' + zoom() + ')'">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none">
          <defs>
            <pattern id="sm-tile" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#e6e8ee" stroke-width="0.5" /></pattern>
            <radialGradient id="sm-fire"><stop offset="0" stop-color="#ef4444" stop-opacity=".5" /><stop offset=".7" stop-color="#ef4444" stop-opacity=".22" /><stop offset="1" stop-color="#ef4444" stop-opacity="0" /></radialGradient>
            <marker id="sm-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ef4444" /></marker>
          </defs>
          <rect width="640" height="380" fill="#eceef2" />
          <rect x="6" y="6" width="628" height="368" fill="#f8f9fb" />
          <rect x="6" y="6" width="628" height="368" fill="url(#sm-tile)" />
          <!-- restricted / hazard zone tints -->
          @if (restricted()) {
            <rect x="92" y="128" width="150" height="112" fill="#fecaca" opacity=".55" />
            <rect x="92" y="128" width="150" height="112" fill="none" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3" />
          }
          @for (z of zoneTints(); track $index) {<rect [attr.x]="z[0]" [attr.y]="z[1]" [attr.width]="z[2]" [attr.height]="z[3]" [attr.fill]="z[4]" opacity=".14" />}
          @if (heat()) {
            @for (h of heatSpots; track $index) {<circle [attr.cx]="h[0]" [attr.cy]="h[1]" [attr.r]="h[2]" [attr.fill]="h[3]" opacity=".28" />}
          }
          <!-- furniture -->
          @for (d of desks; track $index) {<rect [attr.x]="d[0]" [attr.y]="d[1]" [attr.width]="d[2]" [attr.height]="d[3]" rx="0.8" fill="#e4e6ec" stroke="#b9bdc8" stroke-width="0.5" />}
          @for (c of chairs; track $index) {<circle [attr.cx]="c[0]" [attr.cy]="c[1]" r="2" fill="#fff" stroke="#b9bdc8" stroke-width="0.5" />}
          @for (m of machines; track $index) {<rect [attr.x]="m[0]" [attr.y]="m[1]" [attr.width]="m[2]" [attr.height]="m[3]" rx="1.5" fill="#d5d8df" stroke="#9aa0ad" stroke-width="0.7" /><rect [attr.x]="m[0] + 3" [attr.y]="m[1] + 3" [attr.width]="m[2] - 6" [attr.height]="m[3] - 6" fill="none" stroke="#b3b8c3" stroke-width="0.5" />}
          @for (r of racks; track $index) {<rect [attr.x]="r[0]" [attr.y]="r[1]" [attr.width]="r[2]" [attr.height]="r[3]" fill="#dfe6f5" stroke="#93a3c4" stroke-width="0.6" /><path [attr.d]="rackLines(r)" stroke="#b5c0d8" stroke-width="0.5" />}
          @for (s of servers; track $index) {<rect [attr.x]="s[0]" [attr.y]="s[1]" width="9" height="18" fill="#cdd3e1" stroke="#7d869b" stroke-width="0.6" />}
          @for (p of plants; track $index) {<circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="4" fill="#9bcf9c" stroke="#5fa862" stroke-width="0.6" />}
          @for (st of stairs; track $index) {<rect [attr.x]="st[0]" [attr.y]="st[1]" [attr.width]="st[2]" [attr.height]="st[3]" fill="#fff" stroke="#9aa0ad" stroke-width="0.6" /><path [attr.d]="stairLines(st)" stroke="#b3b8c3" stroke-width="0.5" />}
          <!-- walls -->
          @for (w of walls; track $index) {<path [attr.d]="w" fill="none" stroke="#5b6170" stroke-width="2" stroke-linecap="square" />}
          <rect x="6" y="6" width="628" height="368" fill="none" stroke="#3f4452" stroke-width="3.5" />
          <!-- doors -->
          @for (d of doors; track $index) {<path [attr.d]="d" fill="none" stroke="#8a90a0" stroke-width="0.7" />}
          <!-- fire zone pulse -->
          @for (f of fires(); track f.id) {
            <circle [attr.cx]="f.x" [attr.cy]="f.y" r="46" fill="url(#sm-fire)" />
            <circle [attr.cx]="f.x" [attr.cy]="f.y" r="34" fill="none" stroke="#ef4444" stroke-width="1.4" stroke-dasharray="5 4" class="spin" />
            <circle [attr.cx]="f.x" [attr.cy]="f.y" r="22" fill="#ef4444" opacity=".25" class="pulse" />
          }
          <!-- routes -->
          @for (r of routes(); track $index) {
            <polyline [attr.points]="pts(r)" fill="none" stroke="#ef4444" stroke-width="2.6" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#sm-arr)" class="flow" />
          }
          <!-- room labels -->
          @for (l of labels(); track l.t) {
            <rect [attr.x]="l.x - l.t.length * 2.7 - 6" [attr.y]="l.y - 8" [attr.width]="l.t.length * 5.4 + 12" height="15" rx="2" fill="#fff" stroke="#e3e5ea" stroke-width=".6" />
            <text [attr.x]="l.x" [attr.y]="l.y + 3" text-anchor="middle" class="rl">{{ l.t }}</text>
          }
          <!-- markers -->
          @for (m of markers(); track m.id) {
            @let s = size(m);
            <g class="mk" [attr.transform]="'translate(' + m.x + ',' + m.y + ')'" (click)="$event.stopPropagation(); markerClick.emit(m.id)">
              @if (m.title) {<title>{{ m.title }}</title>}
              @if (m.sel) {<circle [attr.r]="s + 6" fill="none" stroke="#7c3aed" stroke-width="2" class="pulse" />}
              @if (m.kind === 'exit') {
                <rect [attr.x]="-s" [attr.y]="-s" [attr.width]="s * 2" [attr.height]="s * 2" rx="2.5" fill="#16a34a" stroke="#fff" stroke-width="1.4" />
              } @else {
                <circle [attr.r]="s" [attr.fill]="color(m)" stroke="#fff" [attr.stroke-width]="m.kind === 'fire' ? 3 : 1.8" />
                @if (m.kind === 'fire') {<circle r="21" fill="none" stroke="#fff" stroke-width="1" opacity=".7" />}
              }
              <foreignObject [attr.x]="-s" [attr.y]="-s" [attr.width]="s * 2" [attr.height]="s * 2"><div class="fo"><app-icon [name]="icon(m)" [size]="s * 1.15" [stroke]="2.2" /></div></foreignObject>
            </g>
          }
        </svg>
        @if (callout(); as c) {
          <button class="co" [class.flip]="c.flip" [style.left.%]="(c.x / W) * 100" [style.top.%]="(c.y / H) * 100" (click)="calloutClick.emit()">
            <span class="co-ic"><app-icon [name]="c.icon" [size]="20" /></span>
            <span class="co-t"><b>{{ c.title }}</b>@for (l of c.lines; track $index) {<small>{{ l }}</small>}<em><app-icon name="users" [size]="11" />{{ c.people }}</em></span>
            <app-icon name="chevron-right" [size]="15" />
          </button>
        }
      </div>
      <div class="tools">
        <button title="Zoom in" (click)="zoomBy(1.25)"><app-icon name="plus" [size]="19" /></button>
        <button title="Zoom out" (click)="zoomBy(0.8)"><app-icon name="minus" [size]="19" /></button>
        <button title="Reset view" class="sp" (click)="reset()"><app-icon name="locate" [size]="18" /></button>
        <button title="Toggle heatmap" [class.on]="heat()" (click)="heat.set(!heat())"><app-icon name="layers" [size]="18" /></button>
      </div>
      <ng-content />
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .vp { position: relative; aspect-ratio: 640 / 380; border-radius: 8px; overflow: hidden; background: #eceef2; touch-action: none; cursor: grab; }
    .vp.grab { cursor: grabbing; }
    .layer { position: absolute; inset: 0; transform-origin: 50% 50%; transition: transform .15s ease; }
    svg { width: 100%; height: 100%; display: block; user-select: none; }
    .rl { font: 600 8.2px Inter, sans-serif; fill: #1f2233; pointer-events: none; }
    .mk { cursor: pointer; transition: transform 2.4s linear; }
    .fo { width: 100%; height: 100%; display: grid; place-items: center; color: #fff; }
    .pulse { animation: pulse 1.8s ease-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes pulse { 0% { transform: scale(.7); opacity: .6; } 100% { transform: scale(1.6); opacity: 0; } }
    .spin { animation: spin 8s linear infinite; transform-box: fill-box; transform-origin: center; } @keyframes spin { to { transform: rotate(360deg); } }
    .flow { animation: flow 1s linear infinite; } @keyframes flow { to { stroke-dashoffset: -24; } }
    .co { position: absolute; display: flex; gap: 8px; align-items: center; padding: 8px 8px 8px 9px; background: #fff; border: 0; border-radius: 8px; box-shadow: 0 6px 20px rgba(20, 20, 50, .2); font: inherit; text-align: left; cursor: pointer; transform: translate(0, -50%); color: var(--text); }
    .co.flip { transform: translate(-100%, -50%); } .co-t small, .co-t b { white-space: nowrap; } .co:hover { box-shadow: 0 6px 20px rgba(124, 58, 237, .35); }
    .co-ic { width: 32px; height: 32px; border-radius: 8px; background: #ef4444; color: #fff; display: grid; place-items: center; flex: none; align-self: flex-start; }
    .co-t { display: flex; flex-direction: column; font-size: 11px; line-height: 1.35; } .co-t b { font-size: 12.5px; } .co-t small { color: #4b4f6b; font-size: 10.5px; }
    .co-t em { font-style: normal; color: #7c3aed; display: flex; gap: 3px; align-items: center; font-size: 10.5px; }
    .tools { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; }
    .tools button { width: 34px; height: 34px; border-radius: 7px; border: 1px solid var(--border); background: #fff; display: grid; place-items: center; cursor: pointer; color: #2a2d40; box-shadow: 0 2px 6px rgba(0, 0, 0, .08); }
    .tools .sp { margin-top: 10px; } .tools button.on { color: var(--primary); } .tools button:hover { background: #faf8ff; }
  `,
})
export class SafetyMap {
  readonly markers = input<SMarker[]>([]);
  readonly routes = input<[number, number][][]>([]);
  readonly callout = input<SCallout | null>(null);
  readonly restricted = input(true);
  readonly fires = input<{ id: string; x: number; y: number }[]>([]);
  readonly labels = input<{ t: string; x: number; y: number }[]>([]);
  readonly zoneTints = input<[number, number, number, number, string][]>([]);
  readonly markerClick = output<string>();
  readonly calloutClick = output<void>();
  readonly heat = signal(false);
  protected readonly W = MAP_W;
  protected readonly H = MAP_H;
  protected readonly zoom = signal(1);
  protected readonly pan = signal<[number, number]>([0, 0]);
  protected readonly drag = signal(false);
  protected start: { x: number; y: number; p: [number, number] } | null = null;
  private readonly el = inject(ElementRef<HTMLElement>);

  protected readonly walls = [
    'M92 6V128', 'M6 128H92', 'M6 62H92', 'M242 6V240', 'M92 240H242', 'M92 128V240', 'M242 92H560', 'M330 6V92', 'M445 6V92', 'M300 92V210', 'M300 210H440',
    'M440 120V210', 'M440 120H560', 'M560 6V380', 'M6 240H92', 'M150 240V374', 'M230 240V374', 'M230 260H300', 'M300 260V374', 'M390 260V374', 'M440 210V260', 'M440 260H560',
    'M480 260V374', 'M560 200H634', 'M560 100H634', 'M560 270H634', 'M92 172H110',
  ];
  protected readonly doors = ['M150 128a14 14 0 0 1 14 -14', 'M300 150a12 12 0 0 1 12 12', 'M440 150a12 12 0 0 0 -12 12', 'M330 260a12 12 0 0 1 12 -12', 'M560 230a12 12 0 0 0 -12 12', 'M92 90a12 12 0 0 1 12 12'];
  protected readonly desks: R[] = (() => {
    const out: R[] = [];
    const grid = (x0: number, y0: number, cols: number, rows: number, dx: number, dy: number, w = 14, h = 7) => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x0 + c * dx, y0 + r * dy, w, h]);
    };
    grid(14, 14, 4, 2, 19, 22);
    grid(14, 70, 4, 2, 19, 26);
    grid(338, 14, 5, 3, 21, 24);
    grid(452, 14, 5, 3, 21, 24);
    grid(14, 250, 3, 5, 25, 24);
    grid(158, 252, 3, 5, 22, 24);
    grid(488, 270, 3, 4, 22, 24);
    grid(566, 12, 3, 3, 21, 28);
    return out;
  })();
  protected readonly chairs = this.desks.map((d) => [d[0] + d[2] / 2, d[1] + d[3] + 3.5]);
  protected readonly machines: R[] = [
    [104, 16, 30, 22], [144, 16, 30, 22], [188, 16, 40, 22], [104, 54, 46, 26], [160, 54, 26, 26], [196, 54, 34, 26], [252, 20, 32, 28], [252, 104, 40, 30],
    [104, 140, 30, 20], [190, 150, 38, 26], [240, 280, 46, 28], [240, 320, 24, 40], [312, 272, 30, 22], [352, 272, 28, 22], [400, 272, 34, 26], [404, 312, 30, 26], [452, 222, 40, 26],
    [574, 210, 50, 22], [574, 240, 22, 22], [574, 290, 50, 26], [574, 330, 26, 30],
  ];
  protected readonly racks: R[] = [[312, 104, 120, 9], [312, 126, 120, 9], [312, 168, 120, 9], [312, 190, 120, 9]];
  protected readonly servers = [450, 462, 474, 486, 498, 510, 522, 534].flatMap((x) => [[x, 130], [x, 180]]);
  protected readonly plants = [[16, 50], [86, 120], [236, 12], [326, 86], [556, 96], [16, 234], [296, 366], [386, 366], [556, 366], [474, 214]];
  protected readonly stairs: R[] = [[96, 182, 18, 26], [386, 222, 26, 30], [566, 106, 30, 26]];
  protected readonly heatSpots = [[176, 200, 60, '#ef4444'], [372, 150, 50, '#f97316'], [300, 290, 40, '#facc15'], [500, 160, 34, '#22c55e'], [80, 300, 44, '#22c55e']];

  protected pts(r: [number, number][]) {
    return r.map((p) => p.join(',')).join(' ');
  }
  protected rackLines(r: R) {
    let d = '';
    for (let x = r[0] + 10; x < r[0] + r[2]; x += 10) d += `M${x} ${r[1]}v${r[3]}`;
    return d;
  }
  protected stairLines(r: R) {
    let d = '';
    for (let y = r[1] + 4; y < r[1] + r[3]; y += 4) d += `M${r[0]} ${y}h${r[2]}`;
    return d;
  }
  protected size(m: SMarker) {
    return m.kind === 'fire' ? 15 : m.kind === 'person' ? 9.5 : m.kind === 'exit' ? 10 : 11;
  }
  protected color(m: SMarker) {
    return m.color ?? (m.kind === 'person' ? '#22c55e' : m.kind === 'hazard' ? '#f59e0b' : m.kind === 'assembly' ? '#3b82f6' : '#ef4444');
  }
  protected icon(m: SMarker) {
    return m.icon ?? (m.kind === 'person' ? 'user' : m.kind === 'hazard' ? 'triangle-alert' : m.kind === 'exit' ? 'run' : m.kind === 'assembly' ? 'users' : 'flame');
  }
  zoomBy(f: number) {
    this.zoom.update((z) => Math.min(4, Math.max(0.7, z * f)));
  }
  reset() {
    this.zoom.set(1);
    this.pan.set([0, 0]);
  }
  /** Zoom to a map point. */
  focus(x: number, y: number, z = 2) {
    const r = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    const px = (0.5 - x / MAP_W) * r.width * z;
    const py = (0.5 - y / MAP_H) * r.height * z;
    this.zoom.set(z);
    this.pan.set([px, py]);
  }
  protected down(e: PointerEvent) {
    if ((e.target as Element).closest('.mk, .co, .tools, button')) return;
    this.start = { x: e.clientX, y: e.clientY, p: this.pan() };
  }
  protected move(e: PointerEvent) {
    if (!this.start || !e.buttons) return;
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    this.drag.set(true);
    this.pan.set([this.start.p[0] + dx, this.start.p[1] + dy]);
  }
  protected wheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
  }
}
