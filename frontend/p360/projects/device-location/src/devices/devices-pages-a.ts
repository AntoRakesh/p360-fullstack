import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { DevArt, DevDetails } from './dev-ui';
import { Campaign, ConfigProfile, EdgeApp, Device, DeviceStore, DType, EdgeGw, fmtSeen, RELEASES, SITES, STAGES, statusCls, TYPE_META, TYPES } from './devices.data';

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const P = '/device-edge-management';

/* =====================================================================
   Device Health & Monitoring
   ===================================================================== */
@Component({
  selector: 'app-devices-device-health-monitoring',
  imports: [...UI, DataTable, DevDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Device Health & Monitoring" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Real-time health, performance and availability of every connected device.">
      <select class="select" [value]="range()" (change)="range.set($any($event.target).value)"><option>Last 24 hours</option><option>Last 7 days</option><option>Last 30 days</option></select>
      <button class="btn-ghost" (click)="store.toastMsg('Polling ' + fmt(store.counts().total) + ' devices · metrics refreshed')"><app-icon name="refresh" [size]="16" />Refresh</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="devices-export" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Fleet Health Score" [value]="fleet().score" icon="activity" color="var(--ka-7c3aed)" change="1.8%" sub="vs. last week" />
      <app-kpi label="Availability (24h)" [value]="fleet().avail + '%'" icon="devices-check" color="var(--ka-10b981)" change="0.3%" />
      <app-kpi label="Devices at Risk" [value]="atRisk().length" icon="triangle-alert" color="var(--ka-f97316)" change="4" [up]="false" sub="vs. yesterday" />
      <app-kpi label="Avg CPU Load" [value]="fleet().cpu + '%'" icon="devices-chip" color="var(--ka-3b82f6)" [sub]="'peak ' + (fleet().cpu + 31) + '% at 09:00'" />
      <app-kpi label="Avg Temperature" [value]="fleet().temp + '°C'" icon="devices-thermo" color="var(--ka-ef4444)" sub="3 devices above 55°C" subColor="var(--ka-dc2626)" />
    </section>

    <section class="g3">
      <div class="card">
        <div class="card-head"><h3>Health Distribution</h3><span class="muted sm">click a segment to filter</span></div>
        <app-donut [segments]="dist()" center="Devices" [size]="150" />
        <div class="chips">@for (s of dist(); track s.label) {<button class="chip-b" [class.on]="band() === s.label" (click)="band.set(band() === s.label ? null : s.label)"><i [style.background]="s.color"></i>{{ s.label }}</button>}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Fleet CPU &amp; Memory <span class="card-sub">{{ range() }}</span></h3>@if (state.live()) {<span class="live"><i></i>Live</span>}</div>
        <app-line-chart [labels]="labels()" [series]="perf()" [height]="230" suffix="%" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Availability by Site</h3></div>
        <app-bar-list [rows]="siteAvail()" [max]="100" />
        <div class="note"><app-icon name="triangle-alert" [size]="14" />Factory below 97% SLA target</div>
      </div>
    </section>

    <section class="g2">
      <div class="card">
        <div class="card-head"><h3>Availability Heatmap <span class="card-sub">site × device type, %</span></h3></div>
        <app-heatmap [rows]="sites" [cols]="shortTypes" [data]="heat()" suffix="%" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Live Telemetry</h3><select class="select" [value]="liveId()" (change)="liveId.set($any($event.target).value)">@for (d of watch(); track d.id) {<option [value]="d.id">{{ d.name }}</option>}</select></div>
        @if (liveDev(); as d) {
          <div class="tele">
            @for (m of tele(d); track m.k) {
              <div class="tm"><small>{{ m.k }}</small><b [style.color]="m.c">{{ m.v }}</b><app-sparkline [values]="m.s" [color]="m.c" /></div>
            }
          </div>
          <div class="toolbar"><button class="btn-ghost sm" (click)="details.set(d)">Open device</button><button class="btn-ghost sm" (click)="store.reboot(d)">Reboot</button><button class="btn-ghost sm" (click)="ping(d)">Ping</button></div>
          @if (pingOut()) {<pre class="con">{{ pingOut() }}</pre>}
        }
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Device Health <span class="card-sub">{{ rows().length }} devices{{ band() ? ' · ' + band() : '' }}</span></h3>
        <div class="tabs">@for (v of views; track v) {<button [class.on]="view() === v" (click)="view.set(v)">{{ v }}</button>}</div>
      </div>
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="devices"
        [searchKeys]="['name', 'serial', 'model', 'location']" searchPlaceholder="Search device, serial, model..." [activeId]="null"
        (rowClick)="liveId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
    </section>

    <app-dev-details [dev]="details()" (closed)="details.set(null)" />
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    .g3 { display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 12px; margin-bottom: 12px; } .g2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-bottom: 12px; }
    h3 { margin: 0; font-size: 15px; } .sm { font-size: 11.5px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; } .chip-b { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 14px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; }
    .chip-b.on { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); } .chip-b i { width: 8px; height: 8px; border-radius: 50%; }
    .live { display: inline-flex; gap: 6px; align-items: center; color: var(--kf-16a34a); font-size: 12px; font-weight: 600; } .live i { width: 8px; height: 8px; border-radius: 50%; background: var(--kb-22c55e); animation: pulse 1.4s infinite; }
    @keyframes pulse { 50% { opacity: .3; } }
    .note { display: flex; gap: 6px; align-items: center; margin-top: 12px; font-size: 12px; color: var(--kf-b45309); background: var(--kb-fffbeb); padding: 7px 10px; border-radius: 8px; }
    .tele { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; } .tm { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
    .tm small { color: var(--muted); font-size: 11px; } .tm b { font-size: 18px; } .tm app-sparkline { height: 28px; display: block; }
    .con { background: var(--kb-0f172a); color: var(--kf-a7f3d0); font-size: 11px; padding: 10px; border-radius: 8px; margin: 10px 0 0; white-space: pre-wrap; }
    @media (max-width: 1300px) { .g3, .g2 { grid-template-columns: 1fr; } }
  `,
})
export class DeviceHealthMonitoring {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  protected readonly state = inject(AppState);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly sites = SITES;
  protected readonly shortTypes = TYPES.map((t) => TYPE_META[t].short);
  protected readonly views = ['At Risk', 'All Active', 'Offline'];
  protected readonly view = signal('At Risk');
  protected readonly range = signal('Last 24 hours');
  protected readonly band = signal<string | null>(null);
  protected readonly details = signal<Device | null>(null);
  protected readonly liveId = signal(this.store.focusId() ?? 'D4');
  protected readonly pingOut = signal('');

  protected readonly cols: Col[] = [
    { key: 'name', label: 'Device', kind: 'icon' },
    { key: 'type', label: 'Type' },
    { key: 'site', label: 'Site' },
    { key: 'health', label: 'Health', kind: 'progress' },
    { key: 'cpu', label: 'CPU %', kind: 'num' },
    { key: 'mem', label: 'Mem %', kind: 'num' },
    { key: 'temp', label: 'Temp °C', kind: 'num' },
    { key: 'latency', label: 'Latency ms', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'seen', label: 'Last Seen' },
  ];
  protected readonly filters = [
    { key: 'type', label: 'Type', options: TYPES as string[] },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'status', label: 'Status', options: ['Online', 'Offline', 'Maintenance'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'devices-monitor' },
    { id: 'reboot', label: 'Reboot', icon: 'devices-power' },
    { id: 'maint', label: 'Set maintenance', icon: 'devices-wrench', when: (r) => r.status !== 'Maintenance' },
    { id: 'ticket', label: 'Create ticket', icon: 'devices-ticket' },
    { id: 'replace', label: 'Start replacement', icon: 'refresh', danger: true },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'reboot', label: 'Reboot' }, { id: 'maint', label: 'Set maintenance' }, { id: 'export', label: 'Export' }];
  private readonly router = inject(Router);

  private readonly active = computed(() => this.store.devices().filter((d) => d.status !== 'Inactive'));
  protected readonly atRisk = computed(() => this.active().filter((d) => d.health < 70));
  protected readonly fleet = computed(() => {
    const on = this.active().filter((d) => d.status === 'Online');
    const avg = (k: 'cpu' | 'temp' | 'health') => Math.round(on.reduce((a, d) => a + d[k], 0) / (on.length || 1));
    const w = this.state.wobble('fleet', 2);
    return { score: (avg('health') - 1.6).toFixed(1), avail: (97.4 + ((on.length / (this.active().length || 1)) - 0.9) * 20).toFixed(1), cpu: avg('cpu') + w, temp: avg('temp') };
  });
  protected readonly dist = computed(() => {
    const a = this.active();
    return [
      { label: 'Healthy', value: a.filter((d) => d.health >= 80).length, color: 'var(--ka-22c55e)' },
      { label: 'Warning', value: a.filter((d) => d.health >= 50 && d.health < 80).length, color: 'var(--ka-f59e0b)' },
      { label: 'Critical', value: a.filter((d) => d.health < 50).length, color: 'var(--ka-ef4444)' },
    ];
  });
  protected readonly labels = computed(() => (this.range() === 'Last 24 hours' ? HOURS : this.range() === 'Last 7 days' ? ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] : Array.from({ length: 30 }, (_, i) => `${i + 15} Sep`.replace(/^(\d+) Sep/, (m, d) => (+d > 30 ? `${+d - 30} Oct` : m)))));
  protected readonly perf = computed(() => {
    const t = this.state.tick();
    const n = this.labels().length;
    const cpu = Array.from({ length: n }, (_, i) => Math.round(34 + 18 * Math.sin(((i + t * 0.3) / n) * Math.PI * 2 - 1.2) + (i % 3)));
    const mem = Array.from({ length: n }, (_, i) => Math.round(52 + 8 * Math.sin(((i + t * 0.2) / n) * Math.PI * 2) + (i % 2)));
    return [
      { name: 'CPU', color: 'var(--ka-7c3aed)', values: cpu, area: true },
      { name: 'Memory', color: 'var(--ka-10b981)', values: mem },
    ];
  });
  protected readonly siteAvail = computed(() =>
    SITES.map((s) => {
      const l = this.active().filter((d) => d.site === s);
      const v = +(97.4 + ((l.filter((d) => d.status === 'Online').length / (l.length || 1)) - 0.9) * 20 + (s === 'Factory' ? -1.9 : 0.6)).toFixed(1);
      return { label: s, value: Math.min(99.9, v), display: Math.min(99.9, v) + '%', color: v < 97 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)' };
    }),
  );
  protected readonly heat = computed(() =>
    SITES.map((s) => TYPES.map((t) => {
      const l = this.active().filter((d) => d.site === s && d.type === t);
      return l.length ? Math.min(100, Math.round((l.filter((d) => d.status === 'Online').length / l.length) * 100)) : 100;
    })),
  );
  protected readonly watch = computed(() => {
    const l = this.atRisk().slice(0, 12);
    const f = this.store.byId(this.liveId());
    return f && !l.includes(f) ? [f, ...l] : l;
  });
  protected readonly liveDev = computed(() => this.store.byId(this.liveId()));
  protected readonly rows = computed(() => {
    const v = this.view();
    const b = this.band();
    let l = v === 'At Risk' ? this.active().filter((d) => d.health < 80) : v === 'Offline' ? this.active().filter((d) => d.status === 'Offline') : this.active();
    if (b) l = l.filter((d) => (b === 'Healthy' ? d.health >= 80 : b === 'Warning' ? d.health >= 50 && d.health < 80 : d.health < 50));
    return l.map((d) => ({ ...d, icon: TYPE_META[d.type].icon, color: TYPE_META[d.type].color, seen: fmtSeen(d.seenAgo) })).sort((a, b) => a.health - b.health);
  });

  protected tele(d: Device) {
    const t = this.state.tick();
    const on = d.status === 'Online';
    const s = (base: number, amp: number, k: number) => Array.from({ length: 20 }, (_, i) => Math.max(0, Math.round(base + Math.sin((i + t + k) / 2.3) * amp)));
    return [
      { k: 'CPU', v: on ? `${d.cpu + this.state.wobble(d.id + 'c', 5)}%` : '—', c: 'var(--ka-7c3aed)', s: s(d.cpu || 3, on ? 8 : 1, 1) },
      { k: 'Memory', v: on ? `${d.mem}%` : '—', c: 'var(--ka-10b981)', s: s(d.mem || 3, on ? 4 : 1, 3) },
      { k: 'Temperature', v: `${d.temp + this.state.wobble(d.id + 't', 1)}°C`, c: d.temp > 55 ? 'var(--ka-ef4444)' : 'var(--ka-f59e0b)', s: s(d.temp, 2, 5) },
      { k: 'Latency', v: on ? `${d.latency} ms` : 'timeout', c: 'var(--ka-3b82f6)', s: s(d.latency, 5, 7) },
      { k: 'Signal', v: `${d.rssi} dBm`, c: 'var(--ka-0ea5e9)', s: s(-d.rssi, 3, 2) },
      { k: 'Health', v: String(d.health), c: d.health >= 80 ? 'var(--ka-16a34a)' : d.health >= 50 ? 'var(--ka-d97706)' : 'var(--ka-dc2626)', s: s(d.health, 3, 9) },
    ];
  }
  protected ping(d: Device) {
    const ok = d.status === 'Online';
    this.pingOut.set(`$ ping -c 4 ${d.ip}\n` + (ok ? [1, 2, 3, 4].map((i) => `64 bytes from ${d.ip}: icmp_seq=${i} ttl=63 time=${d.latency + i * 0.4} ms`).join('\n') + `\n--- 4 packets transmitted, 4 received, 0% packet loss` : `Request timeout for icmp_seq 1\nRequest timeout for icmp_seq 2\n--- 4 packets transmitted, 0 received, 100% packet loss`));
  }
  protected act(a: string, r: Device) {
    const d = this.store.byId(r.id)!;
    if (a === 'view') return this.details.set(d);
    if (a === 'reboot') return this.store.reboot(d);
    if (a === 'ticket') return this.store.createTicket(d, `health ${d.health}`);
    if (a === 'maint') {
      this.store.setStatus([d.id], 'Maintenance');
      return this.store.toastMsg(`${d.name} set to maintenance`);
    }
    this.store.focusId.set(d.id);
    this.router.navigateByUrl(P + '/device-replacement');
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.rows().filter((r) => ids.includes(r.id)));
    this.store.setStatus(ids, 'Maintenance');
    this.store.toastMsg(a === 'reboot' ? `Reboot sent to ${ids.length} devices` : `${ids.length} devices set to maintenance`);
    if (a === 'reboot') setTimeout(() => this.store.setStatus(ids, 'Online'), 6000);
  }
  protected exportCsv(list: Device[] = this.rows()) {
    downloadCsv('device-health.csv', [['Device', 'Type', 'Site', 'Health', 'CPU', 'Memory', 'Temp', 'Latency', 'Status'], ...list.map((d) => [d.name, d.type, d.site, d.health, d.cpu, d.mem, d.temp, d.latency, d.status])]);
  }
}

/* =====================================================================
   Device Configuration
   ===================================================================== */
interface Job { id: string; profile: string; total: number; done: number; failed: number; started: string }
@Component({
  selector: 'app-devices-device-configuration',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Device Configuration" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Configuration profiles, drift detection and bulk configuration pushes.">
      <button class="btn-primary" (click)="newProfile()"><app-icon name="plus" [size]="16" />New Profile</button>
      <button class="btn-ghost" (click)="scanDrift()"><app-icon name="search" [size]="16" />Scan for Drift</button>
      <button class="btn-ghost" (click)="backup()"><app-icon name="devices-export" [size]="16" />Backup All Configs</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Config Profiles" [value]="store.profiles().length" icon="sliders" color="var(--ka-7c3aed)" sub="across 6 device types" />
      <app-kpi label="Managed Devices" [value]="fmt(managed())" icon="devices-chip" color="var(--ka-3b82f6)" [sub]="pctManaged() + '% of fleet'" />
      <app-kpi label="Compliant" [value]="compliance() + '%'" icon="devices-check" color="var(--ka-10b981)" change="1.2%" sub="vs. last week" />
      <app-kpi label="Config Drift" [value]="drift()" icon="triangle-alert" color="var(--ka-f97316)" sub="devices differ from profile" subColor="var(--ka-c2410c)" />
      <app-kpi label="Push Jobs Running" [value]="running()" icon="workflow" color="var(--ka-06b6d4)" [sub]="jobs().length + ' jobs today'" />
    </section>

    <section class="cfg">
      <div class="card list">
        <div class="tabs">@for (t of typeTabs; track t) {<button [class.on]="tf() === t" (click)="tf.set(t)">{{ t === 'All' ? 'All' : short(t) }}</button>}</div>
        <ul>
          @for (p of profiles(); track p.id) {
            <li [class.on]="sel()?.id === p.id" (click)="pick(p)">
              <span class="ic" [style.background]="'color-mix(in srgb, ' + meta(p.type).color + ' 12%, transparent)'" [style.color]="meta(p.type).color"><app-icon [name]="meta(p.type).icon" [size]="17" /></span>
              <div><b>{{ p.name }}</b><small>v{{ p.version }} · {{ p.devices }} devices · {{ p.updated }}</small></div>
              @if (p.drift) {<span class="tag amber">{{ p.drift }} drift</span>} @else {<span class="tag green">In sync</span>}
            </li>
          }
        </ul>
      </div>

      @if (sel(); as p) {
        <div class="card ed">
          <div class="card-head">
            <div><h3>{{ p.name }} <span class="tag">v{{ p.version }}</span></h3><small class="muted">{{ p.type }} · last changed {{ p.updated }} by {{ p.by }}</small></div>
            <div class="toolbar">
              <button class="btn-ghost" (click)="clone(p)"><app-icon name="devices-copy" [size]="15" />Clone</button>
              <button class="btn-ghost" [disabled]="!dirty()" (click)="draft.set({ ...p.settings })">Discard</button>
              <button class="btn-outline" [disabled]="!dirty()" (click)="save(p)">Save v{{ p.version + 1 }}</button>
              <button class="btn-primary" (click)="push(p)"><app-icon name="devices-export" [size]="15" />Push to {{ p.devices }} devices</button>
            </div>
          </div>
          <div class="form-grid">
            @for (k of keys(p); track k) {
              <label [class.chg]="draft()[k] !== p.settings[k]">{{ k }}
                @if (options[k]; as opts) {
                  <select class="select" [value]="draft()[k]" (change)="setD(k, $any($event.target).value)">@for (o of opts; track o) {<option [value]="o">{{ o }}</option>}</select>
                } @else {
                  <input class="input" [value]="draft()[k]" (input)="setD(k, $any($event.target).value)" />
                }
              </label>
            }
          </div>
          @if (dirty()) {<p class="diff"><app-icon name="sliders" [size]="14" />{{ changes().length }} unsaved change(s): {{ changes().join(', ') }}</p>}

          <div class="two">
            <div>
              <h4>Drifted Devices <span class="muted">({{ p.drift }})</span></h4>
              @if (driftDevs(p).length) {
                <ul class="dl">
                  @for (d of driftDevs(p); track d.id) {<li><span class="dot-sm" style="background:var(--kb-f59e0b)"></span><div><b>{{ d.name }}</b><small>{{ d.site }} · {{ diffFor(p, $index) }}</small></div><button class="link" (click)="remediate(p, d)">Remediate</button></li>}
                </ul>
                <button class="btn-ghost sm" (click)="remediateAll(p)">Remediate all</button>
              } @else {<p class="muted ok"><app-icon name="devices-check" [size]="15" />All devices match this profile.</p>}
            </div>
            <div>
              <h4>Version History</h4>
              <ul class="hist">
                @for (h of p.history; track h.v; let i = $index) {<li><b>v{{ h.v }}</b><div><span>{{ h.note }}</span><small>{{ h.date }} · {{ h.by }}</small></div>@if (i > 0) {<button class="link" (click)="rollback(p, h.v)">Rollback</button>} @else {<span class="tag green">Current</span>}</li>}
              </ul>
            </div>
          </div>
        </div>
      }
    </section>

    <section class="card">
      <div class="card-head"><h3>Configuration Push Jobs</h3></div>
      <table class="table">
        <thead><tr><th>Job</th><th>Profile</th><th>Started</th><th>Progress</th><th class="num">Success</th><th class="num">Failed</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (j of jobs(); track j.id) {
            <tr><td>{{ j.id }}</td><td>{{ j.profile }}</td><td>{{ j.started }}</td>
              <td><span class="mini-progress"><i [style.width.%]="(j.done / j.total) * 100" style="background:var(--kb-7c3aed)"></i></span>{{ Math.round((j.done / j.total) * 100) }}%</td>
              <td class="num">{{ j.done - j.failed }}</td><td class="num">{{ j.failed }}</td>
              <td><span [class]="j.done >= j.total ? (j.failed ? 'tag amber' : 'tag green') : 'tag blue'">{{ j.done >= j.total ? (j.failed ? 'Completed with errors' : 'Completed') : 'In progress' }}</span></td>
              <td>@if (j.failed && j.done >= j.total) {<button class="link" (click)="retry(j)">Retry failed</button>}</td></tr>
          }
        </tbody>
      </table>
    </section>

    @if (creating()) {
      <div class="g-overlay" (click)="creating.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>New Configuration Profile</h3><button type="button" class="close-btn" (click)="creating.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Profile name *<input class="input" required [value]="nf().name" (input)="nf.set({ name: $any($event.target).value, type: nf().type, base: nf().base })" /></label>
          <label>Device type<select class="select" [value]="nf().type" (change)="nf.set({ name: nf().name, type: $any($event.target).value, base: '' })">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Start from<select class="select" [value]="nf().base" (change)="nf.set({ name: nf().name, type: nf().type, base: $any($event.target).value })"><option value="">Blank defaults</option>@for (p of baseFor(); track p.id) {<option [value]="p.id">{{ p.name }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="creating.set(false)">Cancel</button><button class="btn-primary" type="submit">Create Profile</button></div>
      </form>
    }
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; display: flex; gap: 8px; align-items: center; } h4 { margin: 14px 0 8px; font-size: 13px; }
    .cfg { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .list ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .list li { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 9px; border: 1px solid var(--border); border-radius: 9px; cursor: pointer; font-size: 12.5px; }
    .list li.on { border-color: var(--primary); background: var(--kb-faf8ff); } .list li div { display: flex; flex-direction: column; } .list small { color: var(--muted); font-size: 11px; }
    .ic { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; }
    label.chg { color: var(--primary); font-weight: 600; } label.chg .input, label.chg .select { border-color: var(--kl-c4b5fd); background-color: var(--kb-faf8ff); }
    .diff { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--primary); background: var(--primary-soft); padding: 7px 10px; border-radius: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .dl, .hist { list-style: none; margin: 0 0 8px; padding: 0; } .dl li, .hist li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .dl div, .hist div { display: flex; flex-direction: column; } .dl small, .hist small { color: var(--muted); font-size: 11px; } .ok { display: flex; gap: 6px; align-items: center; color: var(--kf-16a34a); }
    .mini-progress { display: inline-block; width: 120px; height: 6px; border-radius: 4px; background: var(--kb-eef0f5); margin-right: 8px; overflow: hidden; vertical-align: middle; } .mini-progress i { display: block; height: 100%; transition: width .5s; }
    @media (max-width: 1250px) { .cfg { grid-template-columns: 1fr; } }
  `,
})
export class DeviceConfiguration {
  protected readonly P = P;
  protected readonly Math = Math;
  protected readonly store = inject(DeviceStore);
  private readonly state = inject(AppState);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly types = TYPES;
  protected readonly typeTabs = ['All', ...TYPES.filter((t) => t !== 'Other')];
  protected readonly tf = signal('All');
  protected readonly selId = signal('P1');
  protected readonly draft = signal<Record<string, string>>({ ...this.store.profiles()[0].settings });
  protected readonly creating = signal(false);
  protected readonly nf = signal({ name: '', type: 'Access Point', base: '' });
  protected readonly jobs = signal<Job[]>([
    { id: 'CFG-7711', profile: 'Switch - Access Layer v22', total: 196, done: 196, failed: 3, started: '14 Oct 2026 08:10 AM' },
    { id: 'CFG-7710', profile: 'Camera - 1080p H.265 v8', total: 158, done: 158, failed: 0, started: '13 Oct 2026 11:42 PM' },
  ]);
  protected readonly options: Record<string, string[]> = {
    Security: ['WPA3-Enterprise', 'WPA2-Enterprise', 'WPA2-PSK + Captive Portal', 'Open'], 'Band Steering': ['On', 'Off'], 'Tx Power': ['Auto', 'High', 'Medium', 'Low'],
    'Channel Width': ['20 MHz', '40 MHz', '80 MHz', '160 MHz'], 'PoE Mode': ['802.3bt', '802.3at', '802.3af', 'Off'], STP: ['RSTP', 'MSTP', 'Off'], 'Port Security': ['Enabled', 'Disabled'],
    'LLDP-MED': ['On', 'Off'], Codec: ['H.265+', 'H.265', 'H.264'], FPS: ['15', '20', '25', '30'], 'Night Mode': ['Auto IR', 'Colour', 'Off'], ADR: ['On', 'Off'], Confirmed: ['On', 'Off'], 'Remote SSH': ['Enabled', 'Disabled'],
  };

