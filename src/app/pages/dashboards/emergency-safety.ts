import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { fmt, MONTHS, NAMES } from './demo-data';

const MUSTER = [
  { name: 'MP-1 North Car Park', cap: 2500, share: 0.24 },
  { name: 'MP-2 South Lawn', cap: 2000, share: 0.19 },
  { name: 'MP-3 Plant Gate', cap: 3000, share: 0.27 },
  { name: 'MP-4 Warehouse Yard', cap: 1800, share: 0.16 },
  { name: 'MP-5 Logistics Bay', cap: 1000, share: 0.09 },
  { name: 'MP-6 Data Center', cap: 400, share: 0.05 },
];
const HAZARDS = [
  { id: 'HZ-1042', title: 'Oil spill near Line 3', site: 'Manufacturing', sev: 'High', owner: 'Ravi Shankar', age: '2h' },
  { id: 'HZ-1039', title: 'Blocked fire exit S2', site: 'Warehouse', sev: 'Critical', owner: 'Omar Khalid', age: '5h' },
  { id: 'HZ-1036', title: 'Loose cable tray F2', site: 'Head Office', sev: 'Medium', owner: 'Li Wei', age: '1d' },
  { id: 'HZ-1031', title: 'Forklift speeding zone B', site: 'Logistics Hub', sev: 'High', owner: 'Tom Baker', age: '2d' },
  { id: 'HZ-1027', title: 'Missing first-aid kit', site: 'Retail Stores', sev: 'Low', owner: 'Aisha Bello', age: '3d' },
];
const DRILLS = [
  { date: '28 Oct 2026', site: 'Head Office', type: 'Fire evacuation', time: '6m 40s', acc: 99.2 },
  { date: '14 Oct 2026', site: 'Manufacturing', type: 'Chemical leak', time: '9m 05s', acc: 97.8 },
  { date: '30 Sep 2026', site: 'Warehouse', type: 'Fire evacuation', time: '7m 55s', acc: 98.6 },
  { date: '12 Sep 2026', site: 'Data Center', type: 'Power failure', time: '4m 20s', acc: 100 },
];

