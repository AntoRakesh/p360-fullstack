import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable, RowAction } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { rng } from '@p360/shared/data/demo-data';
import { PEOPLE } from '@p360/shared/data/people.data';
import { DOORS } from './access.data';

const iso = (off: number) => new Date(Date.now() + off * 86400000).toISOString().slice(0, 10);

/* ======================= Access Levels & Permissions ======================= */
interface Level {
  id: number;
  name: string;
  desc: string;
  schedule: string;
  doors: string[];
  members: string[];
  extraMembers: number;
  dual: boolean;
}
const LEVEL_SEED: [string, string, string, (d: (typeof DOORS)[number]) => boolean, number, boolean][] = [
  ['General Staff', 'Entrances, lifts and offices at all sites', 'Business Hours', (d) => ['Entrance', 'Turnstile', 'Lift', 'Office'].includes(d.type), 7420, false],
  ['Server Room', 'Server and network rooms', '24 × 7 (restricted)', (d) => d.level === 'Server Room', 38, true],
  ['R&D Lab', 'Labs and prototype store', 'Business Hours', (d) => d.level === 'R&D Lab', 214, false],
  ['Finance', 'Finance office', 'Business Hours', (d) => d.level === 'Finance', 96, false],
  ['Executive', 'Executive floor', '24 × 7', (d) => d.level === 'Executive' || d.type === 'Entrance', 24, false],
  ['Plant Operations', 'Manufacturing gates and lines', 'Night Shift', (d) => d.level === 'Plant' || d.site === 'Manufacturing', 1840, false],
  ['Hazmat', 'Chemical store', 'Business Hours', (d) => d.level === 'Hazmat', 42, true],
  ['Warehouse Ops', 'Warehouse and logistics', '24 × 7', (d) => d.level === 'Warehouse', 1120, false],
  ['Data Center', 'Data halls and security gate', '24 × 7 (restricted)', (d) => d.level === 'Data Center', 64, true],
  ['Visitor Lobby', 'Reception, lobby, meeting rooms', 'Business Hours', (d) => ['Reception', 'Meeting Room', 'Main Entrance', 'Lobby Turnstile 1'].includes(d.name), 284, false],
  ['Facilities & Cleaning', 'All doors after hours', 'Cleaning Crew', (d) => d.type === 'Office' || d.level === 'Facilities', 320, false],
];

