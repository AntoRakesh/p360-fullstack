import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { certTag, enTag, TrnAvatar, TrnPage } from './training-ui';
import {
  addMonths, CATEGORIES, Cert, CERT_TYPES, certStatus, Course, CT, daysUntil, DEPTS, downloadCsv, Enrollment, EStatus, iso, LPath, MONTHS_12, Mode, PEOPLE, PERSON, Session,
} from './training.data';

const MODES: Mode[] = ['Classroom', 'E-learning', 'Blended', 'On-the-job'];

/* =====================================================================
   Shared "pick employees" modal used by catalog / paths
   ===================================================================== */
@Component({
  selector: 'app-trn-pick',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="close()"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); done()">
      <div class="modal-head"><h3>{{ title() }}</h3><button type="button" class="close-btn" (click)="close()">×</button></div>
      <div class="pk-bar">
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search name, ID, department..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <select class="select" [value]="dept()" (change)="dept.set($any($event.target).value)"><option>All Departments</option>@for (d of depts; track d) {<option>{{ d }}</option>}</select>
        <button type="button" class="btn-ghost sm" (click)="selectShown()">Select shown ({{ shown().length }})</button>
      </div>
      <ul class="pk">
        @for (p of shown(); track p.id) {
          <li><label><input type="checkbox" [checked]="sel().has(p.id)" (change)="toggle(p.id)" /><span class="dt-av" [style.background]="p.avatar">{{ p.initials }}</span><span><b>{{ p.name }}</b><small>{{ p.id }} · {{ p.role }} · {{ p.dept }}</small></span></label></li>
        }
      </ul>
      @if (withDue()) {
        <label class="pk-due">Due date<input class="input" type="date" [value]="due()" (change)="due.set($any($event.target).value)" /></label>
      }
      <div class="form-actions"><span class="muted">{{ sel().size }} selected</span><button type="button" class="btn-ghost" (click)="close()">Cancel</button><button class="btn-primary" type="submit" [disabled]="!sel().size">{{ cta() }}</button></div>
    </form>
  `,
  styles: `
    .pk-bar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; } .pk-bar .search-box { flex: 1; } .pk-bar input { width: 100%; }
    .pk { list-style: none; margin: 0; padding: 0; max-height: 46vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
    .pk li label { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid #f1f2f6; cursor: pointer; font-size: 12.5px; }
    .pk li label > span:last-child { display: flex; flex-direction: column; } .pk small { color: var(--muted); font-size: 11px; }
    .pk-due { display: flex; flex-direction: column; gap: 4px; font-size: 12px; margin-top: 10px; max-width: 220px; }
    .form-actions { align-items: center; } .form-actions .muted { margin-right: auto; font-size: 12px; }
  `,
})
export class TrnPick {
  readonly title = input('Select employees');
  readonly cta = input('Confirm');
  readonly withDue = input(true);
  readonly picked = output<{ ids: string[]; due: string }>();
  readonly closed = output<void>();
  protected readonly depts = DEPTS;
  protected readonly q = signal('');
  protected readonly dept = signal('All Departments');
  protected readonly sel = signal(new Set<string>());
  protected readonly due = signal(iso(30));
  protected readonly shown = computed(() => {
    const q = this.q().toLowerCase().trim();
    return PEOPLE.filter((p) => (this.dept() === 'All Departments' || p.dept === this.dept()) && (!q || `${p.name} ${p.id} ${p.dept} ${p.role}`.toLowerCase().includes(q))).slice(0, 60);
  });
  protected toggle(id: string) {
    const s = new Set(this.sel());
    s.has(id) ? s.delete(id) : s.add(id);
    this.sel.set(s);
  }
  protected selectShown() {
    this.sel.set(new Set([...this.sel(), ...this.shown().map((p) => p.id)]));
  }
  protected done() {
    this.picked.emit({ ids: [...this.sel()], due: this.due() });
  }
  protected close() {
    this.closed.emit();
  }
}

/* =====================================================================
   Training Catalog
   ===================================================================== */
@Component({
  selector: 'app-training-training-catalog',
  imports: [...UI, DataTable, TrnPick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Training Catalog" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Browse mandatory and development courses, upcoming sessions and enrol employees.">
      <button class="btn-primary" (click)="openForm()"><app-icon name="plus" [size]="16" />Add Course</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="training-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Courses in Catalog" [value]="store.courses().length" icon="training-book" color="#7c3aed" [sub]="mandatory() + ' mandatory'" />
      <app-kpi label="Active Enrolments" [value]="fmt(active())" icon="users" color="#3b82f6" change="9%" sub="vs. last month" />
      <app-kpi label="Upcoming Sessions" [value]="store.sessions().length" icon="calendar-days" color="#22c55e" sub="next 30 days" />
      <app-kpi label="Average Rating" [value]="avgRating()" icon="star" color="#f59e0b" sub="from 3,412 reviews" />
      <app-kpi label="E-learning Courses" [value]="elearn()" icon="w-laptop" color="#0891b2" [sub]="Math.round((elearn() / store.courses().length) * 100) + '% of catalog'" />
    </section>

    <section class="card">
      <div class="cat-bar">
        <div class="tabs">
          <button [class.on]="cat() === 'All'" (click)="cat.set('All')">All<span class="count">{{ store.courses().length }}</span></button>
          @for (c of cats; track c) {<button [class.on]="cat() === c" (click)="cat.set(c)">{{ c }}<span class="count">{{ countCat(c) }}</span></button>}
        </div>
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search courses, providers..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        <select class="select" [value]="mode()" (change)="mode.set($any($event.target).value)"><option>All Modes</option>@for (m of modes; track m) {<option>{{ m }}</option>}</select>
        <select class="select" [value]="sort()" (change)="sort.set($any($event.target).value)"><option>Most enrolled</option><option>Top rated</option><option>Shortest</option><option>Title A–Z</option></select>
        <label class="mand"><input type="checkbox" [checked]="onlyMand()" (change)="onlyMand.set(!onlyMand())" />Mandatory only</label>
        <div class="vt">
          <button [class.on]="view() === 'grid'" (click)="view.set('grid')"><app-icon name="training-matrix" [size]="14" />Cards</button>
          <button [class.on]="view() === 'list'" (click)="view.set('list')"><app-icon name="training-list" [size]="14" />Table</button>
        </div>
      </div>

      @if (view() === 'grid') {
        <div class="grid">
          @for (c of list(); track c.id) {
            <article class="course" (click)="openId.set(c.id)">
              <div class="band" [style.background]="c.color + '18'">
                <span class="ci" [style.background]="c.color"><app-icon [name]="c.icon" [size]="20" /></span>
                <div class="tags">@if (c.mandatory) {<span class="tag red">Mandatory</span>}<span class="tag">{{ c.mode }}</span></div>
              </div>
              <div class="cb">
                <small class="muted">{{ c.id }} · {{ c.category }}</small>
                <h4>{{ c.title }}</h4>
                <p class="prov">{{ c.provider }}</p>
                <div class="meta"><span><app-icon name="clock" [size]="13" />{{ c.hours }}h</span><span><app-icon name="training-target" [size]="13" />{{ c.level }}</span><span class="star">★ {{ c.rating }}</span></div>
                <div class="enr"><span>{{ enrolledOf(c.id) }} enrolled</span><span class="muted">{{ nextSession(c.id) }}</span></div>
                <div class="cta"><button class="btn-primary btn-sm" (click)="$event.stopPropagation(); enrollFor.set(c.id)">Enroll</button><button class="btn-ghost sm" (click)="$event.stopPropagation(); openId.set(c.id)">Details</button></div>
              </div>
            </article>
          } @empty {<p class="muted">No courses match your filters.</p>}
        </div>
      } @else {
        <app-data-table [rows]="tableRows()" [columns]="cols" [actions]="actions" (rowClick)="openId.set($event.id)" (action)="act($event.action, $event.row)" noun="courses" />
      }
    </section>

    @if (open(); as c) {
      <div class="g-overlay" (click)="openId.set(null)"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div class="dh"><span class="ci lg" [style.background]="c.color"><app-icon [name]="c.icon" [size]="24" /></span><div><h3>{{ c.title }}</h3><small class="muted">{{ c.id }} · {{ c.provider }}</small></div></div><button class="close-btn" (click)="openId.set(null)">×</button></div>
        <div class="tags">@if (c.mandatory) {<span class="tag red">Mandatory</span>}<span class="tag">{{ c.category }}</span><span class="tag blue">{{ c.mode }}</span><span class="tag grey">{{ c.level }}</span></div>
        <p class="desc">{{ c.desc }}</p>
        <dl class="facts">
          <dt>Duration</dt><dd>{{ c.hours }} hours</dd><dt>Builds skill</dt><dd>{{ store.skillById().get(c.skillId)?.name }} → level 3</dd>
          <dt>Certificate</dt><dd>{{ certOf(c.id) ?? 'Completion record only' }}</dd><dt>Cost / learner</dt><dd>{{ c.cost ? 'AED ' + fmt(c.cost) : 'Free (internal)' }}</dd>
          <dt>Rating</dt><dd>★ {{ c.rating }} / 5</dd><dt>Capacity</dt><dd>{{ c.capacity > 900 ? 'Unlimited' : c.capacity + ' per session' }}</dd>
        </dl>
        <div class="stats">
          @for (s of statsOf(c.id); track s.k) {<div><b>{{ s.v }}</b><small>{{ s.k }}</small></div>}
        </div>
        <h4>Upcoming Sessions</h4>
        <ul class="sess">
          @for (s of sessionsOf(c.id); track s.id) {
            <li><div class="dt"><b>{{ dayNum(s.date) }}</b><small>{{ mon(s.date) }}</small></div><div><b>{{ s.time }}</b><small>{{ s.location }} · {{ s.trainer }}</small><span class="seat"><i [style.width.%]="(s.booked / s.seats) * 100"></i></span><small>{{ s.booked }}/{{ s.seats }} seats</small></div>
              <button class="btn-ghost sm" [disabled]="s.booked >= s.seats" (click)="book(s)">{{ s.booked >= s.seats ? 'Full' : 'Book seat' }}</button></li>
          } @empty {<li class="muted">Self-paced e-learning — available anytime.</li>}
        </ul>
        <div class="form-actions">
          <button class="btn-ghost" (click)="openForm(c)"><app-icon name="training-pencil" [size]="15" />Edit</button>
          <button class="btn-ghost" (click)="go('training-plan-enrollment')">View enrolments</button>
          <button class="btn-primary" (click)="enrollFor.set(c.id)"><app-icon name="user-plus" [size]="15" />Enroll Employees</button>
        </div>
      </aside>
    }

    @if (enrollFor(); as cid) {
      <app-trn-pick [title]="'Enroll in ' + course(cid)?.title" cta="Enroll" (picked)="enrollDone($event.ids, $event.due)" (closed)="closeEnroll()" />
    }

    @if (form(); as f) {
      <div class="g-overlay" (click)="form.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); save()">
        <div class="modal-head"><h3>{{ f.id ? 'Edit ' + f.id : 'Add Course' }}</h3><button type="button" class="close-btn" (click)="form.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Course title *<input class="input" required [value]="f.title" (input)="set('title', $any($event.target).value)" /></label>
          <label>Category<select class="select" [value]="f.category" (change)="set('category', $any($event.target).value)">@for (c of cats; track c) {<option>{{ c }}</option>}</select></label>
          <label>Delivery mode<select class="select" [value]="f.mode" (change)="set('mode', $any($event.target).value)">@for (m of modes; track m) {<option>{{ m }}</option>}</select></label>
          <label>Duration (hours)<input class="input" type="number" min="1" [value]="f.hours" (input)="set('hours', +$any($event.target).value)" /></label>
          <label>Builds skill<select class="select" [value]="f.skillId" (change)="set('skillId', $any($event.target).value)">@for (s of store.skills(); track s.id) {<option [value]="s.id">{{ s.name }}</option>}</select></label>
          <label>Provider<input class="input" [value]="f.provider" (input)="set('provider', $any($event.target).value)" /></label>
          <label>Cost per learner (AED)<input class="input" type="number" min="0" [value]="f.cost" (input)="set('cost', +$any($event.target).value)" /></label>
          <label class="full">Description<input class="input" [value]="f.desc" (input)="set('desc', $any($event.target).value)" /></label>
          <label class="ck"><input type="checkbox" [checked]="f.mandatory" (change)="set('mandatory', !f.mandatory)" />Mandatory for assigned roles</label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button class="btn-primary" type="submit">Save Course</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .cat-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; } .cat-bar .search-box { flex: 1 1 180px; max-width: 260px; } .cat-bar .search-box input { width: 100%; }
    .mand { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
    .vt { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-left: auto; }
    .vt button { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border: 0; background: #fff; font-size: 12.5px; cursor: pointer; } .vt button + button { border-left: 1px solid var(--border); } .vt button.on { background: var(--primary); color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
    .course { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; cursor: pointer; background: #fff; display: flex; flex-direction: column; transition: box-shadow .15s, transform .15s; }
    .course:hover { box-shadow: 0 8px 22px rgba(20,20,60,.09); transform: translateY(-1px); }
    .band { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px; }
    .ci { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; color: #fff; flex-shrink: 0; } .ci.lg { width: 50px; height: 50px; }
    .tags { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
    .cb { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; } .cb small { font-size: 11px; }
    .cb h4 { margin: 0; font-size: 14px; line-height: 1.3; } .prov { margin: 0; font-size: 12px; color: #4b4f6b; }
    .meta { display: flex; gap: 12px; font-size: 11.5px; color: #4b4f6b; } .meta span { display: inline-flex; gap: 4px; align-items: center; } .star { color: #d97706; font-weight: 600; }
    .enr { display: flex; justify-content: space-between; font-size: 11.5px; margin-top: auto; padding-top: 6px; border-top: 1px dashed var(--border); }
    .cta { display: flex; gap: 8px; } .cta button { flex: 1; justify-content: center; }
    .dh { display: flex; gap: 12px; align-items: center; } .dh h3 { font-size: 17px; }
    .desc { font-size: 13px; color: #3b3f5c; line-height: 1.5; }
    .facts { display: grid; grid-template-columns: 130px 1fr; gap: 8px; font-size: 12.5px; margin: 0 0 14px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; } .stats div { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; } .stats b { font-size: 18px; } .stats small { font-size: 11px; color: var(--muted); }
    h4 { margin: 0 0 8px; font-size: 13.5px; }
    .sess { list-style: none; margin: 0; padding: 0; } .sess li { display: grid; grid-template-columns: 46px 1fr auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid #f0f1f6; font-size: 12.5px; }
    .sess li > div { display: flex; flex-direction: column; gap: 2px; } .sess small { color: var(--muted); font-size: 11px; }
    .dt { align-items: center; background: var(--primary-soft); color: var(--primary); border-radius: 8px; padding: 4px 0; } .dt b { font-size: 17px; }
    .seat { display: block; width: 160px; height: 5px; background: #eef0f6; border-radius: 4px; overflow: hidden; } .seat i { display: block; height: 100%; background: #22c55e; }
    .ck { flex-direction: row !important; align-items: center; gap: 6px; }
  `,
})
export class TrainingCatalog extends TrnPage {
  protected readonly Math = Math;
  protected readonly cats = CATEGORIES;
  protected readonly modes = MODES;
  protected readonly cat = signal<string>('All');
  protected readonly q = signal('');
  protected readonly mode = signal('All Modes');
  protected readonly sort = signal('Most enrolled');
  protected readonly onlyMand = signal(false);
  protected readonly view = signal<'grid' | 'list'>('grid');
  protected readonly openId = signal<string | null>(null);
  protected readonly enrollFor = signal<string | null>(null);
  protected readonly open = computed(() => (this.openId() ? this.course(this.openId()!) ?? null : null));

