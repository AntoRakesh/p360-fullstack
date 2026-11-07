// Small pieces shared by the workflow pages: toggle switch and the instance detail drawer.
import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '../../shared/ui';
import { currentStep, fmtDT, Instance, instStatus, ME, statusTagCls, WorkflowStore } from './workflow.data';

@Component({
  selector: 'app-wf-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="sw" [class.on]="on()" role="switch" [attr.aria-checked]="on()" (click)="on.set(!on()); changed.emit(on())"><i></i></button>@if (label()) {<span (click)="on.set(!on()); changed.emit(on())">{{ label() }}</span>}`,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 9px; font-size: 12.5px; color: #3b3f5c; cursor: pointer; }
    .sw { position: relative; width: 34px; height: 19px; border-radius: 12px; border: 0; background: #cbd0dd; cursor: pointer; padding: 0; flex-shrink: 0; transition: background .15s; }
    .sw i { position: absolute; top: 2.5px; left: 2.5px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: left .15s; }
    .sw.on { background: #22c55e; } .sw.on i { left: 17.5px; }
  `,
})
export class WfToggle {
  readonly on = model(false);
  readonly label = input('');
  readonly changed = output<boolean>();
}

@Component({
  selector: 'app-wf-instance-drawer',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (inst(); as i) {
      <div class="g-overlay" (click)="closed.emit()"></div>
      <aside class="g-drawer wide">
        <div class="modal-head"><div><h3>{{ i.id }} · {{ i.workflow }}</h3><small class="muted">Started {{ fd(i.startedAt) }}</small></div><button class="close-btn" (click)="closed.emit()">×</button></div>
        <div class="who">
          <span class="dt-av" [style.background]="i.avatar">{{ i.initials }}</span>
          <div><b>{{ i.requester }}</b><small>{{ i.dept }} · {{ i.summary }}</small></div>
          <span [class]="tag(st(i))">{{ st(i) }}</span>
        </div>
        <dl class="facts">
          <dt>Current step</dt><dd>{{ cur(i) }}</dd>
          <dt>Assigned to</dt><dd>{{ i.assignee }}@if (i.delegated) { <span class="tag amber">delegated</span>}</dd>
          <dt>Priority</dt><dd><span [class]="i.priority === 'High' ? 'tag red' : i.priority === 'Medium' ? 'tag amber' : 'tag grey'">{{ i.priority }}</span></dd>
          <dt>SLA due</dt><dd [class.bad]="st(i) === 'Overdue'">{{ fd(i.dueAt) }}</dd>
          @if (i.endedAt) {<dt>Closed</dt><dd>{{ fd(i.endedAt) }}</dd>}
        </dl>
        <h4>Progress</h4>
        <ol class="steps">
          @for (s of i.steps; track $index) {
            @let state = stepState(i, $index);
            <li [class]="state"><span class="b">@switch (state) { @case ('done') {✓} @case ('rejected') {✕} @default { {{ $index + 1 }} } }</span>
              <div><b>{{ s }}</b><small>{{ state === 'done' ? 'Completed' : state === 'current' ? 'Waiting on ' + i.assignee : state === 'rejected' ? 'Rejected' : 'Pending' }}</small></div></li>
          }
        </ol>
        <h4>Activity</h4>
        <ul class="log">
          @for (l of i.log.slice().reverse(); track $index) {<li><i></i><div><b>{{ l.text }}</b><small>{{ l.by }} · {{ fd(l.at) }}</small></div></li>}
        </ul>
        @if (i.status === 'In Progress') {
          <textarea class="input" rows="2" placeholder="Comment (optional)" [value]="note()" (input)="note.set($any($event.target).value)"></textarea>
          <div class="acts">
            @if (i.assignee === me) {
              <button class="btn-primary" (click)="act('approve')"><app-icon name="workflow-check" [size]="15" />Approve</button>
              <button class="btn-ghost danger" (click)="act('reject')"><app-icon name="workflow-x" [size]="15" />Reject</button>
            }
            <button class="btn-ghost" (click)="act('escalate')"><app-icon name="arrow-up" [size]="15" />Escalate</button>
            <button class="btn-ghost danger" (click)="act('cancel')">Cancel instance</button>
          </div>
        } @else if (i.status !== 'Approved') {
          <div class="acts"><button class="btn-primary" (click)="act('retry')"><app-icon name="refresh" [size]="15" />Restart from {{ cur(i) }}</button></div>
        }
        <button class="link open" (click)="open(i)">Open “{{ i.workflow }}” in Designer →</button>
      </aside>
    }
  `,
  styles: `
    h4 { margin: 16px 0 8px; font-size: 13px; } small { display: block; }
    .who { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
    .who small { color: var(--muted); font-size: 11.5px; }
    .facts { display: grid; grid-template-columns: 120px 1fr; gap: 7px; font-size: 12.5px; margin: 12px 0 0; } .facts dt { color: var(--muted); } .facts dd { margin: 0; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .steps li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding-bottom: 12px; position: relative; font-size: 12.5px; }
    .steps li:not(:last-child)::before { content: ''; position: absolute; left: 12px; top: 26px; bottom: 0; width: 2px; background: #e6e7f0; }
    .steps li.done::before { background: #22c55e; }
    .b { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: #eef0f5; color: #6b7090; }
    .done .b { background: #22c55e; color: #fff; } .current .b { background: #3b82f6; color: #fff; box-shadow: 0 0 0 4px #dbeafe; } .rejected .b { background: #ef4444; color: #fff; }
    .steps small, .log small { color: var(--muted); font-size: 11px; }
    .log { list-style: none; margin: 0 0 12px; padding: 0; } .log li { display: grid; grid-template-columns: 10px 1fr; gap: 10px; padding: 6px 0; font-size: 12px; border-bottom: 1px solid #f0f1f6; }
    .log i { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin-top: 5px; }
    textarea { width: 100%; resize: vertical; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .open { margin-top: 16px; border: 0; background: none; cursor: pointer; padding: 0; }
    .bad { color: var(--red); font-weight: 600; }
  `,
})
export class WfInstanceDrawer {
  private readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  readonly instId = input<string | null>(null);
  readonly closed = output<void>();
  readonly done = output<string>();
  protected readonly me = ME;
  protected readonly note = signal('');
  protected readonly inst = computed(() => this.store.instances().find((i) => i.id === this.instId()) ?? null);
  protected readonly fd = fmtDT;
  protected readonly tag = statusTagCls;
  protected readonly st = instStatus;
  protected readonly cur = currentStep;
  protected stepState(i: Instance, k: number) {
    if (i.status === 'Approved' || k < i.stepIdx) return 'done';
    if (k === i.stepIdx) return i.status === 'Rejected' ? 'rejected' : i.status === 'In Progress' ? 'current' : 'pending';
    return 'pending';
  }
  protected act(a: 'approve' | 'reject' | 'cancel' | 'escalate' | 'retry') {
    const i = this.inst()!;
    this.store.decide(i.id, a, this.note());
    this.note.set('');
    this.done.emit(`${i.id} ${a === 'approve' ? 'approved' : a === 'reject' ? 'rejected' : a === 'cancel' ? 'cancelled' : a === 'escalate' ? 'escalated to Department Head' : 'restarted'}`);
  }
  protected open(i: Instance) {
    this.store.currentId.set(i.wfId);
    this.router.navigate(['/workflow-automation/workflow-designer']);
  }
}
