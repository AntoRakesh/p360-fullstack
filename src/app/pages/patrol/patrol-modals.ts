// Guard add/edit form, call and message modals shared by patrol pages.
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { Icon } from '../../shared/icon';
import { SelectValue } from '../../shared/select-value';
import { GuardAvatar } from './patrol-ui';
import { COMPANY_NAMES, Guard, GStatus, POSTS, PatrolStore, postByName, SHIFTS, ShiftKey } from './patrol.data';

@Component({
  selector: 'app-guard-form',
  imports: [Icon, SelectValue],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="close.emit()"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); save()">
      <div class="modal-head"><h3>{{ f().id ? 'Edit ' + f().name : 'Add Guard' }}</h3><button type="button" class="close-btn" (click)="close.emit()">×</button></div>
      <div class="form-grid">
        <label>Full name *<input class="input" required [value]="f().name ?? ''" (input)="set('name', $any($event.target).value)" /></label>
        <label>Gender<select class="select" [value]="f().gender ?? 'M'" (change)="set('gender', $any($event.target).value)"><option value="M">Male</option><option value="F">Female</option></select></label>
        <label>Security company *<select class="select" [value]="f().company ?? 'SecureTech'" (change)="set('company', $any($event.target).value)">@for (c of companies; track c) {<option [value]="c">{{ c }}</option>}</select></label>
        <label>Designation<select class="select" [value]="f().designation ?? 'Security Guard'" (change)="set('designation', $any($event.target).value)"><option>Security Guard</option><option>Senior Security Guard</option><option>Patrol Supervisor</option></select></label>
        <label>Post / location<select class="select" [value]="f().location ?? 'Main Gate'" (change)="set('location', $any($event.target).value)">@for (p of posts; track p.id) {<option [value]="p.name">{{ p.name }} ({{ p.site }})</option>}</select></label>
        <label>Shift<select class="select" [value]="f().shift ?? 'Day'" (change)="set('shift', $any($event.target).value)">@for (s of shiftKeys; track s) {<option [value]="s">{{ shifts[s].label }}</option>}</select></label>
        <label>Mobile *<input class="input" required [value]="f().mobile ?? ''" placeholder="+971 50 000 0000" (input)="set('mobile', $any($event.target).value)" /></label>
        <label>Email<input class="input" type="email" [value]="f().email ?? ''" (input)="set('email', $any($event.target).value)" /></label>
        <label>Date of birth<input class="input" type="date" [value]="f().dob ?? ''" (change)="set('dob', $any($event.target).value)" /></label>
        <label>Join date<input class="input" type="date" [value]="f().joinDate ?? '2026-10-14'" (change)="set('joinDate', $any($event.target).value)" /></label>
        <label>Nationality<input class="input" [value]="f().nationality ?? ''" (input)="set('nationality', $any($event.target).value)" /></label>
        <label>Status<select class="select" [value]="f().status ?? 'Off Duty'" (change)="set('status', $any($event.target).value)"><option>On Duty</option><option>Off Duty</option><option>On Leave</option><option>Training</option></select></label>
      </div>
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button><button class="btn-primary" type="submit"><app-icon name="p-check" [size]="15" />Save Guard</button></div>
    </form>
  `,
})
export class GuardForm implements OnInit {
  private readonly store = inject(PatrolStore);
  readonly guard = input.required<Partial<Guard>>();
  readonly close = output<void>();
  readonly saved = output<Guard>();
  protected readonly companies = COMPANY_NAMES;
  protected readonly posts = POSTS;
  protected readonly shifts = SHIFTS;
  protected readonly shiftKeys = Object.keys(SHIFTS) as ShiftKey[];
  protected readonly f = signal<Partial<Guard>>({});
  protected readonly err = signal('');
  ngOnInit() {
    this.f.set({ ...this.guard() });
  }
  protected set<K extends keyof Guard>(k: K, v: Guard[K]) {
    this.f.update((x) => ({ ...x, [k]: v }));
  }
  protected save() {
    const f = this.f();
    if (!f.name?.trim() || !f.mobile?.trim()) return this.err.set('Name and mobile number are required.');
    const p = postByName(f.location ?? 'Main Gate');
    const place = { location: p.name, site: p.site, post: p.name === 'Head Office' ? 'Head Office - Main Gate' : `${p.site} - ${p.name}` };
    if (f.id) {
      this.store.patchGuard(f.id, { ...f, ...(f.location !== this.guard().location ? place : {}) });
      return this.saved.emit(this.store.guard(f.id)!);
    }
    const g: Guard = {
      ...this.store.guards()[1], ...place, id: this.store.nextGuardId(), name: f.name.trim(), gender: f.gender ?? 'M', tone: f.name.length % 4, company: f.company ?? 'SecureTech',
      status: (f.status as GStatus) ?? 'Off Duty', shift: (f.shift as ShiftKey) ?? 'Day', mobile: f.mobile, email: f.email || `${f.name.split(' ')[0].toLowerCase()}@guard.ae`,
      designation: f.designation ?? 'Security Guard', dob: f.dob ?? '1995-01-01', joinDate: f.joinDate ?? '2026-10-14', nationality: f.nationality || 'UAE',
      certs: [], since: '-', sinceMins: 0, lastCheckin: '-', rating: 0, compliance: 0, scans: 0, response: 0, attendance: 100, incidents: 0,
    };
    this.store.addGuard(g);
    this.saved.emit(g);
  }
}

@Component({
  selector: 'app-call-modal',
  imports: [Icon, GuardAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="end()"></div>
    <div class="g-modal call">
      <app-guard-avatar [g]="guard()" [size]="84" [round]="true" />
      <h3>{{ guard().name }}</h3>
      <p class="muted">{{ guard().mobile }} · {{ via() }}</p>
      <p class="st" [class.live]="secs() > 1">{{ secs() > 1 ? 'Connected · ' + clock() : 'Calling…' }}</p>
      <div class="via">@for (v of vias; track v) {<button [class.on]="via() === v" (click)="via.set(v)">{{ v }}</button>}</div>
      <div class="btns">
        <button class="rnd" [class.on]="muted()" (click)="muted.set(!muted())" title="Mute"><app-icon name="bell" [size]="20" /></button>
        <button class="rnd red" (click)="end()" title="End call"><app-icon name="phone" [size]="22" /></button>
      </div>
    </div>
  `,
  styles: `
    .call { width: min(360px, calc(100vw - 32px)); text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    h3 { margin: 10px 0 0; } p { margin: 0; font-size: 13px; } .st { margin-top: 6px; color: #b45309; font-weight: 600; } .st.live { color: #16a34a; }
    .via { display: flex; gap: 4px; margin: 12px 0; } .via button { border: 1px solid var(--border); background: #fff; border-radius: 20px; padding: 4px 10px; font-size: 12px; cursor: pointer; } .via button.on { background: var(--primary); color: #fff; border-color: var(--primary); }
    .btns { display: flex; gap: 18px; margin-top: 6px; }
    .rnd { width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--border); background: #fff; display: grid; place-items: center; cursor: pointer; } .rnd.on { background: #eef0f5; }
    .rnd.red { background: #ef4444; border-color: #ef4444; color: #fff; } .rnd.red app-icon { transform: rotate(135deg); }
  `,
})
export class CallModal {
  private readonly store = inject(PatrolStore);
  readonly guard = input.required<Guard>();
  readonly close = output<void>();
  readonly done = output<string>();
  protected readonly vias = ['Mobile', 'Radio (Ch 4)', 'VoIP'];
  protected readonly via = signal('Mobile');
  protected readonly muted = signal(false);
  protected readonly secs = signal(0);
  protected readonly clock = computed(() => `${String(Math.floor(this.secs() / 60)).padStart(2, '0')}:${String(this.secs() % 60).padStart(2, '0')}`);
  constructor() {
    const t = setInterval(() => this.secs.update((s) => s + 1), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }
  protected end() {
    this.store.log(this.guard().id, 'Call');
    this.done.emit(`Call with ${this.guard().name} ended · ${this.clock()}`);
    this.close.emit();
  }
}

@Component({
  selector: 'app-message-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="close.emit()"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); send()">
      <div class="modal-head"><h3>Message {{ guards().length === 1 ? guards()[0].name : guards().length + ' guards' }}</h3><button type="button" class="close-btn" (click)="close.emit()">×</button></div>
      <div class="chips">@for (t of templates; track t) {<button type="button" class="chip-s" (click)="text.set(t)">{{ t }}</button>}</div>
      <textarea class="input ta" rows="4" placeholder="Type a message…" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
      <div class="ch">Send via @for (c of channels; track c) {<label><input type="checkbox" [checked]="sel().has(c)" (change)="toggle(c)" />{{ c }}</label>}</div>
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="close.emit()">Cancel</button><button class="btn-primary" type="submit" [disabled]="!text().trim() || !sel().size"><app-icon name="p-send" [size]="15" />Send</button></div>
    </form>
  `,
  styles: `
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; } .chip-s { border: 0; cursor: pointer; }
    .ta { width: 100%; height: auto; padding: 10px; resize: vertical; font: inherit; }
    .ch { display: flex; gap: 14px; align-items: center; margin-top: 10px; font-size: 12.5px; color: #4b4f6b; } .ch label { display: inline-flex; gap: 5px; align-items: center; }
  `,
})
export class MessageModal {
  private readonly store = inject(PatrolStore);
  readonly guards = input.required<Guard[]>();
  readonly close = output<void>();
  readonly done = output<string>();
  protected readonly templates = ['Report to control room immediately', 'Please complete your patrol round', 'Check-in overdue — confirm status', 'Escort visitor at Reception', 'Shift handover in 15 minutes'];
  protected readonly channels = ['App push', 'SMS', 'Radio'];
  protected readonly text = signal('');
  protected readonly sel = signal(new Set(['App push']));
  protected toggle(c: string) {
    this.sel.update((s) => {
      const n = new Set(s);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  }
  protected send() {
    this.guards().forEach((g) => this.store.log(g.id, 'Message', this.text()));
    this.done.emit(`Message sent to ${this.guards().length === 1 ? this.guards()[0].name : this.guards().length + ' guards'} via ${[...this.sel()].join(', ')}`);
    this.close.emit();
  }
}
