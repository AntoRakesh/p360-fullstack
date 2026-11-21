import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { BOOKING_ICON, bookingTag, WKpi } from './workplace-ui';
import {
  AMENITIES, Booking, Desk, DESK_TYPES, DeskStatus, fmtD, FLOORS, INSIGHTS, ROOMS, Room, STATUS_COLOR, STATUS_LABEL, TODAY, TOP_ZONES, USAGE_7D, USAGE_PREV,
  WorkplaceStore, WP_SITES, ZONES, zoneColor,
} from './workplace.data';

const TABS = ['Desk', 'Meeting Room', 'Focus Room', 'Collaboration Area'] as const;
type Tab = (typeof TABS)[number];
const TIMES = ['09:00 AM - 06:00 PM', '09:00 AM - 01:00 PM', '01:00 PM - 06:00 PM', '08:00 AM - 05:00 PM', '10:00 AM - 12:00 PM', '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM'];
const STATUSES: DeskStatus[] = ['available', 'occupied', 'reserved', 'maintenance'];
const TYPE_ICON: Record<string, string> = { 'Standard Desk': 'w-desk', 'Hot Desk': 'w-hot-desk', 'Focus Desk': 'w-focus', 'Collaboration Area': 'w-collab' };
const PLANTS: [number, number][] = [[196, 26], [350, 26], [372, 24], [186, 132], [352, 136], [312, 222], [292, 222], [190, 230], [580, 172], [440, 236]];

