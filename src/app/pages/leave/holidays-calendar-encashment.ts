import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { DEPTS } from '../people/people.data';
import { APPLICATIONS, BALANCES, Holiday, HOLIDAYS, LEAVE_TYPES, typeByCode } from './leave.data';

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ======================= Holiday Calendars ======================= */
const CALENDARS = [
  { name: 'UAE', sites: 'Head Office, Manufacturing, Warehouse, Data Center, Tech Center', people: 7140 },
  { name: 'KSA', sites: 'Regional Office (Riyadh)', people: 980 },
  { name: 'India Shared Services', sites: 'Remote team', people: 800 },
];

@Component({
  selector: 'app-holiday-calendars',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Holiday Calendars" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Public, religious and company holidays per region, used when counting leave days.">
      <button class="btn-ghost" (click)="copyYear()"><app-icon name="refresh" [size]="16" />Copy to {{ year() + 1 }}</button>
      <button class="btn-primary" (click)="form.set(true)"><app-icon name="plus" [size]="16" />Add Holiday</button>
    </app-page-head>
    <section class="cals">
      @for (c of calendars; track c.name) {
        <button class="card cal" [class.on]="cal() === c.name" (click)="cal.set(c.name)">
          <b>{{ c.name }}</b><small>{{ c.sites }}</small><span class="muted">{{ c.people.toLocaleString() }} people · {{ countFor(c.name) }} holidays</span>
        </button>
      }
    </section>
    <section class="dash">
      <div class="card span-5">
        <div class="card-head">
          <h3>{{ cal() }} · {{ year() }}</h3>
          <div class="toolbar"><button class="btn-ghost sm" (click)="year.set(year() - 1)">‹</button><button class="btn-ghost sm" (click)="year.set(year() + 1)">›</button></div>
        </div>
        <ul class="hl">
          @for (h of holidays(); track h.id) {
            <li>
              <span class="date"><b>{{ day(h.date) }}</b><small>{{ mon(h.date) }}</small></span>
              <div><b>{{ h.name }}</b><small>{{ fmt(h.date) }}</small></div>
              <span [class]="h.type === 'Public' ? 'tag blue' : h.type === 'Religious' ? 'tag green' : 'tag'">{{ h.type }}</span>
              <button class="link danger" (click)="remove(h.id)">Remove</button>
            </li>
          } @empty {
            <li class="empty-note">No holidays for {{ year() }} — use “Copy to next year” from {{ year() - 1 }} or add one.</li>
          }
        </ul>
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Year view</h3><span class="muted">holidays highlighted · weekends grey</span></div>
        <div class="year">
          @for (m of months; track m; let mi = $index) {
            <div class="month">
              <b>{{ m.slice(0, 3) }}</b>
              <div class="mgrid">
                @for (d of grid(mi); track $index) {
                  <span [class.we]="d.we" [class.hol]="d.hol" [class.blank]="!d.n" [title]="d.hol ?? ''">{{ d.n || '' }}</span>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </section>
    @if (form()) {
      <div class="g-overlay" (click)="form.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add(d.value, n.value, t.value)">
        <div class="modal-head"><h3>Add Holiday · {{ cal() }}</h3><button type="button" class="close-btn" (click)="form.set(false)">×</button></div>
        <div class="form-grid">
          <label>Date<input #d class="input" type="date" required /></label>
          <label>Type<select #t class="select"><option>Public</option><option>Religious</option><option>Company</option></select></label>
          <label class="full">Name<input #n class="input" required /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(false)">Cancel</button><button class="btn-primary" type="submit">Add</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .cals { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .cal { display: flex; flex-direction: column; gap: 4px; text-align: left; cursor: pointer; font-family: inherit; } .cal small { color: #4b4f6b; } .cal.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .hl { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow: auto; }
    .hl li { display: grid; grid-template-columns: 46px 1fr auto auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
    .hl li div { display: flex; flex-direction: column; } .hl small { color: var(--muted); }
    .date { display: flex; flex-direction: column; align-items: center; padding: 4px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); } .date b { font-size: 16px; }
    .danger { color: var(--red); }
    .year { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .month b { font-size: 12px; } .mgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-top: 4px; }
    .mgrid span { font-size: 9.5px; text-align: center; padding: 3px 0; border-radius: 3px; } .mgrid .we { background: #f3f4f6; color: #9ca3af; }
    .mgrid .hol { background: var(--primary); color: #fff; font-weight: 700; } .mgrid .blank { background: none; }
    @media (max-width: 900px) { .year { grid-template-columns: repeat(2, 1fr); } }
  `,
})
export class HolidayCalendars {
  protected readonly calendars = CALENDARS;
  protected readonly months = MONTHS;
  protected readonly fmt = fmt;
  protected readonly cal = signal('UAE');
  protected readonly year = signal(2026);
  protected readonly form = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly list = signal<Holiday[]>([
    ...HOLIDAYS,
    ...HOLIDAYS.filter((h) => !['Commemoration Day', 'National Day', 'National Day Holiday'].includes(h.name)).map((h, i) => ({ ...h, id: 100 + i, calendar: 'KSA' })),
    { id: 120, date: '2026-09-23', name: 'Saudi National Day', type: 'Public', calendar: 'KSA' },
    { id: 121, date: '2026-02-22', name: 'Founding Day', type: 'Public', calendar: 'KSA' },
    ...[['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-11-08', 'Diwali'], ['2026-12-25', 'Christmas']].map(([date, name], i) => ({ id: 200 + i, date, name, type: 'Public' as const, calendar: 'India Shared Services' })),
  ]);
  protected readonly holidays = computed(() => this.list().filter((h) => h.calendar === this.cal() && h.date.startsWith(String(this.year()))).sort((a, b) => (a.date < b.date ? -1 : 1)));

  protected countFor(c: string) {
    return this.list().filter((h) => h.calendar === c && h.date.startsWith(String(this.year()))).length;
  }
  protected day(d: string) {
    return +d.slice(8);
  }
  protected mon(d: string) {
    return MONTHS[+d.slice(5, 7) - 1].slice(0, 3);
  }
  protected grid(m: number) {
    const y = this.year();
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = new Date(y, m + 1, 0).getDate();
    const hol = this.holidays();
    return [
      ...Array.from({ length: first }, () => ({ n: 0, we: false, hol: null as string | null })),
      ...Array.from({ length: n }, (_, i) => {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
        const dow = new Date(y, m, i + 1).getDay();
        return { n: i + 1, we: dow === 0 || dow === 6, hol: hol.find((h) => h.date === iso)?.name ?? null };
      }),
    ];
  }
  protected add(date: string, name: string, type: string) {
    this.list.update((l) => [...l, { id: Date.now(), date, name, type: type as Holiday['type'], calendar: this.cal() }]);
    this.year.set(+date.slice(0, 4));
    this.form.set(false);
    this.notify(`${name} added to ${this.cal()} calendar`);
  }
  protected remove(id: number) {
    this.list.update((l) => l.filter((h) => h.id !== id));
  }
  protected copyYear() {
    const y = this.year();
    const src = this.holidays();
    const exists = new Set(this.list().map((h) => `${h.calendar}|${h.date}`));
    const copies = src.map((h) => ({ ...h, id: Date.now() + h.id, date: `${y + 1}${h.date.slice(4)}` })).filter((h) => !exists.has(`${h.calendar}|${h.date}`));
    this.list.update((l) => [...l, ...copies]);
    this.year.set(y + 1);
    this.notify(`${copies.length} holidays copied to ${y + 1} — check dates of moving religious holidays`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
}

/* ======================= Leave Calendar ======================= */
@Component({
  selector: 'app-leave-calendar',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Calendar" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Who is off and when, by team, with staffing-threshold warnings.">
      <select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)">@for (d of depts; track d) {<option [value]="d">{{ d }}</option>}</select>
      <div class="toolbar"><button class="btn-ghost sm" (click)="month.set(month() - 1)">‹</button><b>{{ label() }}</b><button class="btn-ghost sm" (click)="month.set(month() + 1)">›</button></div>
    </app-page-head>
    <div class="card">
      <div class="legend">
        @for (t of legendTypes; track t.code) {<span><i [style.background]="t.color"></i>{{ t.name }}</span>}
        <span><i class="pend"></i>Pending</span>
        <label class="thr">Alert when more than <input class="input n" type="number" [value]="threshold()" (input)="threshold.set(+$any($event.target).value)" /> people off</label>
      </div>
      <div class="cal-wrap">
        <table class="gantt">
          <thead>
            <tr>
              <th class="who">Employee</th>
              @for (d of days(); track d.n) {<th [class.we]="d.we" [class.hol]="d.hol">{{ d.n }}<small>{{ d.dow }}</small></th>}
            </tr>
            <tr class="count">
              <th class="who">Off</th>
              @for (d of days(); track d.n) {<th><span [class.over]="offOn(d.iso) > threshold()">{{ offOn(d.iso) || '' }}</span></th>}
            </tr>
          </thead>
          <tbody>
            @for (p of people(); track p.empId) {
              <tr>
                <td class="who"><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span>{{ p.name }}</td>
                @for (d of days(); track d.n) {
                  @let a = on(p.empId, d.iso);
                  <td [class.we]="d.we">@if (a) {<span class="bar" [class.pend]="a.status === 'Pending'" [style.background]="a.status === 'Pending' ? null : color(a.type)" [title]="a.type + ' · ' + a.status + ' · ' + a.reason"></span>}</td>
                }
              </tr>
            } @empty {
              <tr><td [attr.colspan]="days().length + 1" class="empty-note">No leave in {{ dept() }} this month</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .legend { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 12px; margin-bottom: 12px; }
    .legend span { display: flex; align-items: center; gap: 5px; } .legend i { width: 14px; height: 10px; border-radius: 3px; }
    .pend { background: repeating-linear-gradient(45deg, #f59e0b, #f59e0b 3px, #fde68a 3px, #fde68a 6px) !important; }
    .thr { margin-left: auto; display: flex; align-items: center; gap: 6px; } .n { width: 56px; padding: 4px 6px; }
    .cal-wrap { overflow: auto; }
    .gantt { border-collapse: collapse; font-size: 11px; width: 100%; }
    .gantt th { position: sticky; top: 0; background: #fafafe; padding: 4px 1px; min-width: 26px; color: #4b4f6b; z-index: 1; }
    .gantt th small { display: block; font-weight: 400; color: var(--muted); font-size: 9px; }
    .gantt th.we { color: #9ca3af; } .gantt th.hol { color: var(--primary); }
    .count th { top: 38px; } .count span { display: inline-block; min-width: 18px; padding: 1px 3px; border-radius: 8px; background: #eef0f6; } .count span.over { background: #fee2e2; color: #b91c1c; font-weight: 700; }
    .gantt .who { position: sticky; left: 0; background: #fff; text-align: left; min-width: 170px; z-index: 2; padding: 4px 8px 4px 0; white-space: nowrap; }
    .gantt td.who .dt-av { width: 22px; height: 22px; font-size: 9px; display: inline-grid; margin-right: 6px; vertical-align: middle; }
    .gantt td { border-bottom: 1px solid #f0f1f6; padding: 3px 0; } .gantt td.we { background: #fafafa; }
    .bar { display: block; height: 14px; }
  `,
})
export class LeaveCalendar {
  private readonly state = inject(AppState);
  protected readonly depts = DEPTS.filter((d) => d !== '—');
  protected readonly legendTypes = LEAVE_TYPES.filter((t) => ['AL', 'SL', 'CL', 'ML', 'UL'].includes(t.code));
  protected readonly dept = signal('Operations');
  protected readonly month = signal(0);
  protected readonly threshold = signal(3);
  private readonly base = computed(() => {
    const d = new Date(this.state.date());
    return new Date(d.getFullYear(), d.getMonth() + this.month(), 1);
  });
  protected readonly label = computed(() => this.base().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  protected readonly days = computed(() => {
    const b = this.base();
    const n = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(b.getFullYear(), b.getMonth(), i + 1);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return { n: i + 1, iso, dow: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), we: d.getDay() === 0 || d.getDay() === 6, hol: HOLIDAYS.some((h) => h.date === iso) };
    });
  });
  private readonly apps = computed(() => {
    const first = this.days()[0].iso;
    const last = this.days()[this.days().length - 1].iso;
    return APPLICATIONS.filter((a) => a.dept === this.dept() && (a.status === 'Approved' || a.status === 'Pending') && a.from <= last && a.to >= first);
  });
  protected readonly people = computed(() => [...new Map(this.apps().map((a) => [a.empId, a])).values()]);

  protected on(empId: string, iso: string) {
    return this.apps().find((a) => a.empId === empId && a.from <= iso && a.to >= iso) ?? null;
  }
  protected offOn(iso: string) {
    return this.apps().filter((a) => a.from <= iso && a.to >= iso).length;
  }
  protected color(code: string) {
    return typeByCode(code)?.color ?? '#7c3aed';
  }
}

/* ======================= Leave Encashment Rules ======================= */
interface EncRule {
  code: string;
  enabled: boolean;
  maxDays: number;
  minKeep: number;
  basis: 'Basic' | 'Gross';
  minService: number;
  when: string;
}
interface EncReq {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  type: string;
  days: number;
  amount: number;
  status: string;
}

@Component({
  selector: 'app-encashment',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Leave Encashment Rules" parent="Leave &amp; Absence Management" parentLink="/leave-absence" subtitle="Which leave can be paid out, limits, rates, and encashment requests." />
    <section class="dash">
      <div class="card span-7">
        <div class="card-head"><h3>Rules</h3></div>
        <table class="table rt">
          <thead><tr><th>Leave type</th><th>Enabled</th><th class="num">Max days / yr</th><th class="num">Keep min</th><th>Rate basis</th><th class="num">Min service (m)</th><th>When</th></tr></thead>
          <tbody>
            @for (r of rules(); track r.code; let i = $index) {
              <tr [class.off]="!r.enabled">
                <td><b>{{ name(r.code) }}</b></td>
                <td><input type="checkbox" [checked]="r.enabled" (change)="patch(i, { enabled: !r.enabled })" /></td>
                <td class="num"><input class="input n" type="number" [value]="r.maxDays" (change)="patch(i, { maxDays: +$any($event.target).value })" /></td>
                <td class="num"><input class="input n" type="number" [value]="r.minKeep" (change)="patch(i, { minKeep: +$any($event.target).value })" /></td>
                <td><select class="select" [value]="r.basis" (change)="patch(i, { basis: $any($event.target).value })"><option>Basic</option><option>Gross</option></select></td>
                <td class="num"><input class="input n" type="number" [value]="r.minService" (change)="patch(i, { minService: +$any($event.target).value })" /></td>
                <td><select class="select" [value]="r.when" (change)="patch(i, { when: $any($event.target).value })"><option>Year-end</option><option>On request</option><option>On exit only</option></select></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Encashment Calculator</h3></div>
        <div class="form-grid">
          <label class="full">Employee<input class="input" list="enc-emps" [value]="cEmp()" (change)="cEmp.set($any($event.target).value)" placeholder="Type name or ID" /><datalist id="enc-emps">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist></label>
          <label>Leave type<select class="select" [value]="cType()" (change)="cType.set($any($event.target).value)">@for (r of rules(); track r.code) {<option [value]="r.code">{{ name(r.code) }}</option>}</select></label>
          <label>Days to encash<input class="input" type="number" min="0" step="0.5" [value]="cDays()" (input)="cDays.set(+$any($event.target).value)" /></label>
          <label>Monthly basic (AED)<input class="input" type="number" [value]="cBasic()" (input)="cBasic.set(+$any($event.target).value)" /></label>
        </div>
        @let c = calc();
        <div class="calc" [class.bad-box]="!c.ok">
          @if (c.ok) {
            <span>Eligible days: <b>{{ c.days }}</b> · daily rate <b>AED {{ c.rate }}</b></span>
            <b class="amt">AED {{ c.amount.toLocaleString() }}</b>
          } @else {
            <b>{{ c.msg }}</b>
          }
        </div>
        <button class="btn-primary" [disabled]="!c.ok || !c.days" (click)="request()">Create encashment request</button>
      </div>
      <div class="card span-12">
        <div class="card-head"><h3>Encashment Requests</h3></div>
        <app-data-table [rows]="reqs()" [columns]="cols" noun="requests" [searchKeys]="['name', 'empId']" [actions]="actions" (action)="decide($event.row.id, $event.action)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .rt .n { width: 64px; padding: 4px 6px; text-align: right; } .rt .select { padding: 5px 24px 5px 8px; } .rt tr.off td { opacity: .45; }
    .calc { display: flex; flex-direction: column; gap: 4px; margin: 12px 0; padding: 12px; border-radius: 10px; background: #f0fdf4; font-size: 12.5px; }
    .calc.bad-box { background: #fef2f2; color: #b91c1c; } .amt { font-size: 22px; color: #15803d; }
  `,
})
export class Encashment {
  protected readonly pick = BALANCES.slice(0, 300);
  protected readonly rules = signal<EncRule[]>([
    { code: 'AL', enabled: true, maxDays: 10, minKeep: 5, basis: 'Basic', minService: 12, when: 'Year-end' },
    { code: 'CL', enabled: true, maxDays: 5, minKeep: 0, basis: 'Basic', minService: 6, when: 'Year-end' },
    { code: 'SL', enabled: false, maxDays: 0, minKeep: 0, basis: 'Basic', minService: 0, when: 'On exit only' },
  ]);
  protected readonly cEmp = signal('EMP-00123 · Arjun Mehta');
  protected readonly cType = signal('AL');
  protected readonly cDays = signal(8);
  protected readonly cBasic = signal(18000);
  protected readonly toast = signal<string | null>(null);
  protected readonly reqs = signal<EncReq[]>(
    BALANCES.filter((b) => b.alLeft > 12).slice(0, 18).map((b, i) => ({ id: `EN-${510 + i}`, name: b.name, initials: b.initials, avatar: b.avatar, empId: b.id, type: 'AL', days: Math.min(10, Math.floor(b.alLeft - 5)), amount: Math.min(10, Math.floor(b.alLeft - 5)) * (420 + (i % 5) * 60), status: i < 7 ? 'Pending' : 'Approved' })),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'type', label: 'Leave' },
    { key: 'days', label: 'Days', kind: 'num' },
    { key: 'amount', label: 'Amount (AED)', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'Approved', label: 'Approve for payroll', icon: 'shield-check', when: (r) => r.status === 'Pending' },
    { id: 'Rejected', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
  ];

  /** Applies the selected rule to the calculator inputs. */
  protected readonly calc = computed(() => {
    const r = this.rules().find((x) => x.code === this.cType())!;
    const b = BALANCES.find((x) => x.id === this.cEmp().split(' · ')[0]);
    if (!r.enabled) return { ok: false, msg: `${this.name(r.code)} encashment is disabled`, days: 0, rate: 0, amount: 0 };
    if (!b) return { ok: false, msg: 'Pick an employee from the list', days: 0, rate: 0, amount: 0 };
    const left = r.code === 'AL' ? b.alLeft : r.code === 'CL' ? b.clLeft : b.slLeft;
    const days = Math.max(0, Math.min(this.cDays(), r.maxDays, left - r.minKeep));
    const monthly = r.basis === 'Basic' ? this.cBasic() : Math.round(this.cBasic() * 1.6);
    const rate = Math.round(monthly / 30);
    return { ok: true, msg: '', days, rate, amount: Math.round(days * rate) };
  });

  protected name(code: string) {
    return typeByCode(code).name;
  }
  protected patch(i: number, c: Partial<EncRule>) {
    this.rules.update((l) => l.map((r, j) => (j === i ? { ...r, ...c } : r)));
  }
  protected request() {
    const b = BALANCES.find((x) => x.id === this.cEmp().split(' · ')[0])!;
    const c = this.calc();
    this.reqs.update((l) => [{ id: `EN-${600 + l.length}`, name: b.name, initials: b.initials, avatar: b.avatar, empId: b.id, type: this.cType(), days: c.days, amount: c.amount, status: 'Pending' }, ...l]);
    this.notify(`Request for AED ${c.amount.toLocaleString()} created`);
  }
  protected decide(id: string, status: string) {
    this.reqs.update((l) => l.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

export const LEAVE_MONTHS = MONTHS;
