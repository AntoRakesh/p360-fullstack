import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { fmt, HOURS, SITE_NAMES } from './demo-data';

type WType = 'kpi-people' | 'kpi-alerts' | 'trend' | 'hourly' | 'distribution' | 'sites' | 'heatmap';
interface Widget {
  id: number;
  type: WType;
  title: string;
  span: number;
}

const LIBRARY: { type: WType; title: string; icon: string; desc: string; span: number }[] = [
  { type: 'kpi-people', title: 'People on Site', icon: 'users', desc: 'Single KPI value', span: 3 },
  { type: 'kpi-alerts', title: 'Open Alerts', icon: 'bell', desc: 'Single KPI value', span: 3 },
  { type: 'trend', title: 'People Trend', icon: 'chart-line', desc: 'Line chart, 7 days', span: 6 },
  { type: 'hourly', title: 'Hourly Access Events', icon: 'file-chart', desc: 'Column chart by hour', span: 6 },
  { type: 'distribution', title: 'People Distribution', icon: 'users', desc: 'Donut by category', span: 4 },
  { type: 'sites', title: 'Site Occupancy', icon: 'building', desc: 'Bar list by site', span: 4 },
  { type: 'heatmap', title: 'Floor Heatmap', icon: 'grid', desc: 'Floor × hour heatmap', span: 8 },
];
const STORE = 'p360.builder.layouts';
const DEFAULT: Widget[] = [
  { id: 1, type: 'kpi-people', title: 'People on Site', span: 3 },
  { id: 2, type: 'kpi-alerts', title: 'Open Alerts', span: 3 },
  { id: 3, type: 'trend', title: 'People Trend', span: 6 },
  { id: 4, type: 'distribution', title: 'People Distribution', span: 4 },
  { id: 5, type: 'sites', title: 'Site Occupancy', span: 8 },
];
const SPANS = [3, 4, 6, 8, 12];

