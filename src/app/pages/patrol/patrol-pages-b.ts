import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { CertBadge, GuardAvatar, PATROL_CSS, toastFn } from './patrol-ui';
import {
  Asset, ASSET_TYPES, AStatus, CERT_TYPES, certType, Course, fmtD, Guard, hash, PatrolSettingsModel, PatrolStore, Permit, PERMIT_TYPES, POSTS, SecCompany, SHIFTS, ShiftKey, SITE_NAMES,
} from './patrol.data';

const BASE = '/patrol-guard-management';
const PARENT = 'Patrol & Guard Management';

/* =====================================================================
   Training & Certifications
   ===================================================================== */
@Component({
  selector: 'app-training-certifications',
  imports: [...UI, GuardAvatar, CertBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Training &amp; Certifications" [parent]="parent" [parentLink]="base" subtitle="Track guard licences and mandatory certificates, renew expiring ones and schedule training sessions.">
      <button class="btn-primary" (click)="openCourse()"><app-icon name="plus" [size]="16" />Schedule Training</button>
      <button class="btn-ghost" (click)="remindAll()"><app-icon name="bell" [size]="16" />Remind All Expiring</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Compliance Rate" [value]="compliance() + '%'" icon="shield-check" color="var(--ka-22c55e)" change="1.2%" sub="guards fully certified" />
      <app-kpi label="Expiring (30 days)" [value]="store.counts().expiring" icon="clock" color="var(--ka-f97316)" change="12%" [good]="false" sub="vs. last month" />
      <app-kpi label="Expired" [value]="store.counts().expired" icon="triangle-alert" color="var(--ka-ef4444)" sub="guards blocked from posts" [subColor]="store.counts().expired ? 'var(--ka-dc2626)' : undefined" />
      <app-kpi label="Upcoming Sessions" [value]="store.courses().length" icon="graduation-cap" color="var(--ka-8b5cf6)" [sub]="enrolled() + ' guards enrolled'" />
      <app-kpi label="In Training Today" [value]="store.counts().training" icon="users" color="var(--ka-3b82f6)" sub="off the roster" />
    </section>
    <section class="two">
      <div class="card">
        <div class="card-head"><h3>Certification Matrix</h3><span class="muted">{{ store.guards().length }} guards</span></div>
        <table class="table mx">
          <thead><tr><th>Certificate</th><th>Required</th><th class="num">Valid</th><th class="num">Expiring</th><th class="num">Expired</th><th>Coverage</th></tr></thead>
          <tbody>
            @for (m of matrix(); track m.t.key) {
              <tr [class.on]="cert() === m.t.key" (click)="cert.set(cert() === m.t.key ? '' : m.t.key)">
                <td><span class="cn"><app-cert-badge [key]="m.t.key" [size]="20" />{{ m.t.name }}</span></td>
                <td>@if (m.t.mandatory) {<span class="tag red">Mandatory</span>} @else {<span class="tag grey">Optional</span>}</td>
                <td class="num good">{{ m.valid }}</td><td class="num warn-t">{{ m.exp }}</td><td class="num bad">{{ m.expired }}</td>
                <td><div class="stack"><i [style.width.%]="m.pv" style="background:var(--kb-22c55e)"></i><i [style.width.%]="m.pe" style="background:var(--kb-f59e0b)"></i><i [style.width.%]="m.px" style="background:var(--kb-ef4444)"></i></div><small>{{ m.cov }}% of guards</small></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Upcoming Training Sessions</h3></div>
        <div class="courses">
          @for (c of store.courses(); track c.id) {
            <div class="co">
              <app-cert-badge [key]="c.cert" [size]="30" />
              <div class="cb"><b>{{ c.name }}</b><small>{{ fd(c.date) }} · {{ c.time }} · {{ c.mode }}</small><small class="muted">{{ c.venue }} · {{ c.trainer }}</small>
                <div class="seat"><div class="mini-progress"><i [style.width.%]="(c.enrolled.length / c.seats) * 100"></i></div><span>{{ c.enrolled.length }}/{{ c.seats }} seats</span></div>
              </div>
              <button class="btn-ghost btn-sm" (click)="enrollFor.set(c)">Enroll</button>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-head">
        <h3>Certificates Needing Action @if (cert()) {<span class="chip-s">{{ ctName(cert()) }} <button class="x" (click)="cert.set('')">×</button></span>}</h3>
        <div class="toolbar">
          <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search guard..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <select class="select" [value]="st()" (change)="st.set($any($event.target).value)"><option value="">Expiring &amp; expired</option><option>Expiring Soon</option><option>Expired</option></select>
        </div>
      </div>
      <table class="table">
        <thead><tr><th>Guard</th><th>Company</th><th>Certificate</th><th>Number</th><th>Expiry</th><th>Status</th><th class="num">Actions</th></tr></thead>
        <tbody>
          @for (r of actionRows(); track r.g.id + r.c.key) {
            <tr>
              <td><span class="gx"><app-guard-avatar [g]="r.g" [size]="28" /><div><b>{{ r.g.name }}</b><small>{{ r.g.id }} · {{ r.g.location }}</small></div></span></td>
              <td>{{ r.g.company }}</td>
              <td><span class="cn"><app-cert-badge [key]="r.c.key" [size]="18" />{{ ctName(r.c.key) }}</span></td>
              <td class="muted">{{ r.c.no }}</td><td>{{ fd(r.c.expiry) }}</td>
              <td><span [class]="r.c.status === 'Expired' ? 'tag red' : 'tag amber'">{{ r.c.status }}</span></td>
              <td class="num acts">
                <button class="btn-primary btn-sm" (click)="renew(r.g, r.c.key)">Renew</button>
                <button class="btn-ghost btn-sm" (click)="book(r.g, r.c.key)">Book course</button>
                <button class="btn-ghost btn-sm" (click)="toastMsg('Reminder sent to ' + r.g.name)">Remind</button>
              </td>
            </tr>
          } @empty {<tr><td colspan="7" class="muted empty">All certificates are valid 🎉</td></tr>}
        </tbody>
      </table>
    </section>

    @if (enrollFor(); as c) {
      <div class="g-overlay" (click)="enrollFor.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Enroll guards · {{ c.name }}</h3><button class="close-btn" (click)="enrollFor.set(null)">×</button></div>
        <p class="muted">Suggested: guards whose {{ ctName(c.cert) }} is expiring, expired or missing.</p>
        <div class="el">
          @for (g of suggest(c); track g.id) {
            <label><input type="checkbox" [checked]="c.enrolled.includes(g.id)" (change)="toggleEnroll(c, g.id)" /><app-guard-avatar [g]="g" [size]="24" />{{ g.name }} <small class="muted">· {{ g.id }} · {{ certState(g, c.cert) }}</small></label>
          }
        </div>
        <div class="form-actions"><span class="muted">{{ liveCourse(c.id)?.enrolled?.length }}/{{ c.seats }} seats</span><button class="btn-primary" (click)="enrollFor.set(null); toastMsg('Enrollment saved · calendar invites sent')">Done</button></div>
      </div>
    }
    @if (cf(); as f) {
      <div class="g-overlay" (click)="cf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveCourse()">
        <div class="modal-head"><h3>Schedule training session</h3><button type="button" class="close-btn" (click)="cf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Session name *<input class="input" required [value]="f.name" (input)="cf.set({ ...f, name: $any($event.target).value })" /></label>
          <label>Certificate<select class="select" [value]="f.cert" (change)="cf.set({ ...f, cert: $any($event.target).value })">@for (t of types; track t.key) {<option [value]="t.key">{{ t.name }}</option>}</select></label>
          <label>Mode<select class="select" [value]="f.mode" (change)="cf.set({ ...f, mode: $any($event.target).value })"><option>Classroom</option><option>Online</option><option>Practical</option></select></label>
          <label>Date<input class="input" type="date" [value]="f.date" (change)="cf.set({ ...f, date: $any($event.target).value })" /></label>
          <label>Time<input class="input" type="time" [value]="f.time" (change)="cf.set({ ...f, time: $any($event.target).value })" /></label>
          <label>Venue<input class="input" [value]="f.venue" (input)="cf.set({ ...f, venue: $any($event.target).value })" /></label>
          <label>Seats<input class="input" type="number" [value]="f.seats" (input)="cf.set({ ...f, seats: +$any($event.target).value })" /></label>
          <label class="full">Trainer<input class="input" [value]="f.trainer" (input)="cf.set({ ...f, trainer: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="cf.set(null)">Cancel</button><button class="btn-primary" type="submit">Schedule</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .two { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-bottom: 12px; }
    .cn { display: inline-flex; align-items: center; gap: 8px; } .mx tr { cursor: pointer; } .mx tr.on td { background: var(--kb-f7f3ff); }
    .stack { display: flex; width: 120px; height: 7px; border-radius: 4px; overflow: hidden; background: var(--kb-eef0f5); } .stack i { display: block; height: 100%; } td small { font-size: 11px; color: var(--muted); }
    .courses { display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow: auto; }
    .co { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 8px; border: 1px solid var(--border); border-radius: 10px; }
    .cb { display: flex; flex-direction: column; font-size: 12.5px; } .cb small { font-size: 11.5px; } .seat { display: flex; gap: 8px; align-items: center; font-size: 11px; margin-top: 3px; } .seat .mini-progress { width: 120px; }
    .acts { white-space: nowrap; } .acts button { margin-left: 4px; } .empty { text-align: center; padding: 24px !important; }
    .chip-s .x { border: 0; background: none; cursor: pointer; }
    .el { display: flex; flex-direction: column; gap: 4px; max-height: 340px; overflow: auto; } .el label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 4px; border-bottom: 1px solid var(--kl-f0f1f6); }
    .form-actions { align-items: center; } .form-actions .muted { margin-right: auto; font-size: 12.5px; }
    @media (max-width: 1200px) { .two { grid-template-columns: 1fr; } }
  `,
})
export class GuardTraining {
  protected readonly store = inject(PatrolStore);
  protected readonly parent = PARENT;
  protected readonly base = BASE;
  protected readonly fd = fmtD;
  protected readonly types = CERT_TYPES;
  protected readonly q = signal('');
  protected readonly st = signal('');
  protected readonly cert = signal('');
  protected readonly enrollFor = signal<Course | null>(null);
  protected readonly cf = signal<Course | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));

  protected readonly compliance = computed(() => { const l = this.store.guards(); return ((l.filter((g) => g.certs.every((c) => c.status === 'Valid')).length / l.length) * 100).toFixed(1); });
  protected readonly enrolled = computed(() => this.store.courses().reduce((a, c) => a + c.enrolled.length, 0));
  protected readonly matrix = computed(() => {
    const gs = this.store.guards();
    return CERT_TYPES.map((t) => {
      let valid = 0, exp = 0, expired = 0;
      for (const g of gs) for (const c of g.certs) if (c.key === t.key) c.status === 'Valid' ? valid++ : c.status === 'Expired' ? expired++ : exp++;
      const n = valid + exp + expired || 1;
      return { t, valid, exp, expired, pv: (valid / n) * 100, pe: (exp / n) * 100, px: (expired / n) * 100, cov: Math.round((n / gs.length) * 100) };
    });
  });
  protected readonly actionRows = computed(() => {
    const q = this.q().toLowerCase();
    const out: { g: Guard; c: Guard['certs'][number] }[] = [];
    for (const g of this.store.guards()) for (const c of g.certs) if (c.status !== 'Valid' && (!this.st() || c.status === this.st()) && (!this.cert() || c.key === this.cert()) && (!q || g.name.toLowerCase().includes(q))) out.push({ g, c });
    return out.sort((a, b) => a.c.expiry.localeCompare(b.c.expiry));
  });

  protected ctName(k: string) {
    return certType(k).name;
  }
  protected certState(g: Guard, k: string) {
    return g.certs.find((c) => c.key === k)?.status ?? 'Missing';
  }
  protected liveCourse(id: string) {
    return this.store.courses().find((c) => c.id === id);
  }
  protected suggest(c: Course) {
    return this.store.guards().filter((g) => c.enrolled.includes(g.id) || this.certState(g, c.cert) !== 'Valid').slice(0, 40);
  }
  protected toggleEnroll(c: Course, id: string) {
    const cur = this.liveCourse(c.id)!;
    const has = cur.enrolled.includes(id);
    if (!has && cur.enrolled.length >= cur.seats) return this.toastMsg('Session is full');
    this.store.courses.update((l) => l.map((x) => (x.id === c.id ? { ...x, enrolled: has ? x.enrolled.filter((e) => e !== id) : [...x.enrolled, id] } : x)));
    this.enrollFor.set(this.liveCourse(c.id)!);
  }
  protected renew(g: Guard, k: string) {
    this.store.renewCert(g.id, k);
    this.toastMsg(`${this.ctName(k)} renewed for ${g.name} · Guard Directory updated`);
  }
  protected book(g: Guard, k: string) {
    const c = this.store.courses().find((x) => x.cert === k && x.enrolled.length < x.seats);
    if (!c) return this.toastMsg(`No open session for ${this.ctName(k)} — schedule one first`);
    if (!c.enrolled.includes(g.id)) this.store.courses.update((l) => l.map((x) => (x.id === c.id ? { ...x, enrolled: [...x.enrolled, g.id] } : x)));
    this.toastMsg(`${g.name} booked on ${c.name} (${fmtD(c.date)})`);
  }
  protected remindAll() {
    const n = new Set(this.actionRows().map((r) => r.g.id)).size;
    this.toastMsg(`Renewal reminders sent to ${n} guards and their companies`);
  }
  protected openCourse() {
    this.cf.set({ id: '', name: '', cert: 'firstaid', date: '2026-11-25', time: '09:00', venue: 'HO Training Room 1', trainer: '', seats: 20, enrolled: [], mode: 'Classroom' });
  }
  protected saveCourse() {
    const f = this.cf()!;
    if (!f.name.trim()) return;
    const id = `TR-${307 + this.store.courses().length - 6}`;
    this.store.courses.update((l) => [...l, { ...f, id }].sort((a, b) => a.date.localeCompare(b.date)));
    this.cf.set(null);
    this.toastMsg(`${f.name} scheduled on ${fmtD(f.date)}`);
  }
  protected exportCsv() {
    const rows: (string | number)[][] = [['Guard ID', 'Guard', 'Company', 'Certificate', 'Number', 'Issued', 'Expiry', 'Status']];
    for (const g of this.store.guards()) for (const c of g.certs) rows.push([g.id, g.name, g.company, this.ctName(c.key), c.no, c.issued, c.expiry, c.status]);
    downloadCsv('guard-certifications.csv', rows);
  }
}

/* =====================================================================
   Equipment & Assets
   ===================================================================== */
@Component({
  selector: 'app-equipment-assets',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Equipment &amp; Assets" [parent]="parent" [parentLink]="base" subtitle="Issue, track and maintain radios, body cameras, guard-tour wands, keys and patrol vehicles.">
      <button class="btn-primary" (click)="af.set({ type: types[0].type, count: 1, site: 'Head Office' })"><app-icon name="plus" [size]="16" />Add Asset</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Total Assets" [value]="store.assets().length" icon="box" color="var(--ka-8b5cf6)" [sub]="types.length + ' asset types'" />
      <app-kpi label="Issued" [value]="count('Issued')" icon="user-check" color="var(--ka-22c55e)" [sub]="pct('Issued') + '% utilisation'" />
      <app-kpi label="In Stock" [value]="count('In Stock')" icon="toolbox" color="var(--ka-3b82f6)" sub="ready to issue" />
      <app-kpi label="In Maintenance" [value]="count('Maintenance')" icon="refresh" color="var(--ka-f97316)" sub="at service partner" />
      <app-kpi label="Lost / Missing" [value]="count('Lost')" icon="triangle-alert" color="var(--ka-ef4444)" sub="incident raised" [subColor]="count('Lost') ? 'var(--ka-dc2626)' : undefined" />
    </section>
    <section class="tiles">
      @for (t of tiles(); track t.type) {
        <button class="card tile" [class.on]="type() === t.type" (click)="type.set(type() === t.type ? '' : t.type)">
          <span class="ti"><app-icon [name]="t.icon" [size]="20" /></span>
          <div><b>{{ t.type }}</b><small>{{ t.issued }} issued · {{ t.stock }} in stock</small><div class="mini-progress"><i [style.width.%]="(t.issued / t.total) * 100"></i></div></div>
          <em>{{ t.total }}</em>
        </button>
      }
    </section>
    <section class="two">
      <div class="card">
        <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" [searchKeys]="['id', 'type', 'model', 'serial', 'holder']" searchPlaceholder="Search asset ID, serial, holder..." noun="assets" (action)="act($event.action, $event.row)" (bulk)="bulkAct($event.action, $event.ids)" />
      </div>
      <aside class="card">
        <div class="card-head"><h3>Low Battery (issued)</h3><span class="tag red">{{ lowBat().length }}</span></div>
        <ul class="lb">@for (a of lowBat().slice(0, 10); track a.id) {<li><span><b>{{ a.id }}</b><small>{{ a.type }} · {{ holder(a) }}</small></span><span class="bt"><i [style.width.%]="a.battery"></i></span><b class="bad">{{ a.battery }}%</b></li>}</ul>
        @if (lowBat().length) {<button class="btn-ghost btn-sm" (click)="notifyLow()">Notify holders to swap batteries</button>}
        <div class="card-head mt"><h3>Due for Service</h3></div>
        <ul class="lb">@for (a of dueService(); track a.id) {<li><span><b>{{ a.id }}</b><small>{{ a.type }} · due {{ fd(a.service) }}</small></span><span></span><button class="link" (click)="act('maint', a)">Send</button></li>}</ul>
      </aside>
    </section>
    @if (issueFor(); as a) {
      <div class="g-overlay" (click)="issueFor.set(null)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Issue {{ a.type }} · {{ a.id }}</h3><button class="close-btn" (click)="issueFor.set(null)">×</button></div>
        <label class="search-box"><app-icon name="search" [size]="15" /><input placeholder="Search on-duty guard..." [value]="gq()" (input)="gq.set($any($event.target).value)" /></label>
        <div class="gl">@for (g of guardOpts(); track g.id) {<button class="dd-item" (click)="issue(a, g)">{{ g.name }} <small class="muted">· {{ g.id }} · {{ g.location }} · {{ g.status }}</small></button>}</div>
      </div>
    }
    @if (af(); as f) {
      <div class="g-overlay" (click)="af.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); addAssets()">
        <div class="modal-head"><h3>Add assets</h3><button type="button" class="close-btn" (click)="af.set(null)">×</button></div>
        <div class="form-grid">
          <label>Asset type<select class="select" [value]="f.type" (change)="af.set({ ...f, type: $any($event.target).value })">@for (t of types; track t.type) {<option [value]="t.type">{{ t.type }}</option>}</select></label>
          <label>Quantity<input class="input" type="number" min="1" max="50" [value]="f.count" (input)="af.set({ ...f, count: +$any($event.target).value })" /></label>
          <label>Store at site<select class="select" [value]="f.site" (change)="af.set({ ...f, site: $any($event.target).value })">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="af.set(null)">Cancel</button><button class="btn-primary" type="submit">Add to stock</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .tile { display: grid; grid-template-columns: 38px 1fr auto; gap: 10px; align-items: center; text-align: left; cursor: pointer; font: inherit; padding: 12px; }
    .tile.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); } .tile div { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; } .tile small { color: var(--muted); font-size: 11px; } .tile em { font-style: normal; font-weight: 700; font-size: 18px; }
    .ti { width: 38px; height: 38px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
    .lb { list-style: none; margin: 0 0 8px; padding: 0; } .lb li { display: grid; grid-template-columns: 1fr 60px 40px; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .lb span:first-child { display: flex; flex-direction: column; } .lb small { color: var(--muted); font-size: 11px; }
    .bt { height: 6px; background: var(--kb-eef0f5); border-radius: 3px; overflow: hidden; } .bt i { display: block; height: 100%; background: var(--kb-ef4444); }
    .mt { margin-top: 14px; } .gl { max-height: 360px; overflow: auto; margin-top: 8px; display: flex; flex-direction: column; } .g-modal .search-box { width: 100%; }
    @media (max-width: 1200px) { .two { grid-template-columns: 1fr; } }
  `,
})
export class GuardEquipment {
  protected readonly store = inject(PatrolStore);
  protected readonly parent = PARENT;
  protected readonly base = BASE;
  protected readonly fd = fmtD;
  protected readonly types = ASSET_TYPES;
  protected readonly sites = SITE_NAMES;
  protected readonly type = signal('');
  protected readonly gq = signal('');
  protected readonly issueFor = signal<Asset | null>(null);
  protected readonly af = signal<{ type: string; count: number; site: string } | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Asset ID' },
    { key: 'type', label: 'Type' },
    { key: 'model', label: 'Model' },
    { key: 'serial', label: 'Serial' },
    { key: 'holder', label: 'Issued To' },
    { key: 'site', label: 'Site' },
    { key: 'battery', label: 'Battery', fmt: (v) => (v === null ? '—' : `${v}%`) },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Issued' ? 'tag green' : r.status === 'In Stock' ? 'tag blue' : r.status === 'Maintenance' ? 'tag amber' : 'tag red') },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Issued', 'In Stock', 'Maintenance', 'Lost'] },
    { key: 'type', label: 'Type', options: ASSET_TYPES.map((t) => t.type) },
    { key: 'site', label: 'Site', options: SITE_NAMES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'issue', label: 'Issue to guard', icon: 'user-check', when: (r) => r.status === 'In Stock' },
    { id: 'return', label: 'Return to stock', icon: 'refresh', when: (r) => r.status === 'Issued' },
    { id: 'maint', label: 'Send to maintenance', icon: 'toolbox', when: (r) => r.status !== 'Maintenance' && r.status !== 'Lost' },
    { id: 'back', label: 'Back from service', icon: 'p-check', when: (r) => r.status === 'Maintenance' },
    { id: 'lost', label: 'Report lost', icon: 'triangle-alert', danger: true, when: (r) => r.status === 'Issued' || r.status === 'In Stock' },
    { id: 'found', label: 'Mark found', icon: 'p-check', when: (r) => r.status === 'Lost' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'return', label: 'Return to stock' }, { id: 'maint', label: 'Send to maintenance' }];
  protected readonly rows = computed(() => this.store.assets().filter((a) => !this.type() || a.type === this.type()).map((a) => ({ ...a, holder: this.holder(a) })));
  protected readonly tiles = computed(() => ASSET_TYPES.map((t) => { const l = this.store.assets().filter((a) => a.type === t.type); return { ...t, total: l.length, issued: l.filter((a) => a.status === 'Issued').length, stock: l.filter((a) => a.status === 'In Stock').length }; }));
  protected readonly lowBat = computed(() => this.store.assets().filter((a) => a.status === 'Issued' && a.battery !== null && a.battery < 25).sort((a, b) => a.battery! - b.battery!));
  protected readonly dueService = computed(() => this.store.assets().filter((a) => a.status !== 'Maintenance' && a.status !== 'Lost' && a.service < '2026-11-15').slice(0, 6));
  protected readonly guardOpts = computed(() => { const q = this.gq().toLowerCase(); return this.store.guards().filter((g) => (g.status === 'On Duty' || g.status === 'Off Duty') && (!q || `${g.name} ${g.id}`.toLowerCase().includes(q))).slice(0, 30); });

  protected count(s: AStatus) {
    return this.store.assets().filter((a) => a.status === s).length;
  }
  protected pct(s: AStatus) {
    return Math.round((this.count(s) / this.store.assets().length) * 100);
  }
  protected holder(a: Asset) {
    return a.guardId ? (this.store.guard(a.guardId)?.name ?? a.guardId) : '—';
  }
  private patch(ids: string[], ch: Partial<Asset>) {
    this.store.assets.update((l) => l.map((a) => (ids.includes(a.id) ? { ...a, ...ch } : a)));
  }
  protected act(a: string, r: Asset) {
    if (a === 'issue') { this.gq.set(''); return this.issueFor.set(r); }
    const map: Record<string, [Partial<Asset>, string]> = {
      return: [{ status: 'In Stock', guardId: null, issued: '' }, 'returned to stock'],
      maint: [{ status: 'Maintenance', guardId: null }, 'sent to maintenance'],
      back: [{ status: 'In Stock', service: '2027-10-14', battery: r.battery === null ? null : 100 }, 'back from service'],
      lost: [{ status: 'Lost' }, 'reported lost · incident raised'],
      found: [{ status: 'In Stock', guardId: null }, 'marked found'],
    };
    const [ch, msg] = map[a];
    this.patch([r.id], ch);
    if (a === 'lost') this.store.reportIncident({ type: 'Lost & Found', sev: 'Medium', post: r.guardId ? (this.store.guard(r.guardId)?.location ?? 'Control Room') : 'Control Room', site: r.site, guardId: r.guardId ?? 'GRD-001', desc: `${r.type} ${r.id} (${r.serial}) reported lost.`, assignee: 'Security Manager', police: false });
    this.toastMsg(`${r.id} ${msg}`);
  }
  protected bulkAct(a: string, ids: string[]) {
    this.patch(ids, a === 'return' ? { status: 'In Stock', guardId: null } : { status: 'Maintenance', guardId: null });
    this.toastMsg(`${ids.length} assets updated`);
  }
  protected issue(a: Asset, g: Guard) {
    this.patch([a.id], { status: 'Issued', guardId: g.id, site: g.site, issued: '2026-10-14' });
    this.issueFor.set(null);
    this.toastMsg(`${a.id} issued to ${g.name} · e-signature requested`);
  }
  protected notifyLow() {
    this.toastMsg(`${this.lowBat().length} guards asked to swap batteries at the control room`);
  }
  protected addAssets() {
    const f = this.af()!;
    const t = ASSET_TYPES.find((x) => x.type === f.type)!;
    const n = this.store.assets().filter((a) => a.type === f.type).length;
    const add: Asset[] = Array.from({ length: Math.max(1, Math.min(50, f.count)) }, (_, i) => ({ id: `${t.prefix}-${String(n + i + 1).padStart(3, '0')}`, type: t.type, model: t.model, serial: `SN${Math.abs(hash(t.prefix + n + i)) % 9000000 + 1000000}`, status: 'In Stock', guardId: null, site: f.site, issued: '', service: '2027-10-14', battery: t.battery ? 100 : null }));
    this.store.assets.update((l) => [...add, ...l]);
    this.af.set(null);
    this.toastMsg(`${add.length} × ${t.type} added to ${f.site} stock`);
  }
  protected exportCsv() {
    downloadCsv('guard-equipment.csv', [['Asset ID', 'Type', 'Model', 'Serial', 'Status', 'Issued To', 'Site', 'Battery', 'Next Service'], ...this.store.assets().map((a) => [a.id, a.type, a.model, a.serial, a.status, this.holder(a), a.site, a.battery ?? '', a.service])]);
  }
}

