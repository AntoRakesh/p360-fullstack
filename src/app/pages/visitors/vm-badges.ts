import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { downloadCsv } from '../dashboards/demo-data';
import { Toaster, VmQr } from './vm-a-kit';
import { ActRow, AStatus, ago, BADGE_TYPE_LIST, BadgeStore, BadgeTpl, PRINTERS, QStatus, QueueRow, t12, tplFor } from './vm-badges.data';
import { VM_UI } from './vm-ui';
import { AREAS, HOSTS, SITES, VmStore } from './vm.data';

const TABS = ['All Badges', 'Awaiting Print', 'Printed', 'Issued', 'Returned', 'Lost'] as const;
type Tab = (typeof TABS)[number];
const Q_ICON: Record<string, string> = { 'Awaiting Print': 'vm-c-hourglass', Printing: 'reports-printer', Printed: 'vm-c-check-circle', Issued: 'vm-c-check-circle', Returned: 'vm-c-undo', Lost: 'triangle-alert', Active: 'vm-c-check-circle', Expired: 'triangle-alert' };
const Q_TONE: Record<string, 'green' | 'orange' | 'red' | 'blue'> = { 'Awaiting Print': 'orange', Printing: 'blue', Printed: 'green', Issued: 'green', Returned: 'blue', Lost: 'red', Active: 'green', Expired: 'orange' };
const TAB_Q: Record<Tab, QStatus[] | null> = { 'All Badges': null, 'Awaiting Print': ['Awaiting Print', 'Printing'], Printed: ['Printed'], Issued: ['Issued'], Returned: ['Returned'], Lost: ['Lost'] };
const TAB_A: Record<Tab, AStatus[] | null> = { 'All Badges': null, 'Awaiting Print': [], Printed: [], Issued: ['Active'], Returned: ['Returned'], Lost: ['Lost'] };
const COLORS = ['var(--ka-6d28d9)', 'var(--ka-ea580c)', 'var(--ka-16a34a)', 'var(--ka-2563eb)', 'var(--ka-dc2626)', 'var(--ka-0f766e)', 'var(--ka-334155)'];
const NOW_STAMP = '15 Oct 2026, 10:24 AM';
type QKey = 'name' | 'company' | 'type' | 'host' | 'site' | 'at' | 'status';
type AKey = 'name' | 'badgeNo' | 'type' | 'by' | 'issued' | 'returned' | 'status';

