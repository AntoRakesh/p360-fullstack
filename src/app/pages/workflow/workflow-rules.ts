// Automation Rules: trigger → condition → action rules, builder, test runs and execution history.
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { toast } from './workflow-pages-a';
import { WfToggle } from './workflow-shared';
import { ACTIONS, demoNow, fmtAgo, FIELDS, ME, MODULES, OPS, Rule, RuleAction, RuleCond, RuleExec, statusTagCls, TRIGGERS, WorkflowStore } from './workflow.data';

const H = 3600_000;
const RULE_MODULES = ['Workflow & Automation', ...MODULES];
const TABS = ['All', 'Enabled', 'Disabled', 'Failing'] as const;
const ACT_ICON: Record<string, string> = {
  'Auto-approve': 'workflow-check', 'Auto-reject': 'workflow-x', 'Route to approver': 'user-check', 'Start workflow': 'workflow-play', 'Send notification': 'bell', 'Send email': 'workflow-mail',
  'Create task': 'list-checks', 'Update record': 'workflow-db', 'Escalate to': 'arrow-up', 'Call webhook': 'workflow-link', 'Post to Teams channel': 'message', 'Add to report': 'file-chart',
};
const TARGETS: Record<string, string[]> = {
  'Route to approver': ['Direct Manager', 'Department Head', 'HR Department', 'Finance Team', 'Manager delegate'],
  'Escalate to': ['Department Head', 'HR Director', 'Site Manager'],
  'Send notification': ['Employee', 'Employee & Manager', 'Delegate', 'HSE + Site Managers'],
  'Send email': ['Employee', 'Approver + Department Head', 'Contract owner'],
  'Post to Teams channel': ['#hr-ops', '#new-joiners', '#site-alerts'],
  'Call webhook': ['ServiceNow incident', 'Generic Webhook', 'ADP Payroll'],
  'Create task': ['HR Ops queue', 'IT Service Desk', 'Facilities'],
  'Update record': ['Leave balance', 'Attendance record', 'Employee profile'],
};
const blankRule = (): Rule => ({ id: '', name: '', enabled: true, module: RULE_MODULES[0], trigger: TRIGGERS[0], match: 'All', conds: [{ field: FIELDS[0], op: 'equals', value: '' }], actions: [{ type: 'Send notification', target: 'Employee' }], runs: 0, success: 0, lastRun: 'Never', owner: ME });
/** A sample payload value that satisfies the condition, used to prefill test runs. */
function sampleFor(c: RuleCond) {
  const n = parseFloat(c.value);
  switch (c.op) {
    case 'greater than': return String(isNaN(n) ? 1 : n + (n >= 10 ? 6 : 1));
    case 'less than': return String(isNaN(n) ? 0 : Math.max(0, n - 1));
    case 'not equals': return c.value === 'Operations' ? 'Engineering' : 'Operations';
    case 'is any of': return c.value.split(',')[0].trim();
    case 'is true': return 'Yes';
    default: return c.value;
  }
}
function evalCond(c: RuleCond, v: string) {
  const a = v.trim().toLowerCase();
  const b = c.value.trim().toLowerCase();
  switch (c.op) {
    case 'equals': return a === b;
    case 'not equals': return a !== b;
    case 'greater than': return parseFloat(v) > parseFloat(c.value);
    case 'less than': return parseFloat(v) < parseFloat(c.value);
    case 'contains': return a.includes(b);
    case 'is any of': return b.split(',').map((x) => x.trim()).includes(a);
    case 'is true': return ['yes', 'true', '1', 'y'].includes(a);
    default: return false;
  }
}
const condText = (c: RuleCond) => `${c.field} ${c.op}${c.op === 'is true' ? '' : ' ' + (c.value || '…')}`;

