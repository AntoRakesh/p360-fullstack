// Integrations & Connectors used by workflow steps: health, auth, configure, test connection, usage and API log.
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { toast } from './workflow-pages-a';
import { WfToggle } from './workflow-shared';
import { ConnCfg, Connector, ConnStatus, statusTagCls, Workflow, WorkflowStore } from './workflow.data';

const CATS = ['All', 'HRIS', 'Collaboration', 'Messaging', 'ITSM', 'Payroll', 'Identity', 'Calendar', 'Custom'] as const;
const AUTHS = ['OAuth 2.0', 'OAuth 2.0 (Entra ID)', 'OAuth 2.0 (SAML bearer)', 'OAuth 2.0 (Bot)', 'API key', 'API token', 'Basic + mTLS', 'mTLS certificate', 'HMAC signature', 'LDAPS service account', 'SMTP AUTH (TLS)', 'REST API key'];
const SYNC = ['Real-time (events)', 'Every 5 min', 'Every 15 min', 'Hourly', 'Nightly'];
const defCfg = (c: Connector): ConnCfg => ({
  clientId: `p360-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 14)}-wf`,
  scopes: c.category === 'HRIS' ? 'employee.read leave.write' : c.category === 'Calendar' ? 'Calendars.ReadWrite' : c.category === 'Collaboration' || c.category === 'Messaging' ? 'chat:write channels:read' : 'api.full',
  timeoutS: 30, retries: 3, rateLimit: 600, channel: c.category === 'Collaboration' || c.category === 'Messaging' ? '#hr-approvals' : '', syncEvery: c.category === 'HRIS' ? 'Every 15 min' : 'Real-time (events)', signing: c.category === 'Custom',
});
type TestStep = { label: string; detail: string; state: 'pend' | 'run' | 'ok' | 'bad'; ms: number };

