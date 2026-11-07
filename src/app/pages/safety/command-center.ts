import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { CAMERAS, ENV, FLOORS, H_CATS, H_CAT_COLOR, I_TYPES, Incident, LAST_MONTH_CATS, PStatus, QUARTER_CATS, SafetyStore, SITES, SPerson, TREND, TREND_LABELS, initials, avatarColor, sevTag, stCls } from './safety.data';
import { IncidentDrawer, ReportIncident, SafetyCam, SF_STYLES, SfToast } from './safety-shared';
import { LOC_XY, ROUTES, SafetyMap, SCallout, SMarker } from './safety-map';

const LAYERS = ['People (Live)', 'Incident', 'Hazard', 'Assembly Point', 'Evacuation Route', 'Exit', 'Restricted Zone'] as const;
type Layer = (typeof LAYERS)[number];
const PEOPLE_XY: [number, number][] = [
  [112, 96], [238, 40], [300, 64], [356, 40], [404, 76], [480, 30], [150, 268], [286, 352], [322, 214], [352, 250], [420, 300], [470, 340], [530, 120], [600, 240], [200, 312],
];
const FLOOR_SEEDS: Record<string, number> = { Roof: 2, 'Floor 5': 7, 'Floor 4': 9, 'Floor 3': 11, 'Floor 2': 15, 'Floor 1': 12, 'Ground Floor': 14, Basement: 4 };

