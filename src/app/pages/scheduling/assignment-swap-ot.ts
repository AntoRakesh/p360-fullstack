import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { DEPTS, SITES } from '../people/people.data';
import { RECORDS } from '../attendance/attendance.data';
import { codeColor, restViolation, SHIFTS, TEMPLATES } from './shifts.data';

const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);
const short = (v: string) => new Date(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ACTIVE = SHIFTS.filter((s) => s.status === 'Active');
const SHIFT_FOR_DEPT: Record<string, string[]> = {
  Operations: ['RS-A', 'RS-B', 'RS-C', 'P12-D', 'P12-N'], Logistics: ['WH-E', 'WH-L'], 'Facility Maintenance': ['MS-01', 'ES-01', 'NS-01'],
  Sales: ['RT-O', 'RT-C', 'GO-01'], Support: ['DC-A', 'DC-B', 'DS-01'], IT: ['DS-01', 'GO-01', 'RM-01'],
};

/* ======================= Employee Shift Assignment ======================= */
interface Assign {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  dept: string;
  site: string;
  shift: string;
  shiftName: string;
  color: string;
  template: string;
  from: string;
  to: string;
}
const ASSIGNS: Assign[] = (() => {
  const r = rng(5150);
  return RECORDS.map((x) => {
    const opts = SHIFT_FOR_DEPT[x.dept] ?? ['DS-01', 'GO-01'];
    const code = r() < 0.04 ? 'RM-01' : opts[Math.floor(r() * opts.length)];
    const s = SHIFTS.find((y) => y.code === code)!;
    const tpl = TEMPLATES.find((t) => t.cycle.includes(code));
    return { id: x.id, name: x.name, initials: x.initials, avatar: x.avatar, dept: x.dept, site: x.site, shift: code, shiftName: s.name, color: s.color, template: tpl?.name ?? 'Fixed', from: iso(-Math.floor(r() * 300)), to: '' };
  });
})();

@Component({
  selector: 'app-shift-assignment',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Employee Shift Assignment" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Which default shift and rotation each employee works, with effective dates." />
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Employees per Shift</h3></div>
        <app-bar-list [rows]="perShift()" [max]="perShift()[0]?.value || 1" />
      </div>
      <div class="card span-8">
        <app-data-table [rows]="rows()" [columns]="cols" noun="employees" [selectable]="true" [searchKeys]="['name', 'id', 'shiftName']" searchPlaceholder="Search employee or shift..."
          [filters]="filters" [actions]="actions" [bulkActions]="bulk" (action)="open([$event.row.id])" (bulk)="open($event.ids)" />
      </div>
    </section>
    @if (target(); as ids) {
      <div class="g-overlay" (click)="target.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); assign(ids, s.value, f.value, t.value)">
        <div class="modal-head"><h3>Assign shift · {{ ids.length === 1 ? nameOf(ids[0]) : ids.length + ' employees' }}</h3><button type="button" class="close-btn" (click)="target.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Shift<select #s class="select">@for (x of active; track x.code) {<option [value]="x.code">{{ x.code }} · {{ x.name }} ({{ x.start || 'flex' }}–{{ x.end }})</option>}</select></label>
          <label>Effective from<input #f class="input" type="date" [value]="tomorrow" /></label>
          <label>Until (optional)<input #t class="input" type="date" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="target.set(null)">Cancel</button><button class="btn-primary" type="submit">Assign</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class ShiftAssignment {
  private readonly state = inject(AppState);
  protected readonly active = ACTIVE;
  protected readonly tomorrow = iso(1);
  protected readonly list = signal<Assign[]>(ASSIGNS);
  protected readonly target = signal<string[] | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
    { key: 'dept', label: 'Department' },
    { key: 'site', label: 'Site' },
    { key: 'shiftName', label: 'Shift', kind: 'tag', tag: () => 'tag' },
    { key: 'shift', label: 'Code' },
    { key: 'template', label: 'Rotation' },
    { key: 'from', label: 'Effective From', fmt: short },
    { key: 'to', label: 'Until', fmt: (v) => (v ? short(v) : 'Ongoing') },
  ];
  protected readonly filters = [
    { key: 'shift', label: 'Shift', options: ACTIVE.map((s) => s.code) },
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'site', label: 'Site', options: SITES },
  ];
  protected readonly actions: RowAction[] = [{ id: 'assign', label: 'Change shift', icon: 'refresh' }];
  protected readonly bulk: RowAction[] = [{ id: 'assign', label: 'Assign shift' }];
  protected readonly rows = computed(() => {
    const s = this.state.site();
    return s.factor === 1 ? this.list() : this.list().filter((a) => a.site === s.name);
  });
  protected readonly perShift = computed(() => {
    const m = new Map<string, number>();
    this.rows().forEach((a) => m.set(a.shift, (m.get(a.shift) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([code, v]) => ({ label: `${code} · ${SHIFTS.find((s) => s.code === code)!.name}`, value: v, display: v.toLocaleString(), color: codeColor(code) }));
  });
  protected open(ids: string[]) {
    this.target.set(ids);
  }
  protected nameOf(id: string) {
    return this.list().find((a) => a.id === id)?.name ?? id;
  }
  protected assign(ids: string[], code: string, from: string, to: string) {
    const s = SHIFTS.find((x) => x.code === code)!;
    const set = new Set(ids);
    this.list.update((l) => l.map((a) => (set.has(a.id) ? { ...a, shift: code, shiftName: s.name, color: s.color, from, to, template: 'Fixed' } : a)));
    this.target.set(null);
    this.toast.set(`${ids.length} employee(s) assigned to ${s.name} from ${short(from)}`);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Shift Swap & Requests ======================= */
interface SwapReq {
  id: string;
  type: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  with: string;
  date: string;
  from: string;
  to: string;
  reason: string;
  status: string;
}
const REQ_TYPES = ['Shift swap', 'Change shift', 'Cover request', 'Day off'];
const SWAPS: SwapReq[] = (() => {
  const r = rng(808);
  const pool = RECORDS.filter((x) => x.dept === 'Operations' || x.dept === 'Logistics' || x.dept === 'Facility Maintenance').slice(0, 60);
  const reasons = ['Family function', 'Medical appointment', 'Exam at university', 'Childcare', 'Travel', 'Personal errand'];
  return pool.slice(0, 32).map((x, i) => {
    const type = REQ_TYPES[i % 4];
    const opts = SHIFT_FOR_DEPT[x.dept] ?? ['DS-01'];
    const from = opts[Math.floor(r() * opts.length)];
    const to = type === 'Day off' ? 'OFF' : opts[(opts.indexOf(from) + 1) % opts.length];
    const mate = pool[(i * 7 + 5) % pool.length];
    return {
      id: `SW-${3100 + i}`, type, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id,
      with: type === 'Shift swap' || type === 'Cover request' ? mate.name : '—', date: iso(1 + Math.floor(r() * 12)), from, to,
      reason: reasons[Math.floor(r() * reasons.length)], status: i < 14 ? 'Pending' : r() < 0.8 ? 'Approved' : 'Rejected',
    };
  });
})();

@Component({
  selector: 'app-shift-swap',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Shift Swap &amp; Requests" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Swaps, shift changes, cover and day-off requests with automatic rule checks.">
      <button class="btn-primary" (click)="form.set(true)"><app-icon name="plus" [size]="16" />New Request</button>
    </app-page-head>
    <section class="kpi-row">
      @for (t of types; track t) {<app-kpi [label]="t + 's'" [value]="byType(t)" [icon]="icon(t)" color="var(--ka-8b5cf6)" sub="pending" />}
      <app-kpi label="Auto-approved" value="62%" icon="sparkles" color="var(--ka-22c55e)" sub="passed all checks" />
    </section>
    <section class="sw" [class.with-detail]="!!sel()">
      <div class="card">
        <app-data-table [rows]="list()" [columns]="cols" noun="requests" [searchKeys]="['name', 'empId', 'with', 'reason']" searchPlaceholder="Search..." [filters]="filters"
          [activeId]="selId()" (rowClick)="selId.set($event.id)" [actions]="actions" (action)="decide($event.row, $event.action)" />
      </div>
      @if (sel(); as q) {
        <aside class="card detail">
          <div class="card-head"><h3>{{ q.id }} · {{ q.type }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="pair">
            <div class="side"><span class="dt-av" [style.background]="q.avatar">{{ q.initials }}</span><b>{{ q.name }}</b><span class="chipc" [style.background]="color(q.from)">{{ q.from }}</span></div>
            <span class="arrow">⇄</span>
            <div class="side"><span class="dt-av" style="background:var(--kb-64748b)">{{ q.with === '—' ? '—' : q.with.split(' ').map(first).join('') }}</span><b>{{ q.with === '—' ? 'New shift' : q.with }}</b><span class="chipc" [style.background]="q.to === 'OFF' ? 'var(--ka-9ca3af)' : color(q.to)">{{ q.to }}</span></div>
          </div>
          <dl class="kv"><dt>Date</dt><dd>{{ short(q.date) }}</dd><dt>Reason</dt><dd>{{ q.reason }}</dd><dt>Status</dt><dd><span [class]="tag(q.status)">{{ q.status }}</span></dd></dl>
          <h4>Automatic checks</h4>
          <ul class="checks">
            @for (c of checks(q); track c.label) {<li [class.fail]="!c.ok">{{ c.ok ? '✓' : '✕' }} {{ c.label }}</li>}
          </ul>
          @if (q.status === 'Pending') {
            <div class="toolbar"><button class="btn-primary" (click)="decide(q, 'Approved')">Approve</button><button class="btn-ghost danger" (click)="decide(q, 'Rejected')">Reject</button></div>
          }
        </aside>
      }
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create(p.value, t.value, w.value, d.value, s.value, why.value)">
        <div class="modal-head"><h3>New Request</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label>Employee<input #p class="input" list="sw-emps" required /><datalist id="sw-emps">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist></label>
          <label>Type<select #t class="select">@for (x of types; track x) {<option>{{ x }}</option>}</select></label>
          <label>Swap / cover with (optional)<input #w class="input" list="sw-emps" /></label>
          <label>Date<input #d class="input" type="date" [value]="tomorrow" /></label>
          <label>Requested shift<select #s class="select"><option value="OFF">Day off</option>@for (x of active; track x.code) {<option [value]="x.code">{{ x.code }} · {{ x.name }}</option>}</select></label>
          <label>Reason<input #why class="input" required /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Submit</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .sw { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .sw.with-detail { grid-template-columns: minmax(0, 1fr) 340px; }
    .detail { position: sticky; top: 76px; }
    .pair { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
    .side { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; text-align: center; flex: 1; }
    .arrow { font-size: 22px; color: var(--primary); }
    .chipc { padding: 2px 8px; border-radius: 6px; color: var(--kf-ffffff); font-weight: 700; font-size: 11px; }
    .kv { display: grid; grid-template-columns: 70px 1fr; gap: 8px; font-size: 12.5px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { font-size: 13px; margin: 12px 0 6px; }
    .checks { list-style: none; margin: 0 0 12px; padding: 0; font-size: 12.5px; } .checks li { padding: 4px 0; color: var(--kf-15803d); } .checks li.fail { color: var(--kf-b91c1c); }
    .danger { color: var(--red); }
    @media (max-width: 1100px) { .sw.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
  `,
})
export class ShiftSwap {
  protected readonly types = REQ_TYPES;
  protected readonly active = ACTIVE;
  protected readonly pick = RECORDS.slice(0, 200);
  protected readonly tomorrow = iso(1);
  protected readonly color = codeColor;
  protected readonly short = short;
  protected readonly first = (s: string) => s[0];
  protected readonly list = signal<SwapReq[]>(SWAPS);
  protected readonly selId = signal<string | null>(SWAPS[0].id);
  protected readonly form = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.list().find((x) => x.id === this.selId()) ?? null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Requested by', kind: 'person', sub: 'empId' },
    { key: 'type', label: 'Type' },
    { key: 'date', label: 'Date', fmt: short },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'with', label: 'With' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'type', label: 'Type', options: REQ_TYPES }, { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] }];
  protected readonly actions: RowAction[] = [
    { id: 'Approved', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
  ];

  protected byType(t: string) {
    return this.list().filter((x) => x.type === t && x.status === 'Pending').length;
  }
  protected icon(t: string) {
    return { 'Shift swap': 'refresh', 'Change shift': 'clock', 'Cover request': 'users', 'Day off': 'calendar-x' }[t] ?? 'clock';
  }
  protected tag(s: string) {
    return s === 'Approved' ? 'tag green' : s === 'Rejected' ? 'tag red' : 'tag amber';
  }
  /** Rule checks used to decide auto-approval. */
  protected checks(q: SwapReq) {
    const n = +q.id.slice(3);
    return [
      { label: 'Both employees qualified for the shifts', ok: n % 5 !== 0 },
      { label: 'At least 11 h rest before and after', ok: !restViolation(q.to, q.from) || q.to === 'OFF' },
      { label: 'Weekly hours stay under 48 h', ok: n % 7 !== 0 },
      { label: 'Minimum shift coverage maintained', ok: q.type !== 'Day off' || n % 3 !== 0 },
      { label: 'No overtime cost created', ok: q.type !== 'Cover request' },
    ];
  }
  protected decide(q: SwapReq, status: string) {
    this.list.update((l) => l.map((x) => (x.id === q.id ? { ...x, status } : x)));
    this.toast.set(`${q.id} ${status.toLowerCase()} · ${q.name} notified`);
    setTimeout(() => this.toast.set(null), 2000);
  }
  protected create(p: string, type: string, w: string, date: string, to: string, reason: string) {
    const x = RECORDS.find((r) => r.id === p.split(' · ')[0]);
    if (!x) return;
    const id = `SW-${4000 + this.list().length}`;
    this.list.update((l) => [{ id, type, name: x.name, initials: x.initials, avatar: x.avatar, empId: x.id, with: w ? w.split(' · ')[1] ?? w : '—', date, from: SHIFT_FOR_DEPT[x.dept]?.[0] ?? 'DS-01', to, reason, status: 'Pending' }, ...l]);
    this.selId.set(id);
    this.form.set(false);
  }
}

/* ======================= Overtime Scheduling ======================= */
interface Slot {
  id: string;
  date: string;
  shift: string;
  site: string;
  dept: string;
  need: number;
  filled: string[];
  volunteers: string[];
  status: string;
}
const SLOTS: Slot[] = (() => {
  const r = rng(616);
  const vol = RECORDS.filter((x) => x.status === 'Present').slice(500, 560).map((x) => x.name);
  return Array.from({ length: 14 }, (_, i) => {
    const dept = ['Operations', 'Logistics', 'Facility Maintenance', 'Sales'][i % 4];
    const shift = SHIFT_FOR_DEPT[dept][i % SHIFT_FOR_DEPT[dept].length];
    const need = 2 + Math.floor(r() * 5);
    const filledN = i < 5 ? need : Math.floor(r() * need);
    const volunteers = vol.slice(i * 4, i * 4 + 3 + Math.floor(r() * 4));
    return {
      id: `OTS-${700 + i}`, date: iso(1 + Math.floor(i / 2)), shift, site: { Operations: 'Manufacturing', Logistics: 'Warehouse', 'Facility Maintenance': 'Head Office', Sales: 'Retail Stores' }[dept]!,
      dept, need, filled: volunteers.slice(0, filledN), volunteers, status: filledN >= need ? 'Filled' : 'Open',
    };
  });
})();

@Component({
  selector: 'app-ot-scheduling',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Overtime Scheduling" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Post overtime slots, pick volunteers fairly, and stay within budget.">
      <button class="btn-primary" (click)="post()"><app-icon name="plus" [size]="16" />Post OT Slot</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Open Slots" [value]="open()" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Filled Slots" [value]="slots().length - open()" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="OT Hours Planned" [value]="planned()" icon="activity" color="var(--ka-8b5cf6)" sub="next 7 days" />
      <app-kpi label="Budget Used" [value]="budgetPct() + '%'" icon="trending-up" [color]="budgetPct() > 90 ? 'var(--ka-ef4444)' : 'var(--ka-3b82f6)'" sub="of 1,200 h monthly" />
    </section>
    <section class="dash">
      <div class="span-8 slots">
        @for (s of slots(); track s.id) {
          <div class="card slot" [class.filled]="s.status === 'Filled'">
            <div class="slot-top">
              <span class="code" [style.background]="color(s.shift)">{{ s.shift }}</span>
              <div><b>{{ short(s.date) }} · {{ s.dept }}</b><small>{{ s.site }} · {{ hours(s.shift) }} h</small></div>
              <span [class]="s.status === 'Filled' ? 'tag green' : 'tag amber'">{{ s.filled.length }}/{{ s.need }} {{ s.status }}</span>
            </div>
            <div class="vols">
              @for (v of s.volunteers; track v) {
                <button class="vol" [class.on]="s.filled.includes(v)" (click)="toggle(s, v)" [disabled]="!s.filled.includes(v) && s.filled.length >= s.need">
                  {{ s.filled.includes(v) ? '✓ ' : '+ ' }}{{ v }} <small>{{ otOf(v) }}h</small>
                </button>
              }
            </div>
          </div>
        }
      </div>
      <div class="span-4 side">
        <div class="card">
          <div class="card-head"><h3>Monthly OT Budget</h3></div>
          <div class="gauge"><i [style.width.%]="min(budgetPct(), 100)" [class.over]="budgetPct() > 90"></i></div>
          <p class="muted">{{ used() }} h used of 1,200 h · {{ 1200 - used() }} h remaining</p>
        </div>
        <div class="card">
          <div class="card-head"><h3>OT Fairness</h3><span class="muted">last 4 weeks</span></div>
          <app-bar-list [rows]="fairness()" [max]="40" />
          <p class="muted">Volunteers with fewer recent OT hours are suggested first.</p>
        </div>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .slots { display: flex; flex-direction: column; gap: 10px; }
    .slot { display: flex; flex-direction: column; gap: 10px; } .slot.filled { opacity: .8; }
    .slot-top { display: flex; align-items: center; gap: 10px; } .slot-top div { flex: 1; display: flex; flex-direction: column; font-size: 13px; } .slot-top small { color: var(--muted); }
    .code { padding: 4px 8px; border-radius: 6px; color: var(--kf-ffffff); font-weight: 700; font-size: 11px; }
    .vols { display: flex; flex-wrap: wrap; gap: 6px; }
    .vol { padding: 5px 10px; border: 1px solid var(--border); border-radius: 16px; background: var(--kb-ffffff); font-size: 12px; cursor: pointer; }
    .vol small { color: var(--muted); } .vol.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .vol.on small { color: var(--kf-e9d5ff); }
    .vol:disabled { opacity: .4; cursor: default; }
    .side { display: flex; flex-direction: column; gap: 12px; }
    .gauge { height: 14px; border-radius: 7px; background: var(--kb-eef0f6); overflow: hidden; } .gauge i { display: block; height: 100%; background: var(--primary); transition: width .3s; } .gauge i.over { background: var(--red); }
  `,
})
export class OvertimeScheduling {
  protected readonly color = codeColor;
  protected readonly short = short;
  protected readonly min = Math.min;
  protected readonly slots = signal<Slot[]>(SLOTS);
  protected readonly toast = signal<string | null>(null);
  private readonly history: Record<string, number> = {};
  protected readonly open = computed(() => this.slots().filter((s) => s.status === 'Open').length);
  protected readonly planned = computed(() => this.slots().reduce((a, s) => a + s.filled.length * this.hours(s.shift), 0));
  protected readonly used = computed(() => 870 + this.planned());
  protected readonly budgetPct = computed(() => Math.round((this.used() / 1200) * 100));
  protected readonly fairness = computed(() => {
    const names = [...new Set(this.slots().flatMap((s) => s.volunteers))].slice(0, 8);
    return names.map((n) => ({ label: n, value: this.otOf(n), display: `${this.otOf(n)} h`, color: this.otOf(n) > 28 ? 'var(--ka-f97316)' : 'var(--ka-8b5cf6)' })).sort((a, b) => b.value - a.value);
  });

  protected hours(code: string) {
    return SHIFTS.find((s) => s.code === code)?.hours ?? 8;
  }
  /** Recent OT hours per person (base history + slots taken here). */
  protected otOf(name: string) {
    const base = this.history[name] ?? (this.history[name] = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 30);
    return base + this.slots().filter((s) => s.filled.includes(name)).reduce((a, s) => a + this.hours(s.shift), 0);
  }
  protected toggle(s: Slot, v: string) {
    this.slots.update((l) =>
      l.map((x) => {
        if (x.id !== s.id) return x;
        const filled = x.filled.includes(v) ? x.filled.filter((n) => n !== v) : [...x.filled, v];
        return { ...x, filled, status: filled.length >= x.need ? 'Filled' : 'Open' };
      }),
    );
  }
  protected post() {
    const id = `OTS-${800 + this.slots().length}`;
    const vols = RECORDS.slice(900, 905).map((x) => x.name);
    this.slots.update((l) => [{ id, date: iso(2), shift: 'NS-01', site: 'Head Office', dept: 'Facility Maintenance', need: 2, filled: [], volunteers: vols, status: 'Open' }, ...l]);
    this.toast.set('OT slot posted · 5 eligible employees notified');
    setTimeout(() => this.toast.set(null), 2000);
  }
}

export const ACTIVE_SHIFTS = ACTIVE;
