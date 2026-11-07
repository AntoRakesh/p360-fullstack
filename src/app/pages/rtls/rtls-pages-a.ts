import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapMarker } from './floor-plan';
import { DEVICES, Device, FLOORS, PEOPLE, PX_PER_M, RAlert, RZone, RtlsStore, clock, fmtDur, visitsFor, zoneOf } from './rtls.data';

const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2200);
};
const PARENT = 'Real-Time Location (RTLS)';
const LINK = '/real-time-location';

/* ======================= Location History ======================= */
@Component({
  selector: 'app-location-history',
  imports: [...UI, FloorPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Location History" [parent]="parent" [parentLink]="link" subtitle="Replay where a person has been today, zone by zone.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <div class="card bar-row">
      <label>Person<input class="input" list="lh-p" [value]="label()" (change)="choose($any($event.target).value)" /><datalist id="lh-p">@for (p of people; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist></label>
      <label>Date<input class="input" type="date" [value]="today" /></label>
      <div class="play">
        <button class="btn-primary icon" (click)="toggle()"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="16" /></button>
        <input type="range" min="0" [max]="visits().length - 1" [value]="idx()" (input)="seek(+$any($event.target).value)" />
        <span>{{ cur().zone }} · {{ time(cur().from) }}</span>
      </div>
    </div>
    <section class="kpi-row">
      <app-kpi label="First Seen" [value]="time(visits()[0].from)" icon="clock" color="#7c3aed" sub="Entrance · Ground Floor" />
      <app-kpi label="Time On Site" [value]="onSite()" icon="calendar-days" color="#22c55e" />
      <app-kpi label="Zones Visited" [value]="zonesCount()" icon="map-floor" color="#f59e0b" />
      <app-kpi label="Distance Walked" [value]="distance() + ' m'" icon="activity" color="#3b82f6" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>{{ person().name }} · {{ cur().floor }}</h3><span class="muted">path for this floor</span></div>
        <app-floor-plan [zones]="zones()" [markers]="marker()" [paths]="path()" [selectedZone]="cur().zoneId" [height]="420" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Timeline</h3></div>
        <ol class="tl">
          @for (v of visits(); track $index; let i = $index) {
            <li [class.on]="i === idx()" (click)="seek(i)"><b>{{ v.zone }}</b><small>{{ v.floor }} · {{ time(v.from) }} – {{ v.to ? time(v.to) : 'now' }} · {{ fmt(v.mins) }}</small></li>
          }
        </ol>
      </div>
    </section>
  `,
  styles: `
    .bar-row { display: flex; gap: 14px; align-items: flex-end; margin-bottom: 14px; flex-wrap: wrap; } .bar-row label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); } .bar-row .input { min-width: 240px; }
    .play { flex: 1; display: flex; gap: 12px; align-items: center; min-width: 300px; } .play input { flex: 1; accent-color: var(--primary); } .play span { font-size: 13px; font-weight: 600; min-width: 190px; } .icon { padding: 0 12px; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--border); max-height: 420px; overflow: auto; font-size: 12.5px; }
    .tl li { position: relative; padding: 4px 6px 10px 10px; display: flex; flex-direction: column; cursor: pointer; border-radius: 6px; } .tl li::before { content: ''; position: absolute; left: -20px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: #c4c7d4; }
    .tl li.on { background: var(--primary-soft); } .tl li.on::before { background: var(--primary); } .tl small { color: var(--muted); }
  `,
})
export class LocationHistory {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(RtlsStore);
  protected readonly people = PEOPLE;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly pid = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('person') ?? 'EMP-00123');
  protected readonly person = computed(() => PEOPLE.find((p) => p.id === this.pid()) ?? PEOPLE[0]);
  protected readonly visits = computed(() => visitsFor(this.person()));
  protected readonly idx = signal(0);
  protected readonly playing = signal(false);
  protected readonly cur = computed(() => this.visits()[Math.min(this.idx(), this.visits().length - 1)]);
  protected readonly zones = computed(() => this.store.zones().filter((z) => z.floor === this.cur().floor));
  private center(id: string): [number, number] {
    const z = zoneOf(id);
    return [Math.round(z.x + z.w / 2), Math.round(z.y + z.h / 2 - 10)];
  }
  protected readonly path = computed(() => {
    const pts = this.visits().slice(0, this.idx() + 1).filter((v) => v.floor === this.cur().floor).map((v) => this.center(v.zoneId));
    return pts.length > 1 ? [{ points: pts, color: '#7c3aed', dashed: true, arrow: true }] : [];
  });
  protected readonly marker = computed<MapMarker[]>(() => {
    const [x, y] = this.center(this.cur().zoneId);
    return [{ id: 'me', x, y, color: '#7c3aed', label: this.person().initials, pulse: true }];
  });
  protected readonly onSite = computed(() => fmtDur(Math.round((Date.now() - this.visits()[0].from.getTime()) / 60000)));
  protected readonly zonesCount = computed(() => new Set(this.visits().map((v) => v.zoneId)).size);
  protected readonly distance = computed(() => {
    const v = this.visits();
    let d = 0;
    for (let i = 1; i < v.length; i++) {
      const a = this.center(v[i - 1].zoneId);
      const b = this.center(v[i].zoneId);
      d += Math.hypot(a[0] - b[0], a[1] - b[1]) / PX_PER_M + (v[i].floor !== v[i - 1].floor ? 25 : 0);
    }
    return Math.round(d).toLocaleString();
  });
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor() {
    this.idx.set(this.visits().length - 1);
    inject(DestroyRef).onDestroy(() => this.timer && clearInterval(this.timer));
  }
  protected label() {
    return `${this.person().id} · ${this.person().name}`;
  }
  protected choose(v: string) {
    const id = v.split(' · ')[0].trim();
    if (!PEOPLE.some((p) => p.id === id)) return;
    this.pid.set(id);
    this.idx.set(this.visits().length - 1);
  }
  protected seek(i: number) {
    this.idx.set(i);
  }
  protected toggle() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.playing.set(false);
      return;
    }
    if (this.idx() >= this.visits().length - 1) this.idx.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      if (this.idx() >= this.visits().length - 1) return this.toggle();
      this.idx.update((i) => i + 1);
    }, 900);
  }
  protected time(d: Date) {
    return clock(d);
  }
  protected fmt = fmtDur;
  protected exportCsv() {
    downloadCsv(`location-history-${this.person().id}.csv`, [['Zone', 'Floor', 'From', 'To', 'Minutes'], ...this.visits().map((v) => [v.zone, v.floor, clock(v.from), v.to ? clock(v.to) : 'now', v.mins])]);
  }
}

/* ======================= Geofences & Zones ======================= */
const KINDS: NonNullable<RZone['kind']>[] = ['safe', 'restricted', 'hazard', 'transit', 'open'];
const KIND_COLOR: Record<string, string> = { safe: '#22c55e', restricted: '#ef4444', hazard: '#f97316', transit: '#64748b', open: '#94a3b8' };

@Component({
  selector: 'app-geofences',
  imports: [...UI, FloorPlan, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Geofences &amp; Zones" [parent]="parent" [parentLink]="link" subtitle="Draw zones on each floor and set who may enter, capacity and dwell limits.">
      <select class="input" [value]="floor()" (change)="floor.set($any($event.target).value); selId.set(null)">@for (f of floors; track f) {<option [value]="f">{{ f }}</option>}</select>
      <button class="btn-primary" [class.on]="draw()" (click)="draw.set(!draw())"><app-icon name="plus" [size]="16" />{{ draw() ? 'Drag on the map…' : 'Draw New Zone' }}</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Zones (all floors)" [value]="store.zones().length" icon="map-floor" color="#7c3aed" />
      <app-kpi label="Restricted Zones" [value]="count('restricted')" icon="ban" color="#ef4444" />
      <app-kpi label="Hazard Zones" [value]="count('hazard')" icon="triangle-alert" color="#f97316" />
      <app-kpi label="Zones With Entry Alerts" [value]="alerting()" icon="bell" color="#3b82f6" />
    </section>
    <section class="gz" [class.with-detail]="!!sel()">
      <div class="card">
        <app-floor-plan [zones]="zones()" [selectedZone]="selId()" [drawMode]="draw()" [height]="440" (zoneClick)="selId.set($event)" (drawn)="add($event)" />
        <p class="muted hint">{{ draw() ? 'Click and drag to draw the zone rectangle.' : 'Click a zone to edit it.' }}</p>
      </div>
      @if (sel(); as z) {
        <form class="card ed" (submit)="$event.preventDefault(); save(z)">
          <div class="card-head"><h3>Edit Zone</h3><button type="button" class="close-btn" (click)="selId.set(null)">×</button></div>
          <label>Name<input class="input" [value]="z.name" (input)="draft.name = $any($event.target).value" /></label>
          <label>Type<select class="input" [value]="z.kind" (change)="draft.kind = $any($event.target).value">@for (k of kinds; track k) {<option [value]="k">{{ k }}</option>}</select></label>
          <div class="two">
            <label>Capacity<input class="input" type="number" [value]="z.capacity" (input)="draft.capacity = +$any($event.target).value" /></label>
            <label>Max dwell (min, 0 = none)<input class="input" type="number" [value]="z.maxDwell" (input)="draft.maxDwell = +$any($event.target).value" /></label>
          </div>
          <label>Allowed groups<input class="input" [value]="z.allowed" (input)="draft.allowed = $any($event.target).value" /></label>
          <label class="chk"><input type="checkbox" [checked]="z.alertOnEntry" (change)="draft.alertOnEntry = $any($event.target).checked" />Alert on entry by anyone not allowed</label>
          <div class="muted">Occupancy now: <b>{{ occ(z.id) }}</b> / {{ z.capacity }}</div>
          <div class="form-actions"><button type="button" class="btn-ghost danger" (click)="remove(z)">Delete</button><button class="btn-primary" type="submit">Save Zone</button></div>
        </form>
      }
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" noun="zones" [searchKeys]="['name']" [activeId]="selId()" (rowClick)="selId.set($event.id)" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .gz { display: grid; grid-template-columns: 1fr; gap: 14px; margin-bottom: 14px; align-items: start; } .gz.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .hint { margin: 8px 0 0; font-size: 12px; } .btn-primary.on { background: #5b21b6; }
    .ed { display: flex; flex-direction: column; gap: 10px; } .ed label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
    .ed .chk { flex-direction: row; align-items: center; gap: 8px; color: inherit; } .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .danger { color: var(--red); }
    @media (max-width: 1100px) { .gz.with-detail { grid-template-columns: 1fr; } }
  `,
})
export class Geofences {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(RtlsStore);
  protected readonly floors = FLOORS;
  protected readonly kinds = KINDS;
  protected readonly floor = signal('Floor 1');
  protected readonly selId = signal<string | null>('Z5-6');
  protected readonly draw = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected draft: Partial<RZone> = {};
  protected readonly zones = computed(() => this.store.zones().filter((z) => z.floor === this.floor()));
  protected readonly sel = computed(() => {
    this.draft = {};
    return this.store.zones().find((z) => z.id === this.selId()) ?? null;
  });
  protected readonly alerting = computed(() => this.store.zones().filter((z) => z.alertOnEntry).length);
  protected readonly rows = computed(() => this.zones().map((z) => ({ ...z, occ: this.occ(z.id), rules: [z.alertOnEntry ? 'Entry alert' : '', z.maxDwell ? `Max ${z.maxDwell} min` : ''].filter(Boolean) })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Zone' },
    { key: 'kind', label: 'Type', kind: 'tag', tag: (r) => (r.kind === 'restricted' ? 'tag red' : r.kind === 'hazard' ? 'tag amber' : r.kind === 'safe' ? 'tag green' : 'tag grey') },
    { key: 'occ', label: 'People', kind: 'num' },
    { key: 'capacity', label: 'Capacity', kind: 'num' },
    { key: 'allowed', label: 'Allowed' },
    { key: 'rules', label: 'Rules', kind: 'chips' },
  ];
  protected count(k: string) {
    return this.store.zones().filter((z) => z.kind === k).length;
  }
  protected occ(id: string) {
    return PEOPLE.filter((p) => p.zoneId === id).length;
  }
  protected save(z: RZone) {
    const c = { ...this.draft };
    if (c.kind) c.color = KIND_COLOR[c.kind];
    this.store.updateZone(z.id, c);
    this.draft = {};
    toast(this.msg, `${c.name ?? z.name} saved · live map updated`);
  }
  protected add(r: { x: number; y: number; w: number; h: number }) {
    const id = `ZN-${Date.now() % 100000}`;
    this.store.zones.update((l) => [...l, { id, floor: this.floor(), name: `New Zone ${l.length + 1}`, ...r, color: KIND_COLOR['hazard'], kind: 'hazard', capacity: 10, alertOnEntry: true, maxDwell: 0, allowed: 'Everyone' }]);
    this.draw.set(false);
    this.selId.set(id);
    toast(this.msg, 'Zone created · set its name and rules');
  }
  protected remove(z: RZone) {
    this.store.zones.update((l) => l.filter((x) => x.id !== z.id));
    this.selId.set(null);
    toast(this.msg, `${z.name} deleted`);
  }
}

/* ======================= Alerts & Notifications ======================= */
@Component({
  selector: 'app-rtls-alerts',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Alerts &amp; Notifications" [parent]="parent" [parentLink]="link" subtitle="Location alerts raised by zone rules, wearables and tags — and who gets notified." />
    <section class="kpi-row">
      <app-kpi label="Open Critical" [value]="n('Critical', 'Open')" icon="siren" color="#ef4444" />
      <app-kpi label="Open Warnings" [value]="n('Warning', 'Open')" icon="triangle-alert" color="#f59e0b" />
      <app-kpi label="Acknowledged" [value]="byStatus('Acknowledged')" icon="user-check" color="#3b82f6" />
      <app-kpi label="Resolved Today" [value]="byStatus('Resolved')" icon="shield-check" color="#22c55e" />
    </section>
    <div class="tabs-row"><button [class.on]="tab() === 'a'" (click)="tab.set('a')">Alerts</button><button [class.on]="tab() === 'r'" (click)="tab.set('r')">Alert Rules</button></div>
    @if (tab() === 'a') {
      <div class="card">
        <app-data-table [rows]="store.alerts()" [columns]="cols" [filters]="filters" [actions]="actions" [bulkActions]="bulk" [selectable]="true" noun="alerts" [searchKeys]="['person', 'event', 'location']"
          (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
      </div>
    } @else {
      <div class="card">
        @for (r of store.rules(); track r.id) {
          <div class="rule">
            <button class="sw" [class.on]="r.enabled" (click)="toggle(r.id)"><i></i></button>
            <div class="rt"><b>{{ r.name }}</b><small>{{ r.trigger }}</small></div>
            <span class="tag" [class]="r.severity === 'Critical' ? 'tag red' : r.severity === 'Warning' ? 'tag amber' : 'tag blue'">{{ r.severity }}</span>
            <div class="ch">@for (c of channels; track c) {<label><input type="checkbox" [checked]="r.channels.includes(c)" (change)="chan(r.id, c)" />{{ c }}</label>}</div>
          </div>
        }
      </div>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .tabs-row { display: flex; gap: 6px; margin-bottom: 12px; } .tabs-row button { padding: 8px 18px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; font: inherit; }
    .tabs-row button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .rule { display: flex; gap: 14px; align-items: center; padding: 12px 4px; border-bottom: 1px solid #f0f1f6; font-size: 13px; } .rt { flex: 1; display: flex; flex-direction: column; } .rt small { color: var(--muted); }
    .ch { display: flex; gap: 10px; font-size: 12px; } .ch label { display: flex; gap: 4px; align-items: center; } .ch input { accent-color: var(--primary); }
    .sw { width: 38px; height: 22px; border-radius: 11px; border: 0; background: #d5d7e0; position: relative; cursor: pointer; flex: none; } .sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.15s; }
    .sw.on { background: var(--primary); } .sw.on i { left: 19px; }
  `,
})
export class RtlsAlerts {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(RtlsStore);
  private readonly router = inject(Router);
  protected readonly tab = signal<'a' | 'r'>('a');
  protected readonly msg = signal<string | null>(null);
  protected readonly channels = ['Push', 'SMS', 'Email', 'Control room', 'PA'];
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => (r.severity === 'Critical' ? 'tag red' : r.severity === 'Warning' ? 'tag amber' : 'tag blue') },
    { key: 'event', label: 'Event' },
    { key: 'person', label: 'Person', sub: 'personId' },
    { key: 'location', label: 'Location', sub: 'floor' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'note', label: 'Note' },
  ];
  protected readonly filters = [{ key: 'severity', label: 'Severity', options: ['Critical', 'Warning', 'Info'] }, { key: 'status', label: 'Status', options: ['Open', 'Acknowledged', 'Resolved'] }, { key: 'floor', label: 'Floor', options: FLOORS }];
  protected readonly actions: RowAction[] = [
    { id: 'Acknowledged', label: 'Acknowledge', icon: 'user-check', when: (r) => r.status === 'Open' },
    { id: 'Resolved', label: 'Resolve', icon: 'shield-check', when: (r) => r.status !== 'Resolved' },
    { id: 'locate', label: 'Show on live map', icon: 'map-pin' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Acknowledged', label: 'Acknowledge' }, { id: 'Resolved', label: 'Resolve' }];
  protected n(sev: string, st: string) {
    return this.store.alerts().filter((a) => a.severity === sev && a.status === st).length;
  }
  protected byStatus(st: string) {
    return this.store.alerts().filter((a) => a.status === st).length;
  }
  protected act(a: string, ids: string[]) {
    if (a === 'locate') return this.router.navigate(['/real-time-location/live-people-location']);
    ids.forEach((id) => this.store.setStatus(id, a as RAlert['status'], `${a} by Demo login ${clock(new Date())}`));
    toast(this.msg, `${ids.length} alert(s) ${a.toLowerCase()}`);
    return;
  }
  protected toggle(id: string) {
    this.store.rules.update((l) => l.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }
  protected chan(id: string, c: string) {
    this.store.rules.update((l) => l.map((r) => (r.id === id ? { ...r, channels: r.channels.includes(c) ? r.channels.filter((x) => x !== c) : [...r.channels, c] } : r)));
  }
}

/* ======================= RTLS Devices & Tags ======================= */
@Component({
  selector: 'app-rtls-devices',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="RTLS Devices &amp; Tags" [parent]="parent" [parentLink]="link" subtitle="UWB anchors, BLE gateways and the wearable tags people carry." />
    <section class="kpi-row">
      <app-kpi label="Anchors Online" [value]="online('UWB Anchor')" icon="router" color="#7c3aed" />
      <app-kpi label="Gateways Online" [value]="online('BLE Gateway')" icon="wifi" color="#3b82f6" />
      <app-kpi label="Tags In Use" [value]="inUse()" icon="id-card" color="#22c55e" [sub]="spare() + ' spare in stock'" />
      <app-kpi label="Low Battery Tags" [value]="low()" icon="battery" color="#f59e0b" />
      <app-kpi label="Offline Devices" [value]="offline()" icon="ban" color="#ef4444" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Tag Battery Levels</h3></div>
        <app-column-chart [labels]="bands" [series]="battery()" [height]="190" [legend]="false" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Device Types</h3></div>
        <app-donut [segments]="types()" center="Devices" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" [actions]="actions" noun="devices" [pageSize]="12" [searchKeys]="['id', 'assigned', 'zone']" (action)="act($event.action, $event.row)" />
      </div>
    </section>
    @if (assignFor(); as d) {
      <div class="g-overlay" (click)="assignFor.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); assign(d, who.value)">
        <div class="modal-head"><h3>Assign {{ d.id }}</h3><button type="button" class="close-btn" (click)="assignFor.set(null)">×</button></div>
        <label>Person<input #who class="input" list="tag-p" required /><datalist id="tag-p">@for (p of people; track p.id) {<option [value]="p.name + ' (' + p.id + ')'"></option>}</datalist></label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="assignFor.set(null)">Cancel</button><button class="btn-primary" type="submit">Assign</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class RtlsDevices {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly people = PEOPLE;
  protected readonly list = signal<Device[]>(DEVICES.map((d) => ({ ...d })));
  protected readonly assignFor = signal<Device | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly bands = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'];
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Device' },
    { key: 'type', label: 'Type' },
    { key: 'assigned', label: 'Assigned to' },
    { key: 'floor', label: 'Floor', sub: 'zone' },
    { key: 'battery', label: 'Battery', kind: 'progress' },
    { key: 'signal', label: 'Signal', kind: 'num', fmt: (v) => (v ? `${v}%` : '—') },
    { key: 'lastSeen', label: 'Last seen' },
    { key: 'firmware', label: 'Firmware' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'type', label: 'Type', options: ['UWB Anchor', 'BLE Gateway', 'Badge Tag', 'Wristband', 'Helmet Tag', 'Asset Tag'] }, { key: 'status', label: 'Status', options: ['Online', 'Offline', 'Low Battery'] }, { key: 'floor', label: 'Floor', options: FLOORS }];
  protected readonly actions: RowAction[] = [
    { id: 'ping', label: 'Ping / locate', icon: 'wifi' },
    { id: 'battery', label: 'Battery replaced', icon: 'battery', when: (r) => r.battery < 100 && !r.type.includes('Anchor') && !r.type.includes('Gateway') },
    { id: 'assign', label: 'Assign to person', icon: 'user-plus', when: (r) => r.assigned === 'Unassigned' },
    { id: 'unassign', label: 'Unassign', icon: 'ban', danger: true, when: (r) => r.assigned !== 'Unassigned' && r.assigned !== '—' },
    { id: 'reboot', label: 'Reboot', icon: 'refresh', when: (r) => r.type === 'UWB Anchor' || r.type === 'BLE Gateway' },
  ];
  protected readonly battery = computed(() => [{ name: 'Tags', color: '#7c3aed', values: [0, 20, 40, 60, 80].map((b) => this.list().filter((d) => !d.type.includes('Anchor') && !d.type.includes('Gateway') && d.battery >= b && (d.battery < b + 20 || (b === 80 && d.battery <= 100))).length) }]);
  protected readonly types = computed(() => ['UWB Anchor', 'BLE Gateway', 'Badge Tag', 'Wristband', 'Helmet Tag', 'Asset Tag'].map((t, i) => ({ label: t, value: this.list().filter((d) => d.type === t).length, color: ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#64748b'][i] })));
  protected readonly inUse = computed(() => this.list().filter((d) => d.assigned.includes('(')).length);
  protected readonly spare = computed(() => this.list().filter((d) => d.assigned === 'Unassigned').length);
  protected readonly low = computed(() => this.list().filter((d) => d.status === 'Low Battery').length);
  protected readonly offline = computed(() => this.list().filter((d) => d.status === 'Offline').length);
  protected online(t: string) {
    const all = this.list().filter((d) => d.type === t);
    return `${all.filter((d) => d.status === 'Online').length}/${all.length}`;
  }
  private patch(id: string, c: Partial<Device>) {
    this.list.update((l) => l.map((d) => (d.id === id ? { ...d, ...c } : d)));
  }
  protected act(a: string, d: Device) {
    if (a === 'assign') return this.assignFor.set(d);
    if (a === 'battery') this.patch(d.id, { battery: 100, status: d.status === 'Low Battery' ? 'Online' : d.status });
    if (a === 'unassign') this.patch(d.id, { assigned: 'Unassigned', floor: 'Ground Floor', zone: 'Security Desk' });
    if (a === 'reboot') this.patch(d.id, { status: 'Online', signal: 92, lastSeen: 'just now' });
    toast(this.msg, a === 'ping' ? `${d.id} responded · ${d.floor}, ${d.zone}` : `${d.id} updated`);
  }
  protected assign(d: Device, who: string) {
    this.patch(d.id, { assigned: who, status: 'Online', lastSeen: 'just now', signal: 80 });
    this.assignFor.set(null);
    toast(this.msg, `${d.id} assigned to ${who}`);
  }
}
