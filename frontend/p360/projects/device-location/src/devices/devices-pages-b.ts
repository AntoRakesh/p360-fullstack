import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { DevArt, DevDetails } from './dev-ui';
import { ASSIGNEES, DAlert, Device, DeviceStore, DType, fmtSeen, Rma, RMA_REASONS, SITES, statusCls, TYPE_META, TYPES } from './devices.data';

const P = '/device-edge-management';

/* =====================================================================
   Network Connectivity (topology)
   ===================================================================== */
interface NNode { id: string; label: string; sub: string; kind: 'cloud' | 'fw' | 'core' | 'dist' | 'leaf'; x: number; y: number; site?: string; leafType?: DType }
interface NLink { a: string; b: string; util: number; cap: string; state: 'up' | 'degraded' | 'down'; loss: number }

@Component({
  selector: 'app-devices-network-connectivity',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Network Connectivity" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Live topology, WAN links, latency and wireless coverage across all sites.">
      <button class="btn-primary" (click)="runTest()"><app-icon name="activity" [size]="16" />Run Connectivity Test</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="devices-export" [size]="16" />Export Links</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="WAN Availability" value="99.96%" icon="devices-globe" color="var(--ka-7c3aed)" sub="30-day SLA 99.9%" subColor="var(--ka-16a34a)" />
      <app-kpi label="Links Up" [value]="up() + ' / ' + links().length" icon="devices-link" color="var(--ka-10b981)" [sub]="degraded() + ' degraded · ' + down() + ' down'" [subColor]="down() ? 'var(--ka-dc2626)' : 'var(--ka-c2410c)'" />
      <app-kpi label="Avg Latency" [value]="lat() + ' ms'" icon="activity" color="var(--ka-3b82f6)" change="2 ms" [up]="false" sub="vs. yesterday" />
      <app-kpi label="Wireless Clients" [value]="fmt(clients())" icon="wifi" color="var(--ka-06b6d4)" change="5%" />
      <app-kpi label="Peak Utilisation" [value]="peak() + '%'" icon="chart-line" color="var(--ka-f97316)" sub="Core ↔ Factory uplink" />
    </section>

    <section class="topo-row">
      <div class="card topo">
        <div class="card-head"><h3>Network Topology</h3>
          <div class="toolbar"><span class="lg"><i style="background:var(--kb-22c55e)"></i>&lt; 60%</span><span class="lg"><i style="background:var(--kb-f59e0b)"></i>60–85%</span><span class="lg"><i style="background:var(--kb-ef4444)"></i>&gt; 85% / down</span>
            <select class="select" [value]="siteF()" (change)="siteF.set($any($event.target).value)"><option value="All">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></div>
        </div>
        <svg viewBox="0 0 1000 470" class="tsvg">
          @for (l of links(); track l.a + l.b) {
            @if (vis(l.b)) {
              <line [attr.x1]="n(l.a).x" [attr.y1]="n(l.a).y" [attr.x2]="n(l.b).x" [attr.y2]="n(l.b).y" [attr.stroke]="lc(l)" [attr.stroke-width]="l.state === 'down' ? 2 : 2 + l.util / 30" [attr.stroke-dasharray]="l.state === 'down' ? '6 6' : null" class="ln" (click)="selLink.set(l); selId.set(null)" />
              @if (l.state !== 'down') {<line [attr.x1]="n(l.a).x" [attr.y1]="n(l.a).y" [attr.x2]="n(l.b).x" [attr.y2]="n(l.b).y" stroke="var(--kl-ffffff)" stroke-width="1.6" stroke-dasharray="3 14" [attr.stroke-dashoffset]="-tick() * 9" class="flow" />}
            }
          }
          @for (x of nodes(); track x.id) {
            @if (vis(x.id)) {
              <g class="nd" [class.on]="selId() === x.id" [attr.transform]="'translate(' + x.x + ' ' + x.y + ')'" (click)="selId.set(x.id); selLink.set(null)">
                @switch (x.kind) {
                  @case ('cloud') {<ellipse rx="46" ry="22" fill="var(--ka-eef2ff)" stroke="var(--kl-818cf8)" stroke-width="1.5" /><text y="4" text-anchor="middle" class="nl">{{ x.label }}</text>}
                  @case ('fw') {<rect x="-40" y="-18" width="80" height="36" rx="8" fill="var(--ka-fff1f2)" stroke="var(--kl-f43f5e)" stroke-width="1.5" /><text y="4" text-anchor="middle" class="nl">{{ x.label }}</text>}
                  @case ('core') {<rect x="-50" y="-20" width="100" height="40" rx="9" fill="var(--ka-7c3aed)" /><text y="5" text-anchor="middle" class="nl w">{{ x.label }}</text>}
                  @case ('dist') {<rect x="-48" y="-19" width="96" height="38" rx="8" fill="var(--ka-ffffff)" [attr.stroke]="nodeColor(x)" stroke-width="2" /><text y="-2" text-anchor="middle" class="nl">{{ x.label }}</text><text y="11" text-anchor="middle" class="ns">{{ x.sub }}</text>}
                  @default {<circle r="17" [attr.fill]="'color-mix(in srgb, ' + meta(x.leafType!).color + ' 13%, transparent)'" [attr.stroke]="meta(x.leafType!).color" stroke-width="1.5" /><text y="4" text-anchor="middle" class="nc">{{ x.label }}</text><text y="31" text-anchor="middle" class="ns">{{ x.sub }}</text>}
                }
              </g>
            }
          }
        </svg>
      </div>
      <aside class="card side">
        @if (selNode(); as x) {
          <h3>{{ x.kind === 'leaf' ? x.sub + ' · ' + x.site : x.label }}</h3>
          <small class="muted">{{ kindLabel(x) }}</small>
          <dl>
            @for (r of nodeInfo(x); track r[0]) {<dt>{{ r[0] }}</dt><dd>{{ r[1] }}</dd>}
          </dl>
          <div class="toolbar">
            <button class="btn-ghost sm" (click)="ping(x.label)">Ping</button><button class="btn-ghost sm" (click)="trace(x.label)">Traceroute</button>
            @if (x.site) {<button class="btn-ghost sm" (click)="openInventory(x)">View devices</button>}
          </div>
        } @else if (selLink(); as l) {
          <h3>{{ n(l.a).label }} ↔ {{ n(l.b).label }}</h3>
          <small class="muted">Link · {{ l.cap }}</small>
          <dl><dt>State</dt><dd><span [class]="l.state === 'up' ? 'tag green' : l.state === 'degraded' ? 'tag amber' : 'tag red'">{{ l.state }}</span></dd><dt>Utilisation</dt><dd>{{ l.state === 'down' ? 0 : l.util }}%</dd><dt>Packet loss</dt><dd>{{ l.loss }}%</dd><dt>Errors (24h)</dt><dd>{{ l.loss * 37 }}</dd></dl>
          <div class="toolbar"><button class="btn-ghost sm" (click)="bounce(l)">{{ l.state === 'down' ? 'Bring up' : 'Bounce port' }}</button><button class="btn-ghost sm" (click)="trace(n(l.b).label)">Traceroute</button></div>
        } @else {<p class="muted">Select a node or link in the topology.</p>}
        @if (con()) {<pre class="con">{{ con() }}</pre>}
      </aside>
    </section>

    <section class="g2">
      <div class="card">
        <div class="card-head"><h3>WAN &amp; Uplinks</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Link</th><th>Provider</th><th>Bandwidth</th><th>Utilisation</th><th class="num">Latency</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (w of wan(); track w.name) {
              <tr><td><b>{{ w.name }}</b></td><td>{{ w.isp }}</td><td>{{ w.bw }}</td>
                <td><span class="mini"><i [style.width.%]="w.util" [style.background]="w.util > 85 ? 'var(--ka-ef4444)' : w.util > 60 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)'"></i></span>{{ w.util }}%</td>
                <td class="num">{{ w.lat }} ms</td><td><span [class]="w.role === 'Active' ? 'tag blue' : 'tag grey'">{{ w.role }}</span></td><td><span [class]="w.up ? 'tag green' : 'tag red'">{{ w.up ? 'Up' : 'Down' }}</span></td>
                <td><button class="link" (click)="failover(w.name)">{{ w.role === 'Active' ? 'Test failover' : 'Make active' }}</button></td></tr>
            }
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Latency by Site <span class="card-sub">last 24h, ms</span></h3></div>
        <app-line-chart [labels]="hours" [series]="latSeries()" [height]="210" />
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>Wireless Clients by SSID</h3></div>
      <app-bar-list [rows]="ssids()" [max]="5000" />
    </section>
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; }
    .topo-row { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; margin-bottom: 12px; align-items: start; }
    .tsvg { width: 100%; height: auto; display: block; } .ln { cursor: pointer; } .flow { pointer-events: none; transition: stroke-dashoffset 2.4s linear; opacity: .8; }
    .nd { cursor: pointer; } .nd.on rect, .nd.on circle, .nd.on ellipse { filter: drop-shadow(0 0 6px rgba(124,58,237,.6)); stroke-width: 3; }
    .nl { font-size: 12px; font-weight: 600; fill: var(--ka-1e1b4b); } .nl.w { fill: var(--ka-ffffff); } .ns { font-size: 9.5px; fill: var(--ka-64748b); } .nc { font-size: 11px; font-weight: 700; fill: var(--ka-1e1b4b); }
    .lg { display: inline-flex; gap: 5px; align-items: center; font-size: 11.5px; color: var(--muted); } .lg i { width: 14px; height: 4px; border-radius: 2px; }
    .side dl { display: grid; grid-template-columns: 110px 1fr; gap: 7px 8px; font-size: 12.5px; margin: 12px 0; } .side dt { color: var(--muted); } .side dd { margin: 0; }
    .con { background: var(--kb-0f172a); color: var(--kf-a7f3d0); font-size: 11px; padding: 10px; border-radius: 8px; margin: 10px 0 0; white-space: pre-wrap; }
    .g2 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; margin-bottom: 12px; } .g2 .table td, .g2 .table th { padding: 8px 7px; }
    .mini { display: inline-block; width: 70px; height: 6px; border-radius: 4px; background: var(--kb-eef0f5); margin-right: 6px; overflow: hidden; vertical-align: middle; } .mini i { display: block; height: 100%; }
    @media (max-width: 1250px) { .topo-row, .g2 { grid-template-columns: 1fr; } }
  `,
})
export class NetworkConnectivity {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  private readonly state = inject(AppState);
  private readonly router = inject(Router);
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly sites = SITES;
  protected readonly tick = this.state.tick;
  protected readonly siteF = signal('All');
  protected readonly selId = signal<string | null>('core');
  protected readonly selLink = signal<NLink | null>(null);
  protected readonly con = signal('');
  protected readonly hours = Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, '0')}:00`);

  protected readonly nodes = computed<NNode[]>(() => {
    const out: NNode[] = [
      { id: 'isp', label: 'Internet', sub: '', kind: 'cloud', x: 500, y: 34 },
      { id: 'fw', label: 'FW-01', sub: 'Firewall HA', kind: 'fw', x: 500, y: 112 },
      { id: 'core', label: 'CORE-01', sub: 'Core switch', kind: 'core', x: 500, y: 190 },
    ];
    const leafTypes: DType[] = ['Access Point', 'Camera', 'IoT Sensor'];
    SITES.forEach((s, i) => {
      const x = 90 + i * 164;
      const devs = this.store.devices().filter((d) => d.site === s);
      out.push({ id: 'd-' + s, label: `DS-${s.toUpperCase().slice(0, 4)}`, sub: `${s} · ${devs.length} devices`, kind: 'dist', x, y: 290, site: s });
      leafTypes.forEach((t, k) => {
        const n = devs.filter((d) => d.type === t).length;
        out.push({ id: `l-${s}-${k}`, label: String(n), sub: TYPE_META[t].short, kind: 'leaf', x: x - 50 + k * 50, y: 400, site: s, leafType: t });
      });
    });
    return out;
  });
  protected readonly links = signal<NLink[]>([
    { a: 'isp', b: 'fw', util: 46, cap: '2 × 1 Gbps', state: 'up', loss: 0 },
    { a: 'fw', b: 'core', util: 38, cap: '10 Gbps', state: 'up', loss: 0 },
    ...SITES.map((s, i): NLink => ({ a: 'core', b: 'd-' + s, util: s === 'Factory' ? 88 : s === 'Warehouse' ? 67 : 20 + i * 7, cap: i < 2 ? '10 Gbps' : '1 Gbps', state: s === 'Parking' ? 'degraded' : 'up', loss: s === 'Parking' ? 4 : 0 })),
    ...SITES.flatMap((s, i) => [0, 1, 2].map((k): NLink => ({ a: 'd-' + s, b: `l-${s}-${k}`, util: 15 + ((i * 3 + k * 11) % 50), cap: '1 Gbps', state: s === 'Factory' && k === 2 ? 'down' : 'up', loss: s === 'Factory' && k === 2 ? 100 : 0 }))),
  ]);
  protected readonly selNode = computed(() => this.nodes().find((x) => x.id === this.selId()) ?? null);
  protected readonly up = computed(() => this.links().filter((l) => l.state === 'up').length);
  protected readonly degraded = computed(() => this.links().filter((l) => l.state === 'degraded').length);
  protected readonly down = computed(() => this.links().filter((l) => l.state === 'down').length);
  protected readonly peak = computed(() => Math.max(...this.links().filter((l) => l.state !== 'down').map((l) => l.util)) + this.state.wobble('peak', 2));
  protected readonly lat = computed(() => 12 + this.state.wobble('lat', 2));
  protected readonly clients = computed(() => 8642 + this.state.wobble('cl', 40));
  protected readonly wan = signal([
    { name: 'WAN-1 Primary', isp: 'Etisalat Business', bw: '1 Gbps', util: 46, lat: 8, role: 'Active', up: true },
    { name: 'WAN-2 Secondary', isp: 'du Business', bw: '500 Mbps', util: 4, lat: 11, role: 'Standby', up: true },
    { name: 'LTE Backup', isp: 'du 5G', bw: '300 Mbps', util: 0, lat: 28, role: 'Standby', up: true },
    { name: 'MPLS Branch', isp: 'Etisalat MPLS', bw: '200 Mbps', util: 61, lat: 14, role: 'Active', up: true },
  ]);
  protected readonly latSeries = computed(() => {
    const t = this.state.tick();
    return ['HQ', 'Factory', 'Branch'].map((s, k) => ({ name: s, color: ['var(--ka-7c3aed)', 'var(--ka-f97316)', 'var(--ka-10b981)'][k], values: this.hours.map((_, i) => Math.round(8 + k * 5 + Math.abs(Math.sin((i + k + t * 0.2) / 2)) * (k === 1 ? 14 : 6))) }));
  });
  protected readonly ssids = computed(() => [
    { label: 'Corp-WiFi', value: 4820 + this.state.wobble('s1', 30), display: this.fmt(4820 + this.state.wobble('s1', 30)), color: 'var(--ka-7c3aed)' },
    { label: 'Guest-WiFi', value: 1960, display: '1,960', color: 'var(--ka-3b82f6)' },
    { label: 'IoT-Secure', value: 1240, display: '1,240', color: 'var(--ka-10b981)' },
    { label: 'Ops-Handheld', value: 622, display: '622', color: 'var(--ka-f59e0b)' },
  ]);

  protected n(id: string) {
    return this.nodes().find((x) => x.id === id)!;
  }
  protected meta(t: DType) {
    return TYPE_META[t];
  }
  protected vis(id: string) {
    const f = this.siteF();
    const x = this.nodes().find((y) => y.id === id);
    return f === 'All' || !x?.site || x.site === f;
  }
  protected lc(l: NLink) {
    return l.state === 'down' ? 'var(--ka-ef4444)' : l.state === 'degraded' || (l.util > 60 && l.util <= 85) ? 'var(--ka-f59e0b)' : l.util > 85 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)';
  }
  protected nodeColor(x: NNode) {
    const l = this.links().find((y) => y.b === x.id);
    return l ? this.lc(l) : 'var(--ka-22c55e)';
  }
  protected kindLabel(x: NNode) {
    return { cloud: 'Upstream providers', fw: 'Perimeter firewall (HA pair)', core: 'Core switch stack', dist: 'Site distribution switch', leaf: 'Edge device group' }[x.kind];
  }
  protected nodeInfo(x: NNode): [string, string][] {
    if (x.kind === 'leaf') {
      const l = this.store.devices().filter((d) => d.site === x.site && d.type === x.leafType);
      return [['Devices', String(l.length)], ['Online', String(l.filter((d) => d.status === 'Online').length)], ['Offline', String(l.filter((d) => d.status === 'Offline').length)], ['Avg latency', `${Math.round(l.reduce((a, d) => a + d.latency, 0) / (l.length || 1))} ms`]];
    }
    if (x.kind === 'dist') {
      const l = this.links().find((y) => y.b === x.id)!;
      return [['Model', 'Extreme S5520'], ['Uplink', `${l.cap} · ${l.util}%`], ['Packet loss', `${l.loss}%`], ['Devices', x.sub.split('· ')[1]], ['IP', `10.${10 + SITES.indexOf(x.site!)}.0.1`]];
    }
    if (x.kind === 'core') return [['Model', 'Extreme 7520-48Y'], ['Ports up', '46 / 48'], ['Throughput', `${(7.4 + this.state.wobble('core', 3) / 10).toFixed(1)} Gbps`], ['CPU', '21%'], ['Uptime', '182 days']];
    if (x.kind === 'fw') return [['Model', 'FortiGate 600F HA'], ['Sessions', this.fmt(184220 + this.state.wobble('fw', 900))], ['Threats blocked', '1,284 today'], ['VPN tunnels', '14 up']];
    return [['Providers', 'Etisalat · du · 5G LTE'], ['Public IPs', '3'], ['Egress', `${(462 + this.state.wobble('eg', 20))} Mbps`]];
  }
  protected ping(h: string) {
    this.con.set(`$ ping ${h}\n` + [1, 2, 3].map((i) => `reply from ${h}: time=${2 + i * 1.3} ms`).join('\n'));
  }
  protected trace(h: string) {
    this.con.set(`$ traceroute ${h}\n 1  CORE-01 (10.0.0.1)  0.8 ms\n 2  FW-01 (10.0.0.254)  1.4 ms\n 3  ${h}  ${(3 + Math.random() * 5).toFixed(1)} ms`);
  }
  protected bounce(l: NLink) {
    const was = l.state;
    this.links.update((ls) => ls.map((x) => (x === l ? { ...x, state: 'down' as const } : x)));
    this.selLink.set(null);
    this.store.toastMsg(`Port ${this.n(l.a).label} → ${this.n(l.b).label} ${was === 'down' ? 'enabling' : 'bouncing'}...`);
    setTimeout(() => {
      this.links.update((ls) => ls.map((x) => (x.a === l.a && x.b === l.b ? { ...x, state: 'up' as const, loss: 0 } : x)));
      this.store.toastMsg('Link is up · 0% packet loss');
    }, 2500);
  }
  protected failover(name: string) {
    this.wan.update((l) => {
      const isActive = l.find((w) => w.name === name)!.role === 'Active';
      if (name === 'MPLS Branch') return l;
      return l.map((w) => (w.name === 'MPLS Branch' ? w : w.name === name ? { ...w, role: isActive ? 'Standby' : 'Active', util: isActive ? 2 : 44 } : (isActive && w.name === 'WAN-2 Secondary') || (!isActive && w.role === 'Active') ? { ...w, role: isActive ? 'Active' : 'Standby', util: isActive ? 44 : 2 } : w));
    });
    this.store.toastMsg(name === 'MPLS Branch' ? 'MPLS has no standby path configured' : `Failover executed · traffic moved in 1.8 s with 0 sessions dropped`);
  }
  protected runTest() {
    this.store.toastMsg('Testing reachability of 1,248 devices...');
    setTimeout(() => this.store.toastMsg(`Test complete · ${this.store.counts().Online} reachable, ${this.store.counts().Offline} unreachable, avg ${this.lat()} ms`), 1800);
  }
  protected openInventory(x: NNode) {
    this.router.navigateByUrl(P + '/device-inventory');
    this.store.toastMsg(`Showing devices at ${x.site}`);
  }
  protected exportCsv() {
    downloadCsv('network-links.csv', [['From', 'To', 'Capacity', 'Utilisation %', 'State', 'Loss %'], ...this.links().map((l) => [this.n(l.a).label, this.n(l.b).kind === 'leaf' ? this.n(l.b).site + ' ' + this.n(l.b).sub : this.n(l.b).label, l.cap, l.util, l.state, l.loss])]);
  }
}

