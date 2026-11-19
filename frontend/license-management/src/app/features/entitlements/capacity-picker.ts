import { Component, computed, input, model, signal } from '@angular/core';
import { Capacity, CapacityOptions } from '../../core/models';

const UNLIMITED = 'unlimited';

/** People360-style options (same as the backend). Used if the catalog has none (e.g. an older API). */
export const DEFAULT_CAPACITY_OPTIONS: CapacityOptions = {
  registered: [50000, 200000, null],
  connected: [100, 500, 2500, 10000, 50000],
  autoRegistered: 50,
};

/** 50000 → "50,000", null → "Unlimited". */
export function formatQuantity(q: number | null | undefined): string {
  return q === null || q === undefined ? 'Unlimited' : q.toLocaleString('en-US');
}

/**
 * Connected without Registered gets Registered at the auto quantity (50), for products that have Registered.
 * That quantity is only valid together with Connected, so unticking Connected removes it again.
 * Products without Registered (Environment360) never get one.
 */
export function applyConnected(c: Capacity, on: boolean, opts: CapacityOptions, autoAdded: boolean): { capacity: Capacity; autoAdded: boolean } {
  if (on) {
    const next: Capacity = { ...c, connected: { quantity: opts.connected[0] } };
    if (!c.registered && opts.registered && opts.autoRegistered !== null)
      return { capacity: { ...next, registered: { quantity: opts.autoRegistered } }, autoAdded: true };
    return { capacity: next, autoAdded };
  }
  const next: Capacity = { ...c, connected: null };
  if (opts.autoRegistered !== null && c.registered?.quantity === opts.autoRegistered) next.registered = null;
  return { capacity: next, autoAdded: false };
}

/** "Registered & Connected" block shown after the module groups. */
@Component({
  selector: 'app-capacity-picker',
  template: `
    <div class="mod-group">
      <div class="mod-group-title">{{ hasRegistered() ? 'Registered &amp; Connected' : 'Connected' }}</div>
      <div class="mod-grid">
        @if (hasRegistered()) {
        <label class="mod" [class.on]="!!value().registered">
          <input
            type="checkbox"
            [checked]="!!value().registered"
            [disabled]="readonly() || !!value().connected"
            (change)="toggleRegistered($any($event.target).checked)"
          />
          <span class="mod-title">
            Registered
            @if (value().connected && !readonly()) { <span class="sub">required with Connected</span> }
          </span>
          @if (value().registered; as r) {
            @if (readonly()) {
              <span class="tag">{{ fmt(r.quantity) }}</span>
            } @else {
              <select class="qty" aria-label="Registered quantity" [value]="key(r.quantity)" (change)="setRegistered($any($event.target).value)">
                @for (o of registeredChoices(); track key(o)) {
                  <option [value]="key(o)">{{ fmt(o) }}</option>
                }
              </select>
            }
          }
        </label>
        }

        <label class="mod" [class.on]="!!value().connected">
          <input
            type="checkbox"
            [checked]="!!value().connected"
            [disabled]="readonly()"
            (change)="toggleConnected($any($event.target).checked)"
          />
          <span class="mod-title">Connected</span>
          @if (value().connected; as k) {
            @if (readonly()) {
              <span class="tag">{{ fmt(k.quantity) }}</span>
            } @else {
              <select class="qty" aria-label="Connected quantity" [value]="key(k.quantity)" (change)="setConnected($any($event.target).value)">
                @for (o of options().connected; track o) {
                  <option [value]="key(o)">{{ fmt(o) }}</option>
                }
              </select>
            }
          }
        </label>
      </div>
      @if (autoNote()) {
        <p class="sub cap-note">Registered {{ fmt(options().autoRegistered) }} added automatically because Connected was selected.</p>
      }
    </div>
  `,
})
export class CapacityPicker {
  readonly options = input(DEFAULT_CAPACITY_OPTIONS, {
    transform: (o: CapacityOptions | null | undefined) => (o?.connected?.length ? o : DEFAULT_CAPACITY_OPTIONS),
  });
  readonly readonly = input(false);
  readonly value = model<Capacity>({});

  private readonly autoAdded = signal(false);
  /** false for Connected-only products (Environment360). */
  protected readonly hasRegistered = computed(() => !!this.options().registered);

  /** The auto quantity (50) is offered only while Connected is ticked. */
  protected readonly registeredChoices = computed(() => {
    const o = this.options();
    const list = o.registered ?? [];
    const auto = o.autoRegistered;
    return this.value().connected && auto !== null && !list.includes(auto) ? [auto, ...list] : list;
  });

  protected readonly autoNote = computed(
    () =>
      !this.readonly() &&
      this.options().autoRegistered !== null &&
      !!this.value().connected &&
      this.value().registered?.quantity === this.options().autoRegistered,
  );

  protected fmt = formatQuantity;
  protected key = (q: number | null | undefined) => (q === null || q === undefined ? UNLIMITED : String(q));

  protected toggleRegistered(on: boolean): void {
    this.autoAdded.set(false);
    this.value.update((c) => ({ ...c, registered: on ? { quantity: this.options().registered?.[0] ?? null } : null }));
  }

  protected toggleConnected(on: boolean): void {
    const r = applyConnected(this.value(), on, this.options(), this.autoAdded());
    this.autoAdded.set(r.autoAdded);
    this.value.set(r.capacity);
  }

  protected setRegistered(v: string): void {
    this.autoAdded.set(false);
    this.value.update((c) => ({ ...c, registered: { quantity: v === UNLIMITED ? null : Number(v) } }));
  }

  protected setConnected(v: string): void {
    this.value.update((c) => ({ ...c, connected: { quantity: Number(v) } }));
  }
}
