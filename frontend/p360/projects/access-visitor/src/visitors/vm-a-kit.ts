// Small helpers shared by the registration / invitation / pass pages (agent "a").
import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { Icon } from '@p360/shared/icon';

const hash = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

/** Deterministic QR-looking SVG (finder squares + timing + hashed modules). */
@Component({
  selector: 'vm-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-qr', '[class.framed]': 'framed()', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  template: `
    <svg [attr.viewBox]="'-1 -1 ' + (N + 2) + ' ' + (N + 2)" [attr.width]="framed() ? size() * 0.74 : size()" [attr.height]="framed() ? size() * 0.74 : size()" shape-rendering="crispEdges">
      <rect x="-1" y="-1" [attr.width]="N + 2" [attr.height]="N + 2" fill="var(--ka-ffffff)" />
      <path [attr.d]="path()" fill="var(--ka-111111)" />
    </svg>
    @if (framed()) { <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i> }
  `,
  styles: `
    :host { position: relative; display: inline-grid; place-items: center; flex: none; }
    svg { display: block; }
    .c { position: absolute; width: 22%; height: 22%; border: 3px solid var(--kl-7c3aed); }
    .tl { top: 0; left: 0; border-right: 0; border-bottom: 0; border-radius: 8px 0 0 0; }
    .tr { top: 0; right: 0; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; }
    .bl { bottom: 0; left: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 8px; }
    .br { bottom: 0; right: 0; border-left: 0; border-top: 0; border-radius: 0 0 8px 0; }
  `,
})
export class VmQr {
  readonly data = input.required<string>();
  readonly size = input(120);
  readonly framed = input(false);
  protected readonly N = 25;
  protected readonly path = computed(() => {
    const N = this.N;
    let h = hash(this.data() || 'x');
    const rnd = () => ((h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
    const finder = (x: number, y: number, ox: number, oy: number) => {
      const dx = x - ox, dy = y - oy;
      if (dx < 0 || dy < 0 || dx > 7 || dy > 7) return null;
      if (dx === 7 || dy === 7) return false;
      return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
    };
    let d = '';
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let on = finder(x, y, 0, 0) ?? finder(x, y, N - 7, 0) ?? (x < 8 && y >= N - 8 ? finder(x, y, 0, N - 7) : null);
        if (x >= N - 8 && y < 8 && on === null) on = false;
        if (x < 8 && y >= N - 8 && on === null) on = false;
        if (on === null) {
          if (y === 6) on = x % 2 === 0;
          else if (x === 6) on = y % 2 === 0;
          else if (x >= 16 && x <= 20 && y >= 16 && y <= 20) on = x === 16 || x === 20 || y === 16 || y === 20 || (x === 18 && y === 18);
          else on = rnd() < 0.5;
        }
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }
    return d;
  });
}

/** Multi-select chips box ("Main Entrance × Meeting Rooms ×  ⌄"). */
@Component({
  selector: 'vm-areas',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-areas', '[class.open]': 'open()', '[class.err]': 'err()' },
  template: `
    <div class="box" (click)="open.set(!open())">
      <div class="chips">
        @for (a of value(); track a) {
          <span class="vm-chip">{{ a }}<button type="button" (click)="$event.stopPropagation(); remove(a)" [attr.aria-label]="'Remove ' + a">×</button></span>
        } @empty { <span class="ph">Select areas…</span> }
      </div>
      <app-icon name="chevron-down" [size]="16" />
    </div>
    @if (open()) {
      <div class="bk" (click)="open.set(false)"></div>
      <div class="dropdown dd">
        @for (o of options(); track o) {
          <button type="button" class="dd-item" (click)="toggle(o)"><span class="cb" [class.on]="value().includes(o)">@if (value().includes(o)) {✓}</span>{{ o }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: block; min-width: 0; }
    .box { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; min-height: 36px; padding: 4px 8px; background: var(--kb-ffffff); cursor: pointer; color: var(--kf-475569); }
    :host(.err) .box { border-color: var(--kl-f87171); }
    :host(.open) .box { border-color: var(--kl-a78bfa); box-shadow: 0 0 0 3px var(--kb-ede9fe); }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; }
    .ph { color: var(--muted); font-size: 13px; padding: 2px; }
    .bk { position: fixed; inset: 0; z-index: 39; }
    .dd { left: 0; right: 0; max-height: 260px; overflow: auto; }
    .cb { width: 16px; height: 16px; border: 1.5px solid var(--kl-94a3b8); border-radius: 4px; display: inline-grid; place-items: center; font-size: 11px; color: var(--kf-ffffff); flex: none; }
    .cb.on { background: var(--primary); border-color: var(--primary); }
  `,
})
export class VmAreas {
  readonly value = model<string[]>([]);
  readonly options = input<string[]>([]);
  readonly err = input(false);
  protected readonly open = signal(false);
  remove(a: string) { this.value.update((l) => l.filter((x) => x !== a)); }
  toggle(a: string) { this.value.update((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a])); }
}

/** "Wed, 15 Oct 2026" for base date + offset days. */
export function dayLabel(base: Date, offset = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })}, ${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
}
/** "15 Oct 2026" */
export function shortDay(base: Date, offset = 0): string {
  return dayLabel(base, offset).slice(5);
}
/** yyyy-mm-dd for <input type=date>. */
export function isoDay(base: Date, offset = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Offset in days of an ISO date relative to base. */
export function offsetOf(base: Date, iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - b.getTime()) / 864e5);
}
/** Time option list 7:00 AM … 8:00 PM in 30-min steps (minutes since midnight). */
export const TIME_OPTS = Array.from({ length: 27 }, (_, i) => 420 + i * 30);

