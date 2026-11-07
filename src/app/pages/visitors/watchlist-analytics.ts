import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { dayLabels, downloadCsv } from '../dashboards/demo-data';
import { VisitorStore } from './visitor-store';
import { HISTORY_VISITS, PURPOSES, Visit, WatchEntry } from './visitors.data';

/* ======================= Watchlist & Blacklist ======================= */
@Component({
  selector: 'app-watchlist',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Watchlist &amp; Blacklist" parent="Visitor Management" parentLink="/visitor-management" subtitle="People to block, flag or welcome specially — checked automatically at registration.">
      <button class="btn-primary" (click)="form.set(true)"><app-icon name="plus" [size]="16" />Add Entry</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Blacklisted" [value]="cnt('Blacklist')" icon="ban" color="#ef4444" />
      <app-kpi label="Watchlist" [value]="cnt('Watchlist')" icon="triangle-alert" color="#f59e0b" />
      <app-kpi label="VIP Alerts" [value]="cnt('VIP alert')" icon="star" color="#a16207" />
      <app-kpi label="Matches (30 days)" [value]="matches()" icon="shield" color="#8b5cf6" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="store.watchlist()" [columns]="cols" noun="entries" [searchKeys]="['name', 'idNumber', 'reason']" searchPlaceholder="Search name, ID, reason..." [filters]="filters"
          [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Screening Test</h3></div>
        <p class="muted">Type a name to see what reception would see at registration.</p>
        <input class="input full" placeholder="e.g. Victor Kane" [value]="q()" (input)="q.set($any($event.target).value)" />
        @if (q().trim()) {
          @if (hit(); as w) {
            <div class="res" [attr.data-t]="w.type"><b>{{ w.type === 'Blacklist' ? '⛔ Blocked' : w.type === 'Watchlist' ? '⚠ Flag for review' : '★ VIP — notify protocol' }}</b><span>{{ w.name }} · {{ w.reason }}</span><small>Added by {{ w.addedBy }} on {{ w.added }}</small></div>
          } @else {
            <div class="res ok"><b>✓ No match</b><span>Registration can continue.</span></div>
          }
        }
      </div>
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add(n.value, t.value, r.value, id.value, e.value)">
        <div class="modal-head"><h3>Add Watchlist Entry</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label>Full name *<input #n class="input" required /></label>
          <label>List<select #t class="select"><option>Blacklist</option><option>Watchlist</option><option>VIP alert</option></select></label>
          <label class="full">Reason *<input #r class="input" required /></label>
          <label>ID / passport number<input #id class="input" /></label>
          <label>Expires (blank = never)<input #e class="input" type="date" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Add</button></div>
      </form>
    }
  `,
  styles: `
    .full { width: 100%; }
    .res { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; padding: 12px; border-radius: 10px; font-size: 13px; background: #fef2f2; color: #991b1b; }
    .res[data-t='Watchlist'] { background: #fffbeb; color: #92400e; } .res[data-t='VIP alert'] { background: #fefce8; color: #854d0e; } .res.ok { background: #f0fdf4; color: #166534; }
    .res b { font-size: 16px; } .res small { opacity: .8; }
  `,
})
export class Watchlist {
  protected readonly store = inject(VisitorStore);
  protected readonly q = signal('');
  protected readonly form = signal(false);
  protected readonly hit = computed(() => this.store.screen(this.q()));
  protected readonly matches = computed(() => this.store.watchlist().reduce((a, w) => a + w.matches, 0));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'List', kind: 'tag', tag: (r) => (r.type === 'Blacklist' ? 'tag red' : r.type === 'Watchlist' ? 'tag amber' : 'tag') },
    { key: 'reason', label: 'Reason' },
    { key: 'idNumber', label: 'ID number' },
    { key: 'addedBy', label: 'Added by' },
    { key: 'expiry', label: 'Expires', fmt: (v) => v || 'Never' },
    { key: 'matches', label: 'Matches', kind: 'num' },
  ];
  protected readonly filters = [{ key: 'type', label: 'List', options: ['Blacklist', 'Watchlist', 'VIP alert'] }];
  protected readonly actions: RowAction[] = [
    { id: 'move', label: 'Move to watchlist', icon: 'triangle-alert', when: (r) => r.type === 'Blacklist' },
    { id: 'remove', label: 'Remove', icon: 'ban', danger: true },
  ];
  protected cnt(t: string) {
    return this.store.watchlist().filter((w) => w.type === t).length;
  }
  protected act(a: string, w: WatchEntry) {
    if (a === 'remove') this.store.watchlist.update((l) => l.filter((x) => x.id !== w.id));
    else this.store.watchlist.update((l) => l.map((x) => (x.id === w.id ? { ...x, type: 'Watchlist' } : x)));
  }
  protected add(name: string, type: string, reason: string, idNumber: string, expiry: string) {
    this.store.watchlist.update((l) => [{ id: `WL-${400 + l.length}`, name, initials: name.slice(0, 2).toUpperCase(), type: type as WatchEntry['type'], reason, idNumber: idNumber || '—', addedBy: 'Demo login', added: new Date().toISOString().slice(0, 10), expiry, matches: 0 }, ...l]);
    this.form.set(false);
  }
}

/* ======================= Visitor Analytics & Reports ======================= */
@Component({
  selector: 'app-visitor-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Analytics &amp; Reports" parent="Visitor Management" parentLink="/visitor-management" subtitle="Visitor volumes, patterns and service levels over time." />
    <section class="kpi-row">
      <app-kpi label="Visits (30 days)" [value]="last30().length.toLocaleString()" icon="users" color="#8b5cf6" change="8%" />
      <app-kpi label="Avg. Visit Length" [value]="avgStay()" icon="clock" color="#3b82f6" />
      <app-kpi label="Pre-registered Share" value="54%" icon="calendar-days" color="#22c55e" change="6%" />
      <app-kpi label="No-show Rate" [value]="noShow() + '%'" icon="ban" color="#ef4444" />
      <app-kpi label="Avg. Check-in Time" value="48 s" icon="activity" color="#f97316" sub="kiosk + reception" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Daily Visits</h3><span class="muted">last 30 days</span></div>
        <app-column-chart [labels]="labels" [series]="daily()" [stacked]="true" [height]="220" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Purpose Mix</h3></div>
        <app-donut [segments]="purposeMix()" center="Visits" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Arrival Heatmap</h3><span class="muted">weekday × hour, % of busiest</span></div>
        <app-heatmap [rows]="days" [cols]="hourCols" [data]="heat()" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Top Visiting Companies</h3></div>
        <app-bar-list [rows]="companies()" [max]="companies()[0].value" />
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Reports</h3></div>
        <div class="reps">
          @for (r of reports; track r.id) {<div class="rep"><b>{{ r.name }}</b><small>{{ r.desc }}</small><button class="btn-ghost sm" (click)="run(r.id)">Export CSV</button></div>}
        </div>
      </div>
    </section>
  `,
  styles: `.reps { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; } .rep { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; } .rep small { color: var(--muted); } .rep button { align-self: flex-start; }`,
})
export class VisitorAnalytics {
  private readonly store = inject(VisitorStore);
  protected readonly labels = dayLabels(30, new Date());
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly hourCols = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];
  protected readonly reports = [
    { id: 'all', name: 'Visitor Register', desc: 'All visits with host, times and status' },
    { id: 'company', name: 'Visits by Company', desc: 'Visit counts per company' },
    { id: 'host', name: 'Visits by Host', desc: 'Visitors received per employee' },
    { id: 'noshow', name: 'No-shows & Rejections', desc: 'Visits that did not happen' },
  ];
  protected readonly last30 = computed(() => HISTORY_VISITS.filter((v) => v.expected > Date.now() - 30 * 86400000));
  protected readonly avgStay = computed(() => {
    const c = this.last30().filter((v) => v.checkIn && v.checkOut);
    const m = c.reduce((s, v) => s + (v.checkOut! - v.checkIn!), 0) / (c.length || 1) / 60000;
    return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  });
  protected readonly noShow = computed(() => ((this.last30().filter((v) => v.status === 'No-show').length / this.last30().length) * 100).toFixed(1));
  protected readonly daily = computed(() => {
    const all = [...HISTORY_VISITS, ...this.store.visits()];
    const groups = ['Business Meeting', 'Delivery', 'Other'];
    const colors = ['#7c3aed', '#38bdf8', '#c4b5fd'];
    return groups.map((g, gi) => ({
      name: g,
      color: colors[gi],
      values: Array.from({ length: 30 }, (_, i) => {
        const start = new Date().setHours(0, 0, 0, 0) - (29 - i) * 86400000;
        return all.filter((v) => v.expected >= start && v.expected < start + 86400000 && (g === 'Other' ? !groups.slice(0, 2).includes(v.purpose) : v.purpose === g)).length;
      }),
    }));
  });
  protected readonly purposeMix = computed(() => PURPOSES.map((p, i) => ({ label: p, value: this.last30().filter((v) => v.purpose === p).length, color: ['#7c3aed', '#3b82f6', '#22c55e', '#f97316', '#ef4444', '#ec4899', '#0ea5e9', '#9ca3af'][i] })));
  protected readonly heat = computed(() => {
    const m = this.days.map(() => this.hourCols.map(() => 0));
    for (const v of HISTORY_VISITS) {
      const d = new Date(v.expected);
      const hi = this.hourCols.indexOf(String(d.getHours()).padStart(2, '0'));
      if (hi >= 0) m[(d.getDay() + 6) % 7][hi]++;
    }
    const max = Math.max(...m.flat(), 1);
    return m.map((r) => r.map((x) => Math.round((x / max) * 100)));
  });
  protected readonly companies = computed(() => {
    const m = new Map<string, number>();
    this.last30().forEach((v) => m.set(v.company, (m.get(v.company) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, display: String(value) }));
  });
  protected run(id: string) {
    const all: Visit[] = [...this.store.visits(), ...HISTORY_VISITS];
    if (id === 'company' || id === 'host') {
      const key = id === 'company' ? 'company' : 'host';
      const m = new Map<string, number>();
      all.forEach((v) => m.set(v[key], (m.get(v[key]) ?? 0) + 1));
      return downloadCsv(`visits-by-${key}.csv`, [[key === 'company' ? 'Company' : 'Host', 'Visits'], ...[...m.entries()].sort((a, b) => b[1] - a[1])]);
    }
    const rows = id === 'noshow' ? all.filter((v) => v.status === 'No-show' || v.status === 'Rejected') : all;
    downloadCsv(`visitor-${id}.csv`, [['Visit ID', 'Date', 'Visitor', 'Company', 'Purpose', 'Host', 'Status'], ...rows.map((v) => [v.id, new Date(v.expected).toISOString().slice(0, 10), v.name, v.company, v.purpose, v.host, v.status])]);
  }
}