  constructor() {
    const f = this.store.byId(this.store.focusId());
    if (f) {
      const p = this.store.profiles().find((x) => x.type === f.type);
      if (p) this.pick(p);
    }
    // advance running jobs on the live tick
    effect(() => {
      const t = this.state.tick();
      untracked(() => this.jobs.update((l) => l.map((j) => (j.done >= j.total ? j : { ...j, done: Math.min(j.total, j.done + 9 + (t % 5)), failed: j.failed + (t % 11 === 0 ? 1 : 0) }))));
    });
  }

  protected readonly profiles = computed(() => this.store.profiles().filter((p) => this.tf() === 'All' || p.type === this.tf()));
  protected readonly sel = computed(() => this.store.profiles().find((p) => p.id === this.selId()) ?? null);
  protected readonly managed = computed(() => this.store.profiles().reduce((a, p) => a + p.devices, 0));
  protected readonly pctManaged = computed(() => Math.round((this.managed() / this.store.counts().total) * 100));
  protected readonly drift = computed(() => this.store.profiles().reduce((a, p) => a + p.drift, 0));
  protected readonly compliance = computed(() => (100 - (this.drift() / this.managed()) * 100).toFixed(1));
  protected readonly running = computed(() => this.jobs().filter((j) => j.done < j.total).length);
  protected readonly changes = computed(() => {
    const p = this.sel();
    return p ? Object.keys(p.settings).filter((k) => this.draft()[k] !== p.settings[k]) : [];
  });
  protected readonly dirty = computed(() => this.changes().length > 0);
  protected readonly baseFor = computed(() => this.store.profiles().filter((p) => p.type === this.nf().type));

