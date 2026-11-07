// Checkpoint & Location Tasks — NFC/QR/BLE checkpoints on the site map, geo-fenced tasks, scan log, missed checkpoints.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapCallout, MapMarker, MapPath } from '../rtls/floor-plan';
import { TaskDrawer } from './task-drawer';
import { TASKS_UI } from './tasks-ui';
import { Checkpoint, hhmm, isOpen, statusCls, TASK_ZONES, TaskItem, TaskStore, workerById, WORKERS } from './tasks.data';

type CpState = 'OK' | 'Due' | 'Missed' | 'Disabled';
const TECHS: Checkpoint['tech'][] = ['QR', 'NFC', 'BLE Beacon', 'Geo-fence'];
const TECH_ICON: Record<string, string> = { QR: 'tasks-qr', NFC: 'tasks-nfc', 'BLE Beacon': 'bluetooth', 'Geo-fence': 'locate' };
const STATE_COLOR: Record<CpState, string> = { OK: '#16a34a', Due: '#f59e0b', Missed: '#ef4444', Disabled: '#94a3b8' };
const DAY0 = 360; // scanning day starts 06:00
const GRACE = 15;

interface ScanRow {
  at: number;
  cp: Checkpoint;
  who: string;
  result: 'Verified' | 'Late' | 'Out of fence';
  method: string;
}

