import { ChangeDetectionStrategy, Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, NAMES } from '../dashboards/demo-data';
import { WfInstanceDrawer } from './workflow-shared';
import {
  CATEGORIES, currentStep, demoNow, fmtAgo, fmtDT, Instance, instStatus, isOverdue, ME, MODULES, NODE_META, orderedSteps, statusTagCls, TEMPLATES, Workflow, WorkflowStore,
} from './workflow.data';

const H = 3600_000;
const avgHours = (list: Instance[]) => {
  const done = list.filter((i) => i.endedAt && i.status === 'Approved');
  return done.length ? done.reduce((a, i) => a + (i.endedAt! - i.startedAt), 0) / done.length / H : 0;
};
const fmtH = (h: number) => (h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`);
const slaPct = (list: Instance[]) => {
  const closed = list.filter((i) => i.endedAt);
  return closed.length ? Math.round((closed.filter((i) => i.endedAt! <= i.dueAt).length / closed.length) * 1000) / 10 : 100;
};
export function toast(sig: WritableSignal<string | null>, m: string) {
  sig.set(m);
  setTimeout(() => sig() === m && sig.set(null), 2600);
}

/* =========================================================================
   Workflow List
   ========================================================================= */
@Component({
  selector: 'app-workflow-workflow-list',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workflow List" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="All workflow definitions across modules — status, versions, usage and performance.">
      <button class="btn-primary" (click)="newOpen.set(true)"><app-icon name="plus" [size]="16" />New Workflow</button>
      <label class="btn-ghost"><app-icon name="download" [size]="16" class="up" />Import JSON<input type="file" accept=".json" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Workflows" [value]="store.workflows().length" icon="workflow" color="#7c3aed" [sub]="modulesUsed() + ' modules'" />
      <app-kpi label="Active" [value]="count('Active')" icon="workflow-check" color="#22c55e" change="2" sub="published this month" />
      <app-kpi label="Drafts" [value]="count('Draft')" icon="workflow-pencil" color="#f59e0b" sub="awaiting publish" />
      <app-kpi label="Running Instances" [value]="store.running().length" icon="activity" color="#3b82f6" change="8%" sub="vs. last week" />
      <app-kpi label="Avg. Completion" [value]="avgAll()" icon="workflow-timer" color="#0d9488" change="11%" [up]="false" sub="vs. last month" />
    </section>

    <nav class="cat-tabs">
      @for (c of cats(); track c.name) {<button [class.on]="cat() === c.name" (click)="cat.set(c.name)">{{ c.name }}<span>{{ c.n }}</span></button>}
    </nav>

    <section class="wl" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="workflows"
          [searchKeys]="['name', 'module', 'owner', 'id']" searchPlaceholder="Search workflow, module, owner..." [activeId]="selId()"
          (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      @if (sel(); as w) {
        <aside class="card detail">
          <div class="dh">
            <span class="logo" [style.background]="w.color + '1a'" [style.color]="w.color"><app-icon [name]="w.icon" [size]="22" /></span>
            <div><h3>{{ w.name }}</h3><small class="muted">{{ w.id }} · {{ w.version }} · {{ w.module }}</small></div>
            <button class="close-btn" (click)="selId.set(null)">×</button>
          </div>
          <p class="desc">{{ w.description }}</p>
          <div class="btns">
            <button class="btn-primary" (click)="open(w)"><app-icon name="workflow" [size]="15" />Open in Designer</button>
            <button class="btn-ghost" (click)="act(w.status === 'Active' ? 'deactivate' : 'activate', w)">{{ w.status === 'Active' ? 'Deactivate' : 'Activate' }}</button>
            <button class="btn-ghost" (click)="act('duplicate', w)"><app-icon name="workflow-copy" [size]="15" />Duplicate</button>
          </div>
          <h4>Flow</h4>
          <div class="flow">
            @for (n of flow(w); track n.id; let last = $last) {
              <span class="fs" [style.--c]="n.color"><app-icon [name]="meta[n.type].icon" [size]="12" [stroke]="2.3" />{{ n.name }}</span>
              @if (!last) {<app-icon name="chevron-right" [size]="13" class="arr" />}
            }
          </div>
          <div class="stats">
            <div><b>{{ inst(w).length }}</b><small>Total instances</small></div>
            <div><b class="blue">{{ by(w, 'In Progress') }}</b><small>Running</small></div>
            <div><b class="green">{{ by(w, 'Approved') }}</b><small>Approved</small></div>
            <div><b class="red">{{ by(w, 'Rejected') }}</b><small>Rejected</small></div>
            <div><b>{{ fmtH(avg(w)) }}</b><small>Avg. cycle</small></div>
            <div><b>{{ sla(w) }}%</b><small>SLA met</small></div>
          </div>
          <h4>Instances · last 6 weeks</h4>
          <app-column-chart [labels]="weeks" [series]="weekly(w)" [height]="150" [legend]="false" />
          <h4>Details</h4>
          <dl class="facts">
            <dt>Status</dt><dd><span [class]="tag(w.status)">{{ w.status }}</span></dd>
            <dt>Trigger</dt><dd>{{ w.trigger }}</dd>
            <dt>Category</dt><dd>{{ w.category }}</dd>
            <dt>SLA</dt><dd>{{ w.slaHours }} h · {{ w.priority }} priority</dd>
            <dt>Owner</dt><dd>{{ w.owner }}</dd>
            <dt>Valid</dt><dd>{{ w.validFrom }} → {{ w.validTo }}</dd>
            <dt>Last updated</dt><dd>{{ w.updated }}</dd>
          </dl>
        </aside>
      }
    </section>

    @if (newOpen()) {
      <div class="g-overlay" (click)="newOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>New Workflow</h3><button type="button" class="close-btn" (click)="newOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Workflow name *<input class="input" required [value]="nw().name" (input)="nw.set({ ...nw(), name: $any($event.target).value })" /></label>
          <label>Module<select class="select" [value]="nw().module" (change)="nw.set({ ...nw(), module: $any($event.target).value })">@for (m of modules; track m) {<option>{{ m }}</option>}</select></label>
          <label>Category<select class="select" [value]="nw().category" (change)="nw.set({ ...nw(), category: $any($event.target).value })">@for (c of categories; track c) {<option>{{ c }}</option>}</select></label>
          <label class="full">Start from<select class="select" [value]="nw().from" (change)="nw.set({ ...nw(), from: $any($event.target).value })"><option value="">Blank canvas</option>@for (t of templates; track t.id) {<option [value]="t.id">Template: {{ t.name }}</option>}</select></label>
        </div>
        @if (err()) {<p class="errt">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Create &amp; open designer</button></div>
      </form>
    }
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .up { transform: rotate(180deg); }
    .cat-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
    .cat-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 18px; border: 1px solid var(--border); background: #fff; font-size: 12.5px; cursor: pointer; color: #3b3f5c; }
    .cat-tabs button span { font-size: 10.5px; padding: 0 6px; border-radius: 10px; background: #eef0f5; }
    .cat-tabs button.on { background: var(--primary); border-color: var(--primary); color: #fff; } .cat-tabs button.on span { background: rgba(255,255,255,.25); }
    .wl { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .wl.with-detail { grid-template-columns: minmax(0, 1.6fr) minmax(380px, 1fr); }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 6px; }
    .dh { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; } .dh h3 { font-size: 16px; }
    .logo { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; }
    .desc { margin: 4px 0; font-size: 12.5px; color: #3b3f5c; }
    .btns { display: flex; flex-wrap: wrap; gap: 8px; }
    h4 { margin: 10px 0 4px; font-size: 13px; }
    .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .fs { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 6px; font-size: 11px; background: color-mix(in srgb, var(--c) 10%, #fff); border: 1px solid color-mix(in srgb, var(--c) 40%, #fff); color: #1d1f3a; }
    .fs app-icon { color: var(--c); } .arr { color: #a3a7c2; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
    .stats div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; } .stats b { font-size: 17px; } .stats small { font-size: 11px; color: var(--muted); }
    .blue { color: #2563eb; } .green { color: #16a34a; } .red { color: #dc2626; }
    .facts { display: grid; grid-template-columns: 110px 1fr; gap: 6px; font-size: 12.5px; margin: 0; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .errt { color: var(--red); }
    @media (max-width: 1250px) { .wl.with-detail { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class WorkflowList {
  protected readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  protected readonly meta = NODE_META;
  protected readonly modules = MODULES;
  protected readonly categories = CATEGORIES;
  protected readonly templates = TEMPLATES;
  protected readonly fmtH = fmtH;
  protected readonly tag = statusTagCls;
  protected readonly weeks = ['W37', 'W38', 'W39', 'W40', 'W41', 'W42'];
  protected readonly selId = signal<string | null>('WFD-001');
  protected readonly cat = signal('All');
  protected readonly newOpen = signal(false);
  protected readonly nw = signal({ name: '', module: MODULES[0], category: CATEGORIES[1], from: '' });
  protected readonly err = signal('');
  protected readonly toastS = signal<string | null>(null);

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Workflow', kind: 'icon' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => statusTagCls(r.status) },
    { key: 'version', label: 'Version' },
    { key: 'steps', label: 'Steps', kind: 'num' },
    { key: 'runningN', label: 'Running', kind: 'num' },
    { key: 'total', label: 'Instances', kind: 'num' },
    { key: 'owner', label: 'Owner' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Draft', 'Inactive', 'Archived'] },
    { key: 'module', label: 'Module', options: MODULES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'open', label: 'Open in Designer', icon: 'workflow' },
    { id: 'duplicate', label: 'Duplicate', icon: 'workflow-copy' },
    { id: 'activate', label: 'Activate', icon: 'workflow-check', when: (r) => r.status !== 'Active' },
    { id: 'deactivate', label: 'Deactivate', icon: 'pause', when: (r) => r.status === 'Active' },
    { id: 'archive', label: 'Archive', icon: 'box', danger: true, when: (r) => r.status !== 'Archived' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'activate', label: 'Activate' }, { id: 'deactivate', label: 'Deactivate' }, { id: 'export', label: 'Export' }];

  protected readonly rows = computed(() => {
    const insts = this.store.instances();
    return this.store.workflows()
      .filter((w) => this.cat() === 'All' || w.category === this.cat())
      .map((w) => {
        const mine = insts.filter((i) => i.wfId === w.id);
        return { ...w, steps: w.nodes.length, total: mine.length, runningN: mine.filter((i) => i.status === 'In Progress').length };
      });
  });
  protected readonly cats = computed(() => {
    const ws = this.store.workflows();
    return [{ name: 'All', n: ws.length }, ...CATEGORIES.map((c) => ({ name: c, n: ws.filter((w) => w.category === c).length })).filter((c) => c.n)];
  });
  protected readonly sel = computed(() => this.store.workflows().find((w) => w.id === this.selId()) ?? null);
  protected readonly modulesUsed = computed(() => new Set(this.store.workflows().map((w) => w.module)).size);
  protected readonly avgAll = computed(() => fmtH(avgHours(this.store.instances())));

  protected count(s: string) {
    return this.store.workflows().filter((w) => w.status === s).length;
  }
  protected inst(w: Workflow) {
    return this.store.instances().filter((i) => i.wfId === w.id);
  }
  protected by(w: Workflow, s: string) {
    return this.inst(w).filter((i) => i.status === s).length;
  }
  protected avg(w: Workflow) {
    return avgHours(this.inst(w));
  }
  protected sla(w: Workflow) {
    return slaPct(this.inst(w));
  }
  protected flow(w: Workflow) {
    return orderedSteps(w.nodes, w.edges).filter((n) => n.type !== 'condition' || true).slice(0, 12);
  }
  protected weekly(w: Workflow) {
    const now = demoNow();
    const vals = [5, 4, 3, 2, 1, 0].map((k) => this.inst(w).filter((i) => i.startedAt <= now - k * 168 * H && i.startedAt > now - (k + 1) * 168 * H).length);
    const base = Math.max(1, Math.round(this.inst(w).length / 6));
    return [{ name: 'Instances', color: w.color, values: vals.map((v, i) => v || Math.max(0, base - (i % 3))) }];
  }
  protected open(w: Workflow) {
    this.store.currentId.set(w.id);
    this.router.navigate(['/workflow-automation/workflow-designer']);
  }
  protected act(a: string, w: Workflow) {
    if (a === 'open') return this.open(w);
    if (a === 'duplicate') {
      const c = { ...JSON.parse(JSON.stringify(w)), id: this.store.nextWfId(), name: w.name + ' (Copy)', status: 'Draft', version: 'v0.1', updated: 'Just now' };
      this.store.workflows.update((l) => [c, ...l]);
      this.selId.set(c.id);
      return toast(this.toastS, `Duplicated as ${c.name}`);
    }
    const status = a === 'activate' ? 'Active' : a === 'deactivate' ? 'Inactive' : 'Archived';
    this.store.patchWf(w.id, { status, updated: 'Just now' });
    toast(this.toastS, `${w.name} → ${status}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.store.workflows().filter((w) => ids.includes(w.id)));
    ids.forEach((id) => this.store.patchWf(id, { status: a === 'activate' ? 'Active' : 'Inactive' }));
    toast(this.toastS, `${ids.length} workflows ${a}d`);
  }
  protected create() {
    const v = this.nw();
    if (!v.name.trim()) return this.err.set('Workflow name is required.');
    const w = this.store.blank(v.name.trim(), v.module, v.category);
    if (v.from) {
      const src = this.store.workflows().find((x) => x.id === v.from)!;
      Object.assign(w, JSON.parse(JSON.stringify({ nodes: src.nodes, edges: src.edges })));
    }
    this.store.addWorkflow(w);
    this.router.navigate(['/workflow-automation/workflow-designer']);
  }
  protected importFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) throw new Error('missing nodes/edges');
        const w = { ...this.store.blank(j.name || f.name.replace('.json', ''), j.module || MODULES[0], j.category || CATEGORIES[1]), nodes: j.nodes, edges: j.edges, description: j.description || '' };
        this.store.workflows.update((l) => [w, ...l]);
        this.selId.set(w.id);
        toast(this.toastS, `Imported ${w.name} (${w.nodes.length} steps) as Draft`);
      } catch (err) {
        toast(this.toastS, `Import failed: ${(err as Error).message}`);
      }
    });
  }
  protected exportCsv(list = this.store.workflows()) {
    const insts = this.store.instances();
    downloadCsv('workflows.csv', [['ID', 'Name', 'Category', 'Module', 'Status', 'Version', 'Steps', 'Instances', 'Owner', 'Updated'], ...list.map((w) => [w.id, w.name, w.category, w.module, w.status, w.version, w.nodes.length, insts.filter((i) => i.wfId === w.id).length, w.owner, w.updated])]);
  }
}

