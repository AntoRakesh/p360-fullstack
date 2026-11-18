import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Col, DataTable, RowAction } from '../../shared/data-table';
import { UI } from '../../shared/ui';
import { rng } from '../dashboards/demo-data';
import { PEOPLE } from './people.data';

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const shortDate = (v: string) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* ======================= Identity Verification & Deduplication ======================= */
type Check = 'Pass' | 'Fail' | 'Review';
interface Verif {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  type: string;
  doc: string;
  document: Check;
  liveness: Check;
  watchlist: Check;
  score: number;
  submitted: string;
  status: string;
}
interface DupField {
  label: string;
  a: string;
  b: string;
}
interface Dup {
  id: number;
  score: number;
  a: { id: string; name: string; initials: string; avatar: string };
  b: { id: string; name: string; initials: string; avatar: string };
  fields: DupField[];
  status: 'Open' | 'Merged' | 'Dismissed';
}

const VERIFS: Verif[] = (() => {
  const r = rng(61);
  const c = (): Check => {
    const x = r();
    return x < 0.82 ? 'Pass' : x < 0.94 ? 'Review' : 'Fail';
  };
  return PEOPLE.filter((p) => p.type !== 'Employee').slice(0, 36).map((p, i) => {
    const document = c();
    const liveness = c();
    const watchlist = r() < 0.92 ? 'Pass' : 'Review';
    const score = Math.round((document === 'Pass' ? 40 : 15) + (liveness === 'Pass' ? 35 : 10) + (watchlist === 'Pass' ? 20 : 0) + r() * 5);
    return {
      id: `VER-${5100 + i}`, name: p.name, initials: p.initials, avatar: p.avatar, type: p.type,
      doc: ['Passport', 'Emirates ID', 'Driving Licence', 'National ID'][Math.floor(r() * 4)],
      document, liveness, watchlist, score,
      submitted: `${Math.floor(r() * 50) + 2} min ago`,
      status: i < 22 ? 'Pending' : score > 80 ? 'Verified' : 'Rejected',
    } as Verif;
  });
})();

const DUPS: Dup[] = (() => {
  const pairs: [number, number, number][] = [[14, 3021, 97], [15, 5120, 93], [16, 812, 91], [17, 9001, 88], [18, 4410, 84], [19, 7712, 81], [20, 1333, 78], [21, 6060, 74]];
  return pairs.map(([i, j, score], k) => {
    const a = PEOPLE[i];
    const b = { ...PEOPLE[j], name: k % 2 ? a.name : a.name.replace(/(\w)(\w+)$/, (_, f, rest) => f + rest.slice(0, -1)) };
    return {
      id: k, score, status: 'Open',
      a: { id: a.id, name: a.name, initials: a.initials, avatar: a.avatar },
      b: { id: PEOPLE[j].id, name: b.name, initials: a.initials, avatar: 'var(--ka-64748b)' },
      fields: [
        { label: 'Name', a: a.name, b: b.name },
        { label: 'Email', a: a.email, b: k % 3 ? a.email : b.email },
        { label: 'Phone', a: a.phone, b: k % 2 ? a.phone : PEOPLE[j].phone },
        { label: 'Date of birth', a: '14 Mar 1991', b: k % 4 ? '14 Mar 1991' : '13 Mar 1991' },
        { label: 'Face match', a: '—', b: `${score - 2}% similar` },
        { label: 'Type', a: a.type, b: PEOPLE[j].type },
      ],
    } as Dup;
  });
})();

