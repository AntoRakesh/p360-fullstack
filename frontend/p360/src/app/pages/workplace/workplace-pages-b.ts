import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { BOOKING_ICON, prioTag, reqTag, slaTag, WKpi, WP_CSS } from './workplace-ui';
import {
  avColor, CATEGORIES, CleanTask, CLEANERS, fmtD, initials, ME, Priority, Request, ReqStatus, ROOMS, Service, SERVICES, SLA_HOURS, slaState, toMin, TODAY,
  TOP_ZONES, USAGE_7D, WorkplaceStore, WP_SITES,
} from './workplace.data';

const toast = () => {
  const t = signal<string | null>(null);
  return { t, show: (m: string) => { t.set(m); setTimeout(() => t() === m && t.set(null), 2600); } };
};
const PARENT = 'Workplace & Facility Services';

/* =====================================================================
   Housekeeping & Cleaning — schedule, checklists, staff, sensor alerts
   ===================================================================== */
@Component({
  selector: 'app-housekeeping-cleaning',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Housekeeping & Cleaning" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Schedule cleaning, track checklists and respond to sensor-driven hygiene alerts.">
      <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="18" />Add Cleaning Task</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Tasks Today" [value]="tasks().length" icon="w-broom" color="var(--ka-2563eb)" [sub]="postBooking() + ' after desk bookings'" />
      <app-wkpi label="Completed" [value]="cnt()['Done']" icon="w-check-circle" color="var(--ka-16c26b)" [strong]="pct(cnt()['Done'])" sub="on schedule" />
      <app-wkpi label="In Progress" [value]="cnt()['In Progress']" icon="activity" color="var(--ka-7c3aed)" [sub]="cnt()['Pending'] + ' pending'" />
      <app-wkpi label="Missed" [value]="cnt()['Missed']" icon="triangle-alert" color="var(--ka-ef3b4f)" sub="needs re-clean" [clickable]="true" (click)="filter.set('Missed')" />
      <app-wkpi label="Cleanliness Score" value="4.6 / 5" icon="star" color="var(--ka-f5a524)" strong="0.2" arrow="up" sub="vs. last week" />
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch"><h3>Cleaning Schedule · {{ fmtD(today) }}</h3>
          <div class="tools"><div class="seg">@for (f of filters; track f) {<button [class.on]="filter() === f" (click)="filter.set(f)">{{ f }} <em>{{ f === 'All' ? tasks().length : cnt()[f] }}</em></button>}</div>
            <select class="select sm" [value]="site()" (change)="site.set($any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option>{{ s }}</option>}</select></div></div>
        <div class="rows">
          @for (t of shown(); track t.id) {
            <div class="task" [class.open]="openId() === t.id">
              <div class="tr" (click)="openId.set(openId() === t.id ? null : t.id)">
                <span class="tm">{{ t.time }}</span>
                <span class="nm"><b>{{ t.task }}</b><small>{{ t.area }} · {{ t.site }} · {{ t.floor }}</small></span>
                <span class="who"><span class="dt-av" [style.background]="av(t.staff)">{{ ini(t.staff) }}</span>{{ t.staff }}</span>
                <span [class]="t.trigger === 'Sensor' ? 'tag red' : t.trigger === 'Post-booking' ? 'tag' : t.trigger === 'On demand' ? 'tag amber' : 'tag grey'">{{ t.trigger }}</span>
                <span class="prog"><span class="bar"><i [style.width.%]="done(t)" [style.background]="t.status === 'Missed' ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'"></i></span><small>{{ doneN(t) }}/{{ t.checklist.length }}</small></span>
                <span [class]="reqTag(t.status)">{{ t.status }}</span>
                <span class="acts" (click)="$event.stopPropagation()">
                  @if (t.status === 'Pending' || t.status === 'Missed') {<button class="btn-ghost sm" (click)="start(t)">Start</button>}
                  @if (t.status === 'In Progress') {<button class="btn-primary btn-sm" (click)="complete(t)">Complete</button>}
                </span>
              </div>
              @if (openId() === t.id) {
                <div class="cl">
                  @for (c of t.checklist; track c.item; let i = $index) {<label class="ck"><input type="checkbox" [checked]="c.done" (change)="tick(t, i)" />{{ c.item }}</label>}
                  <label class="re">Reassign<select class="select sm" [value]="t.staff" (change)="reassign(t, $any($event.target).value)">@for (c of cleaners; track c) {<option>{{ c }}</option>}</select></label>
                </div>
              }
            </div>
          } @empty {<p class="empty">No tasks in this view.</p>}
        </div>
      </div>
      <div class="col">
        <div class="card">
          <div class="ch"><h3>Sensor Alerts</h3><span class="chip live"><i></i>Live</span></div>
          <div class="rows">
            @for (s of sensors(); track s.id) {
              <div class="row"><span class="ic soft" [style.--c]="s.level > 80 ? 'var(--ka-ef4444)' : 'var(--ka-f59e0b)'"><app-icon [name]="s.icon" [size]="16" /></span><span class="nm"><b>{{ s.place }}</b><small>{{ s.metric }} · {{ s.value }}</small></span>
                @if (dispatched().has(s.id)) {<span class="tag green">Dispatched</span>} @else {<button class="btn-ghost sm" (click)="dispatch(s)">Dispatch</button>}</div>
            }
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Staff on Duty</h3><span class="muted sm">{{ cleaners.length }} cleaners</span></div>
          <div class="rows">
            @for (c of staff(); track c.name) {
              <div class="row"><span class="dt-av" [style.background]="av(c.name)">{{ ini(c.name) }}</span><span class="nm"><b>{{ c.name }}</b><span class="bar"><i [style.width.%]="(c.done / (c.total || 1)) * 100" style="background:var(--kb-7c3aed)"></i></span></span><small>{{ c.done }}/{{ c.total }}</small></div>
            }
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Supplies Running Low</h3></div>
          <div class="rows">
            @for (s of supplies(); track s.item) {
              <div class="row"><span class="ic soft" style="--c:var(--ka-0891b2)"><app-icon name="w-package" [size]="16" /></span><span class="nm"><b>{{ s.item }}</b><small>{{ s.where }} · {{ s.left }}% left</small></span>
                @if (s.ordered) {<span class="tag green">Ordered</span>} @else {<button class="btn-ghost sm" (click)="reorder(s.item)">Reorder</button>}</div>
            }
          </div>
        </div>
      </div>
    </section>
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Add Cleaning Task</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Task<select class="select" [value]="f.task" (change)="form.set({ ...f, task: $any($event.target).value })">@for (t of taskTypes; track t) {<option>{{ t }}</option>}</select></label>
          <label>Area *<input class="input" [value]="f.area" (input)="form.set({ ...f, area: $any($event.target).value })" /></label>
          <label>Floor<select class="select" [value]="f.floor" (change)="form.set({ ...f, floor: $any($event.target).value })">@for (n of [1, 2, 3, 4, 5, 6, 7, 8]; track n) {<option>Floor {{ n }}</option>}</select></label>
          <label>Assign to<select class="select" [value]="f.staff" (change)="form.set({ ...f, staff: $any($event.target).value })">@for (c of cleaners; track c) {<option>{{ c }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Add Task</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .seg em { font-style: normal; font-size: 10.5px; opacity: .7; margin-left: 2px; }
    .task { border-bottom: 1px solid var(--kl-f0f1f6); } .task.open { background: var(--kb-fcfbff); }
    .tr { display: grid; grid-template-columns: 66px minmax(0, 1.4fr) minmax(0, 1fr) 92px 80px 86px 86px; gap: 10px; align-items: center; padding: 9px 4px; font-size: 12.5px; cursor: pointer; }
    .tm { font-weight: 600; font-size: 12px; } .nm { display: flex; flex-direction: column; min-width: 0; } .nm b { font-weight: 600; } .nm small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who { display: flex; align-items: center; gap: 7px; font-size: 12px; white-space: nowrap; overflow: hidden; } .tr .tag { justify-self: start; }
    .prog { display: flex; flex-direction: column; gap: 3px; } .prog small { font-size: 10.5px; color: var(--muted); }
    .cl { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 4px 12px 12px 80px; align-items: center; }
    .ck { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; } .re { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-left: auto; }
    .row .nm { gap: 4px; } .row > small { font-size: 11px; color: var(--muted); }
  `],
})
export class Housekeeping {
  protected readonly store = inject(WorkplaceStore);
  private readonly app = inject(AppState);
  protected readonly parent = PARENT;
  protected readonly fmtD = fmtD;
  protected readonly reqTag = reqTag;
  protected readonly av = avColor;
  protected readonly ini = initials;
  protected readonly today = TODAY;
  protected readonly sites = WP_SITES;
  protected readonly cleaners = CLEANERS;
  protected readonly ts = toast();
  protected readonly filters = ['All', 'Pending', 'In Progress', 'Done', 'Missed'] as const;
  protected readonly taskTypes = ['Desk sanitization', 'Restroom clean', 'Meeting room reset', 'Pantry deep clean', 'Spill clean-up', 'Waste collection'];
  protected readonly filter = signal<string>('All');
  protected readonly site = signal('All Sites');
  protected readonly openId = signal<string | null>('HK-007');
  protected readonly dispatched = signal(new Set<number>());
  protected readonly supplies = signal([
    { item: 'Hand soap refills', where: 'Restrooms Core A · Floor 5', left: 12, ordered: false },
    { item: 'Paper towels', where: 'Restrooms · Floor 3', left: 18, ordered: false },
    { item: 'Disinfectant wipes', where: 'Housekeeping store', left: 22, ordered: false },
  ]);
  protected readonly form = signal<{ task: string; area: string; floor: string; staff: string } | null>(null);

  protected readonly tasks = computed(() => this.store.cleaning().filter((t) => this.site() === 'All Sites' || t.site === this.site()).sort((a, b) => toMin(a.time) - toMin(b.time)));
  protected readonly shown = computed(() => this.tasks().filter((t) => this.filter() === 'All' || t.status === this.filter()));
  protected readonly cnt = computed(() => {
    const c: Record<string, number> = { Pending: 0, 'In Progress': 0, Done: 0, Missed: 0 };
    for (const t of this.tasks()) c[t.status]++;
    return c;
  });
  protected readonly postBooking = computed(() => this.tasks().filter((t) => t.trigger === 'Post-booking').length);
  protected readonly staff = computed(() => CLEANERS.map((name) => {
    const l = this.store.cleaning().filter((t) => t.staff === name);
    return { name, total: l.length, done: l.filter((t) => t.status === 'Done').length };
  }).slice(0, 6));
  protected readonly sensors = computed(() => {
    const k = this.app.tick();
    return [
      { id: 1, place: 'Restrooms Core A · Floor 5', metric: 'Footfall since last clean', value: `${142 + k} visits`, level: 88, icon: 'users' },
      { id: 2, place: 'Pantry · Floor 3', metric: 'Air quality (VOC)', value: `${(612 + (k % 7) * 4)} ppb`, level: 74, icon: 'w-droplet' },
      { id: 3, place: 'Meeting Room A', metric: 'Back-to-back bookings', value: '4 without reset', level: 82, icon: 'w-room' },
    ];
  });

  protected pct(n: number) {
    return Math.round((n / (this.tasks().length || 1)) * 100) + '%';
  }
  protected doneN(t: CleanTask) {
    return t.checklist.filter((c) => c.done).length;
  }
  protected done(t: CleanTask) {
    return (this.doneN(t) / t.checklist.length) * 100;
  }
  protected start(t: CleanTask) {
    this.store.patchCleaning(t.id, { status: 'In Progress' });
    this.openId.set(t.id);
    this.ts.show(`${t.staff} started ${t.task.toLowerCase()} · ${t.area}`);
  }
  protected complete(t: CleanTask) {
    this.store.patchCleaning(t.id, { status: 'Done', checklist: t.checklist.map((c) => ({ ...c, done: true })) });
    this.ts.show(`${t.task} completed · ${t.area}`);
  }
  protected tick(t: CleanTask, i: number) {
    const checklist = t.checklist.map((c, k) => (k === i ? { ...c, done: !c.done } : c));
    const all = checklist.every((c) => c.done);
    this.store.patchCleaning(t.id, { checklist, status: all ? 'Done' : checklist.some((c) => c.done) ? 'In Progress' : t.status });
    if (all) this.ts.show(`${t.task} completed · ${t.area}`);
  }
  protected reassign(t: CleanTask, staff: string) {
    this.store.patchCleaning(t.id, { staff });
    this.ts.show(`${t.id} reassigned to ${staff}`);
  }
  protected dispatch(s: { id: number; place: string }) {
    this.dispatched.update((x) => new Set(x).add(s.id));
    this.store.cleaning.update((l) => [...l, { id: `HK-${String(l.length + 1).padStart(3, '0')}`, task: 'Spot clean (sensor)', area: s.place.split(' · ')[0], site: 'Head Office', floor: s.place.split(' · ')[1] ?? 'Floor 5', time: '10:30 AM', staff: CLEANERS[2], status: 'In Progress', checklist: [{ item: 'Inspect area', done: true }, { item: 'Clean & sanitize', done: false }, { item: 'Reset sensor counter', done: false }], trigger: 'Sensor' }]);
    this.ts.show(`${CLEANERS[2]} dispatched to ${s.place}`);
  }
  protected reorder(item: string) {
    this.supplies.update((l) => l.map((s) => (s.item === item ? { ...s, ordered: true } : s)));
    this.store.addRequest({ title: `Restock: ${item}`, category: 'Cleaning', priority: 'Low', kind: 'Service', assignee: 'Stores', status: 'Assigned' });
    this.ts.show(`${item} reorder raised with Stores`);
  }
  protected openNew() {
    this.form.set({ task: 'Spill clean-up', area: '', floor: 'Floor 5', staff: CLEANERS[0] });
  }
  protected save() {
    const f = this.form()!;
    if (!f.area.trim()) return;
    this.store.cleaning.update((l) => [...l, { id: `HK-${String(l.length + 1).padStart(3, '0')}`, task: f.task, area: f.area, site: 'Head Office', floor: f.floor, time: '10:45 AM', staff: f.staff, status: 'Pending', checklist: [{ item: 'Inspect area', done: false }, { item: 'Clean & sanitize', done: false }, { item: 'Sign off', done: false }], trigger: 'On demand' }]);
    this.form.set(null);
    this.ts.show(`${f.task} added for ${f.staff}`);
  }
  protected exportCsv() {
    downloadCsv('housekeeping-tasks.csv', [['ID', 'Time', 'Task', 'Area', 'Site', 'Floor', 'Staff', 'Trigger', 'Status', 'Checklist'], ...this.tasks().map((t) => [t.id, t.time, t.task, t.area, t.site, t.floor, t.staff, t.trigger, t.status, `${this.doneN(t)}/${t.checklist.length}`])]);
  }
}

/* =====================================================================
   Maintenance Requests — work-order kanban, PPM schedule, cost
   ===================================================================== */
const STAGES: ReqStatus[] = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Resolved'];
@Component({
  selector: 'app-maintenance-requests',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Maintenance Requests" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Corrective and preventive work orders for building systems, furniture and equipment.">
      <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="18" />Create Work Order</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Open Work Orders" [value]="open().length" icon="w-wrench" color="var(--ka-2563eb)" [sub]="list().length + ' this month'" />
      <app-wkpi label="Preventive Due" [value]="ppmDue()" icon="w-calendar" color="var(--ka-7c3aed)" sub="this week" />
      <app-wkpi label="Overdue" [value]="overdue()" icon="w-timer" color="var(--ka-ef3b4f)" sub="past SLA" />
      <app-wkpi label="MTTR" value="6.4 hrs" icon="clock" color="var(--ka-16c26b)" strong="9%" arrow="down" sub="vs. last month" />
      <app-wkpi label="Cost MTD" [value]="'AED ' + (cost() / 1000).toFixed(1) + 'K'" icon="w-bars" color="var(--ka-f5a524)" sub="labour + parts" />
    </section>
    <div class="card">
      <div class="ch"><h3>Work Order Board</h3>
        <div class="tools"><div class="seg">@for (t of types; track t) {<button [class.on]="type() === t" (click)="type.set(t)">{{ t }}</button>}</div>
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search WO, asset…" [value]="q()" (input)="q.set($any($event.target).value)" /></label></div></div>
      <div class="board">
        @for (st of stages; track st) {
          <div class="lane">
            <div class="lh"><b>{{ st }}</b><em>{{ byStage(st).length }}</em></div>
            @for (w of byStage(st); track w.id) {
              <button class="wo" [class.crit]="w.priority === 'Critical'" (click)="selId.set(w.id)">
                <div class="wo-h"><small>{{ w.id }}</small><span [class]="prioTag(w.priority)">{{ w.priority }}</span></div>
                <b>{{ w.title }}</b><small class="muted">{{ w.asset ?? w.location }}</small>
                <div class="wo-f"><span class="tag grey">{{ w.woType ?? 'Corrective' }}</span><span class="who"><span class="dt-av sm" [style.background]="av(w.assignee)">{{ ini(w.assignee) }}</span>{{ w.assignee.split(' ')[0] }}</span></div>
                @if (st !== 'Resolved') {<span class="mv" (click)="$event.stopPropagation(); advance(w)">Move to {{ next(st) }} →</span>}
              </button>
            } @empty {<p class="empty">—</p>}
          </div>
        }
      </div>
    </div>
    <section class="wl even" style="margin-top:12px">
      <div class="card">
        <div class="ch"><h3>Preventive Maintenance Schedule</h3><span class="muted sm">next 7 days</span></div>
        <table class="table">
          <thead><tr><th>Date</th><th>Task</th><th>Asset</th><th>Vendor</th><th></th></tr></thead>
          <tbody>@for (p of ppm(); track p.task) {<tr><td>{{ p.date }}</td><td><b>{{ p.task }}</b></td><td>{{ p.asset }}</td><td>{{ p.vendor }}</td><td>@if (p.raised) {<span class="tag green">WO raised</span>} @else {<button class="btn-ghost sm" (click)="raisePpm(p.task)">Raise WO</button>}</td></tr>}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="ch"><h3>Cost by Category</h3><span class="muted sm">month to date</span></div>
        <app-donut [segments]="costSegs()" center="AED" [value]="(cost() / 1000).toFixed(1) + 'K'" [size]="140" />
      </div>
    </section>

    @if (sel(); as w) {
      <div class="g-overlay" (click)="selId.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div><small class="muted">{{ w.id }} · {{ w.woType }}</small><h3>{{ w.title }}</h3></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
        <div class="acts" style="margin-bottom:12px"><span [class]="prioTag(w.priority)">{{ w.priority }}</span><span [class]="reqTag(w.status)">{{ w.status }}</span><span [class]="slaTag(sla(w))">SLA {{ sla(w) }}</span></div>
        <dl class="facts"><dt>Asset</dt><dd>{{ w.asset }}</dd><dt>Site</dt><dd>{{ w.site }}</dd><dt>Technician</dt><dd>{{ w.assignee }}</dd><dt>Raised by</dt><dd>{{ w.requester }}</dd><dt>Raised</dt><dd>{{ round(w.createdH) }} hrs ago</dd><dt>Est. cost</dt><dd>AED {{ (w.cost ?? 0).toLocaleString() }}</dd></dl>
        <div class="form-grid" style="margin-top:14px">
          <label>Status<select class="select" [value]="w.status" (change)="setStatus(w, $any($event.target).value)">@for (s of allStatuses; track s) {<option>{{ s }}</option>}</select></label>
          <label>Technician<select class="select" [value]="w.assignee" (change)="store.patchRequest(w.id, { assignee: $any($event.target).value }, 'Reassigned to ' + $any($event.target).value)">@for (t of techs; track t) {<option>{{ t }}</option>}</select></label>
          <label>Cost (AED)<input class="input" type="number" [value]="w.cost ?? 0" (change)="store.patchRequest(w.id, { cost: +$any($event.target).value }, 'Cost updated')" /></label>
        </div>
        <h4 style="margin-top:14px">Activity</h4>
        <ul class="timeline">@for (n of w.notes; track $index) {<li><b>{{ n.by }}</b> · {{ n.text }}<small>{{ n.at }}</small></li>}</ul>
      </aside>
    }
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Create Work Order</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Title *<input class="input" [value]="f.title" (input)="form.set({ ...f, title: $any($event.target).value })" placeholder="e.g. Replace AHU-03 belt" /></label>
          <label>Type<select class="select" [value]="f.woType" (change)="form.set({ ...f, woType: $any($event.target).value })"><option>Corrective</option><option>Preventive</option><option>Inspection</option></select></label>
          <label>Priority<select class="select" [value]="f.priority" (change)="form.set({ ...f, priority: $any($event.target).value })"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label>Asset / location<input class="input" [value]="f.asset" (input)="form.set({ ...f, asset: $any($event.target).value })" /></label>
          <label>Technician<select class="select" [value]="f.tech" (change)="form.set({ ...f, tech: $any($event.target).value })">@for (t of techs; track t) {<option>{{ t }}</option>}</select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Create</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .board { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .lane { background: var(--kb-f7f7fb); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
    .lh { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; font-size: 12.5px; } .lh em { font-style: normal; font-size: 11px; background: var(--kb-ffffff); border-radius: 10px; padding: 0 7px; border: 1px solid var(--border); }
    .wo { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; font: inherit; color: inherit; }
    .wo:hover { border-color: var(--kl-c4b5fd); } .wo.crit { border-left: 3px solid var(--kl-ef4444); }
    .wo-h { display: flex; justify-content: space-between; align-items: center; } .wo-h small { font-size: 10.5px; color: var(--muted); } .wo b { font-size: 12.5px; line-height: 1.3; } .wo small.muted { font-size: 11px; }
    .wo-f { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; } .who { display: flex; align-items: center; gap: 5px; font-size: 11px; }
    .dt-av.sm { width: 20px; height: 20px; font-size: 9px; }
    .mv { margin-top: 4px; font-size: 11px; color: var(--primary); font-weight: 600; } .mv:hover { text-decoration: underline; }
    .search-box input { width: 170px; }
    @media (max-width: 1300px) { .board { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `],
})
export class MaintenanceRequests {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = PARENT;
  protected readonly prioTag = prioTag;
  protected readonly reqTag = reqTag;
  protected readonly slaTag = slaTag;
  protected readonly sla = slaState;
  protected readonly round = Math.round;
  protected readonly av = avColor;
  protected readonly ini = initials;
  protected readonly stages = STAGES;
  protected readonly allStatuses: ReqStatus[] = [...STAGES, 'Closed'];
  protected readonly types = ['All', 'Corrective', 'Preventive', 'Inspection'];
  protected readonly techs = ['Ahmed (MEP)', 'Joseph (HVAC)', 'Ravi (Electrical)', 'Otis Service', 'Carlos (Civil)', 'IT Service Desk'];
  protected readonly ts = toast();
  protected readonly type = signal('All');
  protected readonly q = signal('');
  protected readonly selId = signal<string | null>(null);
  protected readonly err = signal('');
  protected readonly form = signal<{ title: string; woType: 'Corrective' | 'Preventive' | 'Inspection'; priority: Priority; asset: string; tech: string } | null>(null);
  protected readonly ppm = signal([
    { date: '15 Oct 2026', task: 'Fire alarm panel test', asset: 'FACP · Ground', vendor: 'Siemens', raised: false },
    { date: '16 Oct 2026', task: 'Lift 1 & 2 monthly service', asset: 'Lifts Core A', vendor: 'Otis', raised: false },
    { date: '17 Oct 2026', task: 'AHU-03 belt & filter change', asset: 'AHU-03 · Floor 3', vendor: 'In-house MEP', raised: false },
    { date: '19 Oct 2026', task: 'Water tank cleaning', asset: 'Roof tanks', vendor: 'AquaClean', raised: false },
    { date: '20 Oct 2026', task: 'UPS battery inspection', asset: 'UPS-2 · B1', vendor: 'Schneider', raised: false },
  ]);

  protected readonly list = computed(() => this.store.requests().filter((r) => r.kind === 'Maintenance'));
  protected readonly filtered = computed(() => this.list().filter((w) => (this.type() === 'All' || w.woType === this.type()) && (w.title + w.id + (w.asset ?? '')).toLowerCase().includes(this.q().toLowerCase())));
  protected readonly open = computed(() => this.list().filter((w) => w.status !== 'Resolved' && w.status !== 'Closed'));
  protected readonly ppmDue = computed(() => this.open().filter((w) => w.woType === 'Preventive').length + this.ppm().filter((p) => !p.raised).length);
  protected readonly overdue = computed(() => this.open().filter((w) => slaState(w) === 'Breached').length);
  protected readonly cost = computed(() => this.list().reduce((a, w) => a + (w.cost ?? 0), 0));
  protected readonly sel = computed(() => this.list().find((w) => w.id === this.selId()) ?? null);
  protected readonly costSegs = computed(() => {
    const colors = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)'];
    const cats = [...new Set(this.list().map((w) => w.category))];
    return cats.map((c, i) => ({ label: c, value: this.list().filter((w) => w.category === c).reduce((a, w) => a + (w.cost ?? 0), 0), color: colors[i % 5] }));
  });
  protected byStage(s: ReqStatus) {
    return this.filtered().filter((w) => w.status === s || (s === 'Resolved' && w.status === 'Closed'));
  }
  protected next(s: ReqStatus) {
    return STAGES[Math.min(STAGES.indexOf(s) + 1, STAGES.length - 1)];
  }
  protected advance(w: Request) {
    const n = w.status === 'On Hold' ? 'In Progress' : this.next(w.status);
    this.store.patchRequest(w.id, { status: n }, `Moved to ${n}`);
    this.ts.show(`${w.id} → ${n}`);
  }
  protected setStatus(w: Request, s: ReqStatus) {
    this.store.patchRequest(w.id, { status: s }, `Status changed to ${s}`);
  }
  protected raisePpm(task: string) {
    const p = this.ppm().find((x) => x.task === task)!;
    this.ppm.update((l) => l.map((x) => (x.task === task ? { ...x, raised: true } : x)));
    const w = this.store.addRequest({ title: p.task, category: 'HVAC', priority: 'Medium', kind: 'Maintenance', woType: 'Preventive', asset: p.asset, location: p.asset, assignee: p.vendor, status: 'Assigned', slaH: 72, cost: 800 });
    this.ts.show(`${w.id} raised for ${p.vendor}`);
  }
  protected openNew() {
    this.err.set('');
    this.form.set({ title: '', woType: 'Corrective', priority: 'High', asset: 'Head Office - Floor 5', tech: this.techs[0] });
  }
  protected save() {
    const f = this.form()!;
    if (!f.title.trim()) return this.err.set('Please enter a title.');
    const w = this.store.addRequest({ title: f.title, category: 'HVAC', priority: f.priority, kind: 'Maintenance', woType: f.woType, asset: f.asset, location: f.asset, assignee: f.tech, status: 'Assigned', cost: 0 });
    this.form.set(null);
    this.ts.show(`${w.id} created · assigned to ${f.tech}`);
  }
  protected exportCsv() {
    downloadCsv('work-orders.csv', [['ID', 'Title', 'Type', 'Asset', 'Site', 'Priority', 'Status', 'Technician', 'Cost AED', 'SLA'], ...this.list().map((w) => [w.id, w.title, w.woType ?? '', w.asset ?? '', w.site, w.priority, w.status, w.assignee, w.cost ?? 0, slaState(w)])]);
  }
}