  protected meta(t: DType) {
    return TYPE_META[t];
  }
  protected short(t: string) {
    return TYPE_META[t as DType].short;
  }
  protected keys(p: ConfigProfile) {
    return Object.keys(p.settings);
  }
  protected pick(p: ConfigProfile) {
    this.selId.set(p.id);
    this.draft.set({ ...p.settings });
  }
  protected setD(k: string, v: string) {
    this.draft.update((d) => ({ ...d, [k]: v }));
  }
  protected driftDevs(p: ConfigProfile) {
    return this.store.devices().filter((d) => d.type === p.type && d.status !== 'Inactive').slice(3, 3 + p.drift);
  }
  protected diffFor(p: ConfigProfile, i: number) {
    const k = Object.keys(p.settings)[(i * 2 + 1) % 6];
    return `${k} differs (local override)`;
  }
  private upd(id: string, ch: Partial<ConfigProfile>) {
    this.store.profiles.update((l) => l.map((p) => (p.id === id ? { ...p, ...ch } : p)));
  }
  protected save(p: ConfigProfile) {
    const v = p.version + 1;
    this.upd(p.id, { settings: { ...this.draft() }, version: v, updated: '14 Oct 2026', by: 'Rex Kumar', history: [{ v, date: '14 Oct 2026', by: 'Rex Kumar', note: `Changed ${this.changes().join(', ')}` }, ...p.history] });
    this.store.toastMsg(`${p.name} saved as v${v} · push to apply on devices`);
  }
  protected push(p: ConfigProfile) {
    if (this.dirty()) this.save(this.sel()!);
    const cur = this.sel()!;
    this.jobs.update((l) => [{ id: `CFG-${7712 + l.length}`, profile: `${cur.name} v${cur.version}`, total: cur.devices, done: 0, failed: 0, started: '14 Oct 2026 10:24 AM' }, ...l]);
    this.upd(cur.id, { drift: 0 });
    this.store.toastMsg(`Pushing ${cur.name} v${cur.version} to ${cur.devices} devices`);
  }
  protected remediate(p: ConfigProfile, d: Device) {
    this.upd(p.id, { drift: Math.max(0, p.drift - 1) });
    this.store.toastMsg(`${d.name} re-synced to ${p.name} v${p.version}`);
  }
  protected remediateAll(p: ConfigProfile) {
    this.upd(p.id, { drift: 0 });
    this.store.toastMsg(`${p.drift} devices re-synced to ${p.name}`);
  }
  protected rollback(p: ConfigProfile, v: number) {
    const nv = p.version + 1;
    this.upd(p.id, { version: nv, updated: '14 Oct 2026', history: [{ v: nv, date: '14 Oct 2026', by: 'Rex Kumar', note: `Rollback to v${v}` }, ...p.history] });
    this.store.toastMsg(`${p.name} rolled back to v${v} settings (saved as v${nv})`);
  }
  protected clone(p: ConfigProfile) {
    const id = 'P' + Date.now();
    this.store.profiles.update((l) => [...l, { ...p, id, name: p.name + ' (copy)', version: 1, devices: 0, drift: 0, history: [{ v: 1, date: '14 Oct 2026', by: 'Rex Kumar', note: `Cloned from ${p.name}` }] }]);
    this.pick(this.store.profiles().find((x) => x.id === id)!);
    this.store.toastMsg(`${p.name} cloned`);
  }
  protected newProfile() {
    this.nf.set({ name: '', type: 'Access Point', base: '' });
    this.creating.set(true);
  }
  protected create() {
    const f = this.nf();
    if (!f.name.trim()) return;
    const base = this.store.profiles().find((p) => p.id === f.base) ?? this.store.profiles().find((p) => p.type === f.type) ?? this.store.profiles()[0];
    const id = 'P' + Date.now();
    this.store.profiles.update((l) => [...l, { ...base, id, name: f.name, type: f.type as DType, version: 1, devices: 0, drift: 0, updated: '14 Oct 2026', by: 'Rex Kumar', history: [{ v: 1, date: '14 Oct 2026', by: 'Rex Kumar', note: 'Profile created' }] }]);
    this.tf.set('All');
    this.pick(this.store.profiles().find((x) => x.id === id)!);
    this.creating.set(false);
    this.store.toastMsg(`Profile "${f.name}" created`);
  }
  protected scanDrift() {
    this.store.toastMsg('Comparing running configs of ' + this.fmt(this.managed()) + ' devices...');
    setTimeout(() => {
      this.upd('P3', { drift: 1 });
      this.store.toastMsg(`Drift scan complete · ${this.drift()} devices out of sync`);
    }, 1600);
  }
  protected retry(j: Job) {
    this.jobs.update((l) => l.map((x) => (x.id === j.id ? { ...x, failed: 0 } : x)));
    this.store.toastMsg(`${j.failed} failed devices retried successfully`);
  }
  protected backup() {
    downloadCsv('device-config-backup.csv', [['Profile', 'Type', 'Version', 'Setting', 'Value'], ...this.store.profiles().flatMap((p) => Object.entries(p.settings).map(([k, v]) => [p.name, p.type, p.version, k, v]))]);
    this.store.toastMsg('Configuration backup downloaded');
  }
}

