import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { dayLabels, rng, series } from '@p360/shared/data/demo-data';
import { PEOPLE, Person } from '@p360/shared/data/people.data';

const d = (offsetDays: number) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const HOSTS = ['Priya Sharma', 'Arjun Mehta', 'David Lee', 'Fatima Al Mansoori', 'Chen Wei', 'Omar Khalid'];
const PURPOSES = ['Meeting', 'Interview', 'Delivery', 'Maintenance', 'Audit', 'Training'];

/* ======================= Visitor Profiles ======================= */
type Visitor = Person & { visits: number; lastVisit: string; host: string; purpose: string; watch: string; nda: string };
const VISITORS: Visitor[] = (() => {
  const r = rng(51);
  const base = PEOPLE.filter((p) => p.type === 'Visitor');
  // Extra historical visitor profiles (people who visited before but are not on site today).
  const extra = Array.from({ length: 916 }, (_, i) => ({ ...base[i % base.length], id: `VIS-${String(2000 + i)}`, name: base[(i * 7) % base.length].name.split(' ')[0] + ' ' + base[(i * 3) % base.length].name.split(' ')[1] }));
  return [...base, ...extra].map((p) => {
    const w = r();
    return {
      ...p,
      visits: 1 + Math.floor(r() * r() * 24),
      lastVisit: d(Math.floor(r() * 120)),
      host: HOSTS[Math.floor(r() * HOSTS.length)],
      purpose: PURPOSES[Math.floor(r() * PURPOSES.length)],
      watch: w < 0.012 ? 'Watchlisted' : w < 0.02 ? 'Blacklisted' : 'Clear',
      nda: r() < 0.7 ? 'Signed' : 'Not signed',
    };
  });
})();

