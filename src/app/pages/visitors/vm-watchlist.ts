import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { VmStore, hm } from './vm.data';
import { AlertStatus, RegistryEntry, RestrictionType, ScreenAlert, WatchRule, WatchStore } from './vm-watchlist.data';

const TABS = ['All Records', 'Watchlist', 'Restricted', 'Open Alerts', 'Cleared'];
const SRC_ICON: Record<string, string> = { 'Internal Watchlist': 'shield', 'Restricted Visitors': 'admin-lock', 'Screening Service': 's-cloud' };
const MATCH_ICON: Record<string, string> = { 'Name similarity': 'layers', 'Document match': 'file-text', 'No match': 'w-check-circle', 'Biometric match': 'fingerprint' };
const TYPE_ICON: Record<string, string> = { Restricted: 'admin-lock', Watchlist: 'shield', 'Temporary Restriction': 'clock' };
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

@Component({
  selector: 'app-vm-watchlist',
  imports: [...UI, ...VM_UI, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/"><app-icon name="home" [size]="15" /></a><app-icon name="chevron-right" [size]="13" /><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Watchlist &amp; Restricted Visitors</b></nav>
          <h1>Watchlist &amp; Restricted Visitors</h1>
          <p>Screen visitors, manage restrictions, and respond to security alerts.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openAdd()"><app-icon name="plus" [size]="18" />Add to Watchlist</button>
          <button class="btn-outline hb" (click)="importOpen.set(true)"><app-icon name="tasks-upload" [size]="18" />Bulk Import</button>
          <button class="btn-outline hb dark" (click)="exportAll()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="menu.set(menu() === 'top' ? null : 'top'); $event.stopPropagation()"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'top') {
              <div class="dropdown" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="exportAlerts()"><app-icon name="download" [size]="15" />Export alerts (CSV)</button>
                <button class="dd-item" (click)="rescreen()"><app-icon name="refresh" [size]="15" />Re-screen on-site visitors</button>
                <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="file-text" [size]="15" />Print summary</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Active Watchlist" [value]="ws.activeWatchlist()" icon="shield" color="#7c3aed" [clickable]="true" [active]="tab() === 'Watchlist'" (pick)="tab.set('Watchlist')" />
        <vm-kpi label="Open Alerts" [value]="ws.openAlerts()" icon="triangle-alert" color="#dc2626" [clickable]="true" [active]="tab() === 'Open Alerts'" (pick)="tab.set('Open Alerts')" />
        <vm-kpi label="Restricted Visitors" [value]="ws.restricted()" icon="admin-lock" color="#ea580c" [clickable]="true" [active]="tab() === 'Restricted'" (pick)="tab.set('Restricted')" />
        <vm-kpi label="Cleared Today" [value]="ws.clearedToday()" icon="w-check-circle" color="#16a34a" [clickable]="true" [active]="tab() === 'Cleared'" (pick)="tab.set('Cleared')" />
      </section>

      <div class="vm-bar">
        <div class="seg">@for (t of tabs; track t) {<button type="button" [class.on]="t === tab()" (click)="tab.set(t)">{{ t }}</button>}</div>
        <span class="vm-sep"></span>
        <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search visitor, name, document number..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="layers" [size]="15" /><span>Risk Level:</span>
          <select [value]="risk()" (change)="risk.set($any($event.target).value)"><option value="">All</option>@for (o of ['High', 'Medium', 'Low']; track o) {<option [value]="o">{{ o }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="shield" [size]="15" /><span>Restriction Type:</span>
          <select [value]="rtype()" (change)="rtype.set($any($event.target).value)"><option value="">All</option>@for (o of types; track o) {<option [value]="o">{{ o }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="map-pin" [size]="15" /><span>Site:</span>
          <select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (o of sites; track o) {<option [value]="o">{{ o }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="sliders" [size]="15" /><span>Status:</span>
          <select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All</option>@for (o of statuses; track o) {<option [value]="o">{{ o }}</option>}</select></label>
        <button class="vm-icon-btn" title="Reset filters" (click)="reset()"><app-icon name="refresh" [size]="16" /></button>
      </div>

      <div class="grid">
        <div class="col">
          <section class="vm-card">
            <div class="vm-card-head"><h2><app-icon name="shield-check" [size]="24" />Security Screening Alerts</h2><span class="spacer"></span><small class="muted">{{ alerts().length }} of {{ ws.alerts().length }}</small></div>
            <div class="tw">
              <table class="vm-table alerts">
                <thead><tr>
                  <th class="sort" (click)="sortBy('name')">Visitor</th><th>Match Type</th><th class="sort c" (click)="sortBy('conf')">Match<br />Confidence</th><th>Source</th><th>Site</th>
                  <th class="sort" (click)="sortBy('id')">Detected At</th><th class="sort" (click)="sortBy('risk')">Risk Level</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (a of alerts(); track a.id) {
                    <tr class="click" [class.sel]="a.id === selId()" (click)="selId.set(a.id)">
                      <td><span class="vm-person"><vm-avatar [name]="a.name" [size]="28" />{{ a.name }}</span></td>
                      <td><span class="ic-txt" [class.ok]="a.match === 'No match'"><app-icon [name]="matchIcon[a.match]" [size]="17" />{{ a.match }}</span></td>
                      <td class="c"><span class="conf">{{ a.conf }}%</span></td>
                      <td><span class="ic-txt two"><app-icon [name]="srcIcon[a.source]" [size]="17" /><span>{{ split(a.source, ' ')[0] }}<br />{{ split(a.source, ' ')[1] }}</span></span></td>
                      <td><span class="ic-txt two"><app-icon name="map-pin" [size]="16" /><span>{{ split(a.site, ' – ')[0] }} –<br />{{ split(a.site, ' – ')[1] }}</span></span></td>
                      <td><span class="ic-txt two"><app-icon name="calendar-days" [size]="16" /><span>{{ split(a.detected, ' ')[0] }}@if (split(a.detected, ' ')[1]) {<br />{{ a.detected.slice(a.detected.indexOf(' ') + 1) }}}</span></span></td>
                      <td><vm-status [label]="a.risk" [tone]="riskTone(a.risk)" /></td>
                      <td><span class="st" [attr.data-s]="a.status">{{ a.status }}</span></td>
                      <td (click)="$event.stopPropagation()">
                        <div class="vm-acts">
                          @switch (rowAct(a)) {
                            @case ('Clear') { <button class="vm-mini w" (click)="selId.set(a.id); clearAlert(a)"><app-icon name="tasks-check" [size]="14" />Clear</button> }
                            @case ('Restrict') { <button class="vm-mini w" (click)="selId.set(a.id); restrict(a)"><app-icon name="admin-lock" [size]="14" />Restrict</button> }
                            @default { <button class="vm-mini w" (click)="selId.set(a.id)"><app-icon name="eye" [size]="14" />Review</button> }
                          }
                          <div class="menu-wrap">
                            <button class="dots" (click)="menu.set(menu() === 'a' + a.id ? null : 'a' + a.id)"><app-icon name="more" [size]="16" /></button>
                            @if (menu() === 'a' + a.id) {
                              <div class="dropdown">
                                <button class="dd-item" (click)="selId.set(a.id); menu.set(null)"><app-icon name="eye" [size]="15" />View profile</button>
                                <button class="dd-item" (click)="restrict(a)"><app-icon name="admin-lock" [size]="15" />Confirm restriction</button>
                                <button class="dd-item" (click)="clearAlert(a)"><app-icon name="tasks-check" [size]="15" />Clear alert</button>
                                <button class="dd-item" (click)="review(a)"><app-icon name="file-text" [size]="15" />Request security review</button>
                                <button class="dd-item" (click)="reopen(a)"><app-icon name="refresh" [size]="15" />Re-open alert</button>
                              </div>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  } @empty { <tr><td colspan="9" class="vm-empty">No alerts match the current filters.</td></tr> }
                </tbody>
              </table>
            </div>
          </section>

          <section class="vm-card">
            <div class="vm-card-head"><h2><app-icon name="settings" [size]="24" />Watchlist &amp; Restriction Rules</h2><span class="spacer"></span>
              <button class="btn-outline nr" (click)="editRule(null)"><app-icon name="plus" [size]="16" />New Rule</button></div>
            <div class="rules">
              @for (r of ws.rules(); track r.id) {
                <div class="rule" [style.--rc]="r.color" [class.off]="!r.on">
                  <div class="rh"><app-icon [name]="r.icon" [size]="20" /><b>{{ r.name }}</b><button class="vm-switch" [class.on]="r.on" (click)="toggleRule(r)" [attr.aria-label]="'Toggle ' + r.name"></button></div>
                  <p><app-icon name="sun" [size]="14" /><span><b>Trigger:</b> {{ r.trigger }}</span></p>
                  <p><app-icon name="w-zap" [size]="14" /><span><b>Action:</b> {{ r.action }}</span></p>
                  <p><app-icon name="users" [size]="14" /><span><b>Notification Recipients:</b> {{ r.recipients }}</span></p>
                  <button class="vm-link edit" (click)="editRule(r)"><app-icon name="tasks-pencil" [size]="13" />Edit</button>
                </div>
              }
            </div>
          </section>
        </div>

        <section class="vm-card prof">
          @if (sel(); as a) {
            @let v = store.byName(a.name);
            <div class="vm-card-head"><h2><app-icon name="user" [size]="26" />Visitor Security Profile</h2><span class="spacer"></span>
              <span class="hdr-pill" [attr.data-s]="a.status"><app-icon [name]="a.status === 'Cleared' ? 'shield-check' : a.status === 'Restricted' ? 'admin-lock' : 'triangle-alert'" [size]="16" />{{ resultLabel(a) }}</span></div>
            <div class="pbody">
              <vm-avatar [name]="a.name" [size]="92" [square]="true" />
              <div class="pinfo">
                <h3>{{ a.name }}</h3>
                <div class="kv">
                  <span><app-icon name="building" [size]="15" />Company: {{ v?.company ?? '—' }}</span>
                  <span><app-icon name="id-card" [size]="15" />Document ID: {{ v?.idNo ?? '—' }}</span>
                  <span><app-icon name="user" [size]="15" />Host: {{ v?.host ?? '—' }}</span>
                  <span><app-icon name="calendar-days" [size]="15" />Visit Purpose: {{ v?.purpose ?? '—' }}</span>
                  <span><app-icon name="map-pin" [size]="15" />Site: {{ a.site }}</span>
                </div>
              </div>
              <div class="pres">
                <div class="pr"><small>Screening Result</small><span class="hdr-pill sm" [attr.data-s]="a.status">{{ resultLabel(a) }}</span></div>
                <div class="pr"><small>Confidence</small><span class="cpill" [class.hi]="a.conf >= 90" [class.lo]="a.conf < 50">{{ a.conf }}%</span></div>
                <div><small>Match Reason</small><p>{{ a.reason }}</p></div>
                <div><small>Last Incident</small><p>{{ a.incident }}</p></div>
              </div>
            </div>
            <div class="pacts">
              <button class="b-red" [disabled]="a.status === 'Restricted'" (click)="restrict(a)"><app-icon name="admin-lock" [size]="16" />Confirm Restriction</button>
              <button class="b-green" [disabled]="a.status === 'Cleared'" (click)="clearAlert(a)"><app-icon name="tasks-check" [size]="16" />Clear Alert</button>
              <button class="b-purple" (click)="review(a)"><app-icon name="file-text" [size]="16" />Request Security Review</button>
            </div>
            <div class="banner" [attr.data-s]="a.status"><app-icon [name]="a.status === 'Cleared' ? 'shield-check' : 'triangle-alert'" [size]="20" />{{ bannerText(a) }}</div>
            <div class="audit">
              <h4><app-icon name="history" [size]="19" />Audit Trail</h4>
              <ul>
                @for (e of a.audit; track $index) { <li><i></i><span><b>{{ e.title }}</b> – {{ e.at }} – {{ e.by }}</span></li> }
              </ul>
            </div>
          } @else {
            <div class="vm-empty">Select an alert to see the visitor security profile.</div>
          }
        </section>
      </div>

      <section class="vm-card">
        <div class="vm-card-head"><h2><app-icon name="users" [size]="24" />Restricted Visitor Registry</h2><span class="spacer"></span><small class="muted">{{ registry().length }} entries</small></div>
        <div class="tw">
          <table class="vm-table reg">
            <thead><tr>
              <th class="sort" (click)="rsortBy('name')">Visitor</th><th class="sort" (click)="rsortBy('type')">Restriction Type</th><th>Reason</th><th>Added By</th>
              <th class="sort" (click)="rsortBy('addedOn')">Added On</th><th class="sort" (click)="rsortBy('review')">Review Date</th><th>Sites</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              @for (r of registry(); track r.id) {
                <tr>
                  <td><span class="vm-person"><vm-avatar [name]="r.name" [size]="30" />{{ r.name }}</span></td>
                  <td><span class="type" [attr.data-t]="r.type"><app-icon [name]="typeIcon[r.type]" [size]="15" />{{ r.type }}</span></td>
                  <td>{{ r.reason }}</td>
                  <td><span class="ic-txt"><app-icon name="user" [size]="16" />{{ r.addedBy }}</span></td>
                  <td><span class="ic-txt"><app-icon name="calendar-days" [size]="16" />{{ r.addedOn }}</span></td>
                  <td><span class="ic-txt"><app-icon name="calendar-days" [size]="16" />{{ r.review }}</span></td>
                  <td><span class="ic-txt"><app-icon name="map-pin" [size]="16" />{{ r.sites }}</span></td>
                  <td><vm-status [label]="r.status" [icon]="r.status === 'Active' ? 'w-check-circle' : r.status === 'Removed' ? 'ban' : 'clock'" [tone]="r.status === 'Active' ? 'green' : r.status === 'Removed' ? 'grey' : 'orange'" /></td>
                  <td>
                    <div class="vm-acts">
                      <button class="vm-mini w" (click)="viewEntry.set(r)"><app-icon name="eye" [size]="14" />View</button>
                      <button class="vm-mini w" (click)="openAdd(r)"><app-icon name="tasks-pencil" [size]="13" />Edit</button>
                      <button class="vm-mini w" (click)="auditEntry.set(r)"><app-icon name="file-text" [size]="14" />Audit</button>
                      <div class="menu-wrap">
                        <button class="dots" (click)="menu.set(menu() === 'r' + r.id ? null : 'r' + r.id)"><app-icon name="more" [size]="16" /></button>
                        @if (menu() === 'r' + r.id) {
                          <div class="dropdown">
                            <button class="dd-item" (click)="extend(r)"><app-icon name="calendar-days" [size]="15" />Extend review by 30 days</button>
                            @if (r.status === 'Removed') {
                              <button class="dd-item" (click)="reinstate(r)"><app-icon name="refresh" [size]="15" />Reinstate entry</button>
                            } @else {
                              <button class="dd-item danger" (click)="confirmRemove.set(r); menu.set(null)"><app-icon name="tasks-trash" [size]="15" />Remove from list</button>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="9" class="vm-empty">No registry entries match the current filters.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    @if (menu()) { <div class="click-catch" (click)="menu.set(null)"></div> }

    @if (addOpen()) {
      <div class="g-overlay" (click)="addOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEntry()">
        <div class="modal-head"><h3>{{ editId() ? 'Edit Registry Entry' : 'Add to Watchlist' }}</h3><button type="button" class="close-btn" (click)="addOpen.set(false)">×</button></div>
        <div class="form-grid">
          <div class="vm-field full"><label>Visitor name <b>*</b></label><div class="vm-input" [class.err]="tried() && !f().name.trim()"><app-icon name="user" [size]="15" /><input [value]="f().name" (input)="setF('name', $any($event.target).value)" placeholder="Full name as on ID" /></div></div>
          <div class="vm-field"><label>Restriction type</label><div class="vm-input"><select [value]="f().type" (change)="setF('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></div></div>
          <div class="vm-field"><label>Sites</label><div class="vm-input"><select [value]="f().sites" (change)="setF('sites', $any($event.target).value)">@for (s of ['All Sites', 'Main Campus', 'Plant Site', 'Executive Entrance']; track s) {<option [value]="s">{{ s }}</option>}</select></div></div>
          <div class="vm-field full"><label>Reason <b>*</b></label><div class="vm-input" [class.err]="tried() && !f().reason.trim()"><input [value]="f().reason" (input)="setF('reason', $any($event.target).value)" placeholder="e.g. Prior access violation" /></div></div>
          <div class="vm-field"><label>Review date</label><div class="vm-input"><input type="date" [value]="f().review" (input)="setF('review', $any($event.target).value)" /></div></div>
          <div class="vm-field"><label>Added by</label><div class="vm-input"><select [value]="f().addedBy" (change)="setF('addedBy', $any($event.target).value)">@for (s of ['Security Admin', 'Compliance', 'Front Desk', 'Priya Sharma']; track s) {<option [value]="s">{{ s }}</option>}</select></div></div>
        </div>
        @if (!editId() && f().name.trim() && store.byName(f().name.trim()); as v) {
          <div class="hint"><app-icon name="triangle-alert" [size]="16" />{{ v.name }} is a known visitor ({{ v.status }}, {{ v.site }}). Adding a restriction will raise a screening alert.</div>
        }
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="addOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">{{ editId() ? 'Save Changes' : 'Add to Watchlist' }}</button></div>
      </form>
    }

    @if (ruleForm(); as rf) {
      <div class="g-overlay" (click)="ruleForm.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveRule()">
        <div class="modal-head"><h3>{{ rf.id ? 'Edit Rule – ' + rf.name : 'New Screening Rule' }}</h3><button type="button" class="close-btn" (click)="ruleForm.set(null)">×</button></div>
        <div class="form-grid">
          <div class="vm-field full"><label>Rule name <b>*</b></label><div class="vm-input"><input [value]="rf.name" (input)="patchRule('name', $any($event.target).value)" /></div></div>
          <div class="vm-field full"><label>Trigger</label><div class="vm-input"><input [value]="rf.trigger" (input)="patchRule('trigger', $any($event.target).value)" /></div></div>
          <div class="vm-field full"><label>Action</label><div class="vm-input"><select [value]="rf.action" (change)="patchRule('action', $any($event.target).value)">@for (o of ruleActions(rf.action); track o) {<option [value]="o">{{ o }}</option>}</select></div></div>
          <div class="vm-field full"><label>Notification recipients</label>
            <div class="chips">@for (g of groups; track g) {<button type="button" class="vm-chip" [class.off]="!rf.recipients.includes(g)" (click)="toggleRecipient(g)">{{ g }}</button>}</div></div>
          <div class="vm-field"><label>Enabled</label><button type="button" class="vm-switch" [class.on]="rf.on" (click)="patchRule('on', !rf.on)"></button></div>
        </div>
        <div class="form-actions">
          @if (rf.id) { <button type="button" class="btn-ghost danger" (click)="deleteRule(rf.id)">Delete rule</button><span class="spacer"></span> }
          <button type="button" class="btn-ghost" (click)="ruleForm.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!rf.name.trim()">Save Rule</button></div>
      </form>
    }

    @if (importOpen()) {
      <div class="g-overlay" (click)="importOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Bulk Import Watchlist</h3><button type="button" class="close-btn" (click)="importOpen.set(false)">×</button></div>
        <label class="drop"><app-icon name="tasks-upload" [size]="30" /><b>{{ importFile() || 'Drop a CSV file here or click to browse' }}</b><small>Columns: name, restriction type, reason, sites, review date</small>
          <input type="file" accept=".csv" hidden (change)="importFile.set($any($event.target).files?.[0]?.name ?? '')" /></label>
        <button class="vm-link" (click)="importFile.set('watchlist_sample.csv')">Use sample file (3 records)</button>
        <div class="form-actions"><button class="btn-ghost" (click)="importOpen.set(false)">Cancel</button><button class="btn-primary" [disabled]="!importFile()" (click)="doImport()">Import</button></div>
      </div>
    }

    @if (viewEntry(); as r) {
      <div class="g-overlay" (click)="viewEntry.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Registry Entry</h3><button class="close-btn" (click)="viewEntry.set(null)">×</button></div>
        <div class="dhead"><vm-avatar [name]="r.name" [size]="64" [square]="true" /><div><h3>{{ r.name }}</h3><span class="type" [attr.data-t]="r.type"><app-icon [name]="typeIcon[r.type]" [size]="15" />{{ r.type }}</span></div></div>
        <div class="vm-kv dkv">
          <span>Reason</span><b>{{ r.reason }}</b><span>Added by</span><b>{{ r.addedBy }}</b><span>Added on</span><b>{{ r.addedOn }}</b>
          <span>Review date</span><b>{{ r.review }}</b><span>Sites</span><b>{{ r.sites }}</b><span>Status</span><b><vm-status [label]="r.status" /></b>
        </div>
        <div class="form-actions"><button class="btn-outline" (click)="viewEntry.set(null); openAdd(r)">Edit</button><button class="btn-outline" (click)="viewEntry.set(null); auditEntry.set(r)">Audit log</button></div>
      </aside>
    }

    @if (auditEntry(); as r) {
      <div class="g-overlay" (click)="auditEntry.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Audit – {{ r.name }}</h3><button class="close-btn" (click)="auditEntry.set(null)">×</button></div>
        <div class="audit"><ul>@for (e of reg(r.id)?.audit ?? []; track $index) { <li><i></i><span><b>{{ e.title }}</b> – {{ e.at }} – {{ e.by }}</span></li> }</ul></div>
      </aside>
    }

    @if (confirmRemove(); as r) {
      <div class="g-overlay" (click)="confirmRemove.set(null)"></div>
      <div class="g-modal sm">
        <div class="modal-head"><h3>Remove {{ r.name }}?</h3><button class="close-btn" (click)="confirmRemove.set(null)">×</button></div>
        <p>The {{ r.type.toLowerCase() }} entry will be marked as removed and the visitor will no longer be blocked at check-in.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="confirmRemove.set(null)">Cancel</button><button class="vm-btn-danger" (click)="remove(r)">Remove</button></div>
      </div>
    }

    @if (toast()) { <div class="g-toast">{{ toast() }}</div> }
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #334155; margin-bottom: 2px; }
    .crumb a { color: inherit; text-decoration: none; display: inline-flex; } .crumb a:hover { color: var(--primary); } .crumb b { font-weight: 600; }
    .hb { height: 40px; font-size: 15px; padding: 0 22px; }
    .btn-outline.dark { color: var(--text); border-color: var(--border); }
    .vm-icon-btn.tall { height: 40px; }
    .muted { color: var(--muted); }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
    .seg button { border: 0; border-left: 1px solid var(--border); background: #fff; padding: 8px 15px; font-size: 13.5px; font-weight: 500; cursor: pointer; white-space: nowrap; color: var(--text); }
    .seg button:first-child { border-left: 0; }
    .seg button.on { background: var(--primary); color: #fff; font-weight: 600; }
    .vm-bar { flex-wrap: nowrap; gap: 6px; } .vm-bar .vm-search { min-width: 150px; } .vm-bar .vm-filter { flex: none; gap: 4px; padding: 0 6px; font-size: 12.5px; } .vm-bar .vm-filter select { font-size: 12.5px; field-sizing: content; max-width: 150px; } .seg { flex: none; }
    @media (max-width: 1500px) { .vm-bar { flex-wrap: wrap; } }
    .grid { display: grid; grid-template-columns: minmax(0, 2.3fr) minmax(380px, 1fr); gap: 14px; align-items: stretch; }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .tw { overflow-x: auto; }
    .alerts { font-size: 12px; } .alerts td { padding: 5px 4px; } .alerts th { padding: 7px 4px; font-size: 12px; } .alerts th:first-child, .alerts td:first-child { padding-left: 6px; } .alerts td:nth-child(2) { padding-right: 0; } .alerts .vm-person { gap: 6px; } .alerts .vm-mini.w { min-width: 60px; padding: 3px 5px; font-size: 11.5px; } .alerts .vm-pill, .alerts .st { padding: 3px 7px; font-size: 12px; } .alerts .conf { padding: 3px 7px; } .alerts .vm-acts { gap: 4px; } .alerts .ic-txt { gap: 4px; } .alerts .ic-txt app-icon { width: 15px; } .alerts .dots { width: 24px; }
    .alerts .ic-txt { gap: 5px; }
    th.c, td.c { text-align: center; }
    .ic-txt { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; } .ic-txt app-icon { color: #475569; flex: none; }
    .ic-txt.two span { white-space: nowrap; line-height: 1.2; display: block; font-size: 12px; }
    .ic-txt.ok app-icon { color: #16a34a; }
    .conf { display: inline-block; background: #ede9fe; color: #5b21b6; font-weight: 700; border-radius: 8px; padding: 3px 10px; }
    .st { display: inline-block; padding: 3px 10px; border-radius: 7px; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
    .st[data-s='Open'] { background: #ede9fe; color: #6d28d9; } .st[data-s='Under Review'] { background: #fef3c7; color: #92400e; }
    .st[data-s='Cleared'] { background: #dcfce7; color: #15803d; } .st[data-s='Restricted'] { background: #fee2e2; color: #dc2626; }
    .vm-mini.w { min-width: 74px; justify-content: center; }
    .dots { border: 1px solid var(--border); background: #fff; border-radius: 6px; width: 26px; height: 26px; display: grid; place-items: center; cursor: pointer; color: #334155; }
    .dots:hover { border-color: #c4b5fd; color: var(--primary); }
    .dd-item.danger { color: #dc2626; }
    .click-catch { position: fixed; inset: 0; z-index: 30; }
    .menu-wrap .dropdown { z-index: 41; }
    .menu-wrap { z-index: auto; }
    .menu-wrap:has(.dropdown) { z-index: 41; position: relative; }
    .vm-table tr.sel td { background: #f3edff; } .vm-table tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--primary); }
    .nr { padding: 6px 14px; font-size: 13.5px; }
    .rules { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .rule { --rc: #7c3aed; position: relative; border: 1px solid color-mix(in srgb, var(--rc) 25%, #fff); border-radius: 10px; padding: 10px 10px 30px; background: linear-gradient(180deg, color-mix(in srgb, var(--rc) 5%, #fff), #fff); font-size: 11.5px; min-width: 0; }
    .rule.off { opacity: .6; filter: grayscale(.4); }
    .rh { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; color: var(--rc); }
    .rh b { font-size: 13.5px; flex: 1; min-width: 0; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rh .vm-switch { width: 34px; height: 19px; } .rh .vm-switch::after { width: 13px; height: 13px; } .rh .vm-switch.on::after { left: 18px; }
    .rule p { margin: 0 0 6px; display: flex; gap: 6px; line-height: 1.3; color: #1f2937; }
    .rule p app-icon { flex: none; margin-top: 1px; color: #334155; }
    .rule .edit { position: absolute; right: 10px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; }
    .prof { display: flex; flex-direction: column; gap: 12px; }
    .prof .vm-card-head { margin-bottom: 0; } .prof .vm-card-head h2 { white-space: nowrap; font-size: 18px; }
    .hdr-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 8px; font-weight: 600; font-size: 14px; background: #fee2e2; color: #b91c1c; white-space: nowrap; }
    .hdr-pill.sm { font-size: 12.5px; padding: 3px 9px; }
    .hdr-pill[data-s='Cleared'] { background: #dcfce7; color: #15803d; } .hdr-pill[data-s='Open'] { background: #fff1e6; color: #c2410c; }
    .pbody { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; align-items: start; }
    .pinfo h3 { font-size: 19px; font-weight: 700; margin: 0 0 8px; }
    .kv { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; } .kv span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block !important; } .kv span app-icon { vertical-align: -3px; margin-right: 6px; display: inline-block; }
    .kv span { display: flex; align-items: center; gap: 7px; } .kv app-icon { color: #475569; flex: none; }
    .pres { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; border-top: 1px solid var(--border); padding-top: 10px; font-size: 12.5px; }
    @media (min-width: 1900px) { .pbody { grid-template-columns: 92px minmax(0, 1.25fr) minmax(0, 1fr); } .pres { grid-column: auto; display: flex; flex-direction: column; border-top: 0; padding-top: 0; border-left: 1px solid var(--border); padding-left: 12px; } }
    .pres small { font-weight: 700; font-size: 12px; color: var(--text); }
    .pres p { margin: 1px 0 0; }
    .pr { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
    .cpill { background: #fff1e6; color: #c2410c; font-weight: 700; border-radius: 7px; padding: 3px 12px; }
    .cpill.hi { background: #fee2e2; color: #dc2626; } .cpill.lo { background: #dcfce7; color: #15803d; }
    .pacts { display: flex; gap: 7px; flex-wrap: wrap; }
    .pacts button { height: 38px; border-radius: 8px; font-weight: 600; font-size: 13.5px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; white-space: nowrap; padding: 0 8px; flex: 1 1 auto; font-size: 12.5px; }
    .pacts button:disabled { opacity: .5; cursor: default; }
    .b-red { background: linear-gradient(90deg, #dc2626, #ef4444); color: #fff; border: 0; box-shadow: 0 3px 10px rgba(220, 38, 38, .25); }
    .b-green { background: #fff; border: 1px solid #86efac; color: #15803d; }
    .b-purple { background: #fff; border: 1px solid #c4b5fd; color: var(--primary); }
    .banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; background: #fff3dc; border: 1px solid #fcd9a0; color: #7c2d12; font-weight: 600; font-size: 14.5px; }
    .banner app-icon { color: #c2410c; }
    .banner[data-s='Restricted'] { background: #fee2e2; border-color: #fca5a5; color: #991b1b; } .banner[data-s='Restricted'] app-icon { color: #dc2626; }
    .banner[data-s='Cleared'] { background: #dcfce7; border-color: #86efac; color: #166534; } .banner[data-s='Cleared'] app-icon { color: #16a34a; }
    .audit { border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; flex: 1; }
    .audit h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 16px; }
    .audit ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; font-size: 13px; }
    .audit li { display: flex; gap: 12px; align-items: baseline; }
    .audit li i { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); flex: none; transform: translateY(-1px); }
    .type { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 7px; font-weight: 600; font-size: 12.5px; background: #fee2e2; color: #dc2626; white-space: nowrap; }
    .type[data-t='Watchlist'] { background: #ede9fe; color: #6d28d9; } .type[data-t='Temporary Restriction'] { background: #fff1e6; color: #c2410c; }
    .reg { font-size: 12.5px; } .reg td { padding: 5px 5px; white-space: nowrap; } .reg th { padding: 8px 6px; } .reg .ic-txt { gap: 5px; } .reg .vm-mini { padding: 3px 8px; } .reg .vm-acts { gap: 5px; }
    .hint { display: flex; gap: 8px; align-items: center; margin-top: 12px; padding: 9px 12px; border-radius: 8px; background: #fff7ed; color: #9a3412; font-size: 13px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; } .chips .vm-chip { border: 0; cursor: pointer; } .chips .vm-chip.off { background: #f1f5f9; color: #64748b; }
    .form-actions .spacer { flex: 1; }
    .drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; border: 2px dashed #c4b5fd; border-radius: 12px; color: var(--primary); cursor: pointer; margin-bottom: 10px; background: #faf8ff; }
    .drop small { color: var(--muted); }
    .g-modal.sm { width: min(440px, calc(100vw - 32px)); }
    .dhead { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; } .dhead h3 { margin: 0 0 6px; font-size: 18px; }
    .dkv { margin-top: 8px; }
    @media (max-width: 1500px) { .rules { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 1250px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export class WatchlistRestricted {
  protected readonly ws = inject(WatchStore);
  protected readonly store = inject(VmStore);
  protected readonly tabs = TABS;
  protected readonly types: RestrictionType[] = ['Restricted', 'Watchlist', 'Temporary Restriction'];
  protected readonly sites = ['Main Campus – Tower A', 'Main Campus – Tower B', 'Plant Site – North Block'];
  protected readonly statuses: AlertStatus[] = ['Open', 'Under Review', 'Restricted', 'Cleared'];
  protected readonly groups = ['Security', 'Front Desk', 'Compliance', 'Host', 'Facilities'];
  protected readonly srcIcon = SRC_ICON;
  protected readonly matchIcon = MATCH_ICON;
  protected readonly typeIcon = TYPE_ICON;

  protected readonly tab = signal('All Records');
  protected readonly q = signal('');
  protected readonly risk = signal('');
  protected readonly rtype = signal('');
  protected readonly site = signal('');
  protected readonly status = signal('');
  protected readonly selId = signal(2);
  protected readonly sort = signal<{ k: keyof ScreenAlert; dir: number } | null>(null);
  protected readonly rsort = signal<{ k: keyof RegistryEntry; dir: number } | null>(null);
  protected readonly menu = signal<string | null>(null);
  protected readonly toast = signal('');
  protected readonly addOpen = signal(false);
  protected readonly editId = signal(0);
  protected readonly tried = signal(false);
  protected readonly f = signal({ name: '', type: 'Watchlist' as RestrictionType, reason: '', sites: 'All Sites', review: '', addedBy: 'Security Admin' });
  protected readonly ruleForm = signal<WatchRule | null>(null);
  protected readonly importOpen = signal(false);
  protected readonly importFile = signal('');
  protected readonly viewEntry = signal<RegistryEntry | null>(null);
  protected readonly auditEntry = signal<RegistryEntry | null>(null);
  protected readonly confirmRemove = signal<RegistryEntry | null>(null);
  private tt?: ReturnType<typeof setTimeout>;

  private readonly typeOfSource = (s: string): RestrictionType => (s === 'Restricted Visitors' ? 'Restricted' : 'Watchlist');
  protected readonly alerts = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase(), rk = this.risk(), ty = this.rtype(), si = this.site(), st = this.status();
    const list = this.ws.alerts().filter((a) => {
      if (t === 'Watchlist' && a.source !== 'Internal Watchlist') return false;
      if (t === 'Restricted' && a.source !== 'Restricted Visitors' && a.status !== 'Restricted') return false;
      if (t === 'Open Alerts' && a.status !== 'Open' && a.status !== 'Under Review') return false;
      if (t === 'Cleared' && a.status !== 'Cleared') return false;
      if (rk && a.risk !== rk) return false;
      if (ty && this.typeOfSource(a.source) !== ty && !(ty !== 'Watchlist' && a.status === 'Restricted')) return false;
      if (si && a.site !== si) return false;
      if (st && a.status !== st) return false;
      const doc = this.store.byName(a.name)?.idNo ?? '';
      return !q || `${a.name} ${a.match} ${a.source} ${doc}`.toLowerCase().includes(q);
    });
    const s = this.sort();
    if (!s) return list;
    const rank = { Low: 0, Medium: 1, High: 2 } as Record<string, number>;
    return [...list].sort((x, y) => {
      const a = s.k === 'risk' ? rank[x.risk] : x[s.k], b = s.k === 'risk' ? rank[y.risk] : y[s.k];
      return (a! > b! ? 1 : a! < b! ? -1 : 0) * s.dir;
    });
  });
  protected readonly registry = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase(), ty = this.rtype(), si = this.site();
    const list = this.ws.registry().filter((r) => {
      if (t === 'Watchlist' && r.type !== 'Watchlist') return false;
      if (t === 'Restricted' && r.type === 'Watchlist') return false;
      if (t === 'Cleared' && r.status !== 'Removed') return false;
      if (ty && r.type !== ty) return false;
      if (si && r.sites !== 'All Sites' && !si.startsWith(r.sites)) return false;
      return !q || `${r.name} ${r.reason} ${r.type}`.toLowerCase().includes(q);
    });
    const s = this.rsort();
    if (!s) return list;
    const val = (r: RegistryEntry) => (s.k === 'addedOn' || s.k === 'review' ? Date.parse(r[s.k]) : String(r[s.k]));
    return [...list].sort((x, y) => (val(x) > val(y) ? 1 : val(x) < val(y) ? -1 : 0) * s.dir);
  });
  protected readonly sel = computed(() => this.ws.alerts().find((a) => a.id === this.selId()) ?? null);

  protected split(s: string, by: string) { return s.split(by); }
  protected riskTone(r: string) { return r === 'High' ? 'red' : r === 'Medium' ? 'orange' : 'green'; }
  protected rowAct(a: ScreenAlert) { return a.status === 'Cleared' ? (a.conf >= 50 ? 'Restrict' : 'Clear') : 'Review'; }
  protected resultLabel(a: ScreenAlert) { return a.status === 'Cleared' ? 'Cleared' : a.status === 'Restricted' ? 'Confirmed Restriction' : a.conf >= 50 ? 'Potential Match' : 'Low Match'; }
  protected bannerText(a: ScreenAlert) {
    return a.status === 'Restricted' ? 'Access blocked – restriction confirmed for all sites' : a.status === 'Cleared' ? 'Visitor cleared – access may be granted' : 'Do not grant access until review is complete';
  }
  protected sortBy(k: keyof ScreenAlert) { const s = this.sort(); this.sort.set({ k, dir: s?.k === k ? -s.dir : 1 }); }
  protected rsortBy(k: keyof RegistryEntry) { const s = this.rsort(); this.rsort.set({ k, dir: s?.k === k ? -s.dir : 1 }); }
  protected reset() { this.tab.set('All Records'); this.q.set(''); this.risk.set(''); this.rtype.set(''); this.site.set(''); this.status.set(''); this.sort.set(null); this.rsort.set(null); this.say('Filters reset'); }
  protected reg(id: number) { return this.ws.registry().find((r) => r.id === id); }
  protected closeAll() { this.menu.set(null); this.addOpen.set(false); this.ruleForm.set(null); this.importOpen.set(false); this.viewEntry.set(null); this.auditEntry.set(null); this.confirmRemove.set(null); }

  private say(m: string) { this.toast.set(m); clearTimeout(this.tt); this.tt = setTimeout(() => this.toast.set(''), 2800); }
  private now() { return `Today, ${hm(this.store.now())}`; }
  private updAlert(a: ScreenAlert, status: AlertStatus, title: string, by: string) {
    this.ws.alerts.update((l) => l.map((x) => (x.id === a.id ? { ...x, status, audit: [...x.audit, { title, at: this.now(), by }] } : x)));
    this.menu.set(null);
  }
  protected restrict(a: ScreenAlert) {
    if (a.status === 'Restricted') { this.menu.set(null); return this.say(`${a.name} is already restricted`); }
    this.updAlert(a, 'Restricted', 'Restriction confirmed', 'Priya Sharma (Security)');
    if (!this.ws.registry().some((r) => r.name === a.name && r.status !== 'Removed'))
      this.addReg({ name: a.name, type: 'Restricted', reason: a.reason, addedBy: 'Priya Sharma', sites: 'All Sites', review: '' });
    const v = this.store.byName(a.name);
    if (v) { this.store.patch(v.id, { risk: 'High' }); this.store.log({ text: `${a.name} restricted after screening match`, kind: 'alert', visitor: v.id }); }
    this.say(`${a.name}: restriction confirmed – access blocked`);
  }
  protected clearAlert(a: ScreenAlert) {
    if (a.status === 'Cleared') { this.menu.set(null); return this.say(`${a.name} is already cleared`); }
    this.updAlert(a, 'Cleared', 'Alert cleared', 'Priya Sharma (Security)');
    this.say(`Alert for ${a.name} cleared`);
  }
  protected review(a: ScreenAlert) {
    this.updAlert(a, a.status === 'Restricted' ? 'Restricted' : 'Under Review', 'Security review requested', 'Priya Sharma → Security Admin');
    this.say(`Security review requested for ${a.name}`);
  }
  protected reopen(a: ScreenAlert) { this.updAlert(a, 'Open', 'Alert re-opened', 'Priya Sharma'); this.say(`Alert for ${a.name} re-opened`); }
  protected rescreen() {
    this.menu.set(null);
    const n = this.store.onSite().length;
    const hit = this.store.onSite().find((v) => !this.ws.alerts().some((a) => a.name === v.name) && v.risk === 'High');
    if (hit) {
      const id = Math.max(...this.ws.alerts().map((a) => a.id)) + 1;
      this.ws.alerts.update((l) => [{ id, name: hit.name, match: 'Name similarity', conf: 67, source: 'Internal Watchlist', site: hit.site, detected: `Today ${hm(this.store.now())}`, risk: 'Medium', status: 'Open', reason: 'Partial name match with watchlist entry', incident: 'None on record', audit: [{ title: 'Alert created', at: this.now(), by: 'Screening system (manual re-screen)' }] }, ...l]);
      this.selId.set(id);
    }
    this.say(`Re-screened ${n} on-site visitors – ${hit ? '1 new alert' : 'no new matches'}`);
  }

  protected toggleRule(r: WatchRule) {
    this.ws.rules.update((l) => l.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)));
    this.say(`${r.name} rule ${r.on ? 'disabled' : 'enabled'}`);
  }
  protected editRule(r: WatchRule | null) { this.ruleForm.set(r ? { ...r } : { id: 0, name: '', icon: 'shield-check', color: '#2563eb', on: true, trigger: '', action: 'Flag alert and require review', recipients: 'Security' }); }
  protected ruleActions(cur: string) { return [...new Set([cur, 'Flag alert and require review', 'Block access and require security review', 'Flag alert and deny access', 'Flag for manual verification', 'Notify host only'])]; }
  protected patchRule<K extends keyof WatchRule>(k: K, v: WatchRule[K]) { this.ruleForm.update((r) => (r ? { ...r, [k]: v } : r)); }
  protected toggleRecipient(g: string) {
    const r = this.ruleForm(); if (!r) return;
    const set = r.recipients.split(',').map((s) => s.trim()).filter(Boolean);
    const next = set.includes(g) ? set.filter((s) => s !== g) : [...set, g];
    this.patchRule('recipients', next.join(', '));
  }
  protected saveRule() {
    const r = this.ruleForm(); if (!r || !r.name.trim()) return;
    if (r.id) this.ws.rules.update((l) => l.map((x) => (x.id === r.id ? r : x)));
    else this.ws.rules.update((l) => [...l, { ...r, id: Math.max(0, ...l.map((x) => x.id)) + 1 }]);
    this.say(`Rule “${r.name}” saved`);
    this.ruleForm.set(null);
  }
  protected deleteRule(id: number) { this.ws.rules.update((l) => l.filter((x) => x.id !== id)); this.ruleForm.set(null); this.say('Rule deleted'); }

  protected openAdd(r?: RegistryEntry) {
    this.tried.set(false);
    this.editId.set(r?.id ?? 0);
    const iso = (s: string) => { const d = new Date(s); return isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    this.f.set(r ? { name: r.name, type: r.type, reason: r.reason, sites: r.sites, review: iso(r.review), addedBy: r.addedBy } : { name: '', type: 'Watchlist', reason: '', sites: 'All Sites', review: '', addedBy: 'Security Admin' });
    this.addOpen.set(true);
  }
  protected setF(k: string, v: string) { this.f.update((x) => ({ ...x, [k]: v })); }
  private addReg(x: { name: string; type: RestrictionType; reason: string; addedBy: string; sites: string; review: string }) {
    const today = new Date(this.store.now() ? Date.now() : Date.now());
    const review = x.review ? fmtDate(new Date(x.review)) : fmtDate(new Date(today.getTime() + 90 * 864e5));
    this.ws.registry.update((l) => [{ id: Math.max(0, ...l.map((r) => r.id)) + 1, name: x.name, type: x.type, reason: x.reason, addedBy: x.addedBy, addedOn: fmtDate(today), review, sites: x.sites, status: 'Active', audit: [{ title: 'Entry created', at: this.now(), by: x.addedBy }] }, ...l]);
  }
  protected saveEntry() {
    this.tried.set(true);
    const x = this.f();
    if (!x.name.trim() || !x.reason.trim()) return;
    const id = this.editId();
    if (id) {
      this.ws.registry.update((l) => l.map((r) => (r.id === id ? { ...r, name: x.name.trim(), type: x.type, reason: x.reason, sites: x.sites, addedBy: x.addedBy, review: x.review ? fmtDate(new Date(x.review)) : r.review, audit: [...r.audit, { title: 'Entry edited', at: this.now(), by: 'Priya Sharma' }] } : r)));
      this.say(`${x.name} updated`);
    } else {
      this.addReg({ ...x, name: x.name.trim() });
      const v = this.store.byName(x.name.trim());
      if (v && !this.ws.alerts().some((a) => a.name === v.name)) {
        const aid = Math.max(...this.ws.alerts().map((a) => a.id)) + 1;
        this.ws.alerts.update((l) => [{ id: aid, name: v.name, match: 'Document match', conf: 99, source: x.type === 'Watchlist' ? 'Internal Watchlist' : 'Restricted Visitors', site: v.site, detected: `Today ${hm(this.store.now())}`, risk: x.type === 'Watchlist' ? 'Medium' : 'High', status: 'Open', reason: x.reason, incident: 'None on record', audit: [{ title: 'Alert created', at: this.now(), by: 'Screening system (new registry entry)' }] }, ...l]);
        this.selId.set(aid);
      }
      this.say(`${x.name} added to ${x.type === 'Watchlist' ? 'watchlist' : 'restricted list'}`);
    }
    this.addOpen.set(false);
  }
  protected doImport() {
    [['Victor Kane', 'Restricted', 'Trespass incident', 'All Sites'], ['Lena Ortiz', 'Watchlist', 'Document under verification', 'Main Campus'], ['Mark Ivers', 'Temporary Restriction', 'Tailgating', 'Plant Site']]
      .forEach(([name, type, reason, sites]) => this.addReg({ name, type: type as RestrictionType, reason, sites, addedBy: 'Bulk Import', review: '' }));
    this.importOpen.set(false); this.importFile.set('');
    this.say('3 records imported from watchlist_sample.csv');
  }
  protected extend(r: RegistryEntry) {
    const d = new Date(Date.parse(r.review) + 30 * 864e5);
    this.ws.registry.update((l) => l.map((x) => (x.id === r.id ? { ...x, review: fmtDate(d), status: 'Active', audit: [...x.audit, { title: 'Review extended to ' + fmtDate(d), at: this.now(), by: 'Priya Sharma' }] } : x)));
    this.menu.set(null); this.say(`Review date extended to ${fmtDate(d)}`);
  }
  protected remove(r: RegistryEntry) {
    this.ws.registry.update((l) => l.map((x) => (x.id === r.id ? { ...x, status: 'Removed', audit: [...x.audit, { title: 'Entry removed', at: this.now(), by: 'Priya Sharma' }] } : x)));
    this.confirmRemove.set(null); this.say(`${r.name} removed from the registry`);
  }
  protected reinstate(r: RegistryEntry) {
    this.ws.registry.update((l) => l.map((x) => (x.id === r.id ? { ...x, status: 'Active', audit: [...x.audit, { title: 'Entry reinstated', at: this.now(), by: 'Priya Sharma' }] } : x)));
    this.menu.set(null); this.say(`${r.name} reinstated`);
  }
  protected exportAll() {
    downloadCsv('restricted-visitor-registry.csv', [['Visitor', 'Restriction Type', 'Reason', 'Added By', 'Added On', 'Review Date', 'Sites', 'Status'], ...this.registry().map((r) => [r.name, r.type, r.reason, r.addedBy, r.addedOn, r.review, r.sites, r.status])]);
    this.say('Registry exported');
  }
  protected exportAlerts() {
    this.menu.set(null);
    downloadCsv('screening-alerts.csv', [['Visitor', 'Match Type', 'Confidence', 'Source', 'Site', 'Detected', 'Risk', 'Status'], ...this.alerts().map((a) => [a.name, a.match, a.conf + '%', a.source, a.site, a.detected, a.risk, a.status])]);
    this.say('Alerts exported');
  }
  protected print() { window.print(); }
}
