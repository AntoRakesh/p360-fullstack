// Visitor Check-In / Check-Out — front-desk live console (reference image Nov 5 2026, 06_03_50).
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, ID_TYPES, PURPOSES, SITES, VISITOR_TYPES, VmStore, VmVisitor, dur, hm } from './vm.data';

type Tab = 'All Activity' | 'Expected' | 'Checked In' | 'Checked Out' | 'Overdue';
type SortKey = 'name' | 'company' | 'purpose' | 'host' | 'site' | 'time' | 'badge' | 'status';

const PURPOSE_ICON: Record<string, string> = {
  'Business Meeting': 'vm-c-card', Delivery: 'vm-c-cube', 'Site Visit': 'vm-c-hardhat', Interview: 'vm-c-interview', Maintenance: 'vm-c-wrench',
  'Project Discussion': 'message', 'Executive Meeting': 'star', Training: 'graduation-cap', Audit: 'file-check',
};
/** On-site durations shown in the reference image for the cast (minutes at page load). */
const SEED_DURATION: Record<string, number> = { 'VIS-000784': 102, 'VIS-000783': 105, 'VIS-000780': 69, 'VIS-000778': 129 };
/** Image KPI values vs. the seed dataset — offsets keep the image numbers while reacting to actions. */
const KPI_OFFSET = { expected: 5, checkedIn: 1 };
const ONSITE = (v: VmVisitor) => v.status === 'Checked In' || v.status === 'Overdue';

