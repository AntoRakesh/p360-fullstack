import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { RECORDS } from '../attendance/attendance.data';
import { codeColor, SHIFTS, TEAMS } from './shifts.data';

/* ======================= Demand-Based Planning ======================= */
const SITES_DEMAND = [
  { site: 'Retail Stores', driver: 'Footfall (visitors / hour)', unit: 'visitors', perStaff: 22, curve: [40, 70, 120, 180, 230, 260, 310, 290, 240, 260, 330, 380, 360, 250] },
  { site: 'Warehouse', driver: 'Orders picked / hour', unit: 'orders', perStaff: 18, curve: [120, 260, 380, 420, 400, 360, 300, 340, 410, 450, 420, 300, 180, 90] },
  { site: 'Manufacturing', driver: 'Units produced / hour', unit: 'units', perStaff: 14, curve: [210, 260, 280, 290, 290, 270, 250, 280, 290, 290, 280, 260, 240, 220] },
  { site: 'Head Office', driver: 'Service desk tickets / hour', unit: 'tickets', perStaff: 6, curve: [5, 18, 42, 60, 55, 48, 38, 52, 58, 50, 40, 26, 12, 6] },
];
const HOURS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

@Component({
  selector: 'app-demand-planning',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Demand-Based Planning" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Turn forecast workload into staff needed per hour and compare with the schedule." />
    <section class="card bar">
      <label>Site<select class="select" [value]="siteIdx()" (change)="siteIdx.set(+$any($event.target).value)">@for (s of sites; track s.site; let i = $index) {<option [value]="i">{{ s.site }}</option>}</select></label>
      <label>Day<select class="select" [value]="day()" (change)="day.set($any($event.target).value)"><option>Tomorrow</option><option>Saturday</option><option>Next Monday</option></select></label>
      <label class="slider">Productivity: <b>{{ prod() }}</b> {{ site().unit }} per person / hour
        <input type="range" min="4" max="40" [value]="prod()" (input)="prod.set(+$any($event.target).value)" />
      </label>
      <label class="slider">Demand change: <b>{{ uplift() > 0 ? '+' : '' }}{{ uplift() }}%</b>
        <input type="range" min="-30" max="50" [value]="uplift()" (input)="uplift.set(+$any($event.target).value)" />
      </label>
    </section>
    <section class="kpi-row">
      <app-kpi [label]="'Forecast ' + site().unit" [value]="total().toLocaleString()" icon="trending-up" color="var(--ka-8b5cf6)" [sub]="site().driver" />
      <app-kpi label="Staff-hours Needed" [value]="needH()" icon="users" color="var(--ka-3b82f6)" />
      <app-kpi label="Staff-hours Scheduled" [value]="schedH()" icon="calendar-days" color="var(--ka-22c55e)" />
      <app-kpi label="Gap" [value]="(gapH() > 0 ? '+' : '') + gapH()" icon="triangle-alert" [color]="gapH() > 0 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" [sub]="gapH() > 0 ? 'hours short' : 'hours spare'" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Staff Needed vs Scheduled by Hour</h3></div>
        <app-column-chart [labels]="hours" [series]="chart()" [height]="240" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Suggested Changes</h3></div>
        @for (s of suggestions(); track s.text) {
          <div class="sug" [class.done]="applied().has(s.text)">
            <span class="code" [style.background]="color(s.code)">{{ s.code }}</span>
            <span>{{ s.text }}</span>
            <button class="btn-ghost sm" (click)="apply(s.text, s.code, s.n)" [disabled]="applied().has(s.text)">{{ applied().has(s.text) ? 'Added' : 'Add' }}</button>
          </div>
        } @empty {
          <p class="empty-note">Schedule already covers forecast demand 🎉</p>
        }
      </div>
      <div class="card span-12">
        <table class="table">
          <thead><tr><th>Hour</th>@for (h of hours; track h) {<th class="num">{{ h }}:00</th>}</tr></thead>
          <tbody>
            <tr><td>Forecast {{ site().unit }}</td>@for (v of demand(); track $index) {<td class="num">{{ v }}</td>}</tr>
            <tr><td>Staff needed</td>@for (v of need(); track $index) {<td class="num"><b>{{ v }}</b></td>}</tr>
            <tr><td>Scheduled</td>@for (v of sched(); track $index) {<td class="num">{{ v }}</td>}</tr>
            <tr><td>Difference</td>@for (v of diff(); track $index) {<td class="num"><span [class]="v < 0 ? 'tag red' : v > 1 ? 'tag amber' : 'tag green'">{{ v > 0 ? '+' : '' }}{{ v }}</span></td>}</tr>
          </tbody>
        </table>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-end; padding: 12px; margin-bottom: 12px; }
    .bar label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--kf-4b4f6b); }
    .slider { min-width: 240px; } .slider input { accent-color: var(--primary); }
    .sug { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .sug.done { opacity: .55; }
    .code { padding: 3px 7px; border-radius: 5px; color: var(--kf-ffffff); font-weight: 700; font-size: 10.5px; }
  `,
})
export class DemandPlanning {
  protected readonly sites = SITES_DEMAND;
  protected readonly hours = HOURS;
  protected readonly color = codeColor;
  protected readonly siteIdx = signal(0);
  protected readonly day = signal('Tomorrow');
  protected readonly prod = signal(SITES_DEMAND[0].perStaff);
  protected readonly uplift = signal(0);
  protected readonly extra = signal<number[]>(Array(14).fill(0));
  protected readonly applied = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  protected readonly site = computed(() => this.sites[this.siteIdx()]);

  constructor() {}

  protected readonly demand = computed(() => {
    const k = this.day() === 'Saturday' ? 1.35 : this.day() === 'Next Monday' ? 0.9 : 1;
    return this.site().curve.map((v) => Math.round(v * k * (1 + this.uplift() / 100)));
  });
  protected readonly need = computed(() => this.demand().map((v) => Math.max(1, Math.ceil(v / this.prod()))));
  protected readonly sched = computed(() => {
    const base = this.site().curve.map((v) => Math.round(v / this.site().perStaff));
    const r = rng(this.siteIdx() * 13 + 1);
    return base.map((v, i) => Math.max(1, v + (r() < 0.3 ? -2 : 0)) + this.extra()[i]);
  });
  protected readonly diff = computed(() => this.sched().map((v, i) => v - this.need()[i]));
  protected readonly total = computed(() => this.demand().reduce((a, b) => a + b, 0));
  protected readonly needH = computed(() => this.need().reduce((a, b) => a + b, 0));
  protected readonly schedH = computed(() => this.sched().reduce((a, b) => a + b, 0));
  protected readonly gapH = computed(() => this.needH() - this.schedH());
  protected readonly chart = computed(() => [
    { name: 'Needed', color: 'var(--ka-c4b5fd)', values: this.need() },
    { name: 'Scheduled', color: 'var(--ka-7c3aed)', values: this.sched() },
  ]);
  /** Groups under-covered hours into whole shifts to add. */
  protected readonly suggestions = computed(() => {
    const d = this.diff();
    const short = (from: number, to: number) => Math.max(0, ...d.slice(from, to).map((v) => -v));
    const codeFor: Record<string, [string, string]> = { 'Retail Stores': ['RT-O', 'RT-C'], Warehouse: ['WH-E', 'WH-L'], Manufacturing: ['RS-A', 'RS-B'], 'Head Office': ['DS-01', 'ES-01'] };
    const [early, late] = codeFor[this.site().site];
    const out: { code: string; n: number; text: string }[] = [];
    const a = short(0, 7);
    const b = short(7, 14);
    if (a) out.push({ code: early, n: a, text: `Add ${a} × ${early} (morning peak)` });
    if (b) out.push({ code: late, n: b, text: `Add ${b} × ${late} (afternoon/evening peak)` });
    const over = Math.max(0, Math.min(...d.slice(0, 3)) - 1);
    if (over > 0) out.push({ code: early, n: -over, text: `Release ${over} early starter(s) — low demand before 10:00` });
    return out;
  });

  protected apply(text: string, code: string, n: number) {
    const late = ['RT-C', 'WH-L', 'RS-B', 'ES-01'].includes(code);
    this.extra.update((e) => e.map((v, i) => v + ((late ? i >= 7 : i < (n < 0 ? 3 : 7)) ? n : 0)));
    this.applied.update((s) => new Set(s).add(text));
    this.toast.set('Draft shifts added to the roster');
    setTimeout(() => this.toast.set(null), 1800);
  }
}

/* ======================= Skill-Based Scheduling ======================= */
const SKILLS = ['Forklift', 'First Aid', 'Fire Warden', 'Machine Op.', 'Quality Check', 'Team Lead', 'Hazmat', 'Electrical'];
interface Need {
  shift: string;
  day: string;
  skills: Record<string, number>;
  assigned: string[];
}

@Component({
  selector: 'app-skill-scheduling',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Skill-Based Scheduling" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Make sure every shift has the certified skills it needs.">
      <select class="select" [value]="teamId()" (change)="teamId.set($any($event.target).value)">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select>
    </app-page-head>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Skill Matrix</h3><span class="muted">click a cell to change level (0–3)</span></div>
        <div class="table-wrap mx">
          <table class="table">
            <thead><tr><th>Employee</th>@for (s of skills; track s) {<th class="c">{{ s }}</th>}</tr></thead>
            <tbody>
              @for (m of members(); track m.id) {
                <tr>
                  <td><span class="dt-av sm-av" [style.background]="m.avatar">{{ m.initials }}</span>{{ m.name }}</td>
                  @for (s of skills; track s) {
                    <td class="c"><button class="lvl" [attr.data-l]="level(m.id, s)" (click)="bump(m.id, s)">{{ level(m.id, s) || '·' }}</button></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="leg"><span><i data-l="1"></i>Basic</span><span><i data-l="2"></i>Certified</span><span><i data-l="3"></i>Expert / trainer</span></div>
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Shift Skill Requirements</h3></div>
        @for (n of needs(); track n.shift + n.day; let i = $index) {
          <div class="need">
            <div class="nh"><span class="code" [style.background]="color(n.shift)">{{ n.shift }}</span><b>{{ n.day }}</b>
              <span [class]="missing(n).length ? 'tag red' : 'tag green'">{{ missing(n).length ? missing(n).length + ' skill gap(s)' : 'Covered' }}</span></div>
            <div class="reqs">
              @for (r of reqList(n); track r.skill) {
                <span class="req" [class.ok]="r.have >= r.need">{{ r.skill }} {{ r.have }}/{{ r.need }}</span>
              }
            </div>
            @if (missing(n).length) {
              <div class="cands">
                <small>Qualified & available:</small>
                @for (c of candidates(n); track c.id) {<button class="btn-ghost sm" (click)="assign(i, c.id)">+ {{ c.name }} ({{ c.skill }})</button>}
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .mx { max-height: 560px; } .c { text-align: center; } .sm-av { width: 24px !important; height: 24px !important; font-size: 9.5px !important; display: inline-grid !important; margin-right: 8px; vertical-align: middle; }
    .lvl { width: 30px; height: 26px; border: 0; border-radius: 6px; background: var(--kb-f3f4f6); color: var(--kf-9ca3af); font-weight: 700; cursor: pointer; }
    .lvl[data-l='1'], .leg i[data-l='1'] { background: var(--kb-ede9fe); color: var(--kf-6d28d9); }
    .lvl[data-l='2'], .leg i[data-l='2'] { background: var(--kb-a78bfa); color: var(--kf-ffffff); }
    .lvl[data-l='3'], .leg i[data-l='3'] { background: var(--kb-6d28d9); color: var(--kf-ffffff); }
    .leg { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; } .leg span { display: flex; gap: 6px; align-items: center; } .leg i { width: 14px; height: 14px; border-radius: 4px; }
    .need { padding: 10px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .nh { display: flex; align-items: center; gap: 8px; font-size: 13px; } .nh .tag { margin-left: auto; }
    .code { padding: 3px 7px; border-radius: 5px; color: var(--kf-ffffff); font-weight: 700; font-size: 10.5px; }
    .reqs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .req { padding: 3px 8px; border-radius: 12px; font-size: 11.5px; background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .req.ok { background: var(--kb-dcfce7); color: var(--kf-15803d); }
    .cands { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .cands small { color: var(--muted); }
  `,
})
export class SkillScheduling {
  protected readonly skills = SKILLS;
  protected readonly teams = TEAMS;
  protected readonly color = codeColor;
  protected readonly teamId = signal(TEAMS[1].id);
  protected readonly levels = signal<Record<string, number>>({});
  protected readonly extraAssigned = signal<Record<string, string[]>>({});
  private readonly team = computed(() => TEAMS.find((t) => t.id === this.teamId())!);
  protected readonly members = computed(() => RECORDS.filter((r) => r.dept === this.team().dept).slice(0, 16));

