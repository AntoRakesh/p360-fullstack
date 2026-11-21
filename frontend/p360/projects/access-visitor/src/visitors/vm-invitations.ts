import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { TIME_OPTS, Toaster, VmAreas, VmQr } from './vm-a-kit';
import { DEPARTMENTS, DURATIONS, Delivery, InvStatus, Invitation, InvitationStore, VALIDITY, defaultMessage, durLabel, invDay, isAwaiting } from './vm-invitations.data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, PURPOSES, SITES, VmStore, hm } from './vm.data';

interface Guest { name: string; email: string }
interface InvForm {
  visitor: string; email: string; mobile: string; company: string;
  purpose: string; host: string; dept: string; site: string; day: number; time: number; duration: number; count: number;
  areas: string[]; vehicle: string; parking: boolean; nda: boolean; safety: boolean; validity: string; delivery: Delivery; message: string;
}
const SAMPLE: InvForm = {
  visitor: 'Arjun Mehta', email: 'arjun.mehta@techsolutions.com', mobile: '+91 98765 43210', company: 'Tech Solutions',
  purpose: 'Business Meeting', host: 'Priya Sharma', dept: 'Corporate Affairs', site: SITES[0], day: 0, time: 630, duration: 60, count: 1,
  areas: ['Reception', 'Meeting Rooms'], vehicle: 'MH12AB1234', parking: true, nda: false, safety: true, validity: 'Valid for 7 days', delivery: 'Email', message: defaultMessage('Priya Sharma'),
};
const TABS = ['All', 'Sent', 'Opened', 'Confirmed', 'Expired'];
const TONE: Record<string, 'green' | 'orange' | 'red' | 'blue' | 'grey'> = { Draft: 'grey', Sent: 'blue', Opened: 'orange', Confirmed: 'green', Expired: 'red', Cancelled: 'grey' };
const SICON: Record<string, string> = { Draft: 'file-text', Sent: 'vm-c-mail', Opened: 'vm-c-mail', Confirmed: 'vm-c-check-circle', Expired: 'clock', Cancelled: 'vm-c-x-circle' };
type SortKey = 'visitor' | 'company' | 'purpose' | 'host' | 'site' | 'day' | 'status' | 'sentOn';
const CSV_SAMPLE = 'name,email,mobile,company\nRahul Nair,rahul.nair@vertex.com,+91 98860 11223,Vertex Systems\nSara Ahmed,sara.ahmed@pwc.com,+91 99000 44556,PwC\nImran Kapoor,imran.kapoor@bluedart.com,+91 98450 77889,Blue Dart';
const NOW_SENT = 'Wed, 15 Oct 2026, 10:24 AM';

