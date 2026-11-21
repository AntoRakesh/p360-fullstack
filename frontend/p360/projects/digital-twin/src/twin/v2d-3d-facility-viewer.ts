import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild, WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { IsoCallout, IsoMarker, IsoView } from './iso-view';
import { FloorHeat, UtilDonut } from './twin-widgets';
import { ASSET_TYPES, BUILDINGS, DEPT_COLOR, DEPTS, FLOORS, floorById, fmtN, JOHN_PATH, SITES, TAlert, TEntity, TSensor, TwinStore, TYPE_COLOR, TZone, ZONE_GROUP, ZoneGroup } from './twin.data';

type Layer = 'employee' | 'visitor' | 'contractor' | 'asset' | 'sensor' | 'zones';
type Detail = { kind: 'entity'; e: TEntity } | { kind: 'alert'; a: TAlert } | { kind: 'zone'; z: TZone } | { kind: 'activity' } | { kind: 'alerts' };

const LABEL_TYPES = new Set(['meeting', 'cafeteria', 'collab', 'reception', 'server', 'lobby', 'security', 'wellness', 'hvac', 'solar']);
const METRICS = ['Temperature', 'Humidity', 'CO₂', 'Occupancy', 'Air Quality', 'Smoke', 'Energy'];
const GROUPS: ZoneGroup[] = ['Workspaces', 'Common Areas', 'Restricted', 'Service'];

