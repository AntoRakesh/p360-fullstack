// SLA & Escalations — SLA policies, live breach / at-risk queue with countdowns, escalation matrix, escalate / reassign.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { TaskDrawer } from './task-drawer';
import { TASKS_UI } from './tasks-ui';
import { CAT_NAMES, catMeta, catOf, ESCALATION_ROLES, hhmm, isOpen, PRIORITIES, prioCls, SlaPolicy, TaskItem, TaskStore, workerById, WORKERS } from './tasks.data';

type Tab = 'breached' | 'risk' | 'escalated' | 'open';
const RISK = 15;
const DAYS = ['01 Oct', '02 Oct', '03 Oct', '04 Oct', '05 Oct', '06 Oct', '07 Oct', '08 Oct', '09 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct'];
const TREND_BREACH = [14, 11, 18, 9, 7, 16, 13, 12, 19, 10, 8, 15, 12];
const TREND_COMPL = [94.1, 95.2, 92.6, 96.0, 96.8, 93.4, 94.6, 94.9, 92.1, 95.6, 96.3, 93.8, 94.7];
const CHANNELS = ['Push', 'SMS', 'Email', 'WhatsApp', 'Call'];

@Component({
  selector: 'app-tasks-sla-escalations',
  imports: [...UI, ...TASKS_UI, TaskDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="SLA &amp; Escalations" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Response and resolution SLAs per task type, live breach countdowns and multi-level escalation rules.">
      <button class="btn-primary" (click)="newPolicy()"><app-icon name="plus" [size]="16" />New SLA Policy</button>
      <button class="btn-ghost" [disabled]="!breachedNotMax().length" (click)="escalateAll()"><app-icon name="tasks-escalate" [size]="16" />Escalate all breached ({{ breachedNotMax().length }})</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="SLA Compliance (Today)" [value]="compliance() + '%'" icon="shield-check" color="#22c55e" change="1.4%" sub="vs. 7-day avg" />
      <app-tkpi label="Breached (Open)" [value]="breached().length" icon="triangle-alert" color="#ef4444" [pct]="closedLate() + ''" pctColor="#b91c1c" sub="closed late today" />
      <app-tkpi label="At Risk (< 15 min)" [value]="atRisk().length" icon="tasks-timer" color="#f59e0b" sub="will breach soon" />
      <app-tkpi label="Escalated" [value]="escalated().length" icon="tasks-escalate" color="#7c3aed" [pct]="'L2: ' + l2()" pctColor="#b91c1c" sub="open escalations" />
      <app-tkpi label="Avg Response Time" [value]="avgResponse() + ' min'" icon="clock" color="#2563eb" change="2.1m" [up]="false" sub="vs. last week" />
    </section>

    <section class="grid">
      <div class="card queue">
        <div class="card-head">
          <h3>Live SLA Queue <em class="chip live"><i></i>Live</em></h3>
          <div class="toolbar">
            <div class="tabs">
              <button [class.on]="tab() === 'breached'" (click)="setTab('breached')">Breached ({{ breached().length }})</button>
              <button [class.on]="tab() === 'risk'" (click)="setTab('risk')">At Risk ({{ atRisk().length }})</button>
              <button [class.on]="tab() === 'escalated'" (click)="setTab('escalated')">Escalated ({{ escalated().length }})</button>
              <button [class.on]="tab() === 'open'" (click)="setTab('open')">All Open ({{ open().length }})</button>
            </div>
            <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option value="All">All Categories</option>@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select>
          </div>
        </div>
        @if (sel().size) {
          <div class="bulk">
            <b>{{ sel().size }} selected</b>
            <button class="btn-ghost sm" (click)="bulkEscalate()"><app-icon name="tasks-escalate" [size]="13" />Escalate</button>
            <button class="btn-ghost sm" (click)="bulkExtend()"><app-icon name="clock" [size]="13" />+15 min</button>
            <select class="select xs" (change)="bulkAssign($any($event.target).value); $any($event.target).value = ''"><option value="">Reassign to…</option>@for (w of onDuty; track w.id) {<option [value]="w.id">{{ w.name }} · {{ w.role }}</option>}</select>
            <button class="link" (click)="clearSel()">Clear</button>
          </div>
        }
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th class="cb"><input type="checkbox" [checked]="allSel()" (change)="toggleAll()" /></th>
              <th>Task</th><th>Assignee</th><th>SLA Timer</th><th>Priority / Level</th><th class="r">Actions</th>
            </tr></thead>
            <tbody>
              @for (t of pageRows(); track t.id) {
                @let left = secsLeft(t);
                <tr [class.br]="left < 0" [class.rk]="left >= 0 && left < 900">
                  <td class="cb"><input type="checkbox" [checked]="sel().has(t.id)" (change)="toggleSel(t.id)" /></td>
                  <td class="tk" (click)="drawer.set(t.id)">
                    <span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="13" /></span>
                    <span><b>{{ t.title }}</b><small>{{ t.id }} · {{ t.location }} · {{ policyFor(t)?.name ?? 'Template SLA' }}</small></span>
                  </td>
                  <td>
                    <select class="select xs" [value]="t.assignee ?? ''" (change)="reassign(t, $any($event.target).value)">
                      <option value="" disabled>Unassigned</option>
                      @for (w of onDuty; track w.id) {<option [value]="w.id">{{ w.name }}</option>}
                    </select>
                  </td>
                  <td>
                    <span class="timer" [class.neg]="left < 0" [class.warn]="left >= 0 && left < 900">{{ left < 0 ? '−' : '' }}{{ clock(left) }}</span>
                    <span class="tbar"><i [style.width.%]="usedPct(t)" [style.background]="left < 0 ? '#ef4444' : left < 900 ? '#f59e0b' : '#22c55e'"></i></span><small class="due">due {{ hhmm(t.due) }}</small>
                  </td>
                  <td><span [class]="prioCls(t.priority)">{{ t.priority }}</span><br />@if (t.escalation) {<span class="lvl red">L{{ t.escalation }} · {{ escTo(t) }}</span>} @else {<span class="lvl">L0 · Assignee</span>}</td>
                  <td class="r acts">
                    <button class="btn-ghost sm ib" [disabled]="t.escalation >= 2" (click)="escalate(t)" title="Escalate to next level" aria-label="Escalate"><app-icon name="tasks-escalate" [size]="14" /></button>
                    <button class="btn-ghost sm ib" (click)="extend(t)" title="Extend SLA by 15 minutes" aria-label="Extend 15 minutes"><app-icon name="clock" [size]="14" /></button>
                    <button class="btn-ghost sm ib" (click)="drawer.set(t.id)" title="Open task" aria-label="Open task"><app-icon name="eye" [size]="14" /></button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="center"><app-icon name="tasks-check-circle" [size]="18" /> Nothing in this queue right now</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pager"><span>{{ rows().length }} tasks</span>
          <span><button class="btn-ghost sm" [disabled]="pg() === 0" (click)="pg.set(pg() - 1)">Prev</button> {{ pg() + 1 }} / {{ pages() }} <button class="btn-ghost sm" [disabled]="pg() >= pages() - 1" (click)="pg.set(pg() + 1)">Next</button></span>
        </div>
      </div>

      <div class="side">
        <div class="card matrix">
          <div class="card-head">
            <h3>Escalation Matrix</h3>
            <select class="select xs" [value]="polId()" (change)="polId.set($any($event.target).value)">@for (p of store.policies(); track p.id) {<option [value]="p.id">{{ p.name }}</option>}</select>
          </div>
          @if (policy(); as p) {
            <ol class="ladder">
              <li><span class="lv" style="background:#22c55e">L0</span><div><b>Assignee</b><small>Push reminder at {{ p.response }} min with no start</small></div><em>{{ countAt(p, 0) }}</em></li>
              <li><span class="lv" style="background:#f59e0b">L1</span><div><b>{{ p.l1 }}</b><small>{{ p.l1After ? p.l1After + ' min after breach' : 'Immediately on breach' }} · {{ p.notify.join(', ') }}</small></div><em>{{ countAt(p, 1) }}</em></li>
              <li><span class="lv" style="background:#ef4444">L2</span><div><b>{{ p.l2 }}</b><small>{{ p.l2After }} min after breach · SMS + Call</small></div><em>{{ countAt(p, 2) }}</em></li>
              <li><span class="lv" style="background:#1e1b3a">L3</span><div><b>Operations Director</b><small>Repeat breach &gt; 3 in a shift · daily digest</small></div><em>0</em></li>
            </ol>
            <div class="pfacts">
              <span>Response<b>{{ p.response }} min</b></span><span>Resolve<b>{{ p.resolve }} min</b></span><span>Priority<b>{{ p.priority }}</b></span>
            </div>
            <button class="btn-ghost sm full" (click)="edit(p)"><app-icon name="tasks-pencil" [size]="13" />Edit policy</button>
          }
        </div>
        <div class="card">
          <div class="card-head"><h3>Escalations by Level</h3></div>
          <app-donut [segments]="levelSegs()" center="Open tasks" [size]="130" />
        </div>
      </div>
    </section>

    <section class="card pol">
        <div class="card-head"><h3>SLA Policies <span class="card-sub">{{ activePolicies() }} active</span></h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Policy</th><th>Category</th><th>Priority</th><th class="num">Response</th><th class="num">Resolve</th><th>L1 → L2</th><th>Notify</th><th class="num">Today</th><th>Active</th><th></th></tr></thead>
            <tbody>
              @for (p of store.policies(); track p.id) {
                @let st = polStats(p);
                <tr [class.sel]="polId() === p.id" (click)="polId.set(p.id)" class="clickable">
                  <td><b>{{ p.name }}</b><br /><small class="muted">{{ p.id }}</small></td>
                  <td>{{ p.category }}</td>
                  <td><span [class]="prioCls(p.priority)">{{ p.priority }}</span></td>
                  <td class="num">{{ p.response }}m</td><td class="num">{{ p.resolve }}m</td>
                  <td><small>{{ p.l1 }} ({{ p.l1After }}m) → {{ p.l2 }} ({{ p.l2After }}m)</small></td>
                  <td>@for (n of p.notify; track n) {<span class="chip-s">{{ n }}</span>}</td>
                  <td class="num"><span [style.color]="st.pct < 90 ? '#b91c1c' : '#15803d'">{{ st.pct }}%</span><br /><small class="muted">{{ st.n }} tasks</small></td>
                  <td (click)="$event.stopPropagation()"><app-tswitch [on]="p.active" (onChange)="togglePolicy(p, $event)" /></td>
                  <td (click)="$event.stopPropagation()"><button class="btn-ghost sm" (click)="edit(p)">Edit</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
    </section>

    <section class="grid3">
      <div class="card">
        <div class="card-head"><h3>SLA Breaches Trend <span class="card-sub">last 14 days · avg compliance {{ avgCompl }}%</span></h3></div>
        <app-column-chart [labels]="days" [series]="trend()" [height]="230" [legend]="false" />
      </div>
      <div class="card">
        <div class="card-head"><h3>SLA Compliance by Category</h3><span class="card-sub">today</span></div>
        <app-bar-list [rows]="byCat()" [max]="100" />
      </div>
      <div class="card esclog">
        <div class="card-head"><h3>Escalation Log</h3><span class="card-sub">{{ escLog().length }} today</span></div>
        <ul>
          @for (e of escLog().slice(0, 9); track $index) {
            <li><span class="fi" [style.background]="e.color + '1a'" [style.color]="e.color"><app-icon [name]="e.icon" [size]="13" /></span><div><span>{{ e.text }}</span><small>{{ e.who }} · {{ hhmm(e.at) }}</small></div></li>
          } @empty {<li class="muted">No escalations yet</li>}
        </ul>
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); savePolicy()">
        <div class="modal-head"><h3>{{ isNew() ? 'New SLA Policy' : 'Edit ' + f.name }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Policy name *<input class="input" [value]="f.name" (input)="patch({ name: $any($event.target).value })" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="patch({ category: $any($event.target).value })">@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Priority<select class="select" [value]="f.priority" (change)="patch({ priority: $any($event.target).value })">@for (p of priorities; track p) {<option [value]="p">{{ p }}</option>}</select></label>
          <label>Response target (min)<input class="input" type="number" min="1" [value]="f.response" (input)="patch({ response: +$any($event.target).value })" /></label>
          <label>Resolution target (min)<input class="input" type="number" min="5" [value]="f.resolve" (input)="patch({ resolve: +$any($event.target).value })" /></label>
          <label>Level 1 escalates to<select class="select" [value]="f.l1" (change)="patch({ l1: $any($event.target).value })">@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
          <label>L1 after breach (min)<input class="input" type="number" min="0" [value]="f.l1After" (input)="patch({ l1After: +$any($event.target).value })" /></label>
          <label>Level 2 escalates to<select class="select" [value]="f.l2" (change)="patch({ l2: $any($event.target).value })">@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
          <label>L2 after breach (min)<input class="input" type="number" min="0" [value]="f.l2After" (input)="patch({ l2After: +$any($event.target).value })" /></label>
          <div class="full chans">Notify via
            @for (c of channels; track c) {<label class="ck"><input type="checkbox" [checked]="f.notify.includes(c)" (change)="toggleChan(c)" />{{ c }}</label>}
          </div>
        </div>
        @if (f.l2After <= f.l1After) {<p class="warn-t">Level 2 should trigger after Level 1.</p>}
        <div class="form-actions">
          @if (!isNew()) {<button type="button" class="btn-ghost danger" (click)="deletePolicy(f)">Delete</button>}
          <button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button>
          <button class="btn-primary" [disabled]="!f.name.trim() || f.l2After <= f.l1After">Save Policy</button>
        </div>
      </form>
    }
    @if (drawer(); as id) {<app-task-drawer [taskId]="id" (closed)="drawer.set(null)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .pol { margin-bottom: 12px; }
    .grid3 { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    .queue h3 { display: flex; align-items: center; gap: 8px; }
    .bulk { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 10px; background: #f5f3ff; border-radius: 8px; font-size: 12.5px; flex-wrap: wrap; }
    .xs { padding: 4px 24px 4px 8px; font-size: 11.5px; max-width: 150px; }
    .cb { width: 28px; } .cb input { accent-color: var(--primary); }
    .tk { cursor: pointer; display: flex; gap: 8px; align-items: center; } .tk > span:last-child { display: flex; flex-direction: column; gap: 2px; } .tk b { font-size: 12.5px; } .tk small { font-size: 11px; color: var(--muted); }
    .ci { width: 24px; height: 24px; border-radius: 6px; display: inline-grid; place-items: center; color: #fff; flex: none; }
    tr.br td { background: #fff7f7; } tr.rk td { background: #fffbeb; }
    .timer { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: #15803d; display: block; } .timer.warn { color: #b45309; } .timer.neg { color: #dc2626; }
    .tbar { display: block; width: 90px; height: 4px; border-radius: 3px; background: #eef0f5; overflow: hidden; margin-top: 3px; } .tbar i { display: block; height: 100%; }
    .r { text-align: right; } .lvl { font-size: 11px; color: var(--muted); white-space: nowrap; } .lvl.red { color: #b91c1c; font-weight: 600; } .acts { white-space: nowrap; } .acts button + button { margin-left: 4px; } .ib { padding: 5px 7px; } .due { display: block; font-size: 10.5px; color: var(--muted); margin-top: 2px; }
    .center { text-align: center; padding: 22px !important; color: #16a34a; }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12.5px; color: #4b4f6b; } .pager button { margin: 0 4px; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .ladder { list-style: none; margin: 0 0 12px; padding: 0; position: relative; }
    .ladder::before { content: ''; position: absolute; left: 15px; top: 16px; bottom: 16px; width: 2px; background: #e5e7ef; }
    .ladder li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; position: relative; }
    .lv { width: 32px; height: 32px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; box-shadow: 0 0 0 3px #fff; }
    .ladder div { display: flex; flex-direction: column; } .ladder b { font-size: 12.5px; } .ladder small { font-size: 11px; color: var(--muted); }
    .ladder em { font-style: normal; font-size: 12px; font-weight: 600; background: #f3f3f8; border-radius: 10px; padding: 1px 8px; }
    .pfacts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; } .pfacts span { display: flex; flex-direction: column; font-size: 11px; color: var(--muted); background: #fafafe; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; } .pfacts b { font-size: 13px; color: var(--text); }
    .full { width: 100%; justify-content: center; }
    tr.sel td { background: #faf8ff; }
    .esclog ul { list-style: none; margin: 0; padding: 0; } .esclog li { display: grid; grid-template-columns: 26px 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f1f2f7; font-size: 12px; }
    .fi { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; } .esclog li > div { display: flex; flex-direction: column; } .esclog small { color: var(--muted); font-size: 11px; }
    .chans { display: flex; gap: 14px; align-items: center; font-size: 12px; color: #4b4f6b; flex-wrap: wrap; }
    .ck { display: flex !important; flex-direction: row !important; align-items: center; gap: 6px !important; } .ck input { accent-color: var(--primary); }
    .warn-t { color: #b91c1c; font-size: 12px; margin: 10px 0 0; }
    .danger { color: var(--red); margin-right: auto; }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid, .grid3 { grid-template-columns: 1fr; } }
  `,
})
export class SLAEscalations {
  protected readonly store = inject(TaskStore);
  private readonly app = inject(AppState);
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly prioCls = prioCls;
  protected readonly cats = CAT_NAMES;
  protected readonly priorities = PRIORITIES;
  protected readonly roles = ESCALATION_ROLES;
  protected readonly channels = CHANNELS;
  protected readonly days = DAYS;
  protected readonly avgCompl = (TREND_COMPL.reduce((a, b) => a + b, 0) / TREND_COMPL.length).toFixed(1);
  protected readonly onDuty = WORKERS.filter((w) => w.status !== 'Off Duty');

  protected readonly tab = signal<Tab>('open');
  protected readonly cat = signal('All');
  protected readonly pg = signal(0);
  protected readonly sel = signal<Set<string>>(new Set());
  protected readonly polId = signal('SLA-02');
  protected readonly drawer = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly form = signal<SlaPolicy | null>(null);
  protected readonly isNew = signal(false);

  protected readonly open = computed(() => this.store.tasks().filter(isOpen));
  protected readonly breached = computed(() => this.open().filter((t) => t.due < this.store.now()));
  protected readonly breachedNotMax = computed(() => this.breached().filter((t) => t.escalation < 2));
  protected readonly atRisk = computed(() => this.open().filter((t) => t.due >= this.store.now() && t.due - this.store.now() < RISK));
  protected readonly escalated = computed(() => this.open().filter((t) => t.escalation > 0));
  protected readonly l2 = computed(() => this.escalated().filter((t) => t.escalation === 2).length);
  private readonly closed = computed(() => this.store.tasks().filter((t) => !isOpen(t) && t.completedAt != null));
  protected readonly closedLate = computed(() => this.closed().filter((t) => t.completedAt! > t.due).length);
  protected readonly compliance = computed(() => {
    const total = this.closed().length + this.breached().length;
    return +(((this.closed().length - this.closedLate()) / Math.max(total, 1)) * 100).toFixed(1);
  });
  protected readonly avgResponse = computed(() => {
    const l = this.store.tasks().filter((t) => t.startedAt != null);
    return (l.reduce((a, t) => a + Math.max(0, t.startedAt! - t.start), 0) / Math.max(l.length, 1)).toFixed(1);
  });
  protected readonly rows = computed(() => {
    const src = this.tab() === 'breached' ? this.breached() : this.tab() === 'risk' ? this.atRisk() : this.tab() === 'escalated' ? this.escalated() : this.open();
    return src.filter((t) => this.cat() === 'All' || catOf(t.category) === this.cat()).sort((a, b) => a.due - b.due);
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / 10)));
  protected readonly pageRows = computed(() => this.rows().slice(Math.min(this.pg(), this.pages() - 1) * 10, Math.min(this.pg(), this.pages() - 1) * 10 + 10));
  protected readonly allSel = computed(() => this.pageRows().length > 0 && this.pageRows().every((t) => this.sel().has(t.id)));
  protected readonly policy = computed(() => this.store.policies().find((p) => p.id === this.polId()) ?? this.store.policies()[0]);
  protected readonly activePolicies = computed(() => this.store.policies().filter((p) => p.active).length);
  protected readonly levelSegs = computed(() => {
    const o = this.open();
    return [
      { label: 'No escalation', value: o.filter((t) => !t.escalation).length, color: '#22c55e' },
      { label: 'L1 – Supervisor', value: o.filter((t) => t.escalation === 1).length, color: '#f59e0b' },
      { label: 'L2 – Manager', value: o.filter((t) => t.escalation === 2).length, color: '#ef4444' },
    ];
  });
  protected readonly byCat = computed(() =>
    CAT_NAMES.map((c) => {
      const cl = this.closed().filter((t) => catOf(t.category) === c);
      const br = this.breached().filter((t) => catOf(t.category) === c).length;
      const ok = cl.filter((t) => t.completedAt! <= t.due).length;
      const v = cl.length + br ? Math.round((ok / (cl.length + br)) * 100) : 100;
      return { label: c, value: v, display: v + '%', color: v >= 95 ? '#22c55e' : v >= 85 ? '#f59e0b' : '#ef4444' };
    }),
  );
  protected readonly trend = computed(() => [
    { name: 'Breaches', color: '#f87171', values: [...TREND_BREACH, this.breached().length + this.closedLate()] },
  ]);
  protected readonly escLog = computed(() => this.store.events().filter((e) => e.icon === 'tasks-escalate' || /SLA extended|reassigned|assigned to/.test(e.text)));

  /** Seconds to SLA deadline; sub-minute part derived from the 2.5 s live tick. */
  protected secsLeft(t: TaskItem) {
    return (t.due - this.store.now()) * 60 - (this.app.tick() % 4) * 15;
  }
  protected clock(s: number) {
    const a = Math.abs(s);
    const h = Math.floor(a / 3600);
    const m = Math.floor((a % 3600) / 60);
    const ss = a % 60;
    return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  protected usedPct(t: TaskItem) {
    const span = Math.max(t.due - t.start, 1);
    return Math.min(100, Math.max(4, ((this.store.now() - t.start) / span) * 100));
  }
  protected policyFor(t: TaskItem) {
    return this.store.policies().find((p) => p.active && p.category === catOf(t.category));
  }
  protected escTo(t: TaskItem) {
    const p = this.policyFor(t);
    const tp = this.store.templates().find((x) => x.id === t.templateId);
    return t.escalation === 1 ? (p?.l1 ?? tp?.escL1) : (p?.l2 ?? tp?.escL2);
  }
  protected countAt(p: SlaPolicy, lvl: number) {
    return this.open().filter((t) => catOf(t.category) === p.category && t.escalation === lvl && (lvl > 0 || t.due < this.store.now() + p.response)).length;
  }
  protected polStats(p: SlaPolicy) {
    const l = this.store.tasks().filter((t) => catOf(t.category) === p.category && (!isOpen(t) || t.due < this.store.now()));
    const ok = l.filter((t) => !isOpen(t) && t.completedAt != null && t.completedAt <= t.due).length;
    return { n: l.length, pct: l.length ? Math.round((ok / l.length) * 100) : 100 };
  }
  protected clearSel() {
    this.sel.set(new Set());
  }
  protected setTab(t: Tab) {
    this.tab.set(t);
    this.pg.set(0);
    this.sel.set(new Set());
  }
  protected toggleSel(id: string) {
    this.sel.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }
  protected toggleAll() {
    const all = this.allSel();
    this.sel.update((s) => {
      const n = new Set(s);
      for (const t of this.pageRows()) all ? n.delete(t.id) : n.add(t.id);
      return n;
    });
  }
  protected escalate(t: TaskItem) {
    this.store.escalate(t.id);
    this.say(`${t.title} escalated to L${Math.min(t.escalation + 1, 2)} · ${this.escTo({ ...t, escalation: Math.min(t.escalation + 1, 2) })} notified`);
  }
  protected extend(t: TaskItem) {
    this.store.extend(t.id, 15);
    this.say(`${t.id} SLA extended to ${hhmm(Math.max(t.due, this.store.now()) + 15)}`);
  }
  protected reassign(t: TaskItem, wid: string) {
    if (!wid) return;
    this.store.assign(t.id, wid);
    this.say(`${t.title} reassigned to ${workerById(wid)!.name}`);
  }
  protected bulkEscalate() {
    const ids = [...this.sel()];
    ids.forEach((id) => this.store.escalate(id));
    this.sel.set(new Set());
    this.say(`${ids.length} tasks escalated`);
  }
  protected bulkExtend() {
    const ids = [...this.sel()];
    ids.forEach((id) => this.store.extend(id, 15));
    this.sel.set(new Set());
    this.say(`SLA extended by 15 min for ${ids.length} tasks`);
  }
  protected bulkAssign(wid: string) {
    if (!wid) return;
    const ids = [...this.sel()];
    ids.forEach((id) => this.store.assign(id, wid));
    this.sel.set(new Set());
    this.say(`${ids.length} tasks reassigned to ${workerById(wid)!.name}`);
  }
  protected escalateAll() {
    const l = this.breachedNotMax();
    l.forEach((t) => this.store.escalate(t.id, 'SLA Engine'));
    this.say(`${l.length} breached tasks escalated to the next level`);
  }
  protected togglePolicy(p: SlaPolicy, on: boolean) {
    this.store.policies.update((l) => l.map((x) => (x.id === p.id ? { ...x, active: on } : x)));
    this.say(`${p.name} ${on ? 'activated' : 'paused'}`);
  }
  protected newPolicy() {
    this.isNew.set(true);
    const n = this.store.policies().length + 1;
    this.form.set({ id: `SLA-${String(n).padStart(2, '0')}`, name: '', category: 'Housekeeping', priority: 'Medium', response: 15, resolve: 60, l1: 'Shift Supervisor', l1After: 10, l2: 'Facility Manager', l2After: 30, notify: ['Push'], active: true });
  }
  protected edit(p: SlaPolicy) {
    this.isNew.set(false);
    this.form.set({ ...p, notify: [...p.notify] });
  }
  protected patch(ch: Partial<SlaPolicy>) {
    this.form.update((f) => (f ? { ...f, ...ch } : f));
  }
  protected toggleChan(c: string) {
    this.form.update((f) => (f ? { ...f, notify: f.notify.includes(c) ? f.notify.filter((x) => x !== c) : [...f.notify, c] } : f));
  }
  protected savePolicy() {
    const f = this.form()!;
    if (this.isNew()) this.store.policies.update((l) => [...l, f]);
    else this.store.policies.update((l) => l.map((x) => (x.id === f.id ? f : x)));
    this.polId.set(f.id);
    this.form.set(null);
    this.store.log(`SLA policy "${f.name}" ${this.isNew() ? 'created' : 'updated'}`, 'Rex Kumar', 'shield-check', '#7c3aed');
    this.say(`SLA policy "${f.name}" saved`);
  }
  protected deletePolicy(f: SlaPolicy) {
    this.store.policies.update((l) => l.filter((x) => x.id !== f.id));
    this.form.set(null);
    this.polId.set(this.store.policies()[0]?.id ?? '');
    this.say(`${f.name} deleted`);
  }
  protected exportCsv() {
    downloadCsv('sla-queue.csv', [
      ['Task ID', 'Task', 'Category', 'Priority', 'Assignee', 'Due', 'Minutes Left', 'Escalation', 'Policy'],
      ...this.rows().map((t) => [t.id, t.title, t.category, t.priority, workerById(t.assignee)?.name ?? '', hhmm(t.due), t.due - this.store.now(), t.escalation ? 'L' + t.escalation : 'None', this.policyFor(t)?.name ?? 'Template default']),
    ]);
    this.say('SLA queue exported');
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