@Component({
  selector: 'app-verification',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Identity Verification &amp; Deduplication" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Verify documents and liveness, screen watchlists and merge duplicate profiles." />
    <section class="kpi-row">
      <app-kpi label="Verified Identities" value="97.2%" icon="shield-check" color="var(--ka-22c55e)" change="0.6%" sub="of all profiles" />
      <app-kpi label="Pending Verification" [value]="cnt('Pending')" icon="clock" color="var(--ka-f59e0b)" sub="in queue" />
      <app-kpi label="Possible Duplicates" [value]="openDups()" icon="users" color="var(--ka-8b5cf6)" sub="to review" />
      <app-kpi label="Rejected (30 days)" [value]="cnt('Rejected')" icon="ban" color="var(--ka-ef4444)" />
      <app-kpi label="Avg. Verification Time" value="42 s" icon="activity" color="var(--ka-3b82f6)" sub="automated checks" />
    </section>

    <div class="tabs page-tabs">
      <button [class.on]="view() === 'queue'" (click)="view.set('queue')">Verification Queue<span class="count">{{ cnt('Pending') }}</span></button>
      <button [class.on]="view() === 'dups'" (click)="view.set('dups')">Duplicate Detection<span class="count">{{ openDups() }}</span></button>
    </div>

    @if (view() === 'queue') {
      <div class="card">
        <app-data-table [rows]="verifs()" [columns]="vcols" noun="requests" [searchKeys]="['name', 'id', 'doc']" searchPlaceholder="Search name, request ID, document..."
          [filters]="vfilters" [actions]="vactions" (action)="verify($event.action, $event.row)" [selectable]="true" [bulkActions]="vbulk" (bulk)="bulkVerify($event.action, $event.ids)" />
      </div>
    } @else {
      <div class="dup-grid">
        @for (d of dups(); track d.id) {
          <div class="card dup" [class.closed]="d.status !== 'Open'">
            <div class="dup-head">
              <span class="score" [class.hi]="d.score >= 90">{{ d.score }}% match</span>
              @if (d.status !== 'Open') {<span [class]="d.status === 'Merged' ? 'tag green' : 'tag grey'">{{ d.status }}</span>}
            </div>
            <div class="pair">
              @for (side of ['a', 'b']; track side) {
                @let x = side === 'a' ? d.a : d.b;
                <label class="who" [class.keep]="keep()[d.id] === side">
                  <input type="radio" [name]="'keep' + d.id" [checked]="(keep()[d.id] ?? 'a') === side" (change)="setKeep(d.id, side)" [disabled]="d.status !== 'Open'" />
                  <span class="dt-av" [style.background]="x.avatar">{{ x.initials }}</span>
                  <div><b>{{ x.name }}</b><small>{{ x.id }}</small></div>
                </label>
              }
            </div>
            <table class="cmp">
              @for (f of d.fields; track f.label) {
                <tr [class.diff]="f.a !== f.b && f.a !== '—'"><th>{{ f.label }}</th><td>{{ f.a }}</td><td>{{ f.b }}</td></tr>
              }
            </table>
            @if (d.status === 'Open') {
              <div class="toolbar">
                <button class="btn-primary btn-sm" (click)="resolve(d, 'Merged')">Merge (keep {{ (keep()[d.id] ?? 'a') === 'a' ? d.a.id : d.b.id }})</button>
                <button class="btn-ghost sm" (click)="resolve(d, 'Dismissed')">Not a duplicate</button>
              </div>
            } @else {
              <button class="link" (click)="resolve(d, 'Open')">Undo</button>
            }
          </div>
        }
      </div>
    }
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .page-tabs { margin-bottom: 12px; }
    .dup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(430px, 1fr)); gap: 12px; }
    .dup { display: flex; flex-direction: column; gap: 10px; } .dup.closed { opacity: 0.6; }
    .dup-head { display: flex; justify-content: space-between; }
    .score { font-weight: 700; color: var(--kf-d97706); } .score.hi { color: var(--kf-dc2626); }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .who { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 12.5px; }
    .who.keep, .who:has(input:checked) { border-color: var(--primary); background: var(--kb-faf8ff); }
    .who div { display: flex; flex-direction: column; } .who small { color: var(--muted); }
    .cmp { width: 100%; border-collapse: collapse; font-size: 12px; }
    .cmp th { text-align: left; color: var(--muted); font-weight: 500; width: 100px; padding: 4px 0; }
    .cmp td { padding: 4px 6px; } .cmp tr.diff td { background: var(--kb-fff7ed); color: var(--kf-b45309); }
  `,
})
export class Verification {
  protected readonly view = signal<'queue' | 'dups'>('queue');
  protected readonly verifs = signal<Verif[]>(VERIFS);
  protected readonly dups = signal<Dup[]>(DUPS);
  protected readonly keep = signal<Record<number, string>>({});
  protected readonly toast = signal<string | null>(null);
  private readonly checkTag = (v: string) => (v === 'Pass' ? 'tag green' : v === 'Fail' ? 'tag red' : 'tag amber');
  protected readonly vcols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'id' },
    { key: 'type', label: 'Type' },
    { key: 'doc', label: 'Document' },
    { key: 'document', label: 'Doc check', kind: 'tag', tag: (r) => this.checkTag(r.document) },
    { key: 'liveness', label: 'Liveness', kind: 'tag', tag: (r) => this.checkTag(r.liveness) },
    { key: 'watchlist', label: 'Watchlist', kind: 'tag', tag: (r) => this.checkTag(r.watchlist) },
    { key: 'score', label: 'Score', kind: 'progress' },
    { key: 'submitted', label: 'Submitted', sortable: false },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly vfilters = [
    { key: 'status', label: 'Status', options: ['Pending', 'Verified', 'Rejected'] },
    { key: 'doc', label: 'Document', options: ['Passport', 'Emirates ID', 'Driving Licence', 'National ID'] },
  ];
  protected readonly vactions: RowAction[] = [
    { id: 'approve', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending' },
    { id: 'reject', label: 'Reject', icon: 'ban', danger: true, when: (r) => r.status === 'Pending' },
    { id: 'recheck', label: 'Re-run checks', icon: 'refresh' },
  ];
  protected readonly vbulk: RowAction[] = [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject', danger: true }];
  protected readonly openDups = computed(() => this.dups().filter((d) => d.status === 'Open').length);

  protected cnt(s: string) {
    return this.verifs().filter((v) => v.status === s).length;
  }
  protected verify(a: string, v: Verif) {
    this.bulkVerify(a, [v.id]);
  }
  protected bulkVerify(a: string, ids: string[]) {
    const set = new Set(ids);
    this.verifs.update((l) =>
      l.map((v) => {
        if (!set.has(v.id)) return v;
        if (a === 'recheck') return { ...v, document: 'Pass', liveness: 'Pass', watchlist: 'Pass', score: 96, status: 'Pending', submitted: 'just now' };
        return { ...v, status: a === 'approve' ? 'Verified' : 'Rejected' };
      }),
    );
    this.notify(`${ids.length} request(s) ${a === 'approve' ? 'approved' : a === 'reject' ? 'rejected' : 're-checked'}`);
  }
  protected setKeep(id: number, side: string) {
    this.keep.update((k) => ({ ...k, [id]: side }));
  }
  protected resolve(d: Dup, status: Dup['status']) {
    this.dups.update((l) => l.map((x) => (x.id === d.id ? { ...x, status } : x)));
    if (status === 'Merged') this.notify(`Profiles merged into ${(this.keep()[d.id] ?? 'a') === 'a' ? d.a.id : d.b.id}`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}

/* ======================= Documents & Certifications ======================= */
interface Doc {
  id: string;
  name: string;
  initials: string;
  avatar: string;
  personId: string;
  doc: string;
  category: string;
  number: string;
  issued: string;
  expiry: string;
  daysLeft: number;
  status: string;
}
const DOC_TYPES: [string, string][] = [
  ['Passport', 'Identity'], ['Emirates ID', 'Identity'], ['Visa', 'Identity'], ['Work Permit', 'Permit'],
  ['Safety Induction Cert', 'Certification'], ['First Aid Certificate', 'Certification'], ['Forklift Licence', 'Licence'], ['Driving Licence', 'Licence'],
];
const DOCS: Doc[] = (() => {
  const r = rng(1212);
  return PEOPLE.slice(0, 1800).flatMap((p, i) => {
    const n = p.type === 'Visitor' ? 1 : 2;
    return Array.from({ length: n }, (_, k) => {
      const [doc, category] = DOC_TYPES[(i + k * 3 + Math.floor(r() * 3)) % DOC_TYPES.length];
      const daysLeft = Math.round(-40 + r() * 900);
      const pend = r() < 0.03;
      return {
        id: `DOC-${30000 + i * 2 + k}`, name: p.name, initials: p.initials, avatar: p.avatar, personId: p.id, doc, category,
        number: `${doc.slice(0, 2).toUpperCase()}${Math.floor(1e6 + r() * 8e6)}`,
        issued: iso(daysLeft - 1095), expiry: iso(daysLeft), daysLeft,
        status: pend ? 'Pending Review' : daysLeft < 0 ? 'Expired' : daysLeft <= 30 ? 'Expiring' : 'Valid',
      };
    });
  });
})();

@Component({
  selector: 'app-documents',
  imports: [...UI, DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Documents &amp; Certifications" parent="People &amp; Identity Management" parentLink="/people-identity" subtitle="Identity documents, permits, licences and certifications with expiry tracking.">
      <button class="btn-outline" (click)="remindAll()"><app-icon name="bell" [size]="16" />Remind all expiring</button>
    </app-page-head>
    <section class="kpi-row">
      <app-kpi label="Documents on File" [value]="list().length.toLocaleString()" icon="file-text" color="var(--ka-8b5cf6)" />
      <app-kpi label="Valid" [value]="cnt('Valid')" icon="file-check" color="var(--ka-22c55e)" />
      <app-kpi label="Expiring ≤ 30 days" [value]="cnt('Expiring')" icon="clock" color="var(--ka-f59e0b)" />
      <app-kpi label="Expired" [value]="cnt('Expired')" icon="ban" color="var(--ka-ef4444)" sub="access may be blocked" />
      <app-kpi label="Pending Review" [value]="cnt('Pending Review')" icon="list-checks" color="var(--ka-3b82f6)" />
    </section>
    <section class="dash">
      <div class="card span-8">
        <div class="card-head"><h3>Upcoming Expiries <span class="card-sub">next 6 months</span></h3></div>
        <app-column-chart [labels]="months" [series]="expiries()" [stacked]="true" [height]="210" />
      </div>
      <div class="card span-4">
        <div class="card-head"><h3>By Category</h3></div>
        <app-donut [segments]="byCat()" center="Documents" [size]="130" />
      </div>
      <div class="card span-12">
        <app-data-table [rows]="list()" [columns]="cols" noun="documents" [searchKeys]="['name', 'personId', 'number', 'doc']" searchPlaceholder="Search person, document number..."
          [filters]="filters" [actions]="actions" [selectable]="true" [bulkActions]="bulk" (action)="act($event.action, [$event.row.id])" (bulk)="act($event.action, $event.ids)" />
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
})
export class Documents {
  protected readonly list = signal<Doc[]>(DOCS);
  protected readonly toast = signal<string | null>(null);
  protected readonly months = Array.from({ length: 6 }, (_, i) => new Date(Date.now() + i * 30 * 86400000).toLocaleDateString('en-GB', { month: 'short' }));
  protected readonly cols: Col[] = [
    { key: 'name', label: 'Person', kind: 'person', sub: 'personId' },
    { key: 'doc', label: 'Document' },
    { key: 'category', label: 'Category' },
    { key: 'number', label: 'Number' },
    { key: 'issued', label: 'Issued', fmt: shortDate },
    { key: 'expiry', label: 'Expiry', fmt: shortDate },
    { key: 'daysLeft', label: 'Days left', kind: 'num' },
    { key: 'status', label: 'Status', kind: 'status' },
  ];
  protected readonly filters = [
    { key: 'category', label: 'Category', options: ['Identity', 'Permit', 'Certification', 'Licence'] },
    { key: 'doc', label: 'Document', options: DOC_TYPES.map((d) => d[0]) },
    { key: 'status', label: 'Status', options: ['Valid', 'Expiring', 'Expired', 'Pending Review'] },
  ];
  protected readonly actions: RowAction[] = [
    { id: 'approve', label: 'Approve', icon: 'shield-check', when: (r) => r.status === 'Pending Review' },
    { id: 'renew', label: 'Upload renewed copy', icon: 'download', when: (r) => r.status !== 'Valid' },
    { id: 'remind', label: 'Send reminder', icon: 'bell', when: (r) => r.status === 'Expiring' || r.status === 'Expired' },
    { id: 'view', label: 'View document', icon: 'file-text' },
  ];
  protected readonly bulk: RowAction[] = [{ id: 'remind', label: 'Send reminders' }, { id: 'approve', label: 'Approve' }];
  protected readonly expiries = computed(() => {
    const cats = ['Identity', 'Permit', 'Certification', 'Licence'];
    const colors = ['var(--ka-7c3aed)', 'var(--ka-f97316)', 'var(--ka-22c55e)', 'var(--ka-3b82f6)'];
    return cats.map((c, ci) => ({ name: c, color: colors[ci], values: [0, 1, 2, 3, 4, 5].map((m) => this.list().filter((d) => d.category === c && d.daysLeft >= m * 30 && d.daysLeft < (m + 1) * 30).length) }));
  });
  protected readonly byCat = computed(() =>
    ['Identity', 'Permit', 'Certification', 'Licence'].map((c, i) => ({ label: c, value: this.list().filter((d) => d.category === c).length, color: ['var(--ka-7c3aed)', 'var(--ka-f97316)', 'var(--ka-22c55e)', 'var(--ka-3b82f6)'][i] })),
  );

  protected cnt(s: string) {
    return this.list().filter((d) => d.status === s).length.toLocaleString();
  }
  protected act(a: string, ids: string[]) {
    if (a === 'view') return this.notify('Document preview opened');
    if (a === 'remind') return this.notify(`Reminder sent for ${ids.length} document(s)`);
    const set = new Set(ids);
    this.list.update((l) => l.map((d) => (set.has(d.id) ? { ...d, status: 'Valid', ...(a === 'renew' ? { issued: iso(0), expiry: iso(1095), daysLeft: 1095 } : {}) } : d)));
    this.notify(`${ids.length} document(s) ${a === 'renew' ? 'renewed' : 'approved'}`);
  }
  protected remindAll() {
    this.notify(`Reminders sent for ${this.cnt('Expiring')} expiring documents`);
  }
  private notify(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast.set(null), 2000);
  }
}
