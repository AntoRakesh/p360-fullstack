import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { AppState } from '../../shared/app-state';
import { VM_UI } from './vm-ui';
import { AREAS, BADGE_TYPES, HOSTS, ID_TYPES, PURPOSES, SITES, VISITOR_TYPES, VmStore, hm, hostOf } from './vm.data';
import { WalkIn, WalkInStore, WalkStatus } from './vm-walk-in.data';
import { Toaster, VMA_CSS, VmAreas, dayLabel } from './vm-a-kit';

type Form = Omit<WalkIn, 'badge' | 'at' | 'status'> & { photo: boolean };
const DEPTS = [...new Set([...HOSTS.map((h) => h.dept), 'Corporate Affairs', 'Finance', 'Legal'])];
const BLANK: Form = { name: '', company: '', type: 'Business Visitor', email: '', phone: '', idType: 'Aadhaar', idNo: '', purpose: 'Business Meeting', host: 'Priya Sharma', dept: 'Business Development', site: SITES[0], duration: 120, count: 1, areas: ['Main Entrance'], vehicle: '', parking: false, nda: false, safety: true, badgeType: BADGE_TYPES[0], notify: true, photo: false };
const DURS: [number, string][] = [[30, '30 Minutes'], [60, '1 Hour'], [120, '2 Hours'], [180, '3 Hours'], [240, '4 Hours'], [480, 'Full Day']];
const STEPS = ['Visitor Details', 'Visit Details', 'Access & Compliance'];
const SCANS = [
  { name: 'Daniel Brooks', idType: 'Passport', idNo: 'Z4471902', company: 'Vertex Systems', phone: '+91 98201 33417', email: 'daniel.brooks@vertexsystems.com' },
  { name: 'Hana Yusuf', idType: 'Emirates ID', idNo: '784-1990-4471902-1', company: 'Global Ventures', phone: '+971 50 441 2290', email: 'hana.yusuf@globalventures.com' },
  { name: 'Vikram Iyer', idType: 'Aadhaar', idNo: '4410 2291 7735', company: 'Infosys', phone: '+91 99001 22841', email: 'vikram.iyer@infosys.com' },
];

