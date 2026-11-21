import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { Icon } from '@p360/shared/icon';
import { SelectValue } from '@p360/shared/select-value';
import {
  CAMERAS,
  DISTRIBUTION,
  EVENTS,
  EventItem,
  FLOORS,
  KPI_BASE,
  KpiKey,
  KPIS,
  LIVE_EVENT_POOL,
  OCCUPANCY,
  PERSON_COLORS,
  PersonType,
  rng,
  sitePeople,
  SYSTEM_HEALTH,
  TREND_RANGES,
  trendSeries,
  WIDGETS,
  WidgetId,
} from './command-center.data';

const DONUT_R = 62;
const DONUT_C = 2 * Math.PI * DONUT_R;
/** Trend chart plot area in SVG units. */
const T = { l: 36, r: 352, t: 12, b: 158 };
const STORAGE_KEY = 'p360.eod.hiddenWidgets';

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

@Component({
  selector: 'app-command-center',
  imports: [Icon, DatePipe, DecimalPipe, RouterLink, SelectValue],
  templateUrl: './command-center.html',
  styleUrl: './command-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandCenter {
  protected readonly state = inject(AppState);
  protected readonly now = signal(new Date());
  /** Increments while live; drives simulated movement and counters. */
  private readonly tick = signal(0);

  // ---------- Scale by site + selected day ----------
  private readonly factor = computed(() => {
    const d = this.state.date();
    const day = this.state.isToday() ? 1 : 0.82 + rng(d.getDate() * 31 + d.getMonth() * 12)() * 0.2;
    return this.state.site().factor * day;
  });

  // ---------- KPIs ----------
  protected readonly kpis = computed(() => {
    const f = this.factor();
    const t = this.tick();
    const wobble = (k: string, amp: number) => (t ? Math.round(Math.sin(t / 2 + hash(k)) * amp) : 0);
    const values: Record<KpiKey, string> = {
      people: Math.round(KPI_BASE.people * f + wobble('p', 40 * f)).toLocaleString('en-US'),
      attendance: (KPI_BASE.attendance - (1 - Math.min(f * 3, 1)) * 1.4).toFixed(1) + '%',
      visitors: Math.round(KPI_BASE.visitors * f + wobble('v', 4)).toLocaleString('en-US'),
      contractors: Math.round(KPI_BASE.contractors * f + wobble('c', 6)).toLocaleString('en-US'),
      alerts: String(Math.max(1, Math.round(KPI_BASE.alerts * Math.sqrt(f)))),
      access: Math.round(KPI_BASE.access * f + t * 17 * f).toLocaleString('en-US'),
    };
    return KPIS.map((k) => ({ ...k, value: values[k.key] }));
  });

  // ---------- People distribution ----------
  protected readonly distTabs = Object.keys(DISTRIBUTION);
  protected readonly distTab = signal('By Category');
  protected readonly donutR = DONUT_R;
  protected readonly distribution = computed(() => {
    const f = this.factor();
    const items = DISTRIBUTION[this.distTab()].map((s) => ({ ...s, value: Math.round(s.value * f) }));
    const total = items.reduce((s, i) => s + i.value, 0);
    let offset = 0;
    const segs = items.map((i) => {
      const len = (i.value / total) * DONUT_C;
      const out = { ...i, pct: Math.round((i.value / total) * 100), dash: `${Math.max(len - 2, 0)} ${DONUT_C}`, offset: -offset };
      offset += len;
      return out;
    });
    return { total, segs };
  });
  protected readonly hoverSeg = signal<string | null>(null);

  // ---------- Site occupancy ----------
  protected readonly occTabs = Object.keys(OCCUPANCY);
  protected readonly occTab = signal('Live');
  protected readonly occupancy = computed(() => {
    const t = this.tick();
    const live = this.occTab() === 'Live';
    return OCCUPANCY[this.occTab()].map((o) => ({
      ...o,
      pct: live && t ? Math.min(99, Math.max(5, o.pct + Math.round(Math.sin(t / 3 + hash(o.label)) * 2))) : o.pct,
    }));
  });

  // ---------- People trend ----------
  protected readonly ranges = TREND_RANGES;
  protected readonly range = signal(TREND_RANGES[0]);
  protected readonly t = T;
  protected readonly hoverPoint = signal<number | null>(null);
  protected readonly trend = computed(() => {
    const s = trendSeries(this.range().days, this.state.date(), this.factor());
    const peak = Math.max(...s.people, 1);
    const step = peak > 10000 ? 5000 : peak > 2000 ? 1000 : peak > 500 ? 250 : 50;
    const max = Math.ceil((peak * 1.1) / (step * 3)) * step * 3;
    const n = s.people.length;
    const x = (i: number) => T.l + (i * (T.r - T.l)) / (n - 1);
    const y = (v: number) => T.b - (v / max) * (T.b - T.t);
    const pts = (arr: number[]) => arr.map((v, i) => ({ x: x(i), y: y(v), v }));
    const line = (p: { x: number; y: number }[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    const people = pts(s.people);
    const visitors = pts(s.visitors);
    const every = n > 14 ? 5 : n > 7 ? 2 : 1;
    return {
      people,
      visitors,
      peopleLine: line(people),
      visitorLine: line(visitors),
      area: `${line(people)} L${T.r},${T.b} L${T.l},${T.b} Z`,
      labels: s.labels.map((l, i) => ({ l, x: x(i), show: i % every === 0 || i === n - 1 })),
      ticks: [0, 1, 2, 3].map((k) => {
        const v = (max / 3) * k;
        return { y: y(v), label: v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(Math.round(v)) };
      }),
      dots: n <= 14,
      raw: s,
      step: (T.r - T.l) / (n - 1),
    };
  });

  // ---------- Live location ----------
  protected readonly floors = FLOORS;
  protected readonly deskTop = [20, 90, 155, 215, 285, 345, 415, 485, 555];
  protected readonly deskBottom = [22, 95, 165, 245, 315, 395, 465, 540];
  protected readonly floor = signal('F2');
  protected readonly personTypes: PersonType[] = ['Employee', 'Contractor', 'Visitor', 'VIP', 'Alert'];
  protected readonly typeFilter = signal<'All' | PersonType>('All');
  protected readonly colors = PERSON_COLORS;
  protected readonly zoom = signal(1);
  protected readonly view3d = signal(false);
  protected readonly selectedId = signal<string | null>('jm');
  private readonly people = computed(() => sitePeople(this.state.site().name, this.state.site().factor));
  protected readonly dots = computed(() => {
    const t = this.tick();
    const fl = this.floor();
    const type = this.typeFilter();
    return this.people()
      .filter((p) => (fl === 'All' || p.floor === fl) && (type === 'All' || p.type === type))
      .map((p) => {
        if (!t || p.id === 'jm') return p;
        const h = hash(p.id);
        return { ...p, x: p.x + Math.sin(t / 3 + h) * 6, y: p.y + Math.cos(t / 4 + h) * 5 };
      });
  });
  protected readonly selected = computed(() => this.dots().find((d) => d.id === this.selectedId()) ?? null);
  protected readonly mapStats = computed(() => {
    const list = this.dots();
    return { total: list.length, alerts: list.filter((d) => d.type === 'Alert').length };
  });

  // ---------- Events ----------
  protected readonly eventTabs = ['All', 'Access', 'Attendance', 'Visitor', 'Safety'];
  protected readonly eventTab = signal('All');
  protected readonly allEvents = signal<EventItem[]>(EVENTS);
  protected readonly events = computed(() => {
    const tab = this.eventTab();
    return this.allEvents().filter((e) => tab === 'All' || e.category === tab);
  });
  protected readonly eventsModal = signal(false);
  protected readonly eventQuery = signal('');
  protected readonly modalEvents = computed(() => {
    const q = this.eventQuery().trim().toLowerCase();
    return this.events().filter((e) => !q || `${e.title} ${e.person} ${e.location}`.toLowerCase().includes(q));
  });
  private nextEventId = 100;

  // ---------- Camera ----------
  protected readonly cameras = CAMERAS;
  protected readonly camIndex = signal(0);
  protected readonly camera = computed(() => CAMERAS[this.camIndex()]);

  // ---------- Bottom row ----------
  protected readonly health = SYSTEM_HEALTH;
  protected readonly healthModal = signal(false);
  protected readonly openTasks = computed(() => Math.max(3, Math.round(28 * Math.sqrt(this.state.site().factor))));

  // ---------- Page chrome ----------
  protected readonly widgets = WIDGETS;
  protected readonly hidden = signal<Set<WidgetId>>(this.loadHidden());
  protected readonly customizeOpen = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly expanded = signal<WidgetId | null>(null);
  protected readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const clock = setInterval(() => this.now.set(new Date()), 1000);
    const live = setInterval(() => {
      if (!this.state.live()) return;
      this.tick.update((v) => v + 1);
      if (this.tick() % 4 === 0) this.pushLiveEvent();
    }, 2500);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      clearInterval(live);
      clearTimeout(this.toastTimer);
    });
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.hidden()]));
      } catch {
        /* storage unavailable: keep in memory only */
      }
    });
  }

  protected show(id: WidgetId) {
    return !this.hidden().has(id);
  }

  protected toggleWidget(id: WidgetId) {
    this.hidden.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  protected resetWidgets() {
    this.hidden.set(new Set());
    this.notify('Dashboard layout reset');
  }

  protected toggleExpand(id: WidgetId) {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  protected selectFloor(f: string) {
    this.floor.set(f);
    this.selectedId.set(null);
  }

  protected setZoom(step: number) {
    this.zoom.update((z) => Math.min(2.5, Math.max(1, +(z + step).toFixed(2))));
  }

  protected fitMap() {
    this.zoom.set(1);
    this.view3d.set(false);
  }

  protected selectPerson(id: string, e: Event) {
    e.stopPropagation();
    this.selectedId.update((cur) => (cur === id ? null : id));
  }

  protected nextCam(step: number) {
    this.camIndex.update((i) => (i + step + CAMERAS.length) % CAMERAS.length);
  }

  protected refresh() {
    this.moreOpen.set(false);
    this.tick.update((v) => v + 3);
    this.pushLiveEvent();
    this.notify('Dashboard data refreshed');
  }

  protected exportCsv() {
    this.moreOpen.set(false);
    const rows = [
      ['Section', 'Metric', 'Value'],
      ...this.kpis().map((k) => ['KPI', k.label, k.value]),
      ...this.distribution().segs.map((s) => [`Distribution (${this.distTab()})`, s.label, String(s.value)]),
      ...this.occupancy().map((o) => [`Occupancy (${this.occTab()})`, o.label, `${o.pct}%`]),
      ...this.allEvents().map((e) => ['Event', `${e.time} ${e.title}`, `${e.person} @ ${e.location}`]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `enterprise-overview-${this.state.site().name.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.notify('CSV exported');
  }

  protected print() {
    this.moreOpen.set(false);
    setTimeout(() => window.print());
  }

  protected fullscreen() {
    this.moreOpen.set(false);
    const el = document.documentElement;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.();
  }

  @HostListener('document:keydown.escape')
  protected closeOverlays() {
    this.expanded.set(null);
    this.eventsModal.set(false);
    this.healthModal.set(false);
    this.customizeOpen.set(false);
    this.moreOpen.set(false);
  }

  @HostListener('document:click')
  protected closeMenus() {
    this.moreOpen.set(false);
  }

  private pushLiveEvent() {
    const base = LIVE_EVENT_POOL[this.nextEventId % LIVE_EVENT_POOL.length];
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    this.allEvents.update((list) => [{ ...base, id: this.nextEventId++, time }, ...list].slice(0, 40));
  }

  private notify(msg: string) {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2200);
  }

  private loadHidden(): Set<WidgetId> {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
}