  protected level(id: string, skill: string) {
    const k = `${id}|${skill}`;
    const set = this.levels()[k];
    if (set !== undefined) return set;
    const r = rng([...k].reduce((a, c) => a + c.charCodeAt(0), 0));
    const v = r();
    return v < 0.5 ? 0 : v < 0.75 ? 1 : v < 0.93 ? 2 : 3;
  }
  protected bump(id: string, skill: string) {
    this.levels.update((l) => ({ ...l, [`${id}|${skill}`]: (this.level(id, skill) + 1) % 4 }));
  }
  protected readonly needs = computed<Need[]>(() => {
    const codes = Object.keys(this.team().required);
    const m = this.members();
    return codes.flatMap((code, ci) =>
      ['Mon', 'Tue'].map((day, di) => {
        const key = `${code}|${day}`;
        const base = m.filter((_, i) => (i + ci + di) % codes.length === 0).slice(0, 4).map((x) => x.id);
        return { shift: code, day, skills: { [SKILLS[ci % 8]]: 2, [SKILLS[(ci + 1) % 8]]: 1, 'First Aid': 1 }, assigned: [...base, ...(this.extraAssigned()[key] ?? [])] };
      }),
    );
  });
  protected reqList(n: Need) {
    return Object.entries(n.skills).map(([skill, need]) => ({ skill, need, have: n.assigned.filter((id) => this.level(id, skill) >= 2).length }));
  }
  protected missing(n: Need) {
    return this.reqList(n).filter((r) => r.have < r.need);
  }
  protected candidates(n: Need) {
    const miss = this.missing(n).map((r) => r.skill);
    return this.members()
      .filter((m) => !n.assigned.includes(m.id))
      .map((m) => ({ ...m, skill: miss.find((s) => this.level(m.id, s) >= 2) }))
      .filter((m) => m.skill)
      .slice(0, 3) as { id: string; name: string; skill: string }[];
  }
  protected assign(i: number, id: string) {
    const n = this.needs()[i];
    const key = `${n.shift}|${n.day}`;
    this.extraAssigned.update((e) => ({ ...e, [key]: [...(e[key] ?? []), id] }));
  }
}

