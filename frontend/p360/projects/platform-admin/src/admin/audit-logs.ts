import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { Col, DataTable } from '@p360/shared/data-table';
import { UI } from '@p360/shared/ui';
import { downloadCsv } from '@p360/shared/data/demo-data';
import { AdminStore, AuditEntry, fmtN, fmtStamp } from './admin.data';
import { ADMIN_CSS, AdminToast } from './admin-ui';
import { AuditDrawer } from './audit-drawer';

const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, All: 9999 } as const;
type Range = keyof typeof RANGES;

@Component({
  selector: 'app-admin-audit-logs',
  imports: [...UI, DataTable, AuditDrawer, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Audit Logs" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Tamper-evident record of every configuration change, sign-in and data export in the tenant.">
      <div class="seg">@for (r of ranges; track r) {<button [class.on]="range() === r" (click)="range.set(r)">{{ r }}</button>}</div>
      <button class="btn-ghost" [class.on]="stream()" (click)="stream.set(!stream())"><span class="live" [class.off]="!stream()"></span>{{ stream() ? 'Live stream on' : 'Live stream paused' }}</button>
      <button class="btn-primary" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Events in Range" [value]="fmt(inRange().length)" icon="list-checks" color="var(--ka-7c3aed)" [sub]="'since ' + since()" />
      <app-kpi label="Configuration Changes" [value]="fmt(changes())" icon="sliders" color="var(--ka-2563eb)" sub="excl. authentication" />
      <app-kpi label="Warnings" [value]="sev('Warning')" icon="triangle-alert" color="var(--ka-f59e0b)" sub="policy & permission changes" />
      <app-kpi label="Critical" [value]="sev('Critical')" icon="siren" color="var(--ka-ef4444)" sub="deletions & revocations" />
      <app-kpi label="Failed Sign-ins" [value]="failed()" icon="admin-lock" color="var(--ka-0891b2)" sub="password / MFA failures" />
    </section>

    <section class="grid2 charts">
      <div class="card"><h3 class="ct">Events per Day (last 14 days)</h3><app-column-chart [labels]="days().labels" [series]="days().series" [stacked]="true" [height]="220" /></div>
      <div class="card"><h3 class="ct">By Category</h3><app-donut [segments]="cats()" center="Events" [size]="140" /></div>
    </section>

    <div class="card">
      <app-data-table [rows]="rows()" [columns]="cols" [filters]="filters()" [searchKeys]="['target', 'actor', 'detail', 'entity', 'id', 'ip']" searchPlaceholder="Search target, user, IP, event ID..." noun="events" [pageSize]="12" (rowClick)="sel.set($event)" />
    </div>
    @if (sel(); as e) {<app-admin-audit-drawer [entry]="e" (closed)="sel.set(null)" />}
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .live { width: 8px; height: 8px; border-radius: 50%; background: var(--kb-22c55e); animation: g-blink 1.6s infinite; } .live.off { background: var(--kb-9ca3af); animation: none; }
    .charts { grid-template-columns: 1.6fr 1fr; }
  `],
})
export class AuditLogs {
  protected readonly store = inject(AdminStore);
  private readonly app = inject(AppState);
  protected readonly fmt = fmtN;
  protected readonly ranges = Object.keys(RANGES) as Range[];
  protected readonly range = signal<Range>('All');
  protected readonly stream = signal(true);
  protected readonly sel = signal<AuditEntry | null>(null);

  constructor() {
    // Live: every ~3rd tick a user signs in somewhere.
    effect(() => {
      const t = this.app.tick();
      if (!t || t % 3 || !untracked(this.stream)) return;
      untracked(() => {
        const users = this.store.users();
        const u = users[(t * 97) % users.length];
        const fail = t % 21 === 0;
        this.store.audit.update((l) => [{ id: `AU-L${t}`, at: Date.now(), actor: u.name, initials: u.initials, color: u.avatar, action: fail ? 'Failed Login' : 'Login', entity: 'Authentication', target: u.name, detail: fail ? 'Invalid MFA code' : u.sso ? 'Signed in with SSO (Azure AD)' : 'Signed in with password', category: 'Authentication', severity: fail ? 'Warning' : 'Info', ip: `10.12.${t % 30}.${(t * 7) % 250}` }, ...l]);
      });
    });
  }

  protected readonly inRange = computed(() => {
    const ms = RANGES[this.range()] * 86400_000;
    const now = Date.now();
    return this.store.audit().filter((a) => now - a.at <= ms);
  });
  protected readonly since = computed(() => (this.range() === 'All' ? fmtStamp(this.store.audit().at(-1)?.at ?? Date.now()).slice(0, 11) : fmtStamp(Date.now() - RANGES[this.range()] * 86400_000).slice(0, 11)));
  protected readonly changes = computed(() => this.inRange().filter((a) => a.category !== 'Authentication').length);
  protected sev(s: string) {
    return this.inRange().filter((a) => a.severity === s).length;
  }
  protected readonly failed = computed(() => this.inRange().filter((a) => a.action === 'Failed Login' || a.action === 'Locked').length);
  protected readonly rows = computed(() => this.inRange().map((a) => ({ ...a, avatar: a.color, when: fmtStamp(a.at), event: `${a.entity} · ${a.action}` })));
  protected readonly cols: Col[] = [
    { key: 'when', label: 'Date & Time', sortable: false }, { key: 'event', label: 'Event' }, { key: 'target', label: 'Target' },
    { key: 'actor', label: 'User', kind: 'person', sub: 'ip' }, { key: 'category', label: 'Category' },
    { key: 'severity', label: 'Severity', kind: 'tag', tag: (r) => (r.severity === 'Critical' ? 'tag red' : r.severity === 'Warning' ? 'tag amber' : 'tag blue') },
  ];
  protected readonly filters = computed(() => [
    { key: 'category', label: 'Category', options: ['Organization', 'Users & Roles', 'Security', 'Branding', 'Data & Privacy', 'Subscription', 'System', 'Authentication'] },
    { key: 'severity', label: 'Severity', options: ['Info', 'Warning', 'Critical'] },
    { key: 'action', label: 'Action', options: [...new Set(this.store.audit().map((a) => a.action))].sort() },
  ]);
  protected readonly cats = computed(() => {
    const colors: Record<string, string> = { Organization: 'var(--ka-7c3aed)', 'Users & Roles': 'var(--ka-2563eb)', Security: 'var(--ka-ef4444)', Branding: 'var(--ka-db2777)', 'Data & Privacy': 'var(--ka-0891b2)', Subscription: 'var(--ka-16a34a)', System: 'var(--ka-f59e0b)', Authentication: 'var(--ka-94a3b8)' };
    const m = new Map<string, number>();
    this.inRange().forEach((a) => m.set(a.category, (m.get(a.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: colors[label] }));
  });
  protected readonly days = computed(() => {
    // Anchored on the newest event so the history (which ends 14 Oct) is visible.
    const end = new Date(this.store.audit()[0]?.at ?? Date.now());
    end.setHours(23, 59, 59, 999);
    const all = this.store.audit();
    const labels: string[] = [];
    const cfg: number[] = [];
    const auth: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const hi = end.getTime() - i * 86400_000;
      const lo = hi - 86400_000;
      const day = all.filter((a) => a.at > lo && a.at <= hi);
      labels.push(new Date(hi).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
      auth.push(day.filter((a) => a.category === 'Authentication').length);
      cfg.push(day.length - auth.at(-1)!);
    }
    return { labels, series: [{ name: 'Configuration', color: 'var(--ka-7c3aed)', values: cfg }, { name: 'Authentication', color: 'var(--ka-94a3b8)', values: auth }] };
  });
  protected exportCsv() {
    downloadCsv('audit-log.csv', [['ID', 'Date', 'Entity', 'Action', 'Target', 'Detail', 'User', 'Category', 'Severity', 'IP'], ...this.inRange().map((a) => [a.id, fmtStamp(a.at), a.entity, a.action, a.target, a.detail, a.actor, a.category, a.severity, a.ip])]);
    this.store.toast(`${fmtN(this.inRange().length)} audit events exported`);
  }
}