/* =====================================================================
   Alerts & Notifications
   ===================================================================== */
interface Rule { id: string; name: string; cond: string; sev: string; channels: string[]; on: boolean; fired: number }
@Component({
  selector: 'app-devices-alerts-notifications',
  imports: [...UI, DataTable, DevDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Alerts & Notifications" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Device alerts, alert rules and notification channels.">
      <button class="btn-primary" (click)="openRule()"><app-icon name="plus" [size]="16" />New Alert Rule</button>
      <button class="btn-ghost" (click)="ackAll()"><app-icon name="devices-check" [size]="16" />Acknowledge All Critical</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Open Alerts" [value]="open().length" icon="bell" color="var(--ka-7c3aed)" change="12%" [up]="false" sub="vs. last week" />
      <app-kpi label="Critical" [value]="store.openCritical()" icon="triangle-alert" color="var(--ka-ef4444)" change="2%" [up]="false" />
      <app-kpi label="Unassigned" [value]="unassigned()" icon="user" color="var(--ka-f97316)" sub="need an owner" subColor="var(--ka-c2410c)" />
      <app-kpi label="MTTA" value="6.4 min" icon="clock" color="var(--ka-3b82f6)" change="1.1 min" [up]="false" sub="vs. last week" />
      <app-kpi label="MTTR" value="42 min" icon="devices-wrench" color="var(--ka-10b981)" change="8 min" [up]="false" sub="vs. last week" />
    </section>

    <nav class="tabs main-tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}@if (t === 'Alerts') {<span class="count">{{ open().length }}</span>}</button>}</nav>

    @switch (tab()) {
      @case ('Alerts') {
        <section class="g2">
          <div class="card"><div class="card-head"><h3>Alerts – last 14 days</h3></div><app-column-chart [labels]="days" [series]="trend()" [stacked]="true" [height]="200" /></div>
          <div class="card"><div class="card-head"><h3>By Category</h3></div><app-donut [segments]="cats()" center="Open" [size]="130" /></div>
        </section>
        <section class="al" [class.with]="!!sel()">
          <div class="card">
            <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="alerts"
              [searchKeys]="['id', 'title', 'device', 'site']" searchPlaceholder="Search alert, device, site..." [activeId]="selId()"
              (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
          </div>
          @if (sel(); as a) {
            <aside class="card det">
              <div class="dh"><span [class]="sevTag(a.sev)">{{ a.sev }}</span><b>{{ a.id }}</b><button class="close-btn" (click)="selId.set(null)">×</button></div>
              <h3>{{ a.title }}</h3>
              <dl>
                <dt>Device</dt><dd><button class="link" (click)="openDev(a)">{{ a.device }}</button> · {{ a.type }}</dd><dt>Site</dt><dd>{{ a.site }}</dd><dt>Category</dt><dd>{{ a.category }}</dd>
                <dt>Raised</dt><dd>{{ seen(a) }}</dd><dt>State</dt><dd><span [class]="stTag(a.state)">{{ a.state }}</span></dd>
                <dt>Assignee</dt><dd><select class="select" [value]="a.assignee" (change)="upd(a.id, { assignee: $any($event.target).value }); store.toastMsg(a.id + ' assigned to ' + $any($event.target).value)">@for (p of assignees; track p) {<option [value]="p">{{ p }}</option>}</select></dd>
              </dl>
              <h4>Timeline</h4>
              <ul class="tl">
                @for (e of timeline(a); track $index) {<li><i [style.background]="e.c"></i><div><b>{{ e.t }}</b><small>{{ e.at }}</small></div></li>}
              </ul>
              <textarea class="input" rows="2" placeholder="Add a note..." [value]="note()" (input)="note.set($any($event.target).value)"></textarea>
              <div class="toolbar">
                @if (a.state === 'Open') {<button class="btn-ghost sm" (click)="act('ack', a)">Acknowledge</button>}
                @if (a.state !== 'Resolved') {<button class="btn-primary btn-sm" (click)="act('resolve', a)">Resolve</button>} @else {<button class="btn-ghost sm" (click)="act('reopen', a)">Reopen</button>}
                <button class="btn-ghost sm" (click)="act('ticket', a)">Create ticket</button>
                <button class="btn-ghost sm" [disabled]="!note().trim()" (click)="addNote(a)">Add note</button>
              </div>
            </aside>
          }
        </section>
      }
      @case ('Alert Rules') {
        <section class="card">
          <table class="table">
            <thead><tr><th>Rule</th><th>Condition</th><th>Severity</th><th>Channels</th><th class="num">Fired (30d)</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              @for (r of rules(); track r.id) {
                <tr [class.off]="!r.on"><td><b>{{ r.name }}</b></td><td><code>{{ r.cond }}</code></td><td><span [class]="sevTag(r.sev)">{{ r.sev }}</span></td>
                  <td>@for (c of r.channels; track c) {<span class="chip-s">{{ c }}</span>}</td><td class="num">{{ r.fired }}</td>
                  <td><label class="sw"><input type="checkbox" [checked]="r.on" (change)="toggleRule(r)" /><i></i></label></td>
                  <td><button class="link" (click)="testRule(r)">Test</button> · <button class="link" (click)="openRule(r)">Edit</button></td></tr>
              }
            </tbody>
          </table>
        </section>
      }
      @case ('Channels') {
        <section class="chs">
          @for (c of channels(); track c.name) {
            <div class="card ch">
              <div class="chh"><span class="ci" [style.background]="c.color"><app-icon [name]="c.icon" [size]="18" /></span><div><b>{{ c.name }}</b><small>{{ c.target }}</small></div><label class="sw"><input type="checkbox" [checked]="c.on" (change)="toggleCh(c.name)" /><i></i></label></div>
              <div class="chf"><span class="muted">{{ c.sent }} sent today</span><button class="btn-ghost sm" [disabled]="!c.on" (click)="store.toastMsg('Test notification sent via ' + c.name + ' to ' + c.target)">Send test</button></div>
            </div>
          }
        </section>
        <section class="card quiet">
          <h3>Quiet Hours &amp; Escalation</h3>
          <div class="form-grid">
            <label>Quiet hours (non-critical)<select class="select"><option>22:00 – 06:00</option><option>Off</option><option>20:00 – 07:00</option></select></label>
            <label>Escalate unacknowledged critical after<select class="select"><option>10 minutes</option><option>5 minutes</option><option>15 minutes</option></select></label>
            <label>Escalate to<select class="select"><option>On-call Network Lead</option><option>IT Manager</option><option>Security Supervisor</option></select></label>
            <label>Digest email<select class="select"><option>Daily at 08:00</option><option>Weekly (Mon)</option><option>Off</option></select></label>
          </div>
          <div class="form-actions"><button class="btn-primary" (click)="store.toastMsg('Notification policy saved')">Save Policy</button></div>
        </section>
      }
    }

    @if (rf(); as r) {
      <div class="g-overlay" (click)="rf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveRule()">
        <div class="modal-head"><h3>{{ r.id ? 'Edit Rule' : 'New Alert Rule' }}</h3><button type="button" class="close-btn" (click)="rf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Rule name *<input class="input" required [value]="r.name" (input)="rf.set({ ...r, name: $any($event.target).value })" /></label>
          <label class="full">Condition<input class="input" [value]="r.cond" (input)="rf.set({ ...r, cond: $any($event.target).value })" placeholder="e.g. cpu > 90% for 5m" /></label>
          <label>Severity<select class="select" [value]="r.sev" (change)="rf.set({ ...r, sev: $any($event.target).value })">@for (s of sevs; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Channels<div class="cks">@for (c of chNames; track c) {<label><input type="checkbox" [checked]="r.channels.includes(c)" (change)="rf.set({ ...r, channels: r.channels.includes(c) ? r.channels.filter((x) => x !== c) : [...r.channels, c] })" />{{ c }}</label>}</div></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rf.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Rule</button></div>
      </form>
    }
    <app-dev-details [dev]="dev()" (closed)="dev.set(null)" />
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } h4 { margin: 12px 0 6px; font-size: 13px; }
    .main-tabs { margin-bottom: 12px; } .g2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; margin-bottom: 12px; }
    .al { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .al.with { grid-template-columns: minmax(0, 1fr) 360px; }
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 92px); overflow: auto; }
    .dh { display: flex; gap: 8px; align-items: center; } .dh b { flex: 1; }
    dl { display: grid; grid-template-columns: 80px 1fr; gap: 7px 8px; font-size: 12.5px; margin: 4px 0; } dt { color: var(--muted); } dd { margin: 0; }
    .tl { list-style: none; padding: 0; margin: 0; } .tl li { display: flex; gap: 10px; padding: 6px 0; font-size: 12px; } .tl i { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; } .tl div { display: flex; flex-direction: column; } .tl small { color: var(--muted); }
    tr.off td { opacity: .5; } code { font-size: 11.5px; background: var(--kb-f5f3ff); padding: 2px 6px; border-radius: 4px; color: var(--kf-5b21b6); }
    .sw { position: relative; display: inline-block; width: 34px; height: 19px; } .sw input { opacity: 0; width: 0; height: 0; } .sw i { position: absolute; inset: 0; background: var(--kb-d4d7e3); border-radius: 12px; cursor: pointer; transition: .2s; }
    .sw i::before { content: ''; position: absolute; width: 15px; height: 15px; left: 2px; top: 2px; background: var(--kb-ffffff); border-radius: 50%; transition: .2s; } .sw input:checked + i { background: var(--primary); } .sw input:checked + i::before { transform: translateX(15px); }
    .chs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
    .chh { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; } .chh div { display: flex; flex-direction: column; font-size: 13px; } .chh small { color: var(--muted); font-size: 11.5px; }
    .ci { width: 38px; height: 38px; border-radius: 9px; color: var(--kf-ffffff); display: grid; place-items: center; } .chf { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 12px; }
    .quiet h3 { margin-bottom: 12px; } .cks { display: flex; flex-wrap: wrap; gap: 8px; } .cks label { flex-direction: row !important; align-items: center; gap: 4px !important; }
    @media (max-width: 1250px) { .g2, .al.with { grid-template-columns: 1fr; } .chs { grid-template-columns: 1fr 1fr; } }
  `,
})
export class DevAlertsNotifications {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  protected readonly tabs = ['Alerts', 'Alert Rules', 'Channels'];
  protected readonly tab = signal('Alerts');
  protected readonly selId = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly notes = signal<Record<string, string[]>>({});
  protected readonly dev = signal<Device | null>(null);
  protected readonly assignees = ASSIGNEES;
  protected readonly sevs = ['Critical', 'High', 'Medium', 'Low'];
  protected readonly chNames = ['Email', 'SMS', 'Teams', 'Slack', 'Webhook', 'PagerDuty'];
  protected readonly days = Array.from({ length: 14 }, (_, i) => `${i + 1} Oct`);
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Alert ID' },
    { key: 'title', label: 'Alert' },
    { key: 'device', label: 'Device' },
    { key: 'site', label: 'Site' },
    { key: 'sev', label: 'Severity', kind: 'tag', tag: (r) => this.sevTag(r.sev) },
    { key: 'category', label: 'Category' },
    { key: 'state', label: 'State', kind: 'tag', tag: (r) => this.stTag(r.state) },
    { key: 'assignee', label: 'Assignee' },
    { key: 'when', label: 'Raised' },
  ];
  protected readonly filters = [
    { key: 'sev', label: 'Severity', options: this.sevs },
    { key: 'state', label: 'State', options: ['Open', 'Acknowledged', 'Resolved'] },
    { key: 'category', label: 'Category', options: ['Connectivity', 'Hardware', 'Firmware', 'Security', 'Environment', 'Performance'] },
    { key: 'site', label: 'Site', options: SITES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'ack', label: 'Acknowledge', icon: 'devices-check', when: (r) => r.state === 'Open' },
    { id: 'resolve', label: 'Resolve', icon: 'shield-check', when: (r) => r.state !== 'Resolved' },
    { id: 'me', label: 'Assign to me', icon: 'user' },
    { id: 'device', label: 'View device', icon: 'devices-monitor' },
    { id: 'ticket', label: 'Create ticket', icon: 'devices-ticket' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'ack', label: 'Acknowledge' }, { id: 'resolve', label: 'Resolve' }, { id: 'export', label: 'Export' }];
  protected readonly rules = signal<Rule[]>([
    { id: 'R1', name: 'Device offline', cond: 'heartbeat missing > 15m', sev: 'Critical', channels: ['Email', 'Teams', 'PagerDuty'], on: true, fired: 64 },
    { id: 'R2', name: 'High CPU', cond: 'cpu > 90% for 5m', sev: 'High', channels: ['Email', 'Teams'], on: true, fired: 41 },
    { id: 'R3', name: 'Over temperature', cond: 'temp > 60°C', sev: 'Critical', channels: ['Email', 'SMS'], on: true, fired: 12 },
    { id: 'R4', name: 'Firmware outdated', cond: 'firmware < latest - 1', sev: 'Medium', channels: ['Email'], on: true, fired: 88 },
    { id: 'R5', name: 'Rogue access point', cond: 'wids.rogue_ap == true', sev: 'Critical', channels: ['Email', 'Slack', 'PagerDuty'], on: true, fired: 3 },
    { id: 'R6', name: 'Low battery', cond: 'battery < 15%', sev: 'Medium', channels: ['Email'], on: true, fired: 27 },
    { id: 'R7', name: 'Camera video loss', cond: 'stream.fps == 0 for 60s', sev: 'Critical', channels: ['Teams', 'SMS'], on: true, fired: 9 },
    { id: 'R8', name: 'Packet loss', cond: 'loss > 5% for 10m', sev: 'High', channels: ['Slack'], on: false, fired: 0 },
  ]);
  protected readonly channels = signal([
    { name: 'Email', target: 'noc@people360.io', icon: 'message', color: 'var(--ka-3b82f6)', on: true, sent: 128 },
    { name: 'SMS', target: '+971 50 *** 4410 (on-call)', icon: 'phone', color: 'var(--ka-10b981)', on: true, sent: 14 },
    { name: 'Teams', target: '#it-network-alerts', icon: 'users', color: 'var(--ka-6366f1)', on: true, sent: 76 },
    { name: 'Slack', target: '#noc', icon: 'message', color: 'var(--ka-e11d48)', on: false, sent: 0 },
    { name: 'Webhook', target: 'https://hooks.servicenow.com/p360', icon: 'devices-link', color: 'var(--ka-64748b)', on: true, sent: 52 },
    { name: 'PagerDuty', target: 'Network On-Call', icon: 'bell', color: 'var(--ka-16a34a)', on: true, sent: 6 },
  ]);
  protected readonly rf = signal<Rule | null>(null);

  constructor() {
    const f = this.store.focusId();
    const a = f ? this.store.alerts().find((x) => x.deviceId === f) : null;
    if (a) this.selId.set(a.id);
  }

  protected readonly open = computed(() => this.store.alerts().filter((a) => a.state !== 'Resolved'));
  protected readonly unassigned = computed(() => this.open().filter((a) => a.assignee === 'Unassigned').length);
  protected readonly rows = computed(() => this.store.alerts().map((a) => ({ ...a, when: fmtSeen(a.ago) })));
  protected readonly sel = computed(() => this.store.alerts().find((a) => a.id === this.selId()) ?? null);
  protected readonly trend = computed(() => {
    const base = [[3, 6, 9], [2, 5, 11], [4, 7, 8], [1, 4, 10], [2, 6, 12], [5, 8, 9], [3, 5, 7], [2, 7, 11], [4, 9, 10], [6, 8, 13], [3, 6, 9], [2, 5, 8], [5, 7, 12], [0, 0, 0]];
    const today = this.store.alerts().filter((a) => a.ago < 150);
    base[13] = [today.filter((a) => a.sev === 'Critical').length, today.filter((a) => a.sev === 'High').length, today.filter((a) => a.sev !== 'Critical' && a.sev !== 'High').length];
    return [
      { name: 'Critical', color: 'var(--ka-ef4444)', values: base.map((b) => b[0]) },
      { name: 'High', color: 'var(--ka-f97316)', values: base.map((b) => b[1]) },
      { name: 'Medium / Low', color: 'var(--ka-fbbf24)', values: base.map((b) => b[2]) },
    ];
  });
  protected readonly cats = computed(() => {
    const colors: Record<string, string> = { Connectivity: 'var(--ka-7c3aed)', Hardware: 'var(--ka-3b82f6)', Firmware: 'var(--ka-10b981)', Security: 'var(--ka-ef4444)', Environment: 'var(--ka-f59e0b)', Performance: 'var(--ka-06b6d4)' };
    return Object.entries(colors).map(([label, color]) => ({ label, color, value: this.open().filter((a) => a.category === label).length }));
  });

  protected sevTag(s: string) {
    return s === 'Critical' ? 'tag red' : s === 'High' ? 'tag amber' : s === 'Medium' ? 'tag blue' : 'tag grey';
  }
  protected stTag(s: string) {
    return s === 'Open' ? 'tag red' : s === 'Acknowledged' ? 'tag amber' : 'tag green';
  }
  protected seen(a: DAlert) {
    return fmtSeen(a.ago);
  }
  protected upd(id: string, ch: Partial<DAlert>) {
    this.store.alerts.update((l) => l.map((a) => (a.id === id ? { ...a, ...ch } : a)));
  }
  protected timeline(a: DAlert) {
    const t = [{ t: `Alert raised by rule "${a.title.split(' (')[0]}"`, at: fmtSeen(a.ago), c: 'var(--ka-ef4444)' }, { t: `Notified via Email, Teams`, at: fmtSeen(Math.max(0, a.ago - 1)), c: 'var(--ka-3b82f6)' }];
    if (a.state !== 'Open') t.push({ t: `Acknowledged by ${a.assignee === 'Unassigned' ? 'Rex Kumar' : a.assignee}`, at: fmtSeen(Math.max(0, a.ago - 6)), c: 'var(--ka-f59e0b)' });
    for (const n of this.notes()[a.id] ?? []) t.push({ t: `Note: ${n}`, at: 'just now', c: 'var(--ka-7c3aed)' });
    if (a.state === 'Resolved') t.push({ t: 'Resolved', at: fmtSeen(Math.max(0, a.ago - 40)), c: 'var(--ka-22c55e)' });
    return t;
  }
  protected addNote(a: DAlert) {
    this.notes.update((n) => ({ ...n, [a.id]: [...(n[a.id] ?? []), this.note().trim()] }));
    this.note.set('');
  }
  protected openDev(a: DAlert) {
    this.dev.set(this.store.byId(a.deviceId));
  }
  protected act(x: string, a: DAlert) {
    if (x === 'ack') this.upd(a.id, { state: 'Acknowledged', assignee: a.assignee === 'Unassigned' ? 'Rex Kumar' : a.assignee });
    if (x === 'resolve') this.upd(a.id, { state: 'Resolved' });
    if (x === 'reopen') this.upd(a.id, { state: 'Open' });
    if (x === 'me') this.upd(a.id, { assignee: 'Rex Kumar' });
    if (x === 'device') return this.openDev(a);
    if (x === 'ticket') {
      const d = this.store.byId(a.deviceId);
      if (d) this.store.createTicket(d, a.id);
      return;
    }
    this.store.toastMsg(`${a.id} ${x === 'ack' ? 'acknowledged' : x === 'resolve' ? 'resolved' : x === 'reopen' ? 'reopened' : 'assigned to Rex Kumar'}`);
  }
  protected bulkAct(x: string, ids: string[]) {
    if (x === 'export') return downloadCsv('device-alerts.csv', [['ID', 'Alert', 'Device', 'Site', 'Severity', 'State', 'Assignee'], ...this.store.alerts().filter((a) => ids.includes(a.id)).map((a) => [a.id, a.title, a.device, a.site, a.sev, a.state, a.assignee])]);
    this.store.alerts.update((l) => l.map((a) => (ids.includes(a.id) ? { ...a, state: x === 'ack' ? (a.state === 'Resolved' ? a.state : 'Acknowledged') : 'Resolved' } : a)));
    this.store.toastMsg(`${ids.length} alerts ${x === 'ack' ? 'acknowledged' : 'resolved'}`);
  }
  protected ackAll() {
    const n = this.store.alerts().filter((a) => a.sev === 'Critical' && a.state === 'Open').length;
    this.store.alerts.update((l) => l.map((a) => (a.sev === 'Critical' && a.state === 'Open' ? { ...a, state: 'Acknowledged', assignee: a.assignee === 'Unassigned' ? 'Rex Kumar' : a.assignee } : a)));
    this.store.toastMsg(`${n} critical alerts acknowledged`);
  }
  protected toggleRule(r: Rule) {
    this.rules.update((l) => l.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)));
    this.store.toastMsg(`Rule "${r.name}" ${r.on ? 'disabled' : 'enabled'}`);
  }
  protected testRule(r: Rule) {
    const d = this.store.devices()[4];
    this.store.raiseAlert(d, `[TEST] ${r.name}`, r.sev as DAlert['sev'], 'Performance');
    this.store.toastMsg(`Test alert raised on ${d.name} · sent via ${r.channels.join(', ')}`);
  }
  protected toggleCh(name: string) {
    this.channels.update((l) => l.map((c) => (c.name === name ? { ...c, on: !c.on } : c)));
  }
  protected openRule(r?: Rule) {
    this.rf.set(r ? { ...r } : { id: '', name: '', cond: '', sev: 'High', channels: ['Email'], on: true, fired: 0 });
  }
  protected saveRule() {
    const r = this.rf()!;
    if (!r.name.trim()) return;
    if (r.id) this.rules.update((l) => l.map((x) => (x.id === r.id ? r : x)));
    else this.rules.update((l) => [...l, { ...r, id: 'R' + Date.now() }]);
    this.rf.set(null);
    this.tab.set('Alert Rules');
    this.store.toastMsg(`Rule "${r.name}" saved`);
  }
}

/* =====================================================================
   Device Replacement (RMA wizard)
   ===================================================================== */
const STEPS = ['Select Device', 'Diagnose', 'Replacement', 'Migrate Config', 'Review'];
interface Wiz { step: number; deviceId: string | null; reason: string; notes: string; diag: Record<string, 'idle' | 'running' | 'pass' | 'fail'>; source: 'spare' | 'advance'; spare: string; migrate: { config: boolean; name: boolean; ip: boolean; location: boolean; notify: boolean }; q: string }
@Component({
  selector: 'app-devices-device-replacement',
  imports: [...UI, DevArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Device Replacement" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="RMA cases, spare stock and guided device swap with configuration migration.">
      <button class="btn-primary" (click)="start()"><app-icon name="plus" [size]="16" />New Replacement</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="devices-export" [size]="16" />Export RMAs</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Open RMAs" [value]="openRmas()" icon="refresh" color="var(--ka-7c3aed)" [sub]="store.rmas().length + ' total this quarter'" />
      <app-kpi label="Replacement Candidates" [value]="candidates().length" icon="triangle-alert" color="var(--ka-ef4444)" sub="offline or health < 40" subColor="var(--ka-dc2626)" />
      <app-kpi label="Avg Turnaround" value="3.2 days" icon="clock" color="var(--ka-3b82f6)" change="0.6 d" [up]="false" sub="vs. last quarter" />
      <app-kpi label="Spares in Stock" [value]="spareTotal()" icon="box" color="var(--ka-10b981)" [sub]="lowSpares() + ' models low'" />
      <app-kpi label="Under Warranty" value="86%" icon="shield-check" color="var(--ka-f97316)" sub="of active fleet" />
    </section>

    @if (wiz(); as w) {
      <section class="card wiz">
        <div class="card-head"><h3>New Replacement</h3><button class="close-btn" (click)="wiz.set(null)">×</button></div>
        <ol class="steps">@for (s of steps; track s; let i = $index) {<li [class.ok]="w.step > i" [class.cur]="w.step === i" (click)="i < w.step && go(i)"><i>{{ w.step > i ? '✓' : i + 1 }}</i>{{ s }}</li>}</ol>
        <div class="body">
          @switch (w.step) {
            @case (0) {
              <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search device name or serial..." [value]="w.q" (input)="patch({ q: $any($event.target).value })" /></label>
              <p class="muted sm">Suggested: offline devices and devices with low health score</p>
              <div class="pick">
                @for (d of pickList(); track d.id) {
                  <button [class.on]="w.deviceId === d.id" (click)="patch({ deviceId: d.id })"><span class="ti" [style.background]="meta(d.type).color"><app-icon [name]="meta(d.type).icon" [size]="15" /></span><div><b>{{ d.name }}</b><small>{{ d.model }} · {{ d.site }} · {{ d.location }}</small></div><span [class]="'tag ' + cls(d.status)">{{ d.status }}</span><em [class.bad]="d.health < 50">{{ d.health }}</em></button>
                }
              </div>
            }
            @case (1) {
              <div class="two">
                <div class="form-grid one">
                  <label>Reason for replacement<select class="select" [value]="w.reason" (change)="patch({ reason: $any($event.target).value })">@for (r of reasons; track r) {<option [value]="r">{{ r }}</option>}</select></label>
                  <label>Notes<textarea class="input" rows="4" [value]="w.notes" (input)="patch({ notes: $any($event.target).value })" placeholder="Symptoms, photos taken, site contact..."></textarea></label>
                </div>
                <div>
                  <div class="dg-h"><b>Remote diagnostics</b><button class="btn-ghost sm" (click)="runDiag()">Run all</button></div>
                  <ul class="dg">@for (k of diagKeys; track k) {<li><span>{{ k }}</span><span [class]="'dgs ' + w.diag[k]">{{ w.diag[k] === 'idle' ? 'Not run' : w.diag[k] === 'running' ? 'Running…' : w.diag[k] === 'pass' ? 'Pass' : 'Fail' }}</span></li>}</ul>
                </div>
              </div>
            }
            @case (2) {
              <div class="src">
                <label [class.on]="w.source === 'spare'"><input type="radio" name="src" [checked]="w.source === 'spare'" (change)="patch({ source: 'spare' })" /><div><b>Use on-site spare</b><small>Swap today from local stock</small></div></label>
                <label [class.on]="w.source === 'advance'"><input type="radio" name="src" [checked]="w.source === 'advance'" (change)="patch({ source: 'advance' })" /><div><b>Advance replacement from vendor</b><small>{{ dev()?.vendor }} · next-business-day shipping</small></div></label>
              </div>
              @if (w.source === 'spare') {
                <table class="table">
                  <thead><tr><th></th><th>Model</th><th>Type</th><th>Stock location</th><th class="num">Qty</th></tr></thead>
                  <tbody>@for (s of spareFor(); track s.model + s.site) {<tr class="clickable" (click)="patch({ spare: s.model + '|' + s.site })"><td><input type="radio" [checked]="w.spare === s.model + '|' + s.site" [disabled]="!s.qty" /></td><td><b>{{ s.model }}</b>@if (s.model === dev()?.model) {<span class="tag green">exact match</span>}</td><td>{{ s.type }}</td><td>{{ s.site }}</td><td class="num" [class.bad]="s.qty < 2">{{ s.qty }}</td></tr>} @empty {<tr><td colspan="5" class="muted">No spares for this type — choose advance replacement.</td></tr>}</tbody>
                </table>
              }
            }
            @case (3) {
              <ul class="mig">
                @for (m of migKeys; track m[0]) {<li><label class="sw"><input type="checkbox" [checked]="w.migrate[m[0]]" (change)="toggleMig(m[0])" /><i></i></label><div><b>{{ m[1] }}</b><small>{{ m[2] }}</small></div></li>}
              </ul>
            }
            @case (4) {
              @if (dev(); as d) {
                <div class="rev">
                  <div class="rc"><app-dev-art [type]="d.type" [size]="90" /><b>{{ d.name }}</b><small>{{ d.model }} · {{ d.serial }}</small><span class="tag red">Outgoing</span></div>
                  <div class="arrow">→</div>
                  <div class="rc"><app-dev-art [type]="d.type" [size]="90" /><b>{{ w.migrate.name ? d.name : d.name + '-R' }}</b><small>{{ w.source === 'spare' ? w.spare.split('|')[0] + ' from ' + w.spare.split('|')[1] + ' stock' : d.model + ' (vendor advance)' }}</small><span class="tag green">Incoming</span></div>
                  <dl><dt>Reason</dt><dd>{{ w.reason }}</dd><dt>Diagnostics</dt><dd>{{ diagSummary() }}</dd><dt>Migrate</dt><dd>{{ migSummary() }}</dd><dt>Approver</dt><dd>IT Asset Manager</dd></dl>
                </div>
              }
            }
          }
        </div>
        <div class="form-actions">
          <button class="btn-ghost" [disabled]="w.step === 0" (click)="go(w.step - 1)">Back</button>
          @if (w.step < 4) {<button class="btn-primary" [disabled]="!canNext()" (click)="go(w.step + 1)">Next: {{ steps[w.step + 1] }}</button>}
          @else {<button class="btn-primary" (click)="submit()">Submit RMA</button>}
        </div>
      </section>
    }

    <section class="g2">
      <div class="card">
        <div class="card-head"><h3>RMA Cases</h3><div class="tabs">@for (f of ['Open', 'Closed', 'All']; track f) {<button [class.on]="rf() === f" (click)="rf.set(f)">{{ f }}</button>}</div></div>
        <table class="table">
          <thead><tr><th>RMA</th><th>Device</th><th>Reason</th><th>Replacement</th><th>Opened</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (r of rmaRows(); track r.id) {
              <tr><td><b>{{ r.id }}</b><br /><small class="muted">{{ r.vendorRef }}</small></td><td>{{ r.device }}<br /><small class="muted">{{ r.type }} · {{ r.site }}</small></td><td>{{ r.reason }}</td><td>{{ r.replacement }}</td><td>{{ r.opened }}</td>
                <td><div class="pipe">@for (s of pipe; track s; let i = $index) {<i [class.ok]="pipe.indexOf(r.status) >= i" [title]="s"></i>}</div><span [class]="r.status === 'Closed' ? 'tag grey' : r.status === 'Installed' ? 'tag green' : 'tag blue'">{{ r.status }}</span></td>
                <td>@if (r.status !== 'Closed') {<button class="link" (click)="advance(r)">{{ nextLabel(r) }}</button>}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Spare Stock</h3></div>
        <table class="table">
          <thead><tr><th>Model</th><th>Site</th><th class="num">Qty</th><th></th></tr></thead>
          <tbody>@for (s of store.spares(); track s.model + s.site) {<tr><td><b>{{ s.model }}</b><br /><small class="muted">{{ s.type }}</small></td><td>{{ s.site }}</td><td class="num" [class.bad]="s.qty < 2">{{ s.qty }}</td><td><button class="link" (click)="reorder(s.model, s.site)">Reorder</button></td></tr>}</tbody>
        </table>
      </div>
    </section>
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } .sm { font-size: 12px; }
    .wiz { margin-bottom: 12px; border-color: var(--kl-c4b5fd); }
    .steps { list-style: none; display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 0; margin: 0 0 14px; }
    .steps li { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--muted); padding: 8px 10px; border-radius: 8px; background: var(--kb-f7f7fb); } .steps li.ok { color: var(--kf-15803d); cursor: pointer; } .steps li.cur { color: var(--primary); background: var(--primary-soft); font-weight: 600; }
    .steps i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; background: var(--kb-ffffff); border: 1.5px solid currentColor; font-size: 11px; flex-shrink: 0; }
    .body { min-height: 220px; } .search-box { width: 360px; } .search-box input { width: 100%; }
    .pick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-height: 300px; overflow: auto; }
    .pick button { display: grid; grid-template-columns: 30px 1fr auto 28px; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; text-align: left; font: inherit; }
    .pick button.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .pick div { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; } .pick small { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pick em { font-style: normal; font-weight: 700; font-size: 12px; text-align: right; }
    .ti { width: 30px; height: 30px; border-radius: 7px; color: var(--kf-ffffff); display: grid; place-items: center; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; } .one { grid-template-columns: 1fr; }
    .dg-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } .dg { list-style: none; padding: 0; margin: 0; } .dg li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .dgs { font-weight: 600; } .dgs.idle { color: var(--muted); font-weight: 400; } .dgs.running { color: var(--kf-2563eb); } .dgs.pass { color: var(--kf-16a34a); } .dgs.fail { color: var(--kf-dc2626); }
    .src { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; } .src label { display: flex; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; } .src label.on { border-color: var(--primary); background: var(--kb-faf8ff); }
    .src div { display: flex; flex-direction: column; font-size: 13px; } .src small { color: var(--muted); font-size: 11.5px; }
    .mig { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .mig li { display: flex; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; } .mig div { display: flex; flex-direction: column; font-size: 13px; } .mig small { color: var(--muted); font-size: 11.5px; }
    .sw { position: relative; display: inline-block; width: 34px; height: 19px; flex-shrink: 0; } .sw input { opacity: 0; width: 0; height: 0; } .sw i { position: absolute; inset: 0; background: var(--kb-d4d7e3); border-radius: 12px; cursor: pointer; transition: .2s; }
    .sw i::before { content: ''; position: absolute; width: 15px; height: 15px; left: 2px; top: 2px; background: var(--kb-ffffff); border-radius: 50%; transition: .2s; } .sw input:checked + i { background: var(--primary); } .sw input:checked + i::before { transform: translateX(15px); }
    .rev { display: grid; grid-template-columns: 180px 40px 180px 1fr; gap: 16px; align-items: center; } .rc { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; text-align: center; } .rc small { color: var(--muted); font-size: 11px; }
    .arrow { font-size: 28px; color: var(--primary); text-align: center; } .rev dl { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 12.5px; margin: 0; } .rev dt { color: var(--muted); } .rev dd { margin: 0; }
    .g2 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; align-items: start; } .g2 > .card { min-width: 0; overflow-x: auto; } .g2 .table td, .g2 .table th { padding: 8px 7px; }
    .pipe { display: flex; gap: 3px; margin-bottom: 4px; } .pipe i { width: 16px; height: 4px; border-radius: 2px; background: var(--kb-e4e6ef); } .pipe i.ok { background: var(--primary); }
    @media (max-width: 1250px) { .g2, .two { grid-template-columns: 1fr; } .pick { grid-template-columns: 1fr; } .rev { grid-template-columns: 1fr; } }
  `,
})
export class DeviceReplacement {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  protected readonly steps = STEPS;
  protected readonly reasons = RMA_REASONS;
  protected readonly cls = statusCls;
  protected readonly pipe: Rma['status'][] = ['Requested', 'Approved', 'Shipped', 'Installed', 'Closed'];
  protected readonly diagKeys = ['Ping / reachability', 'Power-over-Ethernet draw', 'Interface error counters', 'Self-test (POST)', 'Storage / flash health'];
  protected readonly migKeys: [keyof Wiz['migrate'], string, string][] = [
    ['config', 'Copy configuration profile', 'Apply the same profile and local overrides'],
    ['name', 'Keep device name', 'New unit takes over the hostname'],
    ['ip', 'Keep IP reservation', 'Move DHCP reservation to the new MAC'],
    ['location', 'Keep site & location', 'Map pin, department and owner carry over'],
    ['notify', 'Notify owner', 'Email the owning team when the swap completes'],
  ];
  protected readonly wiz = signal<Wiz | null>(null);
  protected readonly rf = signal('Open');

