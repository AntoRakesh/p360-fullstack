// Reusable table: search, select filters, sorting, paging, row selection and a ⋯ row-actions menu.
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, HostListener, input, output, signal, untracked } from '@angular/core';
import { Icon } from './icon';
import { SelectValue } from './select-value';

export interface Col {
  key: string;
  label: string;
  /** person = avatar + name (+ sub line); tag/status = pill; num = right aligned; progress = bar; chips = string[] */
  kind?: 'text' | 'person' | 'tag' | 'status' | 'num' | 'progress' | 'chips' | 'bool' | 'swatch' | 'lines' | 'icon';
  sub?: string;
  tag?: (row: any) => string;
  fmt?: (v: any, row: any) => string;
  sortable?: boolean;
}
export interface Filter {
  key: string;
  label: string;
  options: string[];
}
export interface RowAction {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  /** Hide the action for rows where this returns false. */
  when?: (row: any) => boolean;
}

const GREEN = /^(checked in|in$|printed|cleared|reviewed|forgiven|granted|locked|closed|active|verified|valid|compliant|enrolled|completed|approved|online|yes|assigned|done|merged|issued|in stock|on track)$/i;
const AMBER = /^(held open|unlocked|open$|warning|acknowledged|on leave|pending|expiring|expiring soon|in progress|suspended|review|due|partial|at risk|scheduled|notice period|pre-boarding|onboarding|transfer)/i;
const RED = /^(checked out|out$|no-show|denied|alarm|offline|forced|tamper|critical|inactive|expired|rejected|lost|blacklisted|watchlisted|non-compliant|failed|blocked|offboarding|terminated|overdue|duplicate|missing)/i;
export function statusTag(v: unknown) {
  const s = String(v ?? '');
  return GREEN.test(s) ? 'tag green' : AMBER.test(s) ? 'tag amber' : RED.test(s) ? 'tag red' : 'tag blue';
}

