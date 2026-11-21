import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { FloorPlan, MapMarker, MapPath } from '@p360/shared/visuals/floor-plan';
import { FLOORS, PEOPLE, PX_PER_M, RPerson, RtlsStore, clock, dist, fmtDur, positionAt, visitsFor } from './rtls.data';

type Tab = 'map' | 'list' | 'zone';
type PTab = 'live' | 'details' | 'history' | 'nearby';

@Component({
  selector: 'app-live-location',
  imports: [...UI, DataTable, FloorPlan, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Live People Location" parent="Real-Time Location Services (RTLS)" parentLink="/real-time-location" subtitle="Real-time view of people location, movement, zones and alerts across your sites.">
      <select class="input head-sel" [value]="mapFloor()" (change)="floor.set($any($event.target).value)">
        @for (f of floors; track f) {<option [value]="f">Head Office - {{ f }}</option>}
      </select>
      <button class="btn-outline icon-only" title="Full screen" (click)="fullscreen()"><app-icon name="maximize" [size]="16" /></button>
      <button class="btn-outline" [class.on]="showZones()" (click)="showZones.set(!showZones())"><app-icon name="map-floor" [size]="16" />Zones</button>
      <button class="btn-outline" [class.on]="heatOn()" (click)="heatOn.set(!heatOn())"><app-icon name="layers" [size]="16" />Heatmap</button>
      <div class="menu-wrap">
        <button class="btn-outline" (click)="menu.set(menu() === 'view' ? null : 'view')"><app-icon name="eye" [size]="16" />View Options</button>
        @if (menu() === 'view') {
          <div class="dropdown right opts">
            <label><input type="checkbox" [checked]="labels()" (change)="labels.set(!labels())" />Zone labels</label>
            <label><input type="checkbox" [checked]="dots()" (change)="dots.set(!dots())" />Show all people (dots)</label>
            @for (t of types; track t) {<label><input type="checkbox" [checked]="typeOn(t)" (change)="toggleType(t)" />{{ t }}s</label>}
          </div>
        }
      </div>
      <div class="menu-wrap">
        <button class="btn-outline icon-only" (click)="menu.set(menu() === 'more' ? null : 'more')"><app-icon name="more" [size]="16" /></button>
        @if (menu() === 'more') {
          <div class="dropdown right">
            <button class="dd-item" (click)="exportCsv()">Export on-site list (CSV)</button>
            <button class="dd-item" (click)="plan()?.reset(); menu.set(null)">Reset map view</button>
            <a class="dd-item" routerLink="/real-time-location/geofences-zones">Manage zones</a>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="People On-Site" [value]="people().length" icon="building" color="var(--ka-7c3aed)" change="6%" sub="vs. last hour" />
      <app-kpi label="In Safe Zones" [value]="safe()" icon="shield-check" color="var(--ka-22c55e)" [sub]="pct(safe()) + '%'" />
      <app-kpi label="In Restricted Zones" [value]="restricted()" icon="triangle-alert" color="var(--ka-f59e0b)" [change]="pct(restricted()) + '%'" [up]="false" [good]="false" sub=" " />
      <app-kpi label="SOS / Alerts" [value]="critical()" icon="siren" color="var(--ka-ef4444)" [sub]="activeCritical() + ' active'" />
      <app-kpi label="Avg. Dwell Time" [value]="avgDwell()" icon="clock" color="var(--ka-3b82f6)" change="12%" />
    </section>

    <section class="lpl" [class.no-panel]="!sel()">
      <div class="card map-card">
        <div class="map-top">
          <div class="seg">
            <button [class.on]="tab() === 'map'" (click)="tab.set('map')">Map View</button>
            <button [class.on]="tab() === 'list'" (click)="tab.set('list')"><app-icon name="list-checks" [size]="15" />List View</button>
            <button [class.on]="tab() === 'zone'" (click)="tab.set('zone')">Zone View</button>
          </div>
          <div class="srch menu-wrap">
            <app-icon name="search" [size]="16" />
            <input placeholder="Search by name, ID, department..." [value]="q()" (input)="q.set($any($event.target).value)" />
            @if (q().trim() && tab() === 'map') {
              <div class="dropdown res">
                @for (p of hits(); track p.id) {<button class="dd-item" (click)="pick(p)"><b>{{ p.name }}</b> <small>{{ p.id }} · {{ p.floor }} · {{ p.zone }}</small></button>}
                @empty {<div class="dd-item muted">No one on site matches</div>}
              </div>
            }
          </div>
          <div class="menu-wrap">
            <button class="btn-outline icon-only" [class.on]="dept() !== 'All'" (click)="menu.set(menu() === 'filter' ? null : 'filter')"><app-icon name="filter" [size]="16" /></button>
            @if (menu() === 'filter') {
              <div class="dropdown right opts">
                <b>Department</b>
                @for (d of depts; track d) {<label><input type="radio" name="dept" [checked]="dept() === d" (change)="dept.set(d)" />{{ d }}</label>}
              </div>
            }
          </div>
        </div>

        @switch (tab()) {
          @case ('map') {
            <div class="map-body">
              <ul class="floors">
                <li [class.on]="floor() === 'All'" (click)="floor.set('All')">All Floors</li>
                @for (f of floors; track f) {<li [class.on]="floor() === f" (click)="floor.set(f)"><span>{{ f }}</span><small>{{ floorCount(f) }}</small></li>}
              </ul>
              <app-floor-plan [zones]="zones()" [markers]="markers()" [paths]="trails()" [heat]="heatOn() ? heat() : null" [callout]="callout()" [selectedId]="selId()" [showLabels]="labels()" [height]="420" (markerClick)="select($event)" (zoneClick)="zoneSel.set($event)">
                <div class="show">
                  <span>Show:</span>
                  <label><input type="checkbox" [checked]="showPeople()" (change)="showPeople.set(!showPeople())" />People</label>
                  <label><input type="checkbox" [checked]="showZones()" (change)="showZones.set(!showZones())" />Zones</label>
                  <label><input type="checkbox" [checked]="showTrail()" (change)="showTrail.set(!showTrail())" /><span class="trail-ic">⋰</span>Movement Trail</label>
                  <label class="red"><input type="checkbox" [checked]="showAlerts()" (change)="showAlerts.set(!showAlerts())" />Alerts</label>
                </div>
              </app-floor-plan>
            </div>
            @if (floor() === 'All') {<p class="muted note">Showing Floor 1 map · pick a floor to switch. List and Zone views include all floors.</p>}
          }
          @case ('list') {
            <app-data-table [rows]="listRows()" [columns]="listCols" noun="people" [pageSize]="10" [searchKeys]="['name', 'id', 'dept', 'zone']" [filters]="listFilters" [activeId]="selId()" (rowClick)="pick($event)" />
          }
          @case ('zone') {
            <div class="zgrid">
              @for (z of zoneStats(); track z.id) {
                <div class="zc" [style.border-left-color]="z.color" (click)="floor.set(z.floor); tab.set('map')">
                  <div class="zh"><b>{{ z.name }}</b><span class="tag" [class]="z.kind === 'restricted' ? 'tag red' : z.kind === 'transit' ? 'tag grey' : 'tag green'">{{ z.kind }}</span></div>
                  <small>{{ z.floor }}</small>
                  <div class="zn"><b>{{ z.count }}</b> / {{ z.capacity }}</div>
                  <div class="bar"><i [style.width.%]="z.util" [style.background]="utilColor(z.util)"></i></div>
                </div>
              }
            </div>
          }
        }
      </div>

      @if (sel(); as p) {
        <aside class="card pp">
          <div class="pp-head">
            <div class="pav" [style.border-color]="p.color" [style.color]="p.color">{{ p.initials }}</div>
            <div class="pinfo">
              <div class="pn"><b>{{ p.name }}</b><span class="dt-status green"><i></i>On-Site</span></div>
              <span>{{ p.id }} <em>|</em> {{ p.role }}</span>
              <span>{{ p.dept }} Department</span>
            </div>
            <button class="close-btn" (click)="selId.set(null)">×</button>
          </div>
          <nav class="ptabs">
            @for (t of ptabs; track t[0]) {<button [class.on]="ptab() === t[0]" (click)="ptab.set(t[0])">{{ t[1] }}</button>}
          </nav>
          @switch (ptab()) {
            @case ('live') {
              <div class="facts">
                <div><app-icon name="map-pin" [size]="22" /><p><small>Current Location</small><b>Head Office - {{ p.floor }}</b><span>{{ zoneLabel(p) }}</span></p></div>
                <div><app-icon name="clock" [size]="22" /><p><small>Since</small><span>{{ sinceAt(p) }} ({{ fmt(p.since) }})</span></p></div>
                <div><app-icon name="trending-up" [size]="22" /><p><small>Last Movement</small><span>{{ movement(p) }}</span></p></div>
                <div><app-icon name="activity" [size]="22" /><p><small>Speed</small><span>{{ speed(p) }}</span></p></div>
              </div>
            }
            @case ('details') {
              <dl class="kv">
                <dt>Type</dt><dd>{{ p.type }}</dd><dt>Department</dt><dd>{{ p.dept }}</dd><dt>Role</dt><dd>{{ p.role }}</dd><dt>Tag</dt><dd>{{ p.tag }}</dd>
                <dt>Tag battery</dt><dd [style.color]="p.battery < 20 ? 'var(--ka-dc2626)' : ''">{{ p.battery }}%</dd><dt>Phone</dt><dd>{{ p.phone }}</dd><dt>Floor</dt><dd>{{ p.floor }}</dd><dt>Zone</dt><dd>{{ p.zone }}</dd>
              </dl>
            }
            @case ('history') {
              <ol class="tl">
                @for (v of visits(); track $index) {<li [class.now]="!v.to"><b>{{ v.zone }}</b><small>{{ v.floor }} · {{ time(v.from) }} – {{ v.to ? time(v.to) : 'now' }} · {{ fmt(v.mins) }}</small></li>}
              </ol>
            }
            @case ('nearby') {
              <ul class="near">
                @for (n of nearby(); track n.p.id) {
                  <li (click)="select(n.p.id)"><span class="sav" [style.background]="n.p.color">{{ n.p.initials }}</span><p><b>{{ n.p.name }}</b><small>{{ n.p.dept }} · {{ n.p.zone }}</small></p><em>{{ n.m }} m</em></li>
                } @empty {<li class="muted">No one within 10 m</li>}
              </ul>
            }
          }
          <div class="pp-btns">
            <button class="btn-primary" (click)="locate(p)"><app-icon name="map-pin" [size]="16" />Locate on Map</button>
            <button class="btn-outline" (click)="history(p)"><app-icon name="history" [size]="16" />View History</button>
          </div>
        </aside>
      }
    </section>

    <section class="bottom">
      <div class="card">
        <div class="card-head"><h3>Live People List (On-Site)</h3><button class="link" (click)="tab.set('list')">View All</button></div>
        <table class="table mini">
          <thead><tr><th>Name</th><th>ID</th><th>Department</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            @for (p of topList(); track p.id) {
              <tr class="clickable" [class.active]="p.id === selId()" (click)="pick(p)">
                <td><span class="nm"><span class="sav" [style.background]="p.color">{{ p.initials }}</span>{{ p.name }}</span></td><td>{{ p.id }}</td><td>{{ p.dept }}</td><td>{{ p.zone }}</td>
                <td><span class="dt-status green"><i></i>On-Site</span></td>
                <td class="menu-wrap"><button class="dots" (click)="$event.stopPropagation(); rowMenu.set(rowMenu() === p.id ? null : p.id)">⋯</button>
                  @if (rowMenu() === p.id) {
                    <div class="dropdown right"><button class="dd-item" (click)="$event.stopPropagation(); rowMenu.set(null); locate(p)">Locate on map</button><button class="dd-item" (click)="$event.stopPropagation(); history(p)">View history</button><button class="dd-item" (click)="$event.stopPropagation(); rowMenu.set(null); ping(p)">Send message to tag</button></div>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Zone Occupancy</h3><button class="link" (click)="tab.set('zone')">View All</button></div>
        <table class="table mini">
          <thead><tr><th>Zone</th><th>People</th><th>Capacity</th><th>Utilization</th></tr></thead>
          <tbody>
            @for (z of occupancy(); track z.id) {
              <tr><td>{{ z.name }}</td><td>{{ z.count }}</td><td>{{ z.capacity }}</td><td><div class="ut"><div class="bar"><i [style.width.%]="z.util" [style.background]="utilColor(z.util)"></i></div><span [style.color]="utilColor(z.util)">{{ z.util }}%</span></div></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent Alerts</h3><a class="link" routerLink="/real-time-location/alerts-notifications">View All</a></div>
        <table class="table mini">
          <thead><tr><th>Time</th><th>Person</th><th>Event</th><th>Location</th></tr></thead>
          <tbody>
            @for (a of recent(); track a.id) {
              <tr class="clickable" (click)="alertClick(a.personId)">
                <td>{{ a.time }}</td>
                <td><span class="al"><i [class]="a.severity === 'Critical' ? 'crit' : 'warn'">!</i>{{ a.person }}</span></td>
                <td><span class="al"><app-icon [name]="a.event.includes('SOS') ? 'siren' : a.event.includes('Prolonged') ? 'clock' : 'triangle-alert'" [size]="15" [style.color]="a.severity === 'Critical' ? 'var(--ka-ef4444)' : 'var(--ka-f59e0b)'" />{{ a.event }}</span></td>
                <td>{{ a.location }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .head-sel { width: auto; min-width: 170px; } .icon-only { padding: 0 10px; min-width: 38px; justify-content: center; } .btn-outline.on { color: var(--primary); border-color: var(--primary); background: var(--kb-faf8ff); }
    .opts { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 190px; font-size: 13px; } .opts label { display: flex; gap: 8px; align-items: center; } .opts input { accent-color: var(--primary); }
    .lpl { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; align-items: start; margin-bottom: 14px; } .lpl.no-panel { grid-template-columns: 1fr; }
    .map-top { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .seg { display: flex; gap: 8px; } .seg button { display: flex; gap: 5px; align-items: center; padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; font: inherit; font-size: 13.5px; }
    .seg button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .srch { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; color: var(--muted); }
    .srch input { border: 0; outline: 0; flex: 1; height: 36px; font: inherit; font-size: 13px; }
    .res { left: 0; right: 0; top: 40px; max-height: 280px; overflow: auto; } .res small { color: var(--muted); }
    .map-body { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 10px; }
    .floors { list-style: none; margin: 0; padding: 6px; border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; align-self: start; }
    .floors li { display: flex; justify-content: space-between; padding: 9px 8px; border-radius: 7px; cursor: pointer; } .floors li:hover { background: var(--kb-f6f5fb); }
    .floors li.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; } .floors small { color: var(--muted); font-size: 10.5px; margin-left: 6px; }
    .show { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); display: flex; gap: 16px; align-items: center; background: var(--kb-ffffff); padding: 8px 14px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); font-size: 12.5px; white-space: nowrap; }
    .show label { display: flex; gap: 6px; align-items: center; cursor: pointer; } .show input { accent-color: var(--primary); } .show .red input { accent-color: var(--kf-ef4444); } .trail-ic { color: var(--kf-3b82f6); font-weight: 700; }
    .note { margin: 8px 0 0; font-size: 12px; }
    .zgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .zc { border: 1px solid var(--border); border-left: 4px solid; border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .zc small { color: var(--muted); }
    .zh { display: flex; justify-content: space-between; align-items: center; } .zn b { font-size: 20px; }
    .bar { height: 7px; border-radius: 4px; background: var(--kb-eef0f6); overflow: hidden; flex: 1; } .bar i { display: block; height: 100%; border-radius: 4px; }
    .pp { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 76px; }
    .pp-head { display: flex; gap: 14px; align-items: flex-start; }
    .pav { width: 66px; height: 66px; border-radius: 12px; border: 3px solid; display: grid; place-items: center; font-size: 22px; font-weight: 700; background: var(--kb-faf8ff); flex: none; }
    .pinfo { flex: 1; display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: var(--kf-4b5068); } .pinfo em { color: var(--border); font-style: normal; margin: 0 4px; }
    .pn { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .pn b { font-size: 18px; color: var(--kf-1f2233); }
    .ptabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); } .ptabs button { flex: 1; padding: 9px 2px; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12.5px; color: var(--kf-4b5068); border-bottom: 2px solid transparent; }
    .ptabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .facts { border: 1px solid var(--border); border-radius: 10px; padding: 6px 14px; } .facts > div { display: flex; gap: 14px; padding: 10px 0; color: var(--kf-4b5068); }
    .facts p { margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .facts small { color: var(--muted); font-size: 12px; } .facts b { font-weight: 600; color: var(--kf-1f2233); }
    .kv { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 13px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--border); max-height: 260px; overflow: auto; font-size: 12.5px; }
    .tl li { position: relative; padding: 0 0 12px 10px; display: flex; flex-direction: column; } .tl li::before { content: ''; position: absolute; left: -20px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--kb-c4c7d4); }
    .tl li.now::before { background: var(--primary); } .tl small { color: var(--muted); }
    .near { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; } .near li { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; font-size: 12.5px; }
    .near p { margin: 0; flex: 1; display: flex; flex-direction: column; } .near small { color: var(--muted); } .near em { font-style: normal; color: var(--primary); font-weight: 600; }
    .sav { width: 26px; height: 26px; border-radius: 50%; color: var(--kf-ffffff); display: inline-grid; place-items: center; font-size: 10.5px; font-weight: 700; flex: none; }
    .pp-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .pp-btns button { justify-content: center; height: 42px; }
    .bottom { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1.05fr); gap: 14px; } .bottom > .card { min-width: 0; overflow-x: auto; }
    .mini { width: 100%; } .mini th, .mini td { font-size: 11.5px; padding: 8px 5px; white-space: nowrap; } .nm { display: flex; gap: 8px; align-items: center; font-weight: 600; }
    .ut { display: flex; gap: 8px; align-items: center; } .ut span { font-size: 11.5px; width: 32px; text-align: right; }
    .al { display: flex; gap: 6px; align-items: center; } .al i { width: 15px; height: 15px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-size: 10px; font-style: normal; font-weight: 800; flex: none; }
    .al .crit { background: var(--kb-ef4444); } .al .warn { background: var(--kb-f59e0b); }
    .dots { border: 0; background: none; cursor: pointer; font-size: 16px; }
    @media (max-width: 1300px) { .bottom { grid-template-columns: 1fr; } }
    @media (max-width: 1100px) { .lpl { grid-template-columns: 1fr; } .pp { position: static; } }
  `,
})
export class LiveLocation {
  private readonly state = inject(AppState);
  private readonly store = inject(RtlsStore);
  private readonly router = inject(Router);
  protected readonly plan = viewChild(FloorPlan);
  protected readonly floors = FLOORS;
  protected readonly types = ['Employee', 'Contractor', 'Visitor'] as const;
  protected readonly depts = ['All', 'IT', 'HR', 'Operations', 'Finance', 'Facilities', 'Production', 'Sales', 'Security', 'Contractor', 'Visitor'];
  protected readonly ptabs: [PTab, string][] = [['live', 'Live Location'], ['details', 'Details'], ['history', 'Location History'], ['nearby', 'Nearby People']];
  protected readonly people = signal<RPerson[]>(PEOPLE);

  protected readonly tab = signal<Tab>('map');
  protected readonly ptab = signal<PTab>('live');
  protected readonly floor = signal('Floor 1');
  protected readonly selId = signal<string | null>('EMP-00123');
  protected readonly zoneSel = signal<string | null>(null);
  protected readonly q = signal('');
  protected readonly dept = signal('All');
  protected readonly hidden = signal<string[]>([]);
  protected readonly menu = signal<string | null>(null);
  protected readonly rowMenu = signal<string | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly showPeople = signal(true);
  protected readonly showZones = signal(true);
  protected readonly showTrail = signal(true);
  protected readonly showAlerts = signal(true);
  protected readonly heatOn = signal(false);
  protected readonly labels = signal(true);
  protected readonly dots = signal(true);

  protected readonly mapFloor = computed(() => (this.floor() === 'All' ? 'Floor 1' : this.floor()));
  protected readonly zones = computed(() => {
    const z = this.store.zones().filter((x) => x.floor === this.mapFloor());
    return this.showZones() ? z : z.map((x) => ({ ...x, fill: 0, color: 'var(--ka-9aa0b4)' }));
  });
  private readonly visible = computed(() => {
    const d = this.dept();
    const h = this.hidden();
    return this.people().filter((p) => (d === 'All' || p.dept === d) && !h.includes(p.type));
  });
  private readonly onFloor = computed(() => this.visible().filter((p) => p.floor === this.mapFloor()));
  private readonly pos = computed(() => {
    const t = this.state.tick();
    return new Map(this.onFloor().map((p) => [p.id, positionAt(p, t)] as const));
  });
  private readonly alertIds = computed(() => new Set(this.store.open().filter((a) => a.severity !== 'Info').map((a) => a.personId)));
  protected readonly markers = computed<MapMarker[]>(() => {
    if (!this.showPeople()) return [];
    const pos = this.pos();
    const al = this.showAlerts() ? this.alertIds() : new Set<string>();
    const out: MapMarker[] = [];
    for (const p of this.onFloor()) {
      const [x, y] = pos.get(p.id)!;
      if (p.featured || p.id === this.selId()) out.push({ id: p.id, x, y, color: al.has(p.id) ? 'var(--ka-ef4444)' : p.color, label: p.initials, alert: al.has(p.id), title: `${p.name} · ${p.zone}` });
      else if (this.dots()) out.push({ id: p.id, x, y, kind: 'dot', color: p.type === 'Contractor' ? 'var(--ka-f97316)' : p.type === 'Visitor' ? 'var(--ka-0d9488)' : 'var(--ka-8b5cf6)', size: 4, title: `${p.name} · ${p.zone}` });
    }
    return out.sort((a, b) => (a.kind === 'dot' ? -1 : 0) - (b.kind === 'dot' ? -1 : 0));
  });
  protected readonly trails = computed<MapPath[]>(() => {
    if (!this.showTrail() || !this.showPeople()) return [];
    const t = this.state.tick();
    return this.onFloor()
      .filter((p) => p.featured)
      .map((p) => ({ points: Array.from({ length: 9 }, (_, k) => positionAt(p, t - (8 - k) * 0.9)), color: p.id === this.selId() ? 'var(--ka-3b82f6)' : 'var(--ka-60a5fa)', dashed: true, width: p.id === this.selId() ? 3 : 2 }));
  });
  protected readonly heat = computed(() => {
    const rows = 14;
    const cols = 25;
    const g = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (const [x, y] of this.pos().values()) {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(((x - 20) / 960) * cols)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(((y - 20) / 520) * rows)));
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (g[r + dr]?.[c + dc] !== undefined) g[r + dr][c + dc] += dr || dc ? 0.4 : 1;
    }
    const m = Math.max(...g.flat(), 1);
    return g.map((row) => row.map((v) => v / m));
  });
  protected readonly sel = computed(() => this.people().find((p) => p.id === this.selId()) ?? null);
  protected readonly callout = computed(() => {
    const p = this.sel();
    if (!p || p.floor !== this.mapFloor() || this.tab() !== 'map') return null;
    const xy = this.pos().get(p.id);
    if (!xy) return null;
    return { x: xy[0], y: xy[1], title: p.name, lines: [p.id, `${p.dept} Department`, clock(new Date())], initials: p.initials, color: p.color };
  });

  protected readonly safe = computed(() => this.people().filter((p) => this.kind(p) === 'safe' || this.kind(p) === 'open').length);
  protected readonly restricted = computed(() => this.people().filter((p) => this.kind(p) === 'restricted').length);
  protected readonly critical = computed(() => this.store.open().filter((a) => a.severity === 'Critical').length);
  protected readonly activeCritical = computed(() => this.store.open().filter((a) => a.severity === 'Critical' && a.status === 'Open').length);
  protected readonly avgDwell = computed(() => {
    const m = Math.round(this.people().reduce((a, p) => a + p.since, 0) / this.people().length);
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  });
  protected readonly hits = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.people().filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.dept.toLowerCase().includes(q)).slice(0, 8);
  });
  protected readonly listRows = computed(() => (this.floor() === 'All' ? this.visible() : this.visible().filter((p) => p.floor === this.floor())).map((p) => ({ ...p, sinceTxt: fmtDur(p.since) })));
  protected readonly listCols: Col[] = [
    { key: 'name', label: 'Name', kind: 'person', sub: 'id' },
    { key: 'type', label: 'Type' },
    { key: 'dept', label: 'Department' },
    { key: 'floor', label: 'Floor' },
    { key: 'zone', label: 'Location' },
    { key: 'sinceTxt', label: 'In zone for' },
    { key: 'battery', label: 'Tag battery', kind: 'progress' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly listFilters = [{ key: 'type', label: 'Type', options: ['Employee', 'Contractor', 'Visitor'] }, { key: 'floor', label: 'Floor', options: FLOORS }];
  protected readonly zoneStats = computed(() =>
    this.store
      .zones()
      .filter((z) => this.floor() === 'All' || z.floor === this.floor())
      .map((z) => {
        const count = this.people().filter((p) => p.zoneId === z.id).length;
        return { ...z, count, util: Math.round((count / z.capacity) * 100) };
      })
      .filter((z) => this.floor() !== 'All' || z.count > 0),
  );
  protected readonly occupancy = computed(() => {
    const order = ['Open Office', 'Meeting Room A', 'Cafeteria', 'Production Area', 'Server Room', 'Reception'];
    const zs = this.store.zones().filter((z) => z.floor === this.mapFloor()).map((z) => ({ ...z, count: this.people().filter((p) => p.zoneId === z.id).length }));
    const sorted = this.mapFloor() === 'Floor 1' ? order.map((n) => zs.find((z) => z.name === n)!) : [...zs].sort((a, b) => b.count - a.count).slice(0, 6);
    return sorted.map((z) => ({ ...z, util: Math.round((z.count / z.capacity) * 100) }));
  });
  protected readonly topList = computed(() => ['EMP-00123', 'EMP-00124', 'EMP-00127', 'EMP-00128', 'EMP-00129'].map((id) => this.people().find((p) => p.id === id)!));
  protected readonly recent = computed(() => this.store.alerts().slice(0, 5));
  protected readonly visits = computed(() => (this.sel() ? visitsFor(this.sel()!) : []));
  protected readonly nearby = computed(() => {
    const p = this.sel();
    if (!p) return [];
    const t = this.state.tick();
    const me = positionAt(p, t);
    return this.people()
      .filter((o) => o.id !== p.id && o.floor === p.floor)
      .map((o) => ({ p: o, m: Math.round((dist(me, positionAt(o, t)) / PX_PER_M) * 10) / 10 }))
      .filter((o) => o.m <= 10)
      .sort((a, b) => a.m - b.m)
      .slice(0, 12);
  });

  private kind(p: RPerson) {
    return this.store.zones().find((z) => z.id === p.zoneId)?.kind;
  }
  protected pct(n: number) {
    return ((n / this.people().length) * 100).toFixed(1);
  }
  protected floorCount(f: string) {
    return this.visible().filter((p) => p.floor === f).length;
  }
  protected typeOn(t: string) {
    return !this.hidden().includes(t);
  }
  protected toggleType(t: string) {
    this.hidden.update((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]));
  }
  protected utilColor(u: number) {
    return u >= 100 ? 'var(--ka-ef4444)' : u >= 80 ? 'var(--ka-22c55e)' : u >= 70 ? 'var(--ka-f59e0b)' : u >= 60 ? 'var(--ka-3b82f6)' : 'var(--ka-8b5cf6)';
  }
  protected fmt = fmtDur;
  protected time(d: Date) {
    return clock(d);
  }
  protected sinceAt(p: RPerson) {
    return clock(new Date(Date.now() - p.since * 60000));
  }
  protected zoneLabel(p: RPerson) {
    return p.zone === 'Open Office' ? 'Open Office - Zone A' : p.zone;
  }
  private towards(p: RPerson) {
    const u = (((this.state.tick() * 0.06) % 2) + 2) % 2;
    return u <= 1 ? 'Meeting Room A' : 'Open Office';
  }
  protected movement(p: RPerson) {
    return p.walker ? `Moving towards ${this.towards(p)}` : `Stationary in ${p.zone}`;
  }
  protected speed(p: RPerson) {
    return p.walker ? '1.2 m/s (Walking)' : '0.1 m/s (Stationary)';
  }
  protected select(id: string) {
    this.selId.set(id);
    this.ptab.set('live');
  }
  protected pick(p: RPerson) {
    this.q.set('');
    if (this.floor() !== 'All') this.floor.set(p.floor);
    this.select(p.id);
  }
  protected locate(p: RPerson) {
    this.tab.set('map');
    this.floor.set(p.floor);
    this.selId.set(p.id);
    setTimeout(() => {
      const [x, y] = positionAt(p, this.state.tick());
      this.plan()?.focus(x, y, 2.2);
    });
  }
  protected history(p: RPerson) {
    this.router.navigate(['/real-time-location/location-history'], { queryParams: { person: p.id } });
  }
  protected alertClick(id: string) {
    const p = this.people().find((x) => x.id === id);
    if (p) this.locate(p);
    else this.router.navigate(['/real-time-location/alerts-notifications']);
  }
  protected ping(p: RPerson) {
    this.msg.set(`Message sent to ${p.name}'s tag (${p.tag})`);
    setTimeout(() => this.msg.set(null), 2200);
  }
  protected fullscreen() {
    (document.querySelector('app-floor-plan .fp') as HTMLElement | null)?.requestFullscreen?.();
  }
  protected exportCsv() {
    this.menu.set(null);
    downloadCsv('rtls-on-site.csv', [['ID', 'Name', 'Type', 'Department', 'Floor', 'Zone', 'Tag', 'Battery'], ...this.people().map((p) => [p.id, p.name, p.type, p.dept, p.floor, p.zone, p.tag, p.battery])]);
  }
}
