import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Col, DataTable, RowAction, statusTag } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import {
  CERTS, dayLabel, DEPTS, H_CATS, H_CAT_COLOR, H_CAT_ICON, Hazard, I_STATUSES, I_TYPES, Incident, Inspection, IStatus, LOCATIONS, MONTHLY, MONTHS, OFFICERS, PEOPLE, Permit,
  PermitStatus, riskLevel, riskScore, SafetyStore, SEVS, SITES, Talk, TEMPLATES, TRAINING, avatarColor, initials, sevTag, stCls, FLOORS,
} from './safety.data';
import { IncidentDrawer, ReportIncident, SF_STYLES, SfToast } from './safety-shared';

const PARENT = 'Workplace Safety &amp; Wellbeing';
const sevTagG = (s: string) => (s === 'Critical' || s === 'High' ? 'tag red' : s === 'Medium' ? 'tag amber' : 'tag green');

/* =====================================================================
   Incident Management
   ===================================================================== */
@Component({
  selector: 'app-incident-management',
  imports: [...UI, DataTable, ReportIncident, IncidentDrawer, SfToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Incident Management" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Report, triage, investigate and close safety incidents with full audit trail and root-cause analysis.">
      <button class="btn-red" (click)="store.reportOpen.set({})"><app-icon name="siren" [size]="16" />Report Incident</button>
      <div class="segs"><button [class.on]="view() === 'table'" (click)="view.set('table')">Register</button><button [class.on]="view() === 'board'" (click)="view.set('board')">Board</button></div>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
    </app-page-head>

    <section class="kpi-row kpi6">
      <app-kpi label="Incidents (30 days)" [value]="month().length" icon="siren" color="var(--ka-7c3aed)" change="5%" [up]="false" sub="vs. prior 30 days" />
      <app-kpi label="Active Incidents" [value]="store.active().length" icon="bell" color="var(--ka-ef4444)" sub="Needs response now" subColor="var(--ka-dc2626)" />
      <app-kpi label="Under Investigation" [value]="count('Under Investigation')" icon="search" color="var(--ka-f59e0b)" sub="RCA in progress" />
      <app-kpi label="Closed (30 days)" [value]="count('Closed')" icon="shield-check" color="var(--ka-22c55e)" [sub]="closedPct() + '% closure rate'" subColor="var(--ka-16a34a)" />
      <app-kpi label="Injuries" [value]="injuries()" icon="s-first-aid" color="var(--ka-3b82f6)" sub="1 lost-time injury" />
      <app-kpi label="Avg. Response Time" value="4.2 min" icon="clock" color="var(--ka-14b8a6)" change="12%" [up]="false" sub="vs. last month" />
    </section>

    <section class="grid3 mb">
      <div class="card"><div class="card-head"><h3>Incidents by Type</h3><span class="muted">30 days</span></div><app-bar-list [rows]="byType()" [max]="byTypeMax()" /></div>
      <div class="card"><div class="card-head"><h3>By Severity</h3></div><app-donut [segments]="bySev()" center="Incidents" [size]="130" /></div>
      <div class="card"><div class="card-head"><h3>Monthly Trend</h3></div><app-column-chart [labels]="months" [series]="monthly" [stacked]="true" [height]="190" /></div>
    </section>

    @if (view() === 'table') {
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['id', 'title', 'location', 'assignee', 'reportedBy']" searchPlaceholder="Search ID, title, location, person..."
          noun="incidents" [activeId]="store.openIncident()" (rowClick)="store.openIncident.set($event.id)" (action)="act($event.action, $event.row)" />
      </div>
    } @else {
      <div class="board">
        @for (s of statuses; track s) {
          <div class="lane">
            <div class="lh"><span [class]="stCls(s)">{{ s }}</span><b>{{ lane(s).length }}</b></div>
            @for (i of lane(s); track i.id) {
              <div class="ic" (click)="store.openIncident.set(i.id)">
                <div class="ih"><app-icon [name]="meta(i.type).icon" [size]="15" [style.color]="meta(i.type).color" /><b>{{ i.type }}</b><span [class]="sevTag(i.severity)">{{ i.severity }}</span></div>
                <small>{{ i.id }} · {{ i.location }}</small>
                <small class="muted">{{ i.daysAgo ? dayLabel(i.daysAgo) : 'Today' }} {{ i.time }} · {{ i.assignee }}</small>
                @if (next(s); as n) {<button class="btn-ghost sm" (click)="$event.stopPropagation(); move(i, n)">Move to {{ n }} →</button>}
              </div>
            } @empty {<p class="muted em">No incidents</p>}
          </div>
        }
      </div>
    }
    <app-sf-report /><app-sf-incident-drawer /><app-sf-toast />
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; }
    .board { display: grid; grid-template-columns: repeat(6, minmax(200px, 1fr)); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
    .lane { background: var(--kb-f3f2fa); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
    .lh { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; }
    .ic { background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 8px; padding: 9px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; font-size: 12px; }
    .ic:hover { border-color: var(--kl-c4b5fd); } .ih { display: flex; gap: 6px; align-items: center; } .ih b { flex: 1; font-size: 12.5px; } .ic small { font-size: 11px; } .ic button { align-self: flex-start; margin-top: 4px; }
    .em { text-align: center; font-size: 12px; }
  `],
})
export class IncidentManagement {
  protected readonly store = inject(SafetyStore);
  protected readonly statuses = I_STATUSES;
  protected readonly months = MONTHS;
  protected readonly dayLabel = dayLabel;
  protected readonly sevTag = sevTag;
  protected readonly stCls = stCls;
  protected readonly view = signal<'table' | 'board'>('table');
  protected readonly monthly = [
    { name: 'High', color: 'var(--ka-ef4444)', values: MONTHLY.High },
    { name: 'Medium', color: 'var(--ka-f59e0b)', values: MONTHLY.Medium },
    { name: 'Low', color: 'var(--ka-22c55e)', values: MONTHLY.Low },
  ];
  protected readonly month = computed(() => this.store.incidents().filter((i) => i.daysAgo <= 30));
  protected readonly injuries = computed(() => this.month().reduce((a, i) => a + i.injured, 0));
  protected readonly closedPct = computed(() => Math.round((this.count('Closed') / Math.max(1, this.month().length)) * 100));
  protected readonly rows = computed(() => this.store.incidents().map((i) => ({ ...i, icon: this.meta(i.type).icon, color: this.meta(i.type).color, when: `${i.daysAgo ? dayLabel(i.daysAgo) : 'Today'} ${i.time}` })));
  protected readonly byType = computed(() => {
    const m = new Map<string, number>();
    this.month().forEach((i) => m.set(i.type, (m.get(i.type) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value, color: this.meta(label).color }));
  });
  protected readonly byTypeMax = computed(() => Math.max(...this.byType().map((r) => r.value)) * 1.15);
  protected readonly bySev = computed(() => {
    const c = (s: string) => this.month().filter((i) => i.severity === s).length;
    return [
      { label: 'Critical', value: c('Critical'), color: 'var(--ka-7f1d1d)' }, { label: 'High', value: c('High'), color: 'var(--ka-ef4444)' },
      { label: 'Medium', value: c('Medium'), color: 'var(--ka-f59e0b)' }, { label: 'Low', value: c('Low'), color: 'var(--ka-22c55e)' },
    ];
  });
  protected readonly cols: Col[] = [
    { key: 'id', label: 'ID' },
    { key: 'type', label: 'Type', kind: 'icon' },
    { key: 'title', label: 'Title' },
    { key: 'location', label: 'Location', sub: 'floor' },
    { key: 'when', label: 'Reported' },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => sevTagG(r.severity) },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Medical Assist' || r.status === 'Responding' ? 'tag blue' : r.status === 'Under Investigation' ? 'tag amber' : statusTag(r.status === 'In Progress' ? 'critical' : r.status)) },
    { key: 'assignee', label: 'Assignee' },
  ];
  protected readonly filters = [
    { key: 'severity', label: 'Severity', options: SEVS },
    { key: 'status', label: 'Status', options: I_STATUSES },
    { key: 'type', label: 'Type', options: Object.keys(I_TYPES) },
    { key: 'site', label: 'Site', options: SITES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'Open details', icon: 'eye' },
    { id: 'me', label: 'Assign to me', icon: 'user-check' },
    { id: 'inv', label: 'Start investigation', icon: 'search', when: (r) => r.status !== 'Closed' && r.status !== 'Under Investigation' },
    { id: 'close', label: 'Close incident', icon: 's-check', when: (r) => r.status !== 'Closed' },
  ];
  protected meta(t: string) {
    return I_TYPES[t] ?? I_TYPES['Near Miss'];
  }
  protected count(s: IStatus) {
    return this.month().filter((i) => i.status === s).length;
  }
  protected lane(s: IStatus) {
    return this.store.incidents().filter((i) => i.status === s && (s !== 'Closed' || i.daysAgo < 6));
  }
  protected next(s: IStatus): IStatus | null {
    return s === 'Open' ? 'In Progress' : s === 'In Progress' || s === 'Responding' || s === 'Medical Assist' ? 'Under Investigation' : s === 'Under Investigation' ? 'Closed' : null;
  }
  protected move(i: Incident, s: IStatus) {
    this.store.updateIncident(i.id, { status: s }, `Status changed to ${s}`);
    this.store.toast(`${i.id} moved to ${s}`);
  }
  protected act(a: string, r: Incident) {
    if (a === 'view') this.store.openIncident.set(r.id);
    if (a === 'me') {
      this.store.updateIncident(r.id, { assignee: 'Rex Kumar' }, 'Assigned to Rex Kumar');
      this.store.toast(`${r.id} assigned to you`);
    }
    if (a === 'inv') this.move(r, 'Under Investigation');
    if (a === 'close') this.store.openIncident.set(r.id);
  }
  protected exportCsv() {
    downloadCsv('incident-register.csv', [['ID', 'Date', 'Time', 'Type', 'Title', 'Site', 'Floor', 'Location', 'Severity', 'Status', 'Assignee', 'Injuries', 'Root cause'],
      ...this.store.incidents().map((i) => [i.id, i.daysAgo ? dayLabel(i.daysAgo) : 'Today', i.time, i.type, i.title, i.site, i.floor, i.location, i.severity, i.status, i.assignee, i.injured, i.rootCause ?? ''])]);
  }
}

/* =====================================================================
   Hazard & Risk Management
   ===================================================================== */
@Component({
  selector: 'app-hazard-risk-management',
  imports: [...UI, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Hazard &amp; Risk Management" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Hazard register, 5×5 risk assessment and control tracking across all sites.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Report Hazard</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export Register</button>
    </app-page-head>
    <section class="kpi-row kpi5">
      <app-kpi label="Open Hazards" [value]="open().length" icon="triangle-alert" color="var(--ka-f59e0b)" change="28%" [up]="false" sub="vs. last 24 hrs" />
      <app-kpi label="High / Critical Risk" [value]="highRisk()" icon="flame" color="var(--ka-ef4444)" sub="score ≥ 10" subColor="var(--ka-dc2626)" />
      <app-kpi label="Overdue Controls" [value]="overdue()" icon="clock" color="var(--ka-dc2626)" sub="past due date" />
      <app-kpi label="Being Mitigated" [value]="mitigating()" icon="toolbox" color="var(--ka-3b82f6)" sub="controls in progress" />
      <app-kpi label="Closed (30 days)" [value]="closed()" icon="shield-check" color="var(--ka-22c55e)" sub="verified & closed" subColor="var(--ka-16a34a)" />
    </section>

    <section class="split">
      <div class="card">
        <div class="card-head">
          <h3>Hazard Register</h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search hazards..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="status()" (change)="status.set($any($event.target).value)"><option value="Active">Open & Mitigating</option><option>Open</option><option>Mitigating</option><option>Closed</option><option value="All">All</option></select>
          </div>
        </div>
        <div class="chips">
          <button [class.on]="!cat()" (click)="cat.set(null)">All categories</button>
          @for (c of cats; track c; let i = $index) {<button [class.on]="cat() === c" (click)="cat.set(cat() === c ? null : c)"><i [style.background]="catColor[i]"></i>{{ c }}</button>}
          @if (cell()) {<button class="on" (click)="cell.set(null)">L{{ cell()![0] }} × I{{ cell()![1] }} ✕</button>}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>ID</th><th>Hazard</th><th>Category</th><th>Location</th><th>Risk</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              @for (h of list(); track h.id) {
                @let sc = score(h);
                <tr class="clickable" [class.selected]="sel()?.id === h.id" (click)="selId.set(h.id)">
                  <td>{{ h.id }}</td><td><b>{{ h.title }}</b></td><td><span class="cat"><app-icon [name]="catIcon(h.category)" [size]="14" />{{ h.category }}</span></td><td>{{ h.location }}<div class="muted">{{ h.floor }}</div></td>
                  <td><span class="risk" [style.background]="riskColor(sc)">{{ sc }}</span> {{ level(sc) }}</td><td>{{ h.owner }}</td>
                  <td [class.bad]="h.status !== 'Closed' && h.due < 0">{{ h.status === 'Closed' ? '—' : h.due < 0 ? -h.due + 'd overdue' : 'in ' + h.due + 'd' }}</td>
                  <td><span [class]="h.status === 'Closed' ? 'tag green' : h.status === 'Mitigating' ? 'tag blue' : 'tag amber'">{{ h.status }}</span></td>
                </tr>
              } @empty {<tr><td colspan="8" class="empty-note">No hazards match these filters</td></tr>}
            </tbody>
          </table>
        </div>
        <p class="muted foot">{{ list().length }} hazards</p>
      </div>

      <div class="side">
        <div class="card mb">
          <div class="card-head"><h3>Risk Matrix</h3><span class="muted">open hazards · click a cell</span></div>
          <div class="mx">
            <span class="yl">Likelihood →</span>
            @for (l of [5, 4, 3, 2, 1]; track l) {
              <span class="ax">{{ l }}</span>
              @for (i of [1, 2, 3, 4, 5]; track i) {
                @let n = matrix()[l - 1][i - 1];
                <button class="cellb" [style.background]="riskColor(l * i)" [class.on]="cell()?.[0] === l && cell()?.[1] === i" [class.zero]="!n" [disabled]="!n" (click)="cell.set([l, i])">{{ n || '' }}</button>
              }
            }
            <span></span>@for (i of [1, 2, 3, 4, 5]; track i) {<span class="ax">{{ i }}</span>}
            <span class="xl">Impact →</span>
          </div>
        </div>
        @if (sel(); as h) {
          <div class="card">
            <div class="dh"><span class="ic-sq" [style.background]="'color-mix(in srgb, ' + riskColor(score(h)) + ' 20%, transparent)'" [style.color]="riskColor(score(h))"><app-icon [name]="catIcon(h.category)" [size]="17" /></span><div><h3>{{ h.title }}</h3><small class="muted">{{ h.id }} · reported by {{ h.reportedBy }} · {{ h.daysAgo ? dayLabel(h.daysAgo) : 'today' }}</small></div></div>
            <dl class="dl">
              <dt>Location</dt><dd>{{ h.location }} · {{ h.floor }}</dd><dt>Category</dt><dd>{{ h.category }}</dd>
              <dt>Risk score</dt><dd><b>{{ score(h) }}</b> ({{ level(score(h)) }}) = L{{ h.likelihood }} × I{{ h.impact }}</dd>
              <dt>Owner</dt><dd><select class="select mini" [value]="h.owner" (change)="store.updateHazard(h.id, { owner: $any($event.target).value })">@for (o of officers; track o) {<option [value]="o">{{ o }}</option>}</select></dd>
            </dl>
            <div class="sec-h">Re-assess</div>
            <div class="ra">
              <label>Likelihood <input type="range" min="1" max="5" [value]="h.likelihood" (input)="store.updateHazard(h.id, { likelihood: +$any($event.target).value })" /></label>
              <label>Impact <input type="range" min="1" max="5" [value]="h.impact" (input)="store.updateHazard(h.id, { impact: +$any($event.target).value })" /></label>
            </div>
            <div class="sec-h">Controls ({{ doneCount(h) }}/{{ h.controls.length }})</div>
            @for (c of h.controls; track $index; let k = $index) {<label class="chk"><input type="checkbox" [checked]="c.done" (change)="toggleControl(h, k)" />{{ c.text }}</label>}
            <div class="addc"><input class="input" placeholder="Add control measure..." [value]="newCtl()" (input)="newCtl.set($any($event.target).value)" (keydown.enter)="addControl(h)" /><button class="btn-ghost" (click)="addControl(h)">Add</button></div>
            <div class="acts">
              @if (h.status === 'Open') {<button class="btn-outline" (click)="setStatus(h, 'Mitigating')">Start Mitigation</button>}
              @if (h.status !== 'Closed') {<button class="btn-primary" (click)="setStatus(h, 'Closed')"><app-icon name="s-check" [size]="15" />Verify &amp; Close</button>}
              @else {<button class="btn-outline" (click)="setStatus(h, 'Open')">Re-open</button>}
              <a class="btn-ghost" routerLink="/safety-wellbeing/safety-command-center" [queryParams]="{ floor: h.floor }"><app-icon name="map-pin" [size]="15" />Map</a>
            </div>
          </div>
        }
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Report Hazard</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Hazard description *<input class="input" required [value]="f.title" (input)="patch({ title: $any($event.target).value })" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="patch({ category: $any($event.target).value })">@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.location" (change)="patch({ location: $any($event.target).value })">@for (c of locations; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Floor<select class="select" [value]="f.floor" (change)="patch({ floor: $any($event.target).value })">@for (c of floors; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Owner<select class="select" [value]="f.owner" (change)="patch({ owner: $any($event.target).value })">@for (c of officers; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Likelihood (1-5)<input class="input" type="number" min="1" max="5" [value]="f.likelihood" (input)="patch({ likelihood: +$any($event.target).value })" /></label>
          <label>Impact (1-5)<input class="input" type="number" min="1" max="5" [value]="f.impact" (input)="patch({ impact: +$any($event.target).value })" /></label>
          <label>Due in (days)<input class="input" type="number" min="0" [value]="f.due" (input)="patch({ due: +$any($event.target).value })" /></label>
          <label>Risk score<input class="input" disabled [value]="f.likelihood * f.impact + ' – ' + level(f.likelihood * f.impact)" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Hazard</button></div>
      </form>
    }
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; } .foot { margin: 8px 0 0; font-size: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .chips button { display: inline-flex; gap: 6px; align-items: center; padding: 5px 10px; border: 1px solid var(--border); border-radius: 20px; background: var(--kb-ffffff); font: inherit; font-size: 12px; cursor: pointer; }
    .chips button.on { background: var(--primary-soft); color: var(--primary); border-color: var(--kl-c4b5fd); } .chips i { width: 8px; height: 8px; border-radius: 50%; }
    .cat { display: inline-flex; gap: 5px; align-items: center; white-space: nowrap; }
    .risk { display: inline-grid; place-items: center; width: 26px; height: 22px; border-radius: 5px; color: var(--kf-ffffff); font-weight: 700; font-size: 11.5px; }
    .mx { display: grid; grid-template-columns: 22px repeat(5, 1fr); gap: 4px; position: relative; padding-left: 16px; }
    .yl { position: absolute; left: -26px; top: 45%; transform: rotate(-90deg); font-size: 11px; color: var(--muted); } .xl { grid-column: 2 / -1; text-align: center; font-size: 11px; color: var(--muted); }
    .ax { display: grid; place-items: center; font-size: 11px; color: var(--muted); }
    .cellb { height: 40px; border: 0; border-radius: 6px; color: var(--kf-ffffff); font: inherit; font-weight: 700; cursor: pointer; } .cellb.zero { opacity: .45; } .cellb.on { outline: 3px solid var(--kl-1e1b3a); }
    .dh { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; } .dh h3 { font-size: 15px; } .dh div { display: flex; flex-direction: column; }
    .select.mini { height: 30px; font-size: 12px; }
    .ra { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; } .ra label { display: flex; flex-direction: column; gap: 4px; } .ra input { accent-color: var(--primary); }
    .addc { display: flex; gap: 6px; margin-top: 8px; } .addc .input { flex: 1; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; } .acts a { text-decoration: none; }
  `],
})
export class HazardRisk {
  protected readonly store = inject(SafetyStore);
  protected readonly cats = H_CATS;
  protected readonly catColor = H_CAT_COLOR;
  protected readonly officers = OFFICERS;
  protected readonly locations = LOCATIONS;
  protected readonly floors = FLOORS;
  protected readonly dayLabel = dayLabel;
  protected readonly score = riskScore;
  protected readonly level = riskLevel;
  protected readonly q = signal('');
  protected readonly status = signal('Active');
  protected readonly cat = signal<string | null>(this.store.hazardCat());
  protected readonly cell = signal<[number, number] | null>(null);
  protected readonly selId = signal<string | null>(null);
  protected readonly newCtl = signal('');
  protected readonly form = signal<Omit<Hazard, 'id'> | null>(null);
  protected readonly open = this.store.openHazards;
  protected readonly highRisk = computed(() => this.open().filter((h) => riskScore(h) >= 10).length);
  protected readonly overdue = computed(() => this.open().filter((h) => h.due < 0).length);
  protected readonly mitigating = computed(() => this.open().filter((h) => h.status === 'Mitigating').length);
  protected readonly closed = computed(() => this.store.hazards().filter((h) => h.status === 'Closed').length);
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    const st = this.status();
    const c = this.cell();
    return this.store.hazards().filter(
      (h) =>
        (st === 'All' || (st === 'Active' ? h.status !== 'Closed' : h.status === st)) &&
        (!this.cat() || h.category === this.cat()) &&
        (!c || (h.likelihood === c[0] && h.impact === c[1])) &&
        (!q || `${h.id} ${h.title} ${h.location} ${h.owner}`.toLowerCase().includes(q)),
    );
  });
  protected readonly sel = computed(() => this.store.hazards().find((h) => h.id === this.selId()) ?? this.list()[0] ?? null);
  protected readonly matrix = computed(() => {
    const m = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]);
    this.open().forEach((h) => m[h.likelihood - 1][h.impact - 1]++);
    return m;
  });
  constructor() {
    this.store.hazardCat.set(null);
  }
  protected catIcon(c: string) {
    return H_CAT_ICON[H_CATS.indexOf(c)] ?? 'triangle-alert';
  }
  protected riskColor(s: number) {
    return s >= 15 ? 'var(--ka-dc2626)' : s >= 10 ? 'var(--ka-f97316)' : s >= 5 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)';
  }
  protected doneCount(h: Hazard) {
    return h.controls.filter((c) => c.done).length;
  }
  protected toggleControl(h: Hazard, k: number) {
    this.store.updateHazard(h.id, { controls: h.controls.map((c, i) => (i === k ? { ...c, done: !c.done } : c)) });
  }
  protected addControl(h: Hazard) {
    if (!this.newCtl().trim()) return;
    this.store.updateHazard(h.id, { controls: [...h.controls, { text: this.newCtl().trim(), done: false }] });
    this.newCtl.set('');
  }
  protected setStatus(h: Hazard, s: Hazard['status']) {
    if (s === 'Closed' && h.controls.some((c) => !c.done)) {
      this.store.updateHazard(h.id, { status: s, controls: h.controls.map((c) => ({ ...c, done: true })) });
    } else this.store.updateHazard(h.id, { status: s });
    this.store.toast(`${h.id} ${s === 'Closed' ? 'verified and closed' : s === 'Mitigating' ? 'mitigation started' : 're-opened'}`);
  }
  protected openForm() {
    this.form.set({ title: '', category: H_CATS[0], location: 'Production Area', floor: 'Floor 2', likelihood: 3, impact: 3, status: 'Open', owner: OFFICERS[0], due: 7, reportedBy: 'Rex Kumar', daysAgo: 0, controls: [{ text: 'Barricade / signpost the area', done: false }] });
  }
  protected patch(p: Partial<Hazard>) {
    this.form.update((f) => (f ? { ...f, ...p } : f));
  }
  protected save() {
    const h = this.store.addHazard(this.form()!);
    this.form.set(null);
    this.selId.set(h.id);
    this.store.toast(`${h.id} added to hazard register · ${h.owner} notified`);
  }
  protected exportCsv() {
    downloadCsv('hazard-register.csv', [['ID', 'Hazard', 'Category', 'Location', 'Floor', 'Likelihood', 'Impact', 'Score', 'Level', 'Owner', 'Status'],
      ...this.store.hazards().map((h) => [h.id, h.title, h.category, h.location, h.floor, h.likelihood, h.impact, riskScore(h), riskLevel(riskScore(h)), h.owner, h.status])]);
  }
}