  constructor() {
    const f = this.store.focusId();
    if (f) {
      this.start(f);
      this.store.focusId.set(null);
    }
  }

  protected readonly dev = computed(() => this.store.byId(this.wiz()?.deviceId ?? null));
  protected readonly candidates = computed(() => this.store.devices().filter((d) => d.status === 'Offline' || (d.status !== 'Inactive' && d.health < 40)));
  protected readonly pickList = computed(() => {
    const q = (this.wiz()?.q ?? '').toLowerCase();
    const sel = this.dev();
    const base = q ? this.store.devices().filter((d) => d.status !== 'Inactive' && (d.name.toLowerCase().includes(q) || d.serial.toLowerCase().includes(q))) : this.candidates();
    const l = base.slice(0, 12);
    return sel && !l.includes(sel) ? [sel, ...l.slice(0, 11)] : l;
  });
  protected readonly spareFor = computed(() => this.store.spares().filter((s) => s.type === this.dev()?.type));
  protected readonly openRmas = computed(() => this.store.rmas().filter((r) => r.status !== 'Closed').length);
  protected readonly spareTotal = computed(() => this.store.spares().reduce((a, s) => a + s.qty, 0));
  protected readonly lowSpares = computed(() => this.store.spares().filter((s) => s.qty < 2).length);
  protected readonly rmaRows = computed(() => this.store.rmas().filter((r) => this.rf() === 'All' || (this.rf() === 'Closed') === (r.status === 'Closed')));
  protected readonly canNext = computed(() => {
    const w = this.wiz();
    if (!w) return false;
    if (w.step === 0) return !!w.deviceId;
    if (w.step === 2) return w.source === 'advance' || !!w.spare;
    return true;
  });
  protected readonly diagSummary = computed(() => {
    const v = Object.values(this.wiz()?.diag ?? {});
    return v.every((x) => x === 'idle') ? 'Not run' : `${v.filter((x) => x === 'pass').length} pass · ${v.filter((x) => x === 'fail').length} fail`;
  });
  protected readonly migSummary = computed(() => {
    const m = this.wiz()?.migrate;
    return m ? this.migKeys.filter((k) => m[k[0]]).map((k) => k[1].replace(/^(Copy|Keep|Notify) /, '')).join(', ') || 'Nothing' : '';
  });

