import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@p360/shared/icon';
import { SelectValue } from '@p360/shared/select-value';
import { AppState } from '@p360/shared/app-state';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, ID_TYPES, PURPOSES, SITES, VISITOR_TYPES, VmStore, hm, hostOf } from './vm.data';
import { PreReg, PreRegStatus, PreRegStore } from './vm-pre-registration.data';
import { TIME_OPTS, Toaster, VMA_CSS, VmAreas, dayLabel, isoDay, offsetOf } from './vm-a-kit';

type Form = Omit<PreReg, 'id' | 'status'>;
const DEPTS = [...new Set([...HOSTS.map((h) => h.dept), 'Corporate Affairs', 'Finance', 'Legal'])];
const BLANK: Form = { name: '', company: '', type: 'Business Visitor', email: '', phone: '', idType: 'Aadhaar', idNo: '', purpose: 'Business Meeting', host: 'Priya Sharma', dept: 'Business Development', site: SITES[0], day: 1, from: 600, to: 660, count: 1, areas: ['Main Entrance'], vehicle: '', parking: false, nda: false, safety: true, invite: true };
const REQ: (keyof Form)[] = ['name', 'email', 'phone', 'company', 'idNo'];
type SortKey = 'name' | 'company' | 'purpose' | 'host' | 'site' | 'when' | 'status';

