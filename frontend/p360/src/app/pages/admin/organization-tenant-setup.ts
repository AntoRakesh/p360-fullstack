import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import {
  AdminStore, AuditEntry, COUNTRIES, CURRENCIES, fmtN, fmtStamp, INDUSTRIES, LANGUAGES, Org, RETENTION_OPTIONS, TENANT_TYPES, TIME_ZONES,
} from './admin.data';
import { AdminEntityModal, AdminLogo, AdminSwitch, AdminToast, auditIcon, EntityReq } from './admin-ui';
import { AuditDrawer } from './audit-drawer';

const TABS = ['Organization Details', 'Business Units', 'Departments', 'Sites & Locations', 'Branding & Preferences', 'Security & Policies', 'Subscription & Licensing', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];
type Kind = 'tenant' | 'sub' | 'bu' | 'site' | 'dept';
interface Node { key: string; kind: Kind; id: string; label: string; icon: string; color: string; users: number; children: Node[]; }
const BASE = '/administration-configuration/';

@Component({
  selector: 'app-admin-organization-tenant-setup',
  imports: [...UI, DataTable, NgTemplateOutlet, AdminSwitch, AdminToast, AdminLogo, AdminEntityModal, AuditDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Organization &amp; Tenant Setup" parent="Administration &amp; Configuration" parentLink="/administration-configuration"
      subtitle="Manage your organization structure, business units, departments, sites and tenant settings for People360.">
      <button class="btn-primary hb" (click)="modal.set({ kind: 'org' })"><app-icon name="plus" [size]="17" />Add Organization</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb" (click)="menu.set(menu() === 'actions' ? null : 'actions')"><app-icon name="settings" [size]="16" />Actions<app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'actions') {
          <div class="dropdown">
            <button class="dd-item" (click)="exportHierarchy()"><app-icon name="download" [size]="15" />Export hierarchy (CSV)</button>
            <button class="dd-item" (click)="exportProfile()"><app-icon name="file-text" [size]="15" />Export tenant profile (JSON)</button>
            <label class="dd-item"><app-icon name="admin-upload" [size]="15" />Import business units (CSV)<input type="file" accept=".csv" hidden (change)="importCsv($event)" /></label>
            <button class="dd-item" (click)="print()"><app-icon name="admin-printer" [size]="15" />Print organization chart</button>
            <button class="dd-item danger" (click)="resetDemo()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
      <div class="menu-wrap">
        <button class="btn-ghost hb sq" (click)="menu.set(menu() === 'more' ? null : 'more')" aria-label="More">⋮</button>
        @if (menu() === 'more') {
          <div class="dropdown">
            <button class="dd-item" (click)="copyTenantId()"><app-icon name="admin-copy" [size]="15" />Copy tenant ID ({{ store.org().tenantId }})</button>
            <button class="dd-item" (click)="tab.set('Audit Log'); menu.set(null)"><app-icon name="history" [size]="15" />View audit log</button>
            <button class="dd-item" (click)="go('subscription-licensing')"><app-icon name="admin-card" [size]="15" />Subscription &amp; licensing</button>
          </div>
        }
      </div>
    </app-page-head>

    <!-- KPI cards -->
    <section class="kpis">
      @for (k of kpis(); track k.label) {
        <button class="card kpi" (click)="kpiClick(k.label)">
          <span class="ki" [style.background]="k.color"><app-icon [name]="k.icon" [size]="34" [stroke]="1.7" /></span>
          <div><span class="kl">{{ k.label }}</span><b>{{ k.value }}</b><small>{{ k.sub }}</small></div>
        </button>
      }
    </section>

    <!-- Tabs -->
    <nav class="card tabbar">
      @for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}
    </nav>

    @switch (tab()) {
      @case ('Organization Details') {
        <section class="main">
          <!-- Hierarchy -->
          <div class="card hier">
            <h3 class="ct">Organization Hierarchy</h3>
            <div class="htools">
              <label class="hsearch"><app-icon name="search" [size]="15" /><input placeholder="Search organization, business unit, department, site..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
              <div class="menu-wrap">
                <button class="tb" [class.act]="hidden().size > 0" (click)="menu.set(menu() === 'filter' ? null : 'filter')" title="Filter" aria-label="Filter"><app-icon name="filter" [size]="16" /></button>
                @if (menu() === 'filter') {
                  <div class="dropdown fdrop" (click)="$event.stopPropagation()">
                    <small class="muted">Show in tree</small>
                    @for (f of kindFilters; track f.kind) {
                      <label class="dd-item"><input type="checkbox" [checked]="!hidden().has(f.kind)" (change)="toggleKind(f.kind)" />{{ f.label }}</label>
                    }
                    <label class="dd-item"><input type="checkbox" [checked]="showCounts()" (change)="showCounts.set(!showCounts())" />Show user counts</label>
                  </div>
                }
              </div>
              <button class="tb" (click)="toggleAll()" [title]="allOpen() ? 'Collapse all' : 'Expand all'" aria-label="Expand or collapse all"><app-icon [name]="allOpen() ? 'admin-collapse' : 'admin-expand'" [size]="15" /></button>
              <div class="menu-wrap">
                <button class="btn-primary addb" (click)="menu.set(menu() === 'add' ? null : 'add')"><app-icon name="plus" [size]="16" />Add</button>
                @if (menu() === 'add') {
                  <div class="dropdown">
                    <button class="dd-item" (click)="addUnder('bu')"><app-icon name="admin-bu" [size]="15" />Business unit</button>
                    <button class="dd-item" (click)="addUnder('site')"><app-icon name="admin-office" [size]="15" />Site / location{{ selBu() ? ' in ' + store.bu(selBu()!)?.code : '' }}</button>
                    <button class="dd-item" (click)="addUnder('dept')"><app-icon name="users" [size]="15" />Department{{ selSite() ? ' in ' + store.site(selSite()!)?.name : '' }}</button>
                  </div>
                }
              </div>
            </div>
            <div class="tree">
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: tree(), depth: 0 }" />
              @if (!tree().children.length && q()) {<p class="empty-note">No units match "{{ q() }}"</p>}
            </div>
          </div>

          <!-- Middle -->
          <div class="mid">
            <div class="card info">
              <div class="ch"><h3>Organization Information</h3>
                <div class="toolbar"><button class="btn-ghost" [disabled]="!dirty()" (click)="cancel()">Cancel</button><button class="btn-primary" [disabled]="!dirty()" (click)="saveOrg()">Save Changes</button></div>
              </div>
              @let d = draft();
              <div class="info-top">
                <div class="logo-box">
                  <b>Organization Logo</b>
                  <div class="logo-prev">
                    @if (d.logo === 'none') {<span class="nologo"><app-icon name="building" [size]="26" />No logo</span>} @else {<app-admin-logo [src]="d.logo" [size]="40" />}
                  </div>
                  <small>Recommended size: 300 x 100 px<br />(PNG, JPG)</small>
                  <div class="lbtns">
                    <label class="chipbtn pur">Change Logo<input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden (change)="pickLogo($event)" /></label>
                    <button class="chipbtn red" (click)="set('logo', 'none')"><app-icon name="admin-trash" [size]="12" />Remove</button>
                  </div>
                </div>
                <div class="f2">
                  <label><span>Organization Name <i>*</i></span><input class="input" [class.bad-in]="!d.name.trim()" [value]="d.name" (input)="set('name', val($event))" /></label>
                  <label>Tenant Type<select class="select" [value]="d.tenantType" (change)="set('tenantType', val($event))">@for (t of tenantTypes; track t) {<option>{{ t }}</option>}</select></label>
                  <label class="full">Industry<select class="select" [value]="d.industry" (change)="set('industry', val($event))">@for (t of industries; track t) {<option>{{ t }}</option>}</select></label>
                </div>
              </div>
              <div class="f3">
                <label>Short Name<input class="input" [value]="d.shortName" (input)="set('shortName', val($event))" /></label>
                <label>Website<input class="input" [value]="d.website" (input)="set('website', val($event))" /></label>
                <label>Primary Email<input class="input" type="email" [class.bad-in]="!emailOk()" [value]="d.email" (input)="set('email', val($event))" /></label>
                <label class="full">Address<input class="input" [value]="d.address" (input)="set('address', val($event))" /></label>
                <label>Country<select class="select" [value]="d.country" (change)="set('country', val($event))">@for (t of countries; track t) {<option>{{ t }}</option>}</select></label>
                <label>Time Zone<select class="select" [value]="d.timeZone" (change)="set('timeZone', val($event))">@for (t of zones; track t) {<option>{{ t }}</option>}</select></label>
                <label>Language<select class="select" [value]="d.language" (change)="set('language', val($event))">@for (t of languages; track t) {<option>{{ t }}</option>}</select></label>
              </div>
            </div>

            <div class="card ts">
              <h3 class="ct">Tenant Settings</h3>
              @let t = store.tenant();
              <div class="tgrid">
                <div class="tset">
                  <span class="si" style="background:var(--kb-7c3aed)"><app-icon name="admin-office" [size]="22" /></span>
                  <div><b>Enable Multi-Site</b><small>Manage multiple sites and locations under this tenant.</small></div>
                  <span class="tg"><app-admin-switch [on]="t.multiSite" (toggled)="toggle('multiSite', $event, 'Enable Multi-Site')" /><em [class.off]="!t.multiSite">{{ t.multiSite ? 'Enabled' : 'Disabled' }}</em></span>
                </div>
                <div class="tset">
                  <span class="si" style="background:var(--kb-2563eb)"><app-icon name="admin-sitemap" [size]="22" /></span>
                  <div><b>Allow Sub-Tenants</b><small>Create and manage sub-tenants for divisions or regions.</small></div>
                  <span class="tg"><app-admin-switch [on]="t.subTenants" (toggled)="toggle('subTenants', $event, 'Allow Sub-Tenants')" /><em [class.off]="!t.subTenants">{{ t.subTenants ? 'Enabled' : 'Disabled' }}</em></span>
                </div>
                <div class="tset">
                  <span class="si" style="background:var(--kb-10b981)"><app-icon name="shield-check" [size]="22" /></span>
                  <div><b>Enable SSO<br />(SAML/OIDC)</b><small>Allow single sign-on for users.</small></div>
                  <span class="tg"><app-admin-switch [on]="t.sso" (toggled)="toggle('sso', $event, 'Enable SSO (SAML/OIDC)')" /><em [class.off]="!t.sso">{{ t.sso ? 'Enabled' : 'Disabled' }}</em></span>
                </div>
                <div class="tset">
                  <span class="si" style="background:var(--kb-f59e0b)"><app-icon name="admin-lock" [size]="22" /></span>
                  <div><b>Role Based Access<br />Control</b><small>Enable RBAC for modules and features.</small></div>
                  <span class="tg"><app-admin-switch [on]="t.rbac" (toggled)="toggle('rbac', $event, 'Role Based Access Control')" /><em [class.off]="!t.rbac">{{ t.rbac ? 'Enabled' : 'Disabled' }}</em></span>
                </div>
                <div class="tset ret">
                  <span class="si" style="background:var(--kb-f43f5e)"><app-icon name="admin-database" [size]="22" /></span>
                  <div><b>Data Retention (Days)</b><small>Set default data retention period for logs and records.</small></div>
                  <select class="select sm" [value]="t.retentionDays" (change)="store.setTenant('retentionDays', +val($event), 'Data Retention (Days)'); store.toast('Default retention set to ' + val($event) + ' days')">
                    @for (r of retention; track r) {<option [value]="r">{{ r }}</option>}
                  </select>
                </div>
                <div class="tset cur">
                  <span class="si" style="background:var(--kb-7c3aed)"><app-icon name="admin-database" [size]="22" /></span>
                  <div><b>Default Currency</b>
                    <select class="select sm" [value]="t.currency" (change)="store.setTenant('currency', val($event), 'Default Currency'); store.toast('Default currency set to ' + val($event))">
                      @for (c of currencies; track c) {<option>{{ c }}</option>}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right -->
          <div class="right">
            <div class="card health">
              @let h = store.health();
              <div class="ch"><h3>Tenant Health</h3><span class="hp" [class.warn]="h.pct < 80"><app-icon [name]="h.pct < 80 ? 'triangle-alert' : 'admin-check-circle'" [size]="13" />{{ h.pct >= 80 ? 'Healthy' : 'Needs attention' }}</span></div>
              <div class="hb2">
                <div class="ring">
                  <svg viewBox="0 0 120 120">
                    <defs><linearGradient id="adm-ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="var(--ka-14b8a6)" /><stop offset="55%" stop-color="var(--ka-22c55e)" /><stop offset="100%" stop-color="var(--ka-2563eb)" /></linearGradient></defs>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--kl-e8ebf3)" stroke-width="12" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="url(#adm-ring)" stroke-width="12" [attr.stroke-dasharray]="(h.pct / 100) * 314.16 + ' 314.16'" transform="rotate(-90 60 60)" />
                  </svg>
                  <div><b>{{ h.pct }}%</b><span>Configuration<br />Complete</span></div>
                </div>
                <ul class="checks">
                  @for (i of h.items; track i.label) {
                    <li><button (click)="go(i.link)" [title]="i.done ? 'Configured' : 'Incomplete — open to finish'"><span class="ck" [class.no]="!i.done"><app-icon name="admin-check" [size]="10" [stroke]="3.4" /></span>{{ i.label }}</button></li>
                  }
                </ul>
              </div>
            </div>

            <div class="card recent">
              <div class="ch"><h3>Recent Changes</h3><button class="link" (click)="go('audit-logs')">View All</button></div>
              <ul>
                @for (e of recent(); track e.id) {
                  @let ic = icon(e.entity);
                  <li><button (click)="auditSel.set(e)">
                    <span class="ri" [style.background]="ic.bg" [style.color]="ic.color"><app-icon [name]="ic.icon" [size]="18" /></span>
                    <div><b>{{ e.entity === 'SSO Configuration' ? 'SSO Configuration' : e.entity + ' ' + e.action }}</b><small>{{ e.target }}</small><small>{{ stamp(e.at) }}</small></div>
                    <span class="av" [style.background]="e.color">{{ e.initials }}</span>
                  </button></li>
                }
              </ul>
            </div>

            <div class="card qa">
              <h3 class="ct">Quick Actions</h3>
              <div class="qgrid">
                <button (click)="modal.set({ kind: 'bu' })"><app-icon name="admin-sitemap" [size]="22" style="color:var(--kf-2563eb)" />Add Business Unit</button>
                <button (click)="modal.set({ kind: 'dept', parent: selSite() ?? 's-hq' })"><app-icon name="users" [size]="22" style="color:var(--kf-16a34a)" />Add Department</button>
                <button (click)="modal.set({ kind: 'site', parent: selBu() ?? 'bu-uae' })"><app-icon name="map-pin" [size]="22" style="color:var(--kf-f97316)" />Add Site / Location</button>
                <button (click)="go('user-group-management')"><app-icon name="users" [size]="22" style="color:var(--kf-e11d48)" />Manage Users</button>
              </div>
            </div>
          </div>
        </section>
      }

      @case ('Business Units') {
        <div class="card">
          <div class="card-head"><h3>Business Units <span class="card-sub">{{ store.bus().length }} units · {{ store.sites().length }} sites</span></h3><button class="btn-primary" (click)="modal.set({ kind: 'bu' })"><app-icon name="plus" [size]="15" />Add Business Unit</button></div>
          <div class="bus">
            @for (b of buStats(); track b.id) {
              <div class="bu">
                <div class="buh"><span class="flag">{{ b.flag }}</span><div><b>{{ b.name }}</b><small>{{ b.code }} · {{ b.country }}</small></div><span [class]="b.status === 'Active' ? 'tag green' : 'tag grey'">{{ b.status }}</span></div>
                <div class="bun"><div><b>{{ b.sites }}</b><small>Sites</small></div><div><b>{{ b.depts }}</b><small>Departments</small></div><div><b>{{ fmt(b.users) }}</b><small>Users</small></div></div>
                <small class="muted">Head: {{ b.head }} · since {{ b.created }}</small>
                <div class="toolbar"><button class="btn-ghost sm" (click)="modal.set({ kind: 'bu', id: b.id })">Edit</button><button class="btn-ghost sm" (click)="modal.set({ kind: 'site', parent: b.id })">+ Site</button><button class="btn-ghost sm" (click)="focusNode('bu', b.id)">Show in hierarchy</button></div>
              </div>
            }
          </div>
          @if (store.subTenants().length) {
            <h4 class="sth">Sub-tenants</h4>
            <ul class="stl">@for (s of store.subTenants(); track s.id) {<li><app-icon name="admin-sitemap" [size]="15" /><b>{{ s.name }}</b><span class="muted">{{ s.type }} · admin {{ s.admin }} · created {{ s.created }}</span></li>}</ul>
          }
        </div>
      }
      @case ('Departments') {
        <div class="card">
          <app-data-table [rows]="deptRows()" [columns]="deptCols" [filters]="deptFilters()" [actions]="deptActions" [searchKeys]="['name', 'site', 'head', 'bu']" searchPlaceholder="Search department, site, head..." noun="departments"
            (rowClick)="focusNode('dept', $event.id)" (action)="deptAct($event.action, $event.row)">
            <button class="btn-primary" (click)="modal.set({ kind: 'dept', parent: 's-hq' })"><app-icon name="plus" [size]="15" />Add Department</button>
          </app-data-table>
        </div>
      }
      @case ('Sites & Locations') {
        <div class="card">
          <app-data-table [rows]="siteRows()" [columns]="siteCols" [filters]="siteFilters()" [actions]="siteActions" [searchKeys]="['name', 'city', 'manager', 'bu']" searchPlaceholder="Search site, city, manager..." noun="sites"
            (rowClick)="focusNode('site', $event.id)" (action)="siteAct($event.action, $event.row)">
            <button class="btn-primary" (click)="modal.set({ kind: 'site', parent: 'bu-uae' })"><app-icon name="plus" [size]="15" />Add Site</button>
            <button class="btn-ghost" (click)="go('sites-locations')"><app-icon name="map-pin" [size]="15" />Map view</button>
          </app-data-table>
        </div>
      }
      @case ('Branding & Preferences') {
        @let b = store.branding;
        <div class="sum">
          <div class="card">
            <h3 class="ct">Brand</h3>
            <div class="brand-prev" [style.--p]="b().primary"><app-admin-logo [src]="store.org().logo === 'none' ? null : store.org().logo" [size]="34" [color]="b().primary" /><span class="pill-p">Primary button</span></div>
            <dl class="kv"><dt>Primary colour</dt><dd><i class="sw" [style.background]="b().primary"></i>{{ (b().primary.startsWith('#') ? b().primary : '#' + b().primary.slice(-7, -1)).toUpperCase() }}</dd><dt>Accent colour</dt><dd><i class="sw" [style.background]="b().accent"></i>{{ b().accent }}</dd><dt>Sidebar style</dt><dd>{{ b().sidebar }}</dd><dt>Font</dt><dd>{{ b().font }}</dd></dl>
            <button class="btn-outline" (click)="go('branding-localization')">Open Branding &amp; Localization</button>
          </div>
          <div class="card">
            <h3 class="ct">Regional preferences</h3>
            <dl class="kv"><dt>Default language</dt><dd>{{ store.org().language }}</dd><dt>Enabled languages</dt><dd>{{ store.localization().languages.join(', ') }}</dd><dt>Time zone</dt><dd>{{ store.org().timeZone }}</dd><dt>Date format</dt><dd>{{ store.localization().dateFormat }}</dd><dt>Currency</dt><dd>{{ store.tenant().currency }}</dd></dl>
            @if (store.missingTranslations()) {<p class="warnline"><app-icon name="triangle-alert" [size]="14" />{{ store.missingTranslations() }} UI strings are missing translations</p>} @else {<p class="okline"><app-icon name="admin-check-circle" [size]="14" />All translations complete</p>}
          </div>
        </div>
      }
      @case ('Security & Policies') {
        @let s = store.security();
        <div class="sum">
          <div class="card">
            <h3 class="ct">Authentication</h3>
            <ul class="pol">
              <li><div><b>Single sign-on</b><small>{{ s.idp }}</small></div><app-admin-switch [on]="store.tenant().sso" (toggled)="toggle('sso', $event, 'Enable SSO (SAML/OIDC)')" /></li>
              <li><div><b>Enforce SSO for all users</b><small>Disables local passwords except break-glass admins</small></div><app-admin-switch [on]="s.ssoEnforced" (toggled)="secPatch('ssoEnforced', $event, 'Enforce SSO')" /></li>
              <li><div><b>Multi-factor authentication</b><small>Who must use MFA</small></div>
                <select class="select sm" [value]="s.mfa" (change)="secPatch('mfa', val($event), 'MFA policy')"><option>Off</option><option>Required for admins</option><option>Required for all users</option></select></li>
              <li><div><b>IP allow-list</b><small>{{ s.ipAllowlist }}</small></div><app-admin-switch [on]="s.ipEnforced" (toggled)="secPatch('ipEnforced', $event, 'IP allow-list enforcement')" /></li>
            </ul>
          </div>
          <div class="card">
            <h3 class="ct">Password &amp; session policy</h3>
            <dl class="kv"><dt>Minimum length</dt><dd>{{ s.minLength }} characters</dd><dt>Complexity</dt><dd>{{ s.complexity ? 'Upper, lower, number, symbol' : 'None' }}</dd><dt>Expiry</dt><dd>{{ s.expiryDays }} days</dd><dt>History</dt><dd>Last {{ s.history }} passwords</dd><dt>Lockout</dt><dd>{{ s.lockout }} attempts · {{ s.lockoutMins }} min</dd><dt>Session timeout</dt><dd>{{ s.sessionMins }} min idle</dd><dt>RBAC</dt><dd>{{ store.tenant().rbac ? 'Enabled' : 'Disabled' }} · {{ store.roles().length }} roles</dd></dl>
            <div class="toolbar"><button class="btn-outline" (click)="go('system-settings')">Edit in System Settings</button><button class="btn-ghost" (click)="go('roles-permissions')">Roles &amp; Permissions</button></div>
          </div>
        </div>
      }
      @case ('Subscription & Licensing') {
        @let sub = store.subscription();
        <div class="sum">
          <div class="card">
            <h3 class="ct">{{ sub.plan }} plan <span class="tag green">Active</span></h3>
            <dl class="kv"><dt>Term</dt><dd>{{ sub.term }} · renews {{ sub.renewal }}</dd><dt>Seats</dt><dd>{{ fmt(store.seatsUsed()) }} of {{ fmt(sub.seats) }} used</dd><dt>Add-ons</dt><dd>{{ sub.addons.length }} active</dd><dt>Auto-renew</dt><dd>{{ sub.autoRenew ? 'On' : 'Off' }}</dd></dl>
            <div class="seatbar"><i [style.width.%]="(store.seatsUsed() / sub.seats) * 100"></i></div>
            <button class="btn-outline" (click)="go('subscription-licensing')">Manage subscription</button>
          </div>
          <div class="card">
            <h3 class="ct">Module licensing</h3>
            <app-bar-list [rows]="licRows()" [max]="26" />
          </div>
        </div>
      }
      @case ('Audit Log') {
        <div class="card">
          <app-data-table [rows]="auditRows()" [columns]="auditCols" [filters]="auditFilters" [searchKeys]="['target', 'actor', 'detail', 'entity']" searchPlaceholder="Search changes..." noun="changes" (rowClick)="auditSel.set($event)">
            <button class="btn-ghost" (click)="go('audit-logs')"><app-icon name="list-checks" [size]="15" />Full audit log</button>
          </app-data-table>
        </div>
      }
    }

    <!-- Tree node template -->
    <ng-template #nodeTpl let-n let-depth="depth">
      <div class="row" [class.sel]="sel() === n.key" [class.root]="n.kind === 'tenant'" [class]="'k-' + n.kind" (click)="clickNode(n)">
        @if (n.children.length) {
          <button class="chev" [class.open]="isOpen(n.key)" (click)="$event.stopPropagation(); toggleOpen(n.key)" aria-label="Expand"><app-icon name="chevron-down" [size]="15" [stroke]="2.4" /></button>
        } @else {<span class="chev"></span>}
        <span class="ni" [style.color]="n.color"><app-icon [name]="n.icon" [size]="n.kind === 'tenant' ? 22 : 19" /></span>
        <span class="nl">{{ n.label }}</span>
        @if (showCounts() && n.kind !== 'tenant') {<span class="cnt">{{ fmt(n.users) }}</span>}
        <div class="menu-wrap nm">
          <button class="ndots" [class.show]="n.kind === 'tenant' || nodeMenu() === n.key" (click)="$event.stopPropagation(); nodeMenu.set(nodeMenu() === n.key ? null : n.key)" aria-label="Node actions"><app-icon name="admin-dots-h" [size]="16" /></button>
          @if (nodeMenu() === n.key) {
            <div class="dropdown" (click)="$event.stopPropagation()">
              <button class="dd-item" (click)="details(n)"><app-icon name="file-text" [size]="15" />View details</button>
              @if (n.kind === 'tenant') {
                <button class="dd-item" (click)="nodeMenu.set(null); modal.set({ kind: 'bu' })"><app-icon name="plus" [size]="15" />Add business unit</button>
                <button class="dd-item" (click)="nodeMenu.set(null); modal.set({ kind: 'org' })"><app-icon name="admin-sitemap" [size]="15" />Add sub-tenant</button>
              }
              @if (n.kind === 'bu') {<button class="dd-item" (click)="nodeMenu.set(null); modal.set({ kind: 'site', parent: n.id })"><app-icon name="plus" [size]="15" />Add site</button>}
              @if (n.kind === 'site') {<button class="dd-item" (click)="nodeMenu.set(null); modal.set({ kind: 'dept', parent: n.id })"><app-icon name="plus" [size]="15" />Add department</button>}
              @if (n.kind === 'bu' || n.kind === 'site' || n.kind === 'dept') {
                <button class="dd-item" (click)="nodeMenu.set(null); modal.set({ kind: n.kind, id: n.id })"><app-icon name="admin-edit" [size]="15" />Edit</button>
                <button class="dd-item danger" (click)="remove(n)"><app-icon name="admin-trash" [size]="15" />Delete</button>
              }
            </div>
          }
        </div>
      </div>
      @if (n.children.length && isOpen(n.key)) {
        <div class="kids">
          @for (c of n.children; track c.key) {<ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: c, depth: depth + 1 }" />}
        </div>
      }
    </ng-template>

    @if (detail(); as n) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <aside class="g-drawer">
        <div class="dh"><span class="ri big" [style.color]="n.color"><app-icon [name]="n.icon" [size]="24" /></span><div><h3>{{ n.label }}</h3><small class="muted">{{ kindLabel(n.kind) }}</small></div><button class="close-btn" (click)="detail.set(null)">×</button></div>
        <div class="dstats"><div><b>{{ fmt(n.users) }}</b><small>Users</small></div><div><b>{{ n.children.length }}</b><small>{{ n.kind === 'tenant' ? 'Business units' : n.kind === 'bu' ? 'Sites' : n.kind === 'site' ? 'Departments' : 'Teams' }}</small></div></div>
        <dl class="kv">
          @for (f of detailFacts(n); track f[0]) {<dt>{{ f[0] }}</dt><dd>{{ f[1] }}</dd>}
        </dl>
        @if (n.children.length) {
          <h4>{{ n.kind === 'tenant' ? 'Business units' : n.kind === 'bu' ? 'Sites' : 'Departments' }}</h4>
          <ul class="dl">@for (c of n.children; track c.key) {<li><button (click)="detail.set(c)"><app-icon [name]="c.icon" [size]="15" />{{ c.label }}<span class="muted">{{ fmt(c.users) }} users</span></button></li>}</ul>
        }
        <div class="form-actions">
          @if (n.kind === 'bu' || n.kind === 'site' || n.kind === 'dept') {<button class="btn-ghost" (click)="detail.set(null); modal.set({ kind: n.kind, id: n.id })">Edit</button>}
          @if (n.kind === 'dept') {<button class="btn-ghost" (click)="go('departments-teams')">Teams</button>}
          @if (n.kind === 'site') {<button class="btn-ghost" (click)="go('sites-locations')">Open site</button>}
          <button class="btn-primary" (click)="detail.set(null)">Close</button>
        </div>
      </aside>
    }
    @if (modal(); as m) {<app-admin-entity-modal [req]="m" (closed)="modal.set(null)" />}
    @if (auditSel(); as a) {<app-admin-audit-drawer [entry]="a" (closed)="auditSel.set(null)" />}
    <app-admin-toast />
  `,
  styles: `
    :host { display: block; }
    .hb { height: 42px; padding: 0 18px; font-size: 13px; } .btn-ghost.hb { font-weight: 500; } .hb.sq { width: 42px; padding: 0; justify-content: center; font-size: 18px; }
    .danger { color: var(--red); } label.dd-item { cursor: pointer; }
    /* KPIs */
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .kpi { display: flex; align-items: center; gap: 22px; padding: 12px 14px; text-align: left; cursor: pointer; font: inherit; color: inherit; }
    .kpi:hover { border-color: var(--kl-c4b5fd); }
    .ki { width: 64px; height: 64px; border-radius: 10px; color: var(--kf-ffffff); display: grid; place-items: center; flex-shrink: 0; }
    .kpi div { display: flex; flex-direction: column; min-width: 0; } .kl { font-size: 13.5px; color: var(--kf-3b3f5c); } .kpi b { font-size: 22px; margin: 2px 0; } .kpi small { font-size: 13px; color: var(--kf-6b7a8c); }
    /* Tabs */
    .tabbar { display: flex; padding: 0; margin-bottom: 12px; overflow-x: auto; }
    .tabbar button { flex: 1 1 auto; border: 0; border-right: 1px solid var(--border); background: none; padding: 12px 14px 11px; font-size: 13px; color: var(--kf-3b3f5c); cursor: pointer; white-space: nowrap; border-bottom: 3px solid transparent; }
    .tabbar button:last-child { border-right: 0; } .tabbar button.on { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; } .tabbar button:hover { color: var(--primary); }
    /* Layout */
    .main { display: grid; grid-template-columns: minmax(0, 415fr) minmax(0, 512fr) minmax(0, 292fr); gap: 12px; align-items: stretch; }
    .mid, .right { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .ct { font-size: 16.5px; font-weight: 700; margin: 0 0 14px; }
    .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; } .ch h3 { font-size: 16.5px; font-weight: 700; }
    /* Hierarchy */
    .hier { display: flex; flex-direction: column; padding: 14px 12px; }
    .htools { display: flex; gap: 6px; margin-bottom: 12px; }
    .hsearch { flex: 1; display: flex; align-items: center; gap: 8px; padding: 0 10px; height: 34px; border: 1px solid var(--border); border-radius: 7px; color: var(--muted); min-width: 0; }
    .hsearch input { border: 0; outline: 0; font: inherit; font-size: 11.5px; flex: 1; min-width: 0; }
    .tb { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 7px; background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; color: var(--kf-3b3f5c); } .tb.act { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
    .addb { height: 34px; padding: 0 16px; }
    .fdrop { padding: 8px; } .fdrop small { display: block; padding: 2px 10px 6px; }
    .tree { flex: 1; overflow: auto; max-height: 640px; min-height: 300px; padding-right: 4px; }
    .row { position: relative; display: flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 6px; border-radius: 7px; cursor: pointer; font-size: 13.5px; }
    .row:hover { background: var(--kb-f7f5ff); } .row.sel { background: var(--kb-f1ecff); } .row.root { background: var(--kb-efeafd); min-height: 36px; font-weight: 600; font-size: 14px; }
    .row.k-bu { min-height: 37px; font-weight: 500; font-size: 13.5px; } .row.k-site .nl { font-weight: 400; } .row.k-dept { font-size: 13px; min-height: 31px; }
    .chev { width: 18px; height: 18px; border: 0; background: none; padding: 0; display: grid; place-items: center; cursor: pointer; color: var(--kf-3b3f5c); transform: rotate(-90deg); transition: transform 0.15s; flex-shrink: 0; }
    .chev.open { transform: none; } span.chev { cursor: default; }
    .row.k-dept span.chev { width: 6px; }
    .ni { display: grid; place-items: center; width: 22px; } .nl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cnt { font-size: 11px; color: var(--muted); background: var(--kb-f1f2f7); border-radius: 10px; padding: 1px 7px; }
    .ndots { border: 0; background: none; color: var(--kf-4b4f6b); cursor: pointer; padding: 2px 6px; border-radius: 5px; visibility: hidden; display: grid; place-items: center; } .ndots.show, .row:hover .ndots { visibility: visible; } .ndots:hover { background: var(--kb-e9e5fb); }
    .kids { border-left: 1px solid var(--kl-dcdfea); margin-left: 15px; padding-left: 4px; }
    .kids > .row::before { content: ''; position: absolute; left: -5px; top: 50%; width: 10px; border-top: 1px solid var(--kl-dcdfea); }
    /* Org info */
    .info { padding: 14px 14px 16px; }
    .ch .toolbar .btn-primary, .ch .toolbar .btn-ghost { height: 34px; padding: 0 22px; font-weight: 500; }
    .info-top { display: grid; grid-template-columns: 168px 1fr; gap: 14px; margin-bottom: 12px; }
    .logo-box { border: 1px solid var(--border); border-radius: 8px; padding: 12px 10px; display: flex; flex-direction: column; gap: 8px; } .logo-box > b { font-size: 11.5px; font-weight: 600; }
    .logo-prev { height: 50px; display: flex; align-items: center; } .nologo { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
    .logo-box small { font-size: 9.5px; color: var(--muted); line-height: 1.4; }
    .lbtns { display: flex; gap: 4px; } .chipbtn { display: inline-flex; align-items: center; gap: 3px; border: 0; border-radius: 5px; padding: 4px 5px; white-space: nowrap; font-size: 10px; cursor: pointer; font-family: inherit; }
    .chipbtn.pur { background: var(--kb-ede9fe); color: var(--kf-5b21b6); } .chipbtn.red { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .f2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 10px; align-content: start; } .f3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 10px; }
    .f2 label, .f3 label { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--kf-3b3f5c); min-width: 0; } .f2 i, .f3 i { color: var(--red); font-style: normal; }
    .full { grid-column: 1 / -1; }
    .f2 .input, .f2 .select, .f3 .input, .f3 .select { height: 32px; font-size: 11px; padding-left: 9px; font-weight: 400; padding-top: 0; padding-bottom: 0; min-width: 0; width: 100%; }
    .bad-in { border-color: var(--red) !important; }
    /* Tenant settings */
    .ts { padding: 14px; }
    .tgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .tset { position: relative; display: grid; grid-template-columns: 36px 1fr; gap: 10px; align-items: start; border: 1px solid var(--border); border-radius: 8px; padding: 10px; min-height: 66px; }
    .si { width: 36px; height: 36px; border-radius: 8px; color: var(--kf-ffffff); display: grid; place-items: center; }
    .tset b { display: block; font-size: 10.5px; font-weight: 600; } .tset small { display: block; font-size: 10.5px; color: var(--muted); margin-top: 3px; line-height: 1.35; }
    .tg { position: absolute; top: 9px; right: 8px; display: flex; align-items: center; gap: 4px; } .tset > div > b { padding-right: 82px; } .tset > .select { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 70px; } .tset.ret > div { padding-right: 76px; } .tset.ret > div > b { padding-right: 0; } .tg em { font-style: normal; font-size: 10px; color: var(--kf-16a34a); } .tg em.off { color: var(--muted); }
    .select.sm { height: 30px; font-size: 11.5px; padding-top: 0; padding-bottom: 0; align-self: center; }
    .tset.cur > div > b { padding-right: 0; } .tset.cur .select { margin-top: 6px; width: 100%; }
    /* Health */
    .health { padding: 14px; } .hp { display: inline-flex; align-items: center; gap: 5px; background: var(--kb-dcfce7); color: var(--kf-15803d); font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 6px; } .hp.warn { background: var(--kb-fef3c7); color: var(--kf-b45309); }
    .hb2 { display: flex; align-items: center; gap: 10px; }
    .ring { position: relative; width: 106px; height: 106px; flex-shrink: 0; } .ring svg { width: 100%; height: 100%; }
    .ring div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; } .ring b { font-size: 19px; } .ring span { font-size: 10px; color: var(--kf-3b3f5c); line-height: 1.3; }
    .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .checks button { display: flex; align-items: center; gap: 8px; border: 0; background: none; font: inherit; font-size: 11px; padding: 2px 0; cursor: pointer; color: var(--kf-3b3f5c); text-align: left; white-space: nowrap; } .checks button:hover { color: var(--primary); }
    .ck { width: 15px; height: 15px; border-radius: 50%; background: var(--kb-22c55e); color: var(--kf-ffffff); display: grid; place-items: center; flex-shrink: 0; } .ck.no { background: var(--kb-9ca3af); }
    /* Recent */
    .recent { padding: 14px 12px; } .recent ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .recent li button { width: 100%; display: grid; grid-template-columns: 34px 1fr 32px; gap: 8px; align-items: center; border: 0; background: none; padding: 3px 2px; text-align: left; cursor: pointer; border-radius: 7px; font: inherit; color: inherit; }
    .recent li button:hover { background: var(--kb-f7f5ff); }
    .ri { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; } .ri.big { width: 44px; height: 44px; background: var(--kb-f3f0ff); }
    .recent li div { display: flex; flex-direction: column; min-width: 0; } .recent b { font-size: 11.5px; font-weight: 600; } .recent small { font-size: 10px; color: var(--kf-4b4f6b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .av { width: 32px; height: 32px; border-radius: 50%; color: var(--kf-ffffff); font-size: 11px; font-weight: 600; display: grid; place-items: center; }
    /* Quick actions */
    .qa { padding: 14px 10px; } .qgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .qgrid button { display: flex; align-items: center; gap: 7px; height: 46px; padding: 0 8px; white-space: nowrap; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font: inherit; font-size: 10.5px; cursor: pointer; text-align: left; }
    .qgrid button:hover { border-color: var(--kl-c4b5fd); background: var(--kb-faf8ff); }
    /* Other tabs */
    .bus { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .bu { border: 1px solid var(--border); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .buh { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .buh div { display: flex; flex-direction: column; } .buh small { color: var(--muted); font-size: 11.5px; } .flag { font-size: 28px; }
    .bun { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .bun div { background: var(--kb-f7f7fb); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; } .bun b { font-size: 17px; } .bun small { font-size: 11px; color: var(--muted); }
    .sth { margin: 16px 0 8px; } .stl { list-style: none; padding: 0; margin: 0; } .stl li { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; color: var(--primary); } .stl b { color: var(--text); }
    .sum { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .kv { display: grid; grid-template-columns: 150px 1fr; gap: 9px 12px; font-size: 12.5px; margin: 0 0 14px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; display: flex; align-items: center; gap: 6px; }
    .sw { width: 16px; height: 16px; border-radius: 4px; display: inline-block; }
    .brand-prev { display: flex; align-items: center; justify-content: space-between; padding: 14px; border: 1px dashed var(--border); border-radius: 10px; margin-bottom: 14px; }
    .pill-p { background: var(--p); color: var(--kf-ffffff); padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; }
    .warnline, .okline { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--kf-b45309); } .okline { color: var(--kf-15803d); }
    .pol { list-style: none; margin: 0; padding: 0; } .pol li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .pol div { display: flex; flex-direction: column; font-size: 12.5px; } .pol small { color: var(--muted); }
    .seatbar { height: 8px; border-radius: 6px; background: var(--kb-eef0f6); margin-bottom: 14px; overflow: hidden; } .seatbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--kb-7c3aed), var(--kb-2563eb)); }
    /* drawer */
    .dh { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; margin-bottom: 14px; } .dh div { display: flex; flex-direction: column; }
    .dstats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; } .dstats div { background: var(--kb-f7f5ff); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; } .dstats b { font-size: 20px; } .dstats small { color: var(--muted); }
    h4 { font-size: 13px; margin: 6px 0 8px; } .dl { list-style: none; padding: 0; margin: 0; } .dl button { width: 100%; display: flex; gap: 8px; align-items: center; padding: 7px 4px; border: 0; border-bottom: 1px solid var(--kl-f0f1f6); background: none; font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; } .dl .muted { margin-left: auto; font-size: 11.5px; }
    @media (max-width: 1350px) { .main { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); } .right { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); } .kpis { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 900px) { .main, .sum { grid-template-columns: 1fr; } .right { grid-template-columns: 1fr; } .kpis { grid-template-columns: 1fr 1fr; } .f3, .tgrid { grid-template-columns: 1fr; } .info-top { grid-template-columns: 1fr; } }
  `,
})
export class OrganizationTenantSetup {
  protected readonly store = inject(AdminStore);
  private readonly router = inject(Router);
  protected readonly tabs = TABS;
  protected readonly tenantTypes = TENANT_TYPES;
  protected readonly industries = INDUSTRIES;
  protected readonly countries = COUNTRIES;
  protected readonly zones = TIME_ZONES;
  protected readonly languages = LANGUAGES;
  protected readonly currencies = CURRENCIES;
  protected readonly retention = RETENTION_OPTIONS;
  protected readonly fmt = fmtN;
  protected readonly stamp = fmtStamp;
  protected readonly icon = auditIcon;
  protected readonly kindFilters: { kind: Kind; label: string }[] = [
    { kind: 'bu', label: 'Business units' }, { kind: 'site', label: 'Sites & offices' }, { kind: 'dept', label: 'Departments' }, { kind: 'sub', label: 'Sub-tenants' },
  ];

  protected readonly tab = signal<Tab>('Organization Details');
  protected readonly menu = signal<string | null>(null);
  protected readonly nodeMenu = signal<string | null>(null);
  protected readonly modal = signal<EntityReq | null>(null);
  protected readonly auditSel = signal<AuditEntry | null>(null);
  protected readonly detail = signal<Node | null>(null);
  protected readonly q = signal('');
  protected readonly hidden = signal<Set<Kind>>(new Set());
  protected readonly showCounts = signal(false);
  protected readonly open = signal<Set<string>>(new Set(['tenant', 'bu:bu-uae', 'site:s-hq']));
  protected readonly sel = signal<string>('tenant');
  protected readonly draft = signal<Org>({ ...this.store.org() });

  protected readonly kpis = computed(() => {
    const s = this.store;
    return [
      { label: 'Organization', value: String(1 + s.subTenants().length), sub: s.subTenants().length ? `Active Tenant + ${s.subTenants().length} sub` : 'Active Tenant', icon: 'admin-office', color: 'var(--ka-7c3aed)' },
      { label: 'Business Units', value: String(s.bus().length), sub: s.bus().every((b) => b.status === 'Active') ? 'Active' : `${s.bus().filter((b) => b.status === 'Active').length} Active`, icon: 'admin-sitemap', color: 'var(--ka-2563eb)' },
      { label: 'Departments', value: String(s.depts().length), sub: 'Active', icon: 'users', color: 'var(--ka-10b981)' },
      { label: 'Sites & Locations', value: String(s.sites().length), sub: 'Active', icon: 'map-pin', color: 'var(--ka-f59e0b)' },
      { label: 'Users', value: fmtN(s.users().length), sub: 'Total Users', icon: 'users', color: 'var(--ka-f43f5e)' },
    ];
  });

  /* ---------- hierarchy ---------- */
  private readonly fullTree = computed<Node>(() => {
    const s = this.store;
    const byDept = s.usersByDept();
    const bus = s.bus().map<Node>((b) => {
      const sites = s.sites().filter((x) => x.buId === b.id).map<Node>((site) => {
        const depts = s.depts().filter((d) => d.siteId === site.id).map<Node>((d) => ({ key: `dept:${d.id}`, kind: 'dept', id: d.id, label: d.name, icon: 'users', color: 'var(--ka-2563eb)', users: byDept.get(d.id) ?? 0, children: [] }));
        return { key: `site:${site.id}`, kind: 'site', id: site.id, label: site.name, icon: site.type === 'Head Office' ? 'home' : 'admin-office', color: 'var(--ka-2563eb)', users: depts.reduce((a, d) => a + d.users, 0), children: depts };
      });
      return { key: `bu:${b.id}`, kind: 'bu', id: b.id, label: b.name, icon: 'admin-bu', color: 'var(--ka-2563eb)', users: sites.reduce((a, x) => a + x.users, 0), children: sites };
    });
    const subs = s.subTenants().map<Node>((t) => ({ key: `sub:${t.id}`, kind: 'sub', id: t.id, label: `${t.name} (Sub-Tenant)`, icon: 'admin-sitemap', color: 'var(--ka-7c3aed)', users: 0, children: [] }));
    return { key: 'tenant', kind: 'tenant', id: 'tenant', label: `${s.org().name} (Tenant)`, icon: 'admin-office', color: 'var(--ka-7c3aed)', users: s.users().length, children: [...bus, ...subs] };
  });
  protected readonly tree = computed<Node>(() => {
    const q = this.q().trim().toLowerCase();
    const hidden = this.hidden();
    // Hidden kinds are skipped but their children are lifted up so the tree stays navigable.
    const all = (n: Node): Node[] => (hidden.has(n.kind) ? n.children.flatMap(all) : [{ ...n, children: n.children.flatMap(all) }]);
    const walk = (n: Node): Node[] => {
      const self = !!q && n.label.toLowerCase().includes(q);
      // A matching node keeps its whole subtree; otherwise keep only matching descendants.
      if (!q || self) return all(n);
      const kids = n.children.flatMap(walk);
      if (!kids.length) return [];
      return hidden.has(n.kind) ? kids : [{ ...n, children: kids }];
    };
    const root = this.fullTree();
    return { ...root, children: root.children.flatMap(walk) };
  });
  protected readonly allOpen = computed(() => this.open().size > 6);
  protected readonly selBu = computed(() => {
    const k = this.sel();
    if (k.startsWith('bu:')) return k.slice(3);
    if (k.startsWith('site:')) return this.store.site(k.slice(5))?.buId ?? null;
    if (k.startsWith('dept:')) return this.store.site(this.store.dept(k.slice(5))?.siteId ?? '')?.buId ?? null;
    return null;
  });
  protected readonly selSite = computed(() => {
    const k = this.sel();
    if (k.startsWith('site:')) return k.slice(5);
    if (k.startsWith('dept:')) return this.store.dept(k.slice(5))?.siteId ?? null;
    return null;
  });
  protected isOpen(key: string) {
    return !!this.q().trim() || this.open().has(key);
  }
  protected toggleOpen(key: string) {
    this.open.update((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  protected toggleAll() {
    if (this.allOpen()) return this.open.set(new Set(['tenant']));
    const all = new Set<string>();
    const walk = (n: Node) => { if (n.children.length) all.add(n.key); n.children.forEach(walk); };
    walk(this.fullTree());
    this.open.set(all);
  }
  protected toggleKind(k: Kind) {
    this.hidden.update((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  protected clickNode(n: Node) {
    this.sel.set(n.key);
    if (n.children.length && n.kind !== 'tenant') this.toggleOpen(n.key);
  }
  protected focusNode(kind: 'bu' | 'site' | 'dept', id: string) {
    const keys = ['tenant'];
    if (kind === 'dept') {
      const d = this.store.dept(id)!;
      keys.push(`site:${d.siteId}`, `bu:${this.store.site(d.siteId)?.buId}`);
    }
    if (kind === 'site') keys.push(`bu:${this.store.site(id)?.buId}`);
    this.open.update((s) => new Set([...s, ...keys]));
    this.sel.set(`${kind}:${id}`);
    this.tab.set('Organization Details');
  }
  protected details(n: Node) {
    this.nodeMenu.set(null);
    this.detail.set(n);
  }
  protected kindLabel(k: Kind) {
    return { tenant: 'Tenant (root organization)', sub: 'Sub-tenant', bu: 'Business unit', site: 'Site / location', dept: 'Department' }[k];
  }
  protected detailFacts(n: Node): [string, string][] {
    const s = this.store;
    if (n.kind === 'tenant') { const o = s.org(); return [['Tenant ID', o.tenantId], ['Type', o.tenantType], ['Industry', o.industry], ['Country', o.country], ['Time zone', o.timeZone], ['Primary email', o.email]]; }
    if (n.kind === 'bu') { const b = s.bu(n.id)!; return [['Code', b.code], ['Country', `${b.flag} ${b.country}`], ['Head', b.head], ['Status', b.status], ['Created', b.created]]; }
    if (n.kind === 'site') { const x = s.site(n.id)!; return [['Type', x.type], ['City', x.city], ['Address', x.address], ['Manager', x.manager], ['Floors / zones', `${x.floors} / ${x.zones}`], ['Capacity', fmtN(x.capacity)], ['Status', x.status]]; }
    if (n.kind === 'dept') { const d = s.dept(n.id)!; return [['Site', s.site(d.siteId)?.name ?? ''], ['Head', d.head], ['Cost center', d.costCenter], ['Teams', d.teams.map((t) => t.name).join(', ') || '—'], ['Status', d.status]]; }
    const t = s.subTenants().find((x) => x.id === n.id)!;
    return [['Type', t.type], ['Admin', t.admin], ['Created', t.created]];
  }
  protected addUnder(kind: 'bu' | 'site' | 'dept') {
    this.menu.set(null);
    this.modal.set(kind === 'bu' ? { kind } : kind === 'site' ? { kind, parent: this.selBu() ?? 'bu-uae' } : { kind, parent: this.selSite() ?? 's-hq' });
  }
  protected remove(n: Node) {
    this.nodeMenu.set(null);
    if (!confirm(`Delete ${n.label}${n.children.length ? ' and everything under it' : ''}?`)) return;
    this.store.removeNode(n.kind as 'bu' | 'site' | 'dept', n.id);
    this.sel.set('tenant');
    this.store.toast(`${n.label} deleted`);
  }

  /* ---------- org form ---------- */
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.store.org()));
  protected readonly emailOk = computed(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.draft().email));
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected set<K extends keyof Org>(k: K, v: Org[K]) {
    this.draft.update((d) => ({ ...d, [k]: v }));
  }
  protected pickLogo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) return this.store.toast('Logo must be smaller than 2 MB');
    const r = new FileReader();
    r.onload = () => this.set('logo', String(r.result));
    r.readAsDataURL(f);
  }
  protected cancel() {
    this.draft.set({ ...this.store.org() });
    this.store.toast('Changes discarded');
  }
  protected saveOrg() {
    const d = this.draft();
    if (!d.name.trim()) return this.store.toast('Organization name is required');
    if (!this.emailOk()) return this.store.toast('Enter a valid primary email');
    this.store.updateOrg({ ...d, name: d.name.trim() });
    this.store.toast('Organization information saved');
  }
  protected toggle(k: 'multiSite' | 'subTenants' | 'sso' | 'rbac', v: boolean, label: string) {
    this.store.setTenant(k, v, label);
    const warn = !v && (k === 'sso' || k === 'rbac') ? ' — users will fall back to ' + (k === 'sso' ? 'local passwords' : 'full module access') : '';
    this.store.toast(`${label} ${v ? 'enabled' : 'disabled'}${warn}`);
  }
  protected secPatch(k: string, v: unknown, label: string) {
    this.store.security.update((s) => ({ ...s, [k]: v }));
    this.store.log('Updated', 'Password Policy', label, `${label} set to ${v}`, 'Security', 'Warning');
    this.store.toast(`${label} updated`);
  }

  /* ---------- right column ---------- */
  protected readonly recent = computed(() => this.store.audit().filter((a) => a.category !== 'Authentication').slice(0, 5));

  /* ---------- tables ---------- */
  protected readonly buStats = computed(() => {
    const s = this.store;
    return s.bus().map((b) => {
      const sites = s.sites().filter((x) => x.buId === b.id);
      const depts = s.depts().filter((d) => sites.some((x) => x.id === d.siteId));
      return { ...b, sites: sites.length, depts: depts.length, users: s.users().filter((u) => u.buId === b.id).length };
    });
  });
  protected readonly deptRows = computed(() => {
    const s = this.store;
    return s.depts().map((d) => {
      const site = s.site(d.siteId);
      return { ...d, site: site?.name ?? '', bu: s.bu(site?.buId ?? '')?.name ?? '', teamCount: d.teams.length, users: s.usersByDept().get(d.id) ?? 0 };
    });
  });
  protected readonly deptCols: Col[] = [
    { key: 'name', label: 'Department' }, { key: 'site', label: 'Site' }, { key: 'bu', label: 'Business Unit' }, { key: 'head', label: 'Head' },
    { key: 'costCenter', label: 'Cost Center' }, { key: 'teamCount', label: 'Teams', kind: 'num' }, { key: 'users', label: 'Users', kind: 'num' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly deptFilters = computed(() => [{ key: 'bu', label: 'Business Unit', options: this.store.bus().map((b) => b.name) }, { key: 'site', label: 'Site', options: this.store.sites().map((s) => s.name) }]);
  protected readonly deptActions: RowAction[] = [
    { id: 'tree', label: 'Show in hierarchy', icon: 'admin-sitemap' }, { id: 'edit', label: 'Edit', icon: 'admin-edit' }, { id: 'teams', label: 'Manage teams', icon: 'users' }, { id: 'delete', label: 'Delete', icon: 'admin-trash', danger: true },
  ];
  protected deptAct(a: string, r: { id: string; name: string }) {
    if (a === 'tree') return this.focusNode('dept', r.id);
    if (a === 'edit') return this.modal.set({ kind: 'dept', id: r.id });
    if (a === 'teams') return this.go('departments-teams');
    if (confirm(`Delete ${r.name}?`)) { this.store.removeNode('dept', r.id); this.store.toast(`${r.name} deleted`); }
  }
  protected readonly siteRows = computed(() => this.store.sites().map((x) => ({ ...x, bu: this.store.bu(x.buId)?.name ?? '', users: this.store.usersBySite().get(x.id) ?? 0, depts: this.store.depts().filter((d) => d.siteId === x.id).length })));
  protected readonly siteCols: Col[] = [
    { key: 'name', label: 'Site' }, { key: 'type', label: 'Type' }, { key: 'city', label: 'City' }, { key: 'bu', label: 'Business Unit' }, { key: 'manager', label: 'Manager' },
    { key: 'depts', label: 'Departments', kind: 'num' }, { key: 'users', label: 'Users', kind: 'num' }, { key: 'capacity', label: 'Capacity', kind: 'num' }, { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly siteFilters = computed(() => [{ key: 'bu', label: 'Business Unit', options: this.store.bus().map((b) => b.name) }, { key: 'type', label: 'Type', options: ['Head Office', 'Office', 'Warehouse', 'Plant', 'Data Center', 'Field Site'] }]);
  protected readonly siteActions: RowAction[] = [{ id: 'tree', label: 'Show in hierarchy', icon: 'admin-sitemap' }, { id: 'edit', label: 'Edit', icon: 'admin-edit' }, { id: 'dept', label: 'Add department', icon: 'plus' }, { id: 'delete', label: 'Delete', icon: 'admin-trash', danger: true }];
  protected siteAct(a: string, r: { id: string; name: string }) {
    if (a === 'tree') return this.focusNode('site', r.id);
    if (a === 'edit') return this.modal.set({ kind: 'site', id: r.id });
    if (a === 'dept') return this.modal.set({ kind: 'dept', parent: r.id });
    if (confirm(`Delete ${r.name} and its departments?`)) { this.store.removeNode('site', r.id); this.store.toast(`${r.name} deleted`); }
  }
  protected readonly licRows = computed(() => {
    const total = this.store.moduleAccess().length;
    const lic = this.store.moduleAccess().filter((m) => this.store.licensed(m.path)).length;
    const en = this.store.moduleAccess().filter((m) => m.enabled && this.store.licensed(m.path)).length;
    return [
      { label: 'Licensed modules', value: lic, display: `${lic} / ${total}`, color: 'var(--ka-7c3aed)' },
      { label: 'Enabled modules', value: en, display: `${en} / ${total}`, color: 'var(--ka-22c55e)' },
      { label: 'Add-ons available', value: total - lic, display: String(total - lic), color: 'var(--ka-f59e0b)' },
    ];
  });
  protected readonly auditRows = computed(() => this.store.audit().filter((a) => a.category !== 'Authentication').map((a) => ({ ...a, when: fmtStamp(a.at), what: `${a.entity} ${a.action}` })));
  protected readonly auditCols: Col[] = [
    { key: 'when', label: 'Date & Time', sortable: false }, { key: 'what', label: 'Change' }, { key: 'target', label: 'Target' }, { key: 'actor', label: 'By' }, { key: 'category', label: 'Category' },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => (r.severity === 'Critical' ? 'tag red' : r.severity === 'Warning' ? 'tag amber' : 'tag blue') },
  ];
  protected readonly auditFilters = [{ key: 'category', label: 'Category', options: ['Organization', 'Users & Roles', 'Security', 'Branding', 'Data & Privacy', 'Subscription', 'System'] }, { key: 'severity', label: 'Severity', options: ['Info', 'Warning', 'Critical'] }];

  /* ---------- header actions ---------- */
  protected kpiClick(label: string) {
    const map: Record<string, Tab> = { Organization: 'Organization Details', 'Business Units': 'Business Units', Departments: 'Departments', 'Sites & Locations': 'Sites & Locations' };
    if (label === 'Users') return this.go('user-group-management');
    this.tab.set(map[label]);
  }
  protected go(slug: string) {
    this.menu.set(null);
    this.router.navigateByUrl(BASE + slug);
  }
  protected exportHierarchy() {
    this.menu.set(null);
    const s = this.store;
    const rows: (string | number)[][] = [['Business Unit', 'Site', 'Site Type', 'City', 'Department', 'Head', 'Users']];
    for (const d of s.depts()) {
      const site = s.site(d.siteId)!;
      rows.push([s.bu(site.buId)?.name ?? '', site.name, site.type, site.city, d.name, d.head, s.usersByDept().get(d.id) ?? 0]);
    }
    downloadCsv('organization-hierarchy.csv', rows);
    s.log('Exported', 'Report', 'Organization hierarchy', `${rows.length - 1} rows exported to CSV`, 'Data & Privacy');
  }
  protected exportProfile() {
    this.menu.set(null);
    const s = this.store;
    const blob = new Blob([JSON.stringify({ organization: s.org(), tenantSettings: s.tenant(), businessUnits: s.bus(), sites: s.sites().length, departments: s.depts().length, users: s.users().length }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tenant-profile.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  protected importCsv(e: Event) {
    this.menu.set(null);
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const lines = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      lines.forEach((l) => {
        const [name, country, head] = l.split(',').map((x) => x.trim());
        if (name) this.store.saveBU({ id: '', name, code: 'BU-' + name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), country: country || 'United Arab Emirates', flag: '🏳️', head: head || '', status: 'Active', created: new Date().toISOString().slice(0, 10), color: 'var(--ka-0891b2)' });
      });
      this.store.toast(`${lines.length} business units imported`);
    };
    r.readAsText(f);
  }
  protected print() {
    this.menu.set(null);
    this.toggleAll();
    setTimeout(() => window.print(), 100);
  }
  protected resetDemo() {
    this.menu.set(null);
    this.store.reset();
    this.draft.set({ ...this.store.org() });
    this.store.toast('Demo data reset');
  }
  protected copyTenantId() {
    this.menu.set(null);
    navigator.clipboard?.writeText(this.store.org().tenantId).catch(() => {});
    this.store.toast(`Tenant ID ${this.store.org().tenantId} copied`);
  }

  @HostListener('document:click', ['$event'])
  protected outside(e: Event) {
    const t = e.target as HTMLElement;
    if (!t.closest?.('.menu-wrap')) {
      this.menu.set(null);
      this.nodeMenu.set(null);
    }
  }
}
