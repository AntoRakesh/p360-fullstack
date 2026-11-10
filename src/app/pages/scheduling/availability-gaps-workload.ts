import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { codeColor, codeHours, isNight, OFF, rosterFor, SHIFTS, TEAMS, weekDays, weekStart } from './shifts.data';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLOCKS = ['Morning', 'Afternoon', 'Night'];
type Av = 0 | 1 | 2; // 0 unavailable, 1 available, 2 preferred

/* ======================= Availability & Preferences ======================= */
@Component({
  selector: 'app-availability',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Availability &amp; Preferences" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="When people can work, what they prefer, and how the team’s availability looks.">
      <select class="select" [value]="teamId()" (change)="teamId.set($any($event.target).value); selId.set(null)">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select>
    </app-page-head>
    <section class="av">
      <aside class="card people">
        @for (m of members(); track m.id) {
          <button class="p" [class.on]="sel()?.id === m.id" (click)="selId.set(m.id)">
            <span class="dt-av" [style.background]="m.avatar">{{ m.initials }}</span>
            <div><b>{{ m.name }}</b><small>{{ count(m.id, 2) }} preferred · {{ count(m.id, 0) }} blocked</small></div>
          </button>
        }
      </aside>
      @if (sel(); as m) {
        <div class="card">
          <div class="card-head"><h3>{{ m.name }} · weekly availability</h3><span class="muted">click to cycle: unavailable → available → preferred</span></div>
          <table class="grid">
            <thead><tr><th></th>@for (d of days; track d) {<th>{{ d }}</th>}</tr></thead>
            <tbody>
              @for (b of blocks; track b; let bi = $index) {
                <tr><th>{{ b }}</th>
                  @for (d of days; track d; let di = $index) {
                    <td><button class="slot" [attr.data-v]="get(m.id, di, bi)" (click)="cycle(m.id, di, bi)">{{ ['Unavailable', 'Available', 'Preferred'][get(m.id, di, bi)] }}</button></td>
                  }
                </tr>
              }
            </tbody>
          </table>
          <h4>Preferences</h4>
          <div class="form-grid">
            <label>Max hours / week<input class="input" type="number" [value]="pref(m.id).maxH" (change)="setPref(m.id, 'maxH', +$any($event.target).value)" /></label>
            <label>Preferred shift<select class="select" [value]="pref(m.id).shift" (change)="setPref(m.id, 'shift', $any($event.target).value)">@for (s of shifts; track s.code) {<option [value]="s.code">{{ s.code }} · {{ s.name }}</option>}</select></label>
            <label class="chk"><input type="checkbox" [checked]="pref(m.id).noNights" (change)="setPref(m.id, 'noNights', !pref(m.id).noNights)" /> No night shifts</label>
            <label class="chk"><input type="checkbox" [checked]="pref(m.id).weekendsOff" (change)="setPref(m.id, 'weekendsOff', !pref(m.id).weekendsOff)" /> Prefer weekends off</label>
          </div>
        </div>
      } @else {
        <div class="card empty-note">Select a team member to edit availability</div>
      }
      <div class="card team">
        <div class="card-head"><h3>Team Availability</h3><span class="muted">people available</span></div>
        <app-heatmap [rows]="blocks" [cols]="days" [data]="teamHeat()" suffix=" people" />
        <p class="muted">Darker = more people available. Use it to spot thin periods before building the roster.</p>
      </div>
    </section>
  `,
  styles: `
    .av { display: grid; grid-template-columns: 260px minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
    .people { display: flex; flex-direction: column; gap: 4px; padding: 8px; max-height: 640px; overflow: auto; }
    .p { display: flex; gap: 8px; align-items: center; padding: 7px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .p div { display: flex; flex-direction: column; } .p small { color: var(--muted); } .p.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    .grid { width: 100%; border-collapse: separate; border-spacing: 4px; font-size: 12px; } .grid th { color: var(--kf-4b4f6b); font-weight: 600; }
    .slot { width: 100%; height: 40px; border: 0; border-radius: 8px; cursor: pointer; font-size: 11px; background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .slot[data-v='1'] { background: var(--kb-dcfce7); color: var(--kf-15803d); } .slot[data-v='2'] { background: var(--kb-7c3aed); color: var(--kf-ffffff); font-weight: 600; }
    h4 { font-size: 13px; margin: 16px 0 8px; } .chk { flex-direction: row !important; align-items: center; gap: 8px; }
    @media (max-width: 1300px) { .av { grid-template-columns: 240px 1fr; } .team { grid-column: 1 / -1; } }
  `,
})
export class Availability {
  protected readonly teams = TEAMS;
  protected readonly days = DAYS;
  protected readonly blocks = BLOCKS;
  protected readonly shifts = SHIFTS.filter((s) => s.status === 'Active' && s.start);
  protected readonly teamId = signal(TEAMS[0].id);
  protected readonly selId = signal<string | null>(null);
  protected readonly overrides = signal<Record<string, Av>>({});
  protected readonly prefs = signal<Record<string, { maxH: number; shift: string; noNights: boolean; weekendsOff: boolean }>>({});
  private readonly team = computed(() => TEAMS.find((t) => t.id === this.teamId())!);
  protected readonly members = computed(() => rosterFor(this.team(), 0, 18));
  protected readonly sel = computed(() => this.members().find((m) => m.id === this.selId()) ?? this.members()[0]);

  protected get(id: string, d: number, b: number): Av {
    const k = `${id}|${d}|${b}`;
    const o = this.overrides()[k];
    if (o !== undefined) return o;
    const v = rng([...k].reduce((a, c) => a + c.charCodeAt(0) * 7, 0))();
    return (b === 2 ? (v < 0.45 ? 0 : v < 0.85 ? 1 : 2) : d >= 5 ? (v < 0.35 ? 0 : v < 0.8 ? 1 : 2) : v < 0.12 ? 0 : v < 0.7 ? 1 : 2) as Av;
  }
  protected cycle(id: string, d: number, b: number) {
    this.overrides.update((o) => ({ ...o, [`${id}|${d}|${b}`]: ((this.get(id, d, b) + 1) % 3) as Av }));
  }
  protected count(id: string, v: Av) {
    this.overrides();
    let n = 0;
    for (let d = 0; d < 7; d++) for (let b = 0; b < 3; b++) if (this.get(id, d, b) === v) n++;
    return n;
  }
  protected readonly teamHeat = computed(() => {
    this.overrides();
    const m = this.members();
    return BLOCKS.map((_, b) => DAYS.map((_, d) => m.filter((x) => this.get(x.id, d, b) > 0).length));
  });
  protected pref(id: string) {
    return this.prefs()[id] ?? { maxH: 40, shift: Object.keys(this.team().required)[0], noNights: id.charCodeAt(6) % 3 === 0, weekendsOff: id.charCodeAt(7) % 2 === 0 };
  }
  protected setPref(id: string, k: 'maxH' | 'shift' | 'noNights' | 'weekendsOff', v: number | string | boolean) {
    this.prefs.update((p) => ({ ...p, [id]: { ...this.pref(id), [k]: v } }));
  }
}

/* ======================= Coverage Gap Detection ======================= */
interface Gap {
  id: string;
  team: string;
  site: string;
  date: string;
  dayIdx: number;
  shift: string;
  need: number;
  have: number;
  status: 'Open' | 'Filled' | 'Posted' | 'OT approved';
}

@Component({
  selector: 'app-coverage-gaps',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Coverage Gap Detection" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Shifts scheduled below minimum staffing for the next 7 days, with ways to fix them." />
    <section class="kpi-row">
      <app-kpi label="Open Gaps" [value]="count('Open')" icon="triangle-alert" color="var(--ka-ef4444)" sub="next 7 days" />
      <app-kpi label="People Short" [value]="short()" icon="users" color="var(--ka-f97316)" />
      <app-kpi label="Overall Coverage" [value]="coverage() + '%'" icon="activity" color="var(--ka-8b5cf6)" />
      <app-kpi label="Resolved Today" [value]="resolved()" icon="shield-check" color="var(--ka-22c55e)" />
    </section>
    <section class="dash">
      <div class="card span-12">
        <div class="card-head"><h3>Coverage Heatmap</h3><span class="muted">% of minimum staffing · team × day</span></div>
        <app-heatmap [rows]="teamNames" [cols]="dayLabels()" [data]="heat()" />
      </div>
      <div class="card span-12">
        <div class="card-head">
          <h3>Gaps</h3>
          <div class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</div>
        </div>
        <table class="table">
          <thead><tr><th>Date</th><th>Team</th><th>Shift</th><th class="num">Scheduled</th><th class="num">Required</th><th>Severity</th><th>Status</th><th>Fix</th></tr></thead>
          <tbody>
            @for (g of shown(); track g.id) {
              <tr>
                <td>{{ g.date }}</td><td>{{ g.team }}<div class="muted">{{ g.site }}</div></td>
                <td><span class="code" [style.background]="color(g.shift)">{{ g.shift }}</span></td>
                <td class="num">{{ g.have }}</td><td class="num">{{ g.need }}</td>
                <td><span [class]="g.need - g.have >= 2 ? 'tag red' : 'tag amber'">{{ g.need - g.have >= 2 ? 'High' : 'Medium' }} (−{{ g.need - g.have }})</span></td>
                <td><span [class]="g.status === 'Open' ? 'tag red' : 'tag green'">{{ g.status }}</span></td>
                <td>
                  @if (g.status === 'Open') {
                    <div class="toolbar">
                      <button class="btn-primary btn-sm" (click)="fillFor.set(g)">Find cover</button>
                      <button class="btn-ghost sm" (click)="setStatus(g, 'Posted')">Post open shift</button>
                      <button class="btn-ghost sm" (click)="setStatus(g, 'OT approved')">Approve OT</button>
                    </div>
                  } @else {
                    <button class="link" (click)="setStatus(g, 'Open')">Undo</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty-note">No gaps here 🎉</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (fillFor(); as g) {
      <div class="g-overlay" (click)="fillFor.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Cover {{ g.shift }} on {{ g.date }}</h3><button class="close-btn" (click)="fillFor.set(null)">×</button></div>
        <p class="muted">People in {{ g.team }} who are off that day, ranked by hours worked this week (fewest first).</p>
        <ul class="cands">
          @for (c of candidates(g); track c.id) {
            <li><span class="dt-av" [style.background]="c.avatar">{{ c.initials }}</span><div><b>{{ c.name }}</b><small>{{ c.hours }} h this week</small></div>
              <button class="btn-primary btn-sm" (click)="fill(g, c.name)">Assign</button></li>
          }
        </ul>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .code { padding: 3px 7px; border-radius: 5px; color: var(--kf-ffffff); font-weight: 700; font-size: 10.5px; }
    .cands { list-style: none; margin: 0; padding: 0; } .cands li { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); }
    .cands div { display: flex; flex-direction: column; font-size: 13px; } .cands small { color: var(--muted); }
  `,
})
export class CoverageGaps {
  private readonly state = inject(AppState);
  protected readonly color = codeColor;
  protected readonly teamNames = TEAMS.map((t) => t.name.split(' · ')[0] + ' · ' + t.site.split(' ')[0]);
  protected readonly tabs = ['Open', 'Resolved', 'All'];
  protected readonly tab = signal('Open');
  protected readonly fillFor = signal<Gap | null>(null);
  protected readonly toast = signal<string | null>(null);
  private readonly days = computed(() => weekDays(weekStart(this.state.date(), 1)));
  protected readonly dayLabels = computed(() => this.days().map((d) => `${d.label} ${d.date}`));
  protected readonly gaps = signal<Gap[]>([]);

  constructor() {
    const days = weekDays(weekStart(new Date(), 1));
    const out: Gap[] = [];
    TEAMS.forEach((t) => {
      const roster = rosterFor(t, 1);
      Object.entries(t.required).forEach(([code, need]) =>
        days.forEach((d, di) => {
          const have = roster.filter((r) => r.days[di] === code).length;
          if (have < need) out.push({ id: `${t.id}-${code}-${di}`, team: t.name, site: t.site, date: `${d.label} ${d.date}`, dayIdx: di, shift: code, need, have, status: 'Open' });
        }),
      );
    });
    this.gaps.set(out);
  }

  protected readonly heat = computed(() =>
    TEAMS.map((t) => {
      const roster = rosterFor(t, 1);
      return this.days().map((_, di) => {
        const pct = Object.entries(t.required).map(([code, need]) => {
          const filled = this.gaps().find((g) => g.id === `${t.id}-${code}-${di}` && g.status !== 'Open');
          return Math.min(1, (filled ? need : roster.filter((r) => r.days[di] === code).length) / need);
        });
        return Math.round((pct.reduce((a, b) => a + b, 0) / pct.length) * 100);
      });
    }),
  );
  protected readonly shown = computed(() => this.gaps().filter((g) => this.tab() === 'All' || (this.tab() === 'Open' ? g.status === 'Open' : g.status !== 'Open')));
  protected readonly short = computed(() => this.gaps().filter((g) => g.status === 'Open').reduce((a, g) => a + g.need - g.have, 0));
  protected readonly resolved = computed(() => this.gaps().filter((g) => g.status !== 'Open').length);
  protected readonly coverage = computed(() => {
    const h = this.heat().flat();
    return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  });

  protected count(s: string) {
    return this.gaps().filter((g) => g.status === s).length;
  }
  protected setStatus(g: Gap, status: Gap['status']) {
    this.gaps.update((l) => l.map((x) => (x.id === g.id ? { ...x, status, have: status === 'Open' ? x.have : x.need } : x)));
  }
  protected candidates(g: Gap) {
    const t = TEAMS.find((x) => g.id.startsWith(x.id))!;
    return rosterFor(t, 1)
      .filter((r) => r.days[g.dayIdx] === OFF)
      .map((r) => ({ ...r, hours: r.days.reduce((a, c) => a + codeHours(c), 0) }))
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 6);
  }
  protected fill(g: Gap, name: string) {
    this.setStatus(g, 'Filled');
    this.fillFor.set(null);
    this.toast.set(`${name} assigned to ${g.shift} on ${g.date}`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Workload Distribution ======================= */
@Component({
  selector: 'app-workload',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Workload Distribution" parent="Shift &amp; Workforce Scheduling" parentLink="/shift-workforce" subtitle="Are hours, nights and weekends shared fairly across the team?">
      <select class="select" [value]="teamId()" (change)="teamId.set($any($event.target).value); moved.set({})">@for (t of teams; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Avg Hours / Person" [value]="avg()" icon="clock" color="var(--ka-8b5cf6)" sub="next 4 weeks, per week" />
      <app-kpi label="Spread (max − min)" [value]="spread() + ' h'" icon="activity" [color]="spread() > 12 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" />
      <app-kpi label="Fairness Index" [value]="fairness()" icon="star" color="var(--ka-3b82f6)" sub="1.00 = perfectly even" />
      <app-kpi label="Overloaded" [value]="overloaded()" icon="triangle-alert" color="var(--ka-f97316)" sub="> 48 h in any week" />
    </section>
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Average Weekly Hours per Person</h3></div>
        <app-bar-list [rows]="hoursRows()" [max]="60" />
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Rebalancing Suggestions</h3></div>
        @for (s of suggestions(); track s.from + s.to) {
          <div class="sug">
            <span>Move <b>{{ s.hours }} h</b> from {{ s.from }} to {{ s.to }}</span>
            <button class="btn-ghost sm" (click)="apply(s)">Apply</button>
          </div>
        } @empty {
          <p class="empty-note">Workload is balanced</p>
        }
        <div class="card-head" style="margin-top: 16px"><h3>Night &amp; Weekend Share</h3></div>
        <table class="table">
          <thead><tr><th>Employee</th><th class="num">Nights</th><th class="num">Weekend days</th></tr></thead>
          <tbody>@for (p of people().slice(0, 8); track p.id) {<tr><td>{{ p.name }}</td><td class="num">{{ p.nights }}</td><td class="num">{{ p.weekends }}</td></tr>}</tbody>
        </table>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `.sug { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }`,
})
export class Workload {
  protected readonly teams = TEAMS;
  protected readonly teamId = signal(TEAMS[0].id);
  protected readonly moved = signal<Record<string, number>>({});
  protected readonly toast = signal<string | null>(null);
  private readonly team = computed(() => TEAMS.find((t) => t.id === this.teamId())!);
  protected readonly people = computed(() => {
    const weeks = [0, 1, 2, 3].map((w) => rosterFor(this.team(), w));
    const days = weekDays(weekStart(new Date()));
    return weeks[0].map((r, i) => {
      const all = weeks.flatMap((w) => w[i].days);
      const weekly = weeks.map((w) => w[i].days.reduce((a, c) => a + codeHours(c), 0));
      const avg = weekly.reduce((a, b) => a + b, 0) / 4 + (this.moved()[r.id] ?? 0);
      return { ...r, avg: Math.round(avg * 10) / 10, max: Math.max(...weekly), nights: all.filter(isNight).length, weekends: weeks.flatMap((w) => w[i].days.filter((c, d) => days[d].weekend && c !== OFF)).length };
    });
  });
  protected readonly hoursRows = computed(() =>
    [...this.people()].sort((a, b) => b.avg - a.avg).map((p) => ({ label: p.name, value: p.avg, display: `${p.avg} h`, color: p.avg > 44 ? 'var(--ka-f97316)' : p.avg < 30 ? 'var(--ka-38bdf8)' : 'var(--ka-8b5cf6)' })),
  );
  protected readonly avg = computed(() => (this.people().reduce((a, p) => a + p.avg, 0) / this.people().length).toFixed(1));
  protected readonly spread = computed(() => Math.round(Math.max(...this.people().map((p) => p.avg)) - Math.min(...this.people().map((p) => p.avg))));
  protected readonly fairness = computed(() => {
    const v = this.people().map((p) => p.avg);
    const s = v.reduce((a, b) => a + b, 0);
    return ((s * s) / (v.length * v.reduce((a, b) => a + b * b, 0))).toFixed(2);
  });
  protected readonly overloaded = computed(() => this.people().filter((p) => p.max > 48).length);
  protected readonly suggestions = computed(() => {
    const sorted = [...this.people()].sort((a, b) => b.avg - a.avg);
    const out: { from: string; to: string; hours: number; fromId: string; toId: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const hi = sorted[i];
      const lo = sorted[sorted.length - 1 - i];
      const diff = Math.round((hi.avg - lo.avg) / 2 / 4) * 4;
      if (diff >= 4) out.push({ from: hi.name, to: lo.name, hours: diff, fromId: hi.id, toId: lo.id });
    }
    return out;
  });
  protected apply(s: { fromId: string; toId: string; hours: number; from: string; to: string }) {
    this.moved.update((m) => ({ ...m, [s.fromId]: (m[s.fromId] ?? 0) - s.hours, [s.toId]: (m[s.toId] ?? 0) + s.hours }));
    this.toast.set(`${s.hours} h moved from ${s.from} to ${s.to}`);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
