import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { AccessEvent, DENY_REASONS, Door, DOORS, HISTORY, METHODS, TODAY_EVENTS } from './access.data';
import { CamScene } from './cam-scene';

const SITES = ['Head Office', 'Manufacturing', 'Warehouse', 'Data Center', 'Regional Office', 'Tech Center', 'Logistics Hub', 'Retail Stores'];

/* ======================= Door Monitoring ======================= */
@Component({
  selector: 'app-door-monitoring',
  imports: [...UI, CamScene],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Door Monitoring" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Live state of every door, reader and controller, with remote control." />
    <section class="kpi-row">
      <app-kpi label="Doors" [value]="doors().length" icon="door-open" color="#8b5cf6" />
      <app-kpi label="Online" [value]="cnt('Online')" icon="wifi" color="#22c55e" />
      <app-kpi label="Offline" [value]="cnt('Offline')" icon="ban" color="#ef4444" />
      <app-kpi label="In Alarm" [value]="cnt('Alarm')" icon="bell" color="#f97316" />
      <app-kpi label="Held Unlocked" [value]="unlocked()" icon="key-round" color="#3b82f6" />
    </section>
    <section class="card bar">
      <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search door" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="All">All sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
      <select class="select" [value]="type()" (change)="type.set($any($event.target).value)"><option value="All">All types</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select>
      <div class="tabs">@for (s of statuses; track s) {<button [class.on]="status() === s" (click)="status.set(s)">{{ s }}</button>}</div>
    </section>
    <section class="dm" [class.with-detail]="!!sel()">
      <div class="tiles">
        @for (d of shown(); track d.id) {
          <button class="tile" [class.on]="selId() === d.id" [attr.data-s]="d.status" (click)="selId.set(d.id)">
            <div class="t-top"><b>{{ d.name }}</b><span class="dot"></span></div>
            <small>{{ d.location }} · {{ d.type }}</small>
            <div class="t-foot">
              <span>{{ d.status === 'Offline' ? 'No heartbeat' : d.locked ? '🔒 Locked' : '🔓 Unlocked' }}</span>
              <span>{{ d.contact === 'Open' ? 'Door open' : 'Closed' }}</span>
            </div>
          </button>
        } @empty {
          <p class="empty-note">No doors match</p>
        }
      </div>
      @if (sel(); as d) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ d.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <app-cam-scene class="cam" [variant]="d.name.length % 5" [tick]="state.tick()" />
          <div class="state">
            <div><span>Status</span><b [class]="'s-' + d.status">{{ d.status }}</b></div>
            <div><span>Lock</span><b>{{ d.locked ? 'Locked' : 'Unlocked' }}</b></div>
            <div><span>Contact</span><b>{{ d.contact }}</b></div>
          </div>
          @if (countdown()) {<p class="cd">Unlocked — relocking in {{ countdown() }} s</p>}
          <div class="toolbar">
            <button class="btn-primary" (click)="pulse(d)" [disabled]="d.status === 'Offline' || countdown() > 0">Unlock 5 s</button>
            <button class="btn-ghost" (click)="patch(d.id, { locked: !d.locked })" [disabled]="d.status === 'Offline'">{{ d.locked ? 'Hold unlocked' : 'Lock' }}</button>
            @if (d.status === 'Alarm') {<button class="btn-ghost danger" (click)="patch(d.id, { status: 'Online', contact: 'Closed' })">Clear alarm</button>}
            @if (d.status === 'Offline') {<button class="btn-ghost" (click)="ping(d)">Ping controller</button>}
          </div>
          <dl class="kv">
            <dt>Reader</dt><dd>{{ d.reader }}</dd><dt>Controller</dt><dd>{{ d.controller }}</dd><dt>Firmware</dt><dd>{{ d.firmware }}</dd>
            <dt>Access level</dt><dd>{{ d.level }}</dd><dt>Schedule</dt><dd>{{ d.schedule }}</dd>
          </dl>
          <h4>Recent events</h4>
          <ul class="ev">
            @for (e of recent(d); track e.id) {<li><span [class]="e.result === 'Denied' ? 'bad' : 'good'">●</span>{{ e.time }} · {{ e.name }} · {{ e.kind }}</li>} @empty {<li class="muted">No events today</li>}
          </ul>
        </aside>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 10px 12px; margin-bottom: 12px; }
    .dm { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .dm.with-detail { grid-template-columns: minmax(0, 1fr) 360px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; align-content: start; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--border); border-left: 4px solid #22c55e; border-radius: 8px; background: #fff; text-align: left; cursor: pointer; font-size: 12.5px; }
    .tile[data-s='Offline'] { border-left-color: #ef4444; background: #fffafa; } .tile[data-s='Alarm'] { border-left-color: #f59e0b; background: #fffbeb; animation: pulse 1.5s infinite; }
    @keyframes pulse { 50% { box-shadow: 0 0 0 3px #fde68a; } }
    .tile.on { box-shadow: 0 0 0 2px var(--primary); }
    .t-top { display: flex; justify-content: space-between; } .dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; }
    .tile[data-s='Offline'] .dot { background: #ef4444; } .tile[data-s='Alarm'] .dot { background: #f59e0b; }
    .tile small { color: var(--muted); } .t-foot { display: flex; justify-content: space-between; font-size: 11px; color: #4b4f6b; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .cam { height: 180px; border-radius: 8px; }
    .state { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .state div { display: flex; flex-direction: column; padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 11.5px; }
    .state span { color: var(--muted); } .s-Online { color: #16a34a; } .s-Offline { color: var(--red); } .s-Alarm { color: #d97706; }
    .cd { margin: 0; color: #d97706; font-weight: 600; font-size: 13px; } .danger { color: var(--red); }
    .kv { display: grid; grid-template-columns: 100px 1fr; gap: 6px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 4px 0 0; font-size: 13px; } .ev { list-style: none; margin: 0; padding: 0; font-size: 12px; } .ev li { padding: 4px 0; display: flex; gap: 6px; }
    @media (max-width: 1100px) { .dm.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class DoorMonitoring {
  protected readonly state = inject(AppState);
  private readonly destroy = inject(DestroyRef);
  protected readonly sites = SITES;
  protected readonly types = ['Entrance', 'Turnstile', 'Gate', 'Office', 'Restricted', 'Lift'];
  protected readonly statuses = ['All', 'Online', 'Offline', 'Alarm'];
  protected readonly doors = signal<Door[]>(DOORS.map((d) => ({ ...d })));
  protected readonly q = signal('');
  protected readonly site = signal('All');
  protected readonly type = signal('All');
  protected readonly status = signal('All');
  protected readonly selId = signal<string | null>(DOORS.find((d) => d.status === 'Alarm')!.id);
  protected readonly countdown = signal(0);
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.doors().find((d) => d.id === this.selId()) ?? null);
  protected readonly shown = computed(() => {
    const q = this.q().toLowerCase();
    const gs = this.state.site();
    return this.doors().filter(
      (d) => (this.site() === 'All' || d.site === this.site()) && (gs.factor === 1 || d.site === gs.name) && (this.type() === 'All' || d.type === this.type()) && (this.status() === 'All' || d.status === this.status()) && (!q || d.name.toLowerCase().includes(q)),
    );
  });
  protected readonly unlocked = computed(() => this.doors().filter((d) => !d.locked).length);

  protected cnt(s: string) {
    return this.doors().filter((d) => d.status === s).length;
  }
  protected patch(id: string, c: Partial<Door>) {
    this.doors.update((l) => l.map((d) => (d.id === id ? { ...d, ...c } : d)));
  }
  protected recent(d: Door) {
    return TODAY_EVENTS.filter((e) => e.door === d.name).slice(0, 6);
  }
  protected pulse(d: Door) {
    this.patch(d.id, { locked: false, contact: 'Open' });
    this.countdown.set(5);
    const id = setInterval(() => {
      this.countdown.update((c) => c - 1);
      if (this.countdown() <= 0) {
        clearInterval(id);
        this.patch(d.id, { locked: true, contact: 'Closed' });
      }
    }, 1000);
    this.destroy.onDestroy(() => clearInterval(id));
  }
  protected ping(d: Door) {
    this.toast.set(`Pinging ${d.controller}… no response. Ticket raised with Facilities.`);
    setTimeout(() => this.toast.set(null), 2600);
  }
}

/* ======================= Access Logs ======================= */
@Component({
  selector: 'app-access-logs',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access Logs" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Searchable history of every access event (last 7 days in this demo).">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export {{ rows().length.toLocaleString() }} rows</button>
    </app-page-head>
    <section class="card bar">
      <label>From<input class="input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
      <label>To<input class="input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
      <div class="quick">
        <button class="btn-ghost sm" (click)="range(0)">Today</button>
        <button class="btn-ghost sm" (click)="range(1)">Yesterday</button>
        <button class="btn-ghost sm" (click)="range(6)">Last 7 days</button>
      </div>
      <span class="muted">{{ rows().length.toLocaleString() }} events · {{ deniedPct() }}% denied</span>
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" noun="events" [pageSize]="20" [searchKeys]="['name', 'personId', 'door', 'reason']" searchPlaceholder="Search person, ID, door, reason..." />
    </div>
  `,
  styles: `.bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 10px 12px; margin-bottom: 12px; } .bar label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #4b4f6b; } .quick { display: flex; gap: 6px; } .bar .muted { margin-left: auto; }`,
})
export class AccessLogs {
  private readonly state = inject(AppState);
  private readonly d = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  protected readonly from = signal(this.d(6));
  protected readonly to = signal(this.d(0));
  protected readonly cols: Col[] = [
    { key: 'ts', label: 'Date & time', fmt: (v) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'cred', label: 'Type' },
    { key: 'door', label: 'Door' },
    { key: 'site', label: 'Site' },
    { key: 'method', label: 'Method' },
    { key: 'kind', label: 'Event' },
    { key: 'reason', label: 'Reason', fmt: (v) => v || '—' },
    { key: 'result', label: 'Result', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'result', label: 'Result', options: ['Granted', 'Denied', 'Alarm', 'Info'] },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'method', label: 'Method', options: METHODS },
    { key: 'reason', label: 'Deny reason', options: DENY_REASONS },
    { key: 'cred', label: 'Person type', options: ['Employee', 'Contractor', 'Visitor', 'Temporary', 'Other'] },
  ];
  protected readonly rows = computed<AccessEvent[]>(() => {
    const a = new Date(this.from()).setHours(0, 0, 0, 0);
    const b = new Date(this.to()).setHours(23, 59, 59, 999);
    const s = this.state.site();
    return HISTORY.filter((e) => e.ts >= a && e.ts <= b && (s.factor === 1 || e.site === s.name));
  });
  protected readonly deniedPct = computed(() => ((this.rows().filter((e) => e.result === 'Denied').length / (this.rows().length || 1)) * 100).toFixed(1));
  protected range(days: number) {
    this.from.set(this.d(days));
    this.to.set(this.d(days === 1 ? 1 : 0));
  }
  protected exportCsv() {
    downloadCsv(`access-logs-${this.from()}-to-${this.to()}.csv`, [['Time', 'Person', 'ID', 'Type', 'Door', 'Site', 'Method', 'Event', 'Reason'], ...this.rows().map((e) => [new Date(e.ts).toISOString(), e.name, e.personId, e.cred, e.door, e.site, e.method, e.kind, e.reason])]);
  }
}

/* ======================= Access Control Schedules ======================= */
interface Sched {
  id: number;
  name: string;
  desc: string;
  grid: boolean[][]; // 7 days × 24 hours
  holidays: 'Closed' | 'Same as Sunday' | 'Normal';
  doors: number;
  levels: number;
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mk = (fn: (d: number, h: number) => boolean) => DAYS.map((_, d) => Array.from({ length: 24 }, (_, h) => fn(d, h)));

@Component({
  selector: 'app-access-schedules',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access Control Schedules" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Time windows when credentials work and when doors auto-unlock.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />New Schedule</button>
    </app-page-head>
    <section class="sc">
      <aside class="card sl">
        @for (s of list(); track s.id) {
          <button class="si" [class.on]="selId() === s.id" (click)="selId.set(s.id)">
            <b>{{ s.name }}</b><small>{{ s.desc }}</small><small>{{ hoursOf(s) }} h/week · {{ s.doors }} doors · {{ s.levels }} levels</small>
          </button>
        }
      </aside>
      @if (sel(); as s) {
        <div class="card">
          <div class="card-head">
            <input class="input title" [value]="s.name" (change)="patch({ name: $any($event.target).value })" />
            <div class="toolbar">
              <button class="btn-ghost sm" (click)="preset('office')">Office hours</button>
              <button class="btn-ghost sm" (click)="preset('all')">24 × 7</button>
              <button class="btn-ghost sm" (click)="preset('none')">Clear</button>
            </div>
          </div>
          <p class="muted">Click or drag across cells to toggle access hours. Purple = credentials accepted.</p>
          <div class="wk" (mouseleave)="drag.set(null)">
            <span></span>
            @for (h of hours; track h) {<span class="hh">{{ h % 3 === 0 ? h : '' }}</span>}
            @for (d of days; track d; let di = $index) {
              <span class="dl">{{ d }}</span>
              @for (h of hours; track h) {
                <span class="c" [class.on]="s.grid[di][h]" (mousedown)="start(di, h)" (mouseenter)="over(di, h)" (mouseup)="drag.set(null)"></span>
              }
            }
          </div>
          <div class="form-grid opts">
            <label>Public holidays<select class="select" [value]="s.holidays" (change)="patch({ holidays: $any($event.target).value })"><option>Closed</option><option>Same as Sunday</option><option>Normal</option></select></label>
            <label>Used by<input class="input" [value]="s.doors + ' doors, ' + s.levels + ' access levels'" disabled /></label>
          </div>
          <p class="sum">Access open <b>{{ hoursOf(s) }} hours/week</b>. Right now ({{ nowLabel }}) this schedule is <b [class.good]="openNow(s)" [class.bad]="!openNow(s)">{{ openNow(s) ? 'OPEN' : 'CLOSED' }}</b>.</p>
        </div>
      }
    </section>
  `,
  styles: `
    .sc { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }
    .sl { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
    .si { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .si small { color: var(--muted); } .si.on { border-color: var(--primary); background: #f5f3ff; }
    .title { font-size: 16px; font-weight: 600; flex: 1; max-width: 360px; }
    .wk { display: grid; grid-template-columns: 40px repeat(24, 1fr); gap: 2px; user-select: none; }
    .hh { font-size: 10px; color: var(--muted); text-align: center; } .dl { font-size: 12px; color: #4b4f6b; align-self: center; }
    .c { height: 26px; border-radius: 3px; background: #eef0f6; cursor: pointer; } .c.on { background: var(--primary); } .c:hover { outline: 2px solid #c4b5fd; }
    .opts { margin-top: 14px; } .sum { font-size: 13px; }
    @media (max-width: 1000px) { .sc { grid-template-columns: 1fr; } }
  `,
})
export class AccessSchedules {
  protected readonly days = DAYS;
  protected readonly hours = Array.from({ length: 24 }, (_, h) => h);
  protected readonly nowLabel = new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  protected readonly list = signal<Sched[]>([
    { id: 1, name: 'Business Hours', desc: 'Mon–Fri 07:00–19:00', grid: mk((d, h) => d < 5 && h >= 7 && h < 19), holidays: 'Closed', doors: 64, levels: 6 },
    { id: 2, name: '24 × 7', desc: 'Always open', grid: mk(() => true), holidays: 'Normal', doors: 22, levels: 4 },
    { id: 3, name: '24 × 7 (restricted)', desc: 'Always, with dual authentication', grid: mk(() => true), holidays: 'Normal', doors: 11, levels: 3 },
    { id: 4, name: 'Night Shift', desc: 'Every day 21:00–07:00', grid: mk((_, h) => h >= 21 || h < 7), holidays: 'Normal', doors: 18, levels: 2 },
    { id: 5, name: 'Cleaning Crew', desc: 'Mon–Sat 18:00–23:00', grid: mk((d, h) => d < 6 && h >= 18 && h < 23), holidays: 'Closed', doors: 40, levels: 1 },
    { id: 6, name: 'Weekend Maintenance', desc: 'Sat–Sun 08:00–16:00', grid: mk((d, h) => d >= 5 && h >= 8 && h < 16), holidays: 'Same as Sunday', doors: 12, levels: 1 },
    { id: 7, name: 'Lobby Auto-Unlock', desc: 'Doors unlocked Mon–Fri 08:00–18:00', grid: mk((d, h) => d < 5 && h >= 8 && h < 18), holidays: 'Closed', doors: 4, levels: 0 },
  ]);
  protected readonly selId = signal(1);
  protected readonly drag = signal<boolean | null>(null);
  protected readonly sel = computed(() => this.list().find((s) => s.id === this.selId()) ?? null);

  protected hoursOf(s: Sched) {
    return s.grid.flat().filter(Boolean).length;
  }
  protected openNow(s: Sched) {
    const n = new Date();
    return s.grid[(n.getDay() + 6) % 7][n.getHours()];
  }
  protected patch(c: Partial<Sched>) {
    const id = this.selId();
    this.list.update((l) => l.map((s) => (s.id === id ? { ...s, ...c } : s)));
  }
  private setCell(d: number, h: number, v: boolean) {
    const g = this.sel()!.grid.map((row, i) => (i === d ? row.map((x, j) => (j === h ? v : x)) : row));
    this.patch({ grid: g });
  }
  protected start(d: number, h: number) {
    const v = !this.sel()!.grid[d][h];
    this.drag.set(v);
    this.setCell(d, h, v);
  }
  protected over(d: number, h: number) {
    if (this.drag() !== null) this.setCell(d, h, this.drag()!);
  }
  protected preset(p: 'office' | 'all' | 'none') {
    this.patch({ grid: mk((d, h) => (p === 'all' ? true : p === 'none' ? false : d < 5 && h >= 7 && h < 19)) });
  }
  protected add() {
    const id = Math.max(...this.list().map((s) => s.id)) + 1;
    this.list.update((l) => [...l, { id, name: 'New Schedule', desc: 'Custom', grid: mk(() => false), holidays: 'Closed', doors: 0, levels: 0 }]);
    this.selId.set(id);
  }
}
