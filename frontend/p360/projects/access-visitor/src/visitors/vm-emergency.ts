import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { VmEMusterMap } from './vm-emergency-map';
import { AccRow, AccStatus, LOG_SEED, LogRow, MUSTERS, Muster, NOW, RESPONSE_TEAM, ZONES, seedRows } from './vm-emergency.data';
import { VM_UI } from './vm-ui';
import { HOSTS, SITES, VISITOR_TYPES, VmStore, hm, hostOf } from './vm.data';

const TABS = ['Live Accountability', 'Muster Points', 'Unaccounted', 'Incident Log'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = { 'Live Accountability': 'users', 'Muster Points': 'map-pin', Unaccounted: 'triangle-alert', 'Incident Log': 'file-text' };
const LOG_ICON: Record<LogRow['kind'], [string, string]> = {
  fire: ['flame', 'var(--ka-ef4444)'], start: ['play', 'var(--ka-7c3aed)'], muster: ['shield-check', 'var(--ka-16a34a)'], security: ['user', 'var(--ka-f59e0b)'], scan: ['id-card', 'var(--ka-2563eb)'],
  broadcast: ['megaphone', 'var(--ka-7c3aed)'], accounted: ['vm-c-check-circle', 'var(--ka-16a34a)'], escalate: ['triangle-alert', 'var(--ka-dc2626)'], clear: ['shield-check', 'var(--ka-16a34a)'],
};
const TEMPLATES: Record<string, string> = {
  Evacuate: 'EMERGENCY: Fire alarm at Main Campus – Tower A. Leave the building by the nearest exit and proceed to your assigned muster point. Do not use lifts.',
  'Report to Muster Point': 'Please report to your assigned muster point now and scan your visitor badge with the fire warden.',
  'Shelter in Place': 'Remain where you are, close doors and await further instructions from security staff.',
  'All Clear': 'ALL CLEAR: The incident at Main Campus – Tower A is resolved. You may return to the building with your host.',
};

@Component({
  selector: 'app-vm-emergency',
  imports: [...UI, ...VM_UI, RouterLink, VmEMusterMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page em">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Emergency Visitor Accountability</b></nav>
          <h1>Emergency Visitor Accountability</h1>
          <p>Account for every visitor, host, and escort during an emergency.</p>
        </div>
      </div>

      <section class="banner" [class.clear]="resolved()">
        <app-icon [name]="resolved() ? 'shield-check' : 'flame'" [size]="30" [stroke]="2.2" />
        <b class="bt">{{ resolved() ? 'INCIDENT RESOLVED' : 'ACTIVE INCIDENT' }}</b><span class="bd">·</span><b class="bn">Fire Alarm – Main Campus</b>
        <span class="bsep"></span><app-icon name="calendar-days" [size]="18" /><span>10:24 AM</span>
        <span class="bsep"></span><app-icon name="map-pin" [size]="18" /><span>Main Campus – Tower A</span>
        <span class="bsp"></span>
        <button class="bb main" [class.run]="running()" [disabled]="resolved()" (click)="toggleRun()"><app-icon [name]="running() ? 'pause' : 'play'" [size]="16" />{{ running() ? 'Pause Roll-Call' : 'Start Accountability' }}</button>
        <button class="bb" (click)="openBroadcast()"><app-icon name="megaphone" [size]="18" />Broadcast Alert</button>
        <button class="bb" (click)="detailsOpen.set(true)"><app-icon name="vm-a-info" [size]="18" />Incident Details</button>
      </section>

      <section class="vm-kpis">
        <vm-kpi label="Visitors On-Site" [value]="rows().length" icon="users" color="var(--ka-7c3aed)" [clickable]="true" (pick)="setTab('Live Accountability')" />
        <vm-kpi label="Accounted For" [value]="accounted()" icon="vm-c-check-circle" color="var(--ka-16a34a)" [clickable]="true" [active]="statusF() === 'Accounted'" (pick)="quickStatus('Accounted')" />
        <vm-kpi label="Unaccounted" [value]="unaccounted().length" icon="triangle-alert" color="var(--ka-dc2626)" [clickable]="true" [active]="tab() === 'Unaccounted'" (pick)="setTab('Unaccounted')" />
        <vm-kpi label="At Muster Point" [value]="atMuster()" icon="map-pin" color="var(--ka-2563eb)" [clickable]="true" [active]="tab() === 'Muster Points'" (pick)="setTab('Muster Points')" />
      </section>

      <div class="prog"><b>{{ pct() }}% accounted for</b><div class="pbar"><i [style.width.%]="pct()"></i></div><span>{{ accounted() }} of {{ rows().length }} visitors</span></div>

      <div class="bar">
        <div class="tabs">
          @for (t of tabs; track t) {
            <button [class.on]="tab() === t" (click)="setTab(t)"><app-icon [name]="tabIcon[t]" [size]="17" />{{ t }}</button>
          }
        </div>
        <label class="vm-search"><app-icon name="search" [size]="15" /><input placeholder="Search visitor, host, badge..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="vm-filter"><app-icon name="building" [size]="15" /><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="layers" [size]="15" /><span>Zone:</span><select [value]="zone()" (change)="zone.set($any($event.target).value)"><option value="">All Zones</option>@for (z of zones; track z) {<option [value]="z">{{ z }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="user" [size]="15" /><span>Type:</span><select [value]="vtype()" (change)="vtype.set($any($event.target).value)"><option value="">All</option>@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
        <label class="vm-filter"><app-icon name="vm-c-check-circle" [size]="15" /><span>Status:</span><select [value]="statusF()" (change)="statusF.set($any($event.target).value)"><option value="">All</option><option>Accounted</option><option>At Muster Point</option><option>Unaccounted</option></select></label>
        <button class="vm-icon-btn" [class.spin]="spinning()" title="Reset filters &amp; refresh" (click)="refresh()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="grid">
        <div class="lcol">
          <div class="vm-card list">
            <div class="vm-card-head"><h2><app-icon name="users" [size]="22" />Visitor Accountability List</h2>
              @if (musterF()) {<span class="vm-chip">{{ musterName(musterF()) }}<button (click)="musterF.set('')">×</button></span>}
              @if (zone()) {<span class="vm-chip">{{ zone() }}<button (click)="zone.set('')">×</button></span>}
              <span class="spacer"></span><small class="cnt">{{ list().length }} visitor{{ list().length === 1 ? '' : 's' }}</small>
            </div>
            <div class="tbl">
              <table class="vm-table">
                <thead><tr><th>Visitor</th><th>Company</th><th>Host / Escort</th><th>Last Known Location</th><th>Badge</th><th>Status</th><th>Time Since Seen</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (r of list(); track r.id) {
                    <tr [class.flash]="flashId() === r.id">
                      <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="24" />{{ r.name }}</div></td>
                      <td>{{ r.company }}</td>
                      <td><span class="ic"><app-icon name="user" [size]="13" />{{ r.host }}</span></td>
                      <td class="w"><span class="ic" [class.red]="r.location === 'Restricted Zone'"><app-icon [name]="r.location === 'Restricted Zone' ? 'triangle-alert' : 'map-pin'" [size]="14" />{{ r.location }}</span></td>
                      <td>{{ r.id }}</td>
                      <td><vm-status [label]="r.status" [tone]="tone(r.status)" [icon]="sIcon(r.status)" /></td>
                      <td>{{ ago(r) }}</td>
                      <td><div class="acts">
                        <button class="vm-mini" (click)="locate(r)"><app-icon name="map-pin" [size]="11" />Locate</button>
                        <button class="vm-mini" (click)="callHost(r)"><app-icon name="phone" [size]="11" />Call Host</button>
                        <button class="vm-mini" [disabled]="r.status !== 'Unaccounted'" (click)="markAccounted(r)"><app-icon name="vm-c-check" [size]="11" />Mark Accounted</button>
                      </div></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="vm-empty">@if (tab() === 'Unaccounted' && !unaccounted().length) {All visitors are accounted for.} @else {No visitors match these filters.} <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="vm-card unacc">
            <div class="vm-card-head"><h2><app-icon name="triangle-alert" [size]="24" />Unaccounted Visitors ({{ unaccounted().length }})</h2><span class="spacer"></span>
              <button class="notify" (click)="notifySecurity()"><app-icon name="users" [size]="17" />Notify Security Team</button>
              @if (unaccounted().length > 3) {<button class="more" (click)="expanded.set(!expanded())">{{ expanded() ? 'Show less' : '+' + (unaccounted().length - 3) + ' more' }}</button>}
            </div>
            <div class="tbl u">
              <table class="vm-table">
                <thead><tr><th>Visitor</th><th>Company</th><th>Last Known Location</th><th>Last Seen</th><th>Host / Escort</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (r of unShown(); track r.id) {
                    <tr>
                      <td><div class="vm-person"><vm-avatar [name]="r.name" [size]="28" />{{ r.name }}</div></td>
                      <td>{{ r.company }}</td>
                      <td><span class="ic" [class.red]="r.location === 'Restricted Zone'"><app-icon [name]="r.location === 'Restricted Zone' ? 'triangle-alert' : 'map-pin'" [size]="14" />{{ r.location }}</span></td>
                      <td><span class="ic"><app-icon name="calendar-days" [size]="14" />Today, {{ lastSeen(r) }}</span></td>
                      <td><span class="ic"><app-icon name="user" [size]="14" />{{ r.host }}</span></td>
                      <td><div class="acts">
                        <button class="vm-mini" (click)="locate(r)"><app-icon name="map-pin" [size]="12" />Locate</button>
                        <button class="vm-mini" (click)="callHost(r)"><app-icon name="phone" [size]="12" />Call Host</button>
                        <button class="vm-mini red" [class.done]="r.escalated" (click)="escalate(r)"><app-icon name="triangle-alert" [size]="12" />{{ r.escalated ? 'Escalated' : 'Escalate' }}</button>
                      </div></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="vm-empty ok"><app-icon name="vm-c-check-circle" [size]="18" />Every visitor is accounted for.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="vm-card muster">
          <div class="vm-card-head"><h2><app-icon name="map-pin" [size]="22" />Muster Point Status</h2></div>
          <vm-e-muster-map class="mmap" [rows]="rows()" [active]="musterF()" (pick)="pickMuster($event)" (zone)="pickZone($event)" />
          <div class="mlist">
            @for (m of musterStats(); track m.id) {
              <button class="mrow" [class.on]="musterF() === m.id" (click)="pickMuster(m.id)">
                <span class="mic" [style.--c]="m.color"><app-icon name="users" [size]="17" /></span>
                <b>{{ m.name }}</b>
                <span class="mbar"><small>{{ m.total }} visitors · {{ m.acc }} accounted</small><span class="pbar thin"><i [style.width.%]="m.pct" [style.background]="m.color"></i></span></span>
                <span class="mpct" [style.--c]="m.color">{{ m.pct.toFixed(1) }}%</span>
              </button>
            }
          </div>
          <button class="fullmap" (click)="mapOpen.set(true)"><app-icon name="map-floor" [size]="18" />View Full Emergency Map</button>
        </div>
      </div>

      <div class="bottom">
        <div class="vm-card log" [class.flash-card]="logFlash()" #logCard>
          <div class="vm-card-head"><h2><app-icon name="file-text" [size]="22" />Incident Log</h2><span class="spacer"></span><button class="vm-link sm" (click)="exportLog()">Export log</button></div>
          <div class="ltbl" #logBox>
            <table class="vm-table">
              <thead><tr><th class="tl">Time</th><th class="ev2">Event</th><th>Details</th></tr></thead>
              <tbody>
                @for (l of log(); track $index) {
                  <tr>
                    <td class="tl"><span class="dot" [style.--c]="logIcon(l)[1]"></span><b>{{ hm(l.at) }}</b></td>
                    <td><span class="ev" [class.red]="l.kind === 'fire' || l.kind === 'escalate'"><app-icon [name]="logIcon(l)[0]" [size]="15" [style.color]="logIcon(l)[1]" />{{ l.event }}</span></td>
                    <td class="det" [title]="l.details">{{ l.details }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="vm-card pc">
          <h3><app-icon name="user" [size]="20" />Incident Commander</h3>
          <b class="big">Priya Sharma</b>
          <small>Head – Workplace Operations</small>
          <button class="ph" (click)="call('Priya Sharma (Incident Commander)', '+91 98765 43210')"><app-icon name="phone" [size]="16" />+91 98765 43210</button>
        </div>
        <div class="vm-card pc">
          <h3><app-icon name="users" [size]="20" />Response Team</h3>
          <ul>@for (t of team; track t) {<li><button (click)="page(t)" [class.paged]="paged().includes(t)">{{ t }}@if (paged().includes(t)) {<app-icon name="vm-c-check" [size]="12" />}</button></li>}</ul>
        </div>
        <div class="vm-card pc">
          <h3><app-icon name="phone" [size]="20" />Emergency Contact</h3>
          <button class="ph big" (click)="call('Main Campus Emergency Line', '+91 1800 123 4567')"><app-icon name="phone" [size]="16" />+91 1800 123 4567</button>
          <small>Main Campus Emergency Line<br />(24 × 7)</small>
        </div>
      </div>
    </div>

    @if (loc(); as r) {
      <div class="g-overlay" (click)="locId.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Locate – {{ r.name }}</h3><button type="button" class="close-btn" (click)="locId.set(null)">×</button></div>
        <div class="loc">
          <vm-avatar [name]="r.name" [size]="72" [square]="true" />
          <div class="vm-kv">
            <span><app-icon name="id-card" [size]="15" />Badge</span><b>{{ r.id }} · {{ r.company }}</b>
            <span><app-icon name="map-pin" [size]="15" />Last known location</span><b>{{ r.location }} ({{ r.site }})</b>
            <span><app-icon name="clock" [size]="15" />Last badge scan</span><b>Today, {{ lastSeen(r) }} · {{ ago(r) }}</b>
            <span><app-icon name="users" [size]="15" />Assigned muster</span><b>{{ musterName(r.muster) }} ({{ musterArea(r.muster) }})</b>
            <span><app-icon name="user" [size]="15" />Host / escort</span><b>{{ r.host }} · {{ phoneOf(r.host) }}</b>
            <span><app-icon name="shield" [size]="15" />Status</span><b><vm-status [label]="r.status" [tone]="tone(r.status)" [icon]="sIcon(r.status)" /></b>
          </div>
        </div>
        <div class="minimap"><vm-e-muster-map [rows]="locRows()" [big]="true" [active]="r.muster" /></div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="locId.set(null)">Close</button>
          <button class="btn-outline" (click)="dispatch(r)"><app-icon name="shield" [size]="16" />Dispatch Security</button>
          <button class="btn-primary" [disabled]="r.status !== 'Unaccounted'" (click)="markAccounted(r); locId.set(null)"><app-icon name="vm-c-check" [size]="16" />Mark Accounted</button>
        </div>
      </div>
    }

    @if (broadcastOpen()) {
      <div class="g-overlay" (click)="broadcastOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendBroadcast()">
        <div class="modal-head"><h3>Broadcast Alert</h3><button type="button" class="close-btn" (click)="broadcastOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label>Template<select class="input" [value]="tpl()" (change)="pickTpl($any($event.target).value)">@for (t of tplNames; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Audience<select class="input" [value]="aud()" (change)="aud.set($any($event.target).value)">
            <option value="all">All on-site visitors ({{ rows().length }})</option><option value="un">Unaccounted visitors ({{ unaccounted().length }})</option><option value="hosts">Hosts &amp; escorts of unaccounted</option></select></label>
          <label class="full">Message<textarea class="input ta" rows="4" [value]="bmsg()" (input)="bmsg.set($any($event.target).value)"></textarea></label>
        </div>
        <div class="chans">@for (c of channels; track c) {<label class="vm-radio" [class.on]="chan().includes(c)"><input type="checkbox" hidden [checked]="chan().includes(c)" (change)="flipChan(c)" /><i></i>{{ c }}</label>}</div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="broadcastOpen.set(false)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!chan().length || !bmsg().trim()"><app-icon name="megaphone" [size]="16" />Send Broadcast</button></div>
      </form>
    }

    @if (detailsOpen()) {
      <div class="g-overlay" (click)="detailsOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Incident Details</h3><button type="button" class="close-btn" (click)="detailsOpen.set(false)">×</button></div>
        <div class="vm-kv">
          <span>Incident ID</span><b>INC-2026-1015-01</b>
          <span>Type</span><b>Fire Alarm (automatic detector, Zone 3F-East)</b>
          <span>Triggered</span><b>Wed, 15 Oct 2026 · 10:24 AM</b>
          <span>Location</span><b>Main Campus – Tower A</b>
          <span>Commander</span><b>Priya Sharma · +91 98765 43210</b>
          <span>Status</span><b><vm-status [label]="resolved() ? 'Resolved' : 'Active'" [tone]="resolved() ? 'green' : 'red'" /></b>
          <span>Accountability</span><b>{{ accounted() }} of {{ rows().length }} accounted ({{ pct() }}%) · {{ atMuster() }} at muster points</b>
          <span>Escalations</span><b>{{ escalatedCount() }} visitor(s) escalated to security</b>
          <span>Broadcasts sent</span><b>{{ broadcasts() }}</b>
        </div>
        @if (!resolved() && unaccounted().length) {<p class="warn"><app-icon name="triangle-alert" [size]="15" />{{ unaccounted().length }} visitor(s) are still unaccounted. Declaring all clear will close the roll-call.</p>}
        <div class="form-actions">
          <button class="btn-ghost" (click)="exportReport()"><app-icon name="download" [size]="16" />Export Report</button>
          @if (resolved()) {<button class="btn-outline" (click)="reopen()">Re-open Incident</button>}
          @else {<button class="btn-primary green" (click)="allClear()"><app-icon name="shield-check" [size]="16" />Declare All Clear</button>}
        </div>
      </div>
    }

    @if (mapOpen()) {
      <div class="g-overlay" (click)="mapOpen.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Emergency Map – Main Campus – Tower A</h3><button type="button" class="close-btn" (click)="mapOpen.set(false)">×</button></div>
        <div class="bigmap"><vm-e-muster-map [rows]="rows()" [big]="true" [active]="musterF()" (pick)="pickMuster($event); mapOpen.set(false)" (zone)="pickZone($event); mapOpen.set(false)" /></div>
        <div class="legend"><span><i class="g"></i>Muster point (click to filter)</span><span><i class="r"></i>Unaccounted visitors by last known zone</span><span><i class="h"></i>Fire / restricted zone</span><span><i class="d"></i>Evacuation route</span></div>
      </div>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text); margin-bottom: 2px; }
    .crumb a { color: var(--text); text-decoration: none; } .crumb b { font-weight: 600; }
    .em { gap: 10px; }
    .banner { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 14px; min-width: 0; border-radius: 12px; color: var(--kf-ffffff); background: linear-gradient(90deg, var(--kb-dc2626), var(--kb-e11d48) 60%, var(--kb-dc2626)); box-shadow: 0 4px 14px rgba(220, 38, 38, .3); font-size: 14px; white-space: nowrap; }
    .banner.clear { background: linear-gradient(90deg, var(--kb-15803d), var(--kb-16a34a)); box-shadow: 0 4px 14px rgba(22, 163, 74, .3); }
    .bt { font-size: 17px; font-weight: 800; letter-spacing: .01em; } .bd { font-weight: 800; } .bn { font-size: 16px; font-weight: 700; }
    .bsep { width: 1px; height: 22px; background: rgba(255,255,255,.55); margin: 0 2px; }
    .bsp { flex: 1; }
    .bb { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 11px; border-radius: 8px; border: 1px solid var(--kl-ffffff); background: var(--kb-ffffff); color: var(--kf-7c3aed); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
    .bb:hover { background: var(--kb-f5f0ff); }
    .bb.main { background: var(--kb-6d28d9); color: var(--kf-ffffff); border-color: var(--kl-c4b5fd); } .bb.main:hover { background: var(--kb-5b21b6); }
    .bb.main.run { background: var(--kb-fff7ed); color: var(--kf-c2410c); border-color: var(--kl-fdba74); }
    .bb[disabled] { opacity: .6; cursor: not-allowed; }
    .vm-kpis { gap: 10px; }
    :host ::ng-deep .vm-kpi { padding: 8px 14px; gap: 14px; }
    :host ::ng-deep .vm-kpi-ic { width: 54px; height: 54px; }
    :host ::ng-deep .vm-kpi-label { font-size: 16px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .prog { display: flex; align-items: center; gap: 14px; font-size: 16px; padding: 0 4px; }
    .prog b { white-space: nowrap; } .prog > span { white-space: nowrap; font-size: 15px; }
    .pbar { flex: 1; height: 14px; border-radius: 10px; background: var(--kb-e5e7eb); overflow: hidden; display: block; }
    .pbar i { display: block; height: 100%; border-radius: 10px; background: linear-gradient(90deg, var(--kb-16a34a), var(--kb-22c55e)); transition: width .5s; }
    .pbar.thin { height: 8px; }
    .bar { display: flex; align-items: center; gap: 5px; min-width: 0; }
    .tabs { display: flex; gap: 4px; flex: none; }
    .tabs button { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 8px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text); white-space: nowrap; }
    .tabs button:hover { border-color: var(--kl-c4b5fd); }
    .tabs button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); font-weight: 600; box-shadow: 0 2px 8px rgba(124,58,237,.3); }
    .tabs button:not(.on):nth-child(3) app-icon { color: var(--kf-dc2626); } .tabs button:not(.on) app-icon { color: var(--primary); }
    .bar .vm-search { min-width: 90px; height: 34px; padding: 0 7px; } .bar .vm-search input { font-size: 12px; }
    .bar .vm-filter { height: 34px; font-size: 11.5px; padding: 0 5px; gap: 3px; min-width: 0; }
    .bar .vm-filter select { font-size: 11.5px; max-width: 64px; } .bar .vm-filter > span { font-weight: 600; }
    .bar .vm-icon-btn { width: 34px; height: 34px; } .spin app-icon { animation: sp .7s linear; } @keyframes sp { to { transform: rotate(360deg); } }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 346px; gap: 12px; align-items: start; }
    .lcol { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .vm-card { padding: 10px 12px; }
    .vm-card-head { margin-bottom: 6px; gap: 8px; }
    .vm-card-head h2 { font-size: 18px; }
    .cnt { color: var(--muted); font-size: 12px; }
    .tbl { overflow-y: auto; overflow-x: hidden; max-height: 214px; }
    .tbl.u { max-height: 260px; }
    .vm-table th { font-size: 11.5px; padding: 5px 4px; white-space: normal; line-height: 1.15; position: sticky; top: 0; z-index: 1; background: var(--kb-f1eeff); }
    .vm-table td { font-size: 11px; padding: 3px 3px; white-space: nowrap; height: 34px; }
    .vm-table td.w { white-space: normal; line-height: 1.15; max-width: 112px; }
    .list .vm-table th:first-child, .list .vm-table td:first-child { padding-left: 6px; }
    .vm-person { gap: 5px; font-size: 11.5px; }
    .ic { display: inline-flex; align-items: center; gap: 5px; } .ic app-icon { color: var(--kf-334155); flex: none; }
    .ic.red app-icon { color: var(--kf-dc2626); }
    .vm-table :is(vm-status) { font-size: 10.5px; padding: 2px 5px; gap: 3px; }
    .acts { display: flex; gap: 3px; }
    .acts { gap: 2px; } .acts .vm-mini { padding: 2px 3px; font-size: 9.5px; font-weight: 500; border-radius: 5px; gap: 1px; }
    .vm-mini[disabled] { opacity: .4; cursor: default; }
    .vm-mini.done { background: var(--kb-fee2e2); }
    tr.flash td { animation: fl 1.6s; } @keyframes fl { 0%, 40% { background: var(--kb-dcfce7); } }
    .unacc { border-color: var(--kl-fecaca); background: linear-gradient(180deg, var(--kb-fff5f5), var(--kb-ffffff) 60%); }
    .unacc h2, .unacc h2 app-icon { color: var(--kf-dc2626); font-size: 20px; }
    .unacc .vm-table th { background: var(--kb-fde8e8); }
    .unacc .acts .vm-mini { font-size: 11px; padding: 3px 6px; }
    .notify { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 14px; border: 0; border-radius: 7px; background: var(--kb-dc2626); color: var(--kf-ffffff); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; } .notify:hover { background: var(--kb-b91c1c); }
    .more { height: 28px; padding: 0 12px; border: 1px solid var(--kl-fca5a5); border-radius: 14px; background: var(--kb-ffffff); color: var(--kf-b91c1c); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .vm-empty.ok { color: var(--kf-15803d); display: flex; justify-content: center; gap: 8px; align-items: center; }
    .muster { display: flex; flex-direction: column; gap: 8px; }
    .mmap { aspect-ratio: 480 / 190; border: 1px solid var(--kl-ece9fb); border-radius: 8px; overflow: hidden; }
    .mlist { display: flex; flex-direction: column; gap: 4px; }
    .mrow { display: grid; grid-template-columns: 26px auto minmax(0, 1fr) 46px; align-items: center; gap: 4px; border: 1px solid transparent; background: none; border-radius: 8px; padding: 4px; font: inherit; text-align: left; cursor: pointer; color: var(--text); }
    .mrow:hover { background: var(--kb-faf8ff); } .mrow.on { border-color: var(--kl-c4b5fd); background: var(--kb-f5f0ff); }
    .mrow b { font-size: 12.5px; white-space: nowrap; }
    .mic { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, var(--kb-ffffff)); }
    .mbar { display: flex; flex-direction: column; gap: 4px; } .mbar small { font-size: 10.5px; white-space: nowrap; letter-spacing: -.1px; }
    .mpct { justify-self: end; padding: 3px 5px; border-radius: 7px; font-weight: 700; font-size: 13px; color: color-mix(in srgb, var(--c) 80%, var(--kf-000000)); background: color-mix(in srgb, var(--c) 14%, var(--kb-ffffff)); }
    .fullmap { display: flex; align-items: center; justify-content: center; gap: 10px; height: 36px; border: 1.5px solid var(--kl-8b5cf6); border-radius: 9px; background: var(--kb-ffffff); color: var(--primary); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; } .fullmap:hover { background: var(--kb-f5f0ff); }
    .bottom { display: grid; grid-template-columns: minmax(0, 1fr) 186px 178px 186px; gap: 10px; align-items: stretch; }
    .log .vm-card-head { margin-bottom: 4px; } .sm { font-size: 12.5px; }
    .ltbl { max-height: 150px; overflow-y: auto; overflow-x: hidden; }
    .log .vm-table td { padding: 3px 5px; border-bottom: 0; height: auto; }
    .log table { table-layout: fixed; } .log td { overflow: hidden; text-overflow: ellipsis; } .log td.det { font-size: 11.5px; } .log th.ev2 { width: 215px; }
    .tl { width: 80px; } td.tl b { margin-left: 8px; }
    .dot { display: inline-block; vertical-align: -1px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--c); background: var(--kb-ffffff); flex: none; }
    .ev { display: inline-flex; align-items: center; gap: 7px; } .ev.red { color: var(--kf-dc2626); }
    .flash-card { animation: fc 1.4s; } @keyframes fc { 0%, 50% { box-shadow: 0 0 0 3px var(--kb-a78bfa); } }
    .pc { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; }
    .pc h3 { white-space: nowrap; margin: 0 0 4px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; } .pc h3 app-icon { color: var(--primary); }
    .pc .big { font-size: 16px; } .pc small { font-size: 12.5px; color: var(--kf-475569); }
    .ph { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 4px 0; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--text); } .ph app-icon { color: var(--primary); } .ph:hover { color: var(--primary); }
    .ph { white-space: nowrap; } .ph.big { font-size: 14.5px; }
    .pc ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 2px; } .pc li::marker { color: var(--kf-16a34a); }
    .pc li button { white-space: nowrap; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--text); display: inline-flex; align-items: center; gap: 4px; } .pc li button:hover { color: var(--primary); }
    .pc li button.paged { color: var(--kf-15803d); font-weight: 600; }
    .loc { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
    .minimap { aspect-ratio: 480 / 190; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .bigmap { aspect-ratio: 480 / 190; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
    .legend .g { background: var(--kb-16a34a); } .legend .r { background: var(--kb-dc2626); border-radius: 50%; } .legend .h { background: repeating-linear-gradient(45deg, var(--kb-fee2e2) 0 3px, var(--kb-f87171) 3px 5px); } .legend .d { border-top: 2px dashed var(--kl-16a34a); height: 0; border-radius: 0; }
    .chans { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; } .chans .vm-radio { height: 34px; }
    .ta { resize: vertical; font: inherit; }
    .warn { display: flex; align-items: center; gap: 8px; color: var(--kf-b45309); background: var(--kb-fffbeb); border: 1px solid var(--kl-fde68a); border-radius: 8px; padding: 8px 10px; font-size: 13px; margin: 12px 0 0; }
    .btn-primary.green { background: var(--kb-16a34a); border-color: var(--kl-16a34a); }
    .form-actions button { display: inline-flex; align-items: center; gap: 6px; }
  `,
})
export class EmergencyAccountability {
  private readonly store = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly hm = hm;
  protected readonly tabs = TABS;
  protected readonly tabIcon = TAB_ICON;
  protected readonly sites = SITES;
  protected readonly zones = ZONES;
  protected readonly types = VISITOR_TYPES;
  protected readonly team = RESPONSE_TEAM;
  protected readonly channels = ['SMS', 'Email', 'Push', 'PA System', 'Teams'];
  protected readonly tplNames = Object.keys(TEMPLATES);

  protected readonly rows = signal<AccRow[]>(seedRows());
  protected readonly log = signal<LogRow[]>([...LOG_SEED].reverse());
  protected readonly tab = signal<Tab>('Live Accountability');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly zone = signal('');
  protected readonly vtype = signal('');
  protected readonly statusF = signal<string>('');
  protected readonly musterF = signal<Muster | ''>('');
  protected readonly expanded = signal(false);
  protected readonly spinning = signal(false);
  protected readonly running = signal(false);
  protected readonly resolved = signal(false);
  protected readonly flashId = signal<string | null>(null);
  protected readonly logFlash = signal(false);
  protected readonly locId = signal<string | null>(null);
  protected readonly broadcastOpen = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly mapOpen = signal(false);
  protected readonly tpl = signal('Report to Muster Point');
  protected readonly aud = signal('un');
  protected readonly bmsg = signal(TEMPLATES['Report to Muster Point']);
  protected readonly chan = signal<string[]>(['SMS', 'Push', 'PA System']);
  protected readonly broadcasts = signal(0);
  protected readonly paged = signal<string[]>(['Security Operations']);
  protected readonly msg = signal<string | null>(null);
  private readonly logBox = viewChild<ElementRef<HTMLElement>>('logBox');
  private readonly logCard = viewChild<ElementRef<HTMLElement>>('logCard');
  private clock = 633;
  private timer: ReturnType<typeof setInterval> | null = null;
  private toastT: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.timer) clearInterval(this.timer); clearTimeout(this.toastT); });
  }

  protected readonly accounted = computed(() => this.rows().filter((r) => r.status !== 'Unaccounted').length);
  protected readonly atMuster = computed(() => this.rows().filter((r) => r.status === 'At Muster Point').length);
  protected readonly unaccounted = computed(() => this.rows().filter((r) => r.status === 'Unaccounted'));
  protected readonly unShown = computed(() => (this.expanded() ? this.unaccounted() : this.unaccounted().slice(0, 3)));
  protected readonly escalatedCount = computed(() => this.rows().filter((r) => r.escalated).length);
  protected readonly pct = computed(() => +((this.accounted() / this.rows().length) * 100).toFixed(1));
  protected readonly musterStats = computed(() =>
    MUSTERS.map((m) => {
      const l = this.rows().filter((r) => r.muster === m.id);
      const acc = l.filter((r) => r.status !== 'Unaccounted').length;
      const pct = l.length ? (acc / l.length) * 100 : 100;
      return { ...m, total: l.length, acc, pct, color: pct >= 80 ? 'var(--ka-16a34a)' : 'var(--ka-f97316)' };
    }),
  );
  protected readonly list = computed(() => {
    const t = this.tab(), q = this.q().trim().toLowerCase(), s = this.site(), z = this.zone(), ty = this.vtype(), st = this.statusF(), m = this.musterF();
    let l = this.rows();
    if (t === 'Unaccounted') l = l.filter((r) => r.status === 'Unaccounted');
    if (t === 'Muster Points') l = l.filter((r) => r.status === 'At Muster Point');
    if (q) l = l.filter((r) => `${r.name} ${r.company} ${r.host} ${r.id} ${r.location}`.toLowerCase().includes(q));
    if (s) l = l.filter((r) => r.site === s);
    if (z) l = l.filter((r) => r.location === z || r.location.startsWith(z));
    if (ty) l = l.filter((r) => r.type === ty);
    if (st) l = l.filter((r) => r.status === st);
    if (m) l = l.filter((r) => r.muster === m);
    return l;
  });
  protected readonly loc = computed(() => this.rows().find((r) => r.id === this.locId()) ?? null);
  protected readonly locRows = computed(() => { const r = this.loc(); return r ? this.rows().map((x) => (x.id === r.id ? x : { ...x, status: 'Accounted' as AccStatus })) : []; });

  protected tone(s: AccStatus): 'green' | 'blue' | 'red' { return s === 'Accounted' ? 'green' : s === 'At Muster Point' ? 'blue' : 'red'; }
  protected sIcon(s: AccStatus) { return s === 'Accounted' ? 'vm-c-check-circle' : s === 'At Muster Point' ? 'map-pin' : 'triangle-alert'; }
  protected logIcon(l: LogRow) { return LOG_ICON[l.kind]; }
  protected ago(r: AccRow) { return r.ago === 0 ? 'Just now' : `${r.ago} min ago`; }
  protected lastSeen(r: AccRow) { return hm(NOW - r.ago); }
  protected musterName(m: Muster | '') { return MUSTERS.find((x) => x.id === m)?.name ?? ''; }
  protected musterArea(m: Muster) { return MUSTERS.find((x) => x.id === m)!.area; }
  protected phoneOf(n: string) { return HOSTS.some((h) => h.name === n) ? hostOf(n).phone : '+91 98000 00000'; }

  protected setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'Live Accountability') { this.statusF.set(''); this.musterF.set(''); }
    if (t === 'Incident Log') {
      this.logCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.logFlash.set(false); setTimeout(() => this.logFlash.set(true)); setTimeout(() => this.logFlash.set(false), 1500);
    }
  }
  protected quickStatus(s: AccStatus) { this.tab.set('Live Accountability'); this.statusF.set(this.statusF() === s ? '' : s); }
  protected pickMuster(m: Muster) { this.musterF.set(this.musterF() === m ? '' : m); if (this.tab() !== 'Muster Points') this.tab.set('Live Accountability'); }
  protected pickZone(z: string) { this.zone.set(z); this.tab.set('Live Accountability'); this.toast(`Showing visitors last seen in ${z}`); }
  protected refresh() {
    this.q.set(''); this.site.set(''); this.zone.set(''); this.vtype.set(''); this.statusF.set(''); this.musterF.set('');
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast(`Roll-call refreshed · ${this.accounted()} of ${this.rows().length} accounted`);
  }
  protected closeAll() { this.locId.set(null); this.broadcastOpen.set(false); this.detailsOpen.set(false); this.mapOpen.set(false); }

  private addLog(event: string, details: string, kind: LogRow['kind']) {
    this.clock = Math.max(this.clock + 1, 633);
    this.log.update((l) => [...l, { at: this.clock, event, details, kind }]);
    setTimeout(() => { const b = this.logBox()?.nativeElement; if (b) b.scrollTop = b.scrollHeight; });
  }
  private patch(id: string, c: Partial<AccRow>) { this.rows.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r))); }

  protected markAccounted(r: AccRow, auto = false) {
    if (r.status !== 'Unaccounted') return;
    this.patch(r.id, { status: 'At Muster Point', ago: 0, escalated: false });
    this.flashId.set(r.id); setTimeout(() => this.flashId.set(null), 1600);
    const mp = this.musterName(r.muster);
    this.addLog(auto ? `Badge scan – ${r.name}` : `${r.name} marked accounted`, `Visitor ${r.name} (${r.id}) ${auto ? 'scanned' : 'confirmed by Priya Sharma'} at ${mp}.`, auto ? 'scan' : 'accounted');
    this.store.log({ text: `${r.name} accounted for at ${mp} (fire alarm roll-call)`, kind: 'alert', visitor: r.id });
    if (!auto) this.toast(`${r.name} marked accounted at ${mp}`);
    if (!this.unaccounted().length) { this.stopRun(); this.toast('All visitors accounted for – roll-call complete'); }
  }
  protected locate(r: AccRow) { this.locId.set(r.id); }
  protected callHost(r: AccRow) {
    this.toast(`Calling ${r.host} (${this.phoneOf(r.host)}) about ${r.name}…`);
    this.addLog(`Host ${r.host} called`, `Host contacted to confirm whereabouts of ${r.name} (${r.id}).`, 'security');
  }
  protected dispatch(r: AccRow) {
    this.addLog('Security dispatched', `Security team dispatched to ${r.location} to locate ${r.name}.`, 'security');
    this.toast(`Security dispatched to ${r.location}`);
    this.locId.set(null);
  }
  protected escalate(r: AccRow) {
    if (r.escalated) { this.toast(`${r.name} is already escalated to security`); return; }
    this.patch(r.id, { escalated: true });
    this.addLog(`${r.name} escalated`, `Unaccounted visitor escalated to Security Operations – last seen ${r.location} at ${this.lastSeen(r)}.`, 'escalate');
    this.store.log({ text: `${r.name} escalated to security (unaccounted in emergency)`, kind: 'alert', visitor: r.id });
    this.toast(`${r.name} escalated to Security Operations`);
  }
  protected notifySecurity() {
    const n = this.unaccounted().length;
    if (!n) { this.toast('No unaccounted visitors to report'); return; }
    this.addLog('Security team notified', `Security operations sent the list of ${n} unaccounted visitor(s) with last known locations.`, 'security');
    this.toast(`Security team notified · ${n} unaccounted visitor(s) shared`);
  }

  protected toggleRun() { this.running() ? this.stopRun(true) : this.startRun(); }
  private startRun() {
    if (!this.unaccounted().length) { this.toast('Everyone is already accounted for'); return; }
    this.running.set(true);
    this.addLog('Live roll-call started', 'Badge readers at all muster points switched to live accountability scanning.', 'start');
    this.toast('Live roll-call started – badge scans at muster points will update counts');
    this.timer = setInterval(() => {
      const l = this.unaccounted();
      if (!l.length) { this.stopRun(); return; }
      const pool = l.filter((r) => !['David Lee', 'Chen Wei', 'Alex Brown'].includes(r.name));
      const pick = (pool.length ? pool : l)[Math.floor(Math.random() * (pool.length || l.length))];
      this.markAccounted(pick, true);
    }, 2200);
  }
  private stopRun(manual = false) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running() && manual) { this.addLog('Roll-call paused', 'Live accountability scanning paused by Priya Sharma.', 'start'); this.toast('Roll-call paused'); }
    this.running.set(false);
  }

  protected openBroadcast() { this.broadcastOpen.set(true); }
  protected pickTpl(t: string) { this.tpl.set(t); this.bmsg.set(TEMPLATES[t]); if (t === 'All Clear') this.aud.set('all'); }
  protected flipChan(c: string) { this.chan.update((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c])); }
  protected sendBroadcast() {
    const n = this.aud() === 'all' ? this.rows().length : this.unaccounted().length;
    const who = this.aud() === 'all' ? `${n} on-site visitors` : this.aud() === 'un' ? `${n} unaccounted visitors` : `hosts & escorts of ${n} unaccounted visitors`;
    this.broadcasts.update((b) => b + 1);
    this.addLog(`Broadcast alert sent (${this.tpl()})`, `Sent via ${this.chan().join(', ')} to ${who}.`, 'broadcast');
    this.store.log({ text: `Emergency broadcast "${this.tpl()}" sent to ${who}`, kind: 'notify' });
    this.broadcastOpen.set(false);
    this.toast(`Broadcast sent to ${who} via ${this.chan().join(', ')}`);
  }
  protected allClear() {
    this.stopRun(); this.resolved.set(true); this.detailsOpen.set(false);
    this.addLog('All clear declared', `Incident closed by Priya Sharma · ${this.accounted()} of ${this.rows().length} visitors accounted.`, 'clear');
    this.store.log({ text: 'Fire alarm incident at Main Campus – Tower A resolved (all clear)', kind: 'system' });
    this.toast('All clear declared – incident resolved');
  }
  protected reopen() { this.resolved.set(false); this.detailsOpen.set(false); this.addLog('Incident re-opened', 'Incident re-opened by Priya Sharma.', 'fire'); this.toast('Incident re-opened'); }
  protected page(t: string) {
    this.paged.update((l) => (l.includes(t) ? l : [...l, t]));
    this.addLog(`${t} paged`, `${t} team paged to report to the incident commander.`, 'security');
    this.toast(`${t} paged`);
  }
  protected call(who: string, n: string) { this.toast(`Calling ${who} · ${n}…`); }
  protected exportReport() {
    downloadCsv('emergency-accountability.csv', [
      ['Badge', 'Visitor', 'Company', 'Host / Escort', 'Visitor Type', 'Site', 'Last Known Location', 'Status', 'Muster Point', 'Last Seen', 'Escalated'],
      ...this.rows().map((r) => [r.id, r.name, r.company, r.host, r.type, r.site, r.location, r.status, this.musterName(r.muster), this.lastSeen(r), r.escalated ? 'Yes' : 'No']),
    ]);
    this.toast(`Exported ${this.rows().length} visitor records`);
  }
  protected exportLog() {
    downloadCsv('incident-log.csv', [['Time', 'Event', 'Details'], ...this.log().map((l) => [hm(l.at), l.event, l.details])]);
    this.toast('Incident log exported');
  }
  protected go(p: string) { this.router.navigate(['/visitor-management', p]); }
  protected toast(m: string) { this.msg.set(m); clearTimeout(this.toastT); this.toastT = setTimeout(() => this.msg.set(null), 2600); }
}