@Component({
  selector: 'app-vm-walk-in',
  imports: [Icon, SelectValue, RouterLink, VM_UI, VmAreas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vm-page">
      <div class="vm-head">
        <div>
          <nav class="bc"><a routerLink="/visitor-management/visitor-dashboard">Visitor Management</a><app-icon name="chevron-right" [size]="14" /><span>Walk-in Registration</span></nav>
          <h1>Walk-in Registration</h1>
          <p class="sub">Register visitors arriving without a pre-booked appointment.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="startScan()"><app-icon name="vm-a-scan-id" [size]="20" />Scan ID</button>
          <button class="btn-ghost hb" (click)="importOpen.set(true)"><app-icon name="m-upload" [size]="18" />Import</button>
          <div class="menu-wrap">
            <button class="btn-ghost hb sq" (click)="headMenu.set(!headMenu())" aria-label="More"><app-icon name="more" [size]="18" /></button>
            @if (headMenu()) {
              <div class="bk" (click)="headMenu.set(false)"></div>
              <div class="dropdown">
                <button class="dd-item" (click)="resumeDraft()" [disabled]="!store.drafts().length"><app-icon name="vm-a-save" [size]="15" />Resume draft ({{ store.drafts().length }})</button>
                <button class="dd-item" (click)="checkoutAll()"><app-icon name="door-open" [size]="15" />Check out all walk-ins</button>
                <button class="dd-item" (click)="headMenu.set(false); kiosk.set(!kiosk())"><app-icon name="w-monitor" [size]="15" />{{ kiosk() ? 'Exit' : 'Open' }} kiosk mode</button>
              </div>
            }
          </div>
        </div>
      </div>

      <div class="stepper">
        @for (s of steps; track s; let i = $index) {
          @if (i) { <i class="ln" [class.done]="step() > i"></i> }
          <button class="st" [class.on]="step() === i + 1" [class.done]="done()[i] && step() > i + 1" (click)="goTo(i + 1)">
            <span class="n">@if (done()[i] && step() > i + 1) {<app-icon name="tasks-check" [size]="15" [stroke]="3" />} @else {{{ i + 1 }}}</span>{{ s }}
          </button>
        }
      </div>

      <div class="top" [class.kiosk]="kiosk()">
        <section class="vm-card form-card">
          <div class="vm-card-head"><h2><app-icon name="user-plus" [size]="26" />Register Walk-in Visitor</h2><span class="spacer"></span>
            @if (store.drafts().length) { <button class="vm-mini" (click)="resumeDraft()"><app-icon name="vm-a-save" [size]="13" />Resume draft</button> }
          </div>
          <div class="cols3">
            <section [class.cur]="step() === 1" (focusin)="goTo(1, true)">
              <div class="sec-h">Visitor Details<span class="spacer"></span>@if (step() === 1) {<button class="nx" (click)="goTo(2)">Next<app-icon name="chevron-right" [size]="14" /></button>}</div>
              <div class="fr"><label>Visitor type <b>*</b></label>
                <div class="vm-input"><app-icon name="users" [size]="16" /><select [value]="f().type" (change)="upd('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Full name <b>*</b></label>
                <div class="vm-input" [class.err]="bad('name')"><app-icon name="user" [size]="16" /><input #nameIn [value]="f().name" (input)="upd('name', $any($event.target).value)" placeholder="Visitor full name" /></div></div>
              <div class="fr"><label>Work email</label>
                <div class="vm-input" [class.err]="bad('email')"><app-icon name="p-mail" [size]="16" /><input type="email" [value]="f().email" (input)="upd('email', $any($event.target).value)" placeholder="Optional" /></div></div>
              <div class="fr"><label>Mobile number <b>*</b></label>
                <div class="vm-input" [class.err]="bad('phone')"><app-icon name="phone" [size]="16" /><input [value]="f().phone" (input)="upd('phone', $any($event.target).value)" placeholder="+91" /></div></div>
              <div class="fr"><label>Company/<wbr />Organization <b>*</b></label>
                <div class="vm-input" [class.err]="bad('company')"><app-icon name="building" [size]="16" /><input [value]="f().company" (input)="upd('company', $any($event.target).value)" placeholder="Company" /></div></div>
              <div class="fr"><label>ID type <b>*</b></label>
                <div class="vm-input"><app-icon name="id-card" [size]="16" /><select [value]="f().idType" (change)="upd('idType', $any($event.target).value)">@for (t of idTypes; track t) {<option [value]="t">{{ t }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>ID number <b>*</b></label>
                <div class="vm-input" [class.err]="bad('idNo')"><app-icon name="id-card" [size]="16" /><input [value]="f().idNo" (input)="upd('idNo', $any($event.target).value)" placeholder="ID number" /></div></div>
              <div class="fr photo-row"><label>Visitor photo <b>*</b></label>
                <div class="photo-wrap">
                  <div class="photo" [class.err]="bad('photo')">
                    @if (capturing()) { <div class="cam"><span>{{ capturing() }}</span></div> }
                    @else if (f().photo) { <vm-avatar [name]="f().name || 'Visitor'" [size]="84" [square]="true" /> }
                    @else { <app-icon name="user" [size]="34" /> }
                  </div>
                  <button class="btn-outline cap" (click)="capture()" [disabled]="!!capturing()"><app-icon name="vm-a-camera" [size]="17" />Capture Photo</button>
                </div>
              </div>
            </section>
            <section [class.cur]="step() === 2" (focusin)="goTo(2, true)">
              <div class="sec-h">Visit Details<span class="spacer"></span>@if (step() === 2) {<button class="nx" (click)="goTo(3)">Next<app-icon name="chevron-right" [size]="14" /></button>}</div>
              <div class="fr"><label>Visit purpose <b>*</b></label>
                <div class="vm-input"><app-icon name="briefcase" [size]="16" /><select [value]="f().purpose" (change)="upd('purpose', $any($event.target).value)">@for (p of purposes; track p) {<option [value]="p">{{ p }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Host/Employee <b>*</b></label>
                <div class="vm-input"><app-icon name="user" [size]="16" /><select [value]="f().host" (change)="pickHost($any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }} ({{ h.emp }})</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Department <b>*</b></label>
                <div class="vm-input"><app-icon name="admin-sitemap" [size]="16" /><select [value]="f().dept" (change)="upd('dept', $any($event.target).value)">@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr"><label>Site/Location <b>*</b></label>
                <div class="vm-input"><app-icon name="map-pin" [size]="16" /><select [value]="f().site" (change)="upd('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr wide"><label>Expected duration <b>*</b></label>
                <div class="vm-input"><app-icon name="clock" [size]="16" /><select [value]="'' + f().duration" (change)="upd('duration', +$any($event.target).value)">@for (d of durs; track d[0]) {<option [value]="'' + d[0]">{{ d[1] }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="fr wide"><label>Number of visitors <b>*</b></label>
                <div class="vm-input"><app-icon name="users" [size]="16" /><input type="number" min="1" max="50" [value]="f().count" (input)="upd('count', +$any($event.target).value || 1)" />
                  <span class="num"><button type="button" (click)="upd('count', f().count + 1)" aria-label="More">▲</button><button type="button" (click)="upd('count', f().count > 1 ? f().count - 1 : 1)" aria-label="Fewer">▼</button></span></div></div>
              @if (host().available === false) { <div class="warn"><app-icon name="triangle-alert" [size]="15" />{{ host().name }} is away today — a delegate will be notified.</div> }
            </section>
            <section [class.cur]="step() === 3" (focusin)="goTo(3, true)">
              <div class="sec-h">Access &amp; Compliance</div>
              <div class="vm-field"><label>Access areas <b>*</b></label>
                <vm-areas [value]="f().areas" (valueChange)="upd('areas', $event)" [options]="areas" [err]="tried() >= 3 && !f().areas.length" class="areas" /></div>
              <div class="vm-field veh"><label>Vehicle number</label>
                <div class="vm-input"><app-icon name="w-car" [size]="16" /><input [value]="f().vehicle" (input)="upd('vehicle', $any($event.target).value.toUpperCase())" placeholder="Optional" /></div></div>
              <div class="tg"><app-icon name="vm-a-parking" [size]="18" /><span>Parking required</span><button type="button" class="vm-switch" [class.on]="f().parking" (click)="upd('parking', !f().parking)" aria-label="Parking required"></button></div>
              <div class="tg"><app-icon name="file-text" [size]="18" /><span>NDA required</span><button type="button" class="vm-switch" [class.on]="f().nda" (click)="upd('nda', !f().nda)" aria-label="NDA required"></button></div>
              <div class="tg"><button type="button" class="ck" [class.on]="f().safety" (click)="upd('safety', !f().safety)" aria-label="Safety briefing">@if (f().safety) {<app-icon name="tasks-check" [size]="13" [stroke]="3" />}</button><span>Safety briefing required</span></div>
              <div class="vm-field bt"><label>Badge type <b>*</b></label>
                <div class="vm-input"><app-icon name="id-card" [size]="16" /><select [value]="f().badgeType" (change)="upd('badgeType', $any($event.target).value)">@for (b of badgeTypes; track b) {<option [value]="b">{{ b }}</option>}</select><app-icon class="chev" name="chevron-down" [size]="15" /></div></div>
              <div class="tg"><app-icon name="p-mail" [size]="18" /><span>Send visit notification</span><button type="button" class="vm-switch" [class.on]="f().notify" (click)="upd('notify', !f().notify)" aria-label="Send visit notification"></button></div>
            </section>
          </div>
        </section>

        <aside class="vm-card sum-card">
          <div class="sum-h"><app-icon name="tasks-clipboard" [size]="26" /><h2>Check-in Summary</h2></div>
          <div class="who">
            @if (f().photo) { <vm-avatar [name]="f().name || 'Visitor'" [size]="88" [square]="true" /> } @else { <span class="nophoto"><app-icon name="user" [size]="36" /></span> }
            <div><b>{{ f().name || 'New visitor' }}</b><span>{{ f().type }}</span><span>{{ f().company || '—' }}</span></div>
          </div>
          <div class="sum">
            <div><app-icon name="user" [size]="18" /><span>Host</span><b>{{ f().host }} ({{ host().emp }})</b></div>
            <div><app-icon name="admin-sitemap" [size]="18" /><span>Site</span><b>{{ f().site }}</b></div>
            <div><app-icon name="briefcase" [size]="18" /><span>Purpose</span><b>{{ f().purpose }}</b></div>
            <div><app-icon name="calendar-days" [size]="18" /><span>Check-in Time</span><b>{{ today() }}, {{ hm(vm.now()) }}</b></div>
            <div><app-icon name="id-card" [size]="18" /><span>Badge Number</span><b>{{ badgePreview() }}</b></div>
          </div>
          @if (tried() && errs().length) { <div class="warn"><app-icon name="triangle-alert" [size]="15" />Step {{ firstBad() }}: complete {{ errs().join(', ') }}</div> }
          <button class="btn-primary vm-btn-big" (click)="register()">Register &amp; Check In</button>
          <div class="btn-row">
            <button class="btn-ghost" (click)="saveDraft()"><app-icon name="vm-a-save" [size]="17" />Save Draft</button>
            <button class="btn-ghost" (click)="clear()"><app-icon name="tasks-x" [size]="17" />Clear Form</button>
          </div>
        </aside>
      </div>

      <section class="vm-card">
        <div class="vm-card-head"><h2><app-icon name="calendar-days" [size]="24" />Recent Walk-ins</h2>
          <span class="cnt-chip">{{ store.list().length }}</span><span class="spacer"></span>
          <vm-tabs class="mini-tabs" [tabs]="filters" [value]="filter()" (change)="filter.set($event)" />
          <button class="vm-link va" (click)="showAll.set(!showAll())">{{ showAll() ? 'Show Less' : 'View All' }}</button>
        </div>
        <div class="tbl-wrap">
          <table class="vm-table">
            <thead><tr>
              @for (c of cols; track c[0]) { <th class="sort" (click)="sortBy(c[0])">{{ c[1] }}@if (sortK() === c[0]) {<app-icon class="si" [name]="sortAsc() ? 'arrow-up' : 'arrow-down'" [size]="12" />}</th> }
              <th class="ta-c">Actions</th>
            </tr></thead>
            <tbody>
              @for (r of shown(); track r.badge) {
                <tr [class.flash]="flash() === r.badge">
                  <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="34" />{{ r.name }}</div></td>
                  <td>{{ r.company }}</td>
                  <td>{{ r.purpose }}</td>
                  <td>{{ r.host }}</td>
                  <td class="dt"><app-icon name="calendar-days" [size]="16" />{{ today() }}, {{ hm(r.at) }}</td>
                  <td class="dt"><app-icon name="id-card" [size]="16" />{{ r.badge }}</td>
                  <td><vm-status [label]="r.status" [tone]="r.status === 'Checked Out' ? 'red' : undefined" /></td>
                  <td>
                    <div class="vm-acts">
                      <button class="ia" (click)="view.set(r)" aria-label="View"><app-icon name="eye" [size]="18" /></button>
                      <button class="ia" (click)="edit(r)" aria-label="Edit"><app-icon name="w-pencil" [size]="17" /></button>
                      <button class="ia" (click)="confirmDel.set(r)" aria-label="Delete"><app-icon name="w-trash" [size]="17" /></button>
                      <div class="menu-wrap">
                        <button class="ia" (click)="rowMenu.set(rowMenu() === r.badge ? '' : r.badge)" aria-label="More"><app-icon name="more" [size]="18" /></button>
                        @if (rowMenu() === r.badge) {
                          <div class="bk" (click)="rowMenu.set('')"></div>
                          <div class="dropdown">
                            @if (r.status === 'Pending Approval') { <button class="dd-item" (click)="setStatus(r, 'Checked In')"><app-icon name="shield-check" [size]="15" />Approve &amp; check in</button> }
                            @if (r.status === 'Checked In') { <button class="dd-item" (click)="setStatus(r, 'Checked Out')"><app-icon name="door-open" [size]="15" />Check out</button> }
                            @if (r.status === 'Checked Out') { <button class="dd-item" (click)="setStatus(r, 'Checked In')"><app-icon name="user-check" [size]="15" />Re-admit (check in)</button> }
                            <button class="dd-item" (click)="printBadge(r)"><app-icon name="s-printer" [size]="15" />Reprint badge</button>
                            <button class="dd-item" (click)="notifyHost(r)"><app-icon name="bell-ring" [size]="15" />Notify host again</button>
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" class="vm-empty">No walk-ins in this view.</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    @if (scanning()) {
      <div class="g-overlay"></div>
      <div class="g-modal sm scan">
        <div class="modal-head"><h3>Scan ID document</h3><button class="close-btn" (click)="scanning.set(0)">×</button></div>
        <div class="idcard"><i class="beam"></i><app-icon name="vm-a-scan-id" [size]="64" [stroke]="1.2" /></div>
        <p>{{ scanning() < 100 ? 'Reading document… place the ID flat on the scanner.' : 'Document verified — details captured.' }}</p>
        <div class="vm-progress"><i [style.width.%]="scanning()"></i></div>
      </div>
    }
    @if (importOpen()) {
      <div class="g-overlay" (click)="importOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Import from expected visitors</h3><button class="close-btn" (click)="importOpen.set(false)">×</button></div>
        <p class="muted">Pick an expected visitor (pre-registration / invitation) to pre-fill the walk-in form.</p>
        <label class="vm-search imp"><app-icon name="search" [size]="16" /><input placeholder="Search expected visitors…" [value]="impQ()" (input)="impQ.set($any($event.target).value)" /></label>
        <div class="imp-list">
          @for (v of expected(); track v.id) {
            <button class="imp-row" (click)="importFrom(v.id)"><vm-avatar [name]="v.name" [size]="32" /><span><b>{{ v.name }}</b><small>{{ v.company }} · host {{ v.host }} · {{ hm(v.arrival) }}</small></span><app-icon name="chevron-right" [size]="16" /></button>
          } @empty { <div class="vm-empty">No expected visitors match.</div> }
        </div>
      </div>
    }
    @if (done2(); as d) {
      <div class="g-overlay" (click)="done2.set(null)"></div>
      <div class="g-modal sm ok">
        <span class="okc"><app-icon name="tasks-check" [size]="30" [stroke]="3" /></span>
        <h3>{{ d.name }} is checked in</h3>
        <p>Badge <b>{{ d.badge }}</b> ({{ d.badgeType }}) sent to the reception printer.@if (d.notify) { {{ d.host }} has been notified.}</p>
        <div class="m-actions c"><button class="btn-ghost" (click)="printBadge(d)">Print again</button><button class="btn-primary" (click)="done2.set(null)">Register next visitor</button></div>
      </div>
    }
    @if (dup(); as d) {
      <div class="g-overlay" (click)="dup.set(null)"></div>
      <div class="g-modal sm">
        <div class="modal-head"><h3>Visitor already on-site</h3><button class="close-btn" (click)="dup.set(null)">×</button></div>
        <p>{{ d.name }} is already checked in with badge <b>{{ d.badge }}</b> since {{ hm(d.at) }}. Register a new visit anyway?</p>
        <div class="m-actions"><button class="btn-ghost" (click)="dup.set(null)">Cancel</button><button class="btn-primary" (click)="dup.set(null); doRegister()">Register new visit</button></div>
      </div>
    }
    @if (view(); as v) {
      <div class="g-overlay" (click)="view.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Walk-in {{ v.badge }}</h3><button class="close-btn" (click)="view.set(null)">×</button></div>
        <div class="dh"><vm-avatar [name]="v.name" [size]="56" /><div><b>{{ v.name }}</b><small>{{ v.type }} · {{ v.company }}</small></div><vm-status [label]="v.status" /></div>
        <div class="kv2">
          <span>Mobile</span><b>{{ v.phone }}</b><span>Email</span><b>{{ v.email || '—' }}</b><span>ID</span><b>{{ v.idType }} · {{ v.idNo }}</b>
          <span>Host</span><b>{{ v.host }} ({{ v.dept }})</b><span>Site</span><b>{{ v.site }}</b><span>Purpose</span><b>{{ v.purpose }}</b>
          <span>Checked in</span><b>{{ today() }}, {{ hm(v.at) }}</b><span>Expected out</span><b>{{ hm(v.at + v.duration) }}</b>
          <span>Access areas</span><b>{{ v.areas.join(', ') }}</b><span>Badge</span><b>{{ v.badge }} · {{ v.badgeType }}</b>
        </div>
        <div class="m-actions">
          @if (v.status === 'Checked In') { <button class="btn-primary" (click)="setStatus(v, 'Checked Out')">Check out</button> }
          @if (v.status === 'Pending Approval') { <button class="btn-primary" (click)="setStatus(v, 'Checked In')">Approve &amp; check in</button> }
          <button class="btn-outline" (click)="printBadge(v)">Reprint badge</button>
        </div>
      </aside>
    }
    @if (confirmDel(); as d) {
      <div class="g-overlay" (click)="confirmDel.set(null)"></div>
      <div class="g-modal sm">
        <div class="modal-head"><h3>Delete walk-in record?</h3><button class="close-btn" (click)="confirmDel.set(null)">×</button></div>
        <p>{{ d.name }} ({{ d.badge }}) will be removed from today's walk-in list.</p>
        <div class="m-actions"><button class="btn-ghost" (click)="confirmDel.set(null)">Keep</button><button class="vm-btn-danger" (click)="remove(d)">Delete</button></div>
      </div>
    }
    @if (toast.msg()) { <div class="g-toast">{{ toast.msg() }}</div> }
  `,
  styles: [VMA_CSS, `
    :host { display: block; }
    .stepper { display: flex; align-items: center; justify-content: center; gap: 22px; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 9px 20px; }
    .st { display: flex; align-items: center; gap: 12px; border: 0; background: none; cursor: pointer; font: inherit; font-size: 15px; font-weight: 500; color: var(--text); padding: 0; }
    .st .n { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #ede9fe; color: #334155; font-weight: 600; font-size: 14px; }
    .st.on .n { background: var(--primary); color: #fff; box-shadow: 0 3px 10px rgba(124, 58, 237, .35); }
    .st.done .n { background: #22c55e; color: #fff; }
    .ln { flex: 0 1 250px; height: 2px; background: #e2e1f0; border-radius: 2px; }
    .ln.done { background: #a78bfa; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) 336px; gap: 14px; align-items: stretch; }
    .form-card { padding: 14px 10px 10px; }
    .form-card .vm-card-head { padding-left: 6px; margin-bottom: 10px; }
    .form-card .vm-card-head h2 { font-size: 20px; }
    .cols3 > section { padding: 0 10px; transition: opacity .2s; }
    .sec-h .spacer { flex: 1; }
    .cols3 > section.cur .sec-h { box-shadow: inset 3px 0 0 var(--primary); }
    .nx { display: inline-flex; align-items: center; gap: 2px; border: 0; background: #fff; color: var(--primary); border-radius: 6px; padding: 2px 6px 2px 9px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .fr { grid-template-columns: 104px minmax(0, 1fr); }
    .fr > label { font-size: 12px; }
    .fr.wide { grid-template-columns: 140px minmax(0, 1fr); margin-bottom: 14px; }
    .photo-row { align-items: center; margin-top: 4px; }
    .photo-wrap { display: flex; align-items: center; gap: 14px; }
    .photo { width: 86px; height: 86px; border-radius: 10px; border: 1px solid var(--border); display: grid; place-items: center; overflow: hidden; color: #94a3b8; background: #f8fafc; flex: none; position: relative; }
    .photo.err { border-color: #f87171; }
    .cam { position: absolute; inset: 0; background: #1e1b3a; display: grid; place-items: center; color: #fff; font-size: 30px; font-weight: 800; }
    .cam::after { content: ''; position: absolute; inset: 10px; border: 2px dashed rgba(255,255,255,.5); border-radius: 50%; }
    .cap { height: 32px; white-space: nowrap; padding: 0 12px; }
    .areas { margin-bottom: 10px; }
    .areas ::ng-deep .box { min-height: 58px; }
    .veh { margin-bottom: 8px; }
    .bt { margin: 4px 0 8px; }
    .sum-card { gap: 10px; }
    .who { display: flex; gap: 16px; align-items: center; padding: 2px 4px; }
    .who b { display: block; font-size: 18px; margin-bottom: 2px; }
    .who span { display: block; font-size: 13.5px; color: #334155; }
    .nophoto { width: 88px; height: 88px; border-radius: 12px; background: #f1f5f9; display: grid; place-items: center; color: #94a3b8; flex: none; }
    .sum > div { padding: 6px 4px; border: 0; }
    .sum > div { grid-template-columns: 22px 104px minmax(0, 1fr); font-size: 13px; }
    .mini-tabs { margin-right: 14px; }
    .mini-tabs ::ng-deep button { padding: 4px 12px; font-size: 12px; }
    .vm-table td { padding: 6px 10px; font-size: 13px; white-space: nowrap; }
    .vm-table .vm-person { font-weight: 700; }
    .scan .idcard { position: relative; height: 150px; border-radius: 12px; background: linear-gradient(135deg, #ede9fe, #f8fafc); display: grid; place-items: center; color: var(--primary); overflow: hidden; margin-bottom: 12px; }
    .beam { position: absolute; left: 0; right: 0; height: 3px; background: #22c55e; box-shadow: 0 0 12px #22c55e; animation: beam 1.2s linear infinite; }
    @keyframes beam { from { top: 0; } to { top: 100%; } }
    .imp { margin: 10px 0; }
    .imp-list { max-height: 360px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
    .imp-row { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 8px 10px; cursor: pointer; text-align: left; font: inherit; }
    .imp-row:hover { border-color: #c4b5fd; background: #faf8ff; }
    .imp-row span { flex: 1; } .imp-row b { display: block; font-size: 13.5px; } .imp-row small { color: var(--muted); }
    .ok { text-align: center; }
    .ok h3 { margin: 10px 0 6px; }
    .okc { width: 58px; height: 58px; border-radius: 50%; background: #dcfce7; color: #15803d; display: inline-grid; place-items: center; }
    .m-actions.c { justify-content: center; }
    .top.kiosk .form-card { outline: 3px solid #c4b5fd; }
    @media (max-width: 1450px) { .top { grid-template-columns: 1fr; } .cols3 { grid-template-columns: 1fr; } .cols3 > section { padding: 0; border: 0 !important; margin-bottom: 10px; } }
  `],
})
export class WalkInRegistration {
  protected readonly store = inject(WalkInStore);
  protected readonly vm = inject(VmStore);
  private readonly app = inject(AppState);
  protected readonly toast = new Toaster();
  protected readonly hm = hm;
  protected readonly steps = STEPS;
  protected readonly types = VISITOR_TYPES;
  protected readonly idTypes = ID_TYPES;
  protected readonly purposes = [...PURPOSES, 'Interview'].filter((p, i, a) => a.indexOf(p) === i);
  protected readonly hosts = HOSTS;
  protected readonly depts = DEPTS;
  protected readonly sites = SITES;
  protected readonly areas = AREAS;
  protected readonly badgeTypes = BADGE_TYPES;
  protected readonly durs = DURS;
  protected readonly filters = ['All', 'Checked In', 'Pending', 'Checked Out'];
  protected readonly cols: [keyof WalkIn, string][] = [['name', 'Visitor'], ['company', 'Company'], ['purpose', 'Purpose'], ['host', 'Host'], ['at', 'Check-in Time'], ['badge', 'Badge'], ['status', 'Status']];

  protected readonly step = signal(1);
  protected readonly tried = signal(0); // highest step validated with errors shown
  protected readonly f = signal<Form>(this.fromRow(this.store.list()[0]));
  protected readonly capturing = signal<number | string>(0);
  protected readonly scanning = signal(0);
  protected readonly importOpen = signal(false);
  protected readonly impQ = signal('');
  protected readonly headMenu = signal(false);
  protected readonly kiosk = signal(false);
  protected readonly rowMenu = signal('');
  protected readonly view = signal<WalkIn | null>(null);
  protected readonly confirmDel = signal<WalkIn | null>(null);
  protected readonly done2 = signal<WalkIn | null>(null);
  protected readonly dup = signal<WalkIn | null>(null);
  protected readonly flash = signal('');
  protected readonly editing = signal('');
  protected readonly filter = signal('All');
  protected readonly showAll = signal(false);
  protected readonly sortK = signal<keyof WalkIn>('at');
  protected readonly sortAsc = signal(false);
  private readonly nameIn = viewChild<ElementRef<HTMLInputElement>>('nameIn');

  protected readonly host = computed(() => hostOf(this.f().host));
  protected readonly today = computed(() => dayLabel(this.app.date()));
  protected readonly badgePreview = computed(() => {
    const same = this.store.list().find((r) => r.name === this.f().name && r.status === 'Checked In');
    if (same && !this.editing()) return same.badge;
    if (this.editing()) return this.editing();
    const max = Math.max(...this.vm.visitors().map((v) => +v.id.slice(4) || 0), ...this.store.list().map((r) => +r.badge.slice(4) || 0));
    return `VIS-${String(max + 1).padStart(6, '0')}`;
  });
  /** per-step list of missing fields */
  private readonly stepErrs = computed(() => {
    const f = this.f();
    const e1: string[] = [];
    if (!f.name.trim()) e1.push('full name');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e1.push('valid email');
    if (!f.phone.trim()) e1.push('mobile');
    if (!f.company.trim()) e1.push('company');
    if (!f.idNo.trim()) e1.push('ID number');
    if (!f.photo) e1.push('photo');
    const e2: string[] = [];
    if (!f.host) e2.push('host');
    if (f.count < 1) e2.push('visitors');
    const e3: string[] = [];
    if (!f.areas.length) e3.push('access areas');
    return [e1, e2, e3];
  });
  protected readonly done = computed(() => this.stepErrs().map((e) => !e.length));
  protected readonly firstBad = computed(() => this.stepErrs().findIndex((e) => e.length) + 1);
  protected readonly errs = computed(() => (this.firstBad() ? this.stepErrs()[this.firstBad() - 1] : []));

  protected readonly rows = computed(() => {
    const fl = this.filter(), k = this.sortK(), asc = this.sortAsc() ? 1 : -1;
    return this.store.list()
      .filter((r) => fl === 'All' || (fl === 'Pending' ? r.status === 'Pending Approval' : r.status === fl))
      .sort((a, b) => (typeof a[k] === 'number' ? (a[k] as number) - (b[k] as number) : String(a[k]).localeCompare(String(b[k]))) * asc);
  });
  protected readonly shown = computed(() => (this.showAll() ? this.rows() : this.rows().slice(0, 5)));
  protected readonly expected = computed(() => {
    const q = this.impQ().toLowerCase();
    return this.vm.visitors().filter((v) => v.status === 'Expected' && (!q || `${v.name} ${v.company} ${v.host}`.toLowerCase().includes(q))).slice(0, 30);
  });

  private fromRow(r: WalkIn): Form {
    const { badge: _b, at: _a, status: _s, ...rest } = r;
    return { ...rest, areas: [...r.areas], photo: true };
  }
  protected bad(k: keyof Form) {
    const f = this.f(), t = this.tried();
    if (t < 1) return false;
    if (k === 'photo') return !f.photo;
    if (k === 'email') return !!f.email && !/^\S+@\S+\.\S+$/.test(f.email);
    return !String(f[k]).trim();
  }
  protected upd<K extends keyof Form>(k: K, v: Form[K]) { this.f.update((f) => ({ ...f, [k]: v })); }
  protected pickHost(n: string) { const h = hostOf(n); this.f.update((f) => ({ ...f, host: n, dept: h.dept, site: h.site })); }

  /** Move to step n; moving forward validates every earlier step. */
  protected goTo(n: number, soft = false) {
    if (n === this.step()) return;
    if (n > this.step()) {
      const bad = this.stepErrs().slice(0, n - 1).findIndex((e) => e.length);
      if (bad >= 0) {
        if (soft) return; // just focusing a later field — don't nag
        this.tried.set(Math.max(this.tried(), bad + 1));
        this.step.set(bad + 1);
        this.toast.show(`Step ${bad + 1} – ${STEPS[bad]}: please complete ${this.stepErrs()[bad].join(', ')}`);
        return;
      }
    }
    this.step.set(n);
  }
  protected capture() {
    let n = 3;
    this.capturing.set(n);
    const t = setInterval(() => {
      n--;
      if (n > 0) this.capturing.set(n);
      else { clearInterval(t); this.capturing.set(0); this.upd('photo', true); this.toast.show('Photo captured from reception camera'); }
    }, 450);
  }
  protected startScan() {
    this.scanning.set(5);
    const t = setInterval(() => {
      const v = this.scanning() + 19;
      if (v < 100) { this.scanning.set(v); return; }
      clearInterval(t);
      this.scanning.set(100);
      const s = SCANS[(this.store.list().length + this.vm.visitors().length) % SCANS.length];
      setTimeout(() => {
        this.scanning.set(0);
        this.editing.set('');
        this.f.update((f) => ({ ...BLANK, ...s, photo: true, host: f.host, dept: f.dept, site: f.site, areas: [...BLANK.areas] }));
        this.step.set(2); this.tried.set(0);
        this.toast.show(`ID scanned — ${s.name} (${s.idType}) details filled. Continue with visit details.`);
      }, 600);
    }, 260);
  }
  protected importFrom(id: string) {
    const v = this.vm.byId(id); if (!v) return;
    const h = hostOf(v.host);
    this.f.set({ ...BLANK, name: v.name, company: v.company, type: v.type, email: v.email, phone: v.phone, idType: v.idType, idNo: v.idNo, purpose: v.purpose, host: v.host, dept: h.dept, site: v.site, areas: [...v.areas], vehicle: v.vehicle, photo: false });
    this.editing.set(''); this.importOpen.set(false); this.step.set(1); this.tried.set(0);
    this.toast.show(`${v.name} imported from expected visitors — capture a photo to continue`);
  }
  protected register() {
    const bad = this.firstBad();
    if (bad) {
      this.tried.set(3); this.step.set(bad);
      this.toast.show(`Step ${bad} – ${STEPS[bad - 1]}: please complete ${this.errs().join(', ')}`);
      return;
    }
    const same = this.store.list().find((r) => r.name.toLowerCase() === this.f().name.trim().toLowerCase() && r.status === 'Checked In');
    if (same && !this.editing()) { this.dup.set(same); return; }
    this.doRegister();
  }
  protected doRegister() {
    const f = this.f();
    const { photo: _p, ...rest } = f;
    let rec: WalkIn;
    if (this.editing()) {
      const old = this.store.list().find((r) => r.badge === this.editing())!;
      rec = { ...old, ...rest };
      this.store.list.update((l) => l.map((r) => (r.badge === rec.badge ? rec : r)));
      this.toast.show(`${rec.name} updated`);
    } else {
      const status: WalkStatus = f.type === 'VIP' || f.type === 'Government Official' ? 'Pending Approval' : 'Checked In';
      const v = this.vm.add({ name: f.name, company: f.company, type: f.type, purpose: f.purpose, host: f.host, site: f.site, areas: f.areas, email: f.email, phone: f.phone, arrival: this.vm.now(), departure: this.vm.now() + f.duration, vehicle: f.vehicle, idType: f.idType, idNo: f.idNo }, status === 'Checked In' ? 'Checked In' : 'Pending Approval');
      rec = { ...rest, badge: v.id, at: this.vm.now(), status };
      this.store.list.update((l) => [rec, ...l]);
      if (f.notify) this.vm.log({ text: `Host ${f.host} notified: ${f.name} arrived (walk-in)`, kind: 'notify', visitor: v.id });
      if (status === 'Checked In') this.done2.set(rec);
      else this.toast.show(`${rec.name} registered — awaiting approval from ${f.host}`);
    }
    this.flash.set(rec.badge); setTimeout(() => this.flash.set(''), 2500);
    this.filter.set('All'); this.sortK.set('at'); this.sortAsc.set(false);
    this.reset();
  }
  private reset() { this.f.set({ ...BLANK, areas: [...BLANK.areas] }); this.step.set(1); this.tried.set(0); this.editing.set(''); }
  protected clear() { this.reset(); this.toast.show('Form cleared'); setTimeout(() => this.nameIn()?.nativeElement.focus(), 50); }
  protected saveDraft() {
    const f = this.f();
    if (!f.name.trim()) { this.tried.set(1); this.step.set(1); this.toast.show('Enter the visitor name to save a draft'); return; }
    const { photo: _p, ...rest } = f;
    this.store.drafts.update((d) => [{ ...rest, badge: 'DRAFT', at: this.vm.now(), status: 'Pending Approval' }, ...d.filter((x) => x.name !== f.name)]);
    this.toast.show(`Draft saved for ${f.name}`);
    this.reset();
  }
  protected resumeDraft() {
    const [d, ...rest] = this.store.drafts(); this.headMenu.set(false);
    if (!d) return;
    this.store.drafts.set(rest);
    this.f.set({ ...this.fromRow(d), photo: false }); this.editing.set(''); this.step.set(1); this.tried.set(0);
    this.toast.show(`Resumed draft for ${d.name}`);
  }
  protected edit(r: WalkIn) {
    this.view.set(null);
    this.f.set(this.fromRow(r)); this.editing.set(r.badge); this.step.set(1); this.tried.set(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.toast.show(`Editing ${r.name} (${r.badge}) — press Register & Check In to save`);
  }
  protected setStatus(r: WalkIn, s: WalkStatus) {
    this.store.list.update((l) => l.map((x) => (x.badge === r.badge ? { ...x, status: s } : x)));
    const v = this.vm.byId(r.badge) ?? this.vm.byName(r.name);
    if (v) { if (s === 'Checked Out') this.vm.checkOut(v.id); else if (v.status !== 'Checked In') this.vm.checkIn(v.id); }
    this.rowMenu.set(''); this.view.set(null);
    this.toast.show(`${r.name} ${s === 'Checked Out' ? 'checked out — badge deactivated' : 'checked in'}`);
  }
  protected checkoutAll() {
    const ins = this.store.list().filter((r) => r.status === 'Checked In');
    ins.forEach((r) => { const v = this.vm.byId(r.badge) ?? this.vm.byName(r.name); if (v && v.status !== 'Checked Out') this.vm.checkOut(v.id); });
    this.store.list.update((l) => l.map((r) => (r.status === 'Checked In' ? { ...r, status: 'Checked Out' } : r)));
    this.headMenu.set(false); this.toast.show(`${ins.length} walk-in visitors checked out`);
  }
  protected printBadge(r: WalkIn) { this.rowMenu.set(''); this.toast.show(`Badge ${r.badge} sent to Reception printer (${r.badgeType})`); }
  protected notifyHost(r: WalkIn) { this.rowMenu.set(''); this.vm.log({ text: `Host ${r.host} re-notified about ${r.name}`, kind: 'notify', visitor: r.badge }); this.toast.show(`${r.host} notified via app & SMS`); }
  protected remove(r: WalkIn) { this.store.list.update((l) => l.filter((x) => x.badge !== r.badge)); this.confirmDel.set(null); this.toast.show(`${r.name} removed`); }
  protected sortBy(k: keyof WalkIn) { if (this.sortK() === k) this.sortAsc.set(!this.sortAsc()); else { this.sortK.set(k); this.sortAsc.set(true); } }
}
