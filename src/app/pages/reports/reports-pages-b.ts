import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { ShareModal } from './reports-modals';
import { datasetOf, FIELDS, Row, rowsFor } from './reports-datasets';
import { AuditEvent, CATEGORIES, DATASETS, DEPARTMENTS, fmtDate, fmtNum, PERM_LEVELS, Report, REPORTS, ReportsStore, ROLES, Share, SITES, TODAY } from './reports.data';

const mkToast = () => {
  const t = signal<string | null>(null);
  let h: ReturnType<typeof setTimeout>;
  return Object.assign(t, {
    show(m: string) {
      t.set(m);
      clearTimeout(h);
      h = setTimeout(() => t.set(null), 2600);
    },
  });
};
const dt = (s: string) => `${s.slice(0, 10) === TODAY ? 'Today' : fmtDate(s.slice(0, 10)).slice(0, 6)}, ${s.slice(11, 16)}`;
function downloadText(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ======================= Data Export ======================= */
@Component({
  selector: 'app-reports-data-export',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Data Export" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Export raw People360 data to CSV, Excel or JSON with column selection and filters.">
      <button class="btn-ghost" (click)="exportHistory()"><app-icon name="download" [size]="15" />Export History</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Exports (This Month)" [value]="store.exportsThisMonth()" icon="download" color="var(--ka-ef4444)" change="12%" sub="vs. last month" />
      <app-kpi label="Rows Exported" [value]="fmt(rowsTotal())" icon="reports-table" color="var(--ka-2563eb)" sub="last 40 jobs" />
      <app-kpi label="Datasets Available" [value]="datasets.length" icon="reports-db" color="var(--ka-7c3aed)" sub="across 9 modules" />
      <app-kpi label="Avg. Export Time" value="3.1s" icon="clock" color="var(--ka-f59e0b)" change="0.4s" [up]="false" sub="faster" />
      <app-kpi label="Failed Exports" [value]="failed()" icon="triangle-alert" color="var(--ka-dc2626)" sub="last 30 days" />
    </section>

    <section class="ex">
      <div class="card wiz">
        <h4><span class="n">1</span>Dataset</h4>
        <div class="dsg">@for (d of datasets; track d.id) {<button [class.on]="ds() === d.id" (click)="pick(d.id)"><span class="di" [style.background]="d.color"><app-icon [name]="d.icon" [size]="15" /></span><div><b>{{ d.name }}</b><small>{{ fmt(d.records) }} records</small></div></button>}</div>
        <div class="two">
          <div>
            <h4><span class="n">2</span>Columns <button class="link" (click)="cols.set(cols().length === fields().length ? [] : allKeys())">{{ cols().length === fields().length ? 'Clear' : 'All' }}</button></h4>
            <div class="cl">@for (f of fields(); track f.key) {<label><input type="checkbox" [checked]="cols().includes(f.key)" (change)="toggleCol(f.key)" />{{ f.label }}</label>}</div>
          </div>
          <div>
            <h4><span class="n">3</span>Filters</h4>
            <div class="fg">
              @if (hasField('site')) {<label>Site<select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>}
              @if (hasField('department')) {<label>Department<select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)"><option value="">All Departments</option>@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select></label>}
              @if (dateKey()) {
                <label>From<input class="input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
                <label>To<input class="input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
              }
            </div>
            <h4 class="mt"><span class="n">4</span>Format</h4>
            <div class="fmt">@for (f of formats; track f) {<button [class.on]="format() === f" (click)="format.set(f)">{{ f }}</button>}</div>
            <label class="ck"><input type="checkbox" [checked]="header()" (change)="header.set(!header())" />Include header row</label>
            <label class="ck"><input type="checkbox" [checked]="mask()" (change)="mask.set(!mask())" />Mask personal names (GDPR)</label>
          </div>
        </div>
        <div class="pvh"><h4>Preview <small class="muted">first 6 of {{ fmt(rows().length) }} matching rows</small></h4>
          <button class="btn-primary" [disabled]="!cols().length || !rows().length" (click)="doExport()"><app-icon name="download" [size]="15" />Export {{ fmt(rows().length) }} rows as {{ format() }}</button></div>
        <div class="table-wrap pw"><table class="table"><thead><tr>@for (c of cols(); track c) {<th>{{ label(c) }}</th>}</tr></thead>
          <tbody>@for (r of rows().slice(0, 6); track $index) {<tr>@for (c of cols(); track c) {<td>{{ cell(r, c) }}</td>}</tr>} @empty {<tr><td class="muted">No rows match.</td></tr>}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Export History</h3></div>
        <app-data-table [rows]="store.exports()" [columns]="hcols" [filters]="hfilters" [actions]="hactions" noun="exports" [searchKeys]="['dataset', 'by', 'id']" searchPlaceholder="Search exports..." [pageSize]="12" (action)="hact($event.action, $event.row)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .ex { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; } .wiz .dsg { grid-template-columns: repeat(5, 1fr); }
    h4 { margin: 0 0 10px; font-size: 13px; display: flex; gap: 8px; align-items: center; } h4 .link { margin-left: auto; } .mt { margin-top: 14px; } .muted { color: var(--muted); font-weight: 400; font-size: 12px; }
    .n { width: 20px; height: 20px; border-radius: 50%; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 11px; }
    .dsg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
    .dsg button { display: flex; gap: 8px; align-items: center; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); padding: 7px; cursor: pointer; text-align: left; }
    .dsg button.on { border-color: var(--primary); background: var(--kb-f5f3ff); } .dsg div { display: flex; flex-direction: column; font-size: 12px; min-width: 0; } .dsg small { color: var(--muted); font-size: 11px; }
    .di { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .cl { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; } .cl label, .ck { display: flex; gap: 6px; align-items: center; font-size: 12px; } .ck { margin-top: 8px; } input[type='checkbox'] { accent-color: var(--primary); }
    .fg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .fg label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--kf-4b4f6b); } .fg .select, .fg .input { min-width: 0; font-size: 12px; }
    .fmt { display: flex; gap: 6px; } .fmt button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 7px; padding: 6px 14px; font-size: 12px; cursor: pointer; } .fmt button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .pvh { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; } .pvh h4 { margin: 0; }
    .pw { border: 1px solid var(--border); border-radius: 8px; }
    @media (max-width: 1350px) { .ex { grid-template-columns: 1fr; } }
  `,
})
export class DataExport {
  protected readonly store = inject(ReportsStore);
  protected readonly fmt = fmtNum;
  protected readonly toast = mkToast();
  protected readonly datasets = DATASETS;
  protected readonly sites = SITES;
  protected readonly depts = DEPARTMENTS;
  protected readonly formats = ['CSV', 'Excel', 'JSON'] as const;
  protected readonly ds = signal('attendance');
  protected readonly cols = signal<string[]>(FIELDS['attendance'].map((f) => f.key));
  protected readonly site = signal('');
  protected readonly dept = signal('');
  protected readonly from = signal('2026-09-14');
  protected readonly to = signal(TODAY);
  protected readonly format = signal<'CSV' | 'Excel' | 'JSON'>('CSV');
  protected readonly header = signal(true);
  protected readonly mask = signal(false);
  protected readonly fields = computed(() => FIELDS[this.ds()]);
  protected readonly dateKey = computed(() => this.fields().find((f) => f.type === 'date')?.key ?? '');
  protected readonly rows = computed(() => {
    const dk = this.dateKey();
    return rowsFor(this.ds(), 1200).filter(
      (r) => (!this.site() || r['site'] === this.site()) && (!this.dept() || r['department'] === this.dept()) && (!dk || (String(r[dk]).slice(0, 10) >= this.from() && String(r[dk]).slice(0, 10) <= this.to())),
    );
  });
  protected readonly rowsTotal = computed(() => this.store.exports().reduce((a, e) => a + e.rows, 0));
  protected readonly failed = computed(() => this.store.exports().filter((e) => e.status === 'Failed').length);
  protected readonly hcols: Col[] = [
    { key: 'id', label: 'Job' },
    { key: 'dataset', label: 'Dataset / Report' },
    { key: 'format', label: 'Format', kind: 'tag', tag: (r) => (r.format === 'PDF' ? 'tag red' : r.format === 'Excel' ? 'tag green' : r.format === 'JSON' ? 'tag amber' : 'tag blue') },
    { key: 'rows', label: 'Rows', kind: 'num' },
    { key: 'by', label: 'By' },
    { key: 'at', label: 'When', fmt: (v) => dt(v) },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly hfilters = [{ key: 'format', label: 'Format', options: ['CSV', 'Excel', 'JSON', 'PDF'] }, { key: 'status', label: 'Status', options: ['Completed', 'Failed'] }];
  protected readonly hactions: RowAction[] = [
    { id: 'download', label: 'Download again', icon: 'download', when: (r) => r.status === 'Completed' },
    { id: 'retry', label: 'Retry', icon: 'refresh', when: (r) => r.status === 'Failed' },
  ];

  protected allKeys() {
    return this.fields().map((f) => f.key);
  }
  protected hasField(k: string) {
    return this.fields().some((f) => f.key === k);
  }
  protected label(k: string) {
    return this.fields().find((f) => f.key === k)?.label ?? k;
  }
  protected cell(r: Row, k: string) {
    const v = r[k];
    return this.mask() && (k === 'name' || k === 'host') ? String(v).replace(/(\w)\w+ (\w)\w+/, '$1*** $2***') : v;
  }
  protected pick(id: string) {
    this.ds.set(id);
    this.cols.set(FIELDS[id].map((f) => f.key));
  }
  protected toggleCol(k: string) {
    this.cols.update((l) => (l.includes(k) ? l.filter((x) => x !== k) : this.allKeys().filter((x) => x === k || l.includes(x))));
  }
  protected doExport() {
    const name = datasetOf(this.ds()).name;
    this.download(name, this.format(), this.rows(), this.cols());
    this.store.addExport(name, this.format(), this.rows().length);
    this.toast.show(`${fmtNum(this.rows().length)} ${name.toLowerCase()} exported as ${this.format()}`);
  }
  private download(name: string, format: string, rows: Row[], cols: string[]) {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${TODAY}`;
    if (format === 'JSON') return downloadText(`${slug}.json`, JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c) => [c, this.cell(r, c)]))), null, 2), 'application/json');
    const body = rows.map((r) => cols.map((c) => this.cell(r, c)));
    downloadCsv(`${slug}.${format === 'Excel' ? 'xls' : 'csv'}`, this.header() ? [cols.map((c) => this.label(c)), ...body] : body);
  }
  protected hact(a: string, e: { dataset: string; format: string; rows: number; id: string }) {
    const d = DATASETS.find((x) => x.name === e.dataset);
    if (a === 'retry') {
      this.store.exports.update((l) => l.map((x) => (x.id === e.id ? { ...x, status: 'Completed' } : x)));
      return this.toast.show(`${e.id} re-run successfully`);
    }
    if (d) {
      const rows = rowsFor(d.id, Math.min(e.rows, 1200));
      const keys = FIELDS[d.id].map((f) => f.key);
      const prev = this.ds();
      this.ds.set(d.id);
      this.download(d.name, e.format === 'PDF' ? 'CSV' : e.format, rows, keys);
      this.ds.set(prev);
    } else {
      downloadCsv(`${e.id}.csv`, [['Job', 'Dataset', 'Format', 'Rows'], [e.id, e.dataset, e.format, e.rows]]);
    }
    this.store.log('Export', e.dataset, `Re-downloaded ${e.id}`);
    this.toast.show(`${e.id} downloaded`);
  }
  protected exportHistory() {
    downloadCsv('export-history.csv', [['Job', 'Dataset', 'Format', 'Rows', 'Size', 'By', 'When', 'Status'], ...this.store.exports().map((e) => [e.id, e.dataset, e.format, e.rows, e.size, e.by, e.at, e.status])]);
  }
}