/* =====================================================================
   Safety Inspections
   ===================================================================== */
@Component({
  selector: 'app-safety-inspections',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Safety Inspections" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Schedule, perform and track checklist-based inspections. Failed items raise hazards automatically.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Schedule Inspection</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
    </app-page-head>
    <section class="kpi-row kpi6">
      <app-kpi label="Scheduled" [value]="c('Scheduled')" icon="calendar-days" color="var(--ka-3b82f6)" sub="next 14 days" />
      <app-kpi label="In Progress" [value]="c('In Progress')" icon="s-clipboard" color="var(--ka-7c3aed)" sub="being performed" />
      <app-kpi label="Overdue" [value]="c('Overdue')" icon="clock" color="var(--ka-ef4444)" sub="past due date" subColor="var(--ka-dc2626)" />
      <app-kpi label="Completed (30 days)" [value]="c('Completed')" icon="shield-check" color="var(--ka-22c55e)" change="14%" sub="vs. last month" />
      <app-kpi label="Avg. Score" [value]="avg() + '%'" icon="star" color="var(--ka-f59e0b)" change="3 pts" sub="vs. last month" />
      <app-kpi label="Open Findings" [value]="findings()" icon="triangle-alert" color="var(--ka-f97316)" sub="raised to hazards" />
    </section>
    <section class="split">
      <div class="card">
        <div class="card-head">
          <div class="segs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }} ({{ t === 'All' ? store.inspections().length : c($any(t)) }})</button>}</div>
          <select class="select" style="width:auto" [value]="tpl()" (change)="tpl.set($any($event.target).value)"><option value="">All templates</option>@for (t of templates; track t) {<option [value]="t">{{ t }}</option>}</select>
        </div>
        <div class="ins">
          @for (i of list(); track i.id) {
            <button class="in" [class.on]="sel()?.id === i.id" (click)="selId.set(i.id)">
              <span class="ic-sq" [style.background]="'color-mix(in srgb, ' + col(i) + ' 12%, transparent)'" [style.color]="col(i)"><app-icon name="s-clipboard" [size]="17" /></span>
              <div><b>{{ i.title }}</b><small>{{ i.id }} · {{ i.inspector }} · {{ dueText(i) }}</small></div>
              @if (i.score !== undefined) {<span class="score" [style.color]="i.score >= 90 ? 'var(--ka-16a34a)' : i.score >= 75 ? 'var(--ka-d97706)' : 'var(--ka-dc2626)'">{{ i.score }}%</span>}
              <span [class]="tag(i.status)">{{ i.status }}</span>
            </button>
          } @empty {<p class="muted">No inspections.</p>}
        </div>
      </div>
      <div class="side">
        @if (sel(); as i) {
          <div class="card">
            <div class="card-head"><div><h3>{{ i.title }}</h3><small class="muted">{{ i.id }} · {{ i.template }} · {{ i.inspector }}</small></div><span [class]="tag(i.status)">{{ i.status }}</span></div>
            <div class="prog"><div class="bar"><i [style.width.%]="answered(i) / i.items.length * 100" style="background:var(--kb-7c3aed)"></i></div><small>{{ answered(i) }}/{{ i.items.length }} answered</small></div>
            @for (it of i.items; track $index; let k = $index) {
              <div class="q">
                <span>{{ it.q }}</span>
                <div class="pf">@for (r of ['Pass', 'Fail', 'N/A']; track r) {<button [class]="'r ' + (it.r === r ? r.replace('/', '').toLowerCase() : '')" [disabled]="i.status === 'Completed'" (click)="answer(i, k, $any(r))">{{ r }}</button>}</div>
              </div>
            }
            @if (i.status !== 'Completed') {
              <div class="acts">
                @if (i.status !== 'In Progress') {<button class="btn-outline" (click)="start(i)"><app-icon name="play" [size]="14" />Start</button>}
                <button class="btn-primary" [disabled]="answered(i) < i.items.length" (click)="submit(i)"><app-icon name="s-check" [size]="15" />Submit Inspection</button>
              </div>
              @if (answered(i) < i.items.length) {<small class="muted">Answer all items to submit. Failed items are raised as hazards.</small>}
            } @else {
              <p class="done">Completed with score <b>{{ i.score }}%</b> · {{ i.findings }} finding(s) raised.</p>
            }
          </div>
        }
        <div class="card mt">
          <div class="card-head"><h3>Inspection Score Trend</h3></div>
          <app-line-chart [labels]="months" [series]="trend" [height]="170" [legend]="false" suffix="%" [min]="60" [max]="100" />
        </div>
      </div>
    </section>
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Schedule Inspection</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Template<select class="select" [value]="f.template" (change)="f.template = $any($event.target).value">@for (t of templates; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.location" (change)="f.location = $any($event.target).value">@for (t of locations; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Inspector<select class="select" [value]="f.inspector" (change)="f.inspector = $any($event.target).value">@for (t of officers; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Due in (days)<input class="input" type="number" min="0" [value]="f.due" (input)="f.due = +$any($event.target).value" /></label>
          <label class="full">Repeat<select class="select"><option>One-off</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .mt { margin-top: 12px; }
    .ins { display: flex; flex-direction: column; gap: 6px; }
    .in { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font: inherit; text-align: left; cursor: pointer; }
    .in:hover { border-color: var(--kl-c4b5fd); } .in.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .in div { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; } .in b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .in small { color: var(--muted); font-size: 11.5px; }
    .score { font-weight: 700; font-size: 13px; }
    .prog { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; } .prog .bar { flex: 1; } .prog small { font-size: 11px; color: var(--muted); }
    .q { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12.5px; }
    .pf { display: flex; gap: 4px; flex: none; } .r { height: 28px; padding: 0 10px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; font: inherit; font-size: 11.5px; cursor: pointer; }
    .r.pass { background: var(--kb-16a34a); color: var(--kf-ffffff); border-color: var(--kl-16a34a); } .r.fail { background: var(--kb-dc2626); color: var(--kf-ffffff); border-color: var(--kl-dc2626); } .r.na { background: var(--kb-6b7280); color: var(--kf-ffffff); }
    .acts { display: flex; gap: 8px; margin: 14px 0 6px; } .done { font-size: 13px; color: var(--kf-15803d); background: var(--kb-f0fdf4); padding: 10px; border-radius: 8px; }
  `],
})
export class SafetyInspections {
  protected readonly store = inject(SafetyStore);
  protected readonly tabs = ['All', 'Overdue', 'In Progress', 'Scheduled', 'Completed'];
  protected readonly templates = Object.keys(TEMPLATES);
  protected readonly locations = LOCATIONS;
  protected readonly officers = OFFICERS;
  protected readonly months = MONTHS;
  protected readonly trend = [{ name: 'Avg score', color: 'var(--ka-7c3aed)', values: [84, 86, 85, 88, 90, 91], area: true }];
  protected readonly tab = signal('All');
  protected readonly tpl = signal('');
  protected readonly selId = signal<string | null>(null);
  protected readonly form = signal<{ template: string; location: string; inspector: string; due: number } | null>(null);
  protected readonly list = computed(() => this.store.inspections().filter((i) => (this.tab() === 'All' || i.status === this.tab()) && (!this.tpl() || i.template === this.tpl())));
  protected readonly sel = computed(() => this.store.inspections().find((i) => i.id === this.selId()) ?? this.list()[0] ?? null);
  protected readonly avg = computed(() => {
    const s = this.store.inspections().filter((i) => i.score !== undefined);
    return Math.round(s.reduce((a, i) => a + i.score!, 0) / Math.max(1, s.length));
  });
  protected readonly findings = computed(() => this.store.inspections().reduce((a, i) => a + i.findings, 0));
  protected c(s: Inspection['status']) {
    return this.store.inspections().filter((i) => i.status === s).length;
  }
  protected col(i: Inspection) {
    return i.status === 'Overdue' ? 'var(--ka-ef4444)' : i.status === 'Completed' ? 'var(--ka-16a34a)' : i.status === 'In Progress' ? 'var(--ka-7c3aed)' : 'var(--ka-3b82f6)';
  }
  protected tag(s: string) {
    return s === 'Overdue' ? 'tag red' : s === 'Completed' ? 'tag green' : s === 'In Progress' ? 'tag' : 'tag blue';
  }
  protected dueText(i: Inspection) {
    return i.status === 'Completed' ? `done ${dayLabel(Math.abs(i.due))}` : i.due < 0 ? `${-i.due}d overdue` : i.due === 0 ? 'due today' : `due ${dayLabel(-i.due)}`;
  }
  protected answered(i: Inspection) {
    return i.items.filter((x) => x.r).length;
  }
  private patch(id: string, p: Partial<Inspection>) {
    this.store.inspections.update((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  protected answer(i: Inspection, k: number, r: 'Pass' | 'Fail' | 'N/A') {
    this.patch(i.id, { items: i.items.map((x, j) => (j === k ? { ...x, r } : x)), status: i.status === 'Completed' ? i.status : 'In Progress' });
  }
  protected start(i: Inspection) {
    this.patch(i.id, { status: 'In Progress' });
    this.store.toast(`${i.id} started`);
  }
  protected submit(i: Inspection) {
    const fails = i.items.filter((x) => x.r === 'Fail');
    const scored = i.items.filter((x) => x.r !== 'N/A');
    const score = Math.round(((scored.length - fails.length) / Math.max(1, scored.length)) * 100);
    fails.forEach((f) =>
      this.store.addHazard({ title: `${f.q} – failed (${i.id})`, category: i.template.includes('Fire') ? 'Fire Safety' : i.template.includes('Electrical') ? 'Electrical' : i.template.includes('Forklift') ? 'Machinery & Equipment' : 'Others', location: i.location, floor: 'Floor 2', likelihood: 3, impact: 3, status: 'Open', owner: i.inspector, due: 7, reportedBy: i.inspector, daysAgo: 0, controls: [{ text: 'Rectify failed inspection item', done: false }] }),
    );
    this.patch(i.id, { status: 'Completed', score, findings: fails.length, due: 0 });
    this.store.toast(`${i.id} completed · score ${score}%${fails.length ? ` · ${fails.length} hazard(s) raised` : ''}`);
  }
  protected openForm() {
    this.form.set({ template: this.templates[0], location: LOCATIONS[0], inspector: OFFICERS[0], due: 3 });
  }
  protected save() {
    const f = this.form()!;
    const id = `INS-${640 + this.store.inspections().length}`;
    this.store.inspections.update((l) => [{ id, title: `${f.template} – ${f.location}`, template: f.template, location: f.location, inspector: f.inspector, due: f.due, status: 'Scheduled', findings: 0, items: TEMPLATES[f.template].map((q) => ({ q, r: '' as const })) }, ...l]);
    this.form.set(null);
    this.selId.set(id);
    this.store.toast(`${id} scheduled · ${f.inspector} notified`);
  }
  protected exportCsv() {
    downloadCsv('inspections.csv', [['ID', 'Title', 'Template', 'Location', 'Inspector', 'Status', 'Score', 'Findings'], ...this.store.inspections().map((i) => [i.id, i.title, i.template, i.location, i.inspector, i.status, i.score ?? '', i.findings])]);
  }
}

/* =====================================================================
   Permits & Work Authorizations
   ===================================================================== */
const P_LANES: PermitStatus[] = ['Requested', 'Approved', 'Active', 'Suspended', 'Closed'];
@Component({
  selector: 'app-permits-work-authorizations',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Permits &amp; Work Authorizations" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Permit-to-work lifecycle for high-risk activities: request, approve, activate, suspend and close out.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />New Permit</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export Log</button>
    </app-page-head>
    <section class="kpi-row kpi5">
      <app-kpi label="Active Permits" [value]="n('Active')" icon="key-round" color="var(--ka-22c55e)" sub="work in progress" subColor="var(--ka-16a34a)" />
      <app-kpi label="Pending Approval" [value]="n('Requested')" icon="clock" color="var(--ka-f59e0b)" sub="awaiting HSE sign-off" />
      <app-kpi label="Approved / Upcoming" [value]="n('Approved')" icon="calendar-days" color="var(--ka-3b82f6)" sub="starting soon" />
      <app-kpi label="Suspended" [value]="n('Suspended')" icon="ban" color="var(--ka-ef4444)" sub="stop-work in place" subColor="var(--ka-dc2626)" />
      <app-kpi label="Workers Under Permit" [value]="workers()" icon="hard-hat" color="var(--ka-7c3aed)" sub="on active permits" />
    </section>
    <div class="chips">
      <button [class.on]="!type()" (click)="type.set(null)">All types</button>
      @for (t of types; track t) {<button [class.on]="type() === t" (click)="type.set(type() === t ? null : t)">{{ t }}</button>}
    </div>
    <section class="split">
      <div class="board">
        @for (s of lanes; track s) {
          <div class="lane">
            <div class="lh"><span [class]="tag(s)">{{ s }}</span><b>{{ lane(s).length }}</b></div>
            @for (p of lane(s); track p.id) {
              <button class="pc" [class.on]="sel()?.id === p.id" (click)="selId.set(p.id)">
                <div class="ph"><span class="ic-sq sm"><app-icon [name]="p.icon" [size]="14" /></span><b>{{ p.type }}</b></div>
                <span class="tt">{{ p.title }}</span>
                <small>{{ p.id }} · {{ p.location }}</small>
                <small class="muted">{{ p.contractor }} · {{ p.workers }} workers</small>
              </button>
            } @empty {<p class="muted em">—</p>}
          </div>
        }
      </div>
      <div class="side">
        @if (sel(); as p) {
          <div class="card">
            <div class="card-head"><div><h3>{{ p.title }}</h3><small class="muted">{{ p.id }} · {{ p.type }}</small></div><span [class]="tag(p.status)">{{ p.status }}</span></div>
            <dl class="dl">
              <dt>Location</dt><dd>{{ p.location }} · {{ p.floor }}</dd><dt>Contractor</dt><dd>{{ p.contractor }}</dd><dt>Requested by</dt><dd>{{ p.requestedBy }}</dd>
              <dt>Approver</dt><dd>{{ p.approver }}</dd><dt>Valid</dt><dd>{{ p.start }} → {{ p.end }}</dd><dt>Workers</dt><dd>{{ p.workers }}</dd>
              @if (p.gas) {<dt>Gas test</dt><dd class="good">{{ p.gas }}</dd>}
            </dl>
            <div class="sec-h">Precautions checklist ({{ doneN(p) }}/{{ p.checks.length }})</div>
            @for (c of p.checks; track $index; let k = $index) {<label class="chk"><input type="checkbox" [checked]="c.done" [disabled]="p.status === 'Closed'" (change)="toggle(p, k)" />{{ c.text }}</label>}
            <div class="acts">
              @switch (p.status) {
                @case ('Requested') {<button class="btn-primary" (click)="set(p, 'Approved')"><app-icon name="s-check" [size]="15" />Approve</button><button class="btn-ghost danger" (click)="set(p, 'Rejected')">Reject</button>}
                @case ('Approved') {<button class="btn-primary" [disabled]="doneN(p) < p.checks.length" (click)="set(p, 'Active')"><app-icon name="play" [size]="14" />Activate Permit</button>}
                @case ('Active') {<button class="btn-ghost danger" (click)="set(p, 'Suspended')"><app-icon name="pause" [size]="14" />Suspend (Stop Work)</button><button class="btn-primary" (click)="set(p, 'Closed')">Close Out</button><button class="btn-ghost" (click)="extend(p)">Extend +2h</button>}
                @case ('Suspended') {<button class="btn-primary" (click)="set(p, 'Active')">Resume Work</button><button class="btn-ghost" (click)="set(p, 'Closed')">Cancel Permit</button>}
              }
            </div>
            @if (p.status === 'Approved' && doneN(p) < p.checks.length) {<small class="muted">All precautions must be verified before activation.</small>}
          </div>
        }
      </div>
    </section>
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>New Permit to Work</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Permit type<select class="select" [value]="f.type" (change)="f.type = $any($event.target).value">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.location" (change)="f.location = $any($event.target).value">@for (t of locations; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label class="full">Work description *<input class="input" required [value]="f.title" (input)="f.title = $any($event.target).value" /></label>
          <label>Contractor<select class="select" [value]="f.contractor" (change)="f.contractor = $any($event.target).value">@for (t of contractors; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Workers<input class="input" type="number" min="1" [value]="f.workers" (input)="f.workers = +$any($event.target).value" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Submit for Approval</button></div>
      </form>
    }
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .chips button { padding: 6px 12px; border: 1px solid var(--border); border-radius: 20px; background: var(--kb-ffffff); font: inherit; font-size: 12px; cursor: pointer; } .chips button.on { background: var(--primary-soft); color: var(--primary); border-color: var(--kl-c4b5fd); }
    .board { display: grid; grid-template-columns: repeat(5, minmax(150px, 1fr)); gap: 8px; min-width: 0; overflow-x: auto; }
    .lane { background: var(--kb-f3f2fa); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-height: 300px; }
    .lh { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; }
    .pc { display: flex; flex-direction: column; gap: 3px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 8px; padding: 9px; text-align: left; font: inherit; font-size: 12px; cursor: pointer; }
    .pc:hover { border-color: var(--kl-c4b5fd); } .pc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .ph { display: flex; gap: 6px; align-items: center; } .ic-sq.sm { width: 24px; height: 24px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; }
    .tt { font-weight: 600; font-size: 12.5px; } .pc small { font-size: 11px; } .em { text-align: center; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 6px; } .danger { color: var(--red); }
  `],
})
export class SafetyPermits {
  protected readonly store = inject(SafetyStore);
  protected readonly lanes = P_LANES;
  protected readonly types = ['Hot Work', 'Confined Space', 'Work at Height', 'Electrical Isolation', 'Excavation', 'Chemical Handling', 'Lifting Operations'];
  protected readonly locations = LOCATIONS;
  protected readonly contractors = ['BuildRight LLC', 'TechServe FM', 'Spark Electricals', 'CleanPro Services', 'Rapid Logistics', 'In-house Maintenance'];
  protected readonly type = signal<string | null>(null);
  protected readonly selId = signal<string | null>(null);
  protected readonly form = signal<{ type: string; location: string; title: string; contractor: string; workers: number } | null>(null);
  protected readonly filtered = computed(() => this.store.permits().filter((p) => !this.type() || p.type === this.type()));
  protected readonly sel = computed(() => this.store.permits().find((p) => p.id === this.selId()) ?? this.filtered().find((p) => p.status === 'Active') ?? null);
  protected readonly workers = computed(() => this.store.permits().filter((p) => p.status === 'Active').reduce((a, p) => a + p.workers, 0));
  protected n(s: PermitStatus) {
    return this.store.permits().filter((p) => p.status === s).length;
  }
  protected lane(s: PermitStatus) {
    return this.filtered().filter((p) => p.status === s || (s === 'Closed' && p.status === 'Rejected'));
  }
  protected tag(s: string) {
    return s === 'Active' ? 'tag green' : s === 'Requested' ? 'tag amber' : s === 'Approved' ? 'tag blue' : s === 'Suspended' || s === 'Rejected' ? 'tag red' : 'tag grey';
  }
  protected doneN(p: Permit) {
    return p.checks.filter((c) => c.done).length;
  }
  private patch(id: string, x: Partial<Permit>) {
    this.store.permits.update((l) => l.map((p) => (p.id === id ? { ...p, ...x } : p)));
  }
  protected toggle(p: Permit, k: number) {
    this.patch(p.id, { checks: p.checks.map((c, i) => (i === k ? { ...c, done: !c.done } : c)) });
  }
  protected set(p: Permit, s: PermitStatus) {
    this.patch(p.id, { status: s, ...(s === 'Approved' ? { approver: 'Rex Kumar' } : {}) });
    this.store.toast(`${p.id} ${s === 'Active' ? 'activated · work may begin' : s === 'Suspended' ? 'suspended · stop-work issued to ' + p.workers + ' workers' : s.toLowerCase()}`);
  }
  protected extend(p: Permit) {
    this.patch(p.id, { end: p.end.replace('17:00', '19:00') });
    this.store.toast(`${p.id} extended to 19:00`);
  }
  protected openForm() {
    this.form.set({ type: this.types[0], location: LOCATIONS[0], title: '', contractor: this.contractors[0], workers: 3 });
  }
  protected save() {
    const f = this.form()!;
    const id = `PTW-${3181 + this.store.permits().length - 14}`;
    const icon = ({ 'Hot Work': 'flame', 'Confined Space': 'door-open', 'Work at Height': 'arrow-up', 'Electrical Isolation': 's-zap', Excavation: 'toolbox', 'Chemical Handling': 's-flask', 'Lifting Operations': 'truck' } as Record<string, string>)[f.type];
    const checks = this.store.permits().find((p) => p.type === f.type)!.checks.map((c) => ({ text: c.text, done: false }));
    this.store.permits.update((l) => [{ id, type: f.type, icon, title: f.title, location: f.location, floor: 'Floor 2', contractor: f.contractor, requestedBy: 'Rex Kumar', approver: 'Sarah Johnson', start: dayLabel(-1) + ' 07:30', end: dayLabel(-1) + ' 17:00', workers: f.workers, status: 'Requested', checks }, ...l]);
    this.form.set(null);
    this.selId.set(id);
    this.store.toast(`${id} submitted for approval`);
  }
  protected exportCsv() {
    downloadCsv('permit-log.csv', [['ID', 'Type', 'Work', 'Location', 'Contractor', 'Workers', 'Status', 'Start', 'End', 'Approver'], ...this.store.permits().map((p) => [p.id, p.type, p.title, p.location, p.contractor, p.workers, p.status, p.start, p.end, p.approver])]);
  }
}

