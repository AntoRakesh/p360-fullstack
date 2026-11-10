import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { TIME_OPTS, Toaster, VmAreas, VmQr } from './vm-a-kit';
import { PASS_TYPES, QrPass, QrPassStore, PassStatus, SCAN_LIMITS, dayOpt, scansLabel, validity, validityLong } from './vm-qr-passes.data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, PURPOSES, SITES, VmStore, hm } from './vm.data';

interface PassForm {
  type: string; visitor: string; contact: string; company: string; host: string; purpose: string; site: string;
  fromDay: number; fromTime: number; untilDay: number; untilTime: number; areas: string[]; limit: number; reentry: boolean; idCheck: boolean; via: 'Email' | 'SMS';
}
const SAMPLE: PassForm = {
  type: 'Visitor Day Pass', visitor: 'Arjun Mehta', contact: 'arjun.mehta@techsolutions.com', company: 'Tech Solutions Pvt. Ltd.', host: 'Priya Sharma', purpose: 'Business Meeting',
  site: SITES[0], fromDay: 0, fromTime: 630, untilDay: 0, untilTime: 750, areas: ['Main Entrance', 'Meeting Rooms', 'Visitor Lounge'], limit: 3, reentry: true, idCheck: false, via: 'Email',
};
const TOP_TABS = ['All Passes', 'Active', 'Used', 'Expired', 'Revoked'];
const SUB_TABS = ['All', 'Sent', 'Scanned', 'Expired', 'Revoked'];
const TONE: Record<string, 'green' | 'orange' | 'red' | 'grey'> = { Active: 'green', Used: 'orange', Expired: 'red', Revoked: 'grey', Draft: 'grey' };
const SICON: Record<string, string> = { Active: 'vm-c-check-circle', Used: 'clock', Expired: 'vm-c-x-circle', Revoked: 'vm-a-minus-circle', Draft: 'file-text' };
type SortKey = 'visitor' | 'id' | 'type' | 'host' | 'site' | 'validity' | 'scans' | 'status';
const BULK_SAMPLE = 'Rahul Nair, rahul.nair@vertex.com, Vertex Systems\nSara Ahmed, sara.ahmed@pwc.com, PwC\nImran Kapoor, +91 98860 44120, Blue Dart';

