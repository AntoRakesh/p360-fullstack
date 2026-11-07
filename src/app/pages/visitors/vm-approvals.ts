import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { ApprovalStore, ApprRequest, fmtDay, fmtTime, shortTime } from './vm-approvals.data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, PURPOSES, SITES, hostOf } from './vm.data';

const TABS = ['pending', 'mine', 'high', 'today'] as const;
type Tab = (typeof TABS)[number] | 'approved' | 'rejected';
const REJECT_REASONS = ['Incomplete documents', 'Watchlist / security concern', 'Host not available', 'Visit not justified', 'Duplicate request', 'Other'];
const CHANGE_FIELDS = ['Visit date / time', 'ID document', 'Purpose of visit', 'Access areas', 'Vehicle details', 'NDA'];

@Component({
  selector: 'app-vm-approvals',
  imports: [...UI, ...VM_UI, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="ap" [class.no-panel]="!sel()">
      <div class="vm-page main">
        <div class="vm-head">
          <div>
            <nav class="crumb"><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Visitor Approvals</b></nav>
            <h1>Visitor Approvals</h1>
            <p>Review and approve visitor requests before arrival.</p>
          </div>
          <div class="vm-actions">
            <div class="menu-wrap">
              <button class="btn-primary hb" (click)="toggleMenu('bulk', $event)">Bulk Actions @if (checked().size) {({{ checked().size }})}<app-icon name="chevron-down" [size]="16" /></button>
              @if (menu() === 'bulk') {
                <div class="dropdown" (click)="$event.stopPropagation()">
                  @if (!checked().size) {<div class="dd-note">Select requests in the table first</div>}
                  <button class="dd-item" [disabled]="!checked().size" (click)="bulk('approve')"><app-icon name="w-check-circle" [size]="15" />Approve selected</button>
                  <button class="dd-item" [disabled]="!checked().size" (click)="bulk('reject')"><app-icon name="vm-c-x-circle" [size]="15" />Reject selected</button>
                  <button class="dd-item" [disabled]="!checked().size" (click)="bulk('mine')"><app-icon name="user" [size]="15" />Assign to me</button>
                  <button class="dd-item" [disabled]="!checked().size" (click)="bulk('remind')"><app-icon name="bell" [size]="15" />Remind hosts</button>
                  <button class="dd-item" [disabled]="!checked().size" (click)="bulk('export')"><app-icon name="download" [size]="15" />Export selected</button>
                  <button class="dd-item" (click)="selectAllPending()"><app-icon name="list-checks" [size]="15" />Select all low-risk pending</button>
                </div>
              }
            </div>
            <button class="btn-outline hb" (click)="exportCsv(rows())"><app-icon name="download" [size]="18" />Export</button>
            <div class="menu-wrap">
              <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
              @if (menu() === 'more') {
                <div class="dropdown" (click)="$event.stopPropagation()">
                  <button class="dd-item" (click)="rulesOpen.set(true); menu.set(null)"><app-icon name="sliders" [size]="15" />Approval rules</button>
                  <button class="dd-item" (click)="go('pre-registration')"><app-icon name="user-plus" [size]="15" />New pre-registration</button>
                  <button class="dd-item" (click)="go('watchlist-blacklist')"><app-icon name="shield" [size]="15" />Watchlist &amp; blacklist</button>
                  <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="file-text" [size]="15" />Print queue</button>
                </div>
              }
            </div>
          </div>
        </div>

        <section class="vm-kpis">
          <vm-kpi label="Pending Approval" [value]="st.pending().length" icon="vm-c-hourglass" color="#f59e0b" [chevron]="true" [clickable]="true" [active]="tab() === 'pending'" (pick)="setTab('pending')" />
          <vm-kpi label="Approved Today" [value]="st.approvedToday()" icon="w-check-circle" color="#16a34a" [chevron]="true" [clickable]="true" [active]="tab() === 'approved'" (pick)="setTab('approved')" />
          <vm-kpi label="Rejected Today" [value]="st.rejectedToday()" icon="vm-c-x-circle" color="#dc2626" [chevron]="true" [clickable]="true" [active]="tab() === 'rejected'" (pick)="setTab('rejected')" />
          <vm-kpi label="Arriving Today" [value]="st.arrivingToday()" icon="calendar-days" color="#7c3aed" [chevron]="true" [clickable]="true" (pick)="go('visitor-check-in-check-out')" />
        </section>

        <div class="vm-card list">
          <div class="tabs">
            @for (t of tabDefs(); track t.key) {
              <button [class.on]="tab() === t.key" (click)="setTab(t.key)"><app-icon [name]="t.icon" [size]="18" />{{ t.label }} ({{ t.n }})</button>
            }
            @if (tab() === 'approved' || tab() === 'rejected') {
              <span class="viewing">Showing {{ tab() === 'approved' ? 'approved' : 'rejected' }} today <button class="vm-link" (click)="setTab('pending')">Back to pending</button></span>
            }
          </div>
          <div class="filters">
            <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search visitor, company, host..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <label class="fl"><app-icon name="building" [size]="20" /><span><small>Site</small><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></span></label>
            <label class="fl"><app-icon name="calendar-days" [size]="20" /><span><small>Visit Date</small><select [value]="date()" (change)="date.set($any($event.target).value)"><option value="">All Dates</option><option value="0">Today</option><option value="1">Tomorrow</option><option value="7">This Week</option></select></span></label>
            <label class="fl"><app-icon name="briefcase" [size]="20" /><span><small>Purpose</small><select [value]="purpose()" (change)="purpose.set($any($event.target).value)"><option value="">All Purposes</option>@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select></span></label>
            <label class="fl"><app-icon name="shield" [size]="20" /><span><small>Risk Level</small><select [value]="risk()" (change)="risk.set($any($event.target).value)"><option value="">All Levels</option><option>Low</option><option>Medium</option><option>High</option></select></span></label>
            <button class="vm-icon-btn rf" [class.spin]="spinning()" title="Reset filters &amp; refresh" (click)="refresh()"><app-icon name="refresh" [size]="18" /></button>
          </div>

          <div class="tbl">
            <table class="vm-table">
              <thead><tr>
                <th class="cb"><input type="checkbox" [checked]="allChecked()" (change)="checkAll($any($event.target).checked)" /></th>
                <th>Visitor</th><th>Company</th><th>Purpose</th><th>Host</th><th>Site</th><th>Date &amp; Time</th><th>Risk /<br />Compliance</th><th>Status</th><th class="ac">Actions</th>
              </tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr class="click" [class.sel]="selId() === r.id" (click)="open(r.id)">
                    <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="checked().has(r.id)" (change)="check(r.id)" /></td>
                    <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="32" />{{ r.name }}</div></td>
                    <td class="wrap">{{ r.company }}</td>
                    <td class="wrap">{{ r.purpose }}</td>
                    <td class="wrap">{{ r.host }}</td>
                    <td class="wrap site">{{ r.site }}</td>
                    <td><div class="dt"><app-icon name="calendar-days" [size]="16" /><span>{{ r.day === 0 ? 'Today' : fmtDay(r.day) }}<br />{{ shortTime(r.time) }}</span></div></td>
                    <td><vm-status [label]="r.risk" />@if (r.vip) {<span class="vip">VIP</span>}</td>
                    <td><vm-status [label]="r.status" [tone]="r.status === 'Changes Requested' ? 'blue' : undefined" /></td>
                    <td (click)="$event.stopPropagation()">
                      <div class="vm-acts">
                        <button class="ia" title="View" (click)="open(r.id)"><app-icon name="eye" [size]="17" /></button>
                        <button class="ia" title="Edit request" (click)="openEdit(r)"><app-icon name="w-pencil" [size]="16" /></button>
                        <div class="menu-wrap">
                          <button class="ia" (click)="toggleMenu('row:' + r.id, $event)"><app-icon name="more" [size]="16" /></button>
                          @if (menu() === 'row:' + r.id) {
                            <div class="dropdown right" (click)="$event.stopPropagation()">
                              @if (isOpen(r)) {
                                <button class="dd-item" (click)="open(r.id); approve()"><app-icon name="w-check-circle" [size]="15" />Approve</button>
                                <button class="dd-item" (click)="open(r.id); rejectOpen.set(true); menu.set(null)"><app-icon name="vm-c-x-circle" [size]="15" />Reject</button>
                                <button class="dd-item" (click)="open(r.id); changesOpen.set(true); menu.set(null)"><app-icon name="w-pencil" [size]="15" />Request changes</button>
                                <button class="dd-item" (click)="escalate(r)"><app-icon name="triangle-alert" [size]="15" />Escalate to Security</button>
                              } @else {
                                <button class="dd-item" (click)="reopen(r)"><app-icon name="refresh" [size]="15" />Re-open for review</button>
                              }
                              <button class="dd-item" (click)="remind(r)"><app-icon name="bell" [size]="15" />Remind host</button>
                              <button class="dd-item" (click)="copy(r)"><app-icon name="file-text" [size]="15" />Copy request ID</button>
                            </div>
                          }
                        </div>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="10" class="vm-empty">No requests match these filters. <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="foot">Showing {{ rows().length }} request{{ rows().length === 1 ? '' : 's' }}@if (checked().size) { · <b>{{ checked().size }} selected</b> <button class="vm-link" (click)="checkAll(false)">Clear</button>}</div>
        </div>
      </div>

      @if (sel(); as s) {
        <aside class="vm-card panel">
          <div class="p-head"><h2><app-icon name="vm-c-clipboard" [size]="24" />Approval Details</h2><button class="x" (click)="selId.set(null)"><app-icon name="vm-c-x" [size]="20" /></button></div>
          <div class="who">
            <vm-avatar [name]="s.name" [size]="92" [square]="true" />
            <div><h3>{{ s.name }}</h3><p>{{ s.companyFull }}</p><span class="tchip">{{ s.type }}</span></div>
          </div>
          <div class="kv">
            <span><app-icon name="briefcase" [size]="18" />Purpose</span><b>{{ s.purpose }}</b>
            <span><app-icon name="user" [size]="18" />Host</span><b>{{ s.host }} ({{ hostOf(s.host).emp }})</b>
            <span><app-icon name="building" [size]="18" />Site</span><b>{{ s.site }}</b>
            <span><app-icon name="calendar-days" [size]="18" />Date &amp; Time</span><b>{{ fmtDay(s.day) }}, {{ fmtTime(s.time) }}</b>
            <span class="top"><app-icon name="layers" [size]="18" />Access Areas</span>
            <div class="areas">
              @for (a of s.areas; track a) {<span class="vm-chip">{{ a }}@if (isOpen(s)) {<button (click)="removeArea(s, a)" title="Remove">×</button>}</span>}
              @if (isOpen(s)) {
                <div class="menu-wrap">
                  <button class="add" (click)="toggleMenu('area', $event)">+ Add</button>
                  @if (menu() === 'area') {
                    <div class="dropdown" (click)="$event.stopPropagation()">
                      @for (a of areasLeft(); track a) {<button class="dd-item" (click)="addArea(s, a)">{{ a }}</button>}
                    </div>
                  }
                </div>
              }
            </div>
          </div>
          <div class="comp">
            <span><app-icon name="id-card" [size]="18" />ID Verified</span>
            <button class="cs" [attr.data-t]="s.idv === 'Verified' ? 'ok' : 'warn'" (click)="cycle(s, 'idv')">@if (s.idv === 'Verified') {<app-icon name="vm-c-check-circle" [size]="16" />} @else {<app-icon name="triangle-alert" [size]="15" />}{{ s.idv === 'Verified' ? 'Verified' : 'Pending – verify' }}</button>
            <span><app-icon name="file-text" [size]="18" />NDA</span>
            <button class="cs" [attr.data-t]="s.nda === 'Pending' ? 'warn' : s.nda === 'Signed' ? 'ok' : 'na'" (click)="cycle(s, 'nda')">@if (s.nda === 'Pending') {<app-icon name="triangle-alert" [size]="15" />} @else {<app-icon name="vm-c-check-circle" [size]="16" />}{{ s.nda === 'Pending' ? 'Pending – send' : s.nda }}</button>
            <span><app-icon name="hard-hat" [size]="18" />Safety Briefing</span>
            <button class="cs" [attr.data-t]="s.safety === 'Required' ? 'warn' : s.safety === 'Link Sent' ? 'blue' : s.safety === 'Completed' ? 'ok' : 'na'" (click)="cycle(s, 'safety')">@if (s.safety === 'Required') {<app-icon name="triangle-alert" [size]="15" />} @else {<app-icon name="vm-c-check-circle" [size]="16" />}{{ s.safety }}</button>
            <span><app-icon name="ai-user-search" [size]="18" />Watchlist Screening</span>
            <button class="cs" [attr.data-t]="s.watch === 'Clear' ? 'ok' : 'bad'" (click)="cycle(s, 'watch')">@if (s.watch === 'Clear') {<app-icon name="vm-c-check-circle" [size]="16" />} @else {<app-icon name="triangle-alert" [size]="15" />}{{ s.watch }}</button>
          </div>
          @if (isOpen(s)) {
            <div class="notes">
              <h4><app-icon name="message" [size]="20" />Notes</h4>
              <div class="ta" [class.err]="noteErr()"><textarea maxlength="500" rows="3" placeholder="Add approval notes (optional)..." [value]="note()" (input)="note.set($any($event.target).value); noteErr.set(false)"></textarea><small>{{ note().length }}/500</small></div>
              @if (noteErr()) {<p class="err-t">A note is required to approve a {{ s.watch !== 'Clear' ? 'watchlist match' : 'high-risk visit' }}.</p>}
            </div>
            <button class="btn-primary vm-btn-big approve" (click)="approve()"><app-icon name="vm-c-check" [size]="20" />Approve Visitor</button>
            <div class="two">
              <button class="vm-btn-danger" (click)="rejectOpen.set(true)"><app-icon name="vm-c-x" [size]="18" />Reject</button>
              <button class="btn-outline rc" (click)="changesOpen.set(true)"><app-icon name="reports-edit" [size]="18" />Request Changes</button>
            </div>
          } @else {
            <div class="decided" [attr.data-s]="s.status"><app-icon [name]="s.status === 'Approved' ? 'w-check-circle' : 'vm-c-x-circle'" [size]="20" /><span><b>{{ s.status }}</b>@if (s.notes) {<small>“{{ s.notes }}”</small>}</span><button class="vm-mini" (click)="reopen(s)">Re-open</button></div>
          }
          <div class="hist">
            <h4><app-icon name="history" [size]="20" />Approval History</h4>
            @for (h of s.history; track $index) {
              <div class="hi" [attr.data-t]="h.tone"><i><app-icon [name]="h.tone === 'red' ? 'vm-c-x' : 'vm-c-check'" [size]="13" [stroke]="3" /></i><div><b>{{ h.text }}</b><small>{{ h.at }}</small></div></div>
            }
          </div>
        </aside>
      }
    </div>

    @if (rejectOpen() && sel(); as s) {
      <div class="g-overlay" (click)="rejectOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doReject(rr.value, rn.value)">
        <div class="modal-head"><h3>Reject visit – {{ s.name }}</h3><button type="button" class="close-btn" (click)="rejectOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Reason<select #rr class="input">@for (x of rejectReasons; track x) {<option>{{ x }}</option>}</select></label>
          <label class="full">Message to host &amp; visitor<textarea #rn class="input ta2" rows="3" [value]="note()"></textarea></label>
        </div>
        <p class="muted">{{ s.host }} and the visitor will be notified by email. The request stays in the history.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rejectOpen.set(false)">Cancel</button><button class="btn-red" type="submit">Reject Visit</button></div>
      </form>
    }
    @if (changesOpen() && sel(); as s) {
      <div class="g-overlay" (click)="changesOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doChanges(cm.value)">
        <div class="modal-head"><h3>Request changes – {{ s.name }}</h3><button type="button" class="close-btn" (click)="changesOpen.set(false)">×</button></div>
        <p class="muted">What should {{ s.host }} update?</p>
        <div class="chk">@for (f of changeFields; track f) {<label><input type="checkbox" [checked]="fields().includes(f)" (change)="flipField(f)" />{{ f }}</label>}</div>
        <label class="full lbl">Message<textarea #cm class="input ta2" rows="3" placeholder="e.g. Please upload a clearer passport copy."></textarea></label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="changesOpen.set(false)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!fields().length">Send Request</button></div>
      </form>
    }
    @if (edit(); as e) {
      <div class="g-overlay" (click)="edit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEdit()">
        <div class="modal-head"><h3>Edit request – {{ e.name }}</h3><button type="button" class="close-btn" (click)="edit.set(null)">×</button></div>
        <div class="form-grid">
          <label>Purpose<select class="input" [value]="e.purpose" (change)="patchEdit('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select></label>
          <label>Host<select class="input" [value]="e.host" (change)="patchEdit('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
          <label>Site<select class="input" [value]="e.site" (change)="patchEdit('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Visit date<select class="input" [value]="'' + e.day" (change)="patchEdit('day', +$any($event.target).value)">@for (d of days; track d) {<option [value]="'' + d">{{ fmtDay(d) }}</option>}</select></label>
          <label>Time<select class="input" [value]="'' + e.time" (change)="patchEdit('time', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ fmtTime(t) }}</option>}</select></label>
          <label>Risk level<select class="input" [value]="e.risk" (change)="patchEdit('risk', $any($event.target).value)"><option>Low</option><option>Medium</option><option>High</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="edit.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Changes</button></div>
      </form>
    }
    @if (rulesOpen()) {
      <div class="g-overlay" (click)="rulesOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Approval Rules</h3><button type="button" class="close-btn" (click)="rulesOpen.set(false)">×</button></div>
        @for (r of st.rules(); track r.name; let i = $index) {
          <div class="rule"><div><b>{{ r.name }}</b><small>{{ r.desc }}</small></div><button class="vm-switch purple" [class.on]="r.on" (click)="toggleRule(i)"></button></div>
        }
        <div class="form-actions"><button class="btn-primary" (click)="rulesOpen.set(false); toast('Approval rules saved')">Done</button></div>
      </div>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .ap { display: grid; grid-template-columns: minmax(0, 1fr) 352px; gap: 14px; align-items: start; }
    .ap.no-panel { grid-template-columns: minmax(0, 1fr); }
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--primary); margin-bottom: 4px; }
    .crumb a { color: var(--primary); text-decoration: none; } .crumb b { font-weight: 500; }
    .vm-head h1 { font-size: 32px; }
    .vm-kpis { gap: 10px; }
    :host ::ng-deep .vm-kpi { padding: 12px 12px; gap: 10px; }
    :host ::ng-deep .vm-kpi-ic { width: 50px; height: 50px; }
    :host ::ng-deep .vm-kpi-label { font-size: 14px; white-space: normal; line-height: 1.2; }
    :host ::ng-deep .vm-kpi-val { font-size: 28px; }
    :host ::ng-deep .vm-kpi-chev { margin-left: 0; }
    .hb { height: 40px; padding: 0 18px; display: inline-flex; align-items: center; gap: 8px; font-size: 15px; }
    .vm-icon-btn.tall { height: 40px; width: 40px; }
    .menu-wrap { position: relative; }
    .dropdown { right: auto; left: 0; min-width: 220px; z-index: 30; }
    .dropdown.right { left: auto; right: 0; }
    .dd-item[disabled] { opacity: .45; cursor: not-allowed; }
    .dd-note { padding: 6px 12px; font-size: 12px; color: var(--muted); }
    .vm-actions .menu-wrap:last-child .dropdown { left: auto; right: 0; }
    .list { padding: 14px 16px 8px; display: flex; flex-direction: column; gap: 14px; }
    .tabs { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .tabs button { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; font: inherit; font-size: 14.5px; font-weight: 600; color: var(--text); padding: 9px 14px; border-radius: 10px; cursor: pointer; }
    .tabs button:hover { background: #f5f0ff; }
    .tabs button.on { background: var(--primary); color: #fff; box-shadow: 0 3px 10px rgba(124, 58, 237, .3); }
    .viewing { margin-left: auto; font-size: 12.5px; color: var(--muted); display: flex; gap: 8px; align-items: center; white-space: nowrap; } .viewing .vm-link { font-size: 12.5px; }
    .filters { display: flex; gap: 8px; align-items: stretch; }
    .filters .vm-search { height: 44px; flex: 1.3; min-width: 120px; }
    .fl { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; height: 44px; background: #fff; color: #334155; flex: 1; min-width: 0; } .fl app-icon { flex: none; }
    .fl span { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .fl small { font-size: 11.5px; color: var(--text); font-weight: 500; }
    .fl select { border: 0; outline: 0; font: inherit; font-size: 13.5px; background: transparent; cursor: pointer; color: var(--text); padding: 0; margin-left: -3px; width: 100%; }
    .rf { height: 44px; width: 44px; flex: none; } .rf.spin app-icon { animation: sp .7s linear; }
    @keyframes sp { to { transform: rotate(360deg); } }
    .tbl { overflow: auto; max-height: 470px; }
    .vm-table th { background: #f3f0ff; font-size: 13px; padding: 11px 4px; position: sticky; top: 0; z-index: 1; vertical-align: middle; }
    .vm-table td { padding: 11px 4px; font-size: 13px; }
    .vm-table :is(th, td):first-child { padding-left: 8px; }
    .vm-table :is(th, td):last-child { padding-right: 6px; }
    .vm-table :is(vm-status) { font-size: 12px; padding: 3px 7px; gap: 5px; }
    td.site { font-size: 12.5px; }
    .vm-table tr.sel td { background: #f1ebff; }
    .vm-table tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--primary); }
    .vm-table td.wrap { white-space: normal; max-width: 78px; padding-right: 8px; font-size: 12px; line-height: 1.35; }
    .vm-person { white-space: normal; gap: 8px; line-height: 1.25; }
    td.site { max-width: 88px; min-width: 80px; }
    .cb { width: 24px; } .cb input { width: 17px; height: 17px; accent-color: var(--primary); cursor: pointer; }
    .ac { text-align: center; }
    .dt { display: flex; gap: 4px; font-size: 12.5px; align-items: center; white-space: nowrap; line-height: 1.35; }
    .dt app-icon { color: #334155; }
    .vip { margin-left: 4px; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #a16207; }
    .vm-acts { gap: 0; } .vm-acts .ia { padding: 3px; }
    .foot { font-size: 12.5px; color: var(--muted); padding: 2px 4px 4px; display: flex; gap: 6px; align-items: center; }

    .panel { position: sticky; top: 10px; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .p-head { display: flex; align-items: center; }
    .p-head h2 { flex: 1; margin: 0; font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 10px; }
    .p-head h2 app-icon { color: var(--primary); }
    .x { border: 0; background: none; cursor: pointer; color: var(--text); padding: 4px; border-radius: 6px; } .x:hover { background: #f1edff; }
    .who { display: flex; gap: 16px; align-items: center; }
    .who h3 { margin: 0; font-size: 21px; font-weight: 800; } .who p { margin: 2px 0 6px; font-size: 14px; }
    .tchip { display: inline-block; padding: 3px 12px; border-radius: 6px; background: #ede9fe; color: #4c1d95; font-size: 13px; font-weight: 500; }
    .kv { display: grid; grid-template-columns: 124px 1fr; gap: 0; font-size: 13.5px; border-top: 1px solid #f0f0f6; }
    .kv > span, .kv > b, .kv > .areas { padding: 7px 0; border-bottom: 1px solid #f0f0f6; }
    .kv > span { display: flex; align-items: center; gap: 10px; font-weight: 600; } .kv > span app-icon { color: #334155; }
    .kv > span.top { align-items: flex-start; }
    .kv > b { font-weight: 500; }
    .areas { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .areas .vm-chip { background: #e8e4ff; }
    .add { border: 1px dashed #a78bfa; background: #fff; color: var(--primary); border-radius: 6px; font-size: 12px; padding: 3px 8px; cursor: pointer; }
    .comp { display: grid; grid-template-columns: 160px 1fr; gap: 6px 0; font-size: 13.5px; align-items: center; }
    .comp > span { display: flex; align-items: center; gap: 10px; font-weight: 600; } .comp > span app-icon { color: #334155; }
    .cs { justify-self: start; display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 6px; padding: 3px 10px; font: inherit; font-size: 13px; cursor: pointer; }
    .cs[data-t='ok'] { background: #dcfce7; color: #166534; } .cs[data-t='ok'] app-icon { color: #16a34a; }
    .cs[data-t='na'] { background: #f1f5f9; color: #334155; } .cs[data-t='na'] app-icon { color: #94a3b8; }
    .cs[data-t='warn'] { background: #fef3c7; color: #b45309; } .cs[data-t='blue'] { background: #dbeafe; color: #1d4ed8; }
    .cs[data-t='bad'] { background: #fee2e2; color: #b91c1c; }
    .cs:hover { filter: brightness(.96); }
    h4 { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font-size: 16px; font-weight: 700; } h4 app-icon { color: #334155; }
    .ta { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px 4px; } .ta.err { border-color: #f87171; }
    .ta textarea { width: 100%; border: 0; outline: 0; resize: none; font: inherit; font-size: 13.5px; }
    .ta small { display: block; text-align: right; color: var(--muted); font-size: 12px; }
    .err-t { color: #dc2626; font-size: 12px; margin: 4px 0 0; }
    .approve { height: 46px; font-size: 17px; gap: 10px; display: flex; align-items: center; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: -4px; }
    .two button { height: 40px; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .decided { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #dcfce7; color: #166534; }
    .decided[data-s='Rejected'] { background: #fee2e2; color: #b91c1c; }
    .decided span { flex: 1; display: flex; flex-direction: column; } .decided small { font-size: 12px; opacity: .8; }
    .hist { border: 1px solid #f0f0f6; border-radius: 12px; padding: 12px 14px; background: #fcfbff; max-height: 260px; overflow: auto; }
    .hi { display: flex; gap: 12px; position: relative; padding-bottom: 12px; }
    .hi:not(:last-child)::before { content: ''; position: absolute; left: 10px; top: 22px; bottom: 0; width: 2px; background: #bbf7d0; }
    .hi i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #22c55e; flex: none; }
    .hi[data-t='red'] i { background: #ef4444; } .hi[data-t='orange'] i { background: #f59e0b; } .hi[data-t='blue'] i { background: #3b82f6; }
    .hi b { display: block; font-size: 14px; font-weight: 600; } .hi small { font-size: 12.5px; color: var(--muted); }
    .btn-red { height: 38px; padding: 0 18px; border: 0; border-radius: 8px; background: #dc2626; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .ta2 { height: auto; padding: 8px 10px; font: inherit; resize: vertical; }
    .chk { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 12px; font-size: 13.5px; }
    .chk label { display: flex; gap: 8px; align-items: center; } .chk input { accent-color: var(--primary); }
    .lbl { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .rule { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f6; }
    .rule > div { flex: 1; } .rule b { display: block; font-size: 14px; } .rule small { color: var(--muted); font-size: 12.5px; }
    @media (max-width: 1350px) { .ap { grid-template-columns: minmax(0, 1fr); } .panel { position: static; } }
  `,
})
export class VisitorApprovals {
  protected readonly st = inject(ApprovalStore);
  private readonly router = inject(Router);
  protected readonly fmtDay = fmtDay;
  protected readonly fmtTime = fmtTime;
  protected readonly shortTime = shortTime;
  protected readonly hostOf = hostOf;
  protected readonly sites = SITES.slice(0, 4);
  protected readonly purposes = PURPOSES;
  protected readonly hosts = HOSTS;
  protected readonly rejectReasons = REJECT_REASONS;
  protected readonly changeFields = CHANGE_FIELDS;
  protected readonly days = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly times = Array.from({ length: 21 }, (_, i) => 480 + i * 30);

  protected readonly tab = signal<Tab>('pending');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly date = signal('');
  protected readonly purpose = signal('');
  protected readonly risk = signal('');
  protected readonly selId = signal<string | null>('APR-24017');
  protected readonly checked = signal(new Set<string>(['APR-24017']));
  protected readonly menu = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly noteErr = signal(false);
  protected readonly rejectOpen = signal(false);
  protected readonly changesOpen = signal(false);
  protected readonly rulesOpen = signal(false);
  protected readonly fields = signal<string[]>(['ID document']);
  protected readonly edit = signal<ApprRequest | null>(null);
  protected readonly spinning = signal(false);
  protected readonly msg = signal<string | null>(null);

  private readonly queue = computed(() => this.st.requests().filter((r) => this.isOpen(r) || r.recent));
  protected readonly tabDefs = computed(() => {
    const p = this.st.pending();
    return [
      { key: 'pending' as Tab, label: 'All Pending', icon: 'vm-c-clipboard', n: p.length },
      { key: 'mine' as Tab, label: 'My Approvals', icon: 'user', n: p.filter((r) => r.mine).length },
      { key: 'high' as Tab, label: 'High Priority', icon: 'triangle-alert', n: p.filter(this.isHigh).length },
      { key: 'today' as Tab, label: 'Today', icon: 'calendar-days', n: p.filter((r) => r.day === 0).length },
    ];
  });
  protected readonly rows = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase(), site = this.site(), d = this.date(), pu = this.purpose(), rk = this.risk();
    let l: ApprRequest[] =
      t === 'approved' ? this.st.requests().filter((r) => r.status === 'Approved')
      : t === 'rejected' ? this.st.requests().filter((r) => r.status === 'Rejected')
      : t === 'pending' ? this.queue()
      : this.st.pending().filter((r) => (t === 'mine' ? r.mine : t === 'high' ? this.isHigh(r) : r.day === 0));
    if (q) l = l.filter((r) => `${r.name} ${r.company} ${r.host} ${r.id}`.toLowerCase().includes(q));
    if (site) l = l.filter((r) => r.site === site);
    if (d) l = l.filter((r) => (d === '7' ? r.day <= 7 : r.day === +d));
    if (pu) l = l.filter((r) => r.purpose === pu);
    if (rk) l = l.filter((r) => r.risk === rk);
    return l;
  });
  protected readonly sel = computed(() => (this.selId() ? this.st.byId(this.selId()!) : null));
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.checked().has(r.id)));
  protected readonly areasLeft = computed(() => AREAS.filter((a) => !this.sel()?.areas.includes(a)));

  protected isOpen(r: ApprRequest) { return r.status === 'Pending Approval' || r.status === 'Changes Requested'; }
  private isHigh = (r: ApprRequest) => r.risk === 'High' || r.vip;

  protected setTab(t: Tab) { this.tab.set(t); }
  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.rejectOpen.set(false); this.changesOpen.set(false); this.rulesOpen.set(false); this.edit.set(null); }
  protected open(id: string) { if (this.selId() !== id) { this.note.set(''); this.noteErr.set(false); } this.selId.set(id); this.menu.set(null); }
  protected check(id: string) { this.checked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected checkAll(on: boolean) { this.checked.set(on ? new Set(this.rows().map((r) => r.id)) : new Set()); }
  protected selectAllPending() { this.checked.set(new Set(this.st.pending().filter((r) => r.risk === 'Low' && r.watch === 'Clear').map((r) => r.id))); this.menu.set(null); }
  protected go(p: string) { this.menu.set(null); this.router.navigate(['/visitor-management', p]); }

  /** After a decision, move the panel to the next open request in the current list. */
  private next(id: string) {
    const l = this.rows().filter((r) => this.isOpen(r) && r.id !== id);
    if (l.length) this.open(l[0].id);
  }
  protected approve() {
    const s = this.sel(); if (!s) return;
    this.menu.set(null);
    if ((s.risk === 'High' || s.watch !== 'Clear') && this.note().trim().length < 5) { this.noteErr.set(true); this.toast('Add a note to approve a high-risk / watchlist visit'); return; }
    this.st.approve(s.id, this.note().trim());
    this.toast(`${s.name} approved · host and visitor notified${s.day === 0 ? ' · added to today’s arrivals' : ''}`);
    this.uncheck([s.id]);
    this.next(s.id);
  }
  protected doReject(reason: string, msg: string) {
    const s = this.sel(); if (!s) return;
    this.st.reject(s.id, reason, msg.trim());
    this.rejectOpen.set(false);
    this.toast(`${s.name} rejected – ${reason}`);
    this.uncheck([s.id]);
    this.next(s.id);
  }
  protected flipField(f: string) { this.fields.update((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f])); }
  protected doChanges(m: string) {
    const s = this.sel(); if (!s) return;
    this.st.requestChanges(s.id, this.fields(), m.trim());
    this.changesOpen.set(false);
    this.toast(`Change request sent to ${s.host}`);
  }
  protected reopen(r: ApprRequest) {
    this.st.patch(r.id, { status: 'Pending Approval', recent: false });
    this.st.note(r.id, 'Re-opened for review by Demo login', 'orange');
    this.open(r.id);
    this.toast(`${r.name} is back in the pending queue`);
  }
  protected escalate(r: ApprRequest) {
    this.st.patch(r.id, { risk: 'High' });
    this.st.note(r.id, 'Escalated to Security Desk for review', 'orange');
    this.menu.set(null);
    this.toast(`${r.name} escalated to Security`);
  }
  protected remind(r: ApprRequest) { this.st.note(r.id, `Reminder sent to ${r.host}`); this.menu.set(null); this.toast(`Reminder sent to ${r.host}`); }
  protected copy(r: ApprRequest) { navigator.clipboard?.writeText(r.id).catch(() => {}); this.menu.set(null); this.toast(`${r.id} copied`); }
  private uncheck(ids: string[]) { this.checked.update((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; }); }

  protected bulk(kind: 'approve' | 'reject' | 'mine' | 'remind' | 'export') {
    const ids = [...this.checked()];
    const reqs = ids.map((i) => this.st.byId(i)!).filter(Boolean);
    this.menu.set(null);
    if (kind === 'export') { this.exportCsv(reqs); return; }
    const open = reqs.filter((r) => this.isOpen(r));
    if (kind === 'approve') {
      const ok = open.filter((r) => r.risk !== 'High' && r.watch === 'Clear');
      ok.forEach((r) => this.st.approve(r.id, 'Bulk approved'));
      const skipped = open.length - ok.length;
      this.toast(`${ok.length} approved${skipped ? ` · ${skipped} high-risk / watchlist skipped (review individually)` : ''}`);
      this.uncheck(ok.map((r) => r.id));
    } else if (kind === 'reject') {
      open.forEach((r) => this.st.reject(r.id, 'Bulk rejected', ''));
      this.toast(`${open.length} request(s) rejected`);
      this.uncheck(open.map((r) => r.id));
    } else if (kind === 'mine') {
      open.forEach((r) => this.st.patch(r.id, { mine: true }));
      this.toast(`${open.length} request(s) assigned to you`);
    } else {
      reqs.forEach((r) => this.st.note(r.id, `Reminder sent to ${r.host}`));
      this.toast(`Reminders sent to ${new Set(reqs.map((r) => r.host)).size} host(s)`);
    }
    if (this.sel() && !this.isOpen(this.sel()!)) this.next(this.sel()!.id);
  }

  protected removeArea(s: ApprRequest, a: string) {
    if (s.areas.length <= 1) { this.toast('At least one access area is required'); return; }
    this.st.patch(s.id, { areas: s.areas.filter((x) => x !== a) });
    this.st.note(s.id, `Access area removed: ${a}`);
  }
  protected addArea(s: ApprRequest, a: string) {
    this.st.patch(s.id, { areas: [...s.areas, a] });
    this.st.note(s.id, `Access area added: ${a}`);
    this.menu.set(null);
  }
  protected cycle(s: ApprRequest, k: 'idv' | 'nda' | 'safety' | 'watch') {
    if (k === 'idv') {
      if (s.idv === 'Verified') { this.toast('ID already verified'); return; }
      this.st.patch(s.id, { idv: 'Verified' }); this.st.note(s.id, 'ID document verified', 'green'); this.toast('ID document verified');
    } else if (k === 'nda') {
      if (s.nda !== 'Pending') { this.toast(s.nda === 'Signed' ? 'NDA already signed' : 'NDA not required for this visit'); return; }
      this.st.patch(s.id, { nda: 'Signed' }); this.st.note(s.id, 'NDA signed electronically by visitor', 'green'); this.toast('NDA sent & signed');
    } else if (k === 'safety') {
      const nx = s.safety === 'Required' ? 'Link Sent' : s.safety === 'Link Sent' ? 'Completed' : null;
      if (!nx) { this.toast(`Safety briefing: ${s.safety}`); return; }
      this.st.patch(s.id, { safety: nx });
      this.st.note(s.id, nx === 'Link Sent' ? 'Safety briefing video link sent to visitor' : 'Safety briefing completed', nx === 'Completed' ? 'green' : 'blue');
      this.toast(nx === 'Link Sent' ? 'Safety briefing link sent' : 'Safety briefing marked completed');
    } else {
      if (s.watch === 'Clear') { this.st.note(s.id, 'Watchlist re-screened – no match', 'green'); this.toast('Re-screened · no watchlist match'); return; }
      this.st.patch(s.id, { watch: 'Clear' }); this.st.note(s.id, 'Watchlist match reviewed – false positive, cleared', 'green'); this.toast('Watchlist match cleared as false positive');
    }
  }

  protected openEdit(r: ApprRequest) { this.edit.set({ ...r }); this.menu.set(null); }
  protected patchEdit<K extends keyof ApprRequest>(k: K, v: ApprRequest[K]) { this.edit.update((e) => (e ? { ...e, [k]: v } : e)); }
  protected saveEdit() {
    const e = this.edit(); if (!e) return;
    const { id, purpose, host, site, day, time, risk } = e;
    this.st.patch(id, { purpose, host, site, day, time, risk });
    this.st.note(id, 'Request details updated by Demo login');
    this.edit.set(null);
    this.open(id);
    this.toast('Request updated');
  }
  protected toggleRule(i: number) { this.st.rules.update((l) => l.map((r, j) => (j === i ? { ...r, on: !r.on } : r))); }

  protected refresh() {
    this.q.set(''); this.site.set(''); this.date.set(''); this.purpose.set(''); this.risk.set('');
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast('Queue refreshed');
  }
  protected exportCsv(l: ApprRequest[]) {
    downloadCsv('visitor-approvals.csv', [
      ['Request ID', 'Visitor', 'Company', 'Type', 'Purpose', 'Host', 'Site', 'Date', 'Time', 'Risk', 'ID', 'NDA', 'Safety', 'Watchlist', 'Status'],
      ...l.map((r) => [r.id, r.name, r.companyFull, r.type, r.purpose, r.host, r.site, fmtDay(r.day), fmtTime(r.time), r.risk, r.idv, r.nda, r.safety, r.watch, r.status]),
    ]);
    this.toast(`Exported ${l.length} request(s)`);
  }
  protected print() { window.print(); }
  protected toast(m: string) { this.msg.set(m); setTimeout(() => this.msg.set(null), 2600); }
}
