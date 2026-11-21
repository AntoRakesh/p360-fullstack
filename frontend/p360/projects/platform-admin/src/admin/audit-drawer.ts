import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Icon } from '@p360/shared/icon';
import { AdminStore, AuditEntry, fmtStamp } from './admin.data';
import { auditIcon } from './admin-ui';

/** Side drawer with the full audit record (before / after diff, actor, IP, related events). */
@Component({
  selector: 'app-admin-audit-drawer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    <aside class="g-drawer wide">
      @let e = entry();
      @let ic = icon();
      <div class="hd">
        <span class="ic" [style.background]="ic.bg" [style.color]="ic.color"><app-icon [name]="ic.icon" [size]="20" /></span>
        <div><h3>{{ e.entity }} {{ e.action }}</h3><small class="muted">{{ e.id }} · {{ stamp(e.at) }}</small></div>
        <button class="close-btn" (click)="closed.emit()">×</button>
      </div>
      <dl class="facts">
        <dt>Target</dt><dd>{{ e.target }}</dd>
        <dt>Details</dt><dd>{{ e.detail }}</dd>
        <dt>Performed by</dt><dd><span class="av" [style.background]="e.color">{{ e.initials }}</span>{{ e.actor }}</dd>
        <dt>Category</dt><dd>{{ e.category }}</dd>
        <dt>Severity</dt><dd><span [class]="e.severity === 'Critical' ? 'tag red' : e.severity === 'Warning' ? 'tag amber' : 'tag blue'">{{ e.severity }}</span></dd>
        <dt>IP address</dt><dd>{{ e.ip }}</dd>
        <dt>Client</dt><dd>{{ e.category === 'Authentication' ? 'People360 Mobile 4.8 (iOS)' : 'Chrome 141 · Windows 11' }}</dd>
      </dl>
      @if (e.before || e.after) {
        <h4>Changes</h4>
        <div class="diff">
          <div><b>Before</b><pre class="old">{{ e.before || '—' }}</pre></div>
          <div><b>After</b><pre class="new">{{ e.after || '—' }}</pre></div>
        </div>
      }
      <h4>Related events</h4>
      <ul class="rel">
        @for (r of related(); track r.id) {
          <li><span class="dot" [style.background]="r.color"></span><div><b>{{ r.entity }} {{ r.action }}</b> · {{ r.target }}<small>{{ stamp(r.at) }} · {{ r.actor }}</small></div></li>
        } @empty {<li class="muted">No other events for this target.</li>}
      </ul>
      <div class="form-actions">
        <button class="btn-ghost" (click)="copy()"><app-icon name="admin-copy" [size]="14" />Copy JSON</button>
        <button class="btn-primary" (click)="closed.emit()">Close</button>
      </div>
    </aside>
  `,
  styles: `
    .hd { display: grid; grid-template-columns: 42px 1fr auto; gap: 12px; align-items: center; margin-bottom: 16px; } .hd div { display: flex; flex-direction: column; }
    .ic { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; }
    .facts { display: grid; grid-template-columns: 120px 1fr; gap: 9px 12px; font-size: 12.5px; margin: 0 0 16px; } .facts dt { color: var(--muted); } .facts dd { margin: 0; display: flex; align-items: center; gap: 6px; }
    .av { width: 22px; height: 22px; border-radius: 50%; color: var(--kf-ffffff); font-size: 9.5px; font-weight: 700; display: grid; place-items: center; }
    h4 { margin: 14px 0 8px; font-size: 13px; }
    .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; } pre { margin: 4px 0 0; padding: 8px; border-radius: 8px; white-space: pre-wrap; font-size: 11.5px; min-height: 40px; }
    .old { background: var(--kb-fef2f2); color: var(--kf-991b1b); } .new { background: var(--kb-f0fdf4); color: var(--kf-166534); }
    .rel { list-style: none; margin: 0; padding: 0; font-size: 12.5px; } .rel li { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--kl-f0f1f6); } .rel div { display: flex; flex-direction: column; } .rel small { color: var(--muted); }
    .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
  `,
})
export class AuditDrawer {
  private readonly store = inject(AdminStore);
  readonly entry = input.required<AuditEntry>();
  readonly closed = output<void>();
  protected readonly stamp = fmtStamp;
  protected readonly icon = computed(() => auditIcon(this.entry().entity));
  protected readonly related = computed(() => this.store.audit().filter((a) => a.target === this.entry().target && a.id !== this.entry().id).slice(0, 6));
  protected copy() {
    navigator.clipboard?.writeText(JSON.stringify(this.entry(), null, 2)).catch(() => {});
    this.store.toast('Audit record copied to clipboard');
  }
}