/* =====================================================================
   Toolbox Talks & Training
   ===================================================================== */
@Component({
  selector: 'app-toolbox-talks-training',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Toolbox Talks &amp; Training" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Plan daily toolbox talks, capture attendance and track safety training & certification compliance.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Schedule Talk</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export Matrix</button>
    </app-page-head>
    <section class="kpi-row kpi5">
      <app-kpi label="Talks Delivered (30 days)" [value]="done().length" icon="megaphone" color="var(--ka-7c3aed)" change="20%" sub="vs. last month" />
      <app-kpi label="Attendance Rate" [value]="rate() + '%'" icon="user-check" color="var(--ka-22c55e)" change="4%" sub="vs. last month" />
      <app-kpi label="Upcoming Talks" [value]="upcoming().length" icon="calendar-days" color="var(--ka-3b82f6)" sub="next 7 days" />
      <app-kpi label="Training Compliance" [value]="compliance() + '%'" icon="graduation-cap" color="var(--ka-f59e0b)" sub="mandatory HSE courses" />
      <app-kpi label="Certificates Expiring" [value]="certs.length" icon="id-card" color="var(--ka-ef4444)" sub="within 30 days" subColor="var(--ka-dc2626)" />
    </section>
    <section class="grid2">
      <div class="card">
        <div class="card-head"><h3>Toolbox Talks</h3><div class="segs"><button [class.on]="tab() === 'up'" (click)="tab.set('up')">Upcoming</button><button [class.on]="tab() === 'done'" (click)="tab.set('done')">Completed</button></div></div>
        <ul class="tk">
          @for (t of (tab() === 'up' ? upcoming() : done()); track t.id) {
            <li>
              <span class="dt"><b>{{ dd(t) }}</b><small>{{ t.time }}</small></span>
              <div><b>{{ t.topic }}</b><small>{{ t.id }} · {{ t.presenter }} · {{ t.location }} · {{ t.duration }} min</small>
                @if (t.status === 'Completed') {<div class="att"><div class="bar"><i [style.width.%]="t.attended / t.invited * 100" style="background:var(--kb-22c55e)"></i></div><small>{{ t.attended }}/{{ t.invited }} attended</small></div>}
              </div>
              @if (t.status === 'Scheduled') {<button class="btn-primary sm" (click)="startAtt(t)">Take Attendance</button>}
              @else {<button class="btn-ghost sm" (click)="store.toast('Sign-in sheet for ' + t.id + ' downloaded')">Sign-in Sheet</button>}
            </li>
          }
        </ul>
      </div>
      <div class="col">
        <div class="card">
          <div class="card-head"><h3>Training Compliance by Department</h3></div>
          <ul class="tr">
            @for (d of training; track d.dept) {
              <li><span>{{ d.dept }}</span><div class="bar"><i [style.width.%]="d.pct" [style.background]="d.pct >= 90 ? 'var(--ka-22c55e)' : d.pct >= 85 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'"></i></div><b>{{ d.pct }}%</b><small [class.bad]="d.overdue > 3">{{ d.overdue }} overdue</small></li>
            }
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Certificates Expiring Soon</h3><button class="lnk" (click)="remindAll()">Remind all</button></div>
          <ul class="ce">
            @for (c of certs; track c.person) {
              <li><span class="av" [style.background]="avatarColor(c.person)">{{ initials(c.person) }}</span><div><b>{{ c.person }}</b><small>{{ c.cert }}</small></div><span [class]="c.expires <= 7 ? 'tag red' : 'tag amber'">{{ c.expires }} days</span>
                <button class="btn-ghost sm" [disabled]="reminded().includes(c.person)" (click)="remind(c.person)">{{ reminded().includes(c.person) ? 'Sent' : 'Remind' }}</button></li>
            }
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Topic Library</h3><span class="muted">click to schedule</span></div>
          <div class="lib">@for (t of library; track t) {<button (click)="openForm(t)">{{ t }}</button>}</div>
        </div>
      </div>
    </section>
    @if (att(); as a) {
      <div class="g-overlay" (click)="att.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Attendance · {{ a.topic }}</h3><button class="close-btn" (click)="att.set(null)">×</button></div>
        <p class="muted">Tap names as workers sign in (badge tap / QR also supported).</p>
        <div class="ppl">@for (p of invitees(a); track p) {<label class="chk"><input type="checkbox" [checked]="present().includes(p)" (change)="flip(p)" /><span class="av" [style.background]="avatarColor(p)">{{ initials(p) }}</span>{{ p }}</label>}</div>
        <div class="form-actions"><span class="muted grow">{{ present().length }}/{{ invitees(a).length }} present</span><button class="btn-ghost" (click)="att.set(null)">Cancel</button><button class="btn-primary" (click)="complete(a)">Complete Talk</button></div>
      </div>
    }
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Schedule Toolbox Talk</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Topic *<input class="input" required [value]="f.topic" (input)="f.topic = $any($event.target).value" /></label>
          <label>Presenter<select class="select" [value]="f.presenter" (change)="f.presenter = $any($event.target).value">@for (o of officers; track o) {<option [value]="o">{{ o }}</option>}</select></label>
          <label>Location<select class="select" [value]="f.location" (change)="f.location = $any($event.target).value">@for (o of locations; track o) {<option [value]="o">{{ o }}</option>}</select></label>
          <label>In (days)<input class="input" type="number" min="0" [value]="f.days" (input)="f.days = +$any($event.target).value" /></label>
          <label>Audience<select class="select" [value]="f.dept" (change)="f.dept = $any($event.target).value">@for (o of depts; track o) {<option [value]="o">{{ o }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .tk, .tr, .ce { list-style: none; margin: 0; padding: 0; }
    .tk li { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12.5px; }
    .tk .dt { display: flex; flex-direction: column; align-items: center; padding: 6px 0; border-radius: 8px; background: var(--primary-soft); color: var(--primary); } .tk .dt b { font-size: 12px; } .tk .dt small { font-size: 10.5px; }
    .tk li > div { display: flex; flex-direction: column; min-width: 0; } .tk small { color: var(--muted); font-size: 11.5px; }
    .att { display: flex !important; flex-direction: row !important; gap: 8px; align-items: center; margin-top: 5px; } .att .bar { flex: 1; max-width: 160px; }
    .btn-primary.sm { padding: 6px 10px; font-size: 11.5px; }
    .tr li { display: grid; grid-template-columns: 110px minmax(0, 1fr) 40px 70px; gap: 10px; align-items: center; padding: 7px 0; font-size: 12.5px; } .tr small { font-size: 11px; color: var(--muted); } .tr small.bad { color: var(--kf-dc2626); }
    .ce li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12.5px; } .ce div { display: flex; flex-direction: column; } .ce small { color: var(--muted); }
    .lib { display: flex; flex-wrap: wrap; gap: 6px; } .lib button { padding: 6px 11px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 20px; font: inherit; font-size: 12px; cursor: pointer; } .lib button:hover { background: var(--primary-soft); color: var(--primary); }
    .ppl { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; max-height: 360px; overflow: auto; } .ppl .av { width: 24px; height: 24px; font-size: 10px; }
    .grow { flex: 1; align-self: center; }
  `],
})
export class ToolboxTalks {
  protected readonly store = inject(SafetyStore);
  protected readonly training = TRAINING;
  protected readonly certs = CERTS;
  protected readonly officers = OFFICERS;
  protected readonly locations = LOCATIONS;
  protected readonly depts = DEPTS;
  protected readonly initials = initials;
  protected readonly avatarColor = avatarColor;
  protected readonly library = ['Hand Tool Safety', 'Confined Space Awareness', 'Hot Work Fire Watch', 'Housekeeping 5S', 'Hearing Conservation', 'Driving Safety', 'Electrical Safety Basics', 'Hazard Spotting'];
  protected readonly tab = signal<'up' | 'done'>('up');
  protected readonly att = signal<Talk | null>(null);
  protected readonly present = signal<string[]>([]);
  protected readonly reminded = signal<string[]>([]);
  protected readonly form = signal<{ topic: string; presenter: string; location: string; days: number; dept: string } | null>(null);
  protected readonly upcoming = computed(() => this.store.talks().filter((t) => t.status === 'Scheduled').sort((a, b) => b.daysAgo - a.daysAgo));
  protected readonly done = computed(() => this.store.talks().filter((t) => t.status === 'Completed').sort((a, b) => a.daysAgo - b.daysAgo));
  protected readonly rate = computed(() => {
    const d = this.done();
    return Math.round((d.reduce((a, t) => a + t.attended, 0) / Math.max(1, d.reduce((a, t) => a + t.invited, 0))) * 100);
  });
  protected readonly compliance = computed(() => Math.round(TRAINING.reduce((a, d) => a + d.pct, 0) / TRAINING.length));
  protected dd(t: Talk) {
    return t.daysAgo === 0 ? 'Today' : dayLabel(t.daysAgo).slice(0, 6);
  }
  protected invitees(t: Talk) {
    return PEOPLE.slice(0, Math.min(t.invited, PEOPLE.length));
  }
  protected startAtt(t: Talk) {
    this.present.set([]);
    this.att.set(t);
  }
  protected flip(p: string) {
    this.present.update((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  }
  protected complete(t: Talk) {
    const n = this.present().length;
    this.store.talks.update((l) => l.map((x) => (x.id === t.id ? { ...x, status: 'Completed', attended: n, invited: this.invitees(t).length, daysAgo: 0, attendees: this.present() } : x)));
    this.att.set(null);
    this.tab.set('done');
    this.store.toast(`${t.topic} completed · ${n} attendees recorded`);
  }
  protected remind(p: string) {
    this.reminded.update((l) => [...l, p]);
    this.store.toast(`Renewal reminder sent to ${p}`);
  }
  protected remindAll() {
    this.reminded.set(CERTS.map((c) => c.person));
    this.store.toast(`Reminders sent to ${CERTS.length} people and their supervisors`);
  }
  protected openForm(topic = '') {
    this.form.set({ topic, presenter: OFFICERS[0], location: LOCATIONS[0], days: 1, dept: DEPTS[0] });
  }
  protected save() {
    const f = this.form()!;
    const id = `TBT-${410 + this.store.talks().length}`;
    this.store.talks.update((l) => [{ id, topic: f.topic, presenter: f.presenter, location: f.location, daysAgo: -f.days, time: '07:30 AM', duration: 15, invited: 18, attended: 0, status: 'Scheduled', attendees: [] }, ...l]);
    this.form.set(null);
    this.tab.set('up');
    this.store.toast(`${id} scheduled · invites sent to ${f.dept}`);
  }
  protected exportCsv() {
    downloadCsv('training-matrix.csv', [['Department', 'Compliance %', 'Due', 'Overdue'], ...TRAINING.map((d) => [d.dept, d.pct, d.due, d.overdue]), [], ['Talk', 'Topic', 'Date', 'Invited', 'Attended'], ...this.store.talks().map((t) => [t.id, t.topic, dayLabel(t.daysAgo), t.invited, t.attended])]);
  }
}
