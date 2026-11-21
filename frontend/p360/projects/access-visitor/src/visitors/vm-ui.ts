// Shared visual primitives for the redesigned Visitor Management pages (reference images, Oct 2026 set).
// Global `.vm-*` classes live in src/styles.scss (section "Visitor Management v2").
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '@p360/shared/icon';

/** Tinted KPI tile: big rounded icon square, label, large value, optional delta / sub / chevron. */
@Component({
  selector: 'vm-kpi',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-kpi', '[class.clickable]': 'clickable()', '[class.active]': 'active()', '[style.--c]': 'color()', '(click)': 'clickable() && pick.emit()' },
  template: `
    <span class="vm-kpi-ic"><app-icon [name]="icon()" [size]="30" [stroke]="1.8" /></span>
    <div class="vm-kpi-body">
      <span class="vm-kpi-label">{{ label() }}</span>
      <div class="vm-kpi-row">
        <b class="vm-kpi-val">{{ value() }}</b>
        @if (delta()) {
          <span class="vm-kpi-delta" [class.down]="!good()"><app-icon [name]="up() ? 'arrow-up' : 'arrow-down'" [size]="12" [stroke]="2.6" />{{ delta() }}</span>
        }
        @if (badge()) { <span class="vm-kpi-badge">{{ badge() }}</span> }
      </div>
      @if (sub()) { <small class="vm-kpi-sub">{{ sub() }}</small> }
    </div>
    @if (chevron()) { <app-icon class="vm-kpi-chev" name="chevron-right" [size]="20" /> }
  `,
})
export class VmKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('users');
  /** Accent colour; tile background is a soft gradient of it. */
  readonly color = input('var(--ka-7c3aed)');
  readonly delta = input<string>();
  readonly up = input(true);
  readonly good = input(true);
  readonly badge = input<string>();
  readonly sub = input<string>();
  readonly chevron = input(false);
  readonly clickable = input(false);
  readonly active = input(false);
  readonly pick = output<void>();
}

const SKIN = ['var(--ka-f1c7a5)', 'var(--ka-e0ac85)', 'var(--ka-c68d63)', 'var(--ka-a96f4a)', 'var(--ka-f4d3b8)', 'var(--ka-d9a07a)'];
const HAIR = ['var(--ka-2b1d16)', 'var(--ka-3b2a20)', 'var(--ka-1d1a1a)', 'var(--ka-5a3b26)', 'var(--ka-6b4a2f)', 'var(--ka-262626)'];
const SHIRT = ['var(--ka-1e3a8a)', 'var(--ka-334155)', 'var(--ka-7c3aed)', 'var(--ka-0f766e)', 'var(--ka-475569)', 'var(--ka-9d174d)', 'var(--ka-1f2937)', 'var(--ka-b45309)'];
const FEMALE = new Set(['Maria Santos', 'Sarah Khan', 'Priya Sharma', 'Fatima Ali', 'Li Wei', 'Anika Rao', 'Dr. Anika Rao', 'Sophie Martin', 'Grace Park', 'Aisha Noor', 'Emily Clark', 'Neha Gupta', 'Hana Yusuf', 'Olivia Brown', 'Meera Iyer', 'Layla Hassan', 'Sara Ahmed', 'Nadia Karim']);
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export const isFemale = (name: string) => FEMALE.has(name) || /^(Ms|Mrs|Dr\. ?[A-Z][a-z]+a)\b/.test(name);

