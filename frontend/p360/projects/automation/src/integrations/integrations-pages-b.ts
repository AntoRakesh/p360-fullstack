import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { IntLogo, useToast } from './integrations-shared';
import { Custom, fmtTime, integ, IntegrationStore, Step, SyncLog, Template, TEMPLATES } from './integrations.data';

const BASE = '/integrations-api-hub';
const STEP_META: Record<Step['kind'], { color: string; icon: string }> = {
  Trigger: { color: 'var(--ka-7c3aed)', icon: 'play' },
  Fetch: { color: 'var(--ka-3b82f6)', icon: 'download' },
  Transform: { color: 'var(--ka-14b8a6)', icon: 'workflow' },
  Condition: { color: 'var(--ka-f59e0b)', icon: 'filter' },
  Action: { color: 'var(--ka-22c55e)', icon: 'integrations-send' },
  Notify: { color: 'var(--ka-ec4899)', icon: 'bell' },
};

/* =====================================================================
   Sync Logs & Monitoring
   ===================================================================== */
@Component({
  selector: 'app-integrations-sync-logs-monitoring',
  imports: [...UI, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Sync Logs &amp; Monitoring" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Real-time visibility into every sync run, failure and retry across connected systems.">
      <button class="btn-ghost" (click)="toggleLive()"><app-icon [name]="live() ? 'pause' : 'play'" [size]="14" />{{ live() ? 'Pause stream' : 'Resume stream' }}</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export CSV</button>
      <button class="btn-primary" [disabled]="!failedCount()" (click)="retryAll()"><app-icon name="refresh" [size]="15" />Retry failed ({{ failedCount() }})</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Sync Runs Today" [value]="(logs().length | number) ?? ''" icon="refresh" color="var(--ka-7c3aed)" change="4%" sub="vs. yesterday" />
      <app-kpi label="Success Rate" [value]="rate() + '%'" icon="shield-check" color="var(--ka-22c55e)" sub="target 99%" [subColor]="+rate() >= 99 ? 'var(--ka-16a34a)' : 'var(--ka-d97706)'" />
      <app-kpi label="Failed Runs" [value]="failedCount()" icon="ban" color="var(--ka-ef4444)" sub="awaiting retry" />
      <app-kpi label="Records Processed" [value]="(records() | number) ?? ''" icon="layers" color="var(--ka-3b82f6)" sub="today" />
      <app-kpi label="Avg Duration" [value]="avgDur() + ' s'" icon="clock" color="var(--ka-f59e0b)" sub="per run" />
    </section>

    <section class="dash">
      <div class="card span-8"><div class="card-head"><h3>Sync runs by hour <span class="card-sub">today</span></h3></div><app-column-chart [labels]="hourLabels()" [series]="hourly()" [stacked]="true" [height]="230" /></div>
      <div class="card span-4"><div class="card-head"><h3>Run outcome</h3></div><app-donut [segments]="outcome()" center="Runs" [value]="(logs().length | number) ?? ''" [size]="150" /></div>
    </section>

    <section class="sl" [class.with-d]="!!sel()">
      <div class="card">
        <div class="card-head">
          <div class="tabs">@for (s of statuses; track s) {<button [class.on]="st() === s" (click)="st.set(s); page.set(0)">{{ s }}<span class="count">{{ count(s) }}</span></button>}</div>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search run, system, message..." [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" /></label>
            <select class="select" [value]="conn()" (change)="conn.set($any($event.target).value); page.set(0)"><option value="All">All systems</option>@for (c of store.connections(); track c.id) {<option [value]="c.id">{{ c.name }}</option>}</select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Time</th><th>Run ID</th><th>System</th><th>Job</th><th>Direction</th><th>Trigger</th><th class="num">Records</th><th class="num">Duration</th><th>Status</th><th>Message</th></tr></thead>
            <tbody>
              @for (l of pageRows(); track l.id) {
                <tr class="clickable" [class.selected]="selId() === l.id" [class.new]="isNew(l)" (click)="selId.set(l.id)">
                  <td>{{ time(l.at) }}</td><td><code>{{ l.id }}</code></td><td><b>{{ l.name }}</b></td><td>{{ l.job }}</td><td>{{ l.direction }}</td><td>{{ l.trigger }}</td>
                  <td class="num">{{ l.records | number }}</td><td class="num">{{ l.status === 'Running' ? '…' : (l.duration | number: '1.1-1') + ' s' }}</td>
                  <td><span class="tag" [class]="'tag ' + cls(l.status)">{{ l.status }}</span></td><td class="msg">{{ l.message }}</td>
                </tr>
              } @empty {<tr><td colspan="10" class="muted">No runs match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div class="dt-pager"><span>{{ filtered().length | number }} runs</span>
          <div class="pages"><button class="pg" [disabled]="page() === 0" (click)="page.set(page() - 1)">‹</button><span class="gap">Page {{ page() + 1 }} / {{ pages() }}</span><button class="pg" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)">›</button></div></div>
      </div>
      @if (sel(); as l) {
        <aside class="card det">
          <div class="dh"><div><h3>{{ l.id }}</h3><small class="muted">{{ l.name }} · {{ l.job }}</small></div><span class="tag" [class]="'tag ' + cls(l.status)">{{ l.status }}</span><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <dl class="dl">
            <dt>Started</dt><dd>{{ time(l.at) }}</dd><dt>Trigger</dt><dd>{{ l.trigger }}</dd><dt>Direction</dt><dd>{{ l.direction }}</dd>
            <dt>Records</dt><dd>{{ l.records | number }} ({{ l.errors }} errors)</dd><dt>Duration</dt><dd>{{ l.duration | number: '1.1-1' }} s</dd>
          </dl>
          <h4>Run steps</h4>
          <ol class="steps">
            @for (s of steps(l); track s.t) {<li [class]="s.c"><span></span><div><b>{{ s.t }}</b><small>{{ s.d }}</small></div></li>}
          </ol>
          @if (l.status === 'Failed' || l.status === 'Warning') {
            <pre>{{ l.message }}
at connector.{{ l.integId }}.{{ l.job.toLowerCase().replace(' ', '_') }} (step 3)
correlation-id: {{ l.id.toLowerCase() }}-{{ l.connId.toLowerCase() }}</pre>
            <div class="toolbar"><button class="btn-primary" (click)="retry(l)"><app-icon name="refresh" [size]="14" />Retry run</button><button class="btn-ghost" (click)="go('connected-systems')">Open connection</button></div>
          } @else {
            <div class="toolbar"><button class="btn-ghost" (click)="go('connected-systems')">Open connection</button></div>
          }
        </aside>
      }
    </section>
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .sl { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .sl.with-d { grid-template-columns: minmax(0, 1fr) 360px; }
    code { font-size: 11.5px; } .msg { max-width: 260px; overflow: hidden; text-overflow: ellipsis; color: var(--kf-4b4f6b); }
    tr.new td { animation: fl 1.5s; } @keyframes fl { from { background: var(--kb-ede9fe); } }
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .dh { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; } .dh h3 { margin: 0; font-size: 15px; } .dh div { display: flex; flex-direction: column; }
    .dl { display: grid; grid-template-columns: 90px 1fr; gap: 6px 10px; margin: 0; font-size: 12.5px; } .dl dt { color: var(--muted); } .dl dd { margin: 0; }
    h4 { margin: 4px 0 0; font-size: 13px; }
    .steps { list-style: none; margin: 0; padding: 0; } .steps li { display: grid; grid-template-columns: 14px 1fr; gap: 10px; padding: 6px 0; position: relative; }
    .steps li span { width: 12px; height: 12px; border-radius: 50%; background: var(--kb-22c55e); margin-top: 3px; } .steps li.f span { background: var(--kb-ef4444); } .steps li.w span { background: var(--kb-f59e0b); } .steps li.p span { background: var(--kb-e4e6ef); } .steps li.r span { background: var(--kb-7c3aed); animation: pl 1s infinite; }
    @keyframes pl { 50% { opacity: .3; } }
    .steps div { display: flex; flex-direction: column; font-size: 12.5px; } .steps small { color: var(--muted); font-size: 11px; }
    pre { margin: 0; padding: 10px; border-radius: 8px; background: var(--kb-1e1b3a); color: var(--kf-fecaca); font-size: 11.5px; white-space: pre-wrap; }
    @media (max-width: 1250px) { .sl.with-d { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class SyncLogsMonitoring {
  protected readonly store = inject(IntegrationStore);
  private readonly app = inject(AppState);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly time = fmtTime;
  protected readonly cls = (s: string) => (s === 'Success' ? 'green' : s === 'Warning' ? 'amber' : s === 'Failed' ? 'red' : 'blue');
  protected readonly statuses = ['All', 'Success', 'Warning', 'Failed', 'Running'];
  protected readonly st = signal('All');
  protected readonly q = signal('');
  protected readonly conn = signal(this.route.snapshot.queryParamMap.get('conn') ?? 'All');
  protected readonly page = signal(0);
  protected readonly live = signal(true);
  private readonly frozen = signal<SyncLog[] | null>(null);
  protected readonly selId = signal<string | null>(null);
  private readonly t0 = Date.now();

  protected readonly logs = computed(() => (this.live() ? this.store.logs() : (this.frozen() ?? this.store.logs())));
  protected readonly failedCount = computed(() => this.logs().filter((l) => l.status === 'Failed').length);
  protected readonly rate = computed(() => ((1 - this.failedCount() / Math.max(1, this.logs().length)) * 100).toFixed(1));
  protected readonly records = computed(() => this.logs().reduce((a, l) => a + l.records, 0));
  protected readonly avgDur = computed(() => (this.logs().reduce((a, l) => a + l.duration, 0) / Math.max(1, this.logs().length)).toFixed(1));
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.logs().filter((l) => (this.st() === 'All' || l.status === this.st()) && (this.conn() === 'All' || l.connId === this.conn()) && (!q || `${l.id} ${l.name} ${l.message} ${l.job}`.toLowerCase().includes(q)));
  });
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 12)));
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * 12, this.page() * 12 + 12));
  protected readonly sel = computed(() => this.store.logs().find((l) => l.id === this.selId()) ?? null);
  protected readonly hourBuckets = computed(() => {
    const m = new Map<number, [number, number, number]>();
    for (const l of this.logs()) {
      const h = new Date(l.at).getHours();
      const b = m.get(h) ?? [0, 0, 0];
      b[l.status === 'Failed' ? 2 : l.status === 'Warning' ? 1 : 0]++;
      m.set(h, b);
    }
    return [...m].sort((a, b) => a[0] - b[0]).slice(-12);
  });
  protected readonly hourLabels = computed(() => this.hourBuckets().map(([h]) => `${String(h).padStart(2, '0')}:00`));
  protected readonly hourly = computed(() => [
    { name: 'Success', color: 'var(--ka-22c55e)', values: this.hourBuckets().map(([, b]) => b[0]) },
    { name: 'Warning', color: 'var(--ka-f59e0b)', values: this.hourBuckets().map(([, b]) => b[1]) },
    { name: 'Failed', color: 'var(--ka-ef4444)', values: this.hourBuckets().map(([, b]) => b[2]) },
  ]);
  protected readonly outcome = computed(() => {
    const l = this.logs();
    const c = (s: string) => l.filter((x) => x.status === s).length;
    return [
      { label: 'Success', value: c('Success'), color: 'var(--ka-22c55e)' },
      { label: 'Warning', value: c('Warning'), color: 'var(--ka-f59e0b)' },
      { label: 'Failed', value: c('Failed'), color: 'var(--ka-ef4444)' },
      { label: 'Running', value: c('Running'), color: 'var(--ka-7c3aed)' },
    ];
  });

  protected count(s: string) {
    return s === 'All' ? this.logs().length : this.logs().filter((l) => l.status === s).length;
  }
  protected isNew(l: SyncLog) {
    return l.at > this.t0 && Date.now() - l.at < 3000;
  }
  protected steps(l: SyncLog) {
    const f = l.status === 'Failed', w = l.status === 'Warning', r = l.status === 'Running';
    return [
      { t: 'Authenticate', d: 'Token valid · 42 ms', c: '' },
      { t: 'Fetch changes', d: f ? 'Request failed' : `${l.records + l.errors} candidate records`, c: f ? 'f' : r ? 'r' : '' },
      { t: 'Transform & validate', d: w ? `${l.errors} records failed validation` : f ? 'Skipped' : 'Mapping profile applied', c: f ? 'p' : w ? 'w' : r ? 'p' : '' },
      { t: 'Write to target', d: f ? 'Skipped' : r ? 'Pending' : `${l.records} records upserted`, c: f || r ? 'p' : '' },
      { t: 'Commit cursor', d: f ? 'Will retry in 5 min' : r ? 'Pending' : 'Checkpoint saved', c: f || r ? 'p' : '' },
    ];
  }
  protected retry(l: SyncLog) {
    this.store.retry(l.id);
    this.t.show(`Retry queued for ${l.name}`);
  }
  protected retryAll() {
    const f = this.logs().filter((l) => l.status === 'Failed');
    const seen = new Set<string>();
    f.forEach((l) => { if (!seen.has(l.connId)) { seen.add(l.connId); this.store.retry(l.id); } });
    this.store.logs.update((all) => all.map((l) => (l.status === 'Failed' ? { ...l, status: 'Warning', message: 'Retried → superseded by new run' } : l)));
    this.t.show(`${f.length} failed runs retried across ${seen.size} systems`);
  }
  protected go(p: string) {
    this.router.navigateByUrl(`${BASE}/${p}`);
  }
  protected exportCsv() {
    downloadCsv('sync-logs.csv', [['Run', 'Time', 'System', 'Job', 'Direction', 'Trigger', 'Records', 'Errors', 'Duration s', 'Status', 'Message'], ...this.filtered().map((l) => [l.id, new Date(l.at).toISOString(), l.name, l.job, l.direction, l.trigger, l.records, l.errors, l.duration.toFixed(1), l.status, l.message])]);
  }
  protected toggleLive() {
    this.frozen.set(this.live() ? this.store.logs() : null);
    this.live.update((v) => !v);
  }
}