@Component({
  selector: 'app-desk-workspace-booking',
  imports: [...UI, WKpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Desk & Workspace Booking" parent="Workplace &amp; Facility Services" parentLink="/workplace-facility-services/desk-workspace-booking"
      subtitle="Find and book desks, flexible workspaces and collaboration areas across your organization.">
      <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="18" />New Booking</button>
      <button class="btn-ghost hb" (click)="drawer.set(true)"><app-icon name="w-calendar" [size]="18" />My Bookings</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb" [class.on]="activeFilters() > 0" (click)="$event.stopPropagation(); menu.set(menu() === 'filters' ? null : 'filters')"><app-icon name="filter" [size]="17" />Filters @if (activeFilters()) {<em class="fc">{{ activeFilters() }}</em>}</button>
        @if (menu() === 'filters') {
          <div class="dropdown fpanel" (click)="$event.stopPropagation()">
            <h4>Desk status</h4>
            @for (s of statuses; track s) {<label class="ck"><input type="checkbox" [checked]="statusOn().has(s)" (change)="toggleStatus(s)" /><i [style.background]="color[s]"></i>{{ label[s] }}</label>}
            <h4>Amenities</h4>
            @for (a of amenities; track a) {<label class="ck"><input type="checkbox" [checked]="amenOn().has(a)" (change)="toggleAmen(a)" />{{ a }}</label>}
            <div class="fp-foot"><button class="link" (click)="clearFilters()">Reset</button><button class="btn-primary btn-sm" (click)="menu.set(null)">Apply</button></div>
          </div>
        }
      </div>
      <div class="menu-wrap">
        <button class="btn-ghost hb sq" aria-label="More" (click)="$event.stopPropagation(); menu.set(menu() === 'more' ? null : 'more')"><app-icon name="more" [size]="18" /></button>
        @if (menu() === 'more') {
          <div class="dropdown">
            <button class="dd-item" (click)="exportMine()"><app-icon name="download" [size]="15" />Export my bookings</button>
            <button class="dd-item" (click)="exportDesks()"><app-icon name="download" [size]="15" />Export desk inventory</button>
            <button class="dd-item" (click)="go('space-utilization')"><app-icon name="chart-line" [size]="15" />Space utilization</button>
            <button class="dd-item" (click)="print()"><app-icon name="file-text" [size]="15" />Print floor map</button>
            <button class="dd-item danger" (click)="resetDemo()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpis">
      <app-wkpi label="Total Desks" [value]="counts().total" icon="w-desk" color="var(--ka-2563eb)" sub="Across 3 sites" [clickable]="true" (click)="clearFilters()" />
      <app-wkpi label="Available Now" [value]="counts().available" icon="w-check-circle" color="var(--ka-16c26b)" [strong]="pct(counts().available)" sub="availability" [clickable]="true" (click)="onlyStatus('available')" />
      <app-wkpi label="Occupied" [value]="counts().occupied" icon="users" color="var(--ka-7c3aed)" [strong]="pct(counts().occupied)" strongColor="var(--ka-7c3aed)" [clickable]="true" (click)="onlyStatus('occupied')" />
      <app-wkpi label="My Bookings Today" [value]="store.myToday().length" icon="w-calendar" color="var(--ka-f5a524)" [sub]="todaySub()" [clickable]="true" (click)="drawer.set(true)" />
      <app-wkpi label="Utilization Rate" value="76%" icon="w-bars" color="var(--ka-ef3b4f)" strong="8%" arrow="up" sub="vs. last week" [clickable]="true" (click)="go('space-utilization')" />
    </section>

    <section class="layout">
      <div class="col">
        <div class="card map-card" #mapCard>
          <div class="mc-head">
            <h3>Interactive Floor Map</h3>
            <div class="mc-tools">
              <select class="select" [value]="site()" (change)="setSite($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select>
              <select class="select sm" [value]="floor()" (change)="setFloor($any($event.target).value)">@for (f of floors(); track f.name) {<option>{{ f.name }}</option>}</select>
              <select class="select sm" [value]="typeF()" (change)="typeF.set($any($event.target).value)"><option value="all">Desks</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select>
              <button class="ib" title="Full screen" (click)="fullscreen()"><app-icon name="maximize" [size]="17" /></button>
            </div>
          </div>
          <div class="mc-body">
            <nav class="floors">
              @for (f of floors(); track f.name) {
                <button [class.on]="f.name === floor()" [class.nod]="!f.desks" (click)="setFloor(f.name)">{{ f.name }}@if (matchFloors()[f.name]) {<em>{{ matchFloors()[f.name] }}</em>}</button>
              }
            </nav>
            <div class="mv" [class.grab]="zoom() > 1" (pointerdown)="pdown($event)" (pointermove)="pmove($event)" (pointerup)="pup()" (pointerleave)="pup()" (wheel)="wheel($event)">
              <div class="stage" [style.transform]="'translate(' + pan()[0] + 'px,' + pan()[1] + 'px) scale(' + zoom() + ')'">
                <svg viewBox="0 0 600 372" class="plan">
                  <defs>
                    <pattern id="wp-tile" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="var(--kl-e2e4ea)" stroke-width="0.5" /></pattern>
                    <pattern id="wp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" stroke="var(--kl-a1a1aa)" stroke-width="0.8" /></pattern>
                  </defs>
                  <rect x="4" y="4" width="592" height="364" fill="var(--ka-f1f2f5)" />
                  <rect x="4" y="4" width="592" height="364" fill="url(#wp-tile)" />
                  @if (floorHasDesks()) {
                    @for (z of visibleZones(); track z.key) {
                      <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.w" [attr.height]="z.h" [attr.fill]="heat() ? heatFill(z.key) : z.fill" [attr.stroke]="z.stroke" stroke-width="1" />
                    }
                    <!-- interior walls -->
                    <path d="M182 10V150M362 10V160M10 150H150M10 206H300V362M300 248H590M184 114H360" stroke="var(--kl-52525b)" stroke-width="2.2" fill="none" />
                    <!-- core: lifts, stairs, restrooms -->
                    <rect x="214" y="132" width="40" height="34" fill="var(--ka-ffffff)" stroke="var(--kl-52525b)" stroke-width="1.4" /><path d="M214 132l40 34M254 132l-40 34" stroke="var(--kl-71717a)" stroke-width="1" />
                    <rect x="258" y="132" width="40" height="34" fill="var(--ka-ffffff)" stroke="var(--kl-52525b)" stroke-width="1.4" /><path d="M258 132l40 34M298 132l-40 34" stroke="var(--kl-71717a)" stroke-width="1" />
                    <rect x="304" y="132" width="40" height="70" fill="url(#wp-hatch)" stroke="var(--kl-52525b)" stroke-width="1.4" />
                    <rect x="214" y="172" width="84" height="30" fill="var(--ka-fafafa)" stroke="var(--kl-52525b)" stroke-width="1.2" /><path d="M256 172v30" stroke="var(--kl-52525b)" stroke-width="1" />
                    <text x="235" y="191" class="core-t">WC</text><text x="277" y="191" class="core-t">WC</text>
                    <rect x="160" y="160" width="20" height="44" fill="var(--ka-ffffff)" stroke="var(--kl-52525b)" stroke-width="1.2" /><path d="M160 182h20" stroke="var(--kl-71717a)" />
                    <rect x="572" y="162" width="18" height="40" fill="var(--ka-ffffff)" stroke="var(--kl-52525b)" stroke-width="1.2" />
                    @if (zoneLabels()) {
                      @for (z of visibleZones(); track z.key) {
                        <g [attr.transform]="'translate(' + (z.x + z.w / 2) + ',' + (z.y + 18) + ')'" class="zl" (click)="zoneClick(z.key)">
                          <rect [attr.x]="-z.name.length * 3.1 - 9" y="-9" [attr.width]="z.name.length * 6.2 + 18" height="17" rx="4" fill="var(--ka-ffffff)" stroke="var(--kl-d4d4d8)" stroke-width="0.6" />
                          <text y="3.5" text-anchor="middle">{{ z.name }}{{ heat() ? ' · ' + zoneUtil(z.key) + '%' : '' }}</text>
                        </g>
                      }
                    }
                    @for (p of plants; track $index) {
                      <g [attr.transform]="'translate(' + p[0] + ',' + p[1] + ')'"><circle r="7" fill="var(--ka-4ade80)" /><circle r="4.2" cx="-2" cy="-2" fill="var(--ka-16a34a)" opacity="0.6" /><circle r="2.4" cx="2.5" cy="2" fill="var(--ka-15803d)" opacity="0.7" /></g>
                    }
                    @for (d of floorDesks(); track d.id) {
                      <g class="desk" [attr.transform]="'translate(' + d.x + ',' + d.y + ')'" [attr.opacity]="dim(d) ? 0.22 : 1" (click)="pick(d, $event)">
                        @switch (d.shape) {
                          @case ('cubicle') {
                            <rect x="-26" y="-24" width="52" height="48" fill="var(--ka-ffffff)" stroke="var(--kl-71717a)" stroke-width="1.2" />
                            <path d="M-26 -10H8V24" fill="none" stroke="var(--kl-a1a1aa)" stroke-width="1" />
                          }
                          @case ('table') {
                            <rect x="-9" y="-19" width="7" height="5" rx="1.5" fill="var(--ka-d4d4d8)" /><rect x="3" y="-19" width="7" height="5" rx="1.5" fill="var(--ka-d4d4d8)" />
                            <rect x="-9" y="14" width="7" height="5" rx="1.5" fill="var(--ka-d4d4d8)" /><rect x="3" y="14" width="7" height="5" rx="1.5" fill="var(--ka-d4d4d8)" />
                            <rect x="-17" y="-13" width="34" height="26" rx="2" fill="var(--ka-ffffff)" stroke="var(--kl-71717a)" stroke-width="1.2" />
                          }
                          @case ('round') {
                            @for (a of [0, 60, 120, 180, 240, 300]; track a) {<rect x="-3.5" y="-25" width="7" height="6" rx="1.5" fill="var(--ka-a1a1aa)" [attr.transform]="'rotate(' + a + ')'" />}
                            <circle r="17" fill="var(--ka-8b8b93)" stroke="var(--kl-52525b)" stroke-width="1" />
                          }
                          @default {
                            <rect x="-15" y="-15" width="30" height="30" rx="2" fill="var(--ka-ffffff)" stroke="var(--kl-71717a)" stroke-width="1.1" />
                            <rect x="-9" y="-14" width="18" height="3" rx="1" fill="var(--ka-a1a1aa)" />
                          }
                        }
                        @if (hl().has(d.id)) {<circle r="17" class="pulse" />}
                        @if (sel()?.id === d.id) {<rect x="-13" y="-13" width="26" height="26" rx="6" fill="none" stroke="var(--kl-7c3aed)" stroke-width="2.4" />}
                        @if (d.shape === 'round') {
                          <circle r="9" [attr.fill]="color[d.status]" stroke="var(--kl-ffffff)" stroke-width="1.4" />
                        } @else {
                          <rect x="-10" y="-10" width="20" height="20" rx="4" [attr.fill]="color[d.status]" />
                          <circle cy="-3.2" r="3" fill="var(--ka-ffffff)" /><path d="M-5.5 6.5a5.5 4.6 0 0 1 11 0z" fill="var(--ka-ffffff)" />
                          @if (d.status === 'maintenance') {<path d="M3 -8l5 0" stroke="var(--kl-ffffff)" stroke-width="1.6" />}
                        }
                        @if (d.mine) {<g transform="translate(10,-10)"><circle r="5.5" fill="var(--ka-7c3aed)" stroke="var(--kl-ffffff)" stroke-width="1.2" /><path d="M-2.4 0l1.6 1.6 3-3" stroke="var(--kl-ffffff)" stroke-width="1.3" fill="none" /></g>}
                        @if (ids()) {<text y="21" text-anchor="middle" class="did">{{ d.name.replace('Desk ', '').replace('Collab Table ', '') }}</text>}
                        <title>{{ d.name }} · {{ label[d.status] }}</title>
                      </g>
                    }
                  } @else {
                    <g class="nod-plan">
                      <rect x="80" y="70" width="440" height="232" rx="8" fill="var(--ka-ffffff)" stroke="var(--kl-a1a1aa)" stroke-dasharray="6 5" />
                      <text x="300" y="176" text-anchor="middle" class="nd1">{{ floor() === 'Roof' ? 'Roof Terrace & Plant Room' : 'Reception, Lobby & Café' }}</text>
                      <text x="300" y="198" text-anchor="middle" class="nd2">No bookable desks on this floor · choose Floor 1–8</text>
                    </g>
                  }
                  <rect x="4" y="4" width="592" height="364" fill="none" stroke="var(--kl-3f3f46)" stroke-width="5" />
                </svg>

                @if (sel(); as d) {
                  <div class="pop" [style.left.%]="popPos().l" [style.top.%]="popPos().t" [style.transform]="'scale(' + 1 / zoom() + ')'" (pointerdown)="$event.stopPropagation()">
                    <button class="pop-x" aria-label="Close" (click)="selId.set(null)"><app-icon name="w-x" [size]="12" [stroke]="2.4" /></button>
                    <div class="pop-h">
                      <span class="pop-ic" [style.background]="color[d.status]"><app-icon [name]="typeIcon[d.type]" [size]="18" /></span>
                      <div><b>{{ d.name }}</b><span class="pst" [style.color]="d.status === 'reserved' ? 'var(--ka-6b7280)' : color[d.status]"><i [style.background]="color[d.status]"></i>{{ d.mine ? 'Booked by you' : label[d.status] }}</span></div>
                    </div>
                    <p>{{ d.floor }} - {{ zoneName(d.zone) }}<br />{{ d.type }}<br />With {{ amenText(d) }}</p>
                    @switch (d.status) {
                      @case ('available') {<button class="btn-primary pop-b" (click)="bookSelected()">Book Now</button>}
                      @case ('occupied') {<small class="pnote">{{ d.occupant }} · until {{ d.until }}</small><button class="btn-ghost pop-b" (click)="toastMsg('You will be notified when ' + d.name + ' is free')">Notify me when free</button>}
                      @case ('reserved') {
                        @if (d.mine) {<div class="pbtns"><button class="btn-primary pop-b" (click)="checkInDesk(d)">Check In</button><button class="btn-ghost pop-b danger" (click)="cancelDesk(d)">Cancel</button></div>}
                        @else {<small class="pnote">Reserved by {{ d.occupant }}</small><button class="btn-ghost pop-b" (click)="toastMsg('Added to waitlist for ' + d.name)">Join Waitlist</button>}
                      }
                      @case ('maintenance') {<small class="pnote">Monitor arm replacement in progress</small><button class="btn-ghost pop-b" (click)="go('maintenance-requests')">View Work Order</button>}
                    }
                  </div>
                }
              </div>
              @if (zoom() !== 1) {<span class="zchip">{{ (zoom() * 100).toFixed(0) }}%</span>}
            </div>
            <div class="tools">
              <button class="ib" title="Zoom in" (click)="zoomBy(1.25)"><app-icon name="plus" [size]="20" /></button>
              <button class="ib" title="Zoom out" (click)="zoomBy(0.8)"><app-icon name="minus" [size]="20" /></button>
              <button class="ib mt" title="Locate my desk" (click)="locate()"><app-icon name="locate" [size]="19" /></button>
              <div class="menu-wrap">
                <button class="ib" title="Layers" [class.on]="menu() === 'layers'" (click)="$event.stopPropagation(); menu.set(menu() === 'layers' ? null : 'layers')"><app-icon name="layers" [size]="19" /></button>
                @if (menu() === 'layers') {
                  <div class="dropdown layers" (click)="$event.stopPropagation()">
                    <label class="ck"><input type="checkbox" [checked]="zoneLabels()" (change)="zoneLabels.set(!zoneLabels())" />Zone labels</label>
                    <label class="ck"><input type="checkbox" [checked]="heat()" (change)="heat.set(!heat())" />Utilization heat</label>
                    <label class="ck"><input type="checkbox" [checked]="ids()" (change)="ids.set(!ids())" />Desk IDs</label>
                  </div>
                }
              </div>
              <button class="ib" title="Fit to screen" (click)="fit()"><app-icon name="maximize" [size]="17" /></button>
            </div>
          </div>
          <div class="legend">
            @for (s of statuses; track s) {
              <button [class.off]="!statusOn().has(s)" (click)="toggleStatus(s)"><span class="lg-c" [style.background]="color[s]"><app-icon name="user" [size]="10" [stroke]="2.6" /></span>{{ label[s] }}</button>
            }
            <span class="sep"></span>
            @for (t of types; track t) {
              <button [class.on2]="typeF() === t" (click)="typeF.set(typeF() === t ? 'all' : t)"><app-icon [name]="typeIcon[t]" [size]="17" />{{ t }}</button>
            }
          </div>
        </div>

        <div class="row2">
          <div class="card">
            <div class="ch"><h3>Workspace Usage</h3><select class="select sm" [value]="usageRange()" (change)="usageRange.set($any($event.target).value)"><option>Last 7 Days</option><option>Previous 7 Days</option></select></div>
            <div class="ulg"><span><i style="background:var(--kb-7c3aed)"></i>Occupancy Rate</span><span><i style="background:var(--kb-3b82f6)"></i>Available Desks</span></div>
            <svg viewBox="0 0 340 150" class="bars" (mouseleave)="uh.set(null)">
              @for (t of [0, 25, 50, 75, 100]; track t) {
                <line x1="34" x2="336" [attr.y1]="128 - t * 1.16" [attr.y2]="128 - t * 1.16" class="gl" />
                <text x="26" [attr.y]="131 - t * 1.16" text-anchor="end" class="ax">{{ t }}%</text>
              }
              @for (l of usage().labels; track l; let i = $index) {
                <rect [attr.x]="34 + i * 43" y="6" width="43" height="122" [attr.fill]="uh() === i ? 'var(--ka-f5f3ff)' : 'transparent'" (mouseenter)="uh.set(i)" />
                <rect [attr.x]="44 + i * 43" [attr.y]="128 - usage().occ[i] * 1.16" width="11" [attr.height]="usage().occ[i] * 1.16" fill="var(--ka-7c3aed)" rx="1" pointer-events="none" />
                <rect [attr.x]="56 + i * 43" [attr.y]="128 - usage().avail[i] * 1.16" width="11" [attr.height]="usage().avail[i] * 1.16" fill="var(--ka-3b82f6)" rx="1" pointer-events="none" />
                <text [attr.x]="55.5 + i * 43" y="145" text-anchor="middle" class="ax">{{ l }}</text>
              }
            </svg>
            @if (uh() !== null) {<div class="utip"><b>{{ usage().labels[uh()!] }}</b> Occupancy {{ usage().occ[uh()!] }}% · Available {{ usage().avail[uh()!] }}%</div>}
          </div>
          <div class="card">
            <div class="ch"><h3>Booking Insights</h3><select class="select sm" [value]="insRange()" (change)="insRange.set($any($event.target).value)"><option>This Month</option><option>Last Month</option><option>This Quarter</option></select></div>
            <div class="ins">
              <div class="dn">
                <svg viewBox="0 0 120 120">
                  @for (s of donut(); track s.label) {
                    <circle cx="60" cy="60" r="48" fill="none" [attr.stroke]="s.color" [attr.stroke-width]="dh() === s.label ? 20 : 16" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 60 60)" (mouseenter)="dh.set(s.label)" (mouseleave)="dh.set(null)" />
                  }
                </svg>
                <div class="dn-mid">@if (dhSeg(); as h) {<b>{{ h.value }}</b><span>{{ h.label }}</span>} @else {<b>{{ insRange() === 'This Month' ? '76%' : insRange() === 'Last Month' ? '70%' : '73%' }}</b><span>Utilization Rate</span>}</div>
              </div>
              <ul class="dl">
                @for (s of donut(); track s.label) {
                  <li [class.dim]="dh() && dh() !== s.label" (mouseenter)="dh.set(s.label)" (mouseleave)="dh.set(null)"><i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ s.value }}</b><em>({{ s.pct }}%)</em></li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="card book">
          <h3>Book a Workspace</h3>
          <div class="btabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="setTab(t)">{{ t }}</button>}</div>
          <div class="bf">
            <label>Site <i>*</i><select class="select" [value]="fSite()" (change)="fSite.set($any($event.target).value); fFloor.set('any')">@for (s of sites; track s) {<option>{{ s }}</option>}</select></label>
            <label>Date <i>*</i>
              <span class="datef" (click)="openPicker(dp)">{{ fmtD(fDate()) }}<app-icon name="w-calendar" [size]="16" /><input #dp type="date" [value]="fDate()" min="2026-10-14" (change)="$any($event.target).value && fDate.set($any($event.target).value)" /></span>
            </label>
            <label>Time <i>*</i><select class="select" [value]="fTime()" (change)="fTime.set($any($event.target).value)">@for (t of times; track t) {<option>{{ t.replace(' - ', '  -  ') }}</option>}</select></label>
            @if (tab() === 'Desk') {
              <label>Workspace Type<select class="select" [value]="fType()" (change)="fType.set($any($event.target).value)"><option value="any">Any Type</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
            } @else {
              <label>Capacity<select class="select" [value]="fCap()" (change)="fCap.set(+$any($event.target).value)"><option value="1">Any Size</option><option value="2">2+ people</option><option value="4">4+ people</option><option value="8">8+ people</option><option value="12">12+ people</option></select></label>
            }
            <label>Floor / Zone<select class="select" [value]="fFloor()" (change)="fFloor.set($any($event.target).value)">
              <option value="any">Any Floor</option>
              <optgroup label="Floors">@for (f of formFloors(); track f) {<option [value]="'F:' + f">{{ f }}</option>}</optgroup>
              @if (tab() === 'Desk') {<optgroup label="Zones">@for (z of zones; track z.key) {<option [value]="'Z:' + z.key">{{ z.name }}</option>}</optgroup>}
            </select></label>
            <label>Amenities<select class="select" [value]="fAmen()" (change)="fAmen.set($any($event.target).value)"><option value="any">Any Amenities</option>@for (a of tab() === 'Desk' ? amenities : roomEquip; track a) {<option [value]="a">{{ a }}</option>}</select></label>
          </div>
          <div class="bbtns"><button class="btn-primary find" (click)="find()">Find Available {{ tab() === 'Desk' ? 'Desks' : tab() === 'Collaboration Area' ? 'Areas' : 'Rooms' }}</button><button class="btn-ghost clr" (click)="clearForm()">Clear</button></div>
          @if (deskResult(); as r) {
            <div class="res">
              <div class="res-h"><b>{{ r.total }}</b> desks available on {{ fmtD(fDate()) }}@if (r.total) { · <b>{{ r.here }}</b> highlighted on {{ floor() }}}</div>
              <div class="res-chips">@for (d of r.list; track d.id) {<button (click)="pickById(d.id)"><i [style.background]="color.available"></i>{{ d.name.replace('Desk ', '').replace('Collab Table ', 'C ') }}</button>}</div>
            </div>
          }
          @if (roomResult(); as rr) {
            <div class="res">
              <div class="res-h"><b>{{ rr.length }}</b> {{ tab() === 'Desk' ? '' : tab().toLowerCase() }}{{ rr.length === 1 ? '' : 's' }} free · {{ fmtD(fDate()) }} · {{ fTime() }}</div>
              @for (r of rr; track r.id) {
                <div class="rrow"><span class="ric" [style.background]="r.color"><app-icon [name]="r.kind === 'Focus Room' ? 'w-focus' : r.kind === 'Collaboration Area' ? 'w-collab' : 'users'" [size]="15" /></span>
                  <div><b>{{ r.name }}</b><small>{{ r.floor }} · {{ r.capacity }} seats · {{ r.equipment.join(', ') }}</small></div>
                  <button class="btn-primary btn-sm" (click)="bookRoom(r)">{{ r.approval ? 'Request' : 'Book' }}</button></div>
              } @empty {<p class="muted sm">No free rooms for this slot. Try another time.</p>}
            </div>
          }
        </div>

        <div class="card up">
          <div class="ch"><h3>My Upcoming Bookings</h3><button class="link va" (click)="drawer.set(true)">View All</button></div>
          @for (b of store.myUpcoming().slice(0, 3); track b.id) {
            <div class="ub">
              <span class="ub-ic" [style.background]="bIcon(b).color"><app-icon [name]="bIcon(b).icon" [size]="20" /></span>
              <div class="ub-n"><b>{{ b.resource }}</b><small>{{ shortLoc(b) }}</small></div>
              <div class="ub-t"><span><app-icon name="w-calendar" [size]="12" />{{ fmtD(b.date) }}</span><span><app-icon name="clock" [size]="12" />{{ b.from }} - {{ b.to }}</span></div>
              <span class="ub-s" [class]="'ub-s ' + bookingTag(b.status)">{{ b.status }}</span>
              <div class="menu-wrap">
                <button class="dots" (click)="$event.stopPropagation(); menu.set(menu() === b.id ? null : b.id)">⋯</button>
                @if (menu() === b.id) {
                  <div class="dropdown">
                    @if (b.date === today && b.status === 'Confirmed') {<button class="dd-item" (click)="checkIn(b)"><app-icon name="w-qr" [size]="15" />Check in</button>}
                    @if (b.kind === 'Desk' || b.kind === 'Collaboration Area') {<button class="dd-item" (click)="showOnMap(b)"><app-icon name="map-pin" [size]="15" />Show on map</button>}
                    <button class="dd-item" (click)="openEdit(b)"><app-icon name="w-pencil" [size]="15" />Edit booking</button>
                    <button class="dd-item" (click)="toastMsg('Calendar invite sent for ' + b.resource); menu.set(null)"><app-icon name="w-calendar" [size]="15" />Add to calendar</button>
                    <button class="dd-item danger" (click)="cancel(b)"><app-icon name="w-trash" [size]="15" />Cancel booking</button>
                  </div>
                }
              </div>
            </div>
          } @empty {<p class="muted sm">No upcoming bookings. Use Book a Workspace to reserve one.</p>}
        </div>

        <div class="card tz">
          <div class="ch"><h3>Top Zones by Utilization</h3><button class="link va" (click)="go('space-utilization')">View All</button></div>
          @for (z of topZones; track z.label) {
            <button class="tzr" (click)="zoneFromTop(z.label)"><span>{{ z.label }}</span><div class="tzt"><i [style.width.%]="z.value" [style.background]="zc(z.value)"></i></div><b>{{ z.value }}%</b></button>
          }
        </div>
      </div>
    </section>

    @if (drawer()) {
      <div class="g-overlay" (click)="drawer.set(false)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><h3>My Bookings</h3><button class="close-btn" (click)="drawer.set(false)">×</button></div>
        <nav class="dtabs">@for (t of ['Upcoming', 'Past', 'Cancelled']; track t) {<button [class.on]="dTab() === t" (click)="dTab.set(t)">{{ t }} <em>{{ drawerCount(t) }}</em></button>}</nav>
        @for (b of drawerList(); track b.id) {
          <div class="ub big">
            <span class="ub-ic" [style.background]="bIcon(b).color"><app-icon [name]="bIcon(b).icon" [size]="20" /></span>
            <div class="ub-n"><b>{{ b.resource }}</b><small>{{ b.location }}{{ b.title ? ' · ' + b.title : '' }}</small></div>
            <div class="ub-t"><span><app-icon name="w-calendar" [size]="12" />{{ fmtD(b.date) }}</span><span><app-icon name="clock" [size]="12" />{{ b.from }} - {{ b.to }}</span></div>
            <span [class]="bookingTag(b.status)">{{ b.status }}</span>
            @if (dTab() === 'Upcoming') {<div class="dact"><button class="btn-ghost sm" (click)="openEdit(b)">Edit</button><button class="btn-ghost sm danger" (click)="cancel(b)">Cancel</button></div>}
          </div>
        } @empty {<p class="muted">Nothing here.</p>}
      </aside>
    }

    @if (edit(); as e) {
      <div class="g-overlay" (click)="edit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEdit()">
        <div class="modal-head"><h3>Edit {{ e.resource }}</h3><button type="button" class="close-btn" (click)="edit.set(null)">×</button></div>
        <div class="form-grid">
          <label>Date<input class="input" type="date" [value]="e.date" min="2026-10-14" (change)="edit.set({ ...e, date: $any($event.target).value })" /></label>
          <label>Time<select class="select" [value]="e.from + ' - ' + e.to" (change)="setEditTime($any($event.target).value)">@for (t of times; track t) {<option>{{ t }}</option>}</select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="edit.set(null)">Cancel</button><button class="btn-primary">Save changes</button></div>
      </form>
    }

    @if (nb(); as n) {
      <div class="g-overlay" (click)="nb.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveNew()">
        <div class="modal-head"><h3>New Booking</h3><button type="button" class="close-btn" (click)="nb.set(null)">×</button></div>
        <div class="btabs">@for (t of tabs; track t) {<button type="button" [class.on]="n.tab === t" (click)="nb.set({ ...n, tab: t, res: '' })">{{ t }}</button>}</div>
        <div class="form-grid">
          <label>Site<select class="select" [value]="n.site" (change)="nb.set({ ...n, site: $any($event.target).value, res: '' })">@for (s of sites; track s) {<option>{{ s }}</option>}</select></label>
          <label>Date<input class="input" type="date" [value]="n.date" min="2026-10-14" (change)="nb.set({ ...n, date: $any($event.target).value, res: '' })" /></label>
          <label>Time<select class="select" [value]="n.time" (change)="nb.set({ ...n, time: $any($event.target).value, res: '' })">@for (t of times; track t) {<option>{{ t }}</option>}</select></label>
          <label>{{ n.tab === 'Desk' ? 'Desk' : 'Room' }} *<select class="select" [value]="n.res" (change)="nb.set({ ...n, res: $any($event.target).value })">
            <option value="">Select…</option>
            @for (o of nbOptions(); track o.id) {<option [value]="o.id">{{ o.label }}</option>}
          </select></label>
          @if (n.tab !== 'Desk') {<label class="full">Meeting title<input class="input" [value]="n.title" (input)="nb.set({ ...n, title: $any($event.target).value })" placeholder="e.g. Sprint planning" /></label>}
        </div>
        <p class="muted sm">{{ nbOptions().length }} {{ n.tab === 'Desk' ? 'desks' : 'spaces' }} available for this slot.</p>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="nb.set(null)">Cancel</button><button class="btn-primary">Confirm Booking</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .hb { padding: 10px 18px; font-size: 13px; font-weight: 500; border-radius: 6px; } .btn-primary.hb { padding: 10px 26px; }
    .hb.sq { padding: 10px 12px; } .hb.on { border-color: var(--kl-c4b5fd); color: var(--primary); }
    .fc { font-style: normal; background: var(--primary); color: var(--kf-ffffff); border-radius: 10px; font-size: 10.5px; padding: 0 6px; }
    .fpanel { width: 230px; padding: 10px 12px; } .fpanel h4 { margin: 6px 0 4px; font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
    .ck { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 4px 2px; cursor: pointer; } .ck i { width: 10px; height: 10px; border-radius: 50%; }
    .fp-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.68fr) minmax(360px, 1fr); gap: 12px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.2px; }
    .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
    .select.sm { padding: 6px 30px 6px 10px; font-size: 12px; }
    .va { font-size: 13px; }
    /* map */
    .map-card { padding: 0; overflow: visible; } .map-card:fullscreen { overflow: auto; padding: 16px; }
    .mc-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 10px 10px 10px; flex-wrap: wrap; }
    .mc-tools { display: flex; gap: 10px; align-items: center; } .mc-tools .select { min-width: 140px; padding: 7px 32px 7px 12px; } .mc-tools .select.sm { min-width: 100px; }
    .ib { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; cursor: pointer; color: var(--kf-27272a); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .ib:hover, .ib.on { background: var(--primary-soft); color: var(--primary); }
    .mc-body { display: grid; grid-template-columns: 84px minmax(0, 1fr) 44px; gap: 6px 10px; padding: 0 6px 0 4px; align-items: start; }
    .floors { display: flex; flex-direction: column; background: var(--kb-f7f7fa); border-radius: 6px; padding: 4px 0; }
    .floors button { position: relative; text-align: left; border: 0; background: none; padding: 9px 12px; font-size: 12px; color: var(--kf-3f3f46); cursor: pointer; border-radius: 4px; }
    .floors button:hover { background: var(--kb-efeff5); } .floors button.on { background: var(--kb-ede7fe); color: var(--primary); font-weight: 600; }
    .floors button.nod { color: var(--kf-52525b); }
    .floors em { position: absolute; right: 4px; top: 8px; font-style: normal; font-size: 9.5px; background: var(--primary); color: var(--kf-ffffff); border-radius: 8px; padding: 0 5px; }
    .mv { position: relative; overflow: hidden; border-radius: 4px; user-select: none; touch-action: none; }
    .mv.grab { cursor: grab; }
    .stage { position: relative; transform-origin: 0 0; transition: transform .15s ease; }
    .plan { display: block; width: 100%; height: auto; }
    .zl { cursor: pointer; } .zl text { font-size: 9.5px; font-weight: 600; fill: var(--ka-18181b); }
    .core-t { font-size: 7px; fill: var(--ka-71717a); text-anchor: middle; }
    .desk { cursor: pointer; transition: opacity .15s; } .desk:hover > rect:last-of-type { filter: brightness(1.08); }
    .did { font-size: 6.5px; fill: var(--ka-3f3f46); font-weight: 600; }
    .pulse { fill: none; stroke: var(--kl-7c3aed); stroke-width: 2.4; animation: wp-pulse 1.3s ease-in-out infinite; }
    @keyframes wp-pulse { 50% { stroke-opacity: .25; stroke-width: 5; } }
    .nd1 { font-size: 15px; font-weight: 700; fill: var(--ka-27272a); } .nd2 { font-size: 11px; fill: var(--ka-71717a); }
    .zchip { position: absolute; left: 8px; bottom: 8px; background: rgba(24,24,27,.75); color: var(--kf-ffffff); font-size: 11px; padding: 2px 7px; border-radius: 10px; }
    .pop { position: absolute; width: 196px; background: var(--kb-ffffff); border-radius: 8px; box-shadow: 0 10px 28px rgba(20,20,60,.22); padding: 10px 12px 12px; transform-origin: 0 0; z-index: 3; }
    .pop-x { position: absolute; right: 6px; top: 6px; border: 0; background: none; color: var(--kf-a1a1aa); cursor: pointer; padding: 2px; }
    .pop-h { display: flex; gap: 10px; align-items: center; } .pop-h div { display: flex; flex-direction: column; } .pop-h b { font-size: 12.5px; }
    .pop-ic { width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .pst { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; } .pst i { width: 9px; height: 9px; border-radius: 50%; }
    .pop p { margin: 9px 0 8px; font-size: 11px; line-height: 1.45; color: var(--kf-52525b); }
    .pop-b { width: 100%; justify-content: center; padding: 7px; border-radius: 5px; font-weight: 500; } .pbtns { display: flex; gap: 6px; }
    .pnote { display: block; font-size: 11px; color: var(--muted); margin-bottom: 6px; }
    .danger { color: var(--red); }
    .tools { display: flex; flex-direction: column; gap: 10px; padding-top: 0; } .tools .ib { width: 40px; height: 40px; } .tools .mt { margin-top: 8px; }
    .layers { right: 46px; top: 0; min-width: 170px; padding: 8px 10px; }
    .legend { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 2px; padding: 12px 8px 12px; margin-top: 8px; border-top: 1px solid var(--kl-f0f0f5); }
    .legend button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; font-size: 11px; color: var(--kf-27272a); cursor: pointer; padding: 3px 5px; white-space: nowrap; border-radius: 6px; }
    .legend button:hover { background: var(--kb-f5f3ff); } .legend button.off { opacity: .35; } .legend button.on2 { background: var(--primary-soft); color: var(--primary); }
    .lg-c { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); }
    .sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
    .row2 { display: grid; grid-template-columns: 1fr 1.04fr; gap: 12px; } .row2 .card { position: relative; }
    .ulg { display: flex; justify-content: flex-end; gap: 18px; font-size: 11.5px; margin: -2px 6px 4px; } .ulg span { display: inline-flex; align-items: center; gap: 6px; } .ulg i { width: 11px; height: 11px; border-radius: 50%; }
    .bars { width: 100%; display: block; } .gl { stroke: var(--kl-eceef3); stroke-width: .8; } .ax { font-size: 8.5px; fill: var(--ka-52525b); }
    .utip { position: absolute; right: 14px; top: 46px; font-size: 11px; background: var(--kb-1e1b3a); color: var(--kf-ffffff); padding: 4px 8px; border-radius: 6px; }
    .ins { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 12px; padding: 4px 0 2px; }
    .dn { position: relative; width: 150px; } .dn svg { display: block; width: 150px; height: 150px; } .dn circle { transition: stroke-width .15s; cursor: pointer; }
    .dn-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; } .dn-mid b { font-size: 21px; } .dn-mid span { font-size: 11px; color: var(--kf-3f3f46); text-align: center; max-width: 80px; }
    .dl { list-style: none; margin: 0; padding: 0; } .dl li { display: grid; grid-template-columns: 12px 1fr auto 42px; gap: 8px; align-items: center; padding: 6px 0; font-size: 12px; cursor: default; }
    .dl li.dim { opacity: .4; } .dl i { width: 11px; height: 11px; border-radius: 50%; } .dl b { text-align: right; } .dl em { font-style: normal; color: var(--kf-52525b); text-align: right; }
    /* booking form */
    .book h3 { margin-bottom: 12px; }
    .btabs { display: grid; grid-template-columns: .55fr 1fr 1fr 1.25fr; gap: 6px; margin-bottom: 12px; }
    .btabs button { border: 0; background: var(--kb-f2f2f7); padding: 9px 6px; border-radius: 4px; font-size: 12px; color: var(--kf-27272a); cursor: pointer; white-space: nowrap; }
    .btabs button.on { background: var(--primary); color: var(--kf-ffffff); } .btabs button:not(.on):hover { background: var(--kb-ebe7fb); }
    .bf { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .bf label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--kf-3f3f46); } .bf label i { color: var(--red); font-style: normal; margin-left: 1px; display: inline; }
    .bf label { display: block; } .bf label > .select, .bf label > .datef { display: flex; width: 100%; margin-top: 6px; }
    .bf .select { padding: 9px 30px 9px 12px; font-size: 12px; }
    .datef { position: relative; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--border); border-radius: 7px; font-size: 12.5px; color: var(--text); cursor: pointer; background: var(--kb-ffffff); }
    .datef input { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
    .bbtns { display: grid; grid-template-columns: 1.7fr 1fr; gap: 12px; margin-top: 18px; } .find { justify-content: center; padding: 11px; font-weight: 500; border-radius: 5px; } .clr { justify-content: center; font-weight: 500; }
    .res { margin-top: 12px; padding: 10px; border-radius: 8px; background: var(--kb-faf8ff); border: 1px solid var(--kl-ece6fd); font-size: 12px; }
    .res-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; } .res-chips button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--kl-ddd6fe); background: var(--kb-ffffff); border-radius: 12px; padding: 3px 9px; font-size: 11px; cursor: pointer; } .res-chips i { width: 7px; height: 7px; border-radius: 50%; }
    .rrow { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid var(--kl-efeaff); } .rrow:first-of-type { margin-top: 6px; }
    .rrow div { display: flex; flex-direction: column; min-width: 0; } .rrow small { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ric { width: 30px; height: 30px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .sm { font-size: 12px; }
    /* upcoming */
    .up .ch { margin-bottom: 6px; }
    .ub { display: grid; grid-template-columns: 32px minmax(0, 1fr) 112px auto 22px; gap: 8px; align-items: center; padding: 8px 0; }
    .ub-ic { width: 32px; height: 32px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .ub-n { display: flex; flex-direction: column; min-width: 0; } .ub-n b { font-size: 12px; font-weight: 600; } .ub-n small { font-size: 9.5px; color: var(--kf-52525b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.2px; }
    .ub-t { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: var(--kf-3f3f46); } .ub-t span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; } .ub-t app-icon { color: var(--kf-6d28d9); }
    .ub-s { border-radius: 4px; padding: 4px 10px; font-size: 11px; }
    .ub .dropdown { min-width: 170px; }
    .ub.big { grid-template-columns: 34px minmax(0, 1fr) 130px auto auto; border-bottom: 1px solid var(--kl-f0f1f6); }
    .dact { display: flex; gap: 4px; }
    .dtabs { display: flex; gap: 18px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
    .dtabs button { border: 0; background: none; padding: 8px 0; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--kf-4b4f6b); } .dtabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .dtabs em { font-style: normal; font-size: 11px; background: var(--kb-eef0f5); border-radius: 8px; padding: 0 6px; margin-left: 3px; }
    /* top zones */
    .tz .ch { margin-bottom: 8px; }
    .tzr { display: grid; grid-template-columns: 170px 1fr 44px; gap: 10px; align-items: center; width: 100%; border: 0; background: none; padding: 4px 0; cursor: pointer; font-size: 12px; text-align: left; color: var(--text); }
    .tzr:hover span { color: var(--primary); } .tzr b { font-weight: 500; text-align: right; }
    .tzt { height: 12px; background: var(--kb-f1f1f6); border-radius: 2px; overflow: hidden; } .tzt i { display: block; height: 100%; border-radius: 2px; }
    @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 1250px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .row2, .bf { grid-template-columns: 1fr; } .kpis { grid-template-columns: 1fr 1fr; } .mc-body { grid-template-columns: 1fr; } .floors { flex-direction: row; overflow-x: auto; } .tools { flex-direction: row; } }
  `,
})
export class DeskBooking {
  protected readonly store = inject(WorkplaceStore);
  private readonly router = inject(Router);
  private readonly mapCard = viewChild<ElementRef<HTMLElement>>('mapCard');
  protected readonly fmtD = fmtD;
  protected readonly bookingTag = bookingTag;
  protected readonly today = TODAY;
  protected readonly tabs = TABS;
  protected readonly times = TIMES;
  protected readonly sites = WP_SITES;
  protected readonly types = DESK_TYPES;
  protected readonly zones = ZONES;
  protected readonly amenities = AMENITIES;
  protected readonly roomEquip = ['Display', 'Video Conf', 'Whiteboard', 'Projector', 'Catering', 'Recording'];
  protected readonly statuses = STATUSES;
  protected readonly color = STATUS_COLOR;
  protected readonly label = STATUS_LABEL;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly plants = PLANTS;
  protected readonly topZones = TOP_ZONES;
  protected readonly zc = zoneColor;

  protected readonly menu = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly drawer = signal(false);
  protected readonly dTab = signal('Upcoming');
  protected readonly err = signal('');

  // ----- map state -----
  protected readonly site = signal('Head Office');
  protected readonly floor = signal('Floor 5');
  protected readonly typeF = signal<string>('all');
  protected readonly statusOn = signal(new Set<DeskStatus>(STATUSES));
  protected readonly amenOn = signal(new Set<string>());
  protected readonly selId = signal<string | null>('H5-open-11');
  protected readonly hl = signal(new Set<string>());
  protected readonly zoom = signal(1);
  protected readonly pan = signal<[number, number]>([0, 0]);
  protected readonly zoneLabels = signal(true);
  protected readonly heat = signal(false);
  protected readonly ids = signal(false);
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  private suppressClick = false;

  protected readonly counts = this.store.deskCounts;
  protected readonly floors = computed(() => FLOORS[this.site()]);
  protected readonly floorHasDesks = computed(() => !!this.floors().find((f) => f.name === this.floor())?.desks);
  protected readonly floorDesks = computed(() => this.store.desks().filter((d) => d.site === this.site() && d.floor === this.floor()));
  protected readonly visibleZones = computed(() => {
    const keys = new Set(this.floorDesks().map((d) => d.zone));
    return ZONES.filter((z) => keys.has(z.key));
  });
  protected readonly sel = computed(() => this.store.desks().find((d) => d.id === this.selId() && d.site === this.site() && d.floor === this.floor()) ?? null);
  protected readonly popPos = computed(() => {
    const d = this.sel();
    if (!d) return { l: 0, t: 0 };
    const below = d.y < 200;
    const l = Math.min(Math.max(d.x - 70, 6), 394);
    const t = below ? d.y + 22 : Math.max(d.y - 168, 4);
    return { l: (l / 600) * 100, t: (t / 372) * 100 };
  });
  protected readonly activeFilters = computed(() => (STATUSES.length - this.statusOn().size) + this.amenOn().size);

  protected dim(d: Desk) {
    if (!this.statusOn().has(d.status)) return true;
    if (this.typeF() !== 'all' && d.type !== this.typeF()) return true;
    for (const a of this.amenOn()) if (!d.amenities.includes(a)) return true;
    return this.hl().size > 0 && !this.hl().has(d.id) && d.id !== this.selId();
  }
  protected pct(n: number) {
    return ((n / this.counts().total) * 100).toFixed(1) + '%';
  }
  protected readonly todaySub = computed(() => {
    const l = this.store.myToday();
    const d = l.filter((b) => b.kind === 'Desk' || b.kind === 'Collaboration Area').length;
    const r = l.filter((b) => b.kind === 'Meeting Room' || b.kind === 'Focus Room').length;
    const o = l.length - d - r;
    return `${d} desk${d === 1 ? '' : 's'} | ${r} meeting room${r === 1 ? '' : 's'}${o ? ` | ${o} other` : ''}`;
  });
  protected zoneName(z: string) {
    return ZONES.find((x) => x.key === z)?.name ?? z;
  }
  protected amenText(d: Desk) {
    return [...d.amenities].sort((a, b) => AMENITIES.indexOf(a) - AMENITIES.indexOf(b)).slice(0, 4).join(' | ');
  }
  protected zoneUtil(z: string) {
    const l = this.floorDesks().filter((d) => d.zone === z);
    return Math.round((l.filter((d) => d.status !== 'available').length / (l.length || 1)) * 100);
  }
  protected heatFill(z: string) {
    const v = this.zoneUtil(z);
    return v >= 75 ? 'var(--ka-fecaca)' : v >= 55 ? 'var(--ka-fed7aa)' : v >= 35 ? 'var(--ka-fef08a)' : 'var(--ka-bbf7d0)';
  }

  protected setSite(s: string) {
    this.site.set(s);
    const first = FLOORS[s].find((f) => f.desks)!;
    this.floor.set(s === 'Head Office' ? 'Floor 5' : first.name);
    this.selId.set(null);
    this.fit();
  }
  protected setFloor(f: string) {
    this.floor.set(f);
    this.selId.set(null);
  }
  protected pick(d: Desk, e: Event) {
    e.stopPropagation();
    if (this.suppressClick) return;
    this.selId.set(d.id);
  }
  protected pickById(id: string) {
    const d = this.store.desks().find((x) => x.id === id);
    if (!d) return;
    this.site.set(d.site);
    this.floor.set(d.floor);
    this.selId.set(id);
  }
  protected zoneClick(z: string) {
    const t = ZONES.find((x) => x.key === z)!.type;
    this.typeF.set(this.typeF() === t ? 'all' : t);
  }
  protected toggleStatus(s: DeskStatus) {
    const n = new Set(this.statusOn());
    n.has(s) ? n.delete(s) : n.add(s);
    this.statusOn.set(n);
  }
  protected onlyStatus(s: DeskStatus) {
    this.statusOn.set(new Set([s]));
    this.toastMsg(`Showing ${STATUS_LABEL[s].toLowerCase()} desks · click Total Desks to reset`);
  }
  protected toggleAmen(a: string) {
    const n = new Set(this.amenOn());
    n.has(a) ? n.delete(a) : n.add(a);
    this.amenOn.set(n);
  }
  protected clearFilters() {
    this.statusOn.set(new Set(STATUSES));
    this.amenOn.set(new Set());
    this.typeF.set('all');
    this.hl.set(new Set());
    this.menu.set(null);
  }

  // ----- zoom / pan -----
  protected zoomBy(f: number) {
    const z = Math.min(3, Math.max(1, +(this.zoom() * f).toFixed(2)));
    const el = this.mapCard()?.nativeElement.querySelector('.mv') as HTMLElement | null;
    const w = el?.clientWidth ?? 600;
    const h = el?.clientHeight ?? 372;
    const [px, py] = this.pan();
    const cx = (w / 2 - px) / this.zoom();
    const cy = (h / 2 - py) / this.zoom();
    this.zoom.set(z);
    this.pan.set(this.clampPan(w / 2 - cx * z, h / 2 - cy * z, z));
  }
  protected fit() {
    this.zoom.set(1);
    this.pan.set([0, 0]);
  }
  private clampPan(x: number, y: number, z = this.zoom()) {
    const el = this.mapCard()?.nativeElement.querySelector('.mv') as HTMLElement | null;
    const w = el?.clientWidth ?? 600;
    const h = el?.clientHeight ?? 372;
    return [Math.min(0, Math.max(w - w * z, x)), Math.min(0, Math.max(h - h * z, y))] as [number, number];
  }
  protected wheel(e: WheelEvent) {
    if (!e.ctrlKey && this.zoom() === 1 && e.deltaY > 0) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
  }
  protected pdown(e: PointerEvent) {
    this.suppressClick = false;
    if (this.zoom() <= 1) return;
    this.drag = { x: e.clientX, y: e.clientY, px: this.pan()[0], py: this.pan()[1], moved: false };
  }
  protected pmove(e: PointerEvent) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
    if (this.drag.moved) this.pan.set(this.clampPan(this.drag.px + dx, this.drag.py + dy));
  }
  protected pup() {
    if (this.drag?.moved) {
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 0);
    }
    this.drag = null;
  }
  protected locate() {
    const mine = this.store.desks().find((d) => d.mine);
    if (!mine) return this.toastMsg('You have no desk booked today');
    this.site.set(mine.site);
    this.floor.set(mine.floor);
    this.selId.set(mine.id);
    this.toastMsg(`Your desk today: ${mine.name} · ${mine.floor}`);
  }
  protected fullscreen() {
    const el = this.mapCard()?.nativeElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el?.requestFullscreen?.().catch(() => this.toastMsg('Full screen is not available'));
  }

  // ----- booking form -----
  protected readonly tab = signal<Tab>('Desk');
  protected readonly fSite = signal('Head Office');
  protected readonly fDate = signal(TODAY);
  protected readonly fTime = signal(TIMES[0]);
  protected readonly fType = signal('any');
  protected readonly fCap = signal(1);
  protected readonly fFloor = signal('any');
  protected readonly fAmen = signal('any');
  protected readonly deskResult = signal<{ total: number; here: number; list: Desk[] } | null>(null);
  protected readonly roomResult = signal<Room[] | null>(null);
  protected readonly formFloors = computed(() => FLOORS[this.fSite()].filter((f) => f.desks || this.tab() !== 'Desk').map((f) => f.name));
  protected readonly matchFloors = computed(() => {
    const out: Record<string, number> = {};
    for (const id of this.hl()) {
      const d = this.store.desks().find((x) => x.id === id);
      if (d && d.site === this.site()) out[d.floor] = (out[d.floor] ?? 0) + 1;
    }
    return out;
  });
  protected setTab(t: Tab) {
    this.tab.set(t);
    this.fTime.set(t === 'Desk' ? TIMES[0] : TIMES[6]);
    this.fFloor.set('any');
    this.fAmen.set('any');
    this.deskResult.set(null);
    this.roomResult.set(null);
    this.hl.set(new Set());
  }
  protected openPicker(i: HTMLInputElement) {
    try {
      i.showPicker();
    } catch {
      i.focus();
    }
  }
  private slot(t = this.fTime()) {
    const [from, to] = t.split(' - ').map((s) => s.trim());
    return { from, to };
  }
  private deskFree(d: Desk, date: string) {
    if (date === TODAY) return d.status === 'available';
    if (d.status === 'maintenance') return false;
    return !this.store.bookings().some((b) => b.resourceId === d.id && b.date === date && b.status !== 'Cancelled');
  }
  protected find() {
    const site = this.fSite();
    const fl = this.fFloor();
    if (this.tab() !== 'Desk') return this.findRooms();
    const list = this.store.desks().filter((d) => d.site === site && this.deskFree(d, this.fDate())
      && (this.fType() === 'any' || d.type === this.fType())
      && (fl === 'any' || (fl.startsWith('F:') ? d.floor === fl.slice(2) : d.zone === fl.slice(2)))
      && (this.fAmen() === 'any' || d.amenities.includes(this.fAmen())));
    this.hl.set(new Set(list.map((d) => d.id)));
    this.site.set(site);
    this.selId.set(null);
    this.statusOn.set(new Set(STATUSES));
    if (list.length) {
      const byFloor = list.reduce<Record<string, number>>((a, d) => ((a[d.floor] = (a[d.floor] ?? 0) + 1), a), {});
      const target = fl.startsWith('F:') ? fl.slice(2) : byFloor[this.floor()] && this.site() === site ? this.floor() : Object.entries(byFloor).sort((a, b) => b[1] - a[1])[0][0];
      this.floor.set(target);
    }
    const here = list.filter((d) => d.floor === this.floor());
    this.deskResult.set({ total: list.length, here: here.length, list: here.slice(0, 10) });
  }
  private findRooms() {
    const t = this.tab();
    const { from, to } = this.slot();
    const fl = this.fFloor();
    const list = ROOMS.filter((r) => r.site === this.fSite()
      && (t === 'Meeting Room' ? !['Focus Room', 'Collaboration Area'].includes(r.kind) : r.kind === t)
      && r.capacity >= this.fCap() && (fl === 'any' || r.floor === fl.slice(2))
      && (this.fAmen() === 'any' || r.equipment.includes(this.fAmen()))
      && this.store.roomFree(r, this.fDate(), from, to));
    this.roomResult.set(list);
  }
  protected clearForm() {
    this.fSite.set('Head Office');
    this.fDate.set(TODAY);
    this.fTime.set(TIMES[0]);
    this.fType.set('any');
    this.fCap.set(1);
    this.fFloor.set('any');
    this.fAmen.set('any');
    this.deskResult.set(null);
    this.roomResult.set(null);
    this.hl.set(new Set());
  }
  protected bookSelected() {
    const d = this.sel();
    if (!d) return;
    const { from, to } = this.slot();
    this.store.bookDesk(d, this.fDate(), from, to);
    this.hl.update((s) => {
      const n = new Set(s);
      n.delete(d.id);
      return n;
    });
    this.deskResult.update((r) => (r ? { total: r.total - 1, here: r.here - 1, list: r.list.filter((x) => x.id !== d.id) } : r));
    this.toastMsg(`${d.name} booked · ${fmtD(this.fDate())} · ${from} - ${to}`);
  }
  protected bookRoom(r: Room) {
    const { from, to } = this.slot();
    const b = this.store.bookRoom(r, this.fDate(), from, to, 'Meeting', Math.max(2, this.fCap()));
    this.roomResult.update((l) => l?.filter((x) => x.id !== r.id) ?? null);
    this.toastMsg(b.status === 'Pending' ? `${r.name} requested · awaiting approval` : `${r.name} booked · ${fmtD(b.date)} · ${from} - ${to}`);
  }
  protected checkInDesk(d: Desk) {
    const b = this.store.myToday().find((x) => x.resourceId === d.id);
    if (b) this.checkIn(b);
  }
  protected cancelDesk(d: Desk) {
    const b = this.store.myToday().find((x) => x.resourceId === d.id);
    if (b) this.cancel(b);
  }

  // ----- upcoming bookings -----
  protected bIcon(b: Booking) {
    return BOOKING_ICON[b.kind] ?? BOOKING_ICON['Desk'];
  }
  protected shortLoc(b: Booking) {
    return b.location;
  }
  protected checkIn(b: Booking) {
    this.menu.set(null);
    this.store.checkIn(b.id);
    if (b.kind === 'Desk') this.store.setDeskStatus(b.resourceId, 'occupied');
    this.toastMsg(`Checked in to ${b.resource}`);
  }
  protected cancel(b: Booking) {
    this.menu.set(null);
    this.store.cancel(b.id);
    this.toastMsg(`${b.resource} booking cancelled`);
  }
  protected showOnMap(b: Booking) {
    this.menu.set(null);
    this.pickById(b.resourceId);
  }
  protected readonly edit = signal<Booking | null>(null);
  protected openEdit(b: Booking) {
    this.menu.set(null);
    this.err.set('');
    this.edit.set({ ...b });
  }
  protected setEditTime(v: string) {
    const [from, to] = v.split(' - ');
    this.edit.update((e) => (e ? { ...e, from, to } : e));
  }
  protected saveEdit() {
    const e = this.edit()!;
    const room = ROOMS.find((r) => r.id === e.resourceId);
    if (room && !this.store.roomFree(room, e.date, e.from, e.to, e.id)) return this.err.set(`${room.name} is already booked for that slot.`);
    const desk = this.store.desks().find((d) => d.id === e.resourceId);
    const old = this.store.bookings().find((x) => x.id === e.id)!;
    this.store.updateBooking(e.id, { date: e.date, from: e.from, to: e.to });
    if (desk && old.date === TODAY && e.date !== TODAY && desk.mine) this.store.setDeskStatus(desk.id, 'available');
    if (desk && e.date === TODAY && old.date !== TODAY) this.store.desks.update((l) => l.map((d) => (d.id === desk.id ? { ...d, status: 'reserved', mine: true } : d)));
    this.edit.set(null);
    this.toastMsg(`${e.resource} moved to ${fmtD(e.date)} · ${e.from} - ${e.to}`);
  }
  protected drawerList() {
    const all = this.store.bookings().filter((b) => b.by === 'Rex Kumar');
    const t = this.dTab();
    const l = t === 'Cancelled' ? all.filter((b) => b.status === 'Cancelled' || b.status === 'Rejected') : t === 'Past' ? all.filter((b) => b.date < TODAY && b.status !== 'Cancelled') : this.store.myUpcoming();
    return l;
  }
  protected drawerCount(t: string) {
    const all = this.store.bookings().filter((b) => b.by === 'Rex Kumar');
    return t === 'Cancelled' ? all.filter((b) => b.status === 'Cancelled' || b.status === 'Rejected').length : t === 'Past' ? all.filter((b) => b.date < TODAY && b.status !== 'Cancelled').length : this.store.myUpcoming().length;
  }

  // ----- new booking modal -----
  protected readonly nb = signal<{ tab: Tab; site: string; date: string; time: string; res: string; title: string } | null>(null);
  protected openNew() {
    this.err.set('');
    this.nb.set({ tab: 'Desk', site: this.site(), date: TODAY, time: TIMES[0], res: '', title: '' });
  }
  protected readonly nbOptions = computed(() => {
    const n = this.nb();
    if (!n) return [];
    if (n.tab === 'Desk') return this.store.desks().filter((d) => d.site === n.site && d.type !== 'Collaboration Area' && this.deskFree(d, n.date)).map((d) => ({ id: d.id, label: `${d.name} · ${d.floor} · ${this.zoneName(d.zone)}` }));
    const { from, to } = this.slot(n.time);
    return ROOMS.filter((r) => r.site === n.site && (n.tab === 'Meeting Room' ? !['Focus Room', 'Collaboration Area'].includes(r.kind) : r.kind === n.tab) && this.store.roomFree(r, n.date, from, to))
      .map((r) => ({ id: r.id, label: `${r.name} · ${r.floor} · ${r.capacity} seats` }));
  });
  protected saveNew() {
    const n = this.nb()!;
    if (!n.res) return this.err.set('Please choose what to book.');
    const { from, to } = this.slot(n.time);
    if (n.tab === 'Desk') {
      const d = this.store.desks().find((x) => x.id === n.res)!;
      this.store.bookDesk(d, n.date, from, to);
      this.site.set(d.site);
      this.floor.set(d.floor);
      this.selId.set(d.id);
      this.toastMsg(`${d.name} booked · ${fmtD(n.date)} · ${from} - ${to}`);
    } else {
      const r = ROOMS.find((x) => x.id === n.res)!;
      const b = this.store.bookRoom(r, n.date, from, to, n.title || 'Meeting');
      this.toastMsg(b.status === 'Pending' ? `${r.name} requested · awaiting approval` : `${r.name} booked · ${fmtD(n.date)}`);
    }
    this.nb.set(null);
  }

  // ----- charts -----
  protected readonly usageRange = signal('Last 7 Days');
  protected readonly usage = computed(() => (this.usageRange() === 'Last 7 Days' ? USAGE_7D : USAGE_PREV));
  protected readonly uh = signal<number | null>(null);
  protected readonly insRange = signal('This Month');
  protected readonly dh = signal<string | null>(null);
  protected readonly donut = computed(() => {
    const f = this.insRange() === 'This Month' ? 1 : this.insRange() === 'Last Month' ? 0.9 : 2.8;
    const segs = INSIGHTS.map((s, i) => ({ ...s, value: Math.round(s.value * f * (f === 1 ? 1 : 1 + (i % 2 ? 0.04 : -0.03))) }));
    const total = segs.reduce((a, s) => a + s.value, 0);
    const C = 2 * Math.PI * 48;
    let off = 0;
    return segs.map((s) => {
      const len = (s.value / total) * C;
      const o = { ...s, pct: Math.round((s.value / total) * 100), dash: `${len} ${C}`, off: -off };
      off += len;
      return o;
    });
  });
  protected readonly dhSeg = computed(() => this.donut().find((s) => s.label === this.dh()));
  protected zoneFromTop(label: string) {
    const z = ZONES.find((x) => x.name === label || x.name.startsWith(label.split(' ')[0]));
    if (!z) return this.go('space-utilization');
    this.site.set('Head Office');
    this.floor.set('Floor 5');
    this.hl.set(new Set(this.floorDesks().filter((d) => d.zone === z.key).map((d) => d.id)));
    this.deskResult.set(null);
  }

  // ----- misc -----
  protected go(p: string) {
    this.menu.set(null);
    this.router.navigateByUrl(`/workplace-facility-services/${p}`);
  }
  protected exportMine() {
    this.menu.set(null);
    downloadCsv('my-bookings.csv', [['ID', 'Type', 'Resource', 'Location', 'Date', 'From', 'To', 'Status'], ...this.store.bookings().filter((b) => b.by === 'Rex Kumar').map((b) => [b.id, b.kind, b.resource, b.location, b.date, b.from, b.to, b.status])]);
  }
  protected exportDesks() {
    this.menu.set(null);
    downloadCsv('desk-inventory.csv', [['Desk', 'Site', 'Floor', 'Zone', 'Type', 'Status', 'Amenities', 'Occupant'], ...this.store.desks().map((d) => [d.name, d.site, d.floor, this.zoneName(d.zone), d.type, STATUS_LABEL[d.status], d.amenities.join(' | '), d.occupant ?? ''])]);
  }
  protected print() {
    this.menu.set(null);
    setTimeout(() => window.print(), 50);
  }
  protected resetDemo() {
    this.menu.set(null);
    this.store.reset();
    this.clearForm();
    this.clearFilters();
    this.setSite('Head Office');
    this.selId.set('H5-open-11');
    this.toastMsg('Demo data reset');
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
  @HostListener('document:click')
  protected closeMenus() {
    if (this.menu()) this.menu.set(null);
  }
  @HostListener('document:keydown.escape')
  protected esc() {
    this.menu.set(null);
    this.sel() ? this.selId.set(null) : null;
  }
}
