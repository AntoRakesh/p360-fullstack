import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { ALL_SITES, COMPANIES, Company, COUNTRIES, DOC_TYPES, fmtDate, WORKERS } from './contractors.data';

const TABS = ['Overview', 'Contracts', 'Compliance', 'Workforce', 'Documents', 'Sites'] as const;
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

@Component({
  selector: 'app-contractor-companies',
  imports: [...UI, DataTable, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contractor Companies" parent="Contractor &amp; Vendor Workforce" parentLink="/contractor-vendor" subtitle="Manage contractor organizations, contracts, compliance and workforce across all sites.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Contractor Company</button>
      <label class="btn-ghost"><app-icon name="download" [size]="16" class="up" />Import<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="more.set(!more())" aria-label="More">⋮</button>
        @if (more()) {<div class="dropdown"><button class="dd-item" (click)="reset()">Reset demo data</button><button class="dd-item" (click)="print()">Print</button></div>}
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Contractor Companies" [value]="list().length" icon="building" color="var(--ka-8b5cf6)" change="9%" sub="vs. last quarter" />
      <app-kpi label="Active Contractors" [value]="fmt(activeWorkers())" icon="users" color="var(--ka-22c55e)" change="6%" sub="vs. last month" />
      <app-kpi label="Expiring Documents" value="72" icon="id-card" color="var(--ka-f97316)" change="18%" [up]="false" sub="within 30 days" />
      <app-kpi label="Non-Compliant" [value]="nonCompliant()" icon="shield" color="var(--ka-ef4444)" change="33%" [good]="false" sub="vs. last month" />
      <app-kpi label="On-Site Today" [value]="fmt(onSite())" icon="shield-check" color="var(--ka-3b82f6)" [sub]="onSitePct() + '% of total'" />
    </section>

    <section class="cc" [class.with-detail]="!!sel()">
      <div class="card">
        @switch (view()) {
          @case ('grid') {
            <app-data-table [rows]="list()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="companies"
              [searchKeys]="['name', 'code', 'contact', 'trade']" searchPlaceholder="Search company name, code, contact, trade..." [activeId]="selId()"
              (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)">
              <ng-container *ngTemplateOutlet="views" />
            </app-data-table>
          }
          @case ('list') {
            <div class="card-head"><h3>{{ list().length }} companies</h3><ng-container *ngTemplateOutlet="views" /></div>
            <div class="cards">
              @for (c of list(); track c.id) {
                <button class="co" [class.on]="selId() === c.id" (click)="selId.set(c.id)">
                  <span class="logo" [style.background]="'color-mix(in srgb, ' + c.color + ' 10%, transparent)'" [style.color]="c.color"><app-icon [name]="c.icon" [size]="20" /></span>
                  <div><b>{{ c.name }}</b><small>{{ c.code }} · {{ c.trade }}</small></div>
                  <div class="co-foot"><span>{{ c.workers }} workers</span><span [class]="statusTag(c.status)">{{ c.status }}</span><span [style.color]="compColor(c.compliance)">● {{ c.compliance }}%</span></div>
                </button>
              }
            </div>
          }
          @case ('map') {
            <div class="card-head"><h3>Companies by Site</h3><ng-container *ngTemplateOutlet="views" /></div>
            <div class="sites">
              @for (s of bySite(); track s.site) {
                <div class="site"><app-icon name="map-pin" [size]="18" /><div><b>{{ s.site }}</b><small>{{ s.companies }} companies · {{ s.workers.toLocaleString() }} contractors on site</small></div>
                  <div class="chips">@for (c of s.list; track c.id) {<button class="chip-s" (click)="selId.set(c.id)">{{ c.name }}</button>}</div></div>
              }
            </div>
          }
        }
        <ng-template #views>
          <div class="vt">
            <button [class.on]="view() === 'grid'" (click)="view.set('grid')"><app-icon name="grid" [size]="14" [stroke]="2.4" />Grid</button>
            <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="list-checks" [size]="14" />List</button>
            <button [class.on]="view() === 'map'" (click)="view.set('map')"><app-icon name="map-pin" [size]="14" />Map</button>
          </div>
        </ng-template>
      </div>

      @if (sel(); as c) {
        <aside class="card detail">
          <div class="d-head">
            <span class="big-logo" [style.background]="'color-mix(in srgb, ' + c.color + ' 10%, transparent)'" [style.color]="c.color"><app-icon [name]="c.icon" [size]="28" /></span>
            <div><h2>{{ c.name }}</h2><span class="muted">{{ c.code }} | {{ c.trade }}</span></div>
            <span class="pill" [class]="'pill ' + pillCls(c.status)"><i></i>{{ c.status }}</span>
            <button class="close-btn" (click)="selId.set(null)">×</button>
          </div>
          <div class="toolbar">
            <button class="btn-primary" (click)="openForm(c)"><app-icon name="sliders" [size]="15" />Edit</button>
            <div class="menu-wrap">
              <button class="btn-ghost" (click)="dmore.set(!dmore())">More <app-icon name="chevron-down" [size]="14" /></button>
              @if (dmore()) {
                <div class="dropdown">
                  <button class="dd-item" (click)="act(c.status === 'Active' ? 'suspend' : 'activate', c)">{{ c.status === 'Active' ? 'Suspend company' : 'Activate company' }}</button>
                  <button class="dd-item" (click)="act('renew', c)">Renew contract (+1 year)</button>
                  <button class="dd-item danger" (click)="act('blacklist', c)">Blacklist company</button>
                </div>
              }
            </div>
          </div>
          <nav class="d-tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</nav>
          @switch (tab()) {
            @case ('Overview') {
              <div class="ov">
                <div>
                  <h4>Company Details</h4>
                  <dl class="facts">
                    <dt><app-icon name="building" [size]="13" />Company Name</dt><dd>{{ c.name }}</dd>
                    <dt><app-icon name="file-text" [size]="13" />Code</dt><dd>{{ c.code }}</dd>
                    <dt><app-icon name="briefcase" [size]="13" />Trade / Service</dt><dd>{{ c.trade }}</dd>
                    <dt><app-icon name="file-text" [size]="13" />Contract Type</dt><dd>{{ c.contractType }}</dd>
                    <dt><app-icon name="calendar-days" [size]="13" />Start Date</dt><dd>{{ fd(c.start) }}</dd>
                    <dt><app-icon name="calendar-days" [size]="13" />End Date</dt><dd>{{ fd(c.end) }}</dd>
                    <dt><app-icon name="user" [size]="13" />Primary Contact</dt><dd>{{ c.contact }}</dd>
                    <dt><app-icon name="message" [size]="13" />Email</dt><dd>{{ c.email }}</dd>
                    <dt><app-icon name="activity" [size]="13" />Phone</dt><dd>{{ c.phone }}</dd>
                    <dt><app-icon name="map-pin" [size]="13" />Address</dt><dd>{{ c.address }}</dd>
                  </dl>
                </div>
                <div>
                  <h4>Key Metrics</h4>
                  <div class="km">
                    <div><span class="ki" style="background:var(--kb-dbeafe);color:var(--kf-2563eb)"><app-icon name="users" [size]="16" /></span><b>{{ c.workers }}</b><small>Total Contractors</small></div>
                    <div><span class="ki" style="background:var(--kb-dcfce7);color:var(--kf-16a34a)"><app-icon name="user-check" [size]="16" /></span><b>{{ c.active }}</b><small>Active</small></div>
                    <div><span class="ki" style="background:var(--kb-fee2e2);color:var(--kf-dc2626)"><app-icon name="user" [size]="16" /></span><b>{{ c.workers - c.active }}</b><small>Inactive</small></div>
                    <div><span class="ki" style="background:var(--kb-ede9fe);color:var(--kf-7c3aed)"><app-icon name="shield-check" [size]="16" /></span><b>{{ c.compliance }}%</b><small>Compliance</small></div>
                    <div><span class="ki" style="background:var(--kb-ffedd5);color:var(--kf-ea580c)"><app-icon name="map-pin" [size]="16" /></span><b>{{ c.sites.length }}</b><small>Assigned Sites</small></div>
                    <div><span class="ki" style="background:var(--kb-fee2e2);color:var(--kf-dc2626)"><app-icon name="bell" [size]="16" /></span><b>{{ c.issues }}</b><small>Open Issues</small></div>
                  </div>
                </div>
              </div>
              <div class="two">
                <div class="mini-card">
                  <div class="mh"><h4>Contractor Workforce Trend</h4><span class="muted">Last 6 Months</span></div>
                  <app-line-chart [labels]="months" [series]="trend(c)" [height]="170" [legend]="false" />
                </div>
                <div class="mini-card">
                  <h4>Compliance Status</h4>
                  <app-donut [segments]="compSegs(c)" center="Compliant" [value]="c.compliance + '%'" [size]="120" />
                </div>
              </div>
            }
            @case ('Contracts') {
              <table class="table">
                <thead><tr><th>Contract</th><th>Period</th><th class="num">Value (AED)</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td>{{ c.code }}-MSA</td><td>{{ fd(c.start) }} – {{ fd(c.end) }}</td><td class="num">{{ c.value.toLocaleString() }}</td><td><span [class]="statusTag(c.status)">{{ c.status }}</span></td></tr>
                  <tr><td>{{ c.code }}-PO-2026-14</td><td>01 Jan 2026 – 31 Dec 2026</td><td class="num">{{ part(c.value, 0.4) }}</td><td><span class="tag green">Active</span></td></tr>
                  <tr><td>{{ c.code }}-PO-2025-09</td><td>01 Jan 2025 – 31 Dec 2025</td><td class="num">{{ part(c.value, 0.35) }}</td><td><span class="tag grey">Closed</span></td></tr>
                </tbody>
              </table>
            }
            @case ('Compliance') {
              <ul class="docs">
                @for (d of docs(c); track d.name) {<li><app-icon name="file-check" [size]="16" /><div><b>{{ d.name }}</b><small>expires {{ d.expiry }}</small></div><span [class]="d.cls">{{ d.status }}</span></li>}
              </ul>
            }
            @case ('Workforce') {
              <p class="muted">{{ c.workers }} workers · {{ onSiteOf(c) }} on site today</p>
              <ul class="wk">
                @for (w of workersOf(c); track w.id) {<li><span class="dt-av" [style.background]="w.avatar">{{ w.initials }}</span><div><b>{{ w.name }}</b><small>{{ w.id }} · {{ w.trade }} · {{ w.site }}</small></div><span [class]="w.onSite ? 'tag green' : 'tag grey'">{{ w.onSite ? 'On site' : 'Off site' }}</span></li>}
              </ul>
            }
            @case ('Documents') {
              <ul class="docs">
                @for (d of ['Master Service Agreement.pdf', 'Trade Licence 2026.pdf', 'Insurance Certificate.pdf', 'HSE Plan v3.pdf', 'Rate Card 2026.xlsx']; track d) {<li><app-icon name="file-text" [size]="16" /><div><b>{{ d }}</b><small>uploaded 12 Oct 2026 · Procurement</small></div><button class="link" (click)="toastMsg('Opening ' + d)">View</button></li>}
              </ul>
            }
            @case ('Sites') {
              <ul class="docs">
                @for (s of c.sites; track s) {<li><app-icon name="map-pin" [size]="16" /><div><b>{{ s }}</b><small>{{ workersAt(c, s) }} workers assigned</small></div><span class="tag green">Active</span></li>}
              </ul>
            }
          }
        </aside>
      }
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit ' + f.name : 'Add Contractor Company' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Company name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Trade / service *<input class="input" required [value]="f.trade" (input)="setF('trade', $any($event.target).value)" /></label>
          <label>Contract type<select class="select" [value]="f.contractType" (change)="setF('contractType', $any($event.target).value)"><option>Annual</option><option>Multi-Year</option><option>Project Based</option><option>Call-off</option></select></label>
          <label>Contract start<input class="input" type="date" [value]="f.start" (change)="setF('start', $any($event.target).value)" /></label>
          <label>Contract end<input class="input" type="date" [value]="f.end" (change)="setF('end', $any($event.target).value)" /></label>
          <label>Primary contact<input class="input" [value]="f.contact" (input)="setF('contact', $any($event.target).value)" /></label>
          <label>Email<input class="input" type="email" [value]="f.email" (input)="setF('email', $any($event.target).value)" /></label>
          <label>Phone<input class="input" [value]="f.phone" (input)="setF('phone', $any($event.target).value)" /></label>
          <label>Country<select class="select" [value]="f.country" (change)="setF('country', $any($event.target).value)">@for (c of countries; track c) {<option>{{ c }}</option>}</select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .up { transform: rotate(180deg); } .danger { color: var(--red); }
    .cc { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .cc.with-detail { grid-template-columns: minmax(0, 1.5fr) minmax(420px, 1fr); }
    .vt { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .vt button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border: 0; background: var(--kb-ffffff); font-size: 12.5px; cursor: pointer; } .vt button + button { border-left: 1px solid var(--border); }
    .vt button.on { background: var(--primary); color: var(--kf-ffffff); }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .co { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); text-align: left; cursor: pointer; }
    .co.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .co div { display: flex; flex-direction: column; font-size: 12.5px; } .co small { color: var(--muted); }
    .co-foot { flex-direction: row !important; justify-content: space-between; align-items: center; font-size: 11.5px; }
    .logo, .big-logo { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; } .big-logo { width: 54px; height: 54px; }
    .sites { display: flex; flex-direction: column; gap: 10px; } .site { display: grid; grid-template-columns: 22px 260px 1fr; gap: 10px; align-items: start; padding: 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--primary); }
    .site div { display: flex; flex-direction: column; color: var(--text); font-size: 13px; } .site small { color: var(--muted); } .chips { flex-direction: row !important; flex-wrap: wrap; gap: 4px; } .chips button { border: 0; cursor: pointer; }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 10px; }
    .d-head { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center; } .d-head h2 { margin: 0; font-size: 19px; } .d-head div { display: flex; flex-direction: column; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 20px; font-size: 12px; } .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .pill.green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .pill.amber { background: var(--kb-fef3c7); color: var(--kf-b45309); } .pill.grey { background: var(--kb-f3f4f6); color: var(--kf-6b7280); } .pill.red { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .d-tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); overflow-x: auto; }
    .d-tabs button { border: 0; background: none; padding: 8px 0; font-size: 12.5px; color: var(--kf-4b4f6b); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; } .d-tabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    h4 { margin: 0 0 8px; font-size: 13px; }
    .ov { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 7px 10px; margin: 0; font-size: 11.5px; } .facts dt { display: flex; gap: 5px; align-items: center; color: var(--kf-4b4f6b); white-space: nowrap; } .facts dd { margin: 0; overflow-wrap: break-word; min-width: 0; }
    .km { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .km div { display: grid; grid-template-columns: 30px 1fr; gap: 0 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; align-items: center; }
    .ki { grid-row: span 2; width: 30px; height: 30px; border-radius: 7px; display: grid; place-items: center; } .km b { font-size: 15px; } .km small { font-size: 10.5px; color: var(--muted); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .mini-card { border: 1px solid var(--border); border-radius: 10px; padding: 10px; } .mh { display: flex; justify-content: space-between; }
    .docs, .wk { list-style: none; margin: 0; padding: 0; } .docs li, .wk li { display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .wk li { grid-template-columns: 32px 1fr auto; } .docs div, .wk div { display: flex; flex-direction: column; } .docs small, .wk small { color: var(--muted); } .docs app-icon { color: var(--primary); }
    @media (max-width: 1250px) { .cc.with-detail { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class ContractorCompanies {
  protected readonly tabs = TABS;
  protected readonly months = MONTHS;
  protected readonly countries = COUNTRIES;
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly fd = fmtDate;
  protected readonly list = signal<Company[]>(COMPANIES.map((c) => ({ ...c })));
  protected readonly selId = signal<string | null>('C0');
  protected readonly tab = signal<(typeof TABS)[number]>('Overview');
  protected readonly view = signal<'grid' | 'list' | 'map'>('grid');
  protected readonly more = signal(false);
  protected readonly dmore = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Company Name', kind: 'icon' },
    { key: 'code', label: 'Code' },
    { key: 'trade', label: 'Trade / Service' },
    { key: 'contractType', label: 'Contract Type' },
    { key: 'start', label: 'Contract Start', fmt: fmtDate },
    { key: 'end', label: 'Contract End', fmt: fmtDate },
    { key: 'workers', label: 'Total Workers', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => this.statusTag(r.status) },
    { key: 'compliance', label: 'Compliance', fmt: (v) => `${v}%` },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Under Review', 'Inactive', 'Suspended'] },
    { key: 'contractType', label: 'Contract Type', options: ['Annual', 'Multi-Year', 'Project Based', 'Call-off'] },
    { key: 'country', label: 'Country', options: COUNTRIES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'file-text' },
    { id: 'edit', label: 'Edit', icon: 'sliders' },
    { id: 'renew', label: 'Renew contract', icon: 'refresh' },
    { id: 'suspend', label: 'Suspend', icon: 'ban', danger: true, when: (r) => r.status === 'Active' },
    { id: 'activate', label: 'Activate', icon: 'shield-check', when: (r) => r.status !== 'Active' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'export', label: 'Export' }, { id: 'suspend', label: 'Suspend', danger: true }];

  protected readonly sel = computed(() => this.list().find((c) => c.id === this.selId()) ?? null);
  protected readonly activeWorkers = computed(() => this.list().reduce((a, c) => a + c.workers, 0));
  protected readonly nonCompliant = computed(() => this.list().filter((c) => c.status !== 'Inactive' && c.compliance < 80).length);
  protected readonly onSite = computed(() => WORKERS.filter((w) => w.onSite && this.list().find((c) => c.id === w.companyId)?.status !== 'Suspended').length);
  protected readonly onSitePct = computed(() => ((this.onSite() / WORKERS.length) * 100).toFixed(1));
  protected readonly bySite = computed(() =>
    ALL_SITES.map((site) => {
      const list = this.list().filter((c) => c.sites.includes(site));
      return { site, list, companies: list.length, workers: WORKERS.filter((w) => w.site === site && w.onSite).length };
    }),
  );

  protected part(v: number, f: number) {
    return Math.round(v * f).toLocaleString();
  }
  protected statusTag(s: string) {
    return s === 'Active' ? 'tag green' : s === 'Under Review' ? 'tag amber' : s === 'Suspended' ? 'tag red' : 'tag grey';
  }
  protected pillCls(s: string) {
    return s === 'Active' ? 'green' : s === 'Under Review' ? 'amber' : s === 'Suspended' ? 'red' : 'grey';
  }
  protected compColor(v: number) {
    return v >= 88 ? 'var(--ka-16a34a)' : v >= 80 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)';
  }
  protected trend(c: Company) {
    const base = c.workers;
    return [{ name: 'Workers', color: 'var(--ka-7c3aed)', values: [0.83, 0.86, 0.9, 0.93, 0.97, 1].map((f, i) => Math.round(base * f * (1 + (i % 2 ? 0.01 : -0.01)))), area: true }];
  }
  protected compSegs(c: Company) {
    const exp = c.compliance ? Math.min(100 - c.compliance, 6) : 0;
    return [
      { label: 'Compliant', value: c.compliance, color: 'var(--ka-22c55e)' },
      { label: 'Expiring', value: exp, color: 'var(--ka-f59e0b)' },
      { label: 'Non-Compliant', value: Math.max(0, 100 - c.compliance - exp), color: 'var(--ka-ef4444)' },
    ];
  }
  protected docs(c: Company) {
    return DOC_TYPES.map((name, i) => {
      const bad = c.compliance < 80 && i % 2 === 0;
      const exp = !bad && (c.id.length + i) % 5 === 0;
      return { name, expiry: exp ? '28 Nov 2026' : '31 Dec 2027', status: bad ? 'Expired' : exp ? 'Expiring' : 'Valid', cls: bad ? 'tag red' : exp ? 'tag amber' : 'tag green' };
    });
  }
  protected workersOf(c: Company) {
    return WORKERS.filter((w) => w.companyId === c.id).slice(0, 12);
  }
  protected onSiteOf(c: Company) {
    return WORKERS.filter((w) => w.companyId === c.id && w.onSite).length;
  }
  protected workersAt(c: Company, s: string) {
    return WORKERS.filter((w) => w.companyId === c.id && w.site === s).length;
  }

  private patch(id: string, ch: Partial<Company>) {
    this.list.update((l) => l.map((c) => (c.id === id ? { ...c, ...ch } : c)));
  }
  protected act(a: string, c: Company) {
    this.dmore.set(false);
    if (a === 'view') return this.selId.set(c.id);
    if (a === 'edit') return this.openForm(c);
    if (a === 'renew') {
      const end = new Date(c.end);
      end.setFullYear(end.getFullYear() + 1);
      this.patch(c.id, { end: end.toISOString().slice(0, 10) });
      return this.toastMsg(`${c.name} renewed to ${fmtDate(end.toISOString())}`);
    }
    if (a === 'blacklist') {
      this.patch(c.id, { status: 'Suspended' });
      return this.toastMsg(`${c.name} blacklisted · all ${c.workers} worker badges suspended`);
    }
    this.patch(c.id, { status: a === 'suspend' ? 'Suspended' : 'Active' });
    this.toastMsg(`${c.name} ${a === 'suspend' ? 'suspended' : 'activated'}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.list().filter((c) => ids.includes(c.id)));
    this.list.update((l) => l.map((c) => (ids.includes(c.id) ? { ...c, status: 'Suspended' } : c)));
  }

  // ---------- Add / edit ----------
  protected readonly form = signal<Company | null>(null);
  protected readonly err = signal('');
  protected openForm(c?: Company) {
    this.dmore.set(false);
    this.err.set('');
    const today = new Date().toISOString().slice(0, 10);
    this.form.set(c ? { ...c } : { ...COMPANIES[0], id: '', code: '', name: '', trade: '', start: today, end: today, workers: 0, active: 0, status: 'Under Review', compliance: 0, contact: '', email: '', phone: '', issues: 0, sites: [] });
  }
  protected setF<K extends keyof Company>(k: K, v: Company[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim() || !f.trade.trim()) return this.err.set('Company name and trade are required.');
    if (f.id) this.patch(f.id, f);
    else {
      const n = this.list().length + 1;
      const c: Company = { ...f, id: `C${n + 100}`, code: `CMP-${String(n).padStart(3, '0')}`, initials: f.name.slice(0, 2).toUpperCase(), color: 'var(--ka-64748b)', icon: 'building', address: `${f.country}` };
      this.list.update((l) => [c, ...l]);
      this.selId.set(c.id);
    }
    this.form.set(null);
    this.toastMsg(`${f.name} saved${f.id ? '' : ' · onboarding checklist sent to ' + (f.email || 'contact')}`);
  }
  protected importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      rows.forEach((l) => {
        const [name, trade] = l.split(',').map((x) => x.trim());
        if (name) this.list.update((list) => [{ ...COMPANIES[10], id: `C${Date.now()}${name}`, code: `CMP-${list.length + 1}`, name, trade: trade || 'General', status: 'Under Review', workers: 0, active: 0, compliance: 0 }, ...list]);
      });
      this.toastMsg(`${rows.length} companies imported as Under Review`);
    };
    r.readAsText(file);
  }
  protected exportCsv(list = this.list()) {
    downloadCsv('contractor-companies.csv', [['Code', 'Company', 'Trade', 'Contract', 'Start', 'End', 'Workers', 'Status', 'Compliance %', 'Contact', 'Email'], ...list.map((c) => [c.code, c.name, c.trade, c.contractType, c.start, c.end, c.workers, c.status, c.compliance, c.contact, c.email])]);
  }
  protected reset() {
    this.more.set(false);
    this.list.set(COMPANIES.map((c) => ({ ...c })));
  }
  protected print() {
    this.more.set(false);
    window.print();
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
