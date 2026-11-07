// Small shared widgets for the Digital Twin pages: utilization donut and 2D floor heatmap.
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { furnish, render } from './iso-scene';
import { PLAN_H, PLAN_W, TZone } from './twin.data';

export interface UtilRow {
  label: string;
  pct: number;
  color: string;
  weight: number;
}

@Component({
  selector: 'app-util-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ud">
      <svg viewBox="0 0 160 160" [style.width.px]="size()">
        @for (s of segs(); track s.label) {
          <circle cx="80" cy="80" r="62" fill="none" [attr.stroke]="s.color" [attr.stroke-width]="hover() === s.label ? 26 : 21" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off"
            [attr.opacity]="hover() && hover() !== s.label ? 0.35 : 1" transform="rotate(-150 80 80)" (mouseenter)="hover.set(s.label)" (mouseleave)="hover.set(null)" />
        }
        <text x="80" y="82" text-anchor="middle" class="big">{{ hovered()?.pct ?? center() }}%</text>
        <text x="80" y="102" text-anchor="middle" class="sm">{{ hovered()?.label ?? 'Utilization' }}</text>
      </svg>
      <ul>
        @for (s of rows(); track s.label) {
          <li [class.dim]="hover() && hover() !== s.label" (mouseenter)="hover.set(s.label)" (mouseleave)="hover.set(null)"><i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ s.pct }}%</b></li>
        }
      </ul>
    </div>
  `,
  styles: `
    .ud { display: flex; align-items: center; gap: 22px; } svg { flex-shrink: 0; } circle { transition: stroke-width 0.15s; cursor: pointer; }
    .big { font-size: 21px; font-weight: 700; fill: #12142b; } .sm { font-size: 11px; fill: #3b3f5c; }
    ul { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 9px; }
    li { display: grid; grid-template-columns: 12px 1fr auto; gap: 10px; align-items: center; font-size: 12px; cursor: default; } li.dim { opacity: 0.45; }
    li i { width: 11px; height: 11px; border-radius: 50%; } li b { font-weight: 600; }
  `,
})
export class UtilDonut {
  readonly rows = input.required<UtilRow[]>();
  readonly center = input(0);
  readonly size = input(150);
  protected readonly hover = signal<string | null>(null);
  protected readonly hovered = computed(() => this.rows().find((r) => r.label === this.hover()));
  protected readonly segs = computed(() => {
    const C = 2 * Math.PI * 62;
    const tot = this.rows().reduce((a, r) => a + r.weight, 0) || 1;
    let off = 0;
    return this.rows().map((r) => {
      const len = (r.weight / tot) * C;
      const s = { ...r, dash: `${Math.max(len - 2, 0)} ${C}`, off: -off };
      off += len;
      return s;
    });
  });
}

/** Top-down floor plan with a blurred density heat layer. */
@Component({
  selector: 'app-floor-heat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fh" [style.height.px]="height()">
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="xMidYMid meet" (click)="pick.emit()">
        <defs><filter [attr.id]="uid" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22" /></filter></defs>
        <rect x="14" y="14" width="972" height="532" fill="#f4f6fa" stroke="#4b5563" stroke-width="5" />
        @for (d of plan(); track $index) {<path [attr.d]="d.d" [attr.fill]="d.fill" stroke="#9aa3b2" stroke-width="0.8" [attr.opacity]="d.op ?? 1" />}
        <g [attr.filter]="'url(#' + uid + ')'" opacity="0.82">
          @for (c of cells(); track $index) {<circle [attr.cx]="c.x" [attr.cy]="c.y" [attr.r]="c.r" [attr.fill]="c.color" />}
        </g>
      </svg>
      @if (legend()) {
        <div class="lg"><span>High</span><i></i><span>Low</span></div>
      }
    </div>
  `,
  styles: `
    .fh { display: flex; gap: 10px; align-items: stretch; } svg { flex: 1; min-width: 0; height: 100%; cursor: pointer; display: block; }
    .lg { display: grid; grid-template-columns: 6px auto; grid-template-rows: auto 1fr auto; column-gap: 8px; font-size: 11px; color: #3b3f5c; padding: 6px 0; }
    .lg i { grid-column: 1; grid-row: 1 / 4; width: 6px; border-radius: 3px; background: linear-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #6d28d9); }
    .lg span:first-child { grid-column: 2; grid-row: 1; } .lg span:last-child { grid-column: 2; grid-row: 3; }
  `,
})
export class FloorHeat {
  private static n = 0;
  protected readonly uid = `fh-blur-${FloorHeat.n++}`;
  protected readonly w = PLAN_W;
  protected readonly h = PLAN_H;
  readonly zones = input.required<TZone[]>();
  readonly points = input.required<{ x: number; y: number; v: number }[]>();
  readonly height = input(160);
  readonly legend = input(true);
  readonly pick = output<void>();
  protected readonly plan = computed(() =>
    render(furnish(this.zones(), 3, []).filter((s) => !s.person && !s.ball), { rot: 0, elev: 90, k: 1, panX: 0, panY: 0, cx: PLAN_W / 2, cy: PLAN_H / 2, ox: PLAN_W / 2, oy: PLAN_H / 2 }).map((d) => ({ ...d, fill: d.fill.startsWith('rgb') ? '#e5e7eb' : d.fill === '#1f2433' ? '#9ca3af' : d.fill })),
  );
  /** Aggregates points into a 20×11 grid and colours each cell by intensity. */
  protected readonly cells = computed(() => {
    const GX = 20;
    const GY = 11;
    const grid = Array.from({ length: GY }, () => new Array(GX).fill(0));
    for (const p of this.points()) {
      const cx = Math.min(GX - 1, Math.max(0, Math.floor((p.x / PLAN_W) * GX)));
      const cy = Math.min(GY - 1, Math.max(0, Math.floor((p.y / PLAN_H) * GY)));
      grid[cy][cx] += p.v;
    }
    const max = Math.max(0.0001, ...grid.flat());
    const out: { x: number; y: number; r: number; color: string }[] = [];
    grid.forEach((row, j) =>
      row.forEach((v, i) => {
        const k = v / max;
        if (k > 0.06) out.push({ x: ((i + 0.5) * PLAN_W) / GX, y: ((j + 0.5) * PLAN_H) / GY, r: 26 + k * 26, color: heatColor(0.25 + k * 0.75) });
      }),
    );
    // draw hot cells last so they sit on top
    return out.sort((a, b) => a.r - b.r);
  });
}

export function heatColor(k: number) {
  const stops: [number, number[]][] = [
    [0, [59, 130, 246]],
    [0.25, [6, 182, 212]],
    [0.45, [34, 197, 94]],
    [0.65, [250, 204, 21]],
    [0.8, [245, 158, 11]],
    [1, [239, 68, 68]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (k - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(',')})`;
    }
  }
  return 'rgb(239,68,68)';
}
