import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { Plate } from './meal-ui';
import { ALLERGENS, Booking, Canteen, DAYS, DIETS, Diner, Dish, fmt, fmtDay, iso, MEAL_TIMES, MEAL_TYPES, MealStore, MealType, money } from './meals.data';

/** Shared toast + navigation helpers. */
abstract class MealPage {
  protected readonly store = inject(MealStore);
  protected readonly app = inject(AppState);
  protected readonly router = inject(Router);
  protected readonly fmt = fmt;
  protected readonly money = money;
  protected readonly toast = signal<string | null>(null);
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
  protected go(sub: string) {
    this.router.navigateByUrl(`/meal-canteen-management/${sub}`);
  }
}
const TODAY_DOW = (new Date().getDay() + 6) % 7;
const PARENT = 'Meal &amp; Canteen Management';
const CATS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages'] as const;
const EMOJIS = ['🍛', '🍗', '🥗', '🍜', '🍝', '🥙', '🌯', '🍲', '🍚', '🍳', '🥞', '🥪', '🍕', '🍔', '🐟', '🍤', '🥣', '🍉', '☕', '🍊'];

/* ============================== Menu Management ============================== */
@Component({
  selector: 'app-menu-management',
  imports: [...UI, Plate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Menu Management" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Plan weekly menus per canteen, manage the dish catalogue and publish menus to employees.">
      <button class="btn-primary" (click)="openDish()"><app-icon name="plus" [size]="16" />Add Dish</button>
      <button class="btn-ghost" (click)="publish()"><app-icon name="megaphone" [size]="16" />Publish Menu</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Menu Items" [value]="store.dishes().length" icon="m-cutlery" color="var(--ka-7c3aed)" change="4" sub="new this month" />
      <app-kpi label="Available Today" [value]="available()" icon="shield-check" color="var(--ka-22c55e)" [sub]="store.dishes().length - available() + ' unavailable'" />
      <app-kpi label="Dishes on Today's Menu" [value]="todayCount()" icon="m-cloche" color="var(--ka-f59e0b)" [sub]="canteenName() " />
      <app-kpi label="Avg. Dish Rating" [value]="avgRating() + ' / 5'" icon="star" color="var(--ka-ef4444)" change="0.2" sub="vs. last month" />
      <app-kpi label="Plant-based Options" [value]="vegan() + ' dishes'" icon="m-leaf" color="var(--ka-2563eb)" [sub]="pctVegan() + '% of catalogue'" subColor="var(--ka-2563eb)" />
    </section>

    <section class="mm">
      <div class="card">
        <div class="card-head">
          <h3>Weekly Menu Planner</h3>
          <div class="toolbar">
            <select class="select" [value]="canteenId()" (change)="canteenId.set($any($event.target).value)">@for (c of store.canteens(); track c.id) {<option [value]="c.id">{{ c.name }}</option>}</select>
            <button class="btn-ghost sm" (click)="copyWeek()"><app-icon name="layers" [size]="13" />Copy to all canteens</button>
          </div>
        </div>
        <div class="planner">
          <span></span>
          @for (d of days; track d; let di = $index) {<span class="ph" [class.today]="di === todayDow">{{ d }}@if (di === todayDow) {<em>Today</em>}</span>}
          @for (m of mealTypes; track m; let mi = $index) {
            <span class="mh"><b>{{ m }}</b><small>{{ times[m] }}</small></span>
            @for (d of days; track d; let di = $index) {
              <div class="cell" [class.today]="di === todayDow">
                @for (id of menu()[di][mi]; track id) {
                  @if (store.dish(id); as x) {
                    <div class="mi" [class.off]="!x.available" [title]="x.name + ' · ' + x.kcal + ' kcal · AED ' + x.price"><span>{{ x.emoji }}</span><small>{{ x.name }}</small><button (click)="removeFromMenu(di, mi, id)" aria-label="Remove">×</button></div>
                  }
                }
                <button class="add" (click)="pick.set({ day: di, meal: mi })">+ Add</button>
              </div>
            }
          }
        </div>
      </div>

      <div class="card cat">
        <div class="card-head"><h3>Dish Catalogue</h3><label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search dishes..." [value]="q()" (input)="q.set($any($event.target).value)" /></label></div>
        <div class="tabs">@for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}</button>}</div>
        <ul class="dishes">
          @for (x of filtered(); track x.id) {
            <li [class.off]="!x.available">
              <app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="40" />
              <div class="dn"><b>{{ x.name }}</b><small>{{ x.category }} · {{ x.cuisine }} · {{ x.kcal }} kcal</small>
                <span class="tags">@for (t of x.diets; track t) {<span class="tag green">{{ t }}</span>}@if (x.allergens.length) {<span class="tag amber" [title]="x.allergens.join(', ')">{{ x.allergens.length }} allergens</span>}</span></div>
              <div class="dr"><b>AED {{ x.price }}</b><small>★ {{ x.rating }} · {{ fmt(x.orders) }} orders</small>
                <span class="acts"><button class="tgl" [class.on]="x.available" (click)="toggleAvail(x)" [title]="x.available ? 'Mark unavailable' : 'Mark available'"><i></i></button><button class="link" (click)="openDish(x)">Edit</button></span></div>
            </li>
          } @empty {<li class="muted">No dishes match.</li>}
        </ul>
      </div>
    </section>

    @if (pick(); as p) {
      <div class="g-overlay" (click)="pick.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Add {{ mealTypes[p.meal] }} dish · {{ days[p.day] }}</h3><button class="close-btn" (click)="pick.set(null)">×</button></div>
        <div class="pick">
          @for (x of pickList(p.meal); track x.id) {
            <button class="pk" [disabled]="menu()[p.day][p.meal].includes(x.id)" (click)="addToMenu(p.day, p.meal, x.id)"><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="34" /><span><b>{{ x.name }}</b><small>{{ x.kcal }} kcal · AED {{ x.price }}</small></span></button>
          }
        </div>
      </div>
    }

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveDish()">
        <div class="modal-head"><h3>{{ isNew() ? 'Add Dish' : 'Edit ' + f.name }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Dish name *<input class="input" [value]="f.name" (input)="setF('name', $any($event.target).value)" /></label>
          <div class="full emo">@for (e of emojis; track e) {<button type="button" [class.on]="f.emoji === e" (click)="setF('emoji', e)">{{ e }}</button>}</div>
          <label>Category<select class="select" [value]="f.category" (change)="setF('category', $any($event.target).value)">@for (c of cats.slice(1); track c) {<option>{{ c }}</option>}</select></label>
          <label>Cuisine<input class="input" [value]="f.cuisine" (input)="setF('cuisine', $any($event.target).value)" /></label>
          <label>Price (AED)<input class="input" type="number" min="0" [value]="f.price" (input)="setF('price', +$any($event.target).value)" /></label>
          <label>Calories (kcal)<input class="input" type="number" min="0" [value]="f.kcal" (input)="setF('kcal', +$any($event.target).value)" /></label>
          <div class="full chk"><span>Dietary</span>@for (t of diets; track t) {<label><input type="checkbox" [checked]="f.diets.includes(t)" (change)="toggleArr('diets', t)" />{{ t }}</label>}</div>
          <div class="full chk"><span>Allergens</span>@for (a of allergens; track a) {<label><input type="checkbox" [checked]="f.allergens.includes(a)" (change)="toggleArr('allergens', a)" />{{ a }}</label>}</div>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Save Dish</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; }
    .mm { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(360px, 1fr); gap: 12px; align-items: start; }
    .planner { display: grid; grid-template-columns: 92px repeat(7, minmax(0, 1fr)); gap: 5px; }
    .ph { font-size: 12px; font-weight: 600; text-align: center; padding: 6px 0; border-radius: 6px; background: var(--kb-f6f6fb); } .ph.today { background: var(--primary); color: var(--kf-ffffff); } .ph em { font-style: normal; font-weight: 400; font-size: 10px; margin-left: 4px; }
    .mh { display: flex; flex-direction: column; justify-content: center; font-size: 12px; } .mh small { color: var(--muted); font-size: 10px; }
    .cell { border: 1px solid var(--border); border-radius: 8px; padding: 5px; min-height: 120px; display: flex; flex-direction: column; gap: 4px; min-width: 0; } .cell.today { border-color: var(--kl-c4b5fd); background: var(--kb-faf8ff); }
    .mi { display: grid; grid-template-columns: 16px 1fr 10px; gap: 3px; align-items: center; background: var(--kb-ffffff); border: 1px solid var(--kl-eef0f6); border-radius: 6px; padding: 3px 4px; font-size: 10.5px; } .mi small { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 10px; line-height: 1.2; }
    .mi.off { opacity: 0.45; text-decoration: line-through; } .mi button { border: 0; background: none; cursor: pointer; color: var(--kf-9ca3af); padding: 0; } .mi button:hover { color: var(--red); }
    .add { margin-top: auto; border: 1px dashed var(--kl-c4b5fd); background: none; border-radius: 6px; color: var(--primary); font-size: 10.5px; padding: 3px; cursor: pointer; }
    .cat .tabs { margin-bottom: 10px; } .dishes { list-style: none; margin: 0; padding: 0; max-height: 640px; overflow: auto; }
    .dishes li { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 9px 2px; border-bottom: 1px solid var(--kl-f0f1f6); } .dishes li.off { opacity: 0.55; }
    .dn, .dr { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; } .dn small, .dr small { color: var(--muted); font-size: 11px; } .dr { align-items: flex-end; }
    .tags { display: flex; flex-wrap: wrap; gap: 3px; } .tags .tag { font-size: 10px; padding: 1px 6px; } .acts { display: flex; gap: 10px; align-items: center; }
    .tgl { width: 30px; height: 17px; border-radius: 10px; border: 0; background: var(--kb-d1d5db); position: relative; cursor: pointer; padding: 0; } .tgl i { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: var(--kb-ffffff); transition: left 0.15s; } .tgl.on { background: var(--kb-22c55e); } .tgl.on i { left: 15px; }
    .pick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; } .pk { display: flex; gap: 10px; align-items: center; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; text-align: left; } .pk:hover { border-color: var(--primary); } .pk:disabled { opacity: 0.4; cursor: default; }
    .pk span { display: flex; flex-direction: column; font-size: 12.5px; } .pk small { color: var(--muted); }
    .emo { display: flex; flex-wrap: wrap; gap: 4px; } .emo button { font-size: 20px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; padding: 2px 5px; cursor: pointer; } .emo button.on { border-color: var(--primary); background: var(--primary-soft); }
    .chk { display: flex !important; flex-direction: row !important; flex-wrap: wrap; gap: 6px 14px !important; align-items: center; } .chk > span { width: 100%; } .chk label { flex-direction: row !important; align-items: center; gap: 5px !important; color: var(--text) !important; }
    @media (max-width: 1350px) { .mm { grid-template-columns: 1fr; } }
  `,
})
export class MenuManagement extends MealPage {
  protected readonly days = DAYS;
  protected readonly mealTypes = MEAL_TYPES;
  protected readonly times = MEAL_TIMES;
  protected readonly cats = CATS;
  protected readonly diets = DIETS;
  protected readonly allergens = ALLERGENS;
  protected readonly emojis = EMOJIS;
  protected readonly todayDow = TODAY_DOW;
  protected readonly canteenId = signal('CT-01');
  protected readonly cat = signal<(typeof CATS)[number]>('All');
  protected readonly q = signal('');
  protected readonly pick = signal<{ day: number; meal: number } | null>(null);
  protected readonly form = signal<Dish | null>(null);
  protected readonly err = signal('');

  protected readonly menu = computed(() => this.store.menu()[this.canteenId()]);
  protected readonly canteenName = computed(() => this.store.canteen(this.canteenId())?.name ?? '');
  protected readonly available = computed(() => this.store.dishes().filter((x) => x.available).length);
  protected readonly todayCount = computed(() => this.menu()[TODAY_DOW].flat().length);
  protected readonly vegan = computed(() => this.store.dishes().filter((x) => x.diets.includes('Vegan')).length);
  protected readonly pctVegan = computed(() => Math.round((this.vegan() / Math.max(1, this.store.dishes().length)) * 100));
  protected readonly avgRating = computed(() => (this.store.dishes().reduce((a, x) => a + x.rating, 0) / Math.max(1, this.store.dishes().length)).toFixed(1));
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.dishes().filter((x) => (this.cat() === 'All' || x.category === this.cat()) && (!q || `${x.name} ${x.cuisine}`.toLowerCase().includes(q)));
  });
  protected readonly isNew = computed(() => !this.store.dishes().some((x) => x.id === this.form()?.id));

  protected pickList(mi: number) {
    const m = MEAL_TYPES[mi];
    return this.store.dishes().filter((x) => x.category === m || x.category === 'Snacks' || x.category === 'Beverages' || (m === 'Dinner' && x.category === 'Lunch'));
  }
  protected addToMenu(day: number, meal: number, id: string) {
    this.store.setMenu(this.canteenId(), day, meal, [...this.menu()[day][meal], id]);
    this.pick.set(null);
    this.toastMsg(`${this.store.dish(id)?.name} added to ${DAYS[day]} ${MEAL_TYPES[meal]}`);
  }
  protected removeFromMenu(day: number, meal: number, id: string) {
    this.store.setMenu(this.canteenId(), day, meal, this.menu()[day][meal].filter((x) => x !== id));
  }
  protected copyWeek() {
    const src = structuredClone(this.menu());
    this.store.menu.update((m) => Object.fromEntries(Object.keys(m).map((k) => [k, structuredClone(src)])));
    this.toastMsg(`${this.canteenName()} menu copied to all ${this.store.canteens().length} canteens`);
  }
  protected publish() {
    this.toastMsg(`Week menu published · push notification sent to ${fmt(this.store.enrolled())} enrolled users`);
  }
  protected toggleAvail(x: Dish) {
    this.store.saveDish({ ...x, available: !x.available });
    this.toastMsg(`${x.name} marked ${x.available ? 'unavailable (sold out)' : 'available'}`);
  }
  protected openDish(x?: Dish) {
    this.err.set('');
    this.form.set(x ? structuredClone(x) : { id: `D${String(this.store.dishes().length + 101)}`, name: '', emoji: '🍛', bg: 'var(--kb-fde68a)', category: 'Lunch', cuisine: 'International', kcal: 500, protein: 20, carbs: 60, fat: 15, allergens: [], diets: ['Halal'], price: 15, rating: 0, available: true, orders: 0 });
  }
  protected setF<K extends keyof Dish>(k: K, v: Dish[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected toggleArr(k: 'diets' | 'allergens', v: string) {
    const l = this.form()![k];
    this.setF(k, l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  }
  protected saveDish() {
    const f = this.form()!;
    if (!f.name.trim()) return this.err.set('Dish name is required.');
    if (f.price <= 0) return this.err.set('Price must be greater than 0.');
    this.store.saveDish({ ...f, name: f.name.trim() });
    this.form.set(null);
    this.toastMsg(`${f.name} saved to catalogue`);
  }
  protected exportCsv() {
    downloadCsv('menu-catalogue.csv', [['ID', 'Dish', 'Category', 'Cuisine', 'kcal', 'Price AED', 'Diets', 'Allergens', 'Rating', 'Available'], ...this.store.dishes().map((x) => [x.id, x.name, x.category, x.cuisine, x.kcal, x.price, x.diets.join('; '), x.allergens.join('; '), x.rating, x.available ? 'Yes' : 'No'])]);
  }
}

/* ============================== Canteen Locations ============================== */
@Component({
  selector: 'app-canteen-locations',
  imports: [...UI, Plate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Canteen Locations" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Monitor canteen capacity, live occupancy, counters and operators across all sites.">
      <button class="btn-primary" (click)="openAdd()"><app-icon name="plus" [size]="16" />Add Canteen</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Canteen Locations" [value]="store.canteens().length" icon="m-store" color="var(--ka-7c3aed)" [sub]="onsite() + ' on-site | ' + (store.canteens().length - onsite()) + ' partner'" subColor="var(--ka-2563eb)" />
      <app-kpi label="Meals Served Today" [value]="fmt(store.servedToday())" icon="m-cloche" color="var(--ka-22c55e)" [sub]="'of 1,932 daily average'" />
      <app-kpi label="Total Seating" [value]="fmt(seats())" icon="users" color="var(--ka-f59e0b)" [sub]="occupiedTotal() + ' seats occupied now'" />
      <app-kpi label="Avg. Queue Time" [value]="avgWait() + ' min'" icon="clock" color="var(--ka-ef4444)" change="12%" [up]="false" sub="vs. last week" />
      <app-kpi label="Avg. Rating" [value]="avgRating() + ' / 5'" icon="star" color="var(--ka-2563eb)" change="0.1" sub="vs. last month" />
    </section>

    <section class="cards">
      @for (c of store.canteens(); track c.id) {
        <button class="card ct" [class.on]="selId() === c.id" (click)="selId.set(c.id)">
          <div class="ct-h"><span class="ci" [style.background]="c.color"><app-icon name="m-store" [size]="18" /></span><div><b>{{ c.name }}</b><small>{{ c.floor }}</small></div><span [class]="'tag ' + statusCls(c.status)">{{ c.status }}</span></div>
          <div class="ct-b">
            <app-ring [value]="util(c)" [color]="c.color" [size]="64" />
            <dl><dt>Meals today</dt><dd>{{ fmt(c.usage) }}</dd><dt>Occupancy</dt><dd>{{ occ(c) }} / {{ c.seats }}</dd><dt>Queue</dt><dd>{{ c.wait }} min</dd><dt>Rating</dt><dd>★ {{ store.canteenRating(c.id) }}</dd></dl>
          </div>
          <div class="ct-f"><span>{{ c.type }} · {{ c.operator }}</span><span>{{ c.hours }}</span></div>
        </button>
      }
    </section>

    @if (sel(); as c) {
      <section class="det">
        <div class="card">
          <div class="card-head"><h3>{{ c.name }} · Hourly Footfall</h3><span class="chip live"><i></i>Live</span></div>
          <app-line-chart [labels]="hours" [series]="footfall(c)" [height]="220" />
          <h4>Live Seating · {{ occ(c) }} of {{ c.seats }} seats</h4>
          <div class="seats">@for (s of seatMap(c); track $index) {<i [class.on]="s" [style.background]="s ? c.color : null"></i>}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Service Counters</h3><span class="muted">{{ openCounters(c) }} of {{ c.counters }} open</span></div>
          <table class="table">
            <thead><tr><th>Counter</th><th>Serving</th><th class="num">Queue</th><th>Status</th></tr></thead>
            <tbody>
              @for (k of counters(c); track k.name) {
                <tr><td>{{ k.name }}</td><td>{{ k.menu }}</td><td class="num">{{ k.open ? k.queue + ' ppl' : '—' }}</td>
                  <td><button class="tag" [class]="k.open ? 'tag green' : 'tag grey'" (click)="toggleCounter(c.id, k.name)">{{ k.open ? 'Open' : 'Closed' }}</button></td></tr>
              }
            </tbody>
          </table>
          <h4>Today's Menu</h4>
          <div class="tm">
            @for (m of mealTypes; track m; let mi = $index) {
              <div><small>{{ m }}</small>@for (id of store.menu()[c.id][todayDow][mi]; track id) {@if (store.dish(id); as x) {<span class="tmi"><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="24" />{{ x.name }}</span>}}</div>
            }
          </div>
          <button class="link" (click)="go('menu-management')">Edit menu →</button>
        </div>
        <div class="card">
          <h3>Location Details</h3>
          <dl class="facts">
            <dt>Site</dt><dd>{{ c.site }}</dd><dt>Location</dt><dd>{{ c.floor }}</dd><dt>Type</dt><dd>{{ c.type }}</dd><dt>Operator</dt><dd>{{ c.operator }}</dd>
            <dt>Manager</dt><dd>{{ c.manager }}</dd><dt>Opening hours</dt><dd>{{ c.hours }}</dd><dt>Daily capacity</dt><dd>{{ fmt(c.capacity) }} meals</dd><dt>Utilization</dt><dd>{{ util(c) }}%</dd>
          </dl>
          <div class="btns">
            <button class="btn-ghost" (click)="setStatus(c, c.status === 'Closed' ? 'Open' : 'Closed')"><app-icon [name]="c.status === 'Closed' ? 'door-open' : 'ban'" [size]="15" />{{ c.status === 'Closed' ? 'Re-open canteen' : 'Close canteen' }}</button>
            <button class="btn-ghost" (click)="toastMsg('Calling ' + c.manager + '…')"><app-icon name="phone" [size]="15" />Call manager</button>
            <button class="btn-ghost" (click)="go('feedback-ratings')"><app-icon name="star" [size]="15" />Feedback</button>
          </div>
        </div>
      </section>
    }

    @if (add(); as a) {
      <div class="g-overlay" (click)="add.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveAdd()">
        <div class="modal-head"><h3>Add Canteen</h3><button type="button" class="close-btn" (click)="add.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Canteen name *<input class="input" [value]="a.name" (input)="a.name = $any($event.target).value" /></label>
          <label>Site<input class="input" [value]="a.site" (input)="a.site = $any($event.target).value" /></label>
          <label>Type<select class="select" [value]="a.type" (change)="a.type = $any($event.target).value"><option>On-site</option><option>Partner</option></select></label>
          <label>Operator<input class="input" [value]="a.operator" (input)="a.operator = $any($event.target).value" /></label>
          <label>Seats<input class="input" type="number" [value]="a.seats" (input)="a.seats = +$any($event.target).value" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="add.set(null)">Cancel</button><button class="btn-primary">Add Canteen</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } h4 { margin: 14px 0 8px; font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .ct { text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 12px; font: inherit; } .ct.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .ct-h { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; } .ct-h div { display: flex; flex-direction: column; } .ct-h small { color: var(--muted); font-size: 11.5px; }
    .ci { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .ct-b { display: flex; gap: 16px; align-items: center; } .ct-b dl { display: grid; grid-template-columns: auto auto; gap: 3px 14px; margin: 0; font-size: 12px; } .ct-b dt { color: var(--muted); } .ct-b dd { margin: 0; font-weight: 600; }
    .ct-f { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); border-top: 1px solid var(--kl-f0f1f6); padding-top: 8px; }
    .det { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
    .seats { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; } .seats i { aspect-ratio: 1; border-radius: 3px; background: var(--kb-eef0f6); }
    .tm { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; } .tm div { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; } .tm small { width: 64px; color: var(--muted); }
    .tmi { display: inline-flex; gap: 5px; align-items: center; font-size: 11.5px; border: 1px solid var(--border); border-radius: 16px; padding: 1px 8px 1px 1px; }
    button.tag { border: 0; cursor: pointer; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 12.5px; margin: 12px 0; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .btns { display: flex; flex-direction: column; gap: 8px; } .btns button { justify-content: flex-start; }
    .chip.live i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--kb-22c55e); margin-right: 5px; }
    @media (max-width: 1400px) { .det { grid-template-columns: 1fr 1fr; } }
  `,
})
export class CanteenLocations extends MealPage {
  protected readonly mealTypes = MEAL_TYPES;
  protected readonly todayDow = TODAY_DOW;
  protected readonly hours = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];
  protected readonly selId = signal('CT-01');
  protected readonly closed = signal<Set<string>>(new Set(['CT-01:Counter 8', 'CT-02:Counter 6']));
  protected readonly add = signal<{ name: string; site: string; type: 'On-site' | 'Partner'; operator: string; seats: number } | null>(null);
  protected readonly err = signal('');
  protected readonly sel = computed(() => this.store.canteen(this.selId()) ?? null);
  protected readonly onsite = computed(() => this.store.canteens().filter((c) => c.type === 'On-site').length);
  protected readonly seats = computed(() => this.store.canteens().reduce((a, c) => a + c.seats, 0));
  protected readonly avgWait = computed(() => (this.store.canteens().reduce((a, c) => a + c.wait, 0) / this.store.canteens().length).toFixed(1));
  protected readonly avgRating = computed(() => this.store.avgRating().toFixed(1));
  protected readonly occupiedTotal = computed(() => fmt(this.store.canteens().reduce((a, c) => a + this.occ(c), 0)));

  protected util(c: Canteen) {
    return Math.round((c.usage / c.capacity) * 100);
  }
  /** Live seat occupancy (depends on tick). */
  protected occ(c: Canteen) {
    if (c.status === 'Closed') return 0;
    const t = this.app.tick();
    const base = c.seats * (c.status === 'Busy' ? 0.72 : 0.46);
    return Math.min(c.seats, Math.round(base + Math.sin(t / 2 + c.seats) * c.seats * 0.05));
  }
  protected statusCls(s: string) {
    return s === 'Open' ? 'green' : s === 'Busy' ? 'amber' : 'grey';
  }
  protected seatMap(c: Canteen) {
    const o = this.occ(c);
    const n = Math.min(c.seats, 180);
    const filled = Math.round((o / c.seats) * n);
    return Array.from({ length: n }, (_, i) => ((i * 47) % n) < filled);
  }
  protected footfall(c: Canteen) {
    const shape = [0.02, 0.08, 0.12, 0.07, 0.03, 0.04, 0.16, 0.18, 0.1, 0.03, 0.02, 0.02, 0.03, 0.05, 0.04, 0.01];
    const nowH = new Date().getHours();
    return [
      { name: 'Today', color: c.color, area: true, values: shape.map((f, i) => (6 + i <= nowH ? Math.round(c.usage * f * 1.1) : NaN)) },
      { name: 'Avg. (last 4 weeks)', color: 'var(--ka-94a3b8)', dashed: true, values: shape.map((f) => Math.round(c.usage * f)) },
    ];
  }
  protected counters(c: Canteen) {
    const menus = ['Hot Meals', 'Grill', 'Salad Bar', 'Asian Wok', 'Arabic', 'Indian', 'Beverages', 'Express'];
    return Array.from({ length: c.counters }, (_, i) => {
      const name = `Counter ${i + 1}`;
      const open = c.status !== 'Closed' && !this.closed().has(`${c.id}:${name}`);
      return { name, menu: menus[i % menus.length], open, queue: Math.max(0, Math.round(c.wait * 1.6 + Math.sin(this.app.tick() / 3 + i) * 2)) };
    });
  }
  protected openCounters(c: Canteen) {
    return this.counters(c).filter((k) => k.open).length;
  }
  protected toggleCounter(id: string, name: string) {
    const k = `${id}:${name}`;
    this.closed.update((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
    this.toastMsg(`${name} ${this.closed().has(k) ? 'closed' : 'opened'}`);
  }
  protected setStatus(c: Canteen, status: Canteen['status']) {
    this.store.canteens.update((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
    this.toastMsg(`${c.name} ${status === 'Closed' ? 'closed · pre-orders redirected' : 're-opened'}`);
  }
  protected openAdd() {
    this.err.set('');
    this.add.set({ name: '', site: 'Head Office', type: 'On-site', operator: 'In-house F&B', seats: 120 });
  }
  protected saveAdd() {
    const a = this.add()!;
    if (!a.name.trim()) return this.err.set('Canteen name is required.');
    const id = `CT-${String(this.store.canteens().length + 1).padStart(2, '0')}`;
    const c: Canteen = { id, name: a.name.trim(), site: a.site, type: a.type, operator: a.operator, usage: 0, capacity: a.seats * 4, seats: a.seats, counters: 3, hours: '07:00 - 21:00', rating: 0, manager: 'Unassigned', status: 'Open', color: 'var(--ka-14b8a6)', floor: a.site, wait: 1 };
    this.store.canteens.update((l) => [...l, c]);
    this.store.menu.update((m) => ({ ...m, [id]: structuredClone(m['CT-01']) }));
    this.selId.set(id);
    this.add.set(null);
    this.toastMsg(`${c.name} added`);
  }
  protected exportCsv() {
    downloadCsv('canteens.csv', [['ID', 'Canteen', 'Site', 'Type', 'Operator', 'Meals today', 'Capacity', 'Seats', 'Counters', 'Rating', 'Status'], ...this.store.canteens().map((c) => [c.id, c.name, c.site, c.type, c.operator, c.usage, c.capacity, c.seats, c.counters, c.rating, c.status])]);
  }
}

/* ============================== Meal Booking & Pre-order ============================== */
const BOOK_TAG: Record<string, string> = { Collected: 'tag green', Confirmed: 'tag blue', Pending: 'tag amber', Cancelled: 'tag grey', 'No-show': 'tag red' };
interface BookForm {
  who: string;
  date: string;
  meal: MealType;
  canteenId: string;
  slot: string;
  dishId: string;
}
interface BookingRow {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  empId: string;
  date: string;
  dateLabel: string;
  meal: string;
  dish: string;
  canteen: string;
  slot: string;
  amount: string;
  status: string;
}
@Component({
  selector: 'app-meal-booking-pre-order',
  imports: [...UI, DataTable, Plate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Meal Booking &amp; Pre-order" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Book meals in advance, manage pre-orders, collections and no-shows across canteens.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />New Booking</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Pre-orders Today" [value]="today().length" icon="calendar-days" color="var(--ka-7c3aed)" change="9%" sub="vs. last week" />
      <app-kpi label="Collected" [value]="count(today(), 'Collected')" icon="shield-check" color="var(--ka-22c55e)" [sub]="pct(count(today(), 'Collected'), today().length) + '% of today'" />
      <app-kpi label="Awaiting Collection" [value]="count(today(), 'Confirmed')" icon="clock" color="var(--ka-f59e0b)" sub="live" />
      <app-kpi label="No-shows (Yesterday)" [value]="noShows()" icon="m-xcircle" color="var(--ka-ef4444)" change="2" [up]="false" sub="vs. day before" />
      <app-kpi label="Tomorrow's Pre-orders" [value]="tomorrow().length" icon="m-cloche" color="var(--ka-2563eb)" [sub]="'cut-off ' + cutoff().replace(' before meal time', '').replace(' hours', 'h').replace(' hour', 'h') + ' before'" subColor="var(--ka-2563eb)" />
    </section>

    <section class="mb">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters()" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="bookings"
          [searchKeys]="['name', 'empId', 'id', 'dish']" searchPlaceholder="Search employee, booking ID, dish..." (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <div class="side">
        <div class="card">
          <h3>Today's Slot Capacity</h3>
          @for (s of slots(); track s.label) {
            <div class="slot"><span>{{ s.label }}</span><div class="trk"><i [style.width.%]="s.pct" [style.background]="s.pct > 85 ? 'var(--ka-ef4444)' : s.pct > 60 ? 'var(--ka-f59e0b)' : 'var(--ka-22c55e)'"></i></div><b>{{ s.booked }}/{{ s.cap }}</b></div>
          }
        </div>
        <div class="card">
          <h3>Popular for Tomorrow</h3>
          <ul class="pop">
            @for (p of popular(); track p.dish.id) {<li><app-plate [emoji]="p.dish.emoji" [bg]="p.dish.bg" [size]="32" /><span><b>{{ p.dish.name }}</b><small>{{ p.dish.category }} · AED {{ p.dish.price }}</small></span><em>{{ p.n }}</em></li>}
          </ul>
        </div>
        <div class="card pol">
          <h3>Booking Rules</h3>
          @for (p of store.policies().slice(0, 3); track p.id) {<p><app-icon [name]="p.icon" [size]="14" [style.color]="p.color" /><b>{{ p.name }}:</b> {{ p.value }}</p>}
          <button class="link" (click)="go('meal-plans-policies')">Manage policies →</button>
        </div>
      </div>
    </section>

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>New Meal Booking</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee *
            <input class="input" list="meal-diners" [value]="f.who" (input)="patch({ who: $any($event.target).value })" placeholder="Type a name or employee ID" />
            <datalist id="meal-diners">@for (p of dinerOptions(); track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist>
          </label>
          <label>Date<select class="select" [value]="f.date" (change)="patch({ date: $any($event.target).value })">@for (d of dates; track d.v) {<option [value]="d.v">{{ d.l }}</option>}</select></label>
          <label>Meal<select class="select" [value]="f.meal" (change)="patch({ meal: $any($event.target).value, dishId: '' })">@for (m of mealTypes; track m) {<option>{{ m }}</option>}</select></label>
          <label>Canteen<select class="select" [value]="f.canteenId" (change)="patch({ canteenId: $any($event.target).value })">@for (c of store.canteens(); track c.id) {<option [value]="c.id">{{ c.name }}</option>}</select></label>
          <label>Pickup slot<select class="select" [value]="f.slot" (change)="patch({ slot: $any($event.target).value })">@for (s of slotsFor(f.meal); track s) {<option>{{ s }}</option>}</select></label>
          <div class="full dishpick">
            @for (x of dishesFor(f.meal); track x.id) {
              <button type="button" [class.on]="f.dishId === x.id" (click)="patch({ dishId: x.id })"><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="30" /><span><b>{{ x.name }}</b><small>AED {{ x.price }} · {{ x.kcal }} kcal</small></span></button>
            }
          </div>
          @if (diner(); as p) {<p class="full muted">Wallet: <b>AED {{ money(p.cash) }}</b> · {{ p.credits }} meal credits left · Plan {{ store.plan(p.planId)?.name }} @if (p.diet !== 'None') {· <span class="tag amber">{{ p.diet }}</span>}</p>}
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary">Confirm Booking</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0 0 10px; font-size: 15px; }
    .mb { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; align-items: start; } .side { display: flex; flex-direction: column; gap: 12px; }
    .slot { display: grid; grid-template-columns: 92px 1fr 52px; gap: 8px; align-items: center; font-size: 12px; margin-bottom: 7px; } .slot b { text-align: right; font-weight: 500; }
    .trk { height: 8px; border-radius: 5px; background: var(--kb-f1f2f7); overflow: hidden; } .trk i { display: block; height: 100%; border-radius: 5px; }
    .pop { list-style: none; margin: 0; padding: 0; } .pop li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 6px 0; font-size: 12.5px; } .pop span { display: flex; flex-direction: column; } .pop small { color: var(--muted); } .pop em { font-style: normal; font-weight: 600; color: var(--primary); }
    .pol p { display: flex; gap: 6px; align-items: center; font-size: 12px; margin: 0 0 8px; flex-wrap: wrap; }
    .dishpick { display: grid !important; grid-template-columns: repeat(2, 1fr); gap: 6px !important; max-height: 230px; overflow: auto; }
    .dishpick button { display: flex; gap: 8px; align-items: center; padding: 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); text-align: left; cursor: pointer; } .dishpick button.on { border-color: var(--primary); background: var(--primary-soft); }
    .dishpick span { display: flex; flex-direction: column; font-size: 12px; color: var(--text); } .dishpick small { color: var(--muted); }
    @media (max-width: 1300px) { .mb { grid-template-columns: 1fr; } }
  `,
})
export class MealBooking extends MealPage {
  protected readonly mealTypes = MEAL_TYPES;
  protected readonly dates = [0, 1, 2, 3].map((o) => ({ v: iso(o), l: o === 0 ? `Today · ${fmtDay(iso(o))}` : o === 1 ? `Tomorrow · ${fmtDay(iso(o))}` : fmtDay(iso(o)) }));
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Booking' },
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'dateLabel', label: 'Date' },
    { key: 'meal', label: 'Meal' },
    { key: 'dish', label: 'Dish' },
    { key: 'canteen', label: 'Canteen' },
    { key: 'slot', label: 'Slot' },
    { key: 'amount', label: 'Amount (AED)', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => BOOK_TAG[r.status] ?? 'tag' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'Collected', label: 'Mark collected', icon: 'shield-check', when: (r) => r.status === 'Confirmed' || r.status === 'Pending' },
    { id: 'Confirmed', label: 'Confirm', icon: 'file-check', when: (r) => r.status === 'Pending' },
    { id: 'No-show', label: 'Mark no-show', icon: 'm-xcircle', when: (r) => r.status === 'Confirmed' },
    { id: 'Cancelled', label: 'Cancel & refund', icon: 'ban', danger: true, when: (r) => r.status === 'Confirmed' || r.status === 'Pending' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'Collected', label: 'Mark collected' }, { id: 'export', label: 'Export' }, { id: 'Cancelled', label: 'Cancel', danger: true }];
  protected readonly form = signal<BookForm | null>(null);
  protected readonly err = signal('');

  protected readonly rows = computed<BookingRow[]>(() =>
    this.store.bookings().map((b) => {
      const p = this.store.diner(b.dinerId)!;
      return { id: b.id, name: p.name, initials: p.initials, avatar: p.avatar, empId: p.id, date: b.date, dateLabel: b.date === iso(0) ? 'Today' : b.date === iso(1) ? 'Tomorrow' : fmtDay(b.date), meal: b.meal, dish: this.store.dish(b.dishId)?.name ?? '', canteen: this.store.canteen(b.canteenId)?.name ?? '', slot: b.slot, amount: money(b.amount * b.qty), status: b.status };
    }),
  );
  protected readonly filters = computed(() => [
    { key: 'dateLabel', label: 'Date', options: [...new Set(this.rows().map((r) => r.dateLabel))] },
    { key: 'meal', label: 'Meal', options: [...MEAL_TYPES] },
    { key: 'canteen', label: 'Canteen', options: this.store.canteens().map((c) => c.name) },
    { key: 'status', label: 'Status', options: ['Confirmed', 'Pending', 'Collected', 'Cancelled', 'No-show'] },
  ]);
  protected readonly today = computed(() => this.store.bookings().filter((b) => b.date === iso(0)));
  protected readonly tomorrow = computed(() => this.store.bookings().filter((b) => b.date === iso(1) && b.status !== 'Cancelled'));
  protected readonly noShows = computed(() => this.store.bookings().filter((b) => b.date === iso(-1) && b.status === 'No-show').length);
  protected readonly cutoff = computed(() => this.store.policies().find((p) => p.id === 'cutoff')?.value ?? '');
  protected readonly slots = computed(() =>
    MEAL_TYPES.flatMap((m) =>
      this.slotsFor(m).map((s) => {
        const cap = m === 'Lunch' ? 60 : 40;
        const base = { Breakfast: [0.82, 0.68, 0.52, 0.36, 0.18], Lunch: [0.58, 0.9, 0.96, 0.72, 0.38], Dinner: [0.48, 0.6, 0.34, 0.2] }[m][this.slotsFor(m).indexOf(s)];
        const booked = Math.round(cap * base) + this.today().filter((b) => b.meal === m && b.slot === s && b.status !== 'Cancelled').length;
        return { label: `${m.slice(0, 1)} · ${s}`, booked: Math.min(cap, booked), cap, pct: Math.min(100, (booked / cap) * 100) };
      }),
    ).slice(0, 14),
  );
  protected readonly popular = computed(() => {
    const m = new Map<string, number>();
    this.tomorrow().forEach((b) => m.set(b.dishId, (m.get(b.dishId) ?? 0) + b.qty));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ dish: this.store.dish(id)!, n }));
  });
  protected readonly dinerOptions = computed(() => {
    const q = (this.form()?.who ?? '').toLowerCase();
    return this.store.diners().filter((p) => !q || `${p.id} ${p.name}`.toLowerCase().includes(q)).slice(0, 30);
  });
  protected readonly diner = computed(() => {
    const w = this.form()?.who ?? '';
    const id = w.split(' · ')[0].trim();
    return this.store.diner(id) ?? null;
  });

  protected count(l: Booking[], s: Booking['status']) {
    return l.filter((b) => b.status === s).length;
  }
  protected pct(a: number, b: number) {
    return b ? Math.round((a / b) * 100) : 0;
  }
  protected slotsFor(m: MealType) {
    return m === 'Breakfast' ? ['07:00', '07:30', '08:00', '08:30', '09:00'] : m === 'Lunch' ? ['12:00', '12:30', '13:00', '13:30', '14:00'] : ['19:00', '19:30', '20:00', '20:30'];
  }
  protected dishesFor(m: MealType) {
    return this.store.dishes().filter((x) => x.available && (x.category === m || (m === 'Dinner' && x.category === 'Lunch')));
  }
  protected patch(ch: Partial<BookForm>) {
    this.form.update((f) => (f ? { ...f, ...ch, slot: ch.meal ? this.slotsFor(ch.meal)[0] : (ch.slot ?? f.slot) } : f));
  }
  protected openNew() {
    this.err.set('');
    const p = this.store.diners()[0];
    this.form.set({ who: `${p.id} · ${p.name}`, date: iso(1), meal: 'Lunch', canteenId: 'CT-01', slot: '12:30', dishId: '' });
  }
  protected save() {
    const f = this.form()!;
    const p = this.diner();
    if (!p) return this.err.set('Select a valid employee from the list.');
    if (p.status === 'Blocked') return this.err.set(`${p.name} is blocked (No Show Policy). Unblock in Meal Entitlement & Wallet.`);
    if (!f.dishId) return this.err.set('Pick a dish.');
    if (f.date === iso(0)) {
      const [h, m] = f.slot.split(':').map(Number);
      const mins = h * 60 + m - (new Date().getHours() * 60 + new Date().getMinutes());
      if (mins < 120) return this.err.set(`Booking cut-off passed (${this.cutoff()}). Choose a later slot or date.`);
    }
    if (this.store.bookings().some((b) => b.dinerId === p.id && b.date === f.date && b.meal === f.meal && b.status !== 'Cancelled')) return this.err.set(`Usage limit: ${p.name} already has a ${f.meal} booking on that day.`);
    const dish = this.store.dish(f.dishId)!;
    const id = this.store.addBooking({ dinerId: p.id, date: f.date, meal: f.meal, dishId: f.dishId, canteenId: f.canteenId, qty: 1, status: 'Confirmed', amount: dish.price, slot: f.slot });
    this.form.set(null);
    this.toastMsg(`${id} confirmed · ${dish.name} for ${p.name} · AED ${dish.price} debited`);
  }
  protected act(a: string, r: BookingRow) {
    this.store.setBooking(r.id, a as Booking['status']);
    this.toastMsg(`${r.id} ${a === 'Cancelled' ? 'cancelled · AED ' + r.amount + ' refunded' : 'marked ' + a.toLowerCase()}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.rows().filter((r) => ids.includes(r.id)));
    ids.forEach((id) => this.store.setBooking(id, a as Booking['status']));
    this.toastMsg(`${ids.length} bookings updated`);
  }
  protected exportCsv(rows = this.rows()) {
    downloadCsv('meal-bookings.csv', [['Booking', 'Employee', 'Emp ID', 'Date', 'Meal', 'Dish', 'Canteen', 'Slot', 'Amount', 'Status'], ...rows.map((r) => [r.id, r.name, r.empId, r.date, r.meal, r.dish, r.canteen, r.slot, r.amount, r.status])]);
  }
}

/* ============================== Meal Entitlement & Wallet ============================== */
interface WalletRow extends Diner {
  plan: string;
  cashLabel: string;
  creditsLabel: string;
}
@Component({
  selector: 'app-meal-entitlement-wallet',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Meal Entitlement &amp; Wallet" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Track meal credits, wallet balances, top-ups and usage for every enrolled user.">
      <button class="btn-primary" (click)="openCredit()"><app-icon name="plus" [size]="16" />Bulk Credit Meals</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Wallets" [value]="fmt(store.diners().length)" icon="m-wallet" color="var(--ka-7c3aed)" change="12%" sub="vs. last month" />
      <app-kpi label="Total Wallet Balance" [value]="'AED ' + fmt(Math.round(totalCash()))" icon="m-coin" color="var(--ka-22c55e)" sub="prepaid top-ups" />
      <app-kpi label="Meal Credits Used (MTD)" [value]="fmt(used())" icon="m-cloche" color="var(--ka-f59e0b)" [sub]="usedPct() + '% of entitlement'" />
      <app-kpi label="Low Balance" [value]="low()" icon="triangle-alert" color="var(--ka-ef4444)" sub="below AED 20" subColor="var(--ka-ef4444)" />
      <app-kpi label="Blocked (No-show)" [value]="blocked()" icon="ban" color="var(--ka-2563eb)" sub="per No Show Policy" subColor="var(--ka-2563eb)" />
    </section>

    <section class="mw" [class.with]="!!sel()">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="wallets" [activeId]="selId()"
          [searchKeys]="['name', 'id', 'dept']" searchPlaceholder="Search name, employee ID, department..." (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      @if (sel(); as p) {
        <aside class="card det">
          <div class="dh"><span class="dt-av lg" [style.background]="p.avatar">{{ p.initials }}</span><div><h3>{{ p.name }}</h3><small class="muted">{{ p.id }} · {{ p.dept }} · {{ p.site }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="wallet">
            <div><small>Wallet balance</small><b>AED {{ money(p.cash) }}</b></div>
            <div><small>Meal credits</small><b>{{ p.credits }} <em>/ {{ p.allowance }}</em></b></div>
            <span class="plan">{{ store.plan(p.planId)?.name }}</span>
          </div>
          <div class="prog"><span>Monthly entitlement used</span><b>{{ p.allowance - p.credits }} of {{ p.allowance }}</b></div>
          <div class="trk"><i [style.width.%]="((p.allowance - p.credits) / (p.allowance || 1)) * 100"></i></div>
          @if (store.plan(p.planId); as pl) {
            <div class="ent">@for (m of mealTypes; track m) {@if (pl.meals[m].includes(true)) {<span><b>{{ m }}</b>{{ daysOf(pl.meals[m]) }}</span>}}</div>
          }
          <div class="btns">
            <button class="btn-primary" (click)="topup.set({ id: p.id, amount: 100 })"><app-icon name="plus" [size]="14" />Top-up</button>
            <button class="btn-ghost" (click)="credit([p.id], 5)">+5 credits</button>
            <button class="btn-ghost" [class.danger]="p.status !== 'Blocked'" (click)="act(p.status === 'Blocked' ? 'unblock' : 'block', p)">{{ p.status === 'Blocked' ? 'Unblock' : 'Block' }}</button>
          </div>
          <h4>Recent Transactions</h4>
          <ul class="tx">
            @for (t of store.txnsOf(p.id).slice(0, 10); track t.id) {
              <li><span class="ti" [class]="'ti ' + t.kind"><app-icon [name]="t.kind === 'Meal' ? 'm-cutlery' : t.kind === 'Top-up' ? 'm-coin' : t.kind === 'Refund' ? 'refresh' : 'plus'" [size]="13" /></span>
                <div><b>{{ t.desc }}</b><small>{{ t.at }} · {{ t.canteen }}</small></div><em [class.good]="t.amount > 0">{{ t.kind === 'Credit' ? '+' + t.amount + ' meals' : (t.amount > 0 ? '+' : '−') + 'AED ' + money(Math.abs(t.amount)) }}</em></li>
            }
          </ul>
        </aside>
      }
    </section>

    @if (topup(); as t) {
      <div class="g-overlay" (click)="topup.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doTopup()">
        <div class="modal-head"><h3>Top-up wallet · {{ store.diner(t.id)?.name }}</h3><button type="button" class="close-btn" (click)="topup.set(null)">×</button></div>
        <div class="amts">@for (a of [50, 100, 200, 500]; track a) {<button type="button" [class.on]="t.amount === a" (click)="topup.set({ id: t.id, amount: a })">AED {{ a }}</button>}</div>
        <div class="form-grid"><label class="full">Custom amount (AED)<input class="input" type="number" min="1" [value]="t.amount" (input)="topup.set({ id: t.id, amount: +$any($event.target).value })" /></label></div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="topup.set(null)">Cancel</button><button class="btn-primary">Top-up AED {{ t.amount }}</button></div>
      </form>
    }
    @if (bulkCredit(); as b) {
      <div class="g-overlay" (click)="bulkCredit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); doBulk()">
        <div class="modal-head"><h3>Bulk Credit Meals</h3><button type="button" class="close-btn" (click)="bulkCredit.set(null)">×</button></div>
        <div class="form-grid">
          <label>Plan<select class="select" [value]="b.planId" (change)="bulkCredit.set({ ...b, planId: $any($event.target).value })"><option value="all">All plans</option>@for (p of store.plans(); track p.id) {<option [value]="p.id">{{ p.name }}</option>}</select></label>
          <label>Meals to credit<input class="input" type="number" min="1" [value]="b.meals" (input)="bulkCredit.set({ ...b, meals: +$any($event.target).value })" /></label>
          <label class="full">Reason<input class="input" [value]="b.reason" (input)="bulkCredit.set({ ...b, reason: $any($event.target).value })" /></label>
        </div>
        <p class="muted">{{ fmt(bulkTargets().length) }} wallets will receive {{ b.meals }} meal credits.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="bulkCredit.set(null)">Cancel</button><button class="btn-primary">Credit {{ fmt(bulkTargets().length * b.meals) }} meals</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 16px; } h4 { margin: 14px 0 6px; font-size: 13px; }
    .mw { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; } .mw.with { grid-template-columns: minmax(0, 1.7fr) minmax(360px, 1fr); } :host ::ng-deep .dt-person b { white-space: nowrap; }
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; }
    .dh { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; } .dh div { display: flex; flex-direction: column; } .lg { width: 48px; height: 48px; font-size: 16px; }
    .wallet { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 16px; border-radius: 12px; color: var(--kf-ffffff); background: linear-gradient(120deg, var(--kb-5b21b6), var(--kb-7c3aed) 55%, var(--kb-a855f7)); }
    .wallet div { display: flex; flex-direction: column; } .wallet small { opacity: 0.8; font-size: 11.5px; } .wallet b { font-size: 22px; } .wallet em { font-style: normal; font-size: 13px; opacity: 0.8; }
    .plan { position: absolute; top: 10px; right: 12px; font-size: 10.5px; background: rgba(255, 255, 255, 0.2); padding: 2px 8px; border-radius: 10px; }
    .prog { display: flex; justify-content: space-between; font-size: 12px; } .trk { height: 8px; background: var(--kb-f1f2f7); border-radius: 5px; overflow: hidden; } .trk i { display: block; height: 100%; background: var(--primary); }
    .ent { display: flex; flex-direction: column; gap: 4px; font-size: 12px; } .ent span { display: flex; gap: 10px; } .ent b { width: 70px; font-weight: 500; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .tx { list-style: none; margin: 0; padding: 0; } .tx li { display: grid; grid-template-columns: 26px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12px; }
    .tx div { display: flex; flex-direction: column; min-width: 0; } .tx small { color: var(--muted); font-size: 11px; } .tx em { font-style: normal; font-weight: 600; white-space: nowrap; }
    .ti { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; background: var(--kb-f3e8ff); color: var(--primary); } .ti.Top-up, .ti.Refund { background: var(--kb-dcfce7); color: var(--kf-16a34a); } .ti.Credit { background: var(--kb-dbeafe); color: var(--kf-2563eb); }
    .amts { display: flex; gap: 8px; margin-bottom: 12px; } .amts button { flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); cursor: pointer; font-weight: 600; } .amts button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
    @media (max-width: 1300px) { .mw.with { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class MealWallet extends MealPage {
  protected readonly Math = Math;
  protected readonly mealTypes = MEAL_TYPES;
  protected readonly selId = signal<string | null>(null);
  protected readonly topup = signal<{ id: string; amount: number } | null>(null);
  protected readonly bulkCredit = signal<{ planId: string; meals: number; reason: string } | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'id' },
    { key: 'site', label: 'Site', sub: 'dept' },
    { key: 'plan', label: 'Meal Plan' },
    { key: 'creditsLabel', label: 'Credits Left' },
    { key: 'cashLabel', label: 'Balance (AED)', kind: 'num' },
    { key: 'diet', label: 'Diet' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'plan', label: 'Plan', options: this.store.plans().map((p) => p.name) },
    { key: 'site', label: 'Site', options: ['Head Office', 'Production', 'Warehouse', 'Remote Site'] },
    { key: 'status', label: 'Status', options: ['Active', 'Low Balance', 'Blocked'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View wallet', icon: 'm-wallet' },
    { id: 'topup', label: 'Top-up', icon: 'm-coin' },
    { id: 'credit', label: 'Add 5 meal credits', icon: 'plus' },
    { id: 'block', label: 'Block', icon: 'ban', danger: true, when: (r) => r.status !== 'Blocked' },
    { id: 'unblock', label: 'Unblock', icon: 'shield-check', when: (r) => r.status === 'Blocked' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'credit', label: '+5 credits' }, { id: 'export', label: 'Export' }];

  protected readonly rows = computed<WalletRow[]>(() => {
    const names = new Map(this.store.plans().map((p) => [p.id, p.name]));
    return this.store.diners().map((p) => ({ ...p, plan: names.get(p.planId) ?? '—', cashLabel: money(p.cash), creditsLabel: `${p.credits} / ${p.allowance}` }));
  });
  protected readonly sel = computed(() => (this.selId() ? (this.store.diner(this.selId()!) ?? null) : null));
  protected readonly totalCash = computed(() => this.store.diners().reduce((a, p) => a + p.cash, 0));
  protected readonly used = computed(() => this.store.diners().reduce((a, p) => a + p.allowance - p.credits, 0));
  protected readonly usedPct = computed(() => Math.round((this.used() / Math.max(1, this.store.diners().reduce((a, p) => a + p.allowance, 0))) * 100));
  protected readonly low = computed(() => this.store.diners().filter((p) => p.status === 'Low Balance').length);
  protected readonly blocked = computed(() => this.store.diners().filter((p) => p.status === 'Blocked').length);
    protected readonly bulkTargets = computed(() => {
    const b = this.bulkCredit();
    return b ? this.store.diners().filter((p) => b.planId === 'all' || p.planId === b.planId) : [];
  });

  protected daysOf(mask: boolean[]) {
    const d = DAYS.filter((_, i) => mask[i]);
    return d.length === 7 ? 'Every day' : d.join(', ');
  }
  protected act(a: string, p: Diner) {
    if (a === 'view') return this.selId.set(p.id);
    if (a === 'topup') return this.topup.set({ id: p.id, amount: 100 });
    if (a === 'credit') return this.credit([p.id], 5);
    this.store.setDinerStatus(p.id, a === 'block' ? 'Blocked' : p.cash < 20 ? 'Low Balance' : 'Active');
    this.toastMsg(`${p.name} ${a === 'block' ? 'blocked from meal booking' : 'unblocked'}`);
  }
  protected credit(ids: string[], n: number) {
    this.store.credit(ids, n);
    this.toastMsg(`${n} meal credits added to ${ids.length === 1 ? this.store.diner(ids[0])?.name : fmt(ids.length) + ' wallets'}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.rows().filter((r) => ids.includes(r.id)));
    this.credit(ids, 5);
  }
  protected doTopup() {
    const t = this.topup()!;
    if (!(t.amount > 0)) return;
    this.store.charge(t.id, 'Top-up', 'Wallet top-up (card)', t.amount);
    this.topup.set(null);
    this.toastMsg(`AED ${t.amount} added · new balance AED ${money(this.store.diner(t.id)!.cash)}`);
  }
  protected openCredit() {
    this.bulkCredit.set({ planId: 'all', meals: 2, reason: 'Ramadan / public holiday compensation' });
  }
  protected doBulk() {
    const b = this.bulkCredit()!;
    const ids = this.bulkTargets().map((p) => p.id);
    this.store.diners.update((l) => l.map((p) => (b.planId === 'all' || p.planId === b.planId ? { ...p, credits: p.credits + b.meals, allowance: p.allowance + b.meals } : p)));
    this.bulkCredit.set(null);
    this.toastMsg(`${fmt(ids.length * b.meals)} meal credits issued to ${fmt(ids.length)} wallets · ${b.reason}`);
  }
  protected exportCsv(rows = this.rows()) {
    downloadCsv('meal-wallets.csv', [['Emp ID', 'Name', 'Department', 'Site', 'Plan', 'Credits', 'Allowance', 'Balance AED', 'Diet', 'Status'], ...rows.map((r) => [r.id, r.name, r.dept, r.site, r.plan, r.credits, r.allowance, r.cash, r.diet, r.status])]);
  }
}
