// Small UI pieces shared by the Tasks & Workforce Operations pages.
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from '@p360/shared/icon';

/** KPI card with a large coloured icon tile (reference-image style). */
@Component({
  selector: 'app-tkpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card tkpi' },
  template: `
    <span class="tile" [style.background]="color()"><app-icon [name]="icon()" [size]="28" [stroke]="2" /></span>
    <div class="body">
      <div class="lbl">{{ label() }}</div>
      <div class="val">{{ value() }}</div>
      <div class="sub">
        @if (change()) {<b [style.color]="changeColor()"><app-icon [name]="up() ? 'arrow-up' : 'arrow-down'" [size]="14" [stroke]="2.6" />{{ change() }}</b>}
        @if (pct()) {<b [style.color]="pctColor()">{{ pct() }}</b>}
        <span>{{ sub() }}</span>
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; gap: 14px; align-items: center; padding: 14px 10px 14px 14px; }
    .tile { width: 56px; height: 56px; flex-shrink: 0; border-radius: 12px; display: grid; place-items: center; color: var(--kf-ffffff); box-shadow: 0 6px 14px rgba(20, 20, 60, 0.12); }
    .body { min-width: 0; }
    .lbl { font-size: 11.5px; color: var(--kf-3b3f5c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .val { font-size: 23px; font-weight: 700; margin: 4px 0 5px; font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }
    .sub { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--kf-4b4f6b); white-space: nowrap; }
    .sub b { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; margin-right: 8px; }
    .sub b:has(+ span) { margin-right: 4px; }
  `,
})
export class TKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('tasks-clipboard');
  readonly color = input('var(--ka-7c3aed)');
  readonly change = input<string>();
  readonly up = input(true);
  readonly changeColor = input('var(--ka-16a34a)');
  readonly pct = input<string>();
  readonly pctColor = input('var(--ka-16a34a)');
  readonly sub = input('');
}

/** iOS-style switch. */
@Component({
  selector: 'app-tswitch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" role="switch" [attr.aria-checked]="on()" [class.on]="on()" (click)="on.set(!on())"><i></i></button>`,
  styles: `
    button { width: 38px; height: 21px; border-radius: 12px; border: 0; background: var(--kb-d5d8e4); position: relative; cursor: pointer; padding: 0; transition: background 0.15s; flex-shrink: 0; }
    button.on { background: var(--kb-16a34a); }
    i { position: absolute; top: 2.5px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); transition: left 0.15s; }
    button.on i { left: 19px; }
  `,
})
export class TSwitch {
  readonly on = model(false);
}

export const TASKS_UI = [TKpi, TSwitch] as const;
