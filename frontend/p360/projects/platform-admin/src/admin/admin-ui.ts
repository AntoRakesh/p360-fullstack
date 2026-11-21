// Small building blocks shared by the admin pages: switch, toast, logo, entity add/edit modal.
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { Icon } from '@p360/shared/icon';
import { SelectValue } from '@p360/shared/select-value';
import { AdminStore, BusinessUnit, COUNTRIES, Department, Site, TENANT_TYPES } from './admin.data';

@Component({
  selector: 'app-admin-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="sw" [class.on]="on()" [disabled]="disabled()" role="switch" [attr.aria-checked]="on()" (click)="toggled.emit(!on())"><i></i></button>`,
  styles: `
    :host { display: inline-flex; }
    .sw { width: 34px; height: 19px; border-radius: 20px; border: 0; background: var(--kb-c9ccd8); position: relative; cursor: pointer; padding: 0; transition: background 0.15s; flex-shrink: 0; }
    .sw i { position: absolute; top: 2.5px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--kb-ffffff); box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: left 0.15s; }
    .sw.on { background: var(--kb-22c55e); } .sw.on i { left: 17px; } .sw:disabled { opacity: 0.5; cursor: default; }
  `,
})
export class AdminSwitch {
  readonly on = input(false);
  readonly disabled = input(false);
  readonly toggled = output<boolean>();
}

@Component({
  selector: 'app-admin-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}`,
})
export class AdminToast {
  protected readonly store = inject(AdminStore);
}

