import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { LEAVE_TYPES, LeaveType } from './leave.data';

const TABS = ['Overview', 'Policy Rules', 'Entitlements', 'Applicability', 'Approval Flow'] as const;
const CATS: LeaveType['category'][] = ['Earned', 'Medical', 'Special', 'Unpaid', 'Custom'];
const APPLIES = ['Employees', 'Female Employees', 'Male Employees', 'Employees (Muslim)'];
const ICONS = ['tree', 'shield-plus', 'calendar-days', 'user', 'heart', 'star', 'building', 'file-text', 'graduation-cap', 'sun', 'more'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

interface Rules {
  halfDay: boolean;
  hourly: boolean;
  sandwich: boolean;
  negative: number;
  docAfter: number;
  backdate: number;
  clubbing: boolean;
  probation: boolean;
}
interface Ent {
  grade: string;
  days: number;
  accrual: string;
  bonus: string;
}
interface Step {
  role: string;
  sla: number;
}
interface Appl {
  gender: string;
  religion: string;
  types: string[];
  sites: string[];
  minService: number;
}

@Component({
  selector: 'app-leave-types',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Types &amp; Policies" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Create and manage leave types, entitlements, rules, and approval policies.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Leave Type</button>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="more.set(!more())" aria-label="More">⋮</button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export leave types</button>
            <button class="dd-item" (click)="reset()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Leave Types" [value]="types().length" icon="file-text" color="var(--ka-8b5cf6)" sub="Active leave types" />
      <app-kpi label="Leave Policies" value="12" icon="users" color="var(--ka-22c55e)" sub="Assigned to employee groups" />
      <app-kpi label="Employees Covered" value="8,920" icon="users" color="var(--ka-3b82f6)" sub="Across all policies" />
      <app-kpi label="Pending Approvals" value="28" icon="calendar-days" color="var(--ka-f97316)" change="12%" [good]="false" sub="vs. last week" />
      <app-kpi label="Average Leave Utilization" value="62.4%" icon="trending-up" color="var(--ka-d946ef)" change="5%" [up]="false" sub="vs. last year" />
    </section>

    <section class="lt" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="types()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" idKey="code" noun="leave types" [pageSize]="20"
          [searchKeys]="['name', 'code', 'description']" searchPlaceholder="Search leave type, code or description..." [activeId]="selCode()"
          (rowClick)="selCode.set($event.code)" (action)="onAction($event.action, $event.row)" (bulk)="onBulk($event.action, $event.ids)">
          <button class="btn-ghost" [class.on]="moreFilters()" (click)="moreFilters.set(!moreFilters())"><app-icon name="sliders" [size]="15" />More Filters</button>
        </app-data-table>
      </div>

      @if (sel(); as t) {
        <aside class="card detail">
          <div class="d-head">
            <h2>{{ t.name }}</h2>
            <span class="pill" [class.off]="t.status !== 'Active'"><i></i>{{ t.status }}</span>
            <button class="close-btn" (click)="selCode.set(null)">×</button>
          </div>
          <p class="muted">{{ t.description }}</p>
          <div class="toolbar">
            <button class="btn-primary" (click)="openForm(t)"><app-icon name="sliders" [size]="15" />Edit</button>
            <button class="btn-ghost" (click)="duplicate(t)"><app-icon name="users" [size]="15" />Duplicate</button>
            <div class="menu-wrap">
              <button class="btn-ghost" (click)="dmore.set(!dmore())">More <app-icon name="chevron-down" [size]="14" /></button>
              @if (dmore()) {
                <div class="dropdown">
                  <button class="dd-item" (click)="onAction(t.status === 'Active' ? 'deactivate' : 'activate', t)">{{ t.status === 'Active' ? 'Deactivate' : 'Activate' }}</button>
                  <button class="dd-item danger" (click)="onAction('delete', t)">Delete</button>
                </div>
              }
            </div>
          </div>
          <nav class="d-tabs">@for (x of tabs; track x) {<button [class.on]="tab() === x" (click)="tab.set(x)">{{ x }}</button>}</nav>

          @switch (tab()) {
            @case ('Overview') {
              <div class="ov">
                <div class="ov-top">
                  <span class="big-ic" [style.background]="'color-mix(in srgb, ' + t.color + ' 12%, transparent)'" [style.color]="t.color"><app-icon [name]="t.icon" [size]="30" /></span>
                  <div><b>{{ t.name }}</b><span>Code: {{ t.code }} <em>Category: {{ t.category }} Leave</em></span></div>
                </div>
                <div class="facts">
                  <div><app-icon name="calendar-days" [size]="16" /><span>Default Entitlement</span><b>{{ entText(t) }}</b></div>
                  <div><app-icon name="calendar-days" [size]="16" /><span>Leave Unit</span><b>{{ t.unit }}</b></div>
                  <div><app-icon name="refresh" [size]="16" /><span>Carry Forward</span><b>{{ t.carry ? 'Yes (Max ' + t.carryMax + ' days)' : 'No' }}</b></div>
                  <div><app-icon name="clock" [size]="16" /><span>Waiting Period</span><b>{{ t.waiting }}</b></div>
                  <div><app-icon name="clock" [size]="16" /><span>Encashment Allowed</span><b>{{ t.encash === null ? 'N/A' : t.encash ? 'Yes' : 'No' }}</b></div>
                  <div><app-icon name="calendar-days" [size]="16" /><span>Max Continuous Days</span><b>{{ t.maxContinuous }} days</b></div>
                  <div><app-icon name="users" [size]="16" /><span>Applicable To</span><b>{{ t.applicable }} (All)</b></div>
                  <div><app-icon name="clock" [size]="16" /><span>Min Notice Period</span><b>{{ t.notice }} days</b></div>
                </div>
              </div>
              <div class="two">
                <div class="mini-card">
                  <h4>Leave Utilization (This Year)</h4>
                  <div class="util">
                    <app-donut [segments]="util(t)" [legend]="false" [size]="120" center="Utilized" />
                    <div class="util-mid"><b>{{ t.utilization }}%</b><span>Utilized</span></div>
                    <ul>
                      <li><i class="u"></i>Utilized<b>{{ usedDays(t) }} days</b></li>
                      <li><i class="r"></i>Remaining<b>{{ remDays(t) }} days</b></li>
                      <li><i class="c"></i>Carried in<b>{{ t.carry ? '2.0 days' : '—' }}</b></li>
                    </ul>
                  </div>
                </div>
                <div class="mini-card">
                  <h4>Monthly Trend (Last 6 Months)</h4>
                  <app-column-chart [labels]="months" [series]="trend(t)" [height]="160" [legend]="false" suffix=" requests" />
                </div>
              </div>
            }
            @case ('Policy Rules') {
              <div class="rules">
                <label class="sw-row"><span>Allow half-day leave</span><input type="checkbox" [checked]="rules().halfDay" (change)="setRule('halfDay', !rules().halfDay)" /></label>
                <label class="sw-row"><span>Allow hourly leave</span><input type="checkbox" [checked]="rules().hourly" (change)="setRule('hourly', !rules().hourly)" /></label>
                <label class="sw-row"><span>Sandwich rule (count weekends between leave days)</span><input type="checkbox" [checked]="rules().sandwich" (change)="setRule('sandwich', !rules().sandwich)" /></label>
                <label class="sw-row"><span>Can be combined with other leave types</span><input type="checkbox" [checked]="rules().clubbing" (change)="setRule('clubbing', !rules().clubbing)" /></label>
                <label class="sw-row"><span>Available during probation</span><input type="checkbox" [checked]="rules().probation" (change)="setRule('probation', !rules().probation)" /></label>
                <div class="form-grid">
                  <label>Negative balance allowed (days)<input class="input" type="number" min="0" [value]="rules().negative" (change)="setRule('negative', +$any($event.target).value)" /></label>
                  <label>Document required after (days)<input class="input" type="number" min="0" [value]="rules().docAfter" (change)="setRule('docAfter', +$any($event.target).value)" /></label>
                  <label>Back-dated requests within (days)<input class="input" type="number" min="0" [value]="rules().backdate" (change)="setRule('backdate', +$any($event.target).value)" /></label>
                  <label>Min notice (days)<input class="input" type="number" min="0" [value]="t.notice" (change)="patch({ notice: +$any($event.target).value })" /></label>
                </div>
              </div>
            }
            @case ('Entitlements') {
              <table class="table">
                <thead><tr><th>Grade / group</th><th class="num">Days</th><th>Accrual</th><th>Service bonus</th></tr></thead>
                <tbody>
                  @for (e of ents(); track e.grade; let i = $index) {
                    <tr>
                      <td>{{ e.grade }}</td>
                      <td class="num"><input class="input n" type="number" [value]="e.days" (change)="setEnt(i, +$any($event.target).value)" /></td>
                      <td>{{ e.accrual }}</td><td>{{ e.bonus }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <p class="muted">New joiners get a pro-rata entitlement based on joining month.</p>
            }
            @case ('Applicability') {
              <div class="form-grid">
                <label>Gender<select class="select" [value]="appl().gender" (change)="setAppl('gender', $any($event.target).value)"><option>All</option><option>Female</option><option>Male</option></select></label>
                <label>Religion<select class="select" [value]="appl().religion" (change)="setAppl('religion', $any($event.target).value)"><option>All</option><option>Muslim</option></select></label>
                <label>Minimum service (months)<input class="input" type="number" [value]="appl().minService" (change)="setAppl('minService', +$any($event.target).value)" /></label>
              </div>
              <p class="lbl">Employment types</p>
              <div class="chips">@for (x of empTypes; track x) {<button class="chip-btn" [class.on]="appl().types.includes(x)" (click)="toggleList('types', x)">{{ x }}</button>}</div>
              <p class="lbl">Sites</p>
              <div class="chips">@for (x of sites; track x) {<button class="chip-btn" [class.on]="appl().sites.includes(x)" (click)="toggleList('sites', x)">{{ x }}</button>}</div>
              <p class="muted">Eligible employees: <b>{{ eligible() }}</b></p>
            }
            @case ('Approval Flow') {
              <ol class="flow">
                <li class="start">Employee submits request</li>
                @for (s of steps(); track $index; let i = $index) {
                  <li>
                    <span class="n">{{ i + 1 }}</span>
                    <select class="select" [value]="s.role" (change)="setStep(i, { role: $any($event.target).value })">@for (r of roles; track r) {<option>{{ r }}</option>}</select>
                    <label>SLA <input class="input n" type="number" [value]="s.sla" (change)="setStep(i, { sla: +$any($event.target).value })" /> h</label>
                    <button class="link danger" (click)="removeStep(i)" [disabled]="steps().length === 1">Remove</button>
                  </li>
                }
                <li class="end">Leave balance updated · employee notified</li>
              </ol>
              <button class="btn-ghost" (click)="addStep()">+ Add approval step</button>
              <p class="muted">Requests of {{ t.code === 'AL' ? '1 day or less' : 'any length' }} with enough balance are {{ t.code === 'AL' ? 'auto-approved' : 'routed through every step' }}.</p>
            }
          }
        </aside>
      }
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit ' + f.name : 'Add Leave Type' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Code *<input class="input" required maxlength="4" [value]="f.code" (input)="setF('code', $any($event.target).value.toUpperCase())" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="setF('category', $any($event.target).value)">@for (c of cats; track c) {<option>{{ c }}</option>}</select></label>
          <label>Applicable to<select class="select" [value]="f.applicable" (change)="setF('applicable', $any($event.target).value)">@for (a of applies; track a) {<option>{{ a }}</option>}</select></label>
          <label>Entitlement (days)<input class="input" type="number" min="0" [value]="f.days" (change)="setF('days', +$any($event.target).value)" /></label>
          <label>Per<select class="select" [value]="f.per" (change)="setF('per', $any($event.target).value)"><option>year</option><option>once</option><option>event</option><option>request</option></select></label>
          <label>Carry forward max (0 = none)<input class="input" type="number" min="0" [value]="f.carryMax" (change)="setF('carryMax', +$any($event.target).value)" /></label>
          <label>Encashment<select class="select" [value]="f.encash ? 'yes' : 'no'" (change)="setF('encash', $any($event.target).value === 'yes')"><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Paid<select class="select" [value]="f.paid ? 'yes' : 'no'" (change)="setF('paid', $any($event.target).value === 'yes')"><option value="yes">Paid</option><option value="no">Unpaid</option></select></label>
          <label>Icon<select class="select" [value]="f.icon" (change)="setF('icon', $any($event.target).value)">@for (i of icons; track i) {<option>{{ i }}</option>}</select></label>
          <label>Colour<input class="input" type="color" [value]="(f.color.startsWith('#') ? f.color : '#' + f.color.slice(-7, -1))" (input)="setF('color', $any($event.target).value)" /></label>
          <label class="full">Description<input class="input" [value]="f.description" (input)="setF('description', $any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .lt { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
    .lt.with-detail { grid-template-columns: minmax(0, 1.5fr) minmax(420px, 1fr); }
    .btn-ghost.on { background: var(--primary-soft); color: var(--primary); }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 10px; }
    .d-head { display: flex; align-items: center; gap: 10px; } .d-head h2 { margin: 0; font-size: 21px; } .d-head .pill { margin-left: auto; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 20px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-size: 12px; }
    .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; } .pill.off { background: var(--kb-f3f4f6); color: var(--kf-6b7280); }
    .detail p { margin: 0; } .danger { color: var(--red); }
    .d-tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); overflow-x: auto; }
    .d-tabs button { border: 0; background: none; padding: 8px 0; font-size: 12.5px; color: var(--kf-4b4f6b); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
    .d-tabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .ov { border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .ov-top { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; } .ov-top div { display: flex; flex-direction: column; gap: 4px; } .ov-top b { font-size: 16px; }
    .ov-top span { font-size: 12.5px; color: var(--kf-4b4f6b); } .ov-top em { font-style: normal; margin-left: 18px; }
    .big-ic { width: 58px; height: 58px; border-radius: 12px; display: grid; place-items: center; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
    .facts div { display: grid; grid-template-columns: 22px 1fr; gap: 0 8px; font-size: 12px; } .facts app-icon { grid-row: span 2; color: var(--kf-4b4f6b); }
    .facts span { color: var(--kf-4b4f6b); } .facts b { font-weight: 600; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .mini-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; } .mini-card h4 { margin: 0 0 8px; font-size: 12.5px; }
    .util { position: relative; display: flex; align-items: center; gap: 10px; } .util ::ng-deep .donut-mid { display: none; }
    .util-mid { position: absolute; left: 0; width: 120px; height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; pointer-events: none; } .util-mid b { font-size: 17px; }
    .util ul { list-style: none; margin: 0; padding: 0; font-size: 11px; } .util li { display: grid; grid-template-columns: 10px 1fr; gap: 0 6px; margin-bottom: 6px; } .util li b { grid-column: 2; }
    .util i { width: 8px; height: 8px; border-radius: 50%; margin-top: 3px; } .u { background: var(--kb-7c3aed); } .r { background: var(--kb-c4b5fd); } .c { background: var(--kb-e5e7eb); }
    .rules { display: flex; flex-direction: column; gap: 8px; }
    .sw-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; }
    .sw-row input { width: 18px; height: 18px; accent-color: var(--primary); }
    .n { width: 70px; text-align: right; padding: 4px 6px; }
    .lbl { font-size: 12px; color: var(--kf-4b4f6b); margin: 12px 0 6px !important; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--kb-ffffff); font-size: 12px; cursor: pointer; } .chip-btn.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .flow { list-style: none; margin: 0 0 10px; padding: 0 0 0 16px; border-left: 2px dashed var(--kl-c4b5fd); display: flex; flex-direction: column; gap: 8px; }
    .flow li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); }
    .flow .start, .flow .end { background: var(--kb-f5f3ff); color: var(--primary); font-weight: 600; }
    .flow .n { width: 22px; height: 22px; border-radius: 50%; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 11px; }
    .flow label { display: flex; align-items: center; gap: 4px; }
    @media (max-width: 1250px) { .lt.with-detail { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class LeaveTypes {
  protected readonly tabs = TABS;
  protected readonly cats = CATS;
  protected readonly applies = APPLIES;
  protected readonly icons = ICONS;
  protected readonly months = MONTHS;
  protected readonly roles = ['Line Manager', 'Department Head', 'HR Business Partner', 'HR Director', 'Finance', 'Site Manager'];
  protected readonly empTypes = ['Full Time', 'Part Time', 'Contract', 'Agency'];
  protected readonly sites = ['Head Office', 'Manufacturing', 'Warehouse', 'Regional Office', 'Tech Center', 'Data Center'];
  protected readonly types = signal<LeaveType[]>(LEAVE_TYPES.map((t) => ({ ...t })));
  protected readonly selCode = signal<string | null>('AL');
  protected readonly tab = signal<(typeof TABS)[number]>('Overview');
  protected readonly more = signal(false);
  protected readonly dmore = signal(false);
  protected readonly moreFilters = signal(false);
  protected readonly toast = signal<string | null>(null);
  private readonly ruleMap = signal<Record<string, Rules>>({});
  private readonly entMap = signal<Record<string, Ent[]>>({});
  private readonly stepMap = signal<Record<string, Step[]>>({});
  private readonly applMap = signal<Record<string, Appl>>({});

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Leave Type', kind: 'icon' },
    { key: 'code', label: 'Code' },
    { key: 'category', label: 'Category' },
    { key: 'days', label: 'Entitlement', fmt: (_, r) => this.entText(r) },
    { key: 'carry', label: 'Carry Forward', fmt: (v, r) => (r.per === 'request' || r.per === 'configurable' ? (r.per === 'configurable' ? 'Configurable' : 'N/A') : v ? `Yes (Max ${r.carryMax})` : 'No') },
    { key: 'encash', label: 'Encashment', fmt: (v, r) => (r.per === 'configurable' ? 'Configurable' : v === null ? 'N/A' : v ? 'Yes' : 'No') },
    { key: 'applicable', label: 'Applicable To' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'group', label: 'Policy Group', options: ['Standard', 'Statutory', 'Company'] },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
    { key: 'applicable', label: 'Applicable To', options: APPLIES },
    { key: 'paidLabel', label: 'Paid / Unpaid', options: ['Paid', 'Unpaid'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'file-text' },
    { id: 'edit', label: 'Edit', icon: 'sliders' },
    { id: 'duplicate', label: 'Duplicate', icon: 'plus' },
    { id: 'activate', label: 'Activate', icon: 'shield-check', when: (r) => r.status !== 'Active' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', when: (r) => r.status === 'Active' },
    { id: 'delete', label: 'Delete', icon: 'ban', danger: true },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'activate', label: 'Activate' }, { id: 'deactivate', label: 'Deactivate' }, { id: 'export', label: 'Export' }];

  protected readonly sel = computed(() => this.types().find((t) => t.code === this.selCode()) ?? null);
  protected readonly rules = computed<Rules>(() => this.ruleMap()[this.selCode()!] ?? { halfDay: this.sel()?.unit.includes('Half') ?? false, hourly: this.sel()?.unit.includes('Hour') ?? false, sandwich: false, negative: this.sel()?.code === 'AL' ? 5 : 0, docAfter: this.sel()?.code === 'SL' ? 2 : 0, backdate: this.sel()?.code === 'SL' ? 7 : 0, clubbing: true, probation: this.sel()?.code === 'SL' });
  protected readonly ents = computed<Ent[]>(() => {
    const t = this.sel()!;
    return this.entMap()[t.code] ?? [
      { grade: 'Staff (G1–G4)', days: t.days, accrual: t.per === 'year' ? `Monthly (${(t.days / 12).toFixed(2)}/month)` : 'Granted on request', bonus: t.code === 'AL' ? '+1 day per 5 years' : '—' },
      { grade: 'Managers (G5–G7)', days: t.code === 'AL' ? t.days : t.days, accrual: t.per === 'year' ? 'Monthly' : 'Granted on request', bonus: t.code === 'AL' ? '+2 days per 5 years' : '—' },
      { grade: 'Executives (G8+)', days: t.code === 'AL' ? t.days + 5 : t.days, accrual: t.per === 'year' ? 'Upfront (1 Jan)' : 'Granted on request', bonus: '—' },
      { grade: 'Part-time', days: Math.round(t.days / 2), accrual: t.per === 'year' ? 'Monthly, pro-rata to hours' : 'Granted on request', bonus: '—' },
    ];
  });
  protected readonly steps = computed<Step[]>(() => this.stepMap()[this.selCode()!] ?? (['ML', 'UL', 'HJ'].includes(this.selCode()!) ? [{ role: 'Line Manager', sla: 24 }, { role: 'HR Business Partner', sla: 48 }] : [{ role: 'Line Manager', sla: 24 }]));
  protected readonly appl = computed<Appl>(() => {
    const t = this.sel()!;
    return this.applMap()[t.code] ?? { gender: t.applicable.startsWith('Female') ? 'Female' : t.applicable.startsWith('Male') ? 'Male' : 'All', religion: t.applicable.includes('Muslim') ? 'Muslim' : 'All', types: ['Full Time', 'Part Time'], sites: [...this.sites], minService: t.waiting.startsWith('12') ? 12 : 0 };
  });
  protected readonly eligible = computed(() => {
    const a = this.appl();
    let n = 8920 * (a.sites.length / this.sites.length) * (a.types.includes('Part Time') ? 1 : 0.94) * (a.types.includes('Full Time') ? 1 : 0.06);
    if (a.gender !== 'All') n *= a.gender === 'Female' ? 0.38 : 0.62;
    if (a.religion === 'Muslim') n *= 0.55;
    if (a.minService) n *= 0.86;
    return Math.round(n).toLocaleString();
  });

  constructor() {
    this.types.update((l) => l.map((t) => ({ ...t, paidLabel: t.paid ? 'Paid' : 'Unpaid' }) as LeaveType));
  }

  protected entText(t: LeaveType) {
    return t.per === 'request' ? 'As per request' : t.per === 'configurable' ? 'Configurable' : t.per === 'year' ? `${t.days} days / year` : `${t.days} days`;
  }
  protected usedDays(t: LeaveType) {
    return Math.round(((t.days || 30) * t.utilization) / 10) / 10;
  }
  protected remDays(t: LeaveType) {
    return Math.round(((t.days || 30) - this.usedDays(t)) * 10) / 10;
  }
  protected util(t: LeaveType) {
    return [
      { label: 'Utilized', value: t.utilization, color: 'var(--ka-7c3aed)' },
      { label: 'Remaining', value: 100 - t.utilization, color: 'var(--ka-ddd6fe)' },
    ];
  }
  protected trend(t: LeaveType) {
    return [
      { name: 'Approved', color: 'var(--ka-7c3aed)', values: t.used },
      { name: 'Requested', color: 'var(--ka-ddd6fe)', values: t.used.map((v) => Math.round(v * 1.3)) },
    ];
  }

  protected patch(c: Partial<LeaveType>) {
    const code = this.selCode();
    this.types.update((l) => l.map((t) => (t.code === code ? { ...t, ...c } : t)));
  }
  protected setRule<K extends keyof Rules>(k: K, v: Rules[K]) {
    this.ruleMap.update((m) => ({ ...m, [this.selCode()!]: { ...this.rules(), [k]: v } }));
  }
  protected setEnt(i: number, days: number) {
    this.entMap.update((m) => ({ ...m, [this.selCode()!]: this.ents().map((e, j) => (j === i ? { ...e, days } : e)) }));
    if (i === 0) this.patch({ days });
  }
  protected setStep(i: number, c: Partial<Step>) {
    this.stepMap.update((m) => ({ ...m, [this.selCode()!]: this.steps().map((s, j) => (j === i ? { ...s, ...c } : s)) }));
  }
  protected addStep() {
    this.stepMap.update((m) => ({ ...m, [this.selCode()!]: [...this.steps(), { role: 'HR Business Partner', sla: 48 }] }));
  }
  protected removeStep(i: number) {
    this.stepMap.update((m) => ({ ...m, [this.selCode()!]: this.steps().filter((_, j) => j !== i) }));
  }
  protected setAppl<K extends keyof Appl>(k: K, v: Appl[K]) {
    this.applMap.update((m) => ({ ...m, [this.selCode()!]: { ...this.appl(), [k]: v } }));
  }
  protected toggleList(k: 'types' | 'sites', v: string) {
    const cur = this.appl()[k];
    this.setAppl(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  }

  // ---------- Add / edit ----------
  protected readonly form = signal<LeaveType | null>(null);
  protected readonly err = signal('');
  protected openForm(t?: LeaveType) {
    this.err.set('');
    this.dmore.set(false);
    this.form.set(t ? { ...t } : { ...LEAVE_TYPES[0], id: 0, name: '', code: '', days: 5, per: 'year', carry: false, carryMax: 0, encash: false, category: 'Special', icon: 'sun', color: 'var(--ka-0d9488)', description: '', utilization: 0, used: [0, 0, 0, 0, 0, 0] });
  }
  protected setF<K extends keyof LeaveType>(k: K, v: LeaveType[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim() || !f.code.trim()) return this.err.set('Name and code are required.');
    if (this.types().some((t) => t.code === f.code && t.id !== f.id)) return this.err.set(`Code ${f.code} already exists.`);
    const t = { ...f, carry: f.carryMax > 0, paidLabel: f.paid ? 'Paid' : 'Unpaid' } as LeaveType;
    if (f.id) this.types.update((l) => l.map((x) => (x.id === f.id ? t : x)));
    else this.types.update((l) => [...l, { ...t, id: Math.max(...l.map((x) => x.id)) + 1 }]);
    this.selCode.set(f.code);
    this.form.set(null);
    this.notify(`${f.name} saved`);
  }
  protected duplicate(t: LeaveType) {
    this.openForm({ ...t, id: 0, name: `${t.name} (copy)`, code: (t.code + 'C').slice(0, 4) });
  }
  protected onAction(a: string, t: LeaveType) {
    this.dmore.set(false);
    if (a === 'view') return this.selCode.set(t.code);
    if (a === 'edit') return this.openForm(t);
    if (a === 'duplicate') return this.duplicate(t);
    if (a === 'delete') {
      this.types.update((l) => l.filter((x) => x.code !== t.code));
      if (this.selCode() === t.code) this.selCode.set(null);
      return this.notify(`${t.name} deleted`);
    }
    this.types.update((l) => l.map((x) => (x.code === t.code ? { ...x, status: a === 'activate' ? 'Active' : 'Inactive' } : x)));
  }
  protected onBulk(a: string, codes: string[]) {
    if (a === 'export') return this.exportCsv(this.types().filter((t) => codes.includes(t.code)));
    this.types.update((l) => l.map((x) => (codes.includes(x.code) ? { ...x, status: a === 'activate' ? 'Active' : 'Inactive' } : x)));
  }
  protected exportCsv(list = this.types()) {
    this.more.set(false);
    downloadCsv('leave-types.csv', [['Code', 'Name', 'Category', 'Entitlement', 'Carry max', 'Encashment', 'Applicable', 'Paid', 'Status'], ...list.map((t) => [t.code, t.name, t.category, this.entText(t), t.carryMax, t.encash === null ? 'N/A' : t.encash ? 'Yes' : 'No', t.applicable, t.paid ? 'Paid' : 'Unpaid', t.status])]);
  }
  protected reset() {
    this.more.set(false);
    this.types.set(LEAVE_TYPES.map((t) => ({ ...t, paidLabel: t.paid ? 'Paid' : 'Unpaid' }) as LeaveType));
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
