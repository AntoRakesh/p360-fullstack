import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { ALERTS, LE_ZONES, LeAlert, LeMove, LePlan, LeVisitor, MOVES, PLANS, VISITORS, ZONE_GEO, ZONE_PT } from './vm-location-escort.data';
import { VM_UI } from './vm-ui';
import { HOSTS, SITES, VISITOR_TYPES, VmStore, hm, hostOf } from './vm.data';

const TABS = ['Live View', 'Escort Assignments', 'Movement Plans', 'Zone Alerts', 'History'] as const;
type Tab = (typeof TABS)[number];
const BUILDINGS = ['Main Campus – Tower A', 'Main Campus – Tower B', 'Main Campus – Tower C'];
interface AssignForm { visitor: string; escort: string; meet: string; dur: string; note: string; notify: boolean }
interface PlanForm { visitor: string; escort: string; start: number; route: string[] }
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

@Component({
  selector: 'app-vm-location-escort',
  imports: [...UI, ...VM_UI, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page le">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Visitor Location &amp; Escort</b></nav>
          <h1>Visitor Location &amp; Escort</h1>
          <p>Track visitor movement, manage escorts, and maintain secure zone access.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openAssign()"><app-icon name="plus" [size]="18" />Assign Escort</button>
          <button class="btn-outline hb" (click)="openPlan()"><app-icon name="vm-a-route" [size]="18" />Create Movement Plan</button>
          <button class="btn-outline hb" (click)="exportAll()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="go('emergency-visitor-accountability')"><app-icon name="siren" [size]="15" />Emergency accountability</button>
                <button class="dd-item" (click)="go('visitor-logs-history')"><app-icon name="history" [size]="15" />Visitor logs &amp; history</button>
                <button class="dd-item" (click)="go('visitor-check-in-check-out')"><app-icon name="vm-c-log-in" [size]="15" />Check-in / check-out</button>
                <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="vm-c-printer" [size]="15" />Print page</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Visitors On-Site" [value]="onSite()" icon="users" color="var(--ka-7c3aed)" [clickable]="true" (pick)="go('visitor-check-in-check-out')" />
        <vm-kpi label="Active Escorts" [value]="activeEscorts()" icon="vm-e-escort" color="var(--ka-16a34a)" [clickable]="true" [active]="tab() === 'Escort Assignments'" (pick)="setTab('Escort Assignments')" />
        <vm-kpi label="Restricted Zone Alerts" [value]="openAlerts().length" icon="triangle-alert" color="var(--ka-dc2626)" [clickable]="true" [active]="tab() === 'Zone Alerts'" (pick)="setTab('Zone Alerts')" />
        <vm-kpi label="Movement Plans" [value]="plans().length" icon="vm-a-route" color="var(--ka-2563eb)" [clickable]="true" [active]="tab() === 'Movement Plans'" (pick)="setTab('Movement Plans')" />
      </section>

      <div class="bar">
        <div class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="setTab(t)">{{ t }}</button>}</div>
        <span class="vsep"></span>
        <label class="vm-search"><app-icon name="search" [size]="15" /><input placeholder="Search visitor, escort, zone..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="map-pin" [size]="15" /><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="layers" [size]="15" /><span>Zone:</span><select [value]="zone()" (change)="zone.set($any($event.target).value)"><option value="">All Zones</option>@for (z of zones; track z) {<option [value]="z">{{ z }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="user" [size]="15" /><span>Escort Status:</span><select [value]="escF()" (change)="escF.set($any($event.target).value)"><option value="">All</option><option>Active</option><option>Awaiting Escort</option><option>Completed</option></select></label>
        <label class="vm-filter"><app-icon name="calendar-days" [size]="15" /><span>Visitor Type:</span><select [value]="vtype()" (change)="vtype.set($any($event.target).value)"><option value="">All</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
        <button class="vm-icon-btn" [class.spin]="spinning()" title="Reset filters &amp; refresh" (click)="refresh()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="top">
        <div class="vm-card mapc" [class.full]="full()" #mapCard>
          <div class="vm-card-head">
            <h2><app-icon name="map-pin" [size]="22" />Live Location Map</h2><span class="spacer"></span>
            <label class="vm-filter bld"><app-icon name="building" [size]="15" /><select [value]="building()" (change)="building.set($any($event.target).value)">@for (b of buildings; track b) {<option [value]="b">{{ b }}</option>}</select></label>
            <div class="legend">
              <button [class.off]="!show().v" (click)="flip('v')"><i class="g"></i>Visitor</button>
              <button [class.off]="!show().e" (click)="flip('e')"><i class="b"></i>Escort</button>
              <button [class.off]="!show().a" (click)="flip('a')"><i class="r">!</i>Alert</button>
            </div>
            <button class="vm-icon-btn sm" title="Recenter" (click)="recenter()"><app-icon name="vm-e-crosshair" [size]="16" /></button>
            <button class="vm-icon-btn sm" title="Zoom in" (click)="zoomBy(0.2)"><app-icon name="plus" [size]="16" /></button>
            <button class="vm-icon-btn sm" title="Zoom out" (click)="zoomBy(-0.2)"><app-icon name="minus" [size]="16" /></button>
            <button class="vm-icon-btn sm" [title]="full() ? 'Exit full screen' : 'Full screen'" (click)="full.set(!full())"><app-icon [name]="full() ? 'vm-c-x' : 'maximize'" [size]="16" /></button>
          </div>
          <div class="map">
            <div class="stage" [style.transform]="'scale(' + zoom() + ')'">
              <svg viewBox="0 0 900 280" preserveAspectRatio="none">
                <defs>
                  <pattern id="leHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--ka-fde2e2)" /><line x1="0" y1="0" x2="0" y2="8" stroke="var(--kl-f9a8a8)" stroke-width="3" /></pattern>
                  <pattern id="leGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="var(--kl-ebe8f8)" stroke-width="1" /></pattern>
                </defs>
                <rect width="900" height="280" fill="var(--ka-fbfaff)" />
                <path d="M40 12 H 860 V 272 H 40 Z" fill="url(#leGrid)" stroke="var(--kl-a9a3d6)" stroke-width="3" />
                <g stroke="var(--kl-c9c4ec)" stroke-width="2" fill="none">
                  <path d="M40 120 H 100 M40 210 H 100 M300 128 V 220 M560 134 V 226 M630 126 H 650 M290 110 H 382 M745 150 V 226 M240 228 V 272 M700 232 V 272" />
                  <rect x="54" y="26" width="34" height="80" /><rect x="54" y="140" width="34" height="56" /><rect x="304" y="140" width="66" height="76" />
                  <path d="M318 150 h40 M318 162 h40 M318 174 h40 M318 186 h40 M318 198 h40" stroke-width="1" />
                </g>
                @if (building() === buildings[0]) {
                  @for (z of zoneList; track z.name) {
                    <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" rx="4"
                      [attr.fill]="z.fill === 'hatch' ? 'url(#leHatch)' : z.fill" [attr.stroke]="z.stroke" [attr.stroke-width]="z.name === 'Restricted Zone' ? 3 : 1.6"
                      class="zone" [class.hl]="flashZone() === z.name || zone() === z.name" (click)="pickZone(z.name)" />
                  }
                  @if (show().e && path()) {<path class="route" [attr.d]="path()" />}
                  @if (show().e && planPath()) {<path class="route plan" [attr.d]="planPath()" />}
                  @for (t of trees; track $index) {<g [attr.transform]="'translate(' + t[0] + ' ' + t[1] + ')'" fill="var(--ka-9fd08a)"><circle cx="-4" r="4.5" /><circle cx="4" r="4.5" /><circle cy="-4" r="4.5" /><circle cy="4" r="4.5" /></g>}
                }
              </svg>
              @if (building() === buildings[0]) {
                @for (z of zoneList; track z.name) {
                  <button class="zl" [class.red]="z.name === 'Restricted Zone'" [class.small]="z.h < 50" [style.left.%]="(z.x + z.w / 2) / 9" [style.top.%]="(z.y + (z.h < 50 ? z.h / 2 : z.name === 'Restricted Zone' ? 40 : 24)) / 2.8" (click)="pickZone(z.name)">
                    @if (z.icon) {<app-icon [name]="z.icon" [size]="z.h < 50 ? 20 : 24" />}<b>{{ z.name }}</b>
                  </button>
                }
                @if (show().a && restrictedOpen()) {
                  <button class="alertpin" [style.left.%]="pt('Restricted Zone')[0] / 9" [style.top.%]="pt('Restricted Zone')[1] / 2.8" (click)="viewAlert(restrictedOpen()!)">
                    <i>!</i><span>Unauthorized<br />entry attempt</span>
                  </button>
                }
                @if (show().v) {
                  @for (m of markers(); track m.id; let i = $index) {
                    <button class="mk" [attr.data-s]="m.status" [attr.data-c]="i % 2 ? 'b' : 'g'" [class.sel]="selId() === m.id" [class.dim]="!m.match" [style.left.%]="m.x / 9" [style.top.%]="m.y / 2.8" (click)="select(m.id)">
                      <i></i>
                      @if (show().e || selId() === m.id) {<span class="cl"><b>{{ m.name }}</b><small>{{ m.status === 'Active' ? 'Escorted · ' + m.escort : m.status === 'Awaiting Escort' ? 'Awaiting Escort' : 'Unescorted' }}</small></span>}
                    </button>
                  }
                }
              } @else {
                <div class="empty-floor"><app-icon name="map-floor" [size]="34" /><b>{{ building() }}</b><span>No tracked visitors on this building right now.</span><button class="vm-link" (click)="building.set(buildings[0])">Back to Tower A</button></div>
              }
            </div>
            @if (sel(); as s) { @if (s.site !== buildings[0] && !s.ended) {<div class="offsite"><app-icon name="map-pin" [size]="14" />{{ s.name }} is at {{ s.locLabel }} (another site)</div>} }
            @if (zoom() !== 1) {<span class="zm">{{ (zoom() * 100).toFixed(0) }}%</span>}
          </div>
        </div>

        @if (sel(); as s) {
          <div class="vm-card selc">
            <div class="vm-card-head"><h2><app-icon name="user" [size]="22" />Selected Visitor</h2><span class="spacer"></span>
              @if (s.ended) {<vm-status label="Visit ended" tone="grey" />}
              @else if (inZone(s)) {<span class="okz"><app-icon name="vm-c-check-circle" [size]="16" />Within permitted zone</span>}
              @else {<span class="okz bad"><app-icon name="triangle-alert" [size]="16" />Outside permitted zone</span>}
            </div>
            <div class="who">
              <vm-avatar [name]="s.name" [size]="92" [square]="true" />
              <div class="w1">
                <h3>{{ s.name }}</h3>
                <span><app-icon name="building" [size]="14" />Company: {{ s.company }}</span>
                <span><app-icon name="user" [size]="14" />Host: {{ s.host }}</span>
                <span><app-icon name="id-card" [size]="14" />Badge: {{ s.id }}</span>
                <span><app-icon name="clock" [size]="14" />Time on-site: {{ fmtDur(s.onSite) }}</span>
              </div>
              <div class="w2">
                <span class="top"><app-icon name="map-pin" [size]="15" /><em>Current Location:<br />{{ s.ended ? 'Checked out' : s.locLabel }}</em></span>
                <span><app-icon name="user" [size]="15" />Escort Status: <vm-status [label]="escLabel(s)" [tone]="escTone(s)" /></span>
                <span><app-icon name="vm-e-escort" [size]="15" />Escort: {{ s.escort || '—' }}</span>
                <span><app-icon name="calendar-days" [size]="15" />Visit Purpose: {{ s.purpose }}</span>
              </div>
            </div>
            <div class="pz">
              <h4><app-icon name="shield-check" [size]="17" />Permitted Zones</h4>
              <div class="chips">@for (z of s.permitted; track z) {<button class="zc" (click)="pickZone(z)"><app-icon name="vm-c-check" [size]="13" />{{ z }}</button>}</div>
            </div>
            <div class="sbtn">
              <button class="ob" (click)="viewPlanFor(s)"><app-icon name="vm-a-route" [size]="18" />View Movement Plan</button>
              <div class="menu-wrap">
                <button class="ob" [disabled]="!s.escort" (click)="toggleMenu('contact', $event)"><app-icon name="phone" [size]="18" />Contact Escort</button>
                @if (menu() === 'contact') {
                  <div class="dropdown" (click)="$event.stopPropagation()">
                    <button class="dd-item" (click)="contact(s.escort, 'Call')"><app-icon name="phone" [size]="15" />Call {{ phoneOf(s.escort) }}</button>
                    <button class="dd-item" (click)="contact(s.escort, 'SMS')"><app-icon name="vm-c-sms" [size]="15" />Send SMS</button>
                    <button class="dd-item" (click)="contact(s.escort, 'Teams')"><app-icon name="vm-c-teams" [size]="15" />Message on Teams</button>
                  </div>
                }
              </div>
              <button class="ob red" [disabled]="s.ended" (click)="endOpen.set(true)"><app-icon name="vm-c-log-out" [size]="18" />End Visit</button>
            </div>
          </div>
        }
      </div>

      <div class="mid">
        <div class="vm-card" [class.flash]="flash() === 'Escort Assignments'" #escCard>
          <div class="vm-card-head"><h2><app-icon name="users" [size]="22" />Escort Assignments</h2><span class="spacer"></span>
            <button class="btn-primary sb" (click)="openAssign()"><app-icon name="plus" [size]="16" />Assign Escort</button></div>
          <div class="tw">
            <table class="vm-table">
              <thead><tr><th>Escort</th><th>Visitor</th><th>Current Location</th><th>Escort Status</th><th class="c">Time<br />on-site</th><th></th></tr></thead>
              <tbody>
                @for (a of assignments(); track a.id) {
                  <tr class="click" [class.sel]="selId() === a.id" (click)="select(a.id)">
                    <td><div class="vm-person"><vm-avatar [name]="a.escort" [size]="22" />{{ a.escort }}</div></td>
                    <td><span class="ic"><app-icon name="user" [size]="14" />{{ a.name }}</span></td>
                    <td class="wl"><span class="ic"><app-icon name="map-pin" [size]="14" />{{ a.ended ? 'Checked out' : a.zone }}</span></td>
                    <td><vm-status [label]="a.status" [tone]="a.status === 'Active' ? 'green' : a.status === 'Completed' ? 'grey' : 'orange'" [icon]="a.status === 'Awaiting Escort' ? 'clock' : a.status === 'Active' ? 'vm-c-check-circle' : undefined" /></td>
                    <td class="c">{{ a.status === 'Awaiting Escort' ? '—' : fmtDur(a.onSite) }}</td>
                    <td (click)="$event.stopPropagation()"><div class="menu-wrap">
                      <button class="dots" (click)="toggleMenu('esc:' + a.id, $event)"><app-icon name="more" [size]="15" /></button>
                      @if (menu() === 'esc:' + a.id) {
                        <div class="dropdown right" (click)="$event.stopPropagation()">
                          <button class="dd-item" (click)="select(a.id); menu.set(null)"><app-icon name="map-pin" [size]="15" />Locate on map</button>
                          @if (a.status === 'Awaiting Escort') {<button class="dd-item" (click)="startEscort(a)"><app-icon name="play" [size]="15" />Escort arrived – start</button>}
                          <button class="dd-item" [disabled]="a.ended" (click)="openAssign(a)"><app-icon name="refresh" [size]="15" />Reassign escort</button>
                          <button class="dd-item" (click)="contact(a.escort, 'Call')"><app-icon name="phone" [size]="15" />Call escort</button>
                          @if (a.status !== 'Completed') {<button class="dd-item" (click)="endEscort(a)"><app-icon name="vm-c-check" [size]="15" />End escort</button>}
                        </div>
                      }
                    </div></td>
                  </tr>
                } @empty {<tr><td colspan="6" class="vm-empty">No escort assignments match. <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div class="vm-card" [class.flash]="flash() === 'Zone Alerts'" #alertCard>
          <div class="vm-card-head"><h2 class="redh"><app-icon name="triangle-alert" [size]="22" />Zone Alerts</h2><span class="spacer"></span>
            @if (resolvedCount()) {<button class="vm-link sm" (click)="hideResolved.set(!hideResolved())">{{ hideResolved() ? 'Show' : 'Hide' }} resolved ({{ resolvedCount() }})</button>}</div>
          <div class="tw">
            <table class="vm-table">
              <thead><tr><th>Alert</th><th>Zone</th><th>Severity</th><th>Time</th><th>Visitor</th><th>Actions</th></tr></thead>
              <tbody>
                @for (a of alertRows(); track a.id) {
                  <tr [class.done]="a.resolved">
                    <td class="al"><span class="ic red"><app-icon name="triangle-alert" [size]="16" /><span>{{ a.alert }}</span></span></td>
                    <td><span class="ic"><app-icon name="map-pin" [size]="14" />{{ a.zone }}</span></td>
                    <td>@if (a.resolved) {<vm-status label="Resolved" tone="green" />} @else {<vm-status [label]="a.severity" />}</td>
                    <td>Today, {{ hm(a.at) }}</td>
                    <td>{{ a.visitor }}</td>
                    <td><div class="acts">
                      <button class="vm-mini" (click)="viewAlert(a)"><app-icon name="eye" [size]="13" />View</button>
                      <button class="vm-mini" [disabled]="a.resolved" (click)="resolve(a)"><app-icon name="vm-c-check" [size]="13" />{{ a.resolved ? 'Resolved' : 'Resolve' }}</button>
                      <div class="menu-wrap">
                        <button class="dots" (click)="toggleMenu('al:' + a.id, $event)"><app-icon name="more" [size]="15" /></button>
                        @if (menu() === 'al:' + a.id) {
                          <div class="dropdown right" (click)="$event.stopPropagation()">
                            <button class="dd-item" (click)="notifySec(a)"><app-icon name="shield" [size]="15" />Notify security</button>
                            @if (visitorByName(a.visitor); as v) {<button class="dd-item" (click)="openAssign(v)"><app-icon name="vm-e-escort" [size]="15" />Assign escort to {{ a.visitor }}</button>}
                            <button class="dd-item" [disabled]="a.resolved" (click)="resolve(a, true)"><app-icon name="vm-c-x" [size]="15" />Dismiss as false alarm</button>
                          </div>
                        }
                      </div>
                    </div></td>
                  </tr>
                } @empty {<tr><td colspan="6" class="vm-empty">No open zone alerts.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="vm-card hist" [class.flash]="flash() === 'History'" #histCard>
        <div class="vm-card-head"><h2><app-icon name="history" [size]="22" />Visitor Movement History</h2><span class="spacer"></span><small class="cnt">{{ moveRows().length }} movements</small></div>
        <div class="tw h">
          <table class="vm-table">
            <thead><tr><th>Visitor</th><th>From Zone</th><th></th><th>To Zone</th><th>Time</th><th>Escort</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              @for (m of moveRows(); track m.id) {
                <tr [class.sel]="pathMove() === m.id">
                  <td><div class="vm-person"><vm-avatar [name]="m.visitor" [size]="26" />{{ m.visitor }}@if (m.flagged) {<span class="flag">Flagged</span>}</div></td>
                  <td><span class="ic"><app-icon name="map-pin" [size]="14" />{{ m.from }}</span></td>
                  <td class="arr">→</td>
                  <td><span class="ic" [class.red]="m.to === 'Restricted Zone'"><app-icon [name]="m.to === 'Restricted Zone' ? 'triangle-alert' : 'map-pin'" [size]="14" />{{ m.to }}</span></td>
                  <td><span class="ic"><app-icon name="calendar-days" [size]="14" />Today, {{ hm(m.at) }}</span></td>
                  <td>@if (m.escort !== '—') {<span class="ic"><app-icon name="user" [size]="14" />{{ m.escort }}</span>} @else {—}</td>
                  <td>{{ m.dur }}</td>
                  <td><vm-status [label]="m.status" [tone]="m.status === 'Completed' ? 'green' : m.status === 'Alert' ? 'red' : 'blue'" [icon]="m.status === 'Completed' ? 'vm-c-check-circle' : m.status === 'Alert' ? 'vm-a-info' : undefined" /></td>
                  <td><div class="acts">
                    <button class="vm-mini" (click)="viewMove(m)"><app-icon name="eye" [size]="13" />View</button>
                    <button class="vm-mini" (click)="detail.set(m)"><app-icon name="file-text" [size]="13" />Details</button>
                    <div class="menu-wrap">
                      <button class="dots" (click)="toggleMenu('mv:' + m.id, $event)"><app-icon name="more" [size]="15" /></button>
                      @if (menu() === 'mv:' + m.id) {
                        <div class="dropdown right" (click)="$event.stopPropagation()">
                          <button class="dd-item" (click)="flag(m)"><app-icon name="training-flag" [size]="15" />{{ m.flagged ? 'Remove flag' : 'Flag for review' }}</button>
                          <button class="dd-item" (click)="exportMoves([m]); menu.set(null)"><app-icon name="download" [size]="15" />Export movement</button>
                          <button class="dd-item" (click)="go('visitor-logs-history')"><app-icon name="history" [size]="15" />Open visitor logs</button>
                        </div>
                      }
                    </div>
                  </div></td>
                </tr>
              } @empty {<tr><td colspan="9" class="vm-empty">No movements match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    @if (full()) {<div class="g-overlay" (click)="full.set(false)"></div>}

    @if (assign(); as f) {
      <div class="g-overlay" (click)="assign.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveAssign()">
        <div class="modal-head"><h3>Assign Escort</h3><button type="button" class="close-btn" (click)="assign.set(null)">×</button></div>
        <div class="form-grid">
          <label>Visitor<select class="input" [value]="f.visitor" (change)="patchAssign({ visitor: $any($event.target).value })">@for (v of liveVisitors(); track v.id) {<option [value]="v.id">{{ v.name }} – {{ v.status === 'Active' ? 'escorted by ' + v.escort : v.status }}</option>}</select></label>
          <label>Escort<select class="input" [value]="f.escort" (change)="patchAssign({ escort: $any($event.target).value })">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }} · {{ h.dept }}{{ h.available ? '' : ' (busy)' }}</option>}</select></label>
          <label>Meet at<select class="input" [value]="f.meet" (change)="patchAssign({ meet: $any($event.target).value })">@for (z of zones; track z) {<option [value]="z">{{ z }}</option>}</select></label>
          <label>Duration<select class="input" [value]="f.dur" (change)="patchAssign({ dur: $any($event.target).value })"><option>Until visit ends</option><option>30 minutes</option><option>1 hour</option><option>2 hours</option></select></label>
          <label class="full">Notes for escort<textarea class="input" rows="2" [value]="f.note" (input)="patchAssign({ note: $any($event.target).value })" placeholder="e.g. Contractor needs access to Reception only"></textarea></label>
        </div>
        @if (!hostAvail(f.escort)) {<p class="warn"><app-icon name="triangle-alert" [size]="15" />{{ f.escort }} is marked busy – they will be asked to confirm.</p>}
        <label class="notify"><button type="button" class="vm-switch purple" [class.on]="f.notify" (click)="patchAssign({ notify: !f.notify })"></button>Notify escort and host by SMS &amp; Teams</label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="assign.set(null)">Cancel</button><button class="btn-primary" type="submit"><app-icon name="vm-e-escort" [size]="16" />Assign Escort</button></div>
      </form>
    }

    @if (planForm(); as p) {
      <div class="g-overlay" (click)="planForm.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); savePlan()">
        <div class="modal-head"><h3>Create Movement Plan</h3><button type="button" class="close-btn" (click)="planForm.set(null)">×</button></div>
        <div class="form-grid">
          <label>Visitor<select class="input" [value]="p.visitor" (change)="patchPlan({ visitor: $any($event.target).value })">@for (v of liveVisitors(); track v.id) {<option [value]="v.name">{{ v.name }}</option>}</select></label>
          <label>Escort<select class="input" [value]="p.escort" (change)="patchPlan({ escort: $any($event.target).value })"><option value="">No escort required</option>@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
          <label>Start time<select class="input" [value]="'' + p.start" (change)="patchPlan({ start: +$any($event.target).value })">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select></label>
          <label>Add zone to route<select class="input" #addz (change)="addStop(addz.value); addz.value = ''"><option value="">Select zone…</option>@for (z of zones; track z) {<option [value]="z">{{ z }}</option>}</select></label>
        </div>
        <div class="route-ed">
          @for (z of p.route; track $index; let i = $index; let last = $last) {
            <span class="stop" [class.rz]="z === 'Restricted Zone'"><b>{{ i + 1 }}</b>{{ z }}<button type="button" (click)="removeStop(i)">×</button></span>
            @if (!last) {<app-icon name="chevron-right" [size]="14" />}
          } @empty {<span class="muted">Add at least two zones to build the route.</span>}
        </div>
        @if (p.route.includes('Restricted Zone')) {<p class="warn"><app-icon name="triangle-alert" [size]="15" />Route includes the Restricted Zone – security approval and an escort are required.</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="planForm.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="p.route.length < 2 || (p.route.includes('Restricted Zone') && !p.escort)">Create Plan</button></div>
      </form>
    }

    @if (plansOpen()) {
      <div class="g-overlay" (click)="plansOpen.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Movement Plans ({{ plans().length }})</h3><button type="button" class="close-btn" (click)="plansOpen.set(false)">×</button></div>
        <div class="plist">
          <table class="vm-table">
            <thead><tr><th>Plan</th><th>Visitor</th><th>Route</th><th>Escort</th><th>Start</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr>
                  <td><b>{{ p.id }}</b></td><td>{{ p.visitor }}</td><td class="wrap">{{ p.route.join(' → ') }}</td><td>{{ p.escort || '—' }}</td><td>{{ hm(p.start) }}</td>
                  <td><vm-status [label]="p.status" [tone]="p.status === 'Active' ? 'green' : p.status === 'Scheduled' ? 'blue' : 'grey'" /></td>
                  <td><div class="acts"><button class="vm-mini" (click)="plansOpen.set(false); planView.set(p.id)">View</button>@if (p.status === 'Scheduled' || p.status === 'Active') {<button class="vm-mini red" (click)="cancelPlan(p)">Cancel</button>}</div></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="form-actions"><button class="btn-outline" (click)="exportPlans()"><app-icon name="download" [size]="16" />Export</button><button class="btn-primary" (click)="plansOpen.set(false); openPlan()"><app-icon name="plus" [size]="16" />New Plan</button></div>
      </div>
    }

    @if (planSel(); as p) {
      <div class="g-overlay" (click)="planView.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Movement Plan {{ p.id }} – {{ p.visitor }}</h3><button type="button" class="close-btn" (click)="planView.set(null)">×</button></div>
        <div class="vm-kv">
          <span>Status</span><b><vm-status [label]="p.status" [tone]="p.status === 'Active' ? 'green' : p.status === 'Scheduled' ? 'blue' : 'grey'" /></b>
          <span>Escort</span><b>{{ p.escort || 'Not required' }}</b>
          <span>Start</span><b>Today, {{ hm(p.start) }}</b>
          @if (p.note) {<span>Notes</span><b>{{ p.note }}</b>}
        </div>
        <ol class="steps">
          @for (z of p.route; track $index; let i = $index) {
            <li [class.done]="p.status === 'Completed' || (p.status === 'Active' && i < stepNow(p))" [class.now]="p.status === 'Active' && i === stepNow(p)"><i></i><b>{{ z }}</b><small>{{ hm(p.start + i * 8) }}{{ p.status === 'Active' && i === stepNow(p) ? ' · current' : '' }}</small></li>
          }
        </ol>
        <div class="form-actions">
          <button class="btn-ghost" (click)="planView.set(null)">Close</button>
          <button class="btn-primary" (click)="showPlan(p)"><app-icon name="map-pin" [size]="16" />Show on Map</button>
        </div>
      </div>
    }

    @if (detail(); as m) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Movement Details – {{ m.visitor }}</h3><button type="button" class="close-btn" (click)="detail.set(null)">×</button></div>
        <div class="vm-kv">
          <span>Movement</span><b>{{ m.from }} → {{ m.to }}</b>
          <span>Entered</span><b>Today, {{ hm(m.at) }}</b>
          <span>Duration</span><b>{{ m.dur }}</b>
          <span>Escort</span><b>{{ m.escort }}</b>
          <span>Status</span><b><vm-status [label]="m.status" [tone]="m.status === 'Completed' ? 'green' : m.status === 'Alert' ? 'red' : 'blue'" /></b>
        </div>
        <h4 class="h4">Badge reader events</h4>
        <ul class="scans">
          <li><b>{{ hm(m.at - 1) }}</b>Badge scan at {{ m.from }} exit reader</li>
          <li><b>{{ hm(m.at) }}</b>{{ m.to === 'Restricted Zone' ? 'Access DENIED at ' : 'Badge scan at ' }}{{ m.to }} door reader</li>
          @if (m.status === 'Alert') {<li class="red"><b>{{ hm(m.at + 2) }}</b>Security notified – visitor returned to Visitor Lounge</li>}
          @if (m.escort !== '—') {<li><b>{{ hm(m.at) }}</b>Escort {{ m.escort }} BLE tag detected within 5 m</li>}
        </ul>
        <div class="form-actions"><button class="btn-ghost" (click)="exportMoves([m])"><app-icon name="download" [size]="16" />Export</button><button class="btn-primary" (click)="viewMove(m); detail.set(null)">Show on Map</button></div>
      </div>
    }

    @if (endOpen() && sel(); as s) {
      <div class="g-overlay" (click)="endOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>End visit – {{ s.name }}</h3><button type="button" class="close-btn" (click)="endOpen.set(false)">×</button></div>
        <p>{{ s.name }} will be checked out, badge {{ s.id }} deactivated and the escort assignment{{ s.escort ? ' with ' + s.escort : '' }} closed.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="endOpen.set(false)">Cancel</button><button class="btn-red" (click)="endVisit(s)"><app-icon name="vm-c-log-out" [size]="16" />End Visit</button></div>
      </div>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .le { gap: 10px; }
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text); margin-bottom: 2px; }
    .crumb a { color: var(--text); text-decoration: none; } .crumb b { font-weight: 600; }
    .hb { height: 38px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; }
    .vm-icon-btn.tall { height: 38px; width: 38px; }
    .menu-wrap { position: relative; display: inline-block; }
    .dropdown { right: auto; left: 0; min-width: 210px; z-index: 30; } .dropdown.right { left: auto; right: 0; }
    .dd-item[disabled] { opacity: .45; cursor: not-allowed; }
    .vm-kpis { gap: 10px; }
    :host ::ng-deep .vm-kpi { padding: 8px 14px; gap: 14px; }
    :host ::ng-deep .vm-kpi-ic { width: 54px; height: 54px; }
    :host ::ng-deep .vm-kpi-label { font-size: 16px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .bar { display: flex; align-items: center; gap: 5px; min-width: 0; }
    .tabs { display: flex; flex: none; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); overflow: hidden; }
    .tabs button { height: 34px; padding: 0 10px; border: 0; border-right: 1px solid var(--border); background: none; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text); white-space: nowrap; }
    .tabs button:last-child { border-right: 0; } .tabs button:hover { background: var(--kb-f5f0ff); }
    .tabs button.on { background: var(--primary); color: var(--kf-ffffff); font-weight: 600; }
    .vsep { width: 1px; height: 26px; background: var(--border); margin: 0 3px; }
    .bar .vm-search { min-width: 130px; height: 34px; padding: 0 7px; } .bar .vm-search input { font-size: 12px; }
    .bar .vm-filter { height: 34px; font-size: 11.5px; padding: 0 5px; gap: 3px; min-width: 0; } .bar .vm-filter > span { font-weight: 600; }
    .bar .vm-filter select { font-size: 11.5px; max-width: 58px; }
    .bar .vm-icon-btn { width: 34px; height: 34px; } .spin app-icon { animation: sp .7s linear; } @keyframes sp { to { transform: rotate(360deg); } }
    .vm-card { padding: 10px 12px; }
    .vm-card-head { margin-bottom: 6px; gap: 6px; min-height: 28px; } .vm-card-head h2 { font-size: 18px; white-space: nowrap; }
    .vm-card-head h2.redh app-icon { color: var(--kf-dc2626); }
    .cnt { color: var(--muted); font-size: 12px; } .sm { font-size: 12.5px; }
    .flash { animation: fc 1.4s; } @keyframes fc { 0%, 50% { box-shadow: 0 0 0 3px var(--kb-a78bfa); } }

    .top { display: grid; grid-template-columns: minmax(0, 1fr) 486px; gap: 12px; align-items: stretch; }
    .mapc { display: flex; flex-direction: column; min-width: 0; }
    .mapc.full { position: fixed; inset: 40px 40px auto 40px; z-index: 71; box-shadow: 0 20px 50px rgba(20,20,60,.3); }
    .bld { height: 30px; } .bld select { max-width: 150px; font-size: 12px; }
    .legend { display: flex; border: 1px solid var(--border); border-radius: 8px; height: 30px; overflow: hidden; }
    .legend button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: var(--kb-ffffff); font: inherit; font-size: 12px; padding: 0 8px; cursor: pointer; color: var(--text); }
    .legend button.off { opacity: .4; text-decoration: line-through; }
    .legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; }
    .legend .g { background: var(--kb-16a34a); } .legend .b { background: var(--kb-2563eb); } .legend .r { background: var(--kb-dc2626); color: var(--kf-ffffff); font-size: 9px; font-weight: 800; width: 14px; height: 14px; }
    .vm-icon-btn.sm { width: 30px; height: 30px; }
    .map { position: relative; overflow: hidden; border-radius: 10px; border: 1px solid var(--kl-ece9fb); flex: 1; display: flex; align-items: center; background: var(--kb-fbfaff); }
    .stage { position: relative; width: 100%; aspect-ratio: 900 / 280; transition: transform .25s; transform-origin: center; }
    .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .zone { cursor: pointer; transition: filter .15s; } .zone:hover { filter: brightness(.97); } .zone.hl { stroke: var(--kl-7c3aed); stroke-width: 3; filter: drop-shadow(0 0 6px rgba(124,58,237,.5)); }
    .route { fill: none; stroke: var(--kl-16a34a); stroke-width: 3; stroke-dasharray: 8 6; animation: dash 1.2s linear infinite; pointer-events: none; }
    .route.plan { stroke: var(--kl-7c3aed); } @keyframes dash { to { stroke-dashoffset: -14; } }
    .zl { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; border: 0; background: none; font: inherit; cursor: pointer; color: var(--kf-1e1b4b); white-space: nowrap; padding: 0; }
    .zl b { font-size: 14px; font-weight: 700; } .zl app-icon { color: var(--kf-4338ca); }
    .zl.small b { font-size: 13px; } .zl.red { flex-direction: column; gap: 2px; } .zl.red, .zl.red app-icon { color: var(--kf-b91c1c); }
    .mk { position: absolute; transform: translate(-50%, -50%); border: 0; background: none; padding: 0; cursor: pointer; z-index: 2; }
    .mk > i { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-16a34a); border: 3px solid var(--kl-ffffff); box-shadow: 0 0 0 2px #16a34a55, 0 2px 4px rgba(0,0,0,.2); }
    .mk[data-s='Awaiting Escort'] > i { background: var(--kb-f59e0b); box-shadow: 0 0 0 2px #f59e0b55; } .mk[data-s='Completed'] > i { background: var(--kb-2563eb); }
    .mk[data-c='b'][data-s='Active'] > i { background: var(--kb-2563eb); box-shadow: 0 0 0 2px #2563eb55; }
    .mk.sel > i { animation: pulse 1.4s infinite; } @keyframes pulse { 50% { box-shadow: 0 0 0 8px rgba(124,58,237,.18); } }
    .mk.dim { opacity: .3; }
    .cl { position: absolute; left: 14px; top: 2px; display: flex; flex-direction: column; text-align: left; white-space: nowrap; background: var(--kb-ffffff); border: 1.5px solid var(--kl-86efac); border-radius: 6px; padding: 2px 8px; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
    .mk[data-s='Awaiting Escort'] .cl { border-color: var(--kl-fdba74); background: var(--kb-fffbeb); } .mk[data-s='Awaiting Escort'] .cl small { color: var(--kf-c2410c); }
    .mk[data-c='b'][data-s='Active'] .cl { border-color: var(--kl-93c5fd); background: var(--kb-eff6ff); } .mk[data-c='b'][data-s='Active'] .cl small { color: var(--kf-1d4ed8); }
    .cl b { font-size: 13px; } .cl small { font-size: 11.5px; color: var(--kf-15803d); }
    .mk.sel .cl { border-color: var(--kl-7c3aed); }
    .alertpin { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; cursor: pointer; z-index: 2; }
    .alertpin i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-dc2626); color: var(--kf-ffffff); font-style: normal; font-weight: 800; border: 2px solid var(--kl-ffffff); box-shadow: 0 0 0 4px rgba(220,38,38,.25); animation: pulse2 1.3s infinite; }
    @keyframes pulse2 { 50% { box-shadow: 0 0 0 9px rgba(220,38,38,.08); } }
    .alertpin span { background: var(--kb-ffffff); border: 1.5px solid var(--kl-f87171); color: var(--kf-b91c1c); border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 700; text-align: center; line-height: 1.2; }
    .empty-floor { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--muted); font-size: 13px; } .empty-floor b { color: var(--text); font-size: 15px; }
    .offsite { position: absolute; left: 8px; bottom: 8px; display: flex; align-items: center; gap: 6px; background: var(--kb-ffffff); border: 1px solid var(--kl-c4b5fd); color: var(--kf-5b21b6); border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
    .zm { position: absolute; right: 8px; bottom: 8px; background: var(--kb-1e1b3a); color: var(--kf-ffffff); font-size: 11px; border-radius: 6px; padding: 2px 6px; }

    .selc { display: flex; flex-direction: column; gap: 8px; }
    .okz { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: var(--kb-dcfce7); color: var(--kf-166534); font-size: 13px; font-weight: 600; white-space: nowrap; } .okz app-icon { color: var(--kf-16a34a); }
    .okz.bad { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .okz.bad app-icon { color: var(--kf-dc2626); }
    .who { display: grid; grid-template-columns: 92px minmax(0, 1fr) minmax(0, 1.12fr); gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--kl-f0eefb); }
    .who h3 { margin: 0 0 4px; font-size: 19px; font-weight: 800; }
    .w1, .w2 { display: flex; flex-direction: column; gap: 4px; font-size: 12px; min-width: 0; }
    .w1 span, .w2 span { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .w2 span { white-space: normal; line-height: 1.25; } .w1 app-icon, .w2 app-icon { color: var(--kf-334155); flex: none; }
    .w2 span.top { align-items: flex-start; } .w2 em { font-style: normal; white-space: normal; }
    .w2 { padding-top: 4px; gap: 6px; }
    .w2 :is(vm-status) { font-size: 11.5px; padding: 2px 8px; }
    .pz h4 { margin: 0 0 6px; font-size: 14px; display: flex; align-items: center; gap: 8px; } .pz h4 app-icon { color: var(--primary); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .zc { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 7px; background: var(--kb-ecfdf3); color: var(--kf-14532d); font: inherit; font-size: 12.5px; padding: 4px 12px; cursor: pointer; } .zc app-icon { color: var(--kf-16a34a); } .zc:hover { background: var(--kb-dcfce7); }
    .sbtn { display: grid; grid-template-columns: 1.15fr 1fr .8fr; gap: 8px; margin-top: auto; }
    .sbtn .menu-wrap { display: block; } .sbtn .menu-wrap .ob { width: 100%; }
    .ob { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border: 1.5px solid var(--kl-a78bfa); border-radius: 9px; background: var(--kb-ffffff); color: var(--primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; padding: 0 8px; }
    .ob:hover { background: var(--kb-f5f0ff); } .ob[disabled] { opacity: .45; cursor: not-allowed; }
    .ob.red { border-color: var(--kl-fca5a5); color: var(--kf-dc2626); background: var(--kb-fff5f5); } .ob.red:hover { background: var(--kb-fee2e2); }

    .mid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 12px; }
    .sb { height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 13.5px; }
    .tw { overflow-y: auto; overflow-x: hidden; max-height: 170px; }
    .tw.h { max-height: 136px; }
    .vm-table th { font-size: 11.5px; padding: 5px 4px; position: sticky; top: 0; z-index: 1; background: var(--kb-f1eeff); }
    .vm-table td { font-size: 11.5px; padding: 4px 4px; white-space: nowrap; }
    .vm-person { gap: 6px; font-size: 12px; }
    .ic { display: inline-flex; align-items: center; gap: 5px; } .ic app-icon { color: var(--kf-334155); flex: none; } .ic.red, .ic.red app-icon { color: var(--kf-dc2626); }
    .vm-table td.al { white-space: normal; } td.al .ic { align-items: flex-start; } td.al span span { line-height: 1.15; max-width: 108px; }
    .vm-table td.wl { white-space: normal; line-height: 1.15; max-width: 120px; }
    .vm-table :is(vm-status) { font-size: 11px; padding: 2px 6px; gap: 3px; }
    .vm-table td.c { text-align: center; } .vm-table td.arr { font-size: 17px; font-weight: 700; padding: 0 2px; }
    .acts { display: flex; gap: 3px; align-items: center; } .acts .vm-mini { font-size: 11px; padding: 2px 6px; gap: 3px; } .vm-mini[disabled] { opacity: .45; cursor: default; }
    .vm-mini.red { border-color: var(--kl-fca5a5); color: var(--kf-dc2626); }
    .dots { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; width: 24px; height: 24px; display: grid; place-items: center; cursor: pointer; color: var(--text); } .dots:hover { border-color: var(--kl-c4b5fd); }
    tr.done td { opacity: .55; }
    .flag { margin-left: 4px; font-size: 10.5px; font-weight: 700; color: var(--kf-b45309); background: var(--kb-fef3c7); border-radius: 5px; padding: 1px 5px; }
    .hist .vm-table td { padding: 3px 5px; }

    .notify { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; }
    .warn { display: flex; align-items: center; gap: 8px; color: var(--kf-b45309); background: var(--kb-fffbeb); border: 1px solid var(--kl-fde68a); border-radius: 8px; padding: 8px 10px; font-size: 13px; margin: 12px 0 0; }
    .route-ed { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding: 10px; border: 1px dashed var(--kl-c4b5fd); border-radius: 10px; min-height: 46px; }
    .stop { display: inline-flex; align-items: center; gap: 6px; background: var(--kb-ede9fe); color: var(--kf-4c1d95); border-radius: 16px; padding: 3px 6px 3px 3px; font-size: 12.5px; }
    .stop b { width: 20px; height: 20px; border-radius: 50%; background: var(--primary); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 11px; }
    .stop.rz { background: var(--kb-fee2e2); color: var(--kf-991b1b); } .stop.rz b { background: var(--kb-dc2626); }
    .stop button { border: 0; background: none; cursor: pointer; color: inherit; font-size: 15px; line-height: 1; }
    .plist { max-height: 60vh; overflow: auto; } .plist td.wrap { white-space: normal; }
    .steps { list-style: none; margin: 14px 0 0; padding: 0 0 0 6px; display: flex; flex-direction: column; }
    .steps li { position: relative; display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 10px; padding: 7px 0; font-size: 13.5px; }
    .steps li::before { content: ''; position: absolute; left: 7px; top: 22px; bottom: -8px; width: 2px; background: var(--kb-e2e8f0); } .steps li:last-child::before { display: none; }
    .steps i { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--kl-cbd5e1); background: var(--kb-ffffff); z-index: 1; }
    .steps li.done i { background: var(--kb-16a34a); border-color: var(--kl-16a34a); } .steps li.now i { border-color: var(--primary); box-shadow: 0 0 0 4px var(--kb-ede9fe); }
    .steps small { color: var(--muted); }
    .h4 { margin: 16px 0 6px; font-size: 14px; }
    .scans { margin: 0; padding: 0; list-style: none; font-size: 13px; display: flex; flex-direction: column; gap: 6px; } .scans b { display: inline-block; width: 74px; } .scans .red { color: var(--kf-b91c1c); }
    .btn-red { display: inline-flex; align-items: center; gap: 6px; background: var(--kb-dc2626); color: var(--kf-ffffff); border: 0; border-radius: 8px; padding: 0 16px; height: 38px; font-weight: 600; cursor: pointer; }
    .form-actions button { display: inline-flex; align-items: center; gap: 6px; }
  `,
})
export class LocationEscort {
  private readonly store = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly hm = hm;
  protected readonly fmtDur = fmtDur;
  protected readonly tabs = TABS;
  protected readonly sites = SITES;
  protected readonly zones = LE_ZONES;
  protected readonly types = VISITOR_TYPES;
  protected readonly hosts = HOSTS;
  protected readonly buildings = BUILDINGS;
  protected readonly times = Array.from({ length: 18 }, (_, i) => 600 + i * 30);
  protected readonly zoneList = Object.entries(ZONE_GEO).map(([name, g]) => ({ name, ...g }));
  protected readonly trees = [[300, 116], [380, 116], [632, 140], [870, 96], [586, 240], [24, 160]];

  protected readonly visitors = signal<LeVisitor[]>(VISITORS.map((v) => ({ ...v, permitted: [...v.permitted] })));
  protected readonly alerts = signal<LeAlert[]>(ALERTS.map((a) => ({ ...a })));
  protected readonly moves = signal<LeMove[]>(MOVES.map((m) => ({ ...m })));
  protected readonly plans = signal<LePlan[]>(PLANS.map((p) => ({ ...p })));
  protected readonly tab = signal<Tab>('Live View');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly zone = signal('');
  protected readonly escF = signal('');
  protected readonly vtype = signal('');
  protected readonly spinning = signal(false);
  protected readonly menu = signal<string | null>(null);
  protected readonly selId = signal('VIS-000784');
  protected readonly building = signal(BUILDINGS[0]);
  protected readonly show = signal({ v: true, e: true, a: true });
  protected readonly zoom = signal(1);
  protected readonly full = signal(false);
  protected readonly flash = signal<string | null>(null);
  protected readonly flashZone = signal<string | null>(null);
  protected readonly pathMove = signal<string | null>(null);
  protected readonly planPreview = signal<string[] | null>(null);
  protected readonly hideResolved = signal(false);
  protected readonly assign = signal<AssignForm | null>(null);
  protected readonly planForm = signal<PlanForm | null>(null);
  protected readonly plansOpen = signal(false);
  protected readonly planView = signal<string | null>(null);
  protected readonly detail = signal<LeMove | null>(null);
  protected readonly endOpen = signal(false);
  protected readonly msg = signal<string | null>(null);
  private readonly mapCard = viewChild<ElementRef<HTMLElement>>('mapCard');
  private readonly escCard = viewChild<ElementRef<HTMLElement>>('escCard');
  private readonly alertCard = viewChild<ElementRef<HTMLElement>>('alertCard');
  private readonly histCard = viewChild<ElementRef<HTMLElement>>('histCard');
  private clock = 624;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  constructor() { inject(DestroyRef).onDestroy(() => clearTimeout(this.toastT)); }

  protected readonly sel = computed(() => this.visitors().find((v) => v.id === this.selId()) ?? null);
  protected readonly planSel = computed(() => this.plans().find((p) => p.id === this.planView()) ?? null);
  protected readonly onSite = computed(() => 86 - this.visitors().filter((v) => v.ended).length);
  protected readonly activeEscorts = computed(() => 9 + this.visitors().filter((v) => v.escort && v.status === 'Active' && !v.ended).length);
  protected readonly openAlerts = computed(() => this.alerts().filter((a) => !a.resolved));
  protected readonly resolvedCount = computed(() => this.alerts().length - this.openAlerts().length);
  protected readonly restrictedOpen = computed(() => this.openAlerts().find((a) => a.zone === 'Restricted Zone') ?? null);
  protected readonly liveVisitors = computed(() => this.visitors().filter((v) => !v.ended));

  private match(v: LeVisitor) {
    const q = this.q().trim().toLowerCase();
    if (q && !`${v.name} ${v.escort} ${v.zone} ${v.company} ${v.id}`.toLowerCase().includes(q)) return false;
    if (this.site() && v.site !== this.site()) return false;
    if (this.zone() && v.zone !== this.zone()) return false;
    if (this.escF() && v.status !== this.escF()) return false;
    if (this.vtype() && v.type !== this.vtype()) return false;
    return true;
  }
  protected readonly markers = computed(() =>
    this.visitors().filter((v) => !v.ended && v.site === BUILDINGS[0] && v.escort && ZONE_PT[v.zone]).map((v) => ({ ...v, x: ZONE_PT[v.zone][0], y: ZONE_PT[v.zone][1], match: this.match(v) })),
  );
  protected readonly assignments = computed(() => this.visitors().filter((v) => v.escort && this.match(v)));
  protected readonly alertRows = computed(() => {
    const q = this.q().trim().toLowerCase(), z = this.zone();
    return this.alerts().filter((a) => (!this.hideResolved() || !a.resolved) && (!z || a.zone === z) && (!q || `${a.alert} ${a.zone} ${a.visitor}`.toLowerCase().includes(q)));
  });
  protected readonly moveRows = computed(() => {
    const q = this.q().trim().toLowerCase(), z = this.zone(), ty = this.vtype();
    return this.moves().filter((m) => {
      const v = this.visitorByName(m.visitor);
      return (!q || `${m.visitor} ${m.from} ${m.to} ${m.escort}`.toLowerCase().includes(q)) && (!z || m.from.startsWith(z) || m.to.startsWith(z)) && (!ty || v?.type === ty) && (!this.site() || v?.site === this.site());
    });
  });
  /** Escort route for the selected visitor (its active plan) or the movement picked in History. */
  protected readonly path = computed(() => {
    const mv = this.moves().find((m) => m.id === this.pathMove());
    if (mv) return this.routePath([mv.from, mv.to]);
    const s = this.sel();
    if (!s || s.ended || this.planPreview()) return null;
    const p = this.plans().find((x) => x.visitor === s.name && x.status === 'Active');
    return p ? this.routePath(p.route.slice(0, this.stepNow(p) + 1)) : null;
  });
  protected readonly planPath = computed(() => (this.planPreview() ? this.routePath(this.planPreview()!) : null));

  private routePath(zones: string[]) {
    const pts = zones.map((z) => ZONE_PT[z.replace(' – 3F', '')]).filter(Boolean);
    if (pts.length < 2) return null;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` H${pts[i][0]} V${pts[i][1]}`;
    return d;
  }
  protected stepNow(p: LePlan) {
    const v = this.visitorByName(p.visitor);
    const i = v ? p.route.indexOf(v.zone) : -1;
    return i >= 0 ? i : Math.min(p.route.length - 1, 1);
  }
  protected pt(z: string) { return ZONE_PT[z]; }
  protected visitorByName(n: string) { return this.visitors().find((v) => v.name === n) ?? null; }
  protected inZone(v: LeVisitor) { return v.permitted.includes(v.zone); }
  protected escLabel(v: LeVisitor) { return v.ended ? 'Visit ended' : v.status === 'Active' ? 'Escorted' : v.status === 'Awaiting Escort' ? 'Awaiting Escort' : 'Unescorted'; }
  protected escTone(v: LeVisitor): 'green' | 'orange' | 'grey' { return v.status === 'Active' && !v.ended ? 'green' : v.status === 'Awaiting Escort' ? 'orange' : 'grey'; }
  protected phoneOf(n: string) { return hostOf(n).name === n ? hostOf(n).phone : '+91 98000 11223'; }
  protected hostAvail(n: string) { return HOSTS.find((h) => h.name === n)?.available ?? true; }

  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.assign.set(null); this.planForm.set(null); this.plansOpen.set(false); this.planView.set(null); this.detail.set(null); this.endOpen.set(false); this.full.set(false); }
  protected go(p: string) { this.menu.set(null); this.router.navigate(['/visitor-management', p]); }
  protected print() { window.print(); }
  private flashCard(name: string, el?: ElementRef<HTMLElement>) {
    el?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.flash.set(null); setTimeout(() => this.flash.set(name)); setTimeout(() => this.flash.set(null), 1500);
  }
  protected setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'Escort Assignments') this.flashCard(t, this.escCard());
    else if (t === 'Zone Alerts') this.flashCard(t, this.alertCard());
    else if (t === 'History') this.flashCard(t, this.histCard());
    else if (t === 'Movement Plans') this.plansOpen.set(true);
    else { this.pathMove.set(null); this.planPreview.set(null); this.mapCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  protected refresh() {
    this.q.set(''); this.site.set(''); this.zone.set(''); this.escF.set(''); this.vtype.set('');
    this.pathMove.set(null); this.planPreview.set(null);
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast('Locations refreshed · BLE & badge readers synced');
  }
  protected flip(k: 'v' | 'e' | 'a') { this.show.update((s) => ({ ...s, [k]: !s[k] })); }
  protected zoomBy(d: number) { this.zoom.update((z) => Math.min(2, Math.max(0.6, +(z + d).toFixed(1)))); }
  protected recenter() { this.zoom.set(1); this.pathMove.set(null); this.planPreview.set(null); this.toast('Map recentred'); }
  protected pickZone(z: string) {
    this.zone.set(this.zone() === z ? '' : z);
    this.toast(this.zone() ? `Filtered to ${z}` : 'Zone filter cleared');
  }
  protected select(id: string) {
    this.selId.set(id); this.pathMove.set(null); this.planPreview.set(null);
    if (this.tab() !== 'Live View') this.tab.set('Live View');
  }

  // ----- escorts
  protected openAssign(v?: LeVisitor) {
    this.menu.set(null);
    const target = v ?? this.visitors().find((x) => x.status === 'Awaiting Escort' && !x.ended) ?? this.liveVisitors()[0];
    const free = HOSTS.find((h) => h.available && h.name !== target.escort && !this.visitors().some((x) => x.escort === h.name && x.status === 'Active' && !x.ended));
    this.assign.set({ visitor: target.id, escort: target.status === 'Awaiting Escort' ? target.escort || free!.name : free!.name, meet: target.zone in ZONE_PT ? target.zone : 'Reception', dur: 'Until visit ends', note: '', notify: true });
  }
  protected patchAssign(c: Partial<AssignForm>) { this.assign.update((a) => (a ? { ...a, ...c } : a)); }
  protected saveAssign() {
    const f = this.assign(); if (!f) return;
    const v = this.visitors().find((x) => x.id === f.visitor)!;
    this.patchV(v.id, { escort: f.escort, status: 'Active' });
    this.addMove({ visitor: v.name, from: v.zone === f.meet ? 'Main Entrance' : v.zone, to: f.meet, escort: f.escort, dur: '0m', status: 'In Progress' });
    this.store.log({ text: `${f.escort} assigned as escort for ${v.name}`, kind: 'notify', visitor: v.id });
    this.assign.set(null); this.selId.set(v.id);
    this.toast(`${f.escort} assigned to escort ${v.name}${f.notify ? ' · escort & host notified' : ''}`);
  }
  protected startEscort(a: LeVisitor) { this.patchV(a.id, { status: 'Active' }); this.menu.set(null); this.toast(`${a.escort} has picked up ${a.name} – escort active`); }
  protected endEscort(a: LeVisitor) { this.patchV(a.id, { status: 'Completed' }); this.menu.set(null); this.toast(`Escort for ${a.name} ended`); }
  protected contact(name: string, how: string) {
    this.menu.set(null);
    this.toast(how === 'Call' ? `Calling ${name} · ${this.phoneOf(name)}…` : `${how} sent to ${name}`);
  }
  protected endVisit(s: LeVisitor) {
    this.patchV(s.id, { ended: true, status: s.escort ? 'Completed' : s.status });
    this.addMove({ visitor: s.name, from: s.locLabel, to: 'Main Entrance', escort: s.escort || '—', dur: fmtDur(s.onSite), status: 'Completed' });
    const sv = this.store.byName(s.name);
    if (sv && (sv.status === 'Checked In' || sv.status === 'Overdue')) this.store.checkOut(sv.id);
    this.endOpen.set(false);
    this.toast(`${s.name} checked out · badge ${s.id} deactivated`);
  }

  // ----- alerts
  protected viewAlert(a: LeAlert) {
    this.menu.set(null);
    const v = this.visitorByName(a.visitor);
    if (v) this.selId.set(v.id);
    this.flashZone.set(a.zone); setTimeout(() => this.flashZone.set(null), 2500);
    this.mapCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.toast(`${a.alert} · ${a.zone} · ${hm(a.at)}${v ? ` · ${v.name}` : ' · unknown badge'}`);
  }
  protected resolve(a: LeAlert, dismiss = false) {
    this.alerts.update((l) => l.map((x) => (x.id === a.id ? { ...x, resolved: true } : x)));
    this.menu.set(null);
    this.store.log({ text: `Zone alert ${dismiss ? 'dismissed' : 'resolved'}: ${a.alert} (${a.zone})`, kind: 'alert' });
    this.toast(`Alert ${dismiss ? 'dismissed as false alarm' : 'resolved'} – ${a.alert}`);
  }
  protected notifySec(a: LeAlert) { this.menu.set(null); this.toast(`Security notified: ${a.alert} at ${a.zone}`); }

  // ----- movements & plans
  private addMove(m: Omit<LeMove, 'id' | 'at'>) { this.clock++; this.moves.update((l) => [{ ...m, id: `MV-${Date.now()}`, at: this.clock }, ...l]); }
  protected viewMove(m: LeMove) {
    this.pathMove.set(m.id); this.planPreview.set(null);
    const v = this.visitorByName(m.visitor); if (v) this.selId.set(v.id);
    this.mapCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  protected flag(m: LeMove) { this.moves.update((l) => l.map((x) => (x.id === m.id ? { ...x, flagged: !x.flagged } : x))); this.menu.set(null); this.toast(m.flagged ? 'Flag removed' : `Movement of ${m.visitor} flagged for review`); }
  protected viewPlanFor(s: LeVisitor) {
    const p = this.plans().find((x) => x.visitor === s.name && x.status !== 'Cancelled');
    if (p) this.planView.set(p.id);
    else { this.openPlan(s.name); this.toast(`No plan yet for ${s.name} – create one`); }
  }
  protected showPlan(p: LePlan) { this.planPreview.set(p.route); this.pathMove.set(null); this.planView.set(null); this.mapCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  protected openPlan(visitor?: string) {
    const v = visitor ?? this.sel()?.name ?? 'Arjun Mehta';
    const vv = this.visitorByName(v);
    this.planForm.set({ visitor: v, escort: vv?.escort ?? '', start: 630, route: ['Main Entrance', 'Reception'] });
  }
  protected patchPlan(c: Partial<PlanForm>) { this.planForm.update((p) => (p ? { ...p, ...c } : p)); }
  protected addStop(z: string) { if (z) this.planForm.update((p) => (p ? { ...p, route: [...p.route, z] } : p)); }
  protected removeStop(i: number) { this.planForm.update((p) => (p ? { ...p, route: p.route.filter((_, j) => j !== i) } : p)); }
  protected savePlan() {
    const f = this.planForm(); if (!f || f.route.length < 2) return;
    const id = `MP-${1019 + this.plans().length - 18}`;
    this.plans.update((l) => [{ id, visitor: f.visitor, route: f.route, escort: f.escort, start: f.start, status: 'Scheduled' }, ...l]);
    this.store.log({ text: `Movement plan ${id} created for ${f.visitor} (${f.route.join(' → ')})`, kind: 'system' });
    this.planForm.set(null);
    this.planPreview.set(f.route);
    this.toast(`Movement plan ${id} created for ${f.visitor}`);
  }
  protected cancelPlan(p: LePlan) { this.plans.update((l) => l.map((x) => (x.id === p.id ? { ...x, status: 'Cancelled' } : x))); this.toast(`Plan ${p.id} cancelled`); }

  private patchV(id: string, c: Partial<LeVisitor>) { this.visitors.update((l) => l.map((v) => (v.id === id ? { ...v, ...c } : v))); }

  // ----- export
  protected exportMoves(l: LeMove[]) {
    downloadCsv('visitor-movements.csv', [['Visitor', 'From', 'To', 'Time', 'Escort', 'Duration', 'Status'], ...l.map((m) => [m.visitor, m.from, m.to, hm(m.at), m.escort, m.dur, m.status])]);
    this.toast(`Exported ${l.length} movement(s)`);
  }
  protected exportPlans() {
    downloadCsv('movement-plans.csv', [['Plan', 'Visitor', 'Route', 'Escort', 'Start', 'Status'], ...this.plans().map((p) => [p.id, p.visitor, p.route.join(' > '), p.escort, hm(p.start), p.status])]);
    this.toast(`Exported ${this.plans().length} plans`);
  }
  protected exportAll() {
    downloadCsv('visitor-location-escort.csv', [
      ['Section', 'Visitor', 'Escort / Zone', 'Location / Severity', 'Status', 'Time'],
      ...this.visitors().map((v) => ['Escort assignment', v.name, v.escort || '—', v.ended ? 'Checked out' : v.locLabel, v.status, fmtDur(v.onSite)]),
      ...this.alerts().map((a) => ['Zone alert', a.visitor, a.zone, a.severity, a.resolved ? 'Resolved' : 'Open', hm(a.at)]),
      ...this.moves().map((m) => ['Movement', m.visitor, `${m.from} > ${m.to}`, m.escort, m.status, hm(m.at)]),
    ]);
    this.toast('Location & escort report exported');
  }
  protected toast(m: string) { this.msg.set(m); clearTimeout(this.toastT); this.toastT = setTimeout(() => this.msg.set(null), 2600); }
}
