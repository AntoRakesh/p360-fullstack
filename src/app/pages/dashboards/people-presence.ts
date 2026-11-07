import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { avatarColor, DEPARTMENTS, downloadCsv, fmt, HOURS, initials, NAMES, rng, SITE_NAMES } from './demo-data';

type PType = 'Employee' | 'Contractor' | 'Visitor' | 'Temporary';
const TYPES: PType[] = ['Employee', 'Contractor', 'Visitor', 'Temporary'];
const ZONES = ['Lobby', 'Open Office', 'Meeting Rooms', 'Production Line', 'Canteen', 'Loading Bay', 'Labs', 'Server Room'];

interface Person {
  name: string;
  type: PType;
  dept: string;
  site: string;
  zone: string;
  floor: string;
  checkIn: string;
  dwell: number;
}

const PEOPLE: Person[] = (() => {
  const r = rng(42);
  return Array.from({ length: 140 }, (_, i) => {
    const t = r();
    const h = 6 + Math.floor(r() * 5);
    const m = Math.floor(r() * 60);
    return {
      name: NAMES[i % NAMES.length],
      type: t < 0.68 ? 'Employee' : t < 0.84 ? 'Contractor' : t < 0.93 ? 'Visitor' : 'Temporary',
      dept: DEPARTMENTS[Math.floor(r() * DEPARTMENTS.length)],
      site: SITE_NAMES[Math.floor(r() * r() * SITE_NAMES.length)],
      zone: ZONES[Math.floor(r() * ZONES.length)],
      floor: ['G', 'F1', 'F2', 'F3', 'F4'][Math.floor(r() * 5)],
      checkIn: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      dwell: Math.round((11 - h - m / 60) * 60),
    } as Person;
  });
})();

