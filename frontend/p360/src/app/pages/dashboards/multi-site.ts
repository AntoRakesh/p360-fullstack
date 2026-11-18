import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { fmt } from './demo-data';

interface SiteRow {
  name: string;
  city: string;
  people: number;
  capacity: number;
  attendance: number;
  visitors: number;
  contractors: number;
  alerts: number;
  devices: number;
}

const SITES: SiteRow[] = [
  { name: 'Head Office', city: 'Dubai', people: 4240, capacity: 5400, attendance: 97.4, visitors: 118, contractors: 286, alerts: 5, devices: 99.6 },
  { name: 'Manufacturing', city: 'Abu Dhabi', people: 3620, capacity: 5800, attendance: 96.1, visitors: 64, contractors: 512, alerts: 4, devices: 98.9 },
  { name: 'Warehouse', city: 'Jebel Ali', people: 2370, capacity: 2750, attendance: 95.8, visitors: 41, contractors: 304, alerts: 3, devices: 97.2 },
  { name: 'Logistics Hub', city: 'Sharjah', people: 1250, capacity: 2300, attendance: 96.9, visitors: 32, contractors: 138, alerts: 1, devices: 100 },
  { name: 'Retail Stores', city: '12 locations', people: 760, capacity: 1070, attendance: 94.2, visitors: 22, contractors: 52, alerts: 1, devices: 96.4 },
  { name: 'Data Center', city: 'Dubai South', people: 240, capacity: 500, attendance: 99.1, visitors: 7, contractors: 34, alerts: 0, devices: 100 },
];