  private readonly enrollCount = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.store.enrollments()) if (e.status !== 'Completed') m.set(e.courseId, (m.get(e.courseId) ?? 0) + 1);
    return m;
  });
  protected readonly mandatory = computed(() => this.store.courses().filter((c) => c.mandatory).length);
  protected readonly elearn = computed(() => this.store.courses().filter((c) => c.mode === 'E-learning').length);
  protected readonly active = computed(() => this.store.enrollments().filter((e) => e.status !== 'Completed').length);
  protected readonly avgRating = computed(() => (this.store.courses().reduce((a, c) => a + c.rating, 0) / this.store.courses().length).toFixed(1));
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase().trim();
    const l = this.store.courses().filter(
      (c) => (this.cat() === 'All' || c.category === this.cat()) && (this.mode() === 'All Modes' || c.mode === this.mode()) && (!this.onlyMand() || c.mandatory) && (!q || `${c.title} ${c.provider} ${c.id}`.toLowerCase().includes(q)),
    );
    const s = this.sort();
    return [...l].sort((a, b) => (s === 'Top rated' ? b.rating - a.rating : s === 'Shortest' ? a.hours - b.hours : s === 'Title A–Z' ? a.title.localeCompare(b.title) : this.enrolledOf(b.id) - this.enrolledOf(a.id)));
  });
  protected readonly cols: Col[] = [
    { key: 'title', label: 'Course', kind: 'icon' },
    { key: 'id', label: 'Code' },
    { key: 'category', label: 'Category' },
    { key: 'mode', label: 'Mode' },
    { key: 'hours', label: 'Hours', kind: 'num' },
    { key: 'enrolled', label: 'Enrolled', kind: 'num' },
    { key: 'rating', label: 'Rating', fmt: (v) => `★ ${v}` },
    { key: 'req', label: 'Requirement', kind: 'tag', tag: (r) => (r.mandatory ? 'tag red' : 'tag grey') },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View details', icon: 'eye' },
    { id: 'enroll', label: 'Enroll employees', icon: 'user-plus' },
    { id: 'edit', label: 'Edit', icon: 'training-pencil' },
  ];
  protected readonly tableRows = computed(() => this.list().map((c) => ({ ...c, enrolled: this.enrolledOf(c.id), req: c.mandatory ? 'Mandatory' : 'Optional' })));

  protected countCat(c: string) {
    return this.store.courses().filter((x) => x.category === c).length;
  }
  protected enrolledOf(id: string) {
    return this.enrollCount().get(id) ?? 0;
  }
  protected sessionsOf(id: string) {
    return this.store.sessions().filter((s) => s.courseId === id);
  }
  protected nextSession(id: string) {
    const s = this.sessionsOf(id)[0];
    return s ? `Next: ${this.fd(s.date).slice(0, 6)}` : 'Self-paced';
  }
  protected certOf(cid: string) {
    return CERT_TYPES.find((t) => t.courseId === cid)?.name;
  }
  protected statsOf(cid: string) {
    const l = this.store.enrollments().filter((e) => e.courseId === cid);
    const n = (s: EStatus) => l.filter((e) => e.status === s).length;
    return [{ k: 'Enrolled', v: n('Enrolled') }, { k: 'In progress', v: n('In Progress') }, { k: 'Completed', v: n('Completed') }, { k: 'Overdue', v: n('Overdue') }];
  }
  protected dayNum(d: string) {
    return d.slice(8);
  }
  protected mon(d: string) {
    return this.fd(d).slice(3, 6);
  }
  protected book(s: Session) {
    this.store.sessions.update((l) => l.map((x) => (x.id === s.id ? { ...x, booked: x.booked + 1 } : x)));
    this.msg(`Seat booked · ${this.fd(s.date)} ${s.time}`);
  }
  protected act(a: string, c: Course) {
    if (a === 'view') this.openId.set(c.id);
    else if (a === 'enroll') this.enrollFor.set(c.id);
    else this.openForm(c);
  }
  protected readonly enrollDone = (ids: string[], due: string) => {
    const cid = this.enrollFor()!;
    const n = this.store.enroll(ids, cid, due);
    this.enrollFor.set(null);
    this.msg(`${n} employee${n === 1 ? '' : 's'} enrolled in ${this.course(cid)?.title}${n < ids.length ? ` · ${ids.length - n} already enrolled` : ''}`);
  };
  protected readonly closeEnroll = () => this.enrollFor.set(null);

  protected readonly form = signal<Course | null>(null);
  protected readonly err = signal('');
  protected openForm(c?: Course) {
    this.err.set('');
    this.form.set(c ? { ...c } : { id: '', title: '', category: 'Safety', mode: 'Classroom', hours: 4, provider: 'People360 Academy', skillId: 'fa', mandatory: false, rating: 0, capacity: 20, color: '#7c3aed', icon: 'training-book', level: 'Beginner', cost: 0, desc: '' });
  }
  protected set<K extends keyof Course>(k: K, v: Course[K]) {
    this.form.update((f) => (f ? { ...f, [k]: v } : f));
  }
  protected save() {
    const f = this.form()!;
    if (!f.title.trim()) return this.err.set('Course title is required.');
    const sk = this.store.skillById().get(f.skillId);
    const c: Course = { ...f, color: sk?.color ?? f.color, icon: sk?.icon ?? f.icon, capacity: f.mode === 'E-learning' ? 999 : 20 };
    if (f.id) this.store.courses.update((l) => l.map((x) => (x.id === f.id ? c : x)));
    else {
      c.id = `C-${500 + this.store.courses().length}`;
      c.rating = 0;
      this.store.courses.update((l) => [c, ...l]);
    }
    this.form.set(null);
    this.msg(`${c.title} ${f.id ? 'updated' : 'added to the catalog'}`);
  }
  protected exportCsv() {
    downloadCsv('training-catalog.csv', [['Code', 'Title', 'Category', 'Mode', 'Hours', 'Provider', 'Mandatory', 'Rating', 'Active enrolments'], ...this.list().map((c) => [c.id, c.title, c.category, c.mode, c.hours, c.provider, c.mandatory ? 'Yes' : 'No', c.rating, this.enrolledOf(c.id)])]);
  }
}

