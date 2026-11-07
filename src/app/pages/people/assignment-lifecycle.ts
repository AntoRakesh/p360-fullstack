import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { PEOPLE, SITES } from './people.data';

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const shortDate = (v: string) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/* ======================= Person-to-Site / Zone Assignment ======================= */
const ZONES: Record<string, string[]> = {
  'Head Office': ['Main Entrance', 'Lobby', 'Office F1-F4', 'Executive Floor', 'Server Room', 'Canteen', 'Parking'],
  Manufacturing: ['Gate 2', 'Production Line', 'Labs', 'Chemical Store', 'Canteen', 'Parking'],
  Warehouse: ['Gate 1', 'Warehouse Floor', 'Cold Store', 'Loading Bay', 'Parking'],
  'Regional Office': ['Main Entrance', 'Office Floor', 'Meeting Rooms'],
  'Tech Center': ['Main Entrance', 'Labs', 'Demo Area', 'Server Room'],
  'Data Center': ['Security Gate', 'Data Hall A', 'Data Hall B', 'NOC'],
  'Logistics Hub': ['Gate', 'Dispatch', 'Fleet Yard'],
  'Retail Stores': ['Shop Floor', 'Back Office', 'Stock Room'],
};
const LEVELS = ['Visitor', 'Standard', 'Restricted', 'Administrator'];
interface Assign {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  type: string;
  site: string;
  zones: string[];
  level: string;
  validUntil: string;
  status: string;
}
const ASSIGNS: Assign[] = (() => {
  const r = rng(515);
  return PEOPLE.slice(0, 1500).map((p, i) => {
    const z = ZONES[p.site] ?? ZONES['Head Office'];
    const zones = z.filter((_, k) => k === 0 || r() < (p.type === 'Visitor' ? 0.15 : 0.55));
    const level = p.type === 'Visitor' ? 'Visitor' : zones.some((x) => /Server|Data Hall|Chemical|Executive/.test(x)) ? 'Restricted' : r() < 0.03 ? 'Administrator' : 'Standard';
    const until = p.type === 'Employee' ? '' : iso(Math.round(-10 + r() * 200));
    return {
      id: `ASG-${70000 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type: p.type, site: p.site, zones, level,
      validUntil: until, status: until && until < iso(0) ? 'Expired' : p.status === 'Active' ? 'Active' : 'Suspended',
    };
  });
})();

@Component({
  selector: 'app-zone-assignment',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Person-to-Site / Zone Assignment" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Which sites and zones each person may enter, with access level and validity.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />New Assignment</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Active Assignments" [value]="cnt('Active')" icon="map-pin" color="#8b5cf6" />
      <app-kpi label="Restricted Zone Access" [value]="lvl('Restricted')" icon="shield" color="#ef4444" sub="people" />
      <app-kpi label="Expiring in 14 days" [value]="expiring()" icon="clock" color="#f59e0b" />
      <app-kpi label="Expired" [value]="cnt('Expired')" icon="ban" color="#9ca3af" sub="auto-revoked" />
      <app-kpi label="Sites Covered" [value]="sites.length" icon="building" color="#3b82f6" />
    </section>
    <section class="dash">
      <div class="card span-6">
        <div class="card-head">
          <h3>Assigned People by Zone</h3>
          <select class="select" [value]="zoneSite()" (change)="zoneSite.set($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select>
        </div>
        <app-bar-list [rows]="byZone()" [max]="byZone()[0]?.value || 1" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Access Levels</h3></div>
        <app-donut [segments]="levels()" center="Assignments" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="assignments" [searchKeys]="['name', 'personId', 'site']" searchPlaceholder="Search person or site..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit assignment · ' + f.name : 'New assignment' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          @if (!f.id) {
            <label class="full">Person
              <input class="input" list="assign-people" placeholder="Type a name or ID" (change)="pickPerson($any($event.target).value)" required />
              <datalist id="assign-people">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist>
            </label>
          }
          <label>Site
            <select class="select" [value]="f.site" (change)="patchForm({ site: $any($event.target).value, zones: [] })">@for (s of sites; track s) {<option>{{ s }}</option>}</select>
          </label>
          <label>Access level
            <select class="select" [value]="f.level" (change)="patchForm({ level: $any($event.target).value })">@for (l of levelNames; track l) {<option>{{ l }}</option>}</select>
          </label>
          <div class="full zone-pick">
            <span>Zones</span>
            @for (z of zonesFor(f.site); track z) {
              <label><input type="checkbox" [checked]="f.zones.includes(z)" (change)="toggleZone(z)" />{{ z }}</label>
            }
          </div>
          <label class="full">Valid until (blank = permanent)<input class="input" type="date" [value]="f.validUntil" (change)="patchForm({ validUntil: $any($event.target).value })" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save assignment</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `.zone-pick { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12.5px; } .zone-pick > span { width: 100%; color: #4b4f6b; font-size: 12px; }
    .zone-pick label { display: flex; align-items: center; gap: 6px; flex-direction: row !important; color: var(--text) !important; }`,
})
export class ZoneAssignment {
  protected readonly sites = SITES;
  protected readonly levelNames = LEVELS;
  protected readonly pick = PEOPLE.slice(0, 400);
  protected readonly list = signal<Assign[]>(ASSIGNS);
  protected readonly zoneSite = signal('Head Office');
  protected readonly form = signal<Assign | null>(null);
  protected readonly err = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'type', label: 'Type' },
    { key: 'site', label: 'Site' },
    { key: 'zones', label: 'Zones', kind: 'chips', sortable: false },
    { key: 'level', label: 'Access Level', kind: 'tag', tag: (r) => ({ Visitor: 'tag blue', Standard: 'tag', Restricted: 'tag red', Administrator: 'tag amber' })[r.level as string] ?? 'tag' },
    { key: 'validUntil', label: 'Valid Until', fmt: (v) => (v ? shortDate(v) : 'Permanent') },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'site', label: 'Site', options: SITES },
    { key: 'level', label: 'Level', options: LEVELS },
    { key: 'status', label: 'Status', options: ['Active', 'Suspended', 'Expired', 'Revoked'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'edit', label: 'Edit zones', icon: 'map-pin' },
    { id: 'extend', label: 'Extend 90 days', icon: 'calendar-days', when: (r) => !!r.validUntil },
    { id: 'revoke', label: 'Revoke', icon: 'ban', danger: true, when: (r) => r.status !== 'Revoked' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'extend', label: 'Extend 90 days' }, { id: 'revoke', label: 'Revoke', danger: true }];
  protected readonly byZone = computed(() =>
    (ZONES[this.zoneSite()] ?? []).map((z) => {
      const v = this.list().filter((a) => a.site === this.zoneSite() && a.zones.includes(z) && a.status === 'Active').length;
      return { label: z, value: v, display: String(v), color: /Server|Data Hall|Chemical|Executive/.test(z) ? '#ef4444' : '#8b5cf6' };
    }),
  );
  protected readonly levels = computed(() => LEVELS.map((l, i) => ({ label: l, value: +this.lvl(l), color: ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b'][i] })));
  protected readonly expiring = computed(() => String(this.list().filter((a) => a.validUntil && a.validUntil >= iso(0) && a.validUntil <= iso(14)).length));

  protected cnt(s: string) {
    return this.list().filter((a) => a.status === s).length.toLocaleString();
  }
  protected lvl(l: string) {
    return String(this.list().filter((a) => a.level === l).length);
  }
  protected zonesFor(site: string) {
    return ZONES[site] ?? [];
  }
  protected openForm(a?: Assign) {
    this.err.set('');
    this.form.set(a ? { ...a, zones: [...a.zones] } : { id: '', name: '', initials: '', avatar: '#7c3aed', personId: '', type: '', site: 'Head Office', zones: ['Main Entrance'], level: 'Standard', validUntil: '', status: 'Active' });
  }
  protected patchForm(c: Partial<Assign>) {
    this.form.update((f) => (f ? { ...f, ...c } : f));
  }
  protected pickPerson(v: string) {
    const p = PEOPLE.find((x) => x.id === v.split(' · ')[0]);
    if (p) this.patchForm({ name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type: p.type, site: p.site, zones: [(ZONES[p.site] ?? ['Main Entrance'])[0]] });
  }
  protected toggleZone(z: string) {
    const f = this.form()!;
    this.patchForm({ zones: f.zones.includes(z) ? f.zones.filter((x) => x !== z) : [...f.zones, z] });
  }
  protected save() {
    const f = this.form()!;
    if (!f.personId) return this.err.set('Choose a person from the list.');
    if (!f.zones.length) return this.err.set('Select at least one zone.');
    const status = f.validUntil && f.validUntil < iso(0) ? 'Expired' : 'Active';
    if (f.id) this.list.update((l) => l.map((a) => (a.id === f.id ? { ...f, status } : a)));
    else this.list.update((l) => [{ ...f, id: `ASG-${80000 + l.length}`, status }, ...l]);
    this.form.set(null);
    this.notify(`Assignment saved for ${f.name}`);
  }
  protected act(a: string, row: Assign) {
    if (a === 'edit') return this.openForm(row);
    this.bulkAct(a, [row.id]);
  }
  protected bulkAct(a: string, ids: string[]) {
    const set = new Set(ids);
    this.list.update((l) => l.map((x) => (set.has(x.id) ? (a === 'revoke' ? { ...x, status: 'Revoked' } : { ...x, validUntil: iso(90), status: 'Active' }) : x)));
    this.notify(`${ids.length} assignment(s) ${a === 'revoke' ? 'revoked' : 'extended'}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Identity Lifecycle & Offboarding ======================= */
const STAGES = ['Pre-boarding', 'Onboarding', 'Transfer', 'Notice Period', 'Offboarding', 'Archived'];
const STAGE_COLOR: Record<string, string> = { 'Pre-boarding': '#3b82f6', Onboarding: '#8b5cf6', Transfer: '#06b6d4', 'Notice Period': '#f59e0b', Offboarding: '#ef4444', Archived: '#64748b' };
const TASKS: Record<string, string[]> = {
  'Pre-boarding': ['Create identity record', 'Background check', 'Send welcome pack', 'Order laptop & badge'],
  Onboarding: ['Issue access card', 'Enroll face & fingerprint', 'Assign sites & zones', 'Safety induction', 'Create system accounts'],
  Transfer: ['Update department & manager', 'Re-assign zones', 'Transfer assets', 'Notify payroll'],
  'Notice Period': ['Knowledge handover plan', 'Schedule exit interview', 'Plan asset return'],
  Offboarding: ['Revoke building access', 'Disable credentials & mobile wallet', 'Delete biometric templates', 'Collect laptop & badge', 'Final settlement', 'Archive profile'],
  Archived: ['Retention timer started'],
};
interface Case {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  dept: string;
  stage: string;
  owner: string;
  start: string;
  due: string;
  done: boolean[];
  progress: number;
}
const CASES: Case[] = (() => {
  const r = rng(717);
  const counts: Record<string, number> = { 'Pre-boarding': 24, Onboarding: 37, Transfer: 12, 'Notice Period': 18, Offboarding: 9, Archived: 14 };
  let i = 0;
  return STAGES.flatMap((stage) =>
    Array.from({ length: counts[stage] }, () => {
      const p = PEOPLE[100 + i * 37];
      const n = TASKS[stage].length;
      const done = TASKS[stage].map(() => stage === 'Archived' || r() < 0.45);
      i++;
      return {
        id: `LC-${3000 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, dept: p.dept, stage,
        owner: ['HR Ops', 'IT Service Desk', 'Security', 'Line Manager'][Math.floor(r() * 4)],
        start: iso(-Math.floor(r() * 20)), due: iso(Math.floor(r() * 25) - 3), done,
        progress: Math.round((done.filter(Boolean).length / n) * 100),
      };
    }),
  );
})();

@Component({
  selector: 'app-lifecycle',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Identity Lifecycle &amp; Offboarding" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Track joiners, movers and leavers, and make sure access is removed on exit." />
    <section class="pipeline">
      @for (s of stages; track s) {
        <button class="card stage" [class.on]="stage() === s" [style.border-top-color]="color[s]" (click)="stage.set(stage() === s ? null : s)">
          <span>{{ s }}</span><b [style.color]="color[s]">{{ count(s) }}</b><small>{{ overdue(s) }} overdue</small>
        </button>
      }
    </section>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="rows()" [columns]="cols" noun="cases" [searchKeys]="['name', 'personId', 'dept']" searchPlaceholder="Search person or department..."
          [filters]="filters" [activeId]="sel()?.id ?? null" (rowClick)="selId.set($event.id)" [actions]="actions" (action)="move($event.row, $event.action)" />
      </div>
      <div class="span-4 side">
        @if (sel(); as c) {
          <div class="card">
            <div class="card-head"><h3>{{ c.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <p class="muted"><span class="tag" [style.background]="color[c.stage] + '22'" [style.color]="color[c.stage]">{{ c.stage }}</span> · {{ c.dept }} · owner {{ c.owner }}</p>
            <div class="prog"><i [style.width.%]="c.progress"></i></div>
            <p class="muted">{{ c.progress }}% complete · due {{ c.due }}</p>
            <ul class="tasks">
              @for (t of tasks[c.stage]; track t; let i = $index) {
                <li [class.done]="c.done[i]"><label><input type="checkbox" [checked]="c.done[i]" (change)="toggleTask(c, i)" />{{ t }}</label></li>
              }
            </ul>
            @if (c.progress === 100 && next(c.stage)) {
              <button class="btn-primary" (click)="move(c, 'advance')">Move to {{ next(c.stage) }}</button>
            } @else if (next(c.stage)) {
              <p class="muted">Complete all tasks to move to {{ next(c.stage) }}.</p>
            }
          </div>
        }
        <div class="card">
          <div class="card-head"><h3>Joiners vs Leavers</h3></div>
          <app-column-chart [labels]="['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']" [series]="flow" [height]="190" />
        </div>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .stage { display: flex; flex-direction: column; gap: 2px; border-top: 4px solid; text-align: left; cursor: pointer; font-family: inherit; }
    .stage.on { box-shadow: 0 0 0 2px var(--primary-soft); border-color: var(--primary); }
    .stage span { font-size: 12.5px; color: #4b4f6b; } .stage b { font-size: 24px; } .stage small { font-size: 11px; color: var(--muted); }
    .side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .prog { height: 8px; border-radius: 4px; background: #eef0f6; overflow: hidden; margin: 10px 0 4px; }
    .prog i { display: block; height: 100%; background: var(--primary); transition: width .3s; }
    .tasks { list-style: none; margin: 10px 0 14px; padding: 0; font-size: 13px; }
    .tasks li { padding: 6px 0; border-bottom: 1px solid #f0f1f6; } .tasks label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
    .tasks li.done { color: var(--muted); text-decoration: line-through; } .tasks input { accent-color: var(--primary); }
  `,
})
export class Lifecycle {
  protected readonly stages = STAGES;
  protected readonly color = STAGE_COLOR;
  protected readonly tasks = TASKS;
  protected readonly list = signal<Case[]>(CASES);
  protected readonly stage = signal<string | null>(null);
  protected readonly selId = signal<string | null>(CASES.find((c) => c.stage === 'Offboarding')!.id);
  protected readonly toast = signal<string | null>(null);
  protected readonly flow = [
    { name: 'Joiners', color: '#7c3aed', values: [61, 80, 67, 52, 58, 64] },
    { name: 'Leavers', color: '#f87171', values: [20, 28, 23, 19, 16, 21] },
  ];
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'stage', label: 'Stage', kind: 'tag', tag: (r) => (r.stage === 'Offboarding' ? 'tag red' : r.stage === 'Notice Period' ? 'tag amber' : r.stage === 'Archived' ? 'tag grey' : 'tag') },
    { key: 'dept', label: 'Department' },
    { key: 'owner', label: 'Owner' },
    { key: 'due', label: 'Due', fmt: shortDate },
    { key: 'progress', label: 'Progress', kind: 'progress' },
  ];
  protected readonly filters = [{ key: 'owner', label: 'Owner', options: ['HR Ops', 'IT Service Desk', 'Security', 'Line Manager'] }];
  protected readonly actions: RowAction[] = [
    { id: 'advance', label: 'Move to next stage', icon: 'chevron-right', when: (r) => r.stage !== 'Archived' },
    { id: 'offboard', label: 'Start offboarding', icon: 'door-open', danger: true, when: (r) => r.stage === 'Notice Period' || r.stage === 'Transfer' },
  ];
  protected readonly rows = computed(() => (this.stage() ? this.list().filter((c) => c.stage === this.stage()) : this.list()));
  protected readonly sel = computed(() => this.list().find((c) => c.id === this.selId()) ?? null);

  protected count(s: string) {
    return this.list().filter((c) => c.stage === s).length;
  }
  protected overdue(s: string) {
    return this.list().filter((c) => c.stage === s && c.progress < 100 && c.due < iso(0)).length;
  }
  protected next(s: string) {
    return { 'Pre-boarding': 'Onboarding', Onboarding: 'Active (done)', Transfer: 'Active (done)', 'Notice Period': 'Offboarding', Offboarding: 'Archived' }[s] ?? null;
  }
  protected toggleTask(c: Case, i: number) {
    const done = c.done.map((d, j) => (j === i ? !d : d));
    this.patch(c.id, { done, progress: Math.round((done.filter(Boolean).length / done.length) * 100) });
  }
  protected move(c: Case, a: string) {
    this.selId.set(c.id);
    let stage = a === 'offboard' ? 'Offboarding' : this.next(c.stage);
    if (!stage) return;
    if (stage.startsWith('Active')) {
      this.list.update((l) => l.filter((x) => x.id !== c.id));
      this.selId.set(null);
      return this.notify(`${c.name} is now fully active`);
    }
    const done = TASKS[stage].map(() => stage === 'Archived');
    this.patch(c.id, { stage, done, progress: stage === 'Archived' ? 100 : 0, due: iso(14) });
    this.notify(`${c.name} moved to ${stage}${stage === 'Archived' ? ' · all access revoked' : ''}`);
  }
  private patch(id: string, c: Partial<Case>) {
    this.list.update((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}
