import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { FloorPlan } from '@p360/shared/visuals/floor-plan';
import { E_BUILDING, E_ZONES, EPerson, EmergencyStore, fmtClock, fmtTimer, mapXY, musterStatus } from './emergency.data';
import { EmergencyModals } from './emergency-modals';

const PARENT = 'Emergency & Mustering';
const LINK = '/emergency-mustering';
const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2400);
};
const stTag = (s: string) => (s === 'Evacuated' ? 'tag green' : s === 'Missing' ? 'tag red' : 'tag amber');

/* ======================= Active Evacuations ======================= */
@Component({
  selector: 'app-active-evacuations',
  imports: [...UI, EmergencyModals, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Active Evacuations" [parent]="parent" [parentLink]="link" subtitle="Progress, floor clearance and the full event log for the running evacuation.">
      <button class="btn-primary" (click)="m.open('broadcast')"><app-icon name="megaphone" [size]="16" />Broadcast</button>
      <button class="btn-outline" (click)="m.open('trigger')"><app-icon name="siren" [size]="16" />New Evacuation</button>
    </app-page-head>
    @if (store.evac(); as e) {
      <div class="card hero" [class.done]="e.endedAt">
        <div class="h1"><span class="ic"><app-icon [name]="e.endedAt ? 'shield-check' : 'siren'" [size]="26" /></span>
          <div><b>{{ e.id }} · {{ e.type }}{{ e.drill ? ' (Drill)' : '' }}</b><span>{{ e.location }} · {{ e.scope }}</span><small>Triggered {{ clock(e.triggeredAt) }} by {{ e.by }}</small></div>
        </div>
        <div class="tm"><small>{{ e.endedAt ? 'Total duration' : 'Elapsed' }}</small><b>{{ timer() }}</b></div>
        <div class="pg"><div class="bar"><i class="g" [style.width.%]="pct(c().evac)"></i><i class="a" [style.width.%]="pct(c().yet)"></i><i class="r" [style.width.%]="pct(c().missing)"></i></div>
          <small>{{ c().evac }} evacuated · {{ c().yet }} yet to evacuate · {{ c().missing }} missing · {{ c().total }} on site</small></div>
        @if (!e.endedAt) {<button class="btn-ok" (click)="clear()"><app-icon name="shield-check" [size]="16" />Declare All Clear</button>}
      </div>
    }
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Floor Clearance</h3><span class="muted">warden sweep status</span></div>
        <table class="table">
          <thead><tr><th>Floor</th><th>Remaining</th><th>Missing</th><th>Warden</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (f of floors(); track f.floor) {
              <tr><td><b>{{ f.floor }}</b></td><td>{{ f.yet }}</td><td [style.color]="f.missing ? 'var(--ka-dc2626)' : ''">{{ f.missing }}</td><td>{{ f.warden }}</td>
                <td><span class="tag" [class]="f.yet + f.missing === 0 ? 'tag green' : 'tag amber'">{{ f.yet + f.missing === 0 ? 'Cleared' : 'Sweeping' }}</span></td>
                <td>@if (f.yet) {<button class="btn-ghost sm" (click)="sweep(f.floor)">Mark swept ({{ f.yet }} out)</button>}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Event Log</h3><span class="muted">{{ store.events().length }} events</span></div>
        <ol class="log">
          @for (ev of store.events(); track $index) {<li><span class="d" [style.background]="ev.color"><app-icon [name]="ev.icon" [size]="13" /></span><p><b>{{ ev.event }}</b><small>{{ clock(ev.at) }} · {{ ev.location }} · {{ ev.source }}</small></p></li>}
        </ol>
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Previous Evacuations</h3><a class="link" routerLink="/emergency-mustering/incidents-reports">Reports</a></div>
        <table class="table">
          <thead><tr><th>ID</th><th>Type</th><th>Location</th><th>Date</th><th>Duration</th><th>Kind</th></tr></thead>
          <tbody>@for (h of store.history(); track h.id) {<tr><td>{{ h.id }}</td><td>{{ h.type }}</td><td>{{ h.location }}</td><td>{{ date(h.triggeredAt) }}</td><td>{{ dur(h) }}</td><td><span class="tag" [class]="h.drill ? 'tag blue' : 'tag red'">{{ h.drill ? 'Drill' : 'Real' }}</span></td></tr>}</tbody>
        </table>
      </div>
    </section>
    <app-emergency-modals #m />
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .hero { display: grid; grid-template-columns: minmax(0, 1.4fr) 140px minmax(0, 1.4fr) auto; gap: 20px; align-items: center; margin-bottom: 14px; border-left: 5px solid var(--kl-ef4444); } .hero.done { border-left-color: var(--kl-22c55e); }
    .h1 { display: flex; gap: 12px; align-items: center; } .h1 div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .h1 b { font-size: 16px; } .h1 small { color: var(--muted); }
    .ic { width: 50px; height: 50px; border-radius: 12px; background: var(--kb-ef4444); color: var(--kf-ffffff); display: grid; place-items: center; flex: none; } .done .ic { background: var(--kb-22c55e); }
    .tm { display: flex; flex-direction: column; } .tm small { color: var(--muted); font-size: 12px; } .tm b { font-size: 26px; font-variant-numeric: tabular-nums; }
    .pg small { color: var(--muted); font-size: 12px; } .bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--kb-eef0f6); margin-bottom: 6px; } .bar .g { background: var(--kb-22c55e); } .bar .a { background: var(--kb-f59e0b); } .bar .r { background: var(--kb-ef4444); }
    .btn-ok { display: inline-flex; gap: 6px; align-items: center; height: 40px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--kb-16a34a); color: var(--kf-ffffff); font: inherit; font-weight: 600; cursor: pointer; }
    .log { list-style: none; margin: 0; padding: 0; max-height: 330px; overflow: auto; } .log li { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .log p { margin: 0; display: flex; flex-direction: column; } .log small { color: var(--muted); } .d { width: 24px; height: 24px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; flex: none; }
    @media (max-width: 1200px) { .hero { grid-template-columns: 1fr; } }
  `,
})
export class ActiveEvacuations {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(EmergencyStore);
  protected readonly c = this.store.counts;
  protected readonly msg = signal<string | null>(null);
  private readonly wardens: Record<string, string> = { 'Ground Floor': 'Khalid Saeed', 'Floor 1': 'Tom Baker', 'Floor 2': 'Grace Park', 'Floor 3': 'Ravi Shankar', 'Floor 4': 'Aisha Bello', 'Floor 5': 'Kenji Sato' };
  protected readonly timer = computed(() => {
    const e = this.store.evac();
    return e ? fmtTimer((e.endedAt ?? this.store.now()) - e.triggeredAt) : '—';
  });
  protected readonly floors = computed(() =>
    Object.keys(this.wardens).map((floor) => {
      const ps = this.store.people().filter((p) => p.floor === floor);
      return { floor, yet: ps.filter((p) => p.status === 'Yet to Evacuate').length, missing: ps.filter((p) => p.status === 'Missing').length, warden: this.wardens[floor] };
    }),
  );
  protected pct(n: number) {
    return (n / this.c().total) * 100;
  }
  protected clock = fmtClock;
  protected date(t: number) {
    return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  protected dur(h: { triggeredAt: number; endedAt?: number }) {
    return h.endedAt ? fmtTimer(h.endedAt - h.triggeredAt) : 'running';
  }
  protected sweep(floor: string) {
    const ids = this.store.people().filter((p) => p.floor === floor && p.status === 'Yet to Evacuate').map((p) => p.id);
    this.store.markSafe(ids, `Warden ${this.wardens[floor]}`);
    this.store.log(`${floor} swept & cleared`, floor, `Warden ${this.wardens[floor]}`, 'run', 'var(--ka-22c55e)');
    toast(this.msg, `${floor} swept · ${ids.length} people escorted out`);
  }
  protected clear() {
    this.store.allClear();
    toast(this.msg, 'All clear declared');
  }
}

/* ======================= Muster Points ======================= */
@Component({
  selector: 'app-muster-points',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Muster Points" [parent]="parent" [parentLink]="link" subtitle="Assembly points, their wardens and who has checked in at each.">
      <button class="btn-primary" (click)="adding.set(true)"><app-icon name="plus" [size]="16" />Add Muster Point</button>
    </app-page-head>
    <section class="mgrid">
      @for (m of store.musters(); track m.id) {
        @let st = status(m);
        <div class="card mp" [class.on]="sel() === m.id" (click)="sel.set(m.id)">
          <div class="top"><span class="letter">{{ m.id }}</span><div><b>{{ m.name }}</b><small>{{ m.location }} · {{ m.lat }}</small></div><span class="tag" [class]="st === 'Complete' ? 'tag green' : st === 'In Progress' ? 'tag amber' : 'tag red'">{{ st }}</span></div>
          <div class="mid"><app-ring [value]="ratio(m)" [color]="st === 'Complete' ? 'var(--ka-22c55e)' : st === 'In Progress' ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'" [size]="64" /><div><b>{{ m.present }}</b> / {{ m.expected }}<small>present / expected</small></div></div>
          <div class="ft"><span><app-icon name="user-check" [size]="14" />{{ m.warden }}</span><span>Cap. {{ m.capacity }}</span></div>
          <button class="btn-ghost sm" (click)="$event.stopPropagation(); scan(m.id)">Badge check-in</button>
        </div>
      }
    </section>
    <div class="card">
      <div class="card-head"><h3>Checked in at Muster Point {{ sel() }}</h3></div>
      <app-data-table [rows]="atMuster()" [columns]="cols" noun="people" [searchKeys]="['name', 'id', 'dept']" [pageSize]="10" />
    </div>
    @if (adding()) {
      <div class="g-overlay" (click)="adding.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add(n.value, l.value, w.value, +c.value)">
        <div class="modal-head"><h3>Add Muster Point</h3><button type="button" class="close-btn" (click)="adding.set(false)">×</button></div>
        <div class="form-grid">
          <label>Location<input #n class="input" required placeholder="e.g. Staff Car Park" /></label>
          <label>Landmark<input #l class="input" placeholder="Beside Gate 4" /></label>
          <label>Warden<input #w class="input" value="Tom Baker" /></label>
          <label>Capacity<input #c class="input" type="number" value="120" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="adding.set(false)">Cancel</button><button class="btn-primary" type="submit">Add</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .mp { display: flex; flex-direction: column; gap: 10px; cursor: pointer; } .mp.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .top { display: flex; gap: 10px; align-items: center; } .top div { flex: 1; display: flex; flex-direction: column; font-size: 13px; } .top small { color: var(--muted); font-size: 11.5px; }
    .letter { width: 36px; height: 36px; border-radius: 50%; background: var(--kb-16a34a); color: var(--kf-ffffff); display: grid; place-items: center; font-weight: 700; }
    .mid { display: flex; gap: 14px; align-items: center; } .mid div { display: flex; flex-direction: column; font-size: 13px; } .mid b { font-size: 24px; } .mid small { color: var(--muted); }
    .ft { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); } .ft span { display: flex; gap: 4px; align-items: center; } .mp button { align-self: flex-start; }
  `,
})
export class MusterPoints {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(EmergencyStore);
  protected readonly sel = signal('A');
  protected readonly adding = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected readonly status = musterStatus;
  protected readonly atMuster = computed(() => this.store.people().filter((p) => p.muster === this.sel()));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'type', label: 'Type' },
    { key: 'floor', label: 'Came from', sub: 'zone' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => stTag(r.status) },
  ];
  protected ratio(m: { present: number; expected: number }) {
    return Math.min(100, Math.round((m.present / m.expected) * 100));
  }
  protected scan(id: string) {
    const p = this.store.people().find((x) => x.status === 'Yet to Evacuate');
    if (!p) return toast(this.msg, 'Everyone is already accounted for');
    this.store.people.update((l) => l.map((x) => (x.id === p.id ? { ...x, muster: id } : x)));
    this.store.markSafe([p.id], `Badge reader MP-${id}`);
    toast(this.msg, `${p.name} checked in at Muster Point ${id}`);
  }
  protected add(location: string, lat: string, warden: string, capacity: number) {
    const id = String.fromCharCode(65 + this.store.musters().length);
    this.store.musters.update((l) => [...l, { id, name: `Muster Point ${id}`, location, lat, warden, capacity, expected: 0, present: 0 }]);
    this.adding.set(false);
    this.sel.set(id);
    toast(this.msg, `Muster Point ${id} added`);
  }
}