@Component({
  selector: 'app-emergency-safety',
  imports: [...UI, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Emergency &amp; Safety Dashboard">
      @if (drill()) {
        <button class="btn-ghost danger" (click)="endDrill()"><app-icon name="shield-check" [size]="16" />End drill / all clear</button>
      } @else {
        <button class="btn-primary" (click)="startDrill()"><app-icon name="siren" [size]="16" />Start evacuation drill</button>
      }
    </app-page-head>

    <div class="card status" [class.alarm]="drill()">
      <span class="status-icon"><app-icon [name]="drill() ? 'siren' : 'shield-check'" [size]="28" /></span>
      <div class="status-text">
        <b>{{ drill() ? 'Evacuation in progress (drill)' : 'Normal' }}</b>
        <span>{{ drill() ? 'Started ' + drillStart + ' · ' + elapsed() + ' elapsed' : 'No active emergency across ' + (state.site().factor === 1 ? 'all sites' : state.site().name) }}</span>
      </div>
      @if (drill()) {
        <div class="acc">
          <span>Accounted for</span>
          <b>{{ accounted() | number }} / {{ total() | number }}</b>
          <div class="acc-bar"><i [style.width.%]="pct()"></i></div>
        </div>
      }
    </div>

    <section class="kpi-row">
      <app-kpi label="People to Account" [value]="fmt(total())" icon="users" color="var(--ka-8b5cf6)" sub="on site now" />
      <app-kpi label="Muster Points" value="6 / 6" icon="map-pin" color="var(--ka-3b82f6)" sub="operational" />
      <app-kpi label="Wardens on Duty" value="24" icon="shield-check" color="var(--ka-22c55e)" sub="2 per floor min." />
      <app-kpi label="Open Incidents" value="5" icon="triangle-alert" color="var(--ka-f97316)" change="2" [up]="false" />
      <app-kpi label="Days Without LTI" value="146" icon="star" color="var(--ka-a855f7)" sub="lost-time injury" />
      <app-kpi label="Emergency Devices" value="100%" icon="siren" color="var(--ka-ef4444)" sub="online" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Muster Points</h3><span class="muted">{{ drill() ? 'live headcount' : 'capacity' }}</span></div>
        <div class="muster-grid">
          @for (m of muster(); track m.name) {
            <div class="muster">
              <app-ring [value]="m.pct" [color]="m.pct > 90 ? 'var(--ka-ef4444)' : 'var(--ka-7c3aed)'" />
              <div>
                <b>{{ m.name }}</b>
                <span>{{ m.count | number }} / {{ m.cap | number }}</span>
                <small>Warden: {{ m.warden }}</small>
              </div>
            </div>
          }
        </div>
      </div>
      <div class="card span-4">
        <div class="card-head">
          <h3>{{ drill() ? 'Unaccounted Persons' : 'Warden Coverage by Floor' }}</h3>
        </div>
        @if (drill()) {
          <ul class="missing">
            @for (p of missing(); track p) {
              <li><app-icon name="user" [size]="15" />{{ p }}<button class="link" (click)="markSafe(p)">Mark safe</button></li>
            } @empty {
              <li class="empty-note">Everyone accounted for 🎉</li>
            }
          </ul>
        } @else {
          <app-bar-list [rows]="coverage" />
        }
      </div>

      <div class="card span-7">
        <div class="card-head"><h3>Incidents by Type <span class="card-sub">last 6 months</span></h3></div>
        <app-column-chart [labels]="months" [series]="incidents()" [stacked]="true" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Drill History</h3></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Date</th><th>Site</th><th>Type</th><th class="num">Time</th><th class="num">Accounted</th></tr></thead>
            <tbody>
              @for (d of drills(); track d.date + d.site) {
                <tr><td>{{ d.date }}</td><td>{{ d.site }}</td><td>{{ d.type }}</td><td class="num">{{ d.time }}</td><td class="num">{{ d.acc }}%</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card span-12">
        <div class="card-head">
          <h3>Open Hazards</h3>
          <div class="tabs">
            @for (s of sevTabs; track s) {
              <button [class.on]="sev() === s" (click)="sev.set(s)">{{ s }}</button>
            }
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>ID</th><th>Hazard</th><th>Site</th><th>Severity</th><th>Owner</th><th>Age</th><th></th></tr></thead>
            <tbody>
              @for (h of hazards(); track h.id) {
                <tr>
                  <td>{{ h.id }}</td><td>{{ h.title }}</td><td>{{ h.site }}</td>
                  <td><span class="tag" [class]="sevClass[h.sev]">{{ h.sev }}</span></td>
                  <td>{{ h.owner }}</td><td>{{ h.age }}</td>
                  <td><button class="btn-ghost sm" (click)="closeHazard(h.id)">Close</button></td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty-note">No open hazards</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
  styles: `
    .status { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; border-left: 5px solid var(--kl-22c55e); flex-wrap: wrap; }
    .status.alarm { border-left-color: var(--kl-ef4444); background: var(--kb-fff7f7); animation: flash 1.4s infinite; }
    @keyframes flash { 50% { background: var(--kb-ffffff); } }
    .status-icon { width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center; background: var(--kb-22c55e); color: var(--kf-ffffff); }
    .alarm .status-icon { background: var(--kb-ef4444); }
    .status-text { display: flex; flex-direction: column; flex: 1; }
    .status-text b { font-size: 19px; color: var(--kf-16a34a); } .alarm .status-text b { color: var(--kf-dc2626); }
    .status-text span { font-size: 13px; color: var(--muted); }
    .acc { min-width: 260px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
    .acc b { font-size: 18px; }
    .acc-bar { height: 8px; border-radius: 4px; background: var(--kb-fde2e2); overflow: hidden; }
    .acc-bar i { display: block; height: 100%; background: var(--kb-22c55e); transition: width 0.8s ease; }
    .muster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .muster { display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
    .muster div { display: flex; flex-direction: column; font-size: 12px; }
    .muster b { font-size: 12.5px; } .muster span { font-size: 15px; font-weight: 600; } .muster small { color: var(--muted); }
    .missing { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow: auto; }
    .missing li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; }
    .missing .link { margin-left: auto; }
  `,
})
export class EmergencySafety {
  protected readonly state = inject(AppState);
  protected readonly fmt = fmt;
  protected readonly months = MONTHS;
  protected readonly sevTabs = ['All', 'Critical', 'High', 'Medium', 'Low'];
  protected readonly sev = signal('All');
  protected readonly sevClass: Record<string, string> = { Critical: 'tag red', High: 'tag amber', Medium: 'tag blue', Low: 'tag grey' };
  protected readonly coverage = ['F4', 'F3', 'F2', 'F1', 'G', 'B1'].map((label, i) => {
    const v = [100, 100, 83, 100, 92, 67][i];
    return { label: `Floor ${label}`, value: v, display: `${v}%`, color: v < 80 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' };
  });

  protected readonly drill = signal(false);
  protected drillStart = '';
  private readonly drillTick = signal(0);
  private readonly safe = signal<Set<string>>(new Set());
  protected readonly closed = signal<Set<string>>(new Set());

  constructor() {
    // Drill runs on its own clock so it progresses even when live updates are paused.
    const id = setInterval(() => this.drill() && this.drillTick.update((t) => t + 1), 1500);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected readonly total = computed(() => this.state.scale(12480));
  protected readonly pct = computed(() => (this.drill() ? Math.min(99.9, 100 - 100 * Math.exp(-this.drillTick() / 6)) : 0));
  protected readonly accounted = computed(() => Math.round((this.total() * this.pct()) / 100) + this.safe().size);
  protected readonly elapsed = computed(() => {
    const s = this.drillTick() * 1.5 * 12;
    return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
  });
  protected readonly muster = computed(() => {
    const p = this.pct() / 100;
    return MUSTER.map((m, i) => {
      const count = this.drill() ? Math.round(this.total() * m.share * p) : 0;
      return { ...m, count, pct: this.drill() ? Math.round((count / m.cap) * 100) : 0, warden: NAMES[i * 3] };
    });
  });
  protected readonly missing = computed(() => {
    const left = Math.max(0, Math.ceil(12 * (1 - this.pct() / 100) * 4));
    return NAMES.slice(4, 4 + Math.min(left, 12)).filter((n) => !this.safe().has(n));
  });
  protected readonly incidents = computed(() => [
    { name: 'Near miss', color: 'var(--ka-f59e0b)', values: [14, 11, 16, 12, 9, 6].map((v) => Math.round(v * Math.sqrt(this.state.factor()))) },
    { name: 'First aid', color: 'var(--ka-3b82f6)', values: [6, 8, 5, 7, 4, 3].map((v) => Math.round(v * Math.sqrt(this.state.factor()))) },
    { name: 'Property damage', color: 'var(--ka-8b5cf6)', values: [3, 2, 4, 2, 3, 1] },
    { name: 'Security', color: 'var(--ka-ef4444)', values: [2, 3, 1, 4, 2, 2] },
  ]);
  protected readonly drills = computed(() => {
    const s = this.state.site();
    return DRILLS.filter((d) => s.factor === 1 || d.site === s.name);
  });
  protected readonly hazards = computed(() =>
    HAZARDS.filter((h) => !this.closed().has(h.id) && (this.sev() === 'All' || h.sev === this.sev()) && (this.state.site().factor === 1 || h.site === this.state.site().name)),
  );

  protected startDrill() {
    this.drillStart = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.drillTick.set(0);
    this.safe.set(new Set());
    this.drill.set(true);
  }
  protected endDrill() {
    this.drill.set(false);
  }
  protected markSafe(name: string) {
    this.safe.update((s) => new Set(s).add(name));
  }
  protected closeHazard(id: string) {
    this.closed.update((s) => new Set(s).add(id));
  }
}
