import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { Col, DataTable } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { VisitorStore } from './visitor-store';
import { duration, fmtTime, HISTORY_VISITS, HOSTS, PURPOSES, Visit } from './visitors.data';

/* ======================= Visitor Check-In / Check-Out ======================= */
@Component({
  selector: 'app-check-in-out',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Check-In / Check-Out" parent="Visitor Management" parentLink="/visitor-management" subtitle="Front-desk console: scan a QR pass or search, then check visitors in and out." />
    <section class="card scanbar">
      <app-icon name="grid" [size]="22" />
      <form (submit)="$event.preventDefault(); scan(code.value); code.value = ''">
        <input #code class="input" placeholder="Scan QR / type visitor ID (e.g. {{ sampleId() }}) or badge number" autofocus />
        <button class="btn-primary" type="submit">Find</button>
      </form>
      @if (msg(); as m) {<span [class]="m.ok ? 'good' : 'bad'">{{ m.text }}</span>}
    </section>
    <section class="kpi-row">
      <app-kpi label="Expected (not arrived)" [value]="expected().length" icon="clock" color="#f59e0b" />
      <app-kpi label="On Site" [value]="onsite().length" icon="users" color="#22c55e" />
      <app-kpi label="Checked Out Today" [value]="out()" icon="door-open" color="#ef4444" />
      <app-kpi label="Overstaying" [value]="overstay()" icon="triangle-alert" color="#dc2626" sub="on site > 6 h" />
    </section>
    <section class="desk">
      <div class="card">
        <div class="card-head"><h3>Expected Arrivals</h3><label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Filter" [value]="q1()" (input)="q1.set($any($event.target).value)" /></label></div>
        <ul class="vl">
          @for (v of expected(); track v.id) {
            <li [class.late]="v.expected < now()">
              <span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span>
              <div><b>{{ v.name }}</b><small>{{ v.company }} · host {{ v.host }}</small><small>{{ v.status === 'Pending Approval' ? 'Pending approval' : 'Expected ' + fmt(v.expected) }}{{ v.expected < now() ? ' · late' : '' }}</small></div>
              <button class="btn-primary btn-sm" [disabled]="v.status === 'Pending Approval'" (click)="checkIn(v)">Check in</button>
            </li>
          } @empty {<li class="empty-note">Nobody expected</li>}
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>On Site</h3><label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Filter" [value]="q2()" (input)="q2.set($any($event.target).value)" /></label></div>
        <ul class="vl">
          @for (v of onsite(); track v.id) {
            <li [class.over]="isOver(v)">
              <span class="dt-av" [style.background]="v.avatar">{{ v.initials }}</span>
              <div><b>{{ v.name }}</b><small>{{ v.company }} · {{ v.location }}</small><small>In {{ fmt(v.checkIn) }} · badge {{ v.badge }}</small></div>
              <span class="dur">{{ dur(v.checkIn) }}</span>
              <button class="btn-ghost sm" (click)="checkOut(v)">Check out</button>
            </li>
          }
        </ul>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .scanbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; color: var(--primary); flex-wrap: wrap; }
    .scanbar form { display: flex; gap: 8px; flex: 1; min-width: 280px; } .scanbar .input { flex: 1; font-size: 14px; padding: 10px 12px; }
    .desk { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .vl { list-style: none; margin: 0; padding: 0; max-height: 600px; overflow: auto; }
    .vl li { display: grid; grid-template-columns: 34px 1fr auto auto; gap: 10px; align-items: center; padding: 8px 4px; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
    .vl li div { display: flex; flex-direction: column; } .vl small { color: var(--muted); font-size: 11.5px; }
    .vl li.late small:last-child { color: #d97706; } .vl li.over { background: #fff7ed; }
    .dur { padding: 2px 8px; border-radius: 6px; background: #dcfce7; color: #15803d; font-size: 11.5px; font-weight: 600; } .over .dur { background: #ffedd5; color: #c2410c; }
    .search-box input { width: 120px; }
    @media (max-width: 900px) { .desk { grid-template-columns: 1fr; } }
  `,
})
export class CheckInOut {
  private readonly state = inject(AppState);
  private readonly store = inject(VisitorStore);
  protected readonly fmt = fmtTime;
  protected readonly q1 = signal('');
  protected readonly q2 = signal('');
  protected readonly msg = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly now = computed(() => {
    this.state.tick();
    return Date.now();
  });
  private match(v: Visit, q: string) {
    return !q || `${v.name} ${v.company} ${v.host} ${v.id}`.toLowerCase().includes(q.toLowerCase());
  }
  protected readonly expected = computed(() => this.store.visits().filter((v) => (v.status === 'Expected' || v.status === 'Pending Approval') && this.match(v, this.q1())).sort((a, b) => a.expected - b.expected));
  protected readonly onsite = computed(() => this.store.onSite().filter((v) => this.match(v, this.q2())).sort((a, b) => (a.checkIn ?? 0) - (b.checkIn ?? 0)));
  protected readonly out = computed(() => this.store.counts()['Checked Out'] ?? 0);
  protected readonly overstay = computed(() => this.store.onSite().filter((v) => this.isOver(v)).length);
  protected readonly sampleId = computed(() => this.expected()[0]?.id ?? 'VIS-26000');

  protected isOver(v: Visit) {
    return !!v.checkIn && this.now() - v.checkIn > 6 * 3600000;
  }
  protected dur(t: number | null) {
    return duration(t, this.now());
  }
  protected checkIn(v: Visit) {
    this.store.checkIn(v.id);
    this.notify(`${v.name} checked in · ${v.host} notified · badge printed`);
  }
  protected checkOut(v: Visit) {
    this.store.checkOut(v.id);
    this.notify(`${v.name} checked out after ${duration(v.checkIn)} · badge deactivated`);
  }
  protected scan(code: string) {
    const c = code.trim().toUpperCase();
    const v = this.store.visits().find((x) => x.id === c || x.badge === c);
    if (!v) return this.msg.set({ ok: false, text: `No visit found for “${code}”` });
    if (v.status === 'Expected') {
      this.checkIn(v);
      this.msg.set({ ok: true, text: `${v.name} checked in` });
    } else if (v.status === 'Checked In') {
      this.checkOut(v);
      this.msg.set({ ok: true, text: `${v.name} checked out` });
    } else this.msg.set({ ok: false, text: `${v.name} is ${v.status.toLowerCase()}` });
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Visitor Passes & Badges ======================= */
interface Template {
  id: string;
  name: string;
  color: string;
  label: string;
  photo: boolean;
  host: boolean;
  qr: boolean;
  validity: boolean;
  escort: boolean;
}

@Component({
  selector: 'app-passes-badges',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Passes &amp; Badges" parent="Visitor Management" parentLink="/visitor-management" subtitle="Badge templates, gate passes and printing for today's visitors." />
    <section class="dash">
      <div class="card span-4">
        <div class="card-head"><h3>Templates</h3></div>
        <div class="tpls">
          @for (t of templates(); track t.id) {
            <button class="tp" [class.on]="tid() === t.id" (click)="tid.set(t.id)"><i [style.background]="t.color"></i>{{ t.name }}</button>
          }
        </div>
        @let t = tpl();
        <div class="opts">
          <label>Colour<input type="color" [value]="t.color" (input)="patch({ color: $any($event.target).value })" /></label>
          <label>Header text<input class="input" [value]="t.label" (input)="patch({ label: $any($event.target).value })" /></label>
          @for (o of toggles; track o.key) {
            <label class="chk"><input type="checkbox" [checked]="t[o.key]" (change)="flip(o.key)" />{{ o.label }}</label>
          }
        </div>
      </div>
      <div class="card span-3 prev">
        <div class="card-head"><h3>Preview</h3></div>
        @let v = previewVisit();
        <div class="badge" [style.background]="'linear-gradient(160deg, ' + t.color + ', ' + t.color + 'cc)'">
          <div class="b-top"><b>Purple IQ</b><span>{{ t.label }}</span></div>
          @if (t.photo) {<span class="b-photo">{{ v?.initials }}</span>}
          <b class="b-name">{{ v?.name }}</b><span class="b-co">{{ v?.company }}</span>
          @if (t.host) {<small>Host: {{ v?.host }}</small>}
          @if (t.validity) {<small>Valid {{ fmt(v?.checkIn ?? null) }} – 18:00 today</small>}
          @if (t.escort) {<small class="esc">ESCORT REQUIRED</small>}
          @if (t.qr) {<div class="b-qr"></div>}
        </div>
      </div>
      <div class="card span-5">
        <div class="card-head"><h3>Print Badges</h3><button class="btn-primary btn-sm" (click)="printSel()" [disabled]="!sel().size">Print selected ({{ sel().size }})</button></div>
        <ul class="pl">
          @for (x of onsite(); track x.id) {
            <li [class.on]="previewId() === x.id" (click)="previewId.set(x.id)">
              <input type="checkbox" [checked]="sel().has(x.id)" (click)="$event.stopPropagation()" (change)="toggle(x.id)" />
              <span class="dt-av" [style.background]="x.avatar">{{ x.initials }}</span>
              <div><b>{{ x.name }}</b><small>{{ x.badge }} · {{ x.type }}</small></div>
              <span [class]="printed().has(x.id) ? 'tag green' : 'tag grey'">{{ printed().has(x.id) ? 'Printed' : 'Not printed' }}</span>
            </li>
          }
        </ul>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .tpls { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .tp { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 16px; background: #fff; font-size: 12px; cursor: pointer; } .tp.on { border-color: var(--primary); background: #f5f3ff; }
    .tp i { width: 10px; height: 10px; border-radius: 50%; }
    .opts { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; } .opts label { display: flex; flex-direction: column; gap: 4px; } .opts .chk { flex-direction: row; align-items: center; gap: 8px; }
    .prev { display: flex; flex-direction: column; align-items: center; }
    .badge { width: 200px; padding: 14px; border-radius: 14px; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 3px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
    .b-top { width: 100%; display: flex; justify-content: space-between; font-size: 11px; } .b-top span { padding: 1px 8px; border-radius: 10px; background: rgba(255,255,255,.22); }
    .b-photo { width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.25); font-size: 22px; font-weight: 700; border: 3px solid #fff; margin: 8px 0; }
    .b-name { font-size: 15px; } .b-co { font-size: 12px; opacity: .9; } .badge small { font-size: 10.5px; opacity: .9; } .esc { padding: 2px 6px; border-radius: 4px; background: #fff; color: #b91c1c; font-weight: 700; opacity: 1 !important; }
    .b-qr { width: 64px; height: 64px; margin-top: 8px; background: conic-gradient(#fff 0 25%, transparent 0 50%, #fff 0 75%, transparent 0) 0 0 / 12px 12px; border: 4px solid #fff; }
    .pl { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow: auto; }
    .pl li { display: grid; grid-template-columns: 18px 32px 1fr auto; gap: 8px; align-items: center; padding: 6px 4px; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; cursor: pointer; }
    .pl li.on { background: #faf8ff; } .pl div { display: flex; flex-direction: column; } .pl small { color: var(--muted); }
  `,
})
export class PassesBadges {
  private readonly store = inject(VisitorStore);
  protected readonly fmt = fmtTime;
  protected readonly toggles: { key: 'photo' | 'host' | 'qr' | 'validity' | 'escort'; label: string }[] = [
    { key: 'photo', label: 'Show photo' }, { key: 'host', label: 'Show host' }, { key: 'qr', label: 'QR code for doors' }, { key: 'validity', label: 'Show validity' }, { key: 'escort', label: 'Escort required banner' },
  ];
  protected readonly templates = signal<Template[]>([
    { id: 'visitor', name: 'Visitor', color: '#3b82f6', label: 'VISITOR', photo: true, host: true, qr: true, validity: true, escort: false },
    { id: 'contractor', name: 'Contractor', color: '#f97316', label: 'CONTRACTOR', photo: true, host: true, qr: true, validity: true, escort: true },
    { id: 'vip', name: 'VIP', color: '#a16207', label: 'VIP GUEST', photo: false, host: true, qr: false, validity: false, escort: false },
    { id: 'delivery', name: 'Delivery', color: '#0d9488', label: 'DELIVERY', photo: false, host: false, qr: true, validity: true, escort: false },
    { id: 'interview', name: 'Interview', color: '#7c3aed', label: 'CANDIDATE', photo: true, host: true, qr: true, validity: true, escort: true },
  ]);
  protected readonly tid = signal('visitor');
  protected readonly previewId = signal<string | null>(null);
  protected readonly sel = signal<Set<string>>(new Set());
  protected readonly printed = signal<Set<string>>(new Set());
  protected readonly toast = signal<string | null>(null);
  protected readonly tpl = computed(() => this.templates().find((t) => t.id === this.tid())!);
  protected readonly onsite = computed(() => this.store.onSite());
  protected readonly previewVisit = computed(() => this.onsite().find((v) => v.id === this.previewId()) ?? this.onsite()[0]);

  protected flip(k: 'photo' | 'host' | 'qr' | 'validity' | 'escort') {
    this.patch({ [k]: !this.tpl()[k] } as Partial<Template>);
  }
  protected patch(c: Partial<Template>) {
    this.templates.update((l) => l.map((t) => (t.id === this.tid() ? { ...t, ...c } : t)));
  }
  protected toggle(id: string) {
    this.sel.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected printSel() {
    const n = this.sel().size;
    this.printed.update((p) => new Set([...p, ...this.sel()]));
    this.sel.set(new Set());
    this.toast.set(`${n} badge(s) sent to Reception printer using “${this.tpl().name}” template`);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Visitor Logs & History ======================= */
@Component({
  selector: 'app-visitor-logs',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Logs &amp; History" parent="Visitor Management" parentLink="/visitor-management" subtitle="Every visit for the last 90 days, including today.">
      <button class="btn-outline" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export {{ rows().length.toLocaleString() }} rows</button>
    </app-page-head>
    <section class="card bar">
      <label>From<input class="input" type="date" [value]="from()" (change)="from.set($any($event.target).value)" /></label>
      <label>To<input class="input" type="date" [value]="to()" (change)="to.set($any($event.target).value)" /></label>
      @for (q of quick; track q.label) {<button class="btn-ghost sm" (click)="range(q.days)">{{ q.label }}</button>}
      <span class="muted">{{ rows().length.toLocaleString() }} visits · avg. stay {{ avgStay() }}</span>
    </section>
    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" noun="visits" [pageSize]="20" [searchKeys]="['name', 'company', 'host', 'id']" searchPlaceholder="Search visitor, company, host, visit ID..." />
    </div>
  `,
  styles: `.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding: 10px 12px; margin-bottom: 12px; } .bar label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #4b4f6b; } .bar .muted { margin-left: auto; }`,
})
export class VisitorLogs {
  private readonly store = inject(VisitorStore);
  private readonly d = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  protected readonly quick = [{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }];
  protected readonly from = signal(this.d(30));
  protected readonly to = signal(this.d(0));
  protected readonly cols: Col[] = [
    { key: 'expected', label: 'Date', fmt: (v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'name', label: 'Visitor', kind: 'person', sub: 'id' },
    { key: 'company', label: 'Company' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'host', label: 'Host' },
    { key: 'checkIn', label: 'In', fmt: (v) => fmtTime(v) },
    { key: 'checkOut', label: 'Out', fmt: (v) => fmtTime(v) },
    { key: 'site', label: 'Site' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Checked In', 'Checked Out', 'Expected', 'Pending Approval', 'Rejected', 'No-show'] },
    { key: 'purpose', label: 'Purpose', options: PURPOSES },
    { key: 'host', label: 'Host', options: HOSTS },
    { key: 'site', label: 'Site', options: ['Head Office', 'Manufacturing', 'Warehouse'] },
  ];
  protected readonly rows = computed(() => {
    const a = new Date(this.from()).setHours(0, 0, 0, 0);
    const b = new Date(this.to()).setHours(23, 59, 59, 999);
    return [...this.store.visits(), ...HISTORY_VISITS].filter((v) => v.expected >= a && v.expected <= b);
  });
  protected readonly avgStay = computed(() => {
    const closed = this.rows().filter((v) => v.checkIn && v.checkOut);
    const m = closed.reduce((s, v) => s + (v.checkOut! - v.checkIn!), 0) / (closed.length || 1) / 60000;
    return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  });
  protected range(days: number) {
    this.from.set(this.d(days));
    this.to.set(this.d(0));
  }
  protected exportCsv() {
    downloadCsv(`visitor-log-${this.from()}-to-${this.to()}.csv`, [['Visit ID', 'Date', 'Visitor', 'Company', 'Purpose', 'Host', 'In', 'Out', 'Site', 'Status'], ...this.rows().map((v) => [v.id, new Date(v.expected).toISOString().slice(0, 10), v.name, v.company, v.purpose, v.host, fmtTime(v.checkIn), fmtTime(v.checkOut), v.site, v.status])]);
  }
}
