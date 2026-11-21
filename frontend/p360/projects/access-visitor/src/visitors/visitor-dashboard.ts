import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { CamScene } from '@p360/shared/visuals/cam-scene';
import { VisitorStore } from './visitor-store';
import { COMPANIES, duration, fmtTime, HOSTS, METHOD_COLORS, METHODS, PURPOSES, TYPE_COLORS, TYPES, Visit } from './visitors.data';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const CAMS = ['Main Entrance', 'Side Entrance', 'Parking Gate', 'Reception'];
const PURPOSE_COLORS = ['var(--ka-8b5cf6)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f97316)', 'var(--ka-ef4444)', 'var(--ka-ec4899)', 'var(--ka-0ea5e9)', 'var(--ka-3b82f6)'];

@Component({
  selector: 'app-visitor-dashboard',
  imports: [...UI, DataTable, CamScene, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Dashboard" parent="Visitor Management" parentLink="/visitor-management" subtitle="Real-time overview of visitor activity, arrivals, check-ins and site status.">
      <div class="split menu-wrap">
        <button class="btn-primary" (click)="openForm('pre')"><app-icon name="plus" [size]="16" />Pre-Register Visitor</button>
        <button class="btn-primary caret" (click)="menu.set(menu() === 'pre' ? null : 'pre')" aria-label="More"><app-icon name="chevron-down" [size]="15" /></button>
        @if (menu() === 'pre') {
          <div class="dropdown">
            <button class="dd-item" (click)="openForm('pre')">Single visitor</button>
            <a class="dd-item" routerLink="/visitor-management/pre-registration">Group / recurring invite</a>
          </div>
        }
      </div>
      <button class="btn-ghost" (click)="openForm('walk')"><app-icon name="user-plus" [size]="16" />Walk-in Visitor</button>
      <a class="btn-ghost" routerLink="/visitor-management/visitor-analytics-reports"><app-icon name="download" [size]="16" class="up" />View Reports</a>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="menu.set(menu() === 'more' ? null : 'more')" aria-label="More">⋮</button>
        @if (menu() === 'more') {
          <div class="dropdown">
            <a class="dd-item" routerLink="/visitor-management/visitor-check-in-check-out">Check-in desk</a>
            <a class="dd-item" routerLink="/visitor-management/visitor-logs-history">Visitor logs</a>
            <a class="dd-item" routerLink="/visitor-management/visitor-categories-rules">Settings</a>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Visitors (Today)" [value]="total()" icon="users" color="var(--ka-8b5cf6)" change="12%" />
      <app-kpi label="Checked In" [value]="checkedIn()" [extra]="pct(checkedIn())" icon="shield-check" color="var(--ka-22c55e)" sub="arrived today" />
      <app-kpi label="Expected Today" [value]="expected()" icon="clock" color="var(--ka-f97316)" [sub]="upcoming() + ' upcoming (next hour)'" />
      <app-kpi label="Checked Out" [value]="c('Checked Out')" [extra]="pct(c('Checked Out'))" icon="door-open" color="var(--ka-ef4444)" sub="left site" />
      <app-kpi label="Currently On-Site" [value]="c('Checked In')" icon="users" color="var(--ka-a855f7)" [sub]="state.live() ? '● Live' : 'paused'" />
    </section>

    <section class="vd">
      <div class="card trend">
        <div class="card-head"><h3>Visitor Trend</h3></div>
        <app-column-chart [labels]="hourLabels" [series]="trend()" [height]="200" />
      </div>
      <div class="card types">
        <div class="card-head"><h3>Visitor Types</h3></div>
        <app-donut [segments]="types()" center="Total Visitors" [size]="140" />
      </div>
      <div class="card purpose">
        <div class="card-head"><h3>Visit Purpose</h3></div>
        <ul class="pl">
          @for (p of purposes(); track p.label) {
            <li><span>{{ p.label }}</span><div class="bar"><i [style.width.%]="p.pct * 2" [style.background]="p.color"></i></div><b>{{ p.pct }}%</b></li>
          }
        </ul>
      </div>

      <div class="card activity">
        <div class="card-head"><h3>Live Visitor Activity</h3><a class="link" routerLink="/visitor-management/visitor-logs-history">View All</a></div>
        <app-data-table [rows]="activity()" [columns]="cols" [actions]="actions" [pageSize]="8" noun="visits" (rowClick)="detail.set($event)" (action)="act($event.action, $event.row)" />
      </div>
      <div class="card cam">
        <div class="card-head">
          <h3>Live Camera Feed</h3>
          <div class="toolbar">
            <select class="select sm" [value]="cam()" (change)="cam.set(+$any($event.target).value)">@for (c of cams; track c; let i = $index) {<option [value]="i">{{ c }}</option>}</select>
            <button class="mini" (click)="fullscreen()" aria-label="Full screen"><app-icon name="maximize" [size]="15" /></button>
          </div>
        </div>
        <div class="feed">
          <app-cam-scene [variant]="cam()" [box]="true" [tick]="state.tick()" />
          @if (latest(); as v) {
            <div class="recog">
              <span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span>
              <div><b>{{ v.name }}</b><small>{{ v.company }}</small><em>{{ v.purpose }}</em></div>
              <div class="rf"><span class="ok">● Checked In</span><span>{{ fmt(v.checkIn) }}</span></div>
            </div>
          }
        </div>
        <div class="thumbs">
          @for (c of cams; track c; let i = $index) {
            <button [class.on]="cam() === i" (click)="cam.set(i)"><app-cam-scene [variant]="i" [tick]="state.tick() + i" /><span>{{ c }}</span></button>
          }
        </div>
      </div>
      <div class="card onsite">
        <div class="card-head"><h3>On-Site Visitors</h3><a class="link" routerLink="/visitor-management/visitor-check-in-check-out">View All</a></div>
        <ul class="os">
          @for (v of onsiteList(); track v.id) {
            <li (click)="detail.set(v)">
              <span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span>
              <div><b>{{ v.name }}</b><small>{{ v.company }}</small><small>{{ v.purpose }}</small>@if (v.location) {<small class="muted">{{ v.location }}</small>}</div>
              <span class="dur">{{ dur(v.checkIn) }}</span>
            </li>
          }
        </ul>
      </div>

      <div class="card methods">
        <div class="card-head"><h3>Visitor Check-in Methods</h3></div>
        <app-donut [segments]="methods()" center="Total" [size]="140" />
      </div>
      <div class="card veh">
        <div class="card-head"><h3>Vehicle Arrivals (Today)</h3><a class="link" routerLink="/visitor-management/vehicle-management">View All</a></div>
        <table class="table">
          <thead><tr><th>Time</th><th>Vehicle No</th><th>Driver</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            @for (x of vehicles(); track x.id) {
              <tr><td>{{ fmt(x.time) }}</td><td><b>{{ x.plate }}</b></td><td>{{ x.driver }}</td><td>{{ x.type }}</td>
                <td><span class="dt-status" [class]="x.status === 'In' ? 'dt-status green' : 'dt-status red'"><i></i>{{ x.status }}</span></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card quick">
        <div class="card-head"><h3>Quick Actions</h3></div>
        <div class="qa">
          <button (click)="openForm('pre')"><app-icon name="user-plus" [size]="20" />Pre-Register Visitor</button>
          <a routerLink="/visitor-management/walk-in-registration"><app-icon name="user-check" [size]="20" />Walk-in Registration</a>
          <a routerLink="/visitor-management/visitor-approvals"><app-icon name="file-check" [size]="20" />Approve Visitors</a>
          <a routerLink="/visitor-management/visitor-passes-badges"><app-icon name="id-card" [size]="20" />Print Gate Pass</a>
          <a routerLink="/visitor-management/host-management"><app-icon name="users" [size]="20" />Manage Hosts</a>
          <a routerLink="/visitor-management/watchlist-blacklist"><app-icon name="shield" [size]="20" />Blacklist / Watchlist</a>
          <a routerLink="/visitor-management/visitor-analytics-reports"><app-icon name="file-chart" [size]="20" />Visitor Reports</a>
          <a routerLink="/visitor-management/visitor-categories-rules"><app-icon name="settings" [size]="20" />Settings</a>
        </div>
      </div>
    </section>

    @if (detail(); as v) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <aside class="g-drawer">
        <div class="card-head"><h3>{{ v.name }}</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
        <span class="dt-status" [class]="statusCls(v.status)"><i></i>{{ v.status }}</span>
        <dl class="kv">
          <dt>Company</dt><dd>{{ v.company }}</dd><dt>Purpose</dt><dd>{{ v.purpose }}</dd><dt>Host</dt><dd>{{ v.host }} ({{ v.hostDept }})</dd>
          <dt>Location</dt><dd>{{ v.location }}</dd><dt>Expected</dt><dd>{{ fmt(v.expected) }}</dd><dt>Check-in</dt><dd>{{ fmt(v.checkIn) }}</dd><dt>Check-out</dt><dd>{{ fmt(v.checkOut) }}</dd>
          <dt>Badge</dt><dd>{{ v.badge || '—' }}</dd><dt>Vehicle</dt><dd>{{ v.vehicle || '—' }}</dd><dt>ID</dt><dd>{{ v.idType }}</dd><dt>Method</dt><dd>{{ v.method }}</dd>
          <dt>Phone</dt><dd>{{ v.phone }}</dd><dt>Email</dt><dd>{{ v.email }}</dd>
        </dl>
        <div class="toolbar">
          @if (v.status === 'Expected') {<button class="btn-primary" (click)="act('checkin', v)">Check in</button>}
          @if (v.status === 'Pending Approval') {<button class="btn-primary" (click)="act('approve', v)">Approve</button><button class="btn-ghost danger" (click)="act('reject', v)">Reject</button>}
          @if (v.status === 'Checked In') {<button class="btn-primary" (click)="act('checkout', v)">Check out</button>}
        </div>
      </aside>
    }

    @if (form(); as mode) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); submit(mode, n.value, co.value, em.value, ph.value, pu.value, ho.value, ti.value, vh.value)">
        <div class="modal-head"><h3>{{ mode === 'pre' ? 'Pre-Register Visitor' : 'Walk-in Visitor' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Visitor name *<input #n class="input" required (input)="screenName.set($any($event.target).value)" /></label>
          <label>Company *<input #co class="input" list="vd-co" required /><datalist id="vd-co">@for (c of companies; track c) {<option [value]="c"></option>}</datalist></label>
          <label>Email<input #em class="input" type="email" /></label>
          <label>Phone<input #ph class="input" /></label>
          <label>Purpose<select #pu class="select">@for (p of purposeList; track p) {<option>{{ p }}</option>}</select></label>
          <label>Host *<input #ho class="input" list="vd-hosts" required /><datalist id="vd-hosts">@for (h of hosts; track h) {<option [value]="h"></option>}</datalist></label>
          <label>{{ mode === 'pre' ? 'Expected time' : 'Arrival time' }}<input #ti class="input" type="time" [value]="mode === 'pre' ? inHour : nowTime" [disabled]="mode === 'walk'" /></label>
          <label>Vehicle no. (optional)<input #vh class="input" /></label>
        </div>
        @if (hit(); as w) {<p class="hit"><app-icon name="triangle-alert" [size]="16" />Watchlist match: <b>{{ w.name }}</b> — {{ w.type }} · {{ w.reason }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ mode === 'pre' ? 'Send invitation' : 'Check in & print badge' }}</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .split { display: flex; } .split .btn-primary:first-child { border-radius: 8px 0 0 8px; }
    .caret { border-radius: 0 8px 8px 0 !important; padding: 8px 9px !important; border-left: 1px solid rgba(255,255,255,.3) !important; }
    .up { transform: rotate(180deg); } .danger { color: var(--red); }
    .vd { display: grid; grid-template-columns: 1.4fr 1fr 0.85fr; gap: 12px; }
    .vd > .card { min-width: 0; }
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; }
    .activity ::ng-deep .table.dt th, .activity ::ng-deep .table.dt td { padding: 6px 3px; font-size: 11px; }
    .activity ::ng-deep .table.dt td:first-child { white-space: nowrap; }
    .activity ::ng-deep .dt-av { width: 26px; height: 26px; font-size: 10px; }
    .activity ::ng-deep .dt-person { gap: 6px; } .activity ::ng-deep .dt-person b { white-space: nowrap; }
    .activity ::ng-deep .dt-status { font-size: 11px; }
    .pl { list-style: none; margin: 0; padding: 0; } .pl li { display: grid; grid-template-columns: 1fr 110px 44px; gap: 10px; align-items: center; padding: 5px 0; font-size: 12.5px; }
    .pl b { font-weight: 500; text-align: right; } .bar { height: 10px; background: var(--kb-eef0f6); border-radius: 2px; overflow: hidden; } .bar i { display: block; height: 100%; }
    .mini { width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 7px; background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; }
    .feed { position: relative; height: 230px; border-radius: 8px; overflow: hidden; } .feed app-cam-scene { position: absolute; inset: 0; }
    .recog { position: absolute; right: 10px; bottom: 10px; display: grid; grid-template-columns: 34px 1fr; gap: 4px 10px; padding: 8px 10px; border-radius: 8px; background: var(--kb-ffffff); box-shadow: 0 6px 18px rgba(0,0,0,.25); font-size: 11.5px; min-width: 190px; }
    .recog div { display: flex; flex-direction: column; } .recog small { color: var(--kf-4b4f6b); } .recog em { font-style: normal; color: var(--primary); }
    .rf { grid-column: 1 / -1; flex-direction: row !important; justify-content: space-between; padding-top: 4px; border-top: 1px solid var(--kl-f0f1f6); } .ok { color: var(--kf-16a34a); font-weight: 600; }
    .thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
    .thumbs button { position: relative; height: 58px; border: 2px solid transparent; border-radius: 6px; overflow: hidden; padding: 0; cursor: pointer; }
    .thumbs app-cam-scene { position: absolute; inset: 0; } .thumbs button.on { border-color: var(--primary); }
    .thumbs span { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.55); color: var(--kf-ffffff); font-size: 9.5px; padding: 1px 4px; }
    .os { list-style: none; margin: 0; padding: 0; } .os li { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: start; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; font-size: 12px; }
    .os li:hover { background: var(--kb-faf8ff); } .os div { display: flex; flex-direction: column; line-height: 1.35; } .os small { color: var(--kf-4b4f6b); font-size: 11px; }
    .dur { padding: 3px 9px; border-radius: 6px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-size: 11.5px; font-weight: 600; }
    .veh .table { font-size: 12px; } .veh th, .veh td { padding: 7px 6px; }
    .qa { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .qa button, .qa a { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); color: var(--kf-3b3f5c); font-size: 11px; text-align: center; cursor: pointer; text-decoration: none; }
    .qa button:hover, .qa a:hover { border-color: var(--kl-c4b5fd); background: var(--kb-faf8ff); } .qa app-icon { color: var(--primary); }
    .kv { display: grid; grid-template-columns: 90px 1fr; gap: 7px; font-size: 13px; margin: 12px 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    .hit { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 8px; background: var(--kb-fef2f2); color: var(--kf-991b1b); font-size: 13px; }
    @media (max-width: 1350px) { .vd { grid-template-columns: 1fr 1fr; } .activity { grid-column: span 2; } }
    @media (max-width: 860px) { .vd { grid-template-columns: 1fr; } .activity { grid-column: auto; } }
  `,
})
export class VisitorDashboard {
  protected readonly state = inject(AppState);
  protected readonly store = inject(VisitorStore);
  private readonly router = inject(Router);
  protected readonly cams = CAMS;
  protected readonly hosts = HOSTS;
  protected readonly companies = COMPANIES;
  protected readonly purposeList = PURPOSES;
  protected readonly hourLabels = HOURS.map((h) => `${((h + 11) % 12) + 1}${h < 12 ? 'AM' : 'PM'}`);
  protected readonly fmt = fmtTime;
  protected readonly menu = signal<'pre' | 'more' | null>(null);
  protected readonly cam = signal(0);
  protected readonly detail = signal<Visit | null>(null);
  protected readonly form = signal<'pre' | 'walk' | null>(null);
  protected readonly screenName = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly nowTime = new Date().toTimeString().slice(0, 5);
  protected readonly inHour = new Date(Date.now() + 3600000).toTimeString().slice(0, 5);

  protected readonly cols: Col[] = [
    { key: 'activityTime', label: 'Time', fmt: (v) => fmtTime(v) },
    { key: 'name', label: 'Visitor', kind: 'person' },
    { key: 'company', label: 'Company' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'host', label: 'Host' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'user' },
    { id: 'checkin', label: 'Check in', icon: 'user-check', when: (r) => r.status === 'Expected' },
    { id: 'approve', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending Approval' },
    { id: 'reject', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending Approval' },
    { id: 'checkout', label: 'Check out', icon: 'door-open', when: (r) => r.status === 'Checked In' },
    { id: 'badge', label: 'Print badge', icon: 'id-card', when: (r) => r.status === 'Checked In' },
  ];

  constructor() {
    // Live: an expected visitor arrives about every 20 s.
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 8) return;
      const next = this.store.visits().filter((v) => v.status === 'Expected').sort((a, b) => a.expected - b.expected)[0];
      if (next) this.store.checkIn(next.id);
    });
  }

  protected readonly total = computed(() => this.store.visits().length);
  protected c(s: string) {
    return this.store.counts()[s] ?? 0;
  }
  protected readonly checkedIn = computed(() => this.c('Checked In') + this.c('Checked Out'));
  protected readonly expected = computed(() => this.c('Expected') + this.c('Pending Approval'));
  protected readonly upcoming = computed(() => this.store.visits().filter((v) => (v.status === 'Expected' || v.status === 'Pending Approval') && v.expected <= Date.now() + 3600000).length);
  protected pct(n: number) {
    return `${((n / (this.total() || 1)) * 100).toFixed(1)}%`;
  }
  protected readonly activity = computed(() =>
    this.store
      .visits()
      .map((v) => ({ ...v, activityTime: v.checkOut ?? v.checkIn ?? v.expected }))
      .filter((v) => v.activityTime <= Date.now() && v.status !== 'Expected')
      .sort((a, b) => b.activityTime - a.activityTime),
  );
  protected readonly latest = computed(() => this.store.onSite().slice().sort((a, b) => (b.checkIn ?? 0) - (a.checkIn ?? 0))[this.cam()] ?? null);
  protected readonly onsiteList = computed(() => {
    this.state.tick();
    const l = this.store.onSite().filter((v) => v.checkIn && Date.now() - v.checkIn > 25 * 60000 && Date.now() - v.checkIn < 3 * 3600000);
    return l.sort((a, b) => (a.checkIn ?? 0) - (b.checkIn ?? 0)).slice(0, 5);
  });
  protected readonly trend = computed(() => {
    const vs = this.store.visits();
    const hourOf = (t: number | null) => (t ? new Date(t).getHours() : -1);
    const nowH = new Date().getHours();
    return [
      { name: 'Expected', color: 'var(--ka-7c3aed)', values: HOURS.map((h) => vs.filter((v) => hourOf(v.expected) === h).length + (h > nowH ? 0 : 0)) },
      { name: 'Checked In', color: 'var(--ka-34d399)', values: HOURS.map((h) => vs.filter((v) => hourOf(v.checkIn) === h).length) },
      { name: 'Checked Out', color: 'var(--ka-a78bfa)', values: HOURS.map((h) => vs.filter((v) => hourOf(v.checkOut) === h).length), line: true },
    ];
  });
  protected readonly types = computed(() => TYPES.map((t, i) => ({ label: t, value: this.store.visits().filter((v) => v.type === t).length, color: TYPE_COLORS[i] })));
  protected readonly purposes = computed(() => {
    const vs = this.store.visits();
    const list = ['Business Meeting', 'Delivery', 'Interview', 'Service & Maintenance', 'Training', 'Event', 'Others'];
    return list.map((p, i) => {
      const n = vs.filter((v) => (p === 'Others' ? !list.slice(0, 6).includes(v.purpose) : v.purpose === p)).length;
      return { label: p, pct: Math.round((n / (vs.length || 1)) * 1000) / 10, color: PURPOSE_COLORS[i] };
    });
  });
  protected readonly methods = computed(() => METHODS.map((m, i) => ({ label: m, value: this.store.visits().filter((v) => v.method === m).length, color: METHOD_COLORS[i] })));
  protected readonly vehicles = computed(() => this.store.vehicles().slice().sort((a, b) => b.time - a.time).slice(0, 4));
  protected readonly hit = computed(() => this.store.screen(this.screenName()));

  protected dur(t: number | null) {
    this.state.tick();
    return duration(t);
  }
  protected statusCls(s: string) {
    return s === 'Checked In' ? 'dt-status green' : s === 'Pending Approval' ? 'dt-status amber' : s === 'Expected' ? 'dt-status blue' : 'dt-status red';
  }
  protected act(a: string, v: Visit) {
    this.detail.set(null);
    if (a === 'view') return this.detail.set(v);
    if (a === 'badge') return this.router.navigateByUrl('/visitor-management/visitor-passes-badges');
    const fn = { checkin: () => this.store.checkIn(v.id), checkout: () => this.store.checkOut(v.id), approve: () => this.store.approve(v.id), reject: () => this.store.reject(v.id) }[a];
    fn?.();
    this.notify(`${v.name}: ${{ checkin: 'checked in · badge printed', checkout: 'checked out', approve: 'approved', reject: 'rejected' }[a]}`);
  }
  protected openForm(m: 'pre' | 'walk') {
    this.menu.set(null);
    this.screenName.set('');
    this.form.set(m);
  }
  protected submit(mode: 'pre' | 'walk', name: string, company: string, email: string, phone: string, purpose: string, host: string, time: string, vehicle: string) {
    const [h, m] = (time || this.nowTime).split(':').map(Number);
    const exp = new Date().setHours(h, m, 0, 0);
    const v = this.store.add({ name, company, email, phone, purpose, host, expected: exp, vehicle, method: mode === 'pre' ? 'Pre-Registered' : 'Walk-in' }, mode === 'pre' ? 'Expected' : 'Checked In');
    this.form.set(null);
    this.notify(mode === 'pre' ? `Invitation sent to ${name} · ${host} notified` : `${name} checked in · badge ${v.badge} printed`);
  }
  protected fullscreen() {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
  @HostListener('document:click', ['$event'])
  protected outside(e: Event) {
    if (!(e.target as HTMLElement).closest?.('.menu-wrap')) this.menu.set(null);
  }
}
