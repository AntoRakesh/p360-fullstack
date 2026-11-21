import { DecimalPipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { IntBadge, IntLogo, useToast } from './integrations-shared';
import {
  API_HOURLY, ApiKey, CATEGORIES, Connection, ENDPOINTS, Endpoint, EVENT_TYPES, fmtAgo, fmtTime, HOURS, integ, IntegrationStore, MapProfile, MapRule, SCOPES, SITE_NAMES, TRANSFORMS, Webhook,
} from './integrations.data';

const BASE = '/integrations-api-hub';
const statusCls = (s: string) => (s === 'Healthy' || s === 'Active' || s === 'Success' ? 'green' : s === 'Warning' || s === 'Expiring' || s === 'Paused' ? 'amber' : s === 'Error' || s === 'Failing' || s === 'Failed' || s === 'Revoked' ? 'red' : 'grey');

/* =====================================================================
   Connected Systems
   ===================================================================== */
@Component({
  selector: 'app-integrations-connected-systems',
  imports: [...UI, IntLogo, RouterLink, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Connected Systems" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Monitor and manage every live connection between People360 and your enterprise systems.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
      <button class="btn-ghost" (click)="syncAll()"><app-icon name="refresh" [size]="15" />Sync All</button>
      <a class="btn-primary" [routerLink]="base + '/integration-marketplace'"><app-icon name="plus" [size]="16" />Add Integration</a>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Connected Systems" [value]="h().total" icon="plug" color="var(--ka-7c3aed)" sub="across 6 sites" />
      <app-kpi label="Healthy" [value]="h().healthy" icon="shield-check" color="var(--ka-22c55e)" [sub]="pct(h().healthy) + '% of connections'" subColor="var(--ka-16a34a)" />
      <app-kpi label="Warnings" [value]="h().warning" icon="triangle-alert" color="var(--ka-f59e0b)" sub="degraded / partial sync" />
      <app-kpi label="Errors" [value]="h().error" icon="ban" color="var(--ka-ef4444)" sub="needs attention" [subColor]="h().error ? 'var(--ka-dc2626)' : undefined" />
      <app-kpi label="Records Synced Today" [value]="(h().records | number) ?? ''" icon="refresh" color="var(--ka-3b82f6)" change="12%" sub="vs. yesterday" />
    </section>

    <section class="cs" [class.with-d]="!!sel()">
      <div class="card">
        <div class="card-head">
          <div class="tabs">@for (s of statuses; track s) {<button [class.on]="st() === s" (click)="st.set(s)">{{ s }}<span class="count">{{ countOf(s) }}</span></button>}</div>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search systems..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option value="All">All categories</option>@for (c of cats; track c.name) {<option [value]="c.name">{{ c.name }}</option>}</select>
          </div>
        </div>
        <div class="cgrid">
          @for (c of list(); track c.id) {
            @let it = byId(c.integId);
            <button class="cc" [class.on]="selId() === c.id" (click)="selId.set(c.id)">
              <div class="ch"><app-int-logo [it]="it" [size]="36" /><div><b>{{ c.name }}</b><small>{{ it.sub }}</small></div><span class="pill" [class]="'pill ' + cls(c.status)"><i></i>{{ c.status }}</span></div>
              <div class="cm">
                <span><small>Last sync</small>{{ ago(c.lastSync) }}</span>
                <span><small>Records today</small>{{ c.records | number }}</span>
                <span><small>Uptime</small>{{ c.uptime | number: '1.1-2' }}%</span>
              </div>
              <div class="cf"><span class="tag grey">{{ c.mode }}</span><span class="muted">{{ c.sites.length }} sites · {{ c.env }}</span></div>
            </button>
          } @empty {<p class="muted">No connections match.</p>}
        </div>
      </div>

      @if (sel(); as c) {
        @let it = byId(c.integId);
        <aside class="card det">
          <div class="dh"><app-int-logo [it]="it" [size]="48" /><div><h2>{{ c.name }}</h2><small class="muted">{{ c.id }} · {{ it.vendor }}</small></div><span class="pill" [class]="'pill ' + cls(c.status)"><i></i>{{ c.status }}</span><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="toolbar">
            <button class="btn-primary" [disabled]="c.status === 'Paused'" (click)="syncNow(c)"><app-icon name="refresh" [size]="15" />Sync now</button>
            <button class="btn-ghost" (click)="togglePause(c)"><app-icon [name]="c.status === 'Paused' ? 'play' : 'pause'" [size]="14" />{{ c.status === 'Paused' ? 'Resume' : 'Pause' }}</button>
            <button class="btn-ghost" (click)="edit.set({ ...c })"><app-icon name="sliders" [size]="14" />Configure</button>
            <button class="btn-ghost danger" (click)="confirm.set(c)">Disconnect</button>
          </div>
          @if (c.status === 'Error') {<div class="alert"><app-icon name="triangle-alert" [size]="16" /><div><b>Last sync failed</b><small>{{ lastFail(c.id) }}</small></div><button class="btn-ghost sm" (click)="syncNow(c)">Retry</button></div>}
          <div class="mx">
            <div><small>Uptime (30d)</small><b>{{ c.uptime | number: '1.1-2' }}%</b></div>
            <div><small>Avg latency</small><b>{{ c.latency }} ms</b></div>
            <div><small>Records today</small><b>{{ c.records | number }}</b></div>
            <div><small>Last sync</small><b>{{ ago(c.lastSync) }}</b></div>
          </div>
          <div class="mini"><div class="mh"><h4>Sync volume · last 12 runs</h4></div><app-sparkline [values]="spark(c)" color="var(--ka-7c3aed)" /></div>
          <h4>Configuration</h4>
          <dl class="dl">
            <dt>Environment</dt><dd>{{ c.env }}</dd><dt>Authentication</dt><dd>{{ c.auth }}</dd>
            <dt>Sync mode</dt><dd>{{ c.mode }} · {{ c.freq }}</dd><dt>Methods</dt><dd>{{ it.methods }}</dd>
            <dt>Sites</dt><dd>{{ c.sites.join(', ') }}</dd><dt>Owner</dt><dd>{{ c.owner }}</dd><dt>Connected on</dt><dd>{{ c.connectedOn }}</dd>
          </dl>
          <div class="mh"><h4>Recent sync runs</h4><a class="link" [routerLink]="base + '/sync-logs-monitoring'" [queryParams]="{ conn: c.id }">View all logs</a></div>
          <ul class="runs">
            @for (l of runs(c.id); track l.id) {
              <li><span class="dot" [class]="'dot ' + cls(l.status)"></span><div><b>{{ l.job }} · {{ l.direction }}</b><small>{{ l.message }}</small></div><small>{{ time(l.at) }}</small></li>
            } @empty {<li class="muted">No runs yet.</li>}
          </ul>
          <div class="toolbar"><a class="btn-ghost sm" [routerLink]="base + '/data-mapping-transformation'">Field mappings</a><a class="btn-ghost sm" [routerLink]="base + '/webhooks-event-hub'">Webhooks</a></div>
        </aside>
      }
    </section>

    @if (edit(); as e) {
      <div class="g-overlay" (click)="edit.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Configure {{ e.name }}</h3><button class="close-btn" (click)="edit.set(null)">×</button></div>
        <div class="form-grid">
          <label>Sync mode<select class="select" [value]="e.mode" (change)="setE('mode', $any($event.target).value)"><option>Real-time</option><option>Scheduled</option></select></label>
          <label>Frequency<select class="select" [value]="e.freq" [disabled]="e.mode === 'Real-time'" (change)="setE('freq', $any($event.target).value)"><option>Event driven</option><option>Every 15 min</option><option>Hourly</option><option>Every 6 hours</option><option>Daily 02:00</option></select></label>
          <label>Environment<select class="select" [value]="e.env" (change)="setE('env', $any($event.target).value)"><option>Production</option><option>Sandbox</option></select></label>
          <label>Owner<input class="input" [value]="e.owner" (input)="setE('owner', $any($event.target).value)" /></label>
          <div class="full sites"><span>Sites in scope</span>@for (s of siteNames; track s) {<label><input type="checkbox" [checked]="e.sites.includes(s)" (change)="toggleSite(s)" />{{ s }}</label>}</div>
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="edit.set(null)">Cancel</button><button class="btn-primary" (click)="saveEdit()">Save changes</button></div>
      </div>
    }
    @if (confirm(); as c) {
      <div class="g-overlay" (click)="confirm.set(null)"></div>
      <div class="g-modal small">
        <div class="modal-head"><h3>Disconnect {{ c.name }}?</h3><button class="close-btn" (click)="confirm.set(null)">×</button></div>
        <p>Sync will stop immediately and stored credentials will be deleted. Data already in People360 is kept.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="confirm.set(null)">Cancel</button><button class="btn-primary red" (click)="disconnect(c)">Disconnect</button></div>
      </div>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .cs { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .cs.with-d { grid-template-columns: minmax(0, 1fr) 420px; }
    .cgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
    .cc { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); text-align: left; cursor: pointer; font: inherit; color: inherit; }
    .cc:hover { border-color: var(--kl-c4b5fd); } .cc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .ch { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .ch div { display: flex; flex-direction: column; min-width: 0; } .ch b { font-size: 13px; } .ch small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .cm span { display: flex; flex-direction: column; font-size: 12.5px; font-weight: 600; } .cm small { font-size: 10.5px; color: var(--muted); font-weight: 400; }
    .cf { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 20px; font-size: 11px; white-space: nowrap; } .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .pill.green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .pill.amber { background: var(--kb-fef3c7); color: var(--kf-b45309); } .pill.red { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .pill.grey { background: var(--kb-f3f4f6); color: var(--kf-6b7280); }
    .det { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 12px; }
    .dh { display: grid; grid-template-columns: 48px 1fr auto auto; gap: 10px; align-items: center; } .dh h2 { margin: 0; font-size: 17px; } .dh div { display: flex; flex-direction: column; }
    .danger { color: var(--red); }
    .alert { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center; padding: 10px; border-radius: 8px; background: var(--kb-fef2f2); color: var(--kf-b91c1c); } .alert div { display: flex; flex-direction: column; font-size: 12.5px; } .alert small { color: var(--kf-7f1d1d); }
    .mx { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .mx div { display: flex; flex-direction: column; padding: 8px; border: 1px solid var(--border); border-radius: 8px; } .mx small { font-size: 10.5px; color: var(--muted); } .mx b { font-size: 14px; }
    .mini { border: 1px solid var(--border); border-radius: 10px; padding: 10px; } .mh { display: flex; justify-content: space-between; align-items: center; }
    h4 { margin: 0; font-size: 13px; }
    .dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; margin: 0; font-size: 12px; } .dl dt { color: var(--muted); } .dl dd { margin: 0; }
    .runs { list-style: none; margin: 0; padding: 0; } .runs li { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .runs div { display: flex; flex-direction: column; } .runs small { color: var(--muted); font-size: 11px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--kb-9ca3af); } .dot.green { background: var(--kb-22c55e); } .dot.amber { background: var(--kb-f59e0b); } .dot.red { background: var(--kb-ef4444); }
    .sites { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12.5px; } .sites span { width: 100%; font-size: 12px; color: var(--kf-4b4f6b); } .sites label { flex-direction: row !important; align-items: center; gap: 6px !important; }
    .g-modal.small { width: min(440px, calc(100vw - 32px)); } .red { background: var(--kb-ef4444) !important; box-shadow: none !important; }
    @media (max-width: 1250px) { .cs.with-d { grid-template-columns: 1fr; } .det { position: static; max-height: none; } }
  `,
})
export class ConnectedSystems {
  protected readonly store = inject(IntegrationStore);
  private readonly app = inject(AppState);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly cats = CATEGORIES;
  protected readonly siteNames = SITE_NAMES;
  protected readonly byId = integ;
  protected readonly cls = statusCls;
  protected readonly time = fmtTime;
  protected readonly statuses = ['All', 'Healthy', 'Warning', 'Error', 'Paused'];
  protected readonly st = signal('All');
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly h = this.store.health;
  protected readonly selId = signal<string | null>(this.store.connections()[0]?.id ?? null);
  protected readonly edit = signal<Connection | null>(null);
  protected readonly confirm = signal<Connection | null>(null);
  private readonly now = computed(() => (this.app.tick(), Date.now()));
  protected readonly sel = computed(() => this.store.connections().find((c) => c.id === this.selId()) ?? null);
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.connections().filter((c) => (this.st() === 'All' || c.status === this.st()) && (this.cat() === 'All' || integ(c.integId).category === this.cat()) && (!q || c.name.toLowerCase().includes(q)));
  });
  protected countOf(s: string) {
    return s === 'All' ? this.store.connections().length : this.store.connections().filter((c) => c.status === s).length;
  }
  protected pct(n: number) {
    return Math.round((n / Math.max(1, this.h().total)) * 100);
  }
  protected ago(ms: number) {
    return fmtAgo(ms, this.now());
  }
  protected runs(id: string) {
    return this.store.logs().filter((l) => l.connId === id).slice(0, 6);
  }
  protected lastFail(id: string) {
    return this.store.logs().find((l) => l.connId === id && l.status === 'Failed')?.message ?? 'HTTP 503 Service Unavailable';
  }
  protected spark(c: Connection) {
    const l = this.store.logs().filter((x) => x.connId === c.id).slice(0, 12).reverse().map((x) => x.records);
    return l.length > 2 ? l : [3, 5, 4, 6, 5, 7, 6, 8].map((v) => v * 100);
  }
  protected syncNow(c: Connection) {
    this.store.addLog(c, 'Delta sync', 'Manual');
    this.t.show(`Sync started for ${c.name}`);
  }
  protected syncAll() {
    const l = this.store.connections().filter((c) => c.status !== 'Paused');
    l.forEach((c) => this.store.addLog(c, 'Delta sync', 'Manual'));
    this.t.show(`Sync triggered for ${l.length} connections`);
  }
  protected togglePause(c: Connection) {
    this.store.patchConn(c.id, { status: c.status === 'Paused' ? 'Healthy' : 'Paused' });
    this.t.show(`${c.name} ${c.status === 'Paused' ? 'resumed' : 'paused'}`);
  }
  protected setE<K extends keyof Connection>(k: K, v: Connection[K]) {
    this.edit.update((e) => (e ? { ...e, [k]: v, ...(k === 'mode' && v === 'Real-time' ? { freq: 'Event driven' } : k === 'mode' ? { freq: 'Hourly' } : {}) } : e));
  }
  protected toggleSite(s: string) {
    this.edit.update((e) => (e ? { ...e, sites: e.sites.includes(s) ? e.sites.filter((x) => x !== s) : [...e.sites, s] } : e));
  }
  protected saveEdit() {
    const e = this.edit()!;
    this.store.patchConn(e.id, { mode: e.mode, freq: e.freq, env: e.env, owner: e.owner, sites: e.sites });
    this.edit.set(null);
    this.t.show(`${e.name} configuration saved`);
  }
  protected disconnect(c: Connection) {
    this.store.disconnect(c.id);
    this.confirm.set(null);
    this.selId.set(this.store.connections()[0]?.id ?? null);
    this.t.show(`${c.name} disconnected — now ${this.h().total} active integrations`);
  }
  protected exportCsv() {
    downloadCsv('connected-systems.csv', [['ID', 'System', 'Status', 'Mode', 'Frequency', 'Records today', 'Uptime %', 'Sites', 'Owner'], ...this.list().map((c) => [c.id, c.name, c.status, c.mode, c.freq, c.records, c.uptime, c.sites.join('; '), c.owner])]);
  }
}

/* =====================================================================
   API Management
   ===================================================================== */
const TABS_API = ['Overview', 'API Keys', 'Endpoints', 'Try-it Console'] as const;
@Component({
  selector: 'app-integrations-api-management',
  imports: [...UI, DecimalPipe, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="API Management" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Manage API keys, explore People360 REST endpoints and test requests live.">
      <button class="btn-ghost" (click)="tab.set('Try-it Console')"><app-icon name="integrations-code" [size]="15" />Open Console</button>
      <button class="btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" />Create API Key</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="API Calls Today" [value]="(store.apiCallsToday() | number) ?? ''" icon="activity" color="var(--ka-7c3aed)" change="8.4%" sub="vs. yesterday" />
      <app-kpi label="Avg Latency (p95)" value="142 ms" icon="clock" color="var(--ka-3b82f6)" change="6%" [up]="false" sub="faster vs. last week" />
      <app-kpi label="Error Rate" value="0.04%" icon="triangle-alert" color="var(--ka-f59e0b)" sub="SLO < 0.5%" subColor="var(--ka-16a34a)" />
      <app-kpi label="Active API Keys" [value]="activeKeys()" icon="key-round" color="var(--ka-22c55e)" [sub]="expiring() + ' expiring in 30 days'" />
      <app-kpi label="Throttled Requests" value="312" icon="ban" color="var(--ka-ef4444)" sub="rate limit 600 req/min" />
    </section>

    <nav class="tabs pt">@for (x of tabs; track x) {<button [class.on]="tab() === x" (click)="tab.set(x)">{{ x }}</button>}</nav>

    @switch (tab()) {
      @case ('Overview') {
        <section class="dash">
          <div class="card span-8"><div class="card-head"><h3>API calls per hour <span class="card-sub">today, thousands</span></h3></div><app-line-chart [labels]="hours" [series]="callSeries" [height]="250" [legend]="false" /></div>
          <div class="card span-4"><div class="card-head"><h3>Calls by API group</h3></div><app-donut [segments]="groupSegs()" center="Calls (30d)" [value]="groupTotal()" [size]="150" /></div>
          <div class="card span-6"><div class="card-head"><h3>Top consumers</h3><button class="link" (click)="tab.set('API Keys')">Manage keys</button></div><app-bar-list [rows]="consumers()" [max]="100" /></div>
          <div class="card span-6"><div class="card-head"><h3>Slowest endpoints (p95)</h3><button class="link" (click)="tab.set('Endpoints')">All endpoints</button></div>
            <table class="table"><thead><tr><th>Endpoint</th><th class="num">p95</th><th class="num">Errors</th></tr></thead>
              <tbody>@for (e of slowest(); track e.path + e.method) {<tr class="clickable" (click)="tryIt(e)"><td><span class="m" [class]="'m ' + e.method">{{ e.method }}</span> {{ e.path }}</td><td class="num">{{ e.p95 }} ms</td><td class="num">{{ e.errors }}%</td></tr>}</tbody></table>
          </div>
        </section>
      }
      @case ('API Keys') {
        <div class="card">
          <div class="card-head"><h3>{{ store.keys().length }} API keys</h3><div class="toolbar"><select class="select" [value]="kf()" (change)="kf.set($any($event.target).value)"><option>All</option><option>Active</option><option>Expiring</option><option>Revoked</option></select></div></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Name</th><th>Key</th><th>Application</th><th>Scopes</th><th>Last used</th><th class="num">Calls</th><th>Expires</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (k of keys(); track k.id) {
                  <tr [class.rev]="k.status === 'Revoked'">
                    <td><b>{{ k.name }}</b><br /><small class="muted">{{ k.owner }}</small></td>
                    <td><code>{{ k.prefix }}••••••••</code></td><td>{{ k.app }}</td>
                    <td class="wrap">@for (s of k.scopes; track s) {<span class="chip-s">{{ s }}</span>}</td>
                    <td>{{ k.lastUsed }}</td><td class="num">{{ k.calls | number }}</td><td>{{ k.expires }}</td>
                    <td><span class="tag" [class]="'tag ' + cls(k.status)">{{ k.status }}</span></td>
                    <td class="acts">
                      @if (k.status !== 'Revoked') {
                        <button class="btn-ghost sm" (click)="rotate(k)">Rotate</button>
                        <button class="btn-ghost sm danger" (click)="revoke(k)">Revoke</button>
                      } @else {<span class="muted">—</span>}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
      @case ('Endpoints') {
        <div class="card">
          <div class="card-head"><h3>People360 REST API v2</h3><div class="toolbar"><label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Filter endpoints..." [value]="eq()" (input)="eq.set($any($event.target).value)" /></label><span class="muted">Base URL https://api.people360.demo</span></div></div>
          @for (g of groups(); track g.name) {
            <h4 class="gh">{{ g.name }}</h4>
            @for (e of g.items; track e.method + e.path) {
              <div class="ep">
                <span class="m" [class]="'m ' + e.method">{{ e.method }}</span><code>{{ e.path }}</code><span class="ed">{{ e.desc }}</span>
                <span class="muted">{{ e.calls | number }} calls · p95 {{ e.p95 }} ms</span>
                <button class="btn-outline btn-sm" (click)="tryIt(e)">Try it</button>
              </div>
            }
          }
        </div>
      }
      @case ('Try-it Console') {
        <section class="con">
          <div class="card">
            <h3>Request</h3>
            <div class="req-line">
              <select class="select" [value]="epIdx()" (change)="pick(+$any($event.target).value)">@for (e of endpoints; track $index) {<option [value]="$index">{{ e.method }} {{ e.path }}</option>}</select>
              <button class="btn-primary" [disabled]="sending()" (click)="send()"><app-icon name="integrations-send" [size]="15" />{{ sending() ? 'Sending…' : 'Send' }}</button>
            </div>
            <div class="form-grid">
              <label>API key<select class="select" [value]="keyId()" (change)="keyId.set($any($event.target).value)">@for (k of store.keys(); track k.id) {<option [value]="k.id">{{ k.name }} ({{ k.status }})</option>}</select></label>
              <label>Path parameter (id)<input class="input" [value]="pid()" [disabled]="!ep().path.includes('{id}')" (input)="pid.set($any($event.target).value)" /></label>
              @if (ep().body !== undefined) {<label class="full">Body (JSON)<textarea class="input code" rows="8" [value]="body()" (input)="body.set($any($event.target).value)"></textarea></label>}
            </div>
            <p class="muted sm">{{ ep().desc }}</p>
            <div class="toolbar"><button class="btn-ghost sm" (click)="copyCurl()">Copy as cURL</button></div>
            <h4>History</h4>
            <ul class="hist">@for (h of history(); track $index) {<li><span class="code-b" [class.bad]="h.code >= 400">{{ h.code }}</span><span>{{ h.method }} {{ h.path }}</span><small>{{ h.ms }} ms · {{ h.at }}</small></li>} @empty {<li class="muted">No requests yet.</li>}</ul>
          </div>
          <div class="card">
            <div class="card-head"><h3>Response</h3>@if (resp(); as r) {<span class="rs"><span class="code-b" [class.bad]="r.code >= 400">{{ r.code }} {{ r.text }}</span><span class="muted">{{ r.ms }} ms · {{ r.size }}</span></span>}</div>
            @if (resp(); as r) {
              <pre class="hdrs">content-type: application/json
x-request-id: {{ r.rid }}
x-ratelimit-remaining: {{ r.remaining }}</pre>
              <pre class="json">{{ r.body | json }}</pre>
            } @else {
              <p class="muted">Pick an endpoint and press <b>Send</b>. Responses are canned demo data.</p>
            }
          </div>
        </section>
      }
    }

    @if (create()) {
      <div class="g-overlay" (click)="create.set(false)"></div>
      <div class="g-modal">
        @if (newKey(); as nk) {
          <div class="modal-head"><h3>API key created</h3><button class="close-btn" (click)="create.set(false)">×</button></div>
          <p>Copy this key now — it won't be shown again.</p>
          <div class="keybox"><code>{{ nk }}</code><button class="btn-ghost sm" (click)="copy(nk)"><app-icon name="integrations-copy" [size]="14" />Copy</button></div>
          <div class="form-actions"><button class="btn-primary" (click)="create.set(false); tab.set('API Keys')">Done</button></div>
        } @else {
          <div class="modal-head"><h3>Create API key</h3><button class="close-btn" (click)="create.set(false)">×</button></div>
          <div class="form-grid">
            <label>Key name *<input class="input" [value]="kn()" (input)="kn.set($any($event.target).value)" /></label>
            <label>Application<input class="input" [value]="ka()" (input)="ka.set($any($event.target).value)" /></label>
            <label>Expires in<select class="select" [value]="kexp()" (change)="kexp.set($any($event.target).value)"><option>90 days</option><option>6 months</option><option>1 year</option><option>Never</option></select></label>
            <label>Environment<select class="select"><option>Live</option><option>Test</option></select></label>
            <div class="full scopes"><span>Scopes *</span>@for (s of scopes; track s) {<label><input type="checkbox" [checked]="ks().includes(s)" (change)="toggleScope(s)" />{{ s }}</label>}</div>
          </div>
          @if (err()) {<p class="bad">{{ err() }}</p>}
          <div class="form-actions"><button class="btn-ghost" (click)="create.set(false)">Cancel</button><button class="btn-primary" (click)="saveKey()">Generate key</button></div>
        }
      </div>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .pt { margin-bottom: 12px; }
    .m { display: inline-block; min-width: 54px; text-align: center; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: var(--kf-ffffff); }
    .m.GET { background: var(--kb-22c55e); } .m.POST { background: var(--kb-3b82f6); } .m.PUT, .m.PATCH { background: var(--kb-f59e0b); } .m.DELETE { background: var(--kb-ef4444); }
    code { font-size: 12px; } .wrap { white-space: normal !important; max-width: 220px; } .wrap .chip-s { display: inline-block; margin: 1px; }
    tr.rev td { opacity: .55; } .acts { display: flex; gap: 6px; } .danger { color: var(--red); }
    .gh { margin: 14px 0 6px; font-size: 13px; color: var(--kf-4b4f6b); }
    .ep { display: grid; grid-template-columns: 64px minmax(200px, 260px) 1fr auto auto; gap: 12px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; font-size: 12.5px; }
    .ep .muted { font-size: 11.5px; white-space: nowrap; } .ed { color: var(--kf-3b3f5c); }
    .con { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 12px; align-items: start; }
    .req-line { display: flex; gap: 8px; margin-bottom: 12px; } .req-line .select { flex: 1; font-family: ui-monospace, monospace; font-size: 12.5px; }
    .code { font-family: ui-monospace, monospace; font-size: 12px; cursor: text; }
    .sm { font-size: 12px; } h4 { margin: 14px 0 6px; font-size: 13px; }
    .hist { list-style: none; padding: 0; margin: 0; } .hist li { display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; font-family: ui-monospace, monospace; } .hist small { color: var(--muted); }
    .code-b { display: inline-block; padding: 2px 7px; border-radius: 4px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-weight: 700; font-size: 11.5px; } .code-b.bad { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .rs { display: flex; gap: 10px; align-items: center; font-size: 12px; }
    pre { margin: 0 0 10px; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; } .hdrs { background: var(--kb-f6f6fb); color: var(--kf-4b4f6b); } .json { background: var(--kb-12142b); color: var(--kf-c4f1be); max-height: 520px; }
    .keybox { display: flex; gap: 8px; align-items: center; padding: 10px; border: 1px dashed var(--kl-c4b5fd); border-radius: 8px; background: var(--kb-faf8ff); } .keybox code { flex: 1; word-break: break-all; }
    .scopes { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; } .scopes span { width: 100%; font-size: 12px; color: var(--kf-4b4f6b); } .scopes label { flex-direction: row !important; align-items: center; gap: 6px !important; font-family: ui-monospace, monospace; }
    @media (max-width: 1200px) { .con { grid-template-columns: 1fr; } .ep { grid-template-columns: 64px 1fr auto; } .ep .ed, .ep .muted { display: none; } }
  `,
})
export class APIManagement {
  protected readonly store = inject(IntegrationStore);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly tabs = TABS_API;
  protected readonly hours = HOURS;
  protected readonly scopes = SCOPES;
  protected readonly endpoints = ENDPOINTS;
  protected readonly cls = statusCls;
  protected readonly tab = signal<(typeof TABS_API)[number]>('Overview');
  protected readonly callSeries = [{ name: 'Calls (K)', color: 'var(--ka-7c3aed)', values: API_HOURLY, area: true }];
  protected readonly activeKeys = computed(() => this.store.keys().filter((k) => k.status !== 'Revoked').length);
  protected readonly expiring = computed(() => this.store.keys().filter((k) => k.status === 'Expiring').length);
  protected readonly kf = signal('All');
  protected readonly keys = computed(() => this.store.keys().filter((k) => this.kf() === 'All' || k.status === this.kf()));
  protected readonly groupSegs = computed(() => {
    const colors = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-14b8a6)', 'var(--ka-ec4899)'];
    const m = new Map<string, number>();
    ENDPOINTS.forEach((e) => m.set(e.group, (m.get(e.group) ?? 0) + e.calls));
    return [...m].map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
  });
  protected readonly groupTotal = computed(() => (this.groupSegs().reduce((a, x) => a + x.value, 0) / 1e6).toFixed(1) + 'M');
  protected readonly consumers = computed(() => {
    const l = this.store.keys().filter((k) => k.status !== 'Revoked').sort((a, b) => b.calls - a.calls).slice(0, 6);
    const max = l[0]?.calls ?? 1;
    return l.map((k) => ({ label: k.name, value: Math.round((k.calls / max) * 100), display: k.calls >= 1e6 ? (k.calls / 1e6).toFixed(1) + 'M' : Math.round(k.calls / 1000) + 'K' }));
  });
  protected readonly slowest = computed(() => [...ENDPOINTS].sort((a, b) => b.p95 - a.p95).slice(0, 6));
  protected readonly eq = signal('');
  protected readonly groups = computed(() => {
    const q = this.eq().toLowerCase();
    const l = ENDPOINTS.filter((e) => !q || `${e.method} ${e.path} ${e.desc}`.toLowerCase().includes(q));
    return [...new Set(l.map((e) => e.group))].map((name) => ({ name, items: l.filter((e) => e.group === name) }));
  });

  // console
  protected readonly epIdx = signal(0);
  protected readonly ep = computed(() => ENDPOINTS[this.epIdx()]);
  protected readonly keyId = signal('K1');
  protected readonly pid = signal('EMP-10421');
  protected readonly body = signal('');
  protected readonly sending = signal(false);
  protected readonly resp = signal<{ code: number; text: string; ms: number; size: string; body: unknown; rid: string; remaining: number } | null>(null);
  protected readonly history = signal<{ code: number; method: string; path: string; ms: number; at: string }[]>([]);
  protected tryIt(e: Endpoint) {
    this.pick(ENDPOINTS.indexOf(e));
    this.tab.set('Try-it Console');
  }
  protected pick(i: number) {
    this.epIdx.set(i);
    this.body.set(ENDPOINTS[i].body ?? '');
    this.resp.set(null);
  }
  protected send() {
    const e = this.ep();
    const key = this.store.keys().find((k) => k.id === this.keyId())!;
    this.sending.set(true);
    const ms = Math.round(e.p95 * (0.5 + Math.random() * 0.5));
    setTimeout(() => {
      let code = e.status ?? 200, text = code === 201 ? 'Created' : code === 202 ? 'Accepted' : code === 204 ? 'No Content' : 'OK', body: unknown = e.response;
      if (key.status === 'Revoked') [code, text, body] = [401, 'Unauthorized', { error: 'invalid_api_key', message: `Key ${key.prefix}… has been revoked.` }];
      else if (e.body !== undefined) {
        try { JSON.parse(this.body() || '{}'); } catch { [code, text, body] = [400, 'Bad Request', { error: 'invalid_json', message: 'Request body is not valid JSON.' }]; }
      }
      if (code < 400 && e.path.includes('{id}') && !/^EMP-\d+$|^WH-\d+$/.test(this.pid())) [code, text, body] = [404, 'Not Found', { error: 'not_found', message: `No resource with id '${this.pid()}'.` }];
      if (code < 400 && body && typeof body === 'object' && 'id' in (body as object) && e.path.includes('{id}')) body = { ...(body as object), id: this.pid() };
      const size = body === null ? '0 B' : `${(JSON.stringify(body).length / 1024).toFixed(1)} KB`;
      this.resp.set({ code, text, ms, size, body, rid: 'req_' + Math.random().toString(36).slice(2, 10), remaining: 600 - this.history().length - 1 });
      this.history.update((h) => [{ code, method: e.method, path: e.path.replace('{id}', this.pid()), ms, at: new Date().toLocaleTimeString('en-GB') }, ...h].slice(0, 8));
      this.store.apiCallsToday.update((v) => v + 1);
      this.sending.set(false);
    }, ms + 250);
  }
  protected copyCurl() {
    const e = this.ep();
    const k = this.store.keys().find((x) => x.id === this.keyId())!;
    const c = `curl -X ${e.method} https://api.people360.demo${e.path.replace('{id}', this.pid())} -H "Authorization: Bearer ${k.prefix}…"${e.body !== undefined ? ` -d '${this.body().replace(/\s+/g, ' ')}'` : ''}`;
    this.copy(c);
  }
  protected copy(s: string) {
    navigator.clipboard?.writeText(s).catch(() => 0);
    this.t.show('Copied to clipboard');
  }

  // keys
  protected readonly create = signal(false);
  protected readonly newKey = signal<string | null>(null);
  protected readonly kn = signal('');
  protected readonly ka = signal('');
  protected readonly kexp = signal('1 year');
  protected readonly ks = signal<string[]>(['employees:read']);
  protected readonly err = signal('');
  protected openCreate() {
    this.newKey.set(null);
    this.kn.set('');
    this.ka.set('');
    this.ks.set(['employees:read']);
    this.err.set('');
    this.create.set(true);
  }
  protected toggleScope(s: string) {
    this.ks.update((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  }
  private rnd(n: number) {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }
  protected saveKey() {
    if (!this.kn().trim() || !this.ks().length) return this.err.set('Name and at least one scope are required.');
    const prefix = `p360_live_${this.rnd(4)}`;
    const full = `${prefix}${this.rnd(28)}`;
    const k: ApiKey = { id: `K${Date.now()}`, name: this.kn(), prefix, app: this.ka() || 'Custom app', scopes: this.ks(), created: '06 Nov 2026', lastUsed: 'never', calls: 0, status: 'Active', expires: this.kexp() === 'Never' ? 'Never' : this.kexp() === '90 days' ? '04 Feb 2027' : this.kexp() === '6 months' ? '06 May 2027' : '06 Nov 2027', owner: 'Rex Kumar' };
    this.store.keys.update((l) => [k, ...l]);
    this.keyId.set(k.id);
    this.newKey.set(full);
  }
  protected revoke(k: ApiKey) {
    this.store.keys.update((l) => l.map((x) => (x.id === k.id ? { ...x, status: 'Revoked', expires: '—' } : x)));
    this.t.show(`${k.name} revoked — requests with this key now return 401`);
  }
  protected rotate(k: ApiKey) {
    const prefix = `p360_live_${this.rnd(4)}`;
    this.store.keys.update((l) => l.map((x) => (x.id === k.id ? { ...x, prefix, status: 'Active', created: '06 Nov 2026', expires: '06 Nov 2027' } : x)));
    this.t.show(`${k.name} rotated · new key ${prefix}… (old key valid 24 h)`);
  }
}

/* =====================================================================
   Webhooks & Event Hub
   ===================================================================== */
const SAMPLE: Record<string, object> = {
  'employee.created': { id: 'EMP-12481', firstName: 'Lina', lastName: 'Saeed', department: 'Finance', site: 'Head Office', hireDate: '2026-11-09' },
  'access.denied': { door: 'MFG-Gate-2', person: 'CTR-2210', reason: 'Expired induction', at: '2026-11-06T10:23:47+04:00' },
  'attendance.punch': { employeeId: 'EMP-10421', type: 'IN', deviceId: 'T-HO-03', at: '2026-11-06T08:02:11+04:00' },
};
@Component({
  selector: 'app-integrations-webhooks-event-hub',
  imports: [...UI, DecimalPipe, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Webhooks &amp; Event Hub" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Push People360 events to external systems in real time and track every delivery.">
      <button class="btn-ghost" (click)="catalogOpen.set(true)"><app-icon name="list-checks" [size]="15" />Event Catalog</button>
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />New Webhook</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Subscriptions" [value]="store.hooks().length" icon="integrations-webhook" color="var(--ka-7c3aed)" [sub]="activeCount() + ' active'" />
      <app-kpi label="Events Today" [value]="(eventsToday() | number) ?? ''" icon="activity" color="var(--ka-3b82f6)" change="5%" sub="vs. yesterday" />
      <app-kpi label="Delivery Success" [value]="successRate() + '%'" icon="shield-check" color="var(--ka-22c55e)" sub="last 200 deliveries" />
      <app-kpi label="Failed Deliveries" [value]="failed()" icon="triangle-alert" color="var(--ka-ef4444)" sub="queued for retry" />
      <app-kpi label="Avg Delivery Time" [value]="avgMs() + ' ms'" icon="clock" color="var(--ka-f59e0b)" sub="p50, successful" />
    </section>

    <section class="wh">
      <div class="card">
        <div class="card-head"><h3>Subscriptions</h3></div>
        <ul class="hooks">
          @for (h of store.hooks(); track h.id) {
            <li [class.on]="selId() === h.id" (click)="selId.set(h.id)">
              <span class="hi" [class]="'hi ' + cls(h.status)"><app-icon name="integrations-webhook" [size]="16" /></span>
              <div><b>{{ h.name }}</b><small>{{ h.url }}</small></div>
              <span class="tag" [class]="'tag ' + cls(h.status)">{{ h.status }}</span>
            </li>
          }
        </ul>
      </div>

      @if (sel(); as h) {
        <div class="card">
          <div class="card-head"><h3>{{ h.name }} <span class="card-sub">{{ h.id }}</span></h3>
            <div class="toolbar">
              <button class="btn-ghost sm" (click)="test(h)"><app-icon name="integrations-send" [size]="13" />Send test</button>
              <button class="btn-ghost sm" (click)="toggle(h)">{{ h.status === 'Paused' ? 'Resume' : 'Pause' }}</button>
              <button class="btn-ghost sm danger" (click)="remove(h)">Delete</button>
            </div>
          </div>
          <dl class="dl">
            <dt>Endpoint URL</dt><dd><code>{{ h.url }}</code></dd>
            <dt>Signing secret</dt><dd><code>{{ reveal() ? 'whsec_8f3a1c0d9e7b62' + h.id.slice(-2) : h.secret }}</code> <button class="link" (click)="reveal.set(!reveal())">{{ reveal() ? 'Hide' : 'Reveal' }}</button> · <button class="link" (click)="rotateSecret(h)">Rotate</button></dd>
            <dt>Events</dt><dd>@for (e of h.events; track e) {<span class="chip-s">{{ e }}</span> }</dd>
            <dt>Retry policy</dt><dd>{{ h.retries }} attempts, exponential back-off (1 m → 1 h)</dd>
            <dt>Success rate</dt><dd><b [class]="h.success < 95 ? 'bad' : 'good'">{{ h.success }}%</b> · {{ h.delivered | number }} delivered · created {{ h.created }}</dd>
          </dl>
          @if (h.status === 'Failing') {<div class="alert"><app-icon name="triangle-alert" [size]="16" />Endpoint returning 5xx since 09:41. Deliveries are queued and retried automatically.<button class="btn-ghost sm" (click)="retryAll(h)">Retry all failed</button></div>}
          <h4>Recent deliveries</h4>
          <table class="table">
            <thead><tr><th>Time</th><th>Event</th><th>Status</th><th class="num">Duration</th><th>Attempt</th><th></th></tr></thead>
            <tbody>
              @for (d of hookDeliveries(h.id); track d.id) {
                <tr class="clickable" (click)="payload.set({ event: d.event, id: d.id })"><td>{{ time(d.at) }}</td><td><code>{{ d.event }}</code></td><td><span class="code-b" [class.bad]="d.code >= 400">{{ d.code }}</span></td><td class="num">{{ d.ms >= 30000 ? 'timeout' : d.ms + ' ms' }}</td><td>{{ d.attempt }}</td>
                  <td>@if (d.code >= 400) {<button class="btn-ghost sm" (click)="$event.stopPropagation(); retry(d.id)">Retry</button>}</td></tr>
              } @empty {<tr><td colspan="6" class="muted">No deliveries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      }

      <div class="card stream">
        <div class="card-head"><h3>Live event stream @if (live()) {<span class="lv"><i></i>Live</span>}</h3>
          <select class="select" [value]="ef()" (change)="ef.set($any($event.target).value)"><option value="All">All events</option>@for (e of eventTypes; track e) {<option [value]="e">{{ e }}</option>}</select></div>
        <ul class="evs">
          @for (d of stream(); track d.id) {
            <li (click)="payload.set({ event: d.event, id: d.id })"><span class="dot" [class.red]="d.code >= 400"></span><div><code>{{ d.event }}</code><small>→ {{ hookName(d.hookId) }}</small></div><small>{{ time(d.at) }}</small></li>
          }
        </ul>
      </div>
    </section>

    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>New webhook</h3><button class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label>Name *<input class="input" [value]="fn()" (input)="fn.set($any($event.target).value)" /></label>
          <label>Retries<select class="select" [value]="fr()" (change)="fr.set(+$any($event.target).value)"><option value="3">3</option><option value="5">5</option><option value="8">8</option></select></label>
          <label class="full">Endpoint URL (HTTPS) *<input class="input" [value]="fu()" (input)="fu.set($any($event.target).value)" placeholder="https://example.com/webhooks/people360" /></label>
          <div class="full evp"><span>Events *</span>@for (e of eventTypes; track e) {<label><input type="checkbox" [checked]="fe().includes(e)" (change)="toggleEv(e)" />{{ e }}</label>}</div>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" (click)="save()">Create webhook</button></div>
      </div>
    }
    @if (payload(); as p) {
      <div class="g-overlay" (click)="payload.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3><code>{{ p.event }}</code> payload</h3><button class="close-btn" (click)="payload.set(null)">×</button></div>
        <pre class="json">{{ envelope(p.event, p.id) | json }}</pre>
      </div>
    }
    @if (catalogOpen()) {
      <div class="g-overlay" (click)="catalogOpen.set(false)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Event catalog</h3><button class="close-btn" (click)="catalogOpen.set(false)">×</button></div>
        <ul class="cat">@for (e of eventTypes; track e) {<li (click)="payload.set({ event: e, id: 'sample' })"><code>{{ e }}</code><small>{{ subs(e) }} subscriptions · view sample</small></li>}</ul>
      </aside>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .wh { display: grid; grid-template-columns: 330px minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
    .hooks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .hooks li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 9px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
    .hooks li.on { border-color: var(--primary); background: var(--kb-faf8ff); } .hooks div { display: flex; flex-direction: column; min-width: 0; font-size: 12.5px; } .hooks small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hi { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--kb-ede9fe); color: var(--kf-7c3aed); } .hi.red { background: var(--kb-fee2e2); color: var(--kf-dc2626); } .hi.amber { background: var(--kb-fef3c7); color: var(--kf-b45309); } .hi.green { background: var(--kb-dcfce7); color: var(--kf-16a34a); }
    .dl { display: grid; grid-template-columns: 120px 1fr; gap: 8px 12px; margin: 0 0 12px; font-size: 12.5px; } .dl dt { color: var(--muted); } .dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; } .dl .chip-s { display: inline-block; margin: 1px; }
    code { font-size: 12px; } h4 { margin: 12px 0 6px; font-size: 13px; } .danger { color: var(--red); }
    .alert { display: flex; gap: 8px; align-items: center; padding: 9px 10px; border-radius: 8px; background: var(--kb-fef2f2); color: var(--kf-b91c1c); font-size: 12.5px; } .alert button { margin-left: auto; }
    .code-b { display: inline-block; padding: 1px 7px; border-radius: 4px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-weight: 700; font-size: 11px; } .code-b.bad { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .stream { max-height: calc(100vh - 92px); overflow: auto; position: sticky; top: 76px; }
    .lv { display: inline-flex; gap: 5px; align-items: center; font-size: 11px; color: var(--kf-16a34a); margin-left: 6px; } .lv i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-22c55e); animation: pl 1.4s infinite; }
    @keyframes pl { 50% { opacity: .3; } }
    .stream .select { font-size: 12px; width: 100%; }
    .evs { list-style: none; margin: 0; padding: 0; } .evs li { display: grid; grid-template-columns: 8px 1fr auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; animation: fi .4s; }
    @keyframes fi { from { background: var(--kb-f5f3ff); } }
    .evs div { display: flex; flex-direction: column; min-width: 0; } .evs small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--kb-22c55e); } .dot.red { background: var(--kb-ef4444); }
    .evp { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px; font-size: 12.5px; } .evp span { grid-column: 1 / -1; font-size: 12px; color: var(--kf-4b4f6b); } .evp label { flex-direction: row !important; align-items: center; gap: 6px !important; font-family: ui-monospace, monospace; }
    .json { background: var(--kb-12142b); color: var(--kf-c4f1be); padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; }
    .cat { list-style: none; padding: 0; margin: 0; } .cat li { display: flex; flex-direction: column; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; } .cat small { color: var(--muted); font-size: 11.5px; }
    @media (max-width: 1400px) { .wh { grid-template-columns: 300px minmax(0, 1fr); } .stream { grid-column: 1 / -1; position: static; max-height: 360px; } }
  `,
})
export class WebhooksEventHub {
  protected readonly store = inject(IntegrationStore);
  private readonly app = inject(AppState);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly cls = statusCls;
  protected readonly time = fmtTime;
  protected readonly eventTypes = EVENT_TYPES;
  protected readonly live = this.app.live;
  protected readonly selId = signal<string | null>('WH-04');
  protected readonly sel = computed(() => this.store.hooks().find((h) => h.id === this.selId()) ?? null);
  protected readonly ef = signal('All');
  protected readonly reveal = signal(false);
  protected readonly payload = signal<{ event: string; id: string } | null>(null);
  protected readonly catalogOpen = signal(false);
  protected readonly activeCount = computed(() => this.store.hooks().filter((h) => h.status === 'Active').length);
  protected readonly eventsToday = computed(() => 48_210 + this.store.deliveries().length * 3);
  protected readonly failed = computed(() => this.store.deliveries().filter((d) => d.code >= 400).length);
  protected readonly successRate = computed(() => {
    const l = this.store.deliveries();
    return ((1 - this.failed() / Math.max(1, l.length)) * 100).toFixed(1);
  });
  protected readonly avgMs = computed(() => {
    const ok = this.store.deliveries().filter((d) => d.code < 400);
    return Math.round(ok.reduce((a, d) => a + d.ms, 0) / Math.max(1, ok.length));
  });
  protected readonly stream = computed(() => this.store.deliveries().filter((d) => this.ef() === 'All' || d.event === this.ef()).slice(0, 25));
  protected hookDeliveries(id: string) {
    return this.store.deliveries().filter((d) => d.hookId === id).slice(0, 10);
  }
  protected hookName(id: string) {
    return this.store.hooks().find((h) => h.id === id)?.name ?? id;
  }
  protected subs(e: string) {
    return this.store.hooks().filter((h) => h.events.includes(e)).length;
  }
  protected envelope(event: string, id: string) {
    return { id: `evt_${id.replace(/\D/g, '') || '0001'}`, type: event, created: '2026-11-06T10:24:00Z', tenant: 'people360-demo', data: SAMPLE[event] ?? { ref: 'see API docs', site: 'Head Office' } };
  }
  private patch(id: string, ch: Partial<Webhook>) {
    this.store.hooks.update((l) => l.map((h) => (h.id === id ? { ...h, ...ch } : h)));
  }
  protected test(h: Webhook) {
    const ok = h.status !== 'Failing';
    this.store.deliveries.update((l) => [{ id: `DLV-T${Date.now()}`, at: Date.now(), hookId: h.id, event: h.events[0], code: ok ? 200 : 503, ms: ok ? 142 : 30000, attempt: 1 }, ...l]);
    this.t.show(ok ? `Test event delivered to ${h.name} (200 OK, 142 ms)` : `Test delivery failed: 503 Service Unavailable`);
  }
  protected toggle(h: Webhook) {
    this.patch(h.id, { status: h.status === 'Paused' ? 'Active' : 'Paused' });
  }
  protected remove(h: Webhook) {
    this.store.hooks.update((l) => l.filter((x) => x.id !== h.id));
    this.selId.set(this.store.hooks()[0]?.id ?? null);
    this.t.show(`${h.name} deleted`);
  }
  protected rotateSecret(h: Webhook) {
    this.patch(h.id, { secret: `whsec_••••${Math.random().toString(16).slice(2, 6)}` });
    this.t.show('Signing secret rotated — previous secret valid for 24 h');
  }
  protected retry(id: string) {
    this.store.deliveries.update((l) => l.map((d) => (d.id === id ? { ...d, code: 200, ms: 188, attempt: d.attempt + 1 } : d)));
    this.t.show('Redelivered successfully (200 OK)');
  }
  protected retryAll(h: Webhook) {
    const n = this.store.deliveries().filter((d) => d.hookId === h.id && d.code >= 400).length;
    this.store.deliveries.update((l) => l.map((d) => (d.hookId === h.id && d.code >= 400 ? { ...d, code: 200, ms: 210, attempt: d.attempt + 1 } : d)));
    this.patch(h.id, { status: 'Active', success: 99.2 });
    this.t.show(`${n} deliveries replayed · endpoint healthy again`);
  }
  // new webhook
  protected readonly form = signal(false);
  protected readonly fn = signal('');
  protected readonly fu = signal('');
  protected readonly fr = signal(3);
  protected readonly fe = signal<string[]>([]);
  protected readonly err = signal('');
  protected openNew() {
    this.fn.set('');
    this.fu.set('');
    this.fe.set(['employee.created']);
    this.err.set('');
    this.form.set(true);
  }
  protected toggleEv(e: string) {
    this.fe.update((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]));
  }
  protected save() {
    if (!this.fn().trim() || !/^https:\/\/.+/.test(this.fu()) || !this.fe().length) return this.err.set('Name, an https:// URL and at least one event are required.');
    const h: Webhook = { id: `WH-${String(this.store.hooks().length + 1).padStart(2, '0')}${Date.now() % 100}`, name: this.fn(), url: this.fu(), events: this.fe(), status: 'Active', secret: `whsec_••••${Math.random().toString(16).slice(2, 6)}`, success: 100, delivered: 0, created: '06 Nov 2026', retries: this.fr() };
    this.store.hooks.update((l) => [h, ...l]);
    this.selId.set(h.id);
    this.form.set(false);
    this.t.show(`Webhook "${h.name}" created — subscribed to ${h.events.length} events`);
  }
}

/* =====================================================================
   Data Mapping & Transformation
   ===================================================================== */
const ROW_H = 38;
const LOOKUP: Record<string, Record<string, string>> = {
  'Lookup: Department': { 'SUP-HR-01': 'Human Resources', 'SUP-OPS-02': 'Operations' },
  'Lookup: Site': { 'LOC-DXB-HQ': 'Head Office', 'Head Office': 'HO-PARTITION-01' },
};
function applyT(v: string, t: string) {
  switch (t) {
    case 'Uppercase': return v.toUpperCase();
    case 'Lowercase': return v.toLowerCase().trim();
    case 'Trim': return v.replace(/\s+/g, '').trim();
    case 'Title Case': return v.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    case 'Date → ISO 8601': { const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : v; }
    case 'Phone → E.164': return '+971' + v.replace(/\D/g, '').replace(/^0/, '');
    case 'Default value': return v || 'N/A';
    case 'Concatenate': return v + ' (combined)';
    default: return LOOKUP[t]?.[v] ?? (t.startsWith('Lookup') ? `⚠ no match for ${v}` : v);
  }
}
@Component({
  selector: 'app-integrations-data-mapping-transformation',
  imports: [...UI, IntLogo, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Data Mapping &amp; Transformation" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Map source fields to People360 fields and define transformations for every integration.">
      <button class="btn-ghost" (click)="autoMap()"><app-icon name="sparkles" [size]="15" />Auto-map</button>
      <button class="btn-ghost" (click)="validate()"><app-icon name="shield-check" [size]="15" />Validate</button>
      <button class="btn-primary" (click)="save()"><app-icon name="file-check" [size]="15" />Save v{{ cur().version + 1 }}</button>
    </app-page-head>

    <section class="dm">
      <aside class="card prof">
        <h3>Mapping profiles</h3>
        @for (p of store.profiles(); track p.id) {
          <button class="pp" [class.on]="pid() === p.id" (click)="pid.set(p.id); selSrc.set(null)">
            <app-int-logo [it]="byId(p.integId)" [size]="30" /><div><b>{{ p.name }}</b><small>{{ p.direction }} · {{ p.object }} · v{{ p.version }}</small></div>
          </button>
        }
        <div class="stat">
          <div><b>{{ cur().rules.length }}</b><small>mapped</small></div>
          <div><b [class.bad]="missingReq().length">{{ missingReq().length }}</b><small>required missing</small></div>
          <div><b>{{ unmappedSrc() }}</b><small>unused source</small></div>
        </div>
      </aside>

      <div class="card mapper">
        <div class="card-head"><h3>{{ cur().name }}</h3><span class="muted sm">Click a source field, then a target field to connect. Click a line to remove it.</span></div>
        <div class="cols" [style.height.px]="height()">
          <div class="fcol">
            <div class="fh">{{ srcLabel() }}</div>
            @for (f of cur().sourceFields; track f.name) {
              <button class="fld src" [class.on]="selSrc() === f.name" [class.used]="usedSrc().has(f.name)" (click)="selSrc.set(selSrc() === f.name ? null : f.name)"><b>{{ f.name }}</b><small>{{ f.type }}</small><i></i></button>
            }
          </div>
          <svg class="lines" [attr.viewBox]="'0 0 160 ' + height()" preserveAspectRatio="none">
            @for (r of cur().rules; track r.id) {
              @let y1 = yOf(srcIdx(r.source)); @let y2 = yOf(tgtIdx(r.target));
              <path [attr.d]="'M0,' + y1 + ' C80,' + y1 + ' 80,' + y2 + ' 160,' + y2" [attr.stroke]="r.transform === 'None' ? 'var(--ka-a78bfa)' : 'var(--ka-22c55e)'" stroke-width="2" fill="none" class="ln" (click)="removeRule(r)"><title>{{ r.source }} → {{ r.target }} ({{ r.transform }}) — click to remove</title></path>
            }
          </svg>
          <div class="fcol">
            <div class="fh">{{ tgtLabel() }}</div>
            @for (f of cur().targetFields; track f.name) {
              <button class="fld tgt" [class.used]="usedTgt().has(f.name)" [class.miss]="f.required && !usedTgt().has(f.name)" [class.ready]="!!selSrc()" (click)="connectTo(f.name)"><i></i><b>{{ f.name }}@if (f.required) {<em>*</em>}</b><small>{{ f.type }}</small></button>
            }
          </div>
        </div>
        <div class="lg"><span><i style="background:var(--kb-a78bfa)"></i>Direct</span><span><i style="background:var(--kb-22c55e)"></i>With transformation</span><span><i style="background:var(--kb-ef4444)"></i>Required, unmapped</span></div>

        <h4>Transformation rules</h4>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Source</th><th>Transformation</th><th>Target</th><th>Sample out</th><th></th></tr></thead>
          <tbody>
            @for (r of cur().rules; track r.id) {
              <tr>
                <td><code>{{ r.source }}</code></td>
                <td><select class="select sm" [value]="r.transform" (change)="setT(r, $any($event.target).value)">@for (t of transforms; track t) {<option [value]="t">{{ t }}</option>}</select></td>
                <td><code>{{ r.target }}</code></td>
                <td [title]="'in: ' + sample(r.source)"><b>"{{ out(r) }}"</b></td>
                <td><button class="link danger" (click)="removeRule(r)">Remove</button></td>
              </tr>
            }
          </tbody>
        </table></div>
      </div>

      <aside class="card prev">
        <h3>Preview</h3>
        <small class="muted">Sample source record</small>
        <pre class="src-j">{{ srcRecord() | json }}</pre>
        <small class="muted">Transformed {{ tgtLabel() }} record</small>
        <pre class="json">{{ outRecord() | json }}</pre>
        @if (issues().length) {
          <ul class="iss">@for (i of issues(); track i) {<li><app-icon name="triangle-alert" [size]="13" />{{ i }}</li>}</ul>
        } @else {<p class="okm"><app-icon name="integrations-check" [size]="15" />Mapping valid — ready to save</p>}
      </aside>
    </section>
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .dm { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
    h3 { margin: 0 0 10px; font-size: 15px; } h4 { margin: 16px 0 6px; font-size: 13px; } .sm { font-size: 12px; } code { font-size: 12px; } .danger { color: var(--red); }
    .prof { display: flex; flex-direction: column; gap: 6px; }
    .pp { display: grid; grid-template-columns: 30px 1fr; gap: 9px; align-items: center; padding: 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); text-align: left; cursor: pointer; font: inherit; }
    .pp.on { border-color: var(--primary); background: var(--kb-faf8ff); } .pp div { display: flex; flex-direction: column; font-size: 12px; } .pp small { color: var(--muted); font-size: 11px; }
    .stat { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; } .stat div { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: 8px; background: var(--kb-f6f6fb); } .stat b { font-size: 17px; } .stat small { font-size: 10px; color: var(--muted); text-align: center; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 160px minmax(0, 1fr); }
    .fcol { display: flex; flex-direction: column; }
    .fh { height: 38px; display: flex; align-items: center; font-size: 12px; font-weight: 600; color: var(--kf-4b4f6b); text-transform: uppercase; letter-spacing: .4px; }
    .fld { position: relative; height: 32px; margin: 3px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--kb-ffffff); font: inherit; font-size: 12px; cursor: pointer; }
    .fld small { color: var(--muted); font-size: 10.5px; } .fld b { font-weight: 500; font-family: ui-monospace, monospace; font-size: 11.5px; } .fld em { color: var(--kf-ef4444); font-style: normal; }
    .fld i { position: absolute; top: 50%; width: 9px; height: 9px; margin-top: -5px; border-radius: 50%; background: var(--kb-ffffff); border: 2px solid var(--kl-c4b5fd); } .src i { right: -6px; } .tgt i { left: -6px; }
    .fld.used { background: var(--kb-faf8ff); border-color: var(--kl-ddd6fe); } .fld.used i { background: var(--kb-a78bfa); }
    .fld.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .fld.miss { border-color: var(--kl-fca5a5); background: var(--kb-fff5f5); } .fld.miss i { border-color: var(--kl-ef4444); }
    .fld.tgt.ready:hover { border-color: var(--primary); background: var(--primary-soft); }
    .lines { width: 160px; height: 100%; } .ln { cursor: pointer; } .ln:hover { stroke: var(--kl-ef4444); stroke-width: 3; }
    .lg { display: flex; gap: 14px; font-size: 11.5px; color: var(--muted); margin-top: 8px; } .lg span { display: flex; gap: 5px; align-items: center; } .lg i { width: 14px; height: 3px; border-radius: 2px; }
    .select.sm { padding: 4px 8px; font-size: 12px; }
    .prev { position: sticky; top: 76px; } pre { margin: 4px 0 10px; padding: 10px; border-radius: 8px; font-size: 11.5px; overflow: auto; max-height: 260px; }
    .prev pre { white-space: pre-wrap; word-break: break-all; } .src-j { background: var(--kb-f6f6fb); color: var(--kf-3b3f5c); } .json { background: var(--kb-12142b); color: var(--kf-c4f1be); }
    .iss { list-style: none; padding: 0; margin: 0; } .iss li { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--kf-b45309); padding: 3px 0; }
    .okm { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--kf-15803d); margin: 0; }
    @media (max-width: 1400px) { .dm { grid-template-columns: 240px minmax(0, 1fr); } .prev { grid-column: 1 / -1; position: static; } }
  `,
})
export class DataMappingTransformation {
  protected readonly store = inject(IntegrationStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly byId = integ;
  protected readonly transforms = TRANSFORMS;
  protected readonly pid = signal(this.route.snapshot.queryParamMap.get('profile') ?? 'MP-1');
  protected readonly selSrc = signal<string | null>(null);
  protected readonly cur = computed(() => this.store.profiles().find((p) => p.id === this.pid()) ?? this.store.profiles()[0]);
  protected readonly srcLabel = computed(() => (this.cur().direction === 'Inbound' ? integ(this.cur().integId).name : 'People360'));
  protected readonly tgtLabel = computed(() => (this.cur().direction === 'Inbound' ? 'People360' : integ(this.cur().integId).name));
  protected readonly height = computed(() => (Math.max(this.cur().sourceFields.length, this.cur().targetFields.length) + 1) * ROW_H);
  protected readonly usedSrc = computed(() => new Set(this.cur().rules.map((r) => r.source)));
  protected readonly usedTgt = computed(() => new Set(this.cur().rules.map((r) => r.target)));
  protected readonly missingReq = computed(() => this.cur().targetFields.filter((f) => f.required && !this.usedTgt().has(f.name)).map((f) => f.name));
  protected readonly unmappedSrc = computed(() => this.cur().sourceFields.filter((f) => !this.usedSrc().has(f.name)).length);
  protected readonly srcRecord = computed(() => Object.fromEntries(this.cur().sourceFields.map((f) => [f.name, f.sample])));
  protected readonly outRecord = computed(() => Object.fromEntries(this.cur().rules.map((r) => [r.target, this.out(r)])));
  protected readonly issues = computed(() => [
    ...this.missingReq().map((f) => `Required field "${f}" is not mapped`),
    ...this.cur().rules.filter((r) => this.out(r).startsWith('⚠')).map((r) => `${r.target}: lookup has no match`),
  ]);

  protected yOf(i: number) {
    return (i + 1) * ROW_H + ROW_H / 2;
  }
  protected srcIdx(n: string) {
    return this.cur().sourceFields.findIndex((f) => f.name === n);
  }
  protected tgtIdx(n: string) {
    return this.cur().targetFields.findIndex((f) => f.name === n);
  }
  protected sample(src: string) {
    return this.cur().sourceFields.find((f) => f.name === src)?.sample ?? '';
  }
  protected out(r: MapRule) {
    return applyT(this.sample(r.source), r.transform);
  }
  private update(fn: (p: MapProfile) => MapProfile) {
    this.store.profiles.update((l) => l.map((p) => (p.id === this.cur().id ? fn(p) : p)));
  }
  protected connectTo(target: string) {
    const s = this.selSrc();
    if (!s) return this.t.show('Select a source field first');
    this.update((p) => ({ ...p, rules: [...p.rules.filter((r) => r.target !== target), { id: `r${Date.now()}`, source: s, target, transform: 'None' }] }));
    this.selSrc.set(null);
  }
  protected removeRule(r: MapRule) {
    this.update((p) => ({ ...p, rules: p.rules.filter((x) => x.id !== r.id) }));
  }
  protected setT(r: MapRule, tr: string) {
    this.update((p) => ({ ...p, rules: p.rules.map((x) => (x.id === r.id ? { ...x, transform: tr } : x)) }));
  }
  protected autoMap() {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/^(legal|work|business)/, '');
    const syn: Record<string, string> = { mobilephone: 'mobile', managerid: 'managerid', title: 'jobtitle' };
    let n = 0;
    this.update((p) => {
      const rules = [...p.rules];
      for (const tf of p.targetFields) {
        if (rules.some((r) => r.target === tf.name)) continue;
        const src = p.sourceFields.find((sf) => !rules.some((r) => r.source === sf.name) && (syn[norm(sf.name)] ?? norm(sf.name)).includes(norm(tf.name).slice(0, 6)));
        if (src) {
          rules.push({ id: `r${Date.now()}${n++}`, source: src.name, target: tf.name, transform: tf.type === 'phone' ? 'Phone → E.164' : 'None' });
        }
      }
      return { ...p, rules };
    });
    this.t.show(n ? `Auto-mapped ${n} field${n > 1 ? 's' : ''} by name similarity` : 'No further fields could be matched automatically');
  }
  protected validate() {
    const i = this.issues();
    this.t.show(i.length ? `${i.length} issue(s): ${i[0]}` : 'Validation passed — 5 sample records transformed without errors');
  }
  protected save() {
    if (this.missingReq().length) return this.t.show(`Cannot save: map required field "${this.missingReq()[0]}" first`);
    this.update((p) => ({ ...p, version: p.version + 1, updated: '06 Nov 2026' }));
    this.t.show(`${this.cur().name} saved as v${this.cur().version} · applied from next sync`);
  }
}