/** Lightweight toast holder. */
export class Toaster {
  readonly msg = signal('');
  private t: ReturnType<typeof setTimeout> | undefined;
  show(m: string) {
    this.msg.set(m);
    clearTimeout(this.t);
    this.t = setTimeout(() => this.msg.set(''), 2800);
  }
}

/** Compact form + layout CSS reused by the registration-style pages. */
export const VMA_CSS = `
  .fr { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 9px; }
  vm-avatar { overflow: hidden; display: inline-block; flex: none; }
  .vm-input { padding: 0 8px; gap: 7px; }
  .vm-input input, .vm-input select { font-size: 12.5px; }
  .vm-input select { padding-right: 18px; text-overflow: ellipsis; }
  .fr > label { font-size: 12.5px; font-weight: 500; color: var(--text); line-height: 1.2; }
  .fr > label b, .vm-field > label b { color: var(--kf-dc2626); }
  .vm-input select { cursor: pointer; appearance: none; -webkit-appearance: none; }
  .vm-input .chev { color: var(--kf-334155); pointer-events: none; margin-left: -18px; }
  .vm-input > app-icon { color: var(--kf-475569); flex: none; }
  .tg { display: flex; align-items: center; gap: 10px; font-size: 13px; min-height: 30px; margin-bottom: 4px; }
  .tg > app-icon { color: var(--kf-475569); flex: none; }
  .tg > span { flex: 1; }
  .ck { width: 18px; height: 18px; border-radius: 4px; border: 1.5px solid var(--kl-94a3b8); background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--kf-ffffff); flex: none; }
  .ck.on { background: var(--primary); border-color: var(--primary); }
  .sec-h { background: var(--primary-soft); border-radius: 8px; padding: 7px 12px; font-weight: 700; font-size: 15px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .cols3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
  .cols3 > section { padding: 0 14px; min-width: 0; }
  .cols3 > section + section { border-left: 1px solid var(--kl-eef0f6); }
  .cols3 > section:first-child { padding-left: 0; } .cols3 > section:last-child { padding-right: 0; }
  .btn-row { display: flex; gap: 10px; }
  .btn-row > * { flex: 1; justify-content: center; height: 38px; font-size: 13.5px; }
  .tbl-wrap { overflow-x: auto; }
  .vm-table th .si { color: var(--kf-94a3b8); vertical-align: -2px; margin-left: 3px; }
  .menu-wrap { position: relative; }
  .bk { position: fixed; inset: 0; z-index: 39; }
  .modal-head h3 { margin: 0; font-size: 18px; }
  .kv2 { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; font-size: 13px; }
  .kv2 > span { color: var(--muted); }
  .kv2 > b { font-weight: 600; }
  .m-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .num { display: flex; flex-direction: column; margin-left: auto; }
  .bc { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--kf-475569); margin-bottom: 6px; }
  .bc a { color: var(--kf-475569); text-decoration: none; } .bc a:hover { color: var(--primary); } .bc span { color: var(--text); }
  .vm-head h1 { font-size: 30px; }
  .vm-head p.sub { color: var(--kf-334155); font-size: 15px; }
  .hb { height: 38px; font-size: 14px; padding: 0 16px; }
  .hb.sq { width: 38px; padding: 0; justify-content: center; }
  .sum-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
  .sum-h { display: flex; align-items: center; gap: 12px; background: var(--primary-soft); border-radius: 10px; padding: 10px 14px; color: var(--primary); }
  .sum-h h2 { margin: 0; font-size: 19px; color: var(--text); }
  .sum > div { display: grid; grid-template-columns: 22px 94px minmax(0, 1fr); gap: 8px; align-items: start; padding: 9px 4px; border-bottom: 1px solid var(--kl-eef0f6); font-size: 13.5px; }
  .sum > div:last-child { border-bottom: 0; }
  .sum app-icon { color: var(--kf-475569); margin-top: 1px; }
  .sum span { font-weight: 600; } .sum b { font-weight: 500; line-height: 1.4; }
  .warn { display: flex; gap: 6px; align-items: center; color: var(--kf-b91c1c); background: var(--kb-fef2f2); border-radius: 8px; padding: 7px 10px; font-size: 12.5px; }
  .cnt-chip { background: var(--kb-ede9fe); color: var(--primary); border-radius: 10px; padding: 1px 9px; font-size: 12px; font-weight: 700; }
  .dt { white-space: nowrap; } .dt app-icon { color: var(--kf-475569); vertical-align: -3px; margin-right: 8px; }
  .ta-c { text-align: center !important; }
  .vm-acts { justify-content: center; gap: 10px; }
  .vm-acts .dropdown { min-width: 170px; }
  tr.flash td { animation: fl 2.4s ease; }
  @keyframes fl { 0%, 40% { background: var(--kb-ede9fe); } }
  .dh { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .dh div { flex: 1; } .dh b { display: block; font-size: 16px; } .dh small { color: var(--muted); }
  .g-modal.sm { width: min(440px, calc(100vw - 32px)); }
  .drop { border: 2px dashed var(--kl-c4b5fd); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--primary); margin-bottom: 12px; background: var(--kb-faf8ff); }
  .drop small { color: var(--muted); }
  .num button { border: 0; background: none; padding: 0; height: 12px; line-height: 10px; cursor: pointer; color: var(--kf-334155); font-size: 9px; }
`;
