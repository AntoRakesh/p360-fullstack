import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv, rng } from '../dashboards/demo-data';
import { PEOPLE } from '../people/people.data';
import { DENY_REASONS, DOORS, HISTORY, TODAY_EVENTS } from './access.data';

/* ======================= Anti-Passback & Security Rules ======================= */
interface Rule {
  id: string;
  name: string;
  desc: string;
  icon: string;
  on: boolean;
  scope: string;
  mode?: string;
  value?: number;
  unit?: string;
  hits: number;
}
interface Violation {
  id: string;
  time: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  rule: string;
  door: string;
  action: string;
  status: string;
}

@Component({
  selector: 'app-security-rules',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Anti-Passback &amp; Security Rules" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Rules that stop credential sharing, tailgating and unsafe occupancy." />
    <section class="rules">
      @for (r of rules(); track r.id) {
        <div class="card rule" [class.off]="!r.on">
          <div class="r-head">
            <span class="ic"><app-icon [name]="r.icon" [size]="18" /></span>
            <div><b>{{ r.name }}</b><small>{{ r.desc }}</small></div>
            <label class="sw"><input type="checkbox" [checked]="r.on" (change)="patch(r.id, { on: !r.on })" /><span class="switch"></span></label>
          </div>
          <div class="r-body">
            <span class="muted">Scope: {{ r.scope }}</span>
            @if (r.mode) {
              <select class="select sm" [value]="r.mode" (change)="patch(r.id, { mode: $any($event.target).value })"><option>Hard (deny)</option><option>Soft (log only)</option></select>
            }
            @if (r.value !== undefined) {
              <label class="v"><input class="input n" type="number" [value]="r.value" (change)="patch(r.id, { value: +$any($event.target).value })" /> {{ r.unit }}</label>
            }
          </div>
          <small class="hits">{{ r.hits }} triggers today</small>
        </div>
      }
    </section>
    <div class="card">
      <div class="card-head"><h3>Violations Today</h3></div>
      <app-data-table [rows]="violations()" [columns]="cols" noun="violations" [searchKeys]="['name', 'personId', 'door']" [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
    </div>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .rules { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .rule { display: flex; flex-direction: column; gap: 10px; } .rule.off { opacity: .6; }
    .r-head { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; }
    .r-head div { display: flex; flex-direction: column; font-size: 13px; } .r-head small { color: var(--muted); font-size: 11.5px; }
    .ic { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); }
    .r-body { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; }
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; } .v { display: flex; align-items: center; gap: 6px; } .n { width: 64px; padding: 4px 6px; }
    .hits { color: var(--kf-d97706); font-weight: 600; }
    .sw input { display: none; } .sw { cursor: pointer; }
    .switch { position: relative; display: inline-block; width: 34px; height: 20px; border-radius: 10px; background: var(--kb-d4d7e2); }
    .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); transition: transform .15s; }
    .sw input:checked + .switch { background: var(--primary); } .sw input:checked + .switch::after { transform: translateX(14px); }
  `,
})
export class SecurityRules {
  protected readonly toast = signal<string | null>(null);
  protected readonly rules = signal<Rule[]>([
    { id: 'apb', name: 'Anti-passback', desc: 'Must badge out before badging in again', icon: 'refresh', on: true, scope: 'All perimeter doors', mode: 'Hard (deny)', value: 30, unit: 'min reset', hits: 41 },
    { id: 'two', name: 'Two-person rule', desc: 'Two authorised people must badge within 30 s', icon: 'users', on: true, scope: 'Server Room, Data Halls', hits: 3 },
    { id: 'dual', name: 'Dual authentication', desc: 'Card + face (or PIN) required', icon: 'fingerprint', on: true, scope: 'Restricted doors (11)', hits: 18 },
    { id: 'occ', name: 'Occupancy limit', desc: 'Deny entry when zone is full', icon: 'activity', on: true, scope: 'Canteen, Labs', value: 120, unit: 'people max', hits: 6 },
    { id: 'first', name: 'First-person-in', desc: 'Lobby unlocks only after a manager badges in', icon: 'door-open', on: false, scope: 'Head Office lobby', hits: 0 },
    { id: 'tail', name: 'Tailgating detection', desc: 'Camera counts people per badge', icon: 'triangle-alert', on: true, scope: 'Turnstiles & main entrances', mode: 'Soft (log only)', hits: 9 },
    { id: 'interlock', name: 'Mantrap interlock', desc: 'Only one of two doors may be open', icon: 'shield', on: true, scope: 'Data Center security gate', hits: 1 },
    { id: 'duress', name: 'Duress PIN', desc: 'Silent alarm when PIN + 1 is entered', icon: 'siren', on: true, scope: 'All PIN readers', hits: 0 },
  ]);
  protected readonly violations = signal<Violation[]>(
    (() => {
      const r = rng(77);
      const rules = ['Anti-passback', 'Anti-passback', 'Dual authentication', 'Tailgating detection', 'Occupancy limit', 'Two-person rule'];
      const doors = ['Main Entrance', 'Lobby Turnstile 1', 'Server Room', 'R&D Lab', 'Plant Canteen', 'Data Hall A', 'Gate 2'];
      return Array.from({ length: 34 }, (_, i) => {
        const p = PEOPLE[(i * 53) % 3000];
        const rule = rules[Math.floor(r() * rules.length)];
        const t = new Date(Date.now() - (i * 19 + Math.floor(r() * 15)) * 60000);
        return {
          id: `SV-${700 + i}`, time: t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id,
          rule, door: doors[Math.floor(r() * doors.length)], action: rule === 'Tailgating detection' ? 'Logged' : 'Denied', status: i < 12 ? 'Open' : 'Reviewed',
        };
      });
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'rule', label: 'Rule' },
    { key: 'door', label: 'Door' },
    { key: 'action', label: 'Action', kind: 'tag', tag: (r) => (r.action === 'Denied' ? 'tag red' : 'tag amber') },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'rule', label: 'Rule', options: ['Anti-passback', 'Dual authentication', 'Tailgating detection', 'Occupancy limit', 'Two-person rule'] }, { key: 'status', label: 'Status', options: ['Open', 'Reviewed', 'Forgiven'] }];
  protected readonly actions: RowAction[] = [
    { id: 'forgive', label: 'Forgive (reset anti-passback)', icon: 'refresh', when: (r) => r.rule === 'Anti-passback' && r.status === 'Open' },
    { id: 'review', label: 'Mark reviewed', icon: 'shield-check', when: (r) => r.status === 'Open' },
  ];

  protected patch(id: string, c: Partial<Rule>) {
    this.rules.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r)));
  }
  protected act(a: string, v: Violation) {
    this.violations.update((l) => l.map((x) => (x.id === v.id ? { ...x, status: a === 'forgive' ? 'Forgiven' : 'Reviewed' } : x)));
    this.toast.set(a === 'forgive' ? `${v.name}'s anti-passback state reset — can badge in again` : 'Marked reviewed');
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Door Alarms & Tamper Events ======================= */
type Sev = 'Critical' | 'High' | 'Medium';
interface Alarm {
  id: string;
  time: string;
  type: string;
  door: string;
  site: string;
  severity: Sev;
  status: string;
  note: string;
}
const ALARM_TYPES: [string, Sev][] = [['Door Forced Open', 'Critical'], ['Door Held Open', 'High'], ['Reader Tamper', 'Critical'], ['Controller Offline', 'High'], ['Power Failure (on battery)', 'Medium'], ['Duress PIN', 'Critical'], ['Lock Fault', 'Medium']];

