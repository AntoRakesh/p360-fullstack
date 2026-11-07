import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { HOSTS, PURPOSES, SITES, VmStore, hm } from './vm.data';
import { SCHED_STATUSES, SchedStatus, SchedVisit, VisitScheduleStore, addDays, isoDate, parseIso, purposeStyle, weekStart } from './vm-scheduling.data';

type View = 'Day' | 'Week' | 'Month' | 'Agenda';
type SortKey = 'visitor' | 'company' | 'purpose' | 'host' | 'site' | 'when' | 'status';
const ROW = 26; // px per hour in the time grid
const H0 = 8, H1 = 18; // 8 AM – 6 PM
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Form { id: number | null; visitor: string; contact: string; company: string; purpose: string; host: string; site: string; date: string; start: number; end: number; recurring: boolean; invite: boolean }

@Component({
  selector: 'app-vm-scheduling',
  imports: [Icon, SelectValue, ...VM_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)' },
  template: `
  <div class="vm-page">
    <nav class="crumb"><app-icon name="home" [size]="15" /><app-icon name="chevron-right" [size]="13" /><span>Visitor Management</span><app-icon name="chevron-right" [size]="13" /><b>Visit Scheduling</b></nav>
    <header class="vm-head">
      <div>
        <h1>Visit Scheduling</h1>
        <p>Plan visitor appointments, manage host availability, and coordinate upcoming visits.</p>
      </div>
      <div class="vm-actions">
        <button class="btn-primary hb" (click)="newVisit()"><app-icon name="plus" [size]="18" />Schedule Visit</button>
        <button class="btn-outline hb dark" (click)="importOpen.set(true)"><app-icon name="calendar-days" [size]="18" />Import Calendar</button>
        <button class="btn-outline hb dark" (click)="exportCsv()"><app-icon name="download" [size]="18" />Export</button>
        <div class="menu-wrap">
          <button class="vm-icon-btn tall" (click)="$event.stopPropagation(); menu.set(menu() === 'more' ? null : 'more')"><app-icon name="more" [size]="18" /></button>
          @if (menu() === 'more') {
            <div class="dropdown" (click)="$event.stopPropagation()">
              <button class="dd-item" (click)="weekends.set(!weekends()); menu.set(null)"><app-icon name="w-calendar" [size]="15" />{{ weekends() ? 'Hide weekends' : 'Show weekends' }}</button>
              <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="reports-printer" [size]="15" />Print schedule</button>
              <button class="dd-item" (click)="menu.set(null); goToday()"><app-icon name="locate" [size]="15" />Jump to today</button>
            </div>
          }
        </div>
      </div>
    </header>

    <section class="vm-kpis">
      <vm-kpi label="Today's Visits" [value]="kpi().today" icon="w-calendar" color="#7c3aed" [clickable]="true" (pick)="goToday('Day')" />
      <vm-kpi label="This Week" [value]="kpi().week" icon="trending-up" color="#16a34a" [clickable]="true" (pick)="goToday('Week')" />
      <vm-kpi label="Pending Confirmation" [value]="kpi().pending" icon="clock" color="#ea580c" [clickable]="true" [active]="fStatus() === 'Pending Confirmation'" (pick)="fStatus.set(fStatus() === 'Pending Confirmation' ? 'All' : 'Pending Confirmation')" />
      <vm-kpi label="Available Hosts" [value]="kpi().hosts" icon="users" color="#2563eb" />
    </section>

    <div class="vm-bar">
      <vm-tabs class="seg" [tabs]="views" [value]="view()" (change)="view.set($any($event))" />
      <button class="vm-icon-btn" title="Previous" (click)="shift(-1)"><app-icon name="chevron-left" [size]="16" /></button>
      <label class="datebtn">
        <app-icon name="w-calendar" [size]="17" /><b>{{ anchorLabel() }}</b><app-icon name="chevron-down" [size]="15" />
        <input type="date" [value]="anchor()" (click)="pick($event)" (change)="setAnchor($any($event.target).value)" />
      </label>
      <button class="vm-icon-btn" title="Next" (click)="shift(1)"><app-icon name="chevron-right" [size]="16" /></button>
      <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search visitor, host, purpose..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <label class="vm-filter"><app-icon name="map-pin" [size]="16" /><span>Site:</span>
        <select [value]="fSite()" (change)="fSite.set($any($event.target).value)"><option value="All">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <label class="vm-filter"><app-icon name="user" [size]="16" /><span>Host:</span>
        <select [value]="fHost()" (change)="fHost.set($any($event.target).value)"><option>All</option>@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
      <label class="vm-filter"><app-icon name="briefcase" [size]="16" /><span>Visit Purpose:</span>
        <select [value]="fPurpose()" (change)="fPurpose.set($any($event.target).value)"><option>All</option>@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select></label>
      <label class="vm-filter"><app-icon name="sliders" [size]="16" /><span>Status:</span>
        <select [value]="fStatus()" (change)="fStatus.set($any($event.target).value)"><option>All</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <button class="vm-icon-btn" title="Reset filters" (click)="resetFilters()"><app-icon name="refresh" [size]="16" /></button>
    </div>

    <div class="main">
      <section class="vm-card sched">
        <div class="vm-card-head"><h2><app-icon name="w-calendar" [size]="24" />Schedule</h2><span class="spacer"></span>
          <span class="legend">@for (p of legend; track p) {<span><i [style.background]="style(p).c"></i>{{ p }}</span>}</span>
        </div>
        @switch (view()) {
          @case ('Month') {
            <div class="month">
              @for (d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; track d) {<div class="mh">{{ d }}</div>}
              @for (c of monthCells(); track c.date) {
                <div class="mc" [class.out]="!c.inMonth" [class.today]="c.date === today" (click)="openDay(c.date)">
                  <span class="mn">{{ c.day }}</span>
                  @for (e of c.items.slice(0, 2); track e.id) {
                    <button class="mchip" [style.--c]="style(e.purpose).c" [class.cx]="e.status === 'Cancelled'" (click)="$event.stopPropagation(); viewing.set(e.id)">{{ hmShort(e.start) }} {{ e.visitor }}</button>
                  }
                  @if (c.items.length > 2) {<small class="more">+{{ c.items.length - 2 }} more</small>}
                </div>
              }
            </div>
          }
          @case ('Agenda') {
            <div class="agenda">
              @for (g of agenda(); track g.date) {
                <div class="ag-day" [class.today]="g.date === today"><b>{{ dayLabel(g.date) }}</b><small>{{ g.items.length }} visit{{ g.items.length === 1 ? '' : 's' }}</small></div>
                @for (e of g.items; track e.id) {
                  <div class="ag-row" (click)="viewing.set(e.id)">
                    <span class="ag-t">{{ hm(e.start) }}<small>{{ hm(e.end) }}</small></span>
                    <i class="ag-bar" [style.background]="style(e.purpose).c"></i>
                    <span class="ag-main"><b><app-icon [name]="style(e.purpose).icon" [size]="14" [style.color]="style(e.purpose).c" />{{ e.purpose }}</b><small>{{ e.visitor }} · {{ e.company }}</small></span>
                    <span class="ag-h"><app-icon name="user" [size]="14" />{{ e.host }}</span>
                    <span class="ag-h"><app-icon name="map-pin" [size]="14" />{{ e.site }}</span>
                    <vm-status [label]="e.status" [icon]="statusIcon(e.status)" />
                  </div>
                }
              } @empty {<div class="vm-empty">No visits in the next 14 days for the current filters.</div>}
            </div>
          }
          @default {
            <div class="cal" [style.--cols]="days().length">
              <div class="cal-h corner"></div>
              @for (d of days(); track d) {
                <div class="cal-h" [class.today]="d === today" (click)="openDay(d)"><b>{{ dow(d) }}</b><span>{{ dm(d) }}</span></div>
              }
              <div class="times">@for (h of hours; track h) {<span [style.height.px]="row">{{ hLabel(h) }}</span>}</div>
              @for (d of days(); track d; let ci = $index) {
                <div class="col" [class.today]="d === today" [style.height.px]="hours.length * row" (click)="slot(d, $event)">
                  @for (h of hours; track h) {<i class="cell" [style.height.px]="row"></i>}
                  @for (e of byDay().get(d) ?? []; track e.id) {
                    <button class="ev" [class.wide]="view() === 'Day'" [class.draft]="e.status === 'Draft'" [class.cx]="e.status === 'Cancelled'" [style.--c]="style(e.purpose).c"
                      [style.top.px]="top(e.start)" [style.height.px]="height(e)" (click)="$event.stopPropagation(); viewing.set(e.id)" [title]="e.purpose + ' · ' + e.visitor">
                      <b><app-icon [name]="style(e.purpose).icon" [size]="13" [stroke]="2.2" />{{ e.purpose }}</b>
                      <span class="t">{{ hm(e.start) }} – {{ hm(e.end) }}</span>
                      <span><app-icon name="user" [size]="11" />{{ e.visitor }}@if (view() === 'Day') { · {{ e.company }}}</span>
                      <span><app-icon name="user" [size]="11" />{{ e.host }}@if (view() === 'Day') { · {{ e.site }}}</span>
                    </button>
                  }
                  @if (d === today) {
                    <button class="addv" [style.top.px]="addTop()" (click)="$event.stopPropagation(); slotAt(d, nextFree())"><app-icon name="plus" [size]="14" />Add visit</button>
                  }
                </div>
              }
              @if (nowCol() >= 0) {
                <div class="now" [style.top.px]="top(store.now())" [style.--ci]="nowCol()"><span>{{ hm(store.now()) }}</span></div>
              }
            </div>
          }
        }
      </section>

      <section class="vm-card form">
        <div class="vm-card-head"><h2><app-icon name="user-plus" [size]="24" />{{ f().id ? 'Edit Visit' : 'Schedule Visit' }}</h2><span class="spacer"></span>
          <span class="avail"><small>Host availability</small><span class="ah"><app-icon name="w-calendar" [size]="14" />{{ f().host }} ·</span>
            <vm-status [label]="hostState()" [tone]="hostState() === 'Available' ? 'green' : 'orange'" [icon]="hostState() === 'Available' ? 'tasks-check-circle' : 'clock'" /></span>
        </div>
        <div class="fg">
          <div class="vm-field"><label>Visitor name <b>*</b></label><div class="vm-input" [class.err]="err('visitor')"><app-icon name="user" [size]="16" /><input placeholder="Enter visitor name" [value]="f().visitor" (input)="set('visitor', $any($event.target).value)" /></div></div>
          <div class="vm-field"><label>Email or mobile <b>*</b></label><div class="vm-input" [class.err]="err('contact')"><app-icon name="p-mail" [size]="16" /><input placeholder="Enter email or mobile" [value]="f().contact" (input)="set('contact', $any($event.target).value)" /></div></div>
          <div class="vm-field"><label>Company <b>*</b></label><div class="vm-input" [class.err]="err('company')"><app-icon name="building" [size]="16" /><input placeholder="Enter company name" [value]="f().company" (input)="set('company', $any($event.target).value)" /></div></div>
          <div class="vm-field"><label>Visit purpose <b>*</b></label><div class="vm-input" [class.err]="err('purpose')"><app-icon name="briefcase" [size]="16" />
            <select [value]="f().purpose" (change)="set('purpose', $any($event.target).value)" [class.ph]="!f().purpose"><option value="">Select visit purpose</option>@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select></div></div>
          <div class="vm-field"><label>Host / Employee <b>*</b></label><div class="vm-input"><app-icon name="user" [size]="16" />
            <select [value]="f().host" (change)="set('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></div></div>
          <div class="vm-field"><label>Site / Location <b>*</b></label><div class="vm-input" [class.err]="err('site')"><app-icon name="map-pin" [size]="16" />
            <select [value]="f().site" (change)="set('site', $any($event.target).value)" [class.ph]="!f().site"><option value="">Select site / location</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></div></div>
          <div class="vm-field"><label>Date <b>*</b></label>
            <label class="vm-input datein"><app-icon name="w-calendar" [size]="16" /><span class="dv">{{ longDate(f().date) }}</span><app-icon name="calendar-days" [size]="16" />
              <input type="date" [value]="f().date" (click)="pick($event)" (change)="set('date', $any($event.target).value || f().date)" /></label></div>
          <div class="two">
            <div class="vm-field"><label>Start time <b>*</b></label><div class="vm-input"><app-icon name="clock" [size]="16" />
              <select [value]="f().start" (change)="setStart(+$any($event.target).value)">@for (t of times; track t) {<option [value]="t">{{ hm(t) }}</option>}</select></div></div>
            <div class="vm-field"><label>End time <b>*</b></label><div class="vm-input" [class.err]="f().end <= f().start"><app-icon name="clock" [size]="16" />
              <select [value]="f().end" (change)="set('end', +$any($event.target).value)">@for (t of times; track t) {<option [value]="t">{{ hm(t) }}</option>}</select></div></div>
          </div>
          <label class="chk"><button type="button" class="vm-switch purple" [class.on]="f().recurring" (click)="set('recurring', !f().recurring)"></button>Recurring visit <app-icon name="lightbulb" [size]="14" class="info" [title]="'Repeats weekly for 4 weeks'" /></label>
          <label class="chk"><input type="checkbox" [checked]="f().invite" (change)="set('invite', $any($event.target).checked)" />Invite visitor <app-icon name="lightbulb" [size]="14" class="info" [title]="'Email / SMS invitation with QR pass'" /></label>
        </div>
        @if (f().recurring) {<p class="hint"><app-icon name="a-repeat" [size]="14" />Repeats every {{ dow(f().date) }} for 4 weeks ({{ hm(f().start) }} – {{ hm(f().end) }}).</p>}
        <div class="fa">
          <button class="btn-primary" (click)="save(f().invite ? 'Pending Confirmation' : 'Confirmed')"><app-icon name="p-send" [size]="17" />{{ f().id ? 'Update Visit' : f().invite ? 'Save & Send Invitation' : 'Save Visit' }}</button>
          <button class="btn-outline" (click)="save('Draft')"><app-icon name="file-text" [size]="17" />Save as Draft</button>
          <button class="btn-outline dark" (click)="resetForm()">Cancel</button>
        </div>
      </section>
    </div>

    <section class="vm-card">
      <div class="vm-card-head"><h2><app-icon name="users" [size]="24" />Upcoming Visits</h2>
        @if (picked().size) {
          <span class="bulk"><b>{{ picked().size }} selected</b>
            <button class="vm-mini" (click)="bulk('Confirmed')"><app-icon name="tasks-check" [size]="13" />Confirm</button>
            <button class="vm-mini" (click)="bulk('remind')"><app-icon name="bell" [size]="13" />Send reminder</button>
            <button class="vm-mini red" (click)="bulk('Cancelled')"><app-icon name="tasks-x" [size]="13" />Cancel</button></span>
        }
        <span class="spacer"></span>
        <small class="muted">{{ upcoming().length }} upcoming</small>
        @if (upcoming().length > 4) {<button class="vm-link" (click)="showAll.set(!showAll())">{{ showAll() ? 'Show less' : 'View all' }}</button>}
      </div>
      <table class="vm-table">
        <thead><tr>
          <th class="cb"><input type="checkbox" [checked]="allPicked()" (change)="pickAll($any($event.target).checked)" /></th>
          @for (c of cols; track c.k) {<th class="sort" (click)="sortBy(c.k)">{{ c.l }} <app-icon [name]="sort().k === c.k ? (sort().dir > 0 ? 'arrow-up' : 'arrow-down') : 'vm-b-sort'" [size]="13" /></th>}
          <th>Actions</th>
        </tr></thead>
        <tbody>
          @for (e of rows(); track e.id) {
            <tr [class.sel]="picked().has(e.id)">
              <td class="cb"><input type="checkbox" [checked]="picked().has(e.id)" (change)="toggle(e.id)" /></td>
              <td><span class="vm-person"><vm-avatar [name]="e.visitor" [size]="34" />{{ e.visitor }}</span></td>
              <td>{{ e.company }}</td>
              <td><span class="ic"><app-icon [name]="style(e.purpose).icon" [size]="17" class="pc" />{{ e.purpose }}</span></td>
              <td><span class="ic"><app-icon name="user" [size]="16" />{{ e.host }}</span></td>
              <td><span class="ic"><app-icon name="map-pin" [size]="16" />{{ e.site }}</span></td>
              <td><span class="ic"><app-icon name="w-calendar" [size]="16" />{{ when(e) }}</span></td>
              <td><vm-status [label]="e.status" [icon]="statusIcon(e.status)" [tone]="e.status === 'Rescheduled' ? 'purple' : undefined" /></td>
              <td><span class="vm-acts">
                <button class="vm-mini" (click)="viewing.set(e.id)"><app-icon name="eye" [size]="13" />View</button>
                <button class="vm-mini" (click)="edit(e)"><app-icon name="tasks-pencil" [size]="13" />Edit</button>
                <button class="vm-mini" [disabled]="e.status === 'Cancelled'" (click)="confirmCancel.set(e.id)"><app-icon name="tasks-x" [size]="13" />Cancel</button>
              </span></td>
            </tr>
          } @empty {<tr><td colspan="9" class="vm-empty">No upcoming visits match the current filters.</td></tr>}
        </tbody>
      </table>
    </section>
  </div>

  @if (viewed(); as v) {
    <div class="g-overlay" (click)="viewing.set(null)"></div>
    <aside class="g-drawer">
      <div class="modal-head"><h3>Visit details</h3><button class="close-btn" (click)="viewing.set(null)">×</button></div>
      <div class="dv-top"><vm-avatar [name]="v.visitor" [size]="56" /><div><b>{{ v.visitor }}</b><small>{{ v.company }}</small><vm-status [label]="v.status" [icon]="statusIcon(v.status)" [tone]="v.status === 'Rescheduled' ? 'purple' : undefined" /></div></div>
      <div class="vm-kv">
        <span><app-icon [name]="style(v.purpose).icon" [size]="15" />Purpose</span><b>{{ v.purpose }}</b>
        <span><app-icon name="user" [size]="15" />Host</span><b>{{ v.host }}</b>
        <span><app-icon name="map-pin" [size]="15" />Site</span><b>{{ v.site }}</b>
        <span><app-icon name="w-calendar" [size]="15" />Date</span><b>{{ longDate(v.date) }}</b>
        <span><app-icon name="clock" [size]="15" />Time</span><b>{{ hm(v.start) }} – {{ hm(v.end) }}</b>
        <span><app-icon name="p-mail" [size]="15" />Contact</span><b>{{ v.contact }}</b>
        <span><app-icon name="p-send" [size]="15" />Invitation</span><b>{{ v.invite ? 'Sent' : 'Not sent' }}{{ v.recurring ? ' · recurring weekly' : '' }}</b>
      </div>
      <div class="dv-acts">
        @if (v.status === 'Pending Confirmation' || v.status === 'Draft' || v.status === 'Rescheduled') {<button class="btn-primary" (click)="setStatus(v.id, 'Confirmed')"><app-icon name="tasks-check" [size]="16" />Mark confirmed</button>}
        <button class="btn-outline" (click)="edit(v); viewing.set(null)"><app-icon name="tasks-pencil" [size]="16" />Edit / reschedule</button>
        @if (v.invite) {<button class="btn-outline" (click)="flash('Invitation re-sent to ' + v.contact)"><app-icon name="p-send" [size]="16" />Resend invite</button>}
        @if (v.status !== 'Cancelled') {<button class="vm-btn-danger" (click)="confirmCancel.set(v.id)"><app-icon name="tasks-x" [size]="16" />Cancel visit</button>}
      </div>
    </aside>
  }

  @if (cancelTarget(); as v) {
    <div class="g-overlay top" (click)="confirmCancel.set(null)"></div>
    <div class="g-modal small top">
      <div class="modal-head"><h3>Cancel visit?</h3><button class="close-btn" (click)="confirmCancel.set(null)">×</button></div>
      <p>{{ v.purpose }} with <b>{{ v.visitor }}</b> ({{ v.company }}) on {{ longDate(v.date) }} at {{ hm(v.start) }} will be cancelled and the visitor and host notified.</p>
      <div class="form-actions"><button class="btn-outline" (click)="confirmCancel.set(null)">Keep visit</button><button class="vm-btn-danger" (click)="setStatus(v.id, 'Cancelled'); confirmCancel.set(null)">Cancel visit</button></div>
    </div>
  }

  @if (importOpen()) {
    <div class="g-overlay" (click)="importOpen.set(false)"></div>
    <div class="g-modal small">
      <div class="modal-head"><h3>Import Calendar</h3><button class="close-btn" (click)="importOpen.set(false)">×</button></div>
      <label class="drop"><app-icon name="tasks-upload" [size]="26" /><b>Drop an .ics file or click to browse</b><small>Outlook, Google Calendar or iCal exports</small>
        <input type="file" accept=".ics,.csv" (change)="importFile($any($event.target).files?.[0]?.name)" /></label>
      <div class="src">
        @for (s of ['Microsoft Outlook', 'Google Calendar']; track s) {<button class="btn-outline" (click)="importFile(s)"><app-icon name="calendar-days" [size]="16" />Sync from {{ s }}</button>}
      </div>
    </div>
  }
  @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: -8px; }
    .crumb app-icon { color: #475569; }
    .hb { height: 40px; padding: 0 18px; font-size: 15px; }
    .dark { color: var(--text); border-color: var(--border); }
    .vm-icon-btn.tall { height: 40px; }
    .vm-bar { gap: 8px; }
    .seg ::ng-deep button { padding: 7px 16px; font-size: 14px; }
    .datebtn { position: relative; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; height: 36px; padding: 0 10px; cursor: pointer; white-space: nowrap; font-size: 14px; }
    .datebtn b { font-weight: 600; }
    .datebtn input, .datein input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
    .vm-search { min-width: 170px; }
    .vm-filter select { max-width: 120px; }
    .main { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .legend { display: flex; gap: 10px; font-size: 11.5px; color: var(--muted); flex-wrap: wrap; justify-content: flex-end; }
    .legend span { display: inline-flex; align-items: center; gap: 4px; }
    .legend i { width: 8px; height: 8px; border-radius: 2px; }
    /* time grid */
    .cal { --cols: 7; position: relative; display: grid; grid-template-columns: 74px repeat(var(--cols), minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .cal-h { height: 40px; box-sizing: border-box; justify-content: center; text-align: center; padding: 4px 0; border-left: 1px solid #ececf4; border-bottom: 1px solid var(--border); background: #fbfaff; font-size: 13px; line-height: 1.25; cursor: pointer; display: flex; flex-direction: column; }
    .cal-h b { font-weight: 600; } .cal-h span { color: var(--text); }
    .cal-h.corner { border-left: 0; cursor: default; }
    .cal-h.today { background: #ede9fe; color: var(--primary); } .cal-h.today b, .cal-h.today span { color: var(--primary); font-weight: 700; }
    .times { display: flex; flex-direction: column; }
    .times span { font-size: 12px; padding: 0 0 0 10px; display: flex; align-items: center; border-bottom: 1px solid #f0f0f6; white-space: nowrap; }
    .col { position: relative; border-left: 1px solid #ececf4; cursor: copy; }
    .col.today { background: #f6f2ff; }
    .cell { display: block; border-bottom: 1px solid #f0f0f6; }
    .cell:hover { background: #f1ecff; }
    .ev { --c: #7c3aed; position: absolute; left: 4px; right: 4px; z-index: 2; text-align: left; border: 1px solid color-mix(in srgb, var(--c) 35%, #fff); border-left: 3px solid var(--c);
      background: color-mix(in srgb, var(--c) 10%, #fff); border-radius: 6px; padding: 4px 6px; font: inherit; font-size: 11px; line-height: 1.3; cursor: pointer; overflow: hidden;
      display: flex; flex-direction: column; color: var(--text); box-shadow: 0 1px 3px rgba(20, 20, 60, .06); }
    .ev:hover { box-shadow: 0 4px 12px color-mix(in srgb, var(--c) 30%, transparent); z-index: 3; }
    .ev b { color: var(--c); font-size: 12.5px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; }
    .ev b app-icon, .ev span app-icon { flex: none; }
    .ev .t { font-size: 10.5px; white-space: nowrap; }
    .ev span { display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ev span app-icon { color: #475569; }
    .ev.wide { right: 12px; font-size: 12px; }
    .ev.draft { border-style: dashed; background: #fff; }
    .ev.cx { opacity: .55; } .ev.cx b { text-decoration: line-through; }
    .addv { position: absolute; left: 6px; right: 6px; height: 24px; border: 1.5px dashed #a78bfa; border-radius: 6px; background: #fff; color: var(--primary); font: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; z-index: 2; }
    .addv:hover { background: #f5f0ff; }
    .now { position: absolute; left: calc(74px + (100% - 74px) / var(--cols) * var(--ci)); right: 0; height: 0; border-top: 1.5px solid #ef4444; z-index: 4; pointer-events: none; margin-top: 40px; }
    .now::before { content: ''; position: absolute; left: -5px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }
    .now span { position: absolute; left: 6px; top: -22px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; }
    /* month */
    .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .mh { background: #fbfaff; text-align: center; font-weight: 600; font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .mc { min-height: 66px; border-right: 1px solid #f0f0f6; border-bottom: 1px solid #f0f0f6; padding: 3px 4px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; min-width: 0; }
    .mc:hover { background: #faf8ff; }
    .mc.out { background: #fafafa; color: #94a3b8; }
    .mc.today { background: #f3eeff; } .mc.today .mn { background: var(--primary); color: #fff; }
    .mn { font-size: 12px; font-weight: 600; width: 22px; height: 20px; border-radius: 6px; display: grid; place-items: center; }
    .mchip { --c: #7c3aed; border: 0; border-left: 3px solid var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); color: var(--text); font: inherit; font-size: 10.5px; text-align: left; padding: 1px 4px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    .mchip.cx { text-decoration: line-through; opacity: .6; }
    .more { font-size: 10.5px; color: var(--primary); font-weight: 600; }
    /* agenda */
    .agenda { max-height: 330px; overflow: auto; display: flex; flex-direction: column; }
    .ag-day { display: flex; justify-content: space-between; align-items: center; background: #f6f4ff; border-radius: 6px; padding: 5px 10px; margin-top: 6px; font-size: 13px; position: sticky; top: 0; z-index: 1; }
    .ag-day.today { background: #ede9fe; color: var(--primary); }
    .ag-day small { color: var(--muted); }
    .ag-row { display: grid; grid-template-columns: 70px 4px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) auto; gap: 10px; align-items: center; padding: 7px 6px; border-bottom: 1px solid #f0f0f6; font-size: 12.5px; cursor: pointer; }
    .ag-row:hover { background: #faf8ff; }
    .ag-t { display: flex; flex-direction: column; font-weight: 600; } .ag-t small { color: var(--muted); font-weight: 400; }
    .ag-bar { align-self: stretch; border-radius: 4px; }
    .ag-main { display: flex; flex-direction: column; min-width: 0; } .ag-main b { display: flex; gap: 5px; align-items: center; } .ag-main small { color: var(--muted); }
    .ag-h { display: flex; gap: 5px; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #334155; }
    /* form */
    .form .vm-card-head h2 app-icon { color: var(--primary); }
    .avail { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 3px 6px; font-size: 12px; white-space: nowrap; }
    .avail small { font-size: 12px; padding-right: 6px; border-right: 1px solid var(--border); }
    .ah { display: inline-flex; align-items: center; gap: 4px; } .ah app-icon { color: var(--primary); }
    .avail vm-status { font-size: 11.5px; padding: 2px 8px; }
    .fg { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 18px; }
    .fg .vm-field > label { font-weight: 600; font-size: 13.5px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    select.ph { color: #64748b; }
    .datein { position: relative; cursor: pointer; } .dv { flex: 1; font-size: 13px; color: var(--text); white-space: nowrap; }
    .chk { display: flex; align-items: center; gap: 10px; font-size: 14px; margin-top: 6px; cursor: pointer; }
    .chk input { width: 20px; height: 20px; accent-color: var(--primary); }
    .info { color: #64748b; }
    .hint { display: flex; align-items: center; gap: 6px; color: var(--primary); font-size: 12.5px; margin: 8px 0 0; }
    .fa { display: grid; grid-template-columns: 1.3fr 1fr .7fr; gap: 10px; margin-top: 18px; }
    .fa button { height: 40px; justify-content: center; font-size: 15px; }
    /* table */
    .vm-table td { font-size: 13.5px; padding: 6px 10px; }
    .cb { width: 30px; } .cb input { width: 17px; height: 17px; accent-color: var(--primary); }
    .ic { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; } .ic app-icon { color: #475569; } .ic .pc { color: var(--primary); }
    .vm-acts .vm-mini { height: 26px; padding: 0 12px; }
    .vm-mini[disabled] { opacity: .4; cursor: default; }
    .bulk { display: inline-flex; gap: 6px; align-items: center; margin-left: 12px; font-size: 13px; }
    .muted { color: var(--muted); }
    /* drawer + modals */
    .dv-top { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
    .dv-top div { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; } .dv-top b { font-size: 17px; } .dv-top small { color: var(--muted); }
    .dv-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
    .g-modal.small { width: min(460px, calc(100vw - 32px)); }
    .g-overlay.top { z-index: 80; } .g-modal.top { z-index: 85; }
    .drop { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; border: 2px dashed #c4b5fd; border-radius: 12px; padding: 26px; color: var(--primary); cursor: pointer; text-align: center; }
    .drop small { color: var(--muted); } .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .src { display: flex; gap: 8px; margin-top: 14px; } .src button { flex: 1; justify-content: center; }
    @media (max-width: 1300px) { .main { grid-template-columns: 1fr; } }
  `,
})
export class VisitScheduling {
  protected readonly store = inject(VmStore);
  private readonly sched = inject(VisitScheduleStore);
  protected readonly hm = hm;
  protected readonly row = ROW;
  protected readonly hours = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
  protected readonly times = Array.from({ length: (H1 - H0) * 2 + 1 }, (_, i) => H0 * 60 + i * 30);
  protected readonly views: View[] = ['Day', 'Week', 'Month', 'Agenda'];
  protected readonly sites = SITES;
  protected readonly hosts = HOSTS;
  protected readonly purposes = PURPOSES;
  protected readonly statuses = SCHED_STATUSES;
  protected readonly legend = ['Business Meeting', 'Site Visit', 'Delivery', 'Interview', 'Maintenance'];
  protected readonly today = this.sched.today;
  protected readonly cols: { k: SortKey; l: string }[] = [
    { k: 'visitor', l: 'Visitor' }, { k: 'company', l: 'Company' }, { k: 'purpose', l: 'Purpose' }, { k: 'host', l: 'Host' }, { k: 'site', l: 'Site' }, { k: 'when', l: 'Date & Time' }, { k: 'status', l: 'Status' },
  ];

