import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { NAMES, SITE_NAMES } from './demo-data';

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type Status = 'Open' | 'Acknowledged' | 'In Progress' | 'Resolved';
interface LogEntry {
  time: string;
  text: string;
}
interface Alert {
  id: string;
  title: string;
  source: string;
  site: string;
  location: string;
  severity: Severity;
  status: Status;
  time: string;
  assignee: string | null;
  log: LogEntry[];
}

const SEV_COLOR: Record<Severity, string> = { Critical: 'var(--ka-dc2626)', High: 'var(--ka-f97316)', Medium: 'var(--ka-3b82f6)', Low: 'var(--ka-6b7280)' };
const ASSIGNEES = ['Security Desk', 'Omar Khalid', 'Li Wei', 'Ravi Shankar', 'HSE Team', 'IT Support'];
const SEED: [string, string, Severity, string, string, Status][] = [
  ['Restricted zone intrusion', 'Access Control', 'Critical', 'Head Office', 'Server Room - F1', 'Open'],
  ['Panic alert (wearable)', 'RTLS', 'Critical', 'Warehouse', 'Zone B', 'Acknowledged'],
  ['Blocked fire exit S2', 'Safety Inspection', 'Critical', 'Warehouse', 'Fire Exit S2', 'In Progress'],
  ['Door forced open', 'Access Control', 'High', 'Head Office', 'Server Room door', 'Open'],
  ['Door held open > 2 min', 'Access Control', 'High', 'Logistics Hub', 'Loading Bay', 'Open'],
  ['Tailgating detected', 'Video Analytics', 'High', 'Manufacturing', 'Turnstile 2', 'Open'],
  ['Visitor overstay', 'Visitor Mgmt', 'Medium', 'Head Office', 'Reception', 'Open'],
  ['Expired contractor permit used', 'Contractor Mgmt', 'Medium', 'Manufacturing', 'Gate 2', 'Acknowledged'],
  ['RTLS gateway offline', 'Device Health', 'Medium', 'Retail Stores', 'Store 7', 'Open'],
  ['Biometric kiosk low accuracy', 'Device Health', 'Low', 'Head Office', 'Kiosk 3', 'Open'],
  ['Late arrival spike', 'Attendance', 'Low', 'Logistics Hub', 'Gate 2', 'Resolved'],
  ['Canteen capacity exceeded', 'Occupancy', 'Low', 'Head Office', 'Canteen L1', 'Resolved'],
];
const LIVE_POOL: [string, string, Severity, string][] = [
  ['Access denied x5 (same badge)', 'Access Control', 'Medium', 'Lab A'],
  ['Unknown face at entrance', 'Face Recognition', 'High', 'Main Entrance'],
  ['Wearable fall detected', 'RTLS', 'Critical', 'Production Line'],
  ['Camera tamper', 'Video Analytics', 'High', 'Parking P2'],
];