/** "Purple IQ" brand mark used as the default tenant logo. */
@Component({
  selector: 'app-admin-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {<img [src]="src()" alt="Organization logo" [style.max-height.px]="size()" />} @else {
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" [attr.stroke]="color()" stroke-width="3.4" />
        <path d="M14 30c2-9 6-14 11-14s9 4 9 9-4 8-8 8h-3" fill="none" [attr.stroke]="color()" stroke-width="3.4" stroke-linecap="round" />
        <circle cx="27" cy="25" r="2.8" [attr.fill]="color()" />
      </svg>
      <span [style.font-size.px]="size() * 0.56" [style.color]="color()">Purple IQ</span>
    }
  `,
  styles: `:host { display: inline-flex; align-items: center; gap: 6px; } span { font-weight: 800; letter-spacing: -0.5px; white-space: nowrap; } img { max-width: 100%; object-fit: contain; }`,
})
export class AdminLogo {
  readonly src = input<string | null>(null);
  readonly size = input(36);
  readonly color = input('var(--ka-6d28d9)');
}

export type EntityKind = 'bu' | 'site' | 'dept' | 'org';
export interface EntityReq { kind: EntityKind; id?: string; parent?: string; }

/** Add / edit modal for business units, sites, departments and sub-tenant organizations. */
@Component({
  selector: 'app-admin-entity-modal',
  imports: [Icon, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); save()">
      <div class="modal-head"><h3>{{ title() }}</h3><button type="button" class="close-btn" (click)="closed.emit()">×</button></div>
      @switch (req().kind) {
        @case ('bu') {
          <div class="form-grid">
            <label class="full">Business unit name *<input class="input" name="n" [value]="bu().name" (input)="bu.set({ ...bu(), name: v($event) })" /></label>
            <label>Code<input class="input" [value]="bu().code" (input)="bu.set({ ...bu(), code: v($event) })" /></label>
            <label>Country<select class="select" [value]="bu().country" (change)="bu.set({ ...bu(), country: v($event) })">@for (c of countries; track c) {<option>{{ c }}</option>}</select></label>
            <label>Business unit head<input class="input" [value]="bu().head" (input)="bu.set({ ...bu(), head: v($event) })" /></label>
            <label>Status<select class="select" [value]="bu().status" (change)="bu.set({ ...bu(), status: $any(v($event)) })"><option>Active</option><option>Inactive</option></select></label>
          </div>
        }
        @case ('site') {
          <div class="form-grid">
            <label class="full">Site / location name *<input class="input" [value]="site().name" (input)="site.set({ ...site(), name: v($event) })" /></label>
            <label>Business unit *<select class="select" [value]="site().buId" (change)="site.set({ ...site(), buId: v($event) })">@for (b of store.bus(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}</select></label>
            <label>Site type<select class="select" [value]="site().type" (change)="site.set({ ...site(), type: $any(v($event)) })">@for (t of siteTypes; track t) {<option>{{ t }}</option>}</select></label>
            <label>City *<input class="input" [value]="site().city" (input)="site.set({ ...site(), city: v($event) })" /></label>
            <label>Site manager<input class="input" [value]="site().manager" (input)="site.set({ ...site(), manager: v($event) })" /></label>
            <label class="full">Address<input class="input" [value]="site().address" (input)="site.set({ ...site(), address: v($event) })" /></label>
            <label>Floors<input class="input" type="number" min="1" [value]="site().floors" (input)="site.set({ ...site(), floors: +v($event) })" /></label>
            <label>Capacity (people)<input class="input" type="number" min="1" [value]="site().capacity" (input)="site.set({ ...site(), capacity: +v($event) })" /></label>
            <label>Status<select class="select" [value]="site().status" (change)="site.set({ ...site(), status: $any(v($event)) })"><option>Active</option><option>Commissioning</option><option>Inactive</option></select></label>
          </div>
        }
        @case ('dept') {
          <div class="form-grid">
            <label class="full">Department name *<input class="input" [value]="dept().name" (input)="dept.set({ ...dept(), name: v($event) })" /></label>
            <label>Site *<select class="select" [value]="dept().siteId" (change)="dept.set({ ...dept(), siteId: v($event) })">@for (s of store.sites(); track s.id) {<option [value]="s.id">{{ s.name }} · {{ store.bu(s.buId)?.code }}</option>}</select></label>
            <label>Department head *<input class="input" [value]="dept().head" (input)="dept.set({ ...dept(), head: v($event) })" /></label>
            <label>Cost center<input class="input" [value]="dept().costCenter" (input)="dept.set({ ...dept(), costCenter: v($event) })" /></label>
            <label>Status<select class="select" [value]="dept().status" (change)="dept.set({ ...dept(), status: $any(v($event)) })"><option>Active</option><option>Inactive</option></select></label>
          </div>
        }
        @case ('org') {
          <p class="muted note"><app-icon name="admin-sitemap" [size]="14" /> Creates a sub-tenant under <b>{{ store.org().name }}</b> with its own users, branding and data partition.</p>
          <div class="form-grid">
            <label class="full">Organization name *<input class="input" [value]="org().name" (input)="org.set({ ...org(), name: v($event) })" /></label>
            <label>Tenant type<select class="select" [value]="org().type" (change)="org.set({ ...org(), type: v($event) })">@for (t of tenantTypes; track t) {<option>{{ t }}</option>}</select></label>
            <label>Tenant admin email *<input class="input" type="email" [value]="org().admin" (input)="org.set({ ...org(), admin: v($event) })" /></label>
          </div>
          @if (!store.tenant().subTenants) {<p class="warn"><app-icon name="triangle-alert" [size]="14" /> "Allow Sub-Tenants" is disabled — it will be enabled automatically.</p>}
        }
      }
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="closed.emit()">Cancel</button><button class="btn-primary" type="submit">{{ req().id ? 'Save changes' : 'Create' }}</button></div>
    </form>
  `,
  styles: `.note, .warn { display: flex; gap: 6px; align-items: center; font-size: 12.5px; margin: 0 0 12px; } .warn { color: var(--kf-b45309); margin-top: 12px; } .bad { font-size: 12.5px; }`,
})
export class AdminEntityModal implements OnInit {
  protected readonly store = inject(AdminStore);
  readonly req = input.required<EntityReq>();
  readonly closed = output<void>();
  readonly saved = output<string>();
  protected readonly countries = COUNTRIES;
  protected readonly tenantTypes = TENANT_TYPES;
  protected readonly siteTypes = ['Head Office', 'Office', 'Warehouse', 'Plant', 'Data Center', 'Field Site'];
  protected readonly err = signal('');
  protected readonly bu = signal<BusinessUnit>({ id: '', name: '', code: '', country: 'United Arab Emirates', flag: '🏳️', head: '', status: 'Active', created: new Date().toISOString().slice(0, 10), color: 'var(--ka-0891b2)' });
  protected readonly site = signal<Site>({ id: '', name: '', buId: 'bu-uae', city: '', type: 'Office', address: '', floors: 1, capacity: 50, manager: '', status: 'Active', lon: 55.3, lat: 25.1, zones: 6, devices: 6 });
  protected readonly dept = signal<Department>({ id: '', name: '', siteId: 's-hq', head: '', costCenter: '', status: 'Active', teams: [], target: 0 });
  protected readonly org = signal({ name: '', type: 'Customer (SMB)', admin: '' });
  protected readonly title = computed(() => {
    const r = this.req();
    const what = { bu: 'Business Unit', site: 'Site / Location', dept: 'Department', org: 'Organization (Sub-Tenant)' }[r.kind];
    return `${r.id ? 'Edit' : 'Add'} ${what}`;
  });
  protected v(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  ngOnInit() {
    const r = this.req();
    if (r.kind === 'bu' && r.id) this.bu.set({ ...this.store.bu(r.id)! });
    if (r.kind === 'site') {
      if (r.id) this.site.set({ ...this.store.site(r.id)! });
      else if (r.parent) this.site.update((s) => ({ ...s, buId: r.parent! }));
    }
    if (r.kind === 'dept') {
      if (r.id) this.dept.set({ ...this.store.dept(r.id)!, teams: this.store.dept(r.id)!.teams });
      else if (r.parent) this.dept.update((d) => ({ ...d, siteId: r.parent! }));
    }
  }
  protected save() {
    const k = this.req().kind;
    if (k === 'bu') {
      const b = this.bu();
      if (!b.name.trim()) return this.err.set('Business unit name is required.');
      const code = b.code || 'BU-' + b.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      this.store.saveBU({ ...b, code });
      this.done(b.id ? `${b.name} updated` : `${b.name} created`);
    } else if (k === 'site') {
      const s = this.site();
      if (!s.name.trim() || !s.city.trim()) return this.err.set('Site name and city are required.');
      const bu = this.store.bu(s.buId);
      const sib = this.store.sites().find((x) => x.buId === s.buId);
      const pos = s.id ? {} : { lon: (sib?.lon ?? 55) + 0.15, lat: (sib?.lat ?? 25) - 0.1 };
      this.store.saveSite({ ...s, ...pos, zones: s.floors * 4 + 2, devices: Math.round(s.capacity / 9) });
      this.done(`${s.name} ${s.id ? 'updated' : 'added to ' + bu?.name}`);
    } else if (k === 'dept') {
      const d = this.dept();
      if (!d.name.trim() || !d.head.trim()) return this.err.set('Department name and head are required.');
      this.store.saveDept({ ...d, costCenter: d.costCenter || 'CC-' + d.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() });
      this.done(`${d.name} ${d.id ? 'updated' : 'created under ' + this.store.site(d.siteId)?.name}`);
    } else {
      const o = this.org();
      if (!o.name.trim() || !/@/.test(o.admin)) return this.err.set('Organization name and a valid admin email are required.');
      if (!this.store.tenant().subTenants) this.store.setTenant('subTenants', true, 'Allow Sub-Tenants');
      this.store.subTenants.update((l) => [...l, { id: `st-${Date.now()}`, name: o.name, type: o.type, admin: o.admin, created: new Date().toISOString().slice(0, 10) }]);
      this.store.log('Created', 'Organization', o.name, `Sub-tenant (${o.type}) · invitation sent to ${o.admin}`, 'Organization');
      this.done(`${o.name} created · invitation sent to ${o.admin}`);
    }
  }
  private done(msg: string) {
    this.store.toast(msg);
    this.saved.emit(msg);
    this.closed.emit();
  }
}

/** Visual mapping for audit entries (icon + tint). */
export function auditIcon(entity: string): { icon: string; color: string; bg: string } {
  const m: Record<string, [string, string, string]> = {
    Department: ['users', 'var(--ka-7c3aed)', 'var(--ka-ede9fe)'], Site: ['home', 'var(--ka-2563eb)', 'var(--ka-dbeafe)'], 'User Group': ['users', 'var(--ka-ef4444)', 'var(--ka-fee2e2)'],
    Branding: ['admin-brush', 'var(--ka-9333ea)', 'var(--ka-f3e8ff)'], 'SSO Configuration': ['shield-check', 'var(--ka-16a34a)', 'var(--ka-dcfce7)'], Organization: ['building', 'var(--ka-7c3aed)', 'var(--ka-ede9fe)'],
    'Business Unit': ['admin-bu', 'var(--ka-2563eb)', 'var(--ka-dbeafe)'], 'Tenant Setting': ['sliders', 'var(--ka-ea580c)', 'var(--ka-ffedd5)'], Role: ['shield', 'var(--ka-db2777)', 'var(--ka-fce7f3)'],
    User: ['user', 'var(--ka-0891b2)', 'var(--ka-cffafe)'], Team: ['users', 'var(--ka-7c3aed)', 'var(--ka-ede9fe)'], Authentication: ['key-round', 'var(--ka-64748b)', 'var(--ka-f1f5f9)'],
    'Module Access': ['key-round', 'var(--ka-ca8a04)', 'var(--ka-fef9c3)'], 'Password Policy': ['admin-lock', 'var(--ka-dc2626)', 'var(--ka-fee2e2)'], 'System Setting': ['settings', 'var(--ka-475569)', 'var(--ka-f1f5f9)'],
    Localization: ['admin-languages', 'var(--ka-0d9488)', 'var(--ka-ccfbf1)'], Subscription: ['admin-card', 'var(--ka-16a34a)', 'var(--ka-dcfce7)'], 'Data Request': ['shield', 'var(--ka-0891b2)', 'var(--ka-cffafe)'],
    'Retention Policy': ['admin-database', 'var(--ka-e11d48)', 'var(--ka-ffe4e6)'], 'API Key': ['key-round', 'var(--ka-dc2626)', 'var(--ka-fee2e2)'], Report: ['file-text', 'var(--ka-475569)', 'var(--ka-f1f5f9)'],
  };
  const [icon, color, bg] = m[entity] ?? ['settings', 'var(--ka-475569)', 'var(--ka-f1f5f9)'];
  return { icon, color, bg };
}

/** Styles shared by the admin sub-pages (included via `styles: [ADMIN_CSS, ...]`). */
export const ADMIN_CSS = `
  :host { display: block; } app-column-chart, app-line-chart { display: block; }
  .danger { color: var(--red); } label.dd-item { cursor: pointer; }
  .ct { font-size: 15.5px; font-weight: 700; margin: 0 0 12px; }
  .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; } .ch h3 { font-size: 15.5px; font-weight: 700; }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 420px); gap: 12px; align-items: start; margin-bottom: 12px; }
  .split.left { grid-template-columns: minmax(260px, 300px) minmax(0, 1fr); }
  .kv { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; font-size: 12.5px; margin: 0 0 12px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; display: flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
  .pol { list-style: none; margin: 0; padding: 0; } .pol > li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
  .pol > li > div { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; } .pol small { color: var(--muted); font-size: 11.5px; } .pol > li:last-child { border-bottom: 0; }
  .ri { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
  .av { width: 30px; height: 30px; border-radius: 50%; color: var(--kf-ffffff); font-size: 11px; font-weight: 600; display: inline-grid; place-items: center; flex-shrink: 0; }
  .av.sm { width: 24px; height: 24px; font-size: 9.5px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--kb-ffffff); }
  .seg button { border: 0; background: none; padding: 7px 12px; font: inherit; font-size: 12px; cursor: pointer; color: var(--kf-4b4f6b); white-space: nowrap; } .seg button + button { border-left: 1px solid var(--border); } .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
  .side { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .side button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid transparent; border-radius: 9px; background: none; font: inherit; font-size: 13px; cursor: pointer; text-align: left; color: var(--text); }
  .side button:hover { background: var(--kb-f7f5ff); } .side button.on { background: var(--primary-soft); border-color: var(--kl-d8ccfb); color: var(--primary); font-weight: 600; }
  .side small { display: block; font-size: 11px; color: var(--muted); font-weight: 400; } .side .grow { flex: 1; min-width: 0; } .side .cnt { font-size: 11px; color: var(--muted); }
  .stat { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 9px; background: var(--kb-f7f7fb); } .stat b { font-size: 19px; } .stat small { font-size: 11.5px; color: var(--muted); }
  .bar { height: 8px; border-radius: 6px; background: var(--kb-eef0f6); overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, var(--kb-7c3aed), var(--kb-2563eb)); }
  .note { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 9px; font-size: 12.5px; background: var(--kb-f5f3ff); color: var(--kf-4c1d95); margin: 0 0 12px; }
  .note.warn { background: var(--kb-fffbeb); color: var(--kf-92400e); } .note.ok { background: var(--kb-f0fdf4); color: var(--kf-166534); } .note.bad { background: var(--kb-fef2f2); color: var(--kf-991b1b); }
  .field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--kf-4b4f6b); min-width: 0; } .field .input, .field .select { width: 100%; }
  .fgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; } .fgrid .full { grid-column: 1 / -1; }
  .mini { list-style: none; margin: 0; padding: 0; } .mini li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .mini li > div { display: flex; flex-direction: column; flex: 1; min-width: 0; } .mini small { color: var(--muted); font-size: 11.5px; }
  .dh { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; margin-bottom: 14px; } .dh > div { display: flex; flex-direction: column; min-width: 0; }
  h4 { font-size: 13px; margin: 12px 0 8px; }
  @media (max-width: 1250px) { .split, .split.left { grid-template-columns: 1fr; } .grid3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 800px) { .grid2, .grid3, .fgrid { grid-template-columns: 1fr; } }
`;
