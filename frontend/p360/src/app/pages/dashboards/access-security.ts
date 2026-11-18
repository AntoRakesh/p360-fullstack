import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { fmt, HOURS, NAMES, rng, SITE_NAMES } from './demo-data';

type DoorState = 'Closed' | 'Open' | 'Forced' | 'Held Open' | 'Offline';
const DOOR_COLORS: Record<DoorState, string> = { Closed: 'var(--ka-22c55e)', Open: 'var(--ka-3b82f6)', Forced: 'var(--ka-ef4444)', 'Held Open': 'var(--ka-f59e0b)', Offline: 'var(--ka-9ca3af)' };
const DOOR_NAMES = ['Main Entrance', 'Lobby Turnstile 1', 'Lobby Turnstile 2', 'Server Room', 'Lab A', 'Lab B', 'Finance', 'HR Office', 'Store Room', 'Loading Bay', 'Gate 1', 'Gate 2', 'Roof Access', 'Parking P1', 'Parking P2', 'Canteen', 'Data Hall', 'Exec Floor', 'Fire Exit N', 'Fire Exit S', 'Warehouse A', 'Warehouse B', 'Control Room', 'Mail Room'];

interface Door {
  id: number;
  name: string;
  site: string;
  state: DoorState;
  events: number;
  reader: string;
}
interface AccessEvent {
  id: number;
  time: string;
  person: string;
  door: string;
  result: 'Granted' | 'Denied';
  method: string;
}

