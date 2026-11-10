// Task detail drawer (checklist, evidence, actions) shared by task pages.
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { catMeta, hhmm, isOpen, prioCls, statusCls, TaskStore, workerById, WORKERS } from './tasks.data';

@Component({
  selector: 'app-task-drawer',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-overlay" (click)="closed.emit()"></div>
    @if (task(); as t) {
      <aside class="g-drawer wide">
        <div class="hd">
          <span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="20" /></span>
          <div><h3>{{ t.title }}</h3><small>{{ t.id }} · {{ t.category }} · {{ t.source }}</small></div>
          <button class="close-btn" (click)="closed.emit()">×</button>
        </div>
        <div class="tags"><span [class]="statusCls(t.status)">{{ t.status }}</span><span [class]="prioCls(t.priority)">{{ t.priority }}</span>
          @if (overdue()) {<span class="tag red">Overdue {{ store.now() - t.due }} min</span>} @else if (isOpen(t)) {<span class="tag grey">SLA {{ t.due - store.now() }} min left</span>}
          @if (t.escalation) {<span class="tag red">Escalated L{{ t.escalation }}</span>}
        </div>
        <dl>
          <dt>Assignee</dt><dd>
            <select class="select" [value]="t.assignee ?? ''" (change)="reassign($any($event.target).value)">
              <option value="" disabled>Unassigned</option>
              @for (w of workers; track w.id) {<option [value]="w.id">{{ w.name }} · {{ w.role }}</option>}
            </select>
          </dd>
          <dt>Location</dt><dd>{{ t.site }} · {{ t.location }}</dd>
          <dt>Window</dt><dd>{{ hhmm(t.start) }} – {{ hhmm(t.due) }}</dd>
          <dt>Started</dt><dd>{{ t.startedAt != null ? hhmm(t.startedAt) : '—' }}</dd>
          <dt>Completed</dt><dd>{{ t.completedAt != null ? hhmm(t.completedAt) : '—' }}</dd>
          @if (t.verifiedBy) {<dt>Verified by</dt><dd>{{ t.verifiedBy }}@if (t.rating) { · {{ t.rating }}★}</dd>}
          @if (t.note) {<dt>Note</dt><dd>{{ t.note }}</dd>}
        </dl>
        <h4>Checklist <small>{{ t.stepsDone }}/{{ t.steps }}</small></h4>
        <div class="bar"><i [style.width.%]="(t.stepsDone / t.steps) * 100"></i></div>
        <ul class="cl">
          @for (s of steps(); track $index; let i = $index) {
            <li [class.done]="i < t.stepsDone"><button [disabled]="!isOpen(t)" (click)="toggleStep(i)"><app-icon [name]="i < t.stepsDone ? 'tasks-check' : 'minus'" [size]="12" [stroke]="3" /></button>{{ s.text }}@if (s.photo) {<app-icon name="tasks-camera" [size]="13" class="ph" />}</li>
          }
        </ul>
        <h4>Evidence <small>{{ t.photos }} photo{{ t.photos === 1 ? '' : 's' }}</small></h4>
        <div class="ev">
          @for (p of photoArr(); track $index) {<div class="pic" [style.background]="pal[$index % 4]"><app-icon name="tasks-image" [size]="18" /><small>{{ hhmm((t.startedAt ?? t.start) + 4 + $index * 6) }}</small></div>}
          @if (isOpen(t)) {<button class="pic add" (click)="addPhoto()"><app-icon name="tasks-camera" [size]="18" /><small>Add</small></button>}
        </div>
        <div class="acts">
          @if (t.status === 'Pending' || t.status === 'Unassigned') {<button class="btn-primary" [disabled]="!t.assignee" (click)="store.start(t.id, who())"><app-icon name="play" [size]="14" />Start Task</button>}
          @if (t.status === 'In Progress') {<button class="btn-primary" (click)="store.complete(t.id, who())"><app-icon name="tasks-check" [size]="14" />Mark Complete</button>}
          @if (t.status === 'Completed') {<button class="btn-primary" (click)="go()"><app-icon name="file-check" [size]="14" />Verify</button>}
          @if (t.status === 'Rejected') {<button class="btn-primary" (click)="store.rework(t.id)"><app-icon name="refresh" [size]="14" />Re-open for rework</button>}
          @if (isOpen(t)) {
            <button class="btn-ghost" (click)="store.escalate(t.id)" [disabled]="t.escalation >= 2"><app-icon name="tasks-escalate" [size]="14" />Escalate</button>
            <button class="btn-ghost" (click)="store.extend(t.id, 15)"><app-icon name="clock" [size]="14" />+15 min</button>
          }
        </div>
        <h4>Activity</h4>
        <ul class="act">
          @for (e of log(); track $index) {<li><app-icon [name]="e.icon" [size]="13" [style.color]="e.color" /><span>{{ e.text }}<small>{{ e.who }} · {{ hhmm(e.at) }}</small></span></li>}
          <li><app-icon name="plus" [size]="13" style="color:var(--kf-7c3aed)" /><span>Task created from template<small>{{ t.source }} · {{ hhmm(t.start - 30) }}</small></span></li>
        </ul>
      </aside>
    }
  `,
  styles: `
    .hd { display: grid; grid-template-columns: 42px 1fr auto; gap: 12px; align-items: center; } .hd h3 { font-size: 17px; } .hd small { color: var(--muted); font-size: 12px; }
    .ci { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
    dl { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 12.5px; margin: 0 0 6px; align-items: center; } dt { color: var(--muted); } dd { margin: 0; } dd .select { width: 100%; }
    h4 { margin: 16px 0 8px; font-size: 13px; display: flex; justify-content: space-between; } h4 small { color: var(--muted); font-weight: 500; }
    .bar { height: 6px; border-radius: 4px; background: var(--kb-eef0f5); overflow: hidden; margin-bottom: 8px; } .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--kb-7c3aed), var(--kb-3b82f6)); transition: width 0.3s; }
    .cl { list-style: none; margin: 0; padding: 0; } .cl li { display: flex; align-items: center; gap: 9px; padding: 6px 0; font-size: 12.5px; border-bottom: 1px dashed var(--kl-eef0f5); }
    .cl button { width: 20px; height: 20px; border-radius: 5px; border: 1.5px solid var(--kl-c9cdd8); background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; color: transparent; padding: 0; }
    .cl li.done button { background: var(--kb-22c55e); border-color: var(--kl-22c55e); color: var(--kf-ffffff); } .cl li.done { color: var(--muted); text-decoration: line-through; } .ph { color: var(--primary); margin-left: auto; }
    .ev { display: flex; gap: 8px; flex-wrap: wrap; }
    .pic { width: 70px; height: 56px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--kf-ffffff); border: 0; } .pic small { font-size: 9.5px; opacity: 0.9; }
    .pic.add { background: var(--kb-ffffff); border: 1.5px dashed var(--kl-c4b5fd); color: var(--primary); cursor: pointer; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
    .act { list-style: none; margin: 0; padding: 0; } .act li { display: flex; gap: 8px; padding: 6px 0; font-size: 12px; } .act span { display: flex; flex-direction: column; } .act small { color: var(--muted); font-size: 11px; }
  `,
})
export class TaskDrawer {
  protected readonly store = inject(TaskStore);
  private readonly router = inject(Router);
  readonly taskId = input.required<string>();
  readonly closed = output<void>();
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly statusCls = statusCls;
  protected readonly prioCls = prioCls;
  protected readonly isOpen = isOpen;
  protected readonly workers = WORKERS;
  protected readonly pal = ['linear-gradient(135deg,var(--ka-64748b),var(--ka-94a3b8))', 'linear-gradient(135deg,var(--ka-0d9488),var(--ka-5eead4))', 'linear-gradient(135deg,var(--ka-7c3aed),var(--ka-c4b5fd))', 'linear-gradient(135deg,var(--ka-b45309),var(--ka-fcd34d))'];
  protected readonly task = computed(() => this.store.tasks().find((t) => t.id === this.taskId()) ?? null);
  protected readonly steps = computed(() => this.store.templates().find((t) => t.id === this.task()?.templateId)?.steps ?? []);
  protected readonly overdue = computed(() => {
    const t = this.task();
    return !!t && isOpen(t) && t.due < this.store.now();
  });
  protected readonly photoArr = computed(() => Array.from({ length: this.task()?.photos ?? 0 }));
  protected readonly log = computed(() => {
    const t = this.task();
    return t ? this.store.events().filter((e) => e.text.startsWith(t.title)).slice(0, 5) : [];
  });
  protected who() {
    return workerById(this.task()?.assignee ?? null)?.name ?? 'Supervisor';
  }
  protected toggleStep(i: number) {
    const t = this.task()!;
    const stepsDone = i < t.stepsDone ? i : i + 1;
    this.store.patchTask(t.id, { stepsDone, status: t.status === 'Pending' && stepsDone ? 'In Progress' : t.status, startedAt: t.startedAt ?? this.store.now() });
    if (stepsDone === t.steps) this.store.complete(t.id, this.who());
  }
  protected addPhoto() {
    const t = this.task()!;
    this.store.patchTask(t.id, { photos: t.photos + 1 });
    this.store.log(`${t.title} · photo evidence uploaded`, this.who(), 'tasks-camera', 'var(--ka-7c3aed)');
  }
  protected reassign(id: string) {
    this.store.assign(this.taskId(), id);
  }
  protected go() {
    this.router.navigateByUrl('/tasks-workforce-operations/task-verification-approvals?task=' + this.taskId());
  }
}
