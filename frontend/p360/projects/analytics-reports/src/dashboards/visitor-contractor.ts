import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { avatarColor, COMPANIES, fmt, HOURS, initials, NAMES, rng, SITE_NAMES } from '@p360/shared/data/demo-data';

type VStatus = 'Expected' | 'Checked-in' | 'Checked-out' | 'Overstay';
interface Visitor {
  id: number;
  name: string;
  company: string;
  host: string;
  purpose: string;
  site: string;
  eta: string;
  status: VStatus;
}
interface Permit {
  company: string;
  worker: string;
  permit: string;
  days: number;
}

const PURPOSES = ['Meeting', 'Interview', 'Delivery', 'Maintenance', 'Audit', 'Training'];
const GUEST_COS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Ltd', 'Stark Industries', 'Wayne Enterprises', 'Hooli', 'Vandelay Imports'];

@Component({
  selector: 'app-visitor-contractor',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor &amp; Contractor Dashboard" />

    <section class="kpi-row">
      <app-kpi label="Visitors on Site" [value]="counts().onSite" icon="user-plus" color="var(--ka-3b82f6)" change="12%" />
      <app-kpi label="Expected Today" [value]="counts().expected" icon="calendar-days" color="var(--ka-8b5cf6)" sub="pre-registered" />
      <app-kpi label="Checked Out" [value]="counts().out" icon="door-open" color="var(--ka-22c55e)" sub="so far today" />
      <app-kpi label="Overstays" [value]="counts().over" icon="clock" color="var(--ka-ef4444)" sub="past expected exit" />
      <app-kpi label="Contractors on Site" [value]="contractors()" icon="hard-hat" color="var(--ka-fb923c)" change="4%" />
      <app-kpi label="Permits Expiring" [value]="permits.length" icon="key-round" color="var(--ka-f59e0b)" sub="next 7 days" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Visitor Arrivals by Hour</h3></div>
        <app-line-chart [labels]="hours" [series]="arrivals()" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Visit Purpose</h3></div>
        <app-donut [segments]="purpose()" center="Visitors" />
      </div>

      <div class="card span-8">
        <div class="card-head">
          <h3>Today's Visitors</h3>
          <div class="toolbar">
            <div class="tabs">
              @for (t of statusTabs; track t) {
                <button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}<span class="count">{{ tabCount(t) }}</span></button>
              }
            </div>
            <label class="search-box">
              <app-icon name="search" [size]="15" />
              <input placeholder="Search visitor or host" [value]="q()" (input)="q.set($any($event.target).value)" />
            </label>
          </div>
        </div>
        <div class="table-wrap tall">
          <table class="table">
            <thead><tr><th>Visitor</th><th>Company</th><th>Host</th><th>Purpose</th><th>ETA</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (v of shown(); track v.id) {
                <tr>
                  <td><span class="avatar-sm" [style.background]="color(v.name)">{{ ini(v.name) }}</span>{{ v.name }}</td>
                  <td>{{ v.company }}</td>
                  <td>{{ v.host }}</td>
                  <td>{{ v.purpose }}</td>
                  <td>{{ v.eta }}</td>
                  <td><span class="tag" [class]="statusClass[v.status]">{{ v.status }}</span></td>
                  <td>
                    @switch (v.status) {
                      @case ('Expected') { <button class="btn-primary btn-sm" (click)="setStatus(v, 'Checked-in')">Check in</button> }
                      @case ('Checked-in') { <button class="btn-ghost sm" (click)="setStatus(v, 'Checked-out')">Check out</button> }
                      @case ('Overstay') { <button class="btn-ghost sm danger" (click)="setStatus(v, 'Checked-out')">Check out</button> }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty-note">No visitors</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Contractors by Company</h3></div>
        <app-bar-list [rows]="byCompany()" [max]="byCompany()[0].value" />
      </div>

      <div class="card span-6">
        <div class="card-head"><h3>Permits &amp; Inductions Expiring</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Worker</th><th>Company</th><th>Document</th><th class="num">Expires</th></tr></thead>
            <tbody>
              @for (p of permits; track p.worker + p.permit) {
                <tr>
                  <td>{{ p.worker }}</td>
                  <td>{{ p.company }}</td>
                  <td>{{ p.permit }}</td>
                  <td class="num"><span class="tag" [class.red]="p.days <= 1" [class.amber]="p.days > 1">{{ p.days === 0 ? 'Today' : 'in ' + p.days + ' d' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Visitors by Site</h3></div>
        <app-column-chart [labels]="siteLabels" [series]="bySite()" [height]="230" />
      </div>
    </section>

    @if (toast()) {
      <div class="g-toast">{{ toast() }}</div>
    }
  `,
  styles: `.tall { max-height: 420px; }`,
})
export class VisitorContractor {
  private readonly state = inject(AppState);
  protected readonly hours = HOURS.map((h) => `${h}:00`);
  protected readonly ini = initials;
  protected readonly color = avatarColor;
  protected readonly statusTabs = ['All', 'Expected', 'Checked-in', 'Overstay', 'Checked-out'];
  protected readonly statusClass: Record<VStatus, string> = { Expected: 'tag blue', 'Checked-in': 'tag green', 'Checked-out': 'tag grey', Overstay: 'tag red' };
  protected readonly siteLabels = SITE_NAMES.map((s) => s.split(' ')[0]);
  protected readonly tab = signal('All');
  protected readonly q = signal('');
  protected readonly toast = signal<string | null>(null);

  protected readonly visitors = signal<Visitor[]>(
    (() => {
      const r = rng(11);
      return Array.from({ length: 36 }, (_, i) => {
        const t = r();
        const h = 8 + Math.floor(r() * 8);
        return {
          id: i,
          name: NAMES[(i * 7) % NAMES.length],
          company: GUEST_COS[i % GUEST_COS.length],
          host: NAMES[(i * 3 + 5) % NAMES.length],
          purpose: PURPOSES[Math.floor(r() * PURPOSES.length)],
          site: SITE_NAMES[i % 3],
          eta: `${String(h).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`,
          status: (t < 0.35 ? 'Checked-in' : t < 0.65 ? 'Expected' : t < 0.9 ? 'Checked-out' : 'Overstay') as VStatus,
        };
      });
    })(),
  );
  protected readonly permits: Permit[] = [
    { worker: 'Ramesh Kumar', company: 'BuildRight LLC', permit: 'Hot Work Permit', days: 0 },
    { worker: 'Ibrahim Musa', company: 'Spark Electricals', permit: 'Electrical Isolation', days: 1 },
    { worker: 'Lucas Silva', company: 'TechServe FM', permit: 'Site Induction', days: 2 },
    { worker: 'Kenji Sato', company: 'SafeGuard Security', permit: 'Guard Licence', days: 3 },
    { worker: 'Tom Baker', company: 'BuildRight LLC', permit: 'Working at Height', days: 4 },
    { worker: 'Aisha Bello', company: 'CleanPro Services', permit: 'Chemical Handling', days: 6 },
  ];

  protected readonly counts = computed(() => {
    const v = this.visitors();
    const extra = (s: VStatus) => this.state.scale({ 'Checked-in': 284, Expected: 342, 'Checked-out': 129, Overstay: 7 }[s]) - v.filter((x) => x.status === s).length;
    const n = (s: VStatus) => Math.max(0, v.filter((x) => x.status === s).length + Math.max(extra(s), 0));
    return { onSite: fmt(n('Checked-in')), expected: fmt(n('Expected')), out: fmt(n('Checked-out')), over: fmt(Math.max(1, Math.round(7 * Math.sqrt(this.state.factor())))) };
  });
  protected readonly contractors = computed(() => fmt(this.state.scale(1326) + this.state.wobble('con', 5)));
  protected readonly arrivals = computed(() => {
    const f = this.state.factor();
    const base = [2, 12, 38, 61, 54, 40, 22, 30, 36, 28, 18, 10, 6, 3, 1];
    return [
      { name: 'Today', color: 'var(--ka-3b82f6)', values: base.map((v) => Math.round(v * f * 1.1)), area: true },
      { name: 'Last week avg', color: 'var(--ka-c4b5fd)', values: base.map((v, i) => Math.round(v * f * (0.85 + (i % 3) * 0.05))), dashed: true },
    ];
  });
  protected readonly purpose = computed(() =>
    PURPOSES.map((label, i) => ({ label, value: this.state.scale([118, 34, 52, 41, 18, 21][i]), color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c1a0)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-9ca3af)'][i] })),
  );
  protected readonly byCompany = computed(() =>
    COMPANIES.map((label, i) => ({ label, value: this.state.scale([412, 286, 231, 188, 126, 83][i]), color: 'var(--ka-fb923c)' })),
  );
  protected readonly bySite = computed(() => [
    { name: 'Visitors', color: 'var(--ka-3b82f6)', values: [118, 64, 41, 32, 22, 7].map((v) => this.state.scale(v)) },
    { name: 'Contractors', color: 'var(--ka-fb923c)', values: [286, 512, 304, 138, 52, 34].map((v) => this.state.scale(v)) },
  ]);
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.visitors().filter((v) => (this.tab() === 'All' || v.status === this.tab()) && (!q || `${v.name} ${v.host} ${v.company}`.toLowerCase().includes(q)));
  });

  protected tabCount(t: string) {
    return t === 'All' ? this.visitors().length : this.visitors().filter((v) => v.status === t).length;
  }
  protected setStatus(v: Visitor, status: VStatus) {
    this.visitors.update((list) => list.map((x) => (x.id === v.id ? { ...x, status } : x)));
    this.toast.set(`${v.name} ${status === 'Checked-in' ? 'checked in · badge printed' : 'checked out'}`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
