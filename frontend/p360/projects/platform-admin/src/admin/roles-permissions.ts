import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { Action, ACTIONS, AdminStore, MODULE_LIST, Role } from './admin.data';
import { ADMIN_CSS, AdminToast } from './admin-ui';

const SCOPES: Role['scope'][] = ['Tenant', 'Business Unit', 'Site', 'Department', 'Self'];
const PRESETS: Record<string, Action[]> = { None: [], 'View only': ['View'], Contribute: ['View', 'Create', 'Edit'], Manage: ['View', 'Create', 'Edit', 'Approve', 'Export'], Full: [...ACTIONS] };

@Component({
  selector: 'app-admin-roles-permissions',
  imports: [...UI, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Roles &amp; Permissions" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Define what each role can view, create, edit, delete, approve and export in every module.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />Create Role</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export Matrix</button>
    </app-page-head>

    @if (!store.tenant().rbac) {
      <p class="note warn"><app-icon name="triangle-alert" [size]="16" /><span><b>Role Based Access Control is disabled for this tenant.</b> Every signed-in user currently has full access. <button class="link" (click)="enableRbac()">Enable RBAC</button></span></p>
    }

    <section class="kpi-row">
      <app-kpi label="Roles" [value]="store.roles().length" icon="shield-check" color="var(--ka-7c3aed)" [sub]="systemCount() + ' system · ' + (store.roles().length - systemCount()) + ' custom'" />
      <app-kpi label="Users with Admin Rights" [value]="adminUsers()" icon="key-round" color="var(--ka-ef4444)" sub="Super, Tenant & Site Admins" />
      <app-kpi label="Permissions Granted" [value]="totalGranted()" icon="list-checks" color="var(--ka-2563eb)" [sub]="'of ' + store.roles().length * cells + ' possible'" />
      <app-kpi label="Modules Covered" [value]="modules.length" icon="grid" color="var(--ka-10b981)" [sub]="actions.length + ' actions each'" />
      <app-kpi label="Least-privilege Score" [value]="lpScore() + '%'" icon="shield" color="var(--ka-f59e0b)" sub="share of roles below Manage" />
    </section>

    <section class="split left">
      <div class="card">
        <h3 class="ct">Roles</h3>
        <ul class="side">
          @for (r of store.roles(); track r.id) {
            <li><button [class.on]="selId() === r.id" (click)="select(r.id)">
              <span class="dot" [style.background]="r.color"></span>
              <span class="grow">{{ r.name }}<small>{{ r.type }} · {{ r.scope }} scope</small></span>
              <span class="cnt">{{ store.usersByRole().get(r.id) ?? 0 }}</span>
            </button></li>
          }
        </ul>
      </div>

      @if (draft(); as r) {
        <div class="card">
          <div class="dh">
            <span class="ri" [style.background]="'color-mix(in srgb, ' + r.color + ' 12%, transparent)'" [style.color]="r.color"><app-icon name="shield-check" [size]="20" /></span>
            <div>
              @if (locked()) {<h3>{{ r.name }}</h3>} @else {<input class="input title-in" [value]="r.name" (input)="patch({ name: $any($event.target).value })" />}
              <small class="muted">{{ r.desc }}</small>
            </div>
            <div class="toolbar">
              <span [class]="r.type === 'System' ? 'tag blue' : 'tag'">{{ r.type }}</span>
              <button class="btn-ghost" (click)="clone(r)"><app-icon name="admin-copy" [size]="14" />Clone</button>
              @if (r.type === 'Custom') {<button class="btn-ghost danger" (click)="del.set(r.id)"><app-icon name="admin-trash" [size]="14" />Delete</button>}
            </div>
          </div>
          <div class="meta">
            <label class="field">Data scope<select class="select" [disabled]="locked()" [value]="r.scope" (change)="patch({ scope: $any($event.target).value })">@for (s of scopes; track s) {<option>{{ s }}</option>}</select></label>
            <label class="field">Colour<input type="color" class="color" [disabled]="locked()" [value]="(r.color.startsWith('#') ? r.color : '#' + r.color.slice(-7, -1))" (input)="patch({ color: $any($event.target).value })" /></label>
            <div class="stat"><b>{{ granted(r) }} / {{ cells }}</b><small>permissions granted</small></div>
            <div class="stat"><b>{{ store.usersByRole().get(r.id) ?? 0 }}</b><small>users assigned</small></div>
          </div>
          <div class="ch tabs-row">
            <div class="seg"><button [class.on]="view() === 'matrix'" (click)="view.set('matrix')">Permission matrix</button><button [class.on]="view() === 'compare'" (click)="view.set('compare')">Compare</button><button [class.on]="view() === 'users'" (click)="view.set('users')">Users ({{ store.usersByRole().get(r.id) ?? 0 }})</button></div>
            @if (view() === 'compare') {<label class="cmp">Compare with <select class="select" [value]="cmpId()" (change)="cmpId.set($any($event.target).value)">@for (o of store.roles(); track o.id) {@if (o.id !== r.id) {<option [value]="o.id">{{ o.name }}</option>}}</select></label>}
            @if (view() === 'matrix') {<label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Filter modules..." [value]="mq()" (input)="mq.set($any($event.target).value)" /></label>}
          </div>
          @if (locked() && view() === 'matrix') {<p class="note"><app-icon name="admin-lock" [size]="15" />Super Admin is a protected system role and always has every permission.</p>}

          @switch (view()) {
            @case ('matrix') {
              <div class="mx-wrap">
                <table class="mx">
                  <thead><tr><th class="mod">Module</th>
                    @for (a of actions; track a) {<th><button [disabled]="locked()" (click)="toggleCol(a)" [title]="'Toggle ' + a + ' for all modules'">{{ a }}</button></th>}
                    <th>Preset</th></tr></thead>
                  <tbody>
                    @for (m of shownModules(); track m.path) {
                      <tr [class.changed]="changedRow(m.path)">
                        <td class="mod"><app-icon [name]="m.icon" [size]="14" />{{ m.title }}</td>
                        @for (a of actions; track a) {
                          <td><label class="cb" [class.on]="has(r, m.path, a)"><input type="checkbox" [disabled]="locked()" [checked]="has(r, m.path, a)" (change)="toggle(m.path, a)" /><app-icon name="admin-check" [size]="12" [stroke]="3.2" /></label></td>
                        }
                        <td><select class="select sm" [disabled]="locked()" [value]="presetOf(r, m.path)" (change)="applyPreset(m.path, $any($event.target).value)">@for (p of presetNames; track p) {<option>{{ p }}</option>}<option disabled>Custom</option></select></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @case ('compare') {
              @let o = store.role(cmpId());
              @if (o) {
                <div class="legend"><span><i class="both"></i>Both</span><span><i class="a"></i>Only {{ r.name }}</span><span><i class="b"></i>Only {{ o.name }}</span><b class="muted">{{ diffCount(r, o) }} differences</b></div>
                <div class="mx-wrap">
                  <table class="mx">
                    <thead><tr><th class="mod">Module</th>@for (a of actions; track a) {<th>{{ a }}</th>}</tr></thead>
                    <tbody>
                      @for (m of modules; track m.path) {
                        <tr><td class="mod"><app-icon [name]="m.icon" [size]="14" />{{ m.title }}</td>
                          @for (a of actions; track a) {
                            @let x = has(r, m.path, a); @let y = has(o, m.path, a);
                            <td><span class="cdot" [class.both]="x && y" [class.a]="x && !y" [class.b]="!x && y"></span></td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
            @case ('users') {
              <ul class="mini users">
                @for (u of roleUsers(); track u.id) {
                  <li><span class="av sm" [style.background]="u.avatar">{{ u.initials }}</span><div><b>{{ u.name }}</b><small>{{ u.title }} · {{ store.dept(u.deptId)?.name }}</small></div>
                    <select class="select sm" (change)="reassign(u.id, u.name, $any($event.target).value)"><option value="">Change role…</option>@for (o of store.roles(); track o.id) {@if (o.id !== r.id) {<option [value]="o.id">{{ o.name }}</option>}}</select></li>
                } @empty {<li class="muted">No users have this role yet.</li>}
              </ul>
              @if ((store.usersByRole().get(r.id) ?? 0) > 60) {<p class="muted">Showing first 60 — manage the rest in <a class="link" href="/administration-configuration/user-group-management">User &amp; Group Management</a>.</p>}
            }
          }

          @if (dirty()) {
            <div class="savebar"><span><app-icon name="triangle-alert" [size]="15" />Unsaved changes to {{ r.name }} · affects {{ store.usersByRole().get(r.id) ?? 0 }} users</span>
              <div class="toolbar"><button class="btn-ghost" (click)="discard()">Discard</button><button class="btn-primary" (click)="save()">Save changes</button></div></div>
          }
        </div>
      }
    </section>

    @if (newRole(); as n) {
      <div class="g-overlay" (click)="newRole.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); createRole()">
        <div class="modal-head"><h3>Create role</h3><button type="button" class="close-btn" (click)="newRole.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Role name *<input class="input" [value]="n.name" (input)="newRole.set({ ...n, name: $any($event.target).value })" /></label>
          <label class="full">Description<input class="input" [value]="n.desc" (input)="newRole.set({ ...n, desc: $any($event.target).value })" /></label>
          <label>Start from<select class="select" [value]="n.base" (change)="newRole.set({ ...n, base: $any($event.target).value })"><option value="">Blank (no permissions)</option>@for (o of store.roles(); track o.id) {<option [value]="o.id">{{ o.name }}</option>}</select></label>
          <label>Data scope<select class="select" [value]="n.scope" (change)="newRole.set({ ...n, scope: $any($event.target).value })">@for (s of scopes; track s) {<option>{{ s }}</option>}</select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newRole.set(null)">Cancel</button><button class="btn-primary" type="submit">Create role</button></div>
      </form>
    }
    @if (del(); as id) {
      <div class="g-overlay" (click)="del.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Delete {{ store.role(id)?.name }}?</h3><button class="close-btn" (click)="del.set(null)">×</button></div>
        <p>{{ store.usersByRole().get(id) ?? 0 }} users have this role. Move them to:</p>
        <select class="select" #fb><option value="r-emp">Employee</option>@for (o of store.roles(); track o.id) {@if (o.id !== id && o.id !== 'r-emp') {<option [value]="o.id">{{ o.name }}</option>}}</select>
        <div class="form-actions"><button class="btn-ghost" (click)="del.set(null)">Cancel</button><button class="btn-primary" (click)="doDelete(id, fb.value)">Delete role</button></div>
      </div>
    }
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; } .dh .toolbar { flex-wrap: nowrap; }
    .title-in { font-size: 16px; font-weight: 700; padding: 4px 8px; }
    .meta { display: grid; grid-template-columns: 180px 90px 1fr 1fr; gap: 10px; align-items: end; margin-bottom: 12px; } .color { height: 34px; width: 100%; padding: 2px; border: 1px solid var(--border); border-radius: 7px; background: var(--kb-ffffff); }
    .tabs-row { margin-bottom: 10px; } .cmp { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .mx-wrap { overflow: auto; max-height: 620px; border: 1px solid var(--border); border-radius: 10px; }
    .mx { width: 100%; border-collapse: collapse; font-size: 12.5px; } .mx th { position: sticky; top: 0; background: var(--kb-f8f7fd); z-index: 1; padding: 8px 6px; font-weight: 600; font-size: 12px; color: var(--kf-4b4f6b); border-bottom: 1px solid var(--border); }
    .mx th button { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 2px 6px; border-radius: 5px; } .mx th button:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); }
    .mx td { padding: 5px 6px; border-bottom: 1px solid var(--kl-f0f1f6); text-align: center; } .mx .mod { text-align: left; white-space: nowrap; } .mx td.mod { display: flex; align-items: center; gap: 8px; color: var(--text); } .mx td.mod app-icon { color: var(--primary); }
    .mx tr:hover td { background: var(--kb-faf9ff); } .mx tr.changed td { background: var(--kb-fffbeb); }
    .cb { width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--kl-cfd3e0); display: inline-grid; place-items: center; cursor: pointer; color: transparent; background: var(--kb-ffffff); }
    .cb input { display: none; } .cb.on { background: var(--primary); border-color: var(--primary); color: var(--kf-ffffff); }
    .cb:has(input:disabled) { cursor: default; opacity: 0.75; }
    .select.sm { padding-top: 4px; padding-bottom: 4px; font-size: 12px; }
    .legend { display: flex; gap: 14px; align-items: center; font-size: 12px; margin-bottom: 8px; } .legend span { display: flex; align-items: center; gap: 5px; } .legend i, .cdot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; background: var(--kb-eef0f5); }
    .both { background: var(--kb-22c55e) !important; } .a { background: var(--kb-7c3aed) !important; } .b { background: var(--kb-f59e0b) !important; }
    .users { max-height: 560px; overflow: auto; } .users .select { width: 160px; }
    .savebar { position: sticky; bottom: 12px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--kb-1e1b3a); color: var(--kf-ffffff); font-size: 12.5px; box-shadow: 0 10px 30px rgba(20,20,60,.25); }
    .savebar span { display: flex; align-items: center; gap: 8px; } .savebar .btn-ghost { background: transparent; color: var(--kf-ffffff); border-color: var(--kl-4b4775); }
    @media (max-width: 1100px) { .meta { grid-template-columns: 1fr 1fr; } }
  `],
})
export class RolesPermissions {
  protected readonly store = inject(AdminStore);
  protected readonly actions = ACTIONS;
  protected readonly modules = MODULE_LIST;
  protected readonly scopes = SCOPES;
  protected readonly presetNames = Object.keys(PRESETS);
  protected readonly cells = MODULE_LIST.length * ACTIONS.length;
  protected readonly selId = signal('r-sec');
  protected readonly cmpId = signal('r-site');
  protected readonly view = signal<'matrix' | 'compare' | 'users'>('matrix');
  protected readonly mq = signal('');
  protected readonly draft = signal<Role | null>(null);
  protected readonly newRole = signal<{ name: string; desc: string; base: string; scope: Role['scope'] } | null>(null);
  protected readonly del = signal<string | null>(null);
  protected readonly err = signal('');

  constructor() {
    effect(() => {
      const r = this.store.role(this.selId());
      untracked(() => this.draft.set(r ? structuredClone(r) : null));
    });
  }

  protected readonly locked = computed(() => this.draft()?.id === 'r-super');
  protected readonly dirty = computed(() => {
    const d = this.draft();
    const r = this.store.role(this.selId());
    return !!d && !!r && JSON.stringify(d) !== JSON.stringify(r);
  });
  protected readonly systemCount = computed(() => this.store.roles().filter((r) => r.type === 'System').length);
  protected readonly adminUsers = computed(() => ['r-super', 'r-tenant', 'r-site'].reduce((a, id) => a + (this.store.usersByRole().get(id) ?? 0), 0));
  protected readonly totalGranted = computed(() => this.store.roles().reduce((a, r) => a + this.granted(r), 0).toLocaleString());
  protected readonly lpScore = computed(() => {
    const rs = this.store.roles();
    return Math.round((rs.filter((r) => this.granted(r) < this.cells * 0.5).length / rs.length) * 100);
  });
  protected readonly shownModules = computed(() => {
    const q = this.mq().toLowerCase();
    return this.modules.filter((m) => !q || m.title.toLowerCase().includes(q));
  });
  protected readonly roleUsers = computed(() => this.store.users().filter((u) => u.roleId === this.selId()).slice(0, 60));

  protected granted(r: Role) {
    return Object.values(r.perms).reduce((a, l) => a + l.length, 0);
  }
  protected has(r: Role, path: string, a: Action) {
    return r.id === 'r-super' || (r.perms[path] ?? []).includes(a);
  }
  protected presetOf(r: Role, path: string) {
    const cur = [...(r.perms[path] ?? [])].sort().join();
    return Object.entries(PRESETS).find(([, v]) => [...v].sort().join() === cur)?.[0] ?? 'Custom';
  }
  protected changedRow(path: string) {
    const r = this.store.role(this.selId());
    return !!r && [...(r.perms[path] ?? [])].sort().join() !== [...(this.draft()?.perms[path] ?? [])].sort().join();
  }
  protected diffCount(a: Role, b: Role) {
    let n = 0;
    for (const m of this.modules) for (const x of this.actions) if (this.has(a, m.path, x) !== this.has(b, m.path, x)) n++;
    return n;
  }
  protected select(id: string) {
    if (this.dirty() && !confirm('Discard unsaved changes?')) return;
    this.selId.set(id);
    if (this.cmpId() === id) this.cmpId.set(id === 'r-site' ? 'r-emp' : 'r-site');
  }
  protected patch(ch: Partial<Role>) {
    this.draft.update((d) => (d ? { ...d, ...ch } : d));
  }
  private setPerm(path: string, list: Action[]) {
    this.draft.update((d) => (d ? { ...d, perms: { ...d.perms, [path]: ACTIONS.filter((a) => list.includes(a)) } } : d));
  }
  protected toggle(path: string, a: Action) {
    const cur = this.draft()!.perms[path] ?? [];
    let next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a];
    if (a !== 'View' && !cur.includes(a) && !next.includes('View')) next = [...next, 'View']; // any action implies View
    if (a === 'View' && cur.includes('View')) next = [];
    this.setPerm(path, next);
  }
  protected toggleCol(a: Action) {
    const d = this.draft()!;
    const all = this.modules.every((m) => (d.perms[m.path] ?? []).includes(a));
    this.modules.forEach((m) => {
      const cur = d.perms[m.path] ?? [];
      this.setPerm(m.path, all ? (a === 'View' ? [] : cur.filter((x) => x !== a)) : [...new Set<Action>([...cur, a, 'View'])]);
    });
  }
  protected applyPreset(path: string, p: string) {
    if (PRESETS[p]) this.setPerm(path, PRESETS[p]);
  }
  protected discard() {
    this.draft.set(structuredClone(this.store.role(this.selId())!));
  }
  protected save() {
    const d = this.draft()!;
    if (!d.name.trim()) return this.store.toast('Role name is required');
    const before = this.store.role(d.id)!;
    const changed = this.modules.filter((m) => [...(before.perms[m.path] ?? [])].sort().join() !== [...(d.perms[m.path] ?? [])].sort().join()).map((m) => m.title);
    this.store.saveRole({ ...d }, changed.length ? `Permissions changed on ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` +${changed.length - 3} more` : ''}` : 'Role details updated');
    this.store.toast(`${d.name} saved · ${this.store.usersByRole().get(d.id) ?? 0} users updated`);
  }
  protected clone(r: Role) {
    const c: Role = { ...structuredClone(r), id: `r-${Date.now()}`, name: `${r.name} (Copy)`, type: 'Custom' };
    this.store.saveRole(c, `Cloned from ${r.name}`);
    this.selId.set(c.id);
    this.store.toast(`${c.name} created`);
  }
  protected openNew() {
    this.err.set('');
    this.newRole.set({ name: '', desc: '', base: '', scope: 'Site' });
  }
  protected createRole() {
    const n = this.newRole()!;
    if (!n.name.trim()) return this.err.set('Role name is required.');
    if (this.store.roles().some((r) => r.name.toLowerCase() === n.name.trim().toLowerCase())) return this.err.set('A role with this name already exists.');
    const base = this.store.role(n.base);
    const r: Role = { id: `r-${Date.now()}`, name: n.name.trim(), desc: n.desc || 'Custom role', type: 'Custom', color: 'var(--ka-0891b2)', scope: n.scope, perms: base ? structuredClone(base.perms) : {} };
    this.store.saveRole(r, base ? `Created from ${base.name}` : 'Created blank');
    this.newRole.set(null);
    this.selId.set(r.id);
    this.store.toast(`Role ${r.name} created`);
  }
  protected doDelete(id: string, fallback: string) {
    const name = this.store.role(id)?.name;
    this.store.deleteRole(id, fallback);
    this.del.set(null);
    this.selId.set('r-emp');
    this.store.toast(`${name} deleted`);
  }
  protected reassign(uid: string, name: string, roleId: string) {
    if (!roleId) return;
    this.store.patchUser(uid, { roleId }, `Role changed to ${this.store.role(roleId)?.name}`);
    this.store.toast(`${name} is now ${this.store.role(roleId)?.name}`);
  }
  protected enableRbac() {
    this.store.setTenant('rbac', true, 'Role Based Access Control');
    this.store.toast('RBAC enabled');
  }
  protected exportCsv() {
    const rows: (string | number)[][] = [['Role', 'Module', ...ACTIONS]];
    this.store.roles().forEach((r) => this.modules.forEach((m) => rows.push([r.name, m.title, ...ACTIONS.map((a) => (this.has(r, m.path, a) ? 'Y' : ''))])));
    downloadCsv('permission-matrix.csv', rows);
  }
}
