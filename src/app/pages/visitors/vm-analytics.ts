import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { downloadCsv } from '../dashboards/demo-data';
import { Toaster } from './vm-a-kit';
import { AnReport, ARRIVALS, fmtDur, HOST_ROWS, HOURS, OCCUPANCY, PURPOSE_DUR, PURPOSES, RANGES, REPORT_KINDS, REPORTS, SITE_ROWS, TYPES } from './vm-analytics.data';
import { VM_UI } from './vm-ui';

type Tab = 'Overview' | 'Traffic' | 'Visitor Mix' | 'Hosts' | 'Sites' | 'Purposes';
const TABS: { k: Tab; icon: string }[] = [
  { k: 'Overview', icon: 'reports-bar' }, { k: 'Traffic', icon: 'users' }, { k: 'Visitor Mix', icon: 'reports-pie' },
  { k: 'Hosts', icon: 'user' }, { k: 'Sites', icon: 'building' }, { k: 'Purposes', icon: 'tasks-tag' },
];
const TYPE_RATE: Record<string, number> = { 'Pre-Registered': 98.1, 'Walk-in': 92.7, 'Invited by Employee': 97.4, 'Contractor Portal': 95.2 };
const SECTIONS = ['KPI summary', 'Visitor trend', 'Visitor types', 'Visit purpose', 'Peak hours & occupancy', 'Site comparison', 'Top hosts'];
const W = 560, H = 210, L = 44, R = 10, TP = 34, B = 34;
const CW = 400, CH = 196, CL = 38, CR = 40, CT = 40, CB = 34;
const fmt = (n: number) => n.toLocaleString('en-US');
const two = (s: string) => s.split('|');

