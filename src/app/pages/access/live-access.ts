import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { PEOPLE } from '../people/people.data';
import { AccessEvent, Door, DOORS, HISTORY, METHODS, TODAY_EVENTS } from './access.data';
import { CamScene } from './cam-scene';

const CAMS = ['Main Entrance - Head Office', 'Side Entrance', 'Parking Gate', 'R&D Lab - Floor 2', 'Warehouse Gate'];
const CAM_DOOR = ['Main Entrance', 'Side Entrance', 'Parking Gate', 'R&D Lab', 'Warehouse Gate'];
const KEY_DOORS = ['Main Entrance', 'Side Entrance', 'R&D Lab', 'Server Room', 'Warehouse Gate'];
const credTag = (c: string) => ({ Employee: 'tag', Visitor: 'tag', Contractor: 'tag amber', Temporary: 'tag teal', System: 'tag red' })[c] ?? 'tag grey';

@Component({
  selector: 'app-live-access',
  imports: [...UI, DataTable, CamScene, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Live Access Events" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Real-time view of all access events, door status and video snapshots across your sites.">
      <div class="menu-wrap">
        <button class="btn-primary" (click)="menu.set(menu() === 'fs' ? null : 'fs')"><app-icon name="maximize" [size]="16" />View in Full Screen <app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'fs') {
          <div class="dropdown">
            <button class="dd-item" (click)="fullscreen()">Full screen page</button>
            <button class="dd-item" (click)="wall.set(true); menu.set(null)">Video wall (cameras only)</button>
          </div>
        }
      </div>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="menu.set(menu() === 'act' ? null : 'act')"><app-icon name="shield" [size]="15" />Actions <app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'act') {
          <div class="dropdown">
            @if (!lockdown()) {<button class="dd-item danger" (click)="setLockdown(true)"><app-icon name="ban" [size]="15" />Lockdown all doors</button>}
            @else {<button class="dd-item" (click)="setLockdown(false)"><app-icon name="shield-check" [size]="15" />Release lockdown</button>}
            <button class="dd-item" (click)="unlockExits()"><app-icon name="door-open" [size]="15" />Unlock emergency exits</button>
            <button class="dd-item" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export today's events</button>
          </div>
        }
      </div>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="menu.set(menu() === 'more' ? null : 'more')" aria-label="More">⋮</button>
        @if (menu() === 'more') {
          <div class="dropdown">
            <a class="dd-item" routerLink="/physical-access-control/access-logs">Open full access logs</a>
            <a class="dd-item" routerLink="/physical-access-control/door-alarms-tamper-events">Open door alarms</a>
          </div>
        }
      </div>
    </app-page-head>

    @if (lockdown()) {
      <div class="card banner"><app-icon name="siren" [size]="20" /><b>Lockdown active</b> — all doors locked, only security credentials accepted.<button class="btn-ghost sm" (click)="setLockdown(false)">Release</button></div>
    }

    <section class="kpi-row">
      <app-kpi label="Total Access Events Today" [value]="fmt(k().total)" icon="door-open" color="#8b5cf6" change="12%" />
      <app-kpi label="Access Granted" [value]="fmt(k().granted)" [extra]="pct(k().granted)" icon="shield-check" color="#22c55e" change="15%" />
      <app-kpi label="Access Denied" [value]="fmt(k().denied)" [extra]="pct(k().denied)" icon="ban" color="#ef4444" change="5%" [good]="false" />
      <app-kpi label="Door Alarms" [value]="k().alarms" icon="calendar-days" color="#f97316" change="33%" [good]="false" />
      <app-kpi label="Doors Online" [value]="k().online + ' / ' + doors().length" [extra]="(k().online / doors().length * 100).toFixed(1) + '%'" icon="building" color="#a855f7" change="2%" />
    </section>

    <section class="la">
      <div class="col-l">
        <div class="card ev-card">
          <div class="card-head"><h3>Live Access Events</h3><span class="muted">{{ state.live() ? 'streaming' : 'paused' }}</span></div>
          <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [pageSize]="8" noun="events"
            [searchKeys]="['name', 'personId', 'door']" searchPlaceholder="Search by name, ID, card number..." [activeId]="detail()?.id ?? null"
            (rowClick)="detail.set($event)" (action)="onAction($event.action, $event.row)" />
        </div>
        <div class="two">
          <div class="card">
            <div class="card-head"><h3>Door Status</h3></div>
            <div class="ds">
              <span class="g"><app-icon name="building" [size]="14" /><b>{{ k().online }}</b>Online</span>
              <span class="r"><app-icon name="ban" [size]="14" /><b>{{ count('Offline') }}</b>Offline</span>
              <span class="o"><app-icon name="bell" [size]="14" /><b>{{ count('Alarm') }}</b>Alarm</span>
              <span class="b"><app-icon name="building" [size]="14" /><b>{{ doors().length }}</b>Total</span>
            </div>
            <table class="table doors">
              <thead><tr><th>Door / Location</th><th>Status</th><th>Last Event</th><th>Actions</th></tr></thead>
              <tbody>
                @for (d of keyDoors(); track d.id) {
                  <tr>
                    <td>{{ d.name }}{{ d.floor !== 'G' ? ' (' + d.floor + ')' : '' }}</td>
                    <td><span class="dt-status" [class]="statusCls(d.status)"><i></i>{{ d.status }}</span></td>
                    <td>{{ d.status === 'Offline' ? '-' : lastEvent(d.name) }}</td>
                    <td>
                      <div class="menu-wrap">
                        <button class="dots" (click)="doorMenu.set(doorMenu() === d.id ? null : d.id)">⋯</button>
                        @if (doorMenu() === d.id) {
                          <div class="dropdown">
                            <button class="dd-item" (click)="pulse(d)" [disabled]="d.status === 'Offline'">Unlock 5 seconds</button>
                            <button class="dd-item" (click)="toggleLock(d)" [disabled]="d.status === 'Offline'">{{ d.locked ? 'Keep unlocked' : 'Lock' }}</button>
                            @if (d.status === 'Alarm') {<button class="dd-item" (click)="ack(d)">Acknowledge alarm</button>}
                            <a class="dd-item" routerLink="/physical-access-control/door-monitoring">Open in Door Monitoring</a>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>Site Map / Doors</h3>
              <div class="toolbar">
                <select class="select sm" [value]="mapSite()" (change)="mapSite.set($any($event.target).value)"><option>Head Office</option></select>
                <select class="select sm" [value]="mapFloor()" (change)="mapFloor.set($any($event.target).value); mapSel.set(null)">@for (f of floors; track f) {<option [value]="f">{{ f === 'G' ? 'Ground' : 'Floor ' + f.slice(1) }}</option>}</select>
              </div>
            </div>
            <div class="map" (click)="mapSel.set(null)">
              <svg viewBox="0 0 400 200">
                <rect width="400" height="200" fill="#f1f2f6" />
                <g fill="none" stroke="#b4b9c6" stroke-width="2"><rect x="5" y="5" width="390" height="190" /><path d="M5 90h390M120 5v85M240 5v85M300 90v105M160 90v105" /></g>
                @for (d of mapDoors(); track d.id) {
                  <g class="dm" (click)="$event.stopPropagation(); mapSel.set(d)">
                    <rect [attr.x]="d.x - 9" [attr.y]="d.y - 9" width="18" height="18" rx="4" [attr.fill]="color(d.status)" [attr.stroke]="mapSel()?.id === d.id ? '#7c3aed' : '#fff'" stroke-width="2.5" />
                    <path [attr.d]="'M' + (d.x - 3) + ' ' + (d.y + 5) + 'v-9h6v9'" stroke="#fff" stroke-width="1.5" fill="none" />
                  </g>
                }
              </svg>
              @if (mapSel(); as d) {
                <div class="tip" [style.left.%]="(d.x / 400) * 100" [style.top.%]="(d.y / 200) * 100">
                  <b>{{ d.name }}</b><span [style.color]="color(d.status)">{{ d.status }}</span><small>Last Event: {{ d.status === 'Offline' ? '—' : lastEvent(d.name) }}</small>
                </div>
              }
            </div>
            <div class="legend"><span><i style="background:#22c55e"></i>Online</span><span><i style="background:#ef4444"></i>Offline</span><span><i style="background:#f59e0b"></i>Alarm</span><span><i style="background:#7c3aed"></i>Selected</span></div>
          </div>
        </div>
      </div>

      <div class="col-r">
        <div class="card">
          <div class="card-head">
            <h3>Live Video Feed</h3>
            <div class="toolbar">
              <select class="select sm" [value]="cam()" (change)="cam.set(+$any($event.target).value)">@for (c of cams; track c; let i = $index) {<option [value]="i">{{ c }}</option>}</select>
              <div class="lay">
                <button [class.on]="layout() === 1" (click)="layout.set(1)" title="Single"><app-icon name="square-user" [size]="14" /></button>
                <button [class.on]="layout() === 4" (click)="layout.set(4)" title="2 × 2"><app-icon name="grid" [size]="14" [stroke]="2.4" /></button>
              </div>
            </div>
          </div>
          @if (layout() === 1) {
            <div class="vid">
              <div class="main-feed">
                <app-cam-scene [variant]="cam()" [box]="true" [tick]="state.tick()" />
                <span class="live"><i></i>Live</span>
                @if (recog(); as e) {
                  <div class="recog">
                    <span class="dt-av" [style.background]="e.avatar">{{ e.initials }}</span>
                    <div><b>{{ e.name }}</b><small>{{ e.personId }}</small><em [class.bad]="e.result === 'Denied'">{{ e.kind }}</em><small>{{ e.time }}</small></div>
                  </div>
                }
              </div>
              <div class="thumbs">
                @for (c of cams; track c; let i = $index) {
                  <button class="th" [class.on]="cam() === i" (click)="cam.set(i)">
                    <app-cam-scene [variant]="i" [tick]="state.tick() + i" />
                    <span>{{ c.split(' - ')[0] }}</span>
                  </button>
                }
              </div>
            </div>
          } @else {
            <div class="grid4">
              @for (c of cams.slice(0, 4); track c; let i = $index) {
                <button class="g4" [class.on]="cam() === i" (click)="cam.set(i); layout.set(1)">
                  <app-cam-scene [variant]="i" [tick]="state.tick() + i" [box]="i === cam()" /><span>{{ c }}</span>
                </button>
              }
            </div>
          }
        </div>
        <div class="card">
          <div class="card-head">
            <h3>Access Events Trend</h3>
            <select class="select sm" [value]="hours()" (change)="hours.set(+$any($event.target).value)"><option value="24">Last 24 Hours</option><option value="12">Last 12 Hours</option><option value="6">Last 6 Hours</option></select>
          </div>
          <app-line-chart [labels]="trend().labels" [series]="trend().series" [height]="200" />
        </div>
        <div class="card">
          <div class="card-head">
            <h3>Top Access Locations</h3>
            <select class="select sm" [value]="topRange()" (change)="topRange.set($any($event.target).value)"><option>Today</option><option>This Week</option></select>
          </div>
          <ul class="top">
            @for (t of top(); track t.door) {
              <li><span>{{ t.door }}</span><b>{{ t.n.toLocaleString() }}</b><em>{{ t.pct }}%</em><div class="bar"><i [style.width.%]="t.pct * 2"></i></div></li>
            }
          </ul>
        </div>
      </div>
    </section>

    @if (detail(); as e) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <aside class="g-drawer">
        <div class="card-head"><h3>Event details</h3><button class="close-btn" (click)="detail.set(null)">×</button></div>
        <app-cam-scene class="snap" [variant]="camFor(e.door)" [box]="true" />
        <dl class="kv">
          <dt>Time</dt><dd>{{ e.time }}</dd>
          <dt>Person</dt><dd>{{ e.name }} ({{ e.personId }})</dd>
          <dt>Credential</dt><dd>{{ e.cred }} · {{ e.method }}</dd>
          <dt>Door</dt><dd>{{ e.door }} · {{ e.location }}</dd>
          <dt>Event</dt><dd><span class="dt-status" [class]="statusCls(e.result)"><i></i>{{ e.kind }}{{ e.reason ? ' · ' + e.reason : '' }}</span></dd>
        </dl>
        <div class="toolbar">
          @if (e.result === 'Denied') {<button class="btn-primary" (click)="onAction('grant', e)">Grant one-time access</button>}
          <button class="btn-ghost" (click)="onAction('watch', e)">Add to watchlist</button>
        </div>
      </aside>
    }

    @if (wall()) {
      <div class="wall">
        <div class="wall-head"><b>Video wall · {{ fmt(k().total) }} events today</b><button class="btn-ghost" (click)="wall.set(false)">Exit</button></div>
        <div class="wall-grid">
          @for (c of cams; track c; let i = $index) {<div class="wcell"><app-cam-scene [variant]="i" [tick]="state.tick() + i" [box]="true" /><span>{{ c }}</span></div>}
          <div class="wcell list">@for (e of rows().slice(0, 8); track e.id) {<div><b [class.bad]="e.result === 'Denied'">{{ e.time }}</b> {{ e.name }} · {{ e.door }}</div>}</div>
        </div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .banner { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; background: #fef2f2; border-color: #fecaca; color: #991b1b; font-size: 13px; }
    .danger { color: var(--red) !important; }
    .la { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    .col-l, .col-r { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; }
    .ds { display: flex; gap: 14px; margin-bottom: 10px; font-size: 11px; flex-wrap: wrap; }
    .ds span { display: grid; grid-template-columns: auto auto; gap: 0 6px; align-items: center; } .ds b { font-size: 15px; } .ds span:not(:has(b)) { display: none; }
    .ds app-icon { grid-row: span 2; width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; color: #fff; }
    .ds .g app-icon { background: #22c55e; } .ds .r app-icon { background: #ef4444; } .ds .o app-icon { background: #f97316; } .ds .b app-icon { background: #3b82f6; }
    .doors { font-size: 12px; } .doors th, .doors td { padding: 7px 6px; }
    .map { position: relative; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; aspect-ratio: 2 / 1; }
    .map svg { width: 100%; height: 100%; display: block; } .dm { cursor: pointer; }
    .tip { position: absolute; transform: translate(14px, -50%); display: flex; flex-direction: column; padding: 8px 10px; background: #fff; border-radius: 8px; box-shadow: 0 6px 18px rgba(20,20,60,.18); font-size: 11.5px; white-space: nowrap; }
    .tip small { color: var(--muted); }
    .legend { display: flex; gap: 14px; margin-top: 8px; font-size: 11.5px; } .legend span { display: flex; gap: 5px; align-items: center; } .legend i { width: 10px; height: 10px; border-radius: 50%; }
    .lay { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .lay button { width: 28px; height: 26px; border: 0; background: #fff; display: grid; place-items: center; cursor: pointer; } .lay button.on { background: var(--primary); color: #fff; }
    .vid { display: grid; grid-template-columns: 1fr 140px; gap: 8px; }
    .main-feed { position: relative; min-height: 330px; border-radius: 8px; overflow: hidden; } .main-feed app-cam-scene { position: absolute; inset: 0; }
    .live { position: absolute; top: 10px; right: 10px; display: flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 12px; background: rgba(0,0,0,.55); color: #4ade80; font-size: 11px; font-weight: 700; }
    .live i { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; }
    .recog { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 10px; padding: 8px 12px; border-radius: 8px; background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.25); font-size: 11.5px; min-width: 200px; animation: rin .4s; }
    .recog div { display: flex; flex-direction: column; } .recog small { color: var(--muted); } .recog em { font-style: normal; color: #16a34a; font-weight: 600; } .recog em.bad { color: var(--red); }
    @keyframes rin { from { opacity: 0; transform: translateY(6px); } }
    .thumbs { display: flex; flex-direction: column; gap: 6px; }
    .th { position: relative; height: 62px; border: 2px solid transparent; border-radius: 6px; overflow: hidden; padding: 0; cursor: pointer; }
    .th app-cam-scene { position: absolute; inset: 0; } .th.on { border-color: var(--primary); }
    .th span, .g4 span, .wcell span { position: absolute; left: 4px; bottom: 4px; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,.6); color: #fff; font-size: 10px; }
    .grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .g4 { position: relative; height: 160px; border: 2px solid transparent; border-radius: 6px; overflow: hidden; padding: 0; cursor: pointer; } .g4 app-cam-scene { position: absolute; inset: 0; } .g4.on { border-color: var(--primary); }
    .top { list-style: none; margin: 0; padding: 0; } .top li { display: grid; grid-template-columns: 1fr 60px 50px 140px; gap: 10px; align-items: center; padding: 6px 0; font-size: 12.5px; }
    .top b { text-align: right; } .top em { font-style: normal; color: var(--muted); text-align: right; }
    .bar { height: 10px; background: #eef0f6; border-radius: 2px; overflow: hidden; } .bar i { display: block; height: 100%; background: #7c3aed; }
    .snap { height: 220px; border-radius: 8px; margin-bottom: 12px; }
    .kv { display: grid; grid-template-columns: 90px 1fr; gap: 8px; font-size: 13px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    .wall { position: fixed; inset: 0; z-index: 80; background: #0f0d1f; padding: 16px; display: flex; flex-direction: column; gap: 12px; color: #fff; }
    .wall-head { display: flex; justify-content: space-between; align-items: center; }
    .wall-grid { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; gap: 8px; }
    .wcell { position: relative; border-radius: 8px; overflow: hidden; } .wcell app-cam-scene { position: absolute; inset: 0; }
    .wcell.list { padding: 12px; background: #1e1b3a; font-size: 12px; display: flex; flex-direction: column; gap: 6px; overflow: hidden; } .wcell.list .bad { color: #f87171; }
    .bad { color: var(--red); }
    @media (max-width: 1350px) { .la { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } .vid { grid-template-columns: 1fr; } .thumbs { flex-direction: row; overflow-x: auto; } .th { min-width: 110px; } }
  `,
})
export class LiveAccess {
  protected readonly state = inject(AppState);
  protected readonly cams = CAMS;
  protected readonly floors = ['G', 'F1', 'F2', 'F3', 'F5', 'F6', 'B1'];
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly events = signal<AccessEvent[]>(TODAY_EVENTS);
  protected readonly doors = signal<Door[]>(DOORS.map((d) => ({ ...d })));
  protected readonly menu = signal<'fs' | 'act' | 'more' | null>(null);
  protected readonly doorMenu = signal<string | null>(null);
  protected readonly lockdown = signal(false);
  protected readonly wall = signal(false);
  protected readonly cam = signal(0);
  protected readonly layout = signal<1 | 4>(1);
  protected readonly hours = signal(24);
  protected readonly topRange = signal('Today');
  protected readonly mapSite = signal('Head Office');
  protected readonly mapFloor = signal('G');
  protected readonly mapSel = signal<Door | null>(null);
  protected readonly detail = signal<AccessEvent | null>(null);
  protected readonly toast = signal<string | null>(null);
  private seq = 0;

  protected readonly cols: Col[] = [
    { key: 'time', label: 'Time' },
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'cred', label: 'Credential', kind: 'tag', tag: (r) => credTag(r.cred) },
    { key: 'door', label: 'Door / Location', kind: 'lines', fmt: (v, r) => `${v}\n${r.location}` },
    { key: 'kind', label: 'Event Type', kind: 'lines', fmt: (v, r) => (r.reason ? `${v}\n${r.reason}` : v) },
    { key: 'result', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'site', label: 'Site', options: ['Head Office', 'Manufacturing', 'Warehouse', 'Data Center', 'Regional Office', 'Tech Center', 'Logistics Hub', 'Retail Stores'] },
    { key: 'door', label: 'Door', options: KEY_DOORS.concat(['Parking Gate', 'Finance Office', 'Loading Bay', 'Meeting Room']) },
    { key: 'kind', label: 'Event Type', options: ['Access Granted', 'Access Denied', 'Request to Exit', 'Door Held Open', 'Door Forced Open'] },
    { key: 'result', label: 'Status', options: ['Granted', 'Denied', 'Alarm', 'Info'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details & snapshot', icon: 'user' },
    { id: 'grant', label: 'Grant one-time access', icon: 'door-open', when: (r) => r.result === 'Denied' },
    { id: 'watch', label: 'Add to watchlist', icon: 'triangle-alert', when: (r) => r.personId !== '-' },
  ];

  constructor() {
    // Live: a new access event every tick (≈2.5 s).
    effect(() => {
      const t = this.state.tick();
      if (!t) return;
      const p = PEOPLE[(t * 131) % 3000];
      const d = DOORS[(t * 7) % 30];
      const denied = this.lockdown() ? p.type !== 'Employee' || t % 2 === 0 : t % 9 === 0;
      const now = new Date();
      const e: AccessEvent = {
        id: `AE-L-${++this.seq}`, ts: now.getTime(), time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, cred: p.type === 'Other' ? 'Other' : p.type, door: d.name, location: d.location, site: d.site,
        kind: denied ? 'Access Denied' : 'Access Granted', reason: denied ? (this.lockdown() ? 'Lockdown active' : 'No Permission') : '', result: denied ? 'Denied' : 'Granted', method: METHODS[t % 4],
      };
      this.events.update((l) => [e, ...l]);
    });
  }

  private readonly scoped = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.events() : this.events().filter((e) => e.site === s.name);
  });
  protected readonly rows = this.scoped;
  protected readonly k = computed(() => {
    const l = this.scoped();
    let granted = 0;
    let denied = 0;
    let alarms = 0;
    for (const e of l) {
      if (e.result === 'Granted') granted++;
      else if (e.result === 'Denied') denied++;
      else if (e.result === 'Alarm') alarms++;
    }
    return { total: l.length, granted, denied, alarms: Math.min(alarms, 28), online: this.doors().filter((d) => d.status === 'Online').length };
  });
  protected readonly keyDoors = computed(() => KEY_DOORS.map((n) => this.doors().find((d) => d.name === n)!));
  protected readonly mapDoors = computed(() => this.doors().filter((d) => d.site === this.mapSite() && d.floor === this.mapFloor()));
  protected readonly recog = computed(() => this.events().find((e) => e.door === CAM_DOOR[this.cam()]) ?? this.events()[0]);
  protected readonly trend = computed(() => {
    const n = this.hours();
    const now = Date.now();
    const buckets = Array.from({ length: n }, (_, i) => now - (n - i) * 3600000);
    const labels = buckets.map((b) => new Date(b + 3600000).toLocaleTimeString('en-US', { hour: 'numeric' }));
    const g = buckets.map(() => 0);
    const d = buckets.map(() => 0);
    // Today's live events plus yesterday's history for the hours before midnight.
    const midnight = new Date().setHours(0, 0, 0, 0);
    const s = this.state.site();
    const past = HISTORY.filter((e) => e.ts < midnight && e.ts >= now - n * 3600000 && (s.factor === 1 || e.site === s.name));
    for (const e of [...this.scoped(), ...past]) {
      const i = Math.floor((e.ts - (now - n * 3600000)) / 3600000);
      if (i >= 0 && i < n) e.result === 'Denied' ? d[i]++ : g[i]++;
    }
    return {
      labels,
      series: [
        { name: 'Total', color: '#8b5cf6', values: g.map((v, i) => v + d[i]), area: true },
        { name: 'Granted', color: '#22c55e', values: g },
        { name: 'Denied', color: '#ef4444', values: d },
      ],
    };
  });
  protected readonly top = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.scoped()) m.set(e.door, (m.get(e.door) ?? 0) + 1);
    const total = this.scoped().length || 1;
    const mult = this.topRange() === 'This Week' ? 6.4 : 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([door, n]) => ({ door, n: Math.round(n * mult), pct: Math.round((n / total) * 1000) / 10 }));
  });

  protected count(s: string) {
    return this.doors().filter((d) => d.status === s).length;
  }
  protected pct(n: number) {
    return `${((n / (this.k().total || 1)) * 100).toFixed(1)}%`;
  }
  protected color(s: string) {
    return s === 'Online' ? '#22c55e' : s === 'Offline' ? '#ef4444' : '#f59e0b';
  }
  protected statusCls(s: string) {
    return /Online|Granted/.test(s) ? 'dt-status green' : /Alarm|Info/.test(s) ? (s === 'Info' ? 'dt-status blue' : 'dt-status amber') : 'dt-status red';
  }
  protected lastEvent(door: string) {
    return this.events().find((e) => e.door === door)?.time.replace(/:\d\d (?=[AP]M)/, ' ') ?? '-';
  }
  protected camFor(door: string) {
    const i = CAM_DOOR.indexOf(door);
    return i >= 0 ? i : door.length % 5;
  }
  private patchDoor(id: string, c: Partial<Door>) {
    this.doors.update((l) => l.map((d) => (d.id === id ? { ...d, ...c } : d)));
  }
  protected pulse(d: Door) {
    this.doorMenu.set(null);
    this.patchDoor(d.id, { locked: false });
    this.notify(`${d.name} unlocked for 5 seconds`);
    setTimeout(() => this.patchDoor(d.id, { locked: true }), 5000);
  }
  protected toggleLock(d: Door) {
    this.doorMenu.set(null);
    this.patchDoor(d.id, { locked: !d.locked });
    this.notify(`${d.name} ${d.locked ? 'held unlocked' : 'locked'}`);
  }
  protected ack(d: Door) {
    this.doorMenu.set(null);
    this.patchDoor(d.id, { status: 'Online', contact: 'Closed' });
    this.notify(`Alarm at ${d.name} acknowledged`);
  }
  protected setLockdown(on: boolean) {
    this.menu.set(null);
    this.lockdown.set(on);
    this.doors.update((l) => l.map((d) => ({ ...d, locked: on ? true : d.type !== 'Turnstile' })));
    this.notify(on ? 'Lockdown activated on all 102 doors' : 'Lockdown released');
  }
  protected unlockExits() {
    this.menu.set(null);
    this.notify('Emergency exits unlocked across all sites');
  }
  protected onAction(a: string, e: AccessEvent) {
    if (a === 'view') return this.detail.set(e);
    this.detail.set(null);
    this.notify(a === 'grant' ? `One-time access granted to ${e.name} at ${e.door}` : `${e.name} added to watchlist`);
  }
  protected fullscreen() {
    this.menu.set(null);
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }
  protected exportCsv() {
    this.menu.set(null);
    downloadCsv('access-events-today.csv', [['Time', 'Person', 'ID', 'Credential', 'Door', 'Location', 'Event', 'Reason', 'Method'], ...this.scoped().map((e) => [e.time, e.name, e.personId, e.cred, e.door, e.location, e.kind, e.reason, e.method])]);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }

  @HostListener('document:keydown.escape')
  protected esc() {
    this.wall.set(false);
    this.detail.set(null);
  }
  @HostListener('document:click', ['$event'])
  protected outside(e: Event) {
    if (!(e.target as HTMLElement).closest?.('.menu-wrap')) {
      this.menu.set(null);
      this.doorMenu.set(null);
    }
  }
}