@Component({
  selector: 'app-door-alarms',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Door Alarms &amp; Tamper Events" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Forced and held doors, tamper, controller and power alarms — acknowledge and clear." />
    <section class="kpi-row">
      <app-kpi label="Active Alarms" [value]="cnt('Active')" icon="bell" color="var(--ka-ef4444)" sub="unacknowledged" />
      <app-kpi label="Acknowledged" [value]="cnt('Acknowledged')" icon="shield" color="var(--ka-f59e0b)" />
      <app-kpi label="Cleared Today" [value]="cnt('Cleared')" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="Critical" [value]="critical()" icon="siren" color="var(--ka-dc2626)" sub="forced / tamper / duress" />
      <app-kpi label="Avg. Response" value="3m 12s" icon="clock" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Alarms by Hour (24 h)</h3></div>
        <app-column-chart [labels]="hourLabels" [series]="byHour" [stacked]="true" [height]="190" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Most Alarming Doors</h3></div>
        <app-bar-list [rows]="byDoor()" [max]="byDoor()[0]?.value || 1" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="alarms()" [columns]="cols" noun="alarms" [selectable]="true" [searchKeys]="['door', 'type', 'id']" searchPlaceholder="Search door, type..." [filters]="filters"
          [actions]="actions" [bulkActions]="bulk" (action)="setStatus([$event.row.id], $event.action)" (bulk)="setStatus($event.ids, $event.action)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class DoorAlarms {
  private readonly state = inject(AppState);
  protected readonly hourLabels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  protected readonly byHour = (() => {
    const r = rng(5);
    return [
      { name: 'Held open', color: 'var(--ka-f59e0b)', values: this.hourLabels.map((_, h) => Math.round((h >= 7 && h <= 19 ? 3 : 0.5) * (0.5 + r()))) },
      { name: 'Forced / tamper', color: 'var(--ka-ef4444)', values: this.hourLabels.map((_, h) => (r() < (h < 6 ? 0.25 : 0.1) ? 1 : 0)) },
      { name: 'Device', color: 'var(--ka-8b5cf6)', values: this.hourLabels.map(() => (r() < 0.2 ? 1 : 0)) },
    ];
  })();
  protected readonly toast = signal<string | null>(null);
  private seq = 0;
  protected readonly alarms = signal<Alarm[]>(
    (() => {
      const r = rng(4040);
      const list: Alarm[] = [
        { id: 'AL-5000', time: new Date(Date.now() - 6 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), type: 'Door Held Open', door: 'Warehouse Gate', site: 'Warehouse', severity: 'High', status: 'Active', note: '' },
        { id: 'AL-5001', time: new Date(Date.now() - 14 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), type: 'Door Forced Open', door: 'Roof Access', site: 'Head Office', severity: 'Critical', status: 'Active', note: '' },
        { id: 'AL-5002', time: new Date(Date.now() - 31 * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), type: 'Controller Offline', door: 'Server Room', site: 'Head Office', severity: 'High', status: 'Acknowledged', note: 'IT on site' },
      ];
      for (let i = 3; i < 28; i++) {
        const [type, severity] = ALARM_TYPES[Math.floor(r() * ALARM_TYPES.length)];
        const d = DOORS[Math.floor(r() * DOORS.length)];
        list.push({ id: `AL-${5000 + i}`, time: new Date(Date.now() - (40 + i * 37) * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), type, door: d.name, site: d.site, severity, status: i < 6 ? 'Active' : i < 9 ? 'Acknowledged' : 'Cleared', note: i >= 9 ? 'Checked by guard' : '' });
      }
      return list;
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'type', label: 'Alarm' },
    { key: 'door', label: 'Door', sub: 'site' },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => (r.severity === 'Critical' ? 'tag red' : r.severity === 'High' ? 'tag amber' : 'tag blue') },
    { key: 'note', label: 'Note', fmt: (v) => v || '—' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Active', 'Acknowledged', 'Cleared'] }, { key: 'severity', label: 'Severity', options: ['Critical', 'High', 'Medium'] }, { key: 'type', label: 'Type', options: ALARM_TYPES.map((t) => t[0]) }];
  protected readonly actions: RowAction[] = [
    { id: 'Acknowledged', label: 'Acknowledge', icon: 'shield', when: (r) => r.status === 'Active' },
    { id: 'Cleared', label: 'Clear', icon: 'shield-check', when: (r) => r.status !== 'Cleared' },
    { id: 'dispatch', label: 'Dispatch guard', icon: 'users', when: (r) => r.status !== 'Cleared' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Acknowledged', label: 'Acknowledge' }, { id: 'Cleared', label: 'Clear' }];

  constructor() {
    // While live, a new alarm arrives roughly every 30 s.
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 12) return;
      const [type, severity] = ALARM_TYPES[t % 2];
      const d = DOORS[(t * 3) % 40];
      this.alarms.update((l) => [{ id: `AL-L${++this.seq}`, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), type, door: d.name, site: d.site, severity, status: 'Active', note: '' }, ...l]);
    });
  }

  protected readonly critical = computed(() => this.alarms().filter((a) => a.severity === 'Critical' && a.status !== 'Cleared').length);
  protected readonly byDoor = computed(() => {
    const m = new Map<string, number>();
    this.alarms().forEach((a) => m.set(a.door, (m.get(a.door) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value, display: String(value), color: 'var(--ka-ef4444)' }));
  });
  protected cnt(s: string) {
    return this.alarms().filter((a) => a.status === s).length;
  }
  protected setStatus(ids: string[], action: string) {
    const set = new Set(ids);
    if (action === 'dispatch') {
      this.alarms.update((l) => l.map((a) => (set.has(a.id) ? { ...a, status: 'Acknowledged', note: 'Guard dispatched' } : a)));
      this.toast.set('Nearest guard dispatched');
    } else {
      this.alarms.update((l) => l.map((a) => (set.has(a.id) ? { ...a, status: action, note: a.note || (action === 'Cleared' ? 'Cleared by Demo login' : 'Acknowledged') } : a)));
      this.toast.set(`${ids.length} alarm(s) ${action.toLowerCase()}`);
    }
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Access Reports & Analytics ======================= */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

@Component({
  selector: 'app-access-reports',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access Reports &amp; Analytics" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Traffic patterns, denials, door utilization and audit reports." />
    <section class="kpi-row">
      <app-kpi label="Events (7 days)" [value]="HISTORY.length.toLocaleString()" icon="door-open" color="var(--ka-8b5cf6)" />
      <app-kpi label="Denial Rate" [value]="denyRate() + '%'" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="Face Recognition Share" [value]="faceShare() + '%'" icon="user-check" color="var(--ka-22c55e)" change="6%" />
      <app-kpi label="Busiest Hour" value="08:00–09:00" icon="clock" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Traffic Heatmap</h3><span class="muted">events per hour · last 7 days</span></div>
        <app-heatmap [rows]="days" [cols]="hourCols" [data]="heat()" suffix=" events" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Denial Reasons</h3></div>
        <app-donut [segments]="reasons()" center="Denied" [size]="130" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Top Denied People</h3></div>
        <table class="table">
          <thead><tr><th>Person</th><th class="num">Denials</th><th>Main reason</th></tr></thead>
          <tbody>@for (p of topDenied(); track p.name) {<tr><td>{{ p.name }}</td><td class="num">{{ p.n }}</td><td>{{ p.reason }}</td></tr>}</tbody>
        </table>
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Busiest Doors (7 days)</h3></div>
        <app-bar-list [rows]="doorUse()" [max]="doorUse()[0].value" />
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Reports</h3></div>
        <div class="reps">
          @for (r of reports; track r.id) {
            <div class="rep"><b>{{ r.name }}</b><small>{{ r.desc }}</small><button class="btn-ghost sm" (click)="run(r.id)">Export CSV</button></div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `.reps { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; } .rep { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; } .rep small { color: var(--muted); } .rep button { align-self: flex-start; }`,
})
export class AccessReports {
  protected readonly HISTORY = HISTORY;
  protected readonly days = DAYS;
  protected readonly hourCols = ['00', '03', '06', '08', '10', '12', '14', '16', '18', '21'];
  protected readonly reports = [
    { id: 'denied', name: 'Denied Access Report', desc: 'Every denial with reason and door' },
    { id: 'person', name: 'Person Movement Report', desc: 'Events per person, first in / last out' },
    { id: 'door', name: 'Door Usage Report', desc: 'Events per door and site' },
    { id: 'after', name: 'After-hours Access', desc: 'Access between 22:00 and 06:00' },
  ];
  protected readonly denyRate = computed(() => ((HISTORY.filter((e) => e.result === 'Denied').length / HISTORY.length) * 100).toFixed(1));
  protected readonly faceShare = computed(() => Math.round((HISTORY.filter((e) => e.method === 'Face').length / HISTORY.length) * 100));
  protected readonly heat = computed(() => {
    const m = DAYS.map(() => this.hourCols.map(() => 0));
    const hrs = this.hourCols.map(Number);
    for (const e of HISTORY) {
      const d = new Date(e.ts);
      const di = (d.getDay() + 6) % 7;
      let hi = hrs.findIndex((h, i) => d.getHours() >= h && (i === hrs.length - 1 || d.getHours() < hrs[i + 1]));
      if (hi < 0) hi = 0;
      m[di][hi]++;
    }
    const max = Math.max(...m.flat(), 1);
    return m.map((row) => row.map((v) => Math.round((v / max) * 100)));
  });
  protected readonly reasons = computed(() => DENY_REASONS.map((r, i) => ({ label: r, value: HISTORY.filter((e) => e.reason === r).length, color: ['var(--ka-ef4444)', 'var(--ka-f97316)', 'var(--ka-f59e0b)', 'var(--ka-8b5cf6)', 'var(--ka-64748b)'][i] })));
  protected readonly topDenied = computed(() => {
    const m = new Map<string, { n: number; reasons: Record<string, number> }>();
    HISTORY.filter((e) => e.result === 'Denied').forEach((e) => {
      const x = m.get(e.name) ?? { n: 0, reasons: {} };
      x.n++;
      x.reasons[e.reason] = (x.reasons[e.reason] ?? 0) + 1;
      m.set(e.name, x);
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 7).map(([name, x]) => ({ name, n: x.n, reason: Object.entries(x.reasons).sort((a, b) => b[1] - a[1])[0][0] }));
  });
  protected readonly doorUse = computed(() => {
    const m = new Map<string, number>();
    HISTORY.forEach((e) => m.set(e.door, (m.get(e.door) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, display: value.toLocaleString() }));
  });
  protected run(id: string) {
    const rows =
      id === 'denied' ? HISTORY.filter((e) => e.result === 'Denied') : id === 'after' ? HISTORY.filter((e) => { const h = new Date(e.ts).getHours(); return h >= 22 || h < 6; }) : HISTORY;
    if (id === 'door') {
      const m = new Map<string, number>();
      rows.forEach((e) => m.set(`${e.door}|${e.site}`, (m.get(`${e.door}|${e.site}`) ?? 0) + 1));
      return downloadCsv('door-usage.csv', [['Door', 'Site', 'Events'], ...[...m.entries()].map(([k, n]) => [...k.split('|'), n])]);
    }
    if (id === 'person') {
      const m = new Map<string, { n: number; first: number; last: number }>();
      rows.forEach((e) => {
        const x = m.get(e.name) ?? { n: 0, first: e.ts, last: e.ts };
        m.set(e.name, { n: x.n + 1, first: Math.min(x.first, e.ts), last: Math.max(x.last, e.ts) });
      });
      return downloadCsv('person-movement.csv', [['Person', 'Events', 'First seen', 'Last seen'], ...[...m.entries()].map(([k, x]) => [k, x.n, new Date(x.first).toISOString(), new Date(x.last).toISOString()])]);
    }
    downloadCsv(`${id}-access.csv`, [['Time', 'Person', 'Door', 'Site', 'Event', 'Reason'], ...rows.map((e) => [new Date(e.ts).toISOString(), e.name, e.door, e.site, e.kind, e.reason])]);
  }
}

export const TODAY = TODAY_EVENTS;