@Component({
  selector: 'app-vm-pre-registration',
  imports: [Icon, SelectValue, RouterLink, VM_UI, VmAreas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vm-page">
      <div class="vm-head">
        <div>
          <nav class="bc"><a routerLink="/visitor-management/visitor-dashboard">Visitor Management</a><app-icon name="chevron-right" [size]="14" /><span>Pre-Registration</span></nav>
          <h1>Pre-Registration</h1>
          <p class="sub">Create and manage upcoming visitor appointments before arrival.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="newReg()"><app-icon name="plus" [size]="18" />New Pre-Registration</button>
          <button class="btn-ghost hb" (click)="importOpen.set(true)"><app-icon name="download" [size]="18" />Import</button>
          <button class="btn-ghost hb" (click)="export()"><app-icon name="m-upload" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="btn-ghost hb sq" (click)="headMenu.set(!headMenu())" aria-label="More"><app-icon name="more" [size]="18" /></button>
            @if (headMenu()) {
              <div class="bk" (click)="headMenu.set(false)"></div>
              <div class="dropdown">
                <button class="dd-item" (click)="approveAll()"><app-icon name="shield-check" [size]="15" />Approve all pending ({{ pendingCount() }})</button>
                <button class="dd-item" (click)="remindAll()"><app-icon name="p-mail" [size]="15" />Resend invitations (today)</button>
                <button class="dd-item" (click)="clearDrafts()"><app-icon name="w-trash" [size]="15" />Delete drafts</button>
                <button class="dd-item" (click)="headMenu.set(false); print()"><app-icon name="s-printer" [size]="15" />Print upcoming list</button>
              </div>
            }
          </div>
        </div>
      </div>

      <div class="vm-bar">
        <vm-tabs [tabs]="tabs" [value]="tab()" (change)="tab.set($event); showAll.set(true)" />
        <div class="vm-sep"></div>
        <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search by visitor name, company, host, or ID..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="building" [size]="16" /><span>Site</span>
          <select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
        </label>
        <label class="vm-filter"><app-icon name="calendar-days" [size]="16" />
          <select [value]="dates()" (change)="dates.set($any($event.target).value)">@for (d of dateOpts; track d) {<option [value]="d">{{ d }}</option>}</select>
        </label>
        <label class="vm-filter"><span>Status</span>
          <select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All Status</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select>
        </label>
        <div class="menu-wrap">
          <button class="vm-icon-btn" [class.act]="type() || filtersOn()" (click)="filterMenu.set(!filterMenu())" aria-label="More filters"><app-icon name="filter" [size]="16" /></button>
          @if (filterMenu()) {
            <div class="bk" (click)="filterMenu.set(false)"></div>
            <div class="dropdown fpop">
              <div class="vm-field"><label>Visitor type</label>
                <div class="vm-input"><select [value]="type()" (change)="type.set($any($event.target).value)"><option value="">All types</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></div>
              </div>
              <button class="btn-ghost" (click)="resetFilters()">Reset all filters</button>
            </div>
          }
        </div>
      </div>

      <div class="top">
        <section class="vm-card form-card" #formCard>
          <div class="vm-card-head"><h2><app-icon name="user-plus" [size]="26" />{{ editing() ? 'Edit Pre-Registration · ' + editing() : 'New Pre-Registration' }}</h2></div>
          <div class="cols3">
            <section>
              <div class="sec-h">Visitor Details</div>
              <div class="fr"><label>Visitor type <b>*</b></label>
                <div class="vm-input"><app-icon name="users" [size]="16" /><select [value]="f().type" (change)="upd('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Full name <b>*</b></label>
                <div class="vm-input" [class.err]="bad('name')"><app-icon name="user" [size]="16" /><input #nameIn [value]="f().name" (input)="upd('name', $any($event.target).value)" placeholder="Visitor full name" /></div></div>
              <div class="fr"><label>Work email <b>*</b></label>
                <div class="vm-input" [class.err]="bad('email')"><app-icon name="p-mail" [size]="16" /><input type="email" [value]="f().email" (input)="upd('email', $any($event.target).value)" placeholder="name@company.com" /></div></div>
              <div class="fr"><label>Mobile number <b>*</b></label>
                <div class="vm-input" [class.err]="bad('phone')"><app-icon name="phone" [size]="16" /><input [value]="f().phone" (input)="upd('phone', $any($event.target).value)" placeholder="+91" /></div></div>
              <div class="fr"><label>Company/<wbr />Organization <b>*</b></label>
                <div class="vm-input" [class.err]="bad('company')"><app-icon name="building" [size]="16" /><input [value]="f().company" (input)="upd('company', $any($event.target).value)" placeholder="Company" /></div></div>
              <div class="fr"><label>ID type <b>*</b></label>
                <div class="vm-input"><app-icon name="id-card" [size]="16" /><select [value]="f().idType" (change)="upd('idType', $any($event.target).value)">@for (t of idTypes; track t) {<option [value]="t">{{ t }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>ID number <b>*</b></label>
                <div class="vm-input" [class.err]="bad('idNo')"><app-icon name="id-card" [size]="16" /><input [value]="f().idNo" (input)="upd('idNo', $any($event.target).value)" placeholder="ID number" /></div></div>
            </section>
            <section>
              <div class="sec-h">Visit Details</div>
              <div class="fr"><label>Visit purpose <b>*</b></label>
                <div class="vm-input"><app-icon name="briefcase" [size]="16" /><select [value]="f().purpose" (change)="upd('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Host/Employee <b>*</b></label>
                <div class="vm-input"><app-icon name="user" [size]="16" /><select [value]="f().host" (change)="pickHost($any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }} ({{ h.emp }})</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Department <b>*</b></label>
                <div class="vm-input"><app-icon name="admin-sitemap" [size]="16" /><select [value]="f().dept" (change)="upd('dept', $any($event.target).value)">@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Site/Location <b>*</b></label>
                <div class="vm-input"><app-icon name="map-pin" [size]="16" /><select [value]="f().site" (change)="upd('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Visit date <b>*</b></label>
                <div class="vm-input date" [class.err]="bad('day')"><app-icon name="calendar-days" [size]="16" /><span class="dv">{{ dayText(f().day) }}</span><app-icon name="calendar-days" [size]="16" />
                  <input type="date" [value]="iso(f().day)" (click)="$any($event.target).showPicker?.()" (change)="setDate($any($event.target).value)" aria-label="Visit date" /></div></div>
              <div class="two">
                <div class="vm-field"><label>Expected arrival time <b>*</b></label>
                  <div class="vm-input"><app-icon name="clock" [size]="16" /><select [value]="'' + f().from" (change)="setFrom(+$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
                <div class="vm-field"><label>Expected departure time <b>*</b></label>
                  <div class="vm-input" [class.err]="tried() && f().to <= f().from"><app-icon name="clock" [size]="16" /><select [value]="'' + f().to" (change)="upd('to', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              </div>
              <div class="vm-field cnt"><label>Number of visitors <b>*</b></label>
                <div class="vm-input"><app-icon name="users" [size]="16" /><input type="number" min="1" max="50" [value]="f().count" (input)="upd('count', +$any($event.target).value || 1)" />
                  <span class="num"><button type="button" (click)="upd('count', f().count + 1)" aria-label="More">▲</button><button type="button" (click)="upd('count', f().count > 1 ? f().count - 1 : 1)" aria-label="Fewer">▼</button></span></div></div>
            </section>
            <section>
              <div class="sec-h">Access &amp; Compliance</div>
              <div class="vm-field"><label>Access areas <b>*</b></label>
                <vm-areas [value]="f().areas" (valueChange)="upd('areas', $event)" [options]="areas" [err]="tried() && !f().areas.length" class="areas" /></div>
              <div class="vm-field veh"><label>Vehicle number</label>
                <div class="vm-input"><app-icon name="w-car" [size]="16" /><input [value]="f().vehicle" (input)="upd('vehicle', $any($event.target).value.toUpperCase())" placeholder="Optional" /></div></div>
              <div class="tg"><app-icon name="vm-a-parking" [size]="18" /><span>Parking required</span><button type="button" class="vm-switch" [class.on]="f().parking" (click)="upd('parking', !f().parking)" aria-label="Parking required"></button></div>
              <div class="tg"><app-icon name="file-text" [size]="18" /><span>NDA required</span><button type="button" class="vm-switch" [class.on]="f().nda" (click)="upd('nda', !f().nda)" aria-label="NDA required"></button></div>
              <div class="tg"><button type="button" class="ck" [class.on]="f().safety" (click)="upd('safety', !f().safety)" aria-label="Safety briefing">@if (f().safety) {<app-icon name="tasks-check" [size]="13" [stroke]="3" />}</button><span>Safety briefing required</span></div>
              <div class="tg"><app-icon name="p-mail" [size]="18" /><span>Send invitation (email with visit details)</span><button type="button" class="vm-switch" [class.on]="f().invite" (click)="upd('invite', !f().invite)" aria-label="Send invitation"></button></div>
            </section>
          </div>
        </section>

        <aside class="vm-card sum-card">
          <div class="sum-h"><app-icon name="tasks-clipboard" [size]="26" /><h2>Visit Summary</h2></div>
          <div class="sum">
            <div><app-icon name="user" [size]="18" /><span>Host</span><b>{{ f().host }} ({{ hostEmp() }})</b></div>
            <div><app-icon name="admin-sitemap" [size]="18" /><span>Site</span><b>{{ f().site }}</b></div>
            <div><app-icon name="calendar-days" [size]="18" /><span>Date &amp; Time</span><b>{{ dayText(f().day) }}<br />{{ hm(f().from) }} – {{ hm(f().to) }}</b></div>
            <div><app-icon name="briefcase" [size]="18" /><span>Purpose</span><b>{{ f().purpose }}</b></div>
            <div><app-icon name="layers" [size]="18" /><span>Access Areas</span><b>{{ f().areas.join(', ') || '—' }}</b></div>
          </div>
          @if (tried() && missing().length) { <div class="warn"><app-icon name="triangle-alert" [size]="15" />Complete: {{ missing().join(', ') }}</div> }
          <button class="btn-primary vm-btn-big" (click)="create()">{{ editing() ? 'Update Pre-Registration' : 'Create Pre-Registration' }}</button>
          <div class="btn-row">
            <button class="btn-ghost" (click)="saveDraft()"><app-icon name="vm-a-save" [size]="17" />Save as Draft</button>
            <button class="btn-ghost" (click)="cancel()"><app-icon name="tasks-x" [size]="17" />Cancel</button>
          </div>
        </aside>
      </div>

      <section class="vm-card">
        <div class="vm-card-head"><h2><app-icon name="calendar-days" [size]="24" />{{ tab() === 'All' ? 'Upcoming Pre-Registrations' : tab() + ' Pre-Registrations' }}</h2>
          <span class="cnt-chip">{{ rows().length }}</span><span class="spacer"></span>
          <button class="vm-link" (click)="showAll.set(!showAll())">{{ showAll() ? 'Show Less' : 'View All' }}</button>
        </div>
        <div class="tbl-wrap">
          <table class="vm-table">
            <thead><tr>
              @for (c of cols; track c[0]) {
                <th class="sort" (click)="sortBy(c[0])">{{ c[1] }}@if (sortK() === c[0]) {<app-icon class="si" [name]="sortAsc() ? 'arrow-up' : 'arrow-down'" [size]="12" />}</th>
              }
              <th class="ta-c">Actions</th>
            </tr></thead>
            <tbody>
              @for (r of shown(); track r.id) {
                <tr [class.flash]="flash() === r.id">
                  <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="34" />{{ r.name }}</div></td>
                  <td>{{ r.company }}</td>
                  <td>{{ r.purpose }}</td>
                  <td>{{ r.host }}</td>
                  <td>{{ r.site }}</td>
                  <td class="dt"><app-icon name="calendar-days" [size]="16" />{{ dayText(r.day) }}, {{ hm(r.from) }} – {{ hm(r.to) }}</td>
                  <td><vm-status [label]="r.status" /></td>
                  <td>
                    <div class="vm-acts">
                      <button class="ia" (click)="view.set(r)" aria-label="View"><app-icon name="eye" [size]="18" /></button>
                      <button class="ia" (click)="edit(r)" aria-label="Edit"><app-icon name="w-pencil" [size]="17" /></button>
                      <button class="ia" (click)="confirmDel.set([r.id])" aria-label="Delete"><app-icon name="w-trash" [size]="17" /></button>
                      <div class="menu-wrap">
                        <button class="ia" (click)="rowMenu.set(rowMenu() === r.id ? '' : r.id)" aria-label="More"><app-icon name="more" [size]="18" /></button>
                        @if (rowMenu() === r.id) {
                          <div class="bk" (click)="rowMenu.set('')"></div>
                          <div class="dropdown">
                            @if (r.status === 'Pending Approval' || r.status === 'Draft') { <button class="dd-item" (click)="setStatus(r, 'Confirmed')"><app-icon name="shield-check" [size]="15" />Approve</button> }
                            <button class="dd-item" (click)="sendInvite(r)"><app-icon name="p-mail" [size]="15" />Send invitation</button>
                            <button class="dd-item" (click)="duplicate(r)"><app-icon name="tasks-copy" [size]="15" />Duplicate</button>
                            @if (r.day === 0 && r.status === 'Confirmed') { <button class="dd-item" (click)="checkIn(r)"><app-icon name="user-check" [size]="15" />Check in now</button> }
                            @if (r.status !== 'Cancelled' && r.status !== 'Expired') { <button class="dd-item" (click)="setStatus(r, 'Cancelled')"><app-icon name="vm-a-x-circle" [size]="15" />Cancel visit</button> }
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="vm-empty">No pre-registrations match the current filters. <button class="vm-link" (click)="resetFilters()">Reset filters</button></td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    @if (view(); as v) {
      <div class="g-overlay" (click)="view.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Pre-Registration {{ v.id }}</h3><button class="close-btn" (click)="view.set(null)">×</button></div>
        <div class="dh"><vm-avatar [name]="v.name" [size]="56" /><div><b>{{ v.name }}</b><small>{{ v.type }} · {{ v.company }}</small></div><vm-status [label]="v.status" /></div>
        <div class="kv2">
          <span>Email</span><b>{{ v.email }}</b><span>Mobile</span><b>{{ v.phone }}</b>
          <span>ID</span><b>{{ v.idType }} · {{ v.idNo }}</b>
          <span>Host</span><b>{{ v.host }} ({{ v.dept }})</b><span>Site</span><b>{{ v.site }}</b>
          <span>Date &amp; time</span><b>{{ dayText(v.day) }}, {{ hm(v.from) }} – {{ hm(v.to) }}</b>
          <span>Purpose</span><b>{{ v.purpose }}</b><span>Visitors</span><b>{{ v.count }}</b>
          <span>Access areas</span><b>{{ v.areas.join(', ') }}</b><span>Vehicle</span><b>{{ v.vehicle || '—' }}</b>
          <span>Compliance</span><b>{{ v.parking ? 'Parking · ' : '' }}{{ v.nda ? 'NDA · ' : '' }}{{ v.safety ? 'Safety briefing' : 'No briefing' }}</b>
        </div>
        <div class="m-actions">
          @if (v.status === 'Pending Approval' || v.status === 'Draft') { <button class="btn-primary" (click)="setStatus(v, 'Confirmed')">Approve</button> }
          @if (v.day === 0 && v.status === 'Confirmed') { <button class="btn-primary" (click)="checkIn(v)">Check in now</button> }
          <button class="btn-outline" (click)="sendInvite(v)">Send invitation</button>
          <button class="btn-ghost" (click)="edit(v)">Edit</button>
        </div>
      </aside>
    }
    @if (confirmDel().length) {
      <div class="g-overlay" (click)="confirmDel.set([])"></div>
      <div class="g-modal sm">
        <div class="modal-head"><h3>Delete pre-registration{{ confirmDel().length > 1 ? 's' : '' }}?</h3><button class="close-btn" (click)="confirmDel.set([])">×</button></div>
        <p>{{ confirmDel().length > 1 ? confirmDel().length + ' appointments' : nameOf(confirmDel()[0]) + '’s appointment' }} will be removed and the host notified. This can’t be undone.</p>
        <div class="m-actions"><button class="btn-ghost" (click)="confirmDel.set([])">Keep</button><button class="vm-btn-danger" (click)="remove()">Delete</button></div>
      </div>
    }
    @if (importOpen()) {
      <div class="g-overlay" (click)="importOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Import pre-registrations</h3><button class="close-btn" (click)="importOpen.set(false)">×</button></div>
        <div class="drop"><app-icon name="download" [size]="28" /><b>visitors_week42.csv</b><small>3 rows detected · columns: name, email, company, host, date, time</small></div>
        <table class="vm-table"><thead><tr><th>Name</th><th>Company</th><th>Host</th><th>Date</th></tr></thead>
          <tbody>@for (r of importRows; track r[0]) {<tr><td>{{ r[0] }}</td><td>{{ r[1] }}</td><td>{{ r[2] }}</td><td>{{ dayText(+r[3]) }}</td></tr>}</tbody></table>
        <div class="m-actions"><button class="btn-ghost" (click)="importOpen.set(false)">Cancel</button><button class="btn-primary" (click)="doImport()">Import 3 visitors</button></div>
      </div>
    }
    @if (toast.msg()) { <div class="g-toast">{{ toast.msg() }}</div> }
  `,
  styles: [VMA_CSS, `
    :host { display: block; }
    .vm-bar .vm-tabs { background: var(--kb-f6f4ff); border-radius: 9px; padding: 3px; gap: 2px; }
    .vm-bar { flex-wrap: nowrap; }
    .vm-bar .vm-tabs { flex-wrap: nowrap; flex: none; }
    .vm-bar .vm-tabs button { border: 0; background: transparent; padding: 7px 18px; font-size: 13.5px; }
    .vm-bar .vm-tabs button.on { background: var(--primary); }
    .vm-bar .vm-search { max-width: 320px; min-width: 150px; }
    .vm-filter { min-width: 0; flex: 0 1 150px; } .vm-filter select { flex: 1; min-width: 0; }
    .vm-icon-btn.act { border-color: var(--primary); color: var(--primary); background: var(--kb-f5f0ff); }
    .fpop { width: 240px; display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) 336px; gap: 14px; align-items: start; }
    .form-card { padding: 14px 10px 10px; }
    .form-card .vm-card-head { padding-left: 6px; }
    .form-card .vm-card-head h2 { font-size: 20px; }
    .fr { grid-template-columns: 104px minmax(0, 1fr); }
    .fr > label { font-size: 12px; }
    .cols3 > section { padding: 0 10px; }
    .vm-input.date { position: relative; }
    .vm-input.date .dv { flex: 1; font-size: 13px; color: var(--text); }
    .vm-input.date input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
    .two .vm-field > label { font-size: 12px; white-space: nowrap; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 9px; }
    .cnt { width: 48%; }
    .cnt input::-webkit-inner-spin-button { display: none; }
    .areas { margin-bottom: 12px; }
    .areas ::ng-deep .box { min-height: 58px; align-items: center; }
    .veh { margin-bottom: 10px; }
        .vm-table td { padding: 7px 10px; font-size: 13px; white-space: nowrap; }
    .vm-table .vm-person { font-weight: 700; }
    @media (max-width: 1450px) { .top { grid-template-columns: 1fr; } .cols3 { grid-template-columns: 1fr; } .cols3 > section { padding: 0; border: 0 !important; margin-bottom: 10px; } }
  `],
})
export class PreRegistration {
  private readonly store = inject(PreRegStore);
  private readonly vm = inject(VmStore);
  private readonly app = inject(AppState);
  protected readonly toast = new Toaster();
  protected readonly hm = hm;
  protected readonly tabs = ['All', 'Upcoming', 'Today', 'Pending Approval', 'Expired'];
  protected readonly sites = SITES;
  protected readonly types = VISITOR_TYPES;
  protected readonly idTypes = ID_TYPES;
  protected readonly purposes = [...PURPOSES, 'Interview'].filter((p, i, a) => a.indexOf(p) === i);
  protected readonly hosts = HOSTS;
  protected readonly depts = DEPTS;
  protected readonly areas = AREAS;
  protected readonly times = TIME_OPTS;
  protected readonly statuses: PreRegStatus[] = ['Confirmed', 'Pending Approval', 'Draft', 'Expired', 'Cancelled', 'Checked In'];
  protected readonly dateOpts = ['All Dates', 'Today', 'Tomorrow', 'Next 7 Days', 'Past'];
  protected readonly cols: [SortKey, string][] = [['name', 'Visitor'], ['company', 'Company'], ['purpose', 'Purpose'], ['host', 'Host'], ['site', 'Site'], ['when', 'Date & Time'], ['status', 'Status']];
  protected readonly importRows = [['Hana Yusuf', 'Siemens', 'Michael Chen', '1'], ['Tom Wong', 'DHL', 'Ahmed Hassan', '2'], ['Grace Park', 'PwC', 'Maria Santos', '3']];

  protected readonly tab = signal('All');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly dates = signal('All Dates');
  protected readonly status = signal('');
  protected readonly type = signal('');
  protected readonly showAll = signal(false);
  protected readonly sortK = signal<SortKey>('when');
  protected readonly sortAsc = signal(true);
  protected readonly rowMenu = signal('');
  protected readonly headMenu = signal(false);
  protected readonly filterMenu = signal(false);
  protected readonly view = signal<PreReg | null>(null);
  protected readonly confirmDel = signal<string[]>([]);
  protected readonly importOpen = signal(false);
  protected readonly flash = signal('');
  protected readonly editing = signal('');
  protected readonly tried = signal(false);
  protected readonly f = signal<Form>({ ...this.store.list()[0], areas: [...this.store.list()[0].areas] });
  private readonly formCard = viewChild<ElementRef<HTMLElement>>('formCard');
  private readonly nameIn = viewChild<ElementRef<HTMLInputElement>>('nameIn');

  protected readonly filtersOn = computed(() => !!(this.q() || this.site() || this.status() || this.dates() !== 'All Dates'));
  protected readonly pendingCount = computed(() => this.store.list().filter((r) => r.status === 'Pending Approval').length);
  protected readonly hostEmp = computed(() => hostOf(this.f().host).emp);
  protected readonly missing = computed(() => {
    const f = this.f();
    const m = REQ.filter((k) => !String(f[k]).trim()).map((k) => ({ name: 'name', email: 'email', phone: 'mobile', company: 'company', idNo: 'ID number' } as Record<string, string>)[k]);
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) m.push('valid email');
    if (!f.areas.length) m.push('access areas');
    if (f.to <= f.from) m.push('departure after arrival');
    if (f.day < 0) m.push('future date');
    return m;
  });

  protected readonly rows = computed(() => {
    const q = this.q().toLowerCase(), tab = this.tab(), site = this.site(), st = this.status(), d = this.dates(), ty = this.type();
    const k = this.sortK(), asc = this.sortAsc() ? 1 : -1;
    const when = (r: PreReg) => (r.day < 0 ? 100000 - r.day * 1440 : r.day * 1440) + r.from;
    return this.store.list()
      .filter((r) => {
        if (tab === 'Upcoming' && !(r.day > 0 && r.status !== 'Expired' && r.status !== 'Cancelled')) return false;
        if (tab === 'Today' && r.day !== 0) return false;
        if (tab === 'Pending Approval' && r.status !== 'Pending Approval') return false;
        if (tab === 'Expired' && r.status !== 'Expired') return false;
        if (site && r.site !== site) return false;
        if (st && r.status !== st) return false;
        if (ty && r.type !== ty) return false;
        if (d === 'Today' && r.day !== 0) return false;
        if (d === 'Tomorrow' && r.day !== 1) return false;
        if (d === 'Next 7 Days' && (r.day < 0 || r.day > 7)) return false;
        if (d === 'Past' && r.day >= 0) return false;
        return !q || `${r.name} ${r.company} ${r.host} ${r.id} ${r.purpose}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (k === 'when' ? when(a) - when(b) : String(a[k]).localeCompare(String(b[k]))) * asc);
  });
  protected readonly shown = computed(() => (this.showAll() ? this.rows() : this.rows().slice(0, 5)));

  protected dayText(off: number) { return dayLabel(this.app.date(), off); }
  protected iso(off: number) { return isoDay(this.app.date(), off); }
  protected nameOf(id: string) { return this.store.list().find((r) => r.id === id)?.name ?? ''; }
  protected bad(k: keyof Form) { return this.tried() && (k === 'day' ? this.f().day < 0 : !String(this.f()[k]).trim() || (k === 'email' && !/^\S+@\S+\.\S+$/.test(this.f().email))); }
  protected upd<K extends keyof Form>(k: K, v: Form[K]) { this.f.update((f) => ({ ...f, [k]: v })); }
  protected pickHost(n: string) { const h = hostOf(n); this.f.update((f) => ({ ...f, host: n, dept: h.dept, site: h.site })); }
  protected setDate(v: string) { if (v) this.upd('day', offsetOf(this.app.date(), v)); }
  protected setFrom(t: number) { this.f.update((f) => ({ ...f, from: t, to: f.to <= t ? t + 120 : f.to })); }
  protected sortBy(k: SortKey) { if (this.sortK() === k) this.sortAsc.set(!this.sortAsc()); else { this.sortK.set(k); this.sortAsc.set(true); } }
  protected resetFilters() { this.q.set(''); this.site.set(''); this.status.set(''); this.dates.set('All Dates'); this.type.set(''); this.tab.set('All'); this.filterMenu.set(false); }

  protected newReg() {
    this.editing.set(''); this.tried.set(false);
    this.f.set({ ...BLANK, areas: [...BLANK.areas] });
    this.formCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => this.nameIn()?.nativeElement.focus(), 300);
  }
  protected edit(r: PreReg) {
    this.view.set(null); this.rowMenu.set('');
    const { id: _id, status: _s, ...rest } = r;
    this.f.set({ ...rest, areas: [...r.areas] });
    this.editing.set(r.id); this.tried.set(false);
    this.formCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  protected create() {
    this.tried.set(true);
    if (this.missing().length) { this.toast.show('Please complete the highlighted fields'); return; }
    const f = this.f();
    const status: PreRegStatus = f.type === 'VIP' || f.type === 'Contractor' || f.type === 'Government Official' ? 'Pending Approval' : 'Confirmed';
    this.save(status, status === 'Pending Approval' ? `sent to ${f.host} for approval` : f.invite ? `invitation emailed to ${f.email}` : 'confirmed');
  }
  protected saveDraft() {
    if (!this.f().name.trim()) { this.tried.set(true); this.toast.show('Enter at least the visitor name to save a draft'); return; }
    this.save('Draft', 'saved as draft');
  }
  private save(status: PreRegStatus, what: string) {
    const f = this.f();
    const id = this.editing() || this.store.nextId();
    const rec: PreReg = { ...f, id, status };
    if (this.editing()) this.store.list.update((l) => l.map((r) => (r.id === id ? rec : r)));
    else this.store.list.update((l) => [rec, ...l]);
    if (f.day === 0 && status !== 'Draft' && !this.editing()) this.vm.add({ name: f.name, company: f.company, type: f.type, purpose: f.purpose, host: f.host, site: f.site, areas: f.areas, email: f.email, phone: f.phone, arrival: f.from, departure: f.to, vehicle: f.vehicle, idType: f.idType, idNo: f.idNo }, status === 'Confirmed' ? 'Expected' : 'Pending Approval');
    this.toast.show(`${f.name} — pre-registration ${this.editing() ? 'updated' : 'created'}, ${what}`);
    this.tab.set('All'); this.resetFilters(); this.showAll.set(true);
    this.flash.set(id); setTimeout(() => this.flash.set(''), 2500);
    this.editing.set(''); this.tried.set(false);
    this.f.set({ ...BLANK, areas: [...BLANK.areas] });
  }
  protected cancel() {
    this.editing.set(''); this.tried.set(false);
    this.f.set({ ...BLANK, areas: [...BLANK.areas] });
    this.toast.show('Form cleared');
  }
  protected setStatus(r: PreReg, s: PreRegStatus) {
    this.store.list.update((l) => l.map((x) => (x.id === r.id ? { ...x, status: s } : x)));
    this.rowMenu.set(''); this.view.set(null);
    this.toast.show(`${r.name} — ${s === 'Confirmed' ? 'approved & confirmed' : s.toLowerCase()}`);
  }
  protected sendInvite(r: PreReg) { this.rowMenu.set(''); this.toast.show(`Invitation sent to ${r.email}`); }
  protected duplicate(r: PreReg) {
    const id = this.store.nextId();
    this.store.list.update((l) => [{ ...r, id, day: Math.max(1, r.day + 1), status: 'Draft', areas: [...r.areas] }, ...l]);
    this.rowMenu.set(''); this.showAll.set(true); this.flash.set(id);
    this.toast.show(`Duplicated as draft ${id} for ${this.dayText(Math.max(1, r.day + 1))}`);
  }
  protected checkIn(r: PreReg) {
    const v = this.vm.byName(r.name);
    if (v && v.status !== 'Checked In') this.vm.checkIn(v.id);
    else if (!v) this.vm.add({ name: r.name, company: r.company, type: r.type, purpose: r.purpose, host: r.host, site: r.site, areas: r.areas, email: r.email, phone: r.phone, arrival: r.from, departure: r.to }, 'Checked In');
    this.setStatus(r, 'Checked In');
    this.toast.show(`${r.name} checked in — ${r.host} notified`);
  }
  protected remove() {
    const ids = this.confirmDel();
    this.store.list.update((l) => l.filter((r) => !ids.includes(r.id)));
    this.confirmDel.set([]); this.view.set(null);
    this.toast.show(`${ids.length} pre-registration${ids.length > 1 ? 's' : ''} deleted`);
  }
  protected approveAll() {
    const n = this.pendingCount();
    this.store.list.update((l) => l.map((r) => (r.status === 'Pending Approval' ? { ...r, status: 'Confirmed' } : r)));
    this.headMenu.set(false); this.toast.show(`${n} pending pre-registrations approved`);
  }
  protected remindAll() { const n = this.store.list().filter((r) => r.day === 0 && r.status === 'Confirmed').length; this.headMenu.set(false); this.toast.show(`Reminder invitations sent to ${n} visitors arriving today`); }
  protected clearDrafts() {
    const n = this.store.list().filter((r) => r.status === 'Draft').length;
    this.store.list.update((l) => l.filter((r) => r.status !== 'Draft'));
    this.headMenu.set(false); this.toast.show(`${n} drafts deleted`);
  }
  protected print() { window.print(); }
  protected doImport() {
    const hs = this.importRows.map((r, i) => {
      const h = hostOf(r[2]);
      return { ...BLANK, id: this.store.nextId(), name: r[0], company: r[1], host: h.name, dept: h.dept, site: h.site, day: +r[3], email: `${r[0].toLowerCase().replace(' ', '.')}@${r[1].toLowerCase()}.com`, phone: `+91 98${i}00 1122${i}`, idNo: '—', from: 600 + i * 60, to: 690 + i * 60, status: 'Pending Approval' as PreRegStatus, areas: ['Main Entrance', 'Meeting Rooms'] };
    });
    this.store.list.update((l) => [...hs, ...l]);
    this.importOpen.set(false); this.showAll.set(true);
    this.toast.show('3 visitors imported — pending host approval');
  }
  protected export() {
    downloadCsv('pre-registrations.csv', [
      ['ID', 'Visitor', 'Company', 'Type', 'Purpose', 'Host', 'Site', 'Date', 'From', 'To', 'Visitors', 'Status'],
      ...this.rows().map((r) => [r.id, r.name, r.company, r.type, r.purpose, r.host, r.site, this.dayText(r.day), hm(r.from), hm(r.to), r.count, r.status]),
    ]);
    this.toast.show(`Exported ${this.rows().length} pre-registrations`);
  }
}
