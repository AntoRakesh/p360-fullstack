import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { ConnectWizard, IntBadge, IntLogo, useToast } from './integrations-shared';
import { CATEGORIES, Integ, integ, INTEGRATIONS, IntegrationStore } from './integrations.data';

const TABS = ['Overview', 'Features', 'Requirements', 'Support'] as const;
const SORTS = ['Most Popular', 'Name (A–Z)', 'Name (Z–A)', 'Recently Updated', 'Vendor'];
const FEATURED = [
  { id: 'hr', title: 'End-to-End HR Ecosystem', text: 'Connect your HR, payroll, access and learning systems.', icon: 'integrations-solution-hr', color: 'var(--ka-8b5cf6)', ids: ['sap', 'oracle', 'ad', 'entra', 'krystal', 'hid'] },
  { id: 'sec', title: 'Unified Security Integration', text: 'Integrate access control, video, visitor and emergency systems.', icon: 'shield-check', color: 'var(--ka-10b981)', ids: ['hid', 'genetec', 'lenel', 'axis', 'hytera', 'twilio'] },
  { id: 'fac', title: 'Workplace & Facility Integration', text: 'Connect BMS, space management and IoT sensors.', icon: 'building', color: 'var(--ka-8b5cf6)', ids: ['desigo', 'metasys', 'milesight', 'teltonika', 'gmaps'] },
];

