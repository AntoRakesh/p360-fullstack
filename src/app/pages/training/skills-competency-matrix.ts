import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { TrnAvatar } from './training-ui';
import {
  BASE, CATEGORIES, Category, CERT_TYPES, certStatus, CT, daysUntil, DEPT_COUNT, DEPTS, downloadCsv, fd, fmt, levelName, levelTone, PERSON, ROLES, SITES, Skill, TEmp, TONES, TOTAL_EMPLOYEES, TrainingStore,
} from './training.data';

const LEVELS = ['All Levels', 'Proficient (4-5)', 'Intermediate (3)', 'Basic (1-2)', 'Not Trained'];
const DUE_ICON: Record<string, [string, string]> = {
  'ct-fa': ['flame', '#ef4444'], 'ct-fs': ['flame', '#f43f5e'], 'ct-wah': ['training-helmet', '#f59e0b'], 'ct-fl': ['run', '#16a34a'],
  'ct-cs': ['box', '#334155'], 'ct-hm': ['triangle-alert', '#8b8fb0'],
};
const GAP_COLORS = ['#f43f5e', '#f43f5e', '#f59e0b', '#f59e0b', '#fbbf24', '#fcd34d'];
const DTABS = ['Skills', 'Training', 'Certifications', 'History'] as const;