/* =========================================================================
   Workflow Instances
   ========================================================================= */
const INST_TABS = ['All', 'In Progress', 'Overdue', 'Approved', 'Rejected', 'Cancelled'] as const;

@Component({
  selector: 'app-workflow-workflow-instances',
  imports: [...UI, DataTable, WfInstanceDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workflow Instances" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="Track every running and completed request — where it is, who holds it and whether it will meet SLA.">
      <button class="btn-primary" (click)="startOpen.set(true)"><app-icon name="workflow-play" [size]="15" />Start Instance</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Running" [value]="cnt('In Progress')" icon="activity" color="#3b82f6" change="8%" sub="vs. last week" />
      <app-kpi label="Overdue" [value]="overdue()" icon="triangle-alert" color="#ef4444" change="3" [good]="false" sub="past SLA" />
      <app-kpi label="Approved" [value]="cnt('Approved')" icon="workflow-check" color="#22c55e" [sub]="approvalRate() + '% approval rate'" />
      <app-kpi label="Rejected" [value]="cnt('Rejected')" icon="workflow-x" color="#f97316" sub="last 30 days" />
      <app-kpi label="Avg. Cycle Time" [value]="avg()" icon="workflow-timer" color="#7c3aed" change="11%" [up]="false" sub="vs. last month" />
      <app-kpi label="SLA Compliance" [value]="sla() + '%'" icon="shield-check" color="#0d9488" change="1.8%" sub="vs. last month" />
    </section>

    <section class="ig">
      <div class="card">
        <nav class="tabs st-tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}<span class="count">{{ tabCount(t) }}</span></button>}</nav>
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="instances" [pageSize]="12"
          [searchKeys]="['id', 'workflow', 'requester', 'assignee', 'summary']" searchPlaceholder="Search ID, workflow, requester, approver..." [activeId]="drawer()"
          (rowClick)="drawer.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Live Activity</h3><em class="chip live"><i></i>Live</em></div>
          <ul class="feed">
            @for (a of feed(); track $index) {<li><i [style.background]="a.color"></i><div><b>{{ a.text }}</b><small>{{ a.at }}</small></div></li>}
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Running by Workflow</h3></div>
          <app-bar-list [rows]="byWf()" [max]="maxWf()" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Where requests wait</h3></div>
          <app-donut [segments]="byStep()" center="Waiting" [value]="'' + cnt('In Progress')" [size]="130" />
        </div>
      </div>
    </section>

    @if (startOpen()) {
      <div class="g-overlay" (click)="startOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Start a workflow instance</h3><button class="close-btn" (click)="startOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Workflow<select class="select" [value]="startWf()" (change)="startWf.set($any($event.target).value)">@for (w of activeWfs(); track w.id) {<option [value]="w.id">{{ w.name }}</option>}</select></label>
          <label>On behalf of<select class="select" [value]="startWho()" (change)="startWho.set($any($event.target).value)">@for (p of people; track p) {<option>{{ p }}</option>}</select></label>
          <label>Summary<input class="input" [value]="startSum()" (input)="startSum.set($any($event.target).value)" placeholder="e.g. Annual Leave · 3 days" /></label>
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="startOpen.set(false)">Cancel</button><button class="btn-primary" (click)="start()">Start</button></div>
      </div>
    }
    <app-wf-instance-drawer [instId]="drawer()" (closed)="drawer.set(null)" (done)="msg($event)" />
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .ig { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .st-tabs { margin-bottom: 10px; }
    .feed { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; }
    .feed li { display: grid; grid-template-columns: 10px 1fr; gap: 9px; padding: 6px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; }
    .feed i { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; } .feed b { font-weight: 500; } .feed small { display: block; color: var(--muted); font-size: 11px; }
    @media (max-width: 1250px) { .ig { grid-template-columns: 1fr; } }
  `,
})
export class WorkflowInstances {
  protected readonly store = inject(WorkflowStore);
  protected readonly tabs = INST_TABS;
  protected readonly people = NAMES;
  protected readonly tab = signal<(typeof INST_TABS)[number]>('All');
  protected readonly drawer = signal<string | null>(null);
  protected readonly toastS = signal<string | null>(null);
  protected readonly startOpen = signal(false);
  protected readonly startWf = signal('WFD-001');
  protected readonly startWho = signal(NAMES[0]);
  protected readonly startSum = signal('');

  protected readonly cols: Col[] = [
    { key: 'id', label: 'ID' },
    { key: 'workflow', label: 'Workflow' },
    { key: 'requester', label: 'Requested By', kind: 'person', sub: 'dept' },
    { key: 'step', label: 'Current Step' },
    { key: 'assignee', label: 'With' },
    { key: 'st', label: 'Status', kind: 'tag', tag: (r) => statusTagCls(r.st) },
    { key: 'started', label: 'Started On' },
    { key: 'due', label: 'SLA Due' },
  ];
  protected readonly filters = [
    { key: 'workflow', label: 'Workflow', options: [...new Set(this.store.workflows().map((w) => w.name.replace(' Workflow', '')))] },
    { key: 'priority', label: 'Priority', options: ['High', 'Medium', 'Low'] },
    { key: 'dept', label: 'Department', options: ['Operations', 'Engineering', 'Sales', 'Finance', 'HR', 'IT', 'Logistics', 'Security'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'eye' },
    { id: 'escalate', label: 'Escalate', icon: 'arrow-up', when: (r) => r.status === 'In Progress' },
    { id: 'retry', label: 'Restart', icon: 'refresh', when: (r) => r.status === 'Rejected' || r.status === 'Cancelled' },
    { id: 'cancel', label: 'Cancel', icon: 'workflow-x', danger: true, when: (r) => r.status === 'In Progress' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'escalate', label: 'Escalate' }, { id: 'export', label: 'Export' }, { id: 'cancel', label: 'Cancel', danger: true }];

  private readonly all = computed(() =>
    this.store.instances().map((i) => ({ ...i, st: instStatus(i), step: currentStep(i), started: fmtDT(i.startedAt), due: i.status === 'In Progress' ? fmtAgo(i.dueAt).replace(' ago', ' overdue').replace('Just now', 'due now') : '—' })),
  );
  protected readonly rows = computed(() => {
    const t = this.tab();
    return this.all().filter((i) => t === 'All' || i.st === t || (t === 'In Progress' && i.status === 'In Progress'));
  });
  protected tabCount(t: string) {
    return t === 'All' ? this.all().length : t === 'In Progress' ? this.cnt('In Progress') : this.all().filter((i) => i.st === t).length;
  }
  protected cnt(s: string) {
    return this.store.instances().filter((i) => i.status === s).length;
  }
  protected readonly overdue = computed(() => this.store.instances().filter(isOverdue).length);
  protected readonly approvalRate = computed(() => Math.round((this.cnt('Approved') / Math.max(1, this.cnt('Approved') + this.cnt('Rejected'))) * 100));
  protected readonly avg = computed(() => fmtH(avgHours(this.store.instances())));
  protected readonly sla = computed(() => slaPct(this.store.instances()));
  protected readonly feed = computed(() => {
    const live = this.store.activity();
    const seed = this.store.instances().slice(0, 10).map((i) => ({ at: fmtAgo(i.log[i.log.length - 1].at), text: `${i.id} · ${i.log[i.log.length - 1].text}`, color: i.status === 'Approved' ? '#22c55e' : i.status === 'Rejected' ? '#ef4444' : '#3b82f6' }));
    return [...live, ...seed].slice(0, 14);
  });
  protected readonly byWf = computed(() => {
    const m = new Map<string, number>();
    this.store.running().forEach((i) => m.set(i.workflow, (m.get(i.workflow) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value, display: String(value), color: '#7c3aed' }));
  });
  protected readonly maxWf = computed(() => Math.max(1, ...this.byWf().map((r) => r.value)));
  protected readonly byStep = computed(() => {
    const m = new Map<string, number>();
    this.store.running().forEach((i) => {
      const s = currentStep(i);
      const k = /approval|review|sign-off|audit|acceptance/i.test(s) ? 'Approvals' : /form|request|claim|submission|upload|resignation|invite|report/i.test(s) ? 'Requester' : 'System / Tasks';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    const colors: Record<string, string> = { Approvals: '#3b82f6', Requester: '#f59e0b', 'System / Tasks': '#7c3aed' };
    return [...m.entries()].map(([label, value]) => ({ label, value, color: colors[label] }));
  });
  protected readonly activeWfs = computed(() => this.store.workflows().filter((w) => w.status === 'Active' || w.status === 'Draft'));

  protected act(a: string, r: Instance) {
    if (a === 'view') return this.drawer.set(r.id);
    this.store.decide(r.id, a as 'escalate' | 'retry' | 'cancel');
    this.msg(`${r.id} ${a === 'retry' ? 'restarted' : a + 'd'}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.store.instances().filter((i) => ids.includes(i.id)));
    const ok = this.store.instances().filter((i) => ids.includes(i.id) && i.status === 'In Progress');
    ok.forEach((i) => this.store.decide(i.id, a as 'escalate' | 'cancel'));
    this.msg(`${ok.length} instances ${a === 'cancel' ? 'cancelled' : 'escalated'}`);
  }
  protected start() {
    const wf = this.store.workflows().find((w) => w.id === this.startWf())!;
    const i = this.store.addInstance(wf, this.startWho(), { summary: this.startSum() || 'Started by administrator' });
    this.startOpen.set(false);
    this.tab.set('All');
    this.drawer.set(i.id);
    this.msg(`${i.id} started · waiting on ${i.assignee}`);
  }
  protected exportCsv(list = this.store.instances()) {
    downloadCsv('workflow-instances.csv', [['ID', 'Workflow', 'Requester', 'Department', 'Summary', 'Status', 'Current Step', 'With', 'Started', 'SLA Due'], ...list.map((i) => [i.id, i.workflow, i.requester, i.dept, i.summary, instStatus(i), currentStep(i), i.assignee, fmtDT(i.startedAt), fmtDT(i.dueAt)])]);
  }
  protected msg(m: string) {
    toast(this.toastS, m);
  }
}

/* =========================================================================
   My Tasks & Approvals
   ========================================================================= */
const TASK_TABS = ['Pending', 'Overdue', 'Delegated', 'Completed'] as const;

@Component({
  selector: 'app-workflow-my-tasks-approvals',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="My Tasks &amp; Approvals" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="Everything waiting on you — approve, reject or delegate in one place.">
      <button class="btn-primary" [disabled]="!checked().size" (click)="bulkApprove()"><app-icon name="workflow-check" [size]="16" />Approve selected ({{ checked().size }})</button>
      <button class="btn-ghost" (click)="ooo.set(!ooo()); msg(ooo() ? 'Out-of-office on · new approvals go to Grace Park' : 'Out-of-office off')"><app-icon name="workflow-send" [size]="15" />{{ ooo() ? 'Out of office: ON' : 'Set out of office' }}</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Pending My Approval" [value]="pending().length" icon="workflow-inbox" color="#7c3aed" sub="assigned to Rex Kumar" />
      <app-kpi label="Due Today" [value]="dueToday()" icon="workflow-timer" color="#f59e0b" sub="within 24 h" />
      <app-kpi label="Overdue" [value]="overdueList().length" icon="triangle-alert" color="#ef4444" [sub]="overdueList().length ? 'escalation pending' : 'all on time'" [subColor]="overdueList().length ? '#dc2626' : '#16a34a'" />
      <app-kpi label="Completed by Me" [value]="completed().length" icon="workflow-check" color="#22c55e" change="14%" sub="vs. last month" />
      <app-kpi label="Avg. Response" value="5.2 h" icon="clock" color="#3b82f6" change="0.8 h" [up]="false" sub="faster than team avg" />
    </section>

    <section class="mt">
      <div class="card inbox">
        <nav class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t); clearChecked()">{{ t }}<span class="count">{{ listFor(t).length }}</span></button>}</nav>
        <div class="search-box sb"><app-icon name="search" [size]="15" /><input placeholder="Search requester, workflow, ID..." [value]="q()" (input)="q.set($any($event.target).value)" /></div>
        @if (tab() === 'Pending' || tab() === 'Overdue') {
          <label class="all"><input type="checkbox" [checked]="list().length > 0 && checked().size === list().length" (change)="toggleAll()" /> Select all</label>
        }
        <ul class="items">
          @for (i of list(); track i.id) {
            <li [class.on]="selId() === i.id" (click)="selId.set(i.id)">
              @if (tab() === 'Pending' || tab() === 'Overdue') {<input type="checkbox" [checked]="checked().has(i.id)" (click)="$event.stopPropagation()" (change)="toggle(i.id)" />}
              <span class="dt-av" [style.background]="i.avatar">{{ i.initials }}</span>
              <div class="it-b"><b>{{ i.requester }}</b><small>{{ i.workflow }} · {{ i.summary }}</small><small class="muted">{{ i.id }} · {{ cur(i) }}</small></div>
              <div class="it-r"><span [class]="prio(i.priority)">{{ i.priority }}</span><small [class.bad]="isOver(i)">{{ dueLabel(i) }}</small></div>
            </li>
          } @empty {
            <li class="empty"><app-icon name="workflow-check" [size]="22" />{{ tab() === 'Delegated' ? 'Nothing delegated.' : 'Inbox zero — nothing here.' }}</li>
          }
        </ul>
      </div>

      @if (sel(); as i) {
        <div class="card det">
          <div class="dh">
            <span class="dt-av big" [style.background]="i.avatar">{{ i.initials }}</span>
            <div><h2>{{ i.workflow }}</h2><span class="muted">{{ i.id }} · requested by {{ i.requester }} ({{ i.dept }}) · {{ fd(i.startedAt) }}</span></div>
            <span [class]="tag(st(i))">{{ st(i) }}</span>
          </div>
          <div class="req">
            <div><small>Request</small><b>{{ i.summary }}</b></div>
            <div><small>Current step</small><b>{{ cur(i) }}</b></div>
            <div><small>SLA due</small><b [class.bad]="isOver(i)">{{ fd(i.dueAt) }}</b></div>
            <div><small>Priority</small><b>{{ i.priority }}</b></div>
          </div>
          @if (i.wfId === 'WFD-001') {
            <div class="ctx">
              <app-icon name="lightbulb" [size]="16" />
              <span>{{ i.requester.split(' ')[0] }} has <b>{{ 12 + (i.id.charCodeAt(7) % 9) }} days</b> annual balance · <b>{{ i.id.charCodeAt(6) % 3 }}</b> team members already off that week · no roster conflicts.</span>
            </div>
          }
          <h4>Approval path</h4>
          <div class="path">
            @for (s of i.steps; track $index) {
              <span class="ps" [class.done]="$index < i.stepIdx || i.status === 'Approved'" [class.cur]="$index === i.stepIdx && i.status === 'In Progress'" [class.rej]="$index === i.stepIdx && i.status === 'Rejected'">{{ s }}</span>
              @if (!$last) {<app-icon name="chevron-right" [size]="13" class="arr" />}
            }
          </div>
          <h4>History</h4>
          <ul class="log">@for (l of i.log.slice().reverse(); track $index) {<li><i></i><b>{{ l.text }}</b><small>{{ l.by }} · {{ fd(l.at) }}</small></li>}</ul>
          @if (i.status === 'In Progress' && i.assignee === me) {
            <textarea class="input" rows="2" placeholder="Add a comment for the requester (required to reject)" [value]="note()" (input)="note.set($any($event.target).value)"></textarea>
            @if (err()) {<p class="errt">{{ err() }}</p>}
            <div class="acts">
              <button class="btn-primary" (click)="decide('approve')"><app-icon name="workflow-check" [size]="15" />Approve</button>
              <button class="btn-ghost danger" (click)="decide('reject')"><app-icon name="workflow-x" [size]="15" />Reject</button>
              <div class="menu-wrap">
                <button class="btn-ghost" (click)="delOpen.set(!delOpen())"><app-icon name="users" [size]="15" />Delegate</button>
                @if (delOpen()) {<div class="dropdown">@for (p of delegates; track p) {<button class="dd-item" (click)="delegate(p)">{{ p }}</button>}</div>}
              </div>
              <button class="btn-ghost" (click)="askInfo()"><app-icon name="message" [size]="15" />Request info</button>
            </div>
          } @else {
            <p class="muted">{{ i.status === 'In Progress' ? 'Now with ' + i.assignee + '.' : 'Closed ' + (i.endedAt ? fd(i.endedAt) : '') + '.' }}</p>
          }
        </div>
      } @else {
        <div class="card det empty-d"><app-icon name="workflow-inbox" [size]="34" /><p>Select a request to review it.</p></div>
      }
    </section>
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .mt { display: grid; grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.4fr); gap: 12px; align-items: start; }
    .inbox { display: flex; flex-direction: column; gap: 10px; }
    .sb { width: 100%; } .all { font-size: 12px; color: #4b4f6b; display: flex; align-items: center; gap: 6px; }
    .items { list-style: none; margin: 0; padding: 0; max-height: 640px; overflow: auto; }
    .items li { display: grid; grid-template-columns: auto 32px 1fr auto; gap: 10px; align-items: center; padding: 10px 8px; border-radius: 8px; cursor: pointer; border-bottom: 1px solid #f0f1f6; }
    .items li:hover { background: #faf8ff; } .items li.on { background: #f3efff; box-shadow: inset 3px 0 0 var(--primary); }
    .it-b { display: flex; flex-direction: column; min-width: 0; font-size: 12.5px; } .it-b small { font-size: 11px; color: #4b4f6b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .it-r { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; } .it-r small { font-size: 10.5px; color: var(--muted); white-space: nowrap; }
    .bad { color: var(--red) !important; font-weight: 600; }
    .empty { display: flex !important; justify-content: center; gap: 8px; color: var(--muted); cursor: default !important; padding: 30px !important; }
    .det { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 76px; }
    .dh { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; } .dh h2 { margin: 0; font-size: 18px; } .dh .muted { font-size: 12px; }
    .dt-av.big { width: 48px; height: 48px; font-size: 15px; }
    .req { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 6px; }
    .req div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; } .req small { font-size: 11px; color: var(--muted); } .req b { font-size: 13px; }
    .ctx { display: flex; gap: 8px; align-items: center; padding: 9px 12px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 12.5px; }
    h4 { margin: 8px 0 2px; font-size: 13px; }
    .path { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .ps { padding: 4px 10px; border-radius: 14px; font-size: 11.5px; background: #eef0f5; color: #4b4f6b; }
    .ps.done { background: #dcfce7; color: #15803d; } .ps.cur { background: #dbeafe; color: #1d4ed8; font-weight: 600; box-shadow: 0 0 0 2px #93c5fd; } .ps.rej { background: #fee2e2; color: #b91c1c; }
    .arr { color: #a3a7c2; }
    .log { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow: auto; }
    .log li { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #f0f1f6; }
    .log i { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); } .log b { font-weight: 500; } .log small { color: var(--muted); font-size: 11px; }
    textarea { width: 100%; resize: vertical; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; }
    .danger { color: var(--red); } .errt { color: var(--red); margin: 0; font-size: 12px; }
    .empty-d { display: grid; place-items: center; min-height: 360px; color: var(--muted); text-align: center; }
    @media (max-width: 1100px) { .mt { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class MyTasksApprovals {
  protected readonly store = inject(WorkflowStore);
  protected readonly tabs = TASK_TABS;
  protected readonly me = ME;
  protected readonly delegates = ['Grace Park', 'Hannah Lee', 'Tom Baker', 'Vikram Rao', 'Meera Iyer'];
  protected readonly fd = fmtDT;
  protected readonly tag = statusTagCls;
  protected readonly st = instStatus;
  protected readonly cur = currentStep;
  protected readonly isOver = isOverdue;
  protected readonly tab = signal<(typeof TASK_TABS)[number]>('Pending');
  protected readonly q = signal('');
  protected readonly selId = signal<string | null>(null);
  protected readonly checked = signal(new Set<string>());
  protected readonly note = signal('');
  protected readonly err = signal('');
  protected readonly delOpen = signal(false);
  protected readonly ooo = signal(false);
  protected readonly toastS = signal<string | null>(null);

  protected readonly pending = computed(() => this.store.instances().filter((i) => i.status === 'In Progress' && i.assignee === ME).sort((a, b) => a.dueAt - b.dueAt));
  protected readonly overdueList = computed(() => this.pending().filter(isOverdue));
  protected readonly delegated = computed(() => this.store.instances().filter((i) => i.delegated && i.log.some((l) => l.by === ME && l.text.startsWith('Delegated'))));
  protected readonly completed = computed(() => this.store.instances().filter((i) => !(i.status === 'In Progress' && i.assignee === ME) && i.log.some((l) => l.by === ME && !l.text.startsWith('Delegated') && !l.text.startsWith('Submitted'))));
  protected readonly dueToday = computed(() => this.pending().filter((i) => i.dueAt - demoNow() < 24 * H).length);
  protected listFor(t: string) {
    return t === 'Pending' ? this.pending() : t === 'Overdue' ? this.overdueList() : t === 'Delegated' ? this.delegated() : this.completed().slice(0, 60);
  }
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return this.listFor(this.tab()).filter((i) => !q || `${i.id} ${i.requester} ${i.workflow} ${i.summary}`.toLowerCase().includes(q));
  });
  protected readonly sel = computed(() => {
    const id = this.selId();
    return (id && this.store.instances().find((i) => i.id === id)) || this.list()[0] || null;
  });

  protected prio(p: string) {
    return p === 'High' ? 'tag red' : p === 'Medium' ? 'tag amber' : 'tag grey';
  }
  protected dueLabel(i: Instance) {
    if (i.status !== 'In Progress') return i.status;
    const h = Math.round((i.dueAt - demoNow()) / H);
    return h < 0 ? `${-h} h overdue` : h < 24 ? `due in ${h} h` : `due in ${Math.round(h / 24)} d`;
  }
  protected toggle(id: string) {
    this.checked.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  protected clearChecked() {
    this.checked.set(new Set());
  }
  protected toggleAll() {
    this.checked.set(this.checked().size === this.list().length ? new Set() : new Set(this.list().map((i) => i.id)));
  }
  private nextAfter(id: string) {
    const l = this.list();
    const k = l.findIndex((i) => i.id === id);
    return l[k + 1]?.id ?? l[k - 1]?.id ?? null;
  }
  protected decide(a: 'approve' | 'reject') {
    const i = this.sel()!;
    if (a === 'reject' && !this.note().trim()) return this.err.set('Please add a comment explaining the rejection.');
    const next = this.nextAfter(i.id);
    this.store.decide(i.id, a, this.note());
    this.note.set('');
    this.err.set('');
    this.selId.set(next);
    this.msg(`${i.id} ${a === 'approve' ? 'approved' : 'rejected'} · ${i.requester} notified`);
  }
  protected delegate(p: string) {
    const i = this.sel()!;
    const next = this.nextAfter(i.id);
    this.delOpen.set(false);
    this.store.decide(i.id, 'delegate', this.note(), p);
    this.selId.set(next);
    this.msg(`${i.id} delegated to ${p}`);
  }
  protected askInfo() {
    const i = this.sel()!;
    this.store.patchInst(i.id, { log: [...i.log, { at: demoNow(), text: `More information requested${this.note() ? ' · “' + this.note() + '”' : ''}`, by: ME }] });
    this.note.set('');
    this.msg(`Information request sent to ${i.requester}`);
  }
  protected bulkApprove() {
    const ids = [...this.checked()];
    ids.forEach((id) => this.store.decide(id, 'approve', 'Bulk approved'));
    this.checked.set(new Set());
    this.selId.set(null);
    this.msg(`${ids.length} requests approved`);
  }
  protected msg(m: string) {
    toast(this.toastS, m);
  }
}