@Component({
  selector: 'app-vm-qr-passes',
  imports: [...UI, ...VM_UI, VmQr, VmAreas, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page qp">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/home"><app-icon name="home" [size]="14" /></a><app-icon name="chevron-right" [size]="12" /><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="12" /><b>QR Invitations &amp; Digital Passes</b></nav>
          <h1>QR Invitations &amp; Digital Passes</h1>
          <p>Create secure QR invitations and manage digital passes for fast, contactless entry.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="newPass()"><app-icon name="plus" [size]="18" />Create QR Invitation</button>
          <button class="btn-outline hb" (click)="bulkOpen.set(true)"><app-icon name="m-upload" [size]="17" />Bulk Generate</button>
          <button class="btn-outline hb" (click)="exportCsv(rows())"><app-icon name="download" [size]="17" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="go('visitor-passes-badges')"><app-icon name="vm-a-pass" [size]="15" />Passes &amp; Badges</button>
                <button class="dd-item" (click)="go('visit-invitations')"><app-icon name="vm-c-mail" [size]="15" />Visit Invitations</button>
                <button class="dd-item" (click)="go('visitor-check-in-check-out')"><app-icon name="vm-c-scan" [size]="15" />Check-in / Check-out</button>
                <button class="dd-item" (click)="expireOld()"><app-icon name="clock" [size]="15" />Expire ended passes</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Active Passes" [value]="st.kpi().active" icon="vm-a-pass" color="var(--ka-7c3aed)" [clickable]="true" [active]="top() === 'Active'" (pick)="top.set('Active')" />
        <vm-kpi label="QR Invitations Sent" [value]="st.kpi().sent" icon="vm-c-mail" color="var(--ka-ea7a1a)" [clickable]="true" [active]="sub() === 'Sent'" (pick)="sub.set('Sent'); top.set('All Passes')" />
        <vm-kpi label="Used Today" [value]="st.kpi().used" icon="vm-c-check-circle" color="var(--ka-16a34a)" [clickable]="true" [active]="sub() === 'Scanned'" (pick)="sub.set('Scanned'); top.set('All Passes')" />
        <vm-kpi label="Expiring Soon" [value]="st.kpi().expiring" icon="clock" color="var(--ka-dc2626)" [clickable]="true" [active]="validF() === 'today'" (pick)="validF.set('today'); top.set('Active')" />
      </section>

      <div class="vm-bar bar">
        <vm-tabs [tabs]="topTabs" [value]="top()" (change)="top.set($event)" />
        <span class="vm-sep"></span>
        <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search visitor, pass ID, host..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="map-pin" [size]="16" /><span>Site:</span><select [value]="siteF()" (change)="siteF.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="layers" [size]="16" /><span>Pass Type:</span><select [value]="typeF()" (change)="typeF.set($any($event.target).value)"><option value="">All</option>@for (t of passTypes; track t) {<option [value]="t">{{ t }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="calendar-days" [size]="16" /><span>Validity:</span><select [value]="validF()" (change)="validF.set($any($event.target).value)"><option value="">All</option><option value="today">Today</option><option value="future">Upcoming</option><option value="multi">Multi-day</option><option value="past">Past</option></select></label>
        <label class="vm-filter"><app-icon name="clock" [size]="16" /><span>Status:</span><select [value]="statusF()" (change)="statusF.set($any($event.target).value)"><option value="">All</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <button class="vm-icon-btn" [class.spin]="spinning()" title="Reset filters" (click)="refresh()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="qg">
        <div class="vm-card form" [class.editing]="editId()">
          <div class="vm-card-head ch">
            <h2><app-icon name="vm-c-mail" [size]="24" />{{ editId() ? 'Edit QR Invitation · ' + editId() : 'Create QR Invitation' }}</h2>
            <span class="spacer"></span>
            @if (editId()) {<button class="vm-mini" (click)="newPass()">Cancel edit</button>}
            @else {<button class="vm-mini" (click)="fillSample()">Fill sample</button><button class="vm-mini" (click)="clearForm()">Clear</button>}
          </div>
          <div class="fgrid">
            <div class="lc">
              <div class="fr"><label>Pass type <b>*</b></label><div class="vm-input"><app-icon name="vm-a-pass" [size]="16" /><select [value]="f().type" (change)="set('type', $any($event.target).value)">@for (t of passTypes; track t) {<option [value]="t">{{ t }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Visitor name <b>*</b></label><div class="vm-input" [class.err]="err().visitor"><app-icon name="user" [size]="16" /><input #vn placeholder="Full name" [value]="f().visitor" (input)="set('visitor', $any($event.target).value)" /></div></div>
              <div class="fr"><label>Email or mobile <b>*</b></label><div class="vm-input" [class.err]="err().contact"><app-icon [name]="f().via === 'SMS' ? 'phone' : 'vm-c-mail'" [size]="16" /><input [placeholder]="f().via === 'SMS' ? '+91 98xxx xxxxx' : 'name@company.com'" [value]="f().contact" (input)="set('contact', $any($event.target).value)" /></div></div>
              @if (err().contact) {<p class="et">{{ f().via === 'SMS' ? 'Enter a valid mobile number for SMS delivery' : 'Enter a valid email address' }}</p>}
              <div class="fr"><label>Company/Organization <b>*</b></label><div class="vm-input" [class.err]="err().company"><app-icon name="building" [size]="16" /><input placeholder="Company" [value]="f().company" (input)="set('company', $any($event.target).value)" /></div></div>
              <div class="fr"><label>Host/Employee <b>*</b></label><div class="vm-input"><app-icon name="user" [size]="16" /><select [value]="f().host" (change)="set('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Visit purpose <b>*</b></label><div class="vm-input"><app-icon name="briefcase" [size]="16" /><select [value]="f().purpose" (change)="set('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
            </div>
            <div class="rc">
              <div class="vm-field"><label>Site/Location <b>*</b></label><div class="vm-input"><app-icon name="map-pin" [size]="16" /><select [value]="f().site" (change)="set('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="vm-field"><label>Valid from <b>*</b></label>
                <div class="two">
                  <div class="vm-input"><app-icon name="calendar-days" [size]="16" /><select [value]="'' + f().fromDay" (change)="setDay('fromDay', +$any($event.target).value)">@for (d of days; track d) {<option [value]="'' + d">{{ dayOpt(d) }}</option>}</select><app-icon class="chev" name="calendar-days" [size]="15" /></div>
                  <div class="vm-input"><app-icon name="clock" [size]="16" /><select [value]="'' + f().fromTime" (change)="set('fromTime', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div>
                </div>
              </div>
              <div class="vm-field"><label>Valid until <b>*</b></label>
                <div class="two">
                  <div class="vm-input" [class.err]="err().until"><app-icon name="calendar-days" [size]="16" /><select [value]="'' + f().untilDay" (change)="setDay('untilDay', +$any($event.target).value)">@for (d of days; track d) {<option [value]="'' + d">{{ dayOpt(d) }}</option>}</select><app-icon class="chev" name="calendar-days" [size]="15" /></div>
                  <div class="vm-input" [class.err]="err().until"><app-icon name="clock" [size]="16" /><select [value]="'' + f().untilTime" (change)="set('untilTime', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div>
                </div>
                @if (err().until) {<p class="et">“Valid until” must be after “Valid from”</p>}
              </div>
              <div class="vm-field"><label>Access areas <b>*</b></label><vm-areas [value]="f().areas" (valueChange)="set('areas', $event)" [options]="areas" [err]="err().areas" /></div>
              <div class="sl">
                <div class="vm-field"><label>Number of scans limit <b>*</b></label><div class="vm-input"><app-icon name="maximize" [size]="16" /><select [value]="'' + f().limit" (change)="set('limit', +$any($event.target).value)">@for (n of limits; track n) {<option [value]="'' + n">{{ n || 'Unlimited' }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
                <div class="tgl"><span>Allow re-entry <app-icon name="vm-a-info" [size]="14" title="Pass can be scanned again after exit, up to the scan limit" /></span><button class="vm-switch purple" [class.on]="f().reentry" (click)="set('reentry', !f().reentry)"></button></div>
              </div>
              <div class="tgl id"><span>Require ID verification <app-icon name="vm-a-info" [size]="14" title="Security verifies a photo ID at first scan" /></span><button class="vm-switch purple" [class.on]="f().idCheck" (click)="set('idCheck', !f().idCheck)"></button></div>
            </div>
          </div>
          <div class="sv">
            <label class="svl">Send via <b>*</b></label>
            <button class="vm-radio" [class.on]="f().via === 'Email'" (click)="setVia('Email')"><i></i><app-icon name="vm-c-mail" [size]="17" />Email</button>
            <button class="vm-radio" [class.on]="f().via === 'SMS'" (click)="setVia('SMS')"><i></i><app-icon name="tasks-smartphone" [size]="17" />SMS</button>
          </div>
          <div class="fa">
            <button class="btn-outline fb" (click)="previewOpen.set(true)"><app-icon name="eye" [size]="17" />Preview Pass</button>
            <button class="btn-outline fb" (click)="saveDraft()"><app-icon name="file-text" [size]="17" />Save Draft</button>
            <button class="btn-primary fb" (click)="generate()"><app-icon name="vm-c-send" [size]="17" />{{ editId() ? 'Update & Resend QR' : 'Generate & Send QR' }}</button>
          </div>
        </div>

        <div class="vm-card pv">
          <div class="vm-card-head ch"><h2><app-icon name="tasks-smartphone" [size]="24" />Digital Pass Preview</h2></div>
          <div class="phone">
            <div class="scr">
              <div class="sb"><b>10:24</b><span class="notch"></span>
                <svg width="44" height="11" viewBox="0 0 44 11" fill="var(--ka-ffffff)"><rect x="0" y="7" width="2.5" height="4" rx=".5"/><rect x="4" y="5" width="2.5" height="6" rx=".5"/><rect x="8" y="2.5" width="2.5" height="8.5" rx=".5"/><path d="M16 4.2a7 7 0 0 1 9.4 0l-1.2 1.3a5.2 5.2 0 0 0-7 0zM18.2 6.6a3.8 3.8 0 0 1 5 0l-2.5 2.8z"/><rect x="29" y="1.5" width="13" height="8" rx="2" fill="none" stroke="var(--kl-ffffff)" stroke-width="1.1"/><rect x="30.6" y="3" width="9.8" height="5" rx="1"/></svg>
              </div>
              <div class="logo"><span class="lg"><app-icon name="users" [size]="17" [stroke]="2" /></span>People360</div>
              <ng-container [ngTemplateOutlet]="passCard" [ngTemplateOutletContext]="{ $implicit: pv() }" />
            </div>
          </div>
          <div class="menu-wrap dl">
            <button class="dlb" (click)="toggleMenu('share', $event)"><app-icon name="download" [size]="17" />Download / Share Pass</button>
            @if (menu() === 'share') {
              <div class="dropdown up" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="downloadPass()"><app-icon name="download" [size]="15" />Download pass (SVG)</button>
                <button class="dd-item" (click)="copyLink(pv().id)"><app-icon name="reports-link" [size]="15" />Copy share link</button>
                <button class="dd-item" (click)="menu.set(null); toast.show('Pass shared to ' + (pv().visitor || 'visitor') + ' on WhatsApp')"><app-icon name="reports-share" [size]="15" />Share via WhatsApp</button>
                <button class="dd-item" (click)="menu.set(null); toast.show('Apple / Google Wallet pass generated for ' + pv().id)"><app-icon name="m-wallet" [size]="15" />Add to Wallet</button>
              </div>
            }
          </div>
        </div>
      </div>

      <div class="vm-card tc">
        <div class="vm-card-head ch"><h2><app-icon name="users" [size]="24" />Active QR Invitations &amp; Digital Passes</h2><span class="spacer"></span>
          @if (checked().size) {<span class="selc">{{ checked().size }} selected</span><button class="vm-mini" (click)="bulkResend()">Resend</button><button class="vm-mini red" (click)="bulkRevoke()">Revoke</button><button class="vm-mini" (click)="exportCsv(selected())">Export</button>}
        </div>
        <vm-tabs [tabs]="subTabs" [value]="sub()" (change)="sub.set($event)" />
        <div class="tw">
          <table class="vm-table">
            <thead><tr>
              <th class="cb"><input type="checkbox" [checked]="allChecked()" (change)="checkAll($any($event.target).checked)" /></th>
              @for (c of cols; track c[0]) {<th class="sort" (click)="sortBy(c[0])">{{ c[1] }}<app-icon class="si" [name]="sortK() === c[0] ? (sortAsc() ? 'arrow-up' : 'arrow-down') : 'vm-c-sort'" [size]="13" /></th>}
              <th class="ac">Actions</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr [class.flash]="flash() === r.id" [class.sel]="editId() === r.id">
                  <td class="cb"><input type="checkbox" [checked]="checked().has(r.id)" (change)="check(r.id)" /></td>
                  <td><button class="vm-link nm" (click)="view.set(r.id)">{{ r.visitor }}</button></td>
                  <td>{{ r.id }}</td>
                  <td>{{ r.type }}</td>
                  <td>{{ r.host }}</td>
                  <td>{{ r.site }}</td>
                  <td>{{ validity(r) }}</td>
                  <td>{{ scansLabel(r) }}</td>
                  <td><vm-status [label]="r.status" [tone]="tone[r.status]" [icon]="sicon[r.status]" /></td>
                  <td>
                    <div class="vm-acts">
                      <button class="ia" title="View pass" (click)="view.set(r.id)"><app-icon name="eye" [size]="17" /></button>
                      <button class="ia" title="Edit" (click)="edit(r)"><app-icon name="w-pencil" [size]="16" /></button>
                      <button class="ia red" title="Revoke" [disabled]="r.status === 'Revoked'" (click)="revokeId.set(r.id)"><app-icon name="vm-a-minus-circle" [size]="17" /></button>
                      <div class="menu-wrap">
                        <button class="ia" (click)="toggleMenu('row:' + r.id, $event)"><app-icon name="more" [size]="17" /></button>
                        @if (menu() === 'row:' + r.id) {
                          <div class="dropdown right" (click)="$event.stopPropagation()">
                            @if (r.status === 'Active') {<button class="dd-item" (click)="scan(r)"><app-icon name="vm-c-scan" [size]="15" />Simulate gate scan</button>}
                            @if (r.status === 'Active' || r.status === 'Draft') {<button class="dd-item" (click)="resend(r)"><app-icon name="vm-c-send" [size]="15" />{{ r.status === 'Draft' ? 'Send now' : 'Resend via ' + r.via }}</button>}
                            <button class="dd-item" (click)="extend(r)"><app-icon name="clock" [size]="15" />Extend validity +1 hour</button>
                            <button class="dd-item" (click)="copyLink(r.id)"><app-icon name="reports-link" [size]="15" />Copy pass link</button>
                            <button class="dd-item" (click)="duplicate(r)"><app-icon name="reports-copy" [size]="15" />Duplicate as new</button>
                            @if (r.status === 'Revoked' || r.status === 'Expired') {<button class="dd-item" (click)="reactivate(r)"><app-icon name="refresh" [size]="15" />Reactivate</button>}
                            <button class="dd-item" (click)="go('visitor-passes-badges')"><app-icon name="vm-c-printer" [size]="15" />Print badge</button>
                            @if (r.status === 'Draft') {<button class="dd-item" (click)="del(r)"><app-icon name="vm-c-trash" [size]="15" />Delete draft</button>}
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="vm-empty">No passes match these filters. <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="foot">Showing {{ rows().length }} of {{ st.passes().length }} passes</div>
      </div>
    </div>

    <ng-template #passCard let-p>
      <div class="pc">
        <div class="pch"><app-icon name="vm-a-pass" [size]="19" /><b>Visitor Pass</b><vm-status [label]="p.status" [tone]="tone[p.status]" [icon]="sicon[p.status]" /></div>
        <vm-qr class="pq" [data]="p.id + p.visitor + p.untilTime" [size]="104" [framed]="true" />
        <div class="pkv">
          <app-icon name="user" [size]="14" /><span>Visitor</span><i>:</i><b>{{ p.visitor || '—' }}</b>
          <app-icon name="building" [size]="14" /><span>Company</span><i>:</i><b>{{ p.company || '—' }}</b>
          <app-icon name="users" [size]="14" /><span>Host</span><i>:</i><b>{{ p.host }}</b>
          <app-icon name="map-pin" [size]="14" /><span>Site</span><i>:</i><b>{{ p.site }}</b>
          <app-icon name="briefcase" [size]="14" /><span>Purpose</span><i>:</i><b>{{ p.purpose }}</b>
          <app-icon name="calendar-days" [size]="14" /><span>Validity</span><i>:</i><b>{{ validityLong(p) }}</b>
          <app-icon class="ac2" name="layers" [size]="14" /><span class="ac2">Access</span><i class="ac2">:</i><div class="pa">@for (a of p.areas; track a) {<span>{{ a }}</span>} @empty {—}</div>
          <app-icon name="vm-a-barcode" [size]="14" /><span>Pass ID</span><i>:</i><b>{{ p.id }}</b>
        </div>
        <div class="perf"></div>
      </div>
    </ng-template>

    @if (previewOpen()) {
      <div class="g-overlay" (click)="previewOpen.set(false)"></div>
      <div class="g-modal sm pm">
        <div class="modal-head"><h3>Pass preview</h3><button class="close-btn" (click)="previewOpen.set(false)">×</button></div>
        <div class="pmb"><ng-container [ngTemplateOutlet]="passCard" [ngTemplateOutletContext]="{ $implicit: pv() }" /></div>
        <p class="muted">Delivered via <b>{{ f().via }}</b> to {{ f().contact || '—' }} · {{ f().limit ? f().limit + ' scan(s)' : 'unlimited scans' }}{{ f().reentry ? ', re-entry allowed' : '' }}{{ f().idCheck ? ', ID check at gate' : '' }}</p>
        <div class="form-actions"><button class="btn-ghost" (click)="previewOpen.set(false)">Back to edit</button><button class="btn-primary" (click)="previewOpen.set(false); generate()">{{ editId() ? 'Update & Resend QR' : 'Generate & Send QR' }}</button></div>
      </div>
    }
    @if (viewP(); as p) {
      <div class="g-overlay" (click)="view.set(null)"></div>
      <div class="g-modal vmod">
        <div class="modal-head"><h3>{{ p.visitor }} · {{ p.id }}</h3><button class="close-btn" (click)="view.set(null)">×</button></div>
        <div class="vb">
          <vm-qr [data]="p.id + p.visitor + p.untilTime" [size]="150" [framed]="true" />
          <div class="kv2">
            <span>Pass type</span><b>{{ p.type }}</b>
            <span>Status</span><b><vm-status [label]="p.status" [tone]="tone[p.status]" [icon]="sicon[p.status]" /></b>
            <span>Company</span><b>{{ p.company }}</b>
            <span>Sent to</span><b>{{ p.contact }} ({{ p.via }})</b>
            <span>Host</span><b>{{ p.host }}</b>
            <span>Site</span><b>{{ p.site }}</b>
            <span>Validity</span><b>{{ validityLong(p) }}</b>
            <span>Access areas</span><b>{{ p.areas.join(', ') }}</b>
            <span>Scans</span><b>{{ scansLabel(p) }}{{ p.reentry ? ' · re-entry allowed' : '' }}{{ p.idCheck ? ' · ID check' : '' }}</b>
            <span>Created</span><b>{{ p.sentAt }}</b>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="view.set(null)">Close</button>
          @if (p.status === 'Active') {<button class="btn-outline" (click)="scan(p)">Simulate scan</button>}
          <button class="btn-outline" (click)="view.set(null); edit(p)">Edit</button>
          @if (p.status !== 'Revoked') {<button class="vm-btn-danger" (click)="view.set(null); revokeId.set(p.id)">Revoke</button>}
          <button class="btn-primary" (click)="resend(p)">{{ p.status === 'Draft' ? 'Send now' : 'Resend' }}</button>
        </div>
      </div>
    }
    @if (revokeP(); as p) {
      <div class="g-overlay" (click)="revokeId.set(null)"></div>
      <form class="g-modal sm" (submit)="$event.preventDefault(); revoke(p, rr.value)">
        <div class="modal-head"><h3>Revoke pass {{ p.id }}?</h3><button type="button" class="close-btn" (click)="revokeId.set(null)">×</button></div>
        <p class="muted">{{ p.visitor }}’s QR code will stop working at all gates immediately. {{ p.host }} will be notified.</p>
        <label class="lbl">Reason<select #rr class="input"><option>Visit cancelled</option><option>Security concern</option><option>Issued in error</option><option>Host request</option></select></label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="revokeId.set(null)">Cancel</button><button class="btn-red" type="submit">Revoke Pass</button></div>
      </form>
    }
    @if (bulkOpen()) {
      <div class="g-overlay" (click)="bulkOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); bulkGenerate(bt.value, +bd.value, bty.value)">
        <div class="modal-head"><h3>Bulk generate QR passes</h3><button type="button" class="close-btn" (click)="bulkOpen.set(false)">×</button></div>
        <p class="muted">One visitor per line: <code>Name, email or mobile, Company</code>. Host, site, time window and access areas are taken from the form.</p>
        <textarea #bt class="input ta2" rows="5" [value]="bulkSample"></textarea>
        <div class="form-grid">
          <label>Pass type<select #bty class="input">@for (t of passTypes; track t) {<option [selected]="t === f().type">{{ t }}</option>}</select></label>
          <label>Valid on<select #bd class="input">@for (d of days; track d) {<option [value]="d">{{ dayOpt(d) }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="bulkOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Generate &amp; Send</button></div>
      </form>
    }
    @if (toast.msg()) {<div class="g-toast">{{ toast.msg() }}</div>}
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--kf-475569); margin-bottom: 2px; }
    .crumb a { color: var(--kf-475569); text-decoration: none; display: inline-flex; } .crumb a:hover { color: var(--primary); } .crumb b { font-weight: 500; color: var(--text); }
    .vm-head h1 { font-size: 30px; }
    .hb { height: 38px; padding: 0 15px; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
    .vm-icon-btn.tall { height: 38px; width: 38px; }
    .menu-wrap { position: relative; }
    .dropdown { left: 0; right: auto; min-width: 210px; z-index: 30; }
    .dropdown.right { left: auto; right: 0; }
    .dropdown.up { top: auto; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); }
    :host ::ng-deep .vm-kpi { padding: 12px 16px; }
    :host ::ng-deep .vm-kpi-ic { width: 54px; height: 54px; }
    :host ::ng-deep .vm-kpi-val { font-size: 29px; }
    .bar { gap: 6px; padding: 7px 8px; flex-wrap: nowrap; }
    .bar vm-tabs { flex-wrap: nowrap; gap: 4px; } :host ::ng-deep .bar .vm-tabs button { padding: 6px 10px; font-size: 12.5px; }
    .bar .vm-search { min-width: 110px; height: 34px; padding: 0 8px; }
    .bar .vm-filter { height: 34px; padding: 0 6px; gap: 4px; font-size: 12.5px; min-width: 0; flex: none; }
    .bar .vm-filter select { font-size: 12.5px; max-width: 74px; }
    .bar .vm-filter > span { font-size: 12px; }
    .bar .vm-icon-btn { height: 34px; width: 34px; }
    .spin app-icon { animation: sp .7s linear; } @keyframes sp { to { transform: rotate(360deg); } }
    .qg { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; align-items: stretch; }
    .ch { margin-bottom: 10px; gap: 8px; } .ch h2 { font-size: 19px; }
    .form { padding: 12px 18px 14px; } .form.editing { outline: 2px solid var(--kl-c4b5fd); }
    .fgrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 26px; padding-bottom: 12px; border-bottom: 1px solid var(--kl-eef0f6); }
    .fr { display: grid; grid-template-columns: 146px minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 9px; }
    .fr > label, .svl { font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap; }
    .fr > label b, .svl b, .vm-field > label b { color: var(--kf-dc2626); }
    .vm-field > label { font-weight: 600; }
    .vm-input { height: 34px; padding: 0 9px; gap: 7px; }
    .vm-input input, .vm-input select { font-size: 12.5px; }
    .vm-input select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 20px; text-overflow: ellipsis; }
    .vm-input .chev { margin-left: -24px; pointer-events: none; color: var(--kf-334155); }
    .vm-input > app-icon { color: var(--kf-475569); flex: none; }
    .rc { display: flex; flex-direction: column; gap: 7px; }
    .two { display: grid; grid-template-columns: 1.35fr 1fr; gap: 10px; }
    :host ::ng-deep vm-areas .box { min-height: 34px; padding: 3px 8px; }
    .sl { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
    .tgl { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; font-weight: 600; height: 34px; }
    .tgl span { display: inline-flex; align-items: center; gap: 6px; } .tgl app-icon { color: var(--kf-475569); }
    .tgl.id { justify-content: flex-start; } .tgl.id .vm-switch { margin-left: 70px; }
    .et { color: var(--kf-dc2626); font-size: 11.5px; margin: -5px 0 6px; }
    .rc .et { margin: 3px 0 0; }
    .sv { display: flex; align-items: center; gap: 14px; padding-top: 12px; }
    .svl { width: 80px; }
    .vm-radio { width: 188px; gap: 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--text); }
    .vm-radio app-icon { color: var(--kf-334155); }
    .fa { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
    .fb { height: 38px; display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; font-size: 13.5px; }
    .pv { display: flex; flex-direction: column; padding: 12px 16px 12px; }
    .phone { width: 296px; margin: 0 auto; border-radius: 42px; padding: 9px; background: linear-gradient(145deg, var(--kb-4c1d95), var(--kb-1e1b4b) 40%, var(--kb-312e81)); box-shadow: 0 10px 30px rgba(76, 29, 149, .35), inset 0 0 0 2px #7c3aed55; }
    .scr { border-radius: 34px; overflow: hidden; background: linear-gradient(170deg, var(--kb-6d28d9), var(--kb-7c3aed) 30%, var(--kb-a78bfa) 100%); padding: 0 10px 12px; }
    .sb { display: flex; align-items: center; justify-content: space-between; color: var(--kf-ffffff); font-size: 12.5px; padding: 9px 12px 0 14px; position: relative; height: 26px; }
    .notch { position: absolute; left: 50%; top: 7px; width: 82px; height: 21px; border-radius: 14px; background: var(--kb-111111); transform: translateX(-50%); }
    .logo { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--kf-ffffff); font-weight: 800; font-size: 20px; padding: 6px 0 9px; }
    .lg { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--kl-ffffff); display: grid; place-items: center; }
    .pc { background: var(--kb-ffffff); border-radius: 14px; padding: 11px 12px 14px; position: relative; }
    .pch { display: flex; align-items: center; gap: 7px; } .pch b { flex: 1; font-size: 14.5px; } .pch app-icon { color: var(--kf-334155); }
    .pch vm-status { font-size: 11px; padding: 2px 7px; gap: 4px; }
    .pq { display: flex !important; margin: 6px auto 8px; }
    .pkv { display: grid; grid-template-columns: 14px 54px 6px minmax(0, 1fr); gap: 3px 6px; font-size: 10.5px; align-items: center; }
    .pkv app-icon { color: var(--kf-334155); } .pkv span { color: var(--kf-334155); } .pkv i { font-style: normal; }
    .pkv b { font-weight: 500; overflow-wrap: anywhere; line-height: 1.3; }
    .pkv .ac2 { align-self: start; margin-top: 3px; }
    .pa { display: flex; flex-wrap: wrap; gap: 3px; margin: 2px 0; } .pa span { background: var(--kb-ede9fe); color: var(--kf-4c1d95); border-radius: 5px; padding: 2px 5px; font-size: 9px; }
    .perf { position: absolute; left: 6px; right: 6px; bottom: -5px; height: 10px; background: radial-gradient(circle at 5px 5px, var(--kb-c4b5fd) 4px, transparent 4.5px) 0 0 / 12px 10px repeat-x; }
    .dl { margin-top: 12px; }
    .dlb { width: 100%; height: 34px; border: 0; border-radius: 8px; background: var(--kb-f3f0ff); color: var(--primary); font: inherit; font-weight: 600; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
    .dlb:hover { background: var(--kb-ede9fe); }
    .tc { padding: 12px 16px 8px; display: flex; flex-direction: column; gap: 10px; } .tc .ch { margin-bottom: 0; }
    .selc { font-size: 12.5px; color: var(--muted); }
    .tw { max-height: 420px; overflow-y: auto; }
    .vm-table th { background: var(--kb-f3f0ff); position: sticky; top: 0; z-index: 1; padding: 8px 8px; }
    .vm-table td { padding: 7px 8px; font-size: 12.5px; white-space: nowrap; }
    .vm-table th .si { color: var(--kf-94a3b8); vertical-align: -2px; margin-left: 4px; }
    .vm-table vm-status { font-size: 12px; padding: 2px 9px; min-width: 76px; }
    .cb { width: 26px; } .cb input { width: 15px; height: 15px; accent-color: var(--primary); cursor: pointer; }
    .ac { text-align: center; }
    .nm { font-size: 13px; }
    .vm-acts { gap: 4px; justify-content: center; } .vm-acts .ia { padding: 3px; } .vm-acts .ia[disabled] { opacity: .35; cursor: default; }
    tr.flash td { animation: fl 2.4s ease; } @keyframes fl { 0%, 40% { background: var(--kb-ede9fe); } }
    .foot { font-size: 12px; color: var(--muted); padding: 0 4px 4px; }
    .muted { color: var(--muted); font-size: 13px; }
    .pmb { background: linear-gradient(170deg, var(--kb-6d28d9), var(--kb-a78bfa)); padding: 14px; border-radius: 14px; margin-bottom: 10px; }
    .pm { width: min(380px, calc(100vw - 32px)); }
    .pm .pkv { font-size: 11.5px; grid-template-columns: 16px 70px 8px minmax(0, 1fr); }
    .vmod { width: min(640px, calc(100vw - 32px)); }
    .vb { display: flex; gap: 20px; align-items: flex-start; }
    .kv2 { flex: 1; display: grid; grid-template-columns: 110px 1fr; gap: 7px 12px; font-size: 13px; } .kv2 > span { color: var(--muted); } .kv2 > b { font-weight: 600; }
    .g-modal.sm { width: min(440px, calc(100vw - 32px)); }
    .lbl { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin-top: 8px; }
    .ta2 { height: auto; width: 100%; padding: 8px 10px; font: inherit; font-size: 13px; resize: vertical; margin-bottom: 10px; box-sizing: border-box; }
    .btn-red { height: 38px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--kb-dc2626); color: var(--kf-ffffff); font: inherit; font-weight: 600; cursor: pointer; }
    code { background: var(--kb-f3f0ff); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
    @media (max-width: 1250px) { .qg { grid-template-columns: minmax(0, 1fr); } .bar { flex-wrap: wrap; } }
  `,
})
export class QrDigitalPasses {
  protected readonly st = inject(QrPassStore);
  private readonly vm = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly toast = new Toaster();
  protected readonly hm = hm;
  protected readonly dayOpt = dayOpt;
  protected readonly validity = validity;
  protected readonly validityLong = validityLong;
  protected readonly scansLabel = scansLabel;
  protected readonly tone = TONE;
  protected readonly sicon = SICON;
  protected readonly topTabs = TOP_TABS;
  protected readonly subTabs = SUB_TABS;
  protected readonly passTypes = PASS_TYPES;
  protected readonly statuses: PassStatus[] = ['Active', 'Used', 'Expired', 'Revoked', 'Draft'];
  protected readonly sites = SITES;
  protected readonly hosts = HOSTS;
  protected readonly purposes = PURPOSES;
  protected readonly areas = AREAS;
  protected readonly limits = SCAN_LIMITS;
  protected readonly days = Array.from({ length: 14 }, (_, i) => i);
  protected readonly times = TIME_OPTS;
  protected readonly bulkSample = BULK_SAMPLE;
  protected readonly cols: [SortKey, string][] = [['visitor', 'Visitor'], ['id', 'Pass ID'], ['type', 'Type'], ['host', 'Host'], ['site', 'Site'], ['validity', 'Validity'], ['scans', 'Scans'], ['status', 'Status']];

  protected readonly f = signal<PassForm>({ ...SAMPLE });
  protected readonly editId = signal<string | null>(null);
  protected readonly err = signal({ visitor: false, contact: false, company: false, areas: false, until: false });
  protected readonly top = signal('All Passes');
  protected readonly sub = signal('All');
  protected readonly q = signal('');
  protected readonly siteF = signal('');
  protected readonly typeF = signal('');
  protected readonly validF = signal('');
  protected readonly statusF = signal('');
  protected readonly sortK = signal<SortKey | null>(null);
  protected readonly sortAsc = signal(true);
  protected readonly menu = signal<string | null>(null);
  protected readonly view = signal<string | null>(null);
  protected readonly revokeId = signal<string | null>(null);
  protected readonly previewOpen = signal(false);
  protected readonly bulkOpen = signal(false);
  protected readonly spinning = signal(false);
  protected readonly flash = signal<string | null>(null);
  protected readonly checked = signal(new Set<string>());

  private readonly nextId = computed(() => {
    const nums = [...this.st.passes(), ...this.vm.visitors()].map((x) => +x.id.slice(4)).filter((n) => !isNaN(n));
    return `VIS-${String(Math.max(...nums) + 1).padStart(6, '0')}`;
  });
  /** Live pass shown in the phone preview. */
  protected readonly pv = computed<QrPass>(() => {
    const f = this.f(), id = this.editId();
    const cur = id ? this.st.byId(id) : null;
    return { ...f, id: id ?? this.nextId(), scans: cur?.scans ?? 0, status: cur?.status === 'Draft' || !cur ? 'Active' : cur.status, sentAt: '' };
  });
  protected readonly viewP = computed(() => (this.view() ? this.st.byId(this.view()!) : null));
  protected readonly revokeP = computed(() => (this.revokeId() ? this.st.byId(this.revokeId()!) : null));
  protected readonly rows = computed(() => {
    const top = this.top(), sub = this.sub(), q = this.q().trim().toLowerCase(), s = this.siteF(), t = this.typeF(), v = this.validF(), stt = this.statusF();
    let l = this.st.passes();
    if (top !== 'All Passes') l = l.filter((p) => p.status === top);
    if (sub === 'Sent') l = l.filter((p) => p.status === 'Active' && p.scans === 0);
    else if (sub === 'Scanned') l = l.filter((p) => p.scans > 0);
    else if (sub !== 'All') l = l.filter((p) => p.status === sub);
    if (q) l = l.filter((p) => `${p.visitor} ${p.id} ${p.host} ${p.company}`.toLowerCase().includes(q));
    if (s) l = l.filter((p) => p.site === s);
    if (t) l = l.filter((p) => p.type === t);
    if (v) l = l.filter((p) => (v === 'today' ? p.fromDay <= 0 && p.untilDay >= 0 && p.untilDay === 0 : v === 'future' ? p.fromDay > 0 : v === 'multi' ? p.untilDay > p.fromDay : p.untilDay < 0));
    if (stt) l = l.filter((p) => p.status === stt);
    const k = this.sortK();
    if (k) {
      const val = (p: QrPass): string | number => (k === 'validity' ? p.fromDay * 1440 + p.fromTime : k === 'scans' ? p.scans : (p as unknown as Record<string, string>)[k]);
      l = [...l].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (this.sortAsc() ? 1 : -1); });
    }
    return l;
  });
  protected readonly selected = computed(() => this.st.passes().filter((p) => this.checked().has(p.id)));
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.checked().has(r.id)));

  protected set<K extends keyof PassForm>(k: K, v: PassForm[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
    if (k in this.err()) this.err.update((e) => ({ ...e, [k]: false }));
    if (k === 'fromTime' || k === 'untilTime') this.err.update((e) => ({ ...e, until: false }));
  }
  protected setDay(k: 'fromDay' | 'untilDay', d: number) {
    this.set(k, d);
    if (k === 'fromDay' && this.f().untilDay < d) this.set('untilDay', d);
    this.err.update((e) => ({ ...e, until: false }));
  }
  protected setVia(v: 'Email' | 'SMS') {
    if (v === this.f().via) return;
    const c = this.f().contact;
    // swap the contact to something plausible for the new channel
    const swap = v === 'SMS' ? (c.includes('@') ? (HOSTS.find((h) => h.name === this.f().host)?.phone.replace('+91 9', '+91 8') ?? '') : c) : c.includes('@') ? c : this.f().visitor ? `${this.f().visitor.toLowerCase().replace(/[^a-z]+/g, '.')}@${this.f().company.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) || 'mail'}.com` : '';
    this.f.update((f) => ({ ...f, via: v, contact: swap }));
    this.err.update((e) => ({ ...e, contact: false }));
  }
  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.view.set(null); this.revokeId.set(null); this.previewOpen.set(false); this.bulkOpen.set(false); }
  protected go(p: string) { this.menu.set(null); this.router.navigate(['/visitor-management', p]); }
  private scrollForm() { setTimeout(() => document.querySelector('.qp .form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }
  protected newPass() { this.editId.set(null); this.clearForm(); this.scrollForm(); setTimeout(() => (document.querySelector('.qp .form input') as HTMLInputElement | null)?.focus(), 350); }
  protected clearForm() { this.f.set({ ...SAMPLE, visitor: '', contact: '', company: '', areas: ['Main Entrance'], limit: 1, reentry: false }); this.resetErr(); }
  protected fillSample() { this.f.set({ ...SAMPLE }); this.resetErr(); }
  private resetErr() { this.err.set({ visitor: false, contact: false, company: false, areas: false, until: false }); }
  private validate(): boolean {
    const f = this.f();
    const c = f.contact.trim();
    const e = {
      visitor: f.visitor.trim().length < 2,
      contact: f.via === 'Email' ? !/^\S+@\S+\.\S+$/.test(c) : c.replace(/\D/g, '').length < 8,
      company: !f.company.trim(),
      areas: !f.areas.length,
      until: f.untilDay * 1440 + f.untilTime <= f.fromDay * 1440 + f.fromTime,
    };
    this.err.set(e);
    const bad = Object.entries(e).filter(([, v]) => v).length;
    if (bad) this.toast.show(`Please fix ${bad} highlighted field${bad > 1 ? 's' : ''}`);
    return !bad;
  }
  private build(id: string, status: PassStatus, cur?: QrPass | null): QrPass {
    const f = this.f();
    return { ...f, visitor: f.visitor.trim(), contact: f.contact.trim(), company: f.company.trim(), id, status, scans: cur?.scans ?? 0, sentAt: '15 Oct 2026, ' + hm(this.vm.now()).padStart(8, '0') };
  }
  private newId(): string {
    const f = this.f();
    if (f.fromDay === 0) {
      return this.vm.add({ name: f.visitor.trim(), company: f.company.trim(), purpose: f.purpose, host: f.host, site: f.site, areas: f.areas, arrival: f.fromTime, departure: f.untilTime, email: f.via === 'Email' ? f.contact : undefined, phone: f.via === 'SMS' ? f.contact : undefined }).id;
    }
    return this.vm.nextBadge();
  }
  protected generate() {
    if (!this.validate()) return;
    const ed = this.editId();
    if (ed) {
      const cur = this.st.byId(ed);
      this.st.upsert(this.build(ed, cur?.status === 'Draft' || !cur ? 'Active' : cur.status === 'Expired' || cur.status === 'Revoked' ? 'Active' : cur.status, cur));
      this.vm.log({ text: `QR pass ${ed} updated and re-sent to ${this.f().visitor}`, kind: 'notify', visitor: ed });
      this.toast.show(`Pass ${ed} updated · new QR sent via ${this.f().via}`);
      this.editId.set(null);
      this.flashRow(ed);
    } else {
      const id = this.newId();
      this.st.upsert(this.build(id, 'Active'));
      this.vm.log({ text: `QR invitation ${id} sent to ${this.f().visitor} via ${this.f().via}`, kind: 'notify', visitor: id });
      this.toast.show(`QR pass ${id} generated & sent to ${this.f().contact}`);
      this.flashRow(id);
    }
    this.top.set('All Passes'); this.sub.set('All');
    this.clearForm();
  }
  protected saveDraft() {
    if (!this.f().visitor.trim()) { this.err.update((e) => ({ ...e, visitor: true })); this.toast.show('Add at least the visitor name to save a draft'); return; }
    const ed = this.editId();
    const id = ed ?? this.vm.nextBadge();
    this.st.upsert(this.build(id, ed ? this.st.byId(ed)?.status ?? 'Draft' : 'Draft', ed ? this.st.byId(ed) : null));
    this.toast.show(ed ? `Changes to ${id} saved` : `Draft ${id} saved – send it from the table when ready`);
    this.editId.set(null);
    this.flashRow(id);
    this.top.set('All Passes'); this.sub.set('All');
    this.clearForm();
  }
  private flashRow(id: string) { this.flash.set(id); setTimeout(() => this.flash.set(null), 2500); setTimeout(() => document.querySelector('.qp tr.flash')?.scrollIntoView({ block: 'nearest' }), 50); }
  protected edit(p: QrPass) {
    this.menu.set(null);
    const { type, visitor, contact, company, host, purpose, site, fromDay, fromTime, untilDay, untilTime, areas, limit, reentry, idCheck, via } = p;
    this.f.set({ type, visitor, contact, company, host, purpose, site, fromDay: Math.max(0, fromDay), fromTime, untilDay: Math.max(0, untilDay), untilTime, areas: [...areas], limit, reentry, idCheck, via });
    this.resetErr();
    this.editId.set(p.id);
    this.scrollForm();
  }
  protected duplicate(p: QrPass) { this.edit(p); this.editId.set(null); this.f.update((f) => ({ ...f, visitor: '', contact: '' })); this.toast.show('Copied into the form – enter the new visitor'); }
  protected revoke(p: QrPass, reason: string) {
    this.st.patch(p.id, { status: 'Revoked' });
    this.vm.log({ text: `QR pass ${p.id} (${p.visitor}) revoked – ${reason}`, kind: 'alert', visitor: p.id });
    this.revokeId.set(null);
    if (this.editId() === p.id) this.newPass();
    this.toast.show(`${p.id} revoked · QR disabled at all gates`);
  }
  protected scan(p: QrPass) {
    this.menu.set(null);
    const scans = p.scans + 1;
    const used = p.limit > 0 && scans >= p.limit;
    this.st.patch(p.id, { scans, status: used ? 'Used' : 'Active' });
    this.vm.log({ text: `${p.visitor} scanned QR pass ${p.id} at ${p.areas[0] ?? 'Main Entrance'}`, kind: 'checkin', visitor: p.id });
    this.toast.show(`Gate scan accepted for ${p.visitor} (${scans} of ${p.limit || '∞'})${used ? ' · scan limit reached' : ''}`);
  }
  protected resend(p: QrPass) {
    this.menu.set(null);
    if (p.status === 'Draft') {
      if (!p.contact) { this.edit(p); this.toast.show('Add an email or mobile number before sending'); return; }
      this.st.patch(p.id, { status: 'Active', sentAt: '15 Oct 2026, ' + hm(this.vm.now()).padStart(8, '0') });
      this.toast.show(`${p.id} sent to ${p.contact}`);
      return;
    }
    this.toast.show(`QR pass re-sent to ${p.contact} via ${p.via}`);
  }
  protected extend(p: QrPass) {
    this.menu.set(null);
    let t = p.untilTime + 60, d = p.untilDay;
    if (t >= 1440) { t -= 1440; d++; }
    const back = p.status === 'Expired' && d >= 0;
    this.st.patch(p.id, { untilTime: t, untilDay: d, validLabel: undefined, ...(back ? { status: 'Active' as PassStatus } : {}) });
    this.toast.show(`${p.id} now valid until ${hm(t)}${back ? ' · pass re-activated' : ''}`);
  }
  protected reactivate(p: QrPass) {
    this.menu.set(null);
    this.st.patch(p.id, { status: 'Active', fromDay: Math.max(0, p.fromDay), untilDay: Math.max(0, p.untilDay), untilTime: Math.max(p.untilTime, this.vm.now() + 120), validLabel: undefined });
    this.toast.show(`${p.id} reactivated for today`);
  }
  protected del(p: QrPass) { this.menu.set(null); this.st.remove(p.id); this.toast.show(`Draft ${p.id} deleted`); }
  protected copyLink(id: string) { this.menu.set(null); navigator.clipboard?.writeText(`https://people360.app/pass/${id}`).catch(() => {}); this.toast.show(`Pass link copied · people360.app/pass/${id}`); }
  protected downloadPass() {
    this.menu.set(null);
    const p = this.pv();
    const svg = document.querySelector('.qp .pv vm-qr svg')?.outerHTML ?? '';
    const out = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560"><rect width="420" height="560" rx="24" fill="var(--ka-7c3aed)"/><rect x="20" y="70" width="380" height="470" rx="18" fill="var(--ka-ffffff)"/><text x="210" y="46" fill="var(--ka-ffffff)" font-family="Arial" font-size="26" font-weight="700" text-anchor="middle">People360</text><text x="40" y="110" font-family="Arial" font-size="20" font-weight="700">Visitor Pass</text><g transform="translate(110,130) scale(1)">${svg.replace('<svg', '<svg width="200" height="200"')}</g><text x="40" y="380" font-family="Arial" font-size="15">${p.visitor} · ${p.company}</text><text x="40" y="410" font-family="Arial" font-size="15">Host: ${p.host}</text><text x="40" y="440" font-family="Arial" font-size="15">${p.site}</text><text x="40" y="470" font-family="Arial" font-size="15">${validityLong(p)}</text><text x="40" y="510" font-family="Arial" font-size="16" font-weight="700">Pass ID: ${p.id}</text></svg>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' }));
    a.download = `${p.id}-digital-pass.svg`;
    a.click();
    this.toast.show(`${p.id} pass downloaded`);
  }
  protected bulkGenerate(text: string, day: number, type: string) {
    const lines = text.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((x) => x[0]);
    if (!lines.length) { this.toast.show('Add at least one visitor line'); return; }
    const f = this.f();
    const ids: string[] = [];
    for (const [name, contact = '', company = 'Guest'] of lines) {
      const id = day === 0 ? this.vm.add({ name, company, purpose: f.purpose, host: f.host, site: f.site, areas: f.areas, arrival: f.fromTime, departure: f.untilTime }).id : this.vm.nextBadge();
      ids.push(id);
      this.st.upsert({ ...f, type, visitor: name, contact, company, id, status: 'Active', scans: 0, fromDay: day, untilDay: Math.max(day, f.untilDay - f.fromDay + day), via: contact.includes('@') ? 'Email' : 'SMS', sentAt: '15 Oct 2026, ' + hm(this.vm.now()).padStart(8, '0') });
    }
    this.bulkOpen.set(false);
    this.top.set('All Passes'); this.sub.set('All');
    this.toast.show(`${ids.length} QR passes generated & sent (${ids[ids.length - 1]} – ${ids[0]})`);
  }
  protected check(id: string) { this.checked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected checkAll(on: boolean) { this.checked.set(on ? new Set(this.rows().map((r) => r.id)) : new Set()); }
  protected bulkResend() { const l = this.selected().filter((p) => p.status === 'Active'); this.toast.show(`${l.length} active pass(es) re-sent`); this.checked.set(new Set()); }
  protected bulkRevoke() {
    const l = this.selected().filter((p) => p.status !== 'Revoked');
    l.forEach((p) => this.st.patch(p.id, { status: 'Revoked' }));
    this.toast.show(`${l.length} pass(es) revoked`);
    this.checked.set(new Set());
  }
  protected expireOld() {
    this.menu.set(null);
    const now = this.vm.now();
    const l = this.st.passes().filter((p) => p.status === 'Active' && (p.untilDay < 0 || (p.untilDay === 0 && p.untilTime < now)));
    l.forEach((p) => this.st.patch(p.id, { status: 'Expired' }));
    this.toast.show(l.length ? `${l.length} ended pass(es) marked expired` : 'No active passes past their validity');
  }
  protected sortBy(k: SortKey) { if (this.sortK() === k) this.sortAsc.set(!this.sortAsc()); else { this.sortK.set(k); this.sortAsc.set(true); } }
  protected refresh() {
    this.q.set(''); this.siteF.set(''); this.typeF.set(''); this.validF.set(''); this.statusF.set(''); this.top.set('All Passes'); this.sub.set('All'); this.sortK.set(null);
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast.show('Filters cleared · passes refreshed');
  }
  protected exportCsv(l: QrPass[]) {
    downloadCsv('qr-digital-passes.csv', [
      ['Pass ID', 'Visitor', 'Contact', 'Company', 'Type', 'Host', 'Site', 'Purpose', 'Validity', 'Access Areas', 'Scans', 'Status', 'Sent'],
      ...l.map((p) => [p.id, p.visitor, p.contact, p.company, p.type, p.host, p.site, p.purpose, validityLong(p), p.areas.join(' | '), scansLabel(p), p.status, p.sentAt]),
    ]);
    this.toast.show(`Exported ${l.length} pass(es)`);
  }
}