@Component({
  selector: 'app-training-skills-competency-matrix',
  imports: [...UI, TrnAvatar, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Skills & Competency Matrix" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="View and manage employee skills, competency levels, training requirements and gaps across roles and departments.">
      <button class="btn-primary hb" (click)="openAddSkill()"><app-icon name="plus" [size]="16" />Add Skill</button>
      <label class="btn-ghost hb"><app-icon name="training-import" [size]="16" />Import Skills Matrix<input type="file" accept=".csv" hidden (change)="importFile($event)" /></label>
      <button class="btn-ghost hb" (click)="exportCsv()"><app-icon name="training-upload" [size]="16" />Export</button>
      <div class="menu-wrap">
        <button class="btn-ghost hb sq" (click)="more.set(!more()); $event.stopPropagation()" aria-label="More"><app-icon name="more" [size]="16" /></button>
        @if (more()) {
          <div class="dropdown">
            <button class="dd-item" (click)="go('reports-analytics')"><app-icon name="file-chart" [size]="15" />Skills reports</button>
            <button class="dd-item" (click)="go('training-catalog')"><app-icon name="training-book" [size]="15" />Training catalog</button>
            <button class="dd-item" (click)="print()"><app-icon name="training-printer" [size]="15" />Print matrix</button>
            <button class="dd-item danger" (click)="reset()"><app-icon name="refresh" [size]="15" />Reset demo data</button>
          </div>
        }
      </div>
    </app-page-head>

    <!-- KPIs -->
    <section class="kpis">
      <button class="card k" (click)="view.set('list')">
        <span class="ki" style="background:#7c3aed"><app-icon name="users" [size]="30" [stroke]="1.8" /></span>
        <div><small>Total Employees</small><b>{{ fmt(kTotal()) }}</b><em class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />6%</em><i>vs. last month</i></div>
      </button>
      <button class="card k" (click)="addSkillOpen.set(true)">
        <span class="ki" style="background:#22c55e"><app-icon name="training-award" [size]="30" [stroke]="1.8" /></span>
        <div><small>Skills Tracked</small><b>{{ store.skillsTracked() }}</b><em class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />12%</em><i>vs. last month</i></div>
      </button>
      <button class="card k" (click)="topLevel.set('Proficient (4-5)')">
        <span class="ki" style="background:#f59e0b"><app-icon name="training-target" [size]="30" [stroke]="1.8" /></span>
        <div class="kp"><small>Proficient</small><b>{{ kProf() }}%</b><span class="bar"><i [style.width.%]="kProf()"></i></span></div>
      </button>
      <button class="card k" (click)="gapsOpen.set(true)">
        <span class="ki" style="background:#ef4444"><app-icon name="triangle-alert" [size]="30" [stroke]="1.8" /></span>
        <div><small>Skill Gaps</small><b>{{ fmt(kGaps()) }}</b><em class="dn"><app-icon name="arrow-down" [size]="14" [stroke]="2.6" />15%</em><i>vs. last month</i></div>
      </button>
      <button class="card k" (click)="go('renewals-expiry-alerts')">
        <span class="ki" style="background:#3b82f6"><app-icon name="graduation-cap" [size]="30" [stroke]="1.8" /></span>
        <div><small>Due for Training</small><b>{{ fmt(kDue()) }}</b><em class="up"><app-icon name="arrow-up" [size]="14" [stroke]="2.6" />28%</em><i>within 30 days</i></div>
      </button>
    </section>

    <!-- Filter bar -->
    <section class="fbar">
      <label class="search-box fs"><app-icon name="search" [size]="16" /><input placeholder="Search employee, skill or role..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
      <select class="select f" [value]="topDept()" (change)="setTopDept($any($event.target).value)">
        <option>All Departments</option>@for (d of depts; track d) {<option>{{ d }}</option>}
      </select>
      <select class="select f" [value]="topRole()" (change)="setTopRole($any($event.target).value)">
        <option>All Roles</option>@for (r of roles; track r) {<option>{{ r }}</option>}
      </select>
      <select class="select f wide" [value]="topCat()" (change)="setTopCat($any($event.target).value)">
        <option>All Skill Categories</option>@for (c of cats; track c) {<option>{{ c }}</option>}
      </select>
      <select class="select f" [value]="topLevel()" (change)="topLevel.set($any($event.target).value)">
        @for (l of levels; track l) {<option>{{ l }}</option>}
      </select>
      <div class="menu-wrap">
        <button class="btn-ghost mf" [class.act]="moreCount()" (click)="mf.set(!mf()); $event.stopPropagation()"><app-icon name="filter" [size]="15" />More Filters @if (moreCount()) {<span class="cnt">{{ moreCount() }}</span>}</button>
        @if (mf()) {
          <div class="dropdown mfd" (click)="$event.stopPropagation()">
            <label>Site<select class="select" [value]="site()" (change)="site.set($any($event.target).value)"><option>All Sites</option>@for (s of sites; track s) {<option>{{ s }}</option>}</select></label>
            <label>Employee status<select class="select" [value]="empStatus()" (change)="empStatus.set($any($event.target).value)"><option>All</option><option>Active</option><option>On Leave</option></select></label>
            <label class="ck"><input type="checkbox" [checked]="onlyGaps()" (change)="onlyGaps.set(!onlyGaps())" />Only employees with skill gaps</label>
            <label class="ck"><input type="checkbox" [checked]="onlyDue()" (change)="onlyDue.set(!onlyDue())" />Only employees due for training</label>
            <div class="mf-foot"><button class="link" (click)="clearMore()">Clear all</button><button class="btn-primary btn-sm" (click)="mf.set(false)">Apply</button></div>
          </div>
        }
      </div>
      <div class="vt">
        <button [class.on]="view() === 'matrix'" (click)="view.set('matrix')"><app-icon name="training-matrix" [size]="16" />Matrix View</button>
        <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="training-list" [size]="16" />List View</button>
        <button [class.on]="view() === 'heatmap'" (click)="view.set('heatmap')"><app-icon name="training-heat" [size]="16" />Heatmap</button>
      </div>
    </section>

    <!-- Overview row -->
    <section class="ov3">
      <div class="card">
        <h3 class="ch">Skill Proficiency Overview</h3>
        <div class="donut-row">
          <div class="dn-wrap" (mouseleave)="hb.set(null)">
            <svg viewBox="0 0 180 180">
              @for (s of donut(); track s.key) {
                <circle cx="90" cy="90" r="70" fill="none" [attr.stroke]="s.color" [attr.stroke-width]="hb() === s.key ? 30 : 24" [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 90 90)" (mouseenter)="hb.set(s.key)" (click)="bandClick(s.key)" />
              }
            </svg>
            <div class="dn-mid"><b>{{ hovBand()?.pct ?? kProf() }}%</b><span>{{ hovBand()?.key ?? 'Proficient' }}</span></div>
          </div>
          <ul class="dl">
            @for (s of donut(); track s.key) {
              <li [class.dim]="hb() && hb() !== s.key" (mouseenter)="hb.set(s.key)" (mouseleave)="hb.set(null)" (click)="bandClick(s.key)"><i [style.background]="s.color"></i><span>{{ s.key }}</span><b>{{ s.pct }}%</b><em>({{ fmt(s.value) }})</em></li>
            }
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="chr"><h3 class="ch">Top Skill Gaps</h3><button class="link" (click)="gapsOpen.set(true)">View All</button></div>
        <ul class="gaps">
          @for (g of topGaps(); track g.id; let i = $index) {
            <li [class.on]="focusSkill() === g.id" (click)="focusGap(g)" [title]="'Show ' + g.name + ' in the matrix'">
              <span>{{ g.name }}</span>
              <div class="gt"><i [style.width.%]="(g.n / topGaps()[0].n) * 100" [style.background]="gapColors[i]"></i></div>
              <b>{{ g.n }}</b>
            </li>
          }
        </ul>
      </div>
      <div class="card">
        <div class="chr"><h3 class="ch">Training Due Soon</h3><button class="link" (click)="go('renewals-expiry-alerts')">View All</button></div>
        <ul class="due">
          @for (d of dueTop(); track d.type.id) {
            <li (click)="dueOpen.set(d.type.id)">
              <span class="di" [style.background]="dueIcon(d.type.id)[1]"><app-icon [name]="dueIcon(d.type.id)[0]" [size]="15" [stroke]="2.2" /></span>
              <span class="dn">{{ d.type.name }}</span>
              <b>{{ d.count }}</b>
              <em [class]="'db ' + dueTone(d.window)">In {{ d.window }} days</em>
            </li>
          } @empty {<li class="muted">Nothing due in the next 30 days.</li>}
        </ul>
      </div>
    </section>

    <!-- Matrix + details -->
    <section class="bottom" [class.full]="!sel()">
      <div class="card mx">
        <h3 class="ch">Skills & Competency Matrix</h3>
        <div class="mx-ctl">
          <div class="vb"><span>View by:</span>
            <div class="seg"><button [class.on]="viewBy() === 'emp'" (click)="viewBy.set('emp')">Employees</button><button [class.on]="viewBy() === 'role'" (click)="viewBy.set('role')">Roles</button></div>
          </div>
          <label class="fl">Department<select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)"><option>All Departments</option>@for (d of matrixDepts; track d) {<option>{{ d }}</option>}</select></label>
          <label class="fl">Role<select class="select" [value]="role()" (change)="role.set($any($event.target).value)"><option>All Roles</option>@for (r of roles; track r) {<option>{{ r }}</option>}</select></label>
          <label class="fl">Skill Category<select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option>All Categories</option>@for (c of cats; track c) {<option>{{ c }}</option>}</select></label>
          <label class="search-box ss"><app-icon name="search" [size]="15" /><input placeholder="Search skills..." [value]="skillQ()" (input)="skillQ.set($any($event.target).value)" /></label>
        </div>
        <div class="legend">
          <span><i style="background:#22c55e"></i>Proficient (4-5)</span><span><i style="background:#3b82f6"></i>Intermediate (3)</span>
          <span><i style="background:#f59e0b"></i>Basic (1-2)</span><span><i style="background:#ef4444"></i>Not Trained</span><span><i style="background:#9ca3af"></i>Not Applicable</span>
          @if (picked().size) {
            <span class="bulk"><b>{{ picked().size }} selected</b>
              <button class="btn-ghost sm" (click)="assignOpen.set(true)">Assign Training</button>
              <button class="btn-ghost sm" (click)="exportCsv(true)">Export</button>
              <button class="link" (click)="clearPicked()">Clear</button></span>
          }
        </div>

        @switch (view()) {
          @case ('matrix') {
            @if (viewBy() === 'emp') {
              <div class="tw">
                <table class="mt">
                  <thead><tr>
                    <th class="cbx"><input type="checkbox" [checked]="allPicked()" (change)="toggleAll()" /></th>
                    <th class="emp sortable" (click)="sortBy('name')">Employee @if (sort().key === 'name') {<span class="sa">{{ sort().dir > 0 ? '▲' : '▼' }}</span>}</th>
                    <th class="rl sortable" (click)="sortBy('role')">Role</th>
                    @for (s of cols(); track s.id) {
                      <th class="sk sortable" [class.focus]="focusSkill() === s.id" (click)="sortBy(s.id)" [title]="'Sort by ' + s.name">
                        <app-icon [name]="s.icon" [size]="22" [stroke]="2.2" [style.color]="s.color" /><span>{{ s.name }}</span>
                        @if (sort().key === s.id) {<em class="sa">{{ sort().dir > 0 ? '▲' : '▼' }}</em>}
                      </th>
                    }
                  </tr></thead>
                  <tbody>
                    @for (e of rows(); track e.id) {
                      <tr [class.sel]="selId() === e.id" (click)="pick(e.id)">
                        <td class="cbx" (click)="$event.stopPropagation()"><input type="checkbox" [checked]="picked().has(e.id)" (change)="togglePick(e.id)" /></td>
                        <td class="emp"><div class="ep"><app-trn-avatar [look]="e.look" [size]="27" /><b>{{ e.name }}</b></div></td>
                        <td class="rl">{{ e.role }}</td>
                        @for (s of cols(); track s.id) {
                          @let l = e.levels[s.id] ?? null;
                          <td class="cell" [class.focus]="focusSkill() === s.id" (click)="$event.stopPropagation(); editCell.set(isEdit(e.id, s.id) ? null : { emp: e.id, skill: s.id })">
                            <span class="lv" [class.dim]="!levelMatch(l)" [style.background]="tone(l).bg" [style.color]="tone(l).fg" [title]="s.name + ': ' + (l === null ? 'Not applicable' : 'Level ' + l + ' – ' + lname(l))">{{ l === null ? '-' : l }}</span>
                            @if (isEdit(e.id, s.id)) {
                              <div class="lv-pop" (click)="$event.stopPropagation()">
                                <small>{{ e.name }} · {{ s.name }}</small>
                                <div class="lv-opts">
                                  @for (o of [0, 1, 2, 3, 4, 5]; track o) {
                                    <button [class.cur]="l === o" [style.background]="tone(o).bg" [style.color]="tone(o).fg" (click)="setLevel(e, s, o)">{{ o }}</button>
                                  }
                                  <button [class.cur]="l === null" [style.background]="tone(null).bg" (click)="setLevel(e, s, null)">N/A</button>
                                </div>
                              </div>
                            }
                          </td>
                        }
                      </tr>
                    } @empty {
                      <tr><td [attr.colspan]="3 + cols().length" class="empty">No employees match the current filters. <button class="link" (click)="clearAll()">Clear filters</button></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="tw">
                <table class="mt">
                  <thead><tr><th class="emp">Role</th><th class="rl">Employees</th>
                    @for (s of cols(); track s.id) {<th class="sk"><app-icon [name]="s.icon" [size]="22" [stroke]="2.2" [style.color]="s.color" /><span>{{ s.name }}</span></th>}
                  </tr></thead>
                  <tbody>
                    @for (r of roleRows(); track r.role) {
                      <tr (click)="role.set(r.role); viewBy.set('emp')" title="Show employees in this role">
                        <td class="emp"><b>{{ r.role }}</b></td><td class="rl">{{ r.n }}</td>
                        @for (s of cols(); track s.id) {
                          @let a = r.avg[s.id];
                          <td class="cell"><span class="lv" [style.background]="tone(a === null ? null : roundL(a)).bg" [style.color]="tone(a === null ? null : roundL(a)).fg">{{ a === null ? '-' : a.toFixed(1) }}</span></td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
          @case ('list') {
            <app-data-table [rows]="listRows()" [columns]="listCols" [searchKeys]="['name', 'skill', 'role']" searchPlaceholder="Filter rows..." [filters]="listFilters" [pageSize]="8" noun="skill records"
              [activeId]="null" idKey="key" (rowClick)="pick($event.empId)" />
          }
          @case ('heatmap') {
            <p class="muted hm-note">Average proficiency (% of level 5) by department · {{ cat() === 'All Categories' ? 'all categories' : cat() + ' skills' }}</p>
            <app-heatmap [rows]="depts" [cols]="heatCols()" [data]="heatData()" suffix="%" />
          }
        }
      </div>

      @if (sel(); as e) {
        <aside class="card det">
          <div class="dh"><h3 class="ch">Employee Skill Details</h3><button class="close-btn" (click)="selId.set(null)" aria-label="Close"><app-icon name="training-x" [size]="18" /></button></div>
          <div class="who">
            <app-trn-avatar [look]="e.look" [size]="66" />
            <div>
              <div class="nm"><b>{{ e.name }}</b><span class="pill" [class.amber]="e.status !== 'Active'"><i></i>{{ e.status }}</span></div>
              <span class="mu">{{ e.id }}&nbsp; | &nbsp;{{ e.role }}</span>
              <span class="mu">{{ e.dept }}&nbsp; | &nbsp;{{ e.site }}</span>
            </div>
          </div>
          <nav class="dtabs">@for (t of dtabs; track t) {<button [class.on]="dtab() === t" (click)="dtab.set(t)">{{ t }}</button>}</nav>
          <div class="dbody">
            @switch (dtab()) {
              @case ('Skills') {
                <table class="st">
                  <thead><tr><th>Skill</th><th>Level</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (s of cols(); track s.id) {
                      @let l = e.levels[s.id] ?? null;
                      @let st = store.status(e, s.id);
                      <tr><td>{{ s.name }}</td>
                        <td><span class="lvl" [style.background]="tone(l).bg" [style.color]="tone(l).fg">{{ l === null ? 'N/A' : l + ' - ' + lname(l) }}</span></td>
                        <td><span class="stt" [style.color]="stColor(st)"><i></i>{{ st }}</span></td></tr>
                    }
                  </tbody>
                </table>
              }
              @case ('Training') {
                <ul class="dl2">
                  @for (en of store.enrollOf(e.id); track en.id) {
                    @let c = store.courseById().get(en.courseId);
                    <li><div><b>{{ c?.title }}</b><small>Due {{ fdt(en.due) }} · {{ en.source }}</small><span class="pg"><i [style.width.%]="en.progress"></i></span></div><span [class]="enTag(en.status)">{{ en.status }}</span></li>
                  } @empty {<li class="muted">No training enrolments.</li>}
                </ul>
              }
              @case ('Certifications') {
                <ul class="dl2">
                  @for (c of store.certsOf(e.id); track c.id) {
                    @let st = certStatus(c);
                    <li><div><b>{{ ctName(c.typeId) }}</b><small>{{ c.number }} · expires {{ fdt(c.expiry) }}</small></div>
                      <span class="cr"><span [class]="st === 'Valid' ? 'tag green' : st === 'Expiring' ? 'tag amber' : 'tag red'">{{ st }}{{ st === 'Expiring' ? ' · ' + days(c.expiry) + 'd' : '' }}</span>
                      @if (st !== 'Valid') {<button class="link" (click)="renew(c.id)">Renew</button>}</span></li>
                  } @empty {<li class="muted">No certificates on file.</li>}
                </ul>
              }
              @case ('History') {
                <ul class="hist">
                  @for (h of history(); track $index) {<li><i></i><div><b>{{ h.text }}</b><small>{{ h.at }} · {{ h.by }}</small></div></li>} @empty {<li class="muted">No history yet.</li>}
                </ul>
              }
            }
          </div>
          <div class="dfoot">
            <button class="btn-outline" (click)="viewPlan(e)">View Training Plan</button>
            <button class="btn-primary" (click)="openUpdate(e)">Update Skills</button>
          </div>
        </aside>
      }
    </section>

    <!-- Update skills modal -->
    @if (upd(); as u) {
      <div class="g-overlay" (click)="upd.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveUpdate()">
        <div class="modal-head"><h3>Update Skills · {{ u.name }}</h3><button type="button" class="close-btn" (click)="upd.set(null)">×</button></div>
        <div class="ug">
          @for (s of cols(); track s.id) {
            <label><span><app-icon [name]="s.icon" [size]="15" [style.color]="s.color" />{{ s.name }}</span>
              <select class="select" [value]="u.levels[s.id] === null ? 'na' : '' + u.levels[s.id]" (change)="setU(s.id, $any($event.target).value)">
                <option value="0">0 - Not Trained</option><option value="1">1 - Basic</option><option value="2">2 - Basic</option><option value="3">3 - Intermediate</option><option value="4">4 - Proficient</option><option value="5">5 - Expert</option><option value="na">Not Applicable</option>
              </select></label>
          }
        </div>
        <label class="note">Assessment note<input class="input" placeholder="e.g. Practical evaluation by supervisor" [value]="note()" (input)="note.set($any($event.target).value)" /></label>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="upd.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Changes</button></div>
      </form>
    }

    <!-- Add skill modal -->
    @if (addSkillOpen()) {
      <div class="g-overlay" (click)="addSkillOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveSkill()">
        <div class="modal-head"><h3>Add Skill</h3><button type="button" class="close-btn" (click)="addSkillOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Skill name *<input class="input" required [value]="ns().name" (input)="ns.set({ ...ns(), name: $any($event.target).value })" placeholder="e.g. Scaffold Erection" /></label>
          <label>Category<select class="select" [value]="ns().category" (change)="ns.set({ ...ns(), category: $any($event.target).value })">@for (c of cats; track c) {<option>{{ c }}</option>}</select></label>
          <label>Required level<select class="select" [value]="'' + ns().required" (change)="ns.set({ ...ns(), required: +$any($event.target).value })"><option value="2">2 - Basic</option><option value="3">3 - Intermediate</option><option value="4">4 - Proficient</option></select></label>
          <label class="full">Linked course<select class="select" [value]="ns().courseId" (change)="ns.set({ ...ns(), courseId: $any($event.target).value })">@for (c of store.courses(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.title }}</option>}</select></label>
        </div>
        <p class="muted sm">The new skill is added to the framework as a matrix column; every employee starts at level 0 (Not Trained).</p>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="addSkillOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Add Skill</button></div>
      </form>
    }

    <!-- All gaps modal -->
    @if (gapsOpen()) {
      <div class="g-overlay" (click)="gapsOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Skill Gaps · {{ fmt(kGaps()) }} employees below required level</h3><button class="close-btn" (click)="gapsOpen.set(false)">×</button></div>
        <table class="table">
          <thead><tr><th>Skill</th><th>Category</th><th class="num">Gaps</th><th>Linked course</th><th></th></tr></thead>
          <tbody>
            @for (g of allGaps(); track g.id) {
              <tr><td><span class="gi"><app-icon [name]="g.icon" [size]="15" [style.color]="g.color" />{{ g.name }}</span></td><td>{{ g.category }}</td><td class="num"><b>{{ g.n }}</b></td>
                <td>{{ store.courseById().get(g.courseId)?.title }}</td>
                <td>@if (g.n) {<button class="btn-ghost sm" (click)="gapsOpen.set(false); focusGap(g)">Show in matrix</button>}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Due group modal -->
    @if (dueGroup(); as d) {
      <div class="g-overlay" (click)="dueOpen.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>{{ d.type.name }} · {{ d.list.length }} due within {{ d.window }} days</h3><button class="close-btn" (click)="dueOpen.set(null)">×</button></div>
        <ul class="dl2 scroll">
          @for (c of d.list; track c.id) {
            @let p = person(c.empId);
            <li><div class="pp"><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span><div><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.dept }} · {{ p.site }}</small></div></div>
              <span class="tag" [class.red]="days(c.expiry) <= 14" [class.amber]="days(c.expiry) > 14">{{ days(c.expiry) }} days · {{ fdt(c.expiry) }}</span></li>
          }
        </ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="remindGroup(d.list)"><app-icon name="training-send" [size]="15" />Send reminders</button>
          <button class="btn-primary" (click)="enrollGroup(d.type.courseId, d.list)"><app-icon name="graduation-cap" [size]="15" />Enroll all in renewal course</button>
        </div>
      </div>
    }

    <!-- Assign training (bulk) -->
    @if (assignOpen()) {
      <div class="g-overlay" (click)="assignOpen.set(false)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); assign()">
        <div class="modal-head"><h3>Assign Training · {{ picked().size }} employees</h3><button type="button" class="close-btn" (click)="assignOpen.set(false)">×</button></div>
        <div class="form-grid">
          <label class="full">Course<select class="select" [value]="assignCourse()" (change)="assignCourse.set($any($event.target).value)">@for (c of store.courses(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.title }}</option>}</select></label>
          <label>Due in<select class="select" [value]="'' + assignDue()" (change)="assignDue.set(+$any($event.target).value)"><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="assignOpen.set(false)">Cancel</button><button class="btn-primary" type="submit">Assign</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    :host { display: block; }
    :host ::ng-deep .page-head { flex-wrap: nowrap; margin-bottom: 16px; } :host ::ng-deep .page-head .subtitle { font-size: 14px; }
    :host ::ng-deep .page-head .head-btns { flex-shrink: 0; margin-top: 30px; }
    .hb { padding: 9px 14px; font-size: 13px; } .btn-ghost.hb { font-weight: 500; } .hb.sq { padding: 9px 10px; } label.hb { cursor: pointer; }
    .danger { color: var(--red); }
    /* KPIs */
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .k { display: flex; gap: 16px; align-items: center; padding: 14px 16px; text-align: left; font: inherit; color: inherit; cursor: pointer; min-width: 0; }
    .k:hover { border-color: #d6ccfb; }
    .ki { width: 58px; height: 58px; border-radius: 10px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
    .k > div { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; min-width: 0; flex: 1; }
    .k small { grid-column: 1 / -1; font-size: 12.5px; color: #3b3f5c; }
    .k b { grid-column: 1 / -1; font-size: 22px; font-weight: 700; margin: 4px 0 6px; font-variant-numeric: tabular-nums; }
    .k em { font-style: normal; display: inline-flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 600; }
    .k em.up { color: #16a34a; } .k em.dn { color: #dc2626; }
    .k i { font-style: normal; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; align-self: center; }
    .kp .bar { grid-column: 1 / -1; height: 7px; border-radius: 6px; background: #e8e9f2; overflow: hidden; margin: 4px 0 6px; max-width: 128px; } .kp .bar i { display: block; height: 100%; background: #22c55e; border-radius: 6px; }
    /* filter bar */
    .fbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .fs { flex: 1 1 120px; max-width: 262px; padding: 8px 12px; min-width: 0; } .fs input { width: 100%; }
    .f { height: 36px; flex: 0 1 138px; min-width: 120px; } .f.wide { flex-basis: 156px; }
    .mf { height: 36px; font-weight: 500; } .mf.act { border-color: var(--primary); color: var(--primary); }
    .cnt { background: var(--primary); color: #fff; border-radius: 10px; padding: 0 6px; font-size: 10.5px; }
    .mfd { width: 250px; padding: 12px; display: flex; flex-direction: column; gap: 10px; left: 0; right: auto; }
    .mfd label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b4f6b; } .mfd .ck { flex-direction: row; align-items: center; gap: 7px; }
    .mf-foot { display: flex; justify-content: space-between; align-items: center; }
    .vt { display: flex; flex-shrink: 0; margin-left: auto; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #fff; }
    .vt button { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border: 0; background: #fff; font-size: 12.5px; cursor: pointer; color: #3b3f5c; }
    .vt button + button { border-left: 1px solid var(--border); } .vt button.on { background: var(--primary); color: #fff; }
    /* overview */
    .ov3 { display: grid; grid-template-columns: 1fr 1.08fr 1.05fr; gap: 12px; margin-bottom: 14px; }
    .ch { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
    .chr { display: flex; justify-content: space-between; align-items: center; }
    .donut-row { display: flex; align-items: center; gap: 22px; margin-top: 10px; }
    .dn-wrap { position: relative; width: 168px; flex-shrink: 0; } .dn-wrap svg { width: 100%; display: block; } .dn-wrap circle { cursor: pointer; transition: stroke-width .15s; }
    .dn-mid { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
    .dn-mid b { font-size: 21px; } .dn-mid span { font-size: 13px; font-weight: 600; color: #2b2e4a; }
    .dl { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 20px; }
    .dl li { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; font-size: 12.5px; cursor: pointer; } .dl li.dim { opacity: .45; }
    .dl i { width: 12px; height: 12px; border-radius: 50%; } .dl b { font-weight: 700; } .dl em { font-style: normal; color: #4b4f6b; }
    .gaps { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .gaps li { display: grid; grid-template-columns: 1fr 44% 26px; gap: 10px; align-items: center; font-size: 12.5px; cursor: pointer; padding: 3px 4px; border-radius: 6px; } .gaps li:hover, .gaps li.on { background: #f6f3ff; }
    .gt { height: 17px; } .gt i { display: block; height: 100%; border-radius: 2px; } .gaps b { text-align: right; font-weight: 600; }
    .due { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .due li { display: grid; grid-template-columns: 22px 1fr 34px 76px; gap: 12px; align-items: center; font-size: 12.5px; cursor: pointer; padding: 2px 4px; border-radius: 6px; } .due li:hover { background: #f6f3ff; }
    .di { width: 22px; height: 22px; border-radius: 5px; display: grid; place-items: center; color: #fff; } .due b { font-weight: 500; text-align: right; }
    .db { font-style: normal; font-size: 11.5px; text-align: center; padding: 3px 0; border-radius: 4px; }
    .db.red { background: #fee2e2; color: #dc2626; } .db.orange { background: #ffedd5; color: #ea580c; } .db.blue { background: #dbeafe; color: #2563eb; }
    /* bottom */
    .bottom { display: grid; grid-template-columns: minmax(0, 1fr) 356px; gap: 12px; align-items: start; } .bottom.full { grid-template-columns: 1fr; }
    .mx-ctl { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin: 12px 0 12px; }
    .vb { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
    .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .seg button { border: 0; background: #fff; padding: 0 18px; height: 34px; font-size: 12.5px; cursor: pointer; color: #3b3f5c; } .seg button.on { background: var(--primary); color: #fff; }
    .fl { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: #3b3f5c; } .fl .select { min-width: 140px; height: 34px; }
    .ss { padding: 7px 10px; flex: 1 1 140px; max-width: 160px; } .ss input { width: 100%; }
    .legend { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; font-size: 11.5px; color: #2b2e4a; margin-bottom: 12px; min-height: 26px; }
    .legend span { display: inline-flex; align-items: center; gap: 7px; } .legend i { width: 12px; height: 12px; border-radius: 50%; }
    .bulk { margin-left: auto; gap: 8px !important; } .bulk b { font-size: 12px; }
    .tw { overflow-x: auto; max-height: 560px; overflow-y: auto; border-radius: 8px; }
    .mt { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
    .mt th { position: sticky; top: 0; z-index: 2; background: #f6f7fb; font-weight: 500; font-size: 12px; color: #2b2e4a; padding: 8px 6px; border-bottom: 1px solid var(--border); text-align: left; }
    .mt th.sk { text-align: center; font-size: 10.5px; line-height: 1.15; width: 78px; min-width: 70px; vertical-align: bottom; }
    .mt th.sk app-icon { display: flex; justify-content: center; margin-bottom: 4px; } .mt th.sk span { display: block; }
    .mt th.sortable { cursor: pointer; } .mt th.sortable:hover { background: #efeafc; } .sa { font-style: normal; font-size: 9px; color: var(--primary); margin-left: 2px; }
    .mt th.focus, .mt td.focus { background: #f3eeff; }
    .mt td { padding: 3px 6px; border-bottom: 1px solid #eef0f5; height: 33px; }
    .mt tbody tr { cursor: pointer; } .mt tbody tr:hover td { background: #fafaff; } .mt tbody tr.sel td { background: #f5f1ff; }
    .cbx { width: 30px; text-align: center !important; } .cbx input { accent-color: var(--primary); }
    .emp { min-width: 140px; } .rl { color: #4b4f6b; min-width: 96px; }
    .ep { display: flex; align-items: center; gap: 10px; } .ep b { font-weight: 500; white-space: nowrap; }
    .cell { position: relative; text-align: center; }
    .lv { display: inline-block; width: 100%; max-width: 64px; padding: 4px 0; border-radius: 4px; font-weight: 500; transition: opacity .15s; } .lv.dim { opacity: .25; }
    .cell:hover .lv { box-shadow: 0 0 0 1.5px currentColor inset; }
    .lv-pop { position: absolute; z-index: 5; top: calc(100% - 2px); left: 50%; transform: translateX(-50%); background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 30px rgba(20,20,60,.18); padding: 8px; width: 222px; cursor: default; }
    .lv-pop small { display: block; font-size: 11px; color: var(--muted); margin-bottom: 6px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lv-opts { display: flex; gap: 4px; } .lv-opts button { flex: 1; border: 1px solid transparent; border-radius: 5px; padding: 5px 0; font-size: 12px; cursor: pointer; } .lv-opts button.cur { border-color: #111; font-weight: 700; }
    .empty { text-align: center; color: var(--muted); padding: 24px !important; }
    .hm-note { margin: 0 0 10px; font-size: 12px; }
    /* detail */
    .det { position: sticky; top: 76px; display: flex; flex-direction: column; }
    .dh { display: flex; justify-content: space-between; align-items: center; }
    .who { display: flex; gap: 14px; margin: 14px 0 12px; } .who app-trn-avatar { border-radius: 8px; overflow: hidden; }
    .who > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .nm { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .nm b { font-size: 17px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 6px; font-size: 12px; background: #dcfce7; color: #15803d; } .pill i { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
    .pill.amber { background: #fef3c7; color: #b45309; } .pill.amber i { background: #f59e0b; }
    .mu { font-size: 12.5px; color: #4b4f6b; }
    .dtabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
    .dtabs button { flex: 1; border: 0; background: none; padding: 9px 0; font-size: 12.5px; color: #3b3f5c; border-bottom: 2px solid transparent; cursor: pointer; } .dtabs button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .dbody { min-height: 262px; max-height: 330px; overflow: auto; }
    .st { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; } .st th:nth-child(1) { width: 36%; } .st th:nth-child(2) { width: 31%; } .st th { text-align: left; font-weight: 500; color: #4b4f6b; padding: 4px 2px 6px; }
    .st td { padding: 3px 2px; height: 25px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .st td:first-child { color: #2b2e4a; }
    .lvl { display: inline-block; width: 94%; padding: 3px 7px; border-radius: 3px; font-size: 11px; }
    .stt { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; white-space: nowrap; } .stt i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .dl2 { list-style: none; margin: 0; padding: 0; } .dl2 li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; }
    .dl2 li > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .dl2 small { color: var(--muted); font-size: 11px; }
    .dl2.scroll { max-height: 52vh; overflow: auto; }
    .pg { display: block; height: 5px; width: 160px; background: #eef0f6; border-radius: 4px; overflow: hidden; margin-top: 3px; } .pg i { display: block; height: 100%; background: var(--primary); }
    .cr { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
    .pp { flex-direction: row !important; align-items: center; gap: 10px !important; } .pp > div { display: flex; flex-direction: column; }
    .hist { list-style: none; margin: 0; padding: 0 0 0 6px; } .hist li { display: flex; gap: 10px; padding: 6px 0; font-size: 12px; }
    .hist li > i { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 0 3px var(--primary-soft); }
    .hist div { display: flex; flex-direction: column; } .hist b { font-weight: 500; } .hist small { color: var(--muted); font-size: 11px; }
    .dfoot { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; } .dfoot button { justify-content: center; padding: 10px; font-size: 13px; }
    .btn-outline { border-color: var(--primary); }
    .ug { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; } .ug label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; } .ug label span { display: flex; gap: 6px; align-items: center; }
    .note { display: flex; flex-direction: column; gap: 4px; font-size: 12px; margin-top: 12px; color: #4b4f6b; }
    .gi { display: inline-flex; gap: 6px; align-items: center; } .sm { font-size: 12px; }
    @media (max-width: 1400px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ov3 { grid-template-columns: 1fr 1fr; } .vt { margin-left: 0; } }
    @media (max-width: 1150px) { .bottom { grid-template-columns: 1fr; } .det { position: static; } }
  `,
})
export class SkillsCompetencyMatrix {
  protected readonly store = inject(TrainingStore);
  private readonly router = inject(Router);
  protected readonly base = BASE;
  protected readonly fmt = fmt;
  protected readonly fdt = fd;
  protected readonly days = daysUntil;
  protected readonly lname = levelName;
  protected readonly certStatus = certStatus;
  protected readonly depts = DEPTS;
  protected readonly matrixDepts = ['Operations', 'Maintenance', 'Security', 'Logistics'];
  protected readonly roles = ROLES;
  protected readonly cats = CATEGORIES;
  protected readonly sites = SITES;
  protected readonly levels = LEVELS;
  protected readonly gapColors = GAP_COLORS;
  protected readonly dtabs = DTABS;

  // top filters
  protected readonly q = signal('');
  protected readonly topDept = signal('All Departments');
  protected readonly topRole = signal('All Roles');
  protected readonly topCat = signal('All Skill Categories');
  protected readonly topLevel = signal('All Levels');
  protected readonly site = signal('All Sites');
  protected readonly empStatus = signal('All');
  protected readonly onlyGaps = signal(false);
  protected readonly onlyDue = signal(false);
  protected readonly view = signal<'matrix' | 'list' | 'heatmap'>('matrix');
  // matrix-local filters
  protected readonly viewBy = signal<'emp' | 'role'>('emp');
  protected readonly dept = signal('Operations');
  protected readonly role = signal('All Roles');
  protected readonly cat = signal<string>('Safety');
  protected readonly skillQ = signal('');
  protected readonly sort = signal<{ key: string; dir: number }>({ key: '', dir: 1 });
  protected readonly focusSkill = signal<string | null>(null);
  protected readonly editCell = signal<{ emp: string; skill: string } | null>(null);
  protected readonly picked = signal(new Set<string>());
  protected readonly selId = signal<string | null>('EMP-001');
  protected readonly dtab = signal<(typeof DTABS)[number]>('Skills');
  // ui
  protected readonly more = signal(false);
  protected readonly mf = signal(false);
  protected readonly hb = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly gapsOpen = signal(false);
  protected readonly dueOpen = signal<string | null>(null);
  protected readonly addSkillOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignCourse = signal('C-101');
  protected readonly assignDue = signal(30);

  @HostListener('document:click')
  protected closeMenus() {
    this.more.set(false);
    this.mf.set(false);
    this.editCell.set(null);
  }

  /* ---------- KPIs & overview (scaled by top department) ---------- */
  private readonly share = computed(() => (this.topDept() === 'All Departments' ? 1 : DEPT_COUNT[this.topDept()] / TOTAL_EMPLOYEES));
  protected readonly kTotal = computed(() => (this.topDept() === 'All Departments' ? TOTAL_EMPLOYEES : DEPT_COUNT[this.topDept()]));
  protected readonly kProf = computed(() => this.store.proficientPct());
  protected readonly kGaps = computed(() => Math.round(this.store.totalGaps() * this.share()));
  private readonly dueCerts = computed(() => {
    const d = this.topDept();
    return this.store.dueSoon().filter((c) => d === 'All Departments' || PERSON.get(c.empId)?.dept === d);
  });
  protected readonly kDue = computed(() => this.dueCerts().length);
  protected readonly donut = computed(() => {
    const C = 2 * Math.PI * 70;
    const vals = this.store.bands().map((b) => ({ ...b, value: Math.round(b.value * this.share()) }));
    const total = vals.reduce((a, b) => a + b.value, 0) || 1;
    let off = 0;
    return vals.map((b) => {
      const len = (b.value / total) * C;
      const o = { ...b, pct: Math.round((b.value / total) * 100), dash: `${Math.max(len - 1, 0)} ${C}`, off: -off };
      off += len;
      return o;
    });
  });
  protected readonly hovBand = computed(() => this.donut().find((d) => d.key === this.hb()));
  protected readonly allGaps = computed(() => this.store.gaps().map((g) => ({ ...g, n: Math.round(g.gaps * this.share()) })));
  protected readonly topGaps = computed(() => this.allGaps().slice(0, 6));
  protected readonly dueTop = computed(() => {
    const m = new Map<string, { type: (typeof CERT_TYPES)[number]; count: number; max: number }>();
    for (const c of this.dueCerts()) {
      const g = m.get(c.typeId) ?? { type: CT.get(c.typeId)!, count: 0, max: 0 };
      g.count++;
      g.max = Math.max(g.max, daysUntil(c.expiry));
      m.set(c.typeId, g);
    }
    return [...m.values()].map((g) => ({ ...g, window: g.max <= 7 ? 7 : g.max <= 14 ? 14 : g.max <= 21 ? 21 : 30 })).sort((a, b) => b.count - a.count || a.window - b.window).slice(0, 6);
  });
  protected readonly dueGroup = computed(() => {
    const id = this.dueOpen();
    if (!id) return null;
    const list = this.dueCerts().filter((c) => c.typeId === id).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const g = this.dueTop().find((x) => x.type.id === id);
    return { type: CT.get(id)!, list, window: g?.window ?? 30 };
  });
  protected dueIcon(id: string) {
    return DUE_ICON[id] ?? ['training-award', '#7c3aed'];
  }
  protected dueTone(w: number) {
    return w <= 14 ? 'red' : w <= 21 ? 'orange' : 'blue';
  }

  /* ---------- matrix ---------- */
  protected readonly cols = computed(() => {
    const q = this.skillQ().trim().toLowerCase();
    const gq = this.q().trim().toLowerCase();
    let list = this.store.skills().filter((s) => this.cat() === 'All Categories' || s.category === this.cat());
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    if (gq && this.store.skills().some((s) => s.name.toLowerCase().includes(gq)) && !this.store.emps().some((e) => this.empText(e).includes(gq)))
      list = list.filter((s) => s.name.toLowerCase().includes(gq));
    return list;
  });
  private empText(e: TEmp) {
    return `${e.name} ${e.role} ${e.id}`.toLowerCase();
  }
  protected levelMatch(l: number | null) {
    const t = this.topLevel();
    if (t === 'All Levels') return true;
    if (l === null) return false;
    return t.startsWith('Proficient') ? l >= 4 : t.startsWith('Intermediate') ? l === 3 : t.startsWith('Basic') ? l === 1 || l === 2 : l === 0 || l === 1;
  }
  private readonly filtered = computed(() => {
    const gq = this.q().trim().toLowerCase();
    const searchRows = gq && this.store.emps().some((e) => this.empText(e).includes(gq));
    const cols = this.cols();
    return this.store.emps().filter((e) => {
      if (this.dept() !== 'All Departments' && e.dept !== this.dept()) return false;
      if (this.role() !== 'All Roles' && e.role !== this.role()) return false;
      if (this.site() !== 'All Sites' && e.site !== this.site()) return false;
      if (this.empStatus() !== 'All' && e.status !== this.empStatus()) return false;
      if (searchRows && !this.empText(e).includes(gq)) return false;
      if (this.onlyGaps() && !cols.some((s) => { const l = e.levels[s.id]; return l !== null && l !== undefined && l < s.required; })) return false;
      if (this.onlyDue() && !e.due.length) return false;
      if (this.topLevel() !== 'All Levels' && !cols.some((s) => this.levelMatch(e.levels[s.id] ?? null))) return false;
      return true;
    });
  });
  protected readonly rows = computed(() => {
    const { key, dir } = this.sort();
    const list = [...this.filtered()];
    if (!key) return list;
    return list.sort((a, b) => {
      if (key === 'name' || key === 'role') return a[key].localeCompare(b[key]) * dir;
      return ((b.levels[key] ?? -1) - (a.levels[key] ?? -1)) * dir;
    });
  });
  protected readonly roleRows = computed(() => {
    const groups = new Map<string, TEmp[]>();
    for (const e of this.filtered()) groups.set(e.role, [...(groups.get(e.role) ?? []), e]);
    return [...groups.entries()].map(([role, list]) => {
      const avg: Record<string, number | null> = {};
      for (const s of this.cols()) {
        const v = list.map((e) => e.levels[s.id]).filter((x): x is number => x !== null && x !== undefined);
        avg[s.id] = v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
      }
      return { role, n: list.length, avg };
    });
  });
  protected readonly allPicked = computed(() => this.rows().length > 0 && this.rows().every((e) => this.picked().has(e.id)));
  protected readonly sel = computed(() => (this.selId() ? this.store.empById().get(this.selId()!) ?? null : null));
  protected readonly history = computed(() => this.store.log().filter((h) => h.empId === this.selId()));
  protected readonly moreCount = computed(() => (this.site() !== 'All Sites' ? 1 : 0) + (this.empStatus() !== 'All' ? 1 : 0) + (this.onlyGaps() ? 1 : 0) + (this.onlyDue() ? 1 : 0));

  // list view
  protected readonly listCols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'role', label: 'Role' },
    { key: 'dept', label: 'Department' },
    { key: 'skill', label: 'Skill' },
    { key: 'levelText', label: 'Level', kind: 'tag', tag: (r) => `tag ${r.tone === 'green' ? 'green' : r.tone === 'blue' ? 'blue' : r.tone === 'orange' ? 'amber' : r.tone === 'red' ? 'red' : 'grey'}` },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly listFilters = [
    { key: 'skill', label: 'Skill', options: SKILL_NAMES() },
    { key: 'status', label: 'Status', options: ['Valid', 'Due for Training', 'In Progress', 'Required', 'Not Applicable'] },
  ];
  protected readonly listRows = computed(() =>
    this.rows().flatMap((e, i) =>
      this.cols().map((s) => {
        const l = e.levels[s.id] ?? null;
        return { key: `${e.id}-${s.id}`, empId: e.id, name: e.name, initials: e.name.split(' ').map((p) => p[0]).join(''), avatar: ['#7c3aed', '#2563eb', '#0d9488', '#ca8a04', '#db2777'][i % 5], role: e.role, dept: e.dept, skill: s.name, levelText: l === null ? 'N/A' : `${l} - ${levelName(l)}`, tone: levelTone(l), status: this.store.status(e, s.id) };
      }),
    ),
  );
  // heatmap view
  protected readonly heatCols = computed(() => this.cols().map((s) => s.name.split(' ')[0]));
  protected readonly heatData = computed(() =>
    DEPTS.map((d, di) =>
      this.cols().map((s, si) => {
        const v = this.store.emps().filter((e) => e.dept === d).map((e) => e.levels[s.id]).filter((x): x is number => x !== null && x !== undefined);
        if (v.length) return Math.round((v.reduce((a, x) => a + x, 0) / v.length / 5) * 100);
        return 48 + ((di * 17 + si * 23) % 42);
      }),
    ),
  );

  protected tone(l: number | null) {
    return TONES[levelTone(l)];
  }
  protected roundL(a: number) {
    return Math.round(a);
  }
  protected stColor(s: string) {
    return s === 'Valid' ? '#16a34a' : s === 'Due for Training' ? '#ea580c' : s === 'In Progress' ? '#2563eb' : s === 'Required' ? '#dc2626' : '#6b7280';
  }
  protected enTag(s: string) {
    return s === 'Completed' ? 'tag green' : s === 'Overdue' ? 'tag red' : s === 'In Progress' ? 'tag blue' : s === 'Waitlisted' ? 'tag grey' : 'tag amber';
  }
  protected ctName(id: string) {
    return CT.get(id)?.name ?? id;
  }
  protected person(id: string) {
    return PERSON.get(id)!;
  }
  protected isEdit(emp: string, skill: string) {
    const c = this.editCell();
    return !!c && c.emp === emp && c.skill === skill;
  }

  /* ---------- actions ---------- */
  protected setTopDept(d: string) {
    this.topDept.set(d);
    if (this.matrixDepts.includes(d)) this.dept.set(d);
    else if (d === 'All Departments') this.dept.set('All Departments');
    else this.msg(`${d} has no matrix-tracked teams yet · overview cards filtered to ${d}`);
  }
  protected setTopRole(r: string) {
    this.topRole.set(r);
    this.role.set(r);
  }
  protected setTopCat(c: string) {
    this.topCat.set(c);
    this.cat.set(c === 'All Skill Categories' ? 'All Categories' : c);
  }
  protected clearMore() {
    this.site.set('All Sites');
    this.empStatus.set('All');
    this.onlyGaps.set(false);
    this.onlyDue.set(false);
  }
  protected clearAll() {
    this.clearMore();
    this.q.set('');
    this.skillQ.set('');
    this.topLevel.set('All Levels');
    this.setTopDept('All Departments');
    this.setTopRole('All Roles');
  }
  protected sortBy(key: string) {
    const s = this.sort();
    this.sort.set(s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: '', dir: 1 }) : { key, dir: 1 });
  }
  protected pick(id: string) {
    this.selId.set(id);
    this.editCell.set(null);
  }
  protected clearPicked() {
    this.picked.set(new Set());
  }
  protected togglePick(id: string) {
    const s = new Set(this.picked());
    s.has(id) ? s.delete(id) : s.add(id);
    this.picked.set(s);
  }
  protected toggleAll() {
    this.picked.set(this.allPicked() ? new Set() : new Set(this.rows().map((e) => e.id)));
  }
  protected bandClick(key: string) {
    const map: Record<string, string> = { Proficient: 'Proficient (4-5)', Intermediate: 'Intermediate (3)', Basic: 'Basic (1-2)', 'Not Trained': 'Not Trained' };
    this.topLevel.set(this.topLevel() === map[key] ? 'All Levels' : map[key]);
    this.view.set('matrix');
  }
  protected focusGap(g: Skill) {
    const on = this.focusSkill() === g.id;
    this.focusSkill.set(on ? null : g.id);
    if (!on) {
      if (this.cat() !== 'All Categories' && this.cat() !== g.category) this.cat.set(g.category);
      this.sort.set({ key: g.id, dir: -1 });
      this.view.set('matrix');
      this.viewBy.set('emp');
    }
  }
  protected setLevel(e: TEmp, s: Skill, l: number | null) {
    this.store.setLevel(e.id, s.id, l);
    this.editCell.set(null);
    this.msg(`${e.name} · ${s.name} set to ${l === null ? 'N/A' : `${l} - ${levelName(l)}`}`);
  }
  protected go(slug: string) {
    this.more.set(false);
    this.router.navigateByUrl(`${BASE}/${slug}`);
  }
  protected viewPlan(e: TEmp) {
    this.router.navigate([`${BASE}/training-plan-enrollment`], { queryParams: { emp: e.id } });
  }
  protected renew(id: string) {
    this.store.renew(id);
    this.msg('Certificate renewed');
  }

  // update skills modal
  protected readonly upd = signal<TEmp | null>(null);
  protected readonly note = signal('');
  protected openUpdate(e: TEmp) {
    this.note.set('');
    this.upd.set({ ...e, levels: { ...e.levels } });
  }
  protected setU(id: string, v: string) {
    this.upd.update((u) => (u ? { ...u, levels: { ...u.levels, [id]: v === 'na' ? null : +v } } : u));
  }
  protected saveUpdate() {
    const u = this.upd()!;
    const orig = this.store.empById().get(u.id)!;
    let n = 0;
    for (const s of this.cols()) {
      if (orig.levels[s.id] !== u.levels[s.id]) {
        this.store.setLevel(u.id, s.id, u.levels[s.id], this.note() ? `updated (${this.note()})` : 'updated');
        n++;
      }
    }
    this.upd.set(null);
    this.msg(n ? `${n} skill level${n > 1 ? 's' : ''} updated for ${u.name}` : 'No changes');
  }

  // add skill
  protected readonly ns = signal({ name: '', category: 'Safety' as Category, required: 3, courseId: 'C-106' });
  protected readonly err = signal('');
  protected openAddSkill() {
    this.err.set('');
    this.ns.set({ name: '', category: (this.cat() === 'All Categories' ? 'Safety' : this.cat()) as Category, required: 3, courseId: 'C-106' });
    this.addSkillOpen.set(true);
  }
  protected saveSkill() {
    const f = this.ns();
    if (!f.name.trim()) return this.err.set('Skill name is required.');
    if (this.store.skills().some((s) => s.name.toLowerCase() === f.name.trim().toLowerCase())) return this.err.set('A skill with this name already exists.');
    const icons: Record<string, [string, string]> = { Safety: ['shield-check', '#ef4444'], Technical: ['settings', '#7c3aed'], 'Soft Skills': ['message', '#2563eb'], Compliance: ['file-check', '#0f766e'] };
    const [icon, color] = icons[f.category];
    this.store.addSkill({ id: `sk-${Date.now()}`, name: f.name.trim(), category: f.category, icon, color, required: f.required, gap: 0, courseId: f.courseId });
    this.cat.set(f.category);
    this.addSkillOpen.set(false);
    this.msg(`"${f.name.trim()}" added to ${f.category} · ${this.store.skillsTracked()} skills tracked`);
  }

  // bulk / groups
  protected assign() {
    const n = this.store.enroll([...this.picked()], this.assignCourse(), isoIn(this.assignDue()));
    this.assignOpen.set(false);
    this.picked.set(new Set());
    this.msg(`${n} employee${n === 1 ? '' : 's'} enrolled in ${this.store.courseById().get(this.assignCourse())?.title}`);
  }
  protected remindGroup(list: { id: string }[]) {
    this.store.remind(list.map((c) => c.id));
    this.dueOpen.set(null);
    this.msg(`Reminder sent to ${list.length} employees and their managers`);
  }
  protected enrollGroup(courseId: string, list: { empId: string; expiry: string }[]) {
    const n = this.store.enroll(list.map((c) => c.empId), courseId, list[0]?.expiry ?? isoIn(30), 'Auto (Renewal)');
    this.dueOpen.set(null);
    this.msg(`${n} enrolments created in ${this.store.courseById().get(courseId)?.title}`);
  }

  // import / export
  protected importFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const lines = String(r.result).split(/\r?\n/).slice(1).filter((l) => l.trim());
      let n = 0;
      for (const l of lines) {
        const [id, skill, lvl] = l.split(',').map((x) => x.replace(/"/g, '').trim());
        const e = this.store.emps().find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
        const s = this.store.skills().find((x) => x.id === skill || x.name.toLowerCase() === (skill ?? '').toLowerCase());
        const v = lvl === 'N/A' || lvl === '-' ? null : Number(lvl);
        if (e && s && (v === null || (v >= 0 && v <= 5))) {
          this.store.setLevel(e.id, s.id, v, 'imported');
          n++;
        }
      }
      this.msg(n ? `${n} skill levels imported from ${file.name}` : `No valid rows in ${file.name} (expected: Employee ID, Skill, Level)`);
      input.value = '';
    };
    r.readAsText(file);
  }
  protected exportCsv(onlyPicked = false) {
    const cols = this.cols();
    const rows = onlyPicked ? this.rows().filter((e) => this.picked().has(e.id)) : this.rows();
    downloadCsv('skills-competency-matrix.csv', [
      ['Employee ID', 'Employee', 'Role', 'Department', 'Site', ...cols.map((s) => s.name)],
      ...rows.map((e) => [e.id, e.name, e.role, e.dept, e.site, ...cols.map((s) => e.levels[s.id] ?? 'N/A')]),
    ]);
    this.msg(`Exported ${rows.length} employees × ${cols.length} skills`);
  }
  protected print() {
    this.more.set(false);
    window.print();
  }
  protected reset() {
    this.more.set(false);
    this.store.reset();
    this.clearAll();
    this.dept.set('Operations');
    this.cat.set('Safety');
    this.selId.set('EMP-001');
    this.msg('Demo data reset');
  }
  protected msg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}

function SKILL_NAMES() {
  return ['First Aid', 'Fire Safety', 'Equipment Operation', 'Security Procedures', 'Emergency Response', 'Hazard Identification', 'Working at Height', 'Forklift Operation'];
}
function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
