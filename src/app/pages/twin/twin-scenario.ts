// Scenario Simulation — what-if runs on the digital twin (evacuation, layout change, occupancy growth, HVAC/energy).
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { IsoGlow, IsoHeat, IsoMarker, IsoPath, IsoView } from './iso-view';
import { center, FLOOR_TABS } from './twin-analytics';
import { heatColor } from './twin-widgets';
import { floorById, fmtN, rng, TScenario, TwinStore, TZone, ZoneType } from './twin.data';

type SType = 'Evacuation' | 'Layout Change' | 'Occupancy Increase' | 'HVAC & Energy';
interface Params {
  type: SType;
  occupancy: number;
  growth: number;
  blocked: string[];
  setpoint: number;
  outside: number;
  shift: string;
  zone: string;
  zoneType: ZoneType;
  zoneCap: number;
}
interface Result {
  headcount: number;
  evacMin: number;
  energyKwh: number;
  comfort: number;
  congestion: number;
  util: number;
  seatGap: number;
  density: number;
}
type SavedScenario = TScenario & { type?: SType; growth?: number; util?: number; seatGap?: number };

const EXITS = [
  { id: 'EX-A', name: 'Stair A (West)', x: 34, y: 318 },
  { id: 'EX-B', name: 'Stair B (East)', x: 966, y: 300 },
  { id: 'EX-M', name: 'Main Exit (Reception)', x: 165, y: 532 },
  { id: 'EX-N', name: 'Fire Exit North', x: 480, y: 28 },
  { id: 'EX-S', name: 'Service Exit', x: 810, y: 532 },
];
const TYPES: { id: SType; icon: string; desc: string }[] = [
  { id: 'Evacuation', icon: 'twin-exit', desc: 'Egress time, bottlenecks and blocked exits' },
  { id: 'Layout Change', icon: 'twin-desk', desc: 'Re-purpose a zone and see capacity impact' },
  { id: 'Occupancy Increase', icon: 'users', desc: 'Headcount growth vs. seats and comfort' },
  { id: 'HVAC & Energy', icon: 'twin-snow', desc: 'Setpoint & weather vs. energy and comfort' },
];
const SHIFTS = ['Standard', 'Staggered', 'Hybrid 3-2'];
const SHIFT_F: Record<string, { head: number; energy: number }> = { Standard: { head: 1, energy: 1 }, Staggered: { head: 0.82, energy: 1.05 }, 'Hybrid 3-2': { head: 0.7, energy: 0.86 } };
const LAYOUT_TYPES: ZoneType[] = ['workstations', 'meeting', 'collab', 'pods', 'cafeteria', 'wellness', 'storage'];
const STAGES = ['Loading digital twin model', 'Spawning occupant agents', 'Simulating movement & egress', 'Computing energy & comfort', 'Scoring KPIs'];
const BASE_HEAD = 428;
const tl = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

