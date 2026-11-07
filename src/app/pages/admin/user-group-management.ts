import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { AdminStore, AppUser, colorOf, fmtN, Group, GROUP_RULES, initialsOf } from './admin.data';
import { ADMIN_CSS, AdminSwitch, AdminToast } from './admin-ui';

@Component({
  selector: 'app-admin-user-group-management',
  imports: [...UI, DataTable, AdminToast, AdminSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="User &amp; Group Management" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Invite and manage user accounts, sign-in security and user groups.">
      <button class="btn-primary" (click)="openInvite()"><app-icon name="user-plus" [size]="16" />Invite User</button>
      <button class="btn-ghost" (click)="openGroup()"><app-icon name="users" [size]="16" />New Group</button>
      <button class="btn-ghost" (click)="exportCsv(store.users())"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Users" [value]="fmt(store.users().length)" icon="users" color="#7c3aed" [sub]="fmt(store.activeUsers()) + ' active'" />
      <app-kpi label="Pending Invites" [value]="count('Invited')" icon="admin-mail" color="#2563eb" sub="awaiting first sign-in" />
      <app-kpi label="Locked / Disabled" [value]="count('Locked') + ' / ' + count('Disabled')" icon="admin-lock" color="#ef4444" sub="needs review" />
      <app-kpi label="MFA Enrolled" [value]="mfaPct() + '%'" icon="shield-check" color="#10b981" [sub]="fmt(noMfa()) + ' active users without MFA'" />
      <app-kpi label="User Groups" [value]="store.groups().length" icon="admin-sitemap" color="#f59e0b" [sub]="dynamicCount() + ' dynamic · ' + (store.groups().length - dynamicCount()) + ' static'" />
    </section>

    <div class="seg tabsel"><button [class.on]="tab() === 'users'" (click)="tab.set('users')">Users</button><button [class.on]="tab() === 'groups'" (click)="tab.set('groups')">Groups</button></div>

    @if (tab() === 'users') {
      <section class="split">
        <div class="card">
          <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters()" [actions]="actions" [selectable]="true" [bulkActions]="bulk" noun="users" [activeId]="selId()"
            [searchKeys]="['name', 'email', 'title', 'dept', 'id']" searchPlaceholder="Search name, email, ID, department..." (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
        </div>
        @if (user(); as u) {
          <aside class="card det">
            <div class="dh"><span class="av lg" [style.background]="u.avatar">{{ u.initials }}</span><div><h3>{{ u.name }}</h3><small class="muted">{{ u.title }} · {{ u.id }}</small></div><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <span [class]="statusTag(u.status)">{{ u.status }}</span>
            <dl class="kv">
              <dt>Email</dt><dd>{{ u.email }}</dd><dt>Phone</dt><dd>{{ u.phone }}</dd>
              <dt>Department</dt><dd>{{ store.dept(u.deptId)?.name }}</dd><dt>Site</dt><dd>{{ store.site(u.siteId)?.name }}</dd>
              <dt>Last sign-in</dt><dd>{{ u.lastLogin }}</dd><dt>Joined</dt><dd>{{ u.joined }}</dd>
            </dl>
            <label class="field">Role<select class="select" [value]="u.roleId" (change)="setRole(u, $any($event.target).value)">@for (r of store.roles(); track r.id) {<option [value]="r.id">{{ r.name }}</option>}</select></label>
            <ul class="pol">
              <li><div><b>Multi-factor authentication</b><small>{{ u.mfa ? 'Authenticator app enrolled' : 'Not enrolled' }}</small></div><app-admin-switch [on]="u.mfa" (toggled)="store.patchUser(u.id, { mfa: $event }, $event ? 'MFA enrolment required' : 'MFA reset'); store.toast(u.name + ': MFA ' + ($event ? 'enrolment requested' : 'reset'))" /></li>
              <li><div><b>Single sign-on</b><small>{{ u.sso ? 'Signs in with Azure AD' : 'Local password' }}</small></div><app-admin-switch [on]="u.sso" (toggled)="store.patchUser(u.id, { sso: $event }, 'SSO ' + ($event ? 'enabled' : 'disabled'))" /></li>
            </ul>
            <h4>Groups</h4>
            <div class="chips">@for (g of groupsOf(u); track g.id) {<span class="chip-s">{{ g.name }}</span>} @empty {<span class="muted">No groups</span>}</div>
            <div class="toolbar acts">
              <button class="btn-ghost" (click)="act('reset', u)"><app-icon name="key-round" [size]="14" />Reset password</button>
              @if (u.status === 'Locked') {<button class="btn-ghost" (click)="act('unlock', u)"><app-icon name="admin-unlock" [size]="14" />Unlock</button>}
              @if (u.status === 'Invited') {<button class="btn-ghost" (click)="act('resend', u)"><app-icon name="admin-mail" [size]="14" />Resend invite</button>}
              @if (u.status === 'Disabled') {<button class="btn-ghost" (click)="act('enable', u)">Enable</button>} @else {<button class="btn-ghost danger" (click)="act('disable', u)"><app-icon name="admin-user-x" [size]="14" />Disable</button>}
            </div>
          </aside>
        }
      </section>
    } @else {
      <section class="gg">
        @for (g of groupRows(); track g.id) {
          <div class="card grp" [class.on]="gSel() === g.id" (click)="gSel.set(g.id)">
            <div class="dh"><span class="ri" [style.background]="g.color + '1f'" [style.color]="g.color"><app-icon name="users" [size]="18" /></span><div><b>{{ g.name }}</b><small class="muted">{{ g.type }} · owner {{ g.owner }}</small></div><b class="n">{{ fmt(g.count) }}</b></div>
            <p class="muted d">{{ g.desc }}</p>
            @if (g.type === 'Dynamic') {<small class="rule"><app-icon name="filter" [size]="12" />{{ g.ruleLabel }}</small>}
            <div class="avs">@for (m of g.preview; track m.id) {<span class="av sm" [style.background]="m.avatar" [title]="m.name">{{ m.initials }}</span>}</div>
            <div class="toolbar" (click)="$event.stopPropagation()">
              <button class="btn-ghost sm" (click)="openGroup(g)">Edit</button>
              <button class="btn-ghost sm" (click)="notify(g)">Notify members</button>
              <button class="btn-ghost sm" (click)="exportCsv(membersOf(g))">Export</button>
              <button class="btn-ghost sm danger" (click)="deleteGroup(g)">Delete</button>
            </div>
          </div>
        }
      </section>
    }

    @if (invite(); as f) {
      <div class="g-overlay" (click)="invite.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); sendInvite()">
        <div class="modal-head"><h3>Invite user</h3><button type="button" class="close-btn" (click)="invite.set(null)">×</button></div>
        <div class="form-grid">
          <label>Full name *<input class="input" [value]="f.name" (input)="invite.set({ ...f, name: $any($event.target).value })" /></label>
          <label>Work email *<input class="input" type="email" [value]="f.email" (input)="invite.set({ ...f, email: $any($event.target).value })" /></label>
          <label>Department<select class="select" [value]="f.deptId" (change)="invite.set({ ...f, deptId: $any($event.target).value })">@for (d of store.depts(); track d.id) {<option [value]="d.id">{{ d.name }}</option>}</select></label>
          <label>Role<select class="select" [value]="f.roleId" (change)="invite.set({ ...f, roleId: $any($event.target).value })">@for (r of store.roles(); track r.id) {<option [value]="r.id">{{ r.name }}</option>}</select></label>
          <label class="full">Job title<input class="input" [value]="f.title" (input)="invite.set({ ...f, title: $any($event.target).value })" /></label>
        </div>
        @if (store.seatsUsed() >= store.subscription().seats) {<p class="note warn">All {{ store.subscription().seats }} licensed seats are in use — the invite will be queued until seats are added.</p>}
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="invite.set(null)">Cancel</button><button class="btn-primary" type="submit">Send invite</button></div>
      </form>
    }
    @if (gForm(); as g) {
      <div class="g-overlay" (click)="gForm.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveGroup()">
        <div class="modal-head"><h3>{{ g.id ? 'Edit group' : 'New group' }}</h3><button type="button" class="close-btn" (click)="gForm.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Group name *<input class="input" [value]="g.name" (input)="gForm.set({ ...g, name: $any($event.target).value })" /></label>
          <label class="full">Description<input class="input" [value]="g.desc" (input)="gForm.set({ ...g, desc: $any($event.target).value })" /></label>
          <label>Type<select class="select" [value]="g.type" (change)="gForm.set({ ...g, type: $any($event.target).value })"><option>Dynamic</option><option>Static</option></select></label>
          @if (g.type === 'Dynamic') {
            <label>Membership rule<select class="select" [value]="g.rule" (change)="gForm.set({ ...g, rule: $any($event.target).value })">@for (r of ruleKeys; track r) {<option [value]="r">{{ rules[r].label }}</option>}</select></label>
          } @else {
            <label>Add members from department<select class="select" (change)="addDept(g, $any($event.target).value)"><option value="">Choose…</option>@for (d of store.depts(); track d.id) {<option [value]="d.id">{{ d.name }}</option>}</select></label>
          }
        </div>
        <p class="muted">{{ fmt(previewCount(g)) }} members</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="gForm.set(null)">Cancel</button><button class="btn-primary" type="submit">Save group</button></div>
      </form>
    }
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .tabsel { margin-bottom: 12px; }
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 10px; } .det > span[class^='tag'] { align-self: flex-start; } .det .kv { margin: 0; } .av.lg { width: 46px; height: 46px; font-size: 15px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; } .acts { margin-top: 4px; }
    .gg { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .grp { cursor: pointer; display: flex; flex-direction: column; gap: 8px; } .grp.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .grp .dh { margin: 0; } .grp .n { font-size: 20px; }
    .d { margin: 0; font-size: 12.5px; } .rule { display: flex; gap: 5px; align-items: center; color: var(--primary); font-size: 11.5px; }
    .avs { display: flex; } .avs .av { margin-right: -6px; border: 2px solid #fff; }
  `],
})
export class UserGroupManagement {
  protected readonly store = inject(AdminStore);
  protected readonly fmt = fmtN;
  protected readonly rules = GROUP_RULES;
  protected readonly ruleKeys = Object.keys(GROUP_RULES);
  protected readonly tab = signal<'users' | 'groups'>('users');
  protected readonly selId = signal<string | null>('U0001');
  protected readonly gSel = signal<string | null>(null);
  protected readonly invite = signal<{ name: string; email: string; deptId: string; roleId: string; title: string } | null>(null);
  protected readonly gForm = signal<Group | null>(null);
  protected readonly err = signal('');

  protected readonly user = computed(() => this.store.users().find((u) => u.id === this.selId()) ?? null);
  protected count(s: AppUser['status']) {
    return this.store.users().filter((u) => u.status === s).length;
  }
  protected readonly noMfa = computed(() => this.store.users().filter((u) => u.status === 'Active' && !u.mfa).length);
  protected readonly mfaPct = computed(() => Math.round((1 - this.noMfa() / Math.max(1, this.store.activeUsers())) * 100));
  protected readonly dynamicCount = computed(() => this.store.groups().filter((g) => g.type === 'Dynamic').length);
  protected readonly rows = computed(() => this.store.users().map((u) => ({ ...u, role: this.store.role(u.roleId)?.name ?? '', dept: this.store.dept(u.deptId)?.name ?? '', site: this.store.site(u.siteId)?.name ?? '', mfaTxt: u.mfa ? 'Yes' : 'No' })));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'User', kind: 'person', sub: 'email' }, { key: 'role', label: 'Role' }, { key: 'dept', label: 'Department' }, { key: 'site', label: 'Site' },
    { key: 'mfa', label: 'MFA', kind: 'bool' }, { key: 'lastLogin', label: 'Last Sign-in' }, { key: 'status', label: 'Status', kind: 'tag', tag: (r) => this.statusTag(r.status) },
  ];
  protected readonly filters = computed(() => [
    { key: 'status', label: 'Status', options: ['Active', 'Invited', 'Locked', 'Disabled'] },
    { key: 'role', label: 'Role', options: this.store.roles().map((r) => r.name) },
    { key: 'site', label: 'Site', options: this.store.sites().map((s) => s.name) },
    { key: 'mfaTxt', label: 'MFA', options: ['Yes', 'No'] },
  ]);
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'file-text' }, { id: 'reset', label: 'Reset password', icon: 'key-round' },
    { id: 'unlock', label: 'Unlock', icon: 'admin-unlock', when: (r) => r.status === 'Locked' }, { id: 'resend', label: 'Resend invite', icon: 'admin-mail', when: (r) => r.status === 'Invited' },
    { id: 'enable', label: 'Enable', icon: 'shield-check', when: (r) => r.status === 'Disabled' }, { id: 'disable', label: 'Disable', icon: 'admin-user-x', danger: true, when: (r) => r.status !== 'Disabled' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'mfa', label: 'Require MFA' }, { id: 'export', label: 'Export' }, { id: 'disable', label: 'Disable', danger: true }];
  protected statusTag(s: string) {
    return s === 'Active' ? 'tag green' : s === 'Invited' ? 'tag blue' : s === 'Locked' ? 'tag amber' : 'tag red';
  }
  protected act(a: string, u: AppUser) {
    if (a === 'view') return this.selId.set(u.id);
    const msg: Record<string, [Partial<AppUser>, string, string]> = {
      reset: [{}, 'Password reset link sent', `Password reset link emailed to ${u.email}`],
      unlock: [{ status: 'Active' }, 'Account unlocked', `${u.name} unlocked`],
      resend: [{}, 'Invitation re-sent', `Invitation re-sent to ${u.email}`],
      enable: [{ status: 'Active' }, 'Account enabled', `${u.name} enabled`],
      disable: [{ status: 'Disabled' }, 'Account disabled', `${u.name} disabled · sessions revoked, badge suspended`],
    };
    const [ch, what, t] = msg[a];
    this.store.patchUser(u.id, ch, what);
    this.store.toast(t);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return this.exportCsv(this.store.users().filter((u) => ids.includes(u.id)));
    const ch: Partial<AppUser> = a === 'mfa' ? { mfa: true } : { status: 'Disabled' };
    this.store.users.update((l) => l.map((u) => (ids.includes(u.id) ? { ...u, ...ch } : u)));
    this.store.log('Updated', 'User', `${ids.length} users`, a === 'mfa' ? 'MFA required (bulk)' : 'Disabled (bulk)', a === 'mfa' ? 'Security' : 'Users & Roles', 'Warning');
    this.store.toast(`${ids.length} users ${a === 'mfa' ? 'must enrol in MFA' : 'disabled'}`);
  }
  protected setRole(u: AppUser, roleId: string) {
    this.store.patchUser(u.id, { roleId }, `Role changed to ${this.store.role(roleId)?.name}`);
    this.store.toast(`${u.name} is now ${this.store.role(roleId)?.name}`);
  }
  protected groupsOf(u: AppUser) {
    return this.store.groups().filter((g) => this.store.groupMembers(g).includes(u.id));
  }
  protected membersOf(g: Group) {
    const ids = new Set(this.store.groupMembers(g));
    return this.store.users().filter((u) => ids.has(u.id));
  }
  protected readonly groupRows = computed(() => this.store.groups().map((g) => {
    const m = this.membersOf(g);
    return { ...g, count: m.length, preview: m.slice(0, 8), ruleLabel: GROUP_RULES[g.rule]?.label ?? '' };
  }));
  protected openInvite() {
    this.err.set('');
    this.invite.set({ name: '', email: '', deptId: 'd-ops', roleId: 'r-emp', title: '' });
  }
  protected sendInvite() {
    const f = this.invite()!;
    if (!f.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return this.err.set('Name and a valid email are required.');
    if (this.store.users().some((u) => u.email.toLowerCase() === f.email.toLowerCase())) return this.err.set('A user with this email already exists.');
    const d = this.store.dept(f.deptId)!;
    const s = this.store.site(d.siteId)!;
    const id = `U${String(this.store.users().length + 1).padStart(4, '0')}`;
    this.store.addUser({ id, name: f.name.trim(), initials: initialsOf(f.name), avatar: colorOf(f.name), email: f.email, phone: '—', roleId: f.roleId, deptId: d.id, siteId: s.id, buId: s.buId, status: 'Invited', lastLogin: '—', mfa: false, sso: true, title: f.title || 'New joiner', joined: new Date().toISOString().slice(0, 10) });
    this.invite.set(null);
    this.selId.set(id);
    this.store.toast(`Invitation sent to ${f.email}`);
  }
  protected openGroup(g?: Group) {
    this.gForm.set(g ? { ...g, members: [...g.members] } : { id: '', name: '', desc: '', type: 'Dynamic', rule: 'ops', members: [], roleIds: [], owner: 'Demo Login', color: '#0891b2', created: new Date().toISOString().slice(0, 10) });
  }
  protected previewCount(g: Group) {
    return g.type === 'Dynamic' ? this.store.users().filter(GROUP_RULES[g.rule]?.match ?? (() => false)).length : g.members.length;
  }
  protected addDept(g: Group, deptId: string) {
    if (!deptId) return;
    const ids = this.store.users().filter((u) => u.deptId === deptId).map((u) => u.id);
    this.gForm.set({ ...g, members: [...new Set([...g.members, ...ids])] });
  }
  protected saveGroup() {
    const g = this.gForm()!;
    if (!g.name.trim()) return this.store.toast('Group name is required');
    const out = { ...g, id: g.id || `g-${Date.now()}`, rule: g.type === 'Dynamic' ? g.rule : '' };
    this.store.saveGroup(out);
    this.gForm.set(null);
    this.store.toast(`Group ${g.name} saved · ${fmtN(this.previewCount(out))} members`);
  }
  protected deleteGroup(g: Group) {
    if (!confirm(`Delete group ${g.name}?`)) return;
    this.store.groups.update((l) => l.filter((x) => x.id !== g.id));
    this.store.log('Deleted', 'User Group', g.name, 'Group deleted', 'Users & Roles', 'Warning');
    this.store.toast(`${g.name} deleted`);
  }
  protected notify(g: Group) {
    this.store.toast(`Notification sent to ${fmtN(this.membersOf(g).length)} members of ${g.name}`);
  }
  protected exportCsv(list: AppUser[]) {
    downloadCsv('users.csv', [['ID', 'Name', 'Email', 'Role', 'Department', 'Site', 'Status', 'MFA', 'Last sign-in'], ...list.map((u) => [u.id, u.name, u.email, this.store.role(u.roleId)?.name ?? '', this.store.dept(u.deptId)?.name ?? '', this.store.site(u.siteId)?.name ?? '', u.status, u.mfa ? 'Yes' : 'No', u.lastLogin])]);
  }
}
