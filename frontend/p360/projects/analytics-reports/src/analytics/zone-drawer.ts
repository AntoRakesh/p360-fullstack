import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Series, UI } from '@p360/shared/ui';
import { AnalyticsStore, fmtMin, fmtN, HOURS, HOURS_FULL, PEAK_TODAY } from './analytics.data';
import { FfLine } from './analytics-ui';

/** Right-hand drawer with one zone's live + historical numbers and edit actions. */
@Component({
  selector: 'app-zone-drawer',
  imports: [...UI, FfLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    @if (z(); as z) {
      <aside class="g-drawer wide">
        <div class="hd"><span class="sw" [style.background]="z.color"></span><div><h3>{{ z.name }}</h3><small class="muted">{{ z.type }} · {{ z.floor }} · {{ z.camera }}</small></div>
          <span [class]="z.status === 'Normal' ? 'tag green' : z.status === 'Busy' ? 'tag amber' : 'tag red'">{{ z.status }}</span>
          <button class="close-btn" (click)="closed.emit()">×</button></div>
        <div class="km">
          <div><small>Occupancy now</small><b>{{ z.occ }} <em>/ {{ z.cap }}</em></b><div class="bar"><i [style.width.%]="z.pct" [style.background]="z.pct >= z.threshold ? 'var(--ka-ef4444)' : z.color"></i></div></div>
          <div><small>Entries</small><b>{{ n(z.entries) }}</b></div>
          <div><small>Exits</small><b>{{ n(z.exits) }}</b></div>
          <div><small>Avg. dwell</small><b>{{ m(z.dwell) }}</b></div>
          <div><small>Conversion</small><b>{{ z.conv ? z.conv + '%' : '—' }}</b></div>
          <div><small>Alert threshold</small><b>{{ z.threshold }}%</b></div>
        </div>
        <h4>Hourly footfall · today vs. capacity alert</h4>
        <app-ff-line [labels]="hours" [tipLabels]="hoursFull" [series]="hourly()" [height]="190" [every]="3" [pin]="9" />
        <h4>Adjust zone</h4>
        <div class="form-grid">
          <label>Capacity (people)<input class="input" type="number" min="1" [value]="cap()" (input)="cap.set(+$any($event.target).value)" /></label>
          <label>Alert threshold (%)<input class="input" type="number" min="10" max="100" [value]="thr()" (input)="thr.set(+$any($event.target).value)" /></label>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" (click)="go('heatmaps-trajectories')">View heatmap</button>
          <button class="btn-ghost" (click)="go('zone-area-analytics')">Zone analytics</button>
          <button class="btn-primary" (click)="save()">Save changes</button>
        </div>
        @if (saved()) {<p class="good ok">Saved · occupancy %, heatmap and alerts updated across the module.</p>}
      </aside>
    }
  `,
  styles: `
    .hd { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 12px; align-items: center; margin-bottom: 14px; } .hd div { display: flex; flex-direction: column; }
    .sw { width: 12px; height: 36px; border-radius: 4px; }
    .km { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .km > div { border: 1px solid var(--border); border-radius: 8px; padding: 9px 10px; } .km small { color: var(--muted); font-size: 11px; } .km b { display: block; font-size: 17px; margin-top: 2px; } .km em { font-style: normal; font-size: 12px; color: var(--muted); font-weight: 500; }
    .bar { height: 5px; border-radius: 3px; background: var(--kb-eef0f6); margin-top: 6px; overflow: hidden; } .bar i { display: block; height: 100%; }
    h4 { margin: 14px 0 8px; font-size: 13px; } .ok { font-size: 12px; margin-top: 10px; }
  `,
})
export class ZoneDrawer {
  private readonly s = inject(AnalyticsStore);
  private readonly router = inject(Router);
  readonly zoneId = input.required<string>();
  readonly closed = output();
  protected readonly hours = HOURS;
  protected readonly hoursFull = HOURS_FULL;
  protected readonly n = fmtN;
  protected readonly m = fmtMin;
  protected readonly z = computed(() => this.s.zonesNow().find((z) => z.id === this.zoneId()) ?? null);
  protected readonly cap = signal(0);
  protected readonly thr = signal(0);
  protected readonly saved = signal(false);
  constructor() {
    queueMicrotask(() => {
      const z = this.s.zones().find((x) => x.id === this.zoneId());
      if (z) { this.cap.set(z.capacity); this.thr.set(z.threshold); }
    });
  }
  protected readonly hourly = computed<Series[]>(() => {
    const z = this.z();
    if (!z) return [];
    const share = (z.entries + z.exits) / 12482 / this.s.f();
    return [
      { name: 'Footfall', color: z.color, values: PEAK_TODAY.map((v, i) => Math.round(v * share * 1.6 * this.s.f() * (1 + ((i * 7 + z.id.charCodeAt(1)) % 5) / 20))), area: true },
      { name: 'Last week', color: 'var(--ka-94a3b8)', dashed: true, values: PEAK_TODAY.map((v) => Math.round(v * share * 1.35 * this.s.f())) },
    ];
  });
  protected save() {
    if (this.cap() < 1 || this.thr() < 10 || this.thr() > 100) return;
    this.s.patchZone(this.zoneId(), { capacity: this.cap(), threshold: this.thr() });
    this.saved.set(true);
  }
  protected go(p: string) {
    this.closed.emit();
    this.router.navigateByUrl('/customer-visitor-analytics/' + p);
  }
}
