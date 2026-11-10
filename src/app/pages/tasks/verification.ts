// Task Verification & Approvals — evidence review queue (photos, checklist, signature, location proof), approve / reject / rework, bulk approve.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UI } from '../../shared/ui';
import { downloadCsv } from '../dashboards/demo-data';
import { TaskDrawer } from './task-drawer';
import { TASKS_UI } from './tasks-ui';
import { CAT_NAMES, catMeta, catOf, hhmm, prioCls, statusCls, SUPERVISORS, TaskItem, TaskStore, workerById } from './tasks.data';

type Tab = 'Completed' | 'Verified' | 'Rejected';
const REASONS = ['Area not cleaned to standard', 'Photo evidence unclear / missing', 'Checklist step skipped', 'Wrong location scanned', 'Completed outside SLA window', 'Safety issue observed'];
const SCENES = [
  ['var(--ka-475569)', 'var(--ka-94a3b8)'], ['var(--ka-0f766e)', 'var(--ka-5eead4)'], ['var(--ka-6d28d9)', 'var(--ka-c4b5fd)'], ['var(--ka-b45309)', 'var(--ka-fcd34d)'], ['var(--ka-1d4ed8)', 'var(--ka-93c5fd)'], ['var(--ka-be123c)', 'var(--ka-fda4af)'],
];