@Component({
  selector: 'app-access-security',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access &amp; Security Dashboard">
      <button class="btn-outline" (click)="lockdown.set(!lockdown())" [class.on]="lockdown()">
        <app-icon name="shield" [size]="16" />{{ lockdown() ? 'Lift Lockdown' : 'Simulate Lockdown' }}
      </button>
    </app-page-head>

    @if (lockdown()) {
      <div class="card banner red"><app-icon name="siren" [size]="20" /><b>Lockdown active</b> — all non-emergency doors locked. Access requests are being denied.</div>
    }

    <section class="kpi-row">
      <app-kpi label="Access Events (Today)" [value]="k().events" icon="door-open" color="var(--ka-a855f7)" change="8%" />
      <app-kpi label="Granted" [value]="k().granted" icon="shield-check" color="var(--ka-22c55e)" change="7%" />
      <app-kpi label="Denied" [value]="k().denied" icon="ban" color="var(--ka-ef4444)" change="3%" [up]="false" />
      <app-kpi label="Door Alarms" [value]="alarms()" icon="bell" color="var(--ka-f97316)" sub="open now" />
      <app-kpi label="Doors Online" [value]="online()" icon="wifi" color="var(--ka-3b82f6)" sub="readers & controllers" />
      <app-kpi label="Tailgating Detected" [value]="k().tail" icon="users" color="var(--ka-8b5cf6)" change="2" [up]="false" />
    </section>

    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Access Events by Hour</h3></div>
        <app-column-chart [labels]="hours" [series]="hourly()" [stacked]="true" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Denial Reasons</h3></div>
        <app-donut [segments]="reasons()" center="Denied" />
      </div>

      <div class="card span-8">
        <div class="card-head">
          <h3>Door Status <span class="card-sub">{{ doorsShown().length }} doors</span></h3>
          <div class="toolbar">
            @for (s of doorStates; track s) {
              <button class="legend-btn" [class.off]="doorFilter() && doorFilter() !== s" (click)="doorFilter.set(doorFilter() === s ? null : s)">
                <i [style.background]="doorColors[s]"></i>{{ s }} ({{ count(s) }})
              </button>
            }
          </div>
        </div>
        <div class="door-grid">
          @for (d of doorsShown(); track d.id) {
            <button class="door" [class.sel]="selDoor()?.id === d.id" [style.border-left-color]="doorColors[d.state]" (click)="selDoor.set(d)">
              <b>{{ d.name }}</b>
              <span>{{ d.site }}</span>
              <em [style.color]="doorColors[d.state]">{{ d.state }}</em>
            </button>
          }
        </div>
      </div>
      <div class="card span-4">
        @if (selDoor(); as d) {
          <div class="card-head">
            <h3>{{ d.name }}</h3>
            <button class="close-btn" (click)="selDoor.set(null)">×</button>
          </div>
          <dl class="kv">
            <dt>Site</dt><dd>{{ d.site }}</dd>
            <dt>Status</dt><dd><span class="tag" [style.background]="'color-mix(in srgb, ' + doorColors[d.state] + ' 13%, transparent)'" [style.color]="doorColors[d.state]">{{ d.state }}</span></dd>
            <dt>Reader</dt><dd>{{ d.reader }}</dd>
            <dt>Events today</dt><dd>{{ d.events }}</dd>
          </dl>
          <div class="toolbar">
            <button class="btn-primary btn-sm" (click)="setDoor(d, 'Open')" [disabled]="d.state === 'Offline'">Unlock</button>
            <button class="btn-ghost sm" (click)="setDoor(d, 'Closed')" [disabled]="d.state === 'Offline'">Lock</button>
            @if (d.state === 'Forced' || d.state === 'Held Open') {
              <button class="btn-ghost sm danger" (click)="setDoor(d, 'Closed')">Acknowledge alarm</button>
            }
          </div>
        } @else {
          <div class="card-head"><h3>Top Denied Doors</h3></div>
          <app-bar-list [rows]="topDenied()" [max]="topDenied()[0].value" />
          <p class="muted">Select a door on the left to view details and control it.</p>
        }
      </div>

      <div class="card span-12">
        <div class="card-head">
          <h3>Live Access Feed</h3>
          <div class="tabs">
            @for (t of feedTabs; track t) {
              <button [class.on]="feedTab() === t" (click)="feedTab.set(t)">{{ t }}</button>
            }
          </div>
        </div>
        <div class="table-wrap feed">
          <table class="table">
            <thead><tr><th>Time</th><th>Person</th><th>Door</th><th>Method</th><th>Result</th></tr></thead>
            <tbody>
              @for (e of feedShown(); track e.id) {
                <tr class="row-in">
                  <td>{{ e.time }}</td>
                  <td>{{ e.person }}</td>
                  <td>{{ e.door }}</td>
                  <td>{{ e.method }}</td>
                  <td><span class="tag" [class.green]="e.result === 'Granted'" [class.red]="e.result === 'Denied'">{{ e.result }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
  styles: `
    .banner { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 13px; }
    .banner.red { background: var(--kb-fef2f2); border-color: var(--kl-fecaca); color: var(--kf-991b1b); }
    .legend-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; font-size: 11.5px; color: var(--kf-3b3f5c); cursor: pointer; }
    .legend-btn.off { opacity: 0.35; }
    .legend-btn i { width: 9px; height: 9px; border-radius: 50%; }
    .door-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
    .door { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; border: 1px solid var(--border); border-left: 4px solid; border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; text-align: left; }
    .door:hover, .door.sel { background: var(--kb-faf8ff); border-color: var(--kl-c4b5fd); }
    .door b { font-size: 12px; } .door span { font-size: 11px; color: var(--muted); } .door em { font-style: normal; font-size: 11px; font-weight: 600; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 10px; font-size: 13px; margin: 0 0 16px; }
    .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    .feed { max-height: 330px; }
    .row-in { animation: rowin 0.5s ease; }
    @keyframes rowin { from { background: var(--kb-f3efff); } }
  `,
})
export class AccessSecurity {
  private readonly state = inject(AppState);
  protected readonly hours = HOURS;
  protected readonly doorStates: DoorState[] = ['Closed', 'Open', 'Held Open', 'Forced', 'Offline'];
  protected readonly doorColors = DOOR_COLORS;
  protected readonly lockdown = signal(false);
  protected readonly doorFilter = signal<DoorState | null>(null);
  protected readonly selDoor = signal<Door | null>(null);
  protected readonly feedTabs = ['All', 'Granted', 'Denied'];
  protected readonly feedTab = signal('All');

  protected readonly doors = signal<Door[]>(
    (() => {
      const r = rng(77);
      return DOOR_NAMES.map((name, i) => {
        const t = r();
        const state: DoorState = i === 3 ? 'Forced' : i === 9 ? 'Held Open' : i === 13 ? 'Offline' : t < 0.18 ? 'Open' : 'Closed';
        return { id: i, name, site: SITE_NAMES[i % SITE_NAMES.length], state, events: Math.round(200 + r() * 2400), reader: `HID Signo ${20 + (i % 3) * 20} · R-${100 + i}` };
      });
    })(),
  );
  private nextId = 1;
  protected readonly feed = signal<AccessEvent[]>(Array.from({ length: 12 }, (_, i) => this.makeEvent(i)));

  constructor() {
    effect(() => {
      const t = this.state.tick();
      if (t) this.feed.update((f) => [this.makeEvent(t), ...f].slice(0, 40));
    });
  }

  protected readonly k = computed(() => {
    const f = this.state.factor();
    const t = this.state.tick();
    const events = Math.round(56921 * f + t * 9 * f);
    const denied = Math.round(1117 * f + t * 0.4 * f);
    return { events: fmt(events), granted: fmt(events - denied), denied: fmt(denied), tail: String(Math.max(1, Math.round(6 * Math.sqrt(f)))) };
  });
  protected readonly alarms = computed(() => String(this.doors().filter((d) => d.state === 'Forced' || d.state === 'Held Open').length + 7));
  protected readonly online = computed(() => `${412 - this.doors().filter((d) => d.state === 'Offline').length + 1} / 418`);
  protected readonly hourly = computed(() => {
    const f = this.state.factor();
    const g = [900, 3200, 7400, 6100, 4300, 3600, 5200, 4100, 3500, 3000, 3900, 4600, 2600, 1200, 600];
    return [
      { name: 'Granted', color: 'var(--ka-8b5cf6)', values: g.map((v) => Math.round(v * f)) },
      { name: 'Denied', color: 'var(--ka-ef4444)', values: g.map((v, i) => Math.round(v * f * (0.015 + (i % 4) * 0.006))) },
    ];
  });
  protected readonly reasons = computed(() =>
    [
      ['Invalid credential', 412, 'var(--ka-ef4444)'],
      ['Expired badge', 268, 'var(--ka-f97316)'],
      ['Outside schedule', 221, 'var(--ka-f59e0b)'],
      ['Anti-passback', 134, 'var(--ka-8b5cf6)'],
      ['Unknown card', 82, 'var(--ka-9ca3af)'],
    ].map(([label, v, color]) => ({ label: label as string, value: this.state.scale(v as number), color: color as string })),
  );
  protected readonly topDenied = computed(() =>
    [['Server Room', 96], ['Lab A', 74], ['Data Hall', 61], ['Exec Floor', 44], ['Finance', 38], ['Roof Access', 21]].map(([label, v]) => ({
      label: label as string,
      value: this.state.scale(v as number),
      color: 'var(--ka-ef4444)',
    })),
  );
  protected readonly doorsShown = computed(() => {
    const f = this.doorFilter();
    const site = this.state.site();
    return this.doors().filter((d) => (!f || d.state === f) && (site.factor === 1 || d.site === site.name));
  });
  protected readonly feedShown = computed(() => this.feed().filter((e) => this.feedTab() === 'All' || e.result === this.feedTab()));

  protected count(s: DoorState) {
    return this.doors().filter((d) => d.state === s).length;
  }
  protected setDoor(d: Door, state: DoorState) {
    this.doors.update((list) => list.map((x) => (x.id === d.id ? { ...x, state } : x)));
    this.selDoor.set({ ...d, state });
  }
  private makeEvent(seed: number): AccessEvent {
    const r = rng(seed * 13 + 5);
    const denied = this.lockdown?.() || r() < 0.08;
    const d = new Date(Date.now() - (seed < 12 && !this.state.tick() ? seed * 47000 : 0));
    return {
      id: this.nextId++,
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      person: NAMES[Math.floor(r() * NAMES.length)],
      door: DOOR_NAMES[Math.floor(r() * DOOR_NAMES.length)],
      result: denied ? 'Denied' : 'Granted',
      method: ['Badge', 'Face', 'Mobile', 'PIN + Badge', 'Fingerprint'][Math.floor(r() * 5)],
    };
  }
}
