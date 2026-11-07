import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapZone } from '../rtls/floor-plan';
import { IsoMarker, IsoPath, IsoView } from './iso-view';
import { ASSET_TYPES, FLOORS, floorById, fmtN, TEntity, TSensor, TwinStore, TYPE_COLOR, TZone, ZONE_COLOR, ZONE_GROUP, ZoneType } from './twin.data';

const FLOOR_TABS = FLOORS.map((f) => ({ id: f.id, name: f.id === 'G' ? 'Ground' : f.id === 'R' ? 'Roof' : `Floor ${f.id}` }));
const ZONE_TYPES: ZoneType[] = ['workstations', 'meeting', 'cafeteria', 'collab', 'pods', 'reception', 'lobby', 'server', 'security', 'storage', 'wellness', 'hvac', 'solar'];
const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/* =====================================================================
   Space & Zone Management
   ===================================================================== */
@Component({
  selector: 'app-twin-space-zone-management',
  imports: [...UI, FloorPlan, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Space & Zone Management" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Define zones, capacities and geofences on every floor and keep the digital twin in sync with how space is used.">
      <button class="btn-primary" (click)="startDraw()"><app-icon name="plus" [size]="16" />{{ draw() ? 'Drawing… drag on the map' : 'Draw New Zone' }}</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Zones" [value]="zones().length" icon="map-floor" color="#7c3aed" [sub]="floorsUsed() + ' floors · 3 buildings'" />
      <app-kpi label="Seat Capacity" [value]="fmt(capacity())" icon="users" color="#2563eb" change="4%" sub="vs. last quarter" />
      <app-kpi label="Occupied Now" [value]="fmt(occupied())" icon="user-check" color="#16a34a" [extra]="pct(occupied(), capacity()) + '%'" sub="live from RTLS + sensors" />
      <app-kpi label="Restricted Zones" [value]="restricted()" icon="shield" color="#ef4444" sub="geofenced · badge-only" subColor="#dc2626" />
      <app-kpi label="Under Maintenance" [value]="maint()" icon="twin-wrench" color="#f59e0b" sub="excluded from booking" />
    </section>

    <section class="sz">
      <div class="card">
        <div class="card-head">
          <div class="ftabs">@for (f of floorTabs; track f.id) {<button [class.on]="floor() === f.id" (click)="floor.set(f.id); selId.set(null)">{{ f.name }}</button>}</div>
          <div class="legend">@for (g of groups; track g[0]) {<span><i [style.background]="g[1]"></i>{{ g[0] }}</span>}</div>
        </div>
        <app-floor-plan [zones]="mapZones()" [selectedZone]="selId()" [drawMode]="draw()" [height]="440" [seed]="floor().charCodeAt(0)" (zoneClick)="selId.set($event)" (drawn)="drawn($event)" />
      </div>
      <aside class="card side">
        @if (sel(); as z) {
          <div class="zh"><span class="sw" [style.background]="color(z)"></span><div><h3>{{ z.name }}</h3><small class="muted">{{ z.id }} · {{ floorName(z.floor) }}</small></div><span [class]="z.status === 'Active' ? 'tag green' : z.status === 'Maintenance' ? 'tag amber' : 'tag grey'">{{ z.status }}</span></div>
          <dl class="facts">
            <dt>Type</dt><dd>{{ tl(z.type) }}</dd><dt>Group</dt><dd>{{ group(z) }}</dd><dt>Area</dt><dd>{{ area(z) }} m²</dd><dt>Owner</dt><dd>{{ z.owner }}</dd>
            <dt>Access</dt><dd>{{ z.restricted ? 'Restricted · badge + PIN' : 'Open to all staff' }}</dd>
          </dl>
          @if (z.capacity) {
            <div class="occ"><span>Occupancy</span><b>{{ z.occupancy }} / {{ z.capacity }} ({{ pct(z.occupancy, z.capacity) }}%)</b><i class="bar"><i [style.width.%]="pct(z.occupancy, z.capacity)" [style.background]="z.occupancy / z.capacity > 0.85 ? '#ef4444' : '#2563eb'"></i></i></div>
            <h4>Occupancy today</h4>
            <app-sparkline [values]="trend(z)" color="#7c3aed" />
          }
          <h4>Sensors in zone</h4>
          <ul class="mini">@for (s of sensorsIn(z); track s.id) {<li><app-icon name="twin-sensor" [size]="14" />{{ s.name }}<b>{{ sv(s) }} {{ s.unit }}</b></li>} @empty {<li class="muted">No sensors mapped</li>}</ul>
          <div class="acts">
            <button class="btn-primary" (click)="edit(z)"><app-icon name="twin-pencil" [size]="14" />Edit</button>
            <button class="btn-ghost" (click)="setStatus(z, z.status === 'Maintenance' ? 'Active' : 'Maintenance')">{{ z.status === 'Maintenance' ? 'Reopen' : 'Maintenance' }}</button>
            <button class="btn-ghost" (click)="view3d(z)"><app-icon name="twin-cube" [size]="14" />3D</button>
            <button class="btn-ghost danger" (click)="remove(z)"><app-icon name="twin-trash" [size]="14" /></button>
          </div>
        } @else {
          <h3>{{ floorName(floor()) }}</h3>
          <p class="muted">Select a zone on the map or in the table. Use <b>Draw New Zone</b> and drag a rectangle to create one.</p>
          <app-donut [segments]="groupSegs()" center="Zones" [size]="130" />
          <h4>Utilization by zone</h4>
          <app-bar-list [rows]="utilRows()" />
        }
      </aside>
    </section>

    <section class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'id', 'owner', 'typeL']" searchPlaceholder="Search zones…" noun="zones" [activeId]="selId()"
        (rowClick)="pickRow($event)" (action)="act($event.action, $event.row)" />
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ isNew() ? 'New Zone' : 'Edit ' + f.name }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Zone name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Type<select class="select" [value]="f.type" (change)="setF('type', $any($event.target).value)">@for (t of zoneTypes; track t) {<option [value]="t">{{ tl(t) }}</option>}</select></label>
          <label>Floor<select class="select" [value]="f.floor" (change)="setF('floor', $any($event.target).value)">@for (t of floorTabs; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Capacity<input class="input" type="number" min="0" [value]="f.capacity" (input)="setF('capacity', +$any($event.target).value)" /></label>
          <label>Owner<input class="input" [value]="f.owner" (input)="setF('owner', $any($event.target).value)" /></label>
          <label>Status<select class="select" [value]="f.status" (change)="setF('status', $any($event.target).value)"><option>Active</option><option>Maintenance</option><option>Closed</option></select></label>
          <label class="chk"><input type="checkbox" [checked]="!!f.restricted" (change)="setF('restricted', $any($event.target).checked)" />Restricted (geofence + alert on entry)</label>
          <p class="full muted">Footprint: {{ f.w }} × {{ f.h }} units ({{ area(f) }} m²) at {{ f.x }}, {{ f.y }}</p>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save zone</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sz { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftabs button { border: 1px solid var(--border); background: #fff; border-radius: 7px; padding: 6px 11px; font-size: 12px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .legend { display: flex; gap: 12px; font-size: 12px; color: #4b4f6b; } .legend span { display: inline-flex; gap: 5px; align-items: center; } .legend i { width: 10px; height: 10px; border-radius: 3px; }
    .side { display: flex; flex-direction: column; gap: 10px; } .zh { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; } .zh .sw { width: 14px; height: 40px; border-radius: 4px; } .zh h3 { font-size: 16px; }
    .facts { display: grid; grid-template-columns: 80px 1fr; gap: 6px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .occ { display: grid; grid-template-columns: 1fr auto; gap: 4px; font-size: 12.5px; } .occ .bar { grid-column: 1 / -1; }
    .bar { display: block; height: 8px; border-radius: 6px; background: #e8eaf2; overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 6px; }
    h4 { margin: 4px 0 0; font-size: 13px; }
    .mini { list-style: none; margin: 0; padding: 0; } .mini li { display: flex; gap: 8px; align-items: center; padding: 5px 0; font-size: 12.5px; border-bottom: 1px solid #f2f3f7; color: #0ea5e9; } .mini li b { margin-left: auto; color: var(--text); font-weight: 600; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; } .danger { color: var(--red); }
    .chk { flex-direction: row !important; align-items: center; gap: 8px !important; }
    @media (max-width: 1200px) { .sz { grid-template-columns: 1fr; } }
  `,
})
export class SpaceZoneManagement {
  private readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtN;
  protected readonly floorTabs = FLOOR_TABS;
  protected readonly zoneTypes = ZONE_TYPES;
  protected readonly tl = typeLabel;
  protected readonly groups = Object.entries(ZONE_COLOR);
  protected readonly floor = signal(this.store.floor());
  protected readonly selId = signal<string | null>(null);
  protected readonly draw = signal(false);
  protected readonly form = signal<TZone | null>(null);
  protected readonly isNew = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly zones = this.store.zones;
  protected readonly capacity = computed(() => this.zones().reduce((a, z) => a + z.capacity, 0));
  protected readonly occupied = computed(() => this.zones().reduce((a, z) => a + z.occupancy, 0));
  protected readonly restricted = computed(() => this.zones().filter((z) => z.restricted).length);
  protected readonly maint = computed(() => this.zones().filter((z) => z.status === 'Maintenance').length);
  protected readonly floorsUsed = computed(() => new Set(this.zones().map((z) => z.floor)).size);
  protected readonly sel = computed(() => this.zones().find((z) => z.id === this.selId()) ?? null);
  protected readonly floorZones = computed(() => this.zones().filter((z) => z.floor === this.floor()));
  protected readonly mapZones = computed<MapZone[]>(() =>
    this.floorZones().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: this.color(z), kind: z.restricted ? 'restricted' : 'open', fill: z.status === 'Maintenance' ? 0.08 : 0.18, dashed: z.status !== 'Active' })),
  );
  protected readonly groupSegs = computed(() => this.groups.map(([g, c]) => ({ label: g, color: c, value: this.floorZones().filter((z) => ZONE_GROUP[z.type] === g).length })).filter((s) => s.value));
  protected readonly utilRows = computed(() => this.floorZones().filter((z) => z.capacity).map((z) => ({ label: z.name, value: this.pct(z.occupancy, z.capacity), display: `${this.pct(z.occupancy, z.capacity)}%`, color: this.color(z) })).sort((a, b) => b.value - a.value).slice(0, 7));
  protected readonly rows = computed(() => this.zones().map((z) => ({ ...z, typeL: typeLabel(z.type), group: ZONE_GROUP[z.type], floorL: floorById(z.floor).name, util: z.capacity ? this.pct(z.occupancy, z.capacity) : 0, access: z.restricted ? 'Restricted' : 'Open' })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Zone' },
    { key: 'id', label: 'ID' },
    { key: 'floorL', label: 'Floor' },
    { key: 'typeL', label: 'Type' },
    { key: 'group', label: 'Group' },
    { key: 'capacity', label: 'Capacity', kind: 'num' },
    { key: 'occupancy', label: 'Occupied', kind: 'num' },
    { key: 'util', label: 'Utilization', kind: 'progress' },
    { key: 'access', label: 'Access', kind: 'tag', tag: (r) => (r.restricted ? 'tag red' : 'tag grey') },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'floorL', label: 'Floor', options: FLOORS.map((f) => f.name) },
    { key: 'group', label: 'Group', options: ['Workspaces', 'Common Areas', 'Restricted', 'Service'] },
    { key: 'status', label: 'Status', options: ['Active', 'Maintenance', 'Closed'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'edit', label: 'Edit zone', icon: 'twin-pencil' },
    { id: 'view', label: 'View in 3D', icon: 'twin-cube' },
    { id: 'maint', label: 'Set maintenance', icon: 'twin-wrench', when: (r) => r.status === 'Active' },
    { id: 'open', label: 'Reopen', icon: 'twin-check', when: (r) => r.status !== 'Active' },
    { id: 'delete', label: 'Delete', icon: 'twin-trash', danger: true },
  ];

  protected pct(a: number, b: number) {
    return b ? Math.round((a / b) * 100) : 0;
  }
  protected color(z: TZone) {
    return ZONE_COLOR[ZONE_GROUP[z.type]];
  }
  protected group(z: TZone) {
    return ZONE_GROUP[z.type];
  }
  protected area(z: { w: number; h: number }) {
    return Math.round(z.w * z.h * 0.0064);
  }
  protected floorName(f: string) {
    return floorById(f).name;
  }
  protected sensorsIn(z: TZone) {
    return this.store.sensors().filter((s) => s.floor === z.floor && s.zone === z.name);
  }
  protected sv(s: TSensor) {
    return this.store.sensorValue(s);
  }
  protected trend(z: TZone) {
    const u = z.occupancy / (z.capacity || 1);
    return [0.05, 0.3, 0.75, 0.95, 0.9, 1, 0.92, 0.6, 0.2].map((f, i) => Math.round(z.capacity * u * f * (1 + ((i * 7 + z.x) % 5) / 30)));
  }
  protected pickRow(r: TZone) {
    this.floor.set(r.floor);
    this.selId.set(r.id);
  }
  protected startDraw() {
    this.draw.set(!this.draw());
    if (this.draw()) this.toastMsg('Drag a rectangle on the floor map to draw the new zone');
  }
  protected drawn(r: { x: number; y: number; w: number; h: number }) {
    this.draw.set(false);
    this.isNew.set(true);
    const n = this.zones().filter((z) => z.floor === this.floor()).length + 1;
    this.form.set({ id: `Z${this.floor()}-${n + 20}`, floor: this.floor(), name: '', type: 'workstations', ...r, capacity: Math.max(2, Math.round((r.w * r.h) / 1400)), occupancy: 0, owner: 'Workplace Team', status: 'Active' });
  }
  protected edit(z: TZone) {
    this.isNew.set(false);
    this.form.set({ ...z });
  }
  protected setF<K extends keyof TZone>(k: K, v: TZone[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim()) return;
    this.store.upsertZone({ ...f, occupancy: Math.min(f.occupancy, f.capacity) });
    this.store.log({ icon: 'map-floor', color: '#7c3aed', who: f.name, what: this.isNew() ? `Zone created on ${floorById(f.floor).name}` : 'Zone updated', ref: f.id, floor: f.floor });
    this.floor.set(f.floor);
    this.selId.set(f.id);
    this.form.set(null);
    this.toastMsg(`${f.name} saved · digital twin updated`);
  }
  protected setStatus(z: TZone, status: TZone['status']) {
    this.store.upsertZone({ ...z, status });
    this.toastMsg(`${z.name} set to ${status}`);
  }
  protected remove(z: TZone) {
    this.store.removeZone(z.id);
    this.selId.set(null);
    this.toastMsg(`${z.name} deleted`);
  }
  protected view3d(z: TZone) {
    this.store.floor.set(z.floor);
    this.router.navigateByUrl('/digital-twin/2d-3d-facility-viewer');
  }
  protected act(a: string, z: TZone) {
    if (a === 'edit') return this.edit(z);
    if (a === 'view') return this.view3d(z);
    if (a === 'delete') return this.remove(z);
    this.setStatus(this.zones().find((x) => x.id === z.id)!, a === 'maint' ? 'Maintenance' : 'Active');
  }
  protected exportCsv() {
    downloadCsv('zones.csv', [['ID', 'Zone', 'Floor', 'Type', 'Group', 'Capacity', 'Occupied', 'Restricted', 'Status', 'Owner'], ...this.zones().map((z) => [z.id, z.name, floorById(z.floor).name, z.type, ZONE_GROUP[z.type], z.capacity, z.occupancy, z.restricted ? 'Yes' : 'No', z.status, z.owner])]);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* =====================================================================
   Asset Visualization
   ===================================================================== */
@Component({
  selector: 'app-twin-asset-visualization',
  imports: [...UI, IsoView, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Asset Visualization" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="See where every tracked asset is in the building, its status, battery and utilization.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Assets Tracked" [value]="fmt(assets().length)" icon="twin-dolly" color="#7c3aed" change="8%" sub="vs. last month" />
      <app-kpi label="In Use" [value]="fmt(byStatus('In Use'))" icon="activity" color="#2563eb" [extra]="pct(byStatus('In Use')) + '%'" />
      <app-kpi label="Available" [value]="fmt(byStatus('Available'))" icon="twin-check" color="#16a34a" />
      <app-kpi label="Maintenance" [value]="byStatus('Maintenance')" icon="twin-wrench" color="#f59e0b" sub="open work orders" />
      <app-kpi label="Low Battery" [value]="lowBat()" icon="battery" color="#ef4444" sub="below 25%" subColor="#dc2626" />
    </section>

    <section class="av">
      <div class="card">
        <div class="card-head">
          <div class="ftabs">@for (f of floorTabs; track f.id) {<button [class.on]="floor() === f.id" (click)="floor.set(f.id)">{{ f.name }} <small>{{ countOn(f.id) }}</small></button>}</div>
          <div class="types">@for (t of types; track t.type) {<button [class.on]="shown().has(t.type)" [style.--c]="t.color" (click)="toggleType(t.type)" [title]="t.type"><app-icon [name]="t.icon" [size]="14" /></button>}</div>
        </div>
        <app-iso-view #iso [zones]="zones()" [floor]="floor()" [markers]="markers()" [selectedId]="selId()" [shirts]="[]" aspect="1000 / 520" (markerClick)="selId.set($event)" (zoneClick)="toastMsg(zoneName($event) + ': ' + inZone($event) + ' assets')" />
      </div>
      <aside class="card side">
        @if (sel(); as a) {
          <div class="ah"><span class="ic" [style.background]="typeOf(a).color"><app-icon [name]="typeOf(a).icon" [size]="22" /></span><div><h3>{{ a.name }}</h3><small class="muted">{{ a.type }} · {{ a.id }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <dl class="facts">
            <dt>Status</dt><dd><span [class]="statusTag(a.status)">{{ a.status }}</span></dd>
            <dt>Location</dt><dd>{{ floorName(a.floor) }} · {{ a.zone }}</dd>
            <dt>Department</dt><dd>{{ a.dept }}</dd>
            @if (a.battery !== undefined) {<dt>Battery</dt><dd><i class="bat"><i [style.width.%]="a.battery" [style.background]="a.battery < 25 ? '#ef4444' : '#22c55e'"></i></i> {{ a.battery }}%</dd>}
            <dt>Tag</dt><dd>BLE {{ a.id.replace('A-', 'TG') }} · last ping 4 s ago</dd>
            <dt>Next service</dt><dd>{{ a.status === 'Maintenance' ? 'In progress' : '12 Dec 2026' }}</dd>
          </dl>
          <h4>Utilization – last 7 days</h4>
          <app-column-chart [labels]="days" [series]="[{ name: 'Hours in use', color: typeOf(a).color, values: usage(a) }]" [height]="150" [legend]="false" suffix=" h" />
          <div class="acts">
            <button class="btn-primary" (click)="locate(a)"><app-icon name="locate" [size]="14" />Locate</button>
            @if (a.status !== 'Maintenance') {<button class="btn-ghost" (click)="setStatus(a, 'Maintenance')"><app-icon name="twin-wrench" [size]="14" />Maintenance</button>} @else {<button class="btn-ghost" (click)="setStatus(a, 'Available')"><app-icon name="twin-check" [size]="14" />Mark available</button>}
            <button class="btn-ghost" (click)="track(a)"><app-icon name="map-pin" [size]="14" />Track</button>
          </div>
        } @else {
          <h3>Assets by Type</h3>
          <app-donut [segments]="typeSegs()" center="Assets" [size]="140" />
          <h4>Status</h4>
          <app-bar-list [rows]="statusRows()" [max]="assets().length" />
        }
      </aside>
    </section>
    <section class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'id', 'type', 'zone']" searchPlaceholder="Search asset, tag, zone…" noun="assets" [activeId]="selId()"
        (rowClick)="pick($event)" (action)="act($event.action, $event.row)" />
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .av { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftabs button { border: 1px solid var(--border); background: #fff; border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; } .ftabs small { color: var(--muted); } .ftabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); } .ftabs button.on small { color: #e9ddff; }
    .types { display: flex; gap: 4px; } .types button { width: 30px; height: 30px; border-radius: 7px; border: 1px solid var(--border); background: #fff; color: #94a3b8; display: grid; place-items: center; cursor: pointer; } .types button.on { background: var(--c); color: #fff; border-color: var(--c); }
    .side { display: flex; flex-direction: column; gap: 10px; } .ah { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; } .ic { width: 44px; height: 44px; border-radius: 10px; color: #fff; display: grid; place-items: center; }
    .facts { display: grid; grid-template-columns: 90px 1fr; gap: 7px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; display: flex; align-items: center; gap: 6px; }
    .bat { display: inline-block; width: 60px; height: 8px; background: #eef0f5; border-radius: 4px; overflow: hidden; } .bat i { display: block; height: 100%; }
    h4 { margin: 4px 0 0; font-size: 13px; } .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    @media (max-width: 1200px) { .av { grid-template-columns: 1fr; } }
  `,
})
export class AssetVisualization {
  private readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  private readonly iso = viewChild<IsoView>('iso');
  protected readonly fmt = fmtN;
  protected readonly floorTabs = FLOOR_TABS;
  protected readonly types = ASSET_TYPES;
  protected readonly days = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
  protected readonly floor = signal(this.store.floor());
  protected readonly selId = signal<string | null>(null);
  protected readonly shown = signal(new Set(['Forklift', 'Cart / Trolley', 'AV Equipment', 'Safety Kit / AED', 'Printer', 'Server Rack', 'HVAC Unit']));
  protected readonly toast = signal<string | null>(null);
  protected readonly assets = this.store.assets;
  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  protected readonly sel = computed(() => this.assets().find((a) => a.id === this.selId()) ?? null);
  protected readonly lowBat = computed(() => this.assets().filter((a) => a.battery !== undefined && a.battery < 25).length);
  protected readonly markers = computed<IsoMarker[]>(() =>
    this.assets()
      .filter((a) => a.floor === this.floor() && this.shown().has(a.type))
      .map((a) => {
        const [x, y] = this.store.pos(a);
        const t = this.typeOf(a);
        return { id: a.id, x, y, color: a.status === 'Maintenance' || a.status === 'Low Battery' ? '#ef4444' : t.color, icon: t.icon, kind: a.mobile || a.id === this.selId() ? 'pin' : 'chip', title: `${a.name} · ${a.status}` } as IsoMarker;
      }),
  );
  protected readonly typeSegs = computed(() => ASSET_TYPES.map((t) => ({ label: t.type, value: this.assets().filter((a) => a.type === t.type).length, color: t.color })));
  protected readonly statusRows = computed(() => ['In Use', 'Available', 'Idle', 'Maintenance', 'Moving', 'Low Battery'].map((s) => ({ label: s, value: this.byStatus(s), display: fmtN(this.byStatus(s)), color: s === 'Maintenance' || s === 'Low Battery' ? '#ef4444' : s === 'Idle' ? '#f59e0b' : s === 'Available' ? '#16a34a' : '#7c3aed' })));
  protected readonly rows = computed(() => this.assets().map((a) => ({ ...a, floorL: floorById(a.floor).name, bat: a.battery === undefined ? '—' : `${a.battery}%` })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Asset' },
    { key: 'type', label: 'Type' },
    { key: 'floorL', label: 'Floor' },
    { key: 'zone', label: 'Zone' },
    { key: 'dept', label: 'Department' },
    { key: 'bat', label: 'Battery', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'type', label: 'Type', options: ASSET_TYPES.map((t) => t.type) },
    { key: 'floorL', label: 'Floor', options: FLOORS.map((f) => f.name) },
    { key: 'status', label: 'Status', options: ['In Use', 'Available', 'Idle', 'Maintenance', 'Moving', 'Low Battery'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'locate', label: 'Locate on map', icon: 'locate' },
    { id: 'maint', label: 'Send to maintenance', icon: 'twin-wrench', when: (r) => r.status !== 'Maintenance' },
    { id: 'avail', label: 'Mark available', icon: 'twin-check', when: (r) => r.status === 'Maintenance' },
  ];

  constructor() {
    const id = this.store.focusId();
    if (id) {
      const a = this.store.find(id);
      if (a?.kind === 'asset') setTimeout(() => this.locate(a));
      this.store.focusId.set(null);
    }
  }
  protected typeOf(a: TEntity) {
    return ASSET_TYPES.find((t) => t.type === a.type) ?? ASSET_TYPES[0];
  }
  protected byStatus(s: string) {
    return this.assets().filter((a) => a.status === s).length;
  }
  protected pct(n: number) {
    return Math.round((n / this.assets().length) * 100);
  }
  protected countOn(f: string) {
    return this.assets().filter((a) => a.floor === f).length;
  }
  protected floorName(f: string) {
    return floorById(f).name;
  }
  protected zoneName(id: string) {
    return this.zones().find((z) => z.id === id)?.name ?? '';
  }
  protected inZone(id: string) {
    const z = this.zones().find((x) => x.id === id);
    return this.assets().filter((a) => a.floor === this.floor() && a.zone === z?.name).length;
  }
  protected statusTag(s: string) {
    return /maint|low/i.test(s) ? 'tag red' : /idle|moving/i.test(s) ? 'tag amber' : 'tag green';
  }
  protected usage(a: TEntity) {
    const h = a.id.charCodeAt(4) + a.id.charCodeAt(5);
    return this.days.map((_, i) => (i === 2 || i === 3 ? 1 + ((h + i) % 3) : 4 + ((h * (i + 3)) % 6)));
  }
  protected toggleType(t: string) {
    this.shown.update((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  }
  protected pick(a: TEntity) {
    this.selId.set(a.id);
    this.floor.set(a.floor);
  }
  protected locate(a: TEntity) {
    this.floor.set(a.floor);
    this.selId.set(a.id);
    if (!this.shown().has(a.type)) this.toggleType(a.type);
    const [x, y] = this.store.pos(a);
    setTimeout(() => this.iso()?.focus(x, y, 1.7));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected setStatus(a: TEntity, status: string) {
    this.store.patchAsset(a.id, { status });
    this.store.log({ icon: 'twin-wrench', color: '#f59e0b', who: a.name, what: status === 'Maintenance' ? 'Sent to maintenance' : 'Back in service', ref: a.id, floor: a.floor });
    this.toastMsg(`${a.name} → ${status}`);
  }
  protected track(a: TEntity) {
    this.store.focusId.set(a.id);
    this.router.navigateByUrl('/digital-twin/people-asset-location');
  }
  protected act(x: string, a: TEntity) {
    if (x === 'locate') return this.locate(a);
    this.setStatus(a, x === 'maint' ? 'Maintenance' : 'Available');
  }
  protected exportCsv() {
    downloadCsv('assets.csv', [['ID', 'Asset', 'Type', 'Floor', 'Zone', 'Status', 'Battery'], ...this.assets().map((a) => [a.id, a.name, a.type, floorById(a.floor).name, a.zone, a.status, a.battery ?? ''])]);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* =====================================================================
   People & Asset Location
   ===================================================================== */
type Who = 'All' | 'Employees' | 'Visitors' | 'Contractors' | 'Assets';
@Component({
  selector: 'app-twin-people-asset-location',
  imports: [...UI, IsoView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="People & Asset Location" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Find anyone or anything in the building in real time and follow their movement on the digital twin.">
      <button class="btn-ghost" [class.on]="follow()" (click)="follow.set(!follow())"><app-icon name="twin-target" [size]="16" />{{ follow() ? 'Following' : 'Follow selected' }}</button>
      <button class="btn-primary" (click)="share()"><app-icon name="twin-mail" [size]="16" />Share location</button>
    </app-page-head>
    <section class="pl">
      <aside class="card list">
        <div class="search"><app-icon name="search" [size]="15" /><input placeholder="Search name, ID, asset tag…" [value]="q()" (input)="q.set($any($event.target).value)" /></div>
        <div class="who">@for (w of whos; track w) {<button [class.on]="who() === w" (click)="who.set(w)">{{ w }}</button>}</div>
        <small class="muted">{{ results().length }} found{{ results().length > 60 ? ' · showing 60' : '' }}</small>
        <ul>
          @for (e of results().slice(0, 60); track e.id) {
            <li [class.on]="e.id === selId()" (click)="select(e)">
              <span class="av" [style.background]="col(e)">@if (e.kind === 'asset') {<app-icon name="twin-dolly" [size]="14" />} @else {{{ e.initials }}}</span>
              <div><b>{{ e.name }}</b><small>{{ floorName(e.floor) }} · {{ e.zone }}</small></div>
              <i class="st" [class.mv]="e.mobile"></i>
            </li>
          }
        </ul>
      </aside>
      <div class="card mapc">
        <div class="card-head">
          <h3>{{ floorName(floor()) }} <span class="card-sub">{{ onFloor().length }} tracked · live</span></h3>
          <div class="ftabs">@for (f of floors; track f.id) {<button [class.on]="floor() === f.id" (click)="floor.set(f.id)">{{ f.id === 'G' ? 'G' : f.id === 'R' ? 'R' : 'F' + f.id }}</button>}</div>
        </div>
        <app-iso-view #iso [zones]="zones()" [floor]="floor()" [markers]="markers()" [paths]="trail()" [selectedId]="selId()" [shirts]="[]" [callouts]="callout()" aspect="1000 / 600" (markerClick)="selectId($event)" (calloutClick)="toastMsg('Opening profile…')" />
      </div>
      <aside class="card det">
        @if (sel(); as e) {
          <div class="dh"><span class="big" [style.background]="col(e)">@if (e.kind === 'asset') {<app-icon name="twin-dolly" [size]="22" />} @else {{{ e.initials }}}</span><div><h3>{{ e.name }}</h3><small class="muted">{{ e.sub }}</small></div></div>
          <dl class="facts"><dt>ID</dt><dd>{{ e.id }}</dd><dt>Floor</dt><dd>{{ floorName(e.floor) }}</dd><dt>Zone</dt><dd>{{ e.zone }}</dd><dt>Status</dt><dd><span class="tag green">{{ e.status }}</span></dd><dt>Accuracy</dt><dd>± 0.4 m (UWB)</dd></dl>
          <h4>Today's movement</h4>
          <ol class="tl">@for (s of timeline(e); track $index) {<li [class.now]="$first"><b>{{ s.t }}</b><span>{{ s.z }}</span></li>}</ol>
          <div class="acts">
            <button class="btn-primary" (click)="toastMsg('Notification sent to ' + e.name)">Notify</button>
            <button class="btn-ghost" (click)="router.navigateByUrl('/digital-twin/path-movement-analysis')"><app-icon name="twin-route" [size]="14" />Full path</button>
          </div>
        } @else {
          <h3>Occupancy by Floor</h3>
          <app-bar-list [rows]="floorRows()" [max]="100" />
          <p class="muted">Select a person or asset to see live location and today's movement.</p>
        }
      </aside>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .pl { display: grid; grid-template-columns: 280px minmax(0, 1fr) 280px; gap: 12px; align-items: start; }
    .list { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 190px); }
    .search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; } .search input { border: 0; outline: 0; padding: 9px 0; flex: 1; font: inherit; font-size: 13px; min-width: 0; }
    .who { display: flex; flex-wrap: wrap; gap: 4px; } .who button { border: 1px solid var(--border); background: #fff; border-radius: 14px; padding: 4px 9px; font-size: 11.5px; cursor: pointer; } .who button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    ul { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; } li { display: grid; grid-template-columns: 30px 1fr 8px; gap: 8px; align-items: center; padding: 7px 6px; border-radius: 8px; cursor: pointer; font-size: 12.5px; }
    li:hover { background: #faf8ff; } li.on { background: #f1ecff; } li div { display: flex; flex-direction: column; min-width: 0; } li small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .av { width: 30px; height: 30px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 600; } .st { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; } .st.mv { background: #f59e0b; }
    .ftabs { display: flex; gap: 3px; } .ftabs button { border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 5px 8px; font-size: 11.5px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .det { display: flex; flex-direction: column; gap: 10px; } .dh { display: flex; gap: 10px; align-items: center; } .big { width: 46px; height: 46px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 600; }
    .facts { display: grid; grid-template-columns: 70px 1fr; gap: 6px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    h4 { margin: 4px 0 0; font-size: 13px; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid #e5e7eb; } .tl li { display: flex; gap: 10px; padding: 5px 0; position: relative; cursor: default; font-size: 12px; } .tl li::before { content: ''; position: absolute; left: -20px; top: 9px; width: 10px; height: 10px; border-radius: 50%; background: #c4b5fd; }
    .tl li.now::before { background: #7c3aed; box-shadow: 0 0 0 3px #ede9fe; } .tl b { width: 62px; font-weight: 600; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; } .btn-ghost.on { color: var(--primary); border-color: var(--primary); }
    @media (max-width: 1350px) { .pl { grid-template-columns: 260px minmax(0, 1fr); } .det { grid-column: 1 / -1; } }
  `,
})
export class PeopleAssetLocation {
  private readonly store = inject(TwinStore);
  protected readonly router = inject(Router);
  private readonly iso = viewChild<IsoView>('iso');
  protected readonly whos: Who[] = ['All', 'Employees', 'Visitors', 'Contractors', 'Assets'];
  protected readonly floors = FLOORS;
  protected readonly q = signal('');
  protected readonly who = signal<Who>('All');
  protected readonly floor = signal(this.store.floor());
  protected readonly selId = signal<string | null>(null);
  protected readonly follow = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  private readonly everyone = computed(() => [...this.store.people(), ...this.store.assets().filter((a) => a.mobile || a.type === 'AV Equipment')]);
  protected readonly results = computed(() => {
    const q = this.q().toLowerCase().trim();
    const w = this.who();
    const kind = w === 'Employees' ? 'employee' : w === 'Visitors' ? 'visitor' : w === 'Contractors' ? 'contractor' : w === 'Assets' ? 'asset' : null;
    return this.everyone().filter((e) => (!kind || e.kind === kind) && (!q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.zone.toLowerCase().includes(q)));
  });
  protected readonly onFloor = computed(() => this.results().filter((e) => e.floor === this.floor()));
  protected readonly sel = computed(() => this.everyone().find((e) => e.id === this.selId()) ?? null);
  protected readonly markers = computed<IsoMarker[]>(() =>
    this.onFloor().map((e) => {
      const [x, y] = this.store.pos(e);
      const on = e.id === this.selId();
      return { id: e.id, x, y, color: this.col(e), icon: e.kind === 'asset' ? 'twin-dolly' : 'user', kind: on || e.pin ? 'pin' : 'chip', title: e.name, dim: !!this.selId() && !on } as IsoMarker;
    }),
  );
  protected readonly callout = computed(() => {
    const e = this.sel();
    if (!e || e.floor !== this.floor()) return [];
    const [x, y] = this.store.pos(e);
    return [{ id: e.id, x, y, title: e.name, lines: [e.sub, `${e.zone} · live`], icon: e.kind === 'asset' ? 'twin-dolly' : 'user', color: this.col(e) }];
  });
  protected readonly trail = computed<IsoPath[]>(() => {
    const e = this.sel();
    if (!e || e.floor !== this.floor()) return [];
    const [x, y] = this.store.pos(e);
    return [{ points: [[176, 470], [300, 395], [Math.round((x + 300) / 2), Math.round((y + 395) / 2)], [x, y]], color: this.col(e), dots: true }];
  });
  protected readonly floorRows = computed(() => FLOORS.filter((f) => f.id !== 'R').map((f) => ({ label: f.name, value: f.util, display: `${this.store.people().filter((p) => p.floor === f.id).length} ppl`, color: '#7c3aed' })));

  constructor() {
    const id = this.store.focusId();
    if (id) {
      const e = this.store.find(id);
      if (e) setTimeout(() => this.select(e));
      this.store.focusId.set(null);
    }
    effect(() => {
      this.store.tick();
      untracked(() => {
        const e = this.sel();
        if (this.follow() && e && e.floor === this.floor()) {
          const [x, y] = this.store.pos(e);
          this.iso()?.focus(x, y, 1.6);
        }
      });
    });
  }
  protected col(e: TEntity) {
    return e.kind === 'asset' ? '#7c3aed' : TYPE_COLOR[e.kind];
  }
  protected floorName(f: string) {
    return floorById(f).name;
  }
  protected selectId(id: string) {
    const e = this.everyone().find((x) => x.id === id);
    if (e) this.select(e);
  }
  protected select(e: TEntity) {
    this.selId.set(e.id);
    this.floor.set(e.floor);
    const [x, y] = this.store.pos(e);
    setTimeout(() => this.iso()?.focus(x, y, 1.5));
  }
  protected timeline(e: TEntity) {
    const zs = this.store.floorZones(e.floor).filter((z) => z.type !== 'core').map((z) => z.name);
    const h = e.id.charCodeAt(e.id.length - 1);
    return [
      { t: 'Now', z: e.zone },
      { t: '10:05 AM', z: zs[(h + 2) % zs.length] },
      { t: '09:40 AM', z: zs[(h + 5) % zs.length] },
      { t: '09:12 AM', z: 'Lift Lobby · ' + floorById(e.floor).short },
      { t: '08:58 AM', z: 'Main Entrance (Ground)' },
    ];
  }
  protected share() {
    const e = this.sel();
    if (!e) return this.toastMsg('Select a person or asset first');
    navigator.clipboard?.writeText(`${location.origin}/digital-twin/people-asset-location?id=${e.id}`).catch(() => {});
    this.toastMsg(`Live location link for ${e.name} copied (expires in 30 min)`);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* =====================================================================
   Sensor & IoT Visualization
   ===================================================================== */
type Metric = TSensor['metric'];
const METRIC_LIST: Metric[] = ['Temperature', 'Humidity', 'CO₂', 'Occupancy', 'Air Quality', 'Smoke', 'Energy'];
@Component({
  selector: 'app-twin-sensor-iot-visualization',
  imports: [...UI, IsoView, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Sensor & IoT Visualization" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Live environmental, occupancy and energy readings from IoT sensors mapped onto the digital twin.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export readings</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Sensors Online" [value]="online() + ' / ' + sensors().length" icon="twin-sensor" color="#0ea5e9" [sub]="(sensors().length - online()) + ' offline'" [subColor]="sensors().length - online() ? '#dc2626' : undefined" />
      <app-kpi label="Avg Temperature" [value]="avg('Temperature') + '°C'" icon="twin-thermo" color="#ef4444" sub="setpoint 23°C" />
      <app-kpi label="Avg Humidity" [value]="avg('Humidity') + '%'" icon="twin-snow" color="#2563eb" sub="comfort 30–60%" />
      <app-kpi label="Avg CO₂" [value]="avg('CO₂') + ' ppm'" icon="twin-fan" color="#16a34a" sub="good below 1000" />
      <app-kpi label="Sensor Alarms" [value]="alarms().length" icon="triangle-alert" color="#f97316" sub="threshold breaches" subColor="#dc2626" />
    </section>
    <section class="si">
      <div class="card">
        <div class="card-head">
          <div class="mt">@for (m of metrics; track m) {<button [class.on]="metric() === m" (click)="metric.set(m)">{{ m }}</button>}</div>
          <div class="ftabs">@for (f of floors; track f.id) {<button [class.on]="floor() === f.id" (click)="floor.set(f.id)">{{ f.id === 'G' ? 'G' : f.id === 'R' ? 'R' : 'F' + f.id }}</button>}</div>
        </div>
        <app-iso-view [zones]="zones()" [floor]="floor()" [markers]="markers()" [heat]="heat()" [selectedId]="selId()" [shirts]="[]" [zoneLabels]="false" aspect="1000 / 520" (markerClick)="selId.set($event)" />
        <div class="scale"><span>{{ range()[0] }}</span><i></i><span>{{ range()[1] }}</span><em>{{ metric() }} · showing {{ markers().length }} sensors on this floor (others shown on all metrics view)</em></div>
      </div>
      <aside class="card side">
        @if (sel(); as s) {
          <div class="sh"><span class="ic" [style.background]="stColor(s)"><app-icon name="twin-sensor" [size]="20" /></span><div><h3>{{ s.name }}</h3><small class="muted">{{ s.metric }} · {{ floorName(s.floor) }} · {{ s.zone }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="read"><b [style.color]="stColor(s)">{{ sv(s) }}</b><span>{{ s.unit }}</span><span [class]="s.status === 'Online' ? 'tag green' : 'tag red'">{{ s.status }}</span></div>
          <app-line-chart [labels]="hours" [series]="history(s)" [height]="170" [legend]="false" [min]="s.min" />
          <dl class="facts"><dt>Range</dt><dd>{{ s.min }} – {{ s.max }} {{ s.unit }}</dd><dt>Battery</dt><dd>{{ s.battery }}%</dd><dt>Protocol</dt><dd>LoRaWAN · gateway GW-0{{ floorIdx(s.floor) }}</dd><dt>Firmware</dt><dd>v3.2.1</dd></dl>
          <div class="acts">
            <button class="btn-primary" (click)="cfg.set({ id: s.id, min: s.min, max: s.max })"><app-icon name="sliders" [size]="14" />Thresholds</button>
            <button class="btn-ghost" (click)="calibrate(s)">Calibrate</button>
            @if (s.status === 'Offline') {<button class="btn-ghost" (click)="reboot(s)">Reboot</button>}
          </div>
        } @else {
          <h3>Active Alarms</h3>
          <ul class="al">
            @for (a of alarms(); track a.id) {<li (click)="selId.set(a.id)"><span class="dot"></span><div><b>{{ a.name }}</b><small>{{ a.metric }} {{ sv(a) }} {{ a.unit }} · {{ floorName(a.floor) }} {{ a.zone }}</small></div></li>} @empty {<li class="muted">No alarms</li>}
          </ul>
          <h3>Sensors by Type</h3>
          <app-bar-list [rows]="typeRows()" [max]="12" />
        }
      </aside>
    </section>
    <section class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'id', 'zone']" searchPlaceholder="Search sensors…" noun="sensors" [activeId]="selId()" (rowClick)="pick($event)" (action)="act($event.action, $event.row)" />
    </section>
    @if (cfg(); as c) {
      <div class="g-overlay" (click)="cfg.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveCfg()">
        <div class="modal-head"><h3>Alert thresholds · {{ sel()?.name }}</h3><button type="button" class="close-btn" (click)="cfg.set(null)">×</button></div>
        <div class="form-grid">
          <label>Low threshold<input class="input" type="number" step="0.1" [value]="c.min" (input)="cfg.set({ id: c.id, min: +$any($event.target).value, max: c.max })" /></label>
          <label>High threshold<input class="input" type="number" step="0.1" [value]="c.max" (input)="cfg.set({ id: c.id, min: c.min, max: +$any($event.target).value })" /></label>
          <p class="full muted">Breaching readings raise an alert on the 2D/3D viewer and notify the Facilities on-call team.</p>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cfg.set(null)">Cancel</button><button class="btn-primary">Save</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .si { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .mt { display: flex; flex-wrap: wrap; gap: 4px; } .mt button { border: 1px solid var(--border); background: #fff; border-radius: 16px; padding: 5px 11px; font-size: 12px; cursor: pointer; } .mt button.on { background: #0ea5e9; color: #fff; border-color: #0ea5e9; }
    .ftabs { display: flex; gap: 3px; } .ftabs button { border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 5px 8px; font-size: 11.5px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .scale { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--muted); margin-top: 8px; } .scale i { width: 160px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #3b82f6, #22c55e, #facc15, #ef4444); } .scale em { margin-left: auto; font-style: normal; }
    .side { display: flex; flex-direction: column; gap: 10px; } .sh { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; } .ic { width: 40px; height: 40px; border-radius: 10px; color: #fff; display: grid; place-items: center; }
    .read { display: flex; align-items: baseline; gap: 8px; } .read b { font-size: 32px; } .read .tag { margin-left: auto; }
    .facts { display: grid; grid-template-columns: 80px 1fr; gap: 6px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .al { list-style: none; margin: 0 0 8px; padding: 0; } .al li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f2f3f7; cursor: pointer; font-size: 12.5px; } .al div { display: flex; flex-direction: column; } .al small { color: var(--muted); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 4px #fee2e2; flex-shrink: 0; }
    @media (max-width: 1200px) { .si { grid-template-columns: 1fr; } }
  `,
})
export class SensorIoTVisualization {
  private readonly store = inject(TwinStore);
  protected readonly metrics = METRIC_LIST;
  protected readonly floors = FLOORS;
  protected readonly hours = ['04', '06', '08', '10', '12', '14', '16', '18', '20', 'Now'];
  protected readonly metric = signal<Metric>('Temperature');
  protected readonly floor = signal(this.store.floor());
  protected readonly selId = signal<string | null>(null);
  protected readonly cfg = signal<{ id: string; min: number; max: number } | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly sensors = this.store.sensors;
  protected readonly zones = computed(() => this.store.floorZones(this.floor()));
  protected readonly sel = computed(() => this.sensors().find((s) => s.id === this.selId()) ?? null);
  protected readonly online = computed(() => this.sensors().filter((s) => s.status !== 'Offline').length);
  protected readonly alarms = computed(() => this.sensors().filter((s) => s.status === 'Alarm' || (s.status === 'Online' && (this.store.sensorValue(s) > s.max || this.store.sensorValue(s) < s.min))));
  protected readonly range = computed(() => {
    const m = METRIC_LIST.indexOf(this.metric());
    const s = this.sensors().find((x) => x.metric === this.metric())!;
    return m >= 0 && s ? [`${s.min} ${s.unit}`, `${s.max} ${s.unit}`] : ['', ''];
  });
  protected readonly markers = computed<IsoMarker[]>(() =>
    this.sensors()
      .filter((s) => s.floor === this.floor() && s.metric === this.metric())
      .map((s) => ({ id: s.id, x: s.x, y: s.y, color: this.stColor(s), icon: 'twin-sensor', kind: 'value', label: `${this.store.sensorValue(s)} ${s.unit}`, title: s.name }) as IsoMarker)
      .concat(this.sensors().filter((s) => s.floor === this.floor() && s.metric !== this.metric()).map((s) => ({ id: s.id, x: s.x, y: s.y, color: '#94a3b8', icon: 'twin-sensor', kind: 'sensor', title: `${s.name} · ${s.metric}` }) as IsoMarker)),
  );
  protected readonly heat = computed(() =>
    this.sensors()
      .filter((s) => s.floor === this.floor() && s.metric === this.metric() && s.status !== 'Offline')
      .map((s) => ({ x: s.x, y: s.y, r: 90, v: Math.min(1, Math.max(0, (this.store.sensorValue(s) - s.min) / (s.max - s.min || 1))) * 0.5 })),
  );
  protected readonly typeRows = computed(() => METRIC_LIST.map((m) => ({ label: m, value: this.sensors().filter((s) => s.metric === m).length, color: '#0ea5e9' })));
  protected readonly rows = computed(() => this.sensors().map((s) => ({ ...s, floorL: floorById(s.floor).name, reading: `${this.store.sensorValue(s)} ${s.unit}`, bat: `${s.battery}%` })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Sensor' },
    { key: 'metric', label: 'Type' },
    { key: 'floorL', label: 'Floor' },
    { key: 'zone', label: 'Zone' },
    { key: 'reading', label: 'Reading', kind: 'num' },
    { key: 'bat', label: 'Battery', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'metric', label: 'Type', options: METRIC_LIST },
    { key: 'floorL', label: 'Floor', options: FLOORS.map((f) => f.name) },
    { key: 'status', label: 'Status', options: ['Online', 'Offline', 'Alarm'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'show', label: 'Show on map', icon: 'locate' },
    { id: 'cfg', label: 'Thresholds', icon: 'sliders' },
    { id: 'reboot', label: 'Reboot', icon: 'refresh', when: (r) => r.status === 'Offline' },
  ];
  constructor() {
    const id = this.store.focusId();
    const s = id ? this.sensors().find((x) => x.id === id) : this.sensors().find((x) => x.status === 'Alarm');
    if (s) {
      this.floor.set(s.floor);
      this.metric.set(s.metric);
      this.selId.set(s.id);
    }
    this.store.focusId.set(null);
  }
  protected sv(s: TSensor) {
    return this.store.sensorValue(s);
  }
  protected floorName(f: string) {
    return floorById(f).name;
  }
  protected floorIdx(f: string) {
    return FLOORS.findIndex((x) => x.id === f) + 1;
  }
  protected avg(m: Metric) {
    const l = this.sensors().filter((s) => s.metric === m && s.status !== 'Offline' && s.status !== 'Alarm');
    const v = l.reduce((a, s) => a + this.store.sensorValue(s), 0) / (l.length || 1);
    return m === 'Temperature' ? v.toFixed(1) : Math.round(v);
  }
  protected stColor(s: TSensor) {
    if (s.status === 'Offline') return '#94a3b8';
    const v = this.store.sensorValue(s);
    if (s.status === 'Alarm' || v > s.max || v < s.min) return '#ef4444';
    return (v - s.min) / (s.max - s.min) > 0.75 ? '#f59e0b' : '#16a34a';
  }
  protected history(s: TSensor) {
    const v = this.store.sensorValue(s);
    const h = s.id.charCodeAt(5);
    const vals = this.hours.map((_, i) => +(v * (0.86 + 0.14 * Math.sin((i + h) / 2) * (i < 9 ? 1 : 0)) + (s.status === 'Alarm' ? (i - 9) * 0.9 : 0)).toFixed(1));
    vals[vals.length - 1] = v;
    return [{ name: s.name, color: '#0ea5e9', values: vals, area: true }, { name: 'High threshold', color: '#ef4444', values: this.hours.map(() => s.max), dashed: true }];
  }
  protected pick(s: TSensor) {
    this.floor.set(s.floor);
    this.metric.set(s.metric);
    this.selId.set(s.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected saveCfg() {
    const c = this.cfg()!;
    const s = this.sensors().find((x) => x.id === c.id)!;
    this.store.patchSensor(c.id, { min: c.min, max: c.max });
    const v = this.store.sensorValue(s);
    if (v > c.max || v < c.min) this.store.raiseAlert({ title: `${s.metric} threshold`, detail: `${s.name} at ${v} ${s.unit}`, zone: s.zone, floor: s.floor, x: s.x, y: s.y, severity: 'High', icon: 'twin-sensor' });
    this.cfg.set(null);
    this.toastMsg(`Thresholds saved for ${s.name}${v > c.max || v < c.min ? ' · alert raised' : ''}`);
  }
  protected calibrate(s: TSensor) {
    this.toastMsg(`Calibration scheduled for ${s.name} (zero-point, 2 min)`);
  }
  protected reboot(s: TSensor) {
    this.store.patchSensor(s.id, { status: 'Online' });
    this.toastMsg(`${s.name} rebooted · back online`);
  }
  protected act(a: string, s: TSensor) {
    if (a === 'show') return this.pick(s);
    if (a === 'cfg') {
      this.pick(s);
      return this.cfg.set({ id: s.id, min: s.min, max: s.max });
    }
    this.reboot(s);
  }
  protected exportCsv() {
    downloadCsv('sensor-readings.csv', [['ID', 'Sensor', 'Type', 'Floor', 'Zone', 'Reading', 'Unit', 'Status', 'Battery'], ...this.sensors().map((s) => [s.id, s.name, s.metric, floorById(s.floor).name, s.zone, this.store.sensorValue(s), s.unit, s.status, s.battery ?? ''])]);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
