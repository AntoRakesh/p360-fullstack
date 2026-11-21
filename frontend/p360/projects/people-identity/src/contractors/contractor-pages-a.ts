import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv, rng } from '@p360/shared/data/demo-data';
import { ALL_SITES, COMPANIES, DOC_TYPES, fmtDate, Worker, WORKERS } from './contractors.data';

const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const days = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86400000);
const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2200);
};
const companyNames = COMPANIES.map((c) => c.name);

/* ======================= Contractor Employees ======================= */
@Component({
  selector: 'app-contractor-employees',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contractor Employees" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Every contractor worker, their company, site, induction and permit status.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Contractor Workers" [value]="list().length.toLocaleString()" icon="hard-hat" color="var(--ka-fb923c)" change="6%" />
      <app-kpi label="On Site Now" [value]="cnt('onSite').toLocaleString()" icon="map-pin" color="var(--ka-22c55e)" />
      <app-kpi label="Induction Pending" [value]="ind('Pending')" icon="graduation-cap" color="var(--ka-f59e0b)" />
      <app-kpi label="Non-compliant" [value]="comp('Non-compliant')" icon="ban" color="var(--ka-ef4444)" sub="access blocked" />
      <app-kpi label="Permits Expiring (30 d)" [value]="comp('Expiring')" icon="clock" color="var(--ka-8b5cf6)" />
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="workers" [pageSize]="15"
        [searchKeys]="['name', 'id', 'company', 'trade']" searchPlaceholder="Search worker, ID, company, trade..." (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class ContractorEmployees {
  private readonly state = inject(AppState);
  protected readonly list = signal<Worker[]>(WORKERS.map((w) => ({ ...w })));
  protected readonly msg = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Worker', kind: 'person', sub: 'id' },
    { key: 'company', label: 'Company' },
    { key: 'trade', label: 'Trade' },
    { key: 'site', label: 'Site' },
    { key: 'induction', label: 'Induction', kind: 'tag', tag: (r) => (r.induction === 'Completed' ? 'tag green' : r.induction === 'Pending' ? 'tag amber' : 'tag red') },
    { key: 'permitExpiry', label: 'Permit Expiry', fmt: fmtDate },
    { key: 'compliance', label: 'Compliance', kind: 'status' },
    { key: 'onSite', label: 'On site', kind: 'bool' },
    { key: 'status', label: 'Access', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'company', label: 'Company', options: companyNames.slice(0, 20) },
    { key: 'site', label: 'Site', options: ALL_SITES },
    { key: 'compliance', label: 'Compliance', options: ['Compliant', 'Expiring', 'Non-compliant'] },
    { key: 'induction', label: 'Induction', options: ['Completed', 'Pending', 'Expired'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'renew', label: 'Renew permit (1 yr)', icon: 'refresh', when: (r) => r.compliance !== 'Compliant' },
    { id: 'induct', label: 'Mark induction complete', icon: 'graduation-cap', when: (r) => r.induction !== 'Completed' },
    { id: 'suspend', label: 'Suspend access', icon: 'ban', danger: true, when: (r) => r.status === 'Active' },
    { id: 'restore', label: 'Restore access', icon: 'shield-check', when: (r) => r.status !== 'Active' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'renew', label: 'Renew permits' }, { id: 'induct', label: 'Mark inducted' }, { id: 'suspend', label: 'Suspend', danger: true }];
  protected readonly rows = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((w) => w.site === s.name);
  });
  protected cnt(k: 'onSite') {
    return this.rows().filter((w) => w[k]).length;
  }
  protected ind(v: string) {
    return this.rows().filter((w) => w.induction === v).length;
  }
  protected comp(v: string) {
    return this.rows().filter((w) => w.compliance === v).length;
  }
  protected act(a: string, ids: string[]) {
    const set = new Set(ids);
    this.list.update((l) =>
      l.map((w) => {
        if (!set.has(w.id)) return w;
        if (a === 'renew') return { ...w, permitExpiry: iso(365), compliance: w.induction === 'Expired' ? 'Non-compliant' : 'Compliant' };
        if (a === 'induct') return { ...w, induction: 'Completed', compliance: days(w.permitExpiry) > 30 ? 'Compliant' : w.compliance };
        return { ...w, status: a === 'suspend' ? 'Suspended' : 'Active', onSite: a === 'suspend' ? false : w.onSite };
      }),
    );
    toast(this.msg, `${ids.length} worker(s) updated`);
  }
  protected exportCsv() {
    downloadCsv('contractor-workers.csv', [['ID', 'Name', 'Company', 'Trade', 'Site', 'Induction', 'Permit expiry', 'Compliance', 'Status'], ...this.rows().map((w) => [w.id, w.name, w.company, w.trade, w.site, w.induction, w.permitExpiry, w.compliance, w.status])]);
  }
}

/* ======================= Contract Management ======================= */
interface Contract {
  id: string;
  company: string;
  title: string;
  type: string;
  value: number;
  start: string;
  end: string;
  left: number;
  sla: number;
  owner: string;
  status: string;
}

@Component({
  selector: 'app-contract-management',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contract Management" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Contracts, values, SLAs and renewals for every contractor company." />
    <section class="kpi-row">
      <app-kpi label="Active Contracts" [value]="cnt('Active')" icon="file-text" color="var(--ka-8b5cf6)" />
      <app-kpi label="Total Value" [value]="'AED ' + total()" icon="trending-up" color="var(--ka-22c55e)" />
      <app-kpi label="Expiring in 90 days" [value]="expiring()" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Avg. SLA Achievement" [value]="avgSla() + '%'" icon="activity" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Renewal Pipeline</h3><span class="muted">contracts ending per quarter</span></div>
        <app-column-chart [labels]="quarters" [series]="pipeline()" [height]="200" [legend]="false" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>By Contract Type</h3></div>
        <app-donut [segments]="byType()" center="Contracts" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" [actions]="actions" noun="contracts" [searchKeys]="['id', 'company', 'title']" (action)="act($event.action, $event.row)" />
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
})
export class ContractManagement {
  protected readonly quarters = ['Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027', 'Q1 2028'];
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<Contract[]>(
    COMPANIES.flatMap((c, i) => {
      const base: Contract = { id: `${c.code}-MSA`, company: c.name, title: `${c.trade} master agreement`, type: c.contractType, value: c.value, start: c.start, end: c.end, left: days(c.end), sla: c.status === 'Inactive' ? 0 : 85 + (i % 14), owner: ['Procurement', 'Facilities', 'IT', 'Operations'][i % 4], status: '' };
      const out = [base];
      if (i % 3 === 0) out.push({ ...base, id: `${c.code}-PO26`, title: `${c.trade} purchase order 2026`, value: Math.round(c.value * 0.3), start: '2026-01-01', end: '2026-12-31', left: days('2026-12-31') });
      return out;
    }).map((k) => ({ ...k, status: k.left < 0 ? 'Expired' : k.left <= 90 ? 'Expiring' : 'Active' })),
  );
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Contract' },
    { key: 'company', label: 'Company', sub: 'title' },
    { key: 'type', label: 'Type' },
    { key: 'value', label: 'Value (AED)', kind: 'num' },
    { key: 'start', label: 'Start', fmt: fmtDate },
    { key: 'end', label: 'End', fmt: fmtDate },
    { key: 'left', label: 'Days left', kind: 'num' },
    { key: 'sla', label: 'SLA', kind: 'progress' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Active', 'Expiring', 'Expired', 'Terminated'] }, { key: 'type', label: 'Type', options: ['Annual', 'Multi-Year', 'Project Based', 'Call-off'] }, { key: 'owner', label: 'Owner', options: ['Procurement', 'Facilities', 'IT', 'Operations'] }];
  protected readonly actions: RowAction[] = [
    { id: 'renew', label: 'Renew 1 year', icon: 'refresh', when: (r) => r.status !== 'Terminated' },
    { id: 'terminate', label: 'Terminate', icon: 'ban', danger: true, when: (r) => r.status !== 'Terminated' },
  ];
  protected readonly total = computed(() => `${(this.list().filter((c) => c.status !== 'Expired').reduce((a, c) => a + c.value, 0) / 1e6).toFixed(1)}M`);
  protected readonly expiring = computed(() => this.cnt('Expiring'));
  protected readonly avgSla = computed(() => Math.round(this.list().filter((c) => c.sla).reduce((a, c) => a + c.sla, 0) / this.list().filter((c) => c.sla).length));
  protected readonly pipeline = computed(() => [{ name: 'Contracts ending', color: 'var(--ka-8b5cf6)', values: this.quarters.map((_, q) => this.list().filter((c) => c.left >= q * 91 && c.left < (q + 1) * 91).length) }]);
  protected readonly byType = computed(() => ['Annual', 'Multi-Year', 'Project Based', 'Call-off'].map((t, i) => ({ label: t, value: this.list().filter((c) => c.type === t).length, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-f97316)', 'var(--ka-22c55e)'][i] })));
  protected cnt(s: string) {
    return this.list().filter((c) => c.status === s).length;
  }
  protected act(a: string, c: Contract) {
    this.list.update((l) =>
      l.map((x) => {
        if (x.id !== c.id) return x;
        if (a === 'terminate') return { ...x, status: 'Terminated' };
        const end = new Date(x.end);
        end.setFullYear(end.getFullYear() + 1);
        const e = end.toISOString().slice(0, 10);
        return { ...x, end: e, left: days(e), status: days(e) <= 90 ? 'Expiring' : 'Active' };
      }),
    );
    toast(this.msg, a === 'terminate' ? `${c.id} terminated` : `${c.id} renewed`);
  }
}

/* ======================= Document & Compliance ======================= */
type DocState = 'Valid' | 'Expiring' | 'Expired' | 'Missing';

@Component({
  selector: 'app-document-compliance',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Document &amp; Compliance" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Company documents required before contractors can work on site.">
      <button class="btn-outline" (click)="remind()"><app-icon name="bell" [size]="16" />Remind companies with gaps</button>
    </app-page-head>
    <section class="kpi-row">
      @for (s of states; track s) {<app-kpi [label]="s" [value]="count(s)" [icon]="icon[s]" [color]="color[s]" sub="documents" />}
    </section>
    <div class="card">
      <div class="card-head"><h3>Compliance Matrix</h3><span class="muted">click a cell to record a new valid document</span></div>
      <div class="table-wrap">
        <table class="table mx">
          <thead><tr><th>Company</th>@for (d of docTypes; track d) {<th class="c">{{ d }}</th>}<th class="num">Score</th></tr></thead>
          <tbody>
            @for (c of companies; track c.id; let ci = $index) {
              <tr>
                <td><b>{{ c.name }}</b><div class="muted">{{ c.code }}</div></td>
                @for (d of docTypes; track d; let di = $index) {
                  @let s = cell(ci, di);
                  <td class="c"><button class="cell" [attr.data-s]="s" (click)="fix(ci, di)" [title]="d + ': ' + s">{{ s === 'Valid' ? '✓' : s === 'Expiring' ? '!' : s === 'Missing' ? '—' : '✕' }}</button></td>
                }
                <td class="num"><b [style.color]="score(ci) >= 90 ? 'var(--ka-16a34a)' : score(ci) >= 70 ? 'var(--ka-d97706)' : 'var(--ka-dc2626)'">{{ score(ci) }}%</b></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="leg">@for (s of states; track s) {<span><i [style.background]="color[s]"></i>{{ s }}</span>}</div>
    </div>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .mx .c { text-align: center; } .cell { width: 34px; height: 28px; border: 0; border-radius: 6px; font-weight: 700; cursor: pointer; color: var(--kf-ffffff); }
    .cell[data-s='Valid'] { background: var(--kb-22c55e); } .cell[data-s='Expiring'] { background: var(--kb-f59e0b); } .cell[data-s='Expired'] { background: var(--kb-ef4444); } .cell[data-s='Missing'] { background: var(--kb-e5e7eb); color: var(--kf-6b7280); }
    .leg { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; } .leg span { display: flex; gap: 5px; align-items: center; } .leg i { width: 10px; height: 10px; border-radius: 3px; }
  `,
})
export class DocumentCompliance {
  protected readonly docTypes = DOC_TYPES;
  protected readonly companies = COMPANIES.slice(0, 24);
  protected readonly states: DocState[] = ['Valid', 'Expiring', 'Expired', 'Missing'];
  protected readonly icon: Record<DocState, string> = { Valid: 'file-check', Expiring: 'clock', Expired: 'ban', Missing: 'file-text' };
  protected readonly color: Record<DocState, string> = { Valid: 'var(--ka-22c55e)', Expiring: 'var(--ka-f59e0b)', Expired: 'var(--ka-ef4444)', Missing: 'var(--ka-9ca3af)' };
  protected readonly msg = signal<string | null>(null);
  protected readonly grid = signal<DocState[][]>(
    (() => {
      const r = rng(66);
      return this.companies.map((c) =>
        DOC_TYPES.map((_, di) => {
          if (c.status === 'Inactive') return di % 2 ? 'Expired' : 'Missing';
          const x = r() * (c.compliance < 80 ? 0.7 : 1);
          return x < 0.08 ? 'Expired' : x < 0.16 ? 'Missing' : x < 0.3 ? 'Expiring' : 'Valid';
        }),
      );
    })(),
  );
  protected cell(ci: number, di: number) {
    return this.grid()[ci][di];
  }
  protected score(ci: number) {
    return Math.round((this.grid()[ci].filter((s) => s === 'Valid' || s === 'Expiring').length / DOC_TYPES.length) * 100);
  }
  protected count(s: DocState) {
    return this.grid().flat().filter((x) => x === s).length;
  }
  protected fix(ci: number, di: number) {
    this.grid.update((g) => g.map((row, i) => (i === ci ? row.map((x, j) => (j === di ? 'Valid' : x)) : row)));
    toast(this.msg, `${DOC_TYPES[di]} for ${this.companies[ci].name} recorded as valid`);
  }
  protected remind() {
    const n = this.grid().filter((row) => row.some((s) => s !== 'Valid')).length;
    toast(this.msg, `Reminders sent to ${n} companies`);
  }
}

/* ======================= Induction & Training ======================= */
interface Session {
  id: string;
  course: string;
  date: string;
  time: string;
  site: string;
  trainer: string;
  capacity: number;
  enrolled: string[];
  attended: string[];
}

@Component({
  selector: 'app-induction-training',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Induction &amp; Training" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Site inductions and safety courses contractors must pass before working." />
    <section class="kpi-row">
      <app-kpi label="Inducted Workers" [value]="inductedPct() + '%'" icon="graduation-cap" color="var(--ka-22c55e)" />
      <app-kpi label="Awaiting Induction" [value]="pending().length" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Sessions This Week" [value]="sessions().length" icon="calendar-days" color="var(--ka-8b5cf6)" />
      <app-kpi label="Seats Available" [value]="seats()" icon="users" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Upcoming Sessions</h3></div>
        @for (s of sessions(); track s.id) {
          <div class="sess" [class.on]="selId() === s.id" (click)="selId.set(s.id)">
            <div class="date"><b>{{ s.date.slice(8) }}</b><small>{{ mon(s.date) }}</small></div>
            <div><b>{{ s.course }}</b><small>{{ s.time }} · {{ s.site }} · {{ s.trainer }}</small></div>
            <div class="cap"><span>{{ s.enrolled.length }}/{{ s.capacity }}</span><div class="bar"><i [style.width.%]="(s.enrolled.length / s.capacity) * 100"></i></div></div>
          </div>
        }
      </div>
      <div class="card span-5">
        @if (sel(); as s) {
          <div class="card-head"><h3>{{ s.course }}</h3><span class="muted">{{ s.date }} {{ s.time }}</span></div>
          <form class="add" (submit)="$event.preventDefault(); enrol(w.value); w.value = ''">
            <input #w class="input" list="ind-w" placeholder="Enrol worker (name or ID)" /><datalist id="ind-w">@for (p of pending().slice(0, 200); track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist>
            <button class="btn-primary btn-sm" type="submit" [disabled]="s.enrolled.length >= s.capacity">Enrol</button>
          </form>
          <ul class="att">
            @for (id of s.enrolled; track id) {
              @let p = worker(id);
              <li><label><input type="checkbox" [checked]="s.attended.includes(id)" (change)="mark(id)" />{{ p?.name }} <small>{{ p?.company }}</small></label></li>
            } @empty {<li class="muted">Nobody enrolled yet</li>}
          </ul>
          <button class="btn-ghost" (click)="complete()" [disabled]="!s.attended.length">Complete session ({{ s.attended.length }} passed)</button>
        }
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Induction Completion by Company</h3></div>
        <app-bar-list [rows]="byCompany()" />
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .sess { display: grid; grid-template-columns: 50px 1fr 130px; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; font-size: 12.5px; }
    .sess.on { border-color: var(--primary); background: var(--kb-faf8ff); } .sess div { display: flex; flex-direction: column; } .sess small { color: var(--muted); }
    .date { align-items: center; padding: 4px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); } .date b { font-size: 18px; }
    .cap span { font-size: 12px; text-align: right; } .bar { height: 6px; border-radius: 3px; background: var(--kb-eef0f6); overflow: hidden; } .bar i { display: block; height: 100%; background: var(--primary); }
    .add { display: flex; gap: 6px; margin-bottom: 10px; } .add .input { flex: 1; }
    .att { list-style: none; margin: 0 0 10px; padding: 0; max-height: 300px; overflow: auto; font-size: 12.5px; } .att li { padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .att label { display: flex; gap: 8px; align-items: center; } .att small { color: var(--muted); }
  `,
})
export class InductionTraining {
  protected readonly workers = signal<Worker[]>(WORKERS.map((w) => ({ ...w })));
  protected readonly msg = signal<string | null>(null);
  protected readonly sessions = signal<Session[]>(
    [
      ['Site Safety Induction', 1, '08:00', 'Head Office', 'Grace Park', 30],
      ['Site Safety Induction', 1, '14:00', 'Manufacturing', 'Ravi Shankar', 40],
      ['Working at Height', 2, '09:00', 'Manufacturing', 'Tom Baker', 16],
      ['Fire Safety & Evacuation', 3, '10:00', 'Warehouse', 'Omar Khalid', 25],
      ['Confined Space Entry', 4, '09:00', 'Data Center', 'Li Wei', 12],
      ['Site Safety Induction', 5, '08:00', 'Warehouse', 'Grace Park', 30],
    ].map(([course, d, time, site, trainer, capacity], i) => {
      const pend = WORKERS.filter((w) => w.induction !== 'Completed');
      return { id: `S${i}`, course: course as string, date: iso(d as number), time: time as string, site: site as string, trainer: trainer as string, capacity: capacity as number, enrolled: pend.slice(i * 8, i * 8 + 6 + i).map((w) => w.id), attended: [] };
    }),
  );
  protected readonly selId = signal('S0');
  protected readonly sel = computed(() => this.sessions().find((s) => s.id === this.selId()) ?? null);
  protected readonly pending = computed(() => this.workers().filter((w) => w.induction !== 'Completed' && w.status === 'Active'));
  protected readonly inductedPct = computed(() => ((this.workers().filter((w) => w.induction === 'Completed').length / this.workers().length) * 100).toFixed(1));
  protected readonly seats = computed(() => this.sessions().reduce((a, s) => a + s.capacity - s.enrolled.length, 0));
  protected readonly byCompany = computed(() =>
    COMPANIES.slice(0, 12).map((c) => {
      const ws = this.workers().filter((w) => w.companyId === c.id);
      const v = ws.length ? Math.round((ws.filter((w) => w.induction === 'Completed').length / ws.length) * 100) : 0;
      return { label: c.name, value: v, display: `${v}%`, color: v < 85 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' };
    }),
  );
  protected mon(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { month: 'short' });
  }
  protected worker(id: string) {
    return this.workers().find((w) => w.id === id);
  }
  private patchSel(c: Partial<Session>) {
    this.sessions.update((l) => l.map((s) => (s.id === this.selId() ? { ...s, ...c } : s)));
  }
  protected enrol(v: string) {
    const id = v.split(' · ')[0];
    const s = this.sel()!;
    if (!this.worker(id) || s.enrolled.includes(id)) return;
    this.patchSel({ enrolled: [...s.enrolled, id] });
  }
  protected mark(id: string) {
    const a = this.sel()!.attended;
    this.patchSel({ attended: a.includes(id) ? a.filter((x) => x !== id) : [...a, id] });
  }
  protected complete() {
    const ids = new Set(this.sel()!.attended);
    this.workers.update((l) => l.map((w) => (ids.has(w.id) ? { ...w, induction: 'Completed' } : w)));
    this.patchSel({ enrolled: this.sel()!.enrolled.filter((x) => !ids.has(x)), attended: [] });
    toast(this.msg, `${ids.size} worker(s) passed · site access enabled`);
  }
}

/* ======================= Access & Work Permits ======================= */
interface Permit {
  id: string;
  type: string;
  company: string;
  location: string;
  site: string;
  workers: number;
  from: string;
  to: string;
  issuer: string;
  status: 'Requested' | 'Approved' | 'Active' | 'Suspended' | 'Closed';
  checks: boolean[];
}
const PERMIT_TYPES = ['Hot Work', 'Working at Height', 'Confined Space', 'Electrical Isolation', 'Excavation', 'Cold Work'];
const CHECKS = ['Risk assessment attached', 'Area barricaded', 'Gas test / isolation verified', 'Fire watch / rescue plan in place', 'Toolbox talk held'];

@Component({
  selector: 'app-work-permits',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access &amp; Work Permits" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Permit-to-work for high-risk jobs, from request to close-out.">
      <button class="btn-primary" (click)="newPermit()"><app-icon name="plus" [size]="16" />New Permit</button>
    </app-page-head>
    <section class="kpi-row">
      @for (s of statuses; track s) {<app-kpi [label]="s" [value]="cnt(s)" icon="key-round" [color]="colors[s]" sub="permits" />}
    </section>
    <section class="wp" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" noun="permits" [activeId]="selId()" [searchKeys]="['id', 'company', 'location']" (rowClick)="selId.set($event.id)" />
      </div>
      @if (sel(); as p) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ p.id }} · {{ p.type }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <dl class="kv"><dt>Company</dt><dd>{{ p.company }}</dd><dt>Location</dt><dd>{{ p.location }}, {{ p.site }}</dd><dt>Workers</dt><dd>{{ p.workers }}</dd><dt>Valid</dt><dd>{{ p.from }} → {{ p.to }}</dd><dt>Issuer</dt><dd>{{ p.issuer }}</dd><dt>Status</dt><dd><span class="dt-status" [class]="'dt-status ' + cls(p.status)"><i></i>{{ p.status }}</span></dd></dl>
          <h4>Pre-work checklist</h4>
          <ul class="chk">@for (c of checks; track c; let i = $index) {<li><label><input type="checkbox" [checked]="p.checks[i]" (change)="toggle(p, i)" [disabled]="p.status === 'Closed'" />{{ c }}</label></li>}</ul>
          <div class="toolbar">
            @if (p.status === 'Requested') {<button class="btn-primary" (click)="set(p, 'Approved')" [disabled]="!allChecked(p)">Approve</button>}
            @if (p.status === 'Approved') {<button class="btn-primary" (click)="set(p, 'Active')">Activate (start work)</button>}
            @if (p.status === 'Active') {<button class="btn-ghost danger" (click)="set(p, 'Suspended')">Suspend</button><button class="btn-primary" (click)="set(p, 'Closed')">Close out</button>}
            @if (p.status === 'Suspended') {<button class="btn-primary" (click)="set(p, 'Active')">Resume</button>}
          </div>
          @if (p.status === 'Requested' && !allChecked(p)) {<p class="muted">Complete the checklist to approve.</p>}
        </aside>
      }
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .wp { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .wp.with-detail { grid-template-columns: minmax(0, 1fr) 360px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .kv { display: grid; grid-template-columns: 80px 1fr; gap: 6px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 0; font-size: 13px; } .chk { list-style: none; margin: 0; padding: 0; font-size: 12.5px; } .chk li { padding: 5px 0; } .chk label { display: flex; gap: 8px; align-items: center; } .chk input { accent-color: var(--primary); }
    .danger { color: var(--red); }
    @media (max-width: 1100px) { .wp.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class WorkPermits {
  protected readonly statuses: Permit['status'][] = ['Requested', 'Approved', 'Active', 'Suspended', 'Closed'];
  protected readonly colors: Record<string, string> = { Requested: 'var(--ka-f59e0b)', Approved: 'var(--ka-3b82f6)', Active: 'var(--ka-22c55e)', Suspended: 'var(--ka-ef4444)', Closed: 'var(--ka-64748b)' };
  protected readonly checks = CHECKS;
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<Permit[]>(
    (() => {
      const r = rng(31);
      const locs = ['Roof – Block B', 'Plant Room 2', 'Boiler House', 'Substation 3', 'Loading Bay', 'Cooling Tower', 'Basement B2', 'Tank Farm'];
      return Array.from({ length: 36 }, (_, i) => {
        const c = COMPANIES[[4, 5, 0, 7, 1, 6][i % 6]];
        const st = (['Requested', 'Approved', 'Active', 'Active', 'Active', 'Closed', 'Closed', 'Suspended'] as const)[Math.floor(r() * 8)];
        return {
          id: `PTW-${2600 + i}`, type: PERMIT_TYPES[i % PERMIT_TYPES.length], company: c.name, location: locs[i % locs.length], site: c.sites[0], workers: 2 + Math.floor(r() * 8),
          from: `${iso(-(i % 3))} 07:00`, to: `${iso(-(i % 3))} 17:00`, issuer: ['Grace Park', 'Ravi Shankar', 'Omar Khalid'][i % 3], status: st,
          checks: CHECKS.map(() => st !== 'Requested' || r() < 0.5),
        };
      });
    })(),
  );
  protected readonly selId = signal<string | null>('PTW-2600');
  protected readonly sel = computed(() => this.list().find((p) => p.id === this.selId()) ?? null);
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Permit' },
    { key: 'type', label: 'Type' },
    { key: 'company', label: 'Company' },
    { key: 'location', label: 'Location', sub: 'site' },
    { key: 'workers', label: 'Workers', kind: 'num' },
    { key: 'from', label: 'From' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'type', label: 'Type', options: PERMIT_TYPES }, { key: 'status', label: 'Status', options: this.statuses }];
  protected cnt(s: string) {
    return this.list().filter((p) => p.status === s).length;
  }
  protected cls(s: string) {
    return s === 'Active' ? 'green' : s === 'Requested' ? 'amber' : s === 'Suspended' ? 'red' : 'blue';
  }
  protected allChecked(p: Permit) {
    return p.checks.every(Boolean);
  }
  private patch(id: string, c: Partial<Permit>) {
    this.list.update((l) => l.map((p) => (p.id === id ? { ...p, ...c } : p)));
  }
  protected toggle(p: Permit, i: number) {
    this.patch(p.id, { checks: p.checks.map((x, j) => (j === i ? !x : x)) });
  }
  protected set(p: Permit, status: Permit['status']) {
    this.patch(p.id, { status });
    toast(this.msg, `${p.id} → ${status}`);
  }
  protected newPermit() {
    const id = `PTW-${2700 + this.list().length}`;
    this.list.update((l) => [{ id, type: 'Hot Work', company: COMPANIES[4].name, location: 'Roof – Block A', site: 'Head Office', workers: 3, from: `${iso(0)} 13:00`, to: `${iso(0)} 18:00`, issuer: 'Demo login', status: 'Requested', checks: CHECKS.map(() => false) }, ...l]);
    this.selId.set(id);
  }
}

/* ======================= On-Site Attendance ======================= */
@Component({
  selector: 'app-contractor-attendance',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="On-Site Attendance" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Who from each contractor company is on site today, against what was planned." />
    <section class="kpi-row">
      <app-kpi label="On Site Now" [value]="onSite().toLocaleString()" icon="users" color="var(--ka-22c55e)" [sub]="pct() + '% of active workers'" />
      <app-kpi label="Planned Today" [value]="planned().toLocaleString()" icon="calendar-days" color="var(--ka-8b5cf6)" />
      <app-kpi label="No-shows" [value]="(planned() - onSite()).toLocaleString()" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="Billable Hours (today)" [value]="billHours()" icon="clock" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Arrivals by Hour</h3></div>
        <app-column-chart [labels]="hours" [series]="arrivals()" [height]="200" [legend]="false" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Planned vs Present (top companies)</h3></div>
        <app-bar-list [rows]="byCompany()" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="present()" [columns]="cols" noun="workers" [searchKeys]="['name', 'id', 'company']" [filters]="filters" [pageSize]="12" />
      </div>
    </section>
  `,
})
export class ContractorAttendance {
  protected readonly hours = ['05', '06', '07', '08', '09', '10', '11', '12'];
  protected readonly present = computed(() => WORKERS.filter((w) => w.onSite));
  protected readonly onSite = computed(() => this.present().length);
  protected readonly planned = computed(() => Math.round(WORKERS.filter((w) => w.status === 'Active').length * 0.78));
  protected readonly billHours = computed(() => Math.round(this.onSite() * 7.6).toLocaleString());
  protected readonly pct = computed(() => ((this.onSite() / WORKERS.filter((w) => w.status === 'Active').length) * 100).toFixed(1));
  protected readonly arrivals = computed(() => [{ name: 'Arrivals', color: 'var(--ka-f97316)', values: this.hours.map((h) => this.present().filter((w) => w.checkIn.startsWith(h)).length) }]);
  protected readonly byCompany = computed(() =>
    COMPANIES.slice(0, 9).map((c) => {
      const plan = Math.round(c.active * 0.78);
      const here = WORKERS.filter((w) => w.companyId === c.id && w.onSite).length;
      return { label: c.name, value: plan ? Math.min(100, Math.round((here / plan) * 100)) : 0, display: `${here}/${plan}`, color: here >= plan * 0.9 ? 'var(--ka-22c55e)' : 'var(--ka-f59e0b)' };
    }),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Worker', kind: 'person', sub: 'id' },
    { key: 'company', label: 'Company' },
    { key: 'trade', label: 'Trade' },
    { key: 'site', label: 'Site' },
    { key: 'checkIn', label: 'Check-in' },
    { key: 'compliance', label: 'Compliance', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'site', label: 'Site', options: ALL_SITES }, { key: 'company', label: 'Company', options: companyNames.slice(0, 20) }];
}
