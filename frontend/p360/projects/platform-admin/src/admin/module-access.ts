import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { ADDON_MODULES, AdminStore, MODULE_LIST } from './admin.data';
import { ADMIN_CSS, AdminSwitch, AdminToast } from './admin-ui';

@Component({
  selector: 'app-admin-module-access',
  imports: [...UI, AdminSwitch, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Module Access" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Turn modules on or off for the tenant, limit them to business units and see which roles can use them.">
      <div class="seg"><button [class.on]="filter() === 'all'" (click)="filter.set('all')">All</button><button [class.on]="filter() === 'on'" (click)="filter.set('on')">Enabled</button><button [class.on]="filter() === 'off'" (click)="filter.set('off')">Disabled</button><button [class.on]="filter() === 'addon'" (click)="filter.set('addon')">Add-ons</button></div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Modules" [value]="mods().length" icon="grid" color="var(--ka-7c3aed)" [sub]="enabled() + ' enabled'" />
      <app-kpi label="Licensed" [value]="licensedCount()" icon="admin-card" color="var(--ka-10b981)" [sub]="store.subscription().plan + ' plan'" />
      <app-kpi label="Add-ons Not Licensed" [value]="mods().length - licensedCount()" icon="admin-rocket" color="var(--ka-f59e0b)" sub="available to purchase" />
      <app-kpi label="Restricted by Business Unit" [value]="restricted()" icon="admin-sitemap" color="var(--ka-2563eb)" sub="not available in all BUs" />
      <app-kpi label="Sub-modules" [value]="subTotal()" icon="list-checks" color="var(--ka-ef4444)" sub="pages across all modules" />
    </section>

    <section class="split">
      <div class="cards">
        @for (m of shown(); track m.path) {
          <div class="card mc" [class.on]="sel() === m.path" [class.off]="!m.enabled" (click)="sel.set(m.path)">
            <div class="top"><span class="ri" [style.background]="m.enabled ? 'var(--ka-ede9fe)' : 'var(--ka-f1f2f6)'" [style.color]="m.enabled ? 'var(--ka-7c3aed)' : 'var(--ka-9ca3af)'"><app-icon [name]="m.icon" [size]="18" /></span>
              <span (click)="$event.stopPropagation()"><app-admin-switch [on]="m.enabled" [disabled]="!m.licensed || m.path === 'administration-configuration'" (toggled)="toggle(m.path, $event)" /></span></div>
            <b>{{ m.no }}. {{ m.title }}</b>
            <small class="muted">{{ m.subs }} sub-modules · {{ m.roles }} roles</small>
            <div class="tags">
              @if (!m.licensed) {<span class="tag amber">Add-on · not licensed</span>} @else if (m.addon) {<span class="tag">Add-on</span>} @else {<span class="tag green">Included</span>}
              @if (m.beta) {<span class="tag blue">Beta</span>}
              @if (m.scope.length < store.bus().length) {<span class="tag grey">{{ m.scope.length }}/{{ store.bus().length }} BUs</span>}
            </div>
          </div>
        }
      </div>
      @if (cur(); as m) {
        <aside class="card det">
          <div class="dh"><span class="ri" style="background:var(--kb-ede9fe);color:var(--kf-7c3aed)"><app-icon [name]="m.icon" [size]="20" /></span><div><h3>{{ m.title }}</h3><small class="muted">{{ m.enabled ? 'Enabled' : 'Disabled' }} for {{ store.org().name }}</small></div></div>
          @if (!m.licensed) {
            <p class="note warn"><app-icon name="admin-rocket" [size]="15" /><span>This add-on isn't in your subscription. <button class="link" (click)="router.navigateByUrl('/administration-configuration/subscription-licensing')">Add it in Subscription &amp; Licensing</button></span></p>
          }
          <h4>Available in business units</h4>
          <ul class="pol">
            @for (b of store.bus(); track b.id) {<li><div><b>{{ b.flag }} {{ b.name }}</b><small>{{ b.code }}</small></div><app-admin-switch [on]="m.scope.includes(b.id)" [disabled]="!m.enabled" (toggled)="scope(m.path, b.id, $event)" /></li>}
          </ul>
          <h4>Role access</h4>
          <ul class="mini">
            @for (r of roleAccess(); track r.id) {<li><span class="dot" [style.background]="r.color"></span><div><b>{{ r.name }}</b><small>{{ r.acts || 'No access' }}</small></div><span [class]="r.level === 'Full' ? 'tag green' : r.level === 'None' ? 'tag grey' : 'tag blue'">{{ r.level }}</span></li>}
          </ul>
          <div class="toolbar acts">
            <button class="btn-outline" (click)="router.navigateByUrl('/administration-configuration/roles-permissions')">Edit permissions</button>
            <button class="btn-ghost" (click)="router.navigateByUrl('/' + m.path)">Open module</button>
            <label class="beta"><input type="checkbox" [checked]="m.beta" (change)="beta(m.path)" />Beta features</label>
          </div>
        </aside>
      }
    </section>
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .mc { cursor: pointer; display: flex; flex-direction: column; gap: 6px; padding: 12px; } .mc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .mc.off b { color: var(--kf-6b7090); }
    .mc b { font-size: 12.5px; } .mc small { font-size: 11px; } .top { display: flex; justify-content: space-between; align-items: center; } .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .det { position: sticky; top: 76px; } .dot { width: 9px; height: 9px; border-radius: 50%; } .acts { margin-top: 12px; } .beta { display: flex; gap: 5px; align-items: center; font-size: 12px; }
  `],
})
export class ModuleAccess {
  protected readonly store = inject(AdminStore);
  protected readonly router = inject(Router);
  protected readonly filter = signal<'all' | 'on' | 'off' | 'addon'>('all');
  protected readonly sel = signal('visitor-management');
  protected readonly mods = computed(() => {
    const acc = this.store.moduleAccess();
    return MODULE_LIST.map((m) => {
      const a = acc.find((x) => x.path === m.path)!;
      const licensed = this.store.licensed(m.path);
      return { ...m, ...a, enabled: a.enabled && licensed, licensed, addon: ADDON_MODULES.includes(m.path), roles: this.store.roles().filter((r) => r.id === 'r-super' || (r.perms[m.path] ?? []).length).length };
    });
  });
  protected readonly shown = computed(() => this.mods().filter((m) => this.filter() === 'all' || (this.filter() === 'on' ? m.enabled : this.filter() === 'off' ? !m.enabled : m.addon)));
  protected readonly enabled = computed(() => this.mods().filter((m) => m.enabled).length);
  protected readonly licensedCount = computed(() => this.mods().filter((m) => m.licensed).length);
  protected readonly restricted = computed(() => this.mods().filter((m) => m.scope.length < this.store.bus().length).length);
  protected readonly subTotal = computed(() => this.mods().reduce((a, m) => a + m.subs, 0));
  protected readonly cur = computed(() => this.mods().find((m) => m.path === this.sel()));
  protected readonly roleAccess = computed(() => this.store.roles().map((r) => {
    const acts = r.id === 'r-super' ? ['View', 'Create', 'Edit', 'Delete', 'Approve', 'Export'] : r.perms[this.sel()] ?? [];
    return { id: r.id, name: r.name, color: r.color, acts: acts.join(', '), level: acts.length === 6 ? 'Full' : acts.length === 0 ? 'None' : acts.length === 1 ? 'View' : 'Partial' };
  }));
  private patch(path: string, fn: (a: { enabled: boolean; scope: string[]; beta: boolean }) => Partial<{ enabled: boolean; scope: string[]; beta: boolean }>) {
    this.store.moduleAccess.update((l) => l.map((x) => (x.path === path ? { ...x, ...fn(x) } : x)));
  }
  private title(path: string) {
    return MODULE_LIST.find((m) => m.path === path)?.title ?? path;
  }
  protected toggle(path: string, on: boolean) {
    this.patch(path, () => ({ enabled: on }));
    this.store.log('Updated', 'Module Access', this.title(path), `Module ${on ? 'enabled' : 'disabled'} for tenant`, 'System', on ? 'Info' : 'Warning');
    this.store.toast(`${this.title(path)} ${on ? 'enabled' : 'disabled'}${on ? '' : ' — hidden from all users'}`);
  }
  protected scope(path: string, bu: string, on: boolean) {
    this.patch(path, (a) => ({ scope: on ? [...a.scope, bu] : a.scope.filter((x) => x !== bu) }));
    const b = this.store.bu(bu)?.name;
    this.store.log('Updated', 'Module Access', this.title(path), `${on ? 'Enabled' : 'Disabled'} for ${b}`, 'System');
    this.store.toast(`${this.title(path)} ${on ? 'available in' : 'removed from'} ${b}`);
  }
  protected beta(path: string) {
    this.patch(path, (a) => ({ beta: !a.beta }));
    this.store.toast(`Beta features toggled for ${this.title(path)}`);
  }
}
