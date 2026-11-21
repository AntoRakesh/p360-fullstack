import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, Filter, RowAction, statusTag } from '@p360/shared/data-table';
import { Icon } from '@p360/shared/icon';
import { SelectValue } from '@p360/shared/select-value';
import { PageHead } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { PersonProfile } from './person-profile';
import { DEPTS, PEOPLE, Person, PERSON_TYPES, PersonType, SITES, typeTag } from '@p360/shared/data/people.data';

const TAB_LABEL: Record<string, string> = { All: 'All People', Employee: 'Employees', Contractor: 'Contractors', Visitor: 'Visitors', Temporary: 'Temporary', Other: 'Others' };
const PREFIX: Record<PersonType, string> = { Employee: 'EMP', Contractor: 'CON', Visitor: 'VIS', Temporary: 'TMP', Other: 'OTH' };
const COLORS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-475569)'];

type Draft = Pick<Person, 'name' | 'email' | 'phone' | 'type' | 'dept' | 'designation' | 'site' | 'status'>;
const EMPTY: Draft = { name: '', email: '', phone: '', type: 'Employee', dept: 'IT', designation: '', site: 'Head Office', status: 'Active' };

@Component({
  selector: 'app-people-directory',
  imports: [PageHead, Icon, DataTable, PersonProfile, DecimalPipe, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="People Directory" crumb="People Directory" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Unified profiles for employees, contractors, visitors and all people.">
      <div class="split menu-wrap">
        <button class="btn-primary" (click)="openForm()"><app-icon name="user-plus" [size]="16" />Add Person</button>
        <button class="btn-primary caret" (click)="addMenu.set(!addMenu())" aria-label="Choose person type"><app-icon name="chevron-down" [size]="15" /></button>
        @if (addMenu()) {
          <div class="dropdown">
            @for (t of types; track t) {
              <button class="dd-item" (click)="openForm(t)">Add {{ t }}</button>
            }
          </div>
        }
      </div>
      <button class="btn-ghost" (click)="importOpen.set(true)"><app-icon name="download" [size]="16" class="up" />Import</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="moreMenu.set(!moreMenu())" aria-label="More">⋯</button>
        @if (moreMenu()) {
          <div class="dropdown">
            <button class="dd-item" (click)="print()"><app-icon name="file-text" [size]="15" />Print directory</button>
            <button class="dd-item" (click)="resetData()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="dir" [class.with-profile]="!!selected()">
      <div class="card list">
        <nav class="type-tabs">
          @for (t of tabs; track t) {
            <button [class.on]="tab() === t" (click)="tab.set(t)">{{ tabLabel[t] }} ({{ counts()[t] | number }})</button>
          }
        </nav>
        <app-data-table
          [rows]="rows()"
          [columns]="cols"
          [filters]="filters()"
          [searchKeys]="['name', 'id', 'email', 'phone', 'dept', 'designation']"
          searchPlaceholder="Search by name, ID, email, phone, department..."
          [actions]="rowActions"
          [bulkActions]="bulkActions"
          [selectable]="true"
          [pageSize]="12"
          [activeId]="selected()?.id ?? null"
          noun="people"
          (rowClick)="selectedId.set($event.id)"
          (action)="onAction($event.action, $event.row)"
          (bulk)="onBulk($event.action, $event.ids)"
        >
          <button class="btn-ghost" [class.on]="moreFilters()" (click)="moreFilters.set(!moreFilters())"><app-icon name="sliders" [size]="15" />More Filters</button>
        </app-data-table>
      </div>

      @if (selected(); as p) {
        <aside class="card profile">
          <app-person-profile [person]="p" (closed)="selectedId.set(null)" (edit)="openForm(undefined, $event)" (action)="onProfileAction($event.action, $event.person)" />
        </aside>
      }
    </section>

    @if (formOpen()) {
      <div class="g-overlay" (click)="formOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head">
          <h3>{{ editingId() ? 'Edit ' + draft().name : 'Add ' + draft().type }}</h3>
          <button type="button" class="close-btn" (click)="formOpen.set(false)">×</button>
        </div>
        <div class="form-grid">
          <label class="full">Full name *<input class="input" required [value]="draft().name" (input)="set('name', $any($event.target).value)" /></label>
          <label>Email *<input class="input" type="email" required [value]="draft().email" (input)="set('email', $any($event.target).value)" /></label>
          <label>Phone<input class="input" [value]="draft().phone" (input)="set('phone', $any($event.target).value)" /></label>
          <label>Person type
            <select class="select" [value]="draft().type" (change)="set('type', $any($event.target).value)" [disabled]="!!editingId()">
              @for (t of types; track t) {<option [value]="t">{{ t }}</option>}
            </select>
          </label>
          <label>Department
            <select class="select" [value]="draft().dept" (change)="set('dept', $any($event.target).value)">
              @for (d of depts; track d) {<option [value]="d">{{ d }}</option>}
            </select>
          </label>
          <label>Designation<input class="input" [value]="draft().designation" (input)="set('designation', $any($event.target).value)" /></label>
          <label>Site
            <select class="select" [value]="draft().site" (change)="set('site', $any($event.target).value)">
              @for (s of sites; track s) {<option [value]="s">{{ s }}</option>}
            </select>
          </label>
          <label>Status
            <select class="select" [value]="draft().status" (change)="set('status', $any($event.target).value)">
              @for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}
            </select>
          </label>
        </div>
        @if (formError()) {<p class="bad">{{ formError() }}</p>}
        <div class="form-actions">
          <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Cancel</button>
          <button type="submit" class="btn-primary">{{ editingId() ? 'Save changes' : 'Add person' }}</button>
        </div>
      </form>
    }

    @if (importOpen()) {
      <div class="g-overlay" (click)="closeImport()"></div>
      <div class="g-modal">
        <div class="modal-head">
          <h3>Import People</h3>
          <button class="close-btn" (click)="closeImport()">×</button>
        </div>
        <p class="muted">CSV columns: <code>name, email, type, department, site</code>. The first row is treated as a header.</p>
        <div class="toolbar">
          <label class="btn-outline"><app-icon name="download" [size]="15" />Choose CSV file<input type="file" accept=".csv,text/csv" hidden (change)="readFile($event)" /></label>
          <button class="btn-ghost" (click)="loadSample()">Use sample data (5 people)</button>
        </div>
        @if (importRows().length) {
          <div class="table-wrap preview">
            <table class="table">
              <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Department</th><th>Site</th><th>Check</th></tr></thead>
              <tbody>
                @for (r of importRows(); track $index) {
                  <tr><td>{{ r.name }}</td><td>{{ r.email }}</td><td>{{ r.type }}</td><td>{{ r.dept }}</td><td>{{ r.site }}</td>
                    <td><span [class]="r.ok ? 'tag green' : 'tag red'">{{ r.ok ? 'OK' : 'Missing name/email' }}</span></td></tr>
                }
              </tbody>
            </table>
          </div>
        }
        <div class="form-actions">
          <button class="btn-ghost" (click)="closeImport()">Cancel</button>
          <button class="btn-primary" [disabled]="!validImports()" (click)="doImport()">Import {{ validImports() }} people</button>
        </div>
      </div>
    }

    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .dir { display: grid; grid-template-columns: 1fr; gap: 14px; align-items: start; }
    .dir.with-profile { grid-template-columns: minmax(0, 1.5fr) minmax(390px, 1fr); }
    .list ::ng-deep .dt-person small { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .profile { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
    .type-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; margin-bottom: 14px; border-radius: 8px; background: var(--kb-f6f6fa); }
    .type-tabs button { border: 0; background: none; padding: 7px 9px; border-radius: 6px; font-size: 12px; color: var(--kf-4b4f6b); cursor: pointer; }
    .type-tabs button.on { background: var(--kb-ffffff); color: var(--primary); font-weight: 600; box-shadow: inset 0 -2px 0 var(--primary); }
    .split { display: flex; }
    .split .btn-primary:first-child { border-radius: 8px 0 0 8px; }
    .caret { border-radius: 0 8px 8px 0 !important; padding: 8px 9px !important; border-left: 1px solid rgba(255,255,255,0.3) !important; }
    .up { transform: rotate(180deg); }
    .btn-ghost.on { background: var(--primary-soft); color: var(--primary); }
    .preview { max-height: 260px; margin-top: 12px; }
    code { background: var(--kb-f3f3f8); padding: 1px 5px; border-radius: 4px; }
    @media (max-width: 1250px) { .dir.with-profile { grid-template-columns: 1fr; } .profile { position: static; max-height: none; } }
  `,
})
export class PeopleDirectory {
  private readonly state = inject(AppState);
  protected readonly types = PERSON_TYPES;
  protected readonly depts = DEPTS;
  protected readonly sites = SITES;
  protected readonly statuses = ['Active', 'On Leave', 'Inactive', 'Suspended'];
  protected readonly tabs = ['All', ...PERSON_TYPES];
  protected readonly tabLabel = TAB_LABEL;

  protected readonly people = signal<Person[]>(PEOPLE);
  protected readonly tab = signal('All');
  protected readonly selectedId = signal<string | null>('EMP-00123');
  protected readonly moreFilters = signal(false);
  protected readonly addMenu = signal(false);
  protected readonly moreMenu = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Name', kind: 'person', sub: 'email' },
    { key: 'type', label: 'Person Type', kind: 'tag', tag: (r) => typeTag(r.type) },
    { key: 'id', label: 'Employee ID' },
    { key: 'dept', label: 'Department' },
    { key: 'site', label: 'Site' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly rowActions: RowAction[] = [
    { id: 'view', label: 'View profile', icon: 'user' },
    { id: 'edit', label: 'Edit', icon: 'sliders' },
    { id: 'activate', label: 'Activate', icon: 'shield-check', when: (r) => r.status !== 'Active' },
    { id: 'deactivate', label: 'Deactivate', icon: 'ban', danger: true, when: (r) => r.status === 'Active' },
  ];
  protected readonly bulkActions: RowAction[] = [
    { id: 'activate', label: 'Activate' },
    { id: 'deactivate', label: 'Deactivate', danger: true },
    { id: 'export', label: 'Export selected' },
  ];

  /** Rows for the current tab, limited to the site chosen in the top bar. */
  private readonly inSite = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.people() : this.people().filter((p) => p.site === s.name);
  });
  protected readonly counts = computed(() => {
    const c: Record<string, number> = { All: this.inSite().length };
    for (const p of this.inSite()) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  });
  protected readonly rows = computed(() => (this.tab() === 'All' ? this.inSite() : this.inSite().filter((p) => p.type === this.tab())));
  protected readonly filters = computed<Filter[]>(() => [
    { key: 'type', label: 'Person Type', options: PERSON_TYPES },
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'status', label: 'Status', options: this.statuses },
    ...(this.moreFilters()
      ? [
          { key: 'empType', label: 'Employment Type', options: ['Full Time', 'Part Time', 'Contract', 'Agency'] },
          { key: 'company', label: 'Company', options: [...new Set(this.people().slice(0, 3000).map((p) => p.company))] },
        ]
      : []),
  ]);
  protected readonly selected = computed(() => this.people().find((p) => p.id === this.selectedId()) ?? null);

  // ---------- Add / edit ----------
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal<Draft>(EMPTY);
  protected readonly formError = signal('');

  protected openForm(type?: PersonType, person?: Person) {
    this.addMenu.set(false);
    this.formError.set('');
    this.editingId.set(person?.id ?? null);
    this.draft.set(person ? { ...person } : { ...EMPTY, type: type ?? 'Employee', dept: type === 'Visitor' ? '—' : 'IT' });
    this.formOpen.set(true);
  }
  protected set<K extends keyof Draft>(k: K, v: Draft[K]) {
    this.draft.update((d) => ({ ...d, [k]: v }));
  }
  protected save() {
    const d = this.draft();
    if (!d.name.trim() || !d.email.trim()) return this.formError.set('Name and email are required.');
    if (this.editingId()) {
      this.update([this.editingId()!], (p) => ({ ...p, ...d, designation: d.designation || p.designation }));
      this.notify(`${d.name} updated`);
    } else {
      const p = this.newPerson(d);
      this.people.update((list) => [p, ...list]);
      this.tab.set('All');
      this.selectedId.set(p.id);
      this.notify(`${p.name} added as ${p.id}`);
    }
    this.formOpen.set(false);
  }
  private newPerson(d: Draft): Person {
    const prefix = PREFIX[d.type];
    const max = Math.max(...this.people().filter((p) => p.id.startsWith(prefix)).map((p) => +p.id.slice(4)));
    const base = this.people()[0];
    return {
      ...base,
      ...d,
      id: `${prefix}-${String(max + 1).padStart(5, '0')}`,
      designation: d.designation || (d.type === 'Visitor' ? 'Guest' : 'Associate'),
      city: 'Dubai, UAE',
      joined: new Date().toISOString().slice(0, 10),
      empType: d.type === 'Employee' ? 'Full Time' : d.type === 'Temporary' ? 'Agency' : 'Contract',
      card: `AC-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`,
      face: false,
      finger: false,
      mobileCred: false,
      completion: 40,
      initials: d.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(),
      avatar: COLORS[d.name.length % COLORS.length],
    };
  }

  // ---------- Row / bulk / profile actions ----------
  protected onAction(action: string, row: Person) {
    if (action === 'view') this.selectedId.set(row.id);
    else if (action === 'edit') this.openForm(undefined, row);
    else this.onProfileAction(action, row);
  }
  protected onBulk(action: string, ids: string[]) {
    if (action === 'export') return this.exportCsv(this.people().filter((p) => ids.includes(p.id)));
    this.update(ids, (p) => ({ ...p, status: action === 'activate' ? 'Active' : 'Inactive' }));
    this.notify(`${ids.length} people ${action === 'activate' ? 'activated' : 'deactivated'}`);
  }
  protected onProfileAction(action: string, p: Person) {
    const msgs: Record<string, string> = {
      'print-badge': `Badge for ${p.name} sent to printer`,
      'reset-password': `Password reset link sent to ${p.email}`,
      'assign-training': `Training assignment opened for ${p.name}`,
      more: 'More actions coming soon',
    };
    if (action === 'activate' || action === 'deactivate') {
      this.update([p.id], (x) => ({ ...x, status: action === 'activate' ? 'Active' : 'Inactive' }));
      this.notify(`${p.name} ${action}d`);
    } else if (msgs[action]) this.notify(msgs[action]);
    else if (action.startsWith('download-')) this.notify(`${action.slice(9)} preview opened`);
  }
  private update(ids: string[], fn: (p: Person) => Person) {
    const set = new Set(ids);
    this.people.update((list) => list.map((p) => (set.has(p.id) ? fn(p) : p)));
  }

  // ---------- Import / export ----------
  protected readonly importOpen = signal(false);
  protected readonly importRows = signal<(Draft & { ok: boolean })[]>([]);
  protected readonly validImports = computed(() => this.importRows().filter((r) => r.ok).length);

  protected readFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.parseCsv(String(reader.result));
    reader.readAsText(file);
  }
  protected loadSample() {
    this.parseCsv(
      'name,email,type,department,site\nNoor Al Hashimi,noor.h@company.com,Employee,Finance,Head Office\nJacob Thomas,jacob.t@vendor.com,Contractor,Facility Maintenance,Manufacturing\nElena Petrova,elena.p@visitor.com,Visitor,—,Head Office\nSamir Qureshi,samir.q@agency.com,Temporary,Support,Data Center\n,missing.name@company.com,Employee,IT,Head Office',
    );
  }
  private parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.slice(1).map((l) => {
      const [name = '', email = '', type = 'Employee', dept = 'IT', site = 'Head Office'] = l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      const t = (PERSON_TYPES as string[]).includes(type) ? (type as PersonType) : 'Employee';
      return { ...EMPTY, name, email, type: t, dept, site, ok: !!name && !!email };
    });
    this.importRows.set(rows);
  }
  protected doImport() {
    const added: Person[] = [];
    for (const r of this.importRows().filter((x) => x.ok)) {
      const p = this.newPerson(r);
      this.people.update((list) => [p, ...list]);
      added.push(p);
    }
    this.notify(`${added.length} people imported`);
    this.closeImport();
  }
  protected closeImport() {
    this.importOpen.set(false);
    this.importRows.set([]);
  }
  protected exportCsv(list: Person[] = this.rows()) {
    downloadCsv(`people-${this.tab().toLowerCase()}.csv`, [
      ['ID', 'Name', 'Email', 'Phone', 'Type', 'Department', 'Designation', 'Site', 'Status'],
      ...list.map((p) => [p.id, p.name, p.email, p.phone, p.type, p.dept, p.designation, p.site, p.status]),
    ]);
    this.notify(`Exported ${list.length.toLocaleString()} people`);
  }
  protected print() {
    this.moreMenu.set(false);
    window.print();
  }
  protected resetData() {
    this.moreMenu.set(false);
    this.people.set(PEOPLE);
    this.notify('Demo data reset');
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
  protected readonly statusTag = statusTag;
}
