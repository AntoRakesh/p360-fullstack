import { ChangeDetectionStrategy, Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon';
import { downloadCsv } from '../dashboards/demo-data';
import { VM_UI } from './vm-ui';
import { HOSTS, SITES, VmStore } from './vm.data';
import {
  AUDIENCES, CHANNELS, CH_ICON, ESCALATIONS, LIVE, LOG, LiveNote, LogEntry, NAction, NChannel, NKind, NStatus, QUIET_TIMES, RECIPIENTS, RuleTpl, TEMPLATES, TRIGGERS, agoLabel, hm2,
} from './vm-host-notifications.data';

const TABS = ['All Notifications', 'Unread', 'Arrivals', 'Approvals', 'Departures', 'System'];
type LogKey = 'ts' | 'label' | 'recipient' | 'channel' | 'vid' | 'status';
interface Cfg { scope: string; triggers: string[]; channels: NChannel[]; escalation: string; quiet: boolean; qFrom: string; qTo: string; recipients: string }
interface RuleDraft { id: string | null; name: string; trigger: string; site: string; channels: NChannel[]; recipients: string; escalation: string; message: string }

@Component({
  selector: 'app-vm-host-notifications',
  imports: [Icon, RouterLink, ...VM_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'menu.set(null)', '(document:keydown.escape)': 'closeAll()' },
  template: `
    <div class="vm-page hn">
      <div class="vm-head">
        <div>
          <nav class="crumb"><a routerLink="/visitor-management">Visitor Management</a><app-icon name="chevron-right" [size]="13" /><b>Host Notifications</b></nav>
          <h1>Host Notifications</h1>
          <p>Keep hosts informed about visitor invitations, arrivals, approvals, and departures.</p>
        </div>
        <div class="vm-actions">
          <button class="btn-primary hb" (click)="openRule(null)"><app-icon name="plus" [size]="18" />Create Notification Rule</button>
          <button class="btn-outline hb" (click)="annOpen.set(true)"><app-icon name="megaphone" [size]="18" />Send Announcement</button>
          <button class="btn-outline hb" (click)="exportLog()"><app-icon name="download" [size]="18" />Export</button>
          <div class="menu-wrap">
            <button class="vm-icon-btn tall" (click)="toggleMenu('more', $event)"><app-icon name="more" [size]="18" /></button>
            @if (menu() === 'more') {
              <div class="dropdown right" (click)="$event.stopPropagation()">
                <button class="dd-item" (click)="markAllRead()"><app-icon name="vm-c-check" [size]="15" />Mark all as read</button>
                <button class="dd-item" (click)="exportLive()"><app-icon name="download" [size]="15" />Export live notifications</button>
                <button class="dd-item" (click)="go('host-management')"><app-icon name="users" [size]="15" />Host management</button>
                <button class="dd-item" (click)="go('visitor-approvals')"><app-icon name="shield-check" [size]="15" />Visitor approvals</button>
              </div>
            }
          </div>
        </div>
      </div>

      <section class="vm-kpis">
        <vm-kpi label="Unread Alerts" [value]="unreadTotal()" icon="bell" color="var(--ka-7c3aed)" [clickable]="true" [active]="tab() === 'Unread'" (pick)="tab.set(tab() === 'Unread' ? 'All Notifications' : 'Unread')" />
        <vm-kpi label="Sent Today" [value]="sentToday()" icon="vm-c-send" color="var(--ka-16a34a)" [clickable]="true" (pick)="scrollTo('log')" />
        <vm-kpi label="Awaiting Host Response" [value]="awaiting()" icon="clock" color="var(--ka-ea580c)" [clickable]="true" [active]="tab() === 'Approvals'" (pick)="tab.set(tab() === 'Approvals' ? 'All Notifications' : 'Approvals')" />
        <vm-kpi label="Delivery Success" [value]="success()" icon="vm-c-check-circle" color="var(--ka-2563eb)" [clickable]="true" [active]="status() === 'Failed'" (pick)="status.set(status() === 'Failed' ? '' : 'Failed'); scrollTo('log')" />
      </section>

      <div class="bar">
        <vm-tabs [tabs]="tabs" [value]="tab()" (change)="tab.set($event)" />
        <label class="vm-search sr"><app-icon name="search" [size]="15" /><input placeholder="Search visitor, host, notification..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <label class="pf"><app-icon name="map-pin" [size]="15" /><span>Site:</span><select [value]="site()" (change)="site.set($any($event.target).value)"><option value="">All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label class="pf"><app-icon name="layers" [size]="15" /><span>Channel:</span><select [value]="channel()" (change)="channel.set($any($event.target).value)"><option value="">All</option>@for (c of channels; track c) {<option [value]="c">{{ c }}</option>}</select></label>
        <label class="pf"><app-icon name="bell" [size]="15" /><span>Notification Type:</span><select [value]="type()" (change)="type.set($any($event.target).value)"><option value="">All</option><option value="Arrivals">Arrival</option><option value="Approvals">Approval</option><option value="Departures">Departure</option><option value="System">System</option></select></label>
        <label class="pf"><app-icon name="sliders" [size]="15" /><span>Status:</span><select [value]="status()" (change)="status.set($any($event.target).value)"><option value="">All</option><option>Delivered</option><option>Read</option><option>Failed</option><option>Queued</option></select></label>
        <button class="vm-icon-btn rf" [class.spin]="spinning()" title="Reset filters &amp; refresh" (click)="refresh()"><app-icon name="refresh" [size]="17" /></button>
      </div>

      <div class="grid">
        <div class="left">
          <div class="vm-card live">
            <div class="ch"><h2><app-icon name="bell" [size]="24" />Live Host Notifications</h2>
              @if (liveChecked().size) {
                <span class="bulk"><b>{{ liveChecked().size }} selected</b>
                  <button class="vm-mini" (click)="bulkLive('read')">Mark read</button>
                  <button class="vm-mini" (click)="bulkLive('resend')">Resend</button>
                  <button class="vm-mini red" (click)="bulkLive('dismiss')">Dismiss</button>
                </span>
              }
            </div>
            <div class="lt">
              <table class="ln">
                <thead><tr>
                  <th class="cb"><input type="checkbox" [checked]="allLive()" (change)="checkAllLive($any($event.target).checked)" /></th>
                  <th class="dotc"></th>
                  <th colspan="2">Visitor &nbsp;/ &nbsp;Message</th>
                  <th class="sort" (click)="sortLive('ago')">Time <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="sort" (click)="sortLive('channel')">Channel <app-icon name="vm-c-sort" [size]="13" /></th>
                  <th class="ac">Actions</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  @for (n of liveRows(); track n.id) {
                    <tr [class.unread]="n.unread" (click)="openNote(n)">
                      <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="liveChecked().has(n.id)" (change)="toggleLive(n.id)" /></td>
                      <td class="dotc">@if (n.unread) {<i class="dot"></i>}</td>
                      <td class="av"><vm-avatar [name]="n.who" [size]="34" /></td>
                      <td class="msg"><div><b>{{ n.who }}</b> {{ n.text }} @if (n.place) {<b>{{ n.place }}</b>}</div><small>{{ n.sub }}</small></td>
                      <td class="tm"><app-icon name="calendar-days" [size]="15" />{{ ago(n.ago) }}</td>
                      <td><div class="chs">@for (c of n.channels; track c) {<span class="chp" [attr.data-c]="c"><app-icon [name]="chIcon[c]" [size]="13" />{{ c }}</span>}</div></td>
                      <td class="ac" (click)="$event.stopPropagation()">
                        <div class="acts">
                          @if (n.done) {
                            <span class="done"><app-icon name="vm-c-check" [size]="13" />{{ n.done }}</span>
                          } @else {
                            <button class="ab" [class.fill]="n.action === 'Notify Host' || n.action === 'Review'" [class.wide]="!n.second" (click)="act(n, n.action)">{{ n.action }}</button>
                          }
                          @if (n.second) {<button class="ab" (click)="act(n, n.second)">{{ n.second }}</button>}
                        </div>
                      </td>
                      <td (click)="$event.stopPropagation()">
                        <div class="menu-wrap">
                          <button class="ia" (click)="toggleMenu('n:' + n.id, $event)"><app-icon name="admin-dots-h" [size]="18" /></button>
                          @if (menu() === 'n:' + n.id) {
                            <div class="dropdown right" (click)="$event.stopPropagation()">
                              <button class="dd-item" (click)="setUnread(n, !n.unread)"><app-icon name="vm-c-mail" [size]="15" />Mark as {{ n.unread ? 'read' : 'unread' }}</button>
                              <button class="dd-item" (click)="resendNote(n)"><app-icon name="vm-c-send" [size]="15" />Resend to {{ n.host }}</button>
                              <button class="dd-item" (click)="snooze(n)"><app-icon name="vm-c-moon" [size]="15" />Snooze 15 min</button>
                              <button class="dd-item" (click)="copy(n.vid)"><app-icon name="file-text" [size]="15" />Copy visit ID</button>
                              <button class="dd-item" (click)="dismiss([n.id])"><app-icon name="vm-c-trash" [size]="15" />Dismiss</button>
                            </div>
                          }
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="vm-empty">No notifications match these filters. <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="vm-card tpl">
            <div class="ch"><h2><app-icon name="layers" [size]="24" />Notification Rule Templates</h2></div>
            <div class="tg">
              @for (t of templates(); track t.id) {
                <div class="tc" [class.off]="!t.enabled">
                  <div class="tt"><app-icon [name]="t.icon" [size]="20" /><b>{{ t.name }}</b>
                    <button class="en" [class.on]="t.enabled" [title]="t.enabled ? 'Click to disable' : 'Click to enable'" (click)="toggleTpl(t)"><i></i>{{ t.enabled ? 'Enabled' : 'Disabled' }}</button>
                  </div>
                  <div class="tch">@for (c of t.channels; track c) {<span [attr.data-c]="c" [title]="c"><app-icon [name]="c === 'Push' ? 'vm-c-phone' : chIcon[c]" [size]="14" /></span>}</div>
                  <p><b>Trigger:</b> {{ t.triggerText }}</p>
                  <button class="vm-link ed" (click)="openRule(t)"><app-icon name="vm-c-pencil" [size]="13" />Edit</button>
                </div>
              }
              <button class="tc new" (click)="openRule(null)"><app-icon name="plus" [size]="26" />New Template</button>
            </div>
          </div>
        </div>

        <div class="vm-card set">
          <div class="ch"><h2><app-icon name="settings" [size]="26" />Notification Settings</h2>@if (dirty()) {<span class="dirty">Unsaved changes</span>}</div>
          <div class="row"><b>Notification scope</b>
            <label class="sel"><app-icon name="map-pin" [size]="15" /><select (change)="setCfg('scope', $any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option [selected]="s === cfg().scope">{{ s }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
          </div>
          <div class="blk"><b>Trigger event</b>
            <div class="trg">@for (t of triggerOrder; track t) {<label><input type="checkbox" [checked]="cfg().triggers.includes(t)" (change)="flipTrigger(t)" />{{ t }}</label>}</div>
          </div>
          <div class="blk"><b>Delivery channel</b>
            <div class="chn">
              @for (c of chanToggles; track c[0]) {
                <span><app-icon [name]="c[1]" [size]="13" />{{ c[2] }}<button class="vm-switch purple" [class.on]="cfg().channels.includes(c[0])" (click)="flipChannel(c[0])"></button></span>
              }
            </div>
          </div>
          <div class="row"><b>Escalation timing</b>
            <label class="sel"><app-icon name="clock" [size]="15" /><select (change)="setCfg('escalation', $any($event.target).value)">@for (e of escalations; track e) {<option [selected]="e === cfg().escalation">{{ e }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
          </div>
          <div class="row"><b class="ib"><app-icon name="vm-c-moon" [size]="17" />Quiet hours</b>
            <div class="qh">
              <button class="vm-switch purple" [class.on]="cfg().quiet" (click)="setCfg('quiet', !cfg().quiet)"></button>
              <label class="sel sm" [class.dis]="!cfg().quiet"><select [disabled]="!cfg().quiet" (change)="setCfg('qFrom', $any($event.target).value)">@for (t of quietTimes; track t) {<option [selected]="t === cfg().qFrom">{{ t }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
              <span>–</span>
              <label class="sel sm" [class.dis]="!cfg().quiet"><select [disabled]="!cfg().quiet" (change)="setCfg('qTo', $any($event.target).value)">@for (t of quietTimes; track t) {<option [selected]="t === cfg().qTo">{{ t }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
            </div>
          </div>
          <div class="row"><b class="ib"><app-icon name="users" [size]="17" />Recipients</b>
            <label class="sel"><select (change)="setCfg('recipients', $any($event.target).value)">@for (r of recipientsList; track r) {<option [selected]="r === cfg().recipients">{{ r }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
          </div>
          <div class="sb">
            <button class="btn-primary big" (click)="saveSettings()"><app-icon name="vm-c-save" [size]="18" />Save Settings</button>
            <button class="btn-outline big" [disabled]="testing()" (click)="testNotification()"><app-icon name="vm-c-send" [size]="18" />{{ testing() ? 'Sending…' : 'Test Notification' }}</button>
          </div>
        </div>
      </div>

      <div class="vm-card log" id="hn-log">
        <div class="ch"><h2><app-icon name="vm-c-clipboard" [size]="24" />Notification Delivery Log</h2>
          @if (logChecked().size) {
            <span class="bulk"><b>{{ logChecked().size }} selected</b>
              <button class="vm-mini" (click)="bulkLog('resend')">Resend</button>
              <button class="vm-mini" (click)="bulkLog('export')">Export</button>
              <button class="vm-mini red" (click)="bulkLog('delete')">Delete</button>
            </span>
          }
          <span class="cnt">{{ logRows().length }} of {{ log().length }} entries</span>
        </div>
        <div class="lgw">
          <table class="vm-table lg">
            <thead><tr>
              <th class="cb"><input type="checkbox" [checked]="allLog()" (change)="checkAllLog($any($event.target).checked)" /></th>
              <th class="sort" (click)="sortLog('ts')">Date &amp; Time <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="sort" (click)="sortLog('label')">Notification <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="sort" (click)="sortLog('recipient')">Recipient <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="sort" (click)="sortLog('channel')">Channel <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="sort" (click)="sortLog('vid')">Related Visitor <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="sort" (click)="sortLog('status')">Delivery Status <app-icon name="vm-c-sort" [size]="13" /></th>
              <th class="ac">Actions</th>
            </tr></thead>
            <tbody>
              @for (l of logRows(); track l.id) {
                <tr class="click" [class.sel]="detail()?.id === l.id" (click)="openLog(l)">
                  <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="logChecked().has(l.id)" (change)="toggleLog(l.id)" /></td>
                  <td><span class="dtc"><app-icon name="calendar-days" [size]="15" />15 Oct 2026, {{ hm2(l.ts) }}</span></td>
                  <td class="nt"><b>{{ l.label }}</b> {{ l.text }}</td>
                  <td><span class="dtc"><app-icon name="user" [size]="15" />{{ l.recipient }}</span></td>
                  <td><span class="chp lgc" [attr.data-c]="l.channel"><app-icon [name]="chIcon[l.channel]" [size]="14" />{{ l.channel }}</span></td>
                  <td>{{ l.vid }}</td>
                  <td><span class="ds" [attr.data-s]="l.status"><app-icon [name]="stIcon[l.status]" [size]="15" />{{ l.status }}</span></td>
                  <td (click)="$event.stopPropagation()">
                    <div class="vm-acts">
                      <button class="ia" title="View" (click)="openLog(l)"><app-icon name="eye" [size]="17" /></button>
                      <button class="ia" title="Edit &amp; resend" (click)="openResend(l)"><app-icon name="vm-c-pencil" [size]="16" /></button>
                      <div class="menu-wrap">
                        <button class="ia" (click)="toggleMenu('l:' + l.id, $event)"><app-icon name="admin-dots-h" [size]="18" /></button>
                        @if (menu() === 'l:' + l.id) {
                          <div class="dropdown right" (click)="$event.stopPropagation()">
                            <button class="dd-item" (click)="resendLog(l)"><app-icon name="refresh" [size]="15" />{{ l.status === 'Failed' ? 'Retry delivery' : 'Resend' }}</button>
                            <button class="dd-item" (click)="copy(l.vid)"><app-icon name="file-text" [size]="15" />Copy visitor ID</button>
                            <button class="dd-item" (click)="go('find-your-visit', l.vid)"><app-icon name="search" [size]="15" />Open visit</button>
                            <button class="dd-item" (click)="deleteLog([l.id])"><app-icon name="vm-c-trash" [size]="15" />Delete entry</button>
                          </div>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="vm-empty">No delivery records match these filters. <button class="vm-link" (click)="refresh()">Clear filters</button></td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detail modal (live notification or delivery log entry) -->
    @if (detail(); as d) {
      <div class="g-overlay" (click)="detail.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Notification details</h3><button type="button" class="close-btn" (click)="detail.set(null)">×</button></div>
        <div class="dh"><vm-avatar [name]="d.who" [size]="48" /><div><b>{{ d.title }}</b><small>{{ d.sub }}</small></div></div>
        <div class="vm-kv kv2">
          <span>Recipient</span><b>{{ d.recipient }}</b>
          <span>Channel</span><b>{{ d.channel }}</b>
          <span>Related visitor</span><b>{{ d.vid }}</b>
          <span>Site</span><b>{{ d.site }}</b>
          <span>Status</span><b><span class="ds" [attr.data-s]="d.status"><app-icon [name]="stIcon[d.status]" [size]="14" />{{ d.status }}</span></b>
        </div>
        <h4 class="h4">Delivery timeline</h4>
        <div class="tl">
          @for (s of timeline(d.status, d.ts); track s[0]) {
            <div class="ti" [attr.data-t]="s[2]"><i></i><b>{{ s[0] }}</b><small>{{ s[1] }}</small></div>
          }
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="go('find-your-visit', d.vid)">Open visit</button>
          @if (d.log; as l) {<button class="btn-primary" (click)="resendLog(l); detail.set(null)">{{ l.status === 'Failed' ? 'Retry delivery' : 'Resend' }}</button>}
          @if (d.note; as n) {<button class="btn-outline" (click)="setUnread(n, true); detail.set(null)">Mark unread</button><button class="btn-primary" (click)="resendNote(n); detail.set(null)">Resend to host</button>}
        </div>
      </div>
    }

    <!-- Review approval -->
    @if (review(); as n) {
      <div class="g-overlay" (click)="review.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Approval pending – {{ n.who }}</h3><button type="button" class="close-btn" (click)="review.set(null)">×</button></div>
        <div class="dh"><vm-avatar [name]="n.who" [size]="48" /><div><b>{{ n.who }} is awaiting approval from {{ n.host }}</b><small>{{ n.sub }} · requested {{ ago(n.ago) }}</small></div></div>
        <p class="muted">{{ n.host }} has not responded yet. You can approve on the host's behalf (logged), send a reminder, or escalate to the backup host.</p>
        <div class="form-actions">
          <button class="btn-ghost" (click)="go('visitor-approvals')">Open in Approvals</button>
          <button class="btn-outline" (click)="remindHost(n, false)">Remind {{ n.host }}</button>
          <button class="btn-outline" (click)="remindHost(n, true)">Escalate to backup host</button>
          <button class="btn-primary" (click)="approveOnBehalf(n)">Approve visit</button>
        </div>
      </div>
    }

    <!-- Create / edit rule -->
    @if (rule(); as r) {
      <div class="g-overlay" (click)="rule.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveRule()">
        <div class="modal-head"><h3>{{ r.id ? 'Edit Notification Rule' : 'Create Notification Rule' }}</h3><button type="button" class="close-btn" (click)="rule.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Rule name<input class="input" [class.err]="ruleErr()" [value]="r.name" (input)="patchRule('name', $any($event.target).value)" placeholder="e.g. VIP Arrival Alert" /></label>
          <label>Trigger event<select class="input" (change)="patchRule('trigger', $any($event.target).value)">@for (t of triggers; track t) {<option [value]="t" [selected]="t === r.trigger">{{ t }}</option>}</select></label>
          <label>Site<select class="input" (change)="patchRule('site', $any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option [value]="s" [selected]="s === r.site">{{ s }}</option>}</select></label>
          <label>Recipients<select class="input" (change)="patchRule('recipients', $any($event.target).value)">@for (x of recipientsList; track x) {<option [value]="x" [selected]="x === r.recipients">{{ x }}</option>}</select></label>
          <label>Escalation<select class="input" (change)="patchRule('escalation', $any($event.target).value)">@for (e of escalations; track e) {<option [value]="e" [selected]="e === r.escalation">{{ e }}</option>}</select></label>
          <div class="full cks"><span>Channels</span>@for (c of channels; track c) {<label><input type="checkbox" [checked]="r.channels.includes(c)" (change)="flipRuleCh(c)" /><app-icon [name]="chIcon[c]" [size]="14" />{{ c === 'Teams' ? 'Teams / Slack' : c }}</label>}</div>
          <label class="full">Message template<textarea class="input ta2" rows="3" [value]="r.message" (input)="patchRule('message', $any($event.target).value)"></textarea></label>
        </div>
        <p class="muted tok">Tokens: {{ '{' }}visitor{{ '}' }} {{ '{' }}host{{ '}' }} {{ '{' }}location{{ '}' }} {{ '{' }}time{{ '}' }} {{ '{' }}badge{{ '}' }}</p>
        @if (ruleErr()) {<p class="err-t">{{ ruleErr() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rule.set(null)">Cancel</button><button class="btn-primary" type="submit">{{ r.id ? 'Save Rule' : 'Create Rule' }}</button></div>
      </form>
    }

    <!-- Send announcement -->
    @if (annOpen()) {
      <div class="g-overlay" (click)="annOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendAnnouncement(aa.value, asub.value, am.value, ap.value)">
        <div class="modal-head"><h3>Send Announcement</h3><button type="button" class="close-btn" (click)="annOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label>Audience<select #aa class="input">@for (a of audiences; track a[0]) {<option [value]="a[0]">{{ a[0] }} ({{ a[1] }})</option>}</select></label>
          <label>Priority<select #ap class="input"><option>Normal</option><option>High</option><option>Urgent</option></select></label>
          <div class="full cks"><span>Channels</span>@for (c of channels; track c) {<label><input type="checkbox" [checked]="annCh().includes(c)" (change)="flipAnnCh(c)" /><app-icon [name]="chIcon[c]" [size]="14" />{{ c === 'Teams' ? 'Teams / Slack' : c }}</label>}</div>
          <label class="full">Subject<input #asub class="input" value="Fire drill today at 3:00 PM" /></label>
          <label class="full">Message<textarea #am class="input ta2" rows="3">Please inform your visitors that a fire drill will take place at 3:00 PM. Escort them to the nearest assembly point.</textarea></label>
        </div>
        @if (!annCh().length) {<p class="err-t">Pick at least one channel.</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="annOpen.set(false)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!annCh().length"><app-icon name="megaphone" [size]="15" /> Send Now</button></div>
      </form>
    }

    <!-- Edit & resend log entry -->
    @if (resend(); as r) {
      <div class="g-overlay" (click)="resend.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doResend(r, rr.value, rc.value, rm.value)">
        <div class="modal-head"><h3>Edit &amp; resend – {{ r.vid }}</h3><button type="button" class="close-btn" (click)="resend.set(null)">×</button></div>
        <div class="form-grid">
          <label>Recipient<select #rr class="input">@for (h of hosts; track h.name) {<option [value]="h.name" [selected]="h.name === r.recipient">{{ h.name }}</option>}<option>Security Desk</option></select></label>
          <label>Channel<select #rc class="input">@for (c of channels; track c) {<option [value]="c" [selected]="c === r.channel">{{ c }}</option>}</select></label>
          <label class="full">Message<textarea #rm class="input ta2" rows="3" [value]="r.label + ' ' + r.text"></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="resend.set(null)">Cancel</button><button class="btn-primary" type="submit">Resend</button></div>
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
    .dropdown { left: 0; right: auto; min-width: 210px; z-index: 30; }
    .dropdown.right { left: auto; right: 0; }
    :host ::ng-deep .vm-kpi { padding: 10px 16px; gap: 16px; }
    :host ::ng-deep .vm-kpi-ic { width: 66px; height: 54px; }
    :host ::ng-deep .vm-kpi-val { font-size: 30px; }
    .bar { display: flex; gap: 6px; align-items: center; }
    :host ::ng-deep .vm-tabs { flex-wrap: nowrap; gap: 4px; }
    :host ::ng-deep .vm-tabs button { padding: 6px 8px; font-size: 12px; }
    .sr { height: 34px; flex: 1; min-width: 100px; } .sr input { font-size: 12.5px; }
    .pf { display: flex; align-items: center; gap: 4px; height: 34px; border: 1px solid var(--border); border-radius: 8px; padding: 0 6px; background: var(--kb-ffffff); font-size: 12px; white-space: nowrap; color: var(--text); }
    .pf span { font-weight: 500; }
    .pf select { border: 0; outline: 0; background: transparent; font: inherit; font-size: 12px; cursor: pointer; field-sizing: content; max-width: 90px; }
    .rf { height: 34px; width: 34px; flex: none; } .rf.spin app-icon { animation: sp .7s linear; }
    @keyframes sp { to { transform: rotate(360deg); } }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 12px; align-items: stretch; }
    .left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .vm-card { padding: 12px 14px; }
    .ch { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .ch h2 { margin: 0; font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; }
    .ch h2 app-icon { color: var(--primary); }
    .bulk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
    .cnt { font-size: 12px; color: var(--muted); }
    .lt { max-height: 262px; overflow-y: auto; overflow-x: hidden; }
    .ln { width: 100%; border-collapse: collapse; table-layout: auto; }
    .ln th { background: var(--kb-f3f0ff); font-size: 12.5px; font-weight: 600; text-align: left; padding: 6px 4px; position: sticky; top: 0; z-index: 1; white-space: nowrap; }
    .ln th.sort { cursor: pointer; } .ln th.sort app-icon { vertical-align: -2px; }
    .ln td { padding: 4px 4px; border-bottom: 1px solid var(--kl-f0f0f6); font-size: 12.5px; vertical-align: middle; }
    .ln tbody tr { cursor: pointer; } .ln tbody tr:hover td { background: var(--kb-faf8ff); }
    .ln tr.unread .msg div { font-weight: 500; }
    .cb { width: 22px; } .cb input { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; }
    .dotc { width: 14px; padding: 0 !important; } .dot { display: block; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }
    .av { width: 38px; }
    .msg div { font-size: 12px; line-height: 1.3; } .msg b { font-weight: 700; } .msg small { font-size: 11px; color: var(--kf-334155); white-space: nowrap; }
    .tm { white-space: nowrap; } .tm app-icon, .dtc app-icon { color: var(--kf-334155); margin-right: 5px; vertical-align: -3px; }
    .chs { display: flex; gap: 4px; }
    .chp { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 8px; background: var(--kb-f1ecff); color: var(--kf-4c1d95); font-size: 11.5px; white-space: nowrap; }
    .chp app-icon { color: var(--primary); }
    .chp[data-c='SMS'] { background: var(--kb-dcfce7); color: var(--kf-166534); } .chp[data-c='SMS'] app-icon { color: var(--kf-16a34a); }
    .chp[data-c='Teams'] { background: var(--kb-e0e7ff); color: var(--kf-3730a3); } .chp[data-c='Teams'] app-icon { color: var(--kf-4f46e5); }
    .ac { text-align: center; }
    .acts { display: flex; gap: 6px; justify-content: center; }
    .ab { border: 1px solid var(--kl-c4b5fd); background: var(--kb-ffffff); color: var(--primary); border-radius: 6px; padding: 3px 7px; font: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .ab:hover { background: var(--kb-f5f0ff); }
    .ab.fill { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); } .ab.fill:hover { filter: brightness(1.08); }
    .ab.wide { min-width: 90px; }
    .done { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; color: var(--kf-15803d); background: var(--kb-dcfce7); border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
    .ia { border: 0; background: none; cursor: pointer; padding: 3px; border-radius: 6px; color: var(--text); display: grid; place-items: center; } .ia:hover { background: var(--kb-f1edff); }
    .tg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 92px; gap: 10px; }
    .tc { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; background: var(--kb-ffffff); }
    .tc.off { background: var(--kb-f8fafc); } .tc.off .tt b, .tc.off p { color: var(--kf-64748b); }
    .tt { display: flex; align-items: center; gap: 8px; } .tt app-icon { color: var(--primary); flex: none; }
    .tt b { flex: 1; font-size: 12.5px; line-height: 1.2; min-width: 0; }
    .en { display: inline-flex; align-items: center; gap: 3px; border: 0; border-radius: 6px; padding: 2px 5px; font: inherit; font-size: 10.5px; background: var(--kb-e2e8f0); color: var(--kf-475569); cursor: pointer; flex: none; }
    .en i { width: 9px; height: 9px; border-radius: 50%; background: var(--kb-94a3b8); } .en.on { background: var(--kb-dcfce7); color: var(--kf-166534); } .en.on i { background: var(--kb-16a34a); }
    .tch { display: flex; gap: 10px; padding-left: 30px; }
    .tch span { color: var(--primary); display: grid; place-items: center; width: 24px; height: 22px; border-radius: 6px; background: var(--kb-f1ecff); }
    .tch span[data-c='SMS'] { color: var(--kf-16a34a); background: var(--kb-dcfce7); } .tch span[data-c='Teams'] { color: var(--kf-4f46e5); background: var(--kb-e0e7ff); }
    .tc p { margin: 0; font-size: 11.5px; line-height: 1.3; flex: 1; } .tc p b { font-weight: 700; }
    .ed { align-self: center; font-size: 13px; display: inline-flex; gap: 4px; align-items: center; text-decoration: underline; }
    .tc.new { border: 1.5px dashed var(--kl-a78bfa); align-items: center; justify-content: center; color: var(--primary); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: var(--kb-fcfaff); text-align: center; }
    .tc.new:hover { background: var(--kb-f5f0ff); }
    .set { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
    .set b { font-size: 13.5px; font-weight: 600; }
    .dirty { font-size: 11.5px; color: var(--kf-c2410c); background: var(--kb-ffedd5); border-radius: 6px; padding: 2px 8px; }
    .row { display: grid; grid-template-columns: 122px minmax(0, 1fr); align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--kl-f0f0f6); }
    .row:last-of-type { border-bottom: 0; }
    .ib { display: flex; align-items: center; gap: 8px; }
    .sel { display: flex; align-items: center; gap: 8px; height: 34px; border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; background: var(--kb-ffffff); min-width: 0; }
    .sel select { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 12.5px; appearance: none; cursor: pointer; min-width: 0; }
    .sel.sm { flex: 1; padding: 0 6px; gap: 2px; } .sel.dis { opacity: .5; }
    .qh { display: flex; align-items: center; gap: 5px; }
    .blk { display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--kl-f0f0f6); }
    .trg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; padding-left: 14px; font-size: 13px; }
    .trg label { display: flex; align-items: center; gap: 10px; cursor: pointer; } .trg input { width: 16px; height: 16px; accent-color: var(--primary); }
    .chn { display: flex; justify-content: space-between; gap: 2px; font-size: 10.5px; }
    .chn span { display: flex; align-items: center; gap: 3px; white-space: nowrap; } .chn app-icon { color: var(--kf-334155); }
    .chn .vm-switch { width: 28px; height: 16px; margin-left: 2px; } .chn .vm-switch::after { width: 10px; height: 10px; } .chn .vm-switch.on::after { left: 15px; }
    .sb { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: auto; }
    .big { height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; }
    .lgw { max-height: 214px; overflow-y: auto; overflow-x: hidden; }
    .lg th { background: var(--kb-f3f0ff); font-size: 12.5px; padding: 6px 6px; position: sticky; top: 0; z-index: 1; cursor: pointer; white-space: nowrap; }
    .lg th app-icon { vertical-align: -2px; }
    .lg td { padding: 3px 6px; font-size: 12.5px; white-space: nowrap; }
    .lg td.nt { white-space: normal; font-size: 12px; } .nt b { font-weight: 700; }
    .lgc { min-width: 74px; justify-content: center; }
    .ds { display: inline-flex; align-items: center; gap: 6px; padding: 2px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 500; min-width: 96px; }
    .ds[data-s='Delivered'], .ds[data-s='Read'] { background: var(--kb-dcfce7); color: var(--kf-166534); } .ds[data-s='Delivered'] app-icon, .ds[data-s='Read'] app-icon { color: var(--kf-16a34a); }
    .ds[data-s='Failed'] { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .ds[data-s='Failed'] app-icon { color: var(--kf-dc2626); }
    .ds[data-s='Queued'] { background: var(--kb-fef3c7); color: var(--kf-a16207); } .ds[data-s='Queued'] app-icon { color: var(--kf-d97706); }
    .vm-acts { gap: 6px; justify-content: center; }
    .dh { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; } .dh b { display: block; font-size: 15px; } .dh small { color: var(--muted); font-size: 12.5px; }
    .kv2 { margin-bottom: 10px; }
    .h4 { margin: 8px 0; font-size: 14px; }
    .tl { display: flex; flex-direction: column; gap: 0; }
    .ti { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 8px; padding: 5px 0; position: relative; font-size: 13px; }
    .ti i { width: 12px; height: 12px; border-radius: 50%; background: var(--kb-22c55e); margin-left: 4px; }
    .ti[data-t='red'] i { background: var(--kb-ef4444); } .ti[data-t='grey'] i { background: var(--kb-cbd5e1); } .ti[data-t='orange'] i { background: var(--kb-f59e0b); }
    .ti b { font-weight: 500; } .ti small { color: var(--muted); }
    .cks { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--kf-4b4f6b); }
    .cks label { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 6px !important; } .cks input { accent-color: var(--primary); }
    .ta2 { height: auto; padding: 8px 10px; font: inherit; resize: vertical; }
    .input.err { border-color: var(--kl-f87171); }
    .err-t { color: var(--kf-dc2626); font-size: 12px; margin: 6px 0 0; }
    .tok { font-size: 12px; margin: 8px 0 0; }
    @media (max-width: 1400px) { .grid { grid-template-columns: minmax(0, 1fr); } .bar { flex-wrap: wrap; } }
  `,
})
export class HostNotifications {
  private readonly vm = inject(VmStore);
  private readonly router = inject(Router);
  protected readonly tabs = TABS;
  protected readonly sites = SITES.slice(0, 4);
  protected readonly channels = CHANNELS;
  protected readonly chIcon = CH_ICON;
  protected readonly triggers = TRIGGERS;
  protected readonly triggerOrder = ['Invitation created', 'Visitor checked in', 'Visitor approved', 'Visitor checked out', 'Visitor arrived', 'Approval overdue'];
  protected readonly chanToggles: [NChannel, string, string][] = [['Email', 'vm-c-mail', 'Email'], ['SMS', 'vm-c-sms', 'SMS'], ['Push', 'vm-c-phone', 'Mobile Push'], ['Teams', 'vm-c-teams', 'Teams / Slack']];
  protected readonly escalations = ESCALATIONS;
  protected readonly quietTimes = QUIET_TIMES;
  protected readonly recipientsList = RECIPIENTS;
  protected readonly audiences = AUDIENCES;
  protected readonly hosts = HOSTS;
  protected readonly hm2 = hm2;
  protected readonly ago = agoLabel;
  protected readonly stIcon: Record<NStatus, string> = { Delivered: 'vm-c-check-circle', Read: 'eye', Failed: 'vm-c-x-circle', Queued: 'clock' };

  protected readonly live = signal<LiveNote[]>(LIVE.map((n) => ({ ...n })));
  protected readonly log = signal<LogEntry[]>(LOG.map((l) => ({ ...l })));
  protected readonly templates = signal<RuleTpl[]>(TEMPLATES.map((t) => ({ ...t })));
  private readonly baseUnread = signal(16);
  private readonly extraSent = signal(0);
  private readonly fixed = signal(0);

  protected readonly tab = signal('All Notifications');
  protected readonly q = signal('');
  protected readonly site = signal('');
  protected readonly channel = signal('');
  protected readonly type = signal('');
  protected readonly status = signal('');
  protected readonly menu = signal<string | null>(null);
  protected readonly spinning = signal(false);
  protected readonly testing = signal(false);
  protected readonly msg = signal<string | null>(null);
  protected readonly liveChecked = signal(new Set<string>());
  protected readonly logChecked = signal(new Set<string>());
  protected readonly liveSort = signal<{ k: 'ago' | 'channel'; dir: 1 | -1 }>({ k: 'ago', dir: 1 });
  protected readonly logSort = signal<{ k: LogKey; dir: 1 | -1 }>({ k: 'ts', dir: -1 });

  private readonly defaults: Cfg = { scope: 'All Sites', triggers: ['Invitation created', 'Visitor approved', 'Visitor arrived', 'Visitor checked in', 'Visitor checked out'], channels: ['Email', 'SMS', 'Push', 'Teams'] as NChannel[], escalation: 'Escalate after 10 minutes', quiet: true, qFrom: '10:00 PM', qTo: '7:00 AM', recipients: 'Host, backup host, security desk' };
  protected readonly cfg = signal<Cfg>({ ...this.defaults });
  private readonly saved = signal(JSON.stringify(this.defaults));
  protected readonly dirty = computed(() => JSON.stringify(this.cfg()) !== this.saved());

  protected readonly detail = signal<{ id: string; who: string; title: string; sub: string; recipient: string; channel: string; vid: string; site: string; status: NStatus; ts: number; log?: LogEntry; note?: LiveNote } | null>(null);
  protected readonly review = signal<LiveNote | null>(null);
  protected readonly rule = signal<RuleDraft | null>(null);
  protected readonly ruleErr = signal('');
  protected readonly annOpen = signal(false);
  protected readonly annCh = signal<NChannel[]>(['Email', 'Push']);
  protected readonly resend = signal<LogEntry | null>(null);

  protected readonly unreadTotal = computed(() => this.baseUnread() + this.live().filter((n) => n.unread).length);
  protected readonly sentToday = computed(() => 126 + this.extraSent());
  protected readonly awaiting = computed(() => 8 + this.live().filter((n) => n.action === 'Review' && !n.done).length);
  protected readonly success = computed(() => `${Math.min(99.9, 98.6 + this.fixed() * 0.1).toFixed(1)}%`);

  private match(text: string, site: string, chans: NChannel[], kind: NKind, st: NStatus) {
    const q = this.q().trim().toLowerCase();
    if (q && !text.toLowerCase().includes(q)) return false;
    if (this.site() && site !== this.site()) return false;
    if (this.channel() && !chans.includes(this.channel() as NChannel)) return false;
    if (this.type() && kind !== this.type()) return false;
    if (this.status() && st !== this.status()) return false;
    const t = this.tab();
    if (t !== 'All Notifications' && t !== 'Unread' && kind !== t) return false;
    return true;
  }
  protected readonly liveRows = computed(() => {
    const { k, dir } = this.liveSort();
    return this.live()
      .filter((n) => (this.tab() !== 'Unread' || n.unread) && this.match(`${n.who} ${n.text} ${n.place ?? ''} ${n.sub} ${n.host}`, n.site, n.channels, n.kind, n.status))
      .sort((a, b) => (k === 'ago' ? a.ago - b.ago : a.channels[0].localeCompare(b.channels[0])) * dir);
  });
  protected readonly logRows = computed(() => {
    const { k, dir } = this.logSort();
    return this.log()
      .filter((l) => this.match(`${l.label} ${l.text} ${l.recipient} ${l.vid}`, l.site, [l.channel], l.kind, l.status))
      .sort((a, b) => (k === 'ts' ? a.ts - b.ts : String(a[k]).localeCompare(String(b[k]))) * dir);
  });
  protected readonly allLive = computed(() => this.liveRows().length > 0 && this.liveRows().every((n) => this.liveChecked().has(n.id)));
  protected readonly allLog = computed(() => this.logRows().length > 0 && this.logRows().every((l) => this.logChecked().has(l.id)));

  protected toggleMenu(k: string, e: Event) { e.stopPropagation(); this.menu.set(this.menu() === k ? null : k); }
  protected closeAll() { this.menu.set(null); this.detail.set(null); this.review.set(null); this.rule.set(null); this.annOpen.set(false); this.resend.set(null); }
  protected go(p: string, q?: string) { this.closeAll(); this.router.navigate(['/visitor-management', p], q ? { queryParams: { q } } : {}); }
  protected scrollTo(id: string) { document.getElementById(`hn-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  protected sortLive(k: 'ago' | 'channel') { this.liveSort.update((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : 1 })); }
  protected sortLog(k: LogKey) { this.logSort.update((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : 1 })); }
  private flip(set: WritableSignal<Set<string>>, id: string) { set.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  protected toggleLive(id: string) { this.flip(this.liveChecked, id); }
  protected toggleLog(id: string) { this.flip(this.logChecked, id); }
  protected checkAllLive(on: boolean) { this.liveChecked.set(on ? new Set(this.liveRows().map((n) => n.id)) : new Set()); }
  protected checkAllLog(on: boolean) { this.logChecked.set(on ? new Set(this.logRows().map((l) => l.id)) : new Set()); }

  private patchNote(id: string, c: Partial<LiveNote>) { this.live.update((l) => l.map((n) => (n.id === id ? { ...n, ...c } : n))); }
  private patchLog(id: string, c: Partial<LogEntry>) { this.log.update((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x))); }
  private seq = 100;
  /** Push a new delivery-log row that goes Queued → Delivered after a moment. */
  private send(e: Omit<LogEntry, 'id' | 'ts' | 'status'>, fail = false) {
    const id = `L${++this.seq}`;
    this.log.update((l) => [{ ...e, id, ts: this.vm.now(), status: 'Queued' }, ...l]);
    this.extraSent.update((n) => n + 1);
    setTimeout(() => this.patchLog(id, { status: fail ? 'Failed' : 'Delivered' }), 1400);
    return id;
  }

  protected act(n: LiveNote, a: NAction) {
    this.setUnread(n, false, true);
    if (a === 'Notify Host') {
      this.send({ kind: n.kind, label: 'Host alert:', text: `${n.who} is waiting for you – ${n.place ?? n.text}`.replace(/\.$/, ''), recipient: n.host, channel: n.channels.includes('Push') ? 'Push' : n.channels[0], vid: n.vid, site: n.site });
      this.patchNote(n.id, { done: 'Host notified' });
      this.vm.log({ text: `Host ${n.host} notified: ${n.who} arrived`, kind: 'notify', visitor: n.vid });
      this.toast(`${n.host} notified via ${n.channels.join(' + ')}`);
    } else if (a === 'Review') this.review.set(n);
    else if (a === 'View Visit') this.go('find-your-visit', n.vid);
    else if (a === 'Open Schedule') this.go('visit-scheduling');
    else this.openNote(n);
  }
  protected openNote(n: LiveNote) {
    this.setUnread(n, false, true);
    this.menu.set(null);
    this.detail.set({ id: n.id, who: n.who, title: `${n.who} ${n.text} ${n.place ?? ''}`, sub: `${n.sub} · ${agoLabel(n.ago)}`, recipient: n.host, channel: n.channels.join(', '), vid: n.vid, site: n.site, status: n.status, ts: this.vm.now() - n.ago, note: n });
  }
  protected openLog(l: LogEntry) {
    this.menu.set(null);
    this.detail.set({ id: l.id, who: l.recipient, title: `${l.label} ${l.text}`, sub: `15 Oct 2026, ${hm2(l.ts)}`, recipient: l.recipient, channel: l.channel, vid: l.vid, site: l.site, status: l.status, ts: l.ts, log: l });
  }
  protected timeline(s: NStatus, ts: number): [string, string, string][] {
    const t = (d: number) => `${hm2(ts)}:${String(d).padStart(2, '0')}`;
    if (s === 'Queued') return [['Queued', t(1), 'orange'], ['Sent to provider', 'waiting…', 'grey'], ['Delivered', '—', 'grey']];
    if (s === 'Failed') return [['Queued', t(1), 'green'], ['Sent to provider', t(3), 'green'], ['Delivery failed – device unreachable', t(9), 'red']];
    const l: [string, string, string][] = [['Queued', t(1), 'green'], ['Sent to provider', t(2), 'green'], ['Delivered', t(4), 'green']];
    if (s === 'Read') l.push(['Read by recipient', hm2(ts + 1), 'green']);
    return l;
  }
  protected setUnread(n: LiveNote, unread: boolean, silent = false) {
    this.patchNote(n.id, { unread });
    this.menu.set(null);
    if (!silent) this.toast(unread ? 'Marked as unread' : 'Marked as read');
  }
  protected markAllRead() {
    this.live.update((l) => l.map((n) => ({ ...n, unread: false })));
    this.baseUnread.set(0);
    this.menu.set(null);
    this.toast('All alerts marked as read');
  }
  protected resendNote(n: LiveNote) {
    this.send({ kind: n.kind, label: 'Resent:', text: `${n.who} ${n.text} ${n.place ?? ''}`.trim(), recipient: n.host, channel: n.channels[0], vid: n.vid, site: n.site });
    this.menu.set(null);
    this.toast(`Resent to ${n.host} via ${n.channels[0]}`);
  }
  protected snooze(n: LiveNote) {
    this.live.update((l) => l.filter((x) => x.id !== n.id));
    this.menu.set(null);
    this.toast(`${n.who} notification snoozed for 15 min`);
    setTimeout(() => this.live.update((l) => (l.some((x) => x.id === n.id) ? l : [{ ...n, ago: 0, unread: true }, ...l])), 15000);
  }
  protected dismiss(ids: string[]) {
    this.live.update((l) => l.filter((x) => !ids.includes(x.id)));
    this.liveChecked.set(new Set());
    this.menu.set(null);
    this.toast(`${ids.length} notification${ids.length > 1 ? 's' : ''} dismissed`);
  }
  protected bulkLive(k: 'read' | 'resend' | 'dismiss') {
    const ids = [...this.liveChecked()];
    if (k === 'dismiss') { this.dismiss(ids); return; }
    const notes = this.live().filter((n) => ids.includes(n.id));
    if (k === 'read') { notes.forEach((n) => this.patchNote(n.id, { unread: false })); this.toast(`${notes.length} marked as read`); }
    else { notes.forEach((n) => this.send({ kind: n.kind, label: 'Resent:', text: `${n.who} ${n.text} ${n.place ?? ''}`.trim(), recipient: n.host, channel: n.channels[0], vid: n.vid, site: n.site })); this.toast(`${notes.length} notification(s) resent`); }
    this.liveChecked.set(new Set());
  }
  protected remindHost(n: LiveNote, escalate: boolean) {
    const to = escalate ? 'Security Desk' : n.host;
    this.send({ kind: 'Approvals', label: escalate ? 'Escalation:' : 'Reminder:', text: `${n.who} is awaiting approval.`, recipient: to, channel: escalate ? 'SMS' : 'Email', vid: n.vid, site: n.site });
    this.review.set(null);
    this.toast(escalate ? `Escalated to backup host & security desk` : `Reminder sent to ${n.host}`);
  }
  protected approveOnBehalf(n: LiveNote) {
    this.patchNote(n.id, { done: 'Approved', unread: false, status: 'Read' });
    this.send({ kind: 'Approvals', label: 'Approved:', text: `${n.who} visit approved on behalf of ${n.host}.`, recipient: n.host, channel: 'Email', vid: n.vid, site: n.site });
    this.vm.log({ text: `${n.who} approved by reception on behalf of ${n.host}`, kind: 'approval', visitor: n.vid });
    this.review.set(null);
    this.toast(`${n.who} approved · ${n.host} and visitor notified`);
  }

  // templates / rules
  protected toggleTpl(t: RuleTpl) {
    this.templates.update((l) => l.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)));
    this.toast(`${t.name} ${t.enabled ? 'disabled' : 'enabled'}`);
  }
  protected openRule(t: RuleTpl | null) {
    this.ruleErr.set('');
    this.rule.set(t
      ? { id: t.id, name: t.name, trigger: t.trigger, site: t.site, channels: [...t.channels], recipients: RECIPIENTS.includes(t.recipients) ? t.recipients : RECIPIENTS[1], escalation: this.cfg().escalation, message: t.message }
      : { id: null, name: '', trigger: 'Visitor arrived', site: 'All Sites', channels: ['Email', 'Push'], recipients: RECIPIENTS[0], escalation: ESCALATIONS[1], message: '{visitor} has arrived at {location}.' });
  }
  protected patchRule<K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) { this.rule.update((r) => (r ? { ...r, [k]: v } : r)); }
  protected flipRuleCh(c: NChannel) { this.rule.update((r) => (r ? { ...r, channels: r.channels.includes(c) ? r.channels.filter((x) => x !== c) : [...r.channels, c] } : r)); }
  protected saveRule() {
    const r = this.rule(); if (!r) return;
    if (!r.name.trim()) { this.ruleErr.set('Rule name is required.'); return; }
    if (!r.channels.length) { this.ruleErr.set('Pick at least one channel.'); return; }
    const icon = r.trigger.includes('out') ? 'vm-c-log-out' : r.trigger.includes('pprov') ? 'shield-check' : r.trigger.includes('Invitation') ? 'vm-c-mail' : 'bell';
    const triggerText = `When ${r.trigger.toLowerCase().replace('visitor ', 'a visitor is ').replace('approval overdue', 'an approval is overdue').replace('invitation created', 'an invitation is created')}${r.site === 'All Sites' ? '' : ` at ${r.site}`}.`;
    const data = { name: r.name.trim(), trigger: r.trigger, channels: r.channels, site: r.site, recipients: r.recipients, message: r.message };
    if (r.id) this.templates.update((l) => l.map((t) => (t.id === r.id ? { ...t, ...data } : t)));
    else this.templates.update((l) => [...l, { ...data, id: `T${++this.seq}`, icon, triggerText, enabled: true }]);
    this.rule.set(null);
    this.toast(r.id ? `Rule "${data.name}" updated` : `Rule "${data.name}" created and enabled`);
  }

  // settings
  protected setCfg<K extends keyof Cfg>(k: K, v: Cfg[K]) { this.cfg.update((c) => ({ ...c, [k]: v })); }
  protected flipTrigger(t: string) { this.cfg.update((c) => ({ ...c, triggers: c.triggers.includes(t) ? c.triggers.filter((x) => x !== t) : [...c.triggers, t] })); }
  protected flipChannel(ch: NChannel) { this.cfg.update((c) => ({ ...c, channels: c.channels.includes(ch) ? c.channels.filter((x) => x !== ch) : [...c.channels, ch] })); }
  protected saveSettings() {
    if (!this.cfg().channels.length) { this.toast('Enable at least one delivery channel'); return; }
    this.saved.set(JSON.stringify(this.cfg()));
    this.toast(`Notification settings saved for ${this.cfg().scope}`);
  }
  protected testNotification() {
    const ch = this.cfg().channels;
    if (!ch.length) { this.toast('Enable at least one delivery channel'); return; }
    this.testing.set(true);
    ch.forEach((c) => this.send({ kind: 'System', label: 'Test:', text: `Test notification (${this.cfg().scope}).`, recipient: 'Priya Sharma', channel: c, vid: '—', site: SITES[0] }));
    setTimeout(() => { this.testing.set(false); this.toast(`Test delivered on ${ch.length} channel${ch.length > 1 ? 's' : ''} to Priya Sharma`); }, 1500);
  }

  // announcement
  protected flipAnnCh(c: NChannel) { this.annCh.update((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c])); }
  protected sendAnnouncement(aud: string, subject: string, body: string, prio: string) {
    if (!subject.trim() || !body.trim()) { this.toast('Subject and message are required'); return; }
    const n = AUDIENCES.find((a) => a[0] === aud)?.[1] ?? 1;
    this.annCh().forEach((c) => this.send({ kind: 'System', label: `Announcement${prio !== 'Normal' ? ` (${prio})` : ''}:`, text: subject.trim(), recipient: `${aud} (${n})`, channel: c, vid: '—', site: SITES[0] }));
    this.extraSent.update((x) => x + n * this.annCh().length - this.annCh().length);
    this.annOpen.set(false);
    this.toast(`Announcement sent to ${n} recipient${n > 1 ? 's' : ''} via ${this.annCh().join(', ')}`);
  }

  // delivery log
  protected resendLog(l: LogEntry) {
    this.menu.set(null);
    if (l.status === 'Failed') {
      this.patchLog(l.id, { status: 'Queued' });
      setTimeout(() => { this.patchLog(l.id, { status: 'Delivered' }); this.fixed.update((n) => n + 1); this.toast(`Retry succeeded – delivered to ${l.recipient}`); }, 1300);
      this.toast(`Retrying delivery to ${l.recipient}…`);
      return;
    }
    this.send({ kind: l.kind, label: l.label, text: l.text, recipient: l.recipient, channel: l.channel, vid: l.vid, site: l.site });
    this.toast(`Resent to ${l.recipient} via ${l.channel}`);
  }
  protected openResend(l: LogEntry) { this.menu.set(null); this.resend.set(l); }
  protected doResend(l: LogEntry, recipient: string, channel: string, text: string) {
    this.send({ kind: l.kind, label: 'Resent:', text: text.replace(l.label, '').trim() || l.text, recipient, channel: channel as NChannel, vid: l.vid, site: l.site });
    this.resend.set(null);
    this.toast(`Resent to ${recipient} via ${channel}`);
  }
  protected deleteLog(ids: string[]) {
    this.log.update((l) => l.filter((x) => !ids.includes(x.id)));
    this.logChecked.set(new Set());
    this.menu.set(null);
    this.toast(`${ids.length} log entr${ids.length > 1 ? 'ies' : 'y'} deleted`);
  }
  protected bulkLog(k: 'resend' | 'export' | 'delete') {
    const ids = [...this.logChecked()];
    const rows = this.log().filter((l) => ids.includes(l.id));
    if (k === 'delete') { this.deleteLog(ids); return; }
    if (k === 'export') { this.csv(rows); return; }
    rows.forEach((l) => this.resendLog(l));
    this.logChecked.set(new Set());
    this.toast(`${rows.length} notification(s) resent`);
  }
  private csv(rows: LogEntry[]) {
    downloadCsv('host-notification-log.csv', [
      ['Date & Time', 'Type', 'Notification', 'Recipient', 'Channel', 'Related Visitor', 'Site', 'Delivery Status'],
      ...rows.map((l) => [`15 Oct 2026, ${hm2(l.ts)}`, l.kind, `${l.label} ${l.text}`, l.recipient, l.channel, l.vid, l.site, l.status]),
    ]);
    this.toast(`Exported ${rows.length} log entr${rows.length === 1 ? 'y' : 'ies'}`);
  }
  protected exportLog() { this.csv(this.logRows()); }
  protected exportLive() {
    this.menu.set(null);
    const l = this.liveRows();
    downloadCsv('live-host-notifications.csv', [['Visitor', 'Message', 'Details', 'Time', 'Channels', 'Host', 'Unread'], ...l.map((n) => [n.who, `${n.text} ${n.place ?? ''}`.trim(), n.sub, agoLabel(n.ago), n.channels.join(' / '), n.host, n.unread ? 'Yes' : 'No'])]);
    this.toast(`Exported ${l.length} notifications`);
  }
  protected copy(v: string) { navigator.clipboard?.writeText(v).catch(() => {}); this.menu.set(null); this.toast(`${v} copied`); }
  protected refresh() {
    this.q.set(''); this.site.set(''); this.channel.set(''); this.type.set(''); this.status.set(''); this.tab.set('All Notifications');
    this.spinning.set(true); setTimeout(() => this.spinning.set(false), 700);
    this.toast('Notifications refreshed');
  }
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected toast(m: string) { this.msg.set(m); clearTimeout(this.timer); this.timer = setTimeout(() => this.msg.set(null), 2600); }
}