@Component({
  selector: 'app-twin-scenario-simulation',
  imports: [...UI, IsoView, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Scenario Simulation" parent="Digital Twin &amp; Spatial Intelligence" parentLink="/digital-twin" subtitle="Run what-if simulations on the digital twin — evacuations, layout changes, headcount growth and HVAC settings — before changing the real building.">
      <select class="select" [value]="baseId()" (change)="baseId.set($any($event.target).value)" title="Compare against">@for (s of store.scenarios(); track s.id) {<option [value]="s.id">Compare vs: {{ s.name }}</option>}</select>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
      <button class="btn-primary" [disabled]="running()" (click)="run()"><app-icon name="play" [size]="16" />{{ running() ? 'Running…' : 'Run Simulation' }}</button>
    </app-page-head>

    <section class="types">
      @for (t of types; track t.id) {
        <button class="card ty" [class.on]="p().type === t.id" (click)="setType(t.id)">
          <span class="ic"><app-icon [name]="t.icon" [size]="22" /></span><div><b>{{ t.id }}</b><small>{{ t.desc }}</small></div>
        </button>
      }
    </section>

    <section class="sim">
      <aside class="card params">
        <h3>Parameters</h3>
        <label class="rng"><span>Building occupancy <b>{{ p().occupancy }}%</b></span><input type="range" min="20" max="110" [value]="p().occupancy" (input)="set('occupancy', +$any($event.target).value)" /></label>
        @if (p().type === 'Occupancy Increase' || p().type === 'Layout Change') {
          <label class="rng"><span>Headcount growth <b>+{{ p().growth }}%</b></span><input type="range" min="0" max="60" [value]="p().growth" (input)="set('growth', +$any($event.target).value)" /></label>
        }
        <label class="fld">Work pattern<select class="select" [value]="p().shift" (change)="set('shift', $any($event.target).value)">@for (s of shifts; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        @if (p().type === 'Evacuation') {
          <div class="fld">Blocked exits <small class="muted">(click exits on the map too)</small>
            <div class="exits">@for (e of exits; track e.id) {<button [class.off]="p().blocked.includes(e.id)" (click)="toggleExit(e.id)"><app-icon [name]="p().blocked.includes(e.id) ? 'ban' : 'twin-exit'" [size]="13" />{{ e.name }}</button>}</div>
          </div>
        }
        @if (p().type === 'Layout Change') {
          <label class="fld">Zone to change<select class="select" [value]="p().zone" (change)="pickZone($any($event.target).value)">@for (z of editable(); track z.id) {<option [value]="z.id">{{ z.name }} ({{ tl(z.type) }}, {{ z.capacity }})</option>}</select></label>
          <div class="two">
            <label class="fld">Convert to<select class="select" [value]="p().zoneType" (change)="set('zoneType', $any($event.target).value)">@for (t of layoutTypes; track t) {<option [value]="t">{{ tl(t) }}</option>}</select></label>
            <label class="fld">New capacity<input class="input" type="number" min="0" [value]="p().zoneCap" (input)="set('zoneCap', +$any($event.target).value)" /></label>
          </div>
        }
        @if (p().type === 'HVAC & Energy' || p().type === 'Occupancy Increase') {
          <label class="rng"><span>HVAC setpoint <b>{{ p().setpoint }}°C</b></span><input type="range" min="19" max="27" step="0.5" [value]="p().setpoint" (input)="set('setpoint', +$any($event.target).value)" /></label>
          <label class="rng"><span>Outside temperature <b>{{ p().outside }}°C</b></span><input type="range" min="15" max="48" [value]="p().outside" (input)="set('outside', +$any($event.target).value)" /></label>
        }
        <div class="pc"><span>Simulated occupants</span><b>{{ fmt(live().headcount) }}</b></div>
        <div class="acts">
          <button class="btn-primary" [disabled]="running()" (click)="run()"><app-icon name="play" [size]="14" />Run</button>
          <button class="btn-ghost" (click)="reset()"><app-icon name="refresh" [size]="14" />Reset</button>
          <button class="btn-ghost" [disabled]="!res()" (click)="openSave()"><app-icon name="twin-save" [size]="14" />Save</button>
        </div>
      </aside>

      <div class="card">
        <div class="card-head">
          <div class="ftabs">@for (f of floorTabs; track f.id) {<button [class.on]="floor() === f.id" (click)="floor.set(f.id)">{{ f.name }}</button>}</div>
          @if (running()) {
            <div class="prog"><span>{{ stage() }}</span><i class="bar"><i [style.width.%]="progress()"></i></i><b>{{ progress() }}%</b></div>
          } @else if (res()) {
            <span class="tag green">Simulation complete · {{ ranAt() }}</span>
          } @else {
            <span class="tag grey">Not run yet · press Run</span>
          }
        </div>
        <app-iso-view [zones]="zones()" [floor]="floor()" [markers]="markers()" [paths]="paths()" [glows]="glows()" [heat]="heat()" [tint]="tint()" [selectedZone]="p().type === 'Layout Change' ? p().zone : null" [shirts]="p().type === 'Evacuation' ? [] : ['#2563eb', '#16a34a', '#f59e0b']" [zoneLabels]="true" aspect="1000 / 540" (markerClick)="markerPick($event)" (zoneClick)="zonePick($event)" />
      </div>
    </section>

    <section class="cmp">
      @for (k of kpis(); track k.label) {
        <div class="card kc">
          <span class="kl"><app-icon [name]="k.icon" [size]="15" />{{ k.label }}</span>
          <div class="kv"><b>{{ k.after }}</b><span [class]="k.cls">{{ k.delta }}</span></div>
          <small class="muted">Baseline {{ k.before }}</small>
        </div>
      }
    </section>

    <section class="row2">
      <div class="card">
        <div class="card-head"><h3>{{ p().type === 'Evacuation' ? 'Evacuation Curve' : 'Floor Utilization' }} <span class="card-sub">baseline vs. scenario</span></h3></div>
        @if (p().type === 'Evacuation') {
          <app-line-chart [labels]="curve().labels" [series]="curve().series" [height]="230" suffix="" />
        } @else {
          <app-column-chart [labels]="floorLabels" [series]="floorUtil()" [height]="230" suffix="%" />
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>Recommendations <span class="card-sub">{{ res() ? 'from last run' : 'run a simulation' }}</span></h3></div>
        <ul class="recs">
          @for (r of recs(); track r.title) {
            <li [class]="r.level">
              <span class="ri"><app-icon [name]="r.icon" [size]="16" /></span>
              <div><b>{{ r.title }}</b><small>{{ r.text }}</small></div>
              @if (r.action) {<button class="btn-ghost sm" (click)="doRec(r)">{{ r.action }}</button>}
            </li>
          } @empty {<li class="empty muted">Run the simulation to see bottlenecks, risks and recommended actions.</li>}
        </ul>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Saved Scenarios <span class="card-sub">{{ store.scenarios().length }} scenarios</span></h3></div>
      <app-data-table [rows]="rows()" [columns]="cols" [actions]="actions" [searchKeys]="['name', 'by', 'id']" searchPlaceholder="Search scenarios…" noun="scenarios" [activeId]="baseId()" (rowClick)="load($event)" (action)="act($event.action, $event.row)" />
    </section>

    @if (saving()) {
      <div class="g-overlay" (click)="saving.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>Save Scenario</h3><button type="button" class="close-btn" (click)="saving.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Scenario name *<input class="input" required [value]="name()" (input)="name.set($any($event.target).value)" /></label>
          <p class="full muted">{{ p().type }} · occupancy {{ p().occupancy }}% · {{ p().shift }} · evac {{ res()!.evacMin }} min · {{ fmt(res()!.energyKwh) }} kWh/day · comfort {{ res()!.comfort }}</p>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="saving.set(false)">Cancel</button><button class="btn-primary" type="submit">Save scenario</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .types { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .ty { display: flex; gap: 12px; align-items: center; text-align: left; cursor: pointer; border: 1px solid var(--border); font: inherit; }
    .ty .ic { width: 42px; height: 42px; border-radius: 10px; background: #f1edff; color: var(--primary); display: grid; place-items: center; flex-shrink: 0; }
    .ty b { display: block; font-size: 14px; } .ty small { color: var(--muted); font-size: 12px; } .ty.on { border-color: var(--primary); box-shadow: 0 0 0 3px #ede9fe; } .ty.on .ic { background: var(--primary); color: #fff; }
    .sim { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; margin-bottom: 12px; align-items: start; }
    .params { display: flex; flex-direction: column; gap: 14px; } .params h3 { margin: 0; }
    .rng { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; } .rng span { display: flex; justify-content: space-between; } .rng input { accent-color: #7c3aed; }
    .fld { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; } .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; } .two .input, .two .select { width: 100%; min-width: 0; box-sizing: border-box; }
    .exits { display: flex; flex-wrap: wrap; gap: 5px; } .exits button { display: inline-flex; gap: 5px; align-items: center; border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d; border-radius: 14px; padding: 4px 9px; font-size: 11.5px; cursor: pointer; }
    .exits button.off { border-color: #fecaca; background: #fef2f2; color: #dc2626; text-decoration: line-through; }
    .pc { display: flex; justify-content: space-between; align-items: center; background: #f5f3ff; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; } .pc b { font-size: 18px; color: var(--primary); }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftabs button { border: 1px solid var(--border); background: #fff; border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; } .ftabs button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .prog { display: grid; grid-template-columns: auto 220px auto; gap: 10px; align-items: center; font-size: 12px; } .prog b { color: var(--primary); }
    .bar { display: block; height: 8px; border-radius: 6px; background: #e8eaf2; overflow: hidden; } .bar > i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #7c3aed, #a78bfa); transition: width 0.1s; }
    .cmp { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .kc { display: flex; flex-direction: column; gap: 6px; } .kl { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #4b4f6b; }
    .kv { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; } .kv b { font-size: 22px; white-space: nowrap; } .kv span { font-size: 12px; font-weight: 600; } .kv .good { color: #16a34a; } .kv .bad { color: #dc2626; } .kv .flat { color: var(--muted); }
    .row2 { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-bottom: 12px; }
    .recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .recs li { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 10px; border-radius: 10px; background: #f8fafc; border-left: 3px solid #94a3b8; }
    .recs li.empty { display: block; background: none; border: none; padding: 20px 0; text-align: center; }
    .recs li.high { background: #fef2f2; border-color: #ef4444; } .recs li.med { background: #fffbeb; border-color: #f59e0b; } .recs li.ok { background: #f0fdf4; border-color: #22c55e; }
    .ri { width: 34px; height: 34px; border-radius: 8px; background: #fff; display: grid; place-items: center; } .recs b { display: block; font-size: 13px; font-weight: 600; } .recs small { color: #4b4f6b; font-size: 12px; }
    @media (max-width: 1280px) { .sim, .row2 { grid-template-columns: 1fr; } .cmp { grid-template-columns: repeat(3, 1fr); } .types { grid-template-columns: repeat(2, 1fr); } }
  `,
})
export class ScenarioSimulation {
  protected readonly store = inject(TwinStore);
  protected readonly fmt = fmtN;
  protected readonly tl = tl;
  protected readonly types = TYPES;
  protected readonly shifts = SHIFTS;
  protected readonly exits = EXITS;
  protected readonly layoutTypes = LAYOUT_TYPES;
  protected readonly floorTabs = FLOOR_TABS;
  protected readonly floorLabels = FLOOR_TABS.map((f) => f.name.replace('Floor ', 'F'));

  protected readonly floor = signal('4');
  private readonly defaults: Params = { type: 'Evacuation', occupancy: 68, growth: 0, blocked: [], setpoint: 23, outside: 38, shift: 'Standard', zone: 'Z4-6', zoneType: 'workstations', zoneCap: 40 };
  protected readonly p = signal<Params>({ ...this.defaults });
  protected readonly baseId = signal('SC-01');
  protected readonly running = signal(false);
  protected readonly progress = signal(0);
  protected readonly res = signal<Result | null>(null);
  private readonly ranP = signal<Params | null>(null);
  protected readonly ranAt = signal('');
  protected readonly saving = signal(false);
  protected readonly name = signal('');
  protected readonly toast = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearInterval(this.timer));
  }

  protected readonly zones = computed(() => {
    const zs = this.store.floorZones(this.floor());
    const p = this.ranP() ?? this.p();
    if (p.type !== 'Layout Change') return zs;
    return zs.map((z) => (z.id === p.zone ? { ...z, type: p.zoneType, capacity: p.zoneCap } : z));
  });
  protected readonly editable = computed(() => this.store.zones().filter((z) => z.floor === this.floor() && z.capacity > 0 && !z.restricted));
  protected readonly stage = computed(() => STAGES[Math.min(STAGES.length - 1, Math.floor(this.progress() / (100 / STAGES.length)))]);

  /* ---------- model ---------- */
  private readonly capacity = computed(() => this.store.zones().reduce((a, z) => a + z.capacity, 0));
  private readonly desks = computed(() => this.store.zones().filter((z) => z.type === 'workstations' || z.type === 'pods').reduce((a, z) => a + z.capacity, 0));
  private model(p: Params): Result {
    const zone = this.store.zones().find((z) => z.id === p.zone);
    const layout = p.type === 'Layout Change' && zone;
    const capDelta = layout ? p.zoneCap - zone.capacity : 0;
    const deskDelta = layout ? ((['workstations', 'pods'] as string[]).includes(p.zoneType) ? p.zoneCap : 0) - ((['workstations', 'pods'] as string[]).includes(zone.type) ? zone.capacity : 0) : 0;
    const growth = p.type === 'Occupancy Increase' || p.type === 'Layout Change' ? p.growth : 0;
    const headcount = Math.round(BASE_HEAD * (p.occupancy / 68) * (1 + growth / 100) * SHIFT_F[p.shift].head);
    const hf = headcount / BASE_HEAD;
    const blocked = p.type === 'Evacuation' ? p.blocked.length : 0;
    const mainBlocked = p.type === 'Evacuation' && p.blocked.includes('EX-M') ? 0.6 : 0;
    const evacMin = +(6.2 * (0.55 + 0.45 * hf) * (1 + 0.3 * blocked + mainBlocked * 0.3) + (layout && p.zoneCap > zone.capacity * 1.3 ? 0.4 : 0)).toFixed(1);
    const hvac = p.type === 'HVAC & Energy' || p.type === 'Occupancy Increase';
    const sp = hvac ? p.setpoint : 23;
    const out = hvac ? p.outside : 38;
    const energyKwh = Math.round(4820 * (0.7 + 0.3 * hf) * (1 + (out - 38) * 0.018) * (1 - (sp - 23) * 0.055) * SHIFT_F[p.shift].energy);
    const util = Math.round(68 * hf * (this.capacity() / Math.max(1, this.capacity() + capDelta)));
    const comfort = Math.round(clamp(86 - Math.max(0, util - 78) * 0.9 - Math.abs(sp - 22.8) * 3.2 - Math.max(0, out - 42) * 0.8 + (sp < 22 && out > 40 ? -2 : 0), 30, 98));
    const congestion = Math.round(clamp(2 + Math.max(0, hf - 1) * 9 + blocked * 2.4 + mainBlocked * 3 + Math.max(0, util - 90) / 6, 0, 20));
    const seatGap = Math.round(this.desks() + deskDelta - headcount * 0.72 * (this.capacity() / 1100));
    const density = +(0.55 + hf * 0.5 + blocked * 0.25).toFixed(2);
    return { headcount, evacMin, energyKwh, comfort, congestion, util, seatGap, density };
  }
  protected readonly live = computed(() => this.model(this.p()));
  protected readonly base = computed<Result>(() => {
    const s = this.store.scenarios().find((x) => x.id === this.baseId()) as SavedScenario | undefined;
    const m = this.model({ ...this.defaults, occupancy: s?.occupancy ?? 68, setpoint: s?.hvacSetpoint ?? 23, outside: s?.outsideTemp ?? 38, shift: s?.shift ?? 'Standard', growth: s?.growth ?? 0, type: 'HVAC & Energy' });
    return s ? { ...m, evacMin: s.evacMin, energyKwh: s.energyKwh, comfort: s.comfort, congestion: s.congestion, util: s.util ?? m.util, seatGap: s.seatGap ?? m.seatGap } : m;
  });
  protected readonly kpis = computed(() => {
    const b = this.base();
    const a = this.res() ?? this.base();
    const row = (label: string, icon: string, before: number, after: number, unit: string, lowerBetter: boolean, dp = 0) => {
      const d = +(after - before).toFixed(dp);
      const pct = before ? Math.round((d / Math.abs(before)) * 100) : 0;
      const good = lowerBetter ? d < 0 : d > 0;
      return { label, icon, before: `${fmtN(+before.toFixed(dp))}${unit}`, after: `${fmtN(+after.toFixed(dp))}${unit}`, delta: d === 0 ? '±0' : `${d > 0 ? '+' : ''}${fmtN(d)}${unit}${unit === ' kWh' && pct ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`, cls: d === 0 ? 'flat' : good ? 'good' : 'bad' };
    };
    return [
      row('Evacuation Time', 'twin-exit', b.evacMin, a.evacMin, ' min', true, 1),
      row('Congestion Points', 'triangle-alert', b.congestion, a.congestion, '', true),
      row('Utilization', 'map-floor', b.util, a.util, '%', false),
      row('Seat Surplus', 'twin-desk', b.seatGap, a.seatGap, '', false),
      row('Energy / day', 'twin-zap', b.energyKwh, a.energyKwh, ' kWh', true),
      row('Comfort Index', 'twin-thermo', b.comfort, a.comfort, '', false),
    ];
  });

  /* ---------- map ---------- */
  private readonly ppl = computed(() => this.store.people().filter((x) => x.floor === this.floor()));
  private nearestExit(x: number, y: number, blocked: string[]) {
    const open = EXITS.filter((e) => !blocked.includes(e.id));
    return (open.length ? open : EXITS).reduce((best, e) => (Math.hypot(e.x - x, e.y - y) < Math.hypot(best.x - x, best.y - y) ? e : best));
  }
  private readonly evacFrac = computed(() => {
    const p = this.ranP() ?? this.p();
    if (p.type !== 'Evacuation') return 0;
    return this.running() ? this.progress() / 100 : this.res() ? 1 : 0;
  });
  protected readonly markers = computed<IsoMarker[]>(() => {
    const p = this.p();
    if (p.type !== 'Evacuation') return [];
    const blocked = p.blocked;
    const t = this.evacFrac();
    const r = rng(77);
    const people = this.ppl().map((e) => {
      const ex = this.nearestExit(e.x, e.y, blocked);
      const speed = 0.8 + r() * 0.9;
      const k = clamp(t * speed * 1.25, 0, 1);
      const x = e.x + (ex.x - e.x) * k;
      const y = e.y + (ex.y - e.y) * k;
      return { id: e.id, x, y, color: k >= 1 ? '#16a34a' : t > 0 ? '#f59e0b' : '#2563eb', icon: 'user', kind: 'chip', title: e.name, dim: k >= 1 } as IsoMarker;
    });
    const ex = EXITS.map((e) => ({ id: e.id, x: e.x, y: e.y, color: blocked.includes(e.id) ? '#ef4444' : '#16a34a', icon: blocked.includes(e.id) ? 'ban' : 'twin-exit', kind: 'pin', title: `${e.name}${blocked.includes(e.id) ? ' · BLOCKED' : ''} (click to toggle)` }) as IsoMarker);
    return [...people, ...ex];
  });
  protected readonly paths = computed<IsoPath[]>(() => {
    const p = this.p();
    if (p.type !== 'Evacuation') return [];
    const used = new Map<string, [number, number][]>();
    for (const z of this.zones().filter((x) => x.capacity > 0)) {
      const [cx, cy] = center(z);
      const e = this.nearestExit(cx, cy, p.blocked);
      if (!used.has(z.id)) used.set(z.id, [[cx, cy], [cx, (cy + e.y) / 2], [e.x, (cy + e.y) / 2], [e.x, e.y]]);
    }
    return [...used.values()].map((pts) => ({ points: pts, color: '#16a34a', dashed: true }));
  });
  protected readonly glows = computed<IsoGlow[]>(() => {
    const p = this.p();
    if (p.type === 'Evacuation') {
      if (!this.res() && !this.running()) return [];
      const load = new Map<string, number>();
      for (const e of this.ppl()) {
        const x = this.nearestExit(e.x, e.y, p.blocked);
        load.set(x.id, (load.get(x.id) ?? 0) + 1);
      }
      return EXITS.filter((e) => (load.get(e.id) ?? 0) > this.ppl().length / 3.2).map((e) => ({ x: e.x, y: e.y, r: 55, color: '#ef4444' }));
    }
    const u = this.ranUtil();
    return this.zones().filter((z) => z.capacity && (u.get(z.id) ?? 0) > 1).map((z) => ({ x: center(z)[0], y: center(z)[1], r: Math.min(z.w, z.h) * 0.4, color: '#ef4444' }));
  });
  private readonly ranUtil = computed(() => {
    const p = this.ranP() ?? this.p();
    const r = this.res() ?? this.live();
    const f = r.util / 68;
    return new Map(this.zones().map((z) => [z.id, z.capacity ? (z.occupancy / Math.max(1, z.capacity)) * f * (p.type === 'Layout Change' && z.id === p.zone ? 0.9 : 1) : 0]));
  });
  protected readonly heat = computed<IsoHeat[]>(() => {
    if (this.p().type === 'Evacuation') return [];
    const u = this.ranUtil();
    return this.zones()
      .filter((z) => z.capacity)
      .map((z) => ({ x: center(z)[0], y: center(z)[1], r: 30 + Math.min(1, u.get(z.id) ?? 0) * Math.min(z.w, z.h) * 0.42, v: Math.min(1, u.get(z.id) ?? 0) * 0.6 }));
  });
  protected readonly tint = computed(() => (this.p().type === 'Layout Change' ? [this.p().zone] : []));

  /* ---------- charts ---------- */
  protected readonly curve = computed(() => {
    const b = this.base();
    const a = this.res() ?? b;
    const maxT = Math.ceil(Math.max(b.evacMin, a.evacMin)) + 1;
    const labels = Array.from({ length: maxT * 2 + 1 }, (_, i) => `${i / 2}`);
    const rem = (r: Result) => labels.map((l) => {
      const t = +l / r.evacMin;
      return t >= 1 ? 0 : Math.round(r.headcount * (1 - (3 * t * t - 2 * t * t * t)));
    });
    return { labels, series: [{ name: 'Baseline (people inside)', color: '#94a3b8', values: rem(b), dashed: true }, { name: 'Scenario', color: '#7c3aed', values: rem(a), area: true }] };
  });
  protected readonly floorUtil = computed(() => {
    const b = this.base();
    const a = this.res() ?? b;
    const vals = (r: Result) =>
      FLOOR_TABS.map((f) => {
        const fl = floorById(f.id);
        return Math.round(fl.util * (r.util / 68));
      });
    return [
      { name: 'Baseline', color: '#c4b5fd', values: vals(b) },
      { name: 'Scenario', color: '#7c3aed', values: vals(a) },
    ];
  });
  protected readonly recs = computed(() => {
    const r = this.res();
    if (!r) return [];
    const p = this.ranP()!;
    const out: { title: string; text: string; icon: string; level: string; action?: string }[] = [];
    if (r.evacMin > 8) out.push({ title: `Evacuation ${r.evacMin} min exceeds the 8-min target`, text: p.blocked.length ? `Reopen ${p.blocked.map((b) => EXITS.find((e) => e.id === b)!.name).join(', ')} or add 2 floor marshals per stair.` : 'Stagger floor release by 60 s and add marshals at the main stair.', icon: 'twin-exit', level: 'high', action: 'Create task' });
    if (r.congestion >= 5) out.push({ title: `${r.congestion} congestion points predicted`, text: 'Widen the corridor by the Lift Core and move queueing furniture away from exits.', icon: 'triangle-alert', level: 'med', action: 'Create task' });
    if (r.seatGap < 0) out.push({ title: `${Math.abs(r.seatGap)} desks short`, text: `Adopt Hybrid 3-2 (cuts on-site headcount ~30%) or convert collaboration space to ${Math.abs(r.seatGap)} desks.`, icon: 'twin-desk', level: 'high', action: 'Try Hybrid 3-2' });
    if (r.comfort < 80) out.push({ title: `Comfort index drops to ${r.comfort}`, text: 'Pre-cool from 06:30 and keep setpoint between 22.5–23.5°C on peak days.', icon: 'twin-thermo', level: 'med', action: 'Set 23°C' });
    if (r.energyKwh > this.base().energyKwh * 1.08) out.push({ title: `Energy +${Math.round((r.energyKwh / this.base().energyKwh - 1) * 100)}% vs. baseline`, text: 'Enable occupancy-based HVAC zoning on under-used floors (Floor 5, Ground).', icon: 'twin-zap', level: 'med', action: 'Create task' });
    if (p.type === 'Layout Change') out.push({ title: 'Apply layout to the digital twin', text: `Convert ${this.store.zones().find((z) => z.id === p.zone)?.name} to ${tl(p.zoneType)} with ${p.zoneCap} seats. Space & Zone pages update instantly.`, icon: 'twin-cube', level: 'ok', action: 'Apply' });
    if (!out.length) out.push({ title: 'All KPIs within target', text: 'Scenario is safe to adopt — no bottlenecks, comfort and energy within limits.', icon: 'twin-check', level: 'ok' });
    return out;
  });

  /* ---------- saved table ---------- */
  protected readonly rows = computed(() => (this.store.scenarios() as SavedScenario[]).map((s) => ({ ...s, typeL: s.type ?? (s.blockedExits ? 'Evacuation' : 'Baseline'), evacL: `${s.evacMin} min`, energyL: `${fmtN(s.energyKwh)} kWh`, occL: `${s.occupancy}%` })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Scenario' },
    { key: 'typeL', label: 'Type', kind: 'tag', tag: () => 'tag blue' },
    { key: 'occL', label: 'Occupancy', kind: 'num' },
    { key: 'shift', label: 'Pattern' },
    { key: 'evacL', label: 'Evacuation', kind: 'num' },
    { key: 'energyL', label: 'Energy / day', kind: 'num' },
    { key: 'comfort', label: 'Comfort', kind: 'num' },
    { key: 'congestion', label: 'Congestion', kind: 'num' },
    { key: 'created', label: 'Created' },
    { key: 'by', label: 'By' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'load', label: 'Load parameters', icon: 'refresh' },
    { id: 'base', label: 'Use as baseline', icon: 'twin-target' },
    { id: 'dup', label: 'Duplicate', icon: 'twin-save' },
    { id: 'del', label: 'Delete', icon: 'twin-trash', danger: true, when: (r) => r.id !== 'SC-01' },
  ];

  /* ---------- actions ---------- */
  protected set<K extends keyof Params>(k: K, v: Params[K]) {
    this.p.update((p) => ({ ...p, [k]: v }));
  }
  protected setType(t: SType) {
    this.p.update((p) => ({ ...p, type: t }));
    this.res.set(null);
    this.ranP.set(null);
  }
  protected toggleExit(id: string) {
    this.p.update((p) => ({ ...p, blocked: p.blocked.includes(id) ? p.blocked.filter((x) => x !== id) : [...p.blocked, id] }));
    this.res.set(null);
    this.ranP.set(null);
  }
  protected pickZone(id: string) {
    const z = this.store.zones().find((x) => x.id === id);
    if (z) this.p.update((p) => ({ ...p, zone: id, zoneCap: z.capacity, zoneType: z.type === 'collab' ? 'workstations' : z.type }));
  }
  protected zonePick(id: string) {
    if (this.p().type === 'Layout Change' && this.editable().some((z) => z.id === id)) this.pickZone(id);
  }
  protected markerPick(id: string) {
    if (EXITS.some((e) => e.id === id)) this.toggleExit(id);
  }
  protected reset() {
    this.p.set({ ...this.defaults, type: this.p().type });
    this.res.set(null);
    this.ranP.set(null);
  }
  protected run() {
    if (this.running()) return;
    if (this.p().type === 'Layout Change') this.floor.set(this.store.zones().find((z) => z.id === this.p().zone)?.floor ?? this.floor());
    this.ranP.set({ ...this.p() });
    this.res.set(null);
    this.progress.set(0);
    this.running.set(true);
    this.timer = setInterval(() => {
      const v = Math.min(100, this.progress() + 2);
      this.progress.set(v);
      if (v >= 100) {
        clearInterval(this.timer!);
        this.timer = null;
        this.running.set(false);
        this.res.set(this.model(this.ranP()!));
        this.ranAt.set(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        const r = this.res()!;
        this.toast$(`${this.ranP()!.type} simulated · evac ${r.evacMin} min · ${fmtN(r.energyKwh)} kWh/day · comfort ${r.comfort}`);
      }
    }, 70);
  }
  protected openSave() {
    const p = this.p();
    this.name.set(`${p.type} – ${p.occupancy}% ${p.shift}${p.growth && p.type !== 'Evacuation' && p.type !== 'HVAC & Energy' ? ` · +${p.growth}% headcount` : ''}${p.type === 'Evacuation' && p.blocked.length ? ` · ${p.blocked.length} exit(s) blocked` : ''}`);
    this.saving.set(true);
  }
  protected save() {
    const r = this.res();
    const p = this.ranP() ?? this.p();
    if (!r || !this.name().trim()) return;
    const id = `SC-${String(this.store.scenarios().length + 1).padStart(2, '0')}${Date.now() % 100}`;
    const s: SavedScenario = { id, name: this.name().trim(), occupancy: p.occupancy, blockedExits: p.type === 'Evacuation' ? p.blocked.length : 0, hvacSetpoint: p.setpoint, outsideTemp: p.outside, shift: p.shift, evacMin: r.evacMin, energyKwh: r.energyKwh, comfort: r.comfort, congestion: r.congestion, created: today(), by: 'Rex Kumar', type: p.type, growth: p.growth, util: r.util, seatGap: r.seatGap };
    this.store.scenarios.update((l) => [s, ...l]);
    this.store.log({ icon: 'twin-save', color: '#7c3aed', who: s.name, what: 'Scenario saved' });
    this.saving.set(false);
    this.toast$(`Saved “${s.name}”`);
  }
  protected load(s: SavedScenario) {
    this.p.set({ ...this.defaults, type: s.type ?? (s.blockedExits ? 'Evacuation' : 'HVAC & Energy'), occupancy: s.occupancy, setpoint: s.hvacSetpoint, outside: s.outsideTemp, shift: s.shift, growth: s.growth ?? 0, blocked: EXITS.slice(1, 1 + s.blockedExits).map((e) => e.id) });
    this.res.set(null);
    this.ranP.set(null);
    this.toast$(`Loaded ${s.name} · press Run to simulate`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  protected act(a: string, s: SavedScenario) {
    if (a === 'load') return this.load(s);
    if (a === 'base') {
      this.baseId.set(s.id);
      return this.toast$(`Comparing against ${s.name}`);
    }
    if (a === 'dup') {
      this.store.scenarios.update((l) => [{ ...s, id: `${s.id}-C${l.length}`, name: `${s.name} (copy)`, created: today(), by: 'Rex Kumar' }, ...l]);
      return this.toast$(`Duplicated ${s.name}`);
    }
    this.store.scenarios.update((l) => l.filter((x) => x.id !== s.id));
    if (this.baseId() === s.id) this.baseId.set('SC-01');
    this.toast$(`Deleted ${s.name}`);
  }
  protected doRec(r: { title: string; action?: string }) {
    if (r.action === 'Try Hybrid 3-2') {
      this.set('shift', 'Hybrid 3-2');
      return this.run();
    }
    if (r.action === 'Set 23°C') {
      this.set('setpoint', 23);
      return this.run();
    }
    if (r.action === 'Apply') {
      const p = this.ranP()!;
      const z = this.store.zones().find((x) => x.id === p.zone) as TZone;
      this.store.upsertZone({ ...z, type: p.zoneType, capacity: p.zoneCap, occupancy: Math.min(z.occupancy, p.zoneCap) });
      this.store.log({ icon: 'map-floor', color: '#7c3aed', who: z.name, what: `Layout applied · ${tl(p.zoneType)}, ${p.zoneCap} seats`, ref: z.id, floor: z.floor });
      return this.toast$(`${z.name} updated in the digital twin`);
    }
    this.store.log({ icon: 'twin-wrench', color: '#f59e0b', who: 'Scenario action', what: r.title });
    this.toast$(`Task created: ${r.title}`);
  }
  protected exportCsv() {
    const k = this.kpis();
    downloadCsv('scenario-results.csv', [['KPI', 'Baseline', 'Scenario', 'Delta'], ...k.map((x) => [x.label, x.before, x.after, x.delta]), [], ['Saved scenario', 'Occupancy', 'Pattern', 'Evac (min)', 'Energy (kWh)', 'Comfort', 'Congestion'], ...this.store.scenarios().map((s) => [s.name, s.occupancy, s.shift, s.evacMin, s.energyKwh, s.comfort, s.congestion])]);
    this.toast$('Exported scenario results');
  }
  protected toast$(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
  protected readonly hc = heatColor;
}