/* ======================= Staffing Requirements ======================= */
interface Reqm {
  id: number;
  site: string;
  dept: string;
  shift: string;
  dayType: string;
  min: number;
  ideal: number;
  max: number;
  skills: string;
}

@Component({
  selector: 'app-staffing-requirements',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Staffing Requirements" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Minimum, ideal and maximum headcount for every site, shift and day type.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />Add Requirement</button>
    </app-page-head>
    <section class="dash">
      <div class="card span-12">
        <div class="card-head"><h3>Required vs Available Headcount by Site</h3><span class="muted">weekday, all shifts</span></div>
        <app-column-chart [labels]="siteLabels()" [series]="chart()" [height]="210" />
      </div>
      <div class="card span-12">
        <div class="table-wrap">
          <table class="table req-t">
            <thead><tr><th>Site</th><th>Department</th><th>Shift</th><th>Day type</th><th class="num">Min</th><th class="num">Ideal</th><th class="num">Max</th><th class="num">Available</th><th>Required skills</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td>{{ r.site }}</td><td>{{ r.dept }}</td>
                  <td><span class="code" [style.background]="color(r.shift)">{{ r.shift }}</span></td>
                  <td><select class="select" [value]="r.dayType" (change)="patch(r.id, { dayType: $any($event.target).value })"><option>Weekday</option><option>Weekend</option><option>Holiday</option></select></td>
                  <td class="num"><input class="input n" type="number" min="0" [value]="r.min" (change)="patch(r.id, { min: +$any($event.target).value })" /></td>
                  <td class="num"><input class="input n" type="number" min="0" [value]="r.ideal" (change)="patch(r.id, { ideal: +$any($event.target).value })" /></td>
                  <td class="num"><input class="input n" type="number" min="0" [value]="r.max" (change)="patch(r.id, { max: +$any($event.target).value })" /></td>
                  <td class="num"><span [class]="avail(r) < r.min ? 'tag red' : avail(r) < r.ideal ? 'tag amber' : 'tag green'">{{ avail(r) }}</span></td>
                  <td><input class="input" [value]="r.skills" (change)="patch(r.id, { skills: $any($event.target).value })" /></td>
                  <td><button class="link danger" (click)="remove(r.id)">Remove</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (invalid().length) {<p class="bad">Check rows {{ invalid().join(', ') }}: min ≤ ideal ≤ max.</p>}
      </div>
    </section>
  `,
  styles: `
    .code { padding: 3px 7px; border-radius: 5px; color: var(--kf-ffffff); font-weight: 700; font-size: 10.5px; }
    .n { width: 64px; text-align: right; } .req-t .select { padding: 5px 24px 5px 8px; } .req-t .input { padding: 5px 8px; }
    .danger { color: var(--red); }
  `,
})
export class StaffingRequirements {
  protected readonly color = codeColor;
  protected readonly rows = signal<Reqm[]>(
    TEAMS.flatMap((t) =>
      Object.entries(t.required).flatMap(([shift, need], i) => [
        { id: 0, site: t.site, dept: t.dept, shift, dayType: 'Weekday', min: need, ideal: need + 1, max: need + 3, skills: ['Forklift ×2', 'First Aid ×1', 'Team Lead ×1', 'Machine Op. ×2'][i % 4] },
        { id: 0, site: t.site, dept: t.dept, shift, dayType: 'Weekend', min: Math.max(1, need - 2), ideal: need, max: need + 1, skills: 'First Aid ×1' },
      ]),
    ).map((r, i) => ({ ...r, id: i + 1 })),
  );
  protected avail(r: Reqm) {
    return r.min + (((r.id * 7) % 5) - 2);
  }
  protected readonly siteLabels = computed(() => [...new Set(this.rows().map((r) => r.site))]);
  protected readonly chart = computed(() => {
    const sites = this.siteLabels();
    const wk = this.rows().filter((r) => r.dayType === 'Weekday');
    return [
      { name: 'Min required', color: 'var(--ka-c4b5fd)', values: sites.map((s) => wk.filter((r) => r.site === s).reduce((a, r) => a + r.min, 0)) },
      { name: 'Ideal', color: 'var(--ka-8b5cf6)', values: sites.map((s) => wk.filter((r) => r.site === s).reduce((a, r) => a + r.ideal, 0)) },
      { name: 'Available', color: 'var(--ka-22c55e)', values: sites.map((s) => wk.filter((r) => r.site === s).reduce((a, r) => a + this.avail(r), 0)) },
    ];
  });
  protected readonly invalid = computed(() => this.rows().filter((r) => !(r.min <= r.ideal && r.ideal <= r.max)).map((r) => r.id));
  protected patch(id: number, c: Partial<Reqm>) {
    this.rows.update((l) => l.map((r) => (r.id === id ? { ...r, ...c } : r)));
  }
  protected remove(id: number) {
    this.rows.update((l) => l.filter((r) => r.id !== id));
  }
  protected add() {
    const id = Math.max(0, ...this.rows().map((r) => r.id)) + 1;
    this.rows.update((l) => [...l, { id, site: 'Head Office', dept: 'IT', shift: 'ES-01', dayType: 'Weekday', min: 2, ideal: 3, max: 4, skills: '' }]);
  }
}

export const ALL_SHIFT_CODES = SHIFTS.map((s) => s.code);
