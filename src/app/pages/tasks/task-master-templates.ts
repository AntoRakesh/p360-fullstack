import { ChangeDetectionStrategy, Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { TASKS_UI } from './tasks-ui';
import {
  CAT_NAMES, CATEGORIES, catMeta, catOf, DEPTS, ESCALATION_ROLES, fmtStamp, FREQUENCIES, PRIORITIES, ROLES, SEED_TEMPLATES, TAG_OPTIONS, TASK_SITES, TaskStore, Template,
  USAGE_CREATED, USAGE_DONE, USAGE_LABELS,
} from './tasks.data';

const FORM_TABS = ['Basic Details', 'Checklist & Steps', 'Assignment & Schedule', 'SLA & Escalation'] as const;
const MORE_TABS = ['Verification & Evidence', 'Version History'] as const;
type FormTab = (typeof FORM_TABS)[number] | (typeof MORE_TABS)[number];
const STATUS_OPTS: [string, string][] = [['Published', 'Status: Active'], ['Draft', 'Status: Draft'], ['Archived', 'Status: Archived'], ['All', 'Status: All']];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PERIODS = ['This Week', 'This Month', 'Last Month', 'This Quarter'];
const LIBRARY = [
  { name: 'Lift Lobby Cleaning', category: 'Housekeeping', frequency: 'Daily', duration: 15 },
  { name: 'Access Control Door Audit', category: 'Security', frequency: 'Weekly', duration: 30 },
  { name: 'Water Tank Inspection', category: 'Facility Maintenance', frequency: 'Monthly', duration: 40 },
  { name: 'AED Readiness Check', category: 'Safety', frequency: 'Weekly', duration: 10 },
  { name: 'Conference AV Test', category: 'IT Support', frequency: 'Daily', duration: 10 },
  { name: 'Food Temperature Log', category: 'Canteen', frequency: 'Shift-wise', duration: 10 },
];
const COLS = ['Category', 'Frequency', 'Estimated Duration', 'Applicable To', 'Status'] as const;

@Component({
  selector: 'app-tasks-task-master-templates',
  imports: [...UI, ...TASKS_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenus($event)' },
  template: `
    <app-page-head title="Task Master &amp; Templates" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Create and manage standardized tasks, templates, checklists and workflows for all workforce operations.">
      <button class="btn-primary big" (click)="newTemplate()"><app-icon name="plus" [size]="16" />New Task Template</button>
      <div class="menu-wrap" data-menu>
        <button class="btn-ghost big" (click)="toggleMenu('import')"><app-icon name="tasks-import" [size]="16" />Import Templates<app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'import') {
          <div class="dropdown">
            <label class="dd-item"><app-icon name="tasks-upload" [size]="15" />Upload CSV file<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
            <button class="dd-item" (click)="menu.set(null); library.set(true)"><app-icon name="layers" [size]="15" />From template library</button>
            <button class="dd-item" (click)="sampleCsv()"><app-icon name="download" [size]="15" />Download sample CSV</button>
          </div>
        }
      </div>
      <div class="menu-wrap split" data-menu>
        <button class="btn-ghost big" (click)="exportCsv()"><app-icon name="tasks-upload" [size]="16" />Export</button>
        <button class="btn-ghost big caret" (click)="toggleMenu('export')" aria-label="Export options"><app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'export') {
          <div class="dropdown">
            <button class="dd-item" (click)="exportCsv()"><app-icon name="file-text" [size]="15" />Export filtered (CSV)</button>
            <button class="dd-item" (click)="exportCsv(store.templates())"><app-icon name="file-text" [size]="15" />Export all 128 (CSV)</button>
            <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="file-chart" [size]="15" />Print / PDF</button>
          </div>
        }
      </div>
      <div class="menu-wrap" data-menu>
        <button class="btn-ghost big kebab" (click)="toggleMenu('more')" aria-label="More"><app-icon name="more" [size]="18" /></button>
        @if (menu() === 'more') {
          <div class="dropdown">
            <button class="dd-item" (click)="go('task-assignment-scheduling')"><app-icon name="calendar-days" [size]="15" />Schedule tasks from templates</button>
            <button class="dd-item" (click)="go('sla-escalations')"><app-icon name="bell" [size]="15" />SLA policies</button>
            <button class="dd-item" (click)="resetData()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Total Task Templates" [value]="store.templates().length" icon="tasks-clipboard" color="var(--ka-7c3aed)" change="12%" sub="vs. last month" />
      <app-tkpi label="Active Templates" [value]="store.activeTemplates()" icon="layers" color="var(--ka-22c55e)" [pct]="activePct() + '%'" sub="of total" />
      <app-tkpi label="Tasks Created (This Month)" [value]="fmt(store.month().created)" icon="clock" color="var(--ka-f59e0b)" change="18%" sub="vs. last month" />
      <app-tkpi label="Completed Tasks" [value]="fmt(store.month().completed)" icon="tasks-check-circle" color="var(--ka-2563eb)" [pct]="store.month().rate + '%'" pctColor="var(--ka-2563eb)" sub="completion rate" />
      <app-tkpi label="Overdue Tasks" [value]="fmt(store.month().overdue)" icon="triangle-alert" color="var(--ka-ef4444)" change="32%" changeColor="var(--ka-ef4444)" sub="vs. last month" />
    </section>

    <section class="filters">
      <label class="search-box fsearch"><app-icon name="search" [size]="16" /><input placeholder="Search templates by name, category, department..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
      <select class="select f" [value]="cat()" (change)="cat.set($any($event.target).value); page.set(0)"><option value="All">All Categories</option>@for (c of catNames; track c) {<option [value]="c">{{ c }}</option>}</select>
      <select class="select f" [value]="dept()" (change)="dept.set($any($event.target).value); page.set(0)"><option value="All">All Departments</option>@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select>
      <select class="select f" [value]="site()" (change)="site.set($any($event.target).value); page.set(0)"><option value="All">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
      <select class="select f" [value]="status()" (change)="status.set($any($event.target).value); page.set(0)">@for (o of statusOpts; track o[0]) {<option [value]="o[0]">{{ o[1] }}</option>}</select>
      <div class="menu-wrap" data-menu>
        <button class="btn-ghost f mf" [class.on]="moreCount()" (click)="toggleMenu('filters')"><app-icon name="filter" [size]="15" />More Filters @if (moreCount()) {<em>{{ moreCount() }}</em>}<app-icon name="chevron-down" [size]="13" /></button>
        @if (menu() === 'filters') {
          <div class="dropdown pop">
            <h5>Frequency</h5>
            <div class="chips">@for (f of frequencies; track f) {<button [class.on]="freqF().includes(f)" (click)="toggleIn(freqF, f)">{{ f }}</button>}</div>
            <h5>Priority</h5>
            <div class="chips">@for (p of priorities; track p) {<button [class.on]="prioF().includes(p)" (click)="toggleIn(prioF, p)">{{ p }}</button>}</div>
            <h5>Applicable To</h5>
            <select class="select" [value]="roleF()" (change)="roleF.set($any($event.target).value); page.set(0)"><option value="All">All roles</option>@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select>
            <div class="pop-foot"><button class="link" (click)="clearMore()">Clear</button><button class="btn-primary btn-sm" (click)="menu.set(null)">Apply</button></div>
          </div>
        }
      </div>
      <div class="vt">
        <button [class.on]="view() === 'grid'" (click)="view.set('grid')"><app-icon name="grid" [size]="15" />Grid</button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="tasks-list" [size]="15" />List</button>
      </div>
      <div class="menu-wrap" data-menu>
        <button class="btn-ghost f icon-only" (click)="toggleMenu('cols')" title="Customize columns" aria-label="Customize columns"><app-icon name="tasks-target" [size]="17" /></button>
        @if (menu() === 'cols') {
          <div class="dropdown pop narrow">
            <h5>Visible columns</h5>
            @for (c of colNames; track c) {<label class="ck"><input type="checkbox" [checked]="!hidden().has(c)" (change)="toggleCol(c)" />{{ c }}</label>}
          </div>
        }
      </div>
    </section>

    <section class="main">
      <div class="card tcard">
        <div class="tc-head">
          <h3>Task Templates</h3>
          @if (picked().size) {
            <div class="bulk">
              <b>{{ picked().size }} selected</b>
              <button class="btn-ghost sm" (click)="bulk('Active')">Activate</button>
              <button class="btn-ghost sm" (click)="bulk('Inactive')">Deactivate</button>
              <button class="btn-ghost sm" (click)="exportCsv(selectedRows())">Export</button>
              <button class="btn-ghost sm danger" (click)="bulk('Archived')">Archive</button>
              <button class="link" (click)="clearPicked()">Clear</button>
            </div>
          }
        </div>
        @if (view() === 'grid') {
          <div class="tw">
            <table class="tt">
              <thead>
                <tr>
                  <th class="cb"><input type="checkbox" [checked]="allPicked()" (change)="pickPage()" /></th>
                  <th class="sortable" (click)="sortBy('name')">Template Name{{ arrow('name') }}</th>
                  @if (!hidden().has('Category')) {<th class="sortable" (click)="sortBy('category')">Category{{ arrow('category') }}</th>}
                  @if (!hidden().has('Frequency')) {<th class="sortable" (click)="sortBy('frequency')">Frequency{{ arrow('frequency') }}</th>}
                  @if (!hidden().has('Estimated Duration')) {<th class="sortable" (click)="sortBy('duration')">Estimated Duration{{ arrow('duration') }}</th>}
                  @if (!hidden().has('Applicable To')) {<th class="sortable" (click)="sortBy('applicableTo')">Applicable To{{ arrow('applicableTo') }}</th>}
                  @if (!hidden().has('Status')) {<th class="sortable c" (click)="sortBy('status')">Status{{ arrow('status') }}</th>}
                  <th class="c">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (t of pageRows(); track t.id) {
                  <tr [class.sel]="draft().id === t.id" (click)="edit(t)">
                    <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="picked().has(t.id)" (change)="pick(t.id)" /></td>
                    <td><div class="nm"><span class="ti" [style.background]="t.color"><app-icon [name]="t.icon" [size]="16" /></span><b>{{ t.name }}</b>@if (t.lifecycle !== 'Published') {<em class="lc">{{ t.lifecycle }}</em>}</div></td>
                    @if (!hidden().has('Category')) {<td>{{ t.category }}</td>}
                    @if (!hidden().has('Frequency')) {<td>{{ t.frequency }}</td>}
                    @if (!hidden().has('Estimated Duration')) {<td>{{ t.duration }} mins</td>}
                    @if (!hidden().has('Applicable To')) {<td>{{ t.applicableTo }}</td>}
                    @if (!hidden().has('Status')) {<td class="c"><span class="st" [class.off]="t.status !== 'Active'"><i></i>{{ t.status }}</span></td>}
                    <td class="c menu-wrap" data-menu (click)="$event.stopPropagation()">
                      <button class="dots" (click)="toggleMenu('row:' + t.id)" aria-label="Row actions">•••</button>
                      @if (menu() === 'row:' + t.id) {
                        <div class="dropdown">
                          <button class="dd-item" (click)="menu.set(null); edit(t)"><app-icon name="tasks-pencil" [size]="14" />Edit template</button>
                          <button class="dd-item" (click)="duplicate(t)"><app-icon name="tasks-copy" [size]="14" />Duplicate</button>
                          <button class="dd-item" (click)="createTask(t)"><app-icon name="plus" [size]="14" />Create task now</button>
                          <button class="dd-item" (click)="toggleStatus(t)"><app-icon [name]="t.status === 'Active' ? 'pause' : 'play'" [size]="14" />{{ t.status === 'Active' ? 'Deactivate' : 'Activate' }}</button>
                          @if (t.lifecycle === 'Draft') {<button class="dd-item" (click)="setLifecycle(t, 'Published')"><app-icon name="tasks-send" [size]="14" />Publish</button>}
                          <button class="dd-item danger" (click)="setLifecycle(t, t.lifecycle === 'Archived' ? 'Published' : 'Archived')"><app-icon name="tasks-trash" [size]="14" />{{ t.lifecycle === 'Archived' ? 'Restore' : 'Archive' }}</button>
                        </div>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty">No templates match these filters. <button class="link" (click)="clearAll()">Clear filters</button></td></tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="lv">
            @for (t of pageRows(); track t.id) {
              <button class="li" [class.sel]="draft().id === t.id" (click)="edit(t)">
                <span class="ti lg" [style.background]="t.color"><app-icon [name]="t.icon" [size]="20" /></span>
                <div><b>{{ t.name }}</b><small>{{ t.category }} · {{ t.frequency }} · {{ t.duration }} mins</small><small>{{ t.applicableTo }} · {{ t.steps.length }} steps · used {{ t.usage30 }}× in 30 days</small></div>
                <span class="st" [class.off]="t.status !== 'Active'"><i></i>{{ t.status }}</span>
              </button>
            }
          </div>
        }
        <div class="pg">
          <span>Showing {{ filtered().length ? page() * per + 1 : 0 }}–{{ min((page() + 1) * per, filtered().length) }} of {{ filtered().length }} templates</span>
          <div class="pages">
            <button [disabled]="page() === 0" (click)="page.set(page() - 1)" aria-label="Previous"><app-icon name="chevron-left" [size]="14" /></button>
            @for (p of pageList(); track $index) {
              @if (p < 0) {<span>…</span>} @else {<button [class.on]="p === page()" (click)="page.set(p)">{{ p + 1 }}</button>}
            }
            <button [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)" aria-label="Next"><app-icon name="chevron-right" [size]="14" /></button>
          </div>
        </div>
      </div>

      <form class="card ecard" (submit)="$event.preventDefault(); save()">
        <div class="ec-head"><h3>Create / Edit Task Template</h3>@if (isNew()) {<span class="tag">New</span>} @else {<span class="muted id">{{ draft().id }}</span>}</div>
        <nav class="ftabs">
          @for (t of formTabs; track t) {<button type="button" [class.on]="ftab() === t" (click)="ftab.set(t)">{{ t }}</button>}
          <div class="menu-wrap" data-menu>
            <button type="button" class="more-t" [class.on]="isMoreTab()" (click)="toggleMenu('ftabs')" aria-label="More sections"><app-icon name="chevron-down" [size]="12" [stroke]="2.6" /></button>
            @if (menu() === 'ftabs') {<div class="dropdown">@for (t of moreTabs; track t) {<button type="button" class="dd-item" (click)="ftab.set(t); menu.set(null)">{{ t }}</button>}</div>}
          </div>
        </nav>
        @let d = draft();
        <div class="fbody">
          @switch (ftab()) {
            @case ('Basic Details') {
              <label class="fl full"><span>Template Name <i>*</i></span><input class="input" [value]="d.name" (input)="set('name', $any($event.target).value)" placeholder="e.g. Washroom Cleaning" [class.err]="err() && !d.name.trim()" /></label>
              <label class="fl full">Description<textarea class="input" rows="2" [value]="d.description" (input)="set('description', $any($event.target).value)"></textarea></label>
              <div class="g2">
                <label class="fl"><span>Category <i>*</i></span><select class="select" [value]="d.category" (change)="setCategory($any($event.target).value)">@for (c of formCats(); track c) {<option [value]="c">{{ c }}</option>}</select></label>
                <label class="fl">Priority<select class="select prio" [class]="'select prio p-' + d.priority" [value]="d.priority" (change)="set('priority', $any($event.target).value)">@for (p of priorities; track p) {<option [value]="p">{{ p }}</option>}</select></label>
                <label class="fl"><span>Frequency <i>*</i></span><select class="select" [value]="d.frequency" (change)="set('frequency', $any($event.target).value)">@for (f of frequencies; track f) {<option [value]="f">{{ f }}</option>}</select></label>
                <label class="fl"><span>Estimated Duration <i>*</i></span><span class="dur"><input class="input" [value]="hm(d.duration)" (change)="setDuration($any($event.target).value)" /><em>(HH:MM)</em></span></label>
                <label class="fl"><span>Applicable To <i>*</i></span><select class="select" [value]="d.applicableTo" (change)="set('applicableTo', $any($event.target).value)">@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
                <label class="fl">Applicable Sites<select class="select" [value]="d.sites[0]" (change)="set('sites', [$any($event.target).value])"><option value="All Sites">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
                <div class="fl">Status<span class="sw"><app-tswitch [on]="d.status === 'Active'" (onChange)="set('status', $event ? 'Active' : 'Inactive')" />{{ d.status }}</span></div>
                <div class="fl">Tags
                  <div class="tags">
                    @for (tg of d.tags; track tg) {<span class="tg">{{ tg }}<button type="button" (click)="removeTag(tg)" aria-label="Remove tag">×</button></span>}
                    <select class="tag-add" (change)="addTag($any($event.target)); " aria-label="Add tag"><option value=""></option>@for (o of tagOptions; track o) {@if (!d.tags.includes(o)) {<option [value]="o">{{ o }}</option>}}</select>
                  </div>
                </div>
              </div>
            }
            @case ('Checklist & Steps') {
              <p class="hint">{{ d.steps.length }} steps · {{ reqCount() }} mandatory · workers complete these in the mobile app.</p>
              <ol class="steps">
                @for (s of d.steps; track $index; let i = $index) {
                  <li>
                    <span class="n">{{ i + 1 }}</span>
                    <input class="input" [value]="s.text" (input)="setStep(i, { text: $any($event.target).value })" />
                    <button type="button" class="chipb" [class.on]="s.required" (click)="setStep(i, { required: !s.required })" title="Mandatory">Req</button>
                    <button type="button" class="chipb" [class.on]="s.photo" (click)="setStep(i, { photo: !s.photo })" title="Photo evidence"><app-icon name="tasks-camera" [size]="13" /></button>
                    <button type="button" class="ib" [disabled]="i === 0" (click)="moveStep(i, -1)" aria-label="Move up"><app-icon name="arrow-up" [size]="13" /></button>
                    <button type="button" class="ib" (click)="removeStep(i)" aria-label="Remove step"><app-icon name="tasks-x" [size]="13" /></button>
                  </li>
                }
              </ol>
              <div class="add-step"><input class="input" #ns placeholder="Add a checklist step and press Enter" (keydown.enter)="$event.preventDefault(); addStep(ns)" /><button type="button" class="btn-ghost" (click)="addStep(ns)"><app-icon name="plus" [size]="14" />Add</button></div>
            }
            @case ('Assignment & Schedule') {
              <div class="g2">
                <label class="fl">Assignment Mode<select class="select" [value]="d.assignMode" (change)="set('assignMode', $any($event.target).value)">@for (m of ['Auto (Round-robin)', 'Skill based', 'Nearest available', 'Manual']; track m) {<option [value]="m">{{ m }}</option>}</select></label>
                <label class="fl">Default Team<select class="select" [value]="d.team" (change)="set('team', $any($event.target).value)">@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
                <label class="fl">Shift<select class="select" [value]="d.shift" (change)="set('shift', $any($event.target).value)">@for (s of ['Morning Shift', 'Evening Shift', 'Night Shift', '24x7 Rotation']; track s) {<option [value]="s">{{ s }}</option>}</select></label>
                <label class="fl">First Run Time<input class="input" type="time" [value]="d.startTime" (change)="set('startTime', $any($event.target).value)" /></label>
                <div class="fl full">Repeat On<div class="days">@for (dy of days; track dy) {<button type="button" [class.on]="d.days.includes(dy)" (click)="toggleDay(dy)">{{ dy }}</button>}</div></div>
              </div>
              <div class="preview"><app-icon name="calendar-days" [size]="16" /><span>Creates <b>{{ runsPerWeek() }}</b> tasks/week for <b>{{ d.team }}</b> · {{ d.frequency }} from {{ d.startTime }} · {{ d.sites[0] }}</span></div>
            }
            @case ('SLA & Escalation') {
              <div class="g2">
                <label class="fl">Response Time (mins)<input class="input" type="number" min="1" [value]="d.slaResponse" (change)="set('slaResponse', +$any($event.target).value)" /></label>
                <label class="fl">Resolution Time (mins)<input class="input" type="number" min="5" [value]="d.slaResolve" (change)="set('slaResolve', +$any($event.target).value)" /></label>
                <label class="fl">Level 1 Escalation<select class="select" [value]="d.escL1" (change)="set('escL1', $any($event.target).value)">@for (r of escRoles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
                <label class="fl">Level 2 Escalation<select class="select" [value]="d.escL2" (change)="set('escL2', $any($event.target).value)">@for (r of escRoles; track r) {<option [value]="r">{{ r }}</option>}</select></label>
              </div>
              <div class="ladder">
                <div><b>0 min</b><span>Task assigned · push to {{ d.applicableTo }}</span></div>
                <div><b>{{ d.slaResponse }} min</b><span>Not started → reminder to assignee</span></div>
                <div><b>{{ d.slaResolve }} min</b><span>Not completed → <em>L1 {{ d.escL1 }}</em></span></div>
                <div><b>{{ d.slaResolve * 2 }} min</b><span>Still open → <em class="r">L2 {{ d.escL2 }}</em></span></div>
              </div>
            }
            @case ('Verification & Evidence') {
              <div class="g2">
                <label class="fl full">Verification Method<select class="select" [value]="d.verify" (change)="set('verify', $any($event.target).value)">@for (v of ['None', 'Supervisor review', 'Photo + Supervisor', 'QR checkpoint scan', 'Geo-fence + Photo']; track v) {<option [value]="v">{{ v }}</option>}</select></label>
              </div>
              <p class="hint">Steps requiring photo evidence: {{ photoSteps() }}. Completed tasks appear in <button type="button" class="link" (click)="go('task-verification-approvals')">Task Verification &amp; Approvals</button>.</p>
            }
            @case ('Version History') {
              <ul class="hist">
                <li><b>v{{ version() }}</b><span>{{ stamp(d.updatedAt) }} · {{ d.updatedBy }}</span><small>Current version</small></li>
                <li><b>v{{ version() - 1 }}</b><span>02 Sep 2026, 11:05 AM · Grace Park</span><small>Checklist updated (+1 step)</small></li>
                <li><b>v1</b><span>12 Jan 2026, 09:30 AM · John Doe</span><small>Template created</small></li>
              </ul>
            }
          }
        </div>
        @if (err()) {<p class="bad errm">{{ err() }}</p>}
        <div class="factions"><button type="button" class="btn-ghost w" (click)="cancel()">Cancel</button><button type="submit" class="btn-primary w">Save Template</button></div>
      </form>
    </section>

    <section class="bottom">
      <div class="card">
        <div class="bh"><h3>Template Categories</h3><button class="link" (click)="catModal.set(true)">View All</button></div>
        <ul class="cats">
          @for (c of catCounts(); track c.name) {
            <li [class.on]="cat() === c.name" (click)="filterCat(c.name)"><span class="ci" [style.background]="c.tint"><app-icon [name]="c.icon" [size]="11" [stroke]="2.4" /></span><span>{{ c.name }}</span><b>{{ c.count }}</b></li>
          }
        </ul>
      </div>
      <div class="card">
        <div class="bh"><h3>Task Template Usage <small>(Last 30 Days)</small></h3></div>
        <div class="leg"><span><i style="background:var(--kb-7c3aed)"></i>Created from Template</span><span><i style="background:var(--kb-2563eb)"></i>Completed</span></div>
        <div class="uchart" (mouseleave)="uh.set(null)">
          <svg viewBox="0 0 330 178">
            <text x="10" y="80" transform="rotate(-90 10 80)" text-anchor="middle" class="ax">Number of Tasks</text>
            @for (v of [0, 100, 200, 300, 400, 500]; track v) {
              <line x1="44" x2="326" [attr.y1]="uy(v)" [attr.y2]="uy(v)" class="gl" />
              <text x="38" [attr.y]="uy(v) + 3.5" text-anchor="end" class="ax">{{ v }}</text>
            }
            @for (l of usageLabels; track $index; let i = $index) {
              <rect [attr.x]="ux(i) - 13" y="6" width="26" [attr.height]="uy(0) - 6" [class.hov]="uh() === i" class="hb" (mouseenter)="uh.set(i)" />
              <rect [attr.x]="ux(i) - 10" [attr.y]="uy(created[i])" width="9" [attr.height]="uy(0) - uy(created[i])" fill="var(--ka-7c3aed)" rx="1" />
              <rect [attr.x]="ux(i) + 1" [attr.y]="uy(done[i])" width="9" [attr.height]="uy(0) - uy(done[i])" fill="var(--ka-2563eb)" rx="1" />
              @if (i % 2 === 0) {<text [attr.x]="ux(i)" y="174" text-anchor="middle" class="ax">{{ l }}</text>}
            }
          </svg>
          @if (uh() !== null) {
            <div class="tip" [style.left.%]="(ux(uh()!) / 330) * 100"><b>{{ usageLabels[uh()!] }}</b><span><i style="background:var(--kb-7c3aed)"></i>Created: {{ created[uh()!] }}</span><span><i style="background:var(--kb-2563eb)"></i>Completed: {{ done[uh()!] }}</span></div>
          }
        </div>
      </div>
      <div class="card">
        <div class="bh"><h3>Task Completion Rate by Category</h3>
          <select class="select sm" [value]="period()" (change)="period.set($any($event.target).value)">@for (p of periods; track p) {<option [value]="p">{{ p }}</option>}</select>
        </div>
        <ul class="rates">
          @for (c of rates(); track c.name) {
            <li (click)="filterCat(c.name)" [title]="c.name + ': ' + c.rate + '% completed on time'"><span>{{ c.name }}</span><div class="tr"><i [style.width.%]="c.rate" [style.background]="c.bar"></i></div><b>{{ c.rate }}%</b></li>
          }
        </ul>
      </div>
      <div class="card">
        <div class="bh"><h3>Recent Templates</h3><button class="link" (click)="recentModal.set(true)">View All</button></div>
        <ul class="recent">
          @for (t of recent().slice(0, 5); track t.id) {
            <li (click)="edit(t)"><span class="ti md" [style.background]="t.color"><app-icon [name]="t.icon" [size]="16" /></span><div><b>{{ t.name }}</b><small>Updated by {{ t.updatedBy }}</small></div><time>{{ stamp(t.updatedAt) }}</time></li>
          }
        </ul>
      </div>
    </section>

    @if (catModal()) {
      <div class="g-overlay" (click)="catModal.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Template Categories</h3><button class="close-btn" (click)="catModal.set(false)">×</button></div>
        <table class="table">
          <thead><tr><th>Category</th><th class="num">Templates</th><th class="num">Active</th><th class="num">Tasks (30d)</th><th class="num">Completion</th><th></th></tr></thead>
          <tbody>
            @for (c of catStats(); track c.name) {
              <tr><td><span class="ci" [style.background]="c.tint"><app-icon [name]="c.icon" [size]="11" /></span> {{ c.name }}</td><td class="num">{{ c.count }}</td><td class="num">{{ c.active }}</td><td class="num">{{ fmt(c.usage) }}</td><td class="num">{{ c.completion }}%</td>
                <td><button class="link" (click)="filterCat(c.name); catModal.set(false)">Show templates</button></td></tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (recentModal()) {
      <div class="g-overlay" (click)="recentModal.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Recently Updated Templates</h3><button class="close-btn" (click)="recentModal.set(false)">×</button></div>
        <ul class="recent long">
          @for (t of recent().slice(0, 20); track t.id) {
            <li (click)="edit(t); recentModal.set(false)"><span class="ti md" [style.background]="t.color"><app-icon [name]="t.icon" [size]="16" /></span><div><b>{{ t.name }}</b><small>{{ t.category }} · Updated by {{ t.updatedBy }}</small></div><time>{{ stamp(t.updatedAt) }}</time></li>
          }
        </ul>
      </div>
    }
    @if (library()) {
      <div class="g-overlay" (click)="library.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Template Library</h3><button class="close-btn" (click)="library.set(false)">×</button></div>
        <p class="muted">Industry-standard templates. Imported templates are added as <b>Draft</b> so you can review them before publishing.</p>
        <ul class="lib">
          @for (l of libraryItems; track l.name) {
            <li><span class="ci big" [style.background]="meta(l.category).tint"><app-icon [name]="meta(l.category).icon" [size]="15" /></span><div><b>{{ l.name }}</b><small>{{ l.category }} · {{ l.frequency }} · {{ l.duration }} mins</small></div>
              @if (imported().has(l.name)) {<span class="tag green">Added</span>} @else {<button class="btn-ghost sm" (click)="importLib(l)">Add</button>}</li>
          }
        </ul>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    :host ::ng-deep .page-head { flex-wrap: nowrap; margin-bottom: 14px; } :host ::ng-deep .page-head > div:first-child { flex: 1 1 auto; min-width: 0; } :host ::ng-deep .page-head .subtitle { font-size: 14px; white-space: nowrap; } :host ::ng-deep .page-head .head-btns { flex-wrap: nowrap; padding-top: 18px; }
    .big { padding: 9px 12px; font-size: 12.5px; font-weight: 500; }
    .btn-primary.big { padding: 9px 18px; }
    .split { display: flex; } .split .big:first-child { border-radius: 8px 0 0 8px; } .split .caret { border-radius: 0 8px 8px 0; border-left: 0; padding: 9px 8px; }
    .kebab { padding: 9px 10px; }
    .dropdown label.dd-item { cursor: pointer; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .filters { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .fsearch { flex: 1 1 260px; max-width: 318px; padding: 9px 12px; } .fsearch input { width: 100%; font-size: 12px; }
    .f { height: 37px; font-size: 12px; }
    select.f { width: 128px; padding-left: 12px; } select.f:nth-of-type(4) { width: 130px; }
    .mf { font-weight: 500; } .mf.on { border-color: var(--primary); color: var(--primary); } .mf em { font-style: normal; background: var(--primary); color: var(--kf-ffffff); border-radius: 9px; padding: 0 6px; font-size: 10.5px; }
    .vt { display: flex; gap: 4px; margin-left: auto; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); }
    .vt button { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border: 0; border-radius: 6px; background: none; font-size: 12.5px; cursor: pointer; color: var(--kf-3b3f5c); }
    .vt button.on { background: var(--primary); color: var(--kf-ffffff); }
    .icon-only { padding: 0 10px; }
    .pop { width: 300px; padding: 12px; left: 0; right: auto; } .pop.narrow { width: 210px; left: auto; right: 0; }
    .pop h5 { margin: 8px 0 6px; font-size: 11.5px; color: var(--muted); font-weight: 600; } .pop h5:first-child { margin-top: 0; } .pop .select { width: 100%; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; } .chips button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 14px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; } .chips button.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
    .pop-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
    .ck { display: flex; gap: 8px; align-items: center; padding: 5px 2px; font-size: 12.5px; cursor: pointer; }

    .main { display: grid; grid-template-columns: minmax(0, 1.66fr) minmax(380px, 1fr); gap: 12px; margin-bottom: 12px; align-items: stretch; }
    .tcard { display: flex; flex-direction: column; padding: 14px 12px 10px; }
    .tc-head { display: flex; align-items: center; gap: 12px; min-height: 30px; margin-bottom: 8px; } .tc-head h3 { font-size: 17px; font-weight: 700; padding-left: 2px; }
    .bulk { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 12px; background: var(--kb-f5f3ff); padding: 4px 10px; border-radius: 8px; }
    .tw { flex: 1; }
    .tt { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: auto; }
    .tt th { text-align: left; font-weight: 500; color: var(--kf-3b3f5c); padding: 8px 5px 9px; font-size: 11px; white-space: nowrap; }
    .tt th.sortable { cursor: pointer; } .tt th.sortable:hover { color: var(--primary); }
    .tt td { padding: 0 5px; height: 33.2px; border-top: 1px solid var(--kl-f1f2f7); white-space: nowrap; color: var(--kf-3b3f5c); }
    .tt tr:first-child td { border-top: 0; }
    .tt tbody tr { cursor: pointer; } .tt tbody tr:hover td { background: var(--kb-faf8ff); } .tt tbody tr.sel td { background: var(--kb-f3efff); }
    .c { text-align: center !important; }
    .cb { width: 26px; } .cb input { width: 14px; height: 14px; accent-color: var(--primary); cursor: pointer; }
    .nm { display: flex; align-items: center; gap: 9px; } .nm b { font-weight: 600; color: var(--text); }
    .lc { font-style: normal; font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--kb-eef0f5); color: var(--kf-4b5563); }
    .ti { width: 27px; height: 27px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; box-shadow: inset 0 -8px 12px rgba(0, 0, 0, 0.15); }
    .ti.md { width: 30px; height: 30px; } .ti.lg { width: 38px; height: 38px; border-radius: 8px; }
    .st { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 6px; background: var(--kb-e9f9ef); color: var(--kf-15803d); font-size: 11px; }
    .st i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-22c55e); } .st.off { background: var(--kb-fdecec); color: var(--kf-dc2626); } .st.off i { background: var(--kb-ef4444); }
    .dots { font-size: 13px; letter-spacing: -1px; color: var(--kf-1e1b3a); font-weight: 700; }
    .menu-wrap .dropdown { text-align: left; }
    .empty { text-align: center; padding: 30px !important; color: var(--muted); white-space: normal !important; }
    .lv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex: 1; align-content: start; }
    .li { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; text-align: left; }
    .li.sel { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .li div { display: flex; flex-direction: column; font-size: 12px; min-width: 0; } .li small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pg { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 8px 4px 0; border-top: 1px solid var(--kl-f1f2f7); font-size: 11.5px; color: var(--muted); }
    .pages { display: flex; gap: 4px; align-items: center; }
    .pages button { min-width: 26px; height: 26px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); font-size: 11.5px; cursor: pointer; display: grid; place-items: center; }
    .pages button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .pages button:disabled { opacity: 0.4; cursor: default; }

    .ecard { display: flex; flex-direction: column; padding: 14px 14px 12px; }
    .ec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; } .ec-head h3 { font-size: 17px; font-weight: 700; } .id { font-size: 11.5px; }
    .ftabs { display: flex; gap: 3px; margin-bottom: 10px; }
    .ftabs > button, .more-t { flex: none; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; padding: 7px 6px; font-size: 10.8px; color: var(--kf-3b3f5c); cursor: pointer; white-space: nowrap; }
    .ftabs > button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .ftabs .menu-wrap { margin-left: -7px; } .more-t { padding: 7px 6px; border-left: 0; border-radius: 0 6px 6px 0; } .more-t.on { color: var(--primary); }
    .ftabs > button:last-of-type { border-radius: 6px 0 0 6px; }
    .fbody { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .fl { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--kf-3b3f5c); } .fl i { color: var(--red); font-style: normal; }
    .fl .input, .fl .select { font-size: 11.5px; padding: 7px 10px; } .fl .select { padding-right: 28px; } .input.err { border-color: var(--red); }
    textarea.input { resize: vertical; min-height: 44px; line-height: 1.45; font-size: 11.5px !important; }
    .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; } .g2 .full { grid-column: 1 / -1; }
    .select.prio.p-Medium { background-color: var(--kb-fef6e4); color: var(--kf-b45309); } .select.prio.p-High { background-color: var(--kb-ffedd5); color: var(--kf-c2410c); } .select.prio.p-Critical { background-color: var(--kb-fee2e2); color: var(--kf-b91c1c); } .select.prio.p-Low { background-color: var(--kb-f1f5f9); color: var(--kf-475569); }
    .dur { position: relative; display: block; } .dur .input { width: 100%; } .dur em { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-style: normal; color: var(--muted); font-size: 11.5px; }
    .sw { display: flex; align-items: center; gap: 10px; height: 31px; color: var(--text); }
    .tags { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-height: 31px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 7px; position: relative; }
    .tg { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 5px; background: var(--kb-eef2ff); color: var(--kf-3b3f8c); font-size: 11px; } .tg button { border: 0; background: none; cursor: pointer; padding: 0 0 0 2px; font-size: 13px; line-height: 1; color: inherit; }
    .tag-add { margin-left: auto; width: 26px; height: 24px; border: 0; appearance: none; cursor: pointer; color: transparent; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%233b3f5c' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat center; }
    .tag-add option { color: var(--text); }
    .factions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; } .w { min-width: 88px; justify-content: center; } .btn-primary.w { min-width: 120px; font-weight: 500; } .btn-ghost.w { font-weight: 500; }
    .errm { margin: 8px 0 0; font-size: 12px; }
    .hint { margin: 0; font-size: 12px; color: var(--muted); }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow: auto; }
    .steps li { display: grid; grid-template-columns: 22px 1fr auto auto auto auto; gap: 6px; align-items: center; } .steps .input { padding: 6px 8px; font-size: 12px; }
    .n { width: 22px; height: 22px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); font-size: 11px; font-weight: 600; display: grid; place-items: center; }
    .chipb { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; padding: 4px 7px; font-size: 10.5px; cursor: pointer; color: var(--muted); display: inline-flex; } .chipb.on { background: var(--primary-soft); border-color: var(--kl-c4b5fd); color: var(--primary); }
    .ib { border: 0; background: none; cursor: pointer; color: var(--muted); padding: 4px; } .ib:disabled { opacity: 0.3; } .ib:hover:not(:disabled) { color: var(--red); }
    .add-step { display: flex; gap: 8px; } .add-step .input { flex: 1; }
    .days { display: flex; gap: 6px; flex-wrap: wrap; } .days button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; padding: 6px 11px; font-size: 12px; cursor: pointer; } .days button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .preview { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 8px; background: var(--kb-f5f3ff); color: var(--kf-4c1d95); font-size: 12px; margin-top: 4px; }
    .ladder { display: flex; flex-direction: column; gap: 0; border-left: 2px solid var(--kl-e9e5ff); margin: 6px 0 0 8px; }
    .ladder div { display: grid; grid-template-columns: 64px 1fr; gap: 8px; padding: 7px 0 7px 14px; position: relative; font-size: 12px; } .ladder div::before { content: ''; position: absolute; left: -6px; top: 11px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); }
    .ladder b { color: var(--primary); } .ladder em { font-style: normal; font-weight: 600; color: var(--kf-b45309); } .ladder em.r { color: var(--red); }
    .hist { list-style: none; padding: 0; margin: 0; } .hist li { display: grid; grid-template-columns: 40px 1fr; padding: 9px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12px; } .hist small { grid-column: 2; color: var(--muted); }

    .bottom { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.06fr) minmax(0, 1.13fr) minmax(0, 1fr); gap: 12px; }
    .bottom .card { padding: 12px 12px 10px; }
    .bh { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; min-height: 26px; } .bh h3 { font-size: 13px; font-weight: 700; letter-spacing: -0.2px; white-space: nowrap; } .bh h3 small { font-weight: 500; font-size: 12px; }
    .bh .link { font-size: 12px; } .select.sm { padding: 4px 24px 4px 8px; font-size: 11.5px; }
    .cats { list-style: none; margin: 0; padding: 0; } .cats li { display: grid; grid-template-columns: 16px 1fr auto; gap: 10px; align-items: center; padding: 3.2px 4px; font-size: 11.5px; color: var(--kf-3b3f5c); cursor: pointer; border-radius: 5px; }
    .cats li:hover, .cats li.on { background: var(--kb-f5f3ff); } .cats b { font-weight: 500; color: var(--text); }
    .ci { width: 14px; height: 14px; border-radius: 3px; display: inline-grid; place-items: center; color: var(--kf-ffffff); vertical-align: -2px; } .ci.big { width: 30px; height: 30px; border-radius: 7px; }
    .leg { display: flex; justify-content: center; gap: 30px; font-size: 11.5px; color: var(--kf-3b3f5c); margin: -2px 0 4px; } .leg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
    .uchart { position: relative; } .uchart svg { width: 100%; display: block; }
    .ax { font-size: 9.5px; fill: var(--ka-3b3f5c); } .gl { stroke: var(--kl-eef0f5); stroke-width: 0.8; }
    .hb { fill: transparent; } .hb.hov { fill: var(--ka-f3efff); }
    .tip { position: absolute; top: 6px; transform: translateX(-50%); background: var(--kb-1e1b3a); color: var(--kf-ffffff); border-radius: 7px; padding: 6px 9px; font-size: 11px; display: flex; flex-direction: column; gap: 2px; pointer-events: none; white-space: nowrap; }
    .tip i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
    .rates { list-style: none; margin: 0; padding: 0; } .rates li { display: grid; grid-template-columns: 112px 1fr 38px; gap: 8px; align-items: center; padding: 2.6px 0; font-size: 11.5px; color: var(--kf-3b3f5c); cursor: pointer; }
    .rates li:hover span { color: var(--primary); }
    .tr { height: 10px; background: var(--kb-f4f4f9); border-radius: 2px; overflow: hidden; margin-right: 10px; } .tr i { display: block; height: 100%; border-radius: 2px; transition: width 0.4s; }
    .rates b { font-weight: 500; text-align: right; color: var(--text); }
    .recent { list-style: none; margin: 0; padding: 0; } .recent li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 3.5px 2px; cursor: pointer; border-radius: 6px; }
    .recent li:hover { background: var(--kb-f5f3ff); } .recent div { display: flex; flex-direction: column; min-width: 0; } .recent b { font-size: 11.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .recent small { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recent time { font-size: 10px; color: var(--kf-3b3f5c); white-space: nowrap; align-self: start; padding-top: 2px; }
    .recent.long li { padding: 7px 4px; border-bottom: 1px solid var(--kl-f1f2f7); } .recent.long b { font-size: 13px; } .recent.long small, .recent.long time { font-size: 11.5px; }
    .lib { list-style: none; margin: 10px 0 0; padding: 0; } .lib li { display: grid; grid-template-columns: 30px 1fr auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--kl-f1f2f7); } .lib div { display: flex; flex-direction: column; font-size: 13px; } .lib small { color: var(--muted); font-size: 11.5px; }
    @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .bottom { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 1150px) { .main { grid-template-columns: 1fr; } .tw { overflow-x: auto; } }
  `,
})
export class TaskMasterTemplates {
  protected readonly store = inject(TaskStore);
  private readonly router = inject(Router);
  protected readonly catNames = CAT_NAMES;
  protected readonly depts = DEPTS;
  protected readonly sites = TASK_SITES;
  protected readonly frequencies = FREQUENCIES;
  protected readonly priorities = PRIORITIES;
  protected readonly roles = ROLES;
  protected readonly escRoles = ESCALATION_ROLES;
  protected readonly tagOptions = TAG_OPTIONS;
  protected readonly statusOpts = STATUS_OPTS;
  protected readonly formTabs = FORM_TABS;
  protected readonly moreTabs = MORE_TABS;
  protected readonly days = DAYS;
  protected readonly periods = PERIODS;
  protected readonly libraryItems = LIBRARY;
  protected readonly colNames = COLS;
  protected readonly usageLabels = USAGE_LABELS;
  protected readonly created = USAGE_CREATED;
  protected readonly done = USAGE_DONE;
  protected readonly per = 10;
  protected readonly min = Math.min;
  protected readonly meta = catMeta;
  protected readonly stamp = fmtStamp;
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly Set = Set;

  // filters
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly dept = signal('All');
  protected readonly site = signal('All');
  protected readonly status = signal('Published');
  protected readonly freqF = signal<string[]>([]);
  protected readonly prioF = signal<string[]>([]);
  protected readonly roleF = signal('All');
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly hidden = signal<Set<string>>(new Set());
  protected readonly sort = signal<{ key: keyof Template | ''; dir: number }>({ key: '', dir: 1 });
  protected readonly page = signal(0);
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly menu = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly catModal = signal(false);
  protected readonly recentModal = signal(false);
  protected readonly library = signal(false);
  protected readonly imported = signal<Set<string>>(new Set());
  protected readonly period = signal('This Month');
  protected readonly uh = signal<number | null>(null);

  // editor
  protected readonly draft = signal<Template>(this.clone(this.store.templates()[0]));
  protected readonly ftab = signal<FormTab>('Basic Details');
  protected readonly err = signal('');
  protected readonly isNew = computed(() => !this.store.templates().some((t) => t.id === this.draft().id));

  protected readonly moreCount = computed(() => this.freqF().length + this.prioF().length + (this.roleF() !== 'All' ? 1 : 0));
  protected readonly activePct = computed(() => ((this.store.activeTemplates() / this.store.templates().length) * 100).toFixed(1));
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const [cat, dept, site, st, fr, pr, role] = [this.cat(), this.dept(), this.site(), this.status(), this.freqF(), this.prioF(), this.roleF()];
    const list = this.store.templates().filter(
      (t) =>
        (!q || `${t.name} ${t.category} ${t.dept} ${t.applicableTo} ${t.tags.join(' ')}`.toLowerCase().includes(q)) &&
        (cat === 'All' || catOf(t.category) === cat) &&
        (dept === 'All' || t.dept === dept) &&
        (site === 'All' || t.sites.includes('All Sites') || t.sites.includes(site)) &&
        (st === 'All' || t.lifecycle === st) &&
        (!fr.length || fr.includes(t.frequency)) &&
        (!pr.length || pr.includes(t.priority)) &&
        (role === 'All' || t.applicableTo === role),
    );
    const { key, dir } = this.sort();
    if (!key) return list;
    return [...list].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.per)));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.per, (this.page() + 1) * this.per));
  protected readonly pageList = computed(() => {
    const n = this.pages();
    const p = this.page();
    if (n <= 6) return Array.from({ length: n }, (_, i) => i);
    const set = [...new Set([0, 1, p - 1, p, p + 1, n - 1])].filter((x) => x >= 0 && x < n).sort((a, b) => a - b);
    return set.flatMap((x, i) => (i && x - set[i - 1] > 1 ? [-1, x] : [x]));
  });
  protected readonly allPicked = computed(() => this.pageRows().length > 0 && this.pageRows().every((t) => this.picked().has(t.id)));
  protected readonly selectedRows = computed(() => this.store.templates().filter((t) => this.picked().has(t.id)));

  protected readonly catCounts = computed(() =>
    CATEGORIES.map((c) => ({ ...c, count: this.store.published().filter((t) => catOf(t.category) === c.name).length })),
  );
  protected readonly catStats = computed(() =>
    this.catCounts().map((c) => {
      const list = this.store.published().filter((t) => catOf(t.category) === c.name);
      return { ...c, active: list.filter((t) => t.status === 'Active').length, usage: list.reduce((a, t) => a + t.usage30, 0) };
    }),
  );
  protected readonly rates = computed(() => {
    const shift = { 'This Week': [2, -1, 3, 1, -2, 4, 2, -3, 1], 'This Month': [0, 0, 0, 0, 0, 0, 0, 0, 0], 'Last Month': [-2, 1, -3, -1, 2, -4, 1, 3, -2], 'This Quarter': [-1, -1, 1, -2, 0, -2, 2, 1, 0] }[this.period()]!;
    return CATEGORIES.map((c, i) => ({ ...c, rate: Math.min(99, c.completion + shift[i]) }));
  });
  protected readonly recent = computed(() => [...this.store.templates()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  protected readonly formCats = computed(() => [...new Set([...CAT_NAMES.filter((c) => c !== 'Others'), 'Facility Services', 'Reception', 'Pest Control', 'Logistics', 'Parking', this.draft().category])]);
  protected readonly reqCount = computed(() => this.draft().steps.filter((s) => s.required).length);
  protected readonly photoSteps = computed(() => this.draft().steps.filter((s) => s.photo).length);
  protected readonly isMoreTab = computed(() => (MORE_TABS as readonly string[]).includes(this.ftab()));
  protected readonly runsPerWeek = computed(() => {
    const d = this.draft();
    const per = { Hourly: 12, 'Shift-wise': 3, Daily: 1, Weekly: 1 / d.days.length, Monthly: 0.25 / d.days.length, Quarterly: 0.08 / d.days.length, 'On Demand': 0 }[d.frequency] ?? 1;
    return Math.round(per * d.days.length * 10) / 10;
  });
  protected readonly version = computed(() => 3 + (this.draft().id.charCodeAt(7) % 4));

  // scale for usage chart
  protected ux(i: number) {
    return 62 + i * 28.6;
  }
  protected uy(v: number) {
    return 152 - (v / 500) * 140;
  }

  protected toggleMenu(m: string) {
    this.menu.set(this.menu() === m ? null : m);
  }
  protected closeMenus(e: Event) {
    if (this.menu() && !(e.target as HTMLElement).closest('[data-menu]')) this.menu.set(null);
  }
  protected toggleIn(sig: WritableSignal<string[]>, v: string) {
    sig.update((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));
    this.page.set(0);
  }
  protected clearMore() {
    this.freqF.set([]);
    this.prioF.set([]);
    this.roleF.set('All');
  }
  protected clearAll() {
    this.clearMore();
    this.q.set('');
    this.cat.set('All');
    this.dept.set('All');
    this.site.set('All');
    this.status.set('All');
  }
  protected toggleCol(c: string) {
    this.hidden.update((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }
  protected sortBy(key: keyof Template) {
    this.sort.update((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: '', dir: 1 }) : { key, dir: 1 }));
  }
  protected arrow(key: string) {
    return this.sort().key === key ? (this.sort().dir === 1 ? ' ▲' : ' ▼') : '';
  }
  protected pick(id: string) {
    this.picked.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected pickPage() {
    const all = this.allPicked();
    this.picked.update((s) => {
      const n = new Set(s);
      this.pageRows().forEach((t) => (all ? n.delete(t.id) : n.add(t.id)));
      return n;
    });
  }
  protected bulk(to: 'Active' | 'Inactive' | 'Archived') {
    const ids = this.picked();
    this.store.templates.update((l) => l.map((t) => (ids.has(t.id) ? (to === 'Archived' ? { ...t, lifecycle: 'Archived', status: 'Inactive' } : { ...t, status: to }) : t)));
    this.say(`${ids.size} templates ${to === 'Archived' ? 'archived' : to === 'Active' ? 'activated' : 'deactivated'}`);
    this.picked.set(new Set());
  }
  protected clearPicked() {
    this.picked.set(new Set());
  }
  protected filterCat(c: string) {
    this.cat.set(this.cat() === c ? 'All' : c);
    this.page.set(0);
  }

  // ----- row actions -----
  private clone(t: Template): Template {
    return { ...t, sites: [...t.sites], tags: [...t.tags], days: [...t.days], steps: t.steps.map((s) => ({ ...s })) };
  }
  protected edit(t: Template) {
    this.draft.set(this.clone(t));
    this.err.set('');
  }
  protected duplicate(t: Template) {
    this.menu.set(null);
    const copy = this.store.saveTemplate({ ...this.clone(t), id: this.store.nextTemplateId(), name: `${t.name} (Copy)`, lifecycle: 'Draft', status: 'Inactive', usage30: 0 });
    this.edit(copy);
    this.status.set('All');
    this.say(`Duplicated as draft “${copy.name}”`);
  }
  protected toggleStatus(t: Template) {
    this.menu.set(null);
    const status = t.status === 'Active' ? 'Inactive' : 'Active';
    this.store.templates.update((l) => l.map((x) => (x.id === t.id ? { ...x, status } : x)));
    if (this.draft().id === t.id) this.draft.update((d) => ({ ...d, status }));
    this.say(`${t.name} ${status === 'Active' ? 'activated' : 'deactivated'}`);
  }
  protected setLifecycle(t: Template, lifecycle: Template['lifecycle']) {
    this.menu.set(null);
    this.store.templates.update((l) => l.map((x) => (x.id === t.id ? { ...x, lifecycle, status: lifecycle === 'Published' ? 'Active' : 'Inactive' } : x)));
    this.say(`${t.name} ${lifecycle === 'Archived' ? 'archived' : lifecycle === 'Published' ? 'published' : 'saved as draft'}`);
  }
  protected createTask(t: Template) {
    this.menu.set(null);
    if (t.status !== 'Active' || t.lifecycle !== 'Published') return this.say('Only active, published templates can create tasks');
    const task = this.store.addTask(t, { source: 'Manual' });
    this.say(`${task.id} created from “${t.name}” · waiting for assignment`);
  }

  // ----- editor -----
  protected set<K extends keyof Template>(k: K, v: Template[K]) {
    this.draft.update((d) => ({ ...d, [k]: v }));
  }
  protected setCategory(c: string) {
    this.draft.update((d) => ({ ...d, category: c }));
  }
  protected hm(m: number) {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  protected setDuration(v: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    const mins = m ? +m[1] * 60 + +m[2] : parseInt(v, 10);
    if (!mins || mins < 1) return this.err.set('Estimated duration must be in HH:MM format, e.g. 00:30');
    this.err.set('');
    this.set('duration', mins);
  }
  protected removeTag(t: string) {
    this.set('tags', this.draft().tags.filter((x) => x !== t));
  }
  protected addTag(el: HTMLSelectElement) {
    if (el.value) this.set('tags', [...this.draft().tags, el.value]);
    el.value = '';
  }
  protected setStep(i: number, ch: Partial<Template['steps'][number]>) {
    this.set('steps', this.draft().steps.map((s, j) => (j === i ? { ...s, ...ch } : s)));
  }
  protected moveStep(i: number, by: number) {
    const s = [...this.draft().steps];
    [s[i], s[i + by]] = [s[i + by], s[i]];
    this.set('steps', s);
  }
  protected removeStep(i: number) {
    this.set('steps', this.draft().steps.filter((_, j) => j !== i));
  }
  protected addStep(el: HTMLInputElement) {
    if (!el.value.trim()) return;
    this.set('steps', [...this.draft().steps, { text: el.value.trim(), required: true }]);
    el.value = '';
  }
  protected toggleDay(d: string) {
    const days = this.draft().days;
    this.set('days', days.includes(d) ? days.filter((x) => x !== d) : DAYS.filter((x) => x === d || days.includes(x)));
  }
  protected newTemplate() {
    const base = this.clone(SEED_TEMPLATES[0]);
    this.draft.set({
      ...base, id: this.store.nextTemplateId(), name: '', description: '', category: 'Housekeeping', tags: [], status: 'Active', lifecycle: 'Published', usage30: 0,
      steps: [{ text: 'Collect required tools & PPE', required: true }, { text: 'Perform task', required: true }, { text: 'Photo of completed work', required: true, photo: true }],
    });
    this.ftab.set('Basic Details');
    this.err.set('');
    this.say('New template – fill in the details and save');
  }
  protected cancel() {
    const orig = this.store.templates().find((t) => t.id === this.draft().id) ?? this.store.templates()[0];
    this.edit(orig);
    this.say('Changes discarded');
  }
  protected save() {
    const d = this.draft();
    if (!d.name.trim()) {
      this.ftab.set('Basic Details');
      return this.err.set('Template name is required.');
    }
    if (this.store.templates().some((t) => t.id !== d.id && t.name.toLowerCase() === d.name.trim().toLowerCase())) return this.err.set('A template with this name already exists.');
    if (!d.steps.length) return this.err.set('Add at least one checklist step.');
    const wasNew = this.isNew();
    const saved = this.store.saveTemplate({ ...d, name: d.name.trim(), dept: d.dept, color: d.color, icon: catMeta(d.category).name === 'Others' && wasNew ? 'layers' : wasNew ? catMeta(d.category).icon : d.icon });
    this.draft.set(this.clone(saved));
    this.err.set('');
    if (wasNew) {
      this.clearAll();
      this.status.set('Published');
      this.sort.set({ key: '', dir: 1 });
      this.page.set(0);
    }
    this.say(`Template “${saved.name}” ${wasNew ? 'created' : 'saved'}`);
  }

  // ----- import / export -----
  protected importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    this.menu.set(null);
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      let n = 0;
      for (const l of rows) {
        const [name, category, frequency, duration, role] = l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
        if (!name) continue;
        const base = this.clone(SEED_TEMPLATES[0]);
        const cat = category || 'Others';
        this.store.saveTemplate({ ...base, id: this.store.nextTemplateId(), name, category: cat, frequency: frequency || 'Daily', duration: +duration || 20, applicableTo: role || 'Facility Staff', lifecycle: 'Draft', status: 'Inactive', icon: catMeta(cat).icon, color: 'var(--ka-7c3aed)', usage30: 0, description: `Imported from ${file.name}` });
        n++;
      }
      this.status.set('Draft');
      this.say(`${n} templates imported as Draft from ${file.name}`);
    };
    r.readAsText(file);
  }
  protected sampleCsv() {
    this.menu.set(null);
    downloadCsv('task-templates-sample.csv', [['Template Name', 'Category', 'Frequency', 'Duration (mins)', 'Applicable To'], ['Lift Lobby Cleaning', 'Housekeeping', 'Daily', 15, 'Cleaning Staff'], ['Gate Inspection', 'Security', 'Hourly', 10, 'Security Guards']]);
  }
  protected importLib(l: (typeof LIBRARY)[number]) {
    const base = this.clone(SEED_TEMPLATES[0]);
    const m = catMeta(l.category);
    this.store.saveTemplate({ ...base, id: this.store.nextTemplateId(), ...l, applicableTo: ROLES[CAT_NAMES.indexOf(l.category)] ?? 'Facility Staff', lifecycle: 'Draft', status: 'Inactive', icon: m.icon, color: m.tint, usage30: 0, tags: [], description: `${l.name} (from template library).` });
    this.imported.update((s) => new Set(s).add(l.name));
    this.say(`${l.name} added as Draft`);
  }
  protected exportCsv(list = this.filtered()) {
    this.menu.set(null);
    downloadCsv('task-templates.csv', [
      ['ID', 'Template Name', 'Category', 'Department', 'Frequency', 'Duration (mins)', 'Applicable To', 'Priority', 'Status', 'Lifecycle', 'Steps', 'SLA (mins)', 'Updated', 'Updated By'],
      ...list.map((t) => [t.id, t.name, t.category, t.dept, t.frequency, t.duration, t.applicableTo, t.priority, t.status, t.lifecycle, t.steps.length, t.slaResolve, t.updatedAt, t.updatedBy]),
    ]);
    this.say(`${list.length} templates exported`);
  }
  protected print() {
    window.print();
  }
  protected resetData() {
    this.menu.set(null);
    this.store.templates.set(SEED_TEMPLATES.map((t) => this.clone(t)));
    this.edit(this.store.templates()[0]);
    this.say('Demo data reset');
  }
  protected go(path: string) {
    this.menu.set(null);
    this.router.navigateByUrl(`/tasks-workforce-operations/${path}`);
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