/** Illustrated portrait avatar (stands in for the visitor photos in the reference images). */
@Component({
  selector: 'vm-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-avatar', '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[style.border-radius]': 'square() ? "14%" : "50%"' },
  template: `
    <svg viewBox="0 0 64 64" [attr.width]="size()" [attr.height]="size()">
      <rect width="64" height="64" [attr.fill]="p().bg" />
      @if (p().f) { <path [attr.d]="'M14 40 Q12 14 32 12 Q52 14 50 40 Q50 50 44 52 L20 52 Q14 50 14 40Z'" [attr.fill]="p().hair" /> }
      <path d="M8 64 Q10 46 32 44 Q54 46 56 64Z" [attr.fill]="p().shirt" />
      @if (!p().f) { <path d="M26 45 L32 54 L38 45" fill="var(--ka-ffffff)" opacity=".9" /> }
      <rect x="27" y="36" width="10" height="10" rx="4" [attr.fill]="p().skin" />
      <ellipse cx="32" cy="29" rx="11" ry="13" [attr.fill]="p().skin" />
      @if (p().f) {
        <path d="M20 28 Q20 14 32 15 Q44 14 44 28 Q40 20 32 21 Q24 20 20 28Z" [attr.fill]="p().hair" />
      } @else {
        <path d="M21 27 Q20 14 32 14 Q44 14 43 27 Q42 19 32 20 Q24 19 21 27Z" [attr.fill]="p().hair" />
        @if (p().beard) { <path d="M22 31 Q23 43 32 43 Q41 43 42 31 Q40 38 32 38 Q24 38 22 31Z" [attr.fill]="p().hair" opacity=".85" /> }
      }
      <circle cx="28" cy="29" r="1.3" fill="var(--ka-1f1a17)" /><circle cx="36" cy="29" r="1.3" fill="var(--ka-1f1a17)" />
      <path d="M29 35 Q32 37 35 35" stroke="var(--kl-7a4a35)" stroke-width="1.2" fill="none" stroke-linecap="round" />
    </svg>
  `,
})
export class VmAvatar {
  readonly name = input.required<string>();
  readonly size = input(36);
  readonly square = input(false);
  protected readonly p = computed(() => {
    const n = this.name();
    const h = hash(n);
    return {
      f: isFemale(n),
      skin: SKIN[h % SKIN.length],
      hair: HAIR[(h >>> 3) % HAIR.length],
      shirt: SHIRT[(h >>> 5) % SHIRT.length],
      beard: (h >>> 7) % 3 === 0,
      bg: ['var(--ka-e9e3ff)', 'var(--ka-dbeafe)', 'var(--ka-dcfce7)', 'var(--ka-fef3c7)', 'var(--ka-fce7f3)', 'var(--ka-e0f2fe)'][(h >>> 9) % 6],
    };
  });
}

/** Status pill with a coloured dot (or icon) — tone picked from the label when not given. */
@Component({
  selector: 'vm-status',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-pill', '[attr.data-tone]': 'tone2()' },
  template: `@if (icon()) {<app-icon [name]="icon()!" [size]="13" [stroke]="2.2" />} @else {<i></i>}{{ label() }}`,
})
export class VmStatus {
  readonly label = input.required<string>();
  readonly tone = input<'green' | 'orange' | 'red' | 'blue' | 'purple' | 'grey' | 'yellow'>();
  readonly icon = input<string>();
  protected readonly tone2 = computed(() => this.tone() ?? toneOf(this.label()));
}

export function toneOf(s: string): string {
  const l = s.toLowerCase();
  if (/(fail|reject|expired|denied|overdue|high|unaccounted|lost|revoked|alert|cancel|restricted|blocked|checked out)/.test(l)) return l.includes('checked out') ? 'grey' : 'red';
  if (/(pending|review|awaiting|medium|queued|expiring|draft|upcoming|potential|scheduled|reschedul|temporary)/.test(l))
    return l.includes('upcoming') || l.includes('scheduled') || l.includes('reschedul') ? 'blue' : l.includes('draft') ? 'grey' : 'orange';
  if (/(sent|opened|in progress|expected|issued|printed|read)/.test(l)) return l.includes('in progress') || l.includes('expected') || l.includes('sent') || l.includes('opened') ? 'blue' : 'green';
  if (/(confirm|approved|active|verified|checked in|accounted|clear|delivered|ready|low|on-site|passed|completed|enabled|used|escorted|success)/.test(l)) return 'green';
  return 'purple';
}

/** Pill tab group (active = filled purple). */
@Component({
  selector: 'vm-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-tabs' },
  template: `@for (t of tabs(); track t) {<button type="button" [class.on]="t === value()" (click)="change.emit(t)">{{ t }}</button>}`,
})
export class VmTabs {
  readonly tabs = input.required<string[]>();
  readonly value = input.required<string>();
  readonly change = output<string>();
}

export const VM_UI = [VmKpi, VmAvatar, VmStatus, VmTabs];
