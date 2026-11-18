import { Component, computed, input } from '@angular/core';
import { daysLeft } from '../core/format';

/** Colored pill for an entitlement state (or a tier when kind="tier"). */
@Component({
  selector: 'app-badge',
  template: `<span class="badge" [class]="'badge b-' + cls()">{{ value() }}</span>`,
})
export class Badge {
  readonly value = input.required<string>();
  readonly kind = input<'state' | 'tier'>('state');
  protected readonly cls = computed(() => (this.kind() === 'tier' ? 'tier-' : '') + this.value().toLowerCase());
}

/** "42 d" / "Expired 3 d ago" with warning colors. */
@Component({
  selector: 'app-days-left',
  template: `<span [class]="cls()">{{ text() }}</span>`,
})
export class DaysLeft {
  readonly until = input.required<string>();
  private readonly d = computed(() => daysLeft(this.until()));
  protected readonly text = computed(() => {
    const d = this.d();
    if (d === null) return '—';
    if (d < 0) return `${-d} d ago`;
    return d === 0 ? 'today' : `${d} d`;
  });
  protected readonly cls = computed(() => {
    const d = this.d() ?? 0;
    return d < 0 ? 'dl dl-bad' : d <= 30 ? 'dl dl-warn' : 'dl';
  });
}