/* =====================================================================
   Integration Templates
   ===================================================================== */
@Component({
  selector: 'app-integrations-integration-templates',
  imports: [...UI, IntLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Integration Templates" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Start from proven multi-system recipes — onboarding, payroll, security, facilities and more.">
      <button class="btn-primary" (click)="go('custom-integrations')"><app-icon name="plus" [size]="16" />Build from scratch</button>
    </app-page-head>

    <section class="card bar">
      <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search templates..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <div class="tabs">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
    </section>

    <section class="tg">
      @for (tp of list(); track tp.id) {
        <div class="card tc">
          <div class="th"><span class="ti" [style.background]="tp.color"><app-icon [name]="tp.icon" [size]="20" /></span><div><b>{{ tp.name }}</b><small>{{ tp.category }} · {{ tp.uses }} deployments · ~{{ tp.time }} setup</small></div></div>
          <p>{{ tp.desc }}</p>
          <div class="flow">
            @for (s of tp.steps; track $index; let last = $last) {
              <span class="st" [style.border-color]="meta[s.kind].color"><i [style.background]="meta[s.kind].color"></i>{{ s.label }}</span>@if (!last) {<span class="ar">›</span>}
            }
          </div>
          <div class="tf">
            <div class="sys">@for (id of tp.systems; track id) {<app-int-logo [it]="byId(id)" [size]="26" [title]="byId(id).name" />}</div>
            <div class="toolbar"><button class="btn-ghost sm" (click)="preview.set(tp)">Preview</button><button class="btn-primary btn-sm" (click)="use.set(tp); uname.set(tp.name)">Use template</button></div>
          </div>
        </div>
      } @empty {<p class="muted">No templates match.</p>}
    </section>

    @if (preview(); as tp) {
      <div class="g-overlay" (click)="preview.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><h3>{{ tp.name }}</h3><button class="close-btn" (click)="preview.set(null)">×</button></div>
        <p class="muted">{{ tp.desc }}</p>
        <ol class="vflow">
          @for (s of tp.steps; track $index) {
            <li><span class="vi" [style.background]="meta[s.kind].color"><app-icon [name]="meta[s.kind].icon" [size]="14" /></span><div><small>{{ s.kind }}</small><b>{{ s.label }}</b><span class="muted">{{ s.system }}</span></div></li>
          }
        </ol>
        <h4>Required connections</h4>
        <ul class="req">@for (id of tp.systems; track id) {<li><app-int-logo [it]="byId(id)" [size]="28" /><b>{{ byId(id).name }}</b>@if (connected().has(id)) {<span class="tag green">Connected</span>} @else {<span class="tag amber">Not connected</span>}</li>}</ul>
        <div class="form-actions"><button class="btn-ghost" (click)="go('integration-marketplace')">Open marketplace</button><button class="btn-primary" (click)="use.set(tp); uname.set(tp.name); preview.set(null)">Use template</button></div>
      </aside>
    }
    @if (use(); as tp) {
      <div class="g-overlay" (click)="use.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Use “{{ tp.name }}”</h3><button class="close-btn" (click)="use.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Integration name<input class="input" [value]="uname()" (input)="uname.set($any($event.target).value)" /></label>
          <label>Publish as<select class="select" [value]="ustate()" (change)="ustate.set($any($event.target).value)"><option>Draft</option><option>Published</option></select></label>
          <label>Owner<input class="input" value="Rex Kumar" /></label>
        </div>
        @if (missing(tp).length) {<p class="warn"><app-icon name="triangle-alert" [size]="14" />{{ missing(tp).length }} required system(s) not connected yet: {{ missingNames(tp) }}. The integration will be saved as Draft until connected.</p>}
        <div class="form-actions"><button class="btn-ghost" (click)="use.set(null)">Cancel</button><button class="btn-primary" (click)="create(tp)">Create integration</button></div>
      </div>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; } .bar .search-box { min-width: 260px; }
    .tg { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 12px; }
    .tc { display: flex; flex-direction: column; gap: 10px; }
    .th { display: grid; grid-template-columns: 42px 1fr; gap: 12px; align-items: center; } .th div { display: flex; flex-direction: column; } .th b { font-size: 14px; } .th small { color: var(--muted); font-size: 11.5px; }
    .ti { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .tc p { margin: 0; font-size: 12.5px; color: var(--kf-3b3f5c); }
    .flow { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; } .st { display: inline-flex; gap: 5px; align-items: center; padding: 3px 8px; border: 1px solid; border-radius: 14px; font-size: 11px; background: var(--kb-ffffff); } .st i { width: 6px; height: 6px; border-radius: 50%; } .ar { color: var(--muted); }
    .tf { display: flex; justify-content: space-between; align-items: center; margin-top: auto; } .sys { display: flex; gap: 4px; }
    .vflow { list-style: none; padding: 0; margin: 12px 0; } .vflow li { display: grid; grid-template-columns: 28px 1fr; gap: 12px; padding-bottom: 16px; position: relative; }
    .vflow li:not(:last-child)::after { content: ''; position: absolute; left: 13px; top: 30px; bottom: 2px; width: 2px; background: var(--kb-e4e6ef); }
    .vi { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); } .vflow div { display: flex; flex-direction: column; font-size: 13px; } .vflow small { font-size: 10.5px; text-transform: uppercase; color: var(--muted); letter-spacing: .4px; }
    h4 { margin: 8px 0 6px; font-size: 13px; }
    .req { list-style: none; margin: 0; padding: 0; } .req li { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 13px; }
    .warn { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--kf-b45309); background: var(--kb-fffbeb); padding: 8px 10px; border-radius: 8px; }
  `,
})
export class IntegrationTemplates {
  protected readonly store = inject(IntegrationStore);
  private readonly router = inject(Router);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly byId = integ;
  protected readonly meta = STEP_META;
  protected readonly connected = this.store.connectedIds;
  protected readonly cats = ['All', ...new Set(TEMPLATES.map((x) => x.category))];
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly preview = signal<Template | null>(null);
  protected readonly use = signal<Template | null>(null);
  protected readonly uname = signal('');
  protected readonly ustate = signal<'Draft' | 'Published'>('Draft');
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return TEMPLATES.filter((x) => (this.cat() === 'All' || x.category === this.cat()) && (!q || `${x.name} ${x.desc}`.toLowerCase().includes(q)));
  });
  protected missing(tp: Template) {
    return tp.systems.filter((id) => !this.connected().has(id));
  }
  protected missingNames(tp: Template) {
    return this.missing(tp).map((id) => integ(id).name).join(', ');
  }
  protected create(tp: Template) {
    const id = `CI-${String(this.store.customs().length + 1).padStart(3, '0')}`;
    const c: Custom = { id, name: this.uname() || tp.name, desc: tp.desc, status: this.missing(tp).length ? 'Draft' : this.ustate(), owner: 'Rex Kumar', updated: '06 Nov 2026', runs: 0, success: 0, steps: tp.steps.map((s) => ({ ...s })), fromTemplate: tp.name };
    this.store.customs.update((l) => [c, ...l]);
    this.use.set(null);
    this.router.navigate([`${BASE}/custom-integrations`], { queryParams: { id } });
  }
  protected go(p: string) {
    this.router.navigateByUrl(`${BASE}/${p}`);
  }
}

/* =====================================================================
   Custom Integrations (flow builder)
   ===================================================================== */
const KINDS: Step['kind'][] = ['Trigger', 'Fetch', 'Transform', 'Condition', 'Action', 'Notify'];
@Component({
  selector: 'app-integrations-custom-integrations',
  imports: [...UI, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Custom Integrations" parent="Integrations &amp; API Hub" [parentLink]="base" subtitle="Design your own integration flows with triggers, transformations and actions — no code required.">
      <button class="btn-ghost" (click)="go('integration-templates')"><app-icon name="file-text" [size]="15" />From template</button>
      <button class="btn-primary" (click)="newFlow()"><app-icon name="plus" [size]="16" />New Integration</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Custom Integrations" [value]="store.customs().length" icon="integrations-custom" color="var(--ka-7c3aed)" />
      <app-kpi label="Published" [value]="countSt('Published')" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="Drafts" [value]="countSt('Draft')" icon="file-text" color="var(--ka-f59e0b)" />
      <app-kpi label="Runs (30 days)" [value]="(runs() | number) ?? ''" icon="activity" color="var(--ka-3b82f6)" />
    </section>

    <section class="ci">
      <aside class="card">
        <h3>Integrations</h3>
        <ul class="fl">
          @for (c of store.customs(); track c.id) {
            <li [class.on]="selId() === c.id" (click)="selId.set(c.id); runOut.set([])">
              <div><b>{{ c.name }}</b><small>{{ c.id }} · {{ c.steps.length }} steps · {{ c.owner }}</small></div>
              <span class="tag" [class]="'tag ' + (c.status === 'Published' ? 'green' : c.status === 'Draft' ? 'amber' : 'grey')">{{ c.status }}</span>
            </li>
          }
        </ul>
      </aside>

      @if (sel(); as c) {
        <div class="card bld">
          <div class="card-head">
            <div class="ttl"><input class="nm" [value]="c.name" (change)="patch({ name: $any($event.target).value })" /><small class="muted">{{ c.desc }}@if (c.fromTemplate) { · from template “{{ c.fromTemplate }}”}</small></div>
            <div class="toolbar">
              <button class="btn-ghost" [disabled]="running()" (click)="test()"><app-icon name="play" [size]="14" />{{ running() ? 'Running…' : 'Test run' }}</button>
              @if (c.status === 'Published') {<button class="btn-ghost" (click)="patch({ status: 'Disabled' }); t.show(c.name + ' disabled')">Disable</button>}
              @else {<button class="btn-primary" (click)="publish()">Publish</button>}
              <button class="btn-ghost danger" (click)="remove()">Delete</button>
            </div>
          </div>
          <div class="canvas">
            @for (s of c.steps; track $index; let i = $index; let last = $last) {
              <div class="node" [class.on]="selStep() === i" [class.ok]="runOut()[i]?.ok === true" [class.bad]="runOut()[i]?.ok === false" (click)="selStep.set(i)">
                <span class="nk" [style.background]="meta[s.kind].color"><app-icon [name]="meta[s.kind].icon" [size]="14" /></span>
                <div><small>{{ i + 1 }}. {{ s.kind }}</small><b>{{ s.label }}</b><span class="muted">{{ s.system }}</span></div>
                @if (runOut()[i]; as r) {<em>{{ r.ok ? '✓' : '✕' }} {{ r.ms }} ms</em>}
              </div>
              @if (!last) {<div class="conn"><button class="add" (click)="insert(i + 1)" title="Insert step">+</button></div>}
            }
            <button class="node addn" (click)="insert(c.steps.length)">+ Add step</button>
          </div>
          @if (runOut().length) {
            <div class="console">
              @for (r of runOut(); track $index) {<div [class.e]="!r.ok">[{{ r.at }}] {{ r.msg }}</div>}
            </div>
          }
        </div>

        <aside class="card prop">
          @if (step(); as s) {
            <h3>Step {{ selStep() + 1 }}</h3>
            <div class="form-grid one">
              <label>Type<select class="select" [value]="s.kind" (change)="setStep('kind', $any($event.target).value)">@for (k of kinds; track k) {<option [value]="k">{{ k }}</option>}</select></label>
              <label>Label<input class="input" [value]="s.label" (change)="setStep('label', $any($event.target).value)" /></label>
              <label>System<select class="select" [value]="s.system" (change)="setStep('system', $any($event.target).value)">@for (n of systems(); track n) {<option [value]="n">{{ n }}</option>}</select></label>
              @if (s.kind === 'Condition') {<label>Expression<input class="input code" value="record.site == 'Head Office'" /></label>}
              @if (s.kind === 'Transform') {<label>Mapping profile<select class="select"><option>Workday → People360 Employees</option><option>People360 Timesheets → ADP Payroll</option></select></label>}
              @if (s.kind === 'Action' || s.kind === 'Notify') {<label>On error<select class="select"><option>Retry 3× then dead-letter</option><option>Stop flow</option><option>Continue</option></select></label>}
            </div>
            <div class="toolbar sp">
              <button class="btn-ghost sm" [disabled]="selStep() === 0" (click)="move(-1)">↑ Move up</button>
              <button class="btn-ghost sm" [disabled]="selStep() >= c.steps.length - 1" (click)="move(1)">↓ Move down</button>
              <button class="btn-ghost sm danger" [disabled]="c.steps.length <= 1" (click)="delStep()">Delete step</button>
            </div>
          }
          <h4>Statistics</h4>
          <dl class="dl"><dt>Status</dt><dd>{{ c.status }}</dd><dt>Runs</dt><dd>{{ c.runs | number }}</dd><dt>Success</dt><dd>{{ c.runs ? c.success + '%' : '—' }}</dd><dt>Updated</dt><dd>{{ c.updated }}</dd></dl>
        </aside>
      } @else {
        <div class="card"><p class="muted">Select or create an integration.</p></div>
      }
    </section>
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: `
    .ci { display: grid; grid-template-columns: 300px minmax(0, 1fr) 290px; gap: 12px; align-items: start; }
    h3 { margin: 0 0 10px; font-size: 15px; } h4 { margin: 14px 0 6px; font-size: 13px; } .danger { color: var(--red); }
    .fl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .fl li { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 9px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; } .fl li.on { border-color: var(--primary); background: var(--kb-faf8ff); }
    .fl div { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; } .fl small { color: var(--muted); font-size: 11px; }
    .ttl { display: flex; flex-direction: column; min-width: 0; flex: 1; } .nm { border: 0; font: inherit; font-size: 16px; font-weight: 700; padding: 2px 0; border-bottom: 1px dashed transparent; } .nm:hover, .nm:focus { border-bottom-color: var(--kl-c4b5fd); outline: none; }
    .canvas { display: flex; flex-direction: column; align-items: center; padding: 18px; border-radius: 10px; background-color: var(--kb-fafaff); background-image: radial-gradient(var(--kb-e4e6ef) 1px, transparent 1px); background-size: 16px 16px; }
    .node { width: min(420px, 100%); display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; box-shadow: 0 1px 3px rgba(20,20,60,.05); }
    .node.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .node.ok { border-color: var(--kl-86efac); } .node.bad { border-color: var(--kl-fca5a5); }
    .node div { display: flex; flex-direction: column; font-size: 12.5px; } .node small { font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); } .node .muted { font-size: 11.5px; }
    .node em { font-style: normal; font-size: 11px; color: var(--kf-15803d); } .node.bad em { color: var(--kf-b91c1c); }
    .nk { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .conn { height: 30px; width: 2px; background: var(--kb-c4b5fd); position: relative; } .add { position: absolute; left: -10px; top: 5px; width: 22px; height: 20px; border-radius: 10px; border: 1px solid var(--kl-c4b5fd); background: var(--kb-ffffff); color: var(--primary); font-size: 13px; line-height: 1; cursor: pointer; opacity: 0; } .conn:hover .add { opacity: 1; }
    .addn { margin-top: 14px; display: block; text-align: center; border-style: dashed; color: var(--primary); font: inherit; font-size: 12.5px; }
    .console { margin-top: 10px; padding: 10px; border-radius: 8px; background: var(--kb-12142b); color: var(--kf-c4f1be); font-family: ui-monospace, monospace; font-size: 11.5px; } .console .e { color: var(--kf-fca5a5); }
    .one { grid-template-columns: 1fr; } .code { font-family: ui-monospace, monospace; font-size: 12px; } .sp { margin-top: 12px; }
    .dl { display: grid; grid-template-columns: 80px 1fr; gap: 6px 10px; margin: 0; font-size: 12.5px; } .dl dt { color: var(--muted); } .dl dd { margin: 0; }
    @media (max-width: 1400px) { .ci { grid-template-columns: 260px minmax(0, 1fr); } .prop { grid-column: 1 / -1; } }
  `,
})
export class CustomIntegrations {
  protected readonly store = inject(IntegrationStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = useToast();
  protected readonly base = BASE;
  protected readonly meta = STEP_META;
  protected readonly kinds = KINDS;
  protected readonly selId = signal<string | null>(this.route.snapshot.queryParamMap.get('id') ?? 'CI-001');
  protected readonly selStep = signal(0);
  protected readonly running = signal(false);
  protected readonly runOut = signal<{ ok: boolean; ms: number; msg: string; at: string }[]>([]);
  protected readonly sel = computed(() => this.store.customs().find((c) => c.id === this.selId()) ?? null);
  protected readonly step = computed(() => this.sel()?.steps[this.selStep()] ?? null);
  protected readonly runs = computed(() => this.store.customs().reduce((a, c) => a + c.runs, 0));
  protected readonly systems = computed(() => ['People360', 'Scheduler', ...this.store.connections().map((c) => c.name)]);
  private connChecker() {
    const names = ['People360', 'Scheduler', ...this.store.connections().map((x) => x.name)];
    return { has: (sys: string) => names.some((n) => n === sys || n.startsWith(sys) || sys.startsWith(n)) };
  }
  protected countSt(s: string) {
    return this.store.customs().filter((c) => c.status === s).length;
  }
  protected patch(ch: Partial<Custom>) {
    const id = this.selId();
    this.store.customs.update((l) => l.map((c) => (c.id === id ? { ...c, ...ch, updated: '06 Nov 2026' } : c)));
  }
  protected setStep(k: keyof Step, v: string) {
    const i = this.selStep();
    this.patch({ steps: this.sel()!.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  }
  protected insert(at: number) {
    const steps = [...this.sel()!.steps];
    steps.splice(at, 0, { kind: 'Action', label: 'New action', system: 'People360' });
    this.patch({ steps });
    this.selStep.set(at);
  }
  protected move(d: number) {
    const i = this.selStep(), steps = [...this.sel()!.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    this.patch({ steps });
    this.selStep.set(i + d);
  }
  protected delStep() {
    const i = this.selStep();
    this.patch({ steps: this.sel()!.steps.filter((_, j) => j !== i) });
    this.selStep.set(Math.max(0, i - 1));
  }
  protected test() {
    const c = this.sel()!;
    this.running.set(true);
    this.runOut.set([]);
    const connected = this.connChecker();
    let i = 0;
    const next = () => {
      const s = c.steps[i];
      const ok = connected.has(s.system);
      const ms = 60 + ((i * 97 + s.label.length * 13) % 400);
      const msg = ok ? `${s.kind} "${s.label}" on ${s.system} → ${s.kind === 'Condition' ? 'true' : s.kind === 'Fetch' ? '5 records' : 'ok'}` : `${s.kind} "${s.label}" failed: ${s.system} is not connected`;
      this.runOut.update((l) => [...l, { ok, ms, msg, at: new Date().toLocaleTimeString('en-GB') }]);
      i++;
      if (ok && i < c.steps.length) setTimeout(next, 420);
      else {
        this.running.set(false);
        this.t.show(ok ? `Test run passed · ${c.steps.length} steps` : `Test run failed at step ${i} — connect ${s.system} in the Marketplace`);
      }
    };
    setTimeout(next, 300);
  }
  protected publish() {
    const c = this.sel()!;
    const connected = this.connChecker();
    const miss = c.steps.find((s) => !connected.has(s.system));
    if (miss) return this.t.show(`Cannot publish: ${miss.system} is not connected`);
    this.patch({ status: 'Published' });
    this.t.show(`${c.name} published — live from next trigger`);
  }
  protected remove() {
    const c = this.sel()!;
    this.store.customs.update((l) => l.filter((x) => x.id !== c.id));
    this.selId.set(this.store.customs()[0]?.id ?? null);
    this.t.show(`${c.name} deleted`);
  }
  protected newFlow() {
    const id = `CI-${String(this.store.customs().length + 1).padStart(3, '0')}${Date.now() % 10}`;
    this.store.customs.update((l) => [{ id, name: 'Untitled integration', desc: 'Describe what this flow does.', status: 'Draft', owner: 'Rex Kumar', updated: '06 Nov 2026', runs: 0, success: 0, steps: [{ kind: 'Trigger', label: 'Record changed', system: 'People360' }, { kind: 'Action', label: 'Send to system', system: 'People360' }] }, ...l]);
    this.selId.set(id);
    this.selStep.set(0);
    this.runOut.set([]);
  }
  protected go(p: string) {
    this.router.navigateByUrl(`${BASE}/${p}`);
  }
}
