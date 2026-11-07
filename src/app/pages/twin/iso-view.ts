// Reusable 2.5D building viewer (pure SVG + HTML overlays, no WebGL): 2D/3D, rotate, zoom, pan, exploded floors, outdoor site, measure.
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, model, output, signal, untracked } from '@angular/core';
import { Icon } from '../../shared/icon';
import { Drawn, furnish, poly, projector, render, Solid, View } from './iso-scene';
import { FLOORS, M_PER_UNIT, PLAN_H, PLAN_W, TZone, ZONE_COLOR, ZONE_GROUP } from './twin.data';

export interface IsoMarker {
  id: string;
  x: number;
  y: number;
  color: string;
  icon: string;
  kind?: 'pin' | 'chip' | 'sensor' | 'alert' | 'value';
  label?: string;
  title?: string;
  dim?: boolean;
}
export interface IsoCallout {
  id: string;
  x: number;
  y: number;
  title: string;
  lines: string[];
  icon: string;
  color: string;
  /** Title colour (e.g. red for alerts). */
  accent?: string;
  /** Second-line colour. */
  tone?: string;
  /** Card placement relative to the point (auto: right, or left near the right edge). */
  pos?: 'right' | 'left' | 'above' | 'below';
  dy?: number;
}
export interface IsoPath {
  points: [number, number][];
  color: string;
  dashed?: boolean;
  dots?: boolean;
}
export interface IsoGlow {
  x: number;
  y: number;
  r: number;
  color: string;
}
export interface IsoHeat {
  x: number;
  y: number;
  r: number;
  v: number;
}

const VW = 1000;
const VH = 550;
const DEF3D = { rot: -22, elev: 47, k: 1.04 };
const DEF2D = { rot: 0, elev: 90, k: 0.97 };