/* =====================================================================
   Service Catalog — browse services, request with approval routing
   ===================================================================== */
@Component({
  selector: 'app-service-catalog',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Service Catalog" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Request workplace services — catering, setups, moves, lockers, mail, parking passes and more.">
      <label class="search-box big"><app-icon name="search" [size]="16" /><input placeholder="Search services…" [value]="q()" (input)="q.set($any($event.target).value)" /></label>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Services Available" [value]="services.length" icon="w-catalog" color="var(--ka-2563eb)" [sub]="cats.length - 1 + ' categories'" />
      <app-wkpi label="My Open Requests" [value]="myOpen().length" icon="message" color="var(--ka-7c3aed)" sub="in progress" />
      <app-wkpi label="Awaiting Approval" [value]="myPending()" icon="file-check" color="var(--ka-f5a524)" sub="from your manager" />
      <app-wkpi label="Avg Fulfilment" value="9.6 hrs" icon="w-timer" color="var(--ka-16c26b)" strong="14%" arrow="down" sub="faster vs. Q3" />
      <app-wkpi label="Service Rating" value="4.5 / 5" icon="star" color="var(--ka-ef3b4f)" sub="1,585 requests rated" />
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch"><div class="seg">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div><span class="muted sm">{{ shown().length }} services</span></div>
        <div class="grid">
          @for (s of shown(); track s.id) {
            <div class="sc">
              <div class="sc-h"><span class="ic" [style.background]="s.color"><app-icon [name]="s.icon" [size]="20" /></span>@if (s.popular) {<span class="tag amber">Popular</span>}</div>
              <b>{{ s.name }}</b><p>{{ s.desc }}</p>
              <div class="sc-m"><span><app-icon name="w-timer" [size]="12" />{{ s.slaH }}h SLA</span><span><app-icon name="star" [size]="12" />{{ s.rating }}</span>@if (s.approval) {<span><app-icon name="file-check" [size]="12" />Approval</span>}</div>
              <button class="btn-outline" (click)="openReq(s)">Request</button>
            </div>
          } @empty {<p class="empty">No services match “{{ q() }}”.</p>}
        </div>
      </div>
      <div class="col">
        <div class="card">
          <div class="ch"><h3>My Service Requests</h3><button class="link" (click)="go('facility-requests')">View All</button></div>
          <div class="rows">
            @for (r of mine().slice(0, 6); track r.id) {
              <div class="row"><span class="ic soft" style="--c:var(--ka-7c3aed)"><app-icon name="message" [size]="15" /></span><span class="nm"><b>{{ r.title }}</b><small>{{ r.id }} · {{ r.assignee }}</small></span><span [class]="r.approval === 'Pending' ? 'tag amber' : reqTag(r.status)">{{ r.approval === 'Pending' ? 'Awaiting approval' : r.status }}</span></div>
            } @empty {<p class="empty">You have not requested any services yet.</p>}
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Most Requested</h3><span class="muted sm">this quarter</span></div>
          <app-bar-list [rows]="top()" [max]="topMax" />
        </div>
      </div>
    </section>
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); submit()">
        <div class="modal-head"><div class="mh"><span class="ic" [style.background]="f.s.color"><app-icon [name]="f.s.icon" [size]="18" /></span><div><h3>{{ f.s.name }}</h3><small class="muted">{{ f.s.team }} · {{ f.s.slaH }}h SLA{{ f.s.approval ? ' · manager approval' : '' }}</small></div></div><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Details *<textarea class="input" rows="3" [value]="f.details" (input)="form.set({ ...f, details: $any($event.target).value })" placeholder="What do you need?"></textarea></label>
          <label>Location<select class="select" [value]="f.loc" (change)="form.set({ ...f, loc: $any($event.target).value })"><option>Head Office - Floor 5</option><option>Head Office - Floor 8</option><option>Tech Park - Floor 1</option><option>Downtown Hub - Floor 1</option></select></label>
          <label>Needed by<input class="input" type="date" [value]="f.date" min="2026-10-14" (change)="form.set({ ...f, date: $any($event.target).value })" /></label>
          <label>Priority<select class="select" [value]="f.priority" (change)="form.set({ ...f, priority: $any($event.target).value })"><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label>Cost centre<select class="select"><option>CC-1020 Operations</option><option>CC-2040 Sales</option><option>CC-3010 Technology</option></select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Submit Request</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .search-box.big { padding: 9px 12px; } .search-box.big input { width: 260px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
    .sc { display: flex; flex-direction: column; gap: 6px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); }
    .sc:hover { border-color: var(--kl-c4b5fd); box-shadow: 0 4px 14px rgba(124,58,237,.08); }
    .sc-h { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; } .sc b { font-size: 13.5px; } .sc p { margin: 0; font-size: 12px; color: var(--kf-52525b); line-height: 1.45; flex: 1; }
    .sc-m { display: flex; gap: 10px; font-size: 11px; color: var(--kf-52525b); margin: 4px 0; } .sc-m span { display: inline-flex; gap: 4px; align-items: center; }
    .sc .btn-outline { justify-content: center; }
    .mh { display: flex; gap: 10px; align-items: center; } .mh h3 { margin: 0; }
    textarea.input { resize: vertical; font: inherit; font-size: 12.5px; }
  `],
})
export class ServiceCatalog {
  protected readonly store = inject(WorkplaceStore);
  private readonly router = inject(Router);
  protected readonly parent = PARENT;
  protected readonly reqTag = reqTag;
  protected readonly services = SERVICES;
  protected readonly cats = ['All', ...new Set(SERVICES.map((s) => s.category))];
  protected readonly ts = toast();
  protected readonly cat = signal('All');
  protected readonly q = signal('');
  protected readonly err = signal('');
  protected readonly form = signal<{ s: Service; details: string; loc: string; date: string; priority: Priority } | null>(null);
  protected readonly shown = computed(() => SERVICES.filter((s) => (this.cat() === 'All' || s.category === this.cat()) && (s.name + s.desc + s.category).toLowerCase().includes(this.q().toLowerCase())));
  protected readonly mine = computed(() => this.store.requests().filter((r) => r.requester === ME && r.kind === 'Service'));
  protected readonly myOpen = computed(() => this.mine().filter((r) => r.status !== 'Resolved' && r.status !== 'Closed'));
  protected readonly myPending = computed(() => this.mine().filter((r) => r.approval === 'Pending').length);
  protected readonly topMax = Math.max(...SERVICES.map((s) => s.requests));
  protected readonly top = computed(() => [...SERVICES].sort((a, b) => b.requests - a.requests).slice(0, 6).map((s) => ({ label: s.name, value: s.requests + this.mine().filter((r) => r.title.startsWith(s.name)).length, color: s.color })));

  protected openReq(s: Service) {
    this.err.set('');
    this.form.set({ s, details: '', loc: 'Head Office - Floor 5', date: TODAY, priority: 'Medium' });
  }
  protected submit() {
    const f = this.form()!;
    if (!f.details.trim()) return this.err.set('Please add some details.');
    const r = this.store.addRequest({ title: `${f.s.name}: ${f.details.trim()}`, category: f.s.category, priority: f.priority, kind: 'Service', site: f.loc.split(' - ')[0], location: f.loc, assignee: f.s.team, status: f.s.approval ? 'Open' : 'Assigned', slaH: f.s.slaH, approval: f.s.approval ? 'Pending' : undefined });
    this.form.set(null);
    this.ts.show(f.s.approval ? `${r.id} submitted · waiting for manager approval` : `${r.id} submitted · ${f.s.team} notified`);
  }
  protected go(p: string) {
    this.router.navigateByUrl(`/workplace-facility-services/${p}`);
  }
}

/* =====================================================================
   Approvals & SLA — approval queue (bookings + requests), SLA performance
   ===================================================================== */
interface ApprovalItem { id: string; src: 'booking' | 'request'; type: string; icon: string; color: string; title: string; who: string; detail: string; when: string }
@Component({
  selector: 'app-approvals-sla',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Approvals & SLA" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Approve bookings and service requests, and keep facility SLAs on track.">
      <button class="btn-primary hb" [disabled]="!queue().length" (click)="approveAll()"><app-icon name="w-check-circle" [size]="17" />Approve All ({{ queue().length }})</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Pending Approvals" [value]="queue().length" icon="file-check" color="var(--ka-f5a524)" [sub]="bookingsQ() + ' bookings | ' + (queue().length - bookingsQ()) + ' requests'" />
      <app-wkpi label="Approved Today" [value]="approved()" icon="w-check-circle" color="var(--ka-16c26b)" [sub]="rejected() + ' rejected'" />
      <app-wkpi label="SLA Compliance" [value]="compliance() + '%'" icon="shield-check" color="var(--ka-7c3aed)" strong="3%" arrow="up" sub="vs. last month" />
      <app-wkpi label="SLA Breached" [value]="breached().length" icon="w-timer" color="var(--ka-ef3b4f)" sub="open & overdue" />
      <app-wkpi label="At Risk" [value]="atRisk().length" icon="triangle-alert" color="var(--ka-2563eb)" sub="over 75% of SLA used" />
    </section>
    <section class="wl">
      <div class="card">
        <div class="ch"><h3>Approval Queue</h3><div class="seg">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</div></div>
        <div class="rows">
          @for (a of shownQ(); track a.id) {
            <div class="aq">
              <span class="ic" [style.background]="a.color"><app-icon [name]="a.icon" [size]="17" /></span>
              <span class="nm"><b>{{ a.title }}</b><small>{{ a.type }} · {{ a.detail }}</small></span>
              <span class="who"><span class="dt-av" [style.background]="av(a.who)">{{ ini(a.who) }}</span><span class="nm"><b>{{ a.who }}</b><small>{{ a.when }}</small></span></span>
              <span class="acts"><button class="btn-primary btn-sm" (click)="decide(a, true)">Approve</button><button class="btn-ghost sm danger" (click)="decide(a, false)">Reject</button></span>
            </div>
          } @empty {<p class="empty">All caught up — nothing waiting for approval.</p>}
        </div>
        @if (log().length) {
          <h4 style="margin-top:14px">Recent decisions</h4>
          <ul class="timeline">@for (l of log().slice(0, 5); track $index) {<li>{{ l }}<small>just now · {{ me }}</small></li>}</ul>
        }
      </div>
      <div class="col">
        <div class="card">
          <div class="ch"><h3>SLA by Priority</h3></div>
          <table class="table">
            <thead><tr><th>Priority</th><th class="num">Target</th><th class="num">Open</th><th class="num">Met</th><th>Compliance</th></tr></thead>
            <tbody>@for (p of byPrio(); track p.p) {<tr><td><span [class]="prioTag(p.p)">{{ p.p }}</span></td><td class="num">{{ p.target }}h</td><td class="num">{{ p.open }}</td><td class="num">{{ p.met }}</td><td><span class="cmp"><span class="bar"><i [style.width.%]="p.pct" [style.background]="p.pct >= 85 ? 'var(--ka-22c55e)' : p.pct >= 70 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'"></i></span>{{ p.pct }}%</span></td></tr>}</tbody>
          </table>
        </div>
        <div class="card">
          <div class="ch"><h3>SLA Compliance Trend</h3></div>
          <app-line-chart [labels]="months" [series]="trend" [height]="180" suffix="%" [min]="60" [max]="100" />
        </div>
      </div>
    </section>
    <div class="card">
      <div class="ch"><h3>Breached & At-Risk Requests</h3><span class="muted sm">sorted by SLA used</span></div>
      <table class="table">
        <thead><tr><th>ID</th><th>Request</th><th>Priority</th><th>Assigned To</th><th>SLA used</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (q of risky(); track q.id) {
            <tr><td>{{ q.id }}</td><td><b>{{ q.title }}</b><div class="muted">{{ q.location }}</div></td><td><span [class]="prioTag(q.priority)">{{ q.priority }}</span></td><td>{{ q.assignee }}</td>
              <td><span class="cmp"><span class="bar"><i [style.width.%]="min(100, (q.createdH / q.slaH) * 100)" [style.background]="sla(q) === 'Breached' ? 'var(--ka-ef4444)' : 'var(--ka-f59e0b)'"></i></span>{{ round((q.createdH / q.slaH) * 100) }}%</span></td>
              <td><span [class]="slaTag(sla(q))">{{ sla(q) }}</span></td>
              <td><button class="btn-ghost sm" (click)="escalate(q)">{{ q.notes[0]?.text?.startsWith('Escalated') ? 'Escalated ✓' : 'Escalate' }}</button></td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .aq { display: grid; grid-template-columns: 34px minmax(0, 1.6fr) minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .aq .nm { display: flex; flex-direction: column; min-width: 0; } .aq .nm b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .aq .nm small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who { display: flex; gap: 8px; align-items: center; min-width: 0; }
    .cmp { display: grid; grid-template-columns: 1fr 38px; gap: 8px; align-items: center; min-width: 110px; font-size: 12px; }
  `],
})
export class ApprovalsSla {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = PARENT;
  protected readonly me = ME;
  protected readonly prioTag = prioTag;
  protected readonly slaTag = slaTag;
  protected readonly sla = slaState;
  protected readonly min = Math.min;
  protected readonly round = Math.round;
  protected readonly av = avColor;
  protected readonly ini = initials;
  protected readonly ts = toast();
  protected readonly tabs = ['All', 'Bookings', 'Requests'];
  protected readonly tab = signal('All');
  protected readonly approved = signal(14);
  protected readonly rejected = signal(2);
  protected readonly log = signal<string[]>([]);
  protected readonly months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  protected readonly trend = [{ name: 'SLA compliance', color: 'var(--ka-7c3aed)', values: [81, 84, 83, 86, 88, 91], area: true }, { name: 'Target', color: 'var(--ka-ef4444)', values: [90, 90, 90, 90, 90, 90], dashed: true }];

