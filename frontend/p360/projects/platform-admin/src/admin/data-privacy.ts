import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { AdminStore, CONSENTS, Dsar, fmtDay, fmtN, RETENTION_OPTIONS, RetentionPolicy } from './admin.data';
import { ADMIN_CSS, AdminSwitch, AdminToast } from './admin-ui';

const STEPS: Dsar['status'][] = ['New', 'Verifying', 'In Progress', 'Completed'];

@Component({
  selector: 'app-admin-data-privacy',
  imports: [...UI, AdminSwitch, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Data &amp; Privacy" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Retention policies, data subject requests, consent, masking of personal data and encryption.">
      <button class="btn-primary" (click)="openDsar()"><app-icon name="plus" [size]="16" />Log Data Request</button>
      <button class="btn-ghost" (click)="purge()" [disabled]="purging()"><app-icon name="admin-trash" [size]="16" />{{ purging() ? 'Running purge…' : 'Run retention purge' }}</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Open Data Requests" [value]="open()" icon="shield" color="var(--ka-7c3aed)" [sub]="overdue() ? overdue() + ' overdue' : 'all within 30-day SLA'" [subColor]="overdue() ? 'var(--ka-dc2626)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Retention Policies" [value]="store.retention().length" icon="admin-database" color="var(--ka-f43f5e)" [sub]="'default ' + store.tenant().retentionDays + ' days'" />
      <app-kpi label="Records Under Policy" [value]="short(records())" icon="list-checks" color="var(--ka-2563eb)" [sub]="holds() + ' on legal hold'" />
      <app-kpi label="Biometric Consent" [value]="pct(1104) + '%'" icon="fingerprint" color="var(--ka-10b981)" [sub]="'1,104 of ' + fmt(store.users().length) + ' users'" />
      <app-kpi label="Masked PII Fields" [value]="masked() + ' / ' + store.pii().length" icon="admin-eye-off" color="var(--ka-f59e0b)" sub="role-based reveal" />
    </section>

    <section class="split">
      <div class="card">
        <div class="ch"><h3>Retention Policies</h3><span class="muted">"Default" follows tenant setting ({{ store.tenant().retentionDays }} days)</span></div>
        <table class="table">
          <thead><tr><th>Data category</th><th>Module</th><th>Retention</th><th>Action</th><th class="num">Records</th><th>Legal hold</th></tr></thead>
          <tbody>
            @for (r of store.retention(); track r.id) {
              <tr>
                <td><b>{{ r.category }}</b><div class="muted">{{ r.basis }}</div></td><td>{{ r.module }}</td>
                <td><select class="select sm" [value]="String(r.days)" (change)="setDays(r, $any($event.target).value)"><option value="Default">Default ({{ store.tenant().retentionDays }})</option>@for (o of opts; track o) {<option [value]="String(o)">{{ o }} days</option>}</select></td>
                <td><select class="select sm" [value]="r.action" (change)="patch(r, { action: $any($event.target).value }, 'action')"><option>Delete</option><option>Anonymize</option><option>Archive</option></select></td>
                <td class="num">{{ fmt(r.records) }}</td>
                <td><app-admin-switch [on]="r.legalHold" (toggled)="patch(r, { legalHold: $event }, 'legal hold')" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3 class="ct">Consent</h3>
        <ul class="cons">@for (c of consents; track c.label) {<li><span>{{ c.label }}</span><b>{{ pct(c.given) }}%</b><div class="bar"><i [style.width.%]="pct(c.given)" [style.background]="c.color"></i></div></li>}</ul>
        <h4>Protection</h4>
        @let p = store.privacy();
        <dl class="kv"><dt>Encryption at rest</dt><dd>{{ p.encryptionAtRest }}</dd><dt>In transit</dt><dd>{{ p.inTransit }}</dd><dt>Key last rotated</dt><dd>{{ fmtDay(p.keyRotated) }}</dd><dt>Data residency</dt><dd>{{ p.residency }}</dd><dt>DPO</dt><dd>{{ p.dpo }}</dd></dl>
        <ul class="pol">
          <li><div><b>Anonymize exports</b><small>Strip IDs from report exports</small></div><app-admin-switch [on]="p.anonymizeExports" (toggled)="priv('anonymizeExports', $event)" /></li>
          <li><div><b>Consent banner on kiosks</b><small>Visitor & contractor check-in</small></div><app-admin-switch [on]="p.consentBanner" (toggled)="priv('consentBanner', $event)" /></li>
        </ul>
        <button class="btn-outline" (click)="rotate()"><app-icon name="key-round" [size]="14" />Rotate encryption key</button>
      </div>
    </section>

    <section class="split">
      <div class="card">
        <div class="ch"><h3>Data Subject Requests</h3><div class="seg">@for (f of ['Open', 'Completed', 'All']; track f) {<button [class.on]="dFilter() === f" (click)="dFilter.set(f)">{{ f }}</button>}</div></div>
        <table class="table">
          <thead><tr><th>Request</th><th>Type</th><th>Requester</th><th>Received</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            @for (d of dsars(); track d.id) {
              <tr class="clickable" [class.selected]="dSel() === d.id" (click)="dSel.set(d.id)">
                <td><b>{{ d.id }}</b></td><td>{{ d.type }}</td><td>{{ d.requester }}<div class="muted">{{ d.kind }}</div></td><td>{{ fmtDay(d.received) }}</td>
                <td [class.bad]="isOverdue(d)">{{ fmtDay(d.due) }}</td><td><span [class]="tag(d.status)">{{ d.status }}</span></td>
              </tr>
            } @empty {<tr><td colspan="6" class="empty-note">No requests</td></tr>}
          </tbody>
        </table>
      </div>
      @if (dsar(); as d) {
        <aside class="card">
          <div class="dh"><span class="ri" style="background:var(--kb-cffafe);color:var(--kf-0891b2)"><app-icon name="shield" [size]="18" /></span><div><h3>{{ d.id }} · {{ d.type }}</h3><small class="muted">{{ d.requester }} · {{ d.email }}</small></div></div>
          <ol class="steps">@for (s of steps; track s; let i = $index) {<li [class.done]="stepIdx(d) >= i" [class.rej]="d.status === 'Rejected'">{{ s }}</li>}</ol>
          <p class="d">{{ d.note }}</p>
          <dl class="kv"><dt>Systems</dt><dd>{{ d.systems.join(', ') }}</dd><dt>Assignee</dt><dd>{{ d.assignee }}</dd><dt>Due</dt><dd>{{ fmtDay(d.due) }} ({{ daysLeft(d) }})</dd></dl>
          @if (d.status !== 'Completed' && d.status !== 'Rejected') {
            <div class="toolbar">
              <button class="btn-primary" (click)="advance(d)">{{ d.status === 'In Progress' ? 'Complete & notify' : d.status === 'New' ? 'Start verification' : 'Identity verified' }}</button>
              <button class="btn-ghost" (click)="store.toast('Data package for ' + d.requester + ' compiled: ' + d.systems.length + ' systems, 214 records')">Compile data</button>
              <button class="btn-ghost danger" (click)="setStatus(d, 'Rejected', 'Rejected')">Reject</button>
            </div>
          }
        </aside>
      }
    </section>

    <div class="card">
      <h3 class="ct">Personal Data Masking</h3>
      <table class="table">
        <thead><tr><th>Field</th><th>Shown as</th><th>Who can reveal</th><th>Masked</th></tr></thead>
        <tbody>@for (f of store.pii(); track f.id) {<tr><td><b>{{ f.label }}</b></td><td class="mono">{{ f.masked ? mask(f.sample) : f.sample }}</td><td>{{ f.roles }}</td><td><app-admin-switch [on]="f.masked" (toggled)="maskField(f.id, f.label, $event)" /></td></tr>}</tbody>
      </table>
    </div>

    @if (newDsar(); as n) {
      <div class="g-overlay" (click)="newDsar.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); saveDsar()">
        <div class="modal-head"><h3>Log data subject request</h3><button type="button" class="close-btn" (click)="newDsar.set(null)">×</button></div>
        <div class="form-grid">
          <label>Requester name *<input class="input" [value]="n.requester" (input)="newDsar.set({ ...n, requester: $any($event.target).value })" /></label>
          <label>Requester type<select class="select" [value]="n.kind" (change)="newDsar.set({ ...n, kind: $any($event.target).value })"><option>Employee</option><option>Visitor</option><option>Contractor</option><option>Ex-employee</option></select></label>
          <label>Request type<select class="select" [value]="n.type" (change)="newDsar.set({ ...n, type: $any($event.target).value })"><option>Access</option><option>Erasure</option><option>Rectification</option><option>Portability</option><option>Restriction</option></select></label>
          <label>Assignee<select class="select" [value]="n.assignee" (change)="newDsar.set({ ...n, assignee: $any($event.target).value })"><option>Priya Nair</option><option>Sara Ahmed</option><option>Omar Khalid</option></select></label>
          <label class="full">Details<input class="input" [value]="n.note" (input)="newDsar.set({ ...n, note: $any($event.target).value })" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="newDsar.set(null)">Cancel</button><button class="btn-primary" type="submit">Log request</button></div>
      </form>
    }
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .select.sm { padding-top: 4px; padding-bottom: 4px; font-size: 12px; }
    .cons { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; } .cons li { display: grid; grid-template-columns: 1fr auto; gap: 4px; font-size: 12.5px; } .cons .bar { grid-column: 1 / -1; }
    .steps { display: flex; list-style: none; padding: 0; margin: 0 0 12px; gap: 4px; } .steps li { flex: 1; text-align: center; font-size: 11px; padding: 6px 2px; border-radius: 6px; background: var(--kb-f1f2f6); color: var(--muted); }
    .steps li.done { background: var(--kb-ede9fe); color: var(--primary); font-weight: 600; } .steps li.rej { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .d { font-size: 12.5px; } td.bad { color: var(--red); font-weight: 600; } .mono { font-family: ui-monospace, monospace; }
  `],
})
export class DataPrivacy {
  protected readonly store = inject(AdminStore);
  protected readonly fmt = fmtN;
  protected readonly fmtDay = fmtDay;
  protected readonly String = String;
  protected readonly opts = RETENTION_OPTIONS;
  protected readonly consents = CONSENTS;
  protected readonly steps = STEPS;
  protected readonly dFilter = signal('Open');
  protected readonly dSel = signal('DSR-2026-041');
  protected readonly purging = signal(false);
  protected readonly newDsar = signal<{ requester: string; kind: Dsar['kind']; type: Dsar['type']; assignee: string; note: string } | null>(null);

  protected readonly open = computed(() => this.store.dsars().filter((d) => d.status !== 'Completed' && d.status !== 'Rejected').length);
  protected readonly overdue = computed(() => this.store.dsars().filter((d) => this.isOverdue(d)).length);
  protected readonly records = computed(() => this.store.retention().reduce((a, r) => a + r.records, 0));
  protected readonly holds = computed(() => this.store.retention().filter((r) => r.legalHold).length);
  protected readonly masked = computed(() => this.store.pii().filter((f) => f.masked).length);
  protected readonly dsars = computed(() => this.store.dsars().filter((d) => this.dFilter() === 'All' || (this.dFilter() === 'Open' ? !['Completed', 'Rejected'].includes(d.status) : ['Completed', 'Rejected'].includes(d.status))));
  protected readonly dsar = computed(() => this.store.dsars().find((d) => d.id === this.dSel()));
  protected pct(n: number) {
    return Math.round((n / this.store.users().length) * 100);
  }
  protected short(n: number) {
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : fmtN(n);
  }
  protected isOverdue(d: Dsar) {
    return !['Completed', 'Rejected'].includes(d.status) && new Date(d.due).getTime() < Date.now();
  }
  protected daysLeft(d: Dsar) {
    const n = Math.ceil((new Date(d.due).getTime() - Date.now()) / 86400_000);
    return n < 0 ? `${-n} days overdue` : `${n} days left`;
  }
  protected tag(s: string) {
    return s === 'Completed' ? 'tag green' : s === 'Rejected' ? 'tag red' : s === 'New' ? 'tag blue' : 'tag amber';
  }
  protected stepIdx(d: Dsar) {
    return d.status === 'Rejected' ? 3 : STEPS.indexOf(d.status);
  }
  protected mask(s: string) {
    return s.replace(/[A-Za-z0-9]/g, (c, i) => (i < 2 || i > s.length - 3 ? c : '•'));
  }
  protected setDays(r: RetentionPolicy, v: string) {
    this.patch(r, { days: v === 'Default' ? 'Default' : +v }, 'retention');
  }
  protected patch(r: RetentionPolicy, ch: Partial<RetentionPolicy>, what: string) {
    this.store.retention.update((l) => l.map((x) => (x.id === r.id ? { ...x, ...ch } : x)));
    this.store.log('Updated', 'Retention Policy', r.category, `${what} → ${Object.values(ch)[0]}`, 'Data & Privacy', 'Warning');
    this.store.toast(`${r.category}: ${what} updated`);
  }
  protected priv(k: string, v: boolean) {
    this.store.privacy.update((p) => ({ ...p, [k]: v }));
    this.store.toast('Privacy setting updated');
  }
  protected rotate() {
    if (!confirm('Rotate the customer-managed encryption key now? Re-encryption runs in the background.')) return;
    this.store.privacy.update((p) => ({ ...p, keyRotated: new Date().toISOString().slice(0, 10) }));
    this.store.log('Updated', 'Retention Policy', 'Encryption key', 'Customer-managed key rotated', 'Security', 'Warning');
    this.store.toast('Encryption key rotated · re-encryption scheduled');
  }
  protected maskField(id: string, label: string, v: boolean) {
    this.store.pii.update((l) => l.map((f) => (f.id === id ? { ...f, masked: v } : f)));
    this.store.log('Updated', 'Retention Policy', label, v ? 'Field masked' : 'Field unmasked', 'Data & Privacy', v ? 'Info' : 'Warning');
    this.store.toast(`${label} ${v ? 'masked' : 'shown in clear'}`);
  }
  protected purge() {
    this.purging.set(true);
    setTimeout(() => {
      let n = 0;
      this.store.retention.update((l) => l.map((r) => {
        if (r.legalHold) return r;
        const cut = Math.round(r.records * 0.012);
        n += cut;
        return { ...r, records: r.records - cut };
      }));
      this.purging.set(false);
      this.store.log('Completed', 'Retention Policy', 'Retention purge', `${fmtN(n)} records deleted/anonymized; ${this.holds()} categories skipped (legal hold)`, 'Data & Privacy', 'Warning');
      this.store.toast(`Purge complete · ${fmtN(n)} records processed, ${this.holds()} on legal hold skipped`);
    }, 1500);
  }
  protected setStatus(d: Dsar, status: Dsar['status'], what: string) {
    this.store.dsars.update((l) => l.map((x) => (x.id === d.id ? { ...x, status } : x)));
    this.store.log(status === 'Completed' ? 'Completed' : 'Updated', 'Data Request', `${d.id} (${d.requester})`, what, 'Data & Privacy');
    this.store.toast(`${d.id}: ${what}`);
  }
  protected advance(d: Dsar) {
    const next = STEPS[STEPS.indexOf(d.status) + 1];
    this.setStatus(d, next, next === 'Completed' ? `Completed · ${d.requester} notified` : `Moved to ${next}`);
  }
  protected openDsar() {
    this.newDsar.set({ requester: '', kind: 'Visitor', type: 'Access', assignee: 'Priya Nair', note: '' });
  }
  protected saveDsar() {
    const n = this.newDsar()!;
    if (!n.requester.trim()) return this.store.toast('Requester name is required');
    const today = new Date();
    const due = new Date(today.getTime() + 30 * 86400_000);
    const id = `DSR-2026-${String(42 + this.store.dsars().length - 9).padStart(3, '0')}`;
    const d: Dsar = { id, type: n.type, requester: n.requester, email: n.requester.toLowerCase().replace(/ /g, '.') + '@mail.com', kind: n.kind, received: today.toISOString().slice(0, 10), due: due.toISOString().slice(0, 10), status: 'New', assignee: n.assignee, systems: ['People & Identity', 'Visitor Management'], note: n.note || 'Logged by administrator' };
    this.store.dsars.update((l) => [d, ...l]);
    this.store.log('Created', 'Data Request', `${id} (${n.requester})`, `${n.type} request logged`, 'Data & Privacy');
    this.newDsar.set(null);
    this.dFilter.set('Open');
    this.dSel.set(id);
    this.store.toast(`${id} logged · due ${fmtDay(d.due)}`);
  }
}
