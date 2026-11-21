import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { ScheduleModal, ShareModal } from './reports-modals';
import { CATEGORIES, DEFAULT_PARAMS, fmtDate, fmtNum, ME, MODULES, PreviewParams, previewFor, Report, ReportsStore, SITES } from './reports.data';
import { ReportPreview } from './reports-ui';

type SortKey = 'name' | 'module' | 'category' | 'type' | 'updated';

@Component({
  selector: 'app-reports-report-library',
  imports: [...UI, ReportPreview, ScheduleModal, ShareModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Report Library" parent="Reports &amp; Analytics" parentLink="/reports-analytics" subtitle="Access and run pre-built reports across all People360 modules or create your own reports.">
      <button class="btn-primary hb" (click)="go('custom-report-builder')"><app-icon name="plus" [size]="17" />Create Report</button>
      <button class="btn-ghost hb" (click)="go('scheduled-reports')"><app-icon name="calendar-days" [size]="16" />Scheduled Reports</button>
      <button class="btn-ghost hb" [class.on]="mine()" (click)="mine.set(!mine()); page.set(0)"><app-icon name="file-chart" [size]="16" />My Reports</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb dots" (click)="menu.set(menu() === 'head' ? null : 'head')" aria-label="More">⋮</button>
        @if (menu() === 'head') {
          <div class="dropdown">
            <button class="dd-item" (click)="exportCatalog()"><app-icon name="download" [size]="15" />Export catalogue (CSV)</button>
            <button class="dd-item" (click)="go('report-sharing-access')"><app-icon name="users" [size]="15" />Sharing &amp; access</button>
            <button class="dd-item" (click)="go('report-audit-trail')"><app-icon name="activity" [size]="15" />Audit trail</button>
            <button class="dd-item" (click)="resetFilters()"><app-icon name="refresh" [size]="15" />Reset filters</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpis">
      <button class="kc" (click)="setTab('all')"><span class="ki" style="background:var(--kb-2563eb)"><app-icon name="file-text" [size]="30" [stroke]="1.8" /></span>
        <div><small>Total Reports</small><b>{{ store.reports().length }}</b><em>Standard + Custom</em></div></button>
      <button class="kc" (click)="filterCat(topCat().name)"><span class="ki" style="background:var(--kb-16a34a)"><app-icon name="users" [size]="30" [stroke]="1.8" /></span>
        <div><small>Most Used Category</small><b class="txt">{{ topCat().name }}</b><em class="g">{{ topCat().count }} reports</em></div></button>
      <button class="kc" (click)="go('report-audit-trail')"><span class="ki" style="background:var(--kb-f59e0b)"><app-icon name="clock" [size]="30" [stroke]="1.8" /></span>
        <div><small>Reports Run (This Month)</small><b>{{ fmt(store.runsThisMonth()) }}</b><em><span class="g"><app-icon name="arrow-up" [size]="13" [stroke]="2.4" />18%</span> vs. last month</em></div></button>
      <button class="kc" (click)="go('scheduled-reports')"><span class="ki" style="background:var(--kb-7c3aed)"><app-icon name="users" [size]="30" [stroke]="1.8" /></span>
        <div><small>Scheduled Reports</small><b>{{ store.schedules().length }}</b><em>{{ dueToday() }} active schedules</em></div></button>
      <button class="kc" (click)="go('data-export')"><span class="ki" style="background:var(--kb-ef4444)"><app-icon name="download" [size]="30" [stroke]="1.8" /></span>
        <div><small>Report Exports</small><b>{{ store.exportsThisMonth() }}</b><em><span class="g"><app-icon name="arrow-up" [size]="13" [stroke]="2.4" />12%</span> vs. last month</em></div></button>
    </section>

    <section class="fbar">
      <div class="seg">
        <button [class.on]="tab() === 'all'" (click)="setTab('all')">All Reports</button>
        <button [class.on]="tab() === 'Standard'" (click)="setTab('Standard')">Standard Reports</button>
        <button [class.on]="tab() === 'Custom'" (click)="setTab('Custom')">Custom Reports</button>
      </div>
      <label class="srch"><app-icon name="search" [size]="16" /><input placeholder="Search reports by name, description or module..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
      <select class="fsel" [value]="mod()" (change)="mod.set($any($event.target).value); page.set(0)"><option value="">All Modules</option>@for (m of modules; track m) {<option [value]="m">{{ m }}</option>}</select>
      <select class="fsel" [value]="cat()" (change)="cat.set($any($event.target).value); page.set(0)"><option value="">All Categories</option>@for (c of categories; track c) {<option [value]="c">{{ c }}</option>}</select>
      <select class="fsel" [value]="rtype()" (change)="rtype.set($any($event.target).value); page.set(0)"><option value="">All Report Types</option><option value="Standard">Standard</option><option value="Custom">Custom</option><option value="Favorites">Favorites</option></select>
      <div class="menu-wrap">
        <button class="mf" [class.on]="moreCount()" (click)="menu.set(menu() === 'more' ? null : 'more')"><app-icon name="filter" [size]="16" />More Filters@if (moreCount()) {<span class="cnt">{{ moreCount() }}</span>}</button>
        @if (menu() === 'more') {
          <div class="dropdown mfp">
            <label>Created by<select class="select" [value]="by()" (change)="by.set($any($event.target).value); page.set(0)"><option value="">Anyone</option><option value="System">System (standard)</option>@for (a of authors(); track a) {<option [value]="a">{{ a }}</option>}</select></label>
            <label>Last updated<select class="select" [value]="since()" (change)="since.set(+$any($event.target).value); page.set(0)"><option value="0">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
            <label class="cb"><input type="checkbox" [checked]="favOnly()" (change)="favOnly.set(!favOnly()); page.set(0)" />Favorites only</label>
            <label class="cb"><input type="checkbox" [checked]="schedOnly()" (change)="schedOnly.set(!schedOnly()); page.set(0)" />Has an active schedule</label>
            <div class="mfa"><button class="link" (click)="by.set(''); since.set(0); favOnly.set(false); schedOnly.set(false)">Clear</button><button class="btn-primary btn-sm" (click)="menu.set(null)">Apply</button></div>
          </div>
        }
      </div>
    </section>

    <section class="main" [class.full]="!sel()">
      <div class="card tbl">
        <table class="rt">
          <thead><tr>
            <th class="c0"><input type="checkbox" [checked]="allChecked()" (change)="toggleAll()" /></th>
            @for (h of heads; track h[0]) {<th [class]="'h-' + h[0]" (click)="sortBy(h[0])">{{ h[1] }}@if (sort() === h[0]) {<span class="arr">{{ dir() > 0 ? '▲' : '▼' }}</span>}</th>}
            <th class="ac">Actions</th>
          </tr></thead>
          <tbody>
            @for (r of pageRows(); track r.id) {
              <tr [class.on]="selId() === r.id" (click)="select(r)">
                <td class="c0" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="checked().has(r.id)" (change)="toggle(r.id)" /></td>
                <td><div class="nm"><span class="ri" [style.background]="r.color"><app-icon [name]="r.icon" [size]="15" /></span><span class="nt">{{ r.name }}</span>@if (r.favorite) {<app-icon name="reports-star-fill" [size]="11" class="fav" />}</div></td>
                <td>{{ r.module }}</td><td>{{ r.category }}</td><td>{{ r.type }}</td><td>{{ fd(r.updated) }}</td>
                <td class="ac" (click)="$event.stopPropagation()">
                  <button class="run" [class.solid]="selId() === r.id" (click)="runRow(r)">Run</button>
                  <div class="menu-wrap rm">
                    <button class="more" (click)="menu.set(menu() === r.id ? null : r.id)" aria-label="Row actions">•••</button>
                    @if (menu() === r.id) {
                      <div class="dropdown">
                        <button class="dd-item" (click)="select(r); menu.set(null)"><app-icon name="eye" [size]="15" />View details</button>
                        <button class="dd-item" (click)="openSchedule(r)"><app-icon name="calendar-days" [size]="15" />Schedule</button>
                        <button class="dd-item" (click)="share.set(r); menu.set(null)"><app-icon name="reports-share" [size]="15" />Share</button>
                        <button class="dd-item" (click)="duplicate(r)"><app-icon name="reports-copy" [size]="15" />Duplicate as custom</button>
                        <button class="dd-item" (click)="store.toggleFavorite(r.id); menu.set(null)"><app-icon name="star" [size]="15" />{{ r.favorite ? 'Remove from favorites' : 'Add to favorites' }}</button>
                        @if (r.type === 'Custom') {<button class="dd-item" (click)="editInBuilder(r)"><app-icon name="reports-edit" [size]="15" />Edit in builder</button>
                          <button class="dd-item danger" (click)="del(r)"><app-icon name="reports-trash" [size]="15" />Delete</button>}
                      </div>
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No reports match your filters. <button class="link" (click)="resetFilters()">Reset filters</button></td></tr>
            }
          </tbody>
        </table>
        <div class="pg">
          @if (checked().size > 1) {
            <div class="bulk"><b>{{ checked().size }} selected</b><button class="link" (click)="bulkRun()">Run all</button><button class="link" (click)="bulkExport()">Export list</button><button class="link" (click)="bulkFav()">Add to favorites</button><button class="link" (click)="clearChecked()">Clear</button></div>
          } @else {
            <span>Showing {{ filtered().length ? page() * per + 1 : 0 }}–{{ min(filtered().length, (page() + 1) * per) }} of {{ filtered().length }} reports</span>
          }
          <div class="pages">
            <button [disabled]="page() === 0" (click)="page.set(page() - 1)">‹</button>
            @for (p of pageList(); track $index) {@if (p < 0) {<span>…</span>} @else {<button [class.on]="p === page()" (click)="page.set(p)">{{ p + 1 }}</button>}}
            <button [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)">›</button>
          </div>
        </div>
      </div>

      @if (sel(); as r) {
        <aside class="card det">
          <div class="dh">
            <span class="di" [style.background]="r.color"><app-icon [name]="r.icon" [size]="26" [stroke]="1.8" /></span>
            <div><h2>{{ r.name }}</h2><p>{{ r.description }}</p></div>
            <div class="dha">
              <button class="ib" [class.fav]="r.favorite" (click)="store.toggleFavorite(r.id)" [attr.aria-label]="r.favorite ? 'Unfavorite' : 'Favorite'"><app-icon [name]="r.favorite ? 'reports-star-fill' : 'star'" [size]="18" /></button>
              <button class="ib x" (click)="selId.set(null)" aria-label="Close">×</button>
            </div>
          </div>
          <dl class="facts">
            <dt>Module</dt><dd>{{ r.module }}</dd><dt>Category</dt><dd>{{ r.category }}</dd><dt>Report Type</dt><dd>{{ r.type }}</dd>
            <dt>Last Updated</dt><dd>{{ fd(r.updated) }}</dd><dt>Created By</dt><dd>{{ r.createdBy }}</dd>
          </dl>
          <div class="db">
            <button class="btn-primary" [disabled]="running()" (click)="runSelected()"><app-icon [name]="running() ? 'refresh' : 'file-text'" [size]="15" [class.spin]="running()" />{{ running() ? 'Running…' : 'Run Report' }}</button>
            <button class="btn-ghost" (click)="openSchedule(r)"><app-icon name="clock" [size]="16" />Schedule Report</button>
          </div>
          <h3>Report Parameters</h3>
          <div class="params">
            <label><span>Site <i>*</i></span><select [value]="draft().site" (change)="setP('site', $any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
            <label><span>Date Range <i>*</i></span><span class="dr"><select [value]="draft().range" (change)="setP('range', $any($event.target).value)">@for (d of ranges; track d) {<option [value]="d">{{ d }}</option>}</select><app-icon name="calendar-days" [size]="15" /></span></label>
            <label>Building<select [value]="draft().building" (change)="setP('building', $any($event.target).value)">@for (b of buildings; track b) {<option [value]="b">{{ b }}</option>}</select></label>
            <label>Floor<select [value]="draft().floor" (change)="setP('floor', $any($event.target).value)">@for (f of floors; track f) {<option [value]="f">{{ f }}</option>}</select></label>
            <label>{{ p3().label }}<select [value]="draft().spaceType" (change)="setP('spaceType', $any($event.target).value)">@for (o of p3().options; track o) {<option [value]="o">{{ o === 'All Space Types' ? 'All ' + p3().label + 's' : o }}</option>}</select></label>
            <label>Department<select [value]="draft().department" (change)="setP('department', $any($event.target).value)"><option value="All Departments">All Departments</option>@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select></label>
          </div>
          <label class="cmp"><input type="checkbox" [checked]="draft().compare" (change)="setP('compare', !draft().compare)" />Include comparison with previous period</label>
          @if (dirty()) {<p class="hint">Parameters changed · click <b>Run Report</b> to refresh the preview.</p>}
        </aside>
      }
    </section>

    @if (sel(); as r) {
      <section class="card pv" [class.fs]="fullscreen()">
        <div class="pvh">
          <h3>Report Preview</h3>
          <div class="pt">@for (t of preview().tabs; track t; let i = $index) {<button [class.on]="ptab() === i" (click)="ptab.set(i)">{{ t }}</button>}</div>
          <div class="pva">
            <div class="menu-wrap">
              <button class="btn-ghost" (click)="menu.set(menu() === 'export' ? null : 'export')"><app-icon name="download" [size]="15" />Export<app-icon name="chevron-down" [size]="14" /></button>
              @if (menu() === 'export') {
                <div class="dropdown">
                  <button class="dd-item" (click)="exportPreview('CSV')"><app-icon name="reports-table" [size]="15" />CSV (.csv)</button>
                  <button class="dd-item" (click)="exportPreview('Excel')"><app-icon name="reports-table" [size]="15" />Excel (.xls)</button>
                  <button class="dd-item" (click)="exportPreview('PDF')"><app-icon name="reports-printer" [size]="15" />PDF (print)</button>
                </div>
              }
            </div>
            <button class="btn-ghost" (click)="share.set(r)"><app-icon name="reports-share" [size]="15" />Share</button>
            <button class="btn-ghost" (click)="fullscreen.set(!fullscreen())"><app-icon name="maximize" [size]="15" />{{ fullscreen() ? 'Exit Full Screen' : 'Full Screen' }}</button>
          </div>
        </div>
        <div class="pvb" [class.busy]="running()">
          <rpt-preview [preview]="preview()" [tab]="ptab()" [range]="applied().range" (rangeChanged)="setRange($event)" />
          @if (running()) {<div class="gen"><span class="spinner"></span>Generating {{ r.name }}…</div>}
        </div>
      </section>
    }

    @if (schedFor(); as r) {<rpt-schedule-modal [report]="r" (closed)="schedFor.set(null); $event && toastMsg($event)" />}
    @if (share(); as r) {<rpt-share-modal [report]="r" (closed)="share.set(null); $event && toastMsg($event)" />}
    @if (confirmDel(); as r) {
      <div class="g-overlay" (click)="confirmDel.set(null)"></div>
      <div class="g-modal sm"><div class="modal-head"><h3>Delete report?</h3><button class="close-btn" (click)="confirmDel.set(null)">×</button></div>
        <p><b>{{ r.name }}</b> will be removed from the library for everyone, along with its schedules.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="confirmDel.set(null)">Cancel</button><button class="btn-primary danger-b" (click)="doDelete(r)">Delete</button></div></div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    .hb { padding: 10px 18px; font-size: 13px; border-radius: 7px; } .btn-ghost.hb { color: var(--kf-2a2d4a); } .btn-ghost.on { background: var(--primary-soft); border-color: var(--kl-c4b5fd); color: var(--primary); }
    .dots { padding: 10px 14px; font-size: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .kc { display: flex; gap: 14px; align-items: center; padding: 12px 12px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 10px; text-align: left; cursor: pointer; font: inherit; color: inherit; min-width: 0; }
    .kc:hover { border-color: var(--kl-c4b5fd); }
    .ki { width: 60px; height: 58px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; }
    .kc div { display: flex; flex-direction: column; min-width: 0; } .kc small { font-size: 11.5px; color: var(--kf-3b3f5c); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kc b { font-size: 21px; font-weight: 700; margin: 4px 0 6px; } .kc b.txt { font-size: 17px; margin: 6px 0 7px; letter-spacing: -0.3px; }
    .kc em { font-style: normal; font-size: 12px; color: var(--kf-4b4f6b); white-space: nowrap; display: flex; align-items: center; gap: 6px; } .g { color: var(--kf-16a34a) !important; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; margin-right: 4px; }
    .fbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .seg { display: flex; gap: 4px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
    .seg button { border: 0; background: none; padding: 7px 17px; font-size: 12.5px; border-radius: 6px; cursor: pointer; color: var(--kf-2a2d4a); white-space: nowrap; }
    .seg button.on { background: var(--primary); color: var(--kf-ffffff); }
    .srch { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 6px; color: var(--kf-4b4f6b); min-width: 200px; }
    .srch input { border: 0; outline: 0; flex: 1; font: inherit; font-size: 11.5px; min-width: 0; }
    .fsel { height: 32px; width: 132px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--kb-ffffff); font: inherit; font-size: 11.5px; color: var(--kf-2a2d4a); }
    .fsel:nth-of-type(1) { width: 128px; } .fsel:nth-of-type(3) { width: 170px; }
    .mf { height: 32px; display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 6px; font: inherit; font-size: 12.5px; cursor: pointer; color: var(--kf-2a2d4a); }
    .mf.on { border-color: var(--primary); color: var(--primary); } .cnt { background: var(--primary); color: var(--kf-ffffff); border-radius: 10px; padding: 0 6px; font-size: 10.5px; }
    .mfp { width: 250px; padding: 12px; display: flex; flex-direction: column; gap: 10px; } .mfp label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); }
    .mfp label.cb { flex-direction: row; align-items: center; gap: 7px; } .mfa { display: flex; justify-content: space-between; align-items: center; }
    .main { display: grid; grid-template-columns: minmax(0, 1fr) 412px; gap: 14px; align-items: start; margin-bottom: 14px; } .main.full { grid-template-columns: 1fr; }
    .tbl { padding: 6px 10px 10px; display: flex; flex-direction: column; min-height: 470px; }
    .rt { width: 100%; border-collapse: collapse; font-size: 11.5px; color: var(--kf-2a2d4a); }
    .rt th { text-align: left; font-weight: 500; padding: 9px 6px; border-bottom: 1px solid var(--kl-eef0f6); cursor: pointer; white-space: nowrap; color: var(--kf-2a2d4a); } .arr { font-size: 8px; margin-left: 4px; color: var(--primary); }
    .rt td { padding: 4px 6px; height: 35px; border-bottom: 1px solid var(--kl-f2f3f8); white-space: nowrap; } .rt tbody tr { cursor: pointer; } .rt tbody tr:hover td { background: var(--kb-faf8ff); }
    .rt tr.on td { background: var(--kb-f1edff); } .rt tr.on td:first-child { box-shadow: inset 3px 0 0 var(--primary); }
    .c0 { width: 32px; text-align: center; } .c0 input { width: 13px; height: 13px; accent-color: var(--primary); }
    .h-name { width: 30%; } .ac { width: 92px; text-align: right; }
    .nm { display: flex; align-items: center; gap: 12px; } .nt { color: var(--kf-12142b); overflow: hidden; text-overflow: ellipsis; }
    .ri { width: 27px; height: 27px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); flex-shrink: 0; } .fav { color: var(--kf-f59e0b); }
    .ac { white-space: nowrap; } .run { border: 1px solid var(--border); background: var(--kb-ffffff); color: var(--primary); border-radius: 5px; padding: 5px 13px; font: inherit; font-size: 11.5px; cursor: pointer; }
    .run.solid, .run:hover { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .rm { display: inline-block; margin-left: 8px; } .more { border: 0; background: none; cursor: pointer; font-size: 10px; letter-spacing: -1px; color: var(--kf-2a2d4a); padding: 5px 6px; border-radius: 5px; } .rt tr.on .more { background: var(--kb-ffffff); }
    .rm .dropdown { text-align: left; }
    .empty { text-align: center; color: var(--muted); padding: 40px !important; }
    .pg { margin-top: auto; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--kf-4b4f6b); }
    .pages { display: flex; gap: 4px; align-items: center; } .pages button { min-width: 28px; height: 28px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; cursor: pointer; font-size: 12px; }
    .pages button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); } .pages button:disabled { opacity: 0.4; cursor: default; }
    .bulk { display: flex; gap: 14px; align-items: center; } .bulk b { color: var(--primary); }
    .det { padding: 14px 14px 12px; }
    .dh { display: grid; grid-template-columns: 46px 1fr auto; gap: 12px; align-items: start; }
    .di { width: 46px; height: 46px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .dh h2 { margin: 0 0 6px; font-size: 15.5px; font-weight: 700; letter-spacing: -0.2px; } .dh p { margin: 0; font-size: 11.5px; color: var(--kf-4b4f6b); line-height: 1.45; }
    .dha { display: flex; gap: 10px; } .ib { border: 0; background: none; cursor: pointer; color: var(--kf-2a2d4a); padding: 2px; } .ib.fav { color: var(--kf-f59e0b); } .ib.x { font-size: 24px; line-height: 16px; }
    .facts { display: grid; grid-template-columns: 78px 1fr; gap: 4px 0; margin: 18px 0 10px; font-size: 11.5px; color: var(--kf-2a2d4a); } .facts dd { margin: 0; }
    .db { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .db button { justify-content: center; padding: 8px; border-radius: 3px; font-weight: 500; }
    .det h3 { margin: 18px 0 10px; font-size: 13px; font-weight: 700; }
    .params { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; } .params label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--kf-3b3f5c); }
    .params i { color: var(--red); font-style: normal; } .params select { height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--kb-ffffff); font: inherit; font-size: 11px; width: 100%; }
    .dr { position: relative; display: block; } .dr select { appearance: none; } .dr app-icon { position: absolute; right: 8px; top: 6px; pointer-events: none; color: var(--kf-3b3f5c); }
    .cmp { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--kf-3b3f5c); margin-top: 12px; } .cmp input { accent-color: var(--primary); }
    .hint { margin: 8px 0 0; font-size: 11px; color: var(--kf-b45309); background: var(--kb-fef3c7); padding: 5px 8px; border-radius: 6px; }
    .spin { animation: sp 0.9s linear infinite; } @keyframes sp { to { transform: rotate(360deg); } }
    .pv { padding: 10px 8px 8px; }
    .pv.fs { position: fixed; inset: 12px; z-index: 80; overflow: auto; box-shadow: 0 20px 60px rgba(20, 20, 60, 0.35); }
    .pvh { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; } .pvh h3 { margin: 0 6px; font-size: 14.5px; font-weight: 700; letter-spacing: -0.3px; }
    .pt { display: flex; gap: 6px; flex-wrap: wrap; min-width: 0; } .pt button { border: 1px solid var(--border); background: var(--kb-ffffff); padding: 6px 12px; white-space: nowrap; border-radius: 4px; font: inherit; font-size: 11px; cursor: pointer; color: var(--kf-2a2d4a); }
    .pt button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .pva { margin-left: auto; display: flex; gap: 8px; flex-shrink: 0; } .pva .btn-ghost { font-weight: 500; padding: 7px 13px; border-radius: 4px; color: var(--kf-2a2d4a); font-size: 12px; }
    .pvb { position: relative; } .pvb.busy rpt-preview { opacity: 0.35; filter: blur(1px); transition: 0.2s; }
    .gen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; color: var(--primary); }
    .spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--kl-ddd6fe); border-top-color: var(--primary); animation: sp 0.8s linear infinite; }
    .g-modal.sm { width: min(440px, calc(100vw - 32px)); } .danger-b { background: var(--red); box-shadow: none; }
    @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .main { grid-template-columns: 1fr; } }
  `,
})
export class ReportLibrary {
  protected readonly store = inject(ReportsStore);
  private readonly router = inject(Router);
  protected readonly fmt = fmtNum;
  protected readonly fd = fmtDate;
  protected readonly min = Math.min;
  protected readonly modules = MODULES;
  protected readonly categories = CATEGORIES;
  protected readonly sites = ['All Sites', ...SITES];
  protected readonly ranges = ['Today', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days'];
  protected readonly buildings = ['All Buildings', 'Tower A', 'Tower B', 'Annex Building'];
  protected readonly floors = ['All Floors', 'Ground', 'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5', 'Floor 6'];
  protected readonly depts = ['Engineering', 'Operations', 'Finance', 'HR', 'Sales', 'IT', 'Facilities', 'Security'];
  protected readonly heads: [SortKey, string][] = [['name', 'Report Name'], ['module', 'Module'], ['category', 'Category'], ['type', 'Report Type'], ['updated', 'Last Updated']];
  protected readonly per = 10;

  protected readonly tab = signal<'all' | 'Standard' | 'Custom'>('all');
  protected readonly q = signal('');
  protected readonly mod = signal('');
  protected readonly cat = signal('');
  protected readonly rtype = signal('');
  protected readonly by = signal('');
  protected readonly since = signal(0);
  protected readonly favOnly = signal(false);
  protected readonly schedOnly = signal(false);
  protected readonly mine = signal(false);
  protected readonly sort = signal<SortKey>('updated');
  protected readonly dir = signal(-1);
  protected readonly page = signal(0);
  protected readonly menu = signal<string | null>(null);
  protected readonly selId = signal<string | null>(this.store.focusId() ?? 'RPT-1090');
  protected readonly checked = signal(new Set<string>([this.store.focusId() ?? 'RPT-1090']));
  protected readonly ptab = signal(0);
  protected readonly fullscreen = signal(false);
  protected readonly running = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly schedFor = signal<Report | null>(null);
  protected readonly share = signal<Report | null>(null);
  protected readonly confirmDel = signal<Report | null>(null);
  protected readonly draft = signal<PreviewParams>({ ...DEFAULT_PARAMS });
  protected readonly applied = signal<PreviewParams>({ ...DEFAULT_PARAMS });

  constructor() {
    // Space Utilization Report is the reference row; resolve its real id.
    const focus = this.store.focusId();
    const target = focus ?? this.store.reports().find((r) => r.name === 'Space Utilization Report')?.id ?? null;
    this.selId.set(target);
    this.checked.set(new Set(target ? [target] : []));
    this.store.focusId.set(null);
    if (focus) {
      const idx = this.filtered().findIndex((r) => r.id === focus);
      if (idx >= 0) this.page.set(Math.floor(idx / this.per));
    }
  }

  @HostListener('document:keydown.escape') esc() {
    this.fullscreen.set(false);
    this.menu.set(null);
  }
  @HostListener('document:click', ['$event']) outside(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.menu-wrap')) this.menu.set(null);
  }

  protected readonly topCat = computed(() => {
    const counts = new Map<string, number>();
    this.store.reports().forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
    const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];
    return { name, count };
  });
  protected readonly dueToday = computed(() => this.store.schedules().filter((s) => s.active && s.next.startsWith('2026-10-14')).length);
  protected readonly authors = computed(() => [...new Set(this.store.reports().map((r) => r.createdBy))].filter((a) => a !== 'System'));
  protected readonly moreCount = computed(() => (this.by() ? 1 : 0) + (this.since() ? 1 : 0) + (this.favOnly() ? 1 : 0) + (this.schedOnly() ? 1 : 0));
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const sched = new Set(this.store.schedules().filter((s) => s.active).map((s) => s.reportId));
    const sinceDate = this.since() ? new Date(Date.UTC(2026, 9, 14 - this.since())).toISOString().slice(0, 10) : '';
    const k = this.sort();
    const d = this.dir();
    return this.store
      .reports()
      .filter(
        (r) =>
          (this.tab() === 'all' || r.type === this.tab()) &&
          (!q || `${r.name} ${r.description} ${r.module} ${r.category}`.toLowerCase().includes(q)) &&
          (!this.mod() || r.module === this.mod()) &&
          (!this.cat() || r.category === this.cat()) &&
          (!this.rtype() || (this.rtype() === 'Favorites' ? r.favorite : r.type === this.rtype())) &&
          (!this.by() || r.createdBy === this.by()) &&
          (!sinceDate || r.updated >= sinceDate) &&
          (!this.favOnly() || r.favorite) &&
          (!this.schedOnly() || sched.has(r.id)) &&
          (!this.mine() || r.createdBy === ME || r.favorite),
      )
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (a.r[k] < b.r[k] ? -d : a.r[k] > b.r[k] ? d : a.i - b.i))
      .map((x) => x.r);
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.per)));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.per, (this.page() + 1) * this.per));
  protected readonly pageList = computed(() => {
    const n = this.pages();
    const c = this.page();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const set = [...new Set([0, 1, c - 1, c, c + 1, n - 2, n - 1].filter((x) => x >= 0 && x < n))].sort((a, b) => a - b);
    const out: number[] = [];
    set.forEach((x, i) => {
      if (i && x - set[i - 1] > 1) out.push(-1 - i);
      out.push(x);
    });
    return out;
  });
  protected readonly allChecked = computed(() => this.pageRows().length > 0 && this.pageRows().every((r) => this.checked().has(r.id)));
  protected readonly sel = computed(() => this.store.reports().find((r) => r.id === this.selId()) ?? null);
  protected readonly preview = computed(() => previewFor(this.sel() ?? this.store.reports()[0], this.applied()));
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.applied()));
  protected readonly p3 = computed(() => {
    const c = this.sel()?.category;
    if (c === 'Facilities') return { label: 'Space Type', options: ['All Space Types', 'Open Desks', 'Meeting Rooms', 'Focus Rooms', 'Collaboration Areas', 'Cafeteria'] };
    if (c === 'Security' || c === 'Visitors') return { label: 'Entry Point', options: ['All Space Types', 'Main Lobby', 'Gate 2', 'Loading Bay', 'Car Park'] };
    return { label: 'Employee Type', options: ['All Space Types', 'Full-time', 'Part-time', 'Contractor', 'Intern'] };
  });

  protected go(slug: string) {
    this.menu.set(null);
    this.router.navigateByUrl(`/reports-analytics/${slug}`);
  }
  protected setTab(t: 'all' | 'Standard' | 'Custom') {
    this.tab.set(t);
    this.page.set(0);
  }
  protected filterCat(c: string) {
    this.cat.set(c);
    this.page.set(0);
  }
  protected resetFilters() {
    this.menu.set(null);
    this.tab.set('all');
    this.q.set('');
    this.mod.set('');
    this.cat.set('');
    this.rtype.set('');
    this.by.set('');
    this.since.set(0);
    this.favOnly.set(false);
    this.schedOnly.set(false);
    this.mine.set(false);
    this.page.set(0);
  }
  protected sortBy(k: SortKey) {
    if (this.sort() === k) this.dir.set(-this.dir());
    else {
      this.sort.set(k);
      this.dir.set(k === 'updated' ? -1 : 1);
    }
  }
  protected toggle(id: string) {
    const s = new Set(this.checked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.checked.set(s);
  }
  protected clearChecked() {
    this.checked.set(new Set());
  }
  protected toggleAll() {
    const s = new Set(this.checked());
    const all = this.allChecked();
    this.pageRows().forEach((r) => (all ? s.delete(r.id) : s.add(r.id)));
    this.checked.set(s);
  }
  protected select(r: Report) {
    if (this.selId() !== r.id) {
      this.ptab.set(0);
      this.store.log('View', r.name, 'Opened report preview');
    }
    this.selId.set(r.id);
  }
  protected setP<K extends keyof PreviewParams>(k: K, v: PreviewParams[K]) {
    this.draft.update((p) => ({ ...p, [k]: v }));
  }
  protected setRange(range: string) {
    this.draft.update((p) => ({ ...p, range }));
    this.applied.update((p) => ({ ...p, range }));
  }
  protected runSelected() {
    const r = this.sel();
    if (!r) return;
    this.running.set(true);
    setTimeout(() => {
      const p = this.draft();
      this.applied.set({ ...p });
      this.store.run(r, `Generated with Site=${p.site}, Range=${p.range}, Floor=${p.floor}, Dept=${p.department}${p.compare ? ', with comparison' : ''}`);
      this.running.set(false);
      this.toastMsg(`${r.name} generated · ${fmtNum(this.preview().donut.total)} ${this.preview().unit} analysed`);
    }, 900);
  }
  protected runRow(r: Report) {
    this.select(r);
    this.runSelected();
  }
  protected openSchedule(r: Report) {
    this.menu.set(null);
    this.schedFor.set(r);
  }
  protected duplicate(r: Report) {
    this.menu.set(null);
    const c = this.store.addReport({ name: `${r.name} (Copy)`, module: r.module, category: r.category, type: 'Custom', description: r.description, icon: r.icon, color: r.color });
    this.resetFilters();
    this.selId.set(c.id);
    this.toastMsg(`Duplicated as custom report "${c.name}"`);
  }
  protected editInBuilder(r: Report) {
    this.store.focusId.set(r.id);
    this.go('custom-report-builder');
  }
  protected del(r: Report) {
    this.menu.set(null);
    this.confirmDel.set(r);
  }
  protected doDelete(r: Report) {
    this.store.deleteReport(r.id);
    this.store.schedules.update((l) => l.filter((s) => s.reportId !== r.id));
    if (this.selId() === r.id) this.selId.set(null);
    this.confirmDel.set(null);
    this.toastMsg(`${r.name} deleted`);
  }
  protected bulkRun() {
    const list = this.store.reports().filter((r) => this.checked().has(r.id));
    list.forEach((r) => this.store.run(r, 'Bulk run from Report Library'));
    this.toastMsg(`${list.length} reports queued and generated`);
  }
  protected bulkExport() {
    this.exportCatalog(this.store.reports().filter((r) => this.checked().has(r.id)));
  }
  protected bulkFav() {
    this.store.reports.update((l) => l.map((r) => (this.checked().has(r.id) ? { ...r, favorite: true } : r)));
    this.toastMsg(`${this.checked().size} reports added to favorites`);
  }
  protected exportCatalog(list = this.filtered()) {
    this.menu.set(null);
    downloadCsv('report-library.csv', [['ID', 'Report Name', 'Module', 'Category', 'Report Type', 'Last Updated', 'Created By', 'Runs (This Month)', 'Favorite'], ...list.map((r) => [r.id, r.name, r.module, r.category, r.type, r.updated, r.createdBy, r.runs, r.favorite ? 'Yes' : 'No'])]);
    this.toastMsg(`${list.length} reports exported to CSV`);
  }
  protected exportPreview(fmt: 'CSV' | 'Excel' | 'PDF') {
    this.menu.set(null);
    const r = this.sel()!;
    const p = this.preview();
    const a = this.applied();
    if (fmt === 'PDF') {
      this.store.addExport(r.name, 'PDF', p.trend.labels.length);
      setTimeout(() => window.print(), 50);
      return;
    }
    const rows: (string | number)[][] = [
      [r.name],
      ['Site', a.site, 'Date Range', a.range, 'Floor', a.floor, 'Department', a.department],
      [],
      [p.donut.title, `${p.donut.pct}%`, p.donut.totalLabel, p.donut.total],
      [],
      ['Date', ...p.trend.series.map((s) => s.name + ' %')],
      ...p.trend.labels.map((l, i) => [l, ...p.trend.series.map((s) => s.values[i])]),
      [],
      [p.breakdown.title, '%'],
      ...p.breakdown.rows.map((x) => [x.label, x.pct]),
    ];
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadCsv(`${slug}.${fmt === 'Excel' ? 'xls' : 'csv'}`, rows);
    this.store.addExport(r.name, fmt, rows.length);
    this.toastMsg(`${r.name} exported as ${fmt}`);
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
}