@Component({
  selector: 'app-vm-badges',
  imports: [Icon, ...VM_UI, VmQr, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page bd">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/home"><app-icon name="home" [size]="14" /></a><app-icon name="chevron-right" [size]="13" /><a routerLink="/visitor-management/visitor-dashboard">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Visitor Badges &amp; Printing</b></nav>
          <h1>Visitor Badges &amp; Printing</h1>
          <p>Design, print, issue, and track visitor badges across all sites.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="18" />Print Badge</button>
          <button class="btn-outline hb" (click)="tplList.set(true)"><app-icon name="layers" [size]="18" />Manage Templates</button>
          <button class="btn-outline hb" (click)="exportCsv()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggle('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="printersOpen.set(true); menu.set(null)"><app-icon name="vm-c-printer" [size]="15" />Printer status</button>
                <button class="dd-item" (click)="clearPrinted()"><app-icon name="list-checks" [size]="15" />Clear printed jobs</button>
                <button class="dd-item" (click)="go('visitor-check-in-check-out')"><app-icon name="user-check" [size]="15" />Visitor Check-In / Out</button>
                <button class="dd-item" (click)="go('qr-invitations-digital-passes')"><app-icon name="tasks-qr" [size]="15" />Digital passes</button>
                <button class="dd-item" (click)="go('visitor-logs-history')"><app-icon name="history" [size]="15" />Visitor Logs</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Active Badges" [value]="st.kpis().active" icon="vm-h-badge-card" color="var(--ka-7c3aed)" [clickable]="true" [active]="tab() === 'Issued'" (pick)="setTab('Issued')" />
        <vm-kpi label="Print Queue" [value]="st.kpis().queue" icon="vm-c-printer" color="var(--ka-16a34a)" [clickable]="true" [active]="tab() === 'Awaiting Print'" (pick)="setTab('Awaiting Print')" />
        <vm-kpi label="Issued Today" [value]="st.kpis().issued" icon="user-check" color="var(--ka-f97316)" [clickable]="true" (pick)="setTab('Issued')" />
        <vm-kpi label="Returned Today" [value]="st.kpis().returned" icon="vm-c-undo" color="var(--ka-3b82f6)" [clickable]="true" [active]="tab() === 'Returned'" (pick)="setTab('Returned')" />
      </section>

      <div class="bar">
        <div class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="setTab(t)">{{ t }}</button>}</div>
        <label class="vm-search"><app-icon name="search" [size]="16" /><input placeholder="Search visitor, badge number..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="map-pin" [size]="16" /><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="layers" [size]="16" /><span>Badge Type:</span><select [value]="btype()" (change)="btype.set($any($event.target).value)"><option value="">All</option>@for (b of types; track b) {<option [value]="b">{{ b }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="sliders" [size]="16" /><span>Status:</span><select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="calendar-days" [size]="16" /><span>Date:</span><select [value]="date()" (change)="date.set($any($event.target).value)"><option value="">All</option><option value="15 Oct">Today</option><option value="14 Oct">Yesterday</option></select></label>
        <button class="vm-icon-btn" [class.spin]="spin()" title="Reset filters &amp; refresh" (click)="reset()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="cols">
        <div class="left">
          <div class="vm-card">
            <div class="ch">
              <h2><app-icon name="vm-c-printer" [size]="23" />Badge Print Queue</h2>
              @if (checked().size) {<span class="selinfo">{{ checked().size }} selected</span><button class="vm-mini fill" (click)="printSelected()"><app-icon name="reports-printer" [size]="13" />Print selected</button><button class="vm-mini" (click)="checkAll(false)">Clear</button>}
            </div>
            <div class="tbl q">
              <table class="vm-table">
                <thead><tr>
                  <th class="cb"><input type="checkbox" [checked]="allChecked()" (change)="checkAll($any($event.target).checked)" /></th>
                  @for (c of qCols; track c.k) {<th class="sort" (click)="sortQ(c.k)">{{ c.l }} <app-icon name="vm-b-sort" [size]="12" [class.on]="qSort().k === c.k" /></th>}
                  <th class="ac">Actions</th>
                </tr></thead>
                <tbody>
                  @for (r of qRows(); track r.id) {
                    <tr class="click" [class.sel]="selId() === r.id" (click)="select(r.id)">
                      <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="checked().has(r.id)" (change)="check(r.id)" /></td>
                      <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="30" />{{ r.name }}</div></td>
                      <td class="w">{{ r.company }}</td>
                      <td><div class="ic"><app-icon name="id-card" [size]="15" />{{ r.type }}</div></td>
                      <td><div class="ic"><app-icon name="user" [size]="15" />{{ r.host }}</div></td>
                      <td><div class="ic"><app-icon name="map-pin" [size]="15" /><span class="w2">{{ r.site }}</span></div></td>
                      <td><div class="ic"><app-icon name="calendar-days" [size]="15" />{{ ago(r.at) }}</div></td>
                      <td>
                        @if (r.status === 'Printing') {<span class="vm-pill" data-tone="blue"><app-icon name="reports-printer" [size]="13" />{{ printing()?.pct ?? 0 }}%</span>}
                        @else {<vm-status [label]="r.status" [tone]="tone(r.status)" [icon]="icon(r.status)" />}
                      </td>
                      <td (click)="$event.stopPropagation()">
                        <div class="vm-acts">
                          <button class="ia" title="Preview" (click)="select(r.id)"><app-icon name="eye" [size]="17" /></button>
                          <button class="ia" title="Edit badge" (click)="openEdit(r)"><app-icon name="w-pencil" [size]="16" /></button>
                          <button class="ia" title="Print" (click)="select(r.id); print(false)"><app-icon name="reports-printer" [size]="17" /></button>
                          <div class="menu-wrap">
                            <button class="ia" (click)="toggle('q:' + r.id, $event)"><app-icon name="more" [size]="16" /></button>
                            @if (menu() === 'q:' + r.id) {
                              <div class="dropdown right" (click)="$event.stopPropagation()">
                                @if (r.status === 'Printed') {<button class="dd-item" (click)="issue(r)"><app-icon name="user-check" [size]="15" />Mark as issued</button>}
                                @if (r.status === 'Issued' || r.status === 'Printed') {<button class="dd-item" (click)="markReturned(r.badgeNo)"><app-icon name="vm-c-undo" [size]="15" />Mark returned</button>
                                <button class="dd-item" (click)="markLost(r.badgeNo)"><app-icon name="triangle-alert" [size]="15" />Report lost</button>}
                                @if (r.status !== 'Awaiting Print') {<button class="dd-item" (click)="reprint(r)"><app-icon name="refresh" [size]="15" />Re-queue for reprint</button>}
                                <button class="dd-item" (click)="go('visitor-check-in-check-out')"><app-icon name="vm-c-log-in" [size]="15" />Open check-in</button>
                                <button class="dd-item red" (click)="remove(r)"><app-icon name="vm-c-trash" [size]="15" />Remove from queue</button>
                              </div>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  } @empty {<tr><td colspan="9" class="vm-empty">No badges match these filters. <button class="vm-link" (click)="reset()">Clear filters</button></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div class="vm-card">
            <div class="ch"><h2><app-icon name="layers" [size]="23" />Badge Templates</h2></div>
            <div class="tpls">
              @for (t of st.templates(); track t.id) {
                <div class="tpl" [class.on]="selTpl()?.id === t.id" (click)="applyTpl(t)" title="Apply to selected badge">
                  <div class="mini">
                    <i class="clip"></i>
                    <div class="mh"><img alt="" /><b>People360</b></div>
                    @if (t.photo) {<app-icon name="user" [size]="22" [stroke]="2.4" />} @else {<span class="nophoto"></span>}
                    <span class="mb" [style.background]="t.color" [style.font-size.px]="t.band.length > 8 ? 6 : 7.5">{{ t.band }}</span>
                    <span class="bc"></span>
                  </div>
                  <div class="td"><b>{{ t.name }}</b><p>{{ t.desc }}</p><button class="vm-link ed" (click)="$event.stopPropagation(); openTpl(t)"><app-icon name="w-pencil" [size]="14" />Edit design</button></div>
                </div>
              }
              <button class="tpl new" (click)="openTpl(null)"><app-icon name="plus" [size]="30" /><span>New Template</span></button>
            </div>
          </div>

          <div class="vm-card">
            <div class="ch"><h2><app-icon name="vm-c-clipboard" [size]="23" />Badge Activity</h2><span class="sub">{{ aRows().length }} record{{ aRows().length === 1 ? '' : 's' }}</span></div>
            <div class="tbl a">
              <table class="vm-table">
                <thead><tr>
                  @for (c of aCols; track c.k) {<th class="sort" (click)="sortA(c.k)">{{ c.l }} <app-icon name="vm-b-sort" [size]="12" [class.on]="aSort().k === c.k" /></th>}
                  <th class="ac">Actions</th>
                </tr></thead>
                <tbody>
                  @for (a of aRows(); track a.id) {
                    <tr>
                      <td><div class="vm-person"><vm-avatar [name]="a.name" [size]="26" />{{ a.name }}</div></td>
                      <td>{{ a.badgeNo }}</td>
                      <td><div class="ic"><app-icon name="id-card" [size]="15" />{{ a.type }}</div></td>
                      <td>{{ a.by }}</td>
                      <td><div class="ic"><app-icon name="calendar-days" [size]="15" />{{ a.issued }}</div></td>
                      <td>{{ a.returned }}</td>
                      <td><vm-status [label]="a.status" [tone]="tone(a.status)" [icon]="icon(a.status)" /></td>
                      <td>
                        <div class="vm-acts">
                          <button class="ia" title="View" (click)="viewAct.set(a)"><app-icon name="eye" [size]="17" /></button>
                          <button class="ia" title="Edit status" (click)="editAct.set({ ...a })"><app-icon name="w-pencil" [size]="16" /></button>
                          <div class="menu-wrap">
                            <button class="ia" (click)="toggle('a:' + a.id, $event)"><app-icon name="more" [size]="16" /></button>
                            @if (menu() === 'a:' + a.id) {
                              <div class="dropdown right" (click)="$event.stopPropagation()">
                                @if (a.status === 'Active') {
                                  <button class="dd-item" (click)="markReturned(a.badgeNo)"><app-icon name="vm-c-undo" [size]="15" />Mark returned</button>
                                  <button class="dd-item" (click)="markLost(a.badgeNo)"><app-icon name="triangle-alert" [size]="15" />Report lost</button>
                                  <button class="dd-item" (click)="deactivate(a)"><app-icon name="ban" [size]="15" />Deactivate badge</button>
                                } @else {
                                  <button class="dd-item" (click)="reactivate(a)"><app-icon name="refresh" [size]="15" />Reactivate badge</button>
                                }
                                <button class="dd-item" (click)="reprintAct(a)"><app-icon name="reports-printer" [size]="15" />Reprint badge</button>
                              </div>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  } @empty {<tr><td colspan="8" class="vm-empty">No badge activity for this view.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="vm-card prev">
          <div class="ch"><h2><app-icon name="vm-h-badge-card" [size]="23" />Badge Preview</h2></div>
          @if (sel(); as s) {
            @let t = selTpl()!;
            <div class="lanyard"><i class="strap"></i><i class="clip2"></i></div>
            <div class="badge" [class.busy]="s.status === 'Printing'">
              <div class="bh"><span class="lg1"><app-icon name="users" [size]="20" />People360</span><span class="lg2"><app-icon name="sparkles" [size]="16" />Purple IQ</span></div>
              <div class="bb">
                <div class="top">
                  @if (t.photo) {<vm-avatar [name]="s.name" [size]="104" [square]="true" />}
                  <div class="nm"><h3>{{ s.name }}</h3><p>{{ s.companyFull }}</p><span class="band" [style.background]="t.color" [style.font-size.px]="t.band.length > 8 ? 17 : 21">{{ t.band }}</span></div>
                </div>
                <div class="kv">
                  @if (t.host) {<span><app-icon name="user" [size]="15" />Host</span><i>:</i><b>{{ s.host }}</b>}
                  <span><app-icon name="building" [size]="15" />Site</span><i>:</i><b>{{ s.site }}</b>
                  <span><app-icon name="calendar-days" [size]="15" />Valid</span><i>:</i><b>15 Oct 2026 · {{ t12(s.validFrom) }} – {{ t12(s.validTo) }}</b>
                </div>
                <div class="acc"><span><app-icon name="key-round" [size]="15" />Access:</span><div>@for (a of s.areas; track a) {<span class="vm-chip">{{ a }}</span>}</div></div>
                <div class="bf"><div class="no"><small>Badge No.</small><b>{{ s.badgeNo }}</b></div>@if (t.qr) {<vm-qr [data]="s.badgeNo + '|' + s.name" [size]="78" />}</div>
              </div>
            </div>
            @if (printing(); as p) {<div class="prog"><div><i [style.width.%]="p.pct"></i></div><small>Printing {{ copies() > 1 ? copies() + ' copies' : 'badge' }} on {{ printer() }}… {{ p.pct }}%</small></div>}
            <div class="pr-row">
              <label class="psel"><app-icon name="vm-c-printer" [size]="17" /><select [value]="printer()" (change)="printer.set($any($event.target).value)">@for (p of printers; track p.name) {<option [value]="p.name">{{ p.name }}</option>}</select></label>
              <vm-status [label]="printerStatus()" [tone]="printerStatus() === 'Ready' ? 'green' : printerStatus() === 'Offline' ? 'red' : printerStatus() === 'Printing' ? 'blue' : 'orange'" [icon]="printerStatus() === 'Ready' ? 'vm-c-check-circle' : 'triangle-alert'" />
              <span class="cp">Copies:</span>
              <div class="step"><button (click)="copies.set(Math.max(1, copies() - 1))" [disabled]="copies() <= 1"><app-icon name="minus" [size]="14" /></button><b>{{ copies() }}</b><button (click)="copies.set(Math.min(5, copies() + 1))" [disabled]="copies() >= 5"><app-icon name="plus" [size]="14" /></button></div>
            </div>
            <div class="two">
              <button class="btn-primary pb" [disabled]="!!printing()" (click)="print(false)"><app-icon name="reports-printer" [size]="20" />Print Badge</button>
              <button class="btn-outline pb" [disabled]="!!printing()" (click)="print(true)"><app-icon name="vm-c-check-circle" [size]="20" />Print &amp; Check In</button>
            </div>
          } @else {
            <p class="vm-empty">Select a badge in the print queue to preview it.</p>
          }
        </aside>
      </div>
    </div>

    <!-- ===== modals ===== -->
    @if (edit(); as e) {
      <div class="g-overlay" (click)="edit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveEdit()">
        <div class="modal-head"><h3>Edit badge – {{ e.name }}</h3><button type="button" class="close-btn" (click)="edit.set(null)">×</button></div>
        <div class="form-grid">
          <label>Badge type<select class="input" [value]="e.type" (change)="patchEdit('type', $any($event.target).value)">@for (b of types; track b) {<option [value]="b">{{ b }}</option>}</select></label>
          <label>Template<select class="input" [value]="e.template" (change)="patchEdit('template', $any($event.target).value)">@for (t of st.templates(); track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Host<select class="input" [value]="e.host" (change)="patchEdit('host', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
          <label>Site<select class="input" [value]="e.site" (change)="patchEdit('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label>Valid from<select class="input" [value]="'' + e.validFrom" (change)="patchEdit('validFrom', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ t12(t) }}</option>}</select></label>
          <label>Valid to<select class="input" [value]="'' + e.validTo" (change)="patchEdit('validTo', +$any($event.target).value)">@for (t of times; track t) {<option [value]="'' + t">{{ t12(t) }}</option>}</select></label>
        </div>
        <p class="lbl2">Access areas</p>
        <div class="chk">@for (a of areas; track a) {<label><input type="checkbox" [checked]="e.areas.includes(a)" (change)="flipArea(a)" />{{ a }}</label>}</div>
        @if (err()) {<p class="err-t">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="edit.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Changes</button></div>
      </form>
    }
    @if (tplEdit(); as t) {
      <div class="g-overlay" (click)="tplEdit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveTpl()">
        <div class="modal-head"><h3>{{ isNewTpl() ? 'New Badge Template' : 'Edit design – ' + t.name }}</h3><button type="button" class="close-btn" (click)="tplEdit.set(null)">×</button></div>
        <div class="tdes">
          <div class="form-grid">
            <label class="full">Template name<input class="input" [value]="t.name" (input)="patchTpl('name', $any($event.target).value)" /></label>
            <label class="full">Description<input class="input" [value]="t.desc" (input)="patchTpl('desc', $any($event.target).value)" /></label>
            <label>Band label<input class="input" maxlength="14" [value]="t.band" (input)="patchTpl('band', $any($event.target).value.toUpperCase())" /></label>
            <label>Badge type<select class="input" [value]="t.type" (change)="patchTpl('type', $any($event.target).value)">@for (b of types; track b) {<option [value]="b">{{ b }}</option>}</select></label>
            <label>Default validity<select class="input" [value]="'' + t.expiry" (change)="patchTpl('expiry', +$any($event.target).value)"><option value="1">Same day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
            <label>Band colour<div class="sw">@for (c of colors; track c) {<button type="button" [style.background]="c" [class.on]="t.color === c" (click)="patchTpl('color', c)"></button>}</div></label>
          </div>
          <div class="mini big">
            <i class="clip"></i>
            <div class="mh"><b>People360</b></div>
            @if (t.photo) {<app-icon name="user" [size]="34" [stroke]="2.4" />} @else {<span class="nophoto"></span>}
            <span class="mb" [style.background]="t.color">{{ t.band || 'BAND' }}</span>
            @if (t.qr) {<vm-qr data="template-preview" [size]="40" />} @else {<span class="bc"></span>}
          </div>
        </div>
        <div class="tg">
          <label><button type="button" class="vm-switch purple" [class.on]="t.photo" (click)="patchTpl('photo', !t.photo)"></button>Visitor photo</label>
          <label><button type="button" class="vm-switch purple" [class.on]="t.qr" (click)="patchTpl('qr', !t.qr)"></button>QR code</label>
          <label><button type="button" class="vm-switch purple" [class.on]="t.host" (click)="patchTpl('host', !t.host)"></button>Host name</label>
        </div>
        @if (err()) {<p class="err-t">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="tplEdit.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ isNewTpl() ? 'Create Template' : 'Save Design' }}</button></div>
      </form>
    }
    @if (tplList()) {
      <div class="g-overlay" (click)="tplList.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Manage Templates</h3><button type="button" class="close-btn" (click)="tplList.set(false)">×</button></div>
        @for (t of st.templates(); track t.id) {
          <div class="trow"><span class="sq" [style.background]="t.color"></span><div><b>{{ t.name }}</b><small>{{ t.type }} · band “{{ t.band }}” · {{ usage(t.id) }} badge(s) in queue</small></div>
            <button class="vm-mini" (click)="tplList.set(false); openTpl(t)">Edit</button>
            <button class="vm-mini" (click)="dupTpl(t)">Duplicate</button>
            <button class="vm-mini red" (click)="delTpl(t)">Delete</button></div>
        }
        <div class="form-actions"><button class="btn-outline" (click)="tplList.set(false); openTpl(null)">+ New Template</button><button class="btn-primary" (click)="tplList.set(false)">Done</button></div>
      </div>
    }
    @if (newOpen()) {
      <div class="g-overlay" (click)="newOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); addNew(nv.value, nt.value, nz.value, false)">
        <div class="modal-head"><h3>Print Badge</h3><button type="button" class="close-btn" (click)="newOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Visitor<select #nv class="input">@for (v of candidates(); track v.id) {<option [value]="v.id">{{ v.name }} · {{ v.company }} · {{ v.status }}</option>}</select></label>
          <label>Badge type<select #nt class="input">@for (b of types; track b) {<option [value]="b">{{ b }}</option>}</select></label>
          <label>Template<select #nz class="input">@for (t of st.templates(); track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
        </div>
        <p class="muted">Visitor details, host, site and access areas are taken from the visit record.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newOpen.set(false)">Cancel</button><button type="button" class="btn-outline" (click)="addNew(nv.value, nt.value, nz.value, true)">Add &amp; Print Now</button><button class="btn-primary" type="submit">Add to Queue</button></div>
      </form>
    }
    @if (viewAct(); as a) {
      <div class="g-overlay" (click)="viewAct.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Badge {{ a.badgeNo }}</h3><button type="button" class="close-btn" (click)="viewAct.set(null)">×</button></div>
        <div class="who"><vm-avatar [name]="a.name" [size]="56" /><div><b>{{ a.name }}</b><small>{{ a.type }}</small></div><vm-status [label]="a.status" [tone]="tone(a.status)" [icon]="icon(a.status)" /></div>
        <div class="vm-kv kvm"><span>Issued by</span><b>{{ a.by }}</b><span>Issued at</span><b>{{ a.issued }}</b><span>Returned at</span><b>{{ a.returned }}</b></div>
        <div class="form-actions">
          @if (qByBadge(a.badgeNo); as q) {<button class="btn-outline" (click)="select(q.id); viewAct.set(null)">Show in preview</button>}
          <button class="btn-outline" (click)="reprintAct(a); viewAct.set(null)">Reprint</button>
          <button class="btn-primary" (click)="viewAct.set(null)">Close</button>
        </div>
      </div>
    }
    @if (editAct(); as a) {
      <div class="g-overlay" (click)="editAct.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveAct()">
        <div class="modal-head"><h3>Edit badge record – {{ a.badgeNo }}</h3><button type="button" class="close-btn" (click)="editAct.set(null)">×</button></div>
        <div class="form-grid">
          <label>Status<select class="input" [value]="a.status" (change)="patchAct('status', $any($event.target).value)"><option>Active</option><option>Returned</option><option>Lost</option><option>Expired</option></select></label>
          <label>Badge type<select class="input" [value]="a.type" (change)="patchAct('type', $any($event.target).value)">@for (b of types; track b) {<option [value]="b">{{ b }}</option>}</select></label>
          <label class="full">Issued by<select class="input" [value]="a.by" (change)="patchAct('by', $any($event.target).value)">@for (h of hosts; track h.name) {<option [value]="h.name">{{ h.name }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="editAct.set(null)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    @if (printersOpen()) {
      <div class="g-overlay" (click)="printersOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Badge Printers</h3><button type="button" class="close-btn" (click)="printersOpen.set(false)">×</button></div>
        @for (p of printers; track p.name) {
          <div class="trow"><app-icon name="vm-c-printer" [size]="20" /><div><b>{{ p.name }}</b><small>{{ p.status === 'Offline' ? 'Last seen 09:12 AM' : 'Ribbon ' + (p.status === 'Ready' ? '78%' : '9%') + ' · Cards 214' }}</small></div>
            <vm-status [label]="p.status" [tone]="p.status === 'Ready' ? 'green' : p.status === 'Offline' ? 'red' : 'orange'" />
            <button class="vm-mini" (click)="printer.set(p.name); printersOpen.set(false); toast.show(p.name + ' selected')">Use</button>
            <button class="vm-mini" (click)="toast.show('Test page sent to ' + p.name)" [disabled]="p.status === 'Offline'">Test</button></div>
        }
      </div>
    }
    @if (toast.msg()) {<div class="g-toast">{{ toast.msg() }}</div>}
  `,
  styles: `
    .bd { gap: 12px; }
    :host ::ng-deep vm-avatar { overflow: hidden; display: inline-block; flex: none; }
    :host ::ng-deep vm-avatar svg > rect:not([fill]) { fill: var(--ka-ece7ff); }
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text); margin-bottom: 2px; }
    .crumb a { color: var(--text); text-decoration: none; display: inline-flex; } .crumb b { font-weight: 600; }
    .vm-head h1 { font-size: 30px; }
    .hb { height: 38px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; }
    .vm-icon-btn.tall { height: 38px; width: 38px; }
    .menu-wrap { position: relative; }
    .dropdown { left: 0; right: auto; min-width: 210px; z-index: 30; } .dropdown.right { left: auto; right: 0; }
    .dd-item.red { color: var(--kf-dc2626); }
    .vm-kpis { gap: 12px; }
    :host ::ng-deep .vm-kpi { padding: 10px 14px; }
    :host ::ng-deep .vm-kpi-ic { width: 56px; height: 56px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .bar { display: flex; align-items: center; gap: 6px; }
    .tabs { display: flex; gap: 5px; flex: none; }
    .tabs button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text); white-space: nowrap; }
    .tabs button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); font-weight: 600; box-shadow: 0 2px 8px rgba(124, 58, 237, .3); }
    .bar .vm-search { min-width: 120px; flex: 1.3; height: 36px; }
    .bar .vm-filter { flex: 1; min-width: 0; font-size: 12.5px; gap: 4px; padding: 0 6px; } .bar .vm-filter app-icon { flex: none; color: var(--kf-334155); }
    .bar .vm-filter select { font-size: 12.5px; flex: 1; min-width: 36px; }
    .bar .vm-filter > span { font-size: 12px; }
    .spin app-icon { animation: sp .7s linear; } @keyframes sp { to { transform: rotate(360deg); } }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 352px; gap: 12px; align-items: start; }
    .left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .vm-card { padding: 12px 14px; }
    .ch { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .ch h2 { flex: 1; margin: 0; font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .ch h2 app-icon { color: var(--primary); }
    .sub, .selinfo { font-size: 12.5px; color: var(--muted); }
    .tbl.q { max-height: 236px; overflow-y: auto; }
    .tbl.a { max-height: 172px; overflow-y: auto; }
    .vm-table th { padding: 7px 3px; font-size: 11.5px; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
    .vm-table td { padding: 5px 3px; font-size: 12px; }
    .vm-table :is(th, td):first-child { padding-left: 8px; }
    .vm-table th app-icon { vertical-align: -2px; color: var(--kf-64748b); } .vm-table th app-icon.on { color: var(--primary); }
    .vm-table :is(vm-status, .vm-pill) { font-size: 11.5px; padding: 3px 7px; gap: 4px; }
    .vm-table tr.sel td { background: var(--kb-f1ebff); }
    .tbl.a td { padding: 4px 3px; font-size: 11.5px; }
    .tbl.a .ic, .tbl.a td { white-space: nowrap; }
    .vm-person { gap: 6px; font-size: 12.5px; }
    .ic { display: flex; align-items: center; gap: 4px; white-space: nowrap; } .ic app-icon { color: var(--kf-334155); flex: none; }
    .w { max-width: 72px; white-space: normal; line-height: 1.25; }
    .w2 { white-space: normal; line-height: 1.2; width: 72px; display: inline-block; }
    .cb { width: 22px; } .cb input { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; }
    .ac { text-align: center; }
    .vm-acts { gap: 0; } .vm-acts .ia { padding: 2px; }
    .tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 8px; }
    .tpl { display: flex; gap: 8px; border: 1px solid var(--border); border-radius: 10px; padding: 8px; cursor: pointer; background: var(--kb-ffffff); min-width: 0; }
    .tpl:hover { border-color: var(--kl-c4b5fd); } .tpl.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--kb-ede9fe); }
    .td { min-width: 0; } .td b { font-size: 13.5px; } .td p { margin: 3px 0 6px; font-size: 11.5px; line-height: 1.3; color: var(--kf-334155); }
    .ed { display: inline-flex; gap: 5px; align-items: center; font-size: 13px; text-decoration: underline; }
    .tpl.new { flex-direction: column; align-items: center; justify-content: center; border: 2px dashed var(--kl-c4b5fd); color: var(--primary); font: inherit; font-weight: 600; font-size: 15px; min-height: 104px; }
    .mini { position: relative; width: 64px; height: 92px; flex: none; border: 1px solid var(--kl-ddd6fe); border-radius: 8px; background: var(--kb-ffffff); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 4px 4px; box-shadow: 0 2px 6px rgba(80, 40, 160, .1); color: var(--kf-64748b); }
    .mini .clip { position: absolute; top: -4px; left: 50%; transform: translateX(-50%); width: 18px; height: 6px; border-radius: 2px; background: var(--kb-6d28d9); }
    .mh { display: flex; align-items: center; justify-content: center; width: 100%; font-size: 8px; color: var(--kf-6d28d9); } .mh img { display: none; }
    .mb { width: 100%; text-align: center; color: var(--kf-ffffff); font-size: 7.5px; font-weight: 800; padding: 2px 0; border-radius: 2px; letter-spacing: .03em; overflow: hidden; white-space: nowrap; }
    .bc { width: 70%; height: 8px; background: repeating-linear-gradient(90deg, var(--kb-111111) 0 1px, var(--kb-ffffff) 1px 2px, var(--kb-111111) 2px 4px, var(--kb-ffffff) 4px 5px); }
    .nophoto { width: 22px; height: 22px; }
    .mini.big { width: 130px; height: 176px; gap: 8px; padding-top: 16px; } .mini.big .mh { font-size: 12px; } .mini.big .mb { font-size: 12px; }
    .prev { position: sticky; top: 10px; display: flex; flex-direction: column; padding: 12px 16px 14px; }
    .lanyard { position: relative; height: 26px; display: flex; justify-content: center; }
    .strap { width: 34px; height: 22px; background: var(--kb-6d28d9); border-radius: 4px 4px 0 0; }
    .clip2 { position: absolute; bottom: -4px; width: 64px; height: 12px; border-radius: 6px; border: 3px solid var(--kl-c4b5fd); background: var(--kb-f5f3ff); }
    .badge { border: 1px solid var(--kl-ddd6fe); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 22px rgba(80, 40, 160, .14); margin: 0 6px; transition: opacity .2s; }
    .badge.busy { opacity: .75; }
    .bh { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 22px; color: var(--kf-ffffff); background: linear-gradient(120deg, var(--kb-4c1d95), var(--kb-7c3aed) 60%, var(--kb-8b5cf6)); clip-path: polygon(0 0, 100% 0, 100% 72%, 0 100%); }
    .lg1 { display: flex; gap: 6px; align-items: center; font-size: 18px; font-weight: 700; } .lg2 { display: flex; gap: 5px; align-items: center; font-size: 14px; font-weight: 600; }
    .bb { padding: 4px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
    .top { display: flex; gap: 14px; align-items: center; }
    .top vm-avatar { border-radius: 10px; overflow: hidden; flex: none; }
    .nm { min-width: 0; flex: 1; } .nm h3 { margin: 0; font-size: 22px; font-weight: 800; } .nm p { margin: 2px 0 8px; font-size: 13.5px; }
    .band { display: block; text-align: center; color: var(--kf-ffffff); font-weight: 800; font-size: 21px; letter-spacing: .04em; padding: 3px 0; border-radius: 4px; }
    .kv { display: grid; grid-template-columns: 62px 8px 1fr; gap: 6px 4px; font-size: 12.5px; align-items: center; border-bottom: 1px solid var(--kl-ede9fe); padding-bottom: 9px; }
    .kv span { display: flex; align-items: center; gap: 6px; } .kv b { font-weight: 600; } .kv i { font-style: normal; }
    .acc { font-size: 12.5px; } .acc > span { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
    .acc > div { display: flex; flex-wrap: wrap; gap: 5px; padding-left: 20px; } .acc .vm-chip { border: 1px solid var(--kl-c4b5fd); border-radius: 12px; font-size: 11.5px; }
    .bf { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .no { background: var(--kb-ede9fe); border-radius: 8px; padding: 8px 14px; flex: 1; } .no small { display: block; font-size: 12px; } .no b { font-size: 20px; font-weight: 800; }
    .prog { margin-top: 12px; } .prog div { height: 8px; border-radius: 6px; background: var(--kb-ede9fe); overflow: hidden; } .prog i { display: block; height: 100%; background: var(--primary); transition: width .2s; }
    .prog small { font-size: 12px; color: var(--muted); }
    .pr-row { display: flex; align-items: center; gap: 5px; margin-top: 12px; }
    .psel { display: flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 8px; height: 34px; padding: 0 5px; flex: 1; min-width: 128px; }
    .psel select { border: 0; outline: 0; font: inherit; font-size: 12px; background: transparent; min-width: 0; flex: 1; cursor: pointer; }
    .pr-row vm-status { font-size: 11px; padding: 2px 6px; gap: 4px; }
    .cp { font-size: 12px; font-weight: 600; }
    .step { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; height: 32px; }
    .step button { border: 0; background: none; width: 22px; height: 100%; cursor: pointer; display: grid; place-items: center; color: var(--text); } .step button[disabled] { opacity: .35; cursor: default; }
    .step b { width: 22px; text-align: center; font-size: 13.5px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); line-height: 30px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .pb { height: 44px; font-size: 15.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .pb[disabled] { opacity: .6; cursor: progress; }
    .lbl2 { font-size: 12px; color: var(--kf-4b4f6b); margin: 14px 0 6px; }
    .chk { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 13px; } .chk label { display: flex; gap: 8px; align-items: center; } .chk input { accent-color: var(--primary); }
    .err-t { color: var(--kf-dc2626); font-size: 12.5px; margin: 8px 0 0; }
    .tdes { display: grid; grid-template-columns: 1fr 140px; gap: 16px; align-items: start; }
    .sw { display: flex; gap: 6px; height: 36px; align-items: center; } .sw button { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--kl-ffffff); box-shadow: 0 0 0 1px var(--kb-dddddd); cursor: pointer; } .sw button.on { box-shadow: 0 0 0 2px var(--kb-111111); }
    .tg { display: flex; gap: 20px; margin-top: 14px; font-size: 13px; } .tg label { display: flex; gap: 8px; align-items: center; }
    .trow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--kl-f0f0f6); }
    .trow > div { flex: 1; min-width: 0; } .trow b { display: block; font-size: 14px; } .trow small { color: var(--muted); font-size: 12px; }
    .sq { width: 16px; height: 16px; border-radius: 4px; flex: none; }
    .who { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; } .who > div { flex: 1; } .who b { display: block; font-size: 16px; } .who small { color: var(--muted); }
    .kvm { margin-top: 6px; }
    .muted { color: var(--muted); font-size: 12.5px; }
    @media (max-width: 1250px) { .cols { grid-template-columns: minmax(0, 1fr); } .prev { position: static; } }
  `,
})
export class BadgesPrinting {
  protected readonly st = inject(BadgeStore);
  private readonly vm = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly toast = new Toaster();
  protected readonly Math = Math;
  protected readonly t12 = t12;
  protected readonly tabs = TABS;
  protected readonly types = BADGE_TYPE_LIST;
  protected readonly sites = SITES;
  protected readonly hosts = HOSTS;
  protected readonly areas = AREAS;
  protected readonly printers = PRINTERS;
  protected readonly colors = COLORS;
  protected readonly statuses = ['Awaiting Print', 'Printed', 'Issued', 'Returned', 'Lost', 'Active', 'Expired'];
  protected readonly times = Array.from({ length: 27 }, (_, i) => 420 + i * 30);
  protected readonly qCols: { k: QKey; l: string }[] = [{ k: 'name', l: 'Visitor' }, { k: 'company', l: 'Company' }, { k: 'type', l: 'Badge Type' }, { k: 'host', l: 'Host' }, { k: 'site', l: 'Site' }, { k: 'at', l: 'Print Time' }, { k: 'status', l: 'Status' }];
  protected readonly aCols: { k: AKey; l: string }[] = [{ k: 'name', l: 'Visitor' }, { k: 'badgeNo', l: 'Badge No.' }, { k: 'type', l: 'Type' }, { k: 'by', l: 'Issued By' }, { k: 'issued', l: 'Issued At' }, { k: 'returned', l: 'Returned At' }, { k: 'status', l: 'Status' }];

  protected readonly tab = signal<Tab>('All Badges');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly btype = signal('');
  protected readonly status = signal('');
  protected readonly date = signal('');
  protected readonly spin = signal(false);
  protected readonly menu = signal<string | null>(null);
  protected readonly selId = signal<string | null>('Q1');
  protected readonly checked = signal(new Set<string>());
  protected readonly qSort = signal<{ k: QKey | null; dir: 1 | -1 }>({ k: null, dir: 1 });
  protected readonly aSort = signal<{ k: AKey | null; dir: 1 | -1 }>({ k: null, dir: 1 });
  protected readonly printer = signal(PRINTERS[0].name);
  protected readonly copies = signal(1);
  protected readonly printing = signal<{ id: string; pct: number } | null>(null);
  protected readonly edit = signal<QueueRow | null>(null);
  protected readonly tplEdit = signal<BadgeTpl | null>(null);
  protected readonly isNewTpl = signal(false);
  protected readonly tplList = signal(false);
  protected readonly newOpen = signal(false);
  protected readonly printersOpen = signal(false);
  protected readonly viewAct = signal<ActRow | null>(null);
  protected readonly editAct = signal<ActRow | null>(null);
  protected readonly err = signal('');

  private readonly text = (s: string) => s.toLowerCase().includes(this.q().trim().toLowerCase());
  protected readonly qRows = computed(() => {
    const tq = TAB_Q[this.tab()], st = this.status(), si = this.site(), bt = this.btype(), d = this.date();
    let l = this.st.queue().filter((r) => (!tq || tq.includes(r.status)) && (!st || r.status === st) && (!si || r.site === si) && (!bt || r.type === bt) && (!d || d === '15 Oct') && this.text(`${r.name} ${r.company} ${r.badgeNo} ${r.host}`));
    const { k, dir } = this.qSort();
    if (k) l = [...l].sort((a, b) => (k === 'at' ? b.at - a.at : String(a[k]).localeCompare(String(b[k]))) * dir);
    return l;
  });
  protected readonly aRows = computed(() => {
    const ta = TAB_A[this.tab()], st = this.status(), si = this.site(), bt = this.btype(), d = this.date();
    let l = this.st.activity().filter((a) => (!ta || ta.includes(a.status)) && (!st || a.status === st) && (!bt || a.type === bt) && (!d || a.issued.startsWith(d)) && (!si || this.qByBadge(a.badgeNo)?.site === si) && this.text(`${a.name} ${a.badgeNo} ${a.by}`));
    const { k, dir } = this.aSort();
    if (k) l = [...l].sort((a, b) => String(a[k]).localeCompare(String(b[k])) * dir);
    return l;
  });
  protected readonly sel = computed(() => this.st.queue().find((r) => r.id === this.selId()) ?? null);
  protected readonly selTpl = computed(() => { const s = this.sel(); return s ? this.st.templates().find((t) => t.id === s.template) ?? tplFor(s.type, this.st.templates()) : null; });
  protected readonly allChecked = computed(() => this.qRows().length > 0 && this.qRows().every((r) => this.checked().has(r.id)));
  protected readonly printerStatus = computed(() => (this.printing() ? 'Printing' : PRINTERS.find((p) => p.name === this.printer())!.status));
  protected readonly candidates = computed(() => this.vm.visitors().filter((v) => v.status !== 'Checked Out' && v.status !== 'Cancelled' && !this.st.queue().some((r) => r.name === v.name)).slice(0, 40));

  protected qByBadge(no: string) { return this.st.queue().find((r) => r.badgeNo === no) ?? null; }
  protected ago(at: number) { return ago(this.vm.now(), at); }
  protected tone(s: string) { return Q_TONE[s]; }
  protected icon(s: string) { return Q_ICON[s]; }
  protected usage(id: string) { return this.st.queue().filter((r) => r.template === id).length; }
  protected toggle(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.edit.set(null); this.tplEdit.set(null); this.tplList.set(false); this.newOpen.set(false); this.viewAct.set(null); this.editAct.set(null); this.printersOpen.set(false); }
  protected go(p: string) { this.menu.set(null); this.router.navigate(['/visitor-management', p]); }
  protected setTab(t: Tab) { this.tab.set(t); }
  protected select(id: string) { this.selId.set(id); this.menu.set(null); }
  protected check(id: string) { this.checked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected checkAll(on: boolean) { this.checked.set(on ? new Set(this.qRows().map((r) => r.id)) : new Set()); }
  protected sortQ(k: QKey) { this.qSort.update((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : 1 })); }
  protected sortA(k: AKey) { this.aSort.update((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : 1 })); }
  protected reset() {
    this.q.set(''); this.site.set(''); this.btype.set(''); this.status.set(''); this.date.set(''); this.tab.set('All Badges');
    this.qSort.set({ k: null, dir: 1 }); this.aSort.set({ k: null, dir: 1 });
    this.spin.set(true); setTimeout(() => this.spin.set(false), 700);
    this.toast.show('Badge queue refreshed');
  }

  // ---------- printing ----------
  protected print(checkIn: boolean) {
    const s = this.sel(); if (!s) return;
    if (this.printing()) { this.toast.show('Printer is busy – wait for the current job'); return; }
    const ps = PRINTERS.find((p) => p.name === this.printer())!.status;
    if (ps === 'Offline') { this.toast.show(`${this.printer()} is offline – choose another printer`); return; }
    const prev = s.status, copies = this.copies(), printer = this.printer();
    this.st.patchQ(s.id, { status: 'Printing' });
    this.printing.set({ id: s.id, pct: 0 });
    const iv = setInterval(() => {
      const p = this.printing(); if (!p) { clearInterval(iv); return; }
      const pct = Math.min(100, p.pct + Math.ceil(10 / copies));
      this.printing.set({ ...p, pct });
      if (pct < 100) return;
      clearInterval(iv);
      this.printing.set(null);
      this.vm.log({ text: `Badge ${s.badgeNo} printed for ${s.name} (${printer})`, kind: 'badge', visitor: s.badgeNo });
      if (!checkIn) {
        this.st.patchQ(s.id, { status: prev === 'Issued' ? 'Issued' : 'Printed', at: this.vm.now() });
        this.toast.show(`Printed ${copies > 1 ? copies + ' copies of ' : ''}${s.badgeNo} for ${s.name} on ${printer}${ps === 'Low Ribbon' ? ' · ribbon low' : ''}`);
        return;
      }
      this.issue({ ...s, status: 'Printed' }, true);
    }, 160);
  }
  protected printSelected() {
    const ids = [...this.checked()].filter((id) => { const r = this.st.queue().find((x) => x.id === id); return r && r.status !== 'Printing'; });
    if (PRINTERS.find((p) => p.name === this.printer())!.status === 'Offline') { this.toast.show(`${this.printer()} is offline – choose another printer`); return; }
    ids.forEach((id) => this.st.patchQ(id, { status: 'Printing' }));
    this.toast.show(`Printing ${ids.length} badge(s) on ${this.printer()}…`);
    setTimeout(() => { ids.forEach((id) => this.st.patchQ(id, { status: 'Printed', at: this.vm.now() })); this.checked.set(new Set()); this.toast.show(`${ids.length} badge(s) printed`); }, 1800);
  }
  /** Hand the badge to the visitor: queue → Issued, activity row Active, check in via VmStore. */
  protected issue(r: QueueRow, fromPrint = false) {
    this.menu.set(null);
    this.st.patchQ(r.id, { status: 'Issued', at: this.vm.now() });
    if (!this.st.activity().some((a) => a.badgeNo === r.badgeNo && a.status === 'Active')) {
      this.st.addA({ name: r.name, badgeNo: r.badgeNo, type: r.type, by: r.host, issued: NOW_STAMP, returned: '—', status: 'Active' });
      this.st.dIssued.update((n) => n + 1);
    }
    const v = this.vm.byName(r.name);
    let msg = `${r.badgeNo} issued to ${r.name}`;
    if (v && (v.status === 'Checked In' || v.status === 'Overdue')) msg += fromPrint ? ` · already checked in at ${this.hm(v.checkIn)}` : '';
    else if (v) { this.vm.checkIn(v.id); msg += ' · checked in'; }
    else { this.vm.add({ name: r.name, company: r.companyFull, host: r.host, site: r.site, areas: r.areas, type: 'Business Visitor' }, 'Checked In'); msg += ' · registered & checked in'; }
    this.toast.show((fromPrint ? 'Printed & ' : '') + msg);
  }
  private hm(m: number | null) { return m == null ? '—' : t12(m); }
  protected markReturned(no: string) {
    this.menu.set(null);
    const q = this.qByBadge(no); if (q) this.st.patchQ(q.id, { status: 'Returned' });
    const a = this.st.activity().find((x) => x.badgeNo === no && x.status === 'Active');
    if (a) this.st.patchA(a.id, { status: 'Returned', returned: NOW_STAMP });
    this.st.dReturned.update((n) => n + 1);
    const v = q && this.vm.byName(q.name);
    if (v && (v.status === 'Checked In' || v.status === 'Overdue')) this.vm.checkOut(v.id);
    this.toast.show(`${no} returned${v ? ' · visitor checked out' : ''}`);
  }
  protected markLost(no: string) {
    this.menu.set(null);
    const q = this.qByBadge(no); if (q) this.st.patchQ(q.id, { status: 'Lost' });
    const a = this.st.activity().find((x) => x.badgeNo === no && x.status === 'Active');
    if (a) this.st.patchA(a.id, { status: 'Lost' });
    this.st.dLost.update((n) => n + 1);
    this.vm.log({ text: `Badge ${no} reported lost – access deactivated`, kind: 'alert', visitor: no });
    this.toast.show(`${no} reported lost · badge access deactivated`);
  }
  protected deactivate(a: ActRow) { this.menu.set(null); this.st.patchA(a.id, { status: 'Expired' }); this.st.dLost.update((n) => n + 1); this.toast.show(`${a.badgeNo} deactivated`); }
  protected reactivate(a: ActRow) {
    this.menu.set(null);
    this.st.patchA(a.id, { status: 'Active', returned: '—' });
    if (a.status === 'Returned') this.st.dReturned.update((n) => n - 1); else this.st.dLost.update((n) => n - 1);
    this.toast.show(`${a.badgeNo} reactivated`);
  }
  protected reprint(r: QueueRow) { this.menu.set(null); this.st.patchQ(r.id, { status: 'Awaiting Print', at: this.vm.now() }); this.select(r.id); this.toast.show(`${r.badgeNo} re-queued for printing`); }
  protected reprintAct(a: ActRow) {
    this.menu.set(null);
    const q = this.qByBadge(a.badgeNo);
    if (q) { this.reprint(q); return; }
    const v = this.vm.byName(a.name);
    const id = this.st.addQ({ name: a.name, company: v?.company.split(' ').slice(0, 2).join(' ') ?? '—', companyFull: v?.company ?? '—', type: a.type, host: a.by, site: v?.site ?? SITES[0], at: this.vm.now(), status: 'Awaiting Print', badgeNo: a.badgeNo, areas: v?.areas ?? ['Main Entrance'], validFrom: 630, validTo: 750, template: tplFor(a.type, this.st.templates()).id });
    this.select(id);
    this.toast.show(`${a.badgeNo} added to the print queue`);
  }
  protected remove(r: QueueRow) {
    this.menu.set(null);
    this.st.queue.update((l) => l.filter((x) => x.id !== r.id));
    if (this.selId() === r.id) this.selId.set(this.st.queue()[0]?.id ?? null);
    this.toast.show(`${r.name} removed from the print queue`);
  }
  protected clearPrinted() {
    this.menu.set(null);
    const n = this.st.queue().filter((r) => r.status === 'Printed').length;
    this.st.queue.update((l) => l.filter((r) => r.status !== 'Printed'));
    if (!this.sel()) this.selId.set(this.st.queue()[0]?.id ?? null);
    this.toast.show(n ? `${n} printed job(s) cleared` : 'No printed jobs to clear');
  }

  // ---------- new badge ----------
  protected openNew() { this.newOpen.set(true); }
  protected addNew(vid: string, type: string, tpl: string, now: boolean) {
    const v = this.vm.byId(vid);
    if (!v) { this.toast.show('Select a visitor'); return; }
    const id = this.st.addQ({ name: v.name, company: v.company.split(' ').slice(0, 2).join(' '), companyFull: v.company, type, host: v.host, site: v.site, at: this.vm.now(), status: 'Awaiting Print', badgeNo: v.badge || v.id, areas: [...v.areas], validFrom: v.arrival, validTo: v.departure, template: tpl });
    this.newOpen.set(false);
    this.select(id);
    this.setTab('All Badges');
    if (now) this.print(false); else this.toast.show(`${v.name} added to the print queue`);
  }

  // ---------- edit badge ----------
  protected openEdit(r: QueueRow) { this.err.set(''); this.edit.set({ ...r, areas: [...r.areas] }); this.menu.set(null); }
  protected patchEdit<K extends keyof QueueRow>(k: K, v: QueueRow[K]) { this.edit.update((e) => (e ? { ...e, [k]: v } : e)); }
  protected flipArea(a: string) { this.edit.update((e) => (e ? { ...e, areas: e.areas.includes(a) ? e.areas.filter((x) => x !== a) : [...e.areas, a] } : e)); }
  protected saveEdit() {
    const e = this.edit(); if (!e) return;
    if (!e.areas.length) { this.err.set('Select at least one access area.'); return; }
    if (e.validTo <= e.validFrom) { this.err.set('“Valid to” must be after “Valid from”.'); return; }
    this.st.patchQ(e.id, { type: e.type, template: e.template, host: e.host, site: e.site, validFrom: e.validFrom, validTo: e.validTo, areas: e.areas });
    this.edit.set(null); this.select(e.id);
    this.toast.show(`Badge ${e.badgeNo} updated`);
  }

  // ---------- templates ----------
  protected applyTpl(t: BadgeTpl) {
    const s = this.sel(); if (!s) { this.toast.show('Select a badge first'); return; }
    this.st.patchQ(s.id, { template: t.id, type: t.type });
    this.toast.show(`${t.name} template applied to ${s.name}`);
  }
  protected openTpl(t: BadgeTpl | null) {
    this.err.set('');
    this.isNewTpl.set(!t);
    this.tplEdit.set(t ? { ...t } : { id: '', name: '', desc: '', band: 'VISITOR', color: COLORS[3], type: BADGE_TYPE_LIST[0], photo: true, qr: true, host: true, expiry: 1 });
  }
  protected patchTpl<K extends keyof BadgeTpl>(k: K, v: BadgeTpl[K]) { this.tplEdit.update((t) => (t ? { ...t, [k]: v } : t)); }
  protected saveTpl() {
    const t = this.tplEdit(); if (!t) return;
    if (!t.name.trim() || !t.band.trim()) { this.err.set('Template name and band label are required.'); return; }
    if (this.isNewTpl()) { const id = `T${Date.now() % 100000}`; this.st.templates.update((l) => [...l, { ...t, id }]); this.toast.show(`Template “${t.name}” created`); }
    else { this.st.templates.update((l) => l.map((x) => (x.id === t.id ? t : x))); this.toast.show(`“${t.name}” design saved`); }
    this.tplEdit.set(null);
  }
  protected dupTpl(t: BadgeTpl) { this.st.templates.update((l) => [...l, { ...t, id: `T${Date.now() % 100000}`, name: `${t.name} (copy)` }]); this.toast.show(`${t.name} duplicated`); }
  protected delTpl(t: BadgeTpl) {
    if (this.st.templates().length <= 1) { this.toast.show('At least one template is required'); return; }
    if (this.usage(t.id)) { this.toast.show(`${t.name} is used by ${this.usage(t.id)} badge(s) in the queue`); return; }
    this.st.templates.update((l) => l.filter((x) => x.id !== t.id));
    this.toast.show(`${t.name} deleted`);
  }

  // ---------- activity edit ----------
  protected patchAct<K extends keyof ActRow>(k: K, v: ActRow[K]) { this.editAct.update((a) => (a ? { ...a, [k]: v } : a)); }
  protected saveAct() {
    const a = this.editAct(); if (!a) return;
    const old = this.st.activity().find((x) => x.id === a.id)!;
    this.st.patchA(a.id, { status: a.status, type: a.type, by: a.by, returned: a.status === 'Returned' && old.returned === '—' ? NOW_STAMP : a.status === 'Active' ? '—' : old.returned });
    this.editAct.set(null);
    this.toast.show(`${a.badgeNo} updated`);
  }

  protected exportCsv() {
    downloadCsv('visitor-badges.csv', [
      ['Section', 'Visitor', 'Company', 'Badge No.', 'Badge Type', 'Host / Issued By', 'Site', 'Status', 'Issued At', 'Returned At'],
      ...this.qRows().map((r) => ['Print Queue', r.name, r.companyFull, r.badgeNo, r.type, r.host, r.site, r.status, '', '']),
      ...this.aRows().map((a) => ['Activity', a.name, '', a.badgeNo, a.type, a.by, '', a.status, a.issued, a.returned]),
    ]);
    this.toast.show(`Exported ${this.qRows().length + this.aRows().length} badge records`);
  }
}
