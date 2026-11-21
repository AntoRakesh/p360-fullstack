import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Col, DataTable } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv, rng } from '@p360/shared/data/demo-data';
import { FloorPlan, MapMarker, MapPath } from '@p360/shared/visuals/floor-plan';
import { FLOORS, PEOPLE, PX_PER_M, RAlert, RZone, RtlsStore, clock, fmtDur, minsAgo } from './rtls.data';

const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2400);
};
const PARENT = 'Real-Time Location (RTLS)';
const LINK = '/real-time-location';
const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);

/** Relative occupancy (0–1.2) of a zone at an hour of day. */
function hourFactor(z: Pick<RZone, 'name' | 'kind'>, h: number) {
  const n = z.name.toLowerCase();
  const bell = (c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  if (/cafeteria|pantry|café|dining|lounge/.test(n)) return 0.15 + bell(12.5, 0.9) + 0.35 * bell(9, 0.6) + 0.3 * bell(15.5, 0.7);
  if (/reception|lobby|entrance|security/.test(n)) return 0.2 + bell(8.3, 0.8) + 0.8 * bell(17.5, 0.8);
  if (/production|workshop|loading/.test(n)) return h >= 6 && h <= 19 ? 0.85 + 0.15 * Math.sin(h) : 0.1;
  if (z.kind === 'restricted') return 0.25 + 0.2 * bell(11, 3);
  if (z.kind === 'transit') return 0.2 + 0.6 * bell(8.5, 0.6) + 0.6 * bell(13, 0.5) + 0.6 * bell(17.5, 0.6);
  return h < 7 || h > 19 ? 0.05 : 0.3 + 0.75 * bell(11, 2.2) + 0.5 * bell(15, 1.6) - 0.35 * bell(12.5, 0.6);
}

/* ======================= Heatmaps & Analytics ======================= */
@Component({
  selector: 'app-rtls-heatmaps',
  imports: [...UI, FloorPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Heatmaps &amp; Analytics" [parent]="parent" [parentLink]="link" subtitle="Where people spend time, by floor and hour of day.">
      <select class="input" [value]="floor()" (change)="floor.set($any($event.target).value)">@for (f of floors; track f) {<option [value]="f">{{ f }}</option>}</select>
    </app-page-head>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Density Heatmap · {{ floor() }}</h3><span class="muted">{{ hours[hour()] }}:00</span></div>
        <app-floor-plan [zones]="zones()" [heat]="heat()" [height]="400" [selectedZone]="zoneSel()" (zoneClick)="zoneSel.set($event)" />
        <div class="slider">
          <button class="btn-primary sm" (click)="toggle()">{{ playing() ? 'Pause' : 'Play day' }}</button>
          <input type="range" min="0" [max]="hours.length - 1" [value]="hour()" (input)="hour.set(+$any($event.target).value)" />
          <div class="legend"><i style="background:var(--kb-22c55e)"></i>Low<i style="background:var(--kb-facc15)"></i><i style="background:var(--kb-f97316)"></i><i style="background:var(--kb-ef4444)"></i>High</div>
        </div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Busiest Zones at {{ hours[hour()] }}:00</h3></div>
        <app-bar-list [rows]="busiest()" />
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Occupancy Through the Day</h3></div>
        <app-line-chart [labels]="hours" [series]="lines()" [height]="220" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Average Dwell per Zone</h3></div>
        <app-bar-list [rows]="dwell()" [max]="180" />
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Zone × Hour Utilisation</h3></div>
        <app-heatmap [rows]="matrix().rows" [cols]="hours" [data]="matrix().data" />
      </div>
    </section>
  `,
  styles: `
    .slider { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .slider input { flex: 1; accent-color: var(--primary); }
    .legend { display: flex; gap: 4px; align-items: center; font-size: 11.5px; color: var(--muted); } .legend i { width: 18px; height: 10px; border-radius: 2px; }
  `,
})
export class RtlsHeatmaps {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(RtlsStore);
  protected readonly floors = FLOORS;
  protected readonly hours = HOURS;
  protected readonly floor = signal('Floor 1');
  protected readonly hour = signal(6);
  protected readonly zoneSel = signal<string | null>(null);
  protected readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;
  protected readonly zones = computed(() => this.store.zones().filter((z) => z.floor === this.floor()).map((z) => ({ ...z, fill: 0.03 })));
  private readonly floorPeople = computed(() => PEOPLE.filter((p) => p.floor === this.floor()));
  protected readonly heat = computed(() => {
    const rows = 16;
    const cols = 28;
    const h = +HOURS[this.hour()];
    const g = Array.from({ length: rows }, () => Array(cols).fill(0));
    const zs = this.store.zones();
    for (const p of this.floorPeople()) {
      const z = zs.find((x) => x.id === p.zoneId);
      if (!z) continue;
      const w = hourFactor(z, h);
      const c = Math.min(cols - 1, Math.floor(((p.x - 20) / 960) * cols));
      const r = Math.min(rows - 1, Math.floor(((p.y - 20) / 520) * rows));
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (g[r + dr]?.[c + dc] !== undefined) g[r + dr][c + dc] += w * (dr || dc ? 0.45 : 1);
    }
    const m = Math.max(...g.flat(), 1);
    return g.map((row) => row.map((v) => v / m));
  });
  private occ(z: RZone, h: number) {
    return Math.round(PEOPLE.filter((p) => p.zoneId === z.id).length * hourFactor(z, h));
  }
  protected readonly busiest = computed(() =>
    this.zones()
      .map((z) => ({ z, n: this.occ(z, +HOURS[this.hour()]) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 7)
      .map(({ z, n }) => ({ label: z.name, value: Math.round((n / z.capacity) * 100), display: `${n} / ${z.capacity}`, color: n / z.capacity > 0.9 ? 'var(--ka-ef4444)' : n / z.capacity > 0.6 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' })),
  );
  protected readonly lines = computed(() => {
    const colors = ['var(--ka-7c3aed)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-3b82f6)'];
    return this.zones()
      .filter((z) => PEOPLE.some((p) => p.zoneId === z.id))
      .sort((a, b) => b.capacity - a.capacity)
      .slice(0, 4)
      .map((z, i) => ({ name: z.name, color: colors[i], values: HOURS.map((h) => this.occ(z, +h)) }));
  });
  protected readonly dwell = computed(() =>
    this.zones().map((z) => {
      const ps = PEOPLE.filter((p) => p.zoneId === z.id);
      const m = ps.length ? Math.round(ps.reduce((a, p) => a + p.since, 0) / ps.length) : 0;
      return { label: z.name, value: m, display: m ? fmtDur(m) : '—', color: z.color };
    }),
  );
  protected readonly matrix = computed(() => {
    const zs = this.zones();
    return { rows: zs.map((z) => z.name), data: zs.map((z) => HOURS.map((h) => Math.min(100, Math.round((this.occ(z, +h) / z.capacity) * 100)))) };
  });
  protected toggle() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.playing.set(false);
      return;
    }
    this.playing.set(true);
    this.timer = setInterval(() => this.hour.update((h) => (h + 1) % HOURS.length), 800);
  }
}

/* ======================= Proximity & Encounters ======================= */
interface Encounter {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  zone: string;
  time: string;
  mins: number;
  distance: number;
  risk: string;
}

@Component({
  selector: 'app-rtls-proximity',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Proximity &amp; Encounters" [parent]="parent" [parentLink]="link" subtitle="Contact tracing — who was near whom, for how long and how close.">
      <button class="btn-outline" (click)="notify()"><app-icon name="bell" [size]="16" />Notify Close Contacts</button>
      <button class="btn-primary" (click)="exportCsv()"><app-icon name="download" [size]="16" />Contact-trace Report</button>
    </app-page-head>
    <div class="card bar-row">
      <label>Person<input class="input" list="px-p" [value]="label()" (change)="choose($any($event.target).value)" /><datalist id="px-p">@for (p of people; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist></label>
      <label>Within (m) <b>{{ radius() }}</b><input type="range" min="0.5" max="5" step="0.5" [value]="radius()" (input)="radius.set(+$any($event.target).value)" /></label>
      <label>For at least (min) <b>{{ minMins() }}</b><input type="range" min="1" max="30" [value]="minMins()" (input)="minMins.set(+$any($event.target).value)" /></label>
      <label>Period<select class="input" [value]="days()" (change)="days.set(+$any($event.target).value)"><option value="1">Today</option><option value="7">Last 7 days</option><option value="14">Last 14 days</option></select></label>
    </div>
    <section class="kpi-row">
      <app-kpi label="Encounters" [value]="list().length" icon="users" color="var(--ka-7c3aed)" />
      <app-kpi label="Unique Contacts" [value]="unique()" icon="user-check" color="var(--ka-3b82f6)" />
      <app-kpi label="Close Contacts (&lt;1 m, 15 min+)" [value]="close()" icon="triangle-alert" color="var(--ka-ef4444)" />
      <app-kpi label="Total Contact Time" [value]="total()" icon="clock" color="var(--ka-f59e0b)" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="list()" [columns]="cols" noun="encounters" [searchKeys]="['name', 'zone']" [filters]="filters" [pageSize]="10" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Encounters by Zone</h3></div>
        <app-bar-list [rows]="byZone()" />
        <div class="card-head" style="margin-top:14px"><h3>Distancing Breaches by Hour</h3></div>
        <app-column-chart [labels]="hrs" [series]="byHour()" [height]="150" [legend]="false" />
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `.bar-row { display: flex; gap: 18px; align-items: flex-end; margin-bottom: 14px; flex-wrap: wrap; } .bar-row label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); } .bar-row input[type=range] { accent-color: var(--primary); width: 180px; } .bar-row .input { min-width: 220px; }`,
})
export class RtlsProximity {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  protected readonly people = PEOPLE;
  protected readonly hrs = ['08', '09', '10', '11', '12', '13', '14', '15', '16'];
  protected readonly pid = signal('EMP-00123');
  protected readonly radius = signal(2);
  protected readonly minMins = signal(5);
  protected readonly days = signal(1);
  protected readonly msg = signal<string | null>(null);
  protected readonly person = computed(() => PEOPLE.find((p) => p.id === this.pid())!);
  private readonly all = computed<Encounter[]>(() => {
    const p = this.person();
    const out: Encounter[] = [];
    for (const c of PEOPLE) {
      if (c.id === p.id) continue;
      const r = rng(hash(p.id + c.id));
      const same = c.zoneId === p.zoneId;
      const n = c.floor !== p.floor ? 0 : Math.floor(r() * (same ? 2.2 : 1.15) * Math.min(3, this.days()));
      for (let k = 0; k < n; k++) {
        const distance = Math.round((0.3 + r() * 4.7) * 10) / 10;
        const mins = Math.round(1 + r() * r() * 55);
        out.push({ id: `${c.id}-${k}`, name: c.name, initials: c.initials, avatar: c.color, dept: c.dept, zone: same || r() < 0.4 ? c.zone : p.zone, time: minsAgo(Math.round(r() * 300) + k * 1440), mins, distance, risk: distance < 1 && mins >= 15 ? 'High' : distance < 2 && mins >= 10 ? 'Medium' : 'Low' });
      }
    }
    return out;
  });
  protected readonly list = computed(() => this.all().filter((e) => e.distance <= this.radius() && e.mins >= this.minMins()).sort((a, b) => a.distance - b.distance));
  protected readonly unique = computed(() => new Set(this.list().map((e) => e.name)).size);
  protected readonly close = computed(() => this.list().filter((e) => e.risk === 'High').length);
  protected readonly total = computed(() => fmtDur(this.list().reduce((a, e) => a + e.mins, 0)));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Contact', kind: 'person', sub: 'dept' },
    { key: 'zone', label: 'Zone' },
    { key: 'time', label: 'First contact' },
    { key: 'mins', label: 'Duration (min)', kind: 'num' },
    { key: 'distance', label: 'Closest (m)', kind: 'num' },
    { key: 'risk', label: 'Risk', kind: 'tag', tag: (r) => (r.risk === 'High' ? 'tag red' : r.risk === 'Medium' ? 'tag amber' : 'tag green') },
  ];
  protected readonly filters = [{ key: 'risk', label: 'Risk', options: ['High', 'Medium', 'Low'] }];
  protected readonly byZone = computed(() => {
    const m = new Map<string, number>();
    this.list().forEach((e) => m.set(e.zone, (m.get(e.zone) ?? 0) + 1));
    const max = Math.max(1, ...m.values());
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, v]) => ({ label, value: Math.round((v / max) * 100), display: String(v) }));
  });
  protected readonly byHour = computed(() => [{ name: 'Breaches', color: 'var(--ka-ef4444)', values: this.hrs.map((_, i) => this.list().filter((e) => e.distance < 1 && (hash(e.id) & 0xff) % this.hrs.length === i).length) }]);
  protected label() {
    return `${this.person().id} · ${this.person().name}`;
  }
  protected choose(v: string) {
    const id = v.split(' · ')[0].trim();
    if (PEOPLE.some((p) => p.id === id)) this.pid.set(id);
  }
  protected notify() {
    toast(this.msg, `${this.list().filter((e) => e.risk !== 'Low').length} close contacts notified by push & email`);
  }
  protected exportCsv() {
    downloadCsv(`contact-trace-${this.pid()}.csv`, [['Contact', 'Department', 'Zone', 'First contact', 'Minutes', 'Closest m', 'Risk'], ...this.list().map((e) => [e.name, e.dept, e.zone, e.time, e.mins, e.distance, e.risk])]);
  }
}

/* ======================= SOS & Emergency Tracking ======================= */
interface Responder {
  id: string;
  name: string;
  team: string;
  x: number;
  y: number;
}
const RESPONDERS: Responder[] = [
  { id: 'R1', name: 'Khalid Saeed', team: 'Security', x: 560, y: 470 },
  { id: 'R2', name: 'Dr. Sana Iqbal', team: 'First Aid', x: 820, y: 120 },
  { id: 'R3', name: 'Tom Baker', team: 'Fire Warden', x: 120, y: 120 },
  { id: 'R4', name: 'Omar Siddiqui', team: 'Security', x: 600, y: 230 },
];
const SOS_RE = /SOS|Fall|Lone|Panic/;

@Component({
  selector: 'app-rtls-sos',
  imports: [...UI, FloorPlan, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="SOS &amp; Emergency Tracking" [parent]="parent" [parentLink]="link" subtitle="Wearable SOS, fall and lone-worker alerts — locate the person and dispatch the nearest responder.">
      <button class="btn-outline danger" (click)="simulate()"><app-icon name="siren" [size]="16" />Simulate SOS</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Active SOS" [value]="active().length" icon="siren" color="var(--ka-ef4444)" />
      <app-kpi label="Responders On Duty" [value]="responders.length" icon="shield-plus" color="var(--ka-22c55e)" />
      <app-kpi label="Avg. Response Time" value="2m 40s" icon="clock" color="var(--ka-3b82f6)" change="18%" [up]="false" />
      <app-kpi label="Resolved (30 d)" [value]="history().length + 41" icon="shield-check" color="var(--ka-7c3aed)" />
    </section>
    <section class="sos">
      <div class="card list">
        <div class="card-head"><h3>Active</h3></div>
        @for (a of active(); track a.id) {
          <div class="sc" [class.on]="a.id === sel()?.id" (click)="selId.set(a.id)">
            <span class="ic"><app-icon [name]="a.event.includes('Fall') ? 'triangle-alert' : 'siren'" [size]="18" /></span>
            <div><b>{{ a.event }}</b><small>{{ a.person }} · {{ a.location }}</small><small>{{ a.time }} · <em [class]="a.status === 'Open' ? 'r' : 'a'">{{ a.status }}</em></small></div>
          </div>
        } @empty {<p class="muted">No active SOS 🎉</p>}
      </div>
      <div class="card">
        @if (sel(); as a) {
          <div class="card-head"><h3>{{ a.event }} · {{ a.floor }}</h3><span class="muted">{{ a.location }}</span></div>
          <app-floor-plan [zones]="zones()" [markers]="markers()" [paths]="route()" [callout]="{ x: a.x, y: a.y, title: a.person, lines: [a.event, a.time], icon: 'siren', color: 'var(--ka-ef4444)' }" [height]="400" />
        } @else {<p class="muted">Select an alert</p>}
      </div>
      <div class="card resp">
        @if (sel(); as a) {
          <div class="card-head"><h3>Nearest Responders</h3></div>
          @for (r of ranked(); track r.id; let i = $index) {
            <div class="rr"><span class="sav" [style.background]="i === 0 ? 'var(--ka-22c55e)' : 'var(--ka-94a3b8)'">{{ r.name[0] }}</span><p><b>{{ r.name }}</b><small>{{ r.team }} · {{ r.m }} m · ETA {{ r.eta }}</small></p>
              <button class="btn-ghost sm" (click)="dispatch(a, r)">Dispatch</button></div>
          }
          @if (a.note) {<div class="note">{{ a.note }}</div>}
          <div class="acts">
            <button class="btn-outline" (click)="call(a)"><app-icon name="phone" [size]="15" />Call tag</button>
            <button class="btn-primary" (click)="resolve(a)"><app-icon name="shield-check" [size]="15" />Resolve</button>
          </div>
        }
      </div>
    </section>
    <div class="card">
      <div class="card-head"><h3>SOS History</h3></div>
      <app-data-table [rows]="history()" [columns]="cols" noun="events" [pageSize]="6" [searchKeys]="['person', 'location']" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .sos { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; gap: 14px; margin-bottom: 14px; align-items: start; }
    .sc { display: flex; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; font-size: 12.5px; } .sc.on { border-color: var(--kl-ef4444); background: var(--kb-fef2f2); }
    .sc div { display: flex; flex-direction: column; gap: 2px; } .sc small { color: var(--muted); } .sc em { font-style: normal; font-weight: 600; } .sc .r { color: var(--kf-dc2626); } .sc .a { color: var(--kf-d97706); }
    .ic { width: 34px; height: 34px; border-radius: 9px; background: var(--kb-ef4444); color: var(--kf-ffffff); display: grid; place-items: center; flex: none; }
    .rr { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .rr p { margin: 0; flex: 1; display: flex; flex-direction: column; } .rr small { color: var(--muted); }
    .sav { width: 30px; height: 30px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-weight: 700; flex: none; }
    .note { margin: 10px 0; padding: 8px 10px; border-radius: 8px; background: var(--kb-fffbeb); color: var(--kf-92400e); font-size: 12.5px; }
    .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; } .acts button { justify-content: center; } .danger { color: var(--red); border-color: var(--kl-fecaca); }
    @media (max-width: 1300px) { .sos { grid-template-columns: 1fr; } }
  `,
})
export class RtlsSos {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(RtlsStore);
  protected readonly responders = RESPONDERS;
  protected readonly msg = signal<string | null>(null);
  protected readonly active = computed(() => this.store.alerts().filter((a) => SOS_RE.test(a.event) && a.status !== 'Resolved'));
  protected readonly history = computed(() => this.store.alerts().filter((a) => a.status === 'Resolved' && (SOS_RE.test(a.event) || a.severity === 'Critical')));
  protected readonly selId = signal<string | null>(null);
  protected readonly sel = computed(() => this.active().find((a) => a.id === this.selId()) ?? this.active()[0] ?? null);
  protected readonly zones = computed(() => this.store.zones().filter((z) => z.floor === this.sel()?.floor));
  protected readonly ranked = computed(() => {
    const a = this.sel();
    if (!a) return [];
    return RESPONDERS.map((r) => {
      const m = Math.round(Math.hypot(r.x - a.x, r.y - a.y) / PX_PER_M);
      return { ...r, m, eta: `${Math.max(1, Math.round(m / 80))} min` };
    }).sort((x, y) => x.m - y.m);
  });
  protected readonly markers = computed<MapMarker[]>(() => {
    const a = this.sel();
    if (!a) return [];
    return [
      ...this.ranked().map((r, i) => ({ id: r.id, x: r.x, y: r.y, color: i === 0 ? 'var(--ka-22c55e)' : 'var(--ka-64748b)', label: r.name[0], title: `${r.name} (${r.team})` })),
      { id: 'sos', x: a.x, y: a.y, kind: 'icon' as const, icon: 'siren', color: 'var(--ka-ef4444)', pulse: true, size: 15 },
    ];
  });
  protected readonly route = computed<MapPath[]>(() => {
    const a = this.sel();
    const r = this.ranked()[0];
    return a && r ? [{ points: [[r.x, r.y], [r.x, a.y], [a.x, a.y]], color: 'var(--ka-22c55e)', dashed: true, arrow: true }] : [];
  });
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'event', label: 'Event' },
    { key: 'person', label: 'Person' },
    { key: 'location', label: 'Location', sub: 'floor' },
    { key: 'note', label: 'Outcome' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected dispatch(a: RAlert, r: Responder & { eta: string }) {
    this.store.setStatus(a.id, 'Acknowledged', `${r.name} (${r.team}) dispatched at ${clock(new Date())} · ETA ${r.eta}`);
    toast(this.msg, `${r.name} dispatched to ${a.location}`);
  }
  protected call(a: RAlert) {
    toast(this.msg, `Calling ${a.person}'s tag via two-way audio…`);
  }
  protected resolve(a: RAlert) {
    this.store.setStatus(a.id, 'Resolved', a.note ? `${a.note} · resolved` : `Resolved by Demo login at ${clock(new Date())}`);
    this.selId.set(null);
    toast(this.msg, `${a.event} for ${a.person} resolved`);
  }
  protected simulate() {
    const p = PEOPLE[Math.floor(Math.random() * 50)];
    this.store.raise({ person: p.name, personId: p.id, event: 'SOS Alert', location: p.zone, floor: p.floor, severity: 'Critical', status: 'Open', x: p.x, y: p.y });
    this.selId.set(this.store.alerts()[0].id);
    toast(this.msg, `SOS from ${p.name} · ${p.floor}, ${p.zone}`);
  }
}

/* ======================= Reports & Analytics ======================= */
@Component({
  selector: 'app-rtls-reports',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports &amp; Analytics" [parent]="parent" [parentLink]="link" subtitle="On-site trends, zone utilisation, alerts and tag health." />
    <section class="kpi-row">
      <app-kpi label="Peak On-Site (today)" value="412" icon="users" color="var(--ka-7c3aed)" sub="at 11:00" />
      <app-kpi label="Avg. Zone Utilisation" [value]="avgUtil() + '%'" icon="map-floor" color="var(--ka-22c55e)" />
      <app-kpi label="Alerts (today)" [value]="alerts().length" icon="bell" color="var(--ka-f59e0b)" />
      <app-kpi label="Tag Coverage" value="99.2%" icon="id-card" color="var(--ka-3b82f6)" sub="people carrying tags" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>People On-Site by Hour</h3></div>
        <app-line-chart [labels]="hours" [series]="onsite" [height]="220" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Alerts by Type</h3></div>
        <app-donut [segments]="byType()" center="Alerts" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Zone Utilisation (Floor 1)</h3></div>
        <app-bar-list [rows]="util()" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Reports</h3></div>
        <div class="reps">
          @for (r of reports; track r.id) {<div class="rep"><b>{{ r.name }}</b><small>{{ r.desc }}</small><button class="btn-ghost sm" (click)="run(r.id)">Export CSV</button></div>}
        </div>
      </div>
    </section>
  `,
  styles: `.reps { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .rep { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; } .rep small { color: var(--muted); } .rep button { align-self: flex-start; }`,
})
export class RtlsReports {
  protected readonly parent = PARENT;
  protected readonly link = LINK;
  private readonly store = inject(RtlsStore);
  protected readonly hours = HOURS;
  protected readonly onsite = [
    { name: 'Today', color: 'var(--ka-7c3aed)', values: [42, 118, 296, 388, 386, 412, 371, 352, 398, 401, 380, 310, 160, 74, 31], area: true },
    { name: '7-day avg', color: 'var(--ka-94a3b8)', values: [38, 110, 281, 370, 379, 395, 360, 349, 384, 390, 366, 296, 151, 70, 29], dashed: true },
  ];
  protected readonly reports = [
    { id: 'onsite', name: 'On-Site Register', desc: 'Everyone on site now with zone & tag' },
    { id: 'zones', name: 'Zone Utilisation', desc: 'Headcount vs capacity per zone' },
    { id: 'alerts', name: 'Alert Log', desc: 'All alerts with status & notes' },
    { id: 'tags', name: 'Low Battery Tags', desc: 'Tags below 20% battery' },
  ];
  protected readonly alerts = computed(() => this.store.alerts());
  protected readonly byType = computed(() => {
    const m = new Map<string, number>();
    this.alerts().forEach((a) => m.set(a.event, (m.get(a.event) ?? 0) + 1));
    const c = ['var(--ka-ef4444)', 'var(--ka-f59e0b)', 'var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-06b6d4)', 'var(--ka-ec4899)', 'var(--ka-64748b)', 'var(--ka-f97316)', 'var(--ka-0d9488)'];
    return [...m.entries()].map(([label, value], i) => ({ label, value, color: c[i % c.length] }));
  });
  private readonly zoneRows = computed(() => this.store.zones().map((z) => ({ z, n: PEOPLE.filter((p) => p.zoneId === z.id).length })));
  protected readonly util = computed(() => this.zoneRows().filter((r) => r.z.floor === 'Floor 1').map(({ z, n }) => ({ label: z.name, value: Math.round((n / z.capacity) * 100), display: `${n}/${z.capacity}`, color: z.color })));
  protected readonly avgUtil = computed(() => {
    const r = this.zoneRows().filter((x) => x.n > 0);
    return Math.round(r.reduce((a, x) => a + x.n / x.z.capacity, 0) / r.length * 100);
  });
  protected run(id: string) {
    if (id === 'onsite') return downloadCsv('rtls-on-site.csv', [['ID', 'Name', 'Type', 'Department', 'Floor', 'Zone', 'Tag'], ...PEOPLE.map((p) => [p.id, p.name, p.type, p.dept, p.floor, p.zone, p.tag])]);
    if (id === 'zones') return downloadCsv('rtls-zones.csv', [['Floor', 'Zone', 'Type', 'People', 'Capacity'], ...this.zoneRows().map(({ z, n }) => [z.floor, z.name, z.kind ?? '', n, z.capacity])]);
    if (id === 'alerts') return downloadCsv('rtls-alerts.csv', [['Time', 'Severity', 'Event', 'Person', 'Location', 'Status'], ...this.alerts().map((a) => [a.time, a.severity, a.event, a.person, a.location, a.status])]);
    return downloadCsv('rtls-low-battery.csv', [['Tag', 'Person', 'Battery'], ...PEOPLE.filter((p) => p.battery < 20).map((p) => [p.tag, p.name, p.battery])]);
  }
}
