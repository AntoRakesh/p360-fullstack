import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Series, UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { A_CSS, AFilters } from './a-filters';
import { ACampaign, ACounter, ADevice, AnalyticsStore, AReport, DevType, fmtMin, fmtN, HOURS, HOURS_FULL, STAFF_POOL } from './analytics.data';
import { FfBars, FfLine, MallCam, MallMap, MapMarker } from './analytics-ui';

const BASE = '/customer-visitor-analytics/';
function toaster() {
  const toast = signal<string | null>(null);
  return { toast, show: (m: string) => { toast.set(m); setTimeout(() => toast.set(null), 2600); } };
}
const fmtWait = (m: number) => (m <= 0 ? '—' : `${Math.floor(m)}m ${String(Math.round((m % 1) * 60)).padStart(2, '0')}s`);

/* =========================================================
   Queue Management
   ========================================================= */
@Component({
  selector: 'app-queue-management',
  imports: [...UI, AFilters, FfLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Queue Management" parent="Customer & Visitor Analytics" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="Live queue length and wait times at every counter, with SLA alerts and staff dispatch.">
      <app-a-filters [range]="false" />
      <label class="hsel"><app-icon name="a-timer" [size]="16" /><select [value]="sla()" (change)="sla.set(+$any($event.target).value)"><option [value]="4">SLA 4 min</option><option [value]="5">SLA 5 min</option><option [value]="6">SLA 6 min</option><option [value]="8">SLA 8 min</option></select><app-icon name="chevron-down" [size]="15" /></label>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="People in Queue" [value]="live().waiting" icon="users" color="var(--ka-7c3aed)" sub="across open counters" />
      <app-kpi label="Avg. Wait Time" [value]="w(live().avg)" icon="a-timer" color="var(--ka-f59e0b)" [sub]="live().avg > sla() ? 'above ' + sla() + ' min SLA' : 'within ' + sla() + ' min SLA'" [subColor]="live().avg > sla() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Longest Wait" [value]="w(live().longest.wait)" icon="clock" color="var(--ka-ef4444)" [sub]="live().longest.name" />
      <app-kpi label="Counters Open" [value]="live().open + ' / ' + s.counters().length" icon="door-open" color="var(--ka-22c55e)" sub="tap a counter to open/close" />
      <app-kpi label="SLA Met Today" [value]="slaMet() + '%'" icon="shield-check" color="var(--ka-3b82f6)" change="3%" sub="vs. yesterday" />
    </section>

    @if (alerts().length) {
      <div class="alerts">
        @for (a of alerts(); track a.id) {
          <div class="al"><app-icon name="triangle-alert" [size]="16" /><span><b>{{ a.name }}</b> · {{ a.waiting }} waiting, {{ w(a.wait) }} wait (SLA {{ sla() }} min)</span><span class="sp"></span>
            <button class="btn-ghost sm" (click)="dispatch(a)">Dispatch staff</button>
            @if (closedIn(a.zone); as c) {<button class="btn-primary btn-sm" (click)="toggle(c)">Open {{ c.name }}</button>}</div>
        }
      </div>
    }

    <section class="counters">
      @for (c of live().list; track c.id) {
        <div class="card qc" [class.off]="!c.open" [class.bad]="c.open && c.wait > sla()">
          <div class="qh"><div class="col"><b>{{ c.name }}</b><small>{{ c.zone }}</small></div><button class="toggle" [class.on]="c.open" (click)="toggle(c)" [title]="c.open ? 'Close counter' : 'Open counter'"></button></div>
          @if (c.open) {
            <div class="qn"><b>{{ c.waiting }}</b><span>waiting</span></div>
            <div class="people">@for (p of dots(c.waiting); track $index) {<i [style.background]="c.wait > sla() ? 'var(--ka-ef4444)' : 'var(--ka-7c3aed)'"></i>}</div>
            <div class="qf"><span>Wait <b [style.color]="c.wait > sla() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'">{{ w(c.wait) }}</b></span><span>{{ c.served }}/hr</span></div>
            <small class="muted">Staff: {{ c.staff }}</small>
          } @else {
            <div class="closed"><app-icon name="ban" [size]="20" /><span>Closed</span><button class="btn-ghost sm" (click)="toggle(c)">Open counter</button></div>
          }
        </div>
      }
    </section>

    <section class="row c21 eq">
      <div class="card"><div class="ch"><h3>Average Wait Time Today</h3><span class="muted">minutes · dashed = SLA</span></div>
        <app-ff-line [labels]="hours" [tipLabels]="hoursFull" [series]="waitSeries()" [height]="230" [every]="2" yLabel="Minutes" [pin]="9" /></div>
      <div class="card"><div class="ch"><h3>Queue by Zone</h3></div>
        <app-bar-list [rows]="byZone()" [max]="30" />
        <p class="muted tip">Tip: opening <b>Checkout 3</b> during 2–5 PM reduces Retail wait by ~2 min.</p></div>
    </section>

    @if (disp(); as d) {
      <div class="g-overlay" (click)="disp.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Dispatch staff to {{ d.name }}</h3><button class="close-btn" (click)="disp.set(null)">×</button></div>
        <ul class="list">
          @for (p of staff; track p) {<li class="click st" (click)="assign(d, p)"><span class="av">{{ ini(p) }}</span><div class="col"><b>{{ p }}</b><small>Available · {{ ($index % 3) + 1 }} min away</small></div><span class="link">Assign</span></li>}
        </ul>
      </div>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .alerts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .al { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: var(--kb-fef2f2); color: var(--kf-991b1b); font-size: 12.5px; border: 1px solid var(--kl-fecaca); } .al .sp { flex: 1; }
    .counters { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .qc { display: flex; flex-direction: column; gap: 8px; } .qc.off { background: var(--kb-fafafc); } .qc.bad { border-color: var(--kl-fca5a5); box-shadow: 0 0 0 2px var(--kb-fee2e2); }
    .qh { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; } .qh small { color: var(--muted); font-size: 11.5px; }
    .qn b { font-size: 26px; } .qn span { margin-left: 6px; color: var(--muted); font-size: 12px; }
    .people { display: flex; flex-wrap: wrap; gap: 3px; min-height: 18px; } .people i { width: 8px; height: 14px; border-radius: 4px 4px 2px 2px; }
    .qf { display: flex; justify-content: space-between; font-size: 12px; }
    .closed { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); padding: 16px 0; font-size: 12px; }
    .tip { margin: 12px 0 0; } .st { grid-template-columns: 32px 1fr auto; } .av { width: 32px; height: 32px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
    @media (max-width: 1300px) { .counters { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `],
})
export class QueueManagement {
  protected readonly s = inject(AnalyticsStore);
  protected readonly w = fmtWait;
  protected readonly hours = HOURS;
  protected readonly hoursFull = HOURS_FULL;
  protected readonly staff = STAFF_POOL;
  protected readonly t = toaster();
  protected readonly sla = signal(5);
  protected readonly disp = signal<ACounter | null>(null);
  /** Counters with live wobble on queue length. */
  protected readonly live = computed(() => {
    const f = this.s.site().factor;
    const list = this.s.counters().map((c) => {
      if (!c.open) return c;
      const waiting = Math.max(0, Math.round(c.waiting * f + this.wob(c.id, 2)));
      return { ...c, waiting, wait: Math.max(0.5, +(c.wait * (waiting / Math.max(1, c.waiting * f))).toFixed(1)) };
    });
    const open = list.filter((c) => c.open);
    const waiting = open.reduce((a, c) => a + c.waiting, 0);
    const avg = waiting ? open.reduce((a, c) => a + c.wait * c.waiting, 0) / waiting : 0;
    const longest = open.reduce((m, c) => (c.wait > m.wait ? c : m), open[0] ?? list[0]);
    return { list, open: open.length, waiting, avg, longest };
  });
  private wob(id: string, amp: number) {
    const t = this.s.tick();
    const h = [...id].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);
    return this.s.isLive() && t ? Math.round(Math.sin(t / 2 + h) * amp) : 0;
  }
  protected readonly alerts = computed(() => this.live().list.filter((c) => c.open && c.wait > this.sla()));
  protected readonly slaMet = computed(() => Math.min(99, Math.round(84 + this.sla() * 1.6 - this.alerts().length * 2)));
  protected readonly waitSeries = computed<Series[]>(() => {
    const base = [1.2, 1.6, 2.1, 2.6, 3.1, 3.8, 4.6, 5.2, 5.6, 6.1, 5.4, 4.8, 4.2, 3.6, 2.9, 2.2];
    const k = (this.live().open ? 8 / this.live().open : 1.5) * 0.98;
    return [
      { name: 'Avg wait (min)', color: 'var(--ka-f59e0b)', values: base.map((v) => +(v * k).toFixed(1)), area: true },
      { name: 'SLA', color: 'var(--ka-ef4444)', dashed: true, values: base.map(() => this.sla()) },
    ];
  });
  protected readonly byZone = computed(() => {
    const m = new Map<string, number>();
    this.live().list.filter((c) => c.open).forEach((c) => m.set(c.zone, (m.get(c.zone) ?? 0) + c.waiting));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, display: `${value}`, color: ['var(--ka-ef4444)', 'var(--ka-f97316)', 'var(--ka-f59e0b)', 'var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-14b8a6)'][i] }));
  });
  protected dots(n: number) {
    return Array.from({ length: Math.min(n, 24) });
  }
  protected closedIn(zone: string) {
    return this.s.counters().find((c) => c.zone === zone && !c.open) ?? null;
  }
  protected ini(n: string) {
    return n.split(' ').map((p) => p[0]).join('');
  }
  protected toggle(c: ACounter) {
    const orig = this.s.counters().find((x) => x.id === c.id)!;
    if (orig.open) {
      this.s.patchCounter(c.id, { open: false, waiting: 0, wait: 0, served: 0, staff: '' });
      // queue moves to the other counters in the zone
      this.s.counters().filter((x) => x.zone === c.zone && x.open).forEach((x) => this.s.patchCounter(x.id, { waiting: x.waiting + Math.ceil(orig.waiting / 2), wait: +(x.wait * 1.3).toFixed(1) }));
      return this.t.show(`${c.name} closed · customers redirected`);
    }
    const peers = this.s.counters().filter((x) => x.zone === c.zone && x.open);
    const moved = peers.reduce((a, x) => a + Math.floor(x.waiting / 3), 0);
    peers.forEach((x) => this.s.patchCounter(x.id, { waiting: x.waiting - Math.floor(x.waiting / 3), wait: +(x.wait * 0.68).toFixed(1) }));
    this.s.patchCounter(c.id, { open: true, waiting: moved, wait: Math.max(1, +(moved * 0.4).toFixed(1)), served: 30, staff: STAFF_POOL[c.id.length % STAFF_POOL.length] });
    this.t.show(`${c.name} opened · ${moved} customers moved, wait times dropping`);
  }
  protected dispatch(c: ACounter) {
    this.disp.set(c);
  }
  protected assign(c: ACounter, p: string) {
    const orig = this.s.counters().find((x) => x.id === c.id)!;
    this.s.patchCounter(c.id, { staff: `${orig.staff} + ${p.split(' ')[0]}`, wait: +(orig.wait * 0.7).toFixed(1), served: orig.served + 18 });
    this.disp.set(null);
    this.t.show(`${p} dispatched to ${c.name} · notified on mobile`);
  }
}

/* =========================================================
   Conversion & Engagement
   ========================================================= */
@Component({
  selector: 'app-conversion-engagement',
  imports: [...UI, AFilters, DataTable, FfBars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Conversion & Engagement" parent="Customer & Visitor Analytics" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="From footfall to purchase: funnel, zone conversion, engagement and campaign performance.">
      <app-a-filters />
      <button class="btn-primary hb" (click)="openForm()"><app-icon name="plus" [size]="16" />New Campaign</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Footfall" [value]="n(s.total())" icon="users" color="var(--ka-7c3aed)" change="12%" sub="vs. last week" />
      <app-kpi label="Engaged Visitors" [value]="n(funnel()[2].v)" icon="eye" color="var(--ka-3b82f6)" change="8%" sub="dwell > 10 min in a store" />
      <app-kpi label="Conversion Rate" [value]="conv() + '%'" icon="a-target" color="var(--ka-22c55e)" change="1.6%" sub="vs. last week" />
      <app-kpi label="Avg. Basket" value="AED 236" icon="a-bag" color="var(--ka-f59e0b)" change="4%" sub="vs. last week" />
      <app-kpi label="Active Campaigns" [value]="activeCamps()" icon="megaphone" color="var(--ka-ec4899)" [sub]="n(totalReach()) + ' reached'" />
    </section>

    <section class="row c2 eq">
      <div class="card"><div class="ch"><h3>Visitor Funnel</h3><span class="muted">{{ s.range() }}</span></div>
        <div class="funnel">
          @for (f of funnel(); track f.label; let i = $index) {
            <div class="fr"><span class="fl">{{ f.label }}</span>
              <div class="ft"><i [style.width.%]="(f.v / funnel()[0].v) * 100" [style.background]="f.c"><b>{{ n(f.v) }}</b></i></div>
              <span class="fp">{{ i ? ((f.v / funnel()[i - 1].v) * 100).toFixed(1) + '%' : '100%' }}</span></div>
          }
        </div>
      </div>
      <div class="card"><div class="ch"><h3>Conversion by Zone</h3><span class="muted">% of zone visitors who purchased</span></div>
        <app-ff-bars [labels]="zc().labels" [series]="zc().series" [height]="220" /></div>
    </section>

    <section class="row c12 eq">
      <div class="card"><div class="ch"><h3>Dwell vs Conversion</h3><span class="muted">bubble = footfall</span></div>
        <svg viewBox="0 0 360 240" class="sc">
          @for (g of [0, 1, 2, 3]; track g) {<line x1="40" x2="350" [attr.y1]="34 + g * 50" [attr.y2]="34 + g * 50" class="grid" /><text x="32" [attr.y]="38 + g * 50" text-anchor="end" class="axis">{{ 60 - g * 20 }}%</text>}
          @for (g of [0, 1, 2, 3]; track g) {<text [attr.x]="40 + g * 100" y="236" text-anchor="middle" class="axis">{{ 30 + g * 35 }}m</text>}
          @for (p of scatter(); track p.name) {
            <g (click)="sel.set(p.name)" class="pt"><circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.r" [attr.fill]="p.color" fill-opacity=".55" [attr.stroke]="p.color" [attr.stroke-width]="sel() === p.name ? 3 : 1.5" />
              <text [attr.x]="p.x" [attr.y]="p.y - p.r - 4" text-anchor="middle" class="sl">{{ p.name }}</text></g>
          }
        </svg>
        @if (selZ(); as z) {<p class="muted">{{ z.name }} · dwell {{ m(z.dwell) }} · conversion {{ z.conv }}% · {{ n(z.entries) }} entries</p>}
      </div>
      <div class="card">
        <div class="ch"><h3>Campaigns</h3><button class="link" (click)="exportCsv()">Export CSV</button></div>
        <app-data-table [rows]="camps()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'zone', 'channel']" searchPlaceholder="Search campaigns..." noun="campaigns" [pageSize]="6" (action)="act($event.action, $event.row)" />
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>New Campaign</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Zone<select class="select" [value]="f.zone" (change)="setF('zone', $any($event.target).value)">@for (z of s.zones(); track z.id) {<option [value]="z.name">{{ z.name }}</option>}</select></label>
          <label>Channel<select class="select" [value]="f.channel" (change)="setF('channel', $any($event.target).value)"><option>Loyalty App</option><option>Digital Signage</option><option>SMS + Signage</option><option>Wi-Fi Portal</option><option>Email</option></select></label>
          <label>Start<input class="input" type="date" [value]="f.start" (change)="setF('start', $any($event.target).value)" /></label>
          <label>End<input class="input" type="date" [value]="f.end" (change)="setF('end', $any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .funnel { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; }
    .fr { display: grid; grid-template-columns: 120px 1fr 56px; gap: 10px; align-items: center; font-size: 12.5px; }
    .ft { height: 30px; background: var(--kb-f4f4f9); border-radius: 6px; overflow: hidden; } .ft i { font-style: normal; display: flex; align-items: center; height: 100%; border-radius: 6px; transition: width .5s; min-width: 60px; }
    .ft b { color: var(--kf-ffffff); font-size: 12px; padding-left: 10px; } .fp { text-align: right; font-weight: 600; }
    .sc { width: 100%; display: block; } .sc .grid { stroke: var(--kl-eceef4); } .sc .axis { font-size: 10px; fill: var(--ka-6b7090); } .sl { font-size: 9.5px; fill: var(--ka-12142b); font-weight: 600; } .pt { cursor: pointer; }
  `],
})
export class Conversion {
  protected readonly s = inject(AnalyticsStore);
  protected readonly n = fmtN;
  protected readonly m = fmtMin;
  protected readonly t = toaster();
  protected readonly sel = signal<string | null>('Food Court');
  protected readonly funnel = computed(() => {
    const T = this.s.total();
    return [
      { label: 'Footfall', v: T, c: 'var(--ka-7c3aed)' },
      { label: 'Store visits', v: Math.round(T * 0.68), c: 'var(--ka-8b5cf6)' },
      { label: 'Engaged (10m+)', v: Math.round(T * 0.33), c: 'var(--ka-3b82f6)' },
      { label: 'Purchases', v: Math.round(T * 0.185), c: 'var(--ka-22c55e)' },
      { label: 'Loyalty sign-ups', v: Math.round(T * 0.031), c: 'var(--ka-f59e0b)' },
    ];
  });
  protected readonly conv = computed(() => ((this.funnel()[3].v / this.funnel()[0].v) * 100).toFixed(1));
  protected readonly zc = computed(() => {
    const z = this.s.zonesNow().filter((x) => x.conv);
    return { labels: z.map((x) => x.name), series: [{ name: 'Conversion %', color: 'var(--ka-22c55e)', values: z.map((x) => x.conv) }, { name: 'Target %', color: 'var(--ka-c4b5fd)', values: z.map((x) => (x.type === 'Leisure' ? 55 : x.type === 'Dining' ? 45 : 25)) }] as Series[] };
  });
  protected readonly scatter = computed(() => this.s.zonesNow().filter((z) => z.conv).map((z) => ({ name: z.name, color: z.color, x: 40 + ((z.dwell - 30) / 35) * 100, y: 170 - (z.conv / 60) * 150 + 14, r: 6 + Math.sqrt(z.entries) / 4 })));
  protected readonly selZ = computed(() => this.s.zonesNow().find((z) => z.name === this.sel()) ?? null);
  protected readonly camps = computed(() => this.s.campaigns().map((c) => ({ ...c, rate: c.reach ? `${((c.converted / c.reach) * 100).toFixed(1)}%` : '—', reachText: fmtN(c.reach) })));
  protected readonly activeCamps = computed(() => this.s.campaigns().filter((c) => c.status === 'Active').length);
  protected readonly totalReach = computed(() => this.s.campaigns().reduce((a, c) => a + c.reach, 0));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Campaign', sub: 'channel' },
    { key: 'zone', label: 'Zone' },
    { key: 'reachText', label: 'Reach' },
    { key: 'rate', label: 'Conv.' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Active' ? 'tag green' : r.status === 'Scheduled' ? 'tag blue' : r.status === 'Paused' ? 'tag amber' : 'tag grey') },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Active', 'Scheduled', 'Paused', 'Completed'] }];
  protected readonly actions: RowAction[] = [
    { id: 'pause', label: 'Pause', icon: 'pause', when: (r) => r.status === 'Active' },
    { id: 'resume', label: 'Resume', icon: 'play', when: (r) => r.status === 'Paused' || r.status === 'Scheduled' },
    { id: 'complete', label: 'End campaign', icon: 'file-check', when: (r) => r.status !== 'Completed' },
    { id: 'delete', label: 'Delete', icon: 'a-trash', danger: true },
  ];
  protected act(a: string, c: ACampaign) {
    if (a === 'delete') {
      this.s.campaigns.update((l) => l.filter((x) => x.id !== c.id));
      return this.t.show(`${c.name} deleted`);
    }
    const status = a === 'pause' ? 'Paused' : a === 'resume' ? 'Active' : 'Completed';
    this.s.campaigns.update((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
    this.t.show(`${c.name} · ${status}`);
  }
  protected readonly form = signal<ACampaign | null>(null);
  protected readonly err = signal('');
  protected openForm() {
    this.err.set('');
    this.form.set({ id: '', name: '', zone: 'Retail Zone', channel: 'Loyalty App', start: '2026-10-15', end: '2026-10-31', reach: 0, engaged: 0, converted: 0, status: 'Scheduled' });
  }
  protected setF<K extends keyof ACampaign>(k: K, v: ACampaign[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim()) return this.err.set('Campaign name is required.');
    if (f.end < f.start) return this.err.set('End date must be after start date.');
    this.s.campaigns.update((l) => [{ ...f, id: `C${Date.now()}`, status: f.start <= '2026-10-14' ? 'Active' : 'Scheduled' }, ...l]);
    this.form.set(null);
    this.t.show(`${f.name} created`);
  }
  protected exportCsv() {
    downloadCsv('campaigns.csv', [['Campaign', 'Zone', 'Channel', 'Start', 'End', 'Reach', 'Engaged', 'Converted', 'Status'], ...this.s.campaigns().map((c) => [c.name, c.zone, c.channel, c.start, c.end, c.reach, c.engaged, c.converted, c.status])]);
    this.s.logRun('Campaign Conversion', 'CSV');
  }
}

/* =========================================================
   Reports & Insights
   ========================================================= */
const TEMPLATES = [
  { name: 'Footfall & People Counting', icon: 'users', color: 'var(--ka-7c3aed)', desc: 'Entries, exits, occupancy and trends' },
  { name: 'Zone Performance', icon: 'map-floor', color: 'var(--ka-3b82f6)', desc: 'Utilisation, dwell and conversion by zone' },
  { name: 'Dwell Time & Journeys', icon: 'clock', color: 'var(--ka-f59e0b)', desc: 'Dwell distribution and top paths' },
  { name: 'Demographics Summary', icon: 'sparkles', color: 'var(--ka-ec4899)', desc: 'Age, gender and group mix' },
  { name: 'Loyalty & Repeat Visits', icon: 'a-repeat', color: 'var(--ka-22c55e)', desc: 'New vs repeat, cohorts, at-risk' },
  { name: 'Queue SLA', icon: 'a-timer', color: 'var(--ka-ef4444)', desc: 'Wait times and SLA compliance' },
  { name: 'Campaign ROI', icon: 'megaphone', color: 'var(--ka-14b8a6)', desc: 'Reach, engagement and conversion' },
  { name: 'Device Health', icon: 'cpu', color: 'var(--ka-64748b)', desc: 'Uptime, accuracy and alerts' },
];

@Component({
  selector: 'app-reports-insights',
  imports: [...UI, AFilters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports & Insights" parent="Customer & Visitor Analytics" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="Generate, schedule and share analytics reports, plus AI-detected insights that need attention.">
      <app-a-filters />
      <button class="btn-primary hb" (click)="openForm()"><app-icon name="plus" [size]="16" />New Schedule</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Scheduled Reports" [value]="activeSched()" icon="calendar-days" color="var(--ka-7c3aed)" [sub]="s.reports().length + ' configured'" />
      <app-kpi label="Generated (MTD)" [value]="148 + s.runs().length - 5" icon="file-chart" color="var(--ka-3b82f6)" change="22%" sub="vs. last month" />
      <app-kpi label="Open Insights" [value]="openInsights()" icon="lightbulb" color="var(--ka-f59e0b)" [sub]="highInsights() + ' high priority'" [subColor]="highInsights() ? 'var(--ka-dc2626)' : undefined" />
      <app-kpi label="Subscribers" value="36" icon="a-mail" color="var(--ka-22c55e)" sub="across 6 teams" />
    </section>

    <section class="row c21 eq">
      <div class="card">
        <div class="ch"><h3>Report Templates</h3><span class="muted">{{ s.site().name }} · {{ s.range() }}</span></div>
        <div class="tpl">
          @for (t of templates; track t.name) {
            <div class="tp"><span class="ic" [style.background]="'color-mix(in srgb, ' + t.color + ' 10%, transparent)'" [style.color]="t.color"><app-icon [name]="t.icon" [size]="18" /></span>
              <div class="col"><b>{{ t.name }}</b><small>{{ t.desc }}</small></div>
              <button class="btn-ghost sm" [disabled]="busy() === t.name" (click)="generate(t.name)">{{ busy() === t.name ? 'Generating…' : 'Generate' }}</button></div>
          }
        </div>
      </div>
      <div class="card">
        <div class="ch"><h3>AI Insights</h3><div class="seg"><button [class.on]="!showAck()" (click)="showAck.set(false)">Open</button><button [class.on]="showAck()" (click)="showAck.set(true)">All</button></div></div>
        <ul class="list ins">
          @for (i of insights(); track i.id) {
            <li [class.ack]="i.ack"><span class="sev" [class]="'sev ' + i.sev"></span>
              <div class="col"><b>{{ i.title }}</b><small>{{ i.text }}</small><small>{{ i.zone }} · {{ i.time }}</small>
                <div class="ia"><button class="link" (click)="go(i.link)">Open</button>@if (!i.ack) {<button class="link" (click)="s.ack(i.id)">Acknowledge</button>}</div></div></li>
          } @empty {<li class="muted">No open insights 🎉</li>}
        </ul>
      </div>
    </section>

    <section class="row">
      <div class="card">
        <div class="ch"><h3>Scheduled Reports</h3><span class="muted">{{ activeSched() }} active</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Report</th><th>Schedule</th><th>Format</th><th>Recipients</th><th>Last run</th><th>Active</th><th></th></tr></thead>
          <tbody>
            @for (r of s.reports(); track r.id) {
              <tr><td><b>{{ r.name }}</b><div class="muted">{{ r.type }}</div></td><td>{{ r.schedule }}</td><td><span class="tag grey">{{ r.format }}</span></td><td class="rc">{{ r.recipients }}</td><td>{{ r.lastRun }}</td>
                <td><button class="toggle" [class.on]="r.active" (click)="toggle(r)"></button></td>
                <td class="acts"><button class="link" (click)="runNow(r)">Run now</button><button class="link" (click)="openForm(r)">Edit</button><button class="link danger" (click)="remove(r)">Delete</button></td></tr>
            }
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="ch"><h3>Recently Generated</h3><span class="muted">{{ s.runs().length }} files</span></div>
        <ul class="list runs">
          @for (r of s.runs().slice(0, 8); track r.id) {
            <li><span class="ic" style="background:var(--kb-f3efff);color:var(--kf-7c3aed)"><app-icon name="file-text" [size]="16" /></span><div class="col"><b>{{ r.name }}</b><small>{{ r.at }} · {{ r.by }} · {{ r.size }}</small></div>
              <button class="btn-ghost sm" (click)="download(r.name)"><app-icon name="download" [size]="13" />{{ r.format }}</button></li>
          }
        </ul>
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit schedule' : 'New scheduled report' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Report *<select class="select" [value]="f.name" (change)="setF('name', $any($event.target).value)">@for (t of templateNames; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Frequency<select class="select" [value]="f.schedule" (change)="setF('schedule', $any($event.target).value)"><option>Daily · 07:00</option><option>Daily · 22:00</option><option>Weekly · Mon 08:00</option><option>Weekly · Fri 17:00</option><option>Monthly · 1st 09:00</option></select></label>
          <label>Format<select class="select" [value]="f.format" (change)="setF('format', $any($event.target).value)"><option>PDF</option><option>CSV</option><option>XLSX</option></select></label>
          <label class="full">Recipients *<input class="input" [value]="f.recipients" (input)="setF('recipients', $any($event.target).value)" placeholder="name@company.com, team@company.com" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save schedule</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .tp { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; font-size: 12.5px; } .tp small { color: var(--muted); font-size: 11.5px; }
    .ins li { grid-template-columns: 4px 1fr; align-items: stretch; } .ins li.ack { opacity: .55; } .ins small { line-height: 1.4; }
    .sev { width: 4px; border-radius: 2px; } .sev.high { background: var(--kb-ef4444); } .sev.medium { background: var(--kb-f59e0b); } .sev.info { background: var(--kb-3b82f6); }
    .ia { display: flex; gap: 14px; margin-top: 4px; } .ins { max-height: 330px; overflow: auto; }
    .acts { display: flex; gap: 10px; } .danger { color: var(--red); } .rc { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
    .runs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; } .runs li { grid-template-columns: 34px 1fr auto; padding: 7px 4px; }
  `],
})
export class AnalyticsReports {
  protected readonly s = inject(AnalyticsStore);
  private readonly router = inject(Router);
  protected readonly templates = TEMPLATES;
  protected readonly templateNames = TEMPLATES.map((t) => t.name);
  protected readonly t = toaster();
  protected readonly busy = signal<string | null>(null);
  protected readonly showAck = signal(false);
  protected readonly activeSched = computed(() => this.s.reports().filter((r) => r.active).length);
  protected readonly openInsights = computed(() => this.s.insights().filter((i) => !i.ack).length);
  protected readonly highInsights = computed(() => this.s.insights().filter((i) => !i.ack && i.sev === 'high').length);
  protected readonly insights = computed(() => this.s.insights().filter((i) => this.showAck() || !i.ack));
  protected go(p: string) {
    this.router.navigateByUrl(BASE + p);
  }
  protected generate(name: string) {
    this.busy.set(name);
    setTimeout(() => {
      this.busy.set(null);
      this.s.logRun(name, 'PDF');
      this.t.show(`${name} report ready · ${this.s.site().name}, ${this.s.range()}`);
    }, 1200);
  }
  protected download(name: string) {
    const s = this.s;
    downloadCsv(`${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, [[name], ['Site', s.site().name], ['Range', s.range()], [], ['Zone', 'Entries', 'Exits', 'Occupancy', 'Avg dwell (min)'], ...s.zonesNow().map((z) => [z.name, z.entries, z.exits, z.occ, z.dwell])]);
  }
  protected toggle(r: AReport) {
    this.s.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    this.t.show(`${r.name} ${r.active ? 'paused' : 'resumed'}`);
  }
  protected runNow(r: AReport) {
    this.s.logRun(r.name, r.format);
    this.s.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, lastRun: this.s.runs()[0].at } : x)));
    this.t.show(`${r.name} sent to ${r.recipients}`);
  }
  protected remove(r: AReport) {
    this.s.reports.update((l) => l.filter((x) => x.id !== r.id));
    this.t.show(`${r.name} schedule deleted`);
  }
  protected readonly form = signal<AReport | null>(null);
  protected readonly err = signal('');
  protected openForm(r?: AReport) {
    this.err.set('');
    this.form.set(r ? { ...r } : { id: '', name: TEMPLATES[0].name, type: 'Footfall', schedule: 'Daily · 07:00', format: 'PDF', recipients: '', lastRun: '—', active: true });
  }
  protected setF<K extends keyof AReport>(k: K, v: AReport[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!/\S+@\S+\.\S+/.test(f.recipients)) return this.err.set('Enter at least one valid recipient email.');
    if (f.id) this.s.reports.update((l) => l.map((x) => (x.id === f.id ? f : x)));
    else this.s.reports.update((l) => [...l, { ...f, id: `R${Date.now()}`, type: f.name.split(' ')[0] }]);
    this.form.set(null);
    this.t.show('Schedule saved');
  }
}

/* =========================================================
   Device Management
   ========================================================= */
const DEV_TYPES: DevType[] = ['AI Camera', '3D People Counter', 'Thermal Sensor', 'Wi-Fi Probe', 'Queue Sensor'];
const TYPE_ICON: Record<DevType, string> = { 'AI Camera': 'a-camera', '3D People Counter': 'a-scan', 'Thermal Sensor': 'activity', 'Wi-Fi Probe': 'wifi', 'Queue Sensor': 'a-timer' };
const STATUS_COLOR: Record<string, string> = { Online: 'var(--ka-22c55e)', Warning: 'var(--ka-f59e0b)', Offline: 'var(--ka-ef4444)', Disabled: 'var(--ka-94a3b8)' };

@Component({
  selector: 'app-device-management',
  imports: [...UI, AFilters, DataTable, MallMap, MallCam, FfLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Device Management" parent="Customer & Visitor Analytics" parentLink="/customer-visitor-analytics/footfall-people-counting" subtitle="People counters, AI cameras and sensors that feed footfall, occupancy and queue analytics.">
      <app-a-filters [range]="false" />
      <button class="btn-primary hb" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Device</button>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="a-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Devices" [value]="s.devCounts().total" icon="cpu" color="var(--ka-7c3aed)" sub="5 device types" />
      <app-kpi label="Online" [value]="s.devCounts().online" icon="wifi" color="var(--ka-22c55e)" [sub]="pctOnline() + '% availability'" subColor="var(--ka-16a34a)" />
      <app-kpi label="Offline" [value]="s.devCounts().offline" icon="a-power" color="var(--ka-ef4444)" [sub]="s.devCounts().offline ? 'needs attention' : 'none'" [subColor]="s.devCounts().offline ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Warnings" [value]="s.devCounts().warning" icon="triangle-alert" color="var(--ka-f59e0b)" sub="accuracy below target" />
      <app-kpi label="Avg. Count Accuracy" [value]="avgAcc() + '%'" icon="a-target" color="var(--ka-3b82f6)" sub="target ≥ 97%" />
    </section>

    <section class="row" [class.dsel]="!!sel()">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['id', 'name', 'zone', 'ip']" searchPlaceholder="Search device, zone, IP..." noun="devices"
          [activeId]="selId()" [pageSize]="12" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      @if (sel(); as d) {
        <aside class="card det">
          <div class="dh"><span class="ic" [style.background]="'color-mix(in srgb, ' + STATUS_COLOR[d.status] + ' 13%, transparent)'" [style.color]="STATUS_COLOR[d.status]"><app-icon [name]="TYPE_ICON[d.type]" [size]="18" /></span>
            <div class="col"><h3>{{ d.name }}</h3><small class="muted">{{ d.id }} · {{ d.type }}</small></div>
            <span [class]="tagCls(d.status)">{{ busyId() === d.id ? 'Restarting…' : d.status }}</span><button class="close-btn" (click)="selId.set(null)">×</button></div>
          @if (d.type === 'AI Camera') {
            <div class="cam"><app-mall-cam [tick]="s.tick()" [offline]="d.status === 'Offline' || d.status === 'Disabled'" [seed]="+d.id.slice(-1) + 2" [count]="30" /></div>
          }
          <dl class="facts">
            <dt>Zone</dt><dd>{{ d.zone }}</dd><dt>IP address</dt><dd>{{ d.ip }}</dd><dt>Firmware</dt><dd>{{ d.firmware }} @if (d.firmware < latest(d)) {<span class="tag amber">update {{ latest(d) }}</span>}</dd>
            <dt>Last seen</dt><dd>{{ d.lastSeen }}</dd><dt>Counted today</dt><dd>{{ n(d.counted) }}</dd><dt>Uptime (30d)</dt><dd>{{ d.uptime.toFixed(1) }}%</dd>
          </dl>
          <div class="acc"><span>Accuracy</span><div class="bar"><i [style.width.%]="d.accuracy" [style.background]="d.accuracy >= 97 ? 'var(--ka-22c55e)' : d.accuracy >= 90 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'"></i></div><b>{{ d.accuracy.toFixed(1) }}%</b></div>
          <h4>Accuracy · last 7 days</h4>
          <app-ff-line [labels]="days" [series]="accSeries(d)" [height]="140" [max]="100" />
          <div class="acts">
            <button class="btn-ghost sm" (click)="act('restart', d)"><app-icon name="refresh" [size]="13" />Restart</button>
            <button class="btn-ghost sm" (click)="act('calibrate', d)"><app-icon name="a-target" [size]="13" />Calibrate</button>
            @if (d.firmware < latest(d)) {<button class="btn-ghost sm" (click)="act('update', d)"><app-icon name="download" [size]="13" />Update firmware</button>}
            <button class="btn-ghost sm" (click)="act(d.status === 'Disabled' ? 'enable' : 'disable', d)"><app-icon name="a-power" [size]="13" />{{ d.status === 'Disabled' ? 'Enable' : 'Disable' }}</button>
          </div>
        </aside>
      }
    </section>

    <section class="card">
      <div class="ch"><h3>Device Map</h3><div class="ch-r">@for (st of statuses; track st) {<span class="lg"><i [style.background]="STATUS_COLOR[st]"></i>{{ st }}</span>}</div></div>
      <app-mall-map class="map" [zones]="mapZones()" [showHeat]="false" [showZones]="false" [markers]="markers()" [selected]="selId()" [labelSize]="13" (markerClick)="selId.set($event)" (zoneClick)="filterZone($event)" />
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Add Device</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Device name *<input class="input" required [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <label>Type<select class="select" [value]="f.type" (change)="setF('type', $any($event.target).value)">@for (t of types; track t) {<option [value]="t">{{ t }}</option>}</select></label>
          <label>Zone<select class="select" [value]="f.zone" (change)="setF('zone', $any($event.target).value)">@for (z of s.zones(); track z.id) {<option [value]="z.name">{{ z.name }}</option>}</select></label>
          <label>IP address *<input class="input" [value]="f.ip" (input)="setF('ip', $any($event.target).value)" placeholder="10.20.4.120" /></label>
          <label>Firmware<input class="input" [value]="f.firmware" (input)="setF('firmware', $any($event.target).value)" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Register device</button></div>
      </form>
    }
    @if (t.toast()) {<div class="g-toast">{{ t.toast() }}</div>}
  `,
  styles: [A_CSS, `
    .dsel { grid-template-columns: minmax(0, 1.7fr) minmax(360px, 1fr); }
    .det { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 76px; }
    .dh { display: grid; grid-template-columns: 34px 1fr auto auto; gap: 10px; align-items: center; }
    .cam { position: relative; height: 170px; border-radius: 8px; overflow: hidden; } .cam app-mall-cam { position: absolute; inset: 0; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 12.5px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; display: flex; gap: 6px; align-items: center; }
    .acc { display: grid; grid-template-columns: 70px 1fr 50px; gap: 10px; align-items: center; font-size: 12.5px; } .acc b { text-align: right; }
    .acts { display: flex; flex-wrap: wrap; gap: 6px; } .map { height: 400px; }
    @media (max-width: 1250px) { .dsel { grid-template-columns: 1fr; } .det { position: static; } }
  `],
})
export class AnalyticsDevices {
  protected readonly s = inject(AnalyticsStore);
  protected readonly n = fmtN;
  protected readonly t = toaster();
  protected readonly types = DEV_TYPES;
  protected readonly TYPE_ICON = TYPE_ICON;
  protected readonly STATUS_COLOR = STATUS_COLOR;
  protected readonly statuses = ['Online', 'Warning', 'Offline', 'Disabled'];
  protected readonly days = ['8 Oct', '9 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct'];
  protected readonly selId = signal<string | null>('CAM-05');
  protected readonly busyId = signal<string | null>(null);
  protected readonly sel = computed(() => this.s.devices().find((d) => d.id === this.selId()) ?? null);
  protected readonly pctOnline = computed(() => ((this.s.devCounts().online / Math.max(1, this.s.devCounts().total)) * 100).toFixed(1));
  protected readonly avgAcc = computed(() => { const l = this.s.devices().filter((d) => d.status !== 'Offline' && d.status !== 'Disabled'); return (l.reduce((a, d) => a + d.accuracy, 0) / Math.max(1, l.length)).toFixed(1); });
  protected readonly rows = computed(() => this.s.devices().map((d) => ({ ...d, icon: TYPE_ICON[d.type], color: STATUS_COLOR[d.status], accText: d.accuracy ? `${d.accuracy.toFixed(1)}%` : '—' })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Device', kind: 'icon' },
    { key: 'id', label: 'ID' },
    { key: 'zone', label: 'Zone' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'accText', label: 'Accuracy' },
    { key: 'lastSeen', label: 'Last Seen' },
  ];
  protected readonly filters = [
    { key: 'type', label: 'Type', options: DEV_TYPES },
    { key: 'status', label: 'Status', options: ['Online', 'Warning', 'Offline', 'Disabled'] },
    { key: 'zone', label: 'Zone', options: ['Main Entrance', 'Food Court', 'Retail Zone', 'Parking Entry', 'Parking Exit', 'Event Area', 'Cinema', 'Kids Zone'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'eye' },
    { id: 'restart', label: 'Restart', icon: 'refresh' },
    { id: 'calibrate', label: 'Calibrate', icon: 'a-target' },
    { id: 'disable', label: 'Disable', icon: 'a-power', danger: true, when: (r) => r.status !== 'Disabled' },
    { id: 'enable', label: 'Enable', icon: 'a-power', when: (r) => r.status === 'Disabled' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'restart', label: 'Restart selected' }, { id: 'update', label: 'Update firmware' }];
  protected readonly mapZones = computed(() => this.s.zones().map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: 'var(--ka-94a3b8)' })));
  protected readonly markers = computed<MapMarker[]>(() => {
    const zones = this.s.zones();
    const per = new Map<string, number>();
    return this.s.devices().map((d) => {
      const z = zones.find((x) => x.name === d.zone) ?? zones[0];
      const k = per.get(z.id) ?? 0;
      per.set(z.id, k + 1);
      const cols = Math.max(1, Math.floor((z.w - 10) / 62));
      return { id: d.id, x: z.x + 34 + (k % cols) * 62, y: z.y + 30 + Math.floor(k / cols) * 50, color: STATUS_COLOR[d.status], label: d.id, title: `${d.name} · ${d.status}` };
    });
  });
  protected tagCls(s: string) {
    return s === 'Online' ? 'tag green' : s === 'Warning' ? 'tag amber' : s === 'Offline' ? 'tag red' : 'tag grey';
  }
  protected latest(d: ADevice) {
    return d.type === 'AI Camera' ? '4.2.1' : d.type === '3D People Counter' ? '2.8.3' : d.type === 'Thermal Sensor' ? '1.5.0' : d.type === 'Wi-Fi Probe' ? '3.0.4' : '1.9.2';
  }
  protected accSeries(d: ADevice): Series[] {
    const a = d.accuracy || 96;
    return [{ name: 'Accuracy %', color: STATUS_COLOR[d.status], values: [0, 1, 2, 3, 4, 5, 6].map((i) => +(Math.min(99.8, a + (6 - i) * (d.status === 'Warning' ? 1.1 : 0.05) + ((i * 7) % 3) * 0.1)).toFixed(1)), area: true }];
  }
  protected filterZone(id: string) {
    const z = this.s.zones().find((x) => x.id === id);
    const first = this.s.devices().find((d) => d.zone === z?.name);
    if (first) this.selId.set(first.id);
  }
  protected act(a: string, d: ADevice) {
    if (a === 'view') return this.selId.set(d.id);
    if (a === 'restart') {
      this.busyId.set(d.id);
      this.s.patchDevice(d.id, { status: 'Warning' });
      this.t.show(`Restarting ${d.id}…`);
      setTimeout(() => {
        this.busyId.set(null);
        this.s.patchDevice(d.id, { status: 'Online', lastSeen: '10:25 AM', accuracy: Math.max(d.accuracy, 97.4), uptime: Math.max(d.uptime, 98.6), counted: d.counted || 42 });
        this.t.show(`${d.id} back online · counting resumed`);
      }, 1600);
      return;
    }
    if (a === 'calibrate') {
      this.s.patchDevice(d.id, { accuracy: Math.max(98.2, d.accuracy), status: d.status === 'Warning' ? 'Online' : d.status });
      return this.t.show(`${d.id} calibrated · accuracy ${Math.max(98.2, d.accuracy).toFixed(1)}%`);
    }
    if (a === 'update') {
      this.s.patchDevice(d.id, { firmware: this.latest(d) });
      return this.t.show(`${d.id} updated to firmware ${this.latest(d)}`);
    }
    this.s.patchDevice(d.id, { status: a === 'disable' ? 'Disabled' : 'Online' });
    this.t.show(`${d.id} ${a === 'disable' ? 'disabled · excluded from counts' : 'enabled'}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    ids.forEach((id) => {
      const d = this.s.devices().find((x) => x.id === id)!;
      if (a === 'update') this.s.patchDevice(id, { firmware: this.latest(d) });
      else this.s.patchDevice(id, { status: d.status === 'Disabled' ? 'Disabled' : 'Online', lastSeen: '10:25 AM' });
    });
    this.t.show(`${ids.length} devices ${a === 'update' ? 'updated' : 'restarted'}`);
  }
  protected readonly form = signal<ADevice | null>(null);
  protected readonly err = signal('');
  protected openForm() {
    this.err.set('');
    this.form.set({ id: '', name: '', type: 'AI Camera', zone: 'Retail Zone', status: 'Online', accuracy: 97.5, firmware: '4.2.1', ip: '', uptime: 100, lastSeen: 'just now', counted: 0 });
  }
  protected setF<K extends keyof ADevice>(k: K, v: ADevice[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.name.trim()) return this.err.set('Device name is required.');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(f.ip)) return this.err.set('Enter a valid IPv4 address.');
    const prefix = f.type === 'AI Camera' ? 'CAM' : f.type === '3D People Counter' ? 'PC' : f.type === 'Thermal Sensor' ? 'TS' : f.type === 'Wi-Fi Probe' ? 'WF' : 'QS';
    const id = `${prefix}-${String(this.s.devices().filter((d) => d.id.startsWith(prefix)).length + (prefix === 'CAM' ? 1 : 101)).padStart(2, '0')}`;
    this.s.devices.update((l) => [...l, { ...f, id }]);
    this.form.set(null);
    this.selId.set(id);
    this.t.show(`${id} registered and provisioning`);
  }
  protected exportCsv() {
    downloadCsv('analytics-devices.csv', [['ID', 'Name', 'Type', 'Zone', 'Status', 'Accuracy %', 'Firmware', 'IP', 'Uptime %', 'Last seen'], ...this.s.devices().map((d) => [d.id, d.name, d.type, d.zone, d.status, d.accuracy, d.firmware, d.ip, d.uptime.toFixed(1), d.lastSeen])]);
    this.s.logRun('Device Health', 'CSV');
  }
}