@Component({
  selector: 'app-people-presence',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="People Presence Dashboard">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export list</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="People on Site" [value]="k().onSite" icon="users" color="#8b5cf6" change="6%" />
      <app-kpi label="Employees" [value]="k().emp" icon="square-user" color="#7c3aed" change="4%" />
      <app-kpi label="Contractors" [value]="k().con" icon="hard-hat" color="#fb923c" change="4%" />
      <app-kpi label="Visitors" [value]="k().vis" icon="user-plus" color="#3b82f6" change="12%" />
      <app-kpi label="Peak Today" [value]="k().peak" icon="trending-up" color="#22c55e" sub="at 11:30 AM" />
      <app-kpi label="Avg. Dwell Time" value="7h 42m" icon="clock" color="#06b6d4" change="3%" [up]="false" [good]="false" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head">
          <h3>Arrivals &amp; Departures <span class="card-sub">today, by hour</span></h3>
        </div>
        <app-column-chart [labels]="hourLabels" [series]="flow()" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Presence by Category</h3></div>
        <app-donut [segments]="byType()" center="On Site" />
      </div>

      <div class="card span-5">
        <div class="card-head">
          <h3>Occupancy by Site</h3>
          <span class="muted">% of capacity</span>
        </div>
        <app-bar-list [rows]="bySite()" />
      </div>
      <div class="card span-7">
        <div class="card-head">
          <h3>Floor Occupancy Heatmap <span class="card-sub">Head Office</span></h3>
          <span class="muted">% of floor capacity</span>
        </div>
        <app-heatmap [rows]="floors" [cols]="heatCols" [data]="heat()" />
      </div>

      <div class="card span-12">
        <div class="card-head">
          <h3>Who's on Site <span class="card-sub">{{ filtered().length }} people</span></h3>
          <div class="toolbar">
            <div class="tabs">
              @for (t of typeTabs; track t) {
                <button [class.on]="type() === t" (click)="type.set(t); page.set(0)">{{ t }}</button>
              }
            </div>
            <select class="select" [value]="zone()" (change)="zone.set($any($event.target).value); page.set(0)">
              <option value="All">All Zones</option>
              @for (z of zones; track z) {
                <option [value]="z">{{ z }}</option>
              }
            </select>
            <label class="search-box">
              <app-icon name="search" [size]="15" />
              <input placeholder="Search name or department" [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" />
            </label>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="sortable" (click)="sortBy('name')">Name {{ arrow('name') }}</th>
                <th>Type</th>
                <th class="sortable" (click)="sortBy('dept')">Department {{ arrow('dept') }}</th>
                <th class="sortable" (click)="sortBy('site')">Site {{ arrow('site') }}</th>
                <th>Floor / Zone</th>
                <th class="sortable" (click)="sortBy('checkIn')">Check-in {{ arrow('checkIn') }}</th>
                <th class="sortable num" (click)="sortBy('dwell')">On site {{ arrow('dwell') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (p of pageRows(); track $index) {
                <tr>
                  <td><span class="avatar-sm" [style.background]="color(p.name)">{{ ini(p.name) }}</span>{{ p.name }}</td>
                  <td><span class="tag" [class]="tagClass[p.type]">{{ p.type }}</span></td>
                  <td>{{ p.dept }}</td>
                  <td>{{ p.site }}</td>
                  <td>{{ p.floor }} · {{ p.zone }}</td>
                  <td>{{ p.checkIn }}</td>
                  <td class="num">{{ dur(p.dwell) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty-note">No people match these filters</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>Showing {{ page() * size + 1 }}–{{ min((page() + 1) * size, filtered().length) }} of {{ filtered().length }}</span>
          <div class="toolbar">
            <button class="btn-ghost sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
            <button class="btn-ghost sm" [disabled]="(page() + 1) * size >= filtered().length" (click)="page.set(page() + 1)">Next</button>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class PeoplePresence {
  private readonly state = inject(AppState);
  protected readonly hourLabels = HOURS.map((h) => `${h}:00`);
  protected readonly floors = ['F4', 'F3', 'F2', 'F1', 'G', 'B1'];
  protected readonly heatCols = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  protected readonly zones = ZONES;
  protected readonly typeTabs = ['All', ...TYPES];
  protected readonly tagClass: Record<PType, string> = { Employee: 'tag', Contractor: 'tag amber', Visitor: 'tag blue', Temporary: 'tag grey' };
  protected readonly size = 10;
  protected readonly min = Math.min;
  protected readonly ini = initials;
  protected readonly color = avatarColor;

  protected readonly type = signal('All');
  protected readonly zone = signal('All');
  protected readonly q = signal('');
  protected readonly page = signal(0);
  protected readonly sort = signal<{ key: keyof Person; dir: 1 | -1 }>({ key: 'checkIn', dir: -1 });

  protected readonly k = computed(() => {
    const s = (n: number, key: string) => fmt(this.state.scale(n) + this.state.wobble(key, 30 * this.state.factor()));
    return { onSite: s(12480, 'a'), emp: s(8920, 'b'), con: s(1326, 'c'), vis: s(284, 'd'), peak: fmt(this.state.scale(13105)) };
  });
  protected readonly flow = computed(() => {
    const f = this.state.factor();
    const arr = [420, 1850, 3900, 2600, 1300, 720, 510, 640, 380, 300, 260, 210, 160, 90, 50];
    const dep = [20, 60, 140, 210, 260, 330, 560, 480, 420, 610, 1350, 2400, 1900, 900, 420];
    return [
      { name: 'Arrivals', color: '#7c3aed', values: arr.map((v) => Math.round(v * f)) },
      { name: 'Departures', color: '#38bdf8', values: dep.map((v) => Math.round(v * f)) },
    ];
  });
  protected readonly byType = computed(() => [
    { label: 'Employees', value: this.state.scale(8920), color: '#7c3aed' },
    { label: 'Contractors', value: this.state.scale(1326), color: '#3b82f6' },
    { label: 'Visitors', value: this.state.scale(284), color: '#22c1a0' },
    { label: 'Temporary', value: this.state.scale(520), color: '#22c55e' },
    { label: 'Others', value: this.state.scale(1430), color: '#c4c9d6' },
  ]);
  protected readonly bySite = computed(() => {
    this.state.tick();
    const base = [78, 62, 86, 54, 71, 48];
    return SITE_NAMES.map((label, i) => {
      const v = Math.min(99, base[i] + this.state.wobble(label, 2));
      return { label, value: v, display: `${v}%` };
    });
  });
  protected readonly heat = computed(() => {
    const t = this.state.tick();
    const curve = [25, 55, 80, 88, 92, 70, 78, 86, 84, 72, 45, 20];
    return this.floors.map((f, fi) => curve.map((c, ci) => Math.max(4, Math.min(99, Math.round(c * (1 - fi * 0.08) + Math.sin(fi * 3 + ci + t / 3) * 5)))));
  });

  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const site = this.state.site();
    const { key, dir } = this.sort();
    return PEOPLE.filter(
      (p) =>
        (this.type() === 'All' || p.type === this.type()) &&
        (this.zone() === 'All' || p.zone === this.zone()) &&
        (site.factor === 1 || p.site === site.name) &&
        (!q || `${p.name} ${p.dept}`.toLowerCase().includes(q)),
    ).sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
  });
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.size, (this.page() + 1) * this.size));

  protected dur(m: number) {
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  protected sortBy(key: keyof Person) {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  }
  protected arrow(key: keyof Person) {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }
  protected exportCsv() {
    downloadCsv('people-on-site.csv', [
      ['Name', 'Type', 'Department', 'Site', 'Floor', 'Zone', 'Check-in'],
      ...this.filtered().map((p) => [p.name, p.type, p.dept, p.site, p.floor, p.zone, p.checkIn]),
    ]);
  }
}
