import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { PEOPLE, Person } from './people.data';

const TARGET_FIELDS = ['Full name', 'Email', 'Phone', 'Person type', 'Department', 'Site', 'Designation', '— Ignore —'];
const EXPORT_FIELDS: [keyof Person, string][] = [
  ['id', 'Person ID'], ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['type', 'Person type'], ['dept', 'Department'],
  ['designation', 'Designation'], ['site', 'Site'], ['status', 'Status'], ['manager', 'Manager'], ['joined', 'Joined'], ['card', 'Card number'],
];
const SAMPLE = `Name,Email Address,Mobile,Category,Dept,Location
Noor Al Hashimi,noor.h@company.com,+971 50 111 2233,Employee,Finance,Head Office
Jacob Thomas,jacob.t@vendor.com,+971 52 444 1188,Contractor,Facility Maintenance,Manufacturing
Elena Petrova,elena.p@visitor.com,,Visitor,,Head Office
Samir Qureshi,samir.q@agency.com,+971 55 909 1000,Temporary,Support,Data Center
Arjun Mehta,arjun.mehta@company.com,+971 50 123 4567,Employee,IT,Head Office
,missing.name@company.com,+971 56 000 0000,Employee,IT,Head Office
Rita Gomez,rita.gomez@company,+971 50 777 6655,Employee,HR,Regional Office`;

interface Job {
  id: string;
  kind: 'Import' | 'Export';
  entity: string;
  file: string;
  rows: number;
  ok: number;
  errors: number;
  by: string;
  when: string;
  status: string;
}