@Component({
  selector: 'app-workflow-integrations-connectors',
  imports: [...UI, DataTable, WfToggle, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Integrations &amp; Connectors" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="External systems that workflow steps call — HRIS, payroll, Teams/Slack, email, ITSM and custom REST webhooks.">
      <button class="btn-primary" (click)="addOpen.set(true)"><app-icon name="plus" [size]="16" />Add Connector</button>
      <button class="btn-ghost" (click)="testAll()"><app-icon name="activity" [size]="15" />Health check all</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Connected" [value]="byStatus('Connected') + ' / ' + store.connectors().length" icon="plug" color="var(--ka-22c55e)" [sub]="byStatus('Not Connected') + ' available to connect'" />
      <app-kpi label="API Calls (24 h)" [value]="calls().toLocaleString()" icon="activity" color="var(--ka-3b82f6)" change="6%" sub="vs. yesterday" />
      <app-kpi label="Error Rate" [value]="errRate() + '%'" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="errors() + ' failed calls'" [subColor]="errRate() > 1 ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Avg. Latency" [value]="latency() + ' ms'" icon="workflow-timer" color="var(--ka-f59e0b)" change="18 ms" [up]="false" sub="vs. last week" />
      <app-kpi label="Used in Workflows" [value]="wfUsing()" icon="workflow" color="var(--ka-7c3aed)" [sub]="stepUses() + ' integration steps'" />
      <app-kpi label="Needs Attention" [value]="attention().length" icon="workflow-unplug" color="var(--ka-f97316)" [sub]="attention().length ? attention()[0].name + (attention().length > 1 ? ' +' + (attention().length - 1) : '') : 'all healthy'" />
    </section>

    @if (attention().length) {
      <div class="alert"><app-icon name="triangle-alert" [size]="16" />
        <span><b>{{ attention()[0].name }}</b> is returning errors ({{ attention()[0].errors24h }} failed calls in 24 h) — {{ attention()[0].usedBy.length }} workflows are affected.</span>
        <button class="btn-ghost sm" (click)="select(attention()[0]); runTest(attention()[0])">Diagnose</button>
      </div>
    }

    <div class="tb">
      <nav class="cats">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}<span>{{ catCount(c) }}</span></button>}</nav>
      <div class="search-box sb"><app-icon name="search" [size]="15" /><input placeholder="Search connector or vendor..." [value]="q()" (input)="q.set($any($event.target).value)" /></div>
      <select class="select" [value]="st()" (change)="st.set($any($event.target).value)"><option value="All">All statuses</option>@for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}</select>
    </div>

    <section class="cl" [class.with-detail]="!!sel()">
      <div class="grid-c">
        @for (c of list(); track c.id) {
          <article class="card cc" [class.on]="sel()?.id === c.id" [class.dim]="c.status === 'Not Connected'" (click)="select(c)">
            <div class="ch">
              <span class="logo" [style.background]="c.color">{{ c.logo }}</span>
              <div class="nm"><b>{{ c.name }}</b><small>{{ c.vendor }} · {{ c.category }}</small></div>
              <span [class]="tag(c.status)">{{ c.status }}</span>
            </div>
            @if (c.status === 'Not Connected') {
              <p class="nc">Not connected yet. Connect to use it in workflow steps.</p>
              <button class="btn-primary sm conn" (click)="$event.stopPropagation(); openCfg(c)"><app-icon name="plug" [size]="14" />Connect</button>
            } @else {
              <app-sparkline [values]="c.trend" [color]="c.status === 'Error' ? 'var(--ka-ef4444)' : c.color" />
              <div class="cs">
                <div><b>{{ c.calls24h | number }}</b><small>calls 24 h</small></div>
                <div><b [class.red]="c.errors24h > 20">{{ c.errors24h }}</b><small>errors</small></div>
                <div><b>{{ c.lastSync }}</b><small>last sync</small></div>
              </div>
              <div class="cf">
                <span class="muted"><app-icon name="workflow" [size]="12" /> {{ usage(c).length }} workflow{{ usage(c).length === 1 ? '' : 's' }}</span>
                <span class="acts">
                  <button class="btn-ghost sm" (click)="$event.stopPropagation(); select(c); runTest(c)">Test</button>
                  <button class="btn-ghost sm" (click)="$event.stopPropagation(); openCfg(c)">Configure</button>
                </span>
              </div>
            }
          </article>
        } @empty {
          <div class="card empty">No connectors match.</div>
        }
      </div>

      @if (sel(); as c) {
        <aside class="card detail">
          <div class="dh">
            <span class="logo big" [style.background]="c.color">{{ c.logo }}</span>
            <div><h3>{{ c.name }}</h3><small class="muted">{{ c.vendor }} · {{ c.category }} · {{ c.id }}</small></div>
            <button class="close-btn" (click)="selId.set(null)">×</button>
          </div>
          <div class="sline"><span [class]="tag(c.status)">{{ c.status }}</span><span class="muted">Last sync {{ c.lastSync }}</span></div>
          <div class="btns">
            @if (c.status === 'Not Connected') {
              <button class="btn-primary" (click)="openCfg(c)"><app-icon name="plug" [size]="15" />Connect</button>
            } @else {
              <button class="btn-primary" [disabled]="testing()" (click)="runTest(c)"><app-icon name="activity" [size]="15" />{{ testing() ? 'Testing…' : 'Test connection' }}</button>
              <button class="btn-ghost" [disabled]="c.status !== 'Connected'" (click)="syncNow(c)"><app-icon name="refresh" [size]="15" />Sync now</button>
              <button class="btn-ghost" (click)="openCfg(c)"><app-icon name="settings" [size]="15" />Configure</button>
              <button class="btn-ghost" (click)="pause(c)"><app-icon [name]="c.status === 'Paused' ? 'workflow-play' : 'pause'" [size]="14" />{{ c.status === 'Paused' ? 'Resume' : 'Pause' }}</button>
              <button class="btn-ghost danger" (click)="discId.set(c.id)"><app-icon name="workflow-unplug" [size]="15" /></button>
            }
          </div>

          @if (testFor() === c.id) {
            <div class="test">
              <h4>Connection test</h4>
              @for (s of tSteps(); track s.label) {
                <div class="ts" [class]="s.state"><i>{{ s.state === 'ok' ? '✓' : s.state === 'bad' ? '✕' : s.state === 'run' ? '…' : '' }}</i><div><b>{{ s.label }}</b><small>{{ s.detail }}@if (s.state === 'ok' || s.state === 'bad') { · {{ s.ms }} ms}</small></div></div>
              }
              @if (tResult(); as r) {
                <div class="verdict" [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</div>
                @if (!r.ok) {<button class="btn-primary sm" (click)="reauth(c)"><app-icon name="workflow-key" [size]="14" />Re-authenticate &amp; retry failed calls</button>}
              }
            </div>
          }

          <dl class="facts">
            <dt>Authentication</dt><dd><app-icon name="workflow-key" [size]="13" /> {{ c.auth }}</dd>
            <dt>Endpoint</dt><dd class="mono">{{ c.endpoint }} <button class="cp" (click)="copy(c.endpoint)" title="Copy"><app-icon name="workflow-copy" [size]="12" /></button></dd>
            <dt>Client ID</dt><dd class="mono">{{ cfgOf(c).clientId }}</dd>
            <dt>Sync</dt><dd>{{ cfgOf(c).syncEvery }}</dd>
            <dt>Timeout / retries</dt><dd>{{ cfgOf(c).timeoutS }} s · {{ cfgOf(c).retries }} retries (exp. backoff)</dd>
            <dt>Rate limit</dt><dd>{{ cfgOf(c).rateLimit }} req/min</dd>
            @if (cfgOf(c).channel) {<dt>Default channel</dt><dd>{{ cfgOf(c).channel }}</dd>}
          </dl>

          @if (c.status !== 'Not Connected') {
            <h4>Calls · last 12 h</h4>
            <app-column-chart [labels]="hours" [series]="[{ name: 'Calls', color: c.status === 'Error' ? 'var(--ka-ef4444)' : c.color, values: c.trend }]" [height]="130" [legend]="false" />
          }

          <h4>Used by workflows <span class="muted">({{ usage(c).length }})</span></h4>
          <ul class="uses">
            @for (u of usage(c); track u.name) {
              <li>
                <span class="ui" [style.background]="u.wf ? 'color-mix(in srgb, ' + u.wf.color + ' 10%, transparent)' : 'var(--ka-eef0f5)'" [style.color]="u.wf?.color ?? 'var(--ka-6b7090)'"><app-icon [name]="u.wf?.icon ?? 'workflow'" [size]="14" /></span>
                <div><b>{{ u.name }}</b><small>{{ u.steps.length ? 'Step: ' + u.steps.join(', ') : 'Notifications / lookups' }}</small></div>
                @if (u.wf) {<button class="link" (click)="openWf(u.wf)">Open →</button>}
              </li>
            } @empty {<li class="muted">Not used by any workflow yet. Add an Integration step in the Designer.</li>}
          </ul>

          <h4>Recent calls</h4>
          <ul class="calls">
            @for (l of logsOf(c); track l.id) {<li><span class="mono">{{ l.op }}</span><small>{{ l.at }} · {{ l.records }} rec · {{ l.ms }} ms</small><span [class]="tag(l.status)">{{ l.status }}</span></li>}
            @empty {<li class="muted">No calls recorded.</li>}
          </ul>
        </aside>
      }
    </section>

    <section class="bot">
      <div class="card">
        <div class="card-head"><h3>API &amp; Sync Log</h3><em class="chip live"><i></i>Live</em></div>
        <app-data-table [rows]="logs()" [columns]="logCols" [filters]="logFilters" [actions]="logActions" [selectable]="true" [bulkActions]="logBulk" noun="calls" [pageSize]="8"
          [searchKeys]="['connector', 'op']" searchPlaceholder="Search connector or operation..." (action)="logAct($event.action, $event.row)" (bulk)="logBulkAct($event.ids)" />
      </div>
      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Calls by Connector</h3><span class="muted sm">24 h</span></div>
          <app-bar-list [rows]="byConn()" [max]="byConnMax()" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Connector Health</h3></div>
          <app-donut [segments]="health()" center="Connectors" [size]="130" />
        </div>
      </div>
    </section>

    <!-- configure / connect -->
    @if (cfgConn(); as c) {
      <div class="g-overlay" (click)="cfgId.set(null)"></div>
      <form class="g-modal wide" (submit)="$event.preventDefault(); saveCfg(c)">
        <div class="modal-head">
          <div class="mh"><span class="logo" [style.background]="c.color">{{ c.logo }}</span><div><h3>{{ c.status === 'Not Connected' ? 'Connect' : 'Configure' }} {{ c.name }}</h3><small class="muted">{{ c.vendor }} · {{ c.category }}</small></div></div>
          <button type="button" class="close-btn" (click)="cfgId.set(null)">×</button>
        </div>
        <div class="form-grid">
          <label>Authentication<select class="select" [value]="f().auth" (change)="setF({ auth: $any($event.target).value })">@for (a of auths(c); track a) {<option [value]="a">{{ a }}</option>}</select></label>
          <label>Sync frequency<select class="select" [value]="f().syncEvery" (change)="setF({ syncEvery: $any($event.target).value })">@for (s of syncs; track s) {<option [value]="s">{{ s }}</option>}</select></label>
          <label class="full">Endpoint / base URL *<input class="input mono" [value]="f().endpoint" (input)="setF({ endpoint: $any($event.target).value })" /></label>
          <label>Client ID / username<input class="input mono" [value]="f().clientId" (input)="setF({ clientId: $any($event.target).value })" /></label>
          <label>Client secret / key<input class="input" type="password" [value]="f().secret" (input)="setF({ secret: $any($event.target).value })" [placeholder]="c.status === 'Not Connected' ? 'Paste secret' : '•••••••• (unchanged)'" /></label>
          <label class="full">Scopes<input class="input mono" [value]="f().scopes" (input)="setF({ scopes: $any($event.target).value })" /></label>
          @if (c.category === 'Collaboration' || c.category === 'Messaging') {
            <label>Default channel / sender<input class="input" [value]="f().channel" (input)="setF({ channel: $any($event.target).value })" /></label>
          }
          <label>Timeout (s)<input class="input" type="number" min="5" max="120" [value]="f().timeoutS" (input)="setF({ timeoutS: +$any($event.target).value })" /></label>
          <label>Retries<input class="input" type="number" min="0" max="10" [value]="f().retries" (input)="setF({ retries: +$any($event.target).value })" /></label>
          <label>Rate limit (req/min)<input class="input" type="number" min="10" [value]="f().rateLimit" (input)="setF({ rateLimit: +$any($event.target).value })" /></label>
        </div>
        <div class="tg"><app-wf-toggle [on]="f().signing" (changed)="setF({ signing: $event })" label="Sign outbound payloads (HMAC-SHA256)" /></div>
        @if (c.status === 'Not Connected' && f().auth.startsWith('OAuth')) {
          <div class="oauth">
            <app-icon name="workflow-key" [size]="16" />
            <span>OAuth consent: People360 will request <b>{{ f().scopes }}</b> from {{ c.vendor }}.</span>
            <button type="button" class="btn-ghost sm" [disabled]="authing()" (click)="authorize()">{{ authorized() ? '✓ Authorized' : authing() ? 'Redirecting…' : 'Authorize with ' + c.vendor }}</button>
          </div>
        }
        @if (cfgErr()) {<p class="errt">{{ cfgErr() }}</p>}
        <div class="form-actions">
          <button type="button" class="btn-ghost" (click)="cfgId.set(null)">Cancel</button>
          <button class="btn-primary" type="submit">{{ c.status === 'Not Connected' ? 'Connect' : 'Save changes' }}</button>
        </div>
      </form>
    }

    <!-- add connector catalog -->
    @if (addOpen()) {
      <div class="g-overlay" (click)="addOpen.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Add a connector</h3><button class="close-btn" (click)="addOpen.set(false)">×</button></div>
        <h4>Available in catalog</h4>
        <div class="cat-grid">
          @for (c of available(); track c.id) {
            <button class="cat-it" (click)="addOpen.set(false); select(c); openCfg(c)"><span class="logo" [style.background]="c.color">{{ c.logo }}</span><div><b>{{ c.name }}</b><small>{{ c.category }} · {{ c.status }}</small></div></button>
          } @empty {<p class="muted">Every catalog connector is already set up.</p>}
        </div>
        <h4>Custom REST / webhook</h4>
        <div class="form-grid">
          <label>Name *<input class="input" [value]="hook().name" (input)="hook.set({ ...hook(), name: $any($event.target).value })" placeholder="e.g. Canteen POS" /></label>
          <label>Method<select class="select" [value]="hook().method" (change)="hook.set({ ...hook(), method: $any($event.target).value })"><option>POST</option><option>PUT</option><option>GET</option></select></label>
          <label class="full">URL *<input class="input mono" [value]="hook().url" (input)="hook.set({ ...hook(), url: $any($event.target).value })" placeholder="https://api.example.com/hooks/people360" /></label>
          <label>Auth<select class="select" [value]="hook().auth" (change)="hook.set({ ...hook(), auth: $any($event.target).value })"><option>HMAC signature</option><option>API key</option><option>OAuth 2.0</option></select></label>
        </div>
        @if (hookErr()) {<p class="errt">{{ hookErr() }}</p>}
        <div class="form-actions"><button class="btn-ghost" (click)="addOpen.set(false)">Close</button><button class="btn-primary" (click)="addHook()">Create webhook connector</button></div>
      </div>
    }

    @if (discConn(); as c) {
      <div class="g-overlay" (click)="discId.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Disconnect {{ c.name }}?</h3><button class="close-btn" (click)="discId.set(null)">×</button></div>
        <p>Credentials will be revoked. @if (usage(c).length) {<b>{{ usage(c).length }} workflows</b> use this connector — their integration steps will fail until it is reconnected.}</p>
        <div class="form-actions"><button class="btn-ghost" (click)="discId.set(null)">Cancel</button><button class="btn-primary dangerb" (click)="disconnect(c)">Disconnect</button></div>
      </div>
    }
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .alert { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--kb-fef2f2); border: 1px solid var(--kl-fecaca); color: var(--kf-991b1b); font-size: 12.5px; margin-bottom: 12px; }
    .alert span { flex: 1; }
    .tb { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
    .cats { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; }
    .cats button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--kb-ffffff); font-size: 12.5px; cursor: pointer; color: var(--kf-3b3f5c); }
    .cats button span { font-size: 10.5px; padding: 0 6px; border-radius: 10px; background: var(--kb-eef0f5); }
    .cats button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .cats button.on span { background: rgba(255,255,255,.25); }
    .sb { width: 240px; }
    .cl { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; margin-bottom: 12px; }
    .cl.with-detail { grid-template-columns: minmax(0, 1.5fr) minmax(400px, 1fr); }
    .grid-c { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .cc { cursor: pointer; display: flex; flex-direction: column; gap: 10px; padding: 14px; transition: box-shadow .15s, border-color .15s; border: 1px solid transparent; }
    .cc:hover { border-color: var(--kl-d8cff9); } .cc.on { border-color: var(--primary); box-shadow: 0 0 0 3px var(--kb-ede9fe); }
    .cc.dim { background: var(--kb-fbfbfd); }
    .ch { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; }
    .logo { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; color: var(--kf-ffffff); font-weight: 700; font-size: 12.5px; flex-shrink: 0; }
    .logo.big { width: 44px; height: 44px; font-size: 14px; }
    .nm { min-width: 0; display: flex; flex-direction: column; } .nm b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .nm small { font-size: 11px; color: var(--muted); }
    .nc { margin: 0; font-size: 12px; color: var(--muted); flex: 1; } .conn { align-self: flex-start; }
    .cs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .cs div { display: flex; flex-direction: column; } .cs b { font-size: 13px; white-space: nowrap; } .cs small { font-size: 10.5px; color: var(--muted); }
    .red { color: var(--kf-dc2626); }
    .cf { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--kl-f0f1f6); padding-top: 8px; font-size: 11.5px; }
    .cf .muted { display: inline-flex; gap: 4px; align-items: center; } .acts { display: flex; gap: 6px; }
    .empty { grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px; }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 8px; }
    .dh { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; } .dh h3 { font-size: 16px; }
    .sline { display: flex; gap: 10px; align-items: center; font-size: 12px; }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    h4 { margin: 8px 0 2px; font-size: 13px; } h4 .muted { font-weight: 400; }
    .test { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--kb-fcfcff); }
    .test h4 { margin-top: 0; }
    .ts { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 5px 0; font-size: 12.5px; }
    .ts i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 700; background: var(--kb-eef0f5); color: var(--kf-6b7090); }
    .ts.ok i { background: var(--kb-22c55e); color: var(--kf-ffffff); } .ts.bad i { background: var(--kb-ef4444); color: var(--kf-ffffff); } .ts.run i { background: var(--kb-3b82f6); color: var(--kf-ffffff); animation: pulse 1s infinite; } .ts.pend { opacity: .5; }
    .ts small { display: block; color: var(--muted); font-size: 11px; }
    @keyframes pulse { 50% { box-shadow: 0 0 0 5px var(--kb-bfdbfe); } }
    .verdict { margin: 6px 0; padding: 7px 10px; border-radius: 7px; font-size: 12.5px; font-weight: 600; }
    .verdict.ok { background: var(--kb-dcfce7); color: var(--kf-15803d); } .verdict.bad { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .facts { display: grid; grid-template-columns: 120px 1fr; gap: 6px; font-size: 12.5px; margin: 4px 0 0; } .facts dt { color: var(--muted); } .facts dd { margin: 0; word-break: break-all; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
    .cp { border: 0; background: none; cursor: pointer; color: var(--muted); padding: 2px; }
    .uses, .calls { list-style: none; margin: 0; padding: 0; }
    .uses li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .uses .ui { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; } .uses small { display: block; color: var(--muted); font-size: 11px; }
    .uses li.muted, .calls li.muted { display: block; border: 0; }
    .link { border: 0; background: none; cursor: pointer; }
    .calls li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .calls small { color: var(--muted); font-size: 11px; white-space: nowrap; }
    .bot { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 12px; } .sm { font-size: 12px; }
    .mh { display: flex; gap: 12px; align-items: center; }
    .tg { margin: 14px 0 4px; }
    .oauth { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--kb-eff6ff); color: var(--kf-1e3a8a); font-size: 12.5px; } .oauth span { flex: 1; }
    .errt { color: var(--red); font-size: 12.5px; } .dangerb { background: var(--red) !important; border-color: var(--red) !important; }
    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-bottom: 8px; }
    .cat-it { display: grid; grid-template-columns: 38px 1fr; gap: 10px; align-items: center; text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; font: inherit; }
    .cat-it:hover { border-color: var(--primary); } .cat-it small { display: block; color: var(--muted); font-size: 11px; } .cat-it b { font-size: 12.5px; }
    @media (max-width: 1250px) { .cl.with-detail, .bot { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class IntegrationsConnectors {
  protected readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  protected readonly cats = CATS;
  protected readonly statuses: ConnStatus[] = ['Connected', 'Error', 'Paused', 'Not Connected'];
  protected readonly syncs = SYNC;
  protected readonly tag = statusTagCls;
  protected readonly hours = Array.from({ length: 12 }, (_, i) => `${i - 11 || 'now'}${i === 11 ? '' : 'h'}`);
  protected readonly cat = signal<(typeof CATS)[number]>('All');
  protected readonly q = signal('');
  protected readonly st = signal('All');
  protected readonly selId = signal<string | null>('C1');
  protected readonly toastS = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly discId = signal<string | null>(null);
  protected readonly cfgId = signal<string | null>(null);
  protected readonly f = signal<ConnCfg & { auth: string; endpoint: string; secret: string }>({ ...defCfg(this.store.connectors()[0]), auth: '', endpoint: '', secret: '' });
  protected readonly cfgErr = signal('');
  protected readonly authing = signal(false);
  protected readonly authorized = signal(false);
  protected readonly hook = signal({ name: '', url: '', method: 'POST', auth: 'HMAC signature' });
  protected readonly hookErr = signal('');
  // connection test
  protected readonly testFor = signal<string | null>(null);
  protected readonly tSteps = signal<TestStep[]>([]);
  protected readonly tResult = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly testing = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.connectors().filter((c) => (this.cat() === 'All' || c.category === this.cat()) && (this.st() === 'All' || c.status === this.st()) && (!q || `${c.name} ${c.vendor}`.toLowerCase().includes(q)));
  });
  protected readonly sel = computed(() => this.store.connectors().find((c) => c.id === this.selId()) ?? null);
  protected catCount(c: string) {
    return c === 'All' ? this.store.connectors().length : this.store.connectors().filter((x) => x.category === c).length;
  }
  protected byStatus(s: ConnStatus) {
    return this.store.connectors().filter((c) => c.status === s).length;
  }
  protected readonly calls = computed(() => this.store.connectors().reduce((a, c) => a + c.calls24h, 0));
  protected readonly errors = computed(() => this.store.connectors().reduce((a, c) => a + c.errors24h, 0));
  protected readonly errRate = computed(() => Math.round((this.errors() / Math.max(1, this.calls())) * 1000) / 10);
  protected readonly latency = computed(() => {
    const l = this.store.syncLogs().slice(0, 60);
    return l.length ? Math.round(l.reduce((a, x) => a + x.ms, 0) / l.length) : 0;
  });
  protected readonly attention = computed(() => this.store.connectors().filter((c) => c.status === 'Error'));
  /** Integration steps in workflow graphs, grouped by connector name. */
  private readonly steps = computed(() => {
    const m = new Map<string, { wf: Workflow; step: string }[]>();
    this.store.workflows().forEach((w) =>
      w.nodes.filter((n) => n.type === 'integration').forEach((n) => {
        const k = n.cfg.connector || n.sub;
        m.set(k, [...(m.get(k) ?? []), { wf: w, step: n.name }]);
      }),
    );
    return m;
  });
  protected readonly stepUses = computed(() => [...this.steps().values()].reduce((a, l) => a + l.length, 0));
  protected readonly wfUsing = computed(() => new Set(this.store.connectors().flatMap((c) => this.usage(c).map((u) => u.name))).size);
  protected usage(c: Connector) {
    const out = new Map<string, { name: string; wf: Workflow | null; steps: string[] }>();
    const wfs = this.store.workflows();
    const find = (n: string) => wfs.find((w) => w.name.replace(' Workflow', '') === n.replace(' Workflow', '')) ?? null;
    c.usedBy.forEach((n) => out.set(n, { name: n, wf: find(n), steps: [] }));
    const alias: Record<string, string[]> = { 'ADP Payroll': ['Payroll'], 'Access Control (Lenel)': ['Access Control'], 'Generic Webhook': ['Webhook'], 'SAP SuccessFactors': ['SAP', 'HRIS'], 'Active Directory': ['Active Directory'] };
    const keys = [c.name, ...(alias[c.name] ?? [])];
    for (const [k, l] of this.steps()) {
      if (keys.some((x) => k === x || k.includes(x))) {
        l.forEach(({ wf, step }) => {
          const n = wf.name.replace(' Workflow', '');
          const e = out.get(n) ?? { name: n, wf, steps: [] };
          e.wf = wf;
          if (!e.steps.includes(step)) e.steps.push(step);
          out.set(n, e);
        });
      }
    }
    return [...out.values()];
  }
  protected cfgOf(c: Connector) {
    return c.cfg ?? defCfg(c);
  }
  protected logsOf(c: Connector) {
    return this.store.syncLogs().filter((l) => l.connector === c.name).slice(0, 6);
  }
  protected readonly available = computed(() => this.store.connectors().filter((c) => c.status === 'Not Connected' || c.status === 'Paused'));
  protected readonly byConn = computed(() => {
    const top = [...this.store.connectors()].filter((c) => c.calls24h).sort((a, b) => b.calls24h - a.calls24h).slice(0, 7);
    return top.map((c) => ({ label: c.name, value: c.calls24h, display: c.calls24h.toLocaleString(), color: c.status === 'Error' ? 'var(--ka-ef4444)' : c.color }));
  });
  protected readonly byConnMax = computed(() => Math.max(1, ...this.byConn().map((r) => r.value)));
  protected readonly health = computed(() => [
    { label: 'Connected', value: this.byStatus('Connected'), color: 'var(--ka-22c55e)' },
    { label: 'Error', value: this.byStatus('Error'), color: 'var(--ka-ef4444)' },
    { label: 'Paused', value: this.byStatus('Paused'), color: 'var(--ka-f59e0b)' },
    { label: 'Not connected', value: this.byStatus('Not Connected'), color: 'var(--ka-cbd0dd)' },
  ]);

  protected readonly logCols: Col[] = [
    { key: 'at', label: 'Time' },
    { key: 'connector', label: 'Connector' },
    { key: 'op', label: 'Operation' },
    { key: 'records', label: 'Records', kind: 'num' },
    { key: 'ms', label: 'Latency (ms)', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => statusTagCls(r.status) },
  ];
  protected readonly logFilters = [
    { key: 'status', label: 'Status', options: ['Success', 'Failed', 'Retrying'] },
    { key: 'connector', label: 'Connector', options: [...new Set(this.store.syncLogs().map((l) => l.connector))] },
  ];
  protected readonly logActions: RowAction[] = [{ id: 'retry', label: 'Retry call', icon: 'refresh', when: (r) => r.status !== 'Success' }, { id: 'open', label: 'Open connector', icon: 'eye' }];
  protected readonly logBulk: RowAction[] = [{ id: 'retry', label: 'Retry selected' }];
  protected readonly logs = computed(() => this.store.syncLogs());

  protected select(c: Connector) {
    this.selId.set(c.id);
    if (this.testFor() !== c.id) {
      clearTimeout(this.timer);
      this.testFor.set(null);
      this.testing.set(false);
    }
  }
  protected auths(c: Connector) {
    return AUTHS.includes(c.auth) ? AUTHS : [c.auth, ...AUTHS];
  }

  // ---- connection test ----
  protected runTest(c: Connector) {
    clearTimeout(this.timer);
    const host = c.endpoint.replace(/^\w+:\/\//, '').split(/[/:]/)[0];
    const failAt = c.status === 'Error' ? 3 : c.status === 'Paused' ? 2 : -1;
    const steps: TestStep[] = [
      { label: 'DNS resolve', detail: host, state: 'pend', ms: 12 },
      { label: 'TLS handshake', detail: 'TLS 1.3 · certificate valid until Mar 2027', state: 'pend', ms: 48 },
      { label: 'Authenticate', detail: c.status === 'Paused' ? 'Connector paused — token not refreshed' : c.auth, state: 'pend', ms: 120 },
      { label: 'Sample request', detail: c.status === 'Error' ? 'GET /health → 503 Service Unavailable' : `GET ${c.category === 'Messaging' ? '/auth.test' : '/health'} → 200 OK`, state: 'pend', ms: 180 + (c.id.length * 37) % 200 },
    ];
    this.testFor.set(c.id);
    this.tSteps.set(steps);
    this.tResult.set(null);
    this.testing.set(true);
    let k = 0;
    const tick = () => {
      this.tSteps.update((l) => l.map((s, i) => (i === k ? { ...s, state: 'run' } : s)));
      this.timer = setTimeout(() => {
        const bad = k === failAt;
        this.tSteps.update((l) => l.map((s, i) => (i === k ? { ...s, state: bad ? 'bad' : 'ok' } : s)));
        if (bad || k === steps.length - 1) {
          this.testing.set(false);
          const total = steps.slice(0, k + 1).reduce((a, s) => a + s.ms, 0);
          this.tResult.set(bad ? { ok: false, text: `Failed at “${steps[k].label}” after ${total} ms` } : { ok: true, text: `Healthy — round-trip ${total} ms` });
          this.store.logSync(c.id, 'GET /health (test)', bad);
          if (bad) this.tSteps.update((l) => l.map((s, i) => (i > k ? { ...s, detail: 'skipped' } : s)));
          return;
        }
        k++;
        tick();
      }, 420);
    };
    tick();
  }
  protected reauth(c: Connector) {
    this.store.patchConn(c.id, { status: 'Connected', lastSync: 'Just now' });
    const failed = this.store.syncLogs().filter((l) => l.connector === c.name && l.status !== 'Success');
    this.store.syncLogs.update((l) => l.map((x) => (x.connector === c.name && x.status !== 'Success' ? { ...x, status: 'Success' } : x)));
    this.store.pushActivity(`${c.name} re-authenticated · ${failed.length} calls replayed`, 'var(--ka-22c55e)');
    this.msg(`${c.name} re-authenticated · ${failed.length} failed calls replayed`);
    this.runTest({ ...c, status: 'Connected' });
  }
  protected testAll() {
    const live = this.store.connectors().filter((c) => c.status !== 'Not Connected');
    live.forEach((c) => this.store.logSync(c.id, 'GET /health (check)', c.status === 'Error'));
    const bad = live.filter((c) => c.status !== 'Connected');
    this.msg(`${live.length - bad.length} healthy · ${bad.length ? bad.map((c) => c.name + ' (' + c.status.toLowerCase() + ')').join(', ') : 'no issues'}`);
  }
  protected syncNow(c: Connector) {
    this.store.logSync(c.id, c.category === 'HRIS' ? 'GET /employees (full)' : 'POST /sync', false);
    this.msg(`${c.name} synced`);
  }
  protected pause(c: Connector) {
    const s: ConnStatus = c.status === 'Paused' ? 'Connected' : 'Paused';
    this.store.patchConn(c.id, { status: s, lastSync: s === 'Connected' ? 'Just now' : c.lastSync });
    this.store.pushActivity(`${c.name} ${s === 'Paused' ? 'paused' : 'resumed'}`, s === 'Paused' ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)');
    this.msg(`${c.name} ${s === 'Paused' ? 'paused — calls will queue' : 'resumed'}`);
  }
  protected readonly discConn = computed(() => this.store.connectors().find((c) => c.id === this.discId()) ?? null);
  protected disconnect(c: Connector) {
    this.store.patchConn(c.id, { status: 'Not Connected', calls24h: 0, errors24h: 0, lastSync: '—', trend: Array(12).fill(0) });
    this.discId.set(null);
    this.testFor.set(null);
    this.msg(`${c.name} disconnected`);
  }

  // ---- configure ----
  protected readonly cfgConn = computed(() => this.store.connectors().find((c) => c.id === this.cfgId()) ?? null);
  protected openCfg(c: Connector) {
    this.f.set({ ...this.cfgOf(c), auth: c.auth, endpoint: c.endpoint, secret: '' });
    this.cfgErr.set('');
    this.authorized.set(false);
    this.authing.set(false);
    this.cfgId.set(c.id);
  }
  protected setF(p: Partial<ConnCfg & { auth: string; endpoint: string; secret: string }>) {
    this.f.update((v) => ({ ...v, ...p }));
  }
  protected authorize() {
    this.authing.set(true);
    setTimeout(() => {
      this.authing.set(false);
      this.authorized.set(true);
    }, 1100);
  }
  protected saveCfg(c: Connector) {
    const v = this.f();
    if (!v.endpoint.trim()) return this.cfgErr.set('Endpoint is required.');
    const connecting = c.status === 'Not Connected';
    if (connecting && v.auth.startsWith('OAuth') && !this.authorized()) return this.cfgErr.set(`Authorize with ${c.vendor} first.`);
    if (connecting && !v.auth.startsWith('OAuth') && !v.secret.trim()) return this.cfgErr.set('Enter the secret / key to connect.');
    const { auth, endpoint } = v;
    const cfg: ConnCfg = { clientId: v.clientId, scopes: v.scopes, timeoutS: v.timeoutS, retries: v.retries, rateLimit: v.rateLimit, channel: v.channel, syncEvery: v.syncEvery, signing: v.signing };
    this.store.patchConn(c.id, { auth, endpoint: endpoint.trim(), cfg, ...(connecting ? { status: 'Connected' as ConnStatus, lastSync: 'Just now', trend: Array.from({ length: 12 }, (_, i) => (i > 9 ? 3 + i : 0)) } : {}) });
    this.cfgId.set(null);
    this.selId.set(c.id);
    if (connecting) {
      this.store.pushActivity(`${c.name} connected`, 'var(--ka-22c55e)');
      this.store.logSync(c.id, 'GET /health (connect)', false);
      this.msg(`${c.name} connected — now available as an Integration step in the Designer`);
    } else this.msg(`${c.name} configuration saved`);
  }
  protected addHook() {
    const h = this.hook();
    if (!h.name.trim() || !/^https?:\/\/\S+$/.test(h.url.trim())) return this.hookErr.set('Enter a name and a valid http(s) URL.');
    const id = `C${Math.max(...this.store.connectors().map((c) => +c.id.slice(1))) + 1}`;
    const c: Connector = {
      id, name: h.name.trim(), vendor: 'Custom', category: 'Custom', status: 'Connected', logo: '{ }', color: 'var(--ka-0891b2)', calls24h: 0, errors24h: 0, lastSync: 'Just now',
      auth: h.auth, endpoint: `${h.method} ${h.url.trim()}`, usedBy: [], trend: Array(12).fill(0),
    };
    this.store.connectors.update((l) => [...l, c]);
    this.store.logSync(id, `${h.method} / (verify)`, false);
    this.hook.set({ name: '', url: '', method: 'POST', auth: 'HMAC signature' });
    this.hookErr.set('');
    this.addOpen.set(false);
    this.cat.set('All');
    this.selId.set(id);
    this.msg(`${c.name} created and verified`);
  }

  protected openWf(w: Workflow) {
    this.store.currentId.set(w.id);
    this.router.navigate(['/workflow-automation/workflow-designer']);
  }
  protected copy(t: string) {
    navigator.clipboard?.writeText(t).catch(() => undefined);
    this.msg('Endpoint copied');
  }
  protected logAct(a: string, row: { id: number; connector: string; op: string }) {
    const c = this.store.connectors().find((x) => x.name === row.connector);
    if (a === 'open' && c) return this.select(c);
    this.retry([row.id]);
  }
  protected logBulkAct(ids: string[]) {
    this.retry(ids.map(Number));
  }
  private retry(ids: number[]) {
    let ok = 0;
    let bad = 0;
    this.store.syncLogs.update((l) =>
      l.map((x) => {
        if (!ids.includes(x.id) || x.status === 'Success') return x;
        const c = this.store.connectors().find((k) => k.name === x.connector);
        const fails = c?.status === 'Error' || c?.status === 'Not Connected';
        if (fails) bad++;
        else ok++;
        return { ...x, status: fails ? 'Failed' : 'Success', ms: x.ms + 40 };
      }),
    );
    this.msg(ok + bad === 0 ? 'Nothing to retry — selected calls already succeeded' : `${ok} call${ok === 1 ? '' : 's'} replayed${bad ? ` · ${bad} still failing (connector down)` : ''}`);
  }
  protected exportCsv() {
    downloadCsv('workflow-connectors.csv', [
      ['ID', 'Connector', 'Vendor', 'Category', 'Status', 'Auth', 'Endpoint', 'Calls 24h', 'Errors 24h', 'Last sync', 'Used by'],
      ...this.store.connectors().map((c) => [c.id, c.name, c.vendor, c.category, c.status, c.auth, c.endpoint, c.calls24h, c.errors24h, c.lastSync, this.usage(c).map((u) => u.name).join('; ')]),
    ]);
    this.msg('Exported workflow-connectors.csv');
  }
  protected msg(m: string) {
    toast(this.toastS, m);
  }
}