  protected readonly queue = computed<ApprovalItem[]>(() => [
    ...this.store.bookings().filter((b) => b.status === 'Pending').sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ id: b.id, src: 'booking' as const, type: b.kind === 'Asset' ? 'Equipment booking' : `${b.kind} booking`, icon: BOOKING_ICON[b.kind].icon, color: BOOKING_ICON[b.kind].color, title: `${b.resource} · ${b.title ?? 'Reservation'}`, who: b.by, detail: `${fmtD(b.date)} · ${b.from} - ${b.to}${b.attendees ? ' · ' + b.attendees + ' people' : ''}`, when: 'Submitted today' })),
    ...this.store.requests().filter((q) => q.approval === 'Pending').map((q) => ({ id: q.id, src: 'request' as const, type: q.kind === 'Service' ? 'Service request' : 'Facility request', icon: 'message', color: 'var(--ka-7c3aed)', title: q.title, who: q.requester, detail: `${q.location}${q.cost ? ' · AED ' + q.cost.toLocaleString() : ''}`, when: q.createdH < 1 ? 'Just now' : `${Math.round(q.createdH)} hrs ago` })),
  ]);
  protected readonly bookingsQ = computed(() => this.queue().filter((a) => a.src === 'booking').length);
  protected readonly shownQ = computed(() => this.queue().filter((a) => this.tab() === 'All' || (this.tab() === 'Bookings' ? a.src === 'booking' : a.src === 'request')));
  protected readonly all = computed(() => this.store.requests());
  protected readonly openQ = computed(() => this.all().filter((q) => q.status !== 'Resolved' && q.status !== 'Closed'));
  protected readonly breached = computed(() => this.openQ().filter((q) => slaState(q) === 'Breached'));
  protected readonly atRisk = computed(() => this.openQ().filter((q) => slaState(q) === 'At Risk'));
  protected readonly compliance = computed(() => {
    const l = this.all();
    return Math.round((l.filter((q) => slaState(q) !== 'Breached').length / l.length) * 100);
  });
  protected readonly risky = computed(() => [...this.breached(), ...this.atRisk()].sort((a, b) => b.createdH / b.slaH - a.createdH / a.slaH).slice(0, 10));
  protected readonly byPrio = computed(() => (['Critical', 'High', 'Medium', 'Low'] as Priority[]).map((p) => {
    const l = this.all().filter((q) => q.priority === p);
    const met = l.filter((q) => slaState(q) !== 'Breached').length;
    return { p, target: SLA_HOURS[p], open: l.filter((q) => q.status !== 'Resolved' && q.status !== 'Closed').length, met, pct: Math.round((met / (l.length || 1)) * 100) };
  }));

  protected decide(a: ApprovalItem, ok: boolean) {
    if (a.src === 'booking') this.store.updateBooking(a.id, { status: ok ? 'Confirmed' : 'Rejected' });
    else this.store.patchRequest(a.id, { approval: ok ? 'Approved' : 'Rejected', status: ok ? 'Assigned' : 'Closed' }, ok ? 'Approved by ' + ME : 'Rejected by ' + ME);
    (ok ? this.approved : this.rejected).update((n) => n + 1);
    this.log.update((l) => [`${ok ? 'Approved' : 'Rejected'} ${a.title}`, ...l]);
    this.ts.show(`${a.title} ${ok ? 'approved' : 'rejected'} · ${a.who} notified`);
  }
  protected approveAll() {
    const l = this.shownQ();
    l.forEach((a) => this.decide(a, true));
    this.ts.show(`${l.length} items approved`);
  }
  protected escalate(q: Request) {
    this.store.patchRequest(q.id, {}, 'Escalated to Facility Manager');
    this.ts.show(`${q.id} escalated to Facility Manager`);
  }
}