@Component({
  selector: 'app-bulk-import-export',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Bulk Import / Export" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Load people from CSV with field mapping and validation, or export filtered data." />

    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Import People</h3><span class="muted">Step {{ step() }} of 4</span></div>
        <ol class="wizard">
          @for (s of stepNames; track s; let i = $index) {
            <li [class.on]="step() === i + 1" [class.done]="step() > i + 1"><span>{{ step() > i + 1 ? '✓' : i + 1 }}</span>{{ s }}</li>
          }
        </ol>

        @switch (step()) {
          @case (1) {
            <div class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)">
              <app-icon name="download" [size]="30" />
              <b>Drag a CSV file here</b>
              <span class="muted">or</span>
              <div class="toolbar">
                <label class="btn-outline">Browse file<input type="file" accept=".csv,text/csv" hidden (change)="pick($event)" /></label>
                <button class="btn-ghost" (click)="load('people_sample.csv', sample)">Use sample file</button>
                <button class="link" (click)="downloadTemplate()">Download template</button>
              </div>
            </div>
            <label class="opt">Import into
              <select class="select" [value]="entity()" (change)="entity.set($any($event.target).value)">
                <option>People</option><option>Contractor workers</option><option>Visitor pre-registrations</option><option>Zone assignments</option>
              </select>
            </label>
          }
          @case (2) {
            <p class="muted">File <b>{{ fileName() }}</b> · {{ raw().length }} rows. Match each column to a People360 field.</p>
            <table class="table">
              <thead><tr><th>CSV column</th><th>Sample value</th><th>Maps to</th></tr></thead>
              <tbody>
                @for (h of headers(); track h; let i = $index) {
                  <tr>
                    <td><b>{{ h }}</b></td>
                    <td class="muted">{{ raw()[0]?.[i] }}</td>
                    <td>
                      <select class="select" [value]="mapping()[i]" (change)="setMap(i, $any($event.target).value)">
                        @for (f of targets; track f) {<option [value]="f">{{ f }}</option>}
                      </select>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="form-actions">
              <button class="btn-ghost" (click)="reset()">Back</button>
              <button class="btn-primary" [disabled]="!mapped()" (click)="step.set(3)">Validate</button>
            </div>
            @if (!mapped()) {<p class="bad">Map at least “Full name” and “Email”.</p>}
          }
          @case (3) {
            <div class="summary">
              <span class="tag green">{{ valid().length }} ready</span>
              <span class="tag amber">{{ dupes() }} already exist (will update)</span>
              <span class="tag red">{{ invalid().length }} with errors (skipped)</span>
            </div>
            <div class="table-wrap prev">
              <table class="table">
                <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Type</th><th>Site</th><th>Result</th></tr></thead>
                <tbody>
                  @for (r of parsed(); track $index) {
                    <tr [class.err]="r.error">
                      <td>{{ $index + 2 }}</td><td>{{ r.name || '—' }}</td><td>{{ r.email }}</td><td>{{ r.type }}</td><td>{{ r.site }}</td>
                      <td>@if (r.error) {<span class="tag red">{{ r.error }}</span>} @else if (r.exists) {<span class="tag amber">Update</span>} @else {<span class="tag green">New</span>}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="form-actions">
              <button class="btn-ghost" (click)="step.set(2)">Back</button>
              <button class="btn-primary" [disabled]="!valid().length" (click)="run()">Import {{ valid().length }} rows</button>
            </div>
          }
          @case (4) {
            <div class="result">
              <div class="bar"><i [style.width.%]="progress()"></i></div>
              @if (progress() < 100) {
                <p>Importing… {{ progress() }}%</p>
              } @else {
                <app-icon name="shield-check" [size]="34" />
                <h3>Import complete</h3>
                <p class="muted">{{ valid().length - dupes() }} created · {{ dupes() }} updated · {{ invalid().length }} skipped</p>
                <div class="toolbar center">
                  <button class="btn-ghost" (click)="errorReport()" [disabled]="!invalid().length">Download error report</button>
                  <button class="btn-primary" (click)="reset()">Import another file</button>
                </div>
              }
            </div>
          }
        }
      </div>

      <div class="card span-5">
        <div class="card-head"><h3>Export People</h3></div>
        <div class="form-grid">
          <label>Person type
            <select class="select" [value]="exType()" (change)="exType.set($any($event.target).value)">
              <option>All</option><option>Employee</option><option>Contractor</option><option>Visitor</option><option>Temporary</option><option>Other</option>
            </select>
          </label>
          <label>Status
            <select class="select" [value]="exStatus()" (change)="exStatus.set($any($event.target).value)">
              <option>All</option><option>Active</option><option>On Leave</option><option>Inactive</option><option>Suspended</option>
            </select>
          </label>
        </div>
        <p class="lbl">Fields</p>
        <div class="fields">
          @for (f of exportFields; track f[0]) {
            <label><input type="checkbox" [checked]="exCols().has(f[0])" (change)="toggleCol(f[0])" />{{ f[1] }}</label>
          }
        </div>
        <div class="ex-foot">
          <span class="muted">{{ exRows().length.toLocaleString() }} rows × {{ exCols().size }} fields</span>
          <button class="btn-primary" [disabled]="!exCols().size" (click)="exportNow()"><app-icon name="download" [size]="16" />Export CSV</button>
        </div>
      </div>

      <div class="card span-12">
        <div class="card-head"><h3>Job History</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Job</th><th>Type</th><th>Entity</th><th>File</th><th class="num">Rows</th><th class="num">Succeeded</th><th class="num">Errors</th><th>By</th><th>When</th><th>Status</th></tr></thead>
            <tbody>
              @for (j of jobs(); track j.id) {
                <tr>
                  <td>{{ j.id }}</td><td><span class="tag" [class.blue]="j.kind === 'Export'">{{ j.kind }}</span></td><td>{{ j.entity }}</td><td>{{ j.file }}</td>
                  <td class="num">{{ j.rows.toLocaleString() }}</td><td class="num">{{ j.ok.toLocaleString() }}</td><td class="num" [class.bad]="j.errors">{{ j.errors }}</td>
                  <td>{{ j.by }}</td><td>{{ j.when }}</td><td><span class="tag" [class.green]="j.status === 'Completed'" [class.amber]="j.status !== 'Completed'">{{ j.status }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
  styles: `
    .wizard { display: flex; gap: 6px; list-style: none; padding: 0; margin: 0 0 16px; flex-wrap: wrap; }
    .wizard li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); flex: 1; min-width: 120px; padding-bottom: 8px; border-bottom: 3px solid var(--kl-eef0f6); }
    .wizard li span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-eef0f6); font-size: 11px; font-weight: 600; }
    .wizard li.on { color: var(--primary); border-color: var(--primary); font-weight: 600; } .wizard li.on span { background: var(--primary); color: var(--kf-ffffff); }
    .wizard li.done { color: var(--kf-16a34a); border-color: var(--kl-22c55e); } .wizard li.done span { background: var(--kb-22c55e); color: var(--kf-ffffff); }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 16px; border: 2px dashed var(--kl-c4b5fd); border-radius: 12px; background: var(--kb-faf8ff); color: var(--primary); }
    .drop.over { background: var(--primary-soft); }
    .opt { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 12.5px; }
    .summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .prev { max-height: 300px; } tr.err td { background: var(--kb-fff5f5); }
    .result { text-align: center; padding: 20px 0; color: var(--kf-16a34a); } .result h3 { color: var(--text); margin: 6px 0; }
    .bar { height: 10px; border-radius: 5px; background: var(--kb-eef0f6); overflow: hidden; margin-bottom: 14px; } .bar i { display: block; height: 100%; background: var(--primary); transition: width .3s; }
    .center { justify-content: center; }
    .lbl { font-size: 12px; color: var(--kf-4b4f6b); margin: 14px 0 6px; }
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12.5px; } .fields label { display: flex; gap: 6px; align-items: center; }
    .ex-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
  `,
})
export class BulkImportExport {
  private readonly destroy = inject(DestroyRef);
  protected readonly sample = SAMPLE;
  protected readonly targets = TARGET_FIELDS;
  protected readonly exportFields = EXPORT_FIELDS;
  protected readonly stepNames = ['Upload', 'Map fields', 'Validate', 'Import'];
  protected readonly step = signal(1);
  protected readonly over = signal(false);
  protected readonly entity = signal('People');
  protected readonly fileName = signal('');
  protected readonly headers = signal<string[]>([]);
  protected readonly raw = signal<string[][]>([]);
  protected readonly mapping = signal<string[]>([]);
  protected readonly progress = signal(0);

  protected readonly exType = signal('All');
  protected readonly exStatus = signal('All');
  protected readonly exCols = signal<Set<keyof Person>>(new Set(['id', 'name', 'email', 'type', 'dept', 'site', 'status']));
  protected readonly jobs = signal<Job[]>([
    { id: 'JOB-1042', kind: 'Import', entity: 'People', file: 'new_joiners_nov.csv', rows: 64, ok: 62, errors: 2, by: 'Priya Sharma', when: '03 Nov 2026, 10:12', status: 'Completed' },
    { id: 'JOB-1041', kind: 'Export', entity: 'Contractor workers', file: 'contractors_active.csv', rows: 1326, ok: 1326, errors: 0, by: 'Security Desk', when: '01 Nov 2026, 17:40', status: 'Completed' },
    { id: 'JOB-1039', kind: 'Import', entity: 'Zone assignments', file: 'dc_access_q4.csv', rows: 218, ok: 205, errors: 13, by: 'Omar Khalid', when: '28 Oct 2026, 09:05', status: 'Completed with errors' },
    { id: 'JOB-1036', kind: 'Import', entity: 'Visitor pre-registrations', file: 'expo_guests.csv', rows: 540, ok: 540, errors: 0, by: 'Reception', when: '21 Oct 2026, 14:22', status: 'Completed' },
  ]);

  private readonly emails = new Set(PEOPLE.slice(0, 20).map((p) => p.email));
  protected readonly mapped = computed(() => this.mapping().includes('Full name') && this.mapping().includes('Email'));
  protected readonly parsed = computed(() => {
    const m = this.mapping();
    const get = (row: string[], f: string) => (m.indexOf(f) >= 0 ? (row[m.indexOf(f)] ?? '').trim() : '');
    return this.raw().map((row) => {
      const name = get(row, 'Full name');
      const email = get(row, 'Email');
      const error = !name ? 'Missing name' : !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) ? 'Invalid email' : '';
      return { name, email, type: get(row, 'Person type') || 'Employee', site: get(row, 'Site') || 'Head Office', error, exists: this.emails.has(email) };
    });
  });
  protected readonly valid = computed(() => this.parsed().filter((r) => !r.error));
  protected readonly invalid = computed(() => this.parsed().filter((r) => r.error));
  protected readonly dupes = computed(() => this.valid().filter((r) => r.exists).length);
  protected readonly exRows = computed(() => PEOPLE.filter((p) => (this.exType() === 'All' || p.type === this.exType()) && (this.exStatus() === 'All' || p.status === this.exStatus())));

  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.readFile(f);
  }
  protected drop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.readFile(f);
  }
  private readFile(f: File) {
    const r = new FileReader();
    r.onload = () => this.load(f.name, String(r.result));
    r.readAsText(f);
  }
  /** Parses CSV text and guesses the column mapping from header names. */
  protected load(name: string, text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const split = (l: string) => l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
    const headers = split(lines[0] ?? '');
    const guess = (h: string) => {
      const x = h.toLowerCase();
      if (/name/.test(x)) return 'Full name';
      if (/mail/.test(x)) return 'Email';
      if (/phone|mobile/.test(x)) return 'Phone';
      if (/type|category/.test(x)) return 'Person type';
      if (/dep/.test(x)) return 'Department';
      if (/site|location/.test(x)) return 'Site';
      if (/title|designation|role/.test(x)) return 'Designation';
      return '— Ignore —';
    };
    this.fileName.set(name);
    this.headers.set(headers);
    this.mapping.set(headers.map(guess));
    this.raw.set(lines.slice(1).map(split));
    this.step.set(2);
  }
  protected setMap(i: number, v: string) {
    this.mapping.update((m) => m.map((x, j) => (j === i ? v : x)));
  }
  protected run() {
    this.step.set(4);
    this.progress.set(0);
    const id = setInterval(() => {
      this.progress.update((p) => Math.min(100, p + 20));
      if (this.progress() >= 100) {
        clearInterval(id);
        this.jobs.update((j) => [
          { id: `JOB-${1043 + j.length - 4}`, kind: 'Import', entity: this.entity(), file: this.fileName(), rows: this.parsed().length, ok: this.valid().length, errors: this.invalid().length, by: 'Demo login', when: 'Just now', status: this.invalid().length ? 'Completed with errors' : 'Completed' },
          ...j,
        ]);
      }
    }, 350);
    this.destroy.onDestroy(() => clearInterval(id));
  }
  protected reset() {
    this.step.set(1);
    this.raw.set([]);
    this.headers.set([]);
  }
  protected errorReport() {
    downloadCsv('import-errors.csv', [['Row', 'Name', 'Email', 'Error'], ...this.parsed().map((r, i) => [i + 2, r.name, r.email, r.error]).filter((r) => r[3])]);
  }
  protected downloadTemplate() {
    downloadCsv('people-import-template.csv', [['Name', 'Email', 'Phone', 'Person type', 'Department', 'Site', 'Designation']]);
  }
  protected toggleCol(k: keyof Person) {
    this.exCols.update((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  protected exportNow() {
    const cols = EXPORT_FIELDS.filter(([k]) => this.exCols().has(k));
    const rows = this.exRows();
    downloadCsv(`people-export-${this.exType().toLowerCase()}.csv`, [cols.map((c) => c[1]), ...rows.map((p) => cols.map(([k]) => String(p[k])))]);
    this.jobs.update((j) => [
      { id: `JOB-${1043 + j.length - 4}`, kind: 'Export', entity: 'People', file: `people-export-${this.exType().toLowerCase()}.csv`, rows: rows.length, ok: rows.length, errors: 0, by: 'Demo login', when: 'Just now', status: 'Completed' },
      ...j,
    ]);
  }
}