/* ======================= Accountability ======================= */
@Component({
  selector: 'app-accountability',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Accountability" [parent]="parent" [parentLink]="link" subtitle="Live roll-call of everyone on site — mark people safe or missing." />
    <section class="kpi-row">
      <app-kpi label="Accounted For" [value]="acc() + '%'" icon="user-check" color="var(--ka-22c55e)" [sub]="c().evac + ' of ' + c().total" />
      <app-kpi label="Yet to Evacuate" [value]="c().yet" icon="run" color="var(--ka-f59e0b)" />
      <app-kpi label="Missing" [value]="c().missing" icon="triangle-alert" color="var(--ka-ef4444)" />
      <app-kpi label="Visitors & Contractors" [value]="vc()" icon="hard-hat" color="var(--ka-7c3aed)" [sub]="vcSafe() + ' safe'" />
    </section>
    <div class="card">
      <app-data-table [rows]="store.people()" [columns]="cols" [filters]="filters" [actions]="actions" [bulkActions]="bulk" [selectable]="true" noun="people" [pageSize]="15"
        [searchKeys]="['name', 'id', 'dept', 'zone']" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class Accountability {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(EmergencyStore);
  protected readonly c = this.store.counts;
  protected readonly msg = signal<string | null>(null);
  protected readonly acc = computed(() => ((this.c().evac / this.c().total) * 100).toFixed(1));
  protected readonly vc = computed(() => this.store.people().filter((p) => p.type !== 'Employee').length);
  protected readonly vcSafe = computed(() => this.store.people().filter((p) => p.type !== 'Employee' && p.status === 'Evacuated').length);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => stTag(r.status) },
    { key: 'muster', label: 'Muster', fmt: (v) => (v ? `MP ${v}` : '—') },
    { key: 'floor', label: 'Last seen', sub: 'zone' },
    { key: 'phone', label: 'Phone' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Evacuated', 'Yet to Evacuate', 'Missing'] },
    { key: 'dept', label: 'Department', options: ['Administration', 'IT', 'Finance', 'Operations', 'HR', 'Facilities', 'Contractors & Visitors'] },
    { key: 'muster', label: 'Muster', options: ['A', 'B', 'C', 'D', 'E', 'F'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'safe', label: 'Mark safe', icon: 'shield-check', when: (r) => r.status !== 'Evacuated' },
    { id: 'missing', label: 'Mark missing', icon: 'triangle-alert', danger: true, when: (r) => r.status === 'Yet to Evacuate' },
    { id: 'call', label: 'Call', icon: 'phone' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'safe', label: 'Mark safe' }];
  protected act(a: string, ids: string[]) {
    if (a === 'call') return toast(this.msg, `Calling ${this.store.people().find((p) => p.id === ids[0])?.phone}…`);
    if (a === 'safe') this.store.markSafe(ids);
    else ids.forEach((id) => this.store.markMissing(id));
    toast(this.msg, `${ids.length} person(s) marked ${a}`);
  }
}

/* ======================= Missing Persons ======================= */
@Component({
  selector: 'app-missing-persons',
  imports: [...UI, FloorPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Missing Persons" [parent]="parent" [parentLink]="link" subtitle="People not yet accounted for, with their last known location from RTLS and access logs." />
    <section class="mp">
      <div class="list">
        @for (p of missing(); track p.id) {
          <div class="card mc" [class.on]="p.id === sel()?.id" (click)="selId.set(p.id)">
            <span class="av">{{ p.initials }}</span>
            <div class="info"><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.dept }} · {{ p.type }}</small><small class="ls"><app-icon name="map-pin" [size]="12" />{{ p.floor }} · {{ p.zone }} · {{ p.lastSeen }} min ago</small>
              @if (p.note) {<small class="nt">{{ p.note }}</small>}</div>
          </div>
        } @empty {<div class="card ok">✓ Everyone is accounted for</div>}
      </div>
      <div class="card">
        @if (sel(); as p) {
          <div class="card-head"><h3>Last known location · {{ p.floor }}</h3><span class="muted">{{ p.zone }}</span></div>
          <app-floor-plan [zones]="zones" [building]="building" [markers]="marker()" [callout]="{ x: xy()[0], y: xy()[1], title: p.name, lines: ['Last seen ' + p.lastSeen + ' min ago', p.zone], initials: p.initials, color: 'var(--ka-ef4444)' }" [height]="380" />
          <div class="acts">
            <button class="btn-outline" (click)="call(p)"><app-icon name="phone" [size]="15" />Call {{ p.phone }}</button>
            <button class="btn-outline" (click)="dispatch(p)"><app-icon name="users" [size]="15" />Dispatch Search Team</button>
            <button class="btn-primary" (click)="found(p)"><app-icon name="shield-check" [size]="15" />Found Safe</button>
          </div>
        }
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .mp { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 14px; align-items: start; } .list { display: flex; flex-direction: column; gap: 8px; max-height: 560px; overflow: auto; }
    .mc { display: flex; gap: 10px; align-items: center; padding: 12px; cursor: pointer; border-left: 4px solid var(--kl-ef4444); } .mc.on { background: var(--kb-fef2f2); }
    .av { width: 40px; height: 40px; border-radius: 50%; background: var(--kb-fee2e2); color: var(--kf-dc2626); display: grid; place-items: center; font-weight: 700; flex: none; }
    .info { display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .info small { color: var(--muted); font-size: 11.5px; } .ls { display: flex; gap: 4px; align-items: center; color: var(--kf-dc2626) !important; } .nt { color: var(--kf-d97706) !important; }
    .ok { color: var(--kf-16a34a); font-weight: 600; } .acts { display: flex; gap: 10px; margin-top: 12px; justify-content: flex-end; }
    @media (max-width: 1100px) { .mp { grid-template-columns: 1fr; } }
  `,
})
export class MissingPersons {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly store = inject(EmergencyStore);
  protected readonly zones = E_ZONES;
  protected readonly building = E_BUILDING;
  protected readonly msg = signal<string | null>(null);
  protected readonly missing = computed(() => this.store.people().filter((p) => p.status === 'Missing'));
  protected readonly selId = signal<string | null>(null);
  protected readonly sel = computed(() => this.missing().find((p) => p.id === this.selId()) ?? this.missing()[0] ?? null);
  protected readonly xy = computed(() => (this.sel() ? mapXY(this.sel()!) : [0, 0]));
  protected readonly marker = computed(() => (this.sel() ? [{ id: 'm', x: this.xy()[0], y: this.xy()[1], color: 'var(--ka-ef4444)', label: this.sel()!.initials, pulse: true, alert: true }] : []));
  protected call(p: EPerson) {
    toast(this.msg, `Calling ${p.name} on ${p.phone}… no answer, voicemail left`);
  }
  protected dispatch(p: EPerson) {
    this.store.people.update((l) => l.map((x) => (x.id === p.id ? { ...x, note: `Search team dispatched ${fmtClock(Date.now())}` } : x)));
    this.store.log(`Search team dispatched for ${p.name}`, `${p.floor} · ${p.zone}`, 'Demo login', 'users', 'var(--ka-f59e0b)');
    toast(this.msg, `Search & rescue team sent to ${p.floor}, ${p.zone}`);
  }
  protected found(p: EPerson) {
    this.store.markSafe([p.id], 'Search team');
    this.store.log(`${p.name} found safe`, `${p.floor} · ${p.zone}`, 'Search team', 'shield-check', 'var(--ka-22c55e)');
    this.selId.set(null);
    toast(this.msg, `${p.name} found safe`);
  }
}

/* ======================= Zones & Areas ======================= */
@Component({
  selector: 'app-emergency-zones',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Zones &amp; Areas" [parent]="parent" [parentLink]="link" subtitle="Evacuation zones per floor — exits, wardens and live clearance." />
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>People Remaining by Floor</h3></div>
        <app-bar-list [rows]="byFloor()" [max]="maxFloor()" />
      </div>
      <div class="card span-8">
        <table class="table">
          <thead><tr><th>Floor</th><th>Zone</th><th>Primary exit</th><th>Muster</th><th>Remaining</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (z of rows(); track z.key) {
              <tr><td>{{ z.floor }}</td><td><b>{{ z.zone }}</b></td><td>{{ z.exit }}</td><td>MP {{ z.muster }}</td><td [style.color]="z.left ? 'var(--ka-d97706)' : ''">{{ z.left }}</td>
                <td><span class="tag" [class]="z.left ? (z.missing ? 'tag red' : 'tag amber') : 'tag green'">{{ z.left ? (z.missing ? 'Missing person' : 'Not cleared') : 'Cleared' }}</span></td>
                <td>@if (z.yet) {<button class="btn-ghost sm" (click)="clear(z.floor, z.zone)">Mark cleared</button>}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class EmergencyZones {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(EmergencyStore);
  protected readonly msg = signal<string | null>(null);
  private readonly exits = ['Main Exit', 'North Stair', 'East Exit 1', 'East Exit 2', 'West Stair'];
  protected readonly rows = computed(() => {
    const m = new Map<string, { key: string; floor: string; zone: string; yet: number; missing: number; left: number; exit: string; muster: string }>();
    for (const p of this.store.people()) {
      const key = `${p.floor}/${p.zone}`;
      const r = m.get(key) ?? { key, floor: p.floor, zone: p.zone, yet: 0, missing: 0, left: 0, exit: this.exits[m.size % 5], muster: 'ABCDEF'[m.size % 6] };
      if (p.status === 'Yet to Evacuate') r.yet++;
      if (p.status === 'Missing') r.missing++;
      r.left = r.yet + r.missing;
      m.set(key, r);
    }
    return [...m.values()].sort((a, b) => b.left - a.left || a.floor.localeCompare(b.floor));
  });
  protected readonly byFloor = computed(() => {
    const m = new Map<string, number>();
    this.rows().forEach((r) => m.set(r.floor, (m.get(r.floor) ?? 0) + r.left));
    return [...m.entries()].map(([label, value]) => ({ label, value, display: String(value), color: value ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' }));
  });
  protected readonly maxFloor = computed(() => Math.max(1, ...this.byFloor().map((r) => r.value)));
  protected clear(floor: string, zone: string) {
    const ids = this.store.people().filter((p) => p.floor === floor && p.zone === zone && p.status === 'Yet to Evacuate').map((p) => p.id);
    this.store.markSafe(ids, 'Zone warden');
    this.store.log(`${zone} cleared`, floor, 'Zone warden', 'run', 'var(--ka-22c55e)');
    toast(this.msg, `${floor} · ${zone} cleared (${ids.length} escorted)`);
  }
}

/* ======================= Wardens & Teams ======================= */
interface Warden {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  role: string;
  floor: string;
  status: string;
  phone: string;
  radio: string;
  trainingExpiry: string;
}
const ROLES = ['Chief Warden', 'Fire Warden', 'Floor Marshal', 'First Aider', 'Search & Rescue', 'Muster Warden'];

@Component({
  selector: 'app-wardens-teams',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Wardens &amp; Teams" [parent]="parent" [parentLink]="link" subtitle="Emergency response roles, who is on duty and their training status." />
    <section class="teams">
      @for (r of roles; track r) {
        <div class="card tm"><b>{{ r }}</b><span>{{ count(r, '') }}</span><small>{{ count(r, 'On duty') }} on duty · {{ count(r, 'Responding') }} responding</small></div>
      }
    </section>
    <div class="card">
      <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" [actions]="actions" noun="wardens" [searchKeys]="['name', 'floor', 'role']" (action)="act($event.action, $event.row)" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `.teams { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; } .tm { display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .tm span { font-size: 26px; font-weight: 700; color: var(--primary); } .tm small { color: var(--muted); } @media (max-width: 1100px) { .teams { grid-template-columns: repeat(3, 1fr); } }`,
})
export class WardensTeams {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly roles = ROLES;
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<Warden[]>(
    ['Khalid Saeed', 'Tom Baker', 'Grace Park', 'Ravi Shankar', 'Aisha Bello', 'Kenji Sato', 'Dr. Sana Iqbal', 'Omar Khalid', 'Meera Iyer', 'Lucas Silva', 'Hannah Lee', 'Yusuf Rahman', 'Layla Haddad', 'Noah Brown', 'Zara Khan', 'Vikram Rao', 'Sofia Rossi', 'Ibrahim Musa', 'Chloe Martin', 'Daniel Kim'].map((name, i) => ({
      id: `W${i}`, name, initials: name.replace('Dr. ', '').split(' ').map((x) => x[0]).join(''), avatar: ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-16a34a)'][i % 6],
      role: i === 0 ? 'Chief Warden' : ROLES[1 + (i % 5)], floor: ['Ground Floor', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'][i % 6], status: i % 7 === 6 ? 'Off-site' : i % 3 === 0 ? 'Responding' : 'On duty',
      phone: `+971 55 ${210 + i} ${3000 + i * 11}`, radio: `CH-${1 + (i % 4)}`, trainingExpiry: new Date(Date.now() + (i % 5 === 4 ? 20 : 120 + i * 20) * 86400000).toISOString().slice(0, 10),
    })),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Warden', kind: 'person', sub: 'role' },
    { key: 'floor', label: 'Floor' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'On duty' ? 'tag green' : r.status === 'Responding' ? 'tag amber' : 'tag grey') },
    { key: 'radio', label: 'Radio' },
    { key: 'phone', label: 'Phone' },
    { key: 'trainingExpiry', label: 'Training valid to', fmt: (v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
  ];
  protected readonly filters = [{ key: 'role', label: 'Role', options: ROLES }, { key: 'status', label: 'Status', options: ['On duty', 'Responding', 'Off-site'] }];
  protected readonly actions: RowAction[] = [
    { id: 'On duty', label: 'Set on duty', icon: 'user-check', when: (r) => r.status !== 'On duty' },
    { id: 'Responding', label: 'Set responding', icon: 'run', when: (r) => r.status !== 'Responding' },
    { id: 'Off-site', label: 'Set off-site', icon: 'ban', when: (r) => r.status !== 'Off-site' },
    { id: 'page', label: 'Page on radio', icon: 'megaphone' },
  ];
  protected count(role: string, status: string) {
    return this.list().filter((w) => w.role === role && (!status || w.status === status)).length;
  }
  protected act(a: string, w: Warden) {
    if (a === 'page') return toast(this.msg, `${w.name} paged on ${w.radio}`);
    this.list.update((l) => l.map((x) => (x.id === w.id ? { ...x, status: a } : x)));
    toast(this.msg, `${w.name} → ${a}`);
  }
}