/* =====================================================================
   Training Plan & Enrollment
   ===================================================================== */
@Component({
  selector: 'app-training-training-plan-enrollment',
  imports: [...UI, DataTable, TrnAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Training Plan & Enrollment" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Plan, assign and track training enrolments for individuals and teams.">
      <button class="btn-primary" (click)="openNew()"><app-icon name="plus" [size]="16" />New Enrollment</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="training-upload" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Active Enrolments" [value]="fmt(k().active)" icon="users" color="#7c3aed" change="9%" sub="vs. last month" />
      <app-kpi label="In Progress" [value]="k().prog" icon="activity" color="#3b82f6" [sub]="live() + ' learners online now'" subColor="#2563eb" />
      <app-kpi label="Completed (YTD)" [value]="fmt(k().done + 2840)" icon="training-check" color="#22c55e" change="14%" sub="vs. last year" />
      <app-kpi label="Overdue" [value]="k().over" icon="triangle-alert" color="#ef4444" change="6%" [up]="false" sub="vs. last month" />
      <app-kpi label="On-time Completion" [value]="k().rate + '%'" icon="training-target" color="#f59e0b" sub="last 90 days" />
    </section>

    @if (emp(); as p) {
      <section class="card plan">
        <div class="ph">
          @if (look(p.id); as l) {<app-trn-avatar [look]="l" [size]="48" />} @else {<span class="dt-av big" [style.background]="p.avatar">{{ p.initials }}</span>}
          <div><h3>Training Plan · {{ p.name }}</h3><small class="muted">{{ p.id }} · {{ p.role }} · {{ p.dept }} · {{ p.site }}</small></div>
          <div class="ph-act"><button class="btn-ghost sm" (click)="go('skills-competency-matrix')">Skills matrix</button><button class="btn-primary btn-sm" (click)="openNew(p.id)">Add to plan</button><button class="link" (click)="go('training-plan-enrollment')">Show all employees</button></div>
        </div>
        <div class="tl">
          @for (e of planOf(p.id); track e.id) {
            <div class="tli" [class]="'tli ' + e.status.replace(' ', '')">
              <i></i><b>{{ course(e.courseId)?.title }}</b><small>{{ e.status === 'Completed' ? 'Completed' : 'Due ' + fd(e.due) }} · {{ e.source }}</small>
              <span class="pgb"><em [style.width.%]="e.progress"></em></span><span [class]="enTag(e.status)">{{ e.status }} · {{ e.progress }}%</span>
            </div>
          } @empty {<p class="muted">No enrolments yet — use “Add to plan”.</p>}
        </div>
      </section>
    }

    <section class="lay">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['name', 'empId', 'courseTitle']" searchPlaceholder="Search employee or course..." noun="enrolments"
          (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" (rowClick)="go('training-plan-enrollment', { emp: $event.empId })" />
      </div>
      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Upcoming Sessions</h3><button class="link" (click)="go('training-catalog')">Catalog</button></div>
          <ul class="ses">
            @for (s of upcoming(); track s.id) {
              <li><div class="dd"><b>{{ s.date.slice(8) }}</b><small>{{ fd(s.date).slice(3, 6) }}</small></div>
                <div><b>{{ course(s.courseId)?.title }}</b><small>{{ s.time }} · {{ s.location }}</small><span class="seat"><i [style.width.%]="(s.booked / s.seats) * 100" [style.background]="s.booked >= s.seats ? '#ef4444' : '#22c55e'"></i></span></div>
                <button class="btn-ghost sm" (click)="openNew(emp()?.id, s.courseId, s.date)">Enroll</button></li>
            }
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><h3>Annual Plan vs Actual</h3><span class="muted">learners / month</span></div>
          <app-column-chart [labels]="months" [series]="planSeries" [height]="200" />
        </div>
      </div>
    </section>

    @if (nf(); as f) {
      <div class="g-overlay" (click)="nf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveNew()">
        <div class="modal-head"><h3>New Enrollment</h3><button type="button" class="close-btn" (click)="nf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee *<input class="input" list="trn-people" placeholder="Type a name or EMP ID" [value]="f.who" (input)="nf.set({ ...f, who: $any($event.target).value })" />
            <datalist id="trn-people">@for (p of people; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist></label>
          <label class="full">Course *<select class="select" [value]="f.courseId" (change)="nf.set({ ...f, courseId: $any($event.target).value })">@for (c of store.courses(); track c.id) {<option [value]="c.id">{{ c.id }} · {{ c.title }}</option>}</select></label>
          <label>Due date<input class="input" type="date" [value]="f.due" (change)="nf.set({ ...f, due: $any($event.target).value })" /></label>
          <label>Reason<select class="select" [value]="f.source" (change)="nf.set({ ...f, source: $any($event.target).value })"><option>Manager</option><option>Self</option><option>Compliance</option><option>Learning Path</option><option>Auto (Renewal)</option></select></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="nf.set(null)">Cancel</button><button class="btn-primary" type="submit">Enroll</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .lay { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; } .side { display: flex; flex-direction: column; gap: 12px; }
    .plan { margin-bottom: 12px; } .ph { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; } .ph h3 { font-size: 16px; } .ph-act { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    .dt-av.big { width: 48px; height: 48px; font-size: 16px; }
    .tl { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
    .tli { border: 1px solid var(--border); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
    .tli.Completed { border-left-color: #22c55e; } .tli.InProgress { border-left-color: #3b82f6; } .tli.Overdue { border-left-color: #ef4444; }
    .tli i { display: none; } .tli small { color: var(--muted); font-size: 11px; } .tli > span:last-child { align-self: flex-start; }
    .pgb { height: 5px; background: #eef0f6; border-radius: 4px; overflow: hidden; } .pgb em { display: block; height: 100%; background: var(--primary); }
    .ses { list-style: none; margin: 0; padding: 0; } .ses li { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; }
    .ses li > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .ses small { color: var(--muted); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ses b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dd { align-items: center; background: var(--primary-soft); color: var(--primary); border-radius: 8px; padding: 3px 0; } .dd b { font-size: 15px; }
    .seat { display: block; height: 4px; background: #eef0f6; border-radius: 4px; overflow: hidden; margin-top: 2px; } .seat i { display: block; height: 100%; }
    @media (max-width: 1250px) { .lay { grid-template-columns: 1fr; } }
  `,
})
export class TrainingPlanEnrollment extends TrnPage {
  protected readonly enTag = enTag;
  protected readonly months = MONTHS_12;
  protected readonly people = PEOPLE.slice(0, 400);
  private readonly qp = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly route = inject(ActivatedRoute);
  protected readonly empId = signal<string | null>(this.qp.get('emp'));
  protected readonly emp = computed(() => (this.empId() ? PERSON.get(this.empId()!) ?? null : null));
  constructor() {
    super();
    this.route.queryParamMap.subscribe((m) => this.empId.set(m.get('emp')));
  }
  protected look(id: string) {
    return this.store.empById().get(id)?.look ?? null;
  }
  protected planOf(id: string) {
    return this.store.enrollOf(id).sort((a, b) => a.due.localeCompare(b.due));
  }
  protected readonly live = computed(() => 37 + this.app.wobble('trn-live', 6));
  protected readonly k = computed(() => {
    const l = this.store.enrollments();
    const n = (s: EStatus) => l.filter((e) => e.status === s).length;
    const done = n('Completed');
    return { active: l.length - done, prog: n('In Progress'), done, over: n('Overdue'), rate: Math.round((done / (done + n('Overdue'))) * 100) };
  });
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'courseTitle', label: 'Course', sub: 'courseId' },
    { key: 'source', label: 'Assigned By' },
    { key: 'enrolled', label: 'Enrolled', fmt: (v) => this.fd(v) },
    { key: 'due', label: 'Due', fmt: (v) => this.fd(v) },
    { key: 'progress', label: 'Progress', kind: 'progress' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Enrolled', 'In Progress', 'Completed', 'Overdue', 'Waitlisted'] },
    { key: 'source', label: 'Assigned By', options: ['Manager', 'Self', 'Auto (Renewal)', 'Learning Path', 'Compliance'] },
    { key: 'category', label: 'Category', options: [...CATEGORIES] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'plan', label: 'Open training plan', icon: 'calendar-days' },
    { id: 'start', label: 'Mark in progress', icon: 'play', when: (r) => r.status === 'Enrolled' || r.status === 'Waitlisted' },
    { id: 'complete', label: 'Mark completed', icon: 'training-check', when: (r) => r.status !== 'Completed' },
    { id: 'remind', label: 'Send reminder', icon: 'training-send', when: (r) => r.status !== 'Completed' },
    { id: 'extend', label: 'Extend due date (+14 days)', icon: 'clock', when: (r) => r.status !== 'Completed' },
    { id: 'withdraw', label: 'Withdraw', icon: 'training-trash', danger: true, when: (r) => r.status !== 'Completed' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'remind', label: 'Send reminders' }, { id: 'complete', label: 'Mark completed' }, { id: 'export', label: 'Export' }];
  protected readonly rows = computed(() => {
    const id = this.empId();
    return this.store
      .enrollments()
      .filter((e) => !id || e.empId === id)
      .map((e) => {
        const p = this.person(e.empId);
        const c = this.course(e.courseId);
        return { ...e, name: p.name, initials: p.initials, avatar: p.avatar, courseTitle: c?.title ?? e.courseId, category: c?.category };
      });
  });
  protected readonly upcoming = computed(() => this.store.sessions().slice(0, 7));
  protected readonly planSeries = [
    { name: 'Planned', color: '#c4b5fd', values: [210, 260, 280, 300, 270, 290, 230, 210, 260, 310, 330, 300] },
    { name: 'Completed', color: '#7c3aed', values: [198, 244, 271, 287, 251, 279, 214, 188, 247, 301, 322, 128] },
  ];

  protected act(a: string, r: Enrollment) {
    if (a === 'plan') return this.go('training-plan-enrollment', { emp: r.empId });
    if (a === 'start') this.store.patchEnroll(r.id, { status: 'In Progress', progress: Math.max(r.progress, 5) });
    if (a === 'complete') this.store.completeEnroll(r.id);
    if (a === 'extend') this.store.patchEnroll(r.id, { due: iso(Math.max(daysUntil(r.due), 0) + 14), status: r.status === 'Overdue' ? 'In Progress' : r.status });
    if (a === 'withdraw') this.store.enrollments.update((l) => l.filter((e) => e.id !== r.id));
    const p = this.person(r.empId).name;
    this.msg(a === 'remind' ? `Reminder sent to ${p}` : a === 'complete' ? `${p} completed ${this.course(r.courseId)?.title} · certificate & skill updated` : a === 'extend' ? `Due date extended for ${p}` : a === 'withdraw' ? `${p} withdrawn` : `${p} started`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return downloadCsv('enrolments.csv', [['ID', 'Employee', 'Course', 'Status', 'Due'], ...this.rows().filter((r) => ids.includes(r.id)).map((r) => [r.id, r.name, r.courseTitle, r.status, r.due])]);
    if (a === 'complete') ids.forEach((id) => this.store.completeEnroll(id));
    this.msg(a === 'complete' ? `${ids.length} enrolments marked completed` : `Reminders sent to ${ids.length} learners`);
  }
  protected readonly nf = signal<{ who: string; courseId: string; due: string; source: Enrollment['source'] } | null>(null);
  protected readonly err = signal('');
  protected openNew(empId?: string, courseId = 'C-101', date?: string) {
    this.err.set('');
    const p = empId ? PERSON.get(empId) : null;
    this.nf.set({ who: p ? `${p.id} · ${p.name}` : '', courseId, due: date ?? iso(30), source: 'Manager' });
  }
  protected saveNew() {
    const f = this.nf()!;
    const id = f.who.split('·')[0].trim();
    const p = PERSON.get(id) ?? PEOPLE.find((x) => x.name.toLowerCase() === f.who.trim().toLowerCase());
    if (!p) return this.err.set('Pick an employee from the list.');
    const n = this.store.enroll([p.id], f.courseId, f.due, f.source);
    if (!n) return this.err.set(`${p.name} is already enrolled in this course.`);
    this.nf.set(null);
    this.msg(`${p.name} enrolled in ${this.course(f.courseId)?.title}`);
  }
  protected exportCsv() {
    downloadCsv('training-enrolments.csv', [['ID', 'Employee ID', 'Employee', 'Course', 'Status', 'Progress %', 'Enrolled', 'Due', 'Assigned By'], ...this.rows().map((r) => [r.id, r.empId, r.name, r.courseTitle, r.status, r.progress, r.enrolled, r.due, r.source])]);
  }
}

/* =====================================================================
   Learning Paths
   ===================================================================== */
@Component({
  selector: 'app-training-learning-paths',
  imports: [...UI, TrnPick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Learning Paths" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Structured sequences of courses for onboarding, certification and career progression.">
      <button class="btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" />Create Path</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Learning Paths" [value]="store.paths().length" icon="workflow" color="#7c3aed" [sub]="mandCount() + ' mandatory'" />
      <app-kpi label="Learners Assigned" [value]="totals().learners" icon="users" color="#3b82f6" change="11%" sub="vs. last month" />
      <app-kpi label="Completed Paths" [value]="totals().done" icon="training-award" color="#22c55e" sub="all steps finished" />
      <app-kpi label="Avg. Completion" [value]="totals().avg + '%'" icon="training-target" color="#f59e0b" sub="across all paths" />
      <app-kpi label="Learning Hours" [value]="fmt(totals().hours)" icon="clock" color="#0891b2" sub="planned in active paths" />
    </section>

    <section class="lp">
      <div class="card plist">
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search paths..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
        @for (p of filtered(); track p.id) {
          <button class="pc" [class.on]="selId() === p.id" (click)="selId.set(p.id)">
            <span class="pi" [style.background]="p.color"><app-icon [name]="p.icon" [size]="18" /></span>
            <div><b>{{ p.name }}</b><small>{{ p.steps.length }} courses · {{ p.learners.length }} learners</small>
              <span class="bar"><i [style.width.%]="pct(p)" [style.background]="p.color"></i></span></div>
            <em>{{ pct(p) }}%</em>
          </button>
        }
      </div>

      @if (sel(); as p) {
        <div class="card pd">
          <div class="pdh">
            <span class="pi lg" [style.background]="p.color"><app-icon [name]="p.icon" [size]="24" /></span>
            <div><h3>{{ p.name }}</h3><small class="muted">{{ p.audience }} · Owner: {{ p.owner }} · {{ hoursOf(p) }} h total</small></div>
            @if (p.mandatory) {<span class="tag red">Mandatory</span>} @else {<span class="tag grey">Optional</span>}
            <div class="pact">
              <button class="btn-ghost sm" (click)="toggleMand(p)">{{ p.mandatory ? 'Make optional' : 'Make mandatory' }}</button>
              <button class="btn-ghost sm" (click)="duplicate(p)">Duplicate</button>
              <button class="btn-primary btn-sm" (click)="assignOpen.set(true)"><app-icon name="user-plus" [size]="14" />Assign Learners</button>
            </div>
          </div>

          <h4>Path Steps</h4>
          <div class="steps">
            @for (cid of p.steps; track cid + $index; let i = $index; let last = $last) {
              @let c = course(cid);
              <div class="step">
                <span class="num" [style.background]="p.color">{{ i + 1 }}</span>
                <div class="sc">
                  <span class="si" [style.color]="c?.color"><app-icon [name]="c?.icon ?? 'training-book'" [size]="18" /></span>
                  <b>{{ c?.title }}</b>
                  <small>{{ c?.mode }} · {{ c?.hours }}h</small>
                  <span class="reach">{{ reached(p, i) }} / {{ p.learners.length }} completed</span>
                  <div class="sctl">
                    <button title="Move earlier" [disabled]="i === 0" (click)="move(p, i, -1)"><app-icon name="chevron-left" [size]="13" /></button>
                    <button title="Move later" [disabled]="last" (click)="move(p, i, 1)"><app-icon name="chevron-right" [size]="13" /></button>
                    <button title="Remove step" (click)="removeStep(p, i)"><app-icon name="training-x" [size]="13" /></button>
                  </div>
                </div>
              </div>
              @if (!last) {<span class="arrow"><app-icon name="chevron-right" [size]="18" /></span>}
            }
            <div class="add-step">
              <select class="select" [value]="addCourse()" (change)="addCourse.set($any($event.target).value)">@for (c of store.courses(); track c.id) {<option [value]="c.id">{{ c.title }}</option>}</select>
              <button class="btn-ghost sm" (click)="addStep(p)"><app-icon name="plus" [size]="14" />Add step</button>
            </div>
          </div>

          <div class="two">
            <div>
              <div class="card-head"><h4>Learners ({{ p.learners.length }})</h4>
                <select class="select sm" [value]="lf()" (change)="lf.set($any($event.target).value)"><option>All</option><option>Completed</option><option>In progress</option><option>Not started</option></select></div>
              <div class="lt">
                <table class="table">
                  <thead><tr><th>Learner</th><th>Progress</th><th>Current step</th><th></th></tr></thead>
                  <tbody>
                    @for (l of learnerRows(p); track l.empId) {
                      @let pe = person(l.empId);
                      <tr>
                        <td><div class="dt-person"><span class="dt-av" [style.background]="pe.avatar">{{ pe.initials }}</span><div><b>{{ pe.name }}</b><small>{{ pe.dept }}</small></div></div></td>
                        <td><span class="mini-progress"><i [style.width.%]="(l.done / p.steps.length) * 100" [style.background]="p.color"></i></span> {{ l.done }}/{{ p.steps.length }}</td>
                        <td>@if (l.done >= p.steps.length) {<span class="tag green">Completed</span>} @else {<span class="cur">{{ course(p.steps[l.done])?.title }}</span>}</td>
                        <td class="ra">
                          @if (l.done < p.steps.length) {<button class="btn-ghost sm" (click)="advance(p, l.empId)" title="Mark current step complete">Complete</button>}
                          <button class="icon-x" title="Remove from path" (click)="removeLearner(p, l.empId)"><app-icon name="training-x" [size]="13" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4>Completion Funnel</h4>
              <app-bar-list [rows]="funnel(p)" [max]="p.learners.length || 1" />
            </div>
          </div>
        </div>
      }
    </section>

    @if (assignOpen()) {
      <app-trn-pick [title]="'Assign learners · ' + sel()?.name" cta="Assign" [withDue]="false" (picked)="assignDone($event.ids)" (closed)="closeAssign()" />
    }
    @if (cf(); as f) {
      <div class="g-overlay" (click)="cf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); create()">
        <div class="modal-head"><h3>Create Learning Path</h3><button type="button" class="close-btn" (click)="cf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Path name *<input class="input" [value]="f.name" (input)="cf.set({ ...f, name: $any($event.target).value })" placeholder="e.g. Warehouse Supervisor Readiness" /></label>
          <label class="full">Audience<input class="input" [value]="f.audience" (input)="cf.set({ ...f, audience: $any($event.target).value })" /></label>
          <label class="ck"><input type="checkbox" [checked]="f.mandatory" (change)="cf.set({ ...f, mandatory: !f.mandatory })" />Mandatory</label>
        </div>
        <h4 class="mt">Courses (in order of selection)</h4>
        <div class="cpick">
          @for (c of store.courses(); track c.id) {
            <label [class.on]="f.steps.includes(c.id)"><input type="checkbox" [checked]="f.steps.includes(c.id)" (change)="toggleStep(c.id)" />
              @if (f.steps.includes(c.id)) {<em>{{ f.steps.indexOf(c.id) + 1 }}</em>}{{ c.title }}<small>{{ c.hours }}h</small></label>
          }
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cf.set(null)">Cancel</button><button class="btn-primary" type="submit">Create Path</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .lp { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 12px; align-items: start; }
    .plist { display: flex; flex-direction: column; gap: 8px; } .plist .search-box input { width: 100%; }
    .pc { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; text-align: left; cursor: pointer; font: inherit; }
    .pc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .pc div { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .pc b { font-size: 12.5px; } .pc small { font-size: 11px; color: var(--muted); } .pc em { font-style: normal; font-weight: 700; font-size: 12.5px; }
    .bar { height: 5px; background: #eef0f6; border-radius: 4px; overflow: hidden; } .bar i { display: block; height: 100%; }
    .pi { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: #fff; } .pi.lg { width: 50px; height: 50px; }
    .pdh { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; } .pdh h3 { font-size: 17px; } .pact { margin-left: auto; display: flex; gap: 8px; }
    h4 { margin: 16px 0 10px; font-size: 13.5px; }
    .steps { display: flex; align-items: stretch; gap: 6px; overflow-x: auto; padding: 4px 2px 8px; }
    .step { position: relative; flex: 0 0 168px; } .num { position: absolute; top: -8px; left: -6px; width: 22px; height: 22px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 700; z-index: 1; }
    .sc { height: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 12px 10px 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; background: #fbfbfe; }
    .sc b { line-height: 1.25; } .sc small { color: var(--muted); font-size: 11px; } .reach { font-size: 11px; color: #15803d; margin-top: auto; }
    .sctl { display: flex; gap: 4px; } .sctl button { border: 1px solid var(--border); background: #fff; border-radius: 5px; padding: 3px 5px; cursor: pointer; line-height: 0; } .sctl button:disabled { opacity: .35; cursor: default; }
    .arrow { align-self: center; color: #a1a5c0; }
    .add-step { flex: 0 0 190px; border: 1.5px dashed #c4b5fd; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; justify-content: center; } .add-step .select { width: 100%; }
    .two { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); gap: 16px; } .two h4 { margin: 0; }
    .lt { max-height: 360px; overflow: auto; } .cur { font-size: 12px; color: #3b3f5c; display: inline-block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; } .lt .table td { padding-left: 6px; padding-right: 6px; } .ra { white-space: nowrap; text-align: right; }
    .icon-x { border: 0; background: none; cursor: pointer; color: #9ca3af; padding: 4px; } .icon-x:hover { color: var(--red); }
    .select.sm { padding: 4px 26px 4px 8px; font-size: 12px; }
    .mt { margin-top: 14px; } .ck { flex-direction: row !important; align-items: center; gap: 6px; }
    .cpick { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 260px; overflow: auto; }
    .cpick label { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 7px; cursor: pointer; } .cpick label.on { border-color: var(--primary); background: #faf7ff; }
    .cpick em { font-style: normal; background: var(--primary); color: #fff; border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; font-size: 10px; flex-shrink: 0; } .cpick small { margin-left: auto; color: var(--muted); }
    @media (max-width: 1200px) { .lp { grid-template-columns: 1fr; } .two { grid-template-columns: 1fr; } }
  `,
})
export class LearningPaths extends TrnPage {
  protected readonly q = signal('');
  protected readonly selId = signal('LP-01');
  protected readonly lf = signal('All');
  protected readonly addCourse = signal('C-105');
  protected readonly assignOpen = signal(false);
  protected readonly filtered = computed(() => this.store.paths().filter((p) => p.name.toLowerCase().includes(this.q().toLowerCase())));
  protected readonly sel = computed(() => this.store.paths().find((p) => p.id === this.selId()) ?? null);
  protected readonly mandCount = computed(() => this.store.paths().filter((p) => p.mandatory).length);
  protected readonly totals = computed(() => {
    const ps = this.store.paths();
    const learners = ps.reduce((a, p) => a + p.learners.length, 0);
    const done = ps.reduce((a, p) => a + p.learners.filter((l) => l.done >= p.steps.length).length, 0);
    const avg = Math.round(ps.reduce((a, p) => a + this.pct(p), 0) / (ps.length || 1));
    const hours = ps.reduce((a, p) => a + this.hoursOf(p) * p.learners.length, 0);
    return { learners, done, avg, hours };
  });
  protected pct(p: LPath) {
    const tot = p.learners.length * p.steps.length;
    return tot ? Math.round((p.learners.reduce((a, l) => a + Math.min(l.done, p.steps.length), 0) / tot) * 100) : 0;
  }
  protected hoursOf(p: LPath) {
    return p.steps.reduce((a, c) => a + (this.course(c)?.hours ?? 0), 0);
  }
  protected reached(p: LPath, i: number) {
    return p.learners.filter((l) => l.done > i).length;
  }
  protected funnel(p: LPath) {
    return [{ label: 'Assigned', value: p.learners.length, color: '#a78bfa' }, ...p.steps.map((c, i) => ({ label: `${i + 1}. ${this.course(c)?.title ?? c}`, value: this.reached(p, i), color: p.color }))];
  }
  protected learnerRows(p: LPath) {
    const f = this.lf();
    return p.learners.filter((l) => f === 'All' || (f === 'Completed' ? l.done >= p.steps.length : f === 'Not started' ? l.done === 0 : l.done > 0 && l.done < p.steps.length));
  }
  private patch(id: string, fn: (p: LPath) => LPath) {
    this.store.paths.update((l) => l.map((p) => (p.id === id ? fn(p) : p)));
  }
  protected move(p: LPath, i: number, d: number) {
    this.patch(p.id, (x) => {
      const s = [...x.steps];
      [s[i], s[i + d]] = [s[i + d], s[i]];
      return { ...x, steps: s };
    });
  }
  protected removeStep(p: LPath, i: number) {
    if (p.steps.length <= 1) return this.msg('A path needs at least one step');
    const t = this.course(p.steps[i])?.title;
    this.patch(p.id, (x) => ({ ...x, steps: x.steps.filter((_, k) => k !== i), learners: x.learners.map((l) => ({ ...l, done: Math.min(l.done, x.steps.length - 1) })) }));
    this.msg(`Removed “${t}” from ${p.name}`);
  }
  protected addStep(p: LPath) {
    if (p.steps.includes(this.addCourse())) return this.msg('That course is already in this path');
    this.patch(p.id, (x) => ({ ...x, steps: [...x.steps, this.addCourse()] }));
    this.msg(`Added “${this.course(this.addCourse())?.title}” as step ${p.steps.length + 1}`);
  }
  protected advance(p: LPath, empId: string) {
    const l = p.learners.find((x) => x.empId === empId)!;
    const cid = p.steps[l.done];
    this.patch(p.id, (x) => ({ ...x, learners: x.learners.map((y) => (y.empId === empId ? { ...y, done: y.done + 1 } : y)) }));
    const c = this.course(cid);
    if (c && this.store.empById().has(empId) && (this.store.empById().get(empId)!.levels[c.skillId] ?? 0) < 3) this.store.setLevel(empId, c.skillId, 3, 'raised by learning path');
    this.msg(`${this.person(empId).name} completed “${c?.title}”${l.done + 1 >= p.steps.length ? ' · path completed 🎉' : ''}`);
  }
  protected removeLearner(p: LPath, empId: string) {
    this.patch(p.id, (x) => ({ ...x, learners: x.learners.filter((l) => l.empId !== empId) }));
    this.msg(`${this.person(empId).name} removed from ${p.name}`);
  }
  protected toggleMand(p: LPath) {
    this.patch(p.id, (x) => ({ ...x, mandatory: !x.mandatory }));
    this.msg(`${p.name} is now ${p.mandatory ? 'optional' : 'mandatory'}`);
  }
  protected duplicate(p: LPath) {
    const id = `LP-${String(this.store.paths().length + 1).padStart(2, '0')}`;
    this.store.paths.update((l) => [...l, { ...p, id, name: `${p.name} (copy)`, learners: [] }]);
    this.selId.set(id);
    this.msg('Path duplicated');
  }
  protected readonly assignDone = (ids: string[]) => {
    const p = this.sel()!;
    const have = new Set(p.learners.map((l) => l.empId));
    const add = ids.filter((i) => !have.has(i));
    this.patch(p.id, (x) => ({ ...x, learners: [...add.map((empId) => ({ empId, done: 0, started: iso(0) })), ...x.learners] }));
    this.store.enroll(add, p.steps[0], iso(30), 'Learning Path');
    this.assignOpen.set(false);
    this.msg(`${add.length} learner${add.length === 1 ? '' : 's'} assigned · enrolled in step 1 “${this.course(p.steps[0])?.title}”`);
  };
  protected readonly closeAssign = () => this.assignOpen.set(false);
  protected readonly cf = signal<{ name: string; audience: string; mandatory: boolean; steps: string[] } | null>(null);
  protected readonly err = signal('');
  protected openCreate() {
    this.err.set('');
    this.cf.set({ name: '', audience: 'All employees', mandatory: false, steps: [] });
  }
  protected toggleStep(id: string) {
    this.cf.update((f) => (f ? { ...f, steps: f.steps.includes(id) ? f.steps.filter((x) => x !== id) : [...f.steps, id] } : f));
  }
  protected create() {
    const f = this.cf()!;
    if (!f.name.trim()) return this.err.set('Path name is required.');
    if (!f.steps.length) return this.err.set('Select at least one course.');
    const id = `LP-${String(this.store.paths().length + 1).padStart(2, '0')}`;
    const colors = ['#7c3aed', '#0891b2', '#db2777', '#16a34a', '#ea580c'];
    this.store.paths.update((l) => [...l, { id, name: f.name.trim(), audience: f.audience, color: colors[l.length % colors.length], icon: 'workflow', steps: f.steps, learners: [], mandatory: f.mandatory, owner: 'Rex Kumar' }]);
    this.selId.set(id);
    this.cf.set(null);
    this.msg(`Learning path “${f.name.trim()}” created with ${f.steps.length} steps`);
  }
}

/* =====================================================================
   Certifications & Licenses
   ===================================================================== */
@Component({
  selector: 'app-training-certifications-licenses',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Certifications & Licenses" parent="Training, Skills & Compliance" [parentLink]="base" subtitle="Central register of employee certificates and operating licences with validity tracking.">
      <button class="btn-primary" (click)="openAdd()"><app-icon name="plus" [size]="16" />Add Certificate</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="training-upload" [size]="16" />Export Register</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Certificates on File" [value]="fmt(k().total)" icon="id-card" color="#7c3aed" [sub]="k().holders + ' employees covered'" />
      <app-kpi label="Valid" [value]="fmt(k().valid)" icon="shield-check" color="#22c55e" [sub]="Math.round((k().valid / k().total) * 100) + '% of register'" subColor="#16a34a" />
      <app-kpi label="Expiring ≤ 30 days" [value]="k().exp" icon="clock" color="#f59e0b" change="28%" sub="vs. last month" [good]="false" />
      <app-kpi label="Expired" [value]="k().expired" icon="triangle-alert" color="#ef4444" sub="action required" subColor="#dc2626" />
      <app-kpi label="Operating Licences" [value]="k().lic" icon="training-forklift" color="#3b82f6" sub="forklift · crane · security" />
    </section>

    <section class="cl" [class.with]="!!sel()">
      <div class="card">
        <div class="tabs st">
          @for (t of statusTabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}<span class="count">{{ tabCount(t) }}</span></button>}
        </div>
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['name', 'empId', 'cert', 'number']" searchPlaceholder="Search employee, certificate or number..." noun="certificates" [activeId]="selId()"
          [selectable]="true" [bulkActions]="bulk" (bulk)="bulkAct($event.action, $event.ids)" (rowClick)="selId.set($event.id)" (action)="act($event.action, $event.row)" />
      </div>
      @if (sel(); as c) {
        @let p = person(c.empId);
        @let t = ct(c.typeId);
        @let st = status(c);
        <aside class="card det">
          <div class="card-head"><h3>Certificate</h3><button class="close-btn" (click)="selId.set(null)">×</button></div>
          <div class="cert" [class.bad]="st !== 'Valid'">
            <div class="seal"><app-icon name="training-award" [size]="26" /></div>
            <small>{{ t.issuer }}</small>
            <h4>{{ t.name }}</h4>
            <span class="lbl">This certifies that</span>
            <b class="nm">{{ p.name }}</b>
            <span class="lbl">{{ p.id }} · {{ p.role }} · {{ p.dept }}</span>
            <div class="cd"><div><small>Issued</small><b>{{ fd(c.issued) }}</b></div><div><small>Expires</small><b>{{ fd(c.expiry) }}</b></div><div><small>No.</small><b>{{ c.number }}</b></div></div>
            <div class="qr">@for (b of qr(c.number); track $index) {<i [class.on]="b"></i>}</div>
            @if (st !== 'Valid') {<span class="stamp">{{ st }}</span>}
          </div>
          <div class="meta">
            <span [class]="certTag(st)">{{ st }}{{ st === 'Expiring' ? ' · ' + days(c.expiry) + ' days' : st === 'Expired' ? ' · ' + days(c.expiry) * -1 + ' days ago' : '' }}</span>
            <span [class]="c.verified ? 'tag green' : 'tag amber'">{{ c.verified ? 'Verified with issuer' : 'Not verified' }}</span>
            @if (t.licence) {<span class="tag blue">Licence</span>}
            @if (c.reminded) {<span class="tag grey">{{ c.reminded }} reminder(s) sent</span>}
          </div>
          <div class="acts">
            @if (!c.verified) {<button class="btn-ghost" (click)="verify(c)"><app-icon name="shield-check" [size]="15" />Verify</button>}
            <button class="btn-primary" (click)="renew(c)"><app-icon name="training-repeat" [size]="15" />Renew</button>
            <label class="btn-ghost"><app-icon name="training-upload" [size]="15" />Upload copy<input type="file" hidden (change)="upload($event, c)" /></label>
            <button class="btn-ghost" (click)="enrollRenewal(c)"><app-icon name="graduation-cap" [size]="15" />Book refresher</button>
            @if (st !== 'Revoked') {<button class="btn-ghost danger" (click)="revoke(c)"><app-icon name="ban" [size]="15" />Revoke</button>}
          </div>
          <h4>Other certificates · {{ p.name }}</h4>
          <ul class="oc">
            @for (o of others(c); track o.id) {<li (click)="selId.set(o.id)"><span>{{ ct(o.typeId).name }}</span><span [class]="certTag(status(o))">{{ status(o) }}</span></li>} @empty {<li class="muted">None</li>}
          </ul>
        </aside>
      } @else {
        <div class="side">
          <div class="card"><h3>Register by Status</h3><app-donut [segments]="donut()" center="Certificates" [size]="140" /></div>
          <div class="card"><h3>Expiring by Certificate (30 days)</h3><app-bar-list [rows]="byType()" [max]="byType()[0]?.value || 1" /></div>
        </div>
      }
    </section>

    @if (af(); as f) {
      <div class="g-overlay" (click)="af.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); add()">
        <div class="modal-head"><h3>Add Certificate</h3><button type="button" class="close-btn" (click)="af.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Employee *<input class="input" list="trn-people-c" placeholder="Type a name or EMP ID" [value]="f.who" (input)="af.set({ ...f, who: $any($event.target).value })" />
            <datalist id="trn-people-c">@for (p of people; track p.id) {<option [value]="p.id + ' · ' + p.name"></option>}</datalist></label>
          <label class="full">Certificate type<select class="select" [value]="f.typeId" (change)="af.set({ ...f, typeId: $any($event.target).value })">@for (t of types; track t.id) {<option [value]="t.id">{{ t.name }}</option>}</select></label>
          <label>Issue date<input class="input" type="date" [value]="f.issued" (change)="af.set({ ...f, issued: $any($event.target).value })" /></label>
          <label>Expiry (auto)<input class="input" disabled [value]="fd(expiryOf(f.typeId, f.issued))" /></label>
          <label class="full">Certificate number<input class="input" [value]="f.number" (input)="af.set({ ...f, number: $any($event.target).value })" placeholder="e.g. FA-55120" /></label>
        </div>
        @if (err()) {<p class="bad">{{ err() }}</p>}
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="af.set(null)">Cancel</button><button class="btn-primary" type="submit">Add to Register</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .cl { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 12px; } .side h3 { margin-bottom: 10px; }
    .tabs.st { margin-bottom: 12px; }
    .det { position: sticky; top: 76px; max-height: calc(100vh - 92px); overflow: auto; }
    .cert { position: relative; border: 2px solid #c4b5fd; outline: 4px double #ede9fe; outline-offset: -9px; border-radius: 10px; padding: 18px 16px 14px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 3px;
      background: radial-gradient(circle at 50% 0, #faf7ff, #fff 60%); overflow: hidden; }
    .cert.bad { border-color: #fca5a5; outline-color: #fee2e2; }
    .seal { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #fff; display: grid; place-items: center; box-shadow: 0 0 0 4px #fef3c7; margin-bottom: 4px; }
    .cert small { font-size: 10.5px; color: var(--muted); } .cert h4 { margin: 2px 0 4px; font-size: 15px; color: #4c1d95; }
    .lbl { font-size: 10.5px; color: #6b7090; } .nm { font-family: Georgia, serif; font-size: 19px; font-style: italic; color: #1e1b4b; }
    .cd { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 100%; margin-top: 8px; } .cd div { display: flex; flex-direction: column; } .cd b { font-size: 11.5px; }
    .qr { display: grid; grid-template-columns: repeat(8, 5px); gap: 1px; margin-top: 8px; } .qr i { width: 5px; height: 5px; background: #eef0f6; } .qr i.on { background: #1e1b4b; }
    .stamp { position: absolute; top: 26px; right: -30px; transform: rotate(35deg); background: #ef4444; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 34px; letter-spacing: 1px; text-transform: uppercase; }
    .meta { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; } .acts > * { padding: 7px 10px; } .acts label { cursor: pointer; } .danger { color: var(--red) !important; }
    h4 { margin: 16px 0 6px; font-size: 13px; }
    .oc { list-style: none; margin: 0; padding: 0; } .oc li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f1f6; font-size: 12px; cursor: pointer; } .oc li:hover { color: var(--primary); }
    @media (max-width: 1250px) { .cl { grid-template-columns: 1fr; } .det { position: static; max-height: none; } }
  `,
})
export class CertificationsLicenses extends TrnPage {
  protected readonly Math = Math;
  protected readonly certTag = certTag;
  protected readonly status = certStatus;
  protected readonly types = CERT_TYPES;
  protected readonly people = PEOPLE.slice(0, 400);
  protected readonly statusTabs = ['All', 'Valid', 'Expiring', 'Expired', 'Revoked'];
  protected readonly tab = signal('All');
  protected readonly selId = signal<string | null>(null);
  protected ct(id: string) {
    return CT.get(id)!;
  }
  protected readonly k = computed(() => {
    const l = this.store.certs().filter((c) => !c.revoked);
    let valid = 0, exp = 0, expired = 0, lic = 0;
    for (const c of l) {
      const s = certStatus(c);
      s === 'Valid' ? valid++ : s === 'Expiring' ? exp++ : expired++;
      if (CT.get(c.typeId)?.licence) lic++;
    }
    return { total: l.length, valid, exp, expired, lic, holders: new Set(l.map((c) => c.empId)).size };
  });
  protected tabCount(t: string) {
    const k = this.k();
    return t === 'All' ? this.store.certs().length : t === 'Valid' ? k.valid : t === 'Expiring' ? k.exp : t === 'Expired' ? k.expired : this.store.certs().filter((c) => c.revoked).length;
  }
  private readonly all = computed(() =>
    this.store.certs().map((c) => {
      const p = this.person(c.empId);
      const t = CT.get(c.typeId)!;
      return { ...c, name: p.name, initials: p.initials, avatar: p.avatar, dept: p.dept, cert: t.name, issuer: t.issuer, left: daysUntil(c.expiry), status: certStatus(c), kind: t.licence ? 'Licence' : 'Certificate' };
    }),
  );
  protected readonly rows = computed(() => {
    const t = this.tab();
    const l = t === 'All' ? this.all() : this.all().filter((r) => r.status === t);
    return [...l].sort((a, b) => a.left - b.left);
  });
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Employee', kind: 'person', sub: 'empId' },
    { key: 'cert', label: 'Certificate / Licence', sub: 'issuer' },
    { key: 'number', label: 'Number' },
    { key: 'issued', label: 'Issued', fmt: (v) => this.fd(v) },
    { key: 'expiry', label: 'Expiry', fmt: (v) => this.fd(v) },
    { key: 'left', label: 'Days Left', fmt: (v) => (v < 0 ? `${-v} overdue` : `${v}`) },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'cert', label: 'Certificate', options: CERT_TYPES.map((t) => t.name) },
    { key: 'dept', label: 'Department', options: DEPTS },
    { key: 'kind', label: 'Type', options: ['Certificate', 'Licence'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'view', label: 'View certificate', icon: 'eye' },
    { id: 'renew', label: 'Renew', icon: 'training-repeat' },
    { id: 'remind', label: 'Send reminder', icon: 'training-send', when: (r) => r.status !== 'Valid' },
    { id: 'verify', label: 'Verify with issuer', icon: 'shield-check', when: (r) => !r.verified },
    { id: 'revoke', label: 'Revoke', icon: 'ban', danger: true, when: (r) => r.status !== 'Revoked' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'remind', label: 'Send reminders' }, { id: 'renew', label: 'Renew' }, { id: 'export', label: 'Export' }];
  protected readonly sel = computed(() => (this.selId() ? this.store.certs().find((c) => c.id === this.selId()) ?? null : null));
  protected others(c: Cert) {
    return this.store.certsOf(c.empId).filter((o) => o.id !== c.id);
  }
  protected readonly donut = computed(() => [
    { label: 'Valid', value: this.k().valid, color: '#22c55e' },
    { label: 'Expiring', value: this.k().exp, color: '#f59e0b' },
    { label: 'Expired', value: this.k().expired, color: '#ef4444' },
  ]);
  protected readonly byType = computed(() => this.store.dueGroups().slice(0, 8).map((g) => ({ label: g.type.name, value: g.count, color: g.window <= 14 ? '#ef4444' : g.window <= 21 ? '#f59e0b' : '#3b82f6' })));
  protected qr(s: string) {
    let h = [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return Array.from({ length: 64 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      const corner = (i % 8 < 2 && i < 16) || (i % 8 > 5 && i < 16) || (i % 8 < 2 && i > 47);
      return corner || (h >> 16) % 2 === 1;
    });
  }
  protected act(a: string, r: Cert) {
    if (a === 'view') return this.selId.set(r.id);
    if (a === 'renew') return this.renew(r);
    if (a === 'verify') return this.verify(r);
    if (a === 'revoke') return this.revoke(r);
    this.store.remind([r.id]);
    this.msg(`Reminder sent to ${this.person(r.empId).name}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    if (a === 'export') return downloadCsv('certificates.csv', [['ID', 'Employee', 'Certificate', 'Number', 'Expiry', 'Status'], ...this.rows().filter((r) => ids.includes(r.id)).map((r) => [r.id, r.name, r.cert, r.number, r.expiry, r.status])]);
    if (a === 'renew') ids.forEach((id) => this.store.renew(id));
    else this.store.remind(ids);
    this.msg(a === 'renew' ? `${ids.length} certificates renewed` : `Reminders sent for ${ids.length} certificates`);
  }
  protected verify(c: Cert) {
    this.store.patchCert(c.id, { verified: true });
    this.msg(`${c.number} verified with ${this.ct(c.typeId).issuer}`);
  }
  protected renew(c: Cert) {
    this.store.renew(c.id);
    this.msg(`${this.ct(c.typeId).name} renewed for ${this.person(c.empId).name} · valid ${this.ct(c.typeId).months} months`);
  }
  protected revoke(c: Cert) {
    this.store.patchCert(c.id, { revoked: true });
    this.msg(`${c.number} revoked`);
  }
  protected upload(e: Event, c: Cert) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      this.store.patchCert(c.id, { verified: true });
      this.msg(`${f.name} attached to ${c.number}`);
    }
  }
  protected enrollRenewal(c: Cert) {
    const t = this.ct(c.typeId);
    const n = this.store.enroll([c.empId], t.courseId, c.expiry < iso(0) ? iso(14) : c.expiry, 'Auto (Renewal)');
    this.msg(n ? `${this.person(c.empId).name} booked on ${this.course(t.courseId)?.title}` : 'Already enrolled in the refresher');
  }
  protected readonly af = signal<{ who: string; typeId: string; issued: string; number: string } | null>(null);
  protected readonly err = signal('');
  protected expiryOf(typeId: string, issued: string) {
    return addMonths(issued, CT.get(typeId)!.months);
  }
  protected openAdd() {
    this.err.set('');
    this.af.set({ who: '', typeId: 'ct-fa', issued: iso(0), number: '' });
  }
  protected add() {
    const f = this.af()!;
    const p = PERSON.get(f.who.split('·')[0].trim());
    if (!p) return this.err.set('Pick an employee from the list.');
    const id = `CRT-${10001 + this.store.certs().length}`;
    const c: Cert = { id, empId: p.id, typeId: f.typeId, number: f.number || `${f.typeId.slice(3).toUpperCase()}-${30000 + this.store.certs().length}`, issued: f.issued, expiry: this.expiryOf(f.typeId, f.issued), verified: false };
    this.store.certs.update((l) => [c, ...l]);
    this.af.set(null);
    this.tab.set('All');
    this.selId.set(id);
    this.msg(`${CT.get(f.typeId)!.name} added for ${p.name}`);
  }
  protected exportCsv() {
    downloadCsv('certification-register.csv', [['ID', 'Employee ID', 'Employee', 'Department', 'Certificate', 'Issuer', 'Number', 'Issued', 'Expiry', 'Days Left', 'Status', 'Verified'], ...this.rows().map((r) => [r.id, r.empId, r.name, r.dept, r.cert, r.issuer, r.number, r.issued, r.expiry, r.left, r.status, r.verified ? 'Yes' : 'No'])]);
  }
}