@Component({
  selector: 'app-data-table',
  imports: [Icon, DecimalPipe, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dt-toolbar">
      @if (searchKeys().length) {
        <label class="search-box dt-search">
          <app-icon name="search" [size]="15" />
          <input [placeholder]="searchPlaceholder()" [value]="q()" (input)="q.set($any($event.target).value); page.set(0)" />
        </label>
      }
      @for (f of filters(); track f.key) {
        <label class="dt-filter">
          <span>{{ f.label }}</span>
          <select class="select" [value]="fv()[f.key] ?? 'All'" (change)="setFilter(f.key, $any($event.target).value)">
            <option value="All">All</option>
            @for (o of f.options; track o) {
              <option [value]="o">{{ o }}</option>
            }
          </select>
        </label>
      }
      <div class="dt-extra"><ng-content /></div>
    </div>

    @if (selectable() && selected().size) {
      <div class="dt-bulk">
        <b>{{ selected().size }} selected</b>
        @for (a of bulkActions(); track a.id) {
          <button class="btn-ghost sm" [class.danger]="a.danger" (click)="emitBulk(a.id)">{{ a.label }}</button>
        }
        <button class="link" (click)="clearSel()">Clear</button>
      </div>
    }

    <div class="table-wrap" [style.max-height]="maxHeight()">
      <table class="table dt">
        <thead>
          <tr>
            @if (selectable()) {
              <th class="cb"><input type="checkbox" [checked]="allOnPage()" (change)="togglePage()" /></th>
            }
            @for (c of columns(); track c.key) {
              <th [class.num]="c.kind === 'num'" [class.sortable]="c.sortable !== false" (click)="c.sortable !== false && sortBy(c.key)">
                {{ c.label }}
                @if (sort().key === c.key) {
                  <span class="arr">{{ sort().dir === 1 ? '▲' : '▼' }}</span>
                }
              </th>
            }
            @if (actions().length) {
              <th class="act">Actions</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of pageRows(); track row[idKey()]) {
            <tr class="clickable" [class.selected]="activeId() === row[idKey()]" (click)="rowClick.emit(row)">
              @if (selectable()) {
                <td class="cb" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="selected().has(row[idKey()])" (change)="toggle(row[idKey()])" /></td>
              }
              @for (c of columns(); track c.key) {
                <td [class.num]="c.kind === 'num'">
                  @switch (c.kind) {
                    @case ('person') {
                      <div class="dt-person">
                        <span class="dt-av" [style.background]="row.avatar ?? 'var(--ka-7c3aed)'">{{ row.initials ?? '' }}</span>
                        <div><b>{{ val(c, row) }}</b>@if (c.sub) {<small>{{ row[c.sub] }}</small>}</div>
                      </div>
                    }
                    @case ('tag') { <span [class]="c.tag ? c.tag(row) : 'tag'">{{ val(c, row) }}</span> }
                    @case ('status') { <span class="dt-status" [class]="statusClass(row[c.key])"><i></i>{{ val(c, row) }}</span> }
                    @case ('progress') {
                      <span class="mini-progress"><i [style.width.%]="row[c.key]" [style.background]="row[c.key] < 60 ? 'var(--ka-f59e0b)' : 'var(--ka-7c3aed)'"></i></span>{{ row[c.key] }}%
                    }
                    @case ('chips') {
                      @for (x of row[c.key]; track x) {<span class="chip-s">{{ x }}</span>}
                    }
                    @case ('bool') {
                      <span [class]="row[c.key] ? 'good' : 'muted'">{{ row[c.key] ? '✓' : '—' }}</span>
                    }
                    @case ('swatch') {
                      <div class="dt-swatch"><span [style.background]="row.color ?? 'var(--ka-7c3aed)'">{{ String(row[c.key] ?? '?')[0] }}</span><b>{{ val(c, row) }}</b></div>
                    }
                    @case ('icon') {
                      <div class="dt-swatch"><span class="ic" [style.background]="'color-mix(in srgb, ' + (row.color ?? 'var(--ka-7c3aed)') + ' 13%, transparent)'" [style.color]="row.color ?? 'var(--ka-7c3aed)'"><app-icon [name]="row.icon ?? 'file-text'" [size]="16" /></span><b>{{ val(c, row) }}</b></div>
                    }
                    @case ('lines') {
                      @for (l of String(val(c, row) ?? '').split('\n'); track $index) {<div class="dt-line">{{ l }}</div>}
                    }
                    @case ('num') { {{ isNum(row[c.key]) ? (row[c.key] | number) : val(c, row) }} }
                    @default {
                      {{ val(c, row) }}
                      @if (c.sub) {<div class="muted">{{ row[c.sub] }}</div>}
                    }
                  }
                </td>
              }
              @if (actions().length) {
                <td class="act" (click)="$event.stopPropagation()">
                  <div class="menu-wrap">
                    <button class="dots" (click)="openMenu.set(openMenu() === row[idKey()] ? null : row[idKey()])" aria-label="Row actions">⋯</button>
                    @if (openMenu() === row[idKey()]) {
                      <div class="dropdown dt-menu">
                        @for (a of actions(); track a.id) {
                          @if (!a.when || a.when(row)) {
                            <button class="dd-item" [class.danger]="a.danger" (click)="action.emit({ action: a.id, row }); openMenu.set(null)">
                              @if (a.icon) {<app-icon [name]="a.icon" [size]="15" />}{{ a.label }}
                            </button>
                          }
                        }
                      </div>
                    }
                  </div>
                </td>
              }
            </tr>
          } @empty {
            <tr><td [attr.colspan]="columns().length + 2" class="empty-note">No {{ noun() }} match these filters</td></tr>
          }
        </tbody>
      </table>
    </div>

    <div class="dt-pager">
      <span>Showing {{ total() ? page() * size() + 1 : 0 }} - {{ min((page() + 1) * size(), total()) }} of {{ total() | number }} {{ noun() }}</span>
      <div class="pages">
        <button class="pg" [disabled]="page() === 0" (click)="page.set(page() - 1)"><app-icon name="chevron-left" [size]="14" /></button>
        @for (p of pageList(); track $index) {
          @if (p < 0) {
            <span class="gap">…</span>
          } @else {
            <button class="pg" [class.on]="p === page()" (click)="page.set(p)">{{ (p + 1) | number }}</button>
          }
        }
        <button class="pg" [disabled]="(page() + 1) * size() >= total()" (click)="page.set(page() + 1)"><app-icon name="chevron-right" [size]="14" /></button>
      </div>
      <label class="per">
        Show
        <select class="select" [value]="size()" (change)="size.set(+$any($event.target).value); page.set(0)">
          @for (s of [10, 12, 20, 50]; track s) {
            <option [value]="s" [selected]="s === size()">{{ s }}</option>
          }
        </select>
        per page
      </label>
    </div>
  `,
})
export class DataTable {
  readonly rows = input.required<any[]>();
  readonly columns = input.required<Col[]>();
  readonly searchKeys = input<string[]>([]);
  readonly searchPlaceholder = input('Search...');
  readonly filters = input<Filter[]>([]);
  readonly actions = input<RowAction[]>([]);
  readonly bulkActions = input<RowAction[]>([]);
  readonly selectable = input(false);
  readonly pageSize = input(10);
  readonly idKey = input('id');
  readonly activeId = input<string | null>(null);
  readonly noun = input('items');
  readonly maxHeight = input<string | null>(null);
  readonly rowClick = output<any>();
  readonly action = output<{ action: string; row: any }>();
  readonly bulk = output<{ action: string; ids: string[] }>();

  protected readonly min = Math.min;
  protected readonly String = String;
  protected readonly q = signal('');
  protected readonly fv = signal<Record<string, string>>({});
  protected readonly sort = signal<{ key: string; dir: 1 | -1 }>({ key: '', dir: 1 });
  protected readonly page = signal(0);
  protected readonly size = signal(10);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly openMenu = signal<string | null>(null);

  constructor() {
    effect(() => this.size.set(this.pageSize()));
    // Keep the current page when rows change (live updates); clamp if it no longer exists.
    effect(() => {
      const last = Math.max(0, Math.ceil(this.total() / this.size()) - 1);
      if (untracked(this.page) > last) this.page.set(last);
    });
  }

  private readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const keys = this.searchKeys();
    const fv = Object.entries(this.fv()).filter(([, v]) => v !== 'All');
    const { key, dir } = this.sort();
    const out = this.rows().filter(
      (r) => (!q || keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q))) && fv.every(([k, v]) => String(r[k]) === v),
    );
    return key ? [...out].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0)) : out;
  });
  protected readonly total = computed(() => this.filtered().length);
  protected readonly pageRows = computed(() => this.filtered().slice(this.page() * this.size(), (this.page() + 1) * this.size()));
  protected readonly pageList = computed(() => {
    const last = Math.max(0, Math.ceil(this.total() / this.size()) - 1);
    const p = this.page();
    if (last <= 6) return Array.from({ length: last + 1 }, (_, i) => i);
    const set = [0, 1, 2, 3, 4].filter((x) => x <= last);
    const around = [p - 1, p, p + 1].filter((x) => x > 4 && x < last);
    return [...set, ...(around.length && around[0] > 5 ? [-1] : []), ...around, ...(p + 2 < last ? [-2] : []), last].filter((v, i, a) => a.indexOf(v) === i);
  });
  protected readonly allOnPage = computed(() => this.pageRows().length > 0 && this.pageRows().every((r) => this.selected().has(r[this.idKey()])));

  protected emitBulk(id: string) {
    this.bulk.emit({ action: id, ids: [...this.selected()] });
    this.clearSel();
  }
  protected clearSel() {
    this.selected.set(new Set());
  }
  protected val(c: Col, row: any) {
    return c.fmt ? c.fmt(row[c.key], row) : row[c.key];
  }
  protected isNum(v: unknown) {
    return typeof v === 'number';
  }
  protected statusClass(v: unknown) {
    return statusTag(v).replace('tag', 'dt-status');
  }
  protected setFilter(key: string, v: string) {
    this.fv.update((f) => ({ ...f, [key]: v }));
    this.page.set(0);
  }
  protected sortBy(key: string) {
    this.sort.update((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  }
  protected toggle(id: string) {
    this.selected.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected togglePage() {
    const ids = this.pageRows().map((r) => r[this.idKey()]);
    const all = this.allOnPage();
    this.selected.update((s) => {
      const n = new Set(s);
      ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
      return n;
    });
  }

  @HostListener('document:click', ['$event'])
  protected closeMenu(e: Event) {
    if (!(e.target as HTMLElement).closest?.('.dt-menu, .dots')) this.openMenu.set(null);
  }
}
