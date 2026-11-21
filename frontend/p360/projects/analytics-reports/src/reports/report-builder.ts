import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { ScheduleModal } from './reports-modals';
import { applyFilters, datasetOf, FIELDS, FilterRule, groupRows, rowsFor } from './reports-datasets';
import { BREAK_COLORS, CATEGORIES, DATASETS, fmtNum, Report, ReportsStore } from './reports.data';

type Chart = 'table' | 'bar' | 'line' | 'donut';
const CAT_OF: Record<string, string> = { employees: 'Workforce', attendance: 'Attendance', access: 'Security', visitors: 'Visitors', spaces: 'Facilities', leave: 'Leave', training: 'Training', incidents: 'Safety', meals: 'Canteen' };
const DS_OF_CAT: Record<string, string> = Object.fromEntries(Object.entries(CAT_OF).map(([k, v]) => [v, k]));
const PRESETS: { name: string; ds: string; fields: string[]; rules: FilterRule[]; by: string; agg: 'count' | 'sum' | 'avg'; measure: string; chart: Chart }[] = [
  { name: 'Late Arrivals by Department', ds: 'attendance', fields: ['date', 'name', 'department', 'status', 'checkIn'], rules: [{ field: 'status', op: 'is', value: 'Late' }], by: 'department', agg: 'count', measure: 'hours', chart: 'bar' },
  { name: 'Meeting Room Utilization by Floor', ds: 'spaces', fields: ['date', 'space', 'floor', 'hours', 'utilization'], rules: [{ field: 'spaceType', op: 'is', value: 'Meeting Rooms' }], by: 'floor', agg: 'avg', measure: 'utilization', chart: 'bar' },
  { name: 'Denied Access by Door', ds: 'access', fields: ['time', 'name', 'door', 'method', 'result'], rules: [{ field: 'result', op: 'is', value: 'Denied' }], by: 'door', agg: 'count', measure: 'name', chart: 'donut' },
  { name: 'Daily Visitor Volume', ds: 'visitors', fields: ['date', 'name', 'company', 'purpose', 'dwell'], rules: [], by: 'date', agg: 'count', measure: 'dwell', chart: 'line' },
  { name: 'Overdue Training by Course', ds: 'training', fields: ['name', 'course', 'department', 'due', 'status'], rules: [{ field: 'status', op: 'is', value: 'Overdue' }], by: 'course', agg: 'count', measure: 'score', chart: 'bar' },
];

