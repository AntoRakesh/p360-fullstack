import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapCallout, MapMarker, MapPath } from '../rtls/floor-plan';
import { CallModal, MessageModal } from './patrol-modals';
import { GuardAvatar, PATROL_CSS, statusCls, toastFn } from './patrol-ui';
import {
  CHECKPOINTS, Checkpoint, COMPANY_NAMES, cpById, fmtD, Guard, hash, Incident, INC_TYPES, initials, IStatus, ISev, OpenShift, POST_ZONES, POSTS, postByName,
  PatrolRoute, PatrolStore, RCode, RCODE, SHIFTS, ShiftKey, SITE_NAMES, WEEK_DAYS,
} from './patrol.data';

const BASE = '/patrol-guard-management';
const guardPos = (g: Guard) => {
  const p = postByName(g.location);
  const h = Math.abs(hash(g.id));
  return { x: p.x + 16 + (h % Math.max(1, p.w - 32)), y: p.y + 18 + ((h >> 5) % Math.max(1, p.h - 56)) };
};

/* =====================================================================
   Guard Shifts & Rosters
   ===================================================================== */
@Component({
  selector: 'app-guard-shifts-rosters',
  imports: [...UI, GuardAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Guard Shifts &amp; Rosters" [parent]="P" [parentLink]="base" subtitle="Plan weekly guard rosters, fill open shifts and approve swap requests across all posts.">
      <button class="btn-primary" (click)="publish()"><app-icon name="p-check" [size]="16" />{{ published() ? 'Published' : 'Publish Roster' }}</button>
      <button class="btn-ghost" (click)="autoFill()"><app-icon name="sparkles" [size]="16" />Auto-fill Open Shifts</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Scheduled Shifts (Week)" [value]="scheduled().toLocaleString()" icon="calendar-days" color="#8b5cf6" change="4%" sub="vs. last week" />
      <app-kpi label="Posts Fully Covered" [value]="covered() + ' / ' + posts.length" icon="shield-check" color="#22c55e" [sub]="pctCovered() + '% coverage today'" />
      <app-kpi label="Open Shifts" [value]="openCount()" icon="triangle-alert" color="#f97316" sub="need a guard" [subColor]="openCount() ? '#ea580c' : '#16a34a'" />
      <app-kpi label="Swap Requests" [value]="pendingSwaps()" icon="refresh" color="#3b82f6" sub="awaiting approval" />
      <app-kpi label="Overtime Hours" value="146" icon="clock" color="#ef4444" change="9%" [good]="false" sub="vs. last week" />
    </section>
    <div class="lay">
      <section class="card">
        <div class="bar">
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search guard or ID..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
          <select class="select" [value]="site()" (change)="site.set($any($event.target).value); page.set(0)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
          <select class="select" [value]="company()" (change)="company.set($any($event.target).value); page.set(0)"><option value="">All Companies</option>@for (s of companies; track s) {<option [value]="s">{{ s }}</option>}</select>
          <select class="select" [value]="shift()" (change)="shift.set($any($event.target).value); page.set(0)"><option value="">All Shifts</option>@for (s of shiftKeys; track s) {<option [value]="s">{{ shifts[s].label }}</option>}</select>
          <div class="wk">
            <button (click)="week.set(week() - 1)"><app-icon name="chevron-left" [size]="15" /></button>
            <b>{{ weekLabel() }}</b>
            <button (click)="week.set(week() + 1)"><app-icon name="chevron-right" [size]="15" /></button>
            @if (week() !== 0) {<button class="link" (click)="week.set(0)">This week</button>}
          </div>
        </div>
        <div class="tw">
          <table class="rt">
            <thead><tr><th>Guard</th><th>Post</th>@for (d of days(); track $index) {<th class="c" [class.today]="week() === 0 && $index === 2">{{ d }}</th>}<th class="c">Hours</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.g.id) {
                <tr>
                  <td><span class="gx"><app-guard-avatar [g]="r.g" [size]="30" /><div><b>{{ r.g.name }}</b><small>{{ r.g.id }} · {{ r.g.company }}</small></div></span></td>
                  <td class="muted">{{ r.g.location }}</td>
                  @for (c of r.codes; track $index) {
                    <td class="c" [class.today]="week() === 0 && $index === 2">
                      <div class="menu-wrap">
                        <button class="code" [style.background]="rc[c].bg" [style.color]="rc[c].fg" (click)="cell.set(cell() === r.g.id + ':' + $index ? null : r.g.id + ':' + $index)">{{ c }}</button>
                        @if (cell() === r.g.id + ':' + $index) {
                          <div class="dropdown pick">@for (k of codes; track k) {<button class="dd-item" (click)="setCode(r.g, $index, k)"><i [style.background]="rc[k].bg" [style.color]="rc[k].fg">{{ k }}</i>{{ rc[k].label }}</button>}</div>
                        }
                      </div>
                    </td>
                  }
                  <td class="c"><b [class.bad]="r.hours > 48">{{ r.hours }}</b></td>
                </tr>
              }
              <tr class="cov"><td colspan="2"><b>Coverage (filtered)</b><small> Day / Eve / Night</small></td>@for (c of coverage(); track $index) {<td class="c"><small>{{ c[0] }} / {{ c[1] }} / {{ c[2] }}</small></td>}<td></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span>Showing {{ filtered().length ? page() * 12 + 1 : 0 }}–{{ Math.min((page() + 1) * 12, filtered().length) }} of {{ filtered().length }} guards</span>
          <span class="pgs"><button class="btn-ghost btn-sm" [disabled]="!page()" (click)="page.set(page() - 1)">Prev</button><button class="btn-ghost btn-sm" [disabled]="(page() + 1) * 12 >= filtered().length" (click)="page.set(page() + 1)">Next</button></span>
        </div>
        <div class="legend">@for (k of codes; track k) {<span><i [style.background]="rc[k].bg" [style.color]="rc[k].fg">{{ k }}</i>{{ rc[k].label }}</span>}</div>
      </section>
      <aside class="side">
        <div class="card">
          <div class="card-head"><h3>Open Shifts</h3><span class="tag amber">{{ openCount() }} open</span></div>
          @for (o of store.openShifts(); track o.id) {
            <div class="os" [class.done]="o.filledBy">
              <div><b>{{ o.post }}</b><small>{{ wd[o.day] }} · {{ rc[o.code].label }}</small><small class="muted">{{ o.reason }}</small></div>
              @if (o.filledBy) {<span class="tag green">{{ store.guard(o.filledBy)?.name }}</span>}
              @else {
                <div class="menu-wrap">
                  <button class="btn-primary btn-sm" (click)="assignFor.set(assignFor() === o.id ? null : o.id)">Assign</button>
                  @if (assignFor() === o.id) {
                    <div class="dropdown right sug"><small class="muted">Available guards (off that day)</small>@for (g of suggestions(o); track g.id) {<button class="dd-item" (click)="fill(o, g)">{{ g.name }} <small>· {{ g.location }}</small></button>}</div>
                  }
                </div>
              }
            </div>
          }
        </div>
        <div class="card">
          <div class="card-head"><h3>Swap Requests</h3></div>
          @for (s of store.swaps(); track s.id) {
            <div class="sw">
              <div><b>{{ store.guard(s.from)?.name }} ⇄ {{ store.guard(s.to)?.name }}</b><small>{{ wd[s.day] }} · {{ s.reason }}</small></div>
              @if (s.status === 'Pending') {
                <span class="acts"><button class="btn-primary btn-sm" (click)="swap(s.id, 'Approved')">Approve</button><button class="btn-ghost btn-sm" (click)="swap(s.id, 'Rejected')">Reject</button></span>
              } @else {<span [class]="s.status === 'Approved' ? 'tag green' : 'tag red'">{{ s.status }}</span>}
            </div>
          }
        </div>
        <div class="card">
          <div class="card-head"><h3>Shift Templates</h3><button class="link" (click)="go('settings-configuration')">Configure</button></div>
          @for (s of shiftKeys; track s) {<div class="tp"><i [style.background]="shifts[s].color"></i><b>{{ shifts[s].label }}</b><span class="muted">{{ shifts[s].time || '3-shift rotation' }}</span><span>{{ onShift(s) }} guards</span></div>}
        </div>
      </aside>
    </div>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .lay { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; align-items: start; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; } .bar .search-box { width: 220px; }
    .wk { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; } .wk button:not(.link) { border: 1px solid var(--border); background: #fff; border-radius: 7px; width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer; }
    .tw { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
    .rt { width: 100%; border-collapse: collapse; font-size: 12px; } .rt th { text-align: left; padding: 10px 8px; font-size: 11.5px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .rt td { padding: 5px 8px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; } .c { text-align: center !important; } .today { background: #faf7ff; }
    .gx b { font-size: 12.5px; }
    .code { border: 0; border-radius: 6px; width: 44px; height: 26px; font-weight: 700; font-size: 11.5px; cursor: pointer; } .code:hover { outline: 2px solid var(--primary); }
    .pick { min-width: 160px; left: 50%; transform: translateX(-50%); } .pick i, .legend i { display: inline-grid; place-items: center; width: 26px; height: 18px; border-radius: 4px; font-style: normal; font-weight: 700; font-size: 10px; margin-right: 8px; }
    .cov td { background: #fafafe; } .cov small { color: var(--muted); }
    .pgs { display: flex; gap: 6px; }
    .legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: #4b4f6b; } .legend span { display: inline-flex; align-items: center; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .os, .sw { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
    .os div:first-child, .sw div { display: flex; flex-direction: column; } .os small, .sw small { font-size: 11.5px; color: #4b4f6b; } .os.done { opacity: 0.7; }
    .acts { display: flex; gap: 4px; } .right { right: 0; left: auto; } .sug { width: 240px; max-height: 260px; overflow: auto; padding: 6px; } .sug small { display: block; padding: 2px 6px; }
    .tp { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 8px; align-items: center; font-size: 12.5px; padding: 6px 0; } .tp i { width: 10px; height: 10px; border-radius: 3px; } .tp span:last-child { font-weight: 600; }
    @media (max-width: 1300px) { .lay { grid-template-columns: 1fr; } }
  `,
})
export class GuardShifts {
  protected readonly store = inject(PatrolStore);
  private readonly router = inject(Router);
  protected readonly P = 'Patrol & Guard Management';
  protected readonly base = BASE;
  protected readonly Math = Math;
  protected readonly sites = SITE_NAMES;
  protected readonly companies = COMPANY_NAMES;
  protected readonly shifts = SHIFTS;
  protected readonly shiftKeys = Object.keys(SHIFTS) as ShiftKey[];
  protected readonly posts = POSTS;
  protected readonly rc = RCODE;
  protected readonly codes: RCode[] = ['D', 'E', 'N', 'OFF', 'L', 'T'];
  protected readonly wd = WEEK_DAYS;
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly company = signal('');
  protected readonly shift = signal('');
  protected readonly week = signal(0);
  protected readonly page = signal(0);
  protected readonly cell = signal<string | null>(null);
  protected readonly assignFor = signal<string | null>(null);
  protected readonly published = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));

  protected readonly days = computed(() => WEEK_DAYS.map((d) => `${d.slice(0, 3)} ${+d.slice(4) + this.week() * 7 > 31 ? +d.slice(4) + this.week() * 7 - 31 : +d.slice(4) + this.week() * 7}`));
  protected readonly weekLabel = computed(() => {
    const s = new Date(2026, 9, 12 + this.week() * 7);
    const e = new Date(2026, 9, 18 + this.week() * 7);
    const f = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${f(s)} – ${f(e)} ${e.getFullYear()}`;
  });
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.guards().filter((g) => (!q || `${g.name} ${g.id}`.toLowerCase().includes(q)) && (!this.site() || g.site === this.site()) && (!this.company() || g.company === this.company()) && (!this.shift() || g.shift === this.shift()));
  });
  private readonly allRows = computed(() => {
    const w = this.week();
    return this.filtered().map((g) => {
      const codes = this.store.roster(g, w);
      return { g, codes, hours: ((n) => n * 8 + (n > 3 && Math.abs(hash(g.id + w)) % 3 === 0 ? 4 : 0))(codes.filter((c) => c === 'D' || c === 'E' || c === 'N').length) };
    });
  });
  protected readonly rows = computed(() => this.allRows().slice(this.page() * 12, (this.page() + 1) * 12));
  protected readonly coverage = computed(() => WEEK_DAYS.map((_, d) => { const c = [0, 0, 0]; for (const r of this.allRows()) { const k = r.codes[d]; if (k === 'D') c[0]++; else if (k === 'E') c[1]++; else if (k === 'N') c[2]++; } return c; }));
  protected readonly scheduled = computed(() => this.store.guards().reduce((a, g) => a + this.store.roster(g, this.week()).filter((c) => c === 'D' || c === 'E' || c === 'N').length, 0));
  protected readonly covered = computed(() => POSTS.filter((p) => this.store.onDuty().filter((g) => g.location === p.name).length >= Math.min(p.required, 3)).length);
  protected readonly pctCovered = computed(() => Math.round((this.covered() / POSTS.length) * 100));
  protected readonly openCount = computed(() => this.store.openShifts().filter((o) => !o.filledBy).length);
  protected readonly pendingSwaps = computed(() => this.store.swaps().filter((s) => s.status === 'Pending').length);

  protected onShift(s: ShiftKey) {
    return this.store.guards().filter((g) => g.shift === s).length;
  }
  protected setCode(g: Guard, d: number, k: RCode) {
    this.store.setRoster(g.id, d, k, this.week());
    this.cell.set(null);
    this.published.set(false);
    this.toastMsg(`${g.name} · ${WEEK_DAYS[d]} set to ${RCODE[k].label}`);
  }
  protected suggestions(o: OpenShift) {
    const site = postByName(o.post).site;
    return this.store.guards().filter((g) => g.site === site && g.status !== 'On Leave' && this.store.roster(g)[o.day] === 'OFF').slice(0, 8);
  }
  protected fill(o: OpenShift, g: Guard) {
    this.store.openShifts.update((l) => l.map((x) => (x.id === o.id ? { ...x, filledBy: g.id } : x)));
    this.store.setRoster(g.id, o.day, o.code);
    this.assignFor.set(null);
    this.toastMsg(`${g.name} assigned to ${o.post} · ${WEEK_DAYS[o.day]} (${RCODE[o.code].label}) · notified via app`);
  }
  protected autoFill() {
    let n = 0;
    for (const o of this.store.openShifts()) {
      if (o.filledBy) continue;
      const g = this.suggestions(o)[0];
      if (g) {
        this.fill(o, g);
        n++;
      }
    }
    this.toastMsg(n ? `${n} open shifts auto-filled with available guards` : 'No open shifts to fill');
  }
  protected swap(id: string, status: 'Approved' | 'Rejected') {
    const s = this.store.swaps().find((x) => x.id === id)!;
    this.store.swaps.update((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    if (status === 'Approved') {
      const a = this.store.guard(s.from)!;
      const b = this.store.guard(s.to)!;
      const ca = this.store.roster(a)[s.day];
      const cb = this.store.roster(b)[s.day];
      this.store.setRoster(a.id, s.day, cb);
      this.store.setRoster(b.id, s.day, ca);
    }
    this.toastMsg(`Swap ${status.toLowerCase()}`);
  }
  protected publish() {
    this.published.set(true);
    this.toastMsg(`Roster for ${this.weekLabel()} published · ${this.store.guards().length} guards notified`);
  }
  protected exportCsv() {
    downloadCsv('guard-roster.csv', [['ID', 'Guard', 'Company', 'Post', ...WEEK_DAYS, 'Hours'], ...this.allRows().map((r) => [r.g.id, r.g.name, r.g.company, r.g.location, ...r.codes, r.hours])]);
  }
  protected go(p: string) {
    this.router.navigate([BASE, p]);
  }
}

/* =====================================================================
   Patrol Routes & Checkpoints
   ===================================================================== */
@Component({
  selector: 'app-patrol-routes-checkpoints',
  imports: [...UI, FloorPlan],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Patrol Routes &amp; Checkpoints" [parent]="P" [parentLink]="base" subtitle="Design patrol routes, manage NFC / QR / beacon checkpoints and monitor route compliance.">
      <button class="btn-primary" (click)="openRoute()"><app-icon name="plus" [size]="16" />New Route</button>
      <button class="btn-ghost" (click)="cpForm.set({ name: '', post: 'Main Gate', tag: 'NFC' })"><app-icon name="p-qr" [size]="16" />Add Checkpoint</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Active Routes" [value]="activeRoutes()" icon="p-route" color="#8b5cf6" [sub]="store.routes().length + ' configured'" />
      <app-kpi label="Checkpoints" [value]="store.checkpoints().length" icon="map-pin" color="#3b82f6" [sub]="tagMix()" />
      <app-kpi label="Avg Route Compliance" [value]="avgComp() + '%'" icon="shield-check" color="#22c55e" change="1.8%" sub="vs. last week" />
      <app-kpi label="Scans Today" [value]="store.scansToday().toLocaleString()" icon="fingerprint" color="#06b6d4" sub="live" subColor="#0891b2" />
      <app-kpi label="Low Battery Tags" [value]="lowBat().length" icon="battery" color="#ef4444" sub="below 20%" [subColor]="lowBat().length ? '#dc2626' : undefined" />
    </section>
    <div class="lay">
      <aside class="card rl">
        <div class="card-head"><h3>Routes</h3><select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></div>
        @for (r of routes(); track r.id) {
          <button class="ri" [class.on]="r.id === selId()" (click)="selId.set(r.id); cpSel.set(null)">
            <i [style.background]="r.color"></i>
            <div><b>{{ r.name }}</b><small>{{ r.id }} · {{ r.site }}</small><small>{{ r.checkpoints.length }} checkpoints · {{ r.frequency }} · {{ r.duration }} min</small></div>
            <span class="rc">@if (r.active) {<b [style.color]="r.compliance >= 95 ? '#16a34a' : r.compliance >= 90 ? '#d97706' : '#dc2626'">{{ r.compliance }}%</b>} @else {<span class="tag grey">Inactive</span>}</span>
          </button>
        }
      </aside>
      <section class="card">
        @if (sel(); as r) {
          <div class="card-head">
            <div><h3>{{ r.name }} <span class="muted">· {{ r.shift === 'All' ? 'All shifts' : shifts[r.shift].label }}</span></h3></div>
            <div class="toolbar">
              <label class="sw"><input type="checkbox" [checked]="r.active" (change)="toggleActive(r)" />{{ r.active ? 'Active' : 'Inactive' }}</label>
              <button class="btn-ghost btn-sm" (click)="openRoute(r)">Edit</button>
              <button class="btn-ghost btn-sm" (click)="go(r)">Watch live</button>
              <button class="btn-ghost btn-sm danger" (click)="remove(r)">Delete</button>
            </div>
          </div>
          <app-floor-plan [zones]="zones" [markers]="markers()" [paths]="paths()" [callout]="callout()" [selectedId]="cpSel()" [height]="400" (markerClick)="cpSel.set(cpSel() === $event ? null : $event)" />
          <table class="table cp">
            <thead><tr><th>#</th><th>Checkpoint</th><th>Post</th><th>Tag</th><th>Battery</th><th>Last scan</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (c of routeCps(); track c.id; let i = $index) {
                <tr [class.on]="c.id === cpSel()" (click)="cpSel.set(c.id)">
                  <td><span class="num-b" [style.background]="r.color">{{ i + 1 }}</span></td>
                  <td><b>{{ c.name }}</b><small class="muted"> {{ c.id }}</small></td><td>{{ c.post }}</td><td><span class="tag blue">{{ c.tag }}</span></td>
                  <td><span [class]="c.battery < 20 ? 'bad' : c.battery < 50 ? 'warn-t' : 'good'">{{ c.battery }}%</span></td>
                  <td>{{ lastScan(c) }}</td>
                  <td><span [class]="missed(c) ? 'tag red' : 'tag green'">{{ missed(c) ? 'Missed' : 'On time' }}</span></td>
                  <td class="ra" (click)="$event.stopPropagation()">
                    <button class="ib" [disabled]="!i" (click)="move(r, i, -1)" title="Move up">↑</button>
                    <button class="ib" [disabled]="i === routeCps().length - 1" (click)="move(r, i, 1)" title="Move down">↓</button>
                    <button class="ib" (click)="drop(r, c)" title="Remove">×</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="add">
            <select class="select" #ac><option value="">Add checkpoint to route…</option>@for (c of notInRoute(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.name }}</option>}</select>
            <button class="btn-primary btn-sm" (click)="addCp(r, ac.value); ac.value = ''">Add</button>
            @if (lowBat().length) {<button class="link" (click)="replaceBatteries()">Schedule battery replacement ({{ lowBat().length }})</button>}
          </div>
        } @else {<p class="muted">Select a route.</p>}
      </section>
    </div>

    @if (rf(); as f) {
      <div class="g-overlay" (click)="rf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveRoute()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit route' : 'New patrol route' }}</h3><button type="button" class="close-btn" (click)="rf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Route name *<input class="input" required [value]="f.name" (input)="rfSet('name', $any($event.target).value)" /></label>
          <label>Site<select class="select" [value]="f.site" (change)="rfSet('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Shift<select class="select" [value]="f.shift" (change)="rfSet('shift', $any($event.target).value)"><option value="All">All shifts</option>@for (s of shiftKeys; track s) {<option [value]="s">{{ shifts[s].label }}</option>}</select></label>
          <label>Frequency<select class="select" [value]="f.frequency" (change)="rfSet('frequency', $any($event.target).value)">@for (x of freqs; track x) {<option>{{ x }}</option>}</select></label>
          <label>Expected duration (min)<input class="input" type="number" [value]="f.duration" (input)="rfSet('duration', +$any($event.target).value)" /></label>
          <label class="full">Checkpoints (in order of selection)</label>
          <div class="full cps">@for (c of allCps(); track c.id) {<label class="ck"><input type="checkbox" [checked]="f.checkpoints.includes(c.id)" (change)="toggleCp(c.id)" />{{ c.id }} {{ c.name }}@if (f.checkpoints.includes(c.id)) {<em>{{ f.checkpoints.indexOf(c.id) + 1 }}</em>}</label>}</div>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rf.set(null)">Cancel</button><button class="btn-primary" type="submit">Save route</button></div>
      </form>
    }
    @if (cpForm(); as f) {
      <div class="g-overlay" (click)="cpForm.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveCp()">
        <div class="modal-head"><h3>Add checkpoint</h3><button type="button" class="close-btn" (click)="cpForm.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Checkpoint name *<input class="input" required [value]="f.name" (input)="cpForm.set({ ...f, name: $any($event.target).value })" /></label>
          <label>Post / zone<select class="select" [value]="f.post" (change)="cpForm.set({ ...f, post: $any($event.target).value })">@for (p of postList; track p.id) {<option [value]="p.name">{{ p.name }}</option>}</select></label>
          <label>Tag type<select class="select" [value]="f.tag" (change)="cpForm.set({ ...f, tag: $any($event.target).value })"><option>NFC</option><option>QR</option><option>Beacon</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cpForm.set(null)">Cancel</button><button class="btn-primary" type="submit">Add checkpoint</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .lay { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; align-items: start; }
    .rl { display: flex; flex-direction: column; gap: 6px; }
    .ri { display: grid; grid-template-columns: 6px 1fr auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; text-align: left; cursor: pointer; font: inherit; }
    .ri.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .ri i { width: 6px; align-self: stretch; border-radius: 3px; }
    .ri div { display: flex; flex-direction: column; font-size: 12.5px; } .ri small { color: var(--muted); font-size: 11.5px; } .rc b { font-size: 14px; }
    .sw { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; } .danger { color: var(--red) !important; }
    h3 .muted { font-weight: 400; font-size: 12.5px; }
    .cp { margin-top: 12px; } .cp tr { cursor: pointer; } .cp tr.on td { background: #f7f3ff; } .cp small { font-size: 11px; }
    .num-b { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 11px; }
    .ra { white-space: nowrap; } .ib { border: 1px solid var(--border); background: #fff; border-radius: 6px; width: 24px; height: 24px; cursor: pointer; margin-left: 2px; } .ib:disabled { opacity: 0.35; }
    .add { display: flex; gap: 8px; margin-top: 10px; align-items: center; } .add .select { width: 280px; }
    .cps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 10px; max-height: 220px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
    .ck { flex-direction: row !important; align-items: center; gap: 6px !important; font-size: 11.5px !important; } .ck em { font-style: normal; background: var(--primary); color: #fff; border-radius: 10px; padding: 0 6px; font-size: 10px; }
    @media (max-width: 1200px) { .lay { grid-template-columns: 1fr; } }
  `,
})
export class PatrolRoutes {
  protected readonly store = inject(PatrolStore);
  private readonly router = inject(Router);
  protected readonly P = 'Patrol & Guard Management';
  protected readonly base = BASE;
  protected readonly sites = SITE_NAMES;
  protected readonly shifts = SHIFTS;
  protected readonly shiftKeys = Object.keys(SHIFTS) as ShiftKey[];
  protected readonly zones = POST_ZONES;
  protected readonly postList = POSTS;
  protected readonly freqs = ['Every 30 min', 'Hourly', 'Every 2 hours', 'Every 3 hours', 'Every 4 hours', 'Once per shift'];
  protected readonly site = signal('');
  protected readonly selId = signal('RT-01');
  protected readonly cpSel = signal<string | null>(null);
  protected readonly rf = signal<PatrolRoute | null>(null);
  protected readonly cpForm = signal<{ name: string; post: string; tag: Checkpoint['tag'] } | null>(null);
  protected readonly err = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));

  protected readonly routes = computed(() => this.store.routes().filter((r) => !this.site() || r.site === this.site()));
  protected readonly sel = computed(() => this.store.routes().find((r) => r.id === this.selId()) ?? null);
  protected readonly activeRoutes = computed(() => this.store.routes().filter((r) => r.active).length);
  protected readonly avgComp = computed(() => { const a = this.store.routes().filter((r) => r.active); return (a.reduce((s, r) => s + r.compliance, 0) / Math.max(1, a.length)).toFixed(1); });
  protected readonly lowBat = computed(() => this.store.checkpoints().filter((c) => c.battery < 20));
  protected readonly tagMix = computed(() => { const l = this.store.checkpoints(); return ['NFC', 'QR', 'Beacon'].map((t) => `${l.filter((c) => c.tag === t).length} ${t}`).join(' · '); });
  protected readonly allCps = computed(() => this.store.checkpoints());
  protected readonly routeCps = computed(() => { const m = new Map(this.store.checkpoints().map((c) => [c.id, c])); return (this.sel()?.checkpoints ?? []).map((id) => m.get(id)!).filter(Boolean); });
  protected readonly notInRoute = computed(() => this.store.checkpoints().filter((c) => !this.sel()?.checkpoints.includes(c.id)));
  protected readonly paths = computed<MapPath[]>(() => { const r = this.sel(); const pts = this.routeCps().map((c) => [c.x, c.y] as [number, number]); return r && pts.length > 1 ? [{ points: pts, color: r.color, arrow: true, width: 4, dashed: !r.active }] : []; });
  protected readonly markers = computed<MapMarker[]>(() => {
    const inR = new Set(this.sel()?.checkpoints ?? []);
    const order = this.sel()?.checkpoints ?? [];
    return this.store.checkpoints().map((c) =>
      inR.has(c.id)
        ? { id: c.id, x: c.x, y: c.y, kind: 'avatar', color: c.battery < 20 ? '#ef4444' : this.sel()!.color, label: String(order.indexOf(c.id) + 1), size: 12, alert: c.battery < 20, title: `${c.id} ${c.name}` }
        : { id: c.id, x: c.x, y: c.y, kind: 'dot', color: '#94a3b8', size: 5, title: `${c.id} ${c.name}` },
    );
  });
  protected readonly callout = computed<MapCallout | null>(() => {
    const c = this.store.checkpoints().find((x) => x.id === this.cpSel());
    return c ? { x: c.x, y: c.y, title: `${c.id} · ${c.name}`, lines: [`${c.tag} tag · battery ${c.battery}%`, `Last scan ${this.lastScan(c)}`], icon: c.tag === 'QR' ? 'p-qr' : 'fingerprint', color: this.sel()?.color } : null;
  });

  protected lastScan(c: Checkpoint) {
    const live = this.store.scans().find((s) => s.cp === c.id);
    if (live) return live.time;
    const m = Math.abs(hash(c.id)) % 55;
    return `10:${String(m).padStart(2, '0')} AM`;
  }
  protected missed(c: Checkpoint) {
    return this.store.runs().some((r) => r.missed.includes(c.id)) || this.store.scans().some((s) => s.cp === c.id && !s.ok);
  }
  private patch(id: string, ch: Partial<PatrolRoute>) {
    this.store.routes.update((l) => l.map((r) => (r.id === id ? { ...r, ...ch } : r)));
  }
  protected toggleActive(r: PatrolRoute) {
    this.patch(r.id, { active: !r.active, compliance: r.compliance || 100 });
    this.toastMsg(`${r.name} ${r.active ? 'deactivated' : 'activated'}`);
  }
  protected move(r: PatrolRoute, i: number, d: number) {
    const l = [...r.checkpoints];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    this.patch(r.id, { checkpoints: l });
  }
  protected drop(r: PatrolRoute, c: Checkpoint) {
    if (r.checkpoints.length <= 2) return this.toastMsg('A route needs at least 2 checkpoints');
    this.patch(r.id, { checkpoints: r.checkpoints.filter((x) => x !== c.id) });
    this.toastMsg(`${c.name} removed from ${r.name}`);
  }
  protected addCp(r: PatrolRoute, id: string) {
    if (!id) return;
    this.patch(r.id, { checkpoints: [...r.checkpoints, id] });
    this.toastMsg(`${id} added to ${r.name}`);
  }
  protected remove(r: PatrolRoute) {
    if (!confirm(`Delete route ${r.name}?`)) return;
    this.store.routes.update((l) => l.filter((x) => x.id !== r.id));
    this.selId.set(this.store.routes()[0]?.id ?? '');
  }
  protected replaceBatteries() {
    const ids = this.lowBat().map((c) => c.id);
    this.store.checkpoints.update((l) => l.map((c) => (ids.includes(c.id) ? { ...c, battery: 100 } : c)));
    this.toastMsg(`Battery replacement logged for ${ids.join(', ')}`);
  }
  protected openRoute(r?: PatrolRoute) {
    this.err.set('');
    this.rf.set(r ? { ...r, checkpoints: [...r.checkpoints] } : { id: '', name: '', site: 'Head Office', checkpoints: [], frequency: 'Hourly', duration: 20, shift: 'All', color: '#7c3aed', active: true, compliance: 100 });
  }
  protected rfSet<K extends keyof PatrolRoute>(k: K, v: PatrolRoute[K]) {
    this.rf.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected toggleCp(id: string) {
    this.rf.update((f) => (f ? { ...f, checkpoints: f.checkpoints.includes(id) ? f.checkpoints.filter((x) => x !== id) : [...f.checkpoints, id] } : f));
  }
  protected saveRoute() {
    const f = this.rf()!;
    if (!f.name.trim() || f.checkpoints.length < 2) return this.err.set('Enter a name and pick at least 2 checkpoints.');
    if (f.id) this.patch(f.id, f);
    else {
      const colors = ['#7c3aed', '#3b82f6', '#ef4444', '#f59e0b', '#14b8a6', '#ea580c', '#db2777'];
      const id = `RT-${String(this.store.routes().length + 1).padStart(2, '0')}`;
      this.store.routes.update((l) => [...l, { ...f, id, color: colors[l.length % colors.length] }]);
      this.selId.set(id);
    }
    this.rf.set(null);
    this.toastMsg(`Route ${f.name} saved · guard tour app updated`);
  }
  protected saveCp() {
    const f = this.cpForm()!;
    if (!f.name.trim()) return;
    const p = postByName(f.post);
    const id = `CP-${String(this.store.checkpoints().length + 1).padStart(2, '0')}`;
    const h = Math.abs(hash(id));
    this.store.checkpoints.update((l) => [...l, { id, name: f.name, post: p.name, x: p.x + 15 + (h % (p.w - 30)), y: p.y + 15 + ((h >> 4) % (p.h - 30)), tag: f.tag, battery: 100 }]);
    this.cpForm.set(null);
    this.toastMsg(`${id} ${f.name} added · print ${f.tag} tag from the device console`);
  }
  protected go(r: PatrolRoute) {
    this.router.navigate([BASE, 'live-patrol-monitoring'], { queryParams: { route: r.id } });
  }
  protected exportCsv() {
    downloadCsv('patrol-routes.csv', [['Route', 'Name', 'Site', 'Shift', 'Frequency', 'Duration', 'Checkpoints', 'Compliance', 'Active'], ...this.store.routes().map((r) => [r.id, r.name, r.site, r.shift, r.frequency, r.duration, r.checkpoints.join(' > '), r.compliance, r.active ? 'Yes' : 'No'])]);
  }
}

/* =====================================================================
   Live Patrol Monitoring
   ===================================================================== */
@Component({
  selector: 'app-live-patrol-monitoring',
  imports: [...UI, FloorPlan, GuardAvatar, CallModal, MessageModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Live Patrol Monitoring" [parent]="P" [parentLink]="base">
      <button class="btn-primary" (click)="dispatch.set({ guard: '', post: 'Main Gate', note: '' })"><app-icon name="run" [size]="16" />Dispatch Guard</button>
      <button class="btn-ghost" (click)="msgTo.set(store.onDuty())"><app-icon name="megaphone" [size]="16" />Broadcast</button>
      <button class="btn-ghost" (click)="go('incidents-reports')"><app-icon name="file-chart" [size]="16" />Incidents</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Guards On Duty" [value]="store.counts().on" icon="user-check" color="#22c55e" [sub]="postsManned() + ' posts manned'" />
      <app-kpi label="Active Patrols" [value]="store.runs().length" icon="p-route" color="#8b5cf6" [sub]="avgProg() + '% avg progress'" />
      <app-kpi label="Checkpoints Scanned" [value]="store.scansToday().toLocaleString()" icon="fingerprint" color="#3b82f6" sub="today · live" subColor="#2563eb" />
      <app-kpi label="Missed Checkpoints" [value]="missedCount()" icon="triangle-alert" color="#f97316" sub="today" [subColor]="missedCount() ? '#ea580c' : undefined" />
      <app-kpi label="Open Alerts" [value]="openAlerts().length" icon="bell-ring" color="#ef4444" [sub]="critical() + ' high / critical'" [subColor]="critical() ? '#dc2626' : undefined" />
    </section>
    <div class="lay">
      <section class="card mapc">
        <div class="card-head">
          <h3>Site Map <span class="muted">· {{ visible().length }} guards</span></h3>
          <div class="toolbar">
            <label class="ck"><input type="checkbox" [checked]="showRoutes()" (change)="showRoutes.set(!showRoutes())" />Routes</label>
            <label class="ck"><input type="checkbox" [checked]="showStatic()" (change)="showStatic.set(!showStatic())" />Static posts</label>
            <select class="select" [value]="route()" (change)="route.set($any($event.target).value)"><option value="">All routes</option>@for (r of activeRoutes(); track r.id) {<option [value]="r.id">{{ r.name }}</option>}</select>
          </div>
        </div>
        <app-floor-plan #fp [zones]="zones" [markers]="markers()" [paths]="paths()" [callout]="callout()" [selectedId]="selG()" [height]="520" (markerClick)="pick($event)" (zoneClick)="zoneInfo($event)" />
        <div class="stream">
          <b>Live scans</b>
          @for (s of store.scans().slice(0, 6); track s.id) {<span [class.bad]="!s.ok"><i [class.no]="!s.ok"></i>{{ s.time }} · {{ store.guard(s.guardId)?.name }} {{ s.ok ? 'scanned' : 'missed' }} {{ s.cp }}</span>}
          @if (!store.scans().length) {<span class="muted">Waiting for scans…</span>}
        </div>
      </section>
      <aside class="side">
        @if (selGuard(); as g) {
          <div class="card gcard">
            <div class="gh"><app-guard-avatar [g]="g" [size]="48" /><div><b>{{ g.name }}</b><small>{{ g.id }} · {{ g.company }}</small><small>{{ g.post }}</small></div><span [class]="stCls(g.status)">{{ g.status }}</span><button class="close-btn" (click)="clearSel()">×</button></div>
            @if (runOf(g.id); as st) {
              <div class="prog"><span>{{ st.route.name }} · {{ st.done }}/{{ st.total }}</span><div class="bar"><i [style.width.%]="st.pct" [style.background]="st.route.color"></i></div><small>Next: {{ st.next.id }} {{ st.next.name }}</small></div>
            } @else {<p class="muted sm">Static post · since {{ g.since }} · last check-in {{ g.lastCheckin }}</p>}
            <div class="row"><button class="btn-primary btn-sm" (click)="callG.set(g)"><app-icon name="phone" [size]="14" />Call</button><button class="btn-ghost btn-sm" (click)="msgTo.set([g])"><app-icon name="message" [size]="14" />Message</button><button class="btn-ghost btn-sm" (click)="dispatch.set({ guard: g.id, post: g.location, note: '' })">Dispatch</button><button class="btn-ghost btn-sm" (click)="locate(g)">Locate</button></div>
          </div>
        }
        <div class="card">
          <nav class="tb">@for (t of ['Alerts', 'Active Patrols']; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}@if (t === 'Alerts' && openAlerts().length) {<em>{{ openAlerts().length }}</em>}</button>}</nav>
          @if (tab() === 'Alerts') {
            <div class="list">
              @for (a of store.alerts(); track a.id) {
                <div class="al" [class.ack]="a.ack">
                  <span class="ai" [class]="'ai ' + a.sev"><app-icon [name]="alertIcon(a.type)" [size]="15" /></span>
                  <div><b>{{ a.type }}</b><small>{{ a.text }}</small><small class="muted">{{ a.time }} · {{ a.post }}@if (a.guardId) { · {{ store.guard(a.guardId)?.name }}}</small></div>
                  <div class="aa">
                    @if (!a.ack) {<button class="btn-ghost btn-sm" (click)="ack(a.id)">Ack</button>}
                    @if (a.guardId) {<button class="link" (click)="pick(a.guardId)">Locate</button>}
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="list">
              @for (r of runStates(); track r.run.id) {
                <button class="pr" [class.on]="r.run.guardId === selG()" (click)="pick(r.run.guardId)">
                  <i [style.background]="r.st.route.color"></i>
                  <div><b>{{ store.guard(r.run.guardId)?.name }}</b><small>{{ r.st.route.name }} · started {{ r.run.startedAt }}</small><div class="bar"><i [style.width.%]="r.st.pct" [style.background]="r.st.route.color"></i></div></div>
                  <span>{{ r.st.done }}/{{ r.st.total }}</span>
                </button>
              }
            </div>
          }
        </div>
      </aside>
    </div>
    @if (dispatch(); as d) {
      <div class="g-overlay" (click)="dispatch.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doDispatch()">
        <div class="modal-head"><h3>Dispatch guard</h3><button type="button" class="close-btn" (click)="dispatch.set(null)">×</button></div>
        <div class="form-grid">
          <label>Guard (on duty)<select class="select" [value]="d.guard" (change)="dispatch.set({ ...d, guard: $any($event.target).value })"><option value="">Nearest available</option>@for (g of store.onDuty(); track g.id) {<option [value]="g.id">{{ g.name }} · {{ g.location }}</option>}</select></label>
          <label>Go to<select class="select" [value]="d.post" (change)="dispatch.set({ ...d, post: $any($event.target).value })">@for (p of postList; track p.id) {<option [value]="p.name">{{ p.name }}</option>}</select></label>
          <label class="full">Instructions<input class="input" [value]="d.note" placeholder="e.g. Check suspicious vehicle near gate" (input)="dispatch.set({ ...d, note: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="dispatch.set(null)">Cancel</button><button class="btn-primary" type="submit">Dispatch</button></div>
      </form>
    }
    @if (callG(); as g) {<app-call-modal [guard]="g" (close)="callG.set(null)" (done)="toastMsg($event)" />}
    @if (msgTo(); as list) {<app-message-modal [guards]="list" (close)="msgTo.set(null)" (done)="toastMsg($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .lay { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 12px; align-items: start; }
    .ck { display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; } h3 .muted { font-weight: 400; font-size: 12.5px; }
    .stream { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: #3b3f5c; align-items: center; } .stream span { display: inline-flex; align-items: center; gap: 5px; }
    .stream i { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; } .stream i.no { background: #ef4444; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .gh { display: grid; grid-template-columns: 48px 1fr auto auto; gap: 10px; align-items: center; } .gh div { display: flex; flex-direction: column; font-size: 12.5px; } .gh small { color: var(--muted); font-size: 11.5px; }
    .prog { margin-top: 10px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; } .prog small { color: var(--muted); }
    .bar { height: 6px; background: #eef0f5; border-radius: 4px; overflow: hidden; margin-top: 3px; } .bar i { display: block; height: 100%; border-radius: 4px; transition: width 1s; }
    .row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; } .sm { font-size: 12px; margin: 8px 0 0; }
    .tb { display: flex; gap: 18px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
    .tb button { border: 0; background: none; padding: 6px 0; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: inline-flex; gap: 6px; align-items: center; } .tb button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .tb em { font-style: normal; background: #ef4444; color: #fff; border-radius: 10px; padding: 0 6px; font-size: 10.5px; }
    .list { max-height: 560px; overflow: auto; display: flex; flex-direction: column; }
    .al { display: grid; grid-template-columns: 30px 1fr auto; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f1f6; align-items: start; font-size: 12.5px; } .al.ack { opacity: 0.55; }
    .al div:nth-child(2) { display: flex; flex-direction: column; } .al small { font-size: 11.5px; }
    .ai { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; } .ai.Critical, .ai.High { background: #fee2e2; color: #dc2626; } .ai.Medium { background: #fef3c7; color: #b45309; } .ai.Low { background: #e0f2fe; color: #0369a1; }
    .aa { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
    .pr { display: grid; grid-template-columns: 6px 1fr auto; gap: 10px; align-items: center; border: 0; border-bottom: 1px solid #f0f1f6; background: none; text-align: left; padding: 8px 4px; cursor: pointer; font: inherit; }
    .pr.on { background: #f7f3ff; } .pr > i { width: 6px; align-self: stretch; border-radius: 3px; } .pr div { display: flex; flex-direction: column; font-size: 12.5px; } .pr small { color: var(--muted); font-size: 11.5px; } .pr span { font-weight: 600; font-size: 12.5px; }
    @media (max-width: 1250px) { .lay { grid-template-columns: 1fr; } }
  `,
})
export class LivePatrol {
  protected readonly store = inject(PatrolStore);
  private readonly app = inject(AppState);
  private readonly router = inject(Router);
  private readonly fp = viewChild<FloorPlan>('fp');
  protected readonly P = 'Patrol & Guard Management';
  protected readonly base = BASE;
  protected readonly zones = POST_ZONES;
  protected readonly postList = POSTS;
  protected readonly stCls = statusCls;
  protected readonly selG = signal<string | null>(null);
  protected readonly route = signal('');
  protected readonly showRoutes = signal(true);
  protected readonly showStatic = signal(true);
  protected readonly tab = signal('Alerts');
  protected readonly dispatch = signal<{ guard: string; post: string; note: string } | null>(null);
  protected readonly callG = signal<Guard | null>(null);
  protected readonly msgTo = signal<Guard[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));

  constructor() {
    const qp = inject(ActivatedRoute).snapshot.queryParamMap;
    const g = qp.get('guard');
    const r = qp.get('route');
    if (r) this.route.set(r);
    if (g) {
      this.selG.set(g);
      // Focus once the map exists.
      effect(() => {
        const fp = this.fp();
        if (fp) untracked(() => { const pos = this.posOf(g); if (pos) fp.focus(pos.x, pos.y, 1.35); });
      });
    }
  }

  protected readonly activeRoutes = computed(() => this.store.routes().filter((r) => r.active));
  protected readonly runStates = computed(() => {
    const t = this.app.tick();
    return this.store.runs().filter((r) => !this.route() || r.routeId === this.route()).map((run) => ({ run, st: this.store.runState(run, t) }));
  });
  private readonly runByGuard = computed(() => new Map(this.runStates().map((r) => [r.run.guardId, r.st])));
  protected runOf(id: string) {
    return this.runByGuard().get(id) ?? this.store.runs().filter((r) => r.guardId === id).map((r) => this.store.runState(r, this.app.tick()))[0];
  }
  protected readonly visible = computed(() => this.store.onDuty().filter((g) => this.showStatic() || this.runByGuard().has(g.id)));
  protected readonly avgProg = computed(() => Math.round(this.runStates().reduce((a, r) => a + r.st.pct, 0) / Math.max(1, this.runStates().length)));
  protected readonly postsManned = computed(() => new Set(this.store.onDuty().map((g) => g.location)).size);
  protected readonly missedCount = computed(() => 7 + this.store.scans().filter((s) => !s.ok).length);
  protected readonly openAlerts = computed(() => this.store.alerts().filter((a) => !a.ack));
  protected readonly critical = computed(() => this.openAlerts().filter((a) => a.sev === 'High' || a.sev === 'Critical').length);
  protected readonly selGuard = computed(() => this.store.guard(this.selG()) ?? null);
  private posOf(id: string) {
    const st = this.runByGuard().get(id);
    if (st) return { x: st.x, y: st.y };
    const g = this.store.guard(id);
    return g ? guardPos(g) : null;
  }
  protected readonly paths = computed<MapPath[]>(() => {
    if (!this.showRoutes()) return [];
    return this.activeRoutes().filter((r) => !this.route() || r.id === this.route()).map((r) => ({ points: r.checkpoints.map((id) => [cpById(id)?.x ?? 0, cpById(id)?.y ?? 0] as [number, number]), color: r.color, dashed: true, width: 2.5 }));
  });
  protected readonly markers = computed<MapMarker[]>(() => {
    const alertG = new Set(this.openAlerts().map((a) => a.guardId));
    const out: MapMarker[] = [];
    if (this.showRoutes()) for (const c of CHECKPOINTS) out.push({ id: 'cp:' + c.id, x: c.x, y: c.y, kind: 'dot', color: '#a78bfa', size: 4, title: `${c.id} ${c.name}` });
    for (const g of this.visible()) {
      const st = this.runByGuard().get(g.id);
      if (st) out.push({ id: g.id, x: st.x, y: st.y, color: st.route.color, label: initials(g.name), size: 14, alert: alertG.has(g.id), title: `${g.name} · ${st.route.name}` });
      else { const p = guardPos(g); out.push({ id: g.id, x: p.x, y: p.y, kind: g.id === this.selG() ? 'avatar' : 'dot', label: initials(g.name), color: alertG.has(g.id) ? '#ef4444' : '#16a34a', size: g.id === this.selG() ? 13 : 5.5, alert: alertG.has(g.id), title: `${g.name} · ${g.location}` }); }
    }
    return out;
  });
  protected readonly callout = computed<MapCallout | null>(() => {
    const g = this.selGuard();
    const pos = g && this.posOf(g.id);
    if (!g || !pos) return null;
    const st = this.runByGuard().get(g.id);
    return { x: pos.x, y: pos.y, title: g.name, lines: st ? [`${st.route.name}`, `${st.done}/${st.total} checkpoints`] : [g.post, `Since ${g.since}`], initials: initials(g.name), color: st?.route.color ?? '#16a34a' };
  });

  protected alertIcon(t: string) {
    return t === 'Missed Checkpoint' ? 'map-pin' : t === 'Panic / SOS' ? 'siren' : t === 'Idle Guard' ? 'pause' : t === 'Low Battery' ? 'battery' : t === 'Incident Reported' ? 'file-text' : t === 'Geofence Exit' ? 'locate' : 'clock';
  }
  protected pick(id: string) {
    if (id.startsWith('cp:')) return;
    this.selG.set(id);
    const pos = this.posOf(id);
    if (pos) this.fp()?.focus(pos.x, pos.y, 1.35);
  }
  protected locate(g: Guard) {
    this.pick(g.id);
  }
  protected clearSel() {
    this.selG.set(null);
    this.fp()?.reset();
  }
  protected zoneInfo(id: string) {
    const z = POSTS.find((p) => p.id === id)!;
    const n = this.store.onDuty().filter((g) => g.location === z.name).length;
    this.toastMsg(`${z.name}: ${n} on duty · ${z.required} required · ${z.risk} risk`);
  }
  protected ack(id: number) {
    this.store.alerts.update((l) => l.map((a) => (a.id === id ? { ...a, ack: true } : a)));
  }
  protected doDispatch() {
    const d = this.dispatch()!;
    const target = postByName(d.post);
    const g = this.store.guard(d.guard) ?? [...this.store.onDuty()].sort((a, b) => { const pa = guardPos(a), pb = guardPos(b); const c = (p: { x: number; y: number }) => Math.hypot(p.x - (target.x + target.w / 2), p.y - (target.y + target.h / 2)); return c(pa) - c(pb); })[0];
    this.store.patchGuard(g.id, { location: target.name, site: target.site, post: `${target.site} - ${target.name}` });
    this.store.raise({ type: 'Late Patrol', text: `Dispatched to ${target.name}${d.note ? ': ' + d.note : ''}`, guardId: g.id, post: target.name, sev: 'Low' });
    this.dispatch.set(null);
    this.pick(g.id);
    this.toastMsg(`${g.name} dispatched to ${target.name} · ETA ${2 + (Math.abs(hash(g.id)) % 5)} min`);
  }
  protected go(p: string) {
    this.router.navigate([BASE, p]);
  }
}

/* =====================================================================
   Incidents & Reports
   ===================================================================== */
@Component({
  selector: 'app-incidents-reports',
  imports: [...UI, DataTable, GuardAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Incidents &amp; Reports" [parent]="P" [parentLink]="base" subtitle="Log, investigate and close security incidents; generate daily occurrence and patrol reports.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Report Incident</button>
      <button class="btn-ghost" (click)="dob()"><app-icon name="file-text" [size]="16" />Daily Occurrence Book</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Incidents (This Month)" [value]="month().length" icon="file-chart" color="#8b5cf6" change="8%" [good]="false" sub="vs. last month" />
      <app-kpi label="Open / In Progress" [value]="store.openIncidents().length" icon="triangle-alert" color="#f97316" sub="needs action" />
      <app-kpi label="High &amp; Critical" [value]="highOpen()" icon="siren" color="#ef4444" sub="open now" [subColor]="highOpen() ? '#dc2626' : undefined" />
      <app-kpi label="Avg Response Time" value="6.4 min" icon="clock" color="#3b82f6" change="12%" [up]="false" sub="vs. last month" />
      <app-kpi label="Resolution Rate" [value]="resRate() + '%'" icon="shield-check" color="#22c55e" sub="resolved or closed" />
    </section>
    <section class="charts">
      <div class="card"><div class="card-head"><h3>Incidents – Last 14 Days</h3></div><app-column-chart [labels]="trend().labels" [series]="trend().series" [height]="200" [stacked]="true" /></div>
      <div class="card"><div class="card-head"><h3>By Severity</h3></div><app-donut [segments]="sevSegs()" center="Incidents" [value]="'' + store.incidents().length" [size]="140" /></div>
      <div class="card"><div class="card-head"><h3>By Type</h3></div><app-bar-list [rows]="byType()" [max]="maxType()" /></div>
    </section>
    <section class="card">
      <app-data-table [rows]="store.incidents()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['id', 'type', 'post', 'desc']" searchPlaceholder="Search incident ID, type, location..." noun="incidents" [activeId]="selId()" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" />
    </section>
    @if (sel(); as i) {
      <div class="g-overlay" (click)="selId.set(null)"></div>
      <aside class="g-drawer wide dr">
        <div class="modal-head"><div><h3>{{ i.id }} · {{ i.type }}</h3><span [class]="'sev ' + i.sev">{{ i.sev }}</span> <span [class]="stTag(i.status)">{{ i.status }}</span></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
        <dl class="kv">
          <dt>Date / time</dt><dd>{{ fd(i.date) }} · {{ i.time }}</dd><dt>Location</dt><dd>{{ i.site }} – {{ i.post }}</dd>
          <dt>Reported by</dt><dd>@if (store.guard(i.guardId); as g) {<span class="gx"><app-guard-avatar [g]="g" [size]="24" />{{ g.name }} ({{ g.id }})</span>}</dd>
          <dt>Assigned to</dt><dd><select class="select" [value]="i.assignee" (change)="assign(i, $any($event.target).value)">@for (a of assignees; track a) {<option>{{ a }}</option>}</select></dd>
          <dt>Police notified</dt><dd>{{ i.police ? 'Yes' : 'No' }}</dd>
        </dl>
        <h4>Description</h4><p class="desc">{{ i.desc }}</p>
        <h4>Timeline</h4>
        <ul class="tl">@for (t of i.timeline; track $index) {<li><i></i><b>{{ t.t }}</b><span>{{ t.text }}</span></li>}</ul>
        <div class="note"><input class="input" #nt placeholder="Add investigation note…" /><button class="btn-ghost btn-sm" (click)="note(i, nt.value); nt.value = ''">Add note</button></div>
        <div class="form-actions">
          @if (i.status === 'Open') {<button class="btn-ghost" (click)="setSt(i, 'In Progress', 'Investigation started')">Start investigation</button>}
          @if (i.status === 'Open' || i.status === 'In Progress') {<button class="btn-primary" (click)="setSt(i, 'Resolved', 'Marked resolved')">Resolve</button>}
          @if (i.status === 'Resolved') {<button class="btn-primary" (click)="setSt(i, 'Closed', 'Report approved and closed')">Approve &amp; close</button>}
          <button class="btn-ghost" (click)="printReport(i)">Download report</button>
        </div>
      </aside>
    }
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Report incident</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Incident type<select class="select" [value]="f.type" (change)="fset('type', $any($event.target).value)">@for (t of types; track t) {<option>{{ t }}</option>}</select></label>
          <label>Severity<select class="select" [value]="f.sev" (change)="fset('sev', $any($event.target).value)">@for (s of sevs; track s) {<option>{{ s }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.post" (change)="fset('post', $any($event.target).value)">@for (p of postList; track p.id) {<option [value]="p.name">{{ p.name }} ({{ p.site }})</option>}</select></label>
          <label>Reported by<select class="select" [value]="f.guardId" (change)="fset('guardId', $any($event.target).value)">@for (g of store.onDuty(); track g.id) {<option [value]="g.id">{{ g.name }} · {{ g.id }}</option>}</select></label>
          <label class="full">Description *<textarea class="input ta" rows="3" [value]="f.desc" (input)="fset('desc', $any($event.target).value)"></textarea></label>
          <label class="ckl"><input type="checkbox" [checked]="f.police" (change)="fset('police', !f.police)" />Police / civil defence notified</label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Submit report</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .charts { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .dr { width: min(560px, 100vw) !important; } .dr h3 { margin: 0 0 6px; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 8px; font-size: 13px; margin: 8px 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; } .kv .select { width: 220px; }
    h4 { margin: 14px 0 6px; font-size: 13px; } .desc { font-size: 13px; margin: 0; color: #3b3f5c; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 6px; border-left: 2px solid #ede9fe; } .tl li { display: grid; grid-template-columns: 12px 50px 1fr; gap: 6px; align-items: center; padding: 5px 0; font-size: 12.5px; margin-left: -12px; }
    .tl i { width: 10px; height: 10px; border-radius: 50%; background: var(--primary); border: 2px solid #fff; }
    .note { display: flex; gap: 8px; margin-top: 10px; } .note .input { flex: 1; }
    .ta { height: auto; padding: 8px; font: inherit; } .ckl { flex-direction: row !important; align-items: center; gap: 6px !important; }
    @media (max-width: 1200px) { .charts { grid-template-columns: 1fr; } }
  `,
})
export class PatrolIncidents {
  protected readonly store = inject(PatrolStore);
  protected readonly P = 'Patrol & Guard Management';
  protected readonly base = BASE;
  protected readonly fd = fmtD;
  protected readonly types = INC_TYPES;
  protected readonly sevs: ISev[] = ['Critical', 'High', 'Medium', 'Low'];
  protected readonly postList = POSTS;
  protected readonly assignees = ['Site Supervisor', 'Shift Supervisor', 'Security Manager', 'Control Room Lead', 'HSE Officer'];
  protected readonly selId = signal<string | null>(null);
  protected readonly form = signal<{ type: string; sev: ISev; post: string; guardId: string; desc: string; police: boolean } | null>(null);
  protected readonly err = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Incident ID' },
    { key: 'date', label: 'Date', fmt: (v, r) => `${fmtD(v)} ${r.time}` },
    { key: 'type', label: 'Type' },
    { key: 'sev', label: 'Severity', kind: 'tag', tag: (r) => (r.sev === 'Critical' ? 'tag red' : r.sev === 'High' ? 'tag amber' : r.sev === 'Medium' ? 'tag blue' : 'tag grey') },
    { key: 'post', label: 'Location', fmt: (v, r) => `${v} · ${r.site}` },
    { key: 'guardId', label: 'Reported By', fmt: (v) => this.store.guard(v)?.name ?? v },
    { key: 'assignee', label: 'Assignee' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => this.stTag(r.status) },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Open', 'In Progress', 'Resolved', 'Closed'] },
    { key: 'sev', label: 'Severity', options: ['Critical', 'High', 'Medium', 'Low'] },
    { key: 'type', label: 'Type', options: INC_TYPES },
    { key: 'site', label: 'Site', options: SITE_NAMES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'file-text' },
    { id: 'start', label: 'Start investigation', icon: 'play', when: (r) => r.status === 'Open' },
    { id: 'resolve', label: 'Resolve', icon: 'shield-check', when: (r) => r.status === 'Open' || r.status === 'In Progress' },
    { id: 'close', label: 'Approve & close', icon: 'p-check', when: (r) => r.status === 'Resolved' },
    { id: 'escalate', label: 'Escalate to manager', icon: 'triangle-alert', danger: true, when: (r) => r.status !== 'Closed' },
  ];
  protected readonly sel = computed(() => this.store.incidents().find((i) => i.id === this.selId()) ?? null);
  protected readonly month = computed(() => this.store.incidents().filter((i) => i.date.startsWith('2026-10')));
  protected readonly highOpen = computed(() => this.store.openIncidents().filter((i) => i.sev === 'High' || i.sev === 'Critical').length);
  protected readonly resRate = computed(() => Math.round((this.store.incidents().filter((i) => i.status === 'Resolved' || i.status === 'Closed').length / this.store.incidents().length) * 100));
  protected readonly sevSegs = computed(() => {
    const c = (s: string) => this.store.incidents().filter((i) => i.sev === s).length;
    return [{ label: 'Critical', value: c('Critical'), color: '#ef4444' }, { label: 'High', value: c('High'), color: '#f97316' }, { label: 'Medium', value: c('Medium'), color: '#f59e0b' }, { label: 'Low', value: c('Low'), color: '#3b82f6' }];
  });
  protected readonly byType = computed(() => INC_TYPES.map((t) => ({ label: t, value: this.store.incidents().filter((i) => i.type === t).length, color: '#7c3aed' })).sort((a, b) => b.value - a.value).slice(0, 7));
  protected readonly maxType = computed(() => Math.max(...this.byType().map((r) => r.value), 1));
  protected readonly trend = computed(() => {
    const days = Array.from({ length: 14 }, (_, k) => { const d = new Date(2026, 9, 1 + k); return d.toISOString().slice(0, 10); });
    const labels = days.map((d) => d.slice(8));
    const cnt = (d: string, s: string[]) => this.store.incidents().filter((i) => i.date === d && s.includes(i.sev)).length;
    return { labels, series: [{ name: 'High / Critical', color: '#ef4444', values: days.map((d) => cnt(d, ['High', 'Critical'])) }, { name: 'Medium / Low', color: '#a78bfa', values: days.map((d) => cnt(d, ['Medium', 'Low'])) }] };
  });

  protected stTag(s: string) {
    return s === 'Open' ? 'tag red' : s === 'In Progress' ? 'tag amber' : s === 'Resolved' ? 'tag blue' : 'tag green';
  }
  protected act(a: string, i: Incident) {
    if (a === 'view') return this.selId.set(i.id);
    if (a === 'start') return this.setSt(i, 'In Progress', 'Investigation started');
    if (a === 'resolve') return this.setSt(i, 'Resolved', 'Marked resolved');
    if (a === 'close') return this.setSt(i, 'Closed', 'Report approved and closed');
    if (a === 'escalate') {
      this.store.setIncident(i.id, i.status, 'Escalated to Security Manager');
      this.toastMsg(`${i.id} escalated to Security Manager`);
    }
  }
  protected setSt(i: Incident, s: IStatus, note: string) {
    this.store.setIncident(i.id, s, note);
    this.toastMsg(`${i.id} · ${s}`);
  }
  protected assign(i: Incident, a: string) {
    this.store.incidents.update((l) => l.map((x) => (x.id === i.id ? { ...x, assignee: a } : x)));
    this.store.setIncident(i.id, i.status, `Assigned to ${a}`);
  }
  protected note(i: Incident, n: string) {
    if (n.trim()) this.store.setIncident(i.id, i.status, n.trim());
  }
  protected openForm() {
    this.err.set('');
    this.form.set({ type: 'Suspicious Activity', sev: 'Medium', post: 'Main Gate', guardId: this.store.onDuty()[0].id, desc: '', police: false });
  }
  protected fset(k: string, v: unknown) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.desc.trim()) return this.err.set('Please describe the incident.');
    const p = postByName(f.post);
    const inc = this.store.reportIncident({ type: f.type, sev: f.sev, post: p.name, site: p.site, guardId: f.guardId, desc: f.desc, assignee: 'Shift Supervisor', police: f.police });
    this.form.set(null);
    this.selId.set(inc.id);
    this.toastMsg(`${inc.id} logged · control room alerted on Live Patrol Monitoring`);
  }
  protected dob() {
    const today = this.store.incidents().filter((i) => i.date === '2026-10-14');
    downloadCsv('daily-occurrence-book-2026-10-14.csv', [['Time', 'Incident', 'Type', 'Severity', 'Location', 'Reported By', 'Status', 'Details'], ...today.map((i) => [i.time, i.id, i.type, i.sev, i.post, this.store.guard(i.guardId)?.name ?? i.guardId, i.status, i.desc])]);
    this.toastMsg(`Daily Occurrence Book exported · ${today.length} entries`);
  }
  protected printReport(i: Incident) {
    downloadCsv(`${i.id}.csv`, [['Field', 'Value'], ['ID', i.id], ['Type', i.type], ['Severity', i.sev], ['Status', i.status], ['Location', `${i.site} - ${i.post}`], ['Date', `${i.date} ${i.time}`], ['Description', i.desc], ...i.timeline.map((t) => [t.t, t.text])]);
  }
  protected exportCsv() {
    downloadCsv('incidents.csv', [['ID', 'Date', 'Time', 'Type', 'Severity', 'Site', 'Location', 'Reported By', 'Assignee', 'Status'], ...this.store.incidents().map((i) => [i.id, i.date, i.time, i.type, i.sev, i.site, i.post, i.guardId, i.assignee, i.status])]);
  }
}

/* =====================================================================
   Guard Performance
   ===================================================================== */
const MONTHS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
@Component({
  selector: 'app-guard-performance',
  imports: [...UI, GuardAvatar, MessageModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Guard Performance" [parent]="P" [parentLink]="base" subtitle="Patrol compliance, response times, attendance and ratings for every guard and security company.">
      <select class="select" [value]="period()" (change)="period.set($any($event.target).value)"><option>This Month</option><option>Last Month</option><option>This Quarter</option></select>
      <button class="btn-primary" (click)="recognizeTop()"><app-icon name="p-award" [size]="16" />Recognize Top 5</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Avg Patrol Compliance" [value]="avg('compliance') + '%'" icon="shield-check" color="#22c55e" change="2.1%" sub="vs. last month" />
      <app-kpi label="Checkpoint Scan Rate" [value]="scanRate() + '%'" icon="fingerprint" color="#8b5cf6" change="1.4%" sub="vs. last month" />
      <app-kpi label="Avg Response Time" [value]="avg('response') + ' min'" icon="clock" color="#3b82f6" change="8%" [up]="false" sub="faster" />
      <app-kpi label="Attendance" [value]="avg('attendance') + '%'" icon="user-check" color="#f59e0b" sub="on-time shift starts" />
      <app-kpi label="Avg Rating" [value]="avg('rating') + ' / 5'" icon="star" color="#ef4444" [sub]="coaching().length + ' flagged for coaching'" />
    </section>
    <section class="charts">
      <div class="card"><div class="card-head"><h3>Patrol Compliance Trend</h3><span class="muted">by company · target 95%</span></div><app-line-chart [labels]="months" [series]="trend()" [height]="220" [min]="80" [max]="100" suffix="%" /></div>
      <div class="card"><div class="card-head"><h3>Company Scorecard</h3><span class="muted">avg guard score</span></div><app-bar-list [rows]="byCompany()" [max]="100" />
        <table class="table sc"><thead><tr><th>Company</th><th class="num">Guards</th><th class="num">SLA</th><th class="num">Rating</th></tr></thead>
          <tbody>@for (c of store.companies(); track c.name) {<tr><td><i class="dot-sm" [style.background]="c.color"></i>{{ c.name }}</td><td class="num">{{ c.guards }}</td><td class="num" [class.bad]="c.sla < c.slaTarget">{{ c.sla }}%</td><td class="num">{{ c.rating }}</td></tr>}</tbody></table>
      </div>
    </section>
    <div class="lay" [class.with]="!!sel()">
      <section class="card">
        <div class="bar">
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search guard..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <select class="select" [value]="company()" (change)="company.set($any($event.target).value)"><option value="">All Companies</option>@for (c of companies; track c) {<option [value]="c">{{ c }}</option>}</select>
          <select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
          <span class="muted sm">Sorted by {{ sortLabel() }} · click a header to sort</span>
        </div>
        <div class="tw">
          <table class="table pt">
            <thead><tr><th>#</th><th>Guard</th><th class="s" (click)="sortKey.set('compliance')">Compliance</th><th class="s num" (click)="sortKey.set('scans')">Scans</th><th class="s num" (click)="sortKey.set('response')">Response</th><th class="s num" (click)="sortKey.set('attendance')">Attendance</th><th class="s num" (click)="sortKey.set('incidents')">Incidents</th><th class="s" (click)="sortKey.set('rating')">Rating</th><th class="s num" (click)="sortKey.set('score')">Score</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.g.id; let i = $index) {
                <tr [class.on]="r.g.id === selId()" (click)="selId.set(r.g.id)">
                  <td><span class="rk" [class.top]="i < 3">{{ i + 1 }}</span></td>
                  <td><span class="gx"><app-guard-avatar [g]="r.g" [size]="30" /><div><b>{{ r.g.name }}@if (recognized().has(r.g.id)) { 🏅}</b><small>{{ r.g.id }} · {{ r.g.company }}</small></div></span></td>
                  <td><div class="cb"><div class="mini-progress"><i [style.width.%]="r.g.compliance" [style.background]="r.g.compliance >= 95 ? '#22c55e' : r.g.compliance >= 88 ? '#f59e0b' : '#ef4444'"></i></div>{{ r.g.compliance }}%</div></td>
                  <td class="num">{{ r.g.scans }}</td><td class="num">{{ r.g.response }} min</td><td class="num">{{ r.g.attendance }}%</td><td class="num">{{ r.g.incidents }}</td>
                  <td><span class="stars">{{ stars(r.g.rating) }}</span> {{ r.g.rating }}</td>
                  <td class="num"><b>{{ r.score }}</b></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager"><span>Showing {{ rows().length }} of {{ all().length }} guards</span>@if (rows().length < all().length) {<button class="btn-ghost btn-sm" (click)="limit.set(limit() + 15)">Show more</button>}</div>
      </section>
      @if (sel(); as r) {
        <aside class="card det">
          <div class="dh"><app-guard-avatar [g]="r.g" [size]="56" /><div><h3>{{ r.g.name }}</h3><small>{{ r.g.id }} · {{ r.g.company }} · {{ r.g.location }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="ringrow"><app-ring [value]="r.score" [color]="r.score >= 90 ? '#22c55e' : r.score >= 80 ? '#f59e0b' : '#ef4444'" [size]="90" /><div><b>Overall score {{ r.score }}</b><small>Rank {{ rank(r.g.id) }} of {{ all().length }}</small><small>{{ period() }}</small></div></div>
          <div class="mx">
            <div><small>Patrol compliance</small><b>{{ r.g.compliance }}%</b></div><div><small>Checkpoints scanned</small><b>{{ r.g.scans }}</b></div>
            <div><small>Avg response</small><b>{{ r.g.response }} min</b></div><div><small>Attendance</small><b>{{ r.g.attendance }}%</b></div>
            <div><small>Incidents reported</small><b>{{ r.g.incidents }}</b></div><div><small>Supervisor rating</small><b>{{ r.g.rating }} / 5</b></div>
          </div>
          <h4>Compliance – last 6 months</h4>
          <app-sparkline [values]="spark(r.g)" color="#7c3aed" />
          <div class="row">
            <button class="btn-primary btn-sm" (click)="recognize(r.g)"><app-icon name="p-award" [size]="14" />Give Recognition</button>
            <button class="btn-ghost btn-sm" (click)="coach(r.g)">{{ coaching().includes(r.g.id) ? 'Remove coaching flag' : 'Flag for Coaching' }}</button>
            <button class="btn-ghost btn-sm" (click)="msgTo.set([r.g])">Message</button>
          </div>
          @if (coaching().length) {
            <h4>Coaching list</h4>
            <ul class="cl">@for (id of coaching(); track id) {<li>{{ store.guard(id)?.name }} <small class="muted">· {{ store.guard(id)?.compliance }}% compliance</small></li>}</ul>
          }
        </aside>
      }
    </div>
    @if (msgTo(); as list) {<app-message-modal [guards]="list" (close)="msgTo.set(null)" (done)="toastMsg($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .head-btns .select { height: 38px; }
    .charts { display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; margin-bottom: 12px; } .sc { margin-top: 10px; font-size: 12px; } .sc td, .sc th { padding: 5px 6px; }
    .lay { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; } .lay.with { grid-template-columns: minmax(0, 1fr) 360px; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; } .bar .search-box { width: 220px; } .sm { font-size: 12px; margin-left: auto; }
    .tw { overflow-x: auto; } .pt tr { cursor: pointer; } .pt tr.on td { background: #f7f3ff; } .s { cursor: pointer; } .s:hover { color: var(--primary); }
    .rk { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #eef0f5; font-size: 11.5px; font-weight: 700; } .rk.top { background: #fef3c7; color: #b45309; }
    .cb { display: flex; align-items: center; gap: 8px; } .cb .mini-progress { width: 70px; }
    .stars { color: #f59e0b; letter-spacing: 1px; }
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .dh { display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: center; } .dh h3 { margin: 0; } .dh small { color: var(--muted); }
    .ringrow { display: flex; gap: 14px; align-items: center; } .ringrow div { display: flex; flex-direction: column; font-size: 13px; } .ringrow small { color: var(--muted); }
    .mx { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .mx div { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; } .mx small { color: var(--muted); font-size: 11px; } .mx b { font-size: 15px; }
    h4 { margin: 4px 0 0; font-size: 12.5px; } .row { display: flex; gap: 6px; flex-wrap: wrap; } .cl { margin: 0; padding-left: 18px; font-size: 12.5px; }
    @media (max-width: 1250px) { .charts, .lay.with { grid-template-columns: 1fr; } }
  `,
})
export class GuardPerformance {
  protected readonly store = inject(PatrolStore);
  protected readonly P = 'Patrol & Guard Management';
  protected readonly base = BASE;
  protected readonly months = MONTHS;
  protected readonly companies = COMPANY_NAMES;
  protected readonly sites = SITE_NAMES;
  protected readonly period = signal('This Month');
  protected readonly q = signal('');
  protected readonly company = signal('');
  protected readonly site = signal('');
  protected readonly sortKey = signal<'score' | 'compliance' | 'scans' | 'response' | 'attendance' | 'incidents' | 'rating'>('score');
  protected readonly limit = signal(15);
  protected readonly selId = signal<string | null>(null);
  protected readonly recognized = signal(new Set<string>());
  protected readonly coaching = signal<string[]>(['GRD-052', 'GRD-119']);
  protected readonly msgTo = signal<Guard[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));

  private readonly shift = computed(() => (this.period() === 'Last Month' ? -1.6 : this.period() === 'This Quarter' ? -0.8 : 0));
  private readonly scored = computed(() => {
    const d = this.shift();
    return this.store.guards().filter((g) => g.rating > 0).map((g0) => {
      const g = d ? { ...g0, compliance: Math.max(60, Math.round(g0.compliance + d * ((Math.abs(hash(g0.id)) % 3) - 0.6))) } : g0;
      const score = Math.round(g.compliance * 0.4 + g.attendance * 0.25 + (g.rating / 5) * 100 * 0.2 + Math.max(0, 100 - g.response * 8) * 0.15);
      return { g, score };
    });
  });
  protected readonly all = computed(() => {
    const q = this.q().toLowerCase();
    const k = this.sortKey();
    const l = this.scored().filter((r) => (!q || r.g.name.toLowerCase().includes(q)) && (!this.company() || r.g.company === this.company()) && (!this.site() || r.g.site === this.site()));
    return l.sort((a, b) => (k === 'score' ? b.score - a.score : k === 'response' ? a.g.response - b.g.response : (b.g[k] as number) - (a.g[k] as number)));
  });
  protected readonly rows = computed(() => this.all().slice(0, this.limit()));
  protected readonly sel = computed(() => this.scored().find((r) => r.g.id === this.selId()) ?? null);
  protected readonly sortLabel = computed(() => ({ score: 'overall score', compliance: 'compliance', scans: 'scans', response: 'response time', attendance: 'attendance', incidents: 'incidents', rating: 'rating' })[this.sortKey()]);
  protected readonly scanRate = computed(() => (96.8 + this.shift() / 2).toFixed(1));
  protected readonly trend = computed(() => {
    const cs = this.store.companies();
    return [
      ...cs.slice(0, 4).map((c, i) => ({ name: c.name, color: c.color, values: MONTHS.map((_, m) => Math.round((c.sla - 4 + m * 0.7 + Math.sin(m + i) * 1.2) * 10) / 10) })),
      { name: 'Target', color: '#94a3b8', values: MONTHS.map(() => 95), dashed: true },
    ];
  });
  protected readonly byCompany = computed(() => this.store.companies().map((c) => {
    const gs = this.scored().filter((r) => r.g.company === c.name);
    const v = Math.round(gs.reduce((a, r) => a + r.score, 0) / Math.max(1, gs.length));
    return { label: c.name, value: v, display: `${v} / 100`, color: c.color };
  }));

  protected avg(k: 'compliance' | 'response' | 'attendance' | 'rating') {
    const l = this.scored();
    const v = l.reduce((a, r) => a + (r.g[k] as number), 0) / Math.max(1, l.length);
    return k === 'compliance' || k === 'attendance' ? v.toFixed(1) : v.toFixed(1);
  }
  protected stars(r: number) {
    return '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
  }
  protected rank(id: string) {
    return [...this.scored()].sort((a, b) => b.score - a.score).findIndex((r) => r.g.id === id) + 1;
  }
  protected spark(g: Guard) {
    const h = Math.abs(hash(g.id));
    return MONTHS.map((_, i) => Math.min(100, g.compliance - 5 + i + ((h >> i) % 4)));
  }
  protected recognize(g: Guard) {
    this.recognized.update((s) => new Set(s).add(g.id));
    this.toastMsg(`Recognition sent to ${g.name} · shared with ${g.company}`);
  }
  protected recognizeTop() {
    const top = [...this.scored()].sort((a, b) => b.score - a.score).slice(0, 5);
    this.recognized.update((s) => { const n = new Set(s); top.forEach((r) => n.add(r.g.id)); return n; });
    this.toastMsg(`Top 5 recognized: ${top.map((r) => r.g.name.split(' ')[0]).join(', ')}`);
  }
  protected coach(g: Guard) {
    const has = this.coaching().includes(g.id);
    this.coaching.update((l) => (has ? l.filter((x) => x !== g.id) : [...l, g.id]));
    this.toastMsg(has ? `${g.name} removed from coaching list` : `${g.name} flagged for coaching · supervisor notified`);
  }
  protected exportCsv() {
    downloadCsv('guard-performance.csv', [['Rank', 'ID', 'Guard', 'Company', 'Compliance %', 'Scans', 'Response min', 'Attendance %', 'Incidents', 'Rating', 'Score'], ...this.all().map((r, i) => [i + 1, r.g.id, r.g.name, r.g.company, r.g.compliance, r.g.scans, r.g.response, r.g.attendance, r.g.incidents, r.g.rating, r.score])]);
  }
}