const now = (offsetMin = 0) => new Date(Date.now() - offsetMin * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

@Component({
  selector: 'app-alerts-center',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Alerts &amp; Action Center">
      <button class="btn-outline" [disabled]="!selectedIds().size" (click)="bulk('Acknowledged')">Acknowledge selected ({{ selectedIds().size }})</button>
      <button class="btn-ghost" [disabled]="!selectedIds().size" (click)="bulk('Resolved')">Resolve selected</button>
    </app-page-head>

    <section class="sev-row">
      @for (s of sevs; track s) {
        <button class="card sev" [class.on]="sev() === s" [style.border-left-color]="sevColor[s]" (click)="sev.set(sev() === s ? null : s)">
          <span>{{ s }}</span>
          <b [style.color]="sevColor[s]">{{ countSev(s) }}</b>
          <small>active</small>
        </button>
      }
      <div class="card sev mttr">
        <span>Mean time to resolve</span>
        <b>18 min</b>
        <small>last 7 days</small>
      </div>
    </section>

    <section class="layout" [class.has-detail]="!!active()">
      <div class="card">
        <div class="card-head">
          <div class="tabs">
            @for (t of statusTabs; track t) {
              <button [class.on]="status() === t" (click)="status.set(t)">{{ t }}<span class="count">{{ countStatus(t) }}</span></button>
            }
          </div>
          <label class="search-box">
            <app-icon name="search" [size]="15" />
            <input placeholder="Search alerts" [value]="q()" (input)="q.set($any($event.target).value)" />
          </label>
        </div>
        <div class="table-wrap list">
          <table class="table">
            <thead>
              <tr>
                <th><input type="checkbox" [checked]="allChecked()" (change)="toggleAll()" /></th>
                <th>Severity</th><th>Alert</th><th>Site / Location</th><th>Source</th><th>Time</th><th>Status</th><th>Assignee</th>
              </tr>
            </thead>
            <tbody>
              @for (a of shown(); track a.id) {
                <tr class="clickable row-in" [class.selected]="active()?.id === a.id" (click)="activeId.set(a.id)">
                  <td (click)="$event.stopPropagation()"><input type="checkbox" [checked]="selectedIds().has(a.id)" (change)="toggleSel(a.id)" /></td>
                  <td><span class="dot-sm" [style.background]="sevColor[a.severity]"></span>{{ a.severity }}</td>
                  <td><b>{{ a.title }}</b><div class="muted">{{ a.id }}</div></td>
                  <td>{{ a.site }}<div class="muted">{{ a.location }}</div></td>
                  <td>{{ a.source }}</td>
                  <td>{{ a.time }}</td>
                  <td><span class="tag" [class]="statusClass[a.status]">{{ a.status }}</span></td>
                  <td>{{ a.assignee ?? '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty-note">No alerts match. 🎉</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (active(); as a) {
        <aside class="card detail">
          <div class="card-head">
            <span class="tag" [style.background]="'color-mix(in srgb, ' + sevColor[a.severity] + ' 12%, transparent)'" [style.color]="sevColor[a.severity]">{{ a.severity }}</span>
            <button class="close-btn" (click)="activeId.set(null)">×</button>
          </div>
          <h3>{{ a.title }}</h3>
          <p class="muted">{{ a.id }} · {{ a.source }}</p>
          <dl class="kv">
            <dt>Site</dt><dd>{{ a.site }}</dd>
            <dt>Location</dt><dd>{{ a.location }}</dd>
            <dt>Raised</dt><dd>{{ a.time }}</dd>
            <dt>Status</dt><dd><span class="tag" [class]="statusClass[a.status]">{{ a.status }}</span></dd>
            <dt>Assignee</dt>
            <dd>
              <select class="select" [value]="a.assignee ?? ''" (change)="assign(a, $any($event.target).value)">
                <option value="">Unassigned</option>
                @for (p of assignees; track p) {
                  <option [value]="p">{{ p }}</option>
                }
              </select>
            </dd>
          </dl>
          <div class="toolbar">
            @if (a.status === 'Open') {
              <button class="btn-primary btn-sm" (click)="setStatus(a, 'Acknowledged')">Acknowledge</button>
            }
            @if (a.status !== 'Resolved' && a.status !== 'In Progress') {
              <button class="btn-ghost sm" (click)="setStatus(a, 'In Progress')">Start work</button>
            }
            @if (a.status !== 'Resolved') {
              <button class="btn-ghost sm" (click)="setStatus(a, 'Resolved', note.value); note.value = ''">Resolve</button>
            } @else {
              <button class="btn-ghost sm" (click)="setStatus(a, 'Open')">Reopen</button>
            }
          </div>
          <textarea #note class="input note" rows="2" placeholder="Add a note (saved with the next action)"></textarea>
          <button class="link" (click)="addNote(a, note.value); note.value = ''">Add note</button>
          <h4>Activity</h4>
          <ol class="timeline">
            @for (l of a.log; track $index) {
              <li><time>{{ l.time }}</time>{{ l.text }}</li>
            }
          </ol>
        </aside>
      }
    </section>
  `,
  styles: `
    .sev-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .sev { display: flex; flex-direction: column; gap: 2px; border-left: 4px solid; text-align: left; cursor: pointer; font-family: inherit; }
    .sev.on { box-shadow: 0 0 0 2px var(--primary-soft); }
    .sev span { font-size: 12.5px; color: var(--kf-4b4f6b); } .sev b { font-size: 26px; } .sev small { font-size: 11.5px; color: var(--muted); }
    .mttr { border-left-color: var(--primary); cursor: default; } .mttr b { color: var(--primary); }
    .layout { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
    .layout.has-detail { grid-template-columns: minmax(0, 1fr) 360px; }
    .list { max-height: 620px; }
    .detail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 8px; }
    .detail h3 { font-size: 17px; } .detail p { margin: 0; }
    .detail h4 { margin: 10px 0 0; font-size: 13px; }
    .kv { display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center; font-size: 13px; margin: 6px 0; }
    .kv dt { color: var(--muted); } .kv dd { margin: 0; } .kv .select { width: 100%; }
    .note { width: 100%; resize: vertical; }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 12px; border-left: 2px solid var(--kl-ede9fe); font-size: 12.5px; }
    .timeline li { position: relative; padding: 4px 0 8px 8px; }
    .timeline li::before { content: ''; position: absolute; left: -18px; top: 8px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); }
    .timeline time { display: block; font-size: 11px; color: var(--muted); }
    .row-in { animation: rowin 0.6s ease; }
    @keyframes rowin { from { background: var(--kb-fef2f2); } }
    @media (max-width: 1100px) { .layout.has-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class AlertsCenter {
  private readonly state = inject(AppState);
  protected readonly sevs: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
  protected readonly sevColor = SEV_COLOR;
  protected readonly statusTabs = ['Active', 'Open', 'Acknowledged', 'In Progress', 'Resolved', 'All'];
  protected readonly statusClass: Record<Status, string> = { Open: 'tag red', Acknowledged: 'tag amber', 'In Progress': 'tag blue', Resolved: 'tag green' };
  protected readonly assignees = ASSIGNEES;
  protected readonly sev = signal<Severity | null>(null);
  protected readonly status = signal('Active');
  protected readonly q = signal('');
  protected readonly activeId = signal<string | null>(null);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  private seq = 2300;
  private lastTick = 0;

  protected readonly alerts = signal<Alert[]>(
    SEED.map(([title, source, severity, site, location, status], i) => ({
      id: `ALR-${2288 - i}`,
      title,
      source,
      severity,
      site,
      location,
      status,
      time: now(i * 7 + 2),
      assignee: status === 'Open' ? null : ASSIGNEES[i % ASSIGNEES.length],
      log: [{ time: now(i * 7 + 2), text: `Raised by ${source}` }, ...(status !== 'Open' ? [{ time: now(i * 7), text: `${status} by ${ASSIGNEES[i % ASSIGNEES.length]}` }] : [])],
    })),
  );

  constructor() {
    // While live, a new alert arrives roughly every 25 seconds.
    effect(() => {
      const t = this.state.tick();
      if (t && t - this.lastTick >= 10) {
        this.lastTick = t;
        const [title, source, severity, location] = LIVE_POOL[t % LIVE_POOL.length];
        const site = SITE_NAMES[t % 3];
        this.alerts.update((list) => [
          { id: `ALR-${this.seq++}`, title, source, severity, site, location, status: 'Open', time: now(), assignee: null, log: [{ time: now(), text: `Raised by ${source}` }] },
          ...list,
        ]);
      }
    });
  }

  private readonly inSite = computed(() => {
    const s = this.state.site();
    return this.alerts().filter((a) => s.factor === 1 || a.site === s.name);
  });
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.inSite().filter(
      (a) =>
        this.matchStatus(a, this.status()) &&
        (!this.sev() || a.severity === this.sev()) &&
        (!q || `${a.title} ${a.location} ${a.id} ${a.source}`.toLowerCase().includes(q)),
    );
  });
  protected readonly active = computed(() => this.alerts().find((a) => a.id === this.activeId()) ?? null);
  protected readonly allChecked = computed(() => this.shown().length > 0 && this.shown().every((a) => this.selectedIds().has(a.id)));

  protected countSev(s: Severity) {
    return this.inSite().filter((a) => a.severity === s && a.status !== 'Resolved').length;
  }
  protected countStatus(t: string) {
    return this.inSite().filter((a) => this.matchStatus(a, t)).length;
  }
  private matchStatus(a: Alert, t: string) {
    return t === 'All' || (t === 'Active' ? a.status !== 'Resolved' : a.status === t);
  }
  protected toggleSel(id: string) {
    this.selectedIds.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected toggleAll() {
    const all = this.allChecked();
    this.selectedIds.set(all ? new Set() : new Set(this.shown().map((a) => a.id)));
  }
  protected setStatus(a: Alert, status: Status, note = '') {
    this.update(a.id, (x) => ({
      ...x,
      status,
      assignee: x.assignee ?? (status !== 'Open' ? 'Demo login' : null),
      log: [...x.log, { time: now(), text: `${status} by Demo login${note ? ` — “${note}”` : ''}` }],
    }));
  }
  protected assign(a: Alert, who: string) {
    this.update(a.id, (x) => ({ ...x, assignee: who || null, log: [...x.log, { time: now(), text: who ? `Assigned to ${who}` : 'Unassigned' }] }));
  }
  protected addNote(a: Alert, note: string) {
    if (note.trim()) this.update(a.id, (x) => ({ ...x, log: [...x.log, { time: now(), text: `Note: ${note}` }] }));
  }
  protected bulk(status: Status) {
    const ids = this.selectedIds();
    this.alerts().filter((a) => ids.has(a.id)).forEach((a) => this.setStatus(a, status));
    this.selectedIds.set(new Set());
  }
  private update(id: string, fn: (a: Alert) => Alert) {
    this.alerts.update((list) => list.map((x) => (x.id === id ? fn(x) : x)));
  }
}
