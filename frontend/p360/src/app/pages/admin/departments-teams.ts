import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { AdminStore, AppUser, Department, fmtN, Team } from './admin.data';
import { ADMIN_CSS, AdminEntityModal, AdminToast, EntityReq } from './admin-ui';

@Component({
  selector: 'app-admin-departments-teams',
  imports: [...UI, AdminEntityModal, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Departments &amp; Teams" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Structure departments under sites, assign heads, and organise people into teams.">
      <button class="btn-primary" (click)="modal.set({ kind: 'dept', parent: dept()?.siteId ?? 's-hq' })"><app-icon name="plus" [size]="16" />Add Department</button>
      <button class="btn-ghost" (click)="openTeam()"><app-icon name="users" [size]="16" />Add Team</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Departments" [value]="store.depts().length" icon="users" color="var(--ka-10b981)" [sub]="'across ' + store.sites().length + ' sites'" />
      <app-kpi label="Teams" [value]="teamCount()" icon="admin-sitemap" color="var(--ka-7c3aed)" [sub]="'avg ' + avgTeam() + ' people per team'" />
      <app-kpi label="People Assigned" [value]="fmt(store.users().length)" icon="user-check" color="var(--ka-2563eb)" sub="100% have a department" />
      <app-kpi label="Largest Department" [value]="largest().name" icon="trending-up" color="var(--ka-f59e0b)" [sub]="largest().users + ' people'" />
      <app-kpi label="Teams without Lead" [value]="noLead()" icon="triangle-alert" color="var(--ka-ef4444)" [sub]="noLead() ? 'assign a lead' : 'all teams covered'" [subColor]="noLead() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
    </section>

    <section class="split left">
      <div class="card list">
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search departments..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <select class="select" [value]="bu()" (change)="bu.set($any($event.target).value)"><option value="">All business units</option>@for (b of store.bus(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}</select>
        <div class="groups">
          @for (g of grouped(); track g.site.id) {
            <small class="gh">{{ g.site.name }} · {{ g.bu }}</small>
            <ul class="side">
              @for (d of g.depts; track d.id) {
                <li><button [class.on]="selId() === d.id" (click)="selId.set(d.id)"><span class="grow">{{ d.name }}<small>{{ d.head }}</small></span><span class="cnt">{{ store.usersByDept().get(d.id) ?? 0 }}</span></button></li>
              }
            </ul>
          } @empty {<p class="empty-note">No departments match</p>}
        </div>
      </div>

      @if (dept(); as d) {
        <div class="right">
          <div class="card">
            <div class="dh">
              <span class="ri" style="background:var(--kb-dcfce7);color:var(--kf-16a34a)"><app-icon name="users" [size]="20" /></span>
              <div><h3>{{ d.name }}</h3><small class="muted">{{ store.site(d.siteId)?.name }} · {{ store.bu(store.site(d.siteId)?.buId ?? '')?.name }} · {{ d.costCenter }}</small></div>
              <div class="toolbar">
                <button class="btn-ghost" (click)="modal.set({ kind: 'dept', id: d.id })"><app-icon name="admin-edit" [size]="15" />Edit</button>
                <button class="btn-ghost danger" (click)="remove(d)"><app-icon name="admin-trash" [size]="15" />Delete</button>
              </div>
            </div>
            <div class="grid3 hstats">
              <div class="stat"><b>{{ members().length }}</b><small>People</small></div>
              <div class="stat"><b>{{ d.teams.length }}</b><small>Teams</small></div>
              <div class="stat"><b>{{ activePct() }}%</b><small>Active accounts</small></div>
            </div>
            <div class="grid2 two">
              <div>
                <h4>Department head</h4>
                <div class="headbox"><span class="av" [style.background]="color(d.head)">{{ ini(d.head) }}</span><div><b>{{ d.head }}</b><small>Head of {{ d.name }}</small></div>
                  <select class="select sm" (change)="changeHead(d, $any($event.target).value)"><option value="">Change head…</option>@for (m of members().slice(0, 40); track m.id) {<option [value]="m.name">{{ m.name }}</option>}</select>
                </div>
              </div>
              <div><h4>Role mix</h4><app-donut [segments]="roleMix()" center="People" [size]="110" /></div>
            </div>
          </div>

          <div class="card">
            <div class="ch"><h3>Teams</h3><button class="btn-primary" (click)="openTeam()"><app-icon name="plus" [size]="15" />Add Team</button></div>
            <table class="table">
              <thead><tr><th>Team</th><th>Lead</th><th>Shift</th><th class="num">Members</th><th></th></tr></thead>
              <tbody>
                @for (t of teamsWithCounts(); track t.id) {
                  <tr [class.selected]="teamSel() === t.id" class="clickable" (click)="teamSel.set(teamSel() === t.id ? null : t.id)">
                    <td><b>{{ t.name }}</b></td><td>{{ t.lead || '—' }}</td><td><span class="tag grey">{{ t.shift }}</span></td><td class="num">{{ t.count }}</td>
                    <td class="tact" (click)="$event.stopPropagation()"><button class="link" (click)="openTeam(t)">Edit</button> · <button class="link danger" (click)="removeTeam(d, t)">Remove</button></td>
                  </tr>
                } @empty {<tr><td colspan="5" class="empty-note">No teams yet — add one</td></tr>}
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="ch"><h3>Members <span class="card-sub">{{ teamSel() ? 'in ' + teamName(teamSel()!) : 'all teams' }}</span></h3>
              <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search people..." [value]="mq()" (input)="mq.set($any($event.target).value)" /></label></div>
            <ul class="mini mem">
              @for (u of shownMembers(); track u.id) {
                <li><span class="av sm" [style.background]="u.avatar">{{ u.initials }}</span><div><b>{{ u.name }}</b><small>{{ u.title }} · {{ store.role(u.roleId)?.name }}</small></div>
                  <span class="tag grey">{{ teamName(teamOf(u)) }}</span>
                  <select class="select sm" (change)="move(u, $any($event.target).value); $any($event.target).value = ''"><option value="">Move…</option>
                    @for (t of d.teams; track t.id) {@if (t.id !== teamOf(u)) {<option [value]="'t:' + t.id">Team · {{ t.name }}</option>}}
                    @for (o of otherDepts(); track o.id) {<option [value]="'d:' + o.id">Dept · {{ o.name }}</option>}
                  </select>
                </li>
              } @empty {<li class="muted">No people match</li>}
            </ul>
            @if (filteredMembers().length > shown()) {<button class="link more" (click)="shown.set(shown() + 25)">Show more ({{ filteredMembers().length - shown() }} remaining)</button>}
          </div>
        </div>
      }
    </section>

    <section class="grid2">
      <div class="card"><h3 class="ct">Headcount by Department (Top 10)</h3><app-bar-list [rows]="topDepts()" [max]="topMax()" /></div>
      <div class="card"><h3 class="ct">Departments &amp; Teams by Business Unit</h3><app-column-chart [labels]="buLabels()" [series]="buSeries()" [height]="240" /></div>
    </section>

    @if (team(); as t) {
      <div class="g-overlay" (click)="team.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveTeam()">
        <div class="modal-head"><h3>{{ t.id ? 'Edit team' : 'Add team to ' + dept()?.name }}</h3><button type="button" class="close-btn" (click)="team.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Team name *<input class="input" [value]="t.name" (input)="team.set({ ...t, name: $any($event.target).value })" /></label>
          <label>Team lead<select class="select" [value]="t.lead" (change)="team.set({ ...t, lead: $any($event.target).value })"><option value="">— None —</option>@for (m of members().slice(0, 60); track m.id) {<option [value]="m.name">{{ m.name }}</option>}</select></label>
          <label>Shift pattern<select class="select" [value]="t.shift" (change)="team.set({ ...t, shift: $any($event.target).value })"><option>Day A</option><option>Day B</option><option>Night</option><option>Rotating 4-on/4-off</option><option>Office hours</option></select></label>
        </div>
        @if (teamErr()) {<p class="bad">{{ teamErr() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="team.set(null)">Cancel</button><button class="btn-primary" type="submit">Save team</button></div>
      </form>
    }
    @if (modal(); as m) {<app-admin-entity-modal [req]="m" (closed)="modal.set(null)" />}
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .list { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 76px; max-height: calc(100vh - 92px); }
    .list .search-box input { width: 100%; } .groups { overflow: auto; flex: 1; } .gh { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; margin: 10px 4px 4px; }
    .dh .toolbar { flex-wrap: nowrap; } .right { display: flex; flex-direction: column; gap: 12px; min-width: 0; } .right h3 { font-size: 17px; }
    .hstats, .two { margin-bottom: 0; } .two { margin-top: 4px; }
    .headbox { display: grid; grid-template-columns: 36px 1fr; gap: 6px 10px; align-items: center; } .headbox div { display: flex; flex-direction: column; font-size: 13px; } .headbox small { color: var(--muted); } .headbox .select { grid-column: 1 / -1; }
    .headbox .av { width: 36px; height: 36px; }
    .select.sm { padding-top: 4px; padding-bottom: 4px; font-size: 12px; }
    .tact { white-space: nowrap; text-align: right; }
    .mem { max-height: 420px; overflow: auto; } .mem .select { width: 150px; } .more { margin-top: 8px; }
  `],
})
export class DepartmentsTeams {
  protected readonly store = inject(AdminStore);
  protected readonly fmt = fmtN;
  protected readonly q = signal('');
  protected readonly bu = signal('');
  protected readonly selId = signal('d-ops');
  protected readonly teamSel = signal<string | null>(null);
  protected readonly mq = signal('');
  protected readonly shown = signal(25);
  protected readonly modal = signal<EntityReq | null>(null);
  protected readonly team = signal<Team | null>(null);
  protected readonly teamErr = signal('');
  /** Manual team moves (user id → team id); others are spread evenly. */
  private readonly teamMoves = signal<Record<string, string>>({});

  protected readonly dept = computed(() => this.store.dept(this.selId()) ?? this.store.depts()[0]);
  protected readonly grouped = computed(() => {
    const q = this.q().toLowerCase();
    return this.store.sites().filter((s) => !this.bu() || s.buId === this.bu()).map((site) => ({
      site, bu: this.store.bu(site.buId)?.code ?? '',
      depts: this.store.depts().filter((d) => d.siteId === site.id && (!q || d.name.toLowerCase().includes(q) || d.head.toLowerCase().includes(q))),
    })).filter((g) => g.depts.length);
  });
  protected readonly teamCount = computed(() => this.store.depts().reduce((a, d) => a + d.teams.length, 0));
  protected readonly avgTeam = computed(() => Math.round(this.store.users().length / Math.max(1, this.teamCount())));
  protected readonly largest = computed(() => {
    const m = this.store.usersByDept();
    const d = [...this.store.depts()].sort((a, b) => (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0))[0];
    return { name: d?.name ?? '—', users: m.get(d?.id ?? '') ?? 0 };
  });
  protected readonly noLead = computed(() => this.store.depts().reduce((a, d) => a + d.teams.filter((t) => !t.lead).length, 0));
  protected readonly members = computed(() => this.store.users().filter((u) => u.deptId === this.dept()?.id));
  protected readonly activePct = computed(() => Math.round((this.members().filter((u) => u.status === 'Active').length / Math.max(1, this.members().length)) * 100));
  protected teamOf(u: AppUser) {
    const d = this.dept();
    const mv = this.teamMoves()[u.id];
    if (mv && d.teams.some((t) => t.id === mv)) return mv;
    if (!d.teams.length) return '';
    return d.teams[parseInt(u.id.slice(1), 10) % d.teams.length].id;
  }
  protected teamName(id: string) {
    return this.dept()?.teams.find((t) => t.id === id)?.name ?? 'Unassigned';
  }
  protected readonly teamsWithCounts = computed(() => {
    const d = this.dept();
    const counts = new Map<string, number>();
    this.members().forEach((u) => counts.set(this.teamOf(u), (counts.get(this.teamOf(u)) ?? 0) + 1));
    return d.teams.map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }));
  });
  protected readonly filteredMembers = computed(() => {
    const q = this.mq().toLowerCase();
    return this.members().filter((u) => (!this.teamSel() || this.teamOf(u) === this.teamSel()) && (!q || u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)));
  });
  protected readonly shownMembers = computed(() => this.filteredMembers().slice(0, this.shown()));
  protected readonly otherDepts = computed(() => this.store.depts().filter((d) => d.id !== this.dept()?.id));
  protected readonly roleMix = computed(() => {
    const m = new Map<string, number>();
    this.members().forEach((u) => m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ label: this.store.role(id)?.name ?? id, value: v, color: this.store.role(id)?.color ?? 'var(--ka-999999)' }));
  });
  protected readonly topDepts = computed(() => {
    const m = this.store.usersByDept();
    return [...this.store.depts()].sort((a, b) => (m.get(b.id) ?? 0) - (m.get(a.id) ?? 0)).slice(0, 10).map((d, i) => ({ label: d.name, value: m.get(d.id) ?? 0, color: i % 2 ? 'var(--ka-3b82f6)' : 'var(--ka-10b981)' }));
  });
  protected readonly topMax = computed(() => Math.max(...this.topDepts().map((r) => r.value), 1));
  protected readonly buLabels = computed(() => this.store.bus().map((b) => b.code.slice(3)));
  protected readonly buSeries = computed(() => {
    const per = this.store.bus().map((b) => this.store.depts().filter((d) => this.store.site(d.siteId)?.buId === b.id));
    return [
      { name: 'Departments', color: 'var(--ka-10b981)', values: per.map((l) => l.length) },
      { name: 'Teams', color: 'var(--ka-7c3aed)', values: per.map((l) => l.reduce((a, d) => a + d.teams.length, 0)) },
    ];
  });

  protected ini(n: string) {
    return n.split(' ').map((w) => w[0]).slice(0, 2).join('');
  }
  protected color(n: string) {
    return ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0891b2)', 'var(--ka-16a34a)', 'var(--ka-ea580c)'][n.length % 5];
  }
  protected changeHead(d: Department, name: string) {
    if (!name) return;
    this.store.saveDept({ ...d, head: name });
    this.store.toast(`${name} is now head of ${d.name}`);
  }
  protected remove(d: Department) {
    const n = this.store.usersByDept().get(d.id) ?? 0;
    if (n && !confirm(`${d.name} has ${n} people. Delete anyway? Their accounts stay but lose the department link.`)) return;
    this.store.removeNode('dept', d.id);
    this.selId.set(this.store.depts()[0]?.id ?? '');
    this.store.toast(`${d.name} deleted`);
  }
  protected openTeam(t?: Team) {
    this.teamErr.set('');
    this.team.set(t ? { ...t } : { id: '', name: '', lead: '', members: 0, shift: 'Day A' });
  }
  protected saveTeam() {
    const t = this.team()!;
    const d = this.dept();
    if (!t.name.trim()) return this.teamErr.set('Team name is required.');
    const teams = t.id ? d.teams.map((x) => (x.id === t.id ? t : x)) : [...d.teams, { ...t, id: `${d.id}-t${Date.now()}` }];
    this.store.depts.update((l) => l.map((x) => (x.id === d.id ? { ...x, teams } : x)));
    this.store.log(t.id ? 'Updated' : 'Created', 'Team', `${t.name} (${d.name})`, `Lead: ${t.lead || 'none'} · shift ${t.shift}`, 'Organization');
    this.store.toast(`Team ${t.name} saved`);
    this.team.set(null);
  }
  protected removeTeam(d: Department, t: Team) {
    if (!confirm(`Remove team ${t.name}? Members are redistributed to the remaining teams.`)) return;
    this.store.depts.update((l) => l.map((x) => (x.id === d.id ? { ...x, teams: x.teams.filter((y) => y.id !== t.id) } : x)));
    this.store.log('Deleted', 'Team', `${t.name} (${d.name})`, 'Team removed', 'Organization', 'Warning');
    this.store.toast(`Team ${t.name} removed`);
    if (this.teamSel() === t.id) this.teamSel.set(null);
  }
  protected move(u: AppUser, v: string) {
    if (!v) return;
    if (v.startsWith('t:')) {
      this.teamMoves.update((m) => ({ ...m, [u.id]: v.slice(2) }));
      this.store.log('Updated', 'User', u.name, `Moved to team ${this.teamName(v.slice(2))}`, 'Organization');
      return this.store.toast(`${u.name} moved to ${this.teamName(v.slice(2))}`);
    }
    const d = this.store.dept(v.slice(2))!;
    const site = this.store.site(d.siteId)!;
    this.store.patchUser(u.id, { deptId: d.id, siteId: site.id, buId: site.buId }, `Transferred to ${d.name} (${site.name})`);
    this.store.toast(`${u.name} transferred to ${d.name}`);
  }
  protected exportCsv() {
    const m = this.store.usersByDept();
    const rows: (string | number)[][] = [['Department', 'Site', 'Head', 'Cost Center', 'Team', 'Team Lead', 'Shift', 'Department Users']];
    this.store.depts().forEach((d) => (d.teams.length ? d.teams : [{ name: '', lead: '', shift: '' } as Team]).forEach((t) => rows.push([d.name, this.store.site(d.siteId)?.name ?? '', d.head, d.costCenter, t.name, t.lead, t.shift, m.get(d.id) ?? 0])));
    downloadCsv('departments-teams.csv', rows);
  }
}
