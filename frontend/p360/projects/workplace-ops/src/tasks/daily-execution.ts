import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { TaskDrawer } from './task-drawer';
import { TaskForm } from './task-form';
import { TASKS_UI } from './tasks-ui';
import { CAT_NAMES, catMeta, catOf, hhmm, isOpen, prioCls, TaskItem, TaskStore, workerById } from './tasks.data';

type Col = 'Pending' | 'In Progress' | 'Overdue' | 'Done';
const COLS: { id: Col; label: string; color: string }[] = [
  { id: 'Pending', label: 'To Do', color: 'var(--ka-a78bfa)' },
  { id: 'In Progress', label: 'In Progress', color: 'var(--ka-3b82f6)' },
  { id: 'Overdue', label: 'Overdue', color: 'var(--ka-ef4444)' },
  { id: 'Done', label: 'Completed', color: 'var(--ka-22c55e)' },
];

@Component({
  selector: 'app-tasks-daily-task-execution',
  imports: [...UI, ...TASKS_UI, TaskDrawer, TaskForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Daily Task Execution" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Track today’s tasks live — progress, checklists, evidence and exceptions across every site.">
      <button class="btn-primary" (click)="formOpen.set(true)"><app-icon name="plus" [size]="16" />Add Ad-hoc Task</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Today's Tasks" [value]="list().length" icon="tasks-clipboard" color="var(--ka-7c3aed)" [sub]="filtered().length + ' in current view'" />
      <app-tkpi label="Completed" [value]="counts().Done" icon="tasks-check-circle" color="var(--ka-22c55e)" [pct]="pct(counts().Done) + '%'" sub="of today" />
      <app-tkpi label="In Progress" [value]="counts()['In Progress']" icon="activity" color="var(--ka-2563eb)" [sub]="active() + ' workers active'" />
      <app-tkpi label="To Do" [value]="counts().Pending" icon="clock" color="var(--ka-f59e0b)" [sub]="unassigned() + ' unassigned'" />
      <app-tkpi label="Overdue" [value]="counts().Overdue" icon="triangle-alert" color="var(--ka-ef4444)" [pct]="escalated() + ''" pctColor="var(--ka-ef4444)" sub="escalated" />
    </section>

    <section class="card prog">
      <div class="ph"><b>Today's completion</b><span>{{ pct(counts().Done) }}% · {{ counts().Done }} of {{ list().length }} tasks · demo clock {{ hhmm(store.now()) }} <em class="chip live"><i></i>Live</em></span></div>
      <div class="pbar">
        @for (c of cols; track c.id) {<i [style.width.%]="(counts()[c.id] / list().length) * 100" [style.background]="c.color" [title]="c.label + ': ' + counts()[c.id]"></i>}
      </div>
      <div class="sites">
        @for (s of bySite(); track s.site) {
          <button [class.on]="site() === s.site" (click)="site.set(site() === s.site ? 'All' : s.site)"><b>{{ s.site }}</b><span>{{ s.done }}/{{ s.total }}</span><app-ring [value]="s.pct" [size]="34" [color]="s.pct > 60 ? 'var(--ka-22c55e)' : 'var(--ka-f59e0b)'" /></button>
        }
      </div>
    </section>

    <section class="filters">
      <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search task, ID, location or worker..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option value="All">All Categories</option>@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select>
      <select class="select" [value]="prio()" (change)="prio.set($any($event.target).value)"><option value="All">All Priorities</option>@for (p of ['Critical', 'High', 'Medium', 'Low']; track p) {<option [value]="p">{{ p }}</option>}</select>
      <select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="All">All Sites</option>@for (s of ['Head Office', 'Manufacturing', 'Warehouse']; track s) {<option [value]="s">{{ s }}</option>}</select>
      <div class="tabs">
        <button [class.on]="view() === 'board'" (click)="view.set('board')">Board</button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')">List</button>
      </div>
    </section>

    <section class="layout">
      @if (view() === 'board') {
        <div class="board">
          @for (c of cols; track c.id) {
            <div class="col" (dragover)="$event.preventDefault()" (drop)="drop(c.id)">
              <div class="ch"><i [style.background]="c.color"></i><b>{{ c.label }}</b><span>{{ board()[c.id].length }}</span></div>
              <div class="cards">
                @for (t of board()[c.id].slice(0, limit()[c.id]); track t.id) {
                  <button class="tc" draggable="true" (dragstart)="drag.set(t.id)" (click)="open.set(t.id)" [class.esc]="t.escalation">
                    <div class="t1"><span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="12" /></span><b>{{ t.title }}</b><span [class]="prioCls(t.priority)">{{ t.priority }}</span></div>
                    <small>{{ t.id }} · {{ t.location }} · {{ t.site }}</small>
                    @if (t.status === 'In Progress') {<div class="sb"><i [style.width.%]="(t.stepsDone / t.steps) * 100"></i></div>}
                    <div class="t2">
                      @if (worker(t); as w) {<span class="av" [style.background]="w.color">{{ w.initials }}</span><span class="wn">{{ w.name }}</span>} @else {<span class="un">Unassigned</span>}
                      <span class="tm" [class.red]="c.id === 'Overdue'">
                        @switch (c.id) {
                          @case ('Done') { ✓ {{ hhmm(t.completedAt ?? t.due) }} }
                          @case ('Overdue') { {{ store.now() - t.due }}m late }
                          @case ('In Progress') { {{ t.stepsDone }}/{{ t.steps }} steps }
                          @default { {{ hhmm(t.start) }} }
                        }
                      </span>
                    </div>
                  </button>
                }
                @if (board()[c.id].length > limit()[c.id]) {<button class="more" (click)="showMore(c.id)">Show {{ board()[c.id].length - limit()[c.id] }} more</button>}
                @if (!board()[c.id].length) {<p class="none">Nothing here</p>}
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card lst">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Task</th><th>Location</th><th>Assignee</th><th>Window</th><th>Progress</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                @for (t of filtered().slice(0, 60); track t.id) {
                  <tr class="clickable" (click)="open.set(t.id)">
                    <td><b>{{ t.title }}</b><br /><small class="muted">{{ t.id }}</small></td><td>{{ t.location }} · {{ t.site }}</td><td>{{ worker(t)?.name ?? '—' }}</td><td>{{ hhmm(t.start) }} – {{ hhmm(t.due) }}</td>
                    <td><span class="mini-progress"><i [style.width.%]="(t.stepsDone / t.steps) * 100"></i></span>{{ t.stepsDone }}/{{ t.steps }}</td>
                    <td><span [class]="prioCls(t.priority)">{{ t.priority }}</span></td><td><span [class]="colTag(t)">{{ colOf(t) === 'Done' ? t.status : colOf(t) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (filtered().length > 60) {<p class="muted sm">Showing 60 of {{ filtered().length }} – refine filters to narrow down.</p>}
        </div>
      }

      <aside class="card feed">
        <div class="card-head"><h3>Live Activity</h3><em class="chip live"><i></i>Live</em></div>
        <ul>
          @for (e of store.events().slice(0, 14); track $index) {
            <li><span class="fi" [style.background]="'color-mix(in srgb, ' + e.color + ' 10%, transparent)'" [style.color]="e.color"><app-icon [name]="e.icon" [size]="13" /></span><div><span>{{ e.text }}</span><small>{{ e.who }} · {{ hhmm(e.at) }}</small></div></li>
          }
        </ul>
      </aside>
    </section>

    @if (open(); as id) {<app-task-drawer [taskId]="id" (closed)="open.set(null)" />}
    @if (formOpen()) {<app-task-form title="Add Ad-hoc Task" (closed)="formOpen.set(false)" (created)="say($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .prog { margin-bottom: 12px; display: grid; grid-template-columns: 1fr; gap: 10px; }
    .ph { display: flex; justify-content: space-between; align-items: center; font-size: 13px; } .ph span { color: var(--muted); font-size: 12px; display: flex; gap: 8px; align-items: center; }
    .pbar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--kb-eef0f5); } .pbar i { display: block; height: 100%; transition: width 0.4s; }
    .sites { display: flex; gap: 10px; flex-wrap: wrap; }
    .sites button { display: grid; grid-template-columns: auto auto 34px; gap: 10px; align-items: center; padding: 4px 6px 4px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; font-size: 12px; }
    .sites button.on { border-color: var(--primary); background: var(--primary-soft); } .sites span { color: var(--muted); }
    .filters { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; } .filters .search-box { flex: 0 1 320px; } .filters .search-box input { width: 100%; } .filters .tabs { margin-left: auto; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 12px; align-items: start; }
    .board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .col { background: var(--kb-eeeef6); border-radius: 12px; padding: 8px; min-height: 300px; }
    .ch { display: flex; align-items: center; gap: 8px; padding: 4px 4px 10px; font-size: 13px; } .ch i { width: 10px; height: 10px; border-radius: 3px; } .ch span { margin-left: auto; font-size: 11.5px; background: var(--kb-ffffff); border-radius: 10px; padding: 1px 8px; color: var(--kf-4b4f6b); }
    .cards { display: flex; flex-direction: column; gap: 7px; max-height: 640px; overflow: auto; }
    .tc { display: flex; flex-direction: column; gap: 5px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--kb-ffffff); text-align: left; cursor: pointer; font: inherit; }
    .tc:hover { border-color: var(--kl-c4b5fd); box-shadow: 0 3px 10px rgba(124, 58, 237, 0.1); } .tc.esc { border-left: 3px solid var(--kl-ef4444); }
    .t1 { display: grid; grid-template-columns: 20px 1fr auto; gap: 6px; align-items: center; } .t1 b { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ci { width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .tc small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sb { height: 4px; border-radius: 3px; background: var(--kb-eef0f5); overflow: hidden; } .sb i { display: block; height: 100%; background: var(--kb-3b82f6); transition: width 0.3s; }
    .t2 { display: flex; align-items: center; gap: 6px; font-size: 11.5px; } .av { width: 20px; height: 20px; border-radius: 50%; color: var(--kf-ffffff); font-size: 9px; display: grid; place-items: center; font-weight: 600; }
    .wn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .un { color: var(--kf-b45309); font-weight: 500; } .tm { margin-left: auto; color: var(--kf-4b4f6b); white-space: nowrap; } .tm.red { color: var(--red); font-weight: 600; }
    .more { border: 1px dashed var(--kl-c4b5fd); background: var(--kb-ffffff); border-radius: 8px; padding: 7px; font-size: 12px; color: var(--primary); cursor: pointer; }
    .none { text-align: center; color: var(--muted); font-size: 12px; }
    .lst .sm { font-size: 12px; margin: 8px 0 0; }
    .feed ul { list-style: none; margin: 0; padding: 0; } .feed li { display: grid; grid-template-columns: 26px 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12px; }
    .fi { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; } .feed li > div { display: flex; flex-direction: column; } .feed small { color: var(--muted); font-size: 11px; }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .layout { grid-template-columns: 1fr; } }
  `,
})
export class DailyTaskExecution {
  protected readonly store = inject(TaskStore);
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly prioCls = prioCls;
  protected readonly cols = COLS;
  protected readonly cats = CAT_NAMES;
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly prio = signal('All');
  protected readonly site = signal('All');
  protected readonly view = signal<'board' | 'list'>('board');
  protected readonly open = signal<string | null>(null);
  protected readonly drag = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly limit = signal<Record<Col, number>>({ Pending: 12, 'In Progress': 12, Overdue: 12, Done: 12 });

  protected readonly list = computed(() => this.store.tasks());
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.list().filter(
      (t) =>
        (!q || `${t.title} ${t.id} ${t.location} ${workerById(t.assignee)?.name ?? ''}`.toLowerCase().includes(q)) &&
        (this.cat() === 'All' || catOf(t.category) === this.cat()) &&
        (this.prio() === 'All' || t.priority === this.prio()) &&
        (this.site() === 'All' || t.site === this.site()),
    );
  });
  protected readonly board = computed(() => {
    const b: Record<Col, TaskItem[]> = { Pending: [], 'In Progress': [], Overdue: [], Done: [] };
    for (const t of this.filtered()) b[this.colOf(t)].push(t);
    b.Pending.sort((a, c) => a.start - c.start);
    b.Overdue.sort((a, c) => a.due - c.due);
    b.Done.sort((a, c) => (c.completedAt ?? 0) - (a.completedAt ?? 0));
    return b;
  });
  protected readonly counts = computed(() => {
    const c: Record<Col, number> = { Pending: 0, 'In Progress': 0, Overdue: 0, Done: 0 };
    for (const t of this.list()) c[this.colOf(t)]++;
    return c;
  });
  protected readonly unassigned = computed(() => this.list().filter((t) => t.status === 'Unassigned').length);
  protected readonly escalated = computed(() => this.list().filter((t) => t.escalation && isOpen(t)).length);
  protected readonly active = computed(() => new Set(this.list().filter((t) => t.status === 'In Progress').map((t) => t.assignee)).size);
  protected readonly bySite = computed(() =>
    ['Head Office', 'Manufacturing', 'Warehouse'].map((site) => {
      const l = this.list().filter((t) => t.site === site);
      const done = l.filter((t) => this.colOf(t) === 'Done').length;
      return { site, total: l.length, done, pct: Math.round((done / Math.max(l.length, 1)) * 100) };
    }),
  );

  protected colOf(t: TaskItem): Col {
    if (!isOpen(t)) return 'Done';
    if (t.due < this.store.now()) return 'Overdue';
    return t.status === 'In Progress' ? 'In Progress' : 'Pending';
  }
  protected colTag(t: TaskItem) {
    const c = this.colOf(t);
    return c === 'Done' ? (t.status === 'Rejected' ? 'tag red' : 'tag green') : c === 'Overdue' ? 'tag red' : c === 'In Progress' ? 'tag blue' : 'tag amber';
  }
  protected worker(t: TaskItem) {
    return workerById(t.assignee);
  }
  protected pct(n: number) {
    return Math.round((n / Math.max(this.list().length, 1)) * 100);
  }
  protected showMore(c: Col) {
    this.limit.update((l) => ({ ...l, [c]: l[c] + 20 }));
  }
  protected drop(c: Col) {
    const t = this.list().find((x) => x.id === this.drag());
    this.drag.set(null);
    if (!t) return;
    const who = workerById(t.assignee)?.name ?? 'Supervisor';
    if (c === 'In Progress' && t.status !== 'In Progress') {
      if (!t.assignee) return this.say('Assign the task before starting it');
      this.store.start(t.id, who);
    } else if (c === 'Done' && isOpen(t)) this.store.complete(t.id, who);
    else if (c === 'Overdue' && isOpen(t)) this.store.escalate(t.id);
    else return this.say('That move is not allowed');
    this.say(`${t.title} → ${COLS.find((x) => x.id === c)!.label}`);
  }
  protected exportCsv() {
    downloadCsv('daily-task-execution.csv', [
      ['Task ID', 'Task', 'Site', 'Location', 'Assignee', 'Start', 'Due', 'Steps Done', 'Steps', 'Photos', 'Priority', 'Status'],
      ...this.filtered().map((t) => [t.id, t.title, t.site, t.location, workerById(t.assignee)?.name ?? '', hhmm(t.start), hhmm(t.due), t.stepsDone, t.steps, t.photos, t.priority, this.colOf(t) === 'Done' ? t.status : this.colOf(t)]),
    ]);
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