@Component({
  selector: 'app-reports-custom-report-builder',
  imports: [...UI, ScheduleModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Custom Report Builder" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Pick a data source, choose fields, filter, group and visualise — the preview updates live as you build.">
      <button class="btn-ghost" (click)="reset()"><app-icon name="refresh" [size]="15" />Reset</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export CSV</button>
      <button class="btn-primary" (click)="openSave()"><app-icon name="file-check" [size]="16" />Save to Library</button>
    </app-page-head>

    <div class="presets"><span>Quick start:</span>@for (p of presets; track p.name) {<button class="chip-b" (click)="applyPreset(p)">{{ p.name }}</button>}</div>

    <section class="bld">
      <aside class="steps">
        <div class="card st">
          <h4><span class="n">1</span>Data Source</h4>
          <div class="dsl">
            @for (d of datasets; track d.id) {
              <button [class.on]="ds() === d.id" (click)="pickDs(d.id)"><span class="di" [style.background]="d.color"><app-icon [name]="d.icon" [size]="15" /></span><div><b>{{ d.name }}</b><small>{{ d.module }} · {{ fmt(d.records) }}</small></div></button>
            }
          </div>
        </div>
        <div class="card st">
          <h4><span class="n">2</span>Fields <small>{{ fields().length }}/{{ allFields().length }}</small><button class="link" (click)="toggleAllFields()">{{ fields().length === allFields().length ? 'Clear' : 'Select all' }}</button></h4>
          <div class="fl">@for (f of allFields(); track f.key) {<label><input type="checkbox" [checked]="fields().includes(f.key)" (change)="toggleField(f.key)" />{{ f.label }}<em>{{ f.type }}</em></label>}</div>
        </div>
        <div class="card st">
          <h4><span class="n">3</span>Filters <button class="link" (click)="addRule()">+ Add filter</button></h4>
          @for (r of rules(); track $index; let i = $index) {
            <div class="rule">
              <select class="select" [value]="r.field" (change)="setRule(i, 'field', $any($event.target).value)">@for (f of allFields(); track f.key) {<option [value]="f.key">{{ f.label }}</option>}</select>
              <select class="select op" [value]="r.op" (change)="setRule(i, 'op', $any($event.target).value)">@for (o of ops; track o) {<option [value]="o">{{ o }}</option>}</select>
              @if (valuesOf(r.field).length) {
                <select class="select" [value]="r.value" (change)="setRule(i, 'value', $any($event.target).value)"><option value="">Any</option>@for (v of valuesOf(r.field); track v) {<option [value]="v">{{ v }}</option>}</select>
              } @else {
                <input class="input" [value]="r.value" (input)="setRule(i, 'value', $any($event.target).value)" placeholder="value" />
              }
              <button class="x" (click)="removeRule(i)" aria-label="Remove filter">×</button>
            </div>
          } @empty {<p class="muted sm">No filters · all {{ fmt(base().length) }} sample rows included.</p>}
        </div>
        <div class="card st">
          <h4><span class="n">4</span>Group &amp; Summarise</h4>
          <div class="g3">
            <label>Group by<select class="select" [value]="by()" (change)="by.set($any($event.target).value)"><option value="">None (raw rows)</option>@for (f of textFields(); track f.key) {<option [value]="f.key">{{ f.label }}</option>}</select></label>
            <label>Aggregate<select class="select" [value]="agg()" (change)="agg.set($any($event.target).value)" [disabled]="!by()"><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Average</option></select></label>
            <label>Measure<select class="select" [value]="measure()" (change)="measure.set($any($event.target).value)" [disabled]="!by() || agg() === 'count'">@for (f of numFields(); track f.key) {<option [value]="f.key">{{ f.label }}</option>}</select></label>
          </div>
        </div>
        <div class="card st">
          <h4><span class="n">5</span>Chart Type</h4>
          <div class="ct">
            @for (c of charts; track c[0]) {<button [class.on]="chart() === c[0]" (click)="chart.set(c[0])" [disabled]="c[0] !== 'table' && !by()"><app-icon [name]="c[2]" [size]="18" />{{ c[1] }}</button>}
          </div>
          @if (!by()) {<p class="muted sm">Charts need a Group by field.</p>}
        </div>
      </aside>

      <div class="card pvw">
        <div class="ph">
          <div class="tt"><input class="title-in" [value]="name()" (input)="name.set($any($event.target).value)" aria-label="Report name" /><small>{{ dsInfo().name }} · {{ dsInfo().module }}</small></div>
          <span class="live"><i></i>Live preview</span>
        </div>
        <div class="chips">
          <span class="chip-s"><b>{{ fmt(filtered().length) }}</b> rows matched</span>
          <span class="chip-s"><b>{{ fields().length }}</b> fields</span>
          <span class="chip-s"><b>{{ activeRules() }}</b> filters</span>
          @if (by()) {<span class="chip-s">grouped by <b>{{ labelOf(by()) }}</b> · {{ agg() }}{{ agg() !== 'count' ? ' of ' + labelOf(measure()) : '' }}</span>}
        </div>
        @if (by() && chart() !== 'table') {
          <div class="chart">
            @switch (chart()) {
              @case ('bar') {<app-column-chart [labels]="chartLabels()" [series]="chartSeries()" [height]="250" [legend]="false" />}
              @case ('line') {<app-line-chart [labels]="chartLabels()" [series]="chartSeries()" [height]="250" [legend]="false" />}
              @case ('donut') {<app-donut [segments]="donutSegs()" [center]="agg() === 'count' ? 'Rows' : 'Total'" [size]="200" />}
            }
          </div>
        }
        <div class="table-wrap tw">
          @if (by()) {
            <table class="table"><thead><tr><th>{{ labelOf(by()) }}</th><th class="num">{{ agg() === 'count' ? 'Count' : (agg() === 'sum' ? 'Sum' : 'Avg') + ' of ' + labelOf(measure()) }}</th><th>Share</th></tr></thead>
              <tbody>@for (g of grouped(); track g.key) {<tr><td>{{ g.key }}</td><td class="num">{{ fmt(g.value) }}</td><td><div class="share"><i [style.width.%]="(g.value / maxG()) * 100"></i></div></td></tr>}</tbody></table>
          } @else {
            <table class="table"><thead><tr>@for (f of fields(); track f) {<th>{{ labelOf(f) }}</th>}</tr></thead>
              <tbody>@for (r of rawPage(); track $index) {<tr>@for (f of fields(); track f) {<td>{{ r[f] }}</td>}</tr>} @empty {<tr><td [attr.colspan]="fields().length || 1" class="muted">No rows match the filters.</td></tr>}</tbody></table>
          }
        </div>
        @if (!by() && filtered().length > 15) {
          <div class="pager"><span>Rows {{ rp() * 15 + 1 }}–{{ min(filtered().length, (rp() + 1) * 15) }} of {{ fmt(filtered().length) }}</span>
            <span><button class="btn-ghost sm" [disabled]="rp() === 0" (click)="rp.set(rp() - 1)">Prev</button> <button class="btn-ghost sm" [disabled]="(rp() + 1) * 15 >= filtered().length" (click)="rp.set(rp() + 1)">Next</button></span></div>
        }
      </div>
    </section>

    @if (saving()) {
      <div class="g-overlay" (click)="saving.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ editing() ? 'Update report in library' : 'Save to Report Library' }}</h3><button type="button" class="close-btn" (click)="saving.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Report name *<input class="input" [value]="name()" (input)="name.set($any($event.target).value)" /></label>
          <label>Category<select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)">@for (c of categories; track c) {<option [value]="c">{{ c }}</option>}</select></label>
          <label>Module<input class="input" [value]="dsInfo().module" readonly /></label>
          <label class="full">Description<input class="input" [value]="desc()" (input)="desc.set($any($event.target).value)" /></label>
          <label class="full cbx"><input type="checkbox" [checked]="thenSchedule()" (change)="thenSchedule.set(!thenSchedule())" />Schedule this report after saving</label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="saving.set(false)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    @if (schedFor(); as r) {<rpt-schedule-modal [report]="r" (closed)="schedFor.set(null); $event && toastMsg($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}@if (savedId()) { · <button class="tl" (click)="openInLibrary()">Open in library</button>}</div>}
  `,
  styles: `
    .presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--muted); }
    .chip-b { border: 1px solid var(--kl-ddd6fe); background: var(--kb-faf8ff); color: var(--primary); border-radius: 20px; padding: 5px 12px; font-size: 12px; cursor: pointer; } .chip-b:hover { background: var(--primary-soft); }
    .bld { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 14px; align-items: start; }
    .steps { display: flex; flex-direction: column; gap: 10px; } .st { padding: 12px; }
    h4 { margin: 0 0 10px; font-size: 13px; display: flex; align-items: center; gap: 8px; } h4 small { color: var(--muted); font-weight: 400; } h4 .link { margin-left: auto; }
    .n { width: 20px; height: 20px; border-radius: 50%; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 11px; }
    .dsl { display: grid; grid-template-columns: 1fr; gap: 5px; max-height: 250px; overflow: auto; }
    .dsl button { display: flex; gap: 10px; align-items: center; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; text-align: left; }
    .dsl button.on { border-color: var(--primary); background: var(--kb-f5f3ff); } .dsl div { display: flex; flex-direction: column; font-size: 12px; } .dsl small { color: var(--muted); font-size: 11px; }
    .di { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .fl { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px; } .fl label { display: flex; align-items: center; gap: 6px; font-size: 12px; } .fl em { margin-left: auto; font-size: 10px; color: var(--muted); font-style: normal; }
    .fl input, .cbx input { accent-color: var(--primary); }
    .rule { display: grid; grid-template-columns: 1fr 74px 1fr 20px; gap: 5px; margin-bottom: 6px; align-items: center; } .rule .select, .rule .input { font-size: 11.5px; padding: 5px 6px; min-width: 0; width: 100%; }
    .x { border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--muted); }
    .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; } .g3 label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--kf-4b4f6b); } .g3 .select { font-size: 11.5px; padding: 5px 6px; min-width: 0; }
    .ct { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .ct button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font-size: 11.5px; cursor: pointer; color: var(--kf-3b3f5c); }
    .ct button.on { border-color: var(--primary); background: var(--kb-f5f3ff); color: var(--primary); } .ct button:disabled { opacity: 0.4; cursor: not-allowed; }
    .sm { font-size: 11.5px; margin: 6px 0 0; } .muted { color: var(--muted); }
    .pvw { min-height: 600px; position: sticky; top: 76px; }
    .ph { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; } .tt { display: flex; flex-direction: column; flex: 1; } .tt small { color: var(--muted); font-size: 12px; }
    .title-in { border: 0; border-bottom: 1px dashed transparent; font: inherit; font-size: 19px; font-weight: 700; padding: 2px 0; outline: 0; width: 100%; } .title-in:hover, .title-in:focus { border-bottom-color: var(--kl-c4b5fd); }
    .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--kf-16a34a); background: var(--kb-dcfce7); padding: 3px 10px; border-radius: 20px; } .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-16a34a); animation: pl 1.4s infinite; }
    @keyframes pl { 50% { opacity: 0.3; } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; } .chip-s { background: var(--kb-f3f3f8); border-radius: 20px; padding: 4px 10px; font-size: 12px; color: var(--kf-3b3f5c); }
    .chart { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .tw { max-height: 520px; border: 1px solid var(--border); border-radius: 10px; }
    .share { height: 8px; background: var(--kb-eef0f6); border-radius: 4px; width: 160px; overflow: hidden; } .share i { display: block; height: 100%; background: var(--primary); }
    .cbx { flex-direction: row !important; align-items: center; gap: 8px; }
    .tl { border: 0; background: none; color: var(--kf-c4b5fd); font: inherit; cursor: pointer; text-decoration: underline; }
    @media (max-width: 1250px) { .bld { grid-template-columns: 1fr; } .pvw { position: static; } }
  `,
})
export class CustomReportBuilder {
  private readonly store = inject(ReportsStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtNum;
  protected readonly min = Math.min;
  protected readonly datasets = DATASETS;
  protected readonly categories = CATEGORIES;
  protected readonly presets = PRESETS;
  protected readonly ops: FilterRule['op'][] = ['is', 'is not', 'contains', '>', '<', '>=', '<='];
  protected readonly charts: [Chart, string, string][] = [['table', 'Table', 'reports-table'], ['bar', 'Bar', 'reports-bar'], ['line', 'Line', 'reports-line'], ['donut', 'Donut', 'reports-pie']];

  protected readonly ds = signal('attendance');
  protected readonly fields = signal<string[]>(['date', 'name', 'department', 'site', 'status', 'hours']);
  protected readonly rules = signal<FilterRule[]>([{ field: 'site', op: 'is', value: 'Head Office' }]);
  protected readonly by = signal('department');
  protected readonly agg = signal<'count' | 'sum' | 'avg'>('avg');
  protected readonly measure = signal('hours');
  protected readonly chart = signal<Chart>('bar');
  protected readonly name = signal('Average Hours by Department (Head Office)');
  protected readonly rp = signal(0);
  protected readonly saving = signal(false);
  protected readonly cat = signal('Attendance');
  protected readonly desc = signal('');
  protected readonly thenSchedule = signal(false);
  protected readonly err = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly savedId = signal<string | null>(null);
  protected readonly schedFor = signal<Report | null>(null);
  protected readonly editing = signal<Report | null>(null);

  constructor() {
    const id = this.store.focusId();
    const r = id ? this.store.byId().get(id) : null;
    if (r) {
      this.store.focusId.set(null);
      this.editing.set(r);
      this.pickDs(DS_OF_CAT[r.category] ?? 'attendance');
      this.name.set(r.name);
      this.cat.set(r.category);
      this.desc.set(r.description);
    }
  }

  protected readonly dsInfo = computed(() => datasetOf(this.ds()));
  protected readonly allFields = computed(() => FIELDS[this.ds()]);
  protected readonly textFields = computed(() => this.allFields().filter((f) => f.type !== 'num'));
  protected readonly numFields = computed(() => this.allFields().filter((f) => f.type === 'num'));
  protected readonly base = computed(() => rowsFor(this.ds()));
  protected readonly filtered = computed(() => applyFilters(this.base(), this.rules()));
  protected readonly activeRules = computed(() => this.rules().filter((r) => r.value !== '').length);
  protected readonly grouped = computed(() => (this.by() ? groupRows(this.filtered(), this.by(), this.agg(), this.measure()) : []));
  protected readonly maxG = computed(() => Math.max(1, ...this.grouped().map((g) => g.value)));
  protected readonly rawPage = computed(() => this.filtered().slice(this.rp() * 15, (this.rp() + 1) * 15));
  protected readonly chartLabels = computed(() => this.grouped().slice(0, 14).map((g) => (g.key.length > 14 ? g.key.slice(0, 13) + '…' : g.key)));
  protected readonly chartSeries = computed(() => [{ name: this.labelOf(this.measure()), color: 'var(--ka-7c3aed)', values: this.grouped().slice(0, 14).map((g) => g.value), area: true }]);
  protected readonly donutSegs = computed(() => {
    const g = this.grouped();
    const top = g.slice(0, 5).map((x, i) => ({ label: x.key, value: x.value, color: BREAK_COLORS[i] }));
    const rest = g.slice(5).reduce((a, x) => a + x.value, 0);
    return rest ? [...top, { label: 'Others', value: +rest.toFixed(1), color: 'var(--ka-9ca3af)' }] : top;
  });

  protected labelOf(k: string) {
    return this.allFields().find((f) => f.key === k)?.label ?? k;
  }
  protected valuesOf(k: string) {
    const f = this.allFields().find((x) => x.key === k);
    if (!f || f.type !== 'text') return [];
    const vals = [...new Set(this.base().map((r) => String(r[k])))];
    return vals.length <= 12 ? vals.sort() : [];
  }
  protected pickDs(id: string) {
    this.ds.set(id);
    const f = FIELDS[id];
    this.fields.set(f.slice(0, 6).map((x) => x.key));
    this.rules.set([]);
    this.by.set('');
    this.measure.set(f.find((x) => x.type === 'num')?.key ?? f[0].key);
    this.chart.set('table');
    this.rp.set(0);
    this.cat.set(CAT_OF[id] ?? 'Workforce');
    if (!this.editing()) this.name.set(`${datasetOf(id).name} Report`);
  }
  protected toggleField(k: string) {
    this.fields.update((l) => (l.includes(k) ? l.filter((x) => x !== k) : this.allFields().map((f) => f.key).filter((x) => x === k || l.includes(x))));
  }
  protected toggleAllFields() {
    this.fields.set(this.fields().length === this.allFields().length ? [] : this.allFields().map((f) => f.key));
  }
  protected addRule() {
    const f = this.textFields()[2] ?? this.allFields()[0];
    this.rules.update((l) => [...l, { field: f.key, op: 'is', value: '' }]);
  }
  protected setRule(i: number, k: keyof FilterRule, v: string) {
    this.rules.update((l) => l.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === 'field' ? { value: '' } : {}) } : r)));
    this.rp.set(0);
  }
  protected removeRule(i: number) {
    this.rules.update((l) => l.filter((_, j) => j !== i));
  }
  protected applyPreset(p: (typeof PRESETS)[number]) {
    this.editing.set(null);
    this.pickDs(p.ds);
    this.fields.set(p.fields);
    this.rules.set(p.rules.map((r) => ({ ...r })));
    this.by.set(p.by);
    this.agg.set(p.agg);
    if (p.agg !== 'count') this.measure.set(p.measure);
    this.chart.set(p.chart);
    this.name.set(p.name);
  }
  protected reset() {
    this.editing.set(null);
    this.pickDs('attendance');
  }
  protected exportCsv() {
    if (this.by()) {
      downloadCsv(`${this.slug()}.csv`, [[this.labelOf(this.by()), this.agg()], ...this.grouped().map((g) => [g.key, g.value])]);
    } else {
      downloadCsv(`${this.slug()}.csv`, [this.fields().map((f) => this.labelOf(f)), ...this.filtered().map((r) => this.fields().map((f) => r[f]))]);
    }
    this.store.addExport(this.name(), 'CSV', this.by() ? this.grouped().length : this.filtered().length);
    this.toastMsg('Preview exported to CSV');
  }
  private slug() {
    return this.name().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
  protected openSave() {
    this.err.set('');
    if (!this.desc()) this.desc.set(`Custom report on ${this.dsInfo().name.toLowerCase()}${this.by() ? ' grouped by ' + this.labelOf(this.by()).toLowerCase() : ''}.`);
    this.saving.set(true);
  }
  protected save() {
    if (!this.name().trim()) return this.err.set('Report name is required.');
    if (!this.fields().length) return this.err.set('Select at least one field.');
    const ed = this.editing();
    let rep: Report;
    if (ed) {
      this.store.updateReport(ed.id, { name: this.name().trim(), category: this.cat(), description: this.desc() });
      this.store.log('Edit', this.name(), 'Updated filters and columns in Custom Report Builder');
      rep = this.store.byId().get(ed.id)!;
    } else {
      const d = this.dsInfo();
      rep = this.store.addReport({ name: this.name().trim(), module: d.module, category: this.cat(), type: 'Custom', description: this.desc(), icon: d.icon, color: d.color });
      this.editing.set(rep);
    }
    this.saving.set(false);
    this.savedId.set(rep.id);
    this.toastMsg(`"${rep.name}" saved to Report Library`, 5000);
    if (this.thenSchedule()) this.schedFor.set(rep);
  }
  protected openInLibrary() {
    this.store.focusId.set(this.savedId());
    this.router.navigateByUrl('/reports-analytics/report-library');
  }
  protected toastMsg(m: string, ms = 2600) {
    this.toast.set(m);
    setTimeout(() => {
      this.toast.set(null);
      this.savedId.set(null);
    }, ms);
  }
}
