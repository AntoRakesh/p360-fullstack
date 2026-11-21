import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { PEOPLE } from '@p360/shared/data/people.data';
import { VisitorStore } from './visitor-store';
import { COMPANIES, duration, fmtTime, HISTORY_VISITS, hostDept, HOSTS, Vehicle } from './visitors.data';

/* ======================= Host Management ======================= */
interface Host {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  today: number;
  month: number;
  pending: number;
  email: boolean;
  sms: boolean;
  teams: boolean;
  delegate: string;
  canHost: boolean;
}

@Component({
  selector: 'app-host-management',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Host Management" parent="Visitor Management" parentLink="/visitor-management" subtitle="Employees who receive visitors — notification preferences, delegates and permissions." />
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Top Hosts (30 days)</h3></div>
        <app-bar-list [rows]="top()" [max]="top()[0]?.value || 1" />
      </div>
      <div class="card span-8">
        <app-data-table [rows]="hosts()" [columns]="cols" noun="hosts" [searchKeys]="['name', 'dept']" searchPlaceholder="Search host..." [actions]="actions" [activeId]="selId()"
          (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" />
      </div>
      @if (sel(); as h) {
        <div class="card span-12 hd">
          <div class="who"><span class="dt-av" [style.background]="h.avatar">{{ h.initials }}</span><div><b>{{ h.name }}</b><small>{{ h.dept }} · {{ h.today }} visitors today · {{ h.month }} this month</small></div></div>
          <div class="prefs">
            <label><input type="checkbox" [checked]="h.email" (change)="patch(h.id, { email: !h.email })" /> Email on arrival</label>
            <label><input type="checkbox" [checked]="h.sms" (change)="patch(h.id, { sms: !h.sms })" /> SMS on arrival</label>
            <label><input type="checkbox" [checked]="h.teams" (change)="patch(h.id, { teams: !h.teams })" /> Teams message</label>
            <label><input type="checkbox" [checked]="h.canHost" (change)="patch(h.id, { canHost: !h.canHost })" /> Allowed to invite visitors</label>
            <label class="del">Delegate when away
              <select class="select" [value]="h.delegate" (change)="patch(h.id, { delegate: $any($event.target).value })"><option value="">None</option>@for (x of hostNames; track x) {<option [value]="x">{{ x }}</option>}</select>
            </label>
          </div>
          <div class="today">
            <b>Today's visitors</b>
            @for (v of visitorsOf(h.name); track v.id) {<span class="tag" [class.green]="v.status === 'Checked In'">{{ v.name }} · {{ v.status }}</span>} @empty {<span class="muted">None</span>}
          </div>
        </div>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .hd { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
    .who { display: flex; gap: 10px; align-items: center; } .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .prefs { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; } .prefs label { display: flex; gap: 6px; align-items: center; } .del { flex-direction: column; align-items: flex-start !important; }
    .today { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; }
    @media (max-width: 900px) { .hd { grid-template-columns: 1fr; } }
  `,
})
export class HostManagement {
  private readonly store = inject(VisitorStore);
  protected readonly hostNames = HOSTS;
  protected readonly toast = signal<string | null>(null);
  protected readonly extra = signal<Record<string, Partial<Host>>>({});
  protected readonly selId = signal<string | null>('H-0');
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Host', kind: 'person', sub: 'dept' },
    { key: 'today', label: 'Today', kind: 'num' },
    { key: 'month', label: '30 days', kind: 'num' },
    { key: 'pending', label: 'Pending approvals', kind: 'num' },
    { key: 'delegate', label: 'Delegate', fmt: (v) => v || '—' },
    { key: 'canHost', label: 'Can invite', kind: 'bool' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'remind', label: 'Remind about pending approvals', icon: 'bell', when: (r) => r.pending > 0 },
    { id: 'toggle', label: 'Toggle invite permission', icon: 'shield' },
  ];
  protected readonly hosts = computed<Host[]>(() => {
    const vs = this.store.visits();
    const names = [...HOSTS, ...PEOPLE.slice(10, 30).map((p) => p.name)];
    return names.map((name, i) => {
      const p = PEOPLE.find((x) => x.name === name);
      const base: Host = {
        id: `H-${i}`, name, initials: name.split(' ').map((x) => x[0]).join('').slice(0, 2), avatar: p?.avatar ?? 'var(--ka-7c3aed)', dept: HOSTS.includes(name) ? hostDept(name) : (p?.dept ?? 'General'),
        today: vs.filter((v) => v.host === name).length, month: HISTORY_VISITS.filter((v) => v.host === name && v.expected > Date.now() - 30 * 86400000).length,
        pending: vs.filter((v) => v.host === name && v.status === 'Pending Approval').length, email: true, sms: i % 3 === 0, teams: i % 2 === 0, delegate: '', canHost: true,
      };
      return { ...base, ...this.extra()[base.id] };
    });
  });
  protected readonly sel = computed(() => this.hosts().find((h) => h.id === this.selId()) ?? null);
  protected readonly top = computed(() => [...this.hosts()].sort((a, b) => b.month - a.month).slice(0, 8).map((h) => ({ label: h.name, value: h.month, display: String(h.month) })));

  protected visitorsOf(name: string) {
    return this.store.visits().filter((v) => v.host === name).slice(0, 8);
  }
  protected patch(id: string, c: Partial<Host>) {
    this.extra.update((e) => ({ ...e, [id]: { ...e[id], ...c } }));
  }
  protected act(a: string, h: Host) {
    if (a === 'toggle') this.patch(h.id, { canHost: !h.canHost });
    this.toast.set(a === 'remind' ? `Reminder sent to ${h.name}` : `${h.name} ${h.canHost ? 'can no longer' : 'can now'} invite visitors`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Visitor Categories & Rules ======================= */
interface Category {
  name: string;
  color: string;
  approval: string;
  idRequired: boolean;
  nda: boolean;
  induction: boolean;
  escort: boolean;
  photo: boolean;
  maxHours: number;
  zones: string[];
  badge: string;
}
const ZONES = ['Reception', 'Meeting Rooms', 'Office Floors', 'Canteen', 'Warehouse', 'Plant Floor', 'Labs', 'Executive Floor'];

@Component({
  selector: 'app-visitor-categories',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Categories &amp; Rules" parent="Visitor Management" parentLink="/visitor-management" subtitle="What each type of visitor must do and where they may go.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />New Category</button>
    </app-page-head>
    <section class="cats">
      @for (c of cats(); track c.name; let i = $index) {
        <button class="card cat" [class.on]="sel() === i" [style.border-top-color]="c.color" (click)="sel.set(i)"><b>{{ c.name }}</b><small>{{ c.approval }} · max {{ c.maxHours }} h</small></button>
      }
    </section>
    @let c = cats()[sel()];
    <div class="card">
      <div class="card-head"><input class="input title" [value]="c.name" (change)="patch({ name: $any($event.target).value })" /><input type="color" [value]="(c.color.startsWith('#') ? c.color : '#' + c.color.slice(-7, -1))" (input)="patch({ color: $any($event.target).value })" /></div>
      <div class="grid2">
        <div>
          <h4>Requirements</h4>
          <label class="row"><span>Approval</span><select class="select" [value]="c.approval" (change)="patch({ approval: $any($event.target).value })"><option>Auto-approve</option><option>Host approval</option><option>Host + Security</option></select></label>
          @for (o of flags; track o.key) {<label class="row"><span>{{ o.label }}</span><input type="checkbox" [checked]="c[o.key]" (change)="flip(o.key)" /></label>}
          <label class="row"><span>Maximum visit length (hours)</span><input class="input n" type="number" [value]="c.maxHours" (change)="patch({ maxHours: +$any($event.target).value })" /></label>
          <label class="row"><span>Badge template</span><select class="select" [value]="c.badge" (change)="patch({ badge: $any($event.target).value })"><option>Visitor</option><option>Contractor</option><option>VIP</option><option>Delivery</option><option>Interview</option></select></label>
        </div>
        <div>
          <h4>Allowed zones</h4>
          <div class="zones">@for (z of zones; track z) {<label [class.on]="c.zones.includes(z)"><input type="checkbox" [checked]="c.zones.includes(z)" (change)="toggleZone(z)" />{{ z }}</label>}</div>
          <h4>Check-in flow for this category</h4>
          <ol class="flow">
            <li>Register / pre-register</li>
            @if (c.approval !== 'Auto-approve') {<li>{{ c.approval }}</li>}
            @if (c.idRequired) {<li>ID scan</li>}
            @if (c.photo) {<li>Photo capture</li>}
            @if (c.nda) {<li>Sign NDA</li>}
            @if (c.induction) {<li>Safety induction video (4 min)</li>}
            <li>{{ c.badge }} badge printed{{ c.escort ? ' · escort assigned' : '' }}</li>
          </ol>
        </div>
      </div>
    </div>
  `,
  styles: `
    .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .cat { display: flex; flex-direction: column; gap: 3px; border-top: 4px solid; text-align: left; cursor: pointer; font-family: inherit; } .cat small { color: var(--muted); } .cat.on { box-shadow: 0 0 0 2px var(--primary-soft); border-color: var(--primary); }
    .title { font-size: 16px; font-weight: 600; max-width: 300px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; } h4 { margin: 0 0 8px; font-size: 13px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; }
    .row input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--primary); } .n { width: 70px; }
    .zones { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; }
    .zones label { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 12.5px; cursor: pointer; } .zones label.on { background: var(--kb-faf8ff); border-color: var(--kl-c4b5fd); }
    .flow { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.9; }
    @media (max-width: 900px) { .grid2 { grid-template-columns: 1fr; } }
  `,
})
export class VisitorCategories {
  protected readonly zones = ZONES;
  protected readonly flags: { key: 'idRequired' | 'nda' | 'induction' | 'escort' | 'photo'; label: string }[] = [
    { key: 'idRequired', label: 'Photo ID required' }, { key: 'photo', label: 'Capture photo' }, { key: 'nda', label: 'NDA required' }, { key: 'induction', label: 'Safety induction' }, { key: 'escort', label: 'Escort required' },
  ];
  protected readonly sel = signal(0);
  protected readonly cats = signal<Category[]>([
    { name: 'Business Meeting', color: 'var(--ka-7c3aed)', approval: 'Host approval', idRequired: true, nda: true, induction: false, escort: false, photo: true, maxHours: 8, zones: ['Reception', 'Meeting Rooms', 'Canteen'], badge: 'Visitor' },
    { name: 'Contractor', color: 'var(--ka-f97316)', approval: 'Host + Security', idRequired: true, nda: true, induction: true, escort: true, photo: true, maxHours: 10, zones: ['Reception', 'Warehouse', 'Plant Floor'], badge: 'Contractor' },
    { name: 'Delivery', color: 'var(--ka-0d9488)', approval: 'Auto-approve', idRequired: false, nda: false, induction: false, escort: false, photo: false, maxHours: 1, zones: ['Reception', 'Warehouse'], badge: 'Delivery' },
    { name: 'Interview', color: 'var(--ka-3b82f6)', approval: 'Host approval', idRequired: true, nda: false, induction: false, escort: true, photo: true, maxHours: 4, zones: ['Reception', 'Meeting Rooms'], badge: 'Interview' },
    { name: 'Service & Maintenance', color: 'var(--ka-ea580c)', approval: 'Host + Security', idRequired: true, nda: true, induction: true, escort: true, photo: true, maxHours: 8, zones: ['Reception', 'Office Floors', 'Labs'], badge: 'Contractor' },
    { name: 'VIP / Government', color: 'var(--ka-a16207)', approval: 'Auto-approve', idRequired: false, nda: false, induction: false, escort: true, photo: false, maxHours: 6, zones: ZONES, badge: 'VIP' },
  ]);
  protected patch(c: Partial<Category>) {
    const i = this.sel();
    this.cats.update((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x)));
  }
  protected flip(k: 'idRequired' | 'nda' | 'induction' | 'escort' | 'photo') {
    this.patch({ [k]: !this.cats()[this.sel()][k] } as Partial<Category>);
  }
  protected toggleZone(z: string) {
    const zs = this.cats()[this.sel()].zones;
    this.patch({ zones: zs.includes(z) ? zs.filter((x) => x !== z) : [...zs, z] });
  }
  protected add() {
    this.cats.update((l) => [...l, { name: 'New Category', color: 'var(--ka-64748b)', approval: 'Host approval', idRequired: true, nda: false, induction: false, escort: false, photo: true, maxHours: 8, zones: ['Reception'], badge: 'Visitor' }]);
    this.sel.set(this.cats().length - 1);
  }
}

/* ======================= Vehicle Management ======================= */
@Component({
  selector: 'app-vehicle-management',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Vehicle Management" parent="Visitor Management" parentLink="/visitor-management" subtitle="Visitor and delivery vehicles, ANPR gate reads and parking occupancy.">
      <button class="btn-primary" (click)="form.set(true)"><app-icon name="plus" [size]="16" />Register Vehicle</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Vehicles On Site" [value]="inCount()" icon="truck" color="var(--ka-8b5cf6)" />
      <app-kpi label="Arrivals Today" [value]="list().length" icon="trending-up" color="var(--ka-3b82f6)" />
      <app-kpi label="Visitor Parking P1" [value]="p1() + ' / 40'" icon="map-pin" [color]="p1() > 34 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" sub="slots used" />
      <app-kpi label="Loading Bay" [value]="bay() + ' / 8'" icon="box" color="var(--ka-f97316)" sub="bays used" />
      <app-kpi label="Overstaying" [value]="overstay()" icon="clock" color="var(--ka-ef4444)" sub="> 4 h on site" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="list()" [columns]="cols" noun="vehicles" [searchKeys]="['plate', 'driver', 'company']" searchPlaceholder="Search plate, driver, company..." [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Gate ANPR Feed</h3><span class="muted">live</span></div>
        <ul class="anpr">
          @for (a of anpr(); track a.id) {
            <li [class.alert]="a.flag"><span class="plate">{{ a.plate }}</span><div><b>{{ a.gate }}</b><small>{{ a.time }} · {{ a.dir }}</small></div><span [class]="a.flag ? 'tag red' : 'tag green'">{{ a.flag ? 'Blocked' : 'Allowed' }}</span></li>
          }
        </ul>
        <div class="card-head" style="margin-top: 14px"><h3>Blocked Plates</h3></div>
        <div class="blocked">@for (b of blocked(); track b) {<span class="tag red">{{ b }} <button (click)="unblock(b)">×</button></span>}</div>
      </div>
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); register(pl.value, dr.value, ty.value, co.value)">
        <div class="modal-head"><h3>Register Vehicle</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label>Plate number *<input #pl class="input" required /></label>
          <label>Driver *<input #dr class="input" required /></label>
          <label>Type<select #ty class="select"><option>Car</option><option>Van</option><option>Truck</option><option>Motorbike</option></select></label>
          <label>Company<input #co class="input" list="vm-co" /><datalist id="vm-co">@for (c of companies; track c) {<option [value]="c"></option>}</datalist></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Register &amp; open gate</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .anpr { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; }
    .anpr li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; animation: rin .4s; }
    .anpr li.alert { background: var(--kb-fef2f2); } .anpr div { display: flex; flex-direction: column; } .anpr small { color: var(--muted); }
    .plate { padding: 3px 7px; border: 2px solid var(--kl-111111); border-radius: 4px; background: var(--kb-ffffff); font-family: monospace; font-weight: 700; font-size: 12px; }
    @keyframes rin { from { background: var(--kb-f5f3ff); } }
    .blocked { display: flex; flex-wrap: wrap; gap: 6px; } .blocked button { border: 0; background: none; color: inherit; cursor: pointer; }
  `,
})
export class VehicleMgmt {
  private readonly state = inject(AppState);
  private readonly store = inject(VisitorStore);
  protected readonly companies = COMPANIES;
  protected readonly form = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly blocked = signal<string[]>(['X 99231', 'Q 44120', 'D 70011']);
  protected readonly anpr = signal<{ id: number; plate: string; gate: string; time: string; dir: string; flag: boolean }[]>(
    VEHICLES_FEED(this.store.vehicles()),
  );
  private n = 100;
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Arrived', fmt: (v) => fmtTime(v) },
    { key: 'plate', label: 'Vehicle No' },
    { key: 'driver', label: 'Driver' },
    { key: 'type', label: 'Type' },
    { key: 'company', label: 'Company' },
    { key: 'zone', label: 'Parking' },
    { key: 'outTime', label: 'Left / On site', fmt: (v, r) => (v ? fmtTime(v) : duration(r.time)) },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['In', 'Out'] }, { key: 'type', label: 'Type', options: ['Car', 'Van', 'Truck', 'Motorbike'] }, { key: 'zone', label: 'Parking', options: ['Visitor Parking P1', 'Loading Bay'] }];
  protected readonly actions: RowAction[] = [
    { id: 'exit', label: 'Mark exited', icon: 'door-open', when: (r) => r.status === 'In' },
    { id: 'block', label: 'Block this plate', icon: 'ban', danger: true },
  ];

  constructor() {
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 5) return;
      const v = this.store.vehicles()[t % this.store.vehicles().length];
      this.anpr.update((l) => [{ id: this.n++, plate: v.plate, gate: t % 2 ? 'Main Gate' : 'Service Gate', time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), dir: t % 3 ? 'Entry' : 'Exit', flag: this.blocked().includes(v.plate) }, ...l].slice(0, 30));
    });
  }

  protected readonly list = computed(() => this.store.vehicles().slice().sort((a, b) => b.time - a.time));
  protected readonly inCount = computed(() => this.list().filter((v) => v.status === 'In').length);
  protected readonly p1 = computed(() => this.list().filter((v) => v.status === 'In' && v.zone === 'Visitor Parking P1').length);
  protected readonly bay = computed(() => this.list().filter((v) => v.status === 'In' && v.zone === 'Loading Bay').length);
  protected readonly overstay = computed(() => {
    this.state.tick();
    return this.list().filter((v) => v.status === 'In' && Date.now() - v.time > 4 * 3600000).length;
  });

  protected act(a: string, v: Vehicle) {
    if (a === 'exit') this.store.vehicles.update((l) => l.map((x) => (x.id === v.id ? { ...x, status: 'Out', outTime: Date.now() } : x)));
    else this.blocked.update((b) => (b.includes(v.plate) ? b : [...b, v.plate]));
    this.toast.set(a === 'exit' ? `${v.plate} exited` : `${v.plate} blocked at all gates`);
    setTimeout(() => this.toast.set(null), 2000);
  }
  protected unblock(p: string) {
    this.blocked.update((b) => b.filter((x) => x !== p));
  }
  protected register(plate: string, driver: string, type: string, company: string) {
    if (this.blocked().includes(plate.toUpperCase())) {
      this.toast.set(`${plate} is blocked — gate stays closed`);
      setTimeout(() => this.toast.set(null), 2400);
      return;
    }
    this.store.vehicles.update((l) => [{ id: `VH-${900 + l.length}`, time: Date.now(), plate: plate.toUpperCase(), driver, type, company: company || '—', zone: type === 'Truck' || type === 'Van' ? 'Loading Bay' : 'Visitor Parking P1', status: 'In', outTime: null }, ...l]);
    this.form.set(false);
    this.toast.set(`${plate.toUpperCase()} registered · gate opened`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

function VEHICLES_FEED(vs: Vehicle[]) {
  return vs.slice(0, 10).map((v, i) => ({ id: i, plate: v.plate, gate: i % 2 ? 'Service Gate' : 'Main Gate', time: fmtTime(v.time), dir: v.status === 'Out' && i % 2 ? 'Exit' : 'Entry', flag: false }));
}
