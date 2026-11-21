// Small presentational pieces shared by the patrol pages.
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '@p360/shared/icon';
import { certType, Guard } from './patrol.data';

const SKIN = ['var(--ka-f3cfb0)', 'var(--ka-e0ac85)', 'var(--ka-c48b62)', 'var(--ka-94613f)'];

/** Illustrated guard portrait (uniform + cap for men, hair for women). */
@Component({
  selector: 'app-guard-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 40 40" [attr.width]="size()" [attr.height]="size()">
      <rect width="40" height="40" [attr.rx]="round() ? 20 : 7" fill="var(--ka-e9ecf3)" />
      @if (g().gender === 'F') {<path d="M10 19c0-8 4-12.5 10-12.5S30 11 30 19v8H10z" fill="var(--ka-2b1d16)" />}
      <path d="M5 40c1-8 6-11 15-11s14 3 15 11z" fill="var(--ka-1f2a44)" />
      <path d="M16.5 29.5 20 34l3.5-4.5z" fill="var(--ka-e7ebf3)" /><path d="M19.2 31h1.6l.6 5h-2.8z" fill="var(--ka-111827)" />
      <rect x="17" y="24" width="6" height="6" rx="2" [attr.fill]="skin()" />
      <ellipse cx="20" cy="18.5" rx="6.6" ry="7.6" [attr.fill]="skin()" />
      @if (g().gender === 'F') {
        <path d="M13.2 17c.5-5 3.3-7.6 6.8-7.6s6.4 2.6 6.8 7.6c-2.5-1.2-4.6-3-5.6-5-1.7 2.6-4.4 4.2-8 5z" fill="var(--ka-2b1d16)" />
      } @else {
        <path d="M12 14.6c0-4.6 3.6-7.4 8-7.4s8 2.8 8 7.4z" fill="var(--ka-1f2a44)" />
        <path d="M11 14.2h18c.3 1.4-.6 2.1-2 2.1H13c-1.4 0-2.3-.7-2-2.1z" fill="var(--ka-111827)" />
        <circle cx="20" cy="11" r="1.6" fill="var(--ka-facc15)" />
      }
      <circle cx="17.6" cy="19" r=".8" fill="var(--ka-1f2937)" /><circle cx="22.4" cy="19" r=".8" fill="var(--ka-1f2937)" />
      <path d="M18.2 22.6c1.1.7 2.5.7 3.6 0" stroke="var(--kl-7c4a33)" stroke-width=".8" fill="none" stroke-linecap="round" />
      <rect x="25" y="33" width="4" height="2.4" rx=".5" fill="var(--ka-facc15)" opacity=".9" />
    </svg>
  `,
  styles: `:host { display: inline-block; line-height: 0; flex: none; } svg { display: block; }`,
})
export class GuardAvatar {
  readonly g = input.required<Pick<Guard, 'gender' | 'tone'>>();
  readonly size = input(40);
  readonly round = input(false);
  protected readonly skin = computed(() => SKIN[this.g().tone % SKIN.length]);
}

/** Coloured certification badge (shield or round). */
@Component({
  selector: 'app-cert-badge',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="cb" [class.sh]="t().shape === 'shield'" [style.background]="t().color" [style.width.px]="size()" [style.height.px]="size()" [title]="t().name + (status() ? ' · ' + status() : '')" [class.dim]="status() === 'Expired'">
      <app-icon [name]="t().icon" [size]="size() * 0.56" [stroke]="2.6" />
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .cb { display: grid; place-items: center; color: var(--kf-ffffff); border-radius: 50%; box-shadow: 0 0 0 1.5px var(--kb-ffffff), 0 0 0 2.5px color-mix(in srgb, currentColor 0%, #0000); }
    .cb.sh { border-radius: 50% 50% 50% 50% / 38% 38% 62% 62%; }
    .cb.dim { filter: grayscale(0.85); opacity: 0.55; }
  `,
})
export class CertBadge {
  readonly key = input.required<string>();
  readonly size = input(20);
  readonly status = input<string>();
  protected readonly t = computed(() => certType(this.key()));
}

/** KPI card styled like the guard-directory image (big icon tile, coloured change + caption). */
@Component({
  selector: 'app-pkpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card pkpi' },
  template: `
    <span class="ic" [style.background]="color()"><app-icon [name]="icon()" [size]="26" /></span>
    <div class="b">
      <div class="l">{{ label() }}</div>
      <div class="v">{{ value() }}</div>
      <div class="s">
        @if (change()) {<b [style.color]="changeColor() || color()">@if (arrow()) {<app-icon name="arrow-up" [size]="13" [stroke]="2.6" />}{{ change() }}</b>}
        <span>{{ sub() }}</span>
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; gap: 12px; align-items: center; padding: 14px 12px; }
    .ic { width: 54px; height: 54px; border-radius: 12px; display: grid; place-items: center; color: var(--kf-ffffff); flex: none; }
    .b { min-width: 0; }
    .l { font-size: 12px; color: var(--kf-3b3f5c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .v { font-size: 24px; font-weight: 700; margin: 3px 0 5px; font-variant-numeric: tabular-nums; }
    .s { display: flex; gap: 10px; align-items: center; font-size: 12.5px; color: var(--kf-4b4f6b); white-space: nowrap; }
    .s b { display: inline-flex; align-items: center; gap: 3px; font-size: 13px; }
  `,
})
export class PKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('users');
  readonly color = input('var(--ka-7c3aed)');
  readonly change = input<string>();
  readonly changeColor = input<string>();
  readonly arrow = input(false);
  readonly sub = input('');
}

export const statusCls = (s: string) =>
  s === 'On Duty' ? 'st on' : s === 'Off Duty' ? 'st off' : s === 'On Leave' ? 'st leave' : 'st train';

/** Global-ish styles for status pills used by several patrol pages (include in component styles). */
export const PATROL_CSS = `
  .st { display: inline-flex; align-items: center; justify-content: center; min-width: 66px; padding: 4px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 500; white-space: nowrap; }
  .st.on { background: var(--kb-dcfce7); color: var(--kf-15803d); } .st.off { background: var(--kb-eef0f5); color: var(--kf-374151); } .st.leave { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .st.train { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); }
  .menu-wrap { position: relative; }
  .sev { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .sev.Critical { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .sev.High { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .sev.Medium { background: var(--kb-fef3c7); color: var(--kf-b45309); } .sev.Low { background: var(--kb-e0f2fe); color: var(--kf-0369a1); }
  .gx { display: flex; align-items: center; gap: 10px; min-width: 0; } .gx div { display: flex; flex-direction: column; min-width: 0; } .gx small { color: var(--muted); font-size: 11.5px; }
`;

export function toastFn(set: (m: string | null) => void) {
  let h: ReturnType<typeof setTimeout> | undefined;
  return (m: string) => {
    set(m);
    clearTimeout(h);
    h = setTimeout(() => set(null), 2600);
  };
}