@Component({
  selector: 'app-dashboard-builder',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Custom Dashboard Builder">
      <input class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="Layout name" />
      <select class="select" (change)="load($any($event.target).value); $any($event.target).value = ''">
        <option value="">Load layout…</option>
        @for (n of savedNames(); track n) {
          <option [value]="n">{{ n }}</option>
        }
      </select>
      <button class="btn-outline" (click)="preview.set(!preview())" [class.on]="preview()">
        <app-icon [name]="preview() ? 'sliders' : 'maximize'" [size]="16" />{{ preview() ? 'Edit' : 'Preview' }}
      </button>
      <button class="btn-primary" (click)="save()"><app-icon name="download" [size]="16" />Save layout</button>
    </app-page-head>

    <div class="builder" [class.preview]="preview()">
      @if (!preview()) {
        <aside class="card library">
          <h3>Widget Library</h3>
          <p class="muted">Click or drag a widget onto the canvas.</p>
          @for (w of library; track w.type) {
            <button class="lib-item" draggable="true" (dragstart)="dragNew = w.type" (dragend)="dragNew = null" (click)="add(w.type)">
              <span class="lib-icon"><app-icon [name]="w.icon" [size]="17" /></span>
              <span><b>{{ w.title }}</b><small>{{ w.desc }}</small></span>
              <app-icon name="plus" [size]="15" />
            </button>
          }
          <hr />
          <button class="btn-ghost" (click)="reset()">Reset to default</button>
          @if (savedNames().includes(name())) {
            <button class="btn-ghost danger" (click)="remove(name())">Delete “{{ name() }}”</button>
          }
        </aside>
      }

      <section class="canvas" (dragover)="$event.preventDefault()" (drop)="dropEnd()">
        @for (w of widgets(); track w.id; let i = $index) {
          <div
            class="card widget"
            [style.grid-column]="'span ' + w.span"
            [class.dragging]="dragIdx === i"
            [attr.draggable]="!preview()"
            (dragstart)="dragIdx = i"
            (dragend)="dragIdx = null"
            (dragover)="$event.preventDefault()"
            (drop)="$event.stopPropagation(); dropOn(i)"
          >
            <div class="card-head">
              @if (preview()) {
                <h3>{{ w.title }}</h3>
              } @else {
                <input class="title-input" [value]="w.title" (change)="rename(w, $any($event.target).value)" />
                <div class="w-tools">
                  <button title="Move left" (click)="move(i, -1)" [disabled]="i === 0"><app-icon name="chevron-left" [size]="14" /></button>
                  <button title="Move right" (click)="move(i, 1)" [disabled]="i === widgets().length - 1"><app-icon name="chevron-right" [size]="14" /></button>
                  <button title="Change width" (click)="resize(w)">{{ w.span }}/12</button>
                  <button title="Remove" class="del" (click)="del(w)">×</button>
                </div>
              }
            </div>
            @switch (w.type) {
              @case ('kpi-people') { <div class="big">{{ data().people }}</div><div class="muted">people on site · <span class="good">▲ 6%</span></div> }
              @case ('kpi-alerts') { <div class="big bad">{{ data().alerts }}</div><div class="muted">open alerts · 3 critical</div> }
              @case ('trend') { <app-line-chart [labels]="data().days" [series]="data().trend" [height]="190" /> }
              @case ('hourly') { <app-column-chart [labels]="hours" [series]="data().hourly" [height]="190" [legend]="false" /> }
              @case ('distribution') { <app-donut [segments]="data().dist" center="On Site" [size]="130" /> }
              @case ('sites') { <app-bar-list [rows]="data().sites" /> }
              @case ('heatmap') { <app-heatmap [rows]="floors" [cols]="heatCols" [data]="data().heat" /> }
            }
          </div>
        } @empty {
          <div class="card empty-canvas">Drag widgets here to start building your dashboard.</div>
        }
      </section>
    </div>

    @if (toast()) {
      <div class="g-toast">{{ toast() }}</div>
    }
  `,
  styles: `
    .builder { display: grid; grid-template-columns: 260px 1fr; gap: 12px; align-items: start; }
    .builder.preview { grid-template-columns: 1fr; }
    .library { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 6px; }
    .library p { margin: 0 0 6px; } .library hr { width: 100%; border: 0; border-top: 1px solid var(--border); margin: 6px 0; }
    .lib-item { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px dashed #c4b5fd; border-radius: 8px; background: #fff; cursor: grab; text-align: left; }
    .lib-item:hover { background: #faf8ff; }
    .lib-item > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; font-size: 12.5px; }
    .lib-item small { color: var(--muted); font-size: 11px; }
    .lib-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--primary-soft); color: var(--primary); }
    .canvas { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; min-height: 400px; align-content: start; }
    .widget { position: relative; min-width: 0; transition: opacity 0.15s, box-shadow 0.15s; }
    .widget[draggable='true'] { cursor: move; }
    .widget.dragging { opacity: 0.4; }
    .widget:hover { box-shadow: 0 4px 14px rgba(20, 20, 60, 0.07); }
    .title-input { border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; font: inherit; font-size: 15px; font-weight: 600; min-width: 0; flex: 1; }
    .title-input:hover, .title-input:focus { border-color: var(--border); outline: 0; }
    .w-tools { position: absolute; top: 10px; right: 10px; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px rgba(20,20,60,.12); opacity: 0; transition: opacity .15s; }
    .widget:hover .w-tools, .widget:focus-within .w-tools { opacity: 1; }
    .w-tools button { height: 26px; min-width: 26px; padding: 0 6px; border: 1px solid var(--border); border-radius: 6px; background: #fff; font-size: 11px; cursor: pointer; display: grid; place-items: center; }
    .w-tools button:disabled { opacity: 0.35; }
    .w-tools .del { color: var(--red); font-size: 16px; }
    .big { font-size: 34px; font-weight: 700; }
    .empty-canvas { grid-column: span 12; display: grid; place-items: center; min-height: 300px; border: 2px dashed #c4b5fd; color: var(--muted); }
    @media (max-width: 1000px) { .builder { grid-template-columns: 1fr; } .library { position: static; } .widget { grid-column: span 12 !important; } }
  `,
})
export class DashboardBuilder {
  private readonly state = inject(AppState);
  protected readonly library = LIBRARY;
  protected readonly hours = HOURS;
  protected readonly floors = ['F4', 'F3', 'F2', 'F1', 'G'];
  protected readonly heatCols = ['08', '10', '12', '14', '16', '18'];
  protected readonly name = signal('My Operations View');
  protected readonly preview = signal(false);
  protected readonly widgets = signal<Widget[]>(DEFAULT);
  protected readonly saved = signal<Record<string, Widget[]>>(this.read());
  protected readonly savedNames = computed(() => Object.keys(this.saved()));
  protected readonly toast = signal<string | null>(null);
  protected dragIdx: number | null = null;
  protected dragNew: WType | null = null;
  private nextId = 100;

  protected readonly data = computed(() => {
    const f = this.state.factor();
    const t = this.state.tick();
    return {
      people: fmt(12480 * f + this.state.wobble('b', 40 * f)),
      alerts: Math.max(1, Math.round(14 * Math.sqrt(f))),
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      trend: [{ name: 'People', color: '#7c3aed', values: [10200, 11900, 12480, 12100, 11600, 4200, 3100].map((v) => Math.round(v * f)), area: true }],
      hourly: [{ name: 'Events', color: '#8b5cf6', values: [900, 3200, 7400, 6100, 4300, 3600, 5200, 4100, 3500, 3000, 3900, 4600, 2600, 1200, 600].map((v) => Math.round(v * f)) }],
      dist: [
        { label: 'Employees', value: Math.round(8920 * f), color: '#7c3aed' },
        { label: 'Contractors', value: Math.round(1326 * f), color: '#3b82f6' },
        { label: 'Visitors', value: Math.round(284 * f), color: '#22c1a0' },
        { label: 'Others', value: Math.round(1950 * f), color: '#c4c9d6' },
      ],
      sites: SITE_NAMES.map((label, i) => {
        const v = [78, 62, 86, 54, 71, 48][i];
        return { label, value: v, display: `${v}%` };
      }),
      heat: this.floors.map((_, fi) => [40, 85, 70, 88, 76, 30].map((c, ci) => Math.max(5, Math.round(c * (1 - fi * 0.07) + Math.sin(fi + ci + t / 3) * 5)))),
    };
  });

  protected add(type: WType, at?: number) {
    const lib = LIBRARY.find((l) => l.type === type)!;
    const w: Widget = { id: this.nextId++, type, title: lib.title, span: lib.span };
    this.widgets.update((list) => {
      const next = [...list];
      next.splice(at ?? next.length, 0, w);
      return next;
    });
  }
  protected del(w: Widget) {
    this.widgets.update((list) => list.filter((x) => x.id !== w.id));
  }
  protected resize(w: Widget) {
    const span = SPANS[(SPANS.indexOf(w.span) + 1) % SPANS.length];
    this.widgets.update((list) => list.map((x) => (x.id === w.id ? { ...x, span } : x)));
  }
  protected rename(w: Widget, title: string) {
    this.widgets.update((list) => list.map((x) => (x.id === w.id ? { ...x, title: title || x.title } : x)));
  }
  protected move(i: number, dir: number) {
    this.widgets.update((list) => {
      const next = [...list];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  }
  protected dropOn(i: number) {
    if (this.dragNew) {
      this.add(this.dragNew, i);
      this.dragNew = null;
    } else if (this.dragIdx !== null && this.dragIdx !== i) {
      const from = this.dragIdx;
      this.widgets.update((list) => {
        const next = [...list];
        const [w] = next.splice(from, 1);
        next.splice(i, 0, w);
        return next;
      });
    }
    this.dragIdx = null;
  }
  protected dropEnd() {
    if (this.dragNew) this.add(this.dragNew);
    this.dragNew = null;
  }
  protected save() {
    const n = this.name().trim() || 'Untitled layout';
    this.saved.update((s) => ({ ...s, [n]: this.widgets() }));
    this.write();
    this.notify(`Layout “${n}” saved`);
  }
  protected load(n: string) {
    if (!n) return;
    this.widgets.set(this.saved()[n] ?? DEFAULT);
    this.name.set(n);
    this.notify(`Layout “${n}” loaded`);
  }
  protected remove(n: string) {
    this.saved.update((s) => {
      const { [n]: _, ...rest } = s;
      return rest;
    });
    this.write();
    this.notify(`Layout “${n}” deleted`);
  }
  protected reset() {
    this.widgets.set(DEFAULT);
  }
  private notify(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2000);
  }
  private read(): Record<string, Widget[]> {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '{}');
    } catch {
      return {};
    }
  }
  private write() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.saved()));
    } catch {
      this.notify('Could not save: browser storage unavailable');
    }
  }
}