@Component({
  selector: 'app-vm-invitations',
  imports: [...UI, ...VM_UI, VmQr, VmAreas, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page iv">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/home"><app-icon name="home" [size]="14" /></a><app-icon name="chevron-right" [size]="12" /><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="12" /><b>Visit Invitations &amp; Pre-Registration</b></nav>
          <h1>Visit Invitations &amp; Pre-Registration</h1>
          <p>Invite visitors and collect their details before arrival.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="newInv()"><app-icon name="plus" [size]="18" />New Invitation</button>
          <button class="btn-outline hb" (click)="openImport()"><app-icon name="m-upload" [size]="17" />Import Guests</button>
          <button class="btn-outline hb" (click)="exportCsv(rows())"><app-icon name="download" [size]="17" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="remindAll()"><app-icon name="bell" [size]="15" />Remind all awaiting ({{ awaitingCount() }})</button>
                <button class="dd-item" (click)="expirePast()"><app-icon name="clock" [size]="15" />Expire past invitations</button>
                <button class="dd-item" (click)="go('pre-registration')"><app-icon name="user-plus" [size]="15" />Pre-Registration form</button>
                <button class="dd-item" (click)="go('qr-invitations-digital-passes')"><app-icon name="vm-a-pass" [size]="15" />QR Invitations &amp; Passes</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Active Invitations" [value]="st.kpi().active" icon="vm-a-cal-check" color="var(--ka-7c3aed)" [clickable]="true" [active]="tab() === 'All'" (pick)="tab.set('All')" />
        <vm-kpi label="Awaiting Response" [value]="st.kpi().awaiting" icon="vm-a-user-clock" color="var(--ka-ea7a1a)" [clickable]="true" [active]="tab() === 'Sent'" (pick)="tab.set('Sent')" />
        <vm-kpi label="Confirmed Visits" [value]="st.kpi().confirmed" icon="vm-c-check-circle" color="var(--ka-16a34a)" [clickable]="true" [active]="tab() === 'Confirmed'" (pick)="tab.set('Confirmed')" />
        <vm-kpi label="Expired" [value]="st.kpi().expired" icon="clock" color="var(--ka-dc2626)" [clickable]="true" [active]="tab() === 'Expired'" (pick)="tab.set('Expired')" />
      </section>

      <div class="ig">
        <div class="vm-card form" [class.editing]="editId()">
          <div class="vm-card-head ch">
            <h2><app-icon name="calendar-days" [size]="23" />{{ editId() ? 'Edit Invitation · ' + editId() : 'Create Visit Invitation' }}</h2>
            <span class="spacer"></span>
            @if (editId()) {<button class="vm-mini" (click)="newInv()">Cancel edit</button>}
            @else {<button class="vm-mini" (click)="fillSample()">Fill sample</button><button class="vm-mini" (click)="clearForm()">Clear</button>}
          </div>
          <div class="c3">
            <section>
              <h3><app-icon name="user" [size]="19" />Recipient Details</h3>
              <div class="vm-field"><label>Visitor full name <b>*</b></label><div class="vm-input" [class.err]="err().visitor"><input #vn placeholder="Full name" [value]="f().visitor" (input)="set('visitor', $any($event.target).value)" /></div></div>
              <div class="vm-field"><label>Work email <b>*</b></label><div class="vm-input" [class.err]="err().email"><app-icon name="vm-c-mail" [size]="15" /><input placeholder="name@company.com" [value]="f().email" (input)="set('email', $any($event.target).value)" /></div></div>
              <div class="vm-field"><label>Mobile number <b>*</b></label><div class="vm-input" [class.err]="err().mobile"><app-icon name="phone" [size]="15" /><input placeholder="+91 98xxx xxxxx" [value]="f().mobile" (input)="set('mobile', $any($event.target).value)" /></div></div>
              <div class="vm-field"><label>Company/Organization <b>*</b></label><div class="vm-input" [class.err]="err().company"><app-icon name="building" [size]="15" /><input placeholder="Company" [value]="f().company" (input)="set('company', $any($event.target).value)" /></div></div>
              @for (g of guests(); track $index; let i = $index) {
                <div class="guest">
                  <span class="gn">Guest {{ i + 2 }}</span>
                  <div class="vm-input" [class.err]="gErr() && !g.name.trim()"><input placeholder="Name" [value]="g.name" (input)="setGuest(i, 'name', $any($event.target).value)" /></div>
                  <div class="vm-input" [class.err]="gErr() && !validEmail(g.email)"><input placeholder="Email" [value]="g.email" (input)="setGuest(i, 'email', $any($event.target).value)" /></div>
                  <button class="gx" title="Remove guest" (click)="removeGuest(i)"><app-icon name="vm-c-x" [size]="14" /></button>
                </div>
              }
              <button class="addg" (click)="addGuest()"><app-icon name="plus" [size]="15" />Add another guest</button>
            </section>
            <section>
              <h3><app-icon name="calendar-days" [size]="19" />Visit Details</h3>
              <div class="vm-field"><label>Visit purpose <b>*</b></label><div class="vm-input"><select [value]="f().purpose" (change)="set('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="vm-field"><label>Host/Employee <b>*</b></label><div class="vm-input"><select [value]="f().host" (change)="setHost($any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="vm-field"><label>Department</label><div class="vm-input"><select [value]="f().dept" (change)="set('dept', $any($event.target).value)">@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="vm-field"><label>Site/Location <b>*</b></label><div class="vm-input"><select [value]="f().site" (change)="set('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="pair">
                <div class="vm-field"><label>Visit date <b>*</b></label><div class="vm-input"><app-icon name="calendar-days" [size]="15" /><select class="dsel" [value]="'' + f().day" (change)="set('day', +$any($event.target).value)">@for (d of days; track d) {<option [value]="'' + d">{{ invDay(d) }}</option>}</select></div></div>
                <div class="vm-field"><label>Arrival time <b>*</b></label><div class="vm-input"><app-icon name="clock" [size]="15" /><select [value]="'' + f().time" (change)="set('time', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ hm(t) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              </div>
              <div class="pair">
                <div class="vm-field"><label>Expected duration <b>*</b></label><div class="vm-input"><app-icon name="clock" [size]="15" /><select [value]="'' + f().duration" (change)="set('duration', +$any($event.target).value)">@for (d of durations; track d) {<option [value]="'' + d">{{ durLabel(d) }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
                <div class="vm-field"><label>Number of visitors <b>*</b></label><div class="vm-input"><app-icon name="users" [size]="15" /><select [value]="'' + f().count" (change)="set('count', +$any($event.target).value)">@for (c of counts; track c) {<option [value]="'' + c">{{ c }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              </div>
            </section>
            <section>
              <h3><app-icon name="shield-check" [size]="19" />Invitation &amp; Access</h3>
              <div class="vm-field"><label>Access areas <b>*</b></label><vm-areas [value]="f().areas" (valueChange)="set('areas', $event)" [options]="areas" [err]="err().areas" /></div>
              <div class="vm-field"><label>Vehicle number</label><div class="vm-input"><app-icon name="w-car" [size]="16" /><input placeholder="Optional" [value]="f().vehicle" (input)="set('vehicle', $any($event.target).value.toUpperCase())" /></div></div>
              <div class="tgs">
                <span class="tg"><app-icon name="w-car" [size]="14" />Parking required<button class="vm-switch purple" [class.on]="f().parking" (click)="set('parking', !f().parking)"></button></span>
                <span class="tg"><app-icon name="file-text" [size]="14" />NDA required<button class="vm-switch purple" [class.on]="f().nda" (click)="set('nda', !f().nda)"></button></span>
              </div>
              <label class="ckl"><button class="ck" [class.on]="f().safety" (click)="set('safety', !f().safety)">@if (f().safety) {<app-icon name="vm-c-check" [size]="12" [stroke]="3.5" />}</button>Safety briefing required</label>
              <div class="vm-field"><label>Invitation validity <b>*</b></label><div class="vm-input"><app-icon name="clock" [size]="15" /><select [value]="f().validity" (change)="set('validity', $any($event.target).value)">@for (v of validities; track v) {<option [value]="v">{{ v }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
            </section>
          </div>
          <div class="acc" [class.open]="msgOpen()">
            <button class="acch" (click)="msgOpen.set(!msgOpen())"><app-icon name="message" [size]="18" />Personalize message<span class="spacer"></span>@if (f().message !== defMsg) {<span class="edited">Edited</span>}<app-icon class="chev2" name="chevron-down" [size]="18" /></button>
            @if (msgOpen()) {
              <div class="accb">
                <textarea rows="3" maxlength="400" [value]="f().message" (input)="set('message', $any($event.target).value)"></textarea>
                <div class="accf"><small>{{ f().message.length }}/400 · shown in the preview on the right</small><button class="vm-link" (click)="set('message', defMsg)">Reset to default</button></div>
              </div>
            }
          </div>
          <div class="dm">
            <label class="dml">Delivery method <b>*</b></label>
            <button class="vm-radio" [class.on]="f().delivery === 'Email'" (click)="setDelivery('Email')"><i></i><app-icon name="vm-c-mail" [size]="17" />Email invitation</button>
            <button class="vm-radio" [class.on]="f().delivery === 'SMS'" (click)="setDelivery('SMS')"><i></i><app-icon name="tasks-smartphone" [size]="17" />SMS invitation</button>
            <button class="vm-radio" [class.on]="f().delivery === 'Email + SMS'" (click)="setDelivery('Email + SMS')"><i></i><app-icon name="vm-c-mail" [size]="17" /><app-icon name="phone" [size]="16" />Email + SMS</button>
          </div>
          <div class="fa">
            <button class="btn-outline fb" (click)="previewOpen.set(true)"><app-icon name="eye" [size]="17" />Preview Invitation</button>
            <button class="btn-outline fb" (click)="saveDraft()"><app-icon name="file-text" [size]="17" />Save as Draft</button>
            <button class="btn-primary fb send" (click)="send()"><app-icon name="vm-c-send" [size]="17" />{{ editId() ? 'Update & Resend' : 'Send Invitation' + (guests().length ? 's (' + (guests().length + 1) + ')' : '') }}</button>
          </div>
        </div>

        <div class="vm-card pv">
          <div class="vm-card-head ch"><h2><app-icon name="vm-c-mail" [size]="23" />Invitation Preview</h2><span class="spacer"></span>
            @if (f().delivery === 'Email + SMS') {<div class="seg"><button [class.on]="pvMode() === 'Email'" (click)="pvMode.set('Email')">Email</button><button [class.on]="pvMode() === 'SMS'" (click)="pvMode.set('SMS')">SMS</button></div>}
          </div>
          <ng-container [ngTemplateOutlet]="(f().delivery === 'SMS' || (f().delivery === 'Email + SMS' && pvMode() === 'SMS')) ? sms : mail" [ngTemplateOutletContext]="{ $implicit: pv() }" />
        </div>
      </div>

      <div class="vm-card tc">
        <div class="vm-card-head ch"><h2><app-icon name="users" [size]="23" />Recent Invitations</h2><span class="spacer"></span>
          @if (checked().size) {<span class="selc">{{ checked().size }} selected</span><button class="vm-mini" (click)="bulkResend()">Resend</button><button class="vm-mini red" (click)="bulkCancel()">Cancel</button><button class="vm-mini" (click)="exportCsv(selected())">Export</button>}
        </div>
        <div class="tt">
          <vm-tabs [tabs]="tabs" [value]="tab()" (change)="tab.set($event)" />
          <label class="vm-search sm"><app-icon name="search" [size]="15" /><input placeholder="Search visitor, company, host..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        </div>
        <div class="tw">
          <table class="vm-table">
            <thead><tr>
              <th class="cb"><input type="checkbox" [checked]="allChecked()" (change)="checkAll($any($event.target).checked)" /></th>
              @for (c of cols; track c[0]) {<th class="sort" (click)="sortBy(c[0])">{{ c[1] }}<app-icon class="si" [name]="sortK() === c[0] ? (sortAsc() ? 'arrow-up' : 'arrow-down') : 'vm-c-sort'" [size]="13" /></th>}
              <th class="ac">Actions</th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr [class.flash]="flash().includes(r.id)" [class.sel]="editId() === r.id">
                  <td class="cb"><input type="checkbox" [checked]="checked().has(r.id)" (change)="check(r.id)" /></td>
                  <td><button class="vm-link nm" (click)="view.set(r.id)">{{ r.visitor }}</button></td>
                  <td>{{ r.company }}</td>
                  <td>{{ r.purpose }}</td>
                  <td>{{ r.host }}</td>
                  <td>{{ r.site }}</td>
                  <td>{{ r.dateLabel ?? invDay(r.day) }}</td>
                  <td><vm-status [label]="r.status" [tone]="tone[r.status]" [icon]="sicon[r.status]" /></td>
                  <td>{{ r.sentOn || '—' }}</td>
                  <td>
                    <div class="vm-acts">
                      <button class="ia" title="View invitation" (click)="view.set(r.id)"><app-icon name="eye" [size]="17" /></button>
                      <button class="ia" title="Copy invitation link" (click)="copyLink(r)"><app-icon name="reports-copy" [size]="16" /></button>
                      <div class="menu-wrap">
                        <button class="ia" (click)="toggleMenu('row:' + r.id, $event)"><app-icon name="more" [size]="17" /></button>
                        @if (menu() === 'row:' + r.id) {
                          <div class="dropdown right" (click)="$event.stopPropagation()">
                            @if (r.status !== 'Confirmed') {<button class="dd-item" (click)="resend(r)"><app-icon name="vm-c-send" [size]="15" />{{ r.status === 'Draft' ? 'Send now' : 'Resend invitation' }}</button>}
                            @if (r.status === 'Sent' || r.status === 'Opened') {<button class="dd-item" (click)="confirm(r)"><app-icon name="vm-c-check-circle" [size]="15" />Mark as confirmed</button>}
                            <button class="dd-item" (click)="edit(r)"><app-icon name="w-pencil" [size]="15" />Edit invitation</button>
                            <button class="dd-item" (click)="extend(r)"><app-icon name="clock" [size]="15" />Extend validity +7 days</button>
                            <button class="dd-item" (click)="go('qr-invitations-digital-passes')"><app-icon name="vm-a-pass" [size]="15" />Issue QR pass</button>
                            <button class="dd-item" (click)="go('pre-registration')"><app-icon name="user-plus" [size]="15" />Open pre-registration</button>
                            @if (r.status === 'Draft') {<button class="dd-item" (click)="del(r)"><app-icon name="vm-c-trash" [size]="15" />Delete draft</button>}
                            @else if (r.status !== 'Cancelled' && r.status !== 'Expired') {<button class="dd-item danger" (click)="cancel(r)"><app-icon name="vm-c-x-circle" [size]="15" />Cancel invitation</button>}
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="vm-empty">No invitations here. <button class="vm-link" (click)="tab.set('All'); q.set('')">Show all</button></td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="foot">Showing {{ rows().length }} of {{ st.list().length }} invitations</div>
      </div>
    </div>

    <ng-template #mail let-p>
      <div class="em">
        <div class="emh"><span class="lg"><app-icon name="users" [size]="17" [stroke]="2" /></span>People360</div>
        <div class="emb">
          <h4>You’re invited to visit <span>People360</span></h4>
          <p class="dear">Dear <b>{{ p.visitor || 'Guest' }}</b>,</p>
          <p class="msg">{{ p.message }}</p>
          <div class="ekv">
            <app-icon name="user" [size]="14" /><span>Host</span><i>:</i><b>{{ p.host }}</b>
            <app-icon name="map-pin" [size]="14" /><span>Site</span><i>:</i><b>{{ p.site }}</b>
            <app-icon name="calendar-days" [size]="14" /><span>Date &amp; Time</span><i>:</i><b>{{ invDay(p.day) }}, {{ hm(p.time) }}</b>
            <app-icon name="briefcase" [size]="14" /><span>Purpose</span><i>:</i><b>{{ p.purpose }}</b>
          </div>
          <button class="cta" (click)="ctaClick()">Complete Pre-Registration</button>
          <vm-qr [data]="(p.id || 'new') + p.visitor + p.day + p.time" [size]="86" [framed]="true" />
          <div class="note"><app-icon name="vm-a-info" [size]="14" />Please bring a valid photo ID.@if (p.nda) { NDA to be signed on arrival.}@if (p.safety) { Safety briefing required.}</div>
        </div>
      </div>
    </ng-template>
    <ng-template #sms let-p>
      <div class="smsv">
        <div class="smsh"><app-icon name="tasks-smartphone" [size]="16" />SMS to {{ p.mobile || '—' }}</div>
        <div class="bub">People360: Hi {{ (p.visitor || 'Guest').split(' ')[0] }}, {{ p.host }} has invited you to {{ p.site }} on {{ invDay(p.day) }} at {{ hm(p.time) }} ({{ p.purpose }}). Pre-register here: <u>p360.app/i/{{ (p.id || 'INV-NEW').slice(4) }}</u>. Bring a valid photo ID. {{ p.validity }}.</div>
        <small>{{ 160 > smsLen(p) ? '1 SMS' : '2 SMS' }} · {{ smsLen(p) }} characters</small>
        <vm-qr [data]="(p.id || 'new') + p.visitor" [size]="86" [framed]="true" />
      </div>
    </ng-template>

    @if (previewOpen()) {
      <div class="g-overlay" (click)="previewOpen.set(false)"></div>
      <div class="g-modal pm">
        <div class="modal-head"><h3>Invitation preview · {{ f().delivery }}</h3><button class="close-btn" (click)="previewOpen.set(false)">×</button></div>
        <div class="pmg">
          @if (f().delivery !== 'SMS') {<ng-container [ngTemplateOutlet]="mail" [ngTemplateOutletContext]="{ $implicit: pv() }" />}
          @if (f().delivery !== 'Email') {<ng-container [ngTemplateOutlet]="sms" [ngTemplateOutletContext]="{ $implicit: pv() }" />}
        </div>
        <p class="muted">To: {{ f().delivery === 'SMS' ? f().mobile : f().email }}{{ f().delivery === 'Email + SMS' ? ' · ' + f().mobile : '' }}@if (guests().length) { + {{ guests().length }} more guest(s)} · {{ f().validity }}</p>
        <div class="form-actions"><button class="btn-ghost" (click)="previewOpen.set(false)">Back to edit</button><button class="btn-primary" (click)="previewOpen.set(false); send()">{{ editId() ? 'Update & Resend' : 'Send Invitation' }}</button></div>
      </div>
    }
    @if (viewI(); as v) {
      <div class="g-overlay" (click)="view.set(null)"></div>
      <div class="g-modal vmod">
        <div class="modal-head"><h3>{{ v.visitor }} · {{ v.id }}</h3><button class="close-btn" (click)="view.set(null)">×</button></div>
        <div class="vb">
          <ng-container [ngTemplateOutlet]="v.delivery === 'SMS' ? sms : mail" [ngTemplateOutletContext]="{ $implicit: v }" />
          <div>
            <div class="kv2">
              <span>Status</span><b><vm-status [label]="v.status" [tone]="tone[v.status]" [icon]="sicon[v.status]" /></b>
              <span>Email</span><b>{{ v.email }}</b>
              <span>Mobile</span><b>{{ v.mobile }}</b>
              <span>Company</span><b>{{ v.company }}</b>
              <span>Department</span><b>{{ v.dept }}</b>
              <span>Duration</span><b>{{ durLabel(v.duration) }} · {{ v.count }} visitor(s)</b>
              <span>Access</span><b>{{ v.areas.join(', ') }}</b>
              <span>Vehicle</span><b>{{ v.vehicle || '—' }}{{ v.parking ? ' · parking' : '' }}</b>
              <span>Delivery</span><b>{{ v.delivery }} · {{ v.validity }}</b>
            </div>
            <div class="tl">
              <div [class.on]="v.sentOn"><i></i>Sent<small>{{ v.sentOn || 'not yet' }}</small></div>
              <div [class.on]="v.status === 'Opened' || v.status === 'Confirmed'"><i></i>Opened</div>
              <div [class.on]="v.status === 'Confirmed'"><i></i>Pre-registration completed</div>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="view.set(null)">Close</button>
          <button class="btn-outline" (click)="copyLink(v)">Copy link</button>
          <button class="btn-outline" (click)="view.set(null); edit(v)">Edit</button>
          @if (v.status === 'Sent' || v.status === 'Opened') {<button class="btn-outline" (click)="confirm(v)">Mark confirmed</button>}
          @if (v.status !== 'Confirmed') {<button class="btn-primary" (click)="resend(v)">{{ v.status === 'Draft' ? 'Send now' : 'Resend' }}</button>}
        </div>
      </div>
    }
    @if (importOpen()) {
      <div class="g-overlay" (click)="importOpen.set(false)"></div>
      <div class="g-modal imp">
        <div class="modal-head"><h3>Import guests (CSV)</h3><button class="close-btn" (click)="importOpen.set(false)">×</button></div>
        <label class="drop"><app-icon name="m-upload" [size]="26" /><b>Choose a .csv file</b><small>Columns: name, email, mobile, company · or paste below</small><input type="file" accept=".csv,text/csv" hidden (change)="readFile($event)" /></label>
        <textarea class="input ta2" rows="5" [value]="csv()" (input)="csv.set($any($event.target).value)"></textarea>
        <div class="imh"><b>{{ parsed().length }} guest(s) detected</b>@if (parsedBad()) {<span class="bad">{{ parsedBad() }} row(s) skipped – missing name or invalid email</span>}<span class="spacer"></span><button class="vm-link" (click)="downloadTemplate()">Download template</button></div>
        @if (parsed().length) {
          <div class="imt"><table class="vm-table"><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Company</th></tr></thead>
            <tbody>@for (g of parsed(); track $index) {<tr><td>{{ g.name }}</td><td>{{ g.email }}</td><td>{{ g.mobile }}</td><td>{{ g.company }}</td></tr>}</tbody></table></div>
        }
        <div class="form-actions">
          <button class="btn-ghost" (click)="importOpen.set(false)">Cancel</button>
          <button class="btn-outline" [disabled]="!parsed().length" (click)="importToForm()">Add to form as guests</button>
          <button class="btn-primary" [disabled]="!parsed().length" (click)="importSend()">Send {{ parsed().length }} invitation(s)</button>
        </div>
      </div>
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
    .dropdown { left: 0; right: auto; min-width: 220px; z-index: 30; }
    .dropdown.right { left: auto; right: 0; }
    .dd-item.danger { color: var(--kf-dc2626); }
    :host ::ng-deep .vm-kpi { padding: 12px 16px; }
    :host ::ng-deep .vm-kpi-ic { width: 54px; height: 54px; }
    :host ::ng-deep .vm-kpi-val { font-size: 29px; }
    .ig { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 14px; align-items: stretch; }
    .ch { margin-bottom: 10px; gap: 8px; } .ch h2 { font-size: 19px; }
    .form { padding: 12px 18px 14px; } .form.editing { outline: 2px solid var(--kl-c4b5fd); }
    .c3 { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.12fr) minmax(0, 1fr); }
    .c3 > section { padding: 0 14px; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .c3 > section + section { border-left: 1px solid var(--kl-eef0f6); }
    .c3 > section:first-child { padding-left: 0; } .c3 > section:last-child { padding-right: 0; }
    h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; font-size: 14.5px; font-weight: 700; } h3 app-icon { color: var(--primary); }
    .vm-field { gap: 3px; } .vm-field > label { font-size: 12px; font-weight: 500; } .vm-field > label b { color: var(--kf-dc2626); }
    .vm-input { height: 32px; padding: 0 9px; gap: 7px; }
    .vm-input input, .vm-input select { font-size: 12.5px; }
    .vm-input select { appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 20px; text-overflow: ellipsis; }
    .vm-input .chev { margin-left: -24px; pointer-events: none; color: var(--kf-334155); }
    .vm-input > app-icon { color: var(--kf-475569); flex: none; }
    .pair { display: grid; grid-template-columns: 1.3fr 1fr; gap: 6px; }
    .pair .vm-field > label { white-space: nowrap; font-size: 11.5px; }
    .pair .vm-input { padding: 0 6px; gap: 5px; }
    .pair select.dsel { padding-right: 0; }
    .pair:first-of-type { grid-template-columns: 1.25fr 1fr; }
    :host ::ng-deep vm-areas .box { min-height: 32px; padding: 3px 8px; }
    .guest { display: grid; grid-template-columns: 1fr 1.2fr 20px; gap: 5px; align-items: center; position: relative; padding-top: 12px; }
    .gn { position: absolute; top: -1px; left: 0; font-size: 11px; color: var(--muted); }
    .gx { border: 0; background: none; cursor: pointer; color: var(--kf-94a3b8); padding: 0; display: grid; place-items: center; } .gx:hover { color: var(--kf-dc2626); }
    .addg { align-self: flex-start; margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--primary); color: var(--primary); background: var(--kb-ffffff); border-radius: 8px; padding: 0 14px; height: 32px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .addg:hover { background: var(--kb-f5f0ff); }
    .tgs { display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 2px; }
    .tgs .tg .vm-switch { margin-left: auto; }
    .tg { display: flex; align-items: center; gap: 8px; font-size: 12.5px; white-space: nowrap; min-width: 0; }
    .tg app-icon { flex: none; } .tg app-icon { color: var(--kf-475569); }
    .tg .vm-switch { width: 34px; height: 19px; } .tg .vm-switch::after { width: 13px; height: 13px; } .tg .vm-switch.on::after { left: 18px; }
    .ckl { display: flex; align-items: center; gap: 9px; font-size: 12.5px; margin: 4px 0; }
    .ck { width: 17px; height: 17px; border-radius: 4px; border: 1.5px solid var(--kl-94a3b8); background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--kf-ffffff); }
    .ck.on { background: var(--primary); border-color: var(--primary); }
    .acc { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-faf9ff); }
    .acch { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 8px 12px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: var(--text); }
    .acch app-icon { color: var(--kf-475569); } .acch .spacer { flex: 1; }
    .acc.open .chev2 { transform: rotate(180deg); }
    .edited { font-size: 11px; color: var(--primary); background: var(--kb-ede9fe); border-radius: 5px; padding: 1px 6px; }
    .accb { padding: 0 12px 10px; }
    .accb textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; resize: vertical; background: var(--kb-ffffff); }
    .accf { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); } .accf .vm-link { font-size: 12px; }
    .dm { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
    .dml { font-size: 12.5px; font-weight: 600; width: 112px; flex: none; } .dml b { color: var(--kf-dc2626); }
    .vm-radio { flex: 1; height: 36px; gap: 10px; font: inherit; font-size: 13px; font-weight: 500; color: var(--text); }
    .vm-radio app-icon { color: var(--kf-334155); } .vm-radio app-icon + app-icon { margin-left: -6px; }
    .fa { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
    .fb { height: 36px; display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; font-size: 13.5px; }
    .fb.send { min-width: 168px; justify-content: center; }
    .pv { padding: 12px 16px; display: flex; flex-direction: column; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: var(--kb-ffffff); padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; } .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
    .em { border: 1px solid var(--kl-ece8fb); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(76, 29, 149, .08); }
    .emh { display: flex; align-items: center; gap: 8px; color: var(--kf-ffffff); font-weight: 800; font-size: 19px; padding: 10px 16px; background: linear-gradient(100deg, var(--kb-6d28d9), var(--kb-7c3aed) 60%, var(--kb-a78bfa)); }
    .lg { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--kl-ffffff); display: grid; place-items: center; }
    .emb { padding: 12px 18px 14px; display: flex; flex-direction: column; gap: 8px; }
    .emb h4 { margin: 0; font-size: 18px; font-weight: 800; } .emb h4 span { color: var(--primary); }
    .dear { margin: 0; font-size: 13px; } .msg { margin: -4px 0 0; font-size: 12.5px; line-height: 1.4; color: var(--kf-334155); white-space: pre-line; }
    .ekv { display: grid; grid-template-columns: 16px 82px 8px minmax(0, 1fr); gap: 5px 6px; align-items: center; font-size: 12px; background: var(--kb-f6f4ff); border-radius: 8px; padding: 8px 12px; }
    .ekv app-icon { color: var(--kf-334155); } .ekv i { font-style: normal; } .ekv b { font-weight: 500; }
    .cta { align-self: center; width: 78%; height: 32px; border: 0; border-radius: 7px; background: var(--primary); color: var(--kf-ffffff); font: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer; }
    .cta:hover { filter: brightness(1.08); }
    .emb vm-qr { align-self: center; }
    .note { display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--kb-f6f4ff); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--kf-334155); text-align: center; flex-wrap: wrap; }
    .smsv { display: flex; flex-direction: column; gap: 10px; align-items: center; background: var(--kb-f6f4ff); border-radius: 12px; padding: 16px; }
    .smsh { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); align-self: stretch; }
    .bub { background: var(--kb-ffffff); border-radius: 14px 14px 14px 4px; padding: 10px 12px; font-size: 13px; line-height: 1.45; box-shadow: 0 2px 8px rgba(0,0,0,.06); align-self: stretch; }
    .bub u { color: var(--primary); }
    .smsv small { color: var(--muted); font-size: 11.5px; align-self: flex-end; }
    .tc { padding: 12px 16px 8px; display: flex; flex-direction: column; gap: 10px; } .tc .ch { margin-bottom: 0; }
    .tt { display: flex; align-items: center; gap: 10px; } .tt .sm { max-width: 260px; height: 32px; margin-left: auto; }
    .selc { font-size: 12.5px; color: var(--muted); }
    .tw { max-height: 400px; overflow-y: auto; }
    .vm-table th { background: var(--kb-f3f0ff); position: sticky; top: 0; z-index: 1; padding: 8px 8px; }
    .vm-table td { padding: 7px 7px; font-size: 12.5px; white-space: nowrap; }
    .vm-table th { padding: 8px 7px; }
    .vm-table th .si { color: var(--kf-94a3b8); vertical-align: -2px; margin-left: 4px; }
    .vm-table vm-status { font-size: 12px; padding: 2px 9px; min-width: 88px; }
    .cb { width: 26px; } .cb input { width: 15px; height: 15px; accent-color: var(--primary); cursor: pointer; }
    .ac { text-align: center; }
    .nm { font-size: 13px; }
    .vm-acts { gap: 4px; justify-content: center; } .vm-acts .ia { padding: 3px; }
    tr.flash td { animation: fl 2.4s ease; } @keyframes fl { 0%, 40% { background: var(--kb-ede9fe); } }
    .foot { font-size: 12px; color: var(--muted); padding: 0 4px 4px; }
    .muted { color: var(--muted); font-size: 13px; }
    .pm { width: min(860px, calc(100vw - 32px)); }
    .pmg { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-items: start; }
    .vmod { width: min(860px, calc(100vw - 32px)); }
    .vb { display: grid; grid-template-columns: 380px 1fr; gap: 20px; align-items: start; }
    .kv2 { display: grid; grid-template-columns: 96px 1fr; gap: 7px 12px; font-size: 13px; } .kv2 > span { color: var(--muted); } .kv2 > b { font-weight: 600; }
    .tl { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
    .tl div { display: flex; align-items: center; gap: 10px; color: var(--muted); } .tl div.on { color: var(--text); font-weight: 600; }
    .tl i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--kl-cbd5e1); } .tl .on i { background: var(--kb-22c55e); border-color: var(--kl-22c55e); }
    .tl small { font-weight: 400; color: var(--muted); }
    .imp { width: min(680px, calc(100vw - 32px)); }
    .drop { border: 2px dashed var(--kl-c4b5fd); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--primary); margin-bottom: 10px; background: var(--kb-faf8ff); cursor: pointer; }
    .drop small { color: var(--muted); }
    .ta2 { height: auto; width: 100%; box-sizing: border-box; padding: 8px 10px; font: 12.5px/1.45 ui-monospace, monospace; resize: vertical; }
    .imh { display: flex; align-items: center; gap: 10px; font-size: 13px; margin: 8px 0; } .imh .spacer { flex: 1; } .bad { color: var(--kf-dc2626); font-size: 12px; }
    .imt { max-height: 180px; overflow: auto; }
    @media (max-width: 1250px) { .ig { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class VisitInvitations {
  protected readonly st = inject(InvitationStore);
  private readonly vm = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly toast = new Toaster();
  protected readonly hm = hm;
  protected readonly invDay = invDay;
  protected readonly durLabel = durLabel;
  protected readonly tone = TONE;
  protected readonly sicon = SICON;
  protected readonly tabs = TABS;
  protected readonly purposes = PURPOSES;
  protected readonly hosts = HOSTS;
  protected readonly depts = DEPARTMENTS;
  protected readonly sites = SITES;
  protected readonly areas = AREAS;
  protected readonly durations = DURATIONS;
  protected readonly validities = VALIDITY;
  protected readonly days = Array.from({ length: 21 }, (_, i) => i);
  protected readonly times = TIME_OPTS;
  protected readonly counts = Array.from({ length: 12 }, (_, i) => i + 1);
  protected readonly defMsg = defaultMessage('');
  protected readonly cols: [SortKey, string][] = [['visitor', 'Visitor'], ['company', 'Company'], ['purpose', 'Purpose'], ['host', 'Host'], ['site', 'Site'], ['day', 'Visit Date'], ['status', 'Invitation Status'], ['sentOn', 'Sent On']];

  protected readonly f = signal<InvForm>({ ...SAMPLE });
  protected readonly guests = signal<Guest[]>([]);
  protected readonly gErr = signal(false);
  protected readonly editId = signal<string | null>(null);
  protected readonly err = signal({ visitor: false, email: false, mobile: false, company: false, areas: false });
  protected readonly msgOpen = signal(false);
  protected readonly pvMode = signal<'Email' | 'SMS'>('Email');
  protected readonly tab = signal('All');
  protected readonly q = signal('');
  protected readonly sortK = signal<SortKey | null>(null);
  protected readonly sortAsc = signal(true);
  protected readonly menu = signal<string | null>(null);
  protected readonly view = signal<string | null>(null);
  protected readonly previewOpen = signal(false);
  protected readonly importOpen = signal(false);
  protected readonly csv = signal(CSV_SAMPLE);
  protected readonly flash = signal<string[]>([]);
  protected readonly checked = signal(new Set<string>());

  protected readonly pv = computed(() => ({ ...this.f(), id: this.editId() ?? '' }));
  protected readonly viewI = computed(() => (this.view() ? this.st.byId(this.view()!) : null));
  protected readonly awaitingCount = computed(() => this.st.list().filter(isAwaiting).length);
  protected readonly rows = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase();
    let l = this.st.list();
    if (t !== 'All') l = l.filter((i) => i.status === t);
    if (q) l = l.filter((i) => `${i.visitor} ${i.company} ${i.host} ${i.id} ${i.email}`.toLowerCase().includes(q));
    const k = this.sortK();
    if (k) {
      const val = (i: Invitation): string | number => (k === 'day' ? i.day * 1440 + i.time : k === 'sentOn' ? sentKey(i.sentOn) : i[k]);
      l = [...l].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (this.sortAsc() ? 1 : -1); });
    }
    return l;
  });
  protected readonly selected = computed(() => this.st.list().filter((i) => this.checked().has(i.id)));
  protected readonly allChecked = computed(() => this.rows().length > 0 && this.rows().every((r) => this.checked().has(r.id)));
  private readonly parsedAll = computed(() => {
    const lines = this.csv().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0]?.toLowerCase().startsWith('name')) lines.shift();
    return lines.map((l) => { const [name = '', email = '', mobile = '', company = ''] = l.split(',').map((x) => x.trim()); return { name, email, mobile, company }; });
  });
  protected readonly parsed = computed(() => this.parsedAll().filter((g) => g.name && this.validEmail(g.email)));
  protected readonly parsedBad = computed(() => this.parsedAll().length - this.parsed().length);

  protected validEmail(e: string) { return /^\S+@\S+\.\S+$/.test(e.trim()); }
  protected smsLen(p: InvForm & { id: string }) { return 150 + p.host.length + p.site.length + p.purpose.length + (p.visitor.split(' ')[0]?.length ?? 5); }
  protected set<K extends keyof InvForm>(k: K, v: InvForm[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
    if (k in this.err()) this.err.update((e) => ({ ...e, [k]: false }));
  }
  protected setHost(h: string) {
    const dept = { 'Business Development': 'Business Development', 'Human Resources': 'Human Resources', Logistics: 'Logistics', 'Plant Operations': 'Plant Operations', Facilities: 'Facilities', IT: 'IT', Compliance: 'Compliance', 'Executive Office': 'Corporate Affairs' } as Record<string, string>;
    const host = HOSTS.find((x) => x.name === h);
    this.f.update((f) => ({ ...f, host: h, dept: host ? dept[host.dept] ?? f.dept : f.dept, site: host?.site ?? f.site }));
  }
  protected setDelivery(d: Delivery) { this.set('delivery', d); this.pvMode.set(d === 'SMS' ? 'SMS' : 'Email'); this.err.update((e) => ({ ...e, email: false, mobile: false })); }
  protected addGuest() {
    this.guests.update((l) => [...l, { name: '', email: '' }]);
    this.f.update((f) => ({ ...f, count: Math.max(f.count, this.guests().length + 1) }));
    setTimeout(() => ([...document.querySelectorAll('.iv .guest input')].at(-2) as HTMLInputElement | undefined)?.focus(), 30);
  }
  protected setGuest(i: number, k: keyof Guest, v: string) { this.guests.update((l) => l.map((g, j) => (j === i ? { ...g, [k]: v } : g))); }
  protected removeGuest(i: number) {
    this.guests.update((l) => l.filter((_, j) => j !== i));
    this.f.update((f) => ({ ...f, count: Math.max(1, Math.min(f.count, this.guests().length + 1)) }));
  }
  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.view.set(null); this.previewOpen.set(false); this.importOpen.set(false); }
  protected go(p: string) { this.menu.set(null); this.view.set(null); this.router.navigate(['/visitor-management', p]); }
  protected ctaClick() { this.toast.show('The visitor lands on the pre-registration form – opening it…'); setTimeout(() => this.go('pre-registration'), 900); }
  private scrollForm() { setTimeout(() => document.querySelector('.iv .form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }
  protected newInv() { this.editId.set(null); this.clearForm(); this.scrollForm(); setTimeout(() => (document.querySelector('.iv .form input') as HTMLInputElement | null)?.focus(), 350); }
  protected clearForm() { this.f.set({ ...SAMPLE, visitor: '', email: '', mobile: '', company: '', vehicle: '', parking: false, message: this.defMsg }); this.guests.set([]); this.resetErr(); }
  protected fillSample() { this.f.set({ ...SAMPLE }); this.guests.set([]); this.resetErr(); }
  private resetErr() { this.err.set({ visitor: false, email: false, mobile: false, company: false, areas: false }); this.gErr.set(false); }
  private validate(): boolean {
    const f = this.f(), d = f.delivery;
    const e = {
      visitor: f.visitor.trim().length < 2,
      email: d !== 'SMS' && !this.validEmail(f.email),
      mobile: d !== 'Email' ? f.mobile.replace(/\D/g, '').length < 8 : !!f.mobile.trim() && f.mobile.replace(/\D/g, '').length < 8,
      company: !f.company.trim(),
      areas: !f.areas.length,
    };
    const gBad = this.guests().some((g) => !g.name.trim() || !this.validEmail(g.email));
    this.err.set(e); this.gErr.set(gBad);
    const bad = Object.values(e).filter(Boolean).length + (gBad ? 1 : 0);
    if (bad) this.toast.show(`Please fix ${bad} highlighted field${bad > 1 ? 's' : ''}`);
    return !bad;
  }
  private build(id: string, who: { visitor: string; email: string; mobile: string; company: string }, status: InvStatus): Invitation {
    const f = this.f();
    return { ...f, ...who, id, status, sentOn: status === 'Draft' ? '' : NOW_SENT, count: f.count };
  }
  protected send() {
    if (!this.validate()) return;
    const f = this.f(), ed = this.editId();
    if (ed) {
      const cur = this.st.byId(ed);
      this.st.upsert(this.build(ed, { visitor: f.visitor.trim(), email: f.email.trim(), mobile: f.mobile.trim(), company: f.company.trim() }, cur?.status === 'Confirmed' ? 'Confirmed' : 'Sent'));
      this.toast.show(`Invitation ${ed} updated & re-sent to ${f.visitor}`);
      this.editId.set(null);
      this.done([ed]);
      return;
    }
    const people = [{ visitor: f.visitor.trim(), email: f.email.trim(), mobile: f.mobile.trim(), company: f.company.trim() }, ...this.guests().map((g) => ({ visitor: g.name.trim(), email: g.email.trim(), mobile: '', company: f.company.trim() }))];
    const ids = people.map((p) => {
      const id = this.st.nextId();
      this.st.upsert(this.build(id, p, 'Sent'));
      if (f.day === 0) this.vm.add({ name: p.visitor, company: p.company, purpose: f.purpose, host: f.host, site: f.site, areas: f.areas, arrival: f.time, departure: f.time + f.duration, email: p.email || undefined, phone: p.mobile || undefined, vehicle: f.vehicle });
      return id;
    });
    this.vm.log({ text: `${ids.length} visit invitation(s) sent by ${f.host} (${f.purpose})`, kind: 'notify' });
    this.toast.show(ids.length > 1 ? `${ids.length} invitations sent via ${f.delivery}` : `Invitation sent to ${f.visitor} via ${f.delivery}`);
    this.done(ids);
  }
  protected saveDraft() {
    const f = this.f();
    if (!f.visitor.trim()) { this.err.update((e) => ({ ...e, visitor: true })); this.toast.show('Add at least the visitor name to save a draft'); return; }
    const ed = this.editId();
    const id = ed ?? this.st.nextId();
    const cur = ed ? this.st.byId(ed) : null;
    const inv = this.build(id, { visitor: f.visitor.trim(), email: f.email.trim(), mobile: f.mobile.trim(), company: f.company.trim() }, cur?.status ?? 'Draft');
    this.st.upsert(cur ? { ...inv, sentOn: cur.sentOn } : inv);
    this.toast.show(ed ? `Changes to ${id} saved` : `Draft ${id} saved`);
    this.editId.set(null);
    this.done([id]);
  }
  private done(ids: string[]) {
    this.tab.set('All'); this.q.set('');
    this.flash.set(ids); setTimeout(() => this.flash.set([]), 2500);
    setTimeout(() => document.querySelector('.iv tr.flash')?.scrollIntoView({ block: 'nearest' }), 60);
    this.clearForm();
  }
  protected edit(i: Invitation) {
    this.menu.set(null);
    const { visitor, email, mobile, company, purpose, host, dept, site, day, time, duration, count, areas, vehicle, parking, nda, safety, validity, delivery, message } = i;
    this.f.set({ visitor, email, mobile, company, purpose, host, dept, site, day: Math.max(0, day), time, duration, count, areas: [...areas], vehicle, parking, nda, safety, validity, delivery, message });
    this.guests.set([]); this.resetErr();
    this.pvMode.set(delivery === 'SMS' ? 'SMS' : 'Email');
    this.msgOpen.set(message !== this.defMsg);
    this.editId.set(i.id);
    this.scrollForm();
  }
  protected resend(i: Invitation) {
    this.menu.set(null);
    if (i.status === 'Draft' && !this.validEmail(i.email) && i.delivery !== 'SMS') { this.view.set(null); this.edit(i); this.toast.show('Add a valid email before sending'); return; }
    const reopen = i.status === 'Expired' || i.status === 'Cancelled' || i.status === 'Draft';
    this.st.patch(i.id, { sentOn: NOW_SENT, ...(reopen ? { status: 'Sent' as InvStatus, dateLabel: undefined, day: Math.max(i.day, 0) } : {}) });
    this.toast.show(`${i.status === 'Draft' ? 'Invitation sent' : 'Invitation re-sent'} to ${i.visitor} via ${i.delivery}`);
  }
  protected confirm(i: Invitation) {
    this.menu.set(null);
    this.st.patch(i.id, { status: 'Confirmed' });
    if (i.day === 0 && !this.vm.byName(i.visitor)) this.vm.add({ name: i.visitor, company: i.company, purpose: i.purpose, host: i.host, site: i.site, areas: i.areas, arrival: i.time });
    this.vm.log({ text: `${i.visitor} completed pre-registration (${i.id})`, kind: 'system' });
    this.toast.show(`${i.visitor} marked as confirmed · ${i.host} notified`);
  }
  protected extend(i: Invitation) {
    this.menu.set(null);
    const idx = Math.min(VALIDITY.length - 1, VALIDITY.indexOf(i.validity) + 1);
    const back = i.status === 'Expired';
    this.st.patch(i.id, { validity: VALIDITY[Math.max(idx, 2)], ...(back ? { status: 'Sent' as InvStatus, dateLabel: undefined, day: Math.max(0, i.day) } : {}) });
    this.toast.show(`${i.id} validity extended by 7 days${back ? ' · invitation re-activated' : ''}`);
  }
  protected cancel(i: Invitation) { this.menu.set(null); this.st.patch(i.id, { status: 'Cancelled' }); this.toast.show(`Invitation for ${i.visitor} cancelled · link disabled`); }
  protected del(i: Invitation) { this.menu.set(null); this.st.remove(i.id); this.toast.show(`Draft ${i.id} deleted`); }
  protected copyLink(i: Invitation) {
    navigator.clipboard?.writeText(`https://p360.app/i/${i.id.slice(4)}`).catch(() => {});
    this.toast.show(`Invitation link copied · p360.app/i/${i.id.slice(4)}`);
  }
  protected remindAll() {
    this.menu.set(null);
    const l = this.st.list().filter(isAwaiting);
    l.forEach((i) => this.st.patch(i.id, { sentOn: NOW_SENT }));
    this.toast.show(`Reminders sent to ${l.length} visitor(s) awaiting response`);
  }
  protected expirePast() {
    this.menu.set(null);
    const l = this.st.list().filter((i) => i.day < 0 && i.status !== 'Expired' && i.status !== 'Confirmed');
    l.forEach((i) => this.st.patch(i.id, { status: 'Expired' }));
    this.toast.show(l.length ? `${l.length} past invitation(s) expired` : 'No past invitations left to expire');
  }
  protected check(id: string) { this.checked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected checkAll(on: boolean) { this.checked.set(on ? new Set(this.rows().map((r) => r.id)) : new Set()); }
  protected bulkResend() { const l = this.selected().filter((i) => i.status !== 'Confirmed'); l.forEach((i) => this.resend(i)); this.toast.show(`${l.length} invitation(s) re-sent`); this.checked.set(new Set()); }
  protected bulkCancel() { const l = this.selected().filter((i) => isAwaiting(i)); l.forEach((i) => this.st.patch(i.id, { status: 'Cancelled' })); this.toast.show(`${l.length} invitation(s) cancelled`); this.checked.set(new Set()); }
  protected sortBy(k: SortKey) { if (this.sortK() === k) this.sortAsc.set(!this.sortAsc()); else { this.sortK.set(k); this.sortAsc.set(true); } }
  protected openImport() { this.csv.set(CSV_SAMPLE); this.importOpen.set(true); }
  protected readFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { this.csv.set(String(r.result ?? '')); this.toast.show(`${file.name} loaded`); };
    r.readAsText(file);
  }
  protected downloadTemplate() { downloadCsv('guest-import-template.csv', [['name', 'email', 'mobile', 'company'], ['Jane Doe', 'jane.doe@company.com', '+91 98000 00000', 'Company Ltd']]); }
  protected importToForm() {
    const l = this.parsed();
    this.guests.update((g) => [...g, ...l.map((x) => ({ name: x.name, email: x.email }))]);
    this.f.update((f) => ({ ...f, count: Math.max(f.count, this.guests().length + 1) }));
    this.importOpen.set(false);
    this.scrollForm();
    this.toast.show(`${l.length} guest(s) added to the invitation`);
  }
  protected importSend() {
    const f = this.f();
    const ids = this.parsed().map((g) => {
      const id = this.st.nextId();
      this.st.upsert(this.build(id, { visitor: g.name, email: g.email, mobile: g.mobile, company: g.company || 'Guest' }, 'Sent'));
      return id;
    });
    this.importOpen.set(false);
    this.tab.set('All');
    this.flash.set(ids); setTimeout(() => this.flash.set([]), 2500);
    this.toast.show(`${ids.length} invitations sent for ${invDay(f.day)} (${f.purpose}, host ${f.host})`);
  }
  protected exportCsv(l: Invitation[]) {
    downloadCsv('visit-invitations.csv', [
      ['ID', 'Visitor', 'Email', 'Mobile', 'Company', 'Purpose', 'Host', 'Department', 'Site', 'Visit Date', 'Arrival', 'Duration', 'Visitors', 'Access Areas', 'Delivery', 'Validity', 'Status', 'Sent On'],
      ...l.map((i) => [i.id, i.visitor, i.email, i.mobile, i.company, i.purpose, i.host, i.dept, i.site, i.dateLabel ?? invDay(i.day), hm(i.time), durLabel(i.duration), i.count, i.areas.join(' | '), i.delivery, i.validity, i.status, i.sentOn]),
    ]);
    this.toast.show(`Exported ${l.length} invitation(s)`);
  }
}
/** "Wed, 08 Oct 2026, 02:14 PM" → sortable number. */
function sentKey(s: string): number {
  const m = /(\d{2}) Oct 2026, (\d{2}):(\d{2}) (AM|PM)/.exec(s);
  if (!m) return 0;
  return +m[1] * 1440 + ((+m[2] % 12) + (m[4] === 'PM' ? 12 : 0)) * 60 + +m[3];
}
