import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { ADDON_MODULES, AdminStore, fmtDay, fmtN, Invoice, MODULE_LIST, PLANS, USAGE_MONTHS, USAGE_USERS } from './admin.data';
import { ADMIN_CSS, AdminSwitch, AdminToast } from './admin-ui';

const ADDON_PRICE: Record<string, number> = { 'real-time-location': 3, 'digital-twin': 2, 'ai-people-intelligence': 2, 'device-edge-management': 1 };

@Component({
  selector: 'app-admin-subscription-licensing',
  imports: [...UI, AdminSwitch, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Subscription &amp; Licensing" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Your plan, licensed seats, add-on modules, usage and invoices.">
      <button class="btn-primary" (click)="seatForm.set(100)"><app-icon name="plus" [size]="16" />Add Seats</button>
      <button class="btn-ghost" (click)="planOpen.set(true)"><app-icon name="admin-rocket" [size]="16" />Change Plan</button>
    </app-page-head>
    @let s = store.subscription();
    @if (seatPct() >= 85) {<p class="note warn"><app-icon name="triangle-alert" [size]="16" />{{ seatPct() }}% of licensed seats are in use. Add seats to keep inviting users.</p>}

    <section class="kpi-row">
      <app-kpi label="Plan" [value]="s.plan" icon="admin-card" color="var(--ka-7c3aed)" [sub]="s.term + ' · renews ' + fmtDay(s.renewal)" />
      <app-kpi label="Seats Used" [value]="fmt(store.seatsUsed()) + ' / ' + fmt(s.seats)" icon="users" color="var(--ka-2563eb)" [sub]="seatPct() + '% utilised'" />
      <app-kpi label="Monthly Cost" [value]="'AED ' + fmt(monthly())" icon="admin-receipt" color="var(--ka-10b981)" [sub]="'AED ' + s.price + ' / seat + add-ons'" />
      <app-kpi label="Add-on Modules" [value]="activeAddons() + ' / ' + addons.length" icon="admin-rocket" color="var(--ka-f59e0b)" sub="active add-ons" />
      <app-kpi label="Days to Renewal" [value]="daysLeft()" icon="calendar-days" color="var(--ka-ef4444)" [sub]="s.autoRenew ? 'auto-renew on' : 'auto-renew off'" [subColor]="s.autoRenew ? 'var(--ka-16a34a)' : 'var(--ka-dc2626)'" />
    </section>

    <section class="grid2">
      <div class="card">
        <div class="ch"><h3>{{ s.plan }} Plan</h3><span class="tag green">Active</span></div>
        <div class="seat"><div><small>Seats</small><b>{{ fmt(store.seatsUsed()) }} <span class="muted">of {{ fmt(s.seats) }}</span></b></div><div class="bar"><i [style.width.%]="seatPct()"></i></div></div>
        <dl class="kv"><dt>Term</dt><dd>{{ s.term }} · {{ fmtDay(s.start) }} – {{ fmtDay(s.renewal) }}</dd><dt>Billing email</dt><dd>{{ s.billingEmail }}</dd><dt>Purchase order</dt><dd>{{ s.po }}</dd><dt>Included modules</dt><dd>{{ included() }} of {{ modules }}</dd></dl>
        <ul class="pol"><li><div><b>Auto-renew</b><small>Renews {{ fmtDay(s.renewal) }} for 12 months</small></div><app-admin-switch [on]="s.autoRenew" (toggled)="autoRenew($event)" /></li></ul>
      </div>
      <div class="card"><h3 class="ct">Active Users vs Licensed Seats (12 months)</h3><app-line-chart [labels]="months" [series]="usage()" [height]="230" /></div>
    </section>

    <section class="grid2">
      <div class="card">
        <h3 class="ct">Add-on Modules</h3>
        <ul class="pol">
          @for (a of addons; track a.path) {
            <li><div><b>{{ a.title }}</b><small>AED {{ price[a.path] }} / seat / month{{ s.plan === 'Enterprise Plus' ? ' · included in plan' : '' }}</small></div>
              <app-admin-switch [on]="store.licensed(a.path)" [disabled]="s.plan === 'Enterprise Plus'" (toggled)="addon(a.path, a.title, $event)" /></li>
          }
        </ul>
      </div>
      <div class="card">
        <div class="ch"><h3>Invoices</h3><button class="btn-ghost sm" (click)="exportInv()">Export CSV</button></div>
        <table class="table"><thead><tr><th>Invoice</th><th>Period</th><th class="num">Amount (AED)</th><th>Status</th><th></th></tr></thead>
          <tbody>@for (i of store.invoices(); track i.id) {<tr><td>{{ i.id }}</td><td>{{ i.period }}</td><td class="num">{{ fmt(i.amount) }}</td><td><span [class]="i.status === 'Paid' ? 'tag green' : 'tag amber'">{{ i.status }}</span></td>
            <td class="r">@if (i.status !== 'Paid') {<button class="link" (click)="pay(i)">Pay now</button> · }<button class="link" (click)="download(i)">Download</button></td></tr>}</tbody></table>
      </div>
    </section>

    @if (seatForm() !== null) {
      <div class="g-overlay" (click)="seatForm.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Add seats</h3><button class="close-btn" (click)="seatForm.set(null)">×</button></div>
        <label class="field">Additional seats<input class="input" type="number" min="10" step="10" [value]="seatForm()" (input)="seatForm.set(+$any($event.target).value)" /></label>
        <p class="note">New total {{ fmt(s.seats + (seatForm() ?? 0)) }} seats · +AED {{ fmt((seatForm() ?? 0) * s.price) }} / month, prorated to {{ fmtDay(s.renewal) }}.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="seatForm.set(null)">Cancel</button><button class="btn-primary" (click)="addSeats()">Confirm purchase</button></div>
      </div>
    }
    @if (planOpen()) {
      <div class="g-overlay" (click)="planOpen.set(false)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>Change plan</h3><button class="close-btn" (click)="planOpen.set(false)">×</button></div>
        <div class="grid3">
          @for (p of plans; track p.id) {
            <div class="plan" [class.cur]="p.id === s.plan"><b>{{ p.id }}</b><span class="pr">AED {{ p.price }}<small>/seat/mo</small></span><small class="muted">up to {{ fmt(p.seats) }} seats · {{ p.modules }} modules</small>
              <ul>@for (f of p.features; track f) {<li><app-icon name="admin-check" [size]="12" />{{ f }}</li>}</ul>
              @if (p.id === s.plan) {<span class="tag green">Current plan</span>} @else {<button class="btn-primary" (click)="changePlan(p.id, p.price)">Switch to {{ p.id }}</button>}
            </div>
          }
        </div>
      </div>
    }
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .seat { display: grid; gap: 6px; margin-bottom: 14px; } .seat > div:first-child { display: flex; justify-content: space-between; align-items: baseline; } .seat b { font-size: 20px; } .seat small { color: var(--muted); }
    .r { text-align: right; white-space: nowrap; }
    .plan { border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; } .plan.cur { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .pr { font-size: 24px; font-weight: 700; } .pr small { font-size: 12px; color: var(--muted); font-weight: 400; } .plan ul { list-style: none; padding: 0; margin: 0; font-size: 12.5px; display: grid; gap: 5px; flex: 1; } .plan li { display: flex; gap: 6px; align-items: center; } .plan li app-icon { color: var(--kf-16a34a); }
  `],
})
export class SubscriptionLicensing {
  protected readonly store = inject(AdminStore);
  protected readonly fmt = fmtN;
  protected readonly fmtDay = fmtDay;
  protected readonly months = USAGE_MONTHS;
  protected readonly plans = PLANS;
  protected readonly price = ADDON_PRICE;
  protected readonly modules = MODULE_LIST.length;
  protected readonly addons = MODULE_LIST.filter((m) => ADDON_MODULES.includes(m.path));
  protected readonly seatForm = signal<number | null>(null);
  protected readonly planOpen = signal(false);
  protected readonly seatPct = computed(() => Math.round((this.store.seatsUsed() / this.store.subscription().seats) * 100));
  protected readonly activeAddons = computed(() => this.addons.filter((a) => this.store.licensed(a.path)).length);
  protected readonly included = computed(() => MODULE_LIST.filter((m) => this.store.licensed(m.path)).length);
  protected readonly monthly = computed(() => {
    const s = this.store.subscription();
    const add = s.plan === 'Enterprise Plus' ? 0 : s.addons.reduce((a, p) => a + (ADDON_PRICE[p] ?? 0), 0);
    return s.seats * (s.price + add);
  });
  protected readonly daysLeft = computed(() => Math.max(0, Math.ceil((new Date(this.store.subscription().renewal).getTime() - Date.now()) / 86400_000)));
  protected readonly usage = computed(() => [
    { name: 'Active users', color: 'var(--ka-7c3aed)', values: [...USAGE_USERS.slice(0, -1), this.store.seatsUsed()], area: true },
    { name: 'Licensed seats', color: 'var(--ka-f59e0b)', values: USAGE_USERS.map((_, i) => (i === USAGE_USERS.length - 1 ? this.store.subscription().seats : 1500)), dashed: true },
  ]);
  private sub(ch: Partial<ReturnType<AdminStore['subscription']>>, what: string) {
    this.store.subscription.update((s) => ({ ...s, ...ch }));
    this.store.log('Updated', 'Subscription', this.store.subscription().plan, what, 'Subscription');
    this.store.toast(what);
  }
  protected autoRenew(v: boolean) {
    this.sub({ autoRenew: v }, `Auto-renew ${v ? 'enabled' : 'disabled'}`);
  }
  protected addon(path: string, title: string, on: boolean) {
    const s = this.store.subscription();
    this.sub({ addons: on ? [...s.addons, path] : s.addons.filter((a) => a !== path) }, `${title} add-on ${on ? 'activated — now available in Module Access' : 'cancelled at period end'}`);
  }
  protected addSeats() {
    const n = this.seatForm() ?? 0;
    if (n < 1) return;
    this.sub({ seats: this.store.subscription().seats + n }, `${n} seats added · ${fmtN(this.store.subscription().seats + n)} total`);
    this.seatForm.set(null);
  }
  protected changePlan(plan: string, price: number) {
    const p = PLANS.find((x) => x.id === plan)!;
    if (this.store.seatsUsed() > p.seats) return this.store.toast(`${plan} allows ${fmtN(p.seats)} seats — you use ${fmtN(this.store.seatsUsed())}`);
    this.sub({ plan, price, seats: Math.min(p.seats, Math.max(this.store.subscription().seats, this.store.seatsUsed())) }, `Plan changed to ${plan}`);
    this.planOpen.set(false);
  }
  protected pay(i: Invoice) {
    this.store.invoices.update((l) => l.map((x) => (x.id === i.id ? { ...x, status: 'Paid' } : x)));
    this.store.log('Updated', 'Subscription', i.id, `Invoice paid · AED ${fmtN(i.amount)}`, 'Subscription');
    this.store.toast(`${i.id} paid · receipt sent to ${this.store.subscription().billingEmail}`);
  }
  protected download(i: Invoice) {
    const s = this.store.subscription();
    downloadCsv(`${i.id}.csv`, [['Invoice', i.id], ['Customer', this.store.org().name], ['Period', i.period], ['Plan', s.plan], ['Seats', s.seats], ['Amount (AED)', i.amount], ['Status', i.status]]);
  }
  protected exportInv() {
    downloadCsv('invoices.csv', [['Invoice', 'Date', 'Period', 'Amount (AED)', 'Status'], ...this.store.invoices().map((i) => [i.id, i.date, i.period, i.amount, i.status])]);
  }
}
