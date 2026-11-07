import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { HOSTS, hm } from './vm.data';
import { GV_AREAS, GV_BADGES, GV_SITES, GroupStatus, GroupVisit, GroupVisitStore, makeGuests } from './vm-group-vip.data';

type Tab = 'All Visits' | 'Group Visits' | 'VIP Visits' | 'Today' | 'Upcoming';
type SortKey = 'name' | 'host' | 'guests' | 'site' | 'arrival' | 'status';
interface Setup { id: number | null; name: string; host: string; type: 'VIP' | 'Group'; site: string; start: number; guests: number; badge: string; areas: string[]; transport: boolean; file: string; vipName: string }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-vm-group-vip',
  imports: [Icon, SelectValue, ...VM_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)' },
  template: `
  <div class="vm-page">
    <nav class="crumb"><app-icon name="home" [size]="15" /><app-icon name="chevron-right" [size]="13" /><span>Visitor Management</span><app-icon name="chevron-right" [size]="13" /><b>Group / VIP Visits</b></nav>
    <header class="vm-head">
      <div>
        <h1>Group / VIP Visits</h1>
        <p>Coordinate high-touch visits, group arrivals, and VIP experiences with confidence.</p>
      </div>
      <div class="vm-actions">
        <button class="btn-primary hb" (click)="create('Group')"><app-icon name="plus" [size]="18" />Create Group Visit</button>
        <button class="btn-outline hb" (click)="create('VIP')"><app-icon name="plus" [size]="18" />Add VIP Visit</button>
        <button class="btn-outline hb dark" (click)="exportCsv()"><app-icon name="download" [size]="18" />Export</button>
        <div class="menu-wrap">
          <button class="vm-icon-btn tall" (click)="$event.stopPropagation(); menu.set(menu() === 'more' ? null : 'more')"><app-icon name="more" [size]="18" /></button>
          @if (menu() === 'more') {
            <div class="dropdown" (click)="$event.stopPropagation()">
              <button class="dd-item" (click)="menu.set(null); briefAll()"><app-icon name="p-send" [size]="15" />Send all briefings for today</button>
              <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="reports-printer" [size]="15" />Print today's roster</button>
            </div>
          }
        </div>
      </div>
    </header>

    <section class="vm-kpis">
      <vm-kpi label="Active Group Visits" [value]="kpi().active" icon="users" color="#7c3aed" [clickable]="true" [active]="tab() === 'Group Visits'" (pick)="tab.set('Group Visits')" />
      <vm-kpi label="VIP Visits Today" [value]="kpi().vip" icon="star" color="#16a34a" [clickable]="true" [active]="tab() === 'VIP Visits'" (pick)="tab.set('VIP Visits')" />
      <vm-kpi label="Guests Expected" [value]="kpi().guests" icon="users" color="#dc2626" />
      <vm-kpi label="Hosts Assigned" [value]="kpi().hosts" icon="square-user" color="#2563eb" />
    </section>

    <div class="vm-bar">
      <vm-tabs [tabs]="tabs" [value]="tab()" (change)="tab.set($any($event))" />
      <span class="vm-sep"></span>
      <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search group, VIP, host, organization..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <label class="vm-filter"><app-icon name="map-pin" [size]="16" /><span>Site:</span>
        <select [value]="fSite()" (change)="fSite.set($any($event.target).value)"><option value="All">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <label class="vm-filter"><app-icon name="layers" [size]="16" /><span>Visit Type:</span>
        <select [value]="fType()" (change)="fType.set($any($event.target).value)"><option>All</option><option>VIP</option><option>Group</option></select></label>
      <label class="vm-filter"><app-icon name="w-calendar" [size]="16" /><span>Date:</span>
        <select [value]="fDate()" (change)="fDate.set($any($event.target).value)"><option>Today</option><option>Tomorrow</option><option>All</option></select></label>
      <label class="vm-filter"><app-icon name="sliders" [size]="16" /><span>Status:</span>
        <select [value]="fStatus()" (change)="fStatus.set($any($event.target).value)"><option>All</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
      <button class="vm-icon-btn" title="Reset filters" (click)="reset()"><app-icon name="refresh" [size]="16" /></button>
    </div>

    <div class="top">
      <section class="vm-card">
        <div class="vm-card-head"><h2><app-icon name="w-calendar" [size]="24" />{{ fDate() === 'Today' ? "Today's" : fDate() === 'Tomorrow' ? "Tomorrow's" : 'All' }} Group &amp; VIP Visits</h2></div>
        <div class="today">
          @for (g of active(); track g.id) {
            <div class="tv" [class.sel]="g.id === setupFor()" (click)="select(g)">
              <div class="tm">{{ hm(g.start) }} –<br />{{ hm(g.end) }}</div>
              <div class="tinfo">
                <b class="tn">{{ g.name }} <span class="tag" [class.vip]="g.type === 'VIP'"><app-icon [name]="g.type === 'VIP' ? 'star' : 'users'" [size]="13" />{{ g.type }}</span></b>
                <div class="tmeta">
                  <span><app-icon name="users" [size]="14" />{{ g.guests.length }} guests</span><span><app-icon name="building" [size]="14" />{{ g.type === 'Group' ? g.site : g.org }}</span>
                  <span><app-icon name="user" [size]="14" />{{ g.host }}</span>@if (g.type === 'VIP') {<span><app-icon name="map-pin" [size]="14" />{{ g.site }}</span>}
                </div>
              </div>
              <div class="stack">@for (p of g.guests.slice(0, 3); track $index) {<vm-avatar [name]="p.name" [size]="30" />}@if (g.guests.length > 3) {<span class="plus">+{{ g.guests.length - 3 }}</span>}</div>
              <div class="acc">
                <span class="acc-chip">Access: {{ g.access }}</span>
                @if (g.status === 'In Progress') {<small>{{ checked(g) }} of {{ g.guests.length }} checked in</small><div class="vm-progress"><i [style.width.%]="pct(g)"></i></div>}
              </div>
              <vm-status [label]="g.status" [icon]="sIcon(g.status)" [tone]="g.status === 'Upcoming' ? 'blue' : undefined" />
              <div class="tacts" (click)="$event.stopPropagation()">
                <button class="vm-mini" (click)="open(g)"><app-icon [name]="g.status === 'In Progress' ? 'eye' : 'file-text'" [size]="14" />{{ g.status === 'In Progress' ? 'View Visit' : 'View Plan' }}</button>
                @if (g.type === 'VIP' && g.status === 'Upcoming') {<button class="vm-mini" (click)="notify(g)"><app-icon name="p-send" [size]="14" />Notify Team</button>}
                @else {<button class="vm-mini" (click)="manage(g)"><app-icon name="users" [size]="14" />Manage Guests</button>}
              </div>
            </div>
          } @empty {<div class="vm-empty">No in-progress or upcoming group / VIP visits for these filters.</div>}
        </div>
      </section>

      <section class="vm-card brief">
        @if (briefG(); as b) {
          <div class="vm-card-head"><h2><app-icon name="star" [size]="24" />VIP Visit Brief</h2><span class="spacer"></span><span class="conf"><app-icon name="admin-lock" [size]="14" />Confidential</span></div>
          <div class="bgrid">
            <vm-avatar [name]="b.vip!.name" [size]="78" [square]="true" />
            <div class="who">
              <b class="vn">{{ b.vip!.name }} <span class="tag vip"><app-icon name="star" [size]="13" />VIP</span></b>
              <span><app-icon name="building" [size]="14" />{{ b.vip!.org }}</span>
              <span><app-icon name="user" [size]="14" />Host: {{ b.host }}</span>
              <span><app-icon name="locate" [size]="14" />Visit Purpose: {{ b.vip!.purpose }}</span>
              <span><app-icon name="map-pin" [size]="14" />Site: {{ longSite(b.site) }}</span>
              <span><app-icon name="w-calendar" [size]="14" />{{ dateOf(b.day) }} · {{ hm(b.start) }}–{{ hm(b.end) }}</span>
            </div>
            <div class="proto">
              <b>Arrival Protocol</b>
              @for (p of b.vip!.protocol; track p.label; let i = $index) {
                <button class="pi" [class.done]="p.done" (click)="toggleProto(b, i)" [title]="editProto() ? 'Remove' : 'Toggle'">
                  <i><app-icon [name]="p.done ? 'tasks-check' : 'minus'" [size]="11" [stroke]="3" /></i>{{ p.label }}
                  @if (editProto()) {<span class="rm" (click)="$event.stopPropagation(); removeProto(b, i)">×</span>}
                </button>
              }
              @if (editProto()) {
                <div class="addp"><input #np placeholder="Add protocol step" (keydown.enter)="addProto(b, np.value); np.value = ''" /><button class="vm-mini" (click)="addProto(b, np.value); np.value = ''">Add</button></div>
              }
            </div>
          </div>
          <div class="areas"><b><app-icon name="layers" [size]="16" />Access Areas</b>
            <div>@for (a of b.areas; track a) {<span class="vm-chip">{{ a }}</span>}</div></div>
          <div class="bacts">
            <button class="btn-primary" (click)="open(b)"><app-icon name="file-text" [size]="17" />Open Visit Plan</button>
            <button class="btn-outline" [class.on]="editProto()" (click)="editProto.set(!editProto())"><app-icon name="tasks-pencil" [size]="17" />{{ editProto() ? 'Done Editing' : 'Edit Protocol' }}</button>
          </div>
          @if (vipList().length > 1) {
            <div class="vnav">@for (v of vipList(); track v.id) {<button [class.on]="v.id === b.id" (click)="briefId.set(v.id)" [title]="v.name"></button>}</div>
          }
        } @else {<div class="vm-empty">No VIP visits scheduled.</div>}
      </section>
    </div>

    <section class="vm-card setup">
      <div class="vm-card-head"><h2><app-icon name="users" [size]="24" />Group Visit Setup</h2>
        <span class="selchip">{{ s().id ? 'Selected:' : 'New:' }} <b>{{ s().name || (s().type === 'VIP' ? 'New VIP visit' : 'New group visit') }}</b></span>
        @if (dirty()) {<small class="dirty">Unsaved changes</small>}
      </div>
      <div class="sg">
        <div class="vm-field"><label>Group name <b>*</b></label><div class="vm-input" [class.err]="tried() && !s().name.trim()"><input placeholder="Enter group name" [value]="s().name" (input)="set('name', $any($event.target).value)" /></div></div>
        <div class="vm-field"><label>Lead host <b>*</b></label><div class="vm-input"><app-icon name="user" [size]="16" />
          <select [value]="s().host" (change)="set('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></div></div>
        <div class="vm-field"><label>Visit type <b>*</b></label><div class="vm-input"><app-icon [name]="s().type === 'VIP' ? 'star' : 'users'" [size]="16" [class.gold]="s().type === 'VIP'" />
          <select [value]="s().type" (change)="set('type', $any($event.target).value)"><option>VIP</option><option>Group</option></select></div></div>
        <div class="vm-field"><label>Main site <b>*</b></label><div class="vm-input"><app-icon name="map-pin" [size]="16" />
          <select [value]="s().site" (change)="set('site', $any($event.target).value)">@for (x of sites; track x) {<option [value]="x">{{ x }}</option>}</select></div></div>
        <div class="vm-field"><label>Arrival time <b>*</b></label><div class="vm-input"><app-icon name="w-calendar" [size]="16" />
          <select [value]="s().start" (change)="set('start', +$any($event.target).value)">@for (t of times; track t) {<option [value]="t">{{ hm(t) }}</option>}</select></div></div>
        <div class="vm-field"><label>Expected guests <b>*</b></label><div class="vm-input"><app-icon name="users" [size]="16" />
          <input type="number" min="1" max="200" [value]="s().guests" (input)="set('guests', Math.max(1, +$any($event.target).value || 1))" /></div></div>
      </div>
      <div class="sg2">
        <div class="vm-field"><label>Guest upload (CSV) <b>*</b></label>
          <label class="drop" [class.has]="s().file"><app-icon [name]="s().file ? 'file-check' : 'tasks-upload'" [size]="22" />
            <span>@if (s().file) {<b>{{ s().file }}</b><small>{{ s().guests }} guests parsed · click to replace</small>} @else {Drag &amp; drop a CSV file here, or <em>click to browse</em><small>CSV, XLSX (Max 5 MB)</small>}</span>
            <input type="file" accept=".csv,.xlsx" (change)="upload($any($event.target).files?.[0]?.name)" /></label></div>
        <div class="vm-field"><label>Badge template</label><div class="vm-input"><app-icon name="vm-b-badge-id" [size]="16" />
          <select [value]="s().badge" (change)="set('badge', $any($event.target).value)">@for (x of badges; track x) {<option [value]="x">{{ x }}</option>}</select></div></div>
        <div class="vm-field"><label>Common access areas <b>*</b></label>
          <div class="vm-input chips" [class.err]="tried() && !s().areas.length">
            @for (a of s().areas; track a) {<span class="vm-chip">{{ a }}<button (click)="toggleArea(a)">×</button></span>}
            <select class="addsel" [value]="''" (change)="toggleArea($any($event.target).value); $any($event.target).value = ''"><option value="">{{ s().areas.length ? '' : 'Select areas' }}</option>@for (a of areaOpts(); track a) {<option [value]="a">{{ a }}</option>}</select>
          </div></div>
        <div class="vm-field"><label>Transport / parking required</label>
          <div class="tp"><button class="vm-switch" [class.on]="s().transport" (click)="set('transport', !s().transport)"></button>{{ s().transport ? 'Yes' : 'No' }}</div></div>
        <button class="btn-primary sb" (click)="save()"><app-icon name="twin-save" [size]="17" />Save Group Plan</button>
        <button class="btn-outline sb" (click)="sendBriefing()"><app-icon name="p-send" [size]="17" />Send Briefing</button>
      </div>
    </section>

    <section class="vm-card">
      <div class="vm-card-head"><h2><app-icon name="users" [size]="24" />Visit Roster &amp; Progress</h2>
        @if (picked().size) {
          <span class="bulk"><b>{{ picked().size }} selected</b>
            <button class="vm-mini" (click)="bulkBrief()"><app-icon name="p-send" [size]="13" />Send briefing</button>
            <button class="vm-mini red" (click)="bulkCancel()"><app-icon name="tasks-x" [size]="13" />Cancel</button></span>
        }
        <span class="spacer"></span><small class="muted">{{ roster().length }} visits</small>
      </div>
      <table class="vm-table">
        <thead><tr>
          <th class="cb"><input type="checkbox" [checked]="allPicked()" (change)="pickAll($any($event.target).checked)" /></th>
          @for (c of cols; track c.k) {<th class="sort" (click)="sortBy(c.k)">{{ c.l }} <app-icon [name]="sort().k === c.k ? (sort().dir > 0 ? 'arrow-up' : 'arrow-down') : 'vm-b-sort'" [size]="13" /></th>
            @if (c.k === 'arrival') {<th>Check-in Progress</th>}}
          <th>Actions</th>
        </tr></thead>
        <tbody>
          @for (g of roster(); track g.id) {
            <tr [class.sel]="g.id === setupFor() || picked().has(g.id)" class="click" (click)="select(g)">
              <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="picked().has(g.id)" (change)="toggle(g.id)" /></td>
              <td><span class="gn"><app-icon [name]="g.type === 'VIP' ? 'star' : 'users'" [size]="17" [class.gold]="g.type === 'VIP'" [class.pur]="g.type === 'Group'" />{{ g.name }}
                <span class="tag sm" [class.vip]="g.type === 'VIP'"><app-icon [name]="g.type === 'VIP' ? 'star' : 'users'" [size]="11" />{{ g.type }}</span></span></td>
              <td><span class="ic"><app-icon name="user" [size]="15" />{{ g.host }}</span></td>
              <td>{{ g.guests.length }}</td>
              <td><span class="ic"><app-icon name="map-pin" [size]="15" />{{ g.site }}</span></td>
              <td><span class="ic"><app-icon name="w-calendar" [size]="15" />{{ arrival(g) }}</span></td>
              <td><span class="prog"><span>{{ checked(g) }} of {{ g.guests.length }} ({{ pct(g) }}%)</span><span class="vm-progress"><i [style.width.%]="pct(g)"></i></span></span></td>
              <td><vm-status [label]="g.status" [icon]="sIcon(g.status)" [tone]="g.status === 'Upcoming' ? 'blue' : undefined" /></td>
              <td (click)="$event.stopPropagation()"><span class="vm-acts">
                <button class="vm-mini" (click)="open(g)"><app-icon name="eye" [size]="13" />View</button>
                <button class="vm-mini" (click)="select(g, true)"><app-icon name="tasks-pencil" [size]="13" />Edit</button>
                @if (g.status !== 'Completed' && g.status !== 'Cancelled') {<button class="vm-mini" (click)="cancelId.set(g.id)"><app-icon name="tasks-x" [size]="13" />Cancel</button>}
              </span></td>
            </tr>
          } @empty {<tr><td colspan="9" class="vm-empty">No group or VIP visits match the current filters.</td></tr>}
        </tbody>
      </table>
    </section>
  </div>

  @if (drawerG(); as g) {
    <div class="g-overlay" (click)="drawer.set(null)"></div>
    <aside class="g-drawer wide">
      <div class="modal-head"><h3>{{ g.name }}</h3><button class="close-btn" (click)="drawer.set(null)">×</button></div>
      <div class="dtabs"><vm-tabs [tabs]="['Visit Plan', 'Guests']" [value]="drawerTab()" (change)="drawerTab.set($any($event))" /></div>
      @if (drawerTab() === 'Visit Plan') {
        <div class="vm-kv">
          <span><app-icon name="layers" [size]="15" />Type</span><b>{{ g.type }} · Access {{ g.access }}</b>
          <span><app-icon name="building" [size]="15" />Organization</span><b>{{ g.org }}</b>
          <span><app-icon name="user" [size]="15" />Lead host</span><b>{{ g.host }}</b>
          <span><app-icon name="map-pin" [size]="15" />Site</span><b>{{ g.site }}</b>
          <span><app-icon name="w-calendar" [size]="15" />When</span><b>{{ dateOf(g.day) }} · {{ hm(g.start) }} – {{ hm(g.end) }}</b>
          <span><app-icon name="vm-b-badge-id" [size]="15" />Badge</span><b>{{ g.badge }}</b>
          <span><app-icon name="truck" [size]="15" />Transport</span><b>{{ g.transport ? 'Parking & shuttle reserved' : 'Not required' }}</b>
        </div>
        <h4>Itinerary</h4>
        <ol class="itin">
          @for (it of itinerary(g); track it.t) {<li [class.done]="it.done"><span>{{ hm(it.t) }}</span><b>{{ it.what }}</b><small>{{ it.where }}</small></li>}
        </ol>
      } @else {
        <div class="ghead"><b>{{ checked(g) }} of {{ g.guests.length }} checked in</b><div class="vm-progress"><i [style.width.%]="pct(g)"></i></div>
          @if (g.status !== 'Cancelled') {<button class="vm-mini fill" (click)="checkAll(g)">Check in all</button>}</div>
        <div class="glist">
          @for (p of g.guests; track $index; let i = $index) {
            <div class="grow"><vm-avatar [name]="p.name" [size]="30" /><span><b>{{ p.name }}</b><small>{{ p.company }}</small></span>
              @if (p.in) {<vm-status label="Checked In" />} @else {<vm-status label="Expected" />}
              <button class="vm-mini" [disabled]="g.status === 'Cancelled'" (click)="checkGuest(g, i)">{{ p.in ? 'Undo' : 'Check in' }}</button></div>
          }
        </div>
        <div class="addg"><input #gn placeholder="Add guest name" (keydown.enter)="addGuest(g, gn.value); gn.value = ''" /><button class="vm-mini" (click)="addGuest(g, gn.value); gn.value = ''">Add guest</button></div>
      }
    </aside>
  }
  @if (cancelG(); as g) {
    <div class="g-overlay" (click)="cancelId.set(null)"></div>
    <div class="g-modal small">
      <div class="modal-head"><h3>Cancel visit?</h3><button class="close-btn" (click)="cancelId.set(null)">×</button></div>
      <p><b>{{ g.name }}</b> ({{ g.guests.length }} guests) will be cancelled. {{ g.host }}, security and all guests will be notified.</p>
      <div class="form-actions"><button class="btn-outline" (click)="cancelId.set(null)">Keep</button><button class="vm-btn-danger" (click)="setStatus([g.id], 'Cancelled'); cancelId.set(null)">Cancel visit</button></div>
    </div>
  }
  @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: -8px; } .crumb app-icon { color: #475569; }
    .hb { height: 40px; padding: 0 18px; font-size: 15px; }
    .dark { color: var(--text); border-color: var(--border); }
    .vm-icon-btn.tall { height: 40px; }
    .vm-search { min-width: 180px; }
    .vm-filter select { max-width: 110px; }
    .top { display: grid; grid-template-columns: minmax(0, 1.72fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
    .today { display: flex; flex-direction: column; gap: 8px; }
    .tv { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto 128px 112px 118px; gap: 12px; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; background: #fff; }
    .tv:hover { border-color: #c4b5fd; } .tv.sel { border-color: var(--primary); background: #faf8ff; box-shadow: 0 0 0 2px #ede9fe; }
    .tm { font-weight: 700; font-size: 13px; line-height: 1.35; padding: 6px 4px; border-radius: 8px; background: #f4f2fb; text-align: center; border-right: 3px solid var(--primary); }
    .tinfo { min-width: 0; }
    .tn { display: flex; align-items: center; gap: 8px; font-size: 14.5px; white-space: nowrap; overflow: hidden; }
    .tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #ede9fe; color: #6d28d9; flex: none; }
    .tag.vip { background: #fef3c7; color: #92400e; } .tag.vip app-icon { color: #d97706; }
    .tag.sm { font-size: 11px; padding: 1px 6px; }
    .tmeta { display: grid; grid-template-columns: auto auto; gap: 2px 18px; font-size: 12.5px; margin-top: 3px; justify-content: start; }
    .tmeta span { display: flex; align-items: center; gap: 6px; white-space: nowrap; } .tmeta app-icon { color: #475569; }
    .stack { display: flex; align-items: center; } .stack vm-avatar { margin-left: -8px; border: 2px solid #fff; box-sizing: content-box; } .stack vm-avatar:first-child { margin-left: 0; }
    .plus { margin-left: -6px; width: 30px; height: 30px; border-radius: 50%; background: #f1f5f9; border: 2px solid #fff; display: grid; place-items: center; font-size: 11.5px; font-weight: 600; }
    .acc { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
    .acc-chip { background: #f1edff; border-radius: 6px; padding: 3px 8px; font-size: 12px; align-self: flex-start; white-space: nowrap; }
    .acc .vm-progress { height: 7px; }
    .tacts { display: flex; flex-direction: column; gap: 6px; } .tacts .vm-mini { justify-content: center; height: 26px; }
    .brief .vm-card-head h2 app-icon { color: var(--primary); }
    .conf { display: inline-flex; align-items: center; gap: 6px; background: #fef3c7; color: #92400e; border-radius: 6px; padding: 3px 10px; font-size: 12.5px; font-weight: 600; }
    .bgrid { display: grid; grid-template-columns: 78px minmax(0, 1fr) auto; gap: 12px; }
    .who { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; min-width: 0; }
    .who span { display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .who app-icon { color: #475569; }
    .vn { display: flex; align-items: center; gap: 8px; font-size: 17px; margin-bottom: 2px; }
    .proto { display: flex; flex-direction: column; gap: 4px; border-left: 1px solid var(--border); padding-left: 12px; font-size: 12.5px; }
    .proto > b { font-size: 14px; margin-bottom: 2px; }
    .pi { display: flex; align-items: center; gap: 7px; background: none; border: 0; padding: 1px 0; font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; white-space: nowrap; color: var(--text); }
    .pi i { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; background: #cbd5e1; color: #fff; }
    .pi.done i { background: #22c55e; }
    .pi:not(.done) { color: var(--muted); }
    .rm { color: #dc2626; font-weight: 700; margin-left: 4px; }
    .addp { display: flex; gap: 4px; } .addp input { width: 110px; border: 1px solid var(--border); border-radius: 6px; font: inherit; font-size: 12px; padding: 2px 6px; }
    .areas { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; font-size: 13px; }
    .areas b { display: flex; align-items: center; gap: 6px; } .areas b app-icon { color: #475569; }
    .areas div { display: flex; gap: 8px; flex-wrap: wrap; padding-left: 22px; } .areas .vm-chip { padding: 4px 12px; }
    .bacts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .bacts button { height: 40px; justify-content: center; font-size: 15px; }
    .bacts .on { background: #f5f0ff; }
    .vnav { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
    .vnav button { width: 8px; height: 8px; border-radius: 50%; border: 0; background: #ddd6fe; cursor: pointer; padding: 0; } .vnav button.on { background: var(--primary); width: 20px; border-radius: 4px; }
    .selchip { background: #f1edff; border-radius: 6px; padding: 4px 12px; font-size: 13px; color: var(--text); margin-left: 6px; } .selchip b { color: var(--primary); font-weight: 600; }
    .dirty { color: #c2410c; font-size: 12px; font-weight: 600; }
    .sg { display: grid; grid-template-columns: 1.15fr 1fr 1fr 1.3fr 1fr .85fr; gap: 10px 22px; }
    .sg2 { display: grid; grid-template-columns: 1.15fr 0.65fr 1.3fr .6fr auto auto; gap: 10px 22px; align-items: end; margin-top: 8px; }
    .setup .vm-field > label { font-weight: 600; font-size: 13px; }
    .gold { color: #d97706 !important; } .pur { color: #2563eb; }
    .drop { position: relative; display: flex; align-items: center; gap: 14px; border: 1.5px dashed #a78bfa; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 12.5px; background: #fcfbff; min-height: 42px; }
    .drop > app-icon { color: #334155; } .drop.has { border-style: solid; background: #f5f0ff; } .drop.has > app-icon { color: var(--primary); }
    .drop span { display: flex; flex-direction: column; } .drop em { font-style: normal; color: var(--primary); } .drop small { color: var(--muted); font-size: 11.5px; }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .chips { height: auto; min-height: 36px; flex-wrap: wrap; padding: 4px 6px; gap: 6px; }
    .chips .vm-chip { padding: 2px 8px; }
    .addsel { flex: 1; min-width: 24px; height: 26px !important; }
    .tp { display: flex; align-items: center; gap: 12px; height: 36px; font-size: 13.5px; }
    .sb { height: 40px; padding: 0 22px; font-size: 14.5px; white-space: nowrap; }
    .cb { width: 30px; } .cb input { width: 16px; height: 16px; accent-color: var(--primary); }
    .gn { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; white-space: nowrap; }
    .ic { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; } .ic app-icon { color: #475569; }
    .prog { display: flex; align-items: center; gap: 8px; white-space: nowrap; } .prog .vm-progress { width: 90px; flex: none; }
    .vm-acts .vm-mini { height: 25px; padding: 0 10px; }
    .vm-mini[disabled] { opacity: .4; cursor: default; }
    .bulk { display: inline-flex; gap: 6px; align-items: center; margin-left: 12px; font-size: 13px; }
    .muted { color: var(--muted); }
    .dtabs { margin-bottom: 14px; }
    h4 { margin: 18px 0 8px; }
    .itin { list-style: none; padding: 0; margin: 0; border-left: 2px solid #ddd6fe; }
    .itin li { display: grid; grid-template-columns: 74px 1fr; gap: 0 10px; padding: 4px 0 8px 14px; position: relative; font-size: 13px; }
    .itin li::before { content: ''; position: absolute; left: -6px; top: 8px; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid #a78bfa; }
    .itin li.done::before { background: #22c55e; border-color: #22c55e; }
    .itin span { font-weight: 600; color: var(--primary); } .itin small { grid-column: 2; color: var(--muted); }
    .ghead { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; margin-bottom: 10px; font-size: 13px; }
    .glist { display: flex; flex-direction: column; }
    .grow { display: grid; grid-template-columns: 30px 1fr auto 70px; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f6; font-size: 13px; }
    .grow span { display: flex; flex-direction: column; } .grow small { color: var(--muted); }
    .grow .vm-mini { justify-content: center; }
    .addg { display: flex; gap: 8px; margin-top: 12px; } .addg input { flex: 1; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 13px; }
    .g-modal.small { width: min(460px, calc(100vw - 32px)); }
    @media (max-width: 1400px) { .top { grid-template-columns: 1fr; } .sg, .sg2 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class GroupVipVisits {
  private readonly store = inject(GroupVisitStore);
  private readonly app = inject(AppState);
  protected readonly hm = hm;
  protected readonly Math = Math;
  protected readonly tabs: Tab[] = ['All Visits', 'Group Visits', 'VIP Visits', 'Today', 'Upcoming'];
  protected readonly statuses: GroupStatus[] = ['In Progress', 'Upcoming', 'Completed', 'Cancelled'];
  protected readonly sites = GV_SITES;
  protected readonly hosts = HOSTS;
  protected readonly badges = GV_BADGES;
  protected readonly times = Array.from({ length: 23 }, (_, i) => 420 + i * 30);
  protected readonly cols: { k: SortKey; l: string }[] = [{ k: 'name', l: 'Group / VIP' }, { k: 'host', l: 'Lead Host' }, { k: 'guests', l: 'Guests' }, { k: 'site', l: 'Site' }, { k: 'arrival', l: 'Arrival' }, { k: 'status', l: 'Status' }];

  protected readonly tab = signal<Tab>('All Visits');
  protected readonly q = signal('');
  protected readonly fSite = signal('All');
  protected readonly fType = signal('All');
  protected readonly fDate = signal('Today');
  protected readonly fStatus = signal('All');
  protected readonly menu = signal<string | null>(null);
  protected readonly toast = signal('');
  protected readonly picked = signal(new Set<number>());
  protected readonly sort = signal<{ k: SortKey | null; dir: number }>({ k: null, dir: 1 });
  protected readonly setupFor = signal<number | null>(1);
  protected readonly briefId = signal(2);
  protected readonly editProto = signal(false);
  protected readonly drawer = signal<number | null>(null);
  protected readonly drawerTab = signal('Visit Plan');
  protected readonly cancelId = signal<number | null>(null);
  protected readonly tried = signal(false);
  protected readonly s = signal<Setup>(this.toSetup(this.store.groups()[0]));
  private readonly seedTotals = this.totals();

  protected readonly drawerG = computed(() => this.store.groups().find((g) => g.id === this.drawer()) ?? null);
  protected readonly cancelG = computed(() => this.store.groups().find((g) => g.id === this.cancelId()) ?? null);
  protected readonly vipList = computed(() => this.store.groups().filter((g) => g.vip && g.status !== 'Cancelled'));
  protected readonly briefG = computed(() => this.store.groups().find((g) => g.id === this.briefId() && g.vip) ?? this.vipList()[0] ?? null);
  protected readonly areaOpts = computed(() => GV_AREAS.filter((a) => !this.s().areas.includes(a)));
  protected readonly dirty = computed(() => {
    const id = this.s().id; const g = this.store.groups().find((x) => x.id === id);
    return !g ? !!this.s().name : JSON.stringify(this.toSetup(g)) !== JSON.stringify({ ...this.s() });
  });

  private readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const t = this.tab();
    return this.store.groups().filter((g) =>
      (t === 'All Visits' || (t === 'Group Visits' && g.type === 'Group') || (t === 'VIP Visits' && g.type === 'VIP') || (t === 'Today' && g.day === 0) || (t === 'Upcoming' && g.status === 'Upcoming')) &&
      (this.fSite() === 'All' || g.site === this.fSite()) && (this.fType() === 'All' || g.type === this.fType()) && (this.fStatus() === 'All' || g.status === this.fStatus()) &&
      (!q || `${g.name} ${g.org} ${g.host} ${g.site} ${g.vip?.name ?? ''}`.toLowerCase().includes(q)));
  });
  protected readonly active = computed(() => this.filtered().filter((g) => (this.fDate() === 'All' || g.day === (this.fDate() === 'Today' ? 0 : 1)) && (g.status === 'In Progress' || g.status === 'Upcoming')).sort((a, b) => a.day - b.day || a.start - b.start));
  protected readonly roster = computed(() => {
    const s = this.sort();
    const l = this.filtered();
    if (!s.k) return l;
    const key = (g: GroupVisit): string | number => s.k === 'guests' ? g.guests.length : s.k === 'arrival' ? g.day * 1440 + g.start : (g[s.k as 'name'] as string);
    return [...l].sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * s.dir; });
  });
  protected readonly allPicked = computed(() => this.roster().length > 0 && this.roster().every((g) => this.picked().has(g.id)));
  protected readonly kpi = computed(() => {
    const t = this.totals(), b = this.seedTotals;
    return { active: 8 + t.active - b.active, vip: 6 + t.vip - b.vip, guests: 124 + t.guests - b.guests, hosts: 18 + t.hosts - b.hosts };
  });

  private totals() {
    const live = this.store.groups().filter((g) => g.status !== 'Cancelled');
    const today = live.filter((g) => g.day === 0);
    return {
      active: live.filter((g) => g.status === 'In Progress' || g.status === 'Upcoming').length,
      vip: today.filter((g) => g.type === 'VIP').length,
      guests: today.filter((g) => g.status !== 'Completed').reduce((s, g) => s + g.guests.length - g.guests.filter((x) => x.in).length, 0),
      hosts: new Set(live.map((g) => g.host)).size,
    };
  }

  // ---------- display helpers ----------
  protected checked(g: GroupVisit) { return g.guests.filter((x) => x.in).length; }
  protected pct(g: GroupVisit) { return g.guests.length ? Math.round((this.checked(g) / g.guests.length) * 100) : 0; }
  protected sIcon(s: string) { return ({ 'In Progress': 'tasks-check-circle', Upcoming: 'clock', Completed: 'tasks-check-circle', Cancelled: 'admin-x-circle' } as Record<string, string>)[s]; }
  protected dateOf(day: number) { const d = new Date(this.app.date()); d.setDate(d.getDate() + day); return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }
  protected arrival(g: GroupVisit) { return g.day === 0 ? `${hm(g.start)} – ${hm(g.end)}` : `${this.dateOf(g.day).replace(/ \d{4}$/, '')} · ${hm(g.start)}`; }
  protected longSite(s: string) { return s === 'Executive Entrance' ? 'Executive Entrance – Tower A' : s; }
  protected itinerary(g: GroupVisit) {
    const st = g.start, on = g.status === 'Completed' || g.status === 'In Progress';
    const steps = g.type === 'VIP'
      ? [['Arrival & welcome by ' + g.host, g.site], ['Security fast-track & badge handover', 'Executive Entrance'], ['Refreshments', 'Visitor Lounge'], ['Executive meeting', g.areas[1] ?? 'Boardroom'], ['Escorted departure', 'Executive Entrance']]
      : [['Group check-in & badge printing', g.site], ['Safety induction briefing', g.areas[0] ?? 'Training Room'], ['Escorted site walk', g.areas[1] ?? 'Plant Floor'], ['Wrap-up & check-out', 'Main Entrance']];
    const span = Math.max(30, g.end - st);
    return steps.map(([what, where], i) => ({ t: st + Math.round((span / steps.length) * i / 15) * 15, what, where, done: g.status === 'Completed' || (on && i === 0) }));
  }
  protected flash(t: string) { this.toast.set(t); setTimeout(() => this.toast() === t && this.toast.set(''), 2800); }
  protected print() { window.print(); }

  // ---------- filters / selection ----------
  protected reset() { this.tab.set('All Visits'); this.q.set(''); this.fSite.set('All'); this.fType.set('All'); this.fDate.set('Today'); this.fStatus.set('All'); this.flash('Filters reset'); }
  protected select(g: GroupVisit, scroll = false) {
    this.setupFor.set(g.id); this.s.set(this.toSetup(g)); this.tried.set(false);
    if (g.vip) this.briefId.set(g.id);
    if (scroll) setTimeout(() => document.querySelector('.setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  protected open(g: GroupVisit) { this.drawer.set(g.id); this.drawerTab.set('Visit Plan'); }
  protected manage(g: GroupVisit) { this.drawer.set(g.id); this.drawerTab.set('Guests'); }
  protected notify(g: GroupVisit) { this.flash(`Team notified: ${g.host}, security & reception briefed for ${g.name}`); }
  protected sortBy(k: SortKey) { const s = this.sort(); this.sort.set(s.k === k ? (s.dir > 0 ? { k, dir: -1 } : { k: null, dir: 1 }) : { k, dir: 1 }); }
  protected toggle(id: number) { this.picked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected pickAll(on: boolean) { this.picked.set(on ? new Set(this.roster().map((g) => g.id)) : new Set()); }

  // ---------- mutations ----------
  private patch(id: number, f: (g: GroupVisit) => GroupVisit) { this.store.groups.update((l) => l.map((g) => (g.id === id ? f(g) : g))); }
  protected setStatus(ids: number[], status: GroupStatus) {
    this.store.groups.update((l) => l.map((g) => (ids.includes(g.id) ? { ...g, status } : g)));
    this.flash(ids.length === 1 ? `${this.store.groups().find((g) => g.id === ids[0])?.name} ${status.toLowerCase()} — host & guests notified` : `${ids.length} visits ${status.toLowerCase()}`);
  }
  protected bulkCancel() { const ids = [...this.picked()].filter((id) => { const g = this.store.groups().find((x) => x.id === id); return g && g.status !== 'Completed'; }); this.setStatus(ids, 'Cancelled'); this.picked.set(new Set()); }
  protected bulkBrief() { this.flash(`Briefing sent for ${this.picked().size} visit${this.picked().size === 1 ? '' : 's'} to hosts, reception & security`); this.picked.set(new Set()); }
  protected briefAll() { const n = this.store.groups().filter((g) => g.day === 0 && g.status !== 'Cancelled').length; this.flash(`Briefings sent for ${n} visits today`); }
  private progressStatus(g: GroupVisit): GroupStatus {
    if (g.status === 'Cancelled') return g.status;
    const c = g.guests.filter((x) => x.in).length;
    return c === 0 ? (g.status === 'Completed' ? 'Upcoming' : g.status === 'In Progress' ? 'Upcoming' : g.status) : c === g.guests.length ? 'Completed' : 'In Progress';
  }
  protected checkGuest(g: GroupVisit, i: number) {
    this.patch(g.id, (x) => { const n = { ...x, guests: x.guests.map((p, j) => (j === i ? { ...p, in: !p.in } : p)) }; return { ...n, status: this.progressStatus(n) }; });
    const p = g.guests[i];
    this.flash(`${p.name} ${p.in ? 'check-in undone' : 'checked in'} · ${g.name}`);
  }
  protected checkAll(g: GroupVisit) {
    this.patch(g.id, (x) => ({ ...x, guests: x.guests.map((p) => ({ ...p, in: true })), status: 'Completed' }));
    this.flash(`All ${g.guests.length} guests checked in`);
  }
  protected addGuest(g: GroupVisit, name: string) {
    if (!name.trim()) return;
    this.patch(g.id, (x) => ({ ...x, guests: [...x.guests, { name: name.trim(), company: x.org, in: false }] }));
    this.flash(`${name.trim()} added to ${g.name}`);
  }
  protected toggleProto(g: GroupVisit, i: number) {
    this.patch(g.id, (x) => ({ ...x, vip: { ...x.vip!, protocol: x.vip!.protocol.map((p, j) => (j === i ? { ...p, done: !p.done } : p)) } }));
  }
  protected removeProto(g: GroupVisit, i: number) { this.patch(g.id, (x) => ({ ...x, vip: { ...x.vip!, protocol: x.vip!.protocol.filter((_, j) => j !== i) } })); }
  protected addProto(g: GroupVisit, label: string) {
    if (!label.trim()) return;
    this.patch(g.id, (x) => ({ ...x, vip: { ...x.vip!, protocol: [...x.vip!.protocol, { label: label.trim(), done: false }] } }));
  }

  // ---------- setup form ----------
  private toSetup(g: GroupVisit): Setup {
    return { id: g.id, name: g.name, host: g.host, type: g.type, site: g.site, start: g.start, guests: g.guests.length, badge: g.badge, areas: [...g.areas], transport: g.transport, file: g.file ?? '', vipName: g.vip?.name ?? '' };
  }
  protected set<K extends keyof Setup>(k: K, v: Setup[K]) { this.s.update((s) => ({ ...s, [k]: v })); }
  protected toggleArea(a: string) { if (!a) return; this.s.update((s) => ({ ...s, areas: s.areas.includes(a) ? s.areas.filter((x) => x !== a) : [...s.areas, a] })); }
  protected upload(name?: string) {
    if (!name) return;
    const n = 8 + (name.length * 7) % 23;
    this.s.update((s) => ({ ...s, file: name, guests: n }));
    this.flash(`${name} uploaded — ${n} guests parsed, 0 errors`);
  }
  protected create(type: 'VIP' | 'Group') {
    this.setupFor.set(null); this.tried.set(false);
    this.s.set({ id: null, name: '', host: 'Priya Sharma', type, site: GV_SITES[0], start: 660, guests: type === 'VIP' ? 4 : 12, badge: type === 'VIP' ? 'Executive Visitor' : 'Visitor Badge (Day Pass)', areas: type === 'VIP' ? ['Executive Floor', 'Boardroom'] : ['Meeting Rooms'], transport: type === 'VIP', file: '', vipName: '' });
    setTimeout(() => { document.querySelector('.setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (document.querySelector('.setup input') as HTMLInputElement | null)?.focus(); }, 0);
  }
  protected save() {
    const s = this.s();
    this.tried.set(true);
    if (!s.name.trim() || !s.areas.length) { this.flash('Please complete the required fields'); return; }
    if (s.id) {
      this.patch(s.id, (g) => {
        const cur = g.guests.length;
        const guests = s.guests > cur ? [...g.guests, ...makeGuests(s.guests - cur, g.org, 0, g.id * 31 + cur)] : g.guests.slice(0, s.guests);
        const dur = g.end - g.start;
        const n: GroupVisit = { ...g, name: s.name.trim(), host: s.host, type: s.type, site: s.site, start: s.start, end: s.start + dur, guests, badge: s.badge, areas: s.areas, transport: s.transport, file: s.file || undefined,
          access: s.type === 'VIP' ? 'Executive' : g.access === 'Executive' ? 'Standard' : g.access,
          vip: s.type === 'VIP' ? g.vip ?? { name: guests[0]?.name ?? s.name, org: g.org, purpose: 'Executive Meeting', protocol: [{ label: 'Dedicated host', done: false }, { label: 'Security notified', done: false }] } : undefined };
        return { ...n, status: this.progressStatus(n) };
      });
      this.flash(`Group plan saved — ${s.name.trim()}`);
    } else {
      const id = this.store.nextId();
      const org = s.name.split(' ')[0] + ' Group';
      const guests = makeGuests(s.guests, org, 0, id * 17);
      const g: GroupVisit = { id, name: s.name.trim(), type: s.type, org, host: s.host, site: s.site, day: 0, start: s.start, end: s.start + 120, access: s.type === 'VIP' ? 'Executive' : 'Standard', areas: s.areas, badge: s.badge, transport: s.transport, status: 'Upcoming', guests, file: s.file || undefined,
        vip: s.type === 'VIP' ? { name: guests[0].name, org, purpose: 'Executive Meeting', protocol: [{ label: 'Dedicated host', done: true }, { label: 'Private waiting area', done: false }, { label: 'Security notified', done: false }, { label: 'Refreshments arranged', done: false }] } : undefined };
      this.store.groups.update((l) => [g, ...l]);
      this.setupFor.set(id); this.s.set(this.toSetup(g));
      if (g.vip) this.briefId.set(id);
      this.flash(`${s.type === 'VIP' ? 'VIP visit' : 'Group visit'} created — ${g.name} (${s.guests} guests, ${hm(s.start)})`);
    }
    this.tried.set(false);
  }
  protected sendBriefing() {
    const s = this.s();
    if (!s.name.trim()) { this.flash('Save the group plan first'); return; }
    this.flash(`Briefing sent to ${s.host}, reception & security for ${s.name} (${s.guests} guests)`);
  }
  protected exportCsv() {
    const rows = this.roster();
    downloadCsv('group-vip-visits.csv', [['Group / VIP', 'Type', 'Organization', 'Lead Host', 'Guests', 'Checked In', 'Site', 'Arrival', 'Status'], ...rows.map((g) => [g.name, g.type, g.org, g.host, g.guests.length, this.checked(g), g.site, this.arrival(g), g.status])]);
    this.flash(`Exported ${rows.length} visits`);
  }
}
