import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { DevArt, DevDetails, DevMap } from './dev-ui';
import { DEPTS, Device, DeviceStore, DONUT_COLORS, DStatus, DType, fmtSeen, fmtUptime, OWNERS, SITES, statusCls, TYPE_META, TYPES } from './devices.data';

type SortKey = 'name' | 'type' | 'model' | 'serial' | 'site' | 'location' | 'status' | 'seenAgo';

@Component({
  selector: 'app-devices-device-inventory',
  imports: [...UI, DevArt, DevMap, DevDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Device Inventory" parent="Device &amp; Edge Management" parentLink="/device-edge-management" subtitle="View and manage all devices across your organization. Track status, location, connectivity and lifecycle.">
      <button class="btn-primary big" (click)="openAdd()"><app-icon name="plus" [size]="17" />Add Device</button>
      <label class="btn-ghost big"><app-icon name="devices-import" [size]="17" />Import<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost big" (click)="exportCsv(filtered())"><app-icon name="devices-export" [size]="17" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost big sq" (click)="menu.set(menu() === 'head' ? null : 'head'); $event.stopPropagation()" aria-label="More">⋮</button>
        @if (menu() === 'head') {
          <div class="dropdown" (click)="$event.stopPropagation()">
            <button class="dd-item" (click)="discover()"><app-icon name="search" [size]="15" />Run network discovery</button>
            <button class="dd-item" (click)="nav('device-health-monitoring')"><app-icon name="activity" [size]="15" />Health &amp; monitoring</button>
            <button class="dd-item" (click)="nav('settings-integration')"><app-icon name="plug" [size]="15" />Inventory settings</button>
            <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="file-text" [size]="15" />Print</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpis">
      <button class="kc" (click)="resetFilters()">
        <span class="ki" style="background:var(--kb-7c3aed)"><app-icon name="devices-chip" [size]="30" [stroke]="1.8" /></span>
        <div><small>Total Devices</small><b>{{ fmt(c().total) }}</b><em class="up-g"><app-icon name="arrow-up" [size]="13" [stroke]="2.6" />6% <span>vs. last month</span></em></div>
      </button>
      <button class="kc" [class.on]="statusF() === 'Online'" (click)="setStatus('Online')">
        <span class="ki" style="background:var(--kb-10b981)"><app-icon name="wifi" [size]="30" [stroke]="1.8" /></span>
        <div><small>Online</small><b>{{ fmt(c().Online) }}</b><em class="up-g">↑{{ pct(c().Online) }}%</em></div>
      </button>
      <button class="kc" [class.on]="statusF() === 'Offline'" (click)="setStatus('Offline')">
        <span class="ki" style="background:var(--kb-f97316)"><app-icon name="triangle-alert" [size]="30" [stroke]="1.8" /></span>
        <div><small>Offline</small><b>{{ c().Offline }}</b><em class="dn-r"><app-icon name="ban" [size]="12" [stroke]="2.4" />{{ pct(c().Offline) }}%</em></div>
      </button>
      <button class="kc" [class.on]="statusF() === 'Maintenance'" (click)="setStatus('Maintenance')">
        <span class="ki" style="background:var(--kb-2f80ed)"><app-icon name="devices-wrench" [size]="30" [stroke]="1.8" /></span>
        <div><small>Maintenance</small><b>{{ c().Maintenance }}</b><em class="up-b">↑{{ pct(c().Maintenance) }}%</em></div>
      </button>
      <button class="kc" (click)="nav('alerts-notifications')">
        <span class="ki" style="background:var(--kb-10b981)"><app-icon name="bell" [size]="30" [stroke]="1.8" /></span>
        <div><small>Critical Alerts</small><b>{{ store.openCritical() }}</b><em class="dn-r"><app-icon name="arrow-down" [size]="13" [stroke]="2.6" />2%</em></div>
      </button>
    </section>

    <section class="card filters">
      <label class="fsearch"><app-icon name="search" [size]="17" /><input placeholder="Search by device name, serial no, MAC, model..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
      <label class="fbox"><span>Device Type</span>
        <select [value]="typeF()" (change)="typeF.set($any($event.target).value); page.set(0)"><option value="All">All Types</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
      <label class="fbox"><span>Status</span>
        <select [value]="statusF()" (change)="setStatus($any($event.target).value)"><option value="All">All Statuses</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <label class="fbox"><span>Site</span>
        <select [value]="siteF()" (change)="siteF.set($any($event.target).value); page.set(0)"><option value="All">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <label class="fbox"><span>Department</span>
        <select [value]="deptF()" (change)="deptF.set($any($event.target).value); page.set(0)"><option value="All">All Departments</option>@for (s of depts; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <div class="menu-wrap">
        <button class="more-f" [class.on]="moreCount()" (click)="menu.set(menu() === 'filters' ? null : 'filters'); $event.stopPropagation()"><app-icon name="filter" [size]="15" />More Filters @if (moreCount()) {<i>{{ moreCount() }}</i>}</button>
        @if (menu() === 'filters') {
          <div class="dropdown mf" (click)="$event.stopPropagation()">
            <label>Firmware<select class="select" [value]="fwF()" (change)="fwF.set($any($event.target).value)"><option>Any</option><option>Latest</option><option>Outdated</option></select></label>
            <label>Last seen<select class="select" [value]="seenF()" (change)="seenF.set($any($event.target).value)"><option>Any time</option><option>Within 1 hour</option><option>Over 1 hour ago</option><option>Over 24 hours ago</option></select></label>
            <label>Vendor<select class="select" [value]="vendorF()" (change)="vendorF.set($any($event.target).value)"><option>Any</option>@for (v of vendors; track v) {<option>{{ v }}</option>}</select></label>
            <label>Health score<select class="select" [value]="healthF()" (change)="healthF.set($any($event.target).value)"><option>Any</option><option>Healthy (80+)</option><option>At risk (&lt; 80)</option></select></label>
            <div class="mf-a"><button class="link" (click)="clearMore()">Clear</button><button class="btn-primary btn-sm" (click)="menu.set(null); page.set(0)">Apply</button></div>
          </div>
        }
      </div>
    </section>

    <section class="main" [class.no-detail]="!sel()">
      <div class="left">
        <div class="charts">
          <div class="card">
            <h3>Devices by Type</h3>
            <div class="donut">
              <svg viewBox="0 0 160 160" class="ring">
                @for (s of donut(); track s.type) {
                  <circle cx="80" cy="80" r="58" fill="none" [attr.stroke]="s.color" [attr.stroke-width]="typeF() === s.type ? 26 : 20" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 80 80)" class="seg" (click)="pickType(s.type)"><title>{{ s.type }}: {{ s.n }}</title></circle>
                }
                <text x="80" y="80" text-anchor="middle" class="d-v">{{ fmt(c().total) }}</text>
                <text x="80" y="98" text-anchor="middle" class="d-l">Total Devices</text>
              </svg>
              <ul class="lg">
                @for (s of donut(); track s.type) {
                  <li [class.dim]="typeF() !== 'All' && typeF() !== s.type" (click)="pickType(s.type)"><i [style.background]="s.color"></i><span>{{ s.type }}</span><b>{{ s.n }}</b><em>({{ s.pct }}%)</em></li>
                }
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="ch"><h3>Device Status</h3><div class="sl"><span><i style="background:var(--kb-10b981)"></i>Online</span><span><i style="background:var(--kb-ef4444)"></i>Offline</span><span><i style="background:var(--kb-fbbf24)"></i>Maintenance</span></div></div>
            <svg viewBox="0 0 420 210" class="bars">
              @for (t of [0, 100, 200, 300, 400, 500]; track t) {<line x1="34" x2="414" [attr.y1]="y(t)" [attr.y2]="y(t)" class="gl" /><text x="26" [attr.y]="y(t) + 4" text-anchor="end" class="ax">{{ t }}</text>}
              @for (g of store.statusChart(); track g.label; let gi = $index) {
                <g class="grp" (click)="pickType(g.type)">
                  <rect [attr.x]="40 + gi * 76" y="10" width="74" height="176" fill="transparent" />
                  @for (v of g.v; track $index; let bi = $index) {
                    <rect [attr.x]="52 + gi * 76 + bi * 17" [attr.y]="y(v)" width="15" [attr.height]="186 - y(v)" [attr.fill]="barColors[bi]" />
                    <text [attr.x]="59.5 + gi * 76 + bi * 17" [attr.y]="y(v) - 4" text-anchor="middle" class="bv">{{ v }}</text>
                  }
                  <text [attr.x]="77 + gi * 76" y="204" text-anchor="middle" class="ax lab">{{ g.label }}</text>
                </g>
              }
            </svg>
          </div>
          <div class="card loc">
            <div class="ch"><h3>Device Location</h3><button class="link sm" (click)="bigMap.set(true)">View Map</button></div>
            <app-dev-map [devices]="mapDevices()" [selected]="selId()" (pick)="select($event)" />
          </div>
        </div>

        <div class="card tbl">
          <nav class="ttabs">
            <button [class.on]="typeF() === 'All'" (click)="typeF.set('All'); page.set(0)">All Devices ({{ fmt(c().total) }})</button>
            @for (s of store.byType(); track s.type) {<button [class.on]="typeF() === s.type" (click)="typeF.set(s.type); page.set(0)">{{ plural(s.type) }} ({{ s.n }})</button>}
          </nav>
          @if (checked().size) {
            <div class="bulk">
              <b>{{ checked().size }} selected</b>
              <button class="btn-ghost sm" (click)="bulk('reboot')">Reboot</button>
              <button class="btn-ghost sm" (click)="bulk('fw')">Update firmware</button>
              <button class="btn-ghost sm" (click)="bulk('maint')">Set maintenance</button>
              <button class="btn-ghost sm" (click)="bulk('export')">Export</button>
              <button class="link" (click)="checked.set(empty())">Clear</button>
            </div>
          }
          <div class="table-wrap">
            <table class="table inv">
              <thead><tr>
                <th class="cb"><input type="checkbox" [checked]="allChecked()" (change)="toggleAll()" /></th>
                @for (h of heads; track h.k) {<th class="sortable" (click)="sortBy(h.k)">{{ h.l }}<span class="arr" [class.on]="sort().k === h.k">{{ sort().k === h.k ? (sort().d === 1 ? '▲' : '▼') : '⇅' }}</span></th>}
                <th class="act">Actions</th>
              </tr></thead>
              <tbody>
                @for (d of pageRows(); track d.id) {
                  <tr class="clickable" [class.selected]="selId() === d.id" (click)="select(d.id)">
                    <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="checked().has(d.id)" (change)="toggle(d.id)" /></td>
                    <td><span class="dn"><i [style.background]="tileColor(d)"><app-icon [name]="meta(d.type).icon" [size]="13" [stroke]="2.2" /></i>{{ d.name }}</span></td>
                    <td>{{ d.type }}</td><td>{{ d.model }}</td><td>{{ d.serial }}</td><td>{{ d.site }}</td><td>{{ d.location }}</td>
                    <td><span [class]="'st ' + cls(d.status)"><i></i>{{ d.status }}</span></td>
                    <td>{{ seen(d) }}</td>
                    <td class="act" (click)="$event.stopPropagation()">
                      <div class="menu-wrap">
                        <button class="dots" (click)="rowMenu.set(rowMenu() === d.id ? null : d.id); $event.stopPropagation()">•••</button>
                        @if (rowMenu() === d.id) {
                          <div class="dropdown" (click)="$event.stopPropagation()">
                            <button class="dd-item" (click)="rowAct('view', d)"><app-icon name="devices-monitor" [size]="15" />View details</button>
                            <button class="dd-item" (click)="rowAct('reboot', d)"><app-icon name="devices-power" [size]="15" />Reboot</button>
                            <button class="dd-item" (click)="rowAct('fw', d)"><app-icon name="devices-export" [size]="15" />Update firmware</button>
                            @if (d.status === 'Maintenance' || d.status === 'Offline') {<button class="dd-item" (click)="rowAct('online', d)"><app-icon name="devices-check" [size]="15" />Mark back online</button>}
                            @else {<button class="dd-item" (click)="rowAct('maint', d)"><app-icon name="devices-wrench" [size]="15" />Set maintenance</button>}
                            <button class="dd-item" (click)="rowAct('ticket', d)"><app-icon name="devices-ticket" [size]="15" />Create ticket</button>
                            <button class="dd-item" (click)="rowAct('replace', d)"><app-icon name="refresh" [size]="15" />Start replacement (RMA)</button>
                            <button class="dd-item danger" (click)="rowAct('decom', d)"><app-icon name="ban" [size]="15" />Decommission</button>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="11" class="empty">No devices match the current filters. <button class="link" (click)="resetFilters()">Reset filters</button></td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="pgr">
            <span>Showing {{ filtered().length ? page() * size() + 1 : 0 }} - {{ Math.min((page() + 1) * size(), filtered().length) }} of {{ fmt(filtered().length) }} devices</span>
            <div class="pages">
              <button class="pg" [disabled]="page() === 0" (click)="page.set(page() - 1)" aria-label="Previous">‹</button>
              @for (p of pageNums(); track p) {<button class="pg" [class.on]="p === page()" (click)="page.set(p)">{{ p + 1 }}</button>}
              <button class="pg" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)" aria-label="Next">›</button>
              <span class="show">Show</span>
              <select class="select" [value]="'' + size()" (change)="size.set(+$any($event.target).value); page.set(0)"><option value="9">9</option><option value="10">10</option><option value="25">25</option><option value="50">50</option></select>
            </div>
          </div>
        </div>
      </div>

      @if (sel(); as d) {
        <aside class="card detail">
          <div class="dh">
            <h2>{{ d.name }}</h2>
            <div class="menu-wrap">
              <button class="ib" (click)="menu.set(menu() === 'detail' ? null : 'detail'); $event.stopPropagation()" aria-label="Device menu">⋮</button>
              @if (menu() === 'detail') {
                <div class="dropdown" (click)="$event.stopPropagation()">
                  <button class="dd-item" (click)="openEdit(d)"><app-icon name="sliders" [size]="15" />Edit device</button>
                  <button class="dd-item" (click)="menu.set(null); bigMap.set(true)"><app-icon name="map-pin" [size]="15" />Locate on map</button>
                  <button class="dd-item" (click)="copy(d)"><app-icon name="devices-copy" [size]="15" />Copy serial no.</button>
                  <button class="dd-item" (click)="rowAct('replace', d)"><app-icon name="refresh" [size]="15" />Start replacement</button>
                  <button class="dd-item danger" (click)="rowAct('decom', d)"><app-icon name="ban" [size]="15" />Decommission</button>
                </div>
              }
            </div>
            <button class="ib x" (click)="selId.set(null)" aria-label="Close">×</button>
          </div>
          <span [class]="'st big ' + cls(d.status)"><i></i>{{ d.status }}</span>
          <div class="art"><app-dev-art [type]="d.type" [size]="112" /></div>
          <dl class="kv">
            <dt>Device Type</dt><dd>{{ d.type }}</dd><dt>Model</dt><dd>{{ d.model }}</dd><dt>Serial Number</dt><dd>{{ d.serial }}</dd><dt>MAC Address</dt><dd>{{ d.mac }}</dd>
          </dl>
          <dl class="kv ic">
            <dt><app-icon name="home" [size]="15" />Site</dt><dd>{{ d.site }}</dd>
            <dt><app-icon name="map-pin" [size]="15" />Location</dt><dd>{{ d.location }}</dd>
            <dt><app-icon name="building" [size]="15" />Department</dt><dd>{{ d.dept }}</dd>
            <dt><app-icon name="user" [size]="15" />Owner</dt><dd>{{ d.owner }}</dd>
          </dl>
          <h4>Connectivity</h4>
          <span [class]="'cs ' + cls(d.status)"><i></i>{{ d.status === 'Online' ? 'Online' : d.status === 'Maintenance' ? 'Limited' : 'Disconnected' }}</span>
          <dl class="kv sm">
            <dt>Last Seen</dt><dd>{{ seen(d) }}</dd><dt>IP Address</dt><dd>{{ d.ip }}</dd><dt>Uptime</dt><dd>{{ uptime(d) }}</dd>
          </dl>
          <h4>Firmware</h4>
          <dl class="kv sm">
            <dt>Version</dt><dd>{{ d.firmware }} @if (d.firmware !== meta(d.type).latest) {<span class="new" title="Update available">↑ {{ meta(d.type).latest }}</span>}</dd><dt>Last Updated</dt><dd>{{ d.fwUpdated }}</dd>
          </dl>
          <h4>Actions</h4>
          <div class="acts">
            <button (click)="details.set(d)"><app-icon name="devices-monitor" [size]="17" />View Details</button>
            <button (click)="store.reboot(d)" [disabled]="d.status === 'Inactive'"><app-icon name="devices-power" [size]="17" />Reboot</button>
            <button (click)="updateFw(d)"><app-icon name="devices-export" [size]="17" />Update Firmware</button>
            <button (click)="ticket.set({ d, subject: d.name + ' - ' + (d.status === 'Online' ? 'Service request' : d.status + ' device'), prio: d.status === 'Offline' ? 'High' : 'Medium', note: '' })"><app-icon name="devices-ticket" [size]="17" />Create Ticket</button>
          </div>
        </aside>
      }
    </section>

    <app-dev-details [dev]="details()" (closed)="details.set(null)" />

    @if (bigMap()) {
      <div class="g-overlay" (click)="bigMap.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Device Map · {{ mapSite() }}</h3>
          <div class="toolbar"><select class="select" [value]="mapSite()" (change)="mapSiteSel.set($any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select><button class="close-btn" (click)="bigMap.set(false)">×</button></div>
        </div>
        <div class="bm">
          <app-dev-map [devices]="mapDevices()" [selected]="selId()" [height]="460" (pick)="select($event)" />
          <ul class="bml">
            @for (d of mapDevices(); track d.id) {<li [class.on]="d.id === selId()" (click)="select(d.id)"><span [class]="'st ' + cls(d.status)"><i></i></span><div><b>{{ d.name }}</b><small>{{ d.type }} · {{ d.location }}</small></div></li>}
          </ul>
        </div>
      </div>
    }

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit ' + f.name : 'Add Device' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Device name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" placeholder="e.g. AP-4060-12" /></label>
          <label>Device type<select class="select" [value]="f.type" (change)="setType($any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Model<select class="select" [value]="f.model" (change)="setF('model', $any($event.target).value)">@for (m of meta(f.type).models; track m) {<option [value]="m">{{ m }}</option>}</select></label>
          <label>Serial number *<input class="input" required [value]="f.serial" (input)="setF('serial', $any($event.target).value)" /></label>
          <label>MAC address<input class="input" [value]="f.mac" (input)="setF('mac', $any($event.target).value)" /></label>
          <label>IP address<input class="input" [value]="f.ip" (input)="setF('ip', $any($event.target).value)" /></label>
          <label>Site<select class="select" [value]="f.site" (change)="setF('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Location<input class="input" [value]="f.location" (input)="setF('location', $any($event.target).value)" /></label>
          <label>Department<select class="select" [value]="f.dept" (change)="setF('dept', $any($event.target).value)">@for (s of depts; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Owner<input class="input" [value]="f.owner" (input)="setF('owner', $any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ f.id ? 'Save Changes' : 'Add Device' }}</button></div>
      </form>
    }

    @if (ticket(); as t) {
      <div class="g-overlay" (click)="ticket.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); submitTicket()">
        <div class="modal-head"><h3>Create Ticket · {{ t.d.name }}</h3><button type="button" class="close-btn" (click)="ticket.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Subject<input class="input" [value]="t.subject" (input)="ticket.set({ d: t.d, subject: $any($event.target).value, prio: t.prio, note: t.note })" /></label>
          <label>Priority<select class="select" [value]="t.prio" (change)="ticket.set({ d: t.d, subject: t.subject, prio: $any($event.target).value, note: t.note })"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
          <label>Assign to<select class="select"><option>{{ t.d.owner }}</option><option>Service Desk</option><option>Vendor Support</option></select></label>
          <label class="full">Description<textarea class="input" rows="3" [value]="t.note" (input)="ticket.set({ d: t.d, subject: t.subject, prio: t.prio, note: $any($event.target).value })" placeholder="Describe the issue..."></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="ticket.set(null)">Cancel</button><button class="btn-primary" type="submit">Create Ticket</button></div>
      </form>
    }

    @if (store.toast()) {<div class="g-toast">{{ store.toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .big { padding: 10px 18px; font-size: 13.5px; } .btn-primary.big { padding: 10px 26px; } .sq { padding: 10px 14px; } .danger { color: var(--red); }
    .kpis { display: grid; grid-template-columns: 1.15fr 1fr 1fr 1fr 1.05fr; gap: 12px; margin-bottom: 12px; }
    .kc { display: flex; align-items: center; gap: 18px; padding: 12px 14px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 12px; cursor: pointer; text-align: left; font: inherit; color: inherit; min-width: 0; box-shadow: 0 1px 3px rgba(20,20,60,.04); }
    .kc:hover, .kc.on { border-color: var(--kl-c4b5fd); } .kc.on { box-shadow: 0 0 0 2px var(--primary-soft); }
    .ki { width: 66px; height: 62px; border-radius: 12px; color: var(--kf-ffffff); display: grid; place-items: center; flex-shrink: 0; }
    .kc div { display: flex; flex-direction: column; min-width: 0; } .kc small { font-size: 13px; color: var(--kf-2b2f4a); } .kc b { font-size: 22px; font-weight: 700; margin: 2px 0; }
    .kc em { font-style: normal; font-size: 12px; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; } .kc em span { color: var(--muted); margin-left: 18px; }
    .up-g { color: var(--kf-16a34a); } .dn-r { color: var(--kf-dc2626); } .up-b { color: var(--kf-2563eb); }
    .filters { display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr 1fr 0.75fr; gap: 10px; padding: 10px; margin-bottom: 12px; align-items: stretch; }
    .fsearch { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 0 12px; color: var(--kf-4b4f6b); }
    .fsearch input { border: 0; outline: 0; font: inherit; font-size: 12px; flex: 1; min-width: 0; }
    .fbox { position: relative; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; padding: 5px 10px 4px; min-width: 0; }
    .fbox span { font-size: 11px; color: var(--muted); } .fbox select { border: 0; outline: 0; font: inherit; font-size: 12px; background: transparent; appearance: none; padding: 1px 18px 1px 0; cursor: pointer; color: var(--text); }
    .fbox::after { content: ''; position: absolute; right: 12px; top: 50%; width: 6px; height: 6px; border-right: 1.6px solid var(--kl-4b4f6b); border-bottom: 1.6px solid var(--kl-4b4f6b); transform: translateY(-60%) rotate(45deg); pointer-events: none; }
    .more-f { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font: inherit; font-size: 12px; cursor: pointer; color: var(--kf-2b2f4a); }
    .more-f.on { border-color: var(--primary); color: var(--primary); } .more-f i { font-style: normal; background: var(--primary); color: var(--kf-ffffff); border-radius: 10px; padding: 0 6px; font-size: 10.5px; }
    .mf { width: 250px; padding: 12px; display: flex; flex-direction: column; gap: 10px; } .mf label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); } .mf-a { display: flex; justify-content: space-between; align-items: center; }
    .main { display: grid; grid-template-columns: minmax(0, 1fr) 236px; gap: 12px; align-items: start; } .main.no-detail { grid-template-columns: minmax(0, 1fr); }
    .left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .charts { display: grid; grid-template-columns: 1.5fr 2fr 0.95fr; gap: 12px; } .charts .card { padding: 12px 14px; }
    h3 { margin: 0; font-size: 14px; font-weight: 700; } .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
    .donut { display: grid; grid-template-columns: 128px 1fr; gap: 10px; align-items: center; margin-top: 10px; }
    .ring { width: 128px; } .seg { cursor: pointer; transition: stroke-width .15s; } .d-v { font-size: 21px; font-weight: 700; fill: var(--text); } .d-l { font-size: 10.5px; fill: var(--ka-3b3f5c); }
    .lg { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px; } .lg li { display: grid; grid-template-columns: 9px 1fr auto 40px; gap: 6px; white-space: nowrap; align-items: center; font-size: 11.5px; cursor: pointer; }
    .lg li.dim { opacity: .4; } .lg i { width: 9px; height: 9px; border-radius: 50%; } .lg b { font-weight: 500; text-align: right; } .lg em { font-style: normal; color: var(--kf-4b4f6b); }
    .sl { display: flex; gap: 14px; font-size: 11.5px; color: var(--kf-3b3f5c); } .sl span { display: inline-flex; align-items: center; gap: 6px; } .sl i { width: 8px; height: 8px; border-radius: 50%; }
    .bars { width: 100%; height: auto; display: block; } .gl { stroke: var(--kl-eef0f5); } .ax { font-size: 9.5px; fill: var(--ka-4b4f6b); } .bv { font-size: 9px; fill: var(--ka-2b2f4a); } .grp { cursor: pointer; } .grp:hover .lab { fill: var(--primary); font-weight: 600; }
    .loc .link.sm { font-size: 11px; }
    .tbl { padding: 10px 12px; }
    .ttabs { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; } .ttabs button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; padding: 7px 18px; font: inherit; font-size: 11.5px; cursor: pointer; color: var(--kf-2b2f4a); }
    .ttabs button.on { background: var(--kb-6d28d9); border-color: var(--kl-6d28d9); color: var(--kf-ffffff); font-weight: 600; }
    .bulk { display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 8px; background: var(--primary-soft); border-radius: 8px; font-size: 12px; }
    .inv th { font-size: 11.5px; font-weight: 500; color: var(--kf-2b2f4a); background: var(--kb-ffffff); } .inv td { font-size: 11px; color: var(--kf-4b4f6b); padding: 7px 10px; } .inv .cb { width: 22px; }
    .arr { margin-left: 4px; font-size: 9px; color: var(--kf-c4c7d6); } .arr.on { color: var(--primary); }
    .dn { display: inline-flex; align-items: center; gap: 8px; color: var(--text); } .dn i { width: 22px; height: 22px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .st { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 5px; border-radius: 12px; font-size: 11px; } .st i { width: 12px; height: 12px; border-radius: 50%; background: currentColor; }
    .st.green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .st.green i { background: var(--kb-22c55e); } .st.red { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .st.red i { background: var(--kb-ef4444); }
    .st.amber { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .st.amber i { background: var(--kb-fb923c); } .st.grey { background: var(--kb-f1f5f9); color: var(--kf-475569); } .st.grey i { background: var(--kb-94a3b8); }
    .act { text-align: left; } .dots { font-size: 11px; letter-spacing: 1px; font-weight: 700; } .empty { text-align: center; padding: 30px !important; }
    .pgr { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11.5px; color: var(--kf-4b4f6b); flex-wrap: wrap; gap: 8px; }
    .pages { display: flex; align-items: center; gap: 8px; } .pg { min-width: 22px; height: 22px; padding: 0 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--kb-ffffff); font-size: 11px; cursor: pointer; } .pg.on { background: var(--kb-6d28d9); border-color: var(--kl-6d28d9); color: var(--kf-ffffff); }
    .pg:disabled { opacity: .4; cursor: default; } .show { margin-left: 22px; } .pages .select { padding: 5px 30px 5px 18px; font-size: 11.5px; }
    .detail { position: sticky; top: 76px; padding: 12px 12px 14px; display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 88px); overflow: auto; }
    .dh { display: flex; align-items: center; gap: 4px; } .dh h2 { margin: 0; font-size: 15px; flex: 1; } .ib { border: 0; background: none; font-size: 17px; cursor: pointer; color: var(--kf-2b2f4a); padding: 0 5px; } .ib.x { font-size: 22px; }
    .st.big { align-self: flex-start; } .art { display: grid; place-items: center; margin: -2px 0 4px; }
    .kv { display: grid; grid-template-columns: 100px 1fr; gap: 8px 6px; margin: 4px 0 10px; font-size: 10.5px; } .kv dt { color: var(--kf-4b4f6b); display: flex; align-items: center; gap: 8px; } .kv dd { margin: 0; color: var(--kf-2b2f4a); overflow-wrap: anywhere; }
    .kv.ic dt app-icon { color: var(--kf-2b2f4a); } .kv.sm { margin-top: 0; font-size: 10px; grid-template-columns: 92px 1fr; } .new { color: var(--primary); font-weight: 600; margin-left: 4px; }
    h4 { margin: 6px 0 0; font-size: 12.5px; padding-top: 8px; border-top: 1px solid var(--kl-f0f1f6); }
    .cs { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; } .cs i { width: 10px; height: 10px; border-radius: 50%; } .cs.green { color: var(--kf-15803d); } .cs.green i { background: var(--kb-22c55e); } .cs.red { color: var(--kf-b91c1c); } .cs.red i { background: var(--kb-ef4444); } .cs.amber { color: var(--kf-c2410c); } .cs.amber i { background: var(--kb-fb923c); } .cs.grey i { background: var(--kb-94a3b8); }
    .acts { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    .acts button { display: flex; align-items: center; gap: 14px; padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); font: inherit; font-size: 11px; color: var(--kf-2b2f4a); cursor: pointer; text-align: left; }
    .acts button app-icon { color: var(--kf-4c1d95); } .acts button:hover { background: var(--kb-f5f3ff); border-color: var(--kl-c4b5fd); } .acts button:disabled { opacity: .5; cursor: default; }
    .bm { display: grid; grid-template-columns: 1fr 260px; gap: 12px; } .bml { list-style: none; margin: 0; padding: 0; max-height: 460px; overflow: auto; }
    .bml li { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; } .bml li.on, .bml li:hover { background: var(--kb-f5f3ff); } .bml div { display: flex; flex-direction: column; } .bml small { color: var(--muted); } .bml .st { padding: 3px; }
    @media (max-width: 1350px) { .kpis { grid-template-columns: repeat(3, 1fr); } .filters { grid-template-columns: 1fr 1fr 1fr; } .charts { grid-template-columns: 1fr 1fr; } .charts .loc { grid-column: span 2; } .main { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class DeviceInventory {
  protected readonly store = inject(DeviceStore);
  private readonly router = inject(Router);
  protected readonly Math = Math;
  protected readonly types = TYPES;
  protected readonly statuses: DStatus[] = ['Online', 'Offline', 'Maintenance', 'Inactive'];
  protected readonly sites = SITES;
  protected readonly depts = DEPTS;
  protected readonly vendors = [...new Set(Object.values(TYPE_META).map((m) => m.vendor))];
  protected readonly barColors = ['var(--ka-10b981)', 'var(--ka-ef4444)', 'var(--ka-fbbf24)'];
  protected readonly heads: { k: SortKey; l: string }[] = [
    { k: 'name', l: 'Device Name' }, { k: 'type', l: 'Type' }, { k: 'model', l: 'Model' }, { k: 'serial', l: 'Serial Number' }, { k: 'site', l: 'Site' }, { k: 'location', l: 'Location' }, { k: 'status', l: 'Status' }, { k: 'seenAgo', l: 'Last Seen' },
  ];
  protected readonly cls = statusCls;
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly c = this.store.counts;

  protected readonly q = signal('');
  protected readonly typeF = signal<string>('All');
  protected readonly statusF = signal<string>('All');
  protected readonly siteF = signal('All');
  protected readonly deptF = signal('All');
  protected readonly fwF = signal('Any');
  protected readonly seenF = signal('Any time');
  protected readonly vendorF = signal('Any');
  protected readonly healthF = signal('Any');
  protected readonly sort = signal<{ k: SortKey | null; d: 1 | -1 }>({ k: null, d: 1 });
  protected readonly page = signal(0);
  protected readonly size = signal(10);
  protected readonly selId = signal<string | null>('D1');
  protected readonly checked = signal(new Set<string>());
  protected readonly empty = () => new Set<string>();
  protected readonly menu = signal<string | null>(null);
  protected readonly rowMenu = signal<string | null>(null);
  protected readonly bigMap = signal(false);
  protected readonly mapSiteSel = signal<string | null>(null);
  protected readonly details = signal<Device | null>(null);
  protected readonly ticket = signal<{ d: Device; subject: string; prio: string; note: string } | null>(null);
  protected readonly form = signal<Device | null>(null);
  protected readonly err = signal('');

  constructor() {
    const f = this.store.focusId();
    if (f) this.selId.set(f);
  }

  @HostListener('document:click') closeMenus() {
    this.menu.set(null);
    this.rowMenu.set(null);
  }

  protected readonly moreCount = computed(() => [this.fwF() !== 'Any', this.seenF() !== 'Any time', this.vendorF() !== 'Any', this.healthF() !== 'Any'].filter(Boolean).length);
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const [t, s, si, de, fw, se, ve, he] = [this.typeF(), this.statusF(), this.siteF(), this.deptF(), this.fwF(), this.seenF(), this.vendorF(), this.healthF()];
    let l = this.store.devices().filter((d) =>
      (t === 'All' || d.type === t) && (s === 'All' || d.status === s) && (si === 'All' || d.site === si) && (de === 'All' || d.dept === de) &&
      (fw === 'Any' || (fw === 'Latest') === (d.firmware === TYPE_META[d.type].latest)) &&
      (se === 'Any time' || (se === 'Within 1 hour' ? d.seenAgo <= 60 : se === 'Over 1 hour ago' ? d.seenAgo > 60 : d.seenAgo > 1440)) &&
      (ve === 'Any' || d.vendor === ve) && (he === 'Any' || (he.startsWith('Healthy') ? d.health >= 80 : d.health < 80)) &&
      (!q || [d.name, d.serial, d.mac, d.model, d.ip, d.location].some((x) => x.toLowerCase().includes(q))),
    );
    const { k, d } = this.sort();
    if (k) l = [...l].sort((a, b) => (a[k] < b[k] ? -d : a[k] > b[k] ? d : 0));
    return l;
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.size())));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.size(), (this.page() + 1) * this.size()));
  protected readonly pageNums = computed(() => {
    const n = this.pages();
    const start = Math.max(0, Math.min(this.page() - 2, n - 5));
    return Array.from({ length: Math.min(5, n) }, (_, i) => start + i);
  });
  protected readonly allChecked = computed(() => this.pageRows().length > 0 && this.pageRows().every((d) => this.checked().has(d.id)));
  protected readonly sel = computed(() => this.store.byId(this.selId()));
  protected readonly mapSite = computed(() => this.mapSiteSel() ?? this.sel()?.site ?? 'HQ');
  protected readonly mapDevices = computed(() => {
    const site = this.mapSite();
    const sel = this.sel();
    const l = this.store.devices().filter((d) => d.site === site && d.id !== sel?.id).slice(0, this.bigMap() ? 24 : 7);
    return sel && sel.site === site ? [sel, ...l] : l;
  });
  protected readonly donut = computed(() => {
    const C = 2 * Math.PI * 58;
    const tot = this.c().total || 1;
    let off = 0;
    return this.store.byType().map((s) => {
      const len = (s.n / tot) * C;
      const out = { ...s, color: DONUT_COLORS[s.type], pct: Math.round((s.n / tot) * 100), dash: `${Math.max(0, len - 1.2)} ${C}`, off: -off };
      off += len;
      return out;
    });
  });

  protected meta(t: DType) {
    return TYPE_META[t];
  }
  protected plural(t: DType) {
    return t === 'IoT Sensor' ? 'IoT Sensors' : TYPE_META[t].plural;
  }
  protected tileColor(d: Device) {
    return d.status === 'Offline' ? 'var(--ka-ef4444)' : d.status === 'Maintenance' ? 'var(--ka-f59e0b)' : d.type === 'Switch' ? 'var(--ka-3b6fd8)' : d.type === 'Access Point' ? 'var(--ka-1d8ff0)' : d.type === 'Camera' ? 'var(--ka-12b5a6)' : TYPE_META[d.type].color;
  }
  protected pct(n: number) {
    return Math.round((n / (this.c().total || 1)) * 100);
  }
  protected y(v: number) {
    return 186 - (v / 500) * 172;
  }
  protected seen(d: Device) {
    return fmtSeen(d.seenAgo);
  }
  protected uptime(d: Device) {
    return fmtUptime(d.uptimeH);
  }
  protected setStatus(s: string) {
    this.statusF.set(s);
    this.page.set(0);
  }
  protected pickType(t: DType) {
    this.typeF.set(this.typeF() === t ? 'All' : t);
    this.page.set(0);
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set(s.k === k ? (s.d === 1 ? { k, d: -1 } : { k: null, d: 1 }) : { k, d: 1 });
  }
  protected select(id: string) {
    this.selId.set(id);
    this.mapSiteSel.set(null);
  }
  protected toggle(id: string) {
    const s = new Set(this.checked());
    s.has(id) ? s.delete(id) : s.add(id);
    this.checked.set(s);
  }
  protected toggleAll() {
    const s = new Set(this.checked());
    const all = this.allChecked();
    for (const d of this.pageRows()) all ? s.delete(d.id) : s.add(d.id);
    this.checked.set(s);
  }
  protected clearMore() {
    this.fwF.set('Any');
    this.seenF.set('Any time');
    this.vendorF.set('Any');
    this.healthF.set('Any');
  }
  protected resetFilters() {
    this.q.set('');
    this.typeF.set('All');
    this.statusF.set('All');
    this.siteF.set('All');
    this.deptF.set('All');
    this.clearMore();
    this.page.set(0);
  }
  protected nav(p: string) {
    this.menu.set(null);
    this.router.navigateByUrl('/device-edge-management/' + p);
  }
  protected updateFw(d: Device) {
    if (d.firmware === TYPE_META[d.type].latest) return this.store.toastMsg(`${d.name} is already on the latest firmware (${d.firmware})`);
    this.store.updateFirmware([d.id]);
  }
  protected rowAct(a: string, d: Device) {
    this.rowMenu.set(null);
    this.menu.set(null);
    if (a === 'view') return this.details.set(d);
    if (a === 'reboot') return this.store.reboot(d);
    if (a === 'fw') return this.updateFw(d);
    if (a === 'ticket') return this.ticket.set({ d, subject: `${d.name} - ${d.status} device`, prio: d.status === 'Offline' ? 'High' : 'Medium', note: '' });
    if (a === 'replace') {
      this.store.focusId.set(d.id);
      return this.router.navigateByUrl('/device-edge-management/device-replacement');
    }
    if (a === 'maint' || a === 'online') {
      this.store.setStatus([d.id], a === 'maint' ? 'Maintenance' : 'Online');
      return this.store.toastMsg(`${d.name} ${a === 'maint' ? 'set to maintenance · alerts suppressed' : 'marked back online'}`);
    }
    if (a === 'decom') {
      this.store.setStatus([d.id], 'Inactive');
      this.store.toastMsg(`${d.name} decommissioned · licence released`);
    }
  }
  protected bulk(a: string) {
    const ids = [...this.checked()];
    if (a === 'export') return this.exportCsv(this.store.devices().filter((d) => ids.includes(d.id)));
    if (a === 'fw') this.store.updateFirmware(ids);
    if (a === 'maint') {
      this.store.setStatus(ids, 'Maintenance');
      this.store.toastMsg(`${ids.length} devices set to maintenance`);
    }
    if (a === 'reboot') {
      this.store.setStatus(ids, 'Maintenance');
      this.store.toastMsg(`Reboot sent to ${ids.length} devices`);
      setTimeout(() => this.store.setStatus(ids, 'Online'), 6000);
    }
    this.checked.set(new Set());
  }
  protected copy(d: Device) {
    this.menu.set(null);
    navigator.clipboard?.writeText(d.serial).catch(() => undefined);
    this.store.toastMsg(`Serial ${d.serial} copied`);
  }
  protected submitTicket() {
    const t = this.ticket()!;
    this.store.createTicket(t.d, `${t.prio} priority`);
    this.ticket.set(null);
  }
  protected discover() {
    this.menu.set(null);
    this.store.toastMsg('Scanning subnets 10.10.0.0/16 via SNMP, LLDP & ONVIF...');
    setTimeout(() => {
      const n = this.store.devices().length;
      ['Access Point', 'Camera', 'IoT Sensor'].forEach((t, i) => {
        const base = this.store.devices()[i + 10];
        this.store.addDevice({ ...base, id: `N${n + i}`, name: `NEW-${TYPE_META[t as DType].prefix}-${n + i}`, type: t as DType, model: TYPE_META[t as DType].models[0], serial: `SN90${n + i}112`, status: 'Inactive', seenAgo: 0, dept: 'IT', owner: 'Network Team' });
      });
      this.typeF.set('All');
      this.statusF.set('Inactive');
      this.page.set(0);
      this.store.toastMsg('Discovery complete · 3 new devices found (pending onboarding)');
    }, 1800);
  }

  // ---------- Add / edit ----------
  protected openAdd() {
    this.err.set('');
    const r = Math.floor(Math.random() * 1e6);
    this.form.set({ ...this.store.devices()[0], id: '', name: '', serial: `SN${100000000 + r}`, mac: `00:1A:2B:${r.toString(16).slice(0, 2).toUpperCase().padStart(2, '0')}:7E:11`, ip: '10.10.20.' + (100 + (r % 120)), status: 'Online', seenAgo: 0, uptimeH: 0, location: 'Building A - Floor 1', owner: OWNERS['IT'] });
  }
  protected openEdit(d: Device) {
    this.menu.set(null);
    this.err.set('');
    this.form.set({ ...d });
  }
  protected setF<K extends keyof Device>(k: K, v: Device[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected setType(t: DType) {
    this.form.update((f) => (f ? { ...f, type: t, model: TYPE_META[t].models[0], vendor: TYPE_META[t].vendor, firmware: TYPE_META[t].latest } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim() || !f.serial.trim()) return this.err.set('Device name and serial number are required.');
    if (this.store.devices().some((d) => d.serial === f.serial && d.id !== f.id)) return this.err.set('A device with this serial number already exists.');
    if (f.id) {
      this.store.patch(f.id, f);
      this.store.toastMsg(`${f.name} updated`);
    } else {
      const d: Device = { ...f, id: `N${Date.now()}`, fwUpdated: '14 Oct 2026', x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 };
      this.store.addDevice(d);
      this.resetFilters();
      this.selId.set(d.id);
      this.store.toastMsg(`${d.name} added · provisioning profile "${d.profile}" pushed`);
    }
    this.form.set(null);
  }
  protected importFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      rows.forEach((l, i) => {
        const [name, type, serial, site] = l.split(',').map((x) => x.replace(/"/g, '').trim());
        const t = (TYPES.includes(type as DType) ? type : 'Other') as DType;
        if (name) this.store.addDevice({ ...this.store.devices()[0], id: `I${Date.now()}${i}`, name, type: t, model: TYPE_META[t].models[0], serial: serial || `SN${Date.now()}${i}`, site: SITES.includes(site) ? site : 'HQ', status: 'Inactive', seenAgo: 0 });
      });
      this.store.toastMsg(`${rows.length} devices imported as Inactive (pending onboarding)`);
      input.value = '';
    };
    r.readAsText(file);
  }
  protected exportCsv(list: Device[]) {
    downloadCsv('device-inventory.csv', [
      ['Device Name', 'Type', 'Model', 'Vendor', 'Serial Number', 'MAC', 'IP', 'Site', 'Location', 'Department', 'Status', 'Firmware', 'Last Seen'],
      ...list.map((d) => [d.name, d.type, d.model, d.vendor, d.serial, d.mac, d.ip, d.site, d.location, d.dept, d.status, d.firmware, fmtSeen(d.seenAgo)]),
    ]);
    this.store.toastMsg(`Exported ${list.length.toLocaleString()} devices to CSV`);
  }
  protected print() {
    window.print();
  }
}
