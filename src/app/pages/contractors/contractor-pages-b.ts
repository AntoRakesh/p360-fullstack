import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, rng, series } from '../dashboards/demo-data';
import { COMPANIES, Company, fmtDate, WORKERS } from './contractors.data';

const toast = (s: { set: (v: string | null) => void }, m: string) => {
  s.set(m);
  setTimeout(() => s.set(null), 2200);
};

/* ======================= Contractor Performance ======================= */
interface Score {
  id: string;
  name: string;
  icon: string;
  color: string;
  trade: string;
  safety: number;
  quality: number;
  timeliness: number;
  compliance: number;
  incidents: number;
  overall: number;
  trend: number[];
}
const overall = (s: Pick<Score, 'safety' | 'quality' | 'timeliness' | 'compliance'>) => Math.round(s.safety * 0.35 + s.quality * 0.25 + s.timeliness * 0.2 + s.compliance * 0.2);

@Component({
  selector: 'app-contractor-performance',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contractor Performance" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Scorecards for safety, quality, timeliness and compliance (weights 35 / 25 / 20 / 20)." />
    <section class="kpi-row">
      <app-kpi label="Average Score" [value]="avg()" icon="star" color="#8b5cf6" change="2.4" />
      <app-kpi label="Top Performer" [value]="best().name" icon="trending-up" color="#22c55e" [sub]="best().overall + ' / 100'" />
      <app-kpi label="Below 70 (watch)" [value]="below()" icon="triangle-alert" color="#ef4444" />
      <app-kpi label="Safety Incidents (90 d)" [value]="incidents()" icon="siren" color="#f97316" />
    </section>
    <section class="pf" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" noun="companies" [searchKeys]="['name', 'trade']" [activeId]="selId()" (rowClick)="selId.set($event.id)" [actions]="actions" (action)="selId.set($event.row.id)" />
      </div>
      @if (sel(); as s) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ s.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="big"><b [style.color]="s.overall >= 85 ? '#16a34a' : s.overall >= 70 ? '#d97706' : '#dc2626'">{{ s.overall }}</b><span>overall score</span></div>
          <app-sparkline [values]="s.trend" />
          <h4>Rate this month</h4>
          @for (k of keys; track k) {
            <label class="sl">{{ label[k] }} <b>{{ s[k] }}</b><input type="range" min="0" max="100" [value]="s[k]" (input)="rate(s.id, k, +$any($event.target).value)" /></label>
          }
          <dl class="kv"><dt>Incidents (90 d)</dt><dd>{{ s.incidents }}</dd><dt>Trade</dt><dd>{{ s.trade }}</dd></dl>
        </aside>
      }
    </section>
  `,
  styles: `
    .pf { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .pf.with-detail { grid-template-columns: minmax(0, 1fr) 320px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .big { display: flex; align-items: baseline; gap: 8px; } .big b { font-size: 40px; } .big span { color: var(--muted); }
    h4 { margin: 6px 0 0; font-size: 13px; } .sl { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .sl input { accent-color: var(--primary); }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px; font-size: 12.5px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    @media (max-width: 1100px) { .pf.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class ContractorPerformance {
  protected readonly keys = ['safety', 'quality', 'timeliness', 'compliance'] as const;
  protected readonly label = { safety: 'Safety', quality: 'Quality', timeliness: 'Timeliness', compliance: 'Compliance' };
  protected readonly list = signal<Score[]>(
    COMPANIES.filter((c) => c.status !== 'Inactive').map((c, i) => {
      const r = rng(i * 17 + 3);
      const s = { safety: Math.round(70 + r() * 29), quality: Math.round(65 + r() * 34), timeliness: Math.round(60 + r() * 39), compliance: c.compliance };
      return { id: c.id, name: c.name, icon: c.icon, color: c.color, trade: c.trade, ...s, incidents: Math.floor(r() * r() * 6), overall: overall(s), trend: series(8, overall(s), 5, i) };
    }),
  );
  protected readonly selId = signal<string | null>('C0');
  protected readonly sel = computed(() => this.list().find((s) => s.id === this.selId()) ?? null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Company', kind: 'icon', sub: 'trade' },
    { key: 'safety', label: 'Safety', kind: 'progress' },
    { key: 'quality', label: 'Quality', kind: 'progress' },
    { key: 'timeliness', label: 'Timeliness', kind: 'progress' },
    { key: 'compliance', label: 'Compliance', kind: 'progress' },
    { key: 'incidents', label: 'Incidents', kind: 'num' },
    { key: 'overall', label: 'Overall', kind: 'num' },
  ];
  protected readonly actions: RowAction[] = [{ id: 'rate', label: 'Rate this month', icon: 'star' }];
  protected readonly avg = computed(() => Math.round(this.list().reduce((a, s) => a + s.overall, 0) / this.list().length));
  protected readonly best = computed(() => [...this.list()].sort((a, b) => b.overall - a.overall)[0]);
  protected readonly below = computed(() => this.list().filter((s) => s.overall < 70).length);
  protected readonly incidents = computed(() => this.list().reduce((a, s) => a + s.incidents, 0));
  protected rate(id: string, k: (typeof this.keys)[number], v: number) {
    this.list.update((l) => l.map((s) => (s.id === id ? { ...s, [k]: v, overall: overall({ ...s, [k]: v }) } : s)));
  }
}

/* ======================= Vendor Management ======================= */
interface Vendor {
  id: string;
  name: string;
  category: string;
  rating: number;
  spend: number;
  openPos: number;
  terms: string;
  country: string;
  stage: 'Applied' | 'Due diligence' | 'Approved' | 'Preferred' | 'On hold';
}
const STAGES: Vendor['stage'][] = ['Applied', 'Due diligence', 'Approved', 'Preferred', 'On hold'];

@Component({
  selector: 'app-vendor-management',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Vendor Management" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Suppliers and service vendors — onboarding, ratings, spend and purchase orders.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />New Vendor Application</button>
    </app-page-head>
    <section class="pipe">
      @for (s of stages; track s) {
        <div class="card col">
          <div class="ch"><b>{{ s }}</b><span>{{ byStage(s).length }}</span></div>
          @for (v of byStage(s).slice(0, 5); track v.id) {
            <div class="vc"><b>{{ v.name }}</b><small>{{ v.category }} · ★ {{ v.rating }}</small>
              @if (next(s); as n) {<button class="link" (click)="move(v, n)">→ {{ n }}</button>}
            </div>
          }
          @if (byStage(s).length > 5) {<small class="muted">+{{ byStage(s).length - 5 }} more</small>}
        </div>
      }
    </section>
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Spend by Category (YTD)</h3></div>
        <app-donut [segments]="spendMix()" center="AED" [value]="totalSpend()" [size]="130" />
      </div>
      <div class="card span-8">
        <app-data-table [rows]="list()" [columns]="cols" noun="vendors" [searchKeys]="['name', 'category']" [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
    </section>
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .pipe { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
    .col { display: flex; flex-direction: column; gap: 6px; padding: 10px; } .ch { display: flex; justify-content: space-between; font-size: 13px; } .ch span { padding: 0 8px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); }
    .vc { display: flex; flex-direction: column; gap: 2px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; } .vc small { color: var(--muted); } .vc .link { align-self: flex-start; font-size: 11.5px; }
    @media (max-width: 1100px) { .pipe { grid-template-columns: repeat(2, 1fr); } }
  `,
})
export class VendorManagement {
  protected readonly stages = STAGES;
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<Vendor[]>(
    (() => {
      const r = rng(808);
      const cats = ['Office Supplies', 'IT Hardware', 'PPE & Safety', 'Food & Beverage', 'Spare Parts', 'Packaging', 'Uniforms', 'Chemicals'];
      const names = ['Office Depot ME', 'TechSource', 'SafeWear', 'FreshFoods', 'MachParts', 'BoxIt', 'UniformPro', 'ChemSupply', 'Al Futtaim Trading', 'Gulf Stationers', 'Dell EMEA', '3M Gulf', 'Lulu Wholesale', 'Bosch Spares', 'PackCo', 'Workwear Arabia', 'Ecolab', 'Canon ME', 'HP Gulf', 'Honeywell Safety'];
      return names.map((n, i) => ({
        id: `VEN-${300 + i}`, name: n, category: cats[i % cats.length], rating: Math.round((3 + r() * 2) * 10) / 10, spend: Math.round(r() * 2_400_000), openPos: Math.floor(r() * 9),
        terms: ['Net 30', 'Net 45', 'Net 60'][i % 3], country: ['UAE', 'KSA', 'Germany', 'USA', 'India'][i % 5], stage: (i < 3 ? 'Applied' : i < 6 ? 'Due diligence' : i === 19 ? 'On hold' : i % 3 ? 'Approved' : 'Preferred') as Vendor['stage'],
      }));
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Vendor', sub: 'id' },
    { key: 'category', label: 'Category' },
    { key: 'rating', label: 'Rating', kind: 'num' },
    { key: 'spend', label: 'Spend YTD (AED)', kind: 'num' },
    { key: 'openPos', label: 'Open POs', kind: 'num' },
    { key: 'terms', label: 'Terms' },
    { key: 'stage', label: 'Stage', kind: 'tag', tag: (r) => (r.stage === 'Preferred' ? 'tag green' : r.stage === 'Approved' ? 'tag blue' : r.stage === 'On hold' ? 'tag red' : 'tag amber') },
  ];
  protected readonly filters = [{ key: 'stage', label: 'Stage', options: STAGES }, { key: 'category', label: 'Category', options: ['Office Supplies', 'IT Hardware', 'PPE & Safety', 'Food & Beverage', 'Spare Parts', 'Packaging', 'Uniforms', 'Chemicals'] }];
  protected readonly actions: RowAction[] = [
    { id: 'Preferred', label: 'Mark preferred', icon: 'star', when: (r) => r.stage === 'Approved' },
    { id: 'On hold', label: 'Put on hold', icon: 'ban', danger: true, when: (r) => r.stage !== 'On hold' },
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.stage === 'Due diligence' || r.stage === 'On hold' },
  ];
  protected readonly spendMix = computed(() => {
    const m = new Map<string, number>();
    this.list().forEach((v) => m.set(v.category, (m.get(v.category) ?? 0) + v.spend));
    const colors = ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];
    return [...m.entries()].map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
  });
  protected readonly totalSpend = computed(() => `${(this.list().reduce((a, v) => a + v.spend, 0) / 1e6).toFixed(1)}M`);
  protected byStage(s: string) {
    return this.list().filter((v) => v.stage === s);
  }
  protected next(s: Vendor['stage']): Vendor['stage'] | null {
    return ({ Applied: 'Due diligence', 'Due diligence': 'Approved', Approved: 'Preferred' } as Record<string, Vendor['stage']>)[s] ?? null;
  }
  protected move(v: Vendor, stage: Vendor['stage']) {
    this.list.update((l) => l.map((x) => (x.id === v.id ? { ...x, stage } : x)));
    toast(this.msg, `${v.name} → ${stage}`);
  }
  protected act(a: string, v: Vendor) {
    this.move(v, a as Vendor['stage']);
  }
  protected add() {
    this.list.update((l) => [{ id: `VEN-${400 + l.length}`, name: 'New Supplier LLC', category: 'Office Supplies', rating: 0, spend: 0, openPos: 0, terms: 'Net 30', country: 'UAE', stage: 'Applied' }, ...l]);
    toast(this.msg, 'Vendor application created · due-diligence questionnaire sent');
  }
}

/* ======================= Blacklisted Companies ======================= */
interface Ban {
  id: string;
  name: string;
  reason: string;
  date: string;
  until: string;
  by: string;
  workers: number;
}

@Component({
  selector: 'app-blacklisted-companies',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Blacklisted Companies" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Companies banned from working on site — their workers are blocked automatically.">
      <button class="btn-primary" (click)="open.set(true)"><app-icon name="plus" [size]="16" />Blacklist Company</button>
    </app-page-head>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="list()" [columns]="cols" noun="companies" [searchKeys]="['name', 'reason']" [actions]="actions" (action)="lift($event.row)" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Check a company</h3></div>
        <input class="input full" placeholder="Type company name" [value]="q()" (input)="q.set($any($event.target).value)" />
        @if (q().trim()) {
          @if (hit(); as h) {<div class="res bad-r"><b>⛔ Blacklisted</b><span>{{ h.reason }}</span><small>until {{ h.until || 'permanent' }}</small></div>}
          @else {<div class="res ok"><b>✓ Not blacklisted</b><span>Company may be onboarded.</span></div>}
        }
      </div>
    </section>
    @if (open()) {
      <div class="g-overlay" (click)="open.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add(n.value, r.value, u.value)">
        <div class="modal-head"><h3>Blacklist Company</h3><button type="button" class="close-btn" (click)="open.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Company<input #n class="input" list="bl-co" required /><datalist id="bl-co">@for (c of companies; track c.id) {<option [value]="c.name"></option>}</datalist></label>
          <label class="full">Reason<input #r class="input" required /></label>
          <label>Banned until (blank = permanent)<input #u class="input" type="date" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="open.set(false)">Cancel</button><button class="btn-primary" type="submit">Blacklist</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `.full { width: 100%; } .res { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; padding: 12px; border-radius: 10px; font-size: 13px; } .bad-r { background: #fef2f2; color: #991b1b; } .ok { background: #f0fdf4; color: #166534; } .res b { font-size: 16px; }`,
})
export class BlacklistedCompanies {
  protected readonly companies = COMPANIES;
  protected readonly q = signal('');
  protected readonly open = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected readonly list = signal<Ban[]>([
    { id: 'BL-01', name: 'Rapid Build Co.', reason: 'Fatal safety breach – scaffolding collapse (2025)', date: '2025-08-14', until: '', by: 'HSE Director', workers: 0 },
    { id: 'BL-02', name: 'StarClean Services', reason: 'Falsified worker visas', date: '2026-01-22', until: '2028-01-22', by: 'Legal', workers: 0 },
    { id: 'BL-03', name: 'Metro Movers', reason: 'Repeated theft from warehouse', date: '2026-04-09', until: '', by: 'Security', workers: 0 },
    { id: 'BL-04', name: 'Apex Electrical', reason: 'Unlicensed electrical work', date: '2026-06-30', until: '2027-06-30', by: 'Facilities', workers: 0 },
    { id: 'BL-05', name: 'SkyHigh Glazing', reason: 'Insurance fraud', date: '2026-09-11', until: '', by: 'Procurement', workers: 0 },
  ]);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Company' },
    { key: 'reason', label: 'Reason' },
    { key: 'date', label: 'Since', fmt: fmtDate },
    { key: 'until', label: 'Until', fmt: (v) => (v ? fmtDate(v) : 'Permanent') },
    { key: 'by', label: 'Decided by' },
    { key: 'workers', label: 'Workers blocked', kind: 'num' },
  ];
  protected readonly actions: RowAction[] = [{ id: 'lift', label: 'Lift ban', icon: 'shield-check' }];
  protected readonly hit = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.list().find((b) => b.name.toLowerCase().includes(q)) ?? null;
  });
  protected add(name: string, reason: string, until: string) {
    const c = COMPANIES.find((x) => x.name === name);
    this.list.update((l) => [{ id: `BL-${l.length + 1}`, name, reason, date: new Date().toISOString().slice(0, 10), until, by: 'Demo login', workers: c?.workers ?? 0 }, ...l]);
    this.open.set(false);
    toast(this.msg, `${name} blacklisted${c ? ` · ${c.workers} worker badges blocked` : ''}`);
  }
  protected lift(b: Ban) {
    this.list.update((l) => l.filter((x) => x.id !== b.id));
    toast(this.msg, `Ban lifted for ${b.name}`);
  }
}

/* ======================= Reports & Analytics ======================= */
@Component({
  selector: 'app-contractor-reports',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports &amp; Analytics" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Contractor headcount, cost, compliance and safety trends." />
    <section class="kpi-row">
      <app-kpi label="Contractor Headcount" value="3,245" icon="hard-hat" color="#fb923c" change="6%" />
      <app-kpi label="Contract Value" [value]="'AED ' + value()" icon="trending-up" color="#8b5cf6" />
      <app-kpi label="Avg. Compliance" [value]="avgComp() + '%'" icon="shield-check" color="#22c55e" />
      <app-kpi label="Cost per Worker / mo" value="AED 6,120" icon="briefcase" color="#3b82f6" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Contractor Headcount Trend</h3></div>
        <app-line-chart [labels]="months" [series]="headcount" [height]="220" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Workers by Trade</h3></div>
        <app-donut [segments]="byTrade()" center="Workers" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Compliance by Company</h3></div>
        <app-bar-list [rows]="compRows()" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Reports</h3></div>
        <div class="reps">
          @for (r of reports; track r.id) {<div class="rep"><b>{{ r.name }}</b><small>{{ r.desc }}</small><button class="btn-ghost sm" (click)="run(r.id)">Export CSV</button></div>}
        </div>
      </div>
    </section>
  `,
  styles: `.reps { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .rep { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; } .rep small { color: var(--muted); } .rep button { align-self: flex-start; }`,
})
export class ContractorReports {
  protected readonly months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  protected readonly headcount = [
    { name: 'Contractors', color: '#f97316', values: [2710, 2780, 2820, 2905, 2960, 3010, 3050, 3090, 3120, 3170, 3210, 3245], area: true },
    { name: 'On site (avg)', color: '#7c3aed', values: [1820, 1870, 1905, 1960, 2010, 2040, 2070, 2100, 2120, 2150, 2170, 2186] },
  ];
  protected readonly reports = [
    { id: 'companies', name: 'Company Register', desc: 'All companies with contract & compliance' },
    { id: 'workers', name: 'Worker Register', desc: 'All 3,245 contractor workers' },
    { id: 'expiring', name: 'Expiring Permits', desc: 'Workers whose permits expire in 30 days' },
    { id: 'noncompliant', name: 'Non-compliant Workers', desc: 'Workers blocked from site' },
  ];
  protected readonly value = computed(() => `${(COMPANIES.reduce((a, c) => a + c.value, 0) / 1e6).toFixed(1)}M`);
  protected readonly avgComp = computed(() => Math.round(COMPANIES.filter((c) => c.status !== 'Inactive').reduce((a, c) => a + c.compliance, 0) / COMPANIES.filter((c) => c.status !== 'Inactive').length));
  protected readonly byTrade = computed(() => COMPANIES.slice(0, 8).map((c) => ({ label: c.trade, value: c.workers, color: c.color })));
  protected readonly compRows = computed(() => COMPANIES.slice(0, 10).map((c: Company) => ({ label: c.name, value: c.compliance, display: `${c.compliance}%`, color: c.compliance >= 88 ? '#22c55e' : c.compliance >= 80 ? '#f59e0b' : '#ef4444' })));
  protected run(id: string) {
    if (id === 'companies') return downloadCsv('contractor-companies.csv', [['Code', 'Company', 'Trade', 'Workers', 'Status', 'Compliance'], ...COMPANIES.map((c) => [c.code, c.name, c.trade, c.workers, c.status, c.compliance])]);
    const rows = id === 'expiring' ? WORKERS.filter((w) => w.compliance === 'Expiring') : id === 'noncompliant' ? WORKERS.filter((w) => w.compliance === 'Non-compliant') : WORKERS;
    downloadCsv(`contractor-${id}.csv`, [['ID', 'Name', 'Company', 'Trade', 'Site', 'Permit expiry', 'Compliance'], ...rows.map((w) => [w.id, w.name, w.company, w.trade, w.site, w.permitExpiry, w.compliance])]);
  }
}
