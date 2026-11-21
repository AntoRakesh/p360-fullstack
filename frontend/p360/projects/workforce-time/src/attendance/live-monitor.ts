import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv, rng } from '@p360/shared/data/demo-data';
import { DEPTS, SITES } from '@p360/shared/data/people.data';
import { aggregate, ampm, AttRecord, AttStatus, hhmm, RECORDS, STATUS_COLOR } from '@p360/shared/data/attendance.data';

interface LiveEvent {
  key: number;
  name: string;
  initials: string;
  avatar: string;
  id: string;
  sub: string;
  location: string;
  time: string;
  kind: 'Check-In' | 'Late' | 'Check-Out';
}

const nowMinus = (min: number) => new Date(Date.now() - min * 60000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const SEED_EVENTS: Omit<LiveEvent, 'key' | 'time'>[] = [
  { name: 'Arjun Mehta', initials: 'AM', avatar: 'var(--ka-0d9488)', id: 'EMP-00123', sub: 'IT', location: 'Main Entrance - Head Office', kind: 'Check-In' },
  { name: 'Priya Sharma', initials: 'PS', avatar: 'var(--ka-ca8a04)', id: 'EMP-00124', sub: 'HR', location: 'Reception - Head Office', kind: 'Check-In' },
  { name: 'Ramesh Kumar', initials: 'RK', avatar: 'var(--ka-16a34a)', id: 'CON-00456', sub: 'Contractor', location: 'Gate 2 - Manufacturing', kind: 'Check-In' },
  { name: 'Fatima Ali', initials: 'FA', avatar: 'var(--ka-db2777)', id: 'EMP-00128', sub: 'Operations', location: 'Warehouse - Zone B', kind: 'Check-In' },
  { name: 'Ahmed Hassan', initials: 'AH', avatar: 'var(--ka-ea580c)', id: 'EMP-00127', sub: 'Sales', location: 'Regional Office', kind: 'Check-In' },
  { name: 'Li Wei', initials: 'LW', avatar: 'var(--ka-2563eb)', id: 'EMP-00129', sub: 'R&D', location: 'Tech Center', kind: 'Late' },
  { name: 'Maria Santos', initials: 'MS', avatar: 'var(--ka-9333ea)', id: 'VIS-00982', sub: 'Visitor', location: 'Main Entrance - Head Office', kind: 'Check-In' },
  { name: 'David Lee', initials: 'DL', avatar: 'var(--ka-475569)', id: 'EMP-00130', sub: 'Support', location: 'Head Office', kind: 'Check-In' },
];
const CAMERAS = ['Head Office - Main Entrance', 'Head Office - Reception', 'Manufacturing - Gate 2', 'Warehouse - Zone B'];
const FLOORS = ['F3', 'F2', 'F1', 'G'];
const HOURS = ['6AM', '7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM'];
const LEGEND: [string, string][] = [['Present', 'var(--ka-22c55e)'], ['Late', 'var(--ka-f59e0b)'], ['Absent', 'var(--ka-ef4444)'], ['Visitor', 'var(--ka-8b5cf6)'], ['Contractor', 'var(--ka-3b82f6)']];

@Component({
  selector: 'app-live-monitor',
  imports: [...UI, DataTable, DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Live Attendance Monitor" parent="Time &amp; Attendance" parentLink="/time-attendance" subtitle="Real-time view of attendance across all sites and people.">
      <a class="btn-primary" routerLink="/time-attendance/attendance-reports-analytics"><app-icon name="file-chart" [size]="16" />View Reports</a>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="more.set(!more())" aria-label="More">⋮</button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export today's attendance</button>
            <a class="dd-item" routerLink="/time-attendance/attendance-transactions"><app-icon name="list-checks" [size]="15" />Open transactions</a>
            <a class="dd-item" routerLink="/time-attendance/absence-exception-management"><app-icon name="triangle-alert" [size]="15" />Open exceptions</a>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Employees" [value]="fmt(k().total)" icon="users" color="var(--ka-8b5cf6)" sub="On Roll" />
      <app-kpi label="Present Now" [value]="fmt(k().present)" [extra]="pct(k().present)" icon="clock" color="var(--ka-34d399)" change="+2.4%" />
      <app-kpi label="Late Arrivals" [value]="fmt(k().late)" [extra]="pct(k().late)" icon="clock" color="var(--ka-fb923c)" change="+0.6%" [good]="false" />
      <app-kpi label="Absent" [value]="fmt(k().absent)" [extra]="pct(k().absent)" icon="bell" color="var(--ka-ef4444)" change="-1.1%" [up]="false" />
      <app-kpi label="On Leave" [value]="fmt(k().leave)" [extra]="pct(k().leave)" icon="calendar-x" color="var(--ka-a855f7)" change="+0.3%" />
      <app-kpi label="Remote / WFH" [value]="fmt(k().wfh)" [extra]="pct(k().wfh)" icon="square-user" color="var(--ka-3b82f6)" change="+0.8%" />
    </section>

    <section class="card filterbar">
      <select class="select" [value]="state.site().name" (change)="setSite($any($event.target).value)">
        <option value="All Sites">All Sites</option>
        @for (s of sites; track s) {<option [value]="s">{{ s }}</option>}
      </select>
      <select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)">
        <option value="All">All Departments</option>
        @for (d of depts; track d) {<option [value]="d">{{ d }}</option>}
      </select>
      <select class="select" [value]="emp()" (change)="emp.set($any($event.target).value)">
        <option value="All">All Employment Types</option><option>Full Time</option><option>Part Time</option>
      </select>
      <select class="select" [value]="status()" (change)="status.set($any($event.target).value)">
        <option value="All">All Status</option>
        @for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}
      </select>
      <label class="search-box grow">
        <input placeholder="Search by name, ID or department..." [value]="q()" (input)="q.set($any($event.target).value)" />
        <app-icon name="search" [size]="15" />
      </label>
      <button class="btn-primary live-btn" [class.off]="!state.live()" (click)="toggleLive()"><app-icon name="wifi" [size]="15" />{{ state.live() ? 'Live' : 'Paused' }}</button>
      <div class="views">
        <button [class.on]="view() === 'grid'" (click)="view.set('grid')"><app-icon name="grid" [size]="15" [stroke]="2.4" />Grid</button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="list-checks" [size]="15" />List</button>
        <button [class.on]="view() === 'map'" (click)="view.set('map')"><app-icon name="map-pin" [size]="15" />Map</button>
      </div>
      <button class="mini" (click)="fullscreen()" aria-label="Full screen"><app-icon name="maximize" [size]="16" /></button>
    </section>

    @switch (view()) {
      @case ('grid') {
        <section class="lam">
          <!-- Recent events -->
          <div class="card events-card">
            <div class="card-head"><h3>Recent Attendance Events</h3><button class="link" (click)="view.set('list')">View All</button></div>
            <ul class="events">
              @for (e of events().slice(0, 8); track e.key) {
                <li class="ev" (click)="pickCamera(e)">
                  <span class="ev-ic"><app-icon name="id-card" [size]="13" /></span>
                  <span class="dt-av" [style.background]="e.avatar">{{ e.initials }}</span>
                  <div class="ev-body">
                    <b>{{ e.name }}</b>
                    <span>{{ e.id }} | {{ e.sub }}</span>
                    <small><app-icon name="map-pin" [size]="11" />{{ e.location }}</small>
                  </div>
                  <time>{{ e.time }}</time>
                  <span class="pill" [class.late]="e.kind === 'Late'" [class.out]="e.kind === 'Check-Out'">{{ e.kind }}</span>
                </li>
              } @empty {
                <li class="empty-note">No events match the filters</li>
              }
            </ul>
          </div>

          <!-- Camera -->
          <div class="card cam-card">
            <div class="card-head">
              <h3>Live Camera Feeds</h3>
              <div class="toolbar">
                <select class="select sm" [value]="camera()" (change)="camera.set($any($event.target).value)">
                  @for (c of cameras; track c) {<option [value]="c">{{ c }}</option>}
                </select>
                <button class="link" (click)="view.set('list')">View All</button>
              </div>
            </div>
            <div class="cam-wrap">
              <div class="feed">
                <svg viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice">
                  <defs><linearGradient id="lamsky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ka-9fb7c8)" /><stop offset="1" stop-color="var(--ka-e5e9ee)" /></linearGradient></defs>
                  <rect width="300" height="420" fill="url(#lamsky)" />
                  <rect width="300" height="30" fill="var(--ka-4b5563)" />
                  <g stroke="var(--kl-5b6573)" stroke-width="5"><path d="M30 30v200M110 30v200M190 30v200M270 30v200M0 120h300" /></g>
                  <path d="M0 230h300v190H0z" fill="var(--ka-aab3bd)" />
                  <path d="M0 420 120 230h60l120 190" fill="var(--ka-c6ccd3)" opacity=".6" />
                  <g fill="var(--ka-3f7d4a)"><ellipse cx="6" cy="160" rx="26" ry="90" /><ellipse cx="294" cy="150" rx="24" ry="95" /></g>
                  <g fill="var(--ka-9ca3af)"><rect x="40" y="250" width="50" height="60" rx="4" /><rect x="210" y="250" width="50" height="60" rx="4" /></g>
                  <g fill="var(--ka-1f2937)" [attr.transform]="'translate(' + shift() + ' 0)'">
                    <circle cx="200" cy="170" r="11" /><rect x="186" y="183" width="28" height="70" rx="11" />
                    <circle cx="245" cy="180" r="9" /><rect x="234" y="191" width="22" height="58" rx="9" />
                    <circle cx="130" cy="190" r="22" /><rect x="100" y="214" width="60" height="206" rx="24" />
                    <rect x="124" y="214" width="12" height="60" fill="var(--ka-e5e7eb)" />
                  </g>
                  <rect [attr.x]="104 + shift()" y="162" width="52" height="58" fill="none" stroke="var(--kl-22c55e)" stroke-width="2.5" />
                  <rect [attr.x]="186 + shift()" y="155" width="28" height="30" fill="none" stroke="var(--kl-22c55e)" stroke-width="2" />
                </svg>
                @if (focus(); as f) {
                  <div class="recog">
                    <span class="dt-av" [style.background]="f.avatar">{{ f.initials }}</span>
                    <div><b>{{ f.name }}</b><span>{{ f.id }}</span><span>{{ f.sub }} Department</span></div>
                    <div class="recog-foot"><span class="good">● {{ f.kind }}</span><span>⏱ {{ f.time }}</span></div>
                  </div>
                }
                @if (state.live()) {<span class="rec"><i></i>LIVE</span>}
              </div>
              <ul class="thumbs">
                @for (e of events().slice(0, 4); track e.key) {
                  <li [class.on]="focus()?.key === e.key" (click)="focusKey.set(e.key)">
                    <span class="thumb" [style.background]="e.avatar">{{ e.initials }}</span>
                    <div><small>{{ e.time }}</small><b>{{ e.name }}</b><span class="pill" [class.late]="e.kind === 'Late'">{{ e.kind }}</span></div>
                  </li>
                }
              </ul>
            </div>
          </div>

          <!-- Status + trend -->
          <div class="card status-card">
            <div class="card-head"><h3>Attendance Status</h3></div>
            <div class="status-box">
              <div class="ring-wrap">
                <app-donut [segments]="donut()" [legend]="false" [size]="150" center="Present Now" />
                <div class="ring-mid"><b>{{ fmt(k().present) }}</b><span>Present Now</span><b class="p">{{ pct(k().present) }}</b></div>
              </div>
              <ul class="st-legend">
                @for (s of legendRows(); track s.label) {
                  <li (click)="status.set(status() === s.label ? 'All' : s.label)" [class.dim]="status() !== 'All' && status() !== s.label">
                    <i [style.background]="s.color"></i><span>{{ s.label === 'WFH' ? 'WFH / Remote' : s.label }}</span><b>{{ fmt(s.value) }}</b><em>{{ pct(s.value) }}</em>
                  </li>
                }
              </ul>
            </div>
            <div class="card-head trend-head">
              <h3>Today's Attendance Trend</h3>
              <select class="select sm" [value]="trendDay()" (change)="trendDay.set($any($event.target).value)">
                <option>Today</option><option>Yesterday</option><option>Same day last week</option>
              </select>
            </div>
            <app-column-chart [labels]="hours" [series]="trend()" [height]="190" />
          </div>

          <!-- Location -->
          <div class="card loc-card">
            <div class="card-head">
              <h3>People Location (Live)</h3>
              <div class="toolbar">
                <select class="select sm" [value]="floor()" (change)="floor.set($any($event.target).value)">
                  <option value="All">Head Office - All Floors</option>
                  @for (f of floors; track f) {<option [value]="f">Head Office - Floor {{ f.slice(1) || f }}</option>}
                </select>
                <button class="mini" (click)="view.set('map')" aria-label="Expand map"><app-icon name="maximize" [size]="15" /></button>
              </div>
            </div>
            <div class="map-box">
              <div class="floor-col">
                <button [class.on]="floor() === 'All'" (click)="floor.set('All')">All</button>
                @for (f of floors; track f) {<button [class.on]="floor() === f" (click)="floor.set(f)">{{ f }}</button>}
              </div>
              <div class="map" (click)="sel.set(null)">
                <svg viewBox="0 0 420 200" [style.transform]="'scale(' + zoom() + ')'">
                  <rect width="420" height="200" fill="var(--ka-f1f2f6)" />
                  <g class="walls"><rect x="5" y="5" width="410" height="190" /><path d="M5 60h410M5 140h410M70 5v55M140 5v55M210 5v55M280 5v55M350 5v55M80 140v55M160 140v55M240 140v55M320 140v55M100 80h80v40h-80zM250 80h90v40h-90z" /></g>
                  @for (d of dots(); track d.id) {
                    <circle class="dot" [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="sel()?.id === d.id ? 8 : 5.5" [attr.fill]="d.color" (click)="$event.stopPropagation(); sel.set(d)"><title>{{ d.name }}</title></circle>
                  }
                </svg>
                @if (sel(); as s) {
                  <div class="tip" [style.left.%]="(s.x / 420) * 100" [style.top.%]="(s.y / 200) * 100">
                    <span class="dt-av" [style.background]="s.avatar">{{ s.initials }}</span>
                    <div><b>{{ s.name }}</b><small>{{ s.id }}</small><small>{{ s.dept }} Department</small><small>{{ s.time }}</small></div>
                  </div>
                }
                <div class="zoom"><button (click)="$event.stopPropagation(); zoomBy(0.25)">+</button><button (click)="$event.stopPropagation(); zoomBy(-0.25)">−</button></div>
              </div>
            </div>
            <div class="map-legend">
              @for (l of legend; track l[0]) {<span><i [style.background]="l[1]"></i>{{ l[0] }}</span>}
              <span><app-icon name="user" [size]="12" />Selected Person</span>
            </div>
          </div>

          <!-- Department table -->
          <div class="card dept-card">
            <div class="card-head">
              <h3>Department Wise Attendance</h3>
              <select class="select sm" [value]="deptPeriod()" (change)="deptPeriod.set($any($event.target).value)"><option>Today</option><option>This Week</option><option>This Month</option></select>
            </div>
            <table class="table agg">
              <thead><tr><th>Department</th><th class="num">Present</th><th class="num">Late</th><th class="num">Absent</th><th>% Present</th></tr></thead>
              <tbody>
                @for (d of byDept(); track d.name) {
                  <tr class="clickable" [class.selected]="dept() === d.name" (click)="dept.set(dept() === d.name ? 'All' : d.name)">
                    <td>{{ d.name }}</td><td class="num">{{ d.present | number }}</td><td class="num">{{ d.late | number }}</td><td class="num">{{ d.absent | number }}</td>
                    <td><span class="pct">{{ d.pct }}%</span><span class="bar"><i [style.width.%]="d.pct"></i></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Site table -->
          <div class="card site-card">
            <div class="card-head">
              <h3>Site Wise Attendance</h3>
              <select class="select sm" [value]="sitePeriod()" (change)="sitePeriod.set($any($event.target).value)"><option>Today</option><option>This Week</option><option>This Month</option></select>
            </div>
            <table class="table agg">
              <thead><tr><th>Site</th><th class="num">Present</th><th class="num">Late</th><th class="num">Absent</th><th>% Present</th></tr></thead>
              <tbody>
                @for (d of bySite(); track d.name) {
                  <tr class="clickable" [class.selected]="state.site().name === d.name" (click)="setSite(state.site().name === d.name ? 'All Sites' : d.name)">
                    <td>{{ d.name }}</td><td class="num">{{ d.present | number }}</td><td class="num">{{ d.late | number }}</td><td class="num">{{ d.absent | number }}</td>
                    <td><span class="pct">{{ d.pct }}%</span><span class="bar"><i [style.width.%]="d.pct"></i></span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
      @case ('list') {
        <div class="card">
          <app-data-table [rows]="filtered()" [columns]="cols" noun="employees" [pageSize]="20"
            [searchKeys]="['name', 'id', 'dept']" searchPlaceholder="Search within results..." />
        </div>
      }
      @case ('map') {
        <section class="map-view">
          <div class="card">
            <div class="card-head">
              <h3>People Location · Head Office {{ floor() === 'All' ? '(all floors)' : 'Floor ' + floor() }}</h3>
              <div class="tabs">
                <button [class.on]="floor() === 'All'" (click)="floor.set('All')">All</button>
                @for (f of floors; track f) {<button [class.on]="floor() === f" (click)="floor.set(f)">{{ f }}</button>}
              </div>
            </div>
            <div class="map big" (click)="sel.set(null)">
              <svg viewBox="0 0 420 200">
                <rect width="420" height="200" fill="var(--ka-f1f2f6)" />
                <g class="walls"><rect x="5" y="5" width="410" height="190" /><path d="M5 60h410M5 140h410M70 5v55M140 5v55M210 5v55M280 5v55M350 5v55M80 140v55M160 140v55M240 140v55M320 140v55M100 80h80v40h-80zM250 80h90v40h-90z" /></g>
                @for (d of dots(); track d.id) {
                  <circle class="dot" [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="sel()?.id === d.id ? 6 : 4" [attr.fill]="d.color" (click)="$event.stopPropagation(); sel.set(d)"><title>{{ d.name }}</title></circle>
                }
              </svg>
              @if (sel(); as s) {
                <div class="tip" [style.left.%]="(s.x / 420) * 100" [style.top.%]="(s.y / 200) * 100">
                  <span class="dt-av" [style.background]="s.avatar">{{ s.initials }}</span>
                  <div><b>{{ s.name }}</b><small>{{ s.id }}</small><small>{{ s.dept }} Department</small><small>{{ s.time }}</small></div>
                </div>
              }
            </div>
            <div class="map-legend">@for (l of legend; track l[0]) {<span><i [style.background]="l[1]"></i>{{ l[0] }}</span>}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>On this floor <span class="card-sub">{{ dots().length }}</span></h3></div>
            <ul class="occupants">
              @for (d of dots().slice(0, 60); track d.id) {
                <li [class.on]="sel()?.id === d.id" (click)="sel.set(d)"><i [style.background]="d.color"></i>{{ d.name }}<small>{{ d.dept }}</small></li>
              }
            </ul>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .filterbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 12px; }
    .filterbar .select { min-width: 128px; }
    .grow { flex: 1 1 180px; } .grow input { width: 100%; }
    .live-btn.off { background: var(--kb-9ca3af); box-shadow: none; }
    .views { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .views button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 0; background: var(--kb-ffffff); font-size: 12.5px; cursor: pointer; color: var(--kf-3b3f5c); }
    .views button + button { border-left: 1px solid var(--border); }
    .views button.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .mini { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; }
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; }

    .lam { display: grid; grid-template-columns: 1.05fr 1fr 0.95fr; gap: 12px; }
    .lam > .card { min-width: 0; }
    @media (max-width: 1350px) { .lam { grid-template-columns: 1fr 1fr; } .status-card { grid-column: span 2; } }
    @media (max-width: 860px) { .lam { grid-template-columns: 1fr; } .status-card { grid-column: auto; } }

    .events { list-style: none; margin: 0; padding: 0; }
    .ev { display: grid; grid-template-columns: 22px 38px 1fr auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; animation: rowin .5s ease; }
    .ev:last-child { border-bottom: 0; } .ev:hover { background: var(--kb-faf8ff); }
    @keyframes rowin { from { background: var(--kb-ecfdf5); } }
    .ev-ic { width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--kl-c4b5fd); color: var(--primary); display: grid; place-items: center; }
    .ev .dt-av { width: 38px; height: 38px; }
    .ev-body { display: flex; flex-direction: column; min-width: 0; font-size: 11.5px; line-height: 1.35; }
    .ev-body b { font-size: 12.5px; } .ev-body span { color: var(--kf-4b4f6b); }
    .ev-body small { display: flex; align-items: center; gap: 3px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ev time { font-size: 11.5px; color: var(--kf-4b4f6b); align-self: start; padding-top: 2px; }
    .pill { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11.5px; background: var(--kb-dcfce7); color: var(--kf-15803d); white-space: nowrap; }
    .pill.late { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .pill.out { background: var(--kb-e0e7ff); color: var(--kf-4338ca); }

    .cam-wrap { display: grid; grid-template-columns: 1fr 120px; gap: 10px; }
    .feed { position: relative; border-radius: 8px; overflow: hidden; min-height: 360px; }
    .feed svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .recog { position: absolute; left: 12%; top: 45%; display: grid; grid-template-columns: 36px 1fr; gap: 4px 10px; padding: 10px 12px; border-radius: 8px; background: var(--kb-ffffff); box-shadow: 0 6px 20px rgba(0,0,0,.2); font-size: 11.5px; min-width: 160px; animation: rowin .4s; }
    .recog div { display: flex; flex-direction: column; } .recog b { font-size: 12.5px; } .recog span { color: var(--kf-4b4f6b); }
    .recog-foot { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 2px; padding-top: 6px; border-top: 1px solid var(--kl-f0f1f6); }
    .rec { position: absolute; top: 10px; left: 10px; display: flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 4px; background: rgba(0,0,0,.55); color: var(--kf-ffffff); font-size: 10.5px; font-weight: 700; }
    .rec i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-ef4444); animation: blink 1s infinite; }
    @keyframes blink { 50% { opacity: .2; } }
    .thumbs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .thumbs li { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 11px; }
    .thumbs li.on { border-color: var(--primary); background: var(--kb-faf8ff); }
    .thumbs li div { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; } .thumbs small { color: var(--muted); }
    .thumb { height: 46px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); font-weight: 700; }

    .status-box { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .ring-wrap { position: relative; } .ring-wrap ::ng-deep .donut-mid { display: none; }
    .ring-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; font-size: 11.5px; }
    .ring-mid b { font-size: 19px; } .ring-mid .p { font-size: 14px; }
    .st-legend { flex: 1; min-width: 170px; list-style: none; margin: 0; padding: 0; }
    .st-legend li { display: grid; grid-template-columns: 11px 1fr auto 44px; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; cursor: pointer; }
    .st-legend li.dim { opacity: .4; } .st-legend i { width: 10px; height: 10px; border-radius: 50%; } .st-legend em { font-style: normal; color: var(--muted); text-align: right; }
    .trend-head { margin-top: 16px; }

    .map-box { display: flex; gap: 8px; }
    .floor-col { display: flex; flex-direction: column; gap: 5px; }
    .floor-col button { width: 30px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); font-size: 11.5px; cursor: pointer; }
    .floor-col button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .map { position: relative; flex: 1; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; aspect-ratio: 420 / 200; }
    .map svg { width: 100%; height: 100%; display: block; transition: transform .3s; }
    .walls { fill: none; stroke: var(--kl-b4b9c6); stroke-width: 2; }
    .dot { stroke: var(--kl-ffffff); stroke-width: 1.5; cursor: pointer; transition: cx 2.4s linear, cy 2.4s linear; }
    .tip { position: absolute; transform: translate(12px, -50%); display: flex; gap: 8px; padding: 8px 10px; background: var(--kb-ffffff); border-radius: 8px; box-shadow: 0 6px 18px rgba(20,20,60,.18); font-size: 11px; z-index: 2; white-space: nowrap; }
    .tip div { display: flex; flex-direction: column; } .tip small { color: var(--muted); }
    .zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .zoom button { width: 26px; height: 26px; border: 0; background: var(--kb-ffffff); cursor: pointer; } .zoom button + button { border-top: 1px solid var(--border); }
    .map-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font-size: 11.5px; color: var(--kf-3b3f5c); }
    .map-legend span { display: inline-flex; align-items: center; gap: 5px; } .map-legend i { width: 10px; height: 10px; border-radius: 50%; }

    .agg { font-size: 12px; } .agg th, .agg td { padding: 7px 6px; }
    .pct { display: inline-block; width: 46px; } .bar { display: inline-block; width: 50px; height: 8px; border-radius: 2px; background: var(--kb-eef0f6); vertical-align: middle; overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--kb-7c3aed); }

    .map-view { display: grid; grid-template-columns: 1fr 280px; gap: 12px; }
    .map.big { aspect-ratio: 420 / 200; }
    .occupants { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow: auto; font-size: 12.5px; }
    .occupants li { display: grid; grid-template-columns: 10px 1fr; gap: 0 8px; padding: 6px 4px; cursor: pointer; border-radius: 6px; }
    .occupants li.on, .occupants li:hover { background: var(--kb-faf8ff); }
    .occupants i { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; grid-row: span 2; } .occupants small { color: var(--muted); }
    @media (max-width: 900px) { .map-view { grid-template-columns: 1fr; } .cam-wrap { grid-template-columns: 1fr; } }
  `,
})
export class LiveMonitor {
  protected readonly state = inject(AppState);
  protected readonly sites = SITES;
  protected readonly depts = DEPTS;
  protected readonly statuses: AttStatus[] = ['Present', 'Late', 'Absent', 'On Leave', 'WFH'];
  protected readonly cameras = CAMERAS;
  protected readonly floors = FLOORS;
  protected readonly hours = HOURS;
  protected readonly legend = LEGEND;
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');

  protected readonly records = signal<AttRecord[]>(RECORDS);
  protected readonly dept = signal('All');
  protected readonly emp = signal('All');
  protected readonly status = signal('All');
  protected readonly q = signal('');
  protected readonly view = signal<'grid' | 'list' | 'map'>('grid');
  protected readonly more = signal(false);
  protected readonly camera = signal(CAMERAS[0]);
  protected readonly focusKey = signal<number | null>(null);
  protected readonly floor = signal('F1');
  protected readonly zoom = signal(1);
  protected readonly trendDay = signal('Today');
  protected readonly deptPeriod = signal('Today');
  protected readonly sitePeriod = signal('Today');
  protected readonly sel = signal<{ id: string; name: string; initials: string; avatar: string; dept: string; x: number; y: number; color: string; time: string } | null>(null);
  protected readonly events = signal<LiveEvent[]>(SEED_EVENTS.map((e, i) => ({ ...e, key: i, time: nowMinus(i === 0 ? 0 : i + Math.floor(i / 2)) })));
  private nextKey = 100;

  constructor() {
    // While live: an absent employee arrives (late) every ~15 s and appears in the feed.
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 6) return;
      const list = this.records();
      const i = list.findIndex((r, j) => r.status === 'Absent' && j % 7 === t % 7);
      if (i < 0) return;
      const r = list[i];
      const time = new Date();
      const checkIn = hhmm(time.getHours() * 60 + time.getMinutes());
      this.records.update((l) => l.map((x, j) => (j === i ? { ...x, status: 'Late', checkIn, lateBy: 30 + (t % 50), location: `Main Entrance - ${x.site}`, method: 'Face' } : x)));
      this.events.update((e) => [{ key: this.nextKey++, name: r.name, initials: r.initials, avatar: r.avatar, id: r.id, sub: r.dept, location: `Main Entrance - ${r.site}`, time: time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), kind: 'Late' as const }, ...e].slice(0, 40));
    });
  }

  /** Records after site + filter bar (department, type, status, search). */
  protected readonly filtered = computed(() => {
    const s = this.state.site();
    const q = this.q().trim().toLowerCase();
    return this.records().filter(
      (r) =>
        (s.factor === 1 || r.site === s.name) &&
        (this.dept() === 'All' || r.dept === this.dept()) &&
        (this.emp() === 'All' || r.empType === this.emp()) &&
        (this.status() === 'All' || r.status === this.status()) &&
        (!q || `${r.name} ${r.id} ${r.dept}`.toLowerCase().includes(q)),
    );
  });
  /** Same but ignoring the status filter (for KPIs and charts). */
  private readonly scoped = computed(() => {
    const s = this.state.site();
    return this.records().filter((r) => (s.factor === 1 || r.site === s.name) && (this.dept() === 'All' || r.dept === this.dept()) && (this.emp() === 'All' || r.empType === this.emp()));
  });
  protected readonly k = computed(() => {
    const c = { total: 0, Present: 0, WFH: 0, Late: 0, 'On Leave': 0, Absent: 0 } as Record<string, number>;
    for (const r of this.scoped()) {
      c['total']++;
      c[r.status]++;
    }
    return { total: c['total'], present: c['Present'] + c['WFH'], late: c['Late'], absent: c['Absent'] + c['On Leave'], leave: c['On Leave'], wfh: c['WFH'], onsite: c['Present'], unplanned: c['Absent'] };
  });
  protected readonly donut = computed(() => {
    const k = this.k();
    return [
      { label: 'Present', value: k.onsite, color: STATUS_COLOR.Present },
      { label: 'WFH', value: k.wfh, color: STATUS_COLOR.WFH },
      { label: 'Late', value: k.late, color: STATUS_COLOR.Late },
      { label: 'On Leave', value: k.leave, color: STATUS_COLOR['On Leave'] },
      { label: 'Absent', value: k.unplanned, color: STATUS_COLOR.Absent },
    ];
  });
  protected readonly legendRows = computed(() => {
    const k = this.k();
    return [
      { label: 'Present', value: k.present, color: STATUS_COLOR.Present },
      { label: 'Late', value: k.late, color: STATUS_COLOR.Late },
      { label: 'Absent', value: k.absent, color: STATUS_COLOR.Absent },
      { label: 'On Leave', value: k.leave, color: STATUS_COLOR['On Leave'] },
      { label: 'WFH', value: k.wfh, color: STATUS_COLOR.WFH },
    ];
  });
  protected readonly trend = computed(() => {
    const f = this.k().total / 8920;
    const r = rng(this.trendDay().length * 13);
    const expected = [120, 760, 2150, 2380, 900, 260, 180, 160, 420, 260, 180, 140, 90, 60, 40];
    const nowH = new Date().getHours();
    return [
      { name: 'Expected', color: 'var(--ka-ddd6fe)', values: expected.map((v) => Math.round(v * f)) },
      {
        name: 'Present',
        color: 'var(--ka-7c3aed)',
        values: expected.map((v, i) => (this.trendDay() === 'Today' && i + 6 > nowH ? 0 : Math.round(v * f * (0.78 + r() * 0.2)))),
      },
    ];
  });
  protected readonly byDept = computed(() => {
    const m = { Today: 1, 'This Week': 5, 'This Month': 21 }[this.deptPeriod()] ?? 1;
    const s = this.state.site();
    const rows = this.records().filter((r) => s.factor === 1 || r.site === s.name);
    return aggregate(rows, 'dept').map((d) => ({ ...d, present: d.present * m, late: d.late * m, absent: d.absent * m }));
  });
  protected readonly bySite = computed(() => {
    const m = { Today: 1, 'This Week': 5, 'This Month': 21 }[this.sitePeriod()] ?? 1;
    const rows = this.records().filter((r) => this.dept() === 'All' || r.dept === this.dept());
    return aggregate(rows, 'site').map((d) => ({ ...d, present: d.present * m, late: d.late * m, absent: d.absent * m }));
  });
  protected readonly focus = computed(() => {
    const list = this.events();
    return list.find((e) => e.key === this.focusKey()) ?? list[0] ?? null;
  });
  protected readonly shift = computed(() => (this.state.live() ? (this.state.tick() % 6) - 3 : 0));

  /** Map dots: on-site people of Head Office spread over floors. */
  protected readonly dots = computed(() => {
    const t = this.state.tick();
    const f = this.floor();
    const onsite = this.records().filter((r) => r.site === 'Head Office' && (r.status === 'Present' || r.status === 'Late'));
    const extra = [
      { name: 'Maria Santos', kind: 'Visitor' },
      { name: 'Elena Petrova', kind: 'Visitor' },
      { name: 'Ramesh Kumar', kind: 'Contractor' },
      { name: 'Jacob Thomas', kind: 'Contractor' },
    ];
    const r = rng(77);
    const all = onsite.slice(0, 160).map((p, i) => {
      const fl = i === 1 ? 'F1' : FLOORS[i % 4];
      const x = i === 1 ? 300 : 20 + r() * 380;
      const y = i === 1 ? 100 : 15 + r() * 170;
      return { id: p.id, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, floor: fl, x, y, color: p.status === 'Late' ? STATUS_COLOR.Late : STATUS_COLOR.Present, time: ampm(p.checkIn) };
    });
    extra.forEach((e, i) => all.push({ id: `X${i}`, name: e.name, initials: e.name.split(' ').map((x) => x[0]).join(''), avatar: 'var(--ka-64748b)', dept: e.kind, floor: FLOORS[i % 4], x: 60 + i * 80, y: 100, color: e.kind === 'Visitor' ? 'var(--ka-8b5cf6)' : 'var(--ka-3b82f6)', time: 'on site' }));
    all.push({ id: 'ABS', name: 'Badge without check-in', initials: '!', avatar: 'var(--ka-ef4444)', dept: 'Security', floor: 'F1', x: 230, y: 70, color: STATUS_COLOR.Absent, time: 'flagged 10:20' });
    return all
      .filter((d) => f === 'All' || d.floor === f)
      .map((d, i) => (t && d.id !== this.sel()?.id ? { ...d, x: d.x + Math.sin(t / 3 + i) * 4, y: d.y + Math.cos(t / 4 + i) * 3 } : d));
  });

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'site', label: 'Site' },
    { key: 'shift', label: 'Shift', fmt: (v, r) => `${v} (${r.shiftStart})` },
    { key: 'checkIn', label: 'Check-in', fmt: (v) => ampm(v) },
    { key: 'lateBy', label: 'Late by', kind: 'num', fmt: (v) => (v ? `${v} min` : '—') },
    { key: 'method', label: 'Method' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];

  protected pct(n: number) {
    const t = this.k().total || 1;
    return `${((n / t) * 100).toFixed(1)}%`;
  }
  protected setSite(name: string) {
    this.state.site.set(this.state.sites.find((s) => s.name === name) ?? this.state.sites[0]);
  }
  protected toggleLive() {
    if (!this.state.isToday()) this.state.date.set(new Date());
    this.state.liveEnabled.set(!this.state.live());
  }
  protected pickCamera(e: LiveEvent) {
    this.focusKey.set(e.key);
  }
  protected zoomBy(d: number) {
    this.zoom.update((z) => Math.min(2, Math.max(1, z + d)));
  }
  protected fullscreen() {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  }
  protected exportCsv() {
    this.more.set(false);
    downloadCsv('attendance-today.csv', [
      ['ID', 'Name', 'Department', 'Site', 'Shift', 'Status', 'Check-in', 'Late (min)', 'Method', 'Location'],
      ...this.filtered().map((r) => [r.id, r.name, r.dept, r.site, r.shift, r.status, r.checkIn, r.lateBy, r.method, r.location]),
    ]);
  }
}
