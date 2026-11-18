import { Component, computed, input, model } from '@angular/core';
import { Catalog, CatalogModule, Inclusion, Tier } from '../../core/models';

/** Modules a tier turns on by default: core + Included. Keeps previous add-ons that the tier still allows. */
export function defaultModules(catalog: Catalog, tier: Tier, previous: string[] = []): string[] {
  const inc = catalog.tiers.find((t) => t.tier === tier)?.inclusion ?? {};
  return catalog.modules
    .filter((m) => m.core || inc[m.key] === 'Included' || (inc[m.key] === 'AddOn' && previous.includes(m.key)))
    .map((m) => m.key);
}

interface Row {
  m: CatalogModule;
  inclusion: Inclusion | 'Core';
  on: boolean;
  locked: boolean;
}

/**
 * Module checklist grouped like the tier sheet.
 * Core and Included start ticked but can be unticked. AddOn = optional. None = unavailable.
 * With `override` on, None modules can be ticked too.
 */
@Component({
  selector: 'app-module-picker',
  template: `
    @for (g of groups(); track g.name) {
      <div class="mod-group">
        <div class="mod-group-title">{{ g.name }}</div>
        <div class="mod-grid">
          @for (r of g.rows; track r.m.key) {
            <label class="mod" [class.on]="r.on" [class.off]="r.locked && !r.on">
              <input type="checkbox" [checked]="r.on" [disabled]="r.locked || readonly()" (change)="toggle(r.m.key)" />
              <span class="mod-title">{{ r.m.title }}</span>
              @switch (r.inclusion) {
                @case ('Core') { <span class="tag core">core</span> }
                @case ('AddOn') { <span class="tag addon">add-on</span> }
                @case ('None') { <span class="tag">not in tier</span> }
              }
            </label>
          }
        </div>
      </div>
    }
  `,
})
export class ModulePicker {
  readonly catalog = input.required<Catalog>();
  readonly tier = input.required<Tier>();
  readonly override = input(false);
  readonly readonly = input(false);
  readonly selected = model<string[]>([]);

  protected readonly groups = computed(() => {
    const cat = this.catalog();
    const inc = cat.tiers.find((t) => t.tier === this.tier())?.inclusion ?? {};
    const sel = new Set(this.selected());
    const ov = this.override();
    const map = new Map<string, Row[]>();
    for (const m of cat.modules) {
      const inclusion: Row['inclusion'] = m.core ? 'Core' : (inc[m.key] ?? 'None');
      const locked = !ov && inclusion === 'None';
      const rows = map.get(m.group) ?? [];
      rows.push({ m, inclusion, on: sel.has(m.key), locked });
      map.set(m.group, rows);
    }
    return [...map].map(([name, rows]) => ({ name, rows }));
  });

  protected toggle(key: string): void {
    this.selected.update((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }
}
