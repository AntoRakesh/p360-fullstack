import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { Icon } from '../../shared/icon';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { PEOPLE, Person, TYPE_COUNTS } from './people.data';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* ======================= Temporary & Agency Workers ======================= */
type Temp = Person & { start: string; end: string; daysLeft: number; hours: number; rate: number; assignment: string };
const AGENCIES = ['StaffNow Agency', 'TempForce', 'GulfTalent Staffing', 'QuickHire'];
const TEMPS: Temp[] = (() => {
  const r = rng(33);
  const now = Date.now();
  return PEOPLE.filter((p) => p.type === 'Temporary').map((p) => {
    const startOff = Math.floor(r() * 150);
    const len = 60 + Math.floor(r() * 180);
    const daysLeft = len - startOff;
    return {
      ...p,
      start: iso(new Date(now - startOff * 86400000)),
      end: iso(new Date(now + daysLeft * 86400000)),
      daysLeft,
      hours: Math.round(20 + r() * 28),
      rate: Math.round(35 + r() * 40),
      assignment: daysLeft < 0 ? 'Ended' : daysLeft <= 14 ? 'Ending soon' : 'Active',
    };
  });
})();

@Component({
  selector: 'app-temp-workers',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Temporary &amp; Agency Workers" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Agency staff, assignment periods, hours and contract extensions." />
    <section class="kpi-row">
      <app-kpi label="Temporary Workers" [value]="list().length" icon="briefcase" color="var(--ka-14b8a6)" change="7%" />
      <app-kpi label="Ending in 14 days" [value]="cnt('Ending soon')" icon="clock" color="var(--ka-f59e0b)" sub="need decision" />
      <app-kpi label="Hours This Week" [value]="hours()" icon="activity" color="var(--ka-8b5cf6)" />
      <app-kpi label="Weekly Agency Cost" [value]="'AED ' + cost()" icon="trending-up" color="var(--ka-3b82f6)" />
      <app-kpi label="Converted to Employee" [value]="converted()" icon="user-check" color="var(--ka-22c55e)" sub="this session" />
    </section>
    <section class="dash">
      <div class="card span-5">
        <div class="card-head"><h3>Workers by Agency</h3></div>
        <app-bar-list [rows]="byAgency()" [max]="byAgency()[0].value" />
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Assignments Ending Soon</h3></div>
        <div class="ending">
          @for (t of endingSoon(); track t.id) {
            <div class="end-row">
              <span class="dt-av" [style.background]="t.avatar">{{ t.initials }}</span>
              <div><b>{{ t.name }}</b><small>{{ t.company }} · {{ t.designation }}</small></div>
              <span class="tag" [class.red]="t.daysLeft <= 5" [class.amber]="t.daysLeft > 5">{{ t.daysLeft }} days left</span>
              <button class="btn-ghost sm" (click)="act('extend', t)">Extend 30d</button>
            </div>
          } @empty {
            <p class="empty-note">No assignments ending in the next 14 days</p>
          }
        </div>
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="workers" [searchKeys]="['name', 'id', 'company', 'designation']" searchPlaceholder="Search worker, agency, role..."
          [filters]="filters" [actions]="actions" (action)="act($event.action, $event.row)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `.ending { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow: auto; }
    .end-row { display: grid; grid-template-columns: 32px 1fr auto auto; gap: 10px; align-items: center; padding: 6px 4px; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .end-row div { display: flex; flex-direction: column; } .end-row small { color: var(--muted); font-size: 11.5px; }`,
})
export class TempWorkers {
  protected readonly list = signal<Temp[]>(TEMPS);
  protected readonly converted = signal(0);
  protected readonly toast = signal<string | null>(null);
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Worker', kind: 'person', sub: 'id' },
    { key: 'company', label: 'Agency' },
    { key: 'designation', label: 'Role' },
    { key: 'site', label: 'Site' },
    { key: 'start', label: 'Start', fmt: shortDate },
    { key: 'end', label: 'End', fmt: shortDate },
    { key: 'hours', label: 'Hrs / wk', kind: 'num' },
    { key: 'rate', label: 'Rate (AED/h)', kind: 'num' },
    { key: 'assignment', label: 'Assignment', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'company', label: 'Agency', options: AGENCIES },
    { key: 'assignment', label: 'Assignment', options: ['Active', 'Ending soon', 'Ended'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'extend', label: 'Extend 30 days', icon: 'calendar-days' },
    { id: 'convert', label: 'Convert to employee', icon: 'user-check' },
    { id: 'end', label: 'End assignment', icon: 'ban', danger: true, when: (r) => r.assignment !== 'Ended' },
  ];
  protected readonly byAgency = computed(() =>
    AGENCIES.map((label) => {
      const v = this.list().filter((t) => t.company === label).length;
      return { label, value: v, display: String(v), color: 'var(--ka-14b8a6)' };
    }).sort((a, b) => b.value - a.value),
  );
  protected readonly endingSoon = computed(() => this.list().filter((t) => t.assignment === 'Ending soon').sort((a, b) => a.daysLeft - b.daysLeft));
  protected readonly hours = computed(() => this.list().filter((t) => t.assignment !== 'Ended').reduce((a, t) => a + t.hours, 0).toLocaleString());
  protected readonly cost = computed(() => `${Math.round(this.list().filter((t) => t.assignment !== 'Ended').reduce((a, t) => a + t.hours * t.rate, 0) / 1000)}K`);

  protected cnt(s: string) {
    return this.list().filter((t) => t.assignment === s).length;
  }
  protected act(a: string, t: Temp) {
    if (a === 'convert') {
      this.list.update((l) => l.filter((x) => x.id !== t.id));
      this.converted.update((n) => n + 1);
      return this.notify(`${t.name} converted to employee`);
    }
    this.list.update((l) =>
      l.map((x) => {
        if (x.id !== t.id) return x;
        if (a === 'end') return { ...x, assignment: 'Ended', daysLeft: 0, end: iso(new Date()) };
        const daysLeft = Math.max(x.daysLeft, 0) + 30;
        return { ...x, daysLeft, end: iso(new Date(Date.now() + daysLeft * 86400000)), assignment: daysLeft <= 14 ? 'Ending soon' : 'Active' };
      }),
    );
    this.notify(a === 'end' ? `Assignment ended for ${t.name}` : `${t.name} extended by 30 days`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Person Categories & Attributes ======================= */
interface Attr {
  name: string;
  type: string;
  required: boolean;
  visible: string;
}
interface Category {
  name: string;
  icon: string;
  color: string;
  count: number;
  access: string;
  prefix: string;
  retention: string;
  attrs: Attr[];
}
const COMMON: Attr[] = [
  { name: 'Full name', type: 'Text', required: true, visible: 'Everyone' },
  { name: 'Email', type: 'Email', required: true, visible: 'Everyone' },
  { name: 'Mobile', type: 'Phone', required: false, visible: 'HR & Security' },
  { name: 'Photo', type: 'Image', required: true, visible: 'Everyone' },
];
const CATEGORIES: Category[] = [
  { name: 'Employee', icon: 'users', color: 'var(--ka-7c3aed)', count: TYPE_COUNTS.Employee, access: 'Standard', prefix: 'EMP', retention: '7 years after exit', attrs: [...COMMON, { name: 'Department', type: 'Lookup', required: true, visible: 'Everyone' }, { name: 'Grade', type: 'Dropdown', required: true, visible: 'HR only' }, { name: 'Cost center', type: 'Text', required: false, visible: 'Finance' }, { name: 'Emergency contact', type: 'Text', required: true, visible: 'HR & Security' }] },
  { name: 'Contractor', icon: 'hard-hat', color: 'var(--ka-f97316)', count: TYPE_COUNTS.Contractor, access: 'Restricted', prefix: 'CON', retention: '3 years', attrs: [...COMMON, { name: 'Company', type: 'Lookup', required: true, visible: 'Everyone' }, { name: 'Trade', type: 'Dropdown', required: true, visible: 'Everyone' }, { name: 'Insurance expiry', type: 'Date', required: true, visible: 'Procurement' }] },
  { name: 'Visitor', icon: 'user-plus', color: 'var(--ka-3b82f6)', count: TYPE_COUNTS.Visitor, access: 'Escorted', prefix: 'VIS', retention: '90 days', attrs: [...COMMON, { name: 'Host', type: 'Lookup', required: true, visible: 'Everyone' }, { name: 'Purpose', type: 'Dropdown', required: true, visible: 'Everyone' }, { name: 'NDA signed', type: 'Yes / No', required: false, visible: 'Security' }] },
  { name: 'Temporary', icon: 'briefcase', color: 'var(--ka-14b8a6)', count: TYPE_COUNTS.Temporary, access: 'Standard', prefix: 'TMP', retention: '2 years', attrs: [...COMMON, { name: 'Agency', type: 'Lookup', required: true, visible: 'Everyone' }, { name: 'Contract end', type: 'Date', required: true, visible: 'HR only' }] },
  { name: 'Customer', icon: 'user', color: 'var(--ka-db2777)', count: 1200, access: 'Public areas', prefix: 'CUS', retention: 'Until consent withdrawn', attrs: [...COMMON.slice(0, 2), { name: 'Loyalty tier', type: 'Dropdown', required: false, visible: 'Marketing' }, { name: 'Marketing consent', type: 'Yes / No', required: true, visible: 'Marketing' }] },
  { name: 'VIP Guest', icon: 'star', color: 'var(--ka-ca8a04)', count: 46, access: 'Executive', prefix: 'VIP', retention: '1 year', attrs: [...COMMON, { name: 'Protocol notes', type: 'Long text', required: false, visible: 'Security' }] },
  { name: 'Intern', icon: 'graduation-cap', color: 'var(--ka-0891b2)', count: 312, access: 'Standard', prefix: 'INT', retention: '2 years', attrs: [...COMMON, { name: 'University', type: 'Text', required: true, visible: 'HR only' }, { name: 'Mentor', type: 'Lookup', required: true, visible: 'Everyone' }] },
];
const TYPES = ['Text', 'Long text', 'Email', 'Phone', 'Date', 'Dropdown', 'Lookup', 'Yes / No', 'Image', 'Number'];

@Component({
  selector: 'app-person-categories',
  imports: [Icon, ...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Person Categories &amp; Attributes" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Define person types, their default access and the profile fields each one collects.">
      <button class="btn-primary" (click)="newCat()"><app-icon name="plus" [size]="16" />Add Category</button>
    </app-page-head>
    <section class="cats">
      @for (c of cats(); track c.name) {
        <button class="card cat" [class.on]="sel() === c.name" (click)="sel.set(c.name)">
          <span class="cat-icon" [style.background]="c.color"><app-icon [name]="c.icon" [size]="20" /></span>
          <b>{{ c.name }}</b>
          <span class="muted">{{ c.count.toLocaleString() }} people · {{ c.attrs.length }} fields</span>
        </button>
      }
    </section>
    @if (cat(); as c) {
      <section class="dash">
        <div class="card span-4">
          <div class="card-head"><h3>{{ c.name }} settings</h3></div>
          <div class="form-grid one">
            <label>Category name<input class="input" [value]="c.name" (change)="patch({ name: $any($event.target).value })" /></label>
            <label>ID prefix<input class="input" [value]="c.prefix" (change)="patch({ prefix: $any($event.target).value })" /></label>
            <label>Default access level
              <select class="select" [value]="c.access" (change)="patch({ access: $any($event.target).value })">
                @for (a of levels; track a) {<option [value]="a">{{ a }}</option>}
              </select>
            </label>
            <label>Data retention<input class="input" [value]="c.retention" (change)="patch({ retention: $any($event.target).value })" /></label>
            <label>Colour<input class="input color" type="color" [value]="(c.color.startsWith('#') ? c.color : '#' + c.color.slice(-7, -1))" (input)="patch({ color: $any($event.target).value })" /></label>
          </div>
        </div>
        <div class="card span-8">
          <div class="card-head"><h3>Profile Attributes <span class="card-sub">{{ c.attrs.length }} fields</span></h3></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Visible to</th><th></th></tr></thead>
              <tbody>
                @for (a of c.attrs; track a.name; let i = $index) {
                  <tr>
                    <td><b>{{ a.name }}</b></td>
                    <td>{{ a.type }}</td>
                    <td><label class="sw"><input type="checkbox" [checked]="a.required" (change)="toggleReq(i)" /><span class="switch"></span></label></td>
                    <td>{{ a.visible }}</td>
                    <td><button class="link danger" (click)="removeAttr(i)" [disabled]="i < 2">{{ i < 2 ? 'System' : 'Remove' }}</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <form class="add-attr" (submit)="$event.preventDefault(); addAttr(n.value, t.value, v.value, r.checked); n.value = ''">
            <input #n class="input" placeholder="New field name" required />
            <select #t class="select">@for (x of types; track x) {<option>{{ x }}</option>}</select>
            <select #v class="select"><option>Everyone</option><option>HR only</option><option>HR &amp; Security</option><option>Security</option></select>
            <label class="req"><input #r type="checkbox" /> Required</label>
            <button class="btn-primary" type="submit">Add field</button>
          </form>
        </div>
      </section>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .cat { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; cursor: pointer; font-family: inherit; }
    .cat.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .cat-icon { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .one { grid-template-columns: 1fr; } .color { height: 36px; padding: 2px; }
    .sw input { display: none; } .sw { cursor: pointer; display: inline-block; }
    .switch { position: relative; display: inline-block; width: 34px; height: 20px; border-radius: 10px; background: var(--kb-d4d7e2); transition: background .15s; }
    .switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--kb-ffffff); transition: transform .15s; }
    .sw input:checked + .switch { background: var(--primary); } .sw input:checked + .switch::after { transform: translateX(14px); }
    .danger { color: var(--red); } .link:disabled { color: var(--muted); cursor: default; }
    .add-attr { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }
    .add-attr .input { flex: 1; min-width: 160px; } .req { font-size: 12.5px; display: flex; gap: 5px; align-items: center; }
  `,
})
export class PersonCategories {
  protected readonly levels = ['Public areas', 'Escorted', 'Standard', 'Restricted', 'Executive'];
  protected readonly types = TYPES;
  protected readonly cats = signal<Category[]>(CATEGORIES);
  protected readonly sel = signal('Employee');
  protected readonly toast = signal<string | null>(null);
  protected readonly cat = computed(() => this.cats().find((c) => c.name === this.sel()) ?? null);

  protected patch(change: Partial<Category>) {
    const cur = this.sel();
    this.cats.update((l) => l.map((c) => (c.name === cur ? { ...c, ...change } : c)));
    if (change.name) this.sel.set(change.name);
  }
  protected toggleReq(i: number) {
    const attrs = this.cat()!.attrs.map((a, j) => (j === i ? { ...a, required: !a.required } : a));
    this.patch({ attrs });
  }
  protected removeAttr(i: number) {
    this.patch({ attrs: this.cat()!.attrs.filter((_, j) => j !== i) });
  }
  protected addAttr(name: string, type: string, visible: string, required: boolean) {
    if (!name.trim()) return;
    this.patch({ attrs: [...this.cat()!.attrs, { name, type, visible, required }] });
    this.notify(`Field “${name}” added to ${this.sel()}`);
  }
  protected newCat() {
    const name = `New Category ${this.cats().length - 6}`;
    this.cats.update((l) => [...l, { name, icon: 'users', color: 'var(--ka-64748b)', count: 0, access: 'Standard', prefix: 'NEW', retention: '1 year', attrs: [...COMMON] }]);
    this.sel.set(name);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
