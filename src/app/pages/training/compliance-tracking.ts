// Training › Compliance Tracking — mandatory training compliance by dept / site / role, gaps, nudges and assignment.
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Series, UI } from '../../shared/ui';
import { certTag, TrnPage } from './training-ui';
import {
  certStatus, COMPLIANCE_TREND, CT, daysUntil, DEPTS, downloadCsv, iso, MONTHS_12, NcReason, NcRow, PEOPLE, Req, reqDepts, REQS, SITES, TOTAL_EMPLOYEES,
} from './training.data';

type Dim = 'Department' | 'Site' | 'Role';
const ROLES_ALL = [...new Set(PEOPLE.map((p) => p.role))].sort();
const TARGET = 95;
const pctTone = (v: number) => (v >= TARGET ? 'var(--ka-16a34a)' : v >= 90 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)');
const pctBg = (v: number) => (v >= 98 ? 'var(--ka-d9f7e3)' : v >= TARGET ? 'var(--ka-ecfbe9)' : v >= 90 ? 'var(--ka-fdf0d5)' : v >= 85 ? 'var(--ka-fde3cf)' : 'var(--ka-fddde1)');

/** Head-count of each requirement's applicable population, per arbitrary group predicate. */
const POP = new Map(REQS.map((r) => [r.id, PEOPLE.filter((p) => reqDepts(r).includes(p.dept))]));
const obligation = (r: Req, match: (p: (typeof PEOPLE)[number]) => boolean) => {
  const pop = POP.get(r.id)!;
  return (r.required * pop.filter(match).length) / (pop.length || 1);
};