@Component({
  selector: 'app-access-levels',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Access Levels &amp; Permissions" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Groups of doors + a schedule. Give people levels instead of individual doors.">
      <button class="btn-primary" (click)="add()"><app-icon name="plus" [size]="16" />New Level</button>
    </app-page-head>
    <section class="al">
      <aside class="card ll">
        @for (l of levels(); track l.id) {
          <button class="li" [class.on]="selId() === l.id" (click)="selId.set(l.id)">
            <div><b>{{ l.name }}</b><small>{{ l.doors.length }} doors · {{ (l.members.length + l.extraMembers).toLocaleString() }} people</small></div>
            @if (l.dual) {<span class="tag red">Dual auth</span>}
          </button>
        }
      </aside>
      @if (sel(); as l) {
        <div class="card">
          <div class="card-head">
            <div><input class="input title" [value]="l.name" (change)="patch({ name: $any($event.target).value })" /><p class="muted">{{ l.desc }}</p></div>
            <div class="toolbar">
              <select class="select" [value]="l.schedule" (change)="patch({ schedule: $any($event.target).value })"><option>Business Hours</option><option>24 × 7</option><option>24 × 7 (restricted)</option><option>Night Shift</option><option>Cleaning Crew</option><option>Weekend Maintenance</option></select>
              <label class="chk"><input type="checkbox" [checked]="l.dual" (change)="patch({ dual: !l.dual })" /> Card + face required</label>
            </div>
          </div>
          <div class="cols">
            <div>
              <div class="sub-head"><h4>Doors ({{ l.doors.length }})</h4>
                <select class="select sm" [value]="site()" (change)="site.set($any($event.target).value)">@for (s of sites; track s) {<option>{{ s }}</option>}</select></div>
              <div class="doors">
                @for (d of siteDoors(); track d.id) {
                  <label [class.on]="l.doors.includes(d.name)"><input type="checkbox" [checked]="l.doors.includes(d.name)" (change)="toggleDoor(d.name)" />{{ d.name }} <small>{{ d.floor }}</small></label>
                }
              </div>
            </div>
            <div>
              <div class="sub-head"><h4>Members</h4><span class="muted">{{ (l.members.length + l.extraMembers).toLocaleString() }} total</span></div>
              <form class="add" (submit)="$event.preventDefault(); addMember(m.value); m.value = ''">
                <input #m class="input" list="lvl-people" placeholder="Add person by name or ID" /><datalist id="lvl-people">@for (p of pick; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist>
                <button class="btn-primary btn-sm" type="submit">Add</button>
              </form>
              <ul class="mem">
                @for (id of l.members; track id) {
                  @let p = person(id);
                  <li><span class="dt-av" [style.background]="p?.avatar">{{ p?.initials }}</span><div><b>{{ p?.name }}</b><small>{{ id }} · {{ p?.dept }}</small></div><button class="link danger" (click)="removeMember(id)">Remove</button></li>
                }
                @if (l.extraMembers) {<li class="muted">+ {{ l.extraMembers.toLocaleString() }} more assigned via department rules</li>}
              </ul>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    .al { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 12px; align-items: start; }
    .ll { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
    .li { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 9px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; cursor: pointer; font-size: 12.5px; }
    .li div { display: flex; flex-direction: column; } .li small { color: var(--muted); } .li.on { border-color: var(--primary); background: var(--kb-f5f3ff); }
    .title { font-size: 16px; font-weight: 600; } .chk { display: flex; gap: 6px; align-items: center; font-size: 12.5px; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .sub-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } h4 { margin: 0; font-size: 13px; }
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; }
    .doors { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-height: 420px; overflow: auto; }
    .doors label { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; }
    .doors label.on { border-color: var(--kl-c4b5fd); background: var(--kb-faf8ff); } .doors small { color: var(--muted); margin-left: auto; }
    .add { display: flex; gap: 6px; margin-bottom: 8px; } .add .input { flex: 1; }
    .mem { list-style: none; margin: 0; padding: 0; max-height: 380px; overflow: auto; }
    .mem li { display: grid; grid-template-columns: 32px 1fr auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .mem div { display: flex; flex-direction: column; } .mem small { color: var(--muted); } .danger { color: var(--red); }
    @media (max-width: 1100px) { .al, .cols { grid-template-columns: 1fr; } }
  `,
})
export class AccessLevels {
  protected readonly sites = ['Head Office', 'Manufacturing', 'Warehouse', 'Data Center', 'Regional Office', 'Tech Center', 'Logistics Hub', 'Retail Stores'];
  protected readonly pick = PEOPLE.slice(0, 400);
  protected readonly levels = signal<Level[]>(
    LEVEL_SEED.map(([name, desc, schedule, fn, total, dual], i) => {
      const members = PEOPLE.filter((p) => p.type !== 'Visitor').slice(i * 9, i * 9 + Math.min(8, total)).map((p) => p.id);
      return { id: i + 1, name, desc, schedule, doors: DOORS.filter(fn).map((d) => d.name), members, extraMembers: Math.max(0, total - members.length), dual };
    }),
  );
  protected readonly selId = signal(2);
  protected readonly site = signal('Head Office');
  protected readonly sel = computed(() => this.levels().find((l) => l.id === this.selId()) ?? null);
  protected readonly siteDoors = computed(() => DOORS.filter((d) => d.site === this.site()));

  protected person(id: string) {
    return PEOPLE.find((p) => p.id === id);
  }
  protected patch(c: Partial<Level>) {
    const id = this.selId();
    this.levels.update((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }
  protected toggleDoor(n: string) {
    const d = this.sel()!.doors;
    this.patch({ doors: d.includes(n) ? d.filter((x) => x !== n) : [...d, n] });
  }
  protected addMember(v: string) {
    const id = v.split(' · ')[0];
    if (!this.person(id) || this.sel()!.members.includes(id)) return;
    this.patch({ members: [id, ...this.sel()!.members] });
  }
  protected removeMember(id: string) {
    this.patch({ members: this.sel()!.members.filter((x) => x !== id) });
  }
  protected add() {
    const id = Math.max(...this.levels().map((l) => l.id)) + 1;
    this.levels.update((l) => [...l, { id, name: 'New Level', desc: 'Custom access level', schedule: 'Business Hours', doors: [], members: [], extraMembers: 0, dual: false }]);
    this.selId.set(id);
  }
}

/* ======================= Credential Management ======================= */
interface PrintJob {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  type: string;
  template: string;
  card: string;
  status: string;
  requested: string;
}

@Component({
  selector: 'app-credential-mgmt',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Credential Management" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Card stock, badge printing and encoding, card formats and lost-card replacement." />
    <section class="kpi-row">
      <app-kpi label="Active Credentials" value="11,842" icon="id-card" color="var(--ka-8b5cf6)" sub="cards, mobile, face, PIN" />
      <app-kpi label="Blank Card Stock" [value]="stock().toLocaleString()" icon="box" [color]="stock() < 500 ? 'var(--ka-ef4444)' : 'var(--ka-22c55e)'" sub="reorder below 500" />
      <app-kpi label="Print Queue" [value]="queued()" icon="file-text" color="var(--ka-f97316)" />
      <app-kpi label="Lost / Stolen (30 d)" value="37" icon="triangle-alert" color="var(--ka-ef4444)" />
      <app-kpi label="Mobile Credentials" value="4,912" icon="square-user" color="var(--ka-3b82f6)" change="9%" />
    </section>
    <section class="dash">
      <div class="card span-5">
        <div class="card-head"><h3>Badge Preview</h3>
          <select class="select sm" [value]="tpl()" (change)="tpl.set($any($event.target).value)"><option>Employee</option><option>Contractor</option><option>Visitor</option></select>
        </div>
        @let p = previewPerson();
        <div class="badge" [attr.data-t]="tpl()">
          <div class="b-top"><b>Purple IQ</b><span>{{ tpl() }}</span></div>
          <span class="b-photo" [style.background]="p.avatar">{{ p.initials }}</span>
          <b class="b-name">{{ p.name }}</b>
          <span class="b-role">{{ p.designation }}</span>
          <span class="b-id">{{ p.id }}</span>
          <div class="b-bar"></div>
          <small>{{ tpl() === 'Visitor' ? 'Valid today only · escort required' : 'Card ' + p.card + ' · DESFire EV3' }}</small>
        </div>
        <div class="form-grid">
          <label class="full">Person<input class="input" list="cm-people" [value]="pv()" (change)="pv.set($any($event.target).value)" /><datalist id="cm-people">@for (x of pick; track x.id) {<option [value]="x.id + ' · ' + x.name"></option>}</datalist></label>
        </div>
        <div class="form-actions"><button class="btn-primary" (click)="queue()"><app-icon name="file-text" [size]="15" />Send to printer</button></div>
      </div>
      <div class="card span-7">
        <div class="card-head"><h3>Print &amp; Encode Queue</h3><button class="btn-ghost sm" (click)="runQueue()" [disabled]="!queued()">Print all queued</button></div>
        <app-data-table [rows]="jobs()" [columns]="cols" noun="jobs" [pageSize]="8" [actions]="actions" (action)="jobAct($event.action, $event.row)" />
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Card Formats</h3></div>
        <table class="table">
          <thead><tr><th>Format</th><th>Technology</th><th class="num">Cards in use</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>DESFire EV3 (default)</td><td>13.56 MHz, AES-128</td><td class="num">6,140</td><td><span class="tag green">Active</span></td></tr>
            <tr><td>HID iCLASS SE</td><td>13.56 MHz, SIO</td><td class="num">3,280</td><td><span class="tag green">Active</span></td></tr>
            <tr><td>HID Prox 26-bit</td><td>125 kHz</td><td class="num">412</td><td><span class="tag amber">Phasing out</span></td></tr>
            <tr><td>QR (visitors)</td><td>Dynamic, 30 s rotation</td><td class="num">284</td><td><span class="tag green">Active</span></td></tr>
          </tbody>
        </table>
      </div>
      <div class="card span-6">
        <div class="card-head"><h3>Report Lost Card</h3></div>
        <div class="form-grid">
          <label class="full">Person<input #lp class="input" list="cm-people" placeholder="Name or ID" /></label>
          <label class="full chk"><input #lr type="checkbox" checked /> Issue replacement card automatically</label>
        </div>
        <div class="form-actions"><button class="btn-ghost danger" (click)="lost(lp.value, lr.checked); lp.value = ''">Deactivate &amp; replace</button></div>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .select.sm { padding: 5px 26px 5px 9px; font-size: 11.5px; }
    .badge { width: 220px; margin: 0 auto 14px; padding: 14px; border-radius: 14px; background: linear-gradient(160deg, var(--kb-4c1d95), var(--kb-7c3aed)); color: var(--kf-ffffff); display: flex; flex-direction: column; align-items: center; gap: 4px; box-shadow: 0 10px 30px rgba(76,29,149,.35); }
    .badge[data-t='Contractor'] { background: linear-gradient(160deg, var(--kb-9a3412), var(--kb-f97316)); } .badge[data-t='Visitor'] { background: linear-gradient(160deg, var(--kb-1e3a8a), var(--kb-3b82f6)); }
    .b-top { width: 100%; display: flex; justify-content: space-between; font-size: 11px; } .b-top span { padding: 1px 8px; border-radius: 10px; background: rgba(255,255,255,.2); }
    .b-photo { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; font-weight: 700; border: 3px solid var(--kl-ffffff); margin: 8px 0; }
    .b-name { font-size: 16px; } .b-role { font-size: 11.5px; opacity: .85; } .b-id { font-family: monospace; font-size: 12px; }
    .b-bar { width: 80%; height: 26px; margin: 6px 0 2px; background: repeating-linear-gradient(90deg, var(--kb-ffffff) 0 2px, transparent 2px 4px, var(--kb-ffffff) 4px 5px, transparent 5px 8px); border-radius: 2px; }
    .badge small { font-size: 10px; opacity: .85; }
    .chk { flex-direction: row !important; align-items: center; } .danger { color: var(--red); }
  `,
})
export class CredentialMgmt {
  protected readonly pick = PEOPLE.slice(0, 400);
  protected readonly tpl = signal('Employee');
  protected readonly pv = signal('EMP-00123 · Arjun Mehta');
  protected readonly stock = signal(1240);
  protected readonly toast = signal<string | null>(null);
  protected readonly jobs = signal<PrintJob[]>(
    PEOPLE.slice(130, 152).map((p, i) => ({ id: `PJ-${900 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type: i % 6 === 0 ? 'Replacement' : 'New hire', template: p.type === 'Contractor' ? 'Contractor' : 'Employee', card: i < 9 ? '—' : `AC-${String(70000 + i)}`, status: i < 9 ? 'Queued' : 'Printed', requested: iso(-(i % 5)) })),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'type', label: 'Reason' },
    { key: 'template', label: 'Template' },
    { key: 'card', label: 'Card no.' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'print', label: 'Print & encode now', icon: 'file-text', when: (r) => r.status === 'Queued' },
    { id: 'cancel', label: 'Cancel', icon: 'ban', danger: true, when: (r) => r.status === 'Queued' },
  ];
  protected readonly queued = computed(() => this.jobs().filter((j) => j.status === 'Queued').length);
  protected readonly previewPerson = computed(() => PEOPLE.find((p) => p.id === this.pv().split(' · ')[0]) ?? PEOPLE[0]);

  private printOne(id: string) {
    this.jobs.update((l) => l.map((j) => (j.id === id ? { ...j, status: 'Printed', card: `AC-${String(80000 + Math.floor(Math.random() * 9999))}` } : j)));
    this.stock.update((s) => s - 1);
  }
  protected queue() {
    const p = this.previewPerson();
    this.jobs.update((l) => [{ id: `PJ-${1000 + l.length}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type: 'Reprint', template: this.tpl(), card: '—', status: 'Queued', requested: iso(0) }, ...l]);
    this.notify(`Badge for ${p.name} queued`);
  }
  protected runQueue() {
    const ids = this.jobs().filter((j) => j.status === 'Queued').map((j) => j.id);
    ids.forEach((id) => this.printOne(id));
    this.notify(`${ids.length} badges printed and encoded`);
  }
  protected jobAct(a: string, j: PrintJob) {
    if (a === 'print') this.printOne(j.id);
    else this.jobs.update((l) => l.map((x) => (x.id === j.id ? { ...x, status: 'Cancelled' } : x)));
  }
  protected lost(v: string, replace: boolean) {
    const p = PEOPLE.find((x) => x.id === v.split(' · ')[0]);
    if (!p) return this.notify('Pick a person from the list');
    if (replace) this.jobs.update((l) => [{ id: `PJ-${1000 + l.length}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, type: 'Replacement', template: p.type === 'Contractor' ? 'Contractor' : 'Employee', card: '—', status: 'Queued', requested: iso(0) }, ...l]);
    this.notify(`Card ${p.card} deactivated${replace ? ' · replacement queued' : ''}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2200);
  }
}

/* ======================= Visitor Access Integration ======================= */
interface VisitorPass {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  host: string;
  company: string;
  credential: string;
  level: string;
  validFrom: string;
  validTo: string;
  escort: boolean;
  scans: number;
  status: string;
}

@Component({
  selector: 'app-visitor-access',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Visitor Access Integration" parent="Physical Access Control" parentLink="/physical-access-control" subtitle="Visitor check-in automatically issues and revokes temporary credentials." />
    <section class="kpi-row">
      <app-kpi label="Active Visitor Passes" [value]="cnt('Active')" icon="user-plus" color="var(--ka-3b82f6)" />
      <app-kpi label="QR Scans Today" [value]="scans()" icon="grid" color="var(--ka-8b5cf6)" />
      <app-kpi label="Denied Visitor Scans" value="11" icon="ban" color="var(--ka-ef4444)" sub="outside allowed doors" />
      <app-kpi label="Auto-revoked" [value]="cnt('Expired') + cnt('Revoked')" icon="clock" color="var(--ka-64748b)" sub="on check-out / expiry" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <app-data-table [rows]="list()" [columns]="cols" noun="passes" [searchKeys]="['name', 'host', 'company']" searchPlaceholder="Search visitor, host, company..." [filters]="filters"
          [actions]="actions" (rowClick)="qr.set($event)" (action)="act($event.action, $event.row)" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>Integration Settings</h3></div>
        <div class="set">
          @for (s of settingKeys; track s.key) {
            <label><span>{{ s.label }}</span><input type="checkbox" [checked]="settings()[s.key]" (change)="toggle(s.key)" /></label>
          }
          <label class="row">Default access level<select class="select"><option>Visitor Lobby</option><option>General Staff</option></select></label>
          <label class="row">Max pass validity (hours)<input class="input" type="number" value="10" /></label>
        </div>
      </div>
    </section>
    @if (qr(); as v) {
      <div class="g-overlay" (click)="qr.set(null)"></div>
      <div class="g-modal qrm">
        <div class="modal-head"><h3>{{ v.name }}</h3><button class="close-btn" (click)="qr.set(null)">×</button></div>
        <svg viewBox="0 0 21 21" class="qr" shape-rendering="crispEdges">
          @for (c of qrCells(v.id); track $index) {<rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" />}
        </svg>
        <p>{{ v.credential }} · {{ v.level }}</p>
        <p class="muted">Valid {{ v.validFrom }} – {{ v.validTo }} · Host {{ v.host }}{{ v.escort ? ' · escort required' : '' }}</p>
        <div class="form-actions"><button class="btn-ghost" (click)="act('extend', v); qr.set(null)">Extend 2 h</button><button class="btn-primary" (click)="qr.set(null)">Done</button></div>
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .set { display: flex; flex-direction: column; gap: 4px; }
    .set label { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; }
    .set input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--primary); }
    .set .row { flex-direction: column; align-items: stretch; } .set .row .input, .set .row .select { width: 100%; }
    .qrm { width: min(360px, calc(100vw - 32px)); text-align: center; } .qr { width: 200px; height: 200px; margin: 6px auto; display: block; } .qrm p { margin: 4px 0; font-size: 13px; }
  `,
})
export class VisitorAccess {
  private readonly state = inject(AppState);
  protected readonly settingKeys = [
    { key: 'autoIssue', label: 'Issue QR pass automatically on check-in' },
    { key: 'autoRevoke', label: 'Revoke pass on check-out' },
    { key: 'hostFloor', label: 'Add host’s floor to visitor access' },
    { key: 'face', label: 'Enroll visitor face for touchless entry' },
    { key: 'escort', label: 'Require escort for restricted areas' },
  ];
  protected readonly settings = signal<Record<string, boolean>>({ autoIssue: true, autoRevoke: true, hostFloor: true, face: false, escort: true });
  protected readonly qr = signal<VisitorPass | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly list = signal<VisitorPass[]>(
    (() => {
      const r = rng(3030);
      const hosts = ['Priya Sharma', 'Arjun Mehta', 'David Lee', 'Fatima Al Mansoori', 'Chen Wei'];
      return PEOPLE.filter((p) => p.type === 'Visitor').slice(0, 40).map((p, i) => {
        const st = i < 26 ? 'Active' : i < 34 ? 'Expired' : i < 37 ? 'Revoked' : 'Scheduled';
        const h = 8 + Math.floor(r() * 8);
        return {
          id: `VP-${4500 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, host: hosts[i % hosts.length], company: p.company,
          credential: i % 3 ? 'QR pass' : 'Temporary card', level: i % 4 === 0 ? 'Visitor Lobby + F2' : 'Visitor Lobby',
          validFrom: `${String(h).padStart(2, '0')}:00`, validTo: `${String(h + 4).padStart(2, '0')}:00`, escort: i % 5 === 0, scans: Math.floor(r() * 9), status: st,
        };
      });
    })(),
  );
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Visitor', kind: 'person', sub: 'company' },
    { key: 'host', label: 'Host' },
    { key: 'credential', label: 'Credential' },
    { key: 'level', label: 'Access level' },
    { key: 'validTo', label: 'Valid', fmt: (v, r) => `${r.validFrom} – ${v}` },
    { key: 'scans', label: 'Scans', kind: 'num' },
    { key: 'escort', label: 'Escort', kind: 'bool' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [{ key: 'status', label: 'Status', options: ['Active', 'Scheduled', 'Expired', 'Revoked'] }, { key: 'credential', label: 'Credential', options: ['QR pass', 'Temporary card'] }];
  protected readonly actions: RowAction[] = [
    { id: 'qr', label: 'Show pass / QR', icon: 'grid' },
    { id: 'extend', label: 'Extend 2 hours', icon: 'clock', when: (r) => r.status === 'Active' },
    { id: 'revoke', label: 'Revoke now', icon: 'ban', danger: true, when: (r) => r.status === 'Active' || r.status === 'Scheduled' },
  ];
  protected readonly scans = computed(() => this.list().reduce((a, v) => a + v.scans, 0));

  constructor() {
    effect(() => {
      const t = this.state.tick();
      if (!t || t % 3) return;
      this.list.update((l) => l.map((v, i) => (v.status === 'Active' && i === t % 26 ? { ...v, scans: v.scans + 1 } : v)));
    });
  }

  protected cnt(s: string) {
    return this.list().filter((v) => v.status === s).length;
  }
  protected toggle(k: string) {
    this.settings.update((s) => ({ ...s, [k]: !s[k] }));
  }
  protected act(a: string, v: VisitorPass) {
    if (a === 'qr') return this.qr.set(v);
    this.list.update((l) => l.map((x) => (x.id === v.id ? (a === 'revoke' ? { ...x, status: 'Revoked' } : { ...x, validTo: `${String(+x.validTo.slice(0, 2) + 2).padStart(2, '0')}:00` }) : x)));
    this.toast.set(a === 'revoke' ? `Pass for ${v.name} revoked on all doors` : `Pass for ${v.name} extended by 2 h`);
    setTimeout(() => this.toast.set(null), 2000);
  }
  /** Deterministic QR-like pattern (illustrative, not a scannable code). */
  protected qrCells(seed: string) {
    const r = rng([...seed].reduce((a, c) => a + c.charCodeAt(0) * 13, 0));
    const cells: [number, number][] = [];
    const finder = (x: number, y: number) => {
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (i === 0 || i === 6 || j === 0 || j === 6 || (i > 1 && i < 5 && j > 1 && j < 5)) cells.push([x + i, y + j]);
    };
    finder(0, 0);
    finder(14, 0);
    finder(0, 14);
    for (let x = 0; x < 21; x++) for (let y = 0; y < 21; y++) if (!((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) && r() < 0.5) cells.push([x, y]);
    return cells;
  }
}
