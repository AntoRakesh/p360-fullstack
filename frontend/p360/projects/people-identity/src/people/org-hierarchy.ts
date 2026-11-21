import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { PersonProfile } from './person-profile';
import { DEPTS, PEOPLE, Person } from '@p360/shared/data/people.data';

interface OrgNode {
  id: string;
  name: string;
  title: string;
  dept: string;
  initials: string;
  avatar: string;
  headcount: number;
  children: OrgNode[];
}

const node = (name: string, title: string, dept: string, headcount: number, children: OrgNode[] = []): OrgNode => {
  const p = PEOPLE.find((x) => x.name === name);
  return {
    id: p?.id ?? name,
    name,
    title,
    dept,
    initials: name.split(' ').map((x) => x[0]).join('').slice(0, 2),
    avatar: p?.avatar ?? 'var(--ka-7c3aed)',
    headcount,
    children,
  };
};

const TREE: OrgNode = node('Omar Khalid', 'Chief Executive Officer', 'Executive', 8920, [
  node('Priya Sharma', 'Chief Technology Officer', 'IT', 1840, [
    node('Arjun Mehta', 'Head of Infrastructure', 'IT', 420, [node('Chen Wei', 'R&D Manager', 'R&D', 210), node('Kenji Sato', 'Network Manager', 'IT', 96)]),
    node('David Lee', 'Head of Software', 'IT', 640, [node('Hannah Lee', 'Engineering Manager', 'IT', 180), node('Lucas Silva', 'QA Manager', 'IT', 74)]),
  ]),
  node('Fatima Al Mansoori', 'Chief Financial Officer', 'Finance', 620, [
    node('Ahmed Saleh', 'Financial Controller', 'Finance', 210),
    node('Aisha Rahman', 'General Counsel', 'Legal', 64),
  ]),
  node('Mohammed Ali', 'Chief Operating Officer', 'Operations', 4870, [
    node('Ravi Shankar', 'Head of Manufacturing', 'Operations', 2140, [node('Tom Baker', 'Plant Manager', 'Operations', 980), node('Vikram Rao', 'Quality Manager', 'Operations', 160)]),
    node('Yusuf Rahman', 'Head of Logistics', 'Logistics', 1460, [node('Ahmed Hassan', 'Warehouse Manager', 'Logistics', 720)]),
    node('Grace Park', 'Head of Facilities', 'Facility Maintenance', 410),
  ]),
  node('Sophie Martin', 'Chief Commercial Officer', 'Sales', 1150, [
    node('Daniel Kim', 'Head of Sales', 'Sales', 760),
    node('Layla Haddad', 'Head of Marketing', 'Marketing', 230),
    node('Meera Iyer', 'Head of Support', 'Support', 160),
  ]),
  node('Sara Nair', 'Chief People Officer', 'HR', 240),
]);

const flatten = (n: OrgNode, depth = 0, parent: string | null = null): (OrgNode & { depth: number; parent: string | null })[] => [
  { ...n, depth, parent },
  ...n.children.flatMap((c) => flatten(c, depth + 1, n.id)),
];
const ALL = flatten(TREE);