@Component({
  selector: 'app-multi-site',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Multi-Site Operations">
      <div class="tabs">
        <button [class.on]="view() === 'cards'" (click)="view.set('cards')">Cards</button>
        <button [class.on]="view() === 'table'" (click)="view.set('table')">Table</button>
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Sites" value="6" icon="building" color="var(--ka-8b5cf6)" sub="all reporting" />
      <app-kpi label="Total People" [value]="total().people" icon="users" color="var(--ka-3b82f6)" change="6%" />
      <app-kpi label="Avg. Occupancy" [value]="total().occ + '%'" icon="activity" color="var(--ka-22c55e)" change="3%" />
      <app-kpi label="Sites Needing Attention" [value]="total().attention" icon="triangle-alert" color="var(--ka-f97316)" sub="alerts ≥ 3" />
      <app-kpi label="Open Alerts" [value]="total().alerts" icon="bell" color="var(--ka-ef4444)" change="30%" [up]="false" />
    </section>

    @if (view() === 'cards') {
      <section class="site-grid">
        @for (s of rows(); track s.name) {
          <div class="card site" [class.current]="state.site().name === s.name">
            <div class="site-top">
              <div>
                <b>{{ s.name }}</b>
                <span class="muted">{{ s.city }}</span>
              </div>
              <span class="tag" [class.green]="s.alerts < 3" [class.amber]="s.alerts >= 3">{{ s.alerts < 3 ? 'Normal' : 'Attention' }}</span>
            </div>
            <div class="site-mid">
              <app-ring [value]="s.occ" [size]="74" [color]="s.occ > 85 ? 'var(--ka-ef4444)' : 'var(--ka-7c3aed)'" />
              <dl>
                <dt>People</dt><dd>{{ s.peopleFmt }}</dd>
                <dt>Attendance</dt><dd>{{ s.attendance }}%</dd>
                <dt>Visitors</dt><dd>{{ s.visitors }}</dd>
                <dt>Contractors</dt><dd>{{ s.contractors }}</dd>
              </dl>
            </div>
            <div class="site-foot">
              <span><i [class.bad-dot]="s.alerts > 0"></i>{{ s.alerts }} open alerts</span>
              <span>Devices {{ s.devices }}%</span>
              <button class="link" (click)="focus(s.name)">{{ state.site().name === s.name ? 'Viewing' : 'Focus site →' }}</button>
            </div>
          </div>
        }
      </section>
    } @else {
      <div class="card" style="margin-bottom: 12px">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                @for (c of cols; track c.key) {
                  <th class="sortable" [class.num]="c.key !== 'name'" (click)="sortBy(c.key)">{{ c.label }} {{ arrow(c.key) }}</th>
                }
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows(); track s.name) {
                <tr [class.selected]="state.site().name === s.name">
                  <td><b>{{ s.name }}</b> <span class="muted">{{ s.city }}</span></td>
                  <td class="num">{{ s.peopleFmt }}</td>
                  <td class="num">{{ s.occ }}%</td>
                  <td class="num">{{ s.attendance }}%</td>
                  <td class="num">{{ s.visitors }}</td>
                  <td class="num">{{ s.contractors }}</td>
                  <td class="num" [class.bad]="s.alerts >= 3">{{ s.alerts }}</td>
                  <td class="num">{{ s.devices }}%</td>
                  <td><button class="link" (click)="focus(s.name)">Focus</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>People vs Capacity by Site</h3></div>
        <app-column-chart [labels]="labels" [series]="capSeries()" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Attendance Rate by Site</h3></div>
        <app-bar-list [rows]="attRows()" />
      </div>
    </section>
  `,
  styles: `
    .site-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .site { display: flex; flex-direction: column; gap: 12px; transition: box-shadow 0.15s; }
    .site:hover { box-shadow: 0 6px 18px rgba(20, 20, 60, 0.08); }
    .site.current { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .site-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .site-top div { display: flex; flex-direction: column; } .site-top b { font-size: 15px; }
    .site-mid { display: flex; align-items: center; gap: 18px; }
    .site-mid dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; font-size: 12.5px; }
    .site-mid dt { color: var(--muted); } .site-mid dd { margin: 0; font-weight: 600; text-align: right; }
    .site-foot { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--kf-4b4f6b); border-top: 1px solid var(--kl-f0f1f6); padding-top: 10px; }
    .site-foot i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--kb-22c55e); margin-right: 6px; }
    .site-foot i.bad-dot { background: var(--kb-ef4444); }
  `,
})
export class MultiSite {
  protected readonly state = inject(AppState);
  protected readonly view = signal<'cards' | 'table'>('cards');
  protected readonly labels = SITES.map((s) => s.name.split(' ')[0]);
  protected readonly cols: { key: keyof SiteRow | 'occ'; label: string }[] = [
    { key: 'name', label: 'Site' },
    { key: 'people', label: 'People' },
    { key: 'occ', label: 'Occupancy' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'visitors', label: 'Visitors' },
    { key: 'contractors', label: 'Contractors' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'devices', label: 'Devices' },
  ];
  protected readonly sort = signal<{ key: string; dir: 1 | -1 }>({ key: 'people', dir: -1 });

  private readonly live = computed(() =>
    SITES.map((s) => {
      const people = s.people + this.state.wobble(s.name, s.people * 0.004);
      return { ...s, people, peopleFmt: fmt(people), occ: Math.round((people / s.capacity) * 100) };
    }),
  );
  protected readonly rows = computed(() => {
    const { key, dir } = this.sort();
    return [...this.live()].sort((a, b) => {
      const x = a[key as keyof typeof a];
      const y = b[key as keyof typeof b];
      return x > y ? dir : x < y ? -dir : 0;
    });
  });
  protected readonly total = computed(() => {
    const l = this.live();
    const people = l.reduce((a, s) => a + s.people, 0);
    const cap = l.reduce((a, s) => a + s.capacity, 0);
    return {
      people: fmt(people),
      occ: Math.round((people / cap) * 100),
      alerts: l.reduce((a, s) => a + s.alerts, 0),
      attention: l.filter((s) => s.alerts >= 3).length,
    };
  });
  protected readonly capSeries = computed(() => [
    { name: 'People on site', color: 'var(--ka-7c3aed)', values: this.live().map((s) => s.people) },
    { name: 'Capacity', color: 'var(--ka-ddd6fe)', values: SITES.map((s) => s.capacity) },
  ]);
  protected readonly attRows = computed(() =>
    SITES.map((s) => ({ label: s.name, value: s.attendance, display: `${s.attendance}%`, color: s.attendance < 95 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' })),
  );

  protected sortBy(key: string) {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  }
  protected arrow(key: string) {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }
  /** Sets the global site filter used by every dashboard. */
  protected focus(name: string) {
    const site = this.state.sites.find((s) => s.name === name);
    if (site) this.state.site.set(this.state.site() === site ? this.state.sites[0] : site);
  }
}