@Component({
  selector: 'app-tasks-checkpoint-location-tasks',
  imports: [...UI, ...TASKS_UI, FloorPlan, TaskDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Checkpoint &amp; Location Tasks" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="NFC, QR, BLE and geo-fenced checkpoints that prove a task was done at the right place and time.">
      <button class="btn-primary" (click)="openAdd()"><app-icon name="plus" [size]="16" />Add Checkpoint</button>
      <button class="btn-ghost" (click)="printTags()"><app-icon name="tasks-qr" [size]="16" />Print Tags</button>
      <button class="btn-ghost" (click)="exportLog()"><app-icon name="download" [size]="16" />Export Scan Log</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Active Checkpoints" [value]="activeCount() + ' / ' + store.checkpoints().length" icon="map-pin" color="#7c3aed" [sub]="zonesCovered() + ' zones covered'" />
      <app-tkpi label="Scans Today" [value]="totalScans()" icon="tasks-qr" color="#2563eb" [pct]="lastHour() + ''" pctColor="#2563eb" sub="in the last hour" />
      <app-tkpi label="Scan Compliance" [value]="compliance() + '%'" icon="shield-check" color="#22c55e" [sub]="'target-to-date ' + targetSoFar()" />
      <app-tkpi label="Missed Checkpoints" [value]="missed().length" icon="triangle-alert" color="#ef4444" [pct]="due().length + ''" pctColor="#d97706" sub="due within 15 min" />
      <app-tkpi label="Geo-fenced Tasks Open" [value]="geoOpen()" icon="locate" color="#06b6d4" [pct]="fenceAlerts() + ''" pctColor="#ef4444" sub="out-of-fence alerts" />
    </section>

    <section class="grid">
      <div class="card mapc">
        <div class="card-head">
          <h3>Head Office · Floor 1 <span class="card-sub">{{ visible().length }} checkpoints · {{ hhmm(store.now()) }}</span></h3>
          <div class="toolbar">
            <div class="tabs">
              <button [class.on]="tech() === 'All'" (click)="tech.set('All')">All</button>
              @for (t of techs; track t) {<button [class.on]="tech() === t" (click)="tech.set(t)">{{ t }}</button>}
            </div>
            <label class="ck"><input type="checkbox" [checked]="showRoute()" (change)="showRoute.set(!showRoute())" />Patrol route</label>
            <label class="ck"><input type="checkbox" [checked]="showFences()" (change)="showFences.set(!showFences())" />Geo-fences</label>
          </div>
        </div>
        <app-floor-plan [zones]="zones" [markers]="markers()" [paths]="paths()" [callout]="callout()" [selectedId]="selId()" [selectedZone]="zone() === 'All' ? null : zone()" [height]="470"
          (markerClick)="select($event)" (zoneClick)="zone.set(zone() === $event ? 'All' : $event)" />
        <div class="legend">
            @for (s of states; track s) {<span><i [style.background]="stateColor[s]"></i>{{ s === 'Due' ? 'Due soon' : s }} ({{ stateCount()[s] }})</span>}
          </div>

      </div>

      <div class="side">
        @if (sel(); as c) {
          @let st = stateOf(c);
          <div class="card det">
            <div class="card-head">
              <h3><span class="ti" [style.background]="stateColor[st]"><app-icon [name]="techIcon[c.tech]" [size]="15" /></span>{{ c.name }}</h3>
              <button class="close-btn" (click)="selId.set(null)">×</button>
            </div>
            <div class="ring-row">
              <app-ring [value]="pctOf(c)" [size]="64" [color]="stateColor[st]" />
              <div>
                <b>{{ c.scans }} / {{ c.expected }} scans</b>
                <small>every {{ interval(c) }} min · {{ zoneName(c.zone) }}</small>
                <span [class]="stateTag(st)">{{ st === 'Due' ? 'Due soon' : st }}@if (st === 'Missed') { · {{ lateBy(c) }} min late}</span>
              </div>
            </div>
            <div class="facts">
              <span>ID / Tech</span><b>{{ c.id }} · {{ c.tech }}</b>
              <span>Linked task</span><b>{{ tplName(c.templateId) }}</b>
              <span>Last scan</span><b>{{ c.lastScan >= 0 ? hhmm(c.lastScan) + ' · ' + c.lastBy : 'Not scanned today' }}</b>
              <span>Next due</span><b>{{ c.active ? hhmm(nextDue(c)) : '—' }}</b>
              <span>Open tasks here</span><b>{{ tasksAt(c.id).length }}</b>
            </div>
            <label class="fl">Scan as
              <select class="select" [value]="scanWho()" (change)="scanWho.set($any($event.target).value)">
                @for (w of onDuty; track w.id) {<option [value]="w.name">{{ w.name }} · {{ w.role }}</option>}
              </select>
            </label>
            <div class="row">
              <button class="btn-primary sm" [disabled]="!c.active" (click)="simulate(c)"><app-icon [name]="techIcon[c.tech]" [size]="14" />Simulate {{ c.tech === 'Geo-fence' ? 'entry' : 'scan' }}</button>
              <button class="btn-ghost sm" (click)="dispatch(c)"><app-icon name="tasks-send" [size]="14" />Dispatch task</button>
              <button class="btn-ghost sm" (click)="toggleActive(c)">{{ c.active ? 'Disable' : 'Enable' }}</button>
            </div>
            @if (tasksAt(c.id).length) {
              <ul class="mini">
                @for (t of tasksAt(c.id).slice(0, 4); track t.id) {
                  <li (click)="openTask.set(t.id)"><span [class]="statusCls(t.status)">{{ t.status }}</span><b>{{ t.title }}</b><small>{{ hhmm(t.start) }} · {{ worker(t)?.name ?? 'Unassigned' }}</small></li>
                }
              </ul>
            }
          </div>
        } @else {
          <div class="card ms">
            <div class="card-head"><h3>Missed Checkpoints <span class="count">{{ missed().length }}</span></h3>@if (missed().length) {<button class="link" (click)="dispatchAll()">Dispatch all</button>}</div>
            <ul>
              @for (c of missed(); track c.id) {
                <li>
                  <span class="ti" style="background:#ef4444"><app-icon [name]="techIcon[c.tech]" [size]="13" /></span>
                  <div (click)="select(c.id)"><b>{{ c.name }}</b><small>{{ zoneName(c.zone) }} · last {{ c.lastScan >= 0 ? hhmm(c.lastScan) : 'never' }} · {{ lateBy(c) }} min late</small></div>
                  <button class="btn-ghost sm" (click)="dispatch(c)">Dispatch</button>
                </li>
              } @empty {
                <li class="empty"><app-icon name="tasks-check-circle" [size]="18" />All checkpoints on schedule</li>
              }
            </ul>
          </div>
          <div class="card">
            <div class="card-head"><h3>Due Next</h3><span class="card-sub">next 60 min</span></div>
            <ul class="due">
              @for (c of upcoming(); track c.id) {
                <li (click)="select(c.id)"><span class="tm">{{ hhmm(nextDue(c)) }}</span><b>{{ c.name }}</b><small>{{ c.tech }}</small></li>
              } @empty {<li class="muted">Nothing due in the next hour</li>}
            </ul>
          </div>
        }
        <div class="card">
          <div class="card-head"><h3>Compliance by Technology</h3></div>
          <app-bar-list [rows]="byTech()" [max]="100" />
        </div>
      </div>
    </section>

    <section class="card reg">
        <div class="card-head">
          <h3>Checkpoint Register</h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search checkpoint..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="zone()" (change)="zone.set($any($event.target).value)"><option value="All">All Zones</option>@for (z of zones; track z.id) {<option [value]="z.id">{{ z.name }}</option>}</select>
            <select class="select" [value]="state()" (change)="state.set($any($event.target).value)"><option value="All">All States</option>@for (s of states; track s) {<option [value]="s">{{ s === 'Due' ? 'Due soon' : s }}</option>}</select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Checkpoint</th><th>Zone</th><th>Tech</th><th>Linked Task</th><th>Scans</th><th>Last Scan</th><th>Next Due</th><th>State</th><th>Active</th></tr></thead>
            <tbody>
              @for (c of visible(); track c.id) {
                @let st = stateOf(c);
                <tr class="clickable" [class.sel]="selId() === c.id" (click)="select(c.id)">
                  <td><b>{{ c.name }}</b><br /><small class="muted">{{ c.id }}</small></td>
                  <td>{{ zoneName(c.zone) }}</td>
                  <td><span class="tech"><app-icon [name]="techIcon[c.tech]" [size]="13" />{{ c.tech }}</span></td>
                  <td>{{ tplName(c.templateId) }}</td>
                  <td><span class="mini-progress"><i [style.width.%]="pctOf(c)" [style.background]="stateColor[st]"></i></span>{{ c.scans }}/{{ c.expected }}</td>
                  <td>{{ c.lastScan >= 0 ? hhmm(c.lastScan) : '—' }}<br /><small class="muted">{{ c.lastScan >= 0 ? c.lastBy : '' }}</small></td>
                  <td>{{ c.active ? hhmm(nextDue(c)) : '—' }}</td>
                  <td><span [class]="stateTag(st)">{{ st === 'Due' ? 'Due soon' : st }}</span></td>
                  <td (click)="$event.stopPropagation()"><app-tswitch [on]="c.active" (onChange)="toggleActive(c)" /></td>
                </tr>
              } @empty {<tr><td colspan="9" class="muted center">No checkpoints match the filters</td></tr>}
            </tbody>
          </table>
        </div>

    </section>

    <section class="grid3">
      <div class="card">
        <div class="card-head"><h3>Scans per Hour <span class="card-sub">actual vs. planned</span></h3></div>
        <app-column-chart [labels]="hourLabels" [series]="hourSeries()" [height]="330" />
      </div>
      <div class="card log">
        <div class="card-head"><h3>Live Scan Log</h3><em class="chip live"><i></i>Live</em></div>
        <ul>
          @for (s of scanLog().slice(0, 8); track $index) {
            <li>
              <span class="ti" [style.background]="s.result === 'Verified' ? '#16a34a' : s.result === 'Late' ? '#f59e0b' : '#ef4444'"><app-icon [name]="techIcon[s.cp.tech]" [size]="12" /></span>
              <div><b>{{ s.cp.name }}</b><small>{{ s.who }} · {{ s.method }}</small></div>
              <span class="r"><span [class]="s.result === 'Verified' ? 'tag green' : s.result === 'Late' ? 'tag amber' : 'tag red'">{{ s.result }}</span><small>{{ hhmm(s.at) }}</small></span>
            </li>
          }
        </ul>
      </div>
    </section>

    <section class="card geo">
        <div class="card-head">
          <h3>Geo-fenced &amp; Location-bound Tasks</h3>
          <div class="tabs"><button [class.on]="geoTab() === 'open'" (click)="geoTab.set('open')">Open ({{ geoOpen() }})</button><button [class.on]="geoTab() === 'done'" (click)="geoTab.set('done')">Closed</button></div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Task</th><th>Checkpoint</th><th>Assignee</th><th>Window</th><th>Location Proof</th><th></th></tr></thead>
            <tbody>
              @for (t of geoTasks().slice(0, 8); track t.id) {
                @let p = proof(t);
                <tr>
                  <td><b>{{ t.title }}</b><br /><small class="muted">{{ t.id }}</small></td>
                  <td>{{ t.location }}</td>
                  <td>{{ worker(t)?.name ?? 'Unassigned' }}</td>
                  <td>{{ hhmm(t.start) }} – {{ hhmm(t.due) }}</td>
                  <td><span [class]="p.cls">{{ p.label }}</span></td>
                  <td class="acts">
                    @if (isOpen(t) && t.checkpointId) {<button class="btn-ghost sm" (click)="scanTask(t)">Scan</button>}
                    <button class="btn-ghost sm" (click)="openTask.set(t.id)">Open</button>
                  </td>
                </tr>
              } @empty {<tr><td colspan="6" class="muted center">No tasks</td></tr>}
            </tbody>
          </table>
        </div>
    </section>

    @if (addOpen()) {
      <div class="g-overlay" (click)="addOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveCp()">
        <div class="modal-head"><h3>Add Checkpoint</h3><button type="button" class="close-btn" (click)="addOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Checkpoint name *<input class="input" [value]="fName()" (input)="fName.set($any($event.target).value)" placeholder="e.g. West Stairwell Door" /></label>
          <label>Zone<select class="select" [value]="fZone()" (change)="fZone.set($any($event.target).value)">@for (z of zones; track z.id) {<option [value]="z.id">{{ z.name }}</option>}</select></label>
          <label>Technology<select class="select" [value]="fTech()" (change)="fTech.set($any($event.target).value)">@for (t of techs; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Linked task template<select class="select" [value]="fTpl()" (change)="fTpl.set($any($event.target).value)">@for (t of tplOptions(); track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Expected scans / day<input class="input" type="number" min="1" max="24" [value]="fExp()" (input)="fExp.set(+$any($event.target).value)" /></label>
        </div>
        <p class="sum">Placed at the centre of the zone — drag-to-place is available after saving from the site map editor. Tag ID will be auto-generated.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="addOpen.set(false)">Cancel</button><button class="btn-primary" [disabled]="!fName().trim()">Save Checkpoint</button></div>
      </form>
    }
    @if (openTask(); as id) {<app-task-drawer [taskId]="id" (closed)="openTask.set(null)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .reg, .geo { margin-bottom: 12px; }
    .grid3 { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .ck { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #3b3f5c; } .ck input { accent-color: var(--primary); }
    .legend { display: flex; gap: 16px; padding: 10px 2px 0; font-size: 12px; color: #3b3f5c; flex-wrap: wrap; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .ti { width: 24px; height: 24px; border-radius: 6px; display: inline-grid; place-items: center; color: #fff; flex: none; vertical-align: middle; margin-right: 8px; }
    .det h3 { font-size: 15px; display: flex; align-items: center; }
    .ring-row { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; } .ring-row div { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; } .ring-row small { color: var(--muted); font-size: 12px; }
    .facts { display: grid; grid-template-columns: 105px 1fr; gap: 7px; font-size: 12px; margin-bottom: 10px; } .facts span { color: var(--muted); } .facts b { font-weight: 500; }
    .fl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b4f6b; margin-bottom: 10px; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn-primary.sm { padding: 6px 10px; font-size: 12px; }
    .mini { list-style: none; margin: 12px 0 0; padding: 0; border-top: 1px solid var(--border); } .mini li { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; padding: 7px 0; border-bottom: 1px solid #f1f2f7; cursor: pointer; font-size: 12px; align-items: center; }
    .mini small { grid-column: 2; color: var(--muted); font-size: 11px; }
    .count { font-size: 11px; padding: 1px 8px; border-radius: 10px; background: #fee2e2; color: #b91c1c; margin-left: 6px; }
    .ms ul, .due, .log ul { list-style: none; margin: 0; padding: 0; }
    .ms li { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f2f7; } .ms .ti { margin: 0; }
    .ms li div { cursor: pointer; display: flex; flex-direction: column; min-width: 0; } .ms b { font-size: 12.5px; } .ms small { font-size: 11px; color: var(--muted); }
    .empty { display: flex !important; gap: 8px; color: #16a34a; font-size: 12.5px; justify-content: center; padding: 18px 0 !important; }
    .due li { display: grid; grid-template-columns: 70px 1fr auto; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f1f2f7; font-size: 12px; cursor: pointer; } .due .tm { color: var(--primary); font-weight: 600; } .due small { color: var(--muted); }
    .log li { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid #f1f2f7; font-size: 12px; } .log .ti { margin: 0; }
    .log li div { display: flex; flex-direction: column; min-width: 0; } .log small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .log .r { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .tech { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    tr.sel td { background: #faf8ff; }
    .center { text-align: center; padding: 20px !important; }
    td.acts { white-space: nowrap; } td.acts button + button { margin-left: 4px; }
    .sum { font-size: 12px; color: var(--muted); margin: 12px 0 0; }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid, .grid3 { grid-template-columns: 1fr; } }
  `,
})
export class CheckpointLocationTasks {
  protected readonly store = inject(TaskStore);
  protected readonly hhmm = hhmm;
  protected readonly isOpen = isOpen;
  protected readonly statusCls = statusCls;
  protected readonly techs = TECHS;
  protected readonly techIcon = TECH_ICON;
  protected readonly stateColor = STATE_COLOR;
  protected readonly states: CpState[] = ['OK', 'Due', 'Missed', 'Disabled'];
  protected readonly zones = TASK_ZONES;
  protected readonly onDuty = WORKERS.filter((w) => w.status !== 'Off Duty');
  protected readonly hourLabels = Array.from({ length: 12 }, (_, i) => `${String(6 + i).padStart(2, '0')}:00`);

  protected readonly tech = signal<string>('All');
  protected readonly zone = signal<string>('All');
  protected readonly state = signal<string>('All');
  protected readonly q = signal('');
  protected readonly selId = signal<string | null>(null);
  protected readonly showRoute = signal(true);
  protected readonly showFences = signal(true);
  protected readonly scanWho = signal(this.onDuty[2].name);
  protected readonly geoTab = signal<'open' | 'done'>('open');
  protected readonly openTask = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly fName = signal('');
  protected readonly fZone = signal('cor');
  protected readonly fTech = signal<string>('QR');
  protected readonly fTpl = signal('TPL-0002');
  protected readonly fExp = signal(4);

  protected readonly tplOptions = computed(() => this.store.published().filter((t) => t.status === 'Active').slice(0, 40));
  private readonly tplNames = computed(() => new Map(this.store.templates().map((t) => [t.id, t.name])));
  protected readonly sel = computed(() => this.store.checkpoints().find((c) => c.id === this.selId()) ?? null);
  protected readonly activeCount = computed(() => this.store.checkpoints().filter((c) => c.active).length);
  protected readonly zonesCovered = computed(() => new Set(this.store.checkpoints().filter((c) => c.active).map((c) => c.zone)).size);
  protected readonly totalScans = computed(() => this.store.checkpoints().reduce((a, c) => a + c.scans, 0));
  protected readonly targetSoFar = computed(() => this.store.checkpoints().filter((c) => c.active).reduce((a, c) => a + this.expectedSoFar(c), 0));
  protected readonly compliance = computed(() => {
    const act = this.store.checkpoints().filter((c) => c.active);
    const got = act.reduce((a, c) => a + Math.min(c.scans, this.expectedSoFar(c)), 0);
    return Math.round((got / Math.max(this.targetSoFar(), 1)) * 100);
  });
  protected readonly missed = computed(() => this.store.checkpoints().filter((c) => this.stateOf(c) === 'Missed').sort((a, b) => this.lateBy(b) - this.lateBy(a)));
  protected readonly due = computed(() => this.store.checkpoints().filter((c) => this.stateOf(c) === 'Due'));
  protected readonly upcoming = computed(() =>
    this.store.checkpoints().filter((c) => c.active && this.stateOf(c) !== 'Missed' && this.nextDue(c) <= this.store.now() + 60).sort((a, b) => this.nextDue(a) - this.nextDue(b)).slice(0, 6),
  );
  protected readonly stateCount = computed(() => {
    const m: Record<CpState, number> = { OK: 0, Due: 0, Missed: 0, Disabled: 0 };
    for (const c of this.store.checkpoints()) m[this.stateOf(c)]++;
    return m;
  });
  protected readonly visible = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.checkpoints().filter(
      (c) =>
        (this.tech() === 'All' || c.tech === this.tech()) &&
        (this.zone() === 'All' || c.zone === this.zone()) &&
        (this.state() === 'All' || this.stateOf(c) === this.state()) &&
        (!q || `${c.name} ${c.id} ${this.zoneName(c.zone)}`.toLowerCase().includes(q)),
    );
  });
  protected readonly markers = computed<MapMarker[]>(() =>
    this.visible().map((c) => {
      const st = this.stateOf(c);
      return { id: c.id, x: c.x, y: c.y, kind: 'icon', icon: TECH_ICON[c.tech], color: STATE_COLOR[st], pulse: st === 'Missed' || c.id === this.selId(), size: c.id === this.selId() ? 17 : 13, title: `${c.name} · ${c.tech} · ${st}` };
    }),
  );
  protected readonly paths = computed<MapPath[]>(() => {
    const out: MapPath[] = [];
    if (this.showFences())
      for (const c of this.store.checkpoints().filter((x) => x.tech === 'Geo-fence' || x.tech === 'BLE Beacon'))
        out.push({ points: Array.from({ length: 33 }, (_, i) => [c.x + 36 * Math.cos((i / 32) * 2 * Math.PI), c.y + 36 * Math.sin((i / 32) * 2 * Math.PI)] as [number, number]), color: c.tech === 'Geo-fence' ? '#0ea5e9' : '#6366f1', dashed: true, width: 2 });
    if (!this.showRoute()) return out;
    const route = this.store.checkpoints().filter((c) => c.templateId === 'TPL-0002' && c.active);
    if (route.length > 1) out.push({ points: route.map((c) => [c.x, c.y] as [number, number]), color: '#7c3aed', dashed: true, arrow: true, width: 2.5 });
    return out;
  });
  protected readonly callout = computed<MapCallout | null>(() => {
    const c = this.sel();
    if (!c) return null;
    return { x: c.x, y: c.y, title: c.name, lines: [`${c.scans}/${c.expected} scans · ${this.stateOf(c)}`, c.lastScan >= 0 ? `Last ${hhmm(c.lastScan)} · ${c.lastBy}` : 'Not scanned today'], icon: TECH_ICON[c.tech], color: STATE_COLOR[this.stateOf(c)] };
  });
  protected readonly byTech = computed(() =>
    TECHS.map((t, i) => {
      const l = this.store.checkpoints().filter((c) => c.tech === t && c.active);
      const exp = l.reduce((a, c) => a + this.expectedSoFar(c), 0);
      const got = l.reduce((a, c) => a + Math.min(c.scans, this.expectedSoFar(c)), 0);
      const v = exp ? Math.round((got / exp) * 100) : 100;
      return { label: `${t} (${l.length})`, value: l.length ? v : 0, display: l.length ? v + '%' : 'n/a', color: ['#7c3aed', '#2563eb', '#6366f1', '#0ea5e9'][i] };
    }),
  );
  protected readonly scanLog = computed<ScanRow[]>(() => {
    const out: ScanRow[] = [];
    this.store.checkpoints().forEach((c, ci) => {
      if (c.lastScan < 0) return;
      const iv = this.interval(c);
      for (let k = 0; k < c.scans; k++) {
        const at = c.lastScan - k * iv - ((k * 7 + ci) % 9);
        if (at < DAY0) break;
        const who = k === 0 ? c.lastBy : WORKERS[(ci * 3 + k * 5) % WORKERS.length].name;
        const result: ScanRow['result'] = c.tech === 'Geo-fence' && (k + ci) % 5 === 3 ? 'Out of fence' : (k * 3 + ci) % 11 === 4 ? 'Late' : 'Verified';
        out.push({ at: k === 0 ? c.lastScan : at, cp: c, who, result, method: c.tech === 'Geo-fence' ? 'GPS geo-fence entry' : c.tech === 'BLE Beacon' ? 'BLE proximity' : `${c.tech} tag scan` });
      }
    });
    return out.sort((a, b) => b.at - a.at);
  });
  protected readonly lastHour = computed(() => this.scanLog().filter((s) => s.at > this.store.now() - 60).length);
  protected readonly hourSeries = computed(() => {
    const act = Array(12).fill(0);
    for (const s of this.scanLog()) {
      const h = Math.floor((s.at - DAY0) / 60);
      if (h >= 0 && h < 12) act[h]++;
    }
    const perHour = this.store.checkpoints().filter((c) => c.active).reduce((a, c) => a + c.expected / 16, 0);
    const plan = act.map((_, i) => Math.round(perHour * (i % 4 === 2 ? 1.2 : 1)));
    const nowH = Math.floor((this.store.now() - DAY0) / 60);
    return [
      { name: 'Scans', color: '#7c3aed', values: act.map((v, i) => (i > nowH ? 0 : v)) },
      { name: 'Planned', color: '#c4b5fd', values: plan, line: true },
    ];
  });
  private readonly geoAll = computed(() => this.store.tasks().filter((t) => t.checkpointId));
  protected readonly geoOpen = computed(() => this.geoAll().filter(isOpen).length);
  protected readonly fenceAlerts = computed(() => this.geoAll().filter((t) => t.status === 'In Progress' && this.outOfFence(t)).length);
  protected readonly geoTasks = computed(() => {
    const l = this.geoAll().filter((t) => (this.geoTab() === 'open' ? isOpen(t) : !isOpen(t)));
    return this.geoTab() === 'open' ? l.sort((a, b) => a.due - b.due) : l.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  });

  /** Minutes between expected scans (spread over a 16 h day, capped to 4 h). */
  protected interval(c: Checkpoint) {
    return Math.min(240, Math.round(960 / c.expected));
  }
  private expectedSoFar(c: Checkpoint) {
    return Math.min(c.expected, Math.floor((this.store.now() - DAY0) / this.interval(c)));
  }
  protected nextDue(c: Checkpoint) {
    return (c.lastScan >= 0 ? c.lastScan : DAY0) + this.interval(c);
  }
  protected lateBy(c: Checkpoint) {
    return Math.max(0, this.store.now() - this.nextDue(c));
  }
  protected stateOf(c: Checkpoint): CpState {
    if (!c.active) return 'Disabled';
    const n = this.store.now();
    const due = this.nextDue(c);
    if (n > due + GRACE) return 'Missed';
    if (n >= due - GRACE) return 'Due';
    return 'OK';
  }
  protected stateTag(s: CpState) {
    return s === 'OK' ? 'tag green' : s === 'Due' ? 'tag amber' : s === 'Missed' ? 'tag red' : 'tag grey';
  }
  protected pctOf(c: Checkpoint) {
    return Math.min(100, Math.round((c.scans / c.expected) * 100));
  }
  protected zoneName(id: string) {
    return TASK_ZONES.find((z) => z.id === id)?.name ?? id;
  }
  protected tplName(id: string) {
    return this.tplNames().get(id) ?? id;
  }
  protected worker(t: TaskItem) {
    return workerById(t.assignee);
  }
  protected tasksAt(cpId: string) {
    return this.store.tasks().filter((t) => t.checkpointId === cpId).sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.start - b.start);
  }
  private outOfFence(t: TaskItem) {
    return +t.id.slice(4) % 7 === 0;
  }
  protected proof(t: TaskItem) {
    if (!isOpen(t)) return t.status === 'Rejected' ? { label: 'Scan ok · rejected', cls: 'tag red' } : { label: 'Scan verified', cls: 'tag green' };
    if (t.status === 'In Progress') return this.outOfFence(t) ? { label: 'Out of geo-fence', cls: 'tag red' } : { label: 'On site · awaiting end scan', cls: 'tag blue' };
    return t.due < this.store.now() ? { label: 'No scan – overdue', cls: 'tag red' } : { label: 'Awaiting start scan', cls: 'tag amber' };
  }
  protected select(id: string) {
    this.selId.set(this.selId() === id ? null : id);
  }
  protected simulate(c: Checkpoint) {
    const late = this.stateOf(c) === 'Missed';
    this.store.scan(c.id, this.scanWho());
    const t = this.store.tasks().find((x) => x.checkpointId === c.id && x.status === 'Pending' && x.assignee);
    if (t) this.store.start(t.id, this.scanWho());
    this.say(`${c.name} ${c.tech === 'Geo-fence' ? 'geo-fence entry' : c.tech + ' scan'} verified${late ? ' (late)' : ''}${t ? ' · ' + t.title + ' started' : ''}`);
  }
  protected scanTask(t: TaskItem) {
    const who = workerById(t.assignee)?.name ?? this.scanWho();
    this.store.scan(t.checkpointId!, who);
    if (t.status === 'In Progress') this.store.complete(t.id, who);
    else if (t.assignee) this.store.start(t.id, who);
    this.say(`${t.location} scanned · ${t.title} ${t.status === 'In Progress' ? 'completed' : t.assignee ? 'started' : 'location confirmed'}`);
  }
  private nearest(c: Checkpoint) {
    const role = this.store.templates().find((t) => t.id === c.templateId)?.applicableTo;
    const load = (id: string) => this.store.tasks().filter((t) => t.assignee === id && isOpen(t)).length;
    return [...this.onDuty].sort((a, b) => Number(b.role === role) - Number(a.role === role) || load(a.id) - load(b.id))[0];
  }
  protected dispatch(c: Checkpoint) {
    const tp = this.store.templates().find((t) => t.id === c.templateId)!;
    const w = this.nearest(c);
    this.store.addTask(tp, { location: c.name, checkpointId: c.id, assignee: w.id, start: this.store.now(), due: this.store.now() + 30, priority: 'High', source: 'Manual' });
    this.say(`${tp.name} dispatched to ${w.name} for ${c.name} · push sent`);
  }
  protected dispatchAll() {
    const l = this.missed();
    l.forEach((c) => this.dispatch(c));
    this.say(`${l.length} recovery tasks dispatched for missed checkpoints`);
  }
  protected toggleActive(c: Checkpoint) {
    this.store.checkpoints.update((l) => l.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    this.store.log(`Checkpoint ${c.name} ${c.active ? 'disabled' : 'enabled'}`, 'Rex Kumar', 'map-pin', '#64748b');
    this.say(`${c.name} ${c.active ? 'disabled' : 'enabled'}`);
  }
  protected openAdd() {
    this.fName.set('');
    this.addOpen.set(true);
  }
  protected saveCp() {
    const z = TASK_ZONES.find((x) => x.id === this.fZone())!;
    const n = this.store.checkpoints().length;
    const id = `CP-${101 + n}`;
    const cp: Checkpoint = {
      id, name: this.fName().trim(), zone: z.id, x: z.x + z.w / 2 + ((n * 23) % 50) - 25, y: z.y + z.h / 2 - 20 + ((n * 17) % 30), tech: this.fTech() as Checkpoint['tech'],
      templateId: this.fTpl(), expected: Math.max(1, this.fExp()), scans: 0, lastScan: -1, lastBy: '', active: true,
    };
    this.store.checkpoints.update((l) => [...l, cp]);
    this.store.log(`Checkpoint ${cp.name} added (${cp.tech})`, 'Rex Kumar', 'map-pin', '#7c3aed');
    this.addOpen.set(false);
    this.selId.set(id);
    this.say(`${cp.name} added · tag ${id} ready to print`);
  }
  protected printTags() {
    const l = this.visible().filter((c) => c.tech === 'QR' || c.tech === 'NFC');
    downloadCsv('checkpoint-tags.csv', [['Checkpoint ID', 'Name', 'Zone', 'Technology', 'Tag payload'], ...l.map((c) => [c.id, c.name, this.zoneName(c.zone), c.tech, `p360://cp/${c.id}`])]);
    this.say(`${l.length} QR / NFC tag labels sent to print queue`);
  }
  protected exportLog() {
    downloadCsv('checkpoint-scan-log.csv', [['Time', 'Checkpoint', 'Zone', 'Technology', 'Scanned by', 'Method', 'Result'], ...this.scanLog().map((s) => [hhmm(s.at), s.cp.name, this.zoneName(s.cp.zone), s.cp.tech, s.who, s.method, s.result])]);
    this.say('Scan log exported');
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