  protected meta(t: DType) {
    return TYPE_META[t];
  }
  protected start(id: string | null = null) {
    const d = this.store.byId(id);
    this.wiz.set({ step: d ? 1 : 0, deviceId: id, reason: RMA_REASONS[0], notes: '', diag: Object.fromEntries(this.diagKeys.map((k) => [k, 'idle'])), source: 'spare', spare: '', migrate: { config: true, name: true, ip: true, location: true, notify: true }, q: '' });
  }
  protected patch(ch: Partial<Wiz>) {
    this.wiz.update((w) => (w ? { ...w, ...ch } : w));
  }
  protected go(step: number) {
    const w = this.wiz()!;
    if (step === 2 && !w.spare) {
      const s = this.spareFor().find((x) => x.qty && x.model === this.dev()?.model) ?? this.spareFor().find((x) => x.qty);
      this.patch({ step, spare: s ? s.model + '|' + s.site : '', source: s ? w.source : 'advance' });
      return;
    }
    this.patch({ step });
  }
  protected toggleMig(k: keyof Wiz['migrate']) {
    this.wiz.update((w) => (w ? { ...w, migrate: { ...w.migrate, [k]: !w.migrate[k] } } : w));
  }
  protected runDiag() {
    const d = this.dev();
    const off = d?.status === 'Offline';
    this.diagKeys.forEach((k, i) => {
      setTimeout(() => this.wiz.update((w) => (w ? { ...w, diag: { ...w.diag, [k]: 'running' } } : w)), i * 350);
      setTimeout(() => this.wiz.update((w) => (w ? { ...w, diag: { ...w.diag, [k]: off && i < 3 ? 'fail' : i === 3 && (d?.health ?? 100) < 50 ? 'fail' : 'pass' } } : w)), i * 350 + 700);
    });
  }
  protected submit() {
    const w = this.wiz()!;
    const d = this.dev()!;
    const [model, site] = w.spare.split('|');
    const id = `RMA-${1043 + this.store.rmas().length - 5}`;
    this.store.rmas.update((l) => [{ id, deviceId: d.id, device: d.name, type: d.type, model: d.model, reason: w.reason, replacement: w.source === 'spare' ? `${model} (spare, ${site})` : `${d.model} (advance)`, status: w.source === 'spare' ? 'Approved' : 'Requested', opened: '14 Oct 2026', vendorRef: w.source === 'spare' ? 'internal' : 'pending', migrate: w.migrate.config, site: d.site }, ...l]);
    if (w.source === 'spare') this.store.spares.update((l) => l.map((s) => (s.model === model && s.site === site ? { ...s, qty: s.qty - 1 } : s)));
    this.store.patch(d.id, { status: 'Maintenance' });
    this.wiz.set(null);
    this.rf.set('Open');
    this.store.toastMsg(`${id} submitted for ${d.name} · device set to maintenance`);
  }
  protected nextLabel(r: Rma) {
    return { Requested: 'Approve', Approved: 'Mark shipped', Shipped: 'Mark installed', Installed: 'Close', Closed: '' }[r.status];
  }
  protected advance(r: Rma) {
    const next = this.pipe[this.pipe.indexOf(r.status) + 1];
    this.store.rmas.update((l) => l.map((x) => (x.id === r.id ? { ...x, status: next, vendorRef: x.vendorRef === 'pending' ? 'EX-' + (55200 + l.length) : x.vendorRef } : x)));
    if (next === 'Installed') {
      const d = this.store.byId(r.deviceId);
      if (d && d.name === r.device) {
        this.store.patch(d.id, { status: 'Online', serial: 'SN' + (700000000 + Math.floor(Math.random() * 99999999)), health: 98, seenAgo: 0, firmware: TYPE_META[d.type].latest, fwUpdated: '14 Oct 2026', uptimeH: 0 });
        this.store.alerts.update((l) => l.map((a) => (a.deviceId === d.id ? { ...a, state: 'Resolved' } : a)));
      }
    }
    this.store.toastMsg(`${r.id} → ${next}${next === 'Installed' ? ' · config migrated, device back online' : ''}`);
  }
  protected reorder(model: string, site: string) {
    this.store.spares.update((l) => l.map((s) => (s.model === model && s.site === site ? { ...s, qty: s.qty + 5 } : s)));
    this.store.toastMsg(`PO raised for 5 × ${model} to ${site}`);
  }
  protected exportCsv() {
    downloadCsv('rma-cases.csv', [['RMA', 'Device', 'Type', 'Reason', 'Replacement', 'Status', 'Opened', 'Vendor Ref'], ...this.store.rmas().map((r) => [r.id, r.device, r.type, r.reason, r.replacement, r.status, r.opened, r.vendorRef])]);
  }
}