@Component({
  selector: 'app-twin-2d-3d-facility-viewer',
  imports: [...UI, IsoView, UtilDonut, FloorHeat, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ph">
      <nav class="crumbs"><a routerLink="/digital-twin">Digital Twin &amp; Spatial Intelligence</a><app-icon name="chevron-right" [size]="14" /><span>2D / 3D Facility Viewer</span></nav>
      <div class="ph-row">
        <h1>2D / 3D Facility Viewer</h1>
        <div class="head-btns">
          <div class="seg"><button [class.on]="mode() === '3d'" (click)="mode.set('3d')">3D View</button><button [class.on]="mode() === '2d'" (click)="mode.set('2d')">2D View</button></div>
          <div class="seg light"><button [class.on]="!outdoor()" (click)="outdoor.set(false)">Indoor</button><button [class.on]="outdoor()" (click)="outdoor.set(true); exploded.set(false)">Outdoor</button></div>
          <select class="select site" [value]="store.site()" (change)="setSite($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select>
        </div>
      </div>
      <p>Visualize people, assets, spaces and real-time activities in an interactive 2D/3D digital twin of your facilities.</p>
    </header>

    <section class="kpis">
      <button class="card k" (click)="go('people-asset-location')">
        <span class="ki" style="background:var(--kb-2563eb)"><app-icon name="users" [size]="30" [stroke]="1.8" /></span>
        <div><small>People in Building</small><b>{{ fmt(c().people) }}</b><em class="up"><app-icon name="arrow-up" [size]="13" [stroke]="2.6" />12%<span>vs. last hour</span></em></div>
      </button>
      <button class="card k" (click)="soloLayer('visitor')">
        <span class="ki" style="background:var(--kb-10b981)"><app-icon name="user-check" [size]="30" [stroke]="1.8" /></span>
        <div><small>Active Visitors</small><b>{{ c().visitors }}</b><em class="up"><app-icon name="arrow-up" [size]="13" [stroke]="2.6" />33%</em></div>
      </button>
      <button class="card k" (click)="go('asset-visualization')">
        <span class="ki" style="background:var(--kb-ef4444)"><app-icon name="twin-dolly" [size]="30" [stroke]="1.8" /></span>
        <div><small>Assets Tracked</small><b>{{ fmt(c().assets) }}</b><em class="up"><app-icon name="arrow-up" [size]="13" [stroke]="2.6" />8%</em></div>
      </button>
      <button class="card k" (click)="go('heatmaps-analytics')">
        <span class="ki" style="background:var(--kb-2563eb)"><app-icon name="twin-board" [size]="30" [stroke]="1.8" /></span>
        <div class="grow"><small>Utilization (Current)</small><b>{{ util() }}%</b><i class="bar"><i [style.width.%]="util()"></i></i></div>
      </button>
      <button class="card k" (click)="detail.set({ kind: 'alerts' })">
        <span class="ki" style="background:var(--kb-ef4444)"><app-icon name="triangle-alert" [size]="30" [stroke]="1.8" /></span>
        <div><small>Active Alerts</small><b>{{ store.activeAlerts().length }}</b><em class="bad-t"><app-icon name="arrow-up" [size]="13" [stroke]="2.6" />{{ store.newAlerts() }} new</em></div>
      </button>
    </section>

    <section class="main">
      <div class="card map-card">
        <app-iso-view #iso [zones]="zones()" [allZones]="store.zones()" [floor]="store.floor()" [markers]="markers()" [callouts]="callouts()" [paths]="paths()" [glows]="glows()" [fences]="fences()"
          [shirts]="shirts()" [tint]="tint()" [labelIds]="labelIds()" [selectedZone]="selZone()" [selectedId]="selId()"
          [(mode)]="mode" [(exploded)]="exploded" [(outdoor)]="outdoor"
          (markerClick)="markerClick($event)" (zoneClick)="zoneClick($event)" (calloutClick)="openCallout($event)" (floorPick)="pickFloor($event)" (measured)="toastMsg('Distance: ' + $event + ' m')">
          <div class="bsel">
            <button class="bbtn" (click)="bOpen.set(!bOpen())"><app-icon name="twin-building" [size]="15" />{{ store.building().name }}<app-icon name="chevron-down" [size]="14" /></button>
            @if (bOpen()) {<div class="dropdown">@for (b of buildings; track b.id) {<button class="dd-item" (click)="setBuilding(b)">{{ b.name }}<small class="muted"> · {{ b.floors }} floors</small></button>}</div>}
          </div>
          @if (!outdoor()) {
            <nav class="floors">
              @for (f of floorList(); track f.id) {<button [class.on]="f.id === store.floor()" (click)="pickFloor(f.id)" [title]="f.people + ' people · ' + f.util + '% utilized'">{{ f.name }}</button>}
            </nav>
          }
          <div class="legend">
            @for (l of legend; track l.id) {
              <button [class.off]="l.layer && !layers()[l.layer]" (click)="l.layer ? toggle(l.layer) : legendAct(l.id)">
                @switch (l.id) {
                  @case ('path') {<span class="lg-path" [class.off]="!showPath()"><i></i><i></i></span>}
                  @case ('fence') {<span class="lg-fence"></span>}
                  @case ('zone') {<span class="lg-zone"></span>}
                  @case ('alert') {<span class="lg-ic" style="background:var(--kb-ef4444)"><app-icon name="triangle-alert" [size]="10" [stroke]="2.6" /></span>}
                  @case ('asset') {<span class="lg-ic" style="background:var(--kb-7c3aed)"><app-icon name="twin-cube" [size]="10" [stroke]="2.6" /></span>}
                  @default {<span class="lg-ic" [style.background]="l.color"><app-icon name="user" [size]="10" [stroke]="2.6" /></span>}
                }
                {{ l.label }}
              </button>
            }
          </div>
        </app-iso-view>
      </div>

      <aside class="card layers">
        <h3>Layers &amp; Filters</h3>
        <div class="ltabs">@for (t of ltabs; track t) {<button [class.on]="ltab() === t" (click)="ltab.set(t)">{{ t }}</button>}</div>
        <h4>Show on Map</h4>
        <ul class="tg">
          @switch (ltab()) {
            @case ('People') {
              @for (r of mainRows(); track r.layer) {
                <li><button class="sw" [class.on]="layers()[r.layer]" [style.--c]="r.color" (click)="toggle(r.layer)" [attr.aria-pressed]="layers()[r.layer]"><i></i></button><span>{{ r.label }}</span><b>{{ fmt(r.count) }}</b></li>
              }
            }
            @case ('Assets') {
              @for (a of assetRows(); track a.type) {
                <li><button class="sw" [class.on]="!hiddenAssets().has(a.type)" style="--c:var(--ka-7c3aed)" (click)="flip(hiddenAssets, a.type)"><i></i></button><span>{{ a.type }}</span><b>{{ fmt(a.count) }}</b></li>
              }
            }
            @case ('Sensors') {
              @for (m of sensorRows(); track m.metric) {
                <li><button class="sw" [class.on]="!hiddenMetrics().has(m.metric)" style="--c:var(--ka-2563eb)" (click)="flip(hiddenMetrics, m.metric)"><i></i></button><span>{{ m.metric }}</span><b>{{ m.count }}</b></li>
              }
            }
            @case ('Zones') {
              @for (g of zoneRows(); track g.group) {
                <li><button class="sw" [class.on]="!hiddenGroups().has(g.group)" [style.--c]="g.color" (click)="flip(hiddenGroups, g.group)"><i></i></button><span>{{ g.group }}</span><b>{{ g.count }}</b></li>
              }
              <li><button class="sw" [class.on]="layers().zones" style="--c:var(--ka-ef4444)" (click)="toggle('zones')"><i></i></button><span>Geofences</span><b>2</b></li>
            }
          }
        </ul>
        <h4 class="vo">View Options</h4>
        <label>People by<select class="select" [value]="peopleBy()" (change)="peopleBy.set($any($event.target).value)"><option>Department</option><option>Person Type</option><option>Status</option></select></label>
        @if (peopleBy() === 'Department') {<div class="dept">@for (d of depts; track d) {<span><i [style.background]="deptColor[d]"></i>{{ d }}</span>}</div>}
        <label>Asset by<select class="select" [value]="assetBy()" (change)="assetBy.set($any($event.target).value)"><option>Asset Type</option><option>Status</option><option>Battery Level</option></select></label>
        <label>Show Zones<select class="select" [value]="showZones()" (change)="showZones.set($any($event.target).value)"><option>All Zones</option><option>Workspaces</option><option>Common Areas</option><option>Restricted</option><option>Service</option><option>None</option></select></label>
      </aside>
    </section>

    <section class="bottom">
      <div class="card">
        <h3>Space Utilization ({{ floorName() }})</h3>
        <app-util-donut [rows]="utilRows()" [center]="util()" />
      </div>
      <div class="card">
        <div class="ch"><h3>People &amp; Asset Heatmap</h3>
          <select class="select sm" [value]="heatMetric()" (change)="heatMetric.set($any($event.target).value)"><option>People Density</option><option>Asset Density</option><option>Temperature</option></select>
        </div>
        <app-floor-heat [zones]="zones()" [points]="heatPoints()" (pick)="go('heatmaps-analytics')" />
      </div>
      <div class="card">
        <div class="ch"><h3>Recent Activity</h3><button class="link" (click)="detail.set({ kind: 'activity' })">View All</button></div>
        <ul class="act">
          @for (a of store.activity().slice(0, 5); track a.id) {
            <li (click)="activityClick(a.ref, a.floor)">
              <span class="ai" [style.background]="a.color"><app-icon [name]="a.icon" [size]="15" /></span>
              <span class="who">{{ a.who }}</span><span class="what">{{ a.what }}</span><span class="tm">{{ a.time }}</span>
            </li>
          }
        </ul>
      </div>
    </section>

    @if (detail(); as d) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <aside class="g-drawer dr">
        @switch (d.kind) {
          @case ('entity') {
            @let e = $any(d).e;
            <div class="modal-head"><h3>{{ e.name }}</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
            <div class="dh">
              <span class="big" [style.background]="color(e)"><app-icon [name]="icon(e)" [size]="26" /></span>
              <div><b>{{ e.name }}</b><small>{{ e.sub }}</small><span [class]="statusCls(e.status)">{{ e.status }}</span></div>
            </div>
            <dl class="facts">
              <dt>ID</dt><dd>{{ e.id }}</dd>
              <dt>Type</dt><dd>{{ kindLabel(e) }}</dd>
              <dt>Location</dt><dd>{{ floorShort(e.floor) }} · {{ e.zone }}</dd>
              <dt>Coordinates</dt><dd>{{ (pos(e)[0] * 0.08).toFixed(1) }} m, {{ (pos(e)[1] * 0.08).toFixed(1) }} m</dd>
              @if (e.kind === 'sensor') {<dt>Reading</dt><dd><b>{{ sv(e) }}</b> {{ $any(e).unit }} (range {{ $any(e).min }}–{{ $any(e).max }})</dd>}
              @if (e.battery !== undefined) {<dt>Battery</dt><dd><i class="bat"><i [style.width.%]="e.battery" [style.background]="e.battery < 25 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'"></i></i>{{ e.battery }}%</dd>}
              <dt>Last seen</dt><dd>{{ e.status === 'Offline' ? '42 min ago' : 'Just now (live)' }}</dd>
            </dl>
            <div class="acts">
              <button class="btn-primary" (click)="locate(e)"><app-icon name="locate" [size]="15" />Locate on map</button>
              @if (e.kind !== 'sensor' && e.kind !== 'asset') {<button class="btn-ghost" (click)="showPathFor(e)"><app-icon name="twin-route" [size]="15" />{{ pathFor() === e.id ? 'Hide path' : 'Show path' }}</button>}
              @if (e.kind === 'asset') {<button class="btn-ghost" (click)="maint(e)"><app-icon name="twin-wrench" [size]="15" />Send to maintenance</button>}
              <button class="btn-ghost" (click)="track(e)"><app-icon name="map-pin" [size]="15" />{{ e.kind === 'sensor' ? 'Open in Sensor view' : e.kind === 'asset' ? 'Open in Asset view' : 'Track live' }}</button>
              @if (e.kind === 'employee' || e.kind === 'contractor' || e.kind === 'visitor') {<button class="btn-ghost" (click)="toastMsg('Message sent to ' + e.name)"><app-icon name="message" [size]="15" />Message</button>}
            </div>
          }
          @case ('alert') {
            @let a = $any(d).a;
            <div class="modal-head"><h3>{{ a.title }}</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
            <div class="dh"><span class="big" style="background:var(--kb-ef4444)"><app-icon [name]="a.icon" [size]="26" /></span><div><b style="color:var(--kf-dc2626)">{{ a.detail }}</b><small>{{ floorShort(a.floor) }} · {{ a.zone }} · {{ a.time }}</small><span [class]="a.ack ? 'tag green' : 'tag red'">{{ a.ack ? 'Acknowledged' : a.severity }}</span></div></div>
            @if (a.id === 'AL-501') {
              <h4>Temperature – last 60 min</h4>
              <app-line-chart [labels]="['09:20', '09:30', '09:40', '09:50', '10:00', '10:10', '10:20']" [series]="[{ name: 'Server Room', color: 'var(--ka-ef4444)', values: [24.1, 24.6, 25.8, 27.2, 29.4, 31.6, 32], area: true }, { name: 'Threshold', color: 'var(--ka-94a3b8)', values: [28, 28, 28, 28, 28, 28, 28], dashed: true }]" [height]="170" suffix="°C" [min]="20" />
              <p class="muted">CRAC unit 2 reports compressor fault. Rack R3 inlet temperature rising 1.2°C / 10 min.</p>
            }
            <div class="acts">
              @if (!a.ack) {<button class="btn-primary" (click)="ack(a)"><app-icon name="twin-check" [size]="15" />Acknowledge</button>}
              <button class="btn-ghost" (click)="workOrder(a)"><app-icon name="twin-wrench" [size]="15" />Create work order</button>
              <button class="btn-ghost" (click)="alertLocate(a)"><app-icon name="locate" [size]="15" />Show on map</button>
              <button class="btn-ghost" (click)="go('sensor-iot-visualization')"><app-icon name="twin-sensor" [size]="15" />Sensor details</button>
            </div>
          }
          @case ('zone') {
            @let z = $any(d).z;
            <div class="modal-head"><h3>{{ z.name }}</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
            <div class="dh"><span class="big" [style.background]="groupColor(z)"><app-icon name="map-floor" [size]="26" /></span><div><b>{{ z.name }}</b><small>{{ floorShort(z.floor) }} · {{ group(z) }} · {{ zoneArea(z) }} m²</small><span [class]="z.status === 'Active' ? 'tag green' : 'tag amber'">{{ z.status }}</span></div></div>
            @if (z.capacity) {
              <div class="occ"><span>Occupancy</span><b>{{ z.occupancy }} / {{ z.capacity }}</b><i class="bar"><i [style.width.%]="(z.occupancy / z.capacity) * 100" [style.background]="z.occupancy / z.capacity > 0.85 ? 'var(--ka-ef4444)' : 'var(--ka-2563eb)'"></i></i></div>
            }
            <h4>Live in this zone</h4>
            <ul class="mini">
              @for (e of inZone(z); track e.id) {<li (click)="detail.set({ kind: 'entity', e })"><span class="dot" [style.background]="color(e)"></span>{{ e.name }}<small>{{ kindLabel(e) }}</small></li>} @empty {<li class="muted">No tracked people or assets right now</li>}
            </ul>
            <div class="acts">
              @if (z.type === 'meeting') {<button class="btn-primary" (click)="toastMsg(z.name + ' booked 11:00–12:00 for you')"><app-icon name="calendar-days" [size]="15" />Book a room</button>}
              <button class="btn-ghost" (click)="go('space-zone-management')"><app-icon name="sliders" [size]="15" />Manage zone</button>
              <button class="btn-ghost" (click)="go('heatmaps-analytics')"><app-icon name="map-floor" [size]="15" />View heatmap</button>
            </div>
          }
          @case ('activity') {
            <div class="modal-head"><h3>All Activity</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
            <ul class="act full">
              @for (a of store.activity(); track a.id) {
                <li (click)="activityClick(a.ref, a.floor)"><span class="ai" [style.background]="a.color"><app-icon [name]="a.icon" [size]="15" /></span><span class="who">{{ a.who }}</span><span class="what">{{ a.what }}</span><span class="tm">{{ a.time }}</span></li>
              }
            </ul>
          }
          @case ('alerts') {
            <div class="modal-head"><h3>Active Alerts ({{ store.activeAlerts().length }})</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
            <ul class="alist">
              @for (a of store.alerts(); track a.id) {
                <li [class.done]="a.ack" (click)="detail.set({ kind: 'alert', a })">
                  <span class="ai" [style.background]="a.ack ? 'var(--ka-94a3b8)' : 'var(--ka-ef4444)'"><app-icon [name]="a.icon" [size]="15" /></span>
                  <div><b>{{ a.title }}</b><small>{{ a.detail }} · {{ floorShort(a.floor) }} {{ a.zone }}</small></div>
                  <span class="tm">{{ a.time }}@if (a.isNew && !a.ack) {<em class="tag red">new</em>}</span>
                </li>
              }
            </ul>
          }
        }
      </aside>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .ph { margin-bottom: 16px; } .ph .crumbs { margin: 0 0 4px; }
    .ph-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .ph h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.4px; } .ph p { margin: 2px 0 0; font-size: 15px; color: var(--kf-3b3f5c); }
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--kb-ffffff); }
    .seg button { border: 0; background: var(--kb-ffffff); padding: 9px 18px; font-size: 13px; cursor: pointer; color: var(--kf-3b3f5c); } .seg button + button { border-left: 1px solid var(--border); }
    .seg button.on { background: var(--primary); color: var(--kf-ffffff); } .seg.light button.on { background: var(--kb-ede9fe); color: var(--primary); font-weight: 600; }
    .site { min-width: 200px; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
    .k { display: flex; gap: 16px; align-items: center; text-align: left; cursor: pointer; padding: 14px 16px; font: inherit; color: inherit; }
    .k:hover { border-color: var(--kl-c4b5fd); }
    .ki { width: 60px; height: 58px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .k div { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .k .grow { flex: 1; }
    .k small { font-size: 13px; color: var(--kf-3b3f5c); } .k b { font-size: 23px; font-weight: 700; }
    .k em { font-style: normal; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 3px; } .k em { white-space: nowrap; } .k em span { color: var(--muted); font-weight: 400; margin-left: 8px; }
    .up { color: var(--kf-16a34a); } .bad-t { color: var(--kf-dc2626); }
    .bar { display: block; height: 8px; border-radius: 6px; background: var(--kb-e8eaf2); overflow: hidden; margin-top: 6px; } .bar > i { display: block; height: 100%; background: var(--kb-2563eb); border-radius: 6px; }
    .main { display: grid; grid-template-columns: minmax(0, 1fr) 256px; gap: 12px; margin-bottom: 14px; align-items: start; }
    .map-card { padding: 0; overflow: hidden; }
    .bsel { position: absolute; top: 12px; left: 12px; z-index: 7; }
    .bbtn { display: flex; align-items: center; gap: 8px; background: var(--kb-ffffff); border: 0; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
    .bsel .dropdown { left: 0; right: auto; min-width: 240px; }
    .floors { position: absolute; top: 56px; left: 12px; z-index: 6; background: var(--kb-ffffff); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); width: 92px; }
    .floors button { border: 0; background: none; text-align: left; padding: 8px 10px; font-size: 12px; cursor: pointer; border-left: 3px solid transparent; border-radius: 3px; color: var(--kf-1f2433); }
    .floors button + button { border-top: 1px solid var(--kl-f0f1f6); } .floors button.on { background: var(--kb-f1ecff); color: var(--primary); border-left-color: var(--primary); font-weight: 600; } .floors button:hover:not(.on) { background: var(--kb-f8f7fc); }
    .legend { position: absolute; left: 12px; right: 12px; bottom: 10px; z-index: 6; background: var(--kb-ffffff); border-radius: 8px; display: flex; justify-content: space-around; flex-wrap: wrap; padding: 8px 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
    .legend button { border: 0; background: none; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 6px; color: var(--kf-1f2433); } .legend button:hover { background: var(--kb-f5f3ff); }
    .legend button.off { opacity: 0.4; text-decoration: line-through; }
    .lg-ic { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); }
    .lg-path { display: inline-flex; align-items: center; gap: 2px; width: 24px; } .lg-path i { width: 6px; height: 6px; border-radius: 50%; border: 2px solid var(--kl-2563eb); } .lg-path::before { content: ''; } .lg-path.off { opacity: .4; }
    .lg-path { background: linear-gradient(var(--kb-2563eb), var(--kb-2563eb)) center / 100% 2px no-repeat; justify-content: space-between; }
    .lg-fence { width: 18px; height: 18px; border-radius: 50%; border: 2px dashed var(--kl-ef4444); }
    .lg-zone { width: 20px; height: 16px; border-radius: 3px; background: var(--kb-dbeafe); border: 1px solid var(--kl-bfdbfe); }
    .layers { display: flex; flex-direction: column; gap: 6px; } .layers h3 { margin: 0 0 6px; font-size: 15px; }
    .ltabs { display: flex; gap: 4px; background: var(--kb-f6f5fb); padding: 3px; border-radius: 8px; }
    .ltabs button { flex: 1; border: 0; background: none; padding: 7px 0; font-size: 11.5px; border-radius: 6px; cursor: pointer; color: var(--kf-3b3f5c); } .ltabs button.on { background: var(--primary); color: var(--kf-ffffff); }
    h4 { margin: 10px 0 2px; font-size: 13px; } .vo { margin-top: 14px; }
    .tg { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; } .tg li { display: grid; grid-template-columns: 40px 1fr auto; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; }
    .tg b { font-weight: 500; font-variant-numeric: tabular-nums; }
    .sw { width: 36px; height: 20px; border-radius: 12px; border: 0; background: var(--kb-d5d8e2); position: relative; cursor: pointer; padding: 0; transition: background 0.15s; }
    .sw i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); transition: left 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
    .sw.on { background: var(--c); } .sw.on i { left: 18px; }
    .layers label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); margin-top: 6px; } .layers .select { width: 100%; }
    .dept { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 10.5px; color: var(--muted); } .dept span { display: inline-flex; align-items: center; gap: 3px; } .dept i { width: 8px; height: 8px; border-radius: 2px; }
    .bottom { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 14px; }
    .bottom h3 { margin: 0 0 10px; font-size: 15px; } .ch { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .ch h3 { margin: 0; }
    .select.sm { padding: 5px 26px 5px 10px; font-size: 11.5px; }
    .act { list-style: none; margin: 0; padding: 0; } .act li { display: grid; grid-template-columns: 26px 1fr 1.25fr auto; gap: 10px; align-items: center; padding: 5px 0; font-size: 12px; cursor: pointer; border-radius: 6px; }
    .act li:hover { background: var(--kb-faf8ff); }
    .ai { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .what { text-decoration: underline; color: var(--kf-2d3150); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tm { color: var(--kf-3b3f5c); white-space: nowrap; display: flex; gap: 4px; align-items: center; }
    .act.full li { padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .dr { width: min(440px, 100vw); display: flex; flex-direction: column; gap: 12px; }
    .dh { display: flex; gap: 12px; align-items: center; } .dh > div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; } .dh small { color: var(--muted); font-size: 12px; }
    .big { width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .facts { display: grid; grid-template-columns: 110px 1fr; gap: 8px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; display: flex; align-items: center; gap: 8px; }
    .bat { display: inline-block; width: 60px; height: 8px; background: var(--kb-eef0f5); border-radius: 4px; overflow: hidden; } .bat i { display: block; height: 100%; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; }
    .occ { display: grid; grid-template-columns: 1fr auto; gap: 4px; font-size: 12.5px; } .occ .bar { grid-column: 1 / -1; }
    .mini { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; } .mini li { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid var(--kl-f3f4f8); cursor: pointer; } .mini small { margin-left: auto; color: var(--muted); }
    .dot { width: 9px; height: 9px; border-radius: 50%; }
    .alist { list-style: none; margin: 0; padding: 0; } .alist li { display: grid; grid-template-columns: 26px 1fr auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; font-size: 12.5px; }
    .alist li div { display: flex; flex-direction: column; } .alist small { color: var(--muted); } .alist li.done { opacity: 0.55; }
    @media (max-width: 1350px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .bottom { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 1100px) { .main { grid-template-columns: 1fr; } .bottom { grid-template-columns: 1fr; } }
  `,
})
export class Facility2D3DFacilityViewer {
  protected readonly store = inject(TwinStore);
  private readonly router = inject(Router);
  private readonly iso = viewChild<IsoView>('iso');
  protected readonly fmt = fmtN;
  protected readonly sites = SITES;
  protected readonly buildings = BUILDINGS;
  protected readonly depts = DEPTS;
  protected readonly deptColor = DEPT_COLOR;
  protected readonly ltabs = ['People', 'Assets', 'Sensors', 'Zones'] as const;
  protected readonly legend: { id: string; label: string; color?: string; layer?: Layer }[] = [
    { id: 'emp', label: 'Employee', color: 'var(--ka-2563eb)', layer: 'employee' },
    { id: 'vis', label: 'Visitor', color: 'var(--ka-f59e0b)', layer: 'visitor' },
    { id: 'con', label: 'Contractor', color: 'var(--ka-16a34a)', layer: 'contractor' },
    { id: 'asset', label: 'Asset/Equipment', layer: 'asset' },
    { id: 'alert', label: 'Alert' },
    { id: 'path', label: 'Path/Movement' },
    { id: 'fence', label: 'Geofence', layer: 'zones' },
    { id: 'zone', label: 'Zone' },
  ];

  protected readonly mode = signal<'3d' | '2d'>('3d');
  protected readonly exploded = signal(false);
  protected readonly outdoor = signal(false);
  protected readonly bOpen = signal(false);
  protected readonly ltab = signal<(typeof this.ltabs)[number]>('People');
  protected readonly layers = signal<Record<Layer, boolean>>({ employee: true, visitor: true, contractor: true, asset: true, sensor: true, zones: true });
  protected readonly hiddenAssets = signal(new Set<string>());
  protected readonly hiddenMetrics = signal(new Set<string>());
  protected readonly hiddenGroups = signal(new Set<string>());
  protected readonly peopleBy = signal('Department');
  protected readonly assetBy = signal('Asset Type');
  protected readonly showZones = signal('All Zones');
  protected readonly heatMetric = signal('People Density');
  protected readonly showPath = signal(true);
  protected readonly showAlerts = signal(true);
  protected readonly zoneTint = signal(false);
  protected readonly pathFor = signal<string | null>('P-1001');
  protected readonly pinned = signal<string[]>(['P-1001', 'AL-501', 'Forklift-01']);
  protected readonly selId = signal<string | null>(null);
  protected readonly selZone = signal<string | null>(null);
  protected readonly detail = signal<Detail | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected readonly c = this.store.counts;
  protected readonly floor = computed(() => floorById(this.store.floor()));
  protected readonly floorName = computed(() => this.floor().name);
  protected readonly util = computed(() => (this.store.floor() === '4' ? 68 : this.floor().util));
  protected readonly zones = computed(() => this.store.floorZones(this.store.floor()));
  protected readonly floorList = computed(() => {
    const n = this.store.building().floors;
    return n >= 7 ? FLOORS : FLOORS.filter((f) => f.id === 'G' || +f.id <= n - 1);
  });

  constructor() {
    effect(() => this.store.liveEvent(this.store.tick()));
    // a focus request from another page (e.g. "Locate" in a table)
    effect(() => {
      const id = this.store.focusId();
      if (!id) return;
      const e = this.store.find(id);
      if (e) setTimeout(() => this.locate(e));
      this.store.focusId.set(null);
    });
  }

  private onFloor<T extends { floor: string }>(l: T[]) {
    return l.filter((x) => x.floor === this.store.floor());
  }
  protected pos(e: TEntity) {
    return this.store.pos(e);
  }
  protected sv(e: TEntity) {
    return this.store.sensorValue(e as TSensor);
  }

  protected readonly shirts = computed(() => {
    const L = this.layers();
    const by = this.peopleBy();
    if (by === 'Department') {
      const s = [...DEPTS.map((d) => DEPT_COLOR[d])];
      if (L.visitor) s.push('var(--ka-f59e0b)');
      if (L.contractor) s.push('var(--ka-16a34a)', 'var(--ka-16a34a)');
      return L.employee ? s : s.slice(DEPTS.length);
    }
    if (by === 'Status') return ['var(--ka-22c55e)', 'var(--ka-22c55e)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)'];
    const s: string[] = [];
    if (L.employee) s.push('var(--ka-2563eb)', 'var(--ka-2563eb)', 'var(--ka-2563eb)', 'var(--ka-2563eb)', 'var(--ka-2563eb)', 'var(--ka-2563eb)');
    if (L.visitor) s.push('var(--ka-f59e0b)');
    if (L.contractor) s.push('var(--ka-16a34a)', 'var(--ka-16a34a)');
    return s;
  });

  protected readonly markers = computed<IsoMarker[]>(() => {
    const L = this.layers();
    const out: IsoMarker[] = [];
    for (const p of this.onFloor(this.store.people())) {
      if (!p.pin || !L[p.kind as Layer]) continue;
      const [x, y] = this.store.pos(p);
      out.push({ id: p.id, x, y, color: TYPE_COLOR[p.kind], icon: 'user', title: `${p.name} · ${p.sub}` });
    }
    if (L.asset)
      for (const a of this.onFloor(this.store.assets())) {
        if (!a.pin || this.hiddenAssets().has(a.type)) continue;
        const [x, y] = this.store.pos(a);
        const big = a.name === 'Forklift-01';
        out.push({ id: a.id, x, y, color: this.assetColor(a), icon: ASSET_TYPES.find((t) => t.type === a.type)?.icon ?? 'twin-cube', kind: big ? 'pin' : 'chip', title: `${a.name} · ${a.type} · ${a.status}` });
      }
    if (L.sensor)
      for (const s of this.onFloor(this.store.sensors())) {
        if (this.hiddenMetrics().has(s.metric) || s.id === this.alertSensorId()) continue;
        out.push({ id: s.id, x: s.x, y: s.y, color: s.status === 'Offline' ? 'var(--ka-94a3b8)' : s.status === 'Alarm' ? 'var(--ka-ef4444)' : 'var(--ka-0ea5e9)', icon: 'twin-sensor', kind: 'sensor', title: `${s.name} · ${this.store.sensorValue(s)} ${s.unit}` });
      }
    if (this.showAlerts())
      for (const a of this.onFloor(this.store.activeAlerts())) out.push({ id: a.id, x: a.x, y: a.y, color: 'var(--ka-ef4444)', icon: 'triangle-alert', kind: 'alert', title: a.title });
    return out;
  });
  private readonly alertSensorId = computed(() => this.store.sensors().find((s) => s.name === 'TEMP-SR4')?.id);

  protected readonly callouts = computed<IsoCallout[]>(() => {
    const out: IsoCallout[] = [];
    const visible = new Set(this.markers().map((m) => m.id));
    for (const id of this.pinned()) {
      const al = this.store.activeAlerts().find((a) => a.id === id && a.floor === this.store.floor());
      if (al && this.showAlerts()) {
        out.push({ id, x: al.x, y: al.y, title: al.title, lines: [al.detail, al.zone], icon: al.icon, color: 'var(--ka-ef4444)', accent: 'var(--ka-dc2626)', tone: 'var(--ka-dc2626)', pos: 'above' });
        continue;
      }
      const e = this.store.find(id);
      if (!e || e.floor !== this.store.floor() || !visible.has(e.id)) continue;
      const [x, y] = this.store.pos(e);
      if (e.kind === 'asset') out.push({ id: e.id, x, y, title: e.name, lines: [e.status, `Battery ${e.battery ?? '—'}%`, `${floorById(e.floor).short} - ${e.zone}`], icon: 'twin-forklift', color: 'var(--ka-f59e0b)', tone: e.status === 'Moving' ? 'var(--ka-16a34a)' : undefined, pos: 'below' });
      else if (e.kind === 'sensor') out.push({ id: e.id, x, y, title: e.name, lines: [`${this.store.sensorValue(e as TSensor)} ${(e as TSensor).unit}`, e.zone], icon: 'twin-sensor', color: 'var(--ka-0ea5e9)' });
      else out.push({ id: e.id, x, y, title: e.name, lines: [this.kindLabel(e), e.sub, floorById(e.floor).short], icon: 'user', color: TYPE_COLOR[e.kind], dy: 6 });
    }
    return out;
  });

  protected readonly paths = computed(() => {
    if (!this.showPath() || !this.pathFor()) return [];
    const e = this.store.find(this.pathFor()!);
    if (!e || e.floor !== this.store.floor()) return [];
    const pts: [number, number][] = e.id === 'P-1001' ? JOHN_PATH : [[176, 470], [300, 395], [this.store.pos(e)[0] - 40, (this.store.pos(e)[1] + 395) / 2], this.store.pos(e)];
    return [{ points: pts, color: 'var(--ka-2563eb)', dashed: false, dots: true }];
  });
  protected readonly glows = computed(() => (this.showAlerts() ? this.onFloor(this.store.activeAlerts()).filter((a) => a.severity === 'Critical').map((a) => ({ x: a.x, y: a.y, r: 78, color: 'var(--ka-ef4444)' })) : []));
  protected readonly fences = computed(() => (this.layers().zones && !this.hiddenGroups().has('Restricted') ? this.zones().filter((z) => z.restricted).map((z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2, r: Math.max(z.w, z.h) * 0.62 })) : []));
  protected readonly labelIds = computed(() => {
    if (!this.layers().zones || this.showZones() === 'None') return [];
    const sz = this.showZones();
    return this.zones()
      .filter((z) => !this.hiddenGroups().has(ZONE_GROUP[z.type]))
      .filter((z) => (sz === 'All Zones' ? LABEL_TYPES.has(z.type) : ZONE_GROUP[z.type] === sz))
      .map((z) => z.id);
  });
  protected readonly tint = computed(() => {
    if (!this.layers().zones) return [];
    const sz = this.showZones();
    if (this.zoneTint()) return this.zones().filter((z) => !this.hiddenGroups().has(ZONE_GROUP[z.type]) && z.type !== 'core').map((z) => z.id);
    if (sz === 'All Zones' || sz === 'None') return [];
    return this.zones().filter((z) => ZONE_GROUP[z.type] === sz).map((z) => z.id);
  });

  protected readonly mainRows = computed(() => [
    { layer: 'employee' as Layer, label: 'Employees', count: this.c().employees, color: 'var(--ka-22c55e)' },
    { layer: 'visitor' as Layer, label: 'Visitors', count: this.c().visitors, color: 'var(--ka-f59e0b)' },
    { layer: 'contractor' as Layer, label: 'Contractors', count: this.c().contractors, color: 'var(--ka-22c55e)' },
    { layer: 'asset' as Layer, label: 'Assets', count: this.c().assets, color: 'var(--ka-7c3aed)' },
    { layer: 'sensor' as Layer, label: 'Sensors (IoT)', count: this.c().sensors, color: 'var(--ka-2563eb)' },
    { layer: 'zones' as Layer, label: 'Zones & Geofences', count: this.zones().filter((z) => z.type !== 'core').length + 2, color: 'var(--ka-ef4444)' },
  ]);
  protected readonly assetRows = computed(() => ASSET_TYPES.map((t) => ({ type: t.type, count: this.store.assets().filter((a) => a.type === t.type).length })));
  protected readonly sensorRows = computed(() => METRICS.map((m) => ({ metric: m, count: this.store.sensors().filter((s) => s.metric === m).length })));
  protected readonly zoneRows = computed(() => GROUPS.map((g) => ({ group: g, color: g === 'Restricted' ? 'var(--ka-ef4444)' : g === 'Service' ? 'var(--ka-64748b)' : g === 'Common Areas' ? 'var(--ka-22c55e)' : 'var(--ka-2563eb)', count: this.zones().filter((z) => ZONE_GROUP[z.type] === g).length })));

  protected readonly utilRows = computed(() => {
    const zs = this.zones();
    if (this.store.floor() === '4')
      return [
        { label: 'Workstations', pct: 68, color: 'var(--ka-2563eb)', weight: 104 },
        { label: 'Meeting Rooms', pct: 72, color: 'var(--ka-10b981)', weight: 40 },
        { label: 'Collaboration', pct: 55, color: 'var(--ka-f59e0b)', weight: 36 },
        { label: 'Cafeteria', pct: 80, color: 'var(--ka-ef4444)', weight: 44 },
        { label: 'Other Spaces', pct: 46, color: 'var(--ka-9ca3af)', weight: 22 },
      ];
    const grp = (types: string[]) => {
      const l = zs.filter((z) => types.includes(z.type) && z.capacity);
      const cap = l.reduce((a, z) => a + z.capacity, 0);
      const occ = l.reduce((a, z) => a + z.occupancy, 0);
      return { pct: cap ? Math.round((occ / cap) * 100) : 0, weight: occ };
    };
    return [
      { label: 'Workstations', color: 'var(--ka-2563eb)', ...grp(['workstations', 'pods']) },
      { label: 'Meeting Rooms', color: 'var(--ka-10b981)', ...grp(['meeting']) },
      { label: 'Collaboration', color: 'var(--ka-f59e0b)', ...grp(['collab', 'lobby', 'wellness']) },
      { label: 'Cafeteria', color: 'var(--ka-ef4444)', ...grp(['cafeteria']) },
      { label: 'Other Spaces', color: 'var(--ka-9ca3af)', ...grp(['reception', 'storage', 'security', 'server', 'hvac', 'solar']) },
    ];
  });

  protected readonly heatPoints = computed(() => {
    const m = this.heatMetric();
    const f = this.store.floor();
    if (m === 'Temperature') return this.store.sensors().filter((s) => s.floor === f && s.metric === 'Temperature').map((s) => ({ x: s.x, y: s.y, v: Math.min(1, (this.store.sensorValue(s) - 18) / 14) })).concat(this.zones().map((z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2, v: 0.25 })));
    if (m === 'Asset Density') return this.store.assets().filter((a) => a.floor === f).map((a) => ({ x: a.x, y: a.y, v: 0.18 }));
    return this.store.people().filter((p) => p.floor === f).map((p) => {
      const [x, y] = this.store.pos(p);
      return { x, y, v: 0.3 };
    });
  });

  /* ---------- helpers ---------- */
  protected color(e: TEntity) {
    return e.kind === 'asset' ? this.assetColor(e) : e.kind === 'sensor' ? 'var(--ka-0ea5e9)' : TYPE_COLOR[e.kind];
  }
  protected icon(e: TEntity) {
    return e.kind === 'asset' ? ASSET_TYPES.find((t) => t.type === e.type)?.icon ?? 'twin-cube' : e.kind === 'sensor' ? 'twin-sensor' : e.kind === 'contractor' ? 'hard-hat' : 'user';
  }
  private assetColor(a: TEntity) {
    const by = this.assetBy();
    if (by === 'Status') return a.status === 'Maintenance' || a.status === 'Low Battery' ? 'var(--ka-ef4444)' : a.status === 'Idle' ? 'var(--ka-f59e0b)' : 'var(--ka-16a34a)';
    if (by === 'Battery Level') return a.battery === undefined ? 'var(--ka-94a3b8)' : a.battery < 25 ? 'var(--ka-ef4444)' : a.battery < 50 ? 'var(--ka-f59e0b)' : 'var(--ka-16a34a)';
    return 'var(--ka-7c3aed)';
  }
  protected kindLabel(e: TEntity) {
    return e.kind === 'employee' ? 'Employee' : e.kind === 'visitor' ? 'Visitor' : e.kind === 'contractor' ? 'Contractor' : e.kind === 'asset' ? e.type : `${e.type} Sensor`;
  }
  protected statusCls(s: string) {
    return /alarm|offline|low|maint/i.test(s) ? 'tag red' : /moving|idle/i.test(s) ? 'tag amber' : 'tag green';
  }
  protected floorShort(f: string) {
    return floorById(f).short;
  }
  protected group(z: TZone) {
    return ZONE_GROUP[z.type];
  }
  protected groupColor(z: TZone) {
    return z.restricted ? 'var(--ka-ef4444)' : ZONE_GROUP[z.type] === 'Common Areas' ? 'var(--ka-10b981)' : 'var(--ka-2563eb)';
  }
  protected zoneArea(z: TZone) {
    return Math.round(z.w * z.h * 0.0064);
  }
  protected inZone(z: TZone) {
    const inside = (e: TEntity) => e.floor === z.floor && e.x >= z.x && e.x <= z.x + z.w && e.y >= z.y && e.y <= z.y + z.h;
    return [...this.store.people().filter(inside), ...this.store.assets().filter((a) => a.pin && inside(a)), ...this.store.sensors().filter(inside)].slice(0, 30);
  }

  /* ---------- actions ---------- */
  protected toggle(l: Layer) {
    this.layers.update((s) => ({ ...s, [l]: !s[l] }));
  }
  protected soloLayer(l: Layer) {
    const solo = Object.entries(this.layers()).every(([k, v]) => (k === l ? v : !v));
    this.layers.set({ employee: solo, visitor: true, contractor: solo, asset: solo, sensor: solo, zones: solo, [l]: true });
    this.toastMsg(solo ? 'Showing all layers' : 'Showing visitors only');
  }
  protected flip(sig: WritableSignal<Set<string>>, v: string) {
    sig.update((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  }
  protected legendAct(id: string) {
    if (id === 'path') this.showPath.update((v) => !v);
    if (id === 'alert') this.showAlerts.update((v) => !v);
    if (id === 'zone') this.zoneTint.update((v) => !v);
  }
  protected markerClick(id: string) {
    this.selId.set(id);
    const al = this.store.alerts().find((a) => a.id === id);
    const key = al ? id : this.store.find(id)?.kind === 'asset' ? this.store.find(id)!.name : id;
    const e = this.store.find(id);
    if (this.pinned().includes(key) || this.pinned().includes(id)) {
      if (al) return this.detail.set({ kind: 'alert', a: al });
      if (e) return this.detail.set({ kind: 'entity', e });
    }
    this.pinned.update((p) => [...p.filter((x) => x !== key), key].slice(-4));
  }
  protected openCallout(id: string) {
    const al = this.store.alerts().find((a) => a.id === id);
    if (al) return this.detail.set({ kind: 'alert', a: al });
    const e = this.store.find(id);
    if (e) this.detail.set({ kind: 'entity', e });
  }
  protected zoneClick(id: string) {
    this.selZone.set(this.selZone() === id ? null : id);
    const z = this.store.zones().find((x) => x.id === id);
    if (z && this.selZone()) this.detail.set({ kind: 'zone', z });
  }
  protected pickFloor(id: string) {
    this.store.floor.set(id);
    this.selZone.set(null);
    this.toastMsg(`${floorById(id).name} · ${floorById(id).people} people on floor`);
  }
  protected setBuilding(b: (typeof BUILDINGS)[number]) {
    this.bOpen.set(false);
    this.store.building.set(b);
    this.store.site.set(b.site);
    if (!this.floorList().some((f) => f.id === this.store.floor())) this.store.floor.set('1');
    this.toastMsg(`${b.name} loaded · ${b.floors} floors`);
  }
  protected setSite(s: string) {
    this.store.site.set(s);
    const b = BUILDINGS.find((x) => x.site === s);
    if (b) this.setBuilding(b);
    else this.toastMsg(`${s}: digital twin model is being processed (BIM import 82%)`);
  }
  protected activityClick(ref?: string, floor?: string) {
    if (!ref) return;
    if (floor) this.store.floor.set(floor);
    const al = this.store.alerts().find((a) => a.id === ref);
    if (al) return this.detail.set({ kind: 'alert', a: al });
    const z = this.store.zones().find((x) => x.id === ref);
    if (z) return this.detail.set({ kind: 'zone', z });
    const e = this.store.find(ref);
    if (e) {
      this.detail.set(null);
      this.locate(e);
    }
  }
  protected locate(e: TEntity) {
    this.detail.set(null);
    this.outdoor.set(false);
    this.exploded.set(false);
    this.store.floor.set(e.floor);
    this.selId.set(e.id);
    const key = e.kind === 'asset' ? e.name : e.id;
    if (!this.pinned().includes(key)) this.pinned.update((p) => [...p, key].slice(-4));
    if (e.kind !== 'asset' && e.kind !== 'sensor' && !this.layers()[e.kind as Layer]) this.toggle(e.kind as Layer);
    const [x, y] = this.store.pos(e);
    this.iso()?.focus(x, y, 1.6);
  }
  protected alertLocate(a: TAlert) {
    this.detail.set(null);
    this.store.floor.set(a.floor);
    this.showAlerts.set(true);
    if (!this.pinned().includes(a.id)) this.pinned.update((p) => [...p, a.id].slice(-4));
    this.iso()?.focus(a.x, a.y, 1.6);
  }
  protected showPathFor(e: TEntity) {
    this.pathFor.set(this.pathFor() === e.id ? null : e.id);
    this.showPath.set(true);
    this.detail.set(null);
  }
  protected track(e: TEntity) {
    this.store.focusId.set(e.id);
    this.go(e.kind === 'sensor' ? 'sensor-iot-visualization' : e.kind === 'asset' ? 'asset-visualization' : 'people-asset-location');
  }
  protected maint(e: TEntity) {
    this.store.patchAsset(e.id, { status: 'Maintenance' });
    this.store.log({ icon: 'twin-wrench', color: 'var(--ka-f59e0b)', who: e.name, what: 'Sent to maintenance', ref: e.id, floor: e.floor });
    this.detail.set(null);
    this.toastMsg(`${e.name} flagged for maintenance · work order WO-${4810 + this.store.activity().length}`);
  }
  protected ack(a: TAlert) {
    this.store.acknowledge(a.id);
    this.pinned.update((p) => p.filter((x) => x !== a.id));
    this.detail.set(null);
    this.toastMsg(`${a.title} acknowledged`);
  }
  protected workOrder(a: TAlert) {
    this.store.log({ icon: 'twin-wrench', color: 'var(--ka-2563eb)', who: 'Work order', what: `Raised for ${a.title} · ${a.zone}`, floor: a.floor, ref: a.id });
    this.toastMsg(`Work order WO-${4800 + this.store.activity().length} created and assigned to Facilities`);
  }
  protected go(slug: string) {
    this.router.navigateByUrl(`/digital-twin/${slug}`);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