@Component({
  selector: 'app-safety-command-center',
  imports: [...UI, RouterLink, SafetyMap, SafetyCam, ReportIncident, IncidentDrawer, SfToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Safety Command Center" parent="Workplace Safety &amp; Wellbeing" parentLink="/safety-wellbeing/safety-command-center" subtitle="Real-time monitoring of people safety, incidents, hazards, environmental conditions and wellbeing across all sites.">
      <button class="btn-red" (click)="report()"><app-icon name="siren" [size]="17" />Report Incident</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb" (click)="toggle('emg')"><app-icon name="locate" [size]="16" />Emergency Actions<app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'emg') {
          <div class="dropdown right">
            <a class="dd-item" routerLink="/emergency-mustering/emergency-command-center"><app-icon name="run" [size]="15" />Trigger Evacuation</a>
            <button class="dd-item" (click)="emg('alarm')"><app-icon name="bell-ring" [size]="15" />Sound Site Alarm</button>
            <button class="dd-item" (click)="emg('lockdown')"><app-icon name="s-lock" [size]="15" />{{ store.lockdown() ? 'Lift Lockdown' : 'Lockdown Production Area' }}</button>
            <button class="dd-item" (click)="emg('broadcast')"><app-icon name="megaphone" [size]="15" />Broadcast Safety Alert</button>
            <button class="dd-item" (click)="emg('ers')"><app-icon name="phone" [size]="15" />Call Emergency Services</button>
            <button class="dd-item" (click)="emg('clear')"><app-icon name="shield-check" [size]="15" />Declare All Clear (Fire)</button>
          </div>
        }
      </div>
      <a class="btn-ghost hb" routerLink="/safety-wellbeing/reports-analytics"><app-icon name="file-chart" [size]="16" />View Reports</a>
      <div class="menu-wrap">
        <button class="btn-ghost hb sq" (click)="toggle('more')" aria-label="More"><app-icon name="more" [size]="17" /></button>
        @if (menu() === 'more') {
          <div class="dropdown right">
            <button class="dd-item" (click)="exportIncidents()"><app-icon name="download" [size]="15" />Export today's incidents (CSV)</button>
            <button class="dd-item" (click)="exportPeople()"><app-icon name="download" [size]="15" />Export people safety status (CSV)</button>
            <button class="dd-item" (click)="fullMap()"><app-icon name="maximize" [size]="15" />Full-screen site map</button>
            <button class="dd-item" (click)="menu.set(null); store.toast('Live feeds refreshed · all 42 sensors online')"><app-icon name="refresh" [size]="15" />Refresh live data</button>
          </div>
        }
      </div>
    </app-page-head>
    @if (store.lockdown()) {<div class="banner"><app-icon name="s-lock" [size]="16" />LOCKDOWN ACTIVE — Production Area (Floor 2) doors locked, access restricted to ERT. <button class="lnk" (click)="emg('lockdown')">Lift lockdown</button></div>}

    <section class="kpi-row kpis">
      <app-kpi label="Active Incidents" [value]="store.active().length" icon="bell" color="#ef4444" change="67%" [good]="false" sub="vs. last 24 hrs" routerLink="/safety-wellbeing/incident-management" />
      <app-kpi label="Open Hazards" [value]="store.openHazards().length" icon="triangle-alert" color="#f59e0b" change="28%" [up]="false" sub="vs. last 24 hrs" routerLink="/safety-wellbeing/hazard-risk-management" />
      <app-kpi label="People On-Site" [value]="p().total" icon="users" color="#22c55e" [sub]="pctOf(p().safe) + '%'" subColor="#16a34a" (click)="peopleOpen.set('Safe')" class="ppl" />
      <app-kpi label="PPE Compliance" [value]="store.ppePct() + '%'" icon="hard-hat" color="#7c3aed" change="5%" sub="vs. last week" routerLink="/safety-wellbeing/ppe-compliance" />
      <app-kpi label="Wellbeing Alerts" [value]="store.openWAlerts().length" icon="heart" color="#3b82f6" change="200%" [good]="false" sub="vs. last 24 hrs" routerLink="/safety-wellbeing/health-wellbeing" />
      <app-kpi label="Environment Alerts" [value]="store.openEnvAlerts().length" icon="s-leaf" color="#14b8a6" change="50%" [good]="false" sub="vs. last 24 hrs" (click)="envOpen.set(true)" />
    </section>

    <section class="top">
      <div class="card map-card" #mapCard>
        <div class="card-head mh">
          <h3>Live Site Map</h3>
          <div class="hsel">
            <select class="select" [value]="site()" (change)="setSite($any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
            <select class="select" [value]="floorSel()" (change)="setFloorSel($any($event.target).value)"><option value="All Floors">All Floors</option>@for (f of floors; track f) {<option [value]="f">{{ f }}</option>}</select>
            <div class="menu-wrap">
              <button class="select lay" (click)="toggle('layers')"><app-icon name="layers" [size]="15" />Layers</button>
              @if (menu() === 'layers') {
                <div class="dropdown right opts">
                  @for (l of layerNames; track l) {<label><input type="checkbox" [checked]="on(l)" (change)="flip(l)" />{{ l }}</label>}
                </div>
              }
            </div>
            <button class="fs" title="Full screen" (click)="fullMap()"><app-icon name="maximize" [size]="18" /></button>
          </div>
        </div>
        <div class="map-body">
          <ul class="floors">@for (f of floors; track f) {<li [class.on]="floor() === f" (click)="setFloor(f)">{{ f }}</li>}</ul>
          <app-safety-map #map [markers]="markers()" [routes]="routes()" [callout]="callout()" [fires]="fires()" [restricted]="!!fires().length && on('Restricted Zone')" [labels]="labels" [zoneTints]="tints" (markerClick)="clickMarker($event)" (calloutClick)="openFeatured()">
            @if (person(); as ps) {
              <div class="pcard">
                <span class="pav" [style.background]="avatarColor(ps.name)">{{ initials(ps.name) }}</span>
                <div><b>{{ ps.name }}</b><small>{{ ps.id }}</small><em [class.red]="ps.status === 'Missing'" [class.amb]="ps.status === 'Medical Attention'">{{ ps.note }}</em></div>
                <i class="live-dot"></i>
                <button class="x" (click)="selPerson.set(null)" aria-label="Close">×</button>
              </div>
            }
          </app-safety-map>
        </div>
        <div class="legend">
          @for (l of layerNames; track l) {
            <button [class.off]="!on(l)" (click)="flip(l)">
              @switch (l) {
                @case ('People (Live)') {<i class="lg g"><app-icon name="user" [size]="11" /></i>}
                @case ('Incident') {<i class="lg r"><app-icon name="flame" [size]="11" /></i>}
                @case ('Hazard') {<i class="lg a"><app-icon name="triangle-alert" [size]="11" /></i>}
                @case ('Assembly Point') {<i class="lg b"><app-icon name="users" [size]="11" /></i>}
                @case ('Evacuation Route') {<b class="route">▬ ▪ ➜</b>}
                @case ('Exit') {<i class="lg gs"><app-icon name="run" [size]="12" /></i>}
                @default {<i class="lg rz"></i>}
              }
              {{ l }}
            </button>
          }
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-head"><h3>Recent Incidents</h3><a class="lnk" routerLink="/safety-wellbeing/incident-management">View All</a></div>
          <table class="ri">
            <thead><tr><th>Time</th><th>Incident</th><th>Location</th><th>Severity</th><th>Status</th></tr></thead>
            <tbody>
              @for (i of recent(); track i.id) {
                <tr (click)="store.openIncident.set(i.id)">
                  <td class="t">{{ i.time }}</td>
                  <td><span class="it"><app-icon [name]="meta(i.type).icon" [size]="16" [style.color]="meta(i.type).color" [stroke]="2.3" />{{ i.type }}</span></td>
                  <td>{{ i.location }}</td>
                  <td><span [class]="sevTag(i.severity)">{{ i.severity }}</span></td>
                  <td><span [class]="stCls(i.status)">{{ i.status }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-head"><h3>Live Camera Feeds</h3><a class="lnk" routerLink="/safety-wellbeing/ppe-compliance">View All</a></div>
          <div class="cams">
            @for (c of cams; track c.id) {
              <button class="cam" (click)="camOpen.set(c.id)">
                <app-sf-cam [variant]="c.variant" [alert]="c.alert" [tick]="app.tick()" />
                <span>{{ c.name }}</span>
              </button>
            }
          </div>
        </div>
      </div>
    </section>

    <section class="bottom">
      <div class="card">
        <div class="card-head"><h3>People Safety Status</h3></div>
        <div class="pss">
          <app-donut [segments]="donut()" [value]="'' + p().total" center="On-Site" [size]="112" [legend]="false" />
          <ul>
            @for (s of donut(); track s.label) {
              <li (click)="peopleOpen.set($any(s.label))"><i [style.background]="s.color"></i><em>{{ s.label }}</em><b>{{ s.value }}</b><span>({{ pctOf(s.value) }}%)</span></li>
            }
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Incident Trend</h3>
          <select class="select sm" [value]="trendRange()" (change)="trendRange.set($any($event.target).value)"><option>Last 24 Hours</option><option>Last 7 Days</option><option>Last 30 Days</option></select>
        </div>
        <div class="tleg">@for (s of trendSeries(); track s.name) {<button [class.off]="hidden().includes(s.name)" (click)="hideSeries(s.name)"><i [style.background]="s.color"></i>{{ s.name }}</button>}</div>
        <div class="tc" (mouseleave)="hov.set(null)">
          <svg viewBox="0 0 320 168">
            @for (k of [0, 5, 10, 15, 20]; track k) {
              <line x1="26" x2="314" [attr.y1]="ty(k)" [attr.y2]="ty(k)" stroke="#eef0f5" />
              <text x="18" [attr.y]="ty(k) + 3.5" text-anchor="end" class="ax">{{ k * trendScale() }}</text>
            }
            @for (l of trendX(); track $index) {@if (l.show) {<text [attr.x]="l.x" y="163" text-anchor="middle" class="ax">{{ l.t }}</text>}}
            <defs><linearGradient id="sf-tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".45" /><stop offset="1" stop-color="#8b5cf6" stop-opacity=".04" /></linearGradient></defs>
            @for (s of trendLines(); track s.name) {
              @if (s.name === 'Total') {<path [attr.d]="s.area" fill="url(#sf-tg)" />}
              <path [attr.d]="s.d" fill="none" [attr.stroke]="s.color" stroke-width="1.8" />
              @for (pt of s.pts; track $index) {<circle [attr.cx]="pt[0]" [attr.cy]="pt[1]" [attr.r]="hov() === $index ? 3.6 : 2.6" [attr.fill]="s.color" stroke="#fff" stroke-width="1" />}
            }
            @if (hov() !== null) {<line [attr.x1]="trendX()[hov()!].x" [attr.x2]="trendX()[hov()!].x" y1="8" y2="148" stroke="#c4b5fd" stroke-dasharray="3 3" />}
            @for (l of trendX(); track $index) {<rect [attr.x]="l.x - 12" y="6" width="24" height="144" fill="transparent" (mouseenter)="hov.set($index)" />}
          </svg>
          @if (hov() !== null) {
            <div class="tip" [style.left.%]="(trendX()[hov()!].x / 320) * 100">
              <b>{{ trendX()[hov()!].t }}</b>
              @for (s of trendLines(); track s.name) {<span><i [style.background]="s.color"></i>{{ s.name }}: {{ s.vals[hov()!] }}</span>}
            </div>
          }
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Top Hazard Categories</h3>
          <select class="select sm" [value]="hzRange()" (change)="hzRange.set($any($event.target).value)"><option>This Month</option><option>Last Month</option><option>This Quarter</option></select>
        </div>
        <ul class="hz">
          @for (h of hazardCats(); track h.label) {
            <li (click)="openHazardCat(h.label)" [title]="'Open ' + h.label + ' hazards'"><span>{{ h.label }}</span><b>{{ h.value }}</b><div class="bar"><i [style.width.%]="(h.value / h.max) * 100" [style.background]="h.color"></i></div></li>
          }
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Environmental Conditions</h3><button class="livechip" [class.paused]="!app.live()" (click)="app.liveEnabled.set(!app.liveEnabled())"><i></i>{{ app.live() ? 'Live' : 'Paused' }}</button></div>
        <ul class="env">
          @for (e of env(); track e.key) {
            <li (click)="envKey.set(envKey() === e.key ? null : e.key)" [class.open]="envKey() === e.key">
              <app-icon [name]="e.icon" [size]="19" [style.color]="e.color" /><span>{{ e.label }}</span><b>{{ e.text }}</b><em [class.warn]="e.status !== 'Normal' && e.status !== 'Good'">{{ e.status }}</em>
            </li>
            @if (envKey() === e.key) {<li class="spk"><app-sparkline [values]="e.hist" [color]="e.color" /><small>Last 2 h · min {{ e.min }} · max {{ e.max }} {{ e.unit }}</small></li>}
          }
        </ul>
      </div>
    </section>

    <!-- people drill-down -->
    @if (peopleOpen(); as ps) {
      <div class="g-overlay" (click)="peopleOpen.set(null)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>People · {{ ps }}</h3><button class="close-btn" (click)="peopleOpen.set(null)">×</button></div>
        <div class="segs wrap">@for (s of statuses; track s) {<button [class.on]="ps === s" (click)="peopleOpen.set(s)">{{ s }} ({{ count(s) }})</button>}</div>
        @if (ps === 'Safe') {
          <p class="muted">{{ p().safe }} people are in safe zones across Head Office. Showing those recently cleared:</p>
        }
        <ul class="plist">
          @for (x of peopleOf(ps); track x.id) {
            <li>
              <span class="av" [style.background]="avatarColor(x.name)">{{ initials(x.name) }}</span>
              <div><b>{{ x.name }}</b><small>{{ x.id }} · {{ x.dept }} · {{ x.floor }} – {{ x.zone }}</small><small class="nt">{{ x.note }}</small></div>
              <div class="pa">
                @if (x.status !== 'Safe') {<button class="btn-ghost sm" (click)="markSafe(x)">Mark safe</button>}
                <button class="btn-ghost sm" (click)="locate(x)">Locate</button>
              </div>
            </li>
          } @empty {<li class="muted">No one in this status.</li>}
        </ul>
      </aside>
    }
    <!-- environment alerts -->
    @if (envOpen()) {
      <div class="g-overlay" (click)="envOpen.set(false)"></div>
      <aside class="g-drawer">
        <div class="modal-head"><h3>Environment Alerts</h3><button class="close-btn" (click)="envOpen.set(false)">×</button></div>
        <ul class="plist">
          @for (a of store.envAlerts(); track a.id) {
            <li [class.done]="a.ack"><span class="ic-sq" style="background:#ccfbf1;color:#0f766e"><app-icon [name]="a.icon" [size]="16" /></span><div><b>{{ a.text }}</b><small>{{ a.time }} · {{ a.zone }}</small></div>
              <div class="pa">@if (!a.ack) {<button class="btn-ghost sm" (click)="ackEnv(a.id)">Acknowledge</button>} @else {<span class="tag green">Acknowledged</span>}</div></li>
          }
        </ul>
      </aside>
    }
    <!-- camera -->
    @if (cam(); as c) {
      <div class="g-overlay" (click)="camOpen.set(null)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>{{ c.name }} <small class="muted">{{ c.id }}</small></h3><button class="close-btn" (click)="camOpen.set(null)">×</button></div>
        <div class="camv">
          <app-sf-cam class="bigcam" [variant]="c.variant" [alert]="c.alert" [tick]="app.tick()" />
          <div>
            <div class="sec-h">AI Detections</div>
            @if (c.alert) {
              <div class="det"><app-icon name="triangle-alert" [size]="16" /><div><b>{{ c.alert }}</b><small>{{ c.zone }} · confidence 94% · {{ c.alert === 'Proximity Alert' ? 'pedestrian within 2 m of forklift' : 'worker without required PPE' }}</small></div></div>
            } @else {<p class="muted">No violations in view. 3 people detected, all PPE compliant.</p>}
            <div class="cbtn">
              @if (c.alert) {<button class="btn-red" (click)="raiseFromCam(c)"><app-icon name="siren" [size]="15" />Raise Incident</button>}
              <button class="btn-ghost" (click)="store.toast('Snapshot saved to evidence locker'); camOpen.set(null)"><app-icon name="s-camera" [size]="15" />Snapshot</button>
              <button class="btn-ghost" (click)="store.toast('Talk-down announcement played on ' + c.zone + ' speakers')"><app-icon name="megaphone" [size]="15" />Talk-down</button>
            </div>
          </div>
        </div>
      </div>
    }
    <!-- broadcast -->
    @if (broadcast()) {
      <div class="g-overlay" (click)="broadcast.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendBroadcast()">
        <div class="modal-head"><h3>Broadcast Safety Alert</h3><button type="button" class="close-btn" (click)="broadcast.set(false)">×</button></div>
        <div class="form-grid">
          <label>Audience<select class="select" [value]="bAud()" (change)="bAud.set($any($event.target).value)"><option>Everyone on site ({{ p().total }})</option><option>Floor 2 occupants</option><option>Production Area</option><option>Wardens & ERT</option></select></label>
          <label>Channels<select class="select"><option>Push + SMS + PA</option><option>Push only</option><option>PA system only</option></select></label>
          <label class="full">Message<textarea class="input ta" [value]="bMsg()" (input)="bMsg.set($any($event.target).value)"></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="broadcast.set(false)">Cancel</button><button class="btn-primary" type="submit"><app-icon name="megaphone" [size]="15" />Send</button></div>
      </form>
    }
    <app-sf-report />
    <app-sf-incident-drawer />
    <app-sf-toast />
  `,
  styles: [SF_STYLES, `
    :host { display: block; }
    :host ::ng-deep .page-head h1 { font-size: 31px; }
    :host ::ng-deep .page-head { position: relative; margin-bottom: 14px; } :host ::ng-deep .page-head .head-btns { position: absolute; right: 0; top: 24px; }
    .hb { height: 40px; padding: 0 14px; font-size: 13px; color: #1f2233; text-decoration: none; } .sq { width: 40px; justify-content: center; padding: 0; }
    .banner { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; background: repeating-linear-gradient(45deg, #fee2e2, #fee2e2 12px, #fecaca 12px, #fecaca 24px); color: #991b1b; font-weight: 600; font-size: 13px; }
    .kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .kpis app-kpi { cursor: pointer; padding: 12px 12px; align-items: center; transition: box-shadow .15s; } .kpis app-kpi:hover { box-shadow: 0 4px 16px rgba(124, 58, 237, .14); }
    .kpis ::ng-deep .kpi-icon { width: 50px; height: 50px; border-radius: 10px; } .kpis ::ng-deep .kpi-icon svg { width: 27px; height: 27px; }
    .kpis app-kpi { gap: 11px; padding: 12px 10px; } .kpis ::ng-deep .kpi-value { font-size: 23px; margin: 3px 0 5px; } .kpis ::ng-deep .kpi-label { font-size: 12.5px; }
    .kpis ::ng-deep .kpi-change { font-size: 10.5px; } .kpis ::ng-deep .kpi-change span { font-size: 12px; margin-right: 5px; }
    .kpis .ppl ::ng-deep .kpi-change::after { content: 'Safe'; margin-left: 22px; }
    .top { display: grid; grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: stretch; }
    .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .col > .card { flex: 1; }
    .map-card { padding: 12px 14px; } .map-card:fullscreen { overflow: auto; }
    .mh { margin-bottom: 10px; } .mh h3 { font-size: 17px; } .hsel { display: flex; gap: 10px; align-items: center; }
    .hsel .select { height: 34px; min-width: 128px; font-size: 12.5px; } .hsel .select.lay { min-width: 106px; display: inline-flex; gap: 6px; align-items: center; cursor: pointer; text-align: left; }
    .fs { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 8px; background: #fff; display: grid; place-items: center; cursor: pointer; }
    .opts { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 180px; font-size: 13px; } .opts label { display: flex; gap: 8px; align-items: center; cursor: pointer; } .opts input { accent-color: var(--primary); }
    .map-body { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 10px; align-items: start; }
    .floors { list-style: none; margin: 0; padding: 4px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; }
    .floors li { padding: 9px 8px; border-radius: 6px; cursor: pointer; color: #2a2d40; white-space: nowrap; } .floors li + li { margin-top: 2px; }
    .floors li:hover { background: #f6f5fb; } .floors li.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; border-left: 3px solid var(--primary); }
    .pcard { position: absolute; left: 28px; bottom: 12px; display: flex; gap: 10px; align-items: center; padding: 8px 30px 8px 8px; background: #fff; border-radius: 8px; box-shadow: 0 6px 20px rgba(20, 20, 50, .18); min-width: 180px; }
    .pav { width: 46px; height: 46px; border-radius: 6px; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 15px; }
    .pcard div { display: flex; flex-direction: column; font-size: 11.5px; } .pcard b { font-size: 12.5px; } .pcard small { color: #4b4f6b; } .pcard em { font-style: normal; color: #16a34a; font-weight: 500; margin-top: 2px; }
    .pcard em.red { color: #dc2626; } .pcard em.amb { color: #d97706; }
    .live-dot { position: absolute; right: 12px; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px #dcfce7; }
    .pcard .x { position: absolute; right: 2px; top: 0; border: 0; background: none; color: #9ca3af; cursor: pointer; font-size: 14px; }
    .legend { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11.5px; }
    .legend button { display: flex; gap: 6px; align-items: center; border: 0; background: none; font: inherit; font-size: 11.5px; cursor: pointer; padding: 2px 0; color: var(--text); } .legend button.off { opacity: .4; text-decoration: line-through; }
    .lg { width: 19px; height: 19px; border-radius: 50%; display: grid; place-items: center; color: #fff; } .lg.g { background: #22c55e; } .lg.r { background: #ef4444; } .lg.a { background: #f59e0b; } .lg.b { background: #3b82f6; }
    .lg.gs { background: #16a34a; border-radius: 4px; } .lg.rz { background: #ef4444; opacity: .85; } .route { color: #16a34a; letter-spacing: 1px; font-size: 11px; }
    .ri { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ri th { text-align: left; font-weight: 500; color: #3b3f5c; padding: 7px 6px; background: #f8f8fc; font-size: 11.5px; } .ri td { padding: 6.5px 6px; border-bottom: 1px solid #f1f2f7; white-space: nowrap; font-size: 11.5px; }
    .ri .sev { min-width: 50px; padding: 3px 8px; } .ri .st { padding: 3px 7px; font-size: 11px; }
    .ri tbody tr { cursor: pointer; } .ri tbody tr:hover { background: #faf8ff; } .ri .t { color: #3b3f5c; }
    .it { display: inline-flex; gap: 7px; align-items: center; }
    .cams { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .cam { display: flex; flex-direction: column; gap: 6px; border: 0; padding: 0; background: none; cursor: pointer; font: inherit; text-align: left; }
    .cam app-sf-cam { aspect-ratio: 155 / 128; border-radius: 4px; } .cam:hover app-sf-cam { outline: 2px solid var(--primary); } .cam span { font-size: 11.5px; color: #3b3f5c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bottom { display: grid; grid-template-columns: minmax(0, 1.06fr) minmax(0, 1.16fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
    .bottom .card { padding: 14px; } .bottom h3 { font-size: 15px; letter-spacing: -.2px; white-space: nowrap; } .bottom .card-head { margin-bottom: 10px; flex-wrap: nowrap; }
    .select.sm { height: 30px; font-size: 11.5px; width: auto; padding-right: 24px; flex: none; }
    .pss { display: flex; gap: 8px; align-items: center; } .pss app-donut { flex: none; }
    .pss ::ng-deep .donut-mid b { font-size: 22px; } .pss ::ng-deep .donut-mid span { font-size: 12px; color: #3b3f5c; }
    .pss ul { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 0; font-size: 10.5px; }
    .pss li { display: flex; gap: 5px; align-items: center; padding: 9px 0; cursor: pointer; border-radius: 6px; } .pss li:hover { background: #f8f7fd; }
    .pss li i { width: 9px; height: 9px; border-radius: 50%; flex: none; } .pss li em { flex: 1; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .pss li b { font-weight: 600; } .pss li span { color: #4b4f6b; width: 36px; text-align: right; }
    .tleg { display: flex; gap: 14px; justify-content: center; font-size: 11px; margin-bottom: 2px; } .tleg button { display: flex; gap: 5px; align-items: center; border: 0; background: none; font: inherit; font-size: 11px; cursor: pointer; } .tleg button.off { opacity: .35; }
    .tleg i { width: 9px; height: 9px; border-radius: 50%; }
    .tc { position: relative; } .tc svg { width: 100%; display: block; } .ax { font: 9px Inter, sans-serif; fill: #3b3f5c; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); background: #1e1b3a; color: #fff; border-radius: 6px; padding: 6px 8px; font-size: 11px; display: flex; flex-direction: column; gap: 2px; pointer-events: none; white-space: nowrap; }
    .tip i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
    .hz { list-style: none; margin: 0; padding: 0; } .hz li { display: grid; grid-template-columns: minmax(0, 1fr) 26px 100px; gap: 10px; align-items: center; padding: 6.5px 0; font-size: 11.5px; cursor: pointer; border-radius: 4px; }
    .hz li:hover span { color: var(--primary); } .hz li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hz b { text-align: right; } .hz .bar { height: 13px; border-radius: 2px; } .hz .bar i { border-radius: 2px; }
    .livechip { display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: #fff; font: inherit; font-size: 11.5px; cursor: pointer; }
    .livechip i { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; } .livechip.paused i { background: #9ca3af; }
    .env { list-style: none; margin: 0; padding: 0; } .env li { display: grid; grid-template-columns: 24px minmax(0, 1fr) 64px 58px; gap: 8px; align-items: center; padding: 8px 2px; font-size: 11.5px; cursor: pointer; border-radius: 6px; }
    .env li:hover, .env li.open { background: #f8f7fd; } .env b { font-weight: 500; font-size: 12px; white-space: nowrap; } .env span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .env em { font-style: normal; text-align: center; padding: 3px 0; border-radius: 4px; background: #dcfce7; color: #15803d; font-size: 11px; } .env em.warn { background: #fef3c7; color: #b45309; }
    .env li.spk { display: block; cursor: default; padding: 2px 6px 8px; } .env li.spk app-sparkline { display: block; height: 30px; } .env li.spk small { color: var(--muted); font-size: 10.5px; }
    .wrap { flex-wrap: wrap; margin-bottom: 12px; display: flex; } .segs.wrap button { font-size: 11.5px; padding: 6px 9px; }
    .plist { list-style: none; margin: 0; padding: 0; } .plist li { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid #f1f2f7; font-size: 12.5px; }
    .plist li.done { opacity: .6; } .plist div { display: flex; flex-direction: column; } .plist small { color: var(--muted); font-size: 11.5px; } .plist .nt { color: #b45309; } .pa { flex-direction: row !important; gap: 6px; }
    .camv { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; } .bigcam { aspect-ratio: 16 / 11; border-radius: 8px; }
    .det { display: flex; gap: 10px; padding: 10px; border-radius: 8px; background: #fef2f2; color: #b91c1c; } .det div { display: flex; flex-direction: column; font-size: 12.5px; } .det small { color: #7f1d1d; }
    .cbtn { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .ta { height: 90px; padding-top: 8px; }
    @media (max-width: 1500px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .top { grid-template-columns: 1fr; } .bottom { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 800px) { .bottom { grid-template-columns: 1fr; } .map-body { grid-template-columns: 1fr; } .floors { display: flex; overflow-x: auto; } }
  `],
})
export class SafetyCommandCenter {
  protected readonly store = inject(SafetyStore);
  protected readonly app = inject(AppState);
  private readonly router = inject(Router);
  private readonly mapCard = viewChild<ElementRef<HTMLElement>>('mapCard');
  private readonly map = viewChild<SafetyMap>('map');
  protected readonly sites = SITES;
  protected readonly floors = FLOORS;
  protected readonly cams = CAMERAS.slice(0, 3);
  protected readonly layerNames = LAYERS;
  protected readonly statuses: PStatus[] = ['Safe', 'In Hazard Zone', 'Missing', 'Medical Attention'];
  protected readonly initials = initials;
  protected readonly avatarColor = avatarColor;
  protected readonly sevTag = sevTag;
  protected readonly stCls = stCls;
  protected readonly labels = [
    { t: 'Production Area', x: 168, y: 104 }, { t: 'Warehouse', x: 372, y: 150 }, { t: 'Server Room', x: 500, y: 160 }, { t: 'Main Entrance', x: 345, y: 352 }, { t: 'Office Area', x: 82, y: 362 },
  ];
  protected readonly tints: [number, number, number, number, string][] = [[300, 92, 140, 118, '#f59e0b'], [440, 120, 120, 90, '#3b82f6'], [300, 260, 90, 114, '#22c55e']];

  protected readonly menu = signal<string | null>(null);
  protected readonly site = signal('Head Office');
  protected readonly floor = signal('Floor 2');
  protected readonly floorSel = signal('All Floors');
  protected readonly layers = signal<Layer[]>([...LAYERS]);
  protected readonly selPerson = signal<string | null>('EMP-00123');
  protected readonly peopleOpen = signal<PStatus | null>(null);
  protected readonly envOpen = signal(false);
  protected readonly envKey = signal<string | null>(null);
  protected readonly camOpen = signal<string | null>(null);
  protected readonly broadcast = signal(false);
  protected readonly bAud = signal('Everyone on site');
  protected readonly bMsg = signal('Fire alarm on Floor 2 Production Area. Avoid the area and follow ERT instructions.');
  protected readonly trendRange = signal('Last 24 Hours');
  protected readonly hzRange = signal('This Month');
  protected readonly hidden = signal<string[]>([]);
  protected readonly hov = signal<number | null>(null);

  protected readonly p = this.store.people;
  protected readonly cam = computed(() => CAMERAS.find((c) => c.id === this.camOpen()) ?? null);
  protected readonly recent = computed(() => this.store.today().slice(0, 5));

  constructor() {
    const route = inject(ActivatedRoute);
    const sub = route.queryParamMap.subscribe((q) => {
      const f = q.get('floor');
      if (f && FLOORS.includes(f)) this.setFloor(f);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /* ---------- map ---------- */
  private readonly floorIncidents = computed(() =>
    this.store.active().filter((i) => i.site === this.site() && (this.floorSel() === 'All Floors' && this.floor() === 'Floor 2' ? i.floor === 'Floor 2' : i.floor === this.floor())),
  );
  protected readonly fires = computed(() =>
    this.on('Incident') ? this.floorIncidents().filter((i) => i.type === 'Fire Alarm').map((i) => ({ id: i.id, x: LOC_XY[i.location]?.[0] ?? 176, y: LOC_XY[i.location]?.[1] ?? 212 })) : [],
  );
  private readonly featured = computed(() => this.floorIncidents().find((i) => i.type === 'Fire Alarm') ?? this.floorIncidents()[0] ?? null);
  protected readonly callout = computed<SCallout | null>(() => {
    const i = this.featured();
    if (!i || !this.on('Incident')) return null;
    const [x, y] = LOC_XY[i.location] ?? [176, 212];
    const title = i.type === 'Fire Alarm' ? 'Fire Incident' : i.type;
    return { x: x > 380 ? x - 22 : x + 28, flip: x > 380, y: y - 18, title, icon: I_TYPES[i.type]?.icon ?? 'flame', lines: [`${i.location} - ${i.floor}`, i.time], people: `${i.involved.length} people nearby` };
  });
  protected readonly routes = computed(() => (this.on('Evacuation Route') && this.fires().length ? ROUTES : []));
  private readonly floorPeople = computed(() => {
    const f = this.floor();
    const n = FLOOR_SEEDS[f] ?? 8;
    return PEOPLE_XY.slice(0, n).map(([x, y], i) => [x + ((i * 37 + n * 13) % 30) - 15 + (f === 'Floor 2' ? 15 - ((i * 37 + 195) % 30) : 0), y] as [number, number]);
  });
  protected readonly markers = computed<SMarker[]>(() => {
    const out: SMarker[] = [];
    const t = this.app.tick();
    const f = this.floor();
    if (this.on('People (Live)')) {
      this.floorPeople().forEach(([x, y], i) => out.push({ id: `p${i}`, x: x + this.app.wobble('px' + i, 4), y: y + this.app.wobble('py' + i, 3), kind: 'person', title: 'Person (live RTLS tag)' }));
      for (const ps of this.store.atRisk()) {
        if (ps.floor !== f || ps.status === 'Missing' || ps.status === 'Safe') continue;
        let [x, y] = LOC_XY[ps.zone] ?? [300, 200];
        if (ps.id === 'EMP-00123' && this.fires().length) {
          const r = ROUTES[0];
          const k = ((t % 24) / 24) * (r.length - 1);
          const a = r[Math.floor(k)];
          const b = r[Math.min(r.length - 1, Math.floor(k) + 1)];
          x = a[0] + (b[0] - a[0]) * (k % 1);
          y = a[1] + (b[1] - a[1]) * (k % 1) - 12;
        } else {
          const h = [...ps.id].reduce((s, c) => s + c.charCodeAt(0), 0);
          x += (h % 50) - 25 + this.app.wobble(ps.id, 3);
          y += ((h * 7) % 40) - 20;
        }
        out.push({ id: ps.id, x, y, kind: 'person', color: ps.status === 'Medical Attention' ? '#3b82f6' : '#22c55e', sel: this.selPerson() === ps.id, title: `${ps.name} · ${ps.note}` });
      }
    }
    if (this.on('Hazard')) {
      this.store.openHazards().filter((h) => h.floor === f).forEach((h, i) => {
        const [x, y] = h.xy ?? LOC_XY[h.location] ?? [300, 200];
        out.push({ id: h.id, x: h.xy ? x : x + ((i * 29) % 60) - 30, y: h.xy ? y : y + ((i * 17) % 40) - 20, kind: 'hazard', title: `${h.id} · ${h.title}` });
      });
    }
    if (this.on('Incident')) {
      for (const i of this.floorIncidents()) {
        const [x, y] = LOC_XY[i.location] ?? [300, 200];
        if (i.type === 'Fire Alarm') {
          out.push({ id: i.id, x, y, kind: 'fire', title: i.title });
          out.push({ id: i.id + '-sd', x: 128, y: 154, kind: 'incident', icon: 'flame', title: 'Smoke detector SD-2-14 in alarm' });
          out.push({ id: i.id + '-hs', x: 384, y: 118, kind: 'incident', icon: 'triangle-alert', title: 'Heat sensor HS-2-07 · 58 °C' });
        } else out.push({ id: i.id, x, y: y + 20, kind: 'incident', icon: I_TYPES[i.type]?.icon, title: i.title });
      }
    }
    if (this.on('Exit')) {
      out.push({ id: 'exit-n', x: 440, y: 26, kind: 'exit', title: 'Exit N1 – Stair A' }, { id: 'exit-e', x: 524, y: 245, kind: 'exit', title: 'Exit E2 – Stair C' }, { id: 'exit-s', x: 404, y: 334, kind: 'exit', title: 'Exit S1 – Main Stair' });
    }
    if (this.on('Assembly Point')) {
      out.push({ id: 'ap-1', x: 612, y: 360, kind: 'assembly', title: 'Assembly Point A – Main Parking' }, { id: 'ap-2', x: 20, y: 20, kind: 'assembly', title: 'Assembly Point B – North Lawn' });
    }
    return out;
  });
  protected readonly person = computed(() => {
    const ps = this.store.atRisk().find((x) => x.id === this.selPerson());
    return ps && ps.floor === this.floor() ? ps : null;
  });

  /* ---------- widgets ---------- */
  protected readonly donut = computed(() => [
    { label: 'Safe', value: this.p().safe, color: '#22c55e' },
    { label: 'In Hazard Zone', value: this.p().zone, color: '#f59e0b' },
    { label: 'Missing', value: this.p().missing, color: '#ef4444' },
    { label: 'Medical Attention', value: this.p().medical, color: '#dc2626' },
  ]);
  protected readonly trendScale = computed(() => (this.trendRange() === 'Last 24 Hours' ? 1 : this.trendRange() === 'Last 7 Days' ? 2 : 5));
  protected readonly trendSeries = computed(() => {
    const k = this.trendRange();
    const labels = k === 'Last 24 Hours' ? TREND_LABELS : k === 'Last 7 Days' ? ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] : ['Wk 1', '', 'Wk 2', '', 'Wk 3', '', 'Wk 4', ''];
    const n = labels.length;
    const pick = (v: number[], m: number) => (k === 'Last 24 Hours' ? v : Array.from({ length: n }, (_, i) => Math.round(v[(i * 3 + 2) % v.length] * m * (0.8 + ((i * 7) % 5) / 10))));
    const m = this.trendScale();
    return [
      { name: 'Total', color: '#8b5cf6', vals: pick(TREND.Total, m), labels },
      { name: 'High', color: '#ef4444', vals: pick(TREND.High, m), labels },
      { name: 'Medium', color: '#f59e0b', vals: pick(TREND.Medium, m), labels },
      { name: 'Low', color: '#22c55e', vals: pick(TREND.Low, m), labels },
    ];
  });
  protected readonly trendX = computed(() => {
    const labels = this.trendSeries()[0].labels;
    const n = labels.length;
    return labels.map((t, i) => ({ t, x: 30 + (i * 280) / (n - 1), show: n > 8 ? i % 2 === 0 : true }));
  });
  protected ty(v: number) {
    return 148 - (v / 20) * 138;
  }
  protected readonly trendLines = computed(() => {
    const xs = this.trendX();
    const sc = this.trendScale();
    return this.trendSeries()
      .filter((s) => !this.hidden().includes(s.name))
      .map((s) => {
        const pts = s.vals.map((v, i) => [xs[i].x, this.ty(v / sc)] as [number, number]);
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        return { ...s, pts, d, area: `${d} L${pts[pts.length - 1][0]},148 L${pts[0][0]},148 Z` };
      });
  });
  protected readonly hazardCats = computed(() => {
    const r = this.hzRange();
    const vals = r === 'This Month' ? this.store.catCounts() : r === 'Last Month' ? LAST_MONTH_CATS : QUARTER_CATS;
    const max = Math.max(...vals) * 1.32;
    return H_CATS.map((label, i) => ({ label, value: vals[i], color: H_CAT_COLOR[i], max }));
  });
  protected readonly env = computed(() => {
    const t = this.app.tick();
    return ENV.map((e) => {
      const v = +(e.base + (e.amp ? this.app.wobble(e.key, 10) / (10 / e.amp) : 0)).toFixed(e.dp);
      const hist = Array.from({ length: 24 }, (_, i) => +(e.base + Math.sin((t + i) / 3 + e.base) * (e.amp || 0.2)).toFixed(1));
      return { ...e, text: `${v.toFixed(e.dp)} ${e.unit}`.trim(), status: e.ok(v), hist, min: Math.min(...hist).toFixed(e.dp), max: Math.max(...hist).toFixed(e.dp) };
    });
  });

  /* ---------- actions ---------- */
  protected meta(t: string) {
    return I_TYPES[t] ?? I_TYPES['Near Miss'];
  }
  protected on(l: Layer) {
    return this.layers().includes(l);
  }
  protected flip(l: Layer) {
    this.layers.update((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]));
  }
  protected toggle(m: string) {
    this.menu.set(this.menu() === m ? null : m);
  }
  protected setSite(s: string) {
    this.site.set(s);
    this.store.toast(s === 'Head Office' ? 'Showing Head Office live map' : `${s}: no active incidents · ${this.floorPeople().length} people tracked on ${this.floor()}`);
  }
  protected setFloor(f: string) {
    this.floor.set(f);
    if (this.floorSel() !== 'All Floors') this.floorSel.set(f);
    this.map()?.reset();
  }
  protected setFloorSel(f: string) {
    this.floorSel.set(f);
    this.floor.set(f === 'All Floors' ? 'Floor 2' : f);
    this.map()?.reset();
  }
  protected clickMarker(id: string) {
    if (id.startsWith('INC-')) return this.store.openIncident.set(id.replace(/-(sd|hs)$/, ''));
    if (id.startsWith('HZ-')) {
      const h = this.store.hazards().find((x) => x.id === id)!;
      this.store.hazardCat.set(null);
      return this.store.toast(`${h.id} · ${h.title} · owner ${h.owner}`);
    }
    if (id.startsWith('EMP-')) return this.selPerson.set(id);
    if (id.startsWith('exit')) return this.store.toast(`${this.markers().find((m) => m.id === id)?.title} · clear, door status: unlocked`);
    if (id.startsWith('ap-')) return this.store.toast(`${this.markers().find((m) => m.id === id)?.title} · warden on station`);
    this.store.toast('Live RTLS tag · Safe zone');
  }
  protected openFeatured() {
    const f = this.featured();
    if (f) this.store.openIncident.set(f.id);
  }
  protected report() {
    this.store.reportOpen.set({ type: 'Near Miss', floor: this.floor(), site: this.site(), location: 'Production Area', severity: 'Medium' });
  }
  protected emg(a: string) {
    this.menu.set(null);
    const fire = this.store.active().find((i) => i.type === 'Fire Alarm');
    switch (a) {
      case 'alarm':
        this.store.toast('Site alarm sounding on all floors · PA announcement playing');
        if (fire) this.store.updateIncident(fire.id, {}, 'Site-wide alarm sounded');
        break;
      case 'lockdown':
        this.store.lockdown.set(!this.store.lockdown());
        this.store.toast(this.store.lockdown() ? 'Production Area locked down · access restricted to ERT' : 'Lockdown lifted · normal access restored');
        break;
      case 'broadcast':
        this.broadcast.set(true);
        break;
      case 'ers':
        this.store.toast('Civil Defence (997) called · live map & headcount shared');
        if (fire) this.store.updateIncident(fire.id, {}, 'Emergency services called (997)');
        break;
      case 'clear':
        if (fire) {
          this.store.updateIncident(fire.id, { status: 'Closed', rootCause: 'Overheated motor on packaging line 3' }, 'All clear declared – fire extinguished');
          this.store.toast(`${fire.id} closed · all clear declared for Floor 2`);
        } else this.store.toast('No active fire incident');
        break;
    }
  }
  protected sendBroadcast() {
    this.broadcast.set(false);
    this.store.toast(`Alert sent to ${this.bAud()} via push, SMS & PA`);
  }
  protected openHazardCat(c: string) {
    this.store.hazardCat.set(c);
    this.router.navigate(['/safety-wellbeing/hazard-risk-management']);
  }
  protected hideSeries(n: string) {
    this.hidden.update((h) => (h.includes(n) ? h.filter((x) => x !== n) : [...h, n]));
  }
  /** Percent of on-site headcount (seed values shown exactly as on the reference board). */
  protected pctOf(n: number) {
    const p = this.p();
    if (p.total === 842 && p.safe === 826) return ({ 826: '98.2', 8: '0.9', 3: '0.4', 5: '0.6' } as Record<number, string>)[n] ?? p.pct(n);
    return p.pct(n);
  }
  protected count(s: PStatus) {
    const p = this.p();
    return s === 'Safe' ? p.safe : s === 'In Hazard Zone' ? p.zone : s === 'Missing' ? p.missing : p.medical;
  }
  protected peopleOf(s: PStatus) {
    return this.store.atRisk().filter((x) => x.status === s);
  }
  protected markSafe(x: SPerson) {
    this.store.setPerson(x.id, 'Safe', 'Marked safe by Rex Kumar');
    this.store.toast(`${x.name} marked safe`);
  }
  protected locate(x: SPerson) {
    this.peopleOpen.set(null);
    this.setFloor(x.floor);
    this.selPerson.set(x.id);
    const [mx, my] = LOC_XY[x.zone] ?? [320, 190];
    setTimeout(() => this.map()?.focus(mx, my, 1.8));
  }
  protected ackEnv(id: string) {
    this.store.envAlerts.update((l) => l.map((a) => (a.id === id ? { ...a, ack: true } : a)));
    this.store.toast('Environment alert acknowledged');
  }
  protected raiseFromCam(c: (typeof CAMERAS)[number]) {
    this.camOpen.set(null);
    this.store.reportOpen.set({ type: c.alert === 'Proximity Alert' ? 'Near Miss' : 'PPE Violation', location: c.zone, floor: 'Floor 2', severity: 'Medium', description: `${c.alert} detected by ${c.id} AI analytics.` });
  }
  protected fullMap() {
    this.menu.set(null);
    const el = this.mapCard()?.nativeElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el?.requestFullscreen?.();
  }
  protected exportIncidents() {
    this.menu.set(null);
    downloadCsv('safety-incidents-today.csv', [['ID', 'Time', 'Type', 'Location', 'Floor', 'Severity', 'Status', 'Assignee'], ...this.store.today().map((i: Incident) => [i.id, i.time, i.type, i.location, i.floor, i.severity, i.status, i.assignee])]);
  }
  protected exportPeople() {
    this.menu.set(null);
    const p = this.p();
    downloadCsv('people-safety-status.csv', [['Status', 'Count'], ['Safe', p.safe], ['In Hazard Zone', p.zone], ['Missing', p.missing], ['Medical Attention', p.medical], [], ['ID', 'Name', 'Status', 'Floor', 'Zone', 'Note'], ...this.store.atRisk().map((x) => [x.id, x.name, x.status, x.floor, x.zone, x.note])]);
  }
}
