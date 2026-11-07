import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv, NAMES } from '../dashboards/demo-data';
import { WfInstanceDrawer, WfToggle } from './workflow-shared';
import {
  APPROVER_TYPES, CATEGORIES, CONNECTOR_NAMES, currentStep, fmtDT, instStatus, makeNode, MODULES, NODE_META, NodeType, PALETTE, Side, statusTagCls, STEP_KIND,
  StepCfg, TEMPLATES, TRIGGERS, WfEdge, WfNode, Workflow, WorkflowStore,
} from './workflow.data';

interface Pt { x: number; y: number }
interface Issue { nodeId?: string; msg: string; level: 'error' | 'warning' }
type CfgForm = StepCfg & { name: string };

const STEP_TABS = ['General', 'Assignment', 'Conditions', 'Notifications', 'Advanced'] as const;
const PROP_TABS = ['General', 'Settings', 'Permissions', 'Integrations'] as const;
const ZOOMS = [50, 75, 100, 125, 150];
const ROLES = ['Employee', 'Line Manager', 'HR Business Partner', 'HR Administrator', 'Workflow Admin', 'Auditor'];
const SWATCHES = ['#3b82f6', '#8b5cf6', '#7c3aed', '#22c55e', '#10b981', '#f59e0b', '#ef4444', '#475569'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

@Component({
  selector: 'app-workflow-workflow-designer',
  imports: [...UI, WfToggle, WfInstanceDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:pointermove)': 'onMove($event)', '(window:pointerup)': 'onUp($event)', '(window:keydown)': 'onKey($event)', '(document:click)': 'closeMenus($event)' },
  template: `
    <app-page-head title="Workflow Designer" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="Create and automate people-related processes with multi-step approvals, conditions and integrations.">
      <button class="btn-primary hb" (click)="openNew()"><app-icon name="plus" [size]="17" [stroke]="2.4" />New Workflow</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb" (click)="menu.set(menu() === 'tpl' ? '' : 'tpl'); $event.stopPropagation()"><app-icon name="workflow-template" [size]="16" />Templates<app-icon name="chevron-down" [size]="14" /></button>
        @if (menu() === 'tpl') {
          <div class="dropdown tpl" (click)="$event.stopPropagation()">
            <div class="dd-h">Start from a template</div>
            @for (t of templates; track t.id) {<button class="dd-item" (click)="useTemplate(t.id)"><app-icon name="workflow" [size]="15" /><span><b>{{ t.name }}</b><small>{{ t.desc }}</small></span></button>}
          </div>
        }
      </div>
      <button class="btn-ghost hb" (click)="saveDraft()"><app-icon name="workflow-save" [size]="16" />Save Draft</button>
      <button class="btn-primary hb pub" (click)="publish()">Publish</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb dots-b" (click)="menu.set(menu() === 'more' ? '' : 'more'); $event.stopPropagation()" aria-label="More">⋮</button>
        @if (menu() === 'more') {
          <div class="dropdown" (click)="$event.stopPropagation()">
            <button class="dd-item" (click)="validate(true); menu.set('')"><app-icon name="workflow-check" [size]="15" />Validate workflow</button>
            <button class="dd-item" (click)="duplicateWf()"><app-icon name="workflow-copy" [size]="15" />Duplicate workflow</button>
            <button class="dd-item" (click)="exportJson()"><app-icon name="download" [size]="15" />Export definition (JSON)</button>
            <button class="dd-item" (click)="exportSteps()"><app-icon name="download" [size]="15" />Export steps (CSV)</button>
            <button class="dd-item" (click)="go('workflow-list')"><app-icon name="list-checks" [size]="15" />All workflows</button>
            <button class="dd-item danger" (click)="resetDemo()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <!-- ============ Designer card ============ -->
    <section class="card designer" [class.fs]="fullscreen()">
      <div class="d-top">
        <span class="wf-ic"><app-icon name="workflow-form" [size]="22" /></span>
        <div class="d-title">
          <div class="t-row">
            @if (editingName()) {
              <input class="input name-in" [value]="wf().name" (keydown.enter)="rename($any($event.target).value)" (blur)="rename($any($event.target).value)" autofocus />
            } @else {
              <h2>{{ wf().name }}</h2>
            }
            <span class="st-chip" [class]="'st-chip ' + wf().status.toLowerCase()">{{ wf().status === 'Active' ? 'Published' : wf().status }}</span>
            <button class="ib" (click)="editingName.set(true)" title="Rename"><app-icon name="workflow-pencil" [size]="17" /></button>
            @if (dirty()) {<span class="unsaved">● Unsaved changes</span>}
          </div>
          <p>{{ wf().description || 'No description yet.' }}</p>
        </div>
        <div class="tb">
          <div class="grp">
            <button class="tbb" [disabled]="!undoN()" (click)="undo()" title="Undo (Ctrl+Z)"><app-icon name="workflow-undo" [size]="17" /></button>
            <button class="tbb" [disabled]="!redoN()" (click)="redo()" title="Redo (Ctrl+Y)"><app-icon name="workflow-redo" [size]="17" /></button>
          </div>
          <div class="grp">
            <button class="tbb" (click)="zoomBy(-0.1)" title="Zoom out"><app-icon name="workflow-zoom-out" [size]="17" /></button>
            <div class="menu-wrap">
              <button class="tbb zv" (click)="menu.set(menu() === 'zoom' ? '' : 'zoom'); $event.stopPropagation()">{{ zoomPct() }}%<app-icon name="chevron-down" [size]="14" /></button>
              @if (menu() === 'zoom') {
                <div class="dropdown zd" (click)="$event.stopPropagation()">
                  @for (z of zooms; track z) {<button class="dd-item" (click)="setZoom(z / 100)">{{ z }}%</button>}
                  <button class="dd-item" (click)="fit()">Fit to screen</button>
                </div>
              }
            </div>
            <button class="tbb" (click)="zoomBy(0.1)" title="Zoom in"><app-icon name="plus" [size]="18" /></button>
          </div>
          <div class="grp menu-wrap">
            <button class="tbb" (click)="menu.set(menu() === 'add' ? '' : 'add'); $event.stopPropagation()" title="Add step"><app-icon name="plus" [size]="18" /></button>
            @if (menu() === 'add') {
              <div class="dropdown" (click)="$event.stopPropagation()">
                <div class="dd-h">Add after selected step</div>
                @for (t of palette; track t) {<button class="dd-item" (click)="addNode(t); menu.set('')"><span class="pi sm" [style.background]="meta[t].color"><app-icon [name]="meta[t].icon" [size]="11" [stroke]="2.4" /></span>{{ meta[t].label }}</button>}
              </div>
            }
          </div>
          <div class="grp"><button class="tbb" (click)="toggleFs()" [title]="fullscreen() ? 'Exit full screen' : 'Full screen'"><app-icon [name]="fullscreen() ? 'panel-close' : 'maximize'" [size]="16" /></button></div>
          @if (run()?.running) {
            <button class="test stop" (click)="stopRun()"><app-icon name="workflow-stop" [size]="16" />Stop Test</button>
          } @else {
            <button class="test" (click)="openTest()"><app-icon name="workflow-play" [size]="18" />Test Workflow</button>
          }
        </div>
      </div>

      <div class="d-body">
        <aside class="palette">
          <h4>Drag &amp; Drop Elements</h4>
          @for (g of groups; track g.name) {
            <div class="pg-h">{{ g.name }}</div>
            <div class="pg">
              @for (t of g.types; track t) {
                <button class="pal" draggable="true" (dragstart)="dragStart($event, t)" (click)="addNode(t)" [title]="'Click to add after the selected step, or drag onto the canvas'">
                  <span class="pi" [style.background]="meta[t].color"><app-icon [name]="meta[t].icon" [size]="13" [stroke]="2.3" /></span>{{ meta[t].label }}
                </button>
              }
            </div>
          }
          <p class="hint">Click to add after the selected step, or drag onto the canvas. Drag the ● handle on a step to connect it.</p>
        </aside>

        <div #canvas class="canvas" [class.panning]="!!pan0" (pointerdown)="bgDown($event)" (dragover)="$event.preventDefault()" (drop)="onDrop($event)" (wheel)="onWheel($event)">
          <div class="world" [style.transform]="'translate(' + panX() + 'px,' + panY() + 'px) scale(' + zoom() + ')'" [style.width.px]="world().w" [style.height.px]="world().h">
            <svg class="edges" [attr.width]="world().w" [attr.height]="world().h">
              <defs>
                @for (m of markers; track m.id) {
                  <marker [attr.id]="m.id" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" [attr.fill]="m.c" /></marker>
                }
              </defs>
              @for (e of edgeViews(); track e.id) {
                <g class="edge" [class.sel]="selEdge() === e.id" (pointerdown)="edgeDown($event, e.id)">
                  <path class="hit" [attr.d]="e.d" />
                  <path class="ln" [class.flow]="e.active" [attr.d]="e.d" [attr.stroke]="e.stroke" [attr.marker-end]="'url(#' + e.marker + ')'" />
                  @if (e.label) {
                    <text [attr.x]="e.lx" [attr.y]="e.ly" [attr.text-anchor]="e.anchor" [class.red]="e.red" class="el">{{ e.label }}</text>
                  }
                </g>
              }
              @if (link(); as l) {<path class="ln temp" [attr.d]="'M' + l.x1 + ' ' + l.y1 + ' L' + l.x2 + ' ' + l.y2" marker-end="url(#mk-sel)" />}
              @if (token(); as t) {<circle class="token" [attr.cx]="t.x" [attr.cy]="t.y" r="6.5" />}
            </svg>

            @for (n of nodes(); track n.id) {
              <div class="node" [class]="'node k-' + n.type" [attr.data-node]="n.id" [class.sel]="selId() === n.id" [class.bad]="badIds().has(n.id)" [class.solid]="n.type === 'notification' && n.color === '#ef4444'"
                [class.active]="run()?.active === n.id" [class.done]="run()?.done?.includes(n.id) && run()?.active !== n.id"
                [style.left.px]="n.x" [style.top.px]="n.y" [style.width.px]="n.w" [style.height.px]="n.h" [style.--c]="n.color" (pointerdown)="nodeDown($event, n)">
                @if (n.type === 'start') {
                  <span class="circ start"><app-icon name="workflow-play" [size]="24" /></span>
                  <div class="cap below"><b>{{ n.title }}</b><small>{{ n.sub }}</small></div>
                } @else if (n.type === 'end') {
                  <span class="circ end"><i></i></span>
                  <div class="cap right"><b>{{ n.title }}</b><small>{{ n.sub }}</small></div>
                } @else if (n.type === 'condition') {
                  <svg class="dia" viewBox="0 0 64 64"><path d="M32 2 62 32 32 62 2 32z" /></svg>
                  <span class="dt">{{ n.title }}</span>
                } @else {
                  <span class="ni"><app-icon [name]="nodeIcon(n)" [size]="n.type === 'notification' && n.color === '#ef4444' ? 17 : 22" [stroke]="2" /></span>
                  <div class="nt"><b>{{ n.title }}</b><small>{{ n.sub }}</small></div>
                }
                @if (n.type !== 'end' && !run()?.running) {<span class="port" (pointerdown)="portDown($event, n)" title="Drag to connect"></span>}
                @if (selId() === n.id && !run()?.running) {
                  <div class="ntb" (pointerdown)="$event.stopPropagation()">
                    <button (click)="dupNode(n)" title="Duplicate"><app-icon name="workflow-copy" [size]="13" /></button>
                    <button (click)="deleteNode(n.id)" title="Delete (Del)"><app-icon name="workflow-trash" [size]="13" /></button>
                  </div>
                }
                @if (run()?.done?.includes(n.id) && run()?.active !== n.id) {<span class="okb">✓</span>}
                @if (badIds().has(n.id)) {<span class="badb">!</span>}
              </div>
            }
          </div>

          <!-- validation chip & panel -->
          <button class="vchip" [class.okc]="issues() !== null && !issues()!.length" [class.errc]="!!issues()?.length" (pointerdown)="$event.stopPropagation()" (click)="validate(true)">
            @if (issues() === null) {<app-icon name="workflow-check" [size]="13" />Validate}
            @else if (!issues()!.length) {<app-icon name="workflow-check" [size]="13" />Valid workflow}
            @else {<app-icon name="triangle-alert" [size]="13" />{{ issues()!.length }} issue{{ issues()!.length > 1 ? 's' : '' }}}
          </button>
          @if (showIssues() && issues(); as list) {
            <div class="vpanel" (pointerdown)="$event.stopPropagation()">
              <div class="vh"><b>Validation</b><button class="close-btn" (click)="showIssues.set(false)">×</button></div>
              @if (!list.length) {<p class="okt"><app-icon name="workflow-check" [size]="15" />All {{ nodes().length }} steps are connected, assigned and reachable. Ready to publish.</p>}
              @for (i of list; track $index) {
                <button class="vi" (click)="i.nodeId && select(i.nodeId)"><span [class]="i.level === 'error' ? 'tag red' : 'tag amber'">{{ i.level }}</span>{{ i.msg }}</button>
              }
            </div>
          }
        </div>
      </div>
      @if (run(); as r) {
        <div class="runbar">
          <span class="rb-h" [class.live]="r.running"><app-icon [name]="r.running ? 'workflow-play' : 'workflow-check'" [size]="14" />{{ r.running ? 'Test run in progress' : r.outcome }}</span>
          <ol>@for (l of r.log; track $index) {<li [class.last]="$last && r.running" [title]="l.text"><span>{{ l.t }}</span>{{ l.text }}</li>}</ol>
          @if (!r.running) {<button class="btn-ghost sm" (click)="go('workflow-instances')">View instance</button><button class="close-btn" (click)="run.set(null)">×</button>}
        </div>
      }
    </section>

    <!-- ============ Bottom row ============ -->
    <section class="bottom">
      <div class="col1">
        <div class="card steps-card">
          <div class="ch"><h3>Workflow Steps</h3>
            <div class="menu-wrap">
              <button class="btn-ghost add" (click)="menu.set(menu() === 'add2' ? '' : 'add2'); $event.stopPropagation()"><app-icon name="plus" [size]="16" />Add Step</button>
              @if (menu() === 'add2') {
                <div class="dropdown" (click)="$event.stopPropagation()">
                  @for (t of palette; track t) {<button class="dd-item" (click)="addNode(t); menu.set('')"><span class="pi sm" [style.background]="meta[t].color"><app-icon [name]="meta[t].icon" [size]="11" [stroke]="2.4" /></span>{{ meta[t].label }}</button>}
                </div>
              }
            </div>
          </div>
          <div class="tw">
            <table class="table st">
              <thead><tr><th>#</th><th>Step Name</th><th>Type</th><th>Assigned To</th><th>Conditions</th><th class="c">Actions</th></tr></thead>
              <tbody>
                @for (n of nodes(); track n.id; let k = $index) {
                  <tr class="clickable" [class.selected]="selId() === n.id" (click)="select(n.id)">
                    <td>{{ k + 1 }}</td>
                    <td><span class="sn"><span class="pi sm" [style.background]="n.color"><app-icon [name]="nodeIcon(n, true)" [size]="11" [stroke]="2.4" /></span>{{ n.name }}</span></td>
                    <td>{{ meta[n.type].typeLabel }}</td>
                    <td>{{ n.cfg.assignee }}</td>
                    <td>{{ n.cfg.conditions }}</td>
                    <td class="c">
                      <div class="menu-wrap">
                        <button class="dots" (click)="rowMenu.set(rowMenu() === n.id ? '' : n.id); $event.stopPropagation()">•••</button>
                        @if (rowMenu() === n.id) {
                          <div class="dropdown" (click)="$event.stopPropagation()">
                            <button class="dd-item" (click)="select(n.id); rowMenu.set('')"><app-icon name="sliders" [size]="14" />Configure</button>
                            <button class="dd-item" (click)="dupNode(n); rowMenu.set('')"><app-icon name="workflow-copy" [size]="14" />Duplicate</button>
                            <button class="dd-item danger" (click)="deleteNode(n.id); rowMenu.set('')"><app-icon name="workflow-trash" [size]="14" />Delete</button>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card inst-card">
          <div class="ch"><h3>Recent Workflow Instances</h3><button class="link va" (click)="go('workflow-instances')">View All</button></div>
          <table class="table it"><colgroup><col style="width:10%"><col style="width:20%"><col style="width:14%"><col style="width:12%"><col style="width:15%"><col style="width:23%"><col style="width:6%"></colgroup>
            <thead><tr><th>ID</th><th>Workflow</th><th>Requested By</th><th>Status</th><th>Current Step</th><th>Started On</th><th class="c">Actions</th></tr></thead>
            <tbody>
              @for (i of recent(); track i.id) {
                <tr class="clickable" (click)="drawer.set(i.id)">
                  <td>{{ i.id }}</td><td>{{ i.workflow }}</td><td>{{ i.requester }}</td>
                  <td><span [class]="'tag ' + statusCls(i.status)">{{ i.status }}</span></td>
                  <td>{{ cur(i) }}</td><td>{{ fd(i.startedAt) }}</td>
                  <td class="c"><button class="eye" (click)="drawer.set(i.id); $event.stopPropagation()" title="View instance"><app-icon name="eye" [size]="17" /></button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Step configuration -->
      <div class="card cfg">
        <h3>Step Configuration</h3>
        @if (sel(); as n) {
          @let f = form();
          <div class="sc-head">
            <span class="sc-ic" [style.background]="n.color"><app-icon [name]="nodeIcon(n, true)" [size]="20" /></span>
            <div><b>{{ n.name }}</b><small>{{ kind[n.type] }}</small></div>
          </div>
          <nav class="ul-tabs">@for (t of stepTabs; track t) {<button [class.on]="stepTab() === t" (click)="stepTab.set(t)">{{ t }}</button>}</nav>
          <div class="fields">
            @switch (stepTab()) {
              @case ('General') {
                <label><span>Step Name <i>*</i></span><input class="input" [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
                <label>Description<textarea class="input" rows="2" [value]="f.description" (input)="setF('description', $any($event.target).value)"></textarea></label>
                @if (human(n)) {
                  <div class="two">
                    <label>Approver Type<select class="input" [value]="f.approverType" (change)="setF('approverType', $any($event.target).value)">@for (a of approverTypes; track a) {<option>{{ a }}</option>}</select></label>
                    <div class="lbl">Allow Delegation<app-wf-toggle [on]="f.allowDelegation" (changed)="setF('allowDelegation', $event)" label="Allow Delegation" /></div>
                  </div>
                  <label><span>Due In <i>*</i></span></label>
                  <div class="two tight">
                    <input class="input" type="number" min="0" [value]="f.dueIn" (input)="setF('dueIn', +$any($event.target).value)" />
                    <select class="input" [value]="f.dueUnit" (change)="setF('dueUnit', $any($event.target).value)"><option>Hours</option><option>Days</option></select>
                  </div>
                  <div class="lbl">Escalation<app-wf-toggle [on]="f.escalation" (changed)="setF('escalation', $event)" [label]="'Escalate to ' + f.escalateTo + ' if not approved within ' + f.dueIn + ' ' + f.dueUnit.toLowerCase()" /></div>
                } @else if (n.type === 'condition') {
                  <label>Evaluate<input class="input" [value]="f.conditions" (input)="setF('conditions', $any($event.target).value)" /></label>
                  <div class="lbl">Branches</div>
                  @for (e of outEdges(n.id); track e.id) {
                    <div class="br"><input class="input" [value]="e.label ?? ''" placeholder="Branch label" (change)="relabel(e.id, $any($event.target).value)" /><span>→ {{ nodeName(e.to) }}</span></div>
                  } @empty {<p class="muted sm">No branches yet — drag from the ● handle to another step.</p>}
                } @else if (n.type === 'notification') {
                  <label>Recipients<input class="input" [value]="n.sub" (change)="setSub($any($event.target).value)" /></label>
                  <div class="lbl">Channels</div>
                  <div class="chk">@for (c of channels; track c) {<label><input type="checkbox" [checked]="f.channels.includes(c)" (change)="toggleChannel(c)" />{{ c }}</label>}</div>
                } @else if (n.type === 'integration') {
                  <label>Connector<select class="input" [value]="f.connector" (change)="setF('connector', $any($event.target).value)">@for (c of connectors; track c) {<option>{{ c }}</option>}</select></label>
                  <label>Retries on failure<input class="input" type="number" min="0" [value]="f.retries" (input)="setF('retries', +$any($event.target).value)" /></label>
                } @else if (n.type === 'delay') {
                  <label>Wait for</label>
                  <div class="two tight">
                    <input class="input" type="number" min="0" [value]="f.dueIn" (input)="setF('dueIn', +$any($event.target).value)" />
                    <select class="input" [value]="f.dueUnit" (change)="setF('dueUnit', $any($event.target).value)"><option>Hours</option><option>Days</option></select>
                  </div>
                } @else if (n.type === 'start') {
                  <label>Trigger<select class="input" [value]="wf().trigger" (change)="patchWf({ trigger: $any($event.target).value })">@for (t of triggers; track t) {<option>{{ t }}</option>}<option>Manual</option></select></label>
                } @else {
                  <label>Target / Detail<input class="input" [value]="n.sub" (change)="setSub($any($event.target).value)" /></label>
                }
              }
              @case ('Assignment') {
                <label>Assigned To<input class="input" [value]="f.assignee" (input)="setF('assignee', $any($event.target).value)" /></label>
                <label>Approval Mode<select class="input" [value]="f.mode" (change)="setF('mode', $any($event.target).value)"><option>Any one approver</option><option>All approvers</option><option>Majority</option></select></label>
                <label>Escalate To<select class="input" [value]="f.escalateTo" (change)="setF('escalateTo', $any($event.target).value)">@for (a of approverTypes; track a) {<option>{{ a }}</option>}</select></label>
                <div class="lbl">Delegation<app-wf-toggle [on]="f.allowDelegation" (changed)="setF('allowDelegation', $event)" label="Approver may delegate to a peer" /></div>
              }
              @case ('Conditions') {
                <label>Entry condition<input class="input" [value]="f.conditions" (input)="setF('conditions', $any($event.target).value)" placeholder="e.g. If Other / After Manager" /></label>
                <div class="lbl">Outgoing connections</div>
                @for (e of outEdges(n.id); track e.id) {
                  <div class="br"><input class="input" [value]="e.label ?? ''" placeholder="(no label)" (change)="relabel(e.id, $any($event.target).value)" /><span>→ {{ nodeName(e.to) }}</span><button class="ib" (click)="deleteEdge(e.id)" title="Remove connection"><app-icon name="workflow-trash" [size]="14" /></button></div>
                } @empty {<p class="muted sm">No outgoing connections.</p>}
              }
              @case ('Notifications') {
                <div class="lbl">Notify assignee via</div>
                <div class="chk">@for (c of channels; track c) {<label><input type="checkbox" [checked]="f.channels.includes(c)" (change)="toggleChannel(c)" />{{ c }}</label>}</div>
                <div class="lbl">Reminders<app-wf-toggle [on]="f.reminders" (changed)="setF('reminders', $event)" label="Daily reminder until actioned" /></div>
              }
              @case ('Advanced') {
                <label>On timeout<select class="input" [value]="f.onTimeout" (change)="setF('onTimeout', $any($event.target).value)"><option>Escalate</option><option>Auto-approve</option><option>Auto-reject</option></select></label>
                <label>Retries<input class="input" type="number" min="0" [value]="f.retries" (input)="setF('retries', +$any($event.target).value)" /></label>
                <div class="lbl">Colour</div>
                <div class="sw">@for (c of swatches; track c) {<button [style.background]="c" [class.on]="n.color === c" (click)="recolor(c)"></button>}</div>
                <p class="muted sm">Step ID {{ n.id }} · position {{ n.x }}, {{ n.y }}</p>
              }
            }
          </div>
          <div class="save-row"><button class="btn-primary sv" (click)="saveStep()">Save Changes</button></div>
        } @else {
          <div class="empty"><app-icon name="workflow" [size]="28" /><p>Select a step on the canvas or in the steps table to configure it.</p></div>
        }
      </div>

      <!-- Workflow properties -->
      <div class="card props">
        <h3>Workflow Properties</h3>
        <nav class="box-tabs">@for (t of propTabs; track t) {<button [class.on]="propTab() === t" (click)="propTab.set(t)">{{ t }}</button>}</nav>
        @switch (propTab()) {
          @case ('General') {
            <div class="pf">
              <span>Workflow Name <i>*</i></span><input class="input" [value]="wf().name" (change)="patchWf({ name: $any($event.target).value })" />
              <span>Description</span><textarea class="input" rows="3" [value]="wf().description" (change)="patchWf({ description: $any($event.target).value })"></textarea>
              <span>Module</span><select class="input" [value]="wf().module" (change)="patchWf({ module: $any($event.target).value })">@for (m of modules; track m) {<option>{{ m }}</option>}</select>
              <span>Category</span><select class="input" [value]="wf().category" (change)="patchWf({ category: $any($event.target).value })">@for (c of categories; track c) {<option>{{ c }}</option>}</select>
              <span>Status</span>
              <div class="sv-row">
                <select class="input" [value]="wf().status" (change)="patchWf({ status: $any($event.target).value })"><option>Draft</option><option>Active</option><option>Inactive</option><option>Archived</option></select>
                <span>Version</span><input class="input" [value]="wf().version" (change)="patchWf({ version: $any($event.target).value })" />
              </div>
            </div>
            <div class="dates">
              <label>Valid From<span class="dfield">{{ dd(wf().validFrom) }}<app-icon name="calendar-days" [size]="15" /><input type="date" [value]="wf().validFrom" (click)="pick($event)" (change)="patchWf({ validFrom: $any($event.target).value })" /></span></label>
              <label>Valid To<span class="dfield">{{ dd(wf().validTo) }}<app-icon name="calendar-days" [size]="15" /><input type="date" [value]="wf().validTo" (click)="pick($event)" (change)="patchWf({ validTo: $any($event.target).value })" /></span></label>
            </div>
            <div class="tg">
              <app-wf-toggle [on]="wf().audit" (changed)="patchWf({ audit: $event })" label="Enable Audit Trail" />
              <app-wf-toggle [on]="wf().manualTrigger" (changed)="patchWf({ manualTrigger: $event })" label="Allow Manual Trigger" />
              <app-wf-toggle [on]="wf().portal" (changed)="patchWf({ portal: $event })" label="Show in Employee Portal" />
            </div>
          }
          @case ('Settings') {
            <div class="pf">
              <span>Trigger</span><select class="input" [value]="wf().trigger" (change)="patchWf({ trigger: $any($event.target).value })">@for (t of triggers; track t) {<option>{{ t }}</option>}<option>Manual</option></select>
              <span>SLA (hours)</span><input class="input" type="number" [value]="wf().slaHours" (change)="patchWf({ slaHours: +$any($event.target).value })" />
              <span>Priority</span><select class="input" [value]="wf().priority" (change)="patchWf({ priority: $any($event.target).value })"><option>High</option><option>Medium</option><option>Low</option></select>
              <span>Owner</span><input class="input" [value]="wf().owner" (change)="patchWf({ owner: $any($event.target).value })" />
            </div>
            <div class="tg">
              <app-wf-toggle [on]="true" label="Allow parallel instances per employee" />
              <app-wf-toggle [on]="true" label="Auto-archive completed after 90 days" />
              <app-wf-toggle [on]="false" label="Require comment on rejection" />
            </div>
          }
          @case ('Permissions') {
            <table class="table perm">
              <thead><tr><th>Role</th><th>Start</th><th>View</th><th>Edit</th><th>Publish</th></tr></thead>
              <tbody>
                @for (r of roles; track r; let ri = $index) {
                  <tr><td>{{ r }}</td>@for (p of [0, 1, 2, 3]; track p) {<td><input type="checkbox" [checked]="perm()[ri][p]" (change)="togglePerm(ri, p)" /></td>}</tr>
                }
              </tbody>
            </table>
          }
          @case ('Integrations') {
            <ul class="intg">
              @for (c of store.connectors().slice(0, 7); track c.id) {
                <li><span class="lg" [style.background]="c.color">{{ c.logo }}</span><div><b>{{ c.name }}</b><small [class]="c.status === 'Connected' ? 'ok' : 'ko'">{{ c.status }}</small></div>
                  <app-wf-toggle [on]="usesConn(c.usedBy)" (changed)="toggleConn(c.id, $event)" /></li>
              }
            </ul>
            <button class="link" (click)="go('integrations-connectors')">Manage connectors →</button>
          }
        }
      </div>
    </section>

    <!-- ============ Modals ============ -->
    @if (testOpen()) {
      <div class="g-overlay" (click)="testOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Test “{{ wf().name }}”</h3><button class="close-btn" (click)="testOpen.set(false)">×</button></div>
        <p class="muted">Simulate a request end-to-end. Choose the outcome at each decision; the run is animated on the canvas and logged as a test instance.</p>
        <div class="form-grid">
          <label class="full">Requester<select class="select" [value]="testWho()" (change)="testWho.set($any($event.target).value)">@for (p of people; track p) {<option>{{ p }}</option>}</select></label>
          @for (c of decisionNodes(); track c.id) {
            <label>{{ c.name }}<select class="select" [value]="testChoice()[c.id] ?? ''" (change)="choose(c.id, $any($event.target).value)">@for (e of outEdges(c.id); track e.id) {<option [value]="e.label ?? e.id">{{ e.label || '→ ' + nodeName(e.to) }}</option>}</select></label>
          }
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="testOpen.set(false)">Cancel</button><button class="btn-primary" (click)="startRun()"><app-icon name="workflow-play" [size]="15" />Run Test</button></div>
      </div>
    }
    @if (publishOpen()) {
      <div class="g-overlay" (click)="publishOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Publish workflow</h3><button class="close-btn" (click)="publishOpen.set(false)">×</button></div>
        <p><b>{{ wf().name }}</b> passed validation ({{ nodes().length }} steps, {{ edges().length }} connections).</p>
        <div class="form-grid">
          <label>New version<input class="input" [value]="nextVersion()" readonly /></label>
          <label>Effective from<input class="input" type="date" [value]="wf().validFrom" /></label>
          <label class="full row"><input type="checkbox" checked /> Notify {{ wf().module }} administrators</label>
          <label class="full row"><input type="checkbox" checked /> Running instances finish on their current version</label>
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="publishOpen.set(false)">Cancel</button><button class="btn-primary" (click)="confirmPublish()">Publish {{ nextVersion() }}</button></div>
      </div>
    }
    @if (newOpen()) {
      <div class="g-overlay" (click)="newOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); createNew()">
        <div class="modal-head"><h3>New Workflow</h3><button type="button" class="close-btn" (click)="newOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Workflow name *<input class="input" required [value]="nw().name" (input)="nw.set({ ...nw(), name: $any($event.target).value })" placeholder="e.g. Probation Review" /></label>
          <label>Module<select class="select" [value]="nw().module" (change)="nw.set({ ...nw(), module: $any($event.target).value })">@for (m of modules; track m) {<option>{{ m }}</option>}</select></label>
          <label>Category<select class="select" [value]="nw().category" (change)="nw.set({ ...nw(), category: $any($event.target).value })">@for (c of categories; track c) {<option>{{ c }}</option>}</select></label>
          <label class="full">Start from<select class="select" [value]="nw().from" (change)="nw.set({ ...nw(), from: $any($event.target).value })"><option value="">Blank canvas (Start → End)</option>@for (t of templates; track t.id) {<option [value]="t.id">Template: {{ t.name }}</option>}</select></label>
        </div>
        @if (nwErr()) {<p class="errt">{{ nwErr() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Create &amp; open</button></div>
      </form>
    }
    <app-wf-instance-drawer [instId]="drawer()" (closed)="drawer.set(null)" (done)="toastMsg($event)" />
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    :host ::ng-deep .page-head > div:first-child { flex: 1 1 0; min-width: 420px; } :host ::ng-deep .page-head .subtitle { font-size: 13.5px; }
    .hb { height: 38px; padding: 0 14px; font-size: 12.5px; } .pub { padding: 0 24px; font-size: 13.5px; } .dots-b { padding: 0 12px; font-size: 18px; }
    .tpl { min-width: 280px; } .tpl .dd-item span { display: flex; flex-direction: column; } .tpl small, .dd-h { color: var(--muted); font-size: 11px; font-weight: 400; } .dd-h { padding: 4px 10px 6px; }
    .danger { color: var(--red); }

    /* Designer card */
    .designer { padding: 14px 14px 12px; margin-bottom: 14px; }
    .designer.fs { position: fixed; inset: 0; z-index: 80; border-radius: 0; margin: 0; display: flex; flex-direction: column; }
    .designer.fs .d-body { flex: 1; } .designer.fs .canvas { height: auto; }
    .d-top { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
    .wf-ic { width: 40px; height: 40px; border-radius: 9px; background: #22c55e; color: #fff; display: grid; place-items: center; flex-shrink: 0; }
    .d-title { flex: 1; min-width: 0; } .d-title p { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
    .t-row { display: flex; align-items: center; gap: 10px; } .t-row h2 { margin: 0; font-size: 17.5px; font-weight: 700; letter-spacing: -.2px; }
    .name-in { font-size: 15px; font-weight: 600; width: 360px; }
    .st-chip { padding: 2px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; background: #e8edff; color: #4f46e5; }
    .st-chip.active { background: #dcfce7; color: #15803d; } .st-chip.inactive, .st-chip.archived { background: #eef0f5; color: #4b5563; }
    .ib { border: 0; background: none; color: #3b3f5c; cursor: pointer; padding: 2px; display: grid; place-items: center; } .ib:hover { color: var(--primary); }
    .unsaved { font-size: 11px; color: #b45309; }
    .tb { display: flex; align-items: center; gap: 10px; }
    .grp { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; background: #fff; height: 36px; }
    .tbb { border: 0; background: none; height: 34px; min-width: 34px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: #2d3150; cursor: pointer; font-size: 12.5px; font-weight: 500; border-radius: 7px; }
    .tbb:hover:not(:disabled) { background: #f5f3ff; color: var(--primary); } .tbb:disabled { opacity: .35; cursor: default; }
    .zv { min-width: 84px; justify-content: space-between; padding: 0 10px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-radius: 0; }
    .zd { min-width: 130px; }
    .test { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 18px; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: #4c1d95; font-size: 13px; font-weight: 500; cursor: pointer; }
    .test app-icon { color: #6d28d9; } .test:hover { background: #f5f3ff; } .test.stop { color: #b91c1c; } .test.stop app-icon { color: #ef4444; }

    .d-body { display: grid; grid-template-columns: 218px minmax(0, 1fr); gap: 14px; }
    .palette { border: 1px solid #eef0f6; border-radius: 10px; padding: 10px 8px 8px; align-self: start; }
    .palette h4 { margin: 0 0 10px 4px; font-size: 13px; font-weight: 700; }
    .pg-h { background: #f6f7fb; border-radius: 6px; padding: 5px 8px; font-size: 11px; color: #3b3f5c; margin-bottom: 6px; }
    .pg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
    .pal { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 7px; border: 1px solid #eceef5; border-radius: 6px; background: #fff; font-size: 10.5px; color: #2d3150; cursor: grab; text-align: left; white-space: nowrap; }
    .pal:hover { border-color: #c4b5fd; background: #faf8ff; } .pal:active { cursor: grabbing; }
    .pi { width: 18px; height: 18px; border-radius: 4px; display: grid; place-items: center; color: #fff; flex-shrink: 0; } .pi.sm { width: 16px; height: 16px; border-radius: 4px; }
    .hint { margin: 2px 4px 0; font-size: 10.5px; color: var(--muted); line-height: 1.4; }

    .canvas { position: relative; height: 352px; overflow: hidden; border-radius: 10px; cursor: default; touch-action: none;
      background-color: #fcfcff; background-image: radial-gradient(#dfe2ee 1px, transparent 1.2px); background-size: 14px 14px; }
    .canvas.panning { cursor: grabbing; }
    .world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    .edge { pointer-events: stroke; cursor: pointer; }
    .edge .hit { fill: none; stroke: transparent; stroke-width: 12; }
    .ln { fill: none; stroke-width: 1.6; }
    .edge.sel .ln { stroke: #7c3aed !important; stroke-width: 2.4; }
    .ln.flow { stroke: #22c55e !important; stroke-width: 2.6; stroke-dasharray: 6 4; animation: flow .5s linear infinite; }
    @keyframes flow { to { stroke-dashoffset: -10; } }
    .ln.temp { stroke: #7c3aed; stroke-dasharray: 5 4; stroke-width: 1.8; }
    .el { font-size: 11.5px; font-weight: 600; fill: #5b21b6; pointer-events: none; } .el.red { fill: #dc2626; }
    .token { fill: #22c55e; stroke: #fff; stroke-width: 2.5; filter: drop-shadow(0 0 6px rgba(34,197,94,.9)); }

    .node { position: absolute; display: flex; align-items: center; gap: 7px; padding: 0 8px; border-radius: 6px; cursor: grab; user-select: none;
      background: color-mix(in srgb, var(--c) 9%, #fff); border: 1.5px solid color-mix(in srgb, var(--c) 50%, #fff); box-shadow: 0 1px 2px rgba(20,20,60,.05); transition: box-shadow .15s; }
    .node:hover .port, .node.sel .port { opacity: 1; }
    .node.sel { box-shadow: 0 0 0 2.5px #7c3aed, 0 6px 18px rgba(124,58,237,.18); }
    .node.bad { outline: 2px dashed #ef4444; outline-offset: 3px; }
    .node.active { box-shadow: 0 0 0 3px #22c55e, 0 0 22px rgba(34,197,94,.55); animation: pulse .8s ease-in-out infinite alternate; }
    @keyframes pulse { to { box-shadow: 0 0 0 5px rgba(34,197,94,.55), 0 0 28px rgba(34,197,94,.7); } }
    .ni { color: var(--c); display: grid; place-items: center; }
    .node.solid .ni { width: 28px; height: 28px; border-radius: 6px; background: var(--c); color: #fff; }
    .nt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
    .nt b { font-size: 10.5px; font-weight: 700; color: #1d1f3a; white-space: nowrap; } .nt small { font-size: 10px; color: #4b4f6b; white-space: nowrap; }
    .k-start, .k-end, .k-condition { background: none; border: 0; box-shadow: none; padding: 0; justify-content: center; border-radius: 50%; }
    .k-condition { border-radius: 0; }
    .k-start.sel .circ, .k-end.sel .circ { box-shadow: 0 0 0 3px #7c3aed; }
    .k-start.sel, .k-end.sel, .k-condition.sel { box-shadow: none; }
    .k-condition.sel .dia path { stroke: #7c3aed; stroke-width: 3; }
    .k-start.active, .k-end.active, .k-condition.active { box-shadow: none; animation: none; }
    .k-start.active .circ, .k-end.active .circ { box-shadow: 0 0 0 4px rgba(34,197,94,.5), 0 0 20px rgba(34,197,94,.7); }
    .k-condition.active .dia path { stroke: #22c55e; stroke-width: 3.5; }
    .circ { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
    .circ.start { background: #22c55e; color: #fff; box-shadow: inset 0 0 0 3px #fff, 0 0 0 2px #22c55e; padding-left: 3px; }
    .circ.end { background: #fff; border: 4px solid #ef4444; box-shadow: 0 0 0 2px #fecaca; } .circ.end i { width: 16px; height: 16px; border-radius: 3px; background: #ef4444; }
    .cap { position: absolute; display: flex; flex-direction: column; line-height: 1.25; white-space: nowrap; pointer-events: none; }
    .cap b { font-size: 11px; font-weight: 700; color: #1d1f3a; } .cap small { font-size: 10px; color: #3b3f5c; }
    .cap.below { top: 50px; left: 50%; transform: translateX(-50%); align-items: center; text-align: center; }
    .cap.right { left: 52px; top: 50%; transform: translateY(-50%); }
    .dia { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; } .dia path { fill: #fff4dc; stroke: #f5b544; stroke-width: 2; stroke-linejoin: round; }
    .dt { position: relative; font-size: 10px; letter-spacing: -.1px; font-weight: 700; color: #1d1f3a; white-space: nowrap; }
    .port { position: absolute; right: -6px; top: 50%; width: 11px; height: 11px; margin-top: -5.5px; border-radius: 50%; background: #fff; border: 2px solid #7c3aed; cursor: crosshair; opacity: 0; transition: opacity .1s; z-index: 2; }
    .k-start .port { right: -6px; } .k-condition .port { right: -6px; }
    .ntb { position: absolute; top: -30px; right: 0; display: flex; gap: 2px; background: #fff; border: 1px solid var(--border); border-radius: 7px; padding: 2px; box-shadow: 0 4px 12px rgba(20,20,60,.12); z-index: 3; }
    .ntb button { border: 0; background: none; width: 24px; height: 22px; border-radius: 5px; display: grid; place-items: center; cursor: pointer; color: #3b3f5c; }
    .ntb button:hover { background: #f5f3ff; color: var(--primary); } .ntb button:last-child:hover { background: #fee2e2; color: #dc2626; }
    .okb, .badb { position: absolute; top: -8px; right: -8px; width: 17px; height: 17px; border-radius: 50%; background: #22c55e; color: #fff; font-size: 10px; font-weight: 700; display: grid; place-items: center; z-index: 2; }
    .badb { background: #ef4444; left: -8px; right: auto; }

    .vchip { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 14px; border: 1px solid var(--border); background: #fff; font-size: 11px; font-weight: 600; color: #4b4f6b; cursor: pointer; }
    .vchip.okc { color: #15803d; border-color: #bbf7d0; background: #f0fdf4; } .vchip.errc { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
    .vpanel { position: absolute; left: 10px; bottom: 44px; width: 340px; max-height: 250px; overflow: auto; background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 32px rgba(20,20,60,.16); padding: 10px 12px; z-index: 5; }
    .vh { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 6px; }
    .vi { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; border: 0; background: none; padding: 6px 4px; font-size: 12px; cursor: pointer; border-radius: 6px; } .vi:hover { background: #faf8ff; }
    .okt { display: flex; gap: 8px; align-items: center; color: #15803d; font-size: 12px; margin: 0; }
    .runbar { display: flex; align-items: center; gap: 12px; margin: 10px 0 0 232px; padding: 8px 12px; border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 10px; font-size: 11.5px; }
    .rb-h { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #15803d; white-space: nowrap; } .rb-h.live app-icon { animation: g-blink 1s infinite; }
    .runbar ol { flex: 1; min-width: 0; display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; overflow-x: auto; scrollbar-width: thin; }
    .runbar li { flex-shrink: 0; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; border-radius: 12px; background: #fff; border: 1px solid #dcfce7; color: #3b3f5c; }
    .runbar li span { color: var(--muted); margin-right: 5px; font-variant-numeric: tabular-nums; } .runbar li.last { border-color: #22c55e; color: #15803d; font-weight: 600; }

    /* Bottom row */
    .bottom { display: grid; grid-template-columns: minmax(0, 1.95fr) minmax(0, 1.04fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
    .col1 { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .ch { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    h3 { font-size: 15px; font-weight: 700; letter-spacing: -.2px; }
    .add { padding: 6px 12px; font-size: 12px; color: #4c1d95; } .add app-icon { color: #6d28d9; }
    .steps-card, .inst-card { padding: 12px 12px; }
    .tw { max-height: 222px; overflow: auto; scrollbar-width: thin; }
    .inst-card { overflow-x: auto; }
    .table th { background: #fff; font-size: 10px; padding: 5px 5px; color: #2d3150; font-weight: 500; }
    .table td { font-size: 10px; padding: 4px 5px; height: 24px; color: #2d3150; }
    .st td:first-child, .st th:first-child { width: 26px; }
    .c { text-align: center; }
    .sn { display: inline-flex; align-items: center; gap: 9px; }
    .dots { font-size: 11px; letter-spacing: -1px; color: #3730a3; font-weight: 700; }
    .va { font-size: 12.5px; border: 0; background: none; cursor: pointer; font-weight: 500; }
    .it { table-layout: fixed; } .it td, .it th { font-size: 9.5px; padding-left: 4px; padding-right: 4px; } .it td { overflow: hidden; text-overflow: ellipsis; } .it .tag { border-radius: 4px; font-size: 10px; padding: 2px 7px; }
    .eye { border: 0; background: none; color: #3730a3; cursor: pointer; display: grid; place-items: center; margin: 0 auto; }

    .cfg, .props { padding: 12px 14px; display: flex; flex-direction: column; min-width: 0; }
    .sc-head { display: flex; align-items: center; gap: 12px; margin: 12px 0 10px; }
    .sc-head div { display: flex; flex-direction: column; } .sc-head b { font-size: 14px; } .sc-head small { font-size: 11px; color: var(--muted); margin-top: 3px; }
    .sc-ic { width: 36px; height: 36px; border-radius: 7px; display: grid; place-items: center; color: #fff; }
    .ul-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
    .ul-tabs button { border: 0; background: none; padding: 7px 5px; font-size: 9.5px; color: #3b3f5c; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; }
    .ul-tabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; font-size: 10.5px; }
    .fields { display: flex; flex-direction: column; gap: 9px; padding-top: 10px; flex: 1; }
    .fields label, .lbl { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: #3b3f5c; }
    .fields i, .pf i { color: var(--red); font-style: normal; }
    .fields .input { font-size: 11px; padding: 6px 9px; }
    textarea.input { resize: vertical; min-height: 40px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; } .two.tight { margin-top: -4px; }
    .lbl app-wf-toggle { font-size: 10.5px; min-height: 30px; }
    .br { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; font-size: 11px; color: #4b4f6b; }
    .chk { display: flex; flex-wrap: wrap; gap: 12px; } .chk label { flex-direction: row; align-items: center; gap: 5px; }
    .sw { display: flex; gap: 6px; } .sw button { width: 22px; height: 22px; border-radius: 6px; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--border); cursor: pointer; } .sw button.on { box-shadow: 0 0 0 2px #1d1f3a; }
    .sm { font-size: 11px; margin: 0; }
    .save-row { display: flex; justify-content: flex-end; margin-top: 12px; } .sv { padding: 8px 22px; font-size: 12.5px; }
    .empty { flex: 1; display: grid; place-items: center; text-align: center; color: var(--muted); font-size: 12.5px; gap: 6px; align-content: center; }

    .box-tabs { display: flex; gap: 2px; margin: 12px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .box-tabs button { border: 1px solid transparent; background: none; padding: 6px 9px; font-size: 10px; white-space: nowrap; color: #3b3f5c; border-radius: 6px; cursor: pointer; }
    .box-tabs button.on { border-color: #ddd6fe; background: #f5f3ff; color: var(--primary); font-weight: 600; font-size: 11px; }
    .pf { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 9px 6px; align-items: center; font-size: 10px; color: #3b3f5c; } .pf > span { white-space: nowrap; }
    .pf .input { font-size: 10.5px; padding: 6px 9px; min-width: 0; width: 100%; }
    .sv-row { display: grid; grid-template-columns: 1fr auto 52px; gap: 8px; align-items: center; }
    .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 4px; }
    .dates label { display: flex; flex-direction: column; gap: 6px; font-size: 10.5px; color: #3b3f5c; }
    .dfield { position: relative; display: flex; justify-content: space-between; align-items: center; height: 30px; padding: 0 8px; border: 1px solid var(--border); border-radius: 7px; font-size: 10.5px; color: var(--text); }
    .dfield app-icon { color: #3730a3; } .dfield input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
    .tg { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; } .tg app-wf-toggle { font-size: 11px; }
    .perm th, .perm td { font-size: 11px; } .perm td:not(:first-child), .perm th:not(:first-child) { text-align: center; }
    .intg { list-style: none; margin: 0 0 8px; padding: 0; } .intg li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid #f0f1f6; }
    .intg div { display: flex; flex-direction: column; font-size: 11.5px; } .intg small { font-size: 10.5px; } .ok { color: #16a34a; } .ko { color: #b45309; }
    .lg { width: 30px; height: 30px; border-radius: 7px; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
    .link { font-size: 12px; }
    .row { flex-direction: row !important; align-items: center; gap: 8px !important; }
    .errt { color: var(--red); font-size: 12.5px; }
    @media (max-width: 1350px) { .bottom { grid-template-columns: 1fr 1fr; } .col1 { grid-column: 1 / -1; } }
    @media (max-width: 900px) { .bottom { grid-template-columns: 1fr; } .d-body { grid-template-columns: 1fr; } .d-top { flex-wrap: wrap; } }
  `,
})
export class WorkflowDesigner {
  protected readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly canvasRef = viewChild<ElementRef<HTMLDivElement>>('canvas');

  protected readonly meta = NODE_META;
  protected readonly kind = STEP_KIND;
  protected readonly palette = PALETTE;
  protected readonly groups = [
    { name: 'Basic Elements', types: PALETTE.slice(0, 6) },
    { name: 'Actions', types: PALETTE.slice(6) },
  ];
  protected readonly templates = TEMPLATES;
  protected readonly zooms = ZOOMS;
  protected readonly stepTabs = STEP_TABS;
  protected readonly propTabs = PROP_TABS;
  protected readonly approverTypes = APPROVER_TYPES;
  protected readonly connectors = CONNECTOR_NAMES;
  protected readonly modules = MODULES;
  protected readonly categories = CATEGORIES;
  protected readonly triggers = TRIGGERS;
  protected readonly roles = ROLES;
  protected readonly swatches = SWATCHES;
  protected readonly channels = ['Email', 'Push', 'SMS', 'Teams'];
  protected readonly people = NAMES.slice(0, 16);
  protected readonly markers = [{ id: 'mk-grey', c: '#3b3f5c' }, { id: 'mk-red', c: '#ef4444' }, { id: 'mk-sel', c: '#7c3aed' }, { id: 'mk-green', c: '#22c55e' }];
  protected readonly fd = fmtDT;
  protected readonly cur = currentStep;

  protected readonly wf = this.store.current;
  protected readonly nodes = signal<WfNode[]>([]);
  protected readonly edges = signal<WfEdge[]>([]);
  protected readonly selId = signal<string | null>('n4');
  protected readonly selEdge = signal<string | null>(null);
  protected readonly sel = computed(() => this.nodes().find((n) => n.id === this.selId()) ?? null);
  protected readonly dirty = signal(false);
  protected readonly menu = signal('');
  protected readonly rowMenu = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly editingName = signal(false);
  protected readonly fullscreen = signal(false);
  protected readonly stepTab = signal<(typeof STEP_TABS)[number]>('General');
  protected readonly propTab = signal<(typeof PROP_TABS)[number]>('General');
  protected readonly drawer = signal<string | null>(null);
  protected readonly perm = signal(ROLES.map((_, i) => [true, i > 0, i >= 3, i === 4]));

  // view
  protected readonly zoom = signal(1);
  protected readonly zoomPct = computed(() => Math.round(this.zoom() * 100));
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  protected readonly world = computed(() => {
    const ns = this.nodes();
    return { w: Math.max(1000, ...ns.map((n) => n.x + n.w + 160)), h: Math.max(350, ...ns.map((n) => n.y + n.h + 80)) };
  });

  // history
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  protected readonly undoN = signal(0);
  protected readonly redoN = signal(0);

  // validation
  protected readonly issues = signal<Issue[] | null>(null);
  protected readonly showIssues = signal(false);
  protected readonly badIds = computed(() => new Set((this.issues() ?? []).filter((i) => i.level === 'error' && i.nodeId).map((i) => i.nodeId!)));

  // test run
  protected readonly run = signal<{ running: boolean; active: string | null; done: string[]; edge: string | null; log: { t: string; text: string }[]; outcome: string } | null>(null);
  protected readonly token = signal<Pt | null>(null);
  protected readonly testOpen = signal(false);
  protected readonly testWho = signal('Ahmed Hassan');
  protected readonly testChoice = signal<Record<string, string>>({});
  private runToken = 0;

  // modals
  protected readonly publishOpen = signal(false);
  protected readonly newOpen = signal(false);
  protected readonly nw = signal({ name: '', module: MODULES[0], category: CATEGORIES[1], from: '' });
  protected readonly nwErr = signal('');

  protected readonly recent = computed(() => this.store.instances().slice(0, 4));
  protected readonly decisionNodes = computed(() => this.nodes().filter((n) => n.type === 'condition' || this.outEdges(n.id).length > 1));

  // step form
  protected readonly form = signal<CfgForm>({ name: '', ...makeNode('x', 'approval', '', '', 0, 0).cfg });

  // interaction state (not rendered)
  private drag: { id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
  protected pan0: { sx: number; sy: number; px: number; py: number } | null = null;
  protected readonly link = signal<{ from: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  private loadedId = '';
  private seq = 1;

  constructor() {
    effect(() => {
      const w = this.wf();
      untracked(() => {
        if (w.id !== this.loadedId) this.load(w);
      });
    });
    effect(() => {
      const n = this.sel();
      untracked(() => n && this.form.set({ name: n.name, ...clone(n.cfg) }));
    });
    inject(DestroyRef).onDestroy(() => this.runToken++);
  }

  private load(w: Workflow) {
    this.loadedId = w.id;
    this.nodes.set(clone(w.nodes));
    this.edges.set(clone(w.edges));
    this.undoStack = [];
    this.redoStack = [];
    this.syncHist();
    this.dirty.set(false);
    this.issues.set(null);
    this.showIssues.set(false);
    this.run.set(null);
    this.selEdge.set(null);
    this.selId.set(w.nodes.find((n) => n.name === 'Manager Approval')?.id ?? w.nodes.find((n) => n.type === 'approval')?.id ?? null);
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  /* ---------------- geometry ---------------- */
  private port(n: WfNode, s: Side, off = 0): Pt {
    return s === 'l' ? { x: n.x, y: n.y + n.h / 2 + off } : s === 'r' ? { x: n.x + n.w, y: n.y + n.h / 2 + off } : s === 't' ? { x: n.x + n.w / 2 + off, y: n.y } : { x: n.x + n.w / 2 + off, y: n.y + n.h };
  }
  private pts(e: WfEdge, map: Map<string, WfNode>): Pt[] {
    const a = map.get(e.from), b = map.get(e.to);
    if (!a || !b) return [];
    const p1 = this.port(a, e.fp, e.fo ?? 0);
    const p2 = this.port(b, e.tp);
    const hz = (s: Side) => s === 'l' || s === 'r';
    if (hz(e.fp) && hz(e.tp)) {
      if (Math.abs(p1.y - p2.y) < 1) return [p1, p2];
      const mx = Math.round((p1.x + p2.x) / 2);
      return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    }
    if (!hz(e.fp) && !hz(e.tp)) {
      if (Math.abs(p1.x - p2.x) < 1) return [p1, p2];
      const my = Math.round((p1.y + p2.y) / 2);
      return [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    return hz(e.fp) ? [p1, { x: p2.x, y: p1.y }, p2] : [p1, { x: p1.x, y: p2.y }, p2];
  }
  protected readonly edgeViews = computed(() => {
    const map = new Map(this.nodes().map((n) => [n.id, n]));
    const r = this.run();
    return this.edges().map((e) => {
      const p = this.pts(e, map);
      let best = 0, bl = -1;
      for (let i = 0; i < p.length - 1; i++) {
        const l = Math.abs(p[i + 1].x - p[i].x) + Math.abs(p[i + 1].y - p[i].y);
        if (l > bl) (bl = l), (best = i);
      }
      const a = p[best] ?? { x: 0, y: 0 }, b = p[best + 1] ?? a;
      const horiz = Math.abs(a.y - b.y) < 1;
      const active = !!r && (r.edge === e.id || false);
      return {
        id: e.id, label: e.label, red: !!e.red, active,
        d: p.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' '),
        stroke: e.red ? '#ef4444' : '#3b3f5c',
        marker: active ? 'mk-green' : this.selEdge() === e.id ? 'mk-sel' : e.red ? 'mk-red' : 'mk-grey',
        lx: horiz ? (a.x + b.x) / 2 : a.x + 9, ly: horiz ? a.y - 8 : (a.y + b.y) / 2 + 4, anchor: horiz ? 'middle' : 'start',
      };
    });
  });
  protected outEdges(id: string) {
    return this.edges().filter((e) => e.from === id);
  }
  protected nodeName(id: string) {
    return this.nodes().find((n) => n.id === id)?.name ?? id;
  }
  protected nodeIcon(n: WfNode, solid = false) {
    if (n.type === 'form') return solid ? 'workflow-form' : 'user';
    if (n.type === 'condition') return 'workflow-diamond';
    return NODE_META[n.type].icon;
  }
  protected human(n: WfNode) {
    return n.type === 'approval' || n.type === 'task' || n.type === 'form';
  }
  private toWorld(cx: number, cy: number): Pt {
    const r = this.canvasRef()!.nativeElement.getBoundingClientRect();
    return { x: (cx - r.left - this.panX()) / this.zoom(), y: (cy - r.top - this.panY()) / this.zoom() };
  }

  /* ---------------- history ---------------- */
  private snap() {
    return JSON.stringify({ n: this.nodes(), e: this.edges() });
  }
  private commit() {
    this.undoStack.push(this.snap());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.syncHist();
    this.dirty.set(true);
    this.issues.set(null);
  }
  private restore(s: string) {
    const v = JSON.parse(s);
    this.nodes.set(v.n);
    this.edges.set(v.e);
    if (this.selId() && !v.n.some((n: WfNode) => n.id === this.selId())) this.selId.set(null);
  }
  protected undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snap());
    this.restore(this.undoStack.pop()!);
    this.syncHist();
    this.dirty.set(true);
  }
  protected redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snap());
    this.restore(this.redoStack.pop()!);
    this.syncHist();
  }
  private syncHist() {
    this.undoN.set(this.undoStack.length);
    this.redoN.set(this.redoStack.length);
  }

  /* ---------------- pointer interaction ---------------- */
  protected nodeDown(ev: PointerEvent, n: WfNode) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    this.select(n.id);
    if (this.run()?.running) return;
    this.drag = { id: n.id, sx: ev.clientX, sy: ev.clientY, ox: n.x, oy: n.y, moved: false };
  }
  protected portDown(ev: PointerEvent, n: WfNode) {
    ev.stopPropagation();
    ev.preventDefault();
    const p = this.port(n, 'r');
    this.link.set({ from: n.id, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }
  protected edgeDown(ev: PointerEvent, id: string) {
    ev.stopPropagation();
    this.selEdge.set(id);
    this.selId.set(null);
  }
  protected bgDown(ev: PointerEvent) {
    if (ev.button !== 0) return;
    this.selEdge.set(null);
    this.pan0 = { sx: ev.clientX, sy: ev.clientY, px: this.panX(), py: this.panY() };
  }
  onMove(ev: PointerEvent) {
    const l = this.link();
    if (l) {
      const p = this.toWorld(ev.clientX, ev.clientY);
      this.link.set({ ...l, x2: p.x, y2: p.y });
      return;
    }
    if (this.drag) {
      const d = this.drag;
      const dx = (ev.clientX - d.sx) / this.zoom(), dy = (ev.clientY - d.sy) / this.zoom();
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!d.moved) {
        this.commit();
        d.moved = true;
      }
      const x = Math.max(0, Math.round((d.ox + dx) / 2) * 2), y = Math.max(0, Math.round((d.oy + dy) / 2) * 2);
      this.nodes.update((ns) => ns.map((n) => (n.id === d.id ? { ...n, x, y } : n)));
      return;
    }
    if (this.pan0) {
      this.panX.set(this.pan0.px + ev.clientX - this.pan0.sx);
      this.panY.set(this.pan0.py + ev.clientY - this.pan0.sy);
    }
  }
  onUp(ev: PointerEvent) {
    const l = this.link();
    if (l) {
      this.link.set(null);
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-node]');
      const to = el?.getAttribute('data-node');
      if (to && to !== l.from) this.connect(l.from, to);
    }
    this.drag = null;
    this.pan0 = null;
  }
  onKey(ev: KeyboardEvent) {
    const t = ev.target as HTMLElement;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && !this.run()?.running) {
      if (this.selEdge()) this.deleteEdge(this.selEdge()!);
      else if (this.selId()) this.deleteNode(this.selId()!);
      ev.preventDefault();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) this.redo();
      else this.undo();
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      this.redo();
    } else if (ev.key === 'Escape') {
      if (this.fullscreen()) this.fullscreen.set(false);
      this.menu.set('');
      this.selEdge.set(null);
    }
  }
  closeMenus(ev: MouseEvent) {
    if (!(ev.target as HTMLElement)?.closest?.('.menu-wrap')) {
      this.menu.set('');
      this.rowMenu.set('');
    }
  }
  protected onWheel(ev: WheelEvent) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const r = this.canvasRef()!.nativeElement.getBoundingClientRect();
    this.zoomAt(this.zoom() * (ev.deltaY < 0 ? 1.1 : 0.9), ev.clientX - r.left, ev.clientY - r.top);
  }

  /* ---------------- zoom ---------------- */
  private zoomAt(z: number, cx: number, cy: number) {
    z = Math.min(2, Math.max(0.4, Math.round(z * 100) / 100));
    const k = z / this.zoom();
    this.panX.set(cx - (cx - this.panX()) * k);
    this.panY.set(cy - (cy - this.panY()) * k);
    this.zoom.set(z);
  }
  protected zoomBy(d: number) {
    const r = this.canvasRef()!.nativeElement.getBoundingClientRect();
    this.zoomAt(this.zoom() + d, r.width / 2, r.height / 2);
  }
  protected setZoom(z: number) {
    this.menu.set('');
    this.zoom.set(z);
    this.panX.set(0);
    this.panY.set(0);
  }
  protected fit() {
    this.menu.set('');
    const ns = this.nodes();
    if (!ns.length) return;
    const r = this.canvasRef()!.nativeElement.getBoundingClientRect();
    const x0 = Math.min(...ns.map((n) => n.x)) - 30, y0 = Math.min(...ns.map((n) => n.y)) - 30;
    const x1 = Math.max(...ns.map((n) => n.x + n.w + (n.type === 'end' ? 110 : 0))) + 30, y1 = Math.max(...ns.map((n) => n.y + n.h + (n.type === 'start' ? 30 : 0))) + 30;
    const z = Math.min(1.5, Math.max(0.4, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    this.zoom.set(Math.round(z * 100) / 100);
    this.panX.set((r.width - (x1 - x0) * z) / 2 - x0 * z);
    this.panY.set((r.height - (y1 - y0) * z) / 2 - y0 * z);
  }
  protected toggleFs() {
    this.fullscreen.update((v) => !v);
    setTimeout(() => this.fit(), 30);
  }

  /* ---------------- editing ---------------- */
  protected select(id: string) {
    this.selId.set(id);
    this.selEdge.set(null);
  }
  private newId() {
    return `n${Date.now().toString(36)}${this.seq++}`;
  }
  private freeSpot(x: number, y: number, w: number, h: number) {
    let tries = 0;
    while (tries++ < 20 && this.nodes().some((n) => x < n.x + n.w + 10 && x + w + 10 > n.x && y < n.y + n.h + 10 && y + h + 10 > n.y)) y += h + 24;
    return { x, y };
  }
  protected addNode(t: NodeType, at?: Pt) {
    if (this.run()?.running) return;
    const m = NODE_META[t];
    const base = makeNode('tmp', t, t === 'approval' ? 'New Approval' : m.label, t === 'approval' ? 'Direct Manager' : t === 'start' ? 'Trigger' : t === 'end' ? 'Completed' : m.typeLabel, 0, 0);
    const from = !at ? this.sel() : null;
    let x: number, y: number;
    if (at) {
      x = Math.round(at.x - base.w / 2);
      y = Math.round(at.y - base.h / 2);
    } else if (from) {
      ({ x, y } = this.freeSpot(from.x + from.w + 50, Math.round(from.y + from.h / 2 - base.h / 2), base.w, base.h));
    } else {
      const r = this.canvasRef()!.nativeElement.getBoundingClientRect();
      ({ x, y } = this.freeSpot(Math.round((r.width / 2 - this.panX()) / this.zoom() - base.w / 2), Math.round((r.height / 2 - this.panY()) / this.zoom() - base.h / 2), base.w, base.h));
    }
    this.commit();
    const n: WfNode = { ...base, id: this.newId(), x: Math.max(0, x), y: Math.max(0, y) };
    this.nodes.update((ns) => [...ns, n]);
    if (from && from.type !== 'end' && t !== 'start') this.edges.update((es) => [...es, this.edgeBetween(from, n)]);
    this.select(n.id);
    this.stepTab.set('General');
    this.toastMsg(`${m.label} added${from && from.type !== 'end' ? ' after ' + from.name : ''} · drag to position, ● to connect`);
  }
  private edgeBetween(a: WfNode, b: WfNode): WfEdge {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const [fp, tp]: [Side, Side] = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : dy > 0 ? ['b', 't'] : ['t', 'b'];
    const label = a.type === 'condition' ? (this.outEdges(a.id).length ? 'No' : 'Yes') : undefined;
    return { id: `e${Date.now().toString(36)}${this.seq++}`, from: a.id, to: b.id, fp, tp, label, red: label === 'No' };
  }
  private connect(from: string, to: string) {
    if (this.edges().some((e) => e.from === from && e.to === to)) return this.toastMsg('Those steps are already connected');
    const a = this.nodes().find((n) => n.id === from)!, b = this.nodes().find((n) => n.id === to)!;
    if (b.type === 'start') return this.toastMsg('Start cannot have incoming connections');
    this.commit();
    const e = this.edgeBetween(a, b);
    this.edges.update((es) => [...es, e]);
    this.selEdge.set(e.id);
    this.toastMsg(`Connected ${a.name} → ${b.name}`);
  }
  protected dragStart(ev: DragEvent, t: NodeType) {
    ev.dataTransfer?.setData('text/plain', t);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }
  protected onDrop(ev: DragEvent) {
    ev.preventDefault();
    const t = ev.dataTransfer?.getData('text/plain') as NodeType;
    if (!t || !NODE_META[t]) return;
    this.selId.set(null);
    this.addNode(t, this.toWorld(ev.clientX, ev.clientY));
  }
  protected deleteNode(id: string) {
    const n = this.nodes().find((x) => x.id === id);
    if (!n) return;
    this.commit();
    this.nodes.update((ns) => ns.filter((x) => x.id !== id));
    this.edges.update((es) => es.filter((e) => e.from !== id && e.to !== id));
    this.selId.set(null);
    this.toastMsg(`${n.name} deleted · Ctrl+Z to undo`);
  }
  protected deleteEdge(id: string) {
    this.commit();
    this.edges.update((es) => es.filter((e) => e.id !== id));
    this.selEdge.set(null);
    this.toastMsg('Connection removed · Ctrl+Z to undo');
  }
  protected dupNode(n: WfNode) {
    this.commit();
    const c: WfNode = { ...clone(n), id: this.newId(), name: n.name + ' (copy)', ...this.freeSpot(n.x + 24, n.y + 24, n.w, n.h) };
    this.nodes.update((ns) => [...ns, c]);
    this.select(c.id);
  }
  protected relabel(id: string, label: string) {
    this.commit();
    this.edges.update((es) => es.map((e) => (e.id === id ? { ...e, label: label || undefined, red: /^(no|reject)/i.test(label) } : e)));
  }
  protected recolor(c: string) {
    const id = this.selId();
    this.commit();
    this.nodes.update((ns) => ns.map((n) => (n.id === id ? { ...n, color: c } : n)));
  }
  protected setSub(v: string) {
    const id = this.selId();
    this.commit();
    this.nodes.update((ns) => ns.map((n) => (n.id === id ? { ...n, sub: v } : n)));
  }
  protected setF<K extends keyof CfgForm>(k: K, v: CfgForm[K]) {
    this.form.update((f) => ({ ...f, [k]: v }));
  }
  protected toggleChannel(c: string) {
    this.form.update((f) => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] }));
  }
  protected saveStep() {
    const n = this.sel();
    if (!n) return;
    const { name, ...cfg } = this.form();
    if (!name.trim()) return this.toastMsg('Step name is required');
    this.commit();
    const typeChanged = cfg.approverType !== n.cfg.approverType;
    const assignee = typeChanged && this.human(n) ? cfg.approverType : cfg.assignee;
    this.nodes.update((ns) =>
      ns.map((x) => (x.id !== n.id ? x : {
        ...x, name, title: x.title === x.name ? name : x.title,
        sub: typeChanged && (x.sub === n.cfg.approverType || x.sub === n.cfg.assignee) ? cfg.approverType : x.sub,
        cfg: { ...cfg, assignee },
      })),
    );
    this.toastMsg(`${name} saved · ${cfg.escalation ? 'escalates to ' + cfg.escalateTo + ' after ' + cfg.dueIn + ' ' + cfg.dueUnit.toLowerCase() : 'no escalation'}`);
  }

  /* ---------------- workflow-level ---------------- */
  protected patchWf(p: Partial<Workflow>) {
    this.store.patchWf(this.wf().id, { ...p, updated: 'Just now' });
  }
  protected rename(v: string) {
    if (!this.editingName()) return;
    this.editingName.set(false);
    if (v.trim() && v !== this.wf().name) this.patchWf({ name: v.trim() });
  }
  protected usesConn(usedBy: string[]) {
    const n = this.wf().name.replace(' Workflow', '');
    return usedBy.includes(n) || usedBy.includes('All workflows');
  }
  protected toggleConn(id: string, on: boolean) {
    const n = this.wf().name.replace(' Workflow', '');
    this.store.connectors.update((l) => l.map((c) => (c.id !== id ? c : { ...c, usedBy: on ? [...c.usedBy.filter((x) => x !== n), n] : c.usedBy.filter((x) => x !== n && x !== 'All workflows') })));
  }
  protected togglePerm(r: number, p: number) {
    this.perm.update((m) => m.map((row, i) => (i === r ? row.map((v, j) => (j === p ? !v : v)) : row)));
  }
  protected saveDraft(silent = false) {
    this.store.patchWf(this.wf().id, { nodes: clone(this.nodes()), edges: clone(this.edges()), updated: 'Just now' });
    this.dirty.set(false);
    if (!silent) this.toastMsg(`Draft saved · ${this.nodes().length} steps · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
  }
  protected nextVersion() {
    const m = /v(\d+)\.(\d+)/.exec(this.wf().version);
    return m ? (this.wf().status === 'Draft' && this.wf().version === 'v1.0' ? 'v1.0' : `v${m[1]}.${+m[2] + 1}`) : 'v1.0';
  }
  protected publish() {
    const list = this.validate(false);
    if (list.some((i) => i.level === 'error')) {
      this.showIssues.set(true);
      return this.toastMsg(`Fix ${list.filter((i) => i.level === 'error').length} validation error(s) before publishing`);
    }
    this.publishOpen.set(true);
  }
  protected confirmPublish() {
    const v = this.nextVersion();
    this.saveDraft(true);
    this.store.patchWf(this.wf().id, { status: 'Active', version: v, portal: true });
    this.publishOpen.set(false);
    this.store.pushActivity(`${this.wf().name} ${v} published`, '#22c55e');
    this.toastMsg(`${this.wf().name} ${v} published · live for new requests`);
  }
  protected validate(show: boolean): Issue[] {
    const ns = this.nodes(), es = this.edges();
    const out: Issue[] = [];
    const starts = ns.filter((n) => n.type === 'start');
    if (!starts.length) out.push({ msg: 'Workflow has no Start step', level: 'error' });
    if (starts.length > 1) starts.slice(1).forEach((s) => out.push({ nodeId: s.id, msg: `Only one Start allowed (${s.name})`, level: 'error' }));
    if (!ns.some((n) => n.type === 'end')) out.push({ msg: 'Workflow has no End step', level: 'error' });
    const reach = new Set<string>();
    const q = starts.slice(0, 1).map((s) => s.id);
    while (q.length) {
      const id = q.shift()!;
      if (reach.has(id)) continue;
      reach.add(id);
      es.filter((e) => e.from === id).forEach((e) => q.push(e.to));
    }
    for (const n of ns) {
      const outs = es.filter((e) => e.from === n.id);
      if (n.type !== 'end' && !outs.length) out.push({ nodeId: n.id, msg: `${n.name} has no outgoing connection`, level: 'error' });
      if (n.type !== 'start' && starts.length && !reach.has(n.id)) out.push({ nodeId: n.id, msg: `${n.name} is unreachable from Start`, level: 'error' });
      if (n.type === 'condition' && outs.length < 2) out.push({ nodeId: n.id, msg: `${n.name} needs at least 2 branches`, level: 'error' });
      if (n.type === 'condition' && outs.some((e) => !e.label)) out.push({ nodeId: n.id, msg: `${n.name} has an unlabelled branch`, level: 'warning' });
      if (n.type === 'approval' && (!n.cfg.assignee || n.cfg.assignee === '-')) out.push({ nodeId: n.id, msg: `${n.name} has no approver`, level: 'error' });
      if (n.type === 'approval' && !n.cfg.escalation) out.push({ nodeId: n.id, msg: `${n.name} has no escalation (SLA risk)`, level: 'warning' });
    }
    this.issues.set(out);
    if (show) {
      this.showIssues.set(true);
      this.toastMsg(out.length ? `${out.filter((i) => i.level === 'error').length} error(s), ${out.filter((i) => i.level === 'warning').length} warning(s)` : 'Validation passed · ready to publish');
    }
    return out;
  }

  /* ---------------- test run ---------------- */
  protected openTest() {
    const ch: Record<string, string> = {};
    this.decisionNodes().forEach((c) => (ch[c.id] = this.outEdges(c.id)[0]?.label ?? this.outEdges(c.id)[0]?.id ?? ''));
    this.testChoice.set(ch);
    this.testOpen.set(true);
  }
  protected choose(id: string, v: string) {
    this.testChoice.update((c) => ({ ...c, [id]: v }));
  }
  protected stopRun() {
    this.runToken++;
    this.token.set(null);
    this.run.update((r) => (r ? { ...r, running: false, active: null, edge: null, outcome: 'Test stopped' } : r));
  }
  protected async startRun() {
    this.testOpen.set(false);
    const errs = this.validate(false).filter((i) => i.level === 'error');
    if (errs.length) {
      this.showIssues.set(true);
      return this.toastMsg('Fix validation errors before testing');
    }
    this.showIssues.set(false);
    const prevSel = this.selId();
    this.selId.set(null);
    const my = ++this.runToken;
    const ns = new Map(this.nodes().map((n) => [n.id, n]));
    const choice = this.testChoice();
    const visits: Record<string, number> = {};
    const t0 = performance.now();
    const stamp = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;
    const log = (text: string) => {
      this.run.update((r) => (r ? { ...r, log: [...r.log, { t: stamp(), text }] } : r));
      setTimeout(() => {
        const ol = this.host.nativeElement.querySelector('.runbar ol');
        if (ol) ol.scrollLeft = ol.scrollWidth;
      }, 30);
    };
    this.run.set({ running: true, active: null, done: [], edge: null, log: [], outcome: '' });
    let cur = this.nodes().find((n) => n.type === 'start')!;
    let rejected = false;
    for (let guard = 0; guard < 40 && cur; guard++) {
      visits[cur.id] = (visits[cur.id] ?? 0) + 1;
      this.run.update((r) => r && { ...r, active: cur.id });
      log(this.describe(cur));
      await sleep(cur.type === 'approval' || cur.type === 'form' ? 750 : 520);
      if (my !== this.runToken) return;
      this.run.update((r) => r && { ...r, done: [...r.done, cur.id] });
      if (cur.type === 'end') break;
      const outs = this.edges().filter((e) => e.from === cur.id);
      let e = outs[0];
      if (outs.length > 1) {
        const want = choice[cur.id];
        e = outs.find((o) => (o.label ?? o.id) === want && (visits[cur.id] ?? 0) < 2) ?? outs.find((o) => !visits[o.to]) ?? outs[0];
      }
      if (!e) break;
      if (e.red) rejected = true;
      this.run.update((r) => r && { ...r, active: null, edge: e.id });
      await this.animateEdge(e, ns, my);
      if (my !== this.runToken) return;
      cur = ns.get(e.to)!;
    }
    this.token.set(null);
    const steps = this.run()?.done.length ?? 0;
    const outcome = `${rejected ? 'Rejected path' : 'Approved path'} completed · ${steps} steps · ${stamp()}`;
    this.run.update((r) => r && { ...r, running: false, active: null, edge: null, outcome });
    const inst = this.store.addInstance(this.wf(), this.testWho(), { test: true, summary: 'Test run from Designer', mine: false });
    this.store.patchInst(inst.id, { status: rejected ? 'Rejected' : 'Approved', stepIdx: rejected ? 1 : inst.steps.length, endedAt: inst.startedAt + 60_000, assignee: '-', workflow: inst.workflow + ' (Test)' });
    this.selId.set(prevSel);
    this.toastMsg(`Test run finished · logged as ${inst.id}`);
  }
  private describe(n: WfNode) {
    switch (n.type) {
      case 'start': return `Triggered by ${this.testWho()} — ${n.sub}`;
      case 'form': return `${n.name}: form submitted by ${this.testWho()}`;
      case 'approval': return `${n.name}: assigned to ${n.cfg.assignee} → auto-approved (test)`;
      case 'condition': return `${n.name}: evaluated → “${this.testChoice()[n.id] ?? 'default'}”`;
      case 'notification': return `${n.name}: ${n.cfg.channels.join(' + ')} sent to ${n.sub.replace('Notify ', '')}`;
      case 'update': return `${n.name}: ${n.sub} updated`;
      case 'integration': return `${n.name}: ${n.cfg.connector || 'connector'} call 200 OK`;
      case 'delay': return `${n.name}: waited ${n.cfg.dueIn} ${n.cfg.dueUnit.toLowerCase()} (skipped in test)`;
      case 'end': return `End — ${n.sub}`;
      default: return `${n.name} completed`;
    }
  }
  private animateEdge(e: WfEdge, ns: Map<string, WfNode>, my: number) {
    const p = this.pts(e, ns);
    const segs = p.slice(1).map((q, i) => Math.abs(q.x - p[i].x) + Math.abs(q.y - p[i].y));
    const total = segs.reduce((a, b) => a + b, 0) || 1;
    const dur = Math.min(900, Math.max(380, total * 2.4));
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (my !== this.runToken) return resolve();
        const k = Math.min(1, (now - t0) / dur);
        let d = k * total, i = 0;
        while (i < segs.length - 1 && d > segs[i]) d -= segs[i++];
        const a = p[i], b = p[i + 1], f = segs[i] ? d / segs[i] : 1;
        this.token.set({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------------- header actions ---------------- */
  protected openNew() {
    this.nw.set({ name: '', module: MODULES[0], category: CATEGORIES[1], from: '' });
    this.nwErr.set('');
    this.newOpen.set(true);
  }
  protected createNew() {
    const v = this.nw();
    if (!v.name.trim()) return this.nwErr.set('Workflow name is required.');
    const w = this.store.blank(v.name.trim(), v.module, v.category);
    if (v.from) {
      const src = this.store.workflows().find((x) => x.id === v.from)!;
      Object.assign(w, { nodes: clone(src.nodes), edges: clone(src.edges), description: src.description });
    }
    this.store.addWorkflow(w);
    this.newOpen.set(false);
    setTimeout(() => this.fit(), 30);
    this.toastMsg(`${w.name} created as Draft ${w.version}`);
  }
  protected useTemplate(id: string) {
    this.menu.set('');
    const src = this.store.workflows().find((x) => x.id === id)!;
    const w = this.store.blank(`${src.name.replace(' Workflow', '')} (Copy)`, src.module, src.category);
    Object.assign(w, { nodes: clone(src.nodes), edges: clone(src.edges), description: src.description, icon: src.icon });
    this.store.addWorkflow(w);
    setTimeout(() => this.fit(), 30);
    this.toastMsg(`Template “${src.name.replace(' Workflow', '')}” loaded as a new draft`);
  }
  protected duplicateWf() {
    this.menu.set('');
    const src = this.wf();
    const w = { ...clone(src), id: this.store.nextWfId(), name: src.name + ' (Copy)', status: 'Draft' as const, version: 'v0.1', updated: 'Just now', nodes: clone(this.nodes()), edges: clone(this.edges()) };
    this.store.addWorkflow(w);
    this.toastMsg(`Duplicated as ${w.name}`);
  }
  protected exportJson() {
    this.menu.set('');
    const blob = new Blob([JSON.stringify({ ...this.wf(), nodes: this.nodes(), edges: this.edges() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.wf().name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  protected exportSteps() {
    this.menu.set('');
    downloadCsv('workflow-steps.csv', [['#', 'Step Name', 'Type', 'Assigned To', 'Conditions', 'Due', 'Escalation'], ...this.nodes().map((n, i) => [i + 1, n.name, NODE_META[n.type].typeLabel, n.cfg.assignee, n.cfg.conditions, `${n.cfg.dueIn} ${n.cfg.dueUnit}`, n.cfg.escalation ? n.cfg.escalateTo : '-'])]);
  }
  protected resetDemo() {
    this.menu.set('');
    this.store.reset();
    this.loadedId = '';
    this.load(this.store.current());
    this.toastMsg('Demo data reset');
  }
  protected go(p: string) {
    this.menu.set('');
    this.router.navigate(['/workflow-automation', p]);
  }
  protected statusCls(s: string) {
    return s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : s === 'In Progress' ? 'blue' : 'grey';
  }
  protected readonly instStatus = instStatus;
  protected readonly tagCls = statusTagCls;
  protected dd(v: string) {
    const d = new Date(v + 'T00:00');
    return isNaN(+d) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  protected pick(ev: Event) {
    try {
      (ev.target as HTMLInputElement).showPicker?.();
    } catch {
      /* not supported */
    }
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
