import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { DEPTS } from '../people/people.data';
import { RosterGrid } from './roster-grid';
import { codeColor, codeHours, isNight, LEAVE, OFF, restViolation, rosterFor, RosterRow, SHIFTS, Team, TEAMS, Template, TEMPLATES, weekDays, weekStart } from './shifts.data';

/* ======================= Shift Templates & Rotations ======================= */
@Component({
  selector: 'app-shift-templates',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Shift Templates &amp; Rotations" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Reusable rotation cycles that generate rosters automatically.">
      <button class="btn-primary" (click)="newTemplate()"><app-icon name="plus" [size]="16" />New Template</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Templates" [value]="list().length" icon="refresh" color="var(--ka-8b5cf6)" sub="rotation patterns" />
      <app-kpi label="Teams Using Templates" [value]="teamsTotal()" icon="users" color="var(--ka-3b82f6)" />
      <app-kpi label="People on Rotations" [value]="peopleTotal()" icon="user-check" color="var(--ka-22c55e)" />
      <app-kpi label="Longest Cycle" [value]="maxCycle() + ' days'" icon="calendar-days" color="var(--ka-f97316)" />
    </section>
    <section class="tpl">
      <aside class="card tlist">
        @for (t of list(); track t.id) {
          <button class="ti" [class.on]="selId() === t.id" (click)="selId.set(t.id)">
            <div class="mini">@for (c of t.cycle.slice(0, 14); track $index) {<i [style.background]="color(c)"></i>}</div>
            <b>{{ t.name }}</b><small>{{ t.code }} · {{ t.cycle.length }}-day cycle · {{ t.people.toLocaleString() }} people</small>
          </button>
        }
      </aside>
      @if (sel(); as t) {
        <div class="card">
          <div class="card-head">
            <div><h3>{{ t.name }} <span [class]="t.status === 'Active' ? 'tag green' : 'tag amber'">{{ t.status }}</span></h3><p class="muted">{{ t.desc }}</p></div>
            <div class="toolbar">
              <button class="btn-ghost" (click)="setLen(t.cycle.length - 1)" [disabled]="t.cycle.length <= 2">− Day</button>
              <button class="btn-ghost" (click)="setLen(t.cycle.length + 1)">+ Day</button>
              <button class="btn-primary" (click)="applyOpen.set(true)">Apply to team</button>
            </div>
          </div>
          <p class="lbl">Cycle pattern · click a day to change its shift</p>
          <div class="cycle">
            @for (c of t.cycle; track $index; let i = $index) {
              <div class="cday">
                <small>D{{ i + 1 }}</small>
                <button class="chip" [style.background]="c === off ? 'var(--ka-f3f4f6)' : color(c)" [class.offc]="c === off" (click)="pick.set(pick() === i ? null : i)">{{ c === off ? 'Off' : c }}</button>
                @if (pick() === i) {
                  <div class="pk">@for (o of options; track o) {<button [style.border-left-color]="color(o)" (click)="setDay(i, o)">{{ o === off ? 'Day off' : o }}</button>}</div>
                }
              </div>
            }
          </div>
          <div class="stats">
            <div><span>Avg hours / week</span><b>{{ stats().avg }}</b></div>
            <div><span>Night shifts</span><b>{{ stats().nights }}%</b></div>
            <div><span>Weekends worked</span><b>{{ stats().weekends }}%</b></div>
            <div><span>Rest-rule breaks</span><b [class.bad]="stats().breaks">{{ stats().breaks }}</b></div>
          </div>
          <p class="lbl">4-week preview (starting Monday)</p>
          <div class="preview">
            @for (w of [0, 1, 2, 3]; track w) {
              <div class="pw"><span>Week {{ w + 1 }}</span>
                @for (d of [0, 1, 2, 3, 4, 5, 6]; track d) {
                  @let c = t.cycle[(w * 7 + d) % t.cycle.length];
                  <i [style.background]="c === off ? 'var(--ka-f3f4f6)' : color(c)" [title]="c">{{ c === off ? '' : c.split('-')[1] ?? c }}</i>
                }
              </div>
            }
            <div class="pw head"><span></span>@for (d of dows; track d) {<i>{{ d }}</i>}</div>
          </div>
        </div>
      }
    </section>
    @if (applyOpen()) {
      <div class="g-overlay" (click)="applyOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Apply “{{ sel()!.name }}”</h3><button class="close-btn" (click)="applyOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Team<select #tm class="select">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Start date<input class="input" type="date" [value]="nextMonday" /></label>
          <label>Stagger members by<select class="select"><option>3 days</option><option>1 day</option><option>None</option></select></label>
        </div>
        <div class="form-actions"><button class="btn-ghost" (click)="applyOpen.set(false)">Cancel</button><button class="btn-primary" (click)="apply(tm.value)">Generate roster</button></div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .tpl { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }
    .tlist { display: flex; flex-direction: column; gap: 6px; padding: 10px; max-height: 720px; overflow: auto; }
    .ti { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .ti small { color: var(--muted); } .ti:hover { background: var(--kb-faf8ff); } .ti.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    .mini { display: flex; gap: 2px; } .mini i { width: 12px; height: 8px; border-radius: 2px; }
    .lbl { font-size: 12px; color: var(--kf-4b4f6b); margin: 12px 0 6px; }
    .cycle { display: flex; flex-wrap: wrap; gap: 6px; }
    .cday { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; } .cday small { font-size: 10px; color: var(--muted); }
    .chip { width: 58px; height: 34px; border: 0; border-radius: 6px; color: var(--kf-ffffff); font-size: 10.5px; font-weight: 700; cursor: pointer; }
    .chip.offc { color: var(--kf-9ca3af); }
    .pk { position: absolute; top: 100%; z-index: 10; display: flex; flex-direction: column; min-width: 120px; max-height: 240px; overflow: auto; padding: 4px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 10px 28px rgba(20,20,60,.18); }
    .pk button { text-align: left; padding: 5px 8px; border: 0; border-left: 4px solid; background: none; font-size: 12px; cursor: pointer; } .pk button:hover { background: var(--kb-f5f3ff); }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
    .stats div { display: flex; flex-direction: column; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; } .stats b { font-size: 20px; }
    .preview { display: flex; flex-direction: column-reverse; gap: 4px; }
    .pw { display: grid; grid-template-columns: 60px repeat(7, 1fr); gap: 4px; font-size: 11px; align-items: center; }
    .pw i { height: 26px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); font-style: normal; font-weight: 600; font-size: 10px; }
    .pw.head i { height: auto; color: var(--muted); }
    .bad { color: var(--red); }
    @media (max-width: 1000px) { .tpl { grid-template-columns: 1fr; } .stats { grid-template-columns: 1fr 1fr; } }
  `,
})
export class ShiftTemplates {
  protected readonly off = OFF;
  protected readonly color = codeColor;
  protected readonly teams = TEAMS;
  protected readonly dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly options = [...SHIFTS.filter((s) => s.status === 'Active' && s.start).map((s) => s.code), OFF];
  protected readonly nextMonday = weekStart(new Date(), 1).toISOString().slice(0, 10);
  protected readonly list = signal<Template[]>(TEMPLATES.map((t) => ({ ...t, cycle: [...t.cycle] })));
  protected readonly selId = signal(2);
  protected readonly pick = signal<number | null>(null);
  protected readonly applyOpen = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.list().find((t) => t.id === this.selId()) ?? null);
  protected readonly teamsTotal = computed(() => this.list().reduce((a, t) => a + t.teams, 0));
  protected readonly peopleTotal = computed(() => this.list().reduce((a, t) => a + t.people, 0).toLocaleString());
  protected readonly maxCycle = computed(() => Math.max(...this.list().map((t) => t.cycle.length)));
  protected readonly stats = computed(() => {
    const c = this.sel()!.cycle;
    const work = c.filter((x) => x !== OFF);
    const hours = c.reduce((a, x) => a + codeHours(x), 0);
    const weekendDays = c.filter((_, i) => i % 7 >= 5);
    return {
      avg: Math.round((hours / c.length) * 7 * 10) / 10,
      nights: work.length ? Math.round((work.filter(isNight).length / work.length) * 100) : 0,
      weekends: weekendDays.length ? Math.round((weekendDays.filter((x) => x !== OFF).length / weekendDays.length) * 100) : 0,
      breaks: c.filter((x, i) => restViolation(c[(i - 1 + c.length) % c.length], x)).length,
    };
  });

  private patch(cycle: string[]) {
    const id = this.selId();
    this.list.update((l) => l.map((t) => (t.id === id ? { ...t, cycle } : t)));
  }
  protected setDay(i: number, code: string) {
    this.patch(this.sel()!.cycle.map((c, j) => (j === i ? code : c)));
    this.pick.set(null);
  }
  protected setLen(n: number) {
    const c = this.sel()!.cycle;
    this.patch(n > c.length ? [...c, OFF] : c.slice(0, n));
  }
  protected newTemplate() {
    const id = Math.max(...this.list().map((t) => t.id)) + 1;
    this.list.update((l) => [...l, { id, name: 'New Rotation', code: `T-NEW${id}`, desc: 'Custom rotation', cycle: ['DS-01', 'DS-01', 'DS-01', 'DS-01', 'DS-01', OFF, OFF], teams: 0, people: 0, status: 'Draft' }]);
    this.selId.set(id);
  }
  protected apply(teamId: string) {
    const team = TEAMS.find((t) => t.id === teamId)!;
    this.applyOpen.set(false);
    this.list.update((l) => l.map((t) => (t.id === this.selId() ? { ...t, teams: t.teams + 1, people: t.people + 20, status: 'Active' } : t)));
    this.toast.set(`Draft roster generated for ${team.name} — review it in Roster Planning`);
    setTimeout(() => this.toast.set(null), 2600);
  }
}

/* ======================= Roster Planning ======================= */
@Component({
  selector: 'app-roster-planning',
  imports: [...UI, RosterGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Roster Planning" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Plan weekly rosters per team, check coverage and rest rules, then publish.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" (click)="publish()" [disabled]="status() === 'Published'"><app-icon name="shield-check" [size]="16" />{{ status() === 'Published' ? 'Published' : 'Publish roster' }}</button>
    </app-page-head>

    <section class="card bar">
      <select class="select" [value]="teamId()" (change)="selectTeam($any($event.target).value)">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select>
      <div class="wk">
        <button class="btn-ghost sm" (click)="go(-1)">‹</button>
        <b>{{ range() }}</b>
        <button class="btn-ghost sm" (click)="go(1)">›</button>
        <button class="link" (click)="go(-week())">This week</button>
      </div>
      <span [class]="status() === 'Published' ? 'tag green' : 'tag amber'">{{ status() }}</span>
      <div class="sp"></div>
      <button class="btn-ghost" (click)="copyLast()"><app-icon name="refresh" [size]="15" />Copy last week</button>
      <button class="btn-ghost" (click)="autoFill()"><app-icon name="sparkles" [size]="15" />Auto-fill gaps</button>
      <button class="btn-ghost" (click)="clear()">Clear</button>
    </section>

    <section class="kpi-row">
      <app-kpi label="People in Team" [value]="rows().length" icon="users" color="var(--ka-8b5cf6)" />
      <app-kpi label="Scheduled Hours" [value]="totalHours()" icon="clock" color="var(--ka-22c55e)" />
      <app-kpi label="Coverage Gaps" [value]="gaps()" icon="triangle-alert" [color]="gaps() ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" sub="shift-days under minimum" />
      <app-kpi label="Rest-rule Breaks" [value]="restBreaks()" icon="ban" [color]="restBreaks() ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" sub="< 11 h between shifts" />
      <app-kpi label="Over 48 h" [value]="overtime()" icon="activity" color="var(--ka-f97316)" sub="employees" />
    </section>

    <div class="card">
      <div class="card-head"><h3>{{ team().name }}</h3><span class="muted">Click any cell to change the shift · dashed = edited · red border = rest-rule break</span></div>
      <app-roster-grid [rows]="rows()" [days]="days()" [editable]="status() !== 'Published'" [required]="team().required" [changed]="changed()" [options]="options()" (change)="setCell($event.id, $event.day, $event.code)" />
    </div>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 12px; }
    .wk { display: flex; align-items: center; gap: 8px; font-size: 13px; } .sp { flex: 1; }
  `,
})
export class RosterPlanning {
  private readonly state = inject(AppState);
  protected readonly teams = TEAMS;
  protected readonly teamId = signal(TEAMS[0].id);
  protected readonly week = signal(0);
  protected readonly edits = signal<Record<string, RosterRow[]>>({});
  protected readonly published = signal<Set<string>>(new Set());
  protected readonly changed = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  protected readonly team = computed(() => TEAMS.find((t) => t.id === this.teamId())!);
  private readonly key = computed(() => `${this.teamId()}|${this.week()}`);
  protected readonly start = computed(() => weekStart(this.state.date(), this.week()));
  protected readonly days = computed(() => weekDays(this.start()));
  protected readonly range = computed(() => {
    const d = this.days();
    return `${d[0].date} – ${d[6].date} ${this.start().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
  });
  protected readonly rows = computed(() => this.edits()[this.key()] ?? rosterFor(this.team(), this.week()));
  protected readonly status = computed(() => (this.published().has(this.key()) ? 'Published' : this.week() < 0 ? 'Published' : 'Draft'));
  protected readonly options = computed(() => [...new Set([...Object.keys(this.team().required), ...this.rows().flatMap((r) => r.days)])].filter((c) => c !== OFF && c !== LEAVE));
  protected readonly totalHours = computed(() => this.rows().reduce((a, r) => a + r.days.reduce((b, c) => b + codeHours(c), 0), 0).toLocaleString());
  protected readonly gaps = computed(() => Object.entries(this.team().required).reduce((a, [code, need]) => a + [0, 1, 2, 3, 4, 5, 6].filter((d) => this.rows().filter((r) => r.days[d] === code).length < need).length, 0));
  protected readonly restBreaks = computed(() => this.rows().reduce((a, r) => a + r.days.filter((c, d) => d > 0 && restViolation(r.days[d - 1], c)).length, 0));
  protected readonly overtime = computed(() => this.rows().filter((r) => r.days.reduce((a, c) => a + codeHours(c), 0) > 48).length);

  private save(rows: RosterRow[]) {
    this.edits.update((e) => ({ ...e, [this.key()]: rows }));
  }
  protected selectTeam(id: string) {
    this.teamId.set(id);
    this.changed.set(new Set());
  }
  protected go(n: number) {
    this.week.update((w) => w + n);
    this.changed.set(new Set());
  }
  protected setCell(id: string, day: number, code: string) {
    this.save(this.rows().map((r) => (r.id === id ? { ...r, days: r.days.map((c, i) => (i === day ? code : c)) } : r)));
    this.changed.update((s) => new Set(s).add(`${id}|${day}`));
  }
  protected copyLast() {
    const prevKey = `${this.teamId()}|${this.week() - 1}`;
    const prev = this.edits()[prevKey] ?? rosterFor(this.team(), this.week() - 1);
    this.save(prev.map((r) => ({ ...r, days: [...r.days] })));
    this.notify('Copied last week’s roster');
  }
  /** Fills each under-covered shift/day with someone who is off that day, keeping rest rules, ≤ 48 h and one day off per week. */
  protected autoFill() {
    const rows = this.rows().map((r) => ({ ...r, days: [...r.days] }));
    let filled = 0;
    for (const [code, need] of Object.entries(this.team().required)) {
      for (let d = 0; d < 7; d++) {
        let have = rows.filter((r) => r.days[d] === code).length;
        for (const r of rows) {
          if (have >= need) break;
          const hours = r.days.reduce((a, c) => a + codeHours(c), 0);
          const worksAll = r.days.filter((c, i) => i !== d && c !== OFF && c !== LEAVE).length >= 6;
          const ok =
            r.days[d] === OFF &&
            hours + codeHours(code) <= 48 &&
            !worksAll &&
            (d === 0 || !restViolation(r.days[d - 1], code)) &&
            (d === 6 || !restViolation(code, r.days[d + 1]));
          if (ok) {
            r.days[d] = code;
            have++;
            filled++;
            this.changed.update((s) => new Set(s).add(`${r.id}|${d}`));
          }
        }
      }
    }
    this.save(rows);
    this.notify(filled ? `${filled} gap(s) filled from available staff` : 'No gaps could be filled without breaking rest rules');
  }
  protected clear() {
    this.save(this.rows().map((r) => ({ ...r, days: r.days.map(() => OFF) })));
  }
  protected publish() {
    this.published.update((s) => new Set(s).add(this.key()));
    this.changed.set(new Set());
    this.notify(`Roster published · ${this.rows().length} employees notified`);
  }
  protected exportCsv() {
    downloadCsv(`roster-${this.teamId()}-${this.days()[0].iso}.csv`, [['ID', 'Name', ...this.days().map((d) => `${d.label} ${d.date}`)], ...this.rows().map((r) => [r.id, r.name, ...r.days])]);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}

/* ======================= Schedule Approvals ======================= */
interface Submission {
  id: string;
  team: Team;
  week: number;
  by: string;
  submitted: string;
  changes: number;
  ot: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Changes requested';
  comment: string;
}

@Component({
  selector: 'app-schedule-approvals',
  imports: [...UI, RosterGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Schedule Approvals" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Review rosters submitted by team leads before they are published." />
    <section class="kpi-row">
      <app-kpi label="Awaiting Approval" [value]="count('Pending')" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Approved This Month" [value]="count('Approved') + 31" icon="shield-check" color="var(--ka-22c55e)" />
      <app-kpi label="Sent Back" [value]="count('Changes requested') + count('Rejected')" icon="refresh" color="var(--ka-ef4444)" />
      <app-kpi label="Avg. Turnaround" value="6.4 h" icon="activity" color="var(--ka-3b82f6)" />
    </section>
    <section class="ap">
      <div class="card subs">
        @for (s of subs(); track s.id) {
          <button class="sub" [class.on]="selId() === s.id" (click)="selId.set(s.id)">
            <div><b>{{ s.team.name }}</b><small>Week of {{ weekLabel(s.week) }} · {{ s.by }}</small></div>
            <span [class]="tag(s.status)">{{ s.status }}</span>
            <small class="meta">{{ s.changes }} changes · {{ s.ot }} OT h · {{ violations(s) }} rule issues</small>
          </button>
        }
      </div>
      @if (sel(); as s) {
        <div class="card">
          <div class="card-head">
            <div><h3>{{ s.team.name }} · week of {{ weekLabel(s.week) }}</h3><p class="muted">Submitted by {{ s.by }} {{ s.submitted }} · highlighted cells changed vs. last published roster</p></div>
            <span [class]="tag(s.status)">{{ s.status }}</span>
          </div>
          <div class="checks">
            <span [class]="violations(s) ? 'tag red' : 'tag green'">{{ violations(s) ? violations(s) + ' rest-rule breaks' : 'Rest rules OK' }}</span>
            <span [class]="s.ot > 20 ? 'tag amber' : 'tag green'">{{ s.ot }} overtime hours</span>
            <span class="tag blue">{{ s.changes }} changed shifts</span>
          </div>
          <app-roster-grid [rows]="rosterOf(s)" [days]="daysOf(s)" [required]="s.team.required" [changed]="diffOf(s)" />
          @if (s.status === 'Pending') {
            <textarea #c class="input note" rows="2" placeholder="Comment for {{ s.by }} (optional)"></textarea>
            <div class="form-actions">
              <button class="btn-ghost danger" (click)="decide(s, 'Rejected', c.value)">Reject</button>
              <button class="btn-ghost" (click)="decide(s, 'Changes requested', c.value)">Request changes</button>
              <button class="btn-primary" (click)="decide(s, 'Approved', c.value)">Approve &amp; publish</button>
            </div>
          } @else if (s.comment) {
            <p class="muted">Comment: “{{ s.comment }}”</p>
          }
        </div>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .ap { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; align-items: start; }
    .subs { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
    .sub { display: grid; grid-template-columns: 1fr auto; gap: 4px; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .sub div { display: flex; flex-direction: column; } .sub small { color: var(--muted); } .sub .meta { grid-column: 1 / -1; }
    .sub:hover { background: var(--kb-faf8ff); } .sub.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    .checks { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .note { width: 100%; margin-top: 12px; } .danger { color: var(--red); }
    @media (max-width: 1000px) { .ap { grid-template-columns: 1fr; } }
  `,
})
export class ScheduleApprovals {
  private readonly state = inject(AppState);
  protected readonly subs = signal<Submission[]>([
    { id: 'SA-201', team: TEAMS[0], week: 1, by: 'Ravi Shankar', submitted: '2 h ago', changes: 9, ot: 24, status: 'Pending', comment: '' },
    { id: 'SA-202', team: TEAMS[1], week: 1, by: 'Yusuf Rahman', submitted: '5 h ago', changes: 4, ot: 12, status: 'Pending', comment: '' },
    { id: 'SA-203', team: TEAMS[3], week: 1, by: 'Grace Park', submitted: 'yesterday', changes: 7, ot: 18, status: 'Pending', comment: '' },
    { id: 'SA-204', team: TEAMS[4], week: 1, by: 'Daniel Kim', submitted: 'yesterday', changes: 3, ot: 6, status: 'Pending', comment: '' },
    { id: 'SA-198', team: TEAMS[2], week: 0, by: 'Arjun Mehta', submitted: '3 days ago', changes: 2, ot: 0, status: 'Approved', comment: 'Looks good' },
    { id: 'SA-197', team: TEAMS[5], week: 0, by: 'Meera Iyer', submitted: '4 days ago', changes: 6, ot: 30, status: 'Changes requested', comment: 'Too much OT on DC-B, please rebalance' },
  ]);
  protected readonly selId = signal('SA-201');
  protected readonly toast = signal<string | null>(null);
  protected readonly sel = computed(() => this.subs().find((s) => s.id === this.selId()) ?? null);

  protected count(s: string) {
    return this.subs().filter((x) => x.status === s).length;
  }
  protected tag(s: string) {
    return s === 'Approved' ? 'tag green' : s === 'Pending' ? 'tag amber' : 'tag red';
  }
  protected weekLabel(w: number) {
    return weekStart(this.state.date(), w).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  protected daysOf(s: Submission) {
    return weekDays(weekStart(this.state.date(), s.week));
  }
  /** Submitted roster = generated roster with a few edits by the team lead. */
  protected rosterOf(s: Submission) {
    const base = rosterFor(s.team, s.week, 14);
    const codes = Object.keys(s.team.required);
    return base.map((r, i) => ({ ...r, days: r.days.map((c, d) => ((i * 7 + d) % 11 === 0 && i < s.changes + 2 ? codes[(i + d) % codes.length] : c)) }));
  }
  protected diffOf(s: Submission) {
    const base = rosterFor(s.team, s.week, 14);
    const sub = this.rosterOf(s);
    const set = new Set<string>();
    sub.forEach((r, i) => r.days.forEach((c, d) => c !== base[i].days[d] && set.add(`${r.id}|${d}`)));
    return set;
  }
  protected violations(s: Submission) {
    return this.rosterOf(s).reduce((a, r) => a + r.days.filter((c, d) => d > 0 && restViolation(r.days[d - 1], c)).length, 0);
  }
  protected decide(s: Submission, status: Submission['status'], comment: string) {
    this.subs.update((l) => l.map((x) => (x.id === s.id ? { ...x, status, comment } : x)));
    this.toast.set(status === 'Approved' ? `${s.team.name} roster approved and published` : `Sent back to ${s.by}`);
    setTimeout(() => this.toast.set(null), 2200);
    const next = this.subs().find((x) => x.status === 'Pending');
    if (next) this.selId.set(next.id);
  }
}

export const DEPT_LIST = DEPTS;
