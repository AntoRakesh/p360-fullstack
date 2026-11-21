import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Icon } from '@p360/shared/icon';
import { SelectValue } from '@p360/shared/select-value';
import { ColumnChart } from '@p360/shared/ui';
import { statusTag } from '@p360/shared/data-table';
import { activityFor, Person, typeTag } from '@p360/shared/data/people.data';

const TABS = ['Overview', 'Details', 'Access & Credentials', 'Documents', 'Attendance'] as const;
type Tab = (typeof TABS)[number];

/** Right-side profile panel for one person (overview, details, access, documents, attendance). */
@Component({
  selector: 'app-person-profile',
  imports: [Icon, DatePipe, ColumnChart, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = person();
    <div class="pp-head">
      <span class="pp-photo" [style.background]="p.avatar">{{ p.initials }}</span>
      <div class="pp-id">
        <div class="pp-name">
          <h2>{{ p.name }}</h2>
          <span class="dt-status" [class]="statusTag(p.status).replace('tag', 'pp-pill')"><i></i>{{ p.status }}</span>
        </div>
        <div class="pp-line"><span>{{ p.id }}</span><span [class]="typeTag(p.type)">{{ p.type }}</span></div>
        <div class="pp-sub">{{ p.designation }}{{ p.dept !== '—' ? ' | ' + p.dept : '' }}</div>
        <div class="pp-loc">
          <span><app-icon name="building" [size]="13" />{{ p.site }}</span>
          <span><app-icon name="map-pin" [size]="13" />{{ p.city }}</span>
        </div>
      </div>
      <button class="close-btn" (click)="closed.emit()" aria-label="Close profile">×</button>
    </div>

    <div class="pp-actions">
      <button class="btn-primary" (click)="edit.emit(p)"><app-icon name="sliders" [size]="15" />Edit</button>
      <button class="btn-ghost" (click)="tab.set('Access & Credentials')"><app-icon name="users" [size]="15" />Manage Access</button>
      <div class="menu-wrap">
        <button class="btn-ghost" (click)="more.set(!more())">More <app-icon name="chevron-down" [size]="14" /></button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="act('print-badge')"><app-icon name="id-card" [size]="15" />Print badge</button>
            <button class="dd-item" (click)="act('reset-password')"><app-icon name="key-round" [size]="15" />Reset password</button>
            @if (p.status === 'Active') {
              <button class="dd-item danger" (click)="act('deactivate')"><app-icon name="ban" [size]="15" />Deactivate</button>
            } @else {
              <button class="dd-item" (click)="act('activate')"><app-icon name="shield-check" [size]="15" />Activate</button>
            }
          </div>
        }
      </div>
    </div>

    <nav class="pp-tabs">
      @for (t of tabs; track t) {
        <button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>
      }
    </nav>

    @switch (tab()) {
      @case ('Overview') {
        <div class="tiles">
          <div class="tile"><app-icon name="message" [size]="16" /><span>Work Email</span><b>{{ p.email }}</b></div>
          <div class="tile"><app-icon name="activity" [size]="16" /><span>Phone</span><b>{{ p.phone }}</b></div>
          <div class="tile"><app-icon name="users" [size]="16" /><span>Department</span><b>{{ p.dept }}</b></div>
          <div class="tile"><app-icon name="briefcase" [size]="16" /><span>Designation</span><b>{{ p.designation }}</b></div>
          <div class="tile mgr">
            <span class="mini-av">{{ initials(p.manager) }}</span>
            <div><span>Manager</span><b>{{ p.manager }}</b><small>{{ p.manager === 'Priya Sharma' ? 'Head of IT' : 'Line Manager' }}</small></div>
          </div>
          <div class="tile"><app-icon name="file-text" [size]="16" /><span>Employment Type</span><b>{{ p.empType }}</b></div>
          <div class="tile"><app-icon name="calendar-days" [size]="16" /><span>Date of Joining</span><b>{{ p.joined | date: 'd MMM y' }}</b></div>
          <div class="tile"><app-icon name="map-pin" [size]="16" /><span>Work Location</span><b>{{ p.site }}</b></div>
        </div>

        <div class="pp-cols">
          <section class="pp-box">
            <div class="box-head">
              <h4>Recent Activity</h4>
              <select class="select" [value]="actFilter()" (change)="actFilter.set($any($event.target).value)">
                <option value="all">All Activities</option>
                <option value="access">Access</option>
                <option value="attendance">Attendance</option>
                <option value="document">Documents</option>
                <option value="credential">Credentials</option>
              </select>
            </div>
            <ol class="timeline">
              @for (a of activity().slice(0, allActivity() ? 99 : 5); track $index) {
                <li [class.ok]="a.kind === 'access'">
                  <div><b>{{ a.title }}</b><span>{{ a.detail }}</span></div>
                  <time>{{ a.when }}</time>
                </li>
              } @empty {
                <li class="muted">No activity of this type</li>
              }
            </ol>
            <button class="link right" (click)="allActivity.set(!allActivity())">{{ allActivity() ? 'Show less' : 'View All Activity' }}</button>
          </section>
          <div class="pp-side">
            <section class="pp-box">
              <h4>Profile Completion</h4>
              <div class="pct">{{ completion() }}%</div>
              <div class="bar"><i [style.width.%]="completion()"></i></div>
              <ul class="checks">
                @for (c of checks(); track c.label) {
                  <li><input type="checkbox" [checked]="c.done" (change)="toggleCheck(c.label)" />{{ c.label }}</li>
                }
              </ul>
            </section>
            <section class="pp-box">
              <h4>Quick Actions</h4>
              <div class="qa">
                @for (q of quick; track q.id) {
                  <button (click)="act(q.id)"><app-icon [name]="q.icon" [size]="18" /><span>{{ q.label }}</span></button>
                }
              </div>
            </section>
          </div>
        </div>
      }
      @case ('Details') {
        <dl class="details">
          @for (d of details(); track d[0]) {
            <dt>{{ d[0] }}</dt><dd>{{ d[1] }}</dd>
          }
        </dl>
      }
      @case ('Access & Credentials') {
        <div class="cred-list">
          @for (c of creds(); track c.label) {
            <div class="cred">
              <app-icon [name]="c.icon" [size]="18" />
              <div><b>{{ c.label }}</b><span>{{ c.detail }}</span></div>
              <span [class]="statusTag(c.status)">{{ c.status }}</span>
              <button class="btn-ghost sm" (click)="toggleCred(c.label)">{{ c.status === 'Active' ? 'Suspend' : 'Activate' }}</button>
            </div>
          }
        </div>
        <h4 class="sec">Assigned Zones</h4>
        <div class="zones">
          @for (z of zones(); track z) {
            <span class="zone">{{ z }} <button (click)="removeZone(z)">×</button></span>
          }
          <select class="select" (change)="addZone($any($event.target).value); $any($event.target).value = ''">
            <option value="">+ Add zone</option>
            @for (z of allZones; track z) {
              @if (!zones().includes(z)) {
                <option [value]="z">{{ z }}</option>
              }
            }
          </select>
        </div>
      }
      @case ('Documents') {
        <div class="cred-list">
          @for (d of docs(); track d.name) {
            <div class="cred">
              <app-icon name="file-text" [size]="18" />
              <div><b>{{ d.name }}</b><span>{{ d.no }} · expires {{ d.expiry }}</span></div>
              <span [class]="statusTag(d.status)">{{ d.status }}</span>
              <button class="btn-ghost sm" (click)="act('download-' + d.name)">View</button>
            </div>
          }
        </div>
      }
      @case ('Attendance') {
        <app-column-chart [labels]="days" [series]="attSeries()" [height]="170" [legend]="false" suffix=" h" />
        <table class="table">
          <thead><tr><th>Day</th><th>In</th><th>Out</th><th class="num">Hours</th><th>Status</th></tr></thead>
          <tbody>
            @for (r of attRows(); track r.day) {
              <tr><td>{{ r.day }}</td><td>{{ r.in }}</td><td>{{ r.out }}</td><td class="num">{{ r.hours }}</td><td><span [class]="statusTag(r.status)">{{ r.status }}</span></td></tr>
            }
          </tbody>
        </table>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .pp-head { display: flex; gap: 16px; align-items: flex-start; }
    .pp-photo { width: 84px; height: 84px; border-radius: 12px; display: grid; place-items: center; color: var(--kf-ffffff); font-size: 28px; font-weight: 700; flex-shrink: 0; }
    .pp-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .pp-name { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .pp-name h2 { margin: 0; font-size: 21px; }
    .pp-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .pp-pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .pp-pill.green { background: var(--kb-dcfce7); color: var(--kf-15803d); } .pp-pill.amber { background: var(--kb-fef3c7); color: var(--kf-b45309); }
    .pp-pill.red { background: var(--kb-fee2e2); color: var(--kf-b91c1c); } .pp-pill.blue { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); }
    .pp-line { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--kf-4b4f6b); }
    .pp-sub { font-size: 13px; color: var(--kf-4b4f6b); }
    .pp-loc { display: flex; gap: 14px; font-size: 12.5px; color: var(--kf-4b4f6b); }
    .pp-loc span { display: inline-flex; align-items: center; gap: 4px; }
    .pp-actions { display: flex; gap: 8px; margin: 16px 0 12px; flex-wrap: wrap; }
    .pp-tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--border); margin-bottom: 12px; overflow-x: auto; }
    .pp-tabs button { border: 0; background: none; padding: 9px 0; font-size: 12.5px; color: var(--kf-4b4f6b); cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
    .pp-tabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .tile { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 11px; color: var(--kf-4b4f6b); min-width: 0; }
    .tile app-icon { color: var(--primary); }
    .tile b { font-size: 12px; color: var(--text); font-weight: 500; overflow-wrap: anywhere; }
    .tile.mgr { flex-direction: row; align-items: center; gap: 8px; }
    .tile.mgr div { display: flex; flex-direction: column; } .tile small { color: var(--muted); }
    .mini-av { width: 30px; height: 30px; border-radius: 50%; background: var(--kb-db2777); color: var(--kf-ffffff); display: grid; place-items: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
    .pp-cols { display: grid; grid-template-columns: 1.25fr 1fr; gap: 10px; }
    .pp-side { display: flex; flex-direction: column; gap: 10px; }
    .pp-box { border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
    .pp-box h4, .sec { margin: 0 0 8px; font-size: 13.5px; }
    .box-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .box-head h4 { margin: 0; } .box-head .select { padding: 4px 24px 4px 8px; font-size: 11.5px; }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--kl-ede9fe); }
    .timeline li { position: relative; display: flex; justify-content: space-between; gap: 8px; padding: 0 0 12px 8px; font-size: 12px; }
    .timeline li::before { content: ''; position: absolute; left: -21px; top: 3px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--primary); background: var(--kb-ffffff); }
    .timeline li.ok::before { background: var(--kb-22c55e); border-color: var(--kl-22c55e); }
    .timeline li div { display: flex; flex-direction: column; } .timeline b { font-weight: 600; }
    .timeline span, .timeline time { color: var(--muted); font-size: 11.5px; } .timeline time { white-space: nowrap; }
    .right { display: block; margin-left: auto; }
    .pct { font-size: 20px; font-weight: 700; color: var(--primary); }
    .bar { height: 8px; border-radius: 4px; background: var(--kb-eef0f6); overflow: hidden; margin: 6px 0 10px; }
    .bar i { display: block; height: 100%; background: var(--primary); transition: width 0.3s; }
    .checks { list-style: none; margin: 0; padding: 0; font-size: 12px; }
    .checks li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
    .checks input { accent-color: var(--primary); }
    .qa { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .qa button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid var(--border); border-radius: 8px; background: var(--kb-ffffff); font-size: 10.5px; color: var(--kf-3b3f5c); cursor: pointer; }
    .qa button:hover { background: var(--kb-faf8ff); border-color: var(--kl-c4b5fd); } .qa app-icon { color: var(--primary); }
    .details { display: grid; grid-template-columns: 160px 1fr; gap: 10px; font-size: 13px; margin: 0; }
    .details dt { color: var(--muted); } .details dd { margin: 0; }
    .cred-list { display: flex; flex-direction: column; gap: 8px; }
    .cred { display: grid; grid-template-columns: 22px 1fr auto auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 12.5px; }
    .cred app-icon { color: var(--primary); } .cred div { display: flex; flex-direction: column; } .cred span { color: var(--muted); font-size: 11.5px; }
    .cred .tag { color: inherit; }
    .sec { margin-top: 16px; }
    .zones { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .zone { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; background: var(--primary-soft); color: var(--primary); font-size: 12px; }
    .zone button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; }
    @media (max-width: 1400px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pp-cols { grid-template-columns: 1fr; } }
  `,
})
export class PersonProfile {
  readonly person = input.required<Person>();
  readonly closed = output<void>();
  readonly edit = output<Person>();
  readonly action = output<{ action: string; person: Person }>();

  protected readonly tabs = TABS;
  protected readonly statusTag = statusTag;
  protected readonly typeTag = typeTag;
  protected readonly tab = signal<Tab>('Overview');
  protected readonly more = signal(false);
  protected readonly actFilter = signal('all');
  protected readonly allActivity = signal(false);
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly allZones = ['Main Entrance', 'Lobby', 'Office Floors', 'Server Room', 'Labs', 'Canteen', 'Parking', 'Warehouse Floor', 'Roof'];
  protected readonly quick = [
    { id: 'reset-password', label: 'Reset Password', icon: 'key-round' },
    { id: 'assign-access', label: 'Assign Access', icon: 'id-card' },
    { id: 'add-document', label: 'Add Document', icon: 'file-text' },
    { id: 'view-attendance', label: 'View Attendance', icon: 'clock' },
    { id: 'assign-training', label: 'Assign Training', icon: 'graduation-cap' },
    { id: 'more', label: 'More Actions', icon: 'more' },
  ];

  private readonly checkState = signal<Record<string, boolean>>({});
  private readonly credState = signal<Record<string, string>>({});
  protected readonly zones = signal<string[]>([]);

  constructor() {
    // Reset per-person UI state when a different person is shown.
    effect(() => {
      const p = this.person();
      this.tab.set('Overview');
      this.more.set(false);
      this.allActivity.set(false);
      const done = Math.round((p.completion / 100) * 6);
      const labels = ['Personal Information', 'Employment Details', 'Documents & Certifications', 'Access & Credentials', 'Emergency Contact', 'Skills & Competencies'];
      this.checkState.set(Object.fromEntries(labels.map((l, i) => [l, i < done])));
      this.credState.set({});
      this.zones.set(p.type === 'Visitor' ? ['Main Entrance', 'Lobby'] : ['Main Entrance', 'Lobby', 'Office Floors', 'Canteen', ...(p.dept === 'IT' ? ['Server Room'] : [])]);
    });
  }

  protected readonly checks = computed(() => Object.entries(this.checkState()).map(([label, done]) => ({ label, done })));
  protected readonly completion = computed(() => {
    const c = this.checks();
    const base = this.person().completion;
    const done = c.filter((x) => x.done).length;
    return Math.min(100, Math.max(0, base + (done - Math.round((base / 100) * 6)) * 10));
  });
  protected readonly activity = computed(() => activityFor(this.person()).filter((a) => this.actFilter() === 'all' || a.kind === this.actFilter()));
  protected readonly details = computed(() => {
    const p = this.person();
    return [
      ['Full name', p.name], ['Person ID', p.id], ['Person type', p.type], ['Company', p.company], ['Department', p.dept],
      ['Designation', p.designation], ['Manager', p.manager], ['Employment type', p.empType], ['Date of joining', p.joined],
      ['Work site', `${p.site} · ${p.city}`], ['Email', p.email], ['Phone', p.phone], ['Status', p.status], ['Nationality', 'India'],
      ['Emergency contact', 'Anita Mehta · +971 55 987 6543'],
    ];
  });
  protected readonly creds = computed(() => {
    const p = this.person();
    const s = this.credState();
    return [
      { label: 'Access Card', icon: 'id-card', detail: `Card #${p.card} · HID iCLASS`, status: s['Access Card'] ?? 'Active' },
      { label: 'Mobile Credential', icon: 'square-user', detail: 'People360 Wallet · iOS', status: s['Mobile Credential'] ?? (p.mobileCred ? 'Active' : 'Not issued') },
      { label: 'Face Template', icon: 'user-check', detail: 'Quality 92/100', status: s['Face Template'] ?? (p.face ? 'Active' : 'Not enrolled') },
      { label: 'Fingerprint', icon: 'fingerprint', detail: '2 fingers enrolled', status: s['Fingerprint'] ?? (p.finger ? 'Active' : 'Not enrolled') },
    ];
  });
  protected readonly docs = computed(() => {
    const p = this.person();
    return [
      { name: 'Passport', no: 'P' + p.card.slice(3) + '81', expiry: '14 Mar 2031', status: 'Valid' },
      { name: 'Emirates ID', no: '784-1990-' + p.card.slice(3), expiry: '02 Feb 2027', status: 'Expiring' },
      { name: 'Visa', no: 'V-201/2024/' + p.card.slice(3), expiry: '21 Jan 2027', status: 'Valid' },
      { name: p.type === 'Contractor' ? 'Work Permit' : 'Employment Contract', no: 'DOC-' + p.id, expiry: '31 Dec 2026', status: p.status === 'Inactive' ? 'Expired' : 'Valid' },
    ];
  });
  protected readonly attSeries = computed(() => [{ name: 'Hours', color: 'var(--ka-7c3aed)', values: [8.6, 9.1, 8.2, 8.9, 7.6, 0, 0] }]);
  protected readonly attRows = computed(() => [
    { day: 'Mon', in: '08:58', out: '17:34', hours: '8.6', status: 'Present' },
    { day: 'Tue', in: '08:46', out: '17:52', hours: '9.1', status: 'Present' },
    { day: 'Wed', in: '09:21', out: '17:33', hours: '8.2', status: 'Late' },
    { day: 'Thu', in: '08:55', out: '17:49', hours: '8.9', status: 'Present' },
    { day: 'Fri', in: '09:00', out: '16:36', hours: '7.6', status: 'Present' },
  ]);

  protected initials(n: string) {
    return n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  }
  protected act(a: string) {
    this.more.set(false);
    if (a === 'assign-access') this.tab.set('Access & Credentials');
    else if (a === 'add-document') this.tab.set('Documents');
    else if (a === 'view-attendance') this.tab.set('Attendance');
    this.action.emit({ action: a, person: this.person() });
  }
  protected toggleCheck(label: string) {
    this.checkState.update((s) => ({ ...s, [label]: !s[label] }));
  }
  protected toggleCred(label: string) {
    const cur = this.creds().find((c) => c.label === label)!.status;
    this.credState.update((s) => ({ ...s, [label]: cur === 'Active' ? 'Suspended' : 'Active' }));
  }
  protected addZone(z: string) {
    if (z) this.zones.update((list) => [...list, z]);
  }
  protected removeZone(z: string) {
    this.zones.update((list) => list.filter((x) => x !== z));
  }
}