/* =====================================================================
   Firmware & Updates (staged rollouts)
   ===================================================================== */
@Component({
  selector: 'app-devices-firmware-updates',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Firmware & Updates" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Plan, stage and monitor firmware rollouts across the device fleet.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />New Rollout</button>
      <button class="btn-ghost" (click)="check()"><app-icon name="refresh" [size]="16" />Check for Updates</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="devices-export" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Up to Date" [value]="upPct() + '%'" icon="devices-check" color="var(--ka-10b981)" change="4.1%" sub="vs. last month" />
      <app-kpi label="Updates Available" [value]="fmt(store.outdated())" icon="devices-export" color="var(--ka-7c3aed)" sub="devices on older firmware" />
      <app-kpi label="Active Rollouts" [value]="active()" icon="workflow" color="var(--ka-3b82f6)" [sub]="paused() + ' paused'" />
      <app-kpi label="Failed Updates" [value]="failed()" icon="triangle-alert" color="var(--ka-ef4444)" sub="auto-retry in next window" subColor="var(--ka-dc2626)" />
      <app-kpi label="Next Window" value="22:00" icon="clock" color="var(--ka-f97316)" sub="Tonight · 7 h 36 m" />
    </section>

    <section class="card">
      <div class="card-head"><h3>Staged Rollouts</h3><div class="tabs">@for (f of ['Active', 'Completed', 'All']; track f) {<button [class.on]="cf() === f" (click)="cf.set(f)">{{ f }}</button>}</div></div>
      <div class="camps">
        @for (c of camps(); track c.id) {
          <div class="camp" [class.done]="c.stage >= 4">
            <div class="ch">
              <span class="ic" [style.background]="meta(c.type).color"><app-icon [name]="meta(c.type).icon" [size]="18" /></span>
              <div><b>{{ c.name }}</b><small>{{ c.id }} · {{ c.from }} → {{ c.to }} · window {{ c.window }} · {{ c.owner }}</small></div>
              <span [class]="c.stage >= 4 ? 'tag green' : c.paused ? 'tag amber' : 'tag blue'">{{ c.stage >= 4 ? 'Completed' : c.paused ? 'Paused' : 'Rolling out' }}</span>
            </div>
            <ol class="stages">
              @for (s of stages; track s.name; let i = $index) {
                <li [class.ok]="c.stage > i" [class.cur]="c.stage === i"><i>{{ c.stage > i ? '✓' : i + 1 }}</i><span>{{ s.name }}<small>{{ s.pct }}% · {{ Math.round((s.pct / 100) * c.total) }}</small></span></li>
              }
            </ol>
            <div class="prog"><div class="bar"><i [style.width.%]="(c.done / c.total) * 100"></i>@if (c.stage < 4) {<em [style.left.%]="stages[c.stage].pct"></em>}</div><b>{{ c.done }} / {{ c.total }}</b></div>
            <div class="cf">
              <span class="muted">{{ Math.round((c.done / c.total) * 100) }}% updated · <span [class.bad]="c.failed">{{ c.failed }} failed</span> · started {{ c.started }}</span>
              <div class="toolbar">
                @if (c.stage < 4) {
                  <button class="btn-ghost sm" (click)="toggle(c)">{{ c.paused ? 'Resume' : 'Pause' }}</button>
                  <button class="btn-primary btn-sm" [disabled]="!stageDone(c)" (click)="promote(c)" [title]="stageDone(c) ? '' : 'Current stage still in progress'">{{ c.stage === 3 ? 'Finish' : 'Promote to ' + stages[c.stage + 1].name }}</button>
                  <button class="btn-ghost sm danger" (click)="rollback(c)">Rollback</button>
                } @else {<button class="btn-ghost sm" (click)="report(c)">Download report</button>}
              </div>
            </div>
          </div>
        } @empty {<p class="muted">No rollouts in this view.</p>}
      </div>
    </section>

    <section class="g2">
      <div class="card">
        <div class="card-head"><h3>Firmware Versions by Type</h3><span class="chart-legend"><span><i style="background:var(--kb-10b981)"></i>Latest</span><span><i style="background:var(--kb-f59e0b)"></i>Older</span></span></div>
        <app-column-chart [labels]="shortTypes" [series]="versions()" [stacked]="true" [height]="240" [legend]="false" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Release Catalog</h3></div>
        <table class="table">
          <thead><tr><th>Device Type</th><th>Version</th><th>Released</th><th>Type</th><th class="num">Pending</th><th></th></tr></thead>
          <tbody>
            @for (r of releases; track r.version) {
              <tr><td>{{ r.type }}</td><td class="wrap"><b>{{ r.version }}</b><br /><small class="muted">{{ r.notes }}</small></td><td>{{ r.date }}</td>
                <td><span [class]="r.severity === 'Security' ? 'tag red' : r.severity === 'Recommended' ? 'tag blue' : 'tag grey'">{{ r.severity }}</span></td>
                <td class="num">{{ pending(r.type) }}</td>
                <td><button class="link" [disabled]="!pending(r.type)" (click)="openNew(r.type)">Roll out</button></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (nw(); as f) {
      <div class="g-overlay" (click)="nw.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>New Staged Rollout</h3><button type="button" class="close-btn" (click)="nw.set(null)">×</button></div>
        <div class="form-grid">
          <label>Device type<select class="select" [value]="f.type" (change)="nw.set({ type: $any($event.target).value, window: f.window, auto: f.auto, site: f.site })">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Target version<input class="input" [value]="meta(f.type).latest" readonly /></label>
          <label>Scope<select class="select" [value]="f.site" (change)="nw.set({ type: f.type, window: f.window, auto: f.auto, site: $any($event.target).value })"><option>All Sites</option>@for (s of sites; track s) {<option>{{ s }}</option>}</select></label>
          <label>Maintenance window<select class="select" [value]="f.window" (change)="nw.set({ type: f.type, window: $any($event.target).value, auto: f.auto, site: f.site })"><option>22:00 – 05:00</option><option>01:00 – 04:00</option><option>Immediately</option></select></label>
          <label class="full chk"><input type="checkbox" [checked]="f.auto" (change)="nw.set({ type: f.type, window: f.window, auto: $any($event.target).checked, site: f.site })" />Auto-promote to next stage when failure rate &lt; 2%</label>
        </div>
        <p class="muted">Stages: Pilot 5% → Early Adopters 25% → Broad 60% → Full Fleet 100% · {{ targets(f) }} devices will be updated.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="nw.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!targets(f)">Start Rollout</button></div>
      </form>
    }
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } .danger { color: var(--red); }
    .camps { display: flex; flex-direction: column; gap: 10px; }
    .camp { border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; } .camp.done { background: var(--kb-fbfdfb); }
    .ch { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .ch div { display: flex; flex-direction: column; font-size: 13px; } .ch small { color: var(--muted); font-size: 11.5px; }
    .ic { width: 36px; height: 36px; border-radius: 9px; color: var(--kf-ffffff); display: grid; place-items: center; }
    .stages { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 0; margin: 12px 0 8px; }
    .stages li { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); } .stages i { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--kl-d4d7e3); display: grid; place-items: center; font-style: normal; font-size: 11px; flex-shrink: 0; }
    .stages span { display: flex; flex-direction: column; } .stages small { font-size: 10.5px; }
    .stages li.ok { color: var(--kf-15803d); } .stages li.ok i { background: var(--kb-22c55e); border-color: var(--kl-22c55e); color: var(--kf-ffffff); } .stages li.cur { color: var(--primary); font-weight: 600; } .stages li.cur i { border-color: var(--primary); }
    .prog { display: flex; gap: 10px; align-items: center; font-size: 12px; } .bar { position: relative; flex: 1; height: 8px; border-radius: 5px; background: var(--kb-eef0f5); }
    .bar i { display: block; height: 100%; border-radius: 5px; background: linear-gradient(90deg, var(--kb-7c3aed), var(--kb-3b82f6)); transition: width .6s; } .bar em { position: absolute; top: -3px; width: 2px; height: 14px; background: var(--kb-1e1b4b); opacity: .5; }
    .cf { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; flex-wrap: wrap; }
    .g2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 12px; margin-top: 12px; } .chk { flex-direction: row !important; align-items: center; gap: 8px !important; } .g2 > .card { min-width: 0; overflow-x: auto; }
    @media (max-width: 1250px) { .g2 { grid-template-columns: 1fr; } }
  `,
})
export class FirmwareUpdates {
  protected readonly P = P;
  protected readonly Math = Math;
  protected readonly store = inject(DeviceStore);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly stages = STAGES;
  protected readonly types = TYPES;
  protected readonly sites = SITES;
  protected readonly releases = RELEASES;
  protected readonly shortTypes = TYPES.map((t) => TYPE_META[t].short);
  protected readonly cf = signal('Active');
  protected readonly nw = signal<{ type: DType; window: string; auto: boolean; site: string } | null>(null);

  protected readonly camps = computed(() => this.store.campaigns().filter((c) => this.cf() === 'All' || (this.cf() === 'Active') === (c.stage < 4)));
  protected readonly active = computed(() => this.store.campaigns().filter((c) => c.stage < 4).length);
  protected readonly paused = computed(() => this.store.campaigns().filter((c) => c.stage < 4 && c.paused).length);
  protected readonly failed = computed(() => this.store.campaigns().reduce((a, c) => a + c.failed, 0));
  protected readonly upPct = computed(() => {
    const a = this.store.devices().filter((d) => d.status !== 'Inactive');
    return ((1 - this.store.outdated() / a.length) * 100).toFixed(1);
  });
  protected readonly versions = computed(() => {
    const per = TYPES.map((t) => {
      const l = this.store.devices().filter((d) => d.type === t && d.status !== 'Inactive');
      const latest = l.filter((d) => d.firmware === TYPE_META[t].latest).length;
      return [latest, l.length - latest];
    });
    return [
      { name: 'Latest', color: 'var(--ka-10b981)', values: per.map((p) => p[0]) },
      { name: 'Older', color: 'var(--ka-f59e0b)', values: per.map((p) => p[1]) },
    ];
  });

  protected meta(t: DType) {
    return TYPE_META[t];
  }
  protected pending(t: DType) {
    return this.store.devices().filter((d) => d.type === t && d.status !== 'Inactive' && d.firmware !== TYPE_META[t].latest).length;
  }
  protected targets(f: { type: DType; site: string }) {
    return this.store.devices().filter((d) => d.type === f.type && d.status !== 'Inactive' && d.firmware !== TYPE_META[f.type].latest && (f.site === 'All Sites' || d.site === f.site)).length;
  }
  protected stageDone(c: Campaign) {
    return c.done >= Math.round((STAGES[Math.min(c.stage, 3)].pct / 100) * c.total);
  }
  private upd(id: string, ch: Partial<Campaign>) {
    this.store.campaigns.update((l) => l.map((c) => (c.id === id ? { ...c, ...ch } : c)));
  }
  protected toggle(c: Campaign) {
    this.upd(c.id, { paused: !c.paused });
    this.store.toastMsg(`${c.name} ${c.paused ? 'resumed' : 'paused'}`);
  }
  protected promote(c: Campaign) {
    if (c.stage === 3) {
      this.upd(c.id, { stage: 4, done: c.total });
      this.applyFw(c);
      return this.store.toastMsg(`${c.name} completed`);
    }
    this.upd(c.id, { stage: c.stage + 1, paused: false });
    this.store.toastMsg(`${c.name} promoted to ${STAGES[c.stage + 1].name} (${STAGES[c.stage + 1].pct}%)`);
  }
  private applyFw(c: Campaign) {
    const ids = this.store.devices().filter((d) => d.type === c.type && d.status !== 'Inactive').map((d) => d.id);
    this.store.devices.update((l) => l.map((d) => (ids.includes(d.id) ? { ...d, firmware: TYPE_META[d.type].latest, fwUpdated: '14 Oct 2026' } : d)));
  }
  protected rollback(c: Campaign) {
    this.store.campaigns.update((l) => l.filter((x) => x.id !== c.id));
    this.store.toastMsg(`${c.name} rolled back · ${c.done} devices reverting to ${c.from}`);
  }
  protected report(c: Campaign) {
    downloadCsv(`${c.id}-report.csv`, [['Campaign', 'Type', 'From', 'To', 'Devices', 'Updated', 'Failed'], [c.name, c.type, c.from, c.to, c.total, c.done, c.failed]]);
  }
  protected openNew(t: DType = 'Access Point') {
    this.nw.set({ type: t, window: '22:00 – 05:00', auto: true, site: 'All Sites' });
  }
  protected create() {
    const f = this.nw()!;
    const n = this.targets(f);
    const id = `FW-2026-${32 + this.store.campaigns().length}`;
    const m = TYPE_META[f.type];
    this.store.campaigns.update((l) => [{ id, name: `${f.type} ${m.latest} rollout${f.site !== 'All Sites' ? ' · ' + f.site : ''}`, type: f.type, from: 'mixed', to: m.latest, total: n, stage: 0, done: 0, failed: 0, paused: false, started: '14 Oct 2026', window: f.window, owner: 'Rex Kumar' }, ...l]);
    this.nw.set(null);
    this.cf.set('Active');
    this.store.toastMsg(`Rollout ${id} started · pilot group of ${Math.max(1, Math.round(n * 0.05))} devices`);
  }
  protected check() {
    this.store.toastMsg('Checking vendor portals (Extreme, Milesight)...');
    setTimeout(() => this.store.toastMsg('Catalog up to date · 6 releases, 0 new'), 1500);
  }
  protected exportCsv() {
    downloadCsv('firmware-status.csv', [['Device', 'Type', 'Firmware', 'Latest', 'Last Updated'], ...this.store.devices().map((d) => [d.name, d.type, d.firmware, TYPE_META[d.type].latest, d.fwUpdated])]);
  }
}

/* =====================================================================
   Edge Gateway Management
   ===================================================================== */
@Component({
  selector: 'app-devices-edge-gateway-management',
  imports: [...UI, DevArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Edge Gateway Management" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Manage edge compute nodes, their workloads, buffering and connected devices.">
      <button class="btn-primary" (click)="deploy.set({ app: 'mqtt-bridge', targets: [sel()?.id ?? 'GW-01'] })"><app-icon name="plus" [size]="16" />Deploy Edge App</button>
      <button class="btn-ghost" (click)="syncAll()"><app-icon name="refresh" [size]="16" />Sync All</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Edge Nodes" [value]="gws().length" icon="devices-gateway" color="var(--ka-7c3aed)" [sub]="typeCount() + ' gateway devices total'" />
      <app-kpi label="Online" [value]="online()" icon="devices-check" color="var(--ka-10b981)" [sub]="(gws().length - online()) + ' need attention'" />
      <app-kpi label="Connected Devices" [value]="fmt(connected())" icon="devices-link" color="var(--ka-3b82f6)" change="3%" sub="vs. last week" />
      <app-kpi label="Edge Apps Running" [value]="appsRunning()" icon="devices-server" color="var(--ka-06b6d4)" [sub]="appsTotal() + ' deployed'" />
      <app-kpi label="Buffered Messages" [value]="fmt(buffered())" icon="devices-cloud" color="var(--ka-f97316)" sub="awaiting cloud sync" subColor="var(--ka-c2410c)" />
    </section>

    <section class="eg">
      <div class="grid">
        @for (g of gws(); track g.id) {
          <button class="gw card" [class.on]="selId() === g.id" (click)="selId.set(g.id)">
            <div class="gh"><b>{{ g.name }}</b><span [class]="'tag ' + cls(g.status)">{{ g.status }}</span></div>
            <small class="muted">{{ g.site }} · {{ g.location }}</small>
            <div class="m"><span>CPU</span><i><em [style.width.%]="g.cpu" [style.background]="g.cpu > 80 ? 'var(--ka-ef4444)' : 'var(--ka-7c3aed)'"></em></i><b>{{ g.cpu }}%</b></div>
            <div class="m"><span>Mem</span><i><em [style.width.%]="g.mem" style="background:var(--kb-10b981)"></em></i><b>{{ g.mem }}%</b></div>
            <div class="m"><span>Disk</span><i><em [style.width.%]="g.disk" style="background:var(--kb-3b82f6)"></em></i><b>{{ g.disk }}%</b></div>
            <div class="gf"><span><app-icon name="devices-link" [size]="13" />{{ g.devices }}</span><span><app-icon name="devices-server" [size]="13" />{{ running(g) }}/{{ g.apps.length }}</span><span>{{ g.uplink }}</span></div>
          </button>
        }
      </div>

      @if (sel(); as g) {
        <aside class="card det">
          <div class="dh"><app-dev-art type="Gateway" [size]="70" /><div><h3>{{ g.name }}</h3><small class="muted">{{ g.model }} · {{ g.site }} · {{ g.location }}</small><span [class]="'tag ' + cls(g.status)">{{ g.status }}</span></div></div>
          <div class="toolbar">
            <button class="btn-ghost sm" (click)="rebootGw(g)"><app-icon name="devices-power" [size]="14" />Reboot</button>
            <button class="btn-ghost sm" (click)="sync(g)" [disabled]="!g.buffer"><app-icon name="devices-cloud" [size]="14" />Flush buffer</button>
            <button class="btn-ghost sm" (click)="term.set(true); out.set(banner(g))"><app-icon name="devices-terminal" [size]="14" />Remote shell</button>
            <button class="btn-ghost sm" (click)="deploy.set({ app: 'video-analytics', targets: [g.id] })"><app-icon name="plus" [size]="14" />Deploy app</button>
          </div>
          <div class="st4">
            <div><small>Throughput</small><b>{{ g.throughput }} Mbps</b></div><div><small>Devices</small><b>{{ g.devices }}</b></div>
            <div><small>Buffer</small><b [class.bad]="g.buffer > 1000">{{ fmt(g.buffer) }}</b></div><div><small>Last sync</small><b>{{ g.lastSync ? g.lastSync + ' min' : 'now' }}</b></div>
          </div>
          <h4>Resource Usage <span class="muted">· live</span></h4>
          <app-line-chart [labels]="mins" [series]="res(g)" [height]="170" suffix="%" />
          <h4>Edge Applications</h4>
          <table class="table">
            <thead><tr><th>App</th><th>Version</th><th>Status</th><th class="num">CPU</th><th class="num">Mem MB</th><th></th></tr></thead>
            <tbody>
              @for (a of g.apps; track a.name) {
                <tr><td><b>{{ a.name }}</b></td><td>{{ a.version }}</td><td><span [class]="a.status === 'Running' ? 'tag green' : a.status === 'Stopped' ? 'tag red' : 'tag amber'">{{ a.status }}</span></td>
                  <td class="num">{{ a.status === 'Running' ? a.cpu + '%' : '—' }}</td><td class="num">{{ a.status === 'Running' ? a.mem : '—' }}</td>
                  <td class="acts">
                    @if (a.status === 'Running') {<button class="link" (click)="appAct(g, a.name, 'restart')">Restart</button><button class="link danger" (click)="appAct(g, a.name, 'stop')">Stop</button>}
                    @else if (a.status === 'Stopped') {<button class="link" (click)="appAct(g, a.name, 'start')" [disabled]="g.status === 'Offline'">Start</button>}
                    <button class="link danger" (click)="appAct(g, a.name, 'remove')" title="Remove">✕</button>
                  </td></tr>
              }
            </tbody>
          </table>
        </aside>
      }
    </section>

    @if (deploy(); as d) {
      <div class="g-overlay" (click)="deploy.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doDeploy()">
        <div class="modal-head"><h3>Deploy Edge Application</h3><button type="button" class="close-btn" (click)="deploy.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Application<select class="select" [value]="d.app" (change)="deploy.set({ app: $any($event.target).value, targets: d.targets })">@for (a of catalog; track a[0]) {<option [value]="a[0]">{{ a[0] }} {{ a[1] }} — {{ a[2] }}</option>}</select></label>
        </div>
        <h4>Target gateways</h4>
        <div class="tg">@for (g of gws(); track g.id) {<label [class.off]="g.status === 'Offline'"><input type="checkbox" [disabled]="g.status === 'Offline'" [checked]="d.targets.includes(g.id)" (change)="toggleTarget(g.id)" />{{ g.name }} <small>{{ g.site }}</small></label>}</div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="deploy.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!d.targets.length">Deploy to {{ d.targets.length }} gateway(s)</button></div>
      </form>
    }
    @if (term() && sel(); as g) {
      <div class="g-overlay" (click)="term.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Remote Shell · {{ g.name }}</h3><button class="close-btn" (click)="term.set(false)">×</button></div>
        <pre class="con">{{ out() }}</pre>
        <form class="cmd" (submit)="$event.preventDefault(); run(g)"><span>admin&#64;{{ g.name.toLowerCase() }}:~$</span><input class="input" [value]="cmd()" (input)="cmd.set($any($event.target).value)" placeholder="try: uptime, docker ps, df -h, help" /></form>
      </div>
    }
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 16px; } h4 { margin: 14px 0 6px; font-size: 13px; } .danger { color: var(--red) !important; }
    .eg { display: grid; grid-template-columns: minmax(0, 1fr) 470px; gap: 12px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .gw { text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; font: inherit; color: inherit; padding: 12px; } .gw.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .gh { display: flex; justify-content: space-between; align-items: center; } .gw small { font-size: 11px; }
    .m { display: grid; grid-template-columns: 34px 1fr 36px; gap: 6px; align-items: center; font-size: 11px; } .m i { height: 6px; border-radius: 4px; background: var(--kb-eef0f5); overflow: hidden; } .m em { display: block; height: 100%; transition: width .6s; } .m b { text-align: right; }
    .gf { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); border-top: 1px solid var(--kl-f0f1f6); padding-top: 6px; } .gf span { display: inline-flex; gap: 4px; align-items: center; }
    .det { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
    .dh { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; } .dh div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
    .st4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; } .st4 div { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; } .st4 small { color: var(--muted); font-size: 11px; }
    .acts { display: flex; gap: 6px; } .det .table td, .det .table th { padding: 7px 5px; font-size: 11.5px; } .det { min-width: 0; }
    .tg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .tg label { display: flex; gap: 6px; align-items: center; font-size: 12.5px; } .tg label.off { opacity: .45; } .tg small { color: var(--muted); }
    .con { background: var(--kb-0f172a); color: var(--kf-a7f3d0); font-size: 12px; padding: 12px; border-radius: 8px; height: 320px; overflow: auto; white-space: pre-wrap; margin: 0; }
    .cmd { display: flex; gap: 8px; align-items: center; margin-top: 8px; font-family: monospace; font-size: 12px; } .cmd .input { flex: 1; font-family: monospace; }
    @media (max-width: 1300px) { .eg { grid-template-columns: 1fr; } .det { position: static; max-height: none; } }
  `,
})
export class EdgeGatewayManagement {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  private readonly state = inject(AppState);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly cls = statusCls;
  protected readonly gws = this.store.gateways;
  protected readonly selId = signal('GW-01');
  protected readonly deploy = signal<{ app: string; targets: string[] } | null>(null);
  protected readonly term = signal(false);
  protected readonly out = signal('');
  protected readonly cmd = signal('');
  protected readonly mins = Array.from({ length: 12 }, (_, i) => `-${(11 - i) * 5}m`);
  protected readonly catalog = [['mqtt-bridge', '2.4.1', 'MQTT ↔ cloud bridge'], ['lorawan-ns', '1.9.0', 'LoRaWAN network server'], ['video-analytics', '3.1.2', 'People counting & PPE detection'], ['modbus-collector', '1.2.7', 'Modbus/BACnet collector'], ['rtls-engine', '4.0.3', 'BLE RTLS positioning'], ['opc-ua-client', '1.0.9', 'OPC-UA client']];

