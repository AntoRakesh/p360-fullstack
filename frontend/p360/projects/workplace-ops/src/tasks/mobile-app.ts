import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { AppState } from '@p360/shared/app-state';
import { UI } from '@p360/shared/ui';
import { TASKS_UI } from './tasks-ui';
import { catMeta, hhmm, isOpen, TaskItem, TaskStore, workerById, WORKERS } from './tasks.data';

type Screen = 'home' | 'task' | 'scan' | 'camera' | 'alerts' | 'profile' | 'done';
interface Push {
  at: number;
  title: string;
  text: string;
  to: string;
}
const DEVICES = [
  ['Samsung Galaxy XCover 6', 'Android 14', 'v3.4.2', 82],
  ['iPhone 13', 'iOS 18.1', 'v3.4.2', 64],
  ['Zebra TC58', 'Android 13', 'v3.4.1', 91],
  ['Samsung Galaxy A54', 'Android 14', 'v3.3.9', 37],
  ['iPhone SE (3rd gen)', 'iOS 17.6', 'v3.4.2', 55],
  ['Zebra TC26', 'Android 12', 'v3.2.0', 18],
] as const;

@Component({
  selector: 'app-tasks-mobile-task-app',
  imports: [...UI, ...TASKS_UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Mobile Task App" parent="Tasks &amp; Workforce Operations" parentLink="/tasks-workforce-operations/task-master-templates"
      subtitle="The field worker app — live preview. Actions taken on the phone update every task dashboard instantly.">
      <label class="persona">Preview as
        <select class="select" [value]="me()" (change)="switchUser($any($event.target).value)">@for (w of onDuty; track w.id) {<option [value]="w.id">{{ w.name }} · {{ w.role }}</option>}</select>
      </label>
    </app-page-head>

    <section class="wrap">
      <div class="stage">
        <div class="phone">
          <div class="notch"></div>
          <div class="screen" [class.dark]="screen() === 'scan' || screen() === 'camera'">
            <div class="sbar"><b>{{ clock() }}</b><span>@if (offline()) {<em>Offline</em>} @else {<app-icon name="wifi" [size]="12" />}<app-icon name="battery" [size]="14" /></span></div>
            @if (banner(); as b) {<div class="banner" (click)="screen.set('alerts'); banner.set(null)"><app-icon name="bell" [size]="14" /><div><b>{{ b.title }}</b><span>{{ b.text }}</span></div></div>}
            @if (offline()) {<div class="offbar">Offline mode · {{ queue().length }} action{{ queue().length === 1 ? '' : 's' }} waiting to sync</div>}

            @switch (screen()) {
              @case ('home') {
                <div class="body">
                  <div class="hello"><span class="av" [style.background]="user().color">{{ user().initials }}</span><div><small>Good morning,</small><b>{{ first() }}</b></div><span class="shift">{{ user().shift }}</span></div>
                  <div class="sum">
                    <app-ring [value]="donePct()" [size]="62" color="var(--ka-ffffff)" />
                    <div><b>{{ mine().done.length }} of {{ mineAll().length }} done</b><small>{{ mine().today.length }} to do · {{ overdueN() }} overdue</small></div>
                  </div>
                  <div class="seg">@for (t of segs; track t) {<button [class.on]="seg() === t" (click)="seg.set(t)">{{ t }}</button>}</div>
                  <div class="list">
                    @for (t of segList(); track t.id) {
                      <button class="mt" (click)="openTask(t)">
                        <span class="ci" [style.background]="meta(t.category).tint"><app-icon [name]="meta(t.category).icon" [size]="15" /></span>
                        <div><b>{{ t.title }}</b><small><app-icon name="map-pin" [size]="10" />{{ t.location }} · {{ hhmm(t.start) }}</small>
                          @if (t.status === 'In Progress') {<span class="mb"><i [style.width.%]="(t.stepsDone / t.steps) * 100"></i></span>}</div>
                        <span class="st" [class]="'st ' + stCls(t)">{{ stLabel(t) }}</span>
                      </button>
                    } @empty {<p class="empty">No tasks here 🎉</p>}
                  </div>
                </div>
              }
              @case ('task') {
                @if (cur(); as t) {
                  <div class="body">
                    <div class="top"><button class="back" (click)="screen.set('home')"><app-icon name="chevron-left" [size]="18" /></button><b>Task Details</b><span></span></div>
                    <div class="thero" [style.background]="meta(t.category).tint">
                      <app-icon [name]="meta(t.category).icon" [size]="22" />
                      <div><b>{{ t.title }}</b><small>{{ t.id }} · {{ t.location }}</small></div>
                    </div>
                    <div class="meta3"><div><small>Start</small><b>{{ hhmm(t.start) }}</b></div><div><small>SLA</small><b [class.red]="t.due < store.now()">{{ slaLeft(t) }}</b></div><div><small>Priority</small><b>{{ t.priority }}</b></div></div>
                    <h5>Checklist <span>{{ t.stepsDone }}/{{ t.steps }}</span></h5>
                    <ul class="ck">
                      @for (s of steps(); track $index; let i = $index) {
                        <li [class.done]="i < t.stepsDone" (click)="tapStep(t, i)"><i>@if (i < t.stepsDone) {<app-icon name="tasks-check" [size]="11" [stroke]="3.2" />}</i><span>{{ s.text }}</span>@if (s.photo) {<app-icon name="tasks-camera" [size]="12" />}</li>
                      }
                    </ul>
                    <div class="tools">
                      @if (t.checkpointId) {<button (click)="screen.set('scan')" [disabled]="!isOpen(t)"><app-icon name="tasks-qr" [size]="18" />Scan</button>}
                      <button (click)="screen.set('camera')" [disabled]="!isOpen(t)"><app-icon name="tasks-camera" [size]="18" />Photo <em>{{ t.photos }}</em></button>
                      <button (click)="reportIssue(t)" [disabled]="!isOpen(t)"><app-icon name="triangle-alert" [size]="18" />Issue</button>
                    </div>
                    @if (t.status === 'Pending') {<button class="cta" (click)="act('start', t)">Start Task</button>}
                    @else if (t.status === 'In Progress') {<button class="cta green" (click)="act('complete', t)" [disabled]="t.stepsDone < t.steps - 1">Complete Task</button>}
                    @else {<p class="doneMsg">{{ t.status === 'Verified' ? '✓ Verified by ' + t.verifiedBy : t.status === 'Rejected' ? 'Rework requested: ' + t.note : '✓ Submitted for verification' }}</p>}
                  </div>
                }
              }
              @case ('scan') {
                <div class="body center">
                  <div class="top light"><button class="back" (click)="screen.set('task')"><app-icon name="chevron-left" [size]="18" /></button><b>Scan Checkpoint</b><span></span></div>
                  <div class="viewfinder" [class.ok]="scanOk()"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i>@if (!scanOk()) {<span class="laser"></span><app-icon name="tasks-qr" [size]="70" />} @else {<app-icon name="tasks-check-circle" [size]="70" />}</div>
                  <p class="sc">{{ scanOk() ? cur()?.location + ' verified' : 'Point the camera at the QR / tap NFC tag at ' + cur()?.location }}</p>
                  @if (!scanOk()) {<button class="cta" (click)="doScan()">Simulate tag read</button>}
                </div>
              }
              @case ('camera') {
                <div class="body center">
                  <div class="top light"><button class="back" (click)="screen.set('task')"><app-icon name="chevron-left" [size]="18" /></button><b>Photo Evidence</b><span></span></div>
                  <svg class="shot" viewBox="0 0 240 300" [class.flash]="flash()">
                    <rect width="240" height="300" fill="var(--ka-cbd5e1)" /><rect y="190" width="240" height="110" fill="var(--ka-94a3b8)" />
                    <rect x="20" y="60" width="90" height="110" fill="var(--ka-e2e8f0)" stroke="var(--kl-64748b)" /><rect x="130" y="80" width="90" height="70" fill="var(--ka-f1f5f9)" stroke="var(--kl-64748b)" />
                    <rect x="40" y="200" width="160" height="40" rx="4" fill="var(--ka-64748b)" /><circle cx="200" cy="40" r="14" fill="var(--ka-fde68a)" />
                    <text x="10" y="290" fill="var(--ka-ffffff)" font-size="10">{{ cur()?.location }} · {{ clock() }} · GPS ✓</text>
                  </svg>
                  <button class="shutter" (click)="takePhoto()" aria-label="Take photo"></button>
                </div>
              }
              @case ('done') {
                <div class="body center">
                  <div class="okc"><app-icon name="tasks-check" [size]="44" [stroke]="3" /></div>
                  <b class="big">Task completed!</b>
                  <p class="sc dk">{{ cur()?.title }} was submitted for supervisor verification{{ offline() ? ' (will sync when online)' : '' }}.</p>
                  <button class="cta" (click)="screen.set('home')">Back to my tasks</button>
                </div>
              }
              @case ('alerts') {
                <div class="body">
                  <div class="top"><span></span><b>Notifications</b><span></span></div>
                  <ul class="al">
                    @for (p of myPushes(); track $index) {<li><app-icon name="bell" [size]="15" /><div><b>{{ p.title }}</b><span>{{ p.text }}</span><small>{{ hhmm(p.at) }}</small></div></li>}
                    @for (t of mine().overdue; track t.id) {<li class="r"><app-icon name="triangle-alert" [size]="15" /><div><b>Overdue: {{ t.title }}</b><span>{{ t.location }} · due {{ hhmm(t.due) }}</span></div></li>}
                    @if (!myPushes().length && !mine().overdue.length) {<p class="empty">You're all caught up</p>}
                  </ul>
                </div>
              }
              @case ('profile') {
                <div class="body">
                  <div class="top"><span></span><b>Profile</b><span></span></div>
                  <div class="prof"><span class="av lg" [style.background]="user().color">{{ user().initials }}</span><b>{{ user().name }}</b><small>{{ user().id }} · {{ user().team }}</small></div>
                  <div class="pstats"><div><b>{{ mine().done.length }}</b><small>Done today</small></div><div><b>{{ user().quality }}%</b><small>Quality</small></div><div><b>{{ user().site }}</b><small>Site</small></div></div>
                  <label class="row"><span>Offline mode</span><app-tswitch [on]="offline()" (onChange)="setOffline($event)" /></label>
                  <label class="row"><span>Push notifications</span><app-tswitch [on]="true" /></label>
                  <div class="row"><span>App version</span><b>v3.4.2</b></div>
                  <div class="row"><span>Last sync</span><b>{{ offline() ? 'Pending' : clock() }}</b></div>
                </div>
              }
            }
            @if (phoneToast()) {<div class="ptoast">{{ phoneToast() }}</div>}
            <nav class="tabbar">
              <button [class.on]="screen() === 'home' || screen() === 'task' || screen() === 'done'" (click)="screen.set('home')"><app-icon name="list-checks" [size]="18" />Tasks</button>
              <button [class.on]="screen() === 'scan'" (click)="quickScan()"><app-icon name="tasks-qr" [size]="18" />Scan</button>
              <button [class.on]="screen() === 'alerts'" (click)="screen.set('alerts')"><app-icon name="bell" [size]="18" />Alerts@if (alertCount()) {<em>{{ alertCount() }}</em>}</button>
              <button [class.on]="screen() === 'profile'" (click)="screen.set('profile')"><app-icon name="user" [size]="18" />Profile</button>
            </nav>
          </div>
        </div>
        <p class="cap">Interactive preview · tap anything</p>
      </div>

      <div class="right">
        <section class="kpis">
          <app-tkpi label="App Users (Active)" [value]="284 + wob('u', 3)" icon="tasks-smartphone" color="var(--ka-7c3aed)" change="9%" sub="vs. last month" />
          <app-tkpi label="Online Now" [value]="212 + wob('o', 6)" icon="wifi" color="var(--ka-22c55e)" [sub]="'of ' + (284 + wob('u', 3)) + ' devices'" />
          <app-tkpi label="Mobile Completions" [value]="mobileDone()" icon="tasks-check-circle" color="var(--ka-2563eb)" pct="96%" pctColor="var(--ka-2563eb)" sub="via app today" />
          <app-tkpi label="Sync Queue" [value]="queue().length + 4" icon="refresh" color="var(--ka-f59e0b)" sub="actions pending" />
        </section>

        <div class="two">
          <div class="card">
            <div class="card-head"><h3>Send Push Notification</h3></div>
            <div class="form-grid one">
              <label>To<select class="select" [value]="pushTo()" (change)="pushTo.set($any($event.target).value)"><option value="all">All on-duty workers ({{ onDuty.length }})</option>@for (w of onDuty; track w.id) {<option [value]="w.id">{{ w.name }}</option>}</select></label>
              <label>Title<input class="input" [value]="pTitle()" (input)="pTitle.set($any($event.target).value)" /></label>
              <label>Message<textarea class="input" rows="2" [value]="pText()" (input)="pText.set($any($event.target).value)"></textarea></label>
            </div>
            <div class="form-actions"><button class="btn-primary" (click)="sendPush()" [disabled]="!pTitle().trim()"><app-icon name="tasks-send" [size]="14" />Send</button></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>App Version Adoption</h3></div>
            <app-donut [segments]="versions" center="Devices" [size]="130" />
          </div>
        </div>

        <div class="two">
          <div class="card">
            <div class="card-head"><h3>Mobile Activity</h3><em class="chip live"><i></i>Live</em></div>
            <ul class="feed">
              @for (e of store.events().slice(0, 8); track $index) {<li><span [style.color]="e.color"><app-icon [name]="e.icon" [size]="14" /></span><div><span>{{ e.text }}</span><small>{{ e.who }} · {{ hhmm(e.at) }}</small></div></li>}
            </ul>
          </div>
          <div class="card">
            <div class="card-head"><h3>Registered Devices</h3><button class="link" (click)="say('Device enrolment QR sent to IT')">Enrol device</button></div>
            <div class="table-wrap devs"><table class="table">
              <thead><tr><th>Worker</th><th>Device · App</th><th>Battery</th></tr></thead>
              <tbody>
                @for (d of devices(); track d.w.id) {
                  <tr class="clickable" (click)="switchUser(d.w.id)"><td><b>{{ d.w.name }}</b></td><td>{{ d.dev[0] }}<br /><small class="muted">{{ d.dev[1] }}</small> <span [class]="d.dev[2] === 'v3.4.2' ? 'tag green' : 'tag amber'">{{ d.dev[2] }}</span></td>
                    <td><span [class]="d.dev[3] < 25 ? 'bad' : ''">{{ d.dev[3] }}%</span></td></tr>
                }
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
    </section>
    @if (toast()) {<div class="g-toast">{{ toast() }}</div>}
  `,
  styles: `
    .persona { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--kf-4b4f6b); } .persona .select { min-width: 240px; }
    .wrap { display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 16px; align-items: start; }
    .stage { display: flex; flex-direction: column; align-items: center; position: sticky; top: 76px; }
    .phone { width: 372px; height: 760px; border-radius: 48px; background: var(--kb-14122b); padding: 13px; box-shadow: 0 30px 60px rgba(20, 20, 60, 0.3), inset 0 0 0 2px var(--kb-2d2a4a); position: relative; }
    .notch { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 104px; height: 28px; border-radius: 16px; background: var(--kb-000000); z-index: 5; }
    .screen { position: relative; width: 100%; height: 100%; border-radius: 36px; background: var(--kb-f5f4fb); overflow: hidden; display: flex; flex-direction: column; }
    .screen.dark { background: var(--kb-0f0d1f); }
    .sbar { display: flex; justify-content: space-between; align-items: center; padding: 14px 28px 6px; font-size: 13px; height: 46px; } .sbar span { display: flex; gap: 6px; align-items: center; } .sbar em { font-style: normal; font-size: 10px; background: var(--kb-f59e0b); color: var(--kf-ffffff); padding: 1px 6px; border-radius: 6px; }
    .dark .sbar { color: var(--kf-ffffff); }
    .banner { position: absolute; top: 50px; left: 10px; right: 10px; z-index: 6; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.97); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18); cursor: pointer; animation: drop 0.3s ease; font-size: 12px; color: var(--primary); }
    .banner div { display: flex; flex-direction: column; color: var(--text); } .banner span { color: var(--kf-4b4f6b); }
    @keyframes drop { from { transform: translateY(-30px); opacity: 0; } }
    .offbar { background: var(--kb-fef3c7); color: var(--kf-92400e); font-size: 11px; text-align: center; padding: 4px; }
    .body { flex: 1; overflow: auto; padding: 6px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
    .body.center { align-items: center; color: var(--kf-ffffff); }
    .hello { display: flex; align-items: center; gap: 10px; } .hello div { display: flex; flex-direction: column; } .hello small { color: var(--muted); font-size: 11px; } .hello b { font-size: 17px; }
    .av { width: 38px; height: 38px; border-radius: 50%; color: var(--kf-ffffff); display: grid; place-items: center; font-size: 13px; font-weight: 600; } .av.lg { width: 70px; height: 70px; font-size: 22px; }
    .shift { margin-left: auto; font-size: 10.5px; background: var(--primary-soft); color: var(--primary); padding: 3px 8px; border-radius: 10px; }
    .sum { display: flex; gap: 14px; align-items: center; padding: 14px; border-radius: 18px; background: linear-gradient(135deg, var(--kb-6d28d9), var(--kb-4f46e5)); color: var(--kf-ffffff); }
    .sum div { display: flex; flex-direction: column; } .sum b { font-size: 15px; } .sum small { opacity: 0.85; font-size: 11.5px; }
    .sum ::ng-deep .ring-text { fill: var(--ka-ffffff); } .sum ::ng-deep circle:first-child { stroke: rgba(255, 255, 255, 0.25); }
    .seg { display: flex; background: var(--kb-e9e7f5); border-radius: 10px; padding: 3px; } .seg button { flex: 1; border: 0; background: none; padding: 6px; border-radius: 8px; font-size: 12px; cursor: pointer; color: var(--kf-4b4f6b); } .seg button.on { background: var(--kb-ffffff); color: var(--primary); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .mt { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; padding: 10px; border-radius: 14px; background: var(--kb-ffffff); border: 0; text-align: left; cursor: pointer; box-shadow: 0 1px 3px rgba(20, 20, 60, 0.06); font: inherit; }
    .mt div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .mt b { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .mt small { font-size: 10.5px; color: var(--muted); display: flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; }
    .ci { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: var(--kf-ffffff); }
    .mb { height: 4px; border-radius: 3px; background: var(--kb-eef0f5); overflow: hidden; margin-top: 3px; } .mb i { display: block; height: 100%; background: var(--kb-3b82f6); }
    .st { font-size: 10px; padding: 2px 7px; border-radius: 8px; white-space: nowrap; } .st.p { background: var(--kb-fef3c7); color: var(--kf-b45309); } .st.i { background: var(--kb-dbeafe); color: var(--kf-1d4ed8); } .st.d { background: var(--kb-dcfce7); color: var(--kf-15803d); } .st.o { background: var(--kb-fee2e2); color: var(--kf-b91c1c); }
    .empty { text-align: center; color: var(--muted); font-size: 12.5px; margin: 30px 0; }
    .top { display: grid; grid-template-columns: 32px 1fr 32px; align-items: center; text-align: center; font-size: 14px; } .top.light { color: var(--kf-ffffff); width: 100%; }
    .back { width: 32px; height: 32px; border-radius: 10px; border: 0; background: var(--kb-ffffff); display: grid; place-items: center; cursor: pointer; } .top.light .back { background: rgba(255, 255, 255, 0.12); color: var(--kf-ffffff); }
    .thero { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 16px; color: var(--kf-ffffff); } .thero div { display: flex; flex-direction: column; } .thero b { font-size: 15px; } .thero small { opacity: 0.9; font-size: 11px; }
    .meta3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .meta3 div { background: var(--kb-ffffff); border-radius: 12px; padding: 8px; display: flex; flex-direction: column; font-size: 12px; } .meta3 small { color: var(--muted); font-size: 10px; } .red { color: var(--red); }
    h5 { margin: 4px 0 0; font-size: 13px; display: flex; justify-content: space-between; } h5 span { color: var(--muted); font-weight: 500; }
    .ck { list-style: none; margin: 0; padding: 0; background: var(--kb-ffffff); border-radius: 14px; overflow: hidden; }
    .ck li { display: grid; grid-template-columns: 20px 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; font-size: 12px; border-bottom: 1px solid var(--kl-f1f2f7); cursor: pointer; } .ck li:last-child { border: 0; }
    .ck li i { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--kl-c9cdd8); display: grid; place-items: center; color: var(--kf-ffffff); } .ck li.done i { background: var(--kb-22c55e); border-color: var(--kl-22c55e); } .ck li.done span { color: var(--muted); text-decoration: line-through; }
    .ck li > app-icon { color: var(--primary); }
    .tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .tools button { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 4px; border: 0; border-radius: 12px; background: var(--kb-ffffff); font-size: 11px; color: var(--primary); cursor: pointer; position: relative; }
    .tools button:disabled { opacity: 0.4; } .tools em { position: absolute; top: 4px; right: 10px; font-style: normal; font-size: 9px; background: var(--primary); color: var(--kf-ffffff); border-radius: 6px; padding: 0 5px; }
    .cta { width: 100%; padding: 13px; border: 0; border-radius: 14px; background: linear-gradient(90deg, var(--kb-6d28d9), var(--kb-7c3aed)); color: var(--kf-ffffff); font-weight: 600; font-size: 14px; cursor: pointer; margin-top: auto; } .cta.green { background: var(--kb-16a34a); } .cta:disabled { opacity: 0.45; cursor: default; }
    .doneMsg { text-align: center; color: var(--kf-15803d); font-size: 12.5px; background: var(--kb-dcfce7); padding: 10px; border-radius: 12px; margin-top: auto; }
    .viewfinder { position: relative; width: 220px; height: 220px; margin: 40px 0 10px; display: grid; place-items: center; color: rgba(255, 255, 255, 0.85); }
    .viewfinder i { position: absolute; width: 36px; height: 36px; border: 4px solid var(--kl-a78bfa); } .c1 { top: 0; left: 0; border-right: 0 !important; border-bottom: 0 !important; border-radius: 12px 0 0 0; } .c2 { top: 0; right: 0; border-left: 0 !important; border-bottom: 0 !important; border-radius: 0 12px 0 0; }
    .c3 { bottom: 0; left: 0; border-right: 0 !important; border-top: 0 !important; border-radius: 0 0 0 12px; } .c4 { bottom: 0; right: 0; border-left: 0 !important; border-top: 0 !important; border-radius: 0 0 12px 0; }
    .viewfinder.ok { color: var(--kf-22c55e); } .viewfinder.ok i { border-color: var(--kl-22c55e); }
    .laser { position: absolute; left: 16px; right: 16px; height: 2px; background: var(--kb-ef4444); box-shadow: 0 0 10px var(--kb-ef4444); animation: scan 1.6s ease-in-out infinite alternate; } @keyframes scan { from { top: 18px; } to { top: 200px; } }
    .sc { text-align: center; font-size: 12.5px; opacity: 0.85; padding: 0 10px; } .sc.dk { color: var(--kf-4b4f6b); opacity: 1; }
    .shot { width: 100%; border-radius: 14px; margin-top: 10px; } .shot.flash { animation: fl 0.4s; } @keyframes fl { 0% { filter: brightness(3); } }
    .shutter { width: 64px; height: 64px; border-radius: 50%; border: 5px solid var(--kl-ffffff); background: var(--kb-ef4444); cursor: pointer; margin-top: 16px; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3); }
    .okc { width: 92px; height: 92px; border-radius: 50%; background: var(--kb-22c55e); color: var(--kf-ffffff); display: grid; place-items: center; margin-top: 90px; box-shadow: 0 0 0 14px var(--kb-dcfce7); } .big { color: var(--text); font-size: 19px; margin-top: 18px; }
    .al { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .al li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; background: var(--kb-ffffff); border-radius: 12px; padding: 10px; color: var(--primary); font-size: 12px; }
    .al li.r { color: var(--red); } .al div { display: flex; flex-direction: column; color: var(--text); } .al span { color: var(--kf-4b4f6b); } .al small { color: var(--muted); font-size: 10.5px; }
    .prof { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; } .prof small { color: var(--muted); font-size: 11.5px; }
    .pstats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .pstats div { background: var(--kb-ffffff); border-radius: 12px; padding: 10px 6px; display: flex; flex-direction: column; align-items: center; font-size: 12px; } .pstats small { color: var(--muted); font-size: 10.5px; }
    .row { display: flex; justify-content: space-between; align-items: center; background: var(--kb-ffffff); border-radius: 12px; padding: 10px 12px; font-size: 12.5px; }
    .ptoast { position: absolute; bottom: 82px; left: 50%; transform: translateX(-50%); background: rgba(20, 18, 43, 0.92); color: var(--kf-ffffff); padding: 8px 14px; border-radius: 12px; font-size: 12px; white-space: nowrap; z-index: 7; }
    .tabbar { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--kb-ffffff); border-top: 1px solid var(--kl-ecebf5); padding: 8px 6px 18px; }
    .tabbar button { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: none; font-size: 10.5px; color: var(--kf-8a8ca6); cursor: pointer; position: relative; } .tabbar button.on { color: var(--primary); font-weight: 600; }
    .tabbar em { position: absolute; top: -4px; right: 22px; font-style: normal; background: var(--red); color: var(--kf-ffffff); border-radius: 8px; font-size: 9px; padding: 0 5px; }
    .cap { font-size: 11.5px; color: var(--muted); margin: 10px 0 0; }
    .right { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
    .devs :is(th, td) { padding-left: 6px; padding-right: 6px; font-size: 12px; }
    .one { grid-template-columns: 1fr; } textarea.input { resize: vertical; }
    .feed { list-style: none; margin: 0; padding: 0; } .feed li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--kl-f1f2f7); font-size: 12px; } .feed div { display: flex; flex-direction: column; } .feed small { color: var(--muted); font-size: 11px; }
    @media (max-width: 1350px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
  `,
})
export class MobileTaskApp implements OnDestroy {
  protected readonly store = inject(TaskStore);
  private readonly app = inject(AppState);
  protected readonly hhmm = hhmm;
  protected readonly meta = catMeta;
  protected readonly isOpen = isOpen;
  protected readonly onDuty = WORKERS.filter((w) => w.status !== 'Off Duty');
  protected readonly segs = ['Today', 'Upcoming', 'Done'] as const;
  protected readonly versions = [
    { label: 'v3.4.x (latest)', value: 196, color: 'var(--ka-7c3aed)' },
    { label: 'v3.3.x', value: 61, color: 'var(--ka-3b82f6)' },
    { label: 'v3.2 or older', value: 27, color: 'var(--ka-f59e0b)' },
  ];
  protected readonly me = signal(this.onDuty[0].id);
  protected readonly screen = signal<Screen>('home');
  protected readonly seg = signal<(typeof this.segs)[number]>('Today');
  protected readonly curId = signal<string | null>(null);
  protected readonly offline = signal(false);
  protected readonly queue = signal<{ label: string; run: () => void }[]>([]);
  protected readonly scanOk = signal(false);
  protected readonly flash = signal(false);
  protected readonly banner = signal<Push | null>(null);
  protected readonly pushes = signal<Push[]>([{ at: 540, title: 'Shift briefing', text: 'Lobby deep-clean before 11:00 – CEO visit today', to: 'all' }]);
  protected readonly phoneToast = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly pushTo = signal('me');
  protected readonly pTitle = signal('Urgent: spill reported');
  protected readonly pText = signal('Please attend Canteen Dining area – liquid spill near entrance.');
  private timers: ReturnType<typeof setTimeout>[] = [];

  protected readonly user = computed(() => workerById(this.me())!);
  protected readonly first = computed(() => this.user().name.split(' ')[0]);
  protected readonly clock = computed(() => hhmm(this.store.now()).replace(/^0/, ''));
  protected readonly mineAll = computed(() => this.store.tasks().filter((t) => t.assignee === this.me()));
  protected readonly mine = computed(() => {
    const now = this.store.now();
    const all = this.mineAll();
    return {
      today: all.filter((t) => isOpen(t) && t.start <= now + 240).sort((a, b) => a.start - b.start),
      upcoming: all.filter((t) => isOpen(t) && t.start > now + 240).sort((a, b) => a.start - b.start),
      done: all.filter((t) => !isOpen(t)).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
      overdue: all.filter((t) => isOpen(t) && t.due < now),
    };
  });
  protected readonly overdueN = computed(() => this.mine().overdue.length);
  protected readonly donePct = computed(() => Math.round((this.mine().done.length / Math.max(this.mineAll().length, 1)) * 100));
  protected readonly segList = computed(() => (this.seg() === 'Today' ? this.mine().today : this.seg() === 'Upcoming' ? this.mine().upcoming : this.mine().done));
  protected readonly cur = computed(() => this.store.tasks().find((t) => t.id === this.curId()) ?? null);
  protected readonly steps = computed(() => this.store.templates().find((t) => t.id === this.cur()?.templateId)?.steps ?? []);
  protected readonly myPushes = computed(() => this.pushes().filter((p) => p.to === 'all' || p.to === this.me()));
  protected readonly alertCount = computed(() => this.myPushes().length + this.overdueN());
  protected readonly mobileDone = computed(() => this.store.doneToday());
  protected readonly devices = computed(() => this.onDuty.slice(0, 6).map((w, i) => ({ w, dev: DEVICES[i] })));

  protected wob(k: string, a: number) {
    return this.app.wobble(k, a);
  }
  protected stCls(t: TaskItem) {
    return !isOpen(t) ? 'd' : t.due < this.store.now() ? 'o' : t.status === 'In Progress' ? 'i' : 'p';
  }
  protected stLabel(t: TaskItem) {
    return !isOpen(t) ? (t.status === 'Completed' ? 'Submitted' : t.status) : t.due < this.store.now() ? 'Overdue' : t.status === 'In Progress' ? 'Started' : 'To do';
  }
  protected slaLeft(t: TaskItem) {
    if (!isOpen(t)) return 'Met';
    const d = t.due - this.store.now();
    return d < 0 ? `${-d}m late` : `${d}m left`;
  }
  protected switchUser(id: string) {
    this.me.set(id);
    this.screen.set('home');
    this.curId.set(null);
  }
  protected openTask(t: TaskItem) {
    this.curId.set(t.id);
    this.scanOk.set(false);
    this.screen.set('task');
  }
  /** Runs now or queues while offline. */
  private run(label: string, fn: () => void) {
    if (this.offline()) {
      this.queue.update((q) => [...q, { label, run: fn }]);
      this.pt(`Saved offline · ${label}`);
    } else fn();
  }
  protected act(kind: 'start' | 'complete', t: TaskItem) {
    const who = this.user().name;
    if (kind === 'start') {
      this.store.patchTask(t.id, { status: 'In Progress', startedAt: this.store.now() });
      this.run('Start task', () => this.store.log(`${t.title} started from mobile app`, who, 'tasks-smartphone', 'var(--ka-3b82f6)'));
      this.pt('Task started');
    } else {
      this.store.patchTask(t.id, { stepsDone: t.steps });
      this.run('Complete task', () => this.store.complete(t.id, who));
      if (this.offline()) this.store.patchTask(t.id, { status: 'Completed', completedAt: this.store.now() });
      this.screen.set('done');
    }
  }
  protected tapStep(t: TaskItem, i: number) {
    if (!isOpen(t)) return;
    const stepsDone = i < t.stepsDone ? i : i + 1;
    this.store.patchTask(t.id, { stepsDone: Math.min(stepsDone, t.steps), status: 'In Progress', startedAt: t.startedAt ?? this.store.now() });
  }
  protected doScan() {
    const t = this.cur();
    if (!t?.checkpointId) return;
    this.scanOk.set(true);
    const id = t.checkpointId;
    this.run('Checkpoint scan', () => this.store.scan(id, this.user().name));
    this.timers.push(setTimeout(() => {
      this.screen.set('task');
      this.scanOk.set(false);
      this.pt(`${t.location} verified`);
    }, 1100));
  }
  protected quickScan() {
    const t = this.cur() ?? this.mine().today.find((x) => x.checkpointId);
    if (!t?.checkpointId) return this.pt('No checkpoint task in your list');
    this.curId.set(t.id);
    this.scanOk.set(false);
    this.screen.set('scan');
  }
  protected takePhoto() {
    const t = this.cur();
    if (!t) return;
    this.flash.set(true);
    this.store.patchTask(t.id, { photos: t.photos + 1 });
    this.run('Photo upload', () => this.store.log(`${t.title} · photo evidence uploaded`, this.user().name, 'tasks-camera', 'var(--ka-7c3aed)'));
    this.timers.push(setTimeout(() => {
      this.flash.set(false);
      this.screen.set('task');
      this.pt('Photo attached');
    }, 500));
  }
  protected reportIssue(t: TaskItem) {
    this.run('Issue report', () => {
      this.store.escalate(t.id, this.user().name);
    });
    this.pt('Issue reported to supervisor');
  }
  protected setOffline(v: boolean) {
    this.offline.set(v);
    if (!v && this.queue().length) {
      const q = this.queue();
      q.forEach((a) => a.run());
      this.queue.set([]);
      this.pt(`${q.length} offline action${q.length === 1 ? '' : 's'} synced`);
    }
  }
  protected sendPush() {
    const to = this.pushTo() === 'me' ? this.me() : this.pushTo();
    const p: Push = { at: this.store.now(), title: this.pTitle().trim(), text: this.pText().trim(), to };
    this.pushes.update((l) => [p, ...l]);
    if (to === 'all' || to === this.me()) {
      this.banner.set(p);
      this.timers.push(setTimeout(() => this.banner() === p && this.banner.set(null), 4500));
    }
    this.store.log(`Push sent: ${p.title}`, 'Rex Kumar', 'bell', 'var(--ka-7c3aed)');
    this.say(`Push delivered to ${to === 'all' ? this.onDuty.length + ' workers' : workerById(to)!.name}`);
  }
  private pt(m: string) {
    this.phoneToast.set(m);
    this.timers.push(setTimeout(() => this.phoneToast() === m && this.phoneToast.set(null), 1800));
  }
  protected say(m: string) {
    this.toast.set(m);
    this.timers.push(setTimeout(() => this.toast() === m && this.toast.set(null), 2600));
  }
  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
  }
}