/* =====================================================================
   Settings & Integration
   ===================================================================== */
interface Integ { name: string; desc: string; icon: string; color: string; on: boolean; last: string; cat: string }
@Component({
  selector: 'app-devices-settings-integration',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Settings & Integration" parent="Device &amp; Edge Management" [parentLink]="P" subtitle="Monitoring thresholds, discovery, vendor controllers and API access for device management.">
      @if (dirty()) {<span class="unsaved">Unsaved changes</span>}
      <button class="btn-ghost" [disabled]="!dirty()" (click)="reset()">Discard</button>
      <button class="btn-primary" [disabled]="!dirty()" (click)="save()"><app-icon name="devices-check" [size]="16" />Save Settings</button>
    </app-page-head>

    <nav class="tabs main-tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</nav>

    @switch (tab()) {
      @case ('General') {
        <section class="card">
          <h3>Monitoring &amp; Thresholds</h3>
          <div class="form-grid three">
            @for (f of generalFields; track f[0]) {
              <label>{{ f[1] }}<div class="unit"><input class="input" type="number" [value]="s()[f[0]]" (input)="set(f[0], $any($event.target).value)" /><span>{{ f[2] }}</span></div></label>
            }
          </div>
          <h3 class="mt">Behaviour</h3>
          <ul class="tg">
            @for (t of toggles; track t[0]) {<li><div><b>{{ t[1] }}</b><small>{{ t[2] }}</small></div><label class="sw"><input type="checkbox" [checked]="s()[t[0]] === 'on'" (change)="set(t[0], s()[t[0]] === 'on' ? 'off' : 'on')" /><i></i></label></li>}
          </ul>
        </section>
      }
      @case ('Discovery') {
        <section class="card">
          <div class="card-head"><h3>Auto-Discovery</h3><button class="btn-ghost" (click)="scan()"><app-icon name="search" [size]="15" />Run discovery now</button></div>
          <ul class="tg">
            @for (p of protocols; track p[0]) {<li><div><b>{{ p[1] }}</b><small>{{ p[2] }}</small></div><label class="sw"><input type="checkbox" [checked]="s()[p[0]] === 'on'" (change)="set(p[0], s()[p[0]] === 'on' ? 'off' : 'on')" /><i></i></label></li>}
          </ul>
          <div class="form-grid mt">
            <label class="full">Subnets to scan<input class="input" [value]="s()['subnets']" (input)="set('subnets', $any($event.target).value)" /></label>
            <label>Schedule<select class="select" [value]="s()['schedule']" (change)="set('schedule', $any($event.target).value)"><option>Every 6 hours</option><option>Daily at 02:00</option><option>Weekly</option><option>Manual only</option></select></label>
            <label>New devices<select class="select" [value]="s()['newDev']" (change)="set('newDev', $any($event.target).value)"><option>Hold for approval</option><option>Auto-onboard with default profile</option></select></label>
          </div>
          @if (scanLog().length) {<pre class="con">{{ scanLog().join('\n') }}</pre>}
        </section>
      }
      @case ('Integrations') {
        <div class="ifl"><div class="tabs">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div></div>
        <section class="ints">
          @for (i of ints(); track i.name) {
            <div class="card it">
              <div class="ih"><span class="ii" [style.background]="i.color"><app-icon [name]="i.icon" [size]="20" /></span><div><b>{{ i.name }}</b><small>{{ i.cat }}</small></div><span [class]="i.on ? 'tag green' : 'tag grey'">{{ i.on ? 'Connected' : 'Not connected' }}</span></div>
              <p>{{ i.desc }}</p>
              <div class="if"><small class="muted">{{ i.on ? 'Last sync ' + i.last : '' }}</small>
                <div class="toolbar">
                  @if (i.on) {<button class="btn-ghost sm" (click)="test(i)">Test</button><button class="btn-ghost sm" (click)="cfg.set(i)">Configure</button><button class="btn-ghost sm danger" (click)="toggleInt(i)">Disconnect</button>}
                  @else {<button class="btn-primary btn-sm" (click)="cfg.set(i)">Connect</button>}
                </div>
              </div>
            </div>
          }
        </section>
      }
      @case ('API & Webhooks') {
        <section class="g2">
          <div class="card">
            <div class="card-head"><h3>API Keys</h3><button class="btn-primary btn-sm" (click)="newKey()">Generate key</button></div>
            <table class="table">
              <thead><tr><th>Name</th><th>Key</th><th>Scope</th><th>Created</th><th></th></tr></thead>
              <tbody>@for (k of keys(); track k.key) {<tr><td><b>{{ k.name }}</b></td><td><code>{{ k.key }}</code></td><td>{{ k.scope }}</td><td>{{ k.created }}</td><td><button class="link danger" (click)="revoke(k.key)">Revoke</button></td></tr>}</tbody>
            </table>
          </div>
          <div class="card">
            <div class="card-head"><h3>Webhooks</h3><button class="btn-ghost sm" (click)="addHook()">Add webhook</button></div>
            <ul class="hooks">@for (h of hooks(); track h.url) {<li><div><b>{{ h.url }}</b><small>{{ h.events }}</small></div><span [class]="h.ok ? 'tag green' : 'tag red'">{{ h.ok ? '200 OK' : '503' }}</span><button class="link" (click)="store.toastMsg('Test event delivered to ' + h.url)">Send test</button></li>}</ul>
          </div>
        </section>
      }
      @case ('Data Retention') {
        <section class="card">
          <h3>Data Retention</h3>
          <div class="form-grid three">
            @for (r of retention; track r[0]) {<label>{{ r[1] }}<select class="select" [value]="s()[r[0]]" (change)="set(r[0], $any($event.target).value)">@for (o of r[2]; track o) {<option [value]="o">{{ o }}</option>}</select></label>}
          </div>
          <p class="muted mt">Estimated storage: <b>{{ storage() }} GB</b> · retention applies to all sites.</p>
        </section>
      }
    }

    @if (cfg(); as i) {
      <div class="g-overlay" (click)="cfg.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); connect(i)">
        <div class="modal-head"><h3>{{ i.on ? 'Configure' : 'Connect' }} {{ i.name }}</h3><button type="button" class="close-btn" (click)="cfg.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Endpoint URL<input class="input" [value]="'https://' + i.name.toLowerCase().replace(' ', '-') + '.example.com/api'" /></label>
          <label>Client ID<input class="input" value="p360-device-mgmt" /></label>
          <label>Client secret<input class="input" type="password" value="••••••••••••" /></label>
          <label>Sync interval<select class="select"><option>5 minutes</option><option>15 minutes</option><option>Hourly</option></select></label>
          <label>Direction<select class="select"><option>Bi-directional</option><option>Import only</option><option>Export only</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cfg.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ i.on ? 'Save' : 'Connect' }}</button></div>
      </form>
    }
    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0 0 12px; font-size: 15px; } .card-head h3 { margin: 0; } .mt { margin-top: 18px; } .danger { color: var(--red) !important; }
    .main-tabs { margin-bottom: 12px; } .unsaved { align-self: center; font-size: 12px; color: var(--kf-c2410c); font-weight: 600; }
    .three { grid-template-columns: repeat(3, 1fr); } .unit { display: flex; align-items: center; gap: 6px; } .unit .input { flex: 1; } .unit span { font-size: 12px; color: var(--muted); min-width: 40px; }
    .tg { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; } .tg li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .tg div { display: flex; flex-direction: column; font-size: 13px; } .tg small { color: var(--muted); font-size: 11.5px; }
    .sw { position: relative; display: inline-block; width: 34px; height: 19px; flex-shrink: 0; } .sw input { opacity: 0; width: 0; height: 0; } .sw i { position: absolute; inset: 0; background: var(--kb-d4d7e3); border-radius: 12px; cursor: pointer; transition: .2s; }
    .sw i::before { content: ''; position: absolute; width: 15px; height: 15px; left: 2px; top: 2px; background: var(--kb-ffffff); border-radius: 50%; transition: .2s; } .sw input:checked + i { background: var(--primary); } .sw input:checked + i::before { transform: translateX(15px); }
    .con { background: var(--kb-0f172a); color: var(--kf-a7f3d0); font-size: 11.5px; padding: 10px; border-radius: 8px; margin: 12px 0 0; white-space: pre-wrap; }
    .ifl { margin-bottom: 12px; } .ints { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .ih { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; } .ih div { display: flex; flex-direction: column; font-size: 13.5px; } .ih small { color: var(--muted); font-size: 11.5px; }
    .ii { width: 40px; height: 40px; border-radius: 10px; color: var(--kf-ffffff); display: grid; place-items: center; } .it p { font-size: 12.5px; color: var(--kf-4b4f6b); margin: 10px 0; min-height: 34px; } .if { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .g2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; } code { font-size: 11.5px; background: var(--kb-f5f3ff); padding: 2px 6px; border-radius: 4px; color: var(--kf-5b21b6); }
    .hooks { list-style: none; padding: 0; margin: 0; } .hooks li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .hooks div { display: flex; flex-direction: column; min-width: 0; } .hooks b { overflow: hidden; text-overflow: ellipsis; } .hooks small { color: var(--muted); font-size: 11px; }
    @media (max-width: 1250px) { .ints, .three { grid-template-columns: 1fr 1fr; } .g2, .tg { grid-template-columns: 1fr; } }
  `,
})
export class DevSettingsIntegration {
  protected readonly P = P;
  protected readonly store = inject(DeviceStore);
  protected readonly tabs = ['General', 'Discovery', 'Integrations', 'API & Webhooks', 'Data Retention'];
  protected readonly tab = signal('General');
  private readonly DEFAULTS: Record<string, string> = {
    poll: '60', offline: '15', cpu: '90', temp: '60', battery: '15', loss: '5',
    autoMaint: 'on', suppress: 'on', autoTicket: 'off', geo: 'on',
    snmp: 'on', lldp: 'on', onvif: 'on', mqtt: 'on', mdns: 'off', dhcp: 'on',
    subnets: '10.10.0.0/16, 10.11.0.0/16, 10.12.0.0/16, 10.13.0.0/16', schedule: 'Every 6 hours', newDev: 'Hold for approval',
    metrics: '90 days', events: '1 year', configs: '20 versions', logs: '30 days', video: '30 days', audit: '7 years',
  };
  protected readonly saved = signal({ ...this.DEFAULTS });
  protected readonly s = signal({ ...this.DEFAULTS });
  protected readonly dirty = computed(() => Object.keys(this.s()).some((k) => this.s()[k] !== this.saved()[k]));
  protected readonly generalFields: [string, string, string][] = [
    ['poll', 'Polling interval', 'sec'], ['offline', 'Mark offline after', 'min'], ['cpu', 'CPU alert threshold', '%'], ['temp', 'Temperature alert', '°C'], ['battery', 'Low battery alert', '%'], ['loss', 'Packet loss alert', '%'],
  ];
  protected readonly toggles: [string, string, string][] = [
    ['autoMaint', 'Suppress alerts in maintenance', 'Devices in maintenance mode do not raise alerts'], ['suppress', 'Correlate child alerts', 'Hide downstream alerts when a gateway/switch is offline'],
    ['autoTicket', 'Auto-create tickets', 'Open a ServiceNow incident for every critical alert'], ['geo', 'Show devices on site maps', 'Plot device pins on floor plans and Digital Twin'],
  ];
  protected readonly protocols: [string, string, string][] = [
    ['snmp', 'SNMP v3', 'Switches, APs, UPS and printers'], ['lldp', 'LLDP / CDP', 'Neighbour discovery for topology'], ['onvif', 'ONVIF', 'IP cameras and NVRs'], ['mqtt', 'MQTT', 'IoT sensors via edge gateways'], ['mdns', 'mDNS / Bonjour', 'Displays, AV and room devices'], ['dhcp', 'DHCP fingerprinting', 'Identify unknown endpoints'],
  ];
  protected readonly retention: [string, string, string[]][] = [
    ['metrics', 'Device metrics', ['30 days', '90 days', '1 year']], ['events', 'Device events', ['90 days', '1 year', '3 years']], ['configs', 'Config backups', ['5 versions', '20 versions', 'Unlimited']],
    ['logs', 'Syslog', ['7 days', '30 days', '90 days']], ['video', 'Camera metadata', ['7 days', '30 days', '90 days']], ['audit', 'Audit trail', ['1 year', '7 years']],
  ];
  protected readonly cats = ['All', 'Vendor Controller', 'ITSM', 'SIEM', 'IoT Cloud'];
  protected readonly cat = signal('All');
  protected readonly integrations = signal<Integ[]>([
    { name: 'ExtremeCloud IQ', desc: 'Import APs & switches, push configs and firmware from the Extreme controller.', icon: 'devices-ap', color: 'var(--ka-7c3aed)', on: true, last: '2 min ago', cat: 'Vendor Controller' },
    { name: 'Milesight DeviceHub', desc: 'Sync cameras, IoT sensors and LoRaWAN gateways.', icon: 'devices-camera', color: 'var(--ka-f97316)', on: true, last: '5 min ago', cat: 'Vendor Controller' },
    { name: 'Cisco Meraki', desc: 'Read-only import of Meraki networks for mixed estates.', icon: 'devices-switch', color: 'var(--ka-10b981)', on: false, last: '', cat: 'Vendor Controller' },
    { name: 'ServiceNow', desc: 'Create incidents & sync CMDB configuration items.', icon: 'devices-ticket', color: 'var(--ka-16a34a)', on: true, last: '1 min ago', cat: 'ITSM' },
    { name: 'Jira Service Management', desc: 'Route device tickets to Jira queues.', icon: 'list-checks', color: 'var(--ka-2563eb)', on: false, last: '', cat: 'ITSM' },
    { name: 'Splunk', desc: 'Stream device events and syslog to Splunk HEC.', icon: 'chart-line', color: 'var(--ka-111827)', on: true, last: 'live', cat: 'SIEM' },
    { name: 'Microsoft Sentinel', desc: 'Forward security alerts (rogue AP, config tamper).', icon: 'shield', color: 'var(--ka-0ea5e9)', on: false, last: '', cat: 'SIEM' },
    { name: 'AWS IoT Core', desc: 'Bridge edge gateway telemetry to AWS IoT.', icon: 'devices-cloud', color: 'var(--ka-f59e0b)', on: true, last: '12 s ago', cat: 'IoT Cloud' },
    { name: 'Azure IoT Hub', desc: 'Device twins and telemetry routing to Azure.', icon: 'devices-cloud', color: 'var(--ka-3b82f6)', on: false, last: '', cat: 'IoT Cloud' },
  ]);
  protected readonly ints = computed(() => this.integrations().filter((i) => this.cat() === 'All' || i.cat === this.cat()));
  protected readonly cfg = signal<Integ | null>(null);
  protected readonly keys = signal([
    { name: 'Digital Twin sync', key: 'p360_live_••••9f2a', scope: 'devices:read', created: '02 Jun 2026' },
    { name: 'NOC dashboard', key: 'p360_live_••••41c7', scope: 'devices:read alerts:read', created: '18 Aug 2026' },
    { name: 'Provisioning script', key: 'p360_live_••••b803', scope: 'devices:write', created: '30 Sep 2026' },
  ]);
  protected readonly hooks = signal([
    { url: 'https://hooks.servicenow.com/p360/devices', events: 'device.offline, alert.critical', ok: true },
    { url: 'https://ops.people360.io/webhooks/firmware', events: 'firmware.completed, firmware.failed', ok: true },
    { url: 'https://legacy-bms.local/notify', events: 'sensor.threshold', ok: false },
  ]);
  protected readonly scanLog = signal<string[]>([]);
  protected readonly storage = computed(() => {
    const m: Record<string, number> = { '30 days': 1, '90 days': 3, '1 year': 12, '7 days': 0.25, '3 years': 36 };
    return Math.round((m[this.s()['metrics']] ?? 3) * 42 + (m[this.s()['events']] ?? 12) * 6 + (m[this.s()['logs']] ?? 1) * 18);
  });

  protected set(k: string, v: string) {
    this.s.update((x) => ({ ...x, [k]: v }));
  }
  protected save() {
    this.saved.set({ ...this.s() });
    this.store.toastMsg('Device management settings saved');
  }
  protected reset() {
    this.s.set({ ...this.saved() });
  }
  protected scan() {
    const lines = [`Scanning ${this.s()['subnets']}`];
    this.scanLog.set(lines);
    const steps = ['SNMP: 268 switches, 412 APs responded', 'ONVIF: 198 cameras found', 'MQTT: 142 sensors via 12 gateways', 'LLDP: topology refreshed (614 links)', 'Done · 2 new unknown endpoints held for approval'];
    steps.forEach((l, i) => setTimeout(() => this.scanLog.update((x) => [...x, l]), (i + 1) * 500));
  }
  protected toggleInt(i: Integ) {
    this.integrations.update((l) => l.map((x) => (x.name === i.name ? { ...x, on: !x.on, last: 'just now' } : x)));
    this.store.toastMsg(`${i.name} ${i.on ? 'disconnected' : 'connected'}`);
  }
  protected connect(i: Integ) {
    if (!i.on) this.toggleInt(i);
    else this.store.toastMsg(`${i.name} settings saved`);
    this.cfg.set(null);
  }
  protected test(i: Integ) {
    this.store.toastMsg(`Testing ${i.name}...`);
    setTimeout(() => this.store.toastMsg(`${i.name}: connection OK · 184 ms`), 1200);
  }
  protected newKey() {
    const k = `p360_live_••••${Math.random().toString(16).slice(2, 6)}`;
    this.keys.update((l) => [...l, { name: 'New key', key: k, scope: 'devices:read', created: '14 Oct 2026' }]);
    this.store.toastMsg('API key generated · copy it now, it will not be shown again');
  }
  protected revoke(key: string) {
    this.keys.update((l) => l.filter((k) => k.key !== key));
    this.store.toastMsg('API key revoked');
  }
  protected addHook() {
    this.hooks.update((l) => [...l, { url: 'https://example.com/webhooks/devices', events: 'device.*', ok: true }]);
    this.store.toastMsg('Webhook added · signing secret generated');
  }
}
