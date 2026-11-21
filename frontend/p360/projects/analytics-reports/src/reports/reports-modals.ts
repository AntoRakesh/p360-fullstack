// Schedule + Share modals shared by the Reports & Analytics pages (write to ReportsStore).
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { Report, ReportsStore, ROLES, Schedule, Share, TODAY } from './reports.data';

@Component({
  selector: 'rpt-schedule-modal',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit('')"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); save()">
      <div class="modal-head"><h3>Schedule · {{ report()?.name ?? 'Report' }}</h3><button type="button" class="close-btn" (click)="closed.emit('')">×</button></div>
      <div class="form-grid">
        @if (!report()) {
          <label class="full">Report *<select class="select" [value]="reportId()" (change)="reportId.set($any($event.target).value)">
            @for (r of store.reports(); track r.id) {<option [value]="r.id">{{ r.name }}</option>}</select></label>
        }
        <label>Frequency<select class="select" [value]="freq()" (change)="freq.set($any($event.target).value)">@for (f of freqs; track f) {<option [value]="f">{{ f }}</option>}</select></label>
        <label>Delivery time<input class="input" type="time" [value]="time()" (change)="time.set($any($event.target).value)" /></label>
        @if (freq() === 'Weekly') {
          <label>Day of week<select class="select" [value]="day()" (change)="day.set($any($event.target).value)">@for (d of days; track d) {<option [value]="d">{{ d }}</option>}</select></label>
        }
        <label>Format<select class="select" [value]="format()" (change)="format.set($any($event.target).value)"><option>PDF</option><option>Excel</option><option>CSV</option></select></label>
        <label>Starts on<input class="input" type="date" [value]="start()" (change)="start.set($any($event.target).value)" /></label>
        <label class="full">Recipients (comma separated) *<input class="input" [value]="recipients()" (input)="recipients.set($any($event.target).value)" placeholder="name@people360.com, team@people360.com" /></label>
      </div>
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="closed.emit('')">Cancel</button><button class="btn-primary" type="submit"><app-icon name="calendar-days" [size]="15" />Save Schedule</button></div>
    </form>
  `,
})
export class ScheduleModal {
  protected readonly store = inject(ReportsStore);
  readonly report = input<Report | null>(null);
  readonly closed = output<string>();
  protected readonly freqs = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];
  protected readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly reportId = signal('RPT-1001');
  protected readonly freq = signal<Schedule['frequency']>('Weekly');
  protected readonly time = signal('08:00');
  protected readonly day = signal('Mon');
  protected readonly format = signal<Schedule['format']>('PDF');
  protected readonly start = signal(TODAY);
  protected readonly recipients = signal('facilities@people360.com');
  protected readonly err = signal('');
  protected save() {
    const list = this.recipients().split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.length) return this.err.set('Add at least one recipient.');
    if (list.some((x) => !/^\S+@\S+\.\S+$/.test(x))) return this.err.set('Recipients must be valid email addresses.');
    const id = this.report()?.id ?? this.reportId();
    const f = this.freq();
    this.store.addSchedule({
      reportId: id,
      frequency: f,
      time: this.time(),
      day: f === 'Weekly' ? this.day() : f === 'Daily' ? 'Every day' : f === 'Monthly' ? '1st of month' : '1st of quarter',
      format: this.format(),
      recipients: list,
      next: `${this.start()}T${this.time()}`,
      active: true,
    });
    this.closed.emit(`${this.store.byId().get(id)?.name} scheduled ${f.toLowerCase()} at ${this.time()} → ${list.length} recipient${list.length > 1 ? 's' : ''}`);
  }
}

@Component({
  selector: 'rpt-share-modal',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit('')"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); save()">
      <div class="modal-head"><h3>Share · {{ report().name }}</h3><button type="button" class="close-btn" (click)="closed.emit('')">×</button></div>
      <div class="kinds">@for (k of kinds; track k) {<button type="button" [class.on]="kind() === k" (click)="kind.set(k)">{{ k }}</button>}</div>
      <div class="form-grid">
        @switch (kind()) {
          @case ('Role') {<label class="full">Role<select class="select" [value]="who()" (change)="who.set($any($event.target).value)">@for (r of roles; track r) {<option [value]="r">{{ r }}</option>}</select></label>}
          @case ('Link') {<label class="full">Shareable link<div class="lnk"><input class="input" readonly [value]="link()" /><button type="button" class="btn-ghost" (click)="copy()"><app-icon name="reports-copy" [size]="14" />Copy</button></div></label>}
          @default {<label class="full">{{ kind() === 'User' ? 'Person (name or email)' : 'External email' }} *<input class="input" [value]="who()" (input)="who.set($any($event.target).value)" [placeholder]="kind() === 'User' ? 'e.g. Priya Nair' : 'auditor@firm.com'" /></label>}
        }
        <label>Permission<select class="select" [value]="perm()" (change)="perm.set($any($event.target).value)"><option>View</option><option>Run</option><option>Edit</option></select></label>
        <label>Expires<select class="select" [value]="exp()" (change)="exp.set($any($event.target).value)"><option value="Never">Never</option><option value="2026-10-21">In 7 days</option><option value="2026-11-13">In 30 days</option></select></label>
      </div>
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="closed.emit('')">Cancel</button><button class="btn-primary" type="submit"><app-icon name="reports-share" [size]="15" />Share</button></div>
    </form>
  `,
  styles: `
    .kinds { display: flex; gap: 6px; margin-bottom: 14px; } .kinds button { border: 1px solid var(--border); background: var(--kb-ffffff); border-radius: 8px; padding: 6px 14px; font-size: 12.5px; cursor: pointer; }
    .kinds button.on { background: var(--primary); color: var(--kf-ffffff); border-color: var(--primary); }
    .lnk { display: flex; gap: 6px; } .lnk input { flex: 1; }
  `,
})
export class ShareModal {
  private readonly store = inject(ReportsStore);
  readonly report = input.required<Report>();
  readonly closed = output<string>();
  protected readonly roles = ROLES;
  protected readonly kinds: Share['kind'][] = ['User', 'Role', 'Link', 'External'];
  protected readonly kind = signal<Share['kind']>('User');
  protected readonly who = signal('');
  protected readonly perm = signal<Share['permission']>('View');
  protected readonly exp = signal('Never');
  protected readonly err = signal('');
  protected link() {
    return `https://people360.app/r/${this.report().id.toLowerCase()}-${(this.report().name.length * 7919).toString(36)}`;
  }
  protected copy() {
    navigator.clipboard?.writeText(this.link()).catch(() => undefined);
  }
  protected save() {
    const k = this.kind();
    const w = k === 'Link' ? 'Public link' : k === 'Role' ? this.who() || ROLES[0] : this.who().trim();
    if (!w) return this.err.set('Enter who to share with.');
    if (k === 'External' && !/^\S+@\S+\.\S+$/.test(w)) return this.err.set('Enter a valid email address.');
    this.store.addShare({ reportId: this.report().id, with: w, kind: k, permission: this.perm(), expires: this.exp() });
    if (k === 'Link') this.copy();
    this.closed.emit(k === 'Link' ? 'Share link created and copied to clipboard' : `${this.report().name} shared with ${w} (${this.perm()})`);
  }
}