@Component({
  selector: 'app-org-hierarchy',
  imports: [...UI, PersonProfile, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Organizational Hierarchy" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Reporting lines, departments and team sizes across the organization.">
      <label class="search-box">
        <app-icon name="search" [size]="15" />
        <input placeholder="Find a person or title" [value]="q()" (input)="q.set($any($event.target).value)" />
      </label>
      <button class="btn-ghost" (click)="expandAll()">Expand all</button>
      <button class="btn-ghost" (click)="collapsed.set(allIds())">Collapse all</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Total Headcount" value="8,920" icon="users" color="var(--ka-8b5cf6)" sub="employees" />
      <app-kpi label="Departments" [value]="depts.length" icon="building" color="var(--ka-3b82f6)" />
      <app-kpi label="People Managers" value="1,046" icon="briefcase" color="var(--ka-22c55e)" sub="avg. span 8.5" />
      <app-kpi label="Org Layers" value="6" icon="workflow" color="var(--ka-f59e0b)" sub="CEO to front line" />
      <app-kpi label="Open Positions" value="37" icon="user-plus" color="var(--ka-ef4444)" />
    </section>

    <section class="dash">
      <div class="card span-8 tree-card">
        <div class="card-head"><h3>Reporting Structure</h3>@if (q()) {<span class="muted">{{ matches().size }} match(es)</span>}</div>
        <div class="tree">
          <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: tree }" />
        </div>
      </div>
      <div class="span-4 side">
        @if (sel(); as s) {
          <div class="card">
            <div class="card-head"><h3>{{ s.name }}</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
            <p class="muted">{{ s.title }} · {{ s.dept }}</p>
            <dl class="kv">
              <dt>Team size</dt><dd>{{ s.headcount.toLocaleString() }}</dd>
              <dt>Direct reports</dt><dd>{{ s.children.length }}</dd>
              <dt>Reports to</dt><dd>{{ parentName(s.id) }}</dd>
            </dl>
            @if (s.children.length) {
              <h4>Direct reports</h4>
              <ul class="reports">
                @for (c of s.children; track c.id) {
                  <li (click)="select(c.id)"><span class="dt-av" [style.background]="c.avatar">{{ c.initials }}</span><div><b>{{ c.name }}</b><small>{{ c.title }}</small></div></li>
                }
              </ul>
            }
            @if (person(); as p) {
              <button class="btn-outline" (click)="profile.set(p)">View full profile</button>
            }
          </div>
        }
        <div class="card">
          <div class="card-head"><h3>Headcount by Department</h3></div>
          <app-bar-list [rows]="deptRows" [max]="4870" />
        </div>
      </div>
    </section>

    <ng-template #nodeTpl let-n>
      <div class="node-wrap">
        <div class="node" [class.sel]="selId() === n.id" [class.hit]="matches().has(n.id)" [class.dim]="q() && !matches().has(n.id)" (click)="select(n.id)">
          @if (n.children.length) {
            <button class="tog" (click)="$event.stopPropagation(); toggle(n.id)">{{ collapsed().has(n.id) ? '+' : '−' }}</button>
          } @else {
            <span class="tog leaf"></span>
          }
          <span class="dt-av" [style.background]="n.avatar">{{ n.initials }}</span>
          <div class="info"><b>{{ n.name }}</b><small>{{ n.title }}</small></div>
          <span class="hc">{{ n.headcount.toLocaleString() }}</span>
        </div>
        @if (n.children.length && !collapsed().has(n.id)) {
          <div class="kids">
            @for (c of n.children; track c.id) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: c }" />
            }
          </div>
        }
      </div>
    </ng-template>

    @if (profile(); as p) {
      <div class="g-overlay" (click)="profile.set(null)"></div>
      <aside class="g-drawer wide"><app-person-profile [person]="p" (closed)="profile.set(null)" /></aside>
    }
  `,
  styles: `
    .tree { overflow: auto; max-height: 640px; padding: 4px; }
    .kids { margin-left: 26px; padding-left: 14px; border-left: 2px solid var(--kl-ede9fe); }
    .node-wrap { position: relative; }
    .kids > .node-wrap::before { content: ''; position: absolute; left: -14px; top: 26px; width: 14px; border-top: 2px solid var(--kl-ede9fe); }
    .node { display: flex; align-items: center; gap: 10px; margin: 5px 0; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-ffffff); cursor: pointer; max-width: 460px; transition: opacity .15s; }
    .node:hover { border-color: var(--kl-c4b5fd); } .node.sel { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .node.hit { background: var(--kb-fef9c3); } .node.dim { opacity: 0.45; }
    .info { display: flex; flex-direction: column; flex: 1; min-width: 0; font-size: 12.5px; } .info small { color: var(--muted); }
    .hc { font-size: 11.5px; padding: 2px 8px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); }
    .tog { width: 20px; height: 20px; border: 1px solid var(--border); border-radius: 5px; background: var(--kb-ffffff); cursor: pointer; line-height: 1; padding: 0; flex-shrink: 0; }
    .tog.leaf { border: 0; }
    .side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 13px; } .kv dt { color: var(--muted); } .kv dd { margin: 0; }
    h4 { margin: 12px 0 6px; font-size: 13px; }
    .reports { list-style: none; margin: 0 0 12px; padding: 0; }
    .reports li { display: flex; align-items: center; gap: 8px; padding: 6px 4px; cursor: pointer; border-radius: 6px; font-size: 12.5px; }
    .reports li:hover { background: var(--kb-faf8ff); } .reports div { display: flex; flex-direction: column; } .reports small { color: var(--muted); }
  `,
})
export class OrgHierarchy {
  protected readonly tree = TREE;
  protected readonly depts = DEPTS;
  protected readonly q = signal('');
  protected readonly selId = signal<string | null>(TREE.id);
  protected readonly collapsed = signal<Set<string>>(new Set(ALL.filter((n) => n.depth >= 2 && n.children.length).map((n) => n.id)));
  protected readonly profile = signal<Person | null>(null);
  protected readonly deptRows = [
    ['Operations', 4870], ['IT', 1840], ['Logistics', 1460], ['Sales', 760], ['Finance', 620], ['Facility Maintenance', 410], ['HR', 240],
  ].map(([label, v]) => ({ label: label as string, value: v as number, display: (v as number).toLocaleString() }));

  protected readonly sel = computed(() => ALL.find((n) => n.id === this.selId()) ?? null);
  protected readonly person = computed(() => PEOPLE.find((p) => p.id === this.selId()) ?? null);
  protected readonly matches = computed(() => {
    const q = this.q().trim().toLowerCase();
    return new Set(q ? ALL.filter((n) => `${n.name} ${n.title}`.toLowerCase().includes(q)).map((n) => n.id) : []);
  });

  protected allIds() {
    return new Set(ALL.filter((n) => n.children.length && n.depth > 0).map((n) => n.id));
  }
  protected expandAll() {
    this.collapsed.set(new Set());
  }
  protected toggle(id: string) {
    this.collapsed.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected select(id: string) {
    this.selId.set(id);
    // Make sure the path to the selected node is expanded.
    let cur = ALL.find((n) => n.id === id);
    const open = new Set(this.collapsed());
    while (cur?.parent) {
      open.delete(cur.parent);
      cur = ALL.find((n) => n.id === cur!.parent);
    }
    this.collapsed.set(open);
  }
  protected parentName(id: string) {
    const p = ALL.find((n) => n.id === id)?.parent;
    return p ? ALL.find((n) => n.id === p)!.name : '— (top of organization)';
  }
}
