// "Schedule / Create Task" modal shared by the task pages.
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { hhmm, isOpen, Priority, PRIORITIES, TASK_SITES, TaskStore, workerById, WORKERS } from './tasks.data';

@Component({
  selector: 'app-task-form',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    <form class="g-modal" (submit)="$event.preventDefault(); save()">
      <div class="modal-head"><h3>{{ title() }}</h3><button type="button" class="close-btn" (click)="closed.emit()">×</button></div>
      <div class="form-grid">
        <label class="full">Task template *
          <select class="select" [value]="tplId()" (change)="tplId.set($any($event.target).value)">
            @for (t of templates(); track t.id) {<option [value]="t.id">{{ t.name }} · {{ t.category }}</option>}
          </select>
        </label>
        <label>Site<select class="select" [value]="site()" (change)="site.set($any($event.target).value)">@for (s of sites; track s) {<option [value]="s">{{ s }}</option>}</select></label>
        <label>Location / checkpoint
          <select class="select" [value]="cp()" (change)="cp.set($any($event.target).value)">
            <option value="">— Free location —</option>
            @for (c of store.checkpoints(); track c.id) {<option [value]="c.id">{{ c.name }} ({{ c.tech }})</option>}
          </select>
        </label>
        <label>Start time<input class="input" type="time" [value]="start()" (change)="start.set($any($event.target).value)" /></label>
        <label>Priority<select class="select" [value]="prio()" (change)="prio.set($any($event.target).value)">@for (p of priorities; track p) {<option [value]="p">{{ p }}</option>}</select></label>
        <label class="full">Assign to
          <select class="select" [value]="who()" (change)="who.set($any($event.target).value)">
            <option value="">Leave unassigned (queue)</option>
            <option value="auto">Auto-assign (best match)</option>
            @for (w of candidates(); track w.w.id) {<option [value]="w.w.id">{{ w.w.name }} · {{ w.w.role }} · {{ w.load }} open</option>}
          </select>
        </label>
        <label>Repeat<select class="select" [value]="repeat()" (change)="repeat.set($any($event.target).value)"><option>Once</option><option>Every 2 hours today</option><option>Every hour today</option></select></label>
        <label>Notes<input class="input" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Optional instructions" /></label>
      </div>
      @if (tpl(); as t) {
        <p class="sum">{{ t.steps.length }} checklist steps · est. {{ t.duration }} mins · SLA {{ t.slaResolve }} mins · escalates to {{ t.escL1 }}</p>
      }
      @if (err()) {<p class="bad">{{ err() }}</p>}
      <div class="form-actions"><button type="button" class="btn-ghost" (click)="closed.emit()">Cancel</button><button class="btn-primary" type="submit">Create Task</button></div>
    </form>
  `,
  styles: `.sum { margin: 12px 0 0; padding: 9px 12px; border-radius: 8px; background: var(--kb-f5f3ff); color: var(--kf-4c1d95); font-size: 12px; }`,
})
export class TaskForm implements OnInit {
  protected readonly store = inject(TaskStore);
  readonly preset = input<string>();
  readonly presetWorker = input<string>();
  readonly title = input('Schedule Task');
  readonly closed = output<void>();
  readonly created = output<string>();
  protected readonly sites = TASK_SITES;
  protected readonly priorities = PRIORITIES;
  protected readonly templates = computed(() => this.store.templates().filter((t) => t.lifecycle === 'Published' && t.status === 'Active'));
  protected readonly tplId = signal('');
  protected readonly site = signal('Head Office');
  protected readonly cp = signal('');
  protected readonly start = signal('');
  protected readonly prio = signal<Priority>('Medium');
  protected readonly who = signal('auto');
  protected readonly repeat = signal('Once');
  protected readonly note = signal('');
  protected readonly err = signal('');
  protected readonly tpl = computed(() => this.store.templates().find((t) => t.id === this.tplId()));
  protected readonly candidates = computed(() => {
    const role = this.tpl()?.applicableTo;
    const load = new Map<string, number>();
    for (const t of this.store.tasks()) if (t.assignee && isOpen(t)) load.set(t.assignee, (load.get(t.assignee) ?? 0) + 1);
    return WORKERS.filter((w) => w.status !== 'Off Duty')
      .map((w) => ({ w, load: load.get(w.id) ?? 0, fit: w.role === role ? 0 : 1 }))
      .sort((a, b) => a.fit - b.fit || a.load - b.load);
  });

  ngOnInit() {
    this.tplId.set(this.preset() ?? this.templates()[0].id);
    if (this.presetWorker()) this.who.set(this.presetWorker()!);
    const n = this.store.now() + 15;
    this.start.set(`${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`);
    this.prio.set(this.tpl()?.priority ?? 'Medium');
  }

  protected save() {
    const t = this.tpl();
    if (!t) return this.err.set('Choose a template.');
    const [h, m] = this.start().split(':').map(Number);
    if (Number.isNaN(h)) return this.err.set('Enter a start time.');
    const start = h * 60 + m;
    const cp = this.store.checkpoints().find((c) => c.id === this.cp());
    const count = this.repeat() === 'Once' ? 1 : Math.max(1, Math.floor((22 * 60 - start) / (this.repeat() === 'Every hour today' ? 60 : 120)));
    const step = this.repeat() === 'Every hour today' ? 60 : 120;
    let last = '';
    for (let i = 0; i < count; i++) {
      const assignee = this.who() === 'auto' ? this.candidates()[0].w.id : this.who() || null;
      const task = this.store.addTask(t, {
        site: this.site(), location: cp?.name ?? 'Floor 1', checkpointId: cp?.id ?? null, start: start + i * step, due: start + i * step + t.slaResolve,
        priority: this.prio(), assignee, status: assignee ? 'Pending' : 'Unassigned', note: this.note() || undefined, source: 'Manual',
      });
      last = task.id;
    }
    const w = workerById(this.who() === 'auto' ? this.candidates()[0].w.id : this.who());
    this.created.emit(count > 1 ? `${count} tasks scheduled from ${hhmm(start)}` : `${last} scheduled at ${hhmm(start)}${w ? ' for ' + w.name : ' · added to unassigned queue'}`);
    this.closed.emit();
  }
}
