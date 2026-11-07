import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { AdminStore, fmtN, Site } from './admin.data';
import { ADMIN_CSS, AdminEntityModal, AdminToast, EntityReq } from './admin-ui';

type LL = [number, number];
const K = 70;
const px = ([lon, lat]: LL) => [(lon - 46) * K, (30.6 - lat) * K] as const;
const poly = (pts: LL[]) => pts.map((p) => px(p).map((v) => v.toFixed(1)).join(',')).join(' ');
const LAND: { name: string; pts: LL[]; fill: string; label?: LL }[] = [
  { name: 'Saudi Arabia', fill: '#eceef4', label: [48.6, 23.6], pts: [[46, 30.6], [47.7, 30.6], [48.0, 29.95], [48.4, 28.5], [49.6, 27.1], [50.1, 26.4], [50.2, 25.7], [50.75, 24.75], [51.2, 24.55], [51.6, 24.25], [52.6, 22.9], [55.2, 22.7], [55.7, 22.0], [55.0, 20.0], [52.0, 19.0], [49, 18.2], [46, 17.4]] },
  { name: 'Iran', fill: '#eceef4', label: [55.5, 28.6], pts: [[48.5, 30.6], [49.5, 30.0], [50.3, 29.2], [51.0, 28.0], [52.5, 27.4], [54.0, 26.7], [55.6, 26.9], [56.4, 27.1], [57.3, 25.8], [59, 25.4], [60.6, 25.3], [60.6, 30.6]] },
  { name: 'Kuwait', fill: '#dbe7ff', label: [47.3, 29.75], pts: [[46.55, 29.1], [47.0, 29.6], [47.7, 30.1], [48.0, 29.95], [47.95, 29.6], [48.15, 29.4], [48.4, 28.55], [47.7, 28.53], [47.45, 29.0]] },
  { name: 'Qatar', fill: '#fce7f3', label: [51.2, 25.0], pts: [[50.75, 24.75], [50.8, 25.5], [51.0, 26.05], [51.3, 26.1], [51.6, 25.6], [51.6, 25.2], [51.5, 24.6], [51.2, 24.55]] },
  { name: 'Bahrain', fill: '#ffedd5', label: [50.3, 26.5], pts: [[50.45, 26.25], [50.65, 26.25], [50.62, 25.8], [50.5, 25.85]] },
  { name: 'United Arab Emirates', fill: '#ede9fe', label: [53.6, 23.5], pts: [[51.6, 24.25], [52.0, 24.0], [52.6, 24.2], [53.5, 24.1], [54.2, 24.3], [54.7, 24.8], [55.3, 25.3], [55.6, 25.6], [56.05, 26.05], [56.37, 25.6], [56.37, 24.97], [56.0, 24.6], [55.8, 24.2], [55.95, 23.9], [55.5, 23.3], [55.2, 22.7], [52.6, 22.9]] },
  { name: 'Oman', fill: '#dcfce7', label: [56.6, 21.2], pts: [[56.37, 24.97], [56.8, 24.3], [57.4, 23.9], [58.4, 23.6], [58.9, 23.1], [59.8, 22.5], [59.5, 21.6], [58.7, 20.6], [58.0, 20.0], [57.7, 19.1], [56.8, 18.6], [56.3, 17.9], [55.4, 17.8], [54.1, 17.0], [53.1, 16.7], [52.0, 19.0], [55.0, 20.0], [55.7, 22.0], [55.2, 22.7], [55.5, 23.3], [55.95, 23.9], [55.8, 24.2], [56.0, 24.6]] },
];
const TYPE_ICON: Record<Site['type'], string> = { 'Head Office': 'home', Office: 'admin-office', Warehouse: 'box', Plant: 'settings', 'Data Center': 'admin-server', 'Field Site': 'hard-hat' };

