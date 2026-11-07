import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { PersonProfile } from './person-profile';
import { PEOPLE, Person, SITES } from './people.data';

type Row = Person & { induction: string; permitExpiry: string; compliance: string; supervisor: string };
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

const ROWS: Row[] = (() => {
  const r = rng(91);
  const now = new Date();
  return PEOPLE.filter((p) => p.type === 'Contractor').map((p) => {
    const days = Math.round(-20 + r() * 400);
    const exp = new Date(now.getTime() + days * 86400000);
    const ind = r();
    return {
      ...p,
      induction: ind < 0.82 ? 'Completed' : ind < 0.94 ? 'Pending' : 'Expired',
      permitExpiry: fmtDate(exp),
      compliance: days < 0 || ind >= 0.94 ? 'Non-compliant' : days < 30 ? 'Expiring' : 'Compliant',
      supervisor: ['Omar Khalid', 'Li Wei', 'Ravi Shankar', 'Tom Baker'][Math.floor(r() * 4)],
    };
  });
})();

@Component({
  selector: 'app-contractors',
  imports: [...UI, DataTable, PersonProfile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contractor Personnel" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Contractor workers, their companies, inductions, permits and compliance." />

    <section class="kpi-row">
      <app-kpi label="Contractor Workers" [value]="rows().length.toLocaleString()" icon="hard-hat" color="#fb923c" change="4%" />
      <app-kpi label="Compliant" [value]="c('Compliant')" icon="shield-check" color="#22c55e" sub="all documents valid" />
      <app-kpi label="Expiring ≤ 30 days" [value]="c('Expiring')" icon="clock" color="#f59e0b" sub="permits" />
      <app-kpi label="Non-compliant" [value]="c('Non-compliant')" icon="ban" color="#ef4444" sub="access blocked" />
      <app-kpi label="Companies" value="6" icon="building" color="#8b5cf6" sub="active vendors" />
    </section>

    <section class="dash">
      <div class="card span-5">
        <div class="card-head"><h3>Workers by Company</h3></div>
        <app-bar-list [rows]="byCompany()" [max]="byCompany()[0].value" />
      </div>
      <div class="card span-3">
        <div class="card-head"><h3>Compliance</h3></div>
        <app-donut [segments]="compliance()" center="Workers" [size]="130" [legend]="false" />
        <div class="mini-legend">@for (s of compliance(); track s.label) {<span><i [style.background]="s.color"></i>{{ s.label }} {{ s.value }}</span>}</div>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Induction Status</h3></div>
        <app-bar-list [rows]="induction()" [max]="rows().length" />
      </div>
      <div class="card span-12">
        <app-data-table
          [rows]="rows()" [columns]="cols" noun="contractors" [selectable]="true"
          [searchKeys]="['name', 'id', 'company', 'designation']" searchPlaceholder="Search name, ID, company, trade..."
          [filters]="filters" [actions]="actions" [bulkActions]="bulk"
          (rowClick)="open.set($event)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)"
        />
      </div>
    </section>

    @if (open(); as p) {
      <div class="g-overlay" (click)="open.set(null)"></div>
      <aside class="g-drawer wide"><app-person-profile [person]="p" (closed)="open.set(null)" /></aside>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `.mini-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: center; margin-top: 10px; font-size: 11.5px; }
    .mini-legend span { display: inline-flex; align-items: center; gap: 5px; } .mini-legend i { width: 9px; height: 9px; border-radius: 50%; }`,
})
export class Contractors {
  private readonly state = inject(AppState);
  protected readonly list = signal<Row[]>(ROWS);
  protected readonly open = signal<Person | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Worker', kind: 'person', sub: 'id' },
    { key: 'company', label: 'Company' },
    { key: 'designation', label: 'Trade / Role' },
    { key: 'site', label: 'Site' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'induction', label: 'Induction', kind: 'tag', tag: (r) => (r.induction === 'Completed' ? 'tag green' : r.induction === 'Pending' ? 'tag amber' : 'tag red') },
    { key: 'permitExpiry', label: 'Permit Expiry', fmt: (v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    { key: 'compliance', label: 'Compliance', kind: 'status' },
    { key: 'status', label: 'Access', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'company', label: 'Company', options: ['BuildRight LLC', 'SafeGuard Security', 'CleanPro Services', 'TechServe FM', 'Rapid Logistics', 'Spark Electricals'] },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'compliance', label: 'Compliance', options: ['Compliant', 'Expiring', 'Non-compliant'] },
    { key: 'induction', label: 'Induction', options: ['Completed', 'Pending', 'Expired'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View profile', icon: 'user' },
    { id: 'renew', label: 'Renew permit (1 yr)', icon: 'refresh', when: (r) => r.compliance !== 'Compliant' },
    { id: 'induct', label: 'Mark induction complete', icon: 'graduation-cap', when: (r) => r.induction !== 'Completed' },
    { id: 'suspend', label: 'Suspend access', icon: 'ban', danger: true, when: (r) => r.status === 'Active' },
    { id: 'restore', label: 'Restore access', icon: 'shield-check', when: (r) => r.status !== 'Active' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'renew', label: 'Renew permits' }, { id: 'suspend', label: 'Suspend access', danger: true }];

  protected readonly rows = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((p) => p.site === s.name);
  });
  protected readonly byCompany = computed(() => {
    const m: Record<string, number> = {};
    for (const p of this.rows()) m[p.company] = (m[p.company] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, display: String(value), color: '#fb923c' }));
  });
  protected readonly compliance = computed(() => [
    { label: 'Compliant', value: +this.c('Compliant'), color: '#22c55e' },
    { label: 'Expiring', value: +this.c('Expiring'), color: '#f59e0b' },
    { label: 'Non-compliant', value: +this.c('Non-compliant'), color: '#ef4444' },
  ]);
  protected readonly induction = computed(() =>
    ['Completed', 'Pending', 'Expired'].map((l, i) => {
      const v = this.rows().filter((r) => r.induction === l).length;
      return { label: l, value: v, display: String(v), color: ['#22c55e', '#f59e0b', '#ef4444'][i] };
    }),
  );

  protected c(v: string) {
    return String(this.rows().filter((r) => r.compliance === v).length);
  }
  protected act(a: string, r: Row) {
    if (a === 'view') return this.open.set(r);
    this.apply([r.id], a);
  }
  protected bulkAct(a: string, ids: string[]) {
    this.apply(ids, a);
  }
  private apply(ids: string[], a: string) {
    const set = new Set(ids);
    const next = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    this.list.update((l) =>
      l.map((r) => {
        if (!set.has(r.id)) return r;
        if (a === 'renew') return { ...r, permitExpiry: next, compliance: r.induction === 'Expired' ? 'Non-compliant' : 'Compliant' };
        if (a === 'induct') return { ...r, induction: 'Completed', compliance: new Date(r.permitExpiry) > new Date() ? 'Compliant' : r.compliance };
        if (a === 'suspend') return { ...r, status: 'Suspended' };
        if (a === 'restore') return { ...r, status: 'Active' };
        return r;
      }),
    );
    this.toast.set(`${ids.length} worker(s) updated`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