@Component({
  selector: 'app-iso-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="iso" [class.grab]="drag()" [class.measuring]="measure()" [style.aspect-ratio]="aspect()">
      <svg [attr.viewBox]="'0 0 ' + vw + ' ' + vh" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointerleave)="up($event)" (wheel)="wheel($event)">
        <defs>
          <radialGradient id="iso-glow"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.75" /><stop offset="60%" stop-color="#ef4444" stop-opacity="0.35" /><stop offset="100%" stop-color="#ef4444" stop-opacity="0" /></radialGradient>
          <radialGradient id="iso-heat"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.85" /><stop offset="35%" stop-color="#f59e0b" stop-opacity="0.6" /><stop offset="70%" stop-color="#22c55e" stop-opacity="0.3" /><stop offset="100%" stop-color="#3b82f6" stop-opacity="0" /></radialGradient>
          <linearGradient id="iso-bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" [attr.stop-color]="outdoor() ? '#cfe3c8' : '#9aa6b6'" /><stop offset="100%" [attr.stop-color]="outdoor() ? '#b9d5ae' : '#6f7b8d'" /></linearGradient>
        </defs>
        <rect x="-10" y="-10" [attr.width]="vw + 20" [attr.height]="vh + 20" fill="url(#iso-bg)" />
        <!-- slab / lower floors -->
        @for (d of base(); track $index) {<path [attr.d]="d.d" [attr.fill]="d.fill" [attr.opacity]="d.op ?? 1" [attr.stroke]="d.stroke ?? null" stroke-width="0.6" />}
        @for (d of drawn(); track $index) {
          @switch (d.t) {
            @case ('poly') {<path [attr.d]="d.d" [attr.fill]="d.fill" [attr.opacity]="d.op ?? 1" [attr.stroke]="d.stroke ?? null" [attr.stroke-width]="d.sw ?? 0.5" [class.zf]="!!d.ref" (click)="d.ref && pickZone(d.ref)" />}
            @case ('ball') {<ellipse [attr.cx]="d.x" [attr.cy]="d.y" [attr.rx]="d.r" [attr.ry]="d.r! * 0.85" [attr.fill]="d.fill" stroke="#3e7f3e" stroke-width="0.8" /><ellipse [attr.cx]="d.x! - d.r! * 0.3" [attr.cy]="d.y! - d.r! * 0.3" [attr.rx]="d.r! * 0.45" [attr.ry]="d.r! * 0.35" fill="#7cc27a" />}
            @case ('person') {
              @if (d.ry! > 0.2) {
                <g [attr.transform]="'translate(' + d.x + ',' + d.y + ') scale(' + d.s + ')'" class="fig">
                  <ellipse cx="0" cy="0" rx="4" ry="1.6" fill="#000" opacity="0.18" />
                  <path [attr.d]="'M-3 0 L-3 ' + (-9 * d.ry!) + ' Q0 ' + (-12 * d.ry!) + ' 3 ' + (-9 * d.ry!) + ' L3 0Z'" [attr.fill]="d.fill" />
                  <circle cx="0" [attr.cy]="-13 * d.ry! - 1" r="2.6" fill="#f2c9a0" />
                </g>
              } @else {
                <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="3.4 * d.s!" [attr.fill]="d.fill" stroke="#fff" stroke-width="1" />
              }
            }
          }
        }
        <!-- overlays drawn on top of the scene -->
        @if (!exploded() && !outdoor()) {
          @for (h of heatPolys(); track $index) {<path [attr.d]="h.d" fill="url(#iso-heat)" [attr.opacity]="h.op" class="np" />}
          @for (g of glowPolys(); track $index) {<path [attr.d]="g.d" fill="url(#iso-glow)" class="np" /><path [attr.d]="g.ring" fill="none" stroke="#ef4444" stroke-width="2" class="pulse np" />}
          @for (g of fencePolys(); track $index) {<path [attr.d]="g" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="7 5" class="np" />}
          @for (p of pathLines(); track $index) {
            <path [attr.d]="p.d" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" opacity="0.7" class="np" />
            <path [attr.d]="p.d" fill="none" [attr.stroke]="p.color" stroke-width="3" stroke-linejoin="round" [attr.stroke-dasharray]="p.dashed ? '2 7' : null" stroke-linecap="round" class="np" />
            @if (p.dots) {@for (q of p.pts; track $index) {<circle [attr.cx]="q[0]" [attr.cy]="q[1]" r="4" fill="#fff" [attr.stroke]="p.color" stroke-width="2.4" class="np" />}}
          }
          @if (mLine(); as m) {
            <path [attr.d]="m.d" stroke="#7c3aed" stroke-width="2.5" stroke-dasharray="6 4" fill="none" />
            @for (q of m.pts; track $index) {<circle [attr.cx]="q[0]" [attr.cy]="q[1]" r="5" fill="#7c3aed" stroke="#fff" stroke-width="2" />}
          }
        }
        @if (exploded()) {
          @for (f of explodedHits(); track f.id) {<path [attr.d]="f.d" class="fhit" [class.on]="f.id === floor()" (click)="floorPick.emit(f.id); exploded.set(false)" />}
        }
        @if (outdoor()) {<path [attr.d]="buildingHit()" class="fhit" (click)="outdoor.set(false)" />}
      </svg>

      @if (!exploded() && !outdoor()) {
        @if (zoneLabels()) {
          @for (l of labelPos(); track l.id) {
            <button class="zl" [class.sel]="l.id === selectedZone()" [style.left.%]="l.l" [style.top.%]="l.t" (click)="pickZone(l.id)">{{ l.name }}</button>
          }
        }
        @for (m of markerPos(); track m.id) {
          <button class="mk" [class]="'mk ' + (m.kind ?? 'pin')" [class.dim]="m.dim" [class.sel]="m.id === selectedId()" [style.left.%]="m.l" [style.top.%]="m.t" [style.--c]="m.color" [title]="m.title ?? m.label ?? ''" (click)="markerClick.emit(m.id)">
            @switch (m.kind ?? 'pin') {
              @case ('pin') {<span class="pin-c"><app-icon [name]="m.icon" [size]="15" [stroke]="2.3" /></span><i class="stem"></i><i class="shadow"></i>}
              @case ('alert') {<span class="al-c"><app-icon [name]="m.icon" [size]="26" [stroke]="2.4" /></span>}
              @case ('value') {<span class="val">{{ m.label }}</span>}
              @default {<app-icon [name]="m.icon" [size]="m.kind === 'sensor' ? 11 : 10" [stroke]="2.4" />}
            }
          </button>
        }
        @for (c of calloutPos(); track c.id) {
          <div class="co" [class]="'co ' + c.side" [style.left.%]="c.l" [style.top.%]="c.t" (click)="calloutClick.emit(c.id)">
            <span class="co-ic" [style.background]="c.color"><app-icon [name]="c.icon" [size]="20" /></span>
            <div><b [style.color]="c.accent ?? null">{{ c.title }}</b>@for (ln of c.lines; track $index) {<small [style.color]="$first ? c.tone ?? null : null">{{ ln }}</small>}</div>
            <app-icon name="chevron-right" [size]="14" />
          </div>
        }
        @if (mLine(); as m) {
          <span class="mlabel" [style.left.%]="m.l" [style.top.%]="m.t">{{ m.text }}</span>
        }
      }
      @if (exploded()) {
        @for (f of explodedHits(); track f.id) {
          <button class="fl-tag" [class.on]="f.id === floor()" [style.left.%]="f.l" [style.top.%]="f.t" (click)="floorPick.emit(f.id); exploded.set(false)"><b>{{ f.name }}</b><small>{{ f.people }} people · {{ f.util }}%</small></button>
        }
      }
      @if (outdoor()) {
        @for (m of outdoorTags(); track m.name) {
          <button class="zl out" [style.left.%]="m.l" [style.top.%]="m.t" (click)="m.indoor && outdoor.set(false)">{{ m.name }}</button>
        }
      }
      @if (measure()) {<div class="hint">{{ mPts().length < 2 ? 'Click two points on the floor to measure' : 'Click again to start a new measurement' }}</div>}

      @if (tools()) {
        <div class="tools">
          <button (click)="full($event)" title="Fullscreen"><app-icon name="maximize" [size]="17" /></button>
          <div class="grp"><button (click)="zoomBy(1.2)" title="Zoom in"><app-icon name="plus" [size]="18" /></button><button (click)="zoomBy(1 / 1.2)" title="Zoom out"><app-icon name="minus" [size]="18" /></button></div>
          <button (click)="reset()" title="Reset view"><app-icon name="locate" [size]="18" /></button>
          <button class="dark" (click)="setMode(mode() === '3d' ? '2d' : '3d')" [title]="'Switch to ' + (mode() === '3d' ? '2D' : '3D')">{{ mode() === '3d' ? '3D' : '2D' }}</button>
          <button [class.on]="exploded()" (click)="exploded.set(!exploded()); outdoor.set(false)" title="Stacked floors"><app-icon name="layers" [size]="18" /></button>
          <button [class.on]="measure()" (click)="toggleMeasure()" title="Measure distance"><app-icon name="twin-ruler" [size]="18" /></button>
          <button (click)="rotateBy(90)" title="Rotate 90°"><app-icon name="twin-cube" [size]="18" /></button>
        </div>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host { display: block; position: relative; }
    .iso { position: relative; width: 100%; border-radius: 10px; overflow: hidden; background: #8794a6; user-select: none; cursor: grab; }
    .iso.grab { cursor: grabbing; } .iso.measuring { cursor: crosshair; }
    .iso:fullscreen { border-radius: 0; aspect-ratio: auto !important; }
    svg { display: block; width: 100%; height: 100%; touch-action: none; }
    .zf { cursor: pointer; } .zf:hover { filter: brightness(0.96); }
    path:not(.zf):not(.fhit), ellipse, .fig, circle { pointer-events: none; }
    .np { pointer-events: none; }
    .pulse { animation: iso-pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes iso-pulse { from { opacity: 0.9; transform: scale(0.6); } to { opacity: 0; transform: scale(1.25); } }
    .fhit { fill: transparent; stroke: transparent; stroke-width: 2; cursor: pointer; pointer-events: all; } .fhit:hover { fill: rgba(124, 58, 237, 0.12); stroke: #7c3aed; } .fhit.on { stroke: #7c3aed; stroke-width: 3; }
    .zl { position: absolute; transform: translate(-50%, -50%); background: #fff; border: 0; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; font-weight: 600; color: #12142b; box-shadow: 0 2px 8px rgba(15, 20, 40, 0.25); cursor: pointer; white-space: nowrap; z-index: 2; }
    .zl.sel { background: var(--primary); color: #fff; } .zl:hover { box-shadow: 0 0 0 2px var(--primary), 0 2px 8px rgba(15, 20, 40, 0.25); }
    .zl.out { font-size: 12px; padding: 6px 12px; }
    .mk { position: absolute; border: 0; background: none; padding: 0; cursor: pointer; z-index: 3; color: #fff; transition: left 1.2s linear, top 1.2s linear; }
    .mk.dim { opacity: 0.35; }
    .mk.pin { transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; }
    .pin-c { width: 30px; height: 30px; border-radius: 50%; background: var(--c); border: 3px solid #fff; display: grid; place-items: center; box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 30%, transparent), 0 3px 8px rgba(0, 0, 0, 0.3); }
    .stem { width: 2px; height: 12px; background: #fff; box-shadow: 0 0 2px rgba(0,0,0,.4); } .shadow { width: 12px; height: 4px; border-radius: 50%; background: rgba(0, 0, 0, 0.35); margin-top: -2px; }
    .mk.pin.sel .pin-c { box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 45%, transparent), 0 0 0 9px #fff, 0 3px 8px rgba(0, 0, 0, 0.3); }
    .mk.chip, .mk.sensor { transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; background: var(--c); border: 2px solid #fff; display: grid; place-items: center; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35); }
    .mk.sensor { border-radius: 5px; width: 20px; height: 20px; }
    .mk.chip.sel, .mk.sensor.sel { box-shadow: 0 0 0 3px var(--primary); }
    .mk.alert { transform: translate(-50%, -50%); }
    .al-c { width: 52px; height: 52px; border-radius: 50%; background: #ef4444; border: 3px solid #fff; display: grid; place-items: center; box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.35), 0 4px 12px rgba(0, 0, 0, 0.3); animation: al 1.4s ease-in-out infinite; }
    @keyframes al { 50% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0.15), 0 4px 12px rgba(0, 0, 0, 0.3); } }
    .mk.value { transform: translate(-50%, -50%); } .val { display: block; background: var(--c); color: #fff; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 10px; border: 1.5px solid #fff; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
    .co { position: absolute; transform: translate(26px, -50%); display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 8px; padding: 9px 10px; min-width: 180px; box-shadow: 0 6px 18px rgba(15, 20, 40, 0.28); z-index: 4; cursor: pointer; color: #12142b; }
    .co.left { transform: translate(calc(-100% - 26px), -50%); }
    .co.above { transform: translate(-12%, -100%); } .co.below { transform: translate(14px, 0); }
    .co:hover { box-shadow: 0 0 0 2px var(--primary), 0 6px 18px rgba(15, 20, 40, 0.28); }
    .co-ic { width: 36px; height: 36px; border-radius: 7px; color: #fff; display: grid; place-items: center; flex-shrink: 0; align-self: flex-start; }
    .co div { display: flex; flex-direction: column; flex: 1; min-width: 0; } .co b { font-size: 12.5px; } .co small { font-size: 11px; color: #4b4f6b; line-height: 1.35; white-space: nowrap; }
    .mlabel { position: absolute; transform: translate(-50%, -150%); background: #7c3aed; color: #fff; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; z-index: 5; }
    .hint { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(18, 20, 43, 0.85); color: #fff; font-size: 12px; padding: 6px 12px; border-radius: 20px; z-index: 6; }
    .fl-tag { position: absolute; transform: translate(10px, -50%); display: flex; flex-direction: column; align-items: flex-start; background: #fff; border: 0; border-left: 3px solid #94a3b8; border-radius: 6px; padding: 4px 9px; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 3; }
    .fl-tag b { font-size: 12px; } .fl-tag small { font-size: 10.5px; color: var(--muted); } .fl-tag.on { border-left-color: var(--primary); background: #f5f0ff; }
    .tools { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 9px; z-index: 6; }
    .tools > button, .grp { width: 40px; border-radius: 8px; border: 0; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); color: #1f2433; }
    .tools > button { height: 40px; display: grid; place-items: center; cursor: pointer; font-weight: 700; font-size: 13px; }
    .grp { display: flex; flex-direction: column; overflow: hidden; } .grp button { height: 38px; border: 0; background: #fff; display: grid; place-items: center; cursor: pointer; color: #1f2433; } .grp button + button { border-top: 1px solid #eceef4; }
    .tools > button.dark { background: #1e1b4b; color: #fff; } .tools > button.on { background: var(--primary); color: #fff; }
    .tools button:hover:not(.dark):not(.on) { background: #f5f0ff; }
  `,
})
export class IsoView {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly vw = VW;
  protected readonly vh = VH;
  readonly zones = input.required<TZone[]>();
  /** All zones of the building (exploded view). */
  readonly allZones = input<TZone[]>([]);
  readonly floor = input('4');
  readonly markers = input<IsoMarker[]>([]);
  readonly callouts = input<IsoCallout[]>([]);
  readonly paths = input<IsoPath[]>([]);
  readonly glows = input<IsoGlow[]>([]);
  readonly fences = input<{ x: number; y: number; r: number }[]>([]);
  readonly heat = input<IsoHeat[]>([]);
  /** Shirt colours for the decor people figures; empty hides them. */
  readonly shirts = input<string[]>(['#2563eb', '#2563eb', '#2563eb', '#f59e0b', '#16a34a']);
  /** Zone ids to tint (zone layer) with their group colour. */
  readonly tint = input<string[]>([]);
  readonly labelIds = input<string[] | null>(null);
  readonly zoneLabels = input(true);
  readonly selectedZone = input<string | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly tools = input(true);
  readonly aspect = input('1000 / 550');
  readonly mode = model<'3d' | '2d'>('3d');
  readonly exploded = model(false);
  readonly outdoor = model(false);

  readonly markerClick = output<string>();
  readonly zoneClick = output<string>();
  readonly calloutClick = output<string>();
  readonly floorPick = output<string>();
  readonly measured = output<number>();

  protected readonly rot = signal(DEF3D.rot);
  protected readonly elev = signal(DEF3D.elev);
  protected readonly zoom = signal(1);
  protected readonly pan = signal<[number, number]>([0, 0]);
  protected readonly drag = signal(false);
  protected readonly measure = signal(false);
  protected readonly mPts = signal<[number, number][]>([]);
  private start: { x: number; y: number; rot: number; elev: number; pan: [number, number]; moved: boolean; shift: boolean } | null = null;
  private anim = 0;

  constructor() {
    // animate between 2D and 3D when the mode changes from outside
    effect(() => {
      const m = this.mode();
      untracked(() => this.animateTo(m === '3d' ? DEF3D : DEF2D));
    });
  }

  protected readonly view = computed<View>(() => {
    const base = this.outdoor() ? 0.36 : this.exploded() ? 0.4 : this.mode() === '3d' ? DEF3D.k : DEF2D.k;
    return { rot: this.rot(), elev: this.elev(), k: base * this.zoom(), panX: this.pan()[0], panY: this.pan()[1] + (this.exploded() ? 40 : this.outdoor() ? 30 : 0), cx: PLAN_W / 2 - (this.outdoor() || this.exploded() ? 0 : 40), cy: PLAN_H / 2, ox: VW / 2, oy: VH / 2 };
  });
  private readonly proj = computed(() => projector(this.view()));

  /** Furniture for the current floor (independent of camera). */
  private readonly scene = computed<Solid[]>(() => {
    const zs = this.zones();
    const tint = new Set(this.tint());
    const s = furnish(zs, zs.length * 31 + (this.floor().charCodeAt(0) || 1), this.shirts());
    for (const z of zs) if (tint.has(z.id)) s.push({ pts: [[z.x + 3, z.y + 3], [z.x + z.w - 3, z.y + 3], [z.x + z.w - 3, z.y + z.h - 3], [z.x + 3, z.y + z.h - 3]], z0: 0.6, h: 0, top: ZONE_COLOR[ZONE_GROUP[z.type]], side: '', op: 0.16, flat: true, stroke: ZONE_COLOR[ZONE_GROUP[z.type]] });
    const sel = zs.find((z) => z.id === this.selectedZone());
    if (sel) s.push({ pts: [[sel.x + 2, sel.y + 2], [sel.x + sel.w - 2, sel.y + 2], [sel.x + sel.w - 2, sel.y + sel.h - 2], [sel.x + 2, sel.y + sel.h - 2]], z0: 0.8, h: 0, top: '#7c3aed', side: '', op: 0.22, flat: true, stroke: '#7c3aed' });
    return s;
  });

  /** Floor slab + hint of the floors below (3D only). */
  protected readonly base = computed<Drawn[]>(() => {
    if (this.exploded() || this.outdoor()) return [];
    const slab: Solid[] = [{ pts: [[20, 20], [980, 20], [980, 540], [20, 540]], z0: -14, h: 14, top: '#f6f7f9', side: '#8e9aab' }];
    if (this.elev() < 85) for (let i = 1; i <= 2; i++) slab.unshift({ pts: [[20, 20], [980, 20], [980, 540], [20, 540]], z0: -14 - i * 46, h: 46, top: '#d9e2ec', side: i % 2 ? '#7f93ab' : '#8aa0b8', op: 0.9 });
    return render(slab, this.view());
  });

  protected readonly drawn = computed<Drawn[]>(() => {
    const v = this.view();
    if (this.outdoor()) return render(siteScene(), v);
    if (this.exploded()) {
      const out: Drawn[] = [];
      const all = this.allZones().length ? this.allZones() : this.zones();
      const order = [...FLOORS].reverse();
      order.forEach((f, i) => {
        const zl = (i - 3) * 150;
        const on = f.id === this.floor();
        out.push(...render([{ pts: [[20, 20], [980, 20], [980, 540], [20, 540]], z0: zl - 10, h: 10, top: on ? '#ede9fe' : '#f1f3f7', side: on ? '#7c3aed' : '#9aa6b8' }], v));
        out.push(...render(all.filter((z) => z.floor === f.id).map((z) => ({ pts: [[z.x + 4, z.y + 4], [z.x + z.w - 4, z.y + 4], [z.x + z.w - 4, z.y + z.h - 4], [z.x + 4, z.y + z.h - 4]] as [number, number][], z0: zl + 0.5, h: 0, top: ZONE_COLOR[ZONE_GROUP[z.type]], side: '', op: on ? 0.55 : 0.28, flat: true })), v));
      });
      return out;
    }
    return render(this.scene(), v);
  });

  protected readonly explodedHits = computed(() => {
    if (!this.exploded()) return [];
    const { P } = this.proj();
    return [...FLOORS].reverse().map((f, i) => {
      const zl = (i - 3) * 150;
      const pts = [P(20, 20, zl), P(980, 20, zl), P(980, 540, zl), P(20, 540, zl)];
      const right = pts.reduce((a, p) => (p[0] > a[0] ? p : a));
      return { id: f.id, name: f.name, people: f.people, util: f.util, d: poly(pts), l: (right[0] / VW) * 100, t: (right[1] / VH) * 100 };
    });
  });
  protected readonly buildingHit = computed(() => {
    const { P } = this.proj();
    return poly([P(20, 20, 280), P(980, 20, 280), P(980, 540, 280), P(980, 540, 0), P(20, 540, 0), P(20, 540, 280)]);
  });
  protected readonly outdoorTags = computed(() => {
    const { P } = this.proj();
    const tag = (name: string, x: number, y: number, z: number, indoor = false) => {
      const [sx, sy] = P(x, y, z);
      return { name, indoor, l: (sx / VW) * 100, t: (sy / VH) * 100 };
    };
    return [tag('Building A - Head Office', 500, 280, 300, true), tag('Building B - Annex', 1350, 300, 150), tag('Warehouse W1', -300, 350, 90), tag('Visitor Parking', 500, 800, 5), tag('Main Gate', 1250, 900, 5)];
  });

  private pct([x, y]: [number, number]) {
    return { l: (x / VW) * 100, t: (y / VH) * 100 };
  }
  protected readonly labelPos = computed(() => {
    const { P } = this.proj();
    const ids = this.labelIds();
    return this.zones()
      .filter((z) => z.type !== 'core' && (!ids || ids.includes(z.id)))
      .map((z) => ({ id: z.id, name: z.name, ...this.pct(z.type === 'server' ? P(z.x + z.w * 0.4, z.y + z.h * 0.96, 20) : P(z.x + z.w / 2, z.y + z.h / 2, this.mode() === '3d' ? 46 : 0)) }));
  });
  protected readonly markerPos = computed(() => {
    const { P } = this.proj();
    return this.markers().map((m) => ({ ...m, ...this.pct(P(m.x, m.y, m.kind === 'sensor' ? 30 : m.kind === 'alert' ? 18 : 0)) }));
  });
  protected readonly calloutPos = computed(() => {
    const { P } = this.proj();
    return this.callouts().map((c) => {
      const p = this.pct(P(c.x, c.y, 0));
      const side = c.pos ?? (p.l > 66 ? 'left' : 'right');
      const t = side === 'above' ? p.t - 12 : side === 'below' ? p.t + 3 : p.t - 7;
      return { ...c, side, l: Math.min(Math.max(p.l, 2), side === 'right' ? 70 : side === 'below' ? 72 : side === 'above' ? 80 : 96), t: Math.min(Math.max(t + (c.dy ?? 0), 2), 86) };
    });
  });
  protected readonly pathLines = computed(() => {
    const { P } = this.proj();
    return this.paths().map((p) => {
      const pts = p.points.map(([x, y]) => P(x, y, 2));
      return { ...p, pts, d: 'M' + pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L') };
    });
  });
  private circle(x: number, y: number, r: number, z = 1) {
    const { P } = this.proj();
    return poly(Array.from({ length: 28 }, (_, i) => P(x + Math.cos((i / 28) * Math.PI * 2) * r, y + Math.sin((i / 28) * Math.PI * 2) * r, z)));
  }
  protected readonly glowPolys = computed(() => this.glows().map((g) => ({ d: this.circle(g.x, g.y, g.r, 3), ring: this.circle(g.x, g.y, g.r * 0.75, 3) })));
  protected readonly fencePolys = computed(() => this.fences().map((g) => this.circle(g.x, g.y, g.r, 2)));
  protected readonly heatPolys = computed(() => this.heat().map((h) => ({ d: this.circle(h.x, h.y, h.r, 4), op: 0.35 + h.v * 0.6 })));
  protected readonly mLine = computed(() => {
    const pts = this.mPts();
    if (!pts.length) return null;
    const { P } = this.proj();
    const sp = pts.map(([x, y]) => P(x, y, 1));
    if (pts.length < 2) return { d: '', pts: sp, l: 0, t: 0, text: '' };
    const dist = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * M_PER_UNIT;
    const mid = this.pct([(sp[0][0] + sp[1][0]) / 2, (sp[0][1] + sp[1][1]) / 2]);
    return { d: `M${sp[0][0]},${sp[0][1]}L${sp[1][0]},${sp[1][1]}`, pts: sp, ...mid, text: `${dist.toFixed(1)} m` };
  });

  /* ---------- camera ---------- */
  setMode(m: '3d' | '2d') {
    this.exploded.set(false);
    this.mode.set(m);
  }
  reset() {
    this.zoom.set(1);
    this.pan.set([0, 0]);
    this.animateTo(this.mode() === '3d' ? DEF3D : DEF2D);
  }
  zoomBy(f: number) {
    this.zoom.update((z) => Math.min(4, Math.max(0.5, z * f)));
  }
  rotateBy(d: number) {
    this.animateTo({ rot: this.rot() + d, elev: this.elev() });
  }
  /** Centers the camera on a plan point. */
  focus(x: number, y: number, z = 1.8) {
    this.zoom.set(z);
    const v = { ...this.view(), panX: 0, panY: 0 };
    const [sx, sy] = projector(v).P(x, y, 0);
    this.pan.set([VW / 2 - sx, VH / 2 - sy]);
  }
  private animateTo(t: { rot: number; elev: number }) {
    cancelAnimationFrame(this.anim);
    const r0 = this.rot();
    const e0 = this.elev();
    if (Math.abs(r0 - t.rot) < 0.1 && Math.abs(e0 - t.elev) < 0.1) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      const ease = 1 - Math.pow(1 - k, 3);
      this.rot.set(r0 + (t.rot - r0) * ease);
      this.elev.set(e0 + (t.elev - e0) * ease);
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  protected toggleMeasure() {
    this.measure.update((m) => !m);
    this.mPts.set([]);
  }
  protected full(e: Event) {
    const el = (e.currentTarget as HTMLElement).closest('.iso') as HTMLElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }
  protected pickZone(id: string) {
    if (this.start?.moved || this.measure()) return;
    this.zoneClick.emit(id);
  }
  private toView(e: PointerEvent | MouseEvent): [number, number] {
    const r = (this.host.nativeElement as HTMLElement).querySelector('svg')!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  }
  protected down(e: PointerEvent) {
    if (e.button !== 0) return;
    this.start = { x: e.clientX, y: e.clientY, rot: this.rot(), elev: this.elev(), pan: this.pan(), moved: false, shift: e.shiftKey || this.mode() === '2d' || this.exploded() === false && this.outdoor() };
  }
  protected move(e: PointerEvent) {
    const s = this.start;
    if (!s || !e.buttons) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    s.moved = true;
    this.drag.set(true);
    if (s.shift) {
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const k = VW / r.width;
      this.pan.set([s.pan[0] + dx * k, s.pan[1] + dy * k]);
    } else {
      this.rot.set(s.rot + dx * 0.35);
      this.elev.set(Math.min(88, Math.max(22, s.elev - dy * 0.25)));
    }
  }
  protected up(e: PointerEvent) {
    const s = this.start;
    if (s && !s.moved && this.measure() && e.type === 'pointerup') {
      const [vx, vy] = this.toView(e);
      const p = this.proj().inv(vx, vy);
      const pts = this.mPts().length >= 2 ? [p] : [...this.mPts(), p];
      this.mPts.set(pts);
      if (pts.length === 2) this.measured.emit(+(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * M_PER_UNIT).toFixed(1));
    }
    setTimeout(() => (this.start = null));
    this.drag.set(false);
  }
  protected wheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }
}

/* ---------- outdoor site massing ---------- */
let SITE: Solid[] | null = null;
function siteScene(): Solid[] {
  if (SITE) return SITE;
  const r = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const s: Solid[] = [
    { pts: r(-900, -500, 2900, 1700), z0: -1, h: 0, top: '#bcd9ae', side: '', flat: true },
    { pts: r(-900, 640, 2900, 90), z0: -0.5, h: 0, top: '#9aa3ae', side: '', flat: true },
    { pts: r(1120, -500, 80, 1700), z0: -0.5, h: 0, top: '#9aa3ae', side: '', flat: true },
    { pts: r(80, 760, 860, 260), z0: -0.4, h: 0, top: '#cfd4da', side: '', flat: true },
    { pts: r(-20, -20, 1040, 600), z0: -0.3, h: 0, top: '#e5e7eb', side: '', flat: true },
  ];
  // Building A: 7 levels
  for (let i = 0; i < 7; i++) {
    s.push({ pts: r(20, 20, 960, 520), z0: i * 40, h: 34, top: i === 6 ? '#cbd5e1' : '#e2e8f0', side: '#7aa0c4', op: 1 });
    if (i < 6) s.push({ pts: r(20, 20, 960, 520), z0: i * 40 + 34, h: 6, top: '#e2e8f0', side: '#e5e7eb' });
  }
  for (let i = 0; i < 3; i++) s.push({ pts: r(1280, 80, 380, 420), z0: i * 40, h: 36, top: '#e2e8f0', side: '#86a8c8' });
  s.push({ pts: r(-620, 120, 520, 440), z0: 0, h: 80, top: '#d6d3cd', side: '#b8b1a6' });
  // parked cars
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 2; j++) if ((i + j * 3) % 4) s.push({ pts: r(110 + i * 68, 790 + j * 130, 40, 70), z0: 0, h: 14, top: ['#e2e8f0', '#1e293b', '#b91c1c', '#2563eb', '#94a3b8'][(i + j) % 5], side: '#475569' });
  // trees
  const tr: [number, number][] = [[-120, -200], [100, -260], [400, -240], [760, -220], [1020, -180], [1380, -200], [1700, 650], [1500, 900], [-300, 820], [-600, 700], [-750, 0], [1700, 200], [1000, 900], [60, 1080], [700, 1100]];
  for (const [x, y] of tr) s.push({ pts: [[x - 6, y - 6], [x + 6, y - 6], [x + 6, y + 6], [x - 6, y + 6]], z0: 0, h: 20, top: '#7c5a3a', side: '#5b4029' }, { pts: [[x, y]], z0: 46, h: 0, top: '#4f9d4f', side: '', ball: { r: 34 } });
  SITE = s;
  return s;
}