@Component({
  selector: 'app-admin-sites-locations',
  imports: [...UI, DataTable, AdminEntityModal, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Sites &amp; Locations" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Every site, office, warehouse and field location in the tenant — map, capacity, occupancy and structure.">
      <button class="btn-primary" (click)="modal.set({ kind: 'site', parent: buFilter() ?? 'bu-uae' })"><app-icon name="plus" [size]="16" />Add Site</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Sites" [value]="store.sites().length" icon="map-pin" color="#f59e0b" [sub]="active() + ' active · ' + commissioning() + ' commissioning'" />
      <app-kpi label="Countries / Business Units" [value]="store.bus().length" icon="admin-globe" color="#2563eb" sub="UAE, KW, OM, BH, QA" />
      <app-kpi label="Total Capacity" [value]="fmt(capacity())" icon="admin-office" color="#7c3aed" sub="seats & workstations" />
      <app-kpi label="On Site Now" [value]="fmt(onSiteTotal())" icon="users" color="#22c55e" [sub]="occPct() + '% of capacity · live'" subColor="#16a34a" />
      <app-kpi label="Zones / Devices" [value]="zones() + ' / ' + fmt(devices())" icon="cpu" color="#0891b2" sub="mapped zones / edge devices" />
    </section>

    <section class="split">
      <div class="card mapcard">
        <div class="ch">
          <h3>Site Map</h3>
          <div class="seg">
            <button [class.on]="!buFilter()" (click)="buFilter.set(null)">All</button>
            @for (b of store.bus(); track b.id) {<button [class.on]="buFilter() === b.id" (click)="buFilter.set(b.id)">{{ b.flag }} {{ b.code.slice(3) }}</button>}
          </div>
        </div>
        <div class="map">
          <svg [attr.viewBox]="vb().join(' ')" preserveAspectRatio="xMidYMid meet">
            <rect x="-200" y="-200" width="1500" height="1400" fill="#e6f2fb" />
            @for (l of land; track l.name) {
              <polygon [attr.points]="l.d" [attr.fill]="l.fill" stroke="#c9cfdd" [attr.stroke-width]="1.2 * z()" />
              @if (l.lx !== null) {<text [attr.x]="l.lx" [attr.y]="l.ly" class="cl" [attr.font-size]="13 * z()">{{ l.name }}</text>}
            }
            @for (s of pins(); track s.id) {
              <g class="pin" [class.on]="sel() === s.id" (click)="sel.set(s.id)">
                <circle [attr.cx]="s.x" [attr.cy]="s.y" [attr.r]="(sel() === s.id ? 13 : 9) * z()" [attr.fill]="s.color" fill-opacity="0.18" />
                <circle [attr.cx]="s.x" [attr.cy]="s.y" [attr.r]="5 * z()" [attr.fill]="s.color" stroke="#fff" [attr.stroke-width]="1.6 * z()" />
                @if (sel() === s.id || buFilter()) {<text [attr.x]="s.x + 9 * z()" [attr.y]="s.y + 4 * z()" class="pl" [attr.font-size]="11 * z()">{{ s.name }}</text>}
                <title>{{ s.name }} · {{ s.city }}</title>
              </g>
            }
          </svg>
          <div class="legend">@for (t of types; track t) {<span><app-icon [name]="typeIcon[t]" [size]="12" />{{ t }} {{ typeCount(t) }}</span>}</div>
        </div>
      </div>

      @if (site(); as s) {
        <aside class="card det">
          <div class="dh">
            <span class="ri" [style.background]="buColor(s.buId) + '1f'" [style.color]="buColor(s.buId)"><app-icon [name]="typeIcon[s.type]" [size]="20" /></span>
            <div><h3>{{ s.name }}</h3><small class="muted">{{ s.type }} · {{ s.city }} · {{ store.bu(s.buId)?.name }}</small></div>
            <span [class]="s.status === 'Active' ? 'tag green' : s.status === 'Commissioning' ? 'tag amber' : 'tag grey'">{{ s.status }}</span>
          </div>
          <div class="occ">
            <div><small>Live occupancy</small><b>{{ fmt(occ(s)) }} <span class="muted">/ {{ fmt(s.capacity) }}</span></b></div>
            <div class="bar"><i [style.width.%]="(occ(s) / s.capacity) * 100"></i></div>
          </div>
          <div class="grid3 st">
            <div class="stat"><b>{{ fmt(store.usersBySite().get(s.id) ?? 0) }}</b><small>Assigned users</small></div>
            <div class="stat"><b>{{ deptsOf(s.id).length }}</b><small>Departments</small></div>
            <div class="stat"><b>{{ s.zones }}</b><small>Zones · {{ s.floors }} floors</small></div>
          </div>
          <dl class="kv">
            <dt>Address</dt><dd>{{ s.address }}</dd>
            <dt>Site manager</dt><dd>{{ s.manager }}</dd>
            <dt>Coordinates</dt><dd>{{ s.lat.toFixed(4) }}° N, {{ s.lon.toFixed(4) }}° E</dd>
            <dt>Edge devices</dt><dd>{{ s.devices }} ({{ s.devices - (s.id.length % 3) }} online)</dd>
            <dt>Operating hours</dt><dd>{{ s.type === 'Plant' || s.type === 'Data Center' ? '24 × 7' : 'Sun–Thu 07:00–19:00' }}</dd>
          </dl>
          <h4>Departments</h4>
          <ul class="mini">
            @for (d of deptsOf(s.id); track d.id) {<li><span class="ri sm"><app-icon name="users" [size]="15" /></span><div><b>{{ d.name }}</b><small>Head: {{ d.head }} · {{ d.teams.length }} teams</small></div><span class="muted">{{ store.usersByDept().get(d.id) ?? 0 }}</span></li>}
            @empty {<li class="muted">No departments yet</li>}
          </ul>
          <h4>Floors</h4>
          <div class="floors">@for (f of floorsOf(s); track f.n) {<button (click)="store.toast(s.name + ' · ' + f.label + ': ' + f.zones + ' zones, ' + f.people + ' people now')"><b>{{ f.label }}</b><small>{{ f.zones }} zones · {{ f.people }} now</small></button>}</div>
          <div class="toolbar acts">
            <button class="btn-primary" (click)="modal.set({ kind: 'site', id: s.id })"><app-icon name="admin-edit" [size]="15" />Edit</button>
            <button class="btn-ghost" (click)="modal.set({ kind: 'dept', parent: s.id })"><app-icon name="plus" [size]="15" />Department</button>
            <button class="btn-ghost" (click)="toggleStatus(s)">{{ s.status === 'Active' ? 'Deactivate' : 'Activate' }}</button>
            <button class="btn-ghost" (click)="go('/administration-configuration/departments-teams')">Teams</button>
          </div>
        </aside>
      }
    </section>

    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters()" [actions]="actions" [searchKeys]="['name', 'city', 'manager', 'bu']" searchPlaceholder="Search site, city, manager..." noun="sites" [activeId]="sel()"
        (rowClick)="pick($event.id)" (action)="act($event.action, $event.row)" />
    </div>

    @if (modal(); as m) {<app-admin-entity-modal [req]="m" (closed)="modal.set(null)" />}
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .mapcard { display: flex; flex-direction: column; }
    .map { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: #e6f2fb; }
    .map svg { display: block; width: 100%; height: 560px; }
    .cl { fill: #8a90a8; font-weight: 600; text-anchor: middle; letter-spacing: 0.5px; pointer-events: none; } .pl { fill: #1e1b3a; font-weight: 600; paint-order: stroke; stroke: #fff; stroke-width: 3px; pointer-events: none; }
    .pin { cursor: pointer; } .pin:hover circle:first-child { fill-opacity: 0.35; }
    .legend { position: absolute; left: 10px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; } .legend span { display: inline-flex; align-items: center; gap: 4px; background: #fff; border-radius: 6px; padding: 3px 8px; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .det { position: sticky; top: 76px; } .det h3 { font-size: 17px; }
    .occ { display: grid; gap: 6px; margin-bottom: 12px; } .occ > div:first-child { display: flex; justify-content: space-between; align-items: baseline; } .occ small { color: var(--muted); } .occ b { font-size: 17px; }
    .st { margin-bottom: 12px; } .ri.sm { width: 28px; height: 28px; background: #eff6ff; color: #2563eb; }
    .floors { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; } .floors button { display: flex; flex-direction: column; align-items: flex-start; padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; font-size: 12px; cursor: pointer; } .floors button:hover { border-color: #c4b5fd; } .floors small { color: var(--muted); font-size: 10.5px; }
    .acts { margin-top: 14px; }
  `],
})
export class SitesLocations {
  protected readonly store = inject(AdminStore);
  private readonly app = inject(AppState);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly types = Object.keys(TYPE_ICON) as Site['type'][];
  protected readonly buFilter = signal<string | null>(null);
  protected readonly sel = signal<string>('s-hq');
  protected readonly modal = signal<EntityReq | null>(null);
  protected readonly land = LAND.map((l) => {
    const [lx, ly] = l.label ? px(l.label) : [null, null];
    return { name: l.name, fill: l.fill, d: poly(l.pts), lx, ly };
  });

  protected readonly site = computed(() => this.store.site(this.sel()) ?? this.store.sites()[0]);
  protected readonly active = computed(() => this.store.sites().filter((s) => s.status === 'Active').length);
  protected readonly commissioning = computed(() => this.store.sites().filter((s) => s.status === 'Commissioning').length);
  protected readonly capacity = computed(() => this.store.sites().reduce((a, s) => a + s.capacity, 0));
  protected readonly zones = computed(() => this.store.sites().reduce((a, s) => a + s.zones, 0));
  protected readonly devices = computed(() => this.store.sites().reduce((a, s) => a + s.devices, 0));
  protected readonly onSiteTotal = computed(() => this.store.sites().reduce((a, s) => a + this.occ(s), 0));
  protected readonly occPct = computed(() => Math.round((this.onSiteTotal() / this.capacity()) * 100));
  protected occ(s: Site) {
    if (s.status !== 'Active') return 0;
    const base = Math.round((this.store.usersBySite().get(s.id) ?? 0) * 0.64);
    return Math.max(0, Math.min(s.capacity, base + this.app.wobble(s.id, Math.max(2, Math.round(base * 0.03)))));
  }
  protected readonly vb = computed(() => {
    const b = this.buFilter();
    if (!b) return [40, 0, 960, 980];
    const pts = this.store.sites().filter((s) => s.buId === b).map((s) => px([s.lon, s.lat]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 45;
    let w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    let h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const r = 1.6; // keep map aspect
    if (w / h < r) w = h * r; else h = w / r;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  });
  protected readonly z = computed(() => Math.max(0.22, this.vb()[2] / 960));
  protected readonly pins = computed(() =>
    this.store.sites().filter((s) => !this.buFilter() || s.buId === this.buFilter()).map((s) => {
      const [x, y] = px([s.lon, s.lat]);
      return { id: s.id, name: s.name, city: s.city, x, y, color: this.buColor(s.buId) };
    }),
  );
  protected buColor(id: string) {
    return this.store.bu(id)?.color ?? '#64748b';
  }
  protected typeCount(t: string) {
    return this.store.sites().filter((s) => s.type === t).length;
  }
  protected deptsOf(id: string) {
    return this.store.depts().filter((d) => d.siteId === id);
  }
  protected floorsOf(s: Site) {
    const occ = this.occ(s);
    return Array.from({ length: Math.min(s.floors, 12) }, (_, i) => ({ n: i, label: i === 0 ? 'Ground' : `Floor ${i}`, zones: Math.round(s.zones / s.floors), people: Math.round(occ / s.floors + ((i * 7) % 5) - 2) }));
  }
  protected pick(id: string) {
    this.sel.set(id);
    const s = this.store.site(id);
    if (s && this.buFilter() && this.buFilter() !== s.buId) this.buFilter.set(s.buId);
  }
  protected readonly rows = computed(() => this.store.sites().map((s) => ({ ...s, bu: this.store.bu(s.buId)?.name ?? '', users: this.store.usersBySite().get(s.id) ?? 0, now: this.occ(s), icon: TYPE_ICON[s.type], color: this.buColor(s.buId) })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Site', kind: 'icon' }, { key: 'type', label: 'Type' }, { key: 'city', label: 'City' }, { key: 'bu', label: 'Business Unit' }, { key: 'manager', label: 'Manager' },
    { key: 'users', label: 'Users', kind: 'num' }, { key: 'now', label: 'On Site Now', kind: 'num' }, { key: 'capacity', label: 'Capacity', kind: 'num' }, { key: 'zones', label: 'Zones', kind: 'num' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = computed(() => [
    { key: 'bu', label: 'Business Unit', options: this.store.bus().map((b) => b.name) },
    { key: 'type', label: 'Type', options: this.types },
    { key: 'status', label: 'Status', options: ['Active', 'Commissioning', 'Inactive'] },
  ]);
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'Show on map', icon: 'map-pin' }, { id: 'edit', label: 'Edit', icon: 'admin-edit' }, { id: 'dept', label: 'Add department', icon: 'plus' },
    { id: 'toggle', label: 'Deactivate', icon: 'ban', danger: true, when: (r) => r.status === 'Active' }, { id: 'toggle', label: 'Activate', icon: 'shield-check', when: (r) => r.status !== 'Active' },
    { id: 'delete', label: 'Delete', icon: 'admin-trash', danger: true },
  ];
  protected act(a: string, r: Site) {
    if (a === 'view') return this.pick(r.id);
    if (a === 'edit') return this.modal.set({ kind: 'site', id: r.id });
    if (a === 'dept') return this.modal.set({ kind: 'dept', parent: r.id });
    if (a === 'toggle') return this.toggleStatus(this.store.site(r.id)!);
    if (confirm(`Delete ${r.name} and its departments?`)) {
      this.store.removeNode('site', r.id);
      this.sel.set(this.store.sites()[0]?.id ?? '');
      this.store.toast(`${r.name} deleted`);
    }
  }
  protected toggleStatus(s: Site) {
    const status = s.status === 'Active' ? 'Inactive' : 'Active';
    this.store.saveSite({ ...s, status });
    this.store.toast(`${s.name} ${status === 'Active' ? 'activated' : 'deactivated'}`);
  }
  protected go(url: string) {
    this.router.navigateByUrl(url);
  }
  protected exportCsv() {
    downloadCsv('sites-locations.csv', [['Site', 'Type', 'City', 'Business Unit', 'Manager', 'Address', 'Floors', 'Capacity', 'Users', 'Status'], ...this.rows().map((s) => [s.name, s.type, s.city, s.bu, s.manager, s.address, s.floors, s.capacity, s.users, s.status])]);
  }
}