/* =====================================================================
   Reports & Analytics — report library, previews, exports, schedules
   ===================================================================== */
interface Report { id: string; name: string; desc: string; icon: string; color: string; cat: string; rows: () => (string | number)[][] }
@Component({
  selector: 'app-reports-analytics',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Analytics" [parent]="parent" parentLink="/workplace-facility-services" subtitle="Workplace reports on bookings, utilization, requests, SLAs and costs — preview, export or schedule.">
      <select class="select" [value]="period()" (change)="period.set($any($event.target).value)"><option>October 2026</option><option>September 2026</option><option>Q3 2026</option></select>
      <button class="btn-primary hb" (click)="openSchedule(reports[0])"><app-icon name="w-calendar" [size]="16" />Schedule Report</button>
    </app-page-head>
    <section class="kpis">
      <app-wkpi label="Bookings" [value]="f(bookingsTotal())" icon="w-calendar" color="var(--ka-2563eb)" strong="11%" arrow="up" sub="vs. last month" />
      <app-wkpi label="Desk Utilization" value="76%" icon="w-desk" color="var(--ka-7c3aed)" strong="8%" arrow="up" sub="vs. last month" />
      <app-wkpi label="Requests Resolved" [value]="resolved()" icon="w-check-circle" color="var(--ka-16c26b)" [sub]="'of ' + store.requests().length + ' raised'" />
      <app-wkpi label="Facility Cost" value="AED 184K" icon="w-bars" color="var(--ka-f5a524)" strong="4%" arrow="down" strongColor="var(--ka-16a34a)" sub="vs. budget" />
      <app-wkpi label="Scheduled Reports" [value]="schedules().length" icon="file-chart" color="var(--ka-ef3b4f)" [sub]="activeSchedules() + ' active'" />
    </section>
    <section class="wl even">
      <div class="card">
        <div class="ch"><h3>Bookings by Type</h3><span class="muted sm">last 6 months</span></div>
        <app-column-chart [labels]="months" [series]="bookingSeries" [stacked]="true" [height]="230" />
      </div>
      <div class="card">
        <div class="ch"><h3>Requests by Category</h3><span class="muted sm">{{ period() }}</span></div>
        <app-bar-list [rows]="reqCats()" [max]="maxCat()" />
      </div>
    </section>
    <div class="card">
      <div class="ch"><h3>Report Library</h3><div class="seg">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div></div>
      <div class="lib">
        @for (r of shownReports(); track r.id) {
          <div class="rp">
            <span class="ic" [style.background]="r.color"><app-icon [name]="r.icon" [size]="19" /></span>
            <div class="nm"><b>{{ r.name }}</b><small>{{ r.desc }}</small></div>
            <div class="acts"><button class="btn-ghost sm" (click)="preview.set(r)"><app-icon name="eye" [size]="14" />Preview</button><button class="btn-ghost sm" (click)="download(r)"><app-icon name="download" [size]="14" />CSV</button><button class="btn-ghost sm" (click)="openSchedule(r)"><app-icon name="w-calendar" [size]="14" />Schedule</button></div>
          </div>
        }
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="ch"><h3>Scheduled Reports</h3></div>
      <table class="table">
        <thead><tr><th>Report</th><th>Frequency</th><th>Recipients</th><th>Next run</th><th>Format</th><th>Active</th><th></th></tr></thead>
        <tbody>
          @for (s of schedules(); track s.id) {
            <tr><td><b>{{ s.name }}</b></td><td>{{ s.freq }}</td><td>{{ s.to }}</td><td>{{ s.next }}</td><td>{{ s.fmt }}</td>
              <td><button class="tg" [class.on]="s.active" (click)="toggle(s.id)" [attr.aria-label]="'Toggle ' + s.name"><i></i></button></td>
              <td><button class="btn-ghost sm danger" (click)="remove(s.id)">Remove</button></td></tr>
          } @empty {<tr><td colspan="7" class="empty">No scheduled reports.</td></tr>}
        </tbody>
      </table>
    </div>

    @if (preview(); as r) {
      <div class="g-overlay" (click)="preview.set(null)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>{{ r.name }} · {{ period() }}</h3><button class="close-btn" (click)="preview.set(null)">×</button></div>
        @let data = r.rows();
        <div class="table-wrap" style="max-height:60vh">
          <table class="table"><thead><tr>@for (h of data[0]; track $index) {<th>{{ h }}</th>}</tr></thead>
            <tbody>@for (row of data.slice(1, 16); track $index) {<tr>@for (c of row; track $index) {<td>{{ c }}</td>}</tr>}</tbody></table>
        </div>
        <p class="muted sm">Showing {{ min(15, data.length - 1) }} of {{ data.length - 1 }} rows</p>
        <div class="form-actions"><button class="btn-ghost" (click)="preview.set(null)">Close</button><button class="btn-primary" (click)="download(r)"><app-icon name="download" [size]="15" />Download CSV</button></div>
      </div>
    }
    @if (sched(); as s) {
      <div class="g-overlay" (click)="sched.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule Report</h3><button type="button" class="close-btn" (click)="sched.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report<select class="select" [value]="s.name" (change)="sched.set({ ...s, name: $any($event.target).value })">@for (r of reports; track r.id) {<option>{{ r.name }}</option>}</select></label>
          <label>Frequency<select class="select" [value]="s.freq" (change)="sched.set({ ...s, freq: $any($event.target).value })"><option>Daily 08:00</option><option>Weekly · Monday</option><option>Monthly · 1st</option></select></label>
          <label>Format<select class="select" [value]="s.fmt" (change)="sched.set({ ...s, fmt: $any($event.target).value })"><option>CSV</option><option>PDF</option><option>Excel</option></select></label>
          <label class="full">Recipients *<input class="input" [value]="s.to" (input)="sched.set({ ...s, to: $any($event.target).value })" placeholder="name@company.com, …" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sched.set(null)">Cancel</button><button class="btn-primary">Save Schedule</button></div>
      </form>
    }
    @if (ts.t()) {<div class="g-toast">{{ ts.t() }}</div>}
  `,
  styles: [WP_CSS, `
    .lib { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .rp { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
    .rp .nm { display: flex; flex-direction: column; min-width: 0; } .rp .nm b { font-size: 13px; } .rp .nm small { font-size: 11.5px; color: var(--muted); }
    .rp .acts .btn-ghost { gap: 4px; }
    .tg { width: 36px; height: 20px; border-radius: 10px; border: 0; background: var(--kb-d4d4d8); position: relative; cursor: pointer; } .tg i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); transition: left .15s; }
    .tg.on { background: var(--primary); } .tg.on i { left: 18px; }
    @media (max-width: 1300px) { .lib { grid-template-columns: 1fr; } }
  `],
})
export class WorkplaceReports {
  protected readonly store = inject(WorkplaceStore);
  protected readonly parent = PARENT;
  protected readonly min = Math.min;
  protected readonly f = (n: number) => n.toLocaleString('en-US');
  protected readonly ts = toast();
  protected readonly period = signal('October 2026');
  protected readonly cat = signal('All');
  protected readonly cats = ['All', 'Bookings', 'Space', 'Services', 'Cost'];
  protected readonly months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  protected readonly bookingSeries = [
    { name: 'Desks', color: 'var(--ka-7c3aed)', values: [3120, 3310, 2980, 3405, 3720, 3890] },
    { name: 'Meeting rooms', color: 'var(--ka-3b82f6)', values: [1240, 1310, 1190, 1350, 1420, 1505] },
    { name: 'Parking', color: 'var(--ka-22c55e)', values: [2100, 2180, 2060, 2240, 2310, 2390] },
    { name: 'Equipment', color: 'var(--ka-f59e0b)', values: [310, 290, 260, 330, 360, 384] },
  ];
  protected readonly preview = signal<Report | null>(null);
  protected readonly sched = signal<{ name: string; freq: string; fmt: string; to: string } | null>(null);
  protected readonly schedules = signal([
    { id: 1, name: 'Desk Utilization Report', freq: 'Weekly · Monday', to: 'workplace-team@people360.io', next: '19 Oct 2026', fmt: 'PDF', active: true },
    { id: 2, name: 'Facility Requests & SLA', freq: 'Daily 08:00', to: 'fm-leads@people360.io', next: '15 Oct 2026', fmt: 'Excel', active: true },
    { id: 3, name: 'Maintenance Cost Summary', freq: 'Monthly · 1st', to: 'finance@people360.io', next: '01 Nov 2026', fmt: 'CSV', active: false },
  ]);
  protected readonly bookingsTotal = computed(() => 8164 + this.store.bookings().filter((b) => b.by === ME).length);
  protected readonly resolved = computed(() => this.store.requests().filter((q) => q.status === 'Resolved' || q.status === 'Closed').length);
  protected readonly activeSchedules = computed(() => this.schedules().filter((s) => s.active).length);
  protected readonly reqCats = computed(() => CATEGORIES.map((c, i) => ({ label: c, value: this.store.requests().filter((q) => q.category === c).length, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)'][i % 5] })).sort((a, b) => b.value - a.value).slice(0, 8));
  protected readonly maxCat = computed(() => Math.max(1, ...this.reqCats().map((r) => r.value)));

  protected readonly reports: Report[] = [
    { id: 'r1', cat: 'Bookings', name: 'Desk Booking Register', desc: 'Every desk booking with check-in and no-show status', icon: 'w-desk', color: 'var(--ka-7c3aed)', rows: () => [['Desk', 'Site', 'Floor', 'Type', 'Status', 'Occupant'], ...this.store.desks().map((d) => [d.name, d.site, d.floor, d.type, d.status, d.occupant ?? ''])] },
    { id: 'r2', cat: 'Bookings', name: 'Meeting Room Bookings', desc: 'Room bookings by date, organizer and attendance', icon: 'users', color: 'var(--ka-ef4444)', rows: () => [['ID', 'Room', 'Date', 'From', 'To', 'Title', 'Organizer', 'Status'], ...this.store.bookings().filter((b) => ROOMS.some((r) => r.id === b.resourceId)).map((b) => [b.id, b.resource, b.date, b.from, b.to, b.title ?? '', b.by, b.status])] },
    { id: 'r3', cat: 'Space', name: 'Desk Utilization Report', desc: 'Utilization by zone and floor vs. target', icon: 'w-bars', color: 'var(--ka-2563eb)', rows: () => [['Zone', 'Utilization %'], ...TOP_ZONES.map((z) => [z.label, z.value])] },
    { id: 'r4', cat: 'Space', name: 'Daily Occupancy Trend', desc: 'Occupancy and availability over the last 7 days', icon: 'chart-line', color: 'var(--ka-0891b2)', rows: () => [['Date', 'Occupancy %', 'Available %'], ...USAGE_7D.labels.map((l, i) => [l, USAGE_7D.occ[i], USAGE_7D.avail[i]])] },
    { id: 'r5', cat: 'Services', name: 'Facility Requests & SLA', desc: 'Requests by category, priority and SLA outcome', icon: 'message', color: 'var(--ka-16a34a)', rows: () => [['ID', 'Title', 'Category', 'Priority', 'Status', 'Assignee', 'SLA'], ...this.store.requests().filter((q) => q.kind !== 'Maintenance').map((q) => [q.id, q.title, q.category, q.priority, q.status, q.assignee, slaState(q)])] },
    { id: 'r6', cat: 'Services', name: 'Housekeeping Compliance', desc: 'Cleaning tasks completed vs. scheduled, by area', icon: 'w-broom', color: 'var(--ka-22c55e)', rows: () => [['ID', 'Time', 'Task', 'Area', 'Staff', 'Status'], ...this.store.cleaning().map((t) => [t.id, t.time, t.task, t.area, t.staff, t.status])] },
    { id: 'r7', cat: 'Cost', name: 'Maintenance Cost Summary', desc: 'Work-order cost by category, asset and vendor', icon: 'w-wrench', color: 'var(--ka-f59e0b)', rows: () => [['WO', 'Title', 'Asset', 'Technician', 'Status', 'Cost AED'], ...this.store.requests().filter((q) => q.kind === 'Maintenance').map((q) => [q.id, q.title, q.asset ?? '', q.assignee, q.status, q.cost ?? 0])] },
    { id: 'r8', cat: 'Bookings', name: 'Parking Occupancy', desc: 'Bay occupancy by site, level and bay type', icon: 'w-car', color: 'var(--ka-db2777)', rows: () => [['Bay', 'Site', 'Level', 'Type', 'Status', 'Plate'], ...this.store.bays().map((b) => [`${b.row}${b.n}`, b.site, b.level, b.type, b.status, b.plate ?? ''])] },
  ];
  protected readonly shownReports = computed(() => this.reports.filter((r) => this.cat() === 'All' || r.cat === this.cat()));

  protected download(r: Report) {
    downloadCsv(`${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, r.rows());
    this.ts.show(`${r.name} exported`);
  }
  protected openSchedule(r: Report) {
    this.sched.set({ name: r.name, freq: 'Weekly · Monday', fmt: 'PDF', to: '' });
  }
  protected saveSchedule() {
    const s = this.sched()!;
    if (!s.to.trim()) return;
    this.schedules.update((l) => [...l, { id: Date.now(), name: s.name, freq: s.freq, to: s.to, next: s.freq.startsWith('Daily') ? '15 Oct 2026' : s.freq.startsWith('Weekly') ? '19 Oct 2026' : '01 Nov 2026', fmt: s.fmt, active: true }]);
    this.sched.set(null);
    this.ts.show(`${s.name} scheduled · ${s.freq}`);
  }
  protected toggle(id: number) {
    this.schedules.update((l) => l.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  }
  protected remove(id: number) {
    this.schedules.update((l) => l.filter((s) => s.id !== id));
  }
}