@Component({
  selector: 'app-visitor-profiles',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Profiles" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Returning visitor profiles, visit history, hosts and watchlist status." />
    <section class="kpi-row">
      <app-kpi label="Visitor Profiles" [value]="list().length.toLocaleString()" icon="user-plus" color="var(--ka-3b82f6)" change="9%" sub="vs. last month" />
      <app-kpi label="Frequent Visitors" [value]="frequent()" icon="star" color="var(--ka-8b5cf6)" sub="5+ visits" />
      <app-kpi label="Visited This Month" [value]="thisMonth()" icon="calendar-days" color="var(--ka-22c55e)" />
      <app-kpi label="Watchlist / Blacklist" [value]="flagged()" icon="ban" color="var(--ka-ef4444)" sub="flagged profiles" />
      <app-kpi label="NDA Signed" [value]="nda() + '%'" icon="file-check" color="var(--ka-06b6d4)" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Daily Visits <span class="card-sub">last 30 days</span></h3></div>
        <app-line-chart [labels]="labels" [series]="visits" [height]="210" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Visit Purpose</h3></div>
        <app-donut [segments]="purpose()" center="Profiles" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="visitors" [searchKeys]="['name', 'company', 'email', 'host']"
          searchPlaceholder="Search visitor, company, host..." [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class VisitorProfiles {
  protected readonly list = signal<Visitor[]>(VISITORS);
  protected readonly toast = signal<string | null>(null);
  protected readonly labels = dayLabels(30, new Date());
  protected readonly visits = [{ name: 'Visits', color: 'var(--ka-3b82f6)', values: series(30, 260, 90, 3).map((v, i) => (i % 7 === 5 || i % 7 === 6 ? Math.round(v / 4) : v)), area: true }];
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Visitor', kind: 'person', sub: 'email' },
    { key: 'company', label: 'Company' },
    { key: 'visits', label: 'Visits', kind: 'num' },
    { key: 'lastVisit', label: 'Last Visit', fmt: shortDate },
    { key: 'host', label: 'Usual Host' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'nda', label: 'NDA', kind: 'tag', tag: (r) => (r.nda === 'Signed' ? 'tag green' : 'tag grey') },
    { key: 'watch', label: 'Watchlist', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'purpose', label: 'Purpose', options: PURPOSES },
    { key: 'watch', label: 'Watchlist', options: ['Clear', 'Watchlisted', 'Blacklisted'] },
    { key: 'nda', label: 'NDA', options: ['Signed', 'Not signed'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'invite', label: 'Send new invitation', icon: 'message' },
    { id: 'watch', label: 'Add to watchlist', icon: 'triangle-alert', when: (r) => r.watch === 'Clear' },
    { id: 'black', label: 'Blacklist', icon: 'ban', danger: true, when: (r) => r.watch !== 'Blacklisted' },
    { id: 'clear', label: 'Clear flag', icon: 'shield-check', when: (r) => r.watch !== 'Clear' },
  ];
  protected readonly frequent = computed(() => String(this.list().filter((v) => v.visits >= 5).length));
  protected readonly thisMonth = computed(() => String(this.list().filter((v) => v.lastVisit >= d(30)).length));
  protected readonly flagged = computed(() => String(this.list().filter((v) => v.watch !== 'Clear').length));
  protected readonly nda = computed(() => Math.round((this.list().filter((v) => v.nda === 'Signed').length / this.list().length) * 100));
  protected readonly purpose = computed(() =>
    PURPOSES.map((label, i) => ({ label, value: this.list().filter((v) => v.purpose === label).length, color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c1a0)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-9ca3af)'][i] })),
  );
  protected act(a: string, v: Visitor) {
    if (a === 'invite') return this.notify(`Invitation sent to ${v.email}`);
    const watch = a === 'watch' ? 'Watchlisted' : a === 'black' ? 'Blacklisted' : 'Clear';
    this.list.update((l) => l.map((x) => (x.id === v.id ? { ...x, watch } : x)));
    this.notify(`${v.name}: ${watch}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Customer Profiles ======================= */
interface Customer {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  email: string;
  segment: string;
  visits: number;
  lastVisit: string;
  store: string;
  spend: number;
  consent: string;
}
const SEGMENTS = ['VIP', 'Gold', 'Silver', 'New'];
const STORES = ['Dubai Mall', 'Mall of the Emirates', 'Yas Mall', 'City Centre Deira', 'Ibn Battuta'];
const CUSTOMERS: Customer[] = (() => {
  const r = rng(7);
  const names = PEOPLE.slice(200, 1400).map((p) => p.name);
  return names.map((name, i) => {
    const s = r();
    const segment = s < 0.05 ? 'VIP' : s < 0.2 ? 'Gold' : s < 0.55 ? 'Silver' : 'New';
    const visits = segment === 'VIP' ? 30 + Math.floor(r() * 40) : segment === 'Gold' ? 12 + Math.floor(r() * 20) : segment === 'Silver' ? 4 + Math.floor(r() * 8) : 1 + Math.floor(r() * 3);
    return {
      id: `CUS-${String(40001 + i)}`,
      name,
      initials: name.split(' ').map((x) => x[0]).join('').slice(0, 2),
      avatar: ['var(--ka-7c3aed)', 'var(--ka-0d9488)', 'var(--ka-ca8a04)', 'var(--ka-db2777)', 'var(--ka-2563eb)'][i % 5],
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@mail.com`,
      segment,
      visits,
      lastVisit: d(Math.floor(r() * 90)),
      store: STORES[Math.floor(r() * STORES.length)],
      spend: Math.round(visits * (80 + r() * 400)),
      consent: r() < 0.78 ? 'Yes' : 'No',
    };
  });
})();

@Component({
  selector: 'app-customer-profiles',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Customer Profiles" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Known customers from loyalty programs, store visits and consented face recognition." />
    <section class="kpi-row">
      <app-kpi label="Customer Profiles" [value]="list().length.toLocaleString()" icon="users" color="var(--ka-8b5cf6)" change="6%" sub="vs. last month" />
      <app-kpi label="VIP Customers" [value]="seg('VIP')" icon="star" color="var(--ka-f59e0b)" />
      <app-kpi label="Avg. Visits" [value]="avgVisits()" icon="activity" color="var(--ka-3b82f6)" sub="per customer" />
      <app-kpi label="Lifetime Spend" [value]="'AED ' + spend()" icon="trending-up" color="var(--ka-22c55e)" change="11%" />
      <app-kpi label="Marketing Consent" [value]="consent() + '%'" icon="shield-check" color="var(--ka-06b6d4)" />
    </section>
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Segments</h3></div>
        <app-donut [segments]="segments()" center="Customers" [size]="130" />
      </div>
      <div class="card span-8">
        <div class="card-head"><h3>Known Customer Footfall <span class="card-sub">last 30 days</span></h3></div>
        <app-column-chart [labels]="labels" [series]="footfall" [height]="210" [legend]="false" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="customers" [searchKeys]="['name', 'id', 'email']" searchPlaceholder="Search customer, ID, email..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class CustomerProfiles {
  protected readonly list = signal<Customer[]>(CUSTOMERS);
  protected readonly toast = signal<string | null>(null);
  protected readonly labels = dayLabels(30, new Date());
  protected readonly footfall = [{ name: 'Known customers', color: 'var(--ka-8b5cf6)', values: series(30, 420, 140, 12).map((v, i) => (i % 7 >= 4 ? Math.round(v * 1.5) : v)) }];
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Customer', kind: 'person', sub: 'email' },
    { key: 'id', label: 'ID' },
    { key: 'segment', label: 'Segment', kind: 'tag', tag: (r) => ({ VIP: 'tag amber', Gold: 'tag', Silver: 'tag grey', New: 'tag blue' })[r.segment as string] ?? 'tag' },
    { key: 'visits', label: 'Visits', kind: 'num' },
    { key: 'lastVisit', label: 'Last Visit', fmt: shortDate },
    { key: 'store', label: 'Favourite Store' },
    { key: 'spend', label: 'Spend (AED)', kind: 'num' },
    { key: 'consent', label: 'Consent', kind: 'tag', tag: (r) => (r.consent === 'Yes' ? 'tag green' : 'tag grey') },
  ];
  protected readonly filters = [
    { key: 'segment', label: 'Segment', options: SEGMENTS },
    { key: 'store', label: 'Store', options: STORES },
    { key: 'consent', label: 'Consent', options: ['Yes', 'No'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'upgrade', label: 'Upgrade segment', icon: 'arrow-up', when: (r) => r.segment !== 'VIP' },
    { id: 'offer', label: 'Send offer', icon: 'message', when: (r) => r.consent === 'Yes' },
    { id: 'delete', label: 'Erase data (GDPR)', icon: 'ban', danger: true },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'offer', label: 'Send offer' }, { id: 'delete', label: 'Erase data', danger: true }];
  protected readonly segments = computed(() => SEGMENTS.map((label, i) => ({ label, value: +this.seg(label), color: ['var(--ka-f59e0b)', 'var(--ka-7c3aed)', 'var(--ka-9ca3af)', 'var(--ka-3b82f6)'][i] })));
  protected readonly avgVisits = computed(() => (this.list().reduce((a, c) => a + c.visits, 0) / this.list().length).toFixed(1));
  protected readonly spend = computed(() => `${(this.list().reduce((a, c) => a + c.spend, 0) / 1e6).toFixed(1)}M`);
  protected readonly consent = computed(() => Math.round((this.list().filter((c) => c.consent === 'Yes').length / this.list().length) * 100));

  protected seg(s: string) {
    return String(this.list().filter((c) => c.segment === s).length);
  }
  protected act(a: string, c: Customer) {
    this.bulkAct(a, [c.id]);
  }
  protected bulkAct(a: string, ids: string[]) {
    const set = new Set(ids);
    if (a === 'delete') this.list.update((l) => l.filter((c) => !set.has(c.id)));
    if (a === 'upgrade') this.list.update((l) => l.map((c) => (set.has(c.id) ? { ...c, segment: SEGMENTS[Math.max(0, SEGMENTS.indexOf(c.segment) - 1)] } : c)));
    this.toast.set(a === 'delete' ? `${ids.length} profile(s) erased` : a === 'offer' ? `Offer sent to ${ids.length} customer(s)` : 'Segment upgraded');
    setTimeout(() => this.toast.set(null), 2000);
  }
}