  protected readonly view = signal<View>('Week');
  protected readonly anchor = signal(this.today);
  protected readonly weekends = signal(true);
  protected readonly q = signal('');
  protected readonly fSite = signal('All');
  protected readonly fHost = signal('All');
  protected readonly fPurpose = signal('All');
  protected readonly fStatus = signal('All');
  protected readonly menu = signal<string | null>(null);
  protected readonly viewing = signal<number | null>(null);
  protected readonly confirmCancel = signal<number | null>(null);
  protected readonly importOpen = signal(false);
  protected readonly showAll = signal(false);
  protected readonly picked = signal(new Set<number>());
  protected readonly sort = signal<{ k: SortKey | null; dir: number }>({ k: null, dir: 1 });
  protected readonly toast = signal('');
  protected readonly tried = signal(false);
  protected readonly f = signal<Form>(this.blank(this.today, 630));

  protected readonly style = purposeStyle;
  protected readonly viewed = computed(() => this.sched.visits().find((v) => v.id === this.viewing()) ?? null);
  protected readonly cancelTarget = computed(() => this.sched.visits().find((v) => v.id === this.confirmCancel()) ?? null);

  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.sched.visits().filter((v) =>
      (this.fSite() === 'All' || v.site === this.fSite()) && (this.fHost() === 'All' || v.host === this.fHost()) &&
      (this.fPurpose() === 'All' || v.purpose === this.fPurpose()) && (this.fStatus() === 'All' || v.status === this.fStatus()) &&
      (!q || `${v.visitor} ${v.company} ${v.host} ${v.purpose} ${v.site}`.toLowerCase().includes(q)));
  });
  protected readonly byDay = computed(() => {
    const m = new Map<string, SchedVisit[]>();
    for (const v of this.filtered()) (m.get(v.date) ?? m.set(v.date, []).get(v.date)!).push(v);
    for (const l of m.values()) l.sort((a, b) => a.start - b.start);
    return m;
  });
  protected readonly days = computed(() => {
    if (this.view() === 'Day') return [this.anchor()];
    const ws = weekStart(this.anchor());
    return Array.from({ length: this.weekends() ? 7 : 5 }, (_, i) => addDays(ws, i));
  });
  protected readonly nowCol = computed(() => this.days().indexOf(this.today));
  protected readonly monthCells = computed(() => {
    const a = parseIso(this.anchor());
    const first = isoDate(new Date(a.getFullYear(), a.getMonth(), 1));
    const ws = weekStart(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(ws, i);
      const dd = parseIso(d);
      return { date: d, day: dd.getDate(), inMonth: dd.getMonth() === a.getMonth(), items: this.byDay().get(d) ?? [] };
    });
  });
  protected readonly agenda = computed(() =>
    Array.from({ length: 14 }, (_, i) => addDays(this.anchor(), i)).map((d) => ({ date: d, items: this.byDay().get(d) ?? [] })).filter((g) => g.items.length));
  protected readonly anchorLabel = computed(() => {
    const d = parseIso(this.anchor());
    if (this.view() === 'Month') return `${MONTH[d.getMonth()]} ${d.getFullYear()}`;
    return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
  });
  private readonly todayItems = computed(() => this.byDay().get(this.today) ?? []);
  protected readonly nextFree = computed(() => {
    const last = this.todayItems().filter((e) => e.status !== 'Cancelled').reduce((m, e) => Math.max(m, e.end), Math.max(this.store.now(), H0 * 60));
    return Math.min(H1 * 60 - 60, Math.ceil(last / 30) * 30);
  });
  protected readonly addTop = computed(() => {
    const bottom = this.todayItems().reduce((m, e) => Math.max(m, this.top(e.start) + this.height(e)), 0);
    return Math.min(this.hours.length * ROW - 28, bottom + 8);
  });

  protected readonly kpi = computed(() => {
    const live = this.sched.visits().filter((v) => v.status !== 'Cancelled');
    const b = this.sched.base;
    const ws = weekStart(this.today);
    return {
      today: 46 + live.filter((v) => v.date === this.today).length - b.today,
      week: 128 + live.filter((v) => weekStart(v.date) === ws).length - b.week,
      pending: 14 + live.filter((v) => v.status === 'Pending Confirmation').length - b.pending,
      hosts: 32 - live.filter((v) => v.date === this.today && v.start <= this.store.now() && v.end > this.store.now()).length,
    };
  });

  protected readonly upcoming = computed(() => {
    const now = this.store.now();
    const list = this.filtered().filter((v) => v.status !== 'Completed' && (v.date > this.today || (v.date === this.today && v.end > now)));
    // Default order: pinned seed rows (image order) and newly scheduled ones first, then chronological.
    const ord = (v: SchedVisit) => v.id > 1000 ? `0${String(1e9 - v.id).padStart(10, '0')}` : v.pinned ? `1${String(v.id).padStart(10, '0')}` : `2${v.date}${String(v.start).padStart(4, '0')}`;
    const s = this.sort();
    const key = (v: SchedVisit): string | number => s.k === 'when' ? `${v.date} ${String(v.start).padStart(4, '0')}` : s.k ? v[s.k] : 0;
    return [...list].sort((a, b) => {
      if (!s.k) { const x = ord(a), y = ord(b); return x < y ? -1 : x > y ? 1 : 0; }
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
    });
  });
  protected readonly rows = computed(() => (this.showAll() ? this.upcoming() : this.upcoming().slice(0, 4)));
  protected readonly allPicked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.picked().has(r.id)));

  protected readonly hostState = computed(() => {
    const f = this.f();
    const h = HOSTS.find((x) => x.name === f.host);
    if (h && !h.available) return 'Away';
    const clash = this.sched.visits().some((v) => v.id !== f.id && v.status !== 'Cancelled' && v.host === f.host && v.date === f.date && v.start < f.end && v.end > f.start);
    return clash ? 'Busy' : 'Available';
  });

  // ---------- helpers ----------
  protected top(m: number) { return ((m - H0 * 60) / 60) * ROW + 2; }
  protected height(e: SchedVisit) { return Math.max(((e.end - e.start) / 60) * ROW - 4, this.view() === 'Day' ? 46 : 66); }
  protected hLabel(h: number) { return hm(h * 60); }
  protected hmShort(m: number) { return hm(m).replace(':00', '').replace(' ', '').toLowerCase(); }
  protected dow(d: string) { return DOW[parseIso(d).getDay()]; }
  protected dm(d: string) { const x = parseIso(d); return `${x.getDate()} ${MON[x.getMonth()]}`; }
  protected longDate(d: string) { const x = parseIso(d); return `${DOW[x.getDay()]}, ${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`; }
  protected dayLabel(d: string) { return (d === this.today ? 'Today · ' : d === addDays(this.today, 1) ? 'Tomorrow · ' : '') + this.longDate(d); }
  protected when(v: SchedVisit) { return `${v.date === this.today ? 'Today' : `${this.dow(v.date)}, ${this.dm(v.date)}`} ${hm(v.start)}`; }
  protected statusIcon(s: string) {
    return ({ Confirmed: 'tasks-check-circle', 'Pending Confirmation': 'clock', Rescheduled: 'refresh', Cancelled: 'admin-x-circle', Draft: 'file-text', Completed: 'tasks-check-circle' } as Record<string, string>)[s];
  }
  protected pick(ev: Event) { try { (ev.target as HTMLInputElement).showPicker?.(); } catch { /* not supported */ } }
  protected flash(t: string) { this.toast.set(t); setTimeout(() => this.toast() === t && this.toast.set(''), 2800); }

  // ---------- navigation ----------
  protected shift(n: number) {
    const v = this.view();
    if (v === 'Month') { const d = parseIso(this.anchor()); this.anchor.set(isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1))); }
    else this.anchor.set(addDays(this.anchor(), n * (v === 'Day' ? 1 : v === 'Agenda' ? 14 : 7)));
  }
  protected setAnchor(v: string) { if (v) this.anchor.set(v); }
  protected goToday(v?: View) { this.anchor.set(this.today); if (v) this.view.set(v); }
  protected openDay(d: string) { this.anchor.set(d); this.view.set('Day'); }
  protected resetFilters() { this.q.set(''); this.fSite.set('All'); this.fHost.set('All'); this.fPurpose.set('All'); this.fStatus.set('All'); this.flash('Filters reset · schedule refreshed'); }
  protected print() { window.print(); }

  // ---------- form ----------
  private blank(date: string, start: number): Form {
    return { id: null, visitor: '', contact: '', company: '', purpose: '', host: 'Priya Sharma', site: '', date, start, end: Math.min(H1 * 60, start + 90), recurring: false, invite: true };
  }
  protected set<K extends keyof Form>(k: K, v: Form[K]) { this.f.update((f) => ({ ...f, [k]: v })); }
  protected setStart(m: number) { this.f.update((f) => ({ ...f, start: m, end: f.end <= m ? Math.min(H1 * 60, m + 60) : f.end })); }
  protected err(k: 'visitor' | 'contact' | 'company' | 'purpose' | 'site') { return this.tried() && !String(this.f()[k]).trim(); }
  protected newVisit() { this.resetForm(); this.focusForm(); }
  protected resetForm() { this.tried.set(false); this.f.set(this.blank(this.today, this.nextFree())); }
  protected slot(d: string, ev: MouseEvent) {
    const col = ev.currentTarget as HTMLElement;
    const y = ev.clientY - col.getBoundingClientRect().top;
    const m = Math.min(H1 * 60 - 30, H0 * 60 + Math.floor(((y / ROW) * 60) / 30) * 30);
    this.slotAt(d, m);
  }
  protected slotAt(d: string, m: number) {
    const keep = this.f();
    this.tried.set(false);
    this.f.set({ ...this.blank(d, m), visitor: keep.id ? '' : keep.visitor, contact: keep.id ? '' : keep.contact, company: keep.id ? '' : keep.company, purpose: keep.id ? '' : keep.purpose, host: keep.host, site: keep.id ? '' : keep.site, end: Math.min(H1 * 60, m + 60) });
    this.flash(`Slot selected: ${this.longDate(d)}, ${hm(m)} – ${hm(Math.min(H1 * 60, m + 60))}`);
    this.focusForm();
  }
  private focusForm() { setTimeout(() => (document.querySelector('.form input') as HTMLInputElement | null)?.focus(), 0); }
  protected edit(v: SchedVisit) {
    this.tried.set(false);
    this.f.set({ id: v.id, visitor: v.visitor, contact: v.contact, company: v.company, purpose: v.purpose, host: v.host, site: v.site, date: v.date, start: v.start, end: v.end, recurring: !!v.recurring, invite: !!v.invite });
    this.focusForm();
  }
  protected save(status: SchedStatus) {
    const f = this.f();
    this.tried.set(true);
    if (status !== 'Draft' && (!f.visitor.trim() || !f.contact.trim() || !f.company.trim() || !f.purpose || !f.site)) { this.flash('Please complete the required fields'); return; }
    if (status === 'Draft' && !f.visitor.trim()) { this.flash('Enter at least the visitor name to save a draft'); return; }
    if (f.end <= f.start) { this.flash('End time must be after the start time'); return; }
    const rec = { visitor: f.visitor.trim(), contact: f.contact.trim(), company: f.company.trim(), purpose: f.purpose || 'Business Meeting', host: f.host, site: f.site || hostSite(f.host), start: f.start, end: f.end, recurring: f.recurring, invite: f.invite };
    if (f.id) {
      const old = this.sched.visits().find((v) => v.id === f.id);
      const moved = old && (old.date !== f.date || old.start !== f.start);
      this.sched.visits.update((l) => l.map((v) => (v.id === f.id ? { ...v, ...rec, date: f.date, status: status === 'Draft' ? 'Draft' : moved ? 'Rescheduled' : v.status === 'Draft' ? status : v.status } : v)));
      this.flash(`${rec.visitor}'s visit updated${moved ? ' & rescheduled — visitor notified' : ''}`);
    } else {
      const n = f.recurring ? 4 : 1;
      const add: SchedVisit[] = Array.from({ length: n }, (_, i) => ({ id: 1000 + this.sched.nextId(), ...rec, date: addDays(f.date, i * 7), status }));
      this.sched.visits.update((l) => [...add, ...l]);
      if (f.date === this.today && status !== 'Draft') this.store.add({ name: rec.visitor, company: rec.company, purpose: rec.purpose, host: rec.host, site: rec.site, arrival: rec.start, departure: rec.end, email: rec.contact.includes('@') ? rec.contact : undefined, phone: rec.contact.includes('@') ? undefined : rec.contact }, 'Expected');
      this.anchor.set(f.date);
      this.flash(status === 'Draft' ? `Draft saved for ${rec.visitor}` : `Visit scheduled: ${rec.visitor}, ${this.longDate(f.date)} ${hm(f.start)}${n > 1 ? ' (4 weekly visits)' : ''}${f.invite ? ' — invitation sent' : ''}`);
    }
    this.resetForm();
  }

  // ---------- table ----------
  protected sortBy(k: SortKey) { const s = this.sort(); this.sort.set(s.k === k ? (s.dir > 0 ? { k, dir: -1 } : { k: null, dir: 1 }) : { k, dir: 1 }); }
  protected toggle(id: number) { this.picked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected pickAll(on: boolean) { this.picked.set(on ? new Set(this.rows().map((r) => r.id)) : new Set()); }
  protected setStatus(id: number, status: SchedStatus) {
    const v = this.sched.visits().find((x) => x.id === id);
    this.sched.visits.update((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    if (v) this.flash(status === 'Cancelled' ? `Visit cancelled — ${v.visitor} and ${v.host} notified` : `${v.visitor}'s visit marked ${status.toLowerCase()}`);
  }
  protected bulk(a: SchedStatus | 'remind') {
    const ids = this.picked();
    if (a === 'remind') this.flash(`Reminder sent to ${ids.size} visitor${ids.size === 1 ? '' : 's'}`);
    else { this.sched.visits.update((l) => l.map((x) => (ids.has(x.id) ? { ...x, status: a } : x))); this.flash(`${ids.size} visit${ids.size === 1 ? '' : 's'} ${a === 'Cancelled' ? 'cancelled' : 'confirmed'}`); }
    this.picked.set(new Set());
  }
  protected exportCsv() {
    const rows = this.filtered().slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    downloadCsv('visit-schedule.csv', [['Visitor', 'Company', 'Purpose', 'Host', 'Site', 'Date', 'Start', 'End', 'Status', 'Contact'], ...rows.map((v) => [v.visitor, v.company, v.purpose, v.host, v.site, v.date, hm(v.start), hm(v.end), v.status, v.contact])]);
    this.flash(`Exported ${rows.length} visits`);
  }
  protected importFile(src?: string) {
    if (!src) return;
    const ws = addDays(weekStart(this.today), 7);
    const add: SchedVisit[] = [
      { visitor: 'Grace Park', company: 'Vertex Systems', purpose: 'Project Discussion', host: 'Michael Chen', site: SITES[0], date: ws, start: 600, end: 660 },
      { visitor: 'Omar Yusuf', company: 'PwC', purpose: 'Audit', host: 'Maria Santos', site: SITES[0], date: addDays(ws, 1), start: 690, end: 780 },
      { visitor: 'Emily Clark', company: 'Siemens', purpose: 'Training', host: 'Fatima Ali', site: SITES[2], date: addDays(ws, 3), start: 840, end: 960 },
    ].map((v) => ({ ...v, id: 1000 + this.sched.nextId(), contact: `${v.visitor.toLowerCase().replace(' ', '.')}@mail.com`, status: 'Confirmed' as SchedStatus, invite: true }));
    this.sched.visits.update((l) => [...add, ...l]);
    this.importOpen.set(false);
    this.anchor.set(ws); this.view.set('Week');
    this.flash(`Imported 3 visits from ${src}`);
  }
}

const hostSite = (n: string) => HOSTS.find((h) => h.name === n)?.site ?? SITES[0];
