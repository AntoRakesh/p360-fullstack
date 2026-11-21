import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { FloorPlan, MapCallout, MapMarker, MapPath } from '@p360/shared/visuals/floor-plan';
import { E_BUILDING, E_ZONES, EXITS, EmergencyStore, MUSTER_XY, ROUTES, fmtClock, fmtTimer, mapXY, musterStatus } from './emergency.data';
import { EmergencyModals } from './emergency-modals';

const FLOORS = ['Roof', 'Floor 5', 'Floor 4', 'Floor 3', 'Floor 2', 'Floor 1', 'Ground Floor', 'Basement'];

@Component({
  selector: 'app-emergency-command-center',
  imports: [...UI, FloorPlan, RouterLink, EmergencyModals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Emergency Command Center" parent="Emergency Evacuation &amp; Mustering" parentLink="/emergency-mustering" subtitle="Real-time situational awareness, evacuation progress and muster status across all sites.">
      <button class="btn-danger" (click)="modals.open('trigger')"><app-icon name="triangle-alert" [size]="17" />{{ store.drillMode() ? 'Start Drill' : 'Trigger Evacuation' }}</button>
      <button class="btn-outline" [class.on]="store.drillMode()" (click)="store.drillMode.set(!store.drillMode())"><app-icon name="locate" [size]="16" />Drill Mode</button>
      <a class="btn-outline" routerLink="/emergency-mustering/incidents-reports"><app-icon name="file-chart" [size]="16" />View Reports</a>
      <div class="menu-wrap">
        <button class="btn-outline icon-only" (click)="menu.set(menu() === 'more' ? null : 'more')"><app-icon name="more" [size]="16" /></button>
        @if (menu() === 'more') {
          <div class="dropdown right">
            <button class="dd-item" (click)="exportCsv()">Export roll-call (CSV)</button>
            <a class="dd-item" routerLink="/emergency-mustering/configuration-masters">Configuration</a>
          </div>
        }
      </div>
    </app-page-head>
    @if (store.drillMode()) {<div class="drill">DRILL MODE — new evacuations are logged as exercises and notifications are tagged “DRILL”.</div>}

    <section class="kpi-row six">
      <app-kpi label="Active Evacuations" [value]="activeCount()" icon="bell-ring" color="var(--ka-ef4444)" [sub]="activeCount() ? 'Head Office – ' + evac()!.type : 'None active'" subColor="var(--ka-dc2626)" />
      <app-kpi label="Total People On-Site" [value]="c().total" icon="users" color="var(--ka-3b82f6)" sub="Live count" />
      <app-kpi label="Evacuated" [value]="c().evac" icon="shield-check" color="var(--ka-22c55e)" [sub]="pct(c().evac) + '%'" subColor="var(--ka-16a34a)" />
      <app-kpi label="Yet to Evacuate" [value]="c().yet" icon="run" color="var(--ka-f59e0b)" [sub]="pct(c().yet) + '%'" subColor="var(--ka-d97706)" />
      <app-kpi label="Missing" [value]="c().missing" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="pct(c().missing) + '%'" subColor="var(--ka-dc2626)" />
      <app-kpi label="Muster Points" [value]="store.musters().length" icon="users" color="var(--ka-7c3aed)" [sub]="complete() + ' complete | ' + (store.musters().length - complete()) + ' in progress'" subColor="var(--ka-7c3aed)" />
    </section>

    <section class="ecc">
      <div class="left">
        <div class="card">
          <div class="card-head map-head">
            <h3>Site Map &amp; Live Evacuation Status</h3>
            <div class="hsel">
              <select class="input"><option>Head Office</option><option>Manufacturing</option><option>Warehouse</option></select>
              <select class="input" [value]="floor()" (change)="floor.set($any($event.target).value)">@for (f of floors; track f) {<option [value]="f">{{ f }}</option>}</select>
              <div class="menu-wrap">
                <button class="btn-outline" (click)="menu.set(menu() === 'layers' ? null : 'layers')"><app-icon name="layers" [size]="15" />Layers<app-icon name="chevron-down" [size]="14" /></button>
                @if (menu() === 'layers') {
                  <div class="dropdown right opts">
                    @for (l of layerNames; track l) {<label><input type="checkbox" [checked]="layer(l)" (change)="flip(l)" />{{ l }}</label>}
                  </div>
                }
              </div>
            </div>
          </div>
          <div class="map-body">
            <ul class="floors">@for (f of floors; track f) {<li [class.on]="floor() === f" (click)="floor.set(f)">{{ f }}</li>}</ul>
            <app-floor-plan [zones]="zones()" [markers]="markers()" [paths]="paths()" [callout]="callout()" [building]="building" [outdoor]="true" [height]="370" (markerClick)="clickMarker($event)" />
          </div>
          <div class="legend">
            <span><i class="dot g"></i>People (Live)</span><span><i class="pi g"><app-icon name="user" [size]="11" /></i>Evacuated</span><span><i class="pi a"><app-icon name="user" [size]="11" /></i>Yet to Evacuate</span>
            <span><i class="pi r"><app-icon name="user" [size]="11" /></i>Missing</span><span><i class="pi g"><app-icon name="users" [size]="11" /></i>Muster Point</span><span><b class="route">- - ➜</b>Evacuation Route</span>
          </div>
        </div>
        <div class="row2">
          <div class="card">
            <div class="card-head"><h3>Evacuation Progress</h3></div>
            <div class="prog">
              <app-donut [segments]="donut()" [value]="pct(c().evac) + '%'" center="Evacuated" [size]="120" [legend]="false" />
              <ul>
                <li><i style="background:var(--kb-22c55e)"></i><em>Evacuated</em><b>{{ c().evac }}</b><span>({{ pct(c().evac) }}%)</span></li>
                <li><i style="background:var(--kb-f59e0b)"></i><em>Yet to Evacuate</em><b>{{ c().yet }}</b><span>({{ pct(c().yet) }}%)</span></li>
                <li><i style="background:var(--kb-ef4444)"></i><em>Missing</em><b>{{ c().missing }}</b><span>({{ pct(c().missing) }}%)</span></li>
                <li><i style="background:var(--kb-c4b5fd)"></i><em>Total On-Site</em><b>{{ c().total }}</b><span>(100%)</span></li>
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>People by Department</h3><a class="link" routerLink="/emergency-mustering/accountability">View All</a></div>
            <table class="table mini">
              <thead><tr><th>Department</th><th>On-Site</th><th>Evacuated</th><th>Pending</th><th>Missing</th><th>Progress</th></tr></thead>
              <tbody>
                @for (d of depts(); track d.name) {
                  <tr [class.tot]="d.name === 'Total'"><td>{{ d.name }}</td><td>{{ d.total }}</td><td>{{ d.evac }}</td><td class="r">{{ d.yet }}</td><td class="r">{{ d.missing }}</td>
                    <td><div class="pb"><div class="bar"><i [style.width.%]="d.pct"></i></div><span>{{ d.pct }}%</span></div></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="right">
        <div class="card">
          @if (evac(); as e) {
            <div class="card-head ae-head">
              <h3>Active Evacuation</h3>
              <span class="pill" [class.done]="e.endedAt">{{ e.endedAt ? 'All Clear' : e.drill ? 'Drill in Progress' : 'In Progress' }}</span>
              <span class="timer"><app-icon name="clock" [size]="20" />{{ timer() }}</span>
            </div>
            <div class="ae">
              <dl>
                <dt>Incident Type</dt><dd>{{ e.type }}</dd><dt>Location</dt><dd>{{ e.location }}</dd><dt>Triggered At</dt><dd>{{ triggered() }}</dd>
                <dt>Triggered By</dt><dd>{{ e.by }}</dd><dt>Evacuation Type</dt><dd>{{ e.scope }}</dd><dt>Status</dt><dd>{{ e.endedAt ? 'Evacuation closed' : 'Evacuation in Progress' }}</dd>
              </dl>
              <div class="cam">
                <svg viewBox="0 0 160 130" preserveAspectRatio="xMidYMid slice">
                  <defs><radialGradient id="smk" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="var(--ka-e6e6e6)" stop-opacity="0.95" /><stop offset="1" stop-color="var(--ka-8a8f99)" stop-opacity="0.2" /></radialGradient></defs>
                  <rect width="160" height="130" fill="var(--ka-3a3f4a)" /><path d="M0 0H160V36L0 52z" fill="var(--ka-5a606d)" /><path d="M0 130 40 70H120L160 130z" fill="var(--ka-2d313a)" />
                  <rect x="22" y="50" width="22" height="44" fill="var(--ka-4a505c)" /><rect x="118" y="44" width="26" height="54" fill="var(--ka-4a505c)" />
                  <circle cx="34" cy="38" r="5" fill="var(--ka-ff3b30)" [attr.opacity]="blink() ? 1 : 0.35" /><circle cx="34" cy="38" r="12" fill="var(--ka-ff3b30)" [attr.opacity]="blink() ? 0.3 : 0.05" />
                  <ellipse cx="95" cy="55" rx="70" ry="40" fill="url(#smk)" [attr.transform]="'translate(' + (blink() ? 3 : -3) + ' 0)'" /><ellipse cx="60" cy="30" rx="50" ry="22" fill="url(#smk)" opacity="0.8" />
                </svg>
                <span class="live"><i></i>Live Camera</span>
              </div>
            </div>
            <div class="ae-btns">
              <button class="btn-primary" (click)="modals.open('broadcast')"><app-icon name="megaphone" [size]="16" />Broadcast Message</button>
              <button class="btn-outline" (click)="notify()"><app-icon name="bell" [size]="16" />Send Notification</button>
              <div class="menu-wrap">
                <button class="btn-outline" (click)="menu.set(menu() === 'actions' ? null : 'actions')">More Actions<app-icon name="chevron-down" [size]="14" /></button>
                @if (menu() === 'actions') {
                  <div class="dropdown right">
                    <button class="dd-item" (click)="allClear()" [disabled]="!!e.endedAt">Declare all clear</button>
                    <button class="dd-item" (click)="escalate()">Escalate to Civil Defence</button>
                    <a class="dd-item" routerLink="/emergency-mustering/missing-persons">Search missing persons</a>
                    <button class="dd-item" (click)="exportCsv()">Export roll-call (CSV)</button>
                  </div>
                }
              </div>
            </div>
          } @else {<p class="muted">No evacuation in progress.</p>}
        </div>

        <div class="card tbl">
          <div class="card-head"><h3>Muster Points Status</h3><a class="link" routerLink="/emergency-mustering/muster-points">View All</a></div>
          <table class="table mini">
            <thead><tr><th>Muster Point</th><th>Location</th><th>Expected</th><th>Present</th><th>Status</th></tr></thead>
            <tbody>
              @for (m of store.musters(); track m.id) {
                @let st = status(m);
                <tr><td>{{ m.name }}</td><td class="loc">{{ m.location }}</td><td>{{ m.expected }}</td><td>{{ m.present }}</td><td><span class="tag" [class]="st === 'Complete' ? 'tag green' : st === 'In Progress' ? 'tag amber' : 'tag red'">{{ st }}</span></td></tr>
              }
            </tbody>
          </table>
        </div>

        <div class="card tbl">
          <div class="card-head"><h3>Recent Events</h3><a class="link" routerLink="/emergency-mustering/active-evacuations">View All</a></div>
          <table class="table mini">
            <thead><tr><th>Time</th><th>Event</th><th>Location</th><th>Source</th></tr></thead>
            <tbody>
              @for (ev of events(); track $index) {
                <tr><td>{{ clock(ev.at) }}</td><td><span class="evt"><app-icon [name]="ev.icon" [size]="15" [style.color]="ev.color" />{{ ev.event }}</span></td><td>{{ ev.location }}</td><td>{{ ev.source }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <app-emergency-modals #modals />
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .btn-danger { display: inline-flex; gap: 8px; align-items: center; height: 40px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--kb-e11d2e); color: var(--kf-ffffff); font: inherit; font-weight: 600; cursor: pointer; }
    .btn-danger:hover { background: var(--kb-c81424); } .icon-only { padding: 0 10px; } .btn-outline.on { color: var(--primary); border-color: var(--primary); background: var(--kb-faf8ff); }
    .drill { margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; background: repeating-linear-gradient(45deg, var(--kb-fef3c7), var(--kb-fef3c7) 12px, var(--kb-fde68a) 12px, var(--kb-fde68a) 24px); color: var(--kf-92400e); font-weight: 600; font-size: 13px; }
    .six { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .ecc { display: grid; grid-template-columns: minmax(0, 1fr) 430px; gap: 14px; align-items: start; }
    .left, .right { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .map-head { flex-wrap: wrap; gap: 8px; } .hsel { display: flex; gap: 8px; } .hsel .input { width: auto; min-width: 120px; height: 36px; }
    .opts { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 170px; font-size: 13px; } .opts label { display: flex; gap: 8px; align-items: center; } .opts input { accent-color: var(--primary); }
    .map-body { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; }
    .floors { list-style: none; margin: 0; padding: 6px; border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; align-self: start; }
    .floors li { padding: 9px 10px; border-radius: 7px; cursor: pointer; } .floors li:hover { background: var(--kb-f6f5fb); } .floors li.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .legend { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 10px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 12px; }
    .legend span { display: flex; gap: 7px; align-items: center; } .dot { width: 12px; height: 12px; border-radius: 50%; } .dot.g { background: var(--kb-22c55e); }
    .pi { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); } .pi.g { background: var(--kb-16a34a); } .pi.a { background: var(--kb-f59e0b); } .pi.r { background: var(--kb-ef4444); }
    .route { color: var(--kf-16a34a); letter-spacing: 1px; }
    .row2 { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.3fr); gap: 14px; } .row2 > .card, .right > .card.tbl { min-width: 0; overflow-x: auto; }
    .prog { display: flex; gap: 14px; align-items: center; } .prog ul { list-style: none; margin: 0; padding: 0; flex: 1; font-size: 12.5px; }
    .prog li { display: flex; gap: 7px; white-space: nowrap; gap: 8px; align-items: center; padding: 8px 0; } .prog li i { width: 10px; height: 10px; border-radius: 50%; flex: none; } .prog li em { flex: 1; min-width: 0; font-style: normal; overflow: hidden; text-overflow: ellipsis; } .prog li span { color: var(--muted); font-size: 11px; width: 46px; }
    .mini { width: 100%; } .mini th, .mini td { font-size: 11.5px; padding: 7px 5px; white-space: nowrap; } .mini td.r { color: var(--kf-dc2626); } .mini tr.tot td { font-weight: 700; border-top: 1px solid var(--border); }
    .pb { display: flex; gap: 6px; align-items: center; } .pb span { font-size: 11px; color: var(--kf-16a34a); width: 30px; } .bar { flex: 1; height: 9px; border-radius: 3px; background: var(--kb-eef0f6); overflow: hidden; min-width: 40px; } .bar i { display: block; height: 100%; background: var(--kb-22c55e); }
    .ae-head { gap: 10px; } .ae-head h3 { flex: 1; } .pill { padding: 4px 12px; border-radius: 6px; background: var(--kb-fee2e2); color: var(--kf-dc2626); font-size: 12px; font-weight: 600; } .pill.done { background: var(--kb-dcfce7); color: var(--kf-16a34a); }
    .timer { display: flex; gap: 6px; align-items: center; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .ae { display: grid; grid-template-columns: minmax(0, 1fr) 130px; gap: 10px; }
    .ae dl { display: grid; grid-template-columns: 108px 1fr; gap: 7px 8px; margin: 0; font-size: 12.5px; } .ae dt { color: var(--muted); } .ae dd { margin: 0; }
    .cam { position: relative; border-radius: 10px; overflow: hidden; height: 140px; } .cam svg { width: 100%; height: 100%; display: block; }
    .live { position: absolute; left: 8px; bottom: 8px; display: flex; gap: 5px; align-items: center; padding: 3px 8px; border-radius: 5px; background: rgba(0, 0, 0, 0.6); color: var(--kf-ffffff); font-size: 11px; } .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-ef4444); }
    .ae-btns { display: grid; grid-template-columns: 1.15fr 1.05fr 0.95fr; gap: 6px; margin-top: 14px; } .ae-btns button { justify-content: center; width: 100%; height: 40px; font-size: 12px; padding: 0 6px; gap: 5px; white-space: nowrap; }
    .loc { color: var(--kf-4b5068); } .evt { display: flex; gap: 6px; align-items: center; }
    @media (max-width: 1400px) { .six { grid-template-columns: repeat(3, 1fr); } .ecc { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .row2 { grid-template-columns: 1fr; } }
  `,
})
export class EmergencyCommandCenter {
  protected readonly store = inject(EmergencyStore);
  protected readonly floors = FLOORS;
  protected readonly building = E_BUILDING;
  protected readonly floor = signal('Floor 1');
  protected readonly menu = signal<string | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly layerNames = ['People', 'Exits & routes', 'Zones', 'Muster points'];
  protected readonly layers = signal<string[]>(this.layerNames);
  protected readonly c = this.store.counts;
  protected readonly evac = this.store.evac;
  protected readonly activeCount = computed(() => (this.evac() && !this.evac()!.endedAt ? 1 : 0));
  protected readonly complete = computed(() => this.store.musters().filter((m) => musterStatus(m) === 'Complete').length);
  protected readonly timer = computed(() => {
    const e = this.evac();
    return e ? fmtTimer((e.endedAt ?? this.store.now()) - e.triggeredAt) : '00:00:00';
  });
  protected readonly blink = computed(() => Math.floor(this.store.now() / 1000) % 2 === 0);
  protected readonly triggered = computed(() => {
    const d = new Date(this.evac()!.triggeredAt);
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  });
  protected readonly zones = computed(() => (this.layer('Zones') ? E_ZONES.map((z) => (z.id === 'conf' && this.floor() !== 'Floor 1' ? { ...z, name: 'Meeting Rooms', color: 'var(--ka-3b82f6)', fill: 0.16 } : z)) : []));
  protected readonly markers = computed<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    const f = this.floor();
    if (this.layer('People')) {
      for (const p of this.store.people()) {
        if (p.floor !== f || p.status === 'Evacuated') continue;
        const [x, y] = mapXY(p);
        out.push({ id: p.id, x, y, kind: 'icon', icon: 'user', label: 'o', size: 11, color: p.status === 'Missing' ? 'var(--ka-ef4444)' : 'var(--ka-f59e0b)', title: `${p.name} · ${p.status}` });
      }
      const evac = this.store.people().filter((p) => p.floor === f && p.status === 'Evacuated').slice(0, 14);
      evac.forEach((p, i) => {
        const r = ROUTES[i % ROUTES.length];
        const pt = r[Math.min(r.length - 1, 1 + (i % (r.length - 1)))];
        out.push({ id: p.id, x: pt[0] + ((i * 13) % 20) - 10, y: pt[1] + ((i * 7) % 16) - 8, kind: 'icon', icon: 'user', label: 'o', size: 11, color: 'var(--ka-16a34a)', title: `${p.name} · evacuated` });
      });
    }
    if (this.layer('Exits & routes')) {
      EXITS.forEach((e) => out.push({ id: e.id, x: e.x, y: e.y, kind: 'icon', icon: 'run', size: 12, color: 'var(--ka-16a34a)', title: e.name }));
      out.push({ id: 'lbl-exit', x: 400, y: 575, kind: 'pill', label: 'Main Exit', color: 'var(--ka-15803d)' });
    }
    if (this.layer('Muster points')) {
      out.push({ id: 'mpA', x: MUSTER_XY[0], y: MUSTER_XY[1], kind: 'icon', icon: 'users', label: 'o', size: 22, color: 'var(--ka-16a34a)', title: 'Muster Point A' });
      out.push({ id: 'lbl-mp', x: MUSTER_XY[0], y: MUSTER_XY[1] + 42, kind: 'pill', label: 'Muster Point A', color: 'var(--ka-15803d)' });
    }
    if (f === 'Floor 1' && this.activeCount()) out.push({ id: 'fire', x: 220, y: 245, kind: 'icon', icon: 'flame', size: 14, color: 'var(--ka-ef4444)', pulse: true, title: 'Fire alarm – Conference Room' });
    return out;
  });
  protected readonly paths = computed<MapPath[]>(() => (this.layer('Exits & routes') ? ROUTES.map((points) => ({ points, color: 'var(--ka-16a34a)', dashed: true, arrow: true, width: 3.5 })) : []));
  protected readonly callout = computed<MapCallout | null>(() =>
    this.floor() === 'Floor 1' && this.activeCount() ? { x: 230, y: 330, title: 'Fire Alarm', lines: ['Conference Room', new Date(this.evac()!.triggeredAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })], icon: 'flame', color: 'var(--ka-ef4444)' } : null,
  );
  protected readonly donut = computed(() => [
    { label: 'Evacuated', value: this.c().evac, color: 'var(--ka-22c55e)' },
    { label: 'Yet to Evacuate', value: this.c().yet, color: 'var(--ka-f59e0b)' },
    { label: 'Missing', value: this.c().missing, color: 'var(--ka-ef4444)' },
  ]);
  protected readonly depts = computed(() => {
    const m = new Map<string, { name: string; total: number; evac: number; yet: number; missing: number; pct: number }>();
    for (const p of this.store.people()) {
      const d = m.get(p.dept) ?? { name: p.dept, total: 0, evac: 0, yet: 0, missing: 0, pct: 0 };
      d.total++;
      if (p.status === 'Evacuated') d.evac++;
      else if (p.status === 'Missing') d.missing++;
      else d.yet++;
      m.set(p.dept, d);
    }
    const rows = [...m.values()];
    const c = this.c();
    rows.push({ name: 'Total', total: c.total, evac: c.evac, yet: c.yet, missing: c.missing, pct: 0 });
    return rows.map((r) => ({ ...r, pct: Math.round((r.evac / r.total) * 100) }));
  });
  protected readonly events = computed(() => this.store.events().slice(0, 6));

  protected pct(n: number) {
    return ((n / this.c().total) * 100).toFixed(1);
  }
  protected status = musterStatus;
  protected clock = fmtClock;
  protected layer(l: string) {
    return this.layers().includes(l);
  }
  protected flip(l: string) {
    this.layers.update((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]));
  }
  protected clickMarker(id: string) {
    const p = this.store.people().find((x) => x.id === id);
    if (p) this.toast(`${p.name} (${p.dept}) · ${p.status}${p.status !== 'Evacuated' ? ` · last seen ${p.zone}` : ` · Muster Point ${p.muster}`}`);
  }
  protected notify() {
    this.store.broadcast('Evacuate now', 'Please leave the building by the nearest exit and go to your muster point.', ['Push', 'SMS'], 'Yet to evacuate & missing');
    this.toast(`Push + SMS sent to ${this.c().yet + this.c().missing} people not yet accounted for`);
  }
  protected allClear() {
    this.menu.set(null);
    this.store.allClear();
    this.toast('All clear declared · re-entry permitted');
  }
  protected escalate() {
    this.menu.set(null);
    this.store.log('Escalated to Civil Defence (997)', 'Head Office', 'Demo login', 'siren', 'var(--ka-ef4444)');
    this.toast('Civil Defence notified with live headcount & map link');
  }
  protected exportCsv() {
    this.menu.set(null);
    downloadCsv('roll-call.csv', [['ID', 'Name', 'Department', 'Type', 'Status', 'Muster', 'Last floor', 'Last zone'], ...this.store.people().map((p) => [p.id, p.name, p.dept, p.type, p.status, p.muster, p.floor, p.zone])]);
  }
  private toast(m: string) {
    this.msg.set(m);
    setTimeout(() => this.msg.set(null), 2600);
  }
}

