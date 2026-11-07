import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv, rng } from '../dashboards/demo-data';
import { WfToggle } from './workflow-shared';
import { toast } from './workflow-pages-a';
import { ACTIONS, Connector, currentStep, FIELDS, MODULES, OPS, Rule, statusTagCls, SYNC_LOGS, TRIGGERS, WorkflowStore } from './workflow.data';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/* =========================================================================
   Automation Rules — WHEN / IF / THEN builder
   ========================================================================= */
@Component({
  selector: 'app-workflow-automation-rules',
  imports: [...UI, WfToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Automation Rules" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="No-code rules that react to people events — auto-approve, route, escalate, notify or start workflows.">
      <button class="btn-primary" (click)="newRule()"><app-icon name="plus" [size]="16" />New Rule</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Rules" [value]="active()" icon="workflow-bolt" color="#7c3aed" [sub]="store.rules().length + ' rules total'" />
      <app-kpi label="Executions (30 days)" [value]="runs().toLocaleString()" icon="activity" color="#3b82f6" change="12%" sub="vs. previous 30 days" />
      <app-kpi label="Success Rate" [value]="success() + '%'" icon="shield-check" color="#22c55e" change="0.4%" sub="vs. previous 30 days" />
      <app-kpi label="Manual Work Saved" [value]="saved() + ' h'" icon="workflow-timer" color="#f59e0b" sub="≈ 3 min per execution" />
    </section>

    <section class="ar">
      <div class="card rl">
        <div class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search rules..." [value]="q()" (input)="q.set($any($event.target).value)" /></div>
        <ul>
          @for (r of filtered(); track r.id) {
            <li [class.on]="selId() === r.id" (click)="pick(r.id)">
              <span class="ric" [class.off]="!r.enabled"><app-icon name="workflow-bolt" [size]="16" /></span>
              <div><b>{{ r.name }}</b><small>{{ r.trigger }} · {{ r.runs.toLocaleString() }} runs</small></div>
              <app-wf-toggle [on]="r.enabled" (changed)="setEnabled(r.id, $event)" (click)="$event.stopPropagation()" />
            </li>
          }
        </ul>
      </div>

      @if (draft(); as d) {
        <div class="card builder">
          <div class="bh">
            <input class="input title" [value]="d.name" (input)="patch({ name: $any($event.target).value })" />
            <span [class]="d.enabled ? 'tag green' : 'tag grey'">{{ d.enabled ? 'Enabled' : 'Disabled' }}</span>
            <span class="muted sm">{{ d.id }} · owner {{ d.owner }} · last run {{ d.lastRun }}</span>
          </div>

          <div class="blk when"><span class="kw">WHEN</span>
            <select class="input" [value]="d.trigger" (change)="patch({ trigger: $any($event.target).value })">@for (t of triggers; track t) {<option>{{ t }}</option>}</select>
            <span class="muted">in</span>
            <select class="input" [value]="d.module" (change)="patch({ module: $any($event.target).value })">@for (m of modules; track m) {<option>{{ m }}</option>}<option>Workflow &amp; Automation</option></select>
          </div>

          <div class="blk"><span class="kw if">IF</span>
            <span class="muted">match</span>
            <div class="seg"><button [class.on]="d.match === 'All'" (click)="patch({ match: 'All' })">ALL</button><button [class.on]="d.match === 'Any'" (click)="patch({ match: 'Any' })">ANY</button></div>
            <span class="muted">of these conditions</span>
          </div>
          @for (c of d.conds; track $index; let k = $index) {
            <div class="row">
              <span class="join">{{ k ? (d.match === 'All' ? 'AND' : 'OR') : '' }}</span>
              <select class="input" [value]="c.field" (change)="setCond(k, 'field', $any($event.target).value)">@for (f of fields; track f) {<option>{{ f }}</option>}</select>
              <select class="input" [value]="c.op" (change)="setCond(k, 'op', $any($event.target).value)">@for (o of ops; track o) {<option>{{ o }}</option>}</select>
              <input class="input" [value]="c.value" (input)="setCond(k, 'value', $any($event.target).value)" />
              <button class="ib" (click)="rmCond(k)" title="Remove"><app-icon name="workflow-trash" [size]="15" /></button>
            </div>
          }
          <button class="link add" (click)="addCond()">+ Add condition</button>

          <div class="blk"><span class="kw then">THEN</span><span class="muted">run these actions in order</span></div>
          @for (a of d.actions; track $index; let k = $index) {
            <div class="row act">
              <span class="join num">{{ k + 1 }}</span>
              <select class="input" [value]="a.type" (change)="setAct(k, 'type', $any($event.target).value)">@for (x of actions; track x) {<option>{{ x }}</option>}</select>
              <input class="input" [value]="a.target" (input)="setAct(k, 'target', $any($event.target).value)" />
              <button class="ib" (click)="rmAct(k)" title="Remove"><app-icon name="workflow-trash" [size]="15" /></button>
            </div>
          }
          <button class="link add" (click)="addAct()">+ Add action</button>

          <div class="summary"><app-icon name="lightbulb" [size]="16" /><span>{{ sentence() }}</span></div>

          <div class="foot">
            <button class="btn-ghost danger" (click)="remove()"><app-icon name="workflow-trash" [size]="15" />Delete</button>
            <button class="btn-ghost" (click)="duplicate()"><app-icon name="workflow-copy" [size]="15" />Duplicate</button>
            <span class="sp"></span>
            <button class="btn-ghost" (click)="test()"><app-icon name="workflow-play" [size]="15" />Test with sample</button>
            <button class="btn-primary" (click)="save()">Save Rule</button>
          </div>

          @if (testRes(); as t) {
            <div class="test" [class.miss]="!t.match">
              <b>{{ t.match ? '✓ Rule would fire' : '✕ Rule would not fire' }}</b> on sample “{{ t.sample }}”
              <ul>@for (l of t.lines; track $index) {<li>{{ l }}</li>}</ul>
            </div>
          }

          <h4>Recent executions</h4>
          <table class="table">
            <thead><tr><th>Time</th><th>Record</th><th>Result</th><th class="num">Duration</th></tr></thead>
            <tbody>@for (h of history(); track $index) {<tr><td>{{ h.at }}</td><td>{{ h.rec }}</td><td><span [class]="tag(h.res)">{{ h.res }}</span></td><td class="num">{{ h.ms }} ms</td></tr>}</tbody>
          </table>
        </div>
      }
    </section>
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .ar { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 12px; align-items: start; }
    .rl { display: flex; flex-direction: column; gap: 10px; } .rl ul { list-style: none; margin: 0; padding: 0; }
    .rl li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 10px 8px; border-radius: 8px; cursor: pointer; border-bottom: 1px solid #f0f1f6; }
    .rl li:hover { background: #faf8ff; } .rl li.on { background: #f3efff; box-shadow: inset 3px 0 0 var(--primary); }
    .rl li div { display: flex; flex-direction: column; min-width: 0; font-size: 12.5px; } .rl small { color: var(--muted); font-size: 11px; }
    .ric { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: #ede9fe; color: #7c3aed; } .ric.off { background: #eef0f5; color: #94a3b8; }
    .builder { display: flex; flex-direction: column; gap: 10px; }
    .bh { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .title { font-size: 16px; font-weight: 600; flex: 1; min-width: 260px; } .sm { font-size: 11.5px; }
    .blk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px; font-size: 13px; }
    .kw { padding: 4px 12px; border-radius: 6px; font-weight: 800; font-size: 12px; letter-spacing: .5px; background: #dbeafe; color: #1d4ed8; }
    .kw.if { background: #fef3c7; color: #b45309; } .kw.then { background: #dcfce7; color: #15803d; }
    .blk .input { min-width: 220px; }
    .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; } .seg button { border: 0; background: #fff; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; } .seg button.on { background: var(--primary); color: #fff; }
    .row { display: grid; grid-template-columns: 44px 1fr 150px 1fr 30px; gap: 8px; align-items: center; } .row.act { grid-template-columns: 44px 1fr 1.3fr 30px; }
    .join { font-size: 11px; font-weight: 700; color: #b45309; text-align: center; } .join.num { color: #15803d; }
    .ib { border: 0; background: none; cursor: pointer; color: #6b7090; } .ib:hover { color: var(--red); }
    .add { border: 0; background: none; cursor: pointer; text-align: left; padding: 0 0 0 52px; }
    .summary { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; background: #f5f3ff; border-radius: 8px; font-size: 12.5px; color: #4c1d95; }
    .foot { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .sp { flex: 1; } .danger { color: var(--red); }
    .test { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; color: #166534; } .test.miss { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .test ul { margin: 6px 0 0; padding-left: 18px; }
    h4 { margin: 8px 0 0; font-size: 13px; }
    @media (max-width: 1100px) { .ar { grid-template-columns: 1fr; } }
  `,
})
export class AutomationRules {
  protected readonly store = inject(WorkflowStore);
  protected readonly triggers = TRIGGERS;
  protected readonly modules = MODULES;
  protected readonly fields = FIELDS;
  protected readonly ops = OPS;
  protected readonly actions = ACTIONS;
  protected readonly tag = statusTagCls;
  protected readonly q = signal('');
  protected readonly selId = signal('R-101');
  protected readonly draft = signal<Rule | null>(clone(this.store.rules()[0]));
  protected readonly testRes = signal<{ match: boolean; sample: string; lines: string[] } | null>(null);
  protected readonly toastS = signal<string | null>(null);

  protected readonly filtered = computed(() => this.store.rules().filter((r) => !this.q() || r.name.toLowerCase().includes(this.q().toLowerCase())));
  protected readonly active = computed(() => this.store.rules().filter((r) => r.enabled).length);
  protected readonly runs = computed(() => this.store.rules().reduce((a, r) => a + r.runs, 0));
  protected readonly success = computed(() => {
    const rs = this.store.rules().filter((r) => r.runs);
    return (rs.reduce((a, r) => a + r.success * r.runs, 0) / Math.max(1, this.runs())).toFixed(1);
  });
  protected readonly saved = computed(() => Math.round((this.runs() * 3) / 60));
  protected readonly sentence = computed(() => {
    const d = this.draft();
    if (!d) return '';
    const c = d.conds.map((x) => `${x.field.toLowerCase()} ${x.op} ${x.value}`).join(d.match === 'All' ? ' and ' : ' or ');
    return `When “${d.trigger}”${c ? ', if ' + c : ''}, then ${d.actions.map((a) => `${a.type.toLowerCase()} ${a.target}`).join(', then ') || 'do nothing'}.`;
  });
  protected readonly history = computed(() => {
    const d = this.draft();
    if (!d) return [];
    const r = rng(d.id.charCodeAt(4) * 7);
    const recs = this.store.instances().slice(0, 40);
    return Array.from({ length: d.runs ? 6 : 0 }, (_, i) => ({ at: `${10 - Math.floor(i / 2)}:${String(Math.floor(r() * 59)).padStart(2, '0')} AM`, rec: recs[Math.floor(r() * recs.length)].id, res: r() * 100 < d.success ? 'Success' : 'Failed', ms: Math.floor(40 + r() * 400) }));
  });

  protected pick(id: string) {
    this.selId.set(id);
    this.draft.set(clone(this.store.rules().find((r) => r.id === id)!));
    this.testRes.set(null);
  }
  protected patch(p: Partial<Rule>) {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }
  protected setCond(k: number, key: 'field' | 'op' | 'value', v: string) {
    this.draft.update((d) => d && { ...d, conds: d.conds.map((c, i) => (i === k ? { ...c, [key]: v } : c)) });
  }
  protected addCond() {
    this.draft.update((d) => d && { ...d, conds: [...d.conds, { field: 'Department', op: 'equals', value: 'Operations' }] });
  }
  protected rmCond(k: number) {
    this.draft.update((d) => d && { ...d, conds: d.conds.filter((_, i) => i !== k) });
  }
  protected setAct(k: number, key: 'type' | 'target', v: string) {
    this.draft.update((d) => d && { ...d, actions: d.actions.map((c, i) => (i === k ? { ...c, [key]: v } : c)) });
  }
  protected addAct() {
    this.draft.update((d) => d && { ...d, actions: [...d.actions, { type: 'Send notification', target: 'Requester' }] });
  }
  protected rmAct(k: number) {
    this.draft.update((d) => d && { ...d, actions: d.actions.filter((_, i) => i !== k) });
  }
  protected setEnabled(id: string, on: boolean) {
    this.store.rules.update((l) => l.map((r) => (r.id === id ? { ...r, enabled: on } : r)));
    if (this.draft()?.id === id) this.patch({ enabled: on });
    toast(this.toastS, `Rule ${on ? 'enabled' : 'disabled'}`);
  }
  protected save() {
    const d = this.draft()!;
    if (!d.name.trim()) return toast(this.toastS, 'Rule name is required');
    if (!d.actions.length) return toast(this.toastS, 'Add at least one action');
    const exists = this.store.rules().some((r) => r.id === d.id);
    this.store.rules.update((l) => (exists ? l.map((r) => (r.id === d.id ? clone(d) : r)) : [clone(d), ...l]));
    this.selId.set(d.id);
    toast(this.toastS, `${d.name} saved`);
  }
  protected newRule() {
    const id = `R-${111 + this.store.rules().length}`;
    const r: Rule = { id, name: 'New automation rule', enabled: true, module: MODULES[0], trigger: TRIGGERS[0], match: 'All', conds: [{ field: 'Leave type', op: 'equals', value: 'Annual' }], actions: [{ type: 'Send notification', target: 'Manager' }], runs: 0, success: 0, lastRun: 'Never', owner: 'Rex Kumar' };
    this.store.rules.update((l) => [r, ...l]);
    this.pick(id);
  }
  protected duplicate() {
    const d = this.draft()!;
    const id = `R-${111 + this.store.rules().length}`;
    this.store.rules.update((l) => [{ ...clone(d), id, name: d.name + ' (copy)', runs: 0, lastRun: 'Never', enabled: false }, ...l]);
    this.pick(id);
    toast(this.toastS, 'Rule duplicated (disabled)');
  }
  protected remove() {
    const d = this.draft()!;
    this.store.rules.update((l) => l.filter((r) => r.id !== d.id));
    const first = this.store.rules()[0];
    if (first) this.pick(first.id);
    else this.draft.set(null);
    toast(this.toastS, `${d.name} deleted`);
  }
  protected test() {
    const d = this.draft()!;
    const sample: Record<string, string> = { 'Leave type': 'Casual', 'Days requested': '1', Department: 'Finance', 'Employee grade': 'G7', Site: 'Head Office', Amount: '1200', Hours: '5', Severity: 'High', 'Days to expiry': '21', 'Pending hours': '52', 'Employment type': 'Full-time', 'Manager on leave': 'Yes' };
    const evalC = (f: string, op: string, v: string) => {
      const s = sample[f] ?? '';
      const n = +s, m = +v;
      return op === 'equals' ? s.toLowerCase() === v.toLowerCase() : op === 'not equals' ? s.toLowerCase() !== v.toLowerCase() : op === 'greater than' ? n > m : op === 'less than' ? n < m : op === 'contains' ? s.toLowerCase().includes(v.toLowerCase()) : op === 'is any of' ? v.toLowerCase().split(',').map((x) => x.trim()).includes(s.toLowerCase()) : s === 'Yes';
    };
    const res = d.conds.map((c) => ({ c, ok: evalC(c.field, c.op, c.value) }));
    const match = d.match === 'All' ? res.every((r) => r.ok) : res.some((r) => r.ok);
    this.testRes.set({ match, sample: 'WF-00123 · Ahmed Hassan · Finance', lines: [...res.map((r) => `${r.ok ? '✓' : '✕'} ${r.c.field} (${sample[r.c.field] ?? '—'}) ${r.c.op} ${r.c.value}`), ...(match ? d.actions.map((a, i) => `${i + 1}. ${a.type} → ${a.target}`) : [])] });
  }
  protected exportCsv() {
    downloadCsv('automation-rules.csv', [['ID', 'Name', 'Enabled', 'Trigger', 'Conditions', 'Actions', 'Runs', 'Success %'], ...this.store.rules().map((r) => [r.id, r.name, r.enabled ? 'Yes' : 'No', r.trigger, r.conds.map((c) => `${c.field} ${c.op} ${c.value}`).join(` ${r.match === 'All' ? 'AND' : 'OR'} `), r.actions.map((a) => `${a.type}: ${a.target}`).join('; '), r.runs, r.success])]);
  }
}

/* =========================================================================
   Integrations & Connectors
   ========================================================================= */
const CONN_CATS = ['All', 'HRIS', 'Payroll', 'Identity', 'Calendar', 'Collaboration', 'Messaging', 'ITSM', 'Custom'];

@Component({
  selector: 'app-workflow-integrations-connectors',
  imports: [...UI, WfToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Integrations &amp; Connectors" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="Connect workflows to HRIS, payroll, identity, calendar and messaging systems.">
      <button class="btn-primary" (click)="addOpen.set(true)"><app-icon name="plus" [size]="16" />Add Connector</button>
      <button class="btn-ghost" (click)="syncAll()"><app-icon name="refresh" [size]="16" />Sync all</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Connected" [value]="cnt('Connected')" icon="workflow-link" color="#22c55e" [sub]="store.connectors().length + ' available'" />
      <app-kpi label="API Calls (24 h)" [value]="calls().toLocaleString()" icon="activity" color="#3b82f6" change="6%" sub="vs. yesterday" />
      <app-kpi label="Error Rate" [value]="errRate() + '%'" icon="triangle-alert" color="#ef4444" [sub]="errors() + ' failed calls'" [subColor]="'#dc2626'" />
      <app-kpi label="Needs Attention" [value]="cnt('Error') + cnt('Paused')" icon="plug" color="#f59e0b" sub="error or paused" />
    </section>

    <div class="bar">
      <nav class="tabs">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</nav>
      <div class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search connectors..." [value]="q()" (input)="q.set($any($event.target).value)" /></div>
    </div>

    <section class="grid">
      @for (c of list(); track c.id) {
        <div class="card cc" [class.err]="c.status === 'Error'">
          <div class="ch"><span class="lg" [style.background]="c.color">{{ c.logo }}</span><div><b>{{ c.name }}</b><small>{{ c.vendor }} · {{ c.category }}</small></div>
            <app-wf-toggle [on]="c.status === 'Connected' || c.status === 'Error'" (changed)="toggle(c, $event)" /></div>
          <div class="st"><span [class]="tag(c.status)">{{ c.status }}</span><small>Last sync {{ c.lastSync }}</small></div>
          <app-sparkline [values]="c.trend" [color]="c.status === 'Error' ? '#ef4444' : c.color" />
          <div class="nums"><span><b>{{ c.calls24h.toLocaleString() }}</b> calls</span><span [class.bad]="c.errors24h > 20"><b>{{ c.errors24h }}</b> errors</span><span><b>{{ c.usedBy.length }}</b> workflows</span></div>
          <div class="cb"><button class="btn-ghost sm" (click)="openCfg(c)">Configure</button><button class="btn-ghost sm" [disabled]="c.status !== 'Connected' && c.status !== 'Error'" (click)="sync(c)">Sync now</button></div>
        </div>
      }
    </section>

    <section class="card logs">
      <div class="card-head"><h3>Sync Logs &amp; Monitoring</h3>
        <div class="tabs">@for (s of ['All', 'Success', 'Failed', 'Retrying']; track s) {<button [class.on]="logF() === s" (click)="logF.set(s)">{{ s }}</button>}</div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Time</th><th>Connector</th><th>Operation</th><th class="num">Records</th><th class="num">Latency</th><th>Status</th></tr></thead>
        <tbody>@for (l of logs(); track $index) {<tr><td>{{ l.at }}</td><td>{{ l.connector }}</td><td><code>{{ l.op }}</code></td><td class="num">{{ l.records }}</td><td class="num">{{ l.ms }} ms</td><td><span [class]="tag(l.status)">{{ l.status }}</span></td></tr>}</tbody>
      </table></div>
    </section>

    @if (cfg(); as c) {
      <div class="g-overlay" (click)="cfg.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div class="ch"><span class="lg" [style.background]="c.color">{{ c.logo }}</span><div><h3>{{ c.name }}</h3><small class="muted">{{ c.vendor }} · {{ c.category }}</small></div></div><button class="close-btn" (click)="cfg.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Endpoint<input class="input" [value]="c.endpoint" (change)="cfgPatch({ endpoint: $any($event.target).value })" /></label>
          <label>Authentication<select class="select" [value]="c.auth" (change)="cfgPatch({ auth: $any($event.target).value })"><option>{{ c.auth }}</option><option>OAuth 2.0</option><option>API key</option><option>Basic + mTLS</option><option>HMAC signature</option></select></label>
          <label>Client secret<input class="input" type="password" value="••••••••••••" /></label>
          <label>Sync schedule<select class="select"><option>Every 5 minutes</option><option>Hourly</option><option>Nightly 02:00</option><option>Event driven</option></select></label>
          <label>Retry policy<select class="select"><option>3 retries, exponential</option><option>5 retries</option><option>No retry</option></select></label>
        </div>
        <h4>Used by workflows</h4>
        <div class="chips">@for (u of c.usedBy; track u) {<span class="chip">{{ u }}</span>} @empty {<span class="muted">Not used yet</span>}</div>
        <div class="tc">
          <button class="btn-ghost" [disabled]="testing()" (click)="testConn(c)"><app-icon name="workflow-link" [size]="15" />{{ testing() ? 'Testing…' : 'Test connection' }}</button>
          @if (testMsg()) {<span [class]="testOk() ? 'ok' : 'ko'">{{ testMsg() }}</span>}
        </div>
        <div class="form-actions"><button class="btn-ghost danger" (click)="disconnect(c)">Disconnect</button><button class="btn-primary" (click)="saveCfg()">Save</button></div>
      </aside>
    }
    @if (addOpen()) {
      <div class="g-overlay" (click)="addOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Add connector</h3><button class="close-btn" (click)="addOpen.set(false)">×</button></div>
        <p class="muted">Pick a disconnected connector to set up, or create a custom webhook.</p>
        <div class="pick">
          @for (c of disconnected(); track c.id) {<button (click)="addOpen.set(false); openCfg(c)"><span class="lg" [style.background]="c.color">{{ c.logo }}</span>{{ c.name }}</button>}
          <button (click)="custom()"><span class="lg" style="background:#0f766e">{{ '{ }' }}</span>Custom webhook</button>
        </div>
      </div>
    }
    @if (toastS()) {<div class="g-toast">{{ toastS() }}</div>}
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; } .bar .search-box { width: 260px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .cc { display: flex; flex-direction: column; gap: 8px; } .cc.err { border-color: #fecaca; }
    .ch { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; } .ch div { display: flex; flex-direction: column; font-size: 13px; } .ch small { color: var(--muted); font-size: 11px; }
    .lg { width: 38px; height: 38px; border-radius: 9px; color: #fff; display: inline-grid; place-items: center; font-size: 11px; font-weight: 800; flex-shrink: 0; }
    .st { display: flex; justify-content: space-between; align-items: center; } .st small { color: var(--muted); font-size: 11px; }
    .nums { display: flex; justify-content: space-between; font-size: 11.5px; color: #4b4f6b; } .bad { color: var(--red); }
    .cb { display: flex; gap: 6px; }
    code { font-size: 11px; background: #f5f5fb; padding: 1px 5px; border-radius: 4px; }
    .logs .table-wrap { max-height: 380px; }
    h4 { margin: 16px 0 6px; font-size: 13px; } .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .tc { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 12.5px; } .ok { color: #15803d; } .ko { color: #b91c1c; }
    .danger { color: var(--red); }
    .pick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .pick button { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; font-size: 12.5px; text-align: left; }
    .pick button:hover { border-color: #c4b5fd; }
  `,
})
export class IntegrationsConnectors {
  protected readonly store = inject(WorkflowStore);
  protected readonly cats = CONN_CATS;
  protected readonly tag = statusTagCls;
  protected readonly cat = signal('All');
  protected readonly q = signal('');
  protected readonly logF = signal('All');
  protected readonly cfg = signal<Connector | null>(null);
  protected readonly testing = signal(false);
  protected readonly testMsg = signal('');
  protected readonly testOk = signal(true);
  protected readonly addOpen = signal(false);
  protected readonly toastS = signal<string | null>(null);
  private readonly extraLogs = signal<typeof SYNC_LOGS>([]);

  protected readonly list = computed(() => this.store.connectors().filter((c) => (this.cat() === 'All' || c.category === this.cat()) && (!this.q() || c.name.toLowerCase().includes(this.q().toLowerCase()))));
  protected readonly calls = computed(() => this.store.connectors().reduce((a, c) => a + c.calls24h, 0));
  protected readonly errors = computed(() => this.store.connectors().reduce((a, c) => a + c.errors24h, 0));
  protected readonly errRate = computed(() => ((this.errors() / Math.max(1, this.calls())) * 100).toFixed(2));
  protected readonly logs = computed(() => [...this.extraLogs(), ...SYNC_LOGS].filter((l) => this.logF() === 'All' || l.status === this.logF()));
  protected readonly disconnected = computed(() => this.store.connectors().filter((c) => c.status === 'Not Connected' || c.status === 'Paused'));
  protected cnt(s: string) {
    return this.store.connectors().filter((c) => c.status === s).length;
  }
  private patch(id: string, p: Partial<Connector>) {
    this.store.connectors.update((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  protected toggle(c: Connector, on: boolean) {
    this.patch(c.id, { status: on ? 'Connected' : 'Paused', lastSync: on ? 'Just now' : c.lastSync });
    toast(this.toastS, `${c.name} ${on ? 'connected' : 'paused'}`);
  }
  protected sync(c: Connector) {
    const n = 20 + (c.calls24h % 180);
    this.patch(c.id, { lastSync: 'Just now', calls24h: c.calls24h + 1, status: c.status === 'Error' ? 'Error' : 'Connected' });
    const at = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.extraLogs.update((l) => [{ at, connector: c.name, op: 'Manual sync', records: n, ms: 240, status: c.status === 'Error' ? 'Failed' : 'Success' }, ...l]);
    toast(this.toastS, c.status === 'Error' ? `${c.name}: sync failed (401 Unauthorized) — re-authenticate` : `${c.name} synced · ${n} records`);
  }
  protected syncAll() {
    this.store.connectors().filter((c) => c.status === 'Connected').forEach((c) => this.sync(c));
    toast(this.toastS, `${this.cnt('Connected')} connectors synced`);
  }
  protected openCfg(c: Connector) {
    this.cfg.set({ ...c });
    this.testMsg.set('');
  }
  protected cfgPatch(p: Partial<Connector>) {
    this.cfg.update((c) => c && { ...c, ...p });
  }
  protected testConn(c: Connector) {
    this.testing.set(true);
    this.testMsg.set('');
    setTimeout(() => {
      this.testing.set(false);
      const ok = c.id !== 'C4' || c.auth !== 'Basic + mTLS';
      this.testOk.set(ok);
      this.testMsg.set(ok ? `✓ Connected · ${120 + (c.calls24h % 200)} ms · scopes OK` : '✕ 401 Unauthorized — certificate expired 02 Oct 2026');
    }, 1200);
  }
  protected saveCfg() {
    const c = this.cfg()!;
    const wasOff = c.status === 'Not Connected' || c.status === 'Paused';
    this.patch(c.id, { endpoint: c.endpoint, auth: c.auth, status: c.id === 'C4' && c.auth === 'Basic + mTLS' ? 'Error' : 'Connected', lastSync: 'Just now' });
    this.cfg.set(null);
    toast(this.toastS, `${c.name} ${wasOff ? 'connected' : 'settings saved'}`);
  }
  protected disconnect(c: Connector) {
    this.patch(c.id, { status: 'Not Connected', calls24h: 0, errors24h: 0, lastSync: '—' });
    this.cfg.set(null);
    toast(this.toastS, `${c.name} disconnected`);
  }
  protected custom() {
    this.addOpen.set(false);
    const id = `C${this.store.connectors().length + 1}`;
    const c: Connector = { id, name: 'Custom Webhook ' + id, vendor: 'Custom', category: 'Custom', status: 'Not Connected', logo: '{ }', color: '#0f766e', calls24h: 0, errors24h: 0, lastSync: '—', auth: 'HMAC signature', endpoint: 'https://', usedBy: [], trend: Array(12).fill(0) };
    this.store.connectors.update((l) => [...l, c]);
    this.openCfg(c);
  }
}

/* =========================================================================
   Workflow Analytics
   ========================================================================= */
const PERIODS = { '7 days': 0.25, '30 days': 1, '90 days': 3 } as const;
type Period = keyof typeof PERIODS;

@Component({
  selector: 'app-workflow-workflow-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workflow Analytics" parent="Workflow &amp; Automation" parentLink="/workflow-automation" subtitle="Volume, cycle time, SLA and bottlenecks across every workflow.">
      <div class="tabs">@for (p of periods; track p) {<button [class.on]="period() === p" (click)="period.set(p)">{{ p }}</button>}</div>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Instances Started" [value]="started().toLocaleString()" icon="workflow-play" color="#7c3aed" change="9%" sub="vs. previous period" />
      <app-kpi label="Completed" [value]="completed().toLocaleString()" icon="workflow-check" color="#22c55e" change="7%" sub="vs. previous period" />
      <app-kpi label="Avg. Cycle Time" value="1.6 d" icon="workflow-timer" color="#3b82f6" change="11%" [up]="false" sub="faster vs. previous" />
      <app-kpi label="SLA Compliance" value="93.4%" icon="shield-check" color="#0d9488" change="1.8%" sub="vs. previous period" />
      <app-kpi label="Automated Decisions" [value]="auto().toLocaleString()" icon="workflow-bolt" color="#f59e0b" sub="by automation rules" />
    </section>

    <section class="dash">
      <div class="card span-8"><div class="card-head"><h3>Instances Started vs Completed</h3><span class="muted">{{ period() }}</span></div>
        <app-line-chart [labels]="trend().labels" [series]="trend().series" [height]="230" /></div>
      <div class="card span-4"><div class="card-head"><h3>Outcome Mix</h3></div>
        <app-donut [segments]="mix()" center="Closed" [value]="closedTotal().toLocaleString()" [size]="150" /></div>

      <div class="card span-6"><div class="card-head"><h3>Avg. Cycle Time by Workflow (hours)</h3></div>
        <app-column-chart [labels]="cycle().labels" [series]="cycle().series" [height]="230" suffix=" h" /></div>
      <div class="card span-6"><div class="card-head"><h3>Bottleneck Steps</h3><span class="muted">avg. wait (h)</span></div>
        <app-bar-list [rows]="bottlenecks()" [max]="40" />
        <p class="hint"><app-icon name="lightbulb" [size]="14" />Manager Approval holds 46% of waiting time — enable rule R-102 escalation or delegation to cut ~6 h.</p></div>

      <div class="card span-7"><div class="card-head"><h3>Approvals by Day &amp; Hour</h3></div>
        <app-heatmap [rows]="days" [cols]="hours" [data]="heat()" suffix="" /></div>
      <div class="card span-5"><div class="card-head"><h3>Approver Leaderboard</h3></div>
        <table class="table">
          <thead><tr><th>Approver</th><th class="num">Actioned</th><th class="num">Avg. response</th><th class="num">Pending</th></tr></thead>
          <tbody>@for (a of approvers(); track a.name) {<tr class="clickable" (click)="go()"><td>{{ a.name }}</td><td class="num">{{ a.done }}</td><td class="num">{{ a.resp }} h</td><td class="num"><span [class]="a.pending > 8 ? 'tag red' : 'tag grey'">{{ a.pending }}</span></td></tr>}</tbody>
        </table></div>
    </section>
  `,
  styles: `
    .hint { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #92400e; background: #fffbeb; border-radius: 8px; padding: 8px 10px; margin: 10px 0 0; }
  `,
})
export class WorkflowAnalytics {
  protected readonly store = inject(WorkflowStore);
  private readonly app = inject(AppState);
  private readonly router = inject(Router);
  protected readonly periods = Object.keys(PERIODS) as Period[];
  protected readonly period = signal<Period>('30 days');
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly hours = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
  private readonly k = computed(() => PERIODS[this.period()] * this.app.factor());

  protected readonly started = computed(() => Math.round(1846 * this.k()) + this.store.instances().length - 124);
  protected readonly completed = computed(() => Math.round(1712 * this.k()));
  protected readonly auto = computed(() => Math.round(this.store.rules().reduce((a, r) => a + r.runs, 0) * PERIODS[this.period()]));
  protected readonly mix = computed(() => {
    const s = this.store.instances();
    const k = this.k() * 14;
    return [
      { label: 'Approved', value: Math.round(s.filter((i) => i.status === 'Approved').length * k), color: '#22c55e' },
      { label: 'Rejected', value: Math.round(s.filter((i) => i.status === 'Rejected').length * k), color: '#ef4444' },
      { label: 'Cancelled', value: Math.round(s.filter((i) => i.status === 'Cancelled').length * k), color: '#94a3b8' },
    ];
  });
  protected readonly closedTotal = computed(() => this.mix().reduce((a, m) => a + m.value, 0));
  protected readonly trend = computed(() => {
    const p = this.period();
    const n = p === '7 days' ? 7 : p === '30 days' ? 10 : 13;
    const labels = Array.from({ length: n }, (_, i) => (p === '7 days' ? ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][i] : p === '30 days' ? `${3 * i + 15 > 30 ? 3 * i - 15 : 3 * i + 15} ${3 * i + 15 > 30 ? 'Oct' : 'Sep'}` : `W${30 + i}`));
    const r = rng(n * 13);
    const base = (p === '7 days' ? 62 : p === '30 days' ? 185 : 142 * 1.0) * this.app.factor();
    const s = labels.map((_, i) => Math.round(base * (0.8 + r() * 0.4) * (labels[i] === 'Sat' || labels[i] === 'Sun' ? 0.3 : 1)));
    return { labels, series: [{ name: 'Started', color: '#7c3aed', values: s, area: true }, { name: 'Completed', color: '#22c55e', values: s.map((v) => Math.round(v * (0.86 + r() * 0.1))) }] };
  });
  protected readonly cycle = computed(() => {
    const ws = ['Leave Request', 'Overtime', 'Expense Claim', 'Shift Swap', 'Training', 'Onboarding', 'Visitor'];
    return { labels: ws, series: [{ name: 'Avg. cycle', color: '#3b82f6', values: [26, 14, 41, 9, 52, 96, 4] }, { name: 'SLA', color: '#f59e0b', values: [72, 24, 48, 24, 72, 120, 8], line: true }] };
  });
  protected readonly bottlenecks = computed(() => {
    const m = new Map<string, number>();
    this.store.running().forEach((i) => m.set(currentStep(i), (m.get(currentStep(i)) ?? 0) + 1));
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return rows.map(([label, n], i) => ({ label: `${label} (${n})`, value: Math.max(3, 34 - i * 5), display: `${Math.max(3, 34 - i * 5)} h`, color: i === 0 ? '#ef4444' : i < 3 ? '#f59e0b' : '#7c3aed' }));
  });
  protected readonly heat = computed(() => {
    const r = rng(5);
    return this.days.map((d, di) => this.hours.map((_, hi) => Math.round((di > 4 ? 2 : 14) * (hi === 1 || hi === 2 || hi === 6 ? 1.8 : 1) * (0.6 + r() * 0.8) * PERIODS[this.period()])));
  });
  protected readonly approvers = computed(() => {
    const names = ['Rex Kumar', 'Hannah Lee', 'Grace Park', 'Tom Baker', 'Fatima Ali', 'Meera Iyer', 'Omar Khalid'];
    const s = this.store.instances();
    return names.map((name, i) => ({ name, done: Math.round((s.filter((x) => x.log.some((l) => l.by === name)).length || 3) * 10 * PERIODS[this.period()]), resp: (3.1 + i * 1.3).toFixed(1), pending: s.filter((x) => x.status === 'In Progress' && x.assignee === name).length }));
  });
  protected go() {
    this.router.navigate(['/workflow-automation/my-tasks-approvals']);
  }
  protected exportCsv() {
    const t = this.trend();
    downloadCsv(`workflow-analytics-${this.period().replace(' ', '')}.csv`, [['Period', 'Started', 'Completed'], ...t.labels.map((l, i) => [l, t.series[0].values[i], t.series[1].values[i]])]);
  }
}
