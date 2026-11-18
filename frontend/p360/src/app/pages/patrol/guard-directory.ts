import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { FloorPlan, MapMarker } from '../rtls/floor-plan';
import { GuardForm, CallModal, MessageModal } from './patrol-modals';
import { CertBadge, GuardAvatar, PATROL_CSS, PKpi, statusCls, toastFn } from './patrol-ui';
import { CERT_TYPES, certType, COMPANY_NAMES, fmtD, GCert, Guard, GStatus, hash, initials, POST_ZONES, postByName, PatrolStore, SHIFTS, SITE_NAMES, WEEK_DAYS, RCODE } from './patrol.data';

const TABS = ['Overview', 'Assignment', 'Certifications', 'Documents'] as const;
const MORE_TABS = ['Equipment', 'Permits', 'Activity'] as const;
type Tab = (typeof TABS)[number] | (typeof MORE_TABS)[number];
const BASE = '/patrol-guard-management';
const DOCS = ['Passport Copy.pdf', 'Emirates ID.pdf', 'SIRA License Card.pdf', 'Residence Visa.pdf', 'Employment Contract.pdf', 'Medical Fitness Report.pdf'];

@Component({
  selector: 'app-guard-directory',
  imports: [...UI, PKpi, GuardAvatar, CertBadge, FloorPlan, GuardForm, CallModal, MessageModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Guard Directory" parent="Patrol &amp; Guard Management" [parentLink]="base" subtitle="Manage all security guards, their profiles, assignments, certifications and compliance.">
      <button class="btn-primary" (click)="form.set({})"><app-icon name="plus" [size]="16" />Add Guard</button>
      <label class="btn-ghost"><app-icon name="download" [size]="16" />Import Guards<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost sq" (click)="more.set(!more())" aria-label="More"><app-icon name="more" [size]="18" /></button>
        @if (more()) {
          <div class="dropdown right">
            <button class="dd-item" (click)="more.set(false); msgTo.set(filtered().filter(isOn))">Message all on-duty ({{ onCount() }})</button>
            <button class="dd-item" (click)="more.set(false); go('training-certifications')">Manage certifications</button>
            <button class="dd-item" (click)="more.set(false); downloadTemplate()">Download import template</button>
            <button class="dd-item" (click)="more.set(false); print()">Print directory</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpis">
      <app-pkpi label="Total Guards" [value]="c().total" icon="user" color="var(--ka-8b5cf6)" change="6%" [arrow]="true" changeColor="var(--ka-16a34a)" sub="vs. last month" />
      <app-pkpi label="On Duty Now" [value]="c().on" icon="user-check" color="var(--ka-22c55e)" [change]="pct(c().on) + '%'" changeColor="var(--ka-16a34a)" sub="of total" />
      <app-pkpi label="Off Duty" [value]="c().off" icon="clock" color="var(--ka-f59e0b)" [change]="pct(c().off) + '%'" changeColor="var(--ka-2563eb)" sub="of total" />
      <app-pkpi label="Expiring Certifications" [value]="c().expiring" icon="shield-check" color="var(--ka-ef4444)" change="12%" [arrow]="true" changeColor="var(--ka-dc2626)" sub="within 30 days" />
      <app-pkpi label="New Joiners (This Month)" [value]="c().newJoin" icon="shield" color="var(--ka-2563eb)" change="100%" [arrow]="true" changeColor="var(--ka-2563eb)" sub="vs. last month" />
    </section>

    <section class="card main">
      <div class="bar">
        <label class="search-box sb"><app-icon name="search" [size]="16" /><input placeholder="Search by name, ID, mobile, company..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
        <select class="select f" [value]="site()" (change)="site.set($any($event.target).value); page.set(0)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
        <select class="select f" [value]="status()" (change)="status.set($any($event.target).value); page.set(0)"><option value="">All Status</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select>
        <select class="select f wide" [value]="company()" (change)="company.set($any($event.target).value); page.set(0)"><option value="">All Companies</option>@for (s of companies; track s) {<option [value]="s">{{ s }}</option>}</select>
        <div class="menu-wrap">
          <button class="btn-ghost mf" [class.act]="extraCount()" (click)="mf.set(!mf())"><app-icon name="filter" [size]="16" />More Filters @if (extraCount()) {<em>{{ extraCount() }}</em>}</button>
          @if (mf()) {
            <div class="dropdown mfp">
              <label>Shift<select class="select" [value]="fShift()" (change)="fShift.set($any($event.target).value); page.set(0)"><option value="">Any shift</option>@for (s of shiftKeys; track s) {<option [value]="s">{{ shifts[s].label }}</option>}</select></label>
              <label>Certification<select class="select" [value]="fCert()" (change)="fCert.set($any($event.target).value); page.set(0)"><option value="">Any</option><option value="expiring">Has expiring certificate</option><option value="expired">Has expired certificate</option><option value="ok">Fully compliant</option></select></label>
              <label>Designation<select class="select" [value]="fDes()" (change)="fDes.set($any($event.target).value); page.set(0)"><option value="">Any</option><option>Security Guard</option><option>Senior Security Guard</option><option>Patrol Supervisor</option></select></label>
              <label class="ck"><input type="checkbox" [checked]="fNew()" (change)="fNew.set(!fNew()); page.set(0)" />New joiners this month</label>
              <div class="mf-foot"><button class="link" (click)="clearFilters()">Clear all</button><button class="btn-primary btn-sm" (click)="mf.set(false)">Apply</button></div>
            </div>
          }
        </div>
        <div class="vt">
          <button [class.on]="view() === 'grid'" (click)="view.set('grid')"><app-icon name="grid" [size]="15" [stroke]="2.4" />Grid</button>
          <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="p-list" [size]="15" />List</button>
          <button [class.on]="view() === 'map'" (click)="view.set('map')"><app-icon name="p-map" [size]="15" />Map</button>
        </div>
      </div>

      <div class="body" [class.with]="!!sel()">
        <div class="left">
          @if (checked().size) {
            <div class="bulk">
              <b>{{ checked().size }} selected</b>
              <button class="btn-ghost btn-sm" (click)="msgTo.set(selectedGuards())"><app-icon name="message" [size]="14" />Message</button>
              <button class="btn-ghost btn-sm" (click)="exportCsv(selectedGuards())"><app-icon name="p-upload" [size]="14" />Export</button>
              <select class="select btn-sm" (change)="bulkStatus($any($event.target).value); $any($event.target).value = ''"><option value="">Set status…</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select>
              <button class="link" (click)="clearChecked()">Clear</button>
            </div>
          }
          @switch (view()) {
            @case ('grid') {
              <div class="tw">
                <table class="gt">
                  <thead>
                    <tr>
                      <th class="cbx"><input type="checkbox" [checked]="allOnPage()" (change)="togglePage()" /></th>
                      <th>Photo</th>
                      <th class="s" (click)="sortBy('name')">Guard Name{{ arrow('name') }}</th>
                      <th class="s" (click)="sortBy('id')">Employee ID{{ arrow('id') }}</th>
                      <th class="s" (click)="sortBy('company')">Company{{ arrow('company') }}</th>
                      <th class="s" (click)="sortBy('location')">Site / Location{{ arrow('location') }}</th>
                      <th>Status</th>
                      <th>Shift</th>
                      <th>Certifications</th>
                      <th class="ac">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (g of pageRows(); track g.id) {
                      <tr [class.on]="g.id === selId()" (click)="select(g.id)">
                        <td class="cbx" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="checked().has(g.id)" (change)="toggle(g.id)" /></td>
                        <td><app-guard-avatar [g]="g" [size]="40" /></td>
                        <td class="nm">{{ g.name }}</td>
                        <td>{{ g.id }}</td>
                        <td>{{ g.company }}</td>
                        <td>{{ g.location }}</td>
                        <td><span [class]="stCls(g.status)">{{ g.status }}</span></td>
                        <td class="sh">@if (g.shift && g.status !== 'On Leave' && g.status !== 'Training') {{{ shifts[g.shift].label }}@if (shifts[g.shift].time) {<small>{{ shifts[g.shift].time }}</small>}} @else {-}</td>
                        <td><span class="badges">@for (k of g.certs.slice(0, 3); track k.key) {<app-cert-badge [key]="k.key" [status]="k.status" [size]="19" />}@if (g.certs.length > 3) {<em>+{{ g.certs.length - 3 }}</em>}</span></td>
                        <td class="ac" (click)="$event.stopPropagation()">
                          <div class="menu-wrap">
                            <button class="dots-b" (click)="rowMenu.set(rowMenu() === g.id ? null : g.id)" aria-label="Actions"><app-icon name="more" [size]="18" [stroke]="3" class="rot" /></button>
                            @if (rowMenu() === g.id) {
                              <div class="dropdown right">
                                <button class="dd-item" (click)="rowMenu.set(null); select(g.id)">View profile</button>
                                <button class="dd-item" (click)="rowMenu.set(null); form.set(g)">Edit guard</button>
                                <button class="dd-item" (click)="rowMenu.set(null); callG.set(g)">Call guard</button>
                                <button class="dd-item" (click)="rowMenu.set(null); msgTo.set([g])">Send message</button>
                                <button class="dd-item" (click)="rowMenu.set(null); toggleDuty(g)">{{ g.status === 'On Duty' ? 'Mark Off Duty' : 'Mark On Duty' }}</button>
                                <button class="dd-item" (click)="rowMenu.set(null); go('guard-shifts-rosters')">Assign shift</button>
                                <button class="dd-item danger" (click)="rowMenu.set(null); remove(g)">Remove from directory</button>
                              </div>
                            }
                          </div>
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="10" class="empty">No guards match the current filters. <button class="link" (click)="clearFilters()">Clear filters</button></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @case ('list') {
              <div class="cards">
                @for (g of pageRows(); track g.id) {
                  <button class="gc" [class.on]="g.id === selId()" (click)="select(g.id)">
                    <app-guard-avatar [g]="g" [size]="48" />
                    <div class="gc-b"><b>{{ g.name }}</b><small>{{ g.id }} · {{ g.company }}</small><small>{{ g.location }} · {{ g.shift ? shifts[g.shift].label : '—' }}</small>
                      <span class="gc-f"><span [class]="stCls(g.status)">{{ g.status }}</span><span class="badges">@for (k of g.certs.slice(0, 4); track k.key) {<app-cert-badge [key]="k.key" [status]="k.status" [size]="17" />}</span></span>
                    </div>
                  </button>
                } @empty {<p class="empty">No guards match the current filters.</p>}
              </div>
            }
            @case ('map') {
              <app-floor-plan [zones]="zones" [markers]="markers()" [selectedId]="selId()" [height]="520" (markerClick)="select($event)" (zoneClick)="zoneFilter($event)">
                <div class="legend">@for (s of statuses; track s) {<span><i [class]="'lg ' + stCls(s)"></i>{{ s }} ({{ mapCount(s) }})</span>}</div>
              </app-floor-plan>
              <p class="hint">Showing {{ markers().length }} guards at their posts · click a zone to filter by location, click a guard to open the profile.</p>
            }
          }
          @if (view() !== 'map') {
            <div class="pager">
              <span>Showing {{ filtered().length ? page() * size() + 1 : 0 }} - {{ Math.min((page() + 1) * size(), filtered().length) }} of {{ filtered().length }} guards</span>
              <div class="pg">
                <button [disabled]="page() === 0" (click)="page.set(page() - 1)"><app-icon name="chevron-left" [size]="15" /></button>
                @for (p of pageList(); track $index) {
                  @if (p < 0) {<span class="gap">...</span>} @else {<button [class.on]="p === page()" (click)="page.set(p)">{{ p + 1 }}</button>}
                }
                <button [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)"><app-icon name="chevron-right" [size]="15" /></button>
                <span class="per">Show <select class="select" [value]="'' + size()" (change)="size.set(+$any($event.target).value); page.set(0)"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select> per page</span>
              </div>
            </div>
          }
        </div>

        @if (sel(); as g) {
          <aside class="right">
            <div class="box prof">
              <div class="ph">
                <app-guard-avatar [g]="g" [size]="64" />
                <div class="pn"><h2>{{ g.name }} <span [class]="'pill ' + pillCls(g.status)"><i></i>{{ g.status }}</span></h2><span>{{ g.id }} &nbsp;|&nbsp; {{ g.company }}</span><span>{{ g.post }}</span></div>
                <button class="x" (click)="selId.set(null)" aria-label="Close"><app-icon name="p-x" [size]="20" /></button>
              </div>
              <nav class="tabs2">
                @for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}
                <div class="menu-wrap mt">
                  <button class="mbtn" [class.on2]="isMoreTab()" (click)="tmore.set(!tmore())">{{ isMoreTab() ? tab() : 'More' }} <app-icon name="chevron-down" [size]="14" /></button>
                  @if (tmore()) {<div class="dropdown right">@for (t of moreTabs; track t) {<button class="dd-item" (click)="tab.set(t); tmore.set(false)">{{ t }}</button>}</div>}
                </div>
              </nav>
              @switch (tab()) {
                @case ('Overview') {
                  <div class="facts">
                    <div><app-icon name="id-card" [size]="17" /><span>Employee ID<b>{{ g.id }}</b></span></div>
                    <div><app-icon name="building" [size]="17" /><span>Company<b>{{ g.company }}</b></span></div>
                    <div><app-icon name="phone" [size]="17" /><span>Mobile Number<b>{{ g.mobile }}</b></span></div>
                    <div><app-icon name="user" [size]="17" /><span>Designation<b>{{ g.designation }}</b></span></div>
                    <div><app-icon name="p-mail" [size]="17" /><span>Email<b>{{ g.email }}</b></span></div>
                    <div><app-icon name="users" [size]="17" /><span>Reporting To<b>{{ g.reportingTo }}</b></span></div>
                    <div><app-icon name="calendar-days" [size]="17" /><span>Date of Birth<b>{{ fd(g.dob) }}</b></span></div>
                    <div><app-icon name="clock" [size]="17" /><span>Current Shift<b>{{ shiftText(g) }}</b></span></div>
                    <div><app-icon name="calendar-days" [size]="17" /><span>Join Date<b>{{ fd(g.joinDate) }}</b></span></div>
                    <div><app-icon name="map-pin" [size]="17" /><span>Current Location<b>{{ g.post }}</b></span></div>
                    <div><app-icon name="p-globe" [size]="17" /><span>Nationality<b>{{ g.nationality }}</b></span></div>
                    <div><app-icon name="map-pin" [size]="17" /><span>Status<b><em [class]="'mini ' + pillCls(g.status)"><i></i>{{ g.status }}</em></b></span></div>
                  </div>
                }
                @case ('Assignment') {
                  <div class="asg">
                    <div class="kv"><span>Site</span><b>{{ g.site }}</b><span>Post</span><b>{{ g.post }}</b><span>Shift</span><b>{{ shiftText(g) }}</b><span>Supervisor</span><b>{{ g.reportingTo }}</b></div>
                    <h4>Patrol routes at this site</h4>
                    <ul class="rl">@for (r of routesFor(g); track r.id) {<li><i [style.background]="r.color"></i><b>{{ r.name }}</b><small>{{ r.checkpoints.length }} checkpoints · {{ r.frequency }}</small></li>} @empty {<li class="muted">No routes configured for {{ g.site }}</li>}</ul>
                    <h4>This week</h4>
                    <div class="wk">@for (d of store.roster(g); track $index) {<span [style.background]="rc[d].bg" [style.color]="rc[d].fg"><small>{{ days[$index].slice(0, 3) }}</small>{{ d }}</span>}</div>
                    <div class="row-b"><button class="btn-primary btn-sm" (click)="reassign.set(true)">Change Assignment</button><button class="btn-ghost btn-sm" (click)="go('guard-shifts-rosters')">Open roster</button></div>
                    @if (reassign()) {
                      <div class="ra">
                        <label>Post<select class="select" #rp [value]="g.location">@for (z of zones; track z.id) {<option [value]="z.name">{{ z.name }}</option>}</select></label>
                        <label>Shift<select class="select" #rs [value]="g.shift ?? 'Day'">@for (s of shiftKeys; track s) {<option [value]="s">{{ shifts[s].label }}</option>}</select></label>
                        <button class="btn-primary btn-sm" (click)="doReassign(g, rp.value, rs.value)">Save</button>
                      </div>
                    }
                  </div>
                }
                @case ('Certifications') {
                  <table class="mt-t"><thead><tr><th>Certificate</th><th>No.</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
                    <tbody>@for (k of g.certs; track k.key) {<tr><td><span class="cn"><app-cert-badge [key]="k.key" [size]="18" />{{ cname(k.key) }}</span></td><td>{{ k.no }}</td><td>{{ fd(k.expiry) }}</td><td><span [class]="cTag(k.status)">{{ k.status }}</span></td><td><button class="link" (click)="renew(g, k)">Renew</button></td></tr>}</tbody>
                  </table>
                  <div class="row-b">
                    <select class="select btn-sm" #nc><option value="">Add certificate…</option>@for (t of missingCerts(g); track t.key) {<option [value]="t.key">{{ t.name }}</option>}</select>
                    <button class="btn-primary btn-sm" (click)="addCert(g, nc.value); nc.value = ''">Add</button>
                  </div>
                }
                @case ('Documents') {
                  <ul class="docs">@for (d of docsOf(g); track d) {<li><app-icon name="file-text" [size]="16" /><div><b>{{ d }}</b><small>uploaded {{ fd(g.joinDate) }} · HR</small></div><button class="link" (click)="toastMsg('Opening ' + d)">View</button></li>}</ul>
                  <label class="btn-ghost btn-sm up"><app-icon name="p-upload" [size]="14" />Upload document<input type="file" hidden (change)="upload(g, $event)" /></label>
                }
                @case ('Equipment') {
                  <ul class="docs">@for (a of assetsOf(g); track a.id) {<li><app-icon name="box" [size]="16" /><div><b>{{ a.type }} · {{ a.id }}</b><small>{{ a.model }} · issued {{ fd(a.issued) }}@if (a.battery !== null) { · battery {{ a.battery }}%}</small></div><span class="tag green">Issued</span></li>} @empty {<li class="muted">No equipment issued.</li>}</ul>
                  <button class="btn-ghost btn-sm" (click)="go('equipment-assets')">Manage equipment</button>
                }
                @case ('Permits') {
                  <ul class="docs">@for (p of permitsOf(g); track p.id) {<li><app-icon name="key-round" [size]="16" /><div><b>{{ p.type }}</b><small>{{ p.zones.join(', ') }} · until {{ fd(p.to) }}</small></div><span [class]="p.status === 'Active' ? 'tag green' : p.status === 'Pending' ? 'tag amber' : 'tag red'">{{ p.status }}</span></li>}</ul>
                  <button class="btn-ghost btn-sm" (click)="go('permits-access')">Open permits</button>
                }
                @case ('Activity') {
                  <ul class="act">
                    @for (a of activity(g); track $index) {<li><i [style.background]="a.c"></i><b>{{ a.t }}</b><span>{{ a.text }}</span></li>}
                  </ul>
                }
              }
              <div class="acts">
                <button class="btn-primary" (click)="liveLoc(g)"><app-icon name="map-pin" [size]="14" />View Live Location</button>
                <button class="btn-ghost" (click)="callG.set(g)"><app-icon name="phone" [size]="14" />Call Guard</button>
                <button class="btn-ghost" (click)="msgTo.set([g])"><app-icon name="message" [size]="14" />Message</button>
                <div class="menu-wrap">
                  <button class="btn-ghost" (click)="amore.set(!amore())">More <app-icon name="chevron-down" [size]="14" /></button>
                  @if (amore()) {
                    <div class="dropdown right up2">
                      <button class="dd-item" (click)="amore.set(false); form.set(g)">Edit profile</button>
                      <button class="dd-item" (click)="amore.set(false); toggleDuty(g)">{{ g.status === 'On Duty' ? 'Mark Off Duty' : 'Mark On Duty' }}</button>
                      <button class="dd-item" (click)="amore.set(false); go('guard-performance')">View performance</button>
                      <button class="dd-item" (click)="amore.set(false); go('incidents-reports')">Report incident</button>
                      <button class="dd-item" (click)="amore.set(false); exportCsv([g])">Export profile</button>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="box">
              <div class="bh"><h3>Certifications &amp; Compliance</h3><button class="link" (click)="tab.set('Certifications')">View All</button></div>
              <ul class="cl">
                @for (k of topCerts(g); track k.key) {
                  <li>
                    <span class="ci" [style.background]="ct(k.key).color"><app-icon [name]="ct(k.key).icon" [size]="13" [stroke]="2.6" /></span>
                    <b>{{ cname(k.key) }}</b>
                    <span [class]="'cs ' + k.status.replace(' ', '')">{{ k.status }}</span>
                    <span class="ex">Exp: {{ fd(k.expiry) }}</span>
                    <div class="menu-wrap">
                      <button class="dots-b" (click)="cmenu.set(cmenu() === k.key ? null : k.key)" aria-label="Certificate actions"><app-icon name="more" [size]="16" [stroke]="3" class="rot" /></button>
                      @if (cmenu() === k.key) {
                        <div class="dropdown right">
                          <button class="dd-item" (click)="cmenu.set(null); renew(g, k)">Renew certificate</button>
                          <button class="dd-item" (click)="cmenu.set(null); toastMsg('Reminder sent to ' + g.name + ' for ' + cname(k.key))">Send reminder</button>
                          <button class="dd-item" (click)="cmenu.set(null); go('training-certifications')">Book training</button>
                        </div>
                      }
                    </div>
                  </li>
                }
              </ul>
            </div>

            <div class="box">
              <div class="bh"><h3>{{ g.status === 'On Duty' ? 'On Duty – Live Snapshot' : 'Last Known Position' }}</h3><button class="link" (click)="liveLoc(g)">View on Map</button></div>
              <div class="snap">
                <button class="mm" (click)="liveLoc(g)" aria-label="Open live map">
                  <svg viewBox="0 0 110 56" preserveAspectRatio="xMidYMid slice">
                    <rect width="110" height="56" fill="var(--ka-e7eadf)" />
                    <path d="M0 40 C30 34 50 44 110 30" stroke="var(--kl-ffffff)" stroke-width="5" fill="none" />
                    <path d="M38 0 L46 56 M78 0 L70 56" stroke="var(--kl-ffffff)" stroke-width="3.5" fill="none" />
                    <rect x="6" y="6" width="26" height="22" rx="2" fill="var(--ka-d4d8cc)" /><rect x="52" y="8" width="14" height="18" rx="2" fill="var(--ka-d4d8cc)" /><rect x="84" y="4" width="22" height="16" rx="2" fill="var(--ka-d4d8cc)" />
                    <circle cx="96" cy="46" r="7" fill="var(--ka-bcd8a8)" /><circle cx="18" cy="48" r="6" fill="var(--ka-bcd8a8)" />
                    <circle [attr.cx]="pinX(g)" cy="28" r="9" fill="var(--ka-1f2937)" opacity=".15" />
                    <circle [attr.cx]="pinX(g)" cy="28" r="6.5" fill="var(--ka-1f2937)" /><circle [attr.cx]="pinX(g)" cy="28" r="2.4" fill="var(--ka-ffffff)" />
                  </svg>
                </button>
                <div class="sd">
                  <b><i [class.off]="g.status !== 'On Duty'"></i>{{ g.post }}</b>
                  @if (g.status === 'On Duty') {
                    <span>Since {{ g.since }} ({{ g.sinceMins + liveMins() }} mins)</span>
                    <span><app-icon name="clock" [size]="13" />Last Check-in: {{ g.lastCheckin }}</span>
                  } @else {
                    <span>{{ g.status }} · not currently tracked</span>
                    <span><app-icon name="clock" [size]="13" />Last Check-in: {{ g.lastCheckin }} (yesterday)</span>
                  }
                </div>
              </div>
            </div>
          </aside>
        }
      </div>
    </section>

    @if (form(); as f) {<app-guard-form [guard]="f" (close)="form.set(null)" (saved)="saved($event)" />}
    @if (callG(); as g) {<app-call-modal [guard]="g" (close)="callG.set(null)" (done)="toastMsg($event)" />}
    @if (msgTo(); as list) {<app-message-modal [guards]="list" (close)="msgTo.set(null)" (done)="toastMsg($event)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    :host { display: block; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .sq { padding: 0 10px; } .danger { color: var(--red); }
    .dropdown.right { right: 0; left: auto; }
    .main { padding: 12px 12px 12px; }
    .bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .sb { width: 290px; height: 36px; } .sb input { font-size: 12px; }
    .f { height: 36px; min-width: 108px; font-size: 12.5px; } .f.wide { min-width: 134px; }
    .mf { height: 36px; } .mf.act { border-color: var(--primary); color: var(--primary); } .mf em { font-style: normal; background: var(--primary); color: var(--kf-ffffff); border-radius: 10px; padding: 0 6px; font-size: 11px; }
    .mfp { width: 260px; padding: 12px; display: flex; flex-direction: column; gap: 10px; left: 0; }
    .mfp label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); } .mfp .ck { flex-direction: row; align-items: center; gap: 8px; }
    .mf-foot { display: flex; justify-content: space-between; align-items: center; }
    .vt { margin-left: auto; display: flex; gap: 6px; }
    .vt button { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font-size: 12.5px; cursor: pointer; color: var(--kf-1f2233); }
    .vt button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
    .body.with { grid-template-columns: minmax(0, 1fr) 420px; }
    .bulk { display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 8px; background: var(--primary-soft); border-radius: 8px; font-size: 12.5px; }
    .tw { border: 1px solid var(--border); border-radius: 10px; }
    .gt { width: 100%; border-collapse: collapse; font-size: 12px; }
    .gt th { text-align: left; font-weight: 600; font-size: 11.5px; color: var(--kf-1f2233); padding: 12px 6px; border-bottom: 1px solid var(--border); white-space: nowrap; background: var(--kb-ffffff); }
    .gt th.s { cursor: pointer; } .gt th.s:hover { color: var(--primary); }
    .gt td { padding: 5px 6px; border-bottom: 1px solid var(--kl-eef0f5); white-space: nowrap; color: var(--kf-2b2e48); }
    .gt tbody tr { cursor: pointer; height: 51px; } .gt tbody tr:hover { background: var(--kb-faf9ff); }
    .gt tbody tr.on { background: var(--kb-f5f0ff); box-shadow: inset 0 0 0 1px var(--kb-c4b5fd); }
    .gt .cbx { width: 30px; padding-left: 10px; } .gt input[type='checkbox'] { width: 15px; height: 15px; accent-color: var(--primary); }
    .nm { font-weight: 600; color: var(--kf-12142b) !important; }
    .sh small { display: block; color: var(--kf-2b2e48); margin-top: 2px; }
    .badges { display: inline-flex; align-items: center; gap: 4px; } .badges em { font-style: normal; font-size: 11.5px; color: var(--kf-4b4f6b); margin-left: 2px; }
    .ac { text-align: center; width: 46px; }
    .dots-b { border: 0; background: none; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--kf-1f2233); display: inline-grid; } .dots-b:hover { background: var(--kb-f0edff); }
    .rot { transform: rotate(90deg); }
    .empty { text-align: center; color: var(--muted); padding: 30px !important; }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; font-size: 12.5px; color: var(--kf-3b3f5c); flex-wrap: wrap; gap: 8px; padding: 0 6px; }
    .pg { display: flex; align-items: center; gap: 6px; }
    .pg button { min-width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); cursor: pointer; font-size: 12px; display: grid; place-items: center; }
    .pg button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .pg button:disabled { opacity: 0.45; cursor: default; }
    .gap { padding: 0 4px; } .per { display: inline-flex; align-items: center; gap: 6px; margin-left: 30px; border: 1px solid var(--border); border-radius: 6px; padding-left: 8px; }
    .per .select { height: 30px; border: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-radius: 0; min-width: 70px; } .per { padding-right: 8px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
    .gc { display: flex; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); text-align: left; cursor: pointer; font: inherit; }
    .gc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .gc-b { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; } .gc-b small { color: var(--muted); font-size: 11.5px; } .gc-f { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .legend { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 12px; background: var(--kb-ffffff); padding: 6px 10px; border-radius: 8px; font-size: 11.5px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .legend span { display: inline-flex; align-items: center; gap: 5px; } .lg { min-width: 0 !important; width: 10px; height: 10px; padding: 0 !important; border-radius: 50% !important; }
    .hint { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
    .right { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .box { border: 1px solid var(--border); border-radius: 10px; padding: 14px 12px; background: var(--kb-ffffff); min-width: 0; }
    .ph { display: grid; grid-template-columns: 64px 1fr auto; gap: 14px; align-items: center; }
    .pn { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--kf-3b3f5c); min-width: 0; }
    .pn h2 { margin: 0 0 2px; font-size: 17px; display: flex; align-items: center; gap: 12px; color: var(--kf-12142b); }
    .pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 500; } .pill i, .mini i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .grey { background: var(--kb-eef0f5); color: var(--kf-4b5563); } .amber { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .blue { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); }
    .x { border: 0; background: none; cursor: pointer; color: var(--kf-1f2233); align-self: start; padding: 2px; }
    .tabs2 { display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin: 16px 0 12px; align-items: center; }
    .tabs2 > button { border: 0; background: none; padding: 8px 0; font-size: 12.5px; color: var(--kf-2b2e48); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; margin-bottom: -1px; }
    .tabs2 > button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .mt { margin-left: auto; } .mbtn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 7px; padding: 5px 8px; font-size: 12.5px; cursor: pointer; } .mbtn.on2 { color: var(--primary); border-color: var(--primary); }
    .facts { display: grid; grid-template-columns: 1.2fr 1fr; gap: 9px 14px; }
    .facts > div { display: flex; gap: 12px; align-items: flex-start; min-width: 0; } .facts app-icon { color: var(--kf-3b3f5c); margin-top: 4px; flex: none; }
    .facts span { display: flex; flex-direction: column; font-size: 11.5px; color: var(--kf-6b7090); min-width: 0; } .facts b { font-weight: 500; color: var(--kf-12142b); font-size: 12px; margin-top: 1px; overflow-wrap: anywhere; }
    .mini { display: inline-flex; align-items: center; gap: 4px; font-style: normal; font-size: 11px; padding: 1px 7px; border-radius: 5px; }
    .acts { display: flex; gap: 6px; margin-top: 16px; } .acts .btn-primary, .acts .btn-ghost { height: 32px; font-size: 11.5px; padding: 0 8px; gap: 4px; white-space: nowrap; } .acts .menu-wrap { margin-left: auto; }
    .acts .menu-wrap .btn-ghost { min-width: 66px; justify-content: space-between; }
    .up2 { bottom: 38px; top: auto; }
    .bh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .bh h3 { margin: 0; font-size: 13.5px; }
    .cl { list-style: none; margin: 0; padding: 0; }
    .cl li { display: grid; grid-template-columns: 20px minmax(0, 1fr) 86px 96px 22px; gap: 8px; align-items: center; padding: 5px 0; font-size: 12px; }
    .cl b { font-weight: 600; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ci { width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .cs { text-align: center; padding: 3px 4px; border-radius: 5px; font-size: 10.5px; white-space: nowrap; } .cs.Valid { background: var(--kb-dcfce7); color: var(--kf-15803d); } .cs.ExpiringSoon { background: var(--kb-ffedd5); color: var(--kf-c2410c); } .cs.Expired { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .ex { color: var(--kf-3b3f5c); font-size: 11px; white-space: nowrap; }
    .snap { display: flex; gap: 16px; align-items: center; }
    .mm { width: 110px; height: 56px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); padding: 0; cursor: pointer; flex: none; } .mm svg { width: 100%; height: 100%; display: block; }
    .sd { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--kf-4b4f6b); } .sd b { font-weight: 500; color: var(--kf-12142b); font-size: 12px; display: flex; align-items: center; gap: 7px; }
    .sd b i { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-22c55e); } .sd b i.off { background: var(--kb-9ca3af); } .sd span { display: flex; align-items: center; gap: 5px; padding-left: 16px; } .sd span app-icon { margin-left: -16px; margin-right: 2px; }
    .asg h4, h4 { font-size: 12.5px; margin: 12px 0 6px; }
    .kv { display: grid; grid-template-columns: 90px 1fr; gap: 6px 10px; font-size: 12.5px; } .kv span { color: var(--muted); }
    .rl { list-style: none; margin: 0; padding: 0; } .rl li { display: grid; grid-template-columns: 10px 1fr; gap: 0 8px; padding: 4px 0; font-size: 12.5px; align-items: center; } .rl i { width: 10px; height: 10px; border-radius: 3px; grid-row: span 2; } .rl small { color: var(--muted); }
    .wk { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; } .wk span { display: flex; flex-direction: column; align-items: center; padding: 4px 0; border-radius: 6px; font-size: 12px; font-weight: 700; } .wk small { font-weight: 400; font-size: 10px; }
    .row-b { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
    .ra { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; padding: 10px; background: var(--kb-faf9ff); border-radius: 8px; } .ra label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; flex: 1; }
    .mt-t { width: 100%; border-collapse: collapse; font-size: 11.5px; } .mt-t th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px; } .mt-t td { padding: 5px 4px; border-top: 1px solid var(--kl-f0f1f6); }
    .cn { display: inline-flex; gap: 6px; align-items: center; }
    .docs { list-style: none; margin: 0 0 10px; padding: 0; } .docs li { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .docs div { display: flex; flex-direction: column; } .docs small { color: var(--muted); } .docs app-icon { color: var(--primary); }
    .act { list-style: none; margin: 0; padding: 0; } .act li { display: grid; grid-template-columns: 10px 64px 1fr; gap: 8px; align-items: center; padding: 6px 0; font-size: 12px; border-bottom: 1px solid var(--kl-f0f1f6); } .act i { width: 8px; height: 8px; border-radius: 50%; }
    .up { width: fit-content; cursor: pointer; }
    @media (max-width: 1350px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .body.with { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class GuardDirectory {
  protected readonly store = inject(PatrolStore);
  private readonly router = inject(Router);
  private readonly app = inject(AppState);
  protected readonly Math = Math;
  protected readonly base = BASE;
  protected readonly tabs = TABS;
  protected readonly moreTabs = MORE_TABS;
  protected readonly sites = SITE_NAMES;
  protected readonly companies = COMPANY_NAMES;
  protected readonly statuses: GStatus[] = ['On Duty', 'Off Duty', 'On Leave', 'Training'];
  protected readonly shifts = SHIFTS;
  protected readonly shiftKeys = Object.keys(SHIFTS) as (keyof typeof SHIFTS)[];
  protected readonly zones = POST_ZONES;
  protected readonly days = WEEK_DAYS;
  protected readonly rc = RCODE;
  protected readonly fd = fmtD;
  protected readonly stCls = statusCls;
  protected readonly ct = certType;
  protected readonly isOn = (g: Guard) => g.status === 'On Duty';

  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly status = signal('');
  protected readonly company = signal('');
  protected readonly fShift = signal('');
  protected readonly fCert = signal('');
  protected readonly fDes = signal('');
  protected readonly fNew = signal(false);
  protected readonly view = signal<'grid' | 'list' | 'map'>('grid');
  protected readonly page = signal(0);
  protected readonly size = signal(10);
  protected readonly sort = signal<{ key: keyof Guard; dir: 1 | -1 } | null>(null);
  protected readonly selId = signal<string | null>('GRD-001');
  protected readonly tab = signal<Tab>('Overview');
  protected readonly checked = signal(new Set<string>());
  protected readonly more = signal(false);
  protected readonly mf = signal(false);
  protected readonly tmore = signal(false);
  protected readonly amore = signal(false);
  protected readonly rowMenu = signal<string | null>(null);
  protected readonly cmenu = signal<string | null>(null);
  protected readonly reassign = signal(false);
  protected readonly form = signal<Partial<Guard> | null>(null);
  protected readonly callG = signal<Guard | null>(null);
  protected readonly msgTo = signal<Guard[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  private readonly uploads = signal<Record<string, string[]>>({});

  constructor() {
    const qp = inject(ActivatedRoute).snapshot.queryParamMap;
    if (qp.get('company')) this.company.set(qp.get('company')!);
    if (qp.get('status')) this.status.set(qp.get('status')!);
    if (qp.get('q')) this.q.set(qp.get('q')!);
    if (qp.get('guard')) this.selId.set(qp.get('guard'));
  }
  protected readonly c = this.store.counts;
  protected readonly liveMins = computed(() => Math.floor(this.app.tick() / 24));
  protected readonly onCount = computed(() => this.filtered().filter(this.isOn).length);
  protected readonly extraCount = computed(() => +!!this.fShift() + +!!this.fCert() + +!!this.fDes() + +this.fNew());
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const [site, st, co, sh, ce, de, nw] = [this.site(), this.status(), this.company(), this.fShift(), this.fCert(), this.fDes(), this.fNew()];
    let l = this.store.guards().filter(
      (g) =>
        (!q || `${g.name} ${g.id} ${g.mobile.replace(/\s/g, '')} ${g.mobile} ${g.company} ${g.location}`.toLowerCase().includes(q)) &&
        (!site || g.site === site) && (!st || g.status === st) && (!co || g.company === co) && (!sh || g.shift === sh) && (!de || g.designation === de) &&
        (!nw || g.joinDate.startsWith('2026-10')) &&
        (!ce || (ce === 'expiring' ? g.certs.some((c) => c.status === 'Expiring Soon') : ce === 'expired' ? g.certs.some((c) => c.status === 'Expired') : g.certs.every((c) => c.status === 'Valid'))),
    );
    const s = this.sort();
    if (s) l = [...l].sort((a, b) => String(a[s.key]).localeCompare(String(b[s.key])) * s.dir);
    return l;
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.size())));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.size(), (this.page() + 1) * this.size()));
  protected readonly pageList = computed(() => {
    const n = this.pages();
    const p = this.page();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const start = Math.max(0, Math.min(p - 2, n - 6));
    const out = Array.from({ length: 5 }, (_, i) => start + i);
    if (start + 5 < n - 1) out.push(-1);
    out.push(n - 1);
    return out;
  });
  protected readonly allOnPage = computed(() => this.pageRows().length > 0 && this.pageRows().every((g) => this.checked().has(g.id)));
  protected readonly sel = computed(() => this.store.guard(this.selId()) ?? null);
  protected readonly markers = computed<MapMarker[]>(() =>
    this.filtered().slice(0, 160).map((g) => {
      const p = postByName(g.location);
      const h = Math.abs(hash(g.id));
      const col = g.status === 'On Duty' ? 'var(--ka-16a34a)' : g.status === 'Off Duty' ? 'var(--ka-6b7280)' : g.status === 'On Leave' ? 'var(--ka-ea580c)' : 'var(--ka-2563eb)';
      return { id: g.id, x: p.x + 18 + (h % Math.max(1, p.w - 36)), y: p.y + 20 + ((h >> 5) % Math.max(1, p.h - 60)), color: col, label: initials(g.name), size: 13, title: `${g.name} · ${g.status}` };
    }),
  );
  protected readonly isMoreTab = computed(() => (MORE_TABS as readonly string[]).includes(this.tab()));

  protected pct(n: number) {
    return ((n / Math.max(1, this.c().total)) * 100).toFixed(1);
  }
  protected mapCount(s: string) {
    return this.filtered().filter((g) => g.status === s).length;
  }
  protected pillCls(s: string) {
    return s === 'On Duty' ? 'green' : s === 'Off Duty' ? 'grey' : s === 'On Leave' ? 'amber' : 'blue';
  }
  protected cTag(s: string) {
    return s === 'Valid' ? 'tag green' : s === 'Expired' ? 'tag red' : 'tag amber';
  }
  protected cname(k: string) {
    return certType(k).name;
  }
  protected shiftText(g: Guard) {
    if (!g.shift || g.status === 'On Leave' || g.status === 'Training') return g.status === 'On Leave' ? 'On leave' : g.status === 'Training' ? 'In training' : '-';
    const s = SHIFTS[g.shift];
    return s.time ? `${s.label} (${s.time.replace(' - ', ' - ')})` : s.label;
  }
  protected topCerts(g: Guard) {
    const order = ['sira', 'firstaid', 'fire', 'health', 'cctv', 'crowd', 'tactics'];
    return [...g.certs].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).slice(0, 4);
  }
  protected missingCerts(g: Guard) {
    return CERT_TYPES.filter((t) => !g.certs.some((c) => c.key === t.key));
  }
  protected routesFor(g: Guard) {
    return this.store.routes().filter((r) => r.site === g.site);
  }
  protected docsOf(g: Guard) {
    return [...(this.uploads()[g.id] ?? []), ...DOCS];
  }
  protected assetsOf(g: Guard) {
    return this.store.assets().filter((a) => a.guardId === g.id);
  }
  protected permitsOf(g: Guard) {
    return this.store.permits().filter((p) => p.guardId === g.id);
  }
  protected activity(g: Guard) {
    const log = this.store.calls().filter((c) => c.guardId === g.id).map((c) => ({ t: c.at, text: c.kind === 'Call' ? 'Call placed from control room' : `Message: ${c.text}`, c: 'var(--ka-7c3aed)' }));
    return [
      ...log,
      { t: g.lastCheckin, text: `Checked in at ${g.post}`, c: 'var(--ka-22c55e)' },
      { t: '10:02 AM', text: 'Checkpoint CP-02 scanned (NFC)', c: 'var(--ka-3b82f6)' },
      { t: '09:48 AM', text: 'Patrol round started', c: 'var(--ka-3b82f6)' },
      { t: g.since, text: 'Shift started · selfie verified', c: 'var(--ka-22c55e)' },
    ];
  }
  protected pinX(g: Guard) {
    return 30 + (Math.abs(hash(g.id)) % 50);
  }
  protected arrow(k: string) {
    const s = this.sort();
    return s?.key === k ? (s.dir === 1 ? ' ↑' : ' ↓') : '';
  }
  protected sortBy(key: keyof Guard) {
    const s = this.sort();
    this.sort.set(s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 });
  }
  protected select(id: string) {
    this.selId.set(id);
    this.reassign.set(false);
    this.cmenu.set(null);
    if (this.isMoreTab()) this.tab.set('Overview');
  }
  protected toggle(id: string) {
    this.checked.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected togglePage() {
    const all = this.allOnPage();
    this.checked.update((s) => {
      const n = new Set(s);
      this.pageRows().forEach((g) => (all ? n.delete(g.id) : n.add(g.id)));
      return n;
    });
  }
  protected selectedGuards() {
    return this.store.guards().filter((g) => this.checked().has(g.id));
  }
  protected bulkStatus(s: string) {
    if (!s) return;
    const ids = [...this.checked()];
    ids.forEach((id) => this.store.patchGuard(id, { status: s as GStatus }));
    this.toastMsg(`${ids.length} guards set to ${s}`);
    this.checked.set(new Set());
  }
  protected clearChecked() {
    this.checked.set(new Set());
  }
  protected clearFilters() {
    [this.q, this.site, this.status, this.company, this.fShift, this.fCert, this.fDes].forEach((s) => s.set(''));
    this.fNew.set(false);
    this.page.set(0);
    this.mf.set(false);
  }
  protected zoneFilter(id: string) {
    const z = POST_ZONES.find((x) => x.id === id)!;
    this.q.set(z.name);
    this.toastMsg(`Filtered to ${z.name}`);
  }
  protected toggleDuty(g: Guard) {
    const s: GStatus = g.status === 'On Duty' ? 'Off Duty' : 'On Duty';
    this.store.patchGuard(g.id, { status: s, shift: g.shift ?? 'Day', since: this.store.now(), sinceMins: 0, lastCheckin: this.store.now() });
    this.toastMsg(`${g.name} marked ${s}`);
  }
  protected remove(g: Guard) {
    if (!confirm(`Remove ${g.name} (${g.id}) from the guard directory?`)) return;
    this.store.guards.update((l) => l.filter((x) => x.id !== g.id));
    if (this.selId() === g.id) this.selId.set(null);
    this.toastMsg(`${g.name} removed`);
  }
  protected doReassign(g: Guard, post: string, shift: string) {
    const p = postByName(post);
    this.store.patchGuard(g.id, { location: p.name, site: p.site, post: p.name === 'Head Office' ? 'Head Office - Main Gate' : `${p.site} - ${p.name}`, shift: shift as Guard['shift'] });
    this.reassign.set(false);
    this.toastMsg(`${g.name} reassigned to ${p.name} · ${SHIFTS[shift as keyof typeof SHIFTS].label}`);
  }
  protected renew(g: Guard, k: GCert) {
    this.store.renewCert(g.id, k.key);
    this.toastMsg(`${this.cname(k.key)} renewed for ${g.name}`);
  }
  protected addCert(g: Guard, key: string) {
    if (!key) return;
    this.store.addCert(g.id, key, '2028-10-14');
    this.toastMsg(`${this.cname(key)} added to ${g.name}`);
  }
  protected upload(g: Guard, e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.uploads.update((m) => ({ ...m, [g.id]: [f.name, ...(m[g.id] ?? [])] }));
    this.toastMsg(`${f.name} uploaded to ${g.name}'s file`);
  }
  protected liveLoc(g: Guard) {
    this.router.navigate([BASE, 'live-patrol-monitoring'], { queryParams: { guard: g.id } });
  }
  protected go(p: string) {
    this.router.navigate([BASE, p]);
  }
  protected saved(g: Guard) {
    this.form.set(null);
    this.selId.set(g.id);
    this.toastMsg(`${g.name} saved`);
  }
  protected importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      let n = 0;
      for (const l of rows) {
        const [name, company, location, mobile] = l.split(',').map((x) => x.trim());
        if (!name) continue;
        const base = this.store.guards()[1];
        const p = postByName(location || 'Main Gate');
        this.store.addGuard({ ...base, id: this.store.nextGuardId(), name, gender: 'M', company: COMPANY_NAMES.includes(company) ? company : 'SecureTech', location: p.name, site: p.site, post: `${p.site} - ${p.name}`, status: 'Off Duty', mobile: mobile || '+971 50 000 0000', email: `${name.split(' ')[0].toLowerCase()}@guard.ae`, joinDate: '2026-10-14', certs: [] });
        n++;
      }
      this.toastMsg(`${n} guards imported as Off Duty · certificates pending`);
    };
    r.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  }
  protected downloadTemplate() {
    downloadCsv('guard-import-template.csv', [['Name', 'Company', 'Location', 'Mobile'], ['John Doe', 'SecureTech', 'Main Gate', '+971 50 111 2222']]);
  }
  protected exportCsv(list = this.filtered()) {
    downloadCsv('guard-directory.csv', [
      ['Employee ID', 'Name', 'Company', 'Site', 'Location', 'Status', 'Shift', 'Mobile', 'Email', 'Certifications', 'Expiring'],
      ...list.map((g) => [g.id, g.name, g.company, g.site, g.location, g.status, g.shift ? SHIFTS[g.shift].label : '-', g.mobile, g.email, g.certs.map((c) => certType(c.key).name).join('; '), g.certs.filter((c) => c.status !== 'Valid').length]),
    ]);
    this.toastMsg(`Exported ${list.length} guards`);
  }
  protected print() {
    window.print();
  }
}