@Component({
  selector: 'app-integrations-integration-marketplace',
  imports: [...UI, IntLogo, IntBadge, ConnectWizard, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Integration Marketplace" parent="Integrations &amp; API Hub" parentLink="/integrations-api-hub" subtitle="Connect People360 with your existing systems. Browse pre-built integrations or create custom integrations.">
      <button class="btn-primary big" (click)="openRequest()"><app-icon name="plus" [size]="17" />Request Integration</button>
    </app-page-head>

    <section class="mk-kpis">
      <button class="card mk" (click)="clearFilters()"><span class="mi" style="background:var(--kb-2563eb)"><app-icon name="integrations-link" [size]="26" /></span><div><b>50+</b><strong>Pre-built Integrations</strong><small>HR, Access, ERP, IT and more</small></div></button>
      <button class="card mk" (click)="go('connected-systems')"><span class="mi" style="background:var(--kb-10b981)"><app-icon name="integrations-active" [size]="26" /></span><div><b>{{ store.health().total }}</b><strong>Active Integrations</strong><small>Across all sites</small></div></button>
      <button class="card mk" (click)="scrollTo('cats')"><span class="mi" style="background:var(--kb-2563eb)"><app-icon name="integrations-cats" [size]="26" /></span><div><b>12</b><strong>Categories</strong><small>Find the right connector</small></div></button>
      <button class="card mk" (click)="go('sync-logs-monitoring')"><span class="mi" style="background:var(--kb-8b5cf6)"><app-icon name="integrations-uptime" [size]="26" /></span><div><b>99.9%</b><strong>Integration Uptime</strong><small>Reliable and secure</small></div></button>
      <button class="card mk" (click)="go('api-management')"><span class="mi" style="background:var(--kb-f59e0b)"><app-icon name="integrations-doc" [size]="26" /></span><div><b>Supported</b><strong>REST, SOAP, SFTP</strong><small>Open APIs &amp; Webhooks</small></div></button>
    </section>

    <section class="card bar">
      <label class="search-box sb"><app-icon name="search" [size]="16" /><input placeholder="Search integrations (e.g. SAP, Active Directory, Avaya)..." [value]="q()" (input)="q.set($any($event.target).value); page.set(1)" /></label>
      <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value); page.set(1)"><option value="All">All Categories</option>@for (c of cats; track c.name) {<option [value]="c.name">{{ c.name }}</option>}</select>
      <select class="select" [value]="status()" (change)="status.set($any($event.target).value); page.set(1)"><option value="All">All Status</option><option>Certified</option><option>Popular</option><option>Connected</option><option>Not Connected</option></select>
      <select class="select" [value]="vendor()" (change)="vendor.set($any($event.target).value); page.set(1)"><option value="All">All Vendors</option>@for (v of vendors; track v) {<option [value]="v">{{ v }}</option>}</select>
      <span class="sp"></span>
      <span class="sl">Sort by</span>
      <select class="select srt" [value]="sort()" (change)="sort.set($any($event.target).value)">@for (s of sorts; track s) {<option [value]="s">{{ s }}</option>}</select>
      <div class="vt">
        <button [class.on]="view() === 'grid'" (click)="view.set('grid')" aria-label="Grid view"><app-icon name="integrations-grid4" [size]="16" /></button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')" aria-label="List view"><app-icon name="integrations-list" [size]="16" /></button>
      </div>
    </section>

    <section class="body" [class.nod]="!sel()">
      <aside class="card cats" id="cats">
        <h3>Categories</h3>
        <button class="ct" [class.on]="cat() === 'All'" (click)="cat.set('All'); page.set(1)"><app-icon name="integrations-grid4" [size]="17" /><span>All Integrations</span><em>50+</em></button>
        @for (c of cats; track c.name) {
          <button class="ct" [class.on]="cat() === c.name" (click)="cat.set(c.name); page.set(1)"><app-icon [name]="c.icon" [size]="17" /><span>{{ c.name }}</span><em>{{ catCount(c.name) }}</em></button>
        }
      </aside>

      <div class="card mid">
        @if (view() === 'grid') {
          @if (popular().length) {
            <div class="sh"><h3>Popular Integrations</h3><button class="link" (click)="popAll.set(!popAll())">{{ popAll() ? 'Show Less' : 'View All' }}</button></div>
            <div class="grid">
              @for (it of popular(); track it.id; let i = $index) {
                <div class="ic pc" [class.on]="selId() === it.id" (click)="select(it)">
                  <div class="pt"><app-int-logo [it]="it" [size]="38" />@if (i === 0 && !popAll()) {<span class="corner">{{ it.badge }}</span>}</div>
                  <b>{{ it.name }}</b><small>{{ it.sub }}</small>
                  @if (i !== 0 || popAll()) {<app-int-badge [kind]="it.badge" />}
                  <p>{{ it.desc }}</p>
                  <ng-container *ngTemplateOutlet="cbtn; context: { $implicit: it }" />
                </div>
              }
            </div>
          }
          <div class="sh s2"><h3>All Integrations <span class="cnt">{{ rest().length }}</span></h3><button class="link" (click)="allMode.set(!allMode())">{{ allMode() ? 'Show Less' : 'View All' }}</button></div>
          <div class="grid">
            @for (it of shown(); track it.id) {
              <div class="ic ac" [class.on]="selId() === it.id" (click)="select(it)">
                <div class="at"><app-int-logo [it]="it" [size]="38" /><div><b>{{ it.name }}</b><small>{{ it.sub }}</small></div></div>
                <app-int-badge [kind]="it.badge" />
                <p>{{ it.desc }}</p>
                <ng-container *ngTemplateOutlet="cbtn; context: { $implicit: it }" />
              </div>
            } @empty {
              <p class="empty">No integrations match these filters. <button class="link" (click)="clearFilters()">Clear filters</button> or <button class="link" (click)="openRequest()">request one</button>.</p>
            }
          </div>
          @if (!allMode() && pages() > 1) {
            <div class="pg">
              <button class="pgb" [disabled]="page() === 1" (click)="page.set(page() - 1)">‹</button>
              @for (p of pageList(); track p) {<button class="pgb" [class.on]="p === page()" (click)="page.set(p)">{{ p }}</button>}
              <button class="pgb" [disabled]="page() === pages()" (click)="page.set(page() + 1)">›</button>
            </div>
          }
        } @else {
          <div class="sh"><h3>{{ filtered().length }} integrations</h3><button class="link" (click)="exportCsv()">Export CSV</button></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Integration</th><th>Category</th><th>Vendor</th><th>Methods</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (it of filtered(); track it.id) {
                  <tr class="clickable" [class.selected]="selId() === it.id" (click)="select(it)">
                    <td><div class="tn"><app-int-logo [it]="it" [size]="28" /><b>{{ it.name }}</b></div></td>
                    <td>{{ it.sub }}</td><td>{{ it.vendor }}</td><td>{{ it.methods }}</td>
                    <td>@if (connected().has(it.id)) {<span class="tag green">Connected</span>} @else {<app-int-badge [kind]="it.badge" />}</td>
                    <td><ng-container *ngTemplateOutlet="cbtn; context: { $implicit: it }" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      @if (sel(); as it) {
        <aside class="card det">
          <div class="dh">
            <app-int-logo [it]="it" [size]="52" />
            <div><h2>{{ it.name }}</h2><app-int-badge [kind]="it.badge" /></div>
            <div class="dr">
              <button class="close-btn" (click)="selId.set(null)" aria-label="Close">×</button>
              @if (connected().has(it.id)) {
                <button class="btn-ghost conn-on" (click)="go('connected-systems')"><app-icon name="integrations-check" [size]="15" />Manage</button>
              } @else {
                <button class="btn-primary dconn" (click)="wiz.set(it)">Connect</button>
              }
            </div>
          </div>
          <nav class="dt">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</nav>
          @switch (tab()) {
            @case ('Overview') {
              <p class="lead">{{ it.long }}</p>
              <div class="chips">@for (t of it.tags; track t) {<span>{{ t }}</span>}</div>
              <h4>Key Features</h4>
              <ul class="kf">@for (f of it.features; track f) {<li><span class="ck">✓</span>{{ f }}</li>}</ul>
              <h4>Integration Details</h4>
              <dl class="dl">
                <dt>Category</dt><dd>{{ it.domain }}</dd>
                <dt>Vendor</dt><dd>{{ it.vendor }}</dd>
                <dt>Supported Methods</dt><dd>{{ it.methods }}</dd>
                <dt>Authentication</dt><dd>{{ it.auth }}</dd>
                <dt>Data Sync</dt><dd>{{ it.sync }}</dd>
                <dt>Status</dt><dd>{{ connected().has(it.id) ? 'Connected' : it.badge === 'Popular' ? 'Certified · Popular' : 'Certified' }}</dd>
                <dt>Version</dt><dd>{{ it.version }}</dd>
                <dt>Last Updated</dt><dd>{{ it.updated }}</dd>
              </dl>
              <button class="btn-outline doc" (click)="docOpen.set(true)">View Documentation <app-icon name="integrations-external" [size]="15" /></button>
            }
            @case ('Features') {
              <h4>Supported data objects</h4>
              <table class="table sm">
                <thead><tr><th>Object</th><th>Direction</th><th>Sync</th></tr></thead>
                <tbody>@for (o of it.objects; track o; let i = $index) {<tr><td>{{ o }}</td><td>{{ i % 3 === 2 ? 'Outbound' : i % 2 ? 'Bi-directional' : 'Inbound' }}</td><td>{{ it.sync.split(' / ')[i % 2] ?? it.sync }}</td></tr>}</tbody>
              </table>
              <h4>Capabilities</h4>
              <ul class="kf">@for (f of it.features; track f) {<li><span class="ck">✓</span>{{ f }}</li>}</ul>
            }
            @case ('Requirements') {
              <ul class="req">
                <li><b>{{ it.vendor }} subscription</b><small>Active tenant with API access enabled</small></li>
                <li><b>Service account</b><small>{{ it.auth }} credentials with read{{ it.tags[1] === 'Bi-directional Sync' ? '/write' : '' }} permission</small></li>
                <li><b>Network</b><small>Outbound HTTPS 443 to People360 cloud; IP allow-list 20.46.12.0/24</small></li>
                <li><b>People360 licence</b><small>Integrations &amp; API Hub module (Enterprise)</small></li>
                <li><b>Data owner approval</b><small>Required for {{ it.objects.slice(0, 2).join(' & ') }} data</small></li>
              </ul>
            }
            @case ('Support') {
              <ul class="req">
                <li><b>Support tier</b><small>{{ it.badge === 'Certified' ? 'Certified connector · People360 L1–L3 support' : 'Popular connector · vendor + People360 support' }}</small></li>
                <li><b>SLA</b><small>P1 response 30 min · 99.9% connector uptime</small></li>
                <li><b>Contact</b><small>integrations&#64;people360.demo · +971 4 000 3600</small></li>
              </ul>
              <h4>Changelog</h4>
              <ul class="req">
                <li><b>{{ it.version }} · {{ it.updated }}</b><small>Improved delta detection, retry with back-off</small></li>
                <li><b>v1.9 · 02 Jul 2026</b><small>Custom field mapping, new site lookup</small></li>
              </ul>
              <button class="btn-ghost" (click)="ticket(it)">Open support ticket</button>
            }
          }
        </aside>
      }
    </section>

    <section class="card feat">
      <h3>Featured Solutions</h3>
      <div class="fs">
        @for (f of featured; track f.id) {
          <div class="fi">
            <span class="fic" [style.background]="f.color"><app-icon [name]="f.icon" [size]="24" /></span>
            <div><b>{{ f.title }}</b><small>{{ f.text }}</small><button class="link vs" (click)="sol.set(f)">View Solution <app-icon name="integrations-arrow-right" [size]="14" /></button></div>
          </div>
        }
      </div>
    </section>

    <ng-template #cbtn let-it>
      @if (connected().has(it.id)) {
        <button class="cb on" (click)="$event.stopPropagation(); go('connected-systems')">✓ Connected</button>
      } @else {
        <button class="cb" (click)="$event.stopPropagation(); wiz.set(it)">Connect</button>
      }
    </ng-template>

    @if (wiz(); as it) {
      <app-connect-wizard [it]="it" (closed)="wiz.set(null)" (done)="connected$(it)" />
    }

    @if (docOpen() && sel(); as it) {
      <div class="g-overlay" (click)="docOpen.set(false)"></div>
      <aside class="g-drawer wide doc-d">
        <div class="modal-head"><h3>{{ it.name }} — Documentation</h3><button class="close-btn" (click)="docOpen.set(false)">×</button></div>
        <h4>1. Prerequisites</h4><p>Create a service account in {{ it.vendor }} with {{ it.auth }} access and API permissions for {{ it.objects.join(', ') }}.</p>
        <h4>2. Authentication</h4><p>People360 supports {{ it.auth }}. Tokens are refreshed automatically and stored in the encrypted vault.</p>
        <pre>POST https://{{ it.id }}.tenant.example.com/oauth/token
grant_type=client_credentials
client_id=people360-connector
scope=api.read api.write</pre>
        <h4>3. Data objects</h4>
        <table class="table sm"><thead><tr><th>Object</th><th>People360 entity</th><th>Key</th></tr></thead>
          <tbody>@for (o of it.objects; track o) {<tr><td>{{ o }}</td><td>{{ entity(o) }}</td><td>externalId</td></tr>}</tbody></table>
        <h4>4. Sync behaviour</h4><p>{{ it.sync }} sync using {{ it.methods }}. Failed records are retried 3× with exponential back-off, then routed to the dead-letter queue visible in Sync Logs &amp; Monitoring.</p>
        <h4>5. Rate limits</h4><p>Default 600 requests/min per tenant; burst 1,200.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="go('api-management')">Open API Reference</button><button class="btn-ghost" (click)="go('data-mapping-transformation')">Field mapping</button><button class="btn-primary" (click)="docOpen.set(false); wiz.set(it)" [disabled]="connected().has(it.id)">Connect</button></div>
      </aside>
    }

    @if (sol(); as f) {
      <div class="g-overlay" (click)="sol.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>{{ f.title }}</h3><button class="close-btn" (click)="sol.set(null)">×</button></div>
        <p class="muted">{{ f.text }} Deploying the solution installs each connector with recommended defaults (all sites, recommended sync mode).</p>
        <ul class="sl-list">
          @for (id of f.ids; track id) {
            @let it = byId(id);
            <li><app-int-logo [it]="it" [size]="32" /><div><b>{{ it.name }}</b><small>{{ it.sub }}</small></div>
              @if (connected().has(id)) {<span class="tag green">Connected</span>} @else {<span class="tag grey">Not connected</span>}</li>
          }
        </ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="sol.set(null); go('integration-templates')">Browse templates</button>
          <button class="btn-primary" [disabled]="missing(f.ids) === 0" (click)="deploy(f)">{{ missing(f.ids) === 0 ? 'All connected' : 'Deploy solution (' + missing(f.ids) + ' connectors)' }}</button>
        </div>
      </div>
    }

    @if (req()) {
      <div class="g-overlay" (click)="req.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); submitReq()">
        <div class="modal-head"><h3>Request Integration</h3><button type="button" class="close-btn" (click)="req.set(false)">×</button></div>
        <div class="form-grid">
          <label>System / product name *<input class="input" [value]="rf().name" (input)="setR('name', $any($event.target).value)" /></label>
          <label>Vendor<input class="input" [value]="rf().vendor" (input)="setR('vendor', $any($event.target).value)" /></label>
          <label>Category<select class="select" [value]="rf().category" (change)="setR('category', $any($event.target).value)">@for (c of cats; track c.name) {<option [value]="c.name">{{ c.name }}</option>}</select></label>
          <label>Priority<select class="select" [value]="rf().priority" (change)="setR('priority', $any($event.target).value)"><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label class="full">Use case *<textarea class="input" rows="3" [value]="rf().useCase" (input)="setR('useCase', $any($event.target).value)" placeholder="What data should flow, in which direction, how often?"></textarea></label>
        </div>
        @if (store.requests().length) {<p class="muted sm">Your open requests: @for (r of store.requests(); track r.id) {<span class="tag blue">{{ r.id }} · {{ r.name }}</span> }</p>}
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="req.set(false)">Cancel</button><button class="btn-primary" type="submit">Submit request</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .big { padding: 11px 20px; font-size: 13px; }
    .mk-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .mk { display: flex; gap: 12px; align-items: center; padding: 12px; text-align: left; cursor: pointer; font: inherit; color: inherit; }
    .mk:hover { border-color: var(--kl-c4b5fd); }
    .mi { width: 50px; height: 50px; flex-shrink: 0; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .mk div { display: flex; flex-direction: column; min-width: 0; } .mk b { font-size: 18px; font-weight: 700; } .mk strong { font-size: 13px; font-weight: 500; margin-top: 2px; white-space: nowrap; }
    .mk small { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar { display: flex; gap: 10px; align-items: center; padding: 10px 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .sb { flex: 1 1 300px; min-width: 200px; } .sb input { width: 100%; }
    .bar { flex-wrap: nowrap; } .bar .select { width: 150px; font-size: 12.5px; flex-shrink: 1; min-width: 110px; } .bar > .select:nth-of-type(3) { width: 196px; }
    @media (max-width: 1400px) { .bar { flex-wrap: wrap; } }
    .sp { flex: 1; } .sl { font-size: 12.5px; color: var(--kf-4b4f6b); white-space: nowrap; } .srt { min-width: 140px; }
    .vt { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .vt button { border: 0; background: var(--kb-ffffff); padding: 7px 10px; cursor: pointer; color: var(--kf-4b4f6b); display: grid; } .vt button + button { border-left: 1px solid var(--border); }
    .vt button.on { background: var(--primary-soft); color: var(--primary); }
    .body { display: grid; grid-template-columns: 236px minmax(0, 1fr) 330px; gap: 12px; align-items: start; margin-bottom: 12px; }
    .body.nod { grid-template-columns: 236px minmax(0, 1fr); }
    h3 { margin: 0 0 10px; font-size: 16px; letter-spacing: -0.2px; }
    .cats { padding: 14px 10px; display: flex; flex-direction: column; gap: 2px; } .cats h3 { padding: 0 6px; }
    .ct { display: grid; grid-template-columns: 20px 1fr auto; gap: 10px; align-items: center; padding: 8px 8px; border: 0; border-left: 3px solid transparent; border-radius: 6px; background: none; font: inherit; font-size: 11.5px; color: var(--kf-2b2e4a); cursor: pointer; text-align: left; }
    .ct span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ct app-icon { color: var(--kf-4b4f6b); } .ct em { font-style: normal; font-size: 11px; color: var(--kf-4b4f6b); min-width: 22px; text-align: center; padding: 1px 5px; border-radius: 5px; }
    .ct:hover { background: var(--kb-f7f5ff); } .ct.on { background: var(--primary-soft); border-left-color: var(--primary); color: var(--primary); } .ct.on app-icon { color: var(--primary); } .ct.on em { background: var(--kb-ffffff); border: 1px solid var(--kl-ddd6fe); }
    .mid { padding: 14px 14px 16px; }
    .sh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .sh h3 { margin: 0; } .s2 { margin-top: 20px; }
    .cnt { font-size: 11px; font-weight: 500; color: var(--muted); margin-left: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .ic { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; min-width: 0; transition: border-color .15s, box-shadow .15s; }
    .ic:hover { border-color: var(--kl-c4b5fd); } .ic.on { border-color: var(--kl-a78bfa); box-shadow: 0 0 0 2px var(--kb-ede9fe); }
    .ic b { font-size: 12.5px; } .ic small { font-size: 10.5px; color: var(--muted); line-height: 1.35; } .ic app-int-badge { margin: 4px 0 2px; }
    .ic p { margin: 4px 0 8px; font-size: 11px; color: var(--kf-5b5f7b); line-height: 1.45; flex: 1; }
    .pt { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
    .corner { font-size: 10px; padding: 2px 7px; border-radius: 4px; background: var(--kb-e8f8ee); color: var(--kf-15803d); }
    .at { display: grid; grid-template-columns: 38px 1fr; gap: 9px; align-items: start; } .at div { display: flex; flex-direction: column; min-width: 0; }
    .cb { width: 100%; padding: 6px; border: 1px solid var(--kl-a78bfa); border-radius: 6px; background: var(--kb-ffffff); color: var(--primary); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
    .cb:hover { background: var(--primary-soft); } .cb.on { border-color: var(--kl-86efac); color: var(--kf-15803d); background: var(--kb-f0fdf4); }
    td .cb { width: auto; padding: 4px 14px; }
    .empty { grid-column: 1 / -1; font-size: 13px; color: var(--muted); }
    .pg { display: flex; justify-content: center; gap: 4px; margin-top: 12px; }
    .pgb { min-width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); cursor: pointer; font-size: 12px; } .pgb.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); } .pgb:disabled { opacity: .4; cursor: default; }
    .tn { display: flex; gap: 8px; align-items: center; }
    .det { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
    .dh { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; } .dh h2 { margin: 0 0 6px; font-size: 16px; } .dh div { display: flex; flex-direction: column; align-items: flex-start; }
    .dh .close-btn { margin-top: -4px; }
    .dh .dr { align-items: flex-end; gap: 2px; } .dconn { padding: 8px 30px; } .conn-on { color: var(--kf-15803d); border-color: var(--kl-86efac); }
    .dt { display: flex; border-bottom: 1px solid var(--border); margin-top: 6px; }
    .dt button { flex: 1; border: 0; background: none; padding: 8px 4px; font: inherit; font-size: 12px; color: var(--kf-4b4f6b); cursor: pointer; border-bottom: 2px solid transparent; }
    .dt button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; background: var(--kb-faf8ff); }
    .lead { margin: 2px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--kf-2b2e4a); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; } .chips span { font-size: 10.5px; padding: 3px 8px; border-radius: 4px; background: var(--kb-eef2ff); color: var(--kf-3730a3); }
    h4 { margin: 6px 0 2px; font-size: 13px; }
    .kf { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; } .kf li { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--kf-2b2e4a); }
    .ck { width: 16px; height: 16px; border-radius: 50%; background: var(--kb-22c55e); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
    .dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin: 0; font-size: 12px; } .dl dt { color: var(--kf-4b4f6b); } .dl dd { margin: 0; color: var(--kf-2b2e4a); }
    .doc { justify-content: center; margin-top: 4px; padding: 9px; }
    .req { list-style: none; padding: 0; margin: 0; } .req li { display: flex; flex-direction: column; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .req small { color: var(--muted); }
    .table.sm { font-size: 12px; } .table.sm td, .table.sm th { padding: 6px 8px; }
    .feat { padding: 14px 16px; } .feat h3 { margin-bottom: 10px; }
    .fs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .fi { display: flex; gap: 18px; align-items: center; padding: 12px 16px; border: 1px solid var(--border); border-radius: 10px; }
    .fic { width: 52px; height: 52px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .fi div { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .fi b { font-size: 13px; } .fi small { font-size: 11.5px; color: var(--kf-5b5f7b); }
    .vs { display: inline-flex; gap: 6px; align-items: center; margin-top: 6px; font-size: 12px; align-self: flex-start; }
    .doc-d h4 { margin-top: 14px; } .doc-d p { font-size: 13px; color: var(--kf-3b3f5c); line-height: 1.55; margin: 4px 0; }
    pre { background: var(--kb-12142b); color: var(--kf-e2e8f0); padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; }
    .sl-list { list-style: none; padding: 0; margin: 10px 0; } .sl-list li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .sl-list div { display: flex; flex-direction: column; font-size: 13px; } .sl-list small { color: var(--muted); font-size: 11.5px; }
    .muted.sm { font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 12px; }
    textarea.input { resize: vertical; cursor: text; }
    @media (max-width: 1500px) { .body { grid-template-columns: 210px minmax(0, 1fr) 310px; } .mk-kpis { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); } }
    @media (max-width: 1300px) { .body, .body.nod { grid-template-columns: 1fr; } .det { position: static; max-height: none; } .fs { grid-template-columns: 1fr; } }
  `,
})
export class IntegrationMarketplace {
  protected readonly store = inject(IntegrationStore);
  private readonly router = inject(Router);
  protected readonly t = useToast();
  protected readonly catalog = INTEGRATIONS;
  protected readonly cats = CATEGORIES;
  protected readonly sorts = SORTS;
  protected readonly tabs = TABS;
  protected readonly featured = FEATURED;
  protected readonly vendors = [...new Set(INTEGRATIONS.map((i) => i.vendor))].sort();
  protected readonly byId = integ;

  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly status = signal('All');
  protected readonly vendor = signal('All');
  protected readonly sort = signal('Most Popular');
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly selId = signal<string | null>('sap');
  protected readonly tab = signal<(typeof TABS)[number]>('Overview');
  protected readonly popAll = signal(false);
  protected readonly allMode = signal(false);
  protected readonly page = signal(1);
  protected readonly wiz = signal<Integ | null>(null);
  protected readonly docOpen = signal(false);
  protected readonly sol = signal<(typeof FEATURED)[number] | null>(null);
  protected readonly req = signal(false);
  protected readonly err = signal('');
  protected readonly rf = signal({ name: '', vendor: '', category: 'HR & Payroll', priority: 'Medium', useCase: '' });

  protected readonly connected = this.store.connectedIds;
  protected readonly sel = computed(() => INTEGRATIONS.find((i) => i.id === this.selId()) ?? null);

  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const cat = this.cat(), st = this.status(), v = this.vendor(), con = this.connected();
    const l = INTEGRATIONS.filter(
      (i) =>
        (!q || `${i.name} ${i.vendor} ${i.sub} ${i.category} ${i.desc}`.toLowerCase().includes(q)) &&
        (cat === 'All' || i.category === cat || i.domain === cat) &&
        (v === 'All' || i.vendor === v) &&
        (st === 'All' || (st === 'Connected' ? con.has(i.id) : st === 'Not Connected' ? !con.has(i.id) : i.badge === st)),
    );
    const s = this.sort();
    const cmp: Record<string, (a: Integ, b: Integ) => number> = {
      'Most Popular': (a, b) => b.pop - a.pop,
      'Name (A–Z)': (a, b) => a.name.localeCompare(b.name),
      'Name (Z–A)': (a, b) => b.name.localeCompare(a.name),
      'Recently Updated': (a, b) => parseInt(b.updated) - parseInt(a.updated) || b.pop - a.pop,
      Vendor: (a, b) => a.vendor.localeCompare(b.vendor),
    };
    return [...l].sort(cmp[s]);
  });
  protected readonly popular = computed(() => this.filtered().slice(0, this.popAll() ? 8 : 4));
  protected readonly rest = computed(() => this.filtered().slice(this.popular().length));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.rest().length / 8)));
  protected readonly pageList = computed(() => Array.from({ length: this.pages() }, (_, i) => i + 1));
  protected readonly shown = computed(() => (this.allMode() ? this.rest() : this.rest().slice((this.page() - 1) * 8, this.page() * 8)));

  protected catCount(c: string) {
    return INTEGRATIONS.filter((i) => i.category === c).length;
  }
  protected select(it: Integ) {
    this.selId.set(it.id);
    this.tab.set('Overview');
  }
  protected clearFilters() {
    this.q.set('');
    this.cat.set('All');
    this.status.set('All');
    this.vendor.set('All');
    this.page.set(1);
  }
  protected go(p: string) {
    this.router.navigateByUrl(`/integrations-api-hub/${p}`);
  }
  protected scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  protected connected$(it: Integ) {
    this.wiz.set(null);
    this.t.show(`${it.name} connected · initial full sync started · now ${this.store.health().total} active integrations`);
  }
  protected missing(ids: string[]) {
    return ids.filter((id) => !this.connected().has(id)).length;
  }
  protected deploy(f: (typeof FEATURED)[number]) {
    const ids = f.ids.filter((id) => !this.connected().has(id));
    for (const id of ids) {
      const it = integ(id);
      this.store.connect(id, { sites: ['Head Office', 'Manufacturing', 'Warehouse', 'Logistics Hub', 'Retail Stores', 'Data Center'], mode: it.sync.startsWith('Scheduled') ? 'Scheduled' : 'Real-time', freq: it.sync.startsWith('Scheduled') ? 'Hourly' : 'Event driven', env: 'Production', auth: it.auth.split(' / ')[0] });
    }
    this.sol.set(null);
    this.t.show(`${f.title} deployed · ${ids.length} connectors added to Connected Systems`);
  }
  protected entity(o: string) {
    const m: Record<string, string> = { Employees: 'Employee', Users: 'Employee identity', Departments: 'Department', 'Org Units': 'Department', 'Cost Centers': 'Cost center', Cardholders: 'Access credential', Badges: 'Access credential', Devices: 'Device', Sites: 'Site', Zones: 'Zone' };
    return m[o] ?? o.replace(/s$/, '');
  }
  protected ticket(it: Integ) {
    this.t.show(`Support ticket SUP-${4800 + it.pop % 97} opened for ${it.name}`);
  }
  protected openRequest() {
    this.err.set('');
    this.rf.set({ name: this.q(), vendor: '', category: this.cat() === 'All' ? 'HR & Payroll' : this.cat(), priority: 'Medium', useCase: '' });
    this.req.set(true);
  }
  protected setR(k: string, v: string) {
    this.rf.update((f) => ({ ...f, [k]: v }));
  }
  protected submitReq() {
    const f = this.rf();
    if (!f.name.trim() || !f.useCase.trim()) return this.err.set('System name and use case are required.');
    const id = `REQ-${1040 + this.store.requests().length + 1}`;
    this.store.requests.update((l) => [...l, { id, ...f, at: Date.now(), status: 'Submitted' }]);
    this.req.set(false);
    this.t.show(`${id} submitted — the integrations team will review "${f.name}" within 2 business days`);
  }
  protected exportCsv() {
    downloadCsv('integrations.csv', [['Name', 'Vendor', 'Category', 'Methods', 'Auth', 'Sync', 'Version', 'Connected'], ...this.filtered().map((i) => [i.name, i.vendor, i.sub, i.methods, i.auth, i.sync, i.version, this.connected().has(i.id) ? 'Yes' : 'No'])]);
  }
}
