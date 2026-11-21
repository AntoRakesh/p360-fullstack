import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { TASKS_UI } from './tasks-ui';
import { TaskForm } from './task-form';
import { catMeta, hhmm, isOpen, prioCls, statusCls, TaskItem, TaskStore, TEAMS, Worker, workerById, WORKERS } from './tasks.data';

const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06:00 – 22:00
const T0 = 360;
const SPAN = 17 * 60;

@Component({
  selector: 'app-tasks-task-assignment-scheduling',
  imports: [...UI, ...TASKS_UI, TaskForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Task Assignment &amp; Scheduling" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Plan, schedule and assign tasks to the right people by skill, shift, site and live workload.">
      <button class="btn-primary" (click)="formOpen.set(true)"><app-icon name="plus" [size]="16" />Schedule Task</button>
      <button class="btn-ghost" (click)="autoAssign()" [disabled]="!unassigned().length"><app-icon name="sparkles" [size]="16" />Auto-assign ({{ unassigned().length }})</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export Plan</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Scheduled Today" [value]="store.tasks().length" icon="calendar-days" color="var(--ka-7c3aed)" change="6%" sub="vs. last Wed" />
      <app-tkpi label="Unassigned Tasks" [value]="unassigned().length" icon="tasks-clipboard" color="var(--ka-f59e0b)" [sub]="unassigned().length ? 'need an owner' : 'all tasks assigned'" />
      <app-tkpi label="Workers On Duty" [value]="onDuty().length + ' / ' + workers.length" icon="users" color="var(--ka-22c55e)" [pct]="breaks() + ' on break'" pctColor="var(--ka-d97706)" sub="" />
      <app-tkpi label="Avg Load per Worker" [value]="avgLoad()" icon="tasks-gauge" color="var(--ka-2563eb)" sub="open tasks right now" />
      <app-tkpi label="Recurring Schedules" [value]="recurring().length" icon="refresh" color="var(--ka-06b6d4)" [pct]="activeRecurring() + ''" pctColor="var(--ka-16a34a)" sub="running" />
    </section>

    <section class="grid">
      <div class="card tl">
        <div class="card-head">
          <h3>Workforce Timeline <span class="card-sub">Today · {{ hhmm(store.now()) }}</span></h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search worker..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="team()" (change)="team.set($any($event.target).value)"><option value="All">All Teams</option>@for (t of teams; track t) {<option [value]="t">{{ t }}</option>}</select>
            <select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="All">All Sites</option>@for (s of ['Head Office', 'Manufacturing', 'Warehouse']; track s) {<option [value]="s">{{ s }}</option>}</select>
            <label class="ck"><input type="checkbox" [checked]="dutyOnly()" (change)="dutyOnly.set(!dutyOnly())" />On duty only</label>
          </div>
        </div>
        <div class="legend">
          @for (l of legend; track l[0]) {<span><i [style.background]="l[1]"></i>{{ l[0] }}</span>}
        </div>
        <div class="tl-scroll">
          <div class="tl-grid">
            <div class="hrow"><span class="wcol"></span><div class="hours">@for (h of hours; track h) {<span>{{ h < 10 ? '0' + h : h }}:00</span>}</div></div>
            @for (w of rows(); track w.w.id) {
              <div class="wrow" [class.sel]="selWorker() === w.w.id">
                <button class="wcol" (click)="selWorker.set(selWorker() === w.w.id ? null : w.w.id)">
                  <span class="av" [style.background]="w.w.color">{{ w.w.initials }}</span>
                  <span class="wn"><b>{{ w.w.name }}</b><small>{{ w.w.team }} · {{ w.open }} open</small></span>
                  <i class="dot" [class]="'dot ' + dutyCls(w.w)"></i>
                </button>
                <div class="lane" (dragover)="$event.preventDefault()" (drop)="drop(w.w)">
                  @if (w.w.status === 'Off Duty') {<div class="off">Off duty · {{ w.w.shift }}</div>}
                  @for (t of w.tasks; track t.id) {
                    <button class="blk" [style.left.%]="pos(t.start)" [style.width.%]="width(t)" [style.background]="color(t)" [class.sel]="sel()?.id === t.id"
                      draggable="true" (dragstart)="dragId.set(t.id)" (click)="selId.set(t.id)" [title]="t.title + ' · ' + hhmm(t.start)">{{ t.title }}</button>
                  }
                </div>
              </div>
            }
            <div class="now" [style.left]="'calc(190px + (100% - 190px) * ' + pos(store.now()) / 100 + ')'"><em>{{ hhmm(store.now()) }}</em></div>
          </div>
        </div>
        <p class="hint">Tip: drag a task block onto another worker's lane to reassign it.</p>
      </div>

      <div class="side">
        <div class="card uq">
          <div class="card-head"><h3>Unassigned Queue <span class="count">{{ unassigned().length }}</span></h3><button class="link" (click)="autoAssign()" [disabled]="!unassigned().length">Auto-assign all</button></div>
          <ul>
            @for (t of unassigned(); track t.id) {
              <li [class.sel]="sel()?.id === t.id">
                <span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="14" /></span>
                <div class="ut" (click)="selId.set(t.id)"><b>{{ t.title }}</b><small>{{ t.id }} · {{ t.location }} · {{ hhmm(t.start) }}</small></div>
                <span [class]="prioCls(t.priority)">{{ t.priority }}</span>
                <select class="select xs" (change)="assign(t, $any($event.target).value)" aria-label="Assign to">
                  <option value="">Assign…</option>
                  @for (s of suggest(t); track s.w.id) {<option [value]="s.w.id">{{ s.w.name }} ({{ s.load }})</option>}
                </select>
              </li>
            } @empty {
              <li class="empty"><app-icon name="tasks-check-circle" [size]="18" />Every task has an owner</li>
            }
          </ul>
        </div>

        @if (sel(); as t) {
          <div class="card det">
            <div class="card-head"><h3>{{ t.title }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <div class="facts">
              <span>Task ID</span><b>{{ t.id }}</b>
              <span>Status</span><b><span [class]="statusCls(t.status)">{{ t.status }}</span></b>
              <span>Window</span><b>{{ hhmm(t.start) }} – {{ hhmm(t.due) }}</b>
              <span>Location</span><b>{{ t.site }} · {{ t.location }}</b>
              <span>Priority</span><b><span [class]="prioCls(t.priority)">{{ t.priority }}</span></b>
              <span>Source</span><b>{{ t.source }}</b>
            </div>
            <label class="fl">Assignee
              <select class="select" [value]="t.assignee ?? ''" (change)="assign(t, $any($event.target).value)">
                <option value="" disabled>Select worker</option>
                @for (s of suggest(t, 40); track s.w.id) {<option [value]="s.w.id">{{ s.w.name }} · {{ s.w.role }} · load {{ s.load }}</option>}
              </select>
            </label>
            <div class="row">
              <button class="btn-ghost sm" (click)="shift(t, -30)">− 30 min</button>
              <button class="btn-ghost sm" (click)="shift(t, 30)">+ 30 min</button>
              @if (t.status === 'Pending') {<button class="btn-ghost sm" (click)="store.start(t.id, 'Rex Kumar')"><app-icon name="play" [size]="13" />Start</button>}
              <button class="btn-ghost sm danger" (click)="cancelTask(t)">Cancel task</button>
            </div>
          </div>
        } @else {
          <div class="card">
            <div class="card-head"><h3>Workload by Team</h3></div>
            <app-bar-list [rows]="teamLoad()" [max]="teamMax()" />
          </div>
        }
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h3>Recurring Schedules <span class="card-sub">generated automatically from published templates</span></h3>
        <div class="toolbar">
          <select class="select" [value]="freq()" (change)="freq.set($any($event.target).value)"><option value="All">All frequencies</option>@for (f of ['Hourly', 'Shift-wise', 'Daily', 'Weekly', 'Monthly', 'Quarterly']; track f) {<option [value]="f">{{ f }}</option>}</select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Template</th><th>Frequency</th><th>Team</th><th>Shift</th><th>First Run</th><th>Days</th><th>Assignment</th><th>Next Run</th><th class="num">Today</th><th>Enabled</th></tr></thead>
          <tbody>
            @for (r of recurringPage(); track r.id) {
              <tr>
                <td><span class="ci" [style.background]="r.color"><app-icon [name]="r.icon" [size]="13" /></span> <b>{{ r.name }}</b></td>
                <td>{{ r.frequency }}</td><td>{{ r.team }}</td><td>{{ r.shift }}</td><td>{{ r.startTime }}</td><td>{{ r.days.length === 7 ? 'Every day' : r.days.join(', ') }}</td>
                <td>{{ r.assignMode }}</td><td>{{ r.status === 'Active' ? nextRun(r.frequency) : '—' }}</td><td class="num">{{ todayCount(r.id) }}</td>
                <td><app-tswitch [on]="r.status === 'Active'" (onChange)="toggle(r.id, $event)" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pager"><span>{{ recurringF().length }} schedules</span><span><button class="btn-ghost sm" [disabled]="rp() === 0" (click)="rp.set(rp() - 1)">Prev</button> {{ rp() + 1 }} / {{ rPages() }} <button class="btn-ghost sm" [disabled]="rp() >= rPages() - 1" (click)="rp.set(rp() + 1)">Next</button></span></div>
    </section>

    @if (formOpen()) {<app-task-form (closed)="formOpen.set(false)" (created)="say($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .toolbar .search-box input { width: 130px; } .toolbar .select { font-size: 12px; }
    .ck { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--kf-3b3f5c); } .ck input { accent-color: var(--primary); }
    .legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--kf-4b4f6b); margin: -4px 0 8px; } .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .tl-scroll { max-height: 560px; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
    .tl-grid { position: relative; min-width: 900px; }
    .hrow, .wrow { display: grid; grid-template-columns: 190px 1fr; }
    .hrow { position: sticky; top: 0; background: var(--kb-fafafe); z-index: 3; border-bottom: 1px solid var(--border); }
    .hours { display: grid; grid-template-columns: repeat(17, 1fr); font-size: 10.5px; color: var(--muted); } .hours span { padding: 7px 0 7px 4px; border-left: 1px solid var(--kl-eef0f5); }
    .wrow { border-bottom: 1px solid var(--kl-f1f2f7); min-height: 44px; } .wrow.sel { background: var(--kb-faf8ff); }
    .wcol { display: grid; grid-template-columns: 28px 1fr 8px; gap: 8px; align-items: center; padding: 6px 10px; border: 0; background: none; text-align: left; cursor: pointer; border-right: 1px solid var(--border); position: sticky; left: 0; background: var(--kb-ffffff); z-index: 2; }
    .wrow.sel .wcol { background: var(--kb-f5f3ff); }
    .av { width: 28px; height: 28px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-size: 10.5px; font-weight: 600; }
    .wn { display: flex; flex-direction: column; min-width: 0; } .wn b { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .wn small { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 8px; height: 8px; border-radius: 50%; } .dot.on { background: var(--kb-22c55e); } .dot.brk { background: var(--kb-f59e0b); } .dot.offd { background: var(--kb-cbd5e1); }
    .lane { position: relative; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 17 - 1px), var(--kb-f1f2f7) calc(100% / 17 - 1px), var(--kb-f1f2f7) calc(100% / 17)); }
    .off { position: absolute; inset: 6px 4px; border-radius: 6px; background: repeating-linear-gradient(135deg, var(--kb-f4f5f9) 0 6px, var(--kb-eceef4) 6px 12px); font-size: 11px; color: var(--muted); display: flex; align-items: center; padding-left: 10px; }
    .blk { position: absolute; top: 8px; height: 28px; border: 0; border-radius: 6px; color: var(--kf-ffffff); font-size: 10.5px; font-weight: 500; padding: 0 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: grab; text-align: left; min-width: 10px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
    .blk.sel { outline: 2px solid var(--kl-1e1b3a); outline-offset: 1px; z-index: 1; }
    .now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--kb-ef4444); z-index: 2; pointer-events: none; } .now em { position: absolute; top: 4px; left: 4px; font-style: normal; font-size: 10px; color: var(--kf-ffffff); background: var(--kb-ef4444); padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
    .hint { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .count { font-size: 11px; padding: 1px 8px; border-radius: 10px; background: var(--kb-fef3c7); color: var(--kf-b45309); margin-left: 6px; }
    .uq ul { list-style: none; margin: 0; padding: 0; max-height: 330px; overflow: auto; }
    .uq li { display: grid; grid-template-columns: 28px 1fr auto; gap: 4px 8px; align-items: center; padding: 8px 4px; border-bottom: 1px solid var(--kl-f1f2f7); } .uq li.sel { background: var(--kb-faf8ff); }
    .uq li .select { grid-column: 2 / -1; } .ut { cursor: pointer; min-width: 0; display: flex; flex-direction: column; } .ut b { font-size: 12.5px; } .ut small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xs { padding: 4px 24px 4px 8px; font-size: 11.5px; }
    .empty { display: flex !important; gap: 8px; color: var(--kf-16a34a); font-size: 12.5px; justify-content: center; padding: 20px !important; }
    .ci { width: 24px; height: 24px; border-radius: 6px; display: inline-grid; place-items: center; color: var(--kf-ffffff); vertical-align: middle; }
    td .ci { width: 22px; height: 22px; margin-right: 4px; }
    .det { display: flex; flex-direction: column; gap: 10px; } .det h3 { font-size: 15px; }
    .facts { display: grid; grid-template-columns: 90px 1fr; gap: 7px; font-size: 12px; } .facts span { color: var(--muted); } .facts b { font-weight: 500; }
    .fl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    .pager button { margin: 0 4px; }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .grid { grid-template-columns: 1fr; } }
  `,
})
export class TaskAssignmentScheduling {
  protected readonly store = inject(TaskStore);
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly prioCls = prioCls;
  protected readonly statusCls = statusCls;
  protected readonly hours = HOURS;
  protected readonly workers = WORKERS;
  protected readonly teams = [...new Set(WORKERS.map((w) => w.team))].sort();
  protected readonly legend = [['Pending', 'var(--ka-a78bfa)'], ['In Progress', 'var(--ka-3b82f6)'], ['Completed', 'var(--ka-22c55e)'], ['Overdue', 'var(--ka-ef4444)']];
  protected readonly q = signal('');
  protected readonly team = signal('All');
  protected readonly site = signal('All');
  protected readonly dutyOnly = signal(true);
  protected readonly selWorker = signal<string | null>(null);
  protected readonly selId = signal<string | null>(null);
  protected readonly dragId = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly freq = signal('All');
  protected readonly rp = signal(0);

  protected readonly tplMap = computed(() => new Map(this.store.templates().map((t) => [t.id, t])));
  protected readonly sel = computed(() => this.store.tasks().find((t) => t.id === this.selId()) ?? null);
  protected readonly unassigned = computed(() => this.store.tasks().filter((t) => t.status === 'Unassigned').sort((a, b) => a.start - b.start));
  protected readonly onDuty = computed(() => WORKERS.filter((w) => w.status !== 'Off Duty'));
  protected readonly breaks = computed(() => WORKERS.filter((w) => w.status === 'On Break').length);
  protected readonly load = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.store.tasks()) if (t.assignee && isOpen(t)) m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1);
    return m;
  });
  protected readonly avgLoad = computed(() => {
    const open = [...this.load().values()].reduce((a, b) => a + b, 0);
    return (open / Math.max(this.onDuty().length, 1)).toFixed(1);
  });
  protected readonly rows = computed(() => {
    const q = this.q().toLowerCase();
    const byW = new Map<string, TaskItem[]>();
    for (const t of this.store.tasks()) if (t.assignee) byW.set(t.assignee, [...(byW.get(t.assignee) ?? []), t]);
    return WORKERS.filter(
      (w) => (!q || w.name.toLowerCase().includes(q)) && (this.team() === 'All' || w.team === this.team()) && (this.site() === 'All' || w.site === this.site()) && (!this.dutyOnly() || w.status !== 'Off Duty'),
    ).map((w) => ({ w, tasks: byW.get(w.id) ?? [], open: this.load().get(w.id) ?? 0 }));
  });
  protected readonly teamLoad = computed(() =>
    [...new Set(WORKERS.map((w) => w.team))].map((team, i) => {
      const ids = WORKERS.filter((w) => w.team === team).map((w) => w.id);
      const v = ids.reduce((a, id) => a + (this.load().get(id) ?? 0), 0);
      return { label: team, value: v, display: `${v} open`, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-06b6d4)', 'var(--ka-ec4899)', 'var(--ka-64748b)', 'var(--ka-0d9488)', 'var(--ka-a855f7)'][i % 10] };
    }).sort((a, b) => b.value - a.value),
  );
  protected readonly teamMax = computed(() => Math.max(...this.teamLoad().map((r) => r.value), 1));
  protected readonly recurring = computed(() => this.store.published().filter((t) => t.frequency !== 'On Demand'));
  protected readonly activeRecurring = computed(() => this.recurring().filter((t) => t.status === 'Active').length);
  protected readonly recurringF = computed(() => this.recurring().filter((t) => this.freq() === 'All' || t.frequency === this.freq()));
  protected readonly rPages = computed(() => Math.max(1, Math.ceil(this.recurringF().length / 8)));
  protected readonly recurringPage = computed(() => this.recurringF().slice(this.rp() * 8, this.rp() * 8 + 8));
  private readonly todayCounts = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.store.tasks()) m.set(t.templateId, (m.get(t.templateId) ?? 0) + 1);
    return m;
  });

  protected todayCount(id: string) {
    return this.todayCounts().get(id) ?? 0;
  }
  protected dutyCls(w: Worker) {
    return w.status === 'On Duty' ? 'on' : w.status === 'On Break' ? 'brk' : 'offd';
  }
  protected pos(m: number) {
    return Math.max(0, Math.min(100, ((m - T0) / SPAN) * 100));
  }
  protected width(t: TaskItem) {
    const d = this.tplMap().get(t.templateId)?.duration ?? 20;
    return Math.max(1.2, Math.min(100 - this.pos(t.start), (Math.max(d, 18) / SPAN) * 100));
  }
  protected color(t: TaskItem) {
    if (isOpen(t) && t.due < this.store.now()) return 'var(--ka-ef4444)';
    return t.status === 'In Progress' ? 'var(--ka-3b82f6)' : t.status === 'Pending' ? 'var(--ka-a78bfa)' : t.status === 'Rejected' ? 'var(--ka-f97316)' : 'var(--ka-22c55e)';
  }
  protected suggest(t: TaskItem, n = 5) {
    const role = this.tplMap().get(t.templateId)?.applicableTo;
    return WORKERS.filter((w) => w.status !== 'Off Duty')
      .map((w) => ({ w, load: this.load().get(w.id) ?? 0, fit: w.role === role ? 0 : 1 }))
      .sort((a, b) => a.fit - b.fit || a.load - b.load)
      .slice(0, n);
  }
  protected assign(t: TaskItem, wid: string) {
    if (!wid) return;
    this.store.assign(t.id, wid);
    this.say(`${t.title} assigned to ${workerById(wid)!.name} · push notification sent`);
  }
  protected autoAssign() {
    const list = this.unassigned();
    for (const t of list) this.store.assign(t.id, this.suggest(t, 1)[0].w.id, 'Auto-assign');
    this.say(`${list.length} tasks auto-assigned by skill & workload`);
  }
  protected drop(w: Worker) {
    const t = this.store.tasks().find((x) => x.id === this.dragId());
    this.dragId.set(null);
    if (!t || t.assignee === w.id) return;
    if (w.status === 'Off Duty') return this.say(`${w.name} is off duty`);
    this.assign(t, w.id);
  }
  protected shift(t: TaskItem, by: number) {
    this.store.patchTask(t.id, { start: t.start + by, due: t.due + by });
    this.say(`${t.title} moved to ${hhmm(t.start + by)}`);
  }
  protected cancelTask(t: TaskItem) {
    this.store.tasks.update((l) => l.filter((x) => x.id !== t.id));
    this.store.log(`${t.title} cancelled`, 'Rex Kumar', 'tasks-x', 'var(--ka-64748b)');
    this.selId.set(null);
    this.say(`${t.id} cancelled`);
  }
  protected toggle(id: string, on: boolean) {
    this.store.templates.update((l) => l.map((t) => (t.id === id ? { ...t, status: on ? 'Active' : 'Inactive' } : t)));
    this.say(on ? 'Schedule resumed' : 'Schedule paused – no new tasks will be generated');
  }
  protected nextRun(f: string) {
    const n = this.store.now();
    const next = f === 'Hourly' ? Math.ceil((n + 1) / 60) * 60 : f === 'Shift-wise' ? (n < 840 ? 840 : 1320) : -1;
    return next > 0 ? `Today ${hhmm(next)}` : f === 'Daily' ? 'Tomorrow 08:00 AM' : f === 'Weekly' ? 'Mon 19 Oct' : f === 'Monthly' ? '01 Nov 2026' : '01 Jan 2027';
  }
  protected exportCsv() {
    downloadCsv('task-plan-today.csv', [
      ['Task ID', 'Task', 'Category', 'Site', 'Location', 'Assignee', 'Team', 'Start', 'Due', 'Priority', 'Status'],
      ...this.store.tasks().map((t) => {
        const w = workerById(t.assignee);
        return [t.id, t.title, t.category, t.site, t.location, w?.name ?? 'Unassigned', w ? TEAMS[w.role] : '', hhmm(t.start), hhmm(t.due), t.priority, t.status];
      }),
    ]);
    this.say('Today’s plan exported');
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