/* ======================= Report Sharing & Access ======================= */
interface ShareRow extends Share {
  report: string;
  icon: string;
  color: string;
  status: string;
}
interface Req {
  id: string;
  user: string;
  role: string;
  report: string;
  level: string;
  reason: string;
  at: string;
}
@Component({
  selector: 'app-reports-report-sharing-access',
  imports: [...UI, DataTable, ShareModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Report Sharing & Access" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Control who can view, run, edit and share reports — by role, person or secure link.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
      <button class="btn-primary" (click)="pickShare.set(true)"><app-icon name="reports-share" [size]="15" />Share a Report</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Shared Reports" [value]="sharedReports()" icon="reports-share" color="var(--ka-7c3aed)" sub="with at least one share" />
      <app-kpi label="Active Public Links" [value]="activeLinks()" icon="reports-link" color="var(--ka-2563eb)" sub="password protected" />
      <app-kpi label="External Recipients" [value]="external()" icon="reports-mail" color="var(--ka-f59e0b)" sub="outside the organisation" />
      <app-kpi label="Roles Configured" [value]="roles.length" icon="reports-lock" color="var(--ka-16a34a)" [sub]="categories.length + ' report categories'" />
      <app-kpi label="Pending Requests" [value]="requests().length" icon="bell" color="var(--ka-ef4444)" sub="awaiting approval" [subColor]="requests().length ? 'var(--ka-dc2626)' : undefined" />
    </section>

    <nav class="tabs tb">
      <button [class.on]="tab() === 'matrix'" (click)="tab.set('matrix')">Role Permissions</button>
      <button [class.on]="tab() === 'shares'" (click)="tab.set('shares')">Shared Items<span class="count">{{ store.shares().length }}</span></button>
      <button [class.on]="tab() === 'requests'" (click)="tab.set('requests')">Access Requests<span class="count">{{ requests().length }}</span></button>
    </nav>

    @switch (tab()) {
      @case ('matrix') {
        <section class="card">
          <div class="card-head"><h3>Role × Category Permissions <small class="muted">click a cell to cycle the level</small></h3>
            <div class="lg">@for (l of levels; track l; let i = $index) {<span><i [class]="'lv l' + i"></i>{{ l }}</span>}</div></div>
          <div class="table-wrap"><table class="table mx">
            <thead><tr><th>Role</th>@for (c of categories; track c) {<th>{{ c }}</th>}<th class="num">Reports</th></tr></thead>
            <tbody>@for (r of roles; track r) {
              <tr><td><b>{{ r }}</b></td>
                @for (c of categories; track c) {@let v = store.matrix()[r][c];<td><button [class]="'lv l' + v" (click)="cycle(r, c, v)" [title]="r + ' · ' + c + ': ' + levels[v]">{{ levels[v] }}</button></td>}
                <td class="num">{{ visible(r) }}</td></tr>
            }</tbody>
          </table></div>
          <p class="note"><app-icon name="shield-check" [size]="14" />Changes apply immediately and are recorded in the <button class="link" (click)="go('report-audit-trail')">Report Audit Trail</button>. Row-level security (site / department scope) is inherited from the user's People360 role.</p>
        </section>
      }
      @case ('shares') {
        <section class="card">
          <app-data-table [rows]="shareRows()" [columns]="cols" [filters]="filters" [actions]="actions" noun="shares" [searchKeys]="['report', 'with', 'by']" searchPlaceholder="Search report, recipient..." (action)="act($event.action, $event.row)" />
        </section>
      }
      @case ('requests') {
        <section class="rq">
          @for (q of requests(); track q.id) {
            <div class="card rqc">
              <span class="dt-av" [style.background]="'var(--ka-7c3aed)'">{{ ini(q.user) }}</span>
              <div class="rb"><b>{{ q.user }}</b> <small class="muted">{{ q.role }} · {{ q.at }}</small><p>Requests <span class="tag">{{ q.level }}</span> access to <b>{{ q.report }}</b></p><small class="muted">“{{ q.reason }}”</small></div>
              <div class="ra"><button class="btn-primary btn-sm" (click)="decide(q, true)">Approve</button><button class="btn-ghost sm danger" (click)="decide(q, false)">Deny</button></div>
            </div>
          } @empty {<div class="card empty">No pending access requests 🎉</div>}
        </section>
      }
    }

    @if (pickShare()) {
      <div class="g-overlay" (click)="pickShare.set(false)"></div>
      <div class="g-modal"><div class="modal-head"><h3>Choose a report to share</h3><button class="close-btn" (click)="pickShare.set(false)">×</button></div>
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search reports..." [value]="pq()" (input)="pq.set($any($event.target).value)" /></label>
        <ul class="pick">@for (r of pickList(); track r.id) {<li><button (click)="shareFor.set(r); pickShare.set(false)"><span class="ri" [style.background]="r.color"><app-icon [name]="r.icon" [size]="14" /></span>{{ r.name }}<small>{{ r.module }}</small></button></li>}</ul>
      </div>
    }
    @if (shareFor(); as r) {<rpt-share-modal [report]="r" (closed)="onShared($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .tb { margin-bottom: 12px; } .muted { color: var(--muted); font-weight: 400; font-size: 12px; }
    .lg { display: flex; gap: 12px; font-size: 11.5px; } .lg span { display: inline-flex; gap: 5px; align-items: center; } .lg i.lv { width: 12px; min-width: 0; height: 12px; padding: 0; border-radius: 3px; display: inline-block; }
    .mx td, .mx th { text-align: center; } .mx td:first-child, .mx th:first-child { text-align: left; }
    .lv { border: 0; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer; min-width: 74px; font-weight: 500; }
    .l0 { background: var(--kb-f3f4f6); color: var(--kf-6b7280); } .l1 { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); } .l2 { background: var(--kb-dcfce7); color: var(--kf-15803d); } .l3 { background: var(--kb-fef3c7); color: var(--kf-b45309); } .l4 { background: var(--kb-ede9fe); color: var(--kf-6d28d9); }
    .note { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--kf-4b4f6b); margin: 12px 0 0; }
    .rq { display: flex; flex-direction: column; gap: 10px; } .rqc { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; }
    .rb p { margin: 4px 0; font-size: 12.5px; } .ra { display: flex; gap: 6px; } .danger { color: var(--red); } .empty { text-align: center; color: var(--muted); padding: 40px; }
    .pick { list-style: none; padding: 0; margin: 10px 0 0; max-height: 50vh; overflow: auto; }
    .pick button { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; width: 100%; border: 0; background: none; padding: 7px; border-radius: 7px; cursor: pointer; text-align: left; font-size: 12.5px; }
    .pick button:hover { background: var(--kb-f5f3ff); } .pick small { color: var(--muted); } .ri { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); }
  `,
})
export class ReportSharingAccess {
  protected readonly store = inject(ReportsStore);
  private readonly router = inject(Router);
  protected readonly toast = mkToast();
  protected readonly roles = ROLES;
  protected readonly categories = CATEGORIES;
  protected readonly levels = PERM_LEVELS;
  protected readonly tab = signal<'matrix' | 'shares' | 'requests'>('matrix');
  protected readonly pickShare = signal(false);
  protected readonly shareFor = signal<Report | null>(null);
  protected onShared(msg: string | null | undefined) {
    this.shareFor.set(null);
    if (msg) { this.tab.set('shares'); this.toast.show(msg); }
  }
  protected readonly pq = signal('');
  protected readonly requests = signal<Req[]>([
    { id: 'RQ1', user: 'Grace Liu', role: 'Line Manager', report: 'Overtime Summary', level: 'Run', reason: 'Need weekly overtime for my team of 14', at: 'Today, 09:42' },
    { id: 'RQ2', user: 'Ken Watanabe', role: 'Facility Manager', report: 'Access Control Events', level: 'View', reason: 'Investigating after-hours usage of Floor 5', at: 'Today, 08:15' },
    { id: 'RQ3', user: 'Mohammed Saleh', role: 'Department Head', report: 'Leave Liability Report', level: 'View', reason: 'Quarter-end finance review', at: 'Yesterday, 17:30' },
    { id: 'RQ4', user: 'Fatima Zahra', role: 'Employee', report: 'Meal Consumption Report', level: 'View', reason: 'Canteen committee member', at: 'Yesterday, 11:05' },
  ]);
  protected readonly cols: Col[] = [
    { key: 'report', label: 'Report', kind: 'icon' },
    { key: 'with', label: 'Shared With' },
    { key: 'kind', label: 'Type', kind: 'tag', tag: (r) => (r.kind === 'External' ? 'tag amber' : r.kind === 'Link' ? 'tag blue' : r.kind === 'Role' ? 'tag' : 'tag green') },
    { key: 'permission', label: 'Permission' },
    { key: 'by', label: 'Shared By' },
    { key: 'at', label: 'Shared On', fmt: (v) => fmtDate(v) },
    { key: 'expires', label: 'Expires', fmt: (v) => (v === 'Never' ? 'Never' : fmtDate(v)) },
    { key: 'views', label: 'Views', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'kind', label: 'Type', options: ['User', 'Role', 'Link', 'External'] }, { key: 'permission', label: 'Permission', options: ['View', 'Run', 'Edit'] }, { key: 'status', label: 'Status', options: ['Active', 'Revoked', 'Expired'] }];
  protected readonly actions: RowAction[] = [
    { id: 'copy', label: 'Copy link', icon: 'reports-copy', when: (r) => r.kind === 'Link' && r.active },
    { id: 'extend', label: 'Extend 30 days', icon: 'calendar-days', when: (r) => r.active },
    { id: 'upgrade', label: 'Change permission', icon: 'sliders', when: (r) => r.active },
    { id: 'open', label: 'Open report', icon: 'file-text' },
    { id: 'revoke', label: 'Revoke', icon: 'ban', danger: true, when: (r) => r.active },
    { id: 'restore', label: 'Restore', icon: 'refresh', when: (r) => !r.active },
  ];
  protected readonly shareRows = computed<ShareRow[]>(() =>
    this.store.shares().map((s) => {
      const r = this.store.byId().get(s.reportId);
      const expired = s.expires !== 'Never' && s.expires < TODAY;
      return { ...s, report: r?.name ?? s.reportId, icon: r?.icon ?? 'file-text', color: r?.color ?? 'var(--ka-7c3aed)', status: !s.active ? 'Revoked' : expired ? 'Expired' : 'Active' };
    }),
  );
  protected readonly sharedReports = computed(() => new Set(this.store.shares().filter((s) => s.active).map((s) => s.reportId)).size);
  protected readonly activeLinks = computed(() => this.shareRows().filter((s) => s.kind === 'Link' && s.status === 'Active').length);
  protected readonly external = computed(() => this.shareRows().filter((s) => s.kind === 'External' && s.status === 'Active').length);
  protected readonly pickList = computed(() => this.store.reports().filter((r) => r.name.toLowerCase().includes(this.pq().toLowerCase())).slice(0, 30));

  protected go(s: string) {
    this.router.navigateByUrl(`/reports-analytics/${s}`);
  }
  protected shareClosed(m: string) {
    this.shareFor.set(null);
    if (m) {
      this.tab.set('shares');
      this.toast.show(m);
    }
  }
  protected ini(n: string) {
    return n.split(' ').map((p) => p[0]).join('');
  }
  protected visible(role: string) {
    const m = this.store.matrix()[role];
    return this.store.reports().filter((r) => (m[r.category] ?? 0) > 0).length;
  }
  protected cycle(role: string, cat: string, v: number) {
    const n = (v + 1) % PERM_LEVELS.length;
    this.store.setPerm(role, cat, n);
    this.toast.show(`${role} → ${cat}: ${PERM_LEVELS[n]}`);
  }
  protected act(a: string, s: ShareRow) {
    const upd = (ch: Partial<Share>) => this.store.shares.update((l) => l.map((x) => (x.id === s.id ? { ...x, ...ch } : x)));
    if (a === 'copy') {
      navigator.clipboard?.writeText(`https://people360.app/r/${s.id.toLowerCase()}`).catch(() => undefined);
      return this.toast.show('Link copied to clipboard');
    }
    if (a === 'extend') {
      const base = s.expires === 'Never' ? TODAY : s.expires;
      const d = new Date(base + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 30);
      upd({ expires: d.toISOString().slice(0, 10) });
      return this.toast.show(`Access extended to ${fmtDate(d.toISOString().slice(0, 10))}`);
    }
    if (a === 'upgrade') {
      const next = s.permission === 'View' ? 'Run' : s.permission === 'Run' ? 'Edit' : 'View';
      upd({ permission: next });
      this.store.log('Permission', s.report, `${s.with} changed to ${next}`);
      return this.toast.show(`${s.with} now has ${next} access`);
    }
    if (a === 'open') {
      this.store.focusId.set(s.reportId);
      return this.go('report-library');
    }
    upd({ active: a === 'restore' });
    this.store.log(a === 'restore' ? 'Share' : 'Revoke', s.report, `${a === 'restore' ? 'Restored' : 'Revoked'} access for ${s.with}`);
    this.toast.show(`Access ${a === 'restore' ? 'restored' : 'revoked'} for ${s.with}`);
  }
  protected decide(q: Req, ok: boolean) {
    this.requests.update((l) => l.filter((x) => x.id !== q.id));
    const r = this.store.reports().find((x) => x.name === q.report);
    if (ok && r) this.store.addShare({ reportId: r.id, with: q.user, kind: 'User', permission: q.level as Share['permission'], expires: 'Never' });
    else this.store.log('Permission', q.report, `Request from ${q.user} denied`, 'Denied');
    this.toast.show(`${q.user}'s request ${ok ? 'approved' : 'denied'}`);
  }
  protected exportCsv() {
    downloadCsv('report-shares.csv', [['ID', 'Report', 'Shared With', 'Type', 'Permission', 'By', 'On', 'Expires', 'Views', 'Status'], ...this.shareRows().map((s) => [s.id, s.report, s.with, s.kind, s.permission, s.by, s.at, s.expires, s.views, s.status])]);
  }
}

