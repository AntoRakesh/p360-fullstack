import { ChangeDetectionStrategy, Component, computed, HostListener, input, output, signal } from '@angular/core';
import { codeColor, codeHours, LEAVE, OFF, restViolation, RosterRow } from './shifts.data';

export interface DayCol {
  label: string;
  date: number;
  iso: string;
  weekend: boolean;
}

/**
 * Employees × days roster. Click a cell (when editable) to pick a shift.
 * Flags rest-rule breaks (< 11 h between shifts) and shows coverage vs required per shift.
 */
@Component({
  selector: 'app-roster-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rg-wrap">
      <table class="rg">
        <thead>
          <tr>
            <th class="emp">Employee</th>
            @for (d of days(); track d.iso) {
              <th [class.we]="d.weekend">{{ d.label }}<small>{{ d.date }}</small></th>
            }
            <th class="num">Hours</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr>
              <td class="emp"><span class="av" [style.background]="r.avatar">{{ r.initials }}</span><div><b>{{ r.name }}</b><small>{{ r.id }}</small></div></td>
              @for (c of r.days; track $index; let d = $index) {
                <td class="cell-td">
                  <button
                    class="cell"
                    [class.off]="c === off"
                    [class.lv]="c === lv"
                    [class.bad]="d > 0 && rest(r.days[d - 1], c)"
                    [class.chg]="changed().has(r.id + '|' + d)"
                    [class.edit]="editable()"
                    [style.background]="c === off || c === lv ? null : color(c)"
                    [title]="(d > 0 && rest(r.days[d - 1], c) ? 'Less than 11 h rest after previous shift · ' : '') + c"
                    (click)="open($event, r.id, d)"
                  >{{ c === off ? 'Off' : c }}</button>
                  @if (picker()?.id === r.id && picker()?.day === d) {
                    <div class="pick" (click)="$event.stopPropagation()">
                      @for (o of opts(); track o) {
                        <button [style.border-left-color]="color(o)" [class.on]="o === c" (click)="choose(r.id, d, o)">{{ o === off ? 'Day off' : o === lv ? 'Leave' : o }}</button>
                      }
                    </div>
                  }
                </td>
              }
              <td class="num" [class.over]="hours(r) > 48">{{ hours(r) }}</td>
            </tr>
          }
        </tbody>
        @if (coverage().length) {
          <tfoot>
            @for (c of coverage(); track c.code) {
              <tr>
                <td class="emp cov-l"><i [style.background]="color(c.code)"></i>{{ c.code }} <small>need {{ c.need }}</small></td>
                @for (n of c.counts; track $index) {
                  <td><span class="cov" [class.low]="n < c.need" [class.ok]="n >= c.need">{{ n }}/{{ c.need }}</span></td>
                }
                <td></td>
              </tr>
            }
          </tfoot>
        }
      </table>
    </div>
  `,
  styles: `
    .rg-wrap { overflow: auto; }
    .rg { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
    .rg th { position: sticky; top: 0; z-index: 2; background: var(--kb-fafafe); padding: 7px 4px; font-weight: 600; color: var(--kf-4b4f6b); border-bottom: 1px solid var(--border); text-align: center; }
    .rg th small { display: block; font-weight: 400; color: var(--muted); }
    .rg th.we { color: var(--kf-b91c1c); }
    .rg td { padding: 3px; border-bottom: 1px solid var(--kl-f0f1f6); text-align: center; }
    .rg .emp { position: sticky; left: 0; z-index: 1; background: var(--kb-ffffff); text-align: left; min-width: 180px; }
    .rg td.emp { display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 0; }
    .rg td.emp div { display: flex; flex-direction: column; line-height: 1.25; } .rg td.emp small { color: var(--muted); font-size: 10.5px; }
    .av { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: var(--kf-ffffff); font-size: 10.5px; font-weight: 600; flex-shrink: 0; }
    .cell-td { position: relative; }
    .cell { width: 100%; min-width: 58px; height: 30px; border: 2px solid transparent; border-radius: 6px; color: var(--kf-ffffff); font-size: 10.5px; font-weight: 700; cursor: default; }
    .cell.edit { cursor: pointer; } .cell.edit:hover { filter: brightness(1.1); box-shadow: 0 0 0 2px var(--kb-c4b5fd); }
    .cell.off { background: var(--kb-f3f4f6); color: var(--kf-9ca3af); font-weight: 500; }
    .cell.lv { background: var(--kb-ede9fe); color: var(--kf-6d28d9); }
    .cell.bad { border-color: var(--kl-ef4444); box-shadow: inset 0 0 0 1px var(--kb-ffffff); }
    .cell.chg { outline: 2px dashed var(--kl-f59e0b); outline-offset: 1px; }
    .pick { position: absolute; top: 100%; left: 0; z-index: 20; min-width: 140px; max-height: 260px; overflow: auto; display: flex; flex-direction: column; padding: 4px; background: var(--kb-ffffff); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 10px 28px rgba(20,20,60,.18); }
    .pick button { text-align: left; padding: 6px 8px; border: 0; border-left: 4px solid; border-radius: 4px; background: none; font-size: 12px; cursor: pointer; }
    .pick button:hover, .pick button.on { background: var(--kb-f5f3ff); }
    .num { font-weight: 600; font-variant-numeric: tabular-nums; } .over { color: var(--red); }
    tfoot td { background: var(--kb-fcfcff); }
    .cov-l { font-weight: 600; } .cov-l i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; } .cov-l small { color: var(--muted); font-weight: 400; }
    .cov { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .cov.low { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .cov.ok { background: var(--kb-dcfce7); color: var(--kf-15803d); }
  `,
})
export class RosterGrid {
  readonly rows = input.required<RosterRow[]>();
  readonly days = input.required<DayCol[]>();
  readonly editable = input(false);
  readonly required = input<Record<string, number>>({});
  readonly changed = input<Set<string>>(new Set());
  readonly options = input<string[]>([]);
  readonly change = output<{ id: string; day: number; code: string }>();

  protected readonly off = OFF;
  protected readonly lv = LEAVE;
  protected readonly color = codeColor;
  protected readonly rest = restViolation;
  protected readonly picker = signal<{ id: string; day: number } | null>(null);

  protected readonly opts = computed(() => {
    const base = this.options().length ? this.options() : [...new Set(this.rows().flatMap((r) => r.days))].filter((c) => c !== OFF && c !== LEAVE);
    return [...base, OFF, LEAVE];
  });
  protected readonly coverage = computed(() =>
    Object.entries(this.required()).map(([code, need]) => ({
      code,
      need,
      counts: this.days().map((_, d) => this.rows().filter((r) => r.days[d] === code).length),
    })),
  );

  protected hours(r: RosterRow) {
    return r.days.reduce((a, c) => a + codeHours(c), 0);
  }
  protected open(e: Event, id: string, day: number) {
    if (!this.editable()) return;
    e.stopPropagation();
    const p = this.picker();
    this.picker.set(p?.id === id && p.day === day ? null : { id, day });
  }
  protected choose(id: string, day: number, code: string) {
    this.change.emit({ id, day, code });
    this.picker.set(null);
  }

  @HostListener('document:click')
  protected close() {
    this.picker.set(null);
  }
}