  protected readonly sel = computed(() => this.gws().find((g) => g.id === this.selId()) ?? null);
  protected readonly online = computed(() => this.gws().filter((g) => g.status === 'Online').length);
  protected readonly typeCount = computed(() => this.store.devices().filter((d) => d.type === 'Gateway').length);
  protected readonly connected = computed(() => this.gws().reduce((a, g) => a + (g.status === 'Offline' ? 0 : g.devices), 0));
  protected readonly appsRunning = computed(() => this.gws().reduce((a, g) => a + this.running(g), 0));
  protected readonly appsTotal = computed(() => this.gws().reduce((a, g) => a + g.apps.length, 0));
  protected readonly buffered = computed(() => this.gws().reduce((a, g) => a + g.buffer, 0));

  protected running(g: EdgeGw) {
    return g.apps.filter((a) => a.status === 'Running').length;
  }
  protected res(g: EdgeGw) {
    const t = this.state.tick();
    const on = g.status !== 'Offline';
    return [
      { name: 'CPU', color: 'var(--ka-7c3aed)', values: this.mins.map((_, i) => (on ? Math.max(3, Math.round(g.cpu + Math.sin((i + t) / 1.7) * 9)) : 0)), area: true },
      { name: 'Memory', color: 'var(--ka-10b981)', values: this.mins.map((_, i) => (on ? Math.round(g.mem + Math.cos((i + t) / 3) * 3) : 0)) },
    ];
  }
  private upd(id: string, f: (g: EdgeGw) => EdgeGw) {
    this.store.gateways.update((l) => l.map((g) => (g.id === id ? f(g) : g)));
  }
  protected appAct(g: EdgeGw, name: string, a: string) {
    if (a === 'remove') {
      this.upd(g.id, (x) => ({ ...x, apps: x.apps.filter((p) => p.name !== name) }));
      return this.store.toastMsg(`${name} removed from ${g.name}`);
    }
    const st: EdgeApp['status'] = a === 'stop' ? 'Stopped' : 'Restarting';
    this.upd(g.id, (x) => ({ ...x, apps: x.apps.map((p) => (p.name === name ? { ...p, status: st } : p)) }));
    if (a !== 'stop') setTimeout(() => this.upd(g.id, (x) => ({ ...x, apps: x.apps.map((p) => (p.name === name ? { ...p, status: 'Running' } : p)) })), 2500);
    this.store.toastMsg(`${name} ${a === 'stop' ? 'stopped' : a === 'start' ? 'starting' : 'restarting'} on ${g.name}`);
  }
  protected rebootGw(g: EdgeGw) {
    this.upd(g.id, (x) => ({ ...x, status: 'Maintenance', apps: x.apps.map((p) => ({ ...p, status: 'Restarting' })) }));
    this.store.toastMsg(`${g.name} rebooting · ${g.devices} devices buffering locally`);
    setTimeout(() => this.upd(g.id, (x) => ({ ...x, status: 'Online', cpu: 22, mem: 41, lastSync: 0, apps: x.apps.map((p) => ({ ...p, status: 'Running' })) })), 4000);
    const dev = this.store.devices().find((d) => d.name === g.name);
    if (dev) setTimeout(() => this.store.patch(dev.id, { status: 'Online', seenAgo: 0 }), 4000);
  }
  protected sync(g: EdgeGw) {
    if (g.status === 'Offline') return this.store.toastMsg(`${g.name} is offline · buffer will flush when uplink returns`);
    this.store.toastMsg(`Flushing ${this.fmt(g.buffer)} buffered messages from ${g.name}`);
    this.upd(g.id, (x) => ({ ...x, buffer: 0, lastSync: 0 }));
  }
  protected syncAll() {
    const n = this.gws().filter((g) => g.status !== 'Offline').reduce((a, g) => a + g.buffer, 0);
    this.store.gateways.update((l) => l.map((g) => (g.status === 'Offline' ? g : { ...g, buffer: 0, lastSync: 0 })));
    this.store.toastMsg(`${this.fmt(n)} messages synced · offline nodes keep buffering`);
  }
  protected toggleTarget(id: string) {
    this.deploy.update((d) => (d ? { ...d, targets: d.targets.includes(id) ? d.targets.filter((x) => x !== id) : [...d.targets, id] } : d));
  }
  protected doDeploy() {
    const d = this.deploy()!;
    const [name, version] = this.catalog.find((c) => c[0] === d.app)!;
    this.store.gateways.update((l) => l.map((g) => (d.targets.includes(g.id) ? { ...g, apps: [...g.apps.filter((a) => a.name !== name), { name, version, status: 'Restarting' as const, cpu: 6, mem: 140 }] } : g)));
    setTimeout(() => this.store.gateways.update((l) => l.map((g) => ({ ...g, apps: g.apps.map((a) => (a.name === name && a.status === 'Restarting' ? { ...a, status: 'Running' as const } : a)) }))), 2500);
    this.deploy.set(null);
    this.store.toastMsg(`${name} ${version} deploying to ${d.targets.length} gateway(s)`);
  }
  protected banner(g: EdgeGw) {
    return g.status === 'Offline' ? `Connecting to ${g.name} via LTE out-of-band...\nssh: connect to host ${g.name.toLowerCase()} port 22: Connection timed out\n` : `Connected to ${g.name} (${g.model}) · People360 Edge OS 3.2\nType 'help' for available commands.\n`;
  }
  protected run(g: EdgeGw) {
    const c = this.cmd().trim();
    if (!c) return;
    const outputs: Record<string, string> = {
      help: 'uptime  docker ps  df -h  free -m  ping <host>  reboot',
      uptime: ` 10:24:12 up 12 days,  6:01,  1 user,  load average: ${(g.cpu / 40).toFixed(2)}, 0.88, 0.71`,
      'docker ps': 'CONTAINER ID   IMAGE                 STATUS\n' + g.apps.map((a, i) => `${(1234567 * (i + 3)).toString(16).slice(0, 12)}   ${a.name}:${a.version}`.padEnd(37) + ' ' + (a.status === 'Running' ? 'Up 6 days' : a.status)).join('\n'),
      'df -h': `Filesystem  Size  Used  Avail Use%\n/dev/mmcblk0  32G  ${Math.round(32 * g.disk / 100)}G  ${32 - Math.round(32 * g.disk / 100)}G  ${g.disk}%`,
      'free -m': `Mem:  4096  ${Math.round(40.96 * g.mem)}  ${4096 - Math.round(40.96 * g.mem)}`,
      reboot: 'Use the Reboot button to schedule a graceful reboot.',
    };
    const res = c.startsWith('ping') ? `PING ${c.split(' ')[1] ?? '8.8.8.8'}: 64 bytes time=${8 + (g.cpu % 7)} ms\n64 bytes time=${9 + (g.cpu % 5)} ms` : outputs[c] ?? `${c}: command not found`;
    this.out.update((o) => `${o}$ ${c}\n${g.status === 'Offline' ? 'not connected' : res}\n`);
    this.cmd.set('');
  }
}
