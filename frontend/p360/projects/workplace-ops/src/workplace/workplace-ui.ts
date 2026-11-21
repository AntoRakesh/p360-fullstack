// Small shared pieces for Workplace pages: big-tile KPI card and booking status helpers.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '@p360/shared/icon';

@Component({
  selector: 'app-wkpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card wkpi', '[class.click]': 'clickable()' },
  template: `
    <span class="wk-tile" [style.background]="color()"><app-icon [name]="icon()" [size]="30" [stroke]="1.9" /></span>
    <div class="wk-body">
      <div class="wk-label">{{ label() }}</div>
      <div class="wk-value">{{ value() }}</div>
      <div class="wk-sub">
        @if (arrow()) {<app-icon [name]="arrow() === 'up' ? 'arrow-up' : 'arrow-down'" [size]="13" [stroke]="2.6" [style.color]="strongColor()" />}
        @if (strong()) {<b [style.color]="strongColor()">{{ strong() }}</b>}
        {{ sub() }}
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 14px; padding: 14px 14px; min-width: 0; }
    :host(.click) { cursor: pointer; } :host(.click:hover) { border-color: var(--kl-c4b5fd); }
    .wk-tile { width: 62px; height: 62px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .wk-body { min-width: 0; }
    .wk-label { font-size: 12.5px; color: var(--kf-3b3f5c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wk-value { font-size: 23px; font-weight: 700; margin: 3px 0 4px; font-variant-numeric: tabular-nums; }
    .wk-sub { font-size: 12px; color: var(--kf-3b3f5c); display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wk-sub b { font-weight: 600; }
  `,
})
export class WKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('w-desk');
  readonly color = input('var(--ka-7c3aed)');
  readonly strong = input<string>();
  readonly strongColor = input('var(--ka-16a34a)');
  readonly sub = input('');
  readonly arrow = input<'up' | 'down' | null>(null);
  readonly clickable = input(false);
}

export const BOOKING_ICON: Record<string, { icon: string; color: string }> = {
  Desk: { icon: 'w-desk', color: 'var(--ka-22c55e)' },
  'Meeting Room': { icon: 'users', color: 'var(--ka-ef4444)' },
  'Focus Room': { icon: 'w-focus', color: 'var(--ka-3b82f6)' },
  'Collaboration Area': { icon: 'w-collab', color: 'var(--ka-f59e0b)' },
  Parking: { icon: 'w-car', color: 'var(--ka-db2777)' },
  Asset: { icon: 'w-laptop', color: 'var(--ka-0891b2)' },
};
export const bookingTag = (s: string) => (s === 'Confirmed' || s === 'Checked In' ? 'tag green' : s === 'Pending' ? 'tag amber' : s === 'Cancelled' || s === 'Rejected' ? 'tag red' : 'tag blue');
export const prioTag = (p: string) => (p === 'Critical' ? 'tag red' : p === 'High' ? 'tag amber' : p === 'Medium' ? 'tag blue' : 'tag grey');
export const reqTag = (s: string) => (s === 'Resolved' || s === 'Closed' || s === 'Done' ? 'tag green' : s === 'On Hold' || s === 'Missed' ? 'tag red' : s === 'In Progress' ? 'tag amber' : s === 'Assigned' ? 'tag blue' : 'tag grey');
export const slaTag = (s: string) => (s === 'Met' || s === 'On Track' ? 'tag green' : s === 'At Risk' ? 'tag amber' : 'tag red');

/** Demo clock for "now" markers (matches the reference dashboard, 10:24 AM). */
export const NOW_MIN = 10 * 60 + 24;

/** Shared layout styles for the Workplace sibling pages. */
export const WP_CSS = `
  :host { display: block; }
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .wl { display: grid; grid-template-columns: minmax(0, 1.68fr) minmax(340px, 1fr); gap: 12px; align-items: start; margin-bottom: 12px; }
  .wl.even { grid-template-columns: 1fr 1fr; } .wl.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.2px; }
  h4 { margin: 0 0 8px; font-size: 13px; }
  .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .ch .tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .select.sm { padding: 6px 30px 6px 10px; font-size: 12px; }
  .hb { padding: 10px 18px; font-size: 13px; font-weight: 500; border-radius: 6px; }
  .seg { display: inline-flex; background: var(--kb-f2f2f7); border-radius: 6px; padding: 3px; gap: 2px; flex-wrap: wrap; }
  .seg button { border: 0; background: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; color: var(--kf-27272a); white-space: nowrap; }
  .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
  .row:last-child { border-bottom: 0; }
  .row .nm { display: flex; flex-direction: column; min-width: 0; } .row .nm b { font-weight: 600; } .row .nm small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ic { width: 34px; height: 34px; border-radius: 7px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
  .ic.soft { color: var(--c); background: color-mix(in srgb, var(--c) 14%, white); }
  .acts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .muted.sm, .sm { font-size: 12px; }
  .danger { color: var(--red); }
  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 20px; font-size: 11.5px; font-weight: 500; } .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 12px; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; margin: 0; font-size: 12px; } .facts dt { color: var(--kf-6b7090); white-space: nowrap; } .facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .bar { height: 8px; background: var(--kb-f1f1f6); border-radius: 4px; overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 4px; }
  .timeline { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--kl-ede9fe); } .timeline li { position: relative; padding: 0 0 10px 6px; font-size: 12px; }
  .timeline li::before { content: ''; position: absolute; left: -21px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--kb-7c3aed); border: 2px solid var(--kl-ffffff); }
  .timeline small { color: var(--muted); display: block; }
  .empty { padding: 18px; text-align: center; color: var(--muted); font-size: 12.5px; }
  @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 1250px) { .wl, .wl.even, .wl.three { grid-template-columns: 1fr; } .detail { position: static; } }
  @media (max-width: 700px) { .kpis { grid-template-columns: 1fr 1fr; } }
`;