@Component({
  selector: 'app-vm-analytics',
  imports: [Icon, ...VM_UI, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page an">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/home"><app-icon name="home" [size]="14" /></a><app-icon name="chevron-right" [size]="13" /><a routerLink="/visitor-management/visitor-dashboard">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Visitor Analytics</b></nav>
          <h1>Visitor Analytics</h1>
          <p>Understand visitor trends, traffic patterns, host performance, and site activity.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openCreate()"><app-icon name="plus" [size]="18" />Create Report</button>
          <button class="btn-outline hb" (click)="openSchedule(null)"><app-icon name="calendar-days" [size]="18" />Schedule Report</button>
          <button class="btn-outline hb" (click)="exportTab()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggle('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="menu.set(null); print()"><app-icon name="reports-printer" [size]="15" />Print dashboard</button>
                <button class="dd-item" (click)="copyLink()"><app-icon name="reports-link" [size]="15" />Copy share link</button>
                <button class="dd-item" (click)="go('visitor-logs-history')"><app-icon name="history" [size]="15" />Open Visitor Logs</button>
                <button class="dd-item" (click)="go('host-management')"><app-icon name="users" [size]="15" />Host Management</button>
                <button class="dd-item" (click)="reset(); menu.set(null)"><app-icon name="refresh" [size]="15" />Reset all filters</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Total Visitors" [value]="kpi().total" icon="users" color="var(--ka-7c3aed)" [delta]="kpi().d[0]" [up]="up(kpi().d[0])" [good]="up(kpi().d[0])" [clickable]="true" (pick)="setTab('Traffic')" />
        <vm-kpi label="Avg. Visit Duration" [value]="kpi().dur" icon="clock" color="var(--ka-16a34a)" [delta]="kpi().d[1]" [up]="up(kpi().d[1])" [good]="up(kpi().d[1])" [clickable]="true" (pick)="setTab('Sites')" />
        <vm-kpi label="Check-In Success" [value]="kpi().rate" icon="vm-c-check-circle" color="var(--ka-16a34a)" [delta]="kpi().d[2]" [up]="up(kpi().d[2])" [good]="up(kpi().d[2])" [clickable]="true" (pick)="setTab('Sites')" />
        <vm-kpi label="Peak Occupancy" [value]="kpi().peak" icon="map-pin" color="var(--ka-3b82f6)" [badge]="kpi().peakAt" [clickable]="true" (pick)="setTab('Traffic')" />
      </section>

      <div class="bar">
        <div class="menu-wrap">
          <button class="range" (click)="toggle('range', $event)"><app-icon name="calendar-days" [size]="18" />{{ range().label }}<app-icon name="chevron-down" [size]="16" /></button>
          @if (menu() === 'range') {
            <div class="dropdown" (click)="$event.stopPropagation()">
              @for (r of ranges; track r.key) {<button class="dd-item" [class.on]="r.key === rangeKey()" (click)="rangeKey.set(r.key); menu.set(null); toast.show('Showing ' + r.label + ' · compared with ' + r.prev)">{{ r.label }}</button>}
            </div>
          }
        </div>
        <div class="seg">
          @for (t of tabs; track t.k) {<button [class.on]="tab() === t.k" (click)="setTab(t.k)"><app-icon [name]="t.icon" [size]="16" />{{ t.k }}</button>}
        </div>
        <label class="vm-filter"><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of siteRows; track s.site) {<option [value]="s.site">{{ s.site }}</option>}</select></label>
        <label class="vm-filter"><span>Visitor Type:</span><select [value]="vtype()" (change)="vtype.set($any($event.target).value)"><option value="">All Types</option>@for (t of types; track t.label) {<option [value]="t.label">{{ t.label }}</option>}</select></label>
        <label class="vm-filter"><span>Visit Purpose:</span><select [value]="purpose()" (change)="purpose.set($any($event.target).value)"><option value="">All Purposes</option>@for (p of purposes; track p.label) {<option [value]="p.label">{{ p.label }}</option>}</select></label>
        <button class="vm-icon-btn" [class.spin]="spin()" title="Reset filters &amp; refresh" (click)="reset()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      @switch (tab()) {
        @case ('Overview') {
          <div class="g g1"><ng-container *ngTemplateOutlet="trendT" /><ng-container *ngTemplateOutlet="typesT" /><ng-container *ngTemplateOutlet="purposeT" /></div>
          <div class="g g2"><ng-container *ngTemplateOutlet="peakT" /><ng-container *ngTemplateOutlet="sitesT" /><ng-container *ngTemplateOutlet="hostsT" /></div>
        }
        @case ('Traffic') {
          <div class="g gt"><ng-container *ngTemplateOutlet="trendT" /><ng-container *ngTemplateOutlet="peakT" /></div>
          <div class="vm-card">
            <div class="ch"><h2><app-icon name="calendar-days" [size]="20" />Daily Breakdown</h2><span class="sub">{{ range().label }}</span></div>
            <table class="vm-table">
              <thead><tr><th>Date</th><th>Total Visitors</th><th>Checked In</th><th>Checked Out</th><th>Still On-Site</th><th>Check-In Rate</th><th>vs Avg</th></tr></thead>
              <tbody>
                @for (d of daily(); track d.label) {
                  <tr class="click" (click)="trendHover.set(d.i)"><td><b>{{ d.label }}</b></td><td>{{ d.t }}</td><td>{{ d.inn }}</td><td>{{ d.out }}</td><td>{{ d.inn - d.out }}</td><td>{{ d.rate }}%</td><td><span class="dl" [class.neg]="d.vs < 0">{{ d.vs > 0 ? '+' : '' }}{{ d.vs }}%</span></td></tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('Visitor Mix') {
          <div class="g g1"><ng-container *ngTemplateOutlet="typesT" /><ng-container *ngTemplateOutlet="purposeT" />
            <div class="vm-card">
              <div class="ch"><h2><app-icon name="building" [size]="20" />Visitor Mix by Site</h2></div>
              @for (s of mixBySite(); track s.site) {
                <div class="mx"><span>{{ s.site }}</span><div class="stack">@for (p of s.parts; track p.label) {<i [style.width.%]="p.pct" [style.background]="p.color" [title]="p.label + ': ' + p.n"></i>}</div><b>{{ s.total }}</b></div>
              }
              <div class="lg">@for (t of types; track t.label) {<span><i [style.background]="t.color"></i>{{ t.label }}</span>}</div>
            </div>
          </div>
        }
        @case ('Hosts') {
          <div class="vm-card">
            <div class="ch"><h2><app-icon name="users" [size]="20" />Host Performance</h2><span class="sub">{{ hosts().length }} hosts · {{ range().label }}</span></div>
            <table class="vm-table">
              <thead><tr><th>#</th><th>Host</th><th>Department</th><th>Visits</th><th>Share</th><th>Avg. Duration</th><th>No-show Rate</th><th>Actions</th></tr></thead>
              <tbody>
                @for (h of hosts(); track h.name; let i = $index) {
                  <tr [class.sel]="hostSel() === h.name">
                    <td><span class="rk" [attr.data-r]="i + 1">{{ i + 1 }}</span></td>
                    <td><div class="vm-person"><vm-avatar [name]="h.name" [size]="28" />{{ h.name }}</div></td>
                    <td>{{ h.dept }}</td><td><b>{{ h.v }}</b></td>
                    <td><div class="sh"><div class="trk"><i [style.width.%]="h.share * 12"></i></div>{{ h.share }}%</div></td>
                    <td>{{ fmtDur(h.dur) }}</td><td><vm-status [label]="h.noShow + '%'" [tone]="h.noShow > 4 ? 'orange' : 'green'" /></td>
                    <td><div class="vm-acts"><button class="vm-mini" (click)="toast.show('Monthly visit summary sent to ' + h.name)"><app-icon name="reports-mail" [size]="13" />Send summary</button><button class="vm-mini" (click)="go('host-management')">Profile</button></div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('Sites') {
          <div class="g gs"><ng-container *ngTemplateOutlet="sitesT" />
            <div class="vm-card">
              <div class="ch"><h2><app-icon name="map-pin" [size]="20" />Peak Occupancy by Site</h2><span class="sub">Today 11:00 AM</span></div>
              @for (s of sites(); track s.site) {
                <div class="po"><span>{{ s.site }}</span><div class="trk big"><i [style.width.%]="s.peak / 1.2" [style.background]="'var(--ka-3b82f6)'"></i></div><b>{{ s.peak }}</b></div>
              }
              <p class="note">Capacity alerts trigger at 85% of the configured site capacity.</p>
            </div>
          </div>
          <div class="g gt"><ng-container *ngTemplateOutlet="trendT" /><ng-container *ngTemplateOutlet="peakT" /></div>
        }
        @case ('Purposes') {
          <div class="g gp"><ng-container *ngTemplateOutlet="purposeT" />
            <div class="vm-card">
              <div class="ch"><h2><app-icon name="tasks-tag" [size]="20" />Purpose Details</h2></div>
              <table class="vm-table">
                <thead><tr><th>Purpose</th><th>Visits</th><th>Share</th><th>Avg. Duration</th><th>Top Site</th><th></th></tr></thead>
                <tbody>
                  @for (p of purposeRows(); track p.label) {
                    <tr [class.sel]="purpose() === p.label"><td><span class="dot" [style.background]="p.color"></span><b>{{ p.label }}</b></td><td>{{ p.v }}</td><td>{{ p.pct }}%</td><td>{{ fmtDur(p.dur) }}</td><td>{{ p.top }}</td>
                    <td><button class="vm-mini" (click)="togglePurpose(p.label)">{{ purpose() === p.label ? 'Clear filter' : 'Filter' }}</button></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      <div class="vm-card reps">
        <div class="ch"><h2><app-icon name="file-text" [size]="21" />Recent Analytics Reports</h2></div>
        <table class="vm-table">
          <thead><tr><th>Report Name</th><th>Scope</th><th>Period</th><th>Created By</th><th>Last Run</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            @for (r of reports(); track r.id) {
              <tr>
                <td><div class="rn"><app-icon name="file-text" [size]="17" /><b>{{ r.name }}</b></div></td>
                <td>{{ r.scope }}</td>
                <td><div class="rn"><app-icon name="calendar-days" [size]="15" />{{ r.period }}</div></td>
                <td><div class="rn"><app-icon name="user" [size]="15" />{{ r.by }}</div></td>
                <td><div class="rn"><app-icon name="calendar-days" [size]="15" />{{ r.lastRun }}</div></td>
                <td>
                  @if (r.status === 'Ready') {<vm-status label="Ready" tone="green" icon="vm-c-check" />}
                  @else if (r.status === 'Scheduled') {<vm-status label="Scheduled" tone="purple" icon="clock" [attr.title]="r.schedule ?? ''" />}
                  @else {<vm-status label="Generating…" tone="orange" icon="vm-c-hourglass" />}
                </td>
                <td><div class="vm-acts">
                  <button class="vm-mini" (click)="viewRep.set(r)"><app-icon name="eye" [size]="14" />View</button>
                  <button class="vm-mini" (click)="download(r)"><app-icon name="download" [size]="14" />Download</button>
                  <button class="vm-mini" (click)="openSchedule(r)"><app-icon name="calendar-days" [size]="14" />Schedule</button>
                </div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== card templates ===== -->
    <ng-template #trendT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="vm-h-trend" [size]="21" />Visitor Trend</h2><span class="sub">{{ rangeKey() === 'oct' ? 'Last 14 Days (01–15 Oct 2026)' : range().label }}</span></div>
        @let tr = trend();
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="chart" (mousemove)="hoverTrend($event, tr.n)" (mouseleave)="trendHover.set(null)">
          <defs><linearGradient id="vmhG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ka-8b5cf6)" stop-opacity=".28" /><stop offset="1" stop-color="var(--ka-8b5cf6)" stop-opacity="0" /></linearGradient></defs>
          @for (t of tr.ticks; track t.v) {<line [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="t.y" [attr.y2]="t.y" class="gl" /><text [attr.x]="L - 8" [attr.y]="t.y + 4" class="ax" text-anchor="end">{{ t.v }}</text>}
          <text class="ax" transform="rotate(-90)" [attr.x]="-(TP + (H - TP - B) / 2)" y="11" text-anchor="middle">Visitors</text>
          @for (x of tr.xs; track $index) {<text [attr.x]="x.x" [attr.y]="H - B + 15" class="ax" text-anchor="middle">{{ x.a }}</text><text [attr.x]="x.x" [attr.y]="H - B + 27" class="ax" text-anchor="middle">{{ x.b }}</text>}
          <path [attr.d]="tr.area" fill="url(#vmhG)" />
          <line [attr.x1]="tr.tip.x" [attr.x2]="tr.tip.x" [attr.y1]="tr.tip.y" [attr.y2]="H - B" class="vl" />
          @for (s of tr.series; track s.c) {
            <path [attr.d]="s.d" fill="none" [attr.stroke]="s.c" stroke-width="2.2" />
            @for (p of s.pts; track $index) {<circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.4" fill="var(--ka-ffffff)" [attr.stroke]="s.c" stroke-width="2" />}
          }
          <circle [attr.cx]="tr.tip.x" [attr.cy]="tr.tip.y" r="6" fill="var(--ka-ffffff)" stroke="var(--kl-7c3aed)" stroke-width="3" />
          <g [attr.transform]="'translate(' + tr.tip.bx + ',' + (tr.tip.y - 36) + ')'">
            <rect width="124" height="28" rx="5" fill="var(--ka-6d28d9)" /><text x="62" y="12" class="tt" text-anchor="middle">{{ tr.tip.l1 }}</text><text x="62" y="23" class="tt" text-anchor="middle">{{ tr.tip.l2 }}</text>
          </g>
        </svg>
        <div class="lg c">
          <span><i class="ln" style="--c:var(--ka-8b3dff)"></i>Total Visitors ({{ fmt(tr.sums[0]) }})</span>
          <span><i class="ln" style="--c:var(--ka-22a447)"></i>Checked In ({{ fmt(tr.sums[1]) }})</span>
          <span><i class="ln" style="--c:var(--ka-3b82f6)"></i>Checked Out ({{ fmt(tr.sums[2]) }})</span>
        </div>
      </div>
    </ng-template>

    <ng-template #typesT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="users" [size]="21" />Visitor Types</h2></div>
        @let dn = donut();
        <div class="donut">
          <svg viewBox="0 0 180 180" width="150" height="150">
            @for (s of dn.segs; track s.label) {
              @if (s.len > 0) {<circle cx="90" cy="90" r="64" fill="none" [attr.stroke]="s.color" stroke-width="34" [attr.stroke-dasharray]="s.len + ' ' + (C - s.len)" [attr.stroke-dashoffset]="-s.off" transform="rotate(-90 90 90)" class="seg-c" [class.dim]="vtype() && vtype() !== s.label" (click)="toggleType(s.label)" />}
            }
            @for (s of dn.segs; track s.label) {
              @if (s.pct >= 5) {<text [attr.x]="s.lx" [attr.y]="s.ly + 4" text-anchor="middle" class="dl-t">{{ s.pct }}%</text>}
            }
            <text x="90" y="88" text-anchor="middle" class="dc1">{{ fmt(dn.total) }}</text>
            <text x="90" y="106" text-anchor="middle" class="dc2">Visitors</text>
          </svg>
          <div class="dleg">
            @for (s of dn.segs; track s.label) {
              <button [class.on]="vtype() === s.label" (click)="toggleType(s.label)"><i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ fmt(s.n) }} ({{ s.pct }}%)</b></button>
            }
          </div>
        </div>
      </div>
    </ng-template>

    <ng-template #purposeT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="tasks-tag" [size]="21" />Visit Purpose</h2></div>
        <div class="pb">
          @for (p of purposeMix(); track p.label) {
            <button class="pr" [class.on]="purpose() === p.label" [class.dim]="purpose() && purpose() !== p.label" (click)="togglePurpose(p.label)" [title]="p.v + ' visits'">
              <span>{{ p.label }}</span><div class="trk"><i [style.width.%]="p.w" [style.background]="p.color"></i></div><b>{{ p.pct }}%</b>
            </button>
          }
        </div>
      </div>
    </ng-template>

    <ng-template #peakT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="clock" [size]="21" />Peak Hours &amp; Occupancy</h2></div>
        @let pk = peak();
        <svg [attr.viewBox]="'0 0 ' + CW + ' ' + CH" class="chart" (mouseleave)="peakHover.set(null)">
          <rect [attr.x]="pk.band.x" [attr.y]="CT - 4" [attr.width]="pk.band.w" [attr.height]="CH - CT - CB + 4" fill="var(--ka-ede9fe)" rx="3" />
          @for (t of pk.ticks; track t.v) {<line [attr.x1]="CL" [attr.x2]="CW - CR" [attr.y1]="t.y" [attr.y2]="t.y" class="gl" /><text [attr.x]="CL - 6" [attr.y]="t.y + 4" class="ax" text-anchor="end">{{ t.v }}</text><text [attr.x]="CW - CR + 6" [attr.y]="t.y + 4" class="ax">{{ t.v }}</text>}
          <text class="ax" transform="rotate(-90)" [attr.x]="-(CT + (CH - CT - CB) / 2)" y="10" text-anchor="middle">Arrivals</text>
          <text class="ax" transform="rotate(90)" [attr.x]="CT + (CH - CT - CB) / 2" [attr.y]="-(CW - 6)" text-anchor="middle">Occupancy</text>
          @for (b of pk.bars; track $index) {
            <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="2" [attr.fill]="b.hot ? 'var(--ka-8b3dff)' : 'var(--ka-a78bfa)'" [attr.opacity]="peakHover() === null || peakHover() === $index ? 1 : .55" (mouseenter)="peakHover.set($index)" class="bar-r" />
            <text [attr.x]="b.cx" [attr.y]="CH - CB + 14" class="ax" text-anchor="middle">{{ b.a }}</text><text [attr.x]="b.cx" [attr.y]="CH - CB + 25" class="ax" text-anchor="middle">{{ b.b }}</text>
          }
          <path [attr.d]="pk.line" fill="none" stroke="var(--kl-f97316)" stroke-width="2.2" />
          @for (p of pk.pts; track $index) {<circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="var(--ka-ffffff)" stroke="var(--kl-f97316)" stroke-width="2" />}
          <g [attr.transform]="'translate(' + pk.tip.x + ',4)'"><rect width="130" height="30" rx="5" fill="var(--ka-6d28d9)" /><text x="65" y="13" class="tt" text-anchor="middle">{{ pk.tip.l1 }}</text><text x="65" y="25" class="tt" text-anchor="middle">{{ pk.tip.l2 }}</text></g>
        </svg>
        <div class="lg c"><span><i style="background:var(--kb-8b3dff)"></i>Visitor Arrivals</span><span><i class="ln" style="--c:var(--ka-f97316)"></i>Occupancy (On-Site)</span></div>
      </div>
    </ng-template>

    <ng-template #sitesT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="building" [size]="21" />Site Comparison</h2></div>
        <table class="vm-table st">
          <thead><tr><th>Site</th><th>Visitors</th><th>Check-In Rate</th><th>Avg. Duration</th></tr></thead>
          <tbody>
            @for (s of sites(); track s.site) {
              <tr class="click" [class.sel]="site() === s.site" (click)="toggleSite(s.site)" title="Filter dashboard by this site">
                <td>{{ s.site }}</td>
                <td><div class="sh"><div class="trk"><i [style.width.%]="s.w"></i></div><span class="num">{{ fmt(s.v) }}</span></div></td>
                <td><span class="rate" [class.warn]="s.rate < 95">{{ s.rate.toFixed(1) }}%</span></td>
                <td>{{ fmtDur(s.dur) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>

    <ng-template #hostsT>
      <div class="vm-card">
        <div class="ch"><h2><app-icon name="users" [size]="21" />Top Hosts by Visits</h2></div>
        <table class="vm-table st">
          <thead><tr><th>#</th><th>Host</th><th>Visits</th><th>Share</th></tr></thead>
          <tbody>
            @for (h of hosts().slice(0, 5); track h.name; let i = $index) {
              <tr class="click" (click)="hostSel.set(h.name); setTab('Hosts')" title="Open host performance">
                <td><span class="rk" [attr.data-r]="i + 1">{{ i + 1 }}</span></td>
                <td><div class="vm-person"><vm-avatar [name]="h.name" [size]="24" />{{ h.name }}</div></td>
                <td>{{ h.v }}</td>
                <td><div class="sh"><div class="trk"><i [style.width.%]="h.share * 12"></i></div>{{ h.share }}%</div></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>

    <!-- ===== modals ===== -->
    @if (draft(); as d) {
      <div class="g-overlay" (click)="draft.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>Create Report</h3><button type="button" class="close-btn" (click)="draft.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report name<input class="input" [value]="d.name" (input)="patchDraft('name', $any($event.target).value)" placeholder="e.g. Weekly Visitor Summary" /></label>
          <label>Report type<select class="input" [value]="d.kind" (change)="patchDraft('kind', $any($event.target).value)">@for (k of kinds; track k) {<option [value]="k">{{ k }}</option>}</select></label>
          <label>Scope<select class="input" [value]="d.scope" (change)="patchDraft('scope', $any($event.target).value)"><option>All Sites</option><option>Main Campus</option>@for (s of siteRows; track s.site) {<option [value]="s.site">{{ s.site }}</option>}</select></label>
          <label>Period<select class="input" [value]="d.period" (change)="patchDraft('period', $any($event.target).value)">@for (r of ranges; track r.key) {<option [value]="r.label">{{ r.label }}</option>}</select></label>
          <label>Format<select class="input" [value]="d.format" (change)="patchDraft('format', $any($event.target).value)"><option>CSV</option><option>PDF</option><option>XLSX</option></select></label>
        </div>
        <p class="lbl2">Include sections</p>
        <div class="chk">@for (s of sections; track s) {<label><input type="checkbox" [checked]="d.sections.includes(s)" (change)="flipSection(s)" />{{ s }}</label>}</div>
        @if (err()) {<p class="err-t">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="draft.set(null)">Cancel</button><button class="btn-primary" type="submit">Generate Report</button></div>
      </form>
    }
    @if (sched(); as s) {
      <div class="g-overlay" (click)="sched.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSchedule()">
        <div class="modal-head"><h3>Schedule Report</h3><button type="button" class="close-btn" (click)="sched.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report<select class="input" [value]="'' + s.id" (change)="patchSched('id', +$any($event.target).value)">@for (r of reports(); track r.id) {<option [value]="'' + r.id">{{ r.name }} · {{ r.period }}</option>}</select></label>
          <label>Frequency<select class="input" [value]="s.freq" (change)="patchSched('freq', $any($event.target).value)"><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>
          <label>{{ s.freq === 'Monthly' ? 'Day of month' : s.freq === 'Weekly' ? 'Day' : 'Days' }}
            <select class="input" [value]="s.day" (change)="patchSched('day', $any($event.target).value)">
              @if (s.freq === 'Monthly') {<option>1st</option><option>15th</option><option>Last day</option>} @else if (s.freq === 'Weekly') {<option>Mon</option><option>Tue</option><option>Wed</option><option>Thu</option><option>Fri</option>} @else {<option>Weekdays</option><option>Every day</option>}
            </select></label>
          <label>Time<select class="input" [value]="s.time" (change)="patchSched('time', $any($event.target).value)"><option>07:00 AM</option><option>08:00 AM</option><option>09:00 AM</option><option>06:00 PM</option></select></label>
          <label>Format<select class="input" [value]="s.format" (change)="patchSched('format', $any($event.target).value)"><option>CSV</option><option>PDF</option><option>XLSX</option></select></label>
          <label class="full">Recipients (comma separated)<input class="input" [value]="s.to" (input)="patchSched('to', $any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="err-t">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="sched.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Schedule</button></div>
      </form>
    }
    @if (viewRep(); as r) {
      <div class="g-overlay" (click)="viewRep.set(null)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>{{ r.name }}</h3><button type="button" class="close-btn" (click)="viewRep.set(null)">×</button></div>
        <div class="meta"><span><b>Scope</b>{{ r.scope }}</span><span><b>Period</b>{{ r.period }}</span><span><b>Created by</b>{{ r.by }}</span><span><b>Last run</b>{{ r.lastRun }}</span><span><b>Format</b>{{ r.format }}</span>@if (r.schedule) {<span><b>Schedule</b>{{ r.schedule }}</span>}</div>
        <div class="mk"><div><small>Total Visitors</small><b>{{ kpi().total }}</b></div><div><small>Avg. Duration</small><b>{{ kpi().dur }}</b></div><div><small>Check-In Success</small><b>{{ kpi().rate }}</b></div><div><small>Peak Occupancy</small><b>{{ kpi().peak }}</b></div></div>
        @let rows = repRows(r);
        <div class="tblw"><table class="vm-table"><thead><tr>@for (h of rows[0]; track $index) {<th>{{ h }}</th>}</tr></thead><tbody>@for (row of rows.slice(1); track $index) {<tr>@for (c of row; track $index) {<td>{{ c }}</td>}</tr>}</tbody></table></div>
        <div class="form-actions"><button class="btn-ghost" (click)="viewRep.set(null); openSchedule(r)">Schedule</button><button class="btn-primary" (click)="download(r)"><app-icon name="download" [size]="15" /> Download {{ r.format === 'CSV' ? 'CSV' : 'CSV export' }}</button></div>
      </div>
    }
    @if (toast.msg()) {<div class="g-toast">{{ toast.msg() }}</div>}
  `,
  styles: `
    .an { gap: 12px; }
    :host ::ng-deep vm-avatar { overflow: hidden; display: inline-block; flex: none; }
    :host ::ng-deep vm-avatar svg > rect:not([fill]) { fill: var(--ka-ece7ff); }
    .crumb { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text); margin-bottom: 2px; }
    .crumb a { color: var(--text); text-decoration: none; display: inline-flex; } .crumb b { font-weight: 600; }
    .vm-head h1 { font-size: 30px; }
    .hb { height: 38px; padding: 0 16px; display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; }
    .vm-icon-btn.tall { height: 38px; width: 38px; }
    .menu-wrap { position: relative; }
    .dropdown { left: 0; right: auto; min-width: 200px; z-index: 30; } .dropdown.right { left: auto; right: 0; }
    .dd-item.on { color: var(--primary); font-weight: 700; }
    .vm-kpis { gap: 12px; }
    :host ::ng-deep .vm-kpi { padding: 12px 14px; }
    :host ::ng-deep .vm-kpi-ic { width: 56px; height: 56px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .bar { display: flex; align-items: center; gap: 7px; }
    .range { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; white-space: nowrap; color: var(--text); }
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); padding: 2px; }
    .seg button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 500; padding: 6px 9px; border-radius: 6px; cursor: pointer; color: var(--text); white-space: nowrap; }
    .seg button app-icon { color: var(--primary); }
    .seg button.on { background: var(--primary); color: var(--kf-ffffff); font-weight: 600; } .seg button.on app-icon { color: var(--kf-ffffff); }
    .seg button:not(.on):hover { background: var(--kb-f5f0ff); }
    .bar .vm-filter { height: 38px; font-size: 12.5px; flex: 0 1 auto; min-width: 0; gap: 4px; }
    .bar .vm-filter select { font-size: 12.5px; width: 84px; min-width: 0; } .bar .vm-filter:nth-of-type(3) select { width: 98px; }
    .bar .vm-icon-btn { height: 38px; width: 38px; }
    .spin app-icon { animation: sp .7s linear; } @keyframes sp { to { transform: rotate(360deg); } }
    .g { display: grid; gap: 12px; align-items: stretch; }
    .g1 { grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr) minmax(0, 1.04fr); }
    .g2 { grid-template-columns: minmax(0, .9fr) minmax(0, 1.12fr) minmax(0, .98fr); }
    .gt { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
    .gs { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
    .gp { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); }
    .vm-card { padding: 12px 14px; }
    .ch { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .ch h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 9px; white-space: nowrap; }
    .ch h2 app-icon { color: var(--primary); }
    .sub { font-size: 12.5px; color: var(--text); white-space: nowrap; }
    .chart { width: 100%; height: auto; display: block; }
    .gl { stroke: var(--kl-ececf3); stroke-width: 1; } .vl { stroke: var(--kl-7c3aed); stroke-dasharray: 3 3; }
    .ax { font-size: 10.5px; fill: var(--ka-333333); }
    .tt { font-size: 10.5px; fill: var(--ka-ffffff); font-weight: 600; }
    .lg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; margin-top: 4px; } .lg.c { justify-content: center; }
    .lg span { display: inline-flex; align-items: center; gap: 6px; }
    .lg i { width: 12px; height: 10px; border-radius: 2px; display: inline-block; }
    .lg i.ln { width: 18px; height: 2px; background: var(--c); position: relative; }
    .lg i.ln::after { content: ''; position: absolute; left: 5px; top: -3px; width: 6px; height: 6px; border-radius: 50%; border: 2px solid var(--c); background: var(--kb-ffffff); box-sizing: border-box; }
    .donut { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
    .donut svg { flex: none; }
    .seg-c { cursor: pointer; transition: opacity .15s; } .seg-c.dim { opacity: .3; }
    .dl-t { font-size: 12px; font-weight: 700; fill: var(--ka-ffffff); pointer-events: none; }
    .dc1 { font-size: 22px; font-weight: 800; fill: var(--text); } .dc2 { font-size: 13px; fill: var(--text); }
    .dleg { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
    .dleg button { display: grid; grid-template-columns: 10px 1fr auto; gap: 6px; align-items: center; border: 0; background: none; font: inherit; font-size: 12px; text-align: left; cursor: pointer; padding: 3px 4px; border-radius: 6px; color: var(--text); }
    .dleg button:hover, .dleg button.on { background: var(--kb-f5f0ff); }
    .dleg i { width: 11px; height: 11px; border-radius: 50%; } .dleg b { font-weight: 500; white-space: nowrap; }
    .pb { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }
    .pr { display: grid; grid-template-columns: 118px 1fr 40px; gap: 10px; align-items: center; border: 0; background: none; font: inherit; font-size: 13px; padding: 4px 4px; border-radius: 6px; cursor: pointer; text-align: left; color: var(--text); }
    .pr span { font-weight: 600; } .pr b { text-align: right; font-weight: 500; }
    .pr:hover, .pr.on { background: var(--kb-f5f0ff); } .pr.dim { opacity: .45; }
    .trk { height: 10px; background: var(--kb-eeeef4); border-radius: 6px; overflow: hidden; flex: 1; min-width: 30px; }
    .trk i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, var(--kb-6d28d9), var(--kb-8b5cf6)); max-width: 100%; }
    .trk.big { height: 14px; }
    .bar-r { cursor: pointer; }
    .vm-table th { padding: 7px 8px; font-size: 12.5px; }
    .vm-table td { padding: 7px 8px; font-size: 13px; }
    .st th, .st td { padding: 6px 5px; white-space: nowrap; font-size: 12.5px; }
    .sh { display: flex; align-items: center; gap: 8px; } .sh .trk { height: 9px; min-width: 36px; } .num { min-width: 28px; text-align: right; }
    .rate { display: inline-block; padding: 2px 8px; border-radius: 6px; background: var(--kb-dcfce7); color: var(--kf-166534); font-weight: 600; font-size: 12.5px; }
    .rate.warn { background: var(--kb-ffedd5); color: var(--kf-c2410c); }
    .rk { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--kb-ede9fe); color: var(--kf-4c1d95); font-size: 12px; font-weight: 700; }
    .rk[data-r='1'] { background: var(--kb-fef3c7); color: var(--kf-a16207); } .rk[data-r='2'] { background: var(--kb-f1f5f9); color: var(--kf-334155); } .rk[data-r='3'] { background: var(--kb-ffedd5); color: var(--kf-c2410c); }
    .vm-person { gap: 8px; }
    .rn { display: flex; align-items: center; gap: 8px; white-space: nowrap; } .rn app-icon { color: var(--kf-334155); } .rn b { font-weight: 600; }
    .reps .vm-acts { gap: 8px; } .reps .vm-mini { padding: 3px 12px; }
    .mx, .po { display: grid; grid-template-columns: 150px 1fr 40px; gap: 10px; align-items: center; font-size: 12.5px; padding: 7px 0; }
    .mx b, .po b { text-align: right; }
    .stack { display: flex; height: 14px; border-radius: 6px; overflow: hidden; background: var(--kb-eeeeee); } .stack i { display: block; height: 100%; }
    .note { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
    .dl { color: var(--kf-15803d); font-weight: 600; } .dl.neg { color: var(--kf-dc2626); }
    .meta { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 13px; margin-bottom: 12px; } .meta b { display: block; font-size: 11.5px; color: var(--muted); font-weight: 500; }
    .mk { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
    .mk div { background: var(--kb-f6f4ff); border-radius: 10px; padding: 10px 12px; } .mk small { display: block; font-size: 12px; } .mk b { font-size: 20px; }
    .tblw { max-height: 320px; overflow: auto; }
    .lbl2 { font-size: 12px; color: var(--kf-4b4f6b); margin: 14px 0 6px; }
    .chk { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 13px; } .chk label { display: flex; gap: 8px; align-items: center; } .chk input { accent-color: var(--primary); }
    .err-t { color: var(--kf-dc2626); font-size: 12.5px; margin: 8px 0 0; }
    @media print { .bar, .vm-actions { display: none; } }
  `,
})
export class VisitorAnalytics {
  private readonly router = inject(Router);
  protected readonly toast = new Toaster();
  protected readonly W = W; protected readonly H = H; protected readonly L = L; protected readonly R = R; protected readonly TP = TP; protected readonly B = B;
  protected readonly CW = CW; protected readonly CH = CH; protected readonly CL = CL; protected readonly CR = CR; protected readonly CT = CT; protected readonly CB = CB;
  protected readonly C = 2 * Math.PI * 64;
  protected readonly tabs = TABS;
  protected readonly ranges = RANGES;
  protected readonly siteRows = SITE_ROWS;
  protected readonly types = TYPES;
  protected readonly purposes = PURPOSES;
  protected readonly kinds = REPORT_KINDS;
  protected readonly sections = SECTIONS;
  protected readonly fmt = fmt;
  protected readonly fmtDur = fmtDur;

  protected readonly tab = signal<Tab>('Overview');
  protected readonly rangeKey = signal('oct');
  protected readonly site = signal('');
  protected readonly vtype = signal('');
  protected readonly purpose = signal('');
  protected readonly menu = signal<string | null>(null);
  protected readonly spin = signal(false);
  protected readonly trendHover = signal<number | null>(null);
  protected readonly peakHover = signal<number | null>(null);
  protected readonly hostSel = signal<string | null>(null);
  protected readonly reports = signal<AnReport[]>(REPORTS.map((r) => ({ ...r })));
  protected readonly viewRep = signal<AnReport | null>(null);
  protected readonly draft = signal<{ name: string; kind: string; scope: string; period: string; format: string; sections: string[] } | null>(null);
  protected readonly sched = signal<{ id: number; freq: string; day: string; time: string; format: string; to: string } | null>(null);
  protected readonly err = signal('');

  protected readonly range = computed(() => RANGES.find((r) => r.key === this.rangeKey())!);
  private readonly siteF = computed(() => { const s = SITE_ROWS.find((x) => x.site === this.site()); return s ? s.n / 1248 : 1; });
  private readonly typeF = computed(() => { const t = TYPES.find((x) => x.label === this.vtype()); return t ? t.n / 1248 : 1; });
  private readonly purpF = computed(() => { const p = PURPOSES.find((x) => x.label === this.purpose()); return p ? p.n / 100 : 1; });
  private readonly dimF = computed(() => this.siteF() * this.typeF() * this.purpF());

  protected readonly kpi = computed(() => {
    const r = this.range(), f = this.dimF();
    const s = SITE_ROWS.find((x) => x.site === this.site());
    const dur = this.purpose() ? PURPOSE_DUR[this.purpose()][0] : s ? s.dur : 102;
    const rate = this.vtype() ? TYPE_RATE[this.vtype()] : s ? s.rate : 96.4;
    const peakAt = r.key === 'oct' || r.key === '7d' ? 'Today 11:00 AM' : r.key === 'sep' ? '12 Sep · 11:00 AM' : '18 Aug · 11:00 AM';
    return { total: fmt(Math.round(1248 * r.f * f)), dur: fmtDur(dur), rate: rate.toFixed(1) + '%', peak: Math.round(186 * f * (r.key === 'q3' ? 1.08 : r.key === 'sep' ? 1.04 : 1)), peakAt, d: r.deltas };
  });

  protected readonly trend = computed(() => {
    const r = this.range(), k = this.dimF();
    const data = [r.total, r.inn, r.out].map((a) => a.map((v) => Math.max(0, Math.round(v * k))));
    const n = data[0].length, max = Math.max(...data[0], 1);
    const top = Math.max(6, Math.ceil((max * 1.1) / 6 / (max > 60 ? 10 : 1)) * (max > 60 ? 10 : 1) * 6);
    const step = (W - L - R) / (n - 1);
    const x = (i: number) => L + i * step, y = (v: number) => TP + (H - TP - B) * (1 - v / top);
    const colors = ['var(--ka-8b3dff)', 'var(--ka-22a447)', 'var(--ka-3b82f6)'];
    const series = data.map((a, j) => { const pts = a.map((v, i) => ({ x: x(i), y: y(v) })); return { c: colors[j], pts, d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') }; });
    const area = `${series[0].d} L${x(n - 1)} ${H - B} L${x(0)} ${H - B} Z`;
    const peakI = data[0].indexOf(max);
    const hi = Math.min(this.trendHover() ?? peakI, n - 1);
    const [a, b] = two(r.labels[hi]);
    const date = b === 'wk' ? `Week ${a.slice(1)}, 2026` : `${a} ${b} 2026`;
    const tip = { x: x(hi), y: y(data[0][hi]), bx: Math.min(Math.max(x(hi) - 62, L), W - R - 124), l1: `${hi === peakI ? 'Peak: ' : ''}${data[0][hi]} visitors`, l2: date };
    return {
      n, series, area, tip, sums: [1248, 1203, 1198].map((v) => Math.round(v * r.f * k)),
      ticks: Array.from({ length: 7 }, (_, i) => ({ v: Math.round((top / 6) * i), y: y((top / 6) * i) })),
      xs: r.labels.map((l, i) => { const [p, q] = two(l); return { x: x(i), a: p, b: q === 'wk' ? '' : q }; }),
    };
  });

  protected readonly donut = computed(() => {
    const f = this.range().f * this.siteF() * this.purpF(), t = this.vtype();
    const segs0 = TYPES.map((s) => ({ ...s, n: t && t !== s.label ? 0 : Math.round(s.n * f) }));
    const total = segs0.reduce((a, s) => a + s.n, 0) || 1;
    let off = 0;
    const segs = segs0.map((s) => {
      const len = (s.n / total) * this.C, mid = ((off + len / 2) / this.C) * 2 * Math.PI - Math.PI / 2;
      const o = { ...s, pct: Math.round((s.n / total) * 100), len, off, lx: 90 + 64 * Math.cos(mid), ly: 90 + 64 * Math.sin(mid) };
      off += len; return o;
    });
    return { segs, total };
  });

  protected readonly purposeMix = computed(() => {
    const p = this.purpose(), f = this.range().f * this.siteF() * this.typeF();
    return PURPOSES.map((x) => { const on = x.label === p; return { ...x, pct: p ? (on ? 100 : 0) : x.n, w: p ? (on ? 100 : 0) : x.n * 2.1, v: Math.round(1248 * f * (p ? (on ? 1 : 0) : x.n / 100)) }; });
  });
  protected readonly purposeRows = computed(() => {
    const f = this.range().f * this.siteF() * this.typeF();
    return PURPOSES.map((p) => ({ ...p, pct: p.n, v: Math.round(1248 * f * p.n / 100), dur: PURPOSE_DUR[p.label][0], top: PURPOSE_DUR[p.label][1] }));
  });

  protected readonly peak = computed(() => {
    const f = this.dimF();
    const arr = ARRIVALS.map((v) => Math.round(v * f)), occ = OCCUPANCY.map((v) => Math.round(v * f));
    const max = Math.max(...arr, ...occ, 1);
    const top = Math.max(5, Math.ceil((max * 1.02) / 5 / (max > 50 ? 8 : 1)) * (max > 50 ? 8 : 1) * 5);
    const n = arr.length, step = (CW - CL - CR) / n, bw = step * 0.62;
    const y = (v: number) => CT + (CH - CT - CB) * (1 - v / top);
    let pi = 0; for (let i = 0; i < n - 1; i++) if (arr[i] + arr[i + 1] > arr[pi] + arr[pi + 1]) pi = i;
    const bars = arr.map((v, i) => { const [a, b] = two(HOURS[i]); const cx = CL + step * (i + 0.5); return { x: cx - bw / 2, cx, w: bw, y: y(v), h: CH - CB - y(v), a, b, hot: i === pi || i === pi + 1 }; });
    const pts = occ.map((v, i) => ({ x: CL + step * (i + 0.5), y: y(v) }));
    const lbl = (i: number) => HOURS[i].replace('|', ' ');
    const h = this.peakHover();
    const tip = h == null
      ? { x: Math.min(CL + step * (pi + 1) - 65, CW - CR - 130), l1: `Peak Arrivals: ${arr[pi] + arr[pi + 1]}`, l2: `(${lbl(pi)} – ${lbl(Math.min(pi + 2, n - 1))})` }
      : { x: Math.max(CL, Math.min(CL + step * (h + 0.5) - 65, CW - CR - 130)), l1: `${lbl(h)}: ${arr[h]} arrivals`, l2: `${occ[h]} visitors on-site` };
    return {
      bars, pts, tip, line: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
      band: { x: CL + step * pi + 2, w: step * 2 + step * 0.5 },
      ticks: Array.from({ length: 6 }, (_, i) => ({ v: Math.round((top / 5) * i), y: y((top / 5) * i) })),
    };
  });

  protected readonly sites = computed(() => {
    const f = this.range().f * this.typeF() * this.purpF();
    const l = SITE_ROWS.map((s) => ({ ...s, v: Math.round(s.n * f), peak: Math.round(s.peak * this.typeF() * this.purpF()) }));
    const max = Math.max(...l.map((s) => s.v), 1);
    return l.map((s) => ({ ...s, w: (s.v / max) * 100 }));
  });
  protected readonly hosts = computed(() => {
    const f = this.range().f * this.dimF();
    return HOST_ROWS.map((h) => ({ ...h, v: Math.max(0, Math.round(h.n * f)), share: +((h.n / 1248) * 100).toFixed(1) }));
  });
  protected readonly daily = computed(() => {
    const r = this.range(), k = this.dimF();
    const avg = r.total.reduce((a, v) => a + v, 0) / r.total.length;
    return r.labels.map((l, i) => {
      const t = Math.round(r.total[i] * k), inn = Math.round(r.inn[i] * k), out = Math.round(r.out[i] * k);
      return { i, label: l.replace('|', ' ').replace(' wk', ''), t, inn, out, rate: t ? Math.min(99.9, 93 + ((i * 7) % 6) + 0.4).toFixed(1) : '0.0', vs: Math.round(((r.total[i] - avg) / avg) * 100) };
    });
  });
  protected readonly mixBySite = computed(() => SITE_ROWS.map((s, j) => {
    const w = [[0.58, 0.2, 0.16, 0.06], [0.5, 0.31, 0.13, 0.06], [0.4, 0.22, 0.12, 0.26], [0.55, 0.28, 0.12, 0.05]][j];
    const tot = Math.round(s.n * this.range().f * this.purpF());
    return { site: s.site, total: tot, parts: TYPES.map((t, i) => ({ label: t.label, color: t.color, pct: w[i] * 100, n: Math.round(tot * w[i]) })) };
  }));

  protected up(d: string) { return !d.startsWith('-'); }
  protected toggle(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected setTab(t: Tab) { this.tab.set(t); }
  protected closeAll() { this.menu.set(null); this.draft.set(null); this.sched.set(null); this.viewRep.set(null); }
  protected go(p: string) { this.menu.set(null); this.router.navigate(['/visitor-management', p]); }
  protected toggleType(t: string) { this.vtype.set(this.vtype() === t ? '' : t); }
  protected togglePurpose(p: string) { this.purpose.set(this.purpose() === p ? '' : p); }
  protected toggleSite(s: string) { this.site.set(this.site() === s ? '' : s); this.toast.show(this.site() ? `Dashboard filtered to ${s}` : 'Site filter cleared'); }
  protected reset() {
    this.site.set(''); this.vtype.set(''); this.purpose.set(''); this.trendHover.set(null); this.hostSel.set(null);
    this.spin.set(true); setTimeout(() => this.spin.set(false), 700);
    this.toast.show('Analytics refreshed · filters cleared');
  }
  protected hoverTrend(e: MouseEvent, n: number) {
    const el = e.currentTarget as SVGSVGElement, rc = el.getBoundingClientRect();
    const vx = ((e.clientX - rc.left) / rc.width) * W;
    this.trendHover.set(Math.max(0, Math.min(n - 1, Math.round((vx - L) / ((W - L - R) / (n - 1))))));
  }

  // ---------- reports ----------
  protected openCreate() { this.err.set(''); this.draft.set({ name: '', kind: REPORT_KINDS[0], scope: this.site() || 'All Sites', period: this.range().label, format: 'CSV', sections: SECTIONS.slice(0, 4) }); }
  protected patchDraft(k: 'name' | 'kind' | 'scope' | 'period' | 'format', v: string) { this.draft.update((d) => (d ? { ...d, [k]: v } : d)); }
  protected flipSection(s: string) { this.draft.update((d) => (d ? { ...d, sections: d.sections.includes(s) ? d.sections.filter((x) => x !== s) : [...d.sections, s] } : d)); }
  protected create() {
    const d = this.draft(); if (!d) return;
    if (!d.sections.length) { this.err.set('Select at least one section.'); return; }
    const id = Math.max(...this.reports().map((r) => r.id)) + 1;
    const name = d.name.trim() || d.kind;
    this.reports.update((l) => [{ id, name, kind: d.kind, scope: d.scope, period: d.period, by: 'Demo login', lastRun: 'Today 10:24 AM', status: 'Generating', format: d.format }, ...l]);
    this.draft.set(null);
    this.toast.show(`Generating “${name}”…`);
    setTimeout(() => { this.reports.update((l) => l.map((r) => (r.id === id ? { ...r, status: r.status === 'Generating' ? 'Ready' : r.status } : r))); this.toast.show(`“${name}” is ready to view or download`); }, 1800);
  }
  protected openSchedule(r: AnReport | null) { this.err.set(''); this.sched.set({ id: r?.id ?? this.reports()[0].id, freq: 'Weekly', day: 'Mon', time: '08:00 AM', format: r?.format ?? 'PDF', to: 'priya.sharma@purpleiq.com, security.admin@purpleiq.com' }); }
  protected patchSched(k: 'id' | 'freq' | 'day' | 'time' | 'format' | 'to', v: string | number) {
    this.sched.update((s) => {
      if (!s) return s;
      const n = { ...s, [k]: v };
      if (k === 'freq') n.day = v === 'Monthly' ? '1st' : v === 'Weekly' ? 'Mon' : 'Weekdays';
      return n;
    });
  }
  protected saveSchedule() {
    const s = this.sched(); if (!s) return;
    const to = s.to.split(',').map((x) => x.trim()).filter(Boolean);
    if (!to.length || to.some((x) => !/^\S+@\S+\.\S+$/.test(x))) { this.err.set('Enter valid recipient email addresses.'); return; }
    const schedule = `${s.freq} · ${s.day} ${s.time}`;
    const r = this.reports().find((x) => x.id === s.id)!;
    this.reports.update((l) => l.map((x) => (x.id === s.id ? { ...x, status: 'Scheduled', schedule, format: s.format } : x)));
    this.sched.set(null);
    this.toast.show(`“${r.name}” scheduled ${schedule} → ${to.length} recipient${to.length > 1 ? 's' : ''}`);
  }
  protected repRows(r: AnReport): (string | number)[][] {
    const k = r.kind;
    if (k === 'Visitor Purpose Analysis') return [['Purpose', 'Visits', 'Share', 'Avg. Duration', 'Top Site'], ...this.purposeRows().map((p) => [p.label, p.v, p.pct + '%', fmtDur(p.dur), p.top])];
    if (k === 'Security & Compliance Report' || k === 'Site Comparison Report') return [['Site', 'Visitors', 'Check-In Rate', 'Avg. Duration', 'Peak Occupancy'], ...this.sites().map((s) => [s.site, s.v, s.rate.toFixed(1) + '%', fmtDur(s.dur), s.peak])];
    if (k === 'Host Performance Report') return [['Host', 'Department', 'Visits', 'Share', 'Avg. Duration', 'No-show'], ...this.hosts().map((h) => [h.name, h.dept, h.v, h.share + '%', fmtDur(h.dur), h.noShow + '%'])];
    if (k === 'Peak Hours & Occupancy') return [['Hour', 'Arrivals', 'On-Site'], ...HOURS.map((h, i) => [h.replace('|', ' '), ARRIVALS[i], OCCUPANCY[i]])];
    return [['Date', 'Total Visitors', 'Checked In', 'Checked Out', 'Check-In Rate'], ...this.daily().map((d) => [d.label, d.t, d.inn, d.out, d.rate + '%'])];
  }
  protected download(r: AnReport) {
    if (r.status === 'Generating') { this.toast.show('Report is still generating – try again in a moment'); return; }
    downloadCsv(`${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, this.repRows(r));
    this.toast.show(`Downloaded ${r.name} (CSV)`);
  }
  protected exportTab() {
    const t = this.tab();
    const kind = t === 'Hosts' ? 'Host Performance Report' : t === 'Sites' ? 'Site Comparison Report' : t === 'Purposes' ? 'Visitor Purpose Analysis' : 'Visitor Volume Summary';
    const rows: (string | number)[][] = [['Metric', 'Value'], ['Period', this.range().label], ['Site', this.site() || 'All Sites'], ['Visitor Type', this.vtype() || 'All Types'], ['Visit Purpose', this.purpose() || 'All Purposes'],
      ['Total Visitors', this.kpi().total], ['Avg. Visit Duration', this.kpi().dur], ['Check-In Success', this.kpi().rate], ['Peak Occupancy', this.kpi().peak], [], ...this.repRows({ kind } as AnReport)];
    downloadCsv(`visitor-analytics-${t.toLowerCase().replace(/\s+/g, '-')}.csv`, rows);
    this.toast.show(`Exported ${t} analytics (CSV)`);
  }
  protected copyLink() { navigator.clipboard?.writeText(location.href).catch(() => {}); this.menu.set(null); this.toast.show('Dashboard link copied'); }
  protected print() { window.print(); }
}