@Component({
  selector: 'app-training-compliance-tracking',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Compliance Tracking" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Mandatory training compliance against regulatory requirements by department, site and role.">
      <button class="btn-primary" (click)="openAssign(scopedRows())"><app-icon name="graduation-cap" [size]="16" />Assign Training</button>
      <button class="btn-ghost" (click)="openNudge(scopedRows())"><app-icon name="training-send" [size]="16" />Nudge All ({{ fmt(scopedRows().length) }})</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Overall Compliance" [value]="store.compliancePct() + '%'" icon="shield-check" color="var(--ka-22c55e)" [change]="delta() + ' pts'" [up]="delta() >= 0" sub="vs. last month" />
      <app-kpi label="Fully Compliant Staff" [value]="fmt(k().compliant)" icon="user-check" color="var(--ka-7c3aed)" [sub]="Math.round((k().compliant / total) * 100) + '% of ' + fmt(total) + ' employees'" />
      <app-kpi label="Open Compliance Gaps" [value]="fmt(k().gaps)" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="k().expired + ' expired certificates'" subColor="var(--ka-dc2626)" />
      <app-kpi label="In Remediation" [value]="fmt(k().assigned)" icon="graduation-cap" color="var(--ka-3b82f6)" sub="training assigned, not yet done" subColor="var(--ka-2563eb)" />
      <app-kpi label="Requirements Below Target" [value]="k().below + ' / ' + reqs.length" icon="file-check" color="var(--ka-f59e0b)" [sub]="'target ' + target + '% per requirement'" />
    </section>

    <section class="dash">
      <div class="card span-5">
        <div class="card-head">
          <h3>Compliance by {{ dim() }}</h3>
          <div class="tabs">@for (d of dims; track d) {<button [class.on]="dim() === d" (click)="dim.set(d)">{{ d }}</button>}</div>
        </div>
        <ul class="grp">
          @for (g of groups(); track g.name) {
            <li [class.on]="scope()?.dim === dim() && scope()?.val === g.name" (click)="toggleScope(dim(), g.name)" [title]="g.nc + ' gaps of ' + fmt(g.obl) + ' obligations'">
              <span class="gn">{{ g.name }}</span>
              <span class="gt"><i [style.width.%]="Math.max(0, (g.pct - 70) / 30) * 100" [style.background]="tone(g.pct)"></i><em [style.left.%]="((target - 70) / 30) * 100"></em></span>
              <b [style.color]="tone(g.pct)">{{ g.pct }}%</b>
              <small>{{ g.nc }} gaps</small>
            </li>
          }
        </ul>
        <p class="hint"><i class="tg"></i>Target {{ target }}% · scale 70–100% · click a row to filter the gap list</p>
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Compliance Trend</h3><span class="muted">last 12 months</span></div>
        <app-line-chart [labels]="months" [series]="trend()" [height]="236" [min]="80" [max]="100" suffix="%" />
      </div>
      <div class="card span-3">
        <div class="card-head"><h3>Gap Reasons</h3></div>
        <app-donut [segments]="reasons()" center="Open gaps" [size]="136" />
        <div class="rz">
          @for (r of reasons(); track r.label) {<button class="chip" [class.act]="reasonF() === r.label" (click)="reasonF.set(reasonF() === r.label ? null : $any(r.label))">{{ r.label }}</button>}
        </div>
      </div>
    </section>

    <section class="card hm">
      <div class="card-head"><h3>Department × Requirement Compliance</h3><span class="muted">click a cell to drill into its gaps · grey = not applicable</span></div>
      <div class="hmw">
        <table>
          <thead><tr><th></th>@for (r of reqs; track r.id) {<th [title]="r.name + ' · ' + r.regulation"><span>{{ short(r) }}</span></th>}<th>Overall</th></tr></thead>
          <tbody>
            @for (row of heat(); track row.dept) {
              <tr>
                <th>{{ row.dept }}</th>
                @for (c of row.cells; track $index) {
                  @if (c === null) {<td class="na">—</td>} @else {
                    <td [style.background]="bg(c.pct)" [style.color]="tone(c.pct)" [class.sel]="scope()?.val === row.dept && reqF() === reqs[$index].id" (click)="drill(row.dept, reqs[$index].id)" [title]="row.dept + ' · ' + reqs[$index].name + ': ' + c.nc + ' gaps'">{{ c.pct }}</td>
                  }
                }
                <td class="ov" [style.color]="tone(row.pct)">{{ row.pct }}%</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="lay">
      <div class="card">
        <div class="card-head">
          <h3>Non-Compliant Employees <span class="card-sub">{{ fmt(rows().length) }} gaps · {{ fmt(uniq(rows())) }} people</span></h3>
          <div class="scp">
            @if (scope(); as s) {<span class="chip act">{{ s.dim }}: {{ s.val }}<button (click)="scope.set(null)">×</button></span>}
            @if (reqF(); as r) {<span class="chip act">{{ req(r).name }}<button (click)="reqF.set(null)">×</button></span>}
            @if (reasonF(); as r) {<span class="chip act">{{ r }}<button (click)="reasonF.set(null)">×</button></span>}
          </div>
        </div>
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['name', 'empId', 'reqName', 'regulation']"
          searchPlaceholder="Search employee, requirement or regulation..." noun="gaps" [activeId]="drawerRow()?.id ?? null"
          (rowClick)="drawerEmp.set($event.empId)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <div class="card reqc">
        <div class="card-head"><h3>Regulatory Requirements</h3><span class="muted">{{ reqs.length }} tracked</span></div>
        <ul class="rq">
          @for (r of reqStats(); track r.req.id) {
            <li [class.on]="reqF() === r.req.id" (click)="reqF.set(reqF() === r.req.id ? null : r.req.id)">
              <div class="rt"><b>{{ r.req.name }}</b><span [style.color]="tone(r.pct)">{{ r.pct }}%</span></div>
              <small>{{ r.req.regulation }} · {{ r.req.frequency }} · Owner: {{ r.req.owner }}</small>
              <span class="rb"><i [style.width.%]="r.pct" [style.background]="tone(r.pct)"></i></span>
              <div class="rf">
                <small>{{ fmt(r.req.required - r.nc) }} / {{ fmt(r.req.required) }} compliant · <b class="red">{{ r.nc }} gaps</b>@if (r.assigned) { · {{ r.assigned }} assigned}</small>
                <button class="btn-ghost sm" [disabled]="!r.nc" (click)="$event.stopPropagation(); openAssign(gapsOf(r.req.id))">Assign</button>
              </div>
            </li>
          }
        </ul>
      </div>
    </section>

    @if (drawerEmp(); as id) {
      @let p = person(id);
      <div class="g-overlay" (click)="drawerEmp.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><h3>Compliance Profile</h3><button class="close-btn" (click)="drawerEmp.set(null)">×</button></div>
        <div class="pf">
          <span class="dt-av big" [style.background]="p.avatar">{{ p.initials }}</span>
          <div><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.role }} · {{ p.dept }} · {{ p.site }}</small></div>
          <span [class]="empGaps().length ? 'tag red' : 'tag green'">{{ empGaps().length ? 'Non-compliant' : 'Compliant' }}</span>
        </div>
        <div class="pk">
          <div><small>Applicable requirements</small><b>{{ applicable(id).length }}</b></div>
          <div><small>Open gaps</small><b class="red">{{ empGaps().length }}</b></div>
          <div><small>Nudges sent</small><b>{{ store.nudges()[id] ?? 0 }}</b></div>
        </div>
        <h4>Requirements</h4>
        <ul class="er">
          @for (r of applicable(id); track r.id) {
            @let g = gapFor(r.id);
            <li>
              <span class="ic" [class.bad]="!!g"><app-icon [name]="g ? 'training-x' : 'training-check'" [size]="14" [stroke]="2.6" /></span>
              <div><b>{{ r.name }}</b><small>{{ r.regulation }}@if (g) { · {{ g.reason }} since {{ fd(g.since) }}}</small></div>
              @if (g) {
                @if (store.openEnroll(id, r.courseId); as e) {<span class="tag blue">Assigned · due {{ fd(e.due) }}</span>}
                @else {<button class="btn-ghost sm" (click)="openAssign([rowOf(g)])">Assign</button>}
                <button class="btn-ghost sm" (click)="record(rowOf(g))">Record</button>
              } @else {<span class="tag green">Compliant</span>}
            </li>
          }
        </ul>
        <h4>Certificates</h4>
        <ul class="er">
          @for (c of store.certsOf(id); track c.id) {
            <li><span class="ic"><app-icon name="training-award" [size]="14" /></span><div><b>{{ ctName(c.typeId) }}</b><small>{{ c.number }} · expires {{ fd(c.expiry) }}</small></div><span [class]="certTag(cs(c))">{{ cs(c) }}</span></li>
          } @empty {<li class="muted">No certificates on file</li>}
        </ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="go('training-plan-enrollment', { emp: id })">Open training plan</button>
          <button class="btn-primary" [disabled]="!empGaps().length" (click)="openNudge(empRows())"><app-icon name="training-send" [size]="15" />Nudge</button>
        </div>
      </aside>
    }

    @if (nudge(); as n) {
      <div class="g-overlay" (click)="nudge.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendNudge()">
        <div class="modal-head"><h3>Send Compliance Nudge</h3><button type="button" class="close-btn" (click)="nudge.set(null)">×</button></div>
        <p class="muted">{{ uniq(n.rows) }} employee(s) · {{ n.rows.length }} open gap(s)</p>
        <div class="form-grid">
          <label class="full">Channels
            <span class="cks">@for (c of channels; track c) {<label><input type="checkbox" [checked]="n.ch.includes(c)" (change)="toggleCh(c)" />{{ c }}</label>}</span>
          </label>
          <label class="full"><span class="ck"><input type="checkbox" [checked]="n.cc" (change)="nudge.set({ ...n, cc: !n.cc })" />Copy line managers</span></label>
          <label class="full">Message<textarea class="input" rows="5" [value]="n.text" (input)="nudge.set({ ...n, text: $any($event.target).value })"></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="nudge.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!n.ch.length">Send Nudge</button></div>
      </form>
    }

    @if (assign(); as a) {
      <div class="g-overlay" (click)="assign.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doAssign()">
        <div class="modal-head"><h3>Assign Mandatory Training</h3><button type="button" class="close-btn" (click)="assign.set(null)">×</button></div>
        <p class="muted">Enrols each non-compliant employee in the course that satisfies the requirement. Already-enrolled employees are skipped.</p>
        <ul class="ab">
          @for (g of assignGroups(); track g.req.id) {
            <li><b>{{ course(g.req.courseId)?.title }}</b><small>{{ g.req.name }} · {{ g.req.regulation }}</small><span class="tag">{{ g.n }} employee(s)</span></li>
          } @empty {<li class="muted">Nothing to assign.</li>}
        </ul>
        <div class="form-grid">
          <label>Complete by<input class="input" type="date" [value]="a.due" (change)="assign.set({ ...a, due: $any($event.target).value })" /></label>
          <label>Notify<select class="select" [value]="a.notify" (change)="assign.set({ ...a, notify: $any($event.target).value })"><option>Employee + manager</option><option>Employee only</option><option>Do not notify</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="assign.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!a.rows.length">Assign to {{ uniq(a.rows) }} employee(s)</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .grp { list-style: none; margin: 0; padding: 0; }
    .grp li { display: grid; grid-template-columns: 112px 1fr 46px 58px; gap: 10px; align-items: center; padding: 6px 6px; border-radius: 6px; cursor: pointer; font-size: 12.5px; }
    .grp li:hover, .grp li.on { background: var(--primary-soft); }
    .gn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .grp b { text-align: right; } .grp small { color: var(--muted); font-size: 11px; text-align: right; }
    .gt { position: relative; height: 8px; background: var(--kb-eef0f6); border-radius: 6px; } .gt i { display: block; height: 100%; border-radius: 6px; }
    .gt em { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--kb-1e1b3a); opacity: .5; }
    .hint { margin: 10px 0 0; font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; } .tg { width: 2px; height: 12px; background: var(--kb-1e1b3a); opacity: .5; }
    .rz { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; } .chip { cursor: pointer; } .chip.act { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
    .chip button { border: 0; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 0 0 2px; }
    .hm { margin-bottom: 12px; } .hmw { overflow-x: auto; }
    .hm table { width: 100%; border-collapse: separate; border-spacing: 3px; font-size: 12px; }
    .hm thead th { font-weight: 500; color: var(--muted); font-size: 11px; padding: 2px 4px; white-space: nowrap; }
    .hm tbody th { text-align: left; font-weight: 500; white-space: nowrap; padding-right: 8px; }
    .hm td { text-align: center; padding: 7px 4px; border-radius: 5px; font-weight: 600; cursor: pointer; min-width: 54px; transition: transform .1s; }
    .hm td:hover { transform: scale(1.06); } .hm td.sel { outline: 2px solid var(--primary); }
    .hm td.na { background: var(--kb-f4f5f8); color: var(--kf-b8bccb); cursor: default; font-weight: 400; } .hm td.na:hover { transform: none; }
    .hm td.ov { background: var(--kb-ffffff); border: 1px solid var(--border); cursor: default; }
    .lay { display: grid; grid-template-columns: minmax(0, 1fr) 370px; gap: 12px; align-items: start; }
    .scp { display: flex; gap: 6px; flex-wrap: wrap; }
    .reqc { max-height: 820px; overflow: auto; }
    .rq { list-style: none; margin: 0; padding: 0; } .rq li { padding: 10px 8px; border-bottom: 1px solid var(--kl-f0f1f6); cursor: pointer; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; }
    .rq li:hover, .rq li.on { background: var(--kb-faf8ff); } .rq li.on { box-shadow: inset 3px 0 0 var(--primary); }
    .rt { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; } .rt span { font-weight: 700; }
    .rq small { color: var(--muted); font-size: 11px; } .rb { height: 5px; background: var(--kb-eef0f6); border-radius: 4px; overflow: hidden; } .rb i { display: block; height: 100%; }
    .rf { display: flex; justify-content: space-between; align-items: center; gap: 6px; } .red { color: var(--kf-dc2626); }
    .pf { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; } .pf div { display: flex; flex-direction: column; flex: 1; } .pf small { color: var(--muted); font-size: 11.5px; }
    .dt-av.big { width: 46px; height: 46px; font-size: 15px; }
    .pk { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .pk div { background: var(--kb-f7f7fb); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; } .pk small { color: var(--muted); font-size: 11px; } .pk b { font-size: 18px; }
    h4 { margin: 16px 0 6px; font-size: 13px; }
    .er { list-style: none; margin: 0; padding: 0; } .er li { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .er li > div { flex: 1; display: flex; flex-direction: column; min-width: 0; } .er small { color: var(--muted); font-size: 11px; }
    .ic { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--kb-dcfce7); color: var(--kf-15803d); flex-shrink: 0; } .ic.bad { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .cks { display: flex; gap: 14px; } .cks label, .ck { flex-direction: row !important; display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
    textarea.input { resize: vertical; font: inherit; }
    .ab { list-style: none; margin: 0 0 14px; padding: 0; border: 1px solid var(--border); border-radius: 8px; max-height: 240px; overflow: auto; }
    .ab li { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--kl-f1f2f6); font-size: 12.5px; }
    .ab li small { color: var(--muted); font-size: 11px; grid-column: 1; } .ab li .tag { grid-row: 1 / 3; grid-column: 2; align-self: center; }
    @media (max-width: 1250px) { .lay { grid-template-columns: 1fr; } .reqc { max-height: none; } }
  `,
})
export class ComplianceTracking extends TrnPage {
  protected readonly Math = Math;
  protected readonly certTag = certTag;
  protected readonly cs = certStatus;
  protected readonly reqs = REQS;
  protected readonly target = TARGET;
  protected readonly total = TOTAL_EMPLOYEES;
  protected readonly months = MONTHS_12;
  protected readonly dims: Dim[] = ['Department', 'Site', 'Role'];
  protected readonly channels = ['Email', 'SMS', 'In-app', 'Teams'];
  protected readonly tone = pctTone;
  protected readonly bg = pctBg;
  protected readonly dim = signal<Dim>('Department');
  protected readonly scope = signal<{ dim: Dim; val: string } | null>(null);
  protected readonly reqF = signal<string | null>(null);
  protected readonly reasonF = signal<NcReason | null>(null);
  protected readonly drawerEmp = signal<string | null>(null);

  protected req(id: string) {
    return this.store.reqById.get(id)!;
  }
  protected short(r: Req) {
    return r.name.replace(/ \(.*\)| coverage| authorisation| for MHE drivers| entrant & attendant| qualified persons| acknowledgement| training| Awareness| licensing/g, '').replace('Lockout / Tagout', 'LOTO').replace('Confined Space', 'Conf. Space');
  }
  protected ctName(id: string) {
    return CT.get(id)?.name ?? id;
  }
  protected uniq(rows: { empId: string }[]) {
    return new Set(rows.map((r) => r.empId)).size;
  }

  /* ---------- KPIs ---------- */
  protected readonly k = computed(() => {
    const nc = this.store.ncRows();
    const below = REQS.filter((r) => this.pctOf(r.id) < TARGET).length;
    return {
      gaps: nc.length,
      compliant: TOTAL_EMPLOYEES - this.uniq(nc),
      expired: nc.filter((x) => x.reason === 'Certificate expired').length,
      assigned: nc.filter((x) => this.isAssigned(x)).length,
      below,
    };
  });
  protected readonly delta = computed(() => Math.round((this.store.compliancePct() - COMPLIANCE_TREND[10]) * 10) / 10);
  private readonly ncByReq = computed(() => {
    const m = new Map<string, NcRow[]>();
    for (const x of this.store.ncRows()) m.set(x.reqId, [...(m.get(x.reqId) ?? []), x]);
    return m;
  });
  private pctOf(reqId: string) {
    const r = this.req(reqId);
    return Math.round((1 - (this.ncByReq().get(reqId)?.length ?? 0) / r.required) * 1000) / 10;
  }
  protected readonly reqStats = computed(() =>
    REQS.map((req) => {
      const g = this.ncByReq().get(req.id) ?? [];
      return { req, nc: g.length, pct: this.pctOf(req.id), assigned: g.filter((x) => this.isAssigned(x)).length };
    }).sort((a, b) => a.pct - b.pct),
  );
  private isAssigned(x: NcRow) {
    return x.reason !== 'Training overdue' && !!this.store.openEnroll(x.empId, this.req(x.reqId).courseId);
  }

  /* ---------- group breakdowns ---------- */
  private key(dim: Dim, p: { dept: string; site: string; role: string }) {
    return dim === 'Department' ? p.dept : dim === 'Site' ? p.site : p.role;
  }
  protected readonly groups = computed(() => {
    const dim = this.dim();
    const names = dim === 'Department' ? DEPTS : dim === 'Site' ? SITES : ROLES_ALL;
    const nc = new Map<string, number>();
    for (const x of this.store.ncRows()) {
      const k = this.key(dim, this.person(x.empId));
      nc.set(k, (nc.get(k) ?? 0) + 1);
    }
    return names
      .map((name) => {
        const obl = REQS.reduce((a, r) => a + obligation(r, (p) => this.key(dim, p) === name), 0);
        const n = nc.get(name) ?? 0;
        return { name, obl: Math.round(obl), nc: n, pct: obl ? Math.round(Math.max(0, 1 - n / obl) * 1000) / 10 : 100 };
      })
      .filter((g) => g.obl > 0)
      .sort((a, b) => a.pct - b.pct);
  });
  protected readonly heat = computed(() =>
    DEPTS.map((dept) => {
      let tObl = 0, tNc = 0;
      const cells = REQS.map((r) => {
        if (!reqDepts(r).includes(dept)) return null;
        const obl = obligation(r, (p) => p.dept === dept);
        const nc = (this.ncByReq().get(r.id) ?? []).filter((x) => this.person(x.empId).dept === dept).length;
        tObl += obl;
        tNc += nc;
        return { nc, pct: Math.round(Math.max(0, 1 - nc / (obl || 1)) * 100) };
      });
      return { dept, cells, pct: Math.round(Math.max(0, 1 - tNc / (tObl || 1)) * 1000) / 10 };
    }),
  );
  protected readonly trend = computed<Series[]>(() => [
    { name: 'Compliance %', color: 'var(--ka-7c3aed)', area: true, values: [...COMPLIANCE_TREND.slice(0, 11), this.store.compliancePct()] },
    { name: 'Target', color: 'var(--ka-16a34a)', dashed: true, values: MONTHS_12.map(() => TARGET) },
  ]);
  protected readonly reasons = computed(() => {
    const c = { 'Never trained': 0, 'Certificate expired': 0, 'Training overdue': 0 } as Record<NcReason, number>;
    for (const x of this.store.ncRows()) c[x.reason]++;
    return [
      { label: 'Never trained', value: c['Never trained'], color: 'var(--ka-8b5cf6)' },
      { label: 'Certificate expired', value: c['Certificate expired'], color: 'var(--ka-ef4444)' },
      { label: 'Training overdue', value: c['Training overdue'], color: 'var(--ka-f59e0b)' },
    ];
  });

  /* ---------- table ---------- */
  protected toggleScope(dim: Dim, val: string) {
    const s = this.scope();
    this.scope.set(s?.dim === dim && s.val === val ? null : { dim, val });
  }
  protected drill(dept: string, reqId: string) {
    this.scope.set({ dim: 'Department', val: dept });
    this.reqF.set(reqId);
    this.msg(`Showing ${this.req(reqId).name} gaps in ${dept}`);
  }
  protected readonly scopedRows = computed(() => {
    const s = this.scope(), rq = this.reqF(), rs = this.reasonF();
    return this.store.ncRows().filter((x) => (!rq || x.reqId === rq) && (!rs || x.reason === rs) && (!s || this.key(s.dim, this.person(x.empId)) === s.val));
  });
  protected readonly rows = computed(() => {
    const nudges = this.store.nudges();
    return this.scopedRows()
      .map((x) => {
        const p = this.person(x.empId);
        const r = this.req(x.reqId);
        const st = x.reason === 'Training overdue' ? 'Overdue' : this.isAssigned(x) ? 'Assigned' : nudges[x.empId] ? 'Nudged' : 'Non-compliant';
        return { ...x, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, site: p.site, role: p.role, reqName: r.name, regulation: r.regulation, days: -daysUntil(x.since), nudges: nudges[x.empId] ?? 0, status: st };
      })
      .sort((a, b) => b.days - a.days);
  });
  protected rowOf(x: NcRow) {
    return this.rows().find((r) => r.id === x.id) ?? x;
  }
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'reqName', label: 'Requirement', sub: 'regulation' },
    { key: 'reason', label: 'Gap', kind: 'tag', tag: (r) => (r.reason === 'Certificate expired' ? 'tag red' : r.reason === 'Training overdue' ? 'tag amber' : 'tag') },
    { key: 'dept', label: 'Department', sub: 'site' },
    { key: 'days', label: 'Days Open', kind: 'num' },
    { key: 'nudges', label: 'Nudges', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'site', label: 'Site', options: SITES },
    { key: 'reqName', label: 'Requirement', options: REQS.map((r) => r.name) },
    { key: 'status', label: 'Status', options: ['Non-compliant', 'Nudged', 'Assigned', 'Overdue'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'profile', label: 'View profile', icon: 'eye' },
    { id: 'nudge', label: 'Send nudge', icon: 'training-send' },
    { id: 'assign', label: 'Assign training', icon: 'graduation-cap', when: (r) => r.status !== 'Assigned' && r.status !== 'Overdue' },
    { id: 'record', label: 'Record completion', icon: 'training-check' },
    { id: 'plan', label: 'Open training plan', icon: 'list-checks' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'nudge', label: 'Send nudges' }, { id: 'assign', label: 'Assign training' }, { id: 'export', label: 'Export' }];
  private byIds(ids: string[]) {
    const s = new Set(ids);
    return this.rows().filter((r) => s.has(r.id));
  }
  protected act(a: string, r: NcRow) {
    if (a === 'profile') return this.drawerEmp.set(r.empId);
    if (a === 'nudge') return this.openNudge([r]);
    if (a === 'assign') return this.openAssign([r]);
    if (a === 'plan') return this.go('training-plan-enrollment', { emp: r.empId });
    this.record(r);
  }
  protected bulkAct(a: string, ids: string[]) {
    const rows = this.byIds(ids);
    if (a === 'nudge') return this.openNudge(rows);
    if (a === 'assign') return this.openAssign(rows);
    this.csv('compliance-gaps-selected.csv', rows);
  }
  protected gapsOf(reqId: string) {
    return this.store.ncRows().filter((x) => x.reqId === reqId);
  }

  /* ---------- drawer ---------- */
  protected applicable(empId: string) {
    const p = this.person(empId);
    const own = new Set(this.store.ncRows().filter((x) => x.empId === empId).map((x) => x.reqId));
    return REQS.filter((r) => reqDepts(r).includes(p.dept) || own.has(r.id));
  }
  protected readonly empGaps = computed(() => this.store.ncRows().filter((x) => x.empId === this.drawerEmp()));
  protected readonly empRows = computed(() => this.rows().filter((x) => x.empId === this.drawerEmp()).length ? this.rows().filter((x) => x.empId === this.drawerEmp()) : this.empGaps());
  protected readonly drawerRow = computed(() => this.rows().find((r) => r.empId === this.drawerEmp()) ?? null);
  protected gapFor(reqId: string) {
    return this.empGaps().find((x) => x.reqId === reqId) ?? null;
  }

  /* ---------- record completion ---------- */
  protected record(x: NcRow) {
    const p = this.person(x.empId);
    const r = this.req(x.reqId);
    if (x.reason === 'Certificate expired' && x.ref) this.store.renew(x.ref);
    else if (x.reason === 'Training overdue' && x.ref) this.store.completeEnroll(x.ref, 86);
    else {
      this.store.cleared.update((l) => [...l, `${x.reqId}:${x.empId}`]);
      const open = this.store.openEnroll(x.empId, r.courseId);
      if (open) this.store.completeEnroll(open.id, 88);
    }
    if (this.store.empById().has(x.empId)) this.store.addLog(`Compliance gap closed: ${r.name}`, x.empId);
    this.msg(`${r.name} recorded as complete for ${p.name} · compliance now ${this.store.compliancePct()}%`);
  }

  /* ---------- nudge ---------- */
  protected readonly nudge = signal<{ rows: NcRow[]; ch: string[]; cc: boolean; text: string } | null>(null);
  protected openNudge(rows: NcRow[]) {
    if (!rows.length) return this.msg('No open gaps in the current view');
    const one = this.uniq(rows) === 1 ? this.person(rows[0].empId).name.split(' ')[0] : '{first name}';
    const names = [...new Set(rows.map((x) => this.req(x.reqId).name))].slice(0, 3).join(', ');
    this.nudge.set({
      rows, ch: ['Email', 'In-app'], cc: true,
      text: `Hi ${one},\n\nOur records show you are not yet compliant with: ${names}${rows.length > 3 ? ' …' : ''}.\nPlease complete the assigned training before the due date to stay authorised for your role.\n\nThank you,\nHSE & Training Team`,
    });
  }
  protected toggleCh(c: string) {
    const n = this.nudge()!;
    this.nudge.set({ ...n, ch: n.ch.includes(c) ? n.ch.filter((x) => x !== c) : [...n.ch, c] });
  }
  protected sendNudge() {
    const n = this.nudge()!;
    const emps = [...new Set(n.rows.map((x) => x.empId))];
    this.store.nudges.update((m) => {
      const o = { ...m };
      emps.forEach((e) => (o[e] = (o[e] ?? 0) + 1));
      return o;
    });
    emps.filter((e) => this.store.empById().has(e)).forEach((e) => this.store.addLog(`Compliance nudge sent via ${n.ch.join(', ')}`, e));
    this.nudge.set(null);
    this.msg(`Nudge sent to ${emps.length} employee(s) via ${n.ch.join(' + ')}${n.cc ? ' · managers copied' : ''}`);
  }

  /* ---------- assign ---------- */
  protected readonly assign = signal<{ rows: NcRow[]; due: string; notify: string } | null>(null);
  protected openAssign(rows: NcRow[]) {
    const todo = rows.filter((x) => x.reason !== 'Training overdue' && !this.isAssigned(x));
    if (!todo.length) return this.msg('Everyone in this selection already has training assigned');
    this.assign.set({ rows: todo, due: iso(21), notify: 'Employee + manager' });
  }
  protected readonly assignGroups = computed(() => {
    const a = this.assign();
    if (!a) return [];
    const m = new Map<string, number>();
    a.rows.forEach((x) => m.set(x.reqId, (m.get(x.reqId) ?? 0) + 1));
    return [...m.entries()].map(([id, n]) => ({ req: this.req(id), n }));
  });
  protected doAssign() {
    const a = this.assign()!;
    let n = 0;
    for (const g of this.assignGroups()) n += this.store.enroll(a.rows.filter((x) => x.reqId === g.req.id).map((x) => x.empId), g.req.courseId, a.due, 'Compliance');
    this.assign.set(null);
    this.msg(`${n} enrolment(s) created · due ${this.fd(a.due)}${a.notify !== 'Do not notify' ? ' · notifications sent' : ''}`);
  }

  /* ---------- export ---------- */
  private csv(name: string, rows: ReturnType<ComplianceTracking['rows']>) {
    downloadCsv(name, [['Employee ID', 'Employee', 'Department', 'Site', 'Role', 'Requirement', 'Regulation', 'Gap', 'Since', 'Days Open', 'Nudges', 'Status'], ...rows.map((r) => [r.empId, r.name, r.dept, r.site, r.role, r.reqName, r.regulation, r.reason, r.since, r.days, r.nudges, r.status])]);
  }
  protected exportCsv() {
    this.csv('compliance-gaps.csv', this.rows());
    this.msg(`Exported ${this.rows().length} gaps`);
  }
}
