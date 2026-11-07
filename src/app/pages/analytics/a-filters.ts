import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { A_DATES, A_RANGES, AnalyticsStore, fmtDay } from './analytics.data';

/** Site / date / range selectors shared by every analytics page header. */
@Component({
  selector: 'app-a-filters',
  imports: [Icon, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `
    .hsel { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: #3b3f5c; cursor: pointer; }
    .hsel select { appearance: none; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--text); padding-right: 22px; cursor: pointer; outline: 0; min-width: 0; }
    .hsel > app-icon:last-child { position: absolute; right: 10px; pointer-events: none; }
  `,
  template: `
    <label class="hsel"><select [value]="s.site().name" (change)="setSite($any($event.target).value)">@for (x of s.sites; track x.name) {<option [value]="x.name">{{ x.name }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
    <label class="hsel"><app-icon name="calendar-days" [size]="16" /><select [value]="s.date()" (change)="s.date.set($any($event.target).value)">@for (d of dates; track d) {<option [value]="d">{{ day(d) }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>
    @if (range()) {<label class="hsel"><select [value]="s.range()" (change)="s.range.set($any($event.target).value)">@for (r of ranges; track r) {<option [value]="r">{{ r }}</option>}</select><app-icon name="chevron-down" [size]="15" /></label>}
  `,
})
export class AFilters {
  protected readonly s = inject(AnalyticsStore);
  protected readonly dates = A_DATES;
  protected readonly ranges = A_RANGES;
  protected readonly day = fmtDay;
  readonly range = input(true);
  protected setSite(name: string) {
    this.s.site.set(this.s.sites.find((x) => x.name === name)!);
  }
}

/** Common component CSS for analytics pages (selects, card heads, legends, grids). */
export const A_CSS = `
  :host { display: block; }
  .hsel { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: #3b3f5c; cursor: pointer; }
  .hsel select { appearance: none; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--text); padding-right: 22px; cursor: pointer; outline: 0; min-width: 0; }
  .hsel > app-icon:last-child { position: absolute; right: 10px; pointer-events: none; }
  .hsel.sm { height: 32px; } .hsel.sm select { font-size: 12px; padding-right: 26px; }
  .hb { height: 38px; }
  .row { display: grid; gap: 12px; margin-bottom: 12px; align-items: start; }
  .row.eq { align-items: stretch; }
  .c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .c21 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } .c12 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
  .c32 { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
  .ch { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; min-height: 32px; flex-wrap: wrap; }
  .ch h3 { font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; } .ch-r { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .lg { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; font: inherit; font-size: 12px; color: #3b3f5c; cursor: pointer; padding: 0; white-space: nowrap; }
  .lg i { width: 10px; height: 10px; border-radius: 50%; } .lg.off { opacity: .35; text-decoration: line-through; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { border: 0; background: #fff; padding: 6px 11px; font: inherit; font-size: 12px; cursor: pointer; color: #3b3f5c; white-space: nowrap; } .seg button + button { border-left: 1px solid var(--border); }
  .seg button.on { background: var(--primary); color: #fff; }
  .bar { height: 6px; border-radius: 3px; background: #eef0f6; overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 3px; transition: width .5s; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: grid; gap: 10px; align-items: center; padding: 9px 4px; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
  .list li.click { cursor: pointer; } .list li.click:hover, .list li.on { background: #faf8ff; }
  .list small { color: var(--muted); font-size: 11.5px; } .col { display: flex; flex-direction: column; min-width: 0; }
  .ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
  .sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .note { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 10px; background: #f5f3ff; color: #4c1d95; font-size: 12.5px; margin-bottom: 12px; }
  .note .sp { flex: 1; }
  .toggle { position: relative; width: 34px; height: 19px; border-radius: 10px; background: #d4d6e0; border: 0; cursor: pointer; flex-shrink: 0; transition: background .2s; }
  .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; transition: left .2s; }
  .toggle.on { background: var(--primary); } .toggle.on::after { left: 17px; }
  h4 { margin: 0 0 8px; font-size: 13px; }
  @media (max-width: 1200px) { .c3 { grid-template-columns: 1fr 1fr; } .c21, .c12, .c32 { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .c2, .c3 { grid-template-columns: 1fr; } }
`;