@Component({
  selector: 'app-workflow-automation-rules',
  imports: [...UI, DataTable, WfToggle, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Automation Rules" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="If-this-then-that rules that react to HR events — auto-approve, route, escalate and notify without manual effort.">
      <button class="btn-primary" (click)="openBuilder(null)"><app-icon name="plus" [size]="16" />New Rule</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Automation Rules" [value]="store.rules().length" icon="workflow-bolt" color="#7c3aed" [sub]="enabledN() + ' enabled'" />
      <app-kpi label="Executions (24 h)" [value]="exec24().length" icon="activity" color="#3b82f6" change="12%" sub="vs. previous day" />
      <app-kpi label="Success Rate" [value]="successRate() + '%'" icon="shield-check" color="#22c55e" change="0.4%" sub="all runs" />
      <app-kpi label="Failures (24 h)" [value]="fail24()" icon="triangle-alert" color="#ef4444" [sub]="fail24() ? 'needs review' : 'all clear'" [subColor]="fail24() ? '#dc2626' : '#16a34a'" />
      <app-kpi label="Hours Saved" [value]="hoursSaved()" icon="workflow-timer" color="#0d9488" change="9%" sub="≈6 min per run" />
      <app-kpi label="Avg. Execution" [value]="avgMs() + ' ms'" icon="workflow-cloud" color="#f59e0b" sub="trigger → last action" />
    </section>

    <section class="rl">
      <div class="card list">
        <div class="lt">
          <nav class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}<span class="count">{{ tabCount(t) }}</span></button>}</nav>
          <div class="search-box sb"><app-icon name="search" [size]="15" /><input placeholder="Search rules, triggers, actions..." [value]="q()" (input)="q.set($any($event.target).value)" /></div>
          <select class="select" [value]="mod()" (change)="mod.set($any($event.target).value)"><option value="All">All modules</option>@for (m of modules; track m) {<option [value]="m">{{ m }}</option>}</select>
        </div>
        <ul class="rules">
          @for (r of rows(); track r.id) {
            <li [class.on]="sel()?.id === r.id" [class.off]="!r.enabled" (click)="selId.set(r.id)">
              <div class="r1">
                <app-wf-toggle [on]="r.enabled" (click)="$event.stopPropagation()" (changed)="toggle(r, $event)" />
                <div class="nm"><b>{{ r.name }}</b><small>{{ r.id }} · {{ r.module }} · {{ r.owner }}</small></div>
                <div class="rs"><b [class]="r.runs ? (r.success >= 98 ? 'g' : r.success >= 95 ? 'a' : 'rd') : ''">{{ r.runs ? r.success + '%' : '—' }}</b><small>{{ r.runs | number }} runs</small></div>
                <div class="menu-wrap" (click)="$event.stopPropagation()">
                  <button class="dots-b" (click)="menu.set(menu() === r.id ? null : r.id)"><app-icon name="more" [size]="16" /></button>
                  @if (menu() === r.id) {
                    <div class="dropdown right">
                      <button class="dd-item" (click)="menu.set(null); openBuilder(r)"><app-icon name="workflow-pencil" [size]="14" />Edit rule</button>
                      <button class="dd-item" (click)="menu.set(null); openTest(r)"><app-icon name="workflow-flask" [size]="14" />Test run</button>
                      <button class="dd-item" (click)="menu.set(null); duplicate(r)"><app-icon name="workflow-copy" [size]="14" />Duplicate</button>
                      <button class="dd-item danger" (click)="menu.set(null); delId.set(r.id)"><app-icon name="workflow-trash" [size]="14" />Delete</button>
                    </div>
                  }
                </div>
              </div>
              <div class="chain">
                <span class="ch when"><app-icon name="workflow-bolt" [size]="12" />{{ r.trigger }}</span>
                <app-icon name="chevron-right" [size]="12" class="arr" />
                <span class="ch if"><app-icon name="workflow-diamond" [size]="11" />{{ r.conds.length }} condition{{ r.conds.length === 1 ? '' : 's' }} · {{ r.match }}</span>
                <app-icon name="chevron-right" [size]="12" class="arr" />
                @for (a of r.actions; track $index) {<span class="ch then"><app-icon [name]="icon(a.type)" [size]="12" />{{ a.type }}</span>}
              </div>
              <small class="lr">Last run {{ r.lastRun }}</small>
            </li>
          } @empty {
            <li class="empty">No rules match these filters.</li>
          }
        </ul>
      </div>

      @if (sel(); as r) {
        <aside class="card detail">
          <div class="dh">
            <span class="logo"><app-icon name="workflow-bolt" [size]="20" /></span>
            <div><h3>{{ r.name }}</h3><small class="muted">{{ r.id }} · {{ r.module }}</small></div>
            <span [class]="r.enabled ? 'tag green' : 'tag grey'">{{ r.enabled ? 'Enabled' : 'Disabled' }}</span>
          </div>
          <div class="btns">
            <button class="btn-primary" (click)="openTest(r)"><app-icon name="workflow-flask" [size]="15" />Test run</button>
            <button class="btn-ghost" (click)="openBuilder(r)"><app-icon name="workflow-pencil" [size]="15" />Edit</button>
            <button class="btn-ghost" (click)="toggle(r, !r.enabled)"><app-icon [name]="r.enabled ? 'pause' : 'workflow-play'" [size]="14" />{{ r.enabled ? 'Disable' : 'Enable' }}</button>
            <button class="btn-ghost" (click)="duplicate(r)"><app-icon name="workflow-copy" [size]="15" /></button>
            <button class="btn-ghost danger" (click)="delId.set(r.id)"><app-icon name="workflow-trash" [size]="15" /></button>
          </div>

          <div class="logic">
            <div class="blk when"><em>WHEN</em><div><b>{{ r.trigger }}</b><small>Event from {{ r.module }}</small></div></div>
            <div class="blk if"><em>IF</em>
              <div>
                @for (c of r.conds; track $index) {
                  @if ($index) {<span class="join">{{ r.match === 'All' ? 'AND' : 'OR' }}</span>}
                  <span class="cond">{{ ct(c) }}</span>
                }
              </div>
            </div>
            <div class="blk then"><em>THEN</em>
              <ol>@for (a of r.actions; track $index) {<li><app-icon [name]="icon(a.type)" [size]="13" /><b>{{ a.type }}</b><span>→ {{ a.target }}</span></li>}</ol>
            </div>
          </div>

          <div class="stats">
            <div><b>{{ r.runs | number }}</b><small>Total runs</small></div>
            <div><b class="g">{{ r.runs ? r.success + '%' : '—' }}</b><small>Success</small></div>
            <div><b class="rd">{{ selFails() }}</b><small>Failed (recent)</small></div>
            <div><b>{{ selAvg() }} ms</b><small>Avg. duration</small></div>
          </div>
          <h4>Executions · last 48 h</h4>
          <app-column-chart [labels]="buckets" [series]="selSeries()" [stacked]="true" [height]="140" [legend]="false" />
          <h4>Recent executions <span class="muted">({{ selExecs().length }})</span></h4>
          <ul class="hist">
            @for (e of selExecs().slice(0, 7); track e.id) {
              <li><i [class]="e.result === 'Success' ? 'ok' : e.result === 'Failed' ? 'bad' : 'skip'"></i><div><b>{{ e.subject }}</b><small>{{ ago(e.at) }} · {{ e.ms }} ms@if (e.note) { · {{ e.note }}}</small></div>@if (e.test) {<span class="tag blue">Test</span>}<span [class]="resTag(e.result)">{{ e.result }}</span></li>
            } @empty {<li class="muted">No executions yet — run a test.</li>}
          </ul>
        </aside>
      }
    </section>

    <section class="bot">
      <div class="card">
        <div class="card-head"><h3>Execution History</h3><em class="chip live"><i></i>Live</em></div>
        <app-data-table [rows]="hist()" [columns]="histCols" [filters]="histFilters" [actions]="histActions" noun="executions" [pageSize]="8"
          [searchKeys]="['id', 'rule', 'subject']" searchPlaceholder="Search execution, rule, subject..." (rowClick)="selId.set($event.ruleId)" (action)="histAct($event.action, $event.row)" />
      </div>
      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Executions by Hour</h3><span class="muted sm">last 12 h</span></div>
          <app-column-chart [labels]="hours().labels" [series]="hours().series" [stacked]="true" [height]="170" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Top Rules by Volume</h3></div>
          <app-bar-list [rows]="top()" [max]="topMax()" />
        </div>
      </div>
    </section>

    <!-- Rule builder -->
    @if (draft(); as d) {
      <div class="g-overlay" (click)="draft.set(null)"></div>
      <form class="g-modal wide builder" (submit)="$event.preventDefault(); save(false)">
        <div class="modal-head"><h3>{{ d.id ? 'Edit rule · ' + d.id : 'New automation rule' }}</h3><button type="button" class="close-btn" (click)="draft.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Rule name *<input class="input" [value]="d.name" (input)="patch({ name: $any($event.target).value })" placeholder="e.g. Auto-approve short sick leave" /></label>
          <label>Module<select class="select" [value]="d.module" (change)="patch({ module: $any($event.target).value })">@for (m of modules; track m) {<option [value]="m">{{ m }}</option>}</select></label>
          <label>Owner<input class="input" [value]="d.owner" (input)="patch({ owner: $any($event.target).value })" /></label>
        </div>

        <div class="sec when"><em>WHEN</em><span>this event happens</span></div>
        <select class="select wide-sel" [value]="d.trigger" (change)="patch({ trigger: $any($event.target).value })">@for (t of triggers; track t) {<option [value]="t">{{ t }}</option>}</select>

        <div class="sec if"><em>IF</em><span>
          <select class="select mini" [value]="d.match" (change)="patch({ match: $any($event.target).value })"><option value="All">all</option><option value="Any">any</option></select>
          of these conditions are met</span></div>
        @for (c of d.conds; track $index; let i = $index) {
          <div class="row3">
            <select class="select" [value]="c.field" (change)="setCond(i, { field: $any($event.target).value })">@for (f of fields; track f) {<option [value]="f">{{ f }}</option>}</select>
            <select class="select" [value]="c.op" (change)="setCond(i, { op: $any($event.target).value })">@for (o of ops; track o) {<option [value]="o">{{ o }}</option>}</select>
            <input class="input" [value]="c.value" [disabled]="c.op === 'is true'" (input)="setCond(i, { value: $any($event.target).value })" [placeholder]="c.op === 'is any of' ? 'A, B, C' : 'Value'" />
            <button type="button" class="rm" [disabled]="d.conds.length === 1" (click)="rmCond(i)" title="Remove"><app-icon name="workflow-x" [size]="14" /></button>
          </div>
        }
        <button type="button" class="link add" (click)="addCond()">+ Add condition</button>

        <div class="sec then"><em>THEN</em><span>run these actions in order</span></div>
        @for (a of d.actions; track $index; let i = $index) {
          <div class="row2">
            <span class="n">{{ i + 1 }}</span>
            <select class="select" [value]="a.type" (change)="setAct(i, { type: $any($event.target).value, target: targetsFor($any($event.target).value)[0] })">@for (x of actionTypes; track x) {<option [value]="x">{{ x }}</option>}</select>
            <input class="input" [value]="a.target" (input)="setAct(i, { target: $any($event.target).value })" [attr.list]="'tg' + i" placeholder="Target" />
            <datalist [id]="'tg' + i">@for (t of targetsFor(a.type); track t) {<option [value]="t"></option>}</datalist>
            <button type="button" class="rm" [disabled]="d.actions.length === 1" (click)="rmAct(i)" title="Remove"><app-icon name="workflow-x" [size]="14" /></button>
          </div>
        }
        <button type="button" class="link add" (click)="addAct()">+ Add action</button>

        <div class="preview"><app-icon name="lightbulb" [size]="15" /><span>When <b>{{ d.trigger.toLowerCase() }}</b>, if {{ d.match === 'All' ? 'all' : 'any' }} of [{{ condsText(d) }}], then {{ actsText(d) }}.</span></div>
        <app-wf-toggle [on]="d.enabled" (changed)="patch({ enabled: $event })" label="Enable rule immediately after saving" />
        @if (err()) {<p class="errt">{{ err() }}</p>}
        <div class="form-actions">
          <button type="button" class="btn-ghost" (click)="draft.set(null)">Cancel</button>
          <button type="button" class="btn-ghost" (click)="save(true)"><app-icon name="workflow-flask" [size]="15" />Save &amp; test</button>
          <button class="btn-primary" type="submit">Save rule</button>
        </div>
      </form>
    }

    <!-- Test run -->
    @if (testRule(); as r) {
      <div class="g-overlay" (click)="closeTest()"></div>
      <div class="g-modal wide tester">
        <div class="modal-head"><div><h3>Test run · {{ r.name }}</h3><small class="muted">Simulates the trigger “{{ r.trigger }}” with a sample payload. Test runs don't count toward rule stats.</small></div><button class="close-btn" (click)="closeTest()">×</button></div>
        <div class="tgrid">
          <div>
            <h4>Sample payload</h4>
            <label class="pl">Subject<input class="input" [value]="tSubject()" (input)="tSubject.set($any($event.target).value)" /></label>
            @for (c of r.conds; track $index; let i = $index) {
              <label class="pl">{{ c.field }} <small class="muted">({{ c.op }}{{ c.op === 'is true' ? '' : ' ' + c.value }})</small>
                <input class="input" [value]="tVals()[i]" (input)="setTVal(i, $any($event.target).value)" />
              </label>
            }
            @if (startTarget(r)) {
              <label class="chk"><input type="checkbox" [checked]="tReal()" (change)="tReal.set(!tReal())" /> Really start a test instance of “{{ startTarget(r) }}”</label>
            }
            <button class="btn-primary run" [disabled]="tPhase() === 'running'" (click)="runTest(r)"><app-icon name="workflow-play" [size]="14" />{{ tPhase() === 'idle' ? 'Run test' : tPhase() === 'running' ? 'Running…' : 'Run again' }}</button>
          </div>
          <div class="trace">
            <h4>Trace</h4>
            @if (tPhase() === 'idle') {
              <p class="muted ph"><app-icon name="workflow-flask" [size]="26" /><br />Adjust the sample values and press <b>Run test</b>.</p>
            } @else {
              <div class="tr-step ok"><i>✓</i><div><b>Trigger received</b><small>{{ r.trigger }} · {{ tSubject() }}</small></div></div>
              @for (c of r.conds; track $index; let i = $index) {
                @let pass = condRes()[i];
                <div class="tr-step" [class.ok]="pass" [class.bad]="!pass"><i>{{ pass ? '✓' : '✕' }}</i><div><b>{{ ct(c) }}</b><small>sample = “{{ tVals()[i] }}”</small></div></div>
              }
              <div class="verdict" [class.ok]="matched()" [class.bad]="!matched()">{{ matched() ? 'Conditions matched (' + r.match + ') — executing actions' : 'Conditions not met — no actions run' }}</div>
              @if (matched()) {
                @for (a of r.actions; track $index; let i = $index) {
                  <div class="tr-step" [class.ok]="i < tDone()" [class.wait]="i === tDone() && tPhase() === 'running'" [class.pend]="i > tDone() || (i === tDone() && tPhase() !== 'running')">
                    <i>{{ i < tDone() ? '✓' : i === tDone() && tPhase() === 'running' ? '…' : '' }}</i>
                    <div><b>{{ a.type }} → {{ a.target }}</b><small>{{ i < tDone() ? (40 + ((i + 3) * 37) % 160) + ' ms · ' + (a.type === 'Start workflow' && tReal() ? 'instance created' : 'dry run, no side-effects') : 'queued' }}</small></div>
                  </div>
                }
              }
              @if (tPhase() === 'done') {<p class="sum">{{ tSummary() }}</p>}
            }
          </div>
        </div>
      </div>
    }

    @if (delRule(); as r) {
      <div class="g-overlay" (click)="delId.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Delete rule?</h3><button class="close-btn" (click)="delId.set(null)">×</button></div>
        <p>“{{ r.name }}” has run <b>{{ r.runs | number }}</b> times. Deleting it stops all future executions; history is kept for audit.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="delId.set(null)">Cancel</button><button class="btn-primary dangerb" (click)="remove(r)">Delete rule</button></div>
      </div>
    }
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .rl { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(400px, 1fr); gap: 12px; align-items: start; margin-bottom: 12px; }
    .lt { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; } .lt .tabs { margin: 0; }
    .sb { flex: 1 1 180px; } .lt .select { max-width: 210px; }
    .count { margin-left: 5px; font-size: 10.5px; padding: 0 6px; border-radius: 9px; background: #e4e6ef; }
    .rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 720px; overflow: auto; }
    .rules li { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 8px; background: #fff; }
    .rules li:hover { border-color: #c9bdf7; } .rules li.on { border-color: var(--primary); box-shadow: 0 0 0 3px #ede9fe; }
    .rules li.off .nm b, .rules li.off .chain { opacity: .55; }
    .r1 { display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center; }
    .nm { min-width: 0; display: flex; flex-direction: column; } .nm b { font-size: 13px; } .nm small, .rs small, .lr { font-size: 11px; color: var(--muted); }
    .nm small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rs { text-align: right; display: flex; flex-direction: column; } .rs b { font-size: 14px; }
    .g { color: #16a34a; } .a { color: #d97706; } .rd { color: #dc2626; }
    .dots-b { border: 0; background: none; cursor: pointer; padding: 4px; border-radius: 6px; color: #4b4f6b; } .dots-b:hover { background: #f3f3f8; }
    .dropdown.right { right: 0; left: auto; min-width: 160px; } .dd-item { display: flex; gap: 8px; align-items: center; } .dd-item.danger { color: var(--red); }
    .chain { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
    .ch { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 8px; border-radius: 6px; border: 1px solid; }
    .ch.when { background: #f5f3ff; border-color: #ddd6fe; color: #6d28d9; } .ch.if { background: #fffbeb; border-color: #fde68a; color: #92400e; } .ch.then { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
    .arr { color: #a3a7c2; } .lr { margin-top: -2px; }
    .empty { justify-content: center; align-items: center; color: var(--muted); cursor: default !important; padding: 30px !important; }
    .detail { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; display: flex; flex-direction: column; gap: 8px; }
    .dh { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center; } .dh h3 { font-size: 15.5px; }
    .logo { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: #f3efff; color: var(--primary); }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    .logic { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .blk { display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: start; padding: 10px; border-radius: 9px; border: 1px solid; font-size: 12.5px; }
    .blk em { font-style: normal; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; padding: 3px 0; border-radius: 5px; text-align: center; color: #fff; }
    .blk small { display: block; color: var(--muted); font-size: 11px; }
    .blk.when { background: #faf8ff; border-color: #ddd6fe; } .blk.when em { background: #7c3aed; }
    .blk.if { background: #fffdf5; border-color: #fde68a; } .blk.if em { background: #d97706; }
    .blk.then { background: #f6fef9; border-color: #a7f3d0; } .blk.then em { background: #059669; }
    .cond { display: inline-block; padding: 2px 8px; border-radius: 5px; background: #fff; border: 1px solid #fde68a; margin: 2px 0; }
    .join { display: inline-block; font-size: 10px; font-weight: 700; color: #b45309; margin: 0 6px; }
    .blk ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
    .blk li { display: flex; align-items: center; gap: 6px; } .blk li app-icon { color: #059669; } .blk li span { color: #4b4f6b; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .stats div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; } .stats b { font-size: 16px; } .stats small { font-size: 11px; color: var(--muted); }
    h4 { margin: 6px 0 2px; font-size: 13px; } h4 .muted { font-weight: 400; }
    .hist { list-style: none; margin: 0; padding: 0; }
    .hist li { display: grid; grid-template-columns: 10px 1fr auto auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; }
    .hist li > div { min-width: 0; } .hist b { font-weight: 500; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .hist small { color: var(--muted); font-size: 11px; }
    .hist i { width: 8px; height: 8px; border-radius: 50%; } .hist i.ok { background: #22c55e; } .hist i.bad { background: #ef4444; } .hist i.skip { background: #a3a7c2; }
    .bot { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 12px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 12px; } .sm { font-size: 12px; }
    .builder .sec { display: flex; align-items: center; gap: 10px; margin: 16px 0 8px; font-size: 12.5px; color: #3b3f5c; }
    .sec em { font-style: normal; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; padding: 3px 10px; border-radius: 5px; color: #fff; }
    .sec.when em { background: #7c3aed; } .sec.if em { background: #d97706; } .sec.then em { background: #059669; }
    .select.mini { padding: 3px 24px 3px 8px; margin: 0 4px; min-width: 64px; } .wide-sel { width: 100%; }
    .row3 { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr 32px; gap: 8px; margin-bottom: 6px; }
    .row2 { display: grid; grid-template-columns: 22px 1fr 1.4fr 32px; gap: 8px; margin-bottom: 6px; align-items: center; }
    .row2 .n { width: 22px; height: 22px; border-radius: 50%; background: #d1fae5; color: #047857; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
    .rm { border: 1px solid var(--border); background: #fff; border-radius: 7px; cursor: pointer; color: #6b7090; display: grid; place-items: center; } .rm:disabled { opacity: .4; cursor: default; }
    .add { border: 0; background: none; cursor: pointer; padding: 2px 0; font-size: 12.5px; }
    .preview { display: flex; gap: 8px; align-items: flex-start; margin: 16px 0 12px; padding: 10px 12px; border-radius: 8px; background: #f5f3ff; color: #4c1d95; font-size: 12.5px; }
    .errt { color: var(--red); font-size: 12.5px; } .dangerb { background: var(--red) !important; border-color: var(--red) !important; }
    .tgrid { display: grid; grid-template-columns: 300px 1fr; gap: 18px; }
    .pl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #3b3f5c; margin-bottom: 8px; }
    .chk { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; margin: 6px 0; }
    .run { margin-top: 6px; width: 100%; justify-content: center; }
    .trace { border-left: 1px solid var(--border); padding-left: 18px; min-height: 260px; }
    .ph { text-align: center; padding-top: 50px; }
    .tr-step { display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: start; padding: 6px 0; font-size: 12.5px; }
    .tr-step i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 700; background: #eef0f5; color: #6b7090; }
    .tr-step.ok i { background: #22c55e; color: #fff; } .tr-step.bad i { background: #ef4444; color: #fff; } .tr-step.wait i { background: #3b82f6; color: #fff; animation: pulse 1s infinite; }
    .tr-step.pend { opacity: .5; } .tr-step small { display: block; color: var(--muted); font-size: 11px; }
    @keyframes pulse { 50% { box-shadow: 0 0 0 5px #bfdbfe; } }
    .verdict { margin: 6px 0; padding: 7px 10px; border-radius: 7px; font-size: 12.5px; font-weight: 600; }
    .verdict.ok { background: #dcfce7; color: #15803d; } .verdict.bad { background: #fee2e2; color: #b91c1c; }
    .sum { margin-top: 10px; font-size: 12.5px; color: #3b3f5c; }
    @media (max-width: 1250px) { .rl, .bot { grid-template-columns: 1fr; } .detail { position: static; max-height: none; } }
  `,
})
export class AutomationRules {
  protected readonly store = inject(WorkflowStore);
  protected readonly tabs = TABS;
  protected readonly modules = RULE_MODULES;
  protected readonly triggers = TRIGGERS;
  protected readonly fields = FIELDS;
  protected readonly ops = OPS;
  protected readonly actionTypes = ACTIONS;
  protected readonly ct = condText;
  protected readonly ago = fmtAgo;
  protected readonly buckets = ['-48h', '-42h', '-36h', '-30h', '-24h', '-18h', '-12h', '-6h'];
  protected readonly tab = signal<(typeof TABS)[number]>('All');
  protected readonly q = signal('');
  protected readonly mod = signal('All');
  protected readonly selId = signal<string | null>('R-101');
  protected readonly menu = signal<string | null>(null);
  protected readonly delId = signal<string | null>(null);
  protected readonly draft = signal<Rule | null>(null);
  protected readonly err = signal('');
  protected readonly toastS = signal<string | null>(null);
  // test run state
  protected readonly testId = signal<string | null>(null);
  protected readonly tVals = signal<string[]>([]);
  protected readonly tSubject = signal('');
  protected readonly tReal = signal(false);
  protected readonly tPhase = signal<'idle' | 'running' | 'done'>('idle');
  protected readonly tDone = signal(0);
  protected readonly tSummary = signal('');
  private tTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly enabledN = computed(() => this.store.rules().filter((r) => r.enabled).length);
  protected readonly exec24 = computed(() => {
    const since = demoNow() - 24 * H;
    return this.store.ruleExecs().filter((e) => !e.test && e.at >= since);
  });
  protected readonly fail24 = computed(() => this.exec24().filter((e) => e.result === 'Failed').length);
  protected readonly successRate = computed(() => {
    const rs = this.store.rules().filter((r) => r.runs);
    const tot = rs.reduce((a, r) => a + r.runs, 0);
    return tot ? Math.round((rs.reduce((a, r) => a + r.runs * r.success, 0) / tot) * 10) / 10 : 0;
  });
  protected readonly hoursSaved = computed(() => `${Math.round((this.store.rules().reduce((a, r) => a + r.runs, 0) * 6) / 60).toLocaleString()} h`);
  protected readonly avgMs = computed(() => {
    const l = this.store.ruleExecs().slice(0, 100);
    return l.length ? Math.round(l.reduce((a, e) => a + e.ms, 0) / l.length) : 0;
  });

  private readonly failing = (r: Rule) => r.runs > 0 && r.success < 98;
  protected tabCount(t: string) {
    const rs = this.store.rules();
    return t === 'All' ? rs.length : t === 'Enabled' ? rs.filter((r) => r.enabled).length : t === 'Disabled' ? rs.filter((r) => !r.enabled).length : rs.filter(this.failing).length;
  }
  protected readonly rows = computed(() => {
    const q = this.q().toLowerCase();
    const t = this.tab();
    return this.store.rules().filter(
      (r) =>
        (t === 'All' || (t === 'Enabled' && r.enabled) || (t === 'Disabled' && !r.enabled) || (t === 'Failing' && this.failing(r))) &&
        (this.mod() === 'All' || r.module === this.mod()) &&
        (!q || `${r.id} ${r.name} ${r.trigger} ${r.actions.map((a) => a.type + ' ' + a.target).join(' ')}`.toLowerCase().includes(q)),
    );
  });
  protected readonly sel = computed(() => this.store.rules().find((r) => r.id === this.selId()) ?? this.rows()[0] ?? null);
  protected readonly selExecs = computed(() => {
    const id = this.sel()?.id;
    return this.store.ruleExecs().filter((e) => e.ruleId === id);
  });
  protected readonly selFails = computed(() => this.selExecs().filter((e) => e.result === 'Failed' && !e.test).length);
  protected readonly selAvg = computed(() => {
    const l = this.selExecs();
    return l.length ? Math.round(l.reduce((a, e) => a + e.ms, 0) / l.length) : 0;
  });
  protected readonly selSeries = computed(() => {
    const now = demoNow();
    const ok = Array(8).fill(0);
    const bad = Array(8).fill(0);
    this.selExecs().forEach((e) => {
      const k = 7 - Math.floor((now - e.at) / (6 * H));
      if (k >= 0 && k < 8) (e.result === 'Failed' ? bad : ok)[k]++;
    });
    return [{ name: 'Success', color: '#22c55e', values: ok }, { name: 'Failed', color: '#ef4444', values: bad }];
  });
  protected readonly hours = computed(() => {
    const now = demoNow();
    const ok = Array(12).fill(0);
    const bad = Array(12).fill(0);
    this.store.ruleExecs().forEach((e) => {
      const k = 11 - Math.floor((now - e.at) / H);
      if (k >= 0 && k < 12 && !e.test) (e.result === 'Failed' ? bad : ok)[k]++;
    });
    const labels = Array.from({ length: 12 }, (_, i) => new Date(now - (11 - i) * H).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', ''));
    return { labels, series: [{ name: 'Success', color: '#7c3aed', values: ok }, { name: 'Failed', color: '#ef4444', values: bad }] };
  });
  protected readonly top = computed(() =>
    [...this.store.rules()].sort((a, b) => b.runs - a.runs).slice(0, 6).map((r, i) => ({ label: r.name, value: r.runs, display: r.runs.toLocaleString(), color: i % 2 ? '#3b82f6' : '#7c3aed' })),
  );
  protected readonly topMax = computed(() => Math.max(1, ...this.top().map((t) => t.value)));

  protected readonly histCols: Col[] = [
    { key: 'id', label: 'Execution' },
    { key: 'when', label: 'Time' },
    { key: 'rule', label: 'Rule' },
    { key: 'subject', label: 'Subject' },
    { key: 'result', label: 'Result', kind: 'tag', tag: (r) => (r.result === 'Success' ? 'tag green' : r.result === 'Failed' ? 'tag red' : 'tag grey') },
    { key: 'kind', label: 'Type', kind: 'tag', tag: (r) => (r.test ? 'tag blue' : 'tag grey') },
    { key: 'ms', label: 'Duration (ms)', kind: 'num' },
    { key: 'detail', label: 'Detail' },
  ];
  protected readonly histFilters = [
    { key: 'result', label: 'Result', options: ['Success', 'Failed', 'No match'] },
    { key: 'kind', label: 'Type', options: ['Live', 'Test'] },
  ];
  protected readonly histActions: RowAction[] = [
    { id: 'rule', label: 'Open rule', icon: 'eye' },
    { id: 'retry', label: 'Re-run', icon: 'refresh', when: (r) => r.result === 'Failed' },
  ];
  protected readonly hist = computed(() =>
    this.store.ruleExecs().map((e) => ({ ...e, when: fmtAgo(e.at), kind: e.test ? 'Test' : 'Live', detail: e.note ?? `${e.actions} action${e.actions === 1 ? '' : 's'} run` })),
  );

  protected icon(t: string) {
    return ACT_ICON[t] ?? 'workflow-bolt';
  }
  protected resTag(r: string) {
    return statusTagCls(r === 'No match' ? 'Draft' : r);
  }
  protected targetsFor(t: string) {
    if (t === 'Start workflow') return this.store.workflows().filter((w) => w.status === 'Active').map((w) => w.name.replace(' Workflow', ''));
    return TARGETS[t] ?? ['Leave request', 'Requester', 'System'];
  }
  protected condsText(d: Rule) {
    return d.conds.map(condText).join(d.match === 'All' ? ' AND ' : ' OR ');
  }
  protected actsText(d: Rule) {
    return d.actions.map((a) => `${a.type.toLowerCase()} → ${a.target || '…'}`).join(', then ');
  }

  protected toggle(r: Rule, on: boolean) {
    this.store.patchRule(r.id, { enabled: on });
    this.msg(`${r.name} ${on ? 'enabled' : 'disabled'}`);
  }
  protected duplicate(r: Rule) {
    const id = this.nextId();
    this.store.rules.update((l) => [...l, { ...r, id, name: r.name + ' (Copy)', enabled: false, runs: 0, success: 0, lastRun: 'Never', conds: r.conds.map((c) => ({ ...c })), actions: r.actions.map((a) => ({ ...a })) }]);
    this.selId.set(id);
    this.msg(`Duplicated as ${id} (disabled)`);
  }
  protected readonly delRule = computed(() => this.store.rules().find((r) => r.id === this.delId()) ?? null);
  protected remove(r: Rule) {
    this.store.rules.update((l) => l.filter((x) => x.id !== r.id));
    this.delId.set(null);
    if (this.selId() === r.id) this.selId.set(null);
    this.msg(`${r.name} deleted`);
  }
  private nextId() {
    return `R-${Math.max(100, ...this.store.rules().map((r) => +r.id.slice(2))) + 1}`;
  }

  // ---- builder ----
  protected openBuilder(r: Rule | null) {
    this.err.set('');
    this.draft.set(r ? { ...r, conds: r.conds.map((c) => ({ ...c })), actions: r.actions.map((a) => ({ ...a })) } : blankRule());
  }
  protected patch(p: Partial<Rule>) {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }
  protected setCond(i: number, p: Partial<RuleCond>) {
    this.draft.update((d) => d && { ...d, conds: d.conds.map((c, k) => (k === i ? { ...c, ...p, value: p.op === 'is true' ? 'Yes' : (p.value ?? c.value) } : c)) });
  }
  protected addCond() {
    this.draft.update((d) => d && { ...d, conds: [...d.conds, { field: FIELDS[1], op: 'greater than', value: '' }] });
  }
  protected rmCond(i: number) {
    this.draft.update((d) => d && { ...d, conds: d.conds.filter((_, k) => k !== i) });
  }
  protected setAct(i: number, p: Partial<RuleAction>) {
    this.draft.update((d) => d && { ...d, actions: d.actions.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  }
  protected addAct() {
    this.draft.update((d) => d && { ...d, actions: [...d.actions, { type: 'Send email', target: 'Employee' }] });
  }
  protected rmAct(i: number) {
    this.draft.update((d) => d && { ...d, actions: d.actions.filter((_, k) => k !== i) });
  }
  protected save(andTest: boolean) {
    const d = this.draft()!;
    if (!d.name.trim()) return this.err.set('Give the rule a name.');
    if (d.conds.some((c) => c.op !== 'is true' && !c.value.trim())) return this.err.set('Every condition needs a value.');
    if (d.actions.some((a) => !a.target.trim())) return this.err.set('Every action needs a target.');
    let rule: Rule;
    if (d.id) {
      rule = { ...d, name: d.name.trim() };
      this.store.rules.update((l) => l.map((r) => (r.id === d.id ? rule : r)));
      this.msg(`${rule.id} saved`);
    } else {
      rule = { ...d, id: this.nextId(), name: d.name.trim() };
      this.store.rules.update((l) => [...l, rule]);
      this.tab.set('All');
      this.msg(`${rule.id} created${rule.enabled ? ' and live' : ' (disabled)'}`);
    }
    this.selId.set(rule.id);
    this.draft.set(null);
    if (andTest) this.openTest(rule);
  }

  // ---- test run ----
  protected readonly testRule = computed(() => this.store.rules().find((r) => r.id === this.testId()) ?? null);
  protected openTest(r: Rule) {
    clearTimeout(this.tTimer);
    this.testId.set(r.id);
    this.tVals.set(r.conds.map(sampleFor));
    this.tSubject.set(`Sample event ${new Date(demoNow()).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
    this.tReal.set(false);
    this.tPhase.set('idle');
    this.tDone.set(0);
  }
  protected closeTest() {
    clearTimeout(this.tTimer);
    this.testId.set(null);
  }
  protected setTVal(i: number, v: string) {
    this.tVals.update((l) => l.map((x, k) => (k === i ? v : x)));
    if (this.tPhase() === 'done') this.tPhase.set('idle');
  }
  protected readonly condRes = computed(() => {
    const r = this.testRule();
    return r ? r.conds.map((c, i) => evalCond(c, this.tVals()[i] ?? '')) : [];
  });
  protected readonly matched = computed(() => {
    const r = this.testRule();
    const res = this.condRes();
    return !!r && (r.match === 'All' ? res.every(Boolean) : res.some(Boolean));
  });
  protected startTarget(r: Rule) {
    const a = r.actions.find((x) => x.type === 'Start workflow');
    if (!a) return null;
    const wf = this.store.workflows().find((w) => w.name.replace(' Workflow', '').toLowerCase() === a.target.toLowerCase());
    return wf ? a.target : null;
  }
  protected runTest(r: Rule) {
    clearTimeout(this.tTimer);
    this.tDone.set(0);
    if (!this.matched()) {
      this.tPhase.set('done');
      this.store.runRule(r.id, true, this.tSubject(), true, false, 'Conditions not met');
      this.tSummary.set('Rule would not fire for this payload. Execution logged as “No match”.');
      return;
    }
    this.tPhase.set('running');
    const step = () => {
      if (this.tDone() >= r.actions.length) {
        this.tPhase.set('done');
        let extra = '';
        const target = this.tReal() ? this.startTarget(r) : null;
        if (target) {
          const wf = this.store.workflows().find((w) => w.name.replace(' Workflow', '').toLowerCase() === target.toLowerCase())!;
          const inst = this.store.addInstance(wf, 'Test Runner', { test: true, summary: `Rule test · ${r.id}` });
          extra = ` Instance ${inst.id} created — see Workflow Instances.`;
        }
        const ex = this.store.runRule(r.id, true, this.tSubject(), true, true, target ? 'Test instance created' : 'Dry run');
        this.tSummary.set(`All ${r.actions.length} actions passed in ${ex?.ms ?? 0} ms.${extra}`);
        return;
      }
      this.tTimer = setTimeout(() => {
        this.tDone.update((n) => n + 1);
        step();
      }, 550);
    };
    step();
  }

  protected histAct(a: string, row: RuleExec) {
    this.selId.set(row.ruleId);
    if (a === 'retry') {
      const ex = this.store.runRule(row.ruleId, false, row.subject, true, true, `Re-run of ${row.id}`);
      this.msg(`${row.id} re-run → ${ex?.id} succeeded`);
    }
  }
  protected exportCsv() {
    downloadCsv('automation-rules.csv', [
      ['ID', 'Name', 'Enabled', 'Module', 'Trigger', 'Match', 'Conditions', 'Actions', 'Runs', 'Success %', 'Last run', 'Owner'],
      ...this.store.rules().map((r) => [r.id, r.name, r.enabled ? 'Yes' : 'No', r.module, r.trigger, r.match, r.conds.map(condText).join('; '), r.actions.map((a) => `${a.type} → ${a.target}`).join('; '), r.runs, r.success, r.lastRun, r.owner]),
    ]);
    this.msg('Exported automation-rules.csv');
  }
  protected msg(m: string) {
    toast(this.toastS, m);
  }
}