/* =====================================================================
   Permits & Access
   ===================================================================== */
const RESTRICTED = ['Data Center', 'Server Hall', 'Control Room', 'Production Area', 'Warehouse', 'Logistics Yard'];
@Component({
  selector: 'app-permits-access',
  imports: [...UI, DataTable, GuardAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Permits &amp; Access" [parent]="parent" [parentLink]="base" subtitle="Approve guard site permits, restricted-zone authorisations, key-holder and vehicle passes.">
      <button class="btn-primary" (click)="openReq()"><app-icon name="plus" [size]="16" />New Permit Request</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Active Permits" [value]="by('Active').length" icon="key-round" color="var(--ka-22c55e)" [sub]="uniqueHolders() + ' guards'" />
      <app-kpi label="Pending Approval" [value]="by('Pending').length" icon="clock" color="var(--ka-f97316)" sub="awaiting you" [subColor]="by('Pending').length ? 'var(--ka-ea580c)' : undefined" />
      <app-kpi label="Expiring (60 days)" [value]="expiring().length" icon="calendar-x" color="var(--ka-f59e0b)" sub="renew before expiry" />
      <app-kpi label="Expired / Revoked" [value]="by('Expired').length + by('Revoked').length" icon="ban" color="var(--ka-ef4444)" sub="access disabled" />
      <app-kpi label="Restricted Zone Holders" [value]="rzHolders()" icon="shield-plus" color="var(--ka-8b5cf6)" sub="Data Center · Server Hall · CR" />
    </section>
    <section class="two">
      <div class="card">
        <div class="card-head"><h3>Pending Approvals</h3><span class="tag amber">{{ by('Pending').length }}</span></div>
        <div class="pend">
          @for (p of by('Pending'); track p.id) {
            @if (store.guard(p.guardId); as g) {
              <div class="pc">
                <div class="ph"><app-guard-avatar [g]="g" [size]="36" /><div><b>{{ g.name }}</b><small>{{ g.id }} · {{ g.company }}</small></div><span class="tag blue">{{ p.id }}</span></div>
                <div class="pb"><b>{{ p.type }}</b><span>{{ p.zones.join(', ') }} · {{ fd(p.from) }} → {{ fd(p.to) }}</span><small class="muted">{{ p.reason }}</small>
                  @if (missingCert(g, p); as m) {<small class="bad">⚠ {{ m }}</small>}
                </div>
                <div class="pa"><button class="btn-primary btn-sm" (click)="decide(p, 'Active')">Approve</button><button class="btn-ghost btn-sm" (click)="decide(p, 'Rejected')">Reject</button></div>
              </div>
            }
          } @empty {<p class="muted">No pending requests.</p>}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Zone Access Matrix</h3><span class="muted">authorised guards per zone</span></div>
        <table class="table zm">
          <thead><tr><th>Zone</th><th>Risk</th><th class="num">Authorised</th><th class="num">On duty now</th><th>Coverage</th></tr></thead>
          <tbody>
            @for (z of zoneRows(); track z.name) {
              <tr><td><b>{{ z.name }}</b></td><td><span [class]="z.risk === 'High' ? 'tag red' : z.risk === 'Medium' ? 'tag amber' : 'tag green'">{{ z.risk }}</span></td><td class="num">{{ z.auth }}</td><td class="num">{{ z.on }}</td>
                <td><div class="mini-progress"><i [style.width.%]="Math.min(100, (z.on / z.req) * 100)" [style.background]="z.on >= z.req ? 'var(--ka-22c55e)' : 'var(--ka-f59e0b)'"></i></div><small>{{ z.on }}/{{ z.req }} required</small></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters" [actions]="actions" [searchKeys]="['id', 'guard', 'type', 'zonesTxt']" searchPlaceholder="Search permit, guard, zone..." noun="permits" (action)="act($event.action, $event.row)" />
    </section>
    @if (rf(); as f) {
      <div class="g-overlay" (click)="rf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveReq()">
        <div class="modal-head"><h3>New permit request</h3><button type="button" class="close-btn" (click)="rf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Guard<select class="select" [value]="f.guardId" (change)="rf.set({ ...f, guardId: $any($event.target).value })">@for (g of store.guards().slice(0, 120); track g.id) {<option [value]="g.id">{{ g.name }} · {{ g.id }}</option>}</select></label>
          <label>Permit type<select class="select" [value]="f.type" (change)="rf.set({ ...f, type: $any($event.target).value })">@for (t of ptypes; track t) {<option>{{ t }}</option>}</select></label>
          <label>Zone<select class="select" [value]="f.zone" (change)="rf.set({ ...f, zone: $any($event.target).value })">@for (z of zones; track z) {<option>{{ z }}</option>}</select></label>
          <label>Valid from<input class="input" type="date" [value]="f.from" (change)="rf.set({ ...f, from: $any($event.target).value })" /></label>
          <label>Valid to<input class="input" type="date" [value]="f.to" (change)="rf.set({ ...f, to: $any($event.target).value })" /></label>
          <label class="full">Justification<input class="input" [value]="f.reason" (input)="rf.set({ ...f, reason: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rf.set(null)">Cancel</button><button class="btn-primary" type="submit">Submit for approval</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    ${PATROL_CSS}
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; align-items: start; }
    .pend { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 420px; overflow: auto; }
    .pc { border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .ph { display: grid; grid-template-columns: 36px 1fr auto; gap: 8px; align-items: center; } .ph div { display: flex; flex-direction: column; font-size: 12.5px; } .ph small { color: var(--muted); font-size: 11px; }
    .pb { display: flex; flex-direction: column; gap: 2px; font-size: 12px; } .pb small { font-size: 11px; } .pa { display: flex; gap: 6px; }
    .zm small { font-size: 11px; color: var(--muted); } .zm .mini-progress { width: 110px; }
    @media (max-width: 1250px) { .two, .pend { grid-template-columns: 1fr; } }
  `,
})
export class GuardPermits {
  protected readonly store = inject(PatrolStore);
  protected readonly parent = PARENT;
  protected readonly base = BASE;
  protected readonly Math = Math;
  protected readonly fd = fmtD;
  protected readonly ptypes = PERMIT_TYPES;
  protected readonly zones = [...SITE_NAMES, ...POSTS.map((p) => p.name).filter((n) => !SITE_NAMES.includes(n))];
  protected readonly rf = signal<{ guardId: string; type: string; zone: string; from: string; to: string; reason: string } | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  protected readonly cols: Col[] = [
    { key: 'id', label: 'Permit ID' },
    { key: 'guard', label: 'Guard', kind: 'person', sub: 'guardId' },
    { key: 'type', label: 'Type' },
    { key: 'zonesTxt', label: 'Zones / Sites' },
    { key: 'from', label: 'Valid From', fmt: fmtD },
    { key: 'to', label: 'Valid To', fmt: fmtD },
    { key: 'approver', label: 'Approver', fmt: (v) => v || '—' },
    { key: 'status', label: 'Status', kind: 'tag', tag: (r) => (r.status === 'Active' ? 'tag green' : r.status === 'Pending' ? 'tag amber' : 'tag red') },
  ];
  protected readonly filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Pending', 'Expired', 'Rejected', 'Revoked'] },
    { key: 'type', label: 'Type', options: PERMIT_TYPES },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'approve', label: 'Approve', icon: 'p-check', when: (r) => r.status === 'Pending' },
    { id: 'reject', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
    { id: 'extend', label: 'Extend 6 months', icon: 'calendar-days', when: (r) => r.status === 'Active' || r.status === 'Expired' },
    { id: 'revoke', label: 'Revoke', icon: 'ban', danger: true, when: (r) => r.status === 'Active' },
  ];
  protected readonly rows = computed(() => this.store.permits().map((p) => { const n = this.store.guard(p.guardId)?.name ?? p.guardId; return { ...p, guard: n, initials: n.split(' ').map((x) => x[0]).join('').slice(0, 2), avatar: ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0d9488)', 'var(--ka-ea580c)', 'var(--ka-db2777)'][Math.abs(hash(p.guardId)) % 5], zonesTxt: p.zones.join(', ') }; }));
  protected readonly expiring = computed(() => this.store.permits().filter((p) => p.status === 'Active' && p.to <= '2026-12-14'));
  protected readonly uniqueHolders = computed(() => new Set(this.by('Active').map((p) => p.guardId)).size);
  protected readonly rzHolders = computed(() => new Set(this.store.permits().filter((p) => p.status === 'Active' && p.zones.some((z) => ['Data Center', 'Server Hall', 'Control Room'].includes(z))).map((p) => p.guardId)).size);
  protected readonly zoneRows = computed(() => RESTRICTED.map((name) => {
    const post = POSTS.find((p) => p.name === name)!;
    const auth = new Set(this.store.permits().filter((p) => p.status === 'Active' && (p.zones.includes(name) || p.zones.includes(post.site))).map((p) => p.guardId));
    return { name, risk: post.risk, req: post.required, auth: auth.size, on: this.store.onDuty().filter((g) => g.location === name).length };
  }));
  protected by(s: Permit['status']) {
    return this.store.permits().filter((p) => p.status === s);
  }
  protected missingCert(g: Guard, p: Permit) {
    const bad = g.certs.filter((c) => c.status !== 'Valid' && certType(c.key).mandatory);
    return bad.length ? `${certType(bad[0].key).name} ${bad[0].status.toLowerCase()}` : '';
  }
  private patch(id: string, ch: Partial<Permit>) {
    this.store.permits.update((l) => l.map((p) => (p.id === id ? { ...p, ...ch } : p)));
  }
  protected decide(p: Permit, s: 'Active' | 'Rejected') {
    this.patch(p.id, { status: s, approver: 'Security Manager' });
    this.toastMsg(`${p.id} ${s === 'Active' ? 'approved · access synced to door controllers' : 'rejected'}`);
  }
  protected act(a: string, p: Permit) {
    if (a === 'approve') return this.decide(p, 'Active');
    if (a === 'reject') return this.decide(p, 'Rejected');
    if (a === 'revoke') {
      this.patch(p.id, { status: 'Revoked' });
      return this.toastMsg(`${p.id} revoked · badge access removed`);
    }
    const d = new Date(p.to < '2026-10-14' ? '2026-10-14' : p.to);
    d.setMonth(d.getMonth() + 6);
    this.patch(p.id, { to: d.toISOString().slice(0, 10), status: 'Active' });
    this.toastMsg(`${p.id} extended to ${fmtD(d.toISOString().slice(0, 10))}`);
  }
  protected openReq() {
    this.rf.set({ guardId: 'GRD-001', type: 'Restricted Zone Authorization', zone: 'Data Center', from: '2026-10-15', to: '2027-04-14', reason: '' });
  }
  protected saveReq() {
    const f = this.rf()!;
    const n = this.store.permits().length + 1;
    this.store.permits.update((l) => [{ id: `PRM-${String(n).padStart(4, '0')}`, guardId: f.guardId, type: f.type, zones: [f.zone], from: f.from, to: f.to, status: 'Pending', approver: '', reason: f.reason || 'Operational requirement' }, ...l]);
    this.rf.set(null);
    this.toastMsg('Permit request submitted for approval');
  }
  protected exportCsv() {
    downloadCsv('guard-permits.csv', [['Permit', 'Guard ID', 'Guard', 'Type', 'Zones', 'From', 'To', 'Status', 'Approver'], ...this.rows().map((p) => [p.id, p.guardId, p.guard, p.type, p.zonesTxt, p.from, p.to, p.status, p.approver])]);
  }
}

/* =====================================================================
   Contractor Guards (security vendors)
   ===================================================================== */
const MONTHS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
@Component({
  selector: 'app-contractor-guards',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Contractor Guards" [parent]="parent" [parentLink]="base" subtitle="Security service providers, contracts, SLA performance, licensing and monthly billing.">
      <button class="btn-primary" (click)="openVendor()"><app-icon name="plus" [size]="16" />Add Security Vendor</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="p-upload" [size]="16" />Export</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Security Vendors" [value]="store.companies().length" icon="building" color="var(--ka-8b5cf6)" [sub]="renewals() + ' renewal due'" />
      <app-kpi label="Contract Guards" [value]="store.counts().total" icon="users" color="var(--ka-3b82f6)" [sub]="store.counts().on + ' on duty now'" />
      <app-kpi label="Avg SLA Achievement" [value]="avgSla() + '%'" icon="shield-check" color="var(--ka-22c55e)" sub="target 95%" />
      <app-kpi label="Monthly Spend (AED)" [value]="spend()" icon="file-chart" color="var(--ka-f97316)" change="3%" [good]="false" sub="vs. last month" />
      <app-kpi label="SLA Breaches" [value]="breaches()" icon="triangle-alert" color="var(--ka-ef4444)" sub="vendors below target" [subColor]="breaches() ? 'var(--ka-dc2626)' : undefined" />
    </section>
    <section class="vendors">
      @for (c of rows(); track c.name) {
        <button class="card vc" [class.on]="sel()?.name === c.name" (click)="selName.set(c.name)">
          <div class="vh"><span class="lg" [style.background]="c.color">{{ c.short }}</span><div><b>{{ c.name }}</b><small>{{ c.contractNo }} · {{ c.type }}</small></div><span [class]="statusTag(c.status)">{{ c.status }}</span></div>
          <div class="vm"><div><small>Guards</small><b>{{ c.count }}</b></div><div><small>On duty</small><b>{{ c.on }}</b></div><div><small>SLA</small><b [class.bad]="c.sla < c.slaTarget" [class.good]="c.sla >= c.slaTarget">{{ c.sla }}%</b></div><div><small>Rating</small><b>{{ c.rating }}★</b></div></div>
          <div class="vf"><small>Contract ends {{ fd(c.end) }}</small><small [class.bad]="c.expiring">{{ c.expiring }} certs expiring</small></div>
        </button>
      }
    </section>
    @if (sel(); as c) {
      <section class="det">
        <div class="card">
          <div class="card-head"><h3>{{ c.name }} – Contract</h3>
            <div class="toolbar"><button class="btn-primary btn-sm" (click)="renew(c)">Renew +1 year</button><button class="btn-ghost btn-sm" (click)="breach(c)">Issue SLA Notice</button><button class="btn-ghost btn-sm" (click)="viewGuards(c)">View guards</button></div>
          </div>
          <dl class="kv">
            <dt>Contract no.</dt><dd>{{ c.contractNo }}</dd><dt>Period</dt><dd>{{ fd(c.start) }} – {{ fd(c.end) }}</dd>
            <dt>Hourly rate</dt><dd>AED {{ c.rate }} / guard-hour</dd><dt>Monthly value</dt><dd>AED {{ c.monthly.toLocaleString() }}</dd>
            <dt>SIRA licence</dt><dd>{{ c.license }} · exp {{ fd(c.licenseExpiry) }}</dd><dt>Account manager</dt><dd>{{ c.contact }}</dd>
            <dt>Phone</dt><dd>{{ c.phone }}</dd><dt>Email</dt><dd>{{ c.email }}</dd>
          </dl>
        </div>
        <div class="card"><div class="card-head"><h3>SLA Trend</h3><span class="muted">target {{ c.slaTarget }}%</span></div><app-line-chart [labels]="months" [series]="slaTrend(c)" [height]="200" [min]="85" [max]="100" suffix="%" [legend]="false" /></div>
        <div class="card"><div class="card-head"><h3>Guards by Status</h3></div><app-donut [segments]="statusSegs(c.name)" center="Guards" [value]="'' + countOf(c.name)" [size]="130" /></div>
        <div class="card bill">
          <div class="card-head"><h3>October Billing Estimate</h3></div>
          <div class="bl"><span>Contracted guard-hours</span><b>{{ hours(c).toLocaleString() }}</b></div>
          <div class="bl"><span>Overtime hours</span><b>{{ ot(c) }}</b></div>
          <div class="bl"><span>SLA penalty</span><b [class.bad]="c.sla < c.slaTarget">{{ c.sla < c.slaTarget ? '-2%' : '0%' }}</b></div>
          <div class="bl tot"><span>Estimated invoice</span><b>AED {{ invoice(c).toLocaleString() }}</b></div>
          <button class="btn-ghost btn-sm" (click)="toastMsg('Timesheet reconciliation sent to ' + c.contact)">Reconcile timesheets</button>
        </div>
      </section>
    }
    @if (vf(); as f) {
      <div class="g-overlay" (click)="vf.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveVendor()">
        <div class="modal-head"><h3>Add security vendor</h3><button type="button" class="close-btn" (click)="vf.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Company name *<input class="input" required [value]="f.name" (input)="vf.set({ ...f, name: $any($event.target).value })" /></label>
          <label>SIRA licence no.<input class="input" [value]="f.license" (input)="vf.set({ ...f, license: $any($event.target).value })" /></label>
          <label>Hourly rate (AED)<input class="input" type="number" [value]="f.rate" (input)="vf.set({ ...f, rate: +$any($event.target).value })" /></label>
          <label>Contract start<input class="input" type="date" [value]="f.start" (change)="vf.set({ ...f, start: $any($event.target).value })" /></label>
          <label>Contract end<input class="input" type="date" [value]="f.end" (change)="vf.set({ ...f, end: $any($event.target).value })" /></label>
          <label>Account manager<input class="input" [value]="f.contact" (input)="vf.set({ ...f, contact: $any($event.target).value })" /></label>
          <label>Email<input class="input" [value]="f.email" (input)="vf.set({ ...f, email: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="vf.set(null)">Cancel</button><button class="btn-primary" type="submit">Add vendor</button></div>
      </form>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .vendors { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .vc { text-align: left; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 10px; } .vc.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
    .vh { display: grid; grid-template-columns: 38px 1fr auto; gap: 8px; align-items: center; } .vh div { display: flex; flex-direction: column; font-size: 13px; min-width: 0; } .vh small { color: var(--muted); font-size: 11px; }
    .lg { width: 38px; height: 38px; border-radius: 10px; color: var(--kf-ffffff); display: grid; place-items: center; font-weight: 700; font-size: 13px; }
    .vm { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; } .vm div { display: flex; flex-direction: column; } .vm small, .vf small { color: var(--muted); font-size: 11px; } .vm b { font-size: 15px; }
    .vf { display: flex; justify-content: space-between; } .vf small.bad { color: var(--red); }
    .det { display: grid; grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr; gap: 12px; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; font-size: 12.5px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; overflow-wrap: anywhere; }
    .bill { display: flex; flex-direction: column; gap: 6px; } .bl { display: flex; justify-content: space-between; font-size: 12.5px; padding: 4px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .bl.tot { font-size: 14px; border: 0; } .bill .btn-ghost { align-self: flex-start; margin-top: 4px; }
    @media (max-width: 1400px) { .det { grid-template-columns: 1fr 1fr; } }
  `,
})
export class ContractorGuards {
  protected readonly store = inject(PatrolStore);
  private readonly router = inject(Router);
  protected readonly parent = PARENT;
  protected readonly base = BASE;
  protected readonly fd = fmtD;
  protected readonly months = MONTHS;
  protected readonly selName = signal('SecureTech');
  protected readonly vf = signal<SecCompany | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  protected readonly rows = computed(() => this.store.companies().map((c) => {
    const gs = this.store.guards().filter((g) => g.company === c.name);
    return { ...c, count: gs.length, on: gs.filter((g) => g.status === 'On Duty').length, expiring: gs.reduce((a, g) => a + g.certs.filter((x) => x.status !== 'Valid').length, 0) };
  }));
  protected readonly sel = computed(() => this.rows().find((c) => c.name === this.selName()) ?? null);
  protected readonly renewals = computed(() => this.store.companies().filter((c) => c.status === 'Renewal Due').length);
  protected readonly avgSla = computed(() => (this.store.companies().reduce((a, c) => a + c.sla, 0) / this.store.companies().length).toFixed(1));
  protected readonly spend = computed(() => `${(this.store.companies().reduce((a, c) => a + c.monthly, 0) / 1e6).toFixed(2)}M`);
  protected readonly breaches = computed(() => this.store.companies().filter((c) => c.sla < c.slaTarget).length);

  protected statusTag(s: string) {
    return s === 'Active' ? 'tag green' : s === 'Renewal Due' ? 'tag amber' : 'tag blue';
  }
  protected countOf(n: string) {
    return this.store.guards().filter((g) => g.company === n).length;
  }
  protected statusSegs(n: string) {
    const gs = this.store.guards().filter((g) => g.company === n);
    const c = (s: string) => gs.filter((g) => g.status === s).length;
    return [{ label: 'On Duty', value: c('On Duty'), color: 'var(--ka-22c55e)' }, { label: 'Off Duty', value: c('Off Duty'), color: 'var(--ka-94a3b8)' }, { label: 'On Leave', value: c('On Leave'), color: 'var(--ka-f97316)' }, { label: 'Training', value: c('Training'), color: 'var(--ka-3b82f6)' }];
  }
  protected slaTrend(c: SecCompany) {
    const h = Math.abs(hash(c.name));
    return [
      { name: 'SLA', color: c.color, values: MONTHS.map((_, i) => Math.round((c.sla - 2.5 + i * 0.5 + ((h >> i) % 3) * 0.4) * 10) / 10), area: true },
      { name: 'Target', color: 'var(--ka-94a3b8)', values: MONTHS.map(() => c.slaTarget), dashed: true },
    ];
  }
  protected hours(c: SecCompany) {
    return Math.round(c.monthly / c.rate);
  }
  protected ot(c: SecCompany) {
    return Math.round(this.countOf(c.name) * 1.6);
  }
  protected invoice(c: SecCompany) {
    return Math.round((c.monthly + this.ot(c) * c.rate * 1.25) * (c.sla < c.slaTarget ? 0.98 : 1));
  }
  private patch(n: string, ch: Partial<SecCompany>) {
    this.store.companies.update((l) => l.map((c) => (c.name === n ? { ...c, ...ch } : c)));
  }
  protected renew(c: SecCompany) {
    const y = +c.end.slice(0, 4) + 1;
    this.patch(c.name, { end: `${y}${c.end.slice(4)}`, status: 'Active' });
    this.toastMsg(`${c.name} contract renewed to ${fmtD(`${y}${c.end.slice(4)}`)}`);
  }
  protected breach(c: SecCompany) {
    this.patch(c.name, { status: 'Under Review' });
    this.toastMsg(`SLA notice issued to ${c.name} (${c.sla}% vs ${c.slaTarget}% target)`);
  }
  protected viewGuards(c: SecCompany) {
    this.router.navigate([BASE, 'guard-directory'], { queryParams: { company: c.name } });
  }
  protected openVendor() {
    this.vf.set({ name: '', short: '', color: 'var(--ka-475569)', guards: 0, type: 'Licensed Vendor', contractNo: '', start: '2026-11-01', end: '2027-10-31', rate: 38, monthly: 0, sla: 100, slaTarget: 95, contact: '', phone: '', email: '', license: '', licenseExpiry: '2027-10-31', rating: 0, status: 'Under Review' });
  }
  protected saveVendor() {
    const f = this.vf()!;
    if (!f.name.trim()) return;
    const n = this.store.companies().length + 1;
    this.store.companies.update((l) => [...l, { ...f, short: f.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(), contractNo: `SC-2026-0${10 + n}` }]);
    this.selName.set(f.name);
    this.vf.set(null);
    this.toastMsg(`${f.name} added · onboarding checklist sent`);
  }
  protected exportCsv() {
    downloadCsv('security-vendors.csv', [['Company', 'Contract', 'Type', 'Start', 'End', 'Guards', 'On Duty', 'SLA %', 'Target %', 'Rate AED', 'Monthly AED', 'Rating', 'Status'], ...this.rows().map((c) => [c.name, c.contractNo, c.type, c.start, c.end, c.count, c.on, c.sla, c.slaTarget, c.rate, c.monthly, c.rating, c.status])]);
  }
}

/* =====================================================================
   Settings & Configuration
   ===================================================================== */
const STABS = ['Patrol Rules', 'Alerts & Escalation', 'Shifts & Compliance', 'Certifications', 'Integrations'] as const;
@Component({
  selector: 'app-settings-configuration',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Settings &amp; Configuration" [parent]="parent" [parentLink]="base" subtitle="Configure patrol rules, alert escalation, shift limits, certificate requirements and integrations.">
      <button class="btn-primary" [disabled]="!dirty()" (click)="save()"><app-icon name="p-check" [size]="16" />Save Changes</button>
      <button class="btn-ghost" [disabled]="!dirty()" (click)="discard()">Discard</button>
    </app-page-head>
    <section class="card">
      <nav class="tabs-row">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</nav>
      @switch (tab()) {
        @case ('Patrol Rules') {
          <div class="grid">
            <div class="set"><div><b>Checkpoint scan window</b><small>Minutes a checkpoint may be scanned late before it is marked missed</small></div><span class="num-in"><input class="input" type="number" [value]="d().scanWindow" (input)="set('scanWindow', +$any($event.target).value)" /> min</span></div>
            <div class="set"><div><b>GPS reporting interval</b><small>How often guard devices report location</small></div><span class="num-in"><input class="input" type="number" [value]="d().gps" (input)="set('gps', +$any($event.target).value)" /> sec</span></div>
            <div class="set"><div><b>Geofence enforcement</b><small>Alert when a guard leaves the assigned post boundary</small></div><label class="sw"><input type="checkbox" [checked]="d().geofence" (change)="set('geofence', !d().geofence)" /><i></i></label></div>
            <div class="set"><div><b>Photo proof at checkpoints</b><small>Require a photo with every scan</small></div><label class="sw"><input type="checkbox" [checked]="d().photoProof" (change)="set('photoProof', !d().photoProof)" /><i></i></label></div>
            <div class="set"><div><b>Selfie verification at shift start</b><small>Face match against the guard profile photo</small></div><label class="sw"><input type="checkbox" [checked]="d().requireSelfie" (change)="set('requireSelfie', !d().requireSelfie)" /><i></i></label></div>
          </div>
        }
        @case ('Alerts & Escalation') {
          <div class="grid">
            <div class="set"><div><b>Idle guard threshold</b><small>No movement detected for</small></div><span class="num-in"><input class="input" type="number" [value]="d().idleMins" (input)="set('idleMins', +$any($event.target).value)" /> min</span></div>
            <div class="set"><div><b>Auto-escalate unacknowledged alerts</b><small>Escalate to supervisor after</small></div><span class="num-in"><input class="input" type="number" [value]="d().autoEscalate" (input)="set('autoEscalate', +$any($event.target).value)" /> min</span></div>
            <div class="set"><div><b>Panic / SOS button</b><small>Enable SOS on guard app and wearables</small></div><label class="sw"><input type="checkbox" [checked]="d().panic" (change)="set('panic', !d().panic)" /><i></i></label></div>
            <div class="set"><div><b>SMS alerts to supervisors</b><small>High and critical alerts</small></div><label class="sw"><input type="checkbox" [checked]="d().smsAlerts" (change)="set('smsAlerts', !d().smsAlerts)" /><i></i></label></div>
            <div class="set"><div><b>Daily email digest</b><small>Patrol compliance and incidents summary at 07:00</small></div><label class="sw"><input type="checkbox" [checked]="d().emailDigest" (change)="set('emailDigest', !d().emailDigest)" /><i></i></label></div>
          </div>
          <h4>Escalation matrix</h4>
          <table class="table"><thead><tr><th>Severity</th><th>Level 1</th><th>Level 2 (+{{ d().autoEscalate }} min)</th><th>Level 3 (+{{ d().autoEscalate * 3 }} min)</th></tr></thead>
            <tbody><tr><td><span class="tag red">Critical</span></td><td>Control Room</td><td>Security Manager</td><td>Head of Facilities</td></tr><tr><td><span class="tag amber">High</span></td><td>Shift Supervisor</td><td>Security Manager</td><td>—</td></tr><tr><td><span class="tag blue">Medium</span></td><td>Site Supervisor</td><td>Shift Supervisor</td><td>—</td></tr><tr><td><span class="tag grey">Low</span></td><td>Site Supervisor</td><td>—</td><td>—</td></tr></tbody></table>
        }
        @case ('Shifts & Compliance') {
          <div class="grid">
            <div class="set"><div><b>Minimum rest between shifts</b><small>Roster warns when rest is shorter</small></div><span class="num-in"><input class="input" type="number" [value]="d().minRest" (input)="set('minRest', +$any($event.target).value)" /> hrs</span></div>
            <div class="set"><div><b>Maximum weekly hours</b><small>UAE labour law & vendor contract limit</small></div><span class="num-in"><input class="input" type="number" [value]="d().maxHours" (input)="set('maxHours', +$any($event.target).value)" /> hrs</span></div>
            <div class="set"><div><b>Overtime requires approval</b><small>Manager approval before overtime is rostered</small></div><label class="sw"><input type="checkbox" [checked]="d().overtimeApproval" (change)="set('overtimeApproval', !d().overtimeApproval)" /><i></i></label></div>
          </div>
          <h4>Shift templates</h4>
          <table class="table"><thead><tr><th>Shift</th><th>Time</th><th class="num">Guards assigned</th></tr></thead>
            <tbody>@for (s of shiftKeys; track s) {<tr><td><i class="dot-sm" [style.background]="shifts[s].color"></i>{{ shifts[s].label }}</td><td>{{ shifts[s].time || '3-shift rotation' }}</td><td class="num">{{ assigned(s) }}</td></tr>}</tbody></table>
        }
        @case ('Certifications') {
          <div class="grid one"><div class="set"><div><b>Expiry reminder</b><small>Notify guard, vendor and supervisor before expiry</small></div><span class="num-in"><input class="input" type="number" [value]="d().certReminder" (input)="set('certReminder', +$any($event.target).value)" /> days</span></div></div>
          <h4>Certificate requirements</h4>
          <table class="table"><thead><tr><th>Certificate</th><th>Validity</th><th>Mandatory for all posts</th></tr></thead>
            <tbody>@for (t of certs(); track t.key) {<tr><td><i class="dot-sm" [style.background]="t.color"></i>{{ t.name }}</td><td>{{ t.validity }} months</td><td><label class="sw"><input type="checkbox" [checked]="t.mandatory" (change)="toggleCert(t.key)" /><i></i></label></td></tr>}</tbody></table>
        }
        @case ('Integrations') {
          <div class="ints">
            @for (i of ints(); track i.name) {
              <div class="int"><span class="ii"><app-icon [name]="i.icon" [size]="20" /></span><div><b>{{ i.name }}</b><small>{{ i.desc }}</small></div><span [class]="i.on ? 'tag green' : 'tag grey'">{{ i.on ? 'Connected' : 'Disconnected' }}</span><button class="btn-ghost btn-sm" (click)="toggleInt(i.name)">{{ i.on ? 'Disconnect' : 'Connect' }}</button></div>
            }
          </div>
        }
      }
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .tabs-row { display: flex; gap: 22px; border-bottom: 1px solid var(--border); margin-bottom: 16px; overflow-x: auto; overflow-y: hidden; }
    .tabs-row button { border: 0; background: none; padding: 8px 0; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; } .tabs-row button.on { color: var(--primary); border-color: var(--primary); font-weight: 600; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .grid.one { grid-template-columns: 1fr; max-width: 640px; }
    .set { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
    .set div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; } .set small { color: var(--muted); font-size: 11.5px; }
    .num-in { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); white-space: nowrap; } .num-in .input { width: 76px; }
    .sw { position: relative; display: inline-block; width: 38px; height: 22px; flex: none; } .sw input { opacity: 0; width: 0; height: 0; }
    .sw i { position: absolute; inset: 0; background: var(--kb-d1d5db); border-radius: 22px; cursor: pointer; transition: 0.2s; } .sw i::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: var(--kb-ffffff); border-radius: 50%; transition: 0.2s; }
    .sw input:checked + i { background: var(--primary); } .sw input:checked + i::before { transform: translateX(16px); }
    h4 { margin: 18px 0 8px; font-size: 13px; }
    .ints { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .int { display: grid; grid-template-columns: 40px 1fr auto auto; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
    .int div { display: flex; flex-direction: column; font-size: 13px; } .int small { color: var(--muted); font-size: 11.5px; } .ii { width: 40px; height: 40px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; }
    @media (max-width: 1100px) { .grid, .ints { grid-template-columns: 1fr; } }
  `,
})
export class PatrolSettings {
  protected readonly store = inject(PatrolStore);
  protected readonly parent = PARENT;
  protected readonly base = BASE;
  protected readonly tabs = STABS;
  protected readonly shifts = SHIFTS;
  protected readonly shiftKeys = Object.keys(SHIFTS) as ShiftKey[];
  protected readonly tab = signal<(typeof STABS)[number]>('Patrol Rules');
  protected readonly d = signal<PatrolSettingsModel>({ ...this.store.settings() });
  protected readonly certs = signal(CERT_TYPES.map((t) => ({ ...t })));
  protected readonly ints = signal([
    { name: 'Physical Access Control', desc: 'Sync guard permits to door controllers', icon: 'door-open', on: true },
    { name: 'RTLS / BLE Beacons', desc: 'Indoor location for patrol tracking', icon: 'bluetooth', on: true },
    { name: 'CCTV / VMS', desc: 'Pop-up camera on alerts and incidents', icon: 'p-camera', on: true },
    { name: 'Two-way Radio Gateway', desc: 'Motorola WAVE PTX bridge', icon: 'p-radio', on: false },
    { name: 'SIRA e-Services', desc: 'Licence validation for guards and vendors', icon: 'shield-check', on: true },
    { name: 'Payroll / Vendor Billing', desc: 'Export approved timesheets', icon: 'file-chart', on: false },
  ]);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastMsg = toastFn((m) => this.toast.set(m));
  private readonly certDirty = signal(false);
  protected readonly dirty = computed(() => this.certDirty() || JSON.stringify(this.d()) !== JSON.stringify(this.store.settings()));

  protected set<K extends keyof PatrolSettingsModel>(k: K, v: PatrolSettingsModel[K]) {
    this.d.update((x) => ({ ...x, [k]: v }));
  }
  protected assigned(s: ShiftKey) {
    return this.store.guards().filter((g) => g.shift === s).length;
  }
  protected toggleCert(k: string) {
    this.certs.update((l) => l.map((t) => (t.key === k ? { ...t, mandatory: !t.mandatory } : t)));
    this.certDirty.set(true);
  }
  protected toggleInt(n: string) {
    this.ints.update((l) => l.map((i) => (i.name === n ? { ...i, on: !i.on } : i)));
    const i = this.ints().find((x) => x.name === n)!;
    this.toastMsg(`${n} ${i.on ? 'connected' : 'disconnected'}`);
  }
  protected save() {
    this.store.settings.set({ ...this.d() });
    this.certs().forEach((t) => (CERT_TYPES.find((c) => c.key === t.key)!.mandatory = t.mandatory));
    this.certDirty.set(false);
    this.toastMsg('Patrol settings saved · pushed to guard devices');
  }
  protected discard() {
    this.d.set({ ...this.store.settings() });
    this.certs.set(CERT_TYPES.map((t) => ({ ...t })));
    this.certDirty.set(false);
  }
}
