import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import {
  CAMERAS, dayLabel, H_CATS, H_CAT_COLOR, H_CAT_ICON, LOCATIONS, MONTHLY, MONTHS, Observation, OFFICERS, PEOPLE, PPE_TYPES, PPE_ZONES, PpeEvent, SafetyStore, Sev, SITES,
  SPerson, WAlert, avatarColor, initials, riskScore,
} from './safety.data';
import { ReportIncident, SafetyCam, SF_STYLES, SfToast } from './safety-shared';

const PARENT = 'Workplace Safety &amp; Wellbeing';

/* =====================================================================
   PPE & Compliance
   ===================================================================== */
@Component({
  selector: 'app-ppe-compliance',
  imports: [...UI, SafetyCam, ReportIncident, SfToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="PPE &amp; Compliance" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="AI camera PPE detection, violation handling, compliance by zone and PPE issuance & stock.">
      <button class="btn-primary" (click)="issueOpen.set(true)"><app-icon name="hard-hat" [size]="16" />Issue PPE</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export Violations</button>
    </app-page-head>
    <section class="kpi-row kpi5">
      <app-kpi label="PPE Compliance" [value]="store.ppePct() + '%'" icon="hard-hat" color="var(--ka-7c3aed)" change="5%" sub="vs. last week" />
      <app-kpi label="Violations Today" [value]="today().length" icon="triangle-alert" color="var(--ka-ef4444)" sub="AI detections" subColor="var(--ka-dc2626)" />
      <app-kpi label="Awaiting Review" [value]="newCount()" icon="eye" color="var(--ka-f59e0b)" sub="new detections" />
      <app-kpi label="AI Cameras Online" [value]="cams.length + '/' + cams.length" icon="s-camera" color="var(--ka-22c55e)" sub="all streams healthy" subColor="var(--ka-16a34a)" />
      <app-kpi label="PPE Issued (Month)" [value]="issued()" icon="box" color="var(--ka-3b82f6)" sub="items to 312 people" />
    </section>

    <section class="card mb">
      <div class="card-head"><h3>Live AI Camera Feeds</h3>
        <select class="select" style="width:auto" [value]="zone()" (change)="zone.set($any($event.target).value)"><option value="">All zones</option>@for (z of zones; track z.zone) {<option [value]="z.zone">{{ z.zone }}</option>}</select>
      </div>
      <div class="cams">
        @for (c of camList(); track c.id) {
          <button class="cam" [class.on]="camSel() === c.id" (click)="camSel.set(camSel() === c.id ? null : c.id)">
            <app-sf-cam [variant]="c.variant" [alert]="c.alert" [tick]="app.tick()" />
            <span><b>{{ c.name }}</b>@if (c.alert) {<em>{{ c.alert }}</em>} @else {<i>Compliant</i>}</span>
          </button>
        }
      </div>
    </section>

    <section class="grid3 mb">
      <div class="card"><div class="card-head"><h3>Compliance by PPE Type</h3></div>
        <ul class="pt">@for (t of types(); track t.name) {<li><app-icon [name]="t.icon" [size]="17" /><span>{{ t.name }}</span><div class="bar"><i [style.width.%]="t.pct" [style.background]="t.pct >= 92 ? 'var(--ka-22c55e)' : t.pct >= 87 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)'"></i></div><b>{{ t.pct }}%</b></li>}</ul>
      </div>
      <div class="card"><div class="card-head"><h3>Compliance by Zone</h3></div>
        <app-bar-list [rows]="zoneRows()" [max]="100" />
      </div>
      <div class="card"><div class="card-head"><h3>7-Day Compliance Trend</h3></div>
        <app-line-chart [labels]="days" [series]="trend" [height]="190" [min]="80" [max]="100" suffix="%" [legend]="false" />
      </div>
    </section>

    <section class="grid2">
      <div class="card">
        <div class="card-head"><h3>Violations {{ camSel() ? '· ' + camSel() : '' }}</h3>
          <div class="segs">@for (s of ['All', 'New', 'Acknowledged', 'Warning Issued', 'Incident Raised']; track s) {<button [class.on]="vf() === s" (click)="vf.set(s)">{{ s }}</button>}</div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Time</th><th>Camera / Zone</th><th>Missing PPE</th><th>Person</th><th>Conf.</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (e of events(); track e.id) {
                <tr>
                  <td>{{ e.daysAgo ? dayLabel(e.daysAgo).slice(0, 6) : 'Today' }}<div class="muted">{{ e.time }}</div></td><td>{{ e.cam }}<div class="muted">{{ e.zone }}</div></td>
                  <td><b>{{ e.missing }}</b></td><td>{{ e.person }}</td><td>{{ e.confidence }}%</td>
                  <td><span [class]="tag(e.status)">{{ e.status }}</span></td>
                  <td class="ra">
                    @if (e.status === 'New') {<button class="btn-ghost sm" (click)="setEv(e, 'Acknowledged')">Ack</button><button class="btn-ghost sm" (click)="setEv(e, 'False Positive')">False +</button>}
                    @if (e.status === 'New' || e.status === 'Acknowledged') {<button class="btn-ghost sm" (click)="setEv(e, 'Warning Issued')">Warn</button><button class="btn-ghost sm danger" (click)="raise(e)">Incident</button>}
                  </td>
                </tr>
              } @empty {<tr><td colspan="7" class="empty-note">No violations</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>PPE Stock &amp; Issuance</h3><button class="lnk" (click)="issueOpen.set(true)">Issue PPE</button></div>
        <table class="table">
          <thead><tr><th>Item</th><th class="num">In Stock</th><th class="num">Issued</th><th>Level</th><th></th></tr></thead>
          <tbody>
            @for (t of stock(); track t.name) {
              <tr><td><span class="it"><app-icon [name]="t.icon" [size]="16" />{{ t.name }}</span></td><td class="num">{{ t.stock }}</td><td class="num">{{ t.issued }}</td>
                <td><span [class]="t.stock - t.issued < 60 ? 'tag red' : t.stock - t.issued < 120 ? 'tag amber' : 'tag green'">{{ t.stock - t.issued < 60 ? 'Reorder' : t.stock - t.issued < 120 ? 'Low' : 'OK' }}</span></td>
                <td><button class="btn-ghost sm" (click)="reorder(t.name)">Reorder</button></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (issueOpen()) {
      <div class="g-overlay" (click)="issueOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); issue()">
        <div class="modal-head"><h3>Issue PPE</h3><button type="button" class="close-btn" (click)="issueOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label>Person<select class="select" [value]="iPerson()" (change)="iPerson.set($any($event.target).value)">@for (p of people; track p) {<option [value]="p">{{ p }}</option>}</select></label>
          <label>Item<select class="select" [value]="iItem()" (change)="iItem.set($any($event.target).value)">@for (t of stock(); track t.name) {<option [value]="t.name">{{ t.name }}</option>}</select></label>
          <label>Quantity<input class="input" type="number" min="1" [value]="iQty()" (input)="iQty.set(+$any($event.target).value)" /></label>
          <label>Size<select class="select"><option>M</option><option>L</option><option>XL</option><option>One size</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="issueOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Issue &amp; Record Signature</button></div>
      </form>
    }
    <app-sf-report /><app-sf-toast />
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; }
    .cams { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
    .cam { display: flex; flex-direction: column; gap: 6px; border: 0; padding: 0; background: none; cursor: pointer; font: inherit; text-align: left; }
    .cam app-sf-cam { aspect-ratio: 155 / 120; border-radius: 6px; } .cam.on app-sf-cam, .cam:hover app-sf-cam { outline: 2px solid var(--primary); }
    .cam span { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; } .cam b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cam em { color: var(--kf-dc2626); font-style: normal; white-space: nowrap; } .cam i { color: var(--kf-16a34a); font-style: normal; }
    .pt { list-style: none; margin: 0; padding: 0; } .pt li { display: grid; grid-template-columns: 22px 110px minmax(0, 1fr) 40px; gap: 8px; align-items: center; padding: 7px 0; font-size: 12.5px; } .pt app-icon { color: var(--primary); }
    .ra { white-space: nowrap; } .ra button { margin-left: 3px; } .danger { color: var(--red); } .it { display: inline-flex; gap: 7px; align-items: center; }
    .segs button { padding: 6px 8px; font-size: 11.5px; }
    @media (max-width: 1300px) { .cams { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `],
})
export class PpeCompliance {
  protected readonly store = inject(SafetyStore);
  protected readonly app = inject(AppState);
  protected readonly cams = CAMERAS;
  protected readonly zones = PPE_ZONES;
  protected readonly people = PEOPLE;
  protected readonly dayLabel = dayLabel;
  protected readonly days = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'];
  protected readonly trend = [{ name: 'Compliance', color: 'var(--ka-7c3aed)', values: [87, 88, 90, 89, 91, 90, 92], area: true }, { name: 'Target', color: 'var(--ka-22c55e)', values: [95, 95, 95, 95, 95, 95, 95], dashed: true }];
  protected readonly zone = signal('');
  protected readonly camSel = signal<string | null>(null);
  protected readonly vf = signal('All');
  protected readonly issueOpen = signal(false);
  protected readonly iPerson = signal(PEOPLE[0]);
  protected readonly iItem = signal(PPE_TYPES[0].name);
  protected readonly iQty = signal(1);
  protected readonly stock = signal(PPE_TYPES.map((t) => ({ ...t })));
  protected readonly issued = computed(() => 1460 + this.stock().reduce((a, t) => a + t.issued, 0) - PPE_TYPES.reduce((a, t) => a + t.issued, 0));
  protected readonly camList = computed(() => CAMERAS.filter((c) => !this.zone() || c.zone === this.zone()));
  protected readonly today = computed(() => this.store.ppeEvents().filter((e) => e.daysAgo === 0 && e.status !== 'False Positive'));
  protected readonly newCount = computed(() => this.store.ppeEvents().filter((e) => e.status === 'New').length);
  protected readonly events = computed(() =>
    this.store.ppeEvents().filter((e) => (this.vf() === 'All' || e.status === this.vf()) && (!this.camSel() || e.cam === this.camSel()) && (!this.zone() || e.zone === this.zone())),
  );
  protected readonly types = computed(() => PPE_TYPES.map((t) => ({ ...t, pct: t.pct + (this.zone() ? ((t.name.length + this.zone().length) % 5) - 2 : 0) })));
  protected readonly zoneRows = computed(() => PPE_ZONES.map((z) => ({ label: z.zone, value: z.pct, display: `${z.pct}%`, color: z.pct >= 92 ? 'var(--ka-22c55e)' : z.pct >= 88 ? 'var(--ka-f59e0b)' : 'var(--ka-ef4444)' })));
  protected tag(s: string) {
    return s === 'New' ? 'tag red' : s === 'Acknowledged' ? 'tag amber' : s === 'Warning Issued' ? 'tag blue' : s === 'Incident Raised' ? 'tag' : 'tag grey';
  }
  protected setEv(e: PpeEvent, s: PpeEvent['status']) {
    this.store.ppeEvents.update((l) => l.map((x) => (x.id === e.id ? { ...x, status: s } : x)));
    this.store.toast(s === 'Warning Issued' ? `Written warning issued to ${e.person} · supervisor copied` : `${e.id} marked ${s.toLowerCase()}`);
  }
  protected raise(e: PpeEvent) {
    this.store.ppeEvents.update((l) => l.map((x) => (x.id === e.id ? { ...x, status: 'Incident Raised' } : x)));
    this.store.reportOpen.set({ type: 'PPE Violation', location: e.zone, floor: 'Floor 1', severity: 'Medium', involved: e.person === 'Unidentified' ? [] : [e.person], description: `${e.missing} not worn – detected by ${e.cam} (${e.confidence}% confidence) at ${e.time}.` });
  }
  protected issue() {
    this.stock.update((l) => l.map((t) => (t.name === this.iItem() ? { ...t, issued: t.issued + this.iQty() } : t)));
    this.issueOpen.set(false);
    this.store.toast(`${this.iQty()} × ${this.iItem()} issued to ${this.iPerson()}`);
  }
  protected reorder(n: string) {
    this.stock.update((l) => l.map((t) => (t.name === n ? { ...t, stock: t.stock + 200 } : t)));
    this.store.toast(`Purchase request raised for 200 × ${n}`);
  }
  protected exportCsv() {
    downloadCsv('ppe-violations.csv', [['ID', 'Date', 'Time', 'Camera', 'Zone', 'Missing', 'Person', 'Confidence', 'Status'], ...this.store.ppeEvents().map((e) => [e.id, dayLabel(e.daysAgo), e.time, e.cam, e.zone, e.missing, e.person, e.confidence, e.status])]);
  }
}

/* =====================================================================
   Safety Observations (Near Miss)
   ===================================================================== */
const O_KINDS: Observation['kind'][] = ['Near Miss', 'Unsafe Act', 'Unsafe Condition', 'Safe Behaviour'];
const O_FLOW: Observation['status'][] = ['Reported', 'Reviewed', 'Action Assigned', 'Closed'];
@Component({
  selector: 'app-safety-observations-near-miss',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Safety Observations (Near Miss)" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Capture near misses, unsafe acts and conditions from anyone on site, and drive them to closure.">
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="15" />Export</button>
    </app-page-head>
    <section class="kpi-row kpi6">
      <app-kpi label="Observations (Month)" [value]="month().length" icon="activity" color="var(--ka-7c3aed)" change="18%" sub="vs. last month" />
      <app-kpi label="Near Misses" [value]="k('Near Miss')" icon="triangle-alert" color="var(--ka-f59e0b)" sub="potential incidents" />
      <app-kpi label="Unsafe Acts" [value]="k('Unsafe Act')" icon="user" color="var(--ka-ef4444)" sub="behavioural" />
      <app-kpi label="Unsafe Conditions" [value]="k('Unsafe Condition')" icon="s-cog" color="var(--ka-3b82f6)" sub="physical / environment" />
      <app-kpi label="Closed" [value]="closedPct() + '%'" icon="shield-check" color="var(--ka-22c55e)" sub="of this month's reports" subColor="var(--ka-16a34a)" />
      <app-kpi label="Safe Behaviours" [value]="k('Safe Behaviour')" icon="star" color="var(--ka-14b8a6)" sub="recognitions" />
    </section>
    <section class="split">
      <div class="card">
        <div class="card-head"><h3>Observation Feed</h3>
          <div class="toolbar">
            <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
            <select class="select" style="width:auto" [value]="fk()" (change)="fk.set($any($event.target).value)"><option value="">All types</option>@for (x of kinds; track x) {<option [value]="x">{{ x }}</option>}</select>
            <select class="select" style="width:auto" [value]="fc()" (change)="fc.set($any($event.target).value)"><option value="">All categories</option>@for (x of cats; track x) {<option [value]="x">{{ x }}</option>}</select>
            <select class="select" style="width:auto" [value]="fs()" (change)="fs.set($any($event.target).value)"><option value="">All statuses</option>@for (x of flow; track x) {<option [value]="x">{{ x }}</option>}</select>
          </div>
        </div>
        <ul class="feed">
          @for (o of shown(); track o.id) {
            <li>
              <span class="ic-sq" [style.background]="'color-mix(in srgb, ' + catColor(o.category) + ' 13%, transparent)'" [style.color]="catColor(o.category)"><app-icon [name]="catIcon(o.category)" [size]="16" /></span>
              <div class="bd">
                <div class="r1"><b>{{ o.text }}</b><span [class]="kindTag(o.kind)">{{ o.kind }}</span>@if (o.potential === 'High') {<span class="tag red">High potential</span>}</div>
                <small>{{ o.id }} · {{ o.category }} · {{ o.location }} · {{ o.anonymous ? 'Anonymous' : o.by }} · {{ o.daysAgo ? dayLabel(o.daysAgo) : 'Today' }}</small>
                <div class="flow">@for (s of flow; track s; let i = $index) {<span [class.on]="flow.indexOf(o.status) >= i">{{ s }}</span>}</div>
              </div>
              <div class="oa">
                @if (o.status !== 'Closed') {<button class="btn-ghost sm" (click)="advance(o)">{{ nextLabel(o) }}</button>}
                @if (o.kind !== 'Safe Behaviour' && o.status !== 'Closed') {<button class="btn-ghost sm" (click)="toHazard(o)">→ Hazard</button>}
              </div>
            </li>
          } @empty {<li class="muted">No observations match.</li>}
        </ul>
        @if (filtered().length > limit()) {<button class="btn-ghost more" (click)="limit.set(limit() + 15)">Show more ({{ filtered().length - limit() }} remaining)</button>}
      </div>
      <div class="side">
        <form class="card mb" (submit)="$event.preventDefault(); submit()">
          <div class="card-head"><h3>Report an Observation</h3></div>
          <div class="kinds">@for (x of kinds; track x) {<button type="button" [class.on]="fKind() === x" (click)="fKind.set(x)">{{ x }}</button>}</div>
          <div class="form-grid">
            <label>Category<select class="select" [value]="fCat()" (change)="fCat.set($any($event.target).value)">@for (x of cats; track x) {<option [value]="x">{{ x }}</option>}</select></label>
            <label>Location<select class="select" [value]="fLoc()" (change)="fLoc.set($any($event.target).value)">@for (x of locations; track x) {<option [value]="x">{{ x }}</option>}</select></label>
            <label class="full">What did you observe? *<textarea class="input ta" required [value]="fText()" (input)="fText.set($any($event.target).value)"></textarea></label>
            <label>Potential severity<select class="select" [value]="fPot()" (change)="fPot.set($any($event.target).value)"><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label class="anon"><input type="checkbox" [checked]="fAnon()" (change)="fAnon.set(!fAnon())" /> Submit anonymously</label>
          </div>
          <div class="form-actions"><button class="btn-primary" type="submit"><app-icon name="s-send" [size]="15" />Submit</button></div>
        </form>
        <div class="card mb"><div class="card-head"><h3>By Category (Month)</h3></div><app-bar-list [rows]="catRows()" [max]="catMax()" /></div>
        <div class="card"><div class="card-head"><h3>Top Reporters</h3><span class="muted">this month</span></div>
          <ul class="lb">@for (r of reporters(); track r.name; let i = $index) {<li><em>{{ i + 1 }}</em><span class="av" [style.background]="avatarColor(r.name)">{{ initials(r.name) }}</span><span>{{ r.name }}</span><b>{{ r.n }}</b></li>}</ul>
        </div>
      </div>
    </section>
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; }
    .feed { list-style: none; margin: 0; padding: 0; } .feed li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--kl-f1f2f7); }
    .bd { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 12.5px; } .r1 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .bd small { color: var(--muted); font-size: 11.5px; }
    .flow { display: flex; gap: 3px; margin-top: 3px; } .flow span { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--kb-f1f2f7); color: var(--kf-9ca3af); } .flow span.on { background: var(--kb-ede9fe); color: var(--kf-6d28d9); }
    .oa { display: flex; flex-direction: column; gap: 4px; align-items: stretch; } .more { width: 100%; justify-content: center; margin-top: 10px; }
    .kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; } .kinds button { height: 34px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font: inherit; font-size: 12px; cursor: pointer; }
    .kinds button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .ta { height: 70px; padding-top: 8px; } .anon { flex-direction: row !important; align-items: center; gap: 6px !important; align-self: end; padding-bottom: 8px; }
    .lb { list-style: none; margin: 0; padding: 0; } .lb li { display: grid; grid-template-columns: 18px 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; } .lb em { font-style: normal; color: var(--muted); }
  `],
})
export class SafetyObservations {
  protected readonly store = inject(SafetyStore);
  protected readonly kinds = O_KINDS;
  protected readonly flow = O_FLOW;
  protected readonly cats = H_CATS;
  protected readonly locations = LOCATIONS;
  protected readonly dayLabel = dayLabel;
  protected readonly initials = initials;
  protected readonly avatarColor = avatarColor;
  protected readonly q = signal('');
  protected readonly fk = signal('');
  protected readonly fc = signal('');
  protected readonly fs = signal('');
  protected readonly limit = signal(15);
  protected readonly fKind = signal<Observation['kind']>('Near Miss');
  protected readonly fCat = signal(H_CATS[0]);
  protected readonly fLoc = signal(LOCATIONS[0]);
  protected readonly fText = signal('');
  protected readonly fPot = signal<Sev>('Medium');
  protected readonly fAnon = signal(false);
  protected readonly month = computed(() => this.store.observations().filter((o) => o.thisMonth));
  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.observations().filter((o) => (!this.fk() || o.kind === this.fk()) && (!this.fc() || o.category === this.fc()) && (!this.fs() || o.status === this.fs()) && (!q || `${o.id} ${o.text} ${o.location} ${o.by}`.toLowerCase().includes(q)));
  });
  protected readonly shown = computed(() => this.filtered().slice(0, this.limit()));
  protected readonly closedPct = computed(() => Math.round((this.month().filter((o) => o.status === 'Closed').length / Math.max(1, this.month().length)) * 100));
  protected readonly catRows = computed(() => H_CATS.map((c, i) => ({ label: c, value: this.store.catCounts()[i], color: H_CAT_COLOR[i] })));
  protected readonly catMax = computed(() => Math.max(...this.store.catCounts()) * 1.1);
  protected readonly reporters = computed(() => {
    const m = new Map<string, number>();
    this.month().filter((o) => !o.anonymous).forEach((o) => m.set(o.by, (m.get(o.by) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
  });
  protected k(kind: string) {
    return this.month().filter((o) => o.kind === kind).length;
  }
  protected catColor(c: string) {
    return H_CAT_COLOR[H_CATS.indexOf(c)] ?? 'var(--ka-9ca3af)';
  }
  protected catIcon(c: string) {
    return H_CAT_ICON[H_CATS.indexOf(c)] ?? 'triangle-alert';
  }
  protected kindTag(k: string) {
    return k === 'Near Miss' ? 'tag amber' : k === 'Unsafe Act' ? 'tag red' : k === 'Safe Behaviour' ? 'tag green' : 'tag blue';
  }
  protected nextLabel(o: Observation) {
    return ['Review', 'Assign Action', 'Close'][O_FLOW.indexOf(o.status)];
  }
  private patch(id: string, p: Partial<Observation>) {
    this.store.observations.update((l) => l.map((o) => (o.id === id ? { ...o, ...p } : o)));
  }
  protected advance(o: Observation) {
    const s = O_FLOW[O_FLOW.indexOf(o.status) + 1];
    this.patch(o.id, { status: s });
    this.store.toast(`${o.id} → ${s}`);
  }
  protected toHazard(o: Observation) {
    const h = this.store.addHazard({ title: o.text, category: o.category, location: o.location, floor: 'Floor 2', likelihood: 3, impact: o.potential === 'High' ? 4 : 2, status: 'Open', owner: OFFICERS[0], due: 7, reportedBy: o.anonymous ? 'Anonymous' : o.by, daysAgo: 0, controls: [{ text: 'Barricade / signpost the area', done: false }] });
    this.patch(o.id, { status: 'Action Assigned' });
    this.store.toast(`${h.id} created in hazard register from ${o.id}`);
  }
  protected submit() {
    const o = this.store.addObservation({ kind: this.fKind(), category: this.fCat(), text: this.fText(), location: this.fLoc(), by: 'Rex Kumar', daysAgo: 0, status: 'Reported', anonymous: this.fAnon(), potential: this.fPot(), thisMonth: true });
    this.fText.set('');
    this.store.toast(`${o.id} submitted · thank you for speaking up!`);
  }
  protected exportCsv() {
    downloadCsv('safety-observations.csv', [['ID', 'Date', 'Type', 'Category', 'Observation', 'Location', 'Reported by', 'Potential', 'Status'], ...this.filtered().map((o) => [o.id, dayLabel(o.daysAgo), o.kind, o.category, o.text, o.location, o.anonymous ? 'Anonymous' : o.by, o.potential, o.status])]);
  }
}

/* =====================================================================
   Health & Wellbeing
   ===================================================================== */
const WBGT = [
  { zone: 'Loading Dock', wbgt: 31.2, level: 'High' }, { zone: 'Production Area', wbgt: 28.4, level: 'Moderate' }, { zone: 'Warehouse', wbgt: 27.1, level: 'Moderate' },
  { zone: 'Construction Area', wbgt: 30.1, level: 'High' }, { zone: 'Workshop', wbgt: 25.6, level: 'Low' }, { zone: 'Office Area', wbgt: 21.8, level: 'Low' },
];
@Component({
  selector: 'app-health-wellbeing',
  imports: [...UI, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Health &amp; Wellbeing" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Wearable alerts, heat stress, fatigue, medical cases and wellbeing programmes for every worker.">
      <button class="btn-primary" (click)="checkin()"><app-icon name="s-heart-pulse" [size]="16" />Send Wellbeing Check-in</button>
      <a class="btn-ghost" routerLink="/safety-wellbeing/reports-analytics"><app-icon name="file-chart" [size]="15" />Reports</a>
    </app-page-head>
    <section class="kpi-row kpi6">
      <app-kpi label="Wellbeing Alerts" [value]="store.openWAlerts().length" icon="heart" color="var(--ka-3b82f6)" change="200%" [good]="false" sub="vs. last 24 hrs" />
      <app-kpi label="Medical Attention" [value]="medical().length" icon="s-first-aid" color="var(--ka-ef4444)" sub="people right now" subColor="var(--ka-dc2626)" />
      <app-kpi label="First Aid Cases (Month)" value="14" icon="s-first-aid" color="var(--ka-22c55e)" change="8%" [up]="false" sub="vs. last month" />
      <app-kpi label="Heat Stress Zones" [value]="hot()" icon="s-thermo" color="var(--ka-f97316)" sub="WBGT ≥ 30 °C" />
      <app-kpi label="Wellbeing Index" value="7.4/10" icon="s-brain" color="var(--ka-7c3aed)" change="0.3" sub="pulse survey" />
      <app-kpi label="EAP Sessions (Month)" [value]="eap()" icon="message" color="var(--ka-14b8a6)" sub="confidential" />
    </section>
    <section class="grid2 mb">
      <div class="card">
        <div class="card-head"><h3>Live Wellbeing Alerts</h3><div class="segs"><button [class.on]="!showAll()" (click)="showAll.set(false)">Open</button><button [class.on]="showAll()" (click)="showAll.set(true)">All</button></div></div>
        <ul class="al">
          @for (a of alerts(); track a.id) {
            <li [class.res]="a.status === 'Resolved'">
              <span class="ic-sq" [style.background]="'color-mix(in srgb, ' + lvl(a.level) + ' 12%, transparent)'" [style.color]="lvl(a.level)"><app-icon [name]="a.icon" [size]="17" /></span>
              <div><b>{{ a.kind }} · {{ a.person }}</b><small>{{ a.detail }}</small><small class="muted">{{ a.id }} · {{ a.time }} · <span [class]="a.status === 'Open' ? 'bad' : a.status === 'Acknowledged' ? 'warn-t' : 'good'">{{ a.status }}</span></small></div>
              <div class="aa">
                @if (a.status === 'Open') {<button class="btn-ghost sm" (click)="setA(a, 'Acknowledged', 'Alert acknowledged · supervisor notified')">Acknowledge</button>}
                @if (a.status !== 'Resolved') {
                  <button class="btn-ghost sm" (click)="setA(a, a.status, 'Rest break (20 min) sent to ' + a.person)">Rest Break</button>
                  <button class="btn-ghost sm" (click)="setA(a, a.status, a.person + ' referred to site clinic')">Refer to Clinic</button>
                  <button class="btn-primary sm" (click)="setA(a, 'Resolved', a.kind + ' alert resolved')">Resolve</button>
                }
              </div>
            </li>
          } @empty {<li class="muted">No open alerts 🎉</li>}
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>People Needing Medical Attention</h3></div>
        <ul class="al">
          @for (p of medical(); track p.id) {
            <li><span class="av" [style.background]="avatarColor(p.name)">{{ initials(p.name) }}</span>
              <div><b>{{ p.name }}</b><small>{{ p.note }}</small><small class="muted">{{ p.id }} · {{ p.floor }} – {{ p.zone }}</small></div>
              <div class="aa"><button class="btn-ghost sm" (click)="store.toast('Paramedic dispatched to ' + p.zone)">Dispatch</button><button class="btn-primary sm" (click)="recover(p)">Mark Recovered</button></div></li>
          } @empty {<li class="muted">Nobody needs medical attention.</li>}
        </ul>
      </div>
    </section>
    <section class="grid3">
      <div class="card">
        <div class="card-head"><h3>Heat Stress Index (WBGT)</h3><span class="muted">live</span></div>
        <ul class="hs">@for (z of heat(); track z.zone) {<li><span>{{ z.zone }}</span><b>{{ z.v }} °C</b><span [class]="z.level === 'High' ? 'tag red' : z.level === 'Moderate' ? 'tag amber' : 'tag green'">{{ z.level }}</span><small>{{ z.level === 'High' ? '15 min rest / hr' : z.level === 'Moderate' ? 'hydrate every 20 min' : 'normal work' }}</small></li>}</ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Wellbeing Pulse</h3><span class="muted">monthly survey</span></div>
        <app-line-chart [labels]="months" [series]="pulse" [height]="200" [min]="5" [max]="10" />
      </div>
      <div class="card">
        <div class="card-head"><h3>Wellbeing Programmes</h3></div>
        <ul class="pg">
          @for (g of programs(); track g.name) {
            <li><span class="ic-sq" [style.background]="'color-mix(in srgb, ' + g.color + ' 12%, transparent)'" [style.color]="g.color"><app-icon [name]="g.icon" [size]="16" /></span><div><b>{{ g.name }}</b><small>{{ g.when }} · {{ g.n }} enrolled</small></div>
              <button class="btn-ghost sm" [class.on]="g.joined" (click)="join(g.name)">{{ g.joined ? 'Enrolled ✓' : 'Promote' }}</button></li>
          }
        </ul>
      </div>
    </section>
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; } a.btn-ghost { text-decoration: none; }
    .al, .hs, .pg { list-style: none; margin: 0; padding: 0; }
    .al li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12.5px; } .al li.res { opacity: .55; }
    .al li > div:not(.aa) { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .al small { font-size: 11.5px; color: var(--kf-4b4f6b); }
    .aa { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 270px; } .btn-primary.sm { padding: 4px 9px; font-size: 11.5px; }
    .hs li { display: grid; grid-template-columns: minmax(0, 1fr) 60px 74px; gap: 4px 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12.5px; } .hs small { grid-column: 1 / -1; color: var(--muted); font-size: 11px; }
    .pg li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; font-size: 12.5px; } .pg div { display: flex; flex-direction: column; } .pg small { color: var(--muted); }
    .btn-ghost.on { color: var(--kf-15803d); border-color: var(--kl-bbf7d0); background: var(--kb-f0fdf4); }
  `],
})
export class HealthWellbeing {
  protected readonly store = inject(SafetyStore);
  private readonly app = inject(AppState);
  protected readonly months = MONTHS;
  protected readonly initials = initials;
  protected readonly avatarColor = avatarColor;
  protected readonly pulse = [
    { name: 'Wellbeing', color: 'var(--ka-7c3aed)', values: [7.0, 7.1, 6.9, 7.2, 7.1, 7.4], area: true },
    { name: 'Workload', color: 'var(--ka-f59e0b)', values: [6.4, 6.2, 6.0, 6.5, 6.6, 6.8] },
    { name: 'Psych. safety', color: 'var(--ka-22c55e)', values: [7.6, 7.7, 7.8, 7.7, 7.9, 8.1] },
  ];
  protected readonly showAll = signal(false);
  protected readonly joined = signal<string[]>([]);
  protected readonly eap = signal(23);
  protected readonly alerts = computed(() => this.store.wAlerts().filter((a) => this.showAll() || a.status !== 'Resolved'));
  protected readonly medical = computed(() => this.store.atRisk().filter((p) => p.status === 'Medical Attention'));
  protected readonly heat = computed(() => WBGT.map((z) => ({ ...z, v: (z.wbgt + this.app.wobble(z.zone, 3) / 10).toFixed(1) })));
  protected readonly hot = computed(() => WBGT.filter((z) => z.wbgt >= 30).length);
  protected readonly programs = computed(() =>
    [
      { name: 'Mental Health First Aiders', icon: 's-brain', color: 'var(--ka-7c3aed)', when: '12 trained aiders', n: 12 },
      { name: 'Hydration Challenge', icon: 's-droplet', color: 'var(--ka-3b82f6)', when: 'Summer · daily', n: 214 },
      { name: 'Back Care & Ergonomics', icon: 'user', color: 'var(--ka-f59e0b)', when: 'Tue 1:00 PM', n: 48 },
      { name: 'Sleep & Fatigue Clinic', icon: 's-moon', color: 'var(--ka-0d9488)', when: 'Thu 3:00 PM', n: 31 },
      { name: 'Quit Smoking Support', icon: 's-heart-pulse', color: 'var(--ka-ef4444)', when: 'Monthly', n: 17 },
    ].map((g) => ({ ...g, joined: this.joined().includes(g.name), n: g.n + (this.joined().includes(g.name) ? 25 : 0) })),
  );
  protected lvl(l: Sev) {
    return l === 'High' || l === 'Critical' ? 'var(--ka-ef4444)' : l === 'Medium' ? 'var(--ka-f59e0b)' : 'var(--ka-3b82f6)';
  }
  protected setA(a: WAlert, s: WAlert['status'], msg: string) {
    this.store.wAlerts.update((l) => l.map((x) => (x.id === a.id ? { ...x, status: s } : x)));
    this.store.toast(msg);
  }
  protected recover(p: SPerson) {
    this.store.setPerson(p.id, 'Safe', 'Recovered – back to work');
    this.store.toast(`${p.name} marked recovered`);
  }
  protected join(n: string) {
    this.joined.update((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]));
    if (this.joined().includes(n)) this.store.toast(`${n} promoted to all staff via app & email`);
  }
  protected checkin() {
    this.eap.update((v) => v);
    this.store.toast('Wellbeing check-in sent to 842 people on site · results in 24 h');
  }
}

/* =====================================================================
   Reports & Analytics
   ===================================================================== */
interface Rep { id: string; name: string; icon: string; desc: string; color: string }
const REPORTS: Rep[] = [
  { id: 'hse', name: 'Monthly HSE Report', icon: 'file-chart', desc: 'KPIs, incidents, hazards, inspections & training', color: 'var(--ka-7c3aed)' },
  { id: 'inc', name: 'Incident Register', icon: 'siren', desc: 'All incidents with severity, status & root cause', color: 'var(--ka-ef4444)' },
  { id: 'hz', name: 'Hazard Register', icon: 'triangle-alert', desc: 'Open & closed hazards with risk scores', color: 'var(--ka-f59e0b)' },
  { id: 'ppe', name: 'PPE Compliance', icon: 'hard-hat', desc: 'AI detections and compliance by zone', color: 'var(--ka-8b5cf6)' },
  { id: 'ins', name: 'Inspection Summary', icon: 's-clipboard', desc: 'Scores, findings and overdue inspections', color: 'var(--ka-3b82f6)' },
  { id: 'ptw', name: 'Permit-to-Work Log', icon: 'key-round', desc: 'All permits with approvals & durations', color: 'var(--ka-0d9488)' },
  { id: 'obs', name: 'Observations & Near Miss', icon: 'activity', desc: 'Leading indicator report by category', color: 'var(--ka-f97316)' },
  { id: 'wb', name: 'Wellbeing Summary', icon: 'heart', desc: 'Alerts, medical cases & programme uptake', color: 'var(--ka-22c55e)' },
];
@Component({
  selector: 'app-reports-analytics',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Safety Reports &amp; Analytics" parent="${PARENT}" parentLink="/safety-wellbeing/safety-command-center" subtitle="Leading and lagging safety indicators, regulatory reports and scheduled distribution.">
      <select class="select" style="width:auto" [value]="site()" (change)="site.set($any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select>
      <select class="select" style="width:auto" [value]="period()" (change)="period.set($any($event.target).value)"><option>Last 6 Months</option><option>Year to Date</option><option>Last 12 Months</option></select>
      <button class="btn-primary" (click)="download(reports[0])"><app-icon name="download" [size]="15" />Download HSE Pack</button>
    </app-page-head>
    <section class="kpi-row kpi6">
      <app-kpi label="TRIR" [value]="(0.82 * f()).toFixed(2)" icon="activity" color="var(--ka-7c3aed)" change="11%" [up]="false" sub="per 200k hrs" />
      <app-kpi label="LTIFR" [value]="(0.21 * f()).toFixed(2)" icon="s-first-aid" color="var(--ka-ef4444)" change="25%" [up]="false" sub="per 1M hrs" />
      <app-kpi label="Days Since Last LTI" [value]="days()" icon="calendar-days" color="var(--ka-22c55e)" sub="record: 214 days" subColor="var(--ka-16a34a)" />
      <app-kpi label="Near Miss : Incident" [value]="ratio() + ' : 1'" icon="triangle-alert" color="var(--ka-f59e0b)" sub="healthy reporting culture" />
      <app-kpi label="Inspections On Time" value="89%" icon="s-clipboard" color="var(--ka-3b82f6)" change="4%" sub="vs. last period" />
      <app-kpi label="Training Compliance" value="90%" icon="graduation-cap" color="var(--ka-14b8a6)" change="2%" sub="vs. last period" />
    </section>
    <section class="grid2 mb">
      <div class="card"><div class="card-head"><h3>Incidents by Month &amp; Severity</h3></div><app-column-chart [labels]="months()" [series]="monthly()" [stacked]="true" [height]="230" /></div>
      <div class="card"><div class="card-head"><h3>Leading vs Lagging Indicators</h3></div><app-line-chart [labels]="months()" [series]="leadLag()" [height]="230" /></div>
    </section>
    <section class="grid3 mb">
      <div class="card"><div class="card-head"><h3>Incidents by Site</h3></div><app-bar-list [rows]="bySite()" [max]="siteMax()" /></div>
      <div class="card"><div class="card-head"><h3>Root Causes (Closed)</h3></div><app-donut [segments]="roots()" center="Closed" [size]="130" /></div>
      <div class="card"><div class="card-head"><h3>Hazard Risk Profile</h3></div><app-donut [segments]="riskProfile()" center="Open" [size]="130" /></div>
    </section>
    <section class="grid2">
      <div class="card">
        <div class="card-head"><h3>Report Library</h3></div>
        <div class="lib">
          @for (r of reports; track r.id) {
            <div class="rp"><span class="ic-sq" [style.background]="'color-mix(in srgb, ' + r.color + ' 12%, transparent)'" [style.color]="r.color"><app-icon [name]="r.icon" [size]="17" /></span><div><b>{{ r.name }}</b><small>{{ r.desc }}</small></div>
              <div class="rb"><button class="btn-ghost sm" (click)="preview.set(r)">Preview</button><button class="btn-ghost sm" (click)="download(r)"><app-icon name="download" [size]="13" />CSV</button></div></div>
          }
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Scheduled Distribution</h3><button class="lnk" (click)="addSchedule()">+ Add schedule</button></div>
        <table class="table">
          <thead><tr><th>Report</th><th>Frequency</th><th>Recipients</th><th>Next run</th><th>Active</th><th></th></tr></thead>
          <tbody>
            @for (s of schedules(); track s.id) {
              <tr><td>{{ s.report }}</td><td>{{ s.freq }}</td><td>{{ s.to }}</td><td>{{ s.next }}</td>
                <td><label class="sw"><input type="checkbox" [checked]="s.on" (change)="toggleSch(s.id)" /><i></i></label></td>
                <td><button class="btn-ghost sm" (click)="store.toast(s.report + ' sent to ' + s.to)">Run now</button></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (preview(); as r) {
      <div class="g-overlay" (click)="preview.set(null)"></div>
      <div class="g-modal wide">
        <div class="modal-head"><h3>{{ r.name }} <small class="muted">· {{ site() }} · {{ period() }}</small></h3><button class="close-btn" (click)="preview.set(null)">×</button></div>
        <div class="table-wrap pv">
          <table class="table">
            <thead><tr>@for (h of rows(r)[0]; track $index) {<th>{{ h }}</th>}</tr></thead>
            <tbody>@for (row of rows(r).slice(1, 16); track $index) {<tr>@for (c of row; track $index) {<td>{{ c }}</td>}</tr>}</tbody>
          </table>
        </div>
        <p class="muted">Showing up to 15 of {{ rows(r).length - 1 }} rows.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="store.toast('Sent to print queue')"><app-icon name="s-printer" [size]="15" />Print</button><button class="btn-primary" (click)="download(r)"><app-icon name="download" [size]="15" />Download CSV</button></div>
      </div>
    }
    @if (store.toastMsg()) {<div class="g-toast">{{ store.toastMsg() }}</div>}
  `,
  styles: [SF_STYLES, `
    .mb { margin-bottom: 12px; }
    .lib { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .rp { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 4px 10px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 12.5px; }
    .rp div:not(.rb) { display: flex; flex-direction: column; } .rp small { color: var(--muted); font-size: 11.5px; } .rb { grid-column: 2; display: flex; gap: 6px; margin-top: 4px; }
    .sw { position: relative; display: inline-block; width: 34px; height: 19px; } .sw input { opacity: 0; width: 0; height: 0; }
    .sw i { position: absolute; inset: 0; border-radius: 20px; background: var(--kb-d1d5db); cursor: pointer; transition: .2s; } .sw i::before { content: ''; position: absolute; left: 2px; top: 2px; width: 15px; height: 15px; border-radius: 50%; background: var(--kb-ffffff); transition: .2s; }
    .sw input:checked + i { background: var(--primary); } .sw input:checked + i::before { transform: translateX(15px); }
    .pv { max-height: 55vh; overflow: auto; }
  `],
})
export class SafetyReports {
  protected readonly store = inject(SafetyStore);
  protected readonly sites = SITES;
  protected readonly reports = REPORTS;
  protected readonly site = signal('All Sites');
  protected readonly period = signal('Last 6 Months');
  protected readonly preview = signal<Rep | null>(null);
  protected readonly schedules = signal([
    { id: 1, report: 'Monthly HSE Report', freq: 'Monthly · 1st', to: 'Leadership team', next: dayLabel(-26), on: true },
    { id: 2, report: 'Incident Register', freq: 'Weekly · Mon', to: 'HSE managers', next: dayLabel(-4), on: true },
    { id: 3, report: 'PPE Compliance', freq: 'Daily · 07:00', to: 'Site supervisors', next: dayLabel(-1), on: true },
    { id: 4, report: 'Wellbeing Summary', freq: 'Monthly · 5th', to: 'HR & Wellbeing', next: dayLabel(-30), on: false },
  ]);
  protected readonly f = computed(() => ({ 'All Sites': 1, 'Head Office': 0.8, 'Manufacturing Plant': 1.4, 'Central Warehouse': 1.2, 'Logistics Hub': 0.9 })[this.site()] ?? 1);
  protected readonly days = computed(() => (this.site() === 'Manufacturing Plant' ? 41 : 128));
  protected readonly months = computed(() => (this.period() === 'Last 6 Months' ? MONTHS : this.period() === 'Year to Date' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'] : ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']));
  private ext(v: number[]) {
    const n = this.months().length;
    return Array.from({ length: n }, (_, i) => Math.round((i >= n - v.length ? v[i - (n - v.length)] : v[(i * 5) % v.length] * (0.9 + (i % 3) * 0.06)) * this.f()));
  }
  protected readonly monthly = computed(() => [
    { name: 'High', color: 'var(--ka-ef4444)', values: this.ext(MONTHLY.High) },
    { name: 'Medium', color: 'var(--ka-f59e0b)', values: this.ext(MONTHLY.Medium) },
    { name: 'Low', color: 'var(--ka-22c55e)', values: this.ext(MONTHLY.Low) },
  ]);
  protected readonly leadLag = computed(() => [
    { name: 'Observations (leading)', color: 'var(--ka-7c3aed)', values: this.ext([71, 78, 82, 88, 90, 96]), area: true },
    { name: 'Incidents (lagging)', color: 'var(--ka-ef4444)', values: this.ext(MONTHLY.Total) },
    { name: 'Inspections', color: 'var(--ka-3b82f6)', values: this.ext([22, 24, 26, 25, 28, 30]) },
  ]);
  protected readonly ratio = computed(() => (this.store.observations().length / Math.max(1, this.store.incidents().filter((i) => i.daysAgo <= 30).length)).toFixed(1));
  protected readonly bySite = computed(() => SITES.map((s, i) => ({ label: s, value: Math.round([96, 71, 52, 37][i] * (this.site() === 'All Sites' || this.site() === s ? 1 : 0.3)), color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-f59e0b)', 'var(--ka-14b8a6)'][i] })));
  protected readonly siteMax = computed(() => Math.max(...this.bySite().map((r) => r.value)) * 1.1);
  protected readonly roots = computed(() => {
    const m = new Map<string, number>();
    this.store.incidents().filter((i) => i.rootCause).forEach((i) => m.set(i.rootCause!, (m.get(i.rootCause!) ?? 0) + 1));
    const pal = ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-f59e0b)', 'var(--ka-ef4444)', 'var(--ka-22c55e)', 'var(--ka-14b8a6)', 'var(--ka-ec4899)', 'var(--ka-64748b)', 'var(--ka-a3a3a3)'];
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: pal[i % pal.length] }));
  });
  protected readonly riskProfile = computed(() => {
    const o = this.store.openHazards();
    const c = (a: number, b: number) => o.filter((h) => riskScore(h) >= a && riskScore(h) < b).length;
    return [
      { label: 'Critical (15+)', value: c(15, 99), color: 'var(--ka-dc2626)' }, { label: 'High (10-14)', value: c(10, 15), color: 'var(--ka-f97316)' },
      { label: 'Medium (5-9)', value: c(5, 10), color: 'var(--ka-f59e0b)' }, { label: 'Low (1-4)', value: c(1, 5), color: 'var(--ka-22c55e)' },
    ];
  });
  protected rows(r: Rep): (string | number)[][] {
    const s = this.store;
    switch (r.id) {
      case 'inc': return [['ID', 'Date', 'Type', 'Location', 'Severity', 'Status', 'Root cause'], ...s.incidents().map((i) => [i.id, dayLabel(i.daysAgo), i.type, i.location, i.severity, i.status, i.rootCause ?? '—'])];
      case 'hz': return [['ID', 'Hazard', 'Category', 'Score', 'Owner', 'Status'], ...s.hazards().map((h) => [h.id, h.title, h.category, riskScore(h), h.owner, h.status])];
      case 'ppe': return [['ID', 'Time', 'Camera', 'Zone', 'Missing', 'Status'], ...s.ppeEvents().map((e) => [e.id, e.time, e.cam, e.zone, e.missing, e.status])];
      case 'ins': return [['ID', 'Inspection', 'Inspector', 'Status', 'Score', 'Findings'], ...s.inspections().map((i) => [i.id, i.title, i.inspector, i.status, i.score ?? '—', i.findings])];
      case 'ptw': return [['ID', 'Type', 'Work', 'Contractor', 'Status'], ...s.permits().map((p) => [p.id, p.type, p.title, p.contractor, p.status])];
      case 'obs': return [['ID', 'Type', 'Category', 'Observation', 'Status'], ...s.observations().map((o) => [o.id, o.kind, o.category, o.text, o.status])];
      case 'wb': return [['ID', 'Person', 'Alert', 'Detail', 'Status'], ...s.wAlerts().map((w) => [w.id, w.person, w.kind, w.detail, w.status])];
      default: {
        const p = s.people();
        return [['Metric', 'Value'], ['Active incidents', s.active().length], ['Incidents (30 days)', s.incidents().filter((i) => i.daysAgo <= 30).length], ['Open hazards', s.openHazards().length], ['People on site', p.total],
          ['PPE compliance', s.ppePct() + '%'], ['Wellbeing alerts', s.openWAlerts().length], ['Environment alerts', s.openEnvAlerts().length], ['Observations (month)', s.observations().length], ['Active permits', s.permits().filter((x) => x.status === 'Active').length], ['TRIR', (0.82 * this.f()).toFixed(2)], ['Days since LTI', this.days()]];
      }
    }
  }
  protected download(r: Rep) {
    downloadCsv(`${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, this.rows(r));
    this.store.toast(`${r.name} downloaded`);
  }
  protected toggleSch(id: number) {
    this.schedules.update((l) => l.map((s) => (s.id === id ? { ...s, on: !s.on } : s)));
  }
  protected addSchedule() {
    this.schedules.update((l) => [...l, { id: l.length + 1, report: 'Hazard Register', freq: 'Weekly · Fri', to: 'Site managers', next: dayLabel(-1), on: true }]);
    this.store.toast('Weekly Hazard Register schedule added');
  }
}
