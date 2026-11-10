import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { DualChart, Plate } from './meal-ui';
import { AVG12, COST12, COST_SCALE, DAYS, fmt, fmtDay, GROUPS, MEAL_TIMES, MEAL_TYPES, MealPlan, MealStore, MealType, MONTHS12, PLAN_SEED, PLAN_TYPES, POLICY_SEED, Policy, SITES } from './meals.data';

const FORM_TABS = ['Basic Details', 'Meal Entitlement', 'Eligibility', 'Pricing', 'Policy Rules'] as const;
const PLATE: Record<MealType, { e: string; bg: string; k: 'breakfast' | 'lunch' | 'dinner' }> = { Breakfast: { e: '🍳', bg: 'var(--kb-fcd34d)', k: 'breakfast' }, Lunch: { e: '🥗', bg: 'var(--kb-86efac)', k: 'lunch' }, Dinner: { e: '🍲', bg: 'var(--kb-fdba74)', k: 'dinner' } };

@Component({
  selector: 'app-meal-plans-policies',
  imports: [...UI, Plate, DualChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenus($event)' },
  template: `
    <app-page-head title="Meal Plans &amp; Policies" parent="Meal &amp; Canteen Management" parentLink="/meal-canteen-management" subtitle="Create and manage meal plans, eligibility rules, policies, menus and pricing across your organization.">
      <button class="btn-primary big" (click)="newPlan()"><app-icon name="plus" [size]="16" />New Meal Plan</button>
      <button class="btn-ghost big" (click)="openPolicies()"><app-icon name="settings" [size]="16" />Policy Settings</button>
      <button class="btn-ghost big" (click)="exportCsv()"><app-icon name="m-upload" [size]="16" />Export</button>
      <div class="menu-wrap" data-menu>
        <button class="btn-ghost big sq" (click)="more.set(!more())" aria-label="More"><app-icon name="more" [size]="18" /></button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="go('subsidy-pricing')"><app-icon name="sliders" [size]="14" />Subsidy &amp; Pricing</button>
            <button class="dd-item" (click)="go('meal-entitlement-wallet')"><app-icon name="m-wallet" [size]="14" />Entitlements &amp; Wallets</button>
            <button class="dd-item" (click)="print()"><app-icon name="file-text" [size]="14" />Print</button>
            <button class="dd-item danger" (click)="reset()"><app-icon name="refresh" [size]="14" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Meal Plans" [value]="store.plans().length" icon="m-cutlery" color="var(--ka-7c3aed)" change="20%" sub="vs. last quarter" />
      <app-kpi label="Total Users Enrolled" [value]="fmt(store.enrolled())" icon="users" color="var(--ka-22c55e)" change="12%" sub="vs. last month" />
      <app-kpi label="Daily Average Meals" value="1,932" icon="m-cloche" color="var(--ka-f59e0b)" change="8%" sub="vs. last week" />
      <app-kpi label="Monthly Meal Cost" value="AED 46,850" icon="m-coin" color="var(--ka-ef4444)" change="5%" [up]="false" [good]="false" sub="vs. last month" />
      <app-kpi label="Canteen Locations" [value]="store.canteens().length" icon="m-store" color="var(--ka-2563eb)" sub="3 on-site | 1 partner" subColor="var(--ka-2563eb)" />
    </section>

    <section class="mp-grid">
      <div class="col">
        <!-- Meal plans table -->
        <div class="card">
          <div class="t-head">
            <h3>Meal Plans</h3>
            <div class="seg">
              @for (t of ['All Plans', 'Active', 'Inactive']; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}
            </div>
            <select class="select site" [value]="site()" (change)="site.set($any($event.target).value)">
              <option>All Sites</option>
              @for (s of sites; track s) {<option>{{ s }}</option>}
            </select>
            <label class="search-box srch"><app-icon name="search" [size]="15" /><input placeholder="Search meal plans..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          </div>
          <div class="table-wrap">
            <table class="table pt">
              <thead><tr><th>Plan Name</th><th>Description</th><th>Eligibility</th><th>Sites</th><th>Price (AED)</th><th>Status</th><th class="c">Enrolled</th><th class="c">Actions</th></tr></thead>
              <tbody>
                @for (p of rows(); track p.id) {
                  <tr class="clickable" [class.selected]="draft().id === p.id" (click)="load(p)">
                    <td><span class="pname"><span class="pi" [style.background]="p.color"><app-icon [name]="p.icon" [size]="14" [stroke]="2.2" /></span><b>{{ p.name }}</b></span></td>
                    <td>{{ p.desc }}</td>
                    <td>{{ p.eligibility }}</td>
                    <td>{{ p.sites }}</td>
                    <td>{{ p.price.toFixed(2) }} / day</td>
                    <td><span class="st" [class.off]="p.status !== 'Active'"><i></i>{{ p.status }}</span></td>
                    <td class="c">{{ fmt(p.enrolled) }}</td>
                    <td class="c" (click)="$event.stopPropagation()">
                      <div class="menu-wrap" data-menu>
                        <button class="dots" (click)="rowMenu.set(rowMenu() === p.id ? null : p.id)" aria-label="Actions">•••</button>
                        @if (rowMenu() === p.id) {
                          <div class="dropdown">
                            <button class="dd-item" (click)="load(p)"><app-icon name="m-pencil" [size]="14" />Edit plan</button>
                            <button class="dd-item" (click)="showEnt(p)"><app-icon name="calendar-days" [size]="14" />View entitlement</button>
                            <button class="dd-item" (click)="duplicate(p)"><app-icon name="layers" [size]="14" />Duplicate</button>
                            <button class="dd-item" (click)="toggleStatus(p)"><app-icon [name]="p.status === 'Active' ? 'ban' : 'shield-check'" [size]="14" />{{ p.status === 'Active' ? 'Deactivate' : 'Activate' }}</button>
                            <button class="dd-item" (click)="go('meal-entitlement-wallet')"><app-icon name="m-wallet" [size]="14" />Enrolled wallets</button>
                            <button class="dd-item danger" (click)="remove(p)"><app-icon name="m-xcircle" [size]="14" />Delete</button>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="empty">No meal plans match these filters.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meal entitlement -->
        <div class="card ent" #ent>
          <div class="e-head">
            <h3>Meal Entitlement <span class="for">(For {{ entPlan().name }})</span></h3>
            <div class="seg sm">
              @for (v of ['Weekly View', 'Monthly View', 'Calendar View']; track v) {<button [class.on]="entView() === v" (click)="entView.set(v)">{{ v }}</button>}
            </div>
          </div>
          @switch (entView()) {
            @case ('Weekly View') {
              <div class="week">
                @for (day of days; track day; let di = $index) {
                  <div class="day">
                    <label class="dh"><input type="checkbox" [checked]="fullDay(entPlan(), di)" (change)="toggleDay(di)" />{{ day }}</label>
                    @for (m of shownMeals(); track m) {
                      @if (entPlan().meals[m][di]) {
                        <button class="meal" (click)="toggleMeal(m, di)" [title]="'Click to remove ' + m + ' on ' + day">
                          <app-plate [kind]="plate[m].k" [size]="44" />
                          <span><b>{{ m }}</b><small>{{ entPlan().maxPerSlot }} meal</small><small>{{ times[m] }}</small></span>
                        </button>
                      } @else {
                        <button class="meal none" (click)="toggleMeal(m, di)" [title]="'Click to add ' + m + ' on ' + day">
                          <app-icon name="m-xcircle" [size]="22" [stroke]="1.5" /><span>No Entitlement</span>
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            }
            @case ('Monthly View') {
              <table class="table mtab">
                <thead><tr><th>Meal</th>@for (wk of monthWeeks(); track wk.label) {<th class="num">{{ wk.label }}</th>}<th class="num">Month Total</th><th class="num">Est. Cost (AED)</th></tr></thead>
                <tbody>
                  @for (m of shownMeals(); track m) {
                    <tr><td><span class="pname"><app-plate [kind]="plate[m].k" [size]="28" />{{ m }}</span></td>
                      @for (wk of monthWeeks(); track wk.label) {<td class="num">{{ wk.counts[m] }}</td>}
                      <td class="num"><b>{{ monthTotal(m) }}</b></td><td class="num">{{ fmt(monthTotal(m) * perMeal()) }}</td></tr>
                  }
                  <tr class="tot"><td>Total per person</td>@for (wk of monthWeeks(); track wk.label) {<td class="num">{{ wk.total }}</td>}<td class="num"><b>{{ monthAll() }}</b></td><td class="num"><b>{{ fmt(monthAll() * perMeal()) }}</b></td></tr>
                </tbody>
              </table>
              <p class="muted note">{{ entPlan().name }} · {{ fmt(entPlan().enrolled) }} enrolled → {{ fmt(monthAll() * entPlan().enrolled) }} meals entitled in {{ monthName }} · carry forward {{ entPlan().carryForward ? 'allowed' : 'not allowed' }}.</p>
            }
            @case ('Calendar View') {
              <div class="cal-head"><b>{{ monthName }}</b><span class="lg">@for (m of shownMeals(); track m) {<span><i [class]="'cd ' + m"></i>{{ m }}</span>}</span></div>
              <div class="cal">
                @for (d of days; track d) {<span class="cw">{{ d }}</span>}
                @for (c of calCells(); track $index) {
                  <div class="cc" [class.blank]="!c.d" [class.today]="c.today">
                    @if (c.d) {<b>{{ c.d }}</b><span class="cds">@for (m of c.meals; track m) {<i [class]="'cd ' + m" [title]="m"></i>}</span>}
                  </div>
                }
              </div>
            }
          }
        </div>

        <div class="bottom">
          <div class="card">
            <h3>Enrollment by Meal Plan</h3>
            <div class="enr">
              <app-donut [segments]="donut()" center="Total Enrolled" [legend]="false" [size]="156" />
              <ul class="dl">
                @for (s of donut(); track s.label) {
                  <li><i [style.background]="s.color"></i><span>{{ s.label }}</span><b>{{ fmt(s.value) }}</b><em>({{ pct(s.value) }}%)</em></li>
                }
              </ul>
            </div>
          </div>
          <div class="card">
            <div class="mc-head"><h3>Meal Cost Analysis</h3>
              <select class="select" [value]="range()" (change)="range.set($any($event.target).value)"><option>Last 6 Months</option><option>Last 12 Months</option><option>Last 3 Months</option></select>
            </div>
            <app-dual-chart [labels]="cost().labels" [bars]="cost().bars" [line]="cost().line" [height]="150" />
          </div>
        </div>
      </div>

      <div class="col">
        <!-- Create / edit form -->
        <form class="card form" (submit)="$event.preventDefault(); save()">
          <h3>Create / Edit Meal Plan@if (!exists()) {<span class="new-tag">New</span>}</h3>
          <nav class="ftabs">@for (t of formTabs; track t) {<button type="button" [class.on]="ftab() === t" (click)="ftab.set(t)">{{ t }}</button>}</nav>
          @let f = draft();
          @switch (ftab()) {
            @case ('Basic Details') {
              <label class="fl"><span>Plan Name <em>*</em></span><input class="input" [value]="f.name" (input)="set('name', $any($event.target).value)" placeholder="e.g. Night Shift Plan" /></label>
              <label class="fl">Description<textarea class="input" rows="2" [value]="f.desc" (input)="set('desc', $any($event.target).value)"></textarea></label>
              <div class="row2">
                <label class="fl">Plan Type<select class="select" [value]="f.type" (change)="set('type', $any($event.target).value)">@for (t of planTypes; track t) {<option>{{ t }}</option>}</select></label>
                <div class="fl"><span>Status</span><button type="button" class="tgl" [class.on]="f.status === 'Active'" (click)="set('status', f.status === 'Active' ? 'Inactive' : 'Active')"><i></i></button><span class="tgl-l">{{ f.status }}</span></div>
              </div>
              <div class="row2">
                <div class="fl"><span>Valid From <em>*</em></span><button type="button" class="input date" (click)="pickDate(d1)">{{ f.from ? fd(f.from) : 'Select date' }}<app-icon name="calendar-days" [size]="16" /><input #d1 type="date" tabindex="-1" [value]="f.from" (change)="set('from', $any($event.target).value)" /></button></div>
                <div class="fl"><span>Valid To</span><button type="button" class="input date" (click)="pickDate(d2)">{{ f.to ? fd(f.to) : 'No end date' }}<app-icon name="calendar-days" [size]="16" /><input #d2 type="date" tabindex="-1" [value]="f.to" (change)="set('to', $any($event.target).value)" /></button></div>
              </div>
              <div class="fl"><span>Applicable Sites</span>
                <div class="row2 tight">
                  <select class="select" [value]="f.siteList.length === sites.length ? 'All Sites' : 'Selected Sites'" (change)="siteMode($any($event.target).value)"><option>All Sites</option><option>Selected Sites</option></select>
                  <div class="menu-wrap" data-menu>
                    <button type="button" class="select ms" (click)="siteDd.set(!siteDd())">
                      @if (f.siteList.length) {<span class="chipx">{{ f.siteList.length }} site{{ f.siteList.length > 1 ? 's' : '' }} selected<b (click)="$event.stopPropagation(); set('siteList', [])">×</b></span>} @else {<span class="muted">Select sites</span>}
                    </button>
                    @if (siteDd()) {
                      <div class="dropdown sd">@for (s of sites; track s) {<label class="dd-item"><input type="checkbox" [checked]="f.siteList.includes(s)" (change)="toggleSite(s)" />{{ s }}</label>}</div>
                    }
                  </div>
                </div>
              </div>
            }
            @case ('Meal Entitlement') {
              <p class="hint">Choose which meals this plan includes on each day.</p>
              <table class="table et">
                <thead><tr><th></th>@for (d of days; track d) {<th class="c">{{ d }}</th>}</tr></thead>
                <tbody>@for (m of mealTypes; track m) {<tr><td>{{ m }}<small>{{ times[m] }}</small></td>@for (d of days; track d; let di = $index) {<td class="c"><input type="checkbox" [checked]="f.meals[m][di]" (change)="draftMeal(m, di)" /></td>}</tr>}</tbody>
              </table>
              <label class="fl">Meals per slot<select class="select" [value]="'' + f.maxPerSlot" (change)="set('maxPerSlot', +$any($event.target).value)"><option value="1">1 meal</option><option value="2">2 meals</option><option value="3">3 meals</option></select></label>
              <p class="hint">{{ weekly(f) }} meals / week · ≈ {{ weekly(f) * 4 }} / month per person</p>
            }
            @case ('Eligibility') {
              <label class="fl">Eligible Group<select class="select" [value]="f.eligibility" (change)="set('eligibility', $any($event.target).value)">@for (g of groups; track g) {<option>{{ g }}</option>}</select></label>
              <label class="fl">Grades / Bands<input class="input" [value]="f.grades.join(', ')" (change)="set('grades', $any($event.target).value.split(',').map(trim))" /></label>
              <div class="fl">Sites @for (s of sites; track s) {<label class="ck"><input type="checkbox" [checked]="f.siteList.includes(s)" (change)="toggleSite(s)" />{{ s }}</label>}</div>
              <label class="fl">Enrolled users<input class="input" type="number" min="0" [value]="f.enrolled" (input)="set('enrolled', +$any($event.target).value)" /></label>
            }
            @case ('Pricing') {
              <div class="row2">
                <label class="fl">Price per day (AED)<input class="input" type="number" min="0" step="0.5" [value]="f.price" (input)="set('price', +$any($event.target).value)" /></label>
                <label class="fl">Company subsidy %<input class="input" type="number" min="0" max="100" [value]="f.subsidy" (input)="set('subsidy', +$any($event.target).value)" /></label>
              </div>
              <input type="range" min="0" max="100" step="5" [value]="f.subsidy" (input)="set('subsidy', +$any($event.target).value)" class="rng" />
              <dl class="calc">
                <dt>Company pays / day</dt><dd>AED {{ (f.price * f.subsidy / 100).toFixed(2) }}</dd>
                <dt>Employee pays / day</dt><dd>AED {{ (f.price * (100 - f.subsidy) / 100).toFixed(2) }}</dd>
                <dt>Est. monthly company cost</dt><dd><b>AED {{ fmt(Math.round(f.price * 22 * f.enrolled * f.subsidy / 100 * scale)) }}</b></dd>
              </dl>
            }
            @case ('Policy Rules') {
              <div class="fl row-t">Allow carry forward of unused meals<button type="button" class="tgl" [class.on]="f.carryForward" (click)="set('carryForward', !f.carryForward)"><i></i></button></div>
              <ul class="pr mini">
                @for (p of store.policies(); track p.id) {<li><app-icon [name]="p.icon" [size]="15" [style.color]="p.color" /><span>{{ p.name }}</span><span>{{ p.value }}</span></li>}
              </ul>
              <button type="button" class="link" (click)="openPolicies()">Edit organization policies →</button>
            }
          }
          @if (err()) {<p class="bad err">{{ err() }}</p>}
          <div class="factions"><button type="button" class="btn-ghost" (click)="cancel()">Cancel</button><button class="btn-primary" type="submit">Save Plan</button></div>
        </form>

        <div class="card">
          <div class="ph"><h3>Policy Rules</h3><button class="link" (click)="openPolicies()"><app-icon name="m-pencil" [size]="13" />Edit</button></div>
          <ul class="pr">
            @for (p of store.policies(); track p.id) {<li><app-icon [name]="p.icon" [size]="16" [stroke]="2.2" [style.color]="p.color" /><span>{{ p.name }}</span><span>{{ p.value }}</span></li>}
          </ul>
        </div>

        <div class="card">
          <div class="ph"><h3>Top Canteen Locations by Usage</h3><button class="link" (click)="go('canteen-locations')">View All</button></div>
          <ul class="tc">
            @for (c of store.canteens(); track c.id; let i = $index) {
              <li [title]="c.name + ': ' + fmt(c.usage) + ' meals · ' + util(c.usage, c.capacity) + '% of capacity'" (click)="go('canteen-locations')">
                <span>{{ c.name }}</span><div class="trk"><i [style.width.%]="util(c.usage, c.capacity)" [style.background]="barColors[i]"></i></div><b>{{ fmt(c.usage) }}</b><em>({{ util(c.usage, c.capacity) }}%)</em>
              </li>
            }
          </ul>
        </div>
      </div>
    </section>

    @if (polEdit(); as list) {
      <div class="g-overlay" (click)="polEdit.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); savePolicies()">
        <div class="modal-head"><h3>Policy Settings</h3><button type="button" class="close-btn" (click)="polEdit.set(null)">×</button></div>
        <div class="pol-form">
          @for (p of list; track p.id) {
            <label><span><app-icon [name]="p.icon" [size]="15" [style.color]="p.color" />{{ p.name }}</span>
              <select class="select" [value]="p.value" (change)="setPol(p.id, $any($event.target).value)">@for (o of p.options; track o) {<option>{{ o }}</option>}</select>
            </label>
          }
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="polEdit.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Policies</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    :host ::ng-deep .kpi-row .kpi-card { padding: 14px 16px; gap: 22px; align-items: center; }
    :host ::ng-deep .kpi-row .kpi-icon { width: 54px; height: 54px; border-radius: 12px; }
    :host ::ng-deep .kpi-row .kpi-icon svg { width: 26px; height: 26px; }
    :host ::ng-deep .kpi-row .kpi-value { font-size: 22px; margin: 6px 0 8px; }
    .btn-ghost.big, .btn-primary.big { padding: 10px 16px; font-weight: 500; font-size: 12.5px; } .sq { padding: 10px 12px !important; }
    h3 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
    .mp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 394px; gap: 12px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .t-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; } .t-head h3 { margin-right: auto; }
    .seg { display: flex; gap: 6px; } .seg button { padding: 7px 18px; border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 6px; font-size: 12px; color: var(--kf-3b3f5c); cursor: pointer; }
    .seg button.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); } .seg.sm button { padding: 6px 15px; background: var(--kb-f4f4fa); border-color: var(--kl-f4f4fa); } .seg.sm button.on { background: var(--primary); }
    .site { width: 132px; } .srch { width: 266px; } .srch input { width: 100%; }
    .pt th { background: var(--kb-ffffff); font-weight: 500; color: var(--kf-3b3f5c); font-size: 11.5px; border-bottom: 0; padding: 7px 5px; } .pt td { padding: 8px 5px; font-size: 11.5px; color: var(--kf-3b3f5c); border-bottom: 0; }
    .pt .c { text-align: center; } .pname { display: inline-flex; align-items: center; gap: 10px; color: var(--text); } .pname b { font-weight: 600; }
    .pi { width: 22px; height: 22px; border-radius: 5px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .st { display: inline-flex; align-items: center; gap: 7px; padding: 3px 12px 3px 8px; border-radius: 4px; background: var(--kb-e8f9ee); color: var(--kf-15803d); min-width: 70px; } .st i { width: 7px; height: 7px; border-radius: 50%; background: var(--kb-22c55e); }
    .st.off { background: var(--kb-fde8e8); color: var(--kf-b91c1c); } .st.off i { background: var(--kb-ef4444); }
    .dots { font-size: 11px; letter-spacing: -1px; font-weight: 700; } .empty { text-align: center; color: var(--muted); padding: 24px; }
    .e-head { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; } .for { font-weight: 400; color: var(--kf-3b3f5c); font-size: 14px; }
    .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
    .day { border: 1px solid var(--border); border-radius: 6px; padding: 6px 4px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .dh { display: flex; align-items: center; gap: 10px; font-size: 11.5px; padding: 2px 4px; cursor: pointer; } .dh input { accent-color: var(--kf-22c55e); width: 15px; height: 15px; margin: 0; }
    .meal { display: flex; align-items: center; gap: 6px; border: 0; background: none; text-align: left; padding: 3px 2px; border-radius: 6px; cursor: pointer; min-height: 56px; min-width: 0; }
    .meal:hover { background: var(--kb-f6f3ff); } .meal span { display: flex; flex-direction: column; min-width: 0; } .meal b { font-size: 10.5px; font-weight: 600; } .meal small { font-size: 9px; color: var(--muted); white-space: nowrap; }
    .meal.none { justify-content: center; color: var(--kf-9ca3af); gap: 8px; } .meal.none span { font-size: 10px; color: var(--kf-6b7090); }
    .mtab td, .mtab th { font-size: 12px; padding: 7px 8px; } .mtab .tot td { font-weight: 600; background: var(--kb-fafafe); } .note { font-size: 12px; margin: 10px 0 0; }
    .cal-head { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; } .lg { display: flex; gap: 12px; font-size: 11.5px; color: var(--kf-4b4f6b); } .lg span { display: inline-flex; gap: 5px; align-items: center; }
    .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; } .cw { font-size: 11px; color: var(--muted); text-align: center; }
    .cc { border: 1px solid var(--border); border-radius: 6px; height: 40px; padding: 3px 6px; display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; } .cc.blank { border: 0; } .cc.today { border-color: var(--primary); background: var(--primary-soft); }
    .cds { display: flex; gap: 3px; } .cd { width: 8px; height: 8px; border-radius: 50%; display: inline-block; } .cd.Breakfast { background: var(--kb-f59e0b); } .cd.Lunch { background: var(--kb-22c55e); } .cd.Dinner { background: var(--kb-7c3aed); }
    .bottom { display: grid; grid-template-columns: minmax(0, 0.97fr) minmax(0, 1.03fr); gap: 12px; } .bottom h3 { margin-bottom: 8px; }
    .enr { display: flex; align-items: center; gap: 10px; } .enr app-donut { flex-shrink: 0; }
    :host ::ng-deep .enr .donut-mid b { font-size: 21px; } :host ::ng-deep .enr .donut-mid span { font-size: 11.5px; color: var(--kf-3b3f5c); }
    .dl { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
    .dl li { display: grid; grid-template-columns: 9px 1fr auto 50px; gap: 6px; white-space: nowrap; align-items: center; font-size: 11.5px; color: var(--kf-3b3f5c); } .dl i { width: 9px; height: 9px; border-radius: 50%; } .dl b { font-weight: 500; text-align: right; } .dl em { font-style: normal; text-align: right; }
    .mc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .mc-head h3 { margin: 0 !important; } .mc-head .select { padding: 5px 28px 5px 10px; font-size: 11.5px; }
    .form h3 { display: flex; align-items: center; gap: 8px; } .new-tag { font-size: 10.5px; font-weight: 500; padding: 1px 7px; border-radius: 8px; background: var(--kb-dcfce7); color: var(--kf-15803d); }
    .ftabs { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); margin: 12px 0 12px; }
    .ftabs button { border: 0; background: none; padding: 6px 6px; font-size: 11px; color: var(--kf-3b3f5c); cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; } .ftabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 500; background: var(--kb-f6f3ff); border-radius: 4px 4px 0 0; }
    .fl { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--kf-4b4f6b); margin-bottom: 10px; min-width: 0; } .fl em { color: var(--red); font-style: normal; } .fl .input, .fl .select { font-size: 11.5px; width: 100%; }
    textarea.input { resize: vertical; font-family: inherit; min-height: 44px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .row2.tight { gap: 8px; } .row2 > .fl { margin-bottom: 10px; } .row2.tight > * { min-width: 0; }
    .tgl { width: 36px; height: 20px; border-radius: 12px; border: 0; background: var(--kb-d1d5db); position: relative; cursor: pointer; padding: 0; margin-top: 4px; } .tgl i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); transition: left 0.15s; }
    .tgl.on { background: var(--kb-22c55e); } .tgl.on i { left: 18px; } .fl > .tgl { align-self: flex-start; } .fl:has(> .tgl) { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; } .fl:has(> .tgl) > :first-child { grid-column: 1 / -1; }
    .tgl-l { font-size: 12px; color: var(--text); margin-top: 4px; } .row-t { display: flex !important; flex-direction: row !important; justify-content: space-between; align-items: center; }
    .date { position: relative; display: flex; justify-content: space-between; align-items: center; text-align: left; cursor: pointer; padding: 8px 10px; } .date app-icon { color: var(--kf-3b3f5c); } .date input { position: absolute; left: 0; bottom: 0; width: 100%; height: 0; opacity: 0; border: 0; padding: 0; pointer-events: none; }
    .ms { width: 100%; text-align: left; } .chipx { display: inline-flex; gap: 4px; align-items: center; background: var(--kb-eef2ff); color: var(--kf-4338ca); border-radius: 4px; padding: 0 6px; font-size: 10px; } .chipx b { cursor: pointer; }
    .sd { left: 0; right: auto; min-width: 170px; } .sd input { margin: 0; }
    .ck { display: flex; align-items: center; gap: 6px; color: var(--text); }
    .factions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; } .factions button { padding: 7px 18px; font-weight: 500; }
    .hint { font-size: 11.5px; color: var(--muted); margin: 0 0 8px; } .err { font-size: 12px; margin: 0 0 6px; }
    .et th, .et td { padding: 5px 3px; font-size: 11px; } .et td small { display: block; color: var(--muted); font-size: 9.5px; } .et .c { text-align: center; } .et input { accent-color: var(--primary); }
    .rng { width: 100%; accent-color: var(--primary); margin: 0 0 8px; }
    .calc { display: grid; grid-template-columns: 1fr auto; gap: 6px; font-size: 12px; margin: 0 0 10px; } .calc dd { margin: 0; text-align: right; }
    .ph { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; } .ph .link { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; }
    .pr { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .pr li { display: grid; grid-template-columns: 20px 124px 1fr; gap: 4px; align-items: center; font-size: 11px; color: var(--kf-1f2240); min-height: 17px; } .pr.mini li { grid-template-columns: 20px 1fr 1.2fr; font-size: 11px; margin-bottom: 4px; }
    .tc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
    .tc li { display: grid; grid-template-columns: 140px 1fr 44px 40px; gap: 8px; align-items: center; font-size: 11.5px; color: var(--kf-1f2240); cursor: pointer; } .tc b { font-weight: 500; text-align: right; } .tc em { font-style: normal; text-align: right; }
    .trk { height: 14px; background: var(--kb-f1f2f7); border-radius: 2px; overflow: hidden; } .trk i { display: block; height: 100%; }
    .pol-form { display: flex; flex-direction: column; gap: 10px; } .pol-form label { display: grid; grid-template-columns: 200px 1fr; gap: 10px; align-items: center; font-size: 12.5px; } .pol-form span { display: inline-flex; gap: 8px; align-items: center; }
    @media (max-width: 1300px) { .mp-grid { grid-template-columns: 1fr; } .bottom { grid-template-columns: 1fr; } }
  `,
})
export class MealPlans {
  protected readonly store = inject(MealStore);
  private readonly router = inject(Router);
  protected readonly Math = Math;
  protected readonly fmt = fmt;
  protected readonly fd = fmtDay;
  protected readonly scale = COST_SCALE;
  protected readonly trim = (s: string) => s.trim();
  protected readonly days = DAYS;
  protected readonly sites = SITES;
  protected readonly groups = GROUPS;
  protected readonly planTypes = PLAN_TYPES;
  protected readonly mealTypes = MEAL_TYPES;
  protected readonly times = MEAL_TIMES;
  protected readonly plate = PLATE;
  protected readonly formTabs = FORM_TABS;
  protected readonly barColors = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)'];
  private readonly entEl = viewChild<ElementRef<HTMLElement>>('ent');

  protected readonly tab = signal('All Plans');
  protected readonly site = signal('All Sites');
  protected readonly q = signal('');
  protected readonly rowMenu = signal<string | null>(null);
  protected readonly more = signal(false);
  protected readonly siteDd = signal(false);
  protected readonly entView = signal('Weekly View');
  protected readonly entId = signal('MP-01');
  protected readonly ftab = signal<(typeof FORM_TABS)[number]>('Basic Details');
  protected readonly draft = signal<MealPlan>(structuredClone(this.store.plans()[0]));
  protected readonly err = signal('');
  protected readonly toast = signal<string | null>(null);
  protected readonly range = signal('Last 6 Months');
  protected readonly polEdit = signal<Policy[] | null>(null);

  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.store.plans().filter(
      (p) =>
        (this.tab() === 'All Plans' || p.status === this.tab()) &&
        (this.site() === 'All Sites' || p.siteList.includes(this.site())) &&
        (!q || `${p.name} ${p.desc} ${p.eligibility} ${p.type}`.toLowerCase().includes(q)),
    );
  });
  protected readonly exists = computed(() => this.store.plans().some((p) => p.id === this.draft().id));
  protected readonly entPlan = computed(() => this.store.plan(this.entId()) ?? this.store.plans()[0] ?? PLAN_SEED[0]);
  /** Weekly view shows Breakfast + Lunch, plus Dinner when the plan has any. */
  protected readonly shownMeals = computed<MealType[]>(() => (this.entPlan().meals.Dinner.some(Boolean) ? ['Breakfast', 'Lunch', 'Dinner'] : ['Breakfast', 'Lunch']));
  protected readonly donut = computed(() => this.store.plans().map((p) => ({ label: p.name, value: p.enrolled, color: p.donut })));
  protected readonly perMeal = computed(() => {
    const p = this.entPlan();
    return Math.round(p.price / Math.max(1, MEAL_TYPES.filter((m) => p.meals[m].some(Boolean)).length));
  });
  protected readonly cost = computed(() => {
    const n = this.range() === 'Last 12 Months' ? 12 : this.range() === 'Last 3 Months' ? 3 : 6;
    return { labels: MONTHS12.slice(-n), bars: COST12.slice(-n), line: AVG12.slice(-n) };
  });

  // Month helpers (current month).
  private readonly now = new Date();
  protected readonly monthName = this.now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  private monthDays() {
    const y = this.now.getFullYear();
    const m = this.now.getMonth();
    const n = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => {
      const dt = new Date(y, m, i + 1);
      return { d: i + 1, dow: (dt.getDay() + 6) % 7 };
    });
  }
  protected readonly calCells = computed(() => {
    const p = this.entPlan();
    const days = this.monthDays();
    const lead = days[0].dow;
    const cells: { d: number; today: boolean; meals: MealType[] }[] = Array.from({ length: lead }, () => ({ d: 0, today: false, meals: [] }));
    days.forEach((x) => cells.push({ d: x.d, today: x.d === this.now.getDate(), meals: MEAL_TYPES.filter((m) => p.meals[m][x.dow]) }));
    return cells;
  });
  protected readonly monthWeeks = computed(() => {
    const p = this.entPlan();
    const weeks: { label: string; counts: Record<MealType, number>; total: number }[] = [];
    let cur: (typeof weeks)[number] | null = null;
    this.monthDays().forEach((x, i) => {
      if (!cur || x.dow === 0) {
        cur = { label: `Wk ${weeks.length + 1}`, counts: { Breakfast: 0, Lunch: 0, Dinner: 0 }, total: 0 };
        weeks.push(cur);
      }
      MEAL_TYPES.forEach((m) => {
        if (p.meals[m][x.dow]) {
          cur!.counts[m] += p.maxPerSlot;
          cur!.total += p.maxPerSlot;
        }
      });
      void i;
    });
    return weeks;
  });
  protected monthTotal(m: MealType) {
    return this.monthWeeks().reduce((a, w) => a + w.counts[m], 0);
  }
  protected monthAll() {
    return this.monthWeeks().reduce((a, w) => a + w.total, 0);
  }

  protected pct(v: number) {
    return ((v / Math.max(1, this.store.enrolled())) * 100).toFixed(1);
  }
  protected util(v: number, cap: number) {
    return Math.round((v / cap) * 100);
  }
  protected weekly(p: MealPlan) {
    return MEAL_TYPES.reduce((a, m) => a + p.meals[m].filter(Boolean).length, 0) * p.maxPerSlot;
  }
  protected fullDay(p: MealPlan, di: number) {
    return (['Breakfast', 'Lunch'] as MealType[]).every((m) => p.meals[m][di]);
  }

  protected pickDate(el: HTMLInputElement) {
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }
  protected closeMenus(e: Event) {
    if (!(e.target as HTMLElement).closest('[data-menu]')) {
      this.rowMenu.set(null);
      this.more.set(false);
      this.siteDd.set(false);
    }
  }

  // ---------- Table actions ----------
  protected load(p: MealPlan) {
    this.rowMenu.set(null);
    this.draft.set(structuredClone(p));
    this.entId.set(p.id);
    this.err.set('');
  }
  protected showEnt(p: MealPlan) {
    this.load(p);
    this.entEl()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  protected duplicate(p: MealPlan) {
    this.rowMenu.set(null);
    const c = { ...structuredClone(p), id: this.store.nextPlanId(), name: `${p.name} (Copy)`, enrolled: 0, status: 'Inactive' as const };
    this.store.savePlan(c);
    this.load(c);
    this.toastMsg(`${c.name} created as Inactive`);
  }
  protected toggleStatus(p: MealPlan) {
    this.rowMenu.set(null);
    const status = p.status === 'Active' ? 'Inactive' : 'Active';
    this.store.patchPlan(p.id, { status });
    if (this.draft().id === p.id) this.draft.update((d) => ({ ...d, status }));
    this.toastMsg(`${p.name} ${status === 'Active' ? 'activated' : 'deactivated'}`);
  }
  protected remove(p: MealPlan) {
    this.rowMenu.set(null);
    if (!confirm(`Delete ${p.name}? ${p.enrolled} enrolled users will be moved to the Standard Plan.`)) return;
    this.store.deletePlan(p.id);
    if (this.draft().id === p.id && this.store.plans()[0]) this.load(this.store.plans()[0]);
    this.toastMsg(`${p.name} deleted`);
  }

  // ---------- Entitlement (writes straight to the plan) ----------
  protected toggleMeal(m: MealType, di: number) {
    const p = this.entPlan();
    const meals = structuredClone(p.meals);
    meals[m][di] = !meals[m][di];
    this.applyMeals(p, meals, `${m} on ${DAYS[di]} ${meals[m][di] ? 'added to' : 'removed from'} ${p.name}`);
  }
  protected toggleDay(di: number) {
    const p = this.entPlan();
    const meals = structuredClone(p.meals);
    const on = !this.fullDay(p, di);
    (['Breakfast', 'Lunch'] as MealType[]).forEach((m) => (meals[m][di] = on));
    if (!on) meals.Dinner[di] = false;
    this.applyMeals(p, meals, `${DAYS[di]} ${on ? 'entitled' : 'cleared'} for ${p.name}`);
  }
  private applyMeals(p: MealPlan, meals: MealPlan['meals'], msg: string) {
    this.store.patchPlan(p.id, { meals });
    if (this.draft().id === p.id) this.draft.update((d) => ({ ...d, meals: structuredClone(meals) }));
    this.toastMsg(msg);
  }

  // ---------- Form ----------
  protected set<K extends keyof MealPlan>(k: K, v: MealPlan[K]) {
    this.draft.update((d) => ({ ...d, [k]: v }));
  }
  protected draftMeal(m: MealType, di: number) {
    this.draft.update((d) => {
      const meals = structuredClone(d.meals);
      meals[m][di] = !meals[m][di];
      return { ...d, meals };
    });
  }
  protected toggleSite(s: string) {
    const l = this.draft().siteList;
    this.set('siteList', l.includes(s) ? l.filter((x) => x !== s) : SITES.filter((x) => x === s || l.includes(x)));
  }
  protected siteMode(v: string) {
    this.set('siteList', v === 'All Sites' ? [...SITES] : this.draft().siteList.slice(0, 1));
    if (v !== 'All Sites') this.siteDd.set(true);
  }
  protected newPlan() {
    this.draft.set({
      id: this.store.nextPlanId(), name: '', desc: '', eligibility: 'All Employees', sites: 'All Sites', siteList: [...SITES], price: 15, status: 'Active', enrolled: 0,
      icon: 'm-cutlery', color: 'var(--ka-14b8a6)', donut: 'var(--ka-94a3b8)', type: 'Employee Plan', from: new Date().toISOString().slice(0, 10), to: '2027-12-31',
      meals: { Breakfast: [true, true, true, true, true, false, false], Lunch: [true, true, true, true, true, false, false], Dinner: Array(7).fill(false) }, subsidy: 50, grades: ['All'], carryForward: false, maxPerSlot: 1,
    });
    this.ftab.set('Basic Details');
    this.err.set('');
    this.toastMsg('Fill in the plan details and click Save Plan');
  }
  protected cancel() {
    const p = this.store.plan(this.draft().id) ?? this.store.plans()[0];
    if (p) this.load(p);
  }
  protected save() {
    const f = this.draft();
    if (!f.name.trim()) {
      this.ftab.set('Basic Details');
      return this.err.set('Plan name is required.');
    }
    if (!f.from) return this.err.set('Valid From date is required.');
    if (f.to && f.to < f.from) return this.err.set('Valid To must be after Valid From.');
    if (!f.siteList.length) return this.err.set('Select at least one applicable site.');
    const isNew = !this.exists();
    const plan: MealPlan = { ...f, name: f.name.trim(), sites: f.siteList.length === SITES.length ? 'All Sites' : f.siteList.join(', ') };
    this.store.savePlan(plan);
    this.draft.set(structuredClone(plan));
    this.entId.set(plan.id);
    this.err.set('');
    this.toastMsg(`${plan.name} ${isNew ? 'created' : 'updated'}`);
  }

  // ---------- Policies ----------
  protected openPolicies() {
    this.more.set(false);
    this.polEdit.set(this.store.policies().map((p) => ({ ...p })));
  }
  protected setPol(id: string, value: string) {
    this.polEdit.update((l) => l!.map((p) => (p.id === id ? { ...p, value } : p)));
  }
  protected savePolicies() {
    this.polEdit()!.forEach((p) => this.store.setPolicy(p.id, p.value));
    this.polEdit.set(null);
    this.toastMsg('Meal policies updated for all plans');
  }

  // ---------- Header ----------
  protected go(sub: string) {
    this.router.navigateByUrl(`/meal-canteen-management/${sub}`);
  }
  protected exportCsv() {
    downloadCsv('meal-plans.csv', [['ID', 'Plan', 'Description', 'Type', 'Eligibility', 'Sites', 'Price AED/day', 'Subsidy %', 'Status', 'Enrolled', 'Valid From', 'Valid To'], ...this.rows().map((p) => [p.id, p.name, p.desc, p.type, p.eligibility, p.sites, p.price, p.subsidy, p.status, p.enrolled, p.from, p.to])]);
    this.toastMsg(`${this.rows().length} meal plans exported`);
  }
  protected print() {
    this.more.set(false);
    window.print();
  }
  protected reset() {
    this.more.set(false);
    this.store.plans.set(PLAN_SEED.map((p) => structuredClone(p)));
    this.store.policies.set(POLICY_SEED.map((p) => ({ ...p })));
    this.load(this.store.plans()[0]);
    this.toastMsg('Demo data reset');
  }
  protected toastMsg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2400);
  }
}
