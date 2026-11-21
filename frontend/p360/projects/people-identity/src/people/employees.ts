import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { PersonProfile } from './person-profile';
import { DEPTS, PEOPLE, Person, SITES } from '@p360/shared/data/people.data';

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

@Component({
  selector: 'app-employees',
  imports: [...UI, DataTable, PersonProfile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Employee Management" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Manage employee records, transfers, leave status and employment details.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Employees" [value]="fmt(emps().length)" icon="users" color="var(--ka-8b5cf6)" change="2.4%" sub="vs. last month" />
      <app-kpi label="Active" [value]="fmt(count('Active'))" icon="user-check" color="var(--ka-22c55e)" sub="currently employed" />
      <app-kpi label="On Leave" [value]="fmt(count('On Leave'))" icon="calendar-x" color="var(--ka-f59e0b)" sub="today" />
      <app-kpi label="New Joiners" value="64" icon="user-plus" color="var(--ka-3b82f6)" change="12%" sub="this month" />
      <app-kpi label="Exits" value="21" icon="door-open" color="var(--ka-ef4444)" change="4%" [up]="false" sub="this month" />
      <app-kpi label="Avg. Tenure" value="4.2 yrs" icon="clock" color="var(--ka-06b6d4)" sub="all employees" />
    </section>

    <section class="dash">
      <div class="card span-6">
        <div class="card-head"><h3>Joiners vs Leavers <span class="card-sub">last 12 months</span></h3></div>
        <app-column-chart [labels]="months" [series]="flow" [height]="220" />
      </div>
      <div class="card span-3">
        <div class="card-head"><h3>By Department</h3></div>
        <app-bar-list [rows]="byDept()" [max]="byDept()[0].value" />
      </div>
      <div class="card span-3">
        <div class="card-head"><h3>Employment Type</h3></div>
        <app-donut [segments]="byType()" center="Employees" [size]="130" />
      </div>

      <div class="card span-12">
        <div class="card-head"><h3>Employees</h3></div>
        <app-data-table
          [rows]="emps()" [columns]="cols" noun="employees" [pageSize]="10" [selectable]="true"
          [searchKeys]="['name', 'id', 'email', 'designation']" searchPlaceholder="Search name, ID, email, designation..."
          [filters]="filters" [actions]="actions" [bulkActions]="bulkActions"
          (rowClick)="open.set($event)" (action)="onAction($event.action, $event.row)" (bulk)="onBulk($event.action, $event.ids)"
        />
      </div>
    </section>

    @if (open(); as p) {
      <div class="g-overlay" (click)="open.set(null)"></div>
      <aside class="g-drawer wide"><app-person-profile [person]="p" (closed)="open.set(null)" (action)="notify($event.action + ' · ' + $event.person.name)" /></aside>
    }

    @if (transfer(); as t) {
      <div class="g-overlay" (click)="transfer.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Transfer {{ t.name }}</h3><button class="close-btn" (click)="transfer.set(null)">×</button></div>
        <div class="form-grid">
          <label>New department
            <select #d class="select" [value]="t.dept">@for (x of depts; track x) {<option [value]="x">{{ x }}</option>}</select>
          </label>
          <label>New site
            <select #s class="select" [value]="t.site">@for (x of sites; track x) {<option [value]="x">{{ x }}</option>}</select>
          </label>
          <label class="full">Effective date<input class="input" type="date" [value]="today" /></label>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="transfer.set(null)">Cancel</button>
          <button class="btn-primary" (click)="doTransfer(t, d.value, s.value)">Confirm transfer</button>
        </div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class Employees {
  private readonly state = inject(AppState);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly months = MONTHS;
  protected readonly depts = DEPTS;
  protected readonly sites = SITES;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly list = signal<Person[]>(PEOPLE.filter((p) => p.type === 'Employee'));
  protected readonly open = signal<Person | null>(null);
  protected readonly transfer = signal<Person | null>(null);
  protected readonly toast = signal<string | null>(null);

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'email' },
    { key: 'id', label: 'ID' },
    { key: 'designation', label: 'Designation' },
    { key: 'dept', label: 'Department' },
    { key: 'site', label: 'Site' },
    { key: 'joined', label: 'Joined', fmt: (v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { key: 'empType', label: 'Type' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'empType', label: 'Type', options: ['Full Time', 'Part Time'] },
    { key: 'status', label: 'Status', options: ['Active', 'On Leave', 'Inactive', 'Suspended'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View profile', icon: 'user' },
    { id: 'transfer', label: 'Transfer', icon: 'refresh' },
    { id: 'leave', label: 'Mark on leave', icon: 'calendar-x', when: (r) => r.status === 'Active' },
    { id: 'return', label: 'Mark returned', icon: 'user-check', when: (r) => r.status === 'On Leave' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, when: (r) => r.status !== 'Inactive' },
  ];
  protected readonly bulkActions: RowAction[] = [{ id: 'export', label: 'Export selected' }, { id: 'deactivate', label: 'Deactivate', danger: true }];
  protected readonly flow = [
    { name: 'Joiners', color: 'var(--ka-7c3aed)', values: [41, 58, 72, 49, 55, 61, 80, 67, 52, 58, 71, 64] },
    { name: 'Leavers', color: 'var(--ka-f87171)', values: [18, 22, 19, 25, 17, 20, 28, 23, 19, 16, 24, 21] },
  ];

  protected readonly emps = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((p) => p.site === s.name);
  });
  protected readonly byDept = computed(() => {
    const c: Record<string, number> = {};
    for (const p of this.emps()) c[p.dept] = (c[p.dept] ?? 0) + 1;
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label, value]) => ({ label, value, display: value.toLocaleString() }));
  });
  protected readonly byType = computed(() => {
    const ft = this.emps().filter((p) => p.empType === 'Full Time').length;
    return [
      { label: 'Full Time', value: ft, color: 'var(--ka-7c3aed)' },
      { label: 'Part Time', value: this.emps().length - ft, color: 'var(--ka-38bdf8)' },
    ];
  });

  protected count(s: string) {
    return this.emps().filter((p) => p.status === s).length;
  }
  protected onAction(a: string, p: Person) {
    if (a === 'view') return this.open.set(p);
    if (a === 'transfer') return this.transfer.set(p);
    const status = ({ leave: 'On Leave', return: 'Active', deactivate: 'Inactive' } as const)[a as 'leave' | 'return' | 'deactivate'];
    this.patch([p.id], { status });
    this.notify(`${p.name} → ${status}`);
  }
  protected onBulk(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.list().filter((p) => ids.includes(p.id)));
    this.patch(ids, { status: 'Inactive' });
    this.notify(`${ids.length} employees deactivated`);
  }
  protected doTransfer(p: Person, dept: string, site: string) {
    this.patch([p.id], { dept, site });
    this.transfer.set(null);
    this.notify(`${p.name} transferred to ${dept} · ${site}`);
  }
  private patch(ids: string[], change: Partial<Person>) {
    const set = new Set(ids);
    this.list.update((l) => l.map((p) => (set.has(p.id) ? { ...p, ...change } : p)));
  }
  protected exportCsv(rows = this.emps()) {
    downloadCsv('employees.csv', [['ID', 'Name', 'Email', 'Department', 'Designation', 'Site', 'Joined', 'Status'], ...rows.map((p) => [p.id, p.name, p.email, p.dept, p.designation, p.site, p.joined, p.status])]);
  }
  notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}