@Component({
  selector: 'app-vm-check-in-out',
  imports: [Icon, SelectValue, RouterLink, ...VM_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vm-page">
      <nav class="crumbs top"><a routerLink="/home"><app-icon name="home" [size]="15" /></a><app-icon name="chevron-right" [size]="13" /><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Visitor Check-In / Check-Out</b></nav>
      <div class="vm-head">
        <div>
          <h1>Visitor Check-In / Check-Out</h1>
          <p>Manage visitor arrivals, departures, badges, and on-site presence in real time.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openCheckIn()"><app-icon name="plus" [size]="18" />Check In Visitor</button>
          <button class="btn-ghost hb" (click)="openScan()"><app-icon name="vm-c-scan" [size]="20" />Scan Badge</button>
          <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="headMenu.set(!headMenu())" aria-label="More"><app-icon name="more" [size]="18" /></button>
            @if (headMenu()) {
              <div class="dropdown" (click)="headMenu.set(false)">
                <button class="dd-item" (click)="roster.set(true)"><app-icon name="vm-c-roster" [size]="15" />Emergency roster</button>
                <button class="dd-item" (click)="checkOutAllOverdue()"><app-icon name="vm-c-log-out" [size]="15" />Check out all overdue</button>
                <button class="dd-item" (click)="tab.set('Overdue')"><app-icon name="triangle-alert" [size]="15" />Show overdue only</button>
                <button class="dd-item" (click)="resetFilters()"><app-icon name="refresh" [size]="15" />Reset filters</button>
              </div>
            }
          </div>
        </div>
      </div>

      <div class="vm-kpis">
        <vm-kpi label="Expected Today" [value]="kpi().expected" icon="calendar-days" color="#7c3aed" [clickable]="true" [active]="tab() === 'Expected'" (pick)="tab.set('Expected')" />
        <vm-kpi label="Checked In" [value]="kpi().checkedIn" icon="vm-c-check-circle" color="#16a34a" [clickable]="true" [active]="tab() === 'Checked In'" (pick)="tab.set('Checked In')" />
        <vm-kpi label="Currently On-Site" [value]="kpi().onSite" icon="users" color="#2563eb" [clickable]="true" (pick)="scrollOnSite()" />
        <vm-kpi label="Overdue Check-Out" [value]="kpi().overdue" icon="triangle-alert" color="#dc2626" [clickable]="true" [active]="tab() === 'Overdue'" (pick)="tab.set('Overdue')" />
      </div>

      <div class="vm-bar">
        <vm-tabs [tabs]="tabs" [value]="tab()" (change)="tab.set($any($event))" />
        <label class="vm-search"><app-icon name="search" [size]="17" /><input placeholder="Search visitor, badge number, host..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="map-pin" [size]="16" /><span>Site:</span>
          <select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="vm-c-card" [size]="16" /><span>Visit Purpose:</span>
          <select [value]="purpose()" (change)="purpose.set($any($event.target).value)"><option value="">All</option>@for (s of purposes; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="user" [size]="16" /><span>Host:</span>
          <select [value]="host()" (change)="host.set($any($event.target).value)"><option value="">All</option>@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="sliders" [size]="16" /><span>Status:</span>
          <select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <button class="vm-icon-btn" title="Refresh / reset filters" (click)="resetFilters()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="grid">
        <section class="vm-card live">
          <div class="vm-card-head">
            <h2><app-icon name="users" [size]="26" />Live Visitor Activity</h2>
            <span class="spacer"></span>
            @if (picked().size) {
              <span class="bulk">{{ picked().size }} selected
                <button class="vm-mini" (click)="bulkCheckOut()">Check Out</button>
                <button class="vm-mini" (click)="bulkCheckIn()">Check In</button>
                <button class="vm-mini" (click)="exportCsv(true)">Export</button>
                <button class="vm-mini red" (click)="picked.set(emptySet())">Clear</button>
              </span>
            } @else {
              <small class="muted">{{ rows().length }} visitors · live</small>
            }
          </div>
          <div class="tw">
            <table class="vm-table">
              <thead><tr>
                <th class="cb"><input type="checkbox" [checked]="allPicked()" (change)="toggleAll()" /></th>
                <th class="sort" (click)="sortBy('name')">Visitor <app-icon [name]="sortIcon('name')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('company')">Company <app-icon [name]="sortIcon('company')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('purpose')">Purpose <app-icon [name]="sortIcon('purpose')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('host')">Host <app-icon [name]="sortIcon('host')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('site')">Site <app-icon [name]="sortIcon('site')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('time')">Arrival / Departure <app-icon [name]="sortIcon('time')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('badge')">Badge <app-icon [name]="sortIcon('badge')" [size]="13" /></th>
                <th class="sort" (click)="sortBy('status')">Status <app-icon [name]="sortIcon('status')" [size]="13" /></th>
                <th class="ac">Actions</th>
              </tr></thead>
              <tbody>
                @for (v of rows(); track v.id) {
                  <tr class="click" [class.sel]="v.id === selId()" (click)="selId.set(v.id)">
                    <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="picked().has(v.id)" (change)="togglePick(v.id)" /></td>
                    <td><div class="vm-person nm"><vm-avatar [name]="v.name" [size]="34" />{{ v.name }}</div></td>
                    <td class="w2">{{ short(v.company) }}</td>
                    <td><span class="ic pu"><app-icon [name]="purposeIcon(v.purpose)" [size]="17" />{{ v.purpose }}</span></td>
                    <td><span class="ic"><app-icon name="user" [size]="16" />{{ v.host }}</span></td>
                    <td><span class="ic site"><app-icon name="map-pin" [size]="16" />{{ v.site }}</span></td>
                    <td><span class="ic"><app-icon name="calendar-days" [size]="16" />{{ timeCell(v) }}</span></td>
                    <td class="nw">{{ v.badge || 'Not Issued' }}</td>
                    <td class="st">
                      @switch (v.status) {
                        @case ('Checked In') { <vm-status label="Checked In" icon="vm-c-check-circle" tone="green" /> }
                        @case ('Overdue') { <vm-status class="two" label="Overdue Check-Out" icon="triangle-alert" tone="red" /> }
                        @case ('Expected') { <vm-status label="Expected" icon="calendar-days" tone="purple" /> }
                        @case ('Checked Out') { <vm-status label="Checked Out" icon="vm-c-check-circle" tone="grey" /> }
                        @default { <vm-status class="two" [label]="v.status" /> }
                      }
                    </td>
                    <td (click)="$event.stopPropagation()">
                      <div class="vm-acts">
                        @switch (v.status) {
                          @case ('Expected') { <button class="vm-mini fill" (click)="checkIn(v)">Check In</button> }
                          @case ('Pending Approval') { <button class="vm-mini" (click)="approve(v)">Approve</button> }
                          @case ('Checked Out') {}
                          @case ('Cancelled') {}
                          @default { <button class="vm-mini" (click)="checkOut(v)">Check Out</button> }
                        }
                        <button class="vm-mini" [class.wide]="v.status === 'Checked Out' || v.status === 'Cancelled'" (click)="view.set(v.id)">View</button>
                        <button class="ia" aria-label="More actions" (click)="openMenu($event, v)"><app-icon name="more" [size]="18" /></button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="10" class="vm-empty">No visitors match the current filters.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="vm-card selp">
          <div class="vm-card-head"><h2><app-icon name="user" [size]="26" />Selected Visitor</h2></div>
          @if (sel(); as v) {
            <div class="sv-top">
              <vm-avatar [name]="v.name" [size]="78" [square]="true" />
              <div class="sv-id">
                <div class="sv-nm"><b>{{ v.name }}</b>
                  @if (onsite(v)) { <vm-status label="Host notified" icon="vm-c-check-circle" tone="green" /> }
                  @else if (v.status === 'Expected') { <vm-status label="Awaiting arrival" tone="orange" /> }
                  @else { <vm-status [label]="v.status" /> }
                </div>
                <span class="co">{{ v.company }}</span>
              </div>
            </div>
            <div class="sv-row">
              <span class="vtype"><app-icon name="vm-c-card" [size]="16" />Visitor Type: {{ v.type }}</span>
              <div class="dur-box" [class.off]="!onsite(v)">
                <app-icon name="clock" [size]="22" />
                <div><small>{{ onsite(v) ? 'On-site duration' : v.status === 'Checked Out' ? 'Total visit' : 'Expected at' }}</small>
                  @if (onsite(v)) { <b>{{ durText(v) }}<em>{{ secs() }}</em></b> }
                  @else if (v.status === 'Checked Out') { <b>{{ dur(v.checkIn, v.checkOut ?? v.checkIn ?? 0) }}</b> }
                  @else { <b>{{ hm(v.arrival) }}</b> }
                </div>
              </div>
            </div>
            <div class="sv-kv">
              <span><app-icon name="user" [size]="16" />Host</span><b>{{ v.host }}</b>
              <span><app-icon name="vm-c-card" [size]="16" />Purpose</span><b>{{ v.purpose }}</b>
              <span><app-icon name="map-pin" [size]="16" />Site</span><b>{{ v.site }}</b>
              <span><app-icon name="calendar-days" [size]="16" />Check-in Time</span><b>{{ v.checkIn != null ? hm(v.checkIn) : 'Not checked in' }}</b>
              <span><app-icon name="vm-c-card" [size]="16" />Badge</span><b>{{ v.badge || 'Not Issued' }}</b>
              <span class="top"><app-icon name="layers" [size]="16" />Access Areas</span>
              <b class="chips">@for (a of v.areas; track a) {<span class="area">{{ a }}</span>}</b>
            </div>
            @if (onsite(v)) {
              <button class="btn-primary vm-btn-big" (click)="checkOut(v)"><app-icon name="vm-c-log-out" [size]="20" />Check Out Visitor</button>
            } @else if (v.status === 'Expected' || v.status === 'Pending Approval') {
              <button class="btn-primary vm-btn-big" (click)="v.status === 'Expected' ? checkIn(v) : approve(v)"><app-icon name="vm-c-log-in" [size]="20" />{{ v.status === 'Expected' ? 'Check In Visitor' : 'Approve Visit' }}</button>
            } @else {
              <button class="btn-primary vm-btn-big" disabled><app-icon name="vm-c-check-circle" [size]="20" />Checked out at {{ hm(v.checkOut) }}</button>
            }
            <div class="two-btn">
              <button class="btn-outline" [disabled]="!v.badge" (click)="openReplace(v)"><app-icon name="vm-c-card" [size]="18" />Replace Badge</button>
              <button class="btn-outline" [disabled]="v.status === 'Checked Out'" (click)="openExtend(v)"><app-icon name="clock" [size]="18" />Extend Visit</button>
            </div>
          } @else {
            <div class="vm-empty">Select a visitor from the activity list.</div>
          }
        </section>
      </div>

      <section class="vm-card onsite" id="vm-onsite">
        <div class="vm-card-head">
          <h2><app-icon name="users" [size]="26" />On-Site Visitors</h2>
          <span class="count">{{ onSiteList().length }}</span>
          <span class="spacer"></span>
          @if (onSiteList().length > 4) {
            <span class="pager">
              <button class="vm-icon-btn sm" [disabled]="page() === 0" (click)="page.set(page() - 1)" aria-label="Previous"><app-icon name="chevron-left" [size]="16" /></button>
              <small>{{ page() * 4 + 1 }}–{{ min(page() * 4 + 4, onSiteList().length) }} of {{ onSiteList().length }}</small>
              <button class="vm-icon-btn sm" [disabled]="(page() + 1) * 4 >= onSiteList().length" (click)="page.set(page() + 1)" aria-label="Next"><app-icon name="chevron-right" [size]="16" /></button>
            </span>
          }
          <button class="btn-outline er" (click)="roster.set(true)"><app-icon name="vm-c-roster" [size]="20" />Emergency Roster</button>
        </div>
        <div class="os-grid">
          @for (v of onSitePage(); track v.id) {
            <div class="os-card" [class.sel]="v.id === selId()" (click)="selId.set(v.id)">
              <div class="os-top">
                <vm-avatar [name]="v.name" [size]="50" />
                <div class="os-nm"><b>{{ v.name }}</b><span>{{ v.company }}</span></div>
                <vm-status [label]="v.status === 'Overdue' ? 'Overdue' : 'On-site'" [tone]="v.status === 'Overdue' ? 'red' : 'green'" [icon]="v.status === 'Overdue' ? 'triangle-alert' : 'vm-c-check-circle'" />
              </div>
              <div class="os-kv">
                <span><app-icon name="user" [size]="15" />Host:</span><b>{{ v.host }}</b>
                <span><app-icon name="vm-c-card" [size]="15" />Badge:</span><b>{{ v.badge }}</b>
                <span><app-icon name="clock" [size]="15" />Duration:</span><b>{{ durText(v) }}</b>
              </div>
            </div>
          } @empty { <div class="vm-empty">No visitors on site.</div> }
        </div>
      </section>
    </div>

    <!-- row action menu (fixed so it is not clipped by the scrolling table) -->
    @if (menu(); as m) {
      <div class="veil" (click)="menu.set(null)"></div>
      <div class="dropdown fixed" [style.top.px]="m.y" [style.left.px]="m.x" (click)="menu.set(null)">
        <button class="dd-item" (click)="view.set(m.v.id)"><app-icon name="eye" [size]="15" />View details</button>
        <button class="dd-item" (click)="notifyHost(m.v)"><app-icon name="bell" [size]="15" />Notify host</button>
        @if (m.v.badge && m.v.status !== 'Checked Out') { <button class="dd-item" (click)="openReplace(m.v)"><app-icon name="vm-c-card" [size]="15" />Replace badge</button> }
        @if (m.v.status !== 'Checked Out') { <button class="dd-item" (click)="openExtend(m.v)"><app-icon name="clock" [size]="15" />Extend visit</button> }
        @if (m.v.status === 'Checked In') { <button class="dd-item" (click)="markOverdue(m.v)"><app-icon name="triangle-alert" [size]="15" />Flag as overdue</button> }
        @if (m.v.status === 'Checked Out') { <button class="dd-item" (click)="reCheckIn(m.v)"><app-icon name="vm-c-log-in" [size]="15" />Check in again</button> }
        <button class="dd-item" (click)="copyId(m.v)"><app-icon name="vm-c-clipboard" [size]="15" />Copy visit ID</button>
      </div>
    }

    <!-- check in -->
    @if (ciOpen()) {
      <div class="g-overlay" (click)="ciOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3><app-icon name="vm-c-log-in" [size]="20" />Check In Visitor</h3><button class="close-btn" (click)="ciOpen.set(false)">×</button></div>
        <vm-tabs [tabs]="['Expected Visitor', 'Walk-in Visitor']" [value]="ciMode()" (change)="ciMode.set($event)" />
        @if (ciMode() === 'Expected Visitor') {
          <label class="vm-search mt"><app-icon name="search" [size]="16" /><input placeholder="Search expected visitors by name, company, host or ID" [value]="ciQ()" (input)="ciQ.set($any($event.target).value)" /></label>
          <ul class="pick-list">
            @for (v of ciList(); track v.id) {
              <li>
                <vm-avatar [name]="v.name" [size]="36" />
                <div><b>{{ v.name }}</b><small>{{ v.company }} · Host {{ v.host }} · {{ v.id }}</small></div>
                <vm-status [label]="v.status === 'Expected' ? 'Expected ' + hm(v.arrival) : v.status" />
                <button class="vm-mini fill" (click)="v.status === 'Pending Approval' ? approve(v) : checkIn(v); ciOpen.set(false)">{{ v.status === 'Pending Approval' ? 'Approve & Check In' : 'Check In' }}</button>
              </li>
            } @empty { <li class="vm-empty">No expected visitors match.</li> }
          </ul>
        } @else {
          <div class="form-grid mt">
            <label class="full">Full name *<input class="input" [class.err]="wiErr() && !wi().name.trim()" [value]="wi().name" (input)="setWi('name', $any($event.target).value)" placeholder="e.g. Rohan Verma" /></label>
            <label>Company<input class="input" [value]="wi().company" (input)="setWi('company', $any($event.target).value)" placeholder="Company" /></label>
            <label>Visitor type<select class="input" [value]="wi().type" (change)="setWi('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
            <label>Host<select class="input" [value]="wi().host" (change)="setWi('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }} · {{ h.dept }}</option>}</select></label>
            <label>Purpose<select class="input" [value]="wi().purpose" (change)="setWi('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select></label>
            <label>Site<select class="input" [value]="wi().site" (change)="setWi('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
            <label>ID type<select class="input" [value]="wi().idType" (change)="setWi('idType', $any($event.target).value)">@for (s of idTypes; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          </div>
          <div class="form-actions"><button class="btn-ghost" (click)="ciOpen.set(false)">Cancel</button><button class="btn-primary" (click)="walkIn()"><app-icon name="vm-c-log-in" [size]="16" />Check In & Issue Badge</button></div>
        }
      </div>
    }

    <!-- scan badge -->
    @if (scan(); as s) {
      <div class="g-overlay" (click)="scan.set(null)"></div>
      <div class="g-modal narrow">
        <div class="modal-head"><h3><app-icon name="vm-c-scan" [size]="20" />Scan Badge</h3><button class="close-btn" (click)="scan.set(null)">×</button></div>
        @if (s.phase === 'scanning') {
          <div class="scanner"><div class="frame"><i class="line"></i><app-icon name="vm-c-badge" [size]="60" [stroke]="1.4" /></div><p>Hold the badge or QR pass under the reader…</p></div>
        } @else if (scanned(); as v) {
          <div class="scan-res">
            <vm-avatar [name]="v.name" [size]="64" [square]="true" />
            <div><b>{{ v.name }}</b><span>{{ v.company }}</span><small>{{ v.badge || v.id }} · Host {{ v.host }}</small></div>
            <vm-status [label]="v.status" />
          </div>
          <div class="form-actions">
            <button class="btn-ghost" (click)="startScan()"><app-icon name="vm-c-scan" [size]="16" />Scan again</button>
            <button class="btn-ghost" (click)="selId.set(v.id); view.set(v.id); scan.set(null)">View</button>
            @if (onsite(v)) { <button class="btn-primary" (click)="checkOut(v); scan.set(null)"><app-icon name="vm-c-log-out" [size]="16" />Check Out</button> }
            @else if (v.status === 'Expected') { <button class="btn-primary" (click)="checkIn(v); scan.set(null)"><app-icon name="vm-c-log-in" [size]="16" />Check In</button> }
          </div>
        } @else {
          <div class="vm-empty">No visitor found for “{{ s.code }}”.</div>
        }
        <div class="manual">
          <label class="vm-search"><app-icon name="search" [size]="16" /><input #code placeholder="Or type badge / visit number (e.g. VIS-000784)" (keydown.enter)="lookup(code.value)" /></label>
          <button class="btn-outline" (click)="lookup(code.value)">Look up</button>
        </div>
      </div>
    }

    <!-- replace badge -->
    @if (replaceFor(); as v) {
      <div class="g-overlay" (click)="replaceFor.set(null)"></div>
      <div class="g-modal narrow">
        <div class="modal-head"><h3><app-icon name="vm-c-card" [size]="20" />Replace Badge · {{ v.name }}</h3><button class="close-btn" (click)="replaceFor.set(null)">×</button></div>
        <p class="note">Current badge <b>{{ v.badge }}</b> will be deactivated on all readers and a new badge issued.</p>
        <div class="radios">
          @for (r of reasons; track r) { <div class="vm-radio" [class.on]="rpReason() === r" (click)="rpReason.set(r)"><i></i>{{ r }}</div> }
        </div>
        <label class="chk"><input type="checkbox" [checked]="rpPrint()" (change)="rpPrint.set(!rpPrint())" />Print the new badge on Reception Printer 01</label>
        <label class="chk"><input type="checkbox" [checked]="rpNotify()" (change)="rpNotify.set(!rpNotify())" />Notify host {{ v.host }}</label>
        <div class="form-actions"><button class="btn-ghost" (click)="replaceFor.set(null)">Cancel</button><button class="btn-primary" (click)="replaceBadge(v)">Deactivate & Issue New Badge</button></div>
      </div>
    }

    <!-- extend visit -->
    @if (extendFor(); as v) {
      <div class="g-overlay" (click)="extendFor.set(null)"></div>
      <div class="g-modal narrow">
        <div class="modal-head"><h3><app-icon name="clock" [size]="20" />Extend Visit · {{ v.name }}</h3><button class="close-btn" (click)="extendFor.set(null)">×</button></div>
        <p class="note">Scheduled departure <b>{{ hm(v.departure) }}</b>{{ v.status === 'Overdue' ? ' — visitor is overdue.' : '' }}</p>
        <div class="radios four">
          @for (o of extOpts; track o.m) { <div class="vm-radio" [class.on]="extMin() === o.m" (click)="extMin.set(o.m)"><i></i>{{ o.l }}</div> }
        </div>
        <p class="note">New departure: <b>{{ hm(newDeparture(v)) }}</b></p>
        <div class="vm-field"><label>Reason</label><span class="vm-input"><input [value]="extReason()" (input)="extReason.set($any($event.target).value)" placeholder="e.g. Meeting running late" /></span></div>
        <div class="form-actions"><button class="btn-ghost" (click)="extendFor.set(null)">Cancel</button><button class="btn-primary" (click)="extend(v)">Extend Visit</button></div>
      </div>
    }

    <!-- emergency roster -->
    @if (roster()) {
      <div class="g-overlay" (click)="roster.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3><app-icon name="vm-c-roster" [size]="20" />Emergency Roster · {{ onSiteList().length }} visitors on site</h3><button class="close-btn" (click)="roster.set(false)">×</button></div>
        <p class="note">Generated {{ hm(store.now()) }} — hand to fire wardens / muster point leads.</p>
        <div class="roster-tw">
          <table class="vm-table">
            <thead><tr><th>#</th><th>Visitor</th><th>Company</th><th>Host</th><th>Site</th><th>Last location</th><th>Badge</th><th>Checked in</th></tr></thead>
            <tbody>@for (v of onSiteList(); track v.id; let i = $index) {
              <tr><td>{{ i + 1 }}</td><td><b>{{ v.name }}</b></td><td>{{ v.company }}</td><td>{{ v.host }}</td><td>{{ v.site }}</td><td>{{ v.location }}</td><td>{{ v.badge }}</td><td>{{ hm(v.checkIn) }}</td></tr>
            }</tbody>
          </table>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="exportRoster()"><app-icon name="download" [size]="16" />CSV</button>
          <button class="btn-outline" (click)="printRoster()"><app-icon name="vm-c-printer" [size]="16" />Print Roster</button>
          <button class="btn-primary" (click)="roster.set(false); goAccountability()"><app-icon name="vm-c-roster" [size]="16" />Start Emergency Accountability</button>
        </div>
      </div>
    }

    <!-- view drawer -->
    @if (viewV(); as v) {
      <div class="g-overlay" (click)="view.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Visit {{ v.id }}</h3><button class="close-btn" (click)="view.set(null)">×</button></div>
        <div class="dv-top"><vm-avatar [name]="v.name" [size]="64" [square]="true" /><div><b>{{ v.name }}</b><span>{{ v.company }}</span><vm-status [label]="v.status" /></div></div>
        <div class="vm-kv dv">
          <span>Type</span><b>{{ v.type }}</b><span>Purpose</span><b>{{ v.purpose }}</b><span>Host</span><b>{{ v.host }}</b><span>Site</span><b>{{ v.site }}</b>
          <span>Scheduled</span><b>{{ hm(v.arrival) }} – {{ hm(v.departure) }}</b><span>Check-in</span><b>{{ hm(v.checkIn) }}</b><span>Check-out</span><b>{{ hm(v.checkOut) }}</b>
          <span>Badge</span><b>{{ v.badge || 'Not Issued' }}</b><span>ID</span><b>{{ v.idType }} · {{ v.idNo }}</b><span>Email</span><b>{{ v.email }}</b><span>Phone</span><b>{{ v.phone }}</b>
          <span>Location</span><b>{{ v.location }}</b><span>Risk</span><b><vm-status [label]="v.risk" /></b>
        </div>
        <h4>Activity</h4>
        <ul class="tl">@for (e of eventsOf(v); track $index) {<li><time>{{ hm(e.at) }}</time>{{ e.text }}</li>} @empty {<li class="muted">No activity recorded yet.</li>}</ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="selId.set(v.id); view.set(null)">Select in console</button>
          @if (onsite(v)) { <button class="btn-primary" (click)="checkOut(v)">Check Out</button> }
          @else if (v.status === 'Expected') { <button class="btn-primary" (click)="checkIn(v)">Check In</button> }
        </div>
      </aside>
    }

    @if (toast()) { <div class="g-toast"><app-icon name="vm-c-check-circle" [size]="16" />{{ toast() }}</div> }
  `,
  styles: `
    :host { display: block; }
    .crumbs b { font-weight: 600; color: var(--text); }
    .crumbs a { display: inline-flex; color: inherit; }
    .hb { height: 40px; font-size: 14.5px; padding: 0 18px; }
    .vm-icon-btn.tall { height: 40px; }
    .vm-bar .vm-search { min-width: 170px; }
    .vm-bar .vm-filter select { field-sizing: content; max-width: 190px; }
    .vm-bar { flex-wrap: nowrap; } .vm-bar vm-tabs { flex-wrap: nowrap; }
    :host ::ng-deep vm-avatar rect:not([fill]) { fill: #e9e3ff; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 395px; gap: 14px; align-items: stretch; }
    .live { display: flex; flex-direction: column; padding-bottom: 8px; }
    .tw { flex: 1 1 0; min-height: 300px; contain: size; overflow: auto; scrollbar-width: thin; margin: 0 -4px; padding: 0 4px; }
    .tw thead th { position: sticky; top: 0; z-index: 1; }
    .vm-table td { font-size: 12px; line-height: 1.25; padding: 6px 3px; }
    .tw vm-status { font-size: 11.5px; padding: 3px 7px; gap: 4px; }
    .tw vm-status.two { white-space: normal; max-width: 96px; line-height: 1.15; }
    td.st { min-width: 100px; }
    .tw .vm-table th { font-size: 12px; padding: 9px 3px; }
    .vm-table th { padding: 9px 4px; white-space: normal; }
    .vm-acts { gap: 4px; } .vm-acts .vm-mini { padding: 3px 6px; font-size: 11.5px; }
    .vm-table th app-icon { vertical-align: -2px; color: #64748b; }
    .cb { width: 26px; } .cb input { width: 16px; height: 16px; accent-color: var(--primary); }
    .nm { white-space: normal; font-size: 12.5px; line-height: 1.2; min-width: 84px; max-width: 96px; gap: 7px; }
    .w2 { max-width: 74px; }
    .ic { display: flex; align-items: center; gap: 5px; max-width: 100px; }
    .ic.site { min-width: 92px; } .ic.pu { max-width: 92px; }
    .ic app-icon { width: 15px; }
    .ic app-icon { color: #475569; }
    .nw { white-space: nowrap; }
    vm-status.two { white-space: normal; max-width: 92px; line-height: 1.15; text-align: center; }
    .ac { text-align: center; }
    .vm-mini.wide { min-width: 74px; justify-content: center; }
    .bulk { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--primary); }
    .muted { color: var(--muted); }
    .selp { display: flex; flex-direction: column; gap: 10px; }
    .selp .vm-card-head { margin-bottom: 0; }
    .sv-top { display: flex; gap: 14px; align-items: flex-start; }
    .sv-top vm-avatar { flex: none; }
    .sv-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sv-nm { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sv-nm b { font-size: 21px; font-weight: 700; }
    .co { font-size: 14px; color: #334155; }
    .sv-row { display: flex; align-items: center; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
    .vtype { display: inline-flex; align-items: center; gap: 6px; background: #f1edff; color: #3b2a6b; border-radius: 6px; padding: 6px 9px; font-size: 12.5px; white-space: nowrap; }
    .dur-box { display: flex; align-items: center; gap: 6px; border: 1.5px solid #c4b5fd; border-radius: 10px; padding: 4px 8px; background: #faf8ff; color: var(--primary); }
    .dur-box div { display: flex; flex-direction: column; line-height: 1.1; }
    .dur-box small { color: var(--text); font-size: 11.5px; }
    .dur-box b { font-size: 20px; white-space: nowrap; font-weight: 800; color: var(--primary); }
    .dur-box em { font-style: normal; font-size: 11px; font-weight: 600; color: #a78bfa; margin-left: 3px; }
    .dur-box.off { border-color: var(--border); color: #64748b; } .dur-box.off b { color: var(--text); font-size: 17px; }
    .sv-kv { display: grid; grid-template-columns: 150px 1fr; font-size: 13.5px; }
    .sv-kv > span, .sv-kv > b { padding: 6px 0; border-bottom: 1px solid #f0f0f6; }
    .sv-kv > span { display: flex; align-items: center; gap: 10px; font-weight: 600; padding-left: 4px; }
    .sv-kv > span app-icon { color: #475569; }
    .sv-kv > span.top { align-items: flex-start; border-bottom: 0; }
    .sv-kv > b { font-weight: 500; }
    .sv-kv > b.chips { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 0; }
    .area { border: 1px solid #c4b5fd; color: #4c1d95; background: #f5f0ff; border-radius: 14px; padding: 3px 11px; font-size: 12px; font-weight: 500; }
    .vm-btn-big { margin-top: 2px; }
    .two-btn { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .two-btn button { justify-content: center; height: 38px; font-size: 14.5px; }
    button:disabled { opacity: .5; cursor: default; }
    .onsite .vm-card-head { margin-bottom: 10px; }
    .count { background: #ede9fe; color: var(--primary); font-weight: 700; font-size: 12px; border-radius: 10px; padding: 2px 9px; }
    .pager { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
    .vm-icon-btn.sm { width: 28px; height: 28px; }
    .er { height: 36px; font-size: 14.5px; padding: 0 16px; }
    .os-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .os-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
    .os-card:hover { box-shadow: 0 4px 14px rgba(80, 40, 160, .1); }
    .os-card.sel { border-color: #a78bfa; background: #fdfcff; }
    .os-top { display: flex; align-items: center; gap: 12px; }
    .os-nm { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .os-nm b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .os-nm span { font-size: 13px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .os-kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin-top: 10px; font-size: 13px; }
    .os-kv span { display: flex; align-items: center; gap: 8px; color: var(--text); }
    .os-kv span app-icon { color: #475569; }
    .os-kv b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .veil { position: fixed; inset: 0; z-index: 55; }
    .dropdown.fixed { position: fixed; right: auto; z-index: 56; }
    .modal-head h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 18px; }
    .modal-head h3 app-icon { color: var(--primary); }
    .g-modal.narrow { width: min(520px, calc(100vw - 32px)); }
    .mt { margin-top: 12px; }
    .input { height: 36px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; font: inherit; font-size: 13px; color: var(--text); background: #fff; }
    .input.err { border-color: #f87171; }
    .pick-list { list-style: none; margin: 10px 0 0; padding: 0; max-height: 360px; overflow: auto; }
    .pick-list li { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid #f0f0f6; }
    .pick-list li > div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .pick-list small { color: var(--muted); }
    .scanner { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; color: var(--muted); }
    .frame { position: relative; width: 180px; height: 140px; border-radius: 14px; border: 2px dashed #a78bfa; display: grid; place-items: center; color: #7c3aed; overflow: hidden; background: #faf8ff; }
    .line { position: absolute; left: 8px; right: 8px; height: 3px; background: #22c55e; box-shadow: 0 0 12px #22c55e; animation: sweep 1.1s ease-in-out infinite alternate; }
    @keyframes sweep { from { top: 10px; } to { top: calc(100% - 13px); } }
    .scan-res { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 12px; background: #f5f0ff; }
    .scan-res > div { flex: 1; display: flex; flex-direction: column; }
    .scan-res b { font-size: 17px; } .scan-res small { color: var(--muted); }
    .manual { display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
    .note { font-size: 13px; color: #475569; margin: 0 0 10px; }
    .radios { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .radios.four { grid-template-columns: repeat(4, 1fr); }
    .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 6px 0; }
    .chk input { accent-color: var(--primary); width: 16px; height: 16px; }
    .roster-tw { max-height: 52vh; overflow: auto; }
    .dv-top { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
    .dv-top div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
    .dv-top b { font-size: 18px; }
    .vm-kv.dv { font-size: 13px; }
    .vm-kv.dv > b { overflow-wrap: anywhere; }
    h4 { margin: 18px 0 8px; }
    .tl { list-style: none; margin: 0; padding: 0; font-size: 13px; }
    .tl li { padding: 6px 0 6px 14px; border-left: 2px solid #ddd6fe; position: relative; }
    .tl li::before { content: ''; position: absolute; left: -5px; top: 11px; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }
    .tl time { font-weight: 700; margin-right: 8px; color: var(--primary); }
    .g-toast { display: flex; align-items: center; gap: 8px; }
    @media (max-width: 1350px) { .grid { grid-template-columns: 1fr; } .os-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class CheckInOut {
  protected readonly store = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly hm = hm;
  protected readonly dur = dur;
  protected readonly min = Math.min;
  protected readonly tabs: Tab[] = ['All Activity', 'Expected', 'Checked In', 'Checked Out', 'Overdue'];
  protected readonly sites = SITES;
  protected readonly purposes = PURPOSES;
  protected readonly hosts = HOSTS;
  protected readonly types = VISITOR_TYPES;
  protected readonly idTypes = ID_TYPES;
  protected readonly statuses = ['Checked In', 'Expected', 'Pending Approval', 'Overdue', 'Checked Out'];
  protected readonly reasons = ['Lost badge', 'Damaged badge', 'Left badge behind', 'Name / photo correction'];
  protected readonly extOpts = [{ m: 30, l: '+30 min' }, { m: 60, l: '+1 hour' }, { m: 120, l: '+2 hours' }, { m: -1, l: 'Until 6 PM' }];

  protected readonly tab = signal<Tab>('All Activity');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly purpose = signal('');
  protected readonly host = signal('');
  protected readonly status = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 1 | -1 } | null>(null);
  protected readonly picked = signal(new Set<string>());
  protected readonly selId = signal<string | null>('VIS-000784');
  protected readonly page = signal(0);
  protected readonly headMenu = signal(false);
  protected readonly menu = signal<{ x: number; y: number; v: VmVisitor } | null>(null);
  protected readonly view = signal<string | null>(null);
  protected readonly roster = signal(false);
  protected readonly toast = signal('');
  /** visitors checked in from this console float to the top of the on-site cards */
  private readonly recent = signal<string[]>([]);
  private readonly seedDur = signal<Record<string, number>>({ ...SEED_DURATION });
  private readonly t0 = Date.now();
  private readonly elapsed = signal(0); // seconds since page opened (live durations)

  constructor() {
    const id = setInterval(() => this.elapsed.set(Math.floor((Date.now() - this.t0) / 1000)), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected readonly kpi = computed(() => {
    const l = this.store.visitors();
    let expected = 0, checkedIn = 0, onSite = 0, overdue = 0;
    for (const v of l) {
      if (v.status === 'Expected') expected++;
      if (v.checkIn != null && v.status !== 'Expected' && v.status !== 'Pending Approval') checkedIn++;
      if (ONSITE(v)) onSite++;
      if (v.status === 'Overdue') overdue++;
    }
    return { expected: expected + KPI_OFFSET.expected, checkedIn: checkedIn + KPI_OFFSET.checkedIn, onSite, overdue };
  });

  protected readonly rows = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase(), s = this.site(), p = this.purpose(), h = this.host(), st = this.status();
    let l = this.store.visitors().filter((v) => {
      if (v.status === 'Cancelled') return false;
      if (t === 'Expected' && v.status !== 'Expected' && v.status !== 'Pending Approval') return false;
      if (t === 'Checked In' && v.status !== 'Checked In') return false;
      if (t === 'Checked Out' && v.status !== 'Checked Out') return false;
      if (t === 'Overdue' && v.status !== 'Overdue') return false;
      if (s && v.site !== s) return false;
      if (p && v.purpose !== p) return false;
      if (h && v.host !== h) return false;
      if (st && v.status !== st) return false;
      if (q && !`${v.name} ${v.company} ${v.badge} ${v.id} ${v.host}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const so = this.sort();
    if (so) {
      const key = (v: VmVisitor): string | number =>
        so.k === 'time' ? (v.checkIn ?? v.arrival) : so.k === 'badge' ? v.badge || 'zzz' : so.k === 'name' ? v.name : v[so.k];
      l = [...l].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * so.dir);
    }
    return l;
  });
  protected readonly allPicked = computed(() => this.rows().length > 0 && this.rows().every((v) => this.picked().has(v.id)));
  protected readonly sel = computed(() => (this.selId() ? this.store.byId(this.selId()!) : null));
  protected readonly viewV = computed(() => (this.view() ? this.store.byId(this.view()!) : null));
  protected readonly onSiteList = computed(() => {
    const rec = this.recent();
    const l = this.store.onSite();
    const first = rec.map((id) => l.find((v) => v.id === id)).filter((v): v is VmVisitor => !!v);
    return [...first, ...l.filter((v) => !rec.includes(v.id))];
  });
  protected readonly onSitePage = computed(() => {
    const max = Math.max(0, Math.ceil(this.onSiteList().length / 4) - 1);
    const p = Math.min(this.page(), max);
    return this.onSiteList().slice(p * 4, p * 4 + 4);
  });
  protected readonly secs = computed(() => `${String(this.elapsed() % 60).padStart(2, '0')}s`);

  protected onsite(v: VmVisitor) { return ONSITE(v); }
  protected short(c: string) { return c.replace(/ Pvt\. Ltd\.$/, ''); }
  protected purposeIcon(p: string) { return PURPOSE_ICON[p] ?? 'vm-c-card'; }
  protected timeCell(v: VmVisitor) {
    if (v.status === 'Expected') return `Expected ${hm(v.arrival)}`;
    if (v.status === 'Pending Approval') return `${hm(v.arrival)} (pending)`;
    return hm(v.checkIn);
  }
  protected durMin(v: VmVisitor) {
    const base = this.seedDur()[v.id] ?? Math.max(0, this.store.now() - (v.checkIn ?? this.store.now()));
    return base + Math.floor(this.elapsed() / 60);
  }
  protected durText(v: VmVisitor) {
    const m = this.durMin(v);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set(!s || s.k !== k ? { k, dir: 1 } : s.dir === 1 ? { k, dir: -1 } : null);
  }
  protected sortIcon(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 1 ? 'arrow-up' : 'arrow-down') : 'vm-c-sort';
  }
  protected emptySet() { return new Set<string>(); }
  protected togglePick(id: string) {
    const n = new Set(this.picked());
    n.has(id) ? n.delete(id) : n.add(id);
    this.picked.set(n);
  }
  protected toggleAll() {
    this.picked.set(this.allPicked() ? new Set() : new Set(this.rows().map((v) => v.id)));
  }
  protected resetFilters() {
    this.tab.set('All Activity'); this.q.set(''); this.site.set(''); this.purpose.set(''); this.host.set(''); this.status.set(''); this.sort.set(null);
    this.say('Filters reset — showing live activity');
  }
  protected openMenu(e: MouseEvent, v: VmVisitor) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menu.set({ x: Math.min(r.right - 190, window.innerWidth - 200), y: Math.min(r.bottom + 4, window.innerHeight - 290), v });
  }
  protected scrollOnSite() { document.getElementById('vm-onsite')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

  /* ---- actions ---- */
  protected checkIn(v: VmVisitor) {
    const badge = this.store.checkIn(v.id);
    this.recent.update((l) => [v.id, ...l.filter((x) => x !== v.id)]);
    this.seedDur.update((m) => { const n = { ...m }; delete n[v.id]; return n; });
    this.selId.set(v.id);
    this.page.set(0);
    this.say(`${v.name} checked in · badge ${badge} issued · host ${v.host} notified`);
  }
  protected checkOut(v: VmVisitor) {
    const d = this.durText(v);
    this.store.checkOut(v.id);
    this.say(`${v.name} checked out after ${d} · badge ${v.badge} returned`);
  }
  protected reCheckIn(v: VmVisitor) { this.store.patch(v.id, { checkOut: null }); this.checkIn(v); }
  protected approve(v: VmVisitor) {
    this.store.patch(v.id, { status: 'Expected' });
    this.store.log({ text: `${v.name}'s visit approved by ${v.host}`, kind: 'approval', visitor: v.id });
    this.say(`${v.name} approved — now expected at ${hm(v.arrival)}`);
  }
  protected markOverdue(v: VmVisitor) {
    this.store.patch(v.id, { status: 'Overdue' });
    this.store.log({ text: `${v.name} flagged overdue for check-out`, kind: 'alert', visitor: v.id });
    this.say(`${v.name} flagged as overdue`);
  }
  protected notifyHost(v: VmVisitor) {
    this.store.log({ text: `Host ${v.host} notified about ${v.name}`, kind: 'notify', visitor: v.id });
    this.say(`${v.host} notified via Email + Push`);
  }
  protected copyId(v: VmVisitor) {
    navigator.clipboard?.writeText(v.id).catch(() => {});
    this.say(`${v.id} copied to clipboard`);
  }
  protected bulkCheckOut() {
    const l = this.store.visitors().filter((v) => this.picked().has(v.id) && ONSITE(v));
    l.forEach((v) => this.store.checkOut(v.id));
    this.picked.set(new Set());
    this.say(l.length ? `${l.length} visitor(s) checked out` : 'No on-site visitors in the selection');
  }
  protected bulkCheckIn() {
    const l = this.store.visitors().filter((v) => this.picked().has(v.id) && v.status === 'Expected');
    l.forEach((v) => this.store.checkIn(v.id));
    this.recent.update((r) => [...l.map((v) => v.id), ...r]);
    this.picked.set(new Set());
    this.say(l.length ? `${l.length} visitor(s) checked in` : 'No expected visitors in the selection');
  }
  protected checkOutAllOverdue() {
    const l = this.store.visitors().filter((v) => v.status === 'Overdue');
    l.forEach((v) => this.store.checkOut(v.id));
    this.say(`${l.length} overdue visitor(s) checked out`);
  }
  protected exportCsv(onlyPicked = false) {
    const l = onlyPicked ? this.rows().filter((v) => this.picked().has(v.id)) : this.rows();
    downloadCsv('visitor-check-in-out.csv', [
      ['Visit ID', 'Visitor', 'Company', 'Purpose', 'Host', 'Site', 'Check-in', 'Check-out', 'Badge', 'Status'],
      ...l.map((v) => [v.id, v.name, v.company, v.purpose, v.host, v.site, hm(v.checkIn), hm(v.checkOut), v.badge || 'Not Issued', v.status]),
    ]);
    this.say(`Exported ${l.length} rows`);
  }

  /* ---- check in modal ---- */
  protected readonly ciOpen = signal(false);
  protected readonly ciMode = signal('Expected Visitor');
  protected readonly ciQ = signal('');
  protected readonly ciList = computed(() => {
    const q = this.ciQ().trim().toLowerCase();
    return this.store.visitors()
      .filter((v) => (v.status === 'Expected' || v.status === 'Pending Approval') && (!q || `${v.name} ${v.company} ${v.host} ${v.id}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.status === b.status ? a.arrival - b.arrival : a.status === 'Expected' ? -1 : 1))
      .slice(0, 40);
  });
  protected readonly wi = signal({ name: '', company: '', type: VISITOR_TYPES[0], host: HOSTS[0].name, purpose: PURPOSES[0], site: SITES[0], idType: ID_TYPES[0] });
  protected readonly wiErr = signal(false);
  protected setWi(k: string, val: string) { this.wi.update((w) => ({ ...w, [k]: val })); }
  protected openCheckIn() { this.ciOpen.set(true); this.ciQ.set(''); this.wiErr.set(false); }
  protected walkIn() {
    const w = this.wi();
    if (!w.name.trim()) { this.wiErr.set(true); return; }
    const v = this.store.add({ ...w, name: w.name.trim(), company: w.company || 'Walk-in', areas: ['Main Entrance', AREAS[2]], escort: w.host }, 'Checked In');
    this.recent.update((l) => [v.id, ...l]);
    this.selId.set(v.id);
    this.page.set(0);
    this.ciOpen.set(false);
    this.wi.update((x) => ({ ...x, name: '', company: '' }));
    this.say(`${v.name} checked in as walk-in · badge ${v.id} issued`);
  }

  /* ---- scan ---- */
  protected readonly scan = signal<{ phase: 'scanning' | 'done'; code: string; id: string | null } | null>(null);
  protected readonly scanned = computed(() => { const s = this.scan(); return s?.id ? this.store.byId(s.id) : null; });
  private scanN = 0;
  protected openScan() { this.startScan(); }
  protected startScan() {
    this.scan.set({ phase: 'scanning', code: '', id: null });
    setTimeout(() => {
      if (!this.scan()) return;
      const l = this.store.visitors();
      // alternate between an expected arrival and an on-site visitor so both actions can be demoed
      const pool = this.scanN++ % 2 === 0 ? l.filter((v) => v.status === 'Expected') : l.filter(ONSITE);
      const v = pool[Math.floor(Math.random() * Math.min(pool.length, 12))] ?? l[0];
      this.scan.set({ phase: 'done', code: v.badge || v.id, id: v.id });
      this.selId.set(v.id);
      this.store.log({ text: `Badge ${v.badge || v.id} scanned at Main Entrance reader`, kind: 'badge', visitor: v.id });
    }, 1400);
  }
  protected lookup(code: string) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const v = this.store.visitors().find((x) => x.badge.toUpperCase() === c || x.id === c || x.name.toUpperCase() === c);
    this.scan.set({ phase: 'done', code: c, id: v?.id ?? null });
    if (v) this.selId.set(v.id);
  }

  /* ---- replace badge ---- */
  protected readonly replaceFor = signal<VmVisitor | null>(null);
  protected readonly rpReason = signal('Lost badge');
  protected readonly rpPrint = signal(true);
  protected readonly rpNotify = signal(true);
  protected openReplace(v: VmVisitor) { this.replaceFor.set(v); this.rpReason.set('Lost badge'); }
  protected replaceBadge(v: VmVisitor) {
    const nb = this.store.nextBadge();
    this.store.patch(v.id, { badge: nb });
    this.store.log({ text: `Badge ${v.badge} deactivated (${this.rpReason()}) · ${nb} issued to ${v.name}`, kind: 'badge', visitor: v.id });
    this.replaceFor.set(null);
    this.say(`${v.badge} deactivated · new badge ${nb}${this.rpPrint() ? ' sent to Reception Printer 01' : ''}${this.rpNotify() ? ' · host notified' : ''}`);
  }

  /* ---- extend ---- */
  protected readonly extendFor = signal<VmVisitor | null>(null);
  protected readonly extMin = signal(60);
  protected readonly extReason = signal('');
  protected openExtend(v: VmVisitor) { this.extendFor.set(v); this.extMin.set(60); this.extReason.set(''); }
  protected newDeparture(v: VmVisitor) {
    const m = this.extMin();
    return m < 0 ? 18 * 60 : Math.max(v.departure, this.store.now()) + m;
  }
  protected extend(v: VmVisitor) {
    const d = this.newDeparture(v);
    this.store.patch(v.id, { departure: d, status: v.status === 'Overdue' ? 'Checked In' : v.status });
    this.store.log({ text: `${v.name}'s visit extended to ${hm(d)}${this.extReason() ? ` (${this.extReason()})` : ''}`, kind: 'system', visitor: v.id });
    this.extendFor.set(null);
    this.say(`Visit extended until ${hm(d)}${v.status === 'Overdue' ? ' · overdue alert cleared' : ''}`);
  }

  /* ---- roster / view ---- */
  protected eventsOf(v: VmVisitor) { return this.store.events().filter((e) => e.visitor === v.id || e.visitor === v.badge || e.text.includes(v.name)); }
  protected goAccountability() { this.router.navigateByUrl('/visitor-management/emergency-visitor-accountability'); }
  protected exportRoster() {
    downloadCsv('emergency-visitor-roster.csv', [['Visitor', 'Company', 'Host', 'Site', 'Location', 'Badge', 'Checked in'], ...this.onSiteList().map((v) => [v.name, v.company, v.host, v.site, v.location, v.badge, hm(v.checkIn)])]);
  }
  protected printRoster() {
    const rows = this.onSiteList().map((v, i) => `<tr><td>${i + 1}</td><td>${v.name}</td><td>${v.company}</td><td>${v.host}</td><td>${v.site}</td><td>${v.location}</td><td>${v.badge}</td><td>${hm(v.checkIn)}</td><td>☐</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=1000,height=800');
    if (!w) { this.say('Allow pop-ups to print the roster'); return; }
    w.document.write(`<html><head><title>Emergency Visitor Roster</title><style>body{font:13px system-ui;padding:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3f0ff}</style></head><body><h1>Emergency Visitor Roster — ${this.onSiteList().length} on site</h1><p>Generated ${hm(this.store.now())}</p><table><tr><th>#</th><th>Visitor</th><th>Company</th><th>Host</th><th>Site</th><th>Location</th><th>Badge</th><th>Checked in</th><th>Accounted</th></tr>${rows}</table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
    this.say('Roster sent to printer');
  }

  private tt?: ReturnType<typeof setTimeout>;
  protected say(m: string) {
    this.toast.set(m);
    clearTimeout(this.tt);
    this.tt = setTimeout(() => this.toast.set(''), 2800);
  }
}
