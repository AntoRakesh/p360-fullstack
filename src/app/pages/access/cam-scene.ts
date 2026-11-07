import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Illustrated CCTV frame (no real video). `variant` changes the scene layout. */
@Component({
  selector: 'app-cam-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="240" [attr.fill]="sky()" />
      <rect width="320" height="22" fill="#4b5563" />
      <g stroke="#5b6573" stroke-width="4" opacity=".85">
        @for (x of posts(); track x) {<path [attr.d]="'M' + x + ' 22v128'" />}
        <path d="M0 80h320" />
      </g>
      <path d="M0 150h320v90H0z" [attr.fill]="floor()" />
      <path d="M0 240 130 150h60l130 90" fill="#cbd2da" opacity=".5" />
      @if (variant() % 2 === 0) {
        <g fill="#3f7d4a"><ellipse cx="6" cy="110" rx="22" ry="60" /><ellipse cx="314" cy="104" rx="20" ry="62" /></g>
      }
      @if (variant() === 1 || variant() === 4) {
        <g fill="#9ca3af"><rect x="40" y="165" width="70" height="22" rx="3" /><rect x="210" y="165" width="70" height="22" rx="3" /></g>
      }
      <g fill="#1f2937" [attr.transform]="'translate(' + shift() + ' 0)'">
        @for (p of people(); track $index) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.s" />
          <rect [attr.x]="p.x - p.s * 1.25" [attr.y]="p.y + p.s + 1" [attr.width]="p.s * 2.5" [attr.height]="p.s * 6" [attr.rx]="p.s" />
        }
      </g>
      @if (box()) {
        <rect [attr.x]="people()[0].x - people()[0].s * 1.6 + shift()" [attr.y]="people()[0].y - people()[0].s * 1.5" [attr.width]="people()[0].s * 3.2" [attr.height]="people()[0].s * 3.4" fill="none" stroke="#22c55e" stroke-width="2.5" />
      }
    </svg>
  `,
  styles: `:host { display: block; position: relative; overflow: hidden; } svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }`,
})
export class CamScene {
  readonly variant = input(0);
  readonly box = input(false);
  readonly tick = input(0);
  private readonly tints = ['#9fb7c8', '#b8a58a', '#9aa6b8', '#a9b9a3', '#b3a8c9'];
  protected readonly sky = computed(() => this.tints[this.variant() % this.tints.length]);
  protected readonly floor = computed(() => ['#aab3bd', '#b9b2a6', '#9ea7b2', '#aab4a6', '#b0aac0'][this.variant() % 5]);
  protected readonly posts = computed(() => (this.variant() % 2 ? [40, 120, 200, 280] : [30, 110, 190, 270]));
  protected readonly shift = computed(() => (this.tick() % 6) - 3);
  protected readonly people = computed(() => {
    const v = this.variant();
    const base = [
      { x: 150, y: 120, s: 15 },
      { x: 215, y: 110, s: 8 },
      { x: 90, y: 112, s: 9 },
      { x: 255, y: 116, s: 7 },
    ];
    return base.slice(0, 2 + (v % 3)).map((p, i) => ({ ...p, x: p.x + ((v * 23 + i * 11) % 30) - 15 }));
  });
}
