import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '../../shared/app-state';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { DualChart, Plate } from './meal-ui';
import { ALLERGENS, AVG12, COST12, DIETS, Dish, Feedback, fmt, fmtDay, iso, MEALS12, MealStore, money, MONTHS12, COST_SCALE } from './meals.data';

abstract class MealPage {
  protected readonly store = inject(MealStore);
  protected readonly app = inject(AppState);
  protected readonly router = inject(Router);
  protected readonly fmt = fmt;
  protected readonly money = money;
  protected readonly Math = Math;
  protected readonly toast = signal<string | null>(null);
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2600);
  }
  protected go(sub: string) {
    this.router.navigateByUrl(`/meal-canteen-management/${sub}`);
  }
}
const WORK_DAYS = 22;
const SCALE = COST_SCALE;

/* ============================== Subsidy & Pricing ============================== */
@Component({
  selector: 'app-subsidy-pricing',
  imports: [...UI, Plate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Subsidy &amp; Pricing" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Set company subsidy levels per meal plan, manage dish prices and forecast monthly meal spend.">
      <button class="btn-primary" (click)="apply()" [disabled]="!dirty()"><app-icon name="file-check" [size]="16" />Apply Changes</button>
      <button class="btn-ghost" (click)="revert()" [disabled]="!dirty()"><app-icon name="refresh" [size]="16" />Revert</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Monthly Meal Cost" [value]="'AED ' + fmt(company() + employee())" icon="m-coin" color="#ef4444" change="5%" [up]="false" [good]="false" sub="vs. last month" />
      <app-kpi label="Company Subsidy" [value]="'AED ' + fmt(company())" icon="building" color="#7c3aed" [sub]="'at ' + avgSub() + '% weighted subsidy'" />
      <app-kpi label="Employee Contribution" [value]="'AED ' + fmt(employee())" icon="users" color="#22c55e" sub="payroll / wallet deductions" />
      <app-kpi label="Avg. Cost per Meal" [value]="'AED ' + avgMeal()" icon="m-cloche" color="#f59e0b" change="4%" sub="vs. last month" />
      <app-kpi label="Budget Utilization" [value]="budgetPct() + '%'" icon="m-gauge" color="#2563eb" [sub]="'of AED ' + fmt(budget()) + ' budget'" subColor="#2563eb" />
    </section>

    <section class="sp">
      <div class="card">
        <div class="card-head"><h3>Subsidy by Meal Plan</h3>@if (dirty()) {<span class="tag amber">Unsaved changes — forecast updated</span>}</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Plan</th><th class="num">Price / day</th><th style="width:150px">Subsidy</th><th class="num">Company/day</th><th class="num">Employee/day</th><th class="num">Enrolled</th><th class="num">Monthly (AED)</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td><span class="pn"><span class="pi" [style.background]="r.color"><app-icon [name]="r.icon" [size]="13" /></span><b>{{ r.name }}</b>@if (r.status !== 'Active') {<span class="tag grey">Inactive</span>}</span></td>
                <td class="num"><input class="input pr" type="number" min="0" step="0.5" [value]="r.price" (input)="edit(r.id, 'price', +$any($event.target).value)" /></td>
                <td><span class="sl"><input type="range" min="0" max="100" step="5" [value]="r.subsidy" (input)="edit(r.id, 'subsidy', +$any($event.target).value)" /><b>{{ r.subsidy }}%</b></span></td>
                <td class="num">{{ money(r.price * r.subsidy / 100) }}</td>
                <td class="num">{{ money(r.price * (100 - r.subsidy) / 100) }}</td>
                <td class="num">{{ fmt(r.enrolled) }}</td>
                <td class="num"><b>{{ fmt(r.monthly) }}</b></td>
              </tr>
            }
            <tr class="tot"><td>Total</td><td></td><td>{{ avgSub() }}% weighted</td><td></td><td></td><td class="num">{{ fmt(store.enrolled()) }}</td><td class="num"><b>{{ fmt(company()) }}</b></td></tr>
          </tbody>
        </table></div>
        <div class="two">
          <div>
            <h4>Company vs Employee Share (AED / month)</h4>
            <app-column-chart [labels]="shortNames()" [series]="share()" [stacked]="true" [height]="200" />
          </div>
          <div>
            <h4>Budget</h4>
            <label class="bud">Monthly subsidy budget (AED)<input class="input" type="number" step="1000" [value]="budget()" (input)="budget.set(+$any($event.target).value)" /></label>
            <div class="meter"><i [style.width.%]="Math.min(100, budgetPct())" [style.background]="budgetPct() > 100 ? '#ef4444' : budgetPct() > 90 ? '#f59e0b' : '#22c55e'"></i></div>
            <p class="muted">{{ budgetPct() > 100 ? 'Forecast exceeds budget by AED ' + fmt(company() - budget()) : 'AED ' + fmt(budget() - company()) + ' headroom this month' }}</p>
            <h4>Scenario</h4>
            <div class="scn">@for (s of [-10, -5, 5, 10]; track s) {<button class="btn-ghost sm" (click)="shift(s)">{{ s > 0 ? '+' : '' }}{{ s }}% subsidy</button>}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Dish Price List</h3><select class="select" [value]="planId()" (change)="planId.set($any($event.target).value)">@for (p of store.plans(); track p.id) {<option [value]="p.id">{{ p.name }} price</option>}</select></div>
        <ul class="pl">
          @for (x of store.dishes(); track x.id) {
            <li><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="30" /><span><b>{{ x.name }}</b><small>{{ x.category }}</small></span>
              <input class="input pr" type="number" min="0" step="0.5" [value]="x.price" (change)="setPrice(x, +$any($event.target).value)" title="Base price (AED)" />
              <em>AED {{ money(x.price * (100 - planSubsidy()) / 100) }}</em></li>
          }
        </ul>
        <p class="muted small">Base price editable · right column = employee price under the selected plan's subsidy ({{ planSubsidy() }}%).</p>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } h4 { margin: 14px 0 8px; font-size: 13px; }
    .sp { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .pn { display: inline-flex; gap: 8px; align-items: center; } .pi { width: 22px; height: 22px; border-radius: 5px; display: grid; place-items: center; color: #fff; }
    .pr { width: 64px; padding: 4px 6px; text-align: right; } .sp .table th, .sp .table td { padding: 8px 7px; } .sl { display: flex; gap: 8px; align-items: center; } .sl input { flex: 1; accent-color: var(--primary); } .sl b { width: 36px; text-align: right; } .sl input { min-width: 70px; }
    .tot td { background: #fafafe; font-weight: 600; }
    .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
    .bud { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b4f6b; margin-bottom: 10px; }
    .meter { height: 10px; border-radius: 6px; background: #f1f2f7; overflow: hidden; } .meter i { display: block; height: 100%; }
    .scn { display: flex; flex-wrap: wrap; gap: 6px; }
    .pl { list-style: none; margin: 0; padding: 0; max-height: 640px; overflow: auto; } .pl li { display: grid; grid-template-columns: 30px 1fr 74px 78px; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; }
    .pl span { display: flex; flex-direction: column; min-width: 0; } .pl small { color: var(--muted); } .pl em { font-style: normal; text-align: right; font-weight: 600; color: var(--primary); } .small { font-size: 11.5px; }
    @media (max-width: 1350px) { .sp { grid-template-columns: 1fr; } }
  `,
})
export class SubsidyPricing extends MealPage {
  protected readonly edits = signal<Record<string, { price?: number; subsidy?: number }>>({});
  protected readonly budget = signal(52000);
  protected readonly planId = signal('MP-01');
  protected readonly dirty = computed(() => Object.keys(this.edits()).length > 0);
  protected readonly rows = computed(() =>
    this.store.plans().map((p) => {
      const e = this.edits()[p.id] ?? {};
      const price = e.price ?? p.price;
      const subsidy = e.subsidy ?? p.subsidy;
      const active = p.status === 'Active';
            return { ...p, price, subsidy, monthly: active ? Math.round(price * WORK_DAYS * p.enrolled * (subsidy / 100) * SCALE) : 0 };
    }),
  );
  protected readonly company = computed(() => this.rows().reduce((a, r) => a + r.monthly, 0));
  protected readonly employee = computed(() => this.rows().reduce((a, r) => a + (r.status === 'Active' ? Math.round(r.price * WORK_DAYS * r.enrolled * ((100 - r.subsidy) / 100) * SCALE) : 0), 0));
  protected readonly avgSub = computed(() => {
    const r = this.rows();
    return Math.round(r.reduce((a, x) => a + x.subsidy * x.enrolled, 0) / Math.max(1, r.reduce((a, x) => a + x.enrolled, 0)));
  });
  protected readonly avgMeal = computed(() => AVG12[AVG12.length - 1].toFixed(2));
  protected readonly budgetPct = computed(() => Math.round((this.company() / Math.max(1, this.budget())) * 100));
  protected readonly shortNames = computed(() => this.rows().map((r) => r.name.replace(' Plan', '')));
  protected readonly share = computed(() => [
    { name: 'Company', color: '#7c3aed', values: this.rows().map((r) => r.monthly) },
    { name: 'Employee', color: '#c4b5fd', values: this.rows().map((r) => (r.status === 'Active' ? Math.round(r.price * WORK_DAYS * r.enrolled * ((100 - r.subsidy) / 100) * SCALE) : 0)) },
  ]);
  protected readonly planSubsidy = computed(() => this.rows().find((r) => r.id === this.planId())?.subsidy ?? 0);

  protected edit(id: string, k: 'price' | 'subsidy', v: number) {
    this.edits.update((e) => ({ ...e, [id]: { ...e[id], [k]: Math.max(0, k === 'subsidy' ? Math.min(100, v) : v) } }));
  }
  protected shift(d: number) {
    this.rows().forEach((r) => this.edit(r.id, 'subsidy', Math.max(0, Math.min(100, r.subsidy + d))));
  }
  protected apply() {
    Object.entries(this.edits()).forEach(([id, e]) => this.store.patchPlan(id, e));
    const n = Object.keys(this.edits()).length;
    this.edits.set({});
    this.toastMsg(`Pricing updated for ${n} plan${n > 1 ? 's' : ''} · effective from next billing cycle`);
  }
  protected revert() {
    this.edits.set({});
  }
  protected setPrice(x: Dish, v: number) {
    if (!(v > 0)) return;
    this.store.saveDish({ ...x, price: v });
    this.toastMsg(`${x.name} price set to AED ${v}`);
  }
  protected exportCsv() {
    downloadCsv('subsidy-pricing.csv', [['Plan', 'Price/day', 'Subsidy %', 'Company/day', 'Employee/day', 'Enrolled', 'Monthly company cost'], ...this.rows().map((r) => [r.name, r.price, r.subsidy, (r.price * r.subsidy) / 100, (r.price * (100 - r.subsidy)) / 100, r.enrolled, r.monthly])]);
  }
}

/* ============================== Allergen & Nutritional Info ============================== */
@Component({
  selector: 'app-allergen-nutritional-info',
  imports: [...UI, Plate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Allergen &amp; Nutritional Info" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Allergen matrix, nutrition facts and dietary labels for every dish, with alerts for sensitive diners.">
      <button class="btn-primary" (click)="alertAll()"><app-icon name="bell-ring" [size]="16" />Send Allergen Alerts</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export Matrix</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Dishes Labelled" [value]="store.dishes().length + ' / ' + store.dishes().length" icon="file-check" color="#7c3aed" sub="100% allergen coverage" />
      <app-kpi label="Allergen-free Dishes" [value]="free()" icon="shield-check" color="#22c55e" [sub]="'none of the ' + allergens.length + ' major allergens'" />
      <app-kpi label="Vegan / Vegetarian" [value]="vegan() + ' / ' + veg()" icon="m-leaf" color="#f59e0b" sub="plant-based options" />
      <app-kpi label="Diners with Dietary Needs" [value]="fmt(dietary())" icon="users" color="#ef4444" [sub]="pctDiet() + '% of enrolled users'" />
      <app-kpi label="Allergen Alerts Today" [value]="alerts()" icon="triangle-alert" color="#2563eb" [sub]="'policy: ' + alertPolicy()" subColor="#2563eb" />
    </section>

    <section class="al">
      <div class="card">
        <div class="card-head">
          <h3>Allergen Matrix</h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search dish..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" [value]="diet()" (change)="diet.set($any($event.target).value)"><option>All diets</option>@for (d of diets; track d) {<option>{{ d }}</option>}</select>
          </div>
        </div>
        <div class="excl"><span>Exclude allergens:</span>@for (a of allergens; track a) {<button [class.on]="excl().has(a)" (click)="toggleEx(a)">{{ a }}</button>}@if (excl().size) {<button class="link" (click)="clearEx()">Clear</button>}</div>
        <div class="table-wrap">
          <table class="table mx">
            <thead><tr><th>Dish</th><th class="num">kcal</th>@for (a of allergens; track a) {<th class="c"><span class="vt">{{ a }}</span></th>}<th>Diet</th></tr></thead>
            <tbody>
              @for (x of list(); track x.id) {
                <tr class="clickable" [class.selected]="selId() === x.id" (click)="selId.set(x.id)">
                  <td><span class="dn"><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="26" />{{ x.name }}</span></td>
                  <td class="num">{{ x.kcal }}</td>
                  @for (a of allergens; track a) {<td class="c">@if (x.allergens.includes(a)) {<i class="dot" title="Contains {{ a }}"></i>}</td>}
                  <td>@for (t of x.diets; track t) {<span class="dg" [title]="t">{{ t === 'Gluten Free' ? 'GF' : t === 'Vegetarian' ? 'V' : t === 'Vegan' ? 'VG' : 'H' }}</span>}</td>
                </tr>
              } @empty {<tr><td [attr.colspan]="allergens.length + 3" class="empty-note">No dishes are free of the selected allergens.</td></tr>}
            </tbody>
          </table>
        </div>
        <p class="muted small">● contains allergen · H Halal · V Vegetarian · VG Vegan · GF Gluten Free — {{ list().length }} of {{ store.dishes().length }} dishes shown</p>
      </div>

      @if (sel(); as x) {
        <aside class="card det">
          <div class="dh"><app-plate [emoji]="x.emoji" [bg]="x.bg" [size]="64" /><div><h3>{{ x.name }}</h3><small class="muted">{{ x.category }} · {{ x.cuisine }} · AED {{ x.price }}</small></div></div>
          <div class="nut">
            <app-donut [segments]="macros(x)" center="kcal" [value]="'' + x.kcal" [size]="130" [legend]="false" />
            <ul>@for (m of macros(x); track m.label) {<li><i [style.background]="m.color"></i>{{ m.label }}<b>{{ grams(x, m.label) }} g</b><em>{{ m.value }} kcal</em></li>}</ul>
          </div>
          <h4>Allergens</h4>
          <div class="chips">
            @for (a of allergens; track a) {<button [class.on]="x.allergens.includes(a)" (click)="toggleAllergen(x, a)" [title]="'Toggle ' + a">{{ x.allergens.includes(a) ? '⚠ ' : '' }}{{ a }}</button>}
          </div>
          <h4>Dietary Labels</h4>
          <div class="chips g">@for (d of diets; track d) {<button [class.on]="x.diets.includes(d)" (click)="toggleDiet(x, d)">{{ d }}</button>}</div>
          <h4>Diners at Risk</h4>
          <p class="muted">{{ atRisk(x) }} enrolled diners have a dietary profile conflicting with this dish.</p>
          <button class="btn-ghost" (click)="notify(x)"><app-icon name="bell-ring" [size]="14" />Notify affected diners</button>
        </aside>
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } h4 { margin: 12px 0 6px; font-size: 13px; }
    .al { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .excl { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 12px; margin-bottom: 10px; } .excl button:not(.link) { border: 1px solid var(--border); background: #fff; border-radius: 14px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; } .excl button.on { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
    .mx th, .mx td { padding: 5px 6px; } .mx .c { text-align: center; } .vt { font-size: 10.5px; font-weight: 500; }
    .dn { display: inline-flex; gap: 8px; align-items: center; } .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ef4444; }
    .dg { display: inline-block; font-size: 9.5px; font-weight: 600; padding: 1px 4px; border-radius: 4px; background: #dcfce7; color: #15803d; margin-right: 2px; }
    .small { font-size: 11.5px; margin: 8px 0 0; }
    .det { position: sticky; top: 76px; } .dh { display: flex; gap: 12px; align-items: center; } .dh div { display: flex; flex-direction: column; }
    .nut { display: flex; gap: 12px; align-items: center; margin-top: 10px; } .nut ul { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .nut li { display: grid; grid-template-columns: 10px 1fr auto 60px; gap: 6px; align-items: center; font-size: 12px; } .nut i { width: 9px; height: 9px; border-radius: 50%; } .nut em { font-style: normal; color: var(--muted); text-align: right; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; } .chips button { border: 1px solid var(--border); background: #fff; border-radius: 14px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; }
    .chips button.on { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; } .chips.g button.on { background: #dcfce7; border-color: #86efac; color: #15803d; }
    @media (max-width: 1350px) { .al { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class AllergenInfo extends MealPage {
  protected readonly allergens = ALLERGENS;
  protected readonly diets = DIETS;
  protected readonly q = signal('');
  protected readonly diet = signal('All diets');
  protected readonly excl = signal<Set<string>>(new Set());
  protected readonly selId = signal('D007');
  protected readonly sel = computed(() => this.store.dish(this.selId()) ?? null);
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.dishes().filter((x) => (!q || x.name.toLowerCase().includes(q)) && (this.diet() === 'All diets' || x.diets.includes(this.diet())) && !x.allergens.some((a) => this.excl().has(a)));
  });
  protected readonly free = computed(() => this.store.dishes().filter((x) => !x.allergens.length).length);
  protected readonly vegan = computed(() => this.store.dishes().filter((x) => x.diets.includes('Vegan')).length);
  protected readonly veg = computed(() => this.store.dishes().filter((x) => x.diets.includes('Vegetarian') || x.diets.includes('Vegan')).length);
  protected readonly dietary = computed(() => this.store.diners().filter((p) => p.diet !== 'None').length);
  protected readonly pctDiet = computed(() => Math.round((this.dietary() / Math.max(1, this.store.diners().length)) * 100));
  protected readonly alerts = computed(() => 37 + Math.floor(this.app.tick() / 6));
  protected readonly alertPolicy = computed(() => this.store.policies().find((p) => p.id === 'allergen')?.value ?? '');

  protected clearEx() {
    this.excl.set(new Set());
  }
  protected toggleEx(a: string) {
    this.excl.update((s) => {
      const n = new Set(s);
      n.has(a) ? n.delete(a) : n.add(a);
      return n;
    });
  }
  protected macros(x: Dish) {
    return [
      { label: 'Protein', value: x.protein * 4, color: '#7c3aed' },
      { label: 'Carbs', value: x.carbs * 4, color: '#f59e0b' },
      { label: 'Fat', value: x.fat * 9, color: '#22c55e' },
    ];
  }
  protected grams(x: Dish, l: string) {
    return l === 'Protein' ? x.protein : l === 'Carbs' ? x.carbs : x.fat;
  }
  protected atRisk(x: Dish) {
    const veg = !x.diets.includes('Vegetarian') && !x.diets.includes('Vegan');
    return this.store.diners().filter((p) => (p.diet === 'Gluten Free' && x.allergens.includes('Gluten')) || (p.diet === 'Nut Allergy' && (x.allergens.includes('Nuts') || x.allergens.includes('Peanuts'))) || ((p.diet === 'Vegetarian' || p.diet === 'Vegan') && veg) || (p.diet === 'Vegan' && !x.diets.includes('Vegan'))).length;
  }
  protected toggleAllergen(x: Dish, a: string) {
    this.store.saveDish({ ...x, allergens: x.allergens.includes(a) ? x.allergens.filter((y) => y !== a) : [...x.allergens, a] });
  }
  protected toggleDiet(x: Dish, d: string) {
    this.store.saveDish({ ...x, diets: x.diets.includes(d) ? x.diets.filter((y) => y !== d) : [...x.diets, d] });
  }
  protected notify(x: Dish) {
    this.toastMsg(`Allergen notice for ${x.name} sent to ${this.atRisk(x)} diners (app + email)`);
  }
  protected alertAll() {
    this.toastMsg(`Today's allergen summary pushed to ${fmt(this.dietary())} diners with dietary profiles`);
  }
  protected exportCsv() {
    downloadCsv('allergen-matrix.csv', [['Dish', 'kcal', 'Protein g', 'Carbs g', 'Fat g', ...ALLERGENS, 'Diets'], ...this.store.dishes().map((x) => [x.name, x.kcal, x.protein, x.carbs, x.fat, ...ALLERGENS.map((a) => (x.allergens.includes(a) ? 'Y' : '')), x.diets.join('; ')])]);
  }
}

/* ============================== Feedback & Ratings ============================== */
@Component({
  selector: 'app-feedback-ratings',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Feedback &amp; Ratings" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Collect and act on diner feedback for dishes, canteens and service quality.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />Log Feedback</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Average Rating" [value]="store.avgRating() + ' / 5'" icon="star" color="#7c3aed" change="0.2" sub="vs. last month" />
      <app-kpi label="Reviews (14 days)" [value]="store.feedback().length" icon="message" color="#22c55e" change="18%" sub="vs. prior period" />
      <app-kpi label="Positive (4–5 ★)" [value]="positive() + '%'" icon="trending-up" color="#f59e0b" sub="of all reviews" />
      <app-kpi label="Escalated" [value]="count('Escalated')" icon="triangle-alert" color="#ef4444" sub="hygiene / service issues" subColor="#ef4444" />
      <app-kpi label="Response Rate" [value]="respRate() + '%'" icon="message" color="#2563eb" [sub]="count('New') + ' awaiting reply'" subColor="#2563eb" />
    </section>

    <section class="fb">
      <div class="col">
        <div class="card">
          <h3>Rating Distribution</h3>
          @for (r of dist(); track r.star) {
            <button class="rd" [class.on]="rating() === r.star" (click)="rating.set(rating() === r.star ? 0 : r.star)"><span>{{ r.star }} ★</span><div class="trk"><i [style.width.%]="r.pct" [style.background]="r.star >= 4 ? '#22c55e' : r.star === 3 ? '#f59e0b' : '#ef4444'"></i></div><b>{{ r.n }}</b></button>
          }
        </div>
        <div class="card">
          <h3>Rating by Canteen</h3>
          @for (c of byCanteen(); track c.id) {
            <button class="rc" [class.on]="canteen() === c.id" (click)="canteen.set(canteen() === c.id ? '' : c.id)"><span>{{ c.name }}</span><b>{{ c.avg }}</b><span class="stars">@for (s of [1, 2, 3, 4, 5]; track s) {<i [class.on]="s <= Math.round(+c.avg)">★</i>}</span><small>{{ c.n }} reviews</small></button>
          }
        </div>
        <div class="card">
          <h3>By Category</h3>
          <app-donut [segments]="cats()" center="Reviews" [size]="130" />
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Latest Feedback</h3>
          <div class="toolbar">
            <div class="tabs">@for (s of ['All', 'New', 'Escalated', 'Responded']; track s) {<button [class.on]="status() === s" (click)="status.set(s)">{{ s }}</button>}</div>
            @if (rating() || canteen()) {<button class="link" (click)="rating.set(0); canteen.set('')">Clear filters</button>}
          </div>
        </div>
        <ul class="fl">
          @for (f of list(); track f.id) {
            @let p = store.diner(f.dinerId);
            <li>
              <span class="dt-av" [style.background]="p?.avatar">{{ p?.initials }}</span>
              <div class="fm">
                <div class="fh"><b>{{ p?.name }}</b><span class="stars">@for (s of [1, 2, 3, 4, 5]; track s) {<i [class.on]="s <= f.rating">★</i>}</span><span class="tag grey">{{ f.category }}</span><span [class]="tagCls(f.status)">{{ f.status }}</span><small class="muted">{{ fd(f.date) }}</small></div>
                <p>{{ f.comment }}</p>
                <small class="muted">{{ store.dish(f.dishId)?.emoji }} {{ store.dish(f.dishId)?.name }} · {{ store.canteen(f.canteenId)?.name }}</small>
                @if (f.reply) {<div class="reply"><app-icon name="message" [size]="12" />{{ f.reply }}</div>}
              </div>
              <div class="fa">
                @if (f.status !== 'Responded') {<button class="btn-ghost sm" (click)="reply.set({ id: f.id, text: '' })">Reply</button>}
                @if (f.status === 'New' && f.rating <= 2) {<button class="btn-ghost sm danger" (click)="escalate(f)">Escalate</button>}
              </div>
            </li>
          } @empty {<li class="muted">No feedback matches.</li>}
        </ul>
      </div>
    </section>

    @if (reply(); as r) {
      <div class="g-overlay" (click)="reply.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendReply()">
        <div class="modal-head"><h3>Reply to feedback {{ r.id }}</h3><button type="button" class="close-btn" (click)="reply.set(null)">×</button></div>
        <div class="tpl">@for (t of templates; track t) {<button type="button" class="chip-s" (click)="reply.set({ id: r.id, text: t })">{{ t.slice(0, 38) }}…</button>}</div>
        <textarea class="input" rows="4" style="width:100%" [value]="r.text" (input)="reply.set({ id: r.id, text: $any($event.target).value })" placeholder="Write a reply…"></textarea>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="reply.set(null)">Cancel</button><button class="btn-primary" [disabled]="!r.text.trim()">Send Reply</button></div>
      </form>
    }
    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveNew()">
        <div class="modal-head"><h3>Log Feedback</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label>Canteen<select class="select" [value]="f.canteenId" (change)="setF({ canteenId: $any($event.target).value })">@for (c of store.canteens(); track c.id) {<option [value]="c.id">{{ c.name }}</option>}</select></label>
          <label>Dish<select class="select" [value]="f.dishId" (change)="setF({ dishId: $any($event.target).value })">@for (x of store.dishes(); track x.id) {<option [value]="x.id">{{ x.name }}</option>}</select></label>
          <label>Category<select class="select" [value]="f.category" (change)="setF({ category: $any($event.target).value })">@for (c of ['Taste', 'Hygiene', 'Service', 'Quantity', 'Variety']; track c) {<option>{{ c }}</option>}</select></label>
          <div class="rate"><span>Rating</span><div>@for (s of [1, 2, 3, 4, 5]; track s) {<button type="button" [class.on]="s <= f.rating" (click)="setF({ rating: s })">★</button>}</div></div>
          <label class="full">Comment<textarea class="input" rows="3" [value]="f.comment" (input)="setF({ comment: $any($event.target).value })"></textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" [disabled]="!f.comment.trim()">Submit</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0 0 10px; font-size: 15px; }
    .fb { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 12px; align-items: start; } .col { display: flex; flex-direction: column; gap: 12px; }
    .rd, .rc { display: grid; width: 100%; border: 0; background: none; padding: 5px 4px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12.5px; align-items: center; text-align: left; } .rd.on, .rc.on { background: var(--primary-soft); }
    .rd { grid-template-columns: 34px 1fr 34px; gap: 8px; } .rd b { text-align: right; font-weight: 500; } .trk { height: 9px; border-radius: 5px; background: #f1f2f7; overflow: hidden; } .trk i { display: block; height: 100%; }
    .rc { grid-template-columns: 1fr 30px auto; gap: 2px 8px; } .rc small { grid-column: 1; color: var(--muted); font-size: 11px; }
    .stars i { font-style: normal; color: #e5e7eb; font-size: 13px; } .stars i.on { color: #f59e0b; }
    .fl { list-style: none; margin: 0; padding: 0; } .fl li { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f1f6; }
    .fm { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 12.5px; } .fh { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .fm p { margin: 0; }
    .reply { display: flex; gap: 6px; align-items: center; font-size: 12px; background: #f6f3ff; color: #5b21b6; border-radius: 6px; padding: 5px 8px; }
    .fa { display: flex; flex-direction: column; gap: 6px; }
    .tpl { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; } .tpl button { border: 0; cursor: pointer; }
    .rate { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b4f6b; } .rate button { border: 0; background: none; font-size: 22px; color: #e5e7eb; cursor: pointer; padding: 0 2px; } .rate button.on { color: #f59e0b; }
    @media (max-width: 1250px) { .fb { grid-template-columns: 1fr; } }
  `,
})
export class MealFeedback extends MealPage {
  protected readonly fd = fmtDay;
  protected readonly status = signal('All');
  protected readonly rating = signal(0);
  protected readonly canteen = signal('');
  protected readonly reply = signal<{ id: string; text: string } | null>(null);
  protected readonly form = signal<Omit<Feedback, 'id'> | null>(null);
  protected readonly templates = ['Thank you for your feedback — we have shared it with the kitchen team.', 'Sorry about this experience. The canteen manager will follow up today.', 'Great to hear you enjoyed it! We will keep it on the menu.'];
  protected readonly list = computed(() => this.store.feedback().filter((f) => (this.status() === 'All' || f.status === this.status()) && (!this.rating() || f.rating === this.rating()) && (!this.canteen() || f.canteenId === this.canteen())));
  protected readonly positive = computed(() => Math.round((this.store.feedback().filter((f) => f.rating >= 4).length / Math.max(1, this.store.feedback().length)) * 100));
  protected readonly respRate = computed(() => Math.round((this.count('Responded') / Math.max(1, this.store.feedback().length)) * 100));
  protected readonly dist = computed(() => {
    const l = this.store.feedback();
    return [5, 4, 3, 2, 1].map((star) => {
      const n = l.filter((f) => f.rating === star).length;
      return { star, n, pct: (n / Math.max(1, l.length)) * 100 };
    });
  });
  protected readonly byCanteen = computed(() =>
    this.store.canteens().map((c) => {
      const l = this.store.feedback().filter((f) => f.canteenId === c.id);
      return { id: c.id, name: c.name, n: l.length, avg: l.length ? (l.reduce((a, f) => a + f.rating, 0) / l.length).toFixed(1) : '—' };
    }),
  );
  protected readonly cats = computed(() => {
    const colors: Record<string, string> = { Taste: '#7c3aed', Service: '#3b82f6', Quantity: '#f59e0b', Variety: '#22c55e', Hygiene: '#ef4444' };
    return Object.keys(colors).map((k) => ({ label: k, value: this.store.feedback().filter((f) => f.category === k).length, color: colors[k] }));
  });
  protected count(s: Feedback['status']) {
    return this.store.feedback().filter((f) => f.status === s).length;
  }
  protected tagCls(s: string) {
    return s === 'Responded' ? 'tag green' : s === 'Escalated' ? 'tag red' : 'tag blue';
  }
  protected sendReply() {
    const r = this.reply()!;
    if (!r.text.trim()) return;
    this.store.respond(r.id, r.text.trim());
    this.reply.set(null);
    this.toastMsg(`Reply sent for ${r.id}`);
  }
  protected escalate(f: Feedback) {
    this.store.respond(f.id, `Escalated to ${this.store.canteen(f.canteenId)?.manager} (canteen manager)`, 'Escalated');
    this.toastMsg(`${f.id} escalated to ${this.store.canteen(f.canteenId)?.manager}`);
  }
  protected openNew() {
    this.form.set({ dinerId: this.store.diners()[3].id, canteenId: 'CT-01', dishId: 'D007', rating: 4, category: 'Taste', comment: '', date: iso(0), status: 'New' });
  }
  protected setF(ch: Partial<Omit<Feedback, 'id'>>) {
    this.form.update((f) => (f ? { ...f, ...ch } : f));
  }
  protected saveNew() {
    const f = this.form()!;
    if (!f.comment.trim()) return;
    this.store.addFeedback({ ...f, status: f.rating <= 1 ? 'Escalated' : 'New' });
    this.form.set(null);
    this.status.set('All');
    this.toastMsg('Feedback logged');
  }
  protected exportCsv() {
    downloadCsv('meal-feedback.csv', [['ID', 'Date', 'Employee', 'Canteen', 'Dish', 'Rating', 'Category', 'Comment', 'Status', 'Reply'], ...this.store.feedback().map((f) => [f.id, f.date, this.store.diner(f.dinerId)?.name ?? '', this.store.canteen(f.canteenId)?.name ?? '', this.store.dish(f.dishId)?.name ?? '', f.rating, f.category, f.comment, f.status, f.reply ?? ''])]);
  }
}

/* ============================== Reports & Analytics ============================== */
interface Report {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  freq: string;
  scheduled: boolean;
  last: string;
}
@Component({
  selector: 'app-reports-analytics',
  imports: [...UI, DualChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Reports &amp; Analytics" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Meal consumption, cost, canteen utilization and satisfaction trends with exportable reports.">
      <select class="select" [value]="range()" (change)="range.set($any($event.target).value)"><option>Last 6 Months</option><option>Last 12 Months</option><option>Last 3 Months</option></select>
      <button class="btn-primary" (click)="genAll()"><app-icon name="download" [size]="16" />Download Pack</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Meals Served" [value]="fmt(sum(meals()))" icon="m-cloche" color="#7c3aed" change="6%" [sub]="'in ' + range().toLowerCase()" />
      <app-kpi label="Total Meal Cost" [value]="'AED ' + fmt(sum(costs()))" icon="m-coin" color="#ef4444" change="3%" [up]="false" sub="vs. prior period" />
      <app-kpi label="Avg. Cost per Meal" [value]="'AED ' + avg()" icon="m-gauge" color="#f59e0b" sub="company + employee" />
      <app-kpi label="Plan Uptake" [value]="uptake() + '%'" icon="users" color="#22c55e" change="4%" sub="of eligible workforce" />
      <app-kpi label="Food Waste" value="6.8%" icon="m-leaf" color="#2563eb" change="1.2%" [up]="false" sub="vs. prior period" />
    </section>

    <section class="rp">
      <div class="card"><div class="card-head"><h3>Meal Cost Analysis</h3></div><app-dual-chart [labels]="labels()" [bars]="costs()" [line]="avgs()" [height]="220" /></div>
      <div class="card"><div class="card-head"><h3>Meals Served by Type</h3></div><app-column-chart [labels]="labels()" [series]="byType()" [stacked]="true" [height]="236" /></div>
      <div class="card"><div class="card-head"><h3>Enrollment by Plan</h3></div><app-donut [segments]="planSegs()" center="Enrolled" [size]="140" /></div>
      <div class="card"><div class="card-head"><h3>Canteen Utilization</h3><button class="link" (click)="go('canteen-locations')">Details</button></div>
        <app-bar-list [rows]="util()" [max]="100" />
        <h4>Satisfaction Trend</h4>
        <app-line-chart [labels]="labels()" [series]="sat()" [height]="140" [min]="3" [max]="5" [legend]="false" />
      </div>
    </section>

    <div class="card">
      <div class="card-head"><h3>Report Library</h3><span class="muted">{{ scheduledCount() }} scheduled</span></div>
      <div class="lib">
        @for (r of reports(); track r.id) {
          <div class="rep">
            <span class="ri" [style.background]="r.color + '1a'" [style.color]="r.color"><app-icon [name]="r.icon" [size]="18" /></span>
            <div><b>{{ r.name }}</b><small>{{ r.desc }}</small><small class="muted">Last generated {{ r.last }}</small></div>
            <div class="ra">
              <button class="btn-ghost sm" (click)="gen(r)"><app-icon name="download" [size]="13" />CSV</button>
              <label class="sch"><button class="tgl" [class.on]="r.scheduled" (click)="toggleSch(r)"><i></i></button>{{ r.freq }}</label>
            </div>
          </div>
        }
      </div>
    </div>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    h3 { margin: 0; font-size: 15px; } h4 { margin: 14px 0 4px; font-size: 13px; }
    .rp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 10px; }
    .rep { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
    .rep div { display: flex; flex-direction: column; font-size: 12.5px; min-width: 0; } .rep small { font-size: 11px; color: #4b4f6b; }
    .ri { width: 38px; height: 38px; border-radius: 9px; display: grid; place-items: center; }
    .ra { align-items: flex-end; gap: 6px; } .sch { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--muted); }
    .tgl { width: 30px; height: 17px; border-radius: 10px; border: 0; background: #d1d5db; position: relative; cursor: pointer; padding: 0; } .tgl i { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; transition: left 0.15s; } .tgl.on { background: #22c55e; } .tgl.on i { left: 15px; }
    @media (max-width: 1100px) { .rp { grid-template-columns: 1fr; } }
  `,
})
export class MealReports extends MealPage {
  protected readonly range = signal('Last 6 Months');
  protected readonly n = computed(() => (this.range() === 'Last 12 Months' ? 12 : this.range() === 'Last 3 Months' ? 3 : 6));
  protected readonly labels = computed(() => MONTHS12.slice(-this.n()));
  protected readonly costs = computed(() => COST12.slice(-this.n()));
  protected readonly avgs = computed(() => AVG12.slice(-this.n()));
  protected readonly meals = computed(() => MEALS12.slice(-this.n()));
  protected readonly avg = computed(() => (this.sum(this.avgs()) / this.avgs().length).toFixed(2));
  protected readonly uptake = computed(() => Math.round((this.store.enrolled() / 3120) * 100));
  protected readonly byType = computed(() => [
    { name: 'Breakfast', color: '#f59e0b', values: this.meals().map((m) => Math.round(m * 0.31)) },
    { name: 'Lunch', color: '#7c3aed', values: this.meals().map((m) => Math.round(m * 0.57)) },
    { name: 'Dinner', color: '#22c55e', values: this.meals().map((m) => Math.round(m * 0.12)) },
  ]);
  protected readonly planSegs = computed(() => this.store.plans().map((p) => ({ label: p.name, value: p.enrolled, color: p.donut })));
  protected readonly util = computed(() => this.store.canteens().map((c, i) => ({ label: c.name, value: Math.round((c.usage / c.capacity) * 100), display: `${Math.round((c.usage / c.capacity) * 100)}%`, color: ['#7c3aed', '#3b82f6', '#22c55e', '#f59e0b', '#14b8a6'][i % 5] })));
  protected readonly sat = computed(() => [{ name: 'Avg rating', color: '#f59e0b', area: true, values: [4.0, 4.1, 3.9, 4.0, 4.2, 4.1, 4.0, 4.2, 4.1, 4.3, 4.2, this.store.avgRating() || 4.2].slice(-this.n()) }]);
  protected readonly reports = signal<Report[]>([
    { id: 'cost', name: 'Monthly Meal Cost Report', desc: 'Cost by plan, site and meal type with subsidy split', icon: 'm-coin', color: '#ef4444', freq: 'Monthly', scheduled: true, last: '01 Nov 2026' },
    { id: 'consumption', name: 'Meal Consumption by Plan', desc: 'Entitled vs consumed meals per plan', icon: 'm-cloche', color: '#7c3aed', freq: 'Weekly', scheduled: true, last: '03 Nov 2026' },
    { id: 'canteen', name: 'Canteen Utilization', desc: 'Meals, capacity and queue times per canteen', icon: 'm-store', color: '#2563eb', freq: 'Weekly', scheduled: false, last: '27 Oct 2026' },
    { id: 'bookings', name: 'Bookings & No-shows', desc: 'Pre-orders, collections, cancellations, no-shows', icon: 'calendar-days', color: '#f59e0b', freq: 'Daily', scheduled: true, last: 'Today 06:00' },
    { id: 'wallet', name: 'Wallet Transactions', desc: 'Top-ups, deductions, refunds and credits', icon: 'm-wallet', color: '#22c55e', freq: 'Monthly', scheduled: false, last: '01 Nov 2026' },
    { id: 'feedback', name: 'Feedback Summary', desc: 'Ratings by canteen, dish and category', icon: 'star', color: '#ec4899', freq: 'Weekly', scheduled: false, last: '03 Nov 2026' },
    { id: 'allergen', name: 'Allergen Compliance', desc: 'Dish labelling coverage and alerts sent', icon: 'shield-plus', color: '#14b8a6', freq: 'Monthly', scheduled: true, last: '01 Nov 2026' },
    { id: 'payroll', name: 'Payroll Deduction File', desc: 'Employee meal contributions for payroll', icon: 'file-text', color: '#64748b', freq: 'Monthly', scheduled: true, last: '31 Oct 2026' },
  ]);
  protected readonly scheduledCount = computed(() => this.reports().filter((r) => r.scheduled).length);

  protected sum(a: number[]) {
    return a.reduce((x, y) => x + y, 0);
  }
  protected toggleSch(r: Report) {
    this.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, scheduled: !x.scheduled } : x)));
    this.toastMsg(`${r.name} ${r.scheduled ? 'unscheduled' : 'scheduled ' + r.freq.toLowerCase() + ' · emailed to Facilities team'}`);
  }
  protected gen(r: Report) {
    const s = this.store;
    const rows: Record<string, (string | number)[][]> = {
      cost: [['Month', 'Cost AED', 'Avg/meal', 'Meals'], ...this.labels().map((m, i) => [m, this.costs()[i], this.avgs()[i], this.meals()[i]])],
      consumption: [['Plan', 'Enrolled', 'Status', 'Price/day', 'Subsidy %'], ...s.plans().map((p) => [p.name, p.enrolled, p.status, p.price, p.subsidy])],
      canteen: [['Canteen', 'Meals today', 'Capacity', 'Utilization %', 'Queue min', 'Rating'], ...s.canteens().map((c) => [c.name, c.usage, c.capacity, Math.round((c.usage / c.capacity) * 100), c.wait, c.rating])],
      bookings: [['Booking', 'Employee', 'Date', 'Meal', 'Status', 'Amount'], ...s.bookings().map((b) => [b.id, s.diner(b.dinerId)?.name ?? '', b.date, b.meal, b.status, b.amount])],
      wallet: [['Employee', 'Plan', 'Balance', 'Credits', 'Status'], ...s.diners().map((p) => [p.name, s.plan(p.planId)?.name ?? '', p.cash, p.credits, p.status])],
      feedback: [['ID', 'Canteen', 'Rating', 'Category', 'Status'], ...s.feedback().map((f) => [f.id, s.canteen(f.canteenId)?.name ?? '', f.rating, f.category, f.status])],
      allergen: [['Dish', 'Allergens', 'Diets'], ...s.dishes().map((x) => [x.name, x.allergens.join('; '), x.diets.join('; ')])],
      payroll: [['Emp ID', 'Name', 'Plan', 'Employee share AED'], ...s.diners().map((p) => { const pl = s.plan(p.planId); return [p.id, p.name, pl?.name ?? '', pl ? +((pl.price * (100 - pl.subsidy)) / 100 * 22).toFixed(2) : 0]; })],
    };
    downloadCsv(`${r.id}-report.csv`, rows[r.id]);
    this.reports.update((l) => l.map((x) => (x.id === r.id ? { ...x, last: 'Just now' } : x)));
    this.toastMsg(`${r.name} downloaded`);
  }
  protected genAll() {
    this.reports().slice(0, 3).forEach((r) => this.gen(r));
    this.toastMsg('Report pack downloaded (cost, consumption, utilization)');
  }
}