/* ======================= Report Audit Trail ======================= */
const ACTION_COLOR: Record<string, string> = { Run: 'var(--ka-7c3aed)', View: 'var(--ka-3b82f6)', Export: 'var(--ka-ef4444)', Share: 'var(--ka-16a34a)', Schedule: 'var(--ka-f59e0b)', Edit: 'var(--ka-0ea5e9)', Create: 'var(--ka-22c55e)', Delete: 'var(--ka-dc2626)', Permission: 'var(--ka-6366f1)', Revoke: 'var(--ka-9ca3af)' };
const SIM_USERS = ['Priya Nair', 'Omar Haddad', 'Sara Khan', 'Grace Liu', 'Scheduler', 'Ken Watanabe'];
@Component({
  selector: 'app-reports-report-audit-trail',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Report Audit Trail" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Tamper-evident log of every report view, run, export, share and permission change.">
      <button class="btn-ghost" [class.on]="paused()" (click)="paused.set(!paused())"><app-icon [name]="paused() ? 'play' : 'pause'" [size]="15" />{{ paused() ? 'Resume live' : 'Pause live' }}</button>
      <button class="btn-primary" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export Log</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Events (14 Days)" [value]="fmt(store.audit().length)" icon="activity" color="var(--ka-7c3aed)" sub="all report activity" />
      <app-kpi label="Runs Today" [value]="today('Run')" icon="play" color="var(--ka-2563eb)" sub="incl. scheduled" />
      <app-kpi label="Exports Today" [value]="today('Export')" icon="download" color="var(--ka-ef4444)" sub="CSV, Excel, PDF" />
      <app-kpi label="Failed / Denied" [value]="bad()" icon="triangle-alert" color="var(--ka-f59e0b)" sub="last 14 days" />
      <app-kpi label="Active Users" [value]="users().length" icon="users" color="var(--ka-16a34a)" sub="distinct actors" />
    </section>

    <section class="at">
      <div class="card">
        <div class="card-head"><h3>Activity by Day</h3><span class="muted">last 14 days</span></div>
        <app-column-chart [labels]="days()" [series]="daySeries()" [stacked]="true" [height]="210" />
      </div>
      <div class="card">
        <div class="card-head"><h3>By Action</h3></div>
        <app-bar-list [rows]="byAction()" [max]="maxAction()" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Top Users</h3></div>
        <ul class="tu">@for (u of topUsers(); track u.name) {<li><span class="dt-av" [style.background]="u.color">{{ u.ini }}</span><b>{{ u.name }}</b><span>{{ u.count }}</span></li>}</ul>
      </div>
    </section>

    <section class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" noun="events" [searchKeys]="['user', 'target', 'detail', 'ip']" searchPlaceholder="Search user, report, detail, IP..." [pageSize]="12" idKey="rid" [activeId]="selId() === null ? null : '' + selId()" (rowClick)="selId.set(+$event['id'])" />
    </section>

    @if (sel(); as e) {
      <div class="g-overlay" (click)="selId.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Event #{{ e.id }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
        <span class="ab" [style.background]="color(e.action)">{{ e.action }}</span>
        <dl class="kv">
          <dt>Timestamp</dt><dd>{{ e.at.replace('T', ' ') }}</dd><dt>User</dt><dd>{{ e.user }}</dd><dt>Target</dt><dd>{{ e.target }}</dd><dt>Detail</dt><dd>{{ e.detail }}</dd>
          <dt>Channel</dt><dd>{{ e.channel }}</dd><dt>IP Address</dt><dd>{{ e.ip }}</dd><dt>Result</dt><dd><span [class]="e.result === 'Success' ? 'tag green' : 'tag red'">{{ e.result }}</span></dd>
          <dt>Integrity hash</dt><dd class="mono">{{ hashOf(e) }}</dd>
        </dl>
        <h4>Other activity by {{ e.user }}</h4>
        <ul class="oa">@for (o of related(e); track o.id) {<li (click)="selId.set(o.id)"><span class="dot" [style.background]="color(o.action)"></span><div><b>{{ o.action }} · {{ o.target }}</b><small>{{ o.at.replace('T', ' ') }}</small></div></li>}</ul>
        @if (reportOf(e); as r) {<button class="btn-primary" (click)="openReport(r)"><app-icon name="file-text" [size]="15" />Open report</button>}
      </aside>
    }
  `,
  styles: `
    .at { display: grid; grid-template-columns: 1.6fr 1fr 0.9fr; gap: 12px; margin-bottom: 12px; } .muted { color: var(--muted); font-size: 12px; }
    .btn-ghost.on { background: var(--primary-soft); color: var(--primary); }
    .tu { list-style: none; margin: 0; padding: 0; } .tu li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid var(--kl-f0f1f6); }
    .ab { display: inline-block; color: var(--kf-ffffff); border-radius: 6px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 12.5px; margin: 14px 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; overflow-wrap: anywhere; } .mono { font-family: monospace; font-size: 11px; }
    h4 { margin: 14px 0 8px; font-size: 13px; }
    .oa { list-style: none; padding: 0; margin: 0 0 14px; } .oa li { display: grid; grid-template-columns: 10px 1fr; gap: 10px; align-items: center; padding: 6px 0; cursor: pointer; font-size: 12px; border-bottom: 1px solid var(--kl-f0f1f6); }
    .oa div { display: flex; flex-direction: column; } .oa small { color: var(--muted); } .dot { width: 8px; height: 8px; border-radius: 50%; }
    @media (max-width: 1300px) { .at { grid-template-columns: 1fr 1fr; } }
  `,
})
export class ReportAuditTrail {
  protected readonly store = inject(ReportsStore);
  private readonly state = inject(AppState);
  private readonly router = inject(Router);
  protected readonly fmt = fmtNum;
  protected readonly selId = signal<number | null>(null);
  protected readonly paused = signal(false);
  private simId = 200000;
  protected readonly cols: Col[] = [
    { key: 'when', label: 'Time' },
    { key: 'user', label: 'User', kind: 'person' },
    { key: 'action', label: 'Action', kind: 'tag', tag: (r) => this.tagOf(r.action) },
    { key: 'target', label: 'Report / Object' },
    { key: 'detail', label: 'Detail' },
    { key: 'channel', label: 'Channel' },
    { key: 'ip', label: 'IP' },
    { key: 'result', label: 'Result', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'action', label: 'Action', options: Object.keys(ACTION_COLOR) },
    { key: 'result', label: 'Result', options: ['Success', 'Failed', 'Denied'] },
    { key: 'channel', label: 'Channel', options: ['Web', 'Mobile', 'API', 'Scheduler'] },
  ];

  constructor() {
    // Live feed: every ~2 ticks another user does something.
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 2 || untracked(this.paused)) return;
      untracked(() => {
        const r = REPORTS[(t * 7) % REPORTS.length];
        const action = (['Run', 'View', 'Export', 'Run', 'View'] as const)[t % 5];
        const d = new Date();
        const at = `${TODAY}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const user = SIM_USERS[t % SIM_USERS.length];
        const ev: AuditEvent = { id: this.simId++, at, user, action, target: r.name, detail: action === 'Export' ? 'Exported as PDF' : action === 'Run' ? 'Generated with Site=Head Office, Range=Last 30 Days' : 'Opened report preview', ip: `10.14.${t % 255}.${(t * 3) % 250}`, channel: user === 'Scheduler' ? 'Scheduler' : 'Web', result: 'Success' };
        this.store.audit.update((l) => [ev, ...l]);
      });
    });
  }

  protected readonly rows = computed(() =>
    this.store.audit().map((e) => ({ ...e, rid: '' + e.id, when: dt(e.at), initials: e.user.split(' ').map((p) => p[0]).join('').slice(0, 2), avatar: e.user === 'Scheduler' ? 'var(--ka-64748b)' : e.user === 'You' ? 'var(--ka-7c3aed)' : ['var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f97316)', 'var(--ka-ec4899)', 'var(--ka-06b6d4)'][e.user.length % 5] })),
  );
  protected readonly sel = computed(() => this.store.audit().find((e) => e.id === this.selId()) ?? null);
  protected readonly bad = computed(() => this.store.audit().filter((e) => e.result !== 'Success').length);
  protected readonly users = computed(() => [...new Set(this.store.audit().map((e) => e.user))]);
  protected readonly days = computed(() => Array.from({ length: 14 }, (_, i) => fmtDate(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)).slice(0, 6)));
  protected readonly daySeries = computed(() => {
    const groups: [string, string, string[]][] = [['Runs', 'var(--ka-7c3aed)', ['Run']], ['Views', 'var(--ka-3b82f6)', ['View']], ['Exports', 'var(--ka-ef4444)', ['Export']], ['Admin', 'var(--ka-f59e0b)', ['Share', 'Schedule', 'Edit', 'Create', 'Delete', 'Permission', 'Revoke']]];
    const iso = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
    return groups.map(([name, color, acts]) => ({ name, color, values: iso.map((d) => this.store.audit().filter((e) => e.at.startsWith(d) && acts.includes(e.action)).length) }));
  });
  protected readonly byAction = computed(() =>
    Object.entries(ACTION_COLOR)
      .map(([label, color]) => ({ label, value: this.store.audit().filter((e) => e.action === label).length, color }))
      .sort((a, b) => b.value - a.value)
      .map((r) => ({ ...r, display: fmtNum(r.value) })),
  );
  protected readonly maxAction = computed(() => Math.max(1, ...this.byAction().map((r) => r.value)));
  protected readonly topUsers = computed(() => {
    const m = new Map<string, number>();
    this.store.audit().forEach((e) => m.set(e.user, (m.get(e.user) ?? 0) + 1));
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, count], i) => ({ name, count, ini: name.split(' ').map((p) => p[0]).join('').slice(0, 2), color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f97316)', 'var(--ka-ec4899)', 'var(--ka-06b6d4)', 'var(--ka-64748b)'][i] }));
  });

  protected today(a: string) {
    return this.store.audit().filter((e) => e.action === a && e.at.startsWith(TODAY)).length;
  }
  protected color(a: string) {
    return ACTION_COLOR[a] ?? 'var(--ka-7c3aed)';
  }
  protected tagOf(a: string) {
    return a === 'Run' ? 'tag' : a === 'View' ? 'tag blue' : a === 'Export' || a === 'Delete' ? 'tag red' : a === 'Share' || a === 'Create' ? 'tag green' : a === 'Revoke' ? 'tag grey' : 'tag amber';
  }
  protected hashOf(e: AuditEvent) {
    const h = [...`${e.id}${e.at}${e.user}${e.target}`].reduce((x, c) => (x * 33 + c.charCodeAt(0)) >>> 0, 5381);
    return `sha256:${h.toString(16).padStart(8, '0')}${(h ^ 0x5bd1e995).toString(16).padStart(8, '0')}…`;
  }
  protected related(e: AuditEvent) {
    return this.store.audit().filter((x) => x.user === e.user && x.id !== e.id).slice(0, 6);
  }
  protected reportOf(e: AuditEvent) {
    return this.store.reports().find((r) => r.name === e.target) ?? null;
  }
  protected openReport(r: Report) {
    this.store.focusId.set(r.id);
    this.router.navigateByUrl('/reports-analytics/report-library');
  }
  protected exportCsv() {
    downloadCsv('report-audit-trail.csv', [['ID', 'Timestamp', 'User', 'Action', 'Target', 'Detail', 'Channel', 'IP', 'Result'], ...this.store.audit().map((e) => [e.id, e.at, e.user, e.action, e.target, e.detail, e.channel, e.ip, e.result])]);
    this.store.log('Export', 'Report Audit Trail', `Audit log exported (${this.store.audit().length} events)`);
  }
}
