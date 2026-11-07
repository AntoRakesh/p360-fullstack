import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { SITES, VmStore } from './vm.data';
import {
  ACTIVITY, CheckSt, DOC_TYPES, METHODS, QUEUE, REJECT_REASONS, REVIEW_REASONS, VActivity, VHist, VItem, VStatus, hm1, hm2, newChecks,
} from './vm-id-verification.data';

const TABS: { key: string; label: string }[] = [
  { key: 'Pending', label: 'Pending' }, { key: 'Verified', label: 'Verified' }, { key: 'Needs Review', label: 'Needs Review' },
  { key: 'Failed', label: 'Failed' }, { key: 'Expired', label: 'Expired Documents' },
];
const ST_ICON: Record<string, string> = { Pending: 'clock', 'Needs Review': 'triangle-alert', Verified: 'vm-c-check-circle', Failed: 'vm-c-x-circle', Expired: 'calendar-days' };
const SCAN_STAGES = ['Capturing document image', 'Reading MRZ / OCR', 'Checking security features', 'Matching face to live photo', 'Screening against watchlist'];
type ActKey = 'name' | 'docType' | 'method' | 'by' | 'at' | 'result';

@Component({
  selector: 'app-vm-id-verification',
  imports: [Icon, RouterLink, ...VM_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page iv">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>ID Verification</b></nav>
          <h1>ID Verification</h1>
          <p>Verify visitor identity documents and complete secure check-in.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openScan()"><app-icon name="vm-a-scan-id" [size]="18" />Scan New ID</button>
          <button class="btn-outline hb" (click)="openUpload()"><app-icon name="m-upload" [size]="18" />Upload Document</button>
          <button class="btn-outline hb" (click)="exportCsv()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="exportQueue()"><app-icon name="download" [size]="15" />Export verification queue</button>
                <button class="dd-item" (click)="go('visitor-check-in-check-out')"><app-icon name="vm-c-log-in" [size]="15" />Check-In / Out desk</button>
                <button class="dd-item" (click)="go('watchlist-blacklist')"><app-icon name="shield" [size]="15" />Watchlist &amp; blacklist</button>
                <button class="dd-item" (click)="go('visitor-passes-badges')"><app-icon name="vm-c-badge" [size]="15" />Passes &amp; badges</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Pending Verification" [value]="kpi().pending" icon="vm-a-scan-id" color="#7c3aed" [clickable]="true" [active]="tab() === 'Pending'" (pick)="setTab('Pending')" />
        <vm-kpi label="Verified Today" [value]="kpi().verified" icon="vm-c-check-circle" color="#16a34a" [clickable]="true" [active]="tab() === 'Verified'" (pick)="setTab('Verified')" />
        <vm-kpi label="Needs Review" [value]="kpi().review" icon="triangle-alert" color="#ea580c" [clickable]="true" [active]="tab() === 'Needs Review'" (pick)="setTab('Needs Review')" />
        <vm-kpi label="Failed Checks" [value]="kpi().failed" icon="vm-c-x-circle" color="#dc2626" [clickable]="true" [active]="tab() === 'Failed'" (pick)="setTab('Failed')" />
      </section>

      <div class="bar">
        <div class="vm-tabs">@for (t of tabs; track t.key) {<button type="button" [class.on]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }}</button>}</div>
        <label class="vm-search sr"><app-icon name="search" [size]="15" /><input placeholder="Search visitor, document number..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="pf"><app-icon name="map-pin" [size]="15" /><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="pf"><app-icon name="layers" [size]="15" /><span>Document Type:</span><select [value]="docType()" (change)="docType.set($any($event.target).value)"><option value="">All</option>@for (d of docTypes; track d) {<option [value]="d">{{ d }}</option>}</select></label>
        <label class="pf"><app-icon name="sliders" [size]="15" /><span>Verification Method:</span><select [value]="method()" (change)="method.set($any($event.target).value)"><option value="">All</option>@for (m of methods; track m) {<option [value]="m">{{ m }}</option>}</select></label>
        <label class="pf"><app-icon name="clock" [size]="15" /><span>Status:</span><select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All</option><option>Pending</option><option>Needs Review</option><option>Verified</option><option>Failed</option><option>Expired</option></select></label>
        <button class="vm-icon-btn rf" [class.spin]="spinning()" title="Reset filters &amp; refresh" (click)="refresh()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="grid">
        <div class="left">
          <div class="vm-card verify">
            <div class="ch"><h2><app-icon name="vm-c-clipboard" [size]="24" />Verify Visitor Identity</h2></div>
            <div class="vg">
              <div class="queue">
                <div class="qh"><b>Verification Queue ({{ queueRows().length }})</b>
                  <label class="sortsel"><app-icon name="vm-c-sort" [size]="14" /><select [value]="qSort()" (change)="qSort.set($any($event.target).value)"><option value="old">Oldest First</option><option value="new">Newest First</option><option value="time">Visit Time</option><option value="name">Name A–Z</option></select><app-icon name="chevron-down" [size]="14" /></label>
                </div>
                <div class="ql">
                  @for (v of queueRows(); track v.id) {
                    <button class="qi" [class.on]="selId() === v.id" (click)="selId.set(v.id)">
                      <vm-avatar [name]="v.name" [size]="40" />
                      <span class="qn"><b>{{ v.name }}</b><small>{{ v.company }}</small></span>
                      <span class="qt"><app-icon name="calendar-days" [size]="14" /><span>Today<br />{{ hm1(v.time) }}</span></span>
                      <span class="qd"><app-icon name="vm-c-card" [size]="14" /><span>{{ v.docType }}</span></span>
                      <span class="qs" [attr.data-s]="v.status"><app-icon [name]="stIcon[v.status]" [size]="13" /><span>{{ v.status === 'Expired' ? 'Expired' : v.status }}</span></span>
                    </button>
                  } @empty {
                    <div class="vm-empty">No documents in this view. <button class="vm-link" (click)="refresh()">Clear filters</button></div>
                  }
                </div>
              </div>

              @if (sel(); as s) {
                <div class="doc">
                  <div class="dh"><app-icon name="user" [size]="22" /><h3>{{ s.name }}</h3><span class="qs big" [attr.data-s]="s.status"><app-icon [name]="stIcon[s.status]" [size]="14" />{{ s.status }}</span></div>
                  <div class="dr">
                    <div class="ph"><vm-avatar [name]="s.name" [size]="100" [square]="true" /></div>
                    <div class="di">
                      <div class="dt"><app-icon name="vm-c-card" [size]="20" /><b>{{ s.docType }}</b></div>
                      <small>Document No.</small><b class="mono">{{ s.docNo }}</b>
                      <small>Country</small><b>{{ s.country }}</b>
                      <small>Expiry Date</small><b [class.red]="s.status === 'Expired'">{{ s.expiry }}</b>
                    </div>
                    <div class="card-ill" [attr.data-t]="s.docType" [class.scan]="rescanning()" (click)="zoom.set(true)" title="Click to enlarge">
                      <div class="ct"><app-icon name="admin-globe" [size]="22" /><b>{{ docTitle(s.docType) }}</b></div>
                      <div class="cb2">
                        <vm-avatar [name]="s.name" [size]="60" [square]="true" />
                        <div class="lines"><i></i><i></i><i class="s"></i><i></i><i class="s"></i></div>
                        <div class="chip"></div>
                        <div class="holo"></div>
                      </div>
                      <div class="mrz">&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;<br />&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
                      @if (s.warning?.includes('glare') && !rescanning()) {<span class="glare"></span>}
                      @if (rescanning()) {<span class="beam"></span>}
                    </div>
                  </div>
                  <div class="fr">
                    <div class="ring" [attr.data-t]="ringTone(s.face)">
                      <svg viewBox="0 0 120 120" width="122" height="122">
                        <circle cx="60" cy="60" r="50" class="trk" [attr.stroke-dasharray]="gauge + ' 400'" transform="rotate(120 60 60)" />
                        <circle cx="60" cy="60" r="50" class="val" [attr.stroke-dasharray]="(gauge * s.face) / 100 + ' 400'" transform="rotate(120 60 60)" />
                      </svg>
                      <div class="rl"><small>Face Match</small><b>{{ s.face.toFixed(1) }}%</b></div>
                      <span class="rk"><app-icon [name]="s.face >= 90 ? 'vm-c-check' : s.face >= 75 ? 'triangle-alert' : 'vm-c-x'" [size]="14" [stroke]="3" /></span>
                    </div>
                    <div class="checks">
                      @for (c of s.checks; track c.label; let i = $index) {
                        <div class="ck"><app-icon [name]="c.icon" [size]="16" /><span>{{ c.label }}</span>
                          <button class="cp" [attr.data-s]="c.st" [title]="okCheck(c.st) ? c.st : 'Click to override as passed'" (click)="override(s, i)"><app-icon [name]="okCheck(c.st) ? 'vm-c-check-circle' : c.st === 'Failed' ? 'vm-c-x-circle' : 'triangle-alert'" [size]="13" />{{ c.st }}</button>
                        </div>
                      }
                    </div>
                  </div>
                  @if (s.warning) {
                    <div class="warn"><app-icon name="triangle-alert" [size]="22" /><span><b>Manual review recommended:</b> {{ s.warning }}</span>
                      <button class="btn-outline rs" [disabled]="rescanning()" (click)="rescan(s)">{{ rescanning() ? 'Re-scanning…' : 'Request Re-scan' }}</button>
                    </div>
                  } @else {
                    <div class="ok"><app-icon name="shield-check" [size]="20" /><span>All automated checks passed. Image quality good.</span><button class="vm-link" (click)="rescan(s)">Re-scan</button></div>
                  }
                </div>
              } @else {
                <div class="doc vm-empty">Select a visitor from the queue to view the document.</div>
              }
            </div>
          </div>

          <div class="vm-card act">
            <div class="ch"><h2><app-icon name="layers" [size]="24" />Recent Verification Activity</h2><span class="cnt">{{ actRows().length }} records</span></div>
            <div class="aw">
              <table class="vm-table at">
                <thead><tr>
                  <th class="sort" (click)="sortAct('name')">Visitor <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort" (click)="sortAct('docType')">Document <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort w" (click)="sortAct('method')">Verification Method <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort" (click)="sortAct('by')">Verified By <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort" (click)="sortAct('at')">Date &amp; Time <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort" (click)="sortAct('result')">Result <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="ac">Actions</th>
                </tr></thead>
                <tbody>
                  @for (a of actRows(); track a.id) {
                    <tr class="click" (click)="viewAct(a)">
                      <td><div class="vm-person"><vm-avatar [name]="a.name" [size]="28" /><span><b>{{ a.name }}</b><small>{{ a.company }}</small></span></div></td>
                      <td><span class="ic"><app-icon name="vm-c-card" [size]="16" />{{ a.docType }} ({{ a.docNo }})</span></td>
                      <td class="w">{{ a.method }}</td>
                      <td class="w">{{ a.by }}</td>
                      <td><span class="ic"><app-icon name="calendar-days" [size]="14" />Wed, 15 Oct 2026, {{ hm2(a.at) }}</span></td>
                      <td><span class="rp" [attr.data-s]="a.result"><app-icon [name]="stIcon[a.result]" [size]="15" />{{ a.result }}</span></td>
                      <td (click)="$event.stopPropagation()">
                        <div class="vm-acts">
                          <button class="ia" title="View" (click)="viewAct(a)"><app-icon name="eye" [size]="17" /></button>
                          <button class="ia" title="Edit result" (click)="editAct.set(a)"><app-icon name="vm-c-pencil" [size]="16" /></button>
                          <div class="menu-wrap">
                            <button class="ia" (click)="toggleMenu('a:' + a.id, $event)"><app-icon name="admin-dots-h" [size]="18" /></button>
                            @if (menu() === 'a:' + a.id) {
                              <div class="dropdown right" (click)="$event.stopPropagation()">
                                <button class="dd-item" (click)="reverify(a)"><app-icon name="refresh" [size]="15" />Re-verify</button>
                                <button class="dd-item" (click)="report(a)"><app-icon name="download" [size]="15" />Download report</button>
                                <button class="dd-item" (click)="go('find-your-visit', a.name)"><app-icon name="search" [size]="15" />Open visit</button>
                              </div>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="7" class="vm-empty">No verification records match these filters.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="vm-card sum">
          <div class="ch"><h2><app-icon name="vm-c-clipboard" [size]="24" />Verification Summary</h2></div>
          @if (sel(); as s) {
            <div class="kv">
              <span><app-icon name="user" [size]="16" /></span><i>:</i><b>{{ s.name }}</b>
              <span><app-icon name="building" [size]="16" /></span><i>:</i><b>{{ s.companyFull }}</b>
              <span><app-icon name="users" [size]="16" />Host</span><i>:</i><b>{{ s.host }}</b>
              <span><app-icon name="map-pin" [size]="16" />Site</span><i>:</i><b>{{ s.site }}</b>
              <span><app-icon name="briefcase" [size]="16" />Visit Purpose</span><i>:</i><b>{{ s.purpose }}</b>
              <span><app-icon name="calendar-days" [size]="16" />Scheduled Time</span><i>:</i><b>Wed 15 Oct 2026, {{ hm1(s.time) }}</b>
              <span><app-icon name="layers" [size]="16" />Verification Method</span><i>:</i><b>{{ s.method }}</b>
              <span><app-icon name="shield-check" [size]="16" />Consent</span><i>:</i>
              <b>@if (s.consent) {<span class="cons"><app-icon name="vm-c-check-circle" [size]="15" />Captured</span>} @else {<button class="vm-link" (click)="consent(s)">Capture consent</button>}</b>
            </div>
            @if (s.status === 'Verified') {
              <div class="decided"><app-icon name="vm-c-check-circle" [size]="22" /><span><b>Verified &amp; checked in</b><small>{{ onSite(s.name) ? 'Visitor is on-site · badge issued' : 'Verification recorded' }}</small></span><button class="vm-link" (click)="go('visitor-passes-badges')">Badge</button></div>
            } @else if (s.status === 'Failed' || s.status === 'Expired') {
              <div class="decided bad"><app-icon name="vm-c-x-circle" [size]="22" /><span><b>{{ s.status === 'Expired' ? 'Document expired' : 'Verification rejected' }}</b><small>Entry blocked · host notified</small></span><button class="vm-link" (click)="reopen(s)">Re-open</button></div>
            }
            <button class="btn-primary sb" [disabled]="s.status === 'Verified'" (click)="approve(s)"><app-icon name="vm-c-check-circle" [size]="20" />Approve &amp; Check In</button>
            <button class="sb warn-b" [disabled]="s.status === 'Needs Review'" (click)="reviewOpen.set(true)"><app-icon name="triangle-alert" [size]="20" />Mark for Review</button>
            <button class="sb red-b" [disabled]="s.status === 'Failed'" (click)="rejectOpen.set(true)"><app-icon name="vm-c-x-circle" [size]="20" />Reject Verification</button>
            <div class="hist">
              <h4><app-icon name="clock" [size]="18" />Activity History</h4>
              @for (h of s.history; track $index) {
                <div class="hi" [attr.data-t]="h.tone ?? 'green'"><app-icon [name]="h.tone === 'red' ? 'vm-c-x-circle' : h.tone === 'orange' ? 'triangle-alert' : 'vm-c-check-circle'" [size]="16" /><span>{{ h.text }}</span><small>Today, {{ hm1(h.at) }}</small></div>
              }
            </div>
          } @else {
            <div class="vm-empty">No visitor selected.</div>
          }
        </aside>
      </div>
    </div>

    <!-- Mark for review -->
    @if (reviewOpen() && sel(); as s) {
      <div class="g-overlay" (click)="reviewOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); markReview(s, rr.value, rn.value)">
        <div class="modal-head"><h3>Mark for review – {{ s.name }}</h3><button type="button" class="close-btn" (click)="reviewOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Reason<select #rr class="input">@for (x of reviewReasons; track x) {<option>{{ x }}</option>}</select></label>
          <label class="full">Note for security reviewer<textarea #rn class="input ta2" rows="3" placeholder="e.g. Ask visitor to present a second ID."></textarea></label>
        </div>
        <p class="muted">The visit stays on hold until a security reviewer approves it. {{ s.host }} will be informed.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="reviewOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Mark for Review</button></div>
      </form>
    }
    <!-- Reject -->
    @if (rejectOpen() && sel(); as s) {
      <div class="g-overlay" (click)="rejectOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); reject(s, jr.value, jn.value)">
        <div class="modal-head"><h3>Reject verification – {{ s.name }}</h3><button type="button" class="close-btn" (click)="rejectOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Reason<select #jr class="input">@for (x of rejectReasons; track x) {<option>{{ x }}</option>}</select></label>
          <label class="full">Note<textarea #jn class="input ta2" rows="3"></textarea></label>
        </div>
        <p class="muted">Entry will be blocked and {{ s.host }} plus the security desk will be notified.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rejectOpen.set(false)">Cancel</button><button class="btn-red" type="submit">Reject Verification</button></div>
      </form>
    }
    <!-- Edit activity result -->
    @if (editAct(); as a) {
      <div class="g-overlay" (click)="editAct.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveAct(a, er.value, eb.value)">
        <div class="modal-head"><h3>Edit verification record – {{ a.name }}</h3><button type="button" class="close-btn" (click)="editAct.set(null)">×</button></div>
        <div class="form-grid">
          <label>Result<select #er class="input" [value]="a.result"><option>Verified</option><option>Needs Review</option><option>Failed</option><option>Expired</option></select></label>
          <label>Verified by<select #eb class="input" [value]="a.by"><option>Priya Sharma</option><option>Reception Desk</option><option>Security Desk</option><option>Ahmed Hassan</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="editAct.set(null)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    <!-- Activity detail (visitor not in queue) -->
    @if (actView(); as a) {
      <div class="g-overlay" (click)="actView.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Verification record</h3><button type="button" class="close-btn" (click)="actView.set(null)">×</button></div>
        <div class="vm-person big"><vm-avatar [name]="a.name" [size]="48" /><span><b>{{ a.name }}</b><small>{{ a.company }}</small></span></div>
        <div class="vm-kv kv3"><span>Document</span><b>{{ a.docType }} ({{ a.docNo }})</b><span>Method</span><b>{{ a.method }}</b><span>Verified by</span><b>{{ a.by }}</b><span>Date &amp; time</span><b>Wed, 15 Oct 2026, {{ hm2(a.at) }}</b><span>Result</span><b><span class="rp" [attr.data-s]="a.result"><app-icon [name]="stIcon[a.result]" [size]="14" />{{ a.result }}</span></b></div>
        <div class="form-actions"><button class="btn-ghost" (click)="report(a)">Download report</button><button class="btn-primary" (click)="reverify(a)">Re-verify</button></div>
      </div>
    }
    <!-- Document zoom -->
    @if (zoom() && sel(); as s) {
      <div class="g-overlay" (click)="zoom.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>{{ s.docType }} – {{ s.name }}</h3><button type="button" class="close-btn" (click)="zoom.set(false)">×</button></div>
        <div class="card-ill xl" [attr.data-t]="s.docType">
          <div class="ct"><app-icon name="admin-globe" [size]="26" /><b>{{ docTitle(s.docType) }}</b></div>
          <div class="cb2"><vm-avatar [name]="s.name" [size]="110" [square]="true" />
            <div class="ocr"><small>Surname / Given names</small><b>{{ s.name.toUpperCase() }}</b><small>Document No.</small><b>{{ s.docNo }}</b><small>Nationality</small><b>{{ s.country }}</b><small>Date of expiry</small><b>{{ s.expiry }}</b></div>
          </div>
          <div class="mrz">P&lt;{{ s.country.slice(0, 3).toUpperCase() }}{{ s.name.toUpperCase().replace(' ', '&lt;&lt;') }}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
        </div>
        <p class="muted">OCR fields extracted automatically. Document number masked for privacy.</p>
      </div>
    }

    <!-- Scan new ID -->
    @if (scan(); as sc) {
      <div class="g-overlay" (click)="scanClose()"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Scan New ID</h3><button type="button" class="close-btn" (click)="scanClose()">×</button></div>
        @if (sc.step === 'setup') {
          <div class="form-grid">
            <label class="full">Visitor<select class="input" [value]="sc.visitor" (change)="patchScan('visitor', $any($event.target).value)">
              <option value="">— New walk-in visitor —</option>
              @for (v of expected(); track v.id) {<option [value]="v.id">{{ v.name }} · {{ v.company }} · {{ v.id }}</option>}
            </select></label>
            @if (!sc.visitor) {<label class="full">Walk-in name<input class="input" [value]="sc.name" (input)="patchScan('name', $any($event.target).value)" placeholder="Full name as on document" /></label>}
            <label>Document type<select class="input" [value]="sc.docType" (change)="patchScan('docType', $any($event.target).value)">@for (d of docTypes; track d) {<option [value]="d">{{ d }}</option>}</select></label>
            <label>Scanner<select class="input" [value]="sc.method" (change)="patchScan('method', $any($event.target).value)">@for (m of methods; track m) {<option [value]="m">{{ m }}</option>}</select></label>
          </div>
          <div class="scanbox"><app-icon name="vm-c-scan" [size]="40" /><b>Place the {{ sc.docType }} face-down on the scanner</b><small>Make sure the photo page is flat and free of glare.</small></div>
          <label class="cons-ck"><input type="checkbox" [checked]="sc.consent" (change)="patchScan('consent', !sc.consent)" /> Visitor consent to identity verification captured</label>
          <div class="form-actions"><button class="btn-ghost" (click)="scanClose()">Cancel</button><button class="btn-primary" [disabled]="!sc.consent || (!sc.visitor && !sc.name.trim())" (click)="startScan()"><app-icon name="vm-c-scan" [size]="15" /> Start Scan</button></div>
        } @else if (sc.step === 'scanning') {
          <div class="scanbox live"><div class="card-ill mini" [attr.data-t]="sc.docType"><div class="ct"><app-icon name="admin-globe" [size]="16" /><b>{{ docTitle(sc.docType) }}</b></div><span class="beam"></span></div></div>
          <div class="stages">
            @for (st of stages; track st; let i = $index) {
              <div class="stg" [class.done]="i < sc.stage" [class.cur]="i === sc.stage"><app-icon [name]="i < sc.stage ? 'vm-c-check-circle' : 'clock'" [size]="16" />{{ st }}</div>
            }
          </div>
          <div class="prog"><i [style.width.%]="(sc.stage / stages.length) * 100"></i></div>
        } @else {
          <div class="res">
            <vm-avatar [name]="scanName()" [size]="72" [square]="true" />
            <div class="vm-kv kv3"><span>Name</span><b>{{ scanName() }}</b><span>Document</span><b>{{ sc.docType }} ({{ sc.docNo }})</b><span>Face match</span><b>{{ sc.face.toFixed(1) }}%</b><span>Watchlist</span><b>Clear</b></div>
          </div>
          <div class="ok"><app-icon name="shield-check" [size]="20" /><span>All automated checks passed.</span></div>
          <div class="form-actions"><button class="btn-ghost" (click)="scanClose()">Discard</button><button class="btn-outline" (click)="finishScan(false)">Add to Queue</button><button class="btn-primary" (click)="finishScan(true)">Approve &amp; Check In</button></div>
        }
      </div>
    }

    <!-- Upload document -->
    @if (upload(); as u) {
      <div class="g-overlay" (click)="upload.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doUpload()">
        <div class="modal-head"><h3>Upload Document</h3><button type="button" class="close-btn" (click)="upload.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Visitor<select class="input" [value]="u.visitor" (change)="patchUpload('visitor', $any($event.target).value)">@for (v of expected(); track v.id) {<option [value]="v.id">{{ v.name }} · {{ v.company }} · {{ v.id }}</option>}</select></label>
          <label>Document type<select class="input" [value]="u.docType" (change)="patchUpload('docType', $any($event.target).value)">@for (d of docTypes; track d) {<option [value]="d">{{ d }}</option>}</select></label>
          <label>Expiry date<input class="input" type="date" [value]="u.expiry" (input)="patchUpload('expiry', $any($event.target).value)" /></label>
        </div>
        <label class="drop" [class.has]="u.file" (dragover)="$event.preventDefault()" (drop)="$event.preventDefault(); pickFile($any($event).dataTransfer?.files)">
          <app-icon name="m-upload" [size]="30" />
          @if (u.file) {<b>{{ u.file }}</b><small>Click to replace</small>} @else {<b>Drop image or PDF here, or click to browse</b><small>JPG, PNG or PDF · max 10 MB</small>}
          <input type="file" accept="image/*,.pdf" hidden (change)="pickFile($any($event.target).files)" />
        </label>
        @if (uploadErr()) {<p class="err-t">{{ uploadErr() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="upload.set(null)">Cancel</button><button class="btn-primary" type="submit">Upload &amp; Verify</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); margin-bottom: 2px; }
    .crumb a { color: var(--text); text-decoration: none; font-weight: 500; } .crumb b { font-weight: 600; }
    .vm-head h1 { font-size: 30px; }
    .hb { height: 38px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; }
    .vm-icon-btn.tall { height: 38px; width: 38px; }
    .menu-wrap { position: relative; }
    .dropdown { left: 0; right: auto; min-width: 210px; z-index: 30; } .dropdown.right { left: auto; right: 0; }
    :host ::ng-deep .vm-kpi { padding: 10px 16px; gap: 16px; }
    :host ::ng-deep .vm-kpi-ic { width: 66px; height: 54px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .bar { display: flex; gap: 6px; align-items: center; }
    .bar .vm-tabs { flex-wrap: nowrap; gap: 4px; } .bar .vm-tabs button { padding: 6px 8px; font-size: 12px; }
    .sr { height: 34px; flex: 1; min-width: 100px; } .sr input { font-size: 12.5px; }
    .pf { display: flex; align-items: center; gap: 4px; height: 34px; border: 1px solid var(--border); border-radius: 8px; padding: 0 6px; background: #fff; font-size: 12px; white-space: nowrap; color: var(--text); }
    .pf span { font-weight: 500; } .pf select { border: 0; outline: 0; background: transparent; font: inherit; font-size: 12px; cursor: pointer; field-sizing: content; max-width: 90px; }
    .rf { height: 34px; width: 34px; flex: none; } .rf.spin app-icon { animation: sp .7s linear; }
    @keyframes sp { to { transform: rotate(360deg); } }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 12px; align-items: start; }
    .left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .vm-card { padding: 12px 14px; }
    .ch { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .ch h2 { margin: 0; font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; } .ch h2 app-icon { color: var(--primary); }
    .cnt { font-size: 12px; color: var(--muted); }
    .vg { display: grid; grid-template-columns: 372px minmax(0, 1fr); gap: 12px; align-items: start; }
    .queue { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .qh { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); } .qh b { font-size: 14.5px; }
    .sortsel { display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 7px; padding: 0 6px; height: 28px; font-size: 12px; }
    .sortsel select { border: 0; outline: 0; background: transparent; font: inherit; font-size: 12px; appearance: none; cursor: pointer; padding-right: 2px; }
    .ql { display: flex; flex-direction: column; padding: 6px; gap: 2px; max-height: 330px; overflow-y: auto; }
    .qi { display: grid; grid-template-columns: 40px minmax(0, 1fr) 66px 72px 64px; gap: 5px; align-items: center; padding: 8px 6px; border: 1.5px solid transparent; border-bottom: 1px solid #f0f0f6; background: #fff; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; color: var(--text); }
    .qi:hover { background: #faf8ff; }
    .qi.on { border-color: #a78bfa; background: #f5f0ff; box-shadow: 0 2px 8px rgba(124, 58, 237, .12); }
    .qn { min-width: 0; } .qn b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .qn small { font-size: 11.5px; color: #334155; }
    .qt, .qd { display: flex; align-items: center; gap: 3px; font-size: 11px; line-height: 1.25; white-space: nowrap; } .qd span { white-space: normal; } .qt app-icon, .qd app-icon { color: #334155; flex: none; }
    .qs { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 7px; font-size: 11px; line-height: 1.15; font-weight: 500; justify-self: start; }
    .qs[data-s='Pending'] { background: #ede9fe; color: #5b21b6; } .qs[data-s='Pending'] app-icon { color: var(--primary); }
    .qs[data-s='Needs Review'] { background: #ffedd5; color: #c2410c; }
    .qs[data-s='Verified'] { background: #dcfce7; color: #166534; } .qs[data-s='Verified'] app-icon { color: #16a34a; }
    .qs[data-s='Failed'], .qs[data-s='Expired'] { background: #fee2e2; color: #b91c1c; }
    .qs.big { margin-left: auto; font-size: 12.5px; padding: 3px 12px; }
    .doc { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .dh { display: flex; align-items: center; gap: 8px; } .dh h3 { margin: 0; font-size: 19px; font-weight: 700; }
    .dr { display: grid; grid-template-columns: 100px 118px minmax(0, 1fr); gap: 10px; align-items: stretch; }
    .ph :is(vm-avatar) { border-radius: 10px; }
    .di { border: 1px solid #f0f0f6; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; font-size: 13px; }
    .di small { font-size: 11.5px; color: #334155; margin-top: 4px; } .di b { font-weight: 700; } .di .red { color: #dc2626; }
    .dt { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f6; } .dt b { font-size: 14px; } .dt app-icon { color: var(--primary); }
    .mono { letter-spacing: .04em; }
    .card-ill { --h1: #ddd6fe; --h2: #bfdbfe; --h3: #fbcfe8; position: relative; overflow: hidden; border-radius: 12px; border: 1px solid #c7d2fe; padding: 8px 10px; cursor: zoom-in; display: flex; flex-direction: column; gap: 6px; min-width: 0;
      background: linear-gradient(135deg, var(--h1) 0%, #eef2ff 35%, var(--h2) 60%, var(--h3) 100%); }
    .card-ill[data-t='National ID'] { --h1: #bbf7d0; --h2: #bae6fd; --h3: #ddd6fe; }
    .card-ill[data-t='Driver License'] { --h1: #fde68a; --h2: #fecaca; --h3: #c7d2fe; }
    .card-ill[data-t='Aadhaar'] { --h1: #fed7aa; --h2: #fef9c3; --h3: #bbf7d0; }
    .card-ill[data-t='Emirates ID'] { --h1: #a7f3d0; --h2: #fde68a; --h3: #fecaca; }
    .ct { display: flex; align-items: center; gap: 8px; color: #3730a3; } .ct b { font-size: 13px; letter-spacing: .06em; font-weight: 600; }
    .cb2 { display: flex; gap: 10px; align-items: center; position: relative; }
    .lines { flex: 1; display: flex; flex-direction: column; gap: 5px; } .lines i { height: 4px; border-radius: 2px; background: rgba(71, 85, 105, .45); } .lines i.s { width: 60%; }
    .chip { position: absolute; right: 2px; top: 0; width: 26px; height: 18px; border-radius: 4px; border: 2px solid #64748b; background: rgba(255,255,255,.4); }
    .holo { position: absolute; right: 6px; bottom: -4px; width: 30px; height: 30px; border-radius: 50%; background: conic-gradient(from 0deg, #f0abfc, #93c5fd, #86efac, #fde047, #f0abfc); opacity: .55; }
    .mrz { font-family: ui-monospace, monospace; font-size: 9px; letter-spacing: .02em; color: #334155; line-height: 1.3; white-space: nowrap; overflow: hidden; background: rgba(255,255,255,.55); border-radius: 4px; padding: 2px 4px; }
    .glare { position: absolute; top: -30%; left: 30%; width: 50%; height: 160%; transform: rotate(25deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); pointer-events: none; }
    .beam { position: absolute; left: 0; right: 0; height: 3px; background: #22c55e; box-shadow: 0 0 12px 4px rgba(34, 197, 94, .5); animation: beam 1.1s linear infinite; }
    @keyframes beam { from { top: 0; } to { top: 100%; } }
    .card-ill.xl { cursor: default; padding: 16px; gap: 12px; } .card-ill.xl .mrz { font-size: 12px; }
    .ocr { display: grid; grid-template-columns: auto; font-size: 13px; } .ocr small { color: #475569; font-size: 11px; margin-top: 4px; }
    .card-ill.mini { width: 260px; height: 150px; margin: 0 auto; cursor: default; }
    .fr { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 10px; align-items: center; border: 1px solid #f0f0f6; border-radius: 10px; padding: 8px 10px; }
    .ring { position: relative; width: 122px; height: 122px; --rc: #16a34a; margin: auto; }
    .ring[data-t='orange'] { --rc: #f59e0b; } .ring[data-t='red'] { --rc: #dc2626; }
    .ring circle { fill: none; stroke-width: 10; stroke-linecap: round; } .ring .trk { stroke: #e2e8f0; } .ring .val { stroke: var(--rc); transition: stroke-dasharray .5s; }
    .rl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .rl small { font-size: 12.5px; font-weight: 600; color: var(--text); } .rl b { font-size: 22px; font-weight: 800; }
    .rk { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%); width: 24px; height: 24px; border-radius: 50%; background: var(--rc); color: #fff; display: grid; place-items: center; }
    .checks { display: flex; flex-direction: column; gap: 2px; border-left: 1px solid #e2e8f0; padding-left: 10px; }
    .ck { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 8px; font-size: 13px; padding: 2px 0; } .ck app-icon { color: #334155; }
    .cp { display: inline-flex; align-items: center; gap: 4px; border: 0; border-radius: 6px; padding: 2px 8px; font: inherit; font-size: 12px; cursor: pointer; min-width: 74px; }
    .cp[data-s='Passed'], .cp[data-s='Clear'] { background: #dcfce7; color: #166534; cursor: default; } .cp[data-s='Passed'] app-icon, .cp[data-s='Clear'] app-icon { color: #16a34a; }
    .cp[data-s='Review'], .cp[data-s='Pending'] { background: #ffedd5; color: #c2410c; } .cp[data-s='Review'] app-icon { color: #ea580c; }
    .cp[data-s='Failed'] { background: #fee2e2; color: #b91c1c; } .cp[data-s='Failed'] app-icon { color: #dc2626; }
    .warn { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; font-size: 13px; } .warn > app-icon { color: #d97706; flex: none; }
    .warn span { flex: 1; } .warn b { font-weight: 700; }
    .rs { height: 32px; padding: 0 12px; font-size: 13px; white-space: nowrap; }
    .ok { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #166534; } .ok span { flex: 1; }
    .aw { max-height: 172px; overflow-y: auto; overflow-x: hidden; }
    .at th { background: #f3f0ff; font-size: 12px; padding: 6px 4px; position: sticky; top: 0; z-index: 1; cursor: pointer; white-space: nowrap; } .at th app-icon { vertical-align: -2px; }
    .at td { padding: 4px 4px; font-size: 11.5px; white-space: nowrap; } .at td.w { white-space: normal; max-width: 84px; line-height: 1.25; } .at th.w { white-space: normal; line-height: 1.2; }
    .at .vm-person span { display: flex; flex-direction: column; line-height: 1.2; } .at .vm-person b { font-weight: 600; } .at .vm-person small { font-size: 11.5px; color: #334155; }
    .ic { display: inline-flex; align-items: center; gap: 4px; } .ic app-icon { color: #334155; }
    .rp { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .rp[data-s='Verified'] { background: #dcfce7; color: #166534; } .rp[data-s='Verified'] app-icon { color: #16a34a; }
    .rp[data-s='Needs Review'], .rp[data-s='Pending'] { background: #ffedd5; color: #c2410c; }
    .rp[data-s='Failed'], .rp[data-s='Expired'] { background: #fee2e2; color: #b91c1c; }
    .ac { text-align: center; } .vm-acts { gap: 6px; justify-content: center; }
    .ia { border: 0; background: none; cursor: pointer; padding: 3px; border-radius: 6px; color: var(--text); display: grid; place-items: center; } .ia:hover { background: #f1edff; }
    .sum { display: flex; flex-direction: column; gap: 9px; position: sticky; top: 10px; }
    .kv { display: grid; grid-template-columns: 128px 8px minmax(0, 1fr); row-gap: 5px; font-size: 12px; align-items: center; padding-bottom: 6px; }
    .kv > span { display: flex; align-items: center; gap: 6px; font-weight: 500; white-space: nowrap; } .kv > span app-icon { color: #334155; flex: none; }
    .kv > i { font-style: normal; } .kv > b { font-weight: 500; }
    .cons { display: inline-flex; align-items: center; gap: 6px; } .cons app-icon { color: #16a34a; }
    .sb { height: 40px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 15.5px; font-weight: 600; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .sb[disabled] { opacity: .5; cursor: not-allowed; }
    .warn-b { border: 1.5px solid #fb923c; background: #fff7ed; color: #c2410c; } .warn-b:hover:not([disabled]) { background: #ffedd5; }
    .red-b { border: 1.5px solid #f87171; background: #fef2f2; color: #dc2626; } .red-b:hover:not([disabled]) { background: #fee2e2; }
    .decided { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: #dcfce7; color: #166534; }
    .decided.bad { background: #fee2e2; color: #b91c1c; }
    .decided span { flex: 1; display: flex; flex-direction: column; font-size: 13px; } .decided small { font-size: 11.5px; opacity: .85; }
    .hist { border-top: 1px solid #f0f0f6; padding-top: 8px; }
    .hist h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 15px; font-weight: 700; }
    .hi { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 12.5px; padding: 3px 0 3px 4px; }
    .hi app-icon { color: #16a34a; } .hi[data-t='orange'] app-icon { color: #ea580c; } .hi[data-t='red'] app-icon { color: #dc2626; } .hi[data-t='blue'] app-icon { color: #2563eb; }
    .hi small { color: #334155; font-size: 12px; }
    .vm-person.big { margin-bottom: 12px; } .vm-person.big span { display: flex; flex-direction: column; } .vm-person.big small { color: var(--muted); }
    .kv3 { margin-bottom: 6px; }
    .btn-red { height: 38px; padding: 0 18px; border: 0; border-radius: 8px; background: #dc2626; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    .ta2 { height: auto; padding: 8px 10px; font: inherit; resize: vertical; }
    .scanbox { margin-top: 14px; border: 2px dashed #c4b5fd; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; background: #faf8ff; color: var(--primary); }
    .scanbox b { color: var(--text); font-size: 14px; } .scanbox small { color: var(--muted); }
    .scanbox.live { background: #0f172a; border-color: #334155; }
    .cons-ck { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-top: 12px; } .cons-ck input { accent-color: var(--primary); }
    .stages { display: flex; flex-direction: column; gap: 6px; margin: 14px 0 10px; }
    .stg { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #94a3b8; } .stg.done { color: #166534; } .stg.done app-icon { color: #16a34a; } .stg.cur { color: var(--text); font-weight: 600; }
    .prog { height: 6px; border-radius: 3px; background: #ede9fe; overflow: hidden; } .prog i { display: block; height: 100%; background: var(--primary); transition: width .4s; }
    .res { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px; } .res .vm-kv { flex: 1; }
    .drop { margin-top: 12px; border: 2px dashed #c4b5fd; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; color: var(--primary); background: #faf8ff; text-align: center; }
    .drop b { color: var(--text); font-size: 13.5px; } .drop small { color: var(--muted); } .drop.has { border-color: #86efac; background: #f0fdf4; }
    .err-t { color: #dc2626; font-size: 12px; margin: 6px 0 0; }
    @media (max-width: 1400px) { .grid { grid-template-columns: minmax(0, 1fr); } .sum { position: static; } .bar { flex-wrap: wrap; } }
  `,
})
export class IdVerification {
  private readonly vm = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly tabs = TABS;
  protected readonly sites = SITES.slice(0, 4);
  protected readonly docTypes = DOC_TYPES;
  protected readonly methods = METHODS;
  protected readonly reviewReasons = REVIEW_REASONS;
  protected readonly rejectReasons = REJECT_REASONS;
  protected readonly stages = SCAN_STAGES;
  protected readonly stIcon = ST_ICON;
  protected readonly hm1 = hm1;
  protected readonly hm2 = hm2;
  /** Length of the 300° face-match gauge arc (r = 50). */
  protected readonly gauge = (2 * Math.PI * 50 * 300) / 360;

  protected readonly queue = signal<VItem[]>(QUEUE.map((v) => ({ ...v, checks: v.checks.map((c) => ({ ...c })), history: [...v.history] })));
  protected readonly activity = signal<VActivity[]>(ACTIVITY.map((a) => ({ ...a })));
  protected readonly tab = signal('Pending');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly docType = signal('');
  protected readonly method = signal('');
  protected readonly status = signal('');
  protected readonly qSort = signal('old');
  protected readonly selId = signal<string | null>('Q1');
  protected readonly menu = signal<string | null>(null);
  protected readonly spinning = signal(false);
  protected readonly rescanning = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly rejectOpen = signal(false);
  protected readonly zoom = signal(false);
  protected readonly editAct = signal<VActivity | null>(null);
  protected readonly actView = signal<VActivity | null>(null);
  protected readonly actSort = signal<{ k: ActKey; dir: 1 | -1 } | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly scan = signal<{ step: 'setup' | 'scanning' | 'done'; visitor: string; name: string; docType: string; method: string; consent: boolean; stage: number; face: number; docNo: string } | null>(null);
  protected readonly upload = signal<{ visitor: string; docType: string; expiry: string; file: string } | null>(null);
  protected readonly uploadErr = signal('');
  private seq = 100;

  protected readonly kpi = computed(() => {
    const l = this.queue(), n = (s: VStatus) => l.filter((v) => v.status === s).length;
    return { pending: 10 + n('Pending'), verified: 84 + n('Verified'), review: 3 + n('Needs Review'), failed: 1 + n('Failed') };
  });
  private matches(v: { name: string; company: string; docNo: string; docType: string; method: string }) {
    const q = this.q().trim().toLowerCase();
    if (q && !`${v.name} ${v.company} ${v.docNo} ${v.docType}`.toLowerCase().includes(q)) return false;
    if (this.docType() && v.docType !== this.docType()) return false;
    if (this.method() && v.method !== this.method()) return false;
    return true;
  }
  protected readonly queueRows = computed(() => {
    const t = this.tab(), st = this.status(), site = this.site(), s = this.qSort();
    const l = this.queue().filter((v) =>
      (t === 'Pending' ? v.status === 'Pending' || ((v.status === 'Needs Review' || v.status === 'Verified') && v.queued >= 580) : v.status === t) &&
      (!st || v.status === st) && (!site || v.site === site) && this.matches(v));
    return l.sort((a, b) => (s === 'old' ? a.queued - b.queued : s === 'new' ? b.queued - a.queued : s === 'time' ? a.time - b.time : a.name.localeCompare(b.name)));
  });
  protected readonly sel = computed(() => this.queue().find((v) => v.id === this.selId()) ?? null);
  protected readonly actRows = computed(() => {
    const st = this.status(), srt = this.actSort();
    const l = this.activity().filter((a) => this.matches(a) && (!st || a.result === st));
    if (!srt) return l;
    return [...l].sort((a, b) => (srt.k === 'at' ? a.at - b.at : String(a[srt.k]).localeCompare(String(b[srt.k]))) * srt.dir);
  });
  protected readonly expected = computed(() => {
    const inQ = new Set(this.queue().map((v) => v.name));
    return this.vm.visitors().filter((v) => (v.status === 'Expected' || v.status === 'Pending Approval') && !inQ.has(v.name)).slice(0, 14);
  });
  protected readonly scanName = computed(() => { const s = this.scan(); if (!s) return ''; return s.visitor ? this.vm.byId(s.visitor)?.name ?? '' : s.name.trim(); });

  protected docTitle(t: string) { return t === 'Passport' ? 'PASSPORT' : t === 'National ID' ? 'NATIONAL ID CARD' : t === 'Driver License' ? 'DRIVING LICENCE' : t.toUpperCase(); }
  protected ringTone(f: number) { return f >= 90 ? 'green' : f >= 75 ? 'orange' : 'red'; }
  protected okCheck(s: CheckSt) { return s === 'Passed' || s === 'Clear'; }
  protected onSite(name: string) { const v = this.vm.byName(name); return v?.status === 'Checked In' || v?.status === 'Overdue'; }
  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.reviewOpen.set(false); this.rejectOpen.set(false); this.zoom.set(false); this.editAct.set(null); this.actView.set(null); this.scanClose(); this.upload.set(null); }
  protected go(p: string, q?: string) { this.closeAll(); this.router.navigate(['/visitor-management', p], q ? { queryParams: { q } } : {}); }
  protected setTab(t: string) {
    this.tab.set(t);
    const first = this.queueRows()[0];
    if (first && !this.queueRows().some((v) => v.id === this.selId())) this.selId.set(first.id);
  }
  protected sortAct(k: ActKey) { this.actSort.update((s) => ({ k, dir: s?.k === k ? (-s.dir as 1 | -1) : 1 })); }

  private patch(id: string, f: (v: VItem) => Partial<VItem>) { this.queue.update((l) => l.map((v) => (v.id === id ? { ...v, ...f(v) } : v))); }
  private hist(id: string, text: string, tone?: VHist['tone']) { this.patch(id, (v) => ({ history: [...v.history, { text, at: this.vm.now(), tone }] })); }
  private record(v: VItem, result: VActivity['result'], by = 'Priya Sharma') {
    this.activity.update((l) => [{ id: `A${++this.seq}`, name: v.name, company: v.company, docType: v.docType, docNo: v.docNo.replace(/^(.)•*/, '$1•••••'), method: v.method, by, at: this.vm.now(), result }, ...l]);
  }
  private nextPending(after: string) {
    const n = this.queueRows().find((v) => v.id !== after && (v.status === 'Pending' || v.status === 'Needs Review'));
    if (n) setTimeout(() => this.selId.set(n.id), 900);
  }

  protected approve(s: VItem) {
    if (!s.consent) { this.toast('Capture visitor consent before approving'); return; }
    this.patch(s.id, () => ({ status: 'Verified', warning: null, checks: s.checks.map((c) => ({ ...c, st: c.label === 'Watchlist screening' ? 'Clear' : 'Passed' })) }));
    this.hist(s.id, 'Approved & checked in by Priya Sharma');
    this.record(s, 'Verified');
    const v = this.vm.byName(s.name);
    let badge: string | undefined;
    if (v && v.status !== 'Checked In' && v.status !== 'Overdue') badge = this.vm.checkIn(v.id);
    else if (!v) badge = this.vm.add({ name: s.name, company: s.companyFull, host: s.host, site: s.site, purpose: s.purpose, idType: s.docType, idNo: s.docNo }, 'Checked In').id;
    this.vm.log({ text: `${s.name} ID verified (${s.docType}, face match ${s.face.toFixed(1)}%)`, kind: 'system', visitor: v?.id ?? badge });
    this.toast(badge ? `${s.name} verified & checked in · badge ${badge} · ${s.host} notified` : `${s.name} verified · already on-site, verification recorded`);
    this.nextPending(s.id);
  }
  protected markReview(s: VItem, reason: string, note: string) {
    this.patch(s.id, () => ({ status: 'Needs Review', warning: s.warning ?? `${reason.toLowerCase()}.` }));
    this.hist(s.id, `Marked for review – ${reason}${note.trim() ? ` (${note.trim()})` : ''}`, 'orange');
    this.record(s, 'Needs Review');
    this.reviewOpen.set(false);
    this.toast(`${s.name} sent to security review`);
  }
  protected reject(s: VItem, reason: string, note: string) {
    this.patch(s.id, () => ({ status: 'Failed' }));
    this.hist(s.id, `Rejected – ${reason}${note.trim() ? ` (${note.trim()})` : ''}`, 'red');
    this.record(s, 'Failed');
    this.vm.log({ text: `${s.name} ID verification rejected: ${reason}`, kind: 'alert' });
    this.rejectOpen.set(false);
    this.toast(`${s.name} rejected – ${reason}. ${s.host} and security notified`);
    this.nextPending(s.id);
  }
  protected reopen(s: VItem) { this.patch(s.id, () => ({ status: 'Pending' })); this.hist(s.id, 'Re-opened for verification', 'blue'); this.toast(`${s.name} back in the pending queue`); }
  protected consent(s: VItem) { this.patch(s.id, () => ({ consent: true })); this.hist(s.id, 'Consent captured'); this.toast('Consent captured'); }
  protected override(s: VItem, i: number) {
    const c = s.checks[i];
    if (this.okCheck(c.st)) { this.toast(`${c.label}: ${c.st}`); return; }
    this.patch(s.id, (v) => {
      const checks = v.checks.map((x, j) => (j === i ? { ...x, st: (x.label === 'Watchlist screening' ? 'Clear' : 'Passed') as CheckSt } : x));
      return { checks, face: c.label === 'Face match' ? Math.max(v.face, 90.5) : v.face, warning: checks.every((x) => this.okCheck(x.st)) ? null : v.warning };
    });
    this.hist(s.id, `${c.label} manually overridden by Priya Sharma`, 'blue');
    this.toast(`${c.label} marked as passed (manual override logged)`);
  }
  protected rescan(s: VItem) {
    this.rescanning.set(true);
    this.toast('Re-scan requested · visitor asked to re-present the document');
    setTimeout(() => {
      this.rescanning.set(false);
      this.patch(s.id, (v) => ({
        warning: v.warning?.includes('glare') ? null : v.warning,
        face: v.warning?.includes('face') ? 93.7 : Math.min(99.6, +(v.face + 0.6).toFixed(1)),
        checks: v.warning?.includes('face') ? v.checks.map((c) => (c.label === 'Face match' ? { ...c, st: 'Passed' as CheckSt } : c)) : v.checks,
      }));
      const v = this.queue().find((x) => x.id === s.id)!;
      if (v.warning?.includes('face')) this.patch(s.id, () => ({ warning: null }));
      this.hist(s.id, 'Document re-scanned · image quality good');
      this.toast('Re-scan complete · all checks re-run');
    }, 1800);
  }

  // activity
  protected viewAct(a: VActivity) {
    this.menu.set(null);
    const q = this.queue().find((v) => v.name === a.name);
    if (q) { this.selId.set(q.id); if (!this.queueRows().some((v) => v.id === q.id)) this.tab.set(q.status === 'Pending' || q.status === 'Needs Review' ? 'Pending' : q.status); window.scrollTo({ top: 0, behavior: 'smooth' }); this.toast(`Showing ${a.name}`); }
    else this.actView.set(a);
  }
  protected saveAct(a: VActivity, result: string, by: string) {
    this.activity.update((l) => l.map((x) => (x.id === a.id ? { ...x, result: result as VStatus, by } : x)));
    this.editAct.set(null);
    this.toast('Verification record updated');
  }
  protected reverify(a: VActivity) {
    this.menu.set(null); this.actView.set(null);
    const q = this.queue().find((v) => v.name === a.name);
    if (q) { this.patch(q.id, () => ({ status: 'Pending' })); this.hist(q.id, 'Re-verification requested', 'blue'); this.selId.set(q.id); this.tab.set('Pending'); }
    else this.addToQueue({ name: a.name, company: a.company, docType: a.docType, method: a.method, status: 'Pending' });
    this.toast(`${a.name} added to the verification queue`);
  }
  protected report(a: VActivity) {
    this.menu.set(null);
    downloadCsv(`id-verification-${a.name.toLowerCase().replace(/\s+/g, '-')}.csv`, [['Visitor', 'Company', 'Document', 'Method', 'Verified By', 'Date & Time', 'Result'], [a.name, a.company, `${a.docType} (${a.docNo})`, a.method, a.by, `15 Oct 2026, ${hm2(a.at)}`, a.result]]);
    this.toast('Verification report downloaded');
  }

  private addToQueue(p: { name: string; company: string; docType: string; method: string; status: VStatus; host?: string; site?: string; purpose?: string; time?: number; face?: number; consent?: boolean; history?: VHist[]; expiry?: string }) {
    const id = `Q${++this.seq}`;
    const now = this.vm.now();
    const docNo = `${p.docType[0]}•••••${String(1000 + ((this.seq * 7919) % 9000))}`;
    const item: VItem = {
      id, name: p.name, company: p.company, companyFull: p.company, time: p.time ?? now + 10, queued: now, docType: p.docType, docNo, country: 'India', expiry: p.expiry ?? '12 Aug 2031',
      site: p.site ?? SITES[0], host: p.host ?? 'Priya Sharma', purpose: p.purpose ?? 'Business Meeting', method: p.method, consent: p.consent ?? true, status: p.status,
      face: p.face ?? 97.2, checks: newChecks(), warning: null, history: p.history ?? [{ text: 'Document captured', at: now }, { text: 'OCR completed', at: now }, { text: 'Face match completed', at: now }, { text: 'Watchlist screened', at: now }],
    };
    this.queue.update((l) => [...l, item]);
    this.tab.set('Pending');
    this.selId.set(id);
    return item;
  }

  // scan
  private timers: ReturnType<typeof setTimeout>[] = [];
  protected openScan() {
    this.menu.set(null);
    this.scan.set({ step: 'setup', visitor: this.expected()[0]?.id ?? '', name: '', docType: 'Passport', method: 'Reception Scanner', consent: true, stage: 0, face: 0, docNo: '' });
  }
  protected patchScan(k: string, v: unknown) { this.scan.update((s) => (s ? { ...s, [k]: v } : s)); }
  protected startScan() {
    const s = this.scan(); if (!s) return;
    this.scan.set({ ...s, step: 'scanning', stage: 0, face: +(95 + Math.random() * 4.5).toFixed(1), docNo: `${s.docType[0]}•••••${String(1000 + Math.floor(Math.random() * 9000))}` });
    SCAN_STAGES.forEach((_, i) => this.timers.push(setTimeout(() => this.patchScan('stage', i + 1), 650 * (i + 1))));
    this.timers.push(setTimeout(() => this.patchScan('step', 'done'), 650 * SCAN_STAGES.length + 350));
  }
  protected scanClose() { this.timers.forEach(clearTimeout); this.timers = []; this.scan.set(null); }
  protected finishScan(approve: boolean) {
    const s = this.scan(); if (!s) return;
    const v = s.visitor ? this.vm.byId(s.visitor) : null;
    const item = this.addToQueue({ name: this.scanName(), company: v?.company ?? 'Walk-in', docType: s.docType, method: s.method, status: 'Pending', host: v?.host, site: v?.site, purpose: v?.purpose ?? 'Walk-in Visit', time: v?.arrival, face: s.face,
      history: [{ text: 'Document scanned', at: this.vm.now() }, { text: 'OCR completed', at: this.vm.now() }, { text: `Face match completed (${s.face.toFixed(1)}%)`, at: this.vm.now() }, { text: 'Watchlist screened', at: this.vm.now() }] });
    this.patch(item.id, () => ({ docNo: s.docNo }));
    this.scanClose();
    if (approve) this.approve({ ...item, docNo: s.docNo });
    else this.toast(`${item.name} added to the verification queue`);
  }

  // upload
  protected openUpload() { this.menu.set(null); this.uploadErr.set(''); this.upload.set({ visitor: this.expected()[0]?.id ?? '', docType: 'Passport', expiry: '2030-06-30', file: '' }); }
  protected patchUpload(k: string, v: string) { this.upload.update((u) => (u ? { ...u, [k]: v } : u)); }
  protected pickFile(files: FileList | null | undefined) {
    const f = files?.[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { this.uploadErr.set('File is larger than 10 MB'); return; }
    this.uploadErr.set('');
    this.patchUpload('file', f.name);
  }
  protected doUpload() {
    const u = this.upload(); if (!u) return;
    if (!u.file) { this.uploadErr.set('Choose a document image or PDF to upload'); return; }
    const v = this.vm.byId(u.visitor);
    if (!v) { this.uploadErr.set('Choose a visitor'); return; }
    const exp = new Date(u.expiry);
    const expired = exp.getTime() < new Date('2026-10-15').getTime();
    const expiry = isNaN(exp.getTime()) ? '—' : exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const item = this.addToQueue({ name: v.name, company: v.company, docType: u.docType, method: 'Manual Upload + OCR', status: expired ? 'Expired' : 'Needs Review', host: v.host, site: v.site, purpose: v.purpose, time: v.arrival, face: 92.8, expiry,
      history: [{ text: `Document uploaded (${u.file})`, at: this.vm.now() }, { text: 'OCR completed', at: this.vm.now() }, { text: 'Face match pending live photo', at: this.vm.now(), tone: 'orange' }] });
    this.patch(item.id, (x) => ({ warning: expired ? `document expired on ${expiry}.` : 'uploaded copy – confirm original document at the desk.', checks: x.checks.map((c) => (c.label === 'Document not expired' && expired ? { ...c, st: 'Failed' as CheckSt } : c.label === 'Document authenticity' ? { ...c, st: 'Review' as CheckSt } : c)) }));
    if (expired) this.tab.set('Expired');
    this.upload.set(null);
    this.toast(expired ? `${v.name}: document expired – verification blocked` : `${u.file} uploaded · ${v.name} queued for review`);
  }

  protected exportCsv() {
    const l = this.actRows();
    downloadCsv('id-verification-activity.csv', [['Visitor', 'Company', 'Document', 'Verification Method', 'Verified By', 'Date & Time', 'Result'], ...l.map((a) => [a.name, a.company, `${a.docType} (${a.docNo})`, a.method, a.by, `15 Oct 2026, ${hm2(a.at)}`, a.result])]);
    this.toast(`Exported ${l.length} verification records`);
  }
  protected exportQueue() {
    this.menu.set(null);
    const l = this.queueRows();
    downloadCsv('id-verification-queue.csv', [['Visitor', 'Company', 'Document', 'Document No.', 'Scheduled', 'Host', 'Site', 'Face Match', 'Status'], ...l.map((v) => [v.name, v.companyFull, v.docType, v.docNo, hm1(v.time), v.host, v.site, `${v.face}%`, v.status])]);
    this.toast(`Exported ${l.length} queue items`);
  }
  protected refresh() {
    this.q.set(''); this.site.set(''); this.docType.set(''); this.method.set(''); this.status.set('');
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast('Verification queue refreshed');
  }
  private tt: ReturnType<typeof setTimeout> | undefined;
  protected toast(m: string) { this.msg.set(m); clearTimeout(this.tt); this.tt = setTimeout(() => this.msg.set(null), 2800); }
}
