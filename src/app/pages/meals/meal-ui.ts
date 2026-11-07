// Local building blocks for the Meal & Canteen pages.
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

/** Illustrated plate (SVG rim + emoji food). */
@Component({
  selector: 'app-plate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient [attr.id]="uid" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#fff" /><stop offset="100%" [attr.stop-color]="bg()" /></radialGradient>
      </defs>
      <circle cx="20" cy="21" r="19" fill="#000" opacity="0.08" />
      <circle cx="20" cy="20" r="19" fill="#f8fafc" stroke="#e2e8f0" />
      <circle cx="20" cy="20" r="14.5" [attr.fill]="kind() ? '#fff' : 'url(#' + uid + ')'" [attr.stroke]="kind() ? '#eef1f5' : null" />
      @switch (kind()) {
        @case ('breakfast') {
          <rect x="8" y="11" width="11" height="10" rx="2.5" fill="#e3a857" stroke="#b7792f" stroke-width="0.8" transform="rotate(-12 13 16)" />
          <path d="M21 9c4-1 9 2 9 6s-2 7-6 7-7-2-7.5-5S18 10 21 9z" fill="#fff" stroke="#e5e7eb" stroke-width="0.6" />
          <circle cx="23.5" cy="15" r="3" fill="#fbbf24" /><circle cx="22.7" cy="14.2" r="0.9" fill="#fde68a" />
          <rect x="10" y="23" width="13" height="4" rx="2" fill="#9a3412" transform="rotate(8 16 25)" /><rect x="11" y="27.5" width="11" height="3.6" rx="1.8" fill="#b45309" transform="rotate(4 16 29)" />
          <circle cx="27" cy="26" r="3.6" fill="#ef4444" /><circle cx="27" cy="26" r="2" fill="#fca5a5" />
          <circle cx="15" cy="10" r="1" fill="#22c55e" /><circle cx="29.5" cy="21" r="1.2" fill="#16a34a" />
        }
        @case ('lunch') {
          <path d="M8 22c0-6 4-11 9-11s8 5 8 11z" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.6" />
          <circle cx="12" cy="18" r="0.8" fill="#e2e8f0" /><circle cx="16" cy="15" r="0.8" fill="#e2e8f0" /><circle cx="19" cy="19" r="0.8" fill="#e2e8f0" />
          <path d="M19 21c1-5 6-8 11-6 1 4-1 10-6 11-3 0-5-2-5-5z" fill="#ea580c" /><circle cx="25" cy="18" r="1.6" fill="#fde68a" /><circle cx="22.5" cy="22" r="1.4" fill="#fbbf24" />
          <ellipse cx="13" cy="27" rx="5.5" ry="3" fill="#16a34a" /><circle cx="11" cy="26" r="1.6" fill="#4ade80" /><circle cx="15" cy="26.5" r="1.4" fill="#86efac" /><circle cx="20" cy="29" r="2" fill="#ef4444" />
          <path d="M24 27c2-1 5-1 6 1" stroke="#a16207" stroke-width="2.4" stroke-linecap="round" fill="none" />
        }
        @case ('dinner') {
          <circle cx="20" cy="20" r="11" fill="#9a3412" /><circle cx="20" cy="20" r="9" fill="#c2410c" />
          <circle cx="16" cy="17" r="2.4" fill="#fdba74" /><circle cx="23" cy="16" r="2" fill="#fef3c7" /><circle cx="22" cy="23" r="2.6" fill="#7c2d12" /><circle cx="15.5" cy="23.5" r="1.8" fill="#22c55e" /><circle cx="26" cy="20.5" r="1.4" fill="#16a34a" />
        }
      }
    </svg>
    @if (!kind()) {<span [style.font-size.px]="size() * 0.5">{{ emoji() }}</span>}
  `,
  styles: `:host { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; } :host > * { grid-area: 1 / 1; } span { line-height: 1; filter: saturate(1.15); }`,
})
export class Plate {
  private static n = 0;
  protected readonly uid = `plate${Plate.n++}`;
  readonly emoji = input('🍽️');
  readonly bg = input('#fde68a');
  readonly size = input(40);
  /** Draw an illustrated plate instead of the emoji. */
  readonly kind = input<'breakfast' | 'lunch' | 'dinner' | ''>('');
}

function hostWidth() {
  const w = signal(420);
  const el = inject(ElementRef<HTMLElement>);
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    const ro = new ResizeObserver(([e]) => w.set(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el.nativeElement);
    destroy.onDestroy(() => ro.disconnect());
  });
  return w;
}

/** Bars on the left axis + a line on a right axis. */
@Component({
  selector: 'app-dual-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="legend"><span><i class="dot" [style.background]="barColor()"></i>{{ barName() }}</span><span><i class="ln" [style.background]="lineColor()"><b [style.border-color]="lineColor()"></b></i>{{ lineName() }}</span></div>
    <div class="wrap" (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + height()" [attr.height]="height()" width="100%">
        <defs><linearGradient [attr.id]="uid" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" [attr.stop-color]="barColor()" /><stop offset="100%" [attr.stop-color]="barColor()" stop-opacity="0.55" /></linearGradient></defs>
        <text [attr.transform]="'translate(10 ' + (g().b / 2 + 8) + ') rotate(-90)'" text-anchor="middle" class="ax">{{ axisLabel() }}</text>
        @for (t of g().ticks; track $index) {
          <line [attr.x1]="L" [attr.x2]="W() - R" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
          <text [attr.x]="L - 8" [attr.y]="t.y + 4" text-anchor="end" class="ax">{{ t.l }}</text>
          <text [attr.x]="W() - R + 8" [attr.y]="t.y + 4" class="ax">{{ t.r }}</text>
        }
        @for (b of g().bars; track $index) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.fill]="'url(#' + uid + ')'" rx="2" [attr.opacity]="hover() === null || hover() === $index ? 1 : 0.55" />
          <text [attr.x]="b.cx" [attr.y]="height() - 6" text-anchor="middle" class="ax lbl">{{ labels()[$index] }}</text>
          <rect [attr.x]="b.cx - g().band / 2" [attr.y]="T" [attr.width]="g().band" [attr.height]="g().b - T" fill="transparent" (mouseenter)="hover.set($index)" />
        }
        <path [attr.d]="g().d" fill="none" [attr.stroke]="lineColor()" stroke-width="2" />
        @for (p of g().pts; track $index) {<circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="3.6" [attr.fill]="lineColor()" stroke="#fff" stroke-width="1.4" />}
      </svg>
      @if (hover() !== null) {
        <div class="tip" [style.left.px]="g().bars[hover()!].cx"><b>{{ labels()[hover()!] }}</b><span>{{ barName() }}: AED {{ bars()[hover()!].toLocaleString() }}</span><span>{{ lineName() }}: {{ line()[hover()!] }}</span></div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .legend { display: flex; justify-content: center; gap: 22px; font-size: 11.5px; color: #3b3f5c; margin-bottom: 4px; } .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; } .ln { position: relative; width: 16px; height: 2px; } .ln b { position: absolute; left: 4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; border: 2px solid; background: inherit; box-sizing: border-box; }
    .wrap { position: relative; } svg { display: block; overflow: visible; }
    .grid { stroke: #eef0f6; } .ax { font-size: 10.5px; fill: #4b4f6b; } .lbl { font-size: 11.5px; }
    .tip { position: absolute; top: 4px; transform: translateX(-50%); background: #1e1b3a; color: #fff; border-radius: 8px; padding: 6px 10px; font-size: 11.5px; display: flex; flex-direction: column; pointer-events: none; white-space: nowrap; z-index: 3; }
  `,
})
export class DualChart {
  private static n = 0;
  protected readonly uid = `dual${DualChart.n++}`;
  readonly labels = input.required<string[]>();
  readonly bars = input.required<number[]>();
  readonly line = input.required<number[]>();
  readonly barMax = input(80000);
  readonly lineMax = input(20);
  readonly barName = input('Meal Cost');
  readonly lineName = input('Avg. Cost per Meal (AED)');
  readonly axisLabel = input('Cost (AED)');
  readonly barColor = input('#7c3aed');
  readonly lineColor = input('#7c3aed');
  readonly height = input(150);
  protected readonly hover = signal<number | null>(null);
  protected readonly W = hostWidth();
  protected readonly L = 46;
  protected readonly R = 28;
  protected readonly T = 8;
  protected readonly g = computed(() => {
    const b = this.height() - 24;
    const n = this.labels().length;
    const band = (this.W() - this.L - this.R) / n;
    const yl = (v: number) => b - (v / this.barMax()) * (b - this.T);
    const yr = (v: number) => b - (v / this.lineMax()) * (b - this.T);
    const bars = this.bars().map((v, i) => {
      const cx = this.L + band * i + band / 2;
      const w = Math.min(34, band * 0.58);
      return { cx, x: cx - w / 2, w, y: yl(v), h: b - yl(v) };
    });
    const pts = this.line().map((v, i) => [bars[i].cx, yr(v)] as [number, number]);
    const k = this.barMax() / 4 >= 1000;
    return {
      b,
      band,
      bars,
      pts,
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
      ticks: [0, 1, 2, 3, 4].map((i) => {
        const v = (this.barMax() / 4) * i;
        return { y: yl(v), l: k ? (v ? `${v / 1000}K` : '0') : String(v), r: String(+((this.lineMax() / 4) * i).toFixed(1)) };
      }),
    };
  });
}