@Component({
  selector: 'app-tasks-task-verification-approvals',
  imports: [...UI, ...TASKS_UI, TaskDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Task Verification &amp; Approvals" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="Review photo evidence, checklists, signatures and location proof before a task is closed.">
      <button class="btn-primary" [disabled]="!picked().size" (click)="bulkApprove()"><app-icon name="tasks-check" [size]="16" />Approve Selected ({{ picked().size }})</button>
      <button class="btn-ghost" (click)="rulesOpen.set(true)"><app-icon name="sparkles" [size]="16" />Auto-approval Rules</button>
      <button class="btn-ghost" (click)="exportCsv()"><app-icon name="download" [size]="16" />Export</button>
    </app-page-head>

    <section class="kpis">
      <app-tkpi label="Awaiting Review" [value]="byStatus().Completed.length" icon="file-check" color="var(--ka-f59e0b)" [pct]="oldest() + ' min'" pctColor="var(--ka-b45309)" sub="oldest in queue" />
      <app-tkpi label="Verified Today" [value]="byStatus().Verified.length" icon="shield-check" color="var(--ka-22c55e)" change="9%" sub="vs. last Wed" />
      <app-tkpi label="Rejected / Rework" [value]="byStatus().Rejected.length" icon="tasks-x" color="var(--ka-ef4444)" [pct]="reworkOpen() + ''" pctColor="var(--ka-b91c1c)" sub="rework in progress" />
      <app-tkpi label="First-pass Approval" [value]="firstPass() + '%'" icon="tasks-award" color="var(--ka-7c3aed)" sub="approved without rework" />
      <app-tkpi label="Avg Rating" [value]="avgRating() + ' ★'" icon="star" color="var(--ka-2563eb)" [sub]="'across ' + byStatus().Verified.length + ' reviews'" />
    </section>

    <section class="grid">
      <div class="card ql">
        <div class="card-head">
          <div class="tabs">
            <button [class.on]="tab() === 'Completed'" (click)="setTab('Completed')">Awaiting ({{ byStatus().Completed.length }})</button>
            <button [class.on]="tab() === 'Verified'" (click)="setTab('Verified')">Verified ({{ byStatus().Verified.length }})</button>
            <button [class.on]="tab() === 'Rejected'" (click)="setTab('Rejected')">Rejected ({{ byStatus().Rejected.length }})</button>
          </div>
        </div>
        <div class="flt">
          <label class="search-box"><app-icon name="search" [size]="14" /><input placeholder="Search task, ID, worker..." [value]="q()" (input)="q.set($any($event.target).value)" /></label>
          <select class="select" [value]="cat()" (change)="cat.set($any($event.target).value)"><option value="All">All Categories</option>@for (c of cats; track c) {<option [value]="c">{{ c }}</option>}</select>
          <select class="select" [value]="ev()" (change)="ev.set($any($event.target).value)"><option value="All">Any evidence</option><option value="photo2">2+ photos</option><option value="scan">Location scanned</option><option value="late">Completed late</option></select>
        </div>
        @if (tab() === 'Completed') {
          <label class="all"><input type="checkbox" [checked]="allPicked()" (change)="pickAll()" />Select all {{ list().length }}</label>
        }
        <ul>
          @for (t of list().slice(0, limit()); track t.id) {
            <li [class.on]="cur()?.id === t.id" (click)="selId.set(t.id)">
              @if (tab() === 'Completed') {<input type="checkbox" [checked]="picked().has(t.id)" (click)="$event.stopPropagation()" (change)="pick(t.id)" />}
              <span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="13" /></span>
              <div class="tx">
                <b>{{ t.title }}</b>
                <small>{{ worker(t)?.name ?? '—' }} · {{ t.location }}</small>
                <span class="mt">
                  <span><app-icon name="tasks-camera" [size]="11" />{{ t.photos }}</span>
                  @if (t.checkpointId) {<span><app-icon name="tasks-qr" [size]="11" />scan</span>}
                  @if (late(t)) {<span class="lt">late</span>}
                </span>
              </div>
              <span class="age">{{ t.completedAt != null ? hhmm(t.completedAt) : '' }}<small>{{ tab() === 'Completed' ? age(t) + 'm ago' : (t.verifiedBy ?? '') }}</small></span>
            </li>
          } @empty {
            <li class="empty"><app-icon name="tasks-check-circle" [size]="18" />Queue is clear</li>
          }
          @if (list().length > limit()) {<li class="more"><button class="link" (click)="limit.set(limit() + 15)">Show {{ list().length - limit() }} more</button></li>}
        </ul>
      </div>

      @if (cur(); as t) {
        @let w = worker(t);
        <div class="card rv">
          <div class="rh">
            <span class="cil" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="20" /></span>
            <div><h3>{{ t.title }}</h3><small>{{ t.id }} · {{ t.category }} · {{ t.site }} · {{ t.location }}</small></div>
            <span [class]="statusCls(t.status === 'Completed' ? 'Pending' : t.status)">{{ t.status === 'Completed' ? 'Awaiting review' : t.status }}</span>
          </div>

          <div class="who">
            @if (w) {<span class="av" [style.background]="w.color">{{ w.initials }}</span><div><b>{{ w.name }}</b><small>{{ w.role }} · {{ w.team }} · quality {{ w.quality }}%</small></div>}
            <div class="tm"><span>Window<b>{{ hhmm(t.start) }} – {{ hhmm(t.due) }}</b></span><span>Started<b>{{ t.startedAt != null ? hhmm(t.startedAt) : '—' }}</b></span><span>Completed<b [style.color]="late(t) ? 'var(--ka-b91c1c)' : ''">{{ t.completedAt != null ? hhmm(t.completedAt) : '—' }}</b></span><span>Duration<b>{{ dur(t) }} min</b></span></div>
          </div>

          <h4>Photo Evidence <small>{{ t.photos }} photo{{ t.photos === 1 ? '' : 's' }} · tap to enlarge</small></h4>
          <div class="photos">
            @for (p of photos(); track $index) {
              <button class="ph" [style.background]="p.bg" (click)="lightbox.set($index)">
                <app-icon [name]="meta(t.category).icon" [size]="34" />
                <span class="stamp">{{ p.time }} · 25.20{{ $index }}°N 55.27{{ $index + 3 }}°E</span>
                <span class="lbl">{{ p.label }}</span>
              </button>
            } @empty {<p class="muted">No photo uploaded</p>}
          </div>

          <div class="two">
            <div>
              <h4>Checklist <small>{{ t.stepsDone }}/{{ t.steps }} done</small></h4>
              <ul class="cl">
                @for (s of steps(); track $index; let i = $index) {
                  <li [class.ok]="i < t.stepsDone"><app-icon [name]="i < t.stepsDone ? 'tasks-check-circle' : 'minus'" [size]="14" /><span>{{ s.text }}</span>@if (s.photo) {<app-icon name="tasks-camera" [size]="12" class="pc" />}<small>{{ stepTime(t, i) }}</small></li>
                }
              </ul>
            </div>
            <div>
              <h4>Location Proof</h4>
              <div class="proof" [class.bad]="!t.checkpointId">
                <app-icon [name]="t.checkpointId ? 'tasks-qr' : 'locate'" [size]="18" />
                <div><b>{{ t.checkpointId ? t.location + ' scanned' : 'GPS location matched' }}</b><small>{{ t.checkpointId ? t.checkpointId + ' · tag verified at ' + hhmm(t.completedAt ?? t.due) : 'Within 25 m of ' + t.site }}</small></div>
              </div>
              <h4>Worker Signature</h4>
              <div class="sig">
                <svg viewBox="0 0 220 60"><path [attr.d]="sigPath()" fill="none" stroke="var(--kl-1e1b3a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <small>{{ w?.name }} · signed {{ t.completedAt != null ? hhmm(t.completedAt) : '' }}</small>
              </div>
            </div>
          </div>

          @if (t.status === 'Completed') {
            <div class="decide">
              <div class="rate">Rating
                @for (s of [1, 2, 3, 4, 5]; track s) {<button [class.on]="s <= rating()" (click)="rating.set(s)">★</button>}
              </div>
              <input class="input" placeholder="Comment for the worker (optional)" [value]="note()" (input)="note.set($any($event.target).value)" />
              <div class="btns">
                <button class="btn-primary approve" (click)="approve(t)"><app-icon name="tasks-check" [size]="15" />Approve</button>
                <button class="btn-ghost" (click)="rejOpen.set('rework')"><app-icon name="refresh" [size]="15" />Request Rework</button>
                <button class="btn-ghost danger" (click)="rejOpen.set('reject')"><app-icon name="tasks-x" [size]="15" />Reject</button>
                <button class="link" (click)="drawer.set(t.id)">Full details</button>
              </div>
            </div>
          } @else {
            <div class="decided" [class.rej]="t.status === 'Rejected'">
              <app-icon [name]="t.status === 'Rejected' ? 'tasks-x' : 'shield-check'" [size]="18" />
              <div><b>{{ t.status === 'Rejected' ? 'Rejected' : 'Verified' }} by {{ t.verifiedBy }}@if (t.rating) { · {{ t.rating }}★}</b><small>{{ t.note || 'No comment' }}</small></div>
              @if (t.status === 'Rejected') {<button class="btn-primary" (click)="reopen(t)"><app-icon name="refresh" [size]="14" />Re-open for rework</button>}
              @else {<button class="btn-ghost" (click)="undo(t)">Undo approval</button>}
            </div>
          }
        </div>
      } @else {
        <div class="card rv none"><app-icon name="file-check" [size]="40" /><b>Select a task to review its evidence</b><small>The queue on the left lists every completed task awaiting supervisor sign-off.</small></div>
      }

      <div class="side">
        <div class="card">
          <div class="card-head"><h3>Review Outcomes</h3><span class="card-sub">today</span></div>
          <app-donut [segments]="outcomes()" center="Reviewed" [size]="130" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Reviews by Supervisor</h3></div>
          <app-bar-list [rows]="bySup()" [max]="supMax()" />
        </div>
        <div class="card">
          <div class="card-head"><h3>Queue Age</h3></div>
          <app-column-chart [labels]="ageLabels" [series]="ageSeries()" [height]="150" [legend]="false" />
        </div>
      </div>
    </section>

    @if (lightbox() !== null && cur(); as t) {
      <div class="g-overlay" (click)="lightbox.set(null)"></div>
      <div class="g-modal wide lb">
        <div class="modal-head"><h3>{{ t.title }} · photo {{ lightbox()! + 1 }} of {{ t.photos }}</h3><button class="close-btn" (click)="lightbox.set(null)">×</button></div>
        <div class="big" [style.background]="photos()[lightbox()!].bg">
          <app-icon [name]="meta(t.category).icon" [size]="120" />
          <span class="stamp">{{ photos()[lightbox()!].time }} · {{ t.location }} · {{ worker(t)?.name }}</span>
        </div>
        <div class="form-actions">
          <button class="btn-ghost" [disabled]="lightbox() === 0" (click)="lightbox.set(lightbox()! - 1)">Previous</button>
          <button class="btn-ghost" [disabled]="lightbox()! >= t.photos - 1" (click)="lightbox.set(lightbox()! + 1)">Next</button>
        </div>
      </div>
    }

    @if (rejOpen(); as mode) {
      <div class="g-overlay" (click)="rejOpen.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); reject(mode)">
        <div class="modal-head"><h3>{{ mode === 'rework' ? 'Request Rework' : 'Reject Task' }}</h3><button type="button" class="close-btn" (click)="rejOpen.set(null)">×</button></div>
        <div class="form-grid">
          <label class="full">Reason
            <select class="select" [value]="reason()" (change)="reason.set($any($event.target).value)">@for (r of reasons; track r) {<option [value]="r">{{ r }}</option>}</select>
          </label>
          <label class="full">Instructions to worker<input class="input" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="What needs to be fixed?" /></label>
        </div>
        <p class="sum">{{ mode === 'rework' ? 'The task re-opens for the same worker with a fresh 45-minute SLA and a push notification.' : 'The task is closed as rejected and counts against first-pass quality.' }}</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="rejOpen.set(null)">Cancel</button><button class="btn-primary" [class.red]="mode === 'reject'">{{ mode === 'rework' ? 'Send for Rework' : 'Reject Task' }}</button></div>
      </form>
    }

    @if (rulesOpen()) {
      <div class="g-overlay" (click)="rulesOpen.set(false)"></div>
      <div class="g-modal">
        <div class="modal-head"><h3>Auto-approval Rules</h3><button class="close-btn" (click)="rulesOpen.set(false)">×</button></div>
        <ul class="rules">
          <li><app-tswitch [(on)]="rPhotos" /><div><b>At least 2 photos uploaded</b><small>Evidence must include before/after shots</small></div></li>
          <li><app-tswitch [(on)]="rScan" /><div><b>Checkpoint scanned when applicable</b><small>QR / NFC tag read matches the task location</small></div></li>
          <li><app-tswitch [(on)]="rOnTime" /><div><b>Completed within SLA</b><small>Late tasks always go to manual review</small></div></li>
          <li><app-tswitch [(on)]="rQuality" /><div><b>Worker quality score ≥ 90%</b><small>Based on the last 30 days of reviews</small></div></li>
        </ul>
        <p class="sum"><b>{{ autoMatches().length }}</b> of {{ byStatus().Completed.length }} tasks in the queue currently meet all enabled rules.</p>
        <div class="form-actions"><button class="btn-ghost" (click)="rulesOpen.set(false)">Close</button><button class="btn-primary" [disabled]="!autoMatches().length" (click)="runRules()">Run now &amp; approve {{ autoMatches().length }}</button></div>
      </div>
    }

    @if (drawer(); as id) {<app-task-drawer [taskId]="id" (closed)="drawer.set(null)" />}
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 340px minmax(0, 1fr) 300px; gap: 12px; align-items: start; }
    .ql .card-head { margin-bottom: 10px; } .ql .tabs { width: 100%; } .ql .tabs button { flex: 1; padding: 5px 6px; }
    .flt { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; } .flt .search-box { grid-column: 1 / -1; } .flt .search-box input { width: 100%; } .flt .select { font-size: 12px; min-width: 0; }
    .all { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--kf-4b4f6b); padding: 4px 6px 8px; border-bottom: 1px solid var(--border); }
    input[type='checkbox'] { accent-color: var(--primary); }
    .ql ul { list-style: none; margin: 0; padding: 0; max-height: 820px; overflow: auto; }
    .ql li { display: grid; grid-template-columns: auto 24px 1fr auto; gap: 8px; align-items: center; padding: 9px 6px; border-bottom: 1px solid var(--kl-f1f2f7); cursor: pointer; border-radius: 6px; }
    .ql li:not(:has(input)) { grid-template-columns: 24px 1fr auto; }
    .ql li.on { background: var(--kb-f5f3ff); box-shadow: inset 3px 0 0 var(--primary); } .ql li:hover:not(.on) { background: var(--kb-fafafe); }
    .ci { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .tx { display: flex; flex-direction: column; min-width: 0; gap: 1px; } .tx b { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .tx small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mt { display: flex; gap: 8px; font-size: 10.5px; color: var(--kf-4b4f6b); } .mt span { display: inline-flex; align-items: center; gap: 3px; } .mt .lt { color: var(--kf-b91c1c); font-weight: 600; }
    .age { display: flex; flex-direction: column; align-items: flex-end; font-size: 11.5px; font-weight: 600; white-space: nowrap; } .age small { font-weight: 400; color: var(--muted); font-size: 10.5px; }
    .empty { display: flex !important; justify-content: center; gap: 8px; color: var(--kf-16a34a); font-size: 12.5px; padding: 24px !important; cursor: default !important; }
    .more { display: flex !important; justify-content: center; cursor: default !important; }
    .rv { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .rv.none { align-items: center; justify-content: center; text-align: center; min-height: 420px; color: var(--muted); gap: 10px; } .rv.none b { color: var(--text); }
    .rh { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; } .rh h3 { font-size: 17px; } .rh small { color: var(--muted); font-size: 12px; }
    .cil { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .who { display: flex; gap: 10px; align-items: center; margin: 12px 0 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--kb-fafafe); flex-wrap: wrap; }
    .who > div:not(.tm) { display: flex; flex-direction: column; } .who small { color: var(--muted); font-size: 11.5px; }
    .av { width: 36px; height: 36px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-size: 12px; font-weight: 600; }
    .tm { margin-left: auto; display: flex; gap: 16px; } .tm span { display: flex; flex-direction: column; font-size: 11px; color: var(--muted); } .tm b { font-size: 12.5px; color: var(--text); }
    h4 { margin: 14px 0 8px; font-size: 13px; display: flex; justify-content: space-between; } h4 small { color: var(--muted); font-weight: 500; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .ph { position: relative; height: 110px; border-radius: 10px; border: 0; color: rgba(255, 255, 255, 0.9); display: grid; place-items: center; cursor: zoom-in; overflow: hidden; }
    .ph:hover { filter: brightness(1.06); }
    .stamp { position: absolute; left: 6px; bottom: 6px; font-size: 9.5px; background: rgba(0, 0, 0, 0.45); color: var(--kf-ffffff); padding: 2px 5px; border-radius: 4px; }
    .lbl { position: absolute; top: 6px; left: 6px; font-size: 10px; font-weight: 600; background: rgba(255, 255, 255, 0.88); color: var(--kf-1e1b3a); padding: 2px 6px; border-radius: 4px; }
    .two { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
    .cl { list-style: none; margin: 0; padding: 0; } .cl li { display: grid; grid-template-columns: 16px 1fr auto auto; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; border-bottom: 1px dashed var(--kl-eef0f5); color: var(--kf-94a3b8); }
    .cl li.ok { color: var(--text); } .cl li.ok > app-icon:first-child { color: var(--kf-16a34a); } .cl small { color: var(--muted); font-size: 11px; } .pc { color: var(--primary); }
    .proof { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 10px; background: var(--kb-f0fdf4); color: var(--kf-15803d); border: 1px solid var(--kl-bbf7d0); } .proof div { display: flex; flex-direction: column; } .proof small { color: var(--kf-4b4f6b); font-size: 11px; }
    .sig { border: 1px dashed var(--kl-c9cdd8); border-radius: 10px; padding: 6px 10px; background: var(--kb-ffffff); } .sig svg { width: 100%; height: 60px; display: block; } .sig small { color: var(--muted); font-size: 11px; }
    .decide { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; }
    .rate { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--kf-4b4f6b); } .rate button { border: 0; background: none; font-size: 20px; color: var(--kf-d5d8e4); cursor: pointer; padding: 0 1px; } .rate button.on { color: var(--kf-f59e0b); } .rate button:first-of-type { margin-left: 6px; }
    .btns { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .btns .link { margin-left: auto; }
    .approve { background: var(--kb-16a34a) !important; border-color: var(--kl-16a34a) !important; }
    .danger { color: var(--red); }
    .decided { margin-top: 16px; display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 10px; background: var(--kb-f0fdf4); color: var(--kf-15803d); } .decided.rej { background: var(--kb-fef2f2); color: var(--kf-b91c1c); }
    .decided div { display: flex; flex-direction: column; flex: 1; } .decided small { color: var(--kf-4b4f6b); font-size: 12px; }
    .side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .lb .big { position: relative; height: 480px; border-radius: 12px; display: grid; place-items: center; color: rgba(255, 255, 255, 0.85); } .lb .stamp { font-size: 12px; left: 12px; bottom: 12px; padding: 4px 8px; }
    .sum { font-size: 12px; color: var(--muted); margin: 12px 0 0; }
    .red { background: var(--red) !important; border-color: var(--red) !important; }
    .rules { list-style: none; margin: 0; padding: 0; } .rules li { display: flex; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--kl-f1f2f7); } .rules div { display: flex; flex-direction: column; } .rules b { font-size: 13px; } .rules small { color: var(--muted); font-size: 12px; }
    @media (max-width: 1400px) { .grid { grid-template-columns: 320px minmax(0, 1fr); } .side { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 1300px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class TaskVerificationApprovals {
  protected readonly store = inject(TaskStore);
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly prioCls = prioCls;
  protected readonly statusCls = statusCls;
  protected readonly cats = CAT_NAMES;
  protected readonly reasons = REASONS;
  protected readonly ageLabels = ['<15m', '<30m', '<1h', '<2h', '2h+'];

  protected readonly tab = signal<Tab>('Completed');
  protected readonly q = signal('');
  protected readonly cat = signal('All');
  protected readonly ev = signal('All');
  protected readonly limit = signal(25);
  protected readonly selId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('task'));
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly rating = signal(5);
  protected readonly note = signal('');
  protected readonly reason = signal(REASONS[0]);
  protected readonly rejOpen = signal<'rework' | 'reject' | null>(null);
  protected readonly lightbox = signal<number | null>(null);
  protected readonly rulesOpen = signal(false);
  protected readonly drawer = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly rPhotos = signal(true);
  protected readonly rScan = signal(true);
  protected readonly rOnTime = signal(true);
  protected readonly rQuality = signal(false);

  protected readonly byStatus = computed(() => {
    const b: Record<Tab, TaskItem[]> = { Completed: [], Verified: [], Rejected: [] };
    for (const t of this.store.tasks()) if (t.status in b) b[t.status as Tab].push(t);
    b.Completed.sort((a, c) => (a.completedAt ?? 0) - (c.completedAt ?? 0));
    b.Verified.sort((a, c) => (c.completedAt ?? 0) - (a.completedAt ?? 0));
    b.Rejected.sort((a, c) => (c.completedAt ?? 0) - (a.completedAt ?? 0));
    return b;
  });
  protected readonly list = computed(() => {
    const q = this.q().toLowerCase();
    return this.byStatus()[this.tab()].filter(
      (t) =>
        (!q || `${t.title} ${t.id} ${t.location} ${workerById(t.assignee)?.name ?? ''}`.toLowerCase().includes(q)) &&
        (this.cat() === 'All' || catOf(t.category) === this.cat()) &&
        (this.ev() === 'All' || (this.ev() === 'photo2' && t.photos >= 2) || (this.ev() === 'scan' && !!t.checkpointId) || (this.ev() === 'late' && this.late(t))),
    );
  });
  protected readonly cur = computed(() => {
    const id = this.selId();
    return (id && this.store.tasks().find((t) => t.id === id)) || this.list()[0] || null;
  });
  protected readonly steps = computed(() => this.store.templates().find((t) => t.id === this.cur()?.templateId)?.steps ?? []);
  protected readonly photos = computed(() => {
    const t = this.cur();
    if (!t) return [];
    const n = +t.id.slice(4);
    const labels = ['Before', 'In progress', 'After', 'Close-up', 'Area overview'];
    return Array.from({ length: t.photos }, (_, i) => {
      const [a, b] = SCENES[(n + i) % SCENES.length];
      return { bg: `radial-gradient(circle at ${30 + i * 20}% 30%, ${b}, ${a})`, time: hhmm((t.startedAt ?? t.start) + 3 + i * Math.max(3, Math.floor(this.dur(t) / Math.max(t.photos, 1)))), label: labels[i % labels.length] };
    });
  });
  protected readonly sigPath = computed(() => {
    const n = +(this.cur()?.id.slice(4) ?? 1);
    let d = 'M10 40';
    let x = 10;
    for (let i = 0; i < 9; i++) {
      x += 20;
      const y = 14 + ((n * (i + 3) * 7) % 34);
      d += ` Q${x - 10} ${i % 2 ? 6 : 56} ${x} ${y}`;
    }
    return d + ` M18 48 L${x - 6} 44`;
  });
  protected readonly oldest = computed(() => Math.max(0, ...this.byStatus().Completed.map((t) => this.age(t))));
  protected readonly reworkOpen = computed(() => this.store.events().filter((e) => e.text.endsWith('re-opened for rework')).length);
  protected readonly firstPass = computed(() => {
    const v = this.byStatus().Verified.length;
    return Math.round((v / Math.max(v + this.byStatus().Rejected.length + this.reworkOpen(), 1)) * 100);
  });
  protected readonly avgRating = computed(() => {
    const l = this.byStatus().Verified.filter((t) => t.rating);
    return (l.reduce((a, t) => a + t.rating!, 0) / Math.max(l.length, 1)).toFixed(1);
  });
  protected readonly outcomes = computed(() => [
    { label: 'Approved', value: this.byStatus().Verified.length, color: 'var(--ka-22c55e)' },
    { label: 'Rejected', value: this.byStatus().Rejected.length, color: 'var(--ka-ef4444)' },
    { label: 'Sent for rework', value: this.reworkOpen(), color: 'var(--ka-f59e0b)' },
    { label: 'Awaiting', value: this.byStatus().Completed.length, color: 'var(--ka-c4b5fd)' },
  ]);
  protected readonly bySup = computed(() => {
    const names = [...SUPERVISORS, 'Auto-approval'];
    return names
      .map((s, i) => {
        const v = this.store.tasks().filter((t) => t.verifiedBy === s).length;
        return { label: s, value: v, display: String(v), color: ['var(--ka-7c3aed)', 'var(--ka-3b82f6)', 'var(--ka-22c55e)', 'var(--ka-f59e0b)', 'var(--ka-06b6d4)'][i] };
      })
      .sort((a, b) => b.value - a.value);
  });
  protected readonly supMax = computed(() => Math.max(...this.bySup().map((r) => r.value), 1));
  protected readonly ageSeries = computed(() => {
    const b = [0, 0, 0, 0, 0];
    for (const t of this.byStatus().Completed) {
      const a = this.age(t);
      b[a < 15 ? 0 : a < 30 ? 1 : a < 60 ? 2 : a < 120 ? 3 : 4]++;
    }
    return [{ name: 'Tasks', color: 'var(--ka-a78bfa)', values: b }];
  });
  protected readonly allPicked = computed(() => this.list().length > 0 && this.list().every((t) => this.picked().has(t.id)));
  protected readonly autoMatches = computed(() =>
    this.byStatus().Completed.filter(
      (t) =>
        (!this.rPhotos() || t.photos >= 2) &&
        (!this.rScan() || !t.checkpointId || t.photos > 0) &&
        (!this.rOnTime() || !this.late(t)) &&
        (!this.rQuality() || (workerById(t.assignee)?.quality ?? 0) >= 90),
    ),
  );

  protected worker(t: TaskItem) {
    return workerById(t.assignee);
  }
  protected late(t: TaskItem) {
    return t.completedAt != null && t.completedAt > t.due;
  }
  protected age(t: TaskItem) {
    return Math.max(0, this.store.now() - (t.completedAt ?? this.store.now()));
  }
  protected dur(t: TaskItem) {
    return Math.max(1, (t.completedAt ?? this.store.now()) - (t.startedAt ?? t.start));
  }
  protected stepTime(t: TaskItem, i: number) {
    if (i >= t.stepsDone) return '—';
    const s = t.startedAt ?? t.start;
    return hhmm(s + Math.round(((i + 1) / t.steps) * this.dur(t)));
  }
  protected setTab(t: Tab) {
    this.tab.set(t);
    this.selId.set(null);
    this.limit.set(25);
  }
  protected pick(id: string) {
    this.picked.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }
  protected pickAll() {
    this.picked.set(this.allPicked() ? new Set() : new Set(this.list().map((t) => t.id)));
  }
  private next(t: TaskItem) {
    const l = this.list();
    const i = l.findIndex((x) => x.id === t.id);
    this.selId.set(l[i + 1]?.id ?? l[i - 1]?.id ?? null);
    this.note.set('');
    this.rating.set(5);
  }
  protected approve(t: TaskItem) {
    const rating = this.rating();
    const note = this.note() || undefined;
    this.next(t);
    this.store.verify(t.id, true, 'Rex Kumar', note, rating);
    this.picked.update((s) => new Set([...s].filter((x) => x !== t.id)));
    this.say(`${t.title} approved · ${rating}★ · ${workerById(t.assignee)?.name ?? 'worker'} notified`);
  }
  protected reject(mode: 'rework' | 'reject') {
    const t = this.cur()!;
    const msg = this.reason() + (this.note() ? ' – ' + this.note() : '');
    this.next(t);
    this.store.verify(t.id, false, 'Rex Kumar', msg);
    if (mode === 'rework') this.store.rework(t.id);
    this.rejOpen.set(null);
    this.say(mode === 'rework' ? `${t.title} sent back for rework (45 min SLA)` : `${t.title} rejected`);
  }
  protected reopen(t: TaskItem) {
    this.store.rework(t.id);
    this.selId.set(null);
    this.say(`${t.title} re-opened for ${workerById(t.assignee)?.name ?? 'rework'}`);
  }
  protected undo(t: TaskItem) {
    this.store.patchTask(t.id, { status: 'Completed', verifiedBy: undefined, rating: undefined, note: undefined });
    this.tab.set('Completed');
    this.selId.set(t.id);
    this.say('Approval reverted – task back in review queue');
  }
  protected bulkApprove() {
    const ids = [...this.picked()];
    ids.forEach((id) => this.store.verify(id, true, 'Rex Kumar', 'Bulk approved', 5));
    this.picked.set(new Set());
    this.selId.set(null);
    this.say(`${ids.length} tasks approved`);
  }
  protected runRules() {
    const l = this.autoMatches();
    l.forEach((t) => this.store.verify(t.id, true, 'Auto-approval', 'Met auto-approval rules', 5));
    this.rulesOpen.set(false);
    this.selId.set(null);
    this.say(`${l.length} tasks auto-approved by rules`);
  }
  protected exportCsv() {
    downloadCsv(`verification-${this.tab().toLowerCase()}.csv`, [
      ['Task ID', 'Task', 'Category', 'Worker', 'Location', 'Completed', 'Photos', 'Checkpoint', 'Late', 'Status', 'Verified By', 'Rating', 'Note'],
      ...this.list().map((t) => [t.id, t.title, t.category, workerById(t.assignee)?.name ?? '', t.location, t.completedAt != null ? hhmm(t.completedAt) : '', t.photos, t.checkpointId ?? '', this.late(t) ? 'Yes' : 'No', t.status, t.verifiedBy ?? '', t.rating ?? '', t.note ?? '']),
    ]);
    this.say('Review list exported');
  }
  protected say(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
}
